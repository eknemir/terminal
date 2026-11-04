'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const realOs = require('os');
const realCp = require('child_process');
const path = require('path');
const { EventEmitter } = require('events');
const { requireWith } = require('../helpers/electron');

const WIN = process.platform === 'win32';
const HOME = fs.mkdtempSync(path.join(realOs.tmpdir(), 'atl-term-home-'));
const CLAUDE_DIR = path.join(HOME, '.claude');
fs.mkdirSync(CLAUDE_DIR);

// `where.exe` answers from this table: name -> output (or throws when missing).
const onPath = {};
const whichCalls = [];
const cp = {
  ...realCp,
  execFileSync(file, args, opts) {
    whichCalls.push({ file, args, opts });
    const out = onPath[args[0]];
    if (out == null) throw new Error('not found');
    return out;
  },
};

class FakePty {
  constructor(file, args, opts) {
    Object.assign(this, { file, args, opts, pid: 4242, written: [], sizes: [], killed: 0 });
    FakePty.made.push(this);
  }
  onData(f) { this.dataFn = f; }
  onExit(f) { this.exitFn = f; }
  write(d) { this.written.push(d); }
  resize(c, r) { this.sizes.push([c, r]); }
  kill() { this.killed++; if (this.throwOnKill) throw new Error('gone'); }
}
FakePty.made = [];
const fakePty = { spawn: (f, a, o) => new FakePty(f, a, o) };

class FakeLink extends EventEmitter {
  constructor(replies = {}) {
    super();
    this.replies = replies;
    this.requests = [];
    this.sent = [];
    this.closedCount = 0;
    this.canEnd = true;
  }
  request(m) {
    this.requests.push(m);
    const r = this.replies[m.t];
    return Promise.resolve(typeof r === 'function' ? r(m) : r || { t: 'ok' });
  }
  send(m) { this.sent.push(m); }
  close() { this.closedCount++; }
}

function load({ pty = fakePty, openHost } = {}) {
  const stubs = {
    child_process: cp,
    os: { ...realOs, homedir: () => HOME },
    './sessionhost': { openHost: openHost || (() => Promise.reject(new Error('no host'))) },
  };
  if (pty) stubs['node-pty'] = pty;
  else stubs['node-pty'] = undefined;
  return requireWith('windows/src/terminals.js', stubs);
}

function withEnv(vars, fn) {
  const old = {};
  for (const k of Object.keys(vars)) {
    old[k] = process.env[k];
    if (vars[k] === undefined) delete process.env[k];
    else process.env[k] = vars[k];
  }
  const restore = () => { for (const k of Object.keys(old)) { if (old[k] === undefined) delete process.env[k]; else process.env[k] = old[k]; } };
  try {
    const r = fn();
    if (r && typeof r.then === 'function') return r.finally(restore);
    restore();
    return r;
  } catch (e) {
    restore();
    throw e;
  }
}
const tick = () => new Promise((r) => setImmediate(r));
const silence = async (fn) => {
  const orig = console.error;
  console.error = () => {};
  try { return await fn(); } finally { console.error = orig; }
};

test('which: first line of where.exe, null when missing or empty', () => {
  const t = load();
  onPath['foo'] = '\r\n  C:\\a\\foo.exe \r\nC:\\b\\foo.exe\r\n';
  assert.equal(t.which('foo'), 'C:\\a\\foo.exe');
  onPath['blank'] = '\r\n';
  assert.equal(t.which('blank'), null);
  assert.equal(t.which('missing'), null);
  const last = whichCalls[whichCalls.length - 1];
  assert.equal(last.file, WIN ? 'where.exe' : 'which');
  assert.equal(last.opts.timeout, 3000);
  delete onPath.foo;
  delete onPath.blank;
});

