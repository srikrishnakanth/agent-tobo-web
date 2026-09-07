// Design recommendation engine: chooses ONE coherent design direction for a scanned project.
// It scores every style against the detected page types, brand, stack, existing components and
// device targets, then derives platform/theme/density/motion/effects/fonts that fit that style.
import { STYLES, PAGE_TYPES, PLATFORMS, DENSITIES } from './data/presets.js';
import { saturationOf, lightnessOf } from './color.js';

export function recommend(scan, catalog, prefs = {}) {
  const pageType = prefs.pageType && PAGE_TYPES[prefs.pageType] ? prefs.pageType : (scan?.pageTypes?.primary || 'landing');
  const pageDef = PAGE_TYPES[pageType] || PAGE_TYPES.landing;
  const brand = scan?.brand || {};
  const deps = Object.keys({ ...(scan?.packageJson?.dependencies || {}), ...(scan?.packageJson?.devDependencies || {}) });
  const cssNames = (scan?.cssStack || []).map((c) => c.name);
  const hasThree = deps.includes('three') || deps.includes('@react-three/fiber');
  const hasMotionLib = deps.includes('framer-motion') || deps.includes('motion') || deps.includes('gsap');

  // ---- score styles
  const scored = Object.entries(STYLES).map(([id, st]) => {
    let score = (st.pageAffinity[pageType] ?? 0.3) * 10;
    const reasons = [`page type "${pageType}" affinity ${(st.pageAffinity[pageType] ?? 0.3).toFixed(2)}`];
    // Brand colour temperament
    if (brand.primaryColor) {
      const sat = saturationOf(brand.primaryColor), light = lightnessOf(brand.primaryColor);
      if (sat > 0.8 && ['creative', 'visual-rich', 'modern', '3d'].includes(id)) { score += 1; reasons.push('highly saturated brand colour suits expressive style'); }
      if (sat < 0.4 && ['luxury', 'minimal', 'enterprise', 'premium'].includes(id)) { score += 1; reasons.push('muted brand colour suits restrained style'); }
      if (light < 0.35 && id === 'luxury') { score += 0.5; reasons.push('deep brand tone suits luxury'); }
    }
    if (brand.darkDefault && ['data-dense', '3d', 'modern', 'premium'].includes(id)) { score += 0.5; reasons.push('project already ships a dark default'); }
    // Stack fit
    if (cssNames.includes('tailwind') && ['modern', 'premium', 'enterprise'].includes(id)) { score += 0.5; reasons.push('Tailwind stack'); }
    if (scan?.components?.summary?.table > 0 && ['enterprise', 'data-dense'].includes(id)) { score += 1.5; reasons.push('existing table components'); }
    if (scan?.components?.summary?.chart > 0 && ['data-dense', 'enterprise'].includes(id)) { score += 1; reasons.push('existing chart components'); }
    if (scan?.components?.summary?.sidebar > 0 && ['enterprise', 'data-dense', 'modern'].includes(id)) { score += 0.5; reasons.push('existing sidebar'); }
    if ((scan?.components?.summary?.hero || 0) > 0 && ['premium', 'creative', 'visual-rich', 'luxury'].includes(id)) { score += 0.5; reasons.push('hero section present'); }
    // 3D only when the project already has a 3D dependency; heavy styles penalised for app-like page types
    if (id === '3d' && !hasThree) { score -= 4; reasons.push('no 3D dependency present: 3D would require a new dependency (never added automatically)'); }
    if (['3d', 'visual-rich', 'creative'].includes(id) && ['dashboard', 'crm', 'admin', 'inbox', 'settings'].includes(pageType)) { score -= 3; reasons.push('expressive style penalised for productivity page type'); }
    // Native app only when there is platform intent
    if (id === 'native-app' && prefs.platform && prefs.platform !== 'neutral-web' && prefs.platform !== 'brand-custom' && prefs.platform !== 'auto') { score += 3; reasons.push(`platform ${prefs.platform} requested`); }
    // Generic-pattern remediation: projects with AI-cliché signals get a push towards distinctive but disciplined styles
    const generic = (scan?.genericPatterns || []).map((g) => g.id);
    if (generic.includes('neon-on-navy') && ['premium', 'enterprise', 'minimal'].includes(id)) { score += 0.5; reasons.push('remediates neon-on-navy cliché'); }
    if (generic.includes('glass-blur-spam') && ['minimal', 'enterprise', 'premium'].includes(id)) { score += 0.5; reasons.push('remediates glass overuse'); }
    return { id, score: +score.toFixed(2), reasons };
  }).sort((a, b) => b.score - a.score);
  const style = prefs.style && STYLES[prefs.style] ? prefs.style : scored[0].id;
  const st = STYLES[style];

  // ---- platform
  let platform = 'neutral-web';
  if (prefs.platform && PLATFORMS[prefs.platform]) platform = prefs.platform;
  else if (deps.includes('@capacitor/core') || deps.includes('@ionic/react')) platform = 'ios';
  else if (deps.includes('react-native') || deps.includes('expo')) platform = 'android-material';

  // ---- theme: keep existing dark default, otherwise light+dark auto
  // Theme: only offer system light+dark when the project already supports scheme switching (prefers-color-scheme /
  // dark: variants / variable-driven surfaces). Otherwise keep the project's existing scheme so tokens never fight
  // hard-coded surfaces (e.g. Tailwind bg-white under a dark palette).
  const supportsSchemes = !!scan?.responsive?.prefersDark || (scan?.layout?.usesCssVariables && (scan?.colors?.variables ? Object.keys(scan.colors.variables).some((v) => /bg|background|surface/i.test(v)) : false) && !cssNames.includes('tailwind'));
  const theme = prefs.theme && ['light', 'dark', 'high-contrast'].includes(prefs.theme) ? prefs.theme : (brand.darkDefault ? 'dark' : supportsSchemes ? 'auto' : 'light');
  const density = prefs.density && DENSITIES[prefs.density] ? prefs.density : (['dashboard', 'crm', 'admin', 'inbox'].includes(pageType) ? 'compact' : st.density);
  let motion = prefs.motion && ['none', 'subtle', 'standard', 'complex'].includes(prefs.motion) ? prefs.motion : st.motion;
  if (!hasMotionLib && motion === 'complex' && style !== '3d') motion = 'standard';

  // ---- effects
  const effects = [];
  if (motion !== 'none') effects.push('micro-interactions');
  if (motion === 'standard' || motion === 'complex') effects.push('animations');
  if ((motion === 'standard' || motion === 'complex') && pageType === 'landing') effects.push('scroll-effects');
  if (pageDef.effects.includes('carousel')) effects.push('carousel');
  if (motion === 'complex' && ['creative', 'visual-rich', '3d'].includes(style) && pageType === 'landing') effects.push('parallax');
  if (style === '3d') effects.push('3d');
  const threeD = style === '3d' ? (hasThree ? 'webgl' : 'css') : false;

  // ---- components: union of page needs and existing components (never remove existing ones)
  const components = [...new Set([...pageDef.components, ...(scan?.components?.existing || []).filter((c) => ['buttons', 'inputs', 'cards', 'tables', 'navigation', 'sidebar', 'modals', 'charts', 'carousel'].includes(normalizeComponent(c))).map(normalizeComponent)])];
  if (!components.includes('buttons')) components.push('buttons');
  if (!components.includes('inputs')) components.push('inputs');

  // ---- devices: everything by default; app platforms emphasise mobile
  const devices = ['mobile', 'foldable', 'tablet', 'laptop', 'desktop', 'ultrawide', '4k'];
  const a11y = ['reduced-motion', 'keyboard', 'forced-colors', 'large-text', 'screen-reader'];

  // ---- fonts from the vault (fall back to system when the vault lacks the family)
  const fonts = pickFonts(st, PLATFORMS[platform], catalog);

  // ---- vault component candidates (framework/style/license-filtered; deps must already exist)
  const framework = scan?.framework?.name === 'nextjs' ? 'nextjs' : scan?.framework?.family === 'react' ? 'react' : 'html';
  const cssStack = cssNames.includes('tailwind') ? 'tailwind' : 'plain';
  const vaultPicks = catalog ? catalog.search({ style, pageType, framework, availableDeps: deps, maxPerf: motion === 'none' ? 'low' : 'high', limit: 40 }).map((r) => ({ id: r.asset.id, category: r.asset.category, score: r.score, missingDeps: (r.asset.dependencies || []).filter((d) => !deps.includes(d)) })) : [];

  const rationale = [
    `Style "${st.label}" chosen: ${scored[0].id === style ? scored[0].reasons.join('; ') : 'user override'}.`,
    `Page type "${pageDef.label}" (${scan?.pageTypes?.ranked?.[0]?.evidence?.join('; ') || 'default'}).`,
    brand.primaryColor ? `Brand primary ${brand.primaryColor} (${brand.primarySource}) is preserved as the accent.` : 'No explicit brand colour detected; a style-appropriate accent will be proposed and flagged for review.',
    `Theme "${theme}": ${brand.darkDefault ? 'project already defaults to dark' : theme === 'auto' ? 'project supports scheme switching, system light/dark offered' : 'project has no dark-mode support; existing light scheme kept (pass --theme auto to add system dark mode)'}.`,
    `Density "${density}", motion "${motion}", 3D ${threeD || 'off'}${threeD ? ' (auto-degrades under reduced-motion / low-end)' : ''}.`,
    (scan?.uxProblems || []).length ? `Remediates ${scan.uxProblems.length} detected UX problem(s): ${[...new Set(scan.uxProblems.map((p) => p.id))].join(', ')}.` : 'No UX problems detected by the scanner.',
    (scan?.genericPatterns || []).length ? `Avoids ${scan.genericPatterns.length} generic pattern(s): ${scan.genericPatterns.map((g) => g.id).join(', ')}.` : 'No generic AI-looking patterns detected.',
  ];
  return { style, pageType, platform, theme, density, motion, threeD, effects, components, devices, a11y, fonts, cssStack, framework, vaultPicks, styleRanking: scored.slice(0, 5), rationale, signature: st.signature, antiPatterns: st.antiPatterns };
}

