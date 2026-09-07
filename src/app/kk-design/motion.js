// KK-UI-GOVERNOR motion runtime (ES module). Import and call initKkMotion() once on the client.

const KK_CONFIG = {"level":"subtle","scroll":false,"parallax":false,"threeD":false,"carousel":false,"fallback":{"reducedMotion":"disable"},"lowEndCores":4,"lowEndMemoryGB":4,"perfBudgetLongFrameRatio":0.3};
function kkCapabilities() {
  const mq = (q) => { try { return window.matchMedia(q).matches; } catch { return false; } };
  const nav = navigator || {};
  const conn = nav.connection || {};
  return {
    reducedMotion: mq('(prefers-reduced-motion: reduce)'),
    saveData: !!conn.saveData || mq('(prefers-reduced-data: reduce)'),
    coarse: mq('(pointer: coarse)'),
    narrow: window.innerWidth < 640,
    lowEnd: (nav.hardwareConcurrency || 8) <= KK_CONFIG.lowEndCores || (nav.deviceMemory || 8) <= KK_CONFIG.lowEndMemoryGB,
    forcedColors: mq('(forced-colors: active)'),
    webgl: (() => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; } })(),
  };
}
function kkDecideMotion(cap) {
  if (cap.reducedMotion || KK_CONFIG.level === 'none') return 'off';
  if (cap.saveData || cap.lowEnd) return 'reduced';
  if (KK_CONFIG.level === 'subtle') return 'reduced';
  return 'full';
}
function kkDecide3D(cap, motion) {
  if (!KK_CONFIG.threeD || motion === 'off') return 'off';
  if (cap.saveData || cap.lowEnd) return 'off';
  if (KK_CONFIG.threeD === 'webgl' && cap.webgl && !cap.narrow && !cap.coarse) return 'webgl';
  return cap.narrow ? 'off' : 'css';
}
function kkApplyMode(motion, threeD) {
  const html = document.documentElement;
  html.dataset.kkMotion = motion;
  html.dataset.kk3d = threeD;
  html.dispatchEvent(new CustomEvent('kk:mode', { detail: { motion, threeD } }));
}
const kkTheme = {
  get() { try { return localStorage.getItem('kk-theme') || 'auto'; } catch { return 'auto'; } },
  set(t) {
    const html = document.documentElement;
    if (!t || t === 'auto') html.removeAttribute('data-theme'); else html.setAttribute('data-theme', t);
    try { if (!t || t === 'auto') localStorage.removeItem('kk-theme'); else localStorage.setItem('kk-theme', t); } catch {}
    html.dispatchEvent(new CustomEvent('kk:theme', { detail: { theme: t || 'auto' } }));
  },
  toggle() { const cur = this.get(); const isDark = cur === 'dark' || (cur === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches); this.set(isDark ? 'light' : 'dark'); },
  init() { const t = this.get(); if (t !== 'auto') document.documentElement.setAttribute('data-theme', t); try { if (matchMedia('(prefers-contrast: more)').matches && t === 'auto') document.documentElement.setAttribute('data-contrast', 'more'); } catch {} },
};
function kkReveal(motion) {
  const els = document.querySelectorAll('[data-kk-reveal]');
  if (!els.length) return;
  if (motion !== 'full' || !('IntersectionObserver' in window)) { els.forEach((e) => e.classList.add('kk-in')); return; }
  const io = new IntersectionObserver((entries) => { for (const en of entries) if (en.isIntersecting) { en.target.classList.add('kk-in'); io.unobserve(en.target); } }, { rootMargin: '0px 0px -8% 0px', threshold: 0.1 });
  els.forEach((e) => io.observe(e));
}
function kkParallax(motion) {
  const els = [...document.querySelectorAll('[data-kk-parallax]')];
  if (!els.length || motion !== 'full' || !KK_CONFIG.parallax) { els.forEach((e) => (e.style.transform = '')); return; }
  let ticking = false;
  const update = () => {
    ticking = false;
    const vh = window.innerHeight;
    for (const el of els) {
      const speed = Math.min(0.5, Math.max(-0.5, parseFloat(el.dataset.kkParallax) || 0.2));
      const r = el.getBoundingClientRect();
      if (r.bottom < 0 || r.top > vh) continue;
      const offset = (r.top + r.height / 2 - vh / 2) * speed;
      el.style.transform = 'translate3d(0,' + offset.toFixed(1) + 'px,0)';
    }
  };
  window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
  update();
}
function kkTilt(threeD) {
  const els = document.querySelectorAll('.kk-3d');
  if (!els.length || threeD === 'off') return;
  if (!matchMedia('(pointer: fine)').matches) return;
  for (const el of els) {
    const obj = el.querySelector('.kk-3d__object') || el;
    el.addEventListener('pointermove', (e) => { const r = el.getBoundingClientRect(); const x = (e.clientX - r.left) / r.width - 0.5; const y = (e.clientY - r.top) / r.height - 0.5; obj.style.transform = 'rotateX(' + (-y * 10).toFixed(2) + 'deg) rotateY(' + (x * 12).toFixed(2) + 'deg)'; });
    el.addEventListener('pointerleave', () => { obj.style.transform = ''; });
  }
}
function kkCarousel() {
  for (const c of document.querySelectorAll('.kk-carousel')) {
    if (!c.hasAttribute('tabindex')) c.setAttribute('tabindex', '0');
    if (!c.hasAttribute('role')) { c.setAttribute('role', 'region'); c.setAttribute('aria-roledescription', 'carousel'); }
    if (!c.hasAttribute('aria-label')) c.setAttribute('aria-label', 'Carousel');
    c.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      const step = (c.firstElementChild ? c.firstElementChild.getBoundingClientRect().width : c.clientWidth * 0.8) + 16;
      c.scrollBy({ left: e.key === 'ArrowRight' ? step : -step, behavior: document.documentElement.dataset.kkMotion === 'off' ? 'auto' : 'smooth' });
    });
    for (const btn of c.parentElement ? c.parentElement.querySelectorAll('[data-kk-carousel-prev],[data-kk-carousel-next]') : []) {
      btn.addEventListener('click', () => { const step = (c.firstElementChild ? c.firstElementChild.getBoundingClientRect().width : c.clientWidth * 0.8) + 16; c.scrollBy({ left: btn.hasAttribute('data-kk-carousel-next') ? step : -step, behavior: document.documentElement.dataset.kkMotion === 'off' ? 'auto' : 'smooth' }); });
    }
  }
}
function kkPerfGuard() {
  // Sample frame times for ~1s after init; if long frames dominate, degrade to reduced motion and drop 3D.
  let frames = 0, long = 0, last = performance.now();
  const sample = (now) => { const dt = now - last; last = now; frames++; if (dt > 34) long++; if (frames < 60) requestAnimationFrame(sample); else if (long / frames > KK_CONFIG.perfBudgetLongFrameRatio) { const html = document.documentElement; if (html.dataset.kkMotion === 'full') kkApplyMode('reduced', 'off'); else if (html.dataset.kk3d !== 'off') kkApplyMode(html.dataset.kkMotion, 'off'); } };
  requestAnimationFrame(sample);
}
function kkInit() {
  if (document.documentElement.dataset.kkInit === '1') return;
  document.documentElement.dataset.kkInit = '1';
  kkTheme.init();
  const cap = kkCapabilities();
  const motion = kkDecideMotion(cap);
  const threeD = kkDecide3D(cap, motion);
  kkApplyMode(motion, threeD);
  const run = () => { kkReveal(motion); kkParallax(motion); kkTilt(threeD); kkCarousel(); if (motion !== 'off') kkPerfGuard(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run();
  try { matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', () => { const c = kkCapabilities(); const m = kkDecideMotion(c); kkApplyMode(m, kkDecide3D(c, m)); }); } catch {}
  return { motion, threeD, capabilities: cap };
}

export { kkInit as initKkMotion, kkTheme, kkCapabilities, kkDecideMotion, kkDecide3D, KK_CONFIG };
export default kkInit;
