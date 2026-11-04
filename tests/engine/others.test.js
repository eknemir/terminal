'use strict';
// The other AI tools (setOthers): generic CPU-driven sessions, Codex's rollout logs, Antigravity's databases and
// transcripts, their statuses and how they show in snapshots and live().
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { loadEngine, tmpDir, fixture, write, jsonl } = require('./_load');

let sqlite = null;
try {
  sqlite = require('node:sqlite');
} catch {}

const quiet = { log: console.log, error: console.error };
test.before(() => { console.log = () => {}; console.error = () => {}; });
test.after(() => Object.assign(console, quiet));

function setup(opts = {}) {
  const tmp = tmpDir();
  const M = loadEngine({ home: tmp.dir, stubs: { 'node:child_process': { execFile: (a, b, c, cb) => setImmediate(() => cb(null, '')) } } });
  const e = new M.__t.RadarEngine({ claudeDir: path.join(tmp.dir, 'claude'), isAppPid: opts.isAppPid });
  return { e, T: M.__t, tmp, done() { e.stop(); tmp.cleanup(); } };
}

test('otherStatus and otherRunning: every branch', () => {
  const h = setup();
  try {
    const t = Date.now();
    const S = (O) => h.e.otherStatus(O, t);
    assert.deepEqual(S({ endedAt: 5 }), { status: 'ended', waiting: null });
    const call = { p: { n: 'Bash', c: 'bash', l: 'rm -rf build', t: t - 10_000 } };
    assert.deepEqual(S({ endedAt: 0, turnOpen: true, waitsForUser: true, call }), { status: 'waiting', waiting: 'onay: rm -rf build' });
    assert.deepEqual(S({ endedAt: 0, turnOpen: true, waitsForUser: true }), { status: 'waiting', waiting: 'onay: bir adım' });
    assert.deepEqual(S({ endedAt: 0, turnOpen: false, agentWaiting: { l: 'sub step' } }), { status: 'waiting', waiting: 'onay: sub step' });
    assert.equal(S({ endedAt: 0, turnOpen: false }).status, 'idle');
    assert.equal(S({ endedAt: 0, turnOpen: false, agents: [{ running: false }, { running: true }] }).status, 'busy');
    // Turn open, no steps to tell, nothing burning CPU, a call idle for > 4 s: it waits for the user.
    assert.deepEqual(S({ endedAt: 0, turnOpen: true, call }), { status: 'waiting', waiting: 'onay: rm -rf build' });
    assert.equal(S({ endedAt: 0, turnOpen: true, call, stepsKnown: true }).status, 'busy');
    assert.equal(S({ endedAt: 0, turnOpen: true, call, busy: true }).status, 'busy');
    assert.equal(S({ endedAt: 0, turnOpen: true, call, command: 'x' }).status, 'busy');
    assert.equal(S({ endedAt: 0, turnOpen: true, call: { p: { l: 'new', t: t - 1000 } } }).status, 'busy');
    assert.equal(S({ endedAt: 0, turnOpen: true }).status, 'busy');
    assert.equal(S({ endedAt: 0, busy: true }).status, 'busy');
    assert.equal(S({ endedAt: 0, command: 'npm' }).status, 'busy');
    assert.equal(S({ endedAt: 0 }).status, 'idle');
    assert.equal(h.e.otherStatus({ endedAt: 0 }).status, 'idle'); // default `now`

    assert.deepEqual(h.e.otherRunning({ command: 'npm run dev', commandSince: 7 }), { n: 'Bash', c: 'bash', l: 'npm run dev', t: 7 });
    assert.ok(h.e.otherRunning({ command: 'x' }).t > 0);
    assert.equal(h.e.otherRunning({ call }), call.p);
    assert.equal(h.e.otherRunning({}), null);
  } finally {
    h.done();
  }
});

