// Verification suite runner. Drives Playwright/Chromium through the device matrix and turns raw
// page measurements into the mandatory quality-gate checks. Supports a baseline run (current
// project) so a candidate is judged on "never worse + guarantees kept", and a static fallback
// when no browser/server is available (clearly reported as such).
import path from 'node:path';
import fsp from 'node:fs/promises';
import { createRequire } from 'node:module';
import { planDevices } from './devices.js';
import { pageProbe, initScript } from './browser-probe.js';
import { contrastRatio, parseColor } from '../intelligence/color.js';

const require = createRequire(import.meta.url);

export const browserDiagnostics = { attempts: [], resolvedFrom: null, lastError: null };

export async function loadPlaywright(projectRoot = null) {
  const candidates = ['playwright', 'playwright-core'];
  // Project-local install (most common for a real project).
  if (projectRoot) candidates.push(path.join(projectRoot, 'node_modules', 'playwright'), path.join(projectRoot, 'node_modules', 'playwright-core'));
  // Global installs, per platform. npm on Windows puts globals under %APPDATA%\npm\node_modules.
  if (process.platform === 'win32') {
    if (process.env.APPDATA) candidates.push(path.join(process.env.APPDATA, 'npm', 'node_modules', 'playwright'));
    candidates.push(path.join(path.dirname(process.execPath), 'node_modules', 'playwright'));
  } else {
    candidates.push('/opt/node22/lib/node_modules/playwright', '/usr/lib/node_modules/playwright', '/usr/local/lib/node_modules/playwright');
  }
  candidates.push(path.join(process.execPath, '..', '..', 'lib', 'node_modules', 'playwright'));
  browserDiagnostics.attempts = [];
  for (const c of candidates) {
    try { const m = require(c); if (m.chromium) { browserDiagnostics.resolvedFrom = c; return m; } }
    catch (e) { browserDiagnostics.attempts.push(`${c}: ${String(e.code || e.message).slice(0, 80)}`); }
  }
  return null;
}

export async function launchBrowser(projectRoot = null) {
  const pw = await loadPlaywright(projectRoot);
  if (!pw) throw new Error(`Playwright is not installed. Run "npm install -D playwright && npx playwright install chromium" in the project, or install it globally. Looked in:\n  ${browserDiagnostics.attempts.join('\n  ')}`);
  const opts = { headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] };
  // The browser talks to local dev servers directly. External resources (fonts/CDNs) are relayed
  // through Node's fetch (see installRelay), which honours the host's proxy/CA configuration.
  if (process.env.KKGOV_BROWSER_PROXY && process.env.KKGOV_BROWSER_PROXY !== 'off') opts.proxy = { server: process.env.KKGOV_BROWSER_PROXY, bypass: 'localhost,127.0.0.1' };
  try { return await pw.chromium.launch(opts); }
  catch (e) {
    browserDiagnostics.lastError = String(e.message || e).split('\n')[0];
    const exe = process.env.KKGOV_CHROMIUM;
    if (exe) {
      try { return await pw.chromium.launch({ ...opts, executablePath: exe }); }
      catch (e2) { throw new Error(`Chromium failed to launch (${browserDiagnostics.lastError}); KKGOV_CHROMIUM=${exe} also failed: ${String(e2.message).split('\n')[0]}`); }
    }
    if (process.platform !== 'win32') {
      try { return await pw.chromium.launch({ ...opts, executablePath: '/opt/pw-browsers/chromium' }); } catch { /* fall through to the real error */ }
    }
    throw new Error(`Chromium failed to launch: ${browserDiagnostics.lastError}. Run "npx playwright install chromium", or set KKGOV_CHROMIUM to a Chrome/Chromium executable.`);
  }
}

// ---------------------------------------------------------------- external resource relay
// Sandboxed cloud hosts often let Node reach the internet (via a proxy) while the browser cannot.
// The relay serves external requests from Node's fetch so fonts/CDNs load realistically.
const relayCache = new Map();
export async function installRelay(context, { timeoutMs = 8000, originHost = null } = {}) {
  if (process.env.KKGOV_EXTERNAL_RELAY === 'off') return;
  // Relay only genuinely third-party hosts (fonts, CDNs). The origin under test must be fetched by
  // the browser itself: replaying it through Node would bypass its real delivery path - redirects,
  // caching headers, cookies, CDN behaviour - and would not be a test of that deployment at all.
  // KKGOV_RELAY_ORIGIN=1 also relays the origin under test. Needed only in sandboxes/CI where the
  // browser itself has no outbound network. It means the deployment's real delivery path (redirects,
  // caching, CDN, cookies) is NOT exercised, so the run is reported as relayed rather than live.
  const relayOrigin = process.env.KKGOV_RELAY_ORIGIN === '1';
  const isThirdParty = (url) => /^https?:$/.test(url.protocol)
    && !/^(127\.0\.0\.1|localhost)$/.test(url.hostname)
    && (relayOrigin || !originHost || url.host !== originHost);
  await context.route(isThirdParty, async (route, request) => {
    const url = request.url();
    if (request.method() !== 'GET') return route.continue();
    try {
      let entry = relayCache.get(url);
      if (!entry) {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), timeoutMs);
        try {
          const res = await fetch(url, { headers: { 'user-agent': request.headers()['user-agent'] || 'Mozilla/5.0', accept: request.headers().accept || '*/*' }, signal: ctrl.signal, redirect: 'follow' });
          const body = Buffer.from(await res.arrayBuffer());
          entry = { status: res.status, contentType: res.headers.get('content-type') || 'application/octet-stream', body };
        } finally { clearTimeout(timer); }
        if (relayCache.size < 500) relayCache.set(url, entry);
      }
      await route.fulfill({ status: entry.status, headers: { 'content-type': entry.contentType, 'access-control-allow-origin': '*', 'cache-control': 'no-store' }, body: entry.body });
    } catch (e) {
      await route.abort('failed').catch(() => {});
    }
  });
}

