'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { requireWith } = require('../helpers/electron');

const { createAIColors } = requireWith('windows/src/aicolors.js');

function setup({ claude = true, codex = true, agy = true } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'atl-aic-'));
  const claudeDir = path.join(root, '.claude'), codexDir = path.join(root, '.codex');
  const agyDir = path.join(root, '.gemini', 'antigravity-cli');
  if (claude) fs.mkdirSync(claudeDir);
  if (codex) fs.mkdirSync(codexDir);
  if (agy) fs.mkdirSync(agyDir, { recursive: true });
  const m = {};
  const settings = { get: (k) => m[k], set: (k, v) => { m[k] = JSON.parse(JSON.stringify(v)); } };
  const a = createAIColors({ settings, claudeDir, codexDir, home: root });
  return {
    a, m,
    claudeFile: path.join(claudeDir, 'settings.json'), codexFile: path.join(codexDir, 'config.toml'), agyFile: path.join(agyDir, 'settings.json'),
  };
}
const readJ = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const write = (f, s) => fs.writeFileSync(f, typeof s === 'string' ? s : JSON.stringify(s));

function quiet(fn) {
  const orig = console.error;
  const errs = [];
  console.error = (...x) => errs.push(x.join(' '));
  try { fn(); } finally { console.error = orig; }
  return errs;
}

test('isOn: on unless turned off', () => {
  const { a, m } = setup();
  assert.equal(a.isOn(), true);
  m.aiColors = { on: false };
  assert.equal(a.isOn(), false);
  m.aiColors = { on: true };
  assert.equal(a.isOn(), true);
});

test('autoStart: every tool gets its ANSI theme, prev recorded', () => {
  const { a, m, claudeFile, codexFile, agyFile } = setup();
  write(claudeFile, { theme: 'light', other: 1 });
  a.autoStart();
  assert.deepEqual(readJ(claudeFile), { theme: 'light-ansi', other: 1 });
  assert.equal(readJ(agyFile).colorScheme, 'terminal');
  // a missing config.toml reads as one empty line, kept above the new section
  assert.equal(fs.readFileSync(codexFile, 'utf8'), '\n[tui]\ntheme = "ansi"\n');
  assert.deepEqual(m.aiColors.claude, { prev: 'light', set: 'light-ansi' });
  assert.deepEqual(m.aiColors.agy, { prev: null, set: 'terminal' });
  assert.deepEqual(m.aiColors.codex, { prev: null, set: '"ansi"', madeSection: true });
  // twice: nothing new
  const before = JSON.stringify(m.aiColors);
  a.autoStart();
  assert.equal(JSON.stringify(m.aiColors), before);
});

test('autoStart: off does nothing; missing tools skipped and picked up later', () => {
  const s = setup({ claude: false, codex: false, agy: false });
  s.m.aiColors = { on: false };
  s.a.autoStart();
  assert.deepEqual(s.m.aiColors, { on: false });
  s.m.aiColors = {};
  s.a.autoStart();
  assert.deepEqual(s.m.aiColors, {});
  assert.equal(fs.existsSync(s.claudeFile), false);
  fs.mkdirSync(path.dirname(s.claudeFile));
  s.a.autoStart();
  assert.deepEqual(s.m.aiColors.claude, { prev: null, set: 'dark-ansi' });
});

test('claude: theme mapping; an -ansi theme already is left alone', () => {
  for (const [from, to] of [[undefined, 'dark-ansi'], ['dark', 'dark-ansi'], ['light-daltonized', 'light-ansi'], [42, 'dark-ansi'], ['dark-ansi', null], ['light-ansi', null]]) {
    const { a, m, claudeFile } = setup({ codex: false, agy: false });
    write(claudeFile, from === undefined ? {} : { theme: from });
    a.autoStart();
    if (to == null) {
      assert.equal(m.aiColors.claude, undefined, String(from));
      assert.equal(readJ(claudeFile).theme, from);
    } else {
      assert.equal(readJ(claudeFile).theme, to, String(from));
      assert.equal(m.aiColors.claude.prev, from === undefined ? null : from);
    }
  }
});

