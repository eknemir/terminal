'use strict';
// The app's overlay panel (overlay.html): overlay.js, api.js, picker.js (the folder picker and its shortcut places)
// and shortcuts.js (the pie), against a fake "overlay" bridge.
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeDom } = require('./dom');

const HOME = '/Users/me';
const dirs = {
  [`${HOME}/Documents/Repos`]: {
    path: `${HOME}/Documents/Repos`, parent: `${HOME}/Documents`,
    entries: [
      { name: 'app', path: `${HOME}/Documents/Repos/app`, git: true, claude: true, modified: Date.now() - 3 * 3600_000 },
      { name: 'web', path: `${HOME}/Documents/Repos/web`, modified: Date.now() - 5 * 86400_000 },
      { name: '.hidden', path: `${HOME}/Documents/Repos/.hidden`, hidden: true },
      { name: 'zeta', path: `${HOME}/Documents/Repos/zeta`, modified: Date.now() - 90 * 86400_000 },
    ],
  },
  [`${HOME}/Documents/Repos/app`]: { path: `${HOME}/Documents/Repos/app`, parent: `${HOME}/Documents/Repos`, entries: [] },
  [`${HOME}/Documents`]: { path: `${HOME}/Documents`, parent: HOME, entries: [{ name: 'Repos', path: `${HOME}/Documents/Repos`, modified: Date.now() - 30_000 }] },
  [HOME]: { path: HOME, parent: '/', entries: [] },
  '/': { path: '/', parent: null, entries: [] },
  '/locked': { path: '/locked', parent: '/', error: 'izin yok', entries: [] },
};
const places = {
  home: HOME,
  favorites: [{ name: 'Ev', path: HOME, icon: 'home' }, { name: 'Belgeler', path: `${HOME}/Documents`, icon: 'doc' }, { name: 'X', path: '/x', icon: 'zzz' }],
  recents: [{ name: 'app', path: `${HOME}/Documents/Repos/app`, t: Date.now() - 10 * 60_000 }],
};

function boot(opts = {}) {
  const store = { pie: opts.slots || [{ name: 'verylongprojectname', dir: '/p/verylongprojectname' }, null, { name: 'b', dir: '/p/b' }, null, null], picker: opts.around || [] };
  const answers = opts.answers || {};
  const reply = (m) => {
    if (answers[m.type]) return answers[m.type](m);
    switch (m.type) {
      case 'getSlots': return { slots: m.set === 'picker' ? store.picker : store.pie };
      case 'saveSlots': return m.set === 'picker' ? ((store.picker = m.slots), { slots: m.slots }) : ((store.pie = m.slots), { slots: m.slots });
      case 'places': return places;
      case 'listDir': return dirs[m.path.replace(/^~/, HOME)] || { path: m.path, parent: '/', entries: [] };
      default: return {};
    }
  };
  const d = makeDom({ page: 'overlay.html', reply: { overlay: reply }, globals: opts.globals });
  d.run('appname.js', 'applogo.js', 'overlay.js', 'api.js', 'picker.js', 'shortcuts.js');
  d.store = store;
  d.ov = (type) => d.posted.filter((m) => m.via === 'overlay' && (!type || m.type === type));
  return d;
}
const toastText = (d) => d.$('#toast').textContent;

test('api.js sends each call through the overlay handler', async (t) => {
  const d = boot();
  t.after(d.close);
  const A = d.window.API;
  await A.listDir('/x');
  await A.places();
  await A.getSlots('picker');
  await A.saveSlots([1], 'picker');
  await A.newTerminal('/d', 'd');
  await A.done();
  const m = d.ov().slice(-6).map(({ via, ...rest }) => rest);
  assert.deepEqual(m, [{ type: 'listDir', path: '/x' }, { type: 'places' }, { type: 'getSlots', set: 'picker' }, { type: 'saveSlots', slots: [1], set: 'picker' }, { type: 'newTerminal', dir: '/d', name: 'd' }, { type: 'done' }]);
});

