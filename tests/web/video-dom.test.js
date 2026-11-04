'use strict';
// video.js mounted into #video-mount: folder menu, list + group filters, render notifications, the player controls,
// revision notes (single + range, edit, delete, send/copy), QC chips, compare (side/wipe), frame grab and registered
// toolbar actions, all against a fake "radar" bridge. jsdom's <video> does nothing, so each test stubs the element.
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeDom } = require('./dom');

const DIR = '/p/Kaya';
const NOW = Date.now();
const vid = (name, group, ago, over = {}) => {
  const sub = { final: 'Render', onizleme: 'Assets/Onizleme', videolar: 'Videolar', klasor: '' }[group];
  const path = `${DIR}/${sub ? sub + '/' : ''}${name}`;
  return { path, name, url: 'file://' + path, group, mtime: NOW - ago, fps: 25, ...over };
};
const LIST = () => [vid('a.mp4', 'final', 3600_000), vid('b.mp4', 'onizleme', 60_000), vid('c.mp4', 'videolar', 86400_000)];

function stubVideo(w, v, dur = 10) {
  let paused = true, t = 0;
  Object.defineProperty(v, 'paused', { get: () => paused, configurable: true });
  Object.defineProperty(v, 'duration', { value: dur, writable: true, configurable: true });
  Object.defineProperty(v, 'currentTime', { get: () => t, set: (x) => { t = x; }, configurable: true });
  Object.defineProperty(v, 'videoWidth', { value: 1080, writable: true, configurable: true });
  Object.defineProperty(v, 'videoHeight', { value: 1920, configurable: true });
  v.play = () => { paused = false; v.dispatchEvent(new w.Event('play')); return w.Promise.resolve(); };
  v.pause = () => { if (!paused) { paused = true; v.dispatchEvent(new w.Event('pause')); } };
  v.load = () => {};
}

function boot(opts = {}) {
  const state = { list: opts.list || LIST(), qc: opts.qc, frame: opts.frame };
  const reply = (m) => {
    if (opts.answers && opts.answers[m.type]) return opts.answers[m.type](m);
    switch (m.type) {
      case 'videoList': return state.list;
      case 'videoSessionDirs': return ['/p/Kaya', '/p/Other/'];
      case 'videoPickFolder': return '/p/Picked';
      case 'videoQC': return state.qc !== undefined ? state.qc : { ok: true, chips: [{ label: 'LUFS', value: '-14', status: 'ok', tip: 't' }, { label: 'Br', value: '9', status: 'warn' }] };
      case 'videoSaveFrame': return state.frame !== undefined ? state.frame : { ok: true, path: '/p/Kaya/kare.png' };
      default: return null;
    }
  };
  const storage = opts.dir === null ? { ...(opts.storage || {}) } : { 'video.dir': opts.dir || DIR, ...(opts.storage || {}) };
  const d = makeDom({ page: '<html><body><div id="video-mount"></div></body></html>', reply: opts.noRadar ? {} : { radar: reply }, storage, globals: opts.globals, noWebkit: opts.noWebkit });
  if (opts.pre) opts.pre(d);
  // The DTVideo object is created at load; the stage is built on DOMContentLoaded. Stub <video> in between.
  const proto = d.window.HTMLMediaElement.prototype;
  const origCreate = d.document.createElement.bind(d.document);
  d.document.createElement = (tag, ...a) => { const e = origCreate(tag, ...a); if (String(tag).toLowerCase() === 'video') stubVideo(d.window, e); return e; };
  d.run('video.js');
  d.document.dispatchEvent(new d.window.Event('DOMContentLoaded'));
  void proto;
  d.state = state;
  d.radar = (type) => d.posted.filter((m) => m.via === 'radar' && (!type || m.type === type));
  d.video = d.$('.dtv-frame > video:not(.dtv-v2)');
  d.video2 = d.$('.dtv-v2');
  d.ctrl = d.$$('.dtv-ctrl > button'); // play, loop, mute, speed, safe, reveal
  d.items = () => d.$$('.dtv-list .dtv-item');
  d.toast = () => d.$('.dtv-toast').textContent;
  d.btn = (sel, text) => d.$$(sel).find((b) => b.textContent.includes(text));
  return d;
}
async function ready(opts) {
  const d = boot(opts);
  await d.flush();
  return d;
}

