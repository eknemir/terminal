'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const realCp = require('child_process');
const { EventEmitter } = require('events');
const { requireWith } = require('../helpers/electron');

const WIN = process.platform === 'win32';

function harness() {
  const procs = [];
  const execs = [];
  const cp = {
    ...realCp,
    spawn(file, args, opts) {
      const p = new EventEmitter();
      p.file = file;
      p.args = args;
      p.opts = opts;
      p.asks = [];
      p.stdin = { writable: true, write: (s) => p.asks.push(s), on() {} };
      p.stdout = new EventEmitter();
      p.killed = 0;
      p.kill = () => { p.killed++; };
      procs.push(p);
      return p;
    },
    execFile(file, args, opts, cb) {
      execs.push({ file, args });
      if (cb) cb(null, '');
    },
  };
  const { createRunaways } = requireWith('windows/src/runaways.js', { child_process: cp });
  const changes = [];
  let reads = 0;
  const r = createRunaways({ onChange: (j) => changes.push(JSON.parse(j)), onRead: () => reads++ });
  return { r, procs, execs, changes, reads: () => reads };
}
// a row as the PowerShell writes it
const row = (p) => [p.pid, p.ppid ?? 0, p.orphan ? 1 : 0, p.started ?? 1000, p.cpu ?? 0, p.name, p.cwd ?? '', p.cmd ?? ''].join('\t');
const emit = (proc, rows, split = false) => {
  const text = rows.map(row).join('\r\n') + (rows.length ? '\r\n' : '') + 'end\n';
  if (!split) return proc.stdout.emit('data', Buffer.from(text));
  const mid = Math.floor(text.length / 2);
  proc.stdout.emit('data', Buffer.from(text.slice(0, mid)));
  proc.stdout.emit('data', Buffer.from(text.slice(mid)));
};

test('start: one PowerShell, asks at once and every 5 s with the wanted pids', { skip: !WIN }, (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout', 'Date'], now: 1_000_000 });
  const h = harness();
  h.r.start();
  const ps = h.procs[0];
  assert.equal(ps.file, 'powershell.exe');
  assert.deepEqual(ps.args.slice(0, 3), ['-NoProfile', '-NonInteractive', '-EncodedCommand']);
  const script = Buffer.from(ps.args[3], 'base64').toString('utf16le');
  assert.match(script, /Get-CimInstance Win32_Process/);
  assert.match(script, /public static class AtlCwd/);
  assert.equal(ps.opts.windowsHide, true);
  assert.deepEqual(ps.asks, ['\n']);
  h.r.want([3, 3, 0, -1, 7]);
  t.mock.timers.tick(5000);
  assert.deepEqual(ps.asks, ['\n', '3,7\n']);
  ps.stdin.writable = false;
  t.mock.timers.tick(5000);
  assert.equal(ps.asks.length, 2);
  h.r.stop();
  assert.equal(ps.killed, 1);
});

test('the sampler restarts 30 s after it ends, not after stop', { skip: !WIN }, (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout', 'Date'], now: 1_000_000 });
  const h = harness();
  h.r.start();
  h.procs[0].emit('exit');
  t.mock.timers.tick(29_999);
  assert.equal(h.procs.length, 1);
  t.mock.timers.tick(1);
  assert.equal(h.procs.length, 2);
  // the old one's asks don't go to it anymore
  t.mock.timers.tick(5000);
  assert.equal(h.procs[0].asks.length, 1);
  assert.ok(h.procs[1].asks.length >= 2);
  h.r.stop();
  h.procs[1].emit('exit');
  t.mock.timers.tick(60_000);
  assert.equal(h.procs.length, 2);
});

