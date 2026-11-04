'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { importOrbit } = require('../helpers/orbit');

let B, T;
test.before(async () => {
  B = await importOrbit('batch.js');
  T = await importOrbit('../../tests/helpers/three-stub.mjs');
});
const v = (x, y, z) => new T.Vector3(x, y, z);
const col = (r, g, b) => new T.Color(r, g, b);

test('GlowPoints.add stores position, colour x brightness and size', () => {
  const g = new B.GlowPoints(4, 'tex');
  assert.equal(g.material.uniforms.map.value, 'tex');
  assert.equal(g.points.frustumCulled, false);
  g.add(v(1, 2, 3), col(1, 0.5, 0.25), 2, 7);
  assert.equal(g.n, 1);
  assert.deepEqual([...g.pos.slice(0, 3)], [1, 2, 3]);
  assert.deepEqual([...g.col.slice(0, 3)], [2, 1, 0.5]);
  assert.equal(g.size[0], 7);
});

test('GlowPoints.add skips dim, sizeless and over-capacity points', () => {
  const g = new B.GlowPoints(2, null);
  g.add(v(0, 0, 0), col(1, 1, 1), 0.001, 1);
  g.add(v(0, 0, 0), col(1, 1, 1), 1, 0);
  g.add(v(0, 0, 0), col(1, 1, 1), 1, -1);
  assert.equal(g.n, 0);
  g.add(v(0, 0, 0), col(1, 1, 1), 1, 1);
  g.add(v(0, 0, 0), col(1, 1, 1), 1, 1);
  g.add(v(9, 9, 9), col(1, 1, 1), 1, 1);
  assert.equal(g.n, 2);
  assert.equal(g.pos[3], 0);
});

test('GlowPoints.end sets draw range and update ranges; begin resets', () => {
  const g = new B.GlowPoints(8, null);
  g.add(v(1, 1, 1), col(1, 1, 1), 1, 1);
  g.add(v(2, 2, 2), col(1, 1, 1), 1, 1);
  g.end();
  const geo = g.points.geometry;
  assert.deepEqual(geo.drawRange, { start: 0, count: 2 });
  assert.deepEqual(geo.attributes.position.updateRanges, [{ start: 0, count: 6 }]);
  assert.deepEqual(geo.attributes.rgb.updateRanges, [{ start: 0, count: 6 }]);
  assert.deepEqual(geo.attributes.size.updateRanges, [{ start: 0, count: 2 }]);
  assert.equal(geo.attributes.size.needsUpdate, true);
  g.end(); // ranges are cleared, not accumulated
  assert.equal(geo.attributes.position.updateRanges.length, 1);
  g.begin();
  assert.equal(g.n, 0);
});

test('LineBatch.path: segments, alpha function and dash distance', () => {
  const l = new B.LineBatch(16);
  const pts = [v(0, 0, 0), v(3, 0, 0), v(3, 4, 0)];
  l.path(pts, col(1, 0, 0), (t) => t, true);
  assert.equal(l.n, 4); // 2 segments x 2 verts
  assert.deepEqual([...l.dist.slice(0, 4)], [0, 3, 3, 7]);
  // alpha at fractions 0, .5, .5, 1
  assert.deepEqual([3, 7, 11, 15].map((i) => l.col[i]), [0, 0.5, 0.5, 1]);
  assert.deepEqual([...l.pos.slice(9, 12)], [3, 4, 0]);
});

test('LineBatch.path: constant alpha, undashed lines get dist -1', () => {
  const l = new B.LineBatch(16);
  l.path([v(0, 0, 0), v(1, 0, 0)], col(0, 1, 0), 0.4, false);
  assert.equal(l.n, 2);
  assert.ok(Math.abs(l.col[3] - 0.4) < 1e-6 && Math.abs(l.col[7] - 0.4) < 1e-6);
  assert.deepEqual([...l.dist.slice(0, 2)], [-1, -1]);
});

test('LineBatch.path refuses a path that would overflow capacity', () => {
  const l = new B.LineBatch(3);
  l.path([v(0, 0, 0), v(1, 0, 0), v(2, 0, 0)], col(1, 1, 1), 1, false);
  assert.equal(l.n, 0);
});

