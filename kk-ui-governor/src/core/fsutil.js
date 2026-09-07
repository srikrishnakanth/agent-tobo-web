import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

export const IGNORED_DIRS = new Set(['kk-ui-governor', 'node_modules', '.git', '.next', 'dist', 'build', 'out', '.kk-governor', 'coverage', '.turbo', '.cache', '.svelte-kit', '.nuxt', '.output', 'vendor', '__pycache__', 'DESIGN-VAULT']);

export function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

export async function hashFile(file) {
  const buf = await fsp.readFile(file);
  return sha256(buf);
}

export async function exists(p) {
  try { await fsp.access(p); return true; } catch { return false; }
}

export function existsSync(p) {
  try { fs.accessSync(p); return true; } catch { return false; }
}

export async function readJson(p, fallback = undefined) {
  try { return JSON.parse(await fsp.readFile(p, 'utf8')); } catch (e) { if (fallback !== undefined) return fallback; throw e; }
}

export async function writeJson(p, data) {
  await atomicWrite(p, JSON.stringify(data, null, 2) + '\n');
}

export async function readText(p, fallback = undefined) {
  try { return await fsp.readFile(p, 'utf8'); } catch (e) { if (fallback !== undefined) return fallback; throw e; }
}

/** Atomic write: write to a temp sibling then rename; guarantees no torn files on crash. */
export async function atomicWrite(file, content) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fsp.writeFile(tmp, content);
  try {
    // On Windows, rename onto an existing file fails with EPERM/EBUSY/EACCES while any process still
    // holds a handle to the target (an editor, antivirus scan, or a dev server that has not exited
    // yet). Retry briefly, then surface a clear error - and never leave a .tmp file in the project.
    let lastErr = null;
    for (let attempt = 0; attempt < 6; attempt++) {
      try { await fsp.rename(tmp, file); return; } catch (err) {
        lastErr = err;
        if (!['EPERM', 'EBUSY', 'EACCES'].includes(err.code)) throw err;
        await new Promise((r) => setTimeout(r, 40 * 2 ** attempt));
      }
    }
    throw Object.assign(new Error(`could not replace ${file} after 6 attempts: ${lastErr && lastErr.code}. Close any process holding the file (editor, dev server, antivirus) and retry.`), { code: lastErr && lastErr.code, cause: lastErr });
  } finally {
    await fsp.rm(tmp, { force: true }).catch(() => {});
  }
}

/** Recursively walk a directory, skipping ignored dirs; returns absolute file paths. */
export async function walk(root, { maxFiles = 20000, extensions = null, ignore = IGNORED_DIRS } = {}) {
  const out = [];
  const stack = [root];
  while (stack.length && out.length < maxFiles) {
    const dir = stack.pop();
    let entries = [];
    try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { continue; }
    for (const ent of entries) {
      if (ent.isSymbolicLink()) continue;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (ignore.has(ent.name) || ent.name.startsWith('.')) continue;
        stack.push(full);
      } else if (ent.isFile()) {
        if (extensions && !extensions.has(path.extname(ent.name).toLowerCase())) continue;
        out.push(full);
      }
    }
  }
  return out.sort();
}

export async function copyDir(src, dest, { ignore = IGNORED_DIRS } = {}) {
  await fsp.mkdir(dest, { recursive: true });
  const entries = await fsp.readdir(src, { withFileTypes: true });
  for (const ent of entries) {
    if (ent.isSymbolicLink()) continue;
    const s = path.join(src, ent.name);
    const d = path.join(dest, ent.name);
    if (ent.isDirectory()) {
      if (ignore.has(ent.name) || ent.name === '.git') continue;
      await copyDir(s, d, { ignore });
    } else if (ent.isFile()) {
      await fsp.copyFile(s, d);
    }
  }
}

export function toPosix(p) { return p.split(path.sep).join('/'); }

export function relPosix(root, file) { return toPosix(path.relative(root, file)); }

/** Ensure a path is inside root (prevents path traversal in journal/rollback operations). */
export function assertInside(root, file) {
  const r = path.resolve(root);
  const f = path.resolve(file);
  if (f !== r && !f.startsWith(r + path.sep)) {
    throw new Error(`Refusing to touch path outside project root: ${file}`);
  }
  return f;
}

export function nowId() {
  const d = new Date();
  const pad = (n, l = 2) => String(n).padStart(l, '0');
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}-${crypto.randomBytes(3).toString('hex')}`;
}
