'use strict';
// RadarEngine (windows/src/engine.js) end to end against a temp Claude folder: boot, transcript ingestion, the live
// registry, process checks, snapshots and publishing. The process list (child_process) is stubbed.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadEngine, tmpDir, fixture, write, jsonl, iso } = require('./_load');

const SID = '11111111-aaaa-4bbb-8ccc-000000000001';
const CWD = 'C:\\work\\demo';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
async function until(fn, ms = 3000) {
  const t0 = Date.now();
  while (!fn()) {
    if (Date.now() - t0 > ms) return false;
    await sleep(15);
  }
  return true;
}

// Quiet: the engine logs its boot time and reports caught errors on the console.
const logs = { log: [], error: [] };
const orig = { log: console.log, error: console.error };
test.before(() => {
  console.log = (...a) => logs.log.push(a.join(' '));
  console.error = (...a) => logs.error.push(a.join(' '));
  delete process.env.CLAUDE_CODE_AUTO_COMPACT_WINDOW;
});
test.after(() => Object.assign(console, orig));

// A fake child_process whose execFile answers with `cp.reply` (err, stdout), or throws when `cp.throws`.
function fakeCp() {
  const cp = {
    calls: 0,
    reply: [null, ''],
    throws: false,
    execFile(exe, args, opts, cb) {
      cp.calls++;
      if (cp.throws) throw new Error('spawn failed');
      const r = cp.reply;
      setImmediate(() => cb(...r));
    },
  };
  return cp;
}

function setup(opts = {}) {
  const tmp = tmpDir();
  const cp = fakeCp();
  const M = loadEngine({ home: tmp.dir, stubs: { 'node:child_process': cp } });
  const claude = path.join(tmp.dir, 'claude');
  const out = { init: [], state: [], events: [], history: [] };
  const e = new M.__t.RadarEngine({
    claudeDir: claude,
    limitsFile: opts.limitsFile,
    isAppPid: opts.isAppPid,
    onInit: (j) => out.init.push(JSON.parse(j)),
    onState: (j) => out.state.push(JSON.parse(j)),
    onEvents: (j) => out.events.push(JSON.parse(j)),
    onHistory: (items) => out.history.push(items),
  });
  return {
    e, T: M.__t, cp, out, tmp, claude,
    projects: path.join(claude, 'projects'),
    registry: path.join(claude, 'sessions'),
    done() {
      e.stop();
      tmp.cleanup();
    },
  };
}

function seedDemo(h, base = Date.now()) {
  const proj = path.join(h.projects, 'C--work-demo');
  write(path.join(proj, `${SID}.jsonl`), fixture('claude-session.jsonl', base));
  const sub = path.join(proj, SID, 'subagents');
  write(path.join(sub, 'agent-abc123.jsonl'), fixture('subagent.jsonl', base));
  write(path.join(sub, 'agent-abc123.meta.json'), JSON.stringify({ description: 'Find TODOs', agentType: 'Explore', model: 'inherit', requestShape: 'background' }));
  return proj;
}

function regEntry(h, name, obj) {
  return write(path.join(h.registry, name), JSON.stringify(obj));
}

const now = () => Date.now();
const rec = (type, extra = {}) => ({ type, sessionId: SID, timestamp: iso(now() - 1000), ...extra });
const cursor = (over = {}) => ({ sid: null, agentId: null, ...over });

