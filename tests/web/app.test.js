'use strict';
// app.js: the dashboard's panels rendered from the app's state into index.html, the bridge (window.__radar), the
// session cards' buttons, sound, the log, the marquee and the helpers it shares (window.RADAR, window.DT).
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeDom } = require('./dom');

const NOW = Date.now();
function session(over = {}) {
  return {
    id: 's1', name: 'alpha', title: 'Fix the build', lastPrompt: 'fix it', cwd: '/repo/a', branch: 'main', status: 'busy',
    statusSince: NOW - 65_000, lastTs: NOW - 1000, host: 'app', kind: 'interactive', ctx: 50_000, ctxMax: 200_000,
    model: 'opus', effort: 'high', tools: 12, web: 2, errors: 0, cost: 1.5, spark: [0, 1, 3, 0], agents: [], agentsRunning: 0,
    flags: [], pending: [], prompts: 3, ...over,
  };
}
function state(over = {}) {
  return {
    sessions: [session()],
    totals: {
      live: 1, runningAgents: 0, sessionsToday: 4, agentsToday: 2, toolsPerMin: 3.25, tokPerMin: 12_345, cost: 12.5, costPerHour: 2,
      cacheHit: 0.875, saved: 4.2, web: 7, okRate: 0.98, errors: 1, tools: 30, tok: { out: 1500, cr: 2_500_000, cw: 40_000 },
      agentShare: 0.25, avgTurn: 95_000,
    },
    byCat: { read: 10, edit: 5, bash: 15 }, toolSpark: [1, 2, 3], costSpark: [0, 1, 2],
    byModel: [{ model: 'opus', calls: 5, tok: { out: 2000 }, priced: true, cost: 3 }, { model: 'x', calls: 1, tok: { out: 10 }, priced: false, cost: 0 }],
    ticker: [{ id: 't1', c: 'read', st: 'ok', n: 'Read' }, { id: 't2', c: 'bash', st: 'run', n: 'Bash' }, { id: 't3', c: 'nope', st: 'err', n: 'X' }],
    research: [], files: [],
    ...over,
  };
}
function boot(opts = {}) {
  const t = makeDom(opts);
  if (opts.orbit) t.window.Orbit = opts.orbit;
  t.run('appname.js', 'app.js');
  return t;
}

test('connect: window.__radar is wired and the app is told the page is ready', (t) => {
  const d = boot();
  t.after(d.close);
  const R = d.window.__radar;
  for (const k of ['init', 'state', 'events', 'visibility', 'cloud', 'social', 'terminals', 'terminalGone', 'idle', 'openUpdate', 'openProfile', 'openView', 'runaways', 'openDanger']) {
    assert.equal(typeof R[k], 'function', k);
  }
  assert.equal(d.sent('ready', 'radar').length, 1);
  // Before orbit.js loads, map calls queue.
  R.terminals([{ id: 1 }]);
  assert.equal(d.window.RADAR.MAPQ.at(-1)[0], 'terminals');
});

