'use strict';
// Chats inside the main window (Windows app only): tabs over the orbit map's column — "Harita" and one per chat the
// app opened here. The chat itself is the app's own view (windows/src/main.js, embedHost) drawn over #chatpane, so this
// page only draws the tabs and says where the pane is. The Mac app never calls __chatTabs.update: nothing shows there.
(() => {
  const wrap = document.getElementById('mapwrap');
  if (!wrap) return;
  const post = (msg) => {
    try {
      return Promise.resolve(window.webkit.messageHandlers.radar.postMessage(msg));
    } catch {
      return Promise.resolve(null);
    }
  };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const bar = document.createElement('div');
  bar.id = 'chattabs';
  bar.hidden = true;
  const pane = document.createElement('div');
  pane.id = 'chatpane';
  pane.hidden = true;
  wrap.appendChild(bar);
  wrap.appendChild(pane);

  const state = { embed: false, active: null, tabs: [] };
  let lastRect = '';
  function report() {
    let rect = null;
    if (state.embed && state.active && !pane.hidden) {
      const r = pane.getBoundingClientRect();
      rect = { x: r.left, y: r.top, w: r.width, h: r.height };
    }
    const key = JSON.stringify(rect);
    if (key === lastRect || window.__platform !== 'win32') return;
    lastRect = key;
    post({ type: 'tabRect', rect });
  }
  const reportSoon = () => requestAnimationFrame(report);

  function render() {
    const show = state.embed && state.tabs.length > 0;
    bar.hidden = !show;
    wrap.classList.toggle('has-tabs', show);
    const chatOn = show && !!state.active && state.tabs.some((t) => t.id === state.active);
    pane.hidden = !chatOn;
    wrap.classList.toggle('chat-on', chatOn);
    bar.innerHTML =
      `<button type="button" class="ct-tab ct-map${chatOn ? '' : ' on'}" data-id="">Harita</button>` +
      state.tabs
        .map((t) => `<div class="ct-tab${t.id === state.active ? ' on' : ''}" data-id="${esc(t.id)}" title="${esc(t.title)}"><i class="ct-dot st-${esc(t.status)}"></i><span>${esc(t.title)}</span><button type="button" class="ct-x" title="Sekmeyi kapat (Ctrl+W) · sohbet arka planda sürer">×</button></div>`)
        .join('');
    reportSoon();
  }

  bar.addEventListener('click', (e) => {
    const tab = e.target.closest('.ct-tab');
    if (!tab) return;
    const id = tab.dataset.id || null;
    if (e.target.closest('.ct-x')) post({ type: 'tabClose', id });
    else post({ type: 'tabSelect', id });
  });
  bar.addEventListener('auxclick', (e) => {
    const tab = e.target.closest('.ct-tab');
    if (e.button === 1 && tab && tab.dataset.id) post({ type: 'tabClose', id: tab.dataset.id });
  });
  bar.addEventListener('contextmenu', (e) => {
    const tab = e.target.closest('.ct-tab');
    if (!tab || !tab.dataset.id) return;
    e.preventDefault();
    post({ type: 'tabMenu', id: tab.dataset.id, at: { x: e.clientX, y: e.clientY } });
  });
  // Ctrl+Tab while the page has the keys (the chat's view catches its own in the app).
  addEventListener('keydown', (e) => {
    if (e.ctrlKey && !e.altKey && e.key === 'Tab' && state.embed && state.tabs.length) {
      e.preventDefault();
      post({ type: 'tabCycle', dir: e.shiftKey ? -1 : 1 });
    }
  });
  addEventListener('resize', reportSoon);
  if (window.ResizeObserver) new ResizeObserver(reportSoon).observe(pane);

  window.__chatTabs = {
    state,
    update(s) {
      const before = state.active;
      state.embed = !!(s && s.embed);
      state.active = (s && s.active) || null;
      state.tabs = Array.isArray(s && s.tabs) ? s.tabs : [];
      // The prompts gallery's "send to the chat" goes to the tab in front (DT.sendPrompt).
      if (state.active !== before && state.active && window.DT && window.DT.focusChat) {
        const t = state.tabs.find((x) => x.id === state.active);
        window.DT.focusChat(t && t.sid);
      }
      render();
      document.dispatchEvent(new Event('chattabs'));
    },
    setEmbed(on) {
      return post({ type: 'embedChats', on: !!on });
    },
  };
  // Only the Windows app has the tabs: the Mac's handler isn't asked about them.
  if (window.__platform === 'win32') post({ type: 'tabsReady' });
})();
