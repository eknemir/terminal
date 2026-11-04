'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('../helpers/load');

// A tiny DOM: <head> with children, getElementById over them, <style> elements that can remove themselves.
function dom({ noHead = false } = {}) {
  const made = [];
  const container = () => ({
    children: [],
    appendChild(el) { if (el.parent) el.remove(); this.children.push(el); el.parent = this; return el; },
  });
  const head = container();
  const rootExtra = container();
  return {
    made, head, rootExtra,
    patch(doc) {
      if (!noHead) doc.head = head;
      Object.assign(doc.documentElement, { children: rootExtra.children, appendChild: rootExtra.appendChild });
      doc.getElementById = (id) => [...head.children, ...rootExtra.children].find((e) => e.id === id) || null;
      doc.createElement = (tag) => {
        const el = { tag, id: '', textContent: '', parent: null, remove() { const c = this.parent.children; c.splice(c.indexOf(this), 1); this.parent = null; } };
        made.push(el);
        return el;
      };
    },
  };
}
function boot(storage, o = {}) {
  const d = dom(o);
  const t = load('accent.js', { storage, storageThrows: o.storageThrows, patchDocument: d.patch });
  const style = () => t.document.getElementById('dt-accent');
  return { ...t, d, A: t.window.DTAccent, style, css: () => (style() ? style().textContent : '') };
}
const has = (css, k, v) => assert.ok(css.includes(`${k}:${v} !important`), `${k}:${v} not in ${css.slice(0, 200)}`);

test('list: the presets plus "custom"', () => {
  const { A } = boot();
  assert.deepEqual([...A.list.map((p) => p.id)], ['cyberpunk', 'derin', 'sunset', 'emerald', 'custom']);
  assert.equal(A.list[4].swatch, null);
  assert.equal(A.list[1].swatch.length, 4);
  assert.ok(!('accent' in A.list[1]));
  assert.equal(A.DEFAULT, 'cyberpunk');
});

test('default (cyberpunk): no style sheet, the theme colour', () => {
  const t = boot();
  assert.equal(t.style(), null);
  assert.equal(t.A.get(), 'cyberpunk');
  assert.equal(t.document.documentElement.dataset.accent, 'cyberpunk');
  assert.equal(t.events.pop().detail, 'cyberpunk');
  assert.equal(t.A.color(), '#3fb6ec');
  assert.equal(t.A.customColor(), null);
});

test('unknown, broken or unreadable values fall back to the default', () => {
  assert.equal(boot({ 'app.accent': 'neon' }).A.get(), 'cyberpunk');
  assert.equal(boot({ 'app.accent': 'custom:#ff00' }).A.get(), 'cyberpunk');
  assert.equal(boot({ 'app.accent': 'custom:ff0000' }).A.get(), 'cyberpunk');
  assert.equal(boot({ 'app.accent': 'derin' }, { storageThrows: ['get'] }).A.get(), 'cyberpunk');
});

test('a preset with its own background', () => {
  const t = boot({ 'app.accent': 'derin' });
  assert.equal(t.A.get(), 'derin');
  assert.equal(t.A.color(), '#d4ff00');
  const css = t.css();
  assert.ok(css.startsWith(':root{') && css.endsWith('}'));
  has(css, '--accent', '#d4ff00');
  has(css, '--accent-rgb', '212, 255, 0');
  has(css, '--bg', '#050a1f');
  has(css, '--deep-rgb', '3, 6, 26');
  has(css, '--st-idle', '#24357a');
  has(css, '--grad', 'linear-gradient(90deg, #d4ff00, #7dffb0, #3fb6ec)');
  has(css, '--glow-sm', '0 0 10px rgba(227, 255, 77, 0.25)');
  assert.equal(t.document.documentElement.dataset.accent, 'derin');
});

test('a preset without a background sets no background tokens', () => {
  const css = boot({ 'app.accent': 'sunset' }).css();
  has(css, '--accent', '#ff7a45');
  assert.ok(!css.includes('--bg:'));
});

