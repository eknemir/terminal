'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const realCp = require('child_process');
const { requireWith } = require('../helpers/electron');

const GUARD = `sh -c 'command -v rtk >/dev/null 2>&1 && exec rtk hook claude; cat >/dev/null' terminal-app-rtk`;
const CODEX_GUARD = 'where /q rtk && rtk hook codex || more >nul';

// A pretend rtk: what each `rtk …` prints and does to the tools' settings, as the real one does.
function fakeRtk(env) {
  const calls = [];
  const cp = {
    ...realCp,
    execFile(bin, args, opts, cb) {
      calls.push({ bin, args });
      const out = (() => {
        if (args[0] === '--version') return env.versions[bin] != null ? `rtk ${env.versions[bin]}\n` : '';
        if (args[0] === 'gain') return env.gain != null ? env.gain : '';
        if (args[0] === 'init') {
          const sf = path.join(env.claudeDir, 'settings.json');
          const cf = path.join(env.codexDir, 'hooks.json');
          const j = fs.existsSync(sf) ? JSON.parse(fs.readFileSync(sf, 'utf8')) : {};
          if (args.includes('--codex')) {
            const c = fs.existsSync(cf) ? JSON.parse(fs.readFileSync(cf, 'utf8')) : {};
            if (args.includes('--uninstall')) delete c.hooks;
            else c.hooks = { PreToolUse: [{ hooks: [{ type: 'command', command: 'rtk hook codex' }] }] };
            fs.writeFileSync(cf, JSON.stringify(c));
          } else if (args.includes('--uninstall')) {
            if (j.hooks && j.hooks.PreToolUse) {
              j.hooks.PreToolUse = j.hooks.PreToolUse.filter((e) => !e.hooks.some((h) => h.command === 'rtk hook claude'));
              if (!j.hooks.PreToolUse.length) delete j.hooks.PreToolUse;
              if (!Object.keys(j.hooks).length) delete j.hooks;
            }
            fs.writeFileSync(sf, JSON.stringify(j));
          } else {
            j.hooks = j.hooks || {};
            j.hooks.PreToolUse = [...(j.hooks.PreToolUse || []), { matcher: 'Bash', hooks: [{ type: 'command', command: 'rtk hook claude' }] }];
            fs.writeFileSync(sf, JSON.stringify(j));
          }
          return 'ok';
        }
        return '';
      })();
      setImmediate(() => (env.fail && env.fail(args) ? cb(new Error('x'), '') : cb(null, out)));
    },
  };
  return { cp, calls };
}

function setup({ codex = true, rtk = true, caveman = true, usable = true, whichRtk = null, init = {} } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'atl-sav-'));
  const env = { claudeDir: path.join(root, '.claude'), codexDir: path.join(root, '.codex'), versions: {}, gain: null };
  fs.mkdirSync(env.claudeDir);
  if (codex) fs.mkdirSync(env.codexDir);
  const ship = path.join(root, 'ship');
  fs.mkdirSync(path.join(ship, 'caveman'), { recursive: true });
  const bundled = { rtk: path.join(ship, 'rtk.exe'), caveman: path.join(ship, 'caveman') };
  if (rtk) {
    fs.writeFileSync(bundled.rtk, 'RTK-NEW');
    fs.writeFileSync(path.join(ship, 'rtk-LICENSE'), 'L');
  }
  if (caveman) {
    fs.writeFileSync(path.join(bundled.caveman, 'rules.md'), '  Be terse.  \n');
    fs.writeFileSync(path.join(bundled.caveman, 'remind.json'), '{}');
    fs.writeFileSync(path.join(bundled.caveman, 'LICENSE'), 'MIT');
  }
  // the app's folder is %LOCALAPPDATA%\terminal-app: its caveman hooks are known by that name in their path
  const ownDir = path.join(root, 'terminal-app');
  const m = { ...init };
  const settings = { get: (k) => m[k], set: (k, v) => { m[k] = JSON.parse(JSON.stringify(v)); } };
  const { cp, calls } = fakeRtk(env);
  const { createSavers } = requireWith('windows/src/savers.js', { child_process: cp });
  const ourRtk = path.join(ownDir, 'bin', 'rtk.exe');
  const s = createSavers({ settings, ownDir, bundled, claudeDir: env.claudeDir, codexDir: env.codexDir, which: () => (whichRtk === 'OWN' ? ourRtk : whichRtk), usable });
  const sf = path.join(env.claudeDir, 'settings.json');
  return {
    s, m, env, calls, root, bundled, ownDir, sf,
    ourRtk: path.join(ownDir, 'bin', 'rtk.exe'),
    ourCaveman: path.join(ownDir, 'caveman'),
    codexHooks: path.join(env.codexDir, 'hooks.json'),
    agents: path.join(env.codexDir, 'AGENTS.md'),
    read: (f = sf) => JSON.parse(fs.readFileSync(f, 'utf8')),
    write: (v, f = sf) => fs.writeFileSync(f, typeof v === 'string' ? v : JSON.stringify(v)),
  };
}
const commands = (j) => Object.values(j.hooks || {}).flatMap((l) => l.flatMap((e) => e.hooks.map((h) => h.command)));
const quiet = async (fn) => {
  const orig = console.error;
  const errs = [];
  console.error = (...a) => errs.push(a.join(' '));
  try { await fn(); } finally { console.error = orig; }
  return errs;
};

