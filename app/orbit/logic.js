// The orbit map's pure logic, pulled out of index.js so it can be tested without WebGL, a DOM or 'three': layout
// constants, orbit and parking assignment, lane spacing, motion curves, label text and a few bits of view maths.
// Nothing here touches the scene; index.js feeds it plain numbers and objects and applies what comes back.
import { clamp, TAU } from './util.js';

export const K = {
  CORE_R: 60, // the activity gauge in the middle (2D map style), the "nucleus" of the atom
  HEX: 34, // hexagon radius of a session icon in world units
  ATOM_R: 150, // innermost electron orbit
  ATOM_STEP: 15,
  TILT: 1.2, // how far each orbit plane leans out of the screen plane
  STATION_R: 390,
  PARK_HEX_PX: 27, // on-screen hexagon radius of a parked session
  PARK_CAR_PX: 86, // on-screen length of a parked car
  POLAR: 1.08, // default camera angle from straight above
};
export const DRONE_HEX = 13;
export const LANE = { R: 305, Y: 18, LIFT: 12, SIZE: 1.7 }; // SIZE: the car's scale, so its shape reads at the default zoom
export const CINE = { IDLE_MS: 300_000, SHOT_MS: 9000, SHOT_JITTER: 4000 };
export const WIRE_MS = 600_000; // a wire to a station fades out over ten minutes
export const WIRE_HOT_MS = 25_000;
// Sessions take the parking spots from the top down and cars from the bottom up, so the two stay apart.
export const CAR_SLOTS = [6, 7, 4, 5, 2, 3, 0, 1, 13, 14, 15, 16, 17];

// ---------- view ----------
// Camera distance that fits the stations ring across and the atom up and down, for a vertical fov in degrees.
export function fitDistance(fovDeg, aspect) {
  const vf = ((fovDeg / 2) * Math.PI) / 180;
  const hf = Math.atan(Math.tan(vf) * aspect);
  const dH = (K.STATION_R + 30) / (Math.tan(hf) * 0.74); // keep the side margins free for parked sessions
  const dV = (K.ATOM_R + 3 * K.ATOM_STEP + K.HEX + 30) / (Math.tan(vf) * 0.86);
  return clamp(Math.max(dH, dV), 320, 2200);
}
// The shortest way round from angle a to angle b (for a, b in [-PI, PI], as Spherical.theta gives them).
export function angleDelta(a, b) {
  let d = b - a;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}
// Pixels per world unit at depth d in front of the camera (0 behind or at it).
export const pxPerUnitAt = (d, focal) => (d > 1 ? focal / d : 0);
// Where a ray from height oy going down dy meets the ground, capped at 3000 (also when it looks up or level).
export const groundT = (oy, dy) => Math.min(dy < -0.02 ? -oy / dy : 3000, 3000);
// Scales a pan offset back inside a circle of radius max.
export function clampRadius(x, z, max = 700) {
  const len = Math.hypot(x, z), k = len > max ? max / len : 1;
  return { x: x * k, z: z * k };
}
export const mmScale = (w, h) => (Math.min(w, h) * 0.5 - 5) / (K.STATION_R + 24);

// ---------- frame pacing ----------
export const targetFps = (focused, pressing, animating, now, until) => (focused || pressing || animating || now < until ? 60 : 30);
export const frameDt = (now, last) => Math.min(0.05, Math.max(0, (now - last) / 1000));
export const frameDue = (now, last, fps) => !(now - last < 1000 / fps - 2);

// ---------- parking spots at the edges of the view ----------
// Spot i in normalized device coordinates, for a view w pixels wide: 8 down the sides, then the top and bottom rows.
export function slotNDC(i, w) {
  const mx = clamp(1 - 62 / (w / 2), 0.7, 0.92);
  const rows = [0.58, 0.22, -0.14, -0.48];
  if (i < 8) return { x: (i % 2 ? 1 : -1) * mx, y: rows[i >> 1] };
  const j = i - 8, xs = [-0.3, 0.3, 0, -0.6, 0.6];
  return { x: xs[j % xs.length], y: j < xs.length ? 0.8 : -0.62 };
}
export const parkKey = (o) => (o.sid ? 's:' + o.sid : 'c:' + o.id);

