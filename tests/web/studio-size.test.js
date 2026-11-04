'use strict';
// studio-size.js: the Studio panel's splitter (--studio-w), wide mode and fullscreen overlay.
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeDom } = require('./dom');

function boot(opts = {}) {
  const d = makeDom({ storage: opts.storage, page: opts.page });
  d.window.innerWidth = opts.innerWidth || 1000;
  const right = d.$('#right');
  if (right) {
    right.rect = { right: 1000, width: 400, height: 700 };
    right.getBoundingClientRect = () => right.rect;
  }
  const top = d.$('#top');
  if (top && !opts.noTop) top.getBoundingClientRect = () => ({ bottom: 61.6 });
  if (top && opts.noTop) top.remove();
  const events = [];
  d.window.addEventListener('studio-resize', (e) => events.push(e.detail));
  d.run('studio-size.js');
  const split = d.$('.studio-split');
  if (split) split.setPointerCapture = () => {};
  return { ...d, right, events, split, app: d.$('#app'), w: () => d.$('#app').style.getPropertyValue('--studio-w') };
}

test('a saved width is applied (clamped to 70 % of the window) and emitted on the next frame', () => {
  const d = boot({ storage: { 'studio.width': '900' } });
  assert.equal(d.w(), '700px');
  d.tick(16);
  assert.equal(d.events.length, 1);
  assert.equal(d.events[0].width, 400);
  assert.equal(d.events[0].wide, false);
  d.close();
  const e = boot({ storage: { 'studio.width': 'x' } });
  assert.equal(e.w(), '');
  e.close();
});

test('dragging the splitter resizes live and saves on release; dblclick resets', () => {
  const d = boot();
  d.fire(d.split, 'pointerdown', { button: 2 }, d.window.MouseEvent);
  assert.ok(!d.document.body.classList.contains('studio-dragging'), 'right button ignored');
  const down = d.fire(d.split, 'pointerdown', { button: 0 }, d.window.MouseEvent);
  assert.ok(down.defaultPrevented);
  assert.ok(d.document.body.classList.contains('studio-dragging'));
  d.fire(d.split, 'pointermove', { clientX: 500 }, d.window.MouseEvent);
  assert.equal(d.w(), '500px');
  d.fire(d.split, 'pointermove', { clientX: 900 }, d.window.MouseEvent);
  assert.equal(d.w(), '300px', 'min 300');
  d.fire(d.split, 'pointermove', { clientX: 0 }, d.window.MouseEvent);
  assert.equal(d.w(), '700px', 'max 70 %');
  d.right.rect = { right: 1000, width: 455.4, height: 700 };
  d.fire(d.split, 'pointerup', {}, d.window.MouseEvent);
  assert.ok(!d.document.body.classList.contains('studio-dragging'));
  assert.equal(d.w(), '455px');
  assert.equal(d.window.localStorage.getItem('studio.width'), '455');
  d.fire(d.split, 'pointermove', { clientX: 500 }, d.window.MouseEvent);
  assert.equal(d.w(), '455px', 'move listener gone');
  d.tick(16);
  assert.equal(d.events.length, 1, 'emits are coalesced into one frame');
  d.fire(d.split, 'dblclick');
  assert.equal(d.w(), '');
  assert.equal(d.window.localStorage.getItem('studio.width'), null);
  // pointercancel ends a drag too
  d.fire(d.split, 'pointerdown', { button: 0 }, d.window.MouseEvent);
  d.fire(d.split, 'pointercancel');
  assert.ok(!d.document.body.classList.contains('studio-dragging'));
  d.close();
});

test('wide and fullscreen buttons toggle classes, titles and the overlay top', () => {
  const d = boot();
  const [bWide, bFull] = d.$$('#p-studio > header .studio-sz button');
  d.click(bWide);
  assert.ok(d.app.classList.contains('studio-wide'));
  assert.ok(bWide.classList.contains('on'));
  assert.match(bWide.title, /^Daralt/);
  d.tick(16);
  assert.equal(d.events.at(-1).wide, true);
  d.click(bWide);
  assert.ok(!d.app.classList.contains('studio-wide'));
  assert.match(bWide.title, /^Genişlet/);
  d.click(bFull);
  assert.ok(d.right.classList.contains('studio-full'));
  assert.ok(d.$('#p-studio').classList.contains('studio-full'));
  assert.equal(d.right.style.getPropertyValue('--studio-top'), '62px');
  assert.match(bFull.title, /^Tam ekrandan çık/);
  d.tick(16);
  assert.equal(d.events.at(-1).full, true);
  d.click(bFull);
  assert.ok(!d.right.classList.contains('studio-full'));
  assert.match(bFull.title, /^Tam ekran \(/);
  d.close();
});

test('Ctrl+Shift+F toggles fullscreen; Esc leaves it except while typing', () => {
  const d = boot({ noTop: true });
  const e = d.key('F', { ctrlKey: true, shiftKey: true });
  assert.ok(e.defaultPrevented);
  assert.ok(d.right.classList.contains('studio-full'));
  assert.equal(d.right.style.getPropertyValue('--studio-top'), '56px', 'no #top: default');
  d.key('f', { ctrlKey: true, shiftKey: true, altKey: true });
  assert.ok(d.right.classList.contains('studio-full'), 'Alt: ignored');
  const inp = d.document.createElement('textarea');
  d.document.body.appendChild(inp);
  d.key('Escape', {}, inp);
  assert.ok(d.right.classList.contains('studio-full'), 'Esc in a textarea stays');
  d.key('Escape');
  assert.ok(!d.right.classList.contains('studio-full'));
  d.key('Escape'); // not full: nothing
  d.key('x', { ctrlKey: true, shiftKey: true, code: 'KeyF' });
  assert.ok(d.right.classList.contains('studio-full'), 'by code');
  d.key('f', { ctrlKey: true, shiftKey: true });
  assert.ok(!d.right.classList.contains('studio-full'));
  d.close();
});

test('window resize clamps a width over the new maximum; the ResizeObserver emits', () => {
  const d = boot({ storage: { 'studio.width': '650' } });
  assert.equal(d.w(), '650px');
  d.window.innerWidth = 800;
  d.window.dispatchEvent(new d.window.Event('resize'));
  assert.equal(d.w(), '560px');
  d.window.dispatchEvent(new d.window.Event('resize'));
  assert.equal(d.w(), '560px');
  d.tick(16);
  const n = d.events.length;
  d.observers.forEach((o) => o.cb());
  d.tick(16);
  assert.equal(d.events.length, n + 1);
  d.close();
});

test('pages without the studio panel: nothing; a panel without a header still works', () => {
  const d = boot({ page: '<html><body><div id="app"></div></body></html>' });
  assert.equal(d.split, null);
  d.close();
  const e = boot({ page: '<html><body><div id="app"><aside id="right"><section id="p-studio"></section></aside></div></body></html>' });
  assert.ok(e.split);
  assert.equal(e.$('.studio-sz'), null);
  e.key('F', { ctrlKey: true, shiftKey: true });
  assert.ok(e.right.classList.contains('studio-full'));
  e.close();
});