test('binDir and known()', () => {
  const t = setup();
  assert.equal(t.s.binDir, path.join(t.ownDir, 'bin'));
  assert.equal(t.s.known('rtk'), true);
  assert.equal(t.s.known('caveman'), true);
  assert.equal(t.s.known('other'), false);
});

test('state: nothing set up, available from what ships', async () => {
  const t = setup();
  assert.deepEqual(await t.s.state(), { rtk: { available: true, on: false }, caveman: { available: true, on: false } });
  const u = setup({ usable: false });
  assert.deepEqual(await u.s.state(), { rtk: { available: false, on: false }, caveman: { available: false, on: false } });
  const n = setup({ rtk: false, caveman: false });
  assert.deepEqual(await n.s.state(), { rtk: { available: false, on: false }, caveman: { available: false, on: false } });
});

test('autoStart: installs both, rtk hooks guarded, caveman hooks and Codex notes', async () => {
  const t = setup();
  await t.s.autoStart();
  // rtk placed with its licence
  assert.equal(fs.readFileSync(t.ourRtk, 'utf8'), 'RTK-NEW');
  assert.equal(fs.readFileSync(path.join(t.ownDir, 'bin', 'rtk-LICENSE'), 'utf8'), 'L');
  assert.deepEqual(t.calls.map((c) => c.args.join(' ')), ['init -g --auto-patch', 'init -g --codex']);
  assert.equal(t.calls[0].bin, t.ourRtk);
  const j = t.read();
  const cmds = commands(j);
  assert.ok(cmds.includes(GUARD));
  assert.ok(!cmds.includes('rtk hook claude'));
  assert.equal(j.hooks.PreToolUse[0].matcher, 'Bash');
  const cav = t.ourCaveman.replace(/\\/g, '/');
  assert.deepEqual(j.hooks.SessionStart, [{ hooks: [{ type: 'command', command: `cat '${cav}/rules.md'`, timeout: 5 }] }]);
  assert.deepEqual(j.hooks.UserPromptSubmit, [{ hooks: [{ type: 'command', command: `cat '${cav}/remind.json'`, timeout: 5 }] }]);
  for (const f of ['rules.md', 'remind.json', 'LICENSE']) assert.ok(fs.existsSync(path.join(t.ourCaveman, f)));
  assert.equal(t.read(t.codexHooks).hooks.PreToolUse[0].hooks[0].commandWindows, CODEX_GUARD);
  assert.equal(fs.readFileSync(t.agents, 'utf8'), '\n<!-- terminal-app: caveman -->\nBe terse.\n<!-- /terminal-app: caveman -->\n');
  assert.deepEqual(t.m.tokenSaversState, { rtk: { on: true }, caveman: { on: true } });
  const st = await t.s.state();
  assert.equal(st.rtk.on, true);
  assert.equal(st.caveman.on, true);
  // again: nothing new
  t.calls.length = 0;
  await t.s.autoStart();
  assert.deepEqual(t.calls, []);
});

