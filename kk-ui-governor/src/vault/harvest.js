// Harvester: fetches every manifest file at its pinned commit from raw.githubusercontent.com,
// verifies license text, and records provenance. Uses an on-disk cache keyed by repo+commit+path
// so re-runs are offline-capable and deterministic.
import fsp from 'node:fs/promises';
import path from 'node:path';
import { sha256, atomicWrite, exists } from '../core/fsutil.js';
import { detectLicenseFromText, normalizeSpdx } from '../core/licenses.js';

export class Harvester {
  constructor({ manifest, cacheDir, logger, fetchImpl = globalThis.fetch, offline = false, concurrency = 6 }) {
    this.manifest = manifest;
    this.cacheDir = cacheDir;
    this.logger = logger;
    this.fetchImpl = fetchImpl;
    this.offline = offline;
    this.concurrency = concurrency;
    this.stats = { fetched: 0, cached: 0, failed: 0, bytes: 0 };
  }

  rawUrl(source, file) {
    return `${this.manifest.policy?.rawBase || 'https://raw.githubusercontent.com'}/${source.repo}/${source.commit}/${file}`;
  }

  cachePath(source, file) {
    return path.join(this.cacheDir, source.repo.replace('/', '__'), source.commit, file);
  }

  /** Fetch one file (Buffer) with cache + retry. */
  async fetchFile(source, file) {
    const cp = this.cachePath(source, file);
    if (await exists(cp)) { this.stats.cached++; return fsp.readFile(cp); }
    if (this.offline) throw new Error(`offline and not cached: ${source.repo}@${source.commit.slice(0, 7)}:${file}`);
    const url = this.rawUrl(source, file);
    let lastErr;
    for (let attempt = 1; attempt <= 4; attempt++) {
      try {
        const res = await this.fetchImpl(url, { redirect: 'follow' });
        if (res.status === 404) throw Object.assign(new Error(`404 ${url}`), { permanent: true });
        if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
        const buf = Buffer.from(await res.arrayBuffer());
        await atomicWrite(cp, buf);
        this.stats.fetched++; this.stats.bytes += buf.length;
        return buf;
      } catch (err) {
        lastErr = err;
        if (err.permanent) break;
        await new Promise((r) => setTimeout(r, 400 * 2 ** attempt));
      }
    }
    this.stats.failed++;
    throw lastErr;
  }

  /** Fetch + verify license text of a source. Returns { text, detected, claimed, ok }. */
  async verifySourceLicense(id, source) {
    const buf = await this.fetchFile(source, source.licenseFile);
    const text = buf.toString('utf8');
    const detected = detectLicenseFromText(text);
    const claimed = normalizeSpdx(source.license);
    const ok = detected === claimed;
    if (!ok) this.logger?.error(`license mismatch for ${id}: manifest says ${claimed}, text looks like ${detected}`);
    return { text, detected, claimed, ok, sha256: sha256(buf) };
  }

  /** Harvest all assets; returns { sources, assets, errors } with provenance for each file. */
  async harvestAll({ onProgress } = {}) {
    const m = this.manifest;
    const sources = {};
    const errors = [];
    for (const [id, s] of Object.entries(m.sources)) {
      try {
        const lic = await this.verifySourceLicense(id, s);
        sources[id] = { id, ...s, licenseText: lic.text, licenseDetected: lic.detected, licenseOk: lic.ok, licenseSha256: lic.sha256, url: `https://github.com/${s.repo}/tree/${s.commit}` };
        if (!lic.ok) errors.push({ source: id, error: `license mismatch (claimed ${lic.claimed}, detected ${lic.detected})` });
      } catch (err) {
        errors.push({ source: id, error: String(err.message || err) });
      }
    }
    const assets = [];
    const queue = [...m.assets];
    const workers = Array.from({ length: this.concurrency }, () => (async () => {
      while (queue.length) {
        const a = queue.shift();
        const src = sources[a.source];
        if (!src || !src.licenseOk) { errors.push({ asset: a.id, error: `source ${a.source} unavailable or license unverified` }); continue; }
        const files = [];
        let failed = false;
        for (const f of a.files) {
          try {
            const buf = await this.fetchFile(src, f);
            files.push({ path: f, sha256: sha256(buf), bytes: buf.length, cache: this.cachePath(src, f) });
          } catch (err) {
            failed = true;
            errors.push({ asset: a.id, file: f, error: String(err.message || err) });
          }
        }
        // Per-family font licenses: verify the OFL text of each family too.
        let familyLicense = null;
        if (a.category === 'typography/font') {
          const oflFile = a.files.find((f) => /OFL\.txt$/i.test(f));
          if (oflFile) {
            const t = (await this.fetchFile(src, oflFile)).toString('utf8');
            familyLicense = detectLicenseFromText(t);
            if (familyLicense !== 'OFL-1.1') { failed = true; errors.push({ asset: a.id, error: `font family license is ${familyLicense}, expected OFL-1.1` }); }
          }
        }
        if (!failed) assets.push({ ...a, harvested: files, license: src.license, upstream: { repo: src.repo, commit: src.commit, url: src.url, path: a.files[0] } });
        onProgress?.({ asset: a.id, ok: !failed });
      }
    })());
    await Promise.all(workers);
    return { sources, assets, errors, stats: { ...this.stats } };
  }
}
