/* DT Teslim — "Teslim paketi", "Premiere'de aç", "Markerları getir" actions for the Videos tab (DTVideo.registerAction) */
(function () {
  'use strict';

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
  function prompt(text) {
    var DT = window.DT;
    if (!DT || typeof DT.sendPrompt !== 'function') {
      try { navigator.clipboard.writeText(text); } catch (e) {}
      toast('Sohbet bağlantısı yok — panoya kopyalandı');
      return;
    }
    Promise.resolve().then(function () { return DT.sendPrompt(text, { submit: false }); })
      .then(function () { toast('Sohbete yazıldı — Enter ile gönder'); }, function () { toast('Gönderilemedi'); });
  }
  function toast(t) {
    var n = el('div', 'dtd-toast', t);
    document.body.appendChild(n);
    setTimeout(function () { n.classList.add('out'); }, 2200);
    setTimeout(function () { n.remove(); }, 2700);
  }

  var RAW_KEY = 'dt.deliver.raw:';
  function rememberedRaw(root) { try { return localStorage.getItem(RAW_KEY + root) || null; } catch (e) { return null; } }
  function rememberRaw(root, d) { try { localStorage.setItem(RAW_KEY + root, d); } catch (e) {} }

  // ---------- Teslim paketi modal ----------
  function openDeliver(video) {
    var back = el('div', 'dtd-back'), box = el('div', 'dtd-modal');
    back.appendChild(box);
    var close = function () { back.remove(); document.removeEventListener('keydown', onKey); };
    var onKey = function (e) { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    back.addEventListener('mousedown', function (e) { if (e.target === back) close(); });

    var head = el('div', 'dtd-head');
    head.appendChild(el('div', 'dtd-title', 'Teslim paketi'));
    var x = el('button', 'dtd-x', '×'); x.onclick = close; head.appendChild(x);
    box.appendChild(head);

    var top = el('div', 'dtd-top');
    var cov = el('div', 'dtd-cover', 'Kapak aranıyor…');
    var info = el('div', 'dtd-info');
    info.appendChild(el('div', 'dtd-label', 'Final video'));
    info.appendChild(el('div', 'dtd-file', video.name || video.path));
    var coverName = el('div', 'dtd-sub', '');
    info.appendChild(coverName);
    top.appendChild(cov); top.appendChild(info);
    box.appendChild(top);

    box.appendChild(el('div', 'dtd-label', 'Açıklama / caption'));
    var ta = el('textarea', 'dtd-caption');
    ta.placeholder = 'Instagram açıklaması ve hashtagler…';
    box.appendChild(ta);
    var bClaude = el('button', 'dtd-btn', "Claude'a yazdır");
    bClaude.onclick = function () {
      prompt('Bu video için Türkçe bir Instagram açıklaması (caption) ve uygun hashtagler yaz: ' + video.path +
        '\nKısa, samimi bir giriş + 1-2 cümle + çağrı; sonra 8-15 hashtag. Müşteri kartındaki marka dilini kullan.');
    };
    box.appendChild(bClaude);

    box.appendChild(el('div', 'dtd-label', 'Hedefler'));
    var dests = el('div', 'dtd-dests');
    function check(label, on) {
      var row = el('label', 'dtd-check'), cb = el('input');
      cb.type = 'checkbox'; cb.checked = !!on;
      var txt = el('span', null, label), sub = el('span', 'dtd-sub', '');
      var col = el('span', 'dtd-col'); col.appendChild(txt); col.appendChild(sub);
      row.appendChild(cb); row.appendChild(col);
      dests.appendChild(row);
      return { cb: cb, sub: sub, row: row };
    }
    var cTeslim = check('"Teslim" klasörü', true);
    var cRaw = check('Ham çekim klasörüne kopya', true);
    var bRaw = el('button', 'dtd-btn sm', 'Seç…'); cRaw.row.appendChild(bRaw);
    var cClip = check('Panoya kopyala (WhatsApp / Drive için dosya olarak)', false);
    box.appendChild(dests);

    var foot = el('div', 'dtd-foot');
    var status = el('div', 'dtd-status', '');
    var bCancel = el('button', 'dtd-btn', 'Vazgeç'), bGo = el('button', 'dtd-btn on', 'Teslim et');
    bCancel.onclick = close;
    foot.appendChild(status); foot.appendChild(bCancel); foot.appendChild(bGo);
    box.appendChild(foot);
    document.body.appendChild(back);

    var scan = null, rawDir = null;
    function showRaw() { cRaw.sub.textContent = rawDir || 'Klasör seçilmedi (bir kez seçilir, NOTLAR.md\'ye yazılır)'; }
    api({ type: 'deliverScan', path: video.path }).then(function (r) {
      if (!r || !r.ok) { cov.textContent = 'Kapak yok'; status.textContent = 'Proje okunamadı'; return; }
      scan = r;
      cTeslim.sub.textContent = r.teslimDir;
      rawDir = r.rawDir || rememberedRaw(r.root);
      showRaw();
      if (r.coverUrl) { cov.textContent = ''; var img = el('img'); img.src = r.coverUrl; cov.appendChild(img); }
      else cov.textContent = 'Kapak yok';
      coverName.textContent = r.cover ? 'Kapak: ' + r.cover.split(/[\\/]/).pop() : 'Kapak\\ klasöründe jpg/png yok';
    });
    bRaw.onclick = function () {
      api({ type: 'deliverPickRaw', path: video.path }).then(function (d) {
        if (d) { rawDir = d; if (scan) rememberRaw(scan.root, d); cRaw.cb.checked = true; showRaw(); }
      });
    };
    bGo.onclick = function () {
      if (cRaw.cb.checked && !rawDir) { status.textContent = 'Ham çekim klasörünü seç'; return; }
      if (!cRaw.cb.checked && !cTeslim.cb.checked && !cClip.cb.checked) { status.textContent = 'Bir hedef seç'; return; }
      bGo.disabled = true; status.textContent = 'Kopyalanıyor…';
      api({ type: 'deliverRun', path: video.path, cover: scan && scan.cover, caption: ta.value,
        teslim: cTeslim.cb.checked, raw: cRaw.cb.checked, rawDir: rawDir, clipboard: cClip.cb.checked }).then(function (r) {
        bGo.disabled = false;
        if (!r) { status.textContent = 'Yanıt yok'; return; }
        var msg = (r.files || []).length + ' dosya kopyalandı';
        if (cClip.cb.checked) msg += r.clipboard ? ' · panoda' : ' · panoya kopyalanamadı';
        if (r.errors && r.errors.length) { status.textContent = msg + ' · hata: ' + r.errors[0]; return; }
        toast(msg); close();
      });
    };
  }

  // ---------- registration ----------
  var ACTIONS = [
    { id: 'deliver', label: 'Teslim paketi', icon: '📦', groups: ['final'], run: function (v) { openDeliver(v); } },
    { id: 'premiere-open', label: "Premiere'de aç", icon: '🎬', run: function (v) {
      prompt("Premiere'de aç: " + v.path + " (premiere skill: render'ı yeni projeye/sequence'a yerleştir)");
    } },
    { id: 'premiere-markers', label: 'Markerları getir', icon: '📍', run: function (v) {
      prompt('Premiere skill / premiere-kopru ile açık sequence\'ın markerlarını oku (marker / timeline_oku) ve her birini ' +
        'zaman damgası ve metniyle bu videonun revizyon notu olarak ekle: ' + v.path);
    } },
  ];
  var done = false;
  function register() {
    var V = window.DTVideo;
    if (done) return true;
    if (!V || typeof V.registerAction !== 'function') return false;
    done = true;
    ACTIONS.forEach(function (a) {
      var run = a.run;
      // only Final for the delivery, in case registerAction ignores "groups"
      V.registerAction({ id: a.id, label: a.label, icon: a.icon, groups: a.groups, run: function (v) {
        if (a.groups && v && v.group && a.groups.indexOf(v.group) < 0) return toast('Teslim paketi yalnız Final videolar için');
        run(v);
      } });
    });
    return true;
  }
  if (!register()) {
    var onReady = function () { register(); };
    window.addEventListener('dtvideo:ready', onReady);
    var t0 = Date.now(), iv = setInterval(function () {
      if (register() || Date.now() - t0 > 5000) { clearInterval(iv); window.removeEventListener('dtvideo:ready', onReady); }
    }, 200);
  }
})();