test('state: rtk gain read from the app\'s rtk; junk gain ignored', async () => {
  const t = setup();
  await t.s.autoStart();
  t.env.gain = JSON.stringify({ summary: { total_saved: 1234, avg_savings_pct: 61.5, total_commands: 9 } });
  assert.deepEqual((await t.s.state()).rtk, { available: true, on: true, saved: 1234, pct: 61.5, commands: 9 });
  t.env.gain = 'not json';
  assert.deepEqual((await t.s.state()).rtk, { available: true, on: true });
  t.env.gain = '{}';
  assert.deepEqual((await t.s.state()).rtk, { available: true, on: true });
  // our hook there but our binary gone: no gain asked
  fs.rmSync(t.ourRtk);
  t.calls.length = 0;
  assert.deepEqual((await t.s.state()).rtk, { available: true, on: true });
  assert.equal(t.calls.length, 0);
});

test('autoStart: a saver turned off before stays off (old key and new record)', async () => {
  const t = setup({ init: { tokenSavers: false, tokenSaverCaveman: false } });
  await t.s.autoStart();
  assert.equal(fs.existsSync(t.sf), false);
  const u = setup({ init: { tokenSaversState: { rtk: { on: false } }, tokenSavers: true } });
  await u.s.autoStart();
  assert.deepEqual(commands(u.read()).length, 2, 'only caveman');
  // not available: skipped
  const v = setup({ usable: false });
  await v.s.autoStart();
  assert.equal(fs.existsSync(v.sf), false);
});

test('set off: the app\'s own go (rtk uninstall, caveman hooks, notes, folder); on again', async () => {
  const t = setup();
  t.write({ keep: 1, hooks: { Stop: [{ hooks: [{ type: 'command', command: 'echo hi' }] }] } });
  fs.writeFileSync(t.agents, '# mine\n');
  await t.s.autoStart();
  assert.equal(fs.readFileSync(t.agents, 'utf8'), '# mine\n\n<!-- terminal-app: caveman -->\nBe terse.\n<!-- /terminal-app: caveman -->\n');
  t.calls.length = 0;
  await t.s.set('rtk', false);
  assert.deepEqual(t.calls.map((c) => c.args.join(' ')), ['init -g --uninstall', 'init -g --codex --uninstall']);
  await t.s.set('caveman', false);
  const j = t.read();
  assert.deepEqual(j, { keep: 1, hooks: { Stop: [{ hooks: [{ type: 'command', command: 'echo hi' }] }] } });
  assert.equal(fs.readFileSync(t.agents, 'utf8'), '# mine\n');
  assert.equal(fs.existsSync(t.ourCaveman), false);
  assert.deepEqual(t.m.tokenSaversState, { rtk: { on: false }, caveman: { on: false } });
  assert.deepEqual(await t.s.state(), { rtk: { available: true, on: false }, caveman: { available: true, on: false } });
  // a later launch keeps them off
  t.calls.length = 0;
  await t.s.autoStart();
  assert.deepEqual(t.calls, []);
  await t.s.set('caveman', true);
  assert.equal((await t.s.state()).caveman.on, true);
});

test('caveman off: a notes file that only held the app\'s notes goes', async () => {
  const t = setup({ rtk: false });
  await t.s.autoStart();
  assert.ok(fs.existsSync(t.agents));
  await t.s.set('caveman', false);
  assert.equal(fs.existsSync(t.agents), false);
  // no codex: no notes at all
  const u = setup({ rtk: false, codex: false });
  await u.s.autoStart();
  assert.equal(fs.existsSync(u.agents), false);
  assert.equal(commands(u.read()).length, 2);
});

