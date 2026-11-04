'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');
const { requireWith } = require('../helpers/electron');

const WIN = process.platform === 'win32';

// A pretend git: `answer(args, dir)` gives { status, out, err } (strings), 'nostart', 'throw' or 'hang'.
function fakeGit(answer) {
  const calls = [];
  const spawn = (exe, argv, opts) => {
    const dir = argv[1];
    const args = argv.slice(2);
    calls.push({ exe, dir, args, env: opts.env });
    const a = answer(args, dir) || { status: 0, out: '' };
    if (a === 'throw') throw new Error('spawn failed');
    const p = new EventEmitter();
    p.stdout = new EventEmitter();
    p.stderr = new EventEmitter();
    p.stdout.destroy = () => {};
    p.stderr.destroy = () => {};
    p.killed = false;
    p.kill = () => {
      p.killed = true;
      setImmediate(() => { p.emit('exit', null); p.emit('close', null); });
    };
    setImmediate(() => {
      if (a === 'nostart') return p.emit('error', new Error('ENOENT'));
      p.emit('spawn');
      if (a === 'hang') return;
      if (a.chunks) for (const c of a.chunks) p.stdout.emit('data', Buffer.from(c));
      else if (a.out) p.stdout.emit('data', Buffer.from(a.out));
      if (a.err) p.stderr.emit('data', Buffer.from(a.err));
      p.emit('exit', a.status);
      if (!a.noClose) p.emit('close', a.status);
    });
    return p;
  };
  return { spawn, calls };
}

function load(answer, env = {}) {
  const g = fakeGit(answer);
  const old = {};
  for (const k of Object.keys(env)) { old[k] = process.env[k]; if (env[k] === undefined) delete process.env[k]; else process.env[k] = env[k]; }
  const mod = requireWith('windows/src/git.js', { 'node:child_process': { spawn: g.spawn } });
  const restore = () => { for (const k of Object.keys(old)) { if (old[k] === undefined) delete process.env[k]; else process.env[k] = old[k]; } };
  return { ...mod, calls: g.calls, restore };
}

const GIT_EXE = process.execPath; // any file that exists
const mkRepo = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'atl-git-'));
  return { dir: d, top: d.replace(/\\/g, '/'), root: path.normalize(d) };
};

// A router for one repo: what each git command answers.
function router(repo, over = {}) {
  return (args, dir) => {
    const key = args.join(' ');
    for (const [k, v] of Object.entries(over)) if (key.startsWith(k)) return typeof v === 'function' ? v(args, dir) : v;
    if (key === 'rev-parse --show-toplevel') return dir.startsWith(repo.dir) ? { status: 0, out: repo.top + '\n' } : { status: 128, out: '' };
    if (key.startsWith('status --porcelain=v1 -z')) return { status: 0, out: '' };
    if (key === 'rev-parse --abbrev-ref HEAD') return { status: 0, out: 'main\n' };
    if (key.startsWith('rev-list')) return { status: 0, out: '2\t3\n' };
    return { status: 0, out: '' };
  };
}

test('handle: junk bodies; repos with no sources; noGit when git is missing', async () => {
  const g = load(() => ({ status: 0, out: '' }), { ATALAY_GIT: GIT_EXE });
  try {
    const git = g.createGit();
    assert.deepEqual(await git.handle({ type: 'repos' }), { repos: [] });
    assert.deepEqual(await git.handle(null), { error: 'bilinmeyen depo' });
    assert.deepEqual(await git.handle([]), { error: 'bilinmeyen depo' });
    assert.deepEqual(await git.handle({ type: 'diff', root: 'x' }), { error: 'bilinmeyen depo' });
    assert.deepEqual(await git.handle({ type: 'diff' }), { error: 'bilinmeyen depo' });
  } finally { g.restore(); }
  if (!WIN) return;
  const h = load(() => ({ status: 0, out: '' }), { ATALAY_GIT: path.join(os.tmpdir(), 'no-such-git.exe') });
  try {
    assert.deepEqual(await h.createGit().handle({ type: 'repos' }), { repos: [], noGit: true });
  } finally { h.restore(); }
});

test('gitExecutable on Windows: PATH (quoted, relative skipped), then Program Files', { skip: !WIN }, async () => {
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'atl-gitbin-'));
  fs.writeFileSync(path.join(bin, 'git.exe'), '');
  const g = load(() => ({ status: 0, out: '' }), { ATALAY_GIT: undefined, PATH: `relative\\dir;"${bin}";C:\\nope` });
  try {
    const repo = mkRepo();
    await g.createGit({ folders: () => [repo.dir] }).handle({ type: 'repos' });
    assert.equal(g.calls[0].exe, path.join(bin, 'git.exe'));
  } finally { g.restore(); }
  const pf = fs.mkdtempSync(path.join(os.tmpdir(), 'atl-pf-'));
  fs.mkdirSync(path.join(pf, 'Git', 'cmd'), { recursive: true });
  fs.writeFileSync(path.join(pf, 'Git', 'cmd', 'git.exe'), '');
  const h = load(() => ({ status: 0, out: '' }), { ATALAY_GIT: undefined, PATH: '', ProgramW6432: pf, ProgramFiles: undefined, 'ProgramFiles(x86)': undefined, LOCALAPPDATA: undefined });
  try {
    const r = await h.createGit({ folders: () => [mkRepo().dir] }).handle({ type: 'repos' });
    assert.equal(h.calls[0].exe, path.join(pf, 'Git', 'cmd', 'git.exe'));
    assert.equal(r.noGit, undefined);
  } finally { h.restore(); }
  const la = fs.mkdtempSync(path.join(os.tmpdir(), 'atl-la-'));
  const k = load(() => ({ status: 0, out: '' }), { ATALAY_GIT: undefined, PATH: '', ProgramW6432: undefined, ProgramFiles: undefined, 'ProgramFiles(x86)': undefined, LOCALAPPDATA: la });
  try {
    const r = await k.createGit({ folders: () => [mkRepo().dir] }).handle({ type: 'repos' });
    assert.equal(k.calls[0].exe, 'git', 'none found: plain git');
    assert.equal(r.noGit, true);
  } finally { k.restore(); }
});

