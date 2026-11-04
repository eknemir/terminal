'use strict';
// The effect preset gallery (presets.js) mounted into #presets-mount: browsing, search, chips, favourites, the
// drawer (fill + send/copy), the user-preset editor, import/export and the live-preview toggle.
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeDom } = require('./dom');

const PAGE = '<!doctype html><html><body><div id="presets-mount"></div></body></html>';
const PNG = 'data:image/png;base64,iVBORw0KGgo=';

function setup(opts = {}) {
  const d = makeDom({ page: PAGE, handlers: [], ...opts });
  if (opts.before) opts.before(d.window);
  d.run('presets.js');
  // jsdom's document is still "loading" here: the gallery mounts on DOMContentLoaded.
  d.document.dispatchEvent(new d.window.Event('DOMContentLoaded'));
  return d;
}
const names = (d) => d.$$('.pz-card .pz-name').map((n) => n.textContent);
const toast = (d) => d.$('.pz-toast').textContent;
const btn = (d, label) => d.$$('.pz-drawer button').find((b) => b.textContent === label);
const setFiles = (input, files) => Object.defineProperty(input, 'files', { value: files, configurable: true });
// FileReader finishes asynchronously (real or fake timers): pump both.
async function settle(d) { for (let i = 0; i < 10; i++) { d.tick(10); await d.flush(2); } }
const userPreset = (o = {}) => ({ id: 'u-mine', name: 'Benim efekt', category: 'Özel', description: 'açıklama', template: 'Yaz {metin} ve {kelime}', ...o });

test('mounts once with all built-ins, chips and no empty message', () => {
  const d = setup();
  const n = d.ev('window.DTPresets.list.length');
  assert.equal(d.$$('.pz-card').length, n);
  assert.deepEqual(d.$$('.pz-chip').map((c) => c.textContent), ['Tümü', 'Benim', 'Yazı', 'Grafik', 'Renk', 'Geçiş', 'Hareket', 'CTA']);
  assert.equal(d.$('.pz-chip.on').textContent, 'Tümü');
  assert.equal(d.$('.pz-empty').style.display, 'none');
  assert.equal(d.$('#presets-mount').dataset.pzMounted, '1');
  // Built-in previews: "alt||üst" split puts the back part under .pv-u
  assert.ok(d.$('.pv-giant-captions .pv-u .gc-g'));
  assert.ok(d.$('.pv-giant-captions .pv-s .gc-s'));
  assert.ok(!d.$('.pv-gravity-drop .pv-u'));
  d.close();
});

test('waits for DOMContentLoaded while loading; mounts at once when loaded; never twice', () => {
  const d = makeDom({ page: PAGE, handlers: [] });
  d.run('presets.js');
  assert.equal(d.$$('.pz-card').length, 0);
  d.document.dispatchEvent(new d.window.Event('DOMContentLoaded'));
  const first = d.$('.pz-root');
  assert.ok(first);
  d.document.dispatchEvent(new d.window.Event('DOMContentLoaded'));
  assert.equal(d.$$('.pz-root').length, 1);
  assert.equal(d.$('.pz-root'), first, 'not remounted');
  d.close();
  const d2 = makeDom({ page: PAGE, handlers: [] });
  Object.defineProperty(d2.document, 'readyState', { value: 'complete', configurable: true });
  d2.run('presets.js');
  assert.ok(d2.$$('.pz-card').length > 0);
  d2.close();
});

test('search and category chips filter; no results shows the empty message', () => {
  const d = setup();
  d.click(d.$$('.pz-chip').find((c) => c.textContent === 'Renk'));
  assert.deepEqual(names(d), ['Grade Slider', 'Film Look', 'Eyedropper Grade']);
  assert.equal(d.$('.pz-chip.on').textContent, 'Renk');
  d.type('.pz-search', 'film');
  assert.deepEqual(names(d), ['Film Look']);
  d.type('.pz-search', 'yokböylebirşey');
  assert.equal(d.$$('.pz-card').length, 0);
  assert.equal(d.$('.pz-empty').style.display, 'block');
  d.click(d.$('.pz-chips')); // not on a chip: ignored
  d.type('.pz-search', '');
  d.click(d.$$('.pz-chip').find((c) => c.textContent === 'Benim'));
  assert.equal(d.$$('.pz-card').length, 0, 'no user presets yet');
  d.close();
});

