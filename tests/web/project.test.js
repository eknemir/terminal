'use strict';
// project.js: "+ yeni video" — the new-project modal and the folder-template modal.
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeDom } = require('./dom');

function boot(opts = {}) {
  const d = makeDom({ reply: { radar: opts.radar || (() => null) }, storage: opts.storage, globals: opts.globals, noWebkit: opts.noWebkit });
  d.run('project.js');
  d.document.dispatchEvent(new d.window.Event('DOMContentLoaded')); // jsdom's page is still 'loading'
  return d;
}
const field = (d, label) => d.$$('.pj-field').find((f) => f.firstChild.textContent === label).querySelector('input, div');
const btn = (d, text) => d.$$('.pj-box button').find((b) => b.textContent === text);

test('the + yeni video button opens the modal; projectInfo fills brands and the next number', async () => {
  const infos = [];
  const d = boot({
    radar: (m) => {
      if (m.type === 'projectInfo') { infos.push(m); return { ok: true, exists: false, brands: ['Kaya Oto', 'Derin'], next: 7 }; }
      return null;
    },
  });
  d.click('#newvideo');
  assert.equal(d.$('.pj-title').textContent, 'Yeni video projesi');
  assert.match(field(d, 'Ana klasör').value, /İşler$/);
  d.tick(150);
  await d.flush();
  assert.equal(infos.length, 1);
  assert.deepEqual(d.$$('#pj-brands option').map((o) => o.value), ['Kaya Oto', 'Derin']);
  assert.equal(d.$('.pj-no').textContent, 'No: —', 'no brand typed yet');
  assert.equal(d.$('.pj-status').textContent, 'Ana klasör yok, oluşturulacak');
  // typing debounces: only the last keystroke asks
  d.type(field(d, 'Marka'), 'Ka');
  d.tick(50);
  d.type(field(d, 'Marka'), 'Kaya Oto ');
  d.tick(150);
  await d.flush();
  assert.equal(infos.length, 2);
  assert.equal(infos[1].marka, 'Kaya Oto');
  assert.equal(d.$('.pj-no').textContent, 'No: 7');
  d.tick(30);
  assert.equal(d.document.activeElement, field(d, 'Marka'));
  d.close();
});

test('invalid base folder is reported', async () => {
  const d = boot({ radar: () => ({ ok: false }) });
  d.ev('DTProject').open();
  d.tick(150);
  await d.flush();
  assert.equal(d.$('.pj-status').textContent, 'Ana klasör geçersiz');
  assert.ok(d.$('.pj-status').classList.contains('bad'));
  d.close();
});

test('create: validation, formats, ham picker, success saves the dir and notifies', async () => {
  const created = [];
  let reply = { ok: false, reason: 'Klasör zaten var' };
  const toasts = [];
  const d = boot({
    radar: (m) => {
      if (m.type === 'projectInfo') return { ok: true, exists: true, brands: [], next: 1 };
      if (m.type === 'projectPickFolder') return 'E:\\Ham\\Kaya';
      if (m.type === 'projectCreate') { created.push(m); return reply; }
      return null;
    },
    globals: { toast: (t) => toasts.push(t) },
    storage: { 'project.base': 'X:\\Base', 'project.prompt': 'P {marka}' },
  });
  d.click('#newvideo');
  assert.equal(field(d, 'Ana klasör').value, 'X:\\Base');
  d.click(btn(d, 'Oluştur'));
  assert.equal(d.$('.pj-status').textContent, 'Marka gerekli');
  d.type(field(d, 'Marka'), 'Kaya Oto');
  d.click(btn(d, 'Oluştur'));
  assert.equal(d.$('.pj-status').textContent, 'Video adı gerekli');
  d.type(field(d, 'Video adı'), 'Lansman');
  d.click(btn(d, 'Seç…'));
  await d.flush();
  assert.equal(field(d, 'Ham çekim klasörü').value, 'E:\\Ham\\Kaya');
  const chips = d.$$('.pj-chip');
  d.click(chips[0]); // 9:16 off
  d.click(chips[1]); // 16:9 on
  assert.ok(!chips[0].classList.contains('on'));
  assert.ok(chips[1].classList.contains('on'));
  field(d, 'Müzik').value = 'enerjik';
  field(d, 'Süre').value = '30 sn';
  field(d, 'Ana klasör').value = '  Y:\\Yeni  ';
  d.click(btn(d, 'Oluştur'));
  assert.equal(btn(d, 'Oluştur').disabled, true);
  await d.flush();
  assert.equal(created.length, 1);
  const m = created[0];
  assert.equal(m.base, 'Y:\\Yeni');
  assert.deepEqual(m.formats, ['16:9']);
  assert.equal(m.muzik, 'enerjik');
  assert.equal(m.sure, '30 sn');
  assert.equal(m.prompt, 'P {marka}');
  assert.ok(m.folders.includes('Assets/Ses'));
  assert.equal(d.window.localStorage.getItem('project.base'), 'Y:\\Yeni');
  assert.equal(d.$('.pj-status').textContent, 'Klasör zaten var', 'reason from main');
  assert.equal(btn(d, 'Oluştur').disabled, false);

  reply = null;
  d.click(btn(d, 'Oluştur'));
  await d.flush();
  assert.equal(d.$('.pj-status').textContent, 'Oluşturulamadı');

  reply = { ok: true, dir: 'Y:\\Yeni\\Kaya Oto\\1' };
  const dirs = [];
  d.window.addEventListener('dt:videoDir', (e) => dirs.push(e.detail.dir));
  d.click(btn(d, 'Oluştur'));
  await d.flush();
  assert.deepEqual(dirs, ['Y:\\Yeni\\Kaya Oto\\1']);
  assert.equal(d.window.localStorage.getItem('video.dir'), 'Y:\\Yeni\\Kaya Oto\\1');
  assert.equal(d.$('.pj-back'), null);
  assert.deepEqual(toasts, ['Proje hazır: Y:\\Yeni\\Kaya Oto\\1']);
  d.close();
});

