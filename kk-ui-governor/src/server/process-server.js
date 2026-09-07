// Spawns a framework dev server (next dev, vite, react-scripts) on a free port and waits for it.
import { spawn } from 'node:child_process';
import { localCliCommand, killTree } from './spawn-util.js';
import net from 'node:net';
import path from 'node:path';
import http from 'node:http';

export async function freePort() {
  return new Promise((resolve, reject) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); s.on('error', reject); });
}

export async function waitForHttp(url, { timeoutMs = 120000, intervalMs = 500 } = {}) {
  const start = Date.now();
  let lastErr = null;
  while (Date.now() - start < timeoutMs) {
    const ok = await new Promise((resolve) => { const req = http.get(url, (res) => { res.resume(); resolve(res.statusCode < 500); }); req.on('error', (e) => { lastErr = e; resolve(false); }); req.setTimeout(5000, () => { req.destroy(); resolve(false); }); });
    if (ok) return true;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`server at ${url} did not become ready within ${timeoutMs}ms${lastErr ? ': ' + lastErr.message : ''}`);
}

export class ProcessServer {
  /**
   * @param {object} o
   * @param {string} [o.pkg] project-local package providing the CLI (preferred: avoids npx and, on
   *   Windows, the cmd.exe wrapper whose orphaned child would hold file locks and break rollback).
   * @param {string} [o.command] explicit command, used only when `pkg` is not given.
   */
  constructor({ cwd, command, args, pkg = null, binName = null, env = {}, readyPath = '/', logger, readyTimeoutMs = 180000 }) {
    Object.assign(this, { cwd, command, args, pkg, binName, env, readyPath, logger, readyTimeoutMs });
    this.proc = null; this.output = '';
  }
  async start() {
    this.port = await freePort();
    const rawArgs = this.args.map((a) => String(a).replace('{port}', String(this.port)));
    const recipe = this.pkg
      ? await localCliCommand(this.cwd, this.pkg, rawArgs, this.binName || this.pkg)
      : { command: this.command, args: rawArgs, shell: process.platform === 'win32', viaNode: false };
    const env = { ...process.env, PORT: String(this.port), BROWSER: 'none', CI: '1', NEXT_TELEMETRY_DISABLED: '1', FORCE_COLOR: '0', ...this.env };
    this.logger?.info(`starting dev server: ${recipe.viaNode ? 'node ' + path.basename(recipe.args[0]) : recipe.command} ${rawArgs.join(' ')} (port ${this.port})`);
    this.proc = spawn(recipe.command, recipe.args, { cwd: this.cwd, env, stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32', shell: recipe.shell, windowsHide: true });
    const onData = (d) => { this.output += d.toString(); if (this.output.length > 200000) this.output = this.output.slice(-100000); };
    this.proc.stdout.on('data', onData); this.proc.stderr.on('data', onData);
    const exited = new Promise((resolve) => this.proc.on('exit', (code) => resolve(code)));
    const baseUrl = `http://127.0.0.1:${this.port}`;
    const ready = waitForHttp(baseUrl + this.readyPath, { timeoutMs: this.readyTimeoutMs });
    let result;
    try {
      result = await Promise.race([ready.then(() => 'ready'), exited.then((code) => `exit:${code}`)]);
    } catch (err) {
      // Readiness timed out: the process is still running and would otherwise be orphaned, keeping a
      // port bound and (on Windows) file handles open inside the project.
      await this.stop();
      throw new Error(`dev server never became ready: ${err.message}. Output tail:\n${this.output.slice(-3000)}`);
    }
    if (result !== 'ready') { await this.stop(); throw new Error(`dev server exited early (${result}). Output tail:\n${this.output.slice(-3000)}`); }
    return baseUrl;
  }
  async stop() {
    if (!this.proc) return;
    const p = this.proc; this.proc = null;
    await killTree(p);
  }
}
