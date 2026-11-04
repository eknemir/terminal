'use strict';

// ---------- constants ----------
// Each kind of tool call's colour: `color` is the orbit map's, which keeps the default theme's colours (orbit.js),
// `css` the theme's, for the rest of the page.
const CAT = {
  web: { color: '#38bdf8', css: 'var(--sky)', label: 'web', station: 'web araştırma' },
  browser: { color: '#5b8cff', css: 'var(--blue)', label: 'tarayıcı', station: 'tarayıcı' },
  read: { color: '#3dffa8', css: 'var(--green)', label: 'okuma', station: 'dosya okuma' },
  search: { color: '#b8ff3d', css: 'var(--lime)', label: 'arama', station: 'kod arama' },
  edit: { color: '#ffd23f', css: 'var(--amber)', label: 'düzenleme', station: 'dosya yazma' },
  bash: { color: '#ff5c8a', css: 'var(--orange)', label: 'kabuk', station: 'kabuk' },
  agent: { color: '#9d6bff', css: 'var(--violet)', label: 'ajanlar', station: 'ajan başlatma' },
  mcp: { color: '#e879f9', css: 'var(--magenta)', label: 'mcp', station: 'mcp çağrısı' },
  plan: { color: '#a99bc4', css: 'var(--lavender)', label: 'plan', station: 'plan · beceri' },
};
const CATS = Object.keys(CAT);
const STATUS = {
  busy: { color: '#3fb6ec', label: 'ÇALIŞIYOR' },
  waiting: { color: '#ff2e63', label: 'SENİ BEKLİYOR' },
  idle: { color: '#00e5ff', label: 'SIRA SENDE' },
  ended: { color: '#5c4d40', label: 'BİTTİ' },
};
// A session's colour: the orbit map's (HUES) and the theme's (--hue0…--hue9, sessCss).
const HUES = ['#5ce1f0', '#00e5ff', '#9d6bff', '#3dffa8', '#ff5c8a', '#5b8cff', '#ffd23f', '#b8ff3d', '#e879f9', '#f5ebe0'];
const LOG_CAT = { prompt: ['sen', '#ffffff'], say: ['claude', 'var(--txt2)'], sys: ['sistem', 'var(--amber)'], state: ['durum', 'var(--accent-soft)'] };
const FONT = '"SF Mono", Menlo, Monaco, Consolas, monospace';

// ---------- native app bridge ----------
function native(msg) {
  try {
    window.webkit.messageHandlers.radar.postMessage(msg);
  } catch {}
}
window.addEventListener('error', (e) => native({ type: 'log', msg: `${e.message} @ ${e.filename}:${e.lineno}` }));

// ---------- helpers ----------
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const clipT = (s, n) => {
  s = String(s ?? '');
  return s.length > n ? s.slice(0, Math.max(1, n - 1)) + '…' : s;
};
function setText(el, v) {
  v = String(v ?? '');
  if (el && el.textContent !== v) el.textContent = v;
}
function setHTML(el, v) {
  if (el && el.__h !== v) {
    el.innerHTML = v;
    el.__h = v;
  }
}
function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}
function fmtTok(n) {
  n = n || 0;
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e8 ? 0 : 1) + 'M';
  if (n >= 1e4) return Math.round(n / 1e3) + 'k';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k';
  return String(Math.round(n));
}
function fmtUsd(n) {
  n = n || 0;
  if (n >= 1000) return '$' + Math.round(n).toLocaleString('tr-TR');
  if (n >= 100) return '$' + n.toFixed(0);
  if (n >= 0.01) return '$' + n.toFixed(2);
  return n > 0 ? '$' + n.toFixed(3) : '$0';
}
function fmtDur(ms) {
  if (ms == null) return '';
  if (ms < 1000) return Math.round(ms) + 'ms';
  const s = Math.round(ms / 1000);
  if (s < 60) return s + ' sn';
  const m = Math.floor(s / 60);
  if (m < 60) return m + ' dk' + (s % 60 ? ' ' + (s % 60) + ' sn' : '');
  const h = Math.floor(m / 60);
  return h + ' sa' + (m % 60 ? ' ' + (m % 60) + ' dk' : '');
}
function clock(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : String(m)) + ':' + String(x).padStart(2, '0');
}
const ago = (t) => (t ? fmtDur(Math.max(0, Date.now() - t)) : '');
// "5 dk önce", under a minute "az önce".
const agoTR = (t) => (!t ? '' : Date.now() - t < 60_000 ? 'az önce' : `${ago(t)} önce`);
const hhmmss = (t) => new Date(t).toTimeString().slice(0, 8);
const ctxColor = (p) => (p < 0.5 ? '#3fb6ec' : p < 0.8 ? '#ffd23f' : '#ff4d4d');
const ctxCss = (p) => (p < 0.5 ? 'var(--accent)' : p < 0.8 ? 'var(--amber)' : 'var(--red)');

const colorIdx = new Map();
function colorIndex(sid) {
  if (!colorIdx.has(sid)) colorIdx.set(sid, colorIdx.size);
  return colorIdx.get(sid);
}
const sessColor = (sid) => HUES[colorIndex(sid || '?') % HUES.length];
const sessCss = (sid) => `var(--hue${colorIndex(sid || '?') % HUES.length})`;
const NAMES = new Map();
const sessName = (sid) => NAMES.get(sid) || String(sid || '?').slice(0, 6);

// ---------- live data ----------
let STATE = null;
const lastStatus = new Map();