test('init without a mount point does nothing; DTVideoActions queued before load are registered', () => {
  const d = makeDom({ page: '<html><body></body></html>', globals: { DTVideoActions: [{ id: 'q', run() {} }, { bad: true }] } });
  try {
    d.run('video.js');
    d.document.dispatchEvent(new d.window.Event('DOMContentLoaded'));
    assert.equal(d.$('.dtv'), null);
    assert.equal(typeof d.window.DTVideo.registerAction, 'function');
    assert.throws(() => d.window.DTVideo.registerAction({ id: 'x' }), /registerAction/);
    d.window.DTVideoActions.push({ nope: 1 }); // swallowed
  } finally { d.close(); }
});

test('DTVideo.classifyVideoPath groups paths under the project root', () => {
  const d = makeDom({ page: '<html><body></body></html>' });
  try {
    d.run('video.js');
    const c = d.window.DTVideo.classifyVideoPath;
    assert.equal(c('/p/Kaya', '/p/Kaya/Render/a.mp4'), 'final');
    assert.equal(c('/p/Kaya', '/p/Kaya/Videolar/x/a.mov'), 'videolar');
    assert.equal(c('/p/Kaya', '/p/Kaya/Assets/Önizleme/a.webm'), 'onizleme');
    assert.equal(c('/p/Kaya', '/p/Kaya/a.m4v'), 'klasor');
    assert.equal(c('/p/Kaya', '/p/Kaya/Other/a.mp4'), null);
    assert.equal(c('/p/Kaya', '/p/Kaya/a.txt'), null);
    assert.equal(c('/p/Kaya', '/q/Kaya/a.mp4'), null);
    assert.equal(c('', '/p/a.mp4'), null);
    assert.equal(c('/p/Kaya/Render', '/p/Kaya/Render/a.mp4'), 'final');
    assert.equal(c('/p/Kaya/Render', '/p/Kaya/Render/1/2/3/4/a.mp4'), null);
  } finally { d.close(); }
});

test('no folder: empty state, clicking it opens the folder menu; picking a folder loads and watches it', async (t) => {
  const d = await ready({ dir: null });
  t.after(d.close);
  const empty = d.$('.dtv-empty');
  assert.match(empty.textContent, /bir klasör seç/);
  assert.equal(empty.style.display, 'flex');
  d.click(empty);
  await d.flush();
  const menu = d.$('.dtv-menu');
  assert.ok(menu.classList.contains('open'));
  const btns = [...menu.querySelectorAll('button')];
  assert.deepEqual(btns.map((b) => b.textContent), ['Kaya', 'Other', 'Klasör seç…']);
  d.click(btns[2]);
  await d.flush();
  assert.equal(d.radar('videoPickFolder').length, 1);
  assert.deepEqual(d.radar('videoWatch').at(-1), { type: 'videoWatch', dir: '/p/Picked', via: 'radar' });
  assert.equal(d.$('.dtv-chip span').textContent, 'Picked');
  assert.equal(d.window.localStorage.getItem('video.dir'), '/p/Picked');
  // chip toggles the menu; outside click closes it
  d.click('.dtv-chip');
  assert.ok(menu.classList.contains('open'));
  d.click('.dtv-chip');
  assert.ok(!menu.classList.contains('open'));
  d.click('.dtv-chip');
  await d.flush();
  d.click(d.document.body);
  assert.ok(!menu.classList.contains('open'));
  d.click('.dtv-chip');
  await d.flush();
  d.click(menu.querySelector('button')); // session dir
  await d.flush();
  assert.equal(d.radar('videoWatch').at(-1).dir, '/p/Kaya');
});