test('read: rows parsed, short / bad rows dropped, children, pct, onRead', { skip: !WIN }, (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout', 'Date'], now: 1_000_000 });
  const h = harness();
  h.r.start();
  const ps = h.procs[0];
  ps.stdout.emit('data', Buffer.from('1\t2\n0\t0\t0\t1\t0\tx.exe\t\t\nend\n'));
  assert.equal(h.reads(), 1);
  assert.deepEqual(h.r.children(0), []);
  const rows = [
    { pid: 10, ppid: 1, orphan: false, started: 500, cpu: 0, name: 'WindowsTerminal.exe' },
    { pid: 11, ppid: 10, started: 600, cpu: 1000, name: 'pwsh.exe', cwd: 'C:\\w', cmd: 'pwsh -NoLogo\tx' },
    { pid: 12, ppid: 11, started: 700, cpu: 0, name: 'node.exe', cmd: 'node a.js' },
    { pid: 13, ppid: 11, started: 650, cpu: 0, name: 'git.exe' },
    { pid: 14, ppid: 14, started: 650, cpu: 0, name: 'self' },
    { pid: 15, ppid: 11, orphan: true, started: 650, cpu: 0, name: 'orph' },
  ];
  emit(ps, rows, true);
  const kids = h.r.children(11);
  assert.deepEqual(kids.map((k) => k.pid), [13, 12], 'oldest first');
  assert.equal(kids[1].name, 'node');
  assert.equal(h.r.children(11).find((k) => k.pid === 15), undefined);
  assert.deepEqual(h.r.children(14), []);
  // the tab inside the command line was a column split: joined back with a space
  assert.equal(h.r.children(10)[0].cmd, 'pwsh -NoLogo x');
  assert.equal(h.r.children(10)[0].cwd, 'C:\\w');
  assert.deepEqual(new Set(h.r.tree(10).map((x) => x.pid)), new Set([10, 11, 12, 13]));
  assert.equal(h.r.tree(10).at(-1).pid, 10, 'deepest first, the root last');
  assert.deepEqual(h.r.tree(999), []);
  // pct over 2 s: 1000 ms more CPU = 50 %
  t.mock.timers.tick(2000);
  emit(ps, rows.map((p) => (p.pid === 11 ? { ...p, cpu: 2000 } : p)));
  assert.equal(h.r.busy([11]), 50);
  assert.equal(h.r.busy([10]), 50, 'a tree adds its children');
  // a restarted process (other start) or less CPU: 0
  t.mock.timers.tick(2000);
  emit(ps, rows.map((p) => (p.pid === 11 ? { ...p, cpu: 1500 } : p)));
  assert.equal(h.r.busy([11]), 0);
  t.mock.timers.tick(2000);
  emit(ps, rows.map((p) => (p.pid === 11 ? { ...p, cpu: 9000, started: 601 } : p)));
  assert.equal(h.r.busy([11]), 0);
});