test('resolveClaude: on PATH (and existing), else the usual places, else null', { skip: !WIN }, () => {
  const t = load();
  const real = path.join(HOME, 'claude-on-path.exe');
  fs.writeFileSync(real, '');
  onPath.claude = real + '\r\n';
  assert.equal(t.resolveClaude(), real);
  onPath.claude = path.join(HOME, 'nope.exe');
  withEnv({ APPDATA: path.join(HOME, 'AppData', 'Roaming') }, () => {
    assert.equal(t.resolveClaude(), null);
    const npm = path.join(HOME, 'AppData', 'Roaming', 'npm', 'claude.cmd');
    fs.mkdirSync(path.dirname(npm), { recursive: true });
    fs.writeFileSync(npm, '');
    assert.equal(t.resolveClaude(), npm);
    const local = path.join(HOME, '.local', 'bin', 'claude.exe');
    fs.mkdirSync(path.dirname(local), { recursive: true });
    fs.writeFileSync(local, '');
    assert.equal(t.resolveClaude(), local, 'the native installer first');
    fs.rmSync(local);
    fs.rmSync(npm);
  });
  withEnv({ APPDATA: undefined }, () => {
    const def = path.join(HOME, 'AppData', 'Roaming', 'npm', 'claude.cmd');
    fs.mkdirSync(path.dirname(def), { recursive: true });
    fs.writeFileSync(def, '');
    assert.equal(t.resolveClaude(), def);
    fs.rmSync(def);
  });
  delete onPath.claude;
});

test('createTerminals without host or pty: not available, spawn rejects', async () => {
  const { createTerminals } = load({ pty: null });
  const t = createTerminals({ onData() {}, onExit() {} });
  assert.equal(t.available, false);
  assert.equal(t.persistent, false);
  await assert.rejects(t.spawn({ id: 'x', cwd: HOME }), /node-pty is not available/);
  assert.deepEqual(await t.restore(), []);
});

test('local spawn: shell, args, env, data and exit, write / resize / kill', { skip: !WIN }, async () => {
  FakePty.made.length = 0;
  onPath['pwsh.exe'] = 'C:\\pwsh\\pwsh.exe\r\n';
  const { createTerminals } = load();
  const data = [], exits = [];
  const t = createTerminals({ onData: (id, d) => data.push([id, d]), onExit: (id, c) => exits.push([id, c]), extraPath: 'C:\\extra' });
  delete onPath['pwsh.exe'];
  assert.equal(t.available, true);
  await withEnv({ CLAUDECODE: '1', CLAUDE_CODE_ENTRYPOINT: 'x', WT_SESSION: 'w', TERM_SESSION_ID: 't', KEEP_ME: 'k', CLAUDE_CONFIG_DIR: CLAUDE_DIR }, async () => {
    const p = t.spawn({ id: 'w1', cwd: HOME, title: 'T' });
    assert.equal(t.has('w1'), true);
    await p;
  });
  const pty = FakePty.made[0];
  assert.equal(pty.file, 'C:\\pwsh\\pwsh.exe');
  assert.deepEqual(pty.args, ['-NoLogo']);
  assert.equal(pty.opts.cwd, HOME);
  assert.equal(pty.opts.cols, 100);
  assert.equal(pty.opts.rows, 30);
  assert.equal(pty.opts.useConpty, true);
  const env = pty.opts.env;
  assert.equal(env.CLAUDECODE, undefined);
  assert.equal(env.CLAUDE_CODE_ENTRYPOINT, undefined);
  assert.equal(env.WT_SESSION, undefined);
  assert.equal(env.TERM_SESSION_ID, undefined);
  assert.equal(env.KEEP_ME, 'k');
  assert.equal(env.TERM, 'xterm-256color');
  assert.equal(env.COLORTERM, 'truecolor');
  assert.equal(env.TERM_PROGRAM, 'Terminal');
  assert.equal(env.CLAUDE_CODE_NO_FLICKER, '1');
  const pk = Object.keys(env).filter((k) => k.toUpperCase() === 'PATH');
  assert.equal(pk.length, 1);
  const parts = env[pk[0]].split(';');
  assert.equal(parts[parts.length - 1], 'C:\\extra');
  assert.equal(parts[0], path.join(HOME, '.local', 'bin'));
  assert.equal(pty.pid, 4242);
  assert.equal(t.local('w1'), true);
  assert.deepEqual([...t.pids()], [4242]);
  assert.deepEqual(t.cwds(), [HOME]);
  assert.deepEqual(t.list().map((x) => [x.id, x.cwd, x.claude, x.pid]), [['w1', HOME, false, 4242]]);
  pty.dataFn('out');
  assert.deepEqual(data, [['w1', 'out']]);
  assert.equal(t.busySince(1000), true);
  t.write('w1', 'ls\r');
  t.write('nope', 'x');
  assert.deepEqual(pty.written, ['ls\r']);
  t.resize('w1', 80, 24);
  t.resize('w1', 0, 24);
  t.resize('w1', 80, 0);
  t.resize('nope', 80, 24);
  assert.deepEqual(pty.sizes, [[80, 24]]);
  pty.exitFn({ exitCode: 7 });
  assert.deepEqual(exits, [['w1', 7]]);
  assert.equal(t.has('w1'), false);
  assert.equal(t.local('w1'), false);
  assert.equal(t.busySince(1000), false);
});

