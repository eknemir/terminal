'use strict';
// Loads the dashboard's browser scripts (app/Resources/web/*.js) into a fresh vm context with a fake window,
// localStorage and document, so their pure helpers can be tested in Node without a browser.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const WEB = path.join(__dirname, '..', '..', 'app', 'Resources', 'web');

function fakeStorage(initial, { throwOn } = {}) {
  const m = new Map(Object.entries(initial || {}));
  const guard = (op) => { if (throwOn && throwOn.includes(op)) throw new Error(`storage ${op} blocked`); };
  return {
    getItem: (k) => { guard('get'); return m.has(k) ? m.get(k) : null; },
    setItem: (k, v) => { guard('set'); m.set(k, String(v)); },
    removeItem: (k) => { guard('remove'); m.delete(k); },
    clear: () => m.clear(),
    _map: m,
  };
}

function fakeElement(attrs = {}) {
  const a = { ...attrs };
  return {
    dataset: {},
    textContent: '',
    getAttribute: (k) => (k in a ? a[k] : null),
    setAttribute: (k, v) => { a[k] = String(v); },
    set src(v) { a.src = v; },
    get src() { return a.src; },
    set href(v) { a.href = v; },
    get href() { return a.href; },
    _attrs: a,
  };
}

// opts: storage (object of initial values), storageThrows (['get','set','remove']), readyState, selectors
// ({ selector: [elements] }), single ({ selector: element }), ids ({ id: element }), webkit (handler or null),
// image (a class standing in for Image), extra (more globals).
function load(files, opts = {}) {
  const listeners = {};
  const docListeners = {};
  const posted = [];
  const events = [];
  const observers = [];
  const localStorage = fakeStorage(opts.storage, { throwOn: opts.storageThrows });
  const document = {
    readyState: opts.readyState || 'complete',
    title: '',
    documentElement: { dataset: { ...(opts.rootDataset || {}) } },
    body: {},
    querySelectorAll: (s) => (opts.selectors && opts.selectors[s]) || [],
    querySelector: (s) => (opts.single && opts.single[s]) || null,
    getElementById: (id) => (opts.ids && opts.ids[id]) || null,
    addEventListener: (t, f) => { (docListeners[t] = docListeners[t] || []).push(f); },
    createElement: opts.createElement || (() => { throw new Error('createElement not stubbed'); }),
  };
  if (opts.patchDocument) opts.patchDocument(document);
  class CustomEvent {
    constructor(type, init) { this.type = type; this.detail = init && init.detail; }
  }
  class MutationObserver {
    constructor(cb) { this.cb = cb; observers.push(this); }
    observe(target, o) { this.target = target; this.options = o; }
  }
  const win = {
    localStorage,
    document,
    CustomEvent,
    MutationObserver,
    Image: opts.image || class {},
    console,
    Promise,
    setTimeout,
    clearTimeout,
    addEventListener: (t, f) => { (listeners[t] = listeners[t] || []).push(f); },
    dispatchEvent: (e) => { events.push(e); (listeners[e.type] || []).forEach((f) => f(e)); return true; },
    ...(opts.extra || {}),
  };
  if (opts.webkit !== null) {
    win.webkit = { messageHandlers: { radar: { postMessage: (m) => { posted.push(m); return opts.reply; } } } };
  }
  win.window = win;
  const ctx = vm.createContext(win);
  for (const f of [].concat(files)) {
    const file = path.join(WEB, f);
    vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
  }
  return {
    window: win, document, localStorage, posted, events, observers,
    fire: (type, e) => (listeners[type] || []).forEach((f) => f(e)),
    fireDoc: (type, e) => (docListeners[type] || []).forEach((f) => f(e)),
    listeners, docListeners,
  };
}

module.exports = { load, fakeElement, fakeStorage, WEB };
