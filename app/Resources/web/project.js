// Proje başlatıcı: "+ yeni video" — marka/numara klasörü, şablon alt klasörler, NOTLAR.md, ilk prompt ile Claude.
(function () {
  'use strict';
  var isMac = /Mac/i.test(navigator.platform || '');
  var DEF_BASE = isMac ? '~/İşler' : 'D:\\İşler';
  var DEF_FOLDERS = ['Render', 'Kapak', 'Videolar', 'Görseller', 'Görseller/Referans', 'Assets', 'Assets/Onizleme', 'Assets/Ses', 'Assets/Tools', 'Assets/Kontrol'];
  var DEF_PROMPT = 'Yeni video projesi: {marka} – {video}. Proje klasörü: {klasor}. Ham çekim: {ham}. Format: {format}.{muzik}{sure}\n' +
    "Önce müşteri kartını oku, sonra NOTLAR.md'ye bak ve işe nasıl başlayacağımızı öner.";
  var FORMATS = [['9:16', '9:16 Reels'], ['16:9', '16:9'], ['1:1', '1:1']];

  function api(msg) {
    try { return Promise.resolve(window.webkit.messageHandlers.radar.postMessage(msg)); }
    catch (e) { return Promise.resolve(null); }
  }
  function get(k, d) { try { var v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } }
  function set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function folders() { try { var a = JSON.parse(get('project.folders', 'null')); return Array.isArray(a) ? a : DEF_FOLDERS.slice(); } catch (e) { return DEF_FOLDERS.slice(); } }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function field(label, input) { var w = el('label', 'pj-field'); w.appendChild(el('span', null, label)); w.appendChild(input); return w; }
  function input(ph, val) { var i = el('input', 'pj-in'); i.placeholder = ph || ''; if (val) i.value = val; return i; }

  function modal(title) {
    var back = el('div', 'pj-back');
    var box = el('div', 'pj-box');
    box.appendChild(el('div', 'pj-title', title));
    back.appendChild(box);
    back.addEventListener('mousedown', function (e) { if (e.target === back) close(); });
    function onKey(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', onKey);
    function close() { document.removeEventListener('keydown', onKey); back.remove(); }
    document.body.appendChild(back);
    return { box: box, close: close };
  }

  function templateModal() {
    var m = modal('Klasör şablonu');
    m.box.appendChild(el('div', 'pj-hint', 'Her satıra bir klasör. Alt klasör için / kullan (ör. Assets/Ses).'));
    var ta = el('textarea', 'pj-in pj-ta'); ta.value = folders().join('\n'); ta.rows = 12;
    m.box.appendChild(ta);
    m.box.appendChild(el('div', 'pj-hint', 'İlk mesaj şablonu: {marka} {video} {no} {klasor} {ham} {format} {muzik} {sure}'));
    var pt = el('textarea', 'pj-in pj-ta'); pt.value = get('project.prompt', DEF_PROMPT); pt.rows = 5;
    m.box.appendChild(pt);
    var row = el('div', 'pj-row');
    var reset = el('button', 'pj-btn', 'Varsayılana dön');
    reset.onclick = function () { ta.value = DEF_FOLDERS.join('\n'); pt.value = DEF_PROMPT; };
    var save = el('button', 'pj-btn primary', 'Kaydet');
    save.onclick = function () {
      set('project.folders', JSON.stringify(ta.value.split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean)));
      set('project.prompt', pt.value);
      m.close();
    };
    row.appendChild(reset); row.appendChild(el('i', 'pj-sp')); row.appendChild(save);
    m.box.appendChild(row);
  }

  function open() {
    var m = modal('Yeni video projesi');
    var base = input('Ana klasör', get('project.base', DEF_BASE));
    var marka = input('Marka (var olanı seç ya da yeni yaz)');
    marka.setAttribute('list', 'pj-brands');
    var dl = el('datalist'); dl.id = 'pj-brands';
    var noLbl = el('div', 'pj-no', 'No: —');
    var video = input('Video adı');
    var ham = input('İsteğe bağlı');
    var hamBtn = el('button', 'pj-btn', 'Seç…');
    var muzik = input('İsteğe bağlı (ör. enerjik, akustik)');
    var sure = input('İsteğe bağlı (ör. 30 sn)');
    var chosen = { '9:16': true };
    var chips = el('div', 'pj-chips');
    FORMATS.forEach(function (f) {
      var c = el('button', 'pj-chip' + (chosen[f[0]] ? ' on' : ''), f[1]);
      c.type = 'button';
      c.onclick = function () { chosen[f[0]] = !chosen[f[0]]; c.classList.toggle('on', !!chosen[f[0]]); };
      chips.appendChild(c);
    });
    var status = el('div', 'pj-status');

    m.box.appendChild(field('Ana klasör', base));
    var mrow = el('div', 'pj-row'); mrow.appendChild(field('Marka', marka)); mrow.appendChild(noLbl);
    m.box.appendChild(mrow); m.box.appendChild(dl);
    m.box.appendChild(field('Video adı', video));
    var hrow = el('div', 'pj-row'); hrow.appendChild(field('Ham çekim klasörü', ham)); hrow.appendChild(hamBtn);
    m.box.appendChild(hrow);
    m.box.appendChild(field('Format', chips));
    var nrow = el('div', 'pj-row'); nrow.appendChild(field('Müzik', muzik)); nrow.appendChild(field('Süre', sure));
    m.box.appendChild(nrow);
    m.box.appendChild(status);
    var row = el('div', 'pj-row');
    var tplBtn = el('button', 'pj-btn', 'Klasör şablonu…');
    var cancel = el('button', 'pj-btn', 'Vazgeç');
    var ok = el('button', 'pj-btn primary', 'Oluştur');
    row.appendChild(tplBtn); row.appendChild(el('i', 'pj-sp')); row.appendChild(cancel); row.appendChild(ok);
    m.box.appendChild(row);

    function say(t, bad) { status.textContent = t || ''; status.className = 'pj-status' + (t ? ' on' : '') + (bad ? ' bad' : ''); }
    function baseVal() { return base.value.trim(); } // "~" is expanded in main
    var t = 0;
    function refresh() {
      clearTimeout(t);
      t = setTimeout(function () {
        api({ type: 'projectInfo', base: baseVal(), marka: marka.value.trim() }).then(function (r) {
          if (!r || !r.ok) { noLbl.textContent = 'No: —'; return say('Ana klasör geçersiz', true); }
          say(r.exists ? '' : 'Ana klasör yok, oluşturulacak');
          dl.innerHTML = '';
          r.brands.forEach(function (b) { var o = el('option'); o.value = b; dl.appendChild(o); });
          noLbl.textContent = 'No: ' + (marka.value.trim() ? r.next : '—');
        });
      }, 150);
    }
    base.oninput = refresh; marka.oninput = refresh;
    hamBtn.onclick = function () {
      api({ type: 'projectPickFolder', title: 'Ham çekim klasörü' }).then(function (p) { if (p) ham.value = p; });
    };
    tplBtn.onclick = templateModal;
    cancel.onclick = m.close;
    ok.onclick = function () {
      if (!marka.value.trim()) return say('Marka gerekli', true);
      if (!video.value.trim()) return say('Video adı gerekli', true);
      ok.disabled = true; say('Oluşturuluyor…');
      set('project.base', base.value.trim());
      api({
        type: 'projectCreate', base: baseVal(), marka: marka.value, video: video.value, ham: ham.value,
        formats: Object.keys(chosen).filter(function (k) { return chosen[k]; }),
        muzik: muzik.value, sure: sure.value, folders: folders(), prompt: get('project.prompt', DEF_PROMPT),
      }).then(function (r) {
        ok.disabled = false;
        if (!r || !r.ok) return say((r && r.reason) || 'Oluşturulamadı', true);
        set('video.dir', r.dir);
        window.dispatchEvent(new CustomEvent('dt:videoDir', { detail: { dir: r.dir } }));
        m.close();
        if (typeof window.toast === 'function') window.toast('Proje hazır: ' + r.dir);
      });
    };
    refresh();
    setTimeout(function () { marka.focus(); }, 30);
  }

  function hook() {
    var b = document.getElementById('newvideo');
    if (b) b.onclick = open;
  }
  window.DTProject = { open: open, template: templateModal };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hook); else hook();
})();
