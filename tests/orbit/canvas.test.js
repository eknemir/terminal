'use strict';
// Canvas-drawn pieces of the orbit map: session icons, drone/hex textures, the activity core, the glow texture
// and the star backdrop. Canvases are fakes that record calls (tests/helpers/orbit.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const { importOrbit, installDocument } = require('../helpers/orbit');

let I, Co, Tx, Sp;
test.before(async () => {
  installDocument();
  I = await importOrbit('icons.js');
  Co = await importOrbit('core.js');
  Tx = await importOrbit('textures.js');
  Sp = await importOrbit('space.js');
});

const R = {
  FONT: 'Test',
  STATUS: { busy: { label: 'çalışıyor', color: '#ffb057' }, waiting: { label: 'bekliyor', color: '#ff4d4d' }, idle: { label: 'boşta', color: '#888' } },
  clipT: (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s),
  ctxColor: (p) => (p > 0.8 ? 'red' : 'green'),
  hexA: (h, a) => `${h}/${a}`,
  CATS: ['read', 'edit', 'bash'],
  CAT: { read: { color: '#1' }, edit: { color: '#2' }, bash: { color: '#3' } },
};
const names = (ctx, n) => ctx.calls.filter((c) => c[0] === n);

test('SessionIcon draws once per distinct state (cache key)', () => {
  const icon = new I.SessionIcon();
  assert.equal(icon.canvas.width, I.ICON.size);
  const s = { name: 'proje', status: 'busy', ctx: 50, ctxMax: 100 };
  icon.draw(R, s, '#abc');
  const n1 = icon.x.calls.length;
  assert.ok(n1 > 0);
  assert.equal(icon.texture.needsUpdate, true);
  icon.texture.needsUpdate = false;
  icon.draw(R, s, '#abc');
  assert.equal(icon.x.calls.length, n1);
  assert.equal(icon.texture.needsUpdate, false);
  icon.draw(R, { ...s, ctx: 60 }, '#abc');
  assert.ok(icon.x.calls.length > n1);
});

test('SessionIcon: context ring arc matches usage, capped at full', () => {
  const icon = new I.SessionIcon();
  icon.draw(R, { name: 'a', status: 'busy', ctx: 25, ctxMax: 100 }, '#fff');
  const arcs = names(icon.x, 'arc');
  const ring = arcs[1]; // [arc, cx, cy, r, start, end]
  assert.ok(Math.abs(ring[5] - ring[4] - Math.PI / 2) < 1e-9);
  assert.ok(icon.x.sets.some(([k, v]) => k === 'strokeStyle' && v === 'green'));

  const full = new I.SessionIcon();
  full.draw(R, { name: 'a', status: 'busy', ctx: 500, ctxMax: 100 }, '#fff');
  const r2 = names(full.x, 'arc')[1];
  assert.ok(Math.abs(r2[5] - r2[4] - Math.PI * 2) < 1e-9);
  assert.ok(full.x.sets.some(([k, v]) => k === 'strokeStyle' && v === 'red'));
});

test('SessionIcon: no usage arc without ctxMax; waiting gets "!"; unknown status falls back to busy', () => {
  const icon = new I.SessionIcon();
  icon.draw(R, { name: 'a', status: 'waiting', ctx: 5, ctxMax: 0 }, '#fff');
  assert.equal(names(icon.x, 'arc').length, 1);
  const texts = names(icon.x, 'fillText').map((c) => c[1]);
  assert.deepEqual(texts, ['a', '! bekliyor']);

  const odd = new I.SessionIcon();
  odd.draw(R, { name: 'b', status: 'nope' }, '#fff');
  assert.equal(names(odd.x, 'fillText')[1][1], 'çalışıyor');
});

test('SessionIcon shrinks long names to fit, not below 16px; clips with R.clipT', () => {
  const icon = new I.SessionIcon();
  icon.draw(R, { name: 'çok-uzun-bir-oturum-adı', status: 'busy' }, '#fff');
  const t = names(icon.x, 'fillText')[0][1];
  assert.equal(t, 'çok-uzun-b…');
  const fonts = icon.x.sets.filter(([k]) => k === 'font').map(([, v]) => v);
  const bold = fonts.filter((f) => f.startsWith('700'));
  const last = +/700 (\d+)px/.exec(bold[bold.length - 1])[1];
  assert.ok(last < 31 && last >= 16);
  // 11 chars * 0.6 * size <= r*1.62 (or hit the floor)
  assert.ok(11 * 0.6 * last <= I.ICON.hex * 1.62 || last === 16);
});

test('SessionIcon.dispose disposes its texture', () => {
  const icon = new I.SessionIcon();
  icon.dispose();
  assert.equal(icon.texture.disposed, true);
});

