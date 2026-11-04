'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { importOrbit } = require('../helpers/orbit');

let L;
test.before(async () => { L = await importOrbit('logic.js'); });

const TAU = Math.PI * 2;
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
const clipT = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const R = { clipT, esc: (s) => String(s).replace(/</g, '&lt;'), fmtTok: (n) => `${n}t`, fmtUsd: (n) => `$${n}` };

// ---------- view ----------
test('fitDistance: the wider of the two fits, clamped to [320, 2200]', () => {
  const vf = (20 * Math.PI) / 180;
  const dH = 420 / (Math.tan(Math.atan(Math.tan(vf) * 1.5)) * 0.74);
  const dV = (150 + 45 + 34 + 30) / (Math.tan(vf) * 0.86);
  near(L.fitDistance(40, 1.5), Math.max(dH, dV));
  assert.ok(dH > dV); // a normal landscape view is limited by the stations' width
  assert.equal(L.fitDistance(1, 1), 2200);
  assert.equal(L.fitDistance(170, 4), 320);
  // very wide: the height decides
  near(L.fitDistance(40, 10), dV);
});

test('angleDelta takes the short way round', () => {
  near(L.angleDelta(0, 1), 1);
  near(L.angleDelta(-3, 3), 6 - TAU);
  near(L.angleDelta(3, -3), TAU - 6);
  assert.equal(L.angleDelta(1, 1), 0);
});

test('pxPerUnitAt is 0 at or behind the camera', () => {
  assert.equal(L.pxPerUnitAt(100, 500), 5);
  assert.equal(L.pxPerUnitAt(1, 500), 0);
  assert.equal(L.pxPerUnitAt(-10, 500), 0);
});

test('groundT: where a downward ray meets y = 0, otherwise 3000', () => {
  assert.equal(L.groundT(100, -0.5), 200);
  assert.equal(L.groundT(100, 0.5), 3000);
  assert.equal(L.groundT(100, -0.01), 3000); // too shallow
  assert.equal(L.groundT(10000, -1), 3000); // capped
});

test('clampRadius keeps inside and scales outside', () => {
  assert.deepEqual(L.clampRadius(3, 4), { x: 3, z: 4 });
  const c = L.clampRadius(3000, 4000);
  near(c.x, 420);
  near(c.z, 560);
  assert.deepEqual(L.clampRadius(6, 8, 5), { x: 3, z: 4 });
});

test('mmScale fits the stations ring in the smaller side', () => {
  near(L.mmScale(200, 100), 45 / 414);
  near(L.mmScale(100, 300), 45 / 414);
});

// ---------- frame pacing ----------
test('targetFps: 60 while anything wants it, else 30', () => {
  assert.equal(L.targetFps(true, null, null, 0, 0), 60);
  assert.equal(L.targetFps(false, {}, null, 0, 0), 60);
  assert.equal(L.targetFps(false, null, {}, 0, 0), 60);
  assert.equal(L.targetFps(false, null, null, 5, 10), 60);
  assert.equal(L.targetFps(false, null, null, 10, 10), 30);
});

test('frameDt is seconds, clamped to [0, 0.05]; frameDue allows 2 ms slack', () => {
  near(L.frameDt(1016, 1000), 0.016);
  assert.equal(L.frameDt(2000, 1000), 0.05);
  assert.equal(L.frameDt(900, 1000), 0);
  assert.equal(L.frameDue(1015, 1000, 60), true); // 15 >= 16.67 - 2
  assert.equal(L.frameDue(1014, 1000, 60), false);
  assert.equal(L.frameDue(1020, 1000, 30), false);
  assert.equal(L.frameDue(1032, 1000, 30), true);
});

// ---------- parking ----------
test('slotNDC: eight spots down the sides, then a top row and a bottom row', () => {
  assert.deepEqual(L.slotNDC(0, 1000), { x: -(1 - 62 / 500), y: 0.58 });
  assert.deepEqual(L.slotNDC(1, 1000), { x: 1 - 62 / 500, y: 0.58 });
  assert.equal(L.slotNDC(7, 1000).y, -0.48);
  assert.equal(L.slotNDC(0, 200).x, -0.7); // narrow view: margin clamps
  assert.equal(L.slotNDC(1, 100000).x, 0.92);
  assert.deepEqual(L.slotNDC(8, 1000), { x: -0.3, y: 0.8 });
  assert.deepEqual(L.slotNDC(12, 1000), { x: 0.6, y: 0.8 });
  assert.deepEqual(L.slotNDC(13, 1000), { x: -0.3, y: -0.62 });
  assert.deepEqual(L.slotNDC(15, 1000), { x: 0, y: -0.62 });
});