test('setOthers: a CPU-driven tool in an app tab, ending and leaving', () => {
  const h = setup({ isAppPid: (pid) => (pid === 901 ? 'tab-2' : pid === 950 ? (() => { throw new Error('x'); })() : false) });
  try {
    const id = 'ai:900:1000';
    h.e.setOthers([{ tool: 'Gemini', pid: 900, started: 1000, pct: 5, cwd: 'C:\\code\\proj', chain: [901], command: 'npm run dev' }]);
    const O = h.e.others.get(id);
    assert.deepEqual([O.busy, O.cwd, O.command, O.hostTab, O.cpu], [true, 'C:\\code\\proj', 'npm run dev', 'tab-2', 5]);
    assert.ok(O.busyUntil > Date.now());
    assert.deepEqual(h.e.live(), [{ sessionId: id, pid: 900, cwd: 'C:\\code\\proj', status: 'busy', name: 'Gemini', title: 'proj', host: 'app', tab: 'tab-2', ai: true }]);
    let item = h.e.snapshot().sessions[0];
    assert.deepEqual([item.name, item.model, item.title, item.status, item.live, item.host, item.tab], ['Gemini', 'Gemini', 'proj', 'busy', true, 'app', 'tab-2']);
    assert.deepEqual(item.pending, [{ n: 'Bash', c: 'bash', l: 'npm run dev', t: O.commandSince }]);
    assert.equal(item.last.l, 'npm run dev');
    assert.equal(item.spark.length, 30);
    assert.equal(h.e.snapshot().pendingByCat.bash, 1);

    // Quiet again, no command, cwd kept when not reported.
    O.busyUntil = 0;
    h.e.setOthers([{ tool: 'Gemini', pid: 900, started: 1000, pct: 0, chain: [] }]);
    assert.deepEqual([O.busy, O.cwd, O.command, O.hostTab], [false, 'C:\\code\\proj', null, null]);
    assert.equal(h.e.otherStatus(O).status, 'idle');

    // Gone: ended (subagents with it), then off the map after two minutes.
    O.agents = [{ id: 'a', running: true, pending: [{ c: 'web' }] }];
    h.e.setOthers([]);
    assert.ok(O.endedAt > 0);
    assert.deepEqual(h.e.live(), []);
    item = h.e.snapshot().sessions[0];
    assert.deepEqual([item.status, item.live, item.host, item.statusSince], ['ended', false, null, O.endedAt]);
    assert.deepEqual(item.agents, [{ id: 'a', running: false, pending: [] }]);
    h.e.dismiss(id, 900);
    assert.equal(h.e.snapshot().sessions.length, 0);
    O.endedAt = Date.now() - 121_000;
    h.e.setOthers([]);
    assert.equal(h.e.others.has(id), false);

    // isAppPid throwing for one pid is reported, the rest still checked.
    h.e.setOthers([{ tool: 'X', pid: 950, started: 1, pct: 0, chain: [901] }]);
    assert.equal(h.e.others.get('ai:950:1').hostTab, 'tab-2');
    assert.equal(h.e.live()[0].title, ''); // no cwd, no prompt
  } finally {
    h.done();
  }
});