test('list: filters, counts, selection of the newest, QC chips and reveal', async (t) => {
  const d = await ready({ storage: { 'video.filter': 'all' } });
  t.after(d.close);
  assert.deepEqual(d.radar('videoList')[0], { type: 'videoList', dir: DIR, via: 'radar' });
  const segs = d.$$('.dtv-segb').map((b) => b.textContent);
  assert.deepEqual(segs, ['Final 1', 'Önizleme 1', 'Videolar 1', 'Tümü 3']);
  // Tümü: Final first
  assert.deepEqual(d.items().map((i) => i.title), ['a.mp4', 'b.mp4', 'c.mp4']);
  assert.ok(d.items()[1].querySelector('.dtv-new'), 'b is new');
  // newest (b) is selected, not autoplayed
  assert.ok(d.items()[1].classList.contains('sel'));
  assert.equal(d.video.getAttribute('src'), 'file:///p/Kaya/Assets/Onizleme/b.mp4');
  assert.ok(d.video.paused);
  // QC rendered
  const chips = d.$$('.dtv-qcchip');
  assert.equal(chips.length, 2);
  assert.equal(d.$('.dtv-qc').dataset.worst, 'warn');
  // filter to Final
  d.click(d.$$('.dtv-segb')[0]);
  assert.deepEqual(d.items().map((i) => i.title), ['a.mp4']);
  assert.equal(d.window.localStorage.getItem('video.filter'), 'final');
  // clicking an item selects + autoplays
  d.click(d.items()[0]);
  await d.flush();
  assert.equal(d.video.getAttribute('src'), 'file:///p/Kaya/Render/a.mp4');
  assert.ok(!d.video.paused);
  assert.equal(d.ctrl[0].textContent, '❚❚');
  d.click(d.ctrl[5]);
  assert.equal(d.radar('videoReveal').at(-1).path, '/p/Kaya/Render/a.mp4');
  // QC cache: reselecting does not re-measure
  const qcCount = d.radar('videoQC').length;
  d.click(d.$$('.dtv-segb')[3]);
  d.click(d.items()[1]); await d.flush();
  d.click(d.items()[0]); await d.flush();
  assert.equal(d.radar('videoQC').length, qcCount, 'b and a are cached');
  assert.equal(d.radar('videoQC').filter((m) => m.path.endsWith('a.mp4')).length, 1);
  // empty group message
  d.state.list = [vid('a.mp4', 'final', 3600_000)];
  d.click(d.$('.dtv-btn[title="Yenile"]'));
  await d.flush();
  d.click(d.$$('.dtv-segb')[2]);
  assert.equal(d.$('.dtv-empty').textContent, 'Bu grupta video yok');
});

test('empty folder message, bad QC and writing videos', async (t) => {
  const d = await ready({ list: [], qc: { ok: false, error: 'ffprobe yok' } });
  t.after(d.close);
  assert.match(d.$('.dtv-empty').textContent, /bulunamadı/);
  assert.ok(!d.$('.dtv-qc').classList.contains('show'));
  d.state.list = [vid('w.mp4', 'final', 0, { writing: true }), vid('x.mp4', 'videolar', 7200_000)];
  d.window.dispatchEvent(new d.window.CustomEvent('dt-videos-changed', { detail: { dir: '/elsewhere' } }));
  await d.flush();
  assert.equal(d.items().length, 0, 'other dir ignored');
  d.window.dispatchEvent(new d.window.CustomEvent('dt-videos-changed', { detail: { dir: DIR } }));
  await d.flush();
  assert.equal(d.items().length, 2);
  assert.ok(d.items()[0].classList.contains('writing'));
  assert.match(d.items()[0].textContent, /render ediliyor/);
  assert.match(d.$('.dtv-qcmsg.bad').textContent, /QC yapılamadı: ffprobe yok/);
  // a writing video's QC waits
  d.click(d.items()[0]);
  await d.flush();
  assert.match(d.$('.dtv-qc').textContent, /Render bitince/);
  assert.ok(d.video.paused, 'writing video does not autoplay');
  // polling while writing
  const n = d.radar('videoList').length;
  d.tick(2500);
  await d.flush();
  assert.equal(d.radar('videoList').length, n + 1);
});

