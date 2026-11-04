'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { importOrbit } = require('../helpers/orbit');

let M, T;
test.before(async () => {
  M = await importOrbit('models.js');
  T = await importOrbit('../../tests/helpers/three-stub.mjs');
});

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
const meshes = (g) => g.children.filter((c) => c instanceof T.Mesh);

test('buildStation: platform, edges, core, two rings and three antennas', () => {
  const col = new T.Color(1, 0.5, 0.25);
  const s = M.buildStation(col);
  assert.equal(s.group.children.length, 5 + 3 * 2);
  assert.ok(s.group.children[1] instanceof T.LineSegments);
  assert.equal(s.core.position.y, 11);
  assert.equal(s.ring.position.y, 11);
  assert.equal(s.ring2.position.y, 11);
  near(s.ring2.rotation.x, Math.PI / 2);
  assert.equal(s.coreMat.emissive, col);
  assert.equal(s.coreMat.emissiveIntensity, 0.9);
  assert.equal(s.core.geometry.type, 'Octahedron');
  // the colour is copied, not tinted in place
  assert.equal(col.r, 1);
  near(s.ring.material.color.r, 1.3);
  // antennas on a circle of 10.5, the tips above the spires
  const spires = s.group.children.slice(5).filter((_, i) => i % 2 === 0);
  const tips = s.group.children.slice(5).filter((_, i) => i % 2 === 1);
  for (const m of spires) { near(Math.hypot(m.position.x, m.position.z), 10.5); assert.equal(m.position.y, 5.5); }
  for (const m of tips) { assert.equal(m.position.y, 10.4); near(m.material.color.g, 1); }
  near(Math.atan2(spires[0].position.z, spires[0].position.x), Math.PI / 6);
  // geometries are built once and shared by every station
  const s2 = M.buildStation(new T.Color(0, 1, 0));
  assert.equal(s2.group.children[0].geometry, s.group.children[0].geometry);
  assert.equal(s2.group.children[1].geometry.source, s.group.children[0].geometry);
  assert.notEqual(s2.coreMat, s.coreMat);
});

test('buildBlueBox: body, posts, roof, lamp and four sides of doors', () => {
  const b = M.buildBlueBox();
  const sides = b.group.children.filter((c) => c instanceof T.Group);
  assert.equal(sides.length, 4);
  assert.equal(meshes(b.group).length, 11);
  for (const [f, side] of sides.entries()) {
    near(side.rotation.y, (f * Math.PI) / 2);
    assert.equal(side.children.length, 1 + 2 * (4 + 3));
  }
  assert.equal(b.lamp.position.y, 17 + 3);
  assert.equal(b.lamp.geometry.type, 'Box');
  assert.deepEqual(b.lamp.geometry.args, [2, 2.6, 2]);
  assert.equal(b.own.length, 4 + 11 + 4 * 15); // four materials and every geometry, to dispose
  assert.equal(b.own[0], b.blue);
  assert.equal(b.blue.emissiveIntensity, 1);
  // each box is its own (it is disposed when it goes)
  const b2 = M.buildBlueBox();
  assert.notEqual(b2.lamp.geometry, b.lamp.geometry);
  assert.notEqual(b2.blue, b.blue);
});

test('carStudio: five light panels all facing the car', () => {
  const s = M.carStudio();
  assert.ok(s instanceof T.Scene);
  assert.equal(s.children.length, 5);
  for (const p of s.children) {
    assert.deepEqual({ ...p.lookingAt }, { x: 0, y: 0, z: 0 });
    assert.equal(p.material.side, T.DoubleSide);
  }
  assert.deepEqual(s.children[0].geometry.parameters, { width: 14, height: 6 });
  near(s.children[0].material.color.r, 2); // white x 2
  near(s.children[3].material.color.r, 2); // warm side: 0xff red x 2
  near(s.children[3].material.color.b, (0x4a / 255) * 2);
  assert.deepEqual({ ...s.children[4].position }, { x: 13, y: 1, z: 0 });
  near(s.background.r, 7 / 255);
});

