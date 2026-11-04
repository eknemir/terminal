# Kare Saati: HTML ile Kare Kare Render

Gerçek MP4 üretmenin en güvenilir yolu, animasyonu "zaman" yerine "kare numarası" üzerinden yazmaktır. Her kare, önceki kareler oynatılmadan hesaplanabilir. Böylece render makineden bağımsız, her seferinde aynı sonucu verir.

## İçindekiler
1. Neden kare saati
2. Kalıp (HTML)
3. Render (Playwright + ffmpeg)
4. Şeffaf çıktı
5. Kontrol listesi

## 1. Neden kare saati

Zamana bağlı CSS animasyonu, `setTimeout`, `Date.now()` ve `requestAnimationFrame` hesabı render sırasında kayar: ekran görüntüsü alma süresi animasyon saatini bozar. Kare numarası ise sabittir. Rastgelelik de seed'li olmalı, yoksa gren ve titreme her render'da farklı çıkar.

## 2. Kalıp

```html
<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<style>
  /* Fontları @font-face ile göm, renkleri :root içinde tanımla */
  :root { --zemin: #1d2330; --metin: #e8e2d0; --vurgu: #d9a441; }
  html, body { margin: 0; width: 1080px; height: 1920px; background: var(--zemin); overflow: hidden; }
</style>
</head>
<body>
<h1 id="baslik" style="position:absolute;left:90px;top:760px;margin:0;font:900 130px/1 serif;color:var(--metin)">İstanbul</h1>
<script>
const FPS = 30, TOPLAM = 300;           // 10 saniye
const klamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));

// cubic-bezier çözücü (CSS ile aynı eğriler)
function bezier(x1, y1, x2, y2) {
  const cx = 3*x1, bx = 3*(x2-x1) - cx, ax = 1 - cx - bx;
  const cy = 3*y1, by = 3*(y2-y1) - cy, ay = 1 - cy - by;
  const X  = t => ((ax*t + bx)*t + cx)*t;
  const Y  = t => ((ay*t + by)*t + cy)*t;
  const dX = t => (3*ax*t + 2*bx)*t + cx;
  return x => {
    let t = klamp(x);
    for (let i = 0; i < 8; i++) {
      const e = X(t) - x, d = dX(t);
      if (Math.abs(e) < 1e-5 || Math.abs(d) < 1e-6) break;
      t -= e / d;
    }
    return Y(klamp(t));
  };
}
const dolly = bezier(0.55, 0, 0.1, 1);
const terk  = bezier(0.7, 0, 0.84, 0);

// kare aralığından değere: interpolate(kare, [başla, bitir], [a, b], eğri)
function interpolate(f, [f0, f1], [a, b], ease = x => x) {
  return a + (b - a) * ease(klamp((f - f0) / (f1 - f0)));
}

// seed'li rastgelelik (mulberry32): aynı kare, aynı sayı
function rastgele(seed) {
  let t = seed + 0x6D2B79F5;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// ikili çekim: her 2 karede bir güncelle
const ikili = f => Math.floor(f / 2) * 2;

// Her kare yalnız bu fonksiyona bağlı. Dışarıdan çağrılır.
window.renderFrame = function (f) {
  const baslik = document.getElementById('baslik');
  baslik.style.transform = `translateX(${interpolate(f, [9, 54], [-120, 0], dolly)}px)`;
  baslik.style.opacity = interpolate(f, [9, 21], [0, 1]);
  // gren / titreme için: rastgele(f) kullan (seed = kare numarası)
};

// Tarayıcıda önizleme için (render'da KULLANILMAZ)
if (!window.__RENDER__) {
  let baslangic = performance.now();
  (function dongu(t) {
    const f = Math.floor(((t - baslangic) / 1000) * FPS) % TOPLAM;
    window.renderFrame(f);
    requestAnimationFrame(dongu);
  })(baslangic);
}
</script>
</body>
</html>
```

Yapıyı kendi sahnene göre genişlet: her sahne için kare aralıklarını bir olay listesi olarak yaz, `renderFrame` içinde bu listeye göre öğeleri konumlandır.

## 3. Render (Playwright + ffmpeg)

Kontrol et: `which ffmpeg node` ve `python3 -c "import playwright"` (ya da `npx playwright --version`).

Kare kare render akışı:

1. `window.__RENDER__ = true` değerini sayfa yüklenmeden önce ayarla (önizleme döngüsü çalışmasın).
2. `await document.fonts.ready`, ardından kullandığın her font için `document.fonts.check(...)` ile yüklendiğini doğrula. Yüklenmediyse render'ı durdur.
3. Her kare için: `page.evaluate(f => window.renderFrame(f), i)` çağır, sonra `page.screenshot({ path: 'kare_%04d.png' })` al.
4. Kareleri birleştir:

```bash
ffmpeg -framerate 30 -i kare_%04d.png -c:v libx264 -pix_fmt yuv420p -crf 18 -preset veryfast video.mp4
```

Sesi eklemek için: `-i ses.wav -c:a aac -b:a 192k -shortest`.

Prototip için önce 5-8 saniyelik aralığı ve yarım çözünürlüğü render et. Sabit kareleri (`0`, `30`, `90`) dosyaya alıp gözünle bak. Tam render, sahne beğenildikten sonra.

Yaklaşık süre: tam çözünürlükte kare başına yarım saniye civarı. 30 saniyelik dikey video onlarca dakikayı bulabilir, uzun render'ı arka planda çalıştır.

## 4. Şeffaf çıktı

Premiere, CapCut ya da DaVinci üstüne bindirilecek grafik için siyah zemin teslim etme, gerçek alfa kanalı ver.

- Sayfa ve `body` arka planını `transparent` yap.
- Ekran görüntüsünü `page.screenshot({ omitBackground: true })` ile al.
- Birleştirme:

```bash
ffmpeg -framerate 30 -i kare_%04d.png -c:v prores_ks -profile:v 4444 -pix_fmt yuva444p10le overlay.mov
```

Alternatif olarak web için WebM alpha: `-c:v libvpx-vp9 -pix_fmt yuva420p overlay.webm`.

Teslimden önce çıktıyı bir editörde renkli bir klibin üstüne koyup şeffaflığı gözünle doğrula.

## 5. Kontrol listesi

- [ ] Animasyon yalnız kare numarasına bağlı mı? (CSS animasyonu, `setTimeout`, `Date.now()` yok)
- [ ] Rastgelelik seed'li mi?
- [ ] Fontlar gömülü ve `document.fonts.check` ile doğrulandı mı?
- [ ] Türkçe test cümlesi ve BÜYÜK HARF hali doğru çıkıyor mu?
- [ ] Sabit kareler (başlangıç, en yoğun an, bitiş) gözle kontrol edildi mi?
- [ ] `ffprobe` ile süre, fps ve çözünürlük doğrulandı mı?
