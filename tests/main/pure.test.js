'use strict';
// guards.js, skills-core.js and main-core.js: the pure checks and helpers of the main process.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { requireWith } = require('../helpers/electron');

const G = requireWith('windows/src/guards.js');
const S = requireWith('windows/src/skills-core.js');
const M = requireWith('windows/src/main-core.js');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'atl-main-'));

// ---------- guards ----------
test('cleanPrompt: non-strings, cap at PROMPT_MAX, paste markers removed', () => {
  assert.equal(G.PROMPT_MAX, 20000);
  assert.equal(G.cleanPrompt(null), '');
  assert.equal(G.cleanPrompt(42), '');
  assert.equal(G.cleanPrompt('hi'), 'hi');
  assert.equal(G.cleanPrompt('a\x1b[200~b\x1b[201~c\x1b[202~'), 'abc\x1b[202~');
  assert.equal(G.cleanPrompt('x'.repeat(20001)).length, 20000);
  assert.equal(G.cleanPrompt('x'.repeat(20000)).length, 20000);
  // the cap applies before the markers go: a marker straddling the cut is cut, not removed
  const s = 'x'.repeat(19998) + '\x1b[201~';
  assert.equal(G.cleanPrompt(s), 'x'.repeat(19998) + '\x1b[');
});

test('isVideo / VIDEO_EXT: case-blind extension', () => {
  assert.deepEqual([...G.VIDEO_EXT].sort(), ['.m4v', '.mov', '.mp4', '.webm']);
  for (const f of ['a.mp4', 'B.MOV', 'c.WebM', 'd.m4v']) assert.equal(G.isVideo(f), true, f);
  for (const f of ['a.mkv', 'mp4', 'a.mp4.txt', 'a']) assert.equal(G.isVideo(f), false, f);
});

test('videoKey: lower-cased only on win32', () => {
  const p = path.resolve('/Foo/Bar.MP4');
  assert.equal(G.videoKey('/Foo/Bar.MP4', 'win32'), p.toLowerCase());
  assert.equal(G.videoKey('/Foo/Bar.MP4', 'linux'), p);
  assert.equal(G.videoKey('/Foo/Bar.MP4'), process.platform === 'win32' ? p.toLowerCase() : p);
});

test('videoDirOk: absolute, no "..", a directory; stat failures are false', () => {
  const d = tmp();
  assert.equal(G.videoDirOk(d), true);
  assert.equal(G.videoDirOk(123), false);
  assert.equal(G.videoDirOk('relative/dir'), false);
  assert.equal(G.videoDirOk(d + path.sep + '..' + path.sep + path.basename(d)), false);
  assert.equal(G.videoDirOk(d + '/../' + path.basename(d)), false);
  assert.equal(G.videoDirOk(path.join(d, 'missing')), false);
  const f = path.join(d, 'f.txt');
  fs.writeFileSync(f, '');
  assert.equal(G.videoDirOk(f), false);
  assert.equal(G.videoDirOk(d, () => ({ isDirectory: () => true })), true);
  assert.equal(G.videoDirOk(d, () => { throw new Error('x'); }), false);
});

test('videoPathOk: every condition is needed', () => {
  const abs = path.resolve('/v/clip.mp4');
  const allowed = new Set([G.videoKey(abs, 'win32')]);
  assert.equal(G.videoPathOk(abs, allowed, 'win32'), true);
  assert.equal(G.videoPathOk(abs.toUpperCase().replace('.MP4', '.mp4'), allowed, 'win32'), true);
  assert.equal(G.videoPathOk(abs, allowed, 'linux'), abs === abs.toLowerCase());
  assert.equal(G.videoPathOk('', allowed, 'win32'), false);
  assert.equal(G.videoPathOk(null, allowed, 'win32'), false);
  assert.equal(G.videoPathOk('clip.mp4', new Set([G.videoKey('clip.mp4', 'win32')]), 'win32'), false);
  const dd = path.resolve('/v') + path.sep + '..' + path.sep + 'clip.mp4';
  assert.equal(G.videoPathOk(dd, new Set([G.videoKey(dd, 'win32')]), 'win32'), false);
  const txt = path.resolve('/v/clip.txt');
  assert.equal(G.videoPathOk(txt, new Set([G.videoKey(txt, 'win32')]), 'win32'), false);
  assert.equal(G.videoPathOk(path.resolve('/v/other.mp4'), allowed, 'win32'), false);
});

// ---------- skills-core ----------
test('validSkillName: a-z 0-9 -, 1..64', () => {
  assert.equal(S.validSkillName('my-skill-2'), true);
  assert.equal(S.validSkillName('a'), true);
  assert.equal(S.validSkillName('a'.repeat(64)), true);
  assert.equal(S.validSkillName('a'.repeat(65)), false);
  assert.equal(S.validSkillName(''), false);
  assert.equal(S.validSkillName(null), false);
  assert.equal(S.validSkillName(undefined), false);
  assert.equal(S.validSkillName('My'), false);
  assert.equal(S.validSkillName('a_b'), false);
  assert.equal(S.validSkillName('a b'), false);
  assert.ok(S.SKILL_NAME instanceof RegExp);
});