test('new render: notification, sound, filter switch, autoplay, toast; bell toggles it off', async (t) => {
  const played = [];
  const d = await ready({ storage: { 'video.filter': 'videolar' }, globals: { Sfx: { play: (s) => played.push(s) } } });
  t.after(d.close);
  d.state.list = [...LIST(), vid('new.mp4', 'final', 0), vid('new2.mp4', 'onizleme', 1000), vid('w.mp4', 'final', 0, { writing: true })];
  d.window.dispatchEvent(new d.window.CustomEvent('dt-videos-changed', { detail: {} }));
  await d.flush();
  const n = d.radar('videoNotify').at(-1);
  assert.equal(n.title, 'Render hazır: new.mp4');
  assert.match(n.body, /Final · \+1 dosya daha/);
  assert.deepEqual(played, ['message']);
  assert.equal(d.window.localStorage.getItem('video.filter'), 'final');
  assert.equal(d.toast(), 'Render hazır: new.mp4');
  assert.ok(d.$('.dtv-toast').classList.contains('show'));
  d.tick(3200);
  assert.ok(!d.$('.dtv-toast').classList.contains('show'));
  assert.ok(!d.video.paused);
  // bell off: next render only selects + toasts "Yeni render"
  const bell = d.$('.dtv-bell');
  assert.ok(bell.classList.contains('on'));
  d.click(bell);
  assert.equal(bell.textContent, '🔕');
  assert.equal(d.window.localStorage.getItem('video.notify'), '0');
  d.state.list = [...d.state.list.filter((v) => !v.writing), vid('new3.mp4', 'final', -1000)];
  d.click(d.$('.dtv-btn[title="Yenile"]'));
  await d.flush();
  assert.equal(d.radar('videoNotify').length, 1);
  assert.equal(d.toast(), 'Yeni render: new3.mp4');
  // relative time refresh + YENİ badge removal
  d.state.list.forEach((v) => { v.mtime -= 10 * 60_000; });
  d.tick(30000);
  assert.equal(d.items().filter((i) => i.querySelector('.dtv-new')).length, 0);
});

test('player controls: play/pause, scrub, loop, mute, speed, safe area, keyboard seek', async (t) => {
  const d = await ready();
  t.after(d.close);
  const [bPlay, bLoop, bMute, bSpeed, bSafe] = d.ctrl;
  d.click(bPlay);
  assert.ok(!d.video.paused);
  d.click(d.video); // click on video toggles too
  assert.ok(d.video.paused);
  assert.equal(bPlay.textContent, '▶');
  const scrub = d.$('.dtv-scrub');
  d.type(scrub, '500');
  assert.equal(d.video.currentTime, 5);
  assert.equal(d.$('.dtv-time').textContent, '0:05 / 0:10');
  d.fire(scrub, 'change');
  d.video.currentTime = 2; d.fire(d.video, 'timeupdate');
  assert.equal(scrub.value, '200');
  d.click(bLoop); assert.equal(d.video.loop, false); assert.ok(!bLoop.classList.contains('on'));
  d.click(bMute); assert.equal(d.video.muted, true); assert.equal(bMute.textContent, '🔇');
  d.click(bSpeed); assert.equal(d.video.playbackRate, 1.5); assert.equal(bSpeed.textContent, '1.5×');
  d.click(bSafe); assert.ok(d.$('.dtv-safe').classList.contains('on'));
  const wrap = d.$('.dtv');
  d.key(' ', {}, wrap); assert.ok(!d.video.paused);
  d.key('ArrowRight', {}, wrap); assert.equal(d.video.currentTime, 3);
  d.key('ArrowLeft', {}, wrap); d.key('ArrowLeft', {}, wrap); d.key('ArrowLeft', {}, wrap); d.key('ArrowLeft', {}, wrap);
  assert.equal(d.video.currentTime, 0);
  // leaving the tab / hiding pauses
  d.window.dispatchEvent(new d.window.CustomEvent('studio-tab', { detail: 'presets' }));
  assert.ok(d.video.paused);
  d.video.play();
  Object.defineProperty(d.document, 'hidden', { value: true, configurable: true });
  d.document.dispatchEvent(new d.window.Event('visibilitychange'));
  assert.ok(d.video.paused);
  // typing in an input does not trigger shortcuts
  const inp = d.$('.dtv-ninput input');
  d.key(' ', {}, inp);
  assert.ok(d.video.paused);
});

