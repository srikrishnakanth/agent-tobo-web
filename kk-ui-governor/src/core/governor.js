// The Governor: orchestrates Inspect → Select → Adapt → Probe → Preview → Write → Verify → Keep/Rollback
// on top of the transaction journal, safety gates, audit and reporting.
import path from 'node:path';
import fsp from 'node:fs/promises';
import { Transaction, TX_STATES, recoverAll } from './journal.js';
import { preflightAudit, postWriteAudit } from './audit.js';
import { runSafetyGates } from './safety-gates.js';
import { writeReport } from './report.js';
import { Logger } from './logger.js';
import { writeJson, readJson, exists } from './fsutil.js';
import { scanProject } from '../intelligence/scanner.js';
import { resolveSelection } from '../intelligence/selector.js';
import { buildTokens } from '../pipeline/tokens.js';
import { pickAdapter } from '../adapters/registry.js';
import { probeCandidate } from '../pipeline/probe.js';
import { buildPreview } from '../pipeline/preview.js';
import { runVerification, staticVerification, browserAvailable, compareGuards, browserDiagnostics } from '../verify/runner.js';
import { runBuildCheck, shouldBuildCheck } from '../verify/build-check.js';
import { Catalog } from '../vault/catalog.js';
import { DEFAULT_VAULT_DIR } from '../vault/index.js';

export const VERSION = '1.0.0';

export class Governor {
  constructor({ projectRoot, vaultDir = DEFAULT_VAULT_DIR, logger = null } = {}) {
    this.projectRoot = path.resolve(projectRoot);
    this.vaultDir = vaultDir;
    this.logger = logger || new Logger({ prefix: 'kkgov' });
  }

  async loadConfig() {
    const f = path.join(this.projectRoot, 'kkgov.config.json');
    return (await exists(f)) ? readJson(f, {}) : {};
  }