test('boot: indexes the fixture transcripts and snapshots the session', async () => {
  const h = setup({ isAppPid: (pid) => (pid === 777 ? 'tab-9' : false) });
  try {
    seedDemo(h);
    const t = now();
    regEntry(h, `${process.pid}.json`, { pid: process.pid, sessionId: SID, cwd: CWD, status: 'waiting', waitingFor: 'permission', name: 'demo-chat', updatedAt: t, statusUpdatedAt: t - 5000, startedAt: t - 700_000, kind: 'interactive', entrypoint: 'cli' });
    h.cp.reply = [null, `${process.pid} 777\n777 1\n`];
    h.e.requestInit(); // before boot: sent once booted
    await h.e.boot();
    assert.equal(h.e.booted, true);
    assert.ok(logs.log.some((l) => /indexed 2 transcripts/.test(l)));
    assert.ok(await until(() => h.out.history.length > 0 && h.e.sessions.get(SID)?.hostTab === 'tab-9'));

    const S = h.e.sessions.get(SID);
    assert.equal(S.cwd, CWD);
    assert.equal(S.branch, 'main');
    assert.equal(S.effort, 'high');
    assert.equal(S.title, 'Fix login bug');
    assert.equal(S.lastPrompt, 'Fix the login bug in auth.js');
    assert.deepEqual(S.tokDict(), { in: 3125, out: 440, cr: 32300, cw: 1300 });
    assert.equal(S.ctx, 7205);
    assert.equal(S.ctxMax, 1e6);
    close(S.cost, 0.0362);
    assert.equal(S.tools, 6);
    assert.equal(S.errors, 2);
    assert.equal(S.web, 1);
    assert.equal(S.prompts, 1);
    assert.equal(S.turnMs, 61000);
    assert.equal(S.endTurn, true);
    assert.deepEqual(S.byCat, { read: 1, web: 1, bash: 1, edit: 2, search: 1 });
    assert.equal(S.pending.size, 0);
    assert.equal(S.hostTab, 'tab-9'); // its parent (777) is the app's
    assert.deepEqual(h.e.chains.get(process.pid), [777, 1]);

    const A = h.e.agents.get(`${SID}:abc123`);
    assert.equal(A.desc, 'Find TODOs');
    assert.equal(A.type, 'Explore');
    assert.equal(A.bg, true);
    assert.equal(A.model, 'claude-haiku-4-5-20251001'); // "inherit" in the meta, the records' model wins
    assert.equal(A.errors, 1);
    assert.equal(A.pending.size, 1);
    close(A.cost, 0.00405);

    const G = h.e.G;
    assert.equal(G.tools, 6);
    assert.equal(G.errors, 2);
    assert.equal(G.prompts, 1);
    assert.equal(G.turns, 1);
    assert.equal(G.research.length, 1);
    assert.deepEqual(G.research[0].hosts, ['example.com', 'docs.example.org']);
    assert.equal(G.research[0].m, '3 sonuç');
    assert.equal(G.research[0].d, 5000);
    assert.equal(G.shells[0].l, 'Run tests');
    assert.equal(G.shells[0].cmd, 'npm test');
    assert.equal(G.shells[0].ok, false);
    assert.equal(G.ticker.find((x) => x.n === 'Read').st, 'ok');
    assert.equal(G.ticker.find((x) => x.n === 'Write').st, 'run');

    // The log: prompts, replies, tool calls (with their results) and system notes, oldest first.
    assert.equal(h.e.log.length, 15);
    assert.deepEqual(h.e.log.map((x) => x.k).filter((k) => k === 'tool').length, 6);
    const readEntry = h.e.log.find((x) => x.n === 'Read');
    assert.equal(readEntry.ok, true);
    assert.equal(readEntry.d, 2000);
    assert.ok(h.e.log.some((x) => x.k === 'prompt' && x.cmd === true && x.l === '/compact'));
    assert.ok(h.e.log.some((x) => x.k === 'sys' && x.l === 'kullanıcı kesti' && x.err));
    assert.ok(h.e.log.some((x) => x.k === 'sys' && x.l === 'arka plan görevi sonuç bildirdi'));
    assert.ok(h.e.log.some((x) => x.k === 'sys' && x.l === 'Overloaded' && x.err));
    assert.ok(h.e.log.some((x) => x.k === 'sys' && x.l === 'API Error: 529' && x.err));
    for (let i = 1; i < h.e.log.length; i++) assert.ok(h.e.log[i - 1].t <= h.e.log[i].t);

    // The init sent at boot.
    assert.equal(h.out.init.length, 1);
    assert.equal(h.out.init[0].log.length, 15);
    const snap = h.out.init[0].state;
    assert.equal(snap.booted, true);
    assert.equal(snap.app, true);
    assert.equal(snap.sessions.length, 1);
    const item = snap.sessions[0];
    assert.equal(item.name, 'demo-chat');
    assert.equal(item.status, 'waiting');
    assert.equal(item.waitingFor, 'permission');
    assert.equal(item.statusSince, t - 5000);
    assert.equal(item.model, 'opus 4.1');
    assert.equal(item.cwd, CWD);
    assert.equal(item.kind, 'interactive');
    assert.equal(item.entry, 'cli');
    assert.equal(item.pid, process.pid);
    assert.equal(item.spark.length, 30);
    // 30 buckets of 20 s: the Read at -590 s falls in or just out of the 10-minute window.
    assert.ok([5, 6].includes(item.spark.reduce((a, b) => a + b, 0)));
    assert.deepEqual(item.flags, []);
    assert.equal(item.agents.length, 1);
    assert.equal(item.agents[0].model, 'haiku 4.5');
    assert.equal(item.agents[0].running, true);
    assert.equal(item.agentsRunning, 1);
    assert.equal(snap.totals.live, 1);
    assert.equal(snap.totals.sessionsToday, 1);
    assert.equal(snap.totals.agentsToday, 1);
    assert.equal(snap.totals.runningAgents, 1);
    close(snap.totals.okRate, 4 / 6);
    close(snap.totals.cacheHit, 32300 / (3125 + 32300 + 1300));
    assert.equal(snap.totals.avgTurn, 61000);
    close(snap.totals.agentShare, 0.00405 / 0.0362);
    assert.equal(snap.pendingByCat.edit, 1);
    assert.deepEqual(snap.byModel.map((m) => [m.model, m.calls, m.priced]), [['opus 4.1', 5, true], ['haiku 4.5', 1, true]]);
    assert.equal(snap.files[0].short, 'src\\auth.js');
    assert.deepEqual([snap.files[0].r, snap.files[0].w, snap.files[0].collision], [1, 1, false]);
    assert.equal(snap.files[1].editors[0].a, 'abc123');
    assert.equal(snap.toolSpark.length, 30);
    assert.equal(snap.catSpark.web.length, 15);
    assert.equal(snap.limits, undefined);

    // The chats list.
    const hist = h.out.history[h.out.history.length - 1];
    assert.deepEqual(hist.map((i) => [i.id, i.cwd, i.title]), [[SID, CWD, 'Fix login bug']]);

    // Public views.
    assert.deepEqual(h.e.gitSources().sort(), [CWD, CWD + '\\src']);
    assert.deepEqual(h.e.written(), { [CWD + '\\src\\auth.js']: [SID], [CWD + '\\TODO.md']: [SID] });
    assert.deepEqual(h.e.gitSessions(), [{ id: SID, name: 'demo-chat', title: 'Fix login bug', status: 'waiting', live: true, cwd: CWD }]);
    assert.deepEqual(h.e.live(), [{ sessionId: SID, pid: process.pid, cwd: CWD, status: 'waiting', name: 'demo-chat', title: 'Fix login bug', host: 'app', tab: 'tab-9' }]);
    assert.equal(h.e.sessionCwd(SID), CWD);
    assert.equal(h.e.sessionCwd(SID), CWD); // cached
    assert.equal(h.e.sessionCwd('bad id!'), null);
    assert.equal(h.e.sessionCwd('22222222-0000-0000-0000-000000000000'), null);
    const items = await h.e.transcriptItems(SID, 3);
    assert.deepEqual(items.map((i) => i.k), ['say', 'sys', 'say']);
    assert.equal((await h.e.transcriptItems(SID, 'x')).length, 9); // bad limit: default 140
    assert.deepEqual(await h.e.transcriptItems('../etc'), []);
    assert.deepEqual(await h.e.transcriptItems('22222222-0000-0000-0000-000000000000'), []);

    // publishState: sends once, skips an identical state.
    h.e.stateDirty = true;
    h.e.publishState();
    assert.equal(h.out.state.length, 1);
    h.e.publishState(); // not dirty, < 5 s: nothing
    h.e.stateDirty = true;
    h.e.publishState(); // same JSON: not sent
    assert.ok(h.out.state.length <= 2);

    // Dismissed: gone while the same Claude runs.
    h.e.dismiss(SID, process.pid);
    assert.equal(h.e.snapshot().sessions.length, 0);
    h.e.dismiss('', 1);
    h.e.dismiss(SID, 0); // dismissed with no pid, but a live one runs: back, and the dismissal is forgotten
    assert.equal(h.e.snapshot().sessions.length, 1);
    assert.equal(h.e.dismissed.has(SID), false);
  } finally {
    h.done();
  }
});

test('ingest: duplicate records mark the older session as superseded', () => {
  const h = setup();
  try {
    const B = '22222222-bbbb-4bbb-8ccc-000000000002';
    h.e.ingest(rec('user', { uuid: 'r1', message: { content: 'hello' } }), cursor());
    h.e.ingest(rec('user', { uuid: 'r1', sessionId: B, message: { content: 'hello' } }), cursor());
    assert.equal(h.e.sessions.get(SID).supersededBy, B);
    assert.equal(h.e.sessions.has(B), false); // the copy itself isn't ingested
    assert.equal(h.e.G.prompts, 1);
    // A subagent's copy doesn't supersede; nor the same session again.
    const C = '33333333-cccc-4ccc-8ccc-000000000003';
    h.e.ingest(rec('user', { uuid: 'r2', sessionId: C, message: { content: 'x' } }), cursor());
    h.e.ingest(rec('user', { uuid: 'r2', sessionId: SID, message: { content: 'x' } }), cursor({ agentId: 'a1' }));
    h.e.ingest(rec('user', { uuid: 'r2', sessionId: C, message: { content: 'x' } }), cursor());
    assert.equal(h.e.sessions.get(C).supersededBy, null);
    // No session id at all: dropped.
    h.e.ingest({ type: 'user', message: { content: 'x' } }, cursor());
    // Session id from the cursor.
    h.e.ingest({ type: 'ai-title', aiTitle: 'From cursor' }, cursor({ sid: C }));
    assert.equal(h.e.sessions.get(C).title, 'From cursor');
    // The superseded, ended session isn't shown.
    assert.deepEqual(h.e.snapshot().sessions.map((s) => s.id), [C]);
  } finally {
    h.done();
  }
});