test('Codex: the rollout log gives its turn, call, prompt, context and model', () => {
  const h = setup();
  const saved = process.env.CODEX_HOME;
  try {
    const codexHome = path.join(h.tmp.dir, 'codex');
    process.env.CODEX_HOME = codexHome;
    const cwd = path.join(h.tmp.dir, 'repo');
    const d = new Date();
    const dir = path.join(codexHome, 'sessions', String(d.getFullYear()), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0'));
    const started = Date.now() - 2000;
    const a = { tool: 'Codex', pid: 4242, started, pct: 0, cwd, chain: [] };

    h.e.setOthers([a]); // no log yet: looked for, not found
    const O = h.e.others.get(`ai:4242:${started}`);
    assert.equal(O.log, undefined);
    assert.ok(O.logChecked > 0);
    const file = write(path.join(dir, 'rollout-2026-test.jsonl'), fixture('codex-rollout.jsonl').replace('__CWD__', cwd.replace(/\\/g, '\\\\')));
    h.e.setOthers([a]); // looked for again only after 30 s
    assert.equal(O.log, undefined);
    O.logChecked = 0;
    h.e.setOthers([a]);
    assert.equal(O.log, file);
    assert.deepEqual([O.turnOpen, O.model, O.prompt, O.ctx, O.ctxMax], [true, 'gpt-5-codex', 'Add a README', 12345, 272000]);
    assert.equal(O.call.id, 'c2');
    assert.deepEqual([O.call.p.n, O.call.p.l], ['Bash', 'cat README.md']);
    // Its call has sat for over 4 s with nothing running: waiting for the user's approval.
    assert.deepEqual(h.e.otherStatus(O), { status: 'waiting', waiting: 'onay: cat README.md' });
    const item = h.e.snapshot().sessions[0];
    assert.deepEqual([item.model, item.lastPrompt, item.ctx, item.ctxMax, item.waitingFor], ['gpt-5-codex', 'Add a README', 12345, 272000, 'onay: cat README.md']);

    // Read on from where it was; a partial line waits; the call's output clears it; the turn ends.
    const off = O.logOffset;
    fs.appendFileSync(file, JSON.stringify({ type: 'response_item', payload: { type: 'function_call_output', call_id: 'c2' } }) + '\n' + '{"type":"event_msg","payload":{"type":"task_compl');
    h.e.setOthers([a]);
    assert.equal(O.call, null);
    assert.ok(O.logOffset > off);
    fs.appendFileSync(file, 'ete"}}\n');
    h.e.setOthers([a]);
    assert.equal(O.turnOpen, false);
    assert.equal(h.e.otherStatus(O).status, 'idle');
    h.e.setOthers([a]); // nothing new
    // Patches, aborted turns, events with no info.
    fs.appendFileSync(file, jsonl([
      { type: 'event_msg', payload: { type: 'task_started' } },
      { type: 'response_item', payload: { type: 'custom_tool_call', name: 'apply_patch', call_id: 'p1' } },
      { type: 'event_msg', payload: { type: 'token_count' } },
      { type: 'event_msg', payload: { type: 'token_count', info: { last_token_usage: { input_tokens: 'x' } } } },
      { type: 'event_msg', payload: { type: 'item_completed', item: { type: 'UserMessage' } } },
      { type: 'event_msg', payload: { type: 'thread_settings_applied', thread_settings: {} } },
      { type: 'response_item', payload: { type: 'function_call_output', call_id: 'other' } },
      { type: 'response_item', payload: { type: 7 } },
    ]));
    h.e.setOthers([a]);
    assert.deepEqual([O.turnOpen, O.call.p.n, O.call.p.l, O.ctx], [true, 'Edit', 'yama uygula', 0]);
    fs.appendFileSync(file, jsonl([{ type: 'event_msg', payload: { type: 'turn_aborted' } }]));
    h.e.setOthers([a]);
    assert.deepEqual([O.turnOpen, O.call], [false, null]);
    // The log vanished: nothing read, nothing thrown.
    fs.rmSync(file);
    h.e.setOthers([a]);
    assert.equal(O.turnOpen, false);
  } finally {
    if (saved === undefined) delete process.env.CODEX_HOME;
    else process.env.CODEX_HOME = saved;
    h.done();
  }
});

test('Codex: a long log is read from its last 2 MB; a log without a newline waits', () => {
  const h = setup();
  try {
    const O = { log: write(path.join(h.tmp.dir, 'r.jsonl'), '{"type":"event_msg","payload":{"type":"task_started"}}') };
    h.e.readCodexLog(O, 'C:\\x', 0, Date.now());
    assert.equal(O.turnOpen, undefined);
    const pad = JSON.stringify({ type: 'event_msg', payload: { type: 'noise', pad: 'n'.repeat(1000) } }) + '\n';
    fs.writeFileSync(O.log, JSON.stringify({ type: 'event_msg', payload: { type: 'task_started' } }) + '\n' + pad.repeat(2200) + JSON.stringify({ type: 'event_msg', payload: { type: 'item_completed', item: { type: 'UserMessage', content: [{}, { text: 'tail prompt' }] } } }) + '\n');
    O.logOffset = 0;
    h.e.readCodexLog(O, 'C:\\x', 0, Date.now());
    assert.equal(O.turnOpen, undefined); // the head (task_started) was past the window
    assert.equal(O.prompt, 'tail prompt');
  } finally {
    h.done();
  }
});

test('Antigravity: conversation, steps, transcript and subagents', { skip: !sqlite && 'node:sqlite missing' }, () => {
  const h = setup();
  const dbs = [];
  try {
    const root = path.join(h.tmp.dir, '.gemini', 'antigravity-cli');
    const cwd = path.join(h.tmp.dir, 'site');
    const a = { tool: 'Antigravity', pid: 5151, started: 1, pct: 0, cwd, chain: [] };
    h.e.setOthers([a]); // no database: nothing read
    const O = h.e.others.get('ai:5151:1');
    assert.equal(O.turnOpen, undefined);

    fs.mkdirSync(path.join(root, 'conversations'), { recursive: true });
    const sum = new sqlite.DatabaseSync(path.join(root, 'conversation_summaries.db'));
    dbs.push(sum);
    sum.exec(`CREATE TABLE conversation_summaries (conversation_id TEXT, title TEXT, status TEXT, workspace_uris TEXT, nesting_depth INT,
      last_modified_time INT, parent_conversation_id TEXT, agent_name TEXT, killed INT)`);
    const ins = sum.prepare('INSERT INTO conversation_summaries VALUES (?,?,?,?,?,?,?,?,?)');
    const uri = JSON.stringify([pathToFileURL(cwd).href]);
    h.e.setOthers([a]); // no conversation in this folder yet
    assert.equal(O.turnOpen, undefined);
    ins.run('conv-1', 'Docs site', 'CONVERSATION_STATUS_RUNNING', uri, 0, 100, null, null, 0);
    ins.run('child-1', '', 'CONVERSATION_STATUS_RUNNING', uri, 1, 10, 'conv-1', 'self', 0);
    ins.run('child-2', 'Writer title', 'CONVERSATION_STATUS_IDLE', uri, 1, 5, 'conv-1', 'writer', 0);
    ins.run('child-3', 'Killed', 'CONVERSATION_STATUS_RUNNING', uri, 1, 1, 'conv-1', 'x', 1);

    const steps = new sqlite.DatabaseSync(path.join(root, 'conversations', 'conv-1.db'));
    dbs.push(steps);
    steps.exec('CREATE TABLE steps (idx INT, status INT)');
    steps.exec('INSERT INTO steps VALUES (2, 3), (3, 2)');
    write(path.join(root, 'brain', 'conv-1', '.system_generated', 'logs', 'transcript.jsonl'), fixture('agy-transcript.jsonl'));
    const childLog = (id, lines) => write(path.join(root, 'brain', id, '.system_generated', 'logs', 'transcript.jsonl'), jsonl(lines));
    childLog('child-1', [
      { type: 'SYSTEM_MESSAGE', created_at: new Date(Date.now() - 50_000).toISOString(), content: '<SYSTEM_MESSAGE>x content=Find docs</SYSTEM_MESSAGE>' },
      { type: 'PLANNER_RESPONSE', step_index: 1, created_at: new Date(Date.now() - 40_000).toISOString(), input_tokens: 10, output_tokens: 2, tool_calls: [{ name: 'search_web', args: { Query: '"docs"' } }] },
    ]);
    childLog('child-2', [{ type: 'USER_INPUT', content: '<USER_REQUEST>Write</USER_REQUEST>' }]);

    h.e.setOthers([a]);
    assert.deepEqual([O.turnOpen, O.title, O.prompt, O.ctx, O.stepsKnown, O.waitsForUser], [true, 'Docs site', 'Build the docs site', 4000, true, false]);
    assert.deepEqual([O.call.p.n, O.call.p.c, O.call.p.l], ['Agent', 'agent', 'invoke_subagent']); // step 3: the reply's 2nd call
    assert.deepEqual(Object.fromEntries(O.agentRoles), { 'child-1': { role: 'Researcher', prompt: 'Find docs\nsecond line' }, 'child-2': { role: 'Writer', prompt: 'Write docs' } });
    assert.deepEqual(O.agents.map((x) => [x.id, x.desc, x.type, x.running]), [['child-1', 'Researcher', '', true], ['child-2', 'Writer', 'writer', false]]);
    const c1 = O.agents[0];
    assert.deepEqual([c1.pending[0].n, c1.pending[0].l, c1.last.l, c1.tools, c1.web, c1.tok.in], ['WebSearch', 'docs', 'docs', 1, 1, 10]);
    assert.equal(h.e.otherStatus(O).status, 'busy');
    const snap = h.e.snapshot();
    assert.equal(snap.sessions[0].agentsRunning, 1);
    assert.equal(snap.totals.runningAgents, 1);
    assert.equal(snap.pendingByCat.web, 1);
    assert.equal(snap.pendingByCat.agent, 1);
    assert.equal(h.e.live()[0].title, 'Docs site');

    // A step waiting for permission past the reply's calls: waits for "a step".
    steps.exec('INSERT INTO steps VALUES (4, 9)');
    h.e.setOthers([a]);
    assert.deepEqual([O.waitsForUser, O.call], [true, null]);
    assert.deepEqual(h.e.otherStatus(O), { status: 'waiting', waiting: 'onay: bir adım' });

    // A subagent waiting for permission is the session's wait.
    steps.exec('DELETE FROM steps WHERE idx = 4');
    const cs = new sqlite.DatabaseSync(path.join(root, 'conversations', 'child-1.db'));
    dbs.push(cs);
    cs.exec('CREATE TABLE steps (idx INT, status INT); INSERT INTO steps VALUES (2, 9)');
    h.e.setOthers([a]);
    assert.equal(O.agentWaiting.l, 'docs');
    assert.deepEqual(h.e.otherStatus(O), { status: 'waiting', waiting: 'onay: docs' });
    // Running but with no open step: no call shown, nothing waits.
    cs.exec('DELETE FROM steps');
    h.e.setOthers([a]);
    assert.equal(O.agentWaiting, null);
    assert.deepEqual(O.agents[0].pending, []);

    // The turn is over: no call; its running subagent keeps it busy; done, it's idle.
    sum.exec("UPDATE conversation_summaries SET status = 'CONVERSATION_STATUS_IDLE' WHERE conversation_id = 'conv-1'");
    h.e.setOthers([a]);
    assert.deepEqual([O.turnOpen, O.call, O.waitsForUser], [false, null, false]);
    assert.equal(h.e.otherStatus(O).status, 'busy');
    sum.exec("UPDATE conversation_summaries SET status = 'X_IDLE' WHERE conversation_id = 'child-1'");
    h.e.setOthers([a]);
    assert.equal(h.e.otherStatus(O).status, 'idle');
    // A subagent that left the list is forgotten.
    sum.exec("DELETE FROM conversation_summaries WHERE conversation_id = 'child-2'");
    h.e.setOthers([a]);
    assert.equal(O.agentLogs.has('child-2'), false);

    // A new user prompt: the plan and the call start over.
    fs.appendFileSync(path.join(root, 'brain', 'conv-1', '.system_generated', 'logs', 'transcript.jsonl'), jsonl([
      { type: 'USER_INPUT', step_index: 5, content: 'plain prompt' },
      { type: 'PLANNER_RESPONSE', step_index: 6, tool_calls: [] },
      { type: 'TOOL', step_index: 7, status: 'WAITING' },
    ]));
    h.e.setOthers([a]);
    assert.equal(O.prompt, 'plain prompt');
    assert.equal(O.plan, null);
  } finally {
    for (const d of dbs) try { d.close(); } catch {}
    h.done();
  }
});

test('Antigravity: a summaries table without subagent columns', { skip: !sqlite && 'node:sqlite missing' }, () => {
  const h = setup();
  try {
    const root = path.join(h.tmp.dir, '.gemini', 'antigravity-cli');
    fs.mkdirSync(root, { recursive: true });
    const cwd = path.join(h.tmp.dir, 'w');
    const db = new sqlite.DatabaseSync(path.join(root, 'conversation_summaries.db'));
    db.exec('CREATE TABLE conversation_summaries (conversation_id TEXT, title TEXT, status TEXT, workspace_uris TEXT, nesting_depth INT, last_modified_time INT)');
    db.prepare('INSERT INTO conversation_summaries VALUES (?,?,?,?,?,?)').run('c9', null, 'X_RUNNING', JSON.stringify([pathToFileURL(cwd).href]), 0, 1);
    db.close();
    h.e.setOthers([{ tool: 'Antigravity', pid: 1, started: 1, pct: 0, cwd, chain: [] }]);
    const O = h.e.others.get('ai:1:1');
    assert.deepEqual([O.turnOpen, O.title, O.stepsKnown, O.agents], [true, '', false, undefined]);
  } finally {
    h.done();
  }
});