test('environment: no prompts, English, reads without locks', { skip: !WIN }, async () => {
  const repo = mkRepo();
  const g = load(router(repo), { ATALAY_GIT: GIT_EXE, LC_ALL: undefined, LC_MESSAGES: undefined, LANG: undefined, LANGUAGE: undefined });
  try {
    const git = g.createGit({ folders: () => [repo.dir] });
    await git.handle({ type: 'repos' });
    const read = g.calls[0].env;
    assert.equal(read.GIT_TERMINAL_PROMPT, '0');
    assert.equal(read.LANG, 'en_US.UTF-8');
    assert.equal(read.GIT_OPTIONAL_LOCKS, '0');
    await git.handle({ type: 'push', root: repo.root });
    const ch = g.calls.find((c) => c.args[0] === 'push').env;
    assert.equal(ch.GIT_OPTIONAL_LOCKS, undefined);
    assert.equal(ch.GIT_TERMINAL_PROMPT, '0');
  } finally { g.restore(); }
  const h = load(router(repo), { ATALAY_GIT: GIT_EXE, LANG: 'tr_TR' });
  try {
    await h.createGit({ folders: () => [repo.dir] }).handle({ type: 'repos' });
    assert.equal(h.calls[0].env.LANG, 'tr_TR');
  } finally { h.restore(); }
});

test('repos: status parsed (staged, unstaged, untracked, renames), counts, branch, sessions', async () => {
  const repo = mkRepo();
  fs.writeFileSync(path.join(repo.dir, 'new.txt'), 'a\nb\nc');
  fs.writeFileSync(path.join(repo.dir, 'nl.txt'), 'a\nb\n');
  fs.writeFileSync(path.join(repo.dir, 'empty.txt'), '');
  fs.mkdirSync(path.join(repo.dir, 'sub'));
  const status = ['M  staged.js', ' M work.js', 'MM both.js', '?? new.txt', '?? nl.txt', '?? empty.txt', '?? sub', 'R  new-name.js', 'old-name.js', 'x', ' D gone.js', ''].join('\0');
  const g = load(router(repo, {
    'status --porcelain=v1 -z': { status: 0, out: status },
    'diff --numstat': { status: 0, out: '1\t2\twork.js\n3\t4\tboth.js\r\n-\t-\tbin.png\nbad line\n' },
    'diff --cached --numstat': { status: 0, out: '5\t6\tstaged.js\n7\t8\tboth.js\n' },
  }), { ATALAY_GIT: GIT_EXE });
  try {
    const file = path.join(repo.dir, 'work.js');
    const git = g.createGit({
      folders: () => [
        { id: 's1', name: 'N', title: 'T', status: 'busy', live: true, cwd: repo.dir },
        { id: 's1', name: 'dup', cwd: repo.dir },
        { cwd: repo.dir },
        '', 5, null, { id: 7, cwd: repo.dir }, { cwd: '' },
      ],
      written: () => ({ [file]: ['s1', 3, 's2'], bad: 'x', '': ['s1'] }),
    });
    const { repos } = await git.handle({ type: 'repos' });
    assert.equal(repos.length, 1);
    const r = repos[0];
    assert.equal(r.root, repo.root);
    assert.equal(r.name, path.basename(repo.dir));
    assert.equal(r.branch, 'main');
    assert.equal(r.ahead, 2);
    assert.equal(r.behind, 3);
    assert.deepEqual(r.sessions, [{ id: 's1', name: 'N', title: 'T', status: 'busy', live: true }]);
    const f = (p, staged) => r.files.find((x) => x.path === p && x.staged === staged);
    assert.deepEqual(f('staged.js', true), { path: 'staged.js', status: 'M', staged: true, add: 5, del: 6, editors: [] });
    assert.deepEqual(f('work.js', false), { path: 'work.js', status: 'M', staged: false, add: 1, del: 2, editors: ['s1', 's2'] });
    assert.equal(f('both.js', true).add, 7);
    assert.equal(f('both.js', false).add, 3);
    assert.equal(f('staged.js', false), undefined);
    assert.deepEqual(f('new.txt', false), { path: 'new.txt', status: 'U', staged: false, add: 3, del: 0, editors: [] });
    assert.equal(f('nl.txt', false).add, 2);
    assert.equal(f('empty.txt', false).add, 0);
    assert.equal(f('sub', false).add, null, 'a folder is no regular file');
    assert.equal(f('new-name.js', true).status, 'R');
    assert.equal(r.files.some((x) => x.path === 'old-name.js'), false);
    assert.equal(r.files.some((x) => x.path === 'x'), false);
    assert.deepEqual(f('gone.js', false), { path: 'gone.js', status: 'D', staged: false, add: null, del: null, editors: [] });
    if (WIN) assert.equal(r.path, r.root.startsWith(os.homedir()) ? '~' + r.root.slice(os.homedir().length) : r.root);
  } finally { g.restore(); }
});

