// Probe: dry-run sanity checks on the staged candidate BEFORE anything touches the project.
// - CSS: balanced braces / strings, @import ordering, no leftover template artefacts
// - JS/MJS: `node --check`
// - JSX/TSX/TS: TypeScript syntactic diagnostics when `typescript` is resolvable, else brace balance
// - HTML: marker block integrity + <head>/<body> presence
// - JSON / MD: parse / non-empty
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

export async function probeCandidate(plan, { projectRoot, logger } = {}) {
  const errors = [], warnings = [];
  const ts = await loadTypescript(projectRoot);
  for (const op of plan.ops) {
    const content = String(op.content);
    const ext = path.extname(op.path).toLowerCase();
    if (/^\s*undefined;\s*$/m.test(content) && ext !== '.md') warnings.push({ path: op.path, note: 'contains "undefined;" (possible template leak)' });
    if (/\$\{[^}]*\}/.test(content) && ['.css', '.html'].includes(ext)) warnings.push({ path: op.path, note: 'contains ${...} (possible unrendered template)' });
    try {
      if (ext === '.css') checkCss(content, op.path, errors);
      else if (ext === '.js' || ext === '.mjs' || ext === '.cjs') checkNode(content, op.path, errors, ext);
      else if (['.jsx', '.tsx', '.ts'].includes(ext)) checkTs(ts, content, op.path, errors, warnings);
      else if (ext === '.html' || ext === '.htm') checkHtml(content, op.path, errors);
      else if (ext === '.json') JSON.parse(content);
      else if (ext === '.md') { if (!content.trim()) errors.push({ path: op.path, error: 'empty markdown' }); }
    } catch (e) { errors.push({ path: op.path, error: String(e.message || e) }); }
  }
  const ok = errors.length === 0;
  logger?.[ok ? 'info' : 'error'](`probe: ${ok ? 'ok' : errors.length + ' error(s)'}${warnings.length ? `, ${warnings.length} warning(s)` : ''}`);
  return { ok, errors, warnings, typescript: !!ts, filesProbed: plan.ops.length };
}

function checkCss(css, file, errors) {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, '""');
  let depth = 0;
  for (const ch of stripped) { if (ch === '{') depth++; else if (ch === '}') { depth--; if (depth < 0) break; } }
  if (depth !== 0) errors.push({ path: file, error: `unbalanced braces (${depth})` });
  if ((css.match(/"/g) || []).length % 2) errors.push({ path: file, error: 'unbalanced double quotes' });
  // @import must precede other rules (except @charset/@layer statements)
  const lines = stripped.split('\n');
  let sawRule = false;
  for (const l of lines) {
    const t = l.trim(); if (!t) continue;
    if (t.startsWith('@import')) { if (sawRule) { errors.push({ path: file, error: '@import after other rules' }); break; } continue; }
    if (t.startsWith('@charset') || /^@layer\s+[\w\s,]+;$/.test(t)) continue;
    sawRule = true;
  }
}

function checkNode(js, file, errors, ext) {
  const tmp = path.join(os.tmpdir(), `kkgov-probe-${process.pid}-${Math.random().toString(36).slice(2)}${ext === '.cjs' ? '.cjs' : '.mjs'}`);
  try {
    require('node:fs').writeFileSync(tmp, js);
    const r = spawnSync(process.execPath, ['--check', tmp], { encoding: 'utf8' });
    if (r.status !== 0) errors.push({ path: file, error: (r.stderr || 'node --check failed').split('\n').slice(0, 6).join('\n').replace(tmp, file) });
  } finally { try { require('node:fs').unlinkSync(tmp); } catch { /* ignore */ } }
}
const require = createRequire(import.meta.url);

function checkTs(ts, code, file, errors, warnings) {
  if (!ts) { braceBalance(code, file, errors); warnings.push({ path: file, note: 'typescript not resolvable; brace-balance check only' }); return; }
  const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : file.endsWith('.jsx') ? ts.ScriptKind.JSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, kind);
  const diags = sf.parseDiagnostics || [];
  for (const d of diags.slice(0, 5)) errors.push({ path: file, error: ts.flattenDiagnosticMessageText(d.messageText, '\n') + ` (pos ${d.start})` });
  // Transpile to catch JSX syntax problems
  const out = ts.transpileModule(code, { compilerOptions: { jsx: ts.JsxEmit.Preserve, target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext }, reportDiagnostics: true, fileName: file });
  for (const d of (out.diagnostics || []).slice(0, 5)) errors.push({ path: file, error: ts.flattenDiagnosticMessageText(d.messageText, '\n') });
}

function braceBalance(code, file, errors) {
  let depth = 0; for (const ch of code) { if (ch === '{') depth++; else if (ch === '}') depth--; }
  if (depth !== 0) errors.push({ path: file, error: `unbalanced braces (${depth})` });
}

function checkHtml(html, file, errors) {
  if (!/<head[\s>]/i.test(html) || !/<\/head>/i.test(html)) errors.push({ path: file, error: 'missing <head>' });
  if (!/<body[\s>]/i.test(html)) errors.push({ path: file, error: 'missing <body>' });
  const starts = (html.match(/kk-ui-governor:start/g) || []).length, ends = (html.match(/kk-ui-governor:end/g) || []).length;
  if (starts !== ends) errors.push({ path: file, error: 'governor marker block is unbalanced' });
  if (starts > 1) errors.push({ path: file, error: `${starts} governor blocks (expected at most 1)` });
}

async function loadTypescript(projectRoot) {
  const candidates = [projectRoot ? path.join(projectRoot, 'node_modules', 'typescript') : null, 'typescript', '/opt/node22/lib/node_modules/typescript', path.join(process.execPath, '..', '..', 'lib', 'node_modules', 'typescript')].filter(Boolean);
  for (const c of candidates) { try { return require(c); } catch { /* next */ } }
  return null;
}
