'use strict';
// The name the app shows (window titles, the top bar's brand, the boot screen). The user sets it in Settings ·
// "Uygulama adı"; it's kept in localStorage like the page's other settings and applied live to every open page.
(() => {
  const KEY = 'app.name', DEFAULT = 'Derin Terminal';
  const get = () => {
    try { return (localStorage.getItem(KEY) || '').trim() || DEFAULT; } catch { return DEFAULT; }
  };
  // Pages that build document.title themselves call AppName.title(prefix); others get the bare name.
  const title = (prefix) => (prefix ? `${prefix} · ${get()}` : get());
  function apply() {
    const n = get();
    document.querySelectorAll('[data-appname]').forEach((el) => { el.textContent = el.dataset.appname === 'upper' ? n.toUpperCase() : n; });
    const sfx = document.documentElement.dataset.titleSuffix;
    if (document.documentElement.dataset.appTitle !== 'own') document.title = sfx ? `${n} · ${sfx}` : n;
    // The Mac sets its main window's title in Swift; tell it (Electron follows document.title by itself).
    try { window.webkit.messageHandlers.radar.postMessage({ type: 'appName', name: n }); } catch {}
    window.dispatchEvent(new CustomEvent('appname', { detail: n }));
  }
  function set(name) {
    try {
      const v = String(name || '').trim();
      v && v !== DEFAULT ? localStorage.setItem(KEY, v) : localStorage.removeItem(KEY);
    } catch {}
    apply();
  }
  // Another window changed it.
  window.addEventListener('storage', (e) => { if (e.key === KEY) apply(); });
  window.AppName = { get, set, title, apply, DEFAULT };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply); else apply();
})();

// The Claude model new chats start with (Settings · "Claude modeli"): haiku / sonnet / opus, or "default" (no model
// given, Claude's own choice). Kept in localStorage "chat.model"; the app is told on every page load and change, and
// gives it to new chats' shells as ANTHROPIC_MODEL (a `--model` typed by hand still wins; resumed chats keep theirs).
(() => {
  const KEY = 'chat.model', DEFAULT = 'haiku', ALL = ['haiku', 'sonnet', 'opus', 'default'];
  const LABELS = { haiku: 'Haiku', sonnet: 'Sonnet', opus: 'Opus', default: 'Varsayılan' };
  const get = () => {
    try { const v = localStorage.getItem(KEY); return ALL.includes(v) ? v : DEFAULT; } catch { return DEFAULT; }
  };
  const tell = () => { try { window.webkit.messageHandlers.radar.postMessage({ type: 'chatModel', model: get() }); } catch {} };
  function set(m) {
    try { localStorage.setItem(KEY, ALL.includes(m) ? m : DEFAULT); } catch {}
    tell();
    window.dispatchEvent(new CustomEvent('chatmodel', { detail: get() }));
  }
  window.addEventListener('storage', (e) => { if (e.key === KEY) { tell(); window.dispatchEvent(new CustomEvent('chatmodel', { detail: get() })); } });
  window.ChatModel = { get, set, ALL, LABELS, DEFAULT };
  tell();
})();
