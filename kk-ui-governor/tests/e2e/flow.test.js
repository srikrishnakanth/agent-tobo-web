// End-to-end proof: Project Scan → Design Selection → Adaptation → Apply → Multi-device Verification → Keep/Rollback → REPORT.html
// 1. full flow on the HTML sample (kept on pass)
// 2. forced-failure run: a candidate that breaks the layout must be rolled back automatically, byte-exact.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fsp from 'node:fs/promises';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { Governor } from '../../src/core/governor.js';
import { copyDir, hashFile, walk, relPosix, readJson } from '../../src/core/fsutil.js';
import { browserAvailable } from '../../src/verify/runner.js';
import { Logger } from '../../src/core/logger.js';
import { HtmlAdapter } from '../../src/adapters/html.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(here, '../..');
const vault = path.join(pkgRoot, 'DESIGN-VAULT');

async function freshSample() {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'kkgov-e2e-'));
  await copyDir(path.join(pkgRoot, 'samples/html-landing'), root);
  const hashes = {};
  for (const f of await walk(root)) hashes[relPosix(root, f)] = await hashFile(f);
  return { root, hashes };
}
async function snapshot(root) { const h = {}; for (const f of await walk(root)) h[relPosix(root, f)] = await hashFile(f); return h; }

test('full flow on the HTML sample ends in PASS with REPORT.html and every gate evaluated', { timeout: 15 * 60 * 1000 }, async (t) => {
  if (!(await browserAvailable())) { t.skip('no Chromium available'); return; }
  const { root, hashes } = await freshSample();
  const g = new Governor({ projectRoot: root, vaultDir: vault, logger: new Logger({ level: 'error', prefix: 'e2e' }) });
  const r = await g.apply({ selection: { preset: 'auto' }, verifyMode: 'quick', decide: 'auto' });
  assert.equal(r.verdict, 'PASS', JSON.stringify(r));
  assert.equal(r.decision, 'keep');
  const report = await readJson(r.reportJson);
  for (const st of ['inspect', 'select', 'adapt', 'probe', 'preview', 'write', 'verify', 'decide']) assert.equal(report.stages[st].status, 'done', st);
  assert.ok(report.safetyGates.gates.length === 9 && report.safetyGates.ok);
  const ids = report.verification.checks.map((c) => c.id);
  for (const id of ['RESP-SWEEP', 'MOBILE-ORIENT', 'FOLDABLE', 'DPR', 'THEME', 'FONT-200', 'KEYBOARD-NAV', 'FOCUS-VISIBLE', 'CONTRAST', 'FORCED-COLORS', 'REDUCED-MOTION', 'OVERFLOW', 'LAYOUT-SHIFT', 'STICKY-FIXED', 'TOUCH-TARGET', 'PERF', 'ANIM-3D-FALLBACK', 'CONSOLE-ERRORS']) assert.ok(ids.includes(id), id);
  assert.ok(report.verification.devices.some((d) => d.width === 240) && report.verification.devices.some((d) => d.width === 3840));
  assert.ok(report.verification.checks.find((c) => c.id === 'FOCUS-VISIBLE').status === 'pass');
  assert.ok(report.verification.checks.find((c) => c.id === 'REDUCED-MOTION').status === 'pass');
  // the sample's baseline problems were fixed, not merely tolerated
  assert.ok(report.baseline.counts['RESP-SWEEP'] > 0 && report.verification.checks.find((c) => c.id === 'RESP-SWEEP').count === 0);
  const html = await fsp.readFile(r.reportPath, 'utf8');
  assert.ok(html.includes('Inspect → Select → Adapt → Probe → Preview → Write → Verify → Keep / Rollback') && html.includes('data:image/jpeg'));
  // project changed additively: originals intact inside, new kk-design folder present
  const after = await snapshot(root);
  assert.ok(after['kk-design/theme.css'] && after['kk-design/ATTRIBUTION.md']);
  assert.notEqual(after['index.html'], hashes['index.html']);
  assert.equal(after['assets/styles.css'], hashes['assets/styles.css'], 'existing stylesheet untouched');
  // preview artefacts
  assert.ok(report.preview.current?.file && report.preview.candidate?.file && report.preview.gallery?.file);
  // manual rollback of a kept transaction restores everything byte-exact
  const rb = await g.rollback(r.txId);
  assert.ok(rb.ok);
  const restored = await snapshot(root);
  for (const [f, h] of Object.entries(hashes)) assert.equal(restored[f], h, f);
  assert.ok(!restored['kk-design/theme.css']);
});

