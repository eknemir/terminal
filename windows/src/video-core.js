'use strict';
// Pure-ish core of the Videos tab: which folders of a project are scanned and how
// each file is grouped. Folder convention:
//   <proje>\Render\**            -> 'final'    (deliverable)
//   <proje>\Assets\Onizleme\**   -> 'onizleme' (preview / revision renders)
//   <proje>\Videolar\**          -> 'videolar' (generated clips)
//   none of these -> top level of the chosen folder only -> 'klasor'
const fs = require('fs');
const path = require('path');

const VIDEO_EXT = new Set(['.mp4', '.mov', '.webm', '.m4v']);
const isVideoName = (n) => VIDEO_EXT.has(path.extname(String(n)).toLowerCase());
const MAX_DEPTH = 3;
const WRITING_MS = 2000;

// lower-case, strip diacritics (Önizleme -> onizleme, İ -> i)
function norm(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}
function folderGroup(name) {
  const n = norm(name);
  if (n === 'render') return 'final';
  if (n === 'onizleme') return 'onizleme';
  if (n === 'videolar') return 'videolar';
  return null;
}
function segs(p) {
  return String(p || '').split(/[\\/]+/).filter(Boolean);
}

// root: the chosen folder; p: a file path. Returns 'final' | 'onizleme' | 'videolar' | 'klasor' | null.
function classifyVideoPath(root, p) {
  if (typeof root !== 'string' || typeof p !== 'string' || !root || !p) return null;
  const r = path.resolve(root), f = path.resolve(p);
  const rel = path.relative(r, f);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null;
  const s = segs(rel);
  if (!isVideoName(s[s.length - 1])) return null;
  const self = folderGroup(path.basename(r));
  if (self) return s.length - 1 <= MAX_DEPTH ? self : null;
  const dirs = s.slice(0, -1).map(norm);
  if (dirs[0] === 'render' && dirs.length - 1 <= MAX_DEPTH) return 'final';
  if (dirs[0] === 'videolar' && dirs.length - 1 <= MAX_DEPTH) return 'videolar';
  if (dirs[0] === 'assets' && dirs[1] === 'onizleme' && dirs.length - 2 <= MAX_DEPTH) return 'onizleme';
  if (dirs.length === 0) return 'klasor';
  return null;
}

// Folders to scan for root: [{dir, group}]. Case-insensitive match on real entries.
async function scanTargets(root) {
  const r = path.resolve(root);
  const self = folderGroup(path.basename(r));
  if (self) return [{ dir: r, group: self, depth: MAX_DEPTH }];
  const out = [];
  const sub = async (d) => {
    try { return await fs.promises.readdir(d, { withFileTypes: true }); } catch { return []; }
  };
  for (const e of await sub(r)) {
    if (!e.isDirectory()) continue;
    const n = norm(e.name);
    if (n === 'render') out.push({ dir: path.join(r, e.name), group: 'final', depth: MAX_DEPTH });
    else if (n === 'videolar') out.push({ dir: path.join(r, e.name), group: 'videolar', depth: MAX_DEPTH });
    else if (n === 'assets') {
      for (const a of await sub(path.join(r, e.name))) {
        if (a.isDirectory() && norm(a.name) === 'onizleme') out.push({ dir: path.join(r, e.name, a.name), group: 'onizleme', depth: MAX_DEPTH });
      }
    }
  }
  if (!out.length) out.push({ dir: r, group: 'klasor', depth: 0 });
  return out;
}

// path -> {size, at}: last seen size, to catch files still growing
const lastSeen = new Map();

// writing: modified < 2s ago, or size changed since a scan < 2s ago
function isWriting(p, size, mtimeMs, now) {
  const prev = lastSeen.get(p);
  lastSeen.set(p, { size, at: now });
  if (now - mtimeMs < WRITING_MS) return true;
  return !!(prev && prev.size !== size && now - prev.at < WRITING_MS);
}

// -> [{path, name, size, mtime, group, writing}] newest first, unbounded (caller slices)
async function listVideos(root, now = Date.now()) {
  const out = [];
  const walk = async (d, depth, group) => {
    let ents;
    try { ents = await fs.promises.readdir(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        if (depth > 0 && e.name !== 'node_modules' && e.name !== '.git') await walk(p, depth - 1, group);
      } else if (e.isFile() && isVideoName(e.name)) {
        try {
          const st = await fs.promises.stat(p);
          out.push({ path: p, name: e.name, size: st.size, mtime: st.mtimeMs, group, writing: isWriting(p, st.size, st.mtimeMs, now) });
        } catch {}
      }
    }
  };
  for (const t of await scanTargets(root)) await walk(t.dir, t.depth, t.group);
  out.sort((a, b) => b.mtime - a.mtime);
  return out;
}

module.exports = { classifyVideoPath, scanTargets, listVideos, isWriting, folderGroup, norm, WRITING_MS };