test('LineBatch.circle: points lie on the circle in the u/v plane', () => {
  const l = new B.LineBatch(200);
  const c = v(10, 5, 0);
  l.circle(c, 2, v(1, 0, 0), v(0, 0, 1), col(1, 1, 1), 0.5, 8);
  assert.equal(l.n, 16);
  for (let i = 0; i < l.n; i++) {
    const x = l.pos[i * 3] - 10, y = l.pos[i * 3 + 1] - 5, z = l.pos[i * 3 + 2];
    assert.ok(Math.abs(Math.hypot(x, z) - 2) < 1e-5);
    assert.ok(Math.abs(y) < 1e-6);
    assert.equal(l.dist[i], -1);
  }
  // each segment's end is the next segment's start (closed loop)
  assert.ok(Math.abs(l.pos[3] - l.pos[6]) < 1e-6);
  assert.ok(Math.abs(l.pos[15 * 3] - l.pos[0]) < 1e-5);
});

test('LineBatch.circle skips invisible or overflowing circles; default 48 segments', () => {
  const l = new B.LineBatch(200);
  l.circle(v(0, 0, 0), 1, v(1, 0, 0), v(0, 1, 0), col(1, 1, 1), 0.001);
  assert.equal(l.n, 0);
  l.circle(v(0, 0, 0), 1, v(1, 0, 0), v(0, 1, 0), col(1, 1, 1), 1);
  assert.equal(l.n, 96);
  l.circle(v(0, 0, 0), 1, v(1, 0, 0), v(0, 1, 0), col(1, 1, 1), 1, 60);
  assert.equal(l.n, 96);
});

test('LineBatch.end/begin', () => {
  const l = new B.LineBatch(8);
  l.path([v(0, 0, 0), v(1, 0, 0)], col(1, 1, 1), 1, false);
  l.end();
  const geo = l.lines.geometry;
  assert.deepEqual(geo.drawRange, { start: 0, count: 2 });
  assert.deepEqual(geo.attributes.rgba.updateRanges, [{ start: 0, count: 8 }]);
  assert.deepEqual(geo.attributes.dist.updateRanges, [{ start: 0, count: 2 }]);
  l.begin();
  assert.equal(l.n, 0);
});

test('ringMaterial defaults and options', () => {
  const d = B.ringMaterial();
  assert.equal(d.uniforms.opacity.value, 1);
  assert.equal(d.uniforms.glow.value, 0);
  assert.equal(d.uniforms.tailFloor.value, 0.14);
  assert.equal(d.uniforms.dashes.value, 0);
  assert.equal(d.uniforms.head.value, -100);
  assert.equal(d.uniforms.color.value.r, 1);
  const m = B.ringMaterial({ color: 0xff0000, opacity: 0.3, glow: 2, floor: 0, dashes: 12, dashSpeed: 1.5 });
  assert.equal(m.uniforms.color.value.g, 0);
  assert.equal(m.uniforms.opacity.value, 0.3);
  assert.equal(m.uniforms.glow.value, 2);
  assert.equal(m.uniforms.tailFloor.value, 0); // ?? keeps 0
  assert.equal(m.uniforms.dashes.value, 12);
  assert.equal(m.uniforms.dashSpeed.value, 1.5);
  assert.equal(m.side, T.DoubleSide);
});

test('setRing sizes the quad and the ring band', () => {
  const mesh = { scale: new T.Vector3(), material: B.ringMaterial() };
  B.setRing(mesh, 100, 4);
  assert.equal(mesh.scale.x, 110);
  assert.equal(mesh.material.uniforms.scale.value, 110);
  assert.equal(mesh.material.uniforms.rIn.value, 98);
  assert.equal(mesh.material.uniforms.rOut.value, 102);
  B.setRing(mesh, 10, 2, 0);
  assert.equal(mesh.scale.x, 12);
});

test('QUAD is a 2x2 plane', () => {
  assert.deepEqual(B.QUAD.parameters, { width: 2, height: 2 });
});
