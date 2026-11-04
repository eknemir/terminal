'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const realOs = require('os');
const { requireWith } = require('../helpers/electron');

const HOME = 'C:\\Users\\Me';
const { createChatList } = requireWith('windows/src/chatlist.js', { os: { ...realOs, homedir: () => HOME } });
const WIN = process.platform === 'win32';

function store(init) {
  const m = { chatList: init };
  const writes = [];
  return { m, writes, get: (k) => m[k], set: (k, v) => { m[k] = v; writes.push(v); } };
}
const item = (id, cwd, mtime, extra = {}) => ({ id, cwd, mtime, size: 1, title: `t-${id}`, lastPrompt: `p-${id}`, ...extra });

test('saved state: junk filtered, titles only strings', () => {
  const s = store({ favorites: ['a', 1, null], archived: 'x', titles: { a: 'Named', b: 5 } });
  const c = createChatList({ settings: s });
  c.setItems([item('a', 'C:\\w\\p', 2), item('b', 'C:\\w\\p', 1)]);
  const snap = c.snapshot();
  assert.deepEqual(snap.rows.map((r) => [r.id, r.fav, r.title]), [['a', true, 'Named'], ['b', false, 't-b']]);
  assert.equal(s.writes.length, 0);
  const c2 = createChatList({ settings: store(undefined) });
  c2.setItems(null);
  assert.deepEqual(c2.snapshot(), { rows: [], saved: 0, live: 0, folders: {} });
  const c3 = createChatList({ settings: store({ titles: 'nope' }) });
  c3.setItems([item('a', 'C:\\x', 1)]);
  assert.equal(c3.snapshot().rows[0].title, 't-a');
});

test('version bumps on setItems and on every change, not on no-ops', () => {
  const c = createChatList({ settings: store() });
  assert.equal(c.version(), 0);
  c.setItems([item('a', 'C:\\x', 1)]);
  assert.equal(c.version(), 1);
  c.toggleFavorite('a');
  assert.equal(c.version(), 2);
  c.toggleFavorite('missing');
  c.toggleArchived('missing');
  c.restore('missing');
  c.restore('a'); // not archived
  c.rename('', 'x');
  c.setFolder('', true);
  assert.equal(c.version(), 2);
  c.restoreAll();
  assert.equal(c.version(), 3);
});

test('setLive / setOpen: report only real changes', () => {
  const c = createChatList({ settings: store() });
  const l = [{ sessionId: 's', cwd: 'C:\\x', status: 'busy', host: 'h', name: 'n', title: 'T' }];
  assert.equal(c.setLive(l), true);
  assert.equal(c.setLive(l.map((x) => ({ ...x, other: 1 }))), false);
  for (const k of ['sessionId', 'cwd', 'status', 'host', 'name', 'title']) {
    assert.equal(c.setLive([{ ...l[0], [k]: 'changed' }]), true, k);
    assert.equal(c.setLive(l), true);
  }
  assert.equal(c.setLive(null), true);
  assert.equal(c.setLive(undefined), false);
  assert.equal(c.setOpen(['b', 'a']), true);
  assert.equal(c.setOpen(['a', 'b']), false);
  assert.equal(c.setOpen([]), true);
});

test('live sessions without history join the list at the top', () => {
  const c = createChatList({ settings: store() });
  c.setItems([item('old', 'C:\\w\\a', 5)]);
  c.setLive([
    { sessionId: 'new', cwd: 'C:\\w\\b', name: 'claude-1', status: 'busy', host: 'h1' },
    { sessionId: 'titled', cwd: 'C:\\w\\b', title: 'Mine', status: 'idle' },
    { sessionId: 'old', cwd: 'C:\\w\\a', status: 'idle', host: 'h2' },
    { sessionId: 'nocwd', cwd: '' },
    { sessionId: 'new', cwd: 'C:\\w\\b', name: 'dup' },
  ]);
  c.setOpen(['old']);
  const s = c.snapshot();
  assert.deepEqual(s.rows.map((r) => r.id), ['new', 'titled', 'old']);
  assert.equal(s.rows[0].title, 'yeni sohbet · claude-1');
  assert.equal(s.rows[0].mtime, Infinity);
  assert.equal(s.rows[0].size, 0);
  assert.equal(s.rows[0].lastPrompt, '');
  // the status comes from the last live entry with that id (the duplicate has none)
  assert.equal(s.rows[0].status, undefined);
  assert.equal(s.rows[1].status, 'idle');
  assert.equal(s.rows[1].title, 'Mine');
  assert.equal(s.rows[2].status, 'idle');
  assert.equal(s.rows[2].host, 'h2');
  assert.equal(s.rows[2].open, true);
  assert.equal(s.rows[0].open, false);
  assert.equal(s.saved, 1);
  assert.equal(s.live, 5);
  const none = createChatList({ settings: store() });
  none.setItems([item('x', 'C:\\x', 1)]);
  assert.equal(none.snapshot().rows[0].status, null);
  assert.equal(none.snapshot().rows[0].host, null);
});