test('a candidate that fails verification is rolled back automatically (byte-exact) and reported as FAIL', { timeout: 15 * 60 * 1000 }, async (t) => {
  if (!(await browserAvailable())) { t.skip('no Chromium available'); return; }
  const { root, hashes } = await freshSample();
  // Inject a broken candidate: an extra rule that forces a 5000px wide body (overflow on every device) and a runtime error.
  const orig = HtmlAdapter.prototype.plan;
  HtmlAdapter.prototype.plan = async function (ctx) {
    const plan = await orig.call(this, ctx);
    const theme = plan.ops.find((o) => o.path.endsWith('theme.css'));
    theme.content += '\nbody { width: 5000px; }\n';
    const motion = plan.ops.find((o) => o.path.endsWith('motion.js'));
    motion.content += '\nthrow new Error("kk-test injected runtime failure");\n';
    return plan;
  };
  try {
    const g = new Governor({ projectRoot: root, vaultDir: vault, logger: new Logger({ level: 'error', prefix: 'e2e' }) });
    const r = await g.apply({ selection: { preset: 'premium-landing' }, verifyMode: 'quick', decide: 'auto' });
    assert.equal(r.verdict, 'FAIL');
    assert.equal(r.decision, 'rollback');
    assert.equal(r.state, 'rolled_back');
    assert.ok(r.verification.failed.includes('CONSOLE-ERRORS') || r.verification.failed.includes('RESP-SWEEP'), JSON.stringify(r.verification));
    const report = await readJson(r.reportJson);
    assert.equal(report.stages.write.status, 'done');
    assert.equal(report.stages.verify.status, 'failed');
    assert.ok(report.rollback.ok && report.rollback.restored.length === 7);
    const restored = await snapshot(root);
    for (const [f, h] of Object.entries(hashes)) assert.equal(restored[f], h, f);
    assert.ok(!Object.keys(restored).some((f) => f.startsWith('kk-design/')));
  } finally { HtmlAdapter.prototype.plan = orig; }
});

test('decide=ask leaves the transaction pending; keep then finalises it', { timeout: 15 * 60 * 1000 }, async (t) => {
  if (!(await browserAvailable())) { t.skip('no Chromium available'); return; }
  const { root } = await freshSample();
  const g = new Governor({ projectRoot: root, vaultDir: vault, logger: new Logger({ level: 'error', prefix: 'e2e' }) });
  // The baseline stays on: it is what makes "never worse" meaningful. Without it every pre-existing
  // finding in the project is charged to the candidate, which is the conservative behaviour asserted below.
  const r = await g.apply({ selection: { preset: 'minimal-docs' }, verifyMode: 'quick', decide: 'ask', preview: false });
  assert.equal(r.verdict, 'PENDING', JSON.stringify(r.verification));
  assert.equal(r.state, 'pending');
  const k = await g.keep(r.txId);
  assert.equal(k.state, 'kept');
  const list = await g.status();
  assert.equal(list.find((m) => m.id === r.txId).state, 'kept');
});

test('without a baseline the candidate is judged strictly: pre-existing findings are charged to it', { timeout: 15 * 60 * 1000 }, async (t) => {
  if (!(await browserAvailable())) { t.skip('no Chromium available'); return; }
  const { root, hashes } = await freshSample();
  const g = new Governor({ projectRoot: root, vaultDir: vault, logger: new Logger({ level: 'error', prefix: 'e2e' }) });
  const r = await g.apply({ selection: { preset: 'minimal-docs' }, verifyMode: 'quick', decide: 'auto', preview: false, baseline: false });
  assert.equal(r.verdict, 'FAIL', 'no baseline means the sample own pre-existing problems fail the run');
  assert.equal(r.state, 'rolled_back');
  const restored = await snapshot(root);
  for (const [f, h] of Object.entries(hashes)) assert.equal(restored[f], h, f);
});