test('claude: empty file is {}, unreadable / array JSON left alone, BOM read', () => {
  let s = setup({ codex: false, agy: false });
  write(s.claudeFile, '  \n');
  s.a.autoStart();
  assert.deepEqual(readJ(s.claudeFile), { theme: 'dark-ansi' });
  s = setup({ codex: false, agy: false });
  write(s.claudeFile, '{oops');
  s.a.autoStart();
  assert.equal(fs.readFileSync(s.claudeFile, 'utf8'), '{oops');
  assert.equal(s.m.aiColors.claude, undefined);
  s = setup({ codex: false, agy: false });
  write(s.claudeFile, '[1]');
  s.a.autoStart();
  assert.equal(fs.readFileSync(s.claudeFile, 'utf8'), '[1]');
  s = setup({ codex: false, agy: false });
  write(s.claudeFile, 'null');
  s.a.autoStart();
  assert.equal(s.m.aiColors.claude, undefined);
  s = setup({ codex: false, agy: false });
  write(s.claudeFile, '﻿{"theme":"light"}');
  s.a.autoStart();
  assert.equal(readJ(s.claudeFile).theme, 'light-ansi');
});

test('agy: terminal already is left alone', () => {
  const { a, m, agyFile } = setup({ claude: false, codex: false });
  write(agyFile, { colorScheme: 'terminal' });
  a.autoStart();
  assert.equal(m.aiColors.agy, undefined);
});

test('codex: [tui] with a theme, without one, already ansi, other sections', () => {
  let s = setup({ claude: false, agy: false });
  write(s.codexFile, 'model = "x"\n[tui]\ntheme = "dark"\n[other]\ntheme = "keep"\n');
  s.a.autoStart();
  assert.equal(fs.readFileSync(s.codexFile, 'utf8'), 'model = "x"\n[tui]\ntheme = "ansi"\n[other]\ntheme = "keep"\n');
  assert.deepEqual(s.m.aiColors.codex, { prev: '"dark"', set: '"ansi"', madeSection: false });
  s = setup({ claude: false, agy: false });
  write(s.codexFile, '[tui]\nfoo = 1\n');
  s.a.autoStart();
  assert.equal(fs.readFileSync(s.codexFile, 'utf8'), '[tui]\ntheme = "ansi"\nfoo = 1\n');
  assert.deepEqual(s.m.aiColors.codex, { prev: null, set: '"ansi"', madeSection: false });
  s = setup({ claude: false, agy: false });
  write(s.codexFile, '[tui]\n  theme = "ansi"\n');
  s.a.autoStart();
  assert.equal(s.m.aiColors.codex, undefined);
  s = setup({ claude: false, agy: false });
  write(s.codexFile, 'model = "x"');
  s.a.autoStart();
  assert.equal(fs.readFileSync(s.codexFile, 'utf8'), 'model = "x"\n\n[tui]\ntheme = "ansi"\n');
  // a theme line in another section is not the tui's
  s = setup({ claude: false, agy: false });
  write(s.codexFile, '[a]\ntheme = "x"\n[tui]\n');
  s.a.autoStart();
  assert.equal(fs.readFileSync(s.codexFile, 'utf8'), '[a]\ntheme = "x"\n[tui]\ntheme = "ansi"\n');
  // value with "=" in it
  s = setup({ claude: false, agy: false });
  write(s.codexFile, '[tui]\ntheme = "a=b"\n');
  s.a.autoStart();
  assert.equal(s.m.aiColors.codex.prev, '"a=b"');
});

test('set(false): every tool back as it was, the record forgotten', () => {
  const { a, m, claudeFile, codexFile, agyFile } = setup();
  write(claudeFile, { theme: 'light' });
  write(agyFile, { colorScheme: 'dark', x: 1 });
  write(codexFile, 'model = "x"\n[tui]\ntheme = "dark"\n');
  a.autoStart();
  a.set(false);
  assert.deepEqual(readJ(claudeFile), { theme: 'light' });
  assert.deepEqual(readJ(agyFile), { colorScheme: 'dark', x: 1 });
  assert.equal(fs.readFileSync(codexFile, 'utf8'), 'model = "x"\n[tui]\ntheme = "dark"\n');
  assert.deepEqual(m.aiColors, { on: false });
  assert.equal(a.isOn(), false);
  // on again
  a.set(true);
  assert.equal(readJ(claudeFile).theme, 'light-ansi');
  assert.equal(m.aiColors.on, true);
  // on while already on: not applied twice
  const snap = JSON.stringify(m.aiColors);
  a.set(true);
  assert.equal(JSON.stringify(m.aiColors), snap);
});

