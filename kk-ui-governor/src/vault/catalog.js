// Searchable catalog over DESIGN-VAULT/catalog.json.
import path from 'node:path';
import { readJson, exists } from '../core/fsutil.js';
import { isAllowedLicense } from '../core/licenses.js';

export class Catalog {
  constructor(data) {
    this.data = data;
    this.assets = (data?.assets || []).filter((a) => isAllowedLicense(a.license));
  }
  static async load(vaultDir) {
    const f = path.join(vaultDir, 'catalog.json');
    if (!(await exists(f))) return new Catalog({ assets: [], missing: true, vaultDir });
    return new Catalog(await readJson(f));
  }
  get size() { return this.assets.length; }

  /**
   * Search with free text + facet filters. Facets accept '*' wildcards in asset metadata.
   * @param {object} q { text?, category?, style?, pageType?, framework?, cssStack?, platform?, device?, maxPerf?, darkMode?, availableDeps?: string[] }
   */
  search(q = {}) {
    const perfRank = { none: 0, low: 1, medium: 2, high: 3 };
    const text = (q.text || '').toLowerCase().split(/\s+/).filter(Boolean);
    const out = [];
    for (const a of this.assets) {
      let score = 0;
      if (q.category && !a.category.startsWith(q.category)) continue;
      if (q.style && !matchFacet(a.designStyle, q.style)) continue;
      if (q.pageType && !matchFacet(a.pageType, q.pageType)) continue;
      if (q.framework && !matchFacet(a.framework, q.framework)) continue;
      if (q.cssStack && !matchFacet(a.cssStack, q.cssStack)) continue;
      if (q.platform && !matchFacet(a.platform, q.platform)) continue;
      if (q.device && !matchFacet(a.deviceSuitability, q.device)) continue;
      if (q.maxPerf && perfRank[a.performanceCost] > perfRank[q.maxPerf]) continue;
      if (q.darkMode === true && !a.darkMode) continue;
      if (Array.isArray(q.availableDeps)) {
        const missing = (a.dependencies || []).filter((d) => !q.availableDeps.includes(d));
        if (missing.length) { if (q.requireDepsSatisfied) continue; score -= 5 * missing.length; }
      }
      const hay = JSON.stringify(a).toLowerCase();
      for (const t of text) if (hay.includes(t)) score += 2;
      if (text.length && score <= 0 && !q.category) continue;
      score += a.designStyle.includes(q.style) ? 3 : 0;
      score += a.pageType.includes(q.pageType) ? 3 : 0;
      score += a.framework.includes(q.framework) ? 2 : 0;
      score -= perfRank[a.performanceCost] || 0;
      out.push({ asset: a, score });
    }
    out.sort((x, y) => y.score - x.score || x.asset.id.localeCompare(y.asset.id));
    return out.slice(0, q.limit || 50);
  }

  byId(id) { return this.assets.find((a) => a.id === id) || null; }
  categories() { return [...new Set(this.assets.map((a) => a.category))].sort(); }
}

export function matchFacet(values, wanted) {
  if (!values) return false;
  const v = Array.isArray(values) ? values : [values];
  return v.includes('*') || v.includes(wanted);
}