test('runaways: orphan shell over 50 % for 2 minutes; sorted, cleared, end()', { skip: !WIN }, (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout', 'Date'], now: 1_000_000 });
  const h = harness();
  h.r.start();
  const ps = h.procs[0];
  let cpuA = 0, cpuB = 0;
  const sample = (stepA, stepB, extra = []) => {
    cpuA += stepA;
    cpuB += stepB;
    emit(ps, [
      { pid: 21, orphan: true, started: 100, cpu: cpuA, name: 'node.exe', cmd: 'node burn.js' },
      { pid: 22, orphan: true, started: 100, cpu: cpuB, name: 'python3.11.exe' },
      { pid: 23, orphan: false, started: 100, cpu: cpuA, name: 'node.exe' },
      { pid: 24, orphan: true, started: 100, cpu: cpuA, name: 'chrome.exe' },
      ...extra,
    ]);
  };
  sample(0, 0);
  for (let i = 0; i < 24; i++) {
    t.mock.timers.tick(5000);
    sample(5000, 2600); // 100 % and 52 %
  }
  // 24 * 5 s = 120 s since the first over-the-line sample at 5 s: 115 s, not yet
  assert.equal(h.changes.length, 0);
  assert.equal(h.r.json(), '[]');
  t.mock.timers.tick(5000);
  sample(5000, 2600);
  assert.equal(h.changes.length, 1);
  const list = h.changes[0];
  assert.deepEqual(list.map((x) => [x.pid, x.cpu]), [[21, 100], [22, 52]]);
  assert.equal(list[0].cmd, 'node burn.js');
  assert.equal(list[1].cmd, 'python3.11', 'no command line: the name');
  assert.equal(list[0].started, 100);
  assert.equal(list[0].since, 1_005_000);
  assert.equal(list[0].cpuTime, cpuA / 1000);
  // the next reading: its CPU time moved on, so the list is new
  t.mock.timers.tick(5000);
  sample(5000, 2600);
  assert.equal(h.changes.length, 2);
  assert.equal(h.changes[1][0].cpuTime, cpuA / 1000);
  // 22 drops under the line (49 %): out at once
  t.mock.timers.tick(5000);
  sample(5000, 2450);
  assert.deepEqual(h.changes.at(-1).map((x) => x.pid), [21]);
  // end(): only the same process (start within 1 s)
  const killed = [];
  const origKill = process.kill;
  process.kill = (pid, sig) => { killed.push([pid, sig]); if (pid === 22) throw new Error('gone'); };
  try {
    assert.equal(h.r.end(21, 100 + 2000), false);
    assert.equal(h.r.end(999, 100), false);
    assert.equal(h.r.end('21', '1100'), true);
    assert.equal(h.r.end(22, 100), false, 'kill throws');
  } finally {
    process.kill = origKill;
  }
  assert.deepEqual(killed, [['21', undefined], [22, undefined]]);
  // 21 gone from the list: forgotten
  t.mock.timers.tick(5000);
  emit(ps, []);
  assert.deepEqual(h.changes.at(-1), []);
  assert.equal(h.r.end(21, 100), false);
});

test('runaways: dipping under the line restarts the 2 minutes; less CPU or no time passed is skipped', { skip: !WIN }, (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout', 'Date'], now: 1_000_000 });
  const h = harness();
  h.r.start();
  const ps = h.procs[0];
  let cpu = 0;
  const one = (step) => { cpu += step; emit(ps, [{ pid: 5, orphan: true, started: 1, cpu, name: 'bash' }]); };
  one(0);
  for (let i = 0; i < 40; i++) {
    t.mock.timers.tick(5000);
    one(i === 20 ? 2000 : 5000); // 40 % once, at 105 s
  }
  // over again from 110 s: 120 s later is 230 s; the last reading is at 200 s
  assert.equal(h.changes.length, 0);
  // the same moment again (at <= prev.at): skipped, not counted as under
  one(0);
  // CPU went down (a counter reset): skipped
  t.mock.timers.tick(5000);
  one(-100);
  assert.equal(h.changes.length, 0);
  // exactly 50 % counts as over
  const h2 = harness();
  h2.r.start();
  let c2 = 0;
  const two = () => { emit(h2.procs[0], [{ pid: 6, orphan: true, started: 1, cpu: c2, name: 'cmd' }]); c2 += 2500; };
  two();
  for (let i = 0; i < 26; i++) { t.mock.timers.tick(5000); two(); }
  assert.equal(h2.changes.length > 0, true);
  assert.equal(h2.changes[0][0].cpu, 50);
});

test('runaways: a pid taken by a new process starts its 2 minutes afresh', { skip: !WIN, todo: 'runaways.js:102 keeps `over` for a reused pid' }, (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout', 'Date'], now: 1_000_000 });
  const h = harness();
  h.r.start();
  const ps = h.procs[0];
  let cpu = 0, started = 1;
  const one = () => emit(ps, [{ pid: 5, orphan: true, started, cpu, name: 'bash' }]);
  one();
  for (let i = 0; i < 23; i++) { t.mock.timers.tick(5000); cpu += 5000; one(); } // 115 s over the line
  started = 2; // the pid is another process now, burning too
  cpu = 0;
  t.mock.timers.tick(5000); one();
  t.mock.timers.tick(5000); cpu += 5000; one();
  t.mock.timers.tick(5000); cpu += 5000; one();
  assert.equal(h.changes.length, 0, 'the new process has burned for 10 s only');
});