test('parkKey tells sessions and cars apart', () => {
  assert.equal(L.parkKey({ sid: 'a' }), 's:a');
  assert.equal(L.parkKey({ id: 7 }), 'c:7');
});

const sess = (sid, status, since, extra = {}) => ({ sid, status, homeKind: L.homeKindOf(status), dying: 0, slot: -1, s: { statusSince: since }, ...extra });
const car = (id, parkedAt, extra = {}) => ({ id, homeKind: 'park', dying: 0, slot: -1, parkedAt, ...extra });

test('assignParking: waiting sessions first, then oldest; cars from CAR_SLOTS', () => {
  const owner = [], home = new Map();
  const a = sess('a', 'idle', 5), b = sess('b', 'waiting', 9), c = sess('c', 'idle', undefined), o = sess('o', 'busy', 1);
  const x = car('x', 20), y = car('y', 10), lane = car('l', 0, { homeKind: 'lane' });
  L.assignParking([a, b, c, o], [x, y, lane], owner, home);
  assert.equal(b.slot, 0); // waiting
  assert.equal(c.slot, 1); // no statusSince counts as 0
  assert.equal(a.slot, 2);
  assert.equal(o.slot, -1);
  assert.equal(y.slot, L.CAR_SLOTS[0]); // parked first
  assert.equal(x.slot, L.CAR_SLOTS[1]);
  assert.equal(lane.slot, -1);
  assert.equal(owner[0], b);
  assert.equal(owner[6], y);
  assert.deepEqual([...home].sort(), [['c:x', 7], ['c:y', 6], ['s:a', 2], ['s:b', 0], ['s:c', 1]]);
  // running it again changes nothing
  L.assignParking([a, b, c, o], [x, y, lane], owner, home);
  assert.deepEqual([b.slot, c.slot, a.slot, y.slot, x.slot], [0, 1, 2, 6, 7]);
});

test('assignParking: a spot stays its owner\'s while it is away, and it comes back to it', () => {
  const owner = [], home = new Map();
  const a = sess('a', 'idle', 1);
  L.assignParking([a], [], owner, home);
  assert.equal(a.slot, 0);
  a.homeKind = 'orbit';
  L.assignParking([a], [], owner, home);
  assert.equal(a.slot, -1);
  assert.equal(owner[0], null);
  const b = sess('b', 'idle', 2);
  L.assignParking([a, b], [], owner, home);
  assert.equal(b.slot, 1); // 0 is reserved for a
  a.homeKind = 'park';
  L.assignParking([a, b], [], owner, home);
  assert.equal(a.slot, 0);
  // a ends: its spot is freed for good
  a.dying = 1;
  L.assignParking([a, b], [], owner, home);
  assert.equal(a.slot, -1);
  assert.equal(home.has('s:a'), false);
  const c = sess('c', 'idle', 3);
  L.assignParking([b, c], [], owner, home);
  assert.equal(c.slot, 0);
});

test('assignParking: home spot taken by someone else, and cars past the CAR_SLOTS list', () => {
  const squatter = sess('q', 'idle', 0, { slot: 0 });
  const owner = [squatter], home = new Map([['s:a', 0], ['s:q', 0]]);
  const a = sess('a', 'idle', 1);
  L.assignParking([squatter, a], [], owner, home);
  assert.equal(squatter.slot, 0);
  assert.equal(a.slot, 1); // its own spot was occupied
  assert.equal(home.get('s:a'), 0); // it keeps its claim
  // every car spot occupied: the next car takes the first open spot of all
  const owner2 = [], home2 = new Map();
  const fillers = L.CAR_SLOTS.map((k) => { const f = car('f' + k, 0, { slot: k }); owner2[k] = f; return f; });
  const z = car('z', 1);
  L.assignParking([], [...fillers, z], owner2, home2);
  assert.equal(z.slot, 8);
});

