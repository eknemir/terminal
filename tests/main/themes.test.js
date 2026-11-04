'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { requireWith, ROOT } = require('../helpers/electron');

const { createThemes, derive } = requireWith('windows/src/themes.js');

const ANSI = ['#000000', '#cc0000', '#00cc00', '#cccc00', '#0000cc', '#cc00cc', '#00cccc', '#cccccc',
  '#555555', '#ff5555', '#55ff55', '#ffff55', '#5555ff', '#ff55ff', '#55ffff', '#ffffff'];
const A = { id: 'a', name: 'A', bg: '#101010', fg: '#e0e0e0', cursor: '#ff0000', selection: '#ffffff', accent: '#3fb6ec', ansi: ANSI };
const B = { id: 'b', name: 'B', bg: '#fafafa', fg: '#202020', accent: '#d4ff00', ansi: ANSI, glow: true, ui: { '--txt': '#123456' } };

function webDir(list) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'atl-themes-'));
  if (list !== undefined) {
    fs.mkdirSync(path.join(d, 'themes'));
    fs.writeFileSync(path.join(d, 'themes', 'themes.json'), typeof list === 'string' ? list : JSON.stringify(list));
  }
  return d;
}
function store(init = {}) {
  const m = { ...init };
  return { m, get: (k) => m[k], set: (k, v) => { m[k] = v; } };
}
function make(list = [A, B], init, extra = {}) {
  const settings = store(init);
  const changes = [], scales = [];
  const t = createThemes({ webDir: webDir(list), settings, onChange: (c) => changes.push(c), onScale: (s) => scales.push(s), ...extra });
  return { t, settings, changes, scales };
}

