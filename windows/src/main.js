'use strict';
// Terminal for Windows: the Mac app's dashboard (app/Resources/web, unchanged) in Electron. This file is the
// Mac app's MainWindowController and AppDelegate: the windows, the line between the pages and the parts that feed them
// (engine.js, cloud.js, git.js, themes.js, terminals.js), the keys and the updates.
const {
  app, BaseWindow, BrowserWindow, WebContentsView, webContents, ipcMain, dialog, Menu, shell, screen, powerMonitor, nativeTheme, net,
  clipboard, nativeImage, protocol,
} = require('electron');
const { pathToFileURL } = require('url');
// The Videos tab's player reads local files through dtvideo:// (Range requests, so seeking works).
protocol.registerSchemesAsPrivileged([
  { scheme: 'dtvideo', privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true } },
]);
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { fileURLToPath } = require('url');

const { createEngine } = require('./engine');
const { createGit } = require('./git');
const { createCloud } = require('./cloud');
const { createThemes } = require('./themes');
const { createAIColors } = require('./aicolors');
const { createTerminals, which, resolveClaude } = require('./terminals');
const { createOverlay } = require('./overlay');
const { createRunaways } = require('./runaways');
const { createSavers } = require('./savers');
const { createChatList } = require('./chatlist');
const { commandLabel, fitInArea, newerVersion, notesOf, countFiles, findSkillDirs, treeIsContained } = require('./main-core');

let autoUpdater = null;
try {
  ({ autoUpdater } = require('electron-updater'));
} catch {}

// Where the dashboard's web files are: next to the app when it's installed (electron-builder copies them), the Mac
// app's folder in the repository when it runs from the sources.
const WEB = app.isPackaged ? path.join(process.resourcesPath, 'web') : path.join(__dirname, '..', '..', 'app', 'Resources', 'web');
const PRELOAD = path.join(__dirname, 'preload.js');
// ATL_PROBE=<folder>: a check without windows on screen — the pages render out of sight, pictures of them land in the
// folder, and the app quits (development only).
const PROBE = process.env.ATL_PROBE || '';

// Run from the sources on a Mac (development), its data must not land in the Mac app's own folder.
if (process.platform !== 'win32') app.setPath('userData', path.join(app.getPath('appData'), 'terminal-app-windows-dev'));
if (process.env.DT_E2E_USERDATA) app.setPath('userData', process.env.DT_E2E_USERDATA); // e2e smoke test: isolated data + own instance lock
if (!app.requestSingleInstanceLock()) app.quit();
nativeTheme.themeSource = 'dark';
// The installer's shortcuts carry the app's id (build.appId in package.json) as their AppUserModelID; the windows must
// too, or a pinned shortcut and the running app sit apart on the taskbar.
if (process.platform === 'win32' && app.isPackaged) app.setAppUserModelId('com.ersan.terminal');

// ---------- settings: a small JSON file in the app's data folder ----------
const SETTINGS = path.join(app.getPath('userData'), 'settings.json');
const settings = (() => {
  let data = {};
  try {
    data = JSON.parse(fs.readFileSync(SETTINGS, 'utf8'));
  } catch {}
  return {
    get: (k) => data[k],
    set(k, v) {
      data[k] = v;
      try {
        fs.mkdirSync(path.dirname(SETTINGS), { recursive: true });
        fs.writeFileSync(SETTINGS, JSON.stringify(data, null, 2));
      } catch (e) {
        console.error('settings:', e.message);
      }
    },
  };
})();

// ---------- the parts ----------
// The dashboard window: the chats list beside the dashboard's page, as the Mac's split view has them (two views, so
// each page is as wide as its part of the window).
let dash = null, dashView = null, chatsView = null;
const boots = new Map(); // webContents id -> what its preload asks for before the page loads
const chats = new Map(); // terminal window id -> { win, sessionId, cwd, claude, title, startedAt }
const panels = { notices: null, chats: new Map() }; // the messages panels: the corner's notices, friends' chats

// The AI tools in the theme's colours (Settings · INTERFACE): Claude Code, Codex and Antigravity on their themes that use
// the terminal's 16 colours.
const aiColors = createAIColors({
  settings,
  claudeDir: process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'),
  codexDir: process.env.CODEX_HOME || path.join(os.homedir(), '.codex'),
  home: os.homedir(),
});

const themes = createThemes({
  ai: aiColors,
  webDir: WEB,
  settings,
  onChange(css) {
    for (const id of boots.keys()) {
      const wc = webContents.fromId(id);
      if (wc && !wc.isDestroyed()) wc.send('atl:theme', css);
    }
    if (dash) for (const w of [dash, dashView, chatsView]) w.setBackgroundColor(themes.color('--bg'));
  },
  // Settings' text size: the dashboard zooms, as a browser does.
  onScale(factor) {
    if (dashView && !dashView.webContents.isDestroyed()) dashView.webContents.setZoomFactor(factor);
  },
});

// The token savers (rtk, caveman), shipped next to the dashboard's files; run from the sources, rtk is the one
// scripts/fetch-rtk.js put in vendor/ and caveman the Mac app's.
const savers = createSavers({
  settings,
  ownDir: path.join(process.env.LOCALAPPDATA || app.getPath('appData'), 'terminal-app'),
  bundled: app.isPackaged
    ? { rtk: path.join(process.resourcesPath, 'bin', 'rtk.exe'), caveman: path.join(process.resourcesPath, 'caveman') }
    : { rtk: path.join(__dirname, '..', 'vendor', 'rtk', 'rtk.exe'), caveman: path.join(__dirname, '..', '..', 'app', 'Resources', 'caveman') },
  claudeDir: process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'),
  codexDir: process.env.CODEX_HOME || path.join(os.homedir(), '.codex'),
  which,
  usable: process.platform === 'win32' && !PROBE,
});

const terminals = createTerminals({
  extraPath: savers.binDir,
  onData: (id, data) => {
    const c = chats.get(id);
    send(c?.win, 'term:data', data);
    // A chat opened with a prompt to deliver: typed in once Claude is up (its first output + a moment).
    if (c && c.pendingText && !c.pendingTimer) {
      c.pendingTimer = setTimeout(() => {
        const text = c.pendingText;
        c.pendingText = null;
        if (chats.get(id) === c && terminals.has(id)) pasteInto(id, text);
      }, 2500);
    }
  },
  onExit(id) {
    const c = chats.get(id);
    if (c) {
      send(c.win, 'term:exit');
      // A plain terminal closes with its shell; a chat's window stays to show how it ended until it's closed.
      if (!c.claude && c.win && !c.win.isDestroyed()) c.win.destroy();
      chats.delete(id);
      toDash(`terminalGone(${JSON.stringify(id)})`);
      pushTabs();
    }
    quitIfIdle();
  },
  // The session host keeps chats and terminals going without the app, as screen does on the Mac. Each build has its
  // own, as there (the installed app's, a development run's), and so does a profile of its own (npm run staging's): a
  // launch only ever brings back its own app's chats.
  host:
    process.platform === 'win32' && !PROBE
      ? {
          name: `terminal-app-host-v1-${os.userInfo().username.replace(/[^\w.-]/g, '_')}${app.isPackaged ? '' : '-dev'}${profileSuffix()}`,
          dir: path.join(process.env.LOCALAPPDATA || app.getPath('temp'), 'terminal-app-host'),
          source: path.join(__dirname, 'host.cs'),
        }
      : null,
});

// "" for the app's usual profile, else a short mark of the one it was given (--user-data-dir).
function profileSuffix() {
  let own, appData;
  try { own = app.getPath('userData').toLowerCase(); appData = app.getPath('appData'); } catch { return '-noprofile'; }
  if (path.resolve(own) === path.resolve(path.join(appData, app.getName())).toLowerCase()) return '';
  return '-' + crypto.createHash('sha256').update(own).digest('hex').slice(0, 8);
}

// Closing the dashboard keeps the app and its chats going, as on the Mac, where the Dock brings it back (here, starting
// the app again). With no chat or terminal left there's nothing to keep it for: it quits rather than stay on out of
// sight (the hidden notices panel would keep it alive, and the uninstaller would find it running).
function quitIfIdle() {
  if (!quitting && !dash && !terminals.list().length) app.quit();
}

const engine = createEngine({
  claudeDir: path.join(os.homedir(), '.claude'),
  limitsFile: path.join(app.getPath('userData'), 'limits.json'),
  // A Claude process under one of the app's terminals belongs to that window (its id becomes the session's `tab`).
  isAppPid: (pid) => (terminals.list().find((t) => t.pid === pid) || {}).id || false,
  onInit: (json) => toDash(`init(${json})`),
  onState(json) {
    toDash(`state(${json})`);
    matchChats();
    for (const [id, c] of chats) send(c.win, 'term:info', chatInfo(id, c));
    pushTabs();
    badge();
    pushChats();
  },
  onEvents: (json) => toDash(`events(${json})`),
  // The saved conversations, for the chats list.
  onHistory(items) {
    chatlist.setItems(items);
    pushChats();
  },
});

// The chats list beside the dashboard: what it lists, with the stars and the archive (src/chatlist.js).
const chatlist = createChatList({ settings });

const git = createGit({
  folders: () => [...engine.gitSessions(), ...engine.gitSources(), ...terminals.cwds()],
  written: () => engine.written(),
  async confirm({ message, detail, buttons, destructive }) {
    const r = await dialog.showMessageBox(dash || undefined, {
      type: destructive ? 'warning' : 'question', message, detail, buttons: buttons || ['Tamam', 'Vazgeç'], defaultId: 0, cancelId: (buttons || []).length - 1, noLink: true,
    });
    return r.response;
  },
  // Under the button that asked (`at`: the page's pixels), as Source Control's menus open on the Mac.
  menu: (items, at) => popupMenu(items, at, dashView),
  trash: (p) => shell.trashItem(p),
});

/**
 * A native menu of `items` ({ id, title } or { separator: true }, `items` for a submenu) at `at`, a point in the page of
 * `view` (one of the dashboard window's two), resolving to the id of the item picked, or null.
 */
function popupMenu(items, at, view) {
  return new Promise((resolve) => {
    let picked = null;
    const build = (list) =>
      (Array.isArray(list) ? list : []).map((i) => (i.separator || i.type === 'separator' ? { type: 'separator' } : {
        label: String(i.title || i.label || ''), enabled: i.enabled !== false, submenu: i.items ? build(i.items) : undefined,
        click: i.items ? undefined : () => (picked = i.id),
      }));
    const off = view ? view.getBounds() : { x: 0, y: 0 };
    const pos = at && Number.isFinite(at.x) && Number.isFinite(at.y) ? { x: Math.round(at.x + off.x), y: Math.round(at.y + off.y) } : {};
    Menu.buildFromTemplate(build(items)).popup({ window: dash || undefined, ...pos, callback: () => resolve(picked) });
  });
}

const cloud = createCloud({
  apiBase: process.env.ATALAY_API_URL || 'https://terminal-api.atalaykarahan.com',
  dataDir: app.getPath('userData'),
  version: app.getVersion(),
  clientKey: loadClientKey(),
  fetch: (url, init) => net.fetch(url, init),
  // Working, for the XP: someone at the keyboard in the last five minutes, and a sign of work — a Claude session
  // busy, or a terminal printing or typed in.
  isActive: () => powerMonitor.getSystemIdleTime() < 300 && (terminals.busySince(300_000) || engine.live().some((s) => s.status === 'busy')),
  idleSeconds: () => powerMonitor.getSystemIdleTime(),
  theme: () => themes.chosenId(),
  onChange(state) {
    pushCloud();
    if (state && state.xp) toNotices(`xp(${JSON.stringify(state.xp)})`);
  },
  onSocial(text) {
    toDash(`social(${text})`);
    toNotices(`event(${text})`);
    for (const p of panels.chats.values()) runPanel(p, `window.__messages && __messages.event(${text})`);
  },
});

// The signing key this build's API calls carry (src/clientkey.js, written masked at build time, never committed). A run
// from the sources against the local API (npm run staging) brings its own instead; a packaged app never reads one.
function loadClientKey() {
  try {
    if (!app.isPackaged && process.env.ATALAY_CLIENT_KEY_FILE) {
      const [id, secret] = fs.readFileSync(process.env.ATALAY_CLIENT_KEY_FILE, 'utf8').trim().split(':');
      return id && /^[0-9a-f]+$/i.test(secret || '') ? { id, secret } : null;
    }
    const k = require('./clientkey');
    const a = Buffer.from(k.a, 'base64'), b = Buffer.from(k.b, 'base64');
    const secret = Buffer.from(a.map((x, i) => x ^ b[i])).toString('hex');
    return k.id && secret ? { id: k.id, secret } : null;
  } catch {
    return null;
  }
}

