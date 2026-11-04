'use strict';
// Video QC for the Videos tab: ffprobe (streams/format) + one ffmpeg pass (astats → ebur128) over the first audio
// stream. Pure parsers + judge() are exported for tests; runQC/saveFrame do the I/O (execFile with args arrays only).
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFile } = require('child_process');

// ---------- pure ----------
function num(x) { const n = Number(x); return isFinite(n) ? n : null; }
function ratio(s) {
  if (s == null) return null;
  const m = String(s).match(/^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/);
  if (m) return Number(m[2]) ? Number(m[1]) / Number(m[2]) : null;
  return num(s);
}

// ffprobe -print_format json -show_streams -show_format
function parseFfprobe(json) {
  const j = typeof json === 'string' ? JSON.parse(json) : json || {};
  const streams = j.streams || [];
  const v = streams.find((s) => s.codec_type === 'video' && !(s.disposition && s.disposition.attached_pic));
  const a = streams.find((s) => s.codec_type === 'audio');
  const fmt = j.format || {};
  const out = { duration: num(fmt.duration), formatBitrate: num(fmt.bit_rate), video: null, audio: null };
  if (v) {
    let rot = num(v.tags && v.tags.rotate) || 0;
    (v.side_data_list || []).forEach((d) => { if (d.rotation != null) rot = num(d.rotation) || 0; });
    let w = num(v.width), h = num(v.height);
    if (Math.abs(rot) % 180 === 90) [w, h] = [h, w];
    out.video = {
      codec: v.codec_name || null, profile: v.profile || null, pixFmt: v.pix_fmt || null, width: w, height: h,
      fps: ratio(v.avg_frame_rate) || ratio(v.r_frame_rate), bitrate: num(v.bit_rate),
      colorPrimaries: v.color_primaries || null, colorTransfer: v.color_transfer || null, colorSpace: v.color_space || null,
    };
    if (out.duration == null) out.duration = num(v.duration);
  }
  if (a) out.audio = { codec: a.codec_name || null, channels: num(a.channels), sampleRate: num(a.sample_rate), bitrate: num(a.bit_rate) };
  // no per-stream bitrate (mkv/webm): format minus audio
  if (out.video && out.video.bitrate == null && out.formatBitrate)
    out.video.bitrate = Math.max(0, out.formatBitrate - ((out.audio && out.audio.bitrate) || 0)), out.video.bitrateEstimated = true;
  return out;
}

// ffmpeg ebur128=peak=true summary (stderr)
function parseEbur128(text) {
  const s = String(text || '');
  const i = s.lastIndexOf('Summary:');
  const sum = i >= 0 ? s.slice(i) : '';
  const g = (re) => { const m = sum.match(re); return m ? num(m[1]) : null; };
  const integrated = g(/I:\s*(-?[\d.]+|-inf)\s*LUFS/);
  const lra = g(/LRA:\s*(-?[\d.]+)\s*LU/);
  const tp = sum.match(/True peak:[\s\S]*?Peak:\s*(-?[\d.]+|-inf)\s*dBFS/);
  return { integrated, lra, truePeak: tp ? (tp[1] === '-inf' ? -Infinity : num(tp[1])) : null };
}

// ffmpeg astats (stderr): per-channel blocks "Channel: N" … "RMS level dB: x", then "Overall"
function parseAstats(text) {
  const channels = [];
  let cur = null, overall = false;
  String(text || '').split(/\r?\n/).forEach((line) => {
    if (!/astats/i.test(line)) return;
    let m;
    if ((m = line.match(/\]\s*Channel:\s*(\d+)/))) { cur = { channel: Number(m[1]) }; channels.push(cur); overall = false; return; }
    if (/\]\s*Overall\s*$/.test(line)) { cur = null; overall = true; return; }
    if (!cur || overall) return;
    if ((m = line.match(/RMS level dB:\s*(-?[\d.]+|-inf)/))) cur.rms = m[1] === '-inf' ? -Infinity : Number(m[1]);
    else if ((m = line.match(/Peak level dB:\s*(-?[\d.]+|-inf)/))) cur.peak = m[1] === '-inf' ? -Infinity : Number(m[1]);
  });
  let balance = null;
  if (channels.length >= 2 && isFinite(channels[0].rms) && isFinite(channels[1].rms)) balance = +(channels[0].rms - channels[1].rms).toFixed(2);
  else if (channels.length >= 2 && channels[0].rms !== channels[1].rms) balance = channels[0].rms === -Infinity ? -99 : 99; // one side silent
  return { channels, balance };
}

const COMMON_FPS = [23.976, 24, 25, 29.97, 30, 50, 59.94, 60];
const fmtDur = (s) => { s = Math.round(s * 10) / 10; const m = Math.floor(s / 60); return m + ':' + (s % 60).toFixed(1).padStart(4, '0'); };