test('shortcuts: the pie with its five slices, names, numbers and hub', async (t) => {
  const d = boot();
  t.after(d.close);
  await d.flush();
  d.window.Overlay.shortcuts(10, 2000);
  const root = d.$('#shortcuts');
  assert.ok(root.classList.contains('on'));
  const pie = root.querySelector('.pie');
  // kept on screen
  assert.equal(pie.style.left, '160px');
  assert.equal(pie.style.top, `${768 - 190}px`);
  const slices = pie.querySelectorAll('.slice');
  assert.equal(slices.length, 5);
  assert.ok(slices[1].classList.contains('empty'));
  assert.equal(slices[0].querySelectorAll('text')[1].textContent, 'verylongproj…');
  assert.equal(slices[1].querySelector('.add').textContent, 'klasör ekle');
  assert.deepEqual([...pie.querySelectorAll('.num')].map((n) => n.textContent), ['1', '2', '3', '4', '5']);
  assert.equal(pie.querySelector('.hub .brand').textContent, 'DERIN TERMINAL');
  assert.equal(pie.querySelector('.hub .sub').textContent, 'bir klasör seç');
  assert.match(pie.querySelector('.hint').textContent, /^4 parmakla tık/);
  // pointing at slices
  d.fire(slices[0], 'pointerenter');
  assert.ok(slices[0].classList.contains('hot'));
  assert.match(slices[0].style.transform, /translate/);
  assert.equal(pie.querySelector('.hub .title').textContent, 'verylongproj');
  assert.equal(pie.querySelector('.hub .sub').textContent, 'burada terminal');
  d.fire(slices[1], 'pointerenter');
  assert.equal(pie.querySelector('.hub .title').textContent, 'YUVA 2');
  assert.equal(pie.querySelector('.hub .sub').textContent, 'klasör seç');
  d.fire(slices[1], 'pointerleave');
  assert.equal(pie.querySelector('.hub .title').textContent, 'KISAYOLLAR');
  assert.equal(d.window.Shortcuts.slots().length, 5);
});

test('shortcuts: a filled slice opens a terminal there; keys pick; Escape and the hub close', async (t) => {
  const d = boot();
  t.after(d.close);
  await d.flush();
  d.window.Shortcuts.open(500, 400);
  d.click(d.$$('#shortcuts .slice')[0]);
  assert.ok(d.$$('#shortcuts .slice')[0].classList.contains('pick'));
  d.tick(140);
  assert.deepEqual(d.ov('newTerminal').map((m) => [m.dir, m.name]), [['/p/verylongprojectname', 'verylongprojectname']]);
  assert.equal(d.ov('done').length, 1);
  d.tick(210);
  assert.ok(!d.$('#shortcuts').classList.contains('on'));
  assert.equal(d.ov('done').length, 1); // kept for the terminal
  // keys
  d.window.Shortcuts.open(500, 400);
  d.key('3');
  d.tick(400);
  assert.equal(d.ov('newTerminal').at(-1).dir, '/p/b');
  d.window.Shortcuts.open(500, 400);
  d.key('9'); // beyond the slices: nothing
  d.key('Escape');
  d.tick(210);
  assert.equal(d.$('#shortcuts').innerHTML, '');
  assert.equal(d.ov('done').length, 3);
  // the hub closes; the veil too
  d.window.Shortcuts.open(500, 400);
  d.click(d.$('#shortcuts .hub'));
  d.tick(210);
  d.window.Shortcuts.open(500, 400);
  d.fire(d.$('#shortcuts .veil'), 'mousedown');
  d.tick(210);
  assert.equal(d.$('#shortcuts').innerHTML, '');
  // keys with no pie do nothing
  d.key('1');
  d.window.Shortcuts.close();
});