test('repos: no upstream, detached / failing head, status failing drops the repo', async () => {
  const repo = mkRepo();
  const g = load(router(repo, { 'rev-list': { status: 128, out: '' }, 'rev-parse --abbrev-ref HEAD': { status: 128 } }), { ATALAY_GIT: GIT_EXE });
  try {
    const { repos } = await g.createGit({ folders: () => [repo.dir] }).handle({ type: 'repos' });
    assert.equal(repos[0].ahead, null);
    assert.equal(repos[0].behind, null);
    assert.equal(repos[0].branch, '?');
  } finally { g.restore(); }
  const h = load(router(repo, { 'status --porcelain': { status: 128 } }), { ATALAY_GIT: GIT_EXE });
  try {
    assert.deepEqual((await h.createGit({ folders: () => [repo.dir] }).handle({ type: 'repos' })).repos, []);
  } finally { h.restore(); }
});

test('repos: not a folder / not a repo / folders() throwing / written as a Map / written throwing', async () => {
  const repo = mkRepo();
  const g = load(router(repo), { ATALAY_GIT: GIT_EXE });
  try {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'atl-nogit-'));
    const git = g.createGit({ folders: () => [path.join(repo.dir, 'missing'), outside] });
    assert.deepEqual((await git.handle({ type: 'repos' })).repos, []);
    const g2 = g.createGit({ folders: () => { throw new Error('x'); }, written: () => { throw new Error('y'); } });
    assert.deepEqual((await g2.handle({ type: 'repos' })).repos, []);
    const file = path.join(repo.dir, 'a.js');
    const g3 = g.createGit({ folders: async () => [{ id: 's', cwd: outside }], written: async () => new Map([[file, ['s', 'other']]]) });
    const r = (await g3.handle({ type: 'repos' })).repos;
    assert.equal(r.length, 1, 'a file a session wrote brings its repo in');
    assert.deepEqual(r[0].sessions.map((s) => s.id), ['s']);
    const g4 = g.createGit({ folders: () => 'nope', written: 'not a function' });
    assert.deepEqual((await g4.handle({ type: 'repos' })).repos, []);
  } finally { g.restore(); }
});

test('repos: sorted by live sessions then by changes; cached for 2 s; one look at a time', async () => {
  const a = mkRepo(), b = mkRepo(), c = mkRepo();
  const tops = new Map([[a.dir, a], [b.dir, b], [c.dir, c]]);
  let statusCalls = 0;
  const g = load((args, dir) => {
    const key = args.join(' ');
    if (key === 'rev-parse --show-toplevel') return { status: 0, out: tops.get(dir).top };
    if (key.startsWith('status')) {
      statusCalls++;
      const r = [...tops.values()].find((x) => path.normalize(dir) === x.root);
      return { status: 0, out: r === b ? ' M 1\0 M 2\0' : r === c ? ' M 1\0' : '' };
    }
    return { status: 0, out: '' };
  }, { ATALAY_GIT: GIT_EXE });
  try {
    const git = g.createGit({ folders: () => [a.dir, b.dir, { id: 'x', cwd: c.dir, live: true }] });
    const [r1, r2] = await Promise.all([git.handle({ type: 'repos' }), git.handle({ type: 'repos' })]);
    assert.deepEqual(r1.repos.map((r) => r.root), [c.root, b.root, a.root]);
    assert.deepEqual(r2, r1);
    assert.equal(statusCalls, 3);
    await git.handle({ type: 'repos' });
    assert.equal(statusCalls, 3, 'cached');
    // a change makes it out of date
    await git.handle({ type: 'fetch', root: a.root });
    await git.handle({ type: 'repos' });
    assert.equal(statusCalls, 6);
  } finally { g.restore(); }
});

test('repo roots are cached per folder for a minute', async (t) => {
  const repo = mkRepo();
  const g = load(router(repo), { ATALAY_GIT: GIT_EXE });
  try {
    t.mock.timers.enable({ apis: ['Date'], now: 1_000_000 });
    const git = g.createGit({ folders: () => [repo.dir] });
    await git.handle({ type: 'repos' });
    const n = () => g.calls.filter((c) => c.args[0] === 'rev-parse' && c.args[1] === '--show-toplevel').length;
    assert.equal(n(), 1);
    t.mock.timers.tick(2001);
    await git.handle({ type: 'repos' });
    assert.equal(n(), 1);
    t.mock.timers.tick(60000);
    await git.handle({ type: 'repos' });
    assert.equal(n(), 2);
  } finally { g.restore(); }
});

