import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fsp from 'node:fs/promises';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { Catalog } from '../../src/vault/catalog.js';
import { validateManifest } from '../../src/vault/manifest-schema.js';
import { verifyVault } from '../../src/vault/index.js';
import { readJson, copyDir } from '../../src/core/fsutil.js';
import { scanProject } from '../../src/intelligence/scanner.js';
import { resolveSelection } from '../../src/intelligence/selector.js';
import { buildTokens } from '../../src/pipeline/tokens.js';
import { pickAdapter } from '../../src/adapters/registry.js';
import { probeCandidate } from '../../src/pipeline/probe.js';
import { runSafetyGates, stripGovernorBlocks } from '../../src/core/safety-gates.js';
import { staticVerification } from '../../src/verify/runner.js';
import { planDevices } from '../../src/verify/devices.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(here, '../..');
const vault = path.join(pkgRoot, 'DESIGN-VAULT');

test('manifest validates; excluded entries are all incompatible; vault integrity holds', async () => {
  const m = await readJson(path.join(pkgRoot, 'vault-manifest.json'));
  const v = validateManifest(m);
  assert.ok(v.ok, v.errors.join('\n'));
  assert.ok(m.excluded.length >= 5);
  const bad = validateManifest({ ...m, sources: { ...m.sources, evil: { repo: 'x/y', commit: 'abc', license: 'GPL-3.0-only', licenseFile: 'LICENSE' } } });
  assert.ok(!bad.ok);
  const integrity = await verifyVault(vault);
  assert.ok(integrity.ok, JSON.stringify(integrity.problems.slice(0, 3)));
  assert.equal(integrity.assets, 65);
});

test('catalog search filters by style/page/framework/deps/perf and every asset carries provenance', async () => {
  const c = await Catalog.load(vault);
  assert.equal(c.size, 65);
  for (const a of c.assets) { assert.match(a.sourceCommit, /^[0-9a-f]{40}$/); assert.ok(a.license && a.upstream.repo && a.licenseNotice && a.files.length); for (const k of ['category', 'designStyle', 'pageType', 'framework', 'dependencies', 'deviceSuitability', 'performanceCost', 'accessibility', 'darkMode']) assert.ok(a[k] !== undefined, `${a.id} missing ${k}`); }
  const r = c.search({ style: 'enterprise', pageType: 'dashboard', framework: 'nextjs', availableDeps: [], requireDepsSatisfied: true });
  assert.ok(r.length > 0 && r.every((x) => x.asset.dependencies.length === 0));
  const perf = c.search({ maxPerf: 'low' });
  assert.ok(perf.every((x) => ['none', 'low'].includes(x.asset.performanceCost)));
  assert.ok(c.search({ text: 'carousel' }).some((x) => x.asset.id === 'swiper-css'));
  assert.ok(c.byId('font-manrope').family === 'Manrope');
});

async function planFor(sampleRel, input = { preset: 'auto' }) {
  const src = path.join(pkgRoot, sampleRel);
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'kkgov-adapter-'));
  await copyDir(src, root);
  const scan = await scanProject(root);
  const cat = await Catalog.load(vault);
  const sel = resolveSelection(input, scan, cat);
  assert.ok(sel.ok, sel.errors.join());
  const tokens = buildTokens(sel.selection, scan, cat);
  const adapter = pickAdapter(scan);
  const plan = await adapter.plan({ scan, selection: sel.selection, tokens, catalog: cat });
  return { root, scan, sel, tokens, adapter, plan };
}