test('shortcuts: an empty slice fills from the picker; right-click changes or removes', async (t) => {
  const d = boot();
  t.after(d.close);
  await d.flush();
  d.window.Shortcuts.open(500, 400);
  d.click(d.$$('#shortcuts .slice')[1]);
  d.tick(140);
  await d.flush();
  const picker = d.$('#picker');
  assert.ok(picker.classList.contains('on'));
  assert.equal(picker.querySelector('.for').textContent, '2. kısayol için');
  // keys go to the picker now
  d.key('1');
  // pick "app"
  d.click(picker.querySelector('.pk-row[data-i="0"]'));
  d.click(picker.querySelector('.pk-ok'));
  d.tick(430);
  await d.flush();
  assert.equal(d.store.pie[1].dir, `${HOME}/Documents/Repos/app`);
  assert.equal(d.store.pie[1].name, 'app');
  assert.equal(toastText(d), 'kısayol 2 → app');
  assert.ok(d.$$('#shortcuts .slice')[1].classList.contains('filled'));
  // right-click: change
  d.fire(d.$$('#shortcuts .slice')[0], 'contextmenu', { clientX: 10, clientY: 10 });
  const ctx = d.$('#shortcuts .sc-ctx');
  assert.equal(ctx.querySelector('.t').textContent, '/p/verylongprojectname');
  d.click(ctx.querySelector('[data-a="change"]'));
  await d.flush();
  assert.equal(d.ov('listDir').at(-1).path, '/p/verylongprojectname');
  // cancel the picker: back to the pie
  d.click(d.$('#picker .pk-cancel'));
  d.tick(430);
  assert.ok(d.$('#shortcuts').classList.contains('on'));
  // right-click on an empty one: nothing
  d.fire(d.$$('#shortcuts .slice')[3], 'contextmenu');
  assert.equal(d.$('#shortcuts .sc-ctx'), null);
  // remove
  d.fire(d.$$('#shortcuts .slice')[2], 'contextmenu', { clientX: 5, clientY: 5 });
  d.click(d.$('#shortcuts .sc-ctx [data-a="remove"]'));
  await d.flush();
  assert.equal(d.store.pie[2], null);
  assert.ok(d.$$('#shortcuts .slice')[2].classList.contains('empty'));
  d.fire(d.$$('#shortcuts .slice')[0], 'contextmenu', { clientX: 5, clientY: 5 });
  d.click(d.$('#shortcuts .sc-ctx .t'));
});

test('shortcuts: a save that fails says so; no slots at first', async (t) => {
  const d = boot({ slots: [null, null, null, null, null], answers: { saveSlots: () => ({ error: 'disk full' }) } });
  t.after(d.close);
  await d.flush();
  d.window.Shortcuts.open(500, 400);
  assert.equal(d.$('#shortcuts .hub .sub').textContent, 'klasörlerini ekle');
  d.fire(d.$$('#shortcuts .slice')[0], 'pointerenter');
  d.fire(d.$$('#shortcuts .slice')[0], 'pointerleave');
  assert.equal(d.$('#shortcuts .hub .sub').textContent, 'klasörlerini ekle');
  d.click(d.$$('#shortcuts .slice')[0]);
  d.tick(140);
  await d.flush();
  d.click(d.$('#picker .pk-ok'));
  d.tick(430);
  await d.flush();
  assert.equal(toastText(d), 'kısayol kaydedilemedi: disk full');
  // a rejected save reads as a network error
  const d2 = boot({ slots: [null, null, null, null, null], answers: { saveSlots: () => { throw new Error('x'); }, getSlots: () => { throw new Error('y'); } } });
  t.after(d2.close);
  await d2.flush();
  d2.window.Shortcuts.open(500, 400);
  d2.click(d2.$$('#shortcuts .slice')[0]);
  d2.tick(140);
  await d2.flush();
  d2.click(d2.$('#picker .pk-ok'));
  d2.tick(430);
  await d2.flush();
  assert.equal(toastText(d2), 'kısayol kaydedilemedi: network');
});

test('shortcuts on Windows: Ctrl + middle click hint, backslash names', async (t) => {
  const d = boot({ slots: [null, null, null, null, null], globals: { __platform: 'win32' } });
  t.after(d.close);
  dirs['C:\\Repos'] = { path: 'C:\\Repos', parent: 'C:\\', entries: [{ name: 'app', path: 'C:\\Repos\\app' }] };
  t.after(() => delete dirs['C:\\Repos']);
  await d.flush();
  d.window.Shortcuts.open(500, 400);
  assert.match(d.$('#shortcuts .hint').textContent, /^Ctrl \+ orta tık/);
  d.click(d.$$('#shortcuts .slice')[0]);
  d.tick(140);
  await d.flush();
  // go to C:\Repos and pick its app
  d.$$('#picker .pk-place')[0].onclick();
  await d.flush();
  d.window.Picker.isOpen();
  d.click(d.$('#picker .pk-crumbs span'));
  await d.flush();
});