const overlay = createOverlay({ dataDir: app.getPath('userData'), claudeDir: path.join(os.homedir(), '.claude') });
// Processes left burning a core where nobody sees them: the dashboard sounds the alarm (DANGER).
const runaways = createRunaways({
  // Each reading: the AI tools running besides Claude (Codex, Antigravity…), sessions on the orbit.
  onRead: () => engine.setOthers(runaways.ais()),
  onChange: (json) => {
    toDash(`runaways(${json})`);
    // The alarm, in the middle of the screen (the notices panel can play its sound).
    toNotices(`runaways && __messages.runaways(${json})`);
  },
});

// ---------- pushing to the pages ----------
// A window's page, or a view's (the dashboard window's two).
function pageOf(win) {
  if (!win || (typeof win.isDestroyed === 'function' && win.isDestroyed())) return null;
  const wc = win.webContents;
  return wc && !wc.isDestroyed() ? wc : null;
}
function run(win, js) {
  const wc = pageOf(win);
  if (wc) wc.executeJavaScript(`${js}; true`).catch(() => {});
}
function send(win, channel, data) {
  const wc = pageOf(win);
  if (wc) wc.send(channel, data);
}
// What a messages panel is told before its page reports "ready" waits for it, as on the Mac: a friend's chat opened
// with a click would otherwise stay empty, and the notices would miss the XP and events of the app's first seconds.
const panelWaiting = new WeakMap();
function runPanel(win, js) {
  const waiting = win && panelWaiting.get(win);
  if (waiting) waiting.push(js);
  else run(win, js);
}
const toDash = (call) => run(dashView, `window.__radar && window.__radar.${call}`);
const toNotices = (call) => runPanel(panels.notices, `window.__messages && __messages.${call}`);

// The page's Cloud state, with the Windows app's own updates in it (they come from GitHub releases, not the API).
function cloudState() {
  return { ...cloud.json(), ...updates.state() };
}
const pushCloud = () => toDash(`cloud(${JSON.stringify(cloudState())})`);

// ---------- windows ----------
function webPrefs() {
  return { preload: PRELOAD, contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false };
}

// A window shows the app's own pages and nothing else, as on the Mac (RadarView): a page from anywhere else, a file on
// this PC included, would get their line to the app (preload.js), which reaches the shells. A link out of a page opens
// where it belongs instead (a web page in the browser, a file in VS Code from Source Control); other kinds go nowhere,
// since Windows has handlers for some that run things.
const PAGES = [WEB, path.join(__dirname, '..', 'pages')];
function ownPage(url) {
  let file;
  try {
    file = fileURLToPath(url);
  } catch {
    return false;
  }
  return PAGES.some((dir) => {
    const rel = path.relative(dir, file);
    return rel && !rel.startsWith('..') && !path.isAbsolute(rel);
  });
}
app.on('web-contents-created', (_e, contents) => {
  contents.on('will-navigate', (e, url) => {
    if (ownPage(url)) return;
    e.preventDefault();
    if (/^(https?|vscode):/i.test(url)) shell.openExternal(url);
  });
});

function bootFor(webContents, extra = {}) {
  const look = { font: 'Cascadia Mono', size: 13 };
  boots.set(webContents.id, { css: themes.css(), look, ...extra });
  webContents.once('destroyed', () => boots.delete(webContents.id));
}

function createDashboard() {
  const area = screen.getPrimaryDisplay().workArea;
  const bg = themes.color('--bg');
  dash = new BaseWindow({
    width: Math.min(1480, area.width), height: Math.min(900, area.height), minWidth: 980, minHeight: 600,
    title: "Derin Terminal", backgroundColor: bg, show: false, autoHideMenuBar: true, ...(appIcon ? { icon: appIcon } : {}),
    ...(PROBE ? { x: -32000, y: -32000, frame: false, width: 1480, height: 900 } : {}),
  });
  const win = dash;
  // The app's menu and its keys (Ctrl+N, Ctrl+K, Ctrl+Q…), as the other windows have them.
  if (process.platform !== 'darwin' && Menu.getApplicationMenu()) win.setMenu(Menu.getApplicationMenu());
  dashView = new WebContentsView({ webPreferences: webPrefs() });
  chatsView = new WebContentsView({ webPreferences: webPrefs() });
  const views = [dashView, chatsView];
  for (const v of views) {
    v.setBackgroundColor(bg);
    win.contentView.addChildView(v);
    bootFor(v.webContents);
    // Links in the pages open in the browser, never inside the app.
    v.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:/.test(url)) shell.openExternal(url);
      return { action: 'deny' };
    });
    v.webContents.on('render-process-gone', () => setTimeout(() => !v.webContents.isDestroyed() && v.webContents.reload(), 500));
    // Ctrl+B, the Mac's ⌘B: the chats list slides open or shut (in the terminals it stays the shell's).
    v.webContents.on('before-input-event', (e, input) => {
      if (input.type === 'keyDown' && input.control && !input.alt && !input.shift && !input.meta && input.key.toLowerCase() === 'b') {
        e.preventDefault();
        toggleChats();
        return;
      }
      // Ctrl+Tab / Ctrl+W: the chat tabs over the orbit map (embedKeys).
      if (v === dashView) embedKeys(e, input);
    });
  }
  chatsView.setVisible(chatsList.shown);
  layout();
  for (const ev of ['resize', 'maximize', 'unmaximize', 'restore', 'enter-full-screen', 'leave-full-screen']) win.on(ev, layout);
  dashView.webContents.loadFile(path.join(WEB, 'index.html'));
  // The text size Settings keeps, on every load (a reload starts at 100% otherwise).
  dashView.webContents.on('did-finish-load', () => dashView.webContents.setZoomFactor(themes.uiScale()));
  chatsView.webContents.loadFile(path.join(__dirname, '..', 'pages', 'chats.html'));
  // Shown once the dashboard's page is there (no empty window first), or a few seconds on whatever happens.
  let shown = false;
  const show = () => {
    if (shown || win.isDestroyed()) return;
    shown = true;
    if (PROBE) return win.showInactive();
    win.show();
    dashView.webContents.focus();
  };
  dashView.webContents.once('did-finish-load', show);
  setTimeout(show, 4000);
  const visibility = () => toDash(`visibility(${win.isVisible() && !win.isMinimized()}, ${win.isFocused()})`);
  for (const ev of ['focus', 'blur', 'minimize', 'restore', 'show', 'hide']) win.on(ev, visibility);
  // The level-up waits for the app to be in front (the notices' "focus"): the app's focus events are BrowserWindows'.
  win.on('focus', tellFocus);
  win.on('blur', () => setImmediate(tellFocus));
  win.on('closed', () => {
    // Its chat tabs become windows of their own (hidden), their terminals going on.
    embedEvacuate();
    // A window's views don't go with it: their pages close here.
    for (const v of views) if (!v.webContents.isDestroyed()) v.webContents.close();
    if (dash === win) {
      dash = dashView = chatsView = null;
      videoUnwatch();
    }
    clearInterval(chatsList.timer);
    chatsList.timer = null;
    chatsList.slide = null;
    chatsJSON = '';
    badged = 0;
    quitIfIdle();
  });
}

// ---------- the chats list beside the dashboard (the Mac's sidebar) ----------
// Open from the start, at the width it had when it was last closed (narrowest 210, widest 460); Ctrl+B or its × slides
// it open and shut, fading, while the dashboard gives it room and takes it back.
const CHATS_MIN = 210, CHATS_MAX = 460;
const chatsWidth = (w) => (Number.isFinite(w) ? Math.round(Math.min(CHATS_MAX, Math.max(CHATS_MIN, w))) : 280);
const chatsList = { shown: settings.get('sidebarHidden') !== true, width: chatsWidth(settings.get('sidebarWidth')), slide: null, timer: null };

function layout() {
  if (!dash || dash.isDestroyed()) return;
  const [w, h] = dash.getContentSize();
  const side = Math.round(chatsList.slide != null ? chatsList.slide : chatsList.shown ? chatsList.width : 0);
  chatsView.setBounds({ x: 0, y: 0, width: side, height: h });
  dashView.setBounds({ x: side, y: 0, width: Math.max(0, w - side), height: h });
  embedLayout();
}

// CSS's cubic-bezier(0.65, 0, 0.35, 1), the Mac's slide: progress (0…1) -> how far along.
const slideCurve = (() => {
  const [x1, y1, x2, y2] = [0.65, 0, 0.35, 1];
  const at = (a, b, s) => 3 * a * s * (1 - s) ** 2 + 3 * b * s * s * (1 - s) + s ** 3;
  return (t) => {
    let lo = 0, hi = 1;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (at(x1, x2, mid) < t) lo = mid;
      else hi = mid;
    }
    return at(y1, y2, (lo + hi) / 2);
  };
})();

function toggleChats() {
  if (!dash || chatsList.timer) return;
  const opening = !chatsList.shown;
  const from = opening ? 0 : chatsList.width, to = opening ? chatsList.width : 0;
  if (opening) chatsView.setVisible(true);
  run(chatsView, `window.__chats && __chats.fade(${opening})`);
  const t0 = Date.now();
  chatsList.slide = from;
  layout();
  chatsList.timer = setInterval(() => {
    const t = Math.min(1, (Date.now() - t0) / 450);
    chatsList.slide = from + (to - from) * slideCurve(t);
    if (t >= 1) {
      clearInterval(chatsList.timer);
      chatsList.timer = null;
      chatsList.slide = null;
      chatsList.shown = opening;
      if (!opening && chatsView) chatsView.setVisible(false);
      settings.set('sidebarHidden', !opening);
    }
    layout();
  }, 16);
}

let chatsJSON = '', chatsVersion = -1;
function pushChats(force) {
  if (!chatsView) return;
  const live = chatlist.setLive(engine.live());
  // A chat with a window of the app, shown or not: "in a window".
  const open = chatlist.setOpen([...chats.values()].map((c) => c.sessionId).filter(Boolean));
  if (!force && !live && !open && chatlist.version() === chatsVersion) return;
  chatsVersion = chatlist.version();
  const json = JSON.stringify(chatlist.snapshot());
  if (json === chatsJSON && !force) return;
  chatsJSON = json;
  run(chatsView, `window.__chats && __chats.update(${json})`);
}

// The chats list's requests (pages/chats.js).
function handleChats(msg) {
  const dir = () => {
    const d = String(msg.cwd || '');
    return d && fs.existsSync(d) ? d : null;
  };
  switch (msg.type) {
    case 'ready':
      pushChats(true);
      return true;
    case 'open':
      return openSession(String(msg.id || ''), false);
    case 'fork':
      return openSession(String(msg.id || ''), true);
    case 'newTerminal': {
      const d = dir();
      if (d) openChatWindow({ cwd: d, claudeArgs: null, title: path.basename(d) });
      return true;
    }
    case 'reveal': {
      const d = dir();
      if (d) shell.openPath(d);
      return true;
    }
    case 'copyId':
      if (typeof msg.id === 'string' && msg.id) clipboard.writeText(msg.id);
      return true;
    case 'favorite':
      chatlist.toggleFavorite(String(msg.id || ''));
      break;
    case 'archive':
      chatlist.toggleArchived(String(msg.id || ''));
      break;
    case 'rename':
      chatlist.rename(String(msg.id || ''), String(msg.name ?? ''));
      break;
    case 'folders':
      for (const k of Array.isArray(msg.keys) ? msg.keys : []) chatlist.setFolder(String(k || ''), msg.on === true);
      break;
    case 'menu':
      return popupMenu(msg.items, msg.at, chatsView);
    case 'close':
      toggleChats();
      return true;
    // Dragged wider or narrower: kept for the next time it opens (and the next launch) once the drag is over.
    case 'width':
      if (!chatsList.shown || chatsList.timer) return true;
      chatsList.width = chatsWidth(Number(msg.w));
      layout();
      if (msg.done) settings.set('sidebarWidth', chatsList.width);
      return true;
    default:
      throw new Error('unknown request');
  }
  pushChats(true);
  return true;
}

