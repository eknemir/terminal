// Skills tab (right column, #skills-mount): Claude Code skills in ~/.claude/skills — list, search, enable/disable,
// install from a .skill/.zip (pick or drop), remove (to the recycle bin), and the app's bundled "Hazır paket".
(function () {
  'use strict';
  var mount = document.getElementById('skills-mount');
  if (!mount) return;

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
  function ago(ms) {
    if (!ms) return '';
    var d = Math.floor((Date.now() - ms) / 86400000);
    if (d <= 0) {
      var h = Math.floor((Date.now() - ms) / 3600000);
      return h <= 0 ? 'az önce' : h + ' saat önce';
    }
    if (d < 30) return d + ' gün önce';
    if (d < 365) return Math.floor(d / 30) + ' ay önce';
    return Math.floor(d / 365) + ' yıl önce';
  }
  function norm(s) { return String(s || '').toLocaleLowerCase('tr'); }

  var state = { skills: [], bundled: [], q: '', menu: null };

  // ---------- layout ----------
  var root = el('div', 'sk-root');
  var search = el('input', 'sk-search');
  search.type = 'search';
  search.placeholder = 'Skill ara…';
  var drop = el('div', 'sk-drop');
  var dropTxt = el('span', null, '‘.skill’ dosyasını buraya sürükle ya da ');
  var pick = el('button', 'sk-link', 'seç');
  pick.type = 'button';
  drop.appendChild(dropTxt);
  drop.appendChild(pick);
  var status = el('div', 'sk-status');
  var listHead = el('div', 'sk-head', 'Kurulu');
  var list = el('div', 'sk-list');
  var bundHead = el('div', 'sk-head', 'Hazır paket');
  var bundList = el('div', 'sk-list sk-bundled');
  [search, drop, status, listHead, list, bundHead, bundList].forEach(function (n) { root.appendChild(n); });
  mount.appendChild(root);

  var statusTimer = null;
  function say(text, bad) {
    status.textContent = text || '';
    status.classList.toggle('bad', !!bad);
    status.classList.toggle('on', !!text);
    clearTimeout(statusTimer);
    if (text) statusTimer = setTimeout(function () { status.classList.remove('on'); }, 5000);
  }
  function report(r) {
    if (!r) return say('İşlem tamamlanamadı', true);
    if (r.error) return say(r.error, true);
    var parts = [];
    if (r.installed && r.installed.length) parts.push('Kuruldu: ' + r.installed.join(', '));
    if (r.skipped && r.skipped.length) parts.push('Atlandı: ' + r.skipped.map(function (s) { return s.name + ' (' + s.reason + ')'; }).join(', '));
    say(parts.join(' · ') || 'Tamam', !r.ok);
  }

  function closeMenu() {
    if (state.menu) { state.menu.remove(); state.menu = null; }
  }
  document.addEventListener('click', closeMenu);

  function card(s) {
    var c = el('div', 'sk-card' + (s.enabled ? '' : ' off'));
    var top = el('div', 'sk-top');
    var name = el('div', 'sk-name', s.title || s.name);
    var sw = el('label', 'sk-switch');
    sw.title = s.enabled ? 'Açık' : 'Kapalı';
    var cb = el('input');
    cb.type = 'checkbox';
    cb.checked = !!s.enabled;
    sw.appendChild(cb);
    sw.appendChild(el('span', 'sk-knob'));
    cb.addEventListener('change', function () {
      api({ type: 'skillsToggle', name: s.name, enabled: cb.checked }).then(function (r) {
        if (!r || !r.ok) report(r || { error: 'Değiştirilemedi' });
        refresh();
      });
    });
    var more = el('button', 'sk-more', '⋯');
    more.type = 'button';
    more.title = 'Diğer';
    more.addEventListener('click', function (e) {
      e.stopPropagation();
      closeMenu();
      var m = el('div', 'sk-menu');
      var a = el('button', null, 'Klasörde aç');
      var b = el('button', 'danger', 'Kaldır');
      a.type = b.type = 'button';
      a.addEventListener('click', function () { closeMenu(); api({ type: 'skillsReveal', name: s.name }); });
      b.addEventListener('click', function () {
        closeMenu();
        api({ type: 'skillsRemove', name: s.name }).then(function (r) {
          if (r && r.ok) say('Kaldırıldı: ' + s.name); else if (!(r && r.canceled)) report(r);
          refresh();
        });
      });
      m.appendChild(a);
      m.appendChild(b);
      c.appendChild(m);
      state.menu = m;
    });
    top.appendChild(name);
    top.appendChild(sw);
    top.appendChild(more);
    c.appendChild(top);
    if (s.description) c.appendChild(el('div', 'sk-desc', s.description)).title = s.description;
    var meta = [];
    if (s.mtime) meta.push('Güncellendi ' + ago(s.mtime));
    if (s.files) meta.push(s.files + ' dosya');
    if (!s.enabled) meta.push('kapalı');
    c.appendChild(el('div', 'sk-meta', meta.join(' · ')));
    return c;
  }

  function bundCard(b) {
    var c = el('div', 'sk-card');
    var top = el('div', 'sk-top');
    top.appendChild(el('div', 'sk-name', b.title || b.name));
    var label = !b.installed ? 'Kur' : b.outdated ? 'Güncelle' : 'Kurulu';
    var btn = el('button', 'sk-btn' + (b.installed && !b.outdated ? ' done' : ''), label);
    btn.type = 'button';
    btn.disabled = b.installed && !b.outdated;
    btn.addEventListener('click', function () {
      btn.disabled = true;
      api({ type: 'skillsInstallBundled', name: b.name }).then(function (r) { report(r); refresh(); });
    });
    top.appendChild(btn);
    c.appendChild(top);
    if (b.description) c.appendChild(el('div', 'sk-desc', b.description)).title = b.description;
    return c;
  }

  function render() {
    var q = norm(state.q);
    var match = function (s) { return !q || norm(s.name + ' ' + s.title + ' ' + s.description).indexOf(q) >= 0; };
    list.textContent = '';
    var shown = state.skills.filter(match);
    if (!shown.length) list.appendChild(el('div', 'sk-empty', state.skills.length ? 'Eşleşen skill yok' : 'Henüz skill kurulu değil'));
    shown.forEach(function (s) { list.appendChild(card(s)); });
    bundList.textContent = '';
    var bs = state.bundled.filter(match);
    bundHead.style.display = bundList.style.display = state.bundled.length ? '' : 'none';
    bs.forEach(function (b) { bundList.appendChild(bundCard(b)); });
  }

  function refresh() {
    return Promise.all([api({ type: 'skillsList' }), api({ type: 'skillsBundled' })]).then(function (r) {
      state.skills = Array.isArray(r[0]) ? r[0] : [];
      state.bundled = Array.isArray(r[1]) ? r[1] : [];
      render();
    });
  }

  function install(p) {
    if (!p) return;
    say('Kuruluyor…');
    api({ type: 'skillsInstall', path: p }).then(function (r) { report(r); refresh(); });
  }

  search.addEventListener('input', function () { state.q = search.value; render(); });
  pick.addEventListener('click', function () {
    api({ type: 'skillsPickFile' }).then(function (p) { if (p) install(p); });
  });
  drop.addEventListener('click', function (e) { if (e.target === drop || e.target === dropTxt) pick.click(); });
  ['dragenter', 'dragover'].forEach(function (t) {
    drop.addEventListener(t, function (e) { e.preventDefault(); e.stopPropagation(); drop.classList.add('hot'); });
  });
  drop.addEventListener('dragleave', function () { drop.classList.remove('hot'); });
  drop.addEventListener('drop', function (e) {
    e.preventDefault();
    e.stopPropagation();
    drop.classList.remove('hot');
    var files = (e.dataTransfer && e.dataTransfer.files) || [];
    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      var p = (typeof window.getPathForFile === 'function' && window.getPathForFile(f)) || f.path || '';
      if (p) install(p); else say('Dosya yolu okunamadı', true);
    }
  });

  window.addEventListener('studio-tab', function (e) { if (e.detail === 'skills') refresh(); });
  window.addEventListener('focus', function () { if (mount.classList.contains('on')) refresh(); });
  refresh();
})();
