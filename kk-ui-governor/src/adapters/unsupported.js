// Graceful handling of frameworks without an adapter (Vue, Nuxt, Svelte, Angular, Astro, ...):
// the Governor still produces a tokens-only candidate (framework-agnostic CSS) but never injects
// into unknown entry points and never claims success for the design application.
import { BaseAdapter } from './base.js';

export class UnsupportedAdapter extends BaseAdapter {
  constructor() { super('unsupported'); this.status = 'unsupported-framework'; }
  detect(scan) { return !scan.framework.supported; }
  async plan(ctx) {
    const { scan, tokens } = ctx;
    const { ops, remediations, fontsInlined, scopeAudit } = await this.commonArtifacts(ctx, { dir: 'kk-design', module: true });
    return {
      ops, dependencies: [], assets: tokens.assets, tokens, remediations: remediations.length, fontsInlined, scopeAudit, pages: ['/'],
      notes: [`framework "${scan.framework.name}" is not supported by an adapter: ${scan.framework.reason || 'no adapter'}`],
      manualSteps: ['Import kk-design/theme.css from your global stylesheet or root component to apply the tokens.', 'Framework components were not generated; the design intent is available as CSS tokens and .kk-* classes.'],
      unsupported: true,
    };
  }
  serve() { return null; }
}
