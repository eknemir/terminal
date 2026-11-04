'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const dc = require('diagnostics_channel');
const realCp = require('child_process');
const { requireWith } = require('../helpers/electron');

const WIN = process.platform === 'win32';
const GUID = '11111111-2222-3333-4444-555555555555';

function load({ reg = `\r\n    MachineGuid    REG_SZ    ${GUID}\r\n`, regCalls = [] } = {}) {
  const cp = {
    ...realCp,
    execFile(file, args, opts, cb) {
      regCalls.push({ file, args });
      const out = typeof reg === 'function' ? reg(args) : reg;
      setImmediate(() => (out instanceof Error ? cb(out, '') : cb(null, out)));
    },
  };
  return requireWith('windows/src/cloud.js', { 'node:child_process': cp });
}

// The API: routes -> (body, req) => [status, json|string, headers]
function api(routes) {
  const calls = [];
  const fetch = async (url, opts) => {
    const u = new URL(url);
    const key = `${opts.method} ${u.pathname.replace(/^\//, '')}`;
    const body = opts.body === undefined ? undefined : JSON.parse(opts.body);
    calls.push({ key, url, opts, body });
    const r = routes[key];
    if (r === undefined) return res(404, { error: 'not_found' });
    if (r instanceof Error) throw r;
    const [status, json, headers] = typeof r === 'function' ? await r(body, { url, opts, calls }) : r;
    return res(status, json, headers);
  };
  return { fetch, calls };
}
function res(status, json, headers = {}) {
  return { status, headers: { get: (k) => headers[k.toLowerCase()] ?? null }, text: async () => (typeof json === 'string' ? json : JSON.stringify(json)) };
}
const dir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'atl-cloud-'));
const tokenFile = (d, host = 'api.test') => path.join(d, `device-token-${host}`);
const tick = (n = 5) => new Promise((r) => { let i = 0; const go = () => (++i >= n ? r() : setImmediate(go)); setImmediate(go); });

class FakeWS {
  constructor(url) {
    this.url = url;
    this.sent = [];
    this.readyState = FakeWS.OPEN;
    this.closed = 0;
    FakeWS.made.push(this);
  }
  send(s) { this.sent.push(JSON.parse(s)); }
  close() { this.closed++; }
}
FakeWS.OPEN = 1;
FakeWS.made = [];

function make(routes, extra = {}, loadOpts) {
  const d = extra.dataDir || dir();
  const a = api(routes);
  const { createCloud } = load(loadOpts);
  const changes = [], social = [];
  const c = createCloud({ dataDir: d, apiBase: 'https://api.test', fetch: a.fetch, version: '1.2.3', onChange: (s) => changes.push(s), onSocial: (t) => social.push(t), ...extra });
  return { c, a, d, changes, social };
}
const quiet = async (fn) => {
  const o = { e: console.error, w: console.warn };
  console.error = () => {};
  console.warn = () => {};
  try { return await fn(); } finally { console.error = o.e; console.warn = o.w; }
};

test('createCloud: dataDir required', () => {
  const { createCloud } = load();
  assert.throws(() => createCloud({}), /dataDir is required/);
});

test('json(): defaults, offline launch shows the last known name, tag and XP', () => {
  const d = dir();
  fs.writeFileSync(path.join(d, 'cloud.json'), JSON.stringify({ hackerName: 'neo', hackerTag: 42, xp: { level: 3 }, updateRightAway: true }));
  const { c } = make({}, { dataDir: d });
  assert.deepEqual(c.json(), {
    reachable: false, registered: null, hackerName: 'neo', tag: 42, online: 0, version: '1.2.3', build: 0,
    update: null, updating: null, updateError: null, nameError: null, updateReady: false, updateRightAway: true,
    checking: false, checkedAt: null, xpPaused: false, xp: { level: 3 },
  });
  // a pending name wins; junk settings ignored
  fs.writeFileSync(path.join(d, 'cloud.json'), JSON.stringify({ hackerName: 'neo', pendingHackerName: 'trin', hackerTag: 'x', xp: 5 }));
  const s = make({}, { dataDir: d }).c.json();
  assert.equal(s.hackerName, 'trin');
  assert.equal(s.tag, null);
  assert.equal(s.xp, null);
  fs.writeFileSync(path.join(d, 'cloud.json'), '[1]');
  assert.equal(make({}, { dataDir: d }).c.json().hackerName, null);
  fs.writeFileSync(path.join(d, 'cloud.json'), '{bad');
  assert.equal(make({}, { dataDir: d }).c.json().hackerName, null);
  fs.writeFileSync(path.join(d, 'cloud.json'), JSON.stringify({ hackerName: 7 }));
  assert.equal(make({}, { dataDir: d }).c.json().hackerName, null);
  // version cleaned
  assert.equal(make({}, { version: '<b>1.0</b>' }).c.json().version, 'b1.0b');
  assert.equal(make({}, { version: '<>' }).c.json().version, 'dev');
  assert.equal(make({}, { version: undefined }).c.json().version, 'dev');
});

