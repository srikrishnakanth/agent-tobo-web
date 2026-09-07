// CSS emitters shared by every adapter. Produces tokens.css (design tokens for light/dark/high-
// contrast/forced-colors/reduced-motion) and theme.css (component styling + remediations).
import { STYLES } from '../intelligence/data/presets.js';
import { parseColor, contrastRatio, saturationOf, lightnessOf } from '../intelligence/color.js';

export function emitTokensCss(tokens, { theme = 'auto', tailwindV4 = false, fontFaceCss = null } = {}) {
  const c = tokens.color;
  const vars = (t) => [
    `--kk-color-bg: ${t.bg};`, `--kk-color-surface: ${t.surface};`, `--kk-color-surface-2: ${t.surface2};`, `--kk-color-border: ${t.border};`, `--kk-color-border-strong: ${t.borderStrong};`,
    `--kk-color-text: ${t.text};`, `--kk-color-text-muted: ${t.textMuted};`, `--kk-color-primary: ${t.primary};`, `--kk-color-primary-text: ${t.primaryText};`, `--kk-color-on-primary: ${t.onPrimary};`,
    `--kk-color-primary-hover: ${t.primaryHover};`, `--kk-color-primary-soft: ${t.primarySoft};`, `--kk-color-accent: ${t.accent};`, `--kk-color-focus: ${t.focus};`,
    `--kk-color-success: ${t.success};`, `--kk-color-warning: ${t.warning};`, `--kk-color-danger: ${t.danger};`, `--kk-color-info: ${t.info};`, `--kk-color-overlay: ${t.overlay};`,
  ].map((l) => '  ' + l).join('\n');
  const base = [
    `--kk-font-display: ${tokens.typography.display};`, `--kk-font-body: ${tokens.typography.body};`, `--kk-font-mono: ${tokens.typography.mono};`,
    `--kk-font-size-base: ${tokens.typography.baseSizePx / 16}rem;`, `--kk-line-height: ${tokens.typography.lineHeight};`, `--kk-line-height-heading: ${tokens.typography.headingLineHeight};`, `--kk-tracking-display: ${tokens.typography.letterSpacingDisplay};`, `--kk-numeric: ${tokens.typography.numeric};`,
    ...Object.entries(tokens.typography.scale).map(([k, v]) => `--kk-text-${k}: ${v};`),
    ...Object.entries(tokens.spacing).map(([k, v]) => `--kk-space-${k}: ${v};`),
    ...Object.entries(tokens.radius).map(([k, v]) => `--kk-radius-${k}: ${v};`),
    ...Object.entries(tokens.shadows).map(([k, v]) => `--kk-shadow-${k}: ${v};`),
    `--kk-dur-fast: ${tokens.motion.fast};`, `--kk-dur-base: ${tokens.motion.base};`, `--kk-dur-slow: ${tokens.motion.slow};`, `--kk-ease-out: ${tokens.motion.easeOut};`, `--kk-ease-in-out: ${tokens.motion.easeInOut};`, `--kk-ease-spring: ${tokens.motion.spring};`,
    `--kk-control-h: ${tokens.density.controlHeight};`, `--kk-row-h: ${tokens.density.rowHeight};`, `--kk-touch: ${tokens.density.touchTarget};`, `--kk-gutter: ${tokens.density.gutter};`, `--kk-content-max: ${tokens.density.contentMax};`, `--kk-reading-max: ${tokens.density.readingMax};`,
    ...Object.entries(tokens.zIndex).map(([k, v]) => `--kk-z-${k}: ${v};`),
    `--kk-safe-top: env(safe-area-inset-top, 0px);`, `--kk-safe-bottom: env(safe-area-inset-bottom, 0px);`, `--kk-safe-left: env(safe-area-inset-left, 0px);`, `--kk-safe-right: env(safe-area-inset-right, 0px);`,
  ].map((l) => '  ' + l).join('\n');
  const scheme = theme === 'auto' ? 'light dark' : theme === 'dark' || theme === 'high-contrast' ? 'dark' : 'light';
  const primaryVars = theme === 'dark' ? vars(c.dark) : theme === 'high-contrast' ? vars(c.highContrast) : vars(c.light);
  const out = [];
  out.push(`/* KK-UI-GOVERNOR design tokens — generated ${tokens.meta.generatedAt}\n   style=${tokens.meta.style} page=${tokens.meta.pageType} platform=${tokens.meta.platform} theme=${tokens.meta.theme} density=${tokens.meta.density} motion=${tokens.meta.motion}\n   Primary colour: ${c.primary} (${c.primarySource}). All text pairs validated ≥ WCAG AA. Do not edit by hand; re-run kkgov. */`);
  if (fontFaceCss) out.push(fontFaceCss.trim());
  else if (tokens.typography.googleFontsUrl) out.push(`@import url("${tokens.typography.googleFontsUrl}");`);
  out.push(`:root {\n  color-scheme: ${scheme};\n${base}\n${primaryVars}\n}`);
  if (theme === 'auto') {
    out.push(`@media (prefers-color-scheme: dark) {\n  :root:not([data-theme="light"]):not([data-theme="high-contrast"]) {\n${vars(c.dark)}\n  }\n}`);
    out.push(`:root[data-theme="dark"] {\n  color-scheme: dark;\n${vars(c.dark)}\n}`);
    out.push(`:root[data-theme="light"] {\n  color-scheme: light;\n${vars(c.light)}\n}`);
  } else if (theme === 'dark') {
    out.push(`:root[data-theme="light"] {\n  color-scheme: light;\n${vars(c.light)}\n}`);
  } else if (theme === 'light') {
    out.push(`:root[data-theme="dark"] {\n  color-scheme: dark;\n${vars(c.dark)}\n}`);
  }
  out.push(`/* High contrast: explicit opt-in and OS preference */\n:root[data-theme="high-contrast"],\n:root[data-contrast="more"] {\n  color-scheme: dark;\n${vars(c.highContrast)}\n  --kk-shadow-sm: none; --kk-shadow-md: none; --kk-shadow-lg: none;\n}\n@media (prefers-contrast: more) {\n  :root:not([data-theme]) {\n${vars(c.highContrast)}\n    --kk-shadow-sm: none; --kk-shadow-md: none; --kk-shadow-lg: none;\n  }\n}`);
  out.push(`/* Forced colors (Windows High Contrast): defer to system palette */\n@media (forced-colors: active) {\n  :root {\n    --kk-color-bg: Canvas; --kk-color-surface: Canvas; --kk-color-surface-2: Canvas; --kk-color-border: CanvasText; --kk-color-border-strong: CanvasText;\n    --kk-color-text: CanvasText; --kk-color-text-muted: CanvasText; --kk-color-primary: ButtonText; --kk-color-primary-text: LinkText; --kk-color-on-primary: ButtonFace;\n    --kk-color-primary-hover: ButtonText; --kk-color-primary-soft: Canvas; --kk-color-accent: Highlight; --kk-color-focus: Highlight;\n    --kk-color-success: CanvasText; --kk-color-warning: CanvasText; --kk-color-danger: CanvasText; --kk-color-info: LinkText; --kk-color-overlay: Canvas;\n    --kk-shadow-sm: none; --kk-shadow-md: none; --kk-shadow-lg: none;\n  }\n}`);
  out.push(`/* Reduced motion: collapse every duration (also honoured via data-motion="reduced") */\n@media (prefers-reduced-motion: reduce) {\n  :root { --kk-dur-fast: 0ms; --kk-dur-base: 0ms; --kk-dur-slow: 0ms; }\n}\n:root[data-motion="reduced"], :root[data-motion="off"] { --kk-dur-fast: 0ms; --kk-dur-base: 0ms; --kk-dur-slow: 0ms; }`);
  if (tailwindV4) {
    out.push(`/* Tailwind v4 theme bridge: exposes tokens as utility colours (bg-kk-primary, text-kk-text …) */\n@theme inline {\n  --color-kk-bg: var(--kk-color-bg); --color-kk-surface: var(--kk-color-surface); --color-kk-surface-2: var(--kk-color-surface-2); --color-kk-border: var(--kk-color-border);\n  --color-kk-text: var(--kk-color-text); --color-kk-muted: var(--kk-color-text-muted); --color-kk-primary: var(--kk-color-primary); --color-kk-on-primary: var(--kk-color-on-primary); --color-kk-accent: var(--kk-color-accent); --color-kk-focus: var(--kk-color-focus);\n  --color-kk-success: var(--kk-color-success); --color-kk-warning: var(--kk-color-warning); --color-kk-danger: var(--kk-color-danger);\n  --font-kk-display: var(--kk-font-display); --font-kk-body: var(--kk-font-body); --font-kk-mono: var(--kk-font-mono);\n  --radius-kk-sm: var(--kk-radius-sm); --radius-kk-md: var(--kk-radius-md); --radius-kk-lg: var(--kk-radius-lg); --radius-kk-xl: var(--kk-radius-xl);\n  --shadow-kk-sm: var(--kk-shadow-sm); --shadow-kk-md: var(--kk-shadow-md); --shadow-kk-lg: var(--kk-shadow-lg);\n}`);
  }
  return out.join('\n\n') + '\n';
}