async function withRepo(over, fn, opts = {}) {
  const repo = mkRepo();
  const g = load(router(repo, over), { ATALAY_GIT: GIT_EXE });
  try {
    const git = g.createGit({ folders: () => [repo.dir], ...opts });
    await git.handle({ type: 'repos' });
    return await fn(git, repo, g);
  } finally { g.restore(); }
}

test('diff: working tree, staged, commit, untracked file, outside the repo', async () => {
  await withRepo({
    'diff --no-color': { status: 0, out: 'DIFF' },
    'diff --cached': { status: 0, out: 'STAGED' },
    'show --first-parent': (args) => (args.includes('abc1234') ? { status: 0, out: 'SHOW' } : { status: 0, out: '' }),
  }, async (git, repo, g) => {
    const abs = `${repo.root}/a.js`;
    assert.deepEqual(await git.handle({ type: 'diff', root: repo.root, path: 'a.js' }), { diff: 'DIFF', abs });
    assert.deepEqual(await git.handle({ type: 'diff', root: repo.root, path: 'a.js', staged: true }), { diff: 'STAGED', abs });
    assert.deepEqual(await git.handle({ type: 'diff', root: repo.root, path: 'a.js', commit: 'abc1234' }), { diff: 'SHOW', abs });
    assert.deepEqual(await git.handle({ type: 'diff', root: repo.root, path: 'a.js', commit: 'def5678' }), { abs, note: 'fark yok' });
    assert.deepEqual(await git.handle({ type: 'diff', root: repo.root, path: 'a.js', commit: 'xyz' }), { error: 'geçersiz commit' });
    assert.deepEqual(await git.handle({ type: 'diff', root: repo.root, path: '../x' }), { error: 'depo dışında' });
    const call = g.calls.find((c) => c.args[0] === 'diff' && c.args.includes('--cached') && c.args.includes('-U1000000'));
    assert.deepEqual(call.args, ['diff', '--cached', '--no-color', '--no-ext-diff', '-U1000000', '--', 'a.js']);
  });
  await withRepo({}, async (git, repo) => {
    fs.writeFileSync(path.join(repo.dir, 'u.txt'), 'one\ntwo\n');
    const r = await git.handle({ type: 'diff', root: repo.root, path: 'u.txt' });
    assert.deepEqual(r, { abs: `${repo.root}/u.txt`, diff: '@@ -0,0 +1,2 @@\n+one\n+two\n', untracked: true });
    fs.writeFileSync(path.join(repo.dir, 'nonl.txt'), 'x');
    assert.equal((await git.handle({ type: 'diff', root: repo.root, path: 'nonl.txt' })).diff, '@@ -0,0 +1,1 @@\n+x\n');
    fs.writeFileSync(path.join(repo.dir, 'bin'), Buffer.from([1, 0, 2]));
    assert.equal((await git.handle({ type: 'diff', root: repo.root, path: 'bin' })).note, 'ikili dosya');
    fs.writeFileSync(path.join(repo.dir, 'big'), Buffer.alloc((2 << 20) + 1, 97));
    assert.equal((await git.handle({ type: 'diff', root: repo.root, path: 'big' })).note, 'dosya gösterilemeyecek kadar büyük');
    fs.writeFileSync(path.join(repo.dir, 'edge'), Buffer.alloc(2 << 20, 97));
    assert.equal((await git.handle({ type: 'diff', root: repo.root, path: 'edge' })).untracked, true, 'exactly 2 MB is shown');
    assert.deepEqual(await git.handle({ type: 'diff', root: repo.root, path: 'deleted.txt' }), { abs: `${repo.root}/deleted.txt`, note: 'silindi' });
    fs.writeFileSync(path.join(repo.dir, 'zero'), '');
    assert.equal((await git.handle({ type: 'diff', root: repo.root, path: 'zero' })).diff, '@@ -0,0 +1,0 @@\n\n', 'an empty new file');
  });
  await withRepo({ 'diff --no-color': { status: 1 } }, async (git, repo) => {
    assert.deepEqual(await git.handle({ type: 'diff', root: repo.root, path: 'nothing' }), { abs: `${repo.root}/nothing`, note: 'fark yok' });
  });
});

test('inside(): what the page may point at', { skip: !WIN }, async () => {
  await withRepo({ 'diff --no-color': { status: 0, out: 'D' } }, async (git, repo) => {
    const ok = async (p) => (await git.handle({ type: 'diff', root: repo.root, path: p })).abs;
    assert.equal(await ok('a/b.js'), `${repo.root}/a/b.js`);
    assert.equal(await ok('a\\b.js'), `${repo.root}/a/b.js`);
    assert.equal(await ok('./a//b.js'), `${repo.root}/a/b.js`);
    assert.equal(await ok('a/../b.js'), `${repo.root}/b.js`);
    for (const bad of ['', '.', '..', '../a', 'a/../../b', '/etc', '\\x', 'C:\\x', 'a:b', 'a\0b', 'dir./x', 'x ', 5]) {
      assert.deepEqual(await git.handle({ type: 'diff', root: repo.root, path: bad }), { error: 'depo dışında' }, JSON.stringify(bad));
    }
  });
});

