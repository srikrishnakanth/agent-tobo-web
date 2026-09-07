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

export async function loadPlaywright() {
  const candidates = ['playwright', 'playwright-core', '/opt/node22/lib/node_modules/playwright', path.join(process.execPath, '..', '..', 'lib', 'node_modules', 'playwright')];
  for (const c of candidates) { try { const m = require(c); if (m.chromium) return m; } catch { /* next */ } }
  return null;
}

export async function launchBrowser() {
  const pw = await loadPlaywright();
  if (!pw) throw new Error('playwright not available');
  const opts = { headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] };
  // The browser talks to local dev servers directly. External resources (fonts/CDNs) are relayed
  // through Node's fetch (see installRelay), which honours the host's proxy/CA configuration.
  if (process.env.KKGOV_BROWSER_PROXY && process.env.KKGOV_BROWSER_PROXY !== 'off') opts.proxy = { server: process.env.KKGOV_BROWSER_PROXY, bypass: 'localhost,127.0.0.1' };
  try { return await pw.chromium.launch(opts); }
  catch (e) {
    const exe = process.env.KKGOV_CHROMIUM || '/opt/pw-browsers/chromium';
    try { return await pw.chromium.launch({ ...opts, executablePath: exe }); } catch { throw e; }
  }
}

// ---------------------------------------------------------------- external resource relay
// Sandboxed cloud hosts often let Node reach the internet (via a proxy) while the browser cannot.
// The relay serves external requests from Node's fetch so fonts/CDNs load realistically.
const relayCache = new Map();
export async function installRelay(context, { timeoutMs = 8000 } = {}) {
  if (process.env.KKGOV_EXTERNAL_RELAY === 'off') return;
  await context.route((url) => !/^(127\.0\.0\.1|localhost)$/.test(url.hostname) && /^https?:$/.test(url.protocol), async (route, request) => {
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

export async function newVerifiedContext(browser, options) {
  const ctx = await browser.newContext(options);
  await installRelay(ctx);
  return ctx;
}

export async function browserAvailable() { try { const b = await launchBrowser(); await b.close(); return true; } catch { return false; } }

// Checks the Governor guarantees regardless of the project's prior state.
const ABSOLUTE = new Set(['FOCUS-VISIBLE', 'REDUCED-MOTION', 'ANIM-3D-FALLBACK', 'FORCED-COLORS']);

/**
 * @param {object} o { baseUrl, pages, mode, outDir, baseline?, logger, label }
 * @returns verification result
 */
export async function runVerification({ baseUrl, pages, mode = 'standard', outDir, baseline = null, logger, label = 'candidate', screenshots = true, themeMode = 'auto' }) {
  const devices = planDevices(mode);
  await fsp.mkdir(outDir, { recursive: true });
  const browser = await launchBrowser();
  const version = browser.version();
  const raw = []; // { device, page, probe, console, keyboard, screenshot }
  const started = Date.now();
  try {
    // Warm-up (dev servers compile on first request)
    for (const p of pages) { const ctx = await newVerifiedContext(browser, {}); const pg = await ctx.newPage(); try { await pg.goto(baseUrl + p, { waitUntil: 'load', timeout: 180000 }); } catch (e) { logger?.warn(`warm-up ${p}: ${e.message}`); } await ctx.close(); }
    for (const d of devices) {
      for (const p of pages) {
        const r = await measure(browser, d, baseUrl + p, { outDir, label, screenshots, logger });
        raw.push({ deviceId: d.id, device: d, page: p, ...r });
      }
    }
  } finally { await browser.close(); }
  const checks = evaluate(raw, baseline, { themeMode });
  const perDevice = devices.map((d) => {
    const rs = raw.filter((r) => r.deviceId === d.id);
    const failed = rs.some((r) => r.error);
    const problems = checks.flatMap((c) => c.findings.filter((f) => f.device === d.id && f.severity === 'fail'));
    return { id: d.id, label: d.label, width: d.width, height: d.height, dpr: d.dpr, colorScheme: d.colorScheme, flags: d.flags, status: failed ? 'fail' : problems.length ? 'fail' : 'pass', note: failed ? rs.find((r) => r.error)?.error : problems.length ? `${problems.length} failing finding(s)` : '', screenshots: rs.filter((r) => r.screenshot).map((r) => ({ file: r.screenshot, label: `${p(r.page)} ${d.width}×${d.height}@${d.dpr} ${d.colorScheme}${d.flags.length ? ' ' + d.flags.join(',') : ''}` })) };
  });
  const failed = checks.filter((c) => c.status === 'fail');
  return { ok: failed.length === 0, mode, engine: `chromium ${version} (playwright)`, pages, devices: perDevice, checks, durationMs: Date.now() - started, loads: raw.length, errors: raw.filter((r) => r.error).length, counts: Object.fromEntries(checks.map((c) => [c.id, c.count])) };
}
function p(page) { return page === '/' ? 'home' : page.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, ''); }

async function measure(browser, d, url, { outDir, label, screenshots, logger }) {
  const ctx = await newVerifiedContext(browser, { viewport: { width: d.width, height: d.height }, deviceScaleFactor: d.dpr, isMobile: d.isMobile, hasTouch: d.hasTouch, colorScheme: d.colorScheme, reducedMotion: d.reducedMotion, forcedColors: d.forcedColors, ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  const consoleErrors = [];
  const external = [];
  const isExternal = (u) => { try { const h = new URL(u).host; return !!h && !/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(h); } catch { return false; } };
  page.on('console', (m) => { if (m.type() !== 'error') return; const u = m.location()?.url || ''; const text = m.text().slice(0, 300); if (/Failed to load resource/.test(text) && isExternal(u)) external.push(`${text} (${u.slice(0, 120)})`); else consoleErrors.push(text + (u && isExternal(u) ? ` (${u.slice(0, 100)})` : '')); });
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + String(e.message || e).slice(0, 300)));
  page.on('requestfailed', (r) => { const f = r.failure()?.errorText || ''; if (/net::ERR_ABORTED|BLOCKED_BY_CLIENT/.test(f)) return; if (isExternal(r.url())) external.push(`requestfailed: ${r.url().slice(0, 120)} ${f}`); else consoleErrors.push(`requestfailed: ${r.url().slice(0, 120)} ${f}`); });
  await page.addInitScript(initScript, { lowEnd: !!d.lowEnd, fontScale: d.fontScale || 1 });
  const out = { console: consoleErrors, external };
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 120000 });
    await page.waitForTimeout(d.deep ? 900 : 300);
    // scroll to bottom & back to trigger lazy content + CLS + reveals
    await page.evaluate(async () => { const h = document.documentElement.scrollHeight; for (let y = 0; y < h; y += 600) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 30)); } window.scrollTo(0, 0); });
    await page.waitForTimeout(d.deep ? 500 : 100);
    out.probe = await page.evaluate(pageProbe, {});
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

