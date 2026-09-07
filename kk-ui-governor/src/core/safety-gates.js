// Safety gates: hard rules a candidate must satisfy BEFORE the Governor is allowed to write.
// Each gate returns { id, name, status: 'pass'|'fail'|'warn'|'skip', details }.
// Any 'fail' blocks the Write stage. Gates never mutate anything.
import path from 'node:path';
import { licenseVerdict } from './licenses.js';
import { MARKER } from '../pipeline/markers.js';

export const PROTECTED_PATHS = [
  /^package\.json$/, /^package-lock\.json$/, /^pnpm-lock\.yaml$/, /^yarn\.lock$/, /^bun\.lockb$/,
  /^\.env(\..*)?$/, /^\.git(\/|$)/, /^node_modules(\/|$)/, /^\.kk-governor(\/|$)/, /^tsconfig.*\.json$/,
  /^next\.config\.(js|mjs|ts)$/, /^vite\.config\.(js|ts|mjs)$/, /^webpack\.config\.(js|cjs|mjs)$/, /^angular\.json$/,
  /^\.github(\/|$)/, /^Dockerfile$/, /^docker-compose\.ya?ml$/,
];

export const MAX_CANDIDATE_BYTES = 6 * 1024 * 1024; // sanity ceiling for a design candidate

/**
 * @param {object} ctx
 *   ctx.plan: { ops: [{path, kind, content, expectHash, original?}], dependencies: string[], assets: [{id, license, ...}], tokens }
 *   ctx.scan: project scan (Inspect output)
 *   ctx.selection: resolved selection (brandMode etc.)
 *   ctx.probe: probe result
 */
