'use strict';
// The app's theme colour (Settings · Görünüm · "Tema rengi"): a preset or a colour of the user's own. Kept in
// localStorage "app.accent" ('' / 'cyberpunk' = the terminal theme's own colours, a preset id, or 'custom:#rrggbb').
// Loaded in every page's <head>, so the colours are there before the first paint; they go on the root as one
// !important style sheet, above style.css and the terminal theme's tokens. Other windows follow (storage event).
(() => {
  const KEY = 'app.accent', DEFAULT = 'cyberpunk', STYLE_ID = 'dt-accent';

  // ---- colour helpers ----
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const hexRgb = (h) => {
    let s = String(h || '').trim().replace(/^#/, '');
    if (s.length === 3) s = s.split('').map((c) => c + c).join('');
    if (!/^[0-9a-f]{6}$/i.test(s)) return null;
    const n = parseInt(s, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const rgbHex = (r, g, b) => '#' + [r, g, b].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
  const rgbStr = (h) => (hexRgb(h) || [0, 0, 0]).join(', ');
  function toHsl(hex) {
    const [r, g, b] = (hexRgb(hex) || [0, 0, 0]).map((v) => v / 255);
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
    let h = 0, s = 0;
    if (mx !== mn) {
      const d = mx - mn;
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
      h *= 60;
    }
    return [h, s * 100, l * 100];
  }
  function fromHsl(h, s, l) {
    h = ((h % 360) + 360) % 360; s = clamp(s, 0, 100) / 100; l = clamp(l, 0, 100) / 100;
    const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
    const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return rgbHex(f(0) * 255, f(8) * 255, f(4) * 255);
  }
  const rgba = (h, a) => `rgba(${rgbStr(h)}, ${a})`;

  // ---- presets ----
  // accent: the main colour · soft: its lighter twin (links, glows) · pale: text on it · violet / magenta: the second
  // and third colours · grad: the brand gradient's stops · bg (optional): the deep background and its glass.
  const PRESETS = [
    { id: 'cyberpunk', name: 'Cyberpunk (mavi-mor)', swatch: ['#5ce1f0', '#3fb6ec', '#7c5cf5', '#b04fe8'] },
    {
      id: 'derin', name: 'Derin Ajans (lime)', swatch: ['#d4ff00', '#7dffb0', '#3fb6ec', '#12205c'],
      accent: '#d4ff00', soft: '#e3ff4d', pale: '#f3ffc2', violet: '#3fb6ec', magenta: '#7dffb0', cyan: '#d4ff00',
      grad: ['#d4ff00', '#7dffb0', '#3fb6ec'],
      bg: { bg: '#050a1f', deep: '#03061a', surface: '#0a1a4a', panel: '#0c1a48', glassTop: '#12205c', bloom: '#12205c', dim2: '#24357a' },
    },
    {
      id: 'sunset', name: 'Gün batımı', swatch: ['#ffb36b', '#ff7a45', '#ff4f8b', '#e040a0'],
      accent: '#ff7a45', soft: '#ffb36b', pale: '#ffe2c4', violet: '#ff4f8b', magenta: '#e040a0', cyan: '#ffb36b',
      grad: ['#ffb36b', '#ff7a45', '#ff4f8b'],
    },
    {
      id: 'emerald', name: 'Zümrüt', swatch: ['#4cf2c0', '#10d9a0', '#14b8c4', '#0e8f8a'],
      accent: '#10d9a0', soft: '#4cf2c0', pale: '#c8fbea', violet: '#14b8c4', magenta: '#0ea5a0', cyan: '#4cf2c0',
      grad: ['#4cf2c0', '#10d9a0', '#14b8c4'],
    },
  ];

  // "Özel": one colour, the rest made from it in HSL.
  function custom(hex) {
    const [h, s, l] = toHsl(hex);
    const accent = hexRgb(hex) ? rgbHex(...hexRgb(hex)) : '#3fb6ec'; // exactly the colour picked
    const soft = fromHsl(h, Math.max(s, 60), clamp(l + 14, 60, 76));
    const pale = fromHsl(h, Math.max(s, 50), 90);
    const violet = fromHsl(h + 40, Math.max(s, 60), clamp(l, 50, 64));
    const magenta = fromHsl(h + 80, Math.max(s, 55), clamp(l, 48, 62));
    return { id: 'custom', name: 'Özel', accent, soft, pale, violet, magenta, cyan: soft, grad: [soft, accent, violet] };
  }

  function vars(p) {
    const v = {
      '--accent': p.accent, '--accent-rgb': rgbStr(p.accent),
      '--accent-soft': p.soft, '--accent-soft-rgb': rgbStr(p.soft),
      '--accent-pale': p.pale,
      '--cyan': p.cyan, '--cyan-rgb': rgbStr(p.cyan),
      '--violet': p.violet, '--violet-rgb': rgbStr(p.violet),
      '--magenta': p.magenta,
      '--logo-rgb': rgbStr(p.soft),
      '--hue0': p.soft, '--hue1': p.accent, '--hue2': p.violet, '--hue4': p.magenta,
      '--code-cursor': p.soft,
      '--selection': p.accent,
      '--st-busy': p.soft, '--st-busy-rgb': rgbStr(p.soft),
      '--st-tool': p.violet, '--st-tool-rgb': rgbStr(p.violet),
      '--grad': `linear-gradient(90deg, ${p.grad.join(', ')})`,
      '--grad-soft': `linear-gradient(90deg, ${rgba(p.grad[0], 0.18)}, ${rgba(p.grad[1], 0.14)}, ${rgba(p.grad[2], 0.18)})`,
      '--glow': `0 0 0 1px ${rgba(p.soft, 0.18)}, 0 0 18px ${rgba(p.accent, 0.22)}, 0 0 34px ${rgba(p.violet, 0.14)}`,
      '--glow-sm': `0 0 10px ${rgba(p.soft, 0.25)}`,
    };
    const b = p.bg;
    if (b) {
      Object.assign(v, {
        '--bg': b.bg, '--bg-rgb': rgbStr(b.bg), '--deep-rgb': rgbStr(b.deep), '--surface-rgb': rgbStr(b.surface),
        '--panel-rgb': rgbStr(b.panel), '--glass-top-rgb': rgbStr(b.glassTop), '--bloom': b.bloom,
        '--dim2': b.dim2, '--dim2-rgb': rgbStr(b.dim2), '--idle-deep': b.surface, '--code-bg': b.bg,
        '--st-idle': b.dim2, '--st-idle-rgb': rgbStr(b.dim2),
      });
    }
    return v;
  }

  // ---- state ----
  const raw = () => { try { return localStorage.getItem(KEY) || ''; } catch { return ''; } };
  const customColor = () => { const m = /^custom:(#[0-9a-f]{6})$/i.exec(raw()); return m ? m[1].toLowerCase() : null; };
  const get = () => { const v = raw(); if (customColor()) return 'custom'; return PRESETS.some((p) => p.id === v) ? v : DEFAULT; };
  const resolve = () => { const id = get(); return id === 'custom' ? custom(customColor()) : PRESETS.find((p) => p.id === id); };

  function apply() {
    const p = resolve();
    const host = document.head || document.documentElement;
    let el = document.getElementById(STYLE_ID);
    if (!p || !p.accent) { // cyberpunk: the terminal theme's own colours, nothing over them
      if (el) el.remove();
    } else {
      if (!el) { el = document.createElement('style'); el.id = STYLE_ID; }
      el.textContent = ':root{' + Object.entries(vars(p)).map(([k, x]) => `${k}:${x} !important`).join(';') + '}';
      host.appendChild(el); // last in <head>, after any theme sheet
    }
    document.documentElement.dataset.accent = p ? p.id : DEFAULT;
    window.dispatchEvent(new CustomEvent('accent', { detail: get() }));
  }
  function set(id, color) {
    try {
      if (id === 'custom') {
        const c = hexRgb(color) ? '#' + String(color).replace(/^#/, '').toLowerCase() : customColor() || '#d4ff00';
        localStorage.setItem(KEY, `custom:${c.length === 4 ? rgbHex(...hexRgb(c)) : c}`);
      } else if (!id || id === DEFAULT || !PRESETS.some((p) => p.id === id)) localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, id);
    } catch {}
    apply();
  }

  window.addEventListener('storage', (e) => { if (e.key === KEY || e.key === null) apply(); });
  // A late theme sheet (inserted after this ran) must not end up after ours: move ours last again once the page is in.
  document.addEventListener('DOMContentLoaded', () => { const el = document.getElementById(STYLE_ID); if (el) (document.head || document.documentElement).appendChild(el); });

  window.DTAccent = {
    list: PRESETS.map(({ id, name, swatch }) => ({ id, name, swatch })).concat([{ id: 'custom', name: 'Özel', swatch: null }]),
    get, set, apply, DEFAULT,
    color: () => (get() === 'custom' ? custom(customColor()).accent : (resolve().accent || '#3fb6ec')),
    customColor,
  };
  apply();
})();
