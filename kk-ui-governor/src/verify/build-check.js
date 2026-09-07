// Production build check. A design that compiles in dev but breaks `npm run build` is a failure the
// browser matrix cannot see, so the Governor runs the project's own build command after writing and
// compares it against a baseline build of the untouched project (an already-broken build is never
// blamed on the candidate).
import path from 'node:path';
import { spawn } from 'node:child_process';

const SKIP = new Set(['html', 'unsupported']);

export function buildCommandFor(scan) {
  const scripts = scan?.packageJson?.scripts || {};
  if (!scripts.build) return null;
  return { command: 'npm', args: ['run', 'build', '--silent'], script: scripts.build };
}

export function shouldBuildCheck(scan, adapterId) {
  if (SKIP.has(adapterId)) return false;
  return !!buildCommandFor(scan);
}

/**
 * Run the project's build. Returns { ok, skipped, command, exitCode, durationMs, output, timedOut }.
 * The build runs with the project's own tooling; nothing is installed or modified.
 */
export async function runBuildCheck(scan, { timeoutMs = 600000, logger, label = 'candidate' } = {}) {
  const cmd = buildCommandFor(scan);
  if (!cmd) return { ok: true, skipped: true, reason: 'no build script' };
  const started = Date.now();
  logger?.info(`${label} build check: ${cmd.command} ${cmd.args.join(' ')} (${cmd.script})`);
  return new Promise((resolve) => {
    let output = '';
    let timedOut = false;
    const proc = spawn(cmd.command, cmd.args, {
      cwd: scan.root,
      env: { ...process.env, CI: '1', NEXT_TELEMETRY_DISABLED: '1', FORCE_COLOR: '0', NODE_ENV: undefined },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
    });
    const onData = (d) => { output += d.toString(); if (output.length > 400000) output = output.slice(-200000); };
    proc.stdout.on('data', onData);
    proc.stderr.on('data', onData);
    const timer = setTimeout(() => {
      timedOut = true;
      try { if (process.platform !== 'win32') process.kill(-proc.pid, 'SIGKILL'); else proc.kill(); } catch { /* gone */ }
    }, timeoutMs);
    proc.on('error', (err) => {
      clearTimeout(timer);
      resolve({ ok: false, skipped: false, command: `${cmd.command} ${cmd.args.join(' ')}`, exitCode: null, durationMs: Date.now() - started, output: String(err.message), error: String(err.message) });
    });
    proc.on('exit', (code) => {
      clearTimeout(timer);
      const ok = code === 0 && !timedOut;
      logger?.[ok ? 'info' : 'error'](`${label} build check ${ok ? 'passed' : `FAILED (exit ${code}${timedOut ? ', timed out' : ''})`} in ${Math.round((Date.now() - started) / 1000)}s`);
      resolve({ ok, skipped: false, command: `${cmd.command} ${cmd.args.join(' ')}`, script: cmd.script, exitCode: code, timedOut, durationMs: Date.now() - started, output: extractErrors(output) });
    });
  });
}

/** Keep the parts of a build log a human needs: error blocks and the tail. */
export function extractErrors(output) {
  const lines = output.split('\n');
  const keep = [];
  for (let i = 0; i < lines.length; i++) {
    if (/error|failed to compile|Type error|Module not found|cannot find|ERR!/i.test(lines[i])) {
      for (let j = Math.max(0, i - 2); j < Math.min(lines.length, i + 12); j++) if (!keep.includes(lines[j])) keep.push(lines[j]);
    }
  }
  const tail = lines.slice(-25);
  const all = [...keep, '--- tail ---', ...tail].filter((l) => !/^\s*\d+: <unknown>$/.test(l) && !/at \/home\/iojs|threadpool\.c|pthread_create|clone3|_ZZN4node/.test(l));
  return all.join('\n').slice(0, 8000);
}