test('fresh(): resolves on the next reading, or after 4 s; at once without a sampler', { skip: !WIN }, async (t) => {
  const h = harness();
  await h.r.fresh();
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout', 'Date'], now: 1_000_000 });
  h.r.start();
  const ps = h.procs[0];
  let done = false;
  const p = h.r.fresh().then(() => { done = true; });
  assert.equal(ps.asks.length, 2, 'asked now');
  emit(ps, []);
  await p;
  assert.equal(done, true);
  let late = false;
  const q = h.r.fresh().then(() => { late = true; });
  t.mock.timers.tick(4000);
  await q;
  assert.equal(late, true);
});

test('kill(): only processes still the same', { skip: !WIN }, (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout', 'Date'], now: 1_000_000 });
  const h = harness();
  h.r.start();
  emit(h.procs[0], [{ pid: 31, started: 5, name: 'a' }, { pid: 32, started: 5, name: 'b' }]);
  const killed = [];
  const origKill = process.kill;
  process.kill = (pid) => { killed.push(pid); if (pid === 32) throw new Error('x'); };
  try {
    h.r.kill([{ pid: 31, started: 5 }, { pid: 32, started: 5 }, { pid: 31, started: 6 }, { pid: 99, started: 5 }]);
  } finally {
    process.kill = origKill;
  }
  assert.deepEqual(killed, [31, 32]);
});

test('left(): orphan shells older than 10 s, not claude, not burning; endLeft', { skip: !WIN }, async (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout', 'Date'], now: 1_000_000 });
  const h = harness();
  h.r.start();
  const ps = h.procs[0];
  const now = 1_000_000;
  emit(ps, [
    { pid: 41, orphan: true, started: now - 60_000, name: 'node.exe', cwd: 'C:\\srv', cmd: 'node server.js' },
    { pid: 42, orphan: true, started: now - 20_000, name: 'cmd.exe' },
    { pid: 43, orphan: true, started: now - 5_000, name: 'bash' },
    { pid: 44, orphan: true, started: now - 60_000, name: 'claude.exe' },
    { pid: 45, orphan: false, started: now - 60_000, ppid: 41, name: 'pwsh' },
    { pid: 46, orphan: true, started: now - 60_000, name: 'notepad' },
    { pid: 47, orphan: true, started: now - 10_000, name: 'sh' },
  ]);
  const left = h.r.left();
  assert.deepEqual(left.map((x) => x.pid), [41, 42, 47]);
  assert.deepEqual(left[0], { pid: 41, started: now - 60_000, name: 'node', cmd: 'node server.js', cwd: 'C:\\srv', cpu: 0 });
  assert.equal(left[1].cmd, 'cmd');
  // endLeft
  assert.equal(h.r.endLeft(999, 1), false);
  assert.equal(h.r.endLeft(41, now - 58_000), false, 'start too far off');
  const killed = [];
  const origKill = process.kill;
  process.kill = (pid) => killed.push(pid);
  try {
    assert.equal(h.r.endLeft('41', String(now - 60_500)), true);
    assert.deepEqual(h.execs[0], { file: 'taskkill.exe', args: ['/PID', '41', '/T'] });
    t.mock.timers.tick(2000);
    // fresh() asked: answer with 45 still there and 41 restarted
    emit(ps, [{ pid: 41, orphan: true, started: now, name: 'node' }, { pid: 45, ppid: 41, started: now - 60_000, name: 'pwsh' }]);
    await new Promise((r) => setImmediate(r));
  } finally {
    process.kill = origKill;
  }
  assert.deepEqual(killed, [45]);
});

