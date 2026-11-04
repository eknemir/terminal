'use strict';
// composer.js: the chat composer under the centre column + the minimal / detailed layout switch.
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeDom } = require('./dom');

const TABS = [{ id: 'a', title: 'City Life', status: 'busy', sid: 's-a' }, { id: 'b', title: 'Kaya <Oto>', status: 'waiting', sid: 's-b' }];

function boot(opts = {}) {
  const calls = [];
  const DT = opts.noDT ? undefined : {
    focusChat: (sid) => calls.push(['focus', sid]),
    sendPrompt: (text, o) => { calls.push(['send', text, JSON.parse(JSON.stringify(o))]); return opts.sendReply === undefined ? { ok: true } : (typeof opts.sendReply === 'function' ? opts.sendReply() : opts.sendReply); },
    newChatWithPrompt: (text) => { calls.push(['new', text]); return { ok: true }; },
  };
  const chatTabs = opts.tabs === false ? undefined : { state: { embed: true, active: opts.active === undefined ? 'a' : opts.active, tabs: opts.tabs || TABS } };
  const globals = { ...(DT ? { DT } : {}), ...(chatTabs ? { __chatTabs: chatTabs } : {}), ...(opts.globals || {}) };
  const d = makeDom({ storage: opts.storage, globals, page: opts.page, noWebkit: opts.noWebkit });
  d.run('composer.js');
  const C = d.window.DTComposer;
  const input = d.$('#composer .cmp-input');
  const write = (v) => d.type(input, v);
  const enter = (init = {}) => d.fire(input, 'keydown', { key: 'Enter', ...init });
  return { ...d, C, input, write, enter, calls, chatTabs, status: () => d.$('#composer .cmp-status') };
}

test('minimal by default; detailed from storage; setDetailed flips and stores', () => {
  const d = boot();
  const html = d.document.documentElement;
  assert.ok(html.classList.contains('dt-minimal'));
  assert.ok(!html.classList.contains('dt-detailed'));
  assert.equal(d.C.isDetailed(), false);
  d.C.setDetailed(true);
  assert.ok(html.classList.contains('dt-detailed'));
  assert.equal(d.window.localStorage.getItem('ui.detailed'), '1');
  d.C.setDetailed(false);
  assert.ok(html.classList.contains('dt-minimal'));
  d.close();
  const e = boot({ storage: { 'ui.detailed': '1' } });
  assert.ok(e.document.documentElement.classList.contains('dt-detailed'));
  assert.equal(e.$('#bottom').firstElementChild.id, 'composer');
  e.close();
});

test('no #bottom: nothing', () => {
  const d = boot({ page: '<html><body></body></html>' });
  assert.equal(d.C, undefined);
  d.close();
});

test('Enter sends to the active tab, clears, says where; Shift+Enter does not send', async () => {
  const d = boot();
  assert.equal(d.$('.cmp-tgt span').textContent, 'City Life');
  assert.ok(d.$('.cmp-tgt').classList.contains('has-wait'), 'a waiting chat marks the chip');
  assert.ok(d.$('.cmp-send').disabled);
  d.write('merhaba');
  assert.ok(!d.$('.cmp-send').disabled);
  const sh = d.enter({ shiftKey: true });
  assert.ok(!sh.defaultPrevented);
  assert.equal(d.calls.length, 0);
  d.fire(d.input, 'keydown', { key: 'Enter', isComposing: true });
  assert.equal(d.calls.length, 0);
  const e = d.enter();
  assert.ok(e.defaultPrevented);
  await d.flush();
  assert.deepEqual(d.calls, [['focus', 's-a'], ['send', 'merhaba', { submit: true }]]);
  assert.equal(d.sent('tabSelect').length, 0, 'auto target: no tab switch');
  assert.equal(d.input.value, '');
  assert.equal(d.status().textContent, 'gönderildi → City Life');
  d.tick(4000);
  assert.equal(d.status().textContent, '');
  // empty: nothing
  d.write('   ');
  assert.equal(await d.C.submit(), null);
  d.close();
});

