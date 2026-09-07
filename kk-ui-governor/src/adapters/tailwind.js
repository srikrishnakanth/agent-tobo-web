// Tailwind CSS stack adapter (mixin used by the HTML / React / Next.js adapters).
// v4: tokens exposed via `@theme inline` so utilities like bg-kk-primary work; theme imported
//     right after `@import "tailwindcss"` (imports must stay at the top of the sheet).
// v3: theme imported at the top of the globals file (postcss-import) and wrapped in
//     `@layer components` so preflight (base layer) never overrides it.
import path from 'node:path';

export function tailwindInfo(scan) {
  const tw = (scan.cssStack || []).find((c) => c.name === 'tailwind');
  if (!tw) return { active: false };
  const active = !!(tw.globalsFile || tw.configFile);
  return { active, version: tw.version, globalsFile: tw.globalsFile, configFile: tw.configFile };
}

/** Compute the injection into the globals CSS file for the given Tailwind version. */
export async function tailwindInjection(adapter, scan, tw, designDirRelToGlobals, file = 'theme.css') {
  if (!tw.globalsFile) return null;
  const importLine = `@import "${designDirRelToGlobals}/${file}";`;
  if (tw.version === '4') {
    return adapter.injectOp(scan.root, tw.globalsFile, { kind: 'css', block: importLine, anchor: { after: /^\s*@import\s+["'][^"']+["'][^;]*;\s*$/m }, position: 'start' });
  }
  return adapter.injectOp(scan.root, tw.globalsFile, { kind: 'css', block: importLine, position: 'start' });
}

export function relImport(fromFileRel, toDirRel) {
  let r = path.posix.relative(path.posix.dirname(fromFileRel), toDirRel);
  if (!r.startsWith('.')) r = './' + r;
  return r;
}

/** Tailwind v4 `@theme inline` bridge: exposes governor tokens as utilities (bg-kk-primary, text-kk-text, font-kk-display …). */
export function emitTailwindBridge(tokens) {
  return `/* KK-UI-GOVERNOR Tailwind v4 bridge — generated ${tokens.meta.generatedAt}. Imported from the Tailwind sheet so utilities resolve to the governor tokens defined in theme.css/tokens.css. */
@theme inline {
  --color-kk-bg: var(--kk-color-bg); --color-kk-surface: var(--kk-color-surface); --color-kk-surface-2: var(--kk-color-surface-2); --color-kk-border: var(--kk-color-border);
  --color-kk-text: var(--kk-color-text); --color-kk-muted: var(--kk-color-text-muted); --color-kk-primary: var(--kk-color-primary); --color-kk-on-primary: var(--kk-color-on-primary); --color-kk-accent: var(--kk-color-accent); --color-kk-focus: var(--kk-color-focus);
  --color-kk-success: var(--kk-color-success); --color-kk-warning: var(--kk-color-warning); --color-kk-danger: var(--kk-color-danger);
  --font-kk-display: var(--kk-font-display); --font-kk-body: var(--kk-font-body); --font-kk-mono: var(--kk-font-mono);
  --radius-kk-sm: var(--kk-radius-sm); --radius-kk-md: var(--kk-radius-md); --radius-kk-lg: var(--kk-radius-lg); --radius-kk-xl: var(--kk-radius-xl);
  --shadow-kk-sm: var(--kk-shadow-sm); --shadow-kk-md: var(--kk-shadow-md); --shadow-kk-lg: var(--kk-shadow-lg);
}
`;
}