// ------------------------------------------------------------------------------- evaluation
export function evaluate(raw, baseline, { themeMode = 'auto' } = {}) {
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
  const DEFS = [
    ['LOAD', 'Pages load and can be measured on every device'], ['RESP-SWEEP', 'Responsive layout sweep 240px → 3840px (no horizontal overflow)'], ['MOBILE-ORIENT', 'Mobile portrait / landscape'], ['FOLDABLE', 'Foldable widths (closed / open / dual)'], ['DPR', 'Device pixel ratio 1× / 2× / 3×'],
    ['THEME', 'Light / dark scheme'], ['FONT-200', '200% font scaling (no overflow / clipping)'], ['KEYBOARD-NAV', 'Keyboard navigation'], ['FOCUS-VISIBLE', 'Focus visibility'], ['CONTRAST', 'WCAG AA text contrast'], ['FORCED-COLORS', 'forced-colors (Windows High Contrast)'],
    ['REDUCED-MOTION', 'prefers-reduced-motion honoured'], ['OVERFLOW', 'Overflow culprits on deep devices'], ['LAYOUT-SHIFT', 'Layout shift (CLS ≤ 0.1) and reserved media space'], ['STICKY-FIXED', 'Fixed / sticky elements sane'], ['TOUCH-TARGET', 'Touch target size (≥ 24px, ideally 44px)'],
    ['PERF', 'Performance budget (load, fps, long tasks, DOM, transfer)'], ['ANIM-3D-FALLBACK', 'Animation / 3D degrade on reduced-motion & low-end'], ['CONSOLE-ERRORS', 'No console / runtime errors'], ['EXTERNAL-RESOURCES', 'External resources (fonts/CDN) reachable'], ['A11Y-BASICS', 'Landmarks, lang, alt text, form labels'],
  ];
  const checks = DEFS.map(([id, name]) => {
    const findings = F.filter((f) => f.check === id);
    const fails = findings.filter((f) => f.severity === 'fail');
    const warns = findings.filter((f) => f.severity === 'warn');
    const count = fails.length;
    const baseCount = baseline?.counts?.[id] ?? null;
    let status = 'pass';
    let summary = '';
    if (count > 0) {
      if (ABSOLUTE.has(id)) { status = 'fail'; summary = `${count} failing finding(s) (governor guarantee)`; }
      else if (baseCount !== null && count <= baseCount) { status = 'warn'; summary = `${count} pre-existing finding(s) (baseline ${baseCount}); not worse`; }
      else { status = 'fail'; summary = baseCount !== null ? `${count} failing finding(s), baseline ${baseCount}: regression` : `${count} failing finding(s)`; }
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
