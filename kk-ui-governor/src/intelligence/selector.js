// Selection / config system: turns user choices (CLI flags, config file, named presets) plus the
// scan into a fully-resolved, validated Selection. "auto" dimensions are filled by the recommender.
import { STYLES, PAGE_TYPES, PLATFORMS, THEMES, DENSITIES, MOTION_LEVELS, DEVICE_CLASSES, A11Y_MODES, COMPONENTS, EFFECTS, NAMED_PRESETS } from './data/presets.js';
import { recommend } from './recommend.js';

export const DIMENSIONS = Object.freeze({
  style: Object.keys(STYLES), pageType: Object.keys(PAGE_TYPES), platform: Object.keys(PLATFORMS), theme: Object.keys(THEMES),
  density: Object.keys(DENSITIES), motion: Object.keys(MOTION_LEVELS), devices: Object.keys(DEVICE_CLASSES), a11y: A11Y_MODES, components: COMPONENTS, effects: EFFECTS,
});

/**
 * @param {object} input user input: { preset?, style?, pageType?, platform?, theme?, density?, motion?, devices?, a11y?, components?, effects?, brandMode?, threeD?, radius?, fontDisplay?, fontBody? }
 * @param {object} scan project scan
 * @param {import('../vault/catalog.js').Catalog} catalog
 */
export function resolveSelection(input = {}, scan, catalog) {
  const errors = [];
  let base = {};
  if (input.preset && input.preset !== 'auto') {
    const p = NAMED_PRESETS[input.preset];
    if (!p) errors.push(`unknown preset "${input.preset}"; run kkgov presets`);
    else base = { ...p };
  }
  const merged = { ...base, ...stripUndefined(input) };
  delete merged.label; delete merged.auto;
  const auto = !input.preset || input.preset === 'auto' || Object.values(merged).includes('auto');
  const rec = recommend(scan, catalog, merged);
  const pick = (dim, fallback) => {
    const v = merged[dim];
    if (v === undefined || v === 'auto') return { value: fallback, source: 'auto' };
    if (!DIMENSIONS[dim].includes(v)) { errors.push(`invalid ${dim} "${v}"; valid: ${DIMENSIONS[dim].join(', ')}`); return { value: fallback, source: 'auto' }; }
    return { value: v, source: 'user' };
  };
  const style = pick('style', rec.style);
  const pageType = pick('pageType', rec.pageType);
  const platform = pick('platform', rec.platform);
  const theme = pick('theme', rec.theme);
  const density = pick('density', rec.density);
  const motion = pick('motion', rec.motion);
  const devices = listPick('devices', merged.devices, rec.devices, errors);
  const a11y = listPick('a11y', merged.a11y, rec.a11y, errors);
  const components = listPick('components', merged.components, rec.components, errors);
  const effects = listPick('effects', merged.effects, rec.effects, errors);
  const brandMode = merged.brandMode || (platform.value === 'brand-custom' ? 'replace' : 'preserve');
  if (!['preserve', 'replace'].includes(brandMode)) errors.push(`brandMode must be preserve|replace`);
  // scope: 'global' restyles the whole project (default). Any other value confines every generated
  // rule to a scope root so the rest of the application - notably an authenticated dashboard - keeps
  // rendering exactly as before. See src/pipeline/scope-css.js.
  const scope = merged.scope || 'global';
  if (!/^[a-z][\w-]*$/i.test(scope)) errors.push('scope must be a simple name such as "global" or "landing"');
  const selection = {
    preset: input.preset || 'auto', auto,
    style: style.value, pageType: pageType.value, platform: platform.value, theme: theme.value, density: density.value, motion: motion.value,
    devices: devices.value, a11y: a11y.value, components: components.value, effects: effects.value,
    brandMode, scope, scopeSelector: scope === 'global' ? null : `[data-kk-scope="${scope}"]`, threeD: merged.threeD ?? rec.threeD, radius: merged.radius ?? null, fontDisplay: merged.fontDisplay ?? rec.fonts.display, fontBody: merged.fontBody ?? rec.fonts.body, fontMono: rec.fonts.mono,
    sources: { style: style.source, pageType: pageType.source, platform: platform.source, theme: theme.source, density: density.source, motion: motion.source, a11y: a11y.source },
    recommendation: rec,
  };
  // Coherence rules (never randomly mix): a style family implies motion/3D limits.
  const coherence = enforceCoherence(selection, scan);
  return { ok: errors.length === 0, errors, selection: coherence.selection, adjustments: coherence.adjustments };
}

function listPick(dim, v, fallback, errors) {
  if (v === undefined || v === 'auto') return { value: fallback, source: 'auto' };
  const arr = Array.isArray(v) ? v : String(v).split(',').map((s) => s.trim()).filter(Boolean);
  const bad = arr.filter((x) => !DIMENSIONS[dim].includes(x));
  if (bad.length) errors.push(`invalid ${dim} value(s): ${bad.join(', ')}; valid: ${DIMENSIONS[dim].join(', ')}`);
  return { value: arr.filter((x) => DIMENSIONS[dim].includes(x)), source: 'user' };
}

export function enforceCoherence(sel, scan) {
  const adjustments = [];
  const s = { ...sel };
  const style = STYLES[s.style];
  const motionRank = { none: 0, subtle: 1, standard: 2, complex: 3 };
  // Data-dense/enterprise never carry parallax/3D; 3D style requires complex motion with fallback.
  if (['data-dense', 'enterprise', 'minimal', 'luxury'].includes(s.style)) {
    for (const e of ['parallax', '3d']) if (s.effects.includes(e)) { s.effects = s.effects.filter((x) => x !== e); adjustments.push(`removed effect "${e}": incoherent with ${style.label} style`); }
    if (motionRank[s.motion] > 2) { s.motion = 'standard'; adjustments.push(`motion capped at standard for ${style.label} style`); }
  }
  if (s.style === '3d' && !s.effects.includes('3d')) { s.effects = [...s.effects, '3d']; adjustments.push('added "3d" effect for 3D style'); }
  s.threeD = s.effects.includes('3d') ? (style.threeD || 'css') : false;
  // Accessibility modes are always SUPPORTED and VERIFIED; they only force motion down when the user asked for them.
  const forcedA11y = s.sources?.a11y === 'user';
  if (forcedA11y && s.a11y.includes('reduced-motion') && motionRank[s.motion] > 1) { s.motion = 'subtle'; adjustments.push('motion reduced to subtle: reduced-motion accessibility mode selected'); }
  if (forcedA11y && s.a11y.includes('reduced-motion') && s.threeD) { s.threeD = false; s.effects = s.effects.filter((x) => x !== '3d' && x !== 'parallax'); adjustments.push('3D/parallax disabled: reduced-motion accessibility mode selected'); }
  if (s.theme === 'high-contrast' && s.style === 'luxury') { adjustments.push('luxury hairlines thickened for high-contrast theme'); }
  if (s.platform !== 'neutral-web' && s.platform !== 'brand-custom' && s.style !== 'native-app') { adjustments.push(`platform ${s.platform} applied as token overlay on ${style.label} style (radius/touch targets/system fonts)`); }
  if (scan?.brand?.strength === 'explicit' && s.brandMode === 'preserve') adjustments.push(`brand primary ${scan.brand.primaryColor} preserved (brandMode=preserve)`);
  return { selection: s, adjustments };
}

export function listPresets() {
  return Object.entries(NAMED_PRESETS).map(([id, p]) => ({ id, ...p }));
}

function stripUndefined(o) { return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null)); }
