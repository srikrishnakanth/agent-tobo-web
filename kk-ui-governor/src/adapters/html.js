// Plain HTML/CSS/JS adapter. Emits kk-design/{tokens,theme}.css + motion.js and injects
// <link>/<script> tags into every HTML entry inside governor marker comments (additive-only).
import path from 'node:path';
import { BaseAdapter } from './base.js';
import { tailwindInfo } from './tailwind.js';
import { StaticServer } from '../server/static-server.js';

export class HtmlAdapter extends BaseAdapter {
  constructor() { super('html'); }
  detect(scan) { return scan.framework.name === 'html'; }

  async plan(ctx) {
    const { scan, tokens, selection } = ctx;
    const dir = 'kk-design';
    const tw = tailwindInfo(scan);
    const { ops, remediations, fontsInlined } = await this.commonArtifacts(ctx, { dir, module: false, tailwindV4: tw.active && tw.version === '4' });
    const notes = [];
    const pages = [];
    for (const rel of scan.entryPoints.html) {
      const relDir = path.posix.relative(path.posix.dirname(rel), dir) || '.';
      const head = [
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
    if (!scan.entryPoints.html.length) notes.push('no HTML entry files found: CSS emitted but not linked');
    return { ops, dependencies: [], assets: tokens.assets, tokens, notes, manualSteps: [], pages, remediations: remediations.length, fontsInlined };
  }

  serve(ctx) {
    const root = ctx.scan.root;
    return { start: async () => { const s = new StaticServer(root); const baseUrl = await s.start(); return { baseUrl, stop: () => s.stop() }; } };
  }
}

async function readRel(root, rel) { const fsp = await import('node:fs/promises'); return fsp.readFile(path.join(root, rel), 'utf8').catch(() => ''); }