export async function newVerifiedContext(browser, options, { originHost = null } = {}) {
  const ctx = await browser.newContext(options);
  await installRelay(ctx, { originHost });
  return ctx;
}

export async function browserAvailable(projectRoot = null) {
  try { const b = await launchBrowser(projectRoot); await b.close(); return true; }
  catch (e) { browserDiagnostics.lastError = String(e.message || e); return false; }
}

// Checks the Governor guarantees regardless of the project's prior state.
const ABSOLUTE = new Set(['FOCUS-VISIBLE', 'REDUCED-MOTION', 'ANIM-3D-FALLBACK', 'FORCED-COLORS']);

/**
 * @param {object} o { baseUrl, pages, mode, outDir, baseline?, logger, label }
 * @returns verification result
 */
export async function runVerification({ baseUrl, pages, guardPages = [], mode = 'standard', outDir, baseline = null, logger, label = 'candidate', screenshots = true, themeMode = 'auto', scopeSelector = null, scopeAutoApplied = true, projectRoot = null, storageState = null }) {
  // A trailing slash would produce '//route' once a route is appended.
  baseUrl = String(baseUrl).replace(/\/+$/, '');
  let originHost = null;
  try { originHost = new URL(baseUrl).host; } catch { /* leave null: everything counts as external */ }
  const devices = planDevices(mode);
  await fsp.mkdir(outDir, { recursive: true });
  const browser = await launchBrowser(projectRoot);
  const version = browser.version();
  const raw = []; // { device, page, probe, console, keyboard, screenshot }
  let log_guards = null;
  const started = Date.now();
  try {
    // Warm-up (dev servers compile on first request)
    for (const p of pages) { const ctx = await newVerifiedContext(browser, {}, { originHost }); const pg = await ctx.newPage(); try { await pg.goto(baseUrl + p, { waitUntil: 'load', timeout: 180000 }); } catch (e) { logger?.warn(`warm-up ${p}: ${e.message}`); } await ctx.close(); }
    for (const d of devices) {
      for (const p of pages) {
        const r = await measure(browser, d, baseUrl + p, { outDir, label, screenshots, logger, originHost, storageState });
        raw.push({ deviceId: d.id, device: d, page: p, ...r });
      }
    }
    if (guardPages.length) {
      log_guards = await measureGuards(browser, guardPages, baseUrl, { logger });
      logger?.info(`captured style signatures for ${guardPages.length} guard route(s)`);
    }
  } finally { await browser.close(); }
  const baselineComparability = baselineIsComparable(baseline, raw);
  if (!baselineComparability.ok) logger?.warn(`baseline not comparable: ${baselineComparability.reason}`);
  const checks = evaluate(raw, baseline, { themeMode, scopeSelector, scopeAutoApplied });
  const perDevice = devices.map((d) => {
    const rs = raw.filter((r) => r.deviceId === d.id);
    const failed = rs.some((r) => r.error);
    const problems = checks.flatMap((c) => c.findings.filter((f) => f.device === d.id && f.severity === 'fail'));
    return { id: d.id, label: d.label, width: d.width, height: d.height, dpr: d.dpr, colorScheme: d.colorScheme, flags: d.flags, status: failed ? 'fail' : problems.length ? 'fail' : 'pass', note: failed ? rs.find((r) => r.error)?.error : problems.length ? `${problems.length} failing finding(s)` : '', screenshots: rs.filter((r) => r.screenshot).map((r) => ({ file: r.screenshot, label: `${p(r.page)} ${d.width}×${d.height}@${d.dpr} ${d.colorScheme}${d.flags.length ? ' ' + d.flags.join(',') : ''}` })) };
  });
  const failed = checks.filter((c) => c.status === 'fail');
  return { ok: failed.length === 0, mode, engine: `chromium ${version} (playwright)`, pages, guardPages, guards: log_guards, devices: perDevice, checks, durationMs: Date.now() - started, loads: raw.length, errors: raw.filter((r) => r.error).length, counts: Object.fromEntries(checks.map((c) => [c.id, c.count])) };
}
function p(page) { return page === '/' ? 'home' : page.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, ''); }

