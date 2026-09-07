// Next.js adapter: React adapter placed next to the root layout, imported from layout.tsx
// (or the Tailwind globals file when Tailwind is active), served with `next dev` for verification.
import path from 'node:path';
import { ReactAdapter } from './react.js';
import { tailwindInfo, tailwindInjection, relImport } from './tailwind.js';
import { emitReactComponents } from '../pipeline/emit-react.js';
import { exists } from '../core/fsutil.js';
import { ProcessServer } from '../server/process-server.js';

export class NextAdapter extends ReactAdapter {
  constructor() { super('nextjs'); }
  detect(scan) { return scan.framework.name === 'nextjs'; }

  async plan(ctx) {
    const { scan, tokens, selection } = ctx;
    const fw = scan.framework;
    const base = fw.appDir || fw.pagesDir || 'src';
    const dir = `${base}/kk-design`;
    const tw = tailwindInfo(scan);
    const ts = fw.language === 'ts' || (await exists(path.join(scan.root, 'tsconfig.json')));
    const deps = Object.keys({ ...(scan.packageJson?.dependencies || {}), ...(scan.packageJson?.devDependencies || {}) });
    const { ops, remediations, fontsInlined } = await this.commonArtifacts(ctx, { dir, module: true, tailwindV4: tw.active && tw.version === '4', layer: tw.active && tw.version === '3' ? 'components' : null });
    const comps = emitReactComponents(tokens, selection, { ts, hasRecharts: deps.includes('recharts'), hasThree: deps.includes('three') });
    for (const [rel, content] of Object.entries(comps)) {
      // Next app router: components using hooks must be client components.
      const needsClient = /use(State|Effect|Ref|Id|Context)\(|createContext/.test(content);
      ops.push(await this.fileOp(scan.root, `${dir}/${rel}`, needsClient && fw.router === 'app' ? `'use client';\n${content}` : content));
    }
    const notes = [], manualSteps = [];
    let injected = false;
    if (tw.active && tw.globalsFile) {
      const op = await tailwindInjection(this, scan, tw, relImport(tw.globalsFile, dir));
      if (op) { ops.push(op); injected = true; notes.push(`theme imported from ${tw.globalsFile} (Tailwind v${tw.version})`); }
    }
    if (!injected) {
      const layout = scan.entryPoints.layouts[0];
      if (layout) {
        const op = await this.injectOp(scan.root, layout, { kind: 'js', block: `import '${relImport(layout, dir)}/theme.css';`, anchor: { after: /^\s*import\s[^;]*;?\s*$/m }, position: 'start' });
        if (op) { ops.push(op); injected = true; notes.push(`theme imported from ${layout}`); }
      }
    }
    if (!injected) manualSteps.push(`Import '${dir}/theme.css' from your root layout (no safe injection point was found).`);
    manualSteps.push(`Optional: wrap {children} in <KkThemeProvider> (client component in ${dir}) to enable the motion runtime and theme toggle.`);
    if (fw.router === 'unknown') notes.push('could not determine app/pages router; default route "/" will be verified');
    return { ops, dependencies: [], assets: tokens.assets, tokens, notes, manualSteps, pages: scan.pages.filter((p) => !p.dynamic).map((p) => p.route), remediations: remediations.length, fontsInlined };
  }

  serve(ctx) {
    const { scan, logger, production = false } = ctx;
    return {
      start: async () => {
        const s = new ProcessServer({ cwd: scan.root, command: 'npx', args: production ? ['next', 'start', '-p', '{port}'] : ['next', 'dev', '-p', '{port}', '-H', '127.0.0.1'], logger, readyTimeoutMs: 240000 });
        const baseUrl = await s.start();
        return { baseUrl, stop: () => s.stop() };
      },
    };
  }
}
