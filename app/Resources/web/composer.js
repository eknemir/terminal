'use strict';
// The chat composer under the centre column and the minimal layout. A modern chat input: write here, it goes to the
// chat tab in front (or one picked in the target chip, or a new chat). Minimal mode (default) hides the dense stats
// (#bottom panels, top-bar KPIs, ticker); Settings · Görünüm · "Detaylı görünüm" brings them back ('ui.detailed').
(() => {
  const bottom = document.getElementById('bottom');
  if (!bottom) return;
  const root = document.documentElement;
  const HKEY = 'composer.history', DKEY = 'ui.detailed', MAX = 50;
  const ls = {
    get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
  };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const post = (msg) => {
    try { return Promise.resolve(window.webkit.messageHandlers.radar.postMessage(msg)); } catch { return Promise.resolve(null); }
  };

  // ---------- minimal / detailed ----------
  const isDetailed = () => ls.get(DKEY) === '1';
  function applyMode() {
    root.classList.toggle('dt-minimal', !isDetailed());
    root.classList.toggle('dt-detailed', isDetailed());
  }
  applyMode();

  // ---------- markup ----------
  const box = document.createElement('section');
  box.id = 'composer';
  box.innerHTML =
    `<div class="cmp-card">` +
    `<textarea class="cmp-input" rows="1" placeholder="Sohbete yaz… (Enter gönder · Shift+Enter yeni satır · ↑ önceki)" aria-label="Sohbete mesaj"></textarea>` +
    `<div class="cmp-row">` +
    `<div class="cmp-target"><button type="button" class="cmp-chip cmp-tgt" aria-haspopup="listbox" title="Mesajın gideceği sohbet"><i class="cmp-dot"></i><span>Son sohbet</span><b>▾</b></button><div class="cmp-menu" role="listbox" hidden></div></div>` +
    `<button type="button" class="cmp-chip cmp-notes" title="Seçili videonun revizyon notlarını ekle">Video notları</button>` +
    `<button type="button" class="cmp-chip cmp-frame" title="Son alınan karenin yolunu ekle">Kare</button>` +
    `<button type="button" class="cmp-chip cmp-fx" title="Efektler galerisini aç">Efekt</button>` +
    `<span class="cmp-status" aria-live="polite"></span>` +
    `<button type="button" class="cmp-chip cmp-model" title="Yeni sohbetlerin modeli · Ayarlar"></button>` +
    `<button type="button" class="cmp-send" title="Gönder (Enter)" disabled><svg viewBox="0 0 16 16"><path d="M8 13V3M3.5 7.5 8 3l4.5 4.5"/></svg></button>` +
    `</div></div>`;
  bottom.insertBefore(box, bottom.firstChild);
  const q = (s) => box.querySelector(s);
  const input = q('.cmp-input'), send = q('.cmp-send'), tgt = q('.cmp-tgt'), menu = q('.cmp-menu'), status = q('.cmp-status'), model = q('.cmp-model');

  // ---------- target ----------
  let target = 'auto'; // 'auto' | 'new' | tab id
  const tabs = () => (window.__chatTabs && Array.isArray(window.__chatTabs.state.tabs) ? window.__chatTabs.state.tabs : []);
  const activeTab = () => { const s = window.__chatTabs && window.__chatTabs.state; return s && s.active ? tabs().find((t) => t.id === s.active) : null; };
  const waiting = (t) => /wait/.test(String(t.status || ''));
  function resolved() {
    if (target === 'new') return { kind: 'new', label: 'Yeni sohbet' };
    const t = target !== 'auto' && tabs().find((x) => x.id === target);
    if (t) return { kind: 'tab', tab: t, label: t.title || 'Sohbet' };
    if (target !== 'auto') target = 'auto';
    const a = activeTab();
    return a ? { kind: 'tab', tab: a, label: a.title || 'Sohbet', auto: true } : { kind: 'auto', label: 'Son sohbet' };
  }
  function paintTarget() {
    const r = resolved();
    tgt.querySelector('span').textContent = r.label;
    tgt.querySelector('.cmp-dot').className = 'cmp-dot' + (r.tab ? ' st-' + r.tab.status : r.kind === 'new' ? ' new' : '');
    const n = tabs().filter(waiting).length;
    tgt.classList.toggle('has-wait', n > 0);
    tgt.title = n ? `Mesajın gideceği sohbet · ${n} sohbet seni bekliyor` : 'Mesajın gideceği sohbet';
  }
  function openMenu() {
    const r = resolved();
    const items = [`<button type="button" class="cmp-opt${target === 'auto' ? ' on' : ''}" data-v="auto">Öndeki / son sohbet</button>`]
      .concat(tabs().map((t) => `<button type="button" class="cmp-opt${r.tab && r.tab.id === t.id && target !== 'auto' ? ' on' : ''}" data-v="${esc(t.id)}"><i class="cmp-dot st-${esc(t.status)}"></i>${esc(t.title)}${waiting(t) ? '<em>seni bekliyor</em>' : ''}</button>`))
      .concat([`<button type="button" class="cmp-opt cmp-new${target === 'new' ? ' on' : ''}" data-v="new">+ Yeni sohbet (klasör seç)</button>`]);
    menu.innerHTML = items.join('');
    menu.hidden = false;
  }
  const closeMenu = () => { menu.hidden = true; };
  tgt.addEventListener('click', (e) => { e.stopPropagation(); if (menu.hidden) openMenu(); else closeMenu(); });
  menu.addEventListener('click', (e) => {
    const o = e.target.closest('.cmp-opt');
    if (!o) return;
    target = o.dataset.v;
    closeMenu();
    paintTarget();
    input.focus();
  });
  document.addEventListener('click', (e) => { if (!box.contains(e.target)) closeMenu(); });
  document.addEventListener('chattabs', paintTarget);

  // ---------- model chip ----------
  function paintModel() {
    const M = window.ChatModel;
    model.hidden = !M;
    if (M) model.textContent = M.LABELS[M.get()] || M.get();
  }
  window.addEventListener('chatmodel', paintModel);
  model.addEventListener('click', () => { const s = document.getElementById('settings'); if (s) s.click(); });
  paintModel();

  // ---------- status ----------
  let stTimer = null;
  function say(text, bad) {
    status.textContent = text;
    status.classList.toggle('bad', !!bad);
    clearTimeout(stTimer);
    stTimer = setTimeout(() => { status.textContent = ''; }, 4000);
  }

  // ---------- input ----------
  function grow() {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight || 0, 200) + 'px';
    send.disabled = !input.value.trim();
  }
  function insert(text) {
    const v = input.value;
    const s = typeof input.selectionStart === 'number' ? input.selectionStart : v.length;
    const e = typeof input.selectionEnd === 'number' ? input.selectionEnd : v.length;
    const pre = v.slice(0, s), sep = pre && !/\n$/.test(pre) ? '\n' : '';
    input.value = pre + sep + text + v.slice(e);
    const at = (pre + sep + text).length;
    input.selectionStart = input.selectionEnd = at;
    grow();
    input.focus();
  }
  input.addEventListener('input', grow);

  // ---------- history ----------
  const loadHist = () => { try { const a = JSON.parse(ls.get(HKEY) || '[]'); return Array.isArray(a) ? a.filter((x) => typeof x === 'string') : []; } catch { return []; } };
  let hist = loadHist(), hIdx = -1, draft = '';
  function remember(text) {
    hist = hist.filter((x) => x !== text);
    hist.unshift(text);
    hist = hist.slice(0, MAX);
    ls.set(HKEY, JSON.stringify(hist));
    hIdx = -1;
  }
  function recall(dir) {
    if (!hist.length) return false;
    if (hIdx === -1) draft = input.value;
    const n = Math.max(-1, Math.min(hist.length - 1, hIdx + dir));
    if (n === hIdx) return false;
    hIdx = n;
    input.value = n === -1 ? draft : hist[n];
    grow();
    return true;
  }

  // ---------- send ----------
  function submit() {
    const text = input.value.trim();
    if (!text) return Promise.resolve(null);
    const r = resolved();
    const DT = window.DT;
    if (!DT || typeof DT.sendPrompt !== 'function') { say('Sohbet bağlantısı yok', true); return Promise.resolve(null); }
    let p;
    if (r.kind === 'new') p = Promise.resolve().then(() => DT.newChatWithPrompt(text));
    else {
      if (r.kind === 'tab') {
        if (!r.auto) post({ type: 'tabSelect', id: r.tab.id });
        if (DT.focusChat) DT.focusChat(r.tab.sid);
      }
      p = Promise.resolve().then(() => DT.sendPrompt(text, { submit: true }));
    }
    remember(text);
    input.value = '';
    grow();
    return p.then(
      (res) => {
        if (res && res.ok === false) say('Gönderilemedi' + (res.reason ? ' · ' + res.reason : ''), true);
        else say('gönderildi → ' + r.label);
        return res;
      },
      () => { say('Gönderilemedi', true); return null; },
    );
  }
  send.addEventListener('click', submit);
  input.addEventListener('keydown', (e) => {
    if (e.isComposing) return;
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); return; }
    if (e.key === 'Escape') { closeMenu(); return; }
    const caretTop = !input.value.slice(0, input.selectionStart || 0).includes('\n');
    const caretEnd = !input.value.slice(input.selectionEnd || 0).includes('\n');
    if (e.key === 'ArrowUp' && caretTop && recall(1)) e.preventDefault();
    else if (e.key === 'ArrowDown' && caretEnd && hIdx !== -1 && recall(-1)) e.preventDefault();
    e.stopPropagation(); // the page's own shortcuts stay out while typing
  });

  // ---------- attachments ----------
  q('.cmp-notes').addEventListener('click', () => {
    const V = window.DTVideo;
    const cur = V && V.current && V.current();
    if (!cur) return say('Önizlemede seçili video yok', true);
    let notes = [];
    try { const a = JSON.parse(ls.get(cur.notesKey) || '[]'); if (Array.isArray(a)) notes = a; } catch {}
    if (!notes.length) return say('Bu videoda not yok', true);
    insert(V.buildRevisionPrompt(cur.path, notes));
  });
  q('.cmp-frame').addEventListener('click', () => {
    const V = window.DTVideo;
    const f = V && V.lastFrame;
    if (!f || !f.path) return say('Henüz kare alınmadı (Önizleme · Kare al)', true);
    insert(`Bu karede (${V.fmtStamp ? V.fmtStamp(f.t) : f.t}) şunu değiştir: \n${f.path}`);
  });
  q('.cmp-fx').addEventListener('click', () => {
    const t = document.querySelector('.st-tab[data-tab="presets"]');
    if (t) t.click();
  });

  paintTarget();
  grow();

  window.DTComposer = {
    el: box,
    submit,
    insert,
    isDetailed,
    setDetailed(on) { ls.set(DKEY, on ? '1' : '0'); applyMode(); },
    get target() { return target; },
    set target(v) { target = v || 'auto'; paintTarget(); },
  };
})();