test('parseSkillMd: plain, quoted, CRLF, BOM, missing', () => {
  assert.deepEqual(S.parseSkillMd('---\nname: foo\ndescription: does things\n---\nbody'), { name: 'foo', description: 'does things' });
  assert.deepEqual(S.parseSkillMd('---\r\nname: "q"\r\ndescription: \'single\'\r\n---\r\n'), { name: 'q', description: 'single' });
  assert.deepEqual(S.parseSkillMd('\ufeff---\nname: bom\n---'), { name: 'bom', description: '' });
  assert.deepEqual(S.parseSkillMd('no frontmatter'), { name: '', description: '' });
  assert.deepEqual(S.parseSkillMd(null), { name: '', description: '' });
  assert.deepEqual(S.parseSkillMd(undefined), { name: '', description: '' });
  assert.deepEqual(S.parseSkillMd('---\nother: x\nname:   spaced   \n---'), { name: 'spaced', description: '' });
  // mismatched quotes stay
  assert.equal(S.parseSkillMd('---\nname: "a\'\n---').name, '"a\'');
  // frontmatter not at the start
  assert.equal(S.parseSkillMd('x\n---\nname: a\n---').name, '');
});

test('parseSkillMd: folded and literal blocks', () => {
  const md = '---\nname: n\ndescription: >\n  line one\n  line two\nafter: x\n---';
  assert.deepEqual(S.parseSkillMd(md), { name: 'n', description: 'line one line two' });
  assert.equal(S.parseSkillMd('---\ndescription: |-\n  a\n\tb\n---').description, 'a b');
  assert.equal(S.parseSkillMd('---\ndescription: >+\n  z\n---').description, 'z');
  // a block marker with nothing indented after it is empty
  assert.equal(S.parseSkillMd('---\ndescription: >\nname: k\n---').description, '');
  assert.equal(S.parseSkillMd('---\ndescription: >\nname: k\n---').name, 'k');
  // ">x" is not a block marker
  assert.equal(S.parseSkillMd('---\ndescription: >x\n---').description, '>x');
});

// ---------- main-core ----------
test('commandLabel: paths to their last part, node and npm-cli', () => {
  assert.equal(M.commandLabel('"C:\\Program Files\\nodejs\\node.exe" "C:\\x\\npm-cli.js" run dev'), 'npm run dev');
  assert.equal(M.commandLabel('node C:\\a\\npx-cli.js vite'), 'npx vite');
  assert.equal(M.commandLabel('C:\\Windows\\cmd.exe /c build.bat'), 'cmd /c build.bat');
  assert.equal(M.commandLabel('python.EXE ./scripts/serve.py'), 'python serve.py');
  assert.equal(M.commandLabel('run.CMD'), 'run');
  assert.equal(M.commandLabel('x.bat'), 'x');
  assert.equal(M.commandLabel('node'), 'node');
  assert.equal(M.commandLabel('nodejs app.js'), 'app.js');
  assert.equal(M.commandLabel('NODE.exe NPM-CLI.JS i'), 'npm i');
  assert.equal(M.commandLabel(''), '');
  assert.equal(M.commandLabel('   '), '');
  assert.equal(M.commandLabel(null), 'null');
  assert.equal(M.commandLabel('a ""'), 'a');
  assert.equal(M.commandLabel('/c'), '/c');
});

test('commandLabel: 48 chars kept, longer cut to 47 and an ellipsis', () => {
  const w48 = 'a'.repeat(48);
  assert.equal(M.commandLabel(w48), w48);
  const r = M.commandLabel('a'.repeat(49));
  assert.equal(r, 'a'.repeat(47) + '…');
  assert.equal(r.length, 48);
});

test('fitInArea: moves inside, shrinks only when bigger', () => {
  const a = { x: 0, y: 0, width: 1000, height: 800 };
  assert.deepEqual(M.fitInArea({ x: 10, y: 20, width: 100, height: 100 }, a), { x: 10, y: 20, width: 100, height: 100 });
  assert.deepEqual(M.fitInArea({ x: -50, y: -5, width: 100, height: 100 }, a), { x: 0, y: 0, width: 100, height: 100 });
  assert.deepEqual(M.fitInArea({ x: 950, y: 790, width: 100, height: 100 }, a), { x: 900, y: 700, width: 100, height: 100 });
  assert.deepEqual(M.fitInArea({ x: 5, y: 5, width: 2000, height: 900 }, a), { x: 0, y: 0, width: 1000, height: 800 });
  const off = { x: 1920, y: 100, width: 1280, height: 1000 };
  assert.deepEqual(M.fitInArea({ x: 0, y: 0, width: 300, height: 300 }, off), { x: 1920, y: 100, width: 300, height: 300 });
  // exactly at the far edge stays
  assert.deepEqual(M.fitInArea({ x: 900, y: 700, width: 100, height: 100 }, a), { x: 900, y: 700, width: 100, height: 100 });
});