test('init renders every panel and hides the boot screen', (t) => {
  const calls = [];
  const orbit = new Proxy({}, { get: (_, k) => (...a) => calls.push([k, ...a]) });
  const d = boot({ orbit });
  t.after(d.close);
  const log = [
    { k: 'tool', id: 'e1', s: 's1', c: 'web', n: 'WebSearch', l: 'jsdom docs', t: NOW, ok: true, d: 1200 },
    { k: 'prompt', s: 's1', l: 'hello there', t: NOW },
    { k: 'say', s: 's1', l: 'done', t: NOW },
  ];
  d.window.__radar.init({ state: state(), log });
  assert.ok(d.$('#boot').classList.contains('gone'));
  // top bar
  assert.equal(d.$('#k-sessions').textContent, '1');
  assert.equal(d.$('#k-sessions-sub').textContent, 'bugün 4');
  assert.equal(d.$('#k-tpm').textContent, '3.3');
  assert.equal(d.$('#k-tokm').textContent, '12k');
  assert.equal(d.$('#k-cost').textContent, '$12.50');
  assert.equal(d.$('#k-cache').textContent, '%87,5');
  assert.equal(d.$('#k-ok').textContent, '%98,0');
  assert.equal(d.$('#k-err').textContent, '1 hatalı');
  assert.equal(d.$('#k-burn').textContent, 'saatte $2.00');
  assert.match(d.$('#m-map').textContent, /1 canlı · 0 çalışan ajan · bugün 4 oturum/);
  // session card
  const card = d.$('#sessions .card');
  assert.equal(card.dataset.key, 's1');
  assert.ok(card.classList.contains('st-busy'));
  assert.equal(card.querySelector('.nm').textContent, 'alpha');
  assert.equal(card.querySelector('.kind').textContent, 'uygulamada');
  assert.match(card.querySelector('.pill').textContent, /^ÇALIŞIYOR 1:0\d$/);
  assert.equal(card.querySelector('.path').textContent, '/repo/a  ⎇ main');
  assert.equal(card.querySelector('.cv').textContent, '50k / 200k');
  assert.equal(card.querySelector('.bar > i').style.width, '25%');
  assert.equal(card.querySelector('.md').textContent, 'opus · high');
  assert.equal(card.querySelector('.cost').textContent, '$1.50');
  assert.match(card.querySelector('.act').innerHTML, /düşünüyor/);
  assert.equal(card.querySelectorAll('.spark rect').length, 4);
  // log: three lines, the tool's result marked
  const lines = d.$$('#log .ln');
  assert.equal(lines.length, 3);
  assert.match(lines[0].querySelector('.st').textContent, /^✓ 1 sn$/);
  assert.equal(lines[1].querySelector('.txt').textContent, '› hello there');
  assert.equal(lines[2].querySelector('.cat').textContent, 'claude');
  // marquee: the web search and the prompt
  assert.match(d.$('#marquee').textContent, /alpha ⌕ jsdom docs/);
  assert.match(d.$('#marquee').textContent, /alpha › hello there/);
  // mix: 9 categories, the totals
  assert.equal(d.$$('#mix .mixbar i').length, 9);
  assert.match(d.$('#mix .mixlegend').textContent, /kabuk 15/);
  assert.equal(d.$('#m-mix').textContent, 'bugün 30 çağrı · 30 dk eğilim');
  // spend
  assert.equal(d.$('#spend-big').textContent, '$12.50');
  assert.match(d.$('#spend-sub').textContent, /1\.5k çıktı · 2\.5M önbellek okuma · 40k önbellek yazma/);
  assert.equal(d.$$('#spend-rows .sr').length, 2);
  assert.match(d.$('#spend-rows').textContent, /fiyat yok/);
  assert.match(d.$('#spend-kv').textContent, /alt ajanlar %25/);
  assert.match(d.$('#spend-kv').textContent, /ort\. tur 1 dk 35 sn/);
  // ticker
  const sq = d.$$('#squares .sq');
  assert.equal(sq.length, 3);
  assert.ok(sq[1].classList.contains('run'));
  assert.ok(sq[2].classList.contains('err'));
  assert.equal(sq[0].title, 'Read · tamam');
  assert.equal(d.$('#ticker-meta').textContent, '1 çalışıyor · 1 hatalı');
  // call: busy only, so nobody waits
  assert.match(d.$('#call').textContent, /her şey sakin/);
  assert.equal(d.document.title, 'Derin Terminal');
  // workers: none
  assert.match(d.$('#workers').textContent, /alt ajan yok/);
  // the orbit got the log and the state
  assert.ok(calls.some((c) => c[0] === 'seed'));
  assert.ok(calls.some((c) => c[0] === 'state'));
});

