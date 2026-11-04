'use strict';
// Pure helpers of main.js, kept here so they can be unit-tested without Electron (tests/main/main-core.test.js).
const fs = require('fs');
const path = require('path');

/** A process's command line as a car's label: `"C:\…\node.exe" "C:\…\npm-cli.js" run dev` -> "npm run dev". */
function commandLabel(cmd) {
  // A path is cut to its last part; a switch (/c) stays as it is.
  const words = (String(cmd).match(/"[^"]*"|\S+/g) || []).map((w) => w.replace(/^"|"$/g, '')).filter(Boolean)
    .map((w) => (/\\|.\//.test(w) ? path.win32.basename(w) : w));
  if (words.length) words[0] = words[0].replace(/\.(exe|cmd|bat)$/i, '');
  if (/^node(js)?$/i.test(words[0] || '') && words.length > 1) words.shift();
  if (/^np[mx]-cli\.js$/i.test(words[0] || '')) words[0] = words[0].slice(0, 3).toLowerCase();
  const label = words.join(' ');
  return label.length > 48 ? `${label.slice(0, 47)}…` : label;
}

/** A window's rect `r` moved (and shrunk only where the area is smaller) to lie wholly in work area `a`. */
function fitInArea(r, a) {
  const width = Math.min(r.width, a.width), height = Math.min(r.height, a.height);
  return { x: Math.min(Math.max(r.x, a.x), a.x + a.width - width), y: Math.min(Math.max(r.y, a.y), a.y + a.height - height), width, height };
}

/** Whether version `a` is newer than `b` ("0.15.1" than "0.15.0"): the numbers only, as the releases have them. */
function newerVersion(a, b) {
  const nums = (v) => String(v || '').split(/[-+]/)[0].split('.').map((n) => parseInt(n, 10) || 0);
  const [x, y] = [nums(a), nums(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  }
  return false;
}

function notesOf(n) {
  if (!n) return '';
  const text = Array.isArray(n) ? n.map((x) => x.note || '').join('\n') : String(n);
  return text.replace(/<[^>]+>/g, '\n').split(/\n+/).map((s) => s.trim()).filter(Boolean).join('\n');
}

function countFiles(dir) {
  let n = 0;
  const walk = (d, depth) => {
    if (depth > 6 || n > 5000) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) walk(path.join(d, e.name), depth + 1); else n++;
    }
  };
  try { walk(dir, 0); } catch {}
  return n;
}

// Directories under root holding a SKILL.md (root itself included), no deeper than 4 levels.
function findSkillDirs(root) {
  const found = [];
  const walk = (d, depth) => {
    if (fs.existsSync(path.join(d, 'SKILL.md'))) { found.push(d); return; }
    if (depth >= 4) return;
    let ents = [];
    try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) if (e.isDirectory() && !e.isSymbolicLink() && e.name !== '__MACOSX') walk(path.join(d, e.name), depth + 1);
  };
  walk(root, 0);
  return found;
}

// Nothing in an extracted tree may point outside it (zip-slip, links).
function treeIsContained(root) {
  const base = fs.realpathSync(root);
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isSymbolicLink()) return false;
      const rel = path.relative(base, fs.realpathSync(p));
      if (rel.startsWith('..') || path.isAbsolute(rel)) return false;
      if (e.isDirectory() && !walk(p)) return false;
    }
    return true;
  };
  return walk(base);
}

module.exports = { commandLabel, fitInArea, newerVersion, notesOf, countFiles, findSkillDirs, treeIsContained };
