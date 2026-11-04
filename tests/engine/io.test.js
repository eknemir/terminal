'use strict';
// File readers of windows/src/engine.js against temp files: transcript tails, seeking, first cwd, chat list entries,
// usage limits, tool logs, Codex logs, Antigravity databases, the process table.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadEngine, tmpDir, fixture, write, jsonl, iso } = require('./_load');

const T = loadEngine({ home: 'C:\\Users\\TestUser' }).__t;
let sqlite = null;
try {
  sqlite = require('node:sqlite');
} catch {}

test('parseTail: chat window items from the fixture transcript', async () => {
  const { dir, cleanup } = tmpDir();
  try {
    const fp = write(path.join(dir, 't.jsonl'), fixture('claude-session.jsonl'));
    const size = fs.statSync(fp).size;
    const items = await T.parseTail(fp, 0, size);
    assert.deepEqual(items.map((i) => i.k), ['prompt', 'say', 'tool', 'tool', 'tool', 'tool', 'say', 'sys', 'say']);
    assert.equal(items[0].x, 'Fix the login bug in auth.js');
    const [read, web, bash, edit] = items.filter((i) => i.k === 'tool');
    assert.deepEqual({ n: read.n, c: read.c, l: read.l, ok: read.ok, d: read.d, o: read.o }, { n: 'Read', c: 'read', l: 'src\\auth.js', ok: true, d: 2000, o: '42 lines' });
    assert.equal(read.x, 'C:\\work\\demo\\src\\auth.js');
    assert.equal(web.m, '3 sonuç');
    assert.equal(web.o, 'results');
    assert.equal(bash.ok, false);
    assert.equal(bash.o, '1 failing\n  at auth.test.js');
    assert.equal(bash.x, 'npm test');
    assert.equal(edit.o, 'updated');
    assert.equal(items[7].x, 'bağlam sıkıştırıldı');
    assert.equal(items[8].x, 'API Error: 529');

    // From the middle: the first partial line is dropped.
    const half = await T.parseTail(fp, Math.floor(size / 2), size);
    assert.ok(half.length > 0 && half.length < items.length);
    // A start past every newline: nothing.
    assert.deepEqual(await T.parseTail(fp, size - 2, size), []);
  } finally {
    cleanup();
  }
});

test('parseTail: sidechain records, results without a call, timestamps missing', async () => {
  const { dir, cleanup } = tmpDir();
  try {
    const fp = write(path.join(dir, 't.jsonl'), jsonl([
      { type: 'assistant', isSidechain: true, message: { content: [{ type: 'text', text: 'hidden' }] } },
      { type: 'assistant', message: { content: [{ type: 'tool_use', id: 'x', input: {} }, 'junk', { type: 'text', text: '   ' }] } },
      { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'x' }, { type: 'tool_result', tool_use_id: 'nobody' }, 'junk'] } },
      { type: 'user', message: { content: [{ type: 'text', text: 'Caveat: x' }] } },
      { type: 'user', message: { content: [{ type: 'text', text: 'hello' }, { type: 'text', text: 'world' }] } },
      { type: 'user', message: { content: 42 } },
      { type: 'system', subtype: 'other' },
    ]));
    const items = await T.parseTail(fp, 0, fs.statSync(fp).size);
    assert.equal(items.length, 2);
    assert.equal(items[0].n, '?');
    assert.equal(items[0].ok, true);
    assert.equal(items[0].d, null); // no timestamps
    assert.equal(items[1].x, 'hello world');
  } finally {
    cleanup();
  }
});

