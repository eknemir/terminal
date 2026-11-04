'use strict';
// The dashboard's smaller panels: studio.js (the right column's tabs), skills.js (the Skills tab), danger.js (the
// runaway card), sfx.js (the sounds) and fire.js (the flames), in index.html.
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeDom } = require('./dom');

// An object that answers anything: properties are nested nodes, calls return a node (connect returns its argument).
function anything(log, name = 'node') {
  const fn = function () {};
  return new Proxy(fn, {
    get(t, k) {
      if (k in t && k !== 'call' && k !== 'apply' && k !== 'bind') return t[k];
      if (k === 'connect') return (n) => n;
      if (k === 'getChannelData') return () => new Float32Array(64);
      if (k === 'sampleRate') return 8000;
      if (k === 'currentTime') return 0;
      if (k === Symbol.toPrimitive) return () => 0;
      return (t[k] = anything(log, `${name}.${String(k)}`));
    },
    set(t, k, v) { t[k] = v; return true; },
    apply() { log.push(name); return anything(log, `${name}()`); },
  });
}

test('studio.js: tabs switch panes, tell others, and skip the tab already on', (t) => {
  const d = makeDom();
  t.after(d.close);
  const events = [];
  d.window.addEventListener('studio-tab', (e) => events.push(e.detail));
  d.run('studio.js');
  d.click('.st-tab[data-tab="presets"]');
  assert.ok(d.$('.st-tab[data-tab="presets"]').classList.contains('on'));
  assert.ok(!d.$('.st-tab[data-tab="video"]').classList.contains('on'));
  assert.ok(d.$('#presets-mount').classList.contains('on'));
  assert.ok(!d.$('#video-mount').classList.contains('on'));
  d.click('.st-tab[data-tab="presets"]');
  d.window.studioShowTab('skills');
  d.window.studioShowTab('nope');
  assert.deepEqual(events, ['presets', 'skills']);
  assert.ok(d.$('#skills-mount').classList.contains('on'));
  // a page without the panel: nothing
  const d2 = makeDom({ page: '<html><body></body></html>' });
  t.after(d2.close);
  d2.run('studio.js');
  assert.equal(d2.window.studioShowTab, undefined);
});

const SKILLS = [
  { name: 'alpha', title: 'Alpha', description: 'Does İstanbul things', enabled: true, mtime: Date.now() - 2 * 86400_000, files: 3 },
  { name: 'beta', description: '', enabled: false, mtime: Date.now() - 400 * 86400_000 },
  { name: 'gamma', title: 'Gamma', enabled: true, mtime: Date.now() - 60 * 86400_000 },
  { name: 'delta', enabled: true, mtime: Date.now() - 2 * 3600_000 },
  { name: 'eps', enabled: true, mtime: Date.now() - 1000 },
];
const BUNDLED = [
  { name: 'pack1', title: 'Pack One', description: 'p1', installed: false },
  { name: 'pack2', installed: true, outdated: true },
  { name: 'pack3', installed: true },
];
function skills(opts = {}) {
  const answers = { skillsList: SKILLS, skillsBundled: BUNDLED, skillsToggle: { ok: true }, skillsRemove: { ok: true }, skillsInstallBundled: { ok: true, installed: ['pack1'] }, skillsInstall: { ok: true, installed: ['x'], skipped: [{ name: 'y', reason: 'exists' }] }, skillsPickFile: '/tmp/x.skill', ...(opts.answers || {}) };
  const d = makeDom({ reply: { radar: (m) => (typeof answers[m.type] === 'function' ? answers[m.type](m) : answers[m.type]) }, globals: opts.globals });
  d.run('skills.js');
  return d;
}