test('derive: exact hex for a few tokens, rgb triplets only where asked', () => {
  const d = derive(A);
  assert.equal(d['--accent'], '#3fb6ec');
  assert.equal(d['--accent-rgb'], '63, 182, 236');
  assert.equal(d['--txt'], '#e0e0e0');
  assert.equal(d['--code-bg'], '#101010');
  assert.equal(d['--code-fg'], '#e0e0e0');
  assert.equal(d['--code-cursor'], '#ff0000');
  assert.equal(d['--selection'], '#ffffff');
  // white selection: its text in the background colour
  assert.equal(d['--selection-text'], '#101010');
  assert.equal(d['--caret-text'], '#101010');
  for (let i = 0; i < 16; i++) assert.equal(d[`--a${i}`], ANSI[i]);
  assert.equal(d['--red'], '#cc0000');
  assert.equal(d['--green'], '#00cc00');
  // only-rgb tokens have no hex
  for (const k of ['deep', 'surface', 'panel', 'glass-top']) {
    assert.equal(d[`--${k}`], undefined, k);
    assert.match(d[`--${k}-rgb`], /^\d+, \d+, \d+$/);
  }
  assert.equal(d['--txt-rgb'], undefined);
  assert.match(d['--ink-rgb'], /^\d+, \d+, \d+$/);
  // hues
  assert.equal(d['--hue9'], d['--txt']);
  assert.equal(d['--hue3'], d['--green']);
  for (const v of Object.values(d)) assert.match(v, /^#[0-9a-f]{6}$|^\d+, \d+, \d+$/);
});

test('derive: mixing is monotone toward black for the surfaces', () => {
  const d = derive({ ...A, bg: '#808080' });
  const lum = (h) => parseInt(h.slice(1, 3), 16);
  const rgb0 = (s) => Number(s.split(',')[0]);
  assert.ok(lum(d['--bg']) < 0x80);
  assert.ok(rgb0(d['--deep-rgb']) < rgb0(d['--surface-rgb']));
  assert.ok(rgb0(d['--surface-rgb']) < rgb0(d['--panel-rgb']));
});

test('derive: defaults when colours are missing or unreadable', () => {
  const d = derive({ id: 'x' });
  assert.equal(d['--code-bg'], '#000000');
  assert.equal(d['--txt'], '#ffffff');
  assert.equal(d['--accent'], '#ffffff');
  assert.equal(d['--code-cursor'], '#ffffff');
  assert.equal(d['--selection'], '#ffffff');
  for (let i = 0; i < 16; i++) assert.equal(d[`--a${i}`], '#ffffff');
  // "r, g, b" works, junk doesn't
  const e = derive({ bg: '16, 32, 48', fg: 'nope', accent: '1,2', ansi: ['#zzzzzz'] });
  assert.equal(e['--code-bg'], '#102030');
  assert.equal(e['--txt'], '#ffffff');
  assert.equal(e['--a0'], '#ffffff');
});

test('derive: light selection text vs dark selection text', () => {
  assert.equal(derive({ ...A, selection: '#000080' })['--selection-text'], '#e0e0e0');
  // no selection: the accent (#3fb6ec, luminance < 0.4)
  assert.equal(derive({ ...A, selection: undefined })['--selection'], '#3fb6ec');
});

test('derive: grey brights are the normal colour lightened; distinct brights kept', () => {
  const grey = ANSI.slice(0, 8).concat(Array(8).fill('#808080'));
  const g = derive({ ...A, ansi: grey });
  // warn: bright red would be the lightened red, which differs from red, so it's that
  assert.notEqual(g['--warn'], '#cc0000');
  assert.notEqual(g['--warn'], '#808080');
  const d = derive(A);
  assert.equal(d['--warn'], '#ff5555');
  assert.equal(d['--lime'], '#55ff55');
  assert.equal(d['--sky'], '#5555ff');
  assert.equal(d['--magenta'], '#ff55ff');
  // same normal and bright: mixed with a neighbour instead
  const same = ANSI.slice(0, 8).concat(ANSI.slice(0, 8));
  const s = derive({ ...A, ansi: same });
  assert.notEqual(s['--lime'], '#00cc00');
});

test('derive: cyan turns green when the accent has its hue', () => {
  const d = derive({ ...A, accent: '#00cccc' });
  assert.equal(d['--cyan'], '#00cc00');
  assert.equal(derive(A)['--cyan'], '#00cccc');
  // a grey accent: hue distance 180, cyan stays
  assert.equal(derive({ ...A, accent: '#808080' })['--cyan'], '#00cccc');
});

test('derive: ink picks the more contrasting of dark and light', () => {
  const dark = derive({ ...A, accent: '#ffff00' });
  const light = derive({ ...A, accent: '#000040' });
  const L = (h) => parseInt(h.slice(1, 3), 16);
  assert.ok(L(dark['--ink']) < 0x40);
  assert.ok(L(light['--ink']) > 0xc0);
});

test('createThemes: real themes.json loads, default first', () => {
  const t = createThemes({ webDir: path.join(ROOT, 'app', 'Resources', 'web'), settings: store(), onChange() {} });
  assert.ok(t.list.length > 1);
  assert.equal(t.chosenId(), t.list[0].id);
});

test('createThemes: missing, unreadable or empty file falls back to the built-in theme', () => {
  const errs = [];
  const orig = console.error;
  console.error = (...a) => errs.push(a.join(' '));
  try {
    for (const l of [undefined, '{bad', []]) {
      const t = createThemes({ webDir: webDir(l), settings: store(), onChange() {} });
      assert.equal(t.list.length, 1);
      assert.equal(t.list[0].id, 'atalay');
      assert.equal(t.current().id, 'atalay');
    }
  } finally {
    console.error = orig;
  }
  assert.equal(errs.length, 2);
});

test('chosen theme, current, color, tokens cache and ui overrides', () => {
  const { t } = make([A, B], { theme: 'b' });
  assert.equal(t.chosenId(), 'b');
  assert.equal(t.current().id, 'b');
  assert.equal(t.color('--txt'), '#123456');
  assert.equal(t.color('--nope'), '#ff00ff');
  assert.equal(t.tokens(A), t.tokens(A));
  const { t: t2 } = make([A, B], { theme: 'zzz' });
  assert.equal(t2.chosenId(), 'a');
});

test('css: root and map tokens, glow and font', () => {
  const { t, settings } = make([A, B]);
  const c = t.css();
  assert.ok(c.startsWith(':root:root{'));
  assert.ok(c.includes('#mapwrap#mapwrap{'));
  assert.ok(c.includes('--accent:#3fb6ec;'));
  assert.ok(!c.includes('text-shadow'));
  assert.ok(!c.includes('--font:'));
  // sorted declarations
  const decls = c.slice(11, c.indexOf('}')).split(';').filter(Boolean).map((x) => x.split(':')[0]);
  assert.deepEqual(decls, [...decls].sort());
  settings.set('uiFont', 'system');
  t.preview('b');
  const g = t.css();
  assert.ok(g.includes('text-shadow'));
  assert.ok(g.includes('filter:url(#atl-neon)'));
  assert.ok(g.includes('--font:"Segoe UI"'));
  // the map keeps the default theme
  assert.ok(g.includes('#mapwrap#mapwrap{') && g.split('#mapwrap#mapwrap{')[1].includes('--accent:#3fb6ec;'));
});

test('preview / choose / revert', () => {
  const { t, settings, changes } = make();
  t.preview('a');
  assert.equal(changes.length, 0, 'same theme: nothing');
  t.preview('missing');
  assert.equal(changes.length, 0);
  t.preview('b');
  assert.equal(changes.length, 1);
  assert.equal(t.current().id, 'b');
  assert.equal(settings.m.theme, undefined);
  t.revert();
  assert.equal(t.current().id, 'a');
  assert.equal(changes.length, 2);
  t.choose('zz');
  assert.equal(settings.m.theme, undefined);
  t.choose('b');
  assert.equal(settings.m.theme, 'b');
  assert.equal(t.current().id, 'b');
  assert.equal(changes.length, 3);
  t.revert();
  assert.equal(changes.length, 3);
});

test('uiScale: only listed values', () => {
  assert.equal(make([A], { uiScale: 1.25 }).t.uiScale(), 1.25);
  assert.equal(make([A], { uiScale: 1.3 }).t.uiScale(), 1);
  assert.equal(make([A]).t.uiScale(), 1);
});

test('handle: list, preview, choose, revert, unknown', () => {
  const { t, settings } = make();
  const l = t.handle({ type: 'list' });
  assert.deepEqual(l.themes.map((x) => x.id), ['a', 'b']);
  assert.equal(l.chosen, 'a');
  assert.equal(l.current, 'a');
  assert.equal(l.themes[0].tokens['--accent'], '#3fb6ec');
  assert.equal(t.handle({ type: 'preview', id: 'b' }), true);
  assert.equal(t.current().id, 'b');
  assert.equal(t.handle({ type: 'revert' }), true);
  assert.equal(t.current().id, 'a');
  assert.equal(t.handle({ type: 'choose', id: 'b' }), true);
  assert.equal(settings.m.theme, 'b');
  assert.deepEqual(t.handle({ type: 'x' }), { error: 'unknown request' });
  assert.deepEqual(t.handle(null), { error: 'unknown request' });
});

test('handle ui / setUI: font, scale, onScale, aiColors', () => {
  const { t, settings, changes, scales } = make();
  const u = t.handle({ type: 'ui' });
  assert.deepEqual(u, {
    font: 'mono', scale: 1, fonts: [{ id: 'mono', name: 'mono' }, { id: 'system', name: 'system' }, { id: 'rounded', name: 'rounded' }],
    scales: [1, 1.1, 1.25, 1.4], aiColors: false,
  });
  const r = t.handle({ type: 'setUI', font: 'rounded', scale: 1.4 });
  assert.equal(r.font, 'rounded');
  assert.equal(r.scale, 1.4);
  assert.equal(changes.length, 1);
  assert.deepEqual(scales, [1.4]);
  t.handle({ type: 'setUI', font: 'comic', scale: 3 });
  assert.equal(settings.m.uiFont, 'rounded');
  assert.equal(settings.m.uiScale, 1.4);
  assert.equal(changes.length, 2);
  // without onScale
  const s2 = store();
  const t2 = createThemes({ webDir: webDir([A]), settings: s2, onChange() {} });
  assert.equal(t2.handle({ type: 'setUI', scale: 1.1 }).scale, 1.1);
  // with ai
  const calls = [];
  let on = true;
  const ai = { isOn: () => on, set: (v) => { calls.push(v); on = v; } };
  const { t: t3, changes: c3 } = make([A], {}, { ai });
  assert.equal(t3.handle({ type: 'ui' }).aiColors, true);
  const r3 = t3.handle({ type: 'setUI', aiColors: false, font: 'system' });
  assert.deepEqual(calls, [false]);
  assert.equal(r3.aiColors, false);
  assert.equal(r3.font, 'mono', 'the aiColors switch returns before the font');
  assert.equal(c3.length, 0);
  // a non-boolean aiColors falls through to the font
  assert.equal(t3.handle({ type: 'setUI', aiColors: 'yes', font: 'system' }).font, 'system');
  assert.deepEqual(calls, [false]);
});