// Settings' archived chats (web/cloud.js's "archived chats · manage"): the list by folder, and taking a chat, a folder
// or all of them back out.
function handleArchive(msg) {
  switch (msg.type) {
    case 'list':
      break;
    case 'restore':
      chatlist.restore(String(msg.id || ''));
      break;
    case 'restoreFolder':
      chatlist.setFolder(String(msg.cwd || ''), false);
      break;
    case 'restoreAll':
      chatlist.restoreAll();
      break;
    default:
      throw new Error('unknown request');
  }
  pushChats();
  return { folders: chatlist.archivedList() };
}

// The Mac's Dock badge: how many chats need the user (a question, a permission), here as a number on the dashboard's
// taskbar button. Drawn by the dashboard's page: the main process has no canvas.
let badged = 0;
async function badge() {
  if (process.platform !== 'win32' || !dash || dash.isDestroyed()) return;
  const n = engine.live().filter((s) => s.status === 'waiting').length;
  if (n === badged) return;
  badged = n;
  if (!n) return dash.setOverlayIcon(null, '');
  const label = n > 9 ? '9+' : String(n);
  const url = await dashView.webContents
    .executeJavaScript(
      `(() => { const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d');
        g.fillStyle = '#e5484d'; g.beginPath(); g.arc(16, 16, 16, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#fff'; g.font = 'bold ${label.length > 1 ? 15 : 21}px "Segoe UI", sans-serif'; g.textAlign = 'center';
        g.textBaseline = 'middle'; g.fillText(${JSON.stringify(label)}, 16, 17); return c.toDataURL(); })()`,
    )
    .catch(() => null);
  // The page not ready yet (the app just started): the next state tries again.
  if (!url) return void (badged = 0);
  if (badged === n && dash && !dash.isDestroyed()) dash.setOverlayIcon(nativeImage.createFromDataURL(url), `${n} waiting for you`);
}

function showDashboard() {
  if (!dash) createDashboard();
  if (dash.isMinimized()) dash.restore();
  // Tam ekran çalışma alanı: ilk açılışta pencere büyütülmüş gelir (PROBE/E2E hariç).
  const first = !dash.isVisible() && !dash.__shownOnce;
  dash.__shownOnce = true;
  if (first && !PROBE && !process.env.DT_E2E) dash.maximize();
  dash.show();
  dash.focus();
  // The keys go to the dashboard's page unless the chats list has them (its search).
  if (!chatsView.webContents.isFocused()) dashView.webContents.focus();
}

// Settings · Claude modeli (appname.js, localStorage "chat.model"): what new chats start with (terminals.spawn).
let chatModel = 'haiku';

// Settings · Logo (applogo.js, localStorage "app.logo"): the windows' and taskbar's icon. Until the page tells us,
// build/icon.png (so a dev run doesn't show Electron's logo).
let appIcon = (() => {
  try { const i = nativeImage.createFromPath(path.join(__dirname, '..', 'build', 'icon.png')); return i.isEmpty() ? undefined : i; } catch { return undefined; }
})();
function setAppIcon(dataUrl) {
  let img = null;
  try { img = typeof dataUrl === 'string' && dataUrl.startsWith('data:image/') ? nativeImage.createFromDataURL(dataUrl) : null; } catch {}
  if (!img || img.isEmpty()) return;
  appIcon = img;
  for (const w of BaseWindow.getAllWindows()) { try { if (!w.isDestroyed()) w.setIcon(img); } catch {} }
}

// ---------- the dashboard's requests (the "radar" handler) ----------
// ---------- prompts from the dashboard's presets (sendText / newChatWithText) ----------
let lastChatId = null;
// Plain string, capped, with no bracketed-paste end marker (it would end the paste early and run the rest as keys).
const { cleanPrompt, isVideo, videoKey, videoDirOk, videoPathOk } = require('./guards');
function pasteInto(id, text, submit = true) {
  terminals.write(id, `\x1b[200~${text}\x1b[201~`);
  if (submit) setTimeout(() => terminals.has(id) && terminals.write(id, '\r'), 60);
}
function chatForPrompt(sid) {
  const usable = (id) => id && chats.has(id) && terminals.has(id) && !chats.get(id).win.isDestroyed();
  if (sid) {
    for (const [id, c] of chats) if (c.sessionId === sid && usable(id)) return id;
    const s = engine.live().find((x) => x.sessionId === sid);
    if (s && usable(s.tab)) return s.tab;
  }
  if (usable(lastChatId)) return lastChatId;
  const recent = [...chats.entries()].filter(([id, c]) => c.claude && usable(id)).sort((a, b) => b[1].startedAt - a[1].startedAt)[0];
  return recent ? recent[0] : null;
}
function sendText(msg) {
  const text = cleanPrompt(msg.text);
  if (!text) return { ok: false, reason: 'empty' };
  const id = chatForPrompt(msg.sid);
  if (!id) return { ok: false, reason: 'no-chat' };
  pasteInto(id, text, msg.submit !== false);
  showChat(id);
  return { ok: true, id };
}
function newChatWithText(msg) {
  const text = cleanPrompt(msg.text);
  if (!text) return { ok: false, reason: 'empty' };
  const last = lastChatId && chats.get(lastChatId);
  let cwd = typeof msg.cwd === 'string' && msg.cwd ? msg.cwd : (last && last.cwd) || os.homedir();
  try {
    if (!fs.statSync(cwd).isDirectory()) cwd = os.homedir();
  } catch {
    cwd = os.homedir();
  }
  const id = openChatWindow({ cwd, claudeArgs: [], title: path.basename(cwd) });
  if (!id) return { ok: false, reason: 'no-claude' };
  chats.get(id).pendingText = text;
  return { ok: true, id };
}

// ---------- Proje başlatıcı ("+ yeni video") ----------
const projectCore = require('./project-core');
const projectBaseOk = (b) => typeof b === 'string' && path.isAbsolute(b) && !b.split(/[\\/]/).includes('..');
const subdirs = (dir) => {
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith('.') && !d.name.startsWith('_')).map((d) => d.name);
  } catch {
    return [];
  }
};
async function handleProject(msg) {
  if (typeof msg.base === 'string') msg.base = msg.base.trim().replace(/^~(?=$|[\\/])/, os.homedir());
  switch (msg.type) {
    case 'projectInfo': {
      if (!projectBaseOk(msg.base)) return { ok: false, reason: 'base' };
      const base = path.resolve(msg.base);
      const marka = projectCore.sanitizeName(msg.marka || '');
      return {
        ok: true,
        base,
        exists: fs.existsSync(base),
        brands: subdirs(base).sort((a, b) => a.localeCompare(b, 'tr')),
        next: marka ? projectCore.nextNumber(subdirs(path.join(base, marka))) : 1,
      };
    }
    case 'projectPickFolder': {
      const r = await dialog.showOpenDialog(dash || undefined, { title: msg.title || 'Klasör seç', buttonLabel: 'Seç', properties: ['openDirectory'] });
      return r.canceled || !r.filePaths.length ? null : r.filePaths[0];
    }
    case 'projectCreate': {
      if (!projectBaseOk(msg.base)) return { ok: false, reason: 'Ana klasör geçersiz' };
      const base = path.resolve(msg.base);
      const marka = projectCore.sanitizeName(msg.marka);
      const video = String(msg.video || '').trim().slice(0, 120);
      if (!marka) return { ok: false, reason: 'Marka adı geçersiz' };
      if (!video) return { ok: false, reason: 'Video adı gerekli' };
      let ham = typeof msg.ham === 'string' && msg.ham.trim() ? path.resolve(msg.ham.trim()) : '';
      if (ham && (!path.isAbsolute(msg.ham.trim()) || !fs.existsSync(ham))) return { ok: false, reason: 'Ham çekim klasörü bulunamadı' };
      const brandDir = path.join(base, marka);
      const no = projectCore.nextNumber(subdirs(brandDir));
      const dir = path.join(brandDir, String(no));
      if (!projectCore.isInside(base, dir) || fs.existsSync(dir)) return { ok: false, reason: 'Klasör zaten var' };
      const folders = projectCore.buildFolders(msg.folders);
      try {
        fs.mkdirSync(dir, { recursive: true });
        for (const rel of folders) {
          const p = path.join(dir, ...rel.split('/'));
          if (projectCore.isInside(dir, p) && !fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
        }
        const info = {
          marka, video, no, klasor: dir, ham,
          formats: Array.isArray(msg.formats) ? msg.formats : [],
          muzik: String(msg.muzik || '').trim().slice(0, 300),
          sure: String(msg.sure || '').trim().slice(0, 60),
          date: new Date().toISOString().slice(0, 10),
        };
        const notes = path.join(dir, 'NOTLAR.md');
        if (!fs.existsSync(notes)) fs.writeFileSync(notes, projectCore.buildNotes(info), 'utf8');
        const chat = newChatWithText({ cwd: dir, text: projectCore.buildPrompt(info, msg.prompt) });
        return { ok: true, dir, no, chat: chat && chat.ok };
      } catch (e) {
        return { ok: false, reason: String((e && e.message) || e) };
      }
    }
  }
  return null;
}

function handleRadar(msg) {
  switch (msg.type) {
    case 'projectInfo':
    case 'projectPickFolder':
    case 'projectCreate':
      return handleProject(msg);
    case 'sendText':
      return sendText(msg);
    case 'newChatWithText':
      return newChatWithText(msg);
    case 'chatModel':
      chatModel = ['haiku', 'sonnet', 'opus'].includes(msg.model) ? msg.model : 'default';
      return true;
    case 'appLogo':
      setAppIcon(msg.dataUrl);
      return true;
    case 'ready':
      engine.requestInit();
      pushCloud();
      pushTerminals(true);
      toDash(`runaways(${runaways.json()})`);
      return true;
    case 'open':
      return openSession(msg.sid, false);
    case 'fork':
      return openSession(msg.sid, true);
    case 'newTerminal':
      return showOverlay('Overlay.newTerminal()');
    case 'openTerminal':
      // A car: its window comes up in front, a closed one too (its terminal ran on out of sight).
      return chats.get(msg.id) && showChat(msg.id);
    case 'endLeftover':
      return runaways.endLeft(msg.pid, msg.started);
    case 'endSession':
      return endSession(msg.sid);
    case 'endRunaway':
      return runaways.end(msg.pid, msg.started);
    case 'videoPickFolder':
    case 'videoList':
    case 'videoWatch':
    case 'videoUnwatch':
    case 'videoReveal':
    case 'videoSessionDirs':
    case 'videoQC':
    case 'videoSaveFrame':
    case 'videoNotify':
      return handleVideo(msg);
    case 'deliverScan':
    case 'deliverPickRaw':
    case 'deliverRun':
      return handleDeliver(msg);
    case 'skillsList':
    case 'skillsInstall':
    case 'skillsPickFile':
    case 'skillsToggle':
    case 'skillsRemove':
    case 'skillsReveal':
    case 'skillsBundled':
    case 'skillsInstallBundled':
      return handleSkills(msg);
    // A dialog of the page's open: the chat tab's view (drawn over the page) steps aside until it's closed.
    case 'modal':
      embed.modal = msg.open === true;
      embedLayout();
      return true;
    case 'tabsReady':
    case 'tabRect':
    case 'tabSelect':
    case 'tabClose':
    case 'tabCycle':
    case 'tabMenu':
    case 'embedChats':
      return handleTabs(msg);
    case 'log':
      console.log('dashboard page:', msg.msg);
      return true;
    default:
      return true;
  }
}

// ---------- the Skills tab: Claude Code skills in ~/.claude/skills (and skills-disabled) ----------
const SKILLS_ON = path.join(os.homedir(), '.claude', 'skills');
const SKILLS_OFF = path.join(os.homedir(), '.claude', 'skills-disabled');
const SKILLS_BUNDLED = app.isPackaged ? path.join(process.resourcesPath, 'skills') : path.join(__dirname, '..', '..', 'skills');
const { SKILL_NAME, parseSkillMd } = require('./skills-core');

function skillMeta(dir) {
  let txt;
  try { txt = fs.readFileSync(path.join(dir, 'SKILL.md'), 'utf8'); } catch { return null; }
  return parseSkillMd(txt);
}
const skillHash = (dir) => { try { return crypto.createHash('sha1').update(fs.readFileSync(path.join(dir, 'SKILL.md'))).digest('hex'); } catch { return ''; } };


function listSkillDir(root, enabled) {
  let ents = [];
  try { ents = fs.readdirSync(root, { withFileTypes: true }); } catch { return []; }
  const out = [];
  for (const e of ents) {
    if (!e.isDirectory()) continue;
    const dir = path.join(root, e.name);
    const meta = skillMeta(dir);
    if (!meta) continue;
    let mtime = 0;
    try { mtime = fs.statSync(path.join(dir, 'SKILL.md')).mtimeMs; } catch {}
    out.push({ name: e.name, title: meta.name || e.name, dir, description: meta.description, mtime, files: countFiles(dir), enabled });
  }
  return out;
}

const skillDirOf = (name) => {
  if (!SKILL_NAME.test(name || '')) return null;
  for (const [root, enabled] of [[SKILLS_ON, true], [SKILLS_OFF, false]]) {
    const d = path.join(root, name);
    if (fs.existsSync(path.join(d, 'SKILL.md'))) return { dir: d, enabled };
  }
  return null;
};


function extractZip(file, dest) {
  return new Promise((resolve, reject) => {
    const done = (err) => (err ? reject(err) : resolve());
    if (process.platform === 'win32') {
      // Expand-Archive refuses extensions other than .zip: copy the .skill aside under a .zip name first.
      const zip = path.join(dest + '-src.zip');
      try { fs.copyFileSync(file, zip); } catch (e) { return reject(e); }
      execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
        'Expand-Archive -LiteralPath $args[0] -DestinationPath $args[1] -Force', zip, dest],
      { windowsHide: true, timeout: 120000 }, (err) => { try { fs.rmSync(zip, { force: true }); } catch {} done(err); });
    } else if (process.platform === 'darwin') {
      execFile('ditto', ['-x', '-k', file, dest], { timeout: 120000 }, done);
    } else {
      execFile('unzip', ['-q', '-o', file, '-d', dest], { timeout: 120000 }, done);
    }
  });
}


