import { test } from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { buildCommandFor, shouldBuildCheck, runBuildCheck, extractErrors } from '../../src/verify/build-check.js';

async function fixture(scripts) {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'kkgov-build-'));
  await fsp.writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'fx', scripts }, null, 2));
  return { root, packageJson: { name: 'fx', scripts } };
}

test('build check is skipped for static and unsupported projects, and when no build script exists', async () => {
  const withBuild = await fixture({ build: 'echo ok' });
  assert.equal(shouldBuildCheck(withBuild, 'html'), false, 'html adapter has no build step');
  assert.equal(shouldBuildCheck(withBuild, 'unsupported'), false);
  assert.equal(shouldBuildCheck(withBuild, 'nextjs'), true);
  const noBuild = await fixture({ dev: 'vite' });
  assert.equal(shouldBuildCheck(noBuild, 'nextjs'), false);
  assert.equal(buildCommandFor(noBuild), null);
  const r = await runBuildCheck(noBuild);
  assert.ok(r.ok && r.skipped);
});

test('a succeeding build reports ok with its command and duration', async () => {
  const fx = await fixture({ build: 'node -e "console.log(\'built\')"' });
  const r = await runBuildCheck(fx, { timeoutMs: 60000 });
  assert.equal(r.ok, true);
  assert.equal(r.skipped, false);
  assert.equal(r.exitCode, 0);
  assert.match(r.command, /npm run build/);
  assert.ok(r.durationMs >= 0);
});

test('a failing build is reported with a non-zero exit code and the error text', async () => {
  const fx = await fixture({ build: 'node -e "console.error(\'Type error: something broke\'); process.exit(1)"' });
  const r = await runBuildCheck(fx, { timeoutMs: 60000 });
  assert.equal(r.ok, false);
  assert.notEqual(r.exitCode, 0);
  assert.match(r.output, /Type error: something broke/);
});

test('a hanging build is killed at the timeout and reported as failed', async () => {
  const fx = await fixture({ build: 'node -e "setTimeout(()=>{}, 60000)"' });
  const r = await runBuildCheck(fx, { timeoutMs: 2000 });
  assert.equal(r.ok, false);
  assert.equal(r.timedOut, true);
});

test('extractErrors keeps error context and drops native stack noise', () => {
  const log = ['ok line', 'Failed to compile.', './src/app/page.tsx:15:24', "Type error: Property 'x' does not exist.", '   1: <unknown>', '   2: <unknown>', 'at /home/iojs/build/ws/out/x.c:1:1', 'tail line'].join('\n');
  const out = extractErrors(log);
  assert.match(out, /Failed to compile/);
  assert.match(out, /Type error/);
  assert.doesNotMatch(out, /<unknown>/);
  assert.doesNotMatch(out, /home\/iojs/);
});