test('favourites float to the top, persist and toggle back', () => {
  const d = setup();
  d.click('[data-star="title-card"]');
  assert.equal(names(d)[0], 'Title Card');
  assert.equal(d.$('[data-star="title-card"]').textContent, '★');
  assert.equal(toast(d), 'Favorilere eklendi');
  assert.deepEqual(JSON.parse(d.window.localStorage.getItem('presets.fav')), ['title-card']);
  assert.equal(d.$('.pz-drawer.open'), null, 'star does not open the drawer');
  d.click('[data-star="title-card"]');
  assert.equal(toast(d), 'Favorilerden çıkarıldı');
  assert.equal(names(d)[0], 'Gravity Drop');
  d.tick(2300);
  assert.ok(!d.$('.pz-toast').classList.contains('show'));
  d.close();
});

test('broken favourites storage falls back to none', () => {
  const d = setup({ storage: { 'presets.fav': '{bad', 'presets.user': '{bad' } });
  assert.equal(d.$$('.pz-star.on').length, 0);
  d.close();
});

test('drawer: fills metin/kelime live, respects manual edits, resets, closes', () => {
  const d = setup();
  d.click('.pz-card[data-id="kinetic-hook"] .pz-name');
  assert.ok(d.$('.pz-drawer').classList.contains('open'));
  assert.ok(d.$('.pz-shade').classList.contains('open'));
  assert.equal(d.$('.pz-dname').textContent, 'Kinetic Hook');
  assert.ok(d.$('.pz-drawer .pz-pv-big'));
  const out = d.$('.pz-out');
  assert.match(out.value, /1\. satır METNİNİZ beyaz, 2\. satır EFEKT sarı/);
  d.type('.pz-metin', 'Merhaba');
  d.type('.pz-kelime', 'dünya');
  assert.match(out.value, /1\. satır Merhaba beyaz, 2\. satır dünya sarı/);
  d.type(out, 'elle yazdım');
  d.type('.pz-metin', 'Başka');
  d.type('.pz-kelime', 'x');
  assert.equal(out.value, 'elle yazdım');
  d.click(btn(d, 'Promptu sıfırla'));
  assert.match(out.value, /1\. satır Başka beyaz, 2\. satır x sarı/);
  d.tick(60);
  assert.equal(d.document.activeElement, d.$('.pz-metin'));
  d.click('.pz-x');
  assert.ok(!d.$('.pz-drawer').classList.contains('open'));
  // Esc and shade also close
  d.click('.pz-card[data-id="title-card"]');
  assert.equal(d.$('.pz-kelime'), null, 'template without {kelime} has no kelime field');
  d.key('Escape', {}, d.$('.pz-metin'));
  assert.ok(!d.$('.pz-drawer').classList.contains('open'));
  d.key('Escape', {}, d.$('.pz-search')); // nothing open: no-op
  d.click('.pz-card[data-id="title-card"]');
  d.click('.pz-shade');
  assert.ok(!d.$('.pz-drawer').classList.contains('open'));
  d.close();
});

test('keyboard Enter/Space on a card opens it', () => {
  const d = setup();
  const card = d.$('.pz-card[data-id="film-look"]');
  const e = d.key('Enter', {}, card);
  assert.ok(e.defaultPrevented);
  assert.equal(d.$('.pz-dname').textContent, 'Film Look');
  d.click('.pz-x');
  d.key(' ', {}, d.$('.pz-card[data-id="reel-feed"]'));
  assert.equal(d.$('.pz-dname').textContent, 'Reel Feed');
  const e2 = d.key('a', {}, d.$('.pz-card'));
  assert.ok(!e2.defaultPrevented);
  d.close();
});

