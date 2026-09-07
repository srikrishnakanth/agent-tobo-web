// REPORT.html / REPORT.json / REPORT.md writer. The HTML report is a single self-contained file:
// every screenshot is embedded so it can be shared or archived without its transaction directory.
import fsp from 'node:fs/promises';
import path from 'node:path';
import { atomicWrite, exists } from './fsutil.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const badge = (s) => `<span class="badge ${esc(s)}">${esc(String(s).toUpperCase())}</span>`;

export async function writeReport(tx, report, { embedScreenshots = true, maxEmbedBytes = 10 * 1024 * 1024 } = {}) {
  const jsonPath = path.join(tx.dir, 'REPORT.json');
  const htmlPath = path.join(tx.dir, 'REPORT.html');
  const mdPath = path.join(tx.dir, 'REPORT.md');
  await atomicWrite(jsonPath, JSON.stringify(report, null, 2));
  const html = await renderHtml(tx, report, { embedScreenshots, maxEmbedBytes });
  await atomicWrite(htmlPath, html);
  await atomicWrite(mdPath, renderMarkdown(report));
  const reportsDir = path.join(tx.governorDir, 'reports');
  await fsp.mkdir(reportsDir, { recursive: true });
  await fsp.copyFile(htmlPath, path.join(reportsDir, `${tx.id}-REPORT.html`));
  await fsp.copyFile(jsonPath, path.join(reportsDir, `${tx.id}-REPORT.json`));
  return { html: htmlPath, json: jsonPath, md: mdPath };
}

async function imgSrc(file, budget, reportDir) {
  if (!file) return null;
  if (!(await exists(file))) return null;
  const buf = await fsp.readFile(file);
  if (budget.used + buf.length > budget.max) {
    // Too large to inline: link it relatively to the report file (POSIX separators so the href works
    // on Windows too). A bare basename would only resolve if the image sat beside the report.
    return reportDir ? path.relative(reportDir, file).split(path.sep).join('/') : path.basename(file);
  }
  budget.used += buf.length;
  const mime = file.endsWith('.png') ? 'image/png' : 'image/jpeg';
  return `data:${mime};base64,${buf.toString('base64')}`;
}