// Gives every parked session and car a spot (o.slot; -1 for anything not parked), in slotOwner (spot -> owner).
// The spot a chat or a car takes the first time it parks is its own until it ends (homeSlot: parkKey -> spot), like a
// tab: it comes back there every time it parks again, and nothing else parks there meanwhile.
export function assignParking(sessions, ships, slotOwner, homeSlot) {
  for (let i = 0; i < slotOwner.length; i++) {
    const o = slotOwner[i];
    if (o && (o.dying || o.homeKind !== 'park')) slotOwner[i] = null;
  }
  const all = [...sessions, ...ships];
  const live = new Set(all.filter((o) => !o.dying).map(parkKey));
  for (const k of homeSlot.keys()) if (!live.has(k)) homeSlot.delete(k);
  const reserved = new Set(homeSlot.values());
  for (const o of all) if (o.homeKind !== 'park' || o.dying) o.slot = -1;
  const parkedSessions = sessions
    .filter((n) => !n.dying && n.homeKind === 'park')
    .sort((a, b) => (a.status === 'waiting' ? 0 : 1) - (b.status === 'waiting' ? 0 : 1) || (a.s.statusSince || 0) - (b.s.statusSince || 0));
  const cars = ships.filter((s) => !s.dying && s.homeKind === 'park').sort((a, b) => a.parkedAt - b.parkedAt);
  const free = (o, order) => {
    const mine = homeSlot.get(parkKey(o));
    if (mine !== undefined && !slotOwner[mine]) return mine;
    const open = (k) => !slotOwner[k] && !reserved.has(k);
    const i = order.find(open);
    if (i !== undefined) return i;
    for (let k = 0; ; k++) if (open(k)) return k;
  };
  for (const [list, order] of [[parkedSessions, []], [cars, CAR_SLOTS]]) {
    for (const o of list) {
      if (o.slot >= 0 && slotOwner[o.slot] === o) continue;
      o.slot = free(o, order);
      slotOwner[o.slot] = o;
      if (!homeSlot.has(parkKey(o))) {
        homeSlot.set(parkKey(o), o.slot);
        reserved.add(o.slot);
      }
    }
  }
}

// ---------- sessions ----------
export const homeKindOf = (status) => (status === 'idle' || status === 'waiting' ? 'park' : 'orbit');
export const statusHex = (STATUS, st) => STATUS[st]?.color || STATUS.busy.color;
// Where a new session starts round its orbit: golden-angle steps by colour index, so neighbours spread out.
export const startTheta = (ci) => (ci * 2.39996 + 0.6) % TAU;

// Orbiting sessions (ended ones outermost) get one orbit plane and radius each: plane i of n is turned i·180°/n.
// A fresh session jumps straight to its orbit; afterwards every node eases there.
export function assignOrbits(nodes) {
  const orb = nodes.filter((n) => !n.dying && n.homeKind === 'orbit').sort((a, b) => (a.status === 'ended') - (b.status === 'ended') || a.ci - b.ci);
  const n = orb.length;
  orb.forEach((o, i) => {
    o.phiTarget = (i * Math.PI) / Math.max(1, n);
    o.rTarget = K.ATOM_R + i * K.ATOM_STEP;
    if (o.fresh) {
      o.phi = o.phiTarget;
      o.r = o.rTarget;
    }
  });
  for (const o of nodes) o.fresh = false;
}
// Angular speed on an orbit of radius r: outer orbits slower (Kepler-ish), ended sessions drift, a tool call kicks.
export const orbitOmega = (r, ended, kick) => 0.42 * Math.sqrt(K.ATOM_R / r) * (ended ? 0.3 : 1) * (1 + kick * 1.2);
// The hexagon's glow by status (busy pulses, waiting blinks), plus a tool kick and hover.
export function glowLevel(status, now, kick, hovered) {
  let g = 0.1;
  if (status === 'busy') g = 0.6 + 0.2 * Math.sin(now / 280);
  else if (status === 'waiting') g = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(now / 160));
  else if (status === 'idle') g = 0.45;
  return g + kick * 0.6 + (hovered ? 0.4 : 0);
}
export const haloOpacity = (status, now) =>
  status === 'busy' ? 0.5 : status === 'idle' ? 0.2 + 0.3 * (0.5 + 0.5 * Math.sin(now / 900)) : status === 'waiting' ? 0.65 : 0;