test('target menu: pick a tab (switches tab), new chat, back to auto; outside click closes', async () => {
  const d = boot();
  const menu = d.$('.cmp-menu');
  d.click('.cmp-tgt');
  assert.equal(menu.hidden, false);
  const opts = d.$$('.cmp-opt');
  assert.equal(opts.length, 4);
  assert.ok(opts[0].classList.contains('on'));
  assert.match(opts[2].innerHTML, /Kaya &lt;Oto&gt;<em>seni bekliyor<\/em>/);
  d.click('.cmp-tgt');
  assert.equal(menu.hidden, true);
  d.click('.cmp-tgt');
  d.click(menu); // not on an option
  assert.equal(menu.hidden, false);
  d.click(d.$$('.cmp-opt')[2]);
  assert.equal(menu.hidden, true);
  assert.equal(d.C.target, 'b');
  assert.equal(d.$('.cmp-tgt span').textContent, 'Kaya <Oto>');
  d.click('.cmp-tgt');
  assert.ok(d.$$('.cmp-opt')[2].classList.contains('on'));
  d.click(d.document.body);
  assert.equal(menu.hidden, true);
  d.write('revize');
  d.click('.cmp-send');
  await d.flush();
  assert.deepEqual(d.sent('tabSelect').map((m) => m.id), ['b']);
  assert.deepEqual(d.calls.slice(-1)[0], ['send', 'revize', { submit: true }]);
  assert.equal(d.status().textContent, 'gönderildi → Kaya <Oto>');
  // new chat
  d.click('.cmp-tgt');
  d.click(d.$('.cmp-opt.cmp-new'));
  assert.ok(d.$('.cmp-tgt .cmp-dot').classList.contains('new'));
  d.click('.cmp-tgt');
  assert.ok(d.$('.cmp-opt.cmp-new').classList.contains('on'));
  d.key('Escape', {}, d.input);
  assert.equal(menu.hidden, true);
  d.write('yeni');
  d.enter();
  await d.flush();
  assert.deepEqual(d.calls.slice(-1)[0], ['new', 'yeni']);
  assert.equal(d.status().textContent, 'gönderildi → Yeni sohbet');
  // a picked tab that closed: back to auto
  d.C.target = 'b';
  d.chatTabs.state.tabs = [TABS[0]];
  d.document.dispatchEvent(new d.window.Event('chattabs'));
  assert.equal(d.C.target, 'auto');
  assert.ok(!d.$('.cmp-tgt').classList.contains('has-wait'));
  d.C.target = '';
  assert.equal(d.C.target, 'auto');
  d.close();
});

test('no tabs at all: "Son sohbet"; no active tab: same', async () => {
  const d = boot({ tabs: false });
  assert.equal(d.$('.cmp-tgt span').textContent, 'Son sohbet');
  d.write('x');
  d.enter();
  await d.flush();
  assert.deepEqual(d.calls, [['send', 'x', { submit: true }]]);
  d.close();
  const e = boot({ active: null });
  assert.equal(e.$('.cmp-tgt span').textContent, 'Son sohbet');
  e.close();
  const f = boot({ tabs: [{ id: 'z', status: 'idle' }] });
  f.C.target = 'z';
  assert.equal(f.$('.cmp-tgt span').textContent, 'Sohbet');
  f.close();
});

test('send failures and no DT say so', async () => {
  const d = boot({ sendReply: { ok: false, reason: 'no-chat' } });
  d.write('a');
  d.enter();
  await d.flush();
  assert.equal(d.status().textContent, 'Gönderilemedi · no-chat');
  assert.ok(d.status().classList.contains('bad'));
  d.close();
  const e = boot({ sendReply: { ok: false } });
  e.write('a');
  e.enter();
  await e.flush();
  assert.equal(e.status().textContent, 'Gönderilemedi');
  e.close();
  const f = boot({ sendReply: () => { throw new Error('x'); } });
  f.write('a');
  assert.equal(await f.C.submit(), null);
  assert.equal(f.status().textContent, 'Gönderilemedi');
  f.close();
  const g = boot({ noDT: true });
  g.write('a');
  assert.equal(await g.C.submit(), null);
  assert.equal(g.status().textContent, 'Sohbet bağlantısı yok');
  assert.equal(g.input.value, 'a', 'kept for later');
  g.close();
});