test('local spawn: claude args, model, resumed chats, install, missing cwd', { skip: !WIN }, async () => {
  FakePty.made.length = 0;
  const { createTerminals } = load();
  const t = createTerminals({ onData() {}, onExit() {} });
  const exe = path.join(HOME, "it's", 'claude.exe');
  fs.mkdirSync(path.dirname(exe), { recursive: true });
  fs.writeFileSync(exe, '');
  onPath.claude = exe;
  await t.spawn({ id: 'c1', cwd: path.join(HOME, 'missing'), claudeArgs: [], model: 'opus' });
  await t.spawn({ id: 'c2', cwd: HOME, claudeArgs: ['--resume', "a'b"], model: 'opus' });
  await t.spawn({ id: 'c3', cwd: HOME, claudeArgs: [], model: 'default' });
  await t.spawn({ id: 'c4', cwd: HOME, claudeArgs: ['--model', 'x'], model: 'opus' });
  await t.spawn({ id: 'c5', cwd: HOME, claudeArgs: ['-r'], model: 'opus' });
  delete onPath.claude;
  await t.spawn({ id: 'c6', cwd: HOME, claudeArgs: ['x'], cols: 10, rows: 5 });
  await t.spawn({ id: 'i1', cwd: HOME, install: true });
  const [c1, c2, c3, c4, c5, c6, i1] = FakePty.made;
  assert.equal(c1.opts.cwd, HOME);
  assert.deepEqual(c1.args, ['-NoLogo', '-NoExit', '-Command', `& '${exe.replace(/'/g, "''")}'`]);
  assert.equal(c1.opts.env.ANTHROPIC_MODEL, 'opus');
  assert.deepEqual(c2.args.slice(3), [`& '${exe.replace(/'/g, "''")}' '--resume' 'a''b'`]);
  assert.equal(c2.opts.env.ANTHROPIC_MODEL, undefined);
  assert.equal(c3.opts.env.ANTHROPIC_MODEL, undefined);
  assert.equal(c4.opts.env.ANTHROPIC_MODEL, undefined);
  assert.equal(c5.opts.env.ANTHROPIC_MODEL, undefined);
  assert.equal(c6.args[3], "claude 'x'");
  assert.equal(c6.opts.cols, 10);
  assert.equal(c6.opts.rows, 5);
  assert.match(i1.args[3], /irm https:\/\/claude\.ai\/install\.ps1 \| iex/);
  assert.equal(i1.args[2], '-Command');
  assert.equal(t.list().find((x) => x.id === 'c1').claude, true);
  assert.equal(t.list().find((x) => x.id === 'i1').claude, false);
  // the claude folder goes first on PATH, once
  const env = c1.opts.env;
  const pk = Object.keys(env).find((k) => k.toUpperCase() === 'PATH');
  assert.equal(env[pk].split(';')[0], path.dirname(exe));
});