test('ingest: usage counted once per message id; context; branch; effort; old records', () => {
  const h = setup();
  try {
    const u = { input_tokens: 100, output_tokens: 10, cache_read_input_tokens: 1000, cache_creation_input_tokens: 5 };
    const asst = (id, extra = {}) => rec('assistant', { message: { id, model: 'claude-sonnet-4-5', usage: u, content: [] }, ...extra });
    h.e.ingest(asst('m1', { gitBranch: 'feature', effort: 'low', cwd: CWD }), cursor());
    h.e.ingest(asst('m1', { gitBranch: 'HEAD' }), cursor());
    const S = h.e.sessions.get(SID);
    assert.equal(S.tokIn, 100);
    assert.equal(S.ctx, 1105);
    assert.equal(S.ctxMax, 1e6);
    assert.equal(S.branch, 'feature'); // HEAD (detached) doesn't replace it
    assert.equal(S.effort, 'low');
    assert.equal(S.model, 'claude-sonnet-4-5');
    assert.equal(h.e.G.byModel.get('sonnet 4.5').calls, 1);
    close(h.e.G.saved, 1000 * (3 - 0.3) / 1e6);
    assert.equal(h.e.G.minutes.size, 1);

    // A record from before today: its context counts, its tokens don't.
    const old = iso(h.e.day0 - 60_000);
    h.e.ingest({ ...asst('m-old'), timestamp: old, message: { id: 'm-old', model: 'claude-sonnet-4-5', usage: { ...u, input_tokens: 7 }, content: [{ type: 'tool_use', id: 'old1', name: 'Bash', input: { command: 'ls' } }] } }, cursor());
    assert.equal(S.tokIn, 100);
    assert.equal(S.ctx, 1012);
    assert.equal(S.tools, 0);
    assert.equal(S.pending.has('old1'), true); // still waiting for its result
    h.e.ingest({ ...rec('user'), timestamp: old, message: { content: [{ type: 'tool_result', tool_use_id: 'old1', is_error: true }] } }, cursor());
    assert.equal(S.pending.size, 0);
    assert.equal(S.errors, 0);
    // A prompt from before today isn't counted.
    h.e.ingest({ ...rec('user'), timestamp: old, message: { content: 'yesterday' } }, cursor());
    assert.equal(S.prompts, 0);
  } finally {
    h.done();
  }
});

test('ingest: a usage record without a model resets the context window to 0 [reported bug]', () => {
  const h = setup();
  try {
    h.e.ingest(rec('assistant', { message: { id: 'a', model: 'claude-opus-4-1', usage: { input_tokens: 1 }, content: [] } }), cursor());
    const S = h.e.sessions.get(SID);
    assert.equal(S.ctxMax, 1e6);
    h.e.ingest(rec('assistant', { message: { id: 'b', usage: { input_tokens: 1 }, content: [] } }), cursor());
    assert.equal(S.model, 'claude-opus-4-1'); // the model is kept...
    assert.equal(S.ctxMax, 0); // ...but the window is computed from the record's (missing) model
    assert.equal(h.e.G.byModel.get('?').priced, false);
  } finally {
    h.done();
  }
});

test('ingest: Agent calls name their subagent; ids made up when missing; synthetic replies', () => {
  const h = setup();
  try {
    h.e.ingest(rec('assistant', { message: { content: [{ type: 'tool_use', id: 'tu_ag', name: 'Agent', input: { description: 'Explore code', subagent_type: 'Explore' } }, { type: 'tool_use', name: 'Glob', input: { pattern: '*.js' } }, { type: 'tool_use', id: 'tu_tk', name: 'Task', input: { description: 'Second' } }, { type: 'tool_use', id: 'tu_x', input: {} }] } }), cursor());
    const S = h.e.sessions.get(SID);
    assert.equal(S.pending.size, 4);
    const glob = [...S.pending.entries()].find(([, p]) => p.n === 'Glob');
    assert.match(glob[0], /^[0-9a-f-]{36}$/); // randomUUID
    assert.equal(S.pending.get('tu_x').n, '?');
    h.e.ingest(rec('user', { message: { content: [{ type: 'tool_result', tool_use_id: 'tu_ag' }] }, toolUseResult: { agentId: 'ag9', status: 'completed', resolvedModel: 'claude-sonnet-4-5' } }), cursor());
    const A = h.e.agents.get(`${SID}:ag9`);
    assert.deepEqual([A.desc, A.type, A.model], ['Explore code', 'Explore', 'claude-sonnet-4-5']);
    // The result's own description wins over the hint.
    h.e.ingest(rec('user', { message: { content: [{ type: 'tool_result', tool_use_id: 'tu_tk' }] }, toolUseResult: { agentId: 'ag10', description: 'From result' } }), cursor());
    assert.equal(h.e.agents.get(`${SID}:ag10`).desc, 'From result');
    // A result with no id, and one for a call never seen.
    h.e.ingest(rec('user', { message: { content: [{ type: 'tool_result' }, { type: 'tool_result', tool_use_id: 'ghost' }] } }), cursor());
    const ev = h.e.log.filter((x) => x.k === 'tool');
    assert.equal(ev.length, 4);
    // Synthetic message without text.
    h.e.ingest(rec('assistant', { message: { model: '<synthetic>', content: [] } }), cursor());
    assert.equal(h.e.log[h.e.log.length - 1].l, 'API hatası');
    // Non-array content, empty text, non-object message.
    h.e.ingest(rec('assistant', { message: { content: 'x' } }), cursor());
    h.e.ingest(rec('assistant', { message: null }), cursor());
    h.e.ingest(rec('user', { message: { content: 5 } }), cursor());
    h.e.ingest(rec('user', { message: { content: '   ' } }), cursor());
    h.e.ingest(rec('user', { message: { content: '<local-command-stdout>x</local-command-stdout>' } }), cursor());
    h.e.ingest(rec('system', { subtype: 'api_error' }), cursor());
    assert.equal(h.e.log[h.e.log.length - 1].l, 'api_error');
    h.e.ingest(rec('system', { subtype: 'informational' }), cursor());
    h.e.ingest(rec('system', { subtype: 'turn_duration', durationMs: 'x' }), cursor());
    assert.equal(h.e.G.turns, 0);
  } finally {
    h.done();
  }
});

test('ingest: sidechain records go to the subagent; loops; collisions between writers', () => {
  const h = setup();
  try {
    const sc = { isSidechain: true, agentId: 'zz' };
    for (let i = 0; i < 3; i++) h.e.ingest(rec('assistant', { ...sc, message: { content: [{ type: 'tool_use', id: `l${i}`, name: 'Read', input: { file_path: 'C:\\x\\f.js' } }] } }), cursor());
    const A = h.e.agents.get(`${SID}:zz`);
    assert.equal(A.isLoop, true);
    assert.equal(A.sig.length, 3);
    h.e.sessions.get(SID).live = true;
    assert.ok(h.e.snapshot().sessions[0].flags.includes('döngü?')); // a subagent's loop flags its session
    // Subagent prompts aren't the session's; a sidechain with no agent id stays the session's.
    h.e.ingest(rec('user', { ...sc, message: { content: 'sub prompt' } }), cursor());
    h.e.ingest(rec('user', { isSidechain: true, message: { content: [{ type: 'text', text: 'main' }] } }), cursor());
    assert.equal(h.e.G.prompts, 1);
    // A subagent's last-prompt and gitBranch are ignored.
    h.e.ingest(rec('last-prompt', { ...sc, lastPrompt: 'nope', gitBranch: 'sub' }), cursor());
    assert.equal(h.e.sessions.get(SID).lastPrompt, '');
    assert.equal(h.e.sessions.get(SID).branch, '');
    // Two writers on one file within 20 min: a collision, listed first.
    h.e.ingest(rec('assistant', { message: { content: [{ type: 'tool_use', id: 'w1', name: 'Edit', input: { file_path: 'C:\\x\\g.js' } }] } }), cursor());
    h.e.ingest(rec('assistant', { ...sc, message: { content: [{ type: 'tool_use', id: 'w2', name: 'Write', input: { file_path: 'C:\\x\\g.js' } }] } }), cursor());
    const snap = h.e.snapshot();
    assert.equal(snap.files[0].short, 'x\\g.js');
    assert.equal(snap.files[0].collision, true);
    assert.equal(snap.files[1].r, 3);
    assert.deepEqual(snap.sessions[0].flags, []); // the Write broke the run of three
  } finally {
    h.done();
  }
});

