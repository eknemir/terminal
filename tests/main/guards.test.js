'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const os = require('os');
const G = require('../../windows/src/guards');
const S = require('../../windows/src/skills-core');

const ABS = path.resolve(os.tmpdir(), 'v');

test('cleanPrompt: strings only, bracketed-paste markers out, 20000 cap', () => {
  assert.equal(G.cleanPrompt(42), '');
  assert.equal(G.cleanPrompt(null), '');
  assert.equal(G.cleanPrompt(undefined), '');
  assert.equal(G.cleanPrompt('hi'), 'hi');
  assert.equal(G.cleanPrompt('a\x1b[201~b\x1b[200~c\x1b[201~'), 'abc');
  assert.equal(G.cleanPrompt('a\x1b[202~'), 'a\x1b[202~');
  assert.equal(G.PROMPT_MAX, 20000);
  assert.equal(G.cleanPrompt('x'.repeat(20000)).length, 20000);
  assert.equal(G.cleanPrompt('x'.repeat(20001)).length, 20000);
  // capped first, then stripped: a marker cut in half by the cap can't survive whole
  const s = 'x'.repeat(19997) + '\x1b[201~';
  assert.ok(!G.cleanPrompt(s).includes('\x1b[201~'));
  assert.equal(G.cleanPrompt('x'.repeat(19994) + '\x1b[201~'), 'x'.repeat(19994));
});

test('isVideo', () => {
  for (const f of ['a.mp4', 'A.MP4', 'b.mov', 'c.webm', 'd.m4v', 'C:\\x\\e.Mov']) assert.equal(G.isVideo(f), true, f);
  for (const f of ['a.mkv', 'a.mp4.txt', 'mp4', '', 'a.']) assert.equal(G.isVideo(f), false, f);
});

test('videoKey: lower-cased on Windows only, resolved', () => {
  assert.equal(G.videoKey(ABS + '/X.MP4', 'win32'), path.resolve(ABS + '/X.MP4').toLowerCase());
  assert.equal(G.videoKey(ABS + '/X.MP4', 'linux'), path.resolve(ABS + '/X.MP4'));
  assert.equal(G.videoKey(ABS + '/a/../b.mp4', 'linux'), path.resolve(ABS, 'b.mp4'));
  assert.equal(G.videoKey(ABS), process.platform === 'win32' ? path.resolve(ABS).toLowerCase() : path.resolve(ABS));
});

test('videoDirOk', () => {
  const dir = { isDirectory: () => true }, file = { isDirectory: () => false };
  assert.equal(G.videoDirOk(ABS, () => dir), true);
  assert.equal(G.videoDirOk(ABS, () => file), false);
  assert.equal(G.videoDirOk(ABS, () => { throw new Error('ENOENT'); }), false);
  assert.equal(G.videoDirOk('relative/dir', () => dir), false);
  assert.equal(G.videoDirOk(ABS + '/../etc', () => dir), false);
  assert.equal(G.videoDirOk(ABS + '\\..\\etc', () => dir), path.sep === '/' ? false : false);
  assert.equal(G.videoDirOk(ABS + '/..x', () => dir), true); // a name starting with dots is fine
  assert.equal(G.videoDirOk(null, () => dir), false);
  assert.equal(G.videoDirOk(5, () => dir), false);
  assert.equal(G.videoDirOk(os.tmpdir()), true); // default stat
  assert.equal(G.videoDirOk(path.join(os.tmpdir(), 'no-such-dir-' + Date.now())), false);
});

test('videoPathOk: only listed, absolute, video files without ..', () => {
  const p = path.join(ABS, 'Clip.MP4');
  const allowed = new Set([G.videoKey(p, 'win32')]);
  assert.equal(G.videoPathOk(p, allowed, 'win32'), true);
  assert.equal(G.videoPathOk(p.toLowerCase(), allowed, 'win32'), true);
  assert.equal(G.videoPathOk(p, new Set([G.videoKey(p, 'linux')]), 'linux'), true);
  assert.equal(G.videoPathOk(path.join(ABS, 'other.mp4'), allowed, 'win32'), false);
  assert.equal(G.videoPathOk(ABS + '/x/../Clip.MP4', allowed, 'win32'), false);
  assert.equal(G.videoPathOk('Clip.MP4', allowed, 'win32'), false);
  assert.equal(G.videoPathOk(path.join(ABS, 'Clip.txt'), new Set([G.videoKey(path.join(ABS, 'Clip.txt'), 'win32')]), 'win32'), false);
  assert.equal(G.videoPathOk('', allowed, 'win32'), false);
  assert.equal(G.videoPathOk(null, allowed, 'win32'), false);
  assert.equal(G.videoPathOk(7, allowed), false);
  assert.equal(G.videoPathOk(p, new Set([G.videoKey(p)])), true); // default platform
});

test('validSkillName', () => {
  assert.equal(S.validSkillName('my-skill-2'), true);
  assert.equal(S.validSkillName('a'), true);
  assert.equal(S.validSkillName('a'.repeat(64)), true);
  assert.equal(S.validSkillName('a'.repeat(65)), false);
  for (const n of ['', null, undefined, 'My', 'a_b', 'a b', '../x', 'a/b', 'ç']) assert.equal(S.validSkillName(n), false, String(n));
  assert.ok(S.SKILL_NAME instanceof RegExp);
});

test('parseSkillMd: plain, quoted, BOM, CRLF, block scalars', () => {
  assert.deepEqual(S.parseSkillMd('---\nname: foo\ndescription: Does things\n---\nbody'), { name: 'foo', description: 'Does things' });
  assert.deepEqual(S.parseSkillMd('\uFEFF---\r\nname: "q"\r\ndescription: \'s\'\r\n---\r\n'), { name: 'q', description: 's' });
  assert.deepEqual(S.parseSkillMd('---\nname: x\ndescription: >\n  one\n  two\nother: 1\n---'), { name: 'x', description: 'one two' });
  assert.deepEqual(S.parseSkillMd('---\ndescription: |-\n   a\n---'), { name: '', description: 'a' });
  assert.deepEqual(S.parseSkillMd('---\ndescription: >\n---'), { name: '', description: '' }); // empty block
  assert.deepEqual(S.parseSkillMd('---\nname: "mismatch\'\n---'), { name: '"mismatch\'', description: '' });
  assert.deepEqual(S.parseSkillMd('---\nversion: 2\n---'), { name: '', description: '' });
  assert.deepEqual(S.parseSkillMd('no frontmatter'), { name: '', description: '' });
  assert.deepEqual(S.parseSkillMd(null), { name: '', description: '' });
  assert.deepEqual(S.parseSkillMd(undefined), { name: '', description: '' });
  assert.deepEqual(S.parseSkillMd('---\nname: a\nname: b\n---'), { name: 'b', description: '' }); // last wins
});