test('picker: lists folders, hides hidden ones, filters, badges and dates; crumbs and places', async (t) => {
  const d = boot();
  t.after(d.close);
  await d.flush();
  let picked = null;
  d.window.Picker.open({ onPick: (x) => (picked = x) });
  await d.flush();
  const p = d.$('#picker');
  assert.ok(p.classList.contains('on'));
  assert.ok(!p.classList.contains('around'));
  assert.equal(p.querySelector('.pk-title b').textContent, 'KLASÖR SEÇ');
  const rows = () => p.querySelectorAll('.pk-row');
  assert.equal(rows().length, 3);
  assert.equal(rows()[0].querySelector('.badge.git').textContent, '⎇ git');
  assert.ok(rows()[0].querySelector('.badge.claude'));
  assert.equal(rows()[0].querySelector('.dt').textContent, '3 sa önce');
  assert.equal(rows()[1].querySelector('.dt').textContent, '5 gün önce');
  assert.equal(rows()[2].querySelector('.dt').textContent, '3 ay önce');
  // crumbs from ~
  assert.deepEqual([...p.querySelectorAll('.pk-crumbs span')].map((s) => s.textContent), ['~', 'Documents', 'Repos']);
  assert.ok(p.querySelector('.pk-back').disabled);
  assert.ok(!p.querySelector('.pk-up').disabled);
  // places: favourites, recents
  const placesEls = p.querySelectorAll('.pk-place');
  assert.equal(placesEls.length, 4);
  assert.equal(placesEls[0].querySelector('.gl').textContent, '⌂');
  assert.equal(placesEls[2].querySelector('.gl').textContent, '▸');
  assert.match(placesEls[3].textContent, /~\/Documents\/Repos · 10 dk önce/);
  assert.match(p.querySelector('.pk-sel').textContent, /terminal şurada açılır: ~\/Documents\/Repos/);
  // hidden on
  const hid = p.querySelector('.pk-hid input');
  hid.checked = true;
  d.fire(hid, 'change');
  assert.equal(rows().length, 4);
  assert.ok(p.querySelector('.hidden-dir'));
  // filter
  d.type(p.querySelector('.pk-filter'), 'WE');
  assert.equal(rows().length, 1);
  d.type(p.querySelector('.pk-filter'), 'nothing');
  assert.match(p.querySelector('.pk-empty').textContent, /“nothing” ile eşleşen klasör yok/);
  d.type(p.querySelector('.pk-filter'), '');
  // keys select; the foot follows
  d.key('ArrowDown');
  d.key('ArrowDown');
  assert.ok(rows()[1].classList.contains('sel'));
  assert.match(p.querySelector('.pk-sel').textContent, /~\/Documents\/Repos\/web/);
  d.key('ArrowUp');
  assert.ok(rows()[0].classList.contains('sel'));
  // into the folder (→), back, forward, up (⌘↑), ←
  d.key('ArrowRight');
  await d.flush();
  assert.match(p.querySelector('.pk-empty').textContent, /burada klasör yok/);
  assert.ok(!p.querySelector('.pk-back').disabled);
  d.click(p.querySelector('.pk-back'));
  await d.flush();
  assert.equal(rows().length, 4);
  assert.ok(!p.querySelector('.pk-fwd').disabled);
  d.click(p.querySelector('.pk-fwd'));
  await d.flush();
  assert.deepEqual([...p.querySelectorAll('.pk-crumbs span')].map((s) => s.textContent), ['~', 'Documents', 'Repos', 'app']);
  d.key('ArrowLeft');
  await d.flush();
  d.key('ArrowUp', { metaKey: true });
  await d.flush();
  assert.deepEqual([...p.querySelectorAll('.pk-crumbs span')].map((s) => s.textContent), ['~', 'Documents']);
  // a crumb, a place
  d.click(p.querySelectorAll('.pk-crumbs span')[0]);
  await d.flush();
  assert.equal(d.ov('listDir').at(-1).path, HOME);
  d.click(p.querySelectorAll('.pk-place')[1]);
  await d.flush();
  assert.ok(p.querySelectorAll('.pk-place')[1].classList.contains('on'));
  // double-click a folder opens it
  d.fire(rows()[0], 'dblclick');
  await d.flush();
  assert.match(p.querySelector('.pk-sel').textContent, /~\/Documents\/Repos$/);
  // Enter chooses the selected folder (or the one shown)
  d.key('Enter');
  d.tick(430);
  assert.equal(picked, `${HOME}/Documents/Repos`);
  assert.ok(!p.classList.contains('on'));
  assert.equal(d.window.Picker.isOpen(), false);
  d.key('Enter'); // closed: nothing
});