async function installSkillDirs(dirs) {
  const installed = [];
  const skipped = [];
  for (const src of dirs) {
    const meta = skillMeta(src) || {};
    const name = String(meta.name || path.basename(src)).trim().toLowerCase();
    if (!SKILL_NAME.test(name)) { skipped.push({ name, reason: 'Geçersiz ad (yalnız a-z, 0-9, - ; en çok 64)' }); continue; }
    const dest = path.join(SKILLS_ON, name);
    const existing = skillDirOf(name);
    if (existing) {
      const r = await dialog.showMessageBox(dash || undefined, {
        type: 'question', buttons: ['Üzerine yaz', 'Vazgeç'], defaultId: 1, cancelId: 1,
        message: `“${name}” skill'i zaten kurulu`, detail: 'Mevcut sürüm geri dönüşüm kutusuna taşınıp yenisi kurulsun mu?',
      });
      if (r.response !== 0) { skipped.push({ name, reason: 'Vazgeçildi' }); continue; }
      try { await shell.trashItem(existing.dir); } catch { fs.rmSync(existing.dir, { recursive: true, force: true }); }
    }
    fs.mkdirSync(SKILLS_ON, { recursive: true });
    fs.cpSync(src, dest, { recursive: true, dereference: false, filter: (s) => !/[\\/]__MACOSX([\\/]|$)/.test(s) });
    installed.push(name);
  }
  return { ok: installed.length > 0, installed, skipped };
}

async function installSkillFrom(p) {
  if (!p || typeof p !== 'string' || !fs.existsSync(p)) return { ok: false, error: 'Dosya bulunamadı' };
  const st = fs.statSync(p);
  if (st.isDirectory()) {
    const dirs = findSkillDirs(p);
    if (!dirs.length) return { ok: false, error: 'Klasörde SKILL.md bulunamadı' };
    return installSkillDirs(dirs);
  }
  if (!/\.(skill|zip)$/i.test(p)) return { ok: false, error: 'Yalnız .skill, .zip ya da klasör kurulabilir' };
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dt-skill-'));
  const out = path.join(tmp, 'x');
  try {
    fs.mkdirSync(out);
    await extractZip(p, out);
    if (!treeIsContained(out)) return { ok: false, error: 'Arşiv güvensiz yollar içeriyor' };
    const dirs = findSkillDirs(out);
    if (!dirs.length) return { ok: false, error: 'Arşivde SKILL.md bulunamadı' };
    return await installSkillDirs(dirs);
  } catch (e) {
    return { ok: false, error: 'Arşiv açılamadı: ' + (e && e.message ? e.message : e) };
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
  }
}

async function handleSkills(msg) {
  switch (msg.type) {
    case 'skillsList':
      return [...listSkillDir(SKILLS_ON, true), ...listSkillDir(SKILLS_OFF, false)].sort((a, b) => a.name.localeCompare(b.name));
    case 'skillsPickFile': {
      const r = await dialog.showOpenDialog(dash || undefined, {
        title: 'Skill seç', buttonLabel: 'Kur', properties: ['openFile'],
        filters: [{ name: 'Skill paketi', extensions: ['skill', 'zip'] }],
      });
      return r.canceled || !r.filePaths[0] ? null : r.filePaths[0];
    }
    case 'skillsInstall':
      return installSkillFrom(msg.path);
    case 'skillsToggle': {
      const cur = skillDirOf(msg.name);
      if (!cur) return { ok: false, error: 'Skill bulunamadı' };
      const want = !!msg.enabled;
      if (cur.enabled === want) return { ok: true };
      const root = want ? SKILLS_ON : SKILLS_OFF;
      const dest = path.join(root, msg.name);
      if (fs.existsSync(dest)) return { ok: false, error: 'Hedefte aynı adlı klasör var' };
      fs.mkdirSync(root, { recursive: true });
      try { fs.renameSync(cur.dir, dest); } catch (e) { return { ok: false, error: e.message }; }
      return { ok: true };
    }
    case 'skillsRemove': {
      const cur = skillDirOf(msg.name);
      if (!cur) return { ok: false, error: 'Skill bulunamadı' };
      const r = await dialog.showMessageBox(dash || undefined, {
        type: 'warning', buttons: ['Kaldır', 'Vazgeç'], defaultId: 1, cancelId: 1,
        message: `“${msg.name}” kaldırılsın mı?`, detail: 'Klasör geri dönüşüm kutusuna taşınır.',
      });
      if (r.response !== 0) return { ok: false, canceled: true };
      try { await shell.trashItem(cur.dir); } catch (e) { return { ok: false, error: e.message }; }
      return { ok: true };
    }
    case 'skillsReveal': {
      const cur = skillDirOf(msg.name);
      if (!cur) return false;
      shell.openPath(cur.dir);
      return true;
    }
    case 'skillsBundled': {
      let ents = [];
      try { ents = fs.readdirSync(SKILLS_BUNDLED, { withFileTypes: true }); } catch { return []; }
      const out = [];
      for (const e of ents) {
        if (!e.isDirectory() || !SKILL_NAME.test(e.name)) continue;
        const dir = path.join(SKILLS_BUNDLED, e.name);
        const meta = skillMeta(dir);
        if (!meta) continue;
        const cur = skillDirOf(e.name);
        out.push({ name: e.name, title: meta.name || e.name, description: meta.description,
          installed: !!cur, outdated: !!cur && skillHash(cur.dir) !== skillHash(dir) });
      }
      return out.sort((a, b) => a.name.localeCompare(b.name));
    }
    case 'skillsInstallBundled': {
      if (!SKILL_NAME.test(msg.name || '')) return { ok: false, error: 'Geçersiz ad' };
      const dir = path.join(SKILLS_BUNDLED, msg.name);
      if (!fs.existsSync(path.join(dir, 'SKILL.md'))) return { ok: false, error: 'Paket bulunamadı' };
      return installSkillDirs([dir]);
    }
    default:
      return true;
  }
}

// ---------- the Videos tab: local video files, served through dtvideo:// ----------
// isVideo, videoKey, videoDirOk, videoPathOk: ./guards (required above)
const videoAllowed = new Set(); // files videoList returned: the only ones dtvideo:// serves
const video = { watcher: null, dir: null, timer: null };

// only Render\, Assets\Onizleme\, Videolar\ (or the folder's top level): ./video-core
async function videoList(dir) {
  const list = (await require('./video-core').listVideos(path.resolve(dir))).filter((v) => isVideo(v.name)).slice(0, 200);
  for (const v of list) {
    videoAllowed.add(videoKey(v.path));
    v.url = 'dtvideo://f/?p=' + encodeURIComponent(v.path);
  }
  return list;
}

function videoUnwatch() {
  clearTimeout(video.timer);
  if (video.watcher) try { video.watcher.close(); } catch {}
  video.watcher = video.dir = video.timer = null;
}

function videoWatch(dir) {
  videoUnwatch();
  try {
    video.watcher = fs.watch(dir, { recursive: process.platform === 'win32' || process.platform === 'darwin' }, () => {
      clearTimeout(video.timer);
      video.timer = setTimeout(() => {
        run(dashView, `window.dispatchEvent(new CustomEvent('dt-videos-changed',{detail:{dir:${JSON.stringify(dir)}}}))`);
      }, 500);
    });
    video.watcher.on('error', () => videoUnwatch());
    video.dir = dir;
    return true;
  } catch {
    return false;
  }
}

async function handleVideo(msg) {
  switch (msg.type) {
    case 'videoPickFolder': {
      const r = await dialog.showOpenDialog(dash || undefined, { title: 'Klasör seç', buttonLabel: 'Seç', properties: ['openDirectory'] });
      return r.canceled || !r.filePaths.length ? null : r.filePaths[0];
    }
    case 'videoList':
      return videoDirOk(msg.dir) ? videoList(msg.dir) : [];
    case 'videoWatch':
      return videoDirOk(msg.dir) ? videoWatch(path.resolve(msg.dir)) : false;
    case 'videoUnwatch':
      videoUnwatch();
      return true;
    case 'videoReveal': {
      const p = msg.path;
      if (typeof p !== 'string' || !path.isAbsolute(p) || !isVideo(p) || !videoAllowed.has(videoKey(p))) return false;
      shell.showItemInFolder(path.resolve(p));
      return true;
    }
    // QC (ffprobe + ebur128/astats) and frame grabs: ./video-qc; only files videoList returned
    case 'videoQC':
      if (!videoPathOk(msg.path, videoAllowed)) return { ok: false, error: 'İzin yok' };
      return require('./video-qc').runQC(path.resolve(msg.path)).catch((e) => ({ ok: false, error: String(e && e.message || e) }));
    case 'videoSaveFrame':
      if (!videoPathOk(msg.path, videoAllowed)) return { ok: false, error: 'İzin yok' };
      return require('./video-qc').saveFrame(path.resolve(msg.path), msg.dataUrl, msg.t).catch((e) => ({ ok: false, error: String(e && e.message || e) }));
    case 'videoNotify': {
      const { Notification } = require('electron');
      if (!Notification.isSupported()) return false;
      const n = new Notification({ title: String(msg.title || 'Render hazır').slice(0, 120), body: String(msg.body || '').slice(0, 240), silent: true });
      n.on('click', () => { try { if (dash) { dash.show(); dash.focus(); } } catch {} });
      n.show();
      return true;
    }
    case 'videoSessionDirs': {
      const seen = new Map();
      const add = (d) => {
        if (typeof d === 'string' && path.isAbsolute(d) && !seen.has(videoKey(d))) seen.set(videoKey(d), d);
      };
      for (const s of engine.gitSessions()) if (s.live) add(s.cwd);
      for (const c of chats.values()) add(c.cwd);
      for (const s of engine.gitSessions()) add(s.cwd);
      try {
        for (const d of terminals.cwds()) add(typeof d === 'string' ? d : d && d.cwd);
      } catch {}
      return [...seen.values()];
    }
  }
  return null;
}

function registerVideoProtocol() {
  protocol.handle('dtvideo', (req) => {
    let p = null;
    try {
      p = new URL(req.url).searchParams.get('p');
    } catch {}
    if (!videoPathOk(p, videoAllowed))
      return new Response('forbidden', { status: 403 });
    return net.fetch(pathToFileURL(path.resolve(p)).toString(), { headers: req.headers, bypassCustomProtocolHandlers: true });
  });
}

