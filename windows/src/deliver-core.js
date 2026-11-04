'use strict';
// Pure helpers for the "Teslim paketi" (delivery) action — no Electron, unit-testable.
const path = require('path');

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const IMG = /\.(jpe?g|png)$/i;
const ROOT_MARKS = new Set(['render', 'videolar', 'assets', 'kapak', 'teslim']);

// <proje> for a file: the folder above its Render\ / Videolar\ / Assets\ (deepest such mark), else its own folder.
function projectRootOf(p, P = path) {
  const abs = P.resolve(String(p || ''));
  const dir = P.dirname(abs);
  const parts = dir.split(/[\\/]+/);
  for (let i = parts.length - 1; i > 0; i--) {
    if (ROOT_MARKS.has(norm(parts[i]))) return parts.slice(0, i).join(P.sep) || P.sep;
  }
  return dir;
}

// entries: [{name, mtime}] from <proje>\Kapak — the newest jpg/png, or null.
function findCover(entries) {
  let best = null;
  for (const e of entries || []) {
    if (!e || !IMG.test(e.name || '')) continue;
    const t = typeof e.mtime === 'number' ? e.mtime : new Date(e.mtime || 0).getTime();
    if (!best || t > best.t) best = { name: e.name, t };
  }
  return best ? best.name : null;
}

const pad = (n) => (n < 10 ? '0' : '') + n;
const dateStamp = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// The folders a delivery writes into: [{kind, dir}] (raw: next to the raw footage, teslim: <proje>\Teslim\<tarih>).
function deliverTargets({ root, rawDir, teslimDir, date, raw, teslim }, P = path) {
  const out = [];
  if (teslim && root) out.push({ kind: 'teslim', dir: teslimDir || P.join(root, 'Teslim', date || dateStamp()) });
  if (raw && rawDir) out.push({ kind: 'raw', dir: rawDir });
  const seen = new Set();
  return out.filter((t) => {
    const k = norm(P.resolve(t.dir));
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// "x.mp4" → "x (2).mp4", "x (3).mp4"… until exists(name) is false. Never overwrites.
function uniqueName(name, exists) {
  if (!exists(name)) return name;
  const ext = path.extname(name), base = name.slice(0, name.length - ext.length);
  for (let i = 2; i < 1000; i++) {
    const n = `${base} (${i})${ext}`;
    if (!exists(n)) return n;
  }
  return `${base} (${Date.now()})${ext}`;
}

// The raw-footage folder remembered in <proje>\NOTLAR.md as "Ham çekim klasörü: <yol>".
const RAW_RE = /^[-*\s]*Ham çekim klasörü\s*:\s*(.+?)\s*$/im;
const rawDirFromNotes = (text) => {
  const m = RAW_RE.exec(String(text || ''));
  return m ? m[1].replace(/^`|`$/g, '') : null;
};
const rawDirNoteLine = (dir) => `Ham çekim klasörü: ${dir}`;

module.exports = { projectRootOf, findCover, deliverTargets, uniqueName, dateStamp, rawDirFromNotes, rawDirNoteLine };