test('skills.js: lists installed and bundled skills, with dates, files and switches', async (t) => {
  const d = skills();
  t.after(d.close);
  await d.flush();
  const cards = d.$$('#skills-mount .sk-list:not(.sk-bundled) .sk-card');
  assert.equal(cards.length, 5);
  assert.equal(cards[0].querySelector('.sk-name').textContent, 'Alpha');
  assert.equal(cards[0].querySelector('.sk-meta').textContent, 'Güncellendi 2 gün önce · 3 dosya');
  assert.equal(cards[0].querySelector('.sk-desc').title, 'Does İstanbul things');
  assert.ok(cards[1].classList.contains('off'));
  assert.equal(cards[1].querySelector('.sk-meta').textContent, 'Güncellendi 1 yıl önce · kapalı');
  assert.equal(cards[1].querySelector('.sk-switch').title, 'Kapalı');
  assert.equal(cards[2].querySelector('.sk-meta').textContent, 'Güncellendi 2 ay önce');
  assert.equal(cards[3].querySelector('.sk-meta').textContent, 'Güncellendi 2 saat önce');
  assert.equal(cards[4].querySelector('.sk-meta').textContent, 'Güncellendi az önce');
  const bund = d.$$('#skills-mount .sk-bundled .sk-card');
  assert.deepEqual(bund.map((c) => c.querySelector('.sk-btn').textContent), ['Kur', 'Güncelle', 'Kurulu']);
  assert.ok(bund[2].querySelector('.sk-btn').disabled);
  assert.ok(bund[2].querySelector('.sk-btn').classList.contains('done'));
  // search, Turkish-aware
  d.type('#skills-mount .sk-search', 'İSTANBUL');
  assert.equal(d.$$('#skills-mount .sk-list:not(.sk-bundled) .sk-card').length, 1);
  d.type('#skills-mount .sk-search', 'zzz');
  assert.equal(d.$('#skills-mount .sk-empty').textContent, 'Eşleşen skill yok');
  assert.equal(d.$$('#skills-mount .sk-bundled .sk-card').length, 0);
  d.type('#skills-mount .sk-search', '');
});

test('skills.js: toggle, menu (reveal, remove), bundled install, file pick and drop', async (t) => {
  let toggle = { ok: true };
  let remove = { ok: true };
  const d = skills({ answers: { skillsToggle: () => toggle, skillsRemove: () => remove }, globals: { getPathForFile: (f) => f.p } });
  t.after(d.close);
  await d.flush();
  const status = () => d.$('#skills-mount .sk-status');
  const card = () => d.$('#skills-mount .sk-card');
  // toggle off
  const cb = card().querySelector('input[type=checkbox]');
  cb.checked = false;
  d.fire(cb, 'change');
  await d.flush();
  assert.deepEqual(d.sent('skillsToggle').map((m) => [m.name, m.enabled]), [['alpha', false]]);
  toggle = { ok: false, error: 'izin yok' };
  const cb2 = card().querySelector('input[type=checkbox]');
  d.fire(cb2, 'change');
  await d.flush();
  assert.equal(status().textContent, 'izin yok');
  assert.ok(status().classList.contains('bad'));
  toggle = null;
  d.fire(card().querySelector('input[type=checkbox]'), 'change');
  await d.flush();
  assert.equal(status().textContent, 'Değiştirilemedi');
  d.tick(5000);
  assert.ok(!status().classList.contains('on'));
  // the ⋯ menu
  d.click(card().querySelector('.sk-more'));
  assert.ok(d.$('#skills-mount .sk-menu'));
  d.click(card().querySelector('.sk-more')); // reopens, still one
  assert.equal(d.$$('#skills-mount .sk-menu').length, 1);
  d.click(d.document.body); // a click elsewhere closes it
  assert.equal(d.$('#skills-mount .sk-menu'), null);
  d.click(card().querySelector('.sk-more'));
  d.click(d.$('#skills-mount .sk-menu button'));
  assert.equal(d.sent('skillsReveal').at(-1).name, 'alpha');
  d.click(card().querySelector('.sk-more'));
  d.click(d.$('#skills-mount .sk-menu .danger'));
  await d.flush();
  assert.equal(status().textContent, 'Kaldırıldı: alpha');
  remove = { canceled: true };
  d.click(card().querySelector('.sk-more'));
  d.click(d.$('#skills-mount .sk-menu .danger'));
  await d.flush();
  assert.equal(status().textContent, 'Kaldırıldı: alpha');
  remove = { error: 'kilitli' };
  d.click(card().querySelector('.sk-more'));
  d.click(d.$('#skills-mount .sk-menu .danger'));
  await d.flush();
  assert.equal(status().textContent, 'kilitli');
  // bundled install
  d.click(d.$('#skills-mount .sk-bundled .sk-btn'));
  assert.equal(d.sent('skillsInstallBundled').at(-1).name, 'pack1');
  await d.flush();
  assert.equal(status().textContent, 'Kuruldu: pack1');
  // pick a file (the drop area's own text picks too)
  d.click(d.$('#skills-mount .sk-drop span'));
  await d.flush();
  assert.equal(d.sent('skillsInstall').at(-1).path, '/tmp/x.skill');
  assert.equal(status().textContent, 'Kuruldu: x · Atlandı: y (exists)');
  // drag and drop
  const drop = d.$('#skills-mount .sk-drop');
  d.fire(drop, 'dragover');
  assert.ok(drop.classList.contains('hot'));
  d.fire(drop, 'dragleave');
  assert.ok(!drop.classList.contains('hot'));
  const ev = new d.window.Event('drop', { bubbles: true, cancelable: true });
  ev.dataTransfer = { files: [{ p: '/a.skill' }, { path: '/b.zip' }, {}] };
  drop.dispatchEvent(ev);
  await d.flush();
  assert.deepEqual(d.sent('skillsInstall').slice(-2).map((m) => m.path), ['/a.skill', '/b.zip']);
  assert.ok(d.posted.length);
  const ev2 = new d.window.Event('drop', { bubbles: true, cancelable: true });
  drop.dispatchEvent(ev2);
});

