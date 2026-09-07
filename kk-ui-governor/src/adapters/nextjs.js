// Next.js adapter: React adapter placed next to the root layout, imported from layout.tsx
// (or the Tailwind globals file when Tailwind is active), served with `next dev` for verification.
import path from 'node:path';
import { ReactAdapter } from './react.js';
import { tailwindInfo, tailwindInjection, relImport, emitTailwindBridge } from './tailwind.js';
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
    const { ops, remediations, fontsInlined, scopeAudit } = await this.commonArtifacts(ctx, { dir, module: true, tailwindV4: false, layer: tw.active && tw.version === '3' && !scan.entryPoints.layouts[0] ? 'components' : null });
    const comps = emitReactComponents(tokens, selection, { ts, hasRecharts: deps.includes('recharts'), hasThree: deps.includes('three') });
    for (const [rel, content] of Object.entries(comps)) {
      // Next app router: components using hooks must be client components.
      const needsClient = /use(State|Effect|Ref|Id|Context)\(|createContext/.test(content);
      ops.push(await this.fileOp(scan.root, `${dir}/${rel}`, needsClient && fw.router === 'app' ? `'use client';\n${content}` : content));
    }
    const notes = [], manualSteps = [];
    let injected = false;
    // ---- scoped mode: nothing is applied globally. The theme is imported by a wrapper component,
    // so it cannot reach any other route until a human wraps the landing page in it.
    if (selection.scopeSelector) {
      const x = ts ? 'tsx' : 'jsx';
      const clientDirective = "'use client';\n";
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
    if (!injected) manualSteps.push(`Import '${dir}/theme.css' from your root layout (no safe injection point was found).`);
    if (selection.scopeSelector) manualSteps.push(`Optional: render <KkThemeProvider> INSIDE <KkScope> (not in the root layout) so the motion runtime stays on the landing page only.`);
    else manualSteps.push(`Optional: wrap {children} in <KkThemeProvider> (client component in ${dir}) to enable the motion runtime and theme toggle.`);
    if (fw.router === 'unknown') notes.push('could not determine app/pages router; default route "/" will be verified');
    return { ops, dependencies: [], assets: tokens.assets, tokens, notes, manualSteps, scopeAutoApplied: !selection.scopeSelector, pages: selectPages(scan, selection), remediations: remediations.length, fontsInlined, scopeAudit };
  }

  serve(ctx) {
    const { scan, logger, production = false } = ctx;
    return {
      start: async () => {
        const s = new ProcessServer({ cwd: scan.root, pkg: 'next', args: production ? ['start', '-p', '{port}'] : ['dev', '-p', '{port}', '-H', '127.0.0.1'], logger, readyTimeoutMs: 240000 });
        const baseUrl = await s.start();
        return { baseUrl, stop: () => s.stop() };
      },
    };
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