test('seekTime: binary search lands before the first record at `since`', async () => {
  const { dir, cleanup } = tmpDir();
  try {
    const base = Date.UTC(2026, 0, 1);
    const pad = 'p'.repeat(1000);
    const lines = [];
    for (let i = 0; i < 4000; i++) lines.push(JSON.stringify({ type: 'user', timestamp: iso(base + i * 1000), pad }));
    const fp = write(path.join(dir, 'big.jsonl'), lines.join('\n') + '\n');
    const size = fs.statSync(fp).size;
    assert.ok(size > 3 << 20);
    const since = base + 3000 * 1000;
    const off = await T.seekTime(fp, size, since);
    assert.ok(off > 0 && off < size);
    // Everything from `off` on starts at or before `since` (it may begin a little early, never late).
    const after = fs.readFileSync(fp).subarray(off).toString();
    const first = JSON.parse(after.split('\n')[1]);
    assert.ok(Date.parse(first.timestamp) <= since);
    assert.ok(since - Date.parse(first.timestamp) < 1100 * 1000); // within ~1 MB of records
    // Since before everything: 0. Small files: 0 without probing.
    assert.equal(await T.seekTime(fp, size, base - 1), 0);
    const small = write(path.join(dir, 's.jsonl'), lines.slice(0, 5).join('\n'));
    assert.equal(await T.seekTime(small, fs.statSync(small).size, since), 0);
    // Lines with no timestamp: probes say null, the search moves down.
    const blank = write(path.join(dir, 'n.jsonl'), Array.from({ length: 3000 }, () => JSON.stringify({ pad })).join('\n'));
    assert.equal(await T.seekTime(blank, fs.statSync(blank).size, since), 0);
  } finally {
    cleanup();
  }
});

test('readFirstCwd: head, past 64 KB, tail beyond 8 MB, none, unreadable', () => {
  const { dir, cleanup } = tmpDir();
  try {
    const small = write(path.join(dir, 'a.jsonl'), jsonl([{ type: 'permission-mode' }, { type: 'user', cwd: 'C:\\first' }, { type: 'user', cwd: 'C:\\later' }]));
    assert.equal(T.readFirstCwd(small), 'C:\\first');

    const snap = JSON.stringify({ type: 'file-history-snapshot', pad: 's'.repeat(2000) });
    const mid = write(path.join(dir, 'b.jsonl'), Array(60).fill(snap).join('\n') + '\n' + jsonl([{ type: 'user', cwd: 'C:\\deep' }]));
    assert.ok(fs.statSync(mid).size > 64 << 10);
    assert.equal(T.readFirstCwd(mid), 'C:\\deep');

    // No cwd in the first 8 MB: the newest one in the tail.
    const chunk = Array(1000).fill(snap).join('\n') + '\n';
    const fd = fs.openSync(path.join(dir, 'c.jsonl'), 'w');
    for (let i = 0; i < 5; i++) fs.writeSync(fd, chunk);
    fs.writeSync(fd, jsonl([{ type: 'user', cwd: 'C:\\old' }, { type: 'user', cwd: 'C:\\newest' }, { type: 'x' }]));
    fs.closeSync(fd);
    assert.ok(fs.statSync(path.join(dir, 'c.jsonl')).size > 8 << 20);
    assert.equal(T.readFirstCwd(path.join(dir, 'c.jsonl')), 'C:\\newest');

    const none = write(path.join(dir, 'd.jsonl'), jsonl([{ type: 'user' }, '{"cwd":"broken', { cwd: 5 }]));
    assert.equal(T.readFirstCwd(none), null);
    assert.equal(T.readFirstCwd(path.join(dir, 'missing.jsonl')), null);
    assert.equal(T.readFirstCwd(write(path.join(dir, 'e.jsonl'), '')), null);
  } finally {
    cleanup();
  }
});

test('readChat: cwd from head, title and last prompt from tail, head fallback, redaction', async () => {
  const { dir, cleanup } = tmpDir();
  try {
    const mk = (name, text) => {
      const p = write(path.join(dir, name), text);
      return { path: p, size: fs.statSync(p).size };
    };
    const a = mk('a.jsonl', fixture('claude-session.jsonl'));
    assert.equal(await T.readChat(a), true);
    assert.equal(a.cwd, 'C:\\work\\demo');
    assert.equal(a.title, 'Fix login bug');
    assert.equal(a.lastPrompt, 'Fix the login bug in auth.js');

    // Title and prompt only near the head of a file bigger than the tail window; cwd on a line longer than a chunk.
    const filler = JSON.stringify({ type: 'progress', pad: 'f'.repeat(1000) });
    const longCwdLine = JSON.stringify({ cwd: 'C:\\long', pad: 'L'.repeat(300 << 10) });
    const b = mk('b.jsonl', jsonl([{ type: 'ai-title', aiTitle: 'Key sk-ant-abcdefghijklmn here' }, { type: 'last-prompt', lastPrompt: 'p' }, longCwdLine, ...Array(150).fill(filler)]));
    assert.ok(b.size > 96 << 10);
    assert.equal(await T.readChat(b), true);
    assert.equal(b.cwd, 'C:\\long');
    assert.equal(b.title, 'Key ‹•••› here');
    assert.equal(b.lastPrompt, 'p');

    // No cwd anywhere, a broken record; still true.
    const c = mk('c.jsonl', jsonl(['{"type":"ai-title" broken', { type: 'ai-title', aiTitle: 7 }]));
    assert.equal(await T.readChat(c), true);
    assert.deepEqual([c.cwd, c.title, c.lastPrompt], ['', '', '']);
    // A file with no newline at all (a single partial record).
    const d = mk('d.jsonl', '{"cwd":"C:\\\\x"');
    assert.equal(await T.readChat(d), true);
    assert.equal(d.cwd, '');

    assert.equal(await T.readChat({ path: path.join(dir, 'missing.jsonl'), size: 10 }), false);
  } finally {
    cleanup();
  }
});

