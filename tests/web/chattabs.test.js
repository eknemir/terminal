'use strict';
// chattabs.js: chat tabs over the orbit map (Windows app) — "Harita" + one tab per embedded chat, and #chatpane's rect.
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeDom } = require('./dom');

function boot(opts = {}) {
  const d = makeDom({ reply: { radar: opts.radar === undefined ? null : opts.radar }, globals: { __platform: 'win32', ...(opts.globals || {}) }, page: opts.page, noWebkit: opts.noWebkit });
  d.run('chattabs.js');
  const pane = d.$('#chatpane');
  if (pane) pane.getBoundingClientRect = () => ({ left: 10, top: 40, width: 300, height: 500 });
  return { ...d, CT: d.window.__chatTabs, msgs: (t) => d.posted.filter((m) => m.type === t) };
}
const TABS = [{ id: 'a', title: 'Kaya <Oto>', status: 'busy', sid: 's-a' }, { id: 'b', title: 'Derin', status: 'idle', sid: 's-b' }];

test('win32: says tabsReady; nothing shows until chats are embedded', () => {
  const d = boot();
  assert.equal(d.msgs('tabsReady').length, 1);
  assert.equal(d.$('#chattabs').hidden, true);
  assert.equal(d.$('#chatpane').hidden, true);
  d.CT.update({ embed: true, tabs: [] });
  assert.equal(d.$('#chattabs').hidden, true, 'no tabs: no bar');
  d.CT.update({ embed: false, tabs: TABS });
  assert.equal(d.$('#chattabs').hidden, true, 'not embedded: no bar');
  d.close();
});

test('tabs render escaped, the active one is on and the pane reports its rect once', () => {
  const focused = [];
  const d = boot({ globals: { DT: { focusChat: (sid) => focused.push(sid) } } });
  let events = 0;
  d.document.addEventListener('chattabs', () => events++);
  d.CT.update({ embed: true, active: 'a', tabs: TABS });
  assert.equal(events, 1);
  assert.deepEqual(focused, ['s-a']);
  const tabs = d.$$('#chattabs .ct-tab');
  assert.equal(tabs.length, 3);
  assert.equal(tabs[0].textContent, 'Harita');
  assert.ok(!tabs[0].classList.contains('on'), 'map tab off while a chat is on');
  assert.ok(tabs[1].classList.contains('on'));
  assert.equal(tabs[1].querySelector('span').textContent, 'Kaya <Oto>');
  assert.equal(tabs[1].title, 'Kaya <Oto>');
  assert.ok(tabs[1].querySelector('.ct-dot').classList.contains('st-busy'));
  assert.ok(d.$('#mapwrap').classList.contains('has-tabs'));
  assert.ok(d.$('#mapwrap').classList.contains('chat-on'));
  assert.equal(d.$('#chatpane').hidden, false);
  d.tick(16);
  assert.deepEqual(d.msgs('tabRect').map((m) => m.rect), [{ x: 10, y: 40, w: 300, h: 500 }]);
  // same rect again: not re-sent
  d.window.dispatchEvent(new d.window.Event('resize'));
  d.observers.forEach((o) => o.cb());
  d.tick(16);
  assert.equal(d.msgs('tabRect').length, 1);
  // same active tab: no refocus
  d.CT.update({ embed: true, active: 'a', tabs: TABS });
  assert.equal(focused.length, 1);
  // back to the map: rect null
  d.CT.update({ embed: true, active: null, tabs: TABS });
  d.tick(16);
  assert.equal(d.msgs('tabRect').at(-1).rect, null);
  assert.ok(d.$('#chattabs .ct-map').classList.contains('on'));
  assert.ok(!d.$('#mapwrap').classList.contains('chat-on'));
  // an active id that is no tab: the map shows
  d.CT.update({ embed: true, active: 'zz', tabs: TABS });
  assert.equal(d.$('#chatpane').hidden, true);
  assert.deepEqual(focused, ['s-a', undefined]);
  d.close();
});

test('clicks select / close tabs; middle click closes; context menu asks for the menu', () => {
  const d = boot();
  d.CT.update({ embed: true, active: 'a', tabs: TABS });
  const [map, a, b] = d.$$('#chattabs .ct-tab');
  d.click(b.querySelector('span'));
  d.click(map);
  d.click(a.querySelector('.ct-x'));
  d.click('#chattabs'); // not on a tab
  assert.deepEqual(d.msgs('tabSelect').map((m) => m.id), ['b', null]);
  assert.deepEqual(d.msgs('tabClose').map((m) => m.id), ['a']);
  d.fire(b, 'auxclick', { button: 1 });
  d.fire(b, 'auxclick', { button: 2 });
  d.fire(map, 'auxclick', { button: 1 });
  assert.deepEqual(d.msgs('tabClose').map((m) => m.id), ['a', 'b']);
  const e = d.fire(a, 'contextmenu', { clientX: 5, clientY: 7 });
  assert.ok(e.defaultPrevented);
  const e2 = d.fire(map, 'contextmenu');
  assert.ok(!e2.defaultPrevented, 'the map tab has no menu');
  assert.deepEqual(d.msgs('tabMenu'), [{ type: 'tabMenu', id: 'a', at: { x: 5, y: 7 }, via: 'radar' }]);
  d.close();
});

test('Ctrl+Tab / Ctrl+Shift+Tab cycle only while tabs are embedded', () => {
  const d = boot();
  d.key('Tab', { ctrlKey: true });
  assert.equal(d.msgs('tabCycle').length, 0);
  d.CT.update({ embed: true, tabs: TABS });
  const e = d.key('Tab', { ctrlKey: true });
  assert.ok(e.defaultPrevented);
  d.key('Tab', { ctrlKey: true, shiftKey: true });
  d.key('Tab', { ctrlKey: true, altKey: true });
  d.key('Tab');
  assert.deepEqual(d.msgs('tabCycle').map((m) => m.dir), [1, -1]);
  d.close();
});

test('setEmbed asks main; update tolerates junk', async () => {
  const d = boot({ radar: (m) => (m.type === 'embedChats' ? 'ok' : null) });
  assert.equal(await d.CT.setEmbed(1), 'ok');
  d.CT.setEmbed(0);
  assert.deepEqual(d.msgs('embedChats').map((m) => m.on), [true, false]);
  d.CT.update(null);
  assert.equal(JSON.stringify(d.CT.state), '{"embed":false,"active":null,"tabs":[]}');
  d.CT.update({ embed: true, tabs: 'x' });
  assert.deepEqual([...d.CT.state.tabs], []);
  d.close();
});

test('the Mac (not win32) posts nothing; no bridge does not throw; no #mapwrap: nothing', async () => {
  const d = boot({ globals: { __platform: 'darwin' } });
  d.CT.update({ embed: true, active: 'a', tabs: TABS });
  d.tick(16);
  assert.equal(d.posted.length, 0);
  d.close();
  const e = boot({ noWebkit: true });
  assert.equal(await e.CT.setEmbed(true), null);
  e.close();
  const f = boot({ page: '<html><body></body></html>' });
  assert.equal(f.CT, undefined);
  f.close();
});
