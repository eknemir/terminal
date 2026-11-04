'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { importOrbit, installDocument } = require('../helpers/orbit');

let U;
test.before(async () => { U = await importOrbit('util.js'); });

test('TAU is 2*PI', () => assert.equal(U.TAU, Math.PI * 2));

test('clamp keeps values inside [a, b]', () => {
  assert.equal(U.clamp(5, 0, 10), 5);
  assert.equal(U.clamp(-1, 0, 10), 0);
  assert.equal(U.clamp(11, 0, 10), 10);
  assert.equal(U.clamp(0, 0, 0), 0);
});

test('lerp interpolates and extrapolates linearly', () => {
  assert.equal(U.lerp(0, 10, 0), 0);
  assert.equal(U.lerp(0, 10, 1), 10);
  assert.equal(U.lerp(0, 10, 0.25), 2.5);
  assert.equal(U.lerp(10, 0, 0.5), 5);
  assert.equal(U.lerp(0, 10, 2), 20);
});

test('easeInOut: endpoints, midpoint, symmetry and monotonic', () => {
  assert.equal(U.easeInOut(0), 0);
  assert.equal(U.easeInOut(1), 1);
  assert.equal(U.easeInOut(0.5), 0.5);
  for (const t of [0.1, 0.2, 0.3, 0.4]) assert.ok(Math.abs(U.easeInOut(t) + U.easeInOut(1 - t) - 1) < 1e-12);
  let prev = -1;
  for (let i = 0; i <= 100; i++) { const v = U.easeInOut(i / 100); assert.ok(v >= prev); prev = v; }
  assert.ok(U.easeInOut(0.25) < 0.25); // slow start
});

test('easeOut: fast start, ends at 1', () => {
  assert.equal(U.easeOut(0), 0);
  assert.equal(U.easeOut(1), 1);
  assert.ok(U.easeOut(0.25) > 0.25);
  assert.ok(Math.abs(U.easeOut(0.5) - 0.875) < 1e-12);
});

test('damp is frame-rate independent', () => {
  assert.equal(U.damp(5, 0), 0);
  assert.ok(U.damp(5, 1e6) > 0.999999);
  // two half steps converge to the same place as one full step
  const one = U.damp(3, 0.1);
  const half = U.damp(3, 0.05);
  const x2 = 1 - (1 - half) * (1 - half);
  assert.ok(Math.abs(one - x2) < 1e-12);
});

test('rng is deterministic per seed and in [0, 1)', () => {
  const a = U.rng(7), b = U.rng(7), c = U.rng(8);
  const sa = Array.from({ length: 50 }, a), sb = Array.from({ length: 50 }, b), sc = Array.from({ length: 50 }, c);
  assert.deepEqual(sa, sb);
  assert.notDeepEqual(sa, sc);
  for (const v of sa) assert.ok(v >= 0 && v < 1);
  // roughly uniform
  const r = U.rng(123);
  let sum = 0;
  for (let i = 0; i < 5000; i++) sum += r();
  assert.ok(Math.abs(sum / 5000 - 0.5) < 0.03);
});

test('el builds an element with class and html', () => {
  installDocument();
  const n = U.el('div', 'corel', '<b>x</b>');
  assert.equal(n.className, 'corel');
  assert.equal(n.innerHTML, '<b>x</b>');
  const bare = U.el('span');
  assert.equal(bare.className, '');
  assert.equal(bare.innerHTML, '');
  const zero = U.el('span', null, 0);
  assert.equal(zero.innerHTML, 0);
});

test('setText writes only on change and stringifies nullish', () => {
  let writes = 0, v = '';
  const node = { get textContent() { return v; }, set textContent(x) { writes++; v = x; } };
  U.setText(node, 'a');
  U.setText(node, 'a');
  assert.equal(writes, 1);
  U.setText(node, 3);
  assert.equal(v, '3');
  U.setText(node, null);
  assert.equal(v, '');
  U.setText(null, 'x'); // no throw
});
