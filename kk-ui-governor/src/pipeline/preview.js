// Preview: Current vs Candidate before permanent changes.
//  - Current: screenshots of the served project as it is now (pre-write).
//  - Candidate (static projects): overlay copy of the project with the candidate applied, served and screenshotted.
//  - Candidate (framework projects): a token/component gallery rendered with the candidate CSS
//    (pre-write), plus the real post-write screenshots captured by Verify before the Keep/Rollback decision.
//  - preview.html: side-by-side page written into the transaction directory.
import path from 'node:path';
import fsp from 'node:fs/promises';
import { copyDir, atomicWrite, exists } from '../core/fsutil.js';
import { StaticServer } from '../server/static-server.js';
import { launchBrowser, newVerifiedContext } from '../verify/runner.js';

export async function buildPreview({ tx, scan, plan, adapter, pages, logger, browserAvailable }) {
  const out = { current: null, candidate: null, gallery: null, html: null, notes: [] };
  const previewDir = tx.previewDir;
  // 1. gallery (always; pure CSS from the candidate)
  const cssOps = plan.ops.filter((o) => o.path.endsWith('theme.css') || o.path.endsWith('tokens.css'));
  const themeCss = cssOps.find((o) => o.path.endsWith('theme.css'))?.content?.replace(/@import\s+"\.\/tokens\.css";/, '') || '';
  const tokensCss = cssOps.find((o) => o.path.endsWith('tokens.css'))?.content?.replace(/@theme inline\s*\{[^}]*\}/s, '') || '';
  const motionJs = plan.ops.find((o) => o.path.endsWith('motion.js'))?.content || '';
  const galleryHtml = renderGallery(plan.tokens, tokensCss + '\n' + themeCss, motionJs.startsWith('/*') ? motionJs : '');
  const galleryPath = path.join(previewDir, 'gallery.html');
  await atomicWrite(galleryPath, galleryHtml);
  out.gallery = { file: galleryPath };

  if (!browserAvailable) { out.notes.push('browser not available: preview limited to gallery.html'); out.html = await writePreviewHtml(previewDir, out); return out; }
  const browser = await launchBrowser();
  try {
    // 2. current
    const server = adapter.serve({ scan, logger });
    if (server) {
      let running = null;
      try {
        running = await server.start();
        const page0 = pages[0] || '/';
        out.current = await shoot(browser, running.baseUrl + page0, path.join(previewDir, 'current-1280.jpg'), 1280, 800);
        out.currentMobile = await shoot(browser, running.baseUrl + page0, path.join(previewDir, 'current-390.jpg'), 390, 844, { mobile: true });
      } catch (e) { out.notes.push(`current preview failed: ${e.message}`); }
      finally { await running?.stop(); }
    } else out.notes.push('adapter cannot serve this project: current preview skipped');

    // 3. candidate overlay for static projects
    if (adapter.id === 'html') {
      const overlay = path.join(previewDir, 'candidate-project');
      await copyDir(scan.root, overlay);
      for (const op of plan.ops) { const f = path.join(overlay, op.path); await fsp.mkdir(path.dirname(f), { recursive: true }); await fsp.writeFile(f, op.content); }
      const s = new StaticServer(overlay);
      const base = await s.start();
      try {
        const page0 = pages[0] || '/';
        out.candidate = await shoot(browser, base + page0, path.join(previewDir, 'candidate-1280.jpg'), 1280, 800);
        out.candidateMobile = await shoot(browser, base + page0, path.join(previewDir, 'candidate-390.jpg'), 390, 844, { mobile: true });
      } finally { await s.stop(); }
    } else {
      out.notes.push('framework project: candidate preview uses the component gallery pre-write; real page screenshots are captured by Verify before the keep/rollback decision');
    }
    // 4. gallery screenshot
    const gs = new StaticServer(previewDir);
    const gbase = await gs.start();
    try { out.galleryShot = await shoot(browser, gbase + '/gallery.html', path.join(previewDir, 'gallery-1280.jpg'), 1280, 900); if (!out.candidate) out.candidate = { ...out.galleryShot, note: 'candidate component gallery (pre-write)' }; } finally { await gs.stop(); }
  } finally { await browser.close(); }
  out.html = await writePreviewHtml(previewDir, out);
  return out;
}