export const orbitRingAlpha = (homeKind, dying, status) => (homeKind === 'orbit' && !dying ? (status === 'ended' ? 0.18 : 0.55) : 0);
// A spring-back has settled once it is this close to home and this slow.
export const springSettled = (dist, speed, homeScale) => dist < 0.4 * homeScale && speed < 4;
export const sessionTitle = (s, clipT) => clipT(s.title || s.lastPrompt || s.cwd || '', 32);
// The rings a parked session keeps sending out: waiting is faster, more of them, wider and brighter.
export function parkPulse(status) {
  const w = status === 'waiting';
  return { period: w ? 1300 : 2200, count: w ? 3 : 2, spread: w ? 1.6 : 1.1, alpha: w ? 0.95 : 0.55 };
}
export const pulsePhase = (now, k, period, count, ci) => ((now + (k * period) / count + ci * 300) % period) / period;

// A subagent's place on the ellipse round its session: an angle and the two radii (before the session's scale).
// More than seven alternate between two rings.
export function droneOrbit(idx, count, now) {
  const ring = count > 7 ? (idx % 2) * 14 : 0;
  return { ang: (idx / Math.max(1, count)) * TAU + now / 9000, rx: K.HEX + 46 + ring, ry: K.HEX + 24 + ring * 0.6 };
}
export const droneLabel = (ag, clipT) => clipT(ag.desc || ag.type || 'alt ajan', 18);

// ---------- terminal cars ----------
// A car joins the lane in the middle of the widest gap, never on top of another.
export function freeAngle(ships) {
  const angles = ships.filter((s) => !s.dying && s.homeKind === 'lane').map((s) => ((s.theta % TAU) + TAU) % TAU).sort((a, b) => a - b);
  if (!angles.length) return TAU * 0.12;
  let gap = 0, at = 0;
  angles.forEach((a, i) => {
    const b = i + 1 < angles.length ? angles[i + 1] : angles[0] + TAU;
    if (b - a > gap) {
      gap = b - a;
      at = a + gap / 2;
    }
  });
  return at;
}
export const onLane = (s) => !s.dying && s.homeKind === 'lane';
export const shipKind = (t) => (t.running ? 'lane' : 'park');
// Lane speed: still when nothing runs, faster the more CPU the job burns.
export const shipCruise = (t) => (t.running ? 0.09 + Math.min(1, (t.cpu || 0) / 60) * 0.16 : 0);
export function shipThrust(flying, dying, running, cpu, now, i) {
  if (flying && !dying) return 0.6;
  return running ? 0.55 + 0.2 * Math.sin(now / 80 + i) + Math.min(0.3, (cpu || 0) / 200) : 0.04;
}
// A thruster's [base, gain] scale: the main jets biggest, the fans next.
export const flameScale = (ud) => (ud.main ? [4, 7] : ud.fan ? [3, 5] : [1, 1.4]);
export const shipTitle = (t, clipT) => (t.running ? clipT(t.cmd || 'çalışıyor', 30) : t.dir || 'terminal');
export const shipSub = (t) => (t.left ? `açık kaldı · ${t.dir}` : t.running ? `${t.dir}${t.cpu >= 1 ? ` · ${Math.round(t.cpu)}% cpu` : ''}` : 'boşta kabuk');
// Parked cars face the middle of the view: a car on the right half turns left.
export const parkSide = (ndcX) => (ndcX > 0 ? -1 : 1);