// ---------- "Teslim paketi": copy a final render (+ kapak, caption.txt) to Teslim\<tarih>, the raw-footage folder, the clipboard ----------
const dcore = require('./deliver-core');
const deliverVideoOk = (p) => typeof p === 'string' && path.isAbsolute(p) && isVideo(p) && videoAllowed.has(videoKey(p));
const absDirOk = (d) => typeof d === 'string' && path.isAbsolute(d) && !d.split(/[\\/]/).includes('..');
async function deliverCover(root) {
  const dir = path.join(root, 'Kapak');
  try {
    const ents = await fs.promises.readdir(dir, { withFileTypes: true });
    const list = [];
    for (const e of ents) if (e.isFile()) list.push({ name: e.name, mtime: (await fs.promises.stat(path.join(dir, e.name))).mtimeMs });
    const n = dcore.findCover(list);
    return n ? path.join(dir, n) : null;
  } catch {
    return null;
  }
}
const readNotes = (root) => fs.promises.readFile(path.join(root, 'NOTLAR.md'), 'utf8').catch(() => '');
function clipboardFiles(files) {
  return new Promise((resolve) => {
    const done = (err) => resolve(!err);
    if (process.platform === 'win32')
      execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-STA', '-Command', '& { Set-Clipboard -LiteralPath $args }', ...files], { windowsHide: true }, done);
    else if (process.platform === 'darwin')
      execFile('osascript', ['-e', 'on run argv', '-e', 'set the clipboard to (POSIX file (item 1 of argv))', '-e', 'end run', files[0]], done);
    else resolve(false);
  });
}
// Copy src into dir under a name that exists nowhere yet (asks first; "Numaralı kopya" or skip). Never overwrites.
async function deliverCopy(src, dir, name) {
  const exists = (n) => fs.existsSync(path.join(dir, n));
  let n = name || path.basename(src);
  if (exists(n)) {
    const r = await dialog.showMessageBox(dash || undefined, {
      type: 'question', buttons: ['Numaralı kopya ekle', 'Atla'], defaultId: 0, cancelId: 1,
      message: `${n} zaten var`, detail: `${dir}\nÜzerine yazılmaz.`,
    });
    if (r.response !== 0) return null;
    n = dcore.uniqueName(n, exists);
  }
  const dst = path.join(dir, n);
  await fs.promises.copyFile(src, dst, fs.constants.COPYFILE_EXCL);
  return dst;
}
async function handleDeliver(msg) {
  if (!deliverVideoOk(msg.path)) return { ok: false, reason: 'path' };
  const src = path.resolve(msg.path);
  const root = dcore.projectRootOf(src);
  switch (msg.type) {
    case 'deliverScan': {
      const cover = await deliverCover(root);
      let coverUrl = null;
      if (cover) try { coverUrl = require('electron').nativeImage.createFromPath(cover).resize({ width: 240 }).toDataURL(); } catch {}
      const rawDir = dcore.rawDirFromNotes(await readNotes(root));
      return { ok: true, root, name: path.basename(src), cover, coverUrl, rawDir, teslimDir: path.join(root, 'Teslim', dcore.dateStamp()) };
    }
    case 'deliverPickRaw': {
      const r = await dialog.showOpenDialog(dash || undefined, { title: 'Ham çekim klasörünü seç', buttonLabel: 'Seç', defaultPath: root, properties: ['openDirectory'] });
      if (r.canceled || !r.filePaths.length) return null;
      const dir = r.filePaths[0];
      // remembered once per project in <proje>\NOTLAR.md
      const notes = await readNotes(root);
      const line = dcore.rawDirNoteLine(dir);
      const next = dcore.rawDirFromNotes(notes) != null
        ? notes.replace(/^([-*\s]*)Ham çekim klasörü\s*:.*$/im, (m, pre) => pre + line)
        : (notes && !notes.endsWith('\n') ? notes + '\n' : notes) + line + '\n';
      try { await fs.promises.writeFile(path.join(root, 'NOTLAR.md'), next, 'utf8'); } catch {}
      return dir;
    }
    case 'deliverRun': {
      const cover = typeof msg.cover === 'string' && msg.cover ? path.resolve(msg.cover) : null;
      if (cover && (path.dirname(cover).toLowerCase() !== path.join(root, 'Kapak').toLowerCase() || !/\.(jpe?g|png)$/i.test(cover))) return { ok: false, reason: 'cover' };
      const rawDir = msg.raw && absDirOk(msg.rawDir) ? path.resolve(msg.rawDir) : null;
      if (msg.raw && !rawDir) return { ok: false, reason: 'rawDir' };
      const caption = typeof msg.caption === 'string' ? msg.caption.slice(0, 20000) : '';
      const targets = dcore.deliverTargets({ root, rawDir, date: dcore.dateStamp(), raw: !!msg.raw, teslim: !!msg.teslim });
      const out = [], errors = [];
      let clipFiles = [src];
      for (const t of targets) {
        try {
          await fs.promises.mkdir(t.dir, { recursive: true });
          const v = await deliverCopy(src, t.dir);
          if (v) { out.push(v); if (t.kind === 'teslim') clipFiles = [v]; }
          if (cover) { const c = await deliverCopy(cover, t.dir); if (c) out.push(c); }
          if (caption.trim()) {
            const n = dcore.uniqueName('caption.txt', (x) => fs.existsSync(path.join(t.dir, x)));
            await fs.promises.writeFile(path.join(t.dir, n), caption, { encoding: 'utf8', flag: 'wx' });
            out.push(path.join(t.dir, n));
          }
        } catch (e) {
          errors.push(`${t.dir}: ${e.message}`);
        }
      }
      let clip = null;
      if (msg.clipboard) clip = await clipboardFiles(clipFiles);
      if (out.length) shell.showItemInFolder(out[0]);
      return { ok: !errors.length, files: out, errors, clipboard: clip };
    }
  }
  return null;
}

// ---------- terminal and chat windows ----------
function chatInfo(id, c) {
  const s = c.sessionId && engine.live().find((x) => x.sessionId === c.sessionId);
  // A chat with no live Claude after its first seconds is a terminal: Claude exited, or never started (not installed).
  const starting = c.claude && Date.now() - c.startedAt < 15_000;
  const status = !terminals.has(id) ? 'ended' : s ? s.status : starting ? 'busy' : 'terminal';
  return { title: (s && s.name) || c.title, status: status === 'shell' ? 'idle' : status, cwd: tildify(c.cwd) };
}

const tildify = (p) => (p && p.startsWith(os.homedir()) ? '~' + p.slice(os.homedir().length) : p || '');

/**
 * Which conversation a chat window shows. The engine finds a chat's Claude under the window's shell (`tab`), and that
 * always wins, also over a guess made before it came; until then a new chat takes the first live session in its folder.
 * A chat that outlived the last launch waits for the engine: the guess could take another chat in the same folder.
 */
function matchChats() {
  const live = engine.live();
  for (const s of live) {
    const c = s.tab && chats.get(s.tab);
    if (!c || !c.claude || c.sessionId === s.sessionId) continue;
    // A session the engine places in this window too keeps it (a Claude started inside the chat's Claude doesn't take
    // its window); a guess gives way.
    if (!live.some((x) => x.sessionId === c.sessionId && x.tab === s.tab)) c.sessionId = s.sessionId;
  }
  const taken = new Set([...chats.values()].map((c) => c.sessionId).filter(Boolean));
  for (const c of chats.values()) {
    if (!c.claude || c.sessionId || !c.claudeArgs) continue;
    const s = live.find((x) => !x.ai && !taken.has(x.sessionId) && samePath(x.cwd, c.cwd));
    if (s) {
      c.sessionId = s.sessionId;
      taken.add(s.sessionId);
    }
  }
}
const samePath = (a, b) => !!a && !!b && path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

/**
 * A chat or terminal window. A new one starts its shell (Claude in it with `claudeArgs`); one given the `id` of a session
 * that outlived the app attaches to it instead (`claude`: whether it was started as a chat), hidden unless `show`.
 */
/**
 * Claude Code missing (a fresh PC): asks, in a native dialog, whether to install it now. "Kur" opens one of the app's
 * terminal windows running the official installer visibly, then `claude`, so the user signs in with their account in the
 * browser. Resolves true when the install window opened.
 */
let installAsking = null;
function offerClaudeInstall() {
  if (process.env.DT_E2E || resolveClaude()) return Promise.resolve(false);
  if (installAsking) return installAsking;
  installAsking = dialog
    .showMessageBox(dash || undefined, {
      type: 'question', buttons: ['Kur', 'Sonra'], defaultId: 0, cancelId: 1, noLink: true,
      message: 'Claude Code kurulu değil. Şimdi kurulsun mu?',
      detail: 'Resmi kurulum betiği bir terminal penceresinde çalışır; her adımı görürsün. Bitince Claude açılır ve tarayıcıda hesabınla giriş yaparsın.',
    })
    .then(({ response }) => {
      if (response !== 0) return false;
      openChatWindow({ cwd: os.homedir(), claudeArgs: null, install: true, title: 'Claude Code kurulumu' });
      return true;
    })
    .finally(() => (installAsking = null));
  return installAsking;
}

function openChatWindow({ id = crypto.randomUUID(), cwd, claudeArgs, claude = !!claudeArgs, sessionId, title, show = true, install = false }) {
  // A chat (new or resumed) while Claude Code isn't installed: the install offer instead of "claude is not recognized".
  if (claudeArgs && !install && !resolveClaude() && !PROBE) {
    offerClaudeInstall();
    return null;
  }
  const c = { win: null, sessionId, cwd, claude, claudeArgs, install, title: title || path.basename(cwd || os.homedir()), startedAt: Date.now() };
  chats.set(id, c);
  // Settings · "Sohbetleri ana pencerede aç" (on unless turned off): a tab over the dashboard's orbit map, else a window.
  c.win = embedWanted() ? embedHost(id, c) : chatWindow(id, c, show);
  if (c.win.embedded && show) {
    c.win.show();
    c.win.webContents.once('did-finish-load', () => embed.active === id && c.win.focus());
  }
  // Once its first seconds are over a chat says what it is even if nothing else changes (chatInfo).
  if (claude) setTimeout(() => chats.get(id) === c && send(c.win, 'term:info', chatInfo(id, c)), 15_500);
  return id;
}

/** A chat's own window (terminal.html): the chat `c` of `id`, shown once ready when `show`. */
function chatWindow(id, c, show) {
  const area = screen.getPrimaryDisplay().workArea;
  const cascade = chats.size * 28;
  const win = new BrowserWindow({
    width: 960, height: 640, minWidth: 560, minHeight: 360, x: area.x + 120 + cascade, y: area.y + 80 + cascade,
    title: c.title || "Derin Terminal", backgroundColor: themes.color('--code-bg'), show: false, autoHideMenuBar: true, ...(appIcon ? { icon: appIcon } : {}),
    ...(PROBE ? { x: -32000, y: -32000, frame: false } : {}),
    webPreferences: webPrefs(),
  });
  bootFor(win.webContents);
  win.loadFile(path.join(__dirname, '..', 'pages', 'terminal.html'));
  win.once('ready-to-show', () => show && (PROBE ? win.showInactive() : win.show()));
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  // Closing a window (Ctrl+W, its ×) only hides it, as on the Mac: what runs in it goes on, Claude as a session on the
  // orbit and a terminal as the same car it was (no blast), and a click there brings the window back. End Session ends
  // it. Quitting closes them all: their sessions were seen to just before (the host's go on).
  win.on('close', (e) => {
    if (quitting || !terminals.has(id)) return;
    e.preventDefault();
    win.hide();
  });
  win.on('closed', () => {
    if (chats.get(id)?.win === win) chats.delete(id);
  });
  win.on('focus', () => (lastChatId = id));
  return win;
}

function showChat(id) {
  const c = chats.get(id);
  if (!c || c.win.isDestroyed()) return false;
  if (c.win.isMinimized()) c.win.restore();
  c.win.show();
  c.win.focus();
  return true;
}

// ---------- chats inside the dashboard (Windows only; the Mac keeps a window per chat) ----------
// The orbit map's column gets tabs: "Harita" and one per chat opened there. Each chat is a WebContentsView of its own
// (terminal.html, same preload, same term:* lines) over the column, where the page's placeholder says (its rect, sent
// on every resize and tab change); only the active tab's is visible. Closing a tab is closing the chat's window: what
// runs in it goes on, and a click on the orbit or the list brings the tab back.
const embed = { order: [], active: null, rect: null, modal: false, hosts: new Map(), json: '' };
const embedOn = () => settings.get('embedChats') !== false;
const embedWanted = () => !PROBE && process.platform === 'win32' && embedOn() && !!dash && !dash.isDestroyed() && !!dashView;