test('rtk off when the app\'s rtk binary is gone: its hooks are taken out by hand', async () => {
  const t = setup();
  await t.s.autoStart();
  fs.rmSync(t.ourRtk);
  t.calls.length = 0;
  await t.s.set('rtk', false);
  assert.deepEqual(t.calls, []);
  assert.ok(!commands(t.read()).includes(GUARD));
  assert.equal(t.read(t.codexHooks).hooks, undefined);
});

test('rtk install with no codex folder skips codex; no bundled rtk does nothing', async () => {
  const t = setup({ codex: false, caveman: false });
  await t.s.set('rtk', true);
  assert.deepEqual(t.calls.map((c) => c.args.join(' ')), ['init -g --auto-patch']);
  const u = setup({ rtk: false, caveman: false });
  await u.s.set('rtk', true);
  assert.deepEqual(u.calls, []);
  assert.deepEqual(u.m.tokenSaversState.rtk, { on: true });
});

test('placeRtk: same file not copied again, stale .old- copies removed', async () => {
  const t = setup({ caveman: false });
  fs.mkdirSync(path.dirname(t.ourRtk), { recursive: true });
  fs.writeFileSync(t.ourRtk, 'RTK-NEW');
  const stale = path.join(path.dirname(t.ourRtk), 'rtk.exe.old-1');
  fs.writeFileSync(stale, '');
  const before = fs.statSync(t.ourRtk).mtimeMs;
  await t.s.set('rtk', true);
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(fs.existsSync(stale), false);
  assert.equal(fs.statSync(t.ourRtk).mtimeMs, before);
  // a different one is replaced
  const u = setup({ caveman: false });
  fs.mkdirSync(path.dirname(u.ourRtk), { recursive: true });
  fs.writeFileSync(u.ourRtk, 'OLD!!!!');
  await u.s.set('rtk', true);
  assert.equal(fs.readFileSync(u.ourRtk, 'utf8'), 'RTK-NEW');
});

test('the user\'s own rtk hook: on means theirs (kept current), off takes it out and on puts it back', async () => {
  const t = setup({ caveman: false });
  const theirBin = path.join(t.root, 'tools', 'rtk.exe');
  fs.mkdirSync(path.dirname(theirBin));
  fs.writeFileSync(theirBin, 'RTK-OLD');
  const hook = { type: 'command', command: `"${theirBin}" hook claude` };
  t.write({ hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [hook, { type: 'command', command: 'other' }] }] } });
  t.write({ hooks: { PreToolUse: [{ hooks: [{ type: 'command', command: 'rtk hook codex' }] }] } }, t.codexHooks);
  t.env.versions[theirBin] = '0.9.0';
  t.env.versions[t.bundled.rtk] = '1.1.0';
  t.env.gain = JSON.stringify({ summary: { total_saved: 5, avg_savings_pct: 1, total_commands: 2 } });
  assert.deepEqual((await t.s.state()).rtk, { available: true, on: true, saved: 5, pct: 1, commands: 2 });
  assert.equal(t.calls.find((c) => c.args[0] === 'gain').bin, theirBin);
  await t.s.autoStart();
  assert.equal(fs.readFileSync(theirBin, 'utf8'), 'RTK-NEW', 'older: replaced where it lies');
  assert.equal(fs.existsSync(t.ourRtk), false, 'the app\'s own is not installed beside it');
  await t.s.set('rtk', false);
  const j = t.read();
  assert.deepEqual(j.hooks.PreToolUse, [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'other' }] }]);
  assert.equal(t.read(t.codexHooks).hooks, undefined);
  const kept = t.m.tokenSaversState.rtk.kept;
  assert.equal(kept.hooks.length, 2);
  assert.deepEqual(kept.hooks[0], { file: t.sf, event: 'PreToolUse', matcher: 'Bash', hook });
  assert.equal(kept.hooks[1].matcher, null);
  assert.equal((await t.s.state()).rtk.on, false);
  assert.equal((await t.s.state()).rtk.available, true);
  // on: put back as it was
  await t.s.set('rtk', true);
  assert.ok(commands(t.read()).includes(hook.command));
  assert.deepEqual(t.read(t.codexHooks).hooks.PreToolUse.at(-1), { hooks: [{ type: 'command', command: 'rtk hook codex' }] });
  assert.equal(t.m.tokenSaversState.rtk.kept, undefined);
});