export function runSafetyGates(ctx) {
  const gates = [];
  const { plan, scan, selection, probe } = ctx;

  // G1 — never introduce a new dependency
  {
    const have = new Set(Object.keys({ ...(scan?.packageJson?.dependencies || {}), ...(scan?.packageJson?.devDependencies || {}) }));
    const want = plan?.dependencies || [];
    const missing = want.filter((d) => !have.has(d));
    gates.push(g('G1', 'no-new-dependency', missing.length ? 'fail' : 'pass', { required: want, missing }));
  }

  // G2 — additive-only edits to existing files (business logic is never removed)
  {
    const violations = [];
    for (const op of plan?.ops || []) {
      if (op.kind !== 'modify') continue;
      const original = op.original ?? '';
      if (op.owned && /KK-UI-GOVERNOR/.test(String(original).slice(0, 400))) continue; // governor-owned generated file: full replacement is allowed
      // Re-runs: the original may already carry a governor block; compare both sides with blocks removed.
      const stripped = stripGovernorBlocks(String(op.content));
      if (normalize(stripped) !== normalize(stripGovernorBlocks(original))) {
        violations.push({ path: op.path, note: 'candidate alters content outside governor marker blocks' });
      }
    }
    gates.push(g('G2', 'additive-only-edits', violations.length ? 'fail' : 'pass', { violations, modified: (plan?.ops || []).filter((o) => o.kind === 'modify').map((o) => o.path) }));
  }

  // G3 — brand identity preserved unless the selected mode explicitly allows replacement
  {
    const brandPrimary = scan?.brand?.primaryColor || null;
    const allow = selection?.brandMode === 'replace';
    const candidatePrimary = plan?.tokens?.color?.primary || null;
    let status = 'pass';
    let note = 'no detected brand colour; nothing to preserve';
    if (brandPrimary && !allow) {
      if (!candidatePrimary) { status = 'fail'; note = 'candidate has no primary colour'; }
      else if (!sameColor(brandPrimary, candidatePrimary)) { status = 'fail'; note = `candidate primary ${candidatePrimary} differs from brand ${brandPrimary}`; }
      else note = `brand primary ${brandPrimary} preserved`;
    } else if (brandPrimary && allow) note = `brand replacement explicitly allowed (brandMode=replace)`;
    gates.push(g('G3', 'brand-identity-preserved', status, { brandPrimary, candidatePrimary, brandMode: selection?.brandMode || 'preserve', note }));
  }

  // G4 — licenses of every vault asset used must be redistribution-compatible; notices preserved
  {
    const problems = [];
    const used = plan?.assets || [];
    for (const a of used) {
      const v = licenseVerdict(a.license);
      if (!v.ok) problems.push({ asset: a.id, license: a.license, reason: v.reason });
      if (v.ok && v.rule.notice && !a.noticePreserved) problems.push({ asset: a.id, license: a.license, reason: 'license notice not preserved in candidate' });
    }
    gates.push(g('G4', 'license-compatibility', problems.length ? 'fail' : 'pass', { assetsUsed: used.map((a) => `${a.id} (${a.license})`), problems }));
  }

  // G5 — path safety: inside root, no protected files
  {
    const bad = [];
    for (const op of plan?.ops || []) {
      const rel = op.path.replace(/\\/g, '/');
      if (rel.startsWith('/') || rel.includes('..') || path.isAbsolute(rel)) bad.push({ path: op.path, reason: 'not a safe relative path' });
      else if (PROTECTED_PATHS.some((re) => re.test(rel)) && !(plan.allowProtected || []).includes(rel)) bad.push({ path: op.path, reason: 'protected file' });
    }
    gates.push(g('G5', 'path-safety', bad.length ? 'fail' : 'pass', { violations: bad }));
  }

  // G6 — every modification carries the inspected hash (no overwrite without verified backup)
  {
    const missing = (plan?.ops || []).filter((o) => o.kind === 'modify' && !o.expectHash).map((o) => o.path);
    gates.push(g('G6', 'backup-guarantee', missing.length ? 'fail' : 'pass', { modificationsWithoutHash: missing }));
  }

  // G7 — candidate size sanity
  {
    const total = (plan?.ops || []).reduce((n, o) => n + Buffer.byteLength(String(o.content)), 0);
    gates.push(g('G7', 'candidate-size', total > MAX_CANDIDATE_BYTES ? 'fail' : 'pass', { bytes: total, limit: MAX_CANDIDATE_BYTES }));
  }

  // G8 — probe (syntax / compile sanity) must pass
  {
    const ok = probe ? probe.ok : false;
    gates.push(g('G8', 'probe-passed', ok ? 'pass' : 'fail', { probe: probe ? { ok: probe.ok, errors: probe.errors?.slice(0, 20) } : 'probe not run' }));
  }

  // G9 — heavy features (3D / heavy animation) must ship with fallbacks
  {
    const wantsHeavy = !!(plan?.tokens?.motion?.threeD || plan?.tokens?.motion?.level === 'complex');
    const hasFallback = !!plan?.tokens?.motion?.fallback;
    gates.push(g('G9', 'heavy-motion-fallback', wantsHeavy && !hasFallback ? 'fail' : 'pass', { heavy: wantsHeavy, fallback: hasFallback }));
  }

  // G10 - scope containment. In scoped mode every emitted rule must be confined to the scope root,
  // so routes outside it (an authenticated dashboard, settings, auth screens) cannot change at all.
  {
    const scoped = !!selection?.scopeSelector;
    if (!scoped) gates.push(g('G10', 'scope-containment', 'skip', { note: 'global run: styling applies project-wide by design' }));
    else {
      const audit = plan?.scopeAudit;
      if (!audit) gates.push(g('G10', 'scope-containment', 'fail', { note: 'scoped run requested but the adapter produced no scope audit' }));
      else {
        const escapes = audit.escapes || [];
        // :root blocks are retained deliberately and hold only inert custom properties.
        const renderable = escapes.filter((sel) => !/^(:root|html)$/i.test(String(sel).trim()));
        gates.push(g('G10', 'scope-containment', renderable.length ? 'fail' : 'pass', {
          scope: audit.scope, rootKind: audit.rootKind, rulesScoped: audit.rules,
          inertGlobalTokenBlocks: escapes.length - renderable.length,
          escapingSelectors: renderable.slice(0, 20),
        }));
      }
    }
  }

  const failed = gates.filter((x) => x.status === 'fail');
  return { ok: failed.length === 0, gates, failed: failed.map((x) => x.id) };
}

function g(id, name, status, details) { return { id, name, status, details }; }
function normalize(s) { return String(s).replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim(); }

/** Remove every `MARKER.start ... MARKER.end` block (in any comment syntax) from content. */
export function stripGovernorBlocks(content) {
  const s = escapeRe(MARKER.start), e = escapeRe(MARKER.end);
  const re = new RegExp(`[ \\t]*(?:<!--|/\\*|//)?[ \\t]*${s}[\\s\\S]*?${e}[ \\t]*(?:-->|\\*/)?[ \\t]*\\n?`, 'g');
  return content.replace(re, '');
}
function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

export function sameColor(a, b) {
  const pa = parseHex(a), pb = parseHex(b);
  if (!pa || !pb) return String(a).toLowerCase() === String(b).toLowerCase();
  const d = Math.sqrt((pa[0] - pb[0]) ** 2 + (pa[1] - pb[1]) ** 2 + (pa[2] - pb[2]) ** 2);
  return d < 12; // tolerate tiny normalisation drift, not a different hue
}
function parseHex(h) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(h).trim());
  if (!m) return null;
  let x = m[1]; if (x.length === 3) x = x.split('').map((c) => c + c).join('');
  return [parseInt(x.slice(0, 2), 16), parseInt(x.slice(2, 4), 16), parseInt(x.slice(4, 6), 16)];
}