test('emit / rings / settleRings / flushEvents after boot', async () => {
  const h = setup();
  try {
    const S = h.e.session(SID);
    // Before boot rings grow unbounded; settleRings trims them by time.
    for (let i = 0; i < 70; i++) h.e.ringPush(h.e.G.research, { id: `r${i}`, t: 1000 - i }, 60);
    for (let i = 0; i < 300; i++) h.e.emit(h.e.ev('tool', 5000 - i, S, null, { id: `t${i}` }), true);
    h.e.emit(h.e.ev('tool', 1, S, null, {}), false); // not today: dropped
    assert.equal(h.e.log.length, 300);
    h.e.settleRings();
    assert.equal(h.e.log.length, 240);
    assert.equal(h.e.log[0].t, 5000 - 239);
    assert.equal(h.e.logIndex.size, 240);
    assert.equal(h.e.G.research.length, 60);
    assert.equal(h.e.G.research[0].t, 1000 - 59);
    assert.equal(h.e.outbox.length, 0);

    h.e.booted = true;
    const A = h.e.agent(SID, 'q');
    h.e.emit(h.e.ev('tool', 9000, S, A, { id: 'new', n: 'Read' }), true);
    assert.equal(h.e.log.length, 240); // shifted one out
    assert.equal(h.e.log[h.e.log.length - 1].a, 'q');
    h.e.emit({ k: 'result', id: 'new', ok: false, d: 7, m: 'meta' }, true);
    h.e.emit({ k: 'result', id: 'new', ok: true, m: 'again' }, true); // no d: kept
    h.e.emit({ k: 'result', id: 'unknown', ok: true }, true);
    h.e.emit({ k: 'usage', t: 1 }, true); // not logged, sent
    const entry = h.e.logIndex.get('new');
    assert.deepEqual([entry.ok, entry.d, entry.m], [true, 7, 'again']);
    assert.equal(h.e.outbox.length, 5);
    assert.ok(h.e.flushTimer);
    h.e.flushEvents();
    assert.equal(h.out.events.length, 1);
    assert.equal(h.out.events[0].length, 5);
    h.e.flushEvents(); // nothing queued
    assert.equal(h.out.events.length, 1);
    for (let i = 0; i < 3; i++) h.e.ringPush(h.e.G.shells, { t: i }, 2);
    assert.equal(h.e.G.shells.length, 2);
    // The flush timer sends queued events on its own ~120 ms later.
    h.e.emit({ k: 'usage', t: 2 }, true);
    assert.ok(await until(() => h.out.events.length === 2));
    assert.deepEqual(h.out.events[1], [{ k: 'usage', t: 2 }]);
  } finally {
    h.done();
  }
});

test('maybeNewDay resets the day; same day does nothing', () => {
  const h = setup();
  try {
    const S = h.e.session(SID);
    const A = h.e.agent(SID, 'a');
    S.tools = 3; A.tools = 2; h.e.G.tools = 5;
    h.e.seenMsg.add('m'); h.e.recOwner.set('u', SID);
    h.e.maybeNewDay();
    assert.equal(S.tools, 3);
    h.e.day0 = 1;
    h.e.maybeNewDay();
    assert.equal(h.e.day0, h.T.dayStart());
    assert.deepEqual([S.tools, A.tools, h.e.G.tools, h.e.seenMsg.size, h.e.recOwner.size], [0, 0, 0, 0, 0]);
  } finally {
    h.done();
  }
});

test('statusOf / shownStatus / agentView', () => {
  const h = setup();
  try {
    const t = now();
    const S = h.e.session(SID);
    S.lastTs = t - 1000;
    assert.equal(h.e.statusOf(S, t), 'busy'); // just written, not live
    S.lastTs = t - 100_000;
    assert.equal(h.e.statusOf(S, t), 'ended');
    S.live = true;
    for (const [reg, want] of [['idle', 'idle'], ['shell', 'idle'], ['waiting', 'waiting'], ['busy', 'busy'], [null, 'busy']]) {
      S.reg = reg;
      assert.equal(h.e.statusOf(S, t), want, String(reg));
    }
    S.reg = 'idle';
    const A = h.e.agent(SID, 'bgagent');
    A.bg = true;
    A.lastTs = t - 10 * 60_000;
    A.endTurn = true;
    assert.equal(h.e.shownStatus(S, [A], t), 'idle');
    A.pending.set('p', { t });
    assert.equal(h.e.shownStatus(S, [A], t), 'busy');
    A.pending.clear();
    A.lastTs = t - 10_000;
    assert.equal(h.e.shownStatus(S, [A], t), 'busy'); // finished moments ago
    A.lastTs = t - 2 * 60_000;
    A.endTurn = false;
    assert.equal(h.e.shownStatus(S, [A], t), 'busy'); // still mid-turn
    A.bg = false;
    assert.equal(h.e.shownStatus(S, [A], t), 'idle');

    // agentView: running while pending or mid-turn (15 min while the session is busy, 3 otherwise).
    A.endTurn = false;
    A.lastTs = t - 5 * 60_000;
    S.reg = 'busy';
    assert.equal(h.e.agentView(A, S, t).running, true);
    S.reg = 'idle';
    assert.equal(h.e.agentView(A, S, t).running, false);
    A.type = 'Plan';
    assert.equal(h.e.agentView(A, S, t).desc, 'Plan');
    A.type = '';
    assert.equal(h.e.agentView(A, S, t).desc, 'bgagent');
    A.pending.set('old', { t: t - 4 * 3_600_000 });
    assert.equal(h.e.agentView(A, S, t).pending.length, 0); // over 3 h old: dropped
    assert.equal(h.e.hostLabel(S), 'term');
    S.hostTab = true;
    assert.equal(h.e.hostLabel(S), 'app');
    S.live = false; S.hostTab = null;
    assert.equal(h.e.hostLabel(S), null);
    assert.equal(h.e.displayName(Object.assign(new h.T.Session('abcdef12'), { cwd: 'C:\\code\\proj' })), 'proj-ab');
  } finally {
    h.done();
  }
});