test('putBack: not twice when the user set it up again meanwhile; unreadable file skipped; bad records skipped', async () => {
  const t = setup({ caveman: false });
  t.write({ hooks: { PreToolUse: [{ hooks: [{ type: 'command', command: 'rtk hook claude' }] }] } });
  await t.s.set('rtk', false);
  t.write({ hooks: { PreToolUse: [{ hooks: [{ type: 'command', command: 'rtk hook claude' }] }] } });
  t.m.tokenSaversState.rtk.kept.hooks.push(null, { file: t.sf }, { file: path.join(t.root, 'bad.json'), event: 'X', hook: { command: 'x' } });
  fs.writeFileSync(path.join(t.root, 'bad.json'), '{bad');
  await t.s.set('rtk', true);
  assert.equal(commands(t.read()).filter((c) => c === 'rtk hook claude').length, 1);
  assert.equal(fs.readFileSync(path.join(t.root, 'bad.json'), 'utf8'), '{bad');
});

test('isRtkHook: forms of the user\'s rtk hook', async () => {
  for (const [cmd, theirs] of [
    ['rtk hook claude', true],
    ['RTK.EXE hook claude', true],
    ['C:\\x\\rtk.exe hook', true],
    ['"C:/Program Files/rtk/rtk" hook claude', true],
    ['bash ~/.claude/hooks/rtk-rewrite.sh', true],
    ['rtk gain', false],
    ['rtkx hook', false],
    ['rtk', false],
    [GUARD, false],
  ]) {
    const t = setup({ caveman: false, rtk: false });
    t.write({ hooks: { PreToolUse: [{ hooks: [{ type: 'command', command: cmd }] }] } });
    assert.equal((await t.s.state()).rtk.available, theirs, cmd);
  }
  // codex's guarded hook is the app's
  const t = setup({ caveman: false, rtk: false });
  t.write({ hooks: { PreToolUse: [{ hooks: [{ type: 'command', command: 'rtk hook claude', commandWindows: CODEX_GUARD }] }] } });
  assert.equal((await t.s.state()).rtk.on, false);
});

test('keepCurrent: package managers, the app\'s own, other names, same or newer version, no version', async () => {
  const cases = [
    ['WinGet', '0.1', false],
    ['scoop', '0.1', false],
    ['plain', '1.1.0', false],
    ['plain', '2.0', false],
    ['plain', null, false],
    ['plain', '1.0.9', true],
    ['plain', '1.1', false],
  ];
  for (const [dir, ver, replaced] of cases) {
    const t = setup({ caveman: false });
    const bin = path.join(t.root, dir, 'rtk.exe');
    fs.mkdirSync(path.dirname(bin), { recursive: true });
    fs.writeFileSync(bin, 'OLD');
    t.env.versions[bin] = ver;
    t.env.versions[t.bundled.rtk] = '1.1.0';
    t.write({ hooks: { PreToolUse: [{ hooks: [{ type: 'command', command: `${bin} hook claude` }] }] } });
    await t.s.set('rtk', true);
    assert.equal(fs.readFileSync(bin, 'utf8'), replaced ? 'RTK-NEW' : 'OLD', `${dir} ${ver}`);
  }
  // a bare `rtk` hook: the one on PATH (which), named something else is skipped
  const t = setup({ caveman: false, whichRtk: null });
  t.write({ hooks: { PreToolUse: [{ hooks: [{ type: 'command', command: 'rtk hook claude' }] }] } });
  await t.s.set('rtk', true);
  assert.equal(t.calls.length, 0);
  const odd = path.join(t.root, 'rtk-wrapper.exe');
  const u = setup({ caveman: false, whichRtk: odd });
  u.write({ hooks: { PreToolUse: [{ hooks: [{ type: 'command', command: 'rtk hook claude' }] }] } });
  await u.s.set('rtk', true);
  assert.equal(u.calls.length, 0);
  // which points at the app's own: skipped
  const w2 = setup({ caveman: false, whichRtk: 'OWN' });
  w2.write({ hooks: { PreToolUse: [{ hooks: [{ type: 'command', command: 'rtk hook claude' }] }] } });
  await w2.s.set('rtk', true);
  assert.equal(w2.calls.length, 0);
});