/** A chat's view in the dashboard window, with the bits of a BrowserWindow the rest of this file uses on `c.win`. */
function embedHost(id, c) {
  const view = new WebContentsView({ webPreferences: webPrefs() });
  const wc = view.webContents;
  view.setBackgroundColor(themes.color('--code-bg'));
  view.setVisible(false);
  dash.contentView.addChildView(view);
  bootFor(wc);
  let gone = false;
  const host = {
    embedded: true, view, webContents: wc, title: c.title,
    isDestroyed: () => gone || wc.isDestroyed(),
    isMinimized: () => false,
    restore() {},
    isFocused: () => !host.isDestroyed() && !!dash && dash.isFocused() && wc.isFocused(),
    show() {
      if (host.isDestroyed()) return;
      showDashboard();
      embedSelect(id);
    },
    focus() {
      if (!host.isDestroyed() && embed.active === id) wc.focus();
    },
    // Its tab goes; the view stays out of sight with its terminal going.
    hide() {
      embedUntab(id);
    },
    close() {
      host.hide();
    },
    destroy() {
      if (gone) return;
      gone = true;
      embed.hosts.delete(id);
      embedUntab(id);
      try {
        if (dash && !dash.isDestroyed()) dash.contentView.removeChildView(view);
      } catch {}
      if (!wc.isDestroyed()) wc.close();
      if (chats.get(id)?.win === host) chats.delete(id);
    },
  };
  embed.hosts.set(id, host);
  wc.loadFile(path.join(__dirname, '..', 'pages', 'terminal.html'));
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));
  wc.on('focus', () => (lastChatId = id));
  wc.on('render-process-gone', () => setTimeout(() => !host.isDestroyed() && wc.reload(), 500));
  wc.on('before-input-event', (e, input) => embedKeys(e, input));
  return host;
}

// Ctrl+Tab / Ctrl+Shift+Tab: the next or previous tab (the map one included); Ctrl+W: the active chat's tab closes.
function embedKeys(e, input) {
  if (input.type !== 'keyDown' || !input.control || input.alt || input.meta) return;
  const k = String(input.key || '').toLowerCase();
  if (k === 'tab') {
    e.preventDefault();
    embedCycle(input.shift ? -1 : 1);
  } else if (k === 'w' && !input.shift && embed.active) {
    e.preventDefault();
    embedCloseTab(embed.active);
  }
}

function embedSelect(id) {
  if (id && !embed.hosts.has(id)) return;
  if (id && !embed.order.includes(id)) embed.order.push(id);
  embed.active = id || null;
  if (id) lastChatId = id;
  embedLayout();
  pushTabs();
  const h = id && embed.hosts.get(id);
  if (h) h.focus();
  else if (dashView && !dashView.webContents.isDestroyed()) dashView.webContents.focus();
}

function embedUntab(id) {
  const i = embed.order.indexOf(id);
  if (i < 0) return;
  embed.order.splice(i, 1);
  if (embed.active === id) {
    embed.active = embed.order[Math.min(i, embed.order.length - 1)] || null;
    if (embed.active) lastChatId = embed.active;
  }
  embedLayout();
  pushTabs();
  const h = embed.active && embed.hosts.get(embed.active);
  if (h) h.focus();
}

function embedCycle(dir) {
  const ring = [null, ...embed.order];
  if (ring.length < 2) return;
  const i = ring.indexOf(embed.active);
  embedSelect(ring[(i + dir + ring.length) % ring.length]);
}

// A tab's ×: as a chat window's × (the chat goes on unseen); one whose terminal is over goes for good.
function embedCloseTab(id) {
  const h = embed.hosts.get(id);
  if (!h) return;
  if (terminals.has(id) && chats.get(id)?.win === h) h.hide();
  else h.destroy();
}

// Into a window of its own ("Ayrı pencerede aç"): its page there attaches to the same terminal (term:ready).
function embedPopOut(id, show = true) {
  const c = chats.get(id), h = embed.hosts.get(id);
  if (!h) return false;
  if (!c || c.win !== h || !terminals.has(id)) {
    h.destroy();
    return false;
  }
  c.win = chatWindow(id, c, show);
  h.destroy();
  return true;
}

// The visible chat's view over the placeholder the page reported (its CSS pixels, at the page's zoom).
function embedLayout() {
  if (!dash || dash.isDestroyed() || !dashView) return;
  const r = embed.rect;
  const off = dashView.getBounds();
  const z = dashView.webContents.isDestroyed() ? 1 : dashView.webContents.getZoomFactor() || 1;
  for (const [id, h] of embed.hosts) {
    if (h.isDestroyed()) continue;
    const on = id === embed.active && !!r && !embed.modal && r.w > 0 && r.h > 0;
    if (on) {
      h.view.setBounds({
        x: Math.round(off.x + r.x * z), y: Math.round(off.y + r.y * z),
        width: Math.max(0, Math.round(r.w * z)), height: Math.max(0, Math.round(r.h * z)),
      });
    }
    h.view.setVisible(on);
  }
}

// The tabs, to the dashboard's page (web/chattabs.js); `embed` tells it whether to draw them at all.
function pushTabs(force) {
  const tabs = embed.order.map((id) => {
    const c = chats.get(id), h = embed.hosts.get(id);
    const i = c ? chatInfo(id, c) : { title: (h && h.title) || 'terminal', status: 'ended' };
    if (c && h) h.title = i.title;
    return { id, title: i.title, status: i.status, sid: (c && c.sessionId) || null };
  });
  const json = JSON.stringify({ embed: process.platform === 'win32' && embedOn(), active: embed.active, tabs });
  if (json === embed.json && !force) return;
  embed.json = json;
  run(dashView, `window.__chatTabs && __chatTabs.update(${json})`);
}

// The dashboard window going: its chats move to windows of their own, out of sight, their terminals going on.
function embedEvacuate() {
  for (const id of [...embed.hosts.keys()]) embedPopOut(id, false);
  embed.order = [];
  embed.active = null;
  embed.rect = null;
  embed.json = '';
}

// The dashboard page's tab requests (web/chattabs.js).
function handleTabs(msg) {
  const id = typeof msg.id === 'string' ? msg.id : null;
  switch (msg.type) {
    case 'tabsReady':
      pushTabs(true);
      return true;
    case 'tabRect': {
      const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
      embed.rect = msg.rect ? { x: n(msg.rect.x), y: n(msg.rect.y), w: n(msg.rect.w), h: n(msg.rect.h) } : null;
      embedLayout();
      return true;
    }
    case 'tabSelect':
      embedSelect(id);
      return true;
    case 'tabClose':
      if (id) embedCloseTab(id);
      return true;
    case 'tabCycle':
      embedCycle(msg.dir === -1 ? -1 : 1);
      return true;
    case 'tabMenu':
      if (!id || !embed.hosts.has(id)) return true;
      return popupMenu(
        [{ id: 'out', title: 'Ayrı pencerede aç', enabled: terminals.has(id) }, { separator: true }, { id: 'close', title: 'Sekmeyi kapat' }, { id: 'end', title: 'Bu terminali bitir', enabled: terminals.has(id) }],
        msg.at, dashView,
      ).then((pick) => {
        if (pick === 'out') embedPopOut(id, true) && showChat(id);
        else if (pick === 'close') embedCloseTab(id);
        else if (pick === 'end') endTerminal(id);
        return true;
      });
    case 'embedChats':
      settings.set('embedChats', msg.on === true);
      pushTabs(true);
      return true;
  }
  return null;
}

/** The window of a process running outside the app, to the front: its own or the first of its parents' that has one. */
function revealOutside(pid) {
  if (process.platform !== 'win32' || !(pid > 0)) return;
  const own = runaways.ais().find((a) => a.pid === pid);
  const ids = [pid, ...((own && own.chain) || [])].filter((n) => Number.isInteger(n) && n > 0);
  const script = `$s = New-Object -ComObject WScript.Shell; foreach ($id in @(${ids.join(',')})) { if ($s.AppActivate([int]$id)) { break } }`;
  execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, timeout: 10_000 }, () => {});
}

function openSession(sid, fork) {
  if (!sid) return false;
  const live = engine.live().find((s) => s.sessionId === sid);
  // Another AI tool (Codex…) has no conversation to resume or copy: a click shows the window it runs in, ours, or else
  // the terminal's outside the app (Windows Terminal, VS Code…), the first of its parents with a window.
  if (sid.startsWith('ai:')) {
    if (fork || !live) return false;
    if (live.tab && chats.has(live.tab) && terminals.has(live.tab)) return showChat(live.tab);
    revealOutside(live.pid);
    return true;
  }
  if (!fork) {
    for (const [id, c] of chats) if (c.sessionId === sid && terminals.has(id)) return showChat(id);
    // Running in one of the app's windows that doesn't know it yet: a terminal Claude was started in, a chat back from
    // the last launch.
    if (live && live.tab && chats.has(live.tab) && terminals.has(live.tab)) return showChat(live.tab);
  }
  const cwd = engine.sessionCwd(sid) || (live && live.cwd);
  if (!cwd || !fs.existsSync(cwd)) {
    dialog.showMessageBox(dash || undefined, { type: 'warning', message: 'Proje klasörü bulunamadı', detail: cwd || 'Bu sohbetin hangi klasörde başladığı anlaşılamadı.' });
    return false;
  }
  // A chat running in another terminal can't be resumed twice: it opens as a copy, as "Open a Copy" does on the Mac.
  const copy = fork || !!live;
  openChatWindow({ cwd, claudeArgs: ['--resume', sid, ...(copy ? ['--fork-session'] : [])], sessionId: copy ? null : sid, title: (copy ? '⑂ ' : '') + ((live && live.name) || sid.slice(0, 8)) });
  return true;
}

/**
 * End Session, as on the Mac: the window goes and everything that runs in it ends, gently first (the host hangs the
 * session up, then ends what's still there three seconds on, a dev server that shrugged it off included). The dashboard
 * drops its session now and its car blows up now, not when the processes are gone.
 */
function endTerminal(id) {
  const c = chats.get(id);
  const t = terminals.list().find((x) => x.id === id);
  const tree = t && t.pid ? runaways.tree(t.pid) : [];
  // What it ran is on its way out: one that outlives the shell by a second or two isn't a car left behind.
  for (const p of tree) ending.set(p.pid, Date.now() + 10_000);
  // Without the host's help (a terminal running in the app, an older host), what the shell started apart from its
  // console is ended here once the rest has had its time.
  if (!terminals.end(id) && tree.length) setTimeout(() => runaways.fresh().then(() => runaways.kill(tree)), 3000);
  if (c && c.sessionId) {
    const live = engine.live().find((s) => s.sessionId === c.sessionId);
    engine.dismiss(c.sessionId, live && live.pid);
  }
  toDash(`terminalGone(${JSON.stringify(id)})`);
  if (c) {
    if (c.win && !c.win.isDestroyed()) c.win.destroy();
    chats.delete(id);
  }
  quitIfIdle();
}

function endSession(sid) {
  const live = engine.live().find((s) => s.sessionId === sid);
  for (const [id, c] of chats) {
    if (c.sessionId === sid || (live && live.tab === id)) {
      endTerminal(id);
      return true;
    }
  }
  // Running outside the app: its process ends.
  if (live && live.pid) {
    // Another AI tool ends with all it started: Codex's launcher alone would leave its codex.exe running.
    if (live.ai) runaways.endLeft(live.pid, Number(sid.split(':')[2]));
    else {
      try {
        process.kill(live.pid);
      } catch {}
    }
  }
  engine.dismiss(sid, live && live.pid);
  return true;
}

// ---------- the orbit's cars ----------
// Every terminal of the app with no Claude in it is a car of its own (a chat whose Claude exited too), a closed one
// included, until End Session: what runs in it (its first job and the CPU that job's processes use) decides how it
// flies. What a closed terminal left running is an amber car (runaways.left) that ends with a click.
let terminalsJSON = '';
const ending = new Map(); // pid -> until when it's an ended terminal's process, not a car left behind
function pushTerminals(force) {
  const live = engine.live(), list = [], jobs = [];
  for (const [pid, until] of ending) if (until < Date.now()) ending.delete(pid);
  for (const t of terminals.list()) {
    const c = chats.get(t.id);
    // Claude in it is a session on the orbit, not a car.
    if (!c || !t.pid || live.some((s) => s.tab === t.id) || (c.claude && chatInfo(t.id, c).status !== 'terminal')) continue;
    const kids = runaways.children(t.pid);
    if (kids.some((k) => /^claude$/i.test(k.name))) continue;
    const job = kids[0];
    if (job) jobs.push(job.pid);
    // The folder the job runs in (PowerShell's cd doesn't move the shell's own), else the one the terminal opened in.
    const cwd = (job && job.cwd) || c.cwd || os.homedir();
    list.push({
      id: t.id, cwd: tildify(cwd), dir: path.basename(cwd) || cwd, cmd: job ? commandLabel(job.cmd || job.name) : '', running: !!job,
      cpu: Math.round(runaways.busy(kids.map((k) => k.pid))),
    });
  }
  for (const l of runaways.left()) {
    if (ending.has(l.pid)) continue;
    list.push({
      id: `left:${l.pid}:${l.started}`, cwd: tildify(l.cwd), dir: l.cwd ? path.basename(l.cwd) || l.cwd : l.name, cmd: commandLabel(l.cmd),
      running: true, cpu: Math.round(l.cpu), left: true, pid: l.pid, started: l.started,
    });
  }
  // Their folders come with the next reading, and the AI tools' (the title of their session).
  runaways.want([...jobs, ...runaways.ais().map((a) => a.pid)]);
  list.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const json = JSON.stringify(list);
  if (json === terminalsJSON && !force) return;
  terminalsJSON = json;
  toDash(`terminals(${json})`);
}


