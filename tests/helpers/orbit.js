'use strict';
// Loads app/orbit's ES modules in Node: 'three' is swapped for tests/helpers/three-stub.mjs (no WebGL, no npm
// install), and a fake `document` hands out canvases whose 2D context records every call.
//
//   const { importOrbit, fakeCanvas } = require('../helpers/orbit');
//   const { buildCore } = await importOrbit('core.js');
const path = require('path');
const { pathToFileURL } = require('url');
const mod = require('module');

const ORBIT = path.join(__dirname, '..', '..', 'app', 'orbit');
const STUB = pathToFileURL(path.join(__dirname, 'three-stub.mjs')).href;

let hooked = false;
function hook() {
  if (hooked) return;
  hooked = true;
  mod.registerHooks({
    resolve(specifier, context, next) {
      if (specifier === 'three' || specifier.startsWith('three/')) return { url: STUB, shortCircuit: true };
      return next(specifier, context);
    },
  });
}

// A 2D context that records calls (`calls`: [name, ...args]) and property writes (`sets`: [prop, value]).
// measureText: 0.6 x font size per character, so text-fitting loops terminate.
function fakeContext() {
  const calls = [], sets = [];
  const state = { font: '10px sans-serif' };
  const gradient = () => ({ stops: [], addColorStop(o, c) { this.stops.push([o, c]); } });
  const target = {
    calls, sets,
    measureText(t) {
      const m = /(\d+(?:\.\d+)?)px/.exec(state.font);
      return { width: String(t).length * (m ? +m[1] : 10) * 0.6 };
    },
    createRadialGradient(...a) { calls.push(['createRadialGradient', ...a]); return gradient(); },
  };
  return new Proxy(target, {
    get(t, k) {
      if (k in t) return t[k];
      if (k in state) return state[k];
      return (...a) => { calls.push([k, ...a]); };
    },
    set(t, k, v) { state[k] = v; sets.push([k, v]); return true; },
  });
}

function fakeCanvas() {
  const ctx = fakeContext();
  return { width: 0, height: 0, ctx, getContext: () => ctx };
}

// Installs a global `document` whose createElement('canvas') returns fake canvases (collected in `canvases`).
function installDocument() {
  const canvases = [];
  globalThis.document = {
    createElement(tag) {
      if (tag !== 'canvas') {
        return { tagName: tag.toUpperCase(), className: '', innerHTML: '', textContent: '' };
      }
      const c = fakeCanvas();
      canvases.push(c);
      return c;
    },
  };
  return canvases;
}

async function importOrbit(file) {
  hook();
  return import(pathToFileURL(path.join(ORBIT, file)).href);
}

module.exports = { importOrbit, installDocument, fakeCanvas, fakeContext, ORBIT };
