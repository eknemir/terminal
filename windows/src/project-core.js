'use strict';
// Proje başlatıcı: pure helpers (no fs / electron), so they can be tested with plain node.
const path = require('path');

const DEFAULT_FOLDERS = [
  'Render',
  'Kapak',
  'Videolar',
  'Görseller',
  'Görseller/Referans',
  'Assets',
  'Assets/Onizleme',
  'Assets/Ses',
  'Assets/Tools',
  'Assets/Kontrol',
];

const DEFAULT_PROMPT =
  'Yeni video projesi: {marka} – {video}. Proje klasörü: {klasor}. Ham çekim: {ham}. Format: {format}.{muzik}{sure}\n' +
  'Önce müşteri kartını oku, sonra NOTLAR.md\'ye bak ve işe nasıl başlayacağımızı öner.';

const FORMATS = { '9:16': '9:16 Reels', '16:9': '16:9', '1:1': '1:1' };

const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)$/i;

// One folder-name segment: trimmed, no path separators / Windows-forbidden chars / control chars,
// no "." or "..", no trailing dots/spaces, max 80 chars. Returns '' when nothing usable is left.
function sanitizeName(name) {
  if (typeof name !== 'string') return '';
  let s = name
    .replace(/[\x00-\x1f\x7f]/g, '')
    .replace(/[<>:"/\\|?*]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '');
  if (s.length > 80) s = s.slice(0, 80).trim();
  if (!s || s === '.' || s === '..' || /^\.+$/.test(s) || RESERVED.test(s)) return '';
  return s;
}

// Max numeric child name + 1 (names like "3", "12"); 1 when there are none.
function nextNumber(names) {
  let max = 0;
  for (const n of Array.isArray(names) ? names : []) {
    if (typeof n === 'string' && /^\d{1,6}$/.test(n.trim())) max = Math.max(max, parseInt(n.trim(), 10));
  }
  return max + 1;
}

// Template lines -> clean relative paths ("Assets\Ses" and "Assets/Ses" both OK). Each segment is sanitized;
// anything that changes under sanitizing (traversal, absolute, odd chars) is dropped. Parents are added, dupes removed.
function buildFolders(template) {
  const lines = Array.isArray(template) ? template : typeof template === 'string' ? template.split(/\r?\n/) : DEFAULT_FOLDERS;
  const out = [];
  const seen = new Set();
  for (const raw of lines) {
    if (typeof raw !== 'string') continue;
    const t = raw.trim();
    if (!t || /^[a-z]:/i.test(t) || /^[\\/]/.test(t)) continue;
    const segs = t.split(/[\\/]+/).filter(Boolean);
    if (!segs.length || segs.length > 6) continue;
    const clean = segs.map(sanitizeName);
    if (clean.some((c, i) => !c || c !== segs[i].trim())) continue;
    for (let i = 1; i <= clean.length; i++) {
      const rel = clean.slice(0, i).join('/');
      const key = rel.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        out.push(rel);
      }
    }
  }
  return out;
}

function formatLabel(formats) {
  const list = (Array.isArray(formats) ? formats : []).filter((f) => FORMATS[f]).map((f) => FORMATS[f]);
  return list.length ? list.join(', ') : 'belirtilmedi';
}

function fill(tpl, info) {
  const muzik = info.muzik ? ` Müzik: ${info.muzik}.` : '';
  const sure = info.sure ? ` Süre: ${info.sure}.` : '';
  const map = {
    marka: info.marka || '',
    video: info.video || '',
    no: info.no != null ? String(info.no) : '',
    klasor: info.klasor || '',
    ham: info.ham || 'yok',
    format: formatLabel(info.formats),
    muzik,
    sure,
  };
  return String(tpl).replace(/\{(\w+)\}/g, (m, k) => (k in map ? map[k] : m));
}

// First prompt for Claude, from a template with {marka} {video} {no} {klasor} {ham} {format} {muzik} {sure}.
function buildPrompt(info, template) {
  const tpl = typeof template === 'string' && template.trim() ? template : DEFAULT_PROMPT;
  return fill(tpl, info || {}).slice(0, 4000);
}

function buildNotes(info) {
  const i = info || {};
  const lines = [
    `# ${i.marka || ''} – ${i.video || ''}`,
    '',
    `- Proje no: ${i.no != null ? i.no : ''}`,
    `- Oluşturma: ${i.date || ''}`,
    `- Klasör: ${i.klasor || ''}`,
    `- Ham çekim: ${i.ham || 'yok'}`,
    `- Format: ${formatLabel(i.formats)}`,
  ];
  if (i.muzik) lines.push(`- Müzik: ${i.muzik}`);
  if (i.sure) lines.push(`- Süre: ${i.sure}`);
  lines.push('', '## Notlar', '');
  return lines.join('\n');
}

// Is `child` inside `base` (after resolving)? Case-insensitive on Windows.
function isInside(base, child, platform = process.platform) {
  const p = platform === 'win32' ? path.win32 : path.posix;
  const norm = (x) => (platform === 'win32' ? p.resolve(x).toLowerCase() : p.resolve(x));
  const rel = p.relative(norm(base), norm(child));
  return !!rel && !rel.startsWith('..') && !p.isAbsolute(rel);
}

module.exports = { DEFAULT_FOLDERS, DEFAULT_PROMPT, FORMATS, sanitizeName, nextNumber, buildFolders, buildPrompt, buildNotes, formatLabel, isInside };