// The terminal pages' lines to their shells.
const chatOf = (e) => [...chats.entries()].find(([, c]) => c.win && !c.win.isDestroyed() && c.win.webContents === e.sender);
ipcMain.on('term:ready', (e, { cols, rows }) => {
  const found = chatOf(e);
  if (!found) return;
  const [id, c] = found;
  // A new window starts its shell; one for a session that's already running (it outlived the app, or the page
  // reloaded) attaches to it.
  if (terminals.has(id)) terminals.attach(id, cols, rows);
  else {
    terminals
      .spawn({ id, cwd: c.cwd, claudeArgs: c.claudeArgs, install: c.install, cols, rows, title: c.title, model: chatModel })
      .catch((err) => send(c.win, 'term:data', `\r\n\x1b[31m${err.message}\x1b[0m\r\n`));
  }
  send(c.win, 'term:info', chatInfo(id, c));
});
ipcMain.on('term:input', (e, data) => {
  const found = chatOf(e);
  if (found) terminals.write(found[0], data);
});
ipcMain.on('term:resize', (e, { cols, rows }) => {
  const found = chatOf(e);
  if (found) terminals.resize(found[0], cols, rows);
});
ipcMain.on('term:end', (e) => {
  const found = chatOf(e);
  if (found) endTerminal(found[0]);
});
ipcMain.on('term:copy', (e, text) => {
  if (chatOf(e) && typeof text === 'string' && text) clipboard.writeText(text);
});
ipcMain.on('term:dashboard', (e) => {
  const found = chatOf(e);
  showDashboard();
  // From a chat tab: back to the map tab.
  if (found && found[1].win.embedded) embedSelect(null);
});
ipcMain.on('term:open', (_e, uri) => {
  if (/^https?:\/\//.test(uri)) shell.openExternal(uri);
});

// ---------- the overlay: the shortcut wheel and the new-terminal folder picker, over the whole screen ----------
let over = null, overReady = false, overPending = null;
function showOverlay(js) {
  if (!over || over.isDestroyed()) {
    overReady = false;
    over = new BrowserWindow({
      frame: false, transparent: true, resizable: false, movable: false, show: false, skipTaskbar: true, hasShadow: false,
      alwaysOnTop: true, backgroundColor: '#00000000', webPreferences: webPrefs(),
    });
    bootFor(over.webContents);
    over.loadFile(path.join(WEB, 'overlay.html'));
    over.on('blur', hideOverlay);
  }
  const d = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  over.setBounds(d.bounds);
  over.setAlwaysOnTop(true, 'pop-up-menu');
  over.show();
  over.focus();
  if (overReady) run(over, js);
  else overPending = js;
  return true;
}
function hideOverlay() {
  if (over && !over.isDestroyed() && over.isVisible()) over.hide();
}
/** The wheel, centred where the pointer is (Ctrl and the middle mouse button, or Ctrl+K: Windows has no four-finger
 *  click). */
function showShortcuts() {
  const p = screen.getCursorScreenPoint();
  const d = screen.getDisplayNearestPoint(p);
  return showOverlay(`Overlay.shortcuts(${p.x - d.bounds.x}, ${p.y - d.bounds.y})`);
}
// Ctrl and the middle button in any of the app's windows (preload.js).
ipcMain.on('atl:wheel', () => showShortcuts());

// ---------- the messages panels: the corner's notices and friends' chats ----------
function panelWindow(role, friend) {
  const win = new BrowserWindow({
    width: 380, height: 140, frame: false, transparent: true, resizable: false, show: false, skipTaskbar: role === 'notices',
    alwaysOnTop: role === 'notices', hasShadow: false, backgroundColor: '#00000000', webPreferences: webPrefs(), ...(appIcon ? { icon: appIcon } : {}),
  });
  bootFor(win.webContents, { role, friend });
  panelWaiting.set(win, []);
  win.loadFile(path.join(WEB, 'messages.html'));
  return win;
}

// The level-up waits for the app to be in front (the notices' "focus"), as on the Mac.
function tellFocus() {
  toNotices(`focus(${!!BaseWindow.getFocusedWindow()})`);
}
app.on('browser-window-focus', tellFocus);
// Going from one of the app's windows to another blurs the first before the second has focus.
app.on('browser-window-blur', () => setImmediate(tellFocus));

function notices() {
  if (PROBE) return null;
  if (!panels.notices || panels.notices.isDestroyed()) panels.notices = panelWindow('notices');
  return panels.notices;
}

// A friend's chat, all of it on one display (by default the one it's mostly on), moved in from the edges (cut to fit
// only where the display is smaller). With several displays a chat opened where it was left on one since unplugged or
// moved, or grew past the bottom, out of sight.
function wholeOnDisplay(r, display = screen.getDisplayMatching(r)) {
  return fitInArea(r, display.workArea);
}

// The display a chat opens on, as on the Mac: the dashboard's while it's on screen, else the one in use (the pointer's).
// Opening where it was last left could put it on another display, out of sight of someone looking at the dashboard.
function chatHome() {
  if (dash && !dash.isDestroyed() && dash.isVisible() && !dash.isMinimized()) return screen.getDisplayMatching(dash.getBounds());
  return screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
}

// A display plugged in, unplugged or changed: the chats on screen come back into view, whole.
let watchingDisplays = false;
function watchDisplays() {
  if (watchingDisplays) return;
  watchingDisplays = true;
  for (const event of ['display-added', 'display-removed', 'display-metrics-changed']) {
    screen.on(event, () => {
      for (const w of panels.chats.values()) if (!w.isDestroyed() && w.isVisible()) w.setBounds(wholeOnDisplay(w.getBounds()));
    });
  }
}

function openFriendChat(friend) {
  watchDisplays();
  let win = panels.chats.get(friend);
  if (!win || win.isDestroyed()) {
    win = panelWindow('chat', friend);
    panels.chats.set(friend, win);
    win.on('closed', () => panels.chats.delete(friend));
  }
  // The conversation, loaded and in front (a panel that's already open comes forward).
  runPanel(win, `window.__messages && __messages.open(${JSON.stringify(friend)})`);
  return true;
}

function handleMessages(win, body) {
  const role = win === panels.notices ? 'notices' : 'chat';
  switch (body.type) {
    case 'ready': {
      const waiting = panelWaiting.get(win) || [];
      panelWaiting.delete(win);
      for (const js of waiting) run(win, js);
      if (role === 'notices') tellFocus();
      return true;
    }
    case 'layout': {
      // The page measures in its own pixels: at a zoom other than 100% (the dashboard's text size, which Chromium gives
      // every page of the app's), the window is that many times larger.
      const z = win.webContents.getZoomFactor() || 1;
      const w = Math.round((body.w || 0) * z), h = Math.round((body.h || 0) * z);
      if (w < 1 || h < 1) {
        win.hide();
        if (role === 'chat') win.close();
        return true;
      }
      const d = screen.getPrimaryDisplay();
      if (role === 'notices') {
        win.setIgnoreMouseEvents(body.place === 'fire', { forward: true });
        if (body.place === 'screen') {
          win.setAlwaysOnTop(true, 'screen-saver');
          win.setBounds(d.bounds);
          win.show();
          win.focus();
        } else {
          win.setAlwaysOnTop(true, 'floating');
          const a = d.workArea;
          const at = body.place === 'center' ? { x: a.x + Math.round((a.width - w) / 2), y: a.y + Math.round((a.height - h) / 2) } : { x: a.x + a.width - w - 12, y: a.y + a.height - h - 12 };
          win.setBounds(body.place === 'fire' ? a : { ...at, width: w, height: h });
          if (!win.isVisible()) win.showInactive();
        }
      } else {
        const b = win.getBounds();
        if (!win.isVisible()) {
          // Where it was left while that's on the display it opens on (give or take 40 px), else that display's middle.
          const home = chatHome(), a = home.workArea;
          const saved = settings.get('chatWindowTopLeft');
          const p = Array.isArray(saved) && saved.length === 2 && { x: saved[0] + 40, y: saved[1] + 20 };
          const left = p && p.x >= a.x - 40 && p.x < a.x + a.width + 40 && p.y >= a.y - 40 && p.y < a.y + a.height + 40;
          const [x, y] = left ? saved : [a.x + Math.round((a.width - w) / 2), a.y + Math.round((a.height - h) / 2)];
          win.setBounds(wholeOnDisplay({ x, y, width: w, height: h }, home));
          win.show();
        } else win.setBounds(wholeOnDisplay({ x: b.x, y: b.y, width: w, height: h }));
        if (body.focus) win.focus();
      }
      return true;
    }
    case 'drag': {
      const [x, y] = win.getPosition(), z = win.webContents.getZoomFactor() || 1;
      win.setPosition(Math.round(x + (body.dx || 0) * z), Math.round(y + (body.dy || 0) * z));
      return true;
    }
    case 'dragEnd':
      win.setBounds(wholeOnDisplay(win.getBounds()));
      settings.set('chatWindowTopLeft', win.getPosition());
      return true;
    case 'openUpdate':
      showDashboard();
      toDash('openUpdate()');
      return true;
    case 'openProfile':
      showDashboard();
      toDash('openProfile()');
      return true;
    case 'openNotifications':
      showDashboard();
      toDash('openView("notifications")');
      return true;
    case 'openDanger':
      showDashboard();
      toDash('openDanger()');
      return true;
    case 'endRunaway':
      return runaways.end(body.pid, body.started);
    case 'openChat':
      return openFriendChat(body.id);
    case 'showing':
      toNotices(`showing && __messages.showing(${JSON.stringify(body.id ? [body.id] : [])})`);
      return true;
    case 'log':
      console.log(`${role} page:`, body.msg);
      return true;
    default:
      return true;
  }
}

// ---------- updates: the releases repo's "windows" release (electron-updater; scripts/release.js) ----------
// A new version downloads by itself and goes in, as on the Mac, when the user has stepped away for 10 minutes (or wants
// updates right away) and the restart stops nothing: chats in the session host go on across it. One running in the app
// itself (no host) would end, so then it waits for the user's quit (or "update now").
const updates = (() => {
  let offer = null, ready = false, busy = null, checking = false, checkedAt = null, error = null;
  // How far the download has come (0…1, whole percents), as on the Mac: the page's bar and "updating 42%", so a long
  // download never looks frozen.
  let progress = null;
  // "Update now" pressed while the update was still downloading (the notice of a new version comes as its download
  // starts): it goes in the moment the download is done, as on the Mac, rather than waiting for the user to step away
  // while the page says "downloading…" with no way out.
  let whenReady = false;
  const usable = !!autoUpdater && app.isPackaged && !PROBE;
  const rightAway = () => !!settings.get('updateRightAway');
  const maybeRestart = () => {
    if (!ready || busy || terminals.list().some((t) => terminals.local(t.id))) return;
    if (rightAway() || powerMonitor.getSystemIdleTime() >= 600) install();
  };
  const install = () => {
    whenReady = false;
    busy = 'restarting…';
    pushCloud();
    setImmediate(() => autoUpdater.quitAndInstall(true, true));
  };
  if (usable) {
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.on('update-available', (i) => {
      // A newer one than an update already downloaded: that one isn't what goes in any more.
      ready = false;
      offer = { version: i.version, build: 0, notes: notesOf(i.releaseNotes) };
      pushCloud();
      toNotices(`update(${JSON.stringify({ version: i.version, build: 0 })})`);
    });
    autoUpdater.on('download-progress', (p) => {
      const f = Math.min(1, Math.floor(Number(p && p.percent) || 0) / 100);
      if (f === progress) return;
      progress = f;
      pushCloud();
    });
    autoUpdater.on('update-downloaded', () => {
      ready = true;
      progress = null;
      pushCloud();
      if (whenReady) install();
      else maybeRestart();
    });
    autoUpdater.on('error', (e) => {
      console.error('updates:', e.message);
      progress = null;
      // The installer didn't start: this version stays, the page says the update failed, and "update now" can be
      // pressed again.
      if (busy === 'restarting…') {
        busy = null;
        error = 'failed';
        pushCloud();
      }
    });
    const look = () => poll().catch(() => {});
    setTimeout(look, 10_000);
    setInterval(look, 60_000);
    // Back from sleep or the lock screen: at once, not at the next minute.
    powerMonitor.on('resume', look);
    powerMonitor.on('unlock-screen', look);
    setInterval(maybeRestart, 60_000);
  }

  // A new release shows within a minute of going out, as on the Mac (whose heartbeat asks the API every minute; it was
  // every 30 minutes here, so a release could wait half an hour to be seen): the feed's latest.yml, about 1 KB, is read
  // every minute with a time limit, and electron-updater only asked when it names a newer version than this one and the
  // one on offer, so its notice comes once.
  const feed = (() => {
    if (!usable) return null;
    try {
      const m = /^url:\s*(.+)$/m.exec(fs.readFileSync(path.join(process.resourcesPath, 'app-update.yml'), 'utf8'));
      return m ? m[1].trim().replace(/^['"]|['"]$/g, '').replace(/\/+$/, '') : null;
    } catch {
      return null;
    }
  })();
  async function feedVersion() {
    const res = await net.fetch(`${feed}/latest.yml?t=${Date.now()}`, { cache: 'no-store', signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`latest.yml: HTTP ${res.status}`);
    const m = /^version:\s*['"]?(\d[^'"\s]*)/m.exec(await res.text());
    if (!m) throw new Error('latest.yml: no version');
    return m[1];
  }
  let polling = null;
  function poll() {
    if (!feed) return Promise.resolve(null);
    if (!polling) {
      polling = feedVersion()
        .then((v) => {
          if (newerVersion(v, offer ? offer.version : app.getVersion())) askUpdater();
          return v;
        })
        .finally(() => (polling = null));
    }
    return polling;
  }
  // electron-updater's own check, which downloads what it finds. Its requests are to time out through their socket,
  // which Electron's requests don't have: one that stalls never ends, and every later check is handed that same one. So
  // one still out after two minutes is let go, and the next check starts afresh.
  let asking = null, askedAt = 0;
  function askUpdater() {
    if (asking && Date.now() - askedAt < 120_000) return;
    if (asking) autoUpdater.checkForUpdatesPromise = null;
    askedAt = Date.now();
    const p = autoUpdater
      .checkForUpdates()
      .catch(() => {})
      .finally(() => {
        if (asking === p) asking = null;
      });
    asking = p;
  }

  return {
    state: () => ({ update: offer, updateReady: ready, updating: busy, updateProgress: progress, updateError: error, updateRightAway: rightAway(), checking, checkedAt, xpPaused: false }),
    // Settings' "check for updates": answered within the feed's time limit, even with the network hanging.
    async check() {
      if (!usable) return;
      checking = true;
      pushCloud();
      try {
        await poll();
        // What electron-updater found, when it was asked, comes before "up to date" would.
        if (asking) await Promise.race([asking, new Promise((r) => setTimeout(r, 20_000))]);
      } catch {}
      checking = false;
      checkedAt = Date.now();
      pushCloud();
    },
    now() {
      if (!usable || !offer || busy) return;
      error = null;
      if (ready) return install();
      busy = 'downloading…';
      whenReady = true;
      pushCloud();
      // The download already running is the one waited for. When it fails (offline), the page says so and "update now"
      // comes back for another try, instead of "downloading…" staying for ever.
      autoUpdater.downloadUpdate().catch(() => {
        if (busy !== 'downloading…') return;
        whenReady = false;
        busy = null;
        progress = null;
        error = 'failed';
        pushCloud();
      });
    },
    setRightAway(on) {
      settings.set('updateRightAway', !!on);
      pushCloud();
      maybeRestart();
    },
  };
})();



// ---------- the pages' calls ----------
ipcMain.on('atl:boot', (e) => {
  e.returnValue = boots.get(e.sender.id) || { css: themes.css() };
});

ipcMain.handle('atl:post', async (e, name, body) => {
  body = body || {};
  const win = BrowserWindow.fromWebContents(e.sender);
  try {
    switch (name) {
      case 'radar':
        return handleRadar(body);
      case 'git':
        return await git.handle(body);
      case 'theme':
        return themes.handle(body);
      case 'messages':
        return handleMessages(win, body);
      case 'overlay':
        if (body.type === 'ready') {
          overReady = true;
          if (overPending) run(over, overPending);
          overPending = null;
          return true;
        }
        if (body.type === 'done') return hideOverlay(), true;
        if (body.type === 'newTerminal') {
          const dir = overlay.expand(String(body.dir || ''));
          hideOverlay();
          if (dir && fs.existsSync(dir)) openChatWindow({ cwd: dir, claudeArgs: null, title: path.basename(dir) });
          return true;
        }
        return await overlay.handle(body);
      case 'cloud':
        if (body.type === 'update') return updates.now(), true;
        if (body.type === 'checkUpdate') return await updates.check(), cloudState();
        if (body.type === 'updateRightAway') return updates.setRightAway(body.on), cloudState();
        if (body.type === 'openChat') return openFriendChat(body.id);
        if (body.type === 'state') return cloudState();
        return await cloud.handle(body);
      case 'chats':
        return await handleChats(body);
      case 'archive':
        return handleArchive(body);
      // Settings' token savers: their state with what rtk saved, and the switches.
      case 'savers':
        if (body.type === 'state') return await savers.state();
        if (body.type === 'set' && savers.known(body.which)) {
          await savers.set(body.which, body.on === true);
          return await savers.state();
        }
        throw new Error('unknown request');
      default:
        return null;
    }
  } catch (err) {
    console.error(`${name}:`, err);
    return { error: String((err && err.message) || err) };
  }
});

// ---------- menu and keys ----------
function buildMenu() {
  const focusedChat = () => [...chats.entries()].find(([, c]) => c.win && !c.win.isDestroyed() && c.win.isFocused());
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: 'Dosya',
      submenu: [
        { label: 'Yeni terminal…', accelerator: 'CmdOrCtrl+N', click: () => showOverlay('Overlay.newTerminal()') },
        { label: 'Kısayol çarkı', accelerator: 'CmdOrCtrl+K', click: () => showShortcuts() },
        // No key of its own: Ctrl+0 is Actual Size's (the text size, ⌘0 on the Mac), and two items on one key leave only
        // one of them working.
        { label: 'Pano', click: () => showDashboard() },
        { type: 'separator' },
        {
          label: 'Pencereyi kapat', accelerator: 'CmdOrCtrl+W',
          click: () => {
            const w = BrowserWindow.getFocusedWindow();
            if (w && w !== dash) w.close();
          },
        },
        { role: 'quit', label: 'Çıkış', accelerator: 'CmdOrCtrl+Q' },
      ],
    },
    { label: 'Düzen', submenu: [{ role: 'undo', label: 'Geri al' }, { role: 'redo', label: 'Yinele' }, { type: 'separator' }, { role: 'cut', label: 'Kes' }, { role: 'copy', label: 'Kopyala' }, { role: 'paste', label: 'Yapıştır' }, { role: 'selectAll', label: 'Tümünü seç' }] },
    {
      label: 'Görünüm',
      submenu: [
        // Its key is caught by the dashboard window itself (createDashboard): in a terminal Ctrl+B stays the shell's.
        {
          label: 'Sohbet listesi', accelerator: 'CmdOrCtrl+B', registerAccelerator: false,
          click: () => {
            showDashboard();
            toggleChats();
          },
        },
        { label: 'Panoyu yenile', accelerator: 'CmdOrCtrl+R', click: () => dashView && dashView.webContents.reload() },
        // The page that has the keys: the dashboard window's two are views, which the role doesn't reach.
        { label: 'Geliştirici araçları', accelerator: 'CmdOrCtrl+Shift+I', click: (_i, _w, wc) => wc && wc.toggleDevTools() },
        { type: 'separator' },
        { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'resetZoom' }, { type: 'separator' }, { role: 'togglefullscreen' },
      ],
    },
    { label: 'Pencere', submenu: [{ role: 'minimize', label: 'Simge durumuna küçült' }, { label: 'Bu terminali bitir', click: () => { const f = focusedChat(); if (f) endTerminal(f[0]); } }] },
  ]));
}

// ---------- start, quit ----------
let quitting = false;

app.on('second-instance', () => showDashboard());

app.whenReady().then(() => {
  if (PROBE && app.dock) app.dock.hide();
  registerVideoProtocol();
  buildMenu();
  createDashboard();
  engine.start();
  cloud.start();
  runaways.start();
  // The corner's notices can cover the screen (a level-up): never during a development check.
  if (!PROBE) notices();
  // The orbit's cinematic camera waits for minutes without input; the terminals ride the orbit as cars.
  setInterval(() => {
    toDash(`idle(${powerMonitor.getSystemIdleTime().toFixed(1)})`);
    pushTerminals();
    // A chat window opened or ended between the engine's states: the list says "in a window" or stops saying it.
    pushChats();
    pushTabs();
  }, 2000);
  // The token savers this build ships go on by themselves the first time (Settings turns them off).
  savers.autoStart();
  if (!PROBE) aiColors.autoStart();
  powerMonitor.on('resume', () => cloud.kick());
  // Chats and terminals that outlived the last launch come back hidden, as on the Mac, so a launch doesn't throw windows
  // on screen: a chat is on the orbit, a terminal a car, and a click opens its window.
  terminals.restore().then((found) => {
    for (const s of found) openChatWindow({ id: s.id, cwd: s.cwd, claude: s.claude, title: s.title, show: false });
  });
  if (PROBE) probe();
  // A fresh PC without Claude Code: offer to install it once the dashboard is up.
  else setTimeout(() => offerClaudeInstall(), 1500);
});

app.on('before-quit', (e) => {
  if (quitting) return;
  // Only chats running in the app itself stop: the session host's go on, and come back at the next launch.
  const running = [...chats.entries()].filter(([id, c]) => c.claude && terminals.local(id)).length;
  if (running && !PROBE) {
    const r = dialog.showMessageBoxSync(dash || undefined, {
      type: 'warning', buttons: ['Çık', 'Vazgeç'], defaultId: 1, cancelId: 1, noLink: true,
      message: `${running} sohbet hâlâ çalışıyor`,
      detail: 'Çıkarsan o pencerelerdeki Claude durur. Sohbetler kayıtlı kalır, sonra devam edilebilir.',
    });
    if (r !== 0) return e.preventDefault();
  }
  quitting = true;
  terminals.detachAll();
  engine.stop();
  runaways.stop();
  cloud.stop();
});

app.on('window-all-closed', () => {
  if (!quitting) app.quit();
});

// ---------- the development check (ATL_PROBE) ----------
async function probe() {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const shot = async (win, name) => {
    const wc = pageOf(win);
    if (!wc) return;
    const img = await Promise.race([wc.capturePage(), wait(5000).then(() => null)]);
    if (!img) return console.log('probe: no picture of', name);
    fs.mkdirSync(PROBE, { recursive: true });
    fs.writeFileSync(path.join(PROBE, `${name}.png`), img.toPNG());
    console.log('probe: shot', name);
  };
  await wait(9000);
  await run(dashView, "document.getElementById('boot')?.remove()");
  await shot(dashView, 'dashboard');
  await shot(chatsView, 'chats');
  for (const step of (process.env.ATL_PROBE_STEPS || '').split(';;').filter(Boolean)) {
    const [name, js] = step.split('|');
    console.log('probe: step', name);
    if (js) await Promise.race([dashView.webContents.executeJavaScript(js).catch((e) => console.log('probe step', name, e.message)), wait(3000)]);
    await wait(2500);
    await shot(dashView, name);
  }
  if (process.env.ATL_PROBE_TERMINAL) {
    const id = openChatWindow({ cwd: os.homedir(), claudeArgs: null, title: 'probe' });
    await wait(3000);
    terminals.write(id, process.platform === 'win32' ? 'echo hello from the probe\r' : 'echo hello from the probe\r');
    await wait(2000);
    await shot(chats.get(id)?.win, 'terminal');
  }
  quitting = true;
  app.quit();
}
