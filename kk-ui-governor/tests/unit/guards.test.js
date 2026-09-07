import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareGuards, normalizeRoutePath } from '../../src/verify/runner.js';

const sig = ['div|16px|rgb(0, 0, 0)', 'p|14px|rgb(20, 20, 20)'];
const cap = (requested, finalPath, signature = sig, status = 200) => ({ signature, requested, finalPath, status });

test('route paths are normalised so benign differences are not read as a redirect', () => {
  assert.equal(normalizeRoutePath('http://x/dashboard/'), '/dashboard');
  assert.equal(normalizeRoutePath('http://x/dashboard?tab=1#a'), '/dashboard');
  assert.equal(normalizeRoutePath('http://x/en/dashboard'), '/dashboard', 'locale prefix is not a redirect');
  assert.equal(normalizeRoutePath('http://x/en-GB/dashboard'), '/dashboard');
  assert.equal(normalizeRoutePath('http://x/'), '/');
  assert.equal(normalizeRoutePath('http://x/login'), '/login', 'a genuine redirect target is preserved');
});

test('a route that redirects to a login page is never counted as proof', () => {
  // Both runs land on /login, so the signatures are identical - the trap this guards against.
  const before = { '/dashboard': { 'guard-desktop': cap('/dashboard', '/login') } };
  const after = { '/dashboard': { 'guard-desktop': cap('/dashboard', '/login') } };
  const r = compareGuards(before, after);
  assert.equal(r.compared, 0, 'nothing may be counted as compared');
  assert.equal(r.redirected.length, 1);
  assert.equal(r.findings.length, 1);
  assert.match(r.findings[0].message, /never reached/);
  assert.match(r.findings[0].message, /auth-storage-state/);
  // The governor treats any non-fail finding as "unproven", which fails the check closed.
  assert.notEqual(r.findings[0].severity, 'fail');
});

test('a non-2xx guard route proves nothing either', () => {
  const before = { '/admin': { d: cap('/admin', '/admin', sig, 404) } };
  const r = compareGuards(before, before);
  assert.equal(r.compared, 0);
  assert.match(r.findings[0].message, /not a rendered page: HTTP 404/);
});

test('a route reached in both runs and identical is proof', () => {
  const g = { '/settings': { d: cap('/settings', '/settings') } };
  const r = compareGuards(g, g);
  assert.equal(r.compared, 1);
  assert.equal(r.findings.length, 0);
  assert.equal(r.redirected.length, 0);
});

test('a reached route that changed fails', () => {
  const before = { '/settings': { d: cap('/settings', '/settings') } };
  const after = { '/settings': { d: cap('/settings', '/settings', ['div|16px|rgb(0, 0, 0)', 'p|14px|rgb(255, 0, 0)']) } };
  const r = compareGuards(before, after);
  const fails = r.findings.filter((f) => f.severity === 'fail');
  assert.equal(fails.length, 1);
  assert.match(fails[0].message, /1 element\(s\) restyled/);
  assert.ok(fails[0].examples.length);
});

test('a route that resolves differently before and after fails rather than comparing two documents', () => {
  const before = { '/orders': { d: cap('/orders', '/orders') } };
  const after = { '/orders': { d: cap('/orders', '/login') } };
  const r = compareGuards(before, after);
  assert.equal(r.compared, 0);
  // /orders -> /login in the candidate only: reported, never silently compared
  assert.ok(r.findings.length >= 1);
  assert.ok(r.findings.every((f) => f.severity !== 'fail' || /resolved differently/.test(f.message)));
});

test('element-count changes are caught', () => {
  const before = { '/x': { d: cap('/x', '/x', ['a', 'b', 'c']) } };
  const after = { '/x': { d: cap('/x', '/x', ['a', 'b']) } };
  const fails = compareGuards(before, after).findings.filter((f) => f.severity === 'fail');
  assert.match(fails[0].message, /element count changed: 3 -> 2/);
});

test('a missing capture is reported, never assumed identical', () => {
  const before = { '/x': { d: cap('/x', '/x') } };
  const after = { '/x': { d: { error: 'net::ERR_CONNECTION_REFUSED' } } };
  const r = compareGuards(before, after);
  assert.equal(r.compared, 0);
  assert.match(r.findings[0].message, /signature unavailable/);
});

test('the legacy bare-array shape still compares (backwards compatible)', () => {
  const g = { '/x': { d: sig } };
  assert.equal(compareGuards(g, g).compared, 1);
});