/**
 * theme.css: base + components + motion + remediations. `remediations` are selector-level fixes
 * derived from the scan (e.g. 100vh → 100dvh for the exact selectors the project uses).
 */
export function emitThemeCss(tokens, selection, { remediations = [], importTokens = true, layer = null } = {}) {
  const st = STYLES[selection.style];
  const isApp = selection.platform !== 'neutral-web' && selection.platform !== 'brand-custom';
  const parts = [];
  parts.push(`/* KK-UI-GOVERNOR theme — ${st.label} / ${selection.pageType} / ${selection.platform}. Signature: ${st.signature}\n   Additive by design: this file only introduces tokens, base styling, opt-in .kk-* components and safety remediations. */`);
  if (importTokens) parts.push(`@import "./tokens.css";`);

  const body = [];
  body.push(`/* ---------- base ---------- */
html { -webkit-text-size-adjust: 100%; text-size-adjust: 100%; scroll-behavior: smooth; }
@media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } }
body { font-family: var(--kk-font-body); font-size: var(--kk-font-size-base); line-height: var(--kk-line-height); color: var(--kk-color-text); background-color: var(--kk-color-bg); -webkit-font-smoothing: antialiased; font-variant-numeric: var(--kk-numeric); overflow-x: clip; }
h1, h2, h3, h4, h5, h6, .kk-display { font-family: var(--kk-font-display); line-height: var(--kk-line-height-heading); letter-spacing: var(--kk-tracking-display); text-wrap: balance; overflow-wrap: anywhere; margin-block: 0 0.5em; }
h1, .kk-h1 { font-size: var(--kk-text-3xl); font-weight: 700; }
h2, .kk-h2 { font-size: var(--kk-text-2xl); font-weight: 700; }
h3, .kk-h3 { font-size: var(--kk-text-xl); font-weight: 600; }
h4, .kk-h4 { font-size: var(--kk-text-lg); font-weight: 600; }
p, li, td, th, label, input, textarea, select, button { overflow-wrap: anywhere; }
img, video, svg, canvas, iframe { max-width: 100%; height: auto; }
img, video { display: block; }
pre, code, kbd, samp { font-family: var(--kk-font-mono); font-size: 0.925em; }
pre { overflow-x: auto; max-width: 100%; padding: var(--kk-space-4); border-radius: var(--kk-radius-md); background: var(--kk-color-surface-2); }
a { color: var(--kk-color-primary-text); text-underline-offset: 0.15em; }
a:hover { color: var(--kk-color-primary-hover); }
::selection { background: var(--kk-color-primary-soft); color: var(--kk-color-text); }
hr { border: 0; border-top: 1px solid var(--kk-color-border); margin-block: var(--kk-space-6); }
:where(main, .kk-main) { min-width: 0; }
/* Navigation links become real touch targets without changing inline text links */
nav a:not(.kk-btn):not(.btn) { display: inline-flex; align-items: center; min-height: var(--kk-touch); }
header, nav, footer { min-width: 0; }
/* Keyboard focus is always visible, never removed */
:focus-visible { outline: 3px solid var(--kk-color-focus) !important; outline-offset: 2px; box-shadow: none; }
:focus:not(:focus-visible) { outline: none; }
input:focus-visible, select:focus-visible, textarea:focus-visible, button:focus-visible, a:focus-visible, [tabindex]:focus-visible { outline: 3px solid var(--kk-color-focus) !important; outline-offset: 2px; }
@media (forced-colors: active) { :focus-visible { outline: 3px solid Highlight !important; } }`);

  body.push(`/* ---------- controls ---------- */
button, input, select, textarea, .kk-btn { font: inherit; color: inherit; }
button, .kk-btn, [role="button"], input[type="submit"], input[type="button"] { display: inline-flex; align-items: center; justify-content: center; gap: var(--kk-space-2); min-height: var(--kk-control-h); min-width: var(--kk-touch); padding: 0 var(--kk-space-5); border: 1px solid transparent; border-radius: var(--kk-radius-md); font-weight: 600; font-size: var(--kk-text-sm); line-height: 1.2; cursor: pointer; text-decoration: none; background: var(--kk-color-primary); color: var(--kk-color-on-primary); box-shadow: var(--kk-shadow-sm); transition: background-color var(--kk-dur-fast) var(--kk-ease-out), box-shadow var(--kk-dur-fast) var(--kk-ease-out), transform var(--kk-dur-fast) var(--kk-ease-out), border-color var(--kk-dur-fast) var(--kk-ease-out); touch-action: manipulation; -webkit-tap-highlight-color: transparent; ${selection.style === 'luxury' ? 'text-transform: uppercase; letter-spacing: 0.12em; font-size: var(--kk-text-xs);' : ''} }
button:hover, .kk-btn:hover { background: var(--kk-color-primary-hover); }
button:active, .kk-btn:active { transform: translateY(1px); box-shadow: none; }
button:disabled, .kk-btn[aria-disabled="true"] { opacity: 0.55; cursor: not-allowed; transform: none; }
.kk-btn--secondary, button.kk-secondary { background: var(--kk-color-surface); color: var(--kk-color-text); border-color: var(--kk-color-border-strong); }
.kk-btn--secondary:hover, button.kk-secondary:hover { background: var(--kk-color-surface-2); }
.kk-btn--ghost, button.kk-ghost { background: transparent; color: var(--kk-color-primary-text); box-shadow: none; }
.kk-btn--ghost:hover, button.kk-ghost:hover { background: var(--kk-color-primary-soft); }
.kk-btn--danger { background: var(--kk-color-danger); color: #fff; }
.kk-btn--sm { min-height: calc(var(--kk-control-h) - 8px); padding-inline: var(--kk-space-3); }
.kk-btn--lg { min-height: calc(var(--kk-control-h) + 8px); padding-inline: var(--kk-space-7); font-size: var(--kk-text-md); }
.kk-btn--icon { min-width: var(--kk-touch); padding-inline: 0; }
@media (forced-colors: active) { button, .kk-btn { border-color: ButtonText; } }
input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="submit"]):not([type="button"]):not([type="file"]), select, textarea, .kk-input { width: 100%; min-height: var(--kk-control-h); padding: var(--kk-space-2) var(--kk-space-3); border: 1px solid var(--kk-color-border-strong); border-radius: var(--kk-radius-md); background: var(--kk-color-surface); color: var(--kk-color-text); font-size: max(16px, var(--kk-text-sm)); transition: border-color var(--kk-dur-fast) var(--kk-ease-out), box-shadow var(--kk-dur-fast) var(--kk-ease-out); }
input:not([type="checkbox"]):not([type="radio"]):focus-visible, select:focus-visible, textarea:focus-visible, .kk-input:focus-visible { border-color: var(--kk-color-primary); }
input::placeholder, textarea::placeholder { color: var(--kk-color-text-muted); opacity: 1; }
input[aria-invalid="true"], textarea[aria-invalid="true"], select[aria-invalid="true"] { border-color: var(--kk-color-danger); }
input[type="checkbox"], input[type="radio"] { width: 1.15em; height: 1.15em; accent-color: var(--kk-color-primary); margin: 0 var(--kk-space-2) 0 0; }
textarea { min-height: calc(var(--kk-control-h) * 2.5); resize: vertical; }
label, .kk-label { display: inline-block; font-size: var(--kk-text-sm); font-weight: 500; margin-bottom: var(--kk-space-1); color: var(--kk-color-text); }
.kk-field { display: grid; gap: var(--kk-space-1); margin-bottom: var(--kk-space-4); }
.kk-help { font-size: var(--kk-text-xs); color: var(--kk-color-text-muted); }
.kk-error { font-size: var(--kk-text-xs); color: var(--kk-color-danger); }
.kk-switch { position: relative; display: inline-flex; align-items: center; gap: var(--kk-space-2); min-height: var(--kk-touch); cursor: pointer; }
.kk-switch input { position: absolute; opacity: 0; width: 1px; height: 1px; }
.kk-switch span { width: 44px; height: 24px; border-radius: 999px; background: var(--kk-color-border-strong); position: relative; transition: background var(--kk-dur-fast); flex: none; }
.kk-switch span::after { content: ""; position: absolute; top: 3px; left: 3px; width: 18px; height: 18px; border-radius: 50%; background: #fff; transition: transform var(--kk-dur-fast) var(--kk-ease-out); }
.kk-switch input:checked + span { background: var(--kk-color-primary); }
.kk-switch input:checked + span::after { transform: translateX(20px); }
.kk-switch input:focus-visible + span { outline: 3px solid var(--kk-color-focus); outline-offset: 2px; }`);

  body.push(`/* ---------- surfaces & layout ---------- */
.kk-container { width: 100%; max-width: var(--kk-content-max); margin-inline: auto; padding-inline: max(var(--kk-gutter), var(--kk-safe-left)) max(var(--kk-gutter), var(--kk-safe-right)); }
.kk-prose { max-width: var(--kk-reading-max); }
.kk-stack { display: grid; gap: var(--kk-space-4); }
.kk-cluster { display: flex; flex-wrap: wrap; gap: var(--kk-space-3); align-items: center; }
.kk-grid { display: grid; gap: var(--kk-space-5); grid-template-columns: repeat(auto-fit, minmax(min(100%, 16rem), 1fr)); }
.kk-card, .card, article.kk-card { background: var(--kk-color-surface); color: var(--kk-color-text); border: 1px solid var(--kk-color-border); border-radius: var(--kk-radius-lg); padding: var(--kk-space-5); box-shadow: var(--kk-shadow-sm); min-width: 0; }
.kk-card--elevated { box-shadow: var(--kk-shadow-md); border-color: transparent; }
.kk-card__title { font-family: var(--kk-font-display); font-size: var(--kk-text-lg); font-weight: 600; margin: 0 0 var(--kk-space-2); }
.kk-card__meta { color: var(--kk-color-text-muted); font-size: var(--kk-text-sm); }
.kk-badge { display: inline-flex; width: fit-content; justify-self: start; align-items: center; gap: 0.35em; padding: 0.15em 0.6em; border-radius: var(--kk-radius-full); font-size: var(--kk-text-xs); font-weight: 600; background: var(--kk-color-primary-soft); color: var(--kk-color-primary-text); border: 1px solid transparent; }
.kk-badge--success { background: color-mix(in srgb, var(--kk-color-success) 15%, transparent); color: var(--kk-color-success); }
.kk-badge--warning { background: color-mix(in srgb, var(--kk-color-warning) 15%, transparent); color: var(--kk-color-warning); }
.kk-badge--danger { background: color-mix(in srgb, var(--kk-color-danger) 15%, transparent); color: var(--kk-color-danger); }
@media (forced-colors: active) { .kk-card, .card, .kk-badge { border-color: CanvasText; } }
.kk-skeleton { background: linear-gradient(90deg, var(--kk-color-surface-2), var(--kk-color-border), var(--kk-color-surface-2)); background-size: 200% 100%; border-radius: var(--kk-radius-sm); animation: kk-shimmer 1.4s linear infinite; min-height: 1em; }
@keyframes kk-shimmer { to { background-position: -200% 0; } }
@media (prefers-reduced-motion: reduce) { .kk-skeleton { animation: none; } }`);

  body.push(`/* ---------- navigation & sidebar ---------- */
.kk-nav, nav.kk-nav { display: flex; align-items: center; gap: var(--kk-space-2); flex-wrap: wrap; min-height: calc(var(--kk-touch) + var(--kk-space-2)); padding-block: var(--kk-space-2); padding-top: max(var(--kk-space-2), var(--kk-safe-top)); }
.kk-nav a, .kk-nav button { min-height: var(--kk-touch); display: inline-flex; align-items: center; padding-inline: var(--kk-space-3); border-radius: var(--kk-radius-md); text-decoration: none; color: var(--kk-color-text); font-weight: 500; }
.kk-nav a[aria-current="page"], .kk-nav a.active { color: var(--kk-color-primary-text); background: var(--kk-color-primary-soft); }
.kk-nav a:hover { background: var(--kk-color-surface-2); }
.kk-nav--sticky { position: sticky; top: 0; z-index: var(--kk-z-sticky); background: color-mix(in srgb, var(--kk-color-bg) 92%, transparent); border-bottom: 1px solid var(--kk-color-border); }
.kk-layout { display: grid; grid-template-columns: 1fr; min-height: 100dvh; }
.kk-sidebar, aside.kk-sidebar { background: var(--kk-color-surface); border-right: 1px solid var(--kk-color-border); padding: var(--kk-space-4); display: flex; flex-direction: column; gap: var(--kk-space-1); min-width: 0; }
.kk-sidebar a { display: flex; align-items: center; gap: var(--kk-space-3); min-height: var(--kk-touch); padding-inline: var(--kk-space-3); border-radius: var(--kk-radius-md); text-decoration: none; color: var(--kk-color-text); }
.kk-sidebar a:hover { background: var(--kk-color-surface-2); }
.kk-sidebar a[aria-current="page"] { background: var(--kk-color-primary-soft); color: var(--kk-color-primary-text); font-weight: 600; }
@media (min-width: 1024px) { .kk-layout { grid-template-columns: 16rem minmax(0, 1fr); } .kk-sidebar { position: sticky; top: 0; height: 100dvh; overflow-y: auto; } }
@media (min-width: 2560px) { .kk-layout { grid-template-columns: 20rem minmax(0, 1fr); } }
.kk-tabbar { position: sticky; bottom: 0; z-index: var(--kk-z-sticky); display: flex; justify-content: space-around; background: var(--kk-color-surface); border-top: 1px solid var(--kk-color-border); padding-bottom: var(--kk-safe-bottom); }
.kk-tabbar a { flex: 1; min-height: 56px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; font-size: var(--kk-text-xs); color: var(--kk-color-text-muted); text-decoration: none; }
.kk-tabbar a[aria-current="page"] { color: var(--kk-color-primary-text); }`);

  body.push(`/* ---------- tables ---------- */
.kk-table-wrap { width: 100%; overflow-x: auto; overscroll-behavior-x: contain; -webkit-overflow-scrolling: touch; border: 1px solid var(--kk-color-border); border-radius: var(--kk-radius-md); background: var(--kk-color-surface); }
table, .kk-table { width: 100%; border-collapse: collapse; font-size: var(--kk-text-sm); font-variant-numeric: tabular-nums; }
thead th { position: sticky; top: 0; background: var(--kk-color-surface-2); text-align: left; font-weight: 600; color: var(--kk-color-text-muted); font-size: var(--kk-text-xs); letter-spacing: 0.04em; text-transform: uppercase; z-index: 1; }
th, td { padding: calc((var(--kk-row-h) - 1.4em) / 2) var(--kk-space-3); border-bottom: 1px solid var(--kk-color-border); vertical-align: middle; white-space: nowrap; }
td.kk-wrap, th.kk-wrap { white-space: normal; }
tbody tr:hover { background: var(--kk-color-surface-2); }
tbody tr:last-child td { border-bottom: 0; }
.kk-num { text-align: right; font-variant-numeric: tabular-nums; }`);

  body.push(`/* ---------- modal (native <dialog>) ---------- */
dialog, .kk-modal { border: 1px solid var(--kk-color-border); border-radius: var(--kk-radius-xl); background: var(--kk-color-surface); color: var(--kk-color-text); padding: var(--kk-space-6); width: min(92vw, 32rem); max-height: min(85dvh, 100dvh - var(--kk-safe-top) - var(--kk-safe-bottom)); overflow: auto; box-shadow: var(--kk-shadow-lg); margin: auto; }
dialog::backdrop { background: var(--kk-color-overlay); backdrop-filter: none; }
dialog[open] { animation: kk-pop var(--kk-dur-base) var(--kk-ease-out); }
@keyframes kk-pop { from { opacity: 0; transform: translateY(8px) scale(0.98); } to { opacity: 1; transform: none; } }
.kk-modal__title { font-family: var(--kk-font-display); font-size: var(--kk-text-xl); margin: 0 0 var(--kk-space-3); }
.kk-modal__actions { display: flex; justify-content: flex-end; gap: var(--kk-space-2); margin-top: var(--kk-space-5); flex-wrap: wrap; }
@media (max-width: 480px) { dialog, .kk-modal { width: 100vw; max-width: 100vw; margin: auto 0 0; border-radius: var(--kk-radius-xl) var(--kk-radius-xl) 0 0; padding-bottom: max(var(--kk-space-6), var(--kk-safe-bottom)); } }`);

  body.push(`/* ---------- charts (dependency-free SVG) ---------- */
.kk-chart { display: block; width: 100%; height: auto; font-family: var(--kk-font-body); }
.kk-chart__bar { fill: var(--kk-color-primary); transition: opacity var(--kk-dur-fast); }
.kk-chart__bar:hover, .kk-chart__bar:focus-visible { opacity: 0.8; }
.kk-chart__axis { stroke: var(--kk-color-border-strong); stroke-width: 1; }
.kk-chart__label { fill: var(--kk-color-text-muted); font-size: 11px; }
.kk-chart__line { fill: none; stroke: var(--kk-color-primary); stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
.kk-chart__area { fill: var(--kk-color-primary-soft); }
.kk-chart-legend { display: flex; flex-wrap: wrap; gap: var(--kk-space-3); font-size: var(--kk-text-xs); color: var(--kk-color-text-muted); }
.kk-chart-legend i { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 6px; background: var(--kk-color-primary); }
.kk-stat { display: grid; gap: var(--kk-space-1); } .kk-stat__value { font-family: var(--kk-font-display); font-size: var(--kk-text-2xl); font-weight: 700; font-variant-numeric: tabular-nums; } .kk-stat__label { color: var(--kk-color-text-muted); font-size: var(--kk-text-sm); }`);

  body.push(`/* ---------- carousel (scroll-snap, no dependency) ---------- */
.kk-carousel { display: flex; gap: var(--kk-space-4); overflow-x: auto; scroll-snap-type: x mandatory; overscroll-behavior-x: contain; -webkit-overflow-scrolling: touch; padding-bottom: var(--kk-space-2); scrollbar-width: thin; }
.kk-carousel > * { flex: 0 0 min(85%, 22rem); scroll-snap-align: start; }
.kk-carousel:focus-visible { outline-offset: 4px; }
@media (min-width: 1024px) { .kk-carousel > * { flex-basis: min(45%, 26rem); } }
@media (min-width: 2560px) { .kk-carousel > * { flex-basis: 30rem; } }
.kk-carousel__controls { display: flex; gap: var(--kk-space-2); justify-content: flex-end; margin-top: var(--kk-space-2); }`);

  body.push(`/* ---------- motion & 3D (opt-in, reduced-motion safe, auto-degrading) ---------- */
[data-kk-reveal] { opacity: 1; transform: none; }
html[data-kk-motion="full"] [data-kk-reveal]:not(.kk-in) { opacity: 0; transform: translateY(12px); }
html[data-kk-motion="full"] [data-kk-reveal] { transition: opacity var(--kk-dur-slow) var(--kk-ease-out), transform var(--kk-dur-slow) var(--kk-ease-out); }
html[data-kk-motion="full"] [data-kk-reveal].kk-in { opacity: 1; transform: none; }
[data-kk-parallax] { will-change: auto; }
html[data-kk-motion="full"] [data-kk-parallax] { will-change: transform; }
html:not([data-kk-motion="full"]) [data-kk-parallax] { transform: none !important; }
.kk-3d { perspective: 1200px; }
.kk-3d__object { transform-style: preserve-3d; transition: transform var(--kk-dur-base) var(--kk-ease-out); }
.kk-3d__fallback { display: none; }
html[data-kk-3d="off"] .kk-3d__object, html[data-kk-3d="off"] .kk-3d__webgl { display: none; }
html[data-kk-3d="off"] .kk-3d__fallback, html[data-kk-3d="css"] .kk-3d__fallback--webgl { display: block; }
html[data-kk-3d="css"] .kk-3d__webgl { display: none; }
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0.001ms !important; animation-iteration-count: 1 !important; transition-duration: 0.001ms !important; scroll-behavior: auto !important; }
  .kk-3d__object, .kk-3d__webgl { display: none !important; } .kk-3d__fallback { display: block !important; }
}
@media (update: slow), (prefers-reduced-data: reduce) { .kk-3d__webgl { display: none !important; } .kk-3d__fallback { display: block !important; } }
.kk-micro { transition: transform var(--kk-dur-fast) var(--kk-ease-out), box-shadow var(--kk-dur-fast) var(--kk-ease-out); }
.kk-micro:hover { transform: translateY(-2px); box-shadow: var(--kk-shadow-md); }
@media (hover: none) { .kk-micro:hover { transform: none; box-shadow: var(--kk-shadow-sm); } }`);

  body.push(`/* ---------- device classes: foldables, ultrawide, 4K, print ---------- */
@media (max-width: 320px) { :root { --kk-gutter: var(--kk-space-3); } h1, .kk-h1 { font-size: var(--kk-text-2xl); } .kk-nav { gap: var(--kk-space-1); } }
@media (min-width: 600px) and (max-width: 720px) { .kk-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (horizontal-viewport-segments: 2) { .kk-layout { grid-template-columns: env(viewport-segment-width 0 0) minmax(0, 1fr); } .kk-sidebar { width: env(viewport-segment-width 0 0); } }
@media (min-width: 1920px) { :root { --kk-font-size-base: calc(${tokens.typography.baseSizePx / 16}rem * 1.0625); } }
@media (min-width: 2560px) { :root { --kk-font-size-base: calc(${tokens.typography.baseSizePx / 16}rem * 1.125); --kk-gutter: var(--kk-space-8); } }
@media (min-width: 3840px) { :root { --kk-font-size-base: calc(${tokens.typography.baseSizePx / 16}rem * 1.25); } .kk-container { max-width: min(var(--kk-content-max), 70vw); } }
@media (orientation: landscape) and (max-height: 500px) { .kk-nav--sticky { position: static; } dialog, .kk-modal { max-height: 100dvh; border-radius: 0; width: 100vw; margin: 0; } }
@media print { .kk-nav, .kk-sidebar, .kk-tabbar, dialog { display: none !important; } body { background: #fff; color: #000; } }`);

  if (isApp) body.push(`/* ---------- platform: ${selection.platform} ---------- */
body { padding-top: var(--kk-safe-top); }
button, .kk-btn { min-height: var(--kk-touch); }
.kk-nav, .kk-tabbar { padding-inline: max(var(--kk-space-3), var(--kk-safe-left)) max(var(--kk-space-3), var(--kk-safe-right)); }
${selection.platform === 'ios' ? '.kk-card, .card { border: 0; box-shadow: none; background: var(--kk-color-surface-2); } input, select, textarea { border-radius: var(--kk-radius-lg); }' : selection.platform === 'android-material' ? 'button, .kk-btn { border-radius: var(--kk-radius-full); } .kk-card, .card { box-shadow: var(--kk-shadow-sm); }' : selection.platform === 'windows-fluent' ? 'button, .kk-btn, input, select, textarea, .kk-card, .card { border-radius: var(--kk-radius-sm); } button, .kk-btn { font-weight: 500; }' : ''}`);

  if (remediations.length) {
    body.push(`/* ---------- scan-driven remediations (${remediations.length}) ---------- */\n${remediations.map((r) => `/* ${r.problem}: ${r.note} */\n${r.css}`).join('\n')}`);
  }
  const inner = body.join('\n\n');
  parts.push(layer ? `@layer ${layer} {\n${inner}\n}` : inner);
  return parts.join('\n\n') + '\n';
}