test('send / new chat go through window.DT and toast the result', async () => {
  const calls = [];
  const d = setup({ globals: { DT: { sendPrompt: (t) => { calls.push(['send', t]); return true; }, newChatWithPrompt: (t) => { calls.push(['new', t]); return Promise.resolve(); } } } });
  d.click('.pz-card[data-id="prompt-bar"]');
  d.type('.pz-metin', 'selam');
  d.click(btn(d, 'Sohbete gönder'));
  await d.flush();
  assert.equal(calls[0][0], 'send');
  assert.match(calls[0][1], /selam karakter karakter/);
  assert.equal(toast(d), 'Sohbete gönderildi');
  d.click(btn(d, 'Yeni sohbette aç'));
  await d.flush();
  assert.equal(calls[1][0], 'new');
  assert.equal(toast(d), 'Yeni sohbette açıldı');
  d.close();
});

test('failed or missing bridge falls back to copying (clipboard API, then execCommand)', async () => {
  const written = [];
  const d = setup({ globals: { DT: { sendPrompt: () => false, newChatWithPrompt: () => { throw new Error('x'); } } } });
  Object.defineProperty(d.window.navigator, 'clipboard', { value: { writeText: (t) => { written.push(t); return Promise.resolve(); } }, configurable: true });
  d.click('.pz-card[data-id="title-card"]');
  d.click(btn(d, 'Sohbete gönder'));
  await d.flush();
  assert.equal(toast(d), 'Gönderilemedi — prompt panoya kopyalandı');
  d.click(btn(d, 'Yeni sohbette aç'));
  await d.flush();
  assert.equal(toast(d), 'Gönderilemedi — prompt panoya kopyalandı');
  d.click(btn(d, 'Kopyala'));
  await d.flush();
  assert.equal(toast(d), 'Panoya kopyalandı');
  assert.equal(written.length, 3);
  assert.match(written[2], /Title Card geçişi/);
  // clipboard rejects -> execCommand fallback
  let cmd = null;
  d.window.navigator.clipboard.writeText = () => Promise.reject(new Error('denied'));
  d.document.execCommand = (c) => { cmd = c; return true; };
  d.click(btn(d, 'Kopyala'));
  await d.flush();
  assert.equal(cmd, 'copy');
  assert.equal(toast(d), 'Panoya kopyalandı');
  assert.equal(d.$$('body > textarea').length, 0, 'temporary textarea removed');
  // no clipboard API, execCommand throws
  Object.defineProperty(d.window.navigator, 'clipboard', { value: undefined, configurable: true });
  d.document.execCommand = () => { throw new Error('no'); };
  d.click(btn(d, 'Kopyala'));
  assert.equal(toast(d), 'Kopyalanamadı');
  d.close();
});

test('no DT bridge at all copies with a notice', () => {
  const d = setup();
  d.document.execCommand = () => true;
  d.click('.pz-card[data-id="title-card"]');
  d.click(btn(d, 'Sohbete gönder'));
  assert.equal(toast(d), 'Sohbet bağlantısı yok — prompt panoya kopyalandı');
  d.close();
});