test('log: auto refs (branch, upstream, base), all, commit parsing, n clamped', async () => {
  const commits = ['h1\x1fp1 p2\x1fAnn\x1fa@x\x1f2026-01-01\x1fSubj\x1fHEAD -> refs/heads/main, refs/remotes/origin/main', 'h2\x1f\x1fBob\x1fb@x\x1f2026\x1fFirst\x1f', 'short\x1fline'].join('\n');
  const answers = {
    'rev-parse HEAD': { status: 0, out: 'h1\n' },
    'symbolic-ref -q HEAD': { status: 0, out: 'refs/heads/main\n' },
    'symbolic-ref -q refs/remotes/origin/HEAD': { status: 0, out: 'refs/remotes/origin/dev\n' },
    'rev-parse --symbolic-full-name @{u}': { status: 0, out: 'refs/remotes/origin/main\n' },
    'config --get branch.main.vscode-merge-base': { status: 1 },
    'rev-parse refs/remotes/origin/main': { status: 0, out: 'u1\n' },
    'rev-parse refs/remotes/origin/dev': { status: 0, out: 'b1\n' },
    'merge-base HEAD u1': { status: 0, out: 'm1\n' },
    'log --topo-order': { status: 0, out: commits },
  };
  await withRepo(answers, async (git, repo, g) => {
    const r = await git.handle({ type: 'log', root: repo.root, n: 5000 });
    assert.deepEqual(r.commits, [
      { hash: 'h1', parents: ['p1', 'p2'], author: 'Ann', email: 'a@x', date: '2026-01-01', subject: 'Subj', refs: ['HEAD -> refs/heads/main', 'refs/remotes/origin/main'] },
      { hash: 'h2', parents: [], author: 'Bob', email: 'b@x', date: '2026', subject: 'First', refs: [] },
    ]);
    assert.deepEqual({ ...r, commits: undefined }, { commits: undefined, head: 'h1', branch: 'refs/heads/main', upstream: 'refs/remotes/origin/main', upstreamRev: 'u1', mergeBase: 'm1', base: 'refs/remotes/origin/dev', baseRev: 'b1' });
    const logCall = g.calls.filter((c) => c.args[0] === 'log').at(-1);
    assert.ok(logCall.args.includes('-n1000'));
    assert.deepEqual(logCall.args.slice(-3), ['HEAD', 'refs/remotes/origin/main', 'refs/remotes/origin/dev']);
    await git.handle({ type: 'log', root: repo.root, n: 0, all: true });
    const all = g.calls.filter((c) => c.args[0] === 'log').at(-1);
    assert.ok(all.args.includes('-n1'));
    assert.equal(all.args.at(-1), '--all');
    await git.handle({ type: 'log', root: repo.root, n: 2.5 });
    assert.ok(g.calls.filter((c) => c.args[0] === 'log').at(-1).args.includes('-n50'));
  });
});

test('log: a noted base wins; a base that is the branch or upstream is none; no HEAD -> no log', async () => {
  await withRepo({
    'rev-parse HEAD': { status: 0, out: 'h\n' },
    'symbolic-ref -q HEAD': { status: 0, out: 'refs/heads/f\n' },
    'symbolic-ref -q refs/remotes/origin/HEAD': { status: 1 },
    'rev-parse --symbolic-full-name @{u}': { status: 1 },
    'config --get branch.f.vscode-merge-base': { status: 0, out: 'origin/main\n' },
    'rev-parse --symbolic-full-name origin/main': { status: 0, out: 'refs/remotes/origin/main\n' },
    'rev-parse refs/remotes/origin/main': { status: 0, out: 'bm\n' },
  }, async (git, repo) => {
    const r = await git.handle({ type: 'log', root: repo.root });
    assert.equal(r.base, 'refs/remotes/origin/main');
    assert.equal(r.baseRev, 'bm');
    assert.equal(r.upstream, null);
    assert.equal(r.mergeBase, null);
  });
  await withRepo({
    'rev-parse HEAD': { status: 0, out: 'h\n' },
    'symbolic-ref -q HEAD': { status: 0, out: 'refs/heads/main\n' },
    'symbolic-ref -q refs/remotes/origin/HEAD': { status: 0, out: 'refs/heads/main\n' },
    'rev-parse --symbolic-full-name @{u}': { status: 1 },
    'config --get': { status: 1 },
  }, async (git, repo, g) => {
    const r = await git.handle({ type: 'log', root: repo.root });
    assert.equal(r.base, null);
    assert.deepEqual(g.calls.filter((c) => c.args[0] === 'log').at(-1).args.slice(-1), ['HEAD']);
  });
  await withRepo({ 'rev-parse HEAD': { status: 128 }, 'symbolic-ref': { status: 1 } }, async (git, repo, g) => {
    const r = await git.handle({ type: 'log', root: repo.root });
    assert.deepEqual(r.commits, []);
    assert.equal(r.head, null);
    assert.equal(r.branch, null);
    assert.equal(g.calls.some((c) => c.args[0] === 'log'), false);
  });
});