test('history: ↑/↓ recall, de-duplicated, capped at 50, stored; junk storage tolerated', async () => {
  const d = boot({ storage: { 'composer.history': JSON.stringify(['eski', 5]) } });
  const up = () => d.fire(d.input, 'keydown', { key: 'ArrowUp' });
  const down = () => d.fire(d.input, 'keydown', { key: 'ArrowDown' });
  d.write('bir'); d.enter();
  d.write('iki'); d.enter();
  d.write('bir'); d.enter();
  await d.flush();
  assert.deepEqual(JSON.parse(d.window.localStorage.getItem('composer.history')), ['bir', 'iki', 'eski']);
  d.write('taslak');
  d.input.selectionStart = d.input.selectionEnd = 0;
  assert.ok(up().defaultPrevented);
  assert.equal(d.input.value, 'bir');
  up(); up();
  assert.equal(d.input.value, 'eski');
  assert.ok(!up().defaultPrevented, 'at the oldest');
  d.input.selectionStart = d.input.selectionEnd = d.input.value.length;
  down(); down(); down();
  assert.equal(d.input.value, 'taslak', 'back to the draft');
  assert.ok(!down().defaultPrevented, 'not in history: ↓ is the caret');
  // caret not on the first line: ↑ moves the caret
  d.write('a\nb');
  d.input.selectionStart = d.input.selectionEnd = 3;
  assert.ok(!up().defaultPrevented);
  // other keys are kept from the page's shortcuts
  let bubbled = 0;
  d.document.body.addEventListener('keydown', () => bubbled++);
  d.fire(d.input, 'keydown', { key: 'f' });
  assert.equal(bubbled, 0);
  for (let i = 0; i < 60; i++) { d.write('m' + i); d.enter(); }
  await d.flush();
  assert.equal(JSON.parse(d.window.localStorage.getItem('composer.history')).length, 50);
  d.close();
  const e = boot({ storage: { 'composer.history': '{bad' } });
  assert.ok(!e.fire(e.input, 'keydown', { key: 'ArrowUp' }).defaultPrevented, 'no history');
  e.close();
  const f = boot({ storage: { 'composer.history': '{"a":1}' } });
  assert.ok(!f.fire(f.input, 'keydown', { key: 'ArrowUp' }).defaultPrevented);
  f.close();
});

