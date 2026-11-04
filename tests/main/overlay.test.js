'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const realOs = require('os');
const realCp = require('child_process');
const path = require('path');
const { requireWith } = require('../helpers/electron');

const WIN = process.platform === 'win32';
const HOME = fs.mkdtempSync(path.join(realOs.tmpdir(), 'atl-ovl-home-'));
const hiddenCalls = [];
let hiddenOut = '';
const cp = {
  ...realCp,
  execFile: (file, args, opts, cb) => {
    hiddenCalls.push({ file, args, cwd: opts.cwd, encoding: opts.encoding });
    setImmediate(() => cb(null, hiddenOut));
  },
};
const { createOverlay } = requireWith('windows/src/overlay.js', { os: { ...realOs, homedir: () => HOME }, child_process: cp });

function setup() {
  const root = fs.mkdtempSync(path.join(realOs.tmpdir(), 'atl-ovl-'));
  const dataDir = path.join(root, 'data'), claudeDir = path.join(root, 'claude');
  fs.mkdirSync(path.join(claudeDir, 'projects'), { recursive: true });
  return { root, dataDir, claudeDir, o: createOverlay({ dataDir, claudeDir }) };
}
const encode = (p) => p.replace(/[^A-Za-z0-9]/g, '-');

test('expand: ~ and ~/x, others unchanged', () => {
  const { o } = setup();
  assert.equal(o.expand('~'), HOME);
  assert.equal(o.expand('~/a'), path.join(HOME, 'a'));
  assert.equal(o.expand('~\\a'), path.join(HOME, 'a'));
  assert.equal(o.expand('~a'), '~a');
  assert.equal(o.expand('C:\\x'), 'C:\\x');
});

test('handle: unknown type is null', async () => {
  const { o } = setup();
  assert.equal(await o.handle({ type: 'nope' }), null);
});

test('getSlots: none saved -> all null; pie 5, picker 14', async () => {
  const { o } = setup();
  assert.deepEqual(await o.handle({ type: 'getSlots' }), { slots: Array(5).fill(null) });
  assert.deepEqual((await o.handle({ type: 'getSlots', set: 'picker' })).slots.length, 14);
  assert.deepEqual((await o.handle({ type: 'getSlots', set: 'other' })).slots.length, 5);
});

test('getSlots: array or {slots}, capped, padded, bad entries null, tildified', async () => {
  const { o, dataDir } = setup();
  fs.mkdirSync(dataDir, { recursive: true });
  const inHome = path.join(HOME, 'proj');
  fs.writeFileSync(path.join(dataDir, 'shortcuts.json'), JSON.stringify([{ name: 'P', dir: inHome }, null, { name: 'x' }, { dir: 'C:\\y' }, 1, 2, { dir: 'C:\\z' }]));
  const { slots } = await o.handle({ type: 'getSlots' });
  assert.equal(slots.length, 5);
  assert.deepEqual(slots[0], { name: 'P', dir: inHome, display: '~' + path.sep + 'proj' });
  assert.equal(slots[1], null);
  assert.equal(slots[2], null);
  assert.deepEqual(slots[3], { name: undefined, dir: 'C:\\y', display: 'C:\\y' });
  assert.equal(slots[4], null);
  fs.writeFileSync(path.join(dataDir, 'picker-shortcuts.json'), JSON.stringify({ slots: [{ name: 'a', dir: 'C:\\a' }] }));
  const p = (await o.handle({ type: 'getSlots', set: 'picker' })).slots;
  assert.equal(p.length, 14);
  assert.equal(p[0].dir, 'C:\\a');
  fs.writeFileSync(path.join(dataDir, 'picker-shortcuts.json'), JSON.stringify({}));
  assert.deepEqual((await o.handle({ type: 'getSlots', set: 'picker' })).slots, Array(14).fill(null));
  fs.writeFileSync(path.join(dataDir, 'shortcuts.json'), '{bad');
  assert.deepEqual((await o.handle({ type: 'getSlots' })).slots, Array(5).fill(null));
});