test('keepCurrent: a running rtk is moved aside; a failing copy is logged', async () => {
  const t = setup({ caveman: false });
  const bin = path.join(t.root, 'x', 'rtk.exe');
  fs.mkdirSync(path.dirname(bin));
  fs.writeFileSync(bin, 'OLD');
  t.env.versions[bin] = '0.1';
  t.env.versions[t.bundled.rtk] = '0.2';
  t.write({ hooks: { PreToolUse: [{ hooks: [{ type: 'command', command: `${bin} hook claude` }] }] } });
  const origCopy = fs.copyFileSync;
  let n = 0;
  fs.copyFileSync = (a, b) => { if (b === bin && n++ === 0) throw new Error('busy'); return origCopy(a, b); };
  try {
    await t.s.set('rtk', true);
  } finally {
    fs.copyFileSync = origCopy;
  }
  assert.equal(fs.readFileSync(bin, 'utf8'), 'RTK-NEW');
  assert.ok(fs.readdirSync(path.dirname(bin)).some((f) => f.startsWith('rtk.exe.old-')));
  fs.copyFileSync = () => { throw new Error('nope'); };
  let errs;
  try {
    t.env.versions[bin] = '0.0.1';
    errs = await quiet(() => t.s.set('rtk', true));
  } finally {
    fs.copyFileSync = origCopy;
  }
  assert.ok(errs.some((e) => /savers: rtk update:/.test(e)));
});

test('the user\'s caveman plugin: on turns marketplace auto-update on; off disables it and on enables it again', async () => {
  const t = setup({ rtk: false });
  t.write({ enabledPlugins: { 'caveman@cave-market': true, 'other@x': true }, extraKnownMarketplaces: { 'cave-market': { source: { repo: 'a/b' } } } });
  await t.s.autoStart();
  let j = t.read();
  assert.equal(j.extraKnownMarketplaces['cave-market'].autoUpdate, true);
  assert.equal(commands(j).length, 0, 'the app\'s caveman not installed beside the plugin');
  await t.s.set('caveman', false);
  j = t.read();
  assert.equal(j.enabledPlugins['caveman@cave-market'], false);
  assert.equal(j.enabledPlugins['other@x'], true);
  assert.deepEqual(t.m.tokenSaversState.caveman.kept, { plugins: ['caveman@cave-market'], hooks: [] });
  assert.deepEqual((await t.s.state()).caveman, { available: true, on: false });
  await t.s.set('caveman', true);
  assert.equal(t.read().enabledPlugins['caveman@cave-market'], true);
});