test('state: status transitions log, flash, and the title counts who waits', (t) => {
  const calls = [];
  const orbit = new Proxy({}, { get: (_, k) => (...a) => calls.push([k, ...a]) });
  const d = boot({ orbit });
  t.after(d.close);
  d.window.__radar.init({ state: state(), log: [] });
  const s2 = session({ id: 's2', name: 'beta', status: 'idle', title: '', lastPrompt: 'next?' });
  d.window.__radar.state(state({ sessions: [session({ status: 'waiting', waitingFor: 'izin' }), s2] }));
  const txt = d.$$('#log .ln .txt').map((e) => e.textContent);
  assert.ok(txt.includes('⚠ seni bekliyor · izin'));
  assert.ok(txt.some((x) => x.startsWith('● oturum açıldı · /repo/a')));
  assert.ok(d.$('#log .ln.err'));
  assert.ok(d.$('#flash').classList.contains('on'));
  assert.ok(calls.some((c) => c[0] === 'status' && c[1] === 's1' && c[2] === 'waiting' && c[3] === 'busy'));
  assert.equal(d.document.title, '⚠ 1 seni bekliyor · Derin Terminal');
  assert.ok(d.$('#p-call').classList.contains('hot'));
  const yc = d.$$('#call .yc');
  assert.equal(yc.length, 2);
  // waiting first
  assert.equal(yc[0].querySelector('.b').textContent, 'SENİ BEKLİYOR');
  assert.equal(yc[0].querySelector('.why').textContent, 'izin · gitmek için tıkla');
  assert.equal(yc[1].querySelector('.why').textContent, 'next?');
  assert.equal(d.$('#m-call').textContent, '1 sana takılı');
  assert.match(d.$('#sessions .card[data-key="s1"] .act').innerHTML, /⚠ izin/);
  // waiting -> busy, then idle, then ended
  d.window.__radar.state(state({ sessions: [session({ status: 'busy' }), s2] }));
  d.window.__radar.state(state({ sessions: [session({ status: 'idle', turnMs: 5000 }), s2] }));
  d.window.__radar.state(state({ sessions: [session({ status: 'ended' }), s2] }));
  const all = d.$$('#log .ln .txt').map((e) => e.textContent);
  assert.ok(all.includes('▶ engel kalktı · yeniden çalışıyor'));
  assert.ok(all.includes('◆ tur bitti · sıra sende'));
  assert.ok(all.includes('oturum bitti'));
  assert.equal(d.document.title, '◆ 1 sıra sende · Derin Terminal');
  assert.equal(d.$('#m-call').textContent, '1 sıradaki istemini bekliyor');
  const card = d.$('#sessions .card[data-key="s1"]');
  assert.ok(card.classList.contains('st-ended'));
  assert.equal(card.querySelector('.l-close').title, 'Listeden kaldır');
  assert.match(card.querySelector('.act').textContent, /bitti$/);
});

test('cards: keyed reuse, collapse persists, host labels, agents, flags, errors', (t) => {
  const d = boot({ storage: { 'radar.collapsed': '["s1"]' } });
  t.after(d.close);
  const agent = { id: 'a1', sid: 's1', desc: 'explore', type: 'Explore', running: true, firstTs: NOW - 5000, lastTs: NOW, pending: [{ c: 'read', n: 'Read', l: 'file.js', t: NOW - 100 }], tools: 3, cost: 0.2, errors: 1 };
  d.window.__winOpen = { s2: true };
  const st = state({
    sessions: [
      session({ errors: 2, flags: ['<b>x</b>'], agents: [agent], agentsRunning: 1 }),
      session({ id: 's2', name: 'w', host: 'term', tty: '/dev/ttys003', kind: 'print' }),
      session({ id: 's3', name: 't', host: 'term', tty: '/dev/ttys004' }),
    ],
  });
  d.window.__radar.init({ state: st, log: [] });
  const c1 = d.$('.card[data-key="s1"]');
  assert.ok(c1.classList.contains('collapsed'));
  assert.equal(c1.querySelector('.l-min').title, 'Genişlet');
  assert.ok(c1.querySelector('.er').classList.contains('red'));
  assert.equal(c1.querySelector('.flags').innerHTML, '<span class="flag">&lt;b&gt;x&lt;/b&gt;</span>');
  assert.equal(c1.querySelector('.ag').textContent, '⤷ 1 çalışıyor · 1 alt ajan (15 dk)');
  assert.match(c1.querySelector('.act').innerHTML, /▸ Read/);
  assert.equal(d.$('.card[data-key="s2"] .kind').textContent, 'print · pencere');
  assert.ok(d.$('.card[data-key="s2"]').classList.contains('winopen'));
  assert.equal(d.$('.card[data-key="s3"] .kind').textContent, 'dış ttys004');
  // workers panel lists the agent
  const wk = d.$('#workers .wk');
  assert.equal(wk.querySelector('b').textContent, 'explore');
  assert.equal(wk.querySelector('.ty').textContent, 'Explore · alpha');
  assert.match(wk.querySelector('.l2').innerHTML, /1 hata/);
  assert.match(d.$('#m-workers').textContent, /1 çalışıyor · son 15 dk’da 1/);
  // the same element survives a refresh
  d.window.__radar.state(st);
  assert.equal(d.$('.card[data-key="s1"]'), c1);
  assert.ok(!c1.classList.contains('st-waiting'));
  // fold toggles and is stored
  d.click(c1.querySelector('.l-min'));
  assert.ok(!c1.classList.contains('collapsed'));
  assert.equal(d.window.localStorage.getItem('radar.collapsed'), '[]');
  // the card click opens the chat, the worker click its session's chat
  d.click(c1);
  d.click(wk);
  assert.deepEqual(d.sent('open').map((m) => m.sid), ['s1', 's1']);
  // removed sessions go
  d.window.__radar.state(state({ sessions: [session()] }));
  assert.equal(d.$$('#sessions .card').length, 1);
  // none: the placeholder
  d.window.__radar.state(state({ sessions: [], totals: { ...state().totals, live: 0 } }));
  assert.match(d.$('#sessions').textContent, /Claude Code oturumu yok/);
  assert.match(d.$('#call').textContent, /canlı Claude Code oturumu yok/);
  assert.equal(d.document.title, 'Derin Terminal');
});

