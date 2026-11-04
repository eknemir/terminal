'use strict';
// messages.js in messages.html: the notices panel (pop-ups, quick replies, requests, progress, the danger alarm) and the
// chat panel (history, sending, retries, live messages), each with its own fake app bridge.
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeDom } = require('./dom');

const today = new Date().toISOString();
const social = () => ({
  me: { id: 'me', name: 'Neo', tag: 1, status: 'online' },
  friends: [
    { id: 'f1', name: 'Ann', tag: 42, presence: 'online', unread: 1, xp: { level: 20 } },
    { id: 'f2', name: 'Bob', tag: 3, presence: 'offline', unread: 2 },
    { id: 'f3', name: 'Cy', tag: 4, presence: 'offline', unread: 0 },
  ],
  incoming: [],
  outgoing: [],
});

function boot(role, opts = {}) {
  const sfx = [], burns = [], calls = [];
  const snap = opts.social || social();
  const routes = {
    'GET v1/social': () => snap,
    'POST v1/messages': (b) => (opts.send ? opts.send(b) : { message: { id: 100 + calls.length, body: b.body, at: today, mine: true } }),
    'POST v1/messages/read': () => ({ ok: true }),
    ...(opts.routes || {}),
  };
  const d = makeDom({
    page: 'messages.html',
    storage: opts.storage,
    reply: {
      cloud: (m) => {
        const k = `${m.method} ${m.path}`;
        calls.push(k);
        const f = routes[k];
        return f ? f(m.body || {}) : { ok: true };
      },
      messages: () => ({}),
    },
    globals: {
      __MESSAGES_ROLE__: role,
      __MESSAGES_FRIEND__: opts.friend,
      Sfx: { play: (k) => sfx.push(k) },
      Fire: { burn: (c, o) => (burns.push(o), () => burns.push('stopped')) },
    },
  });
  d.run('appname.js', 'applogo.js', 'xp.js', 'social.js', 'messages.js');
  Object.assign(d, { sfx, burns, calls, snap });
  return d;
}
const M = (d) => d.window.__messages;
const box = (d) => d.$('#msgbox');
const layouts = (d) => d.sent('layout', 'messages');

