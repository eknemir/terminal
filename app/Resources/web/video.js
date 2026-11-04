/* DT Video previewer — vertical (9:16) render previewer for #video-mount */
(function () {
  'use strict';

  // ---------- pure helpers ----------
  function formatTime(s) {
    s = Number(s);
    if (!isFinite(s) || s < 0) s = 0;
    s = Math.floor(s);
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    return h > 0 ? h + ':' + pad(m) + ':' + pad(sec) : m + ':' + pad(sec);
  }
  function toMs(t) { return typeof t === 'number' ? t : (t ? new Date(t).getTime() : 0); }
  function relTime(mtime, now) {
    now = now == null ? Date.now() : now;
    var d = Math.max(0, Math.floor((now - toMs(mtime)) / 1000));
    if (d < 60) return 'az önce';
    var m = Math.floor(d / 60);
    if (m < 60) return m + ' dk önce';
    var h = Math.floor(m / 60);
    if (h < 24) return h + ' sa önce';
    var g = Math.floor(h / 24);
    if (g < 7) return g + ' gün önce';
    if (g < 30) return Math.floor(g / 7) + ' hf önce';
    if (g < 365) return Math.floor(g / 30) + ' ay önce';
    return Math.floor(g / 365) + ' yıl önce';
  }
  function isNew(mtime, now) {
    now = now == null ? Date.now() : now;
    var diff = now - toMs(mtime);
    return diff >= -60000 && diff < 5 * 60 * 1000;
  }
  function sortVideos(list) {
    return (list || []).slice().sort(function (a, b) { return toMs(b.mtime) - toMs(a.mtime); });
  }
  function baseName(p) { return String(p || '').replace(/[\\/]+$/, '').split(/[\\/]/).pop() || String(p || ''); }

  // m:ss.s (h:mm:ss.s past an hour)
  function fmtStamp(t) {
    t = Number(t);
    if (!isFinite(t) || t < 0) t = 0;
    var d = Math.round(t * 10);
    var tenths = d % 10, s = Math.floor(d / 10);
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    return (h > 0 ? h + ':' + pad(m) : String(m)) + ':' + pad(sec) + '.' + tenths;
  }
  function frameOf(t, fps) {
    fps = Number(fps) > 0 ? Number(fps) : 30;
    t = Number(t);
    return Math.max(0, Math.round((isFinite(t) ? t : 0) * fps));
  }
  function sortNotes(notes) {
    return (notes || []).slice().sort(function (a, b) { return (a.t || 0) - (b.t || 0); });
  }
  // notes: [{t, end?, text, fps?}] — fps omitted/unknown → 30 with "~"
  function noteLabel(n) {
    var known = Number(n.fps) > 0, pre = known ? '' : '~';
    var s = fmtStamp(n.t), f = 'kare ' + pre + frameOf(n.t, n.fps);
    if (n.end != null && n.end > n.t) {
      s += '–' + fmtStamp(n.end);
      f = 'kare ' + pre + frameOf(n.t, n.fps) + '–' + pre + frameOf(n.end, n.fps);
    }
    return s + ' (' + f + ')';
  }
  function buildRevisionPrompt(path, notes) {
    var lines = ['Şu videoda revizyonlar: ' + String(path || '')];
    sortNotes(notes).forEach(function (n) {
      var txt = String(n.text || '').replace(/\s*\n\s*/g, ' ').trim();
      lines.push('- ' + noteLabel(n) + ': ' + txt);
    });
    lines.push('Her zaman damgasındaki değişikliği yap, sonra yeniden render al.');
    return lines.join('\n');
  }

  // ---------- groups (mirror of windows/src/video-core.js) ----------
  var GROUPS = ['final', 'onizleme', 'videolar', 'klasor'];
  var GROUP_LABEL = { final: 'Final', onizleme: 'Önizleme', videolar: 'Videolar', klasor: 'Klasör' };
  function normSeg(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
  function classifyVideoPath(root, p) {
    var r = String(root || '').split(/[\\/]+/).filter(Boolean), f = String(p || '').split(/[\\/]+/).filter(Boolean);
    if (!r.length || f.length <= r.length) return null;
    for (var i = 0; i < r.length; i++) if (normSeg(r[i]) !== normSeg(f[i])) return null;
    if (!/\.(mp4|mov|webm|m4v)$/i.test(f[f.length - 1])) return null;
    var dirs = f.slice(r.length, -1).map(normSeg), self = normSeg(r[r.length - 1]);
    var selfG = self === 'render' ? 'final' : self === 'onizleme' ? 'onizleme' : self === 'videolar' ? 'videolar' : null;
    if (selfG) return dirs.length <= 3 ? selfG : null;
    if (dirs[0] === 'render' && dirs.length <= 4) return 'final';
    if (dirs[0] === 'videolar' && dirs.length <= 4) return 'videolar';
    if (dirs[0] === 'assets' && dirs[1] === 'onizleme' && dirs.length <= 5) return 'onizleme';
    return dirs.length ? null : 'klasor';
  }
  // "Tümü": Final first, then newest
  function sortForAll(list) {
    return sortVideos(list).sort(function (a, b) {
      return (a.group === 'final' ? 0 : 1) - (b.group === 'final' ? 0 : 1) || toMs(b.mtime) - toMs(a.mtime);
    });
  }
  function countGroups(list) {
    var c = { all: 0, final: 0, onizleme: 0, videolar: 0, klasor: 0 };
    (list || []).forEach(function (v) { c.all++; if (c[v.group] != null) c[v.group]++; });
    return c;
  }
  function filterVideos(list, f) {
    return !f || f === 'all' ? sortForAll(list) : sortVideos((list || []).filter(function (v) { return v.group === f; }));
  }

  // ---------- extension point: player toolbar actions ----------
  // Another file (loaded before or after video.js) can add buttons to the player toolbar:
  //   window.DTVideo.registerAction({
  //     id: 'teslim',               // unique; registering the same id again replaces the action
  //     label: 'Teslim paketi',     // button text (also the tooltip unless `title` is given)
  //     icon: '📦',                 // optional, shown before the label
  //     title: '…',                 // optional tooltip
  //     groups: ['final'],          // optional: only shown when the selected video is in one of these groups
  //     run: function (v) { … }     // called on click; v = { path, name, url, group, fps, currentTime, duration, element }
  //   });                           // v is null when no video is selected (button is disabled then)
  // Returns an unregister function. If video.js isn't loaded yet, push the same object onto
  // window.DTVideoActions = window.DTVideoActions || [] — they are picked up at load time.
  // run() may return a Promise; the button shows busy until it settles, a rejection is shown as a toast.
  var actions = [], actionListeners = [];
  function registerAction(a) {
    if (!a || !a.id || typeof a.run !== 'function') throw new Error('registerAction: {id, label, run} gerekli');
    actions = actions.filter(function (x) { return x.id !== a.id; }).concat([a]);
    actionListeners.forEach(function (f) { try { f(); } catch (e) {} });
    return function () {
      actions = actions.filter(function (x) { return x !== a; });
      actionListeners.forEach(function (f) { try { f(); } catch (e) {} });
    };
  }
  // New renders worth announcing: finished (not writing) Final/Önizleme files not seen before
  function newRenders(prev, next) {
    var seen = {};
    var k = function (v) { return v.path + '|' + toMs(v.mtime); }; // same name re-rendered counts as new
    (prev || []).forEach(function (v) { if (!v.writing) seen[k(v)] = true; });
    return (next || []).filter(function (v) { return !v.writing && !seen[k(v)] && (v.group === 'final' || v.group === 'onizleme'); });
  }

  window.DTVideo = { registerAction: registerAction, newRenders: newRenders, formatTime: formatTime, relTime: relTime, isNew: isNew, sortVideos: sortVideos, baseName: baseName,
    fmtStamp: fmtStamp, frameOf: frameOf, sortNotes: sortNotes, noteLabel: noteLabel, buildRevisionPrompt: buildRevisionPrompt,
    classifyVideoPath: classifyVideoPath, sortForAll: sortForAll, countGroups: countGroups, filterVideos: filterVideos, GROUP_LABEL: GROUP_LABEL };
  (Array.isArray(window.DTVideoActions) ? window.DTVideoActions : []).forEach(function (a) { try { registerAction(a); } catch (e) {} });
  window.DTVideoActions = { push: function (a) { try { registerAction(a); } catch (e) {} } };

  // ---------- bridge ----------
  function api(msg) {
    try {
      var h = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.radar;
      if (!h) return Promise.resolve(null);
      return Promise.resolve(h.postMessage(msg)).catch(function () { return null; });
    } catch (e) { return Promise.resolve(null); }
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  // ---------- UI ----------
  function mount(root) {
    var state = { dir: null, all: [], list: [], filter: 'all', sel: null, newestPath: null, first: true };
    try { state.filter = localStorage.getItem('video.filter') || 'all'; } catch (e) {}
    try { state.dir = localStorage.getItem('video.dir') || null; } catch (e) {}

    var wrap = el('div', 'dtv');
    wrap.tabIndex = 0;

    // top bar
    var top = el('div', 'dtv-top');
    var chip = el('button', 'dtv-chip');
    chip.title = 'Klasör';
    chip.appendChild(el('i', 'dtv-dot'));
    var chipName = el('span', null, 'Klasör seç');
    chip.appendChild(chipName);
    var refresh = el('button', 'dtv-btn', '⟳');
    refresh.title = 'Yenile';
    var menu = el('div', 'dtv-menu');
    top.appendChild(chip); top.appendChild(refresh); top.appendChild(menu);

    // group filter chips
    var seg = el('div', 'dtv-seg');
    var segBtns = {};
    [['final', 'Final'], ['onizleme', 'Önizleme'], ['videolar', 'Videolar'], ['all', 'Tümü']].forEach(function (g) {
      var b = el('button', 'dtv-segb');
      b._label = g[1];
      b.onclick = function () {
        state.filter = g[0];
        try { localStorage.setItem('video.filter', g[0]); } catch (e) {}
        applyFilter();
      };
      segBtns[g[0]] = b;
      seg.appendChild(b);
    });
    top.appendChild(seg);
    var bNotify = el('button', 'dtv-btn dtv-bell', '🔔');
    var notifyOn = true;
    try { notifyOn = localStorage.getItem('video.notify') !== '0'; } catch (e) {}
    function syncBell() {
      bNotify.classList.toggle('on', notifyOn);
      bNotify.textContent = notifyOn ? '🔔' : '🔕';
      bNotify.title = 'Render bildirimi: ' + (notifyOn ? 'açık' : 'kapalı') + ' (yeni Final/Önizleme dosyası gelince bildir, ses çal, aç)';
    }
    bNotify.onclick = function () {
      notifyOn = !notifyOn; syncBell();
      try { localStorage.setItem('video.notify', notifyOn ? '1' : '0'); } catch (e) {}
    };
    syncBell();
    top.appendChild(bNotify);

    // stage
    var stage = el('div', 'dtv-stage');
    var frame = el('div', 'dtv-frame');
    var video = document.createElement('video');
    video.playsInline = true;
    video.preload = 'metadata';
    var safe = el('div', 'dtv-safe');
    ['t', 'b', 'r'].forEach(function (c) { safe.appendChild(el('i', c)); });
    var empty = el('div', 'dtv-empty', 'Henüz video yok — bir klasör seç');
    frame.appendChild(video); frame.appendChild(safe); frame.appendChild(empty);

    var ctrl = el('div', 'dtv-ctrl');
    var scrub = document.createElement('input');
    scrub.type = 'range'; scrub.min = 0; scrub.max = 1000; scrub.value = 0; scrub.className = 'dtv-scrub';
    var bPlay = el('button', 'dtv-btn', '▶');
    var time = el('span', 'dtv-time', '0:00 / 0:00');
    var bLoop = el('button', 'dtv-btn on', '↻ Döngü');
    var bMute = el('button', 'dtv-btn', '🔊');
    var bSpeed = el('button', 'dtv-btn', '1×');
    var bSafe = el('button', 'dtv-btn', 'Güvenli alan');
    var bReveal = el('button', 'dtv-btn', 'Klasörde göster');
    bPlay.title = 'Oynat / duraklat (Boşluk)';
    bSafe.title = 'Instagram Reels güvenli alanı';
    var scrubWrap = el('div', 'dtv-scrubwrap');
    var marks = el('div', 'dtv-marks');
    scrubWrap.appendChild(scrub); scrubWrap.appendChild(marks);
    [scrubWrap, bPlay, time, bLoop, bMute, bSpeed, bSafe, bReveal].forEach(function (x) { ctrl.appendChild(x); });

    // ----- revision notes -----
    var notesBox = el('div', 'dtv-notes');
    var nBar = el('div', 'dtv-nbar');
    var bNote = el('button', 'dtv-btn acc', '+ Not ekle');
    bNote.title = 'Bu ana not ekle (N)';
    var bRange = el('button', 'dtv-btn', 'Aralık');
    bRange.title = 'Aralık başlat / bitir (oynarken S basılı tut)';
    var bStamp = el('button', 'dtv-btn', '⏱ zamanı kopyala');
    nBar.appendChild(bNote); nBar.appendChild(bRange); nBar.appendChild(bStamp);
    var nInput = el('div', 'dtv-ninput');
    var nStamp = el('span', 'dtv-nstamp');
    var nText = document.createElement('input');
    nText.type = 'text'; nText.placeholder = 'Ne değişsin? (Enter kaydet, Esc vazgeç)';
    nInput.appendChild(nStamp); nInput.appendChild(nText);
    var nList = el('div', 'dtv-nlist');
    var nFoot = el('div', 'dtv-nfoot');
    var bSend = el('button', 'dtv-btn on', "Claude'a gönder");
    var bCopy = el('button', 'dtv-btn', 'Kopyala');
    var waitLbl = el('label', 'dtv-wait');
    var waitCb = document.createElement('input'); waitCb.type = 'checkbox';
    waitLbl.appendChild(waitCb); waitLbl.appendChild(document.createTextNode(' Göndermeden önce bekle'));
    var bClear = el('button', 'dtv-btn danger', 'Tümünü sil');
    [bSend, bCopy, waitLbl, bClear].forEach(function (x) { nFoot.appendChild(x); });
    [nBar, nInput, nList, nFoot].forEach(function (x) { notesBox.appendChild(x); });

    // ----- tools row: compare, frame grab, registered actions -----
    var tools = el('div', 'dtv-tools');
    var bCmp = el('button', 'dtv-btn', '⇆ Karşılaştır');
    bCmp.title = 'İkinci bir videoyla yan yana / perde karşılaştır';
    var bCmpMode = el('button', 'dtv-btn', 'Yan yana');
    bCmpMode.title = 'Yan yana ↔ perde (wipe)';
    bCmpMode.style.display = 'none';
    var bGrab = el('button', 'dtv-btn', '📷 Kare al');
    bGrab.title = 'Bu kareyi PNG kaydet (F)';
    var actBox = el('span', 'dtv-acts');
    var cmpMenu = el('div', 'dtv-menu dtv-cmpmenu');
    [bCmp, bCmpMode, bGrab, actBox, cmpMenu].forEach(function (x) { tools.appendChild(x); });

    // ----- QC strip -----
    var qcBox = el('div', 'dtv-qc');

    // ----- frame-grab result bar -----
    var grabBar = el('div', 'dtv-grab');

    // ----- compare layer -----
    var video2 = document.createElement('video');
    video2.className = 'dtv-v2';
    video2.playsInline = true; video2.muted = true; video2.preload = 'auto'; video2.loop = true;
    var wipe = document.createElement('input');
    wipe.type = 'range'; wipe.min = 0; wipe.max = 100; wipe.value = 50; wipe.className = 'dtv-wipe';
    var wipeLine = el('i', 'dtv-wipeline');
    var cmpLbl = el('div', 'dtv-cmplbl');
    frame.insertBefore(video2, safe);
    frame.appendChild(wipeLine); frame.appendChild(wipe); frame.appendChild(cmpLbl);

    stage.appendChild(frame); stage.appendChild(ctrl); stage.appendChild(tools); stage.appendChild(qcBox); stage.appendChild(grabBar); stage.appendChild(notesBox);

    var list = el('div', 'dtv-list');
    var toast = el('div', 'dtv-toast');

    wrap.appendChild(top); wrap.appendChild(stage); wrap.appendChild(list); wrap.appendChild(toast);
    root.innerHTML = '';
    root.appendChild(wrap);

    video.loop = true;

    // ----- player -----
    function syncTime() {
      var d = video.duration || 0, c = video.currentTime || 0;
      time.textContent = formatTime(c) + ' / ' + formatTime(d);
      var p = d ? (c / d) : 0;
      if (!scrub._drag) scrub.value = Math.round(p * 1000);
      scrub.style.setProperty('--p', (p * 100).toFixed(2) + '%');
    }
    function syncPlay() { bPlay.textContent = video.paused ? '▶' : '❚❚'; }
    video.addEventListener('timeupdate', syncTime);
    video.addEventListener('loadedmetadata', function () { syncTime(); renderMarks(); });
    video.addEventListener('play', syncPlay);
    video.addEventListener('pause', syncPlay);
    video.addEventListener('click', togglePlay);

    function togglePlay() {
      if (!video.src) return;
      if (video.paused) { var p = video.play(); if (p && p.catch) p.catch(function () {}); } else video.pause();
    }
    bPlay.onclick = togglePlay;
    scrub.addEventListener('input', function () {
      scrub._drag = true;
      if (video.duration) video.currentTime = (scrub.value / 1000) * video.duration;
      syncTime();
    });
    scrub.addEventListener('change', function () { scrub._drag = false; });
    bLoop.onclick = function () { video.loop = !video.loop; bLoop.classList.toggle('on', video.loop); };
    bMute.onclick = function () { video.muted = !video.muted; bMute.textContent = video.muted ? '🔇' : '🔊'; bMute.classList.toggle('on', video.muted); };
    var speeds = [0.5, 1, 1.5, 2];
    bSpeed.onclick = function () {
      var i = (speeds.indexOf(video.playbackRate) + 1) % speeds.length;
      video.playbackRate = speeds[i];
      bSpeed.textContent = speeds[i] + '×';
    };
    bSafe.onclick = function () { var on = !safe.classList.contains('on'); safe.classList.toggle('on', on); bSafe.classList.toggle('on', on); };
    bReveal.onclick = function () { if (state.sel) api({ type: 'videoReveal', path: state.sel.path }); };

    function select(v, autoplay) {
      var changed = (state.sel && state.sel.path) !== (v && v.path);
      state.sel = v;
      if (changed) { closeInput(); rangeStart = null; bRange.classList.remove('on'); bRange.textContent = 'Aralık'; renderNotes(); }
      Array.prototype.forEach.call(list.children, function (c) { c.classList.toggle('sel', !!v && c._path === v.path); });
      if (changed) { hideGrab(); if (cmp && v && cmp.path === v.path) stopCompare(); runQC(v); renderActions(); }
      if (!v) { video.removeAttribute('src'); video.load(); syncTime(); syncPlay(); return; }
      if (video.getAttribute('src') !== v.url) {
        var rate = video.playbackRate;
        video.src = v.url;
        video.playbackRate = rate;
      }
      if (autoplay) { var p = video.play(); if (p && p.catch) p.catch(function () {}); }
    }

    // ----- list -----
    function applyFilter() {
      state.list = filterVideos(state.all, state.filter);
      renderList();
    }
    function renderList() {
      var c = countGroups(state.all);
      Object.keys(segBtns).forEach(function (k) {
        segBtns[k].textContent = segBtns[k]._label + ' ' + c[k];
        segBtns[k].classList.toggle('on', state.filter === k);
      });
      list.innerHTML = '';
      empty.style.display = state.list.length ? 'none' : 'flex';
      empty.textContent = !state.dir ? 'Henüz video yok — bir klasör seç'
        : state.all.length && !state.list.length ? 'Bu grupta video yok'
        : 'Render\\, Assets\\Onizleme\\ ya da Videolar\\ klasörü bulunamadı';
      state.list.forEach(function (v) {
        var it = el('div', 'dtv-item' + (v.writing ? ' writing' : ''));
        it._path = v.path;
        it.title = v.name;
        if (v.group && GROUP_LABEL[v.group]) it.appendChild(el('span', 'dtv-grp g-' + v.group, GROUP_LABEL[v.group]));
        if (v.writing) it.appendChild(el('span', 'dtv-wr', 'render ediliyor…'));
        var th = document.createElement('video');
        th.muted = true; th.preload = 'metadata'; th.playsInline = true;
        th.src = v.url + (String(v.url).indexOf('#') < 0 ? '#t=0.1' : '');
        th.addEventListener('loadedmetadata', function () { try { th.currentTime = 0.1; } catch (e) {} }, { once: true });
        it.appendChild(th);
        if (isNew(v.mtime)) it.appendChild(el('span', 'dtv-new', 'YENİ'));
        it.appendChild(el('div', 'n', v.name));
        var m = el('div', 'm', relTime(v.mtime));
        m._mtime = v.mtime;
        it.appendChild(m);
        if (state.sel && state.sel.path === v.path) it.classList.add('sel');
        it.onclick = function () { select(v, !v.writing); wrap.focus(); };
        list.appendChild(it);
      });
    }

    var toastT;
    function showToast(msg) {
      toast.textContent = msg;
      toast.classList.add('show');
      clearTimeout(toastT);
      toastT = setTimeout(function () { toast.classList.remove('show'); }, 3200);
    }

    var loading = 0, writeT;
    function load() {
      if (!state.dir) { state.list = []; renderList(); select(null); return Promise.resolve(); }
      var my = ++loading;
      return api({ type: 'videoList', dir: state.dir }).then(function (r) {
        if (my !== loading) return;
        var prevAll = state.all;
        state.all = Array.isArray(r) ? r : [];
        var fresh = state.first ? [] : newRenders(prevAll, state.all);
        if (fresh.length && notifyOn) {
          var nv = sortVideos(fresh)[0];
          api({ type: 'videoNotify', title: 'Render hazır: ' + nv.name, body: (GROUP_LABEL[nv.group] || '') + (fresh.length > 1 ? ' · +' + (fresh.length - 1) + ' dosya daha' : '') });
          try { if (window.Sfx) window.Sfx.play('message'); } catch (e) {}
          if (state.filter !== 'all' && state.filter !== nv.group) { state.filter = nv.group; try { localStorage.setItem('video.filter', nv.group); } catch (e) {} }
          state.list = filterVideos(state.all, state.filter);
          renderList();
          select(nv, true);
          showToast('Render hazır: ' + nv.name);
          state.newestPath = (sortVideos(state.list.filter(function (v) { return !v.writing; }))[0] || nv).path;
          clearTimeout(writeT);
          if (state.all.some(function (v) { return v.writing; })) writeT = setTimeout(load, 2500);
          return;
        }
        state.list = filterVideos(state.all, state.filter);
        clearTimeout(writeT);
        if (state.all.some(function (v) { return v.writing; })) writeT = setTimeout(load, 2500);
        var newest = sortVideos(state.list.filter(function (v) { return !v.writing; }))[0] || null;
        var changedNewest = newest && newest.path !== state.newestPath;
        var stillThere = state.sel && state.list.filter(function (v) { return v.path === state.sel.path; })[0];
        renderList();
        if (!state.first && changedNewest) {
          select(newest, false);
          showToast('Yeni render: ' + newest.name);
        } else if (stillThere) {
          select(stillThere, false);
        } else {
          select(newest, false);
        }
        state.newestPath = newest ? newest.path : null;
        state.first = false;
      });
    }

    function setDir(dir) {
      if (!dir) return;
      api({ type: 'videoUnwatch' });
      state.dir = dir; state.first = true; state.newestPath = null; state.sel = null;
      try { localStorage.setItem('video.dir', dir); } catch (e) {}
      chipName.textContent = baseName(dir);
      chip.title = dir;
      load();
      api({ type: 'videoWatch', dir: dir });
    }
    window.addEventListener('dt:videoDir', function (e) { if (e.detail && e.detail.dir) setDir(e.detail.dir); });

    // ----- folder menu -----
    function closeMenu() { menu.classList.remove('open'); }
    chip.onclick = function (e) {
      e.stopPropagation();
      if (menu.classList.contains('open')) return closeMenu();
      menu.innerHTML = '';
      menu.classList.add('open');
      api({ type: 'videoSessionDirs' }).then(function (dirs) {
        menu.innerHTML = '';
        (Array.isArray(dirs) ? dirs : []).forEach(function (d) {
          var b = el('button', null, baseName(d));
          b.title = d;
          b.onclick = function () { closeMenu(); setDir(d); };
          menu.appendChild(b);
        });
        var pick = el('button', 'pick', 'Klasör seç…');
        pick.onclick = function () {
          closeMenu();
          api({ type: 'videoPickFolder' }).then(function (p) { if (p) setDir(p); });
        };
        menu.appendChild(pick);
      });
    };
    document.addEventListener('click', function (e) { if (!menu.contains(e.target)) closeMenu(); });
    refresh.onclick = function () { load(); };
    empty.style.cursor = 'pointer';
    empty.onclick = function () { if (!state.list.length) chip.click(); };

    // ----- notes logic -----
    var notes = [], editing = null, pending = null, rangeStart = null, sHeld = null;
    try { waitCb.checked = localStorage.getItem('video.waitBeforeSend') !== '0'; } catch (e) { waitCb.checked = true; }
    waitCb.onchange = function () { try { localStorage.setItem('video.waitBeforeSend', waitCb.checked ? '1' : '0'); } catch (e) {} };

    function nKey() { return state.sel ? 'video.notes:' + state.sel.path : null; }
    function fps() { var f = state.sel && Number(state.sel.fps); return f > 0 ? f : null; }
    function loadNotes() {
      var k = nKey(); notes = [];
      if (!k) return;
      try { var a = JSON.parse(localStorage.getItem(k) || '[]'); if (Array.isArray(a)) notes = a; } catch (e) {}
    }
    function saveNotes() {
      var k = nKey(); if (!k) return;
      notes = sortNotes(notes);
      try { if (notes.length) localStorage.setItem(k, JSON.stringify(notes)); else localStorage.removeItem(k); } catch (e) {}
    }
    function seek(t) {
      if (!video.src) return;
      video.pause();
      video.currentTime = Math.max(0, Math.min(video.duration || t, t));
      syncTime(); wrap.focus();
    }
    function renderMarks() {
      marks.innerHTML = '';
      var d = video.duration;
      if (!d || !isFinite(d)) return;
      notes.forEach(function (n) {
        var m = el('i', 'dtv-mark' + (n.end != null ? ' rng' : ''));
        m.style.left = (n.t / d * 100) + '%';
        if (n.end != null) m.style.width = (Math.max(0, n.end - n.t) / d * 100) + '%';
        m.title = noteLabel(n) + ': ' + n.text;
        m.onmousedown = function (e) { e.stopPropagation(); e.preventDefault(); };
        m.onclick = function (e) { e.stopPropagation(); seek(n.t); };
        marks.appendChild(m);
      });
    }
    function renderNotes() {
      loadNotes();
      drawNotes();
    }
    function drawNotes() {
      nList.innerHTML = '';
      notesBox.classList.toggle('has', notes.length > 0);
      notes.forEach(function (n, i) {
        var row = el('div', 'dtv-note');
        var st = el('span', 'dtv-nstamp', noteLabel(n));
        var tx = el('span', 'tx', n.text);
        var ed = el('button', 'dtv-ib', '✎'); ed.title = 'Düzenle';
        var del = el('button', 'dtv-ib', '✕'); del.title = 'Sil';
        row.onclick = function () { seek(n.t); };
        ed.onclick = function (e) { e.stopPropagation(); seek(n.t); openInput({ t: n.t, end: n.end, fps: n.fps }, i); };
        del.onclick = function (e) { e.stopPropagation(); notes.splice(i, 1); saveNotes(); drawNotes(); };
        [st, tx, ed, del].forEach(function (x) { row.appendChild(x); });
        nList.appendChild(row);
      });
      var dis = !notes.length;
      bSend.disabled = dis; bCopy.disabled = dis; bClear.disabled = dis;
      renderMarks();
    }
    function openInput(stamp, idx) {
      if (!state.sel) return showToast('Önce bir video seç');
      video.pause();
      pending = stamp; editing = idx == null ? null : idx;
      nStamp.textContent = noteLabel(stamp);
      nText.value = editing != null ? notes[editing].text : '';
      nInput.classList.add('open');
      setTimeout(function () { nText.focus(); nText.select(); }, 0);
    }
    function closeInput() { nInput.classList.remove('open'); pending = null; editing = null; }
    function stampNow() { return { t: video.currentTime || 0, fps: fps() }; }
    function addNote() { if (video.src) openInput(stampNow()); }
    function finishRange(a, b) {
      if (b < a) { var x = a; a = b; b = x; }
      if (b - a < 0.05) return openInput({ t: a, fps: fps() });
      openInput({ t: a, end: b, fps: fps() });
    }
    function toggleRange() {
      if (!video.src) return;
      if (rangeStart == null) {
        rangeStart = video.currentTime || 0;
        bRange.classList.add('on'); bRange.textContent = 'Bitir (' + fmtStamp(rangeStart) + ')';
      } else {
        var a = rangeStart; rangeStart = null;
        bRange.classList.remove('on'); bRange.textContent = 'Aralık';
        finishRange(a, video.currentTime || 0);
      }
    }
    nText.addEventListener('keydown', function (e) {
      e.stopPropagation();
      if (e.key === 'Enter') {
        e.preventDefault();
        var txt = nText.value.trim();
        if (txt && pending) {
          var n = { t: pending.t, text: txt };
          if (pending.end != null) n.end = pending.end;
          if (pending.fps) n.fps = pending.fps;
          if (editing != null) notes[editing] = n; else notes.push(n);
          saveNotes(); drawNotes();
        }
        closeInput(); wrap.focus();
      } else if (e.key === 'Escape') { e.preventDefault(); closeInput(); wrap.focus(); }
    });
    function copyText(t, msg) {
      var done = function () { showToast(msg); };
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(t).then(done, fallback);
      } catch (e) {}
      fallback();
      function fallback() {
        var ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); done(); } catch (e) { showToast('Kopyalanamadı'); }
        ta.remove();
      }
    }
    function prompt() { return buildRevisionPrompt(state.sel ? state.sel.path : '', notes); }
    bNote.onclick = addNote;
    bRange.onclick = toggleRange;
    bStamp.onclick = function () { copyText(fmtStamp(video.currentTime || 0), 'Kopyalandı: ' + fmtStamp(video.currentTime || 0)); };
    bCopy.onclick = function () { if (notes.length) copyText(prompt(), 'Revizyon metni kopyalandı'); };
    bSend.onclick = function () {
      if (!notes.length) return;
      var text = prompt(), wait = waitCb.checked;
      var DT = window.DT;
      if (!DT || typeof DT.sendPrompt !== 'function') return copyText(text, 'Sohbet bağlantısı yok — panoya kopyalandı');
      Promise.resolve().then(function () { return DT.sendPrompt(text, { submit: !wait }); }).then(function (r) {
        if (r === false || (r && r.ok === false)) copyText(text, 'Gönderilemedi — panoya kopyalandı');
        else showToast(wait ? 'Sohbete yapıştırıldı — kontrol edip Enter’a bas' : 'Sohbete gönderildi');
      }, function () { copyText(text, 'Gönderilemedi — panoya kopyalandı'); });
    };
    bClear.onclick = function () {
      if (!notes.length || !confirm('Bu videonun tüm notları silinsin mi?')) return;
      notes = []; saveNotes(); drawNotes();
    };

    // ----- QC -----
    var qcCache = {}, qcSeq = 0;
    function runQC(v) {
      var my = ++qcSeq;
      qcBox.innerHTML = '';
      if (!v) { qcBox.classList.remove('show'); return; }
      qcBox.classList.add('show');
      if (v.writing) { qcBox.appendChild(el('span', 'dtv-qcmsg', 'Render bitince ölçülecek…')); return; }
      var key = v.path + '|' + toMs(v.mtime);
      if (qcCache[key]) return renderQC(qcCache[key]);
      qcBox.appendChild(el('span', 'dtv-qcmsg busy', 'Kalite kontrolü ölçülüyor…'));
      api({ type: 'videoQC', path: v.path }).then(function (r) {
        if (my !== qcSeq) return;
        if (r && r.ok) qcCache[key] = r;
        renderQC(r);
      });
    }
    function renderQC(r) {
      qcBox.innerHTML = '';
      if (!r || !r.ok) {
        var m = el('span', 'dtv-qcmsg bad', 'QC yapılamadı' + (r && r.error ? ': ' + r.error : ''));
        qcBox.appendChild(m);
        return;
      }
      var worst = 'ok';
      (r.chips || []).forEach(function (c) {
        var ch = el('span', 'dtv-qcchip ' + c.status);
        ch.title = c.tip || '';
        ch.appendChild(el('b', null, c.label));
        ch.appendChild(el('span', null, c.value));
        qcBox.appendChild(ch);
        if (c.status === 'bad' || (c.status === 'warn' && worst === 'ok')) worst = c.status;
      });
      qcBox.dataset.worst = worst;
    }

    // ----- compare -----
    var cmp = null, cmpMode = 'side';
    try { cmpMode = localStorage.getItem('video.cmpMode') === 'wipe' ? 'wipe' : 'side'; } catch (e) {}
    function applyCmpMode() {
      frame.classList.toggle('cmp', !!cmp);
      frame.classList.toggle('cmp-side', !!cmp && cmpMode === 'side');
      frame.classList.toggle('cmp-wipe', !!cmp && cmpMode === 'wipe');
      bCmpMode.style.display = cmp ? '' : 'none';
      bCmpMode.textContent = cmpMode === 'side' ? '◧ Perde' : '◫ Yan yana';
      bCmp.classList.toggle('on', !!cmp);
      bCmp.textContent = cmp ? '✕ Karşılaştırmayı kapat' : '⇆ Karşılaştır';
      cmpLbl.textContent = cmp ? 'A: ' + (state.sel ? state.sel.name : '') + '   ·   B: ' + cmp.name : '';
      setWipe();
    }
    function setWipe() { frame.style.setProperty('--wipe', wipe.value + '%'); }
    wipe.addEventListener('input', setWipe);
    wipe.addEventListener('mousedown', function (e) { e.stopPropagation(); });
    function startCompare(v) {
      cmp = v;
      video2.src = v.url;
      video2.playbackRate = video.playbackRate;
      video2.addEventListener('loadedmetadata', function () { syncB(true); if (!video.paused) playB(); }, { once: true });
      applyCmpMode();
    }
    function stopCompare() {
      cmp = null;
      video2.pause(); video2.removeAttribute('src'); video2.load();
      applyCmpMode();
    }
    function playB() { var p = video2.play(); if (p && p.catch) p.catch(function () {}); }
    function syncB(force) {
      if (!cmp || !video2.duration) return;
      var t = Math.min(video.currentTime || 0, Math.max(0, video2.duration - 0.05));
      if (force || Math.abs((video2.currentTime || 0) - t) > 0.12) video2.currentTime = t;
    }
    video.addEventListener('play', function () { if (cmp) { syncB(true); playB(); } });
    video.addEventListener('pause', function () { if (cmp) { video2.pause(); syncB(true); } });
    video.addEventListener('seeked', function () { syncB(true); });
    video.addEventListener('seeking', function () { syncB(true); });
    video.addEventListener('timeupdate', function () { if (!video.paused) syncB(false); });
    video.addEventListener('ratechange', function () { video2.playbackRate = video.playbackRate; });
    bCmp.onclick = function (e) {
      e.stopPropagation();
      if (cmp) return stopCompare();
      if (cmpMenu.classList.contains('open')) return cmpMenu.classList.remove('open');
      if (!state.sel) return showToast('Önce bir video seç');
      cmpMenu.innerHTML = '';
      var others = sortForAll(state.all).filter(function (v) { return v.path !== state.sel.path && !v.writing; });
      if (!others.length) cmpMenu.appendChild(el('div', 'dtv-qcmsg', 'Karşılaştırılacak başka video yok'));
      others.forEach(function (v) {
        var b = el('button', null, (GROUP_LABEL[v.group] ? GROUP_LABEL[v.group] + ' · ' : '') + v.name);
        b.title = v.path + ' — ' + relTime(v.mtime);
        b.onclick = function () { cmpMenu.classList.remove('open'); startCompare(v); wrap.focus(); };
        cmpMenu.appendChild(b);
      });
      cmpMenu.classList.add('open');
    };
    document.addEventListener('click', function (e) { if (!cmpMenu.contains(e.target)) cmpMenu.classList.remove('open'); });
    bCmpMode.onclick = function () {
      cmpMode = cmpMode === 'side' ? 'wipe' : 'side';
      try { localStorage.setItem('video.cmpMode', cmpMode); } catch (e) {}
      applyCmpMode();
    };

    // ----- frame grab -----
    function hideGrab() { grabBar.classList.remove('show'); grabBar.innerHTML = ''; }
    function grabFrame() {
      if (!state.sel || !video.src || !video.videoWidth) return showToast('Önce bir video seç');
      video.pause();
      var t = video.currentTime || 0, v = state.sel, dataUrl = null;
      try {
        var c = document.createElement('canvas');
        c.width = video.videoWidth; c.height = video.videoHeight;
        c.getContext('2d').drawImage(video, 0, 0, c.width, c.height);
        dataUrl = c.toDataURL('image/png'); // tainted canvas throws → main grabs it with ffmpeg
      } catch (e) { dataUrl = null; }
      bGrab.disabled = true;
      api({ type: 'videoSaveFrame', path: v.path, dataUrl: dataUrl, t: t }).then(function (r) {
        bGrab.disabled = false;
        if (!r || !r.ok) return showToast('Kare kaydedilemedi' + (r && r.error ? ': ' + r.error : ''));
        showGrab(r.path, t);
      });
    }
    function showGrab(png, t) {
      grabBar.innerHTML = '';
      grabBar.appendChild(el('span', 'dtv-nstamp', fmtStamp(t)));
      var p = el('span', 'tx', png); p.title = png;
      grabBar.appendChild(p);
      var bChat = el('button', 'dtv-btn on', 'Sohbete gönder');
      var bCp = el('button', 'dtv-btn', 'Yolu kopyala');
      var bX = el('button', 'dtv-ib', '✕');
      bChat.onclick = function () {
        var text = 'Bu karede (' + fmtStamp(t) + ') şunu değiştir: \n' + png;
        var DT = window.DT;
        if (!DT || typeof DT.sendPrompt !== 'function') return copyText(text, 'Sohbet bağlantısı yok — panoya kopyalandı');
        Promise.resolve().then(function () { return DT.sendPrompt(text, { submit: false }); }).then(function (r) {
          if (r === false || (r && r.ok === false)) copyText(text, 'Gönderilemedi — panoya kopyalandı');
          else { showToast('Sohbete yapıştırıldı — ne değişeceğini yaz'); hideGrab(); }
        }, function () { copyText(text, 'Gönderilemedi — panoya kopyalandı'); });
      };
      bCp.onclick = function () { copyText(png, 'Yol kopyalandı'); };
      bX.onclick = hideGrab;
      [bChat, bCp, bX].forEach(function (x) { grabBar.appendChild(x); });
      grabBar.classList.add('show');
    }
    bGrab.onclick = grabFrame;

    // ----- registered actions (see registerAction above) -----
    function actionCtx() {
      var v = state.sel;
      return v ? { path: v.path, name: v.name, url: v.url, group: v.group, fps: v.fps, currentTime: video.currentTime || 0, duration: video.duration || 0, element: video } : null;
    }
    function renderActions() {
      actBox.innerHTML = '';
      actions.forEach(function (a) {
        if (Array.isArray(a.groups) && a.groups.length && !(state.sel && a.groups.indexOf(state.sel.group) >= 0)) return;
        var b = el('button', 'dtv-btn', (a.icon ? a.icon + ' ' : '') + (a.label || a.id));
        b.title = a.title || a.label || a.id;
        b.disabled = !state.sel;
        b.onclick = function () {
          var ctx = actionCtx();
          if (!ctx) return;
          b.classList.add('busy'); b.disabled = true;
          var done = function () { b.classList.remove('busy'); b.disabled = !state.sel; };
          Promise.resolve().then(function () { return a.run(ctx); }).then(done, function (e) {
            done(); showToast((a.label || a.id) + ': ' + (e && e.message ? e.message : 'hata'));
          });
        };
        actBox.appendChild(b);
      });
    }
    actionListeners.push(renderActions);

    // ----- events -----
    window.addEventListener('dt-videos-changed', function (e) {
      var d = e && e.detail && e.detail.dir;
      if (!d || d === state.dir) load();
    });
    window.addEventListener('studio-tab', function (e) {
      if (e && e.detail !== 'video') video.pause();
    });
    document.addEventListener('visibilitychange', function () { if (document.hidden) video.pause(); });

    wrap.addEventListener('keydown', function (e) {
      var t = e.target;
      if (t && (t.tagName === 'INPUT' && t.type !== 'range' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.code === 'Space' || e.key === ' ') { e.preventDefault(); togglePlay(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); video.currentTime = Math.max(0, video.currentTime - 1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); video.currentTime = Math.min(video.duration || 0, video.currentTime + 1); }
      else if ((e.key === 'n' || e.key === 'N') && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); addNote(); }
      else if ((e.key === 'f' || e.key === 'F') && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); if (!e.repeat) grabFrame(); }
      else if ((e.key === 's' || e.key === 'S') && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        if (!e.repeat && sHeld == null && video.src) sHeld = video.currentTime || 0;
      }
    });
    wrap.addEventListener('keyup', function (e) {
      if ((e.key === 's' || e.key === 'S') && sHeld != null) {
        var a = sHeld; sHeld = null;
        finishRange(a, video.currentTime || 0);
      }
    });
    wrap.addEventListener('blur', function () { sHeld = null; }, true);
    frame.addEventListener('mousedown', function () { wrap.focus(); });

    // relative times + YENİ badges refresh
    setInterval(function () {
      Array.prototype.forEach.call(list.querySelectorAll('.m'), function (m) { m.textContent = relTime(m._mtime); });
      Array.prototype.forEach.call(list.children, function (it) {
        var v = state.list.filter(function (x) { return x.path === it._path; })[0];
        var b = it.querySelector('.dtv-new');
        if (b && v && !isNew(v.mtime)) b.remove();
      });
    }, 30000);

    // init
    drawNotes();
    renderActions(); applyCmpMode();
    if (state.dir) setDir(state.dir); else { renderList(); syncTime(); }
  }

  function init() {
    var m = document.getElementById('video-mount');
    if (m && !m._dtv) {
      m._dtv = true; mount(m);
      try { window.dispatchEvent(new CustomEvent('dtvideo:ready')); } catch (e) {}
    }
  }
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  }
})();