test('end session: asks first for a live one, then tells the app; Escape cancels', async (t) => {
  const d = boot();
  t.after(d.close);
  d.window.__radar.init({ state: state({ sessions: [session({ host: 'term', tty: '/dev/ttys009', status: 'waiting' })] }), log: [] });
  d.click('.card .l-close');
  const box = d.$('.askbox');
  assert.ok(box);
  assert.match(box.querySelector('b').textContent, /“Fix the build” bitirilsin mi\?/);
  assert.match(box.querySelector('p').textContent, /terminalde durur \(ttys009\)\. Seni bekliyor\./);
  assert.deepEqual(d.sent('modal').map((m) => m.open), [true]);
  d.key('Escape');
  await d.flush();
  assert.equal(d.$('.askbox'), null);
  assert.equal(d.sent('endSession').length, 0);
  // again, and confirm
  d.click('.card .l-close');
  d.click('.askbox .ok');
  await d.flush();
  assert.deepEqual(d.sent('endSession').map((m) => m.sid), ['s1']);
  assert.ok(d.$('.card').classList.contains('ending'));
  assert.deepEqual(d.sent('modal').map((m) => m.open), [true, false, true, false]);
});

test('end session: an ended card goes without a question; Enter and a click outside answer', async (t) => {
  const d = boot();
  t.after(d.close);
  d.window.__radar.init({ state: state({ sessions: [session({ status: 'ended' }), session({ id: 's2', status: 'busy' })] }), log: [] });
  d.click('.card[data-key="s1"] .l-close');
  await d.flush();
  assert.deepEqual(d.sent('endSession').map((m) => m.sid), ['s1']);
  d.click('.card[data-key="s2"] .l-close');
  assert.match(d.$('.askbox p').textContent, /Claude durur ve penceresi kapanır\. Şu an çalışıyor\./);
  d.key('Enter');
  await d.flush();
  assert.deepEqual(d.sent('endSession').map((m) => m.sid), ['s1', 's2']);
  d.click('.card[data-key="s2"] .l-close');
  const box = d.$('.askbox');
  box.dispatchEvent(new d.window.MouseEvent('mousedown', { bubbles: true }));
  await d.flush();
  assert.equal(d.$('.askbox'), null);
  assert.equal(d.sent('endSession').length, 2);
});