async function shoot(browser, url, file, width, height, { mobile = false } = {}) {
  const ctx = await newVerifiedContext(browser, { viewport: { width, height }, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
  const page = await ctx.newPage();
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 90000 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: file, type: 'jpeg', quality: 60, fullPage: false });
    return { file, url, width, height };
  } finally { await ctx.close(); }
}

async function writePreviewHtml(dir, out) {
  const img = (s) => (s?.file ? `<img src="${path.basename(s.file)}" alt="">` : '<p>not captured</p>');
  const html = `<!doctype html><meta charset="utf-8"><title>KK-UI-GOVERNOR preview</title><style>body{font-family:system-ui;margin:24px;background:#f5f6f8;color:#111}h1{font-size:20px}.row{display:grid;grid-template-columns:1fr 1fr;gap:16px}img{width:100%;border:1px solid #ccc;background:#fff}small{color:#555}</style>
<h1>Current vs Candidate</h1><div class="row"><div><h2>Current (desktop)</h2>${img(out.current)}</div><div><h2>Candidate (desktop)</h2>${img(out.candidate)}<small>${out.candidate?.note || ''}</small></div><div><h2>Current (mobile)</h2>${img(out.currentMobile)}</div><div><h2>Candidate (mobile)</h2>${img(out.candidateMobile || out.galleryShot)}</div></div><h2>Component gallery</h2><p><a href="gallery.html">gallery.html</a></p><pre>${out.notes.join('\n')}</pre>`;
  const f = path.join(dir, 'preview.html');
  await atomicWrite(f, html);
  return f;
}

