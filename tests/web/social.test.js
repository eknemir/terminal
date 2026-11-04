'use strict';
// social.js: the friends snapshot, live events applied in place, the API calls and their answers; xp.js's DOM output.
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeDom } = require('./dom');

const BLANK = '<!doctype html><html><body></body></html>';
const snapshot = () => ({
  me: { id: 'me', name: 'Me', tag: 7, status: 'online' },
  friends: [
    { id: 'f1', name: 'Ann', tag: 42, presence: 'online', unread: 2, last: null },
    { id: 'f2', name: 'Bob', tag: 1234, presence: 'offline', unread: 0, last: null },
  ],
  incoming: [{ id: 'r1', from: { id: 'u9', name: 'Cy', tag: 9 }, at: '2026-01-01T00:00:00Z' }],
  outgoing: [],
});

function server(over = {}) {
  const calls = [];
  const routes = {
    'GET v1/social': () => snapshot(),
    'GET v1/notifications': () => ({ notifications: [{ id: 'n1', title: 'Hi', read: false }, { id: 'n2', title: 'Old', read: true }], unread: 1 }),
    'POST v1/notifications/read': () => ({ ok: true }),
    'POST v1/friends/requests': (b) => (b.handle === 'Dee#0005' ? { friend: { id: 'f3', name: 'Dee', tag: 5 } } : { request: { id: 'r9', to: { name: 'X', tag: 1 } } }),
    'PATCH v1/me/status': (b) => ({ status: b.status }),
    ...over,
  };
  const reply = (m) => {
    if (m.type !== 'social') return null;
    calls.push(`${m.method} ${m.path}`);
    const k = `${m.method} ${m.path}`;
    const f = routes[k] || Object.entries(routes).find(([p]) => k.startsWith(p.replace(/\*$/, '')) && p.endsWith('*'))?.[1];
    if (!f) return { ok: true };
    return f(m.body || {});
  };
  return { reply, calls };
}

function boot(srv = server(), extra = {}) {
  const d = makeDom({ page: BLANK, reply: { cloud: srv.reply }, ...extra });
  d.run('xp.js', 'social.js');
  return d;
}

test('helpers: handle, dot, presence labels', (t) => {
  const d = boot();
  t.after(d.close);
  const S = d.window.Social;
  assert.equal(S.handle({ name: 'Ann', tag: 42 }), 'Ann#0042');
  assert.equal(S.dot('dnd'), '<i class="pdot p-dnd" title="rahatsız etmeyin"></i>');
  assert.equal(S.dot(), '<i class="pdot p-offline" title="çevrimdışı"></i>');
  assert.deepEqual(Object.keys(S.PRESENCE), ['online', 'idle', 'dnd', 'invisible', 'offline']);
  // nothing loaded yet
  assert.equal(S.state(), null);
  assert.equal(S.unread(), 0);
  assert.equal(S.requests(), 0);
  assert.equal(S.dnd(), false);
  assert.equal(S.friend('f1'), null);
  assert.equal(S.unreadNotes(), 0);
  assert.equal(S.notes(), null);
});

test('load: one request at a time, a snapshot event, counts', async (t) => {
  const srv = server();
  const d = boot(srv);
  t.after(d.close);
  const S = d.window.Social;
  const seen = [];
  const off = S.on((ev, s) => seen.push([ev.type, !!s]));
  const a = S.load(), b = S.load();
  assert.equal(a, b);
  await a;
  assert.equal(srv.calls.filter((c) => c === 'GET v1/social').length, 1);
  assert.deepEqual(seen, [['snapshot', true]]);
  assert.equal(S.unread(), 2);
  assert.equal(S.requests(), 1);
  assert.equal(S.friend('f2').name, 'Bob');
  off();
  await S.load();
  assert.equal(seen.length, 1);
});