  /**
   * Full transaction. Returns { txId, verdict, decision, reportPath, ... }.
   * options: { selection, verifyMode: 'quick'|'standard'|'full'|'static', decide: 'auto'|'ask'|'rollback', preview: true, baseline: true, allowUnsupported: false }
   */
  async apply(options = {}) {
    const log = this.logger;
    const startedAt = new Date().toISOString();
    const verifyMode = options.verifyMode || 'standard';
    const decide = options.decide || 'auto';
    const config = await this.loadConfig();
    const input = { ...(config.selection || {}), ...(options.selection || {}) };

    // ---- recovery of anything left half-done by a previous crash
    const recovered = await recoverAll(this.projectRoot, { logger: log });
    if (recovered.length) log.warn(`recovered ${recovered.length} interrupted transaction(s)`);

    // ---- audit (pre-flight)
    const preflight = await preflightAudit(this.projectRoot);
    if (!preflight.ok) throw new Error(`pre-flight audit failed: ${preflight.checks.filter((c) => c.status === 'fail').map((c) => c.id + ': ' + c.note).join('; ')}`);

    const tx = await Transaction.open(this.projectRoot, { logger: log, options: { verifyMode, decide, input } });
    log.info(`transaction ${tx.id} opened for ${this.projectRoot}`);
    const report = { version: VERSION, txId: tx.id, startedAt, project: { root: this.projectRoot }, audit: { preflight }, stages: tx.manifest.stages, recovered };
    let verdict = 'FAIL', decision = null, decisionReason = '';
    let scan, selection, tokens, adapter, plan, probe, gates, preview = null, verification = null, baselineResult = null, baselineBuild = null, catalog;

    try {
      // ---- 1. INSPECT
      await tx.stage('inspect', 'running');
      scan = await scanProject(this.projectRoot, { logger: log });
      report.project.name = scan.name;
      await writeJson(path.join(tx.dir, 'inspect.json'), sanitizeScan(scan));
      report.scan = sanitizeScan(scan);
      await tx.stage('inspect', 'done', { framework: scan.framework.name, cssStack: scan.cssStack.map((c) => c.name), pages: scan.pages.length, uxProblems: scan.uxProblems.length, genericPatterns: scan.genericPatterns.length, brand: scan.brand.primaryColor });

      // ---- 2. SELECT
      await tx.stage('select', 'running');
      catalog = await Catalog.load(this.vaultDir);
      if (catalog.data?.missing) log.warn(`design vault not found at ${this.vaultDir}; run the bootstrap. Continuing with system fonts and no vault assets.`);
      const sel = resolveSelection(input, scan, catalog);
      if (!sel.ok) throw new StageError('select', `invalid selection: ${sel.errors.join('; ')}`);
      selection = sel.selection;
      tokens = buildTokens(selection, scan, catalog);
      report.selection = summarizeSelection(selection);
      report.recommendation = { ...selection.recommendation, vaultPicks: selection.recommendation.vaultPicks.slice(0, 15) };
      report.adjustments = sel.adjustments;
      report.tokens = { color: { primary: tokens.color.primary, primarySource: tokens.color.primarySource, light: tokens.color.light, dark: tokens.color.dark, contrastReport: tokens.color.contrastReport }, typography: { display: tokens.typography.display, body: tokens.typography.body, families: tokens.typography.families }, motion: tokens.motion, density: tokens.density };
      await writeJson(path.join(tx.dir, 'selection.json'), { selection: report.selection, adjustments: sel.adjustments, recommendation: report.recommendation });
      await writeJson(path.join(tx.dir, 'tokens.json'), tokens);
      // A global run restyles every route. If the project looks like it has an authenticated area,
      // say so loudly rather than letting someone discover it on the dashboard afterwards.
      if (!selection.scopeSelector) {
        const authish = scan.pages.filter((p) => /dashboard|admin|account|settings|billing|inbox|app\/|console|portal/i.test(p.route)).map((p) => p.route);
        const authPages = (scan.pageTypes?.ranked || []).some((r) => ['dashboard', 'admin', 'crm', 'settings', 'inbox'].includes(r.type) && r.score > 2);
        if (authish.length || authPages) {
          log.warn(`GLOBAL run: this styles EVERY route, including what look like signed-in pages${authish.length ? ' (' + authish.slice(0, 5).join(', ') + ')' : ''}. Use --landing-only to confine the change to the landing page and prove the rest is unchanged.`);
          report.globalScopeWarning = { routesThatLookAuthenticated: authish.slice(0, 10) };
        }
      }
      await tx.stage('select', 'done', { ...report.selection, adjustments: sel.adjustments, vaultAssets: tokens.assets.length });

      // ---- 3. ADAPT
      await tx.stage('adapt', 'running');
      adapter = pickAdapter(scan);
      report.adapter = { id: adapter.id, status: adapter.status };
      plan = await adapter.plan({ scan, selection, tokens, catalog, logger: log, vaultDir: this.vaultDir });
      for (const op of plan.ops) await tx.stageFile(op.path, op.content);
      report.plan = { files: plan.ops.map((o) => ({ path: o.path, kind: o.kind, owned: !!o.owned, bytes: Buffer.byteLength(String(o.content)) })), notes: plan.notes, manualSteps: plan.manualSteps, remediations: plan.remediations, pages: plan.pages, fontsInlined: plan.fontsInlined };
      report.assets = plan.assets;
      await tx.stage('adapt', 'done', { adapter: adapter.id, files: plan.ops.length, creates: plan.ops.filter((o) => o.kind === 'create').length, modifies: plan.ops.filter((o) => o.kind === 'modify').length, notes: plan.notes, remediations: plan.remediations });

      // ---- 4. PROBE + SAFETY GATES
      await tx.stage('probe', 'running');
      probe = await probeCandidate(plan, { projectRoot: this.projectRoot, logger: log });
      gates = runSafetyGates({ plan, scan, selection, probe });
      report.probe = probe; report.safetyGates = gates;
      await tx.stage('probe', gates.ok ? 'done' : 'failed', { probeOk: probe.ok, probeErrors: probe.errors.length, gatesFailed: gates.failed });
      if (!gates.ok) throw new StageError('probe', `safety gates failed: ${gates.failed.join(', ')}`);
      if (plan.unsupported && !options.allowUnsupported) throw new StageError('adapt', `unsupported framework "${scan.framework.name}": tokens-only candidate staged in ${tx.candidateDir} but not applied (pass --allow-unsupported to write tokens only)`, 'UNSUPPORTED');

      // ---- 5. PREVIEW (current vs candidate, before any write) + baseline verification
      await tx.stage('preview', 'running');
      const pages = (plan.pages && plan.pages.length ? plan.pages : ['/']).slice(0, options.maxPages || 6);
      // Scoped run: every OTHER route is a guard route. Its computed styling is captured before and
      // after the write and must come back identical - that is the proof that an authenticated
      // dashboard (or any other page) was not redesigned.
      const guardCap = options.maxGuardPages || 4;
      const guardCandidates = selection.scopeSelector
        ? scan.pages.filter((p) => !p.dynamic).map((p) => p.route).filter((r) => !pages.includes(r))
        : [];
      const guardPages = guardCandidates.slice(0, guardCap);
      // Never let a cap pass silently as full coverage.
      const guardSkipped = guardCandidates.slice(guardCap);
      const dynamicRoutes = selection.scopeSelector ? scan.pages.filter((p) => p.dynamic).map((p) => p.route) : [];
      if (guardPages.length) log.info(`scoped run: guarding ${guardPages.length} route(s) against any visual change: ${guardPages.join(', ')}`);
      if (guardSkipped.length) log.warn(`guard cap ${guardCap} reached: ${guardSkipped.length} route(s) NOT checked for changes (${guardSkipped.join(', ')}) - raise --max-guard-pages to cover them`);
      if (dynamicRoutes.length) log.warn(`${dynamicRoutes.length} dynamic route(s) cannot be guarded automatically: ${dynamicRoutes.join(', ')}`);
      const haveBrowser = verifyMode !== 'static' && (await browserAvailable(this.projectRoot));
      const server = adapter.serve({ scan, logger: log });
      if (options.preview !== false) {
        try { preview = await buildPreview({ tx, scan, plan, adapter, pages, logger: log, browserAvailable: haveBrowser }); }
        catch (e) { log.warn(`preview failed: ${e.message}`); preview = { notes: [`preview failed: ${e.message}`] }; }
      }
      if (haveBrowser && server && options.baseline !== false) {
        let running = null;
        try {
          running = await server.start();
          baselineResult = await runVerification({ baseUrl: running.baseUrl, pages, guardPages, mode: verifyMode, outDir: path.join(tx.previewDir, 'baseline'), logger: log, label: 'baseline', screenshots: false, projectRoot: this.projectRoot, storageState: options.authStorageState || null });
          log.info(`baseline: ${baselineResult.ok ? 'clean' : baselineResult.checks.filter((c) => c.status === 'fail').map((c) => c.id + '=' + c.count).join(' ')}`);
        } catch (e) { log.warn(`baseline verification skipped: ${e.message}`); }
        finally { await running?.stop(); }
      }
      // Baseline production build: an already-broken build is never blamed on the candidate.
      if (options.build !== false && shouldBuildCheck(scan, adapter.id)) {
        baselineBuild = await runBuildCheck(scan, { logger: log, label: 'baseline' });
        report.baselineBuild = { ok: baselineBuild.ok, skipped: baselineBuild.skipped, command: baselineBuild.command, durationMs: baselineBuild.durationMs };
      }
      report.preview = preview; report.baseline = baselineResult ? { ok: baselineResult.ok, counts: baselineResult.counts, checks: baselineResult.checks.map((c) => ({ id: c.id, status: c.status, count: c.count })) } : null;
      await tx.stage('preview', 'done', { browser: haveBrowser, current: !!preview?.current, candidate: !!preview?.candidate, baseline: baselineResult ? baselineResult.counts : 'skipped' });

      // ---- 6. WRITE (journaled, backed up, atomic)
      await tx.setState(TX_STATES.STAGED);
      await tx.stage('write', 'running');
      await tx.applyOps(plan.ops);
      const post = await postWriteAudit(tx);
      report.audit.postWrite = post;
      if (!post.ok) throw new StageError('write', 'post-write audit failed (integrity mismatch)');
      report.files = tx.manifest.files;
      await tx.stage('write', 'done', { files: tx.manifest.files.length, integrity: post.ok });

      // ---- 7. VERIFY
      await tx.stage('verify', 'running');
      if (haveBrowser && server) {
        let running = null;
        try {
          running = await server.start();
          verification = await runVerification({ baseUrl: running.baseUrl, pages, guardPages, mode: verifyMode, outDir: tx.verifyDir, baseline: baselineResult, logger: log, label: 'candidate', themeMode: selection.theme, scopeSelector: selection.scopeSelector, scopeAutoApplied: plan.scopeAutoApplied !== false, projectRoot: this.projectRoot, storageState: options.authStorageState || null });
          // UNCHANGED-ROUTES: compare guard-route style signatures captured before and after the write.
          if (guardPages.length) {
            const cmp = compareGuards(baselineResult?.guards, verification.guards);
            const fails = cmp.findings.filter((f) => f.severity === 'fail');
            const uncaptured = cmp.findings.filter((f) => f.severity !== 'fail');
            // Fail closed: this check exists to PROVE other routes did not change. If a signature
            // could not be captured, the proof is missing and the run must not be kept on trust.
            const proven = cmp.compared > 0 && uncaptured.length === 0;
            const notes = [];
            if (guardSkipped.length) notes.push(`${guardSkipped.length} route(s) beyond --max-guard-pages ${guardCap} were NOT checked: ${guardSkipped.join(', ')}`);
            if (dynamicRoutes.length) notes.push(`${dynamicRoutes.length} dynamic route(s) cannot be guarded: ${dynamicRoutes.join(', ')}`);
            if (cmp.redirected?.length) notes.push(`${cmp.redirected.length} route(s) redirected away (likely an auth guard) and were NOT proven: ${cmp.redirected.map((r) => r.route + ' -> ' + r.baselineFinal).join(', ')} - pass --auth-storage-state to sign in`);
            const check = {
              id: 'UNCHANGED-ROUTES', name: 'Routes outside the upgraded scope are byte-identical in computed style',
              status: fails.length || !proven ? 'fail' : 'pass',
              count: fails.length || (proven ? 0 : 1), baselineCount: null,
              summary: [
                fails.length ? `${fails.length} guard route/device pair(s) changed - the scope leaked`
                  : proven ? `${cmp.compared} guard route/device pair(s) identical before and after`
                  : `could not prove routes unchanged (${cmp.compared} compared, ${uncaptured.length} signature(s) unavailable)`,
                ...notes,
              ].join(' | '),
              findings: cmp.findings.map((f) => ({ check: 'UNCHANGED-ROUTES', device: f.device, page: f.page, severity: f.severity === 'fail' ? 'fail' : 'fail', message: f.message, ...(f.examples ? { data: f.examples } : {}) })),
              coverage: { guarded: guardPages, skipped: guardSkipped, dynamicUnguarded: dynamicRoutes, redirectedUnproven: cmp.redirected || [], comparedPairs: cmp.compared },
            };
            const existing = verification.checks.findIndex((c) => c.id === 'UNCHANGED-ROUTES');
            if (existing >= 0) verification.checks[existing] = check; else verification.checks.push(check);
            verification.ok = verification.checks.every((c) => c.status !== 'fail');
            verification.counts['UNCHANGED-ROUTES'] = check.count;
          }
          if (preview && !preview.candidate?.url) { const shot = verification.devices.find((d) => d.id === 'laptop-1280')?.screenshots?.[0]; if (shot) preview.candidate = { file: shot.file, note: 'captured after write, before keep/rollback decision' }; }
        } catch (e) { log.error(`verification could not run: ${e.message}`); verification = { ok: false, mode: verifyMode, engine: 'none', pages, devices: [], checks: [{ id: 'RUN', name: 'verification run', status: 'fail', count: 1, summary: e.message, findings: [] }] }; }
        finally { await running?.stop(); }
      } else {
        verification = staticVerification(plan, tokens);
        verification.note = haveBrowser
          ? 'adapter cannot serve this project; static verification only'
          : `no browser available; static verification only. ${browserDiagnostics.lastError || ''}`.trim();
        verification.browserDiagnostics = { resolvedFrom: browserDiagnostics.resolvedFrom, lastError: browserDiagnostics.lastError, attempts: browserDiagnostics.attempts.slice(0, 8) };
        if (verifyMode !== 'static') verification.ok = false; // partial success is not completion
        log.warn(`static verification only: ${verification.note}`);
      }
      // Production build check: a design that compiles in dev but breaks `npm run build` is a failure
      // the browser matrix cannot see. Compared against the baseline build so pre-existing breakage
      // is reported as a warning, never charged to the candidate.
      if (options.build !== false && shouldBuildCheck(scan, adapter.id)) {
        const candidateBuild = await runBuildCheck(scan, { logger: log, label: 'candidate' });
        report.build = { ok: candidateBuild.ok, command: candidateBuild.command, exitCode: candidateBuild.exitCode, durationMs: candidateBuild.durationMs, timedOut: candidateBuild.timedOut, baselineOk: baselineBuild ? baselineBuild.ok : null };
        const baselineBroken = baselineBuild && !baselineBuild.ok;
        const status = candidateBuild.ok ? 'pass' : baselineBroken ? 'warn' : 'fail';
        verification.checks.push({
          id: 'BUILD', name: "Project's own production build", status,
          count: status === 'fail' ? 1 : 0, baselineCount: baselineBroken ? 1 : 0,
          summary: candidateBuild.ok ? `${candidateBuild.command} succeeded in ${Math.round(candidateBuild.durationMs / 1000)}s`
            : baselineBroken ? `build fails, but it already failed before this change (pre-existing); not charged to the candidate`
            : `${candidateBuild.command} failed (exit ${candidateBuild.exitCode}${candidateBuild.timedOut ? ', timed out' : ''})`,
          findings: candidateBuild.ok ? [] : [{ check: 'BUILD', device: 'build', page: '-', severity: status === 'fail' ? 'fail' : 'warn', message: String(candidateBuild.output || candidateBuild.error || '').slice(0, 4000) }],
        });
        if (status === 'fail') verification.ok = false;
      }
      // A scoped run on React/Next stages the design without activating it: nothing is imported
      // globally and the landing page is not wrapped yet, so the rendered page is byte-identical to
      // the baseline. Page-level checks therefore describe the PROJECT'S OWN pre-existing state, not
      // this change - and rolling back on them would delete the KkScope component the user needs in
      // order to activate the design at all, making the feature impossible to use.
      const scopeCheck = verification.checks?.find((c) => c.id === 'SCOPE-ACTIVE');
      const stagedInactive = !!selection.scopeSelector && plan.scopeAutoApplied === false
        && !!scopeCheck && (scopeCheck.findings || []).length > 0;
      if (stagedInactive) {
        verification.stagedInactive = true;
        const pageLevelFailures = verification.checks.filter((c) => c.status === 'fail' && c.id !== 'SCOPE-ACTIVE').map((c) => c.id);
        verification.stagedNote = pageLevelFailures.length
          ? `the design is staged but not active, so these are the project's existing issues on an unchanged page, not regressions: ${pageLevelFailures.join(', ')}. Wrap the landing page in <KkScope> and re-run to have them judged against the applied design.`
          : 'the design is staged but not active; no page-level issues were found on the unchanged page.';
        // Correctness of what was actually produced is still fully gated: safety gates, probe and
        // the project's own production build all had to pass to reach this point.
        verification.ok = true;
        log.warn(`staged-only run: ${verification.stagedNote}`);
      }
      report.verification = verification;
      await tx.setState(TX_STATES.VERIFIED);
      await tx.stage('verify', verification.ok ? 'done' : 'failed', { ok: verification.ok, mode: verification.mode, failed: verification.checks.filter((c) => c.status === 'fail').map((c) => c.id), warned: verification.checks.filter((c) => c.status === 'warn').map((c) => c.id), loads: verification.loads });

      // ---- 8. KEEP / ROLLBACK
      await tx.stage('decide', 'running');
      if (!verification.ok) {
        const failedIds = verification.checks.filter((c) => c.status === 'fail').map((c) => c.id);
        decision = 'rollback';
        decisionReason = failedIds.length
          ? `verification failed: ${failedIds.join(', ')}`
          : `verification could not prove the change is safe: ${verification.note || 'no browser-backed verification ran'}`;
        const rb = await tx.rollback(decisionReason);
        report.rollback = rb;
        verdict = 'FAIL';
        if (!rb.ok) {
          // The project is now in a mixed state: say so loudly rather than reporting a clean failure.
          decisionReason += ` | ROLLBACK INCOMPLETE: ${rb.problems.length} file(s) could not be restored - restore them from ${tx.backupDir}`;
          log.error(`rollback incomplete: ${rb.problems.length} file(s) not restored`, rb.problems.slice(0, 10));
        }
      } else if (stagedInactive && decide !== 'rollback') {
        // Nothing is visible yet, so there is nothing for a human to review: 'ask' would be
        // meaningless here. Keep the staged files - they are inert until the wrap - and say what to do.
        await tx.keep('design staged for activation');
        decision = 'keep'; verdict = 'STAGED';
        decisionReason = `design STAGED, not yet visible. Every safety gate, the probe and the project's own production build passed. Next: wrap ONLY the landing page's content in <KkScope>, then re-run apply to verify the applied design across the device matrix. ${verification.stagedNote || ''}`.trim();
      } else if (decide === 'ask') {
        decision = 'pending'; decisionReason = 'verification passed; awaiting `kkgov keep` / `kkgov rollback`';
        await tx.setState(TX_STATES.PENDING); verdict = 'PENDING';
      } else if (decide === 'rollback') {
        decision = 'rollback'; decisionReason = 'rollback requested (dry run)';
        report.rollback = await tx.rollback(decisionReason); verdict = 'PASS';
      } else {
        await tx.keep(stagedInactive ? 'design staged for activation' : 'verification passed');
        decision = 'keep';
        verdict = stagedInactive ? 'STAGED' : 'PASS';
        decisionReason = stagedInactive
          ? `design STAGED, not yet visible. Every safety gate, the probe and the project's own production build passed. Next: wrap ONLY the landing page's content in <KkScope>, then re-run apply to verify the applied design across the device matrix. ${verification.stagedNote || ''}`.trim()
          : 'verification passed on every gate';
      }
      await tx.stage('decide', 'done', { decision, reason: decisionReason });
    } catch (err) {
      const stage = err.stage || 'unknown';
      log.error(`${stage}: ${err.message}`);
      report.error = { stage, message: err.message, stack: String(err.stack || '').split('\n').slice(0, 6).join('\n') };
      if (tx.needsRecovery()) { decision = 'rollback'; decisionReason = `error during ${stage}: ${err.message}`; report.rollback = await tx.rollback(decisionReason); }
      else if (tx.state !== TX_STATES.ROLLED_BACK) { await tx.fail(`${stage}: ${err.message}`); decision = 'abort'; decisionReason = err.message; }
      verdict = err.verdict || 'FAIL';
      if (tx.manifest.stages[stage]?.status === 'running') await tx.stage(stage, 'failed', { error: err.message });
    }

    report.finishedAt = new Date().toISOString();
    report.decision = decision; report.decisionReason = decisionReason; report.verdict = verdict; report.state = tx.state;
    report.journal = await tx.readJournal();
    report.log = log.entries.slice(-400);
    report.stages = tx.manifest.stages;
    const paths = await writeReport(tx, report);
    log.info(`verdict ${verdict} (${decision || 'n/a'}) — report: ${paths.html}`);
    return { txId: tx.id, verdict, decision, decisionReason, state: tx.state, reportPath: paths.html, reportJson: paths.json, txDir: tx.dir, verification: verification ? { ok: verification.ok, failed: verification.checks.filter((c) => c.status === 'fail').map((c) => c.id) } : null, files: (tx.manifest.files || []).map((f) => f.path) };
  }