test('create a new preset: validation errors, new category, preview ref, save', () => {
  const d = setup();
  d.click(d.$$('.pz-tool').find((b) => b.textContent === "+ Kendi preset'in"));
  assert.equal(d.$('.pz-dname').textContent, 'Yeni preset');
  d.tick(60);
  const [nameIn] = d.$$('.pz-drawer input.pz-ta');
  assert.equal(d.document.activeElement, nameIn);
  const [catSel, pvSel] = d.$$('.pz-drawer select');
  const tpl = d.$('.pz-drawer .pz-out');
  // empty save -> errors
  d.click(btn(d, 'Kaydet'));
  assert.match(d.$('.pz-err').textContent, /name boş olamaz/);
  assert.match(d.$('.pz-err').textContent, /template boş olamaz/);
  // new category
  catSel.value = '__new'; d.fire(catSel, 'change');
  const catNew = d.$$('.pz-drawer input.pz-ta').find((i) => i.placeholder === 'Yeni kategori adı');
  assert.equal(catNew.style.display, '');
  catSel.value = 'Yazı'; d.fire(catSel, 'change');
  assert.equal(catNew.style.display, 'none');
  catSel.value = '__new'; d.fire(catSel, 'change');
  nameIn.value = 'Gravity Drop';
  catNew.value = 'Benim Kat';
  tpl.value = 'Şablon {metin}';
  pvSel.value = 'gravity-drop'; d.fire(pvSel, 'change');
  d.click(btn(d, 'Kaydet'));
  assert.equal(toast(d), 'Preset kaydedildi');
  const saved = JSON.parse(d.window.localStorage.getItem('presets.user'));
  assert.equal(saved.length, 1);
  assert.equal(saved[0].id, 'u-gravity-drop');
  assert.equal(saved[0].category, 'Benim Kat');
  assert.equal(saved[0].pvRef, 'gravity-drop');
  assert.equal(saved[0].__user, undefined, '__user is not persisted');
  // drawer now shows the saved preset with "Benim" badge and the referenced preview
  assert.equal(d.$('.pz-dname').textContent, 'Gravity Drop');
  assert.ok(d.$('.pz-drawer .pz-mine'));
  assert.ok(d.$('.pz-drawer .pv-gravity-drop'));
  // new category chip + custom badge class
  assert.ok(d.$$('.pz-chip').some((c) => c.textContent === 'Benim Kat'));
  assert.ok(d.$('.pz-card[data-id="u-gravity-drop"] .pz-cu'));
  // same slug again -> unique id
  d.click(d.$$('.pz-tool').find((b) => b.textContent === "+ Kendi preset'in"));
  d.$$('.pz-drawer input.pz-ta')[0].value = 'Gravity Drop';
  d.$('.pz-drawer .pz-out').value = 'x';
  d.click(btn(d, 'Kaydet'));
  d.click(d.$$('.pz-tool').find((b) => b.textContent === "+ Kendi preset'in"));
  d.$$('.pz-drawer input.pz-ta')[0].value = 'Gravity Drop';
  d.$('.pz-drawer .pz-out').value = 'y';
  d.click(btn(d, 'Kaydet'));
  assert.deepEqual(JSON.parse(d.window.localStorage.getItem('presets.user')).map((p) => p.id), ['u-gravity-drop-3', 'u-gravity-drop-2', 'u-gravity-drop']);
  d.click(d.$$('.pz-chip').find((c) => c.textContent === 'Benim'));
  assert.equal(d.$$('.pz-card').length, 3);
  d.close();
});

test('paste mode puts the prompt first and focuses it; Vazgeç closes', () => {
  const d = setup();
  d.click(d.$$('.pz-tool').find((b) => b.textContent === "Sohbetteki prompt'u preset yap"));
  assert.equal(d.$('.pz-dname').textContent, "Prompt'tan preset");
  assert.equal(d.$('.pz-drawer .pz-lbl').textContent, 'Prompt');
  d.tick(60);
  assert.equal(d.document.activeElement, d.$('.pz-drawer .pz-out'));
  d.click(btn(d, 'Vazgeç'));
  assert.ok(!d.$('.pz-drawer').classList.contains('open'));
  d.close();
});

