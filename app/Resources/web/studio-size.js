// Studio panel sizing: draggable splitter (--studio-w), wide mode, fullscreen overlay.
(function () {
  const app = document.getElementById('app');
  const right = document.getElementById('right');
  const panel = document.getElementById('p-studio');
  if (!app || !right || !panel) return;
  const KEY = 'studio.width';
  const MIN = 300;
  const maxW = () => Math.round(window.innerWidth * 0.7);
  const clamp = (w) => Math.max(MIN, Math.min(maxW(), w));

  let raf = 0;
  function emit() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const r = right.getBoundingClientRect();
      window.dispatchEvent(new CustomEvent('studio-resize', {
        detail: { width: r.width, height: r.height, wide: app.classList.contains('studio-wide'), full: right.classList.contains('studio-full') },
      }));
    });
  }

  function setW(w, save) {
    if (w == null) { app.style.removeProperty('--studio-w'); if (save) localStorage.removeItem(KEY); }
    else { w = clamp(w); app.style.setProperty('--studio-w', w + 'px'); if (save) localStorage.setItem(KEY, String(w)); }
    emit();
  }
  const saved = parseInt(localStorage.getItem(KEY), 10);
  if (saved > 0) setW(saved, false);

  // Splitter
  const split = document.createElement('div');
  split.className = 'studio-split';
  split.title = 'Sürükle: paneli genişlet/daralt · çift tık: varsayılan genişlik';
  right.appendChild(split);
  split.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    split.setPointerCapture(e.pointerId);
    document.body.classList.add('studio-dragging');
    const rightEdge = right.getBoundingClientRect().right;
    const move = (ev) => setW(rightEdge - ev.clientX, false);
    const up = () => {
      split.removeEventListener('pointermove', move);
      split.removeEventListener('pointerup', up);
      split.removeEventListener('pointercancel', up);
      document.body.classList.remove('studio-dragging');
      setW(Math.round(right.getBoundingClientRect().width), true);
    };
    split.addEventListener('pointermove', move);
    split.addEventListener('pointerup', up);
    split.addEventListener('pointercancel', up);
  });
  split.addEventListener('dblclick', () => setW(null, true));

  // Header buttons
  const header = panel.querySelector(':scope > header');
  const box = document.createElement('span');
  box.className = 'studio-sz';
  box.innerHTML = '<button type="button" data-sz="wide" title="Genişlet (haritanın yerini kapla)">⤢</button>' +
    '<button type="button" data-sz="full" title="Tam ekran (Ctrl+Shift+F · çıkmak için Esc)">⛶</button>';
  if (header) header.appendChild(box);
  const bWide = box.querySelector('[data-sz="wide"]');
  const bFull = box.querySelector('[data-sz="full"]');

  function setWide(on) {
    app.classList.toggle('studio-wide', on);
    bWide.classList.toggle('on', on);
    bWide.title = on ? 'Daralt (normal görünüm)' : 'Genişlet (haritanın yerini kapla)';
    emit();
  }
  function setFull(on) {
    if (on) {
      const top = document.getElementById('top');
      const h = top ? Math.round(top.getBoundingClientRect().bottom) : 56;
      right.style.setProperty('--studio-top', h + 'px');
    }
    right.classList.toggle('studio-full', on);
    panel.classList.toggle('studio-full', on);
    bFull.classList.toggle('on', on);
    bFull.title = on ? 'Tam ekrandan çık (Esc)' : 'Tam ekran (Ctrl+Shift+F · çıkmak için Esc)';
    emit();
  }
  bWide.addEventListener('click', () => setWide(!app.classList.contains('studio-wide')));
  bFull.addEventListener('click', () => setFull(!right.classList.contains('studio-full')));

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && !e.altKey && (e.key === 'F' || e.key === 'f' || e.code === 'KeyF')) {
      e.preventDefault();
      setFull(!right.classList.contains('studio-full'));
    } else if (e.key === 'Escape' && right.classList.contains('studio-full')) {
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      setFull(false);
    }
  });

  window.addEventListener('resize', () => {
    const cur = parseInt(app.style.getPropertyValue('--studio-w'), 10);
    if (cur > maxW()) setW(maxW(), false);
    emit();
  });
  if (window.ResizeObserver) new ResizeObserver(emit).observe(right);
})();