test('buildRoadster: body lofted through sections, glass and roof split, wheels, wing, thrusters', () => {
  const accent = new T.Color(0.2, 0.4, 0.6), env = { env: 1 };
  const car = M.buildRoadster(accent, env);
  assert.equal(M.CAR_LENGTH, 29.5);
  assert.equal(car.group.children.length, 37);
  assert.deepEqual(car.own, [car.metal, car.glassMat, car.group.children[1].material, car.group.children.at(-1).material]);
  assert.equal(car.metal.emissive, accent);
  assert.equal(car.metal.envMap, env);
  assert.equal(car.glassMat.envMap, env);
  // thrusters: twin main nozzles, four vents, the lift fan
  assert.equal(car.jets.length, 7);
  assert.equal(car.jetKinds.filter((j) => j.main).length, 2);
  assert.equal(car.jetKinds.filter((j) => j.fan).length, 1);
  assert.deepEqual({ ...car.jets[0] }, { x: -2.7, y: 2.15, z: -15.5 });
  assert.equal(car.jets[0], car.jetKinds[0].at);
  near(car.jets[1].x, -6.52);
  near(car.jets[1].y, 2.05);
  assert.deepEqual({ ...car.jets[6] }, { x: 0, y: -0.8, z: -1 });

  // body: 12 sections of 14 points, 11 x 14 quads plus two capped ends
  const [body, bodyEdges, glass, roof, roofEdges] = car.group.children;
  const pos = body.geometry.attributes.position;
  assert.equal(pos.itemSize, 3);
  assert.equal(pos.array.length / 3, 11 * 14 * 6 + 2 * 14 * 3);
  assert.equal(body.geometry.creaseAngle, 0.6);
  assert.equal(bodyEdges.geometry.source, body.geometry);
  assert.equal(bodyEdges.geometry.angle, 32);
  assert.equal(roofEdges.geometry.angle, 25);
  // the first cap fans out from the middle of the nose section
  const a = pos.array, capStart = 11 * 14 * 6 * 3;
  near(a[capStart], 0);
  near(a[capStart + 2], 14.2);
  // the nose ring: top (0, 1.65) and the floor (0, 1.05) average with the sides
  assert.ok(a[capStart + 1] > 1.05 && a[capStart + 1] < 1.75);
  // glass: windshield (5 panels), side windows (2), rear window (3); roof the other 5; no caps
  assert.equal(glass.geometry.attributes.position.array.length / 3, 10 * 6);
  assert.equal(roof.geometry.attributes.position.array.length / 3, 5 * 6);
  assert.equal(glass.material, car.glassMat);
  assert.equal(roof.material, car.metal);
  // the body is symmetric: every x has its mirror
  const xs = new Set();
  for (let i = 0; i < a.length; i += 3) xs.add(Math.round(a[i] * 1000));
  for (const x of xs) assert.ok(xs.has(-x) || x === 0, `no mirror for ${x}`);

  // pillars: a rod from A to B, midway, aimed along it
  const pillar = car.group.children[5];
  assert.equal(pillar.geometry.type, 'Cylinder');
  near(pillar.geometry.args[2], Math.hypot(0.8, 2.2, 4.2));
  near(pillar.position.x, -3.7);
  near(pillar.position.z, 3.7);
  near(pillar.quaternion.to.length(), 1);
  assert.deepEqual({ ...pillar.quaternion.from }, { x: 0, y: 1, z: 0 });

  // wheels: tire, rim, spokes at four corners, tires turned on their side
  const tires = car.group.children.filter((c) => c.geometry && c.geometry.type === 'Cylinder' && c.geometry.args[0] === 1.85);
  assert.equal(tires.length, 4);
  assert.deepEqual(tires[0].geometry.rotations, [['z', Math.PI / 2]]);
  const spokes = car.group.children.find((c) => c.geometry && c.geometry.merged);
  assert.equal(spokes.geometry.merged.length, 6);
  assert.ok(spokes.geometry.merged.slice(0, 5).every((g) => g.nonIndexed)); // indexed boxes converted
  assert.equal(spokes.geometry.merged[5].type, 'Cylinder'); // the hub, already non-indexed, goes as it is
  assert.equal(spokes.geometry.merged[5].nonIndexed, undefined);
  near(spokes.geometry.merged[2].rotations[0][1], (2 / 5) * Math.PI);
  // the wing leans back a little
  const wing = car.group.children.find((c) => c.geometry && c.geometry.type === 'Box' && c.geometry.args[0] === 9.8);
  near(wing.rotation.x, -0.1);
  assert.equal(wing.position.z, -12.7);
});

test('buildRoadster: shared geometry and materials, its own paint', () => {
  const env1 = { n: 1 }, env2 = { n: 2 };
  const a = M.buildRoadster(new T.Color(1, 0, 0), env1);
  const b = M.buildRoadster(new T.Color(0, 1, 0), env2);
  assert.equal(a.group.children[0].geometry, b.group.children[0].geometry);
  assert.equal(a.group.children[5].material, b.group.children[5].material); // trim
  assert.notEqual(a.metal, b.metal);
  assert.equal(b.metal.envMap, env2);
  // the shared materials keep the env map they were made with
  assert.notEqual(b.group.children[5].material.envMap, env2);
});
