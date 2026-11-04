'use strict';
// The logo the app shows (the top bar's brand, the boot screen, the menus' titles, the window/taskbar icon). The user
// picks it in Settings · "Logo": the built-in D (default), the ">_" prompt, or an image of their own (kept as a data
// URL, at most 512px). Kept in localStorage "app.logo" ('' = default, 'prompt', or 'data:image/…'), applied live.
(() => {
  const KEY = 'app.logo', DEFAULT = 'logo-default.png', PROMPT = 'logo-prompt.png';
  const raw = () => { try { return localStorage.getItem(KEY) || ''; } catch { return ''; } };
  const choice = () => { const v = raw(); return v.startsWith('data:image/') ? 'custom' : v === 'prompt' ? 'prompt' : 'default'; };
  const get = () => { const v = raw(); return v.startsWith('data:image/') ? v : v === 'prompt' ? PROMPT : DEFAULT; };

  // The app's icon wants a data URL; the built-ins are drawn into one first.
  let told = null;
  function toDataUrl(src) {
    if (src.startsWith('data:')) return Promise.resolve(src);
    return new Promise((res) => {
      const img = new Image();
      img.onload = () => {
        const s = Math.min(512, Math.max(img.naturalWidth, img.naturalHeight)) || 256;
        const c = document.createElement('canvas');
        c.width = c.height = s;
        c.getContext('2d').drawImage(img, 0, 0, s, s);
        try { res(c.toDataURL('image/png')); } catch { res(null); }
      };
      img.onerror = () => res(null);
      img.src = src;
    });
  }
  async function tell(src) {
    if (told === src) return;
    told = src;
    const dataUrl = await toDataUrl(src);
    if (!dataUrl || told !== src) return;
    try { window.webkit.messageHandlers.radar.postMessage({ type: 'appLogo', dataUrl }); } catch {}
  }

  function apply() {
    const src = get();
    document.querySelectorAll('img[data-applogo]').forEach((el) => { if (el.getAttribute('src') !== src) el.src = src; });
    const fav = document.querySelector('link[rel="icon"]');
    if (fav && fav.getAttribute('href') !== src) fav.href = src;
    // Only the main page sets the app's icon (the others would just repeat it).
    if (document.getElementById('boot') || document.querySelector('.brand')) tell(src);
    window.dispatchEvent(new CustomEvent('applogo', { detail: src }));
  }
  function set(v) {
    try {
      v && v !== 'default' ? localStorage.setItem(KEY, v) : localStorage.removeItem(KEY);
    } catch {
      window.dispatchEvent(new CustomEvent('applogo-error', { detail: 'saklanamayacak kadar büyük' }));
    }
    apply();
  }
  // A picked file: read, scaled down to fit 512px (keeping its shape), kept as a PNG data URL.
  function fromFile(file) {
    return new Promise((res, rej) => {
      if (!file || !/^image\//.test(file.type)) return rej(new Error('görsel değil'));
      const fr = new FileReader();
      fr.onerror = () => rej(new Error('dosya okunamadı'));
      fr.onload = () => {
        const img = new Image();
        img.onerror = () => rej(new Error('görsel değil'));
        img.onload = () => {
          const w = img.naturalWidth, h = img.naturalHeight, k = Math.min(1, 512 / Math.max(w, h));
          const c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(w * k));
          c.height = Math.max(1, Math.round(h * k));
          const g = c.getContext('2d');
          g.imageSmoothingQuality = 'high';
          g.drawImage(img, 0, 0, c.width, c.height);
          const url = c.toDataURL('image/png');
          set(url);
          res(url);
        };
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }
  // Another window changed it.
  window.addEventListener('storage', (e) => { if (e.key === KEY) apply(); });
  // Images added later (menus) pick it up as they appear.
  const watch = () => {
    apply();
    new MutationObserver((ms) => {
      if (ms.some((m) => [...m.addedNodes].some((n) => n.nodeType === 1 && (n.matches?.('img[data-applogo]') || n.querySelector?.('img[data-applogo]'))))) {
        const src = get();
        document.querySelectorAll('img[data-applogo]').forEach((el) => { if (el.getAttribute('src') !== src) el.src = src; });
      }
    }).observe(document.body, { childList: true, subtree: true });
  };
  window.AppLogo = { get, choice, set, fromFile, apply, DEFAULT, PROMPT };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch); else watch();
})();