test('childEnvironment: /tui default keeps the classic renderer; no PATH at all', { skip: !WIN }, async () => {
  FakePty.made.length = 0;
  const { createTerminals } = load();
  const t = createTerminals({ onData() {}, onExit() {}, extraPath: 'C:\\x' });
  const dir = fs.mkdtempSync(path.join(HOME, 'cfg-'));
  fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify({ tui: 'default' }));
  await withEnv({ CLAUDE_CONFIG_DIR: dir }, () => t.spawn({ id: 'a', cwd: HOME }));
  assert.equal(FakePty.made[0].opts.env.CLAUDE_CODE_NO_FLICKER, undefined);
  fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify({ tui: 5 }));
  await withEnv({ CLAUDE_CONFIG_DIR: dir }, () => t.spawn({ id: 'b', cwd: HOME }));
  assert.equal(FakePty.made[1].opts.env.CLAUDE_CODE_NO_FLICKER, '1');
  const saved = {};
  for (const k of Object.keys(process.env)) if (k.toUpperCase() === 'PATH') { saved[k] = process.env[k]; delete process.env[k]; }
  try {
    await t.spawn({ id: 'c', cwd: HOME });
  } finally {
    Object.assign(process.env, saved);
  }
  const env = FakePty.made[2].opts.env;
  assert.equal(env.PATH, `${path.join(HOME, '.local', 'bin')};C:\\x`);
  // ~/.local/bin already there (any case): not added twice
  await withEnv({ PATH: `${path.join(HOME, '.local', 'bin').toUpperCase()};C:\\y` }, () => t.spawn({ id: 'd', cwd: HOME }));
  const e4 = FakePty.made[3].opts.env;
  const pk = Object.keys(e4).find((k) => k.toUpperCase() === 'PATH');
  assert.equal(e4[pk], `${path.join(HOME, '.local', 'bin').toUpperCase()};C:\\y;C:\\x`);
});

test('local kill / end / killAll / detachAll', { skip: !WIN }, async () => {
  FakePty.made.length = 0;
  const { createTerminals } = load();
  const t = createTerminals({ onData() {}, onExit() {} });
  await t.spawn({ id: 'a', cwd: HOME });
  await t.spawn({ id: 'b', cwd: HOME });
  await t.spawn({ id: 'c', cwd: HOME });
  FakePty.made[0].throwOnKill = true;
  t.kill('a');
  t.kill('a');
  t.kill('zzz');
  assert.equal(FakePty.made[0].killed, 1);
  assert.equal(t.end('b'), false);
  assert.equal(FakePty.made[1].killed, 1);
  assert.equal(t.end('zzz'), false);
  t.detachAll();
  assert.equal(FakePty.made[2].killed, 1);
  assert.equal(t.has('c'), false);
  await t.spawn({ id: 'd', cwd: HOME });
  t.killAll();
  assert.equal(FakePty.made[3].killed, 1);
  assert.deepEqual(t.list(), []);
});

