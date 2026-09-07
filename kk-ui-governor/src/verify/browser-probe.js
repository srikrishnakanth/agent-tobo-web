// Code evaluated INSIDE the page (Playwright page.evaluate). Kept as a string-free function so it
// can be serialised; it must not reference Node scope. Returns raw measurements; the runner
// turns them into check results.
export function pageProbe(opts) {
  const out = { viewport: { w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio }, mode: { motion: document.documentElement.dataset.kkMotion || null, threeD: document.documentElement.dataset.kk3d || null, theme: document.documentElement.getAttribute('data-theme') } };
  const de = document.documentElement, body = document.body;
  // overflow
  out.overflow = { scrollWidth: Math.max(de.scrollWidth, body ? body.scrollWidth : 0), clientWidth: de.clientWidth, horizontal: Math.max(de.scrollWidth, body ? body.scrollWidth : 0) > de.clientWidth + 1, culprits: [] };
  if (out.overflow.horizontal) {
    const vw = de.clientWidth;
    for (const el of document.querySelectorAll('body *')) { const r = el.getBoundingClientRect(); if (r.width > 0 && (r.right > vw + 2 || r.left < -2) && getComputedStyle(el).position !== 'fixed') { out.overflow.culprits.push(descr(el) + ` right=${Math.round(r.right)} left=${Math.round(r.left)}`); if (out.overflow.culprits.length >= 8) break; } }
  }
  // text sampling for contrast + clipping + tiny text
  const walker = document.createTreeWalker(body || de, NodeFilter.SHOW_TEXT);
  const samples = []; let n; let count = 0;
  while ((n = walker.nextNode()) && count < 5000) {
    count++;
    const t = n.textContent.trim(); if (t.length < 2) continue;
    const el = n.parentElement; if (!el || ['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'TITLE', 'OPTION'].includes(el.tagName)) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) < 0.05) continue;
    const r = el.getBoundingClientRect(); if (r.width === 0 || r.height === 0) continue;
    if (r.bottom < 0 || r.top > window.innerHeight * 3) continue; // near viewport only
    const bg = effectiveBg(el);
    samples.push({ text: t.slice(0, 40), tag: el.tagName.toLowerCase(), cls: (el.className && typeof el.className === 'string') ? el.className.slice(0, 40) : '', color: cs.color, bg: bg.color, bgKnown: bg.known, fontSize: parseFloat(cs.fontSize), fontWeight: parseInt(cs.fontWeight, 10) || 400, opacity: parseFloat(cs.opacity), clipped: cs.overflow !== 'visible' && el.scrollHeight > el.clientHeight + 4 && cs.overflowY !== 'auto' && cs.overflowY !== 'scroll' });
    if (samples.length >= 400) break;
  }
  out.text = samples;
  // interactive elements: size, focusability, visibility
  const inter = [...document.querySelectorAll('a[href], button, input:not([type="hidden"]), select, textarea, [role="button"], [role="link"], [tabindex]:not([tabindex="-1"]), summary, label > input')];
  out.interactive = inter.slice(0, 300).map((el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); const inline = cs.display === 'inline' && !!el.parentElement && [...el.parentElement.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 0); return { d: descr(el), w: Math.round(r.width), h: Math.round(r.height), visible: r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none', inViewport: r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth, disabled: el.disabled === true, type: el.tagName.toLowerCase(), inlineText: inline }; });
  // fixed / sticky elements
  out.fixed = [];
  for (const el of document.querySelectorAll('body *')) { const cs = getComputedStyle(el); if (cs.position === 'fixed' || cs.position === 'sticky') { const r = el.getBoundingClientRect(); if (r.width === 0 && r.height === 0) continue; out.fixed.push({ d: descr(el), position: cs.position, inScrollContainer: cs.position === 'sticky' && hasScrollAncestor(el), top: Math.round(r.top), left: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height), coverage: Math.min(1, (Math.max(0, Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0)) * Math.max(0, Math.min(r.right, window.innerWidth) - Math.max(r.left, 0))) / (window.innerWidth * window.innerHeight)), offscreen: r.right < 0 || r.left > window.innerWidth || r.bottom < 0 || r.top > window.innerHeight }); if (out.fixed.length > 30) break; } }
  // animations
  let anims = [];
  try { anims = document.getAnimations ? document.getAnimations() : []; } catch { anims = []; }
  out.animations = anims.slice(0, 200).map((a) => { let t = {}; try { t = a.effect.getTiming(); } catch { /* ignore */ } return { playState: a.playState, duration: typeof t.duration === 'number' ? t.duration : null, iterations: t.iterations === Infinity ? 'infinite' : t.iterations, type: a.constructor.name }; });
  // 3D / heavy
  out.canvases = [...document.querySelectorAll('canvas')].map((c) => { let ctx = null; try { ctx = c.getContext('webgl2') || c.getContext('webgl') ? 'webgl' : c.getContext('2d') ? '2d' : 'unknown'; } catch { ctx = 'unknown'; } const r = c.getBoundingClientRect(); return { ctx, w: Math.round(r.width), h: Math.round(r.height), visible: r.width > 0 && r.height > 0 && getComputedStyle(c).display !== 'none', ariaHidden: c.getAttribute('aria-hidden') === 'true' }; });
  out.iframes = document.querySelectorAll('iframe').length;
  out.images = [...document.images].slice(0, 200).map((i) => ({ alt: i.hasAttribute('alt'), w: i.width, h: i.height, sized: !!(i.getAttribute('width') && i.getAttribute('height')) || !!(getComputedStyle(i).aspectRatio && getComputedStyle(i).aspectRatio !== 'auto'), loading: i.loading }));
  out.bodyBg = (function () { const b = getComputedStyle(document.body).backgroundColor; const h = getComputedStyle(document.documentElement).backgroundColor; const t = (c) => /rgba?\(\s*\d+,\s*\d+,\s*\d+,\s*0\)|transparent/.test(c); return !t(b) ? b : !t(h) ? h : effectiveBg(document.body).color; })();
  out.scopeRoots = document.querySelectorAll('[data-kk-scope]').length;
  out.landmarks = { main: !!document.querySelector('main, [role="main"]'), nav: !!document.querySelector('nav, [role="navigation"]'), h1: document.querySelectorAll('h1').length, lang: !!de.getAttribute('lang'), title: !!document.title };
  out.forms = [...document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), select, textarea')].slice(0, 100).map((i) => ({ d: descr(i), labelled: !!(i.labels && i.labels.length) || !!i.getAttribute('aria-label') || !!i.getAttribute('aria-labelledby') || !!i.closest('label') || !!i.getAttribute('title') }));
  // performance
  const nav = performance.getEntriesByType('navigation')[0];
  const res = performance.getEntriesByType('resource');
  out.perf = { dcl: nav ? Math.round(nav.domContentLoadedEventEnd - nav.startTime) : null, load: nav ? Math.round(nav.loadEventEnd - nav.startTime) : null, resources: res.length, transferKB: Math.round(res.reduce((s, r) => s + (r.transferSize || 0), 0) / 1024), domNodes: document.getElementsByTagName('*').length, heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null, cls: window.__kkCls ?? null, longTasks: window.__kkLongTasks ?? null, fps: window.__kkFps ?? null };
  out.fontsLoaded = document.fonts ? [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family).filter((v, i, a) => a.indexOf(v) === i).slice(0, 10) : [];
  return out;

  function hasScrollAncestor(el) { let p = el.parentElement; while (p && p !== document.body) { const o = getComputedStyle(p); if (/(auto|scroll|hidden|clip)/.test(o.overflow + o.overflowX + o.overflowY)) return true; p = p.parentElement; } return false; }
  function descr(el) { const id = el.id ? '#' + el.id : ''; const cls = el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''; const txt = (el.textContent || '').trim().slice(0, 24).replace(/\s+/g, ' '); return `${el.tagName.toLowerCase()}${id}${cls}${txt ? ` "${txt}"` : ''}`; }
  function effectiveBg(el) {
    let cur = el; let known = true;
    while (cur && cur !== document.documentElement.parentNode) {
      const cs = getComputedStyle(cur);
      const bg = cs.backgroundColor;
      const hasImage = cs.backgroundImage && cs.backgroundImage !== 'none';
      if (hasImage) { return { color: null, known: false }; }
      if (bg && !/rgba?\(\s*\d+,\s*\d+,\s*\d+,\s*0\)|transparent/.test(bg)) {
        const m = /rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(bg);
        if (m && (m[4] === undefined || parseFloat(m[4]) >= 0.98)) return { color: bg, known };
        known = false; // semi-transparent layer: composite unknown
      }
      cur = cur.parentElement;
    }
    return { color: 'rgb(255, 255, 255)', known };
  }
}

/** Init script injected before page scripts: CLS + long task + fps observers, low-end simulation. */
export function initScript(opts) {
  window.__kkCls = 0; window.__kkLongTasks = 0; window.__kkFps = null;
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__kkCls += e.value; }).observe({ type: 'layout-shift', buffered: true }); } catch {}
  try { new PerformanceObserver((l) => { window.__kkLongTasks += l.getEntries().length; }).observe({ type: 'longtask', buffered: true }); } catch {}
  if (opts && opts.lowEnd) {
    try { Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 2 }); Object.defineProperty(navigator, 'deviceMemory', { get: () => 2 }); Object.defineProperty(navigator, 'connection', { get: () => ({ saveData: true, effectiveType: '3g' }) }); } catch {}
  }
  if (opts && opts.fontScale && opts.fontScale !== 1) {
    // A real 200% browser font setting is in effect from the first paint. Injecting it at
    // DOMContentLoaded would reflow the page after render and score as layout shift that no user
    // ever sees, so attach the style the instant <html>/<head> exists (during parsing).
    const css = `html { font-size: ${opts.fontScale * 100}% !important; }`;
    const apply = () => {
      if (document.getElementById('kk-font-scale')) return true;
      const target = document.head || document.documentElement;
      if (!target) return false;
      const el = document.createElement('style');
      el.id = 'kk-font-scale';
      el.textContent = css;
      target.appendChild(el);
      return true;
    };
    if (!apply()) {
      const obs = new MutationObserver(() => { if (apply()) obs.disconnect(); });
      obs.observe(document, { childList: true, subtree: true });
      document.addEventListener('DOMContentLoaded', apply);
    }
  }
  window.addEventListener('load', () => { let frames = 0; const t0 = performance.now(); const tick = (t) => { frames++; if (t - t0 < 1000) requestAnimationFrame(tick); else window.__kkFps = Math.round(frames / ((t - t0) / 1000)); }; requestAnimationFrame(tick); });
}