// ---------- sessions ----------
test('homeKindOf / statusHex / startTheta', () => {
  assert.equal(L.homeKindOf('idle'), 'park');
  assert.equal(L.homeKindOf('waiting'), 'park');
  assert.equal(L.homeKindOf('busy'), 'orbit');
  assert.equal(L.homeKindOf('ended'), 'orbit');
  const STATUS = { busy: { color: '#b' }, idle: { color: '#i' }, odd: {} };
  assert.equal(L.statusHex(STATUS, 'idle'), '#i');
  assert.equal(L.statusHex(STATUS, 'nope'), '#b');
  assert.equal(L.statusHex(STATUS, 'odd'), '#b');
  near(L.startTheta(0), 0.6);
  near(L.startTheta(3), (3 * 2.39996 + 0.6) % TAU);
  assert.ok(L.startTheta(100) < TAU);
});

test('assignOrbits: one plane and radius each, ended ones outermost; fresh ones jump there', () => {
  const n = (ci, status, extra = {}) => ({ ci, status, homeKind: 'orbit', dying: 0, fresh: true, phi: -1, r: -1, ...extra });
  const a = n(2, 'busy'), b = n(1, 'ended'), c = n(5, 'busy', { fresh: false }), p = n(0, 'idle', { homeKind: 'park' }), d = n(0, 'busy', { dying: 1 });
  L.assignOrbits([a, b, c, p, d]);
  assert.deepEqual([a.rTarget, c.rTarget, b.rTarget], [150, 165, 180]);
  near(a.phiTarget, 0);
  near(c.phiTarget, Math.PI / 3);
  near(b.phiTarget, (2 * Math.PI) / 3);
  assert.equal(a.r, 150);
  assert.equal(a.phi, 0);
  assert.equal(c.r, -1); // not fresh: eases there instead
  assert.equal(p.rTarget, undefined);
  assert.ok([a, b, c, p, d].every((x) => x.fresh === false));
  L.assignOrbits([]); // nothing to do
});

test('orbitOmega: slower further out, ended drifts, kicks speed up', () => {
  near(L.orbitOmega(150, false, 0), 0.42);
  near(L.orbitOmega(600, false, 0), 0.21);
  near(L.orbitOmega(150, true, 0), 0.126);
  near(L.orbitOmega(150, false, 1), 0.42 * 2.2);
});

test('glowLevel by status, kick and hover', () => {
  near(L.glowLevel('busy', 0, 0, false), 0.6);
  near(L.glowLevel('waiting', 0, 0, false), 0.45 + 0.275);
  near(L.glowLevel('idle', 0, 0, false), 0.45);
  near(L.glowLevel('ended', 0, 0, false), 0.1);
  near(L.glowLevel('ended', 0, 1, true), 0.1 + 0.6 + 0.4);
});

test('haloOpacity and orbitRingAlpha', () => {
  assert.equal(L.haloOpacity('busy', 0), 0.5);
  near(L.haloOpacity('idle', 0), 0.35);
  assert.equal(L.haloOpacity('waiting', 0), 0.65);
  assert.equal(L.haloOpacity('ended', 0), 0);
  assert.equal(L.orbitRingAlpha('orbit', 0, 'busy'), 0.55);
  assert.equal(L.orbitRingAlpha('orbit', 0, 'ended'), 0.18);
  assert.equal(L.orbitRingAlpha('orbit', 5, 'busy'), 0);
  assert.equal(L.orbitRingAlpha('park', 0, 'idle'), 0);
});

test('springSettled needs both close and slow', () => {
  assert.equal(L.springSettled(0.3, 3, 1), true);
  assert.equal(L.springSettled(0.5, 3, 1), false);
  assert.equal(L.springSettled(0.3, 5, 1), false);
  assert.equal(L.springSettled(0.5, 3, 2), true);
});

test('sessionTitle falls back title > lastPrompt > cwd > empty', () => {
  assert.equal(L.sessionTitle({ title: 'T', lastPrompt: 'P', cwd: 'C' }, clipT), 'T');
  assert.equal(L.sessionTitle({ lastPrompt: 'P', cwd: 'C' }, clipT), 'P');
  assert.equal(L.sessionTitle({ cwd: 'C' }, clipT), 'C');
  assert.equal(L.sessionTitle({}, clipT), '');
  assert.equal(L.sessionTitle({ title: 'x'.repeat(40) }, clipT).length, 32);
});