test('notes: add, range by button and by holding S, edit, delete, persist, send to chat', async (t) => {
  const sent = [];
  const d = await ready({ globals: { DT: { sendPrompt: (txt, o) => { sent.push([txt, o]); return { ok: true }; } } }, storage: { 'video.waitBeforeSend': '0' } });
  t.after(d.close);
  const wrap = d.$('.dtv');
  const nText = d.$('.dtv-ninput input');
  const bSend = d.btn('.dtv-nfoot button', "Claude'a");
  assert.ok(bSend.disabled);
  d.video.currentTime = 1.5;
  d.key('n', {}, wrap);
  assert.ok(d.$('.dtv-ninput').classList.contains('open'));
  assert.equal(d.$('.dtv-ninput .dtv-nstamp').textContent, '0:01.5 (kare 38)');
  d.tick(0);
  d.type(nText, '  logo büyüt ');
  d.key('Enter', {}, nText);
  assert.ok(!d.$('.dtv-ninput').classList.contains('open'));
  // range via the button
  const bRange = d.btn('.dtv-nbar button', 'Aralık');
  d.video.currentTime = 4;
  d.click(bRange);
  assert.equal(bRange.textContent, 'Bitir (0:04.0)');
  d.video.currentTime = 6;
  d.click(bRange);
  d.type(nText, 'renk');
  d.key('Enter', {}, nText);
  // range by holding S (reversed), and a too-short one becomes a point note
  d.video.currentTime = 8; d.key('s', {}, wrap);
  d.video.currentTime = 7; d.fire(wrap, 'keyup', { key: 's' });
  d.type(nText, 'yazı'); d.key('Enter', {}, nText);
  d.video.currentTime = 9; d.key('S', {}, wrap); d.fire(wrap, 'keyup', { key: 'S' });
  assert.doesNotMatch(d.$('.dtv-ninput .dtv-nstamp').textContent, /–/);
  d.key('Escape', {}, nText);
  assert.ok(!d.$('.dtv-ninput').classList.contains('open'));
  const key = 'video.notes:/p/Kaya/Assets/Onizleme/b.mp4';
  const saved = JSON.parse(d.window.localStorage.getItem(key));
  assert.deepEqual(saved.map((n) => n.text), ['logo büyüt', 'renk', 'yazı']);
  assert.deepEqual(saved[1], { t: 4, end: 6, fps: 25, text: 'renk' });
  assert.equal(d.$$('.dtv-note').length, 3);
  assert.equal(d.$$('.dtv-mark').length, 3);
  assert.equal(d.$$('.dtv-mark.rng').length, 2);
  // clicking a mark / row seeks and pauses
  d.click(d.$$('.dtv-mark')[1]);
  assert.equal(d.video.currentTime, 4);
  d.video.currentTime = 0;
  d.click(d.$$('.dtv-note')[2]);
  assert.equal(d.video.currentTime, 7);
  // edit
  d.click(d.$$('.dtv-note')[0].querySelectorAll('.dtv-ib')[0]);
  assert.equal(nText.value, 'logo büyüt');
  d.type(nText, 'logo küçült'); d.key('Enter', {}, nText);
  assert.equal(d.$$('.dtv-note .tx')[0].textContent, 'logo küçült');
  // delete
  d.click(d.$$('.dtv-note')[2].querySelectorAll('.dtv-ib')[1]);
  assert.equal(d.$$('.dtv-note').length, 2);
  // send (submit since wait is off)
  assert.equal(d.$('.dtv-wait input').checked, false);
  d.click(bSend);
  await d.flush();
  assert.match(sent[0][0], /^Şu videoda revizyonlar: \/p\/Kaya\/Assets\/Onizleme\/b\.mp4\n- 0:01\.5 \(kare 38\): logo küçült\n- 0:04\.0–0:06\.0/);
  assert.equal(sent[0][1].submit, true);
  assert.equal(d.toast(), 'Sohbete gönderildi');
  // wait checkbox persists and changes the toast
  const cb = d.$('.dtv-wait input'); cb.checked = true; d.fire(cb, 'change');
  assert.equal(d.window.localStorage.getItem('video.waitBeforeSend'), '1');
  d.click(bSend); await d.flush();
  assert.equal(sent[1][1].submit, false);
  assert.match(d.toast(), /yapıştırıldı/);
  // notes reload when coming back to the video
  d.click(d.items()[0]); await d.flush();
  assert.equal(d.$$('.dtv-note').length, 0);
  d.click(d.items()[1]); await d.flush();
  assert.equal(d.$$('.dtv-note').length, 2);
  // clear all, with confirm
  d.window.confirm = () => false;
  d.click(d.btn('.dtv-nfoot button', 'Tümünü sil'));
  assert.equal(d.$$('.dtv-note').length, 2);
  d.window.confirm = () => true;
  d.click(d.btn('.dtv-nfoot button', 'Tümünü sil'));
  assert.equal(d.$$('.dtv-note').length, 0);
  assert.equal(d.window.localStorage.getItem(key), null);
});