test('autoUpdate: known_marketplaces decides; user\'s choice kept; odd settings left alone', async () => {
  const known = (t, v) => {
    fs.mkdirSync(path.join(t.env.claudeDir, 'plugins'), { recursive: true });
    t.write(v, path.join(t.env.claudeDir, 'plugins', 'known_marketplaces.json'));
  };
  // recorded only by Claude Code: declared from its source
  let t = setup({ rtk: false });
  known(t, { m: { source: { s: 1 } } });
  t.write({ enabledPlugins: { 'caveman@m': true } });
  await t.s.set('caveman', true);
  assert.deepEqual(t.read().extraKnownMarketplaces, { m: { source: { s: 1 }, autoUpdate: true } });
  // Claude Code already has a choice for it
  t = setup({ rtk: false });
  known(t, { m: { source: {}, autoUpdate: false } });
  t.write({ enabledPlugins: { 'caveman@m': true } });
  await t.s.set('caveman', true);
  assert.equal(t.read().extraKnownMarketplaces, undefined);
  // no source anywhere
  t = setup({ rtk: false });
  t.write({ enabledPlugins: { 'caveman@m': true } });
  await t.s.set('caveman', true);
  assert.equal(t.read().extraKnownMarketplaces, undefined);
  // the user turned it off in settings
  t = setup({ rtk: false });
  t.write({ enabledPlugins: { 'caveman@m': true }, extraKnownMarketplaces: { m: { source: {}, autoUpdate: false } } });
  await t.s.set('caveman', true);
  assert.equal(t.read().extraKnownMarketplaces.m.autoUpdate, false);
  // extraKnownMarketplaces that isn't an object
  for (const odd of [[], 'x']) {
    t = setup({ rtk: false });
    t.write({ enabledPlugins: { 'caveman@m': true }, extraKnownMarketplaces: odd });
    await t.s.set('caveman', true);
    assert.deepEqual(t.read().extraKnownMarketplaces, odd);
  }
  // a plugin key without a marketplace
  t = setup({ rtk: false });
  t.write({ enabledPlugins: { 'caveman@': true } });
  await t.s.set('caveman', true);
  assert.equal(t.read().extraKnownMarketplaces, undefined);
  // disabled plugin is not the user's
  t = setup({ rtk: false });
  t.write({ enabledPlugins: { 'caveman@m': false } });
  assert.equal((await t.s.state()).caveman.on, false);
});

test('caveman installer hooks (theirs): off takes them out, the app\'s removed too; on puts them back', async () => {
  const t = setup({ rtk: false });
  await t.s.autoStart(); // the app's caveman
  const j = t.read();
  j.hooks.SessionStart.push({ hooks: [{ type: 'command', command: 'node ~/.claude/hooks/caveman-start.js' }] });
  t.write(j);
  // autoStart again: theirs is there, so the app's goes out of its way
  await t.s.autoStart();
  assert.deepEqual(commands(t.read()), ['node ~/.claude/hooks/caveman-start.js']);
  await t.s.set('caveman', false);
  assert.equal(t.read().hooks, undefined);
  assert.equal(t.m.tokenSaversState.caveman.kept.hooks.length, 1);
  await t.s.set('caveman', true);
  assert.deepEqual(commands(t.read()), ['node ~/.claude/hooks/caveman-start.js']);
});

test('their rtk with the app\'s too: off takes out both; autoStart removes the app\'s', async () => {
  const t = setup({ caveman: false });
  await t.s.autoStart();
  const j = t.read();
  j.hooks.PreToolUse.push({ hooks: [{ type: 'command', command: 'rtk hook claude' }] });
  t.write(j);
  await t.s.set('rtk', false);
  assert.equal(t.read().hooks, undefined);
  assert.equal(t.read(t.codexHooks).hooks, undefined);
  // and autoStart with both
  const u = setup({ caveman: false });
  await u.s.autoStart();
  const k = u.read();
  k.hooks.PreToolUse.push({ hooks: [{ type: 'command', command: 'rtk hook claude' }] });
  u.write(k);
  await u.s.autoStart();
  assert.deepEqual(commands(u.read()), ['rtk hook claude']);
});

test('unreadable Claude settings are never written; rewrite dedupes the guarded hook', async () => {
  const t = setup();
  t.write('{ "a": 1, }');
  await t.s.autoStart();
  assert.equal(fs.readFileSync(t.sf, 'utf8'), '{ "a": 1, }');
  // rtk ran init (it writes its own), but the app wrote nothing
  // dedupe: two plain rtk hooks in one matcher become one guarded
  const u = setup({ caveman: false });
  u.write({ hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: GUARD }] }] } });
  u.env.fail = () => false;
  await u.s.set('rtk', true); // installed already: nothing to do
  assert.equal(u.calls.length, 0);
});