test('host: spawn goes to the host; failures throw; events; restore; attach', { skip: !WIN }, async () => {
  const link = new FakeLink({
    spawn: (m) => (m.id === 'bad' ? { t: 'error', message: 'nope' } : m.id === 'bad2' ? { t: 'error' } : { t: 'spawned', pid: 99 }),
    list: { sessions: [{ id: 'old', meta: JSON.stringify({ cwd: 'C:\\o', claude: true, title: 'Old' }), pid: 5, startedAt: 123 }, { id: 'h1' }, { id: 'junk', meta: '{bad' }] },
    attach: (m) => (m.id === 'gone' ? { t: 'error' } : { t: 'ok' }),
  });
  const hostArg = { name: 'n', dir: 'd', source: 's' };
  let given = null;
  const { createTerminals } = load({ openHost: (h) => { given = h; return Promise.resolve(link); } });
  const data = [], exits = [];
  const t = createTerminals({ onData: (id, d) => data.push([id, d]), onExit: (id, c) => exits.push([id, c]), host: hostArg });
  assert.equal(given, hostArg);
  await t.spawn({ id: 'h1', cwd: HOME, claudeArgs: [], title: 'Hi', model: 'sonnet', cols: 90, rows: 20 });
  assert.equal(t.persistent, true);
  const sp = link.requests.find((r) => r.t === 'spawn');
  assert.equal(sp.id, 'h1');
  assert.equal(sp.cwd, HOME);
  assert.equal(sp.cols, 90);
  assert.equal(sp.rows, 20);
  assert.equal(sp.env.ANTHROPIC_MODEL, 'sonnet');
  assert.deepEqual(JSON.parse(sp.meta), { cwd: HOME, claude: true, title: 'Hi' });
  assert.match(sp.cmd, /-NoLogo -NoExit -Command/);
  assert.deepEqual([...t.pids()], [99]);
  assert.equal(t.local('h1'), false);
  await assert.rejects(t.spawn({ id: 'bad', cwd: HOME }), /^Error: nope$/);
  await assert.rejects(t.spawn({ id: 'bad2', cwd: HOME }), /oturum sunucusu bunu başlatamadı/);
  assert.equal(t.has('bad'), false);
  link.emit('data', 'h1', 'D');
  link.emit('data', 'unknown', 'U');
  assert.deepEqual(data, [['h1', 'D'], ['unknown', 'U']]);
  // restore: known ids skipped, meta read, junk meta tolerated
  const found = await t.restore();
  assert.deepEqual(found.map((f) => [f.id, f.cwd, f.claude, f.title, f.pid, f.startedAt]), [['old', 'C:\\o', true, 'Old', 5, 123], ['junk', HOME, false, undefined, undefined, found[1].startedAt]]);
  // write / resize / kill through the host
  t.write('h1', 'x');
  t.resize('h1', 50, 10);
  assert.deepEqual(link.sent.slice(-2), [{ t: 'input', id: 'h1', d: 'x' }, { t: 'resize', id: 'h1', cols: 50, rows: 10 }]);
  // attach: one row short, then the real size
  t.attach('h1', 80, 24);
  await tick();
  assert.deepEqual(link.sent[link.sent.length - 1], { t: 'resize', id: 'h1', cols: 80, rows: 23 });
  await new Promise((r) => setTimeout(r, 80));
  assert.deepEqual(link.sent[link.sent.length - 1], { t: 'resize', id: 'h1', cols: 80, rows: 24 });
  const before = link.sent.length;
  t.attach('h1', 80, 1); // too small: no resize
  t.attach('h1', 0, 24);
  t.attach('nope', 80, 24);
  await tick();
  assert.equal(link.sent.length, before);
  assert.equal(link.requests.filter((r) => r.t === 'attach').length, 3);
  // attach to a session the host lost
  link.replies.list = { sessions: [{ id: 'gone', pid: 1 }] };
  await t.restore();
  t.attach('gone', 80, 24);
  await tick();
  assert.deepEqual(exits, [['gone', 1]]);
  // exit event
  link.emit('exit', 'old', 0);
  assert.deepEqual(exits[1], ['old', 0]);
  assert.equal(t.has('old'), false);
  // end: the host ends it gently
  assert.equal(t.end('h1'), true);
  assert.deepEqual(link.sent[link.sent.length - 1], { t: 'end', id: 'h1' });
  assert.equal(t.has('h1'), false);
  // an older host only kills
  link.canEnd = false;
  link.replies.list = { sessions: [{ id: 'k', pid: 2 }] };
  await t.restore();
  assert.equal(t.end('k'), false);
  assert.deepEqual(link.sent[link.sent.length - 1], { t: 'kill', id: 'k' });
});