test('parkPulse / pulsePhase', () => {
  assert.deepEqual(L.parkPulse('waiting'), { period: 1300, count: 3, spread: 1.6, alpha: 0.95 });
  assert.deepEqual(L.parkPulse('idle'), { period: 2200, count: 2, spread: 1.1, alpha: 0.55 });
  assert.equal(L.pulsePhase(0, 0, 1000, 2, 0), 0);
  assert.equal(L.pulsePhase(0, 1, 1000, 2, 0), 0.5);
  near(L.pulsePhase(0, 0, 1000, 2, 1), 0.3);
  near(L.pulsePhase(1250, 0, 1000, 2, 0), 0.25);
});

test('droneOrbit spreads drones round; past seven they alternate rings', () => {
  assert.deepEqual(L.droneOrbit(0, 1, 0), { ang: 0, rx: 80, ry: 58 });
  near(L.droneOrbit(1, 4, 0).ang, Math.PI / 2);
  near(L.droneOrbit(0, 0, 9000).ang, 1); // count 0 never divides by zero
  assert.deepEqual(L.droneOrbit(1, 8, 0), { ang: TAU / 8, rx: 94, ry: 58 + 8.4 });
  assert.equal(L.droneOrbit(2, 8, 0).rx, 80);
});

test('droneLabel falls back desc > type > alt ajan', () => {
  assert.equal(L.droneLabel({ desc: 'd', type: 't' }, clipT), 'd');
  assert.equal(L.droneLabel({ type: 't' }, clipT), 't');
  assert.equal(L.droneLabel({}, clipT), 'alt ajan');
});

// ---------- cars ----------
test('freeAngle joins the widest gap on the lane', () => {
  near(L.freeAngle([]), TAU * 0.12);
  near(L.freeAngle([{ theta: 0, homeKind: 'lane' }]), Math.PI);
  near(L.freeAngle([{ theta: 0, homeKind: 'lane' }, { theta: 1, homeKind: 'lane' }]), 1 + (TAU - 1) / 2);
  // negative angles are wrapped; parked and dying cars don't count
  const ships = [{ theta: -TAU + 2, homeKind: 'lane' }, { theta: 4, homeKind: 'lane' }, { theta: 3, homeKind: 'park' }, { theta: 3, homeKind: 'lane', dying: 1 }];
  near(L.freeAngle(ships), 4 + (TAU - 2) / 2);
  // a wide first gap wins over a later narrower one
  near(L.freeAngle([{ theta: 0, homeKind: 'lane' }, { theta: 5, homeKind: 'lane' }, { theta: 5.5, homeKind: 'lane' }]), 2.5);
});

test('onLane / shipKind / parkSide', () => {
  assert.equal(L.onLane({ homeKind: 'lane', dying: 0 }), true);
  assert.equal(L.onLane({ homeKind: 'lane', dying: 1 }), false);
  assert.equal(L.onLane({ homeKind: 'park', dying: 0 }), false);
  assert.equal(L.shipKind({ running: true }), 'lane');
  assert.equal(L.shipKind({ running: false }), 'park');
  assert.equal(L.parkSide(0.8), -1);
  assert.equal(L.parkSide(-0.8), 1);
  assert.equal(L.parkSide(0), 1);
});

test('shipCruise scales with CPU up to 60%', () => {
  assert.equal(L.shipCruise({ running: false, cpu: 90 }), 0);
  near(L.shipCruise({ running: true }), 0.09);
  near(L.shipCruise({ running: true, cpu: 30 }), 0.17);
  near(L.shipCruise({ running: true, cpu: 600 }), 0.25);
});

test('shipThrust: flying, running, idle', () => {
  assert.equal(L.shipThrust({}, 0, false, 0, 0, 0), 0.6);
  assert.equal(L.shipThrust({}, 1, false, 0, 0, 0), 0.04); // a dying car doesn't fire up
  assert.equal(L.shipThrust(null, 0, false, 0, 0, 0), 0.04);
  near(L.shipThrust(null, 0, true, undefined, 0, 0), 0.55);
  near(L.shipThrust(null, 0, true, 40, 0, 0), 0.75);
  near(L.shipThrust(null, 0, true, 1000, 0, 0), 0.85);
});

