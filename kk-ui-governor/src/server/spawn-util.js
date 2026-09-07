// Cross-platform process helpers.
//
// Two Windows problems this solves:
//
// 1. `spawn('npx', ...)` cannot run on Windows without a shell (npx is npx.cmd), and running it WITH
//    a shell wraps the real server in a cmd.exe process. Killing the child then kills only the
//    wrapper — the dev server keeps running, keeps holding file handles inside the project, and the
//    governor's rollback fails with EPERM/EBUSY on the files it is trying to restore.
//    resolveLocalBin() sidesteps npx entirely by resolving the package's own JS entry point from the
//    project's node_modules and running it with the current Node binary: no shell, no wrapper, and
//    arguments are passed as an array so paths containing spaces are never re-parsed.
//
// 2. `process.kill(-pid)` (process-group kill) is POSIX-only. killTree() uses taskkill /T on Windows
//    so the whole tree dies, and a process-group kill elsewhere.
import fsp from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

/**
 * Resolve a package's executable JS entry inside a project's node_modules.
 * @param {string} projectRoot
 * @param {string} pkg package name, e.g. 'next' | 'vite' | 'react-scripts'
 * @param {string} [binName] bin key to prefer when package.json#bin is an object (defaults to pkg)
 * @returns {Promise<string|null>} absolute path to the JS entry, or null when not installed
 */
export async function resolveLocalBin(projectRoot, pkg, binName = pkg) {
  const pkgDir = path.join(projectRoot, 'node_modules', ...pkg.split('/'));
  let manifest;
  try { manifest = JSON.parse(await fsp.readFile(path.join(pkgDir, 'package.json'), 'utf8')); } catch { return null; }
  const bin = manifest.bin;
  let rel = null;
  if (typeof bin === 'string') rel = bin;
  else if (bin && typeof bin === 'object') rel = bin[binName] || bin[pkg] || Object.values(bin)[0];
  if (!rel) return null;
  const abs = path.join(pkgDir, rel);
  try { await fsp.access(abs); } catch { return null; }
  return abs;
}

/**
 * Build a spawn recipe for a project-local CLI, preferring the resolved JS entry.
 * Falls back to npx (with a shell on Windows) only when the package is not installed locally.
 * @returns {Promise<{command: string, args: string[], shell: boolean, viaNode: boolean}>}
 */
export async function localCliCommand(projectRoot, pkg, args, binName = pkg) {
  const entry = await resolveLocalBin(projectRoot, pkg, binName);
  if (entry) return { command: process.execPath, args: [entry, ...args], shell: false, viaNode: true };
  return { command: 'npx', args: [binName, ...args], shell: process.platform === 'win32', viaNode: false };
}

/**
 * Kill a child process and everything it spawned.
 * Windows has no process groups, so use taskkill /T /F; elsewhere signal the group.
 * @param {import('node:child_process').ChildProcess} proc
 * @param {object} [opts]
 * @param {number} [opts.graceMs=800] wait between the polite and forceful signal (POSIX only)
 */
export async function killTree(proc, { graceMs = 800 } = {}) {
  if (!proc || proc.exitCode !== null || proc.signalCode !== null) return;
  const pid = proc.pid;
  if (!pid) return;
  if (process.platform === 'win32') {
    await new Promise((resolve) => {
      const t = spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
      const done = () => resolve();
      t.on('exit', done);
      t.on('error', () => { try { proc.kill(); } catch { /* already gone */ } done(); });
      setTimeout(done, 5000);
    });
    return;
  }
  try { process.kill(-pid, 'SIGTERM'); } catch { try { proc.kill('SIGTERM'); } catch { /* gone */ } }
  await new Promise((r) => setTimeout(r, graceMs));
  try { process.kill(-pid, 'SIGKILL'); } catch { /* already gone */ }
}
