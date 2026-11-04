'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('../helpers/load');

const V = load('video.js').window.DTVideo;
const plain = (x) => JSON.parse(JSON.stringify(x));
const N = 1_700_000_000_000;
const S = 1000, MIN = 60 * S, H = 60 * MIN, D = 24 * H;

test('video.js does not mount without #video-mount', () => {
  const t = load('video.js', { ids: {} });
  assert.equal(typeof t.window.DTVideo.formatTime, 'function');
});

test('video.js defers init while the document is loading', () => {
  const t = load('video.js', { readyState: 'loading' });
  assert.equal(t.docListeners.DOMContentLoaded.length, 1);
  t.fireDoc('DOMContentLoaded'); // no #video-mount: nothing to mount, no throw
});

test('formatTime', () => {
  assert.equal(V.formatTime(0), '0:00');
  assert.equal(V.formatTime(NaN), '0:00');
  assert.equal(V.formatTime(Infinity), '0:00');
  assert.equal(V.formatTime(-5), '0:00');
  assert.equal(V.formatTime(undefined), '0:00');
  assert.equal(V.formatTime(9.99), '0:09');
  assert.equal(V.formatTime(10), '0:10');
  assert.equal(V.formatTime(59.9), '0:59');
  assert.equal(V.formatTime(60), '1:00');
  assert.equal(V.formatTime('75'), '1:15');
  assert.equal(V.formatTime(610), '10:10');
  assert.equal(V.formatTime(3599), '59:59');
  assert.equal(V.formatTime(3600), '1:00:00');
  assert.equal(V.formatTime(3661), '1:01:01');
  assert.equal(V.formatTime(36000 + 600 + 10), '10:10:10');
});

test('relTime: every unit and its boundary', () => {
  const r = (ago) => V.relTime(N - ago, N);
  assert.equal(r(0), 'az önce');
  assert.equal(r(-10 * MIN), 'az önce'); // future clamps to 0
  assert.equal(r(59 * S + 999), 'az önce');
  assert.equal(r(60 * S), '1 dk önce');
  assert.equal(r(H - 1), '59 dk önce');
  assert.equal(r(H), '1 sa önce');
  assert.equal(r(D - 1), '23 sa önce');
  assert.equal(r(D), '1 gün önce');
  assert.equal(r(7 * D - 1), '6 gün önce');
  assert.equal(r(7 * D), '1 hf önce');
  assert.equal(r(30 * D - 1), '4 hf önce');
  assert.equal(r(30 * D), '1 ay önce');
  assert.equal(r(365 * D - 1), '12 ay önce');
  assert.equal(r(365 * D), '1 yıl önce');
  assert.equal(r(3 * 365 * D), '3 yıl önce');
});

test('relTime: mtime as a date string, missing mtime, default now', () => {
  assert.equal(V.relTime(new Date(N - 2 * MIN).toISOString(), N), '2 dk önce');
  assert.match(V.relTime(null, N), /yıl önce$/); // missing → epoch
  assert.match(V.relTime('', N), /yıl önce$/);
  assert.equal(V.relTime(Date.now()), 'az önce');
  assert.equal(V.relTime(Date.now() - 2 * H, undefined), '2 sa önce');
});

test('isNew: 5 minute window and 1 minute of clock skew', () => {
  assert.equal(V.isNew(N, N), true);
  assert.equal(V.isNew(N - (5 * MIN - 1), N), true);
  assert.equal(V.isNew(N - 5 * MIN, N), false); // exactly 5 min is no longer new
  assert.equal(V.isNew(N - 5 * MIN - 1, N), false);
  assert.equal(V.isNew(N + 60000, N), true); // exactly -60 s still new
  assert.equal(V.isNew(N + 60001, N), false);
  assert.equal(V.isNew(new Date(N - MIN).toISOString(), N), true);
  assert.equal(V.isNew(null, N), false);
  assert.equal(V.isNew(Date.now()), true);
});

test('sortVideos: newest first, input untouched, null-safe', () => {
  const list = [
    { path: 'a', mtime: N - 3 * D },
    { path: 'b', mtime: new Date(N).toISOString() },
    { path: 'c', mtime: N - D },
  ];
  const out = V.sortVideos(list);
  assert.deepEqual(out.map((v) => v.path), ['b', 'c', 'a']);
  assert.deepEqual(list.map((v) => v.path), ['a', 'b', 'c']);
  assert.notEqual(out, list);
  assert.deepEqual(plain(V.sortVideos(null)), []);
  assert.deepEqual(plain(V.sortVideos(undefined)), []);
});

