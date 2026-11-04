'use strict';
// deliver.js: the Videos tab's "Teslim paketi" / "Premiere'de aç" / "Markerları getir" actions (DTVideo.registerAction).
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeDom } = require('./dom');

// A DTVideo stub that records the actions it is given.
function boot(opts = {}) {
  const actions = {};
  const prompts = [];
  const globals = { ...(opts.globals || {}) };
  if (!opts.lateVideo) globals.DTVideo = { registerAction: (a) => { actions[a.id] = a; } };
  if (opts.prompt !== false) globals.DT = { sendPrompt: opts.sendPrompt || ((t, o) => { prompts.push([t, o]); }) };
  const d = makeDom({ reply: opts.reply || {}, storage: opts.storage, globals, noWebkit: opts.noWebkit });
  d.run('deliver.js');
  return { ...d, actions, prompts };
}
const VIDEO = { path: 'D:\\İşler\\Kaya\\1\\Render\\final.mp4', name: 'final.mp4', group: 'final' };
const btn = (d, text) => d.$$('.dtd-modal button').find((b) => b.textContent === text);

test('registers three actions with DTVideo', () => {
  const d = boot();
  assert.deepEqual(Object.keys(d.actions), ['deliver', 'premiere-open', 'premiere-markers']);
  assert.deepEqual([...d.actions.deliver.groups], ['final']);
  d.close();
});