test('user presets: plain preview, edit, duplicate, export, delete', () => {
  const stored = [userPreset(), { id: 'BAD ID' }];
  const d = setup({ storage: { 'presets.user': JSON.stringify(stored) } });
  assert.equal(names(d)[0], 'Benim efekt', 'user presets come first, invalid ones dropped');
  assert.equal(d.$('.pz-card[data-id="u-mine"] .pz-pv-plain .pz-pv-txt').textContent, 'Benim efekt');
  d.click('.pz-card[data-id="u-mine"]');
  assert.ok(btn(d, 'Sil') && btn(d, 'Çoğalt') && btn(d, 'Düzenle'));
  // edit
  d.click(btn(d, 'Düzenle'));
  assert.equal(d.$('.pz-dname').textContent, 'Preseti düzenle');
  const nameIn = d.$$('.pz-drawer input.pz-ta')[0];
  assert.equal(nameIn.value, 'Benim efekt');
  assert.equal(d.$$('.pz-drawer select')[0].value, 'Özel');
  nameIn.value = 'Yeni ad';
  d.click(btn(d, 'Kaydet'));
  assert.equal(toast(d), 'Preset güncellendi');
  let saved = JSON.parse(d.window.localStorage.getItem('presets.user'));
  assert.equal(saved.length, 1);
  assert.equal(saved[0].id, 'u-mine');
  assert.equal(saved[0].name, 'Yeni ad');
  // duplicate
  d.click(btn(d, 'Çoğalt'));
  assert.equal(d.$('.pz-dname').textContent, 'Yeni preset');
  assert.equal(d.$$('.pz-drawer input.pz-ta')[0].value, 'Yeni ad (kopya)');
  d.click(btn(d, 'Kaydet'));
  saved = JSON.parse(d.window.localStorage.getItem('presets.user'));
  assert.deepEqual(saved.map((p) => p.name), ['Yeni ad (kopya)', 'Yeni ad']);
  // export single
  const urls = [];
  d.window.URL.createObjectURL = (b) => { urls.push(b); return 'blob:1'; };
  d.window.URL.revokeObjectURL = (u) => urls.push('revoked:' + u);
  let dl = null;
  d.window.HTMLAnchorElement.prototype.click = function () { dl = this.download; };
  d.click(btn(d, 'Dışa aktar'));
  assert.equal(dl, 'u-yeni-ad-kopya.derinpreset');
  assert.equal(toast(d), '1 preset dışa aktarıldı');
  d.tick(4000);
  assert.equal(urls[1], 'revoked:blob:1');
  // export all from toolbar
  d.click(d.$$('.pz-tool').find((b) => b.textContent === 'Dışa aktar'));
  assert.equal(dl, 'presetler.derinpreset');
  assert.equal(toast(d), '2 preset dışa aktarıldı');
  // delete: cancel, then confirm
  d.window.confirm = () => false;
  d.click(btn(d, 'Sil'));
  assert.equal(JSON.parse(d.window.localStorage.getItem('presets.user')).length, 2);
  d.window.confirm = () => true;
  d.click(btn(d, 'Sil'));
  assert.equal(toast(d), 'Preset silindi');
  assert.ok(!d.$('.pz-drawer').classList.contains('open'));
  assert.deepEqual(JSON.parse(d.window.localStorage.getItem('presets.user')).map((p) => p.id), ['u-mine']);
  d.close();
});

test('export with no user presets just warns', () => {
  const d = setup();
  d.click(d.$$('.pz-tool').find((b) => b.textContent === 'Dışa aktar'));
  assert.equal(toast(d), 'Dışa aktarılacak kendi presetin yok');
  d.close();
});

test('built-in "Kopyala ve düzenle" pre-fills the editor with its preview', () => {
  const d = setup();
  d.click('.pz-card[data-id="film-look"]');
  d.click(btn(d, 'Kopyala ve düzenle'));
  assert.equal(d.$$('.pz-drawer input.pz-ta')[0].value, 'Film Look (kopya)');
  assert.equal(d.$$('.pz-drawer select')[1].value, 'film-look');
  assert.match(d.$('.pz-drawer .pz-out').value, /Efekt: Film Look/);
  d.click(btn(d, 'Kaydet'));
  const saved = JSON.parse(d.window.localStorage.getItem('presets.user'));
  assert.equal(saved[0].id, 'u-film-look-kopya');
  assert.equal(saved[0].category, 'Renk');
  assert.equal(saved[0].pvRef, 'film-look');
  d.close();
});