test('skills.js: refreshes when its tab shows or the window gets focus; empty and failing lists', async (t) => {
  const d = skills({ answers: { skillsList: () => [], skillsBundled: () => null, skillsInstall: () => null, skillsPickFile: () => null } });
  t.after(d.close);
  await d.flush();
  assert.equal(d.$('#skills-mount .sk-empty').textContent, 'Henüz skill kurulu değil');
  assert.equal(d.$('#skills-mount .sk-bundled').style.display, 'none');
  const n = d.sent('skillsList').length;
  d.window.dispatchEvent(new d.window.CustomEvent('studio-tab', { detail: 'skills' }));
  d.window.dispatchEvent(new d.window.CustomEvent('studio-tab', { detail: 'video' }));
  d.window.dispatchEvent(new d.window.Event('focus'));
  d.$('#skills-mount').classList.add('on');
  d.window.dispatchEvent(new d.window.Event('focus'));
  await d.flush();
  assert.equal(d.sent('skillsList').length, n + 2);
  // picking nothing installs nothing; an install answering nothing reports failure
  d.click(d.$('#skills-mount .sk-link'));
  await d.flush();
  assert.equal(d.sent('skillsInstall').length, 0);
  const ev = new d.window.Event('drop', { bubbles: true, cancelable: true });
  ev.dataTransfer = { files: [{ path: '/c.skill' }] };
  d.$('#skills-mount .sk-drop').dispatchEvent(ev);
  await d.flush();
  assert.equal(d.$('#skills-mount .sk-status').textContent, 'İşlem tamamlanamadı');
  // a rejected bridge call reads as nothing
  const d2 = skills({ answers: { skillsList: () => { throw new Error('x'); } } });
  t.after(d2.close);
  await d2.flush();
  assert.equal(d2.$('#skills-mount .sk-empty').textContent, 'Henüz skill kurulu değil');
  // no bridge at all
  const d3 = makeDom({ noWebkit: true });
  t.after(d3.close);
  d3.run('skills.js');
  await d3.flush();
  assert.equal(d3.$('#skills-mount .sk-empty').textContent, 'Henüz skill kurulu değil');
  const d4 = makeDom({ handlers: [] });
  t.after(d4.close);
  d4.run('skills.js');
  await d4.flush();
  // no mount: nothing
  const d5 = makeDom({ page: '<html><body></body></html>' });
  t.after(d5.close);
  d5.run('skills.js');
});