test('flameScale per thruster kind', () => {
  assert.deepEqual(L.flameScale({ main: true, fan: true }), [4, 7]);
  assert.deepEqual(L.flameScale({ fan: true }), [3, 5]);
  assert.deepEqual(L.flameScale({}), [1, 1.4]);
});

test('shipTitle / shipSub text', () => {
  assert.equal(L.shipTitle({ running: true, cmd: 'npm run dev' }, clipT), 'npm run dev');
  assert.equal(L.shipTitle({ running: true }, clipT), 'çalışıyor');
  assert.equal(L.shipTitle({ running: false, dir: 'web' }, clipT), 'web');
  assert.equal(L.shipTitle({ running: false }, clipT), 'terminal');
  assert.equal(L.shipSub({ left: true, running: true, dir: 'api' }), 'açık kaldı · api');
  assert.equal(L.shipSub({ running: true, dir: 'api', cpu: 42.6 }), 'api · 43% cpu');
  assert.equal(L.shipSub({ running: true, dir: 'api', cpu: 0.5 }), 'api');
  assert.equal(L.shipSub({ running: false, dir: 'api' }), 'boşta kabuk');
});

// ---------- boxes ----------
test('boxKey / boxHeat / boxTip', () => {
  assert.equal(L.boxKey({ pid: 42, started: 'Mon' }), '42:Mon');
  assert.equal(L.boxHeat(50), 0.5);
  assert.equal(L.boxHeat(250), 1);
  const html = L.boxTip({ name: '<x>', cpu: 99.6, cmd: 'node a.js' }, R);
  assert.match(html, /⚠ &lt;x> · 100% cpu/);
  assert.match(html, /<div class="r">node a\.js<\/div>/);
  assert.match(html, /click to end it/);
});

// ---------- cinematic ----------
const seq = (...v) => { let i = 0; return () => v[i++ % v.length]; };

test('nextShot prefers moving subjects and never repeats the last one', () => {
  const core = { kind: 'core', key: 'core' }, s1 = { kind: 'session', key: 'a' }, s2 = { kind: 'car', key: 'b' };
  // moving pick (rnd < 0.8), second of two, chase style (0.5 >= 0.4)
  let shot = L.nextShot([core, s1, s2], 'zzz', 100, seq(0.1, 0.6, 0.5, 0.5, 0.25));
  assert.equal(shot.key, 'b');
  assert.equal(shot.style, 'chase');
  assert.equal(shot.t0, 100);
  assert.equal(shot.until, 100 + 9000 + 2000);
  near(shot.ang, 0.25 * TAU);
  assert.equal(shot.prev, null);
  // the current one is left out
  shot = L.nextShot([core, s1, s2], 'b', 0, seq(0.1, 0.9, 0.1, 0, 0));
  assert.equal(shot.key, 'a');
  assert.equal(shot.style, 'orbit'); // 0.1 < 0.4
  // rnd >= 0.8: anything in the pool, the core always circled
  shot = L.nextShot([core, s1], 'a', 0, seq(0.9, 0.1, 0, 0));
  assert.equal(shot.kind, 'core');
  assert.equal(shot.style, 'orbit');
  // only the core, which was the last shot too: still the core
  shot = L.nextShot([core], 'core', 0, seq(0.5, 0, 0));
  assert.equal(shot.key, 'core');
  // default rng works
  assert.ok(['core', 'a'].includes(L.nextShot([core, s1], null, 0).key));
});

test('shotDistance per subject', () => {
  assert.equal(L.shotDistance('core'), 620);
  assert.equal(L.shotDistance('car'), 260);
  assert.equal(L.shotDistance('box'), 220);
  assert.equal(L.shotDistance('session'), 360);
});