test('picker: errors, the root, cancel by Escape, the light and a click outside', async (t) => {
  const d = boot();
  t.after(d.close);
  await d.flush();
  let cancelled = 0;
  d.window.Picker.open({ start: '/locked', onCancel: () => cancelled++ });
  await d.flush();
  const p = d.$('#picker');
  assert.match(p.querySelector('.pk-empty.err').textContent, /⚠ izin yok: \/locked/);
  d.click(p.querySelector('.pk-up'));
  await d.flush();
  assert.deepEqual([...p.querySelectorAll('.pk-crumbs span')].map((s) => s.textContent), ['/']);
  assert.ok(p.querySelector('.pk-up').disabled);
  d.click(p.querySelector('.pk-crumbs span'));
  await d.flush();
  d.key('Escape');
  d.tick(430);
  assert.equal(cancelled, 1);
  d.window.Picker.open({ start: '/', onCancel: () => cancelled++ });
  await d.flush();
  d.click(d.$('#picker .l-close'));
  d.tick(430);
  assert.equal(cancelled, 2);
  d.window.Picker.open({ start: '/', onCancel: () => cancelled++ });
  await d.flush();
  d.fire(d.$('#picker'), 'mousedown');
  d.tick(430);
  assert.equal(cancelled, 3);
  // a listing that fails leaves the skeleton
  const d2 = boot({ answers: { listDir: () => { throw new Error('x'); } } });
  t.after(d2.close);
  d2.window.Picker.open({});
  await d2.flush();
  assert.ok(d2.$('#picker .pk-skel'));
  d2.tick(700);
  assert.ok(!d2.$('#picker .pk').classList.contains('crt-on'));
});