test('copy paths: clipboard, execCommand fallback, failing send falls back to copy', async (t) => {
  const copied = [];
  let mode = 'ok';
  const d = await ready({ globals: { DT: { sendPrompt: () => (mode === 'false' ? false : Promise.reject(new Error('x'))) } } });
  t.after(d.close);
  Object.defineProperty(d.window.navigator, 'clipboard', { value: { writeText: (s) => { copied.push(s); return d.window.Promise.resolve(); } }, configurable: true });
  d.video.currentTime = 3.25;
  d.click(d.btn('.dtv-nbar button', 'zamanı kopyala'));
  await d.flush();
  assert.deepEqual(copied, ['0:03.3']);
  assert.equal(d.toast(), 'Kopyalandı: 0:03.3');
  // add a note via the button, then copy / send
  d.click(d.btn('.dtv-nbar button', 'Not ekle'));
  const nText = d.$('.dtv-ninput input');
  d.type(nText, 'x'); d.key('Enter', {}, nText);
  d.click(d.btn('.dtv-nfoot button', 'Kopyala'));
  await d.flush();
  assert.match(copied.at(-1), /^Şu videoda revizyonlar/);
  assert.equal(d.toast(), 'Revizyon metni kopyalandı');
  mode = 'false';
  d.click(d.btn('.dtv-nfoot button', "Claude'a")); await d.flush();
  assert.equal(d.toast(), 'Gönderilemedi — panoya kopyalandı');
  mode = 'reject';
  d.toast(); d.$('.dtv-toast').textContent = '';
  d.click(d.btn('.dtv-nfoot button', "Claude'a")); await d.flush();
  assert.equal(d.toast(), 'Gönderilemedi — panoya kopyalandı');
  // no clipboard: execCommand fallback (works, then fails)
  Object.defineProperty(d.window.navigator, 'clipboard', { value: undefined, configurable: true });
  d.document.execCommand = () => true;
  d.window.DT = null;
  d.click(d.btn('.dtv-nfoot button', "Claude'a")); await d.flush();
  assert.equal(d.toast(), 'Sohbet bağlantısı yok — panoya kopyalandı');
  assert.equal(d.$$('textarea').length, 0, 'temp textarea removed');
  d.document.execCommand = () => { throw new Error('no'); };
  d.click(d.btn('.dtv-nfoot button', 'Kopyala'));
  assert.equal(d.toast(), 'Kopyalanamadı');
});

