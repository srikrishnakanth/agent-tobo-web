// Audit: pre-flight checks before a transaction may open, and post-write integrity audit.
import fsp from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { exists, readJson } from './fsutil.js';

export async function preflightAudit(projectRoot, { requireNodeModules = false } = {}) {
  const checks = [];
  const root = path.resolve(projectRoot);
  const add = (id, status, note, data) => checks.push({ id, status, note, ...(data ? { data } : {}) });

  add('root-exists', (await exists(root)) ? 'pass' : 'fail', root);
  try { await fsp.access(root, (await import('node:fs')).constants.W_OK); add('root-writable', 'pass', 'project root is writable'); }
  catch { add('root-writable', 'fail', 'project root is not writable'); }

  // Git awareness: not required, but the user should know if there are uncommitted changes.
  const git = spawnSync('git', ['-C', root, 'status', '--porcelain'], { encoding: 'utf8' });
  if (git.status === 0) {
    const dirty = git.stdout.split('\n').filter(Boolean).filter((l) => !l.includes('.kk-governor'));
    add('git-status', dirty.length ? 'warn' : 'pass', dirty.length ? `${dirty.length} uncommitted change(s) present (governor keeps its own backups regardless)` : 'working tree clean', { dirty: dirty.slice(0, 30) });
  } else add('git-status', 'warn', 'not a git repository (governor journal is the only backup)');

  const pkg = await readJson(path.join(root, 'package.json'), null);
  add('package-json', pkg ? 'pass' : 'warn', pkg ? `package "${pkg.name || '?'}"` : 'no package.json (plain HTML project?)');
  if (pkg) {
    const nm = await exists(path.join(root, 'node_modules'));
    add('node-modules', nm ? 'pass' : (requireNodeModules ? 'fail' : 'warn'), nm ? 'dependencies installed' : 'node_modules missing; live verification of framework projects needs installed dependencies');
  }

  // Disk space (best effort)
  try {
    const st = await fsp.statfs(root);
    const freeMB = Math.round((st.bavail * st.bsize) / 1048576);
    add('disk-space', freeMB < 200 ? 'fail' : 'pass', `${freeMB} MB free`);
  } catch { add('disk-space', 'warn', 'could not determine free space'); }

  const failed = checks.filter((c) => c.status === 'fail');
  return { ok: failed.length === 0, checks };
}

export async function postWriteAudit(tx) {
  const integrity = await tx.integrity();
  const bad = integrity.filter((i) => !i.present || !i.matchesWritten);
  const events = await tx.readJournal();
  const seqOk = events.every((e, i) => e.seq === i + 1);
  return { ok: bad.length === 0 && seqOk, integrity, journalEvents: events.length, journalSequential: seqOk };
}