test('sort: newest first, equal mtimes keep order', () => {
  const c = createChatList({ settings: store() });
  c.setItems([item('a', 'C:\\x', 1), item('b', 'C:\\x', 3), item('c', 'C:\\x', 3), item('d', 'C:\\x', 2)]);
  assert.deepEqual(c.snapshot().rows.map((r) => r.id), ['b', 'c', 'd', 'a']);
});

test('favorites: toggle, saved, a star unarchives, archiving drops the star', () => {
  const s = store();
  const c = createChatList({ settings: s });
  c.setItems([item('a', 'C:\\x', 1)]);
  c.toggleArchived('a');
  assert.equal(c.snapshot().rows.length, 0);
  c.toggleFavorite('a');
  assert.equal(c.snapshot().rows[0].fav, true);
  assert.deepEqual(s.m.chatList.favorites, ['a']);
  assert.deepEqual(s.m.chatList.archived, []);
  c.toggleFavorite('a');
  assert.equal(c.snapshot().rows[0].fav, false);
  assert.deepEqual(s.m.chatList.favorites, []);
  c.toggleFavorite('a');
  c.toggleArchived('a');
  assert.deepEqual(s.m.chatList.favorites, []);
  assert.deepEqual(s.m.chatList.archived, ['a']);
  c.toggleArchived('a');
  assert.deepEqual(s.m.chatList.archived, []);
  assert.deepEqual(s.m.chatList.restored, [], 'not in an archived folder: nothing restored');
});

test('rename: trimmed, capped at 120, empty brings the title back', () => {
  const s = store();
  const c = createChatList({ settings: s });
  c.setItems([item('a', 'C:\\x', 1)]);
  c.rename('a', '  New  ');
  assert.equal(c.snapshot().rows[0].title, 'New');
  assert.deepEqual(s.m.chatList.titles, { a: 'New' });
  c.rename('a', 'x'.repeat(130));
  assert.equal(c.snapshot().rows[0].title, 'x'.repeat(120));
  c.rename('a', '   ');
  assert.equal(c.snapshot().rows[0].title, 't-a');
  c.rename('a', 'Y');
  c.rename('a', null);
  assert.deepEqual(s.m.chatList.titles, {});
});

test('folder archive: whole folder, a chat taken out, later chats too; folder back restores all', { skip: !WIN }, () => {
  const s = store();
  const c = createChatList({ settings: s });
  const items = [item('a', 'C:\\w\\proj', 3), item('b', 'c:/w/proj/', 2), item('c', 'C:\\w\\other', 1)];
  c.setItems(items);
  c.toggleFavorite('a');
  c.setFolder('C:\\W\\Proj', true);
  assert.deepEqual(c.snapshot().rows.map((r) => r.id), ['c']);
  assert.deepEqual(s.m.chatList.favorites, [], 'folder archive drops stars');
  assert.deepEqual(s.m.chatList.folders, ['c:\\w\\proj']);
  c.toggleArchived('b');
  assert.deepEqual(c.snapshot().rows.map((r) => r.id), ['b', 'c']);
  assert.deepEqual(s.m.chatList.restored, ['b']);
  c.toggleArchived('b');
  assert.deepEqual(s.m.chatList.restored, []);
  assert.deepEqual(s.m.chatList.archived, ['b']);
  // archiving the folder again forgets the chats restored from it
  c.toggleArchived('b');
  c.setFolder('C:\\w\\proj', true);
  assert.deepEqual(s.m.chatList.restored, []);
  c.setItems([...items, item('d', 'C:\\w\\proj', 9)]);
  assert.deepEqual(c.snapshot().rows.map((r) => r.id), ['c']);
  c.restore('d');
  assert.deepEqual(c.snapshot().rows.map((r) => r.id), ['d', 'c']);
  c.setFolder('C:\\w\\proj', false);
  assert.deepEqual(c.snapshot().rows.map((r) => r.id), ['d', 'a', 'b', 'c']);
  assert.deepEqual(s.m.chatList.folders, []);
  assert.deepEqual(s.m.chatList.archived, []);
  assert.deepEqual(s.m.chatList.restored, []);
});