test('host: a session with no pid yet is not attached; the host closing ends its sessions only', { skip: !WIN }, async () => {
  FakePty.made.length = 0;
  let resolveSpawn;
  const link = new FakeLink({ spawn: () => new Promise((r) => { resolveSpawn = r; }), list: { sessions: [{ id: 'r', pid: 3 }] } });
  const { createTerminals } = load({ openHost: () => Promise.resolve(link) });
  const exits = [];
  const t = createTerminals({ onData() {}, onExit: (id, c) => exits.push([id, c]), host: {} });
  const p = t.spawn({ id: 'pending', cwd: HOME });
  await tick();
  t.attach('pending', 80, 24);
  assert.equal(link.requests.filter((r) => r.t === 'attach').length, 0);
  resolveSpawn({ t: 'spawned', pid: 7 });
  await p;
  await t.restore();
  // a stale link's close is ignored
  const other = new FakeLink();
  other.emit('close');
  link.emit('close');
  assert.equal(t.persistent, false);
  assert.deepEqual(exits.sort(), [['pending', 1], ['r', 1]]);
  // with no link: writes go nowhere, restore is empty, a new spawn runs in the app
  t.write('pending', 'x');
  assert.deepEqual(await t.restore(), []);
  await t.spawn({ id: 'here', cwd: HOME });
  assert.equal(FakePty.made.length, 1);
  assert.equal(t.local('here'), true);
  link.emit('close'); // second close: link !== l now
  assert.equal(t.has('here'), true);
});

test('host closing keeps the in-app terminals', { skip: !WIN }, async () => {
  FakePty.made.length = 0;
  const link = new FakeLink({ spawn: { t: 'spawned', pid: 1 } });
  let ok = true;
  const { createTerminals } = load({ openHost: () => (ok ? Promise.resolve(link) : Promise.reject(new Error('x'))) });
  const t = createTerminals({ onData() {}, onExit() {}, host: {} });
  await t.spawn({ id: 'h', cwd: HOME });
  t.detachAll();
  assert.equal(link.closedCount, 1);
  assert.equal(t.persistent, false);
  // h was in the host: still known after detaching (it goes on without the app)
  assert.equal(t.has('h'), true);
  t.detachAll(); // no link: nothing to close
  assert.equal(link.closedCount, 1);
  // a resize/kill without link is silent
  t.resize('h', 10, 10);
  t.kill('h');
  assert.equal(t.has('h'), false);
  // host fails to open: in the app
  ok = false;
  await silence(async () => {
    const t2 = createTerminals({ onData() {}, onExit() {}, host: {} });
    await t2.spawn({ id: 'x', cwd: HOME });
    assert.equal(t2.local('x'), true);
    assert.equal(t2.persistent, false);
  });
});

test('commandLine quoting for the host (CommandLineToArgv rules)', { skip: !WIN }, async () => {
  const link = new FakeLink({ spawn: { t: 'spawned', pid: 1 } });
  onPath['pwsh.exe'] = 'C:\\Program Files\\PowerShell\\7\\pwsh.exe';
  const { createTerminals } = load({ openHost: () => Promise.resolve(link) });
  const t = createTerminals({ onData() {}, onExit() {}, host: {} });
  delete onPath['pwsh.exe'];
  await t.spawn({ id: 'q', cwd: HOME, claudeArgs: ['say "hi"', 'C:\\dir\\'] });
  const cmd = link.requests.find((r) => r.t === 'spawn').cmd;
  assert.ok(cmd.startsWith('"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -NoLogo -NoExit -Command "'));
  assert.ok(cmd.includes(`'say \\"hi\\"'`));
  // plain shell
  await t.spawn({ id: 'p', cwd: HOME });
  assert.equal(link.requests.filter((r) => r.t === 'spawn')[1].cmd, '"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -NoLogo');
});

test('windows PowerShell when pwsh is missing', { skip: !WIN }, async () => {
  FakePty.made.length = 0;
  const { createTerminals } = load();
  await withEnv({ SystemRoot: 'C:\\Win' }, async () => {
    const t = createTerminals({ onData() {}, onExit() {} });
    await t.spawn({ id: 'a', cwd: HOME });
  });
  assert.equal(FakePty.made[0].file, path.join('C:\\Win', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'));
});