test('cancel, Esc and the backdrop close the modal; picker cancel keeps the field', async () => {
  const d = boot({ radar: () => null });
  d.click('#newvideo');
  d.click(btn(d, 'Seç…'));
  await d.flush();
  assert.equal(field(d, 'Ham çekim klasörü').value, '');
  d.click(btn(d, 'Vazgeç'));
  assert.equal(d.$('.pj-back'), null);
  d.click('#newvideo');
  d.key('Enter');
  assert.ok(d.$('.pj-back'));
  d.key('Escape');
  assert.equal(d.$('.pj-back'), null);
  d.click('#newvideo');
  d.fire('.pj-box', 'mousedown');
  assert.ok(d.$('.pj-back'));
  d.fire('.pj-back', 'mousedown');
  assert.equal(d.$('.pj-back'), null);
  d.close();
});

test('folder template: edit, save, reset to defaults, broken stored value', async () => {
  const created = [];
  const d = boot({
    radar: (m) => { if (m.type === 'projectCreate') { created.push(m); return { ok: true, dir: 'D' }; } return { ok: true, exists: true, brands: [], next: 2 }; },
    storage: { 'project.folders': '{bad json' },
  });
  d.ev('DTProject').template();
  assert.equal(d.$('.pj-title').textContent, 'Klasör şablonu');
  const [ta, pt] = d.$$('.pj-ta');
  assert.ok(ta.value.startsWith('Render\nKapak'), 'broken value falls back to defaults');
  ta.value = ' Render \n\nKapak/Eski\r\nSes ';
  pt.value = 'Merhaba {marka}';
  d.click(btn(d, 'Kaydet'));
  assert.equal(d.$('.pj-back'), null);
  assert.equal(d.window.localStorage.getItem('project.folders'), '["Render","Kapak/Eski","Ses"]');
  assert.equal(d.window.localStorage.getItem('project.prompt'), 'Merhaba {marka}');

  // from the new-project modal, and the saved template is what gets created
  d.click('#newvideo');
  d.click(btn(d, 'Klasör şablonu…'));
  assert.equal(d.$$('.pj-box').length, 2);
  const [ta2, pt2] = d.$$('.pj-ta');
  assert.equal(ta2.value, 'Render\nKapak/Eski\nSes');
  d.click(d.$$('.pj-box')[1].querySelector('button'));
  assert.match(ta2.value, /^Render\nKapak\nVideolar/);
  assert.match(pt2.value, /^Yeni video projesi/);
  d.key('Escape'); // closes both (both listen)
  assert.equal(d.$$('.pj-box').length, 0);

  d.window.localStorage.setItem('project.folders', '"not an array"');
  d.click('#newvideo');
  d.type(d.$$('.pj-field input')[1], 'M');
  d.type(d.$$('.pj-field input')[2], 'V');
  d.click(btn(d, 'Oluştur'));
  await d.flush();
  assert.equal(created[0].folders[0], 'Render');
  assert.equal(created[0].folders.length, 10, 'non-array falls back to defaults');
  d.close();
});

test('no bridge: projectInfo answers nothing', async () => {
  const d = boot({ noWebkit: true });
  d.click('#newvideo');
  d.tick(150);
  await d.flush();
  assert.equal(d.$('.pj-status').textContent, 'Ana klasör geçersiz');
  d.close();
});

test('loaded after the DOM is ready it hooks the button at once; otherwise on DOMContentLoaded', () => {
  const c = makeDom({ reply: { radar: null } });
  Object.defineProperty(c.document, 'readyState', { value: 'complete', configurable: true });
  c.run('project.js');
  assert.equal(typeof c.$('#newvideo').onclick, 'function');
  c.close();
  const d = makeDom({ reply: { radar: null } });
  d.run('project.js');
  assert.equal(d.$('#newvideo').onclick, null);
  d.document.dispatchEvent(new d.window.Event('DOMContentLoaded'));
  assert.equal(typeof d.$('#newvideo').onclick, 'function');
  d.close();
});

test('a page without the button still gets DTProject; Mac default base', () => {
  const d = makeDom({ page: '<html><body></body></html>', reply: { radar: null } });
  Object.defineProperty(d.window.navigator, 'platform', { value: 'MacIntel', configurable: true });
  d.run('project.js');
  d.ev('DTProject').open();
  assert.equal(d.$('.pj-in').value, '~/İşler');
  d.close();
});
