'use strict';
// cloud.js: the top bar's name and level, first launch, the main menu (profile, settings, keys), updates, feedback,
// and the activity bar's views (friends, leaderboard, themes, notifications), driven through a fake app bridge.
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeDom } = require('./dom');

const XP = { level: 23, xp: 1500, from: 1000, to: 2000, today: 3 * 3600, rested: 0, week: 2, goal: 3, streak: 4, bonus: 20, total: 50 * 3600, days: [0, 60, 3600, null, 0, 0, 7200], show: true, board: true };
const cloudState = (over = {}) => ({ hackerName: 'neo', tag: 427, registered: true, reachable: true, version: '1.0.0', xp: XP, ...over });
const THEMES_ = {
  chosen: 'atalay',
  themes: [
    { id: 'atalay', name: 'Atalay', tokens: { '--bg': '#000', '--panel-rgb': '1,2,3', '--accent': '#f80', '--a1': '#f00', '--a2': '#0f0' } },
    { id: 'sea', name: 'Sea', tokens: { '--bg': '#012', '--panel-rgb': '4,5,6', '--accent': '#08f' } },
    { id: 'sun', name: 'Sun', tokens: { '--bg': '#320', '--panel-rgb': '7,8,9', '--accent': '#fd0' } },
  ],
};
const THEMES = new Proxy({}, { get: (_, k) => JSON.parse(JSON.stringify(THEMES_))[k] });
const social = () => ({
  me: { id: 'me', name: 'neo', tag: 427, status: 'online' },
  friends: [
    { id: 'f1', name: 'Ann', tag: 42, presence: 'online', unread: 2, last: { body: '<hi>', mine: false }, xp: { level: 30, last24: 3600, today: 6 * 3600 } },
    { id: 'f2', name: 'Bob', tag: 3, presence: 'idle', unread: 0, last: { body: 'ok', mine: true } },
  ],
  incoming: [{ id: 'r1', from: { id: 'u9', name: 'Cy', tag: 9, presence: 'online' }, at: new Date(Date.now() - 2 * 3600_000).toISOString() }],
  outgoing: [{ id: 'o1', to: { id: 'u8', name: 'Dee', tag: 8 }, at: new Date().toISOString() }],
});
const BOARD = {
  working: 2,
  rows: [
    { pos: 1, id: 'u1', name: 'Top', tag: 1, level: 50, week: 900, xp: 9000, days: [0, 0, 0, 0, 0, 0, 6 * 3600], daysEnd: '2026-03-04', working: true, theme: 'sea', last24: 7200 },
    { pos: 2, level: 10, week: 500, xp: 5000 },
    { pos: 3, id: 'f1', name: 'Ann', tag: 42, level: 30, week: 400, xp: 4000, friend: true },
    { pos: 4, id: 'u4', name: 'Req', tag: 4, level: 5, week: 300, xp: 300, requested: true },
    { pos: 5, id: 'u5', name: 'Asker', tag: 5, level: 5, week: 200, xp: 200, asked: true },
  ],
  me: { pos: 9, id: 'me', name: 'neo', tag: 427, level: 23, week: 10, xp: 1500, me: true, anon: true },
};

function boot(opts = {}) {
  const st = { cloud: opts.state === undefined ? cloudState() : opts.state, social: opts.social || social(), calls: [] };
  const fires = [], sfx = [];
  const routes = {
    'GET v1/social': () => st.social,
    'GET v1/notifications': () => opts.notes || { notifications: [{ id: 'n1', title: 'Hello <b>', body: 'news', at: new Date().toISOString(), read: false }, { id: 'n2', title: 'Old', at: '2020-01-01', read: true }], unread: 1 },
    'POST v1/notifications/read': () => ({ ok: true }),
    'GET v1/leaderboard?by=week': () => opts.board || BOARD,
    'GET v1/leaderboard?by=all': () => opts.board || BOARD,
    'PATCH v1/me/status': (b) => ({ status: b.status }),
    ...(opts.routes || {}),
  };
  const reply = {
    cloud: (m) => {
      st.calls.push(m.type === 'social' ? `${m.method} ${m.path}` : m.type);
      if (m.type === 'social') {
        const f = routes[`${m.method} ${m.path}`];
        return f ? f(m.body || {}) : { ok: true };
      }
      if (opts.cloud && opts.cloud[m.type]) return opts.cloud[m.type](m);
      if (m.type === 'state' || m.type === 'checkUpdate' || m.type === 'updateRightAway') return st.cloud;
      return {};
    },
    radar: () => ({}),
    ...(opts.bridges || {}),
  };
  const d = makeDom({
    reply,
    storage: opts.storage,
    globals: {
      Fire: { burn: (c, o) => (fires.push(o), () => {}) },
      Sfx: { play: (k) => sfx.push(k) },
      ...(opts.globals || {}),
    },
  });
  d.window.navigator.clipboard = opts.clipboard || { writeText: async (x) => (d.copied = x) };
  d.run('accent.js', 'appname.js', 'applogo.js', 'app.js', 'xp.js', 'social.js');
  if (opts.git) d.run('git-icons.js', 'git.js');
  d.run('cloud.js');
  Object.assign(d, { st, fires, sfx });
  return d;
}
const toastText = (d) => d.$('#toast').textContent;

test('top bar: your rank, level, name and tag; the app name without one', async (t) => {
  const d = boot();
  t.after(d.close);
  await d.flush();
  const stack = d.$('#top .brand .stack');
  assert.equal(stack.querySelector('.rk').textContent, 'CHUNIN · LV 23');
  assert.equal(stack.querySelector('b').textContent, 'neo#0427');
  assert.equal(stack.querySelector('.xpb i').style.width, '50%');
  assert.match(d.$('#top .brand').title, /^Level 23 · Chunin · 500 \/ 1\.000 XP · today 3 sa$/);
  // a long name gets tighter letters; no xp, a plain label
  d.window.Cloud.render(cloudState({ hackerName: 'averyverylongname', xp: null }));
  assert.ok(stack.querySelector('b.long'));
  assert.equal(stack.querySelector('small').textContent, 'KULLANICI');
  assert.equal(d.$('#top .brand').title, 'Profil ve ayarlar');
  // max level: XP total in the title
  d.window.Cloud.render(cloudState({ xp: { ...XP, level: 60, to: 0, xp: 99999 } }));
  assert.match(d.$('#top .brand').title, /99\.999 XP/);
  d.window.Cloud.render(cloudState({ hackerName: '' }));
  assert.equal(stack.textContent, 'DERIN TERMINAL');
  d.window.AppName.set('Foo');
  assert.equal(stack.textContent, 'FOO');
  // render(null) changes nothing
  d.window.Cloud.render(null);
  assert.equal(stack.textContent, 'FOO');
  // your status shows on the logo once friends load
  assert.equal(d.$('.brand .bme').className, 'pdot bme p-online');
  assert.equal(d.$('.brand .bme').hidden, false);
});

