'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { requireWith, fakeElectron } = require('../helpers/electron');

function load(boot) {
  const sent = [], invoked = [], on = {}, css = [], removed = [], winListeners = {}, events = [];
  let key = 0;
  const electron = fakeElectron({
    ipcRenderer: {
      sendSync: (ch) => { sent.push([ch]); return boot; },
      send: (ch, d) => sent.push([ch, d]),
      invoke: (...a) => { invoked.push(a); return Promise.resolve('reply'); },
      on: (ch, f) => { on[ch] = f; },
    },
    webFrame: { insertCSS: (c, o) => { css.push([c, o]); return `k${++key}`; }, removeInsertedCSS: (k) => removed.push(k) },
    webUtils: { getPathForFile: (f) => { if (f === 'bad') throw new Error('x'); return f && f.p; } },
  });
  const prevWindow = global.window, prevEvent = global.Event;
  global.window = {
    addEventListener: (t, f, cap) => { (winListeners[t] = winListeners[t] || []).push({ f, cap }); },
    dispatchEvent: (e) => events.push(e),
  };
  global.Event = class { constructor(type) { this.type = type; } };
  void prevWindow;
  // `window` stays: the preload's handlers read it when they run (the last load's window)
  try {
    requireWith('windows/src/preload.js', { electron });
  } finally {
    global.Event = prevEvent;
  }
  return { electron, exposed: electron.contextBridge.exposed, sent, invoked, on, css, removed, winListeners, events, Event: class { constructor(t) { this.type = t; } } };
}
const press = (over = {}) => {
  const e = { button: 1, ctrlKey: true, prevented: 0, stopped: 0, ...over };
  e.preventDefault = () => e.prevented++;
  e.stopImmediatePropagation = () => e.stopped++;
  return e;
};

test('boot values exposed only when given; handlers post over IPC', async () => {
  const t = load({ look: { font: 'x' }, role: 'notices', friend: 'f1', css: ':root{}' });
  assert.deepEqual(t.sent[0], ['atl:boot']);
  assert.deepEqual(Object.keys(t.exposed.webkit.messageHandlers).sort(), ['archive', 'chats', 'cloud', 'git', 'messages', 'overlay', 'radar', 'savers', 'theme']);
  assert.equal(await t.exposed.webkit.messageHandlers.git.postMessage({ type: 'repos' }), 'reply');
  assert.deepEqual(t.invoked, [['atl:post', 'git', { type: 'repos' }]]);
  assert.equal(t.exposed.__platform, process.platform);
  assert.deepEqual(t.exposed.__terminalLook, { font: 'x' });
  assert.equal(t.exposed.__MESSAGES_ROLE__, 'notices');
  assert.equal(t.exposed.__MESSAGES_FRIEND__, 'f1');
  const none = load(null);
  assert.equal('__terminalLook' in none.exposed, false);
  assert.equal('__MESSAGES_ROLE__' in none.exposed, false);
  assert.equal('__MESSAGES_FRIEND__' in none.exposed, false);
  assert.equal(none.css.length, 1, 'only the scrollbar sheet without a theme');
});

test('getPathForFile: the path, empty on none or error', () => {
  const t = load({});
  assert.equal(t.exposed.getPathForFile({ p: 'C:\\a.zip' }), 'C:\\a.zip');
  assert.equal(t.exposed.getPathForFile({}), '');
  assert.equal(t.exposed.getPathForFile('bad'), '');
});

test('atl bridge: only term: channels', () => {
  const t = load({});
  t.exposed.atl.send('term:input', 'x');
  assert.equal(t.exposed.atl.send('atl:boot', 'y'), false);
  assert.deepEqual(t.sent.slice(1), [['term:input', 'x']]);
  const got = [];
  t.exposed.atl.on('term:data', (d) => got.push(d));
  assert.equal(t.exposed.atl.on('other', () => {}), false);
  t.on['term:data']({}, 'D');
  assert.deepEqual(got, ['D']);
  assert.equal(t.on.other, undefined);
});

test('theme css: inserted first, replaced on change with a themechange event', () => {
  const t = load({ css: ':root{--a:1}' });
  assert.match(t.css[0][0], /scrollbar-width:thin/);
  assert.deepEqual(t.css[1], [':root{--a:1}', { cssOrigin: 'author' }]);
  t.on['atl:theme']({}, ':root{--a:2}');
  assert.deepEqual(t.removed, ['k2']);
  assert.equal(t.css[2][0], ':root{--a:2}');
  t.on['atl:theme']({}, ':root{--a:3}');
  assert.deepEqual(t.removed, ['k2', 'k3']);
  assert.deepEqual(t.events.map((e) => e.type), ['themechange', 'themechange']);
  // no boot css: nothing to remove the first time
  const n = load({});
  n.on['atl:theme']({}, 'x');
  assert.deepEqual(n.removed, []);
});

test('the shortcut wheel: Ctrl + middle button is swallowed and sent; others pass', () => {
  const t = load({});
  const down = t.winListeners.pointerdown[0];
  assert.equal(down.cap, true);
  const e = press();
  down.f(e);
  assert.equal(e.prevented, 1);
  assert.equal(e.stopped, 1);
  assert.deepEqual(t.sent.at(-1), ['atl:wheel', undefined]);
  // the rest of that press is swallowed too
  for (const type of ['mousedown', 'pointerup', 'mouseup', 'auxclick']) {
    const x = press({ ctrlKey: false });
    t.winListeners[type][0].f(x);
    assert.equal(x.prevented, 1, type);
    const left = press({ button: 0 });
    t.winListeners[type][0].f(left);
    assert.equal(left.prevented, 0, type);
  }
  // a plain middle press is not
  const plain = press({ ctrlKey: false });
  down.f(plain);
  assert.equal(plain.prevented, 0);
  const after = press({ ctrlKey: false });
  t.winListeners.mouseup[0].f(after);
  assert.equal(after.prevented, 0);
  const ctrlLeft = press({ button: 0 });
  down.f(ctrlLeft);
  assert.equal(ctrlLeft.prevented, 0);
  assert.equal(t.sent.filter((s) => s[0] === 'atl:wheel').length, 1);
});
