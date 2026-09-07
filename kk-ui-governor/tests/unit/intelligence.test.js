import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanProject } from '../../src/intelligence/scanner.js';
import { resolveSelection, listPresets, DIMENSIONS } from '../../src/intelligence/selector.js';
import { recommend } from '../../src/intelligence/recommend.js';
import { buildTokens } from '../../src/pipeline/tokens.js';
import { contrastRatio, ensureContrast, parseColor, toHex, scale } from '../../src/intelligence/color.js';
import { Catalog } from '../../src/vault/catalog.js';
import { STYLES, PAGE_TYPES, PLATFORMS, NAMED_PRESETS } from '../../src/intelligence/data/presets.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(here, '../..');
const sample = path.join(pkgRoot, 'samples/html-landing');
const vault = path.join(pkgRoot, 'DESIGN-VAULT');

test('colour math: contrast ratio and ensureContrast', () => {
  assert.equal(+contrastRatio('#000000', '#ffffff').toFixed(2), 21);
  assert.ok(contrastRatio('#777777', '#ffffff') < 4.5);
  const fixed = ensureContrast('#777777', '#ffffff', 4.5);
  assert.ok(contrastRatio(fixed, '#ffffff') >= 4.5);
  assert.equal(toHex(parseColor('rgb(255, 0, 0)')), '#ff0000');
  assert.equal(scale('#2563eb').length, 12);
});

test('scanner detects the planted problems in the HTML sample', async () => {
  const s = await scanProject(sample);
  assert.equal(s.framework.name, 'html');
  assert.equal(s.brand.primaryColor, '#d9480f');
  assert.equal(s.brand.primarySource, 'css variable --brand');
  const ids = new Set(s.uxProblems.map((p) => p.id));
  for (const id of ['focus-removed', 'tiny-text', 'no-reduced-motion', 'infinite-animation', 'fixed-bottom-no-safe-area', 'vh-mobile-bug', 'placeholder-only-label', 'no-lang']) assert.ok(ids.has(id), `missing ${id}`);
  assert.equal(s.pages.length, 2);
  assert.equal(s.pageTypes.primary, 'landing');
  assert.ok(s.entryPoints.html.includes('index.html'));
});

test('recommendation is coherent: one style family, brand preserved, no 3D without dependency', async () => {
  const s = await scanProject(sample);
  const cat = await Catalog.load(vault);
  const r = resolveSelection({ preset: 'auto' }, s, cat);
  assert.ok(r.ok, r.errors.join());
  const sel = r.selection;
  assert.ok(Object.keys(STYLES).includes(sel.style));
  assert.notEqual(sel.style, '3d');
  assert.equal(sel.brandMode, 'preserve');
  const t = buildTokens(sel, s, cat);
  assert.equal(t.color.primary, '#d9480f');
  for (const theme of t.color.contrastReport) for (const p of theme.pairs) assert.ok(p.passAA, `${theme.theme} ${p.pair} ${p.ratio}`);
  assert.ok(t.assets.every((a) => ['MIT', 'ISC', 'Apache-2.0', 'OFL-1.1'].includes(a.license)));
});

test('every named preset resolves and every style/page/platform combination yields AA tokens', async () => {
  const s = await scanProject(sample);
  const cat = await Catalog.load(vault);
  for (const p of listPresets()) {
    const r = resolveSelection({ preset: p.id }, s, cat);
    assert.ok(r.ok, `${p.id}: ${r.errors.join()}`);
    const t = buildTokens(r.selection, s, cat);
    for (const theme of t.color.contrastReport) for (const pair of theme.pairs) assert.ok(pair.passAA, `${p.id} ${theme.theme} ${pair.pair}=${pair.ratio}`);
  }
  for (const style of Object.keys(STYLES)) for (const platform of Object.keys(PLATFORMS)) {
    const r = resolveSelection({ style, platform, pageType: 'dashboard' }, s, cat);
    assert.ok(r.ok);
    const t = buildTokens(r.selection, s, cat);
    for (const theme of t.color.contrastReport) for (const pair of theme.pairs) assert.ok(pair.passAA, `${style}/${platform} ${theme.theme} ${pair.pair}=${pair.ratio}`);
  }
});

test('coherence rules strip parallax/3D from restrained styles and cap motion', async () => {
  const s = await scanProject(sample);
  const cat = await Catalog.load(vault);
  const r = resolveSelection({ style: 'enterprise', motion: 'complex', effects: 'parallax,3d,animations' }, s, cat);
  assert.ok(r.ok);
  assert.ok(!r.selection.effects.includes('parallax') && !r.selection.effects.includes('3d'));
  assert.equal(r.selection.motion, 'standard');
  assert.ok(r.adjustments.length >= 2);
  const bad = resolveSelection({ style: 'nope' }, s, cat);
  assert.ok(!bad.ok);
});

test('brand replacement only with explicit mode', async () => {
  const s = await scanProject(sample);
  const cat = await Catalog.load(vault);
  const keep = buildTokens(resolveSelection({ style: 'luxury' }, s, cat).selection, s, cat);
  assert.equal(keep.color.primary, '#d9480f');
  const replace = buildTokens(resolveSelection({ style: 'luxury', brandMode: 'replace' }, s, cat).selection, s, cat);
  assert.notEqual(replace.color.primary, '#d9480f');
});

test('dimensions cover the requested catalogue', () => {
  assert.equal(DIMENSIONS.style.length, 10);
  assert.equal(DIMENSIONS.pageType.length, 11);
  assert.deepEqual(DIMENSIONS.platform, ['ios', 'android-material', 'windows-fluent', 'neutral-web', 'brand-custom']);
  assert.deepEqual(DIMENSIONS.theme, ['light', 'dark', 'high-contrast', 'auto']);
  assert.deepEqual(DIMENSIONS.devices, ['mobile', 'foldable', 'tablet', 'laptop', 'desktop', 'ultrawide', '4k']);
  assert.ok(Object.keys(NAMED_PRESETS).length >= 14);
  assert.ok(Object.keys(PAGE_TYPES).length === 11);
});
