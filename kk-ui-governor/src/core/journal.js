// Transaction journal for KK-UI-GOVERNOR.
//
// Every change to a target project passes through a Transaction. The journal is an append-only
// JSONL file written BEFORE each mutation (write-ahead), so a crash at any point can be recovered:
// `recover()` replays the journal and restores every touched file from its backup.
//
// Layout inside <project>/.kk-governor/tx/<txId>/
//   journal.jsonl   append-only event log (write-ahead)
//   manifest.json   transaction state machine + stage results
//   backup/         byte-exact copies of every existing file before modification
//   candidate/      staged candidate files (never touch the project)
//   preview/        current-vs-candidate preview assets
//   verify/         verification results + screenshots
//   REPORT.html / REPORT.json
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { atomicWrite, hashFile, exists, readJson, writeJson, assertInside, nowId, relPosix, sha256 } from './fsutil.js';

export const TX_STATES = Object.freeze({
  OPEN: 'open',            // created, nothing written to project
  STAGED: 'staged',        // candidate staged + probed
  WRITING: 'writing',      // project mutation in progress (crash here => rollback on recover)
  WRITTEN: 'written',      // all writes done, verification pending (crash => rollback)
  VERIFIED: 'verified',    // verification finished; awaiting decision
  PENDING: 'pending',      // verified OK, user decision requested (decide=ask)
  KEPT: 'kept',            // committed; backups retained for manual rollback
  ROLLED_BACK: 'rolled_back',
  ROLLBACK_FAILED: 'rollback_failed', // restore did not fully succeed; the project needs manual attention
  FAILED: 'failed',        // aborted before any project mutation
});

const MUTATING_STATES = new Set([TX_STATES.WRITING, TX_STATES.WRITTEN, TX_STATES.VERIFIED]);

export class Transaction {
  /**
   * @param {string} projectRoot absolute path of the target project
   * @param {object} opts { id?, logger?, governorDir? }
   */
  constructor(projectRoot, opts = {}) {
    this.projectRoot = path.resolve(projectRoot);
    this.governorDir = opts.governorDir || path.join(this.projectRoot, '.kk-governor');
    this.id = opts.id || nowId();
    this.dir = path.join(this.governorDir, 'tx', this.id);
    this.journalFile = path.join(this.dir, 'journal.jsonl');
    this.manifestFile = path.join(this.dir, 'manifest.json');
    this.backupDir = path.join(this.dir, 'backup');
    this.candidateDir = path.join(this.dir, 'candidate');
    this.previewDir = path.join(this.dir, 'preview');
    this.verifyDir = path.join(this.dir, 'verify');
    this.logger = opts.logger || null;
    this.seq = 0;
    this.manifest = null;
  }

  static async open(projectRoot, opts = {}) {
    const tx = new Transaction(projectRoot, opts);
    for (const d of [tx.dir, tx.backupDir, tx.candidateDir, tx.previewDir, tx.verifyDir]) {
      await fsp.mkdir(d, { recursive: true });
    }
    tx.manifest = {
      id: tx.id,
      projectRoot: tx.projectRoot,
      state: TX_STATES.OPEN,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      stages: {},          // stage name -> { status, startedAt, finishedAt, summary }
      files: [],           // planned/applied ops
      decision: null,
      options: opts.options || {},
    };
    await tx._saveManifest();
    await tx.append({ op: 'begin', projectRoot: tx.projectRoot });
    await Transaction._indexAdd(tx.governorDir, tx.id);
    return tx;
  }

  static async load(projectRoot, id, opts = {}) {
    const tx = new Transaction(projectRoot, { ...opts, id });
    if (!(await exists(tx.manifestFile))) throw new Error(`Transaction not found: ${id}`);
    tx.manifest = await readJson(tx.manifestFile);
    const events = await tx.readJournal();
    tx.seq = events.length ? events[events.length - 1].seq : 0;
    return tx;
  }

  static async list(projectRoot, governorDir = null) {
    const gd = governorDir || path.join(path.resolve(projectRoot), '.kk-governor');
    const txRoot = path.join(gd, 'tx');
    if (!(await exists(txRoot))) return [];
    const ids = (await fsp.readdir(txRoot)).sort();
    const out = [];
    for (const id of ids) {
      const mf = path.join(txRoot, id, 'manifest.json');
      if (await exists(mf)) out.push(await readJson(mf));
    }
    return out;
  }

  static async _indexAdd(governorDir, id) {
    const idx = path.join(governorDir, 'index.json');
    const data = await readJson(idx, { transactions: [] });
    if (!data.transactions.includes(id)) data.transactions.push(id);
    await writeJson(idx, data);
  }

  get state() { return this.manifest.state; }

