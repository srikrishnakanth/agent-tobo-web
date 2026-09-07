// Minimal static file server (no dependency) used to verify plain HTML projects and previews.
import http from 'node:http';
import fsp from 'node:fs/promises';
import path from 'node:path';

const MIME = { '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.txt': 'text/plain', '.md': 'text/markdown', '.map': 'application/json' };

export class StaticServer {
  constructor(root, { port = 0 } = {}) { this.root = path.resolve(root); this.port = port; this.server = null; }
  async start() {
    this.server = http.createServer(async (req, res) => {
      try {
        let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
        if (p.endsWith('/')) p += 'index.html';
        const file = path.resolve(this.root, '.' + p);
        if (!file.startsWith(this.root)) { res.writeHead(403); return res.end(); }
        let st;
        try { st = await fsp.stat(file); } catch { res.writeHead(404); return res.end('not found'); }
        if (st.isDirectory()) { res.writeHead(302, { Location: p + '/' }); return res.end(); }
        const data = await fsp.readFile(file);
        res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
        res.end(data);
      } catch (e) { res.writeHead(500); res.end(String(e)); }
    });
    await new Promise((resolve) => this.server.listen(this.port, '127.0.0.1', resolve));
    this.port = this.server.address().port;
    return `http://127.0.0.1:${this.port}`;
  }
  async stop() { if (this.server) await new Promise((r) => this.server.close(r)); this.server = null; }
}