async function renderHtml(tx, r, { embedScreenshots, maxEmbedBytes }) {
  const budget = { used: 0, max: embedScreenshots ? maxEmbedBytes : 0 };
  const verdict = r.verdict || 'UNKNOWN';
  const stages = Object.entries(r.stages || {});
  const gates = r.safetyGates?.gates || [];
  const checks = r.verification?.checks || [];
  const devices = r.verification?.devices || [];

  const shots = [];
  for (const d of devices) {
    for (const s of d.screenshots || []) {
      const src = await imgSrc(s.file, budget, tx.dir);
      if (src) shots.push({ ...s, device: d.label, src });
    }
  }
  const previewCur = await imgSrc(r.preview?.current?.file, budget, tx.dir);
  const previewCand = await imgSrc(r.preview?.candidate?.file, budget, tx.dir);

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>KK-UI-GOVERNOR Report ${esc(tx.id)}</title>
<style>
:root{--bg:#0b0d12;--panel:#141824;--line:#232a3a;--text:#e6e9f0;--muted:#9aa3b5;--pass:#22c55e;--fail:#ef4444;--warn:#f59e0b;--skip:#64748b;--accent:#7dd3fc}
@media (prefers-color-scheme: light){:root{--bg:#f6f7fb;--panel:#fff;--line:#e3e6ee;--text:#111827;--muted:#4b5563}}
*{box-sizing:border-box}body{margin:0;font:14px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:var(--bg);color:var(--text)}
main{max-width:1200px;margin:0 auto;padding:24px}h1,h2,h3{margin:0 0 .5em}h1{font-size:24px}h2{font-size:18px;margin-top:32px;border-bottom:1px solid var(--line);padding-bottom:6px}
.panel{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:16px;margin:12px 0}
.badge{display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700;letter-spacing:.04em;color:#fff;background:var(--skip)}
.badge.pass,.badge.PASS,.badge.kept{background:var(--pass)}.badge.fail,.badge.FAIL,.badge.rolled_back{background:var(--fail)}.badge.warn{background:var(--warn);color:#111}.badge.skip,.badge.pending{background:var(--skip)}
table{width:100%;border-collapse:collapse;font-size:13px}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid var(--line);vertical-align:top}th{color:var(--muted);font-weight:600}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px}.shot{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:8px}.shot img{width:100%;height:auto;border-radius:4px;border:1px solid var(--line);background:#fff}
.shot small{display:block;color:var(--muted);margin-top:4px}code,pre{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px}pre{background:var(--bg);border:1px solid var(--line);border-radius:6px;padding:10px;overflow:auto;max-height:320px}
.kv{display:grid;grid-template-columns:200px 1fr;gap:4px 12px}.kv dt{color:var(--muted)}.kv dd{margin:0}.verdict{font-size:32px;font-weight:800}
.two{display:grid;grid-template-columns:1fr 1fr;gap:12px}@media(max-width:800px){.two{grid-template-columns:1fr}}
details summary{cursor:pointer;color:var(--accent)}
</style></head><body><main>
<h1>KK-UI-GOVERNOR — Design Transaction Report</h1>
<div class="panel"><div class="verdict">${badge(verdict)} <span>${esc(verdict)}</span></div>
<dl class="kv">
<dt>Transaction</dt><dd><code>${esc(tx.id)}</code></dd>
<dt>Project</dt><dd><code>${esc(r.project?.root)}</code> — ${esc(r.project?.name || '')}</dd>
<dt>Framework</dt><dd>${esc(r.scan?.framework?.name || '?')} ${esc(r.scan?.framework?.version || '')} · CSS: ${esc((r.scan?.cssStack || []).map((c) => c.name).join(', ') || 'plain css')}</dd>
<dt>Adapter</dt><dd>${esc(r.adapter?.id || '?')} (${esc(r.adapter?.status || '')})</dd>
<dt>Design direction</dt><dd>${esc(r.selection?.style)} · ${esc(r.selection?.pageType)} · ${esc(r.selection?.platform)} · theme ${esc(r.selection?.theme)} · density ${esc(r.selection?.density)} · motion ${esc(r.selection?.motion)}</dd>
<dt>Decision</dt><dd>${badge(r.decision || tx.state)} ${esc(r.decisionReason || '')}</dd>
<dt>Started / finished</dt><dd>${esc(r.startedAt)} → ${esc(r.finishedAt)}</dd>
</dl></div>

<h2>Flow: Inspect → Select → Adapt → Probe → Preview → Write → Verify → Keep / Rollback</h2>
<div class="panel"><table><tr><th>Stage</th><th>Status</th><th>Summary</th></tr>
${stages.map(([n, s]) => `<tr><td>${esc(n)}</td><td>${badge(s.status)}</td><td><pre>${esc(JSON.stringify(s.summary, null, 1)).slice(0, 1500)}</pre></td></tr>`).join('')}
</table></div>

<h2>Safety gates</h2>
<div class="panel"><table><tr><th>Gate</th><th>Status</th><th>Details</th></tr>
${gates.map((gt) => `<tr><td><b>${esc(gt.id)}</b> ${esc(gt.name)}</td><td>${badge(gt.status)}</td><td><pre>${esc(JSON.stringify(gt.details, null, 1)).slice(0, 1200)}</pre></td></tr>`).join('')}
</table></div>

<h2>Design Intelligence (Inspect)</h2>
<div class="panel two">
<div><h3>Detected</h3><pre>${esc(JSON.stringify({ framework: r.scan?.framework, cssStack: r.scan?.cssStack, layout: r.scan?.layout, responsive: r.scan?.responsive, pageTypes: r.scan?.pageTypes, brand: r.scan?.brand, typography: r.scan?.typography, components: r.scan?.components?.summary }, null, 1))}</pre></div>
<div><h3>UX problems &amp; generic patterns</h3><pre>${esc(JSON.stringify({ uxProblems: r.scan?.uxProblems, genericPatterns: r.scan?.genericPatterns }, null, 1))}</pre></div>
</div>

<h2>Recommendation (Select)</h2>
<div class="panel"><pre>${esc(JSON.stringify(r.recommendation, null, 1)).slice(0, 8000)}</pre></div>

<h2>Preview: Current vs Candidate</h2>
<div class="panel two">
<div><h3>Current</h3>${previewCur ? `<img style="width:100%;border:1px solid var(--line)" src="${previewCur}" alt="current">` : '<p>' + esc(r.preview?.current?.note || 'not captured') + '</p>'}</div>
<div><h3>Candidate</h3>${previewCand ? `<img style="width:100%;border:1px solid var(--line)" src="${previewCand}" alt="candidate">` : '<p>' + esc(r.preview?.candidate?.note || 'not captured') + '</p>'}</div>
</div>

<h2>Verification — quality gates</h2>
<div class="panel"><p>Mode: <b>${esc(r.verification?.mode || 'n/a')}</b> · Engine: ${esc(r.verification?.engine || 'n/a')} · Pages: ${esc((r.verification?.pages || []).join(', '))}</p>
<table><tr><th>Check</th><th>Status</th><th>Summary</th><th>Details</th></tr>
${checks.map((c) => `<tr><td><b>${esc(c.id)}</b><br><small>${esc(c.name)}</small></td><td>${badge(c.status)}</td><td>${esc(c.summary || '')}</td><td><details><summary>${(c.findings || []).length} finding(s)</summary><pre>${esc(JSON.stringify(c.findings || [], null, 1)).slice(0, 6000)}</pre></details></td></tr>`).join('')}
</table></div>

<h2>Device matrix</h2>
<div class="panel"><table><tr><th>Device</th><th>Viewport</th><th>DPR</th><th>Scheme</th><th>Flags</th><th>Result</th></tr>
${devices.map((d) => `<tr><td>${esc(d.label)}</td><td>${esc(d.width)}×${esc(d.height)}</td><td>${esc(d.dpr)}</td><td>${esc(d.colorScheme)}</td><td>${esc((d.flags || []).join(' '))}</td><td>${badge(d.status)} ${esc(d.note || '')}</td></tr>`).join('')}
</table></div>

<h2>Screenshots (${shots.length})</h2>
<div class="grid">${shots.map((s) => `<div class="shot"><img loading="lazy" src="${s.src}" alt="${esc(s.label)}"><small>${esc(s.device)} · ${esc(s.label)}</small></div>`).join('')}</div>

<h2>Files written</h2>
<div class="panel"><table><tr><th>Path</th><th>Kind</th><th>Bytes</th><th>SHA-256 before → after</th></tr>
${(r.files || []).map((f) => `<tr><td><code>${esc(f.path)}</code></td><td>${esc(f.kind)}</td><td>${esc(f.bytes)}</td><td><code>${esc((f.hashBefore || '—').slice(0, 12))} → ${esc((f.hashAfter || '—').slice(0, 12))}</code></td></tr>`).join('')}
</table></div>

<h2>Design Vault assets &amp; provenance</h2>
<div class="panel"><table><tr><th>Asset</th><th>Category</th><th>Upstream</th><th>Commit</th><th>License</th></tr>
${(r.assets || []).map((a) => `<tr><td>${esc(a.id)}</td><td>${esc(a.category)}</td><td><a href="${esc(a.upstream?.url || '#')}">${esc(a.upstream?.repo || '')}</a> ${esc(a.upstream?.path || '')}</td><td><code>${esc((a.upstream?.commit || '').slice(0, 12))}</code></td><td>${esc(a.license)}</td></tr>`).join('') || '<tr><td colspan="5">No vault assets were copied; design intent was adapted to the target stack from tokens.</td></tr>'}
</table></div>

<h2>Audit</h2>
<div class="panel two"><div><h3>Pre-flight</h3><pre>${esc(JSON.stringify(r.audit?.preflight, null, 1))}</pre></div><div><h3>Post-write</h3><pre>${esc(JSON.stringify(r.audit?.postWrite, null, 1)).slice(0, 4000)}</pre></div></div>

<h2>Transaction journal</h2>
<div class="panel"><pre>${esc((r.journal || []).map((e) => JSON.stringify(e)).join('\n')).slice(0, 20000)}</pre></div>

<h2>Log</h2>
<div class="panel"><pre>${esc((r.log || []).map((e) => `${e.ts} ${e.level.toUpperCase()} ${e.prefix} ${e.msg}`).join('\n')).slice(0, 30000)}</pre></div>
<p style="color:var(--muted)">Generated by KK-UI-GOVERNOR ${esc(r.version || '')} · ${esc(new Date().toISOString())}</p>
</main></body></html>`;
}

function renderMarkdown(r) {
  const lines = [];
  lines.push(`# KK-UI-GOVERNOR Report — ${r.verdict}`);
  lines.push('');
  lines.push(`- Transaction: ${r.txId}`);
  lines.push(`- Project: ${r.project?.root}`);
  lines.push(`- Framework: ${r.scan?.framework?.name} · Adapter: ${r.adapter?.id}`);
  lines.push(`- Direction: ${r.selection?.style} / ${r.selection?.pageType} / ${r.selection?.platform} / ${r.selection?.theme}`);
  lines.push(`- Decision: ${r.decision} ${r.decisionReason || ''}`);
  lines.push('');
  lines.push('## Stages');
  for (const [n, s] of Object.entries(r.stages || {})) lines.push(`- ${n}: ${s.status}`);
  lines.push('');
  lines.push('## Safety gates');
  for (const gt of r.safetyGates?.gates || []) lines.push(`- ${gt.id} ${gt.name}: ${gt.status}`);
  lines.push('');
  lines.push('## Verification checks');
  for (const c of r.verification?.checks || []) lines.push(`- ${c.id} ${c.name}: ${c.status} — ${c.summary || ''}`);
  lines.push('');
  lines.push('## Files');
  for (const f of r.files || []) lines.push(`- ${f.kind} ${f.path}`);
  return lines.join('\n') + '\n';
}
