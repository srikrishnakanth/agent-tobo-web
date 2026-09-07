// Design token generation. Input: resolved selection + scan + catalog. Output: a complete,
// contrast-validated token set (light / dark / high-contrast) + typography, spacing, radius,
// shadows, motion, density, breakpoints, and the list of vault assets referenced (provenance).
import { STYLES, PLATFORMS, DENSITIES, MOTION_LEVELS } from '../intelligence/data/presets.js';
import { parseColor, toHex, scale, ensureContrast, contrastRatio, hueOf, saturationOf, hsl, withSaturation, isLight, mix, rotate } from '../intelligence/color.js';

const STYLE_ACCENTS = { premium: '#2f5bea', modern: '#0f766e', minimal: '#111111', enterprise: '#1f4e9c', luxury: '#8a6d3b', creative: '#e6431f', 'visual-rich': '#d9480f', 'native-app': '#0a84ff', '3d': '#6d28d9', 'data-dense': '#2563eb' };
const STATUS = { success: '#15803d', warning: '#b45309', danger: '#b91c1c', info: '#1d4ed8' };

export function buildTokens(selection, scan, catalog) {
  const st = STYLES[selection.style];
  const platform = PLATFORMS[selection.platform];
  const density = DENSITIES[selection.density];
  const motion = MOTION_LEVELS[selection.motion];
  const assets = [];
  const useAsset = (id, note) => { const a = catalog?.byId(id); if (a && !assets.some((x) => x.id === id)) assets.push({ id, category: a.category, license: a.license, upstream: a.upstream, note, noticePreserved: true }); };

  // ------------------------------------------------------------------ colour
  const brand = scan?.brand?.primaryColor && selection.brandMode !== 'replace' ? toHex(parseColor(scan.brand.primaryColor)) : null;
  const primary = brand || STYLE_ACCENTS[selection.style] || '#2563eb';
  const primarySource = brand ? `brand (${scan.brand.primarySource})` : selection.brandMode === 'replace' ? 'style accent (brand replacement allowed)' : 'style accent (no brand colour detected)';
  const neutralSeed = st.neutralTint > 0 ? withSaturation(primary, st.neutralTint) : '#808080';
  const light = scale(neutralSeed, { neutral: true });
  const dark = scale(neutralSeed, { neutral: true, dark: true });
  const primaryLight = scale(primary), primaryDark = scale(primary, { dark: true });
  useAsset('radix-colors-light', '12-step scale intent for light neutrals'); useAsset('radix-colors-dark', '12-step scale intent for dark neutrals');

  const themeLight = semantic({ bg: light[0], surface: '#ffffff', surface2: light[2], border: light[5], borderStrong: light[7], text: light[11], textMuted: light[9], primary, dark: false });
  const themeDark = semantic({ bg: dark[0], surface: dark[1], surface2: dark[2], border: dark[5], borderStrong: dark[7], text: dark[11], textMuted: dark[9], primary: adaptPrimaryForDark(primary), dark: true });
  const themeHC = semantic({ bg: '#000000', surface: '#000000', surface2: '#111111', border: '#ffffff', borderStrong: '#ffffff', text: '#ffffff', textMuted: '#ffffff', primary: ensureContrast(adaptPrimaryForDark(primary), '#000000', 7), dark: true, highContrast: true });
  const contrastReport = [themeLight, themeDark, themeHC].map((t) => t.__contrast);
  for (const t of [themeLight, themeDark, themeHC]) delete t.__contrast;

  // ------------------------------------------------------------------ typography
  const fonts = selection.recommendation?.fonts || { display: { stack: 'system-ui, sans-serif', source: 'system' }, body: { stack: 'system-ui, sans-serif', source: 'system' }, mono: { stack: 'ui-monospace, monospace', source: 'system' } };
  for (const f of Object.values(fonts)) if (f.source === 'vault') useAsset(f.id, 'font family (OFL, loaded from Google Fonts; not vendored)');
  const googleFamilies = [...new Set(Object.values(fonts).filter((f) => f.source === 'vault' && f.family).map((f) => f.family))];
  const googleFontsUrl = googleFamilies.length ? `https://fonts.googleapis.com/css2?${googleFamilies.map((f) => `family=${encodeURIComponent(f).replace(/%20/g, '+')}:wght@400;500;600;700`).join('&')}&display=swap` : null;
  const base = selection.a11y?.includes('large-text') ? density.fontBase + 2 : density.fontBase;
  const typography = {
    display: fonts.display.stack, body: fonts.body.stack, mono: fonts.mono.stack, googleFontsUrl, families: googleFamilies,
    baseSizePx: base, lineHeight: selection.density === 'compact' ? 1.45 : 1.55, headingLineHeight: 1.15,
    scale: { xs: 'clamp(0.75rem, 0.72rem + 0.15vw, 0.8125rem)', sm: 'clamp(0.875rem, 0.85rem + 0.15vw, 0.9375rem)', md: '1rem', lg: 'clamp(1.125rem, 1.05rem + 0.35vw, 1.25rem)', xl: 'clamp(1.375rem, 1.2rem + 0.8vw, 1.75rem)', '2xl': 'clamp(1.75rem, 1.4rem + 1.6vw, 2.5rem)', '3xl': 'clamp(2.25rem, 1.6rem + 3vw, 3.75rem)', '4xl': 'clamp(2.75rem, 1.8rem + 4.5vw, 5rem)' },
    weights: { regular: 400, medium: 500, semibold: 600, bold: 700 }, letterSpacingDisplay: ['luxury', 'minimal'].includes(selection.style) ? '-0.02em' : ['creative', '3d'].includes(selection.style) ? '-0.03em' : '-0.01em',
    numeric: ['data-dense', 'enterprise'].includes(selection.style) ? 'tabular-nums' : 'normal',
  };

  // ------------------------------------------------------------------ spacing / radius / shadows / density
  const spacing = Object.fromEntries(density.scale.map((px, i) => [`${i + 1}`, `${px / 16}rem`]));
  const radiusBase = selection.radius ?? (platform.radius ?? st.radius);
  const radius = { none: '0', sm: `${Math.max(2, Math.round(radiusBase * 0.5))}px`, md: `${radiusBase}px`, lg: `${Math.round(radiusBase * 1.5)}px`, xl: `${Math.round(radiusBase * 2.25)}px`, full: '9999px' };
  const shadows = shadowSet(st.shadow, themeLight.text);
  useAsset('open-props-shadows', 'shadow ramp intent'); useAsset('open-props-easing', 'easing curves'); useAsset('open-props-sizes', 'spacing scale intent'); useAsset('open-props-borders', 'radius scale intent'); useAsset('open-props-media', 'media query breakpoints & preference queries');
  for (const id of platform.vaultTokens || []) useAsset(id, `${platform.label} platform token reference`);
  const touchTarget = Math.max(platform.touchTarget || 44, selection.a11y?.includes('large-text') ? 48 : 44);
  const densityTokens = { controlHeight: `${Math.max(density.controlHeight, ['mobile', 'foldable', 'tablet'].some((d) => selection.devices.includes(d)) ? Math.min(touchTarget, 48) : density.controlHeight)}px`, rowHeight: `${density.rowHeight}px`, touchTarget: `${touchTarget}px`, gutter: `${density.scale[4] / 16}rem`, contentMax: selection.style === 'data-dense' ? '100%' : ['docs', 'auth', 'onboarding'].includes(selection.pageType) ? '72rem' : '90rem', readingMax: '68ch' };

  // ------------------------------------------------------------------ motion
  const threeD = selection.threeD || false;
  const heavy = selection.motion === 'complex' || !!threeD;
  const motionTokens = {
    level: selection.motion, fast: `${motion.durationFast}ms`, base: `${motion.durationBase}ms`, slow: `${motion.durationSlow}ms`,
    easeOut: 'cubic-bezier(0.22, 1, 0.36, 1)', easeInOut: 'cubic-bezier(0.65, 0, 0.35, 1)', spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
    scroll: motion.scroll && selection.effects.includes('scroll-effects'), parallax: motion.parallax && selection.effects.includes('parallax'), carousel: selection.effects.includes('carousel') ? 'scroll-snap' : false,
    threeD, fallback: heavy ? { reducedMotion: 'disable', lowEnd: 'css-depth-then-static', mobile: threeD === 'webgl' ? 'css-depth' : 'static', saveData: 'static', policy: 'auto-degrade' } : { reducedMotion: 'disable' },
  };
  if (threeD === 'webgl') useAsset('threejs-cube-example', 'WebGL hero reference (only used when `three` already exists in the project)');
  if (selection.effects.includes('carousel')) useAsset('swiper-css', 'carousel behaviour intent; adapted to dependency-free scroll-snap');
  if (motionTokens.scroll || motionTokens.parallax) useAsset('open-props-animations', 'keyframe intent (reduced-motion guarded)');
  if (selection.components.includes('charts')) useAsset('chartjs-samples', 'chart intent; adapted to dependency-free SVG when chart.js is absent');
  const iconSet = ['enterprise', 'data-dense'].includes(selection.style) ? 'tabler-outline-core' : ['modern', 'minimal', 'premium'].includes(selection.style) ? 'heroicons-outline-core' : 'lucide-core';
  useAsset(iconSet, 'icon set (inline SVG)');

  const breakpoints = { xs: 240, fold: 280, sm: 360, md: 640, foldOpen: 717, lg: 1024, xl: 1280, '2xl': 1536, '3xl': 1920, uw: 2560, '4k': 3840 };
  const zIndex = { base: 0, raised: 10, sticky: 100, overlay: 1000, modal: 1100, toast: 1200 };

  return {
    meta: { style: selection.style, pageType: selection.pageType, platform: selection.platform, theme: selection.theme, density: selection.density, motion: selection.motion, generatedAt: new Date().toISOString(), signature: st.signature },
    color: { primary, primarySource, brandPreserved: !!brand, light: themeLight, dark: themeDark, highContrast: themeHC, primaryScaleLight: primaryLight, primaryScaleDark: primaryDark, neutralLight: light, neutralDark: dark, status: STATUS, contrastReport },
    typography, spacing, radius, shadows, density: densityTokens, motion: motionTokens, breakpoints, zIndex, icons: iconSet, assets,
  };
}