test('parseLimits', () => {
  const { dir, cleanup } = tmpDir();
  try {
    const f = (obj) => write(path.join(dir, `l${Math.random()}.json`), typeof obj === 'string' ? obj : JSON.stringify(obj));
    assert.deepEqual(T.parseLimits(f({ rate_limits: { five_hour: { used_percentage: 42, resets_at: 1_800_000_000 }, seven_day: { used_percentage: 7, resets_at: 1_800_000_000_123 } } }), 99), {
      fiveHour: { pct: 42, resetsAt: 1_800_000_000_000 }, week: { pct: 7, resetsAt: 1_800_000_000_123 }, at: 99,
    });
    assert.deepEqual(T.parseLimits(f({ rate_limits: { five_hour: { used_percentage: 1 }, seven_day: { used_percentage: '9' } } }), 1), { fiveHour: { pct: 1, resetsAt: 0 }, week: null, at: 1 });
    assert.equal(T.parseLimits(f({ other: 1 }), 1), null);
    assert.equal(T.parseLimits(f('[1]'), 1), null);
    assert.equal(T.parseLimits(f('nope'), 1), null);
    assert.equal(T.parseLimits(path.join(dir, 'missing'), 1), null);
  } finally {
    cleanup();
  }
});

test('readNewLines: offsets, partial lines, long logs read from their last 2 MB', () => {
  const { dir, cleanup } = tmpDir();
  try {
    const O = { log: path.join(dir, 'log.jsonl') };
    assert.deepEqual(T.readNewLines(O), []); // missing
    fs.writeFileSync(O.log, '{"a":1}\nbad\n{"b":2}\n{"c":');
    assert.deepEqual(T.readNewLines(O), [{ a: 1 }, { b: 2 }]);
    assert.equal(O.logOffset, 20);
    assert.deepEqual(T.readNewLines(O), []); // only the partial line is new
    fs.appendFileSync(O.log, '3}\n');
    assert.deepEqual(T.readNewLines(O), [{ c: 3 }]);
    assert.deepEqual(T.readNewLines(O), []); // nothing new

    const L = { log: path.join(dir, 'big.jsonl') };
    const line = JSON.stringify({ pad: 'x'.repeat(1000) }) + '\n';
    fs.writeFileSync(L.log, line.repeat(2200) + '{"last":true}\n');
    const got = T.readNewLines(L);
    assert.ok(got.length < 2200 && got.length > 1000); // the first, partial line of the window fails to parse
    assert.deepEqual(got[got.length - 1], { last: true });
    const N = { log: write(path.join(dir, 'nonl.jsonl'), '{"x":1}') };
    assert.deepEqual(T.readNewLines(N), []);
  } finally {
    cleanup();
  }
});

