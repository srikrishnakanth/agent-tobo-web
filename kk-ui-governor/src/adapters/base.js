// Adapter contract. An adapter converts design intent (tokens + selection) into a candidate
// file set for ONE target stack, and knows how to serve the project for verification.
//
//   plan(ctx)  -> { ops: [{ path, kind: 'create'|'modify', content, expectHash?, original? }],
//                  dependencies: [], assets: [], tokens, notes: [], manualSteps: [], pages: [] }
//   serve(ctx) -> { start(): Promise<{ baseUrl, stop() }> } | null   (null => static verification only)
import path from 'node:path';
import fsp from 'node:fs/promises';
import { hashFile, exists } from '../core/fsutil.js';
import { emitTokensCss, emitThemeCss, deriveRemediations } from '../pipeline/emit-css.js';
import { emitMotionJs, emitAttribution } from '../pipeline/emit-js.js';
import { wrap, MARKER } from '../pipeline/markers.js';
import { fetchGoogleFontFaces } from '../pipeline/fonts.js';
import { scopeCss, auditScope } from '../pipeline/scope-css.js';
import { DEFAULT_VAULT_DIR } from '../vault/index.js';

export const OWNED_SIGNATURE = /KK-UI-GOVERNOR/;
export function isGovernorOwned(content) { return OWNED_SIGNATURE.test(String(content).slice(0, 400)); }

export class BaseAdapter {
  constructor(id) { this.id = id; this.status = 'supported'; this.scopeRootKind = 'container'; }
  detect() { return false; }

  /** Load the style files the scan referenced so remediations can target real selectors. */
  async loadStyleSources(scan) {
    const files = [];
    const { walk, relPosix } = await import('../core/fsutil.js');
    const all = await walk(scan.root, { extensions: new Set(['.css', '.scss']), maxFiles: 300 });
    for (const f of all) {
      const rel = relPosix(scan.root, f);
      if (rel.includes('kk-design/')) continue;
      const content = await fsp.readFile(f, 'utf8').catch(() => '');
      if (content.length < 400_000) files.push({ rel, content });
    }
    scan._files = files;
    return files;
  }

  /** Shared artefacts every adapter emits (CSS + motion + attribution). */
  async commonArtifacts(ctx, { dir, module = false, tailwindV4 = false, layer = null, importTokens = true }) {
    const { tokens, selection, scan, catalog } = ctx;
    await this.loadStyleSources(scan);
    const remediations = deriveRemediations(scan);
    const fontFaceCss = await fetchGoogleFontFaces(tokens.typography.googleFontsUrl, { cacheDir: path.join(ctx.vaultDir || DEFAULT_VAULT_DIR, 'cache'), logger: ctx.logger });
    const ops = [];
    // tokens.css is mostly inert custom properties, but it also carries `color-scheme`, which IS a
    // rendering property: left on :root it would change form controls and scrollbars app-wide. In a
    // scoped run it goes through the same transform, which keeps the tokens global and confines the
    // rendering declarations to the scope root.
    const tokensCss = emitTokensCss(tokens, { theme: selection.theme, tailwindV4, fontFaceCss });
    ops.push(await this.fileOp(scan.root, `${dir}/tokens.css`,
      selection.scopeSelector ? scopeCss(tokensCss, selection.scopeSelector, { rootKind: this.scopeRootKind }) : tokensCss));
    const themeCss = emitThemeCss(tokens, selection, { remediations, importTokens, layer });
    if (selection.scopeSelector) {
      // Scoped mode: every rule is confined to the scope root, so no other route can change.
      const scoped = scopeCss(themeCss, selection.scopeSelector, { rootKind: this.scopeRootKind });
      ops.push(await this.fileOp(scan.root, `${dir}/theme.css`, scoped));
      // Audit every stylesheet the run emits, so the containment gate cannot be satisfied by one of
      // them while another leaks.
      const sheets = ops.filter((o) => o.path.endsWith('.css'));
      let rules = 0; const escapes = [];
      for (const sheet of sheets) {
        const a = auditScope(sheet.content, selection.scopeSelector);
        rules += a.total;
        for (const e of a.unscoped) escapes.push(e);
      }
      this._scopeAudit = { scope: selection.scopeSelector, rootKind: this.scopeRootKind, sheets: sheets.map((o) => o.path), rules, escapes };
    } else {
      ops.push(await this.fileOp(scan.root, `${dir}/theme.css`, themeCss));
      this._scopeAudit = null;
    }
    ops.push(await this.fileOp(scan.root, `${dir}/motion.js`, emitMotionJs(tokens, selection, { module })));
    ops.push(await this.fileOp(scan.root, `${dir}/ATTRIBUTION.md`, emitAttribution(tokens, catalog)));
    ops.push(await this.fileOp(scan.root, `${dir}/tokens.json`, JSON.stringify({ generator: 'KK-UI-GOVERNOR', meta: tokens.meta, color: { primary: tokens.color.primary, light: tokens.color.light, dark: tokens.color.dark, highContrast: tokens.color.highContrast }, typography: tokens.typography, spacing: tokens.spacing, radius: tokens.radius, motion: tokens.motion, density: tokens.density, breakpoints: tokens.breakpoints }, null, 2) + '\n'));
    return { ops, remediations, fontsInlined: !!fontFaceCss, scopeAudit: this._scopeAudit };
  }

  /** Create-or-replace op for a governor-generated file. An existing file is only replaced when it carries the
   *  governor signature (re-run); a user's file at the same path is left for gate G2 to refuse. */
  async fileOp(root, relPath, content) {
    const abs = path.join(root, relPath);
    if (!(await exists(abs))) return { path: relPath, kind: 'create', content };
    const original = await fsp.readFile(abs, 'utf8');
    return { path: relPath, kind: 'modify', content, expectHash: await hashFile(abs), original, owned: isGovernorOwned(original) };
  }

  /** Build a 'modify' op that appends a marker block to an existing file (idempotent: replaces an existing block). */
  async injectOp(root, relPath, { kind, block, position = 'end', anchor = null }) {
    const abs = path.join(root, relPath);
    if (!(await exists(abs))) return null;
    const original = await fsp.readFile(abs, 'utf8');
    const expectHash = await hashFile(abs);
    let base = original;
    // Remove any previous governor block (re-run support)
    const re = new RegExp(`[ \\t]*(?:<!--|/\\*|//)?[ \\t]*${escapeRe(MARKER.start)}[\\s\\S]*?${escapeRe(MARKER.end)}[ \\t]*(?:-->|\\*/)?[ \\t]*\\n?`, 'g');
    base = base.replace(re, '');
    const wrapped = wrap(kind, block);
    let content;
    if (anchor) {
      const idx = anchor.after ? findAfter(base, anchor.after) : anchor.before ? base.search(anchor.before) : -1;
      if (idx >= 0) content = base.slice(0, idx) + (anchor.after ? '\n' : '') + wrapped + '\n' + base.slice(idx).replace(/^\n/, '');
      else content = position === 'start' ? wrapped + '\n' + base : base.replace(/\n?$/, '\n') + wrapped + '\n';
    } else content = position === 'start' ? wrapped + '\n' + base : base.replace(/\n?$/, '\n') + wrapped + '\n';
    return { path: relPath, kind: 'modify', content, expectHash, original };
  }
}

function findAfter(text, re) {
  // position right after the LAST match of `re` (multiline)
  let last = -1; const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'); let m;
  while ((m = g.exec(text))) last = m.index + m[0].length;
  return last;
}
function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