test('HTML adapter: additive injection, probe passes, gates pass, static verification passes', async () => {
  const { scan, sel, plan, adapter, root } = await planFor('samples/html-landing');
  assert.equal(adapter.id, 'html');
  const probe = await probeCandidate(plan, { projectRoot: root });
  assert.ok(probe.ok, JSON.stringify(probe.errors));
  const gates = runSafetyGates({ plan, scan, selection: sel.selection, probe });
  assert.ok(gates.ok, JSON.stringify(gates.failed));
  const html = plan.ops.find((o) => o.path === 'index.html');
  assert.ok(html && html.kind === 'modify' && html.expectHash);
  assert.equal(stripGovernorBlocks(html.content).trim(), html.original.trim());
  assert.ok(html.content.includes('kk-design/theme.css'));
  assert.ok(plan.ops.some((o) => o.path === 'kk-design/ATTRIBUTION.md'));
  assert.ok(plan.remediations >= 5, `remediations ${plan.remediations}`);
  const sv = staticVerification(plan, plan.tokens);
  assert.ok(sv.ok, JSON.stringify(sv.checks.filter((c) => c.status !== 'pass')));
  // idempotent re-run: injecting again replaces the block instead of duplicating it
  const twice = await adapter.injectOp(root, 'index.html', { kind: 'html', block: 'X', anchor: { before: /<\/head>/i } });
  const again = await adapter.injectOp(root, 'index.html', { kind: 'html', block: 'Y', anchor: { before: /<\/head>/i } });
  assert.equal((again.content.match(/kk-ui-governor:start/g) || []).length, 1);
  assert.ok(twice.content.includes('X'));
});

test('Next.js adapter on the host app: client components, tailwind-aware injection, TSX probe', async () => {
  const hostRoot = path.resolve(pkgRoot, '..');
  const scan = await scanProject(hostRoot);
  if (scan.framework.name !== 'nextjs') return; // package used standalone
  const cat = await Catalog.load(vault);
  const sel = resolveSelection({ preset: 'auto' }, scan, cat);
  const tokens = buildTokens(sel.selection, scan, cat);
  const adapter = pickAdapter(scan);
  assert.equal(adapter.id, 'nextjs');
  const plan = await adapter.plan({ scan, selection: sel.selection, tokens, catalog: cat });
  const probe = await probeCandidate(plan, { projectRoot: hostRoot });
  assert.ok(probe.ok, JSON.stringify(probe.errors));
  assert.ok(probe.typescript, 'typescript parser available for TSX probe');
  const gates = runSafetyGates({ plan, scan, selection: sel.selection, probe });
  assert.ok(gates.ok, JSON.stringify(gates.gates.filter((g) => g.status === 'fail')));
  const provider = plan.ops.find((o) => o.path.endsWith('KkThemeProvider.tsx'));
  assert.ok(provider.content.startsWith("'use client'"));
  assert.ok(plan.ops.some((o) => o.kind === 'modify'), 'theme is imported somewhere');
  assert.equal(plan.dependencies.length, 0);
  assert.equal(tokens.color.primary, '#00f5c3', 'host brand accent preserved');
});

test('unsupported framework is detected gracefully and never injected', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'kkgov-vue-'));
  await fsp.writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'v', dependencies: { vue: '^3.4.0' } }));
  await fsp.mkdir(path.join(root, 'src'));
  await fsp.writeFile(path.join(root, 'src/App.vue'), '<template><button>Hi</button></template>');
  const scan = await scanProject(root);
  assert.equal(scan.framework.name, 'vue');
  assert.equal(scan.framework.supported, false);
  const cat = await Catalog.load(vault);
  const sel = resolveSelection({}, scan, cat);
  const tokens = buildTokens(sel.selection, scan, cat);
  const adapter = pickAdapter(scan);
  assert.equal(adapter.id, 'unsupported');
  const plan = await adapter.plan({ scan, selection: sel.selection, tokens, catalog: cat });
  assert.ok(plan.unsupported);
  assert.ok(plan.ops.every((o) => o.kind === 'create'));
});

test('device plans cover 240px to 3840px, foldables, DPR, dark, forced-colors, reduced-motion, font 200%, low-end', () => {
  for (const mode of ['quick', 'standard', 'full']) {
    const d = planDevices(mode);
    const widths = d.map((x) => x.width);
    assert.ok(Math.min(...widths) === 240 && Math.max(...widths) === 3840, mode);
    assert.ok(d.some((x) => x.flags.includes('foldable')) && d.some((x) => x.dpr >= 2) && d.some((x) => x.colorScheme === 'dark') && d.some((x) => x.forcedColors === 'active') && d.some((x) => x.reducedMotion === 'reduce') && d.some((x) => x.fontScale === 2), mode);
  }
  assert.ok(planDevices('standard').some((x) => x.lowEnd));
  assert.ok(planDevices('full').length > planDevices('standard').length && planDevices('standard').length > planDevices('quick').length);
});