// danger.js uses app.js's esc.
function danger(orbit) {
  const sfx = [];
  const d = makeDom({ globals: { Sfx: { play: (k) => sfx.push(k) }, Orbit: orbit } });
  d.run('app.js', 'danger.js');
  d.sfx = sfx;
  return d;
}

test('danger.js: the card lists runaways; END IT takes two clicks; Escape closes', (t) => {
  const calls = [];
  const d = danger({ focusRunaway: (p) => calls.push(['focus', p]), blowUp: (p) => calls.push(['blow', p]) });
  t.after(d.close);
  const D = d.window.Danger;
  D.open(); // nothing to show
  assert.equal(d.$('#danger-panel'), null);
  const now = Date.now();
  D.update([{ pid: 11, started: 1, name: 'node <x>', cpu: 99.4, cmd: 'node a.js', since: now - 45_000 }, { pid: 12, started: 2, name: 'py', cpu: 50, cmd: 'python', since: now - 2 * 3600_000 }]);
  D.open();
  const p = d.$('#danger-panel');
  assert.ok(p);
  assert.ok(p.querySelector('.dp.in'));
  assert.equal(p.querySelector('.dp-sub').textContent, "2 işlem terminalsiz çalışır kalmış, CPU'yu yakıyor.");
  const rows = p.querySelectorAll('.dp-row');
  assert.equal(rows[0].querySelector('b').textContent, 'node <x>');
  assert.equal(rows[0].querySelector('.dp-cpu').textContent, '99%');
  assert.match(rows[0].querySelector('.dp-l2').textContent, /PID 11 · 45 sn süredir · node a\.js/);
  assert.match(rows[1].querySelector('.dp-l2').textContent, /2 sa süredir/);
  assert.deepEqual(calls, [['focus', 11]]);
  // first click: are you sure; it forgets after 3 s
  d.click(rows[0].querySelector('.dp-end'));
  assert.equal(d.$('#danger-panel .dp-row .dp-end').textContent, 'EMİN MİSİN?');
  d.tick(3000);
  assert.equal(d.$('#danger-panel .dp-row .dp-end').textContent, 'SONLANDIR');
  d.click(d.$('#danger-panel .dp-row .dp-end'));
  d.click(d.$('#danger-panel .dp-row .dp-end'));
  assert.deepEqual(d.sent('endRunaway').map((m) => [m.pid, m.started]), [[11, 1]]);
  assert.deepEqual(d.sfx, ['hit']);
  d.tick(120);
  assert.deepEqual(d.sfx, ['hit', 'boom']);
  assert.ok(d.$('#danger-panel').classList.contains('hit'));
  assert.ok(d.$('.dp-burst'));
  assert.equal(d.$$('.dp-burst i').length, 28);
  d.tick(900);
  assert.equal(d.$('.dp-burst'), null);
  assert.equal(d.$('#danger-panel .dp-row .dp-end').textContent, 'KAPATILIYOR…');
  assert.ok(d.$('#danger-panel .dp-row .dp-end').disabled);
  assert.deepEqual(calls.at(-1), ['blow', 11]);
  // a click outside a button does nothing
  d.click(d.$('#danger-panel .dp-sub'));
  // the ended one leaves the list
  D.update([{ pid: 12, started: 2, name: 'py', cpu: 50, cmd: 'python', since: now }]);
  assert.equal(d.$('#danger-panel .dp-sub').textContent, "Bir işlem terminalsiz çalışır kalmış, CPU'yu yakıyor.");
  // Escape closes
  d.key('Escape');
  assert.equal(d.$('#danger-panel'), null);
  d.key('Escape');
  // the close button; all gone closes
  D.open(12);
  assert.deepEqual(calls.at(-1), ['focus', 12]);
  d.click(d.$('#danger-panel .dp-x'));
  assert.equal(d.$('#danger-panel'), null);
  D.open();
  D.update('nope');
  assert.equal(d.$('#danger-panel'), null);
});