function handleInit(d) {
    STATE = d.state;
    for (const s of STATE.sessions) {
      NAMES.set(s.id, s.name);
      colorIndex(s.id);
      lastStatus.set(s.id, s.status);
    }
    $('log').innerHTML = '';
    LOGEL.clear();
    for (const ev of d.log) {
      logLine(ev, false);
      marqueePush(ev);
    }
    map('seed', d.log);
    flushMarquee(true);
    renderAll();
    $('boot').classList.add('gone');
}
function handleState(next) {
    for (const s of next.sessions) NAMES.set(s.id, s.name);
    transitions(next);
    STATE = next;
    renderAll();
}
// What the user can see decides the work: the app reports whether the dashboard is visible and in front;
// a hidden page pauses CSS animations and the 3D view.
function setVisibility(visible, focused) {
  document.documentElement.classList.toggle('paused', !visible);
  map('activity', visible, focused);
}
function connect() {
  window.__radar = { init: handleInit, state: handleState, events: (list) => list.forEach(onEvent), visibility: setVisibility, cloud: (c) => window.Cloud?.render(c), social: (ev) => window.Social?.event(ev), terminals: (list) => map('terminals', list), terminalGone: (id) => map('terminalGone', id), idle: (s) => map('idle', s), openUpdate: () => window.Cloud?.openUpdate(), openProfile: () => window.Cloud?.openMenu('profile'), openView: (v) => window.GitView?.view(v), runaways: (list) => { window.Danger?.update(list); map('runaways', list); }, openDanger: () => window.Danger?.open() };
  native({ type: 'ready' });
}

function onEvent(ev) {
  map('event', ev);
  switch (ev.k) {
    case 'tool':
    case 'prompt':
      logLine(ev, true);
      marqueePush(ev);
      break;
    case 'result':
      logResult(ev);
      break;
    case 'say':
    case 'sys':
      logLine(ev, true);
      break;
  }
}

function transitions(next) {
  for (const s of next.sessions) {
    const prev = lastStatus.get(s.id);
    if (prev === undefined) {
      logState(s, `● oturum açıldı · ${s.cwd}`, 'state');
    } else if (prev !== s.status) {
      map('status', s.id, s.status, prev);
      if (s.status === 'waiting') {
        flashEdge();
        ping('waiting');
        logState(s, `⚠ seni bekliyor · ${s.waitingFor || 'bekliyor'}`, 'err');
      } else if (s.status === 'idle') {
        ping('idle');
        logState(s, '◆ tur bitti · sıra sende', 'state');
      } else if (s.status === 'ended') {
        logState(s, 'oturum bitti', 'state');
      } else if (s.status === 'busy' && prev === 'waiting') {
        logState(s, '▶ engel kalktı · yeniden çalışıyor', 'state');
      }
    }
    lastStatus.set(s.id, s.status);
  }
}

// ---------- sound ----------
let soundOn = false;
try {
  soundOn = localStorage.getItem('radar.sound') === '1';
} catch {}
let audio = null;
// The audio context is suspended between pings: a running one keeps a real-time audio thread busy.
let audioIdle = 0;
function ping(kind) {
  if (!soundOn) return;
  try {
    audio = audio || new AudioContext();
    if (audio.state === 'suspended') audio.resume();
    clearTimeout(audioIdle);
    audioIdle = setTimeout(() => audio.state === 'running' && audio.suspend(), 1500);
    const tones = kind === 'waiting' ? [880, 660, 880] : [523, 784];
    tones.forEach((f, i) => {
      const o = audio.createOscillator(), gn = audio.createGain(), t = audio.currentTime + i * 0.16;
      o.type = 'sine';
      o.frequency.value = f;
      gn.gain.setValueAtTime(0.0001, t);
      gn.gain.exponentialRampToValueAtTime(0.12, t + 0.02);
      gn.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
      o.connect(gn).connect(audio.destination);
      o.start(t);
      o.stop(t + 0.16);
    });
  } catch {}
}
function paintSound() {
  $('sound').textContent = soundOn ? 'ses açık' : 'ses kapalı';
  $('sound').classList.toggle('on', soundOn);
}
$('sound').addEventListener('click', () => {
  soundOn = !soundOn;
  try {
    localStorage.setItem('radar.sound', soundOn ? '1' : '0');
  } catch {}
  paintSound();
  if (soundOn) ping('idle');
});
paintSound();

// ---------- small UI bits ----------
function flashEdge() {
  const f = $('flash');
  f.classList.remove('on');
  void f.offsetWidth;
  f.classList.add('on');
}
let toastTimer = 0;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), 2400);
}
let lastSid = null;
function focusSession(sid) {
  if (sid) lastSid = sid;
  if (sid) native({ type: 'open', sid });
}

// The presets gallery's way to hand Claude a prompt: into the chat last opened here (or the app's last focused one),
// else a new chat.
const radarPost = (msg) => {
  try {
    return Promise.resolve(window.webkit.messageHandlers.radar.postMessage(msg));
  } catch (e) {
    return Promise.resolve({ ok: false, reason: String(e) });
  }
};
window.DT = {
  // The chat tab in front (chattabs.js): prompts go there; a plain terminal (no session) leaves it to the app's last.
  focusChat(sid) {
    lastSid = sid || null;
  },
  newChatWithPrompt(text) {
    return radarPost({ type: 'newChatWithText', text: String(text || '') });
  },
  sendPrompt(text, opts) {
    const msg = { type: 'sendText', sid: lastSid, text: String(text || '') };
    if (opts && opts.submit === false) msg.submit = false;
    return radarPost(msg).then((r) =>
      r && r.ok === false && r.reason === 'no-chat' ? window.DT.newChatWithPrompt(text) : r,
    );
  },
};

