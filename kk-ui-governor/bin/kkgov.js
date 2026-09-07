#!/usr/bin/env node
// KK-UI-GOVERNOR CLI
import path from 'node:path';
import { Logger } from '../src/core/logger.js';

const argv = process.argv.slice(2);
const cmd = argv[0];
const positional = [];
const flags = {};
for (let i = 1; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith('--')) {
    const [k, inline] = a.slice(2).split('=');
    if (inline !== undefined) flags[k] = inline;
    else if (argv[i + 1] !== undefined && !argv[i + 1].startsWith('--')) flags[k] = argv[++i];
    else flags[k] = true;
  } else positional.push(a);
}
const logger = new Logger({ level: flags.verbose ? 'debug' : flags.quiet ? 'error' : 'info', prefix: 'kkgov' });
const json = (o) => console.log(JSON.stringify(o, null, 2));

function selectionFromFlags() {
  const s = {};
  for (const k of ['preset', 'style', 'pageType', 'platform', 'theme', 'density', 'motion', 'devices', 'a11y', 'components', 'effects', 'brandMode', 'threeD', 'radius']) if (flags[k] !== undefined) s[k] = flags[k];
  if (flags.page) s.pageType = flags.page;
  if (flags['brand-mode']) s.brandMode = flags['brand-mode'];
  if (flags['page-type']) s.pageType = flags['page-type'];
  if (flags.auto) s.preset = 'auto';
  if (s.radius) s.radius = +s.radius;
  return s;
}

const HELP = `KK-UI-GOVERNOR — Project-aware Frontend Design Operating System

Usage: kkgov <command> [options]

  scan <dir> [--json]                         Inspect a project (framework, CSS stack, brand, pages, UX problems, generic patterns)
  recommend <dir> [selection flags] [--json]  Recommend a coherent design direction (no changes)
  presets                                     List named presets and every selectable dimension
  adapters                                    List framework adapters
  apply <dir> [selection flags]               Run the full transaction: Inspect → Select → Adapt → Probe → Preview → Write → Verify → Keep/Rollback
      --auto | --preset <name>                Auto-recommend (default) or a named preset
      --style --page --platform --theme --density --motion --devices --a11y --components --effects --brand-mode preserve|replace
      --verify quick|standard|full|static     Verification depth (default standard)
      --decide auto|ask|rollback              auto = keep on pass (default); ask = leave pending; rollback = dry run
      --no-preview --no-baseline --allow-unsupported --max-pages N --vault <dir>
  verify <dir> [--url <url>] [--verify mode]  Verify the project as it is now (no transaction)
  keep <dir> <txId> | rollback <dir> <txId>   Decide a pending transaction (rollback works on kept ones too)
  status <dir> | recover <dir> | report <dir> <txId>
  vault setup [--offline] | vault verify | vault list | vault search <query> [--style --page --framework --category]

Exit codes: 0 PASS/kept, 2 PENDING, 1 FAIL/rolled back/error.`;