function normalizeComponent(c) {
  const map = { button: 'buttons', input: 'inputs', card: 'cards', table: 'tables', navigation: 'navigation', sidebar: 'sidebar', modal: 'modals', chart: 'charts', carousel: 'carousel', form: 'inputs' };
  return map[c] || c;
}

export function pickFonts(style, platform, catalog) {
  const wantSystem = platform?.fonts && platform.fonts.display[0] === 'system';
  const resolve = (ids) => {
    for (const id of ids || []) {
      if (id === 'system') return { id: 'system', family: null, stack: platform?.systemFontStack || 'system-ui, sans-serif', source: 'system' };
      if (id === 'system-mono') return { id: 'system-mono', family: null, stack: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", source: 'system' };
      const a = catalog?.byId(id);
      if (a) return { id, family: a.family, stack: `'${a.family}', ${a.role === 'serif' || a.role === 'display' && /serif/i.test(a.family) ? 'Georgia, serif' : a.role === 'mono' ? 'ui-monospace, monospace' : 'system-ui, sans-serif'}`, source: 'vault', license: a.license, commit: a.sourceCommit };
    }
    return { id: 'system', family: null, stack: platform?.systemFontStack || 'system-ui, sans-serif', source: 'system-fallback' };
  };
  const f = wantSystem ? platform.fonts : style.fonts;
  return { display: resolve(f.display), body: resolve(f.body), mono: resolve(f.mono || ['font-jetbrains-mono', 'system-mono']) };
}
