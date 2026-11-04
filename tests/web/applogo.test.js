'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('../helpers/load');

const DATA = 'data:image/png;base64,AAAA';
const { DEFAULT: DEF, PROMPT: PR } = load('applogo.js').window.AppLogo;
const tick = () => new Promise((r) => setImmediate(r));

// Image/canvas/FileReader stand-ins the test drives by hand.
function kit({ toDataURL = () => 'data:image/png;base64,DRAWN' } = {}) {
  const images = [], canvases = [], readers = [];
  class Image { set src(v) { this._src = v; images.push(this); } get src() { return this._src; } }
  class FileReader { readAsDataURL(f) { this.file = f; readers.push(this); } }
  const createElement = (tag) => {
    assert.equal(tag, 'canvas');
    const c = { width: 0, height: 0, drawn: null, ctx: {}, toDataURL };
    c.getContext = () => Object.assign(c.ctx, { drawImage: (...a) => { c.drawn = a; } });
    canvases.push(c);
    return c;
  };
  return { images, canvases, readers, Image, FileReader, createElement };
}
function img(src) {
  let sets = 0, cur = src;
  return { get sets() { return sets; }, getAttribute: () => cur, set src(v) { sets++; cur = v; }, get src() { return cur; } };
}
function boot(storage, o = {}) {
  const k = kit(o);
  const imgs = o.imgs || [];
  const t = load('applogo.js', {
    storage, storageThrows: o.storageThrows, readyState: o.readyState, webkit: o.webkit,
    image: k.Image, createElement: k.createElement, extra: { FileReader: k.FileReader },
    selectors: { 'img[data-applogo]': imgs },
    single: { 'link[rel="icon"]': o.fav || null, '.brand': o.brand || null },
    ids: o.boot ? { boot: {} } : {},
  });
  return { ...t, k, L: t.window.AppLogo };
}

test('get and choice', () => {
  const cases = [
    [undefined, 'default', DEF],
    ['prompt', 'prompt', PR],
    [DATA, 'custom', DATA],
    ['weird', 'default', DEF],
    ['data:text/plain,x', 'default', DEF],
  ];
  for (const [v, choice, src] of cases) {
    const { L } = boot(v === undefined ? {} : { 'app.logo': v });
    assert.equal(L.choice(), choice, String(v));
    assert.equal(L.get(), src, String(v));
  }
  const bad = boot({ 'app.logo': 'prompt' }, { storageThrows: ['get'] }).L;
  assert.equal(bad.get(), DEF);
  assert.equal(bad.DEFAULT, DEF);
  assert.equal(bad.PROMPT, PR);
});

test('apply: images and favicon follow, unchanged ones are not touched', () => {
  const a = img('old.png'), b = img(PR);
  const fav = img('x'); fav.getAttribute = () => fav.href || 'x';
  const t = boot({ 'app.logo': 'prompt' }, { imgs: [a, b], fav });
  assert.equal(a.src, PR);
  assert.equal(a.sets, 1);
  assert.equal(b.sets, 0);
  assert.equal(fav.href, PR);
  assert.equal(t.events.find((e) => e.type === 'applogo').detail, PR);
  const same = { getAttribute: () => DEF, set href(v) { throw new Error('should not set'); } };
  assert.doesNotThrow(() => boot({}, { fav: same }));
});

test('only the main page tells the app its icon', async () => {
  const sub = boot({ 'app.logo': DATA });
  await tick();
  assert.equal(sub.posted.length, 0);
  const main = boot({ 'app.logo': DATA }, { boot: true });
  await tick();
  assert.deepEqual({ ...main.posted[0] }, { type: 'appLogo', dataUrl: DATA });
  main.L.apply(); // same src: told once
  await tick();
  assert.equal(main.posted.length, 1);
  const brand = boot({ 'app.logo': DATA }, { brand: {} });
  await tick();
  assert.equal(brand.posted.length, 1);
});

test('built-in logos are drawn into a data URL, at most 512 px', async () => {
  const t = boot({}, { boot: true });
  const im = t.k.images[0];
  assert.equal(im.src, DEF);
  im.naturalWidth = 1000; im.naturalHeight = 800; im.onload();
  await tick();
  assert.equal(t.k.canvases[0].width, 512);
  assert.equal(t.k.canvases[0].height, 512);
  assert.deepEqual(t.k.canvases[0].drawn.slice(1), [0, 0, 512, 512]);
  assert.deepEqual({ ...t.posted[0] }, { type: 'appLogo', dataUrl: 'data:image/png;base64,DRAWN' });

  const small = boot({}, { boot: true });
  Object.assign(small.k.images[0], { naturalWidth: 100, naturalHeight: 50 }).onload();
  assert.equal(small.k.canvases[0].width, 100);
  const zero = boot({}, { boot: true });
  Object.assign(zero.k.images[0], { naturalWidth: 0, naturalHeight: 0 }).onload();
  assert.equal(zero.k.canvases[0].width, 256);
});