test('set(false): keys that had no value are deleted; a section the app made goes', () => {
  const { a, claudeFile, codexFile, agyFile } = setup();
  write(claudeFile, { x: 1 });
  a.autoStart();
  a.set(false);
  assert.deepEqual(readJ(claudeFile), { x: 1 });
  assert.deepEqual(readJ(agyFile), {});
  assert.equal(fs.readFileSync(codexFile, 'utf8'), '\n');
});

test('codex putBack: made section kept when something else is in it; theme line removed when none before', () => {
  let s = setup({ claude: false, agy: false });
  s.a.autoStart();
  fs.writeFileSync(s.codexFile, '[tui]\ntheme = "ansi"\nfoo = 1\n');
  s.a.set(false);
  assert.equal(fs.readFileSync(s.codexFile, 'utf8'), '[tui]\nfoo = 1\n');
  s = setup({ claude: false, agy: false });
  write(s.codexFile, '[tui]\nfoo = 1\n');
  s.a.autoStart();
  s.a.set(false);
  assert.equal(fs.readFileSync(s.codexFile, 'utf8'), '[tui]\nfoo = 1\n');
  // made section followed by another section: it goes
  s = setup({ claude: false, agy: false });
  s.a.autoStart();
  fs.writeFileSync(s.codexFile, '[tui]\ntheme = "ansi"\n[next]\n');
  s.a.set(false);
  assert.equal(fs.readFileSync(s.codexFile, 'utf8'), '[next]\n');
  // made section last in file with nothing after
  s = setup({ claude: false, agy: false });
  s.a.autoStart();
  fs.writeFileSync(s.codexFile, '[tui]\ntheme = "ansi"');
  s.a.set(false);
  assert.equal(fs.readFileSync(s.codexFile, 'utf8'), '');
});

test('putBack leaves what the user changed since', () => {
  const { a, m, claudeFile, codexFile, agyFile } = setup();
  write(claudeFile, { theme: 'light' });
  a.autoStart();
  write(claudeFile, { theme: 'mine' });
  write(agyFile, { colorScheme: 'theirs' });
  fs.writeFileSync(codexFile, '[tui]\ntheme = "custom"\n');
  a.set(false);
  assert.deepEqual(readJ(claudeFile), { theme: 'mine' });
  assert.deepEqual(readJ(agyFile), { colorScheme: 'theirs' });
  assert.equal(fs.readFileSync(codexFile, 'utf8'), '[tui]\ntheme = "custom"\n');
  assert.deepEqual(m.aiColors, { on: false });
});

test('codex putBack: file gone, section gone, theme line gone', () => {
  for (const after of [null, 'model = 1\n', '[tui]\nfoo = 1\n']) {
    const s = setup({ claude: false, agy: false });
    s.a.autoStart();
    if (after == null) fs.rmSync(s.codexFile);
    else fs.writeFileSync(s.codexFile, after);
    s.a.set(false);
    assert.equal(fs.existsSync(s.codexFile) ? fs.readFileSync(s.codexFile, 'utf8') : null, after);
  }
});

test('errors are logged per tool and the rest still runs', () => {
  const { a, m, claudeFile, codexFile } = setup({ agy: false });
  fs.mkdirSync(codexFile); // a folder where the file goes: writing it throws
  const errs = quiet(() => a.autoStart());
  assert.equal(errs.length, 1);
  assert.match(errs[0], /aicolors: codex:/);
  assert.equal(readJ(claudeFile).theme, 'dark-ansi');
  assert.equal(m.aiColors.codex, undefined);
  // set(true) logs too
  const errs2 = quiet(() => a.set(true));
  assert.equal(errs2.length, 1);
  // set(false) with a record whose putBack throws
  m.aiColors.codex = { prev: null, set: '"ansi"' };
  fs.rmSync(codexFile, { recursive: true });
  fs.writeFileSync(codexFile, '[tui]\ntheme = "ansi"\n');
  fs.chmodSync(codexFile, 0o444);
  const errs3 = quiet(() => a.set(false));
  fs.chmodSync(codexFile, 0o666);
  if (errs3.length) assert.match(errs3[0], /aicolors: codex:/);
  assert.equal(m.aiColors.on, false);
});