const nums = new Map();
function setNum(id, value, fmt) {
  const el = $(id);
  if (!el) return;
  let n = nums.get(id);
  if (!n || n.el !== el) {
    nums.set(id, { el, cur: value, from: value, to: value, t0: 0, fmt });
    el.textContent = fmt(value);
    return;
  }
  n.fmt = fmt;
  if (n.to === value) return;
  n.from = n.cur;
  n.to = value;
  n.t0 = performance.now();
  el.classList.remove('bump');
  void el.offsetWidth;
  el.classList.add('bump');
  if (!numFrame) numFrame = requestAnimationFrame(tickNums);
}
// Runs only while some number is still rolling to its new value.
let numFrame = 0;
function tickNums(now) {
  numFrame = 0;
  let moving = false;
  for (const n of nums.values()) {
    if (n.cur === n.to) continue;
    const u = Math.min(1, (now - n.t0) / 800);
    n.cur = u >= 1 ? n.to : n.from + (n.to - n.from) * (1 - Math.pow(1 - u, 3));
    n.el.textContent = n.fmt(n.cur);
    if (n.cur !== n.to) moving = true;
  }
  if (moving) numFrame = requestAnimationFrame(tickNums);
}

// Reuses child elements by key so CSS animations and transitions survive the 1 Hz refresh.
function keyed(box, items, keyOf, create, update) {
  for (const el of [...box.children]) if (el.dataset.key === undefined) el.remove();
  delete box.dataset.empty;
  const old = new Map();
  for (const el of box.children) old.set(el.dataset.key, el);
  let ref = box.firstElementChild;
  for (const it of items) {
    const k = String(keyOf(it));
    let el = old.get(k);
    if (el) old.delete(k);
    else {
      el = create(it);
      el.dataset.key = k;
      el.classList.add('enter');
    }
    update(el, it);
    if (el === ref) ref = ref.nextElementSibling;
    else box.insertBefore(el, ref);
  }
  for (const el of old.values()) el.remove();
}
function placeholder(box, html, cls = 'empty') {
  const key = cls + html;
  if (box.dataset.empty === key) return;
  box.innerHTML = `<div class="${cls}">${html}</div>`;
  box.dataset.empty = key;
}
function sparkBars(arr, col) {
  const max = Math.max(1, ...arr);
  const w = 120 / arr.length;
  return arr
    .map((v, i) => {
      const h = v ? Math.max(1.5, (v / max) * 19) : 0.7;
      return `<rect x="${(i * w + 0.4).toFixed(1)}" y="${(20 - h).toFixed(1)}" width="${(w - 1.1).toFixed(1)}" height="${h.toFixed(1)}" style="fill:${v ? col : 'rgba(255,255,255,.09)'}"/>`;
    })
    .join('');
}
function areaChart(arr, color, w, h) {
  const max = Math.max(...arr, 1e-9);
  const step = w / Math.max(1, arr.length - 1);
  const pts = arr.map((v, i) => `${i ? 'L' : 'M'}${(i * step).toFixed(1)} ${(h - 2 - (v / max) * (h - 5)).toFixed(1)}`).join(' ');
  return `<path d="${pts} L${w} ${h} L0 ${h} Z" style="fill:${color};fill-opacity:0.14"/><path d="${pts}" fill="none" style="stroke:${color}" stroke-width="1.4" vector-effect="non-scaling-stroke"/>`;
}

// ---------- log ----------
const LOGEL = new Map();
function toolText(ev) {
  const n = ev.n || '';
  if (n.startsWith('mcp__') || n === 'Bash') return ev.l || n;
  return ev.l ? `${n} · ${ev.l}` : n;
}
function markResult(el, ev) {
  const st = el.querySelector('.st');
  if (ev.ok === undefined || ev.ok === null) {
    const stale = Date.now() - (ev.t || Date.now()) > 15 * 60_000;
    st.className = stale ? 'st' : 'st run';
    st.textContent = stale ? '·' : '◌';
  } else {
    st.className = 'st ' + (ev.ok ? 'ok' : 'bad');
    st.textContent = (ev.ok ? '✓' : '✗') + (ev.d != null ? ' ' + fmtDur(ev.d) : '') + (ev.m ? ' · ' + ev.m : '');
  }
}
function logLine(ev, live) {
  const box = $('log');
  const stick = box.scrollTop + box.clientHeight >= box.scrollHeight - 14;
  let cat, col, text;
  if (ev.k === 'tool') {
    cat = CAT[ev.c]?.label || ev.c;
    col = CAT[ev.c]?.css || 'var(--lavender)';
    text = toolText(ev);
  } else {
    [cat, col] = LOG_CAT[ev.k] || ['·', 'var(--lavender)'];
    text = ev.k === 'prompt' ? `› ${ev.l}` : ev.l;
  }
  const el = document.createElement('div');
  el.className = `ln ${ev.k}${ev.err || ev.cls === 'err' ? ' err' : ''}${live ? ' enter' : ''}`;
  el.innerHTML = `<span class="tm">${hhmmss(ev.t || Date.now())}</span><span class="who" style="color:${sessCss(ev.s)}">${esc(sessName(ev.s))}${ev.a ? ' ⤷' : ''}</span><span class="cat" style="color:${col}">${esc(cat)}</span><span class="txt">${esc(text)}</span><span class="st"></span>`;
  el.dataset.sid = ev.s || '';
  if (ev.k === 'tool') {
    el.__id = ev.id;
    LOGEL.set(ev.id, el);
    markResult(el, ev);
  }
  box.appendChild(el);
  while (box.childElementCount > 220) {
    const x = box.firstElementChild;
    if (x.__id) LOGEL.delete(x.__id);
    x.remove();
  }
  if (stick) box.scrollTop = box.scrollHeight;
}
function logResult(ev) {
  const el = LOGEL.get(ev.id);
  if (el) markResult(el, ev);
}
function logState(s, text, cls) {
  logLine({ k: 'state', t: Date.now(), s: s.id, l: text, cls }, true);
}