test('Premiere actions write a prompt into the chat (not submitted) and toast', async () => {
  const d = boot();
  d.actions['premiere-open'].run(VIDEO);
  d.actions['premiere-markers'].run(VIDEO);
  await d.flush();
  assert.equal(d.prompts.length, 2);
  assert.match(d.prompts[0][0], /^Premiere'de aç: .*final\.mp4/);
  assert.equal(d.prompts[0][1].submit, false);
  assert.match(d.prompts[1][0], /markerlarını oku.*final\.mp4/);
  const toasts = d.$$('.dtd-toast');
  assert.equal(toasts.length, 2);
  assert.match(toasts[0].textContent, /Sohbete yazıldı/);
  d.tick(2200);
  assert.ok(toasts[0].classList.contains('out'));
  d.tick(500);
  assert.equal(d.$$('.dtd-toast').length, 0);
  d.close();
});

test('a failing sendPrompt toasts "Gönderilemedi"; no chat copies to the clipboard', async () => {
  const d = boot({ sendPrompt: () => { throw new Error('x'); } });
  d.actions['premiere-open'].run(VIDEO);
  await d.flush();
  assert.equal(d.$('.dtd-toast').textContent, 'Gönderilemedi');
  d.close();

  const copied = [];
  const e = boot({ prompt: false });
  Object.defineProperty(e.window.navigator, 'clipboard', { value: { writeText: (t) => copied.push(t) }, configurable: true });
  e.actions['premiere-markers'].run(VIDEO);
  assert.equal(copied.length, 1);
  assert.match(e.$('.dtd-toast').textContent, /panoya kopyalandı/);
  e.close();
});

test('the delivery refuses non-Final videos', () => {
  const d = boot();
  d.actions.deliver.run({ ...VIDEO, group: 'draft' });
  assert.equal(d.$('.dtd-modal'), null);
  assert.match(d.$('.dtd-toast').textContent, /yalnız Final/);
  d.close();
});

test('delivery modal: scan fills cover / folders, deliver copies and closes', async () => {
  const runs = [];
  const d = boot({
    reply: {
      radar: (m) => {
        if (m.type === 'deliverScan') return { ok: true, root: 'R', teslimDir: 'R\\Teslim', rawDir: '', coverUrl: 'file:///c.jpg', cover: 'R\\Kapak\\kapak.jpg' };
        if (m.type === 'deliverRun') { runs.push(m); return { files: ['a', 'b'], clipboard: true }; }
        return null;
      },
    },
    storage: { 'dt.deliver.raw:R': 'E:\\Ham' },
  });
  d.actions.deliver.run(VIDEO);
  assert.ok(d.$('.dtd-modal'));
  assert.equal(d.$('.dtd-file').textContent, 'final.mp4');
  await d.flush();
  assert.equal(d.$('.dtd-cover img').src, 'file:///c.jpg');
  assert.equal(d.$('.dtd-info .dtd-sub').textContent, 'Kapak: kapak.jpg');
  const subs = d.$$('.dtd-check .dtd-sub');
  assert.equal(subs[0].textContent, 'R\\Teslim');
  assert.equal(subs[1].textContent, 'E:\\Ham', 'remembered raw folder');
  d.$('.dtd-caption').value = 'Merhaba #reels';
  const cbs = d.$$('.dtd-check input');
  cbs[2].checked = true; // clipboard
  d.click(btn(d, 'Teslim et'));
  assert.equal(d.$('.dtd-status').textContent, 'Kopyalanıyor…');
  await d.flush();
  assert.equal(runs.length, 1);
  assert.equal(runs[0].caption, 'Merhaba #reels');
  assert.equal(runs[0].cover, 'R\\Kapak\\kapak.jpg');
  assert.equal(runs[0].rawDir, 'E:\\Ham');
  assert.equal(runs[0].clipboard, true);
  assert.equal(d.$('.dtd-modal'), null, 'closed');
  assert.equal(d.$('.dtd-toast').textContent, '2 dosya kopyalandı · panoda');
  d.close();
});

test('delivery modal: validation, picking the raw folder, errors and empty reply', async () => {
  let runReply = { files: ['a'], clipboard: false, errors: ['disk dolu'] };
  const d = boot({
    reply: {
      radar: (m) => {
        if (m.type === 'deliverScan') return { ok: true, root: 'R', teslimDir: 'T', cover: null };
        if (m.type === 'deliverPickRaw') return 'F:\\Ham';
        if (m.type === 'deliverRun') return runReply;
        return null;
      },
    },
  });
  d.actions.deliver.run({ path: 'X\\v.mp4' }); // no group: allowed, no name: path shown
  assert.equal(d.$('.dtd-file').textContent, 'X\\v.mp4');
  await d.flush();
  assert.equal(d.$('.dtd-cover').textContent, 'Kapak yok');
  assert.match(d.$('.dtd-info .dtd-sub').textContent, /jpg\/png yok/);
  const cbs = d.$$('.dtd-check input');
  assert.match(d.$$('.dtd-check .dtd-sub')[1].textContent, /Klasör seçilmedi/);
  d.click(btn(d, 'Teslim et'));
  assert.equal(d.$('.dtd-status').textContent, 'Ham çekim klasörünü seç');
  cbs[0].checked = false; cbs[1].checked = false;
  d.click(btn(d, 'Teslim et'));
  assert.equal(d.$('.dtd-status').textContent, 'Bir hedef seç');
  d.click(btn(d, 'Seç…'));
  await d.flush();
  assert.equal(cbs[1].checked, true);
  assert.equal(d.$$('.dtd-check .dtd-sub')[1].textContent, 'F:\\Ham');
  assert.equal(d.window.localStorage.getItem('dt.deliver.raw:R'), 'F:\\Ham');
  cbs[2].checked = true;
  d.click(btn(d, 'Teslim et'));
  await d.flush();
  assert.equal(d.$('.dtd-status').textContent, '1 dosya kopyalandı · panoya kopyalanamadı · hata: disk dolu');
  assert.ok(d.$('.dtd-modal'), 'stays open on error');
  runReply = null;
  d.click(btn(d, 'Teslim et'));
  await d.flush();
  assert.equal(d.$('.dtd-status').textContent, 'Yanıt yok');
  // Claude caption prompt
  d.click(btn(d, "Claude'a yazdır"));
  await d.flush();
  assert.match(d.prompts[0][0], /Instagram açıklaması.*X\\v\.mp4/);
  // close paths: Esc, backdrop, ×, Vazgeç
  d.key('Escape');
  assert.equal(d.$('.dtd-modal'), null);
  d.close();
});

test('delivery modal: unreadable project, close by backdrop / × / Vazgeç', async () => {
  const d = boot({ reply: { radar: () => ({ ok: false }) } });
  d.actions.deliver.run(VIDEO);
  await d.flush();
  assert.equal(d.$('.dtd-status').textContent, 'Proje okunamadı');
  // picking a raw folder before a scan does not remember it
  d.click(btn(d, 'Seç…'));
  await d.flush();
  d.fire('.dtd-modal', 'mousedown');
  assert.ok(d.$('.dtd-modal'), 'click inside keeps it');
  d.fire('.dtd-back', 'mousedown');
  assert.equal(d.$('.dtd-back'), null);
  d.actions.deliver.run(VIDEO);
  d.click('.dtd-x');
  assert.equal(d.$('.dtd-back'), null);
  d.actions.deliver.run(VIDEO);
  d.click(btn(d, 'Vazgeç'));
  assert.equal(d.$('.dtd-back'), null);
  d.close();
});

test('no bridge: the scan answers nothing; a throwing bridge too', async () => {
  const d = boot({ noWebkit: true });
  d.actions.deliver.run(VIDEO);
  await d.flush();
  assert.equal(d.$('.dtd-status').textContent, 'Proje okunamadı');
  d.close();
  const e = boot({ reply: { radar: () => { throw new Error('no'); } } });
  e.actions.deliver.run(VIDEO);
  await e.flush();
  assert.equal(e.$('.dtd-status').textContent, 'Proje okunamadı');
  e.close();
});

test('waits for DTVideo: registers on dtvideo:ready or by polling, gives up after 5 s', () => {
  const d = boot({ lateVideo: true });
  const got = [];
  d.window.DTVideo = { registerAction: (a) => got.push(a.id) };
  d.window.dispatchEvent(new d.window.Event('dtvideo:ready'));
  assert.equal(got.length, 3);
  d.tick(200);
  assert.equal(got.length, 3, 'only once');
  assert.equal(d.timers.size, 0, 'poll stopped');
  d.close();

  const e = boot({ lateVideo: true });
  const got2 = [];
  e.tick(400);
  e.window.DTVideo = { registerAction: (a) => got2.push(a.id) };
  e.tick(200);
  assert.equal(got2.length, 3);
  e.close();

  const f = boot({ lateVideo: true });
  f.ev('Date.now = () => 1e15');
  f.tick(200);
  assert.equal(f.timers.size, 0, 'gave up');
  f.close();
});