test('notices: a message pops up with its sender and level, closes, and the panel resizes', async (t) => {
  const d = boot('notices');
  t.after(d.close);
  await d.flush();
  assert.equal(d.sent('ready', 'messages').length, 1);
  assert.equal(d.$('#chatwin'), null);
  assert.ok(d.$('#dangerbox'));
  M(d).event({ type: 'message', with: 'f1', message: { id: 1, body: '<hi>', at: today, mine: false } });
  assert.deepEqual(d.sfx, ['message']);
  const peek = box(d).querySelector('.mb.peek');
  assert.ok(peek);
  assert.equal(peek.querySelector('.mb-tag').textContent, 'YENİ MESAJ');
  assert.match(peek.querySelector('.mb-who').textContent, /Ann#0042/);
  assert.ok(peek.querySelector('.lvb'));
  assert.equal(peek.querySelector('.mb-text').textContent, '<hi>');
  assert.equal(layouts(d).at(-1).place, 'corner');
  assert.equal(d.window.Messages.peek().kind, 'message');
  // my own messages and friends whose chat is open don't pop up
  M(d).event({ type: 'message', with: 'f1', message: { id: 2, body: 'mine', at: today, mine: true } });
  M(d).showing(['f2']);
  M(d).event({ type: 'message', with: 'f2', message: { id: 3, body: 'x', at: today } });
  assert.equal(d.sfx.length, 1);
  d.click(peek.querySelector('[data-act="close"]'));
  assert.ok(peek.classList.contains('out'));
  assert.equal(d.sent('leaving').length, 1);
  d.tick(200);
  assert.equal(box(d).innerHTML, '');
  assert.deepEqual({ ...layouts(d).at(-1) }, { type: 'layout', w: 0, h: 0, via: 'messages' });
  assert.equal(d.window.Messages.peek(), null);
});

test('notices: the quick reply sends, marks read, and reports failure', async (t) => {
  let fail = null;
  const d = boot('notices', { send: (b) => (fail ? { error: fail } : { message: { id: 9, body: b.body } }) });
  t.after(d.close);
  await d.flush();
  M(d).event({ type: 'message', with: 'f1', message: { id: 1, body: 'hey', at: today } });
  const ta = box(d).querySelector('textarea'), send = box(d).querySelector('.send');
  assert.ok(send.disabled);
  d.type(ta, 'hello');
  assert.ok(!send.disabled);
  d.fire(ta, 'keydown', { key: 'Enter', shiftKey: true });
  assert.equal(ta.value, 'hello');
  d.fire(ta, 'keydown', { key: 'Enter' });
  await d.flush();
  assert.ok(d.calls.includes('POST v1/messages/read'));
  assert.ok(d.calls.includes('POST v1/messages'));
  assert.deepEqual(d.posted.find((m) => m.path === 'v1/messages').body, { to: 'f1', body: 'hello' });
  assert.ok(d.sfx.includes('send'));
  // failing: offline, then not friends
  d.tick(300);
  fail = 'offline';
  M(d).event({ type: 'message', with: 'f2', message: { id: 2, body: 'again', at: today } });
  d.type(box(d).querySelector('textarea'), 'ok');
  d.click(box(d).querySelector('[data-act="send"]'));
  await d.flush();
  assert.equal(d.sent('log', 'messages').at(-1).msg, 'gönderilmedi · çevrimdışısın');
  d.tick(300);
  fail = 'not_friends';
  M(d).event({ type: 'message', with: 'f2', message: { id: 3, body: 'again', at: today } });
  d.type(box(d).querySelector('textarea'), 'ok');
  d.click(box(d).querySelector('[data-act="send"]'));
  await d.flush();
  assert.equal(d.sent('log', 'messages').at(-1).msg, 'gönderilmedi · artık arkadaş değilsiniz');
  // an empty reply does nothing
  d.tick(300);
  M(d).event({ type: 'message', with: 'f2', message: { id: 4, body: 'x', at: today } });
  d.click(box(d).querySelector('[data-act="send"]'));
  assert.ok(box(d).querySelector('.peek:not(.out)'));
});

test('notices: a reply being written stays; the same friend writing again updates it; others wait', async (t) => {
  const d = boot('notices');
  t.after(d.close);
  await d.flush();
  M(d).event({ type: 'message', with: 'f1', message: { id: 1, body: 'one', at: today } });
  const ta = box(d).querySelector('textarea');
  d.type(ta, 'writing');
  M(d).event({ type: 'message', with: 'f1', message: { id: 2, body: 'two', at: today } });
  assert.equal(box(d).querySelector('.mb-text').textContent, 'two');
  assert.equal(box(d).querySelector('textarea'), ta);
  // another friend's message waits behind
  M(d).event({ type: 'message', with: 'f2', message: { id: 3, body: 'from bob', at: today } });
  assert.equal(box(d).querySelector('.mb-text').textContent, 'two');
  // the time passes; it stays while there's text
  d.tick(12_000 + 3000);
  assert.equal(box(d).querySelector('.mb-text').textContent, 'two');
  d.type(ta, '');
  ta.blur();
  d.window.document.hasFocus = () => false;
  d.tick(3000);
  d.tick(200);
  assert.equal(box(d).querySelector('.mb-text').textContent, 'from bob');
  // Escape hides it
  d.key('Escape');
  d.tick(200);
  assert.equal(box(d).innerHTML, '');
});

test('notices: do not disturb keeps the sound but no pop-up', async (t) => {
  const s = social();
  s.me.status = 'dnd';
  const d = boot('notices', { social: s });
  t.after(d.close);
  await d.flush();
  M(d).event({ type: 'message', with: 'f1', message: { id: 1, body: 'x', at: today } });
  M(d).event({ type: 'request', request: { id: 'r1', from: { id: 'u', name: 'U', tag: 1 } } });
  M(d).event({ type: 'friend', accepted: true, friend: { id: 'f9', name: 'N', tag: 2 } });
  M(d).event({ type: 'notification', notification: { id: 'n', title: 'T' } });
  M(d).update({ version: '2.0' });
  assert.deepEqual(d.sfx, ['message', 'request', 'friend', 'request']);
  assert.equal(box(d).innerHTML, '');
});

test('notices: a friend request, accepted or declined from the pop-up', async (t) => {
  let accept = { friend: { id: 'u1', name: 'Una', tag: 5 } };
  const d = boot('notices', { routes: { 'POST v1/friends/requests/r1/accept': () => accept, 'DELETE v1/friends/requests/r2': () => ({ ok: true }) } });
  t.after(d.close);
  await d.flush();
  M(d).event({ type: 'request', request: { id: 'r1', from: { id: 'u1', name: 'Una', tag: 5 }, at: today } });
  assert.equal(box(d).querySelector('.mb-tag').textContent, 'ARKADAŞLIK İSTEĞİ');
  assert.match(box(d).querySelector('.mb-text').textContent, /Una#0005 arkadaşın olmak istiyor/);
  // an error leaves the button usable
  accept = { error: 'offline' };
  const btn = box(d).querySelector('[data-act="accept"]');
  d.click(btn);
  await d.flush();
  assert.ok(!btn.disabled);
  accept = { friend: { id: 'u1', name: 'Una', tag: 5 } };
  d.click(btn);
  await d.flush();
  assert.ok(d.sfx.includes('accept'));
  assert.equal(d.sent('openChat', 'cloud').at(-1).id, 'u1');
  d.tick(200);
  M(d).event({ type: 'request', request: { id: 'r2', from: { id: 'u2', name: 'Vic', tag: 6 } } });
  d.click(box(d).querySelector('[data-act="decline"]'));
  await d.flush();
  assert.ok(d.sfx.includes('decline'));
  d.tick(200);
  // a request taken back while on screen goes
  M(d).event({ type: 'request', request: { id: 'r3', from: { id: 'u3', name: 'W', tag: 7 } } });
  M(d).event({ type: 'request_gone', id: 'nope' });
  assert.ok(box(d).querySelector('.peek:not(.out)'));
  M(d).event({ type: 'request_gone', id: 'r3' });
  assert.ok(box(d).querySelector('.peek.out'));
});

test('notices: a new friend, a developer notice, an update, an updated app', async (t) => {
  const d = boot('notices');
  t.after(d.close);
  await d.flush();
  M(d).event({ type: 'friend', accepted: false, friend: { id: 'x', name: 'X', tag: 1 } });
  assert.equal(box(d).innerHTML, '');
  M(d).event({ type: 'friend', accepted: true, friend: { id: 'f9', name: 'Nia', tag: 2 } });
  assert.equal(box(d).querySelector('.mb-tag').textContent, 'YENİ ARKADAŞ');
  d.click(box(d).querySelector('[data-act="open"]'));
  assert.equal(d.sent('openChat', 'cloud').at(-1).id, 'f9');
  d.tick(200);
  M(d).event({ type: 'notification', notification: { id: 'n1', title: 'Big <news>', body: 'y'.repeat(150) } });
  const note = box(d).querySelector('.mb.note');
  assert.equal(note.querySelector('.mb-who span').textContent, 'Big <news>');
  assert.equal(note.querySelector('small').textContent, 'y'.repeat(110) + '…');
  d.click(note);
  assert.equal(d.sent('openNotifications').length, 1);
  d.tick(200);
  M(d).event({ type: 'notification', notification: { id: 'n2', title: 'Short' } });
  assert.equal(box(d).querySelector('.mb.note small').textContent, 'geliştiriciden ›');
  d.tick(30_000);
  d.tick(200);
  assert.equal(box(d).innerHTML, '');
  // update: shows; clicking asks the dashboard
  M(d).update({ version: '2.1' });
  assert.match(box(d).textContent, /2\.1 sürümü çıktı/);
  d.click(box(d).querySelector('[data-act="update"]'));
  assert.equal(d.sent('openUpdate').length, 1);
  d.tick(200);
  M(d).update(null);
  M(d).updated('2.1');
  assert.match(box(d).textContent, /Artık 2\.1 sürümündesin/);
  d.click(box(d).querySelector('.mb.update'));
  d.tick(200);
  // an update while a message is on screen waits for it
  M(d).event({ type: 'message', with: 'f1', message: { id: 1, body: 'm', at: today } });
  M(d).update({ version: '3.0' });
  assert.equal(box(d).querySelector('.mb-tag').textContent, 'YENİ MESAJ');
  d.click(box(d).querySelector('[data-act="close"]'));
  d.tick(200);
  assert.match(box(d).textContent, /3\.0 sürümü çıktı/);
  // the message's text and its ⤢ open the chat
  d.tick(12_000);
  d.tick(200);
  M(d).event({ type: 'message', with: 'f1', message: { id: 2, body: 'm', at: today } });
  d.click(box(d).querySelector('.mb-expand'));
  assert.equal(d.sent('openChat', 'cloud').at(-1).id, 'f1');
});

test('notices: a friend coming online, alone and together; not after a short drop', async (t) => {
  const d = boot('notices');
  t.after(d.close);
  await d.flush();
  // went offline just now: back soon isn't news
  M(d).event({ type: 'presence', id: 'f3', presence: 'offline' });
  M(d).event({ type: 'presence', id: 'f3', presence: 'online' });
  assert.equal(box(d).innerHTML, '');
  // never seen offline here: news
  M(d).event({ type: 'presence', id: 'f2', presence: 'online' });
  assert.ok(d.sfx.includes('online'));
  let strip = box(d).querySelector('.mb.online');
  assert.match(strip.textContent, /Bob#0003/);
  assert.match(strip.textContent, /şimdi çevrimiçi/);
  // an away change isn't news
  M(d).event({ type: 'presence', id: 'f2', presence: 'idle' });
  // a stranger isn't either
  M(d).event({ type: 'presence', id: 'zz', presence: 'online' });
  // another friend joins the strip
  d.snap.friends.push({ id: 'f4', name: 'Dee', tag: 8, presence: 'offline' });
  M(d).event({ type: 'presence', id: 'f4', presence: 'online' });
  strip = box(d).querySelector('.mb.online');
  assert.match(strip.textContent, /Dee#0008/);
  assert.match(strip.textContent, /ve 1 kişi daha çevrimiçi/);
  d.click(strip);
  assert.equal(d.sent('openChat', 'cloud').at(-1).id, 'f4');
  d.tick(200);
  // a message on screen isn't covered by one
  M(d).event({ type: 'message', with: 'f1', message: { id: 1, body: 'm', at: today } });
  d.snap.friends.push({ id: 'f5', name: 'Eve', tag: 9, presence: 'offline' });
  M(d).event({ type: 'presence', id: 'f5', presence: 'online' });
  assert.equal(box(d).querySelector('.mb-tag').textContent, 'YENİ MESAJ');
});

test('progress: the daily bonus strip; a level-up takeover when in front; skip after the lock', async (t) => {
  const d = boot('notices', { storage: { xpLevel: '14' } });
  t.after(d.close);
  await d.flush();
  M(d).event({ type: 'xp', reason: 'daily', gained: 50, xp: { level: 14 } });
  assert.match(box(d).querySelector('.mb.xp').textContent, /\+50 XP.*seviye 14/);
  assert.deepEqual(d.sfx, ['xp']);
  d.tick(6000);
  d.tick(200);
  assert.equal(box(d).innerHTML, '');
  // a level gained while the app is behind waits
  M(d).xp({ level: 15 });
  assert.equal(d.$('#takeover'), null);
  assert.equal(d.window.localStorage.getItem('xpLevel'), '15');
  M(d).focus(true);
  d.tick(350);
  const tk = d.$('#takeover');
  assert.ok(tk);
  assert.ok(tk.classList.contains('rank')); // Genin → Chunin
  assert.ok(tk.querySelector('.tk-band'));
  assert.equal(layouts(d).at(-1).place, 'screen');
  assert.equal(d.sent('lock').at(-1).ms, 3500);
  assert.ok(d.sfx.includes('glitch'));
  // a skip during the lock does nothing
  M(d).skip();
  d.tick(10);
  assert.ok(!tk.classList.contains('out'));
  d.tick(1000);
  assert.match(tk.querySelector('.tk-log').textContent, /SİSTEME SIZILDI[\s\S]*operatör neo#0001[\s\S]*rütbe GENİN → CHUNİN/);
  assert.equal(tk.querySelector('.tk-title span').textContent, 'RÜTBE ATLADIN');
  assert.ok(tk.querySelector('.tk-title').classList.contains('on'));
  assert.ok(d.sfx.includes('rankup'));
  assert.ok(d.drawn.length > 0); // confetti drew
  d.tick(2500);
  assert.ok(tk.classList.contains('free'));
  assert.equal(d.sent('lock').at(-1).ms, 0);
  // a daily bonus during the takeover waits for its end
  M(d).event({ type: 'xp', reason: 'daily', gained: 10, xp: { level: 15 } });
  assert.equal(box(d).innerHTML, '');
  tk.dispatchEvent(new d.window.MouseEvent('mousedown', { bubbles: true }));
  assert.ok(tk.classList.contains('out'));
  d.tick(500);
  assert.equal(d.$('#takeover'), null);
  assert.match(box(d).textContent, /\+10 XP/);
});

test('progress: a plain level-up reads its time and leaves by itself; dnd holds it', async (t) => {
  const s = social();
  s.me.status = 'dnd';
  const d = boot('notices', { storage: { xpLevel: '5' }, social: s });
  t.after(d.close);
  await d.flush();
  M(d).focus(true);
  M(d).xp({ level: 6 });
  d.tick(400);
  assert.equal(d.$('#takeover'), null);
  // do not disturb ends: it plays
  M(d).event({ type: 'status', status: 'online' });
  const tk = d.$('#takeover');
  assert.ok(tk.classList.contains('level'));
  assert.equal(d.sent('lock').at(-1).ms, 2500);
  d.tick(1500);
  assert.equal(tk.querySelector('.tk-sub').textContent, 'SEVİYE 6');
  assert.equal(tk.querySelector('.tk-lv').textContent, 'GENİN');
  assert.ok(d.sfx.includes('levelup'));
  d.tick(11_000);
  assert.equal(d.$('#takeover'), null);
  // a first level ever seen doesn't play
  const d2 = boot('notices');
  t.after(d2.close);
  await d2.flush();
  M(d2).focus(true);
  M(d2).xp({ level: 30 });
  d2.tick(1000);
  assert.equal(d2.$('#takeover'), null);
  assert.equal(d2.window.localStorage.getItem('xpLevel'), '30');
});

test('progress: five hours in a day sets the screen on fire, once a day', async (t) => {
  const d = boot('notices');
  t.after(d.close);
  await d.flush();
  M(d).xp({ level: 3, today: 5 * 3600 });
  // not in the first 3 s
  assert.equal(d.burns.length, 0);
  d.tick(3000);
  assert.equal(d.burns.length, 1);
  assert.equal(d.burns[0].life, 7000);
  assert.deepEqual([...d.burns[0].reach()].length, 3);
  assert.ok(d.$('canvas.fire-edges'));
  assert.ok(d.sfx.includes('fire'));
  assert.match(box(d).textContent, /ALEV ALDIN/);
  assert.equal(layouts(d).at(-1).place, 'fire');
  assert.equal(d.window.localStorage.getItem('fireDay'), new Date().toLocaleDateString('sv'));
  d.click(box(d).querySelector('[data-act="profile"]'));
  assert.equal(d.sent('openProfile').length, 1);
  d.tick(7000);
  assert.equal(d.burns.at(-1), 'stopped');
  assert.equal(d.$('canvas.fire-edges'), null);
  // again today: nothing
  M(d).xp({ level: 3, today: 6 * 3600 });
  d.tick(4000);
  assert.equal(d.burns.filter((b) => b !== 'stopped').length, 1);
});

test('danger alarm: runaways, ignore, details, gone', async (t) => {
  const d = boot('notices');
  t.after(d.close);
  await d.flush();
  const a = { pid: 1, started: 10, cpu: 97.6 }, b = { pid: 2, started: 20, cpu: 50 };
  M(d).runaways([a]);
  const dg = d.$('#dangerbox .dg');
  assert.ok(dg.classList.contains('in'));
  assert.equal(dg.querySelector('.dg-line').textContent, '1 işlem %98 CPU kullanıyor');
  assert.ok(d.document.body.classList.contains('danger-on'));
  assert.deepEqual(d.sfx, ['alarm']);
  assert.equal(layouts(d).at(-1).place, 'center');
  // the same list again: no new sound
  M(d).runaways([a]);
  assert.equal(d.sfx.length, 1);
  // notices wait under the alarm
  M(d).event({ type: 'request', request: { id: 'r', from: { id: 'u', name: 'U', tag: 1 } } });
  assert.equal(box(d).innerHTML, '');
  M(d).runaways([a, b]);
  assert.equal(d.$('#dangerbox .dg-line').textContent, "2 işlem CPU'yu yakıyor, en çok %98");
  assert.equal(d.sfx.filter((x) => x === 'alarm').length, 2);
  d.click('#dangerbox [data-act="dg-ignore"]');
  assert.equal(d.$('#dangerbox').innerHTML, '');
  assert.ok(!d.document.body.classList.contains('danger-on'));
  // the request waited and shows now
  assert.match(box(d).textContent, /ARKADAŞLIK İSTEĞİ/);
  // ignored ones stay quiet; a new one rings
  M(d).runaways([a, b]);
  assert.equal(d.$('#dangerbox').innerHTML, '');
  const c = { pid: 3, started: 30, cpu: 80 };
  M(d).runaways([a, b, c]);
  assert.match(d.$('#dangerbox .dg-line').textContent, /1 işlem %80/);
  d.click('#dangerbox .dg');
  d.click('#dangerbox [data-act="dg-show"]');
  assert.equal(d.sent('openDanger').length, 1);
  M(d).runaways([c]);
  M(d).runaways([c]);
  M(d).runaways([]);
  assert.equal(d.$('#dangerbox').innerHTML, '');
  M(d).runaways('nope');
});

test('copy and paste in the panels', async (t) => {
  const d = boot('notices');
  t.after(d.close);
  await d.flush();
  assert.equal(M(d).paste('x'), false);
  M(d).event({ type: 'message', with: 'f1', message: { id: 1, body: 'body text', at: today } });
  const ta = box(d).querySelector('textarea');
  ta.focus();
  assert.equal(M(d).paste(''), false);
  assert.equal(M(d).paste('hello world'), true);
  assert.equal(ta.value, 'hello world');
  assert.ok(!box(d).querySelector('.send').disabled);
  ta.setSelectionRange(0, 5);
  assert.equal(M(d).copy(false), 'hello');
  assert.equal(ta.value, 'hello world');
  ta.setSelectionRange(0, 6);
  assert.equal(M(d).copy(true), 'hello ');
  assert.equal(ta.value, 'world');
  M(d).selectAll();
  assert.equal(ta.selectionStart, 0);
  assert.equal(ta.selectionEnd, 5);
  ta.blur();
  assert.equal(M(d).copy(false), '');
  M(d).selectAll(); // no list here: nothing
});

test('chat: opens the friend, loads history by day, sends and fills in the answer', async (t) => {
  const yesterday = new Date(Date.now() - 864e5).toISOString();
  const d = boot('chat', {
    friend: 'f1',
    routes: { 'GET v1/messages/f1': () => ({ messages: [{ id: 1, body: 'old', at: '2025-03-04T10:00:00Z' }, { id: 2, body: 'y', at: yesterday, mine: true }, { id: 3, body: 't', at: today }], more: true }), 'GET v1/messages/f1?before=1': () => ({ messages: [{ id: 0, body: 'older', at: '2025-03-04T09:00:00Z' }], more: false }) },
  });
  t.after(d.close);
  await d.flush();
  assert.equal(d.$('#msgbox'), null);
  assert.equal(d.window.Messages.canChat, true);
  await M(d).open();
  await d.flush();
  const win = d.$('#chatwin');
  assert.ok(win.querySelector('.mb.open.chat'));
  assert.match(win.querySelector('.mb-who').textContent, /Ann#0042/);
  assert.equal(win.querySelector('.mb-sub').textContent, 'çevrimiçi');
  assert.ok(win.querySelector('.mb-gone').hidden);
  assert.equal(d.sent('showing').at(-1).id, 'f1');
  assert.equal(layouts(d).at(-1).focus, true);
  const days = [...win.querySelectorAll('.mb-day')].map((e) => e.textContent);
  assert.equal(days.length, 3);
  assert.deepEqual(days.slice(1), ['DÜN', 'BUGÜN']);
  assert.equal(win.querySelectorAll('.mb-msg').length, 3);
  assert.ok(win.querySelectorAll('.mb-msg')[1].classList.contains('mine'));
  assert.ok(d.calls.includes('POST v1/messages/read'));
  // the switcher lists other unread chats
  const sw = win.querySelectorAll('.mb-switch button');
  assert.equal(sw.length, 1);
  assert.match(sw[0].textContent, /Bob 2/);
  // another friend's chat opens in a panel of its own
  d.click(sw[0]);
  assert.equal(d.sent('openChat', 'messages').at(-1).id, 'f2');
  // older messages
  d.click(win.querySelector('[data-act="more"]'));
  await d.flush();
  assert.equal(win.querySelectorAll('.mb-msg').length, 4);
  assert.equal(win.querySelector('.mb-more'), null);
  // send
  const ta = win.querySelector('textarea');
  assert.equal(ta.placeholder, 'Ann kişisine mesaj…');
  d.type(ta, '  hi there ');
  d.fire(ta, 'keydown', { key: 'Enter' });
  assert.equal(ta.value, '');
  const last = () => [...win.querySelectorAll('.mb-msg')].at(-1);
  assert.ok(last().classList.contains('sending'));
  assert.equal(last().querySelector('.t').textContent, 'gönderiliyor…');
  await d.flush();
  assert.ok(!last().classList.contains('sending'));
  assert.equal(last().querySelector('.b').textContent, 'hi there');
  assert.ok(d.sfx.includes('send'));
  // a live message: shown, read, sound
  M(d).event({ type: 'message', with: 'f1', message: { id: 50, body: 'live', at: today, mine: false } });
  assert.equal(last().querySelector('.b').textContent, 'live');
  assert.ok(d.sfx.includes('message'));
  // the echo of my own message is not doubled
  M(d).event({ type: 'message', with: 'f1', message: { id: 50, body: 'live', at: today } });
  const n = win.querySelectorAll('.mb-msg').length;
  // a message for another friend repaints the switcher
  M(d).event({ type: 'message', with: 'f3', message: { id: 60, body: 'cy', at: today } });
  assert.equal(win.querySelectorAll('.mb-msg').length, n);
  assert.equal(win.querySelectorAll('.mb-switch button').length, 2);
  // close: Escape
  d.key('Escape');
  assert.equal(d.sent('showing').at(-1).id, null);
  d.tick(200);
  assert.equal(win.innerHTML, '');
  d.window.Messages.close();
});

test('chat: failed sends, retries, removed friends, reconnects, dragging', async (t) => {
  let sendErr = 'offline';
  let hist = 0;
  const d = boot('chat', {
    friend: 'f1',
    send: (b) => (sendErr ? { error: sendErr } : { message: { id: 77, body: b.body, at: today, mine: true } }),
    routes: { 'GET v1/messages/f1': () => (hist++ ? { messages: [{ id: 5, body: 'reloaded', at: today }, { id: 77, body: 'first', at: today, mine: true }], more: false } : { messages: [], more: false }) },
  });
  t.after(d.close);
  await d.flush();
  M(d).open('f1');
  await d.flush();
  const win = d.$('#chatwin');
  assert.match(win.querySelector('.mb-empty').textContent, /henüz mesaj yok · Ann kişisine selam ver/);
  const ta = win.querySelector('textarea');
  d.type(ta, 'first');
  d.click(win.querySelector('[data-act="send"]'));
  await d.flush();
  const msg = () => win.querySelector('.mb-msg');
  assert.ok(msg().classList.contains('failed'));
  assert.equal(msg().querySelector('.t').textContent, 'gönderilmedi · tekrar denemek için tıkla');
  // retry by click, still failing, then the line is back ("hello") and it goes
  d.click(msg());
  await d.flush();
  assert.ok(msg().classList.contains('failed'));
  sendErr = null;
  M(d).event({ type: 'hello' });
  await d.flush(10);
  assert.ok(d.calls.filter((c) => c === 'GET v1/messages/f1').length >= 2);
  assert.ok([...win.querySelectorAll('.mb-msg .b')].some((e) => e.textContent === 'reloaded'));
  assert.ok([...win.querySelectorAll('.mb-msg .b')].some((e) => e.textContent === 'first'));
  // not friends: no retry
  sendErr = 'not_friends';
  d.type(ta, 'second');
  d.click(win.querySelector('[data-act="send"]'));
  await d.flush();
  const bad = [...win.querySelectorAll('.mb-msg.failed')].at(-1);
  assert.equal(bad.querySelector('.t').textContent, 'iletilmedi · arkadaş değilsiniz');
  assert.equal(bad.dataset.act, undefined);
  // unfriended: the input goes
  d.window.Social.event({ type: 'unfriended', id: 'f1' });
  assert.ok(!win.querySelector('.mb-gone').hidden);
  assert.ok(ta.disabled);
  assert.equal(ta.placeholder, 'artık arkadaş değilsiniz');
  assert.match(win.querySelector('.mb-who').textContent, /Ann#0042/);
  // dragging by the header
  const head = win.querySelector('.mb-head');
  d.fire(head, 'mousedown', { button: 0, screenX: 10, screenY: 10 });
  assert.ok(win.classList.contains('dragging'));
  d.window.dispatchEvent(new d.window.MouseEvent('mousemove', { screenX: 15, screenY: 12 }));
  d.window.dispatchEvent(new d.window.MouseEvent('mousemove', { screenX: 15, screenY: 12 }));
  d.window.dispatchEvent(new d.window.MouseEvent('mouseup'));
  assert.deepEqual(d.sent('drag').map((m) => [m.dx, m.dy]), [[5, 2]]);
  assert.equal(d.sent('dragEnd').length, 1);
  assert.ok(!win.classList.contains('dragging'));
  // a right button or a button on the header doesn't drag
  d.fire(head, 'mousedown', { button: 2 });
  d.fire(head.querySelector('button'), 'mousedown', { button: 0 });
  assert.ok(!win.classList.contains('dragging'));
  d.click(win.querySelector('[data-act="close"]'));
  d.tick(200);
  assert.equal(win.innerHTML, '');
});

test('chat: without a friend id it opens the one with unread messages; history errors leave it empty', async (t) => {
  const d = boot('chat', { routes: { 'GET v1/messages/f1': () => ({ error: 'offline' }), 'GET v1/messages/f2': () => ({ messages: [], more: false }) } });
  t.after(d.close);
  await d.flush();
  await M(d).open();
  await d.flush();
  assert.match(d.$('#chatwin .mb-who').textContent, /Ann/);
  assert.equal(d.$$('#chatwin .mb-msg').length, 0);
  assert.equal(d.$('#chatwin .mb-empty'), null);
  // opening a stranger does nothing
  await M(d).open('nobody');
  // the notices role's API on a chat panel does nothing
  M(d).update({ version: '1' });
  M(d).runaways([{ pid: 1 }]);
  M(d).xp({ level: 3 });
  assert.equal(d.$('#dangerbox'), null);
  // another panel opening the same chat: in place
  await M(d).open('f2');
  assert.match(d.$('#chatwin .mb-who').textContent, /Bob/);
});