export function renderGallery(tokens, css, js) {
  const t = tokens.meta;
  return `<!doctype html><html lang="en" data-theme="${tokens.meta.theme === 'dark' ? 'dark' : tokens.meta.theme === 'high-contrast' ? 'high-contrast' : 'light'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>Candidate gallery — ${t.style}</title><style>${css}</style></head>
<body><nav class="kk-nav kk-nav--sticky" aria-label="Primary"><span class="kk-display" style="font-weight:700;padding-inline:var(--kk-space-3);margin-right:auto">Candidate · ${t.style}</span><a href="#" aria-current="page">Overview</a><a href="#c">Components</a><a href="#d">Data</a><button type="button" class="kk-btn kk-btn--secondary kk-btn--sm" onclick="window.kkTheme&&kkTheme.toggle()">Toggle theme</button></nav>
<main class="kk-container kk-stack" style="padding-block:var(--kk-space-8)">
<section class="kk-stack" data-kk-reveal><span class="kk-badge">${t.pageType} · ${t.platform} · ${t.density} density</span><h1>${tokens.meta.signature}</h1><p class="kk-prose" style="font-size:var(--kk-text-lg);color:var(--kk-color-text-muted)">Every colour pair on this page passes WCAG AA. Buttons keep a ${tokens.density.touchTarget} touch target, focus is always visible, and motion collapses under reduced-motion.</p><div class="kk-cluster"><button type="button" class="kk-btn">Primary action</button><button type="button" class="kk-btn kk-btn--secondary">Secondary</button><button type="button" class="kk-btn kk-btn--ghost">Ghost</button><button type="button" class="kk-btn kk-btn--danger">Danger</button><button type="button" class="kk-btn" disabled>Disabled</button></div></section>
<section id="c" class="kk-grid" data-kk-reveal>
<article class="kk-card"><h3 class="kk-card__title">Card</h3><div class="kk-card__meta">Surface, border, radius ${tokens.radius.lg}</div><p>Body copy uses ${tokens.typography.families[0] ? tokens.typography.families.join(' + ') : 'the system font stack'} at ${tokens.typography.baseSizePx}px.</p><div class="kk-cluster"><span class="kk-badge kk-badge--success">Success</span><span class="kk-badge kk-badge--warning">Warning</span><span class="kk-badge kk-badge--danger">Danger</span></div></article>
<article class="kk-card kk-card--elevated"><h3 class="kk-card__title">Form</h3><form onsubmit="return false"><div class="kk-field"><label for="e1">Email</label><input id="e1" type="email" placeholder="you@example.com" aria-describedby="h1"><div id="h1" class="kk-help">We never share your address.</div></div><div class="kk-field"><label for="s1">Plan</label><select id="s1"><option>Starter</option><option>Team</option></select></div><label class="kk-switch"><input type="checkbox" checked><span></span> Notifications</label><div class="kk-modal__actions"><button type="submit" class="kk-btn">Save</button></div></form></article>
<article class="kk-card"><h3 class="kk-card__title">Stats</h3><div class="kk-grid" style="--kk-space-5:var(--kk-space-3)"><div class="kk-stat"><span class="kk-stat__value">12,480</span><span class="kk-stat__label">Sessions</span></div><div class="kk-stat"><span class="kk-stat__value">3.2%</span><span class="kk-stat__label">Conversion</span></div></div><svg class="kk-chart" viewBox="0 0 300 120" role="img" aria-label="Weekly sessions"><title>Weekly sessions</title><line class="kk-chart__axis" x1="20" y1="100" x2="290" y2="100"/><rect class="kk-chart__bar" x="30" y="40" width="30" height="60" rx="3"/><rect class="kk-chart__bar" x="75" y="60" width="30" height="40" rx="3"/><rect class="kk-chart__bar" x="120" y="25" width="30" height="75" rx="3"/><rect class="kk-chart__bar" x="165" y="50" width="30" height="50" rx="3"/><rect class="kk-chart__bar" x="210" y="15" width="30" height="85" rx="3"/><rect class="kk-chart__bar" x="255" y="35" width="30" height="65" rx="3"/></svg></article>
</section>
<section id="d" class="kk-stack" data-kk-reveal><h2>Table</h2><div class="kk-table-wrap" role="region" aria-label="Orders" tabindex="0"><table><thead><tr><th scope="col">Order</th><th scope="col">Customer</th><th scope="col">Status</th><th scope="col" class="kk-num">Total</th></tr></thead><tbody><tr><td>#1042</td><td>Ada Lovelace</td><td><span class="kk-badge kk-badge--success">Paid</span></td><td class="kk-num">1,240.00</td></tr><tr><td>#1043</td><td>Grace Hopper</td><td><span class="kk-badge kk-badge--warning">Pending</span></td><td class="kk-num">380.50</td></tr><tr><td>#1044</td><td>Katherine Johnson</td><td><span class="kk-badge kk-badge--danger">Refunded</span></td><td class="kk-num">99.00</td></tr></tbody></table></div>
<h2>Carousel</h2><div class="kk-carousel" aria-label="Highlights"><article class="kk-card"><h3 class="kk-card__title">Slide one</h3><p>Scroll-snap, keyboard arrows, no dependency.</p></article><article class="kk-card"><h3 class="kk-card__title">Slide two</h3><p>Touch friendly with overscroll containment.</p></article><article class="kk-card"><h3 class="kk-card__title">Slide three</h3><p>Fixed basis per device class.</p></article><article class="kk-card"><h3 class="kk-card__title">Slide four</h3><p>Works at 240px and 3840px.</p></article></div>
<h2>Modal</h2><button type="button" class="kk-btn kk-btn--secondary" onclick="document.getElementById('m1').showModal()">Open dialog</button><dialog id="m1" aria-labelledby="mt"><h2 id="mt" class="kk-modal__title">Confirm change</h2><p>Native dialog: focus trap, Escape and backdrop are built in.</p><div class="kk-modal__actions"><button type="button" class="kk-btn kk-btn--secondary" onclick="document.getElementById('m1').close()">Cancel</button><button type="button" class="kk-btn" onclick="document.getElementById('m1').close()">Confirm</button></div></dialog></section>
</main>${js ? `<script>${js}</script>` : ''}</body></html>`;
}