test('load: an error keeps no snapshot; a listener that throws does not stop others', async (t) => {
  const d = boot(server({ 'GET v1/social': () => ({ error: 'offline' }) }));
  t.after(d.close);
  const S = d.window.Social;
  const r = await S.load();
  assert.equal(r.error, 'offline');
  assert.equal(S.state(), null);
  // a rejected bridge call reads as offline
  const d2 = boot({ reply: () => { throw new Error('down'); } });
  t.after(d2.close);
  const r2 = await d2.window.Social.load();
  assert.deepEqual({ ...r2 }, { error: 'offline' });
  // listeners
  const d3 = boot();
  t.after(d3.close);
  const got = [];
  const origError = d3.window.console.error;
  d3.window.console.error = () => got.push('logged');
  d3.window.Social.on(() => { throw new Error('bad'); });
  d3.window.Social.on((ev) => got.push(ev.type));
  await d3.window.Social.load();
  d3.window.console.error = origError;
  assert.deepEqual(got, ['logged', 'snapshot']);
});

test('events update the snapshot in place', async (t) => {
  const d = boot();
  t.after(d.close);
  const S = d.window.Social;
  // before a snapshot, an event loads one and is then passed on
  const seen = [];
  S.on((ev) => seen.push(ev.type));
  S.event({ type: 'status', status: 'idle' });
  await d.flush();
  assert.deepEqual(seen, ['snapshot', 'status']);
  S.event(null);
  S.event({});
  S.event({ type: 'request', request: { id: 'r2', from: { id: 'u1' } } });
  S.event({ type: 'request', request: { id: 'r2', from: { id: 'u1' } } });
  assert.equal(S.state().incoming.length, 2);
  S.event({ type: 'outgoing', request: { id: 'o1', to: {} } });
  S.event({ type: 'outgoing', request: { id: 'o1', to: {} } });
  assert.equal(S.state().outgoing.length, 1);
  S.event({ type: 'request_gone', id: 'o1' });
  assert.equal(S.state().outgoing.length, 0);
  S.event({ type: 'friend', requestId: 'r2', friend: { id: 'f9', name: 'New', tag: 3 } });
  assert.equal(S.state().incoming.length, 1);
  assert.equal(S.state().friends[0].id, 'f9');
  assert.equal(S.state().friends[0].unread, 0);
  S.event({ type: 'friend', requestId: null, friend: { id: 'f9' } });
  assert.equal(S.state().friends.filter((f) => f.id === 'f9').length, 1);
  S.event({ type: 'unfriended', id: 'f9' });
  assert.equal(S.friend('f9'), undefined);
  const pres = { type: 'presence', id: 'f2', presence: 'online' };
  S.event(pres);
  assert.equal(pres.was, 'offline');
  assert.equal(S.friend('f2').presence, 'online');
  S.event({ type: 'presence', id: 'ghost', presence: 'online' });
  S.event({ type: 'status', status: 'dnd' });
  assert.equal(S.dnd(), true);
  S.event({ type: 'message', with: 'f2', message: { body: 'yo', at: 1, mine: false } });
  assert.equal(S.state().friends[0].id, 'f2');
  assert.equal(S.friend('f2').unread, 1);
  assert.deepEqual({ ...S.friend('f2').last }, { body: 'yo', at: 1, mine: false });
  S.event({ type: 'message', with: 'f2', message: { body: 'me', at: 2, mine: true } });
  assert.equal(S.friend('f2').unread, 1);
  S.event({ type: 'message', with: 'ghost', message: { body: 'x' } });
  S.event({ type: 'read', with: 'f2' });
  assert.equal(S.friend('f2').unread, 0);
  S.event({ type: 'read', with: 'ghost' });
  S.event({ type: 'friend_xp', id: 'f1', level: 20, rank: 'Chunin' });
  assert.deepEqual({ ...S.friend('f1').xp }, { level: 20, rank: 'Chunin' });
  S.event({ type: 'friend_xp', id: 'ghost', level: 1 });
  assert.equal(S.unread(), 2);
});