test('media preview: size limit, bad format, image and video, existing media kept', async () => {
  const d = setup();
  d.click(d.$$('.pz-tool').find((b) => b.textContent === "+ Kendi preset'in"));
  const pvSel = d.$$('.pz-drawer select')[1];
  const mediaIn = d.$('.pz-drawer input[type=file]');
  const info = mediaIn.nextElementSibling;
  assert.equal(mediaIn.parentNode.style.display, 'none');
  pvSel.value = '__media'; d.fire(pvSel, 'change');
  assert.equal(mediaIn.parentNode.style.display, '');
  d.$$('.pz-drawer input.pz-ta')[0].value = 'Medyalı';
  d.$('.pz-drawer .pz-out').value = 't';
  d.click(btn(d, 'Kaydet'));
  assert.equal(d.$('.pz-err').textContent, 'Görsel/video seçilmedi.');
  // no file
  setFiles(mediaIn, []); d.fire(mediaIn, 'change');
  // too big
  setFiles(mediaIn, [{ size: 3 * 1048576, name: 'big.png' }]); d.fire(mediaIn, 'change');
  assert.match(info.textContent, /2 MB sınırını aşıyor \(3\.0 MB\)/);
  assert.equal(toast(d), 'Dosya 2 MB’tan büyük');
  // unsupported
  setFiles(mediaIn, [new d.window.File(['hello'], 'a.txt', { type: 'text/plain' })]); d.fire(mediaIn, 'change');
  await settle(d);
  assert.match(info.textContent, /Desteklenmeyen biçim/);
  // valid image
  setFiles(mediaIn, [new d.window.File([Buffer.from([137, 80, 78, 71])], 'a.png', { type: 'image/png' })]); d.fire(mediaIn, 'change');
  await settle(d);
  assert.match(info.textContent, /^Eklendi: a\.png/);
  d.click(btn(d, 'Kaydet'));
  assert.equal(toast(d), 'Preset kaydedildi');
  assert.ok(d.$('.pz-drawer .pz-pv-media.pz-pv-big img'));
  assert.equal(JSON.parse(d.window.localStorage.getItem('presets.user'))[0].media.type, 'image');
  // edit keeps existing media
  d.click(btn(d, 'Düzenle'));
  assert.equal(d.$$('.pz-drawer select')[1].value, '__media');
  assert.match(d.$('.pz-drawer input[type=file]').nextElementSibling.textContent, /Mevcut görsel korunuyor/);
  // valid video
  const mi = d.$('.pz-drawer input[type=file]');
  setFiles(mi, [new d.window.File([Buffer.from('vid')], 'v.mp4', { type: 'video/mp4' })]); d.fire(mi, 'change');
  await settle(d);
  d.click(btn(d, 'Kaydet'));
  assert.equal(toast(d), 'Preset güncellendi');
  const v = d.$('.pz-card .pz-pv-media video');
  assert.ok(v && v.muted && v.loop);
  d.close();
});

test('stored preset with video media shows the video note in the editor', () => {
  const d = setup({ storage: { 'presets.user': JSON.stringify([userPreset({ media: { type: 'video', data: 'data:video/mp4;base64,AAAA' } })]) } });
  d.click('.pz-card[data-id="u-mine"]');
  d.click(btn(d, 'Düzenle'));
  assert.match(d.$('.pz-drawer input[type=file]').nextElementSibling.textContent, /Mevcut video korunuyor/);
  d.close();
});

test('storage full: save rolls back, delete warns', () => {
  const d = setup({ storage: { 'presets.user': JSON.stringify([userPreset()]) } });
  const orig = d.window.Storage.prototype.setItem;
  d.window.Storage.prototype.setItem = function () { throw new Error('QuotaExceeded'); };
  d.click(d.$$('.pz-tool').find((b) => b.textContent === "+ Kendi preset'in"));
  d.$$('.pz-drawer input.pz-ta')[0].value = 'Dolu';
  d.$('.pz-drawer .pz-out').value = 't';
  d.click(btn(d, 'Kaydet'));
  assert.match(d.$('.pz-err').textContent, /Depolama dolu/);
  assert.match(toast(d), /Kaydedilemedi/);
  assert.equal(d.$$('.pz-card').filter((c) => c.querySelector('.pz-mine')).length, 1, 'not added');
  // favourites save failure is swallowed
  d.click('[data-star="title-card"]');
  assert.equal(toast(d), 'Favorilere eklendi');
  d.window.Storage.prototype.setItem = orig;
  d.close();
});

async function importFile(d, text, size) {
  const fileIn = d.$('.pz-tools input[type=file]');
  let clicked = false;
  fileIn.click = () => { clicked = true; };
  d.click(d.$$('.pz-tool').find((b) => b.textContent === 'İçe aktar'));
  assert.ok(clicked);
  const f = size ? { size } : new d.window.File([text], 'p.derinpreset', { type: 'application/json' });
  setFiles(fileIn, [f]);
  d.fire(fileIn, 'change');
  await settle(d);
}