try {
  switch (cmd) {
    case 'scan': {
      const { scanProject } = await import('../src/intelligence/scanner.js');
      const s = await scanProject(path.resolve(positional[0] || '.'), { logger });
      const { _files, ...rest } = s;
      if (flags.json) json({ ...rest, components: { summary: s.components.summary, existing: s.components.existing } });
      else {
        console.log(`Project: ${s.name} (${s.root})\nFramework: ${s.framework.name} ${s.framework.version || ''} ${s.framework.supported ? '' : '[unsupported: ' + s.framework.reason + ']'}\nCSS stack: ${s.cssStack.map((c) => c.name + (c.version ? ' v' + c.version : '')).join(', ')}\nLayout: ${s.layout.system}; breakpoints ${s.layout.breakpoints.join(', ') || 'none'}; responsive: ${s.responsive.level}\nBrand: ${s.brand.name}; primary ${s.brand.primaryColor || 'none'} (${s.brand.primarySource || '-'}); dark default: ${s.brand.darkDefault}\nTypography: ${s.typography.primary || 'system'}; google fonts: ${s.typography.googleFonts.join(', ') || 'none'}; min size ${s.typography.minFontSizePx ?? '?'}px\nComponents: ${Object.entries(s.components.summary).map(([k, v]) => k + '=' + v).join(', ') || 'none detected'}\nPages (${s.pages.length}): ${s.pages.slice(0, 12).map((p) => p.route).join(', ')}\nPage types: ${s.pageTypes.ranked.map((r) => r.type + ' ' + r.score).join(', ')}\nUX problems (${s.uxProblems.length}):\n${s.uxProblems.map((p) => `  - [${p.severity}] ${p.id}: ${p.message}${p.file ? ' (' + p.file + ')' : ''}`).join('\n') || '  none'}\nGeneric AI-looking patterns (${s.genericPatterns.length}):\n${s.genericPatterns.map((g) => `  - ${g.id}: ${g.message} (×${g.count})`).join('\n') || '  none'}`);
      }
      break;
    }
    case 'recommend': {
      const { scanProject } = await import('../src/intelligence/scanner.js');
      const { Catalog } = await import('../src/vault/catalog.js');
      const { resolveSelection } = await import('../src/intelligence/selector.js');
      const { buildTokens } = await import('../src/pipeline/tokens.js');
      const { DEFAULT_VAULT_DIR } = await import('../src/vault/index.js');
      const s = await scanProject(path.resolve(positional[0] || '.'), { logger });
      const cat = await Catalog.load(flags.vault || DEFAULT_VAULT_DIR);
      const r = resolveSelection(selectionFromFlags(), s, cat);
      if (!r.ok) { console.error(r.errors.join('\n')); process.exit(1); }
      const t = buildTokens(r.selection, s, cat);
      const sel = r.selection;
      if (flags.json) json({ selection: { ...sel, recommendation: undefined }, recommendation: sel.recommendation, adjustments: r.adjustments, tokens: { primary: t.color.primary, light: t.color.light, dark: t.color.dark, typography: t.typography, contrastReport: t.color.contrastReport } });
      else {
        console.log(`Direction: ${sel.style} / ${sel.pageType} / ${sel.platform} / theme ${sel.theme} / density ${sel.density} / motion ${sel.motion} / 3D ${sel.threeD || 'off'}\nComponents: ${sel.components.join(', ')}\nEffects: ${sel.effects.join(', ') || 'none'}\nFonts: display ${sel.fontDisplay.family || sel.fontDisplay.id}, body ${sel.fontBody.family || sel.fontBody.id}\nPrimary: ${t.color.primary} (${t.color.primarySource})\nStyle ranking: ${sel.recommendation.styleRanking.map((x) => x.id + ' ' + x.score).join(', ')}\nRationale:\n${sel.recommendation.rationale.map((l) => '  - ' + l).join('\n')}\nAdjustments:\n${r.adjustments.map((l) => '  - ' + l).join('\n') || '  none'}\nVault picks: ${sel.recommendation.vaultPicks.slice(0, 10).map((v) => v.id + (v.missingDeps.length ? ' (needs ' + v.missingDeps.join(',') + ')' : '')).join(', ')}`);
      }
      break;
    }
    case 'presets': {
      const { listPresets, DIMENSIONS } = await import('../src/intelligence/selector.js');
      if (flags.json) json({ presets: listPresets(), dimensions: DIMENSIONS });
      else { console.log('Named presets:'); for (const p of listPresets()) console.log(`  ${p.id.padEnd(28)} ${p.auto ? 'auto-recommend from the scan' : `${p.style} / ${p.pageType} / ${p.platform} / ${p.theme} / ${p.density} / ${p.motion}`}`); console.log('\nDimensions:'); for (const [k, v] of Object.entries(DIMENSIONS)) console.log(`  ${k.padEnd(12)} ${v.join(', ')}`); }
      break;
    }
    case 'adapters': { const { listAdapters } = await import('../src/adapters/registry.js'); json(listAdapters()); break; }
    case 'apply': {
      const { Governor } = await import('../src/core/governor.js');
      const { DEFAULT_VAULT_DIR } = await import('../src/vault/index.js');
      const g = new Governor({ projectRoot: path.resolve(positional[0] || '.'), vaultDir: flags.vault || DEFAULT_VAULT_DIR, logger });
      const r = await g.apply({ selection: selectionFromFlags(), verifyMode: flags.verify || 'standard', decide: flags.decide || 'auto', preview: !flags['no-preview'], baseline: !flags['no-baseline'], allowUnsupported: !!flags['allow-unsupported'], maxPages: flags['max-pages'] ? +flags['max-pages'] : undefined });
      json(r);
      process.exit(r.verdict === 'PASS' ? 0 : r.verdict === 'PENDING' ? 2 : 1);
    }
    // eslint-disable-next-line no-fallthrough
    case 'verify': {
      const { scanProject } = await import('../src/intelligence/scanner.js');
      const { pickAdapter } = await import('../src/adapters/registry.js');
      const { runVerification } = await import('../src/verify/runner.js');
      const root = path.resolve(positional[0] || '.');
      const s = await scanProject(root, { logger });
      const adapter = pickAdapter(s);
      const pages = s.pages.filter((p) => !p.dynamic).map((p) => p.route).slice(0, +(flags['max-pages'] || 6));
      let running = null;
      try {
        let baseUrl = flags.url;
        if (!baseUrl) { const srv = adapter.serve({ scan: s, logger }); if (!srv) throw new Error('adapter cannot serve this project; pass --url'); running = await srv.start(); baseUrl = running.baseUrl; }
        const outDir = path.join(root, '.kk-governor', 'verify-' + Date.now());
        const v = await runVerification({ baseUrl, pages: pages.length ? pages : ['/'], mode: flags.verify || 'standard', outDir, logger, label: 'current' });
        json({ ok: v.ok, mode: v.mode, engine: v.engine, pages: v.pages, checks: v.checks.map((c) => ({ id: c.id, status: c.status, count: c.count, summary: c.summary })), outDir });
        process.exit(v.ok ? 0 : 1);
      } finally { await running?.stop(); }
    }
    // eslint-disable-next-line no-fallthrough
    case 'keep': case 'rollback': case 'status': case 'recover': case 'report': {
      const { Governor } = await import('../src/core/governor.js');
      const g = new Governor({ projectRoot: path.resolve(positional[0] || '.'), logger });
      if (cmd === 'keep') json(await g.keep(positional[1]));
      else if (cmd === 'rollback') json(await g.rollback(positional[1]));
      else if (cmd === 'status') json((await g.status()).map((m) => ({ id: m.id, state: m.state, decision: m.decision, createdAt: m.createdAt, files: (m.files || []).length })));
      else if (cmd === 'recover') json(await g.recover());
      else json({ report: path.join(g.projectRoot, '.kk-governor', 'tx', positional[1], 'REPORT.html') });
      break;
    }
    case 'vault': {
      const sub = positional[0];
      const { setupVault, verifyVault, Catalog, DEFAULT_VAULT_DIR } = await import('../src/vault/index.js');
      const vaultDir = flags.vault || DEFAULT_VAULT_DIR;
      if (sub === 'setup') { const r = await setupVault({ vaultDir, offline: !!flags.offline, logger }); json({ complete: r.complete, assetsHarvested: r.assetsHarvested, assetsRequested: r.assetsRequested, filesWritten: r.filesWritten, errors: r.errors }); process.exit(r.complete ? 0 : 1); }
      else if (sub === 'verify') { const v = await verifyVault(vaultDir); json(v); process.exit(v.ok ? 0 : 1); }
      else if (sub === 'list') { const c = await Catalog.load(vaultDir); json({ count: c.size, categories: c.categories(), assets: c.assets.map((a) => ({ id: a.id, category: a.category, license: a.license, commit: a.sourceCommit.slice(0, 8), framework: a.framework, deps: a.dependencies })) }); }
      else if (sub === 'search') { const c = await Catalog.load(vaultDir); const r = c.search({ text: positional.slice(1).join(' '), style: flags.style, pageType: flags.page, framework: flags.framework, category: flags.category, platform: flags.platform, device: flags.device, maxPerf: flags['max-perf'], limit: +(flags.limit || 20) }); json(r.map((x) => ({ id: x.asset.id, score: x.score, category: x.asset.category, license: x.asset.license, deps: x.asset.dependencies, perf: x.asset.performanceCost, darkMode: x.asset.darkMode, upstream: `${x.asset.upstream.repo}@${x.asset.sourceCommit.slice(0, 8)}` }))); }
      else { console.log(HELP); process.exit(1); }
      break;
    }
    case 'help': case undefined: case '--help': case '-h': console.log(HELP); break;
    default: console.error(`unknown command "${cmd}"\n`); console.log(HELP); process.exit(1);
  }
} catch (err) {
  logger.error(String(err.stack || err));
  process.exit(1);
}