test('show: commit details and files with counts; bad hash; unknown commit', async () => {
  await withRepo({
    'show -s': (args) => (args.at(-1) === 'abcdef1' ? { status: 0, out: 'abcdef1\x1fp\x1fAnn\x1fa@x\x1fD\x1fTitle\n\nBody\x1fmore\n' } : args.at(-1) === 'bbbbbbb' ? { status: 0, out: 'a\x1fb' } : { status: 128 }),
    'show --first-parent -m --name-status': { status: 0, out: 'M\tsrc/a.js\nR100\told.js\tnew.js\n\tjunk\nX\n' },
    'show --first-parent -m --numstat': { status: 0, out: '1\t2\tsrc/a.js\n' },
  }, async (git, repo) => {
    const r = await git.handle({ type: 'show', root: repo.root, hash: 'abcdef1' });
    assert.deepEqual(r, {
      hash: 'abcdef1', parents: ['p'], author: 'Ann', email: 'a@x', date: 'D', message: 'Title\n\nBody\x1fmore',
      files: [{ status: 'M', path: 'src/a.js', add: 1, del: 2 }, { status: 'R', path: 'new.js', add: null, del: null }],
    });
    assert.deepEqual(await git.handle({ type: 'show', root: repo.root, hash: 'ABCDEF1' }), { error: 'bilinmeyen commit' });
    assert.deepEqual(await git.handle({ type: 'show', root: repo.root, hash: 'abc' }), { error: 'bilinmeyen commit' });
    assert.deepEqual(await git.handle({ type: 'show', root: repo.root, hash: 'a'.repeat(41) }), { error: 'bilinmeyen commit' });
    assert.deepEqual(await git.handle({ type: 'show', root: repo.root, hash: 'ccccccc' }), { error: 'böyle bir commit yok' });
    assert.deepEqual(await git.handle({ type: 'show', root: repo.root, hash: 'bbbbbbb' }), { error: 'böyle bir commit yok' });
  });
});

test('blame: porcelain read; bad line, bad commit, nothing found', async () => {
  const porcelain = 'abc123 1 1 1\r\nauthor Ann\r\nauthor-mail <a@x>\r\nauthor-time 1700000000\r\nsummary Fix it\r\n\tcode\n';
  await withRepo({
    blame: (args) => (args.includes('-L') && args[args.indexOf('-L') + 1] === '3,3' ? { status: 0, out: porcelain } : { status: 0, out: 'only-hash\n' }),
    'config user.name': { status: 0, out: 'Ann\n' },
  }, async (git, repo, g) => {
    assert.deepEqual(await git.handle({ type: 'blame', root: repo.root, path: 'a.js', line: 3.9 }),
      { hash: 'abc123', author: 'Ann', mail: '<a@x>', time: 1700000000, summary: 'Fix it', me: 'Ann' });
    await git.handle({ type: 'blame', root: repo.root, path: 'a.js', line: 3, commit: 'abcdef0' });
    assert.deepEqual(g.calls.filter((c) => c.args[0] === 'blame').at(-1).args, ['blame', '--porcelain', '-L', '3,3', 'abcdef0', '--', 'a.js']);
    assert.deepEqual(await git.handle({ type: 'blame', root: repo.root, path: 'a.js', line: 0 }), { error: 'geçersiz satır' });
    assert.deepEqual(await git.handle({ type: 'blame', root: repo.root, path: 'a.js', line: 'x' }), { error: 'geçersiz satır' });
    assert.deepEqual(await git.handle({ type: 'blame', root: repo.root, path: '../a', line: 1 }), { error: 'geçersiz satır' });
    assert.deepEqual(await git.handle({ type: 'blame', root: repo.root, path: 'a.js', line: 1, commit: 'nothex!' }), { error: 'geçersiz commit' });
    assert.deepEqual(await git.handle({ type: 'blame', root: repo.root, path: 'a.js', line: 2 }), { error: 'satır bilgisi yok' });
  });
  await withRepo({ blame: { status: 0, out: 'h 1 1\nauthor B\nauthor-time x\n' }, 'config user.name': { status: 1 } }, async (git, repo) => {
    const r = await git.handle({ type: 'blame', root: repo.root, path: 'a', line: 1 });
    assert.deepEqual(r, { hash: 'h', author: 'B', time: 0, me: '' });
  });
});

test('stage / unstage / push / pull / fetch / publish: the right git commands; errors', async () => {
  await withRepo({}, async (git, repo, g) => {
    const last = () => g.calls.at(-1).args;
    assert.deepEqual(await git.handle({ type: 'stage', root: repo.root, paths: ['a', '../x'] }), { ok: true });
    assert.deepEqual(last(), ['add', '-A', '--', 'a']);
    assert.deepEqual(await git.handle({ type: 'stage', root: repo.root, paths: ['../x'] }), { error: 'hazırlanacak değişiklik yok' });
    assert.deepEqual(await git.handle({ type: 'stage', root: repo.root, paths: ['a', 5] }), { error: 'hazırlanacak değişiklik yok' }, 'a list with a non-string is none');
    assert.deepEqual(await git.handle({ type: 'unstage', root: repo.root, paths: ['a'] }), { ok: true });
    assert.deepEqual(last(), ['restore', '--staged', '--', 'a']);
    assert.deepEqual(await git.handle({ type: 'unstage', root: repo.root }), { error: 'geri alınacak hazırlık yok' });
    await git.handle({ type: 'push', root: repo.root });
    assert.deepEqual(last(), ['push']);
    await git.handle({ type: 'pull', root: repo.root });
    assert.deepEqual(last(), ['pull', '--ff-only']);
    await git.handle({ type: 'fetch', root: repo.root });
    assert.deepEqual(last(), ['fetch']);
    await git.handle({ type: 'publish', root: repo.root });
    assert.deepEqual(last(), ['push', '-u', 'origin', 'HEAD']);
    assert.deepEqual(await git.handle({ type: 'weird', root: repo.root }), { error: 'bilinmeyen istek' });
  });
});

