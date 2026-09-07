import { test } from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { resolveLocalBin, localCliCommand } from '../../src/server/spawn-util.js';

async function fakeProject(binField) {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'kkgov-bin '));  // note: space in the path
  const dir = path.join(root, 'node_modules', 'demo-cli');
  await fsp.mkdir(path.join(dir, 'bin'), { recursive: true });
  await fsp.writeFile(path.join(dir, 'package.json'), JSON.stringify({ name: 'demo-cli', bin: binField }));
  await fsp.writeFile(path.join(dir, 'bin', 'run.js'), '#!/usr/bin/env node\n');
  return root;
}

test('resolves a string bin field', async () => {
  const root = await fakeProject('bin/run.js');
  assert.equal(await resolveLocalBin(root, 'demo-cli'), path.join(root, 'node_modules/demo-cli/bin/run.js'));
});

test('resolves an object bin field by name, then by package name, then first entry', async () => {
  const root = await fakeProject({ 'demo-cli': 'bin/run.js' });
  assert.ok((await resolveLocalBin(root, 'demo-cli')).endsWith('run.js'));
  const root2 = await fakeProject({ other: 'bin/run.js' });
  assert.ok((await resolveLocalBin(root2, 'demo-cli')).endsWith('run.js'), 'falls back to the only entry');
});

test('returns null when the package or its entry is absent', async () => {
  const root = await fakeProject('bin/missing.js');
  assert.equal(await resolveLocalBin(root, 'demo-cli'), null, 'entry file does not exist');
  assert.equal(await resolveLocalBin(root, 'not-installed'), null);
});

test('localCliCommand runs the resolved entry with the current node binary and never a shell', async () => {
  const root = await fakeProject('bin/run.js');
  const r = await localCliCommand(root, 'demo-cli', ['--port', '3000']);
  assert.equal(r.command, process.execPath);
  assert.equal(r.viaNode, true);
  assert.equal(r.shell, false, 'no shell => arguments are never re-parsed, so paths with spaces are safe');
  assert.deepEqual(r.args.slice(1), ['--port', '3000']);
  assert.ok(r.args[0].includes(' '), 'this fixture deliberately lives under a path containing a space');
});

test('falls back to npx only when the package is not installed locally', async () => {
  const root = await fakeProject('bin/run.js');
  const r = await localCliCommand(root, 'not-installed', ['start']);
  assert.equal(r.command, 'npx');
  assert.equal(r.viaNode, false);
  assert.equal(r.shell, process.platform === 'win32', 'npx needs a shell on Windows (it is npx.cmd)');
});