// ---------- runaway boxes ----------
export const boxKey = (r) => `${r.pid}:${r.started}`;
export const boxHeat = (cpu) => Math.min(1, cpu / 100);
export const boxTip = (r, R) =>
  `<div class="h" style="color:#ff5a3c">⚠ ${R.esc(r.name)} · ${Math.round(r.cpu)}% cpu</div>` +
  `<div class="r">${R.esc(R.clipT(r.cmd, 70))}</div>` +
  '<div class="d">burning a core with nobody to see it · click to end it</div>';

// ---------- cinematic camera ----------
// The next shot: something that moves more often than the core, never the same subject twice in a row.
export function nextShot(all, curKey, now, rnd = Math.random) {
  const pool = all.filter((x) => x.key !== curKey);
  const moving = pool.filter((x) => x.kind !== 'core');
  const pick = moving.length && rnd() < 0.8 ? moving[Math.floor(rnd() * moving.length)] : pool[Math.floor(rnd() * pool.length)] || all[0];
  return { ...pick, style: pick.kind === 'core' || rnd() < 0.4 ? 'orbit' : 'chase', t0: now, until: now + CINE.SHOT_MS + rnd() * CINE.SHOT_JITTER, ang: rnd() * TAU, prev: null };
}
// How far the camera stays from a subject, so it sits well inside the picture.
export const shotDistance = (kind) => (kind === 'core' ? 620 : kind === 'car' ? 260 : kind === 'box' ? 220 : 360);

// ---------- effects ----------
export function partLabel(ev, clipT) {
  const l = clipT(ev.l || '', 34);
  switch (ev.c) {
    case 'web': return (ev.n === 'WebSearch' ? '⌕ ' : '↓ ') + l;
    case 'edit': return '✎ ' + l;
    case 'read': return '▤ ' + l;
    case 'bash': return '$ ' + l;
    case 'agent': return '◆ ' + l;
    case 'plan': return ev.n + (l ? ' ' + l : '');
    default: return l || ev.n;
  }
}
// A bolt's text without its category glyph, for the station's "last" line.
export const stripGlyph = (text) => text.replace(/^[⌕↓✎▤$◆]\s/, '');
export const wireKey = (ev) => `${ev.s}|${ev.a || ''}|${ev.c}`;
export const wireBase = (age) => (age < WIRE_HOT_MS ? 0.42 : 0.05 + 0.16 * (1 - age / WIRE_MS));
// Along a wire (t 0..1): fades in quickly at the session end and out toward the station.
export const wireFade = (base, t) => base * Math.min(1, t * 6, (1 - t) * 6 + 0.25);
// Quadratic Bézier through A, C, B at t into out (anything with set(x, y, z)).
export function bezier(A, C, B, t, out) {
  const u = 1 - t;
  return out.set(u * u * A.x + 2 * u * t * C.x + t * t * B.x, u * u * A.y + 2 * u * t * C.y + t * t * B.y, u * u * A.z + 2 * u * t * C.z + t * t * B.z);
}
export const labelOpacity = (u) => Math.min(1, Math.sin(u * Math.PI) * 1.5).toFixed(2);
export const usageText = (ev, R) => `+${R.fmtTok(ev.out)} çıktı · ${R.fmtUsd(ev.c)}`;
export const sysText = (ev, clipT) => `${ev.err ? '⚠ ' : ''}${clipT(ev.l, 48)}`;
export const stationLive = (live) => (live ? `● ${live} canlı` : '');
export const parkedText = (n) => `${n} park halinde`;