test('saveSlots: count checked, dirs must exist, names defaulted and capped, ~ expanded', async () => {
  const { o, dataDir } = setup();
  assert.deepEqual(await o.handle({ type: 'saveSlots', slots: [] }), { error: '5 kısayol gerekli' });
  assert.deepEqual(await o.handle({ type: 'saveSlots', slots: 'x' }), { error: '5 kısayol gerekli' });
  assert.deepEqual(await o.handle({ type: 'saveSlots', set: 'picker', slots: Array(5).fill(null) }), { error: '14 kısayol gerekli' });
  const missing = path.join(HOME, 'missing');
  assert.deepEqual(await o.handle({ type: 'saveSlots', slots: [{ dir: missing }, null, null, null, null] }), { error: `klasör değil: ${missing}` });
  assert.equal(fs.existsSync(path.join(dataDir, 'shortcuts.json')), false);
  const a = path.join(HOME, 'alpha');
  fs.mkdirSync(a, { recursive: true });
  const r = await o.handle({ type: 'saveSlots', slots: [{ dir: '~/alpha' }, { dir: a, name: 'N'.repeat(50) }, {}, null, { dir: '' }] });
  assert.equal(r.slots.length, 5);
  assert.deepEqual(r.slots[0], { name: 'alpha', dir: a, display: '~' + path.sep + 'alpha' });
  assert.equal(r.slots[1].name, 'N'.repeat(40));
  assert.equal(r.slots[2], null);
  assert.equal(r.slots[4], null);
  const saved = JSON.parse(fs.readFileSync(path.join(dataDir, 'shortcuts.json'), 'utf8'));
  assert.deepEqual(saved, [{ name: 'alpha', dir: a }, { name: 'N'.repeat(40), dir: a }, null, null, null]);
  // a file is not a folder
  const f = path.join(HOME, 'file.txt');
  fs.writeFileSync(f, '');
  assert.match((await o.handle({ type: 'saveSlots', slots: [{ dir: f }, null, null, null, null] })).error, /^klasör değil/);
});

test('listDir: subfolders only, sorted naturally, badges, hidden, parent', async () => {
  const { o, claudeDir } = setup();
  const d = fs.mkdtempSync(path.join(HOME, 'list-'));
  for (const n of ['b10', 'b2', 'A', '.dot', 'Hidden', 'x.app', '$Recycle', 'System Volume Information']) fs.mkdirSync(path.join(d, n));
  fs.writeFileSync(path.join(d, 'file.txt'), '');
  fs.mkdirSync(path.join(d, 'b2', '.git'));
  fs.mkdirSync(path.join(claudeDir, 'projects', encode(path.join(d, 'A'))));
  hiddenOut = 'hidden\r\n\r\n';
  hiddenCalls.length = 0;
  const r = await o.handle({ type: 'listDir', path: d });
  assert.equal(r.path, d);
  assert.equal(r.parent, path.dirname(d));
  assert.equal(r.display, '~' + d.slice(HOME.length));
  assert.deepEqual(r.entries.map((e) => e.name), ['.dot', 'A', 'b2', 'b10', 'Hidden']);
  const by = Object.fromEntries(r.entries.map((e) => [e.name, e]));
  assert.equal(by.b2.git, true);
  assert.equal(by.A.git, false);
  assert.equal(by.A.claude, true);
  assert.equal(by.b2.claude, false);
  assert.equal(by['.dot'].hidden, true);
  assert.equal(by.Hidden.hidden, WIN);
  assert.equal(by.A.hidden, false);
  assert.ok(by.A.modified > 0);
  assert.equal(by.A.path, path.join(d, 'A'));
  if (WIN) {
    assert.equal(hiddenCalls.length, 1);
    assert.equal(hiddenCalls[0].cwd, d);
    assert.deepEqual(hiddenCalls[0].args, ['/d', '/u', '/c', 'dir /a:h /b']);
    assert.equal(hiddenCalls[0].encoding, 'utf16le');
  }
});

test('listDir: a missing folder opens at the nearest one above; default is home; root has no parent', async () => {
  const { o } = setup();
  const d = fs.mkdtempSync(path.join(HOME, 'near-'));
  hiddenOut = '';
  const r = await o.handle({ type: 'listDir', path: path.join(d, 'no', 'such') });
  assert.equal(r.path, d);
  const h = await o.handle({ type: 'listDir' });
  assert.equal(h.path, HOME);
  assert.equal(h.display, '~');
  const root = path.parse(HOME).root;
  const rr = await o.handle({ type: 'listDir', path: root });
  assert.equal(rr.parent, null);
  assert.equal(rr.path, root);
});