test('ais(): tools by name, script or package; in a terminal; not under claude; once per chain; shell command', { skip: !WIN }, (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout', 'Date'], now: 1_000_000 });
  const h = harness();
  h.r.start();
  emit(h.procs[0], [
    { pid: 1, name: 'WindowsTerminal.exe' },
    { pid: 2, ppid: 1, name: 'pwsh.exe' },
    { pid: 3, ppid: 2, name: 'node.exe', cmd: 'node --no-warnings "C:\\npm\\node_modules\\@openai\\codex\\bin\\codex.js"', cwd: 'C:\\proj' },
    { pid: 4, ppid: 3, name: 'codex.exe' }, // the launcher's own child: same tool, not another
    { pid: 5, ppid: 4, name: 'powershell.exe', cmd: 'powershell.exe -Command "npm test"' },
    { pid: 6, ppid: 2, name: 'python.exe', cmd: 'python -m aider' },
    { pid: 7, ppid: 2, name: 'claude.exe' },
    { pid: 8, ppid: 7, name: 'gemini.exe' }, // Claude runs it: not a session
    { pid: 9, ppid: 0, orphan: true, name: 'opencode.exe' }, // no terminal above
    { pid: 10, ppid: 2, name: 'node.exe', cmd: 'node C:\\x\\node_modules\\@google\\gemini-cli\\dist\\index.js' },
    { pid: 11, ppid: 2, name: 'node.exe', cmd: 'node server.js' },
    { pid: 12, ppid: 2, name: 'bun', cmd: 'bun' },
    { pid: 13, ppid: 2, name: 'Amp' },
    { pid: 14, ppid: 13, name: 'cmd', cmd: 'cmd /c "dir"' },
    { pid: 15, ppid: 14, name: 'bash', cmd: 'bash -lc ls' },
  ]);
  const ais = h.r.ais();
  const by = Object.fromEntries(ais.map((a) => [a.pid, a]));
  assert.deepEqual(Object.keys(by).map(Number).sort((a, b) => a - b), [3, 6, 10, 13]);
  assert.equal(by[3].tool, 'Codex');
  assert.equal(by[3].cwd, 'C:\\proj');
  assert.deepEqual(by[3].chain, [2, 1]);
  assert.equal(by[3].command, 'npm test');
  assert.equal(by[6].tool, 'Aider');
  assert.equal(by[6].cwd, '');
  assert.equal(by[6].command, null);
  assert.equal(by[10].tool, 'Gemini');
  assert.equal(by[13].tool, 'Amp');
  assert.equal(by[13].command, 'ls', 'the deepest shell command found wins');
});

test('ais(): a chain longer than 12 stops; started and pct', { skip: !WIN }, (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout', 'Date'], now: 1_000_000 });
  const h = harness();
  h.r.start();
  const rows = [{ pid: 100, name: 'cmd' }];
  for (let i = 1; i <= 13; i++) rows.push({ pid: 100 + i, ppid: 100 + i - 1, name: 'x' });
  rows.push({ pid: 200, ppid: 113, name: 'codex', started: 77 });
  emit(h.procs[0], rows);
  // the terminal is 14 levels up: past the 12 looked at
  assert.deepEqual(h.r.ais(), []);
  const near = [{ pid: 1, name: 'cmd' }, { pid: 2, ppid: 1, name: 'kimi', started: 77 }];
  emit(h.procs[0], near);
  assert.deepEqual(h.r.ais().map((a) => [a.pid, a.tool, a.started, a.pct]), [[2, 'Kimi', 77, 0]]);
});

test('stop before start and json() default', () => {
  const h = harness();
  assert.equal(h.r.json(), '[]');
  h.r.stop();
  assert.deepEqual(h.r.left(), []);
  assert.deepEqual(h.r.ais(), []);
  assert.equal(h.r.busy([1]), 0);
});