/** Derive selector-level remediations from the scan (only for CSS files we can read). */
export function deriveRemediations(scan) {
  const out = [];
  const files = scan?._files || []; // populated by the adapter (content of style files)
  const seen = new Set();
  for (const f of files) {
    const rules = [...f.content.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
    for (const [, selRaw, decl] of rules) {
      const sel = selRaw.trim().replace(/\s+/g, ' ');
      if (!sel || sel.startsWith('@') || sel.length > 120 || /[@%]/.test(sel)) continue;
      const key = (id) => `${id}|${sel}`;
      if (/\b100vh\b/.test(decl) && !seen.has(key('vh'))) { seen.add(key('vh')); out.push({ problem: 'vh-mobile-bug', note: `${f.rel}: 100vh → dynamic viewport height`, css: `@supports (height: 100dvh) { ${sel} { ${/min-height\s*:\s*100vh/.test(decl) ? 'min-height: 100dvh;' : 'height: 100dvh;'} } }` }); }
      if (/position\s*:\s*fixed/.test(decl) && /bottom\s*:\s*0/.test(decl) && !seen.has(key('safe'))) { seen.add(key('safe')); out.push({ problem: 'fixed-bottom-no-safe-area', note: `${f.rel}: honour safe-area inset`, css: `${sel} { padding-bottom: max(var(--kk-space-5), var(--kk-safe-bottom)); }` }); }
      if (/outline\s*:\s*(none|0)/.test(decl) && !seen.has(key('focus'))) { seen.add(key('focus')); out.push({ problem: 'focus-removed', note: `${f.rel}: restore visible focus`, css: `${sel}:focus-visible { outline: 3px solid var(--kk-color-focus) !important; outline-offset: 2px; }` }); }
      if (/animation\s*:[^;]*\binfinite\b/.test(decl) && !seen.has(key('inf'))) { seen.add(key('inf')); out.push({ problem: 'infinite-animation', note: `${f.rel}: pause under reduced motion`, css: `@media (prefers-reduced-motion: reduce) { ${sel} { animation: none !important; } }` }); }
      if (/backdrop-filter/.test(decl) && !seen.has(key('blur'))) { seen.add(key('blur')); out.push({ problem: 'blur-overuse', note: `${f.rel}: drop blur on low-power/reduced-data devices`, css: `@media (update: slow), (prefers-reduced-data: reduce) { ${sel} { backdrop-filter: none; -webkit-backdrop-filter: none; } }` }); }
      const wpx = /(?<![-\w])width\s*:\s*(\d+)px/.exec(decl);
      if (wpx && +wpx[1] >= 600 && !seen.has(key('w'))) { seen.add(key('w')); out.push({ problem: 'fixed-width-overflow', note: `${f.rel}: ${wpx[1]}px fixed width capped to the viewport`, css: `${sel} { max-width: 100%; }` }); }
      if (/display\s*:\s*(inline-)?flex/.test(decl) && !/flex-wrap/.test(decl) && !/flex-direction\s*:\s*column/.test(decl) && !seen.has(key('wrap'))) { seen.add(key('wrap')); out.push({ problem: 'flex-no-wrap', note: `${f.rel}: allow wrapping on narrow screens`, css: `@media (max-width: 640px) { ${sel} { flex-wrap: wrap; } }` }); }
      const bgm = /background(?:-color)?\s*:\s*(#[0-9a-f]{3,8}|var\(--[\w-]+\))\s*[;}]?/i.exec(decl);
      if (bgm && scan?.brand?.primaryColor && !seen.has(key('bg'))) {
        const raw = bgm[1].startsWith('var(') ? (scan?.colors?.variables?.[bgm[1].slice(4, -1)] || null) : bgm[1];
        if (raw && parseColor(raw) && sameHex(raw, scan.brand.primaryColor)) { seen.add(key('bg')); out.push({ problem: 'brand-background-contrast', note: `${f.rel}: brand-filled surface uses the AA-validated primary/on-primary pair`, css: `${sel} { background-color: var(--kk-color-primary); color: var(--kk-color-on-primary); }` }); }
      }
      const col = /(?<![-\w])color\s*:\s*(#[0-9a-f]{3,8}|var\(--[\w-]+\))\s*[;}]?/i.exec(decl);
      if (col && !/background/.test(decl) && !seen.has(key('col'))) {
        const raw = col[1].startsWith('var(') ? (scan?.colors?.variables?.[col[1].slice(4, -1)] || null) : col[1];
        const brand = scan?.brand?.primaryColor;
        if (raw && brand && parseColor(raw) && contrastRatio(raw, '#ffffff') < 4.5 && sameHex(raw, brand)) { seen.add(key('col')); out.push({ problem: 'brand-text-contrast', note: `${f.rel}: brand colour as text darkened to the AA-safe primary-text token`, css: `${sel} { color: var(--kk-color-primary-text); }` }); }
        else if (raw && parseColor(raw) && saturationOf(raw) < 0.15 && lightnessOf(raw) > 0.35 && lightnessOf(raw) < 0.75 && contrastRatio(raw, '#ffffff') < 4.5) { seen.add(key('col')); out.push({ problem: 'low-contrast-text', note: `${f.rel}: muted grey ${raw} fails AA on light surfaces`, css: `${sel} { color: var(--kk-color-text-muted); }` }); }
      }
      const fs = /font-size\s*:\s*(\d+(?:\.\d+)?)px/.exec(decl);
      if (fs && +fs[1] < 12 && !seen.has(key('fs'))) { seen.add(key('fs')); out.push({ problem: 'tiny-text', note: `${f.rel}: raise ${fs[1]}px to readable floor`, css: `${sel} { font-size: max(12px, 0.75rem); }` }); }
    }
  }
  return out.slice(0, 80);
}
function sameHex(a, b) { const x = parseColor(a), y = parseColor(b); if (!x || !y) return false; return Math.abs(x.r - y.r) + Math.abs(x.g - y.g) + Math.abs(x.b - y.b) < 24; }