test('agyLog: prompt from a system message or user input, plan, counts', () => {
  const { dir, cleanup } = tmpDir();
  try {
    const f = write(path.join(dir, 't.jsonl'), jsonl([
      { type: 'SYSTEM_MESSAGE', created_at: '2026-11-04T10:00:00.000Z', content: '<SYSTEM_MESSAGE>from=parent content=Find the docs</SYSTEM_MESSAGE>' },
      { type: 'USER_INPUT', created_at: '2026-11-04T10:00:01.000Z', content: '<USER_REQUEST>ignored</USER_REQUEST>' },
      { type: 'PLANNER_RESPONSE', step_index: 2, created_at: '2026-11-04T10:00:05.000Z', input_tokens: 100, output_tokens: 10, cache_read_tokens: 50, tool_calls: [{ name: 'search_web', args: {} }, { name: 'view_file', args: {} }] },
      { type: 'CODE_ACTION', status: 'ERROR', created_at: '2026-11-04T10:00:03.000Z' },
      { type: 'PLANNER_RESPONSE', step_index: 'x', created_at: 'bad', tool_calls: 'nope' },
      'not json',
    ]));
    const log = T.agyLog(f, 123);
    assert.equal(log.mtime, 123);
    assert.equal(log.prompt, 'Find the docs');
    assert.equal(log.firstTs, Date.UTC(2026, 10, 4, 10, 0, 0));
    assert.equal(log.lastTs, Date.UTC(2026, 10, 4, 10, 0, 5));
    assert.equal(log.tools, 2);
    assert.equal(log.web, 1);
    assert.equal(log.errors, 1);
    assert.deepEqual([log.tokIn, log.tokOut, log.tokCache], [100, 10, 50]);
    assert.equal(log.plan, null); // the last reply called nothing

    const g = write(path.join(dir, 'u.jsonl'), jsonl([
      { type: 'SYSTEM_MESSAGE', content: 'no marker' },
      { type: 'USER_INPUT', content: '<USER_REQUEST>Do X</USER_REQUEST>' },
      { type: 'PLANNER_RESPONSE', step_index: 4, tool_calls: [{ name: 'run_command' }] },
    ]));
    const l2 = T.agyLog(g, 0);
    assert.equal(l2.prompt, 'Do X');
    assert.equal(l2.plan.idx, 4);
    assert.equal(T.agyLog(path.join(dir, 'missing'), 5).tools, 0);
  } finally {
    cleanup();
  }
});

test('codexLog: newest matching log of the last week, by cwd and time', () => {
  const { dir, cleanup } = tmpDir();
  const saved = process.env.CODEX_HOME;
  try {
    process.env.CODEX_HOME = dir;
    const d = new Date();
    const day = (dt) => path.join(dir, 'sessions', String(dt.getFullYear()), String(dt.getMonth() + 1).padStart(2, '0'), String(dt.getDate()).padStart(2, '0'));
    const cwd = path.join(dir, 'proj');
    const meta = (c) => JSON.stringify({ type: 'session_meta', payload: { cwd: c } }) + '\n';
    assert.equal(T.codexLog(cwd, Date.now() - 1000), null); // no sessions folder
    const a = write(path.join(day(d), 'rollout-a.jsonl'), meta(cwd));
    const b = write(path.join(day(d), 'rollout-b.jsonl'), meta(cwd.toUpperCase())); // case-insensitive folder match
    write(path.join(day(d), 'rollout-c.jsonl'), meta(path.join(dir, 'other')));
    write(path.join(day(d), 'rollout-d.jsonl'), 'not json\n');
    write(path.join(day(d), 'notes.txt'), meta(cwd));
    const now = Date.now() / 1000;
    fs.utimesSync(a, now - 10, now - 10);
    fs.utimesSync(b, now, now);
    assert.equal(T.codexLog(cwd, Date.now() - 60_000), b);
    // Written before the process started (more than 5 s): not it.
    assert.equal(T.codexLog(cwd, Date.now() + 60_000), null);
    // Yesterday's folder is searched too.
    const y = new Date(Date.now() - 86_400_000);
    const old = write(path.join(day(y), 'rollout-y.jsonl'), meta(path.join(dir, 'p2')));
    assert.equal(T.codexLog(path.join(dir, 'p2'), Date.now() - 60_000), old);
  } finally {
    if (saved === undefined) delete process.env.CODEX_HOME;
    else process.env.CODEX_HOME = saved;
    cleanup();
  }
});

