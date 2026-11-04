'use strict';
// Requires a windows/src module with `electron` (and any other module) replaced by stubs.
//   const { requireWith } = require('../helpers/electron');
//   const m = requireWith('windows/src/guards.js', { electron: fakeElectron() });
const Module = require('module');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');

function fakeElectron(over = {}) {
  const noop = () => {};
  const ipc = { handlers: {}, on(ch, f) { this.handlers[ch] = f; }, handle(ch, f) { this.handlers[ch] = f; }, removeHandler: noop };
  return {
    app: { isPackaged: false, getPath: () => require('os').tmpdir(), getVersion: () => '0.0.0-test', on: noop, whenReady: () => Promise.resolve() },
    ipcMain: ipc,
    ipcRenderer: { on: noop, send: noop, invoke: () => Promise.resolve(null) },
    contextBridge: { exposed: {}, exposeInMainWorld(k, v) { this.exposed[k] = v; } },
    protocol: { registerSchemesAsPrivileged: noop, handle: noop },
    shell: { openExternal: () => Promise.resolve(), showItemInFolder: noop },
    dialog: { showOpenDialog: () => Promise.resolve({ canceled: true, filePaths: [] }), showMessageBox: () => Promise.resolve({ response: 0 }) },
    nativeTheme: { shouldUseDarkColors: true, on: noop },
    screen: { getPrimaryDisplay: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }) },
    clipboard: { writeText: noop, readText: () => '' },
    ...over,
  };
}

// file: path relative to the repo root. stubs: { moduleId: exports }. Fresh copy every call (cache cleared).
function requireWith(file, stubs = {}) {
  const abs = path.join(ROOT, file);
  const orig = Module._load;
  Module._load = function (request, parent, isMain) {
    if (Object.prototype.hasOwnProperty.call(stubs, request)) return stubs[request];
    return orig.call(this, request, parent, isMain);
  };
  try {
    delete require.cache[require.resolve(abs)];
    return require(abs);
  } finally {
    Module._load = orig;
  }
}

module.exports = { fakeElectron, requireWith, ROOT };
