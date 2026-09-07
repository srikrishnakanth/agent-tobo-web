// React adapter (Vite / CRA / generic bundlers). Emits src/kk-design/* (tokens, theme, motion
// module, dependency-free components, ThemeProvider) and injects a CSS import into the entry.
import path from 'node:path';
import { BaseAdapter } from './base.js';
import { tailwindInfo, tailwindInjection, relImport, emitTailwindBridge } from './tailwind.js';
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
    const { ops, remediations, fontsInlined, scopeAudit } = await this.commonArtifacts(ctx, { dir, module: true, tailwindV4: false, layer: tw.active && tw.version === '3' && !scan.entryPoints.layouts[0] ? 'components' : null });
    const comps = emitReactComponents(tokens, selection, { ts, hasRecharts: deps.includes('recharts'), hasThree: deps.includes('three') });
    for (const [rel, content] of Object.entries(comps)) ops.push(await this.fileOp(scan.root, `${dir}/${rel}`, content));
    const notes = [], manualSteps = [];
    let injected = false;
    // ---- scoped mode: nothing is applied globally. The theme is imported by a wrapper component,
    // so it cannot reach any other route until a human wraps the landing page in it.
    if (selection.scopeSelector) {
      const x = ts ? 'tsx' : 'jsx';
      const clientDirective = '';
      ops.push(await this.fileOp(scan.root, `${dir}/KkScope.${x}`, `${clientDirective}// KK-UI-GOVERNOR generated - landing-page scope boundary.
// Every rule in ./theme.css is prefixed with [data-kk-scope="${selection.scope}"], so wrapping ONLY the
// landing page in <KkScope> guarantees no other route (dashboard, settings, auth) can change.
import React from 'react';
import './theme.css';

export function KkScope({ children, as: Tag = 'div', className = '', ...rest }) {
  return (
    <Tag data-kk-scope="${selection.scope}" className={className} {...rest}>
      {children}
    </Tag>
  );
}
export default KkScope;
`));
      notes.push(`scoped run: theme.css is imported by ${dir}/KkScope.${x} only - not globally`);
      manualSteps.push(`Wrap ONLY your landing page's content in <KkScope> from '${dir}/KkScope.${x}'. Until you do, nothing changes visually anywhere - which is why the authenticated app cannot be affected.`);
      injected = true;
    } else {
      // 1. Theme goes through the JS entry AFTER the project's own stylesheet imports so it wins the cascade.
      const entry = scan.entryPoints.layouts[0];
      if (entry) {
        const op = await this.injectOp(scan.root, entry, { kind: 'js', block: `import '${relImport(entry, dir)}/theme.css';`, anchor: { after: /^\s*import\s[^;]*;?\s*$/m }, position: 'start' });
        if (op) { ops.push(op); injected = true; notes.push(`theme imported from ${entry} (after existing imports)`); }
      }
      // 2. Tailwind: the @theme bridge must live inside the Tailwind sheet; the full theme only falls back there when no entry exists.
      if (tw.active && tw.globalsFile) {
        if (tw.version === '4') {
          const bridgeOp = await this.fileOp(scan.root, `${dir}/tailwind-bridge.css`, emitTailwindBridge(tokens));
          ops.push(bridgeOp);
          const imp = await tailwindInjection(this, scan, tw, relImport(tw.globalsFile, dir), injected ? 'tailwind-bridge.css' : 'theme.css');
          if (imp) { ops.push(imp); notes.push(`${injected ? 'Tailwind v4 bridge' : 'theme'} imported from ${tw.globalsFile}`); injected = true; }
        } else if (!injected) {
          const imp = await tailwindInjection(this, scan, tw, relImport(tw.globalsFile, dir), 'theme.css');
          if (imp) { ops.push(imp); injected = true; notes.push(`theme imported from ${tw.globalsFile} (Tailwind v3, @layer components)`); }
        }
      }
    }
    if (!injected) manualSteps.push(`Add \`import './${dir}/theme.css'\` to your application entry (no safe injection point was found).`);
    if (selection.scopeSelector) manualSteps.push(`Optional: render <KkThemeProvider> INSIDE <KkScope> so the motion runtime stays on the landing page only.`);
    else manualSteps.push(`Optional: wrap your app in <KkThemeProvider> from ${dir} to enable the motion runtime and theme toggle (CSS-only behaviour works without it).`);
    return { ops, dependencies: [], assets: tokens.assets, tokens, notes, manualSteps, pages: selectPages(scan, selection), remediations: remediations.length, fontsInlined, scopeAudit };
  }

  serve(ctx) {
    const { scan, logger } = ctx;
    const b = scan.framework.bundler;
    if (b === 'vite') return { start: async () => { const s = new ProcessServer({ cwd: scan.root, command: 'npx', args: ['vite', '--port', '{port}', '--strictPort', '--host', '127.0.0.1'], logger }); const baseUrl = await s.start(); return { baseUrl, stop: () => s.stop() }; } };
    if (b === 'cra') return { start: async () => { const s = new ProcessServer({ cwd: scan.root, command: 'npx', args: ['react-scripts', 'start'], logger }); const baseUrl = await s.start(); return { baseUrl, stop: () => s.stop() }; } };
    return null; // unknown bundler: static verification only
  }
}

/** In scoped mode only the landing route is upgraded, so only it is verified for changes. */
function selectPages(scan, selection) {
  const routes = scan.pages.filter((p) => !p.dynamic).map((p) => p.route);
  if (!selection.scopeSelector) return routes;
  const landing = (scan.pageTypes?.perPage || []).find((p) => p.type === 'landing');
  const target = landing ? landing.route : '/';
  return routes.includes(target) ? [target] : routes.slice(0, 1);
}