// ---------- effects ----------
test('partLabel: a glyph per tool category', () => {
  assert.equal(L.partLabel({ c: 'web', n: 'WebSearch', l: 'q' }, clipT), '⌕ q');
  assert.equal(L.partLabel({ c: 'web', n: 'WebFetch', l: 'u' }, clipT), '↓ u');
  assert.equal(L.partLabel({ c: 'edit', l: 'f' }, clipT), '✎ f');
  assert.equal(L.partLabel({ c: 'read', l: 'f' }, clipT), '▤ f');
  assert.equal(L.partLabel({ c: 'bash', l: 'ls' }, clipT), '$ ls');
  assert.equal(L.partLabel({ c: 'agent', l: 'x' }, clipT), '◆ x');
  assert.equal(L.partLabel({ c: 'plan', n: 'TodoWrite', l: '3' }, clipT), 'TodoWrite 3');
  assert.equal(L.partLabel({ c: 'plan', n: 'TodoWrite' }, clipT), 'TodoWrite');
  assert.equal(L.partLabel({ c: 'other', n: 'Mcp', l: 'z' }, clipT), 'z');
  assert.equal(L.partLabel({ c: 'other', n: 'Mcp' }, clipT), 'Mcp');
  assert.equal(L.partLabel({ c: 'bash', l: 'y'.repeat(50) }, clipT).length, 2 + 34);
});

test('stripGlyph removes a leading category glyph only', () => {
  assert.equal(L.stripGlyph('✎ a.js'), 'a.js');
  assert.equal(L.stripGlyph('$ ls'), 'ls');
  assert.equal(L.stripGlyph('TodoWrite 3'), 'TodoWrite 3');
  assert.equal(L.stripGlyph('a ✎ b'), 'a ✎ b');
});

test('wireKey / wireBase / wireFade', () => {
  assert.equal(L.wireKey({ s: 's1', a: 'a1', c: 'bash' }), 's1|a1|bash');
  assert.equal(L.wireKey({ s: 's1', c: 'bash' }), 's1||bash');
  assert.equal(L.wireBase(0), 0.42);
  near(L.wireBase(25_000), 0.05 + 0.16 * (1 - 25_000 / 600_000));
  near(L.wireBase(600_000), 0.05);
  assert.equal(L.wireFade(1, 0), 0);
  assert.equal(L.wireFade(1, 0.5), 1);
  near(L.wireFade(1, 0.1), 0.6);
  near(L.wireFade(1, 1), 0.25);
});

test('bezier: endpoints, midpoint', () => {
  const out = { set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } };
  const A = { x: 0, y: 0, z: 0 }, C = { x: 1, y: 2, z: 0 }, B = { x: 2, y: 0, z: 4 };
  assert.deepEqual({ ...L.bezier(A, C, B, 0, out), set: undefined }, { x: 0, y: 0, z: 0, set: undefined });
  assert.equal(L.bezier(A, C, B, 0, out), out);
  L.bezier(A, C, B, 1, out);
  assert.deepEqual([out.x, out.y, out.z], [2, 0, 4]);
  L.bezier(A, C, B, 0.5, out);
  assert.deepEqual([out.x, out.y, out.z], [1, 1, 1]);
});

test('labelOpacity rises and falls over a bolt, as a 2-decimal string', () => {
  assert.equal(L.labelOpacity(0), '0.00');
  assert.equal(L.labelOpacity(0.5), '1.00');
  assert.equal(L.labelOpacity(0.1), (Math.sin(0.1 * Math.PI) * 1.5).toFixed(2));
});

test('usageText / sysText / stationLive / parkedText', () => {
  assert.equal(L.usageText({ out: 12, c: 0.5 }, R), '+12t çıktı · $0.5');
  assert.equal(L.sysText({ err: true, l: 'boom' }, clipT), '⚠ boom');
  assert.equal(L.sysText({ l: 'note' }, clipT), 'note');
  assert.equal(L.stationLive(2), '● 2 canlı');
  assert.equal(L.stationLive(0), '');
  assert.equal(L.parkedText(3), '3 park halinde');
});

test('constants index.js relies on', () => {
  assert.equal(L.K.HEX, 34);
  assert.equal(L.DRONE_HEX, 13);
  assert.deepEqual(L.LANE, { R: 305, Y: 18, LIFT: 12, SIZE: 1.7 });
  assert.equal(L.CINE.IDLE_MS, 300_000);
  assert.equal(L.WIRE_MS, 600_000);
  assert.equal(L.CAR_SLOTS.length, 13);
});