test('baseName', () => {
  assert.equal(V.baseName('C:\\Users\\x\\Renders\\'), 'Renders');
  assert.equal(V.baseName('/home/x/out/final.mp4'), 'final.mp4');
  assert.equal(V.baseName('a/b\\c'), 'c');
  assert.equal(V.baseName('plain'), 'plain');
  assert.equal(V.baseName(''), '');
  assert.equal(V.baseName(null), '');
  assert.equal(V.baseName('/'), '/'); // nothing left after the slash: the input itself
});

test('fmtStamp', () => {
  assert.equal(V.fmtStamp(0), '0:00.0');
  assert.equal(V.fmtStamp(NaN), '0:00.0');
  assert.equal(V.fmtStamp(-1), '0:00.0');
  assert.equal(V.fmtStamp('2.5'), '0:02.5');
  assert.equal(V.fmtStamp(1.25), '0:01.3');
  assert.equal(V.fmtStamp(9.9), '0:09.9');
  assert.equal(V.fmtStamp(10), '0:10.0');
  assert.equal(V.fmtStamp(59.96), '1:00.0');
  assert.equal(V.fmtStamp(600), '10:00.0');
  assert.equal(V.fmtStamp(3599.9), '59:59.9');
  assert.equal(V.fmtStamp(3600), '1:00:00.0');
  assert.equal(V.fmtStamp(3725.4), '1:02:05.4');
});

test('frameOf', () => {
  assert.equal(V.frameOf(1, 30), 30);
  assert.equal(V.frameOf(1, '25'), 25);
  assert.equal(V.frameOf(1), 30);
  assert.equal(V.frameOf(1, 0), 30);
  assert.equal(V.frameOf(1, -24), 30);
  assert.equal(V.frameOf(1, 'x'), 30);
  assert.equal(V.frameOf(0.5, 24), 12);
  assert.equal(V.frameOf(0.51, 24), 12);
  assert.equal(V.frameOf(0.53, 24), 13);
  assert.equal(V.frameOf(NaN, 30), 0);
  assert.equal(V.frameOf(Infinity, 30), 0);
  assert.equal(V.frameOf(-2, 30), 0);
});

test('sortNotes: by time ascending, missing t = 0, input untouched', () => {
  const notes = [{ t: 5, text: 'c' }, { text: 'a' }, { t: 2, text: 'b' }];
  assert.deepEqual(V.sortNotes(notes).map((n) => n.text), ['a', 'b', 'c']);
  assert.deepEqual(notes.map((n) => n.text), ['c', 'a', 'b']);
  assert.deepEqual(plain(V.sortNotes(null)), []);
});

test('noteLabel: known fps, unknown fps, ranges', () => {
  assert.equal(V.noteLabel({ t: 1, fps: 25 }), '0:01.0 (kare 25)');
  assert.equal(V.noteLabel({ t: 1 }), '0:01.0 (kare ~30)');
  assert.equal(V.noteLabel({ t: 1, fps: 0 }), '0:01.0 (kare ~30)');
  assert.equal(V.noteLabel({ t: 1, end: 2, fps: 25 }), '0:01.0–0:02.0 (kare 25–50)');
  assert.equal(V.noteLabel({ t: 1, end: 2 }), '0:01.0–0:02.0 (kare ~30–~60)');
  assert.equal(V.noteLabel({ t: 2, end: 2, fps: 25 }), '0:02.0 (kare 50)'); // empty range = a point
  assert.equal(V.noteLabel({ t: 2, end: 1, fps: 25 }), '0:02.0 (kare 50)');
  assert.equal(V.noteLabel({ t: 2, end: null, fps: 25 }), '0:02.0 (kare 50)');
  assert.equal(V.noteLabel({ t: 0, end: 0.1, fps: 30 }), '0:00.0–0:00.1 (kare 0–3)');
});

test('buildRevisionPrompt', () => {
  const p = V.buildRevisionPrompt('D:\\out\\v.mp4', [
    { t: 3, text: '  ikinci\n  satır  ' },
    { t: 1, end: 2, fps: 25, text: 'ilk' },
    { t: 4 },
  ]);
  assert.equal(p, [
    'Şu videoda revizyonlar: D:\\out\\v.mp4',
    '- 0:01.0–0:02.0 (kare 25–50): ilk',
    '- 0:03.0 (kare ~90): ikinci satır',
    '- 0:04.0 (kare ~120): ',
    'Her zaman damgasındaki değişikliği yap, sonra yeniden render al.',
  ].join('\n'));
  assert.equal(V.buildRevisionPrompt(null, null),
    'Şu videoda revizyonlar: \nHer zaman damgasındaki değişikliği yap, sonra yeniden render al.');
});