// qc: { probe: parseFfprobe(), loud: parseEbur128(), astats: parseAstats() } → chips [{key,label,value,status,tip}]
function judge(qc) {
  const p = (qc && qc.probe) || {}, v = p.video, a = p.audio, L = (qc && qc.loud) || {}, S = (qc && qc.astats) || {};
  const chips = [];
  const add = (key, label, value, status, tip) => chips.push({ key, label, value, status, tip });
  if (p.duration != null) add('duration', 'Süre', fmtDur(p.duration), 'ok', p.duration.toFixed(2) + ' sn');
  if (!v) add('video', 'Görüntü', 'yok', 'bad', 'Video akışı bulunamadı');
  else {
    const w = v.width, h = v.height, exact = w === 1080 && h === 1920, nine16 = w && h && Math.abs(w / h - 9 / 16) < 0.01;
    add('res', 'Çözünürlük', w + '×' + h + (exact ? ' ✓' : ''), exact ? 'ok' : nine16 ? 'warn' : 'bad',
      exact ? '1080×1920, 9:16 — Reels için doğru' : nine16 ? '9:16 ama 1080×1920 değil' : 'En-boy 9:16 değil (hedef 1080×1920)');
    if (v.fps) {
      const f = v.fps, common = COMMON_FPS.some((c) => Math.abs(c - f) < 0.02);
      add('fps', 'FPS', (Math.round(f * 100) / 100) + '', common && f >= 23.9 ? 'ok' : 'warn', common ? 'Standart kare hızı' : 'Alışılmadık kare hızı (24/25/30/60 beklenir)');
    }
    if (v.bitrate) {
      const mb = v.bitrate / 1e6, st = mb > 20 || mb < 4 ? 'bad' : mb > 15 || mb < 7 ? 'warn' : 'ok';
      add('bitrate', 'Video bitrate', mb.toFixed(1) + ' Mbps' + (v.bitrateEstimated ? ' ~' : ''), st, 'Hedef ~10 Mbps, en çok 15 Mbps' + (v.bitrateEstimated ? ' (format bitrate üzerinden tahmin)' : ''));
    }
    const codecOk = /^(h264|hevc)$/.test(v.codec || '');
    const col = [v.colorPrimaries, v.colorTransfer, v.colorSpace];
    const set = col.filter(Boolean), all709 = set.length === 3 && set.every((c) => /bt709/.test(c));
    const bad = set.some((c) => !/bt709|unknown/.test(c));
    add('codec', 'Codec / renk', (v.codec || '?') + ' · ' + (all709 ? 'BT.709' : set.length ? set.join('/') : 'renk etiketi yok'),
      !codecOk || bad ? 'bad' : all709 && (!v.pixFmt || /^yuv420p$/.test(v.pixFmt)) ? 'ok' : 'warn',
      'Hedef H.264/HEVC, BT.709 (primaries/transfer/matrix). ' + (v.pixFmt ? 'pix_fmt ' + v.pixFmt : ''));
  }
  if (!a) add('audio', 'Ses', 'yok', 'warn', 'Ses akışı yok');
  else {
    if (L.integrated != null) {
      const d = Math.abs(L.integrated + 14);
      add('lufs', 'Loudness', L.integrated.toFixed(1) + ' LUFS', d <= 1 ? 'ok' : d <= 2 ? 'warn' : 'bad', 'Hedef −14 ±1 LUFS (entegre)' + (L.lra != null ? ' · LRA ' + L.lra + ' LU' : ''));
    }
    if (L.truePeak != null) {
      const t = L.truePeak;
      add('tp', 'True peak', (isFinite(t) ? t.toFixed(1) : '−∞') + ' dBTP', t <= -1 ? 'ok' : t <= 0 ? 'warn' : 'bad', 'En çok −1 dBTP');
    }
    if (a.channels === 1) add('lr', 'L/R', 'mono', 'ok', 'Tek kanal');
    else if (S.balance != null) {
      const b = Math.abs(S.balance);
      add('lr', 'L/R denge', (b >= 99 ? (S.balance > 0 ? 'yalnız L' : 'yalnız R') : (S.balance > 0 ? 'L +' : S.balance < 0 ? 'R +' : '') + b.toFixed(1) + ' dB'),
        b <= 1 ? 'ok' : b <= 3 ? 'warn' : 'bad', 'Kanal RMS farkı (L − R). ' + S.channels.map((c) => 'K' + c.channel + ' ' + (isFinite(c.rms) ? c.rms.toFixed(1) : '−∞') + ' dB').join(', '));
    }
  }
  return chips;
}

