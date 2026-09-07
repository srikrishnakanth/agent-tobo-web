// Spawns a framework dev server (next dev, vite, react-scripts) on a free port and waits for it.
import { spawn } from 'node:child_process';
import net from 'node:net';
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
  constructor({ cwd, command, args, env = {}, readyPath = '/', logger, readyTimeoutMs = 180000 }) {
    Object.assign(this, { cwd, command, args, env, readyPath, logger, readyTimeoutMs });
    this.proc = null; this.output = '';
  }
  async start() {
    this.port = await freePort();
    const args = this.args.map((a) => String(a).replace('{port}', String(this.port)));
    const env = { ...process.env, PORT: String(this.port), BROWSER: 'none', CI: '1', NEXT_TELEMETRY_DISABLED: '1', FORCE_COLOR: '0', ...this.env };
    this.logger?.info(`starting dev server: ${this.command} ${args.join(' ')} (port ${this.port})`);
    this.proc = spawn(this.command, args, { cwd: this.cwd, env, stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32', shell: process.platform === 'win32' });
    const onData = (d) => { this.output += d.toString(); if (this.output.length > 200000) this.output = this.output.slice(-100000); };
    this.proc.stdout.on('data', onData); this.proc.stderr.on('data', onData);
    const exited = new Promise((resolve) => this.proc.on('exit', (code) => resolve(code)));
    const baseUrl = `http://127.0.0.1:${this.port}`;
    const ready = waitForHttp(baseUrl + this.readyPath, { timeoutMs: this.readyTimeoutMs });
    const result = await Promise.race([ready.then(() => 'ready'), exited.then((code) => `exit:${code}`)]);
    if (result !== 'ready') throw new Error(`dev server exited early (${result}). Output tail:\n${this.output.slice(-3000)}`);
    return baseUrl;
  }
  async stop() {
    if (!this.proc) return;
    const p = this.proc; this.proc = null;
    try { if (process.platform !== 'win32') process.kill(-p.pid, 'SIGTERM'); else p.kill(); } catch { try { p.kill('SIGTERM'); } catch { /* ignore */ } }
    await new Promise((r) => setTimeout(r, 800));
    try { if (process.platform !== 'win32') process.kill(-p.pid, 'SIGKILL'); } catch { /* already gone */ }
  }
}