test('newerVersion', () => {
  assert.equal(M.newerVersion('0.15.1', '0.15.0'), true);
  assert.equal(M.newerVersion('0.15.0', '0.15.1'), false);
  assert.equal(M.newerVersion('0.15.0', '0.15.0'), false);
  assert.equal(M.newerVersion('1.0', '0.99.99'), true);
  assert.equal(M.newerVersion('0.15.0.1', '0.15.0'), true);
  assert.equal(M.newerVersion('0.15.0', '0.15.0.0'), false);
  assert.equal(M.newerVersion('0.16.0-beta', '0.15.9'), true);
  assert.equal(M.newerVersion('0.15.0+b2', '0.15.0'), false);
  assert.equal(M.newerVersion('0.10.0', '0.9.0'), true);
  assert.equal(M.newerVersion(null, '0.0.1'), false);
  assert.equal(M.newerVersion('0.0.1', undefined), true);
  assert.equal(M.newerVersion('x.y', '0.0'), false);
});

test('notesOf: strings, html, arrays', () => {
  assert.equal(M.notesOf(null), '');
  assert.equal(M.notesOf(''), '');
  assert.equal(M.notesOf('<p>One</p><ul><li> Two </li></ul>'), 'One\nTwo');
  assert.equal(M.notesOf([{ note: 'a\n\n b' }, {}, { note: '<b>c</b>' }]), 'a\nb\nc');
  assert.equal(M.notesOf([]), '');
  assert.equal(M.notesOf(42), '42');
});

test('countFiles: files under the tree, missing dir is 0, depth cap', () => {
  const d = tmp();
  assert.equal(M.countFiles(path.join(d, 'nope')), 0);
  fs.writeFileSync(path.join(d, 'a'), '');
  fs.mkdirSync(path.join(d, 's', 't'), { recursive: true });
  fs.writeFileSync(path.join(d, 's', 'b'), '');
  fs.writeFileSync(path.join(d, 's', 't', 'c'), '');
  assert.equal(M.countFiles(d), 3);
  // depth 0..6 counted, deeper not
  let p = path.join(d, 'deep');
  for (let i = 1; i <= 7; i++) {
    p = path.join(p, String(i));
  }
  fs.mkdirSync(p, { recursive: true });
  fs.writeFileSync(path.join(path.dirname(p), 'at6'), ''); // deep/1/../6 is depth 7 from d? see below
  fs.writeFileSync(path.join(p, 'at7'), '');
  // d(0)/deep(1)/1(2)/2(3)/3(4)/4(5)/5(6)/6(7)/7(8): 'at6' sits in deep/1/../6 (depth 7) and is not counted
  assert.equal(M.countFiles(d), 3);
  const q = path.join(d, 'deep', '1', '2', '3', '4', '5');
  fs.writeFileSync(path.join(q, 'in5'), ''); // inside depth-6 dir: counted
  assert.equal(M.countFiles(d), 4);
});

test('countFiles: stops past 5000', () => {
  const d = tmp();
  for (let i = 0; i < 3; i++) {
    const s = path.join(d, `s${i}`);
    fs.mkdirSync(s);
    for (let j = 0; j < 2600; j++) fs.writeFileSync(path.join(s, String(j)), '');
  }
  // the first two dirs reach 5200 > 5000; the third dir is not walked
  assert.equal(M.countFiles(d), 5200);
});

test('findSkillDirs: root itself, nested, depth 4, skips __MACOSX', () => {
  const d = tmp();
  fs.writeFileSync(path.join(d, 'SKILL.md'), '');
  assert.deepEqual(M.findSkillDirs(d), [d]);
  const e = tmp();
  const mk = (...p) => { const x = path.join(e, ...p); fs.mkdirSync(x, { recursive: true }); fs.writeFileSync(path.join(x, 'SKILL.md'), ''); return x; };
  const a = mk('a');
  const b = mk('x', 'y', 'b');
  const four = mk('1', '2', '3', '4');
  mk('1', '2', '3', '4x', '5');
  mk('__MACOSX', 'z');
  mk('a', 'inner'); // under a found one: not looked at
  const found = M.findSkillDirs(e).sort();
  assert.deepEqual(found, [four, a, b].sort());
  assert.deepEqual(M.findSkillDirs(path.join(e, 'missing')), []);
});

test('treeIsContained: plain tree true, link false', () => {
  const d = tmp();
  fs.mkdirSync(path.join(d, 'a', 'b'), { recursive: true });
  fs.writeFileSync(path.join(d, 'a', 'b', 'f'), '');
  assert.equal(M.treeIsContained(d), true);
  const out = tmp();
  let linked = true;
  try {
    fs.symlinkSync(out, path.join(d, 'a', 'link'), 'junction');
  } catch {
    linked = false;
  }
  if (linked) assert.equal(M.treeIsContained(d), false);
  assert.throws(() => M.treeIsContained(path.join(d, 'missing')));
});