// ---------- marquee ----------
const MARQ = [];
let marqDirty = false;
function marqueePush(ev) {
  let s = null;
  if (ev.k === 'prompt' && !ev.cmd) s = `${sessName(ev.s)} › ${clipT(ev.l, 90)}`;
  else if (ev.k === 'tool' && ev.c === 'web') s = `${sessName(ev.s)} ${ev.n === 'WebSearch' ? '⌕' : '↓'} ${ev.l}`;
  else if (ev.k === 'tool' && ev.c === 'edit') s = `${sessName(ev.s)} ✎ ${ev.l}`;
  else if (ev.k === 'tool' && (ev.n === 'Agent' || ev.n === 'Task')) s = `${sessName(ev.s)} ◆ ${ev.l}`;
  if (!s) return;
  MARQ.push(s);
  if (MARQ.length > 16) MARQ.shift();
  marqDirty = true;
}
function flushMarquee(force) {
  if (!marqDirty && !force) return;
  marqDirty = false;
  if (MARQ.length) setText($('marquee'), MARQ.join('      ◇      '));
}
$('marquee').addEventListener('animationiteration', () => flushMarquee(false));

// ---------- panels ----------
function renderAll() {
  if (!STATE) return;
  renderTop();
  renderSessions();
  renderMix();
  renderWorkers();
  renderSpend();
  renderCall();
  renderTicker();
  map('state', STATE);
  const T = STATE.totals;
  setText($('m-map'), `${T.live} canlı · ${T.runningAgents} çalışan ajan · bugün ${T.sessionsToday} oturum`);
}

function renderTop() {
  const T = STATE.totals;
  setNum('k-sessions', T.live, (v) => String(Math.round(v)));
  setText($('k-sessions-sub'), `bugün ${T.sessionsToday}`);
  setNum('k-agents', T.runningAgents, (v) => String(Math.round(v)));
  setText($('k-agents-sub'), `bugün ${T.agentsToday}`);
  setNum('k-tpm', T.toolsPerMin, (v) => v.toFixed(1));
  setNum('k-tokm', T.tokPerMin, fmtTok);
  setNum('k-cost', T.cost, fmtUsd);
  setText($('k-burn'), `saatte ${fmtUsd(T.costPerHour)}`);
  setNum('k-cache', T.cacheHit * 100, (v) => '%' + v.toFixed(1).replace('.', ','));
  setText($('k-saved'), `${fmtUsd(T.saved)} tasarruf`);
  setNum('k-web', T.web, (v) => String(Math.round(v)));
  setNum('k-ok', T.okRate * 100, (v) => '%' + v.toFixed(1).replace('.', ','));
  setText($('k-err'), `${T.errors} hatalı`);
  renderLimits();
}