test('Antigravity databases: open, conversation by folder, open steps', { skip: !sqlite && 'node:sqlite missing' }, () => {
  const { dir, cleanup } = tmpDir();
  const { pathToFileURL } = require('node:url');
  try {
    assert.equal(T.agyOpen(path.join(dir, 'none.db')), null);
    const bad = write(path.join(dir, 'bad.db'), 'not a database at all, just text'.repeat(10));
    assert.equal(T.agyOpen(bad), null);
    write(bad + '-wal', 'x');
    assert.equal(T.agyOpen(bad), null); // both ways fail

    const sumFile = path.join(dir, 'conversation_summaries.db');
    const w = new sqlite.DatabaseSync(sumFile);
    w.exec(`CREATE TABLE conversation_summaries (conversation_id TEXT, title TEXT, status TEXT, workspace_uris TEXT, nesting_depth INT,
      last_modified_time INT, parent_conversation_id TEXT, agent_name TEXT, killed INT)`);
    const ins = w.prepare('INSERT INTO conversation_summaries VALUES (?,?,?,?,?,?,?,?,?)');
    const cwd = path.join(dir, 'Proj');
    ins.run('c-old', 'Old', 'X_IDLE', JSON.stringify([pathToFileURL(cwd).href]), 0, 1, null, null, 0);
    ins.run('c-new', 'New', 'X_RUNNING', JSON.stringify([pathToFileURL(cwd).href]), 0, 5, null, null, 0);
    ins.run('c-other', 'Other', 'X_RUNNING', JSON.stringify(['file:///elsewhere', 'not a uri']), 0, 9, null, null, 0);
    ins.run('c-badjson', 'B', 'X', '{oops', 0, 8, null, null, 0);
    ins.run('c-child', 'Child', 'X_RUNNING', JSON.stringify([pathToFileURL(cwd).href]), 1, 10, 'c-new', 'self', 0);
    w.close();

    const db = T.agyOpen(sumFile);
    assert.ok(db);
    const row = T.agyConversation(db, cwd.toLowerCase());
    assert.equal(row.conversation_id, 'c-new');
    assert.equal(T.agyConversation(db, path.join(dir, 'nowhere')), null);
    T.agyClose(db);
    T.agyClose(db); // closing twice is harmless
    assert.equal(T.agyConversation({ prepare() { throw new Error('x'); } }, cwd), null);

    // Steps: the first open one and the first waiting one.
    fs.mkdirSync(path.join(dir, 'conversations'));
    assert.equal(T.agySteps(dir, 'missing'), null);
    const sf = path.join(dir, 'conversations', 'c-new.db');
    const s = new sqlite.DatabaseSync(sf);
    s.exec('PRAGMA journal_mode=WAL; CREATE TABLE steps (idx INT, status INT)');
    for (const [i, st] of [[1, 3], [2, 3], [3, 2], [4, 9], [5, 1]]) s.prepare('INSERT INTO steps VALUES (?,?)').run(i, st);
    // Writer still open: its -wal file exists, so the plain read-only way is tried first.
    assert.ok(fs.existsSync(sf + '-wal'));
    assert.deepEqual(T.agySteps(dir, 'c-new'), { open: 3, waiting: 4 });
    s.exec('DELETE FROM steps WHERE status != 3');
    assert.deepEqual(T.agySteps(dir, 'c-new'), { open: null, waiting: null });
    s.close();
    const nf = path.join(dir, 'conversations', 'c-nosteps.db');
    const n = new sqlite.DatabaseSync(nf);
    n.exec('CREATE TABLE other (x INT)');
    n.close();
    assert.equal(T.agySteps(dir, 'c-nosteps'), null); // no steps table
  } finally {
    cleanup();
  }
});

test('processTable: parses the process list; null without one', async () => {
  const replies = [];
  const cp = { execFile: (exe, args, opts, cb) => { cp.last = { exe, args }; setImmediate(() => cb(...replies.shift())); } };
  const P = loadEngine({ stubs: { 'node:child_process': cp } }).__t;
  replies.push([null, '  10 4 133000000000000000\r\n  4 0\n\nheader line\n 11 10 \n']);
  const t = await P.processTable();
  assert.deepEqual([...t.parents], [[10, 4], [4, 0], [11, 10]]);
  assert.deepEqual([...t.starts], [[10, 133000000000000000]]);
  if (P.WIN) assert.match(cp.last.exe, /powershell\.exe$/i);
  else assert.equal(cp.last.exe, 'ps');
  replies.push([new Error('failed'), '']);
  assert.equal(await P.processTable(), null);
  replies.push([new Error('timeout'), '5 1\n']); // an error with output still parses
  assert.equal((await P.processTable()).parents.get(5), 1);
  replies.push([null, 'nothing useful']);
  assert.equal(await P.processTable(), null);
});