async function measure(browser, d, url, { outDir, label, screenshots, logger, originHost, storageState }) {
  const ctx = await newVerifiedContext(browser, { viewport: { width: d.width, height: d.height }, deviceScaleFactor: d.dpr, isMobile: d.isMobile, hasTouch: d.hasTouch, colorScheme: d.colorScheme, reducedMotion: d.reducedMotion, forcedColors: d.forcedColors, ignoreHTTPSErrors: true, ...(storageState ? { storageState } : {}) }, { originHost });
  const page = await ctx.newPage();
  const consoleErrors = [];
  const external = [];
  // "External" means a different origin than the one being verified. Against a live deployment the
  // site's own host is first-party, so its failures must surface as real errors.
  const isExternal = (u) => { try { const h = new URL(u).host; return !!h && h !== originHost; } catch { return false; } };
  page.on('console', (m) => { if (m.type() !== 'error') return; const u = m.location()?.url || ''; const text = m.text().slice(0, 300); if (/Failed to load resource/.test(text) && isExternal(u)) external.push(`${text} (${u.slice(0, 120)})`); else consoleErrors.push(text + (u && isExternal(u) ? ` (${u.slice(0, 100)})` : '')); });
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + String(e.message || e).slice(0, 300)));
  page.on('requestfailed', (r) => { const f = r.failure()?.errorText || ''; if (/net::ERR_ABORTED|BLOCKED_BY_CLIENT/.test(f)) return; if (isExternal(r.url())) external.push(`requestfailed: ${r.url().slice(0, 120)} ${f}`); else consoleErrors.push(`requestfailed: ${r.url().slice(0, 120)} ${f}`); });
  await page.addInitScript(initScript, { lowEnd: !!d.lowEnd, fontScale: d.fontScale || 1 });
  const out = { console: consoleErrors, external };
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 120000 });
    // A dev server (Next especially) answers the first request before the route has finished
    // compiling, so the document can still be empty here. Measuring that produces a page with no
    // elements and therefore no findings - which then reads as a pristine baseline and turns every
    // real pre-existing problem into a false "regression" against the candidate.
    try {
      await page.waitForFunction(() => document.body && document.body.children.length > 0 && document.body.innerText.trim().length > 0, null, { timeout: 20000 });
    } catch { /* genuinely empty page: recorded below as a thin document */ }
    await page.waitForTimeout(d.deep ? 900 : 300);
    // scroll to bottom & back to trigger lazy content + CLS + reveals
    await page.evaluate(async () => { const h = document.documentElement.scrollHeight; for (let y = 0; y < h; y += 600) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 30)); } window.scrollTo(0, 0); });
    await page.waitForTimeout(d.deep ? 500 : 100);
    out.probe = await page.evaluate(pageProbe, {});
    out.documentWeight = { nodes: out.probe.perf?.domNodes ?? 0, interactive: (out.probe.interactive || []).length, text: (out.probe.text || []).length };
    if (d.deep && !d.hasTouch && d.forcedColors === 'none' && !d.fontScale) out.keyboard = await keyboardTest(page);
    if (screenshots) {
      const file = path.join(outDir, `${label}-${p(new URL(url).pathname)}-${d.id}.jpg`);
      await page.screenshot({ path: file, type: 'jpeg', quality: d.width > 2000 ? 40 : 55, scale: 'css', fullPage: false });
      out.screenshot = file;
    }
  } catch (e) { out.error = String(e.message || e).split('\n')[0].slice(0, 300); logger?.warn(`${d.id} ${url}: ${out.error}`); }
  finally { await ctx.close(); }
  return out;
}

async function keyboardTest(page) {
  const steps = [];
  const seen = new Set();
  await page.evaluate(() => { document.body.focus(); window.scrollTo(0, 0); });
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab');
    const info = await page.evaluate(() => {
      const el = document.activeElement; if (!el || el === document.body) return null;
      const cs = getComputedStyle(el);
      const focused = { outlineStyle: cs.outlineStyle, outlineWidth: cs.outlineWidth, outlineColor: cs.outlineColor, boxShadow: cs.boxShadow, borderColor: cs.borderColor, background: cs.backgroundColor };
      el.blur(); const cb = getComputedStyle(el); const blurred = { outlineStyle: cb.outlineStyle, outlineWidth: cb.outlineWidth, boxShadow: cb.boxShadow, borderColor: cb.borderColor, background: cb.backgroundColor }; el.focus();
      const r = el.getBoundingClientRect();
      const d = `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/)[0] : ''} "${(el.textContent || el.getAttribute('aria-label') || el.getAttribute('placeholder') || '').trim().slice(0, 20)}"`;
      const visible = r.width > 0 && r.height > 0 && cs.visibility !== 'hidden';
      const hasOutline = focused.outlineStyle !== 'none' && parseFloat(focused.outlineWidth) > 0;
      const indicator = hasOutline || (focused.boxShadow !== 'none' && focused.boxShadow !== blurred.boxShadow) || focused.borderColor !== blurred.borderColor || focused.background !== blurred.background;
      return { d, visible, indicator, inViewport: r.bottom > 0 && r.top < window.innerHeight };
    });
    if (!info) { if (i > 3) break; continue; }
    if (seen.has(info.d) && steps.length > 2) break; // cycled
    seen.add(info.d);
    steps.push(info);
  }
  return { steps, focusable: steps.length, missingIndicator: steps.filter((s) => s.visible && !s.indicator).map((s) => s.d), invisibleFocus: steps.filter((s) => !s.visible).map((s) => s.d) };
}