  async keep(txId) {
    const tx = await Transaction.load(this.projectRoot, txId, { logger: this.logger });
    await tx.keep('kept by user');
    await this._refreshReport(tx, 'keep', 'kept by user', 'PASS');
    return { txId, state: tx.state };
  }

  async rollback(txId) {
    const tx = await Transaction.load(this.projectRoot, txId, { logger: this.logger });
    if (tx.state === TX_STATES.ROLLED_BACK) return { txId, state: tx.state, note: 'already rolled back' };
    const r = await tx.rollback('rollback by user');
    await this._refreshReport(tx, 'rollback', r.ok ? 'rolled back by user' : `rollback INCOMPLETE: ${r.problems.length} file(s) not restored`, r.ok ? 'ROLLED_BACK' : 'ROLLBACK_FAILED');
    if (!r.ok) this.logger.error(`rollback incomplete for ${txId}`, r.problems.slice(0, 10));
    return { txId, state: tx.state, ...r };
  }

  async _refreshReport(tx, decision, reason, verdict) {
    const f = path.join(tx.dir, 'REPORT.json');
    if (!(await exists(f))) return;
    const report = await readJson(f);
    report.decision = decision; report.decisionReason = reason; report.verdict = verdict; report.state = tx.state; report.journal = await tx.readJournal(); report.stages = tx.manifest.stages;
    await writeReport(tx, report);
  }

  async status() { return Transaction.list(this.projectRoot); }
  async recover() { return recoverAll(this.projectRoot, { logger: this.logger }); }
}

class StageError extends Error { constructor(stage, message, verdict) { super(message); this.stage = stage; this.verdict = verdict; } }

function sanitizeScan(scan) {
  const { _files, ...rest } = scan;
  return { ...rest, components: { summary: scan.components.summary, existing: scan.components.existing, hasDesignSystem: scan.components.hasDesignSystem, list: scan.components.list.slice(0, 60) }, colors: { ...scan.colors, top: scan.colors.top.slice(0, 15) } };
}
function summarizeSelection(s) {
  const { recommendation, ...rest } = s;
  return { ...rest, fontDisplay: s.fontDisplay?.family || s.fontDisplay?.id, fontBody: s.fontBody?.family || s.fontBody?.id, fontMono: s.fontMono?.family || s.fontMono?.id };
}