test('picker around: 14 places; a filled one opens, an empty one is filled, right-click menu', async (t) => {
  const around = Array(14).fill(null);
  around[0] = { name: 'app', dir: `${HOME}/Documents/Repos/app` };
  around[5] = { name: 'web', dir: `${HOME}/Documents/Repos/web`, display: '~/Documents/Repos/web' };
  const d = boot({ around });
  t.after(d.close);
  await d.flush();
  d.window.Overlay.newTerminal();
  await d.flush();
  const p = d.$('#picker');
  assert.ok(p.classList.contains('around'));
  assert.equal(p.querySelector('.pk-title b').textContent, 'YENİ TERMİNAL');
  const tiles = () => p.querySelectorAll('.sc-tile');
  assert.equal(tiles().length, 14);
  assert.deepEqual([...p.querySelectorAll('.pk-around')].map((b) => b.querySelectorAll('.sc-tile').length), [4, 3, 4, 3]);
  assert.equal(tiles()[0].querySelector('.nm').textContent, 'app');
  // The places arrive after the tiles are drawn; the tiles are drawn again with ~ once home is known.
  assert.equal(tiles()[0].querySelector('.sub').textContent, '~/Documents/Repos');
  assert.equal(tiles()[0].title, '~/Documents/Repos/app');
  assert.ok(tiles()[1].classList.contains('empty'));
  assert.equal(tiles()[1].title, 'Kısayol 2: klasör seç');
  // an empty one: assigning
  d.click(tiles()[1]);
  assert.ok(p.classList.contains('assigning'));
  assert.ok(tiles()[1].classList.contains('assigning'));
  assert.equal(tiles()[1].querySelector('.nm').textContent, 'bir klasör seç');
  assert.equal(p.querySelector('.pk-ok').textContent, '2. kısayol olarak kaydet');
  assert.match(p.querySelector('.pk-sel').textContent, /^kısayol 2 → /);
  // another empty one moves the assignment; clicking it again stops
  d.click(tiles()[2]);
  assert.ok(!tiles()[1].classList.contains('assigning'));
  d.click(tiles()[2]);
  assert.ok(!p.classList.contains('assigning'));
  // (Cancel, labelled "Geri" while assigning: see the BUG test below.)
  // assign and save
  d.click(tiles()[3]);
  d.click(p.querySelector('.pk-row[data-i="1"]'));
  d.key('Enter');
  await d.flush();
  assert.equal(d.store.picker[3].dir, `${HOME}/Documents/Repos/web`);
  assert.equal(d.ov('saveSlots').at(-1).set, 'picker');
  assert.ok(tiles()[3].classList.contains('flash'));
  assert.equal(toastText(d), 'kısayol 4 → web');
  // right-click: the menu; Escape removes it first
  d.fire(tiles()[5], 'contextmenu', { clientX: 2000, clientY: 2000 });
  const ctx = () => p.querySelector('.pk-ctx');
  assert.equal(ctx().querySelector('.t').textContent, '~/Documents/Repos/web');
  assert.equal(ctx().style.left, `${1024 - 230}px`);
  d.key('Escape');
  assert.equal(ctx(), null);
  assert.ok(p.classList.contains('on'));
  d.fire(tiles()[1], 'contextmenu'); // empty: nothing
  assert.equal(ctx(), null);
  d.fire(tiles()[5], 'contextmenu', { clientX: 5, clientY: 5 });
  d.click(ctx().querySelector('[data-a="change"]'));
  await d.flush();
  assert.ok(p.classList.contains('assigning'));
  assert.equal(d.ov('listDir').at(-1).path, `${HOME}/Documents/Repos/web`);
  d.key('Escape'); // ends the assignment, the picker stays
  assert.ok(!p.classList.contains('assigning'));
  d.fire(tiles()[5], 'contextmenu', { clientX: 5, clientY: 5 });
  d.click(ctx().querySelector('.t'));
  d.click(ctx().querySelector('[data-a="remove"]'));
  await d.flush();
  assert.equal(d.store.picker[5], null);
  assert.ok(tiles()[5].classList.contains('empty'));
  // a mousedown with the menu up only closes the menu
  d.fire(tiles()[0], 'contextmenu', { clientX: 5, clientY: 5 });
  d.fire(p, 'mousedown');
  assert.equal(ctx(), null);
  assert.ok(p.classList.contains('on'));
  d.fire(tiles()[0], 'contextmenu', { clientX: 5, clientY: 5 });
  d.click(ctx().querySelector('[data-a="open"]'));
  d.tick(430);
  assert.deepEqual(d.ov('newTerminal').map((m) => [m.dir, m.name]), [[`${HOME}/Documents/Repos/app`, 'app']]);
  assert.equal(d.ov('done').length, 1);
  // a filled tile opens at once; cancelling the picker also says done
  d.window.Overlay.newTerminal();
  await d.flush();
  d.click(p.querySelectorAll('.sc-tile')[0]);
  d.tick(430);
  assert.equal(d.ov('newTerminal').length, 2);
  d.window.Overlay.newTerminal();
  await d.flush();
  d.key('Escape');
  d.tick(430);
  assert.equal(d.ov('done').length, 3);
});