test('danger.js: a closed terminal left running (openLeft) ends after two clicks', (t) => {
  const calls = [];
  const d = danger({ terminalGone: (id) => calls.push(id) });
  t.after(d.close);
  const D = d.window.Danger;
  D.openLeft(null);
  const left = { id: 't1', pid: 40, started: 5, cmd: 'npm run dev', cwd: '/w', started2: 0 };
  left.started = Date.now() - 90_000;
  D.openLeft(left);
  const p = d.$('#danger-panel');
  assert.ok(p.querySelector('.dp.left'));
  assert.equal(p.querySelector('.dp-l1 b').textContent, 'npm run dev');
  assert.match(p.querySelector('.dp-l2').textContent, /PID 40 · 1 dk süredir · \/w/);
  d.click(p.querySelector('.dp-sub'));
  d.click(p.querySelector('.dp-end'));
  assert.equal(p.querySelector('.dp-end').textContent, 'EMİN MİSİN?');
  d.tick(3000);
  assert.equal(p.querySelector('.dp-end').textContent, 'SONLANDIR');
  d.click(p.querySelector('.dp-end'));
  d.click(p.querySelector('.dp-end'));
  assert.deepEqual(d.sent('endLeftover').map((m) => m.pid), [40]);
  assert.deepEqual(calls, ['t1']);
  d.click(p.querySelector('.dp-end')); // ending: nothing
  d.tick(900);
  assert.equal(d.$('#danger-panel'), null);
  // another terminal while one shows: its own question
  D.openLeft({ id: 'a', pid: 1, started: Date.now(), cmd: 'a', cwd: '/' });
  d.click(d.$('#danger-panel .dp-end'));
  D.openLeft({ id: 'b', pid: 2, started: Date.now(), cmd: 'b', cwd: '/' });
  assert.equal(d.$('#danger-panel .dp-end').textContent, 'SONLANDIR');
  D.openLeft({ id: 'b', pid: 2, started: Date.now(), cmd: 'b', cwd: '/' });
  // dur in hours
  d.window.Danger.update([{ pid: 9, started: 9, name: 'n', cpu: 1, cmd: 'c', since: Date.now() - 36 * 3600_000 }]);
  d.click(d.$('#danger-panel .dp-x'));
  D.open();
  assert.match(d.$('#danger-panel .dp-l2').textContent, /36 sa süredir/);
  d.window.Danger.update([{ pid: 9, started: 9, name: 'n', cpu: 1, cmd: 'c', since: Date.now() - 90 * 60_000 }]);
  assert.match(d.$('#danger-panel .dp-l2').textContent, /1\.5 sa süredir/);
});

