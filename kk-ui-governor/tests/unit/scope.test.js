import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scopeCss, auditScope, splitTopLevel } from '../../src/pipeline/scope-css.js';
import { emitThemeCss } from '../../src/pipeline/emit-css.js';
import { buildTokens } from '../../src/pipeline/tokens.js';
import { resolveSelection } from '../../src/intelligence/selector.js';
import { scanProject } from '../../src/intelligence/scanner.js';
import { Catalog } from '../../src/vault/catalog.js';
import { runSafetyGates } from '../../src/core/safety-gates.js';
import { PKG_ROOT } from '../../src/vault/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(here, '../..');
const vault = path.join(pkgRoot, 'DESIGN-VAULT');
const S = '[data-kk-scope="landing"]';

test('PKG_ROOT is decoded from the module URL, not taken from url.pathname', () => {
  // On Windows `.pathname` yields "/C:/a%20b/..." which path.resolve does not repair.
  assert.equal(PKG_ROOT, pkgRoot);
  assert.ok(!PKG_ROOT.includes('%20'));
});

test('splitTopLevel respects parens, brackets, braces and strings', () => {
  assert.deepEqual(splitTopLevel('a, b', ',').map((s) => s.trim()), ['a', 'b']);
  assert.deepEqual(splitTopLevel('a:not(.x, .y), b', ',').map((s) => s.trim()), ['a:not(.x, .y)', 'b']);
  assert.deepEqual(splitTopLevel('a[title="x,y"], b', ',').map((s) => s.trim()), ['a[title="x,y"]', 'b']);
});

test('element, body and root selectors map correctly for each root kind', () => {
  assert.equal(scopeCss('h1 { color: red }', S).trim(), `${S} h1 { color: red }`);
  // container root: body collapses onto the wrapper itself
  assert.equal(scopeCss('body { margin: 0 }', S, { rootKind: 'container' }).trim(), `${S} { margin: 0 }`);
  // html root: body remains a descendant
  assert.equal(scopeCss('body { margin: 0 }', S, { rootKind: 'html' }).trim(), `${S} body { margin: 0 }`);
});

test('at-rules: media recurses, keyframes/font-face/import are untouched', () => {
  assert.match(scopeCss('@media (min-width: 40em) { a { color: red } }', S), /@media \(min-width: 40em\) \{ \[data-kk-scope="landing"\] a/);
  const kf = '@keyframes spin { from { transform: rotate(0) } to { transform: rotate(360deg) } }';
  assert.equal(scopeCss(kf, S).trim(), kf);
  const ff = '@font-face { font-family: Sora; src: url(a.woff2) }';
  assert.equal(scopeCss(ff, S).trim(), ff);
  const imp = '@import url("https://fonts.example/x.css");';
  assert.equal(scopeCss(imp, S).trim(), imp);
});

test(':root custom properties stay global while its other declarations are scoped', () => {
  const out = scopeCss(':root { --kk-color-bg: #fff; color-scheme: light }', S);
  assert.match(out, /:root \{\s*--kk-color-bg: #fff;\s*\}/, 'tokens remain global');
  assert.match(out, /\[data-kk-scope="landing"\] \{ --kk-color-bg: #fff; color-scheme: light \}/);
});

test('a declaration value containing braces or commas is not mangled', () => {
  const css = '.x { content: "} , {" ; background: url("a,b.png") }';
  const out = scopeCss(css, S);
  assert.ok(out.includes('content: "} , {"'), out);
  assert.ok(out.includes('url("a,b.png")'), out);
});

test('scoping is idempotent', () => {
  const once = scopeCss('h1 { color: red }', S);
  assert.equal(scopeCss(once, S).trim(), once.trim());
});

test('the real emitted theme has zero renderable escapes once scoped', async () => {
  const scan = await scanProject(path.join(pkgRoot, 'samples/app-with-dashboard'));
  scan._files = [];
  const cat = await Catalog.load(vault);
  const sel = resolveSelection({ preset: 'premium-landing', scope: 'landing' }, scan, cat);
  assert.ok(sel.ok, sel.errors.join());
  assert.equal(sel.selection.scopeSelector, S);
  const theme = emitThemeCss(buildTokens(sel.selection, scan, cat), sel.selection, { importTokens: false });

  const before = auditScope(theme, S);
  assert.ok(before.unscoped.length > 100, `unscoped theme should escape everywhere, got ${before.unscoped.length}`);

  const scoped = scopeCss(theme, S, { rootKind: 'html' });
  const after = auditScope(scoped, S);
  const renderable = after.unscoped.filter((x) => !/^(:root|html)$/i.test(x.trim()));
  assert.equal(renderable.length, 0, `renderable escapes: ${renderable.slice(0, 5).join(' | ')}`);

  // every remaining global block must declare custom properties only (inert - renders nothing)
  let idx = 0, blocks = 0;
  while ((idx = scoped.indexOf(':root', idx)) !== -1) {
    const open = scoped.indexOf('{', idx);
    if (open === -1) break;
    let depth = 0, close = -1;
    for (let i = open; i < scoped.length; i++) { if (scoped[i] === '{') depth++; else if (scoped[i] === '}') { depth--; if (!depth) { close = i; break; } } }
    blocks++;
    for (const d of scoped.slice(open + 1, close).split(';').map((x) => x.trim()).filter(Boolean)) {
      assert.match(d, /^--[\w-]+\s*:/, `global :root block declares a rendering property: ${d}`);
    }
    idx = close;
  }
  assert.ok(blocks > 0);
});

test('G10 fails a scoped plan whose stylesheet escapes the scope, passes a contained one', () => {
  const base = {
    ops: [{ path: 'kk-design/theme.css', kind: 'create', content: 'x' }],
    dependencies: [], assets: [], tokens: { color: { primary: '#1f6feb' }, motion: { level: 'subtle' } },
  };
  const scan = { packageJson: { dependencies: {}, devDependencies: {} }, brand: { primaryColor: '#1f6feb' } };
  const selection = { brandMode: 'preserve', scope: 'landing', scopeSelector: S };

  const leaked = runSafetyGates({ plan: { ...base, scopeAudit: { scope: S, rootKind: 'html', rules: 10, escapes: ['body', 'h1'] } }, scan, selection, probe: { ok: true } });
  assert.ok(leaked.failed.includes('G10'), JSON.stringify(leaked.failed));

  const contained = runSafetyGates({ plan: { ...base, scopeAudit: { scope: S, rootKind: 'html', rules: 10, escapes: [':root', ':root'] } }, scan, selection, probe: { ok: true } });
  assert.ok(!contained.failed.includes('G10'), JSON.stringify(contained.gates.find((g) => g.id === 'G10')));

  // a scoped run with no audit at all must fail closed, never silently pass
  const missing = runSafetyGates({ plan: base, scan, selection, probe: { ok: true } });
  assert.ok(missing.failed.includes('G10'));

  // global runs skip the gate by design
  const global = runSafetyGates({ plan: base, scan, selection: { brandMode: 'preserve' }, probe: { ok: true } });
  assert.equal(global.gates.find((g) => g.id === 'G10').status, 'skip');
});
