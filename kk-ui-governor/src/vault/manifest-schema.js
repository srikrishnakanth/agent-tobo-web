// Lightweight structural validation of vault-manifest.json (no external schema library needed).
import { licenseVerdict } from '../core/licenses.js';

const REQUIRED_ASSET_FIELDS = ['id', 'source', 'category', 'files', 'designStyle', 'pageType', 'framework', 'dependencies', 'deviceSuitability', 'performanceCost', 'accessibility', 'darkMode'];

export function validateManifest(m) {
  const errors = [];
  if (!m || typeof m !== 'object') return { ok: false, errors: ['manifest is not an object'] };
  if (!m.sources || typeof m.sources !== 'object') errors.push('sources missing');
  if (!Array.isArray(m.assets)) errors.push('assets missing');
  for (const [id, s] of Object.entries(m.sources || {})) {
    if (!/^[\w.-]+\/[\w.-]+$/.test(s.repo || '')) errors.push(`source ${id}: invalid repo "${s.repo}"`);
    if (!/^[0-9a-f]{40}$/.test(s.commit || '')) errors.push(`source ${id}: commit must be a full 40-char SHA`);
    const v = licenseVerdict(s.license);
    if (!v.ok) errors.push(`source ${id}: license ${s.license} rejected (${v.reason})`);
    if (!s.licenseFile) errors.push(`source ${id}: licenseFile missing`);
  }
  const ids = new Set();
  for (const a of m.assets || []) {
    for (const f of REQUIRED_ASSET_FIELDS) if (a[f] === undefined) errors.push(`asset ${a.id || '?'}: missing ${f}`);
    if (ids.has(a.id)) errors.push(`duplicate asset id ${a.id}`);
    ids.add(a.id);
    if (!m.sources?.[a.source]) errors.push(`asset ${a.id}: unknown source ${a.source}`);
    if (!Array.isArray(a.files) || !a.files.length) errors.push(`asset ${a.id}: files empty`);
    for (const f of a.files || []) if (f.startsWith('/') || f.includes('..')) errors.push(`asset ${a.id}: unsafe path ${f}`);
    if (!['none', 'low', 'medium', 'high'].includes(a.performanceCost)) errors.push(`asset ${a.id}: performanceCost invalid`);
  }
  for (const x of m.excluded || []) {
    const v = licenseVerdict(x.license);
    if (v.ok) errors.push(`excluded entry "${x.name}" claims an allowed license (${x.license}); excluded list must only hold incompatible sources`);
  }
  return { ok: errors.length === 0, errors };
}