test('Video notları / Kare insert from DTVideo; Efekt opens the gallery tab', () => {
  const notes = [{ t: 2, text: 'logo büyüsün' }];
  const DTVideo = {
    current: () => ({ path: 'D:/v.mp4', notesKey: 'video.notes:D:/v.mp4' }),
    buildRevisionPrompt: (p, n) => `REV ${p} ${n.length}`,
    fmtStamp: (t) => '00:0' + t,
  };
  const d = boot({ globals: { DTVideo }, storage: { 'video.notes:D:/v.mp4': JSON.stringify(notes) } });
  d.click('.cmp-notes');
  assert.equal(d.input.value, 'REV D:/v.mp4 1');
  d.click('.cmp-frame');
  assert.equal(d.status().textContent, 'Henüz kare alınmadı (Önizleme · Kare al)');
  DTVideo.lastFrame = { path: 'D:/k.png', t: 3 };
  d.click('.cmp-frame');
  assert.equal(d.input.value, 'REV D:/v.mp4 1\nBu karede (00:03) şunu değiştir: \nD:/k.png');
  delete DTVideo.fmtStamp;
  d.input.value = 'x\n';
  d.input.selectionStart = d.input.selectionEnd = 2;
  d.click('.cmp-frame');
  assert.equal(d.input.value, 'x\nBu karede (3) şunu değiştir: \nD:/k.png');
  // no notes / junk notes / no selection
  d.window.localStorage.setItem('video.notes:D:/v.mp4', '[]');
  d.click('.cmp-notes');
  assert.equal(d.status().textContent, 'Bu videoda not yok');
  d.window.localStorage.setItem('video.notes:D:/v.mp4', '{bad');
  d.click('.cmp-notes');
  assert.equal(d.status().textContent, 'Bu videoda not yok');
  d.window.localStorage.setItem('video.notes:D:/v.mp4', '{"a":1}');
  d.click('.cmp-notes');
  assert.equal(d.status().textContent, 'Bu videoda not yok');
  DTVideo.current = () => null;
  d.click('.cmp-notes');
  assert.equal(d.status().textContent, 'Önizlemede seçili video yok');
  // Efekt
  const tab = d.document.querySelector('.st-tab[data-tab="presets"]');
  let clicked = 0;
  tab.addEventListener('click', () => clicked++);
  d.click('.cmp-fx');
  assert.equal(clicked, 1);
  d.close();
  const e = boot({ page: '<html><body><section id="bottom"></section></body></html>' });
  e.click('.cmp-fx'); // no gallery: nothing
  e.click('.cmp-notes');
  assert.equal(e.status().textContent, 'Önizlemede seçili video yok');
  e.click('.cmp-frame');
  assert.match(e.status().textContent, /kare alınmadı/);
  e.close();
});

test('insert without a selection appends at the end', () => {
  const d = boot({ globals: { DTVideo: { lastFrame: { path: 'p.png', t: 1 }, fmtStamp: () => 's' } } });
  d.input.value = 'ön';
  Object.defineProperty(d.input, 'selectionStart', { get: () => undefined, set() {}, configurable: true });
  Object.defineProperty(d.input, 'selectionEnd', { get: () => undefined, set() {}, configurable: true });
  d.C.insert('son');
  assert.equal(d.input.value, 'ön\nson');
  d.close();
});

test('model chip shows ChatModel, follows changes, opens settings; hidden without ChatModel', () => {
  let m = 'opus';
  const ChatModel = { get: () => m, LABELS: { opus: 'Opus', sonnet: 'Sonnet' } };
  const d = boot({ globals: { ChatModel } });
  const chip = d.$('.cmp-model');
  assert.equal(chip.hidden, false);
  assert.equal(chip.textContent, 'Opus');
  m = 'haiku';
  d.window.dispatchEvent(new d.window.Event('chatmodel'));
  assert.equal(chip.textContent, 'haiku');
  let opened = 0;
  d.$('#settings').addEventListener('click', () => opened++);
  d.click(chip);
  assert.equal(opened, 1);
  d.close();
  const e = boot({ page: '<html><body><section id="bottom"></section></body></html>' });
  assert.equal(e.$('.cmp-model').hidden, true);
  e.click('.cmp-model'); // no settings button: nothing
  e.close();
});

test('storage that throws is tolerated', () => {
  const d = makeDom({ globals: {} });
  Object.defineProperty(d.window, 'localStorage', { get() { throw new Error('denied'); }, configurable: true });
  d.run('composer.js');
  assert.ok(d.document.documentElement.classList.contains('dt-minimal'));
  d.window.DTComposer.setDetailed(true); // can't store: still minimal
  assert.ok(d.document.documentElement.classList.contains('dt-minimal'));
  d.close();
});

test('no bridge: a picked tab still sends (tabSelect post swallowed)', async () => {
  const d = boot({ noWebkit: true });
  d.C.target = 'b';
  d.write('q');
  d.enter();
  await d.flush();
  assert.deepEqual(d.calls.slice(-1)[0], ['send', 'q', { submit: true }]);
  d.close();
});