test('events: tools, results, say/sys; the log keeps 220 lines and maps results to their line', (t) => {
  const d = boot();
  t.after(d.close);
  d.window.__radar.init({ state: state(), log: [] });
  d.window.__radar.events([
    { k: 'tool', id: 'x1', s: 's1', c: 'bash', n: 'Bash', l: 'npm test', t: Date.now() },
    { k: 'tool', id: 'x2', s: 's1', c: 'mcp', n: 'mcp__a__b', t: Date.now(), a: true },
    { k: 'tool', id: 'x3', s: 's1', c: 'edit', n: 'Edit', l: 'a.js', t: Date.now() - 20 * 60_000 },
    { k: 'sys', s: 's1', l: 'compacted', t: Date.now() },
    { k: 'other', s: 's1' },
  ]);
  const ln = d.$$('#log .ln');
  assert.equal(ln.length, 4);
  assert.equal(ln[0].querySelector('.txt').textContent, 'npm test');
  assert.equal(ln[0].querySelector('.st').className, 'st run');
  assert.equal(ln[1].querySelector('.txt').textContent, 'mcp__a__b');
  assert.match(ln[1].querySelector('.who').textContent, /⤷$/);
  assert.equal(ln[2].querySelector('.st').textContent, '·'); // stale, never answered
  assert.equal(ln[3].querySelector('.cat').textContent, 'sistem');
  d.window.__radar.events([{ k: 'result', id: 'x1', ok: false, d: 61_000, m: 'exit 1' }, { k: 'result', id: 'nope', ok: true }]);
  assert.equal(ln[0].querySelector('.st').textContent, '✗ 1 dk 1 sn · exit 1');
  assert.equal(ln[0].querySelector('.st').className, 'st bad');
  // clicking a line opens its session
  d.click(ln[0].querySelector('.txt'));
  assert.equal(d.sent('open').at(-1).sid, 's1');
  // cap
  const many = Array.from({ length: 230 }, (_, i) => ({ k: 'tool', id: `m${i}`, s: 's1', c: 'read', n: 'Read', l: String(i), t: Date.now() }));
  d.window.__radar.events(many);
  assert.equal(d.$$('#log .ln').length, 220);
  // the oldest lines' results go nowhere (their element is forgotten)
  d.window.__radar.events([{ k: 'result', id: 'x1', ok: true }]);
  assert.equal(d.$('#log .ln .txt').textContent, 'Read · 10');
  // marquee only flushes on its animation's turn
  d.window.__radar.events([{ k: 'tool', id: 'q', s: 's1', c: 'edit', n: 'Edit', l: 'b.js' }, { k: 'tool', id: 'q2', s: 's1', c: 'agent', n: 'Agent', l: 'sub' }, { k: 'prompt', s: 's1', l: '/clear', cmd: true }]);
  assert.doesNotMatch(d.$('#marquee').textContent, /b\.js/);
  d.fire('#marquee', 'animationiteration');
  assert.match(d.$('#marquee').textContent, /alpha ✎ b\.js/);
  assert.match(d.$('#marquee').textContent, /alpha ◆ sub/);
  assert.doesNotMatch(d.$('#marquee').textContent, /\/clear/);
});

test('limits: hidden without data, coloured by use, reset countdowns', (t) => {
  const d = boot();
  t.after(d.close);
  d.window.__radar.init({ state: state(), log: [] });
  assert.equal(d.$('#lim-5h').style.display, 'none');
  assert.equal(d.$('#lim-week small').textContent, 'henüz veri yok');
  const at = Date.now();
  d.window.__radar.state(state({ limits: { fiveHour: { pct: 42.4, resetsAt: at + 90 * 60_000 }, week: { pct: 130, resetsAt: at + 3 * 86400_000 } } }));
  const h5 = d.$('#lim-5h'), wk = d.$('#lim-week');
  assert.equal(h5.style.display, '');
  assert.ok(h5.classList.contains('ok'));
  assert.equal(h5.querySelector('b').textContent, '%42');
  assert.match(h5.querySelector('small').textContent, /^sıfırlanma: 1 sa (29|30) dk sonra$/);
  assert.equal(h5.querySelector('.lim-bar i').style.width, '42.4%');
  assert.ok(wk.classList.contains('hot'));
  assert.equal(wk.querySelector('b').textContent, '%100');
  assert.doesNotMatch(wk.querySelector('small').textContent, /dk sonra/);
  d.window.__radar.state(state({ limits: { fiveHour: { pct: 60, resetsAt: at - 1 }, week: { pct: 10 } } }));
  assert.ok(h5.classList.contains('warn'));
  assert.equal(h5.querySelector('small').textContent, 'sıfırlanma: şimdi');
  assert.equal(wk.querySelector('small').textContent, '');
  d.window.__radar.state(state({ limits: { fiveHour: { pct: 1, resetsAt: Date.now() + 10 * 60_000 } } }));
  assert.match(h5.querySelector('small').textContent, /^sıfırlanma: (9|10) dk sonra$/);
  // the clock ticks every second and keeps the countdowns
  d.tick(1000);
  assert.match(d.$('#clock').textContent, /^\d\d:\d\d:\d\d$/);
});

test('numbers roll to their new value', (t) => {
  const d = boot();
  t.after(d.close);
  d.window.__radar.init({ state: state(), log: [] });
  const st = state();
  st.totals = { ...st.totals, live: 9 };
  d.window.__radar.state(st);
  const el = d.$('#k-sessions');
  assert.ok(el.classList.contains('bump'));
  d.tick(400);
  const mid = Number(el.textContent);
  assert.ok(mid > 1 && mid < 9, `mid ${mid}`);
  d.tick(1000);
  assert.equal(el.textContent, '9');
});

