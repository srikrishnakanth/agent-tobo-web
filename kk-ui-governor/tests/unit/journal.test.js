import { test } from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { Transaction, TX_STATES, recoverAll } from '../../src/core/journal.js';
import { hashFile } from '../../src/core/fsutil.js';

async function tmpProject() {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'kkgov-tx-'));
  await fsp.writeFile(path.join(dir, 'index.html'), '<html><head></head><body>hi</body></html>');
  await fsp.mkdir(path.join(dir, 'css'));
  await fsp.writeFile(path.join(dir, 'css', 'site.css'), 'body{margin:0}');
  return dir;
}

test('applyOps backs up, writes atomically and rollback restores byte-exact content', async () => {
  const root = await tmpProject();
  const before = await hashFile(path.join(root, 'index.html'));
  const tx = await Transaction.open(root);
  await tx.setState(TX_STATES.STAGED);
  await tx.applyOps([
    { path: 'index.html', kind: 'modify', content: '<html><head><!-- x --></head><body>hi</body></html>', expectHash: before },
    { path: 'kk-design/theme.css', kind: 'create', content: 'body{color:red}' },
  ]);
  assert.equal(tx.state, TX_STATES.WRITTEN);
  assert.notEqual(await hashFile(path.join(root, 'index.html')), before);
  assert.ok(await fsp.stat(path.join(root, 'kk-design/theme.css')));
  const r = await tx.rollback('test');
  assert.ok(r.ok, JSON.stringify(r.problems));
  assert.equal(await hashFile(path.join(root, 'index.html')), before);
  await assert.rejects(fsp.stat(path.join(root, 'kk-design/theme.css')));
  await assert.rejects(fsp.stat(path.join(root, 'kk-design')), 'created directory removed');
  assert.equal(tx.state, TX_STATES.ROLLED_BACK);
  const events = await tx.readJournal();
  assert.ok(events.some((e) => e.op === 'backup'));
  assert.ok(events.some((e) => e.op === 'write_intent'));
  assert.ok(events.every((e, i) => e.seq === i + 1), 'journal is sequential');
});

test('plan/reality mismatch refuses to write (file changed since inspection)', async () => {
  const root = await tmpProject();
  const tx = await Transaction.open(root);
  await tx.setState(TX_STATES.STAGED);
  await assert.rejects(tx.applyOps([{ path: 'index.html', kind: 'modify', content: 'x', expectHash: 'deadbeef' }]), /changed since inspection/);
  await tx.rollback('cleanup');
  assert.equal((await fsp.readFile(path.join(root, 'index.html'), 'utf8')), '<html><head></head><body>hi</body></html>');
});

test('crash between write_intent and write is recovered by recoverAll', async () => {
  const root = await tmpProject();
  const tx = await Transaction.open(root);
  await tx.setState(TX_STATES.STAGED);
  const before = await hashFile(path.join(root, 'css/site.css'));
  await tx.applyOps([{ path: 'css/site.css', kind: 'modify', content: 'body{margin:1px}', expectHash: before }]);
  // Simulate a crash: leave the transaction in WRITTEN state and lose the in-memory object.
  const recovered = await recoverAll(root);
  assert.equal(recovered.length, 1);
  assert.ok(recovered[0].ok);
  assert.equal(await hashFile(path.join(root, 'css/site.css')), before);
  const list = await Transaction.list(root);
  assert.equal(list[0].state, TX_STATES.ROLLED_BACK);
});

test('keep is only allowed after verification; rollback after keep still restores', async () => {
  const root = await tmpProject();
  const tx = await Transaction.open(root);
  await assert.rejects(tx.keep(), /Cannot keep/);
  await tx.setState(TX_STATES.STAGED);
  const before = await hashFile(path.join(root, 'index.html'));
  await tx.applyOps([{ path: 'index.html', kind: 'modify', content: '<html><head><!-- y --></head><body>hi</body></html>', expectHash: before }]);
  await tx.setState(TX_STATES.VERIFIED);
  await tx.keep();
  assert.equal(tx.state, TX_STATES.KEPT);
  const tx2 = await Transaction.load(root, tx.id);
  const r = await tx2.rollback('user');
  assert.ok(r.ok);
  assert.equal(await hashFile(path.join(root, 'index.html')), before);
});

test('paths outside the project root are refused', async () => {
  const root = await tmpProject();
  const tx = await Transaction.open(root);
  await tx.setState(TX_STATES.STAGED);
  await assert.rejects(tx.applyOps([{ path: '../evil.txt', kind: 'create', content: 'x' }]), /outside project root/);
});