  async _saveManifest() {
    this.manifest.updatedAt = new Date().toISOString();
    await writeJson(this.manifestFile, this.manifest);
  }

  async setState(state, extra = {}) {
    this.manifest.state = state;
    Object.assign(this.manifest, extra);
    await this.append({ op: 'state', state });
    await this._saveManifest();
  }

  async stage(name, status, summary = {}) {
    const s = this.manifest.stages[name] || { startedAt: new Date().toISOString() };
    s.status = status;
    if (status !== 'running') s.finishedAt = new Date().toISOString();
    s.summary = summary;
    this.manifest.stages[name] = s;
    await this.append({ op: 'stage', stage: name, status, summary: summarize(summary) });
    await this._saveManifest();
    this.logger?.info(`stage ${name}: ${status}`);
  }

  /** Append a write-ahead journal entry. Uses fs.appendFileSync + fsync for durability. */
  async append(entry) {
    this.seq += 1;
    const rec = { seq: this.seq, ts: new Date().toISOString(), ...entry };
    const fd = fs.openSync(this.journalFile, 'a');
    try {
      fs.writeSync(fd, JSON.stringify(rec) + '\n');
      fs.fsyncSync(fd);
    } finally { fs.closeSync(fd); }
    return rec;
  }

  async readJournal() {
    if (!(await exists(this.journalFile))) return [];
    const txt = await fsp.readFile(this.journalFile, 'utf8');
    return txt.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  }

  // ---------------------------------------------------------------- staging
  /** Stage a candidate file (relative path) without touching the project. */
  async stageFile(relPath, content) {
    const full = path.join(this.candidateDir, relPath);
    assertInside(this.candidateDir, full);
    await atomicWrite(full, content);
    return full;
  }

  async readCandidate(relPath) {
    return fsp.readFile(path.join(this.candidateDir, relPath), 'utf8');
  }

  // ----------------------------------------------------------------- writes
  /**
   * Apply a set of file operations to the project with backup + write-ahead journaling.
   * ops: [{ path: relPath, kind: 'create'|'modify', content: string|Buffer }]
   */
  async applyOps(ops) {
    if (this.state !== TX_STATES.STAGED && this.state !== TX_STATES.OPEN) {
      throw new Error(`Cannot write in state ${this.state}`);
    }
    await this.setState(TX_STATES.WRITING);
    for (const op of ops) {
      const target = assertInside(this.projectRoot, path.join(this.projectRoot, op.path));
      const existed = await exists(target);
      const kind = existed ? 'modify' : 'create';
      if (op.kind && op.kind !== kind) {
        // Plan/reality mismatch => refuse: the project changed under us.
        throw new Error(`Plan mismatch for ${op.path}: planned ${op.kind}, found ${kind}`);
      }
      let hashBefore = null;
      if (existed) {
        hashBefore = await hashFile(target);
        if (op.expectHash && op.expectHash !== hashBefore) {
          throw new Error(`File changed since inspection: ${op.path}`);
        }
        const backup = path.join(this.backupDir, op.path);
        await fsp.mkdir(path.dirname(backup), { recursive: true });
        await fsp.copyFile(target, backup);
        const backupHash = await hashFile(backup);
        if (backupHash !== hashBefore) throw new Error(`Backup verification failed for ${op.path}`);
        await this.append({ op: 'backup', path: op.path, hash: hashBefore });
      }
      // Track directories we create so rollback can remove them if empty.
      const createdDirs = await ensureDirsTracked(path.dirname(target), this.projectRoot);
      for (const d of createdDirs) await this.append({ op: 'mkdir', path: relPosix(this.projectRoot, d) });
      // Write-ahead: record intent BEFORE mutating.
      await this.append({ op: 'write_intent', path: op.path, kind, hashBefore });
      await atomicWrite(target, op.content);
      const hashAfter = await hashFile(target);
      const rec = { op: 'write', path: op.path, kind, hashBefore, hashAfter, bytes: Buffer.byteLength(op.content) };
      await this.append(rec);
      this.manifest.files.push(rec);
      await this._saveManifest();
      this.logger?.info(`${kind} ${op.path}`);
    }
    await this.setState(TX_STATES.WRITTEN);
  }