test('sound button: toggles, is kept, and pings with an AudioContext', (t) => {
  const d = boot();
  t.after(d.close);
  const b = d.$('#sound');
  assert.equal(b.textContent, 'ses kapalı');
  d.click(b);
  assert.equal(b.textContent, 'ses açık');
  assert.ok(b.classList.contains('on'));
  assert.equal(d.window.localStorage.getItem('radar.sound'), '1');
  assert.equal(d.audio.length, 1);
  assert.equal(d.audio[0].made.length, 2); // idle: two tones
  d.window.__radar.init({ state: state(), log: [] });
  d.window.__radar.state(state({ sessions: [session({ status: 'waiting' })] }));
  assert.equal(d.audio[0].made.length, 5); // waiting: three more
  d.tick(1600);
  assert.equal(d.audio[0].state, 'suspended');
  d.click(b);
  assert.equal(d.window.localStorage.getItem('radar.sound'), '0');
  // stored on at load
  const d2 = boot({ storage: { 'radar.sound': '1' } });
  t.after(d2.close);
  assert.equal(d2.$('#sound').textContent, 'ses açık');
});

test('buttons and bridge: new terminal, visibility, view and danger hooks', (t) => {
  const calls = [];
  const orbit = new Proxy({}, { get: (_, k) => (...a) => calls.push([k, ...a]) });
  const d = boot({ orbit });
  t.after(d.close);
  d.click('#newchat');
  assert.equal(d.sent('newTerminal').length, 1);
  d.window.__radar.visibility(false, false);
  assert.ok(d.document.documentElement.classList.contains('paused'));
  d.window.__radar.visibility(true, true);
  assert.ok(!d.document.documentElement.classList.contains('paused'));
  assert.deepEqual(calls.filter((c) => c[0] === 'activity').map((c) => c.slice(1)), [[false, false], [true, true]]);
  const seen = [];
  d.window.Cloud = { render: (c) => seen.push(['cloud', c]), openUpdate: () => seen.push(['upd']), openMenu: (w) => seen.push(['menu', w]) };
  d.window.Social = { event: (e) => seen.push(['social', e.type]) };
  d.window.GitView = { view: (v) => seen.push(['view', v]) };
  d.window.Danger = { update: (l) => seen.push(['danger', l.length]), open: () => seen.push(['dopen']) };
  const R = d.window.__radar;
  R.cloud({ a: 1 }); R.social({ type: 'hello' }); R.openUpdate(); R.openProfile(); R.openView('git'); R.runaways([1, 2]); R.openDanger();
  R.terminalGone(4); R.idle({});
  assert.deepEqual(JSON.parse(JSON.stringify(seen)), [['cloud', { a: 1 }], ['social', 'hello'], ['upd'], ['menu', 'profile'], ['view', 'git'], ['danger', 2], ['dopen']]);
  assert.ok(calls.some((c) => c[0] === 'runaways'));
  assert.ok(calls.some((c) => c[0] === 'terminalGone' && c[1] === 4));
  // a page error is reported to the app
  d.window.dispatchEvent(new d.window.ErrorEvent('error', { message: 'boom', filename: 'x.js', lineno: 3 }));
  assert.equal(d.sent('log').at(-1).msg, 'boom @ x.js:3');
});