test('restoreAll clears the archive', () => {
  const s = store({ archived: ['a'], folders: [WIN ? 'c:\\x' : 'C:\\x'], restored: ['z'], favorites: ['b'] });
  const c = createChatList({ settings: s });
  c.setItems([item('a', 'C:\\y', 1), item('b', 'C:\\x', 1)]);
  assert.equal(c.snapshot().rows.length, 0);
  c.restoreAll();
  assert.equal(c.snapshot().rows.length, 2);
  assert.deepEqual(s.m.chatList, { favorites: ['b'], archived: [], folders: [], restored: [], titles: {} });
});

test('snapshot folders: labels tell same-named folders apart, home tildified, starred rows not counted', { skip: !WIN }, () => {
  const c = createChatList({ settings: store() });
  c.setItems([
    item('1', `${HOME}\\F1Reels\\x\\05_AI`, 9),
    item('2', `${HOME}\\SecondReels\\x\\05_AI`, 8),
    item('3', 'D:\\solo\\proj', 7),
    item('4', 'D:\\fav\\only', 6),
    item('5', `${HOME}\\F1Reels\\x\\05_AI`, 1),
  ]);
  c.toggleFavorite('4');
  const f = c.snapshot().folders;
  const key = (p) => p.toLowerCase();
  assert.deepEqual(Object.keys(f).sort(), [key(`${HOME}\\F1Reels\\x\\05_AI`), key(`${HOME}\\SecondReels\\x\\05_AI`), key('D:\\solo\\proj')].sort());
  assert.deepEqual(f[key('D:\\solo\\proj')], { label: 'solo\\proj', path: 'D:\\solo\\proj' });
  assert.deepEqual(f[key(`${HOME}\\F1Reels\\x\\05_AI`)], { label: 'F1Reels\\…\\05_AI', path: '~\\F1Reels\\x\\05_AI' });
  assert.equal(f[key(`${HOME}\\SecondReels\\x\\05_AI`)].label, 'SecondReels\\…\\05_AI');
});

test('labels: two-part tails that clash at every length get the whole path; home is "~"', { skip: !WIN }, () => {
  const c = createChatList({ settings: store() });
  c.setItems([item('1', 'C:\\a\\b', 3), item('2', 'D:\\a\\b', 2), item('3', 'c:\\users\\me', 1), item('4', 'E:\\b', 0)]);
  const f = c.snapshot().folders;
  assert.equal(f['c:\\a\\b'].label, 'C:\\…\\b');
  assert.equal(f['d:\\a\\b'].label, 'D:\\…\\b');
  assert.equal(f['c:\\users\\me'].path, '~');
  assert.equal(f['c:\\users\\me'].label, '~');
  assert.equal(f['e:\\b'].label, 'E:\\b');
  // the same tail where both are as long as the label: both get their full (tildified) path
  const d = createChatList({ settings: store() });
  d.setItems([item('1', 'C:\\a\\b', 3), item('2', 'C:/a/b/', 2)]);
  // one folder key: one label
  assert.equal(Object.keys(d.snapshot().folders).length, 1);
});

test('archivedList: by folder, labels, whole flag, titles and times', { skip: !WIN }, () => {
  const c = createChatList({ settings: store() });
  c.setItems([item('a', 'C:\\w\\p', 5), item('b', 'C:\\w\\p', 4, { title: '' }), item('c', 'C:\\w\\q', 3)]);
  c.setLive([{ sessionId: 'n', cwd: 'C:\\w\\q', name: 'x' }]);
  c.rename('a', 'Mine');
  c.setFolder('C:\\w\\p', true);
  c.toggleArchived('n');
  c.toggleArchived('c');
  const before = Date.now();
  const l = c.archivedList();
  assert.deepEqual(l.map((x) => [x.cwd, x.label, x.whole]), [['C:\\w\\q', 'w\\q', false], ['C:\\w\\p', 'w\\p', true]]);
  assert.deepEqual(l[1].chats.map((x) => [x.id, x.title, x.at]), [['a', 'Mine', 5], ['b', 'p-b', 4]]);
  assert.equal(l[0].chats[0].id, 'n');
  assert.equal(l[0].chats[0].title, 'yeni sohbet · x');
  assert.ok(l[0].chats[0].at >= before, 'Infinity mtime becomes now');
  assert.equal(l[0].chats[1].at, 3);
  assert.deepEqual(c.snapshot().rows, []);
});

test('an empty cwd is its own folder with an empty path', () => {
  const c = createChatList({ settings: store() });
  c.setItems([item('a', '', 1)]);
  const s = c.snapshot();
  assert.equal(s.rows.length, 1);
  assert.equal(Object.values(s.folders)[0].path, '');
});