test('snapshot: flags, filtering, ordering', () => {
  const h = setup();
  try {
    const t = now();
    const mk = (id, over) => Object.assign(h.e.session(id), { cwd: CWD, lastTs: t - 1000, ...over });
    const a = mk('aaaaaaaa-1', { live: true, pid: 1, reg: 'busy', model: 'claude-opus-4', ctx: 900_000, ctxMax: 1e6, sig: ['x', 'x', 'x'] });
    a.pending.set('slow', { n: 'Bash', c: 'bash', l: 'sleep', t: t - 4 * 60_000 });
    a.pending.set('nocat', { n: 'X', l: '', t: t - 1000 });
    a.last = { n: 'Bash' };
    mk('bbbbbbbb-2', { live: true, pid: 2, reg: 'waiting', lastTs: t - 5000 });
    mk('cccccccc-3', { live: true, pid: 3, reg: 'idle' });
    mk('dddddddd-4', { lastTs: t - 31 * 60_000 }); // ended long ago: hidden
    mk('eeeeeeee-5', { lastTs: t - 10 * 60_000, endedAt: t - 9 * 60_000 }); // ended recently
    const old = h.e.agent('aaaaaaaa-1', 'old');
    old.lastTs = t - 20 * 60_000; old.endTurn = true;
    const recent = h.e.agent('aaaaaaaa-1', 'recent');
    recent.lastTs = t - 60_000; recent.endTurn = true;
    const run = h.e.agent('aaaaaaaa-1', 'run');
    run.lastTs = t - 2 * 60_000;
    const snap = h.e.snapshot();
    assert.deepEqual(snap.sessions.map((s) => s.status), ['waiting', 'idle', 'busy', 'ended']);
    const A = snap.sessions.find((s) => s.id === 'aaaaaaaa-1');
    assert.deepEqual(A.flags, ['döngü?', 'yavaş araç', 'bağlam %80+']);
    assert.deepEqual(A.agents.map((x) => x.id), ['run', 'recent']); // running first, the 20-min-old one hidden
    assert.equal(A.last.n, 'Bash');
    assert.equal(snap.pendingByCat.bash, 1);
    assert.equal(snap.pendingByCat.plan, 1);
    const E = snap.sessions.find((s) => s.id === 'eeeeeeee-5');
    assert.equal(E.statusSince, t - 9 * 60_000);
    assert.equal(E.host, null);
    assert.equal(snap.sessions.find((s) => s.id === 'bbbbbbbb-2').name, 'demo-bb');
    assert.equal(snap.totals.okRate, 1);
    assert.equal(snap.totals.cacheHit, 0);
    assert.equal(snap.totals.agentShare, 0);
    // Old minute buckets are dropped.
    h.e.G.minutes.set(Math.floor(t / 60_000) - 100, { tools: 1, tok: 0, cost: 0, cats: {} });
    h.e.G.minutes.set(Math.floor(t / 60_000), { tools: 5, tok: 50, cost: 0.12345678, cats: { web: 2 } });
    const s2 = h.e.snapshot();
    assert.equal(h.e.G.minutes.size, 1);
    assert.equal(s2.toolSpark[29], 5);
    assert.equal(s2.costSpark[29], 0.1235);
    assert.equal(s2.catSpark.web[14], 2);
    assert.equal(s2.totals.toolsPerMin, 1);
    close(s2.totals.costPerHour, 0.1235 * 4);
  } finally {
    h.done();
  }
});

test('readLimits: none, missing file, parsed and cached by mtime', () => {
  const h0 = setup();
  try {
    assert.equal(h0.e.readLimits(), null);
  } finally {
    h0.done();
  }
  const { dir, cleanup } = tmpDir();
  const lf = path.join(dir, 'limits.json');
  const h = setup({ limitsFile: lf });
  try {
    assert.equal(h.e.readLimits(), null);
    write(lf, JSON.stringify({ rate_limits: { five_hour: { used_percentage: 10, resets_at: 2 } } }));
    assert.equal(h.e.readLimits().fiveHour.pct, 10);
    assert.equal(h.e.snapshot().limits.fiveHour.resetsAt, 2000);
    fs.writeFileSync(lf, JSON.stringify({ rate_limits: { five_hour: { used_percentage: 99 } } }));
    const t = Date.now() / 1000 + 10;
    fs.utimesSync(lf, t, t);
    assert.equal(h.e.readLimits().fiveHour.pct, 99);
    fs.rmSync(lf);
    assert.equal(h.e.readLimits(), null);
    assert.equal(h.e.limits.mtime, -1);
  } finally {
    h.done();
    cleanup();
  }
});

