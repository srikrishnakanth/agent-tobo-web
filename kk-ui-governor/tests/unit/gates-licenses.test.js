import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runSafetyGates, stripGovernorBlocks } from '../../src/core/safety-gates.js';
import { licenseVerdict, detectLicenseFromText, isAllowedLicense } from '../../src/core/licenses.js';
import { wrap } from '../../src/pipeline/markers.js';

const scan = { packageJson: { dependencies: { react: '18' }, devDependencies: {} }, brand: { primaryColor: '#d9480f' } };
const okPlan = (over = {}) => ({
  ops: [{ path: 'kk-design/theme.css', kind: 'create', content: 'body{}' }, { path: 'index.html', kind: 'modify', original: '<head></head>', content: '<head>' + wrap('html', '<link rel="stylesheet" href="x.css">') + '\n</head>', expectHash: 'abc' }],
  dependencies: [], assets: [{ id: 'a', license: 'MIT', noticePreserved: true }], tokens: { color: { primary: '#d9480f' }, motion: { level: 'subtle' } }, ...over,
});

test('all gates pass for a compliant plan', () => {
  const r = runSafetyGates({ plan: okPlan(), scan, selection: { brandMode: 'preserve' }, probe: { ok: true, errors: [] } });
  assert.ok(r.ok, JSON.stringify(r.failed));
});
test('G1 fails on a new dependency', () => {
  const r = runSafetyGates({ plan: okPlan({ dependencies: ['three'] }), scan, selection: {}, probe: { ok: true } });
  assert.deepEqual(r.failed, ['G1']);
});
test('G2 fails when existing content is altered outside marker blocks', () => {
  const plan = okPlan(); plan.ops[1].content = '<head><meta></head>';
  const r = runSafetyGates({ plan, scan, selection: {}, probe: { ok: true } });
  assert.ok(r.failed.includes('G2'));
});
test('G3 fails when brand colour is replaced without permission, passes with brandMode=replace', () => {
  const plan = okPlan({ tokens: { color: { primary: '#2563eb' }, motion: {} } });
  assert.ok(runSafetyGates({ plan, scan, selection: { brandMode: 'preserve' }, probe: { ok: true } }).failed.includes('G3'));
  assert.ok(!runSafetyGates({ plan, scan, selection: { brandMode: 'replace' }, probe: { ok: true } }).failed.includes('G3'));
});
test('G4 fails on incompatible license or missing notice', () => {
  assert.ok(runSafetyGates({ plan: okPlan({ assets: [{ id: 'x', license: 'GPL-3.0-only', noticePreserved: true }] }), scan, selection: {}, probe: { ok: true } }).failed.includes('G4'));
  assert.ok(runSafetyGates({ plan: okPlan({ assets: [{ id: 'x', license: 'MIT', noticePreserved: false }] }), scan, selection: {}, probe: { ok: true } }).failed.includes('G4'));
});
test('G5 fails on protected paths and traversal', () => {
  const plan = okPlan(); plan.ops.push({ path: 'package.json', kind: 'modify', content: '{}', expectHash: 'x', original: '{}' });
  assert.ok(runSafetyGates({ plan, scan, selection: {}, probe: { ok: true } }).failed.includes('G5'));
  const plan2 = okPlan(); plan2.ops.push({ path: '../x.css', kind: 'create', content: '' });
  assert.ok(runSafetyGates({ plan: plan2, scan, selection: {}, probe: { ok: true } }).failed.includes('G5'));
});
test('G6/G8/G9 guard backup hash, probe and heavy-motion fallback', () => {
  const plan = okPlan(); delete plan.ops[1].expectHash;
  assert.ok(runSafetyGates({ plan, scan, selection: {}, probe: { ok: true } }).failed.includes('G6'));
  assert.ok(runSafetyGates({ plan: okPlan(), scan, selection: {}, probe: { ok: false, errors: ['x'] } }).failed.includes('G8'));
  assert.ok(runSafetyGates({ plan: okPlan({ tokens: { color: { primary: '#d9480f' }, motion: { level: 'complex', threeD: 'webgl' } } }), scan, selection: {}, probe: { ok: true } }).failed.includes('G9'));
});
test('stripGovernorBlocks removes html/css/js blocks', () => {
  assert.equal(stripGovernorBlocks('a\n' + wrap('html', 'X') + '\nb'), 'a\nb');
  assert.equal(stripGovernorBlocks('a\n' + wrap('css', 'X') + '\nb'), 'a\nb');
  assert.equal(stripGovernorBlocks('a\n' + wrap('js', 'X') + '\nb'), 'a\nb');
});
test('license policy: allow-list, deny-list, text detection', () => {
  assert.ok(isAllowedLicense('MIT') && isAllowedLicense('Apache-2.0') && isAllowedLicense('OFL-1.1') && isAllowedLicense('ISC'));
  assert.ok(!licenseVerdict('GPL-3.0-only').ok && !licenseVerdict('CC-BY-NC-4.0').ok && !licenseVerdict('SSPL-1.0').ok && !licenseVerdict('Proprietary').ok && !licenseVerdict('made-up').ok);
  assert.equal(detectLicenseFromText('MIT License\n\nPermission is hereby granted, free of charge, to any person ... without restriction'), 'MIT');
  assert.equal(detectLicenseFromText('ISC License\nPermission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted'), 'ISC');
  assert.equal(detectLicenseFromText('Apache License\nVersion 2.0, January 2004'), 'Apache-2.0');
  assert.equal(detectLicenseFromText('GNU GENERAL PUBLIC LICENSE Version 3'), 'GPL-3.0-only');
  assert.equal(detectLicenseFromText('SIL OPEN FONT LICENSE Version 1.1'), 'OFL-1.1');
  assert.equal(detectLicenseFromText(''), 'UNKNOWN');
});