test('hexGlowTexture strokes three blurred hexagons', () => {
  const t = I.hexGlowTexture();
  const ctx = t.image.ctx;
  assert.equal(names(ctx, 'stroke').length, 3);
  assert.deepEqual(ctx.sets.filter(([k]) => k === 'shadowBlur').map(([, v]) => v), [34, 18, 8]);
  // a hexagon: moveTo + 5 lineTo + closePath, three times
  assert.equal(names(ctx, 'lineTo').length, 15);
  assert.equal(names(ctx, 'closePath').length, 3);
  const [, x, y] = names(ctx, 'moveTo')[0];
  assert.ok(Math.abs(x - 128) < 1e-9 && Math.abs(y - (128 - I.ICON.hex)) < 1e-9); // pointy top
});

test('droneTextures: running has an inner hex, done has a check mark', () => {
  const { running, done } = I.droneTextures();
  assert.equal(names(running.image.ctx, 'fillText').length, 0);
  assert.equal(names(running.image.ctx, 'closePath').length, 2);
  assert.equal(names(done.image.ctx, 'fillText').length, 1);
  assert.ok(done.image.ctx.sets.some(([k, v]) => k === 'strokeStyle' && v === '#5c4d40'));
});

test('glowTexture: 128px radial gradient, white to transparent', () => {
  const t = Tx.glowTexture();
  assert.equal(t.image.width, 128);
  assert.equal(t.colorSpace, 'srgb');
  assert.equal(names(t.image.ctx, 'fillRect').length, 1);
});

test('buildCore: scene parts and redraw caching', () => {
  const core = Co.buildCore(R, 'glow', 50);
  assert.equal(core.group.children.length, 5); // halo, occluder, ticks, arcs, body
  assert.equal(core.occluder.material.depthWrite, true);
  const body = core.group.children[core.group.children.length - 1];
  const bodyCtx = body.material.map.image.ctx;
  const T = { tools: 42, okRate: 0.9, cacheHit: 0.5 };
  core.draw(T, { read: 3, edit: 1 }, 2.34);
  const n = bodyCtx.calls.length;
  const texts = names(bodyCtx, 'fillText').map((c) => c[1]);
  assert.ok(texts.includes('2.3'));
  assert.ok(texts.some((x) => x.startsWith('42 ')));
  assert.ok(texts.some((x) => x.includes('90.0%') && x.includes('50%')));
  core.draw(T, { read: 3, edit: 1 }, 2.34);
  assert.equal(bodyCtx.calls.length, n); // unchanged: no redraw
  core.draw(T, { read: 3, edit: 2 }, 2.34);
  assert.ok(bodyCtx.calls.length > n);
});

test('buildCore: tool-mix arcs split the ring by category share', () => {
  const core = Co.buildCore(R, 'glow', 50);
  const bodyCtx = core.group.children[4].material.map.image.ctx;
  core.draw({ tools: 4, okRate: 1, cacheHit: 0 }, { read: 3, bash: 1 }, 1);
  const styles = bodyCtx.sets.filter(([k]) => k === 'strokeStyle').map(([, v]) => v);
  assert.ok(styles.includes('#1') && styles.includes('#3') && !styles.includes('#2'));
  const arcs = names(bodyCtx, 'arc');
  // after the gradient fill arc, the first category arc spans ~3/4 of the circle
  const a = arcs[1];
  assert.ok(Math.abs(a[5] - a[4] - (0.75 * Math.PI * 2 - 0.024)) < 1e-6);
});

test('buildCore: empty activity draws a rest ring; update animates', () => {
  const core = Co.buildCore(R, 'glow', 50);
  const bodyCtx = core.group.children[4].material.map.image.ctx;
  core.draw({ tools: 0, okRate: 0, cacheHit: 0 }, {}, 0);
  assert.ok(bodyCtx.sets.some(([k, v]) => k === 'strokeStyle' && v === 'rgba(255,255,255,0.06)'));
  core.update(14000, 0);
  assert.ok(Math.abs(core.group.children[2].material.rotation + 1) < 1e-9);
  const halo = core.group.children[0].material;
  core.update(0, 1);
  assert.ok(Math.abs(halo.opacity - (0.14 + 0.04 + 0.12)) < 1e-9);
});

test('buildBackdrop: deterministic stars and dust; update drives uniforms', () => {
  const a = Sp.buildBackdrop('glow'), b = Sp.buildBackdrop('glow');
  const [farA, dustA] = a.group.children, [farB] = b.group.children;
  const pos = farA.geometry.attributes.position.array;
  assert.equal(pos.length, 3200 * 3);
  assert.deepEqual(Array.from(pos.slice(0, 30)), Array.from(farB.geometry.attributes.position.array.slice(0, 30)));
  for (let i = 0; i < 3200; i++) {
    const d = Math.hypot(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
    assert.ok(d >= 3000 - 1e-2 && d <= 4600 + 1e-2);
  }
  assert.equal(dustA.geometry.drawRange.count, 700);
  a.update(2000, 10, 2);
  assert.equal(farA.material.uniforms.time.value, 2);
  assert.equal(farA.material.uniforms.dpr.value, 2);
  assert.ok(Math.abs(dustA.rotation.y - 0.06) < 1e-12);
});