test('compare: pick B, side ↔ wipe, sync with A, close; nothing to compare', async (t) => {
  const d = await ready();
  t.after(d.close);
  const bCmp = d.btn('.dtv-tools button', 'Karşılaştır');
  d.click(bCmp);
  const menu = d.$('.dtv-cmpmenu');
  assert.ok(menu.classList.contains('open'));
  const opts = [...menu.querySelectorAll('button')].map((b) => b.textContent);
  assert.deepEqual(opts, ['Final · a.mp4', 'Videolar · c.mp4']);
  d.click(bCmp); // toggles closed
  assert.ok(!menu.classList.contains('open'));
  d.click(bCmp);
  d.click(menu.querySelector('button'));
  const frame = d.$('.dtv-frame');
  assert.ok(frame.classList.contains('cmp-side'));
  assert.equal(d.video2.getAttribute('src'), 'file:///p/Kaya/Render/a.mp4');
  assert.match(d.$('.dtv-cmplbl').textContent, /A: b\.mp4 .* B: a\.mp4/);
  // B follows A
  d.video.currentTime = 3;
  d.fire(d.video2, 'loadedmetadata');
  assert.equal(d.video2.currentTime, 3);
  d.video.play();
  assert.ok(!d.video2.paused);
  d.video.currentTime = 4; d.fire(d.video, 'timeupdate');
  assert.equal(d.video2.currentTime, 4);
  d.video.pause();
  assert.ok(d.video2.paused);
  d.video.currentTime = 20; d.fire(d.video, 'seeked');
  assert.equal(d.video2.currentTime, 9.95);
  d.video.playbackRate = 2; d.fire(d.video, 'ratechange');
  assert.equal(d.video2.playbackRate, 2);
  // wipe mode
  const bMode = d.btn('.dtv-tools button', 'Perde');
  d.click(bMode);
  assert.ok(frame.classList.contains('cmp-wipe'));
  assert.equal(d.window.localStorage.getItem('video.cmpMode'), 'wipe');
  d.type('.dtv-wipe', '30');
  assert.equal(frame.style.getPropertyValue('--wipe'), '30%');
  // selecting B as A stops compare
  d.click(d.items()[0]); await d.flush();
  assert.ok(!frame.classList.contains('cmp'));
  // start again and close via the button
  d.click(bCmp); d.click(menu.querySelector('button'));
  assert.ok(frame.classList.contains('cmp-wipe'));
  d.click(bCmp);
  assert.ok(!frame.classList.contains('cmp'));
  assert.equal(bCmp.textContent, '⇆ Karşılaştır');
  // only one finished video: nothing to compare
  d.state.list = [vid('a.mp4', 'final', 3600_000)];
  d.click(d.$('.dtv-btn[title="Yenile"]')); await d.flush();
  d.click(bCmp);
  assert.match(menu.textContent, /başka video yok/);
  d.click(d.document.body);
  assert.ok(!menu.classList.contains('open'));
});

test('compare and grab need a selection', async (t) => {
  const d = await ready({ list: [] });
  t.after(d.close);
  d.click(d.btn('.dtv-tools button', 'Karşılaştır'));
  assert.equal(d.toast(), 'Önce bir video seç');
  d.$('.dtv-toast').textContent = '';
  d.key('f', {}, d.$('.dtv'));
  assert.equal(d.toast(), 'Önce bir video seç');
  // note button without a video does nothing
  d.click(d.btn('.dtv-nbar button', 'Not ekle'));
  assert.ok(!d.$('.dtv-ninput').classList.contains('open'));
  d.click(d.btn('.dtv-nbar button', 'Aralık'));
  assert.equal(d.btn('.dtv-nbar button', 'Aralık').textContent, 'Aralık');
});

