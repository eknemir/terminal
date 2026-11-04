'use strict';
// Pure checks main.js applies to what the dashboard sends it (kept here so they can be unit-tested without Electron).
const path = require('path');
const fs = require('fs');

// Plain string, capped, with no bracketed-paste markers (an end marker would end the paste early and run the rest as keys).
const PROMPT_MAX = 20000;
const cleanPrompt = (t) => (typeof t === 'string' ? t.slice(0, PROMPT_MAX).replace(/\x1b\[20[01]~/g, '') : '');

// ---------- the Videos tab ----------
const VIDEO_EXT = new Set(['.mp4', '.mov', '.webm', '.m4v']);
const isVideo = (p) => VIDEO_EXT.has(path.extname(p).toLowerCase());
const videoKey = (p, platform = process.platform) => (platform === 'win32' ? path.resolve(p).toLowerCase() : path.resolve(p));
const hasDotDot = (p) => p.split(/[\\/]/).includes('..');
// A folder the dashboard may list or watch: absolute, no "..", an existing directory.
const videoDirOk = (d, stat = fs.statSync) => {
  if (typeof d !== 'string' || !path.isAbsolute(d) || hasDotDot(d)) return false;
  try {
    return stat(d).isDirectory();
  } catch {
    return false;
  }
};
// A file dtvideo:// may serve: absolute, no "..", a video, and one videoList returned (allowed: a Set of videoKey()s).
const videoPathOk = (p, allowed, platform = process.platform) =>
  typeof p === 'string' && !!p && path.isAbsolute(p) && !hasDotDot(p) && isVideo(p) && allowed.has(videoKey(p, platform));

module.exports = { PROMPT_MAX, cleanPrompt, VIDEO_EXT, isVideo, videoKey, videoDirOk, videoPathOk };
