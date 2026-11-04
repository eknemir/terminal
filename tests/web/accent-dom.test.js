'use strict';
// accent.js in a real (jsdom) page: the <style id="dt-accent"> sheet in <head>, its CSS variables reaching the page,
// the "accent" event, other windows' storage events and the late-theme-sheet reorder on DOMContentLoaded.
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeDom } = require('./dom');

function boot(storage) {
  const d = makeDom({ storage });
  const events = [];
  d.window.addEventListener('accent', (e) => events.push(e.detail));
  d.run('accent.js');
  const style = () => d.document.getElementById('dt-accent');
  const cssVar = (k) => d.window.getComputedStyle(d.document.documentElement).getPropertyValue(k).trim();
  return { ...d, A: d.window.DTAccent, style, cssVar, events };
}

test('default (cyberpunk): no sheet, data-accent set, an accent event on load', () => {
  const d = boot();
  assert.equal(d.style(), null);
  assert.equal(d.document.documentElement.dataset.accent, 'cyberpunk');
  assert.deepEqual(d.events, ['cyberpunk']);
  d.close();
});

test('a stored preset puts one sheet last in <head> whose variables reach :root', () => {
  const d = boot({ 'app.accent': 'derin' });
  const s = d.style();
  assert.ok(s);
  assert.equal(s.parentNode, d.document.head);
  assert.equal(d.document.head.lastElementChild, s);
  assert.equal(d.cssVar('--accent'), '#d4ff00');
  assert.equal(d.cssVar('--bg'), '#050a1f', 'derin brings its background');
  assert.equal(d.document.documentElement.dataset.accent, 'derin');
  d.close();
});

test('choosing presets and a custom colour updates the same sheet; cyberpunk removes it', () => {
  const d = boot();
  d.A.set('sunset');
  const s = d.style();
  assert.equal(d.cssVar('--accent'), '#ff7a45');
  assert.equal(d.cssVar('--bg'), '', 'sunset keeps the theme background');
  d.A.set('custom', '#F0A');
  assert.equal(d.style(), s, 'reused');
  assert.equal(d.window.localStorage.getItem('app.accent'), 'custom:#ff00aa');
  assert.equal(d.cssVar('--accent'), '#ff00aa');
  assert.equal(d.document.documentElement.dataset.accent, 'custom');
  assert.equal(d.A.color(), '#ff00aa');
  d.A.set('custom', 'not a colour');
  assert.equal(d.window.localStorage.getItem('app.accent'), 'custom:#ff00aa', 'keeps the last custom colour');
  d.A.set('cyberpunk');
  assert.equal(d.style(), null);
  assert.equal(d.A.color(), '#3fb6ec');
  d.A.set('custom');
  assert.equal(d.window.localStorage.getItem('app.accent'), 'custom:#d4ff00', 'first custom default');
  d.A.set('nope');
  assert.equal(d.window.localStorage.getItem('app.accent'), null);
  assert.deepEqual(d.events, ['cyberpunk', 'sunset', 'custom', 'custom', 'cyberpunk', 'custom', 'cyberpunk']);
  d.close();
});

test('another window changing the colour (storage event) re-applies; other keys do not', () => {
  const d = boot();
  d.window.localStorage.setItem('app.accent', 'emerald');
  d.window.dispatchEvent(new d.window.StorageEvent('storage', { key: 'other' }));
  assert.equal(d.style(), null);
  d.window.dispatchEvent(new d.window.StorageEvent('storage', { key: 'app.accent' }));
  assert.equal(d.cssVar('--accent'), '#10d9a0');
  d.window.localStorage.clear();
  d.window.dispatchEvent(new d.window.StorageEvent('storage', { key: null })); // localStorage.clear() elsewhere
  assert.equal(d.style(), null);
  d.close();
});

test('a theme sheet added after accent.js is moved before ours on DOMContentLoaded', () => {
  const d = boot({ 'app.accent': 'sunset' });
  const theme = d.document.createElement('style');
  theme.id = 'theme';
  theme.textContent = ':root{--accent:#000000 !important}';
  d.document.head.appendChild(theme);
  assert.equal(d.document.head.lastElementChild, theme);
  d.document.dispatchEvent(new d.window.Event('DOMContentLoaded'));
  assert.equal(d.document.head.lastElementChild, d.style());
  assert.equal(d.cssVar('--accent'), '#ff7a45', 'ours wins');
  d.close();
  const e = boot();
  e.document.dispatchEvent(new e.window.Event('DOMContentLoaded')); // no sheet: nothing to move
  assert.equal(e.style(), null);
  e.close();
});

test('the settings swatches (cloud.js wireAccent contract): list ids map to set()', () => {
  const d = boot();
  for (const p of d.A.list) {
    d.A.set(p.id, p.id === 'custom' ? '#123456' : undefined);
    assert.equal(d.A.get(), p.id);
    assert.equal(d.document.documentElement.dataset.accent, p.id);
  }
  assert.equal(d.A.customColor(), '#123456');
  d.close();
});