test('import: merges, renames conflicts, skips duplicates, reports invalid', async () => {
  const d = setup({ storage: { 'presets.user': JSON.stringify([userPreset()]) } });
  const ser = (list) => JSON.stringify({ format: 'derinpreset', version: 1, presets: list });
  await importFile(d, ser([userPreset(), userPreset({ template: 'farklı' }), userPreset({ id: 'u-new', name: 'Yeni' }), { id: 'gravity-drop', name: 'GD', category: 'Yazı', template: 't' }, { bad: 1 }]));
  assert.equal(toast(d), '3 preset eklendi, 2 yeniden adlandırıldı, 1 zaten vardı, 1 geçersiz atlandı');
  const ids = JSON.parse(d.window.localStorage.getItem('presets.user')).map((p) => p.id);
  assert.deepEqual(ids, ['u-mine', 'u-mine-2', 'u-new', 'gravity-drop-2']);
  assert.ok(d.$('.pz-card[data-id="u-new"]'));
  // simple add without extras
  await importFile(d, ser([userPreset({ id: 'u-z', name: 'Z' })]));
  assert.equal(toast(d), '1 preset eklendi');
  d.close();
});

test('import: bad files and empty selection', async () => {
  const d = setup();
  await importFile(d, 'not json');
  assert.equal(toast(d), 'İçe aktarılamadı: Geçerli JSON değil');
  await importFile(d, JSON.stringify({ format: 'derinpreset', version: 1, presets: [] }));
  assert.equal(toast(d), 'İçe aktarılamadı: geçersiz dosya');
  await importFile(d, '', 41 * 1024 * 1024);
  assert.equal(toast(d), 'Dosya çok büyük');
  const fileIn = d.$('.pz-tools input[type=file]');
  setFiles(fileIn, []); d.fire(fileIn, 'change');
  assert.equal(d.window.localStorage.getItem('presets.user'), null);
  d.close();
});

test('import: storage failure keeps the previous list', async () => {
  const d = setup();
  d.window.Storage.prototype.setItem = function () { throw new Error('full'); };
  await importFile(d, JSON.stringify({ format: 'derinpreset', version: 1, presets: [userPreset()] }));
  assert.match(toast(d), /Kaydedilemedi/);
  assert.equal(d.$('.pz-card[data-id="u-mine"]'), null);
  d.close();
});

test('import: reader error toasts', async () => {
  const d = setup({ before: (w) => {
    w.FileReader = class { readAsText() { setTimeout(() => this.onerror()); } };
  } });
  await importFile(d, 'x');
  assert.equal(toast(d), 'Dosya okunamadı');
  d.close();
});

test('live previews follow IntersectionObserver and tab visibility', () => {
  let cb;
  const d = setup({ before: (w) => { w.IntersectionObserver = class { constructor(f) { cb = f; } observe() {} }; } });
  const box = d.$('.pz-root');
  assert.ok(!box.classList.contains('is-live'));
  cb([{ isIntersecting: true }]);
  assert.ok(box.classList.contains('is-live'));
  Object.defineProperty(d.document, 'visibilityState', { value: 'hidden', configurable: true });
  d.document.dispatchEvent(new d.window.Event('visibilitychange'));
  assert.ok(!box.classList.contains('is-live'));
  Object.defineProperty(d.document, 'visibilityState', { value: 'visible', configurable: true });
  d.document.dispatchEvent(new d.window.Event('visibilitychange'));
  assert.ok(box.classList.contains('is-live'));
  cb([{ isIntersecting: false }]);
  assert.ok(!box.classList.contains('is-live'));
  d.close();
});

test('without IntersectionObserver previews are live immediately', () => {
  const d = setup({ before: (w) => { delete w.IntersectionObserver; } });
  assert.ok(d.$('.pz-root').classList.contains('is-live'));
  d.close();
});

test('fixed presets.js:497: deleting with storage full keeps the preset and does not claim it was deleted', () => {
  const d = setup({ storage: { 'presets.user': JSON.stringify([userPreset()]) } });
  d.click('.pz-card[data-id="u-mine"]');
  d.window.confirm = () => true;
  const orig = d.window.Storage.prototype.setItem;
  d.window.Storage.prototype.setItem = function () { throw new Error('QuotaExceeded'); };
  d.click(btn(d, 'Sil'));
  d.window.Storage.prototype.setItem = orig;
  assert.match(toast(d), /Kaydedilemedi/);
  assert.ok(d.$('.pz-card[data-id="u-mine"]'));
  assert.equal(JSON.parse(d.window.localStorage.getItem('presets.user')).length, 1);
  d.close();
});