/**
 * Style signature of a page: an ordered digest of the computed styling of every rendered element.
 * Used to PROVE that routes outside the upgraded scope did not change. Deliberately excludes
 * geometry (which can vary with scrollbars/fonts loading) and includes only declared visual styling.
 */
export function styleSignatureProbe() {
  const props = ['font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing', 'color',
    'background-color', 'border-top-width', 'border-top-color', 'border-radius', 'padding-top',
    'padding-left', 'margin-top', 'box-shadow', 'text-transform', 'opacity', 'display'];
  const out = [];
  const els = document.querySelectorAll('body, body *');
  for (let i = 0; i < els.length && out.length < 1200; i++) {
    const el = els[i];
    if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'LINK', 'META'].includes(el.tagName)) continue;
    const cs = getComputedStyle(el);
    const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/).slice(0, 3).join('.') : '';
    out.push(`${el.tagName.toLowerCase()}${cls ? '.' + cls : ''}|` + props.map((p) => cs.getPropertyValue(p)).join('|'));
  }
  return out;
}

/** Collect style signatures for guard routes (routes that must NOT change). */
export async function measureGuards(browser, pages, baseUrl, { devices = [{ id: 'guard-desktop', width: 1280, height: 800, dpr: 1, isMobile: false }, { id: 'guard-phone', width: 390, height: 844, dpr: 2, isMobile: true }], logger, originHost = null, storageState = null } = {}) {
  const guards = {};
  for (const p of pages) {
    guards[p] = {};
    for (const d of devices) {
      const ctx = await newVerifiedContext(browser, { viewport: { width: d.width, height: d.height }, deviceScaleFactor: d.dpr, isMobile: d.isMobile, hasTouch: d.isMobile, ignoreHTTPSErrors: true, ...(storageState ? { storageState } : {}) }, { originHost });
      const page = await ctx.newPage();
      try {
        const resp = await page.goto(baseUrl + p, { waitUntil: 'load', timeout: 120000 });
        await page.waitForTimeout(600);
        // Record WHERE we actually landed. A protected route that redirects to a login page would
        // otherwise be compared against itself and reported as proof the dashboard did not change.
        guards[p][d.id] = {
          signature: await page.evaluate(styleSignatureProbe),
          requested: p,
          finalPath: normalizeRoutePath(page.url()),
          status: resp ? resp.status() : null,
        };
      } catch (e) {
        guards[p][d.id] = { error: String(e.message || e).slice(0, 200) };
        logger?.warn(`guard ${p} ${d.id}: ${e.message}`);
      } finally { await ctx.close(); }
    }
  }
  return guards;
}

/** Path of a URL, normalised so benign differences (trailing slash, query, hash, locale prefix) do not read as a redirect. */
export function normalizeRoutePath(u) {
  let path;
  try { path = new URL(u, 'http://x').pathname; } catch { path = String(u); }
  path = path.replace(/\/+$/, '') || '/';
  // Drop a leading locale segment (/en, /en-GB) so i18n prefixes are not mistaken for a redirect.
  path = path.replace(/^\/[a-z]{2}(-[A-Za-z]{2})?(?=\/|$)/, '') || '/';
  return path;
}

/** Compare baseline vs candidate guard signatures. Any difference means a route outside the scope changed. */
export function compareGuards(before, after) {
  const findings = [];
  let compared = 0;
  const redirected = [];
  for (const page of Object.keys(before || {})) {
    for (const device of Object.keys(before[page] || {})) {
      const a = before[page][device], b = after?.[page]?.[device];
      const sigOf = (x) => (Array.isArray(x) ? x : x && Array.isArray(x.signature) ? x.signature : null);
      const sa = sigOf(a), sb = sigOf(b);
      if (!sa || !sb) { findings.push({ page, device, severity: 'warn', message: `guard signature unavailable (${!sa ? 'baseline' : 'candidate'} failed to load)` }); continue; }

      // Did we actually reach the route? A middleware redirect to /login ends at HTTP 200, so the
      // status alone proves nothing - the landing path is what matters.
      const meta = (x) => (Array.isArray(x) ? {} : x || {});
      const ma = meta(a), mb = meta(b);
      const want = ma.requested !== undefined ? normalizeRoutePath(ma.requested) : null;
      const offRoute = (m) => m.finalPath !== undefined && want !== null && m.finalPath !== want;
      const badStatus = (m) => typeof m.status === 'number' && (m.status < 200 || m.status >= 300);
      if (offRoute(ma) || offRoute(mb)) {
        redirected.push({ route: page, baselineFinal: ma.finalPath, candidateFinal: mb.finalPath });
        findings.push({ page, device, severity: 'warn', message: `never reached: ${want} redirected to ${ma.finalPath || mb.finalPath} (likely an auth guard). Nothing about this route was proven - supply --auth-storage-state to sign in.` });
        continue;
      }
      if (badStatus(ma) || badStatus(mb)) {
        findings.push({ page, device, severity: 'warn', message: `not a rendered page: HTTP ${ma.status ?? mb.status} for ${want}. Nothing about this route was proven.` });
        continue;
      }
      if (ma.finalPath !== undefined && mb.finalPath !== undefined && ma.finalPath !== mb.finalPath) {
        findings.push({ page, device, severity: 'fail', message: `route resolved differently before and after: ${ma.finalPath} -> ${mb.finalPath}` });
        continue;
      }

      compared++;
      if (sa.length !== sb.length) { findings.push({ page, device, severity: 'fail', message: `element count changed: ${sa.length} -> ${sb.length}` }); continue; }
      const diffs = [];
      for (let i = 0; i < sa.length; i++) if (sa[i] !== sb[i]) diffs.push({ index: i, before: sa[i].slice(0, 160), after: sb[i].slice(0, 160) });
      if (diffs.length) findings.push({ page, device, severity: 'fail', message: `${diffs.length} element(s) restyled on a route that must not change`, examples: diffs.slice(0, 4) });
    }
  }
  return { compared, findings, redirected };
}

