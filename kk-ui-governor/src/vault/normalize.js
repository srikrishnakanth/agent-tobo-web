// Normalizer: turns harvested files into the DESIGN-VAULT tree with provenance + license notices.
//
// DESIGN-VAULT/
//   README.md, NOTICES.md, catalog.json, VAULT-MANIFEST.lock.json, SETUP-REPORT.json
//   sources/<sourceId>/LICENSE, source.json
//   assets/<category>/<assetId>/asset.json + files (original relative paths preserved)
import fsp from 'node:fs/promises';
import path from 'node:path';
import { atomicWrite, writeJson } from '../core/fsutil.js';

export async function normalizeVault({ vaultDir, manifest, harvest, version = '1.0.0' }) {
  await fsp.mkdir(vaultDir, { recursive: true });
  const fetchedAt = new Date().toISOString();
  const written = { sources: 0, assets: 0, files: 0 };

  for (const s of Object.values(harvest.sources)) {
    if (!s.licenseOk) continue;
    const dir = path.join(vaultDir, 'sources', s.id);
    await atomicWrite(path.join(dir, 'LICENSE'), s.licenseText);
    await writeJson(path.join(dir, 'source.json'), { id: s.id, repo: s.repo, url: s.url, commit: s.commit, license: s.license, licenseFile: s.licenseFile, licenseSha256: s.licenseSha256, homepage: s.homepage, fetchedAt });
    written.sources++;
  }

  const catalog = [];
  for (const a of harvest.assets) {
    const dir = path.join(vaultDir, 'assets', a.category, a.id);
    for (const f of a.harvested) {
      const dest = path.join(dir, 'files', f.path);
      await fsp.mkdir(path.dirname(dest), { recursive: true });
      await fsp.copyFile(f.cache, dest);
      written.files++;
    }
    const entry = {
      id: a.id,
      category: a.category,
      designStyle: a.designStyle,
      pageType: a.pageType,
      platform: a.platform || ['*'],
      framework: a.framework,
      cssStack: a.cssStack || ['*'],
      dependencies: a.dependencies,
      deviceSuitability: a.deviceSuitability,
      performanceCost: a.performanceCost,
      accessibility: a.accessibility,
      darkMode: a.darkMode,
      license: a.license,
      sourceCommit: a.upstream.commit,
      family: a.family, role: a.role,
      upstream: a.upstream,
      files: a.harvested.map((f) => ({ path: f.path, sha256: f.sha256, bytes: f.bytes, vaultPath: path.posix.join('assets', a.category, a.id, 'files', f.path) })),
      licenseNotice: path.posix.join('sources', a.source, 'LICENSE'),
      fetchedAt,
    };
    await writeJson(path.join(dir, 'asset.json'), entry);
    catalog.push(entry);
    written.assets++;
  }

  const notices = ['# THIRD-PARTY NOTICES', '', 'This Design Vault redistributes the following upstream material under the licenses noted. Full license texts are in `sources/<id>/LICENSE`.', ''];
  for (const s of Object.values(harvest.sources).filter((x) => x.licenseOk)) {
    notices.push(`## ${s.repo} — ${s.license}`, `- Commit: ${s.commit}`, `- URL: ${s.url}`, `- License file: ${s.licenseFile} (sha256 ${s.licenseSha256})`, '');
  }
  await atomicWrite(path.join(vaultDir, 'NOTICES.md'), notices.join('\n'));
  await writeJson(path.join(vaultDir, 'catalog.json'), { name: manifest.name, version, generatedAt: fetchedAt, count: catalog.length, assets: catalog, excluded: manifest.excluded || [] });
  await writeJson(path.join(vaultDir, 'VAULT-MANIFEST.lock.json'), { manifestVersion: manifest.version, generatedAt: fetchedAt, sources: Object.fromEntries(Object.values(harvest.sources).map((s) => [s.id, { repo: s.repo, commit: s.commit, license: s.license, licenseSha256: s.licenseSha256, licenseOk: s.licenseOk }])), assets: catalog.map((a) => ({ id: a.id, files: a.files.map((f) => f.sha256) })) });
  await atomicWrite(path.join(vaultDir, 'README.md'), `# ${manifest.name}\n\nNormalized design vault generated ${fetchedAt}.\n\n- ${written.sources} sources, ${written.assets} assets, ${written.files} files\n- Every asset has \`asset.json\` with category, design style, page type, framework, dependencies, device suitability, performance cost, accessibility, dark mode, license and source commit.\n- Provenance: \`sources/<id>/source.json\`; license texts: \`sources/<id>/LICENSE\`; aggregated: \`NOTICES.md\`.\n- Search: \`kkgov vault search <query> [--style x --page y --framework z]\`.\n`);
  return { written, catalogCount: catalog.length };
}