test('RADAR helpers: formats, colours, tooltips', (t) => {
  const d = boot();
  t.after(d.close);
  const R = d.window.RADAR;
  assert.equal(R.fmtTok(0), '0');
  assert.equal(R.fmtTok(999), '999');
  assert.equal(R.fmtTok(1500), '1.5k');
  assert.equal(R.fmtTok(15_000), '15k');
  assert.equal(R.fmtTok(2_500_000), '2.5M');
  assert.equal(R.fmtTok(250_000_000), '250M');
  assert.equal(R.fmtTok(3_210_000_000), '3.21B');
  assert.equal(R.fmtUsd(0), '$0');
  assert.equal(R.fmtUsd(0.004), '$0.004');
  assert.equal(R.fmtUsd(0.5), '$0.50');
  assert.equal(R.fmtUsd(150), '$150');
  assert.match(R.fmtUsd(12_345), /^\$12.345$/);
  assert.equal(R.fmtDur(null), '');
  assert.equal(R.fmtDur(400), '400ms');
  assert.equal(R.fmtDur(5000), '5 sn');
  assert.equal(R.fmtDur(120_000), '2 dk');
  assert.equal(R.fmtDur(3_600_000), '1 sa');
  assert.equal(R.fmtDur(3_660_000), '1 sa 1 dk');
  assert.equal(R.clock(-5), '0:00');
  assert.equal(R.clock(65_000), '1:05');
  assert.equal(R.clock(3_725_000), '1:02:05');
  assert.equal(R.agoTR(0), '');
  assert.equal(R.agoTR(Date.now() - 1000), 'az önce');
  assert.equal(R.agoTR(Date.now() - 5 * 60_000), '5 dk önce');
  assert.equal(R.clipT('abcdef', 4), 'abc…');
  assert.equal(R.clipT(null, 4), '');
  assert.equal(R.clipT('ab', 1), 'a…');
  assert.equal(R.esc(`<a href="x">'&`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;');
  assert.equal(R.hexA('#ff8000', 0.5), 'rgba(255,128,0,0.5)');
  assert.equal(R.ctxColor(0.1), '#3fb6ec');
  assert.equal(R.ctxColor(0.6), '#ffd23f');
  assert.equal(R.ctxColor(0.9), '#ff4d4d');
  // colours are stable per session, in order
  const i0 = R.colorIndex('zz1'), i1 = R.colorIndex('zz2');
  assert.equal(i1, i0 + 1);
  assert.equal(R.colorIndex('zz1'), i0);
  assert.equal(R.sessColor('zz1'), ['#5ce1f0', '#00e5ff', '#9d6bff', '#3dffa8', '#ff5c8a', '#5b8cff', '#ffd23f', '#b8ff3d', '#e879f9', '#f5ebe0'][i0 % 10]);
  assert.equal(R.sessName('abcdefgh'), 'abcdef');
  assert.equal(R.CATS.length, 9);
  // tooltips
  const s = session({ status: 'waiting', waitingFor: 'izin', tty: '/dev/ttys1', cpu: 12.6, mem: 300, pending: [{ c: 'bash', n: 'Bash', l: 'ls', t: Date.now() }] });
  const tip = R.sessionTip(s);
  assert.match(tip, /alpha · SENİ BEKLİYOR · izin/);
  assert.match(tip, /opus · high · ttys1 · %13 CPU · 300 MB/);
  assert.match(tip, /bağlam 50k \(%25\)/);
  assert.match(tip, /▸ Bash ls/);
  assert.match(R.agentTip({ desc: 'd', type: 'T', model: 'm', bg: true, running: false, lastTs: Date.now(), tools: 1, cost: 0, errors: 0, pending: [], last: { c: 'read', n: 'Read', l: 'f' } }, { name: 'P' }), /T · m · arka plan · kaynak: P[\s\S]*bitti[\s\S]*▸ Read f/);
  assert.match(R.agentTip({ desc: 'd', running: true, firstTs: Date.now(), tools: 1, cost: 0, errors: 0, pending: [] }), /çalışıyor 0:00/);
  assert.match(R.stationTip('web'), /web araştırma[\s\S]*bugün 0 çağrı · şu an 0 çalışıyor/);
  assert.match(R.terminalTip({ left: true, cmd: 'npm run dev', cwd: '/x' }), /terminali kapandı/);
  assert.match(R.terminalTip({ running: true, cmd: 'vim', cwd: '/x', cpu: 55.2 }), /çalışıyor · %55 CPU · açmak için tıkla/);
  assert.match(R.terminalTip({ running: false, cwd: '/x' }), /▸ terminal[\s\S]*boşta kabuk/);
  R.openTerminal(7);
  assert.equal(d.sent('openTerminal').at(-1).id, 7);
  for (const [k, v] of [['clientWidth', 800], ['clientHeight', 600]]) Object.defineProperty(d.$('#mapwrap'), k, { value: v, configurable: true });
  R.showTip('<b>x</b>', 10, 10);
  assert.equal(d.$('#tip').style.display, 'block');
  assert.equal(d.$('#tip').style.left, '26px');
  assert.equal(d.$('#tip').style.top, '24px');
  R.hideTip();
  assert.equal(d.$('#tip').style.display, 'none');
});

test('stationTip with state: last call and counts', (t) => {
  const d = boot();
  t.after(d.close);
  d.window.__radar.init({ state: state({ byCat: { web: 3 }, pendingByCat: { web: 1 }, lastByCat: { web: { l: 'q', s: 's1', t: Date.now() } } }), log: [] });
  assert.match(d.window.RADAR.stationTip('web'), /bugün 3 çağrı · şu an 1 çalışıyor[\s\S]*son: q · alpha · az önce/);
});

test('DT: prompts go to the last chat opened, else a new chat', async (t) => {
  const d = boot({ reply: { radar: (m) => (m.type === 'sendText' ? { ok: false, reason: 'no-chat' } : { ok: true }) } });
  t.after(d.close);
  const r = await d.window.DT.sendPrompt('hi', { submit: false });
  assert.deepEqual({ ...r }, { ok: true });
  assert.deepEqual(d.sent('sendText')[0], { type: 'sendText', sid: null, text: 'hi', submit: false, via: 'radar' });
  assert.deepEqual(d.sent('newChatWithText')[0].text, 'hi');
  // after a card click the session is remembered
  d.window.__radar.init({ state: state(), log: [] });
  d.click('.card');
  await d.window.DT.sendPrompt(null);
  assert.equal(d.sent('sendText').at(-1).sid, 's1');
  assert.equal(d.sent('sendText').at(-1).text, '');
});

test('DT: no bridge answers {ok:false}', async (t) => {
  const d = makeDom({ noWebkit: true });
  t.after(d.close);
  d.run('app.js');
  const r = await d.window.DT.newChatWithPrompt('x');
  assert.equal(r.ok, false);
  assert.match(r.reason, /TypeError/);
});

test('app name event re-renders the title; narrow top bar clips', (t) => {
  const d = boot();
  t.after(d.close);
  d.window.__radar.init({ state: state({ sessions: [session({ status: 'idle' })] }), log: [] });
  d.window.AppName.set('Foo');
  assert.equal(d.document.title, '◆ 1 sıra sende · Foo');
  const ro = d.observers.find((o) => o.el && o.el.classList.contains('kpis'));
  assert.ok(ro);
  Object.defineProperty(ro.el, 'scrollWidth', { value: 500, configurable: true });
  Object.defineProperty(ro.el, 'clientWidth', { value: 100, configurable: true });
  ro.cb();
  assert.ok(ro.el.classList.contains('clip'));
});

test('research and files panels (no mounts in index.html) render when given boxes', (t) => {
  const d = boot();
  t.after(d.close);
  d.document.body.insertAdjacentHTML('beforeend', '<div id="research"></div><i id="m-research"></i><div id="files"></div><i id="m-files"></i>');
  d.window.__radar.init({ state: state(), log: [] });
  d.ev('renderResearch(); renderFiles();');
  assert.match(d.$('#research').textContent, /bugün henüz web araması/);
  assert.match(d.$('#files').textContent, /bugün henüz dosya/);
  d.ev(`STATE.research = [{ id: 'r1', s: 's1', kind: 'search', l: 'q', hosts: ['a.com'], m: '404', d: 100, t: Date.now(), ok: null }, { id: 'r2', s: 's1', kind: 'fetch', l: 'u', t: Date.now(), ok: true }];
    STATE.files = [{ p: '/a/b.js', short: 'b.js', r: 2, w: 1, editors: [{ s: 's1' }, { s: 's2' }], collision: true }];
    renderResearch(); renderFiles();`);
  const rf = d.$$('#research .rf');
  assert.equal(rf.length, 2);
  assert.equal(rf[0].querySelector('.k').textContent, 'SRCH');
  assert.equal(rf[0].querySelector('.q').textContent, '“q”');
  assert.ok(rf[0].classList.contains('pending'));
  assert.ok(rf[0].classList.contains('bad'));
  assert.equal(rf[1].querySelector('.k').textContent, 'FTCH');
  d.click(rf[0]);
  assert.equal(d.sent('open').at(-1).sid, 's1');
  assert.equal(d.$('#m-files').textContent, '⚠ 1 dosyayı 2+ ajan düzenledi');
  const fh = d.$('#files .fh');
  assert.ok(fh.classList.contains('collide'));
  assert.equal(fh.querySelector('.r').style.width, '66.7%');
  assert.equal(fh.querySelectorAll('.n i').length, 2);
});