test('notifications: load on hello, live adds and removals, read all', async (t) => {
  const srv = server();
  const d = boot(srv);
  t.after(d.close);
  const S = d.window.Social;
  S.event({ type: 'hello' });
  await d.flush();
  assert.ok(srv.calls.includes('GET v1/notifications'));
  assert.equal(S.unreadNotes(), 1);
  // without notes loaded, these do nothing; with them:
  S.event({ type: 'notification', notification: { id: 'n3', title: 'New' } });
  S.event({ type: 'notification', notification: { id: 'n3', title: 'New' } });
  assert.equal(S.notes().list.length, 3);
  assert.equal(S.unreadNotes(), 2);
  S.event({ type: 'notification_gone', id: 'n2' }); // was read: the count stays
  assert.equal(S.unreadNotes(), 2);
  S.event({ type: 'notification_gone', id: 'n3' });
  assert.equal(S.unreadNotes(), 1);
  S.event({ type: 'notification_gone', id: 'nope' });
  assert.equal(S.unreadNotes(), 1);
  const notes = [];
  S.on((ev) => notes.push(ev.type));
  await S.readNotes();
  assert.equal(S.unreadNotes(), 0);
  assert.ok(S.notes().list.every((n) => n.read));
  assert.ok(notes.includes('notes'));
});

test('notification events before any notes load are ignored', async (t) => {
  const d = boot();
  t.after(d.close);
  const S = d.window.Social;
  await S.load();
  S.event({ type: 'notification', notification: { id: 'x' } });
  S.event({ type: 'notification_gone', id: 'x' });
  assert.equal(S.notes(), null);
  // readNotes with an error answer changes nothing
  const d2 = boot(server({ 'POST v1/notifications/read': () => ({ error: 'nope' }) }));
  t.after(d2.close);
  await d2.window.Social.loadNotes();
  const r = await d2.window.Social.readNotes();
  assert.equal(r.error, 'nope');
  assert.equal(d2.window.Social.unreadNotes(), 1);
});

test('actions: request, accept, dismiss, unfriend, setStatus apply their answer at once', async (t) => {
  const srv = server({
    'POST v1/friends/requests/r1/accept': () => ({ friend: { id: 'u9', name: 'Cy', tag: 9 } }),
    'DELETE v1/friends/f2': () => ({ ok: true }),
    'DELETE v1/friends/requests/r1': () => ({ ok: true }),
  });
  const d = boot(srv);
  t.after(d.close);
  const S = d.window.Social;
  await S.load();
  let r = await S.request('Someone#0001');
  assert.equal(r.request.id, 'r9');
  assert.equal(S.state().outgoing[0].id, 'r9');
  r = await S.request('Dee#0005');
  assert.equal(S.friend('f3').name, 'Dee');
  await S.accept('r1');
  assert.equal(S.requests(), 0);
  assert.ok(S.friend('u9'));
  await S.dismiss('r1');
  await S.unfriend('f2');
  assert.equal(S.friend('f2'), undefined);
  await S.setStatus('dnd');
  assert.equal(S.dnd(), true);
  // the plain calls go to their paths
  await S.history('f1');
  await S.history('f1', 50);
  await S.send('f1', 'hi');
  await S.read('f1');
  await S.setActivity(false);
  await S.leaderboard('all');
  await S.leaderboard('anything');
  await S.setBoard(true);
  await S.feedback('nice');
  for (const p of ['GET v1/messages/f1', 'GET v1/messages/f1?before=50', 'POST v1/messages', 'POST v1/messages/read', 'PATCH v1/me/activity', 'GET v1/leaderboard?by=all', 'GET v1/leaderboard?by=week', 'PATCH v1/me/leaderboard', 'POST v1/feedback']) {
    assert.ok(srv.calls.includes(p), p);
  }
  const body = d.posted.find((m) => m.path === 'v1/messages').body;
  assert.deepEqual(body, { to: 'f1', body: 'hi' });
});

test('actions with errors leave the snapshot alone', async (t) => {
  const srv = server({
    'DELETE v1/friends/f1': () => ({ error: 'x' }),
    'DELETE v1/friends/requests/r1': () => ({ error: 'x' }),
    'PATCH v1/me/status': () => ({ error: 'x' }),
    'POST v1/friends/requests/r1/accept': () => ({ error: 'x' }),
  });
  const d = boot(srv);
  t.after(d.close);
  const S = d.window.Social;
  await S.load();
  await S.unfriend('f1');
  await S.dismiss('r1');
  await S.setStatus('dnd');
  await S.accept('r1');
  assert.ok(S.friend('f1'));
  assert.equal(S.requests(), 1);
  assert.equal(S.dnd(), false);
});