test('first launch: identify unknown -> registered false; register -> token, heartbeat, signed in', async () => {
  const regCalls = [];
  let hb = 0;
  const { c, a, d, changes } = make({
    'POST v1/devices/identify': [200, { known: false }],
    'POST v1/devices': (b) => [201, { token: 'tok', hackerName: b.hackerName, tag: 7 }],
    'POST v1/heartbeat': () => { hb++; return [200, { hackerName: 'neo', tag: 7, online: 12, xp: { level: 1 }, xpPaused: true }]; },
    'POST v1/live/ticket': [200, { ticket: 't1' }],
  }, {}, { regCalls });
  const ws = globalThis.WebSocket;
  globalThis.WebSocket = FakeWS;
  try {
    c.start();
    await tick(20);
    assert.equal(c.json().registered, false);
    assert.equal(c.json().reachable, true);
    const id = a.calls[0];
    assert.equal(id.key, 'POST v1/devices/identify');
    if (WIN) {
      assert.equal(id.body.deviceHash, crypto.createHash('sha256').update('atalay-terminal/device/v1:' + GUID).digest('hex'));
      assert.match(regCalls[0].file, /reg\.exe$/i);
      assert.deepEqual(regCalls[0].args, ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid', '/reg:64']);
    }
    assert.equal(id.body.appVersion, '1.2.3');
    assert.match(id.body.osVersion, /\S/);
    assert.equal(id.opts.headers['content-type'], 'application/json');
    assert.equal(id.opts.headers.authorization, undefined);
    assert.equal(id.opts.headers['x-at-key'], undefined, 'unsigned without a client key');
    const r = await c.handle({ type: 'register', name: 'neo' });
    assert.deepEqual(r, { error: null });
    assert.equal(fs.readFileSync(tokenFile(d), 'utf8'), 'tok');
    assert.equal(hb, 1);
    const s = c.json();
    assert.equal(s.registered, true);
    assert.equal(s.hackerName, 'neo');
    assert.equal(s.tag, 7);
    assert.equal(s.online, 12);
    assert.equal(s.xpPaused, true);
    assert.deepEqual(s.xp, { level: 1 });
    assert.ok(changes.length >= 2);
    const hbCall = a.calls.find((x) => x.key === 'POST v1/heartbeat');
    assert.equal(hbCall.opts.headers.authorization, 'Bearer tok');
    assert.equal(hbCall.body.theme, 'atalay');
    assert.equal(typeof hbCall.body.tz, 'number');
    assert.equal(hbCall.body.active, false);
    // kept for an offline launch
    const saved = JSON.parse(fs.readFileSync(path.join(d, 'cloud.json'), 'utf8'));
    assert.equal(saved.hackerName, 'neo');
    assert.equal(saved.hackerTag, 7);
    // the live socket opened with the ticket
    await tick(10);
    assert.equal(FakeWS.made.at(-1).url, 'wss://api.test/v1/live?ticket=t1');
  } finally {
    c.stop();
    globalThis.WebSocket = ws;
  }
});

test('heartbeat: offline -> unreachable; 401 -> token dropped and identify; unexpected answer', async () => {
  const d = dir();
  fs.writeFileSync(tokenFile(d), 'old\n');
  let mode = 'offline';
  let ids = 0;
  const { c, a } = make({
    'POST v1/heartbeat': (b, { opts }) => (mode === 'offline' ? [503, 'down'] : mode === '401' && opts.headers.authorization === 'Bearer old' ? [401, { error: 'bad_token' }]
      : mode === '401' ? [200, { hackerName: 'back', tag: 2, online: 1 }] : [200, { hackerName: 1 }]),
    'POST v1/devices/identify': () => { ids++; return [200, { known: true, token: 'new' }]; },
  }, { dataDir: d });
  await c.handle({ type: 'checkUpdate' });
  assert.equal(c.json().reachable, false);
  assert.ok(c.json().checkedAt > 0);
  assert.equal(c.json().checking, false);
  mode = 'weird';
  await c.handle({ type: 'checkUpdate' });
  assert.equal(c.json().reachable, false);
  mode = '401';
  await quiet(() => c.handle({ type: 'checkUpdate' }));
  assert.equal(ids, 1);
  assert.equal(fs.readFileSync(tokenFile(d), 'utf8'), 'new');
  assert.equal(c.json().hackerName, 'back');
  assert.deepEqual(a.calls.map((x) => x.key).slice(-3), ['POST v1/heartbeat', 'POST v1/devices/identify', 'POST v1/heartbeat']);
});

test('a fresh token the heartbeat also refuses is not retried without end', async () => {
  const d = dir();
  fs.writeFileSync(tokenFile(d), 'old');
  let ids = 0;
  const { c } = make({
    'POST v1/heartbeat': [401, {}],
    'POST v1/devices/identify': () => (++ids > 50 ? [500, {}] : [200, { known: true, token: 'new' }]), // the guard stops the loop here
  }, { dataDir: d });
  await quiet(() => c.handle({ type: 'checkUpdate' }));
  assert.ok(ids <= 2, `identify called ${ids} times in one heartbeat`);
});

test('identify: known with token signs in; failure unreachable; a name picked offline registers', async () => {
  const d = dir();
  const { c } = make({
    'POST v1/devices/identify': [200, { known: true, token: 'tk' }],
    'POST v1/heartbeat': [200, { hackerName: 'a', tag: 1, online: 2 }],
  }, { dataDir: d });
  await c.handle({ type: 'checkUpdate' });
  assert.equal(fs.readFileSync(tokenFile(d), 'utf8'), 'tk');
  assert.equal(c.json().registered, true);
  // identify answering junk
  const j = make({ 'POST v1/devices/identify': [200, { known: 'yes' }] });
  await j.c.handle({ type: 'checkUpdate' });
  assert.equal(j.c.json().reachable, false);
  const k = make({ 'POST v1/devices/identify': [200, 'not json'] });
  await k.c.handle({ type: 'checkUpdate' });
  assert.equal(k.c.json().reachable, false);
  // pending name, unknown device: registered with it; refused -> nameError
  const d2 = dir();
  fs.writeFileSync(path.join(d2, 'cloud.json'), JSON.stringify({ pendingHackerName: 'taken' }));
  const p = make({
    'POST v1/devices/identify': [200, { known: false }],
    'POST v1/devices': [409, { error: 'name_full' }],
  }, { dataDir: d2 });
  await p.c.handle({ type: 'checkUpdate' });
  assert.equal(p.c.json().nameError, 'name_full');
  assert.equal(p.c.json().registered, false);
  assert.equal(JSON.parse(fs.readFileSync(path.join(d2, 'cloud.json'), 'utf8')).pendingHackerName, undefined);
});

test('register: device_exists signs in and keeps the name; offline queues; other errors; bad answer', async () => {
  const d = dir();
  let identified = 0;
  const r1 = make({
    'POST v1/devices': [409, { error: 'device_exists' }],
    'POST v1/devices/identify': () => { identified++; return [200, { known: true, token: 'tok2' }]; },
    'PATCH v1/me': (b) => [200, { hackerName: b.hackerName, tag: 9 }],
    'POST v1/heartbeat': [200, { hackerName: 'old', tag: 1, online: 1 }],
  }, { dataDir: d });
  assert.deepEqual(await r1.c.handle({ type: 'register', name: 'fresh' }), { error: null });
  assert.equal(identified, 1);
  assert.equal(r1.c.json().hackerName, 'fresh');
  assert.equal(r1.c.json().tag, 9);
  // offline
  const r2 = make({ 'POST v1/devices': new TypeError('fetch failed') });
  assert.deepEqual(await r2.c.handle({ type: 'register', name: 'q' }), { error: null, queued: true });
  assert.equal(r2.c.json().hackerName, 'q');
  assert.equal(r2.c.json().reachable, false);
  assert.equal(JSON.parse(fs.readFileSync(path.join(r2.d, 'cloud.json'), 'utf8')).pendingHackerName, 'q');
  // refused
  const r3 = make({ 'POST v1/devices': [400, { error: 'bad_name' }] });
  assert.deepEqual(await r3.c.handle({ type: 'register', name: '!!' }), { error: 'bad_name' });
  const r4 = make({ 'POST v1/devices': [500, 'x'] });
  assert.deepEqual(await r4.c.handle({ type: 'register', name: 'x' }), { error: 'failed' });
  // a 2xx with a bad body: no status -> queued
  const r5 = make({ 'POST v1/devices': [200, { token: 1 }] });
  assert.deepEqual(await r5.c.handle({ type: 'register' }), { error: null, queued: true });
});

test('rename: offline or signed out queues; saved; refused; server error queues', async () => {
  const s = make({});
  assert.deepEqual(await s.c.handle({ type: 'rename', name: 'n' }), { error: null, queued: true });
  const d = dir();
  fs.writeFileSync(tokenFile(d), 'tok');
  let patch = [200, { hackerName: 'Neo', tag: 3 }];
  const r = make({ 'POST v1/heartbeat': [200, { hackerName: 'a', tag: 1, online: 0 }], 'PATCH v1/me': () => patch }, { dataDir: d });
  await r.c.handle({ type: 'checkUpdate' });
  assert.deepEqual(await r.c.handle({ type: 'rename', name: 'neo' }), { error: null });
  assert.equal(r.c.json().hackerName, 'Neo');
  assert.equal(r.c.json().tag, 3);
  patch = [409, { error: 'name_taken' }];
  assert.deepEqual(await r.c.handle({ type: 'rename', name: 'x' }), { error: 'name_taken' });
  patch = [400, 'nojson'];
  assert.deepEqual(await r.c.handle({ type: 'rename', name: 'x' }), { error: 'failed' });
  patch = [500, {}];
  assert.deepEqual(await r.c.handle({ type: 'rename', name: 'later' }), { error: null, queued: true });
  patch = [401, {}];
  assert.deepEqual(await r.c.handle({ type: 'rename', name: 'later2' }), { error: null, queued: true });
  patch = [200, { hackerName: 'z' }];
  assert.deepEqual(await r.c.handle({ type: 'rename', name: 'later3' }), { error: null, queued: true });
  assert.equal(r.c.json().hackerName, 'later3');
});

test('heartbeat sends a name picked offline: saved, refused, or kept', async () => {
  const d = dir();
  fs.writeFileSync(tokenFile(d), 'tok');
  fs.writeFileSync(path.join(d, 'cloud.json'), JSON.stringify({ pendingHackerName: 'p1', hackerTag: 5 }));
  let patch = [200, { hackerName: 'P1', tag: 8 }];
  const r = make({ 'POST v1/heartbeat': [200, { hackerName: 'srv', tag: 1, online: 4 }], 'PATCH v1/me': () => patch }, { dataDir: d });
  await r.c.handle({ type: 'checkUpdate' });
  assert.equal(r.c.json().hackerName, 'P1');
  assert.equal(r.c.json().tag, 8);
  assert.equal(JSON.parse(fs.readFileSync(path.join(d, 'cloud.json'), 'utf8')).pendingHackerName, undefined);
  fs.writeFileSync(path.join(d, 'cloud.json'), JSON.stringify({ pendingHackerName: 'p2' }));
  const r2 = make({ 'POST v1/heartbeat': [200, { hackerName: 'srv', tag: 1, online: 4 }], 'PATCH v1/me': [409, { error: 'name_full' }] }, { dataDir: d });
  await r2.c.handle({ type: 'checkUpdate' });
  assert.equal(r2.c.json().nameError, 'name_full');
  assert.equal(r2.c.json().hackerName, 'srv');
  fs.writeFileSync(path.join(d, 'cloud.json'), JSON.stringify({ pendingHackerName: 'p3', hackerTag: 6 }));
  const r3 = make({ 'POST v1/heartbeat': [200, { hackerName: 'srv', tag: 1, online: 4 }], 'PATCH v1/me': [503, {}] }, { dataDir: d });
  await r3.c.handle({ type: 'checkUpdate' });
  assert.equal(r3.c.json().hackerName, 'p3');
  assert.equal(r3.c.json().tag, 6, 'the tag known so far');
});

test('heartbeat: theme only when valid; isActive/theme throwing does not stop it', async () => {
  const d = dir();
  fs.writeFileSync(tokenFile(d), 'tok');
  const hb = [200, { hackerName: 'a', tag: 1, online: 0 }];
  const r = make({ 'POST v1/heartbeat': hb }, { dataDir: d, theme: () => 'Bad Theme', isActive: () => { throw new Error('x'); } });
  await r.c.handle({ type: 'checkUpdate' });
  const b = r.a.calls[0].body;
  assert.equal(b.theme, undefined);
  assert.equal(b.active, false);
  const r2 = make({ 'POST v1/heartbeat': hb }, { dataDir: d, theme: () => { throw new Error('t'); }, isActive: () => 1 });
  await r2.c.handle({ type: 'checkUpdate' });
  assert.equal(r2.a.calls[0].body.theme, undefined);
  assert.equal(r2.a.calls[0].body.active, true);
  const r3 = make({ 'POST v1/heartbeat': hb }, { dataDir: d, theme: () => 'a'.repeat(41) });
  await r3.c.handle({ type: 'checkUpdate' });
  assert.equal(r3.a.calls[0].body.theme, undefined);
  const r4 = make({ 'POST v1/heartbeat': hb }, { dataDir: d, theme: () => 'a'.repeat(40) });
  await r4.c.handle({ type: 'checkUpdate' });
  assert.equal(r4.a.calls[0].body.theme, 'a'.repeat(40));
});

test('signing: HMAC over time, method, path and body hash; skew learned from Date', async () => {
  const d = dir();
  fs.writeFileSync(tokenFile(d), 'tok');
  const secret = 'aabbcc';
  const ahead = Date.now() + 100_000;
  const r = make({ 'POST v1/heartbeat': [200, { hackerName: 'a', tag: 1, online: 0 }, { date: new Date(ahead).toUTCString() }] }, { dataDir: d, clientKey: { id: 'k1', secret } });
  await r.c.handle({ type: 'checkUpdate' });
  await r.c.handle({ type: 'checkUpdate' });
  const [c1, c2] = r.a.calls;
  for (const c of [c1, c2]) {
    const h = c.opts.headers;
    assert.equal(h['x-at-key'], 'k1');
    const body = c.opts.body;
    const text = [h['x-at-time'], 'POST', '/v1/heartbeat', crypto.createHash('sha256').update(body).digest('hex')].join('\n');
    assert.equal(h['x-at-sig'], crypto.createHmac('sha256', Buffer.from(secret, 'hex')).update(text).digest('hex'));
  }
  const t2 = Number(c2.opts.headers['x-at-time']);
  assert.ok(Math.abs(t2 - ahead / 1000) < 5, 'the second call uses the API clock');
  // bad keys: unsigned
  for (const k of [{ id: 'x', secret: 'zz' }, { id: 'x', secret: 'abc' }, { id: '', secret: 'aa' }, null]) {
    const u = make({ 'POST v1/heartbeat': [200, { hackerName: 'a', tag: 1, online: 0 }] }, { dataDir: d, clientKey: k });
    await u.c.handle({ type: 'checkUpdate' });
    assert.equal(u.a.calls[0].opts.headers['x-at-key'], undefined, JSON.stringify(k));
  }
});

test('token file per API host and port; base URL from env', async () => {
  const d = dir();
  const a = api({ 'POST v1/devices/identify': [200, { known: true, token: 'T' }], 'POST v1/heartbeat': [500, {}] });
  const { createCloud } = load();
  const c = createCloud({ dataDir: d, apiBase: 'http://[::1]:8787///', fetch: a.fetch });
  await c.handle({ type: 'checkUpdate' });
  assert.equal(fs.readFileSync(path.join(d, 'device-token-__1-8787'), 'utf8'), 'T');
  assert.equal(a.calls[0].url, 'http://[::1]:8787/v1/devices/identify');
  const old = process.env.ATALAY_API_URL;
  process.env.ATALAY_API_URL = 'https://env.test';
  try {
    const b = api({});
    await createCloud({ dataDir: dir(), fetch: b.fetch }).handle({ type: 'checkUpdate' });
    assert.equal(new URL(b.calls[0].url).host, 'env.test');
  } finally {
    if (old === undefined) delete process.env.ATALAY_API_URL; else process.env.ATALAY_API_URL = old;
  }
});

test('handle: state, update, updateRightAway, openChat, unknown', async () => {
  const { c, d } = make({});
  assert.deepEqual(await c.handle({ type: 'state' }), c.json());
  assert.equal(await c.handle({ type: 'update' }), true);
  assert.equal((await c.handle({ type: 'updateRightAway', on: true })).updateRightAway, true);
  assert.equal(JSON.parse(fs.readFileSync(path.join(d, 'cloud.json'), 'utf8')).updateRightAway, true);
  assert.equal((await c.handle({ type: 'updateRightAway', on: 'yes' })).updateRightAway, false);
  assert.deepEqual(await c.handle({ type: 'openChat', id: 'f1' }), { openChat: 'f1' });
  assert.deepEqual(await c.handle({ type: 'openChat', id: 5 }), { openChat: '' });
  await assert.rejects(c.handle({ type: 'nope' }), /unknown message/);
  await assert.rejects(c.handle(null), /unknown message/);
});

test('checkUpdate while one runs waits; beat shares the one running', async () => {
  let release;
  const gate = new Promise((r) => { release = r; });
  const { c, a } = make({ 'POST v1/devices/identify': async () => { await gate; return [200, { known: false }]; } });
  const fetch0 = a.fetch;
  void fetch0;
  const p1 = c.handle({ type: 'checkUpdate' });
  const p2 = c.handle({ type: 'checkUpdate' });
  assert.equal(c.json().checking, true);
  release();
  await Promise.all([p1, p2]);
  assert.equal(a.calls.length, 1);
});

test('social: allowed paths only, signed out, offline, errors, 401 re-signs-in', async () => {
  const s0 = make({});
  assert.deepEqual(await s0.c.handle({ type: 'social', path: 'v1/friends' }), { error: 'signed_out' });
  const d = dir();
  fs.writeFileSync(tokenFile(d), 'tok');
  let hbs = 0;
  const r = make({
    'GET v1/friends': [200, { friends: [1] }],
    'POST v1/messages/abc': (b) => [201, { sent: b }],
    'GET v1/notifications': [200, 'not json'],
    'DELETE v1/friends/x': [403, { error: 'forbidden' }],
    'GET v1/leaderboard': [500, 'oops'],
    'GET v1/me/status': [401, {}],
    'GET v1/social/feed': new TypeError('offline'),
    'POST v1/heartbeat': () => { hbs++; return [200, { hackerName: 'a', tag: 1, online: 0 }]; },
  }, { dataDir: d });
  const q = (p, method, body) => r.c.handle({ type: 'social', path: p, method, body });
  assert.deepEqual(await q('v1/friends'), { friends: [1] });
  assert.deepEqual(await q('v1/messages/abc', 'post', { text: 'hi' }), { sent: { text: 'hi' } });
  assert.equal(r.a.calls.at(-1).opts.method, 'POST');
  assert.deepEqual(await q('v1/notifications'), {});
  assert.deepEqual(await q('v1/friends/x', 'DELETE'), { error: 'forbidden' });
  assert.deepEqual(await q('v1/leaderboard'), { error: 'http_500' });
  assert.deepEqual(await q('v1/social/feed'), { error: 'offline' });
  assert.deepEqual(await q('v1/me/status'), { error: 'http_401' });
  assert.equal(hbs, 0, 'not running: no heartbeat');
  // GET has no body even if given one
  await q('v1/friends', 'GET', { a: 1 });
  assert.equal(r.a.calls.at(-1).opts.body, undefined);
  await q('v1/messages/abc', 'POST', 'str');
  assert.equal(r.a.calls.at(-1).opts.body, undefined);
  for (const bad of ['v1/heartbeat', 'v1/friendsx', '../v1/friends', 'v1/friends/../devices', 'v1/friends/%2e%2e/%2e%2e/v1/devices', 'https://evil.test/v1/friends', '', 5]) {
    assert.deepEqual(await q(bad), { error: 'bad_path' }, String(bad));
  }
  assert.deepEqual(await q('v1/friends?x=1'), { friends: [1] }, 'a query is allowed');
  assert.equal(new URL(r.a.calls.at(-1).url).search, '?x=1');
  // non-string method -> GET
  await r.c.handle({ type: 'social', path: 'v1/friends', method: 5 });
  assert.equal(r.a.calls.at(-1).opts.method, 'GET');
});

test('social 401 while running: a heartbeat to sign in again', async () => {
  const d = dir();
  fs.writeFileSync(tokenFile(d), 'tok');
  let hbs = 0;
  const r = make({ 'GET v1/friends': [401, { error: 'signed_out' }], 'POST v1/heartbeat': () => { hbs++; return [500, {}]; } }, { dataDir: d });
  r.c.start();
  await tick(10);
  const before = hbs;
  assert.deepEqual(await r.c.handle({ type: 'social', path: 'v1/friends' }), { error: 'signed_out' });
  await tick(10);
  assert.equal(hbs, before + 1);
  r.c.stop();
});

test('live socket: events, xp updates the state, afk, drops and reconnect backoff, kick, stop', async (t) => {
  const d = dir();
  fs.writeFileSync(tokenFile(d), 'tok');
  let ticket = 0;
  let idle = 0;
  const ws = globalThis.WebSocket;
  globalThis.WebSocket = FakeWS;
  FakeWS.made.length = 0;
  const r = make({
    'POST v1/heartbeat': [200, { hackerName: 'a', tag: 1, online: 1 }],
    'POST v1/live/ticket': () => [200, { ticket: `t${++ticket}` }],
  }, { dataDir: d, idleSeconds: () => idle });
  try {
    r.c.start();
    await tick(20);
    assert.equal(FakeWS.made.length, 1);
    const w = FakeWS.made[0];
    assert.equal(w.url, 'wss://api.test/v1/live?ticket=t1');
    idle = 601;
    w.onopen();
    assert.deepEqual(w.sent, [{ type: 'afk', afk: true }]);
    w.onmessage({ data: '{"type":"msg"}' });
    w.onmessage({ data: new ArrayBuffer(1) });
    assert.deepEqual(r.social, ['{"type":"msg"}']);
    w.onmessage({ data: '{"type":"xp","xp":{"level":9}}' });
    assert.deepEqual(r.c.json().xp, { level: 9 });
    w.onmessage({ data: '{"type":"xp" broken' });
    w.onmessage({ data: '{"type":"xp","xp":5}' });
    assert.deepEqual(r.c.json().xp, { level: 9 });
    assert.equal(r.social.length, 4);
    // drop: closed, reopened 2 s later
    w.onclose();
    assert.equal(w.closed, 1);
    assert.equal(w.onmessage, null);
    await new Promise((res2) => setTimeout(res2, 2100));
    await tick(10);
    assert.equal(FakeWS.made.length, 2);
    // kick: a fresh line at once
    r.c.kick();
    await tick(20);
    assert.equal(FakeWS.made.length, 3);
    assert.equal(FakeWS.made[1].closed, 1);
    // an old socket's events are ignored
    FakeWS.made[1].onopen && FakeWS.made[1].onopen();
    r.c.stop();
    assert.equal(FakeWS.made[2].closed, 1);
    r.c.stop();
    r.c.kick();
    assert.equal(FakeWS.made.length, 3);
  } finally {
    r.c.stop();
    globalThis.WebSocket = ws;
  }
});

test('live socket: no ticket retries later; no WebSocket warns once; signed out closes', async () => {
  const d = dir();
  fs.writeFileSync(tokenFile(d), 'tok');
  const ws = globalThis.WebSocket;
  globalThis.WebSocket = FakeWS;
  FakeWS.made.length = 0;
  let tickets = 0;
  let hb = [200, { hackerName: 'a', tag: 1, online: 1 }];
  const r = make({ 'POST v1/heartbeat': () => hb, 'POST v1/live/ticket': () => { tickets++; return [500, {}]; }, 'POST v1/devices/identify': [200, { known: false }] }, { dataDir: d });
  try {
    r.c.start();
    await tick(20);
    assert.equal(tickets, 1);
    assert.equal(FakeWS.made.length, 0);
    await new Promise((res2) => setTimeout(res2, 2100));
    await tick(10);
    assert.equal(tickets, 2);
    // signed out: the token goes, identify says unknown, registered false -> closed, no more retries
    hb = [401, {}];
    await quiet(() => r.c.handle({ type: 'checkUpdate' }));
    assert.equal(r.c.json().registered, false);
    const n = tickets; // the state change itself may have tried once more
    assert.ok(n <= 3);
    await new Promise((res2) => setTimeout(res2, 4200));
    assert.equal(tickets, n, 'signed out: no more tries');
  } finally {
    r.c.stop();
    globalThis.WebSocket = ws;
  }
  // no WebSocket at all
  const d2 = dir();
  fs.writeFileSync(tokenFile(d2), 'tok');
  delete globalThis.WebSocket;
  const warns = [];
  const ow = console.warn;
  console.warn = (m) => warns.push(m);
  const r2 = make({ 'POST v1/heartbeat': [200, { hackerName: 'a', tag: 1, online: 1 }] }, { dataDir: d2 });
  try {
    r2.c.start();
    await tick(20);
    r2.c.kick();
    await tick(20);
    assert.equal(warns.length, 1);
    assert.match(warns[0], /no WebSocket/);
  } finally {
    r2.c.stop();
    console.warn = ow;
    globalThis.WebSocket = ws;
  }
});

test('watchdog: once pings were seen, 35 s of silence drops the line', async (t) => {
  const d = dir();
  fs.writeFileSync(tokenFile(d), 'tok');
  const ws = globalThis.WebSocket;
  globalThis.WebSocket = FakeWS;
  FakeWS.made.length = 0;
  const r = make({ 'POST v1/heartbeat': [200, { hackerName: 'a', tag: 1, online: 1 }], 'POST v1/live/ticket': [200, { ticket: 'x' }] }, { dataDir: d });
  try {
    r.c.start();
    await tick(20);
    const w = FakeWS.made[0];
    t.mock.timers.enable({ apis: ['setInterval', 'Date'], now: Date.now() });
    // re-arm the watchdog under the mocked clock: a kick makes a new line
    r.c.kick();
    await tick(20);
    const w2 = FakeWS.made.at(-1);
    assert.notEqual(w2, w);
    t.mock.timers.tick(40_000);
    assert.equal(w2.closed, 0, 'no pings seen yet: never called dead');
    dc.channel('undici:websocket:ping').publish({ websocket: {} }); // another socket's ping
    t.mock.timers.tick(40_000);
    assert.equal(w2.closed, 0);
    dc.channel('undici:websocket:ping').publish({ websocket: w2 });
    t.mock.timers.tick(30_000);
    assert.equal(w2.closed, 0);
    t.mock.timers.tick(10_000);
    assert.equal(w2.closed, 1);
  } finally {
    t.mock.timers.reset();
    r.c.stop();
    globalThis.WebSocket = ws;
  }
});

test('afk checks every 30 s; only changes are sent; not when the socket is not open', async (t) => {
  const d = dir();
  fs.writeFileSync(tokenFile(d), 'tok');
  const ws = globalThis.WebSocket;
  globalThis.WebSocket = FakeWS;
  FakeWS.made.length = 0;
  let idle = 0;
  t.mock.timers.enable({ apis: ['setInterval'] });
  const r = make({ 'POST v1/heartbeat': [200, { hackerName: 'a', tag: 1, online: 1 }], 'POST v1/live/ticket': [200, { ticket: 'x' }] }, { dataDir: d, idleSeconds: () => idle });
  try {
    r.c.start();
    await tick(20);
    const w = FakeWS.made[0];
    w.onopen();
    assert.deepEqual(w.sent, [{ type: 'afk', afk: false }]);
    t.mock.timers.tick(30_000);
    assert.equal(w.sent.length, 1);
    idle = 700;
    t.mock.timers.tick(30_000);
    assert.deepEqual(w.sent.at(-1), { type: 'afk', afk: true });
    idle = 'x';
    w.readyState = 3;
    t.mock.timers.tick(30_000);
    assert.equal(w.sent.length, 2);
    w.readyState = FakeWS.OPEN;
    w.send = () => { throw new Error('closed'); };
    idle = 900;
    t.mock.timers.tick(30_000);
  } finally {
    t.mock.timers.reset();
    r.c.stop();
    globalThis.WebSocket = ws;
  }
});

test('machine id: the 32-bit view next; none -> a random one kept', { skip: !WIN }, async () => {
  const calls = [];
  const { c, a } = make({ 'POST v1/devices/identify': [200, { known: false }] }, {}, { reg: (args) => (args.includes('/reg:64') ? new Error('x') : `MachineGuid REG_SZ ${GUID}\0`), regCalls: calls });
  await c.handle({ type: 'checkUpdate' });
  assert.equal(calls.length, 2);
  assert.equal(a.calls[0].body.deviceHash, crypto.createHash('sha256').update('atalay-terminal/device/v1:' + GUID).digest('hex'));
  const d = dir();
  const r = make({ 'POST v1/devices/identify': [200, { known: false }] }, { dataDir: d }, { reg: '' });
  await r.c.handle({ type: 'checkUpdate' });
  const saved = JSON.parse(fs.readFileSync(path.join(d, 'cloud.json'), 'utf8')).fallbackDeviceID;
  assert.match(saved, /^[0-9A-F-]{36}$/);
  assert.equal(r.a.calls[0].body.deviceHash, crypto.createHash('sha256').update('atalay-terminal/device/v1:' + saved).digest('hex'));
  // the next launch keeps it
  const r2 = make({ 'POST v1/devices/identify': [200, { known: false }] }, { dataDir: d }, { reg: '' });
  await r2.c.handle({ type: 'checkUpdate' });
  assert.equal(r2.a.calls[0].body.deviceHash, r.a.calls[0].body.deviceHash);
});

test('write(): a rename refused falls back to writing in place', async () => {
  const d = dir();
  const orig = fs.renameSync;
  fs.renameSync = () => { throw new Error('locked'); };
  try {
    const { c } = make({}, { dataDir: d });
    await c.handle({ type: 'updateRightAway', on: true });
  } finally {
    fs.renameSync = orig;
  }
  assert.equal(JSON.parse(fs.readFileSync(path.join(d, 'cloud.json'), 'utf8')).updateRightAway, true);
  assert.equal(fs.readdirSync(d).some((f) => f.endsWith('.tmp')), false);
});

test('onChange / onSocial throwing are caught', async () => {
  const d = dir();
  fs.writeFileSync(tokenFile(d), 'tok');
  const ws = globalThis.WebSocket;
  globalThis.WebSocket = FakeWS;
  FakeWS.made.length = 0;
  const r = make({ 'POST v1/heartbeat': [200, { hackerName: 'a', tag: 1, online: 1 }], 'POST v1/live/ticket': [200, { ticket: 'x' }] },
    { dataDir: d, onChange: () => { throw new Error('c'); }, onSocial: () => { throw new Error('s'); } });
  try {
    await quiet(async () => {
      r.c.start();
      await tick(20);
      FakeWS.made[0].onmessage({ data: '{"type":"xp","xp":{"l":1}}' });
    });
    assert.deepEqual(r.c.json().xp, { l: 1 });
  } finally {
    r.c.stop();
    globalThis.WebSocket = ws;
  }
});