// ---------- project root / frame path ----------
function normSeg(s) { return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
// Folder that holds Render\ / Assets\ / Videolar\ above the video, or null
function projectRoot(videoPath) {
  const parts = path.resolve(videoPath).split(/[\\/]+/);
  for (let i = parts.length - 2; i >= 1; i--) {
    if (['render', 'assets', 'videolar'].includes(normSeg(parts[i]))) return parts.slice(0, i).join(path.sep) || null;
  }
  return null;
}
function frameName(videoPath, t) {
  const b = path.basename(videoPath, path.extname(videoPath)).replace(/[^\w.\-]+/g, '_').slice(0, 60);
  const ms = Math.max(0, Math.round((Number(t) || 0) * 1000));
  const mm = Math.floor(ms / 60000), ss = Math.floor(ms / 1000) % 60, rest = ms % 1000;
  return `${b}_${mm}m${String(ss).padStart(2, '0')}s${String(rest).padStart(3, '0')}.png`;
}

// ---------- I/O ----------
const exeCache = {};
function findExe(name) {
  if (exeCache[name] !== undefined) return exeCache[name];
  const exts = process.platform === 'win32' ? ['.exe', '.cmd', ''] : [''];
  for (const d of String(process.env.PATH || '').split(path.delimiter)) {
    if (!d) continue;
    for (const e of exts) {
      const p = path.join(d.replace(/^"|"$/g, ''), name + e);
      try { if (fs.statSync(p).isFile()) return (exeCache[name] = p); } catch {}
    }
  }
  return (exeCache[name] = null);
}
function run(exe, args, timeout) {
  return new Promise((res, rej) => {
    execFile(exe, args, { windowsHide: true, maxBuffer: 64 * 1024 * 1024, timeout }, (err, stdout, stderr) => {
      if (err && !stdout && !stderr) return rej(err);
      res({ err, stdout: String(stdout || ''), stderr: String(stderr || '') });
    });
  });
}

const cache = new Map(); // key path|mtime|size → Promise<result>
async function runQC(file) {
  let st;
  try { st = fs.statSync(file); } catch { return { ok: false, error: 'Dosya okunamadı' }; }
  const key = file + '|' + st.mtimeMs + '|' + st.size;
  if (cache.has(key)) return cache.get(key);
  const job = (async () => {
    const ffprobe = findExe('ffprobe'), ffmpeg = findExe('ffmpeg');
    if (!ffprobe || !ffmpeg) return { ok: false, error: 'ffmpeg/ffprobe PATH üzerinde bulunamadı' };
    const pr = await run(ffprobe, ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', file], 30000);
    let probe;
    try { probe = parseFfprobe(pr.stdout); } catch { return { ok: false, error: 'ffprobe çıktısı okunamadı' }; }
    let loud = {}, astats = { channels: [], balance: null };
    if (probe.audio) {
      const r = await run(ffmpeg, ['-hide_banner', '-nostats', '-i', file, '-vn', '-sn', '-dn', '-map', '0:a:0',
        '-af', 'astats=metadata=0,ebur128=peak=true', '-f', 'null', '-'], 300000);
      loud = parseEbur128(r.stderr); astats = parseAstats(r.stderr);
    }
    const qc = { probe, loud, astats };
    return { ok: true, ...qc, chips: judge(qc) };
  })();
  cache.set(key, job);
  if (cache.size > 100) cache.delete(cache.keys().next().value);
  job.then((r) => { if (!r.ok) cache.delete(key); }, () => cache.delete(key));
  return job;
}

// dataUrl (canvas PNG) or, if missing (tainted canvas), ffmpeg grabs the frame at t
async function saveFrame(file, dataUrl, t) {
  const root = projectRoot(file);
  let dir = root ? path.join(root, 'Assets', 'Kontrol') : path.join(os.tmpdir(), 'DT-Kontrol');
  try { fs.mkdirSync(dir, { recursive: true }); } catch { dir = path.join(os.tmpdir(), 'DT-Kontrol'); fs.mkdirSync(dir, { recursive: true }); }
  const out = path.join(dir, frameName(file, t));
  const m = typeof dataUrl === 'string' && dataUrl.match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/);
  if (m) {
    const buf = Buffer.from(m[1], 'base64');
    if (buf.length > 40 * 1024 * 1024) return { ok: false, error: 'Kare çok büyük' };
    fs.writeFileSync(out, buf);
  } else {
    const ffmpeg = findExe('ffmpeg');
    if (!ffmpeg) return { ok: false, error: 'ffmpeg bulunamadı' };
    await run(ffmpeg, ['-hide_banner', '-v', 'error', '-y', '-ss', String(Math.max(0, Number(t) || 0)), '-i', file, '-frames:v', '1', out], 30000);
    if (!fs.existsSync(out)) return { ok: false, error: 'Kare alınamadı' };
  }
  return { ok: true, path: out };
}

module.exports = { parseFfprobe, parseEbur128, parseAstats, judge, projectRoot, frameName, findExe, runQC, saveFrame };
