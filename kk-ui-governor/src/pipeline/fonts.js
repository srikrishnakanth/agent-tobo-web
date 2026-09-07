// Google Fonts → inline @font-face rules. Fetched at adapt time (Node fetch honours the host proxy),
// cached under DESIGN-VAULT/cache/fonts so re-runs are offline-capable. Font binaries stay on
// fonts.gstatic.com (OFL permits this); nothing is vendored. Falls back to `@import url()` when offline.
import path from 'node:path';
import fsp from 'node:fs/promises';
import { sha256, atomicWrite, exists } from '../core/fsutil.js';

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

export async function fetchGoogleFontFaces(url, { cacheDir, timeoutMs = 8000, logger } = {}) {
  if (!url) return null;
  const cacheFile = cacheDir ? path.join(cacheDir, 'fonts', sha256(url).slice(0, 16) + '.css') : null;
  if (cacheFile && (await exists(cacheFile))) return fsp.readFile(cacheFile, 'utf8');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/css,*/*;q=0.1' }, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    let css = await res.text();
    if (!/@font-face/.test(css)) throw new Error('no @font-face rules in response');
    // `optional` never causes a layout shift: the font is used only when it is available within the block period
    // (it always is after the first visit thanks to the HTTP cache), otherwise the fallback stack stays.
    css = css.replace(/font-display:\s*swap/g, 'font-display: optional');
    css = `/* @font-face rules fetched from ${url} — families licensed under the SIL Open Font License 1.1; files served by fonts.gstatic.com */\n${css.trim()}\n`;
    if (cacheFile) await atomicWrite(cacheFile, css);
    return css;
  } catch (e) {
    logger?.warn(`google fonts unavailable (${e.message}); falling back to @import url() with system font fallbacks`);
    return null;
  } finally { clearTimeout(timer); }
}