test('change errors: fatal/error line, last lines, nothing said, not started', async () => {
  const cases = [
    [{ status: 1, err: 'hint: x\nfatal: not a repo\n' }, { error: 'not a repo' }],
    [{ status: 1, err: 'error: bad thing\nfatal: later\n' }, { error: 'bad thing' }],
    [{ status: 1, out: 'a\nb\nc\nnothing to commit\n' }, { error: 'b c nothing to commit' }],
    [{ status: 1 }, { error: 'git başarısız oldu' }],
    ['nostart', { error: 'git başlatılamadı' }],
    ['throw', { error: 'git başlatılamadı' }],
  ];
  for (const [answer, want] of cases) {
    await withRepo({ push: answer }, async (git, repo) => {
      assert.deepEqual(await git.handle({ type: 'push', root: repo.root }), want, JSON.stringify(answer));
    });
  }
});

test('commit: message required; all adds first; push after; failures stop', async () => {
  await withRepo({}, async (git, repo, g) => {
    assert.deepEqual(await git.handle({ type: 'commit', root: repo.root, message: '   ' }), { error: 'bir commit mesajı yazın' });
    assert.deepEqual(await git.handle({ type: 'commit', root: repo.root, message: ' hi ', all: true, push: true }), { ok: true });
    const seq = g.calls.slice(-3).map((c) => c.args.join(' '));
    assert.deepEqual(seq, ['add -A', 'commit -m hi', 'push']);
  });
  await withRepo({ 'add -A': { status: 1, err: 'fatal: nope' } }, async (git, repo, g) => {
    assert.deepEqual(await git.handle({ type: 'commit', root: repo.root, message: 'm', all: true }), { error: 'nope' });
    assert.equal(g.calls.some((c) => c.args[0] === 'commit'), false);
  });
  await withRepo({ commit: { status: 1, err: 'error: hook failed' } }, async (git, repo, g) => {
    assert.deepEqual(await git.handle({ type: 'commit', root: repo.root, message: 'm', push: true }), { error: 'hook failed' });
    assert.equal(g.calls.some((c) => c.args[0] === 'push'), false);
  });
});

test('discard: tracked restored, untracked to the trash, failures stop', async () => {
  const trashed = [];
  await withRepo({
    'status --porcelain=v1 -z --untracked-files=all --': { status: 0, out: '?? new.txt\0 M old.txt\0' },
  }, async (git, repo, g) => {
    assert.deepEqual(await git.handle({ type: 'discard', root: repo.root, paths: [] }), { error: 'atılacak değişiklik yok' });
    assert.deepEqual(await git.handle({ type: 'discard', root: repo.root, paths: ['old.txt', 'new.txt'] }), { ok: true });
    assert.deepEqual(g.calls.find((c) => c.args[0] === 'restore').args, ['restore', '--', 'old.txt']);
    assert.deepEqual(trashed, [path.resolve(`${repo.root}/new.txt`)]);
    // only new ones: no restore
    const n = g.calls.filter((c) => c.args[0] === 'restore').length;
    assert.deepEqual(await git.handle({ type: 'discard', root: repo.root, paths: ['new.txt'] }), { ok: true });
    assert.equal(g.calls.filter((c) => c.args[0] === 'restore').length, n);
  }, { trash: async (p) => { trashed.push(p); if (trashed.length > 1) throw new Error('trash failed'); } });
  await withRepo({
    'status --porcelain=v1 -z --untracked-files=all --': { status: 128 },
    restore: { status: 1, err: 'error: nope' },
  }, async (git, repo) => {
    assert.deepEqual(await git.handle({ type: 'discard', root: repo.root, paths: ['a'] }), { error: 'nope' });
  });
  // the default trash throws, which is swallowed
  await withRepo({ 'status --porcelain=v1 -z --untracked-files=all --': { status: 0, out: '?? n\0' } }, async (git, repo) => {
    assert.deepEqual(await git.handle({ type: 'discard', root: repo.root, paths: ['n'] }), { ok: true });
  });
});