test('signed in and reachable: friends load; the sound of state errors is a toast once', async (t) => {
  const d = boot();
  t.after(d.close);
  await d.flush();
  assert.ok(d.st.calls.includes('GET v1/social'));
  assert.ok(d.st.calls.includes('GET v1/notifications'));
  d.window.Cloud.render(cloudState({ updateError: 'not_writable' }));
  assert.match(toastText(d), /can't replace the app/);
  d.$('#toast').textContent = '';
  d.window.Cloud.render(cloudState({ updateError: 'not_writable' }));
  assert.equal(toastText(d), '');
  d.window.Cloud.render(cloudState({ updateError: 'x' }));
  assert.equal(toastText(d), 'update failed · try again later');
  d.window.Cloud.render(cloudState({ nameError: 'name_full' }));
  assert.match(toastText(d), /bu adı çok fazla kullanıcı kullanıyor/);
  d.window.Cloud.render(cloudState({ nameError: 'other' }));
  assert.equal(toastText(d), 'yeni adın kaydedilemedi');
});

test('first launch: the name field cleans what is typed, registers, then welcomes', async (t) => {
  const d = boot({ state: cloudState({ registered: false, hackerName: '' }) });
  t.after(d.close);
  await d.flush();
  const root = d.$('#cloudui');
  assert.equal(root.className, 'on first');
  assert.match(root.textContent, /YENİ KULLANICI/);
  assert.equal(d.sent('modal', 'radar').at(-1).open, true);
  const input = root.querySelector('.hk-input'), ok = root.querySelector('.pk-ok');
  assert.ok(ok.disabled);
  d.type(input, '  ab!!  c  ');
  assert.equal(input.value, 'ab c ');
  assert.ok(root.querySelector('.hk-field').classList.contains('shake'));
  assert.equal(root.querySelector('.hk-count').textContent, '5/16');
  assert.ok(!ok.disabled);
  d.type(input, 'x'.repeat(20));
  assert.equal(input.value.length, 16);
  assert.ok(root.querySelector('.hk-count').classList.contains('full'));
  d.type(input, 'trinity');
  d.fire(input, 'keydown', { key: 'Enter' });
  await d.flush();
  assert.ok(d.st.calls.includes('register'));
  assert.deepEqual(d.posted.filter((m) => m.type === 'register').map((m) => m.name), ['trinity']);
  assert.equal(root.querySelector('.hk-status').textContent, 'kaydediliyor');
  // the app pushes the new state: the dialog closes and welcomes you
  d.window.Cloud.render(cloudState({ hackerName: 'trinity', tag: 5 }));
  assert.equal(toastText(d), 'hoş geldin, trinity#0005');
  d.tick(500);
  assert.equal(root.className, '');
  assert.equal(root.innerHTML, '');
});

test('first launch: errors keep the dialog; offline lets you retry; queued closes', async (t) => {
  let answer = { error: 'name_full' };
  const d = boot({ state: cloudState({ registered: false, hackerName: '' }), cloud: { register: () => answer } });
  t.after(d.close);
  await d.flush();
  const root = d.$('#cloudui');
  const ok = root.querySelector('.pk-ok');
  // a click while disabled only nudges
  ok.click();
  await d.flush();
  assert.ok(!d.st.calls.includes('register'));
  d.type(root.querySelector('.hk-input'), 'neo');
  ok.click();
  await d.flush();
  assert.equal(root.querySelector('.hk-status').className, 'hk-status bad');
  assert.match(root.querySelector('.hk-status').textContent, /bu adı çok fazla/);
  assert.ok(ok.disabled);
  answer = { error: 'offline' };
  d.type(root.querySelector('.hk-input'), 'neo2');
  ok.click();
  await d.flush();
  assert.equal(root.querySelector('.hk-status').textContent, 'sunucuya ulaşılamıyor · tekrar dene');
  assert.ok(!ok.disabled);
  answer = { error: 'weird' };
  ok.click();
  await d.flush();
  assert.equal(root.querySelector('.hk-status').textContent, 'olmadı (weird)');
  answer = { queued: true };
  d.type(root.querySelector('.hk-input'), 'neo3');
  ok.click();
  await d.flush();
  assert.match(toastText(d), /bu PC'de kaydedildi|bu Mac'de kaydedildi/);
  assert.equal(d.sent('modal', 'radar').at(-1).open, false);
});

test('update: the top bar button, what is new, installing', async (t) => {
  let upd = {};
  const d = boot({ cloud: { update: () => upd } });
  t.after(d.close);
  await d.flush();
  const b = d.$('#update');
  assert.ok(b.hidden);
  const u = { version: '2.0.0', notes: '- faster\n• safer\n\n* nicer' };
  d.window.Cloud.render(cloudState({ update: u }));
  assert.ok(!b.hidden);
  assert.equal(b.querySelector('span').textContent, 'update');
  assert.equal(b.title, "Version 2.0.0 is out · click to see what's new");
  d.window.Cloud.render(cloudState({ update: u, updateReady: true }));
  assert.match(b.title, /is ready/);
  d.window.Cloud.render(cloudState({ update: u, xpPaused: true }));
  assert.ok(b.classList.contains('paused'));
  assert.equal(b.querySelector('span').textContent, 'update · XP paused');
  // what's new
  d.click(b);
  const root = d.$('#cloudui');
  assert.deepEqual([...root.querySelectorAll('.up-notes li')].map((l) => l.textContent), ['faster', 'safer', 'nicer']);
  assert.match(root.querySelector('.for').textContent, /1\.0\.0 → 2\.0\.0/);
  // opening again does nothing; Escape closes when not busy
  d.window.Cloud.openUpdate();
  d.key('Escape');
  d.tick(500);
  assert.equal(root.innerHTML, '');
  // no notes: a default line
  d.window.Cloud.render(cloudState({ update: { version: '2.0.0' } }));
  d.window.Cloud.openUpdate();
  assert.equal(root.querySelector('.up-notes li').textContent, 'fixes and improvements');
  // install: an error is a toast
  upd = { error: 'offline' };
  root.querySelector('.up-go').click();
  await d.flush();
  assert.equal(toastText(d), 'sunucuya ulaşılamıyor · tekrar dene');
  // downloading: progress in the button, the modal and its bar, no way out
  d.window.Cloud.render(cloudState({ update: u, updating: 'downloading', updateProgress: 0.42 }));
  assert.ok(b.disabled);
  assert.equal(b.querySelector('span').textContent, 'updating 42%');
  assert.equal(b.title, 'downloading 42%');
  assert.equal(root.querySelector('.up-go').textContent, 'updating…');
  assert.ok(root.querySelector('.pk-cancel').disabled);
  assert.equal(root.querySelector('.up-status').textContent, 'downloading 42%');
  assert.equal(root.querySelector('.up-bar').hidden, false);
  assert.equal(root.querySelector('.up-bar i').style.width, '42%');
  d.key('Escape');
  root.dispatchEvent(new d.window.MouseEvent('mousedown', { bubbles: true }));
  d.tick(500);
  assert.ok(root.querySelector('.up-go'));
  d.window.Cloud.render(cloudState({ update: u, updating: 'installing' }));
  assert.equal(b.querySelector('span').textContent, 'updating…');
  // the update is gone: the modal closes
  d.window.Cloud.render(cloudState());
  d.tick(500);
  assert.equal(root.innerHTML, '');
  assert.ok(b.hidden);
  // no update: openUpdate does nothing
  d.window.Cloud.openUpdate();
  assert.equal(root.innerHTML, '');
});

test('main menu: tabs, profile page, your handle and status', async (t) => {
  const d = boot();
  t.after(d.close);
  await d.flush();
  d.click('#top .brand');
  await d.flush();
  const root = d.$('#cloudui');
  assert.ok(root.querySelector('.menu'));
  assert.ok(root.querySelector('[data-tab="profile"]').classList.contains('on'));
  assert.ok(!root.querySelector('.mn-profile').hidden);
  assert.ok(root.querySelector('.mn-settings').hidden);
  assert.ok(root.querySelector('.mn-save').hidden);
  // no keys handler: no keys tab
  assert.equal(root.querySelector('[data-tab="keys"]'), null);
  const prof = root.querySelector('.mn-profile');
  assert.equal(prof.querySelector('.pf-rank b').textContent, 'Chunin');
  assert.match(prof.querySelector('.pf-xpline').textContent, /500 \/ 1\.000 XP.*seviye 24 için 500 XP/);
  assert.match(prof.querySelector('.pf-rested').textContent, /yarın yine dinlenmiş/);
  assert.match(prof.querySelector('.pf-stats').textContent, /BUGÜN3 sa/);
  assert.match(prof.querySelector('.pf-stats').textContent, /SERİ4 hafta\+%20 XP/);
  assert.equal(prof.querySelectorAll('.pf-rk').length, 7);
  assert.equal(prof.querySelectorAll('.pf-rk.done').length, 2);
  assert.equal(prof.querySelector('.pf-rk.now b').textContent, 'Chunin');
  assert.ok(prof.querySelector('.xw'));
  assert.match(root.querySelector('.mn-handle').innerHTML, /neo<i>#0427<\/i>/);
  assert.match(root.querySelector('.mn-status').textContent, /çevrimiçi/);
  // rested and long days
  d.window.Cloud.render(cloudState({ xp: { ...XP, rested: 1800 } }));
  assert.match(prof.querySelector('.pf-rested').textContent, /sonraki 30 dk çift XP/);
  d.window.Cloud.render(cloudState({ xp: { ...XP, today: 9 * 3600, week: 3, bonus: 0, days: null, to: 0 } }));
  assert.match(prof.querySelector('.pf-rested').textContent, /8 saati geçtin/);
  assert.match(prof.textContent, /hedefe ulaşıldı/);
  assert.match(prof.textContent, /en üst seviye/);
  assert.equal(prof.querySelector('.xw'), null);
  d.window.Cloud.render(cloudState({ xp: null }));
  assert.match(prof.textContent, /yükleniyor/);
  d.window.Cloud.render(cloudState({ xp: null, reachable: false }));
  assert.match(prof.textContent, /sunucuya ulaşılamıyor/);
  // tabs
  d.click(root.querySelector('[data-tab="settings"]'));
  assert.ok(!root.querySelector('.mn-settings').hidden);
  assert.ok(!root.querySelector('.mn-save').hidden);
  // openMenu while open switches tab
  d.window.Cloud.openMenu('profile');
  assert.ok(!root.querySelector('.mn-profile').hidden);
  // copy your handle
  d.click(root.querySelector('.mn-copy'));
  await d.flush();
  assert.equal(d.copied, 'neo#0427');
  assert.equal(toastText(d), 'copied neo#0427 · send it to a friend');
  // close: the red light
  d.click(root.querySelector('.l-close'));
  d.tick(500);
  assert.equal(root.innerHTML, '');
});

test('main menu: status picker sets your status; Escape closes the picker, then the menu', async (t) => {
  const d = boot();
  t.after(d.close);
  await d.flush();
  d.window.Cloud.openMenu();
  const root = d.$('#cloudui');
  d.click(root.querySelector('.mn-status'));
  const pick = root.querySelector('.mn-pick');
  assert.equal(pick.querySelectorAll('[data-status]').length, 4);
  assert.ok(pick.querySelector('[data-status="online"]').classList.contains('on'));
  d.key('Escape');
  assert.equal(root.querySelector('.mn-pick'), null);
  d.click(root.querySelector('.mn-status'));
  d.click(root.querySelector('.mn-status')); // a second click closes it
  assert.equal(root.querySelector('.mn-pick'), null);
  d.click(root.querySelector('.mn-status'));
  d.click(root.querySelector('[data-status="dnd"]'));
  await d.flush();
  assert.ok(d.st.calls.includes('PATCH v1/me/status'));
  assert.equal(d.window.Social.dnd(), true);
  assert.match(root.querySelector('.mn-status').textContent, /rahatsız etmeyin/);
  assert.equal(d.$('.brand .bme').className, 'pdot bme p-dnd');
  d.key('Escape');
  d.tick(500);
  assert.equal(root.innerHTML, '');
});

test('settings: rename, app name, logo, model, sound, activity and leaderboard switches', async (t) => {
  let renamed = {};
  const d = boot({
    cloud: { rename: () => renamed },
    routes: { 'PATCH v1/me/activity': () => ({ ok: true }), 'PATCH v1/me/leaderboard': () => ({ error: 'offline' }) },
    globals: { ChatModel: { ALL: ['default', 'opus'], LABELS: { default: 'Varsayılan', opus: 'Opus' }, get: () => 'opus', set: (m) => (d.model = m) } },
  });
  t.after(d.close);
  await d.flush();
  d.click('#settings');
  const root = d.$('#cloudui');
  const set = root.querySelector('.mn-settings');
  assert.ok(!set.hidden);
  const input = set.querySelector('.hk-input');
  assert.equal(input.value, 'neo');
  const save = root.querySelector('.mn-save');
  assert.ok(save.disabled); // same name
  d.type(input, 'neo2');
  assert.ok(!save.disabled);
  save.click();
  await d.flush();
  assert.deepEqual(d.posted.filter((m) => m.type === 'rename').map((m) => m.name), ['neo2']);
  d.window.Cloud.render(cloudState({ hackerName: 'neo2' }));
  assert.equal(toastText(d), 'artık neo2#0427 adını kullanıyorsun');
  d.tick(500);
  // app name, typed live
  d.window.Cloud.openMenu('settings');
  const an = root.querySelector('.an-input');
  assert.equal(an.value, 'Derin Terminal');
  d.type(an, 'Mine');
  assert.equal(d.window.AppName.get(), 'Mine');
  d.type(an, '');
  an.dispatchEvent(new d.window.Event('blur'));
  assert.equal(an.value, 'Derin Terminal');
  d.fire(an, 'keydown', { key: 'Enter' });
  // model
  const cm = root.querySelector('.cm-select');
  assert.equal(cm.value, 'opus');
  cm.value = 'default';
  d.fire(cm, 'change');
  assert.equal(d.model, 'default');
  // logo select
  const al = root.querySelector('.al-select');
  assert.equal(al.value, 'default');
  al.value = 'prompt';
  d.fire(al, 'change');
  assert.equal(d.window.AppLogo.choice(), 'prompt');
  let clicked = 0;
  root.querySelector('.al-file').click = () => clicked++;
  al.value = 'custom';
  d.fire(al, 'change');
  assert.equal(clicked, 1);
  assert.equal(al.value, 'prompt');
  d.click(root.querySelector('.al-reset'));
  assert.equal(d.window.AppLogo.choice(), 'default');
  // sound: the top bar's button
  const snd = root.querySelector('.hk-sw.snd');
  assert.equal(snd.getAttribute('aria-checked'), 'false');
  d.click(snd);
  assert.equal(snd.getAttribute('aria-checked'), 'true');
  assert.equal(d.$('#sound').textContent, 'ses açık');
  // activity: on → off
  const act = root.querySelector('.hk-sw.act'), brd = root.querySelector('.hk-sw.brd');
  assert.equal(act.getAttribute('aria-checked'), 'true');
  act.click();
  await d.flush();
  assert.equal(act.getAttribute('aria-checked'), 'false');
  assert.match(toastText(d), /hidden from friends/);
  // the board switch fails: toast, unchanged
  brd.click();
  await d.flush();
  assert.equal(brd.getAttribute('aria-checked'), 'true');
  assert.equal(toastText(d), 'sunucuya ulaşılamıyor · tekrar dene');
  // without xp the switches are off
  d.window.Cloud.render(cloudState({ xp: null }));
  assert.ok(act.disabled);
  act.click();
  brd.click();
  await d.flush();
});

test('settings: accent swatches, info rows and update buttons', async (t) => {
  const d = boot({ storage: {} });
  t.after(d.close);
  await d.flush();
  d.window.Cloud.render(cloudState({ update: { version: '3.0.0' }, updateProgress: 0.5, xpPaused: true }));
  d.window.Cloud.openMenu('settings');
  const root = d.$('#cloudui');
  const sw = root.querySelectorAll('.st-sw');
  assert.ok(sw.length >= 2);
  const target = [...sw].find((b) => b.dataset.accent !== 'custom' && !b.classList.contains('on'));
  d.click(target);
  assert.equal(d.window.DTAccent.get(), target.dataset.accent);
  assert.ok(target.classList.contains('on'));
  assert.equal(target.getAttribute('aria-pressed'), 'true');
  const custom = root.querySelector('.st-sw[data-accent="custom"]');
  if (custom) {
    const color = custom.querySelector('.st-color');
    let picked = 0;
    color.click = () => picked++;
    d.click(custom);
    assert.equal(picked, 1);
    color.value = '#123456';
    d.fire(color, 'input');
    assert.equal(d.window.DTAccent.get(), 'custom');
  }
  const info = root.querySelector('.hk-info');
  assert.match(info.textContent, /1\.0\.0/);
  assert.match(info.textContent, /3\.0\.0 çıktı · indiriliyor 50% · o zamana dek XP duraklatıldı/);
  info.querySelector('.hk-check').click();
  await d.flush();
  assert.ok(d.st.calls.includes('checkUpdate'));
  info.querySelector('.hk-sw.upd').click();
  await d.flush();
  assert.equal(d.posted.find((m) => m.type === 'updateRightAway').on, true);
  // "update now" opens what's new over the menu? No: the menu is a modal, so it stays.
  root.querySelector('.hk-now').click();
  assert.ok(root.querySelector('.menu'));
  d.window.Cloud.render(cloudState({ checking: true }));
  assert.match(root.querySelector('.hk-info').textContent, /denetleniyor/);
  assert.ok(root.querySelector('.hk-check').disabled);
  d.window.Cloud.render(cloudState({ checkedAt: Date.now() - 2 * 3600_000 }));
  assert.match(root.querySelector('.hk-info').textContent, /güncel · son denetim 2h ago/);
  d.window.Cloud.render(cloudState({ updating: 'installing' }));
  assert.match(root.querySelector('.hk-info').textContent, /installing/);
  d.window.Cloud.render(cloudState({ update: { version: '3' }, updateReady: true }));
  assert.match(root.querySelector('.hk-info').textContent, /hazır · sen uzaktayken kurulur/);
});

test('settings with the theme, savers, archive and keys bridges', async (t) => {
  const ui = { fonts: [{ id: 'mono', name: 'Mono' }, { id: 'sans', name: 'Sans' }], scales: [1, 1.25], font: 'mono', scale: 1, aiColors: true };
  const savers = { rtk: { on: true, available: true, saved: 12345, commands: 40, pct: 61.2 }, caveman: { on: false, available: true } };
  let folders = [{ cwd: '/a', label: 'a', chats: [{ id: 'c1', title: 'one' }, { id: 'c2', title: '' }] }];
  let keys = { shortcuts: [{ id: 'shortcutsWheel', label: '⌃ Middle', changed: true }, { id: 'newChat', group: 'Chats', title: 'New chat', label: '⌘N', changed: true }, { id: 'close', group: 'Chats', title: 'Close', label: '' }] };
  const d = boot({
    bridges: {
      theme: (m) => (m.type === 'list' ? THEMES : m.type === 'ui' ? ui : m.type === 'setUI' ? { ...ui, ...m, type: undefined } : {}),
      savers: (m) => (m.type === 'state' ? savers : { ...savers, caveman: { on: m.on, available: true } }),
      archive: (m) => (m.type === 'list' ? { folders } : ((folders = []), { folders })),
      keys: (m) => (m.type === 'record' ? { combo: 'cmd+k' } : m.type === 'set' ? (m.id === 'close' ? { error: 'taken' } : keys) : keys),
    },
  });
  t.after(d.close);
  await d.flush();
  d.window.Cloud.openMenu('settings');
  await d.flush();
  const root = d.$('#cloudui');
  // theme select
  const sel = root.querySelector('.th-select');
  assert.equal(sel.options.length, 3);
  assert.equal(sel.value, 'atalay');
  sel.value = 'sea';
  d.fire(sel, 'change');
  assert.equal(d.posted.filter((m) => m.h === 'theme' && m.type === 'choose').at(-1).id, 'sea');
  // fonts and scales
  assert.equal(root.querySelector('.ui-font button.on').textContent, 'Mono');
  assert.deepEqual([...root.querySelectorAll('.ui-scale button')].map((b) => b.textContent), ['100%', '125%']);
  d.click(root.querySelector('[data-font="sans"]'));
  await d.flush();
  assert.equal(d.posted.filter((m) => m.type === 'setUI').at(-1).font, 'sans');
  assert.equal(root.querySelector('.ui-font button.on').textContent, 'Sans');
  d.click(root.querySelector('[data-scale="1.25"]'));
  await d.flush();
  assert.equal(d.posted.filter((m) => m.type === 'setUI').at(-1).scale, 1.25);
  d.click(root.querySelector('.hk-sw.ui-ai'));
  await d.flush();
  assert.equal(d.posted.filter((m) => m.type === 'setUI').at(-1).aiColors, false);
  // savers
  assert.match(root.querySelector('.ts-note[data-which="rtk"]').textContent, /12\.3K token kazandırdı · 40 komutun çıktısının %61'i/);
  assert.match(root.querySelector('.ts-note[data-which="caveman"]').textContent, /kapalı · tam uzunlukta/);
  d.click(root.querySelector('.hk-sw.ts[data-which="caveman"]'));
  await d.flush();
  assert.equal(d.posted.filter((m) => m.h === 'savers' && m.type === 'set').at(-1).on, true);
  assert.match(root.querySelector('.ts-note[data-which="caveman"]').textContent, /açık · yaklaşık üçte iki/);
  // archive
  d.click(root.querySelector('.arc-open'));
  await d.flush();
  const arc = d.$('#arcmodal');
  assert.match(arc.textContent, /3|2 arşivlenmiş sohbet/);
  assert.equal(arc.querySelectorAll('.arc-c').length, 2);
  assert.equal(arc.querySelectorAll('.arc-c span')[1].textContent, 'adsız');
  d.click(arc.querySelector('[data-act="all"]'));
  await d.flush();
  assert.equal(d.posted.filter((m) => m.h === 'archive').at(-1).type, 'restoreAll');
  assert.match(arc.textContent, /arşivde bir şey yok/);
  // Escape closes only the archive
  d.key('Escape');
  assert.equal(d.$('#arcmodal'), null);
  assert.ok(root.querySelector('.menu'));
  // keys tab
  d.click(root.querySelector('[data-tab="keys"]'));
  await d.flush();
  const page = root.querySelector('.mn-keys');
  assert.ok(page.querySelector('.ks-wheel'));
  assert.equal(page.querySelector('.ks-key[data-id="shortcutsWheel"]').textContent, '⌃ Middle');
  assert.equal(page.querySelectorAll('.ks-row').length, 2);
  assert.equal(page.querySelector('.hk-h').textContent, 'CHATS');
  assert.ok(page.querySelector('.ks-key[data-id="close"]').classList.contains('none'));
  assert.ok(page.querySelector('.ks-all'));
  d.click(page.querySelector('.ks-key[data-id="newChat"]'));
  await d.flush();
  assert.deepEqual(d.posted.filter((m) => m.h === 'keys').slice(-2).map((m) => m.type), ['record', 'set']);
  d.click(page.querySelector('.ks-key[data-id="close"]'));
  await d.flush();
  assert.equal(page.querySelector('.ks-msg').textContent, 'taken');
  d.click(page.querySelector('.ks-undo[data-id="newChat"]'));
  await d.flush();
  assert.equal(d.posted.filter((m) => m.h === 'keys').at(-1).type, 'reset');
  assert.equal(d.posted.filter((m) => m.h === 'keys').at(-1).id, 'newChat');
  d.click(page.querySelector('.ks-all'));
  await d.flush();
  assert.equal(d.posted.filter((m) => m.h === 'keys').at(-1).id, '');
});

test('friends view: list, requests, counts, actions, context menu, profile card', async (t) => {
  const d = boot({
    git: true,
    routes: {
      'POST v1/friends/requests/r1/accept': () => ({ friend: { id: 'u9', name: 'Cy', tag: 9 } }),
      'DELETE v1/friends/requests/o1': () => ({ error: 'offline' }),
      'DELETE v1/friends/f2': () => ({ ok: true }),
      'POST v1/friends/requests': (b) => (b.handle === 'bad#1' ? { error: 'not_found' } : { request: { id: 'o2', to: { name: 'Zed', tag: 77 } } }),
    },
  });
  t.after(d.close);
  await d.flush();
  // the activity bar's badges
  assert.equal(d.$('#activity [data-view=friends] .vs-badge').textContent, '3');
  assert.equal(d.$('#activity [data-view=notifications] .vs-badge').textContent, '1');
  d.click('#activity [data-view=friends]');
  await d.flush();
  const v = d.$('#friends-view');
  assert.ok(v.classList.contains('on'));
  assert.ok(d.$('#app').classList.contains('cloud-mode'));
  assert.equal(v.querySelector('.cv-friends .meta').textContent, '2 friends · 2 online · 2 unread');
  assert.equal(v.querySelector('.cv-requests .meta').textContent, '1 waiting for you');
  const rows = v.querySelectorAll('.mn-friends .mn-row');
  assert.equal(rows.length, 2);
  assert.ok(rows[0].classList.contains('fire'));
  assert.equal(d.fires.length, 1);
  assert.equal(rows[0].querySelector('small').innerHTML, '&lt;hi&gt;');
  assert.equal(rows[1].querySelector('small').textContent, 'you: ok');
  assert.match(rows[0].querySelector('.mn-today').textContent, /24h 1 sa/);
  assert.equal(rows[0].querySelector('.cnt').textContent, '2');
  assert.match(v.querySelector('.mn-in').textContent, /wants to be your friend · 2h ago/);
  assert.match(v.querySelector('.mn-out').textContent, /waiting · now/);
  // chat: the app opens it
  d.click(rows[1].querySelector('[data-act="chat"]'));
  assert.equal(d.posted.filter((m) => m.type === 'openChat').at(-1).id, 'f2');
  // accept
  d.click(v.querySelector('.mn-in [data-act="accept"]'));
  await d.flush();
  assert.deepEqual(d.sfx, ['accept']);
  assert.match(v.querySelector('.mn-in').textContent, /no requests/);
  assert.equal(v.querySelectorAll('.mn-friends .mn-row').length, 3);
  // cancel fails: toast, the button comes back
  const cancel = v.querySelector('.mn-out [data-act="cancel"]');
  d.click(cancel);
  await d.flush();
  assert.equal(toastText(d), 'sunucuya ulaşılamıyor · tekrar dene');
  assert.ok(!cancel.disabled);
  // profile of a friend
  d.click(v.querySelector('.mn-row[data-id="f1"] [data-act="profile"]'));
  const card = v.querySelector('.mn-confirm .pf-card');
  assert.ok(card);
  assert.match(card.textContent, /Level 30 · Jonin/);
  d.click(card.querySelector('[data-ans="chat"]'));
  assert.equal(d.posted.filter((m) => m.type === 'openChat').at(-1).id, 'f1');
  d.key('Escape');
  assert.equal(v.querySelector('.mn-confirm'), null);
  // a friend who hides their time
  d.click(v.querySelector('.mn-row[data-id="f2"] [data-act="profile"]'));
  assert.match(v.querySelector('.mn-confirm').textContent, /keeps their active time to themselves/);
  d.click(v.querySelector('.mn-confirm [data-ans="close"]'));
  // context menu → remove → confirm
  d.fire(v.querySelector('.mn-row[data-id="f2"] .mn-main'), 'contextmenu', { clientX: 10, clientY: 10 });
  const ctx = v.querySelector('.mn-ctx');
  assert.ok(ctx);
  d.click(ctx.querySelector('[data-ctx="copy"]'));
  await d.flush();
  assert.equal(d.copied, 'Bob#0003');
  d.fire(v.querySelector('.mn-row[data-id="f2"] .mn-main'), 'contextmenu', { clientX: 10, clientY: 10 });
  d.click(v.querySelector('.mn-ctx [data-ctx="remove"]'));
  const ask = v.querySelector('.mn-confirm');
  assert.match(ask.textContent, /remove Bob#0003\?/);
  d.click(ask.querySelector('[data-ans="yes"]'));
  await d.flush();
  assert.equal(toastText(d), 'removed Bob#0003');
  assert.equal(v.querySelector('.mn-row[data-id="f2"]'), null);
  // the context menu's other entries
  d.fire(v.querySelector('.mn-row[data-id="f1"] .mn-main'), 'contextmenu', { clientX: 10, clientY: 10 });
  d.click(v.querySelector('.mn-ctx [data-ctx="chat"]'));
  d.fire(v.querySelector('.mn-row[data-id="f1"] .mn-main'), 'contextmenu', { clientX: 10, clientY: 10 });
  d.click(v.querySelector('.mn-ctx [data-ctx="profile"]'));
  assert.ok(v.querySelector('.mn-confirm .pf-card'));
  d.click(v.querySelector('.mn-confirm'));
  // a mousedown elsewhere closes a context menu; Escape too
  d.fire(v.querySelector('.mn-row[data-id="f1"] .mn-main'), 'contextmenu', { clientX: 10, clientY: 10 });
  d.fire(v.querySelector('.mn-friends'), 'mousedown');
  assert.equal(v.querySelector('.mn-ctx'), null);
  // add a friend by name#tag
  const add = v.querySelector('.mn-handle-in'), send = v.querySelector('.mn-send');
  d.type(add, 'nope');
  assert.ok(send.disabled);
  d.type(add, 'bad#1');
  assert.ok(!send.disabled);
  send.click();
  await d.flush();
  assert.equal(v.querySelector('.mn-add-status').textContent, 'bu ad#etikete sahip kullanıcı yok');
  d.type(add, 'Zed Two#77');
  d.fire(add, 'keydown', { key: 'Enter' });
  await d.flush();
  assert.equal(v.querySelector('.mn-add-status').textContent, 'request sent to Zed#0077');
  assert.equal(add.value, '');
  // Escape on the view goes back to the dashboard
  d.key('Escape');
  assert.ok(!v.classList.contains('on'));
});

test('friends view without a snapshot: loading or offline', async (t) => {
  const d = boot({ routes: { 'GET v1/social': () => ({ error: 'offline' }) } });
  t.after(d.close);
  await d.flush();
  d.window.Cloud.showView('friends');
  await d.flush();
  assert.match(d.$('#friends-view .mn-friends').textContent, /loading/);
  d.window.Cloud.render(cloudState({ reachable: false }));
  d.window.Social.event({ type: 'status', status: 'x' });
  await d.flush();
  assert.match(d.$('#friends-view .mn-friends').textContent, /can't reach the server/);
  // the same view again does nothing
  d.window.Cloud.showView('friends');
});

test('friends view: no friends yet shows your tag', async (t) => {
  const d = boot({ social: { ...social(), friends: [], incoming: [], outgoing: [] } });
  t.after(d.close);
  await d.flush();
  d.window.Cloud.showView('friends');
  await d.flush();
  assert.match(d.$('#friends-view .mn-friends').textContent, /no friends yet · send them your tag: neo#0427/);
  assert.match(d.$('#friends-view .mn-out').textContent, /nothing sent/);
});

test('leaderboard: rows, anonymous, you below the list, a card in their theme, adding', async (t) => {
  const d = boot({
    bridges: { theme: (m) => (m.type === 'list' ? JSON.parse(JSON.stringify(THEMES)) : {}) },
    routes: { 'POST v1/friends/requests': () => ({ request: { id: 'o9', to: {} } }) },
  });
  t.after(d.close);
  await d.flush();
  d.window.Cloud.showView('board');
  const v = d.$('#board-view');
  assert.match(v.querySelector('.lb-host').textContent, /loading/);
  await d.flush();
  const rows = v.querySelectorAll('.lb-row');
  assert.equal(rows.length, 6);
  assert.match(v.querySelector('.lb-note').textContent, /2 working now/);
  assert.ok(rows[0].classList.contains('top'));
  assert.ok(rows[0].classList.contains('fire'));
  assert.ok(rows[0].querySelector('.lb-live'));
  assert.equal(rows[0].querySelector('.lb-score').textContent, '+900 XP');
  assert.match(rows[0].querySelector('small').textContent, /2 sa in 24h · 6 sa this week/);
  assert.ok(rows[1].classList.contains('anon'));
  assert.equal(rows[1].querySelector('.lb-anon').textContent, 'Anonymous');
  assert.ok(rows[2].querySelector('[data-act="chat"]'));
  assert.equal(rows[3].querySelector('.lb-state').textContent, 'request sent');
  assert.equal(rows[4].querySelector('[data-act="add"]').textContent, '✓ accept');
  assert.ok(v.querySelector('.lb-gap'));
  assert.ok(rows[5].classList.contains('me'));
  assert.ok(rows[5].querySelector('.lb-hid'));
  // the first card: the first named row? No: you
  await d.flush();
  const host = v.querySelector('.cv-card');
  assert.match(host.querySelector('.pf-host').textContent, /#9 on the leaderboard · you/);
  assert.match(host.querySelector('.pf-theme').textContent, /yours/);
  // pick someone: their card in their theme
  d.click(rows[0].querySelector('.lb-who'));
  await d.flush();
  assert.match(host.querySelector('.meta').textContent, /in their theme · Sea/);
  assert.match(host.getAttribute('style'), /--bg:#012/);
  assert.ok(rows[0].classList.contains('sel'));
  d.click(host.querySelector('[data-ans="theme"]'));
  await d.flush();
  assert.equal(toastText(d), 'your theme is Sea now');
  assert.equal(d.posted.filter((m) => m.h === 'theme' && m.type === 'choose').at(-1).id, 'sea');
  assert.match(host.querySelector('.pf-theme').textContent, /you use it too/);
  // add someone from their card
  d.click(host.querySelector('[data-ans="add"]'));
  await d.flush();
  assert.equal(toastText(d), 'request sent to Top#0001');
  assert.deepEqual(d.sfx, ['accept']);
  // chat with a friend on the board
  d.click(v.querySelector('.lb-row[data-id="f1"] [data-act="chat"]'));
  assert.equal(d.posted.filter((m) => m.type === 'openChat').at(-1).id, 'f1');
  // the anonymous row does nothing
  d.click(v.querySelector('.lb-row.anon'));
  // all time
  d.click(v.querySelector('[data-by="all"]'));
  await d.flush();
  assert.ok(v.querySelector('[data-by="all"]').classList.contains('on'));
  assert.equal(v.querySelector('.lb-row .lb-score').textContent, '9.000 XP');
  d.click(v.querySelector('[data-by="all"]')); // same: nothing
  assert.ok(d.st.calls.includes('GET v1/leaderboard?by=all'));
});

test('leaderboard: errors and empty', async (t) => {
  const d = boot({ board: { error: 'offline' } });
  t.after(d.close);
  await d.flush();
  d.window.Cloud.showView('board');
  await d.flush();
  assert.match(d.$('#board-view .lb-host').textContent, /sunucuya ulaşılamıyor/);
  const d2 = boot({ board: { rows: [], me: null } });
  t.after(d2.close);
  await d2.flush();
  d2.window.Cloud.showView('board');
  await d2.flush();
  assert.match(d2.$('#board-view .lb-host').textContent, /no one on the leaderboard yet/);
  assert.match(d2.$('#board-view .lb-host').textContent, /you'll show up here/);
});

test('leaderboard: adding fails with a known error, or they were already friends', async (t) => {
  let answer = { error: 'too_many_requests' };
  const d = boot({ routes: { 'POST v1/friends/requests': () => answer }, bridges: { theme: () => null } });
  t.after(d.close);
  await d.flush();
  d.window.Cloud.showView('board');
  await d.flush();
  const btn = d.$('#board-view .lb-row[data-id="u5"] [data-act="add"]');
  d.click(btn);
  await d.flush();
  assert.equal(toastText(d), 'too many requests waiting · cancel some first');
  assert.ok(!btn.disabled);
  answer = { error: 'already_friends' };
  d.click(d.$('#board-view .lb-row[data-id="u5"] [data-act="add"]'));
  await d.flush();
  assert.equal(toastText(d), 'you and Asker#0005 are friends now');
  assert.ok(d.$('#board-view .lb-row[data-id="u5"] [data-act="chat"]'));
});

test('leaderboard switch: hiding your name reloads the board', async (t) => {
  const d = boot({ routes: { 'PATCH v1/me/leaderboard': () => ({ ok: true }) } });
  t.after(d.close);
  await d.flush();
  d.window.Cloud.showView('board');
  await d.flush();
  d.window.Cloud.openMenu('settings');
  d.$('#cloudui .hk-sw.brd').click();
  await d.flush();
  assert.match(toastText(d), /Anonymous on the leaderboard/);
  assert.equal(d.st.calls.filter((c) => c.startsWith('GET v1/leaderboard')).length, 2);
});

test('themes view: cards, preview on hover, keep on click, arrow keys, revert on leave', async (t) => {
  const d = boot({ bridges: { theme: (m) => (m.type === 'list' ? THEMES : {}) } });
  t.after(d.close);
  await d.flush();
  d.window.Cloud.showView('themes');
  await d.flush();
  const v = d.$('#themes-view');
  const cards = v.querySelectorAll('.th-card');
  assert.equal(cards.length, 3);
  assert.ok(cards[0].classList.contains('on'));
  assert.equal(cards[0].querySelector('.th-name em').textContent, 'ACTIVE');
  assert.equal(cards[0].querySelectorAll('.th-pal i').length, 16);
  const themeMsgs = () => d.posted.filter((m) => m.h === 'theme' && m.type !== 'list').map((m) => [m.type, m.id]);
  cards[1].onmouseenter();
  d.tick(100);
  assert.deepEqual(themeMsgs().at(-1), ['preview', 'sea']);
  v.querySelector('.th-grid').onmouseleave();
  d.tick(100);
  assert.deepEqual(themeMsgs().at(-1), ['revert', 'atalay']);
  // arrows: from the kept one
  d.window.getComputedStyle = () => ({ gridTemplateColumns: '1fr 1fr' });
  d.key('ArrowRight');
  d.key('ArrowRight');
  d.tick(100);
  assert.ok(cards[1].classList.contains('hot'));
  assert.deepEqual(themeMsgs().at(-1), ['preview', 'sea']);
  d.key('ArrowDown');
  assert.ok(cards[2].classList.contains('hot'));
  d.key('Enter');
  assert.deepEqual(themeMsgs().at(-1), ['choose', 'sun']);
  assert.ok(cards[2].classList.contains('on'));
  assert.equal(cards[0].querySelector('.th-name em').textContent, '');
  d.click(cards[0]);
  assert.deepEqual(themeMsgs().at(-1), ['choose', 'atalay']);
  // leaving the view reverts any preview
  d.window.Cloud.showView(null);
  assert.deepEqual(themeMsgs().at(-1)[0], 'revert');
  assert.ok(!d.$('#app').classList.contains('cloud-mode'));
});

test('themes view: the list failing to load', async (t) => {
  const d = boot({ bridges: { theme: () => { throw new Error('x'); } } });
  t.after(d.close);
  await d.flush();
  d.window.Cloud.showView('themes');
  await d.flush();
  assert.match(d.$('#themes-view').textContent, /themes didn't load/);
});

test('notifications view: new marks, reading them, live ones', async (t) => {
  const d = boot();
  t.after(d.close);
  await d.flush();
  d.window.Cloud.showView('notifications');
  await d.flush();
  const v = d.$('#notifications-view');
  assert.equal(v.querySelector('.meta').textContent, '2 from the developer');
  const items = v.querySelectorAll('.nt-item');
  assert.equal(items.length, 2);
  assert.ok(items[0].classList.contains('new'));
  assert.equal(items[0].querySelector('b').textContent, 'Hello <b>');
  assert.equal(items[0].querySelector('.nt-body').textContent, 'news');
  assert.ok(!items[1].classList.contains('new'));
  assert.ok(d.st.calls.includes('POST v1/notifications/read'));
  assert.equal(d.$('#notifications-view').querySelector('.nt-item em').textContent, 'NEW');
  // a live one shows as new and is read
  d.window.Social.event({ type: 'notification', notification: { id: 'n3', title: 'Live', at: new Date().toISOString() } });
  await d.flush();
  assert.equal(v.querySelectorAll('.nt-item.new').length, 2);
  d.window.Social.event({ type: 'notification_gone', id: 'n3' });
  assert.equal(v.querySelectorAll('.nt-item').length, 2);
});

test('notifications view: before they load, offline', async (t) => {
  const d = boot({ notes: { error: 'offline' } });
  t.after(d.close);
  await d.flush();
  d.window.Cloud.render(cloudState({ reachable: false }));
  d.window.Cloud.showView('notifications');
  await d.flush();
  assert.match(d.$('#notifications-view').textContent, /can't reach the server/);
  const d2 = boot({ notes: { notifications: [], unread: 0 } });
  t.after(d2.close);
  await d2.flush();
  d2.window.Cloud.showView('notifications');
  assert.match(d2.$('#notifications-view').textContent, /no notifications yet/);
});

test('feedback: draft kept, the count near the limit, send, errors', async (t) => {
  let answer = { error: 'offline' };
  const d = boot({ routes: { 'POST v1/feedback': () => answer } });
  t.after(d.close);
  await d.flush();
  d.window.Cloud.openFeedback();
  const root = d.$('#cloudui');
  const box = root.querySelector('.fbk-in'), send = root.querySelector('.fbk-send');
  assert.ok(send.disabled);
  d.type(box, 'a'.repeat(3700));
  assert.ok(!send.disabled);
  assert.equal(root.querySelector('.fbk-status').textContent, '3700 / 4000');
  d.type(box, 'a'.repeat(4000));
  assert.ok(root.querySelector('.fbk-status').classList.contains('full'));
  d.type(box, 'great app');
  assert.equal(root.querySelector('.fbk-status').textContent, '');
  // another modal can't open over it
  d.window.Cloud.openMenu();
  assert.ok(root.querySelector('.fbk'));
  d.fire(box, 'keydown', { key: 'Enter', ctrlKey: true });
  await d.flush();
  assert.equal(root.querySelector('.fbk-status').textContent, 'sunucuya ulaşılamıyor · tekrar dene');
  // Escape closes; the draft stays
  d.key('Escape');
  d.tick(500);
  d.window.Cloud.openFeedback();
  assert.equal(root.querySelector('.fbk-in').value, 'great app');
  answer = { ok: true };
  root.querySelector('.fbk-send').click();
  await d.flush();
  assert.equal(toastText(d), 'feedback sent · thank you, every one is read');
  d.tick(500);
  d.window.Cloud.openFeedback();
  assert.equal(root.querySelector('.fbk-in').value, '');
  d.click(root.querySelector('.l-close'));
});

test('xp event re-renders the top bar', async (t) => {
  const d = boot();
  t.after(d.close);
  await d.flush();
  d.window.Social.event({ type: 'xp', xp: { ...XP, level: 40 } });
  assert.equal(d.$('#top .brand .rk').textContent, 'ANBU · LV 40');
});

test('menu: Escape closes a friend card first; clicking the backdrop closes the menu', async (t) => {
  const d = boot();
  t.after(d.close);
  await d.flush();
  d.window.Cloud.openMenu('profile');
  const root = d.$('#cloudui');
  root.querySelector('.mn-me').insertAdjacentHTML('beforeend', '<div class="mn-confirm"></div>');
  d.key('Escape');
  assert.equal(root.querySelector('.mn-confirm'), null);
  assert.ok(root.querySelector('.menu'));
  root.dispatchEvent(new d.window.MouseEvent('mousedown', { bubbles: true }));
  d.tick(500);
  assert.equal(root.innerHTML, '');
  // Escape with nothing open does nothing
  d.key('Escape');
  d.key('a');
});

test('BUG cloud.js:840: a friend with no presence and no last message breaks the friends list', { todo: 'cloud.js:840 reads Social.PRESENCE[f.presence].label without the offline default' }, async (t) => {
  const s = social();
  s.friends.push({ id: 'f3', name: 'New', tag: 1, unread: 0, last: null });
  const d = boot({ social: s });
  t.after(d.close);
  await d.flush();
  d.window.Cloud.showView('friends');
  await d.flush();
  assert.equal(d.$$('#friends-view .mn-friends .mn-row').length, 3);
});