test('custom colour: derived palette (HSL), hue from the red channel', () => {
  const t = boot({ 'app.accent': 'custom:#FF0000' });
  assert.equal(t.A.get(), 'custom');
  assert.equal(t.A.customColor(), '#ff0000');
  assert.equal(t.A.color(), '#ff0000');
  const css = t.css();
  has(css, '--accent', '#ff0000');
  has(css, '--accent-soft', '#ff4747');
  has(css, '--accent-pale', '#ffcccc');
  has(css, '--violet', '#ffaa00'); // hue + 40
  has(css, '--magenta', '#aaff00'); // hue + 80
  has(css, '--cyan', '#ff4747');
  assert.equal(t.document.documentElement.dataset.accent, 'custom');
});

test('custom colour: green, blue and magenta maxima, grey, light colours', () => {
  const soft = (c) => /--accent-soft:(#[0-9a-f]{6})/.exec(boot({ 'app.accent': 'custom:' + c }).css())[1];
  assert.equal(soft('#00ff00'), '#47ff47');
  assert.equal(soft('#0000ff'), '#4747ff');
  assert.equal(soft('#ff00ff'), '#ff47ff'); // red max with g < b
  const grey = boot({ 'app.accent': 'custom:#808080' }).css();
  has(grey, '--accent', '#808080');
  has(grey, '--accent-pale', '#f2d9d9'); // no saturation: hue 0, at least 50 % saturation
  const light = boot({ 'app.accent': 'custom:#ff8080' }).css(); // lightness above 50 %
  has(light, '--accent-pale', '#ffcccc');
});

test('set: presets, default, unknown', () => {
  const t = boot();
  t.A.set('sunset');
  assert.equal(t.localStorage.getItem('app.accent'), 'sunset');
  assert.ok(t.style());
  t.A.set('cyberpunk');
  assert.equal(t.localStorage.getItem('app.accent'), null);
  assert.equal(t.style(), null); // removed again
  t.A.set('emerald'); t.A.set('');
  assert.equal(t.localStorage.getItem('app.accent'), null);
  t.A.set('emerald'); t.A.set('nope');
  assert.equal(t.localStorage.getItem('app.accent'), null);
  t.A.set('emerald'); t.A.set();
  assert.equal(t.localStorage.getItem('app.accent'), null);
});

test('set custom: 3- and 6-digit, with or without #, bad colour keeps the old one', () => {
  const t = boot();
  t.A.set('custom', '#ABC');
  assert.equal(t.localStorage.getItem('app.accent'), 'custom:#aabbcc');
  t.A.set('custom', '00FF00');
  assert.equal(t.localStorage.getItem('app.accent'), 'custom:#00ff00');
  t.A.set('custom', 'xyz'); // not hex (note: 'bad' would be a valid 3-digit colour)
  assert.equal(t.localStorage.getItem('app.accent'), 'custom:#00ff00');
  const f = boot();
  f.A.set('custom');
  assert.equal(f.localStorage.getItem('app.accent'), 'custom:#d4ff00');
  assert.equal(f.A.color(), '#d4ff00');
});

test('set survives storage errors', () => {
  const t = boot({}, { storageThrows: ['set', 'remove'] });
  t.A.set('derin');
  assert.equal(t.A.get(), 'cyberpunk');
});

test('the style element is reused and kept last in <head>', () => {
  const t = boot({ 'app.accent': 'derin' });
  t.A.set('sunset');
  assert.equal(t.d.made.length, 1);
  t.d.head.appendChild({ id: 'theme', remove() {} });
  assert.notEqual(t.d.head.children.at(-1).id, 'dt-accent');
  t.fireDoc('DOMContentLoaded');
  assert.equal(t.d.head.children.at(-1).id, 'dt-accent');
  const none = boot();
  assert.doesNotThrow(() => none.fireDoc('DOMContentLoaded'));
});

test('without <head> the root element holds the sheet', () => {
  const t = boot({ 'app.accent': 'sunset' }, { noHead: true });
  assert.equal(t.d.rootExtra.children[0].id, 'dt-accent');
  t.fireDoc('DOMContentLoaded');
  assert.equal(t.d.rootExtra.children.length, 1);
});

test('storage events: its key or a clear re-apply, others do not', () => {
  const t = boot();
  t.localStorage.setItem('app.accent', 'sunset');
  t.fire('storage', { key: 'other' });
  assert.equal(t.style(), null);
  t.fire('storage', { key: 'app.accent' });
  assert.ok(t.css().includes('#ff7a45'));
  t.localStorage.clear();
  t.fire('storage', { key: null });
  assert.equal(t.style(), null);
});
