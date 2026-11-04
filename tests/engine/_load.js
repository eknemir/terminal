'use strict';
// Loads windows/src/engine.js with its private helpers exposed (`__t`), without editing it: the source is compiled
// under its own filename with one extra statement appended to its last line, so line numbers (and coverage) still
// match the file. Options:
//   home:  the home folder os.homedir() reports while the module loads (HOME is read once, at load time)
//   stubs: { moduleId: exports } replacing top-level requires (e.g. 'node:child_process')
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');

const FILE = path.join(__dirname, '..', '..', 'windows', 'src', 'engine.js');
const FIXTURES = path.join(__dirname, 'fixtures');

const NAMES = [
  'PRICES', 'priceFor', 'contextLimit', 'autoCompactWindow', 'compactSetting', 'tokenCount', 'costOf', 'savedOf',
  'shortModel', 'CATS', 'catOf', 'isObj', 'int', 'str', 'clip', 'redact', 'parseURL', 'urlPath', 'hostPath', 'hostOf',
  'shortPath', 'baseName', 'tildify', 'cwdLabel', 'fmtBytes', 'trimWs', 'summarize', 'resultMeta', 'codexCall',
  'readNewLines', 'agyOpen', 'agyClose', 'agyConversation', 'agySteps', 'agyPlanned', 'agyCall', 'agyRequest',
  'agyValue', 'agyArg', 'agyTool', 'agyLog', 'codexLog', 'parseISO', 'dayStart', 'fullText', 'toolDetail',
  'outputPreview', 'parseTail', 'skipped', 'withoutImages', 'parseLine', 'seekTime', 'readFirstCwd', 'readChat',
  'parseLimits', 'alive', 'processTable', 'ancestors', 'sameStart', 'Track', 'Session', 'SubAgent', 'FileHeat',
  'freshGlobals', 'RadarEngine', 'HOME', 'WIN',
];

function loadEngine({ home, stubs = {} } = {}) {
  const src = fs.readFileSync(FILE, 'utf8').replace(/\s+$/, '') + ` module.exports.__t = { ${NAMES.join(', ')} };\n`;
  const saved = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE };
  if (home) {
    process.env.HOME = home;
    process.env.USERPROFILE = home;
  }
  const orig = Module._load;
  Module._load = function (request, parent, isMain) {
    if (Object.prototype.hasOwnProperty.call(stubs, request)) return stubs[request];
    return orig.call(this, request, parent, isMain);
  };
  try {
    const m = new Module(FILE, module);
    m.filename = FILE;
    m.paths = Module._nodeModulePaths(path.dirname(FILE));
    m._compile(src, FILE);
    return m.exports;
  } finally {
    Module._load = orig;
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

// A fresh temp folder, removed by the returned cleanup.
function tmpDir(prefix = 'engine-test-') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  return { dir, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

// Fixture text with relative times filled in: "@-90" is the ISO time 90 s before `base` (ms), "@+5" 5 s after.
function fixture(name, base = Date.now()) {
  return fs.readFileSync(path.join(FIXTURES, name), 'utf8').replace(/@([+-]\d+)/g, (_, s) => new Date(base + Number(s) * 1000).toISOString());
}

function write(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  return file;
}

// JSONL from records.
const jsonl = (recs) => recs.map((r) => (typeof r === 'string' ? r : JSON.stringify(r))).join('\n') + '\n';
const iso = (ms) => new Date(ms).toISOString();

module.exports = { loadEngine, tmpDir, fixture, write, jsonl, iso, FIXTURES, FILE };