test('listDir: unreadable folder gives an error', async () => {
  const { o } = setup();
  const d = fs.mkdtempSync(path.join(HOME, 'err-'));
  const orig = fs.promises.readdir;
  fs.promises.readdir = async () => { const e = new Error('no'); e.code = 'EPERM'; throw e; };
  try {
    const r = await o.handle({ type: 'listDir', path: d });
    assert.deepEqual(r, { path: d, display: '~' + d.slice(HOME.length), parent: path.dirname(d), error: 'izin yok', entries: [] });
    fs.promises.readdir = async () => { const e = new Error('no'); e.code = 'EIO'; throw e; };
    assert.equal((await o.handle({ type: 'listDir', path: d })).error, 'açılamıyor');
    fs.promises.readdir = async () => { const e = new Error('no'); e.code = 'EACCES'; throw e; };
    assert.equal((await o.handle({ type: 'listDir', path: d })).error, 'izin yok');
  } finally {
    fs.promises.readdir = orig;
  }
});

test('listDir: at most 600 entries', async () => {
  const { o } = setup();
  const d = fs.mkdtempSync(path.join(HOME, 'many-'));
  for (let i = 0; i < 605; i++) fs.mkdirSync(path.join(d, `d${i}`));
  hiddenOut = '';
  const r = await o.handle({ type: 'listDir', path: d });
  assert.equal(r.entries.length, 600);
});

test('places: home, existing usual folders with icons, recents from transcripts', async () => {
  const { o, claudeDir } = setup();
  fs.mkdirSync(path.join(HOME, 'Desktop'), { recursive: true });
  fs.mkdirSync(path.join(HOME, 'Code'), { recursive: true });
  const projects = path.join(claudeDir, 'projects');
  const work1 = fs.mkdtempSync(path.join(HOME, 'w1-'));
  const work2 = fs.mkdtempSync(path.join(HOME, 'w2-'));
  const mk = (dir, name, cwd, t, extra = '') => {
    fs.mkdirSync(path.join(projects, dir), { recursive: true });
    const f = path.join(projects, dir, name);
    fs.writeFileSync(f, cwd == null ? '{"x":1}\n' : `{"type":"x"${extra},"cwd":${JSON.stringify(cwd)}}\n`);
    fs.utimesSync(f, t, t);
  };
  mk('p1', 'a.jsonl', work1, 100);
  mk('p1', 'b.jsonl', work2, 300);
  mk('p1', 'c.jsonl', work1.toUpperCase(), 200); // same folder, other case: once
  mk('p2', 'd.jsonl', path.join(HOME, 'gone'), 400); // not a folder anymore
  mk('p2', 'e.jsonl', null, 500); // no cwd
  mk('p2', 'note.txt', work1, 600); // not a transcript
  const r = await o.handle({ type: 'places' });
  assert.equal(r.home, HOME);
  const fav = r.favorites.filter((f) => f.path.startsWith(HOME));
  assert.deepEqual(fav.map((f) => [f.name, f.icon]), [['Ana klasör', 'home'], ['Masaüstü', 'desktop'], ['Kod', 'code']]);
  assert.equal(fav[0].display, '~');
  if (WIN) {
    const drives = r.favorites.filter((f) => /^[A-Z]:\\$/.test(f.path));
    assert.ok(drives.length >= 1);
    assert.equal(drives[0].icon, undefined);
  }
  const recentPaths = r.recents.map((x) => x.path.toLowerCase());
  if (WIN) assert.deepEqual(recentPaths, [work2.toLowerCase(), work1.toLowerCase()]);
  assert.equal(r.recents[0].name, path.basename(work2));
  assert.equal(r.recents[0].t, 300 * 1000);
  assert.equal(r.recents[0].display, '~' + work2.slice(HOME.length));
});

test('places: recents capped at 12, no projects folder is fine', async () => {
  const { o, claudeDir } = setup();
  const projects = path.join(claudeDir, 'projects');
  for (let i = 0; i < 14; i++) {
    const w = fs.mkdtempSync(path.join(HOME, `r${i}-`));
    fs.mkdirSync(path.join(projects, `p${i}`));
    fs.writeFileSync(path.join(projects, `p${i}`, 'x.jsonl'), `{"cwd":${JSON.stringify(w)}}`);
  }
  assert.equal((await o.handle({ type: 'places' })).recents.length, 12);
  fs.rmSync(projects, { recursive: true });
  assert.deepEqual((await o.handle({ type: 'places' })).recents, []);
});