test('frame grab: save, result bar actions, errors', async (t) => {
  const sent = [];
  const d = await ready({ globals: { DT: { sendPrompt: (txt, o) => { sent.push([txt, o]); return true; } } } });
  t.after(d.close);
  Object.defineProperty(d.window.navigator, 'clipboard', { value: { writeText: () => d.window.Promise.resolve() }, configurable: true });
  d.video.currentTime = 2;
  d.key('F', {}, d.$('.dtv'));
  await d.flush();
  const m = d.radar('videoSaveFrame').at(-1);
  assert.equal(m.path, '/p/Kaya/Assets/Onizleme/b.mp4');
  assert.equal(m.t, 2);
  const bar = d.$('.dtv-grab');
  assert.ok(bar.classList.contains('show'));
  assert.match(bar.textContent, /0:02\.0.*kare\.png/);
  d.click(d.btn('.dtv-grab button', 'Yolu kopyala')); await d.flush();
  assert.equal(d.toast(), 'Yol kopyalandı');
  d.click(d.btn('.dtv-grab button', 'Sohbete gönder')); await d.flush();
  assert.match(sent[0][0], /Bu karede \(0:02\.0\)/);
  assert.equal(sent[0][1].submit, false);
  assert.ok(!bar.classList.contains('show'));
  // close button; failing send copies; no DT copies
  d.click(d.btn('.dtv-tools button', 'Kare al')); await d.flush();
  d.click(d.$('.dtv-grab .dtv-ib'));
  assert.ok(!bar.classList.contains('show'));
  d.click(d.btn('.dtv-tools button', 'Kare al')); await d.flush();
  d.window.DT = { sendPrompt: () => ({ ok: false }) };
  d.click(d.btn('.dtv-grab button', 'Sohbete gönder')); await d.flush();
  assert.equal(d.toast(), 'Gönderilemedi — panoya kopyalandı');
  d.window.DT = { sendPrompt: () => { throw new Error('x'); } };
  d.$('.dtv-toast').textContent = '';
  d.click(d.btn('.dtv-grab button', 'Sohbete gönder')); await d.flush();
  assert.equal(d.toast(), 'Gönderilemedi — panoya kopyalandı');
  d.window.DT = undefined;
  d.click(d.btn('.dtv-grab button', 'Sohbete gönder')); await d.flush();
  assert.equal(d.toast(), 'Sohbet bağlantısı yok — panoya kopyalandı');
  // save error
  d.state.frame = { ok: false, error: 'disk dolu' };
  d.click(d.btn('.dtv-tools button', 'Kare al')); await d.flush();
  assert.equal(d.toast(), 'Kare kaydedilemedi: disk dolu');
  assert.equal(d.btn('.dtv-tools button', 'Kare al').disabled, false);
});

test('registered actions: group filter, context, busy state, rejection toast, unregister', async (t) => {
  const d = await ready();
  t.after(d.close);
  const DTV = d.window.DTVideo;
  const calls = [];
  let rejectNext = false;
  const off = DTV.registerAction({ id: 'teslim', label: 'Teslim', icon: '📦', groups: ['final'], run: (v) => { calls.push(v); return rejectNext ? Promise.reject(new Error('olmadı')) : undefined; } });
  DTV.registerAction({ id: 'any', run: () => { throw 'x'; } });
  const acts = () => d.$$('.dtv-acts button').map((b) => b.textContent);
  assert.deepEqual(acts(), ['any'], 'teslim hidden for an Önizleme video');
  d.click(d.items()[0]); await d.flush();
  assert.deepEqual(acts(), ['📦 Teslim', 'any']);
  d.video.currentTime = 1;
  d.click(d.$$('.dtv-acts button')[0]);
  assert.ok(d.$$('.dtv-acts button')[0].classList.contains('busy'));
  await d.flush();
  assert.equal(calls[0].path, '/p/Kaya/Render/a.mp4');
  assert.equal(calls[0].currentTime, 1);
  assert.equal(calls[0].duration, 10);
  assert.equal(calls[0].element, d.video);
  assert.ok(!d.$$('.dtv-acts button')[0].classList.contains('busy'));
  rejectNext = true;
  d.click(d.$$('.dtv-acts button')[0]); await d.flush();
  assert.equal(d.toast(), 'Teslim: olmadı');
  d.click(d.$$('.dtv-acts button')[1]); await d.flush();
  assert.equal(d.toast(), 'any: hata');
  off();
  assert.deepEqual(acts(), ['any']);
});

test('dt:videoDir event switches folders; stale replies are dropped; no bridge is harmless', async (t) => {
  let resolveFirst;
  let n = 0;
  const d = await ready({ dir: null, answers: { videoList: () => (++n === 1 ? new Promise((r) => { resolveFirst = r; }) : [vid('z.mp4', 'final', 0)]) } });
  t.after(d.close);
  d.window.dispatchEvent(new d.window.CustomEvent('dt:videoDir', { detail: { dir: '/p/A' } }));
  d.window.dispatchEvent(new d.window.CustomEvent('dt:videoDir', { detail: { dir: '/p/B' } }));
  await d.flush();
  resolveFirst(LIST());
  await d.flush();
  assert.deepEqual(d.items().map((i) => i.title), ['z.mp4']);
  assert.equal(d.radar('videoUnwatch').length, 2);
  const nb = await ready({ noWebkit: true });
  t.after(nb.close);
  assert.equal(nb.items().length, 0);
  assert.match(nb.$('.dtv-empty').textContent, /bulunamadı/);
});
