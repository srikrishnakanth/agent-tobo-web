import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fsp from 'node:fs/promises';
import { readJson, writeJson, exists } from '../core/fsutil.js';
import { validateManifest } from './manifest-schema.js';
import { Harvester } from './harvest.js';
import { normalizeVault } from './normalize.js';
import { Catalog } from './catalog.js';
import { defaultLogger } from '../core/logger.js';

// fileURLToPath - NOT url.pathname. On Windows `.pathname` yields "/C:/projects/JBRH%20PRODUCTS/..."
// (leading slash, percent-encoded spaces) which path.resolve does not repair, so the vault would be
// looked for at a path that does not exist.
export const PKG_ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
export const DEFAULT_MANIFEST = path.join(PKG_ROOT, 'vault-manifest.json');
export const DEFAULT_VAULT_DIR = path.join(PKG_ROOT, 'DESIGN-VAULT');

/** Full vault setup: validate manifest → harvest (verify licenses) → normalize → catalog → report. */
export async function setupVault({ manifestPath = DEFAULT_MANIFEST, vaultDir = DEFAULT_VAULT_DIR, offline = false, logger = defaultLogger, fetchImpl } = {}) {
  const started = Date.now();
  const manifest = await readJson(manifestPath);
  const valid = validateManifest(manifest);
  if (!valid.ok) throw new Error(`vault manifest invalid:\n - ${valid.errors.join('\n - ')}`);
  logger.info(`manifest ok: ${Object.keys(manifest.sources).length} sources, ${manifest.assets.length} assets, ${(manifest.excluded || []).length} excluded`);
  const cacheDir = path.join(vaultDir, 'cache');
  const harvester = new Harvester({ manifest, cacheDir, logger, offline, fetchImpl });
  const harvest = await harvester.harvestAll({ onProgress: (p) => logger.debug(`harvested ${p.asset}: ${p.ok ? 'ok' : 'FAILED'}`) });
  const norm = await normalizeVault({ vaultDir, manifest, harvest, version: manifest.version });
  const report = {
    generatedAt: new Date().toISOString(), durationMs: Date.now() - started, manifest: manifestPath, vaultDir,
    sources: Object.values(harvest.sources).map((s) => ({ id: s.id, repo: s.repo, commit: s.commit, license: s.license, licenseDetected: s.licenseDetected, licenseOk: s.licenseOk })),
    assetsRequested: manifest.assets.length, assetsHarvested: harvest.assets.length, filesWritten: norm.written.files,
    errors: harvest.errors, stats: harvest.stats, excluded: manifest.excluded || [],
    complete: harvest.errors.length === 0,
  };
  await writeJson(path.join(vaultDir, 'SETUP-REPORT.json'), report);
  if (!report.complete) logger.error(`vault setup finished with ${harvest.errors.length} error(s)`, harvest.errors.slice(0, 10));
  else logger.info(`vault complete: ${report.assetsHarvested}/${report.assetsRequested} assets, ${report.filesWritten} files (${harvest.stats.fetched} fetched, ${harvest.stats.cached} cached)`);
  return report;
}

/** Verify an existing vault against its lock file (hash every file). */
export async function verifyVault(vaultDir = DEFAULT_VAULT_DIR) {
  const { hashFile } = await import('../core/fsutil.js');
  const lockPath = path.join(vaultDir, 'VAULT-MANIFEST.lock.json');
  if (!(await exists(lockPath))) return { ok: false, reason: 'lock file missing; run vault setup' };
  const catalog = await Catalog.load(vaultDir);
  const problems = [];
  for (const a of catalog.assets) {
    for (const f of a.files) {
      const p = path.join(vaultDir, f.vaultPath);
      if (!(await exists(p))) { problems.push({ asset: a.id, file: f.path, problem: 'missing' }); continue; }
      const h = await hashFile(p);
      if (h !== f.sha256) problems.push({ asset: a.id, file: f.path, problem: 'hash mismatch' });
    }
    if (!(await exists(path.join(vaultDir, a.licenseNotice)))) problems.push({ asset: a.id, problem: 'license notice missing' });
  }
  return { ok: problems.length === 0, assets: catalog.size, problems };
}

export { Catalog, validateManifest, Harvester, normalizeVault };