test('pollRegistry: which entries count, caching, superseding, ending', async () => {
  const h = setup();
  try {
    const B = '22222222-bbbb-4bbb-8ccc-000000000002';
    h.e.pollRegistry(); // no folder yet
    write(path.join(h.registry, 'notes.txt'), 'x');
    write(path.join(h.registry, 'abc.json'), '{}');
    write(path.join(h.registry, '10.json'), '{half');
    regEntry(h, '11.json', { pid: process.pid });
    regEntry(h, '12.json', { pid: process.pid, sessionId: 'bg-session-1', kind: 'background' });
    regEntry(h, '13.json', { pid: process.pid, sessionId: 'spare-session', spare: true });
    regEntry(h, '14.json', { pid: process.pid, sessionId: 'hosted-session', hostSessionId: 'x' });
    regEntry(h, '15.json', { pid: 2 ** 30, sessionId: 'dead-session' });
    const main = regEntry(h, '1.json', { pid: process.pid, sessionId: SID, cwd: CWD, status: 'idle', name: 'n1', updatedAt: 200, startedAt: 50 });
    // A second live process (our parent) on the same conversation, updated earlier: doesn't take the card.
    regEntry(h, '2.json', { pid: process.ppid, sessionId: SID, status: 'busy', updatedAt: 100 });
    h.e.pollRegistry();
    assert.deepEqual([...h.e.sessions.keys()], [SID]);
    const S = h.e.sessions.get(SID);
    assert.deepEqual([S.live, S.pid, S.reg, S.name, S.cwd, S.statusSince, S.firstTs, S.regUpdated], [true, process.pid, 'idle', 'n1', CWD, 200, 50, 200]);
    assert.equal(h.e.regCache.size, 6); // 10.json (half written) and 11.json (no session id) aren't cached

    // Unchanged files are not read again; an idle session's stale pending calls are cleared.
    S.pending.set('x', { t: 1 });
    h.e.stateDirty = false;
    h.e.pollRegistry();
    assert.equal(S.pending.size, 0);
    assert.equal(h.e.stateDirty, true);

    // Same process, new session id: the old chat moved on.
    fs.writeFileSync(main, JSON.stringify({ pid: process.pid, sessionId: B, status: 'busy', updatedAt: 300 }));
    const t = Date.now() / 1000 + 5;
    fs.utimesSync(main, t, t);
    fs.rmSync(path.join(h.registry, '2.json'));
    h.e.pollRegistry();
    assert.equal(S.supersededBy, B);
    assert.equal(S.live, false); // no entry holds it any more
    assert.ok(S.endedAt > 0);
    assert.equal(h.e.sessions.get(B).live, true);
    assert.equal(h.e.sessions.get(B).statusSince, 300);
    assert.equal(h.e.regCache.has('2.json'), false);

    // The cached entry's session's owner is gone (another pid holds the card, now dead): read again.
    const Bs = h.e.sessions.get(B);
    Bs.pid = 2 ** 30;
    h.e.pollRegistry();
    assert.equal(Bs.pid, process.pid);
    // The transcript exists: its read is queued.
    write(h.e.transcriptFor(CWD, 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'), '');
    regEntry(h, '3.json', { pid: process.pid, sessionId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', cwd: CWD });
    h.e.pollRegistry();
    assert.equal(h.e.bootPumps.length, 1);
    assert.equal(h.e.sessions.get('cccccccc-cccc-4ccc-8ccc-cccccccccccc').reg, 'busy');
  } finally {
    h.done();
  }
});

test('running / pollProcesses: procStart verified against the process list (Windows)', { skip: process.platform !== 'win32' && 'procStart is Windows-only' }, async () => {
  const h = setup();
  try {
    const start = '133000000000000000';
    regEntry(h, '1.json', { pid: process.pid, sessionId: SID, procStart: start });
    h.cp.reply = [null, `${process.pid} 1 133000000000005000\n`];
    h.e.pollRegistry();
    assert.equal(h.e.sessions.has(SID), false); // waits for the process list
    assert.equal(h.e.checking.size, 1);
    assert.ok(await until(() => h.e.sessions.get(SID)?.live === true));
    assert.equal(h.e.verified.get(`${process.pid}:${start}`), true);
    assert.equal(h.cp.calls, 1);

    // A different start under that pid: a ghost (the pid was given to another process).
    const B = 'bbbbbbbb-0000-4000-8000-00000000000b';
    regEntry(h, '2.json', { pid: process.pid, sessionId: B, procStart: '999' });
    h.e.pollRegistry();
    assert.ok(await until(() => h.e.checking.size === 0 && h.e.verified.has(`${process.pid}:999`)));
    assert.equal(h.e.verified.get(`${process.pid}:999`), false);
    assert.equal(h.e.sessions.has(B), false);
    assert.equal(h.e.running(process.pid, '999'), false);
    // Verdicts for keys no registry entry has are dropped at the next poll.
    h.e.verified.set(`${process.pid}:12345`, true);
    h.e.pollRegistry();
    assert.equal(h.e.verified.has(`${process.pid}:12345`), false);
    // A dead pid forgets its verdict.
    h.e.verified.set(`${2 ** 30}:1`, true);
    assert.equal(h.e.running(2 ** 30, '1'), false);
    assert.equal(h.e.verified.has(`${2 ** 30}:1`), false);
    // No process list: taken as it is, and none asked for a minute.
    const C = 'cccccccc-0000-4000-8000-00000000000c';
    h.cp.reply = [new Error('no'), ''];
    regEntry(h, '3.json', { pid: process.pid, sessionId: C, procStart: '555' });
    h.e.pollRegistry();
    assert.ok(await until(() => h.e.sessions.get(C)?.live === true));
    assert.equal(h.e.verified.get(`${process.pid}:555`), true);
    assert.ok(h.e.procRetryAt > Date.now());
    assert.equal(h.e.running(process.pid, '556'), true); // within the retry window
    // Entries no longer in the registry lose their verdicts.
    fs.rmSync(path.join(h.registry, '1.json'));
    h.e.pollRegistry();
    assert.equal(h.e.verified.has(`${process.pid}:${start}`), false);
  } finally {
    h.done();
  }
});

test('pollProcesses: context window follows settings; chains; spawn failures', async () => {
  const h = setup({ isAppPid: () => false });
  try {
    const S = Object.assign(h.e.session(SID), { live: true, pid: process.pid, model: 'claude-opus-4', ctxMax: 5 });
    Object.assign(h.e.session('other-session-x'), { live: true, pid: null });
    h.e.chains.set(424242, [1]); // a pid no longer live: dropped
    h.cp.throws = true;
    h.e.pollProcesses();
    assert.equal(S.ctxMax, 1e6);
    assert.equal(h.e.chains.has(424242), false);
    await sleep(10);
    assert.equal(h.e.procBusy, false); // the failed spawn was reported, not left busy
    assert.ok(logs.error.some((l) => /spawn failed/.test(l)));
    h.cp.throws = false;
    h.cp.reply = [null, `${process.pid} 50\n50 1\n`];
    h.e.pollProcesses();
    h.e.pollProcesses(); // while busy: no second list
    await until(() => h.e.chains.has(process.pid));
    assert.deepEqual(h.e.chains.get(process.pid), [50, 1]);
    assert.equal(h.cp.calls, 2);
    h.e.pollProcesses(); // known chain: nothing to ask
    await sleep(5);
    assert.equal(h.cp.calls, 2);
    // Stopped while the list was on its way: ignored.
    h.e.chains.clear();
    h.e.pollProcesses();
    h.e.stopped = true;
    await sleep(10);
    assert.equal(h.e.chains.size, 0);
  } finally {
    h.done();
  }
});

test('matchTabs: isAppPid hits, misses and throws', () => {
  let mode = 'tab';
  const h = setup({ isAppPid: (pid) => { if (mode === 'throw') throw new Error('isAppPid broke'); return mode === 'tab' && pid === 60 ? 'tab-1' : mode === 'true' ? true : false; } });
  try {
    const S = Object.assign(h.e.session(SID), { live: true, pid: 61 });
    h.e.chains.set(61, [60]);
    h.e.matchTabs();
    assert.equal(S.hostTab, 'tab-1');
    mode = 'true';
    h.e.matchTabs();
    assert.equal(S.hostTab, true);
    assert.equal(h.e.live()[0].tab, null);
    assert.equal(h.e.live()[0].host, 'app');
    mode = 'throw';
    h.e.matchTabs();
    assert.equal(S.hostTab, null);
    assert.ok(logs.error.some((l) => /isAppPid broke/.test(l)));
  } finally {
    h.done();
  }
});

test('pump: whole lines only, appends, truncation, concurrent reads, missing files', async () => {
  const h = setup();
  try {
    const fp = path.join(h.projects, 'C--work-demo', `${SID}.jsonl`);
    const prompt = (text) => JSON.stringify(rec('user', { message: { content: text } }));
    await h.e.pump(fp); // missing: nothing, no throw
    const third = prompt('three');
    write(fp, `${prompt('one')}\n${prompt('two')}\n${third.slice(0, -6)}`);
    await h.e.pump(fp);
    const S = h.e.sessions.get(SID);
    assert.equal(S.prompts, 2);
    const c = h.e.cursors.get(h.e.cursorKey(fp));
    assert.equal(c.sid, SID);
    assert.ok(c.rest && c.rest.length > 0);
    fs.appendFileSync(fp, third.slice(-6) + '\n');
    await h.e.pump(fp);
    assert.equal(S.prompts, 3);
    assert.equal(c.rest, null);
    // Concurrent: the second ask is done right after the first.
    fs.appendFileSync(fp, `${prompt('four')}\n`);
    const p1 = h.e.pump(fp);
    const p2 = h.e.pump(fp.toUpperCase()); // same file, other spelling, same cursor (Windows)
    await Promise.all([p1, p2]);
    assert.equal(S.prompts, 4);
    // Truncated (rewritten shorter): read from the start again.
    fs.writeFileSync(fp, `${prompt('five')}\n`);
    await h.e.pump(fp);
    assert.equal(S.prompts, 5);
    // Lines without a trailing newline in a later chunk stay pending.
    fs.appendFileSync(fp, prompt('six'));
    await h.e.pump(fp);
    assert.equal(S.prompts, 5);
  } finally {
    h.done();
  }
});

test('pump: big transcripts seek to today and lines crossing chunk boundaries are kept', async () => {
  const h = setup();
  try {
    // > 8 MB: starts near (day start - 10 min), skipping its first partial line.
    const fp = path.join(h.projects, 'p', `${SID}.jsonl`);
    const fd = fs.openSync(write(fp, ''), 'w');
    const t0 = h.e.day0 - 3 * 3_600_000;
    const pad = 'x'.repeat(1000);
    let buf = '';
    for (let i = 0; i < 9000; i++) {
      buf += JSON.stringify({ type: 'user', sessionId: 'old-session-0001', timestamp: iso(t0 + i * 1000), pad, message: { content: `old ${i}` } }) + '\n';
      if (buf.length > 1 << 20) { fs.writeSync(fd, buf); buf = ''; }
    }
    fs.writeSync(fd, buf);
    fs.writeSync(fd, JSON.stringify(rec('user', { message: { content: 'today' } })) + '\n');
    fs.closeSync(fd);
    assert.ok(fs.statSync(fp).size > 8 << 20);
    await h.e.pump(fp);
    assert.equal(h.e.sessions.get(SID).prompts, 1);
    const old = h.e.sessions.get('old-session-0001');
    assert.ok(old.firstTs > t0 + 1000 * 1000, 'the head of the file was skipped');

    // 5 MB of small records: read in two 4 MB chunks, every line once.
    const fp2 = path.join(h.projects, 'q', 'bbbbbbbb-0000-0000-0000-000000000002.jsonl');
    const line = (i) => JSON.stringify({ type: 'user', sessionId: 'bbbbbbbb-0000-0000-0000-000000000002', timestamp: iso(now() - 1000), message: { content: `p${i} ${'y'.repeat(180)}` } });
    const lines = Array.from({ length: 26000 }, (_, i) => line(i));
    write(fp2, lines.join('\n') + '\n');
    assert.ok(fs.statSync(fp2).size > 4 << 20);
    await h.e.pump(fp2);
    assert.equal(h.e.sessions.get('bbbbbbbb-0000-0000-0000-000000000002').prompts, 26000);
  } finally {
    h.done();
  }
});

test('newCursor / loadAgentMeta / collectFiles / transcriptPath', async () => {
  const h = setup();
  try {
    const c0 = h.e.newCursor(path.join(h.tmp.dir, 'elsewhere.jsonl'));
    assert.deepEqual([c0.sid, c0.agentId], [null, null]);
    const c1 = h.e.newCursor(path.join(h.projects, 'p', 'sid-1234.jsonl'));
    assert.equal(c1.sid, 'sid-1234');
    write(path.join(h.projects, 'p', 'sid-1234', 'subagents', 'agent-x1.meta.json'), JSON.stringify({ description: 'D', agentType: 'T', model: 'claude-x', requestShape: 'foreground' }));
    const c2 = h.e.newCursor(path.join(h.projects, 'p', 'sid-1234', 'subagents', 'agent-x1.jsonl'));
    assert.deepEqual([c2.sid, c2.agentId], ['sid-1234', 'x1']);
    const A = h.e.agents.get('sid-1234:x1');
    assert.deepEqual([A.desc, A.type, A.model, A.bg], ['D', 'T', 'claude-x', false]);
    write(path.join(h.projects, 'p', 'sid-1234', 'subagents', 'agent-x2.meta.json'), '[1]');
    h.e.newCursor(path.join(h.projects, 'p', 'sid-1234', 'subagents', 'agent-x2.jsonl'));
    assert.equal(h.e.agents.has('sid-1234:x2'), false); // not an object: ignored

    const keep = [
      write(path.join(h.projects, 'p', 'a.jsonl'), ''),
      write(path.join(h.projects, 'p', 'sid-1234', 'subagents', 'agent-x1.jsonl'), ''),
    ];
    write(path.join(h.projects, 'p', 'memory', 'm.jsonl'), '');
    write(path.join(h.projects, 'p', 'dir.v2', 'd.jsonl'), '');
    write(path.join(h.projects, 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'deep.jsonl'), '');
    const old = write(path.join(h.projects, 'p', 'old.jsonl'), '');
    fs.utimesSync(old, 1000, 1000);
    const got = (await h.e.collectFiles(Date.now() - 60_000)).sort();
    assert.deepEqual(got, keep.sort());
    assert.ok((await h.e.collectFiles(0)).includes(old));

    // transcriptPath: the cursor's, the session's folder, any project folder, none.
    assert.equal(h.e.transcriptPath('sid-1234'), c1.path === undefined ? null : null); // cursors only count once pumped
    h.e.cursors.set('k', c1);
    assert.equal(h.e.transcriptPath('sid-1234'), c1.path);
    const viaCwd = write(h.e.transcriptFor('C:\\w\\x', 'sid-5678'), '');
    Object.assign(h.e.session('sid-5678'), { cwd: 'C:\\w\\x' });
    assert.equal(h.e.transcriptPath('sid-5678'), viaCwd);
    assert.equal(path.basename(path.dirname(viaCwd)), 'C--w-x');
    const scan = write(path.join(h.projects, 'zz', 'sid-9999.jsonl'), '');
    Object.assign(h.e.session('sid-9999'), { cwd: 'C:\\moved' });
    assert.equal(h.e.transcriptPath('sid-9999'), scan);
    assert.equal(h.e.transcriptPath('sid-0000'), null);
  } finally {
    h.done();
  }
});

test('transcriptItems widens its tail until enough items show', async () => {
  const h = setup();
  try {
    const fp = path.join(h.projects, 'p', `${SID}.jsonl`);
    const big = JSON.stringify({ type: 'progress', pad: 'z'.repeat(100_000) });
    write(fp, jsonl([rec('user', { message: { content: 'first' } }), ...Array(30).fill(big), rec('user', { message: { content: 'last' } })]));
    assert.ok(fs.statSync(fp).size > 2 << 20);
    h.e.cursors.set('k', { path: fp, sid: SID, agentId: null });
    const items = await h.e.transcriptItems(SID);
    assert.deepEqual(items.map((i) => i.x), ['first', 'last']);
    fs.rmSync(fp);
    assert.deepEqual(await h.e.transcriptItems(SID), []); // gone since
  } finally {
    h.done();
  }
});

test('scanHistory: lists saved chats with a folder and a title or prompt; re-reads only changes', async () => {
  const h = setup();
  try {
    await h.e.scanHistory(false); // no projects folder: nothing changed, nothing sent
    assert.equal(h.out.history.length, 0);
    const A = 'aaaaaaaa-0000-0000-0000-00000000000a';
    const B = 'bbbbbbbb-0000-0000-0000-00000000000b';
    const fa = write(path.join(h.projects, 'p', `${A}.jsonl`), jsonl([{ type: 'user', cwd: 'C:\\a' }, { type: 'last-prompt', lastPrompt: 'hello' }]));
    write(path.join(h.projects, 'p', `${B}.jsonl`), jsonl([{ type: 'user', cwd: 'C:\\b' }])); // no title, no prompt
    write(path.join(h.projects, 'p', 'notes.txt'), 'x');
    write(path.join(h.projects, 'file-at-top.jsonl'), 'x');
    await h.e.scanHistory(false);
    assert.equal(h.out.history.length, 1);
    assert.deepEqual(h.out.history[0], [{ id: A, cwd: 'C:\\a', mtime: fs.statSync(fa).mtimeMs, size: fs.statSync(fa).size, title: '', lastPrompt: 'hello' }]);
    await h.e.scanHistory(false); // unchanged: nothing sent
    assert.equal(h.out.history.length, 1);
    await h.e.scanHistory(true); // forced
    assert.equal(h.out.history.length, 2);
    fs.rmSync(fa);
    await h.e.scanHistory(false); // removed
    assert.deepEqual(h.out.history[2], []);
    // Asked again while running: runs once more after.
    const p = h.e.scanHistory(true);
    await h.e.scanHistory(true);
    assert.equal(h.e.historyAgain, true);
    await p;
    assert.equal(h.e.historyAgain, false);
    assert.equal(h.out.history.length, 4); // the follow-up found nothing new
    // Stopped: returns before sending.
    write(path.join(h.projects, 'p', `${A}.jsonl`), jsonl([{ type: 'user', cwd: 'C:\\a' }, { type: 'last-prompt', lastPrompt: 'again' }]));
    h.e.stopped = true;
    await h.e.scanHistory(true);
    assert.equal(h.out.history.length, 4);
  } finally {
    h.done();
  }
});

test('timers and watches: every, due, pumpRecent, scanNew, registryChanged, historySoon, startWatch', async () => {
  const h = setup();
  try {
    // every: errors, sync or async, are reported and the timer keeps going.
    let n = 0;
    h.e.every(0.01, () => { n++; throw new Error('tick broke'); });
    h.e.every(0.01, () => Promise.reject(new Error('async tick broke')));
    await until(() => n >= 2 && logs.error.some((l) => /async tick broke/.test(l)));
    assert.ok(logs.error.some((l) => /tick broke/.test(l)));
    h.e.stop();
    const m = n;
    await sleep(30);
    assert.equal(n, m);
    h.e.stopped = false;

    assert.equal(h.e.due('x', 1000), true);
    assert.equal(h.e.due('x', 1000), false);

    // pumpRecent: transcripts of sessions active in the last 30 min are read again.
    Object.assign(h.e.session('s-recent-1'), { lastTs: now() });
    Object.assign(h.e.session('s-old-0001'), { lastTs: now() - 31 * 60_000 });
    h.e.cursors.set('a', { path: 'A.jsonl', sid: 's-recent-1' });
    h.e.cursors.set('b', { path: 'B.jsonl', sid: 's-old-0001' });
    h.e.cursors.set('c', { path: 'C.jsonl', sid: null });
    h.e.pumpRecent();
    assert.deepEqual(h.e.bootPumps, ['A.jsonl']);

    // scanNew: files written since the last scan; one at a time.
    write(path.join(h.projects, 'p', 'n.jsonl'), '');
    h.e.lastScan = Date.now() - 1000;
    h.e.scanning = true;
    await h.e.scanNew();
    assert.equal(h.e.bootPumps.length, 1);
    h.e.scanning = false;
    await h.e.scanNew();
    assert.equal(h.e.bootPumps.length, 2);

    // registryChanged: one poll 50 ms later, however many changes.
    regEntry(h, '1.json', { pid: process.pid, sessionId: SID, cwd: CWD });
    h.e.registryChanged();
    h.e.registryChanged();
    assert.ok(await until(() => h.e.sessions.get(SID)?.live));

    h.e.historySoon();
    const ht = h.e.historyTimer;
    h.e.historySoon();
    assert.equal(h.e.historyTimer, ht);

    // Watches: new transcripts are read as they're written, new registry files polled.
    h.e.booted = true;
    h.e.startWatch();
    assert.ok(h.e.watchers.projects && h.e.watchers.registry);
    h.e.historyTimer && clearTimeout(h.e.historyTimer);
    h.e.historyTimer = null;
    const fp = write(path.join(h.projects, 'p', 'watched-0001.jsonl'), JSON.stringify(rec('user', { sessionId: 'watched-0001', message: { content: 'hi' } })) + '\n');
    assert.ok(await until(() => h.e.sessions.get('watched-0001')?.prompts === 1), 'watched transcript read');
    assert.ok(h.e.historyTimer, 'a new transcript schedules the chats list');
    fs.appendFileSync(fp, '');
    regEntry(h, '2.json', { pid: process.pid, sessionId: 'reg-watched-1', cwd: CWD });
    assert.ok(await until(() => h.e.sessions.get('reg-watched-1')?.live), 'watched registry polled');
    // A watch that errors is dropped (and started again later).
    const w = h.e.watchers.projects;
    w.emit('error', new Error('gone'));
    assert.equal(h.e.watchers.projects, null);
    h.e.startWatch();
    assert.ok(h.e.watchers.projects);
    h.e.stop();
    assert.deepEqual(h.e.watchers, { projects: null, registry: null });
    h.e.startWatch(); // stopped: nothing
    assert.equal(h.e.watchers.projects, null);
    const rt = h.e.regTimer, ht2 = h.e.historyTimer;
    h.e.registryChanged();
    h.e.historySoon();
    assert.equal(h.e.regTimer, rt); // nothing new scheduled once stopped
    assert.equal(h.e.historyTimer, ht2);
  } finally {
    h.done();
  }
});

test('startWatch without folders, and call() guards', () => {
  const h = setup();
  try {
    h.e.startWatch();
    assert.deepEqual(h.e.watchers, { projects: null, registry: null });
    h.e.handlers.onState = () => { throw new Error('page gone'); };
    h.e.call('onState', '{}');
    assert.ok(logs.error.some((l) => /page gone/.test(l)));
    h.e.call('missing', '{}');
    h.e.publishState(); // not booted: nothing
    h.e.stopped = true;
    let called = false;
    h.e.handlers.onInit = () => { called = true; };
    h.e.call('onInit', '{}');
    assert.equal(called, false);
  } finally {
    h.done();
  }
});

test('createEngine: start, init on request, stop; boot stopped midway', async () => {
  const tmp = tmpDir();
  let stopLater = () => {};
  try {
    const M = loadEngine({ home: tmp.dir, stubs: { 'node:child_process': fakeCp() } });
    const claude = path.join(tmp.dir, 'c');
    const proj = path.join(claude, 'projects', 'C--work-demo');
    write(path.join(proj, `${SID}.jsonl`), fixture('claude-session.jsonl'));
    let init = null;
    const eng = M.createEngine({ claudeDir: claude, onInit: (j) => { init = JSON.parse(j); } });
    stopLater = eng.stop;
    assert.deepEqual(Object.keys(eng).sort(), ['dismiss', 'gitSessions', 'gitSources', 'live', 'requestInit', 'sessionCwd', 'setOthers', 'start', 'stop', 'transcriptItems', 'written']);
    eng.start();
    eng.start(); // once
    assert.ok(await until(() => { eng.requestInit(); return init !== null; }));
    assert.equal(init.state.sessions.length, 1); // written seconds ago: shown as just active
    assert.deepEqual(eng.live(), []);
    assert.deepEqual(eng.gitSources(), [CWD, CWD + '\\src']);
    assert.ok(eng.gitSessions().length === 1);
    assert.deepEqual(Object.keys(eng.written()), [CWD + '\\src\\auth.js']);
    assert.equal(eng.sessionCwd(SID), CWD);
    assert.equal((await eng.transcriptItems(SID, 2)).length, 2);
    eng.setOthers([]);
    eng.dismiss(SID, 0);
    await sleep(1100); // the 1 s safety-net timer runs once (registry, recent transcripts, scan, state)
    eng.stop();
    eng.start(); // stopped: no restart

    // Stopped while booting: never boots.
    const e2 = new M.__t.RadarEngine({ claudeDir: claude });
    const p = e2.boot();
    e2.stop();
    await p;
    assert.equal(e2.booted, false);
    // Default folders.
    const saved = process.env.CLAUDE_CONFIG_DIR;
    process.env.CLAUDE_CONFIG_DIR = path.join(tmp.dir, 'cfg');
    assert.equal(new M.__t.RadarEngine({}).claudeDir, path.join(tmp.dir, 'cfg'));
    delete process.env.CLAUDE_CONFIG_DIR;
    assert.equal(new M.__t.RadarEngine({}).claudeDir, path.join(tmp.dir, '.claude'));
    if (saved !== undefined) process.env.CLAUDE_CONFIG_DIR = saved;
  } finally {
    stopLater();
    tmp.cleanup();
  }
});
