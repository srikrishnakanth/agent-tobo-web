// React adapter (Vite / CRA / generic bundlers). Emits src/kk-design/* (tokens, theme, motion
// module, dependency-free components, ThemeProvider) and injects a CSS import into the entry.
import path from 'node:path';
import { BaseAdapter } from './base.js';
import { tailwindInfo, tailwindInjection, relImport } from './tailwind.js';
import { emitReactComponents } from '../pipeline/emit-react.js';
import { exists } from '../core/fsutil.js';
import { ProcessServer } from '../server/process-server.js';

export class ReactAdapter extends BaseAdapter {
  constructor(id = 'react') { super(id); }
  detect(scan) { return scan.framework.name === 'react'; }

  designDir(scan) { return exists(path.join(scan.root, 'src')).then((ok) => (ok ? 'src/kk-design' : 'kk-design')); }

  async plan(ctx) {
    const { scan, tokens, selection } = ctx;
    const dir = await this.designDir(scan);
    const tw = tailwindInfo(scan);
    const ts = scan.framework.language === 'ts' || (await exists(path.join(scan.root, 'tsconfig.json')));
    const deps = Object.keys({ ...(scan.packageJson?.dependencies || {}), ...(scan.packageJson?.devDependencies || {}) });
    const { ops, remediations, fontsInlined } = await this.commonArtifacts(ctx, { dir, module: true, tailwindV4: tw.active && tw.version === '4', layer: tw.active && tw.version === '3' ? 'components' : null });
    const comps = emitReactComponents(tokens, selection, { ts, hasRecharts: deps.includes('recharts'), hasThree: deps.includes('three') });
    for (const [rel, content] of Object.entries(comps)) ops.push(await this.fileOp(scan.root, `${dir}/${rel}`, content));
    const notes = [], manualSteps = [];
    let injected = false;
    if (tw.active && tw.globalsFile) {
      const op = await tailwindInjection(this, scan, tw, relImport(tw.globalsFile, dir));
      if (op) { ops.push(op); injected = true; notes.push(`theme imported from ${tw.globalsFile} (Tailwind v${tw.version})`); }
    }
    if (!injected) {
      const entry = scan.entryPoints.layouts[0];
      if (entry) {
        const op = await this.injectOp(scan.root, entry, { kind: 'js', block: `import '${relImport(entry, dir)}/theme.css';`, anchor: { after: /^\s*import\s[^;]*;?\s*$/m }, position: 'start' });
        if (op) { ops.push(op); injected = true; notes.push(`theme imported from ${entry}`); }
      }
    }
    if (!injected) manualSteps.push(`Add \`import './${dir}/theme.css'\` to your application entry (no safe injection point was found).`);
    manualSteps.push(`Optional: wrap your app in <KkThemeProvider> from ${dir} to enable the motion runtime and theme toggle (CSS-only behaviour works without it).`);
    return { ops, dependencies: [], assets: tokens.assets, tokens, notes, manualSteps, pages: scan.pages.filter((p) => !p.dynamic).map((p) => p.route), remediations: remediations.length, fontsInlined };
  }

  serve(ctx) {
    const { scan, logger } = ctx;
    const b = scan.framework.bundler;
    if (b === 'vite') return { start: async () => { const s = new ProcessServer({ cwd: scan.root, command: 'npx', args: ['vite', '--port', '{port}', '--strictPort', '--host', '127.0.0.1'], logger }); const baseUrl = await s.start(); return { baseUrl, stop: () => s.stop() }; } };
    if (b === 'cra') return { start: async () => { const s = new ProcessServer({ cwd: scan.root, command: 'npx', args: ['react-scripts', 'start'], logger }); const baseUrl = await s.start(); return { baseUrl, stop: () => s.stop() }; } };
    return null; // unknown bundler: static verification only
  }
}