test('long path lists go in batches under the command line limit', async () => {
  await withRepo({}, async (git, repo, g) => {
    const paths = Array.from({ length: 300 }, (_, i) => `dir/${'x'.repeat(200)}-${i}`);
    assert.deepEqual(await git.handle({ type: 'stage', root: repo.root, paths }), { ok: true });
    const adds = g.calls.filter((c) => c.args[0] === 'add');
    assert.ok(adds.length >= 2);
    assert.deepEqual(adds.flatMap((c) => c.args.slice(3)), paths);
    for (const c of adds) assert.ok(c.args.slice(3).reduce((n, p) => n + p.length + 3, 0) <= 30000 - repo.root.length);
  });
  await withRepo({ add: (args) => (args.includes('dir/y-150') ? { status: 1, err: 'fatal: stop' } : { status: 0 }) }, async (git, repo, g) => {
    const paths = Array.from({ length: 300 }, (_, i) => `dir/y-${i}${'z'.repeat(200)}`).map((p, i) => (i === 150 ? 'dir/y-150' : p));
    assert.deepEqual(await git.handle({ type: 'stage', root: repo.root, paths }), { error: 'stop' });
    const after = g.calls.filter((c) => c.args[0] === 'add');
    assert.equal(after.at(-1).args.includes('dir/y-150'), true, 'stopped at the failing batch');
  });
});

test('exec: a hung git is stopped at its timeout; output past max is dropped; pipes held open', async (t) => {
  await withRepo({ push: 'hang' }, async (git, repo) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const p = git.handle({ type: 'push', root: repo.root });
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
    t.mock.timers.tick(60000);
    t.mock.timers.reset();
    assert.deepEqual(await p, { error: 'git başarısız oldu' });
  });
  await withRepo({ 'diff --no-color': { status: 0, chunks: ['a'.repeat(20 << 20), 'b'.repeat(13 << 20)] } }, async (git, repo) => {
    // past 32 MB: stopped, so no diff (and the file isn't there either)
    assert.deepEqual(await git.handle({ type: 'diff', root: repo.root, path: 'x' }), { abs: `${repo.root}/x`, note: 'fark yok' });
  });
  await withRepo({ fetch: { status: 0, noClose: true } }, async (git, repo) => {
    // exit without close: done after a moment anyway
    assert.deepEqual(await git.handle({ type: 'fetch', root: repo.root }), { ok: true });
  });
});

test('confirm: buttons + Cancel, destructive by default, answers checked', async () => {
  const g = load(() => ({ status: 0 }), { ATALAY_GIT: GIT_EXE });
  try {
    let asked = null;
    let reply = 1;
    const git = g.createGit({ confirm: async (o) => { asked = o; if (reply === 'throw') throw new Error('x'); return reply; } });
    assert.equal(await git.handle({ type: 'confirm', message: 'Sure?', detail: 'D', buttons: ['A', 'B'] }), 1);
    assert.deepEqual(asked, { type: 'warning', message: 'Sure?', detail: 'D', buttons: ['A', 'B', 'Vazgeç'], defaultId: 0, cancelId: 2, noLink: true, destructive: true });
    await git.handle({ type: 'confirm', buttons: ['A'], destructive: false, message: 5 });
    assert.equal(asked.destructive, false);
    assert.equal(asked.message, '');
    for (const [r, want] of [[2, -1], [-1, -1], [0, 0], [{ response: 1 }, 1], [{ response: 5 }, -1], ['1', -1], [1.5, -1], ['throw', -1], [null, -1]]) {
      reply = r;
      assert.equal(await git.handle({ type: 'confirm', buttons: ['A', 'B'] }), want, JSON.stringify(r));
    }
    assert.deepEqual((await git.handle({ type: 'confirm', buttons: ['A', 1] }), asked.buttons), ['Vazgeç']);
    // the default confirm answers -1
    assert.equal(await g.createGit().handle({ type: 'confirm', buttons: ['A'] }), -1);
  } finally { g.restore(); }
});

test('menu: items with separators, position rounded, answer checked', async () => {
  const g = load(() => ({ status: 0 }), { ATALAY_GIT: GIT_EXE });
  try {
    let got = null, reply = 2;
    const git = g.createGit({ menu: async (items, at) => { got = { items, at }; if (reply === 'throw') throw new Error('x'); return reply; } });
    assert.equal(await git.handle({ type: 'menu', items: ['Open', '', 'Copy'], x: 10.6, y: 'x' }), 2);
    assert.deepEqual(got, { items: [{ id: 0, title: 'Open' }, { type: 'separator' }, { id: 2, title: 'Copy' }], at: { x: 11, y: 0 } });
    for (const [r, want] of [['0', 0], ['2', 2], [1, -1], [3, -1], [-1, -1], ['x', -1], [null, -1], ['throw', -1], [Infinity, -1]]) {
      reply = r;
      assert.equal(await git.handle({ type: 'menu', items: ['Open', '', 'Copy'], x: Infinity }), want, String(r));
    }
    assert.equal(got.at.x, 0);
    assert.equal(await g.createGit().handle({ type: 'menu', items: ['a'] }), -1);
  } finally { g.restore(); }
});

test('handle: an exception becomes { error }', async () => {
  const repo = mkRepo();
  const g = load(router(repo), { ATALAY_GIT: GIT_EXE });
  try {
    const git = g.createGit({ folders: () => [repo.dir] });
    await git.handle({ type: 'repos' });
    const orig = fs.promises.lstat;
    fs.promises.lstat = () => { throw new Error('boom'); };
    try {
      assert.deepEqual(await git.handle({ type: 'diff', root: repo.root, path: 'q' }), { error: 'boom' });
    } finally {
      fs.promises.lstat = orig;
    }
  } finally { g.restore(); }
});