test('openChat: in a chat panel it opens there, else the app opens one', (t) => {
  const d = boot();
  t.after(d.close);
  const S = d.window.Social;
  S.openChat('f1');
  assert.deepEqual(d.sent('openChat', 'cloud').map((m) => m.id), ['f1']);
  const opened = [];
  d.window.Messages = { canChat: true, open: (id) => opened.push(id) };
  S.openChat('f2');
  assert.deepEqual(opened, ['f2']);
  assert.equal(d.sent('openChat', 'cloud').length, 1);
});

test('xp.js: ranks, durations, percentages, badges, headband, week', (t) => {
  const d = boot();
  t.after(d.close);
  const X = d.window.Xp;
  assert.equal(X.rank(1).name, 'Akademi Öğrencisi');
  assert.equal(X.rank(0).name, 'Akademi Öğrencisi');
  assert.equal(X.rank(14).name, 'Genin');
  assert.equal(X.rank(15).name, 'Chunin');
  assert.equal(X.rank(99).name, 'Kage');
  assert.equal(X.dur(0), '0 dk');
  assert.equal(X.dur(null), '0 dk');
  assert.equal(X.dur(45 * 60), '45 dk');
  assert.equal(X.dur(2 * 3600), '2 sa');
  assert.equal(X.dur(2 * 3600 + 40 * 60), '2 sa 40 dk');
  assert.equal(X.hours(3600), '1 sa');
  assert.match(X.hours(40_000 * 3600), /^40\.000 sa$/);
  assert.match(X.num(1234567), /^1\.234\.567$/);
  assert.equal(X.num(null), '0');
  assert.equal(X.pct({ xp: 150, from: 100, to: 200 }), 50);
  assert.equal(X.pct({ xp: 50, from: 100, to: 200 }), 0);
  assert.equal(X.pct({ xp: 500, from: 100, to: 200 }), 100);
  assert.equal(X.pct({ xp: 5, from: 1, to: 0 }), 100);
  assert.equal(X.badge(23), '<span class="lvb" style="--rc:248, 128, 8" title="Seviye 23 · Chunin">Sv 23</span>');
  assert.match(X.badge(1, 'profile'), /data-act="profile"/);
  const host = d.document.createElement('div');
  host.innerHTML = X.headband(30, 'x') + X.headband(30);
  const svgs = host.querySelectorAll('svg.hb');
  assert.equal(svgs.length, 2);
  assert.ok(svgs[0].classList.contains('x'));
  // each headband has its own filter ids
  const ids = [...host.querySelectorAll('filter')].map((f) => f.id);
  assert.equal(new Set(ids).size, 4);
  assert.match(svgs[0].getAttribute('style'), /--rc:255, 210, 63/);
  assert.equal(X.week(null), '');
  assert.equal(X.week([]), '');
  // your own week: today last, a hidden day empty
  host.innerHTML = X.week([3600, null, 0, 2 * 3600, 600, 3600, 5 * 3600], '1, 2, 3');
  const days = host.querySelectorAll('.xw-d');
  assert.equal(days.length, 7);
  assert.equal(days[6].querySelector('span').textContent, 'bugün');
  assert.ok(days[6].classList.contains('today'));
  assert.match(days[1].title, /gizli$/);
  assert.equal(days[2].querySelector('i').style.height, '0%');
  assert.equal(days[6].querySelector('i').style.height, '100%');
  assert.equal(host.querySelector('.xw-note'), null);
  // someone else's, in their time zone
  host.innerHTML = X.week([60, 60], '1, 2, 3', '2026-03-02');
  assert.match(host.querySelector('.xw-note').textContent, /orada 2 Mart Pazartesi/);
  assert.equal(host.querySelectorAll('.xw-d span')[1].textContent, 'Pzt 2');
  assert.equal(host.querySelectorAll('.xw-d span')[0].textContent, 'Paz 1');
});