function adaptPrimaryForDark(primary) {
  // Lift very dark or very saturated primaries so they read on dark surfaces.
  const h = hueOf(primary), s = Math.min(saturationOf(primary), 0.9);
  const c = parseColor(primary);
  const lum = (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255;
  return lum < 0.45 ? hsl(h, s, 0.62) : primary;
}

function semantic({ bg, surface, surface2, border, borderStrong, text, textMuted, primary, dark, highContrast }) {
  const t = {};
  t.bg = bg; t.surface = surface; t.surface2 = surface2; t.border = border; t.borderStrong = borderStrong;
  t.text = ensureContrast(text, surface, highContrast ? 7 : 4.5);
  t.textMuted = ensureContrast(ensureContrast(textMuted, surface, highContrast ? 7 : 4.5), surface2, highContrast ? 7 : 4.5);
  t.primary = ensureContrast(primary, surface, 3); // UI component contrast (WCAG 1.4.11)
  t.primaryText = ensureContrast(primary, surface, highContrast ? 7 : 4.5); // primary used as text/link colour
  t.onPrimary = contrastRatio('#0b0b0b', t.primary) >= contrastRatio('#ffffff', t.primary) ? '#0b0b0b' : '#ffffff';
  if (contrastRatio(t.onPrimary, t.primary) < 4.5) {
    // Neither pure ink nor white reaches AA on this primary: shift the primary itself until its label passes.
    t.primary = ensureContrast(t.primary, t.onPrimary, 4.5, { direction: t.onPrimary === '#ffffff' ? 'darker' : 'lighter' });
  }
  t.primaryHover = dark ? mix(t.primary, '#ffffff', 0.12) : mix(t.primary, '#000000', 0.12);
  t.primarySoft = dark ? mix(t.primary, bg, 0.82) : mix(t.primary, '#ffffff', 0.88);
  t.accent = ensureContrast(rotate(t.primary, 24), surface, 3);
  t.focus = ensureContrast(dark ? mix(t.primary, '#ffffff', 0.35) : t.primary, surface, 3);
  t.success = ensureContrast(dark ? '#4ade80' : STATUS.success, surface, 4.5);
  t.warning = ensureContrast(dark ? '#fbbf24' : STATUS.warning, surface, 4.5);
  t.danger = ensureContrast(dark ? '#f87171' : STATUS.danger, surface, 4.5);
  t.info = ensureContrast(dark ? '#93c5fd' : STATUS.info, surface, 4.5);
  t.overlay = dark ? 'rgba(0,0,0,0.6)' : 'rgba(15,23,42,0.45)';
  if (highContrast) { t.border = '#ffffff'; t.borderStrong = '#ffffff'; t.textMuted = '#ffffff'; }
  t.__contrast = {
    theme: highContrast ? 'high-contrast' : dark ? 'dark' : 'light',
    pairs: [['text', 'surface'], ['textMuted', 'surface'], ['textMuted', 'surface2'], ['text', 'bg'], ['primaryText', 'surface'], ['onPrimary', 'primary'], ['success', 'surface'], ['danger', 'surface']].map(([a, b]) => ({ pair: `${a}/${b}`, ratio: +contrastRatio(t[a], t[b]).toFixed(2), passAA: contrastRatio(t[a], t[b]) >= 4.5 })),
  };
  return t;
}

function shadowSet(level, ink) {
  const c = parseColor(ink) || { r: 15, g: 23, b: 42 };
  const rgba = (a) => `rgba(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)}, ${a})`;
  if (level === 'none') return { sm: 'none', md: 'none', lg: 'none', focus: `0 0 0 3px var(--kk-color-focus)` };
  const k = level === 'low' ? 0.5 : level === 'high' ? 1.6 : level === 'soft' ? 0.8 : 1;
  return {
    sm: `0 1px 2px ${rgba(0.06 * k)}`,
    md: `0 2px 6px ${rgba(0.08 * k)}, 0 8px 24px ${rgba(0.06 * k)}`,
    lg: `0 12px 32px ${rgba(0.12 * k)}, 0 32px 64px ${rgba(0.10 * k)}`,
    focus: `0 0 0 3px var(--kk-color-focus)`,
  };
}