test('drawing failures send nothing', async () => {
  const err = boot({}, { boot: true });
  err.k.images[0].onerror();
  await tick();
  assert.equal(err.posted.length, 0);
  const taint = boot({}, { boot: true, toDataURL: () => { throw new Error('tainted'); } });
  Object.assign(taint.k.images[0], { naturalWidth: 10, naturalHeight: 10 }).onload();
  await tick();
  assert.equal(taint.posted.length, 0);
});

test('a newer logo wins over a slower older one; no bridge is fine', async () => {
  const t = boot({}, { boot: true });
  t.L.set(DATA); // tell(DATA) while the default is still drawing
  await tick();
  Object.assign(t.k.images[0], { naturalWidth: 10, naturalHeight: 10 }).onload();
  await tick();
  assert.deepEqual(t.posted.map((m) => m.dataUrl), [DATA]);
  const nb = boot({ 'app.logo': DATA }, { boot: true, webkit: null });
  await tick();
  assert.equal(nb.posted.length, 0);
});

test('set: stores, clears, reports storage that is full', () => {
  const t = boot();
  t.L.set('prompt');
  assert.equal(t.localStorage.getItem('app.logo'), 'prompt');
  t.L.set('default');
  assert.equal(t.localStorage.getItem('app.logo'), null);
  t.L.set('prompt'); t.L.set('');
  assert.equal(t.localStorage.getItem('app.logo'), null);
  const full = boot({}, { storageThrows: ['set'] });
  full.L.set(DATA);
  assert.equal(full.events.find((e) => e.type === 'applogo-error').detail.length > 0, true);
});

test('fromFile: rejects non-images and read errors', async () => {
  const t = boot();
  await assert.rejects(t.L.fromFile(null));
  await assert.rejects(t.L.fromFile({ type: 'text/plain' }));
  const p = t.L.fromFile({ type: 'image/png' });
  t.k.readers[0].onerror();
  await assert.rejects(p);
  const q = t.L.fromFile({ type: 'image/png' });
  const r = t.k.readers[1]; r.result = 'data:image/png;base64,F'; r.onload();
  t.k.images.at(-1).onerror();
  await assert.rejects(q);
});

test('fromFile: scales to fit 512 px keeping the shape, then keeps it', async () => {
  const run = async (w, h) => {
    const t = boot();
    const p = t.L.fromFile({ type: 'image/jpeg' });
    const r = t.k.readers[0]; r.result = 'data:image/jpeg;base64,F'; r.onload();
    const im = t.k.images.at(-1);
    assert.equal(im.src, 'data:image/jpeg;base64,F');
    Object.assign(im, { naturalWidth: w, naturalHeight: h }).onload();
    const url = await p;
    const c = t.k.canvases.at(-1);
    assert.equal(url, 'data:image/png;base64,DRAWN');
    assert.equal(c.ctx.imageSmoothingQuality, 'high');
    assert.equal(t.localStorage.getItem('app.logo'), url);
    return [c.width, c.height];
  };
  assert.deepEqual(await run(1024, 512), [512, 256]);
  assert.deepEqual(await run(300, 1200), [128, 512]);
  assert.deepEqual(await run(100, 80), [100, 80]);
  assert.deepEqual(await run(0, 0), [1, 1]);
  assert.deepEqual(await run(5000, 1), [512, 1]);
});

test('storage events and late images', () => {
  const late = img('old');
  const t = boot();
  t.localStorage.setItem('app.logo', 'prompt');
  t.fire('storage', { key: 'x' });
  assert.equal(t.events.filter((e) => e.type === 'applogo').length, 1);
  t.fire('storage', { key: 'app.logo' });
  assert.equal(t.events.filter((e) => e.type === 'applogo').pop().detail, PR);

  const obs = t.observers[0];
  assert.deepEqual({ ...obs.options }, { childList: true, subtree: true });
  t.document.querySelectorAll = (s) => (s === 'img[data-applogo]' ? [late, img(PR)] : []);
  obs.cb([{ addedNodes: [{ nodeType: 3 }, { nodeType: 1 }] }]); // text node, element without the API
  assert.equal(late.sets, 0);
  obs.cb([{ addedNodes: [{ nodeType: 1, matches: () => false, querySelector: () => null }] }]);
  assert.equal(late.sets, 0);
  obs.cb([{ addedNodes: [{ nodeType: 1, matches: () => true }] }]);
  assert.equal(late.src, PR);
  const late2 = img('old');
  t.document.querySelectorAll = () => [late2];
  obs.cb([{ addedNodes: [{ nodeType: 1, matches: () => false, querySelector: () => ({}) }] }]);
  assert.equal(late2.src, PR);
});

test('waits for DOMContentLoaded while loading', () => {
  const t = boot({}, { readyState: 'loading' });
  assert.equal(t.events.length, 0);
  t.fireDoc('DOMContentLoaded');
  assert.equal(t.events[0].type, 'applogo');
  assert.equal(t.observers.length, 1);
});
