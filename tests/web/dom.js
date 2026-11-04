'use strict';
// A jsdom page for the dashboard's browser scripts (app/Resources/web): index.html (or another page) without its
// scripts, a stub window.webkit.messageHandlers that records every message and answers through `reply`, fake timers
// (nothing real keeps running after a test) and the few browser APIs jsdom lacks. Scripts run in the page's own
// context with their real file names, so coverage counts them.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM, VirtualConsole } = require('jsdom');

const WEB = path.join(__dirname, '..', '..', 'app', 'Resources', 'web');

function pageHTML(page) {
  const html = page.startsWith('<') ? page : fs.readFileSync(path.join(WEB, page), 'utf8');
  // The page's own scripts and styles stay out: each test loads the scripts it needs.
  return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<link\b[^>]*>/gi, '');
}

// opts:
//   page      'index.html' (default), another page in web/, or an HTML string
//   reply     { handlerName: value | (msg) => value }: what postMessage answers (as a promise); a function that
//             throws makes the promise reject. Handlers listed in `handlers` (default radar, cloud, git, messages)
//             exist; others only when named in reply.
//   handlers  names of message handlers to create (in addition to the ones in reply)
//   storage   initial localStorage { key: value }
//   globals   more window globals { name: value }, set before any script runs
//   noWebkit  true: no window.webkit at all
function makeDom(opts = {}) {
  const vc = new VirtualConsole();
  const errors = [];
  vc.on('jsdomError', (e) => {
    if (!/Not implemented/.test(e.message)) errors.push(e);
  });
  const dom = new JSDOM(pageHTML(opts.page || 'index.html'), { url: 'http://localhost/', virtualConsole: vc, pretendToBeVisual: true, runScripts: 'outside-only' });
  const w = dom.window;

  // ---------- fake timers ----------
  let now = 0, seq = 0;
  const timers = new Map();
  const add = (fn, ms, every, args) => {
    const id = ++seq;
    timers.set(id, { fn, at: now + Math.max(0, Number(ms) || 0), every: every ? Math.max(1, Number(ms) || 0) : 0, args });
    return id;
  };
  w.setTimeout = (fn, ms, ...args) => add(fn, ms, false, args);
  w.setInterval = (fn, ms, ...args) => add(fn, ms, true, args);
  w.clearTimeout = w.clearInterval = (id) => timers.delete(id);
  w.requestAnimationFrame = (fn) => add(() => fn(now), 16, false, []);
  w.cancelAnimationFrame = (id) => timers.delete(id);
  const perfNow = () => now;
  try {
    Object.defineProperty(w.performance, 'now', { value: perfNow, configurable: true });
  } catch {
    w.performance = { now: perfNow };
  }
  // Runs every timer due within `ms`, in time order (timers they add included).
  function tick(ms = 0) {
    const end = now + ms;
    for (;;) {
      let next = null;
      for (const [id, t] of timers) if (t.at <= end && (!next || t.at < next[1].at || (t.at === next[1].at && id < next[0]))) next = [id, t];
      if (!next) break;
      const [id, t] = next;
      now = t.at;
      if (t.every) t.at += t.every;
      else timers.delete(id);
      if (typeof t.fn === 'function') t.fn(...t.args);
    }
    now = end;
  }

  // ---------- what jsdom lacks ----------
  const observers = [];
  w.ResizeObserver = class {
    constructor(cb) { this.cb = cb; observers.push(this); }
    observe(el) { this.el = el; }
    unobserve() {}
    disconnect() {}
  };
  if (!w.CSS) w.CSS = {};
  if (!w.CSS.escape) w.CSS.escape = (s) => String(s).replace(/([^\w-])/g, '\\$1');
  w.Element.prototype.scrollIntoView = function () {};
  w.Element.prototype.animate = function () { return { cancel() {}, finished: Promise.resolve() }; };
  if (!w.document.hasFocus) w.document.hasFocus = () => true;
  const audio = [];
  w.AudioContext = class {
    constructor() { this.state = 'running'; this.currentTime = 0; this.destination = {}; audio.push(this); this.made = []; }
    resume() { this.state = 'running'; }
    suspend() { this.state = 'suspended'; }
    createOscillator() { const o = { frequency: {}, connect: (n) => n, start() {}, stop() {} }; this.made.push(o); return o; }
    createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect: (n) => n }; }
  };

  // ---------- storage ----------
  for (const [k, v] of Object.entries(opts.storage || {})) w.localStorage.setItem(k, v);

  // ---------- the native bridge ----------
  const posted = [];
  const reply = opts.reply || {};
  const names = new Set([...(opts.handlers || ['radar', 'cloud', 'git', 'messages']), ...Object.keys(reply)]);
  if (!opts.noWebkit) {
    const messageHandlers = {};
    for (const name of names) {
      messageHandlers[name] = {
        postMessage: (msg) => {
          // Copied out of the page's realm so tests can deepEqual it.
          let plain;
          try { plain = JSON.parse(JSON.stringify(msg)); } catch { plain = msg; }
          posted.push({ h: name, ...plain });
          const r = reply[name];
          try {
            return w.Promise.resolve(typeof r === 'function' ? r(plain) : r);
          } catch (e) {
            return w.Promise.reject(e);
          }
        },
      };
    }
    w.webkit = { messageHandlers };
  }
  for (const [k, v] of Object.entries(opts.globals || {})) w[k] = v;

  const ctx = dom.getInternalVMContext();
  function run(...files) {
    for (const f of files.flat()) {
      const file = path.join(WEB, f);
      vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
    }
    return api;
  }
  // Evaluates an expression in the page (reaches script-level const/let/function bindings).
  const ev = (code) => vm.runInContext(code, ctx);

  const $ = (s) => w.document.querySelector(s);
  const $$ = (s) => [...w.document.querySelectorAll(s)];
  const click = (el, init = {}) => {
    if (typeof el === 'string') el = $(el);
    if (!el) throw new Error('click: no element');
    el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true, ...init }));
    return el;
  };
  const fire = (el, type, init = {}, Ctor) => {
    if (typeof el === 'string') el = $(el);
    const C = Ctor || (/^key/.test(type) ? w.KeyboardEvent : /mouse|click|contextmenu/.test(type) ? w.MouseEvent : w.Event);
    const e = new C(type, { bubbles: true, cancelable: true, ...init });
    el.dispatchEvent(e);
    return e;
  };
  const key = (k, init = {}, target) => fire(target || w.document.body, 'keydown', { key: k, ...init });
  const type = (input, value) => {
    if (typeof input === 'string') input = $(input);
    input.value = value;
    input.dispatchEvent(new w.Event('input', { bubbles: true }));
    return input;
  };
  // Lets pending promise callbacks (bridge replies, awaits) run.
  const flush = async (n = 6) => {
    for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r));
  };
  const sent = (type, h) => posted.filter((m) => m.type === type && (!h || m.h === h));
  const close = () => {
    timers.clear();
    w.close();
  };

  const api = { dom, window: w, document: w.document, run, ev, $, $$, click, fire, key, type, flush, tick, posted, sent, observers, audio, errors, close, timers, now: () => now };
  return api;
}

module.exports = { makeDom, WEB };