test('picker around: a failing save keeps the place; Windows paths', async (t) => {
  const d = boot({ answers: { saveSlots: () => ({ error: 'nope' }) } });
  t.after(d.close);
  await d.flush();
  d.window.Overlay.newTerminal();
  await d.flush();
  const p = d.$('#picker');
  d.click(p.querySelectorAll('.sc-tile')[0]);
  d.click(p.querySelector('.pk-ok'));
  await d.flush();
  assert.equal(toastText(d), 'kısayol kaydedilemedi: nope');
  assert.ok(p.classList.contains('assigning'));
  // Windows
  const win = {
    'C:\\Repos': { path: 'C:\\Repos', parent: 'C:\\', entries: [{ name: 'app', path: 'C:\\Repos\\app' }] },
    'C:\\': { path: 'C:\\', parent: null, entries: [] },
  };
  const d2 = boot({
    globals: { __platform: 'win32' },
    around: [{ name: 'app', dir: 'C:\\Repos\\app' }],
    answers: { listDir: (m) => win[m.path] || { path: m.path, parent: null, entries: [] }, places: () => ({ home: 'C:\\Users\\me', favorites: [], recents: [{ name: 'x', path: 'C:\\Users\\me\\x', t: Date.now() }, { name: 'y', path: 'D:\\y', t: Date.now() }] }) },
  });
  t.after(d2.close);
  await d2.flush();
  d2.window.Picker.open({ start: 'C:\\Repos', around: 'picker' });
  await d2.flush();
  const p2 = d2.$('#picker');
  assert.deepEqual([...p2.querySelectorAll('.pk-crumbs span')].map((s) => s.textContent), ['C:', 'Repos']);
  assert.equal(p2.querySelector('.sc-tile .sub').textContent, 'C:\\Repos');
  assert.match(p2.querySelectorAll('.pk-place small')[0].textContent, /^~ · az önce/);
  assert.match(p2.querySelectorAll('.pk-place small')[1].textContent, /^D:\\ · az önce/);
  d2.click(p2.querySelectorAll('.pk-crumbs span')[0]);
  await d2.flush();
  assert.equal(d2.ov('listDir').at(-1).path, 'C:\\');
  assert.match(p2.querySelector('.pk-up').title, /Ctrl\+↑/);
});

test('fixed picker.js:381: Ctrl/⌘+↓ should open the selected folder, but the plain ↓ branch catches it first', async (t) => {
  const d = boot();
  t.after(d.close);
  await d.flush();
  d.window.Picker.open({});
  await d.flush();
  d.key('ArrowDown');
  d.key('ArrowDown', { metaKey: true });
  await d.flush();
  assert.deepEqual([...d.$$('#picker .pk-crumbs span')].map((s) => s.textContent), ['~', 'Documents', 'Repos', 'app']);
});

test('fixed picker.js:62: the "Geri" button while filling a place should go back, but closes the picker', async (t) => {
  const d = boot();
  t.after(d.close);
  await d.flush();
  d.window.Overlay.newTerminal();
  await d.flush();
  const p = d.$('#picker');
  d.click(p.querySelectorAll('.sc-tile')[1]);
  assert.equal(p.querySelector('.pk-cancel').textContent, 'Geri');
  d.click(p.querySelector('.pk-cancel'));
  d.tick(430);
  assert.ok(p.classList.contains('on'));
  assert.ok(!p.classList.contains('assigning'));
});

test('fixed shortcuts.js:192: reopening the pie during its closing animation lets the old close tell the app "done"', async (t) => {
  const d = boot();
  t.after(d.close);
  await d.flush();
  d.window.Shortcuts.open(500, 400);
  d.key('Escape');
  d.tick(100);
  d.window.Shortcuts.open(500, 400);
  d.tick(200);
  assert.ok(d.$('#shortcuts').classList.contains('on'));
  assert.equal(d.ov('done').length, 0);
});

test('fixed picker.js:87-102: shortcut places that arrive before the home folder are drawn again with ~', async (t) => {
  let release;
  const d = boot({ around: [{ name: 'app', dir: `${HOME}/Documents/Repos/app` }], answers: { places: () => new Promise((r) => (release = r)) } });
  t.after(d.close);
  await d.flush();
  d.window.Overlay.newTerminal();
  await d.flush();
  const tile = () => d.$('#picker .sc-tile[data-i="0"]');
  assert.equal(tile().title, `${HOME}/Documents/Repos/app`);
  release(places);
  await d.flush();
  assert.equal(tile().title, '~/Documents/Repos/app');
  assert.equal(tile().querySelector('.sub').textContent, '~/Documents/Repos');
});