// Usage limits from Claude Code's status line: used % of the 5-hour and the weekly window, and when each resets. Until
// the status line has reported them (a new install), they stay out of the top bar.
function renderLimits() {
  const L = STATE?.limits;
  for (const [id, w, long] of [['lim-5h', L?.fiveHour, false], ['lim-week', L?.week, true]]) {
    const el = $(id);
    if (!el) continue;
    el.style.display = w ? '' : 'none';
    const pct = w ? Math.max(0, Math.min(100, w.pct)) : null;
    el.classList.toggle('ok', pct !== null && pct < 50);
    el.classList.toggle('warn', pct !== null && pct >= 50 && pct < 80);
    el.classList.toggle('hot', pct !== null && pct >= 80);
    setText(el.querySelector('b'), pct === null ? '—' : `%${Math.round(pct)}`);
    setText(el.querySelector('small'), !w ? 'henüz veri yok' : w.resetsAt ? `sıfırlanma: ${resetLabel(w.resetsAt, long)}` : '');
    el.querySelector('.lim-bar i').style.width = `${pct ?? 0}%`;
  }
}
function resetLabel(at, long) {
  const ms = at - Date.now();
  if (ms <= 0) return 'şimdi';
  if (!long || ms < 24 * 3600_000) {
    const m = Math.round(ms / 60_000);
    return m < 60 ? `${m} dk sonra` : `${Math.floor(m / 60)} sa ${m % 60} dk sonra`;
  }
  return new Date(at).toLocaleString('tr-TR', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
}

function actionHTML(s) {
  if (s.status === 'waiting') return `<span class="red">⚠ ${esc(s.waitingFor || 'seni bekliyor')}</span>`;
  const p = s.pending[0] || s.agents.find((a) => a.pending.length)?.pending[0];
  if (p) return `<span style="color:${CAT[p.c]?.css}">▸ ${esc(p.n)}</span> ${esc(p.l)} <i class="dim">${fmtDur(Date.now() - p.t)}</i>`;
  if (s.status === 'busy') return `<span class="teal">◌ düşünüyor…</span>${s.last ? ` <i class="dim">son ${esc(s.last.n)} ${esc(clipT(s.last.l, 36))}</i>` : ''}`;
  if (s.status === 'idle') return `<span class="amber">◆ bitti · sıra sende</span>${s.turnMs ? ` <i class="dim">son tur ${fmtDur(s.turnMs)}</i>` : ''}`;
  return `<span class="dim">${agoTR(s.lastTs)} bitti</span>`;
}

// Cards folded to one line with their yellow button, by session id, kept across reloads.
const collapsed = new Set(
  (() => {
    try {
      return JSON.parse(localStorage.getItem('radar.collapsed') || '[]');
    } catch {
      return [];
    }
  })(),
);
function toggleCollapsed(id) {
  if (collapsed.has(id)) collapsed.delete(id);
  else collapsed.add(id);
  try {
    localStorage.setItem('radar.collapsed', JSON.stringify([...collapsed]));
  } catch {}
  renderSessions();
}

// A question in the dashboard's style (the app moves the chat windows above the dashboard aside meanwhile): resolves
// true for the action, false for Cancel, Escape or a click outside.
function askBox({ title, text, ok }) {
  return new Promise((resolve) => {
    const root = document.createElement('div');
    root.className = 'askbox';
    root.innerHTML = `<div class="ab"><b>${esc(title)}</b><p>${esc(text)}</p><div class="btns"><button type="button" class="cancel">Vazgeç</button><button type="button" class="ok">${esc(ok)}</button></div></div>`;
    const key = (e) => {
      if (e.key !== 'Escape' && e.key !== 'Enter') return;
      e.preventDefault();
      e.stopPropagation();
      done(e.key === 'Enter');
    };
    const done = (v) => {
      root.remove();
      removeEventListener('keydown', key, true);
      native({ type: 'modal', open: false });
      resolve(v);
    };
    root.querySelector('.cancel').onclick = () => done(false);
    root.querySelector('.ok').onclick = () => done(true);
    root.addEventListener('mousedown', (e) => e.target === root && done(false));
    addEventListener('keydown', key, true);
    native({ type: 'modal', open: true });
    document.body.appendChild(root);
    root.querySelector('.ok').focus();
  });
}

// A card's red button: Claude stops wherever it runs (after a question), and the card goes. An ended session's card
// just goes.
async function endSession(id) {
  const s = STATE.sessions.find((x) => x.id === id);
  if (!s) return;
  if (s.status !== 'ended') {
    const winOpen = !!(window.__winOpen && window.__winOpen[s.id]);
    const where = s.host === 'term' && !winOpen
      ? `Claude çalıştığı terminalde durur${s.tty ? ` (${String(s.tty).replace('/dev/', '')})` : ''}.`
      : 'Claude durur ve penceresi kapanır.';
    const busy = s.status === 'busy' ? ' Şu an çalışıyor.' : s.status === 'waiting' ? ' Seni bekliyor.' : '';
    const yes = await askBox({
      title: `“${clipT(s.title || s.name, 60)}” bitirilsin mi?`,
      text: `${where}${busy} Sohbet kayıtlı kalır, sonra devam edebilirsin.`,
      ok: 'Oturumu bitir',
    });
    if (!yes) return;
  }
  document.querySelector(`#sessions .card[data-key="${CSS.escape(id)}"]`)?.classList.add('ending');
  native({ type: 'endSession', sid: id });
}

function createCard() {
  const el = document.createElement('div');
  el.className = 'card';
  el.innerHTML = `<div class="ch"><span class="lights"><i class="l-close"></i><i class="l-min"></i></span><b class="nm"></b><span class="kind"></span><span class="pill"></span></div>
<div class="title"></div><div class="path"></div><div class="act"></div>
<div class="ctx"><span>bağlam</span><div class="bar"><i></i></div><span class="cv"></span></div>
<div class="kv"><span class="md"></span><span>araç <b class="tl"></b></span><span>web <b class="wb"></b></span><span>hata <b class="er"></b></span><span class="cost"></span></div>
<svg class="spark" viewBox="0 0 120 20" preserveAspectRatio="none"></svg><div class="ag"></div><div class="flags"></div>`;
  el.addEventListener('click', () => focusSession(el.dataset.key));
  el.querySelector('.l-close').addEventListener('click', (e) => {
    e.stopPropagation();
    endSession(el.dataset.key);
  });
  el.querySelector('.l-min').addEventListener('click', (e) => {
    e.stopPropagation();
    toggleCollapsed(el.dataset.key);
  });
  return el;
}
function updateCard(el, s) {
  const q = (sel) => el.querySelector(sel);
  for (const st of Object.keys(STATUS)) el.classList.toggle('st-' + st, s.status === st);
  const col = sessCss(s.id);
  // Folded: one line, the name Claude gave it and its status.
  const folded = collapsed.has(s.id);
  el.classList.toggle('collapsed', folded);
  q('.l-close').title = s.status === 'ended' ? 'Listeden kaldır' : 'Oturumu bitir';
  q('.l-min').title = folded ? 'Genişlet' : 'Daralt';
  setText(q('.nm'), s.name);
  const winOpen = !!(window.__winOpen && window.__winOpen[s.id]);
  el.classList.toggle('winopen', winOpen);
  const host = winOpen ? 'pencere' : s.host === 'app' ? 'uygulamada' : s.host === 'term' ? `dış ${String(s.tty || 'terminal').replace('/dev/', '')}` : '';
  setText(q('.kind'), [s.kind && s.kind !== 'interactive' ? s.kind : '', host].filter(Boolean).join(' · '));
  const pill = q('.pill');
  pill.className = `pill ${s.status}`;
  setText(pill, `${STATUS[s.status].label} ${s.status === 'ended' ? '' : clock(Date.now() - (s.statusSince || s.lastTs))}`);
  setText(q('.title'), s.title || s.lastPrompt || '—');
  q('.title').title = s.lastPrompt || '';
  setText(q('.path'), s.cwd + (s.branch ? `  ⎇ ${s.branch}` : ''));
  setHTML(q('.act'), actionHTML(s));
  const pct = s.ctxMax ? Math.min(1, s.ctx / s.ctxMax) : 0;
  const bar = q('.bar > i');
  bar.style.width = (pct * 100).toFixed(1) + '%';
  bar.style.background = ctxCss(pct);
  setText(q('.cv'), `${fmtTok(s.ctx)}${s.ctxMax ? ' / ' + fmtTok(s.ctxMax) : ''}`);
  setText(q('.md'), [s.model, s.effort].filter(Boolean).join(' · '));
  setText(q('.tl'), s.tools);
  setText(q('.wb'), s.web);
  setText(q('.er'), s.errors);
  q('.er').classList.toggle('red', s.errors > 0);
  setText(q('.cost'), fmtUsd(s.cost));
  setHTML(q('.spark'), sparkBars(s.spark, col));
  setText(q('.ag'), s.agents.length ? `⤷ ${s.agentsRunning} çalışıyor · ${s.agents.length} alt ajan (15 dk)` : '');
  setHTML(q('.flags'), s.flags.map((f) => `<span class="flag">${esc(f)}</span>`).join(''));
}
function renderSessions() {
  const box = $('sessions');
  if (!STATE.sessions.length) return placeholder(box, 'son 30 dk’da Claude Code oturumu yok');
  keyed(box, STATE.sessions, (s) => s.id, createCard, updateCard);
}

function renderResearch() {
  const box = $('research');
  setText($('m-research'), `bugün ${STATE.totals.web} web çağrısı`);
  if (!STATE.research.length) return placeholder(box, 'bugün henüz web araması ya da getirme yok');
  keyed(
    box,
    STATE.research,
    (r) => r.id,
    () => {
      const el = document.createElement('div');
      el.className = 'rf';
      el.innerHTML = '<span class="k"></span><div class="tx"><div class="q"></div><div class="m"></div></div>';
      el.addEventListener('click', () => focusSession(el.__sid));
      return el;
    },
    (el, r) => {
      el.__sid = r.s;
      const k = el.querySelector('.k');
      k.className = 'k ' + r.kind;
      setText(k, r.kind === 'search' ? 'SRCH' : 'FTCH');
      setText(el.querySelector('.q'), r.kind === 'search' ? `“${r.l}”` : r.l);
      const bits = [sessName(r.s) + (r.a ? ' ⤷' : '')];
      if (r.hosts?.length) bits.push('→ ' + r.hosts.join(', '));
      if (r.m) bits.push(r.m);
      if (r.d != null) bits.push(fmtDur(r.d));
      bits.push(agoTR(r.t));
      setHTML(el.querySelector('.m'), `<i class="dot" style="background:${sessCss(r.s)}"></i>${esc(bits.join(' · '))}`);
      // A call whose result never shows up (interrupted turn) must not blink forever.
      el.classList.toggle('pending', r.ok === null && Date.now() - r.t < 120_000);
      el.classList.toggle('bad', r.ok === false || /^[45]\d\d/.test(r.m || ''));
    },
  );
}

function renderFiles() {
  const box = $('files');
  const items = STATE.files;
  const collisions = items.filter((f) => f.collision).length;
  setText($('m-files'), collisions ? `⚠ ${collisions} dosyayı 2+ ajan düzenledi` : `bugün en çok dokunulan ${items.length}`);
  if (!items.length) return placeholder(box, 'bugün henüz dosya okuma ya da düzenleme yok');
  const max = Math.max(1, ...items.map((f) => f.r + f.w));
  keyed(
    box,
    items,
    (f) => f.p,
    () => {
      const el = document.createElement('div');
      el.className = 'fh';
      el.innerHTML = '<span class="nm"></span><div class="bars"><i class="r"></i><i class="w"></i></div><span class="n"></span>';
      return el;
    },
    (el, f) => {
      setText(el.querySelector('.nm'), f.short);
      el.title = f.p;
      el.querySelector('.r').style.width = ((f.r / max) * 100).toFixed(1) + '%';
      el.querySelector('.w').style.width = ((f.w / max) * 100).toFixed(1) + '%';
      const dots = [...new Set(f.editors.map((e) => e.s))].map((s) => `<i style="background:${sessCss(s)}"></i>`).join('');
      setHTML(el.querySelector('.n'), `r${f.r} w${f.w}${dots}`);
      el.classList.toggle('collide', f.collision);
    },
  );
}

function renderMix() {
  const total = CATS.reduce((a, c) => a + (STATE.byCat[c] || 0), 0);
  setText($('m-mix'), `bugün ${STATE.totals.tools} çağrı · 30 dk eğilim`);
  setHTML(
    $('mix'),
    `<div class="mixbar">${CATS.map((c) => `<i style="width:${total ? (((STATE.byCat[c] || 0) / total) * 100).toFixed(2) : 0}%;background:${CAT[c].css}"></i>`).join('')}</div>` +
      `<div class="mixlegend">${CATS.map((c) => `<span><i style="background:${CAT[c].css}"></i>${CAT[c].label} <b>${STATE.byCat[c] || 0}</b></span>`).join('')}</div>` +
      `<svg class="chart" viewBox="0 0 300 34" preserveAspectRatio="none">${areaChart(STATE.toolSpark, 'var(--accent)', 300, 34)}</svg>`,
  );
}

function renderWorkers() {
  const list = [];
  for (const s of STATE.sessions) for (const a of s.agents) list.push({ ...a, sname: s.name });
  list.sort((a, b) => b.running - a.running || b.lastTs - a.lastTs);
  const running = list.filter((a) => a.running).length;
  setText($('m-workers'), list.length ? `${running} çalışıyor · son 15 dk’da ${list.length}` : 'alt ajanlar ve çatallar');
  const box = $('workers');
  if (!list.length) return placeholder(box, 'son 15 dk’da alt ajan yok');
  keyed(
    box,
    list.slice(0, 12),
    (a) => `${a.sid}:${a.id}`,
    () => {
      const el = document.createElement('div');
      el.className = 'wk';
      el.innerHTML = '<div class="l1"><b></b><span class="ty"></span><span class="tm"></span></div><div class="l2"></div><div class="prog"><i></i></div>';
      el.addEventListener('click', () => focusSession(el.__sid));
      return el;
    },
    (el, a) => {
      el.__sid = a.sid;
      el.classList.toggle('done', !a.running);
      setText(el.querySelector('b'), a.desc);
      setText(el.querySelector('.ty'), [a.type, a.sname].filter(Boolean).join(' · '));
      setText(el.querySelector('.tm'), a.running ? clock(Date.now() - a.firstTs) : `✓ ${agoTR(a.lastTs)}`);
      const p = a.pending[0] || a.last;
      setHTML(
        el.querySelector('.l2'),
        `${p ? `<span style="color:${CAT[p.c]?.css}">▸ ${esc(p.n)}</span> ${esc(clipT(p.l, 50))} · ` : ''}${a.tools} araç · ${fmtUsd(a.cost)}${a.errors ? ` · <span class="red">${a.errors} hata</span>` : ''}`,
      );
    },
  );
}

function renderSpend() {
  const box = $('spend');
  if (!box.dataset.ready) {
    box.innerHTML =
      '<div class="spend-big" id="spend-big">$0</div><div class="spend-sub" id="spend-sub"></div>' +
      '<svg class="chart" id="spend-chart" viewBox="0 0 300 34" preserveAspectRatio="none"></svg>' +
      '<div class="spend-rows" id="spend-rows"></div><div class="spend-kv" id="spend-kv"></div>';
    box.dataset.ready = '1';
  }
  const T = STATE.totals;
  setNum('spend-big', T.cost, fmtUsd);
  setText($('spend-sub'), `bugün · ${fmtTok(T.tok.out)} çıktı · ${fmtTok(T.tok.cr)} önbellek okuma · ${fmtTok(T.tok.cw)} önbellek yazma`);
  setHTML($('spend-chart'), areaChart(STATE.costSpark, 'var(--amber)', 300, 34));
  setHTML(
    $('spend-rows'),
    STATE.byModel
      .slice(0, 3)
      .map((m) => `<div class="sr"><span><b>${esc(m.model)}</b> · ${m.calls} çağrı</span><span>${fmtTok(m.tok.out)} çıktı</span><span class="c">${m.priced ? fmtUsd(m.cost) : 'fiyat yok'}</span></div>`)
      .join(''),
  );
  setHTML(
    $('spend-kv'),
    `<span>önbellek tasarrufu <b class="g">${fmtUsd(T.saved)}</b></span><span>saatlik <b>${fmtUsd(T.costPerHour)}</b></span><span>alt ajanlar <b>%${Math.round(T.agentShare * 100)}</b></span><span>ort. tur <b>${fmtDur(T.avgTurn)}</b></span>`,
  );
}

// The app's name changed in Settings: the title shows it at once.
window.addEventListener('appname', () => { try { if (STATE) renderCall(); } catch {} });
function renderCall() {
  const need = STATE.sessions
    .filter((s) => s.status === 'waiting' || s.status === 'idle')
    .sort((a, b) => (a.status === 'waiting' ? 0 : 1) - (b.status === 'waiting' ? 0 : 1) || a.statusSince - b.statusSince);
  const nW = need.filter((s) => s.status === 'waiting').length;
  $('p-call').classList.toggle('hot', nW > 0);
  const AN = window.AppName ? window.AppName.get() : 'Derin Terminal';
  const title = nW ? `⚠ ${nW} seni bekliyor · ${AN}` : need.length ? `◆ ${need.length} sıra sende · ${AN}` : AN;
  if (document.title !== title) document.title = title;
  setText($('m-call'), nW ? `${nW} sana takılı` : need.length ? `${need.length} sıradaki istemini bekliyor` : 'seni bekleyen yok');
  const box = $('call');
  if (!need.length)
    return placeholder(box, STATE.totals.live ? 'her şey sakin · tüm canlı oturumlar çalışıyor<small>ses açıksa bir uyarı duyarsın</small>' : 'canlı Claude Code oturumu yok', 'quiet');
  keyed(
    box,
    need,
    (s) => s.id,
    () => {
      const el = document.createElement('div');
      el.className = 'yc';
      el.innerHTML = '<span class="b"></span><span class="nm"></span><span class="tm"></span><span class="why"></span>';
      el.addEventListener('click', () => focusSession(el.dataset.key));
      return el;
    },
    (el, s) => {
      el.classList.toggle('waiting', s.status === 'waiting');
      el.classList.toggle('idle', s.status === 'idle');
      setText(el.querySelector('.b'), s.status === 'waiting' ? 'SENİ BEKLİYOR' : 'SIRA SENDE');
      setText(el.querySelector('.nm'), s.name);
      setText(el.querySelector('.tm'), clock(Date.now() - (s.statusSince || s.lastTs)));
      setText(el.querySelector('.why'), s.status === 'waiting' ? `${s.waitingFor || 'bekliyor'} · gitmek için tıkla` : s.title || s.lastPrompt || '');
    },
  );
}

function renderTicker() {
  const items = STATE.ticker;
  keyed(
    $('squares'),
    items,
    (t) => t.id,
    () => {
      const el = document.createElement('i');
      el.className = 'sq';
      return el;
    },
    (el, t) => {
      const col = CAT[t.c]?.css || 'var(--lavender)';
      if (el.__c !== col) {
        el.style.background = col;
        el.style.color = col;
        el.__c = col;
      }
      el.classList.toggle('run', t.st === 'run');
      el.classList.toggle('err', t.st === 'err');
      el.title = `${t.n} · ${{ run: 'çalışıyor', err: 'hata', ok: 'tamam' }[t.st] || t.st}`;
    },
  );
  const run = items.filter((t) => t.st === 'run').length, err = items.filter((t) => t.st === 'err').length;
  setText($('ticker-meta'), `${run} çalışıyor · ${err} hatalı`);
}

// ---------- 3D orbit map (orbit.js) ----------
// orbit.js renders the centre of the dashboard; calls made before it has loaded are queued.
const MAPQ = [];
function map(fn, ...args) {
  if (window.Orbit) window.Orbit[fn](...args);
  else MAPQ.push([fn, args]);
}

// ---------- tooltip ----------
function sessionTip(s) {
  const pct = s.ctxMax ? ` (%${Math.round((s.ctx / s.ctxMax) * 100)})` : '';
  const p = s.pending[0];
  const sys = [s.model, s.effort, s.tty && s.tty.replace('/dev/', ''), s.cpu ? '%' + s.cpu.toFixed(0) + ' CPU' : '', s.mem ? s.mem + ' MB' : ''].filter(Boolean).join(' · ');
  return (
    `<div class="h" style="color:${STATUS[s.status].color}">${esc(s.name)} · ${STATUS[s.status].label}${s.waitingFor ? ' · ' + esc(s.waitingFor) : ''}</div>` +
    (s.title ? `<div class="r">${esc(s.title)}</div>` : '') +
    (s.lastPrompt ? `<div class="d">› ${esc(clipT(s.lastPrompt, 170))}</div>` : '') +
    `<div class="d">${esc(s.cwd)}${s.branch ? ' ⎇ ' + esc(s.branch) : ''}</div>` +
    (sys ? `<div class="d">${esc(sys)}</div>` : '') +
    `<div class="r">bağlam ${fmtTok(s.ctx)}${pct} · ${fmtUsd(s.cost)} · ${s.tools} araç · ${s.web} web · ${s.errors} hata · ${s.prompts} istem</div>` +
    (p ? `<div class="r" style="color:${CAT[p.c]?.color}">▸ ${esc(p.n)} ${esc(p.l)} · ${fmtDur(Date.now() - p.t)}</div>` : '') +
    '<div class="d">tıkla → sohbet penceresini aç · taşımak için sürükle</div>'
  );
}
function agentTip(a, parent) {
  const p = a.pending[0] || a.last;
  return (
    `<div class="h" style="color:#9d6bff">◆ ${esc(a.desc)}</div>` +
    `<div class="d">${esc([a.type, a.model, a.bg ? 'arka plan' : '', parent ? 'kaynak: ' + parent.name : ''].filter(Boolean).join(' · '))}</div>` +
    `<div class="r">${a.running ? 'çalışıyor ' + clock(Date.now() - a.firstTs) : agoTR(a.lastTs) + ' bitti'} · ${a.tools} araç · ${fmtUsd(a.cost)} · ${a.errors} hata</div>` +
    (p ? `<div class="r" style="color:${CAT[p.c]?.color}">▸ ${esc(p.n)} ${esc(p.l)}</div>` : '')
  );
}
function stationTip(c) {
  const last = STATE?.lastByCat?.[c];
  return (
    `<div class="h" style="color:${CAT[c].color}">${CAT[c].station}</div>` +
    `<div class="r">bugün ${STATE?.byCat?.[c] ?? 0} çağrı · şu an ${STATE?.pendingByCat?.[c] || 0} çalışıyor</div>` +
    (last ? `<div class="d">son: ${esc(last.l)} · ${esc(sessName(last.s))} · ${agoTR(last.t)}</div>` : '')
  );
}
function terminalTip(t) {
  if (t.left) {
    return (
      `<div class="h" style="color:#ffa040">▸ ${esc(t.cmd)}</div>` +
      `<div class="r">${esc(t.cwd)}</div>` +
      `<div class="d">terminali kapandı, çalışmayı sürdürüyor · bitirmek için tıkla</div>`
    );
  }
  return (
    `<div class="h" style="color:#8fd3ff">▸ ${esc(t.running ? t.cmd : 'terminal')}</div>` +
    `<div class="r">${esc(t.cwd)}</div>` +
    `<div class="d">${t.running ? `çalışıyor${t.cpu >= 1 ? ` · %${Math.round(t.cpu)} CPU` : ''}` : 'boşta kabuk'} · açmak için tıkla</div>`
  );
}
// A terminal car was clicked: the app shows that terminal's window (hidden or behind others).
function openTerminal(id) {
  native({ type: 'openTerminal', id });
}
function showTip(html, x, y) {
  const t = $('tip');
  t.innerHTML = html;
  t.style.display = 'block';
  const W = $('mapwrap').clientWidth, H = $('mapwrap').clientHeight;
  const tw = t.offsetWidth, th = t.offsetHeight;
  let lx = x + 16, ly = y + 14;
  if (lx + tw > W - 6) lx = x - tw - 16;
  if (ly + th > H - 6) ly = y - th - 14;
  t.style.left = Math.max(6, lx) + 'px';
  t.style.top = Math.max(22, ly) + 'px';
}
function hideTip() {
  $('tip').style.display = 'none';
}

$('log').addEventListener('click', (e) => {
  const ln = e.target.closest('.ln');
  if (ln && ln.dataset.sid) focusSession(ln.dataset.sid);
});
$('newchat').addEventListener('click', () => native({ type: 'newTerminal' }));

// Shared with orbit.js.
window.RADAR = { CAT, CATS, STATUS, FONT, MAPQ, sessColor, colorIndex, sessName, hexA, fmtTok, fmtUsd, fmtDur, clock, ago, agoTR, clipT, esc, ctxColor, focusSession, sessionTip, agentTip, stationTip, terminalTip, openTerminal, showTip, hideTip };

// ---------- start ----------
setInterval(() => {
  setText($('clock'), new Date().toTimeString().slice(0, 8));
  if (STATE?.limits) renderLimits(); // keeps the reset countdowns current
}, 1000);
connect();

// Narrow windows: the top bar's numbers give way so its buttons always fit; the ones cut off fade at the edge.
(() => {
  const kpis = document.querySelector('#top .kpis');
  if (kpis) new ResizeObserver(() => kpis.classList.toggle('clip', kpis.scrollWidth > kpis.clientWidth + 1)).observe(kpis);
})();