// ------------------------------------------------------------------------------- evaluation
/**
 * Was the baseline a real measurement? A dev server that had not finished compiling returns an empty
 * document, which yields zero findings everywhere and would make every genuine pre-existing problem
 * look like a regression introduced by the candidate.
 */
export function baselineIsComparable(baseline, raw) {
  if (!baseline || !baseline.weights) return { ok: true, reason: null };
  const cand = {};
  for (const r of raw) if (r.documentWeight) cand[`${r.deviceId}|${r.page}`] = r.documentWeight;
  const thin = [];
  for (const [key, w] of Object.entries(baseline.weights)) {
    const c = cand[key];
    if (!c) continue;
    // Treat the baseline as unusable for this page/device if it saw a small fraction of the document.
    if (c.nodes > 20 && w.nodes < Math.max(10, c.nodes * 0.5)) thin.push({ key, baselineNodes: w.nodes, candidateNodes: c.nodes });
  }
  return thin.length ? { ok: false, reason: `baseline measured a much smaller document on ${thin.length} page/device pair(s) (e.g. ${thin[0].key}: ${thin[0].baselineNodes} vs ${thin[0].candidateNodes} nodes) - the server had probably not finished compiling`, thin } : { ok: true, reason: null };
}

export function evaluate(raw, baseline, { themeMode = 'auto', scopeSelector = null, scopeAutoApplied = true } = {}) {
  // If the baseline is not comparable, ignore its counts entirely rather than reporting phantom
  // regressions. Governor guarantees still apply absolutely.
  const comparability = baselineIsComparable(baseline, raw);
  if (!comparability.ok) baseline = { ...baseline, counts: {}, unreliable: comparability.reason };
  const F = []; // findings
  const add = (check, device, page, severity, message, data) => F.push({ check, device, page, severity, message, ...(data ? { data } : {}) });
  const ok = raw.filter((r) => r.probe);
  for (const r of raw) if (r.error) add('LOAD', r.deviceId, r.page, 'fail', `page failed to load/measure: ${r.error}`);
  for (const r of ok) {
    const d = r.device, pr = r.probe, flags = d.flags;
    const touch = d.hasTouch;
    // responsive / overflow
    if (pr.overflow.horizontal) add(flags.includes('font-200') ? 'FONT-200' : flags.includes('foldable') ? 'FOLDABLE' : flags.includes('portrait') || flags.includes('landscape') ? 'MOBILE-ORIENT' : 'RESP-SWEEP', r.deviceId, r.page, 'fail', `horizontal overflow: scrollWidth ${pr.overflow.scrollWidth} > viewport ${pr.overflow.clientWidth}`, { culprits: pr.overflow.culprits });
    if (pr.overflow.horizontal && d.deep) add('OVERFLOW', r.deviceId, r.page, 'fail', `overflow culprits: ${pr.overflow.culprits.slice(0, 3).join(' | ') || 'unknown'}`);
    // DPR sanity
    if (flags.includes('hidpi') && Math.abs(pr.viewport.dpr - d.dpr) > 0.01) add('DPR', r.deviceId, r.page, 'fail', `DPR mismatch ${pr.viewport.dpr} vs ${d.dpr}`);
    // contrast (deep, known bg only)
    if (d.deep && d.forcedColors === 'none') {
      const bad = [];
      for (const t of pr.text) {
        if (!t.bgKnown || !t.bg) continue;
        const fg = parseColor(t.color), bg = parseColor(t.bg); if (!fg || !bg) continue;
        if (fg.a < 1) { fg.r = fg.r * fg.a + bg.r * (1 - fg.a); fg.g = fg.g * fg.a + bg.g * (1 - fg.a); fg.b = fg.b * fg.a + bg.b * (1 - fg.a); }
        const ratio = contrastRatio(fg, bg);
        const large = t.fontSize >= 24 || (t.fontSize >= 18.66 && t.fontWeight >= 700);
        if (ratio < (large ? 3 : 4.5)) bad.push({ text: t.text, tag: t.tag, cls: t.cls, ratio: +ratio.toFixed(2), fg: t.color, bg: t.bg, size: t.fontSize });
      }
      for (const b of bad.slice(0, 40)) add('CONTRAST', r.deviceId, r.page, 'fail', `${b.tag}${b.cls ? '.' + b.cls.split(' ')[0] : ''} "${b.text}" ${b.ratio}:1 (${b.fg} on ${b.bg}, ${b.size}px)`);
      // theme applied? (dark devices should have a dark body background when the page supports schemes)
      if (flags.includes('dark') && (themeMode === 'auto' || themeMode === 'dark')) { const bodyBg = pr.bodyBg || pr.text.find((t) => t.bgKnown)?.bg; if (bodyBg) { const c = parseColor(bodyBg); const lum = c ? (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255 : 1; if (lum > 0.7) add('THEME', r.deviceId, r.page, 'warn', `dark scheme requested but dominant surface is light (${bodyBg})`); } }
      // tiny text
      const tiny = pr.text.filter((t) => t.fontSize < 12).length;
      if (tiny) add('A11Y-BASICS', r.deviceId, r.page, 'warn', `${tiny} text node(s) below 12px`);
      // clipped text at 200%
      if (flags.includes('font-200')) { const clipped = pr.text.filter((t) => t.clipped).length; if (clipped) add('FONT-200', r.deviceId, r.page, 'fail', `${clipped} text container(s) clip content at 200% font scaling`); }
    }
    // fixed / sticky
    for (const f of pr.fixed) {
      if (f.inScrollContainer) continue; // sticky headers inside scroll containers are positioned relative to that container
      if (f.offscreen) add('STICKY-FIXED', r.deviceId, r.page, 'fail', `${f.position} element off-screen: ${f.d}`);
      if (f.w > pr.viewport.w + 2) add('STICKY-FIXED', r.deviceId, r.page, 'fail', `${f.position} element wider than viewport (${f.w}px): ${f.d}`);
      if (touch && f.coverage > (flags.includes('landscape') ? 0.5 : 0.4)) add('STICKY-FIXED', r.deviceId, r.page, 'fail', `${f.position} element covers ${(f.coverage * 100).toFixed(0)}% of a small viewport: ${f.d}`);
    }
    // touch targets
    if (touch && d.deep) {
      const small = pr.interactive.filter((i) => i.visible && i.inViewport && !i.disabled && !i.inlineText && (i.w < 24 || i.h < 24));
      const smallish = pr.interactive.filter((i) => i.visible && i.inViewport && !i.disabled && !i.inlineText && i.w >= 24 && i.h >= 24 && (i.w < 44 || i.h < 44));
      for (const s of small.slice(0, 15)) add('TOUCH-TARGET', r.deviceId, r.page, 'fail', `${s.d} is ${s.w}×${s.h}px (< 24px minimum, WCAG 2.5.8)`);
      if (smallish.length) add('TOUCH-TARGET', r.deviceId, r.page, 'warn', `${smallish.length} target(s) between 24 and 44px`);
    }
    // layout shift
    if (d.deep && typeof pr.perf.cls === 'number') { if (pr.perf.cls > 0.1) add('LAYOUT-SHIFT', r.deviceId, r.page, 'fail', `CLS ${pr.perf.cls.toFixed(3)} > 0.1`); else if (pr.perf.cls > 0.05) add('LAYOUT-SHIFT', r.deviceId, r.page, 'warn', `CLS ${pr.perf.cls.toFixed(3)}`); }
    if (d.deep) { const unsized = pr.images.filter((i) => !i.sized && i.w > 40).length; if (unsized) add('LAYOUT-SHIFT', r.deviceId, r.page, 'warn', `${unsized} image(s) without intrinsic size (CLS risk)`); }
    // reduced motion
    if (flags.includes('reduced-motion')) {
      const running = pr.animations.filter((a) => a.playState === 'running' && (a.iterations === 'infinite' || (a.duration || 0) > 100));
      if (running.length) add('REDUCED-MOTION', r.deviceId, r.page, 'fail', `${running.length} animation(s) still running under prefers-reduced-motion (${running.slice(0, 3).map((a) => `${a.type} ${a.duration}ms×${a.iterations}`).join(', ')})`);
      if (pr.mode.motion && pr.mode.motion !== 'off') add('REDUCED-MOTION', r.deviceId, r.page, 'fail', `motion runtime reports "${pr.mode.motion}" under reduced motion`);
      if (pr.canvases.some((c) => c.ctx === 'webgl' && c.visible)) add('ANIM-3D-FALLBACK', r.deviceId, r.page, 'fail', 'WebGL canvas visible under reduced motion');
    }
    // low-end / 3D fallback
    if (flags.includes('low-end')) {
      if (pr.mode.motion === 'full') add('ANIM-3D-FALLBACK', r.deviceId, r.page, 'fail', 'motion runtime kept "full" motion on a low-end device');
      if (pr.mode.threeD === 'webgl') add('ANIM-3D-FALLBACK', r.deviceId, r.page, 'fail', '3D kept WebGL on a low-end device');
      if (pr.canvases.some((c) => c.ctx === 'webgl' && c.visible)) add('ANIM-3D-FALLBACK', r.deviceId, r.page, 'warn', 'WebGL canvas visible on a low-end device (no governor fallback markers)');
    }
    if (touch && pr.canvases.some((c) => c.ctx === 'webgl' && c.visible && !c.ariaHidden)) add('ANIM-3D-FALLBACK', r.deviceId, r.page, 'warn', 'WebGL canvas on a touch device is not aria-hidden');
    // forced colors
    if (flags.includes('forced-colors')) {
      const same = pr.text.filter((t) => t.bg && t.color === t.bg).length;
      if (same) add('FORCED-COLORS', r.deviceId, r.page, 'fail', `${same} text node(s) invisible (text colour equals background) under forced colors`);
    }
    // perf
    if (d.deep) {
      const pf = pr.perf;
      if (pf.dcl != null && pf.dcl > 15000) add('PERF', r.deviceId, r.page, 'fail', `DOMContentLoaded ${pf.dcl}ms`); else if (pf.dcl != null && pf.dcl > 4000) add('PERF', r.deviceId, r.page, 'warn', `DOMContentLoaded ${pf.dcl}ms (dev server?)`);
      if (pf.fps != null && pf.fps < 20) add('PERF', r.deviceId, r.page, 'fail', `~${pf.fps} fps after load`); else if (pf.fps != null && pf.fps < 45) add('PERF', r.deviceId, r.page, 'warn', `~${pf.fps} fps after load`);
      if (pf.longTasks != null && pf.longTasks > 20) add('PERF', r.deviceId, r.page, 'warn', `${pf.longTasks} long tasks`);
      if (pf.domNodes > 5000) add('PERF', r.deviceId, r.page, 'warn', `${pf.domNodes} DOM nodes`);
      if (pf.transferKB > 4000) add('PERF', r.deviceId, r.page, 'warn', `${pf.transferKB} KB transferred`);
    }
    // console / runtime errors (external resource failures are advisory: fonts/CDNs have fallbacks)
    for (const e of r.console.slice(0, 20)) add('CONSOLE-ERRORS', r.deviceId, r.page, 'fail', e);
    for (const e of (r.external || []).slice(0, 5)) add('EXTERNAL-RESOURCES', r.deviceId, r.page, 'warn', e);
    // a11y basics
    if (d.deep && d.id === 'laptop-1280') {
      if (!pr.landmarks.lang) add('A11Y-BASICS', r.deviceId, r.page, 'warn', '<html> has no lang attribute');
      if (!pr.landmarks.title) add('A11Y-BASICS', r.deviceId, r.page, 'warn', 'document has no <title>');
      if (!pr.landmarks.main) add('A11Y-BASICS', r.deviceId, r.page, 'warn', 'no <main> landmark');
      const noAlt = pr.images.filter((i) => !i.alt).length; if (noAlt) add('A11Y-BASICS', r.deviceId, r.page, 'warn', `${noAlt} image(s) without alt`);
      const unl = pr.forms.filter((f) => !f.labelled); for (const u of unl.slice(0, 10)) add('A11Y-BASICS', r.deviceId, r.page, 'warn', `form control without label: ${u.d}`);
    }
    // keyboard
    if (r.keyboard) {
      const k = r.keyboard;
      if (k.focusable === 0 && pr.interactive.some((i) => i.visible)) add('KEYBOARD-NAV', r.deviceId, r.page, 'fail', 'Tab never reached an interactive element');
      for (const m of k.missingIndicator.slice(0, 15)) add('FOCUS-VISIBLE', r.deviceId, r.page, 'fail', `no visible focus indicator on ${m}`);
      for (const m of k.invisibleFocus.slice(0, 10)) add('KEYBOARD-NAV', r.deviceId, r.page, 'fail', `focus landed on an invisible element ${m}`);
    }
  }
  // In a scoped run the styling only takes effect where a scope root exists. Say so plainly rather
  // than letting a green report imply the page was restyled when it was not.
  if (scopeSelector) {
    for (const r of ok) {
      if (!r.device.deep) continue;
      const present = (r.probe.scopeRoots || 0) > 0;
      if (present) continue;
      add('SCOPE-ACTIVE', r.deviceId, r.page, scopeAutoApplied ? 'fail' : 'warn',
        scopeAutoApplied
          ? `no element carries the scope attribute, so the generated design is not applied on ${r.page}`
          : `the design is staged but NOT yet visible: wrap this page's content in <KkScope> to activate it`);
    }
  }

  const DEFS = [
    ['LOAD', 'Pages load and can be measured on every device'], ['RESP-SWEEP', 'Responsive layout sweep 240px → 3840px (no horizontal overflow)'], ['MOBILE-ORIENT', 'Mobile portrait / landscape'], ['FOLDABLE', 'Foldable widths (closed / open / dual)'], ['DPR', 'Device pixel ratio 1× / 2× / 3×'],
    ['THEME', 'Light / dark scheme'], ['FONT-200', '200% font scaling (no overflow / clipping)'], ['KEYBOARD-NAV', 'Keyboard navigation'], ['FOCUS-VISIBLE', 'Focus visibility'], ['CONTRAST', 'WCAG AA text contrast'], ['FORCED-COLORS', 'forced-colors (Windows High Contrast)'],
    ['REDUCED-MOTION', 'prefers-reduced-motion honoured'], ['OVERFLOW', 'Overflow culprits on deep devices'], ['LAYOUT-SHIFT', 'Layout shift (CLS ≤ 0.1) and reserved media space'], ['STICKY-FIXED', 'Fixed / sticky elements sane'], ['TOUCH-TARGET', 'Touch target size (≥ 24px, ideally 44px)'],
    ['PERF', 'Performance budget (load, fps, long tasks, DOM, transfer)'], ['ANIM-3D-FALLBACK', 'Animation / 3D degrade on reduced-motion & low-end'], ['CONSOLE-ERRORS', 'No console / runtime errors'], ['EXTERNAL-RESOURCES', 'External resources (fonts/CDN) reachable'], ['UNCHANGED-ROUTES', 'Routes outside the upgraded scope are byte-identical in computed style'], ['SCOPE-ACTIVE', 'The scoped design is actually applied on the upgraded page'], ['A11Y-BASICS', 'Landmarks, lang, alt text, form labels'],
  ];
  const checks = DEFS.map(([id, name]) => {
    const findings = F.filter((f) => f.check === id);
    const fails = findings.filter((f) => f.severity === 'fail');
    const warns = findings.filter((f) => f.severity === 'warn');
    const count = fails.length;
    const baseCount = baseline?.counts?.[id] ?? null;
    const baselineUnreliable = !!baseline?.unreliable;
    let status = 'pass';
    let summary = '';
    if (count > 0) {
      if (ABSOLUTE.has(id)) { status = 'fail'; summary = `${count} failing finding(s) (governor guarantee)`; }
      else if (baseCount !== null && count <= baseCount) { status = 'warn'; summary = `${count} pre-existing finding(s) (baseline ${baseCount}); not worse`; }
      else { status = 'fail'; summary = baseCount !== null ? `${count} failing finding(s), baseline ${baseCount}: regression` : `${count} failing finding(s)${baselineUnreliable ? ' (baseline unusable: ' + baseline.unreliable + ')' : ''}`; }
    } else if (warns.length) { status = 'warn'; summary = `${warns.length} advisory finding(s)`; }
    else summary = baseCount ? `fixed (baseline had ${baseCount})` : 'no findings';
    return { id, name, status, count, baselineCount: baseCount, summary, findings: [...fails, ...warns].slice(0, 80) };
  });
  return checks;
}

/** Static (no-browser) verification: inspects the candidate CSS for the guarantees it can prove offline. */
export function staticVerification(plan, tokens) {
  const css = plan.ops.filter((o) => o.path.endsWith('.css')).map((o) => o.content).join('\n');
  const checks = [];
  const c = (id, name, cond, summary) => checks.push({ id, name, status: cond ? 'pass' : 'fail', count: cond ? 0 : 1, summary, findings: [] });
  c('CONTRAST', 'WCAG AA token contrast (computed)', tokens.color.contrastReport.every((t) => t.pairs.every((p) => p.passAA)), 'all token pairs ≥ 4.5:1 in light, dark and high-contrast');
  c('REDUCED-MOTION', 'prefers-reduced-motion rules present', /prefers-reduced-motion:\s*reduce/.test(css), 'durations collapse under reduced motion');
  c('FORCED-COLORS', 'forced-colors rules present', /forced-colors:\s*active/.test(css), 'system colours mapped');
  c('FOCUS-VISIBLE', ':focus-visible styling present', /:focus-visible/.test(css), 'visible focus outline');
  c('TOUCH-TARGET', 'touch target tokens', /--kk-touch:\s*(4[4-9]|[5-9]\d)px/.test(css), '≥ 44px targets for controls');
  c('RESP-SWEEP', 'responsive rules 240px → 3840px', /max-width:\s*320px/.test(css) && /min-width:\s*3840px/.test(css), 'breakpoint coverage from 320px down-scaling to 4K up-scaling');
  c('THEME', 'light/dark/high-contrast tokens', /prefers-color-scheme|data-theme/.test(css) && /prefers-contrast/.test(css), 'schemes present');
  c('ANIM-3D-FALLBACK', '3D / heavy motion fallbacks', /kk-3d__fallback/.test(css), 'CSS fallbacks present');
  return { ok: checks.every((x) => x.status === 'pass'), mode: 'static', engine: 'static analysis (no browser)', pages: [], devices: [], checks, counts: {} };
}