  // ---------------------------------------------------------------- rollback
  /** Restore every touched file from backup / remove created files. Idempotent. */
  async rollback(reason = 'rollback requested') {
    await this.append({ op: 'rollback_start', reason });
    const events = await this.readJournal();
    const restored = [];
    const problems = [];
    // Files touched (write_intent covers the crash-between-intent-and-write case).
    const touched = new Map();
    for (const e of events) {
      if (e.op === 'write_intent' || e.op === 'write') {
        touched.set(e.path, { kind: e.kind, hashBefore: e.hashBefore, hashAfter: e.hashAfter ?? touched.get(e.path)?.hashAfter ?? null });
      }
    }
    const order = [...touched.keys()].reverse();
    for (const rel of order) {
      const info = touched.get(rel);
      const target = assertInside(this.projectRoot, path.join(this.projectRoot, rel));
      try {
        if (info.kind === 'create') {
          if (await exists(target)) {
            const h = await hashFile(target);
            if (info.hashAfter && h !== info.hashAfter) problems.push({ path: rel, note: 'file was modified after governor wrote it; removed anyway (rollback)' });
            await fsp.unlink(target);
          }
          restored.push({ path: rel, action: 'deleted' });
        } else {
          const backup = path.join(this.backupDir, rel);
          if (!(await exists(backup))) { problems.push({ path: rel, note: 'backup missing' }); continue; }
          const bh = await hashFile(backup);
          if (info.hashBefore && bh !== info.hashBefore) { problems.push({ path: rel, note: 'backup hash mismatch; not restored' }); continue; }
          await fsp.mkdir(path.dirname(target), { recursive: true });
          await fsp.copyFile(backup, target);
          const h = await hashFile(target);
          if (h !== bh) { problems.push({ path: rel, note: 'restore verification failed' }); continue; }
          restored.push({ path: rel, action: 'restored', hash: h });
        }
        await this.append({ op: 'restore', path: rel });
      } catch (err) {
        problems.push({ path: rel, note: String(err.message || err) });
      }
    }
    // Remove directories we created, deepest first, only if empty.
    const dirs = events.filter((e) => e.op === 'mkdir').map((e) => e.path).reverse();
    for (const d of dirs) {
      const full = path.join(this.projectRoot, d);
      try { if ((await fsp.readdir(full)).length === 0) await fsp.rmdir(full); } catch { /* ignore */ }
    }
    const ok = problems.length === 0;
    await this.append({ op: 'rollback_done', ok, restored: restored.length, problems });
    this.manifest.rollback = { reason, ok, restored, problems, at: new Date().toISOString() };
    await this.setState(ok ? TX_STATES.ROLLED_BACK : TX_STATES.ROLLBACK_FAILED, { decision: 'rollback' });
    this.logger?.[ok ? 'info' : 'error'](`rollback ${ok ? 'complete' : 'completed with problems'}: ${restored.length} file(s) restored`, ok ? undefined : problems);
    return { ok, restored, problems };
  }

  async keep(note = 'kept') {
    if (![TX_STATES.VERIFIED, TX_STATES.PENDING].includes(this.state)) {
      throw new Error(`Cannot keep transaction in state ${this.state}`);
    }
    await this.append({ op: 'keep', note });
    await this.setState(TX_STATES.KEPT, { decision: 'keep', keptAt: new Date().toISOString() });
    return true;
  }

  async fail(reason) {
    await this.append({ op: 'abort', reason });
    await this.setState(TX_STATES.FAILED, { decision: 'abort', failReason: reason });
  }

  /** Verify that the project currently matches the journal (integrity check for reports). */
  async integrity() {
    const events = await this.readJournal();
    const writes = events.filter((e) => e.op === 'write');
    const results = [];
    for (const w of writes) {
      const target = path.join(this.projectRoot, w.path);
      const present = await exists(target);
      const hash = present ? await hashFile(target) : null;
      results.push({ path: w.path, present, matchesWritten: hash === w.hashAfter, matchesBackup: hash === w.hashBefore });
    }
    return results;
  }

  needsRecovery() { return MUTATING_STATES.has(this.state); }
}

/** Recover interrupted transactions: any tx left in a mutating state is rolled back. */
export async function recoverAll(projectRoot, { logger } = {}) {
  const list = await Transaction.list(projectRoot);
  const out = [];
  for (const m of list) {
    if (MUTATING_STATES.has(m.state)) {
      const tx = await Transaction.load(projectRoot, m.id, { logger });
      logger?.warn(`recovering interrupted transaction ${m.id} (state ${m.state})`);
      const r = await tx.rollback(`recovery: interrupted in state ${m.state}`);
      out.push({ id: m.id, previousState: m.state, ...r });
    }
  }
  return out;
}

async function ensureDirsTracked(dir, root) {
  const created = [];
  const chain = [];
  let cur = path.resolve(dir);
  const r = path.resolve(root);
  while (cur.startsWith(r) && cur !== r && !(await exists(cur))) { chain.push(cur); cur = path.dirname(cur); }
  for (const d of chain.reverse()) { await fsp.mkdir(d); created.push(d); }
  return created;
}

function summarize(obj) {
  try {
    const s = JSON.stringify(obj);
    return s.length > 4000 ? { truncated: true, sha256: sha256(s), preview: s.slice(0, 1000) } : obj;
  } catch { return {}; }
}