test('rewrite: the app\'s guard twice in one event goes once; settings with BOM and odd entries', async () => {
  const t = setup({ caveman: false });
  // as rtk leaves it: the guarded one, and its plain one again in another entry of the same matcher
  t.write('\ufeff' + JSON.stringify({ hooks: { PreToolUse: [null, { matcher: 'Bash', hooks: 'x' }, { matcher: 'Bash', hooks: [{ type: 'command', command: 'echo' }] }], Other: 'no' } }));
  await t.s.set('rtk', true);
  const j = t.read();
  assert.equal(commands({ hooks: { PreToolUse: j.hooks.PreToolUse.filter((e) => e && Array.isArray(e.hooks)) } }).filter((c) => c === GUARD).length, 1);
  assert.equal(j.hooks.Other, 'no');
  assert.ok(!j.hooks.PreToolUse.includes(null), 'empty entries dropped');
  assert.deepEqual(j.hooks.PreToolUse[0], { matcher: 'Bash', hooks: 'x' }, 'an entry without a hook list is left as it is');
});

test('errors in a switch are logged and the choice still kept', async () => {
  const t = setup({ rtk: false });
  fs.rmSync(path.join(t.bundled.caveman, 'LICENSE'));
  const errs = await quiet(() => t.s.set('caveman', true));
  assert.ok(errs.some((e) => /savers: caveman on:/.test(e)));
  assert.deepEqual(t.m.tokenSaversState.caveman, { on: true });
  // serial: a failing one doesn't stop the next
  const ok = await t.s.state();
  assert.equal(ok.caveman.on, false);
});

test('autoStart: an error keeping theirs current is logged', async () => {
  const t = setup({ caveman: false });
  t.write({ hooks: { PreToolUse: [{ hooks: [{ type: 'command', command: 'rtk hook claude' }] }] } });
  const errs = await quiet(async () => {
    const s2 = requireWith('windows/src/savers.js', { child_process: realCp }).createSavers({
      settings: { get: () => undefined, set() {} }, ownDir: t.ownDir, bundled: t.bundled, claudeDir: t.env.claudeDir, codexDir: t.env.codexDir,
      which: () => { throw new Error('which broke'); },
    });
    await s2.autoStart();
  });
  assert.ok(errs.some((e) => /savers: rtk: which broke/.test(e)));
});

test('editCodexNotes: notes the user wrote more under keep the line between', async () => {
  const t = setup({ rtk: false });
  fs.writeFileSync(t.agents, 'top\n<!-- terminal-app: caveman -->\nold\n<!-- /terminal-app: caveman -->\nbottom\n');
  await t.s.set('caveman', true);
  await t.s.set('caveman', false);
  assert.equal(fs.readFileSync(t.agents, 'utf8'), 'top\nbottom\n');
});

test('editCodexNotes: old notes replaced, at the start of the file too; a start marker alone is left', async () => {
  const t = setup({ rtk: false });
  fs.writeFileSync(t.agents, 'top\n\n<!-- terminal-app: caveman -->\nold\n<!-- /terminal-app: caveman -->\n');
  await t.s.set('caveman', true);
  assert.equal(fs.readFileSync(t.agents, 'utf8'), 'top\n\n<!-- terminal-app: caveman -->\nBe terse.\n<!-- /terminal-app: caveman -->\n');
  await t.s.set('caveman', false);
  assert.equal(fs.readFileSync(t.agents, 'utf8'), 'top\n');
  fs.writeFileSync(t.agents, '<!-- terminal-app: caveman -->\nold\n<!-- /terminal-app: caveman -->\nrest');
  await t.s.set('caveman', true);
  await t.s.set('caveman', false);
  assert.equal(fs.readFileSync(t.agents, 'utf8'), 'rest');
  // a start marker without its end: left alone
  fs.writeFileSync(t.agents, 'x\n<!-- terminal-app: caveman -->\n');
  await t.s.set('caveman', false);
  assert.equal(fs.readFileSync(t.agents, 'utf8'), 'x\n<!-- terminal-app: caveman -->\n');
});
