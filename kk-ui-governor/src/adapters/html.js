// Plain HTML/CSS/JS adapter. Emits kk-design/{tokens,theme}.css + motion.js and injects
// <link>/<script> tags into every HTML entry inside governor marker comments (additive-only).
import path from 'node:path';
import { BaseAdapter } from './base.js';
import { tailwindInfo } from './tailwind.js';
import { StaticServer } from '../server/static-server.js';

export class HtmlAdapter extends BaseAdapter {
  constructor() { super('html'); this.scopeRootKind = 'html'; }
  detect(scan) { return scan.framework.name === 'html'; }

  async plan(ctx) {
    const { scan, tokens, selection } = ctx;
    const dir = 'kk-design';
    const tw = tailwindInfo(scan);
    const { ops, remediations, fontsInlined, scopeAudit } = await this.commonArtifacts(ctx, { dir, module: false, tailwindV4: tw.active && tw.version === '4' });
    const notes = [];
    const pages = [];
    // Scoped mode upgrades ONE page. Everything else in the project is left completely untouched.
    let targets = scan.entryPoints.html;
    if (selection.scopeSelector) {
      const landing = pickLandingPage(scan);
      if (!landing) throw new Error('scoped mode: could not identify the landing page; pass --landing <file>');
      targets = [landing];
      notes.push(`scoped run: only ${landing} is modified; every other page is untouched`);
    }
    for (const rel of targets) {
      const relDir = path.posix.relative(path.posix.dirname(rel), dir) || '.';
      const scopeScript = selection.scopeSelector
        // Set before the body is parsed, so the scoped styles apply on first paint (no flash).
        ? `<script>document.documentElement.setAttribute('data-kk-scope', ${JSON.stringify(selection.scope)});</script>`
        : null;
      const head = [
        scopeScript,
        !/name=["']viewport["']/i.test(await readRel(scan.root, rel)) ? `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">` : null,
        `<meta name="color-scheme" content="${selection.theme === 'auto' ? 'light dark' : selection.theme === 'light' ? 'light' : 'dark'}">`,
        tokens.typography.googleFontsUrl ? `<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>` : null,
        `<link rel="stylesheet" href="${relDir}/theme.css">`,
        `<script src="${relDir}/motion.js" defer></script>`,
      ].filter(Boolean).join('\n');
      const op = await this.injectOp(scan.root, rel, { kind: 'html', block: head, anchor: { before: /<\/head>/i }, position: 'start' });
      if (op) { ops.push(op); pages.push('/' + rel); }
      else notes.push(`could not inject into ${rel}`);
    }
    if (!targets.length) notes.push('no HTML entry files found: CSS emitted but not linked');
    return { ops, dependencies: [], assets: tokens.assets, tokens, notes, manualSteps: [], scopeAutoApplied: true, pages, remediations: remediations.length, fontsInlined, scopeAudit };
  }

  serve(ctx) {
    const root = ctx.scan.root;
    return { start: async () => { const s = new StaticServer(root); const baseUrl = await s.start(); return { baseUrl, stop: () => s.stop() }; } };
  }
}

/** The landing page: the route classified 'landing', else index.html, else the first entry. */
export function pickLandingPage(scan) {
  const html = scan.entryPoints.html || [];
  if (!html.length) return null;
  const landingRoute = (scan.pageTypes?.perPage || []).find((p) => p.type === 'landing');
  if (landingRoute) {
    const rel = landingRoute.route.replace(/^\//, '');
    if (html.includes(rel)) return rel;
  }
  return html.find((f) => /(^|\/)index\.html?$/i.test(f)) || html[0];
}

async function readRel(root, rel) { const fsp = await import('node:fs/promises'); return fsp.readFile(path.join(root, rel), 'utf8').catch(() => ''); }
