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
export async function tailwindInjection(adapter, scan, tw, designDirRelToGlobals) {
  if (!tw.globalsFile) return null;
  const importLine = `@import "${designDirRelToGlobals}/theme.css";`;
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