test('sfx.js: every sound plays on an audio graph; do not disturb silences others but not yours; a blocked context is logged once', (t) => {
  const log = [];
  let state = 'running';
  class Ctx {
    constructor() { this.destination = anything(log, 'dest'); log.push('ctx'); }
    get state() { return state; }
    resume() { log.push('resume'); }
    suspend() { log.push('suspend'); }
  }
  for (const k of ['createDelay', 'createGain', 'createOscillator', 'createBuffer', 'createBufferSource', 'createBiquadFilter', 'createDynamicsCompressor', 'createStereoPanner', 'createWaveShaper', 'createConvolver']) {
    Ctx.prototype[k] = function () { log.push(k); return anything(log, k); };
  }
  Object.defineProperty(Ctx.prototype, 'currentTime', { get: () => 0 });
  Object.defineProperty(Ctx.prototype, 'sampleRate', { get: () => 8000 });
  const d = makeDom({ page: '<html><body></body></html>', handlers: ['messages'] });
  t.after(d.close);
  d.window.AudioContext = Ctx;
  d.run('sfx.js');
  const S = d.window.Sfx;
  const names = ['message', 'request', 'friend', 'accept', 'decline', 'send', 'online', 'xp', 'levelup', 'rankup', 'glitch', 'fire', 'alarm', 'hit', 'boom'];
  for (const n of names) {
    const before = log.length;
    S.play(n);
    assert.ok(log.length > before, `${n} made sound`);
  }
  assert.equal(log.filter((x) => x === 'ctx').length, 1);
  S.play('nope');
  // do not disturb: only your own sounds
  d.window.Social = { dnd: () => true };
  let before = log.length;
  S.play('message');
  assert.equal(log.length, before);
  S.play('send');
  assert.ok(log.length > before);
  // rests after the sound; resumes when needed
  d.tick(5000);
  assert.ok(log.includes('suspend'));
  state = 'suspended';
  S.play('send');
  assert.ok(log.includes('resume'));
  d.tick(600);
  d.tick(600);
  assert.equal(d.sent('log', 'messages').length, 1);
  assert.match(d.sent('log', 'messages')[0].msg, /audio context is suspended/);
  // a failing context is swallowed
  d.window.Social = null;
  const d2 = makeDom({ page: '<html><body></body></html>', noWebkit: true });
  t.after(d2.close);
  d2.window.AudioContext = class { constructor() { throw new Error('no audio'); } };
  d2.run('sfx.js');
  d2.window.Sfx.play('message');
  before = log.length;
});

test('fire.js: burns a canvas with WebGL until stopped, its life ends, or it leaves the page', (t) => {
  const d = makeDom({ page: '<html><body></body></html>' });
  t.after(d.close);
  d.run('fire.js');
  const F = d.window.Fire;
  const c = d.document.createElement('canvas');
  d.document.body.appendChild(c);
  Object.defineProperty(c, 'clientWidth', { value: 100 });
  Object.defineProperty(c, 'clientHeight', { value: 50 });
  const stop = F.burn(c, { reach: [10, 2, 0], scale: 7, res: 2 });
  d.drawn.length = 0;
  d.tick(100);
  assert.ok(d.drawn.includes('drawArrays'));
  assert.equal(c.width, 200);
  assert.equal(c.height, 100);
  stop();
  stop();
  d.drawn.length = 0;
  d.tick(100);
  assert.equal(d.drawn.filter((x) => x === 'drawArrays').length, 0);
  // with a life and a reach function
  const c2 = d.document.createElement('canvas');
  d.document.body.appendChild(c2);
  let asked = 0;
  F.burn(c2, { reach: () => (asked++, [1, 1, 1]), scale: 3, life: 500 });
  d.tick(1000);
  assert.ok(asked > 0);
  const n = asked;
  d.tick(500);
  assert.equal(asked, n);
  // off the page: it stops
  const c3 = d.document.createElement('canvas');
  d.document.body.appendChild(c3);
  F.burn(c3, { reach: [1, 1, 1], scale: 3 });
  c3.remove();
  d.drawn.length = 0;
  d.tick(100);
  assert.equal(d.drawn.filter((x) => x === 'drawArrays').length, 0);
  // no WebGL: a no-op stop
  d.window.HTMLCanvasElement.prototype.getContext = () => null;
  assert.equal(typeof F.burn(d.document.createElement('canvas'), { reach: [0, 0, 0], scale: 1 }), 'function');
  // a shader that doesn't link
  d.window.HTMLCanvasElement.prototype.getContext = () => new Proxy({}, { get: (o, k) => (k === 'getProgramParameter' ? () => false : () => ({})) });
  assert.equal(typeof F.burn(d.document.createElement('canvas'), { reach: [0, 0, 0], scale: 1 }), 'function');
});
