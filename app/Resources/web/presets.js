/* Efekt presetleri galerisi — #presets-mount içine kurulur. */
(function () {
  'use strict';

  var CATS = ['Yazı', 'Grafik', 'Renk', 'Geçiş', 'Hareket', 'CTA'];
  var BASE = "HyperFrames ile (önce /hyperframes skill'ini oku) 1080x1920, 30 fps bir Reels kompozisyonu hazırla. Bu efekt kullanıcının kendi videosunun (konuşan kafa çekimi) üzerine bindirilecek: kullanıcının videosunu en alt katmana tam kadraj (object-fit: cover) koy, efekti üst katmanlarda kur; video yoksa yer tutucu bir klip kullan ve bana dosya yolunu sor. Instagram güvenli alanı: yazı ve arayüz öğeleri üstten 250px, alttan 420px, sağdan 140px, soldan 60px boşluk bırakarak içeride kalsın (aksi belirtilmedikçe). Renkler: lacivert #07080F, cyan #5CE1F0, mor #7C5CF5, pembe #E9A6F7, vurgu sarısı #FFD23F. ";
  function REG(terms) {
    return "Elle yazmadan önce HyperFrames registry'de benzer hazır blok/bileşen ara (/hyperframes-registry, arama terimleri: " + terms + "); uygun bir blok varsa kur ve bu tarife göre uyarla, yoksa sıfırdan yaz. ";
  }
  var END = " Türkçe karakterler (ğ ü ş ı ö ç İ) doğru görünsün; fontları yerel yükle. Tüm animasyonlar tek bir paused GSAP timeline'da, seek-safe ve deterministik olsun (Math.random yok, gerekiyorsa sabit seed). Bitince `hyperframes check` ile doğrula, efektin ortasından bir snapshot al ve MP4 render et.";

  // Önizleme işaretlemesi: harfleri --i indeksli span'lere böl
  function L(text, start) {
    var s = start || 0;
    return Array.prototype.map.call(text, function (ch, i) {
      return '<span style="--i:' + (s + i) + '">' + (ch === ' ' ? '&nbsp;' : ch) + '</span>';
    }).join('');
  }
  function rep(n, fn) { var o = ''; for (var i = 0; i < n; i++) o += fn(i); return o; }

  function P(id, name, cat, desc, terms, body, pv) {
    return { id: id, name: name, category: cat, description: desc, pv: pv || '',
      template: BASE + REG(terms) + body + END };
  }

  var PRESETS = [
    P('gravity-drop', 'Gravity Drop', 'Yazı', 'Dev harfler yukarıdan yerçekimiyle düşüp sekerek oturur; üstte küçük serif italik etiket.',
      '"gravity", "drop", "bounce text", "kinetic typography"',
      "Efekt: Gravity Drop başlık. Üst güvenli alanda (y≈260–620px), soldan 60px hizalı tek bir dev kelime: {kelime} — kalın grotesk (ör. Inter Black / Anton), büyük harf, 300–360px, beyaz, hafif gölge (0 12px 40px rgba(0,0,0,.35)); kelime ekrana sığmazsa font boyunu otomatik küçült. Kelimenin hemen üstünde küçük serif italik etiket (Playfair Display Italic, 64px, beyaz %90): {metin}. Zamanlama: t=0.00 etiket 0.35 sn'de opacity 0→1 ve y +12→0 (power2.out). t=0.15'ten itibaren her harf ayrı ayrı 0.07 sn arayla y −1400px'ten düşsün: düşüş 0.45 sn ease 'power2.in', yere değince scaleY 0.85 / scaleX 1.08 squash (0.06 sn), ardından iki sekme: −90px (0.18 sn power2.out / 0.18 sn power2.in) ve −25px (0.12+0.12 sn), sonra dursun. Her harfe ±3° deterministik rastgele rotate verip oturunca 0°'a dönsün. Efekt toplam ~2.5 sn ekranda kalsın, çıkışta harfler 0.3 sn'de y +60px ve opacity 0 (power2.in, 0.03 sn stagger).",
      '<i class="gd-l ser">gravity</i><b class="gd-w">' + L('DROP') + '</b>'),

    P('icon-strike', 'Icon Strike', 'Grafik', 'Uygulama ikonları pop ile belirir, kırmızı çapraz çizgi üstünü çizer, ikonlar düşerek kaybolur.',
      '"app icon", "strike", "cross out", "pop in"',
      "Efekt: Icon Strike. Sol üst güvenli alanda (x=60px, y≈280px'ten başlayarak) alt alta 2–3 adet uygulama ikonu kartı: 200x200px, köşe yarıçapı 46px (iOS squircle), altında 34px beyaz küçük etiket. İkonları registry/media-use ile marka logosu olarak çöz; bulunamazsa sade renkli yer tutucu kare + baş harf kullan. İkon isimleri: {metin} (virgülle ayrılmış liste). Zamanlama: ikonlar 0.12 sn arayla scale 0→1.12→1 pop (0.35 sn, 'back.out(2.2)'). t≈0.9 sn'de kırmızı (#FF3B4E) 18px kalınlığında, yuvarlak uçlu çapraz çizgi tüm ikonların üzerinden sol üstten sağ alta 0.22 sn'de çizilsin (scaleX 0→1, transform-origin sol, 'power3.out'), hafif kırmızı glow. Çizgi bitince 0.15 sn sonra ikonlar sırayla düşsün: y +900px, rotate 25–40°, opacity 1→0, 0.6 sn 'power2.in', 0.06 sn stagger; çizgi de 0.2 sn'de solsun. Toplam ~2 sn.",
      '<i class="is-a"></i><i class="is-b"></i><i class="is-ln"></i>'),

    P('kinetic-hook', 'Kinetic Hook', 'Yazı', 'İki satırlık dev kalın hook; ikinci satır sarı, harfler tek tek çarparak girer.',
      '"kinetic typography", "hook", "slam text", "title"',
      "Efekt: Kinetic Hook başlık (videonun ilk 2 saniyesi). Üst güvenli alanda soldan 60px hizalı iki satır: 1. satır {metin} beyaz, 2. satır {kelime} sarı #FFD23F; ikisi de ekstra kalın grotesk (Inter Black / Anton), büyük harf, 1. satır ~190px, 2. satır ~260px, satır aralığı 0.9, harf aralığı −2%; satırlar ekrana sığmazsa font boyunu küçült. Zamanlama: harfler sırayla 0.045 sn stagger ile 'slam' yapsın — her harf scale 2.6→0.92→1, opacity 0→1, 0.22 sn, ease 'power4.out' ile, ilk harf t=0.05'te. 2. satır, 1. satır bittikten 0.08 sn sonra başlasın; 2. satırın son harfi oturduğunda tüm blok 0.12 sn'lik küçük bir kamera sarsıntısı (x ±6px, azalan) yapsın. Ekranda ~2 sn kalsın, çıkışta satırlar 0.25 sn'de y −40px ve opacity 0.",
      '<b class="kh kh1">' + L('KİNETİK') + '</b><b class="kh kh2">' + L('HOOK', 7) + '</b>'),

    P('grade-slider', 'Grade Slider', 'Renk', 'Önce/sonra karşılaştırması: siyah-beyaz ↔ renkli, sürüklenen dikey tutamak ve ÖNCE/SONRA etiketleri.',
      '"before after", "compare slider", "wipe", "color grade"',
      "Efekt: Grade Slider (önce/sonra). Kullanıcının videosunun iki kopyası üst üste: alttaki renkli (SONRA, hafif sıcak grade: kontrast +10, doygunluk +15), üstteki siyah-beyaz (ÖNCE, grayscale(1) contrast(1.1)) ve clip-path inset ile sol tarafa kırpılmış. Kesim çizgisinde 6px sarı #FFD23F dikey çizgi, çizginin ortasında (y≈1150px) 84px sarı daire tutamak, içinde koyu ‹ › oku. Alt güvenli alanın üstünde (y≈1380px) iki küçük hap etiket: sol 'ÖNCE', sağ 'SONRA' — 30px kalın beyaz yazı, rgba(7,8,15,.75) arka plan, 999px radius. Zamanlama: t=0 tutamak x=1020px'ten 0.3 sn'de girsin; sonra tutamak 1.2 sn'de x=60px'e kaysın ('power2.inOut'), 0.3 sn beklesin, 1.2 sn'de x=900px'e geri dönsün; kesim çizgisi tutamağa bağlı. Etiketler ilgili taraf görünürken opacity 1, kapandığında 0.4 olsun. Toplam ~3.2 sn, çıkışta tutamak 0.25 sn'de solsun ve görüntü tamamen renkli kalsın. Etiket metni için {metin} boşsa ÖNCE/SONRA kullan.",
      '<i class="gs-bw"></i><i class="gs-h"><b>‹›</b></i><em class="gs-p gs-p1">ÖNCE</em><em class="gs-p gs-p2">SONRA</em>'),

    P('prompt-bar', 'Prompt Bar', 'Grafik', 'Yuvarlak beyaz giriş kutusu; parıltı ikonu, harf harf yazılan metin ve sarı gönder düğmesi.',
      '"prompt bar", "ai input", "typing", "search bar", "chat input"',
      "Efekt: Prompt Bar. Üst güvenli alanda (y≈280px) soldan 60px, sağdan 140px boşluklu beyaz hap şeklinde giriş kutusu: yükseklik 120px, radius 60px, gölge 0 16px 48px rgba(0,0,0,.35). Solda turuncu-mercan (#E86A5A) 4 kollu parıltı/asterisk ikonu (48px), ortada 52px koyu (#111) yazı, sağda 84px sarı #FFD23F daire gönder düğmesi, içinde siyah ↑ oku. Zamanlama: t=0 kutu y −40px ve scale 0.92'den 0.35 sn 'back.out(1.6)' ile girsin. t=0.4'ten itibaren {metin} karakter karakter yazılsın (her karakter ~0.05 sn, deterministik küçük tempo farkları), yazının sonunda 1 sn periyotla yanıp sönen ince imleç. Yazı bitince 0.25 sn sonra gönder düğmesi tıklansın: scale 1→0.85→1 (0.18 sn) ve düğmeden beyaz halka dalgası; ardından kutu 0.3 sn'de y −30px ve opacity 0. Uzun metinde yazı kutudan taşmasın, sola kaysın.",
      '<div class="pb"><i class="pb-s">✳</i><span class="pb-t">prompt bar</span><i class="pb-b">↑</i></div>'),

    P('playing-grid', 'Playing Grid', 'Grafik', 'Eğik bir ızgarada küçük 9:16 telefon video kartları süzülerek ve pop ile belirir.',
      '"video grid", "card wall", "mosaic", "tilted grid", "phone mockup"',
      "Efekt: Playing Grid. Ekranın üst-sol yarısında (x 60–760px, y 260–1000px) −8° döndürülmüş 3 sütunlu ızgara; 6–9 adet küçük 9:16 kart (≈200x356px), radius 22px, 4px beyaz kenarlık, gölge. Kartların içinde kullanıcının verdiği kısa klipler oynasın (muted, loop); klip verilmezse kullanıcının ana videosundan farklı anlara ait kesitleri kullan. Her kartın altında küçük etiket olabilir: {metin}. Zamanlama: kartlar köşegen sırayla 0.07 sn stagger ile scale 0→1.08→1, rotate −12°→0° (0.4 sn 'back.out(1.8)') pop yapsın; tüm ızgara efekt boyunca y −40px ve rotate −8°→−6° yavaşça süzülsün (3 sn 'sine.inOut'). Çıkışta kartlar 0.04 sn stagger ile scale 0.6 ve opacity 0 (0.3 sn). Yüzü kapatmasın: ızgara konuşan kişinin başının yanında/üstünde kalsın.",
      '<div class="pg">' + rep(6, function (i) { return '<i style="--i:' + i + '"></i>'; }) + '</div>'),

    P('giant-captions', 'Giant Captions', 'Yazı', 'Konuşanın arkasında tek dev kelime + altında zarif serif el yazısı kelime.',
      '"giant text behind subject", "depth text", "text behind person", "script caption"',
      "Efekt: Giant Captions (derinlikli yazı). Üstte tek bir dev kelime: {kelime} — ekstra kalın grotesk, büyük harf, ~300px, beyaz, ekran genişliğine yayılsın (soldan 60px, sağdan 140px). Kelime kişinin ARKASINDA kalsın: kullanıcının videosundan konuşan kişiyi maskele (media-use / remove-background ile matte çıkar), katman sırası video → dev kelime → kişi matte'i. Başın üst kısmı kelimenin alt kısmını kapatacak şekilde y≈300–600px. Altında, göğüs hizasında (y≈1200px) zarif serif italik/script kelime: {metin} (Playfair Display Italic veya benzeri, 130px, sıcak altın #F5D98A, hafif gölge) — bu kişinin ÖNÜNDE. Zamanlama: dev kelime t=0'da scale 1.35→1, blur 12px→0, opacity 0→1 (0.5 sn 'expo.out'); script kelime t=0.3'te soldan sağa clip-path ile yazılıyormuş gibi açılsın (0.6 sn 'power2.out'). ~2.5 sn ekranda, çıkışta ikisi de 0.3 sn'de opacity 0.",
      '<b class="gc-g">GIANT</b>||<i class="gc-s ser">captions.</i>'),

    P('file-drop', 'File Drop', 'Grafik', 'Bir dosya kartı ("ham.mp4") uçarak kesikli çizgili bırakma alanına düşer.',
      '"file upload", "drag and drop", "dropzone", "file card"',
      "Efekt: File Drop. Sol üst güvenli alanda (x=60px, y≈320px) 560x420px kesikli kenarlıklı (4px, dash 18/12, beyaz %60) bırakma alanı, radius 36px, arka plan rgba(7,8,15,.6) + backdrop blur 12px; altında 40px kalın beyaz yazı: {metin} (boşsa 'Ham görüntüyü buraya bırak'). Dosya kartı: beyaz, 360x130px, radius 22px; solda mavi dosya ikonu, sağda dosya adı {kelime} (boşsa 'ham.mp4', 38px kalın) ve altında gri '24 MB · 0:28' (28px). Zamanlama: alan t=0'da 0.3 sn'de scale 0.95→1 ve opacity 0→1. t=0.25'te kart sağ üstten (x +600, y −500, rotate 18°) yay çizerek alanın ortasına uçsun: 0.6 sn 'power3.out', inişte scale 1.06→1 'back.out(2)'. Kart değdiği anda alan kenarlığı sarı #FFD23F'ye dönsün, 0.3 sn sarı glow nabzı ve kart altında ince bir yükleme çubuğu 0.6 sn'de dolsun. ~2.2 sn ekranda, çıkışta hepsi 0.3 sn'de scale 0.9 ve opacity 0.",
      '<div class="fd-z"><span>Ham görüntüyü<br>buraya bırak</span></div><div class="fd-f"><i></i><b>ham.mp4</b><small>24 MB · 0:28</small></div>'),

    P('nle-timeline', 'NLE Timeline', 'Grafik', 'Altta kurgu programı zaman çizelgesi: renkli klip blokları, dalga formu, ilerleyen oynatma kafası ve timecode.',
      '"timeline", "video editor ui", "nle", "waveform", "playhead"',
      "Efekt: NLE Timeline arayüzü. Alt güvenli alanın hemen üstünde (y≈1150–1480px), soldan 60px sağdan 140px boşluklu koyu panel: rgba(10,11,20,.92), radius 28px, 2px ince kenarlık. Panel üst satırı: solda 'Timeline' (30px beyaz), sağda canlı timecode HH:MM:SS:FF (30px monospace, sarı #FFD23F) — kompozisyonun gerçek zamanından hesaplansın. Altında V2/V1/A1 iz etiketleri: V2'de renkli klip blokları (sarı #FFD23F, açık turuncu #F5C08A, mercan #F0506A, cyan #5CE1F0; radius 10px, aralarında 8px boşluk), V1'de küçük film şeridi kareleri, A1'de kullanıcının sesinden üretilmiş gerçek dalga formu (hyperframes beats/audio verisi; yoksa deterministik sahte dalga). Beyaz oynatma kafası (4px çizgi + üstte küçük üçgen) soldan sağa lineer ilerlesin, timecode ile senkron. Giriş: panel 0.4 sn'de y +120px'ten 'power3.out' ile; klip blokları 0.05 sn stagger ile scaleX 0→1. Etiket metni: {metin}. ~3 sn ekranda, çıkış 0.3 sn y +80px ve opacity 0.",
      '<div class="nl"><div class="nl-h"><b>Timeline</b><span>00:00:08:26</span></div><div class="nl-r"><i></i><i></i><i></i><i></i></div><div class="nl-w"></div><i class="nl-p"></i></div>'),

    P('film-look', 'Film Look', 'Renk', 'Letterbox bantları kayarak gelir; sıcak sinematik grade, gren, kırmızı REC noktalı timecode ve "35MM · 24 FPS".',
      '"film look", "letterbox", "cinematic grade", "film grain", "rec timecode"',
      "Efekt: Film Look. Kullanıcının videosuna sinematik görünüm: t=0'da üst ve alt siyah letterbox bantları (her biri 220px, 2.39:1 hissi) 0.5 sn 'expo.inOut' ile ekran dışından kayarak gelsin. Aynı anda 0.6 sn'de sıcak grade'e geçiş: hafif turuncu-teal split tone (gölgeler teal, ışıklar sıcak), kontrast +12, doygunluk −8, hafif vinyet ve ince hareketli film greni (opacity 0.12, her karede deterministik offset); registry'de film grain/LUT bloğu varsa onu kullan. Üst bantta solda kırmızı REC noktası (18px, 1 sn periyotla yanıp sönen) + canlı timecode HH:MM:SS:FF (34px monospace beyaz); alt bantta ortada '35MM · 24 FPS' (28px, harf aralığı +20%, beyaz %80) — bu bant içi yazılar güvenli alan istisnasıdır. Ek yazı istenirse: {metin}. ~3 sn sonra bantlar 0.4 sn'de geri çekilsin ve grade normale dönsün.",
      '<i class="fl-g"></i><i class="fl-n"></i><i class="fl-b fl-t"></i><i class="fl-b fl-bt"></i><span class="fl-rec">00:00:10:13</span><span class="fl-fps">35MM · 24 FPS</span>'),

    P('storyboard-deck', 'Storyboard Deck', 'Grafik', 'Numaralı polaroid kartlar alt kısımda yay çizerek yelpaze gibi açılır.',
      '"polaroid", "card fan", "storyboard", "photo stack"',
      "Efekt: Storyboard Deck. Alt güvenli alanın üstünde (merkez x=470px, y≈1350px) 5–6 adet polaroid kart: 230x290px beyaz çerçeve (12px kenar, alt kenar 50px), içinde kullanıcının videosundan farklı anlara ait kareler (frame grab) ya da verdiği görseller; alt kenarda sol tarafta '01, 02 …' numarası (30px kalın siyah) ve kısa yazı {metin}. Zamanlama: kartlar t=0'da tek deste halinde alttan (y +500px) 0.35 sn'de gelsin, sonra 0.06 sn stagger ile ortak bir pivot (kartların 3 kat altında) etrafında −32°…+32° aralığında yay çizerek yelpaze açılsın (0.6 sn 'back.out(1.4)'). Açık halde kartlar 2 sn hafifçe 'nefes' alsın (rotate ±1°, sine.inOut). Çıkışta deste kapanıp y +400px'e düşsün (0.4 sn 'power2.in'). Kişinin yüzünü kapatmasın.",
      '<div class="sb">' + rep(5, function (i) { return '<i style="--i:' + i + '"><b>0' + (i + 1) + '</b></i>'; }) + '</div>'),

    P('jiggle-delete', 'Jiggle Delete', 'Hareket', 'iOS düzenleme modu: dock\'taki ikonlar sallanır, biri × alır ve pop ile kaybolur.',
      '"ios jiggle", "app dock", "edit mode", "delete icon"',
      "Efekt: Jiggle Delete. Alt güvenli alanın üstünde (y≈1250px) soldan 60px sağdan 140px boşluklu beyaz %92 dock paneli, radius 44px, gölge; sol üst köşede küçük gri 'EDIT MODE', sağ üstte '{metin}' sayaç yazısı (ör. '4 uygulama'). İçinde 4 uygulama ikonu (160px, radius 36px, altında 26px etiket) — marka logolarını media-use ile çöz, bulunamazsa sade renkli kare + baş harf. Zamanlama: panel 0.35 sn'de alttan 'back.out(1.6)' ile girsin; t=0.5'te tüm ikonlar iOS tarzı sallansın (rotate ±2.5°, 0.13 sn periyot, komşu ikonlar ters fazda, deterministik). Silinecek ikon ({kelime}) sol üstünde gri × rozeti pop yapsın (scale 0→1, 0.2 sn); t≈1.4'te × tıklansın: ikon scale 1→1.12→0 ve opacity 0 (0.3 sn 'back.in'), kalan ikonlar 0.35 sn 'power3.out' ile boşluğu kapatacak şekilde kaysın ve sayaç bir azalsın. ~2.5 sn, çıkışta panel 0.3 sn'de aşağı kaysın.",
      '<div class="jd"><i></i><i class="x"></i><i></i><i></i></div>'),

    P('eyedropper-grade', 'Eyedropper Grade', 'Renk', 'Damlalık imleci görüntüden renk alır; 5 renk + hex kodlu palet alttan kayar.',
      '"color palette", "eyedropper", "swatches", "color picker"',
      "Efekt: Eyedropper Grade. Bir damlalık (eyedropper) imleci — beyaz ince çizgili ikon + 90px büyüteç halkası — videonun üzerinde 0.5 sn'de bir noktaya süzülsün ('power2.inOut'), tıkladığında halka o noktanın rengiyle dolsun ve küçük bir nabız atsın. Ardından alt güvenli alanın üstünde (y≈1300px) soldan 60px sağdan 140px boşluklu beyaz palet kartı alttan 0.45 sn 'back.out(1.4)' ile kaysın: 5 renk kutusu (radius 18px, 8px aralık), her birinin altında 24px monospace hex kodu. Renkleri kullanıcının videosundan gerçek örnekle: ilk karedeki ten, arka plan, ışık ve gölge tonlarından 5 renk (k-means veya basit örnekleme, deterministik); kutular 0.06 sn stagger ile soldan dolsun. Başlık yazısı istenirse: {metin}. ~2.5 sn ekranda; çıkışta palet 0.3 sn'de aşağı kaysın. İsteğe bağlı: palet çıkarken videoya bu renklerden türetilmiş hafif bir grade 0.4 sn'de uygulanabilir.",
      '<i class="ed-c"></i><div class="ed-p">' + ['#DB997D', '#A6BDC0', '#754F40', '#9C6A1E', '#19130F'].map(function (c) { return '<i style="background:' + c + '"><b>' + c + '</b></i>'; }).join('') + '</div>'),

    P('title-card', 'Title Card', 'Geçiş', 'Video siyah zemin üzerinde çerçeveli bir karta küçülür; üstte büyük serif başlık ve timecode.',
      '"title card", "frame shrink", "video in frame", "chapter title"',
      "Efekt: Title Card geçişi. t=0'da kullanıcının tam ekran videosu 0.6 sn 'expo.inOut' ile küçülerek siyah (#000) zemin üzerinde ortalanmış bir karta dönüşsün: scale ≈0.62, y +180px, radius 24px, 4px açık krem (#F3E6C8) çerçeve, hafif gölge; video kart içinde oynamaya devam etsin. Kartın üstünde (y≈300–460px) büyük serif başlık: {metin} (Playfair Display / Cormorant, 120px, krem #F3E6C8, harf aralığı +2%), başlığın hemen üstünde küçük canlı timecode HH:MM:SS:FF (30px monospace, krem %70). Başlık 0.4 sn'de opacity 0→1 ve y +20→0 (power2.out), timecode 0.1 sn sonra. ~2 sn bekledikten sonra yazılar 0.25 sn'de solsun ve kart 0.6 sn 'expo.inOut' ile tekrar tam ekrana büyüsün (radius ve çerçeve kaybolsun).",
      '<span class="tc-tc">00:00:14:28</span><b class="tc-t">TITLE CARD</b>'),

    P('reel-feed', 'Reel Feed', 'Geçiş', 'Video küçülerek bir telefon Reel arayüzüne dönüşür (beğeni/yorum/paylaş), sonra tekrar tam ekrana büyür.',
      '"phone mockup", "reels ui", "social feed", "instagram ui"',
      "Efekt: Reel Feed geçişi. t=0'da kullanıcının videosu 0.55 sn 'expo.inOut' ile küçülerek siyah zeminde bir telefon Reel ekranına dönüşsün: scale ≈0.72, radius 40px, 3px beyaz %85 kenarlık. Kartın sağ kenarında dikey Instagram Reel ikonları (beğeni kalbi, yorum balonu, paylaş uçağı, üç nokta; her biri 56px beyaz, altında 22px sayılar) 0.06 sn stagger ile sağdan kayarak gelsin; altta sol kenarda kullanıcı adı ve kısa açıklama: {metin}. t≈1.0'da kalp ikonu kırmızıya (#FF3040) dönüp scale 1→1.4→1 pop yapsın, sayacı +1 artsın. ~1.6 sn sonra arayüz 0.2 sn'de solsun ve video 0.55 sn 'expo.inOut' ile tam ekrana zoom yaparak geri dönsün. İkonları sade SVG olarak çiz (Instagram logosu kullanma).",
      '<div class="rf"><i class="rf-h">♥</i><i>●</i><i>➤</i></div>'),

    P('video-card', 'Video Card', 'Grafik', 'Köşede etiket çıkartmalı küçük resim-içinde-resim video kartı pop ile belirir.',
      '"picture in picture", "pip", "video card", "sticker label"',
      "Efekt: Video Card (PiP). Sol üst güvenli alanda (x=60px, y≈280px) 300x420px küçük video kartı: radius 24px, 5px beyaz kenarlık, gölge 0 20px 50px rgba(0,0,0,.5); içinde kullanıcının verdiği ikinci klip ({kelime} dosya yolu; yoksa ana videonun farklı bir anı) oynasın. Kartın üstünde hafif −6° dönük sarı #FFD23F çıkartma etiketi (34px ekstra kalın siyah yazı, radius 10px) ve kart altında serif italik başlık + gri küçük alt yazı: {metin}. Zamanlama: kart t=0'da scale 0→1.06→1 ve rotate −4°→0° (0.45 sn 'back.out(2)', transform-origin sol üst); çıkartma 0.2 sn sonra scale 0→1.25→1 pop; başlık 0.3 sn'de alttan kaysın. ~2.5 sn ekranda, çıkışta 0.3 sn scale 0.6 ve opacity 0.",
      '<div class="vc"><i class="vc-st">01</i><span>Video card</span></div>'),

    P('comment-cta', 'Comment CTA', 'CTA', 'Altyazı: "… için yorumlara EFEKT yaz" (serif satır + sarı anahtar kelimeli kalın satır) ve kelimeyi yazan Instagram yorum kutusu.',
      '"cta", "comment box", "instagram comment", "typing", "keyword"',
      "Efekt: Comment CTA (videonun son 3–4 saniyesi). Göğüs hizasında (y≈1150px) ortalı iki satır: 1. satır serif italik (Playfair Display Italic, 70px, sıcak altın #F5D98A): {metin} (ör. 'Listenin tamamı için'); 2. satır ekstra kalın grotesk 86px beyaz: 'yorumlara {kelime} yaz' — {kelime} sarı #FFD23F ve büyük harf. Altında, alt güvenli alanın üstünde (y≈1390px) beyaz Instagram tarzı yorum kutusu: 110px yükseklik, radius 55px, solda 56px gradyan avatar halkası, gri 'Yorum ekle…' yer tutucu, sağda mavi (#4F9CF5) 'Paylaş'. Zamanlama: 1. satır t=0'da kelime kelime 0.08 sn stagger ile y +20→0 ve blur 6→0 (0.35 sn); 2. satır t=0.5'te kelime kelime pop (scale 0.6→1.08→1, 'back.out(2)'), {kelime} en son ve 0.15 sn daha büyük vurguyla. Yorum kutusu t=0.2'de alttan 0.4 sn 'power3.out' ile girsin; t=1.4'ten itibaren yer tutucu kaybolup {kelime} harf harf yazılsın (0.08 sn/harf, imleçli), sonunda 'Paylaş' kalınlaşıp kısa nabız atsın. Videonun sonuna kadar ekranda kalsın.",
      '<i class="cc-1 ser">Listenin tamamı için</i><b class="cc-2">yorumlara <u>EFEKT</u> yaz</b><div class="ig"><i class="ig-a"></i><span class="ig-t">EFEKT</span><em>Paylaş</em></div>'),

    P('comment-drop', 'Comment Drop', 'CTA', 'Instagram tarzı yorum bildirimi düşer; "Gönderildi, DM\'ine bak" yanıtı ve kalp pop\'u.',
      '"notification", "comment reply", "instagram comment", "toast", "heart"',
      "Efekt: Comment Drop. Alt güvenli alanın üstünde (y≈1220px) soldan 60px sağdan 140px boşluklu beyaz Instagram yorum kartı, radius 32px, gölge 0 20px 50px rgba(0,0,0,.35). Satır 1: 64px gradyan halkalı avatar, '{metin}' kullanıcı adı (28px kalın) + gri 'şimdi', altında yorum metni {kelime} (34px kalın); sağda gri boş kalp. Satır 2 (48px girintili): siyah avatar, kullanıcının hesap adı + gri 'yanıt verdi', altında 'Gönderildi, DM'ine bak 📩' (30px). En altta ince ayraç ve gri 'Yorum ekle…' satırı. Zamanlama: kart t=0'da y −120px'ten 0.45 sn 'back.out(1.5)' ile düşsün (hafif −2°→0° rotate); t=0.6'da yanıt satırı y +16→0 ve opacity 0→1 (0.3 sn); t=1.1'de kalp kırmızıya #FF3040 dönüp scale 1→1.5→1 (0.35 sn 'back.out(3)') pop yapsın, etrafında 6 küçük kırmızı parçacık saçılsın (deterministik açılarla). Sonuna kadar ekranda kalsın veya 2.5 sn sonra 0.3 sn'de aşağı kayıp solsun.",
      '<div class="cd"><div class="cd-r"><i class="cd-a"></i><div><small>sen · şimdi</small><b>EFEKT</b></div><i class="cd-h">♥</i></div><div class="cd-r cd-rep"><i class="cd-a cd-a2"></i><div><small>yanıt verdi</small><b>Gönderildi, DM\'ine bak</b></div></div></div>'),

    P('effect-index', 'Effect Index', 'Grafik', 'Sağ kenarda "BU VİDEODA 01/18" kontrol listesi; o an gösterilen efekt sarıyla vurgulanır, bitenler işaretlenir.',
      '"checklist", "table of contents", "chapter index", "progress list", "sidebar"',
      "Efekt: Effect Index (video boyunca kalıcı yan liste). Sağ üstte, sağ güvenli alanın hemen içinde (sağdan 150px, y≈260px'ten başlayarak) 260px genişlikte koyu panel: rgba(7,8,15,.82), radius 18px, backdrop blur 10px, 1px ince kenarlık. Başlık satırı: solda 'BU VİDEODA' (18px kalın beyaz, harf aralığı +10%), sağda canlı sayaç '01/18' (sarı #FFD23F, monospace). Altında efekt isimleri listesi (18px, satır yüksekliği 30px, beyaz %75): {metin} (virgülle ayrılmış liste; satır sayısı ve sayaç bu listeden hesaplansın). Her bölümün başlangıç zamanını kullanıcıya sor ya da transkriptten/sahne kesimlerinden tespit et. Aktif satır sarı #FFD23F dolgulu hap içinde koyu yazıyla vurgulansın; vurgu bir sonraki satıra 0.25 sn 'power2.inOut' ile kaysın, sayaç güncellensin, biten satırların sağında küçük ✓ belirsin (scale 0→1, 0.2 sn). Panel en altta küçük gri '{kelime}' notu (ör. '18 efekt · 20 saniye'). Panel t=0'da sağdan 0.4 sn 'power3.out' ile girsin ve videonun sonuna kadar kalsın; konuşan kişinin yüzüyle çakışmasın.",
      '<div class="ei"><b>BU VİDEODA <span>01/18</span></b>' + ['Gravity drop', 'Icon strike', 'Kinetic hook', 'Grade slider', 'Prompt bar', 'Playing grid', 'Giant captions', 'File drop'].map(function (n, i) { return '<i style="--i:' + i + '">' + n + '</i>'; }).join('') + '<small>19 efekt</small></div>')
  ];

  function norm(s) { return String(s == null ? '' : s).toLocaleLowerCase('tr'); }

  function filter(list, cat, query) {
    var q = norm(query).trim();
    return (list || []).filter(function (p) {
      if (cat && cat !== 'Tümü' && p.category !== cat) return false;
      if (!q) return true;
      return norm(p.name + ' ' + p.description + ' ' + p.id + ' ' + p.category).indexOf(q) !== -1;
    });
  }

  function fillPrompt(tpl, metin, kelime) {
    var m = String(metin == null ? '' : metin).trim() || 'METNİNİZ';
    var k = String(kelime == null ? '' : kelime).trim() || 'EFEKT';
    return String(tpl || '').replace(/\{(metin|kelime)\}/g, function (_, n) { return n === 'metin' ? m : k; });
  }

  // ---- Kullanıcı presetleri: saf yardımcılar (testlenebilir, DOM yok) ----
  var USER_KEY = 'presets.user';
  var FORMAT = 'derinpreset';
  var MAX_MEDIA = 2 * 1024 * 1024; // çözülmüş bayt
  var LIMITS = { name: 60, category: 30, description: 500, template: 20000 };
  var ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
  var HTML_RE = /<\s*\/?\s*[a-z!?]|&#?[a-z0-9]+;|javascript:/i;
  var CTRL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
  var MEDIA_RE = /^data:(image\/(?:png|jpeg|gif|webp)|video\/(?:mp4|webm));base64,([A-Za-z0-9+/]+={0,2})$/;
  var ALLOWED = { id: 1, name: 1, category: 1, description: 1, template: 1, pvRef: 1, media: 1, created: 1, updated: 1 };
  function builtinIds() { return PRESETS.map(function (p) { return p.id; }); }

  function mediaBytes(data) {
    var m = MEDIA_RE.exec(data); if (!m) return -1;
    var b = m[2]; return Math.floor(b.length * 3 / 4) - (b.slice(-2) === '==' ? 2 : b.slice(-1) === '=' ? 1 : 0);
  }

  // Katı şema denetimi. { ok, errors[], preset (temiz kopya) }
  function validatePreset(o) {
    var err = [];
    if (!o || typeof o !== 'object' || Array.isArray(o)) return { ok: false, errors: ['Preset bir nesne olmalı'], preset: null };
    Object.keys(o).forEach(function (k) { if (!ALLOWED[k]) err.push('Bilinmeyen alan: ' + String(k).slice(0, 30)); });
    function str(k, min, max, plain) {
      var v = o[k];
      if (v == null && min === 0) return '';
      if (typeof v !== 'string') { err.push(k + ' metin olmalı'); return ''; }
      var t = k === 'template' ? v : v.trim();
      if (t.length < min) err.push(k + ' boş olamaz');
      if (t.length > max) err.push(k + ' en çok ' + max + ' karakter olabilir');
      if (CTRL_RE.test(t)) err.push(k + ' kontrol karakteri içeriyor');
      if (plain && HTML_RE.test(t)) err.push(k + ' HTML/varlık içeremez');
      return t;
    }
    var p = {};
    if (typeof o.id !== 'string' || !ID_RE.test(o.id)) err.push('id geçersiz (a-z, 0-9, -, en çok 64)');
    else p.id = o.id;
    p.name = str('name', 1, LIMITS.name, true);
    p.category = str('category', 1, LIMITS.category, true);
    p.description = str('description', 0, LIMITS.description, true);
    p.template = str('template', 1, LIMITS.template, false);
    if (o.pvRef != null && o.pvRef !== '') {
      if (typeof o.pvRef !== 'string' || builtinIds().indexOf(o.pvRef) === -1) err.push('pvRef bilinen bir önizleme değil');
      else p.pvRef = o.pvRef;
    }
    if (o.media != null) {
      var m = o.media;
      if (!m || typeof m !== 'object' || Object.keys(m).some(function (k) { return k !== 'type' && k !== 'data'; })) err.push('media geçersiz');
      else if (typeof m.data !== 'string' || !MEDIA_RE.test(m.data)) err.push('media data URL geçersiz (png/jpeg/gif/webp/mp4/webm)');
      else {
        var kind = /^data:video/.test(m.data) ? 'video' : 'image';
        if (m.type !== kind) err.push('media türü uyuşmuyor');
        else if (mediaBytes(m.data) > MAX_MEDIA) err.push('media 2 MB sınırını aşıyor');
        else p.media = { type: kind, data: m.data };
      }
    }
    ['created', 'updated'].forEach(function (k) {
      if (o[k] == null) return;
      if (typeof o[k] !== 'number' || !isFinite(o[k]) || o[k] < 0) err.push(k + ' geçersiz'); else p[k] = o[k];
    });
    return { ok: !err.length, errors: err, preset: err.length ? null : p };
  }

  function serializePresets(list) {
    var arr = (Array.isArray(list) ? list : [list]).map(function (p) {
      var o = {}; Object.keys(ALLOWED).forEach(function (k) { if (p && p[k] != null) o[k] = p[k]; }); return o;
    });
    return JSON.stringify({ format: FORMAT, version: 1, presets: arr }, null, 2);
  }

  // { ok, presets[], errors[] } — tek geçersiz preset dosyayı reddetmez, ama kök şema katıdır
  function parsePresets(text) {
    var d;
    if (typeof text !== 'string' || text.length > 40 * 1024 * 1024) return { ok: false, presets: [], errors: ['Dosya okunamadı veya çok büyük'] };
    try { d = JSON.parse(text); } catch (e) { return { ok: false, presets: [], errors: ['Geçerli JSON değil'] }; }
    if (!d || typeof d !== 'object' || d.format !== FORMAT || d.version !== 1 || !Array.isArray(d.presets))
      return { ok: false, presets: [], errors: ['.derinpreset biçimi değil (format/version/presets)'] };
    if (d.presets.length > 500) return { ok: false, presets: [], errors: ['En çok 500 preset içe aktarılabilir'] };
    var out = [], errs = [];
    d.presets.forEach(function (o, i) {
      var r = validatePreset(o);
      if (r.ok) out.push(r.preset); else errs.push('#' + (i + 1) + ': ' + r.errors.join('; '));
    });
    return { ok: out.length > 0 && !errs.length, presets: out, errors: errs };
  }

  function sameContent(a, b) {
    return ['name', 'category', 'description', 'template', 'pvRef'].every(function (k) { return (a[k] || '') === (b[k] || ''); }) &&
      ((a.media && a.media.data) || '') === ((b.media && b.media.data) || '');
  }

  // existing'e incoming'i ekler; çakışan id'ler yeniden adlandırılır, birebir aynıları atlanır.
  // { list, added, skipped, renamed: [{from, to}] }
  function mergePresets(existing, incoming, reserved) {
    var list = (existing || []).slice();
    var taken = {};
    list.forEach(function (p) { taken[p.id] = p; });
    (reserved || builtinIds()).forEach(function (id) { taken[id] = taken[id] || { id: id, __reserved: true }; });
    var names = list.map(function (p) { return p.name; });
    var res = { list: list, added: 0, skipped: 0, renamed: [] };
    (incoming || []).forEach(function (src) {
      var p = JSON.parse(JSON.stringify(src));
      var hit = taken[p.id];
      if (hit && !hit.__reserved && sameContent(hit, p)) { res.skipped++; return; }
      if (hit) {
        var base = p.id.replace(/-\d+$/, '').slice(0, 58), n = 2;
        while (taken[base + '-' + n]) n++;
        var nid = base + '-' + n;
        res.renamed.push({ from: p.id, to: nid });
        p.id = nid;
        if (names.indexOf(p.name) !== -1) {
          var nn = 2, bn = p.name.replace(/ \(\d+\)$/, '').slice(0, LIMITS.name - 5);
          while (names.indexOf(bn + ' (' + nn + ')') !== -1) nn++;
          p.name = bn + ' (' + nn + ')';
        }
      }
      taken[p.id] = p; names.push(p.name); list.push(p); res.added++;
    });
    return res;
  }

  function slug(s) {
    var map = { 'ç': 'c', 'ğ': 'g', 'ı': 'i', 'ö': 'o', 'ş': 's', 'ü': 'u' };
    var t = String(s || '').toLocaleLowerCase('tr').replace(/[çğıöşü]/g, function (c) { return map[c]; })
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
    return 'u-' + (t || 'preset');
  }

  window.DTPresets = { list: PRESETS, categories: CATS, filter: filter, fillPrompt: fillPrompt,
    validatePreset: validatePreset, mergePresets: mergePresets, serializePresets: serializePresets, parsePresets: parsePresets,
    slug: slug, MAX_MEDIA: MAX_MEDIA };

  var FAV_KEY = 'presets.fav';
  function loadFav() { try { return JSON.parse(localStorage.getItem(FAV_KEY)) || []; } catch (e) { return []; } }
  function saveFav(f) { try { localStorage.setItem(FAV_KEY, JSON.stringify(f)); } catch (e) {} }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function loadUser() {
    var raw; try { raw = JSON.parse(localStorage.getItem(USER_KEY)); } catch (e) { raw = null; }
    if (!Array.isArray(raw)) return [];
    return raw.map(function (o) { var r = validatePreset(o); return r.ok ? r.preset : null; }).filter(Boolean);
  }
  function saveUser(list) {
    try { localStorage.setItem(USER_KEY, JSON.stringify(list)); return true; } catch (e) { return false; }
  }
  function catClass(c) { var i = CATS.indexOf(c); return 'pz-badge ' + (i === -1 ? 'pz-cu' : 'pz-c' + i); }

  function preview(p, big) {
    if (p.__user) {
      if (p.media) {
        var w0 = el('div', 'pz-pv pz-pv-media' + (big ? ' pz-pv-big' : ''));
        var m = el(p.media.type === 'video' ? 'video' : 'img');
        m.src = p.media.data; m.alt = '';
        if (p.media.type === 'video') { m.muted = true; m.loop = true; m.autoplay = true; m.playsInline = true; }
        w0.appendChild(m); return w0;
      }
      var ref = p.pvRef && PRESETS.filter(function (b) { return b.id === p.pvRef; })[0];
      if (ref) return preview(ref, big);
      var w1 = el('div', 'pz-pv pz-pv-plain' + (big ? ' pz-pv-big' : ''));
      w1.appendChild(el('div', 'pz-pv-txt', p.name));
      return w1;
    }
    var w = el('div', 'pz-pv pv-' + p.id + (big ? ' pz-pv-big' : ''));
    // "alt||üst": alt kısım konuşan kişinin arkasında kalır
    var parts = String(p.pv || '').split('||');
    var v = el('div', 'pv-v');
    v.appendChild(el('div', 'pv-bg'));
    if (parts.length > 1) { var u = el('div', 'pv-u'); u.innerHTML = parts[0]; v.appendChild(u); }
    v.appendChild(el('div', 'pv-subj'));
    w.appendChild(v);
    var s = el('div', 'pv-s'); s.innerHTML = parts[parts.length - 1];
    w.appendChild(s);
    return w;
  }

  function mount(root) {
    var state = { cat: 'Tümü', q: '', fav: loadFav(), open: null, user: loadUser() };
    state.user.forEach(function (p) { p.__user = true; });
    function allList() { return state.user.concat(PRESETS); }
    function allCats() {
      var c = CATS.slice();
      state.user.forEach(function (p) { if (c.indexOf(p.category) === -1) c.push(p.category); });
      return c;
    }
    function strip(p) { var o = {}; Object.keys(p).forEach(function (k) { if (k !== '__user') o[k] = p[k]; }); return o; }
    function persist() {
      if (!saveUser(state.user.map(strip))) { toast('Kaydedilemedi — depolama dolu (büyük görsel/videoyu küçültün)'); return false; }
      return true;
    }
    root.innerHTML = '';
    var box = el('div', 'pz-root');
    root.appendChild(box);

    var head = el('div', 'pz-head');
    head.appendChild(el('div', 'pz-title', 'Efekt presetleri'));
    var search = el('input', 'pz-search');
    search.type = 'search'; search.placeholder = 'Efekt ara…';
    head.appendChild(search);
    var tools = el('div', 'pz-tools');
    var tNew = el('button', 'pz-tool pz-tool-main', "+ Kendi preset'in");
    var tPaste = el('button', 'pz-tool', "Sohbetteki prompt'u preset yap");
    var tImp = el('button', 'pz-tool', 'İçe aktar');
    var tExp = el('button', 'pz-tool', 'Dışa aktar');
    [tNew, tPaste, tImp, tExp].forEach(function (b) { b.type = 'button'; tools.appendChild(b); });
    var fileIn = el('input'); fileIn.type = 'file'; fileIn.accept = '.derinpreset,application/json'; fileIn.style.display = 'none';
    tools.appendChild(fileIn);
    head.appendChild(tools);
    box.appendChild(head);

    var chips = el('div', 'pz-chips');
    function renderChips() {
      var cats = ['Tümü', 'Benim'].concat(allCats());
      if (cats.indexOf(state.cat) === -1) state.cat = 'Tümü';
      chips.innerHTML = '';
      cats.forEach(function (c) {
        var b = el('button', 'pz-chip' + (c === state.cat ? ' on' : ''), c);
        b.type = 'button'; b.dataset.cat = c;
        chips.appendChild(b);
      });
    }
    box.appendChild(chips);

    var grid = el('div', 'pz-grid');
    box.appendChild(grid);
    var empty = el('div', 'pz-empty', 'Sonuç bulunamadı.');
    box.appendChild(empty);

    var toastEl = el('div', 'pz-toast');
    box.appendChild(toastEl);
    var toastT;
    function toast(msg) {
      toastEl.textContent = msg; toastEl.classList.add('show');
      clearTimeout(toastT); toastT = setTimeout(function () { toastEl.classList.remove('show'); }, 2200);
    }

    function isFav(id) { return state.fav.indexOf(id) !== -1; }
    function toggleFav(id) {
      var i = state.fav.indexOf(id);
      if (i === -1) state.fav.push(id); else state.fav.splice(i, 1);
      saveFav(state.fav); render();
      toast(i === -1 ? 'Favorilere eklendi' : 'Favorilerden çıkarıldı');
    }

    function render() {
      renderChips();
      var src = state.cat === 'Benim' ? state.user : allList();
      var items = filter(src, state.cat === 'Benim' ? 'Tümü' : state.cat, state.q).slice().sort(function (a, b) {
        return (isFav(b.id) ? 1 : 0) - (isFav(a.id) ? 1 : 0);
      });
      grid.innerHTML = '';
      items.forEach(function (p) {
        var card = el('div', 'pz-card');
        card.tabIndex = 0; card.setAttribute('role', 'button'); card.dataset.id = p.id;
        card.appendChild(preview(p));
        var star = el('button', 'pz-star' + (isFav(p.id) ? ' on' : ''), isFav(p.id) ? '★' : '☆');
        star.type = 'button'; star.title = 'Favori'; star.dataset.star = p.id;
        card.appendChild(star);
        var meta = el('div', 'pz-meta');
        meta.appendChild(el('div', 'pz-name', p.name));
        meta.appendChild(el('span', catClass(p.category), p.category));
        if (p.__user) meta.appendChild(el('span', 'pz-badge pz-mine', 'Benim'));
        card.appendChild(meta);
        grid.appendChild(card);
      });
      empty.style.display = items.length ? 'none' : 'block';
    }

    // Drawer
    var shade = el('div', 'pz-shade');
    var drawer = el('div', 'pz-drawer');
    box.appendChild(shade); box.appendChild(drawer);

    function closeDrawer() { drawer.classList.remove('open'); shade.classList.remove('open'); state.open = null; }

    function send(kind, text) {
      var DT = window.DT || {};
      var fn = kind === 'new' ? DT.newChatWithPrompt : DT.sendPrompt;
      if (typeof fn !== 'function') return copy(text, 'Sohbet bağlantısı yok — prompt panoya kopyalandı');
      Promise.resolve().then(function () { return fn.call(DT, text); }).then(function (ok) {
        if (ok === false) copy(text, 'Gönderilemedi — prompt panoya kopyalandı');
        else toast(kind === 'new' ? 'Yeni sohbette açıldı' : 'Sohbete gönderildi');
      }, function () { copy(text, 'Gönderilemedi — prompt panoya kopyalandı'); });
    }

    function copy(text, msg) {
      var done = function () { toast(msg || 'Panoya kopyalandı'); };
      var fallback = function () {
        var ta = el('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); done(); } catch (e) { toast('Kopyalanamadı'); }
        ta.remove();
      };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback);
      else fallback();
    }

    function openDrawer(p) {
      state.open = p.id;
      drawer.innerHTML = '';
      var top = el('div', 'pz-dtop');
      var ttl = el('div', 'pz-dttl');
      ttl.appendChild(el('div', 'pz-dname', p.name));
      ttl.appendChild(el('span', catClass(p.category), p.category));
      if (p.__user) ttl.appendChild(el('span', 'pz-badge pz-mine', 'Benim'));
      top.appendChild(ttl);
      var x = el('button', 'pz-x', '×'); x.type = 'button'; x.title = 'Kapat'; x.onclick = closeDrawer;
      top.appendChild(x);
      drawer.appendChild(top);
      drawer.appendChild(preview(p, true));
      drawer.appendChild(el('p', 'pz-desc', p.description));

      drawer.appendChild(el('label', 'pz-lbl', 'Metin'));
      var metin = el('textarea', 'pz-ta pz-metin'); metin.rows = 2; metin.placeholder = 'Ekranda görünecek metin…';
      drawer.appendChild(metin);
      var kelime = null;
      if (p.template.indexOf('{kelime}') !== -1) {
        drawer.appendChild(el('label', 'pz-lbl', 'Kelime'));
        kelime = el('input', 'pz-ta pz-kelime'); kelime.type = 'text'; kelime.placeholder = 'Vurgulanacak kelime (varsayılan: EFEKT)';
        drawer.appendChild(kelime);
      }
      function fill() { return fillPrompt(p.template, metin.value, kelime ? kelime.value : ''); }
      drawer.appendChild(el('label', 'pz-lbl', 'Prompt'));
      var out = el('textarea', 'pz-ta pz-out'); out.rows = 8;
      out.value = fill();
      var edited = false;
      out.addEventListener('input', function () { edited = true; });
      metin.addEventListener('input', function () { if (!edited) out.value = fill(); });
      if (kelime) kelime.addEventListener('input', function () { if (!edited) out.value = fill(); });
      drawer.appendChild(out);
      var reset = el('button', 'pz-link', 'Promptu sıfırla'); reset.type = 'button';
      reset.onclick = function () { edited = false; out.value = fill(); };
      drawer.appendChild(reset);

      var acts = el('div', 'pz-acts');
      var b1 = el('button', 'pz-btn pz-primary', 'Sohbete gönder');
      var b2 = el('button', 'pz-btn', 'Yeni sohbette aç');
      var b3 = el('button', 'pz-btn', 'Kopyala');
      [b1, b2, b3].forEach(function (b) { b.type = 'button'; acts.appendChild(b); });
      b1.onclick = function () { send('send', out.value); };
      b2.onclick = function () { send('new', out.value); };
      b3.onclick = function () { copy(out.value); };
      drawer.appendChild(acts);

      var acts2 = el('div', 'pz-acts pz-acts2');
      function act(label, fn, cls) { var b = el('button', 'pz-btn pz-sm' + (cls ? ' ' + cls : ''), label); b.type = 'button'; b.onclick = fn; acts2.appendChild(b); }
      if (p.__user) {
        act('Düzenle', function () { openEditor(p, false); });
        act('Çoğalt', function () { openEditor(p, true); });
        act('Dışa aktar', function () { download([p], p.id); });
        act('Sil', function () {
          if (!window.confirm('"' + p.name + '" silinsin mi?')) return;
          var prev = state.user;
          state.user = state.user.filter(function (u) { return u.id !== p.id; });
          if (!persist()) { state.user = prev; return; }
          closeDrawer(); render(); toast('Preset silindi');
        }, 'pz-danger');
      } else {
        act('Kopyala ve düzenle', function () { openEditor(p, true); });
      }
      drawer.appendChild(acts2);

      drawer.classList.add('open'); shade.classList.add('open');
      setTimeout(function () { metin.focus(); }, 50);
    }

    function uniqueId(base) {
      var ids = allList().map(function (p) { return p.id; }), id = base.slice(0, 58), n = 2;
      if (ids.indexOf(id) === -1) return id;
      while (ids.indexOf(id + '-' + n) !== -1) n++;
      return id + '-' + n;
    }

    // Editör: src null → yeni; asCopy → src'den yeni kopya; aksi halde src'yi düzenle
    function openEditor(src, asCopy, opts) {
      opts = opts || {};
      var editing = src && src.__user && !asCopy;
      state.open = 'editor';
      drawer.innerHTML = '';
      var top = el('div', 'pz-dtop');
      top.appendChild(el('div', 'pz-dname', editing ? 'Preseti düzenle' : opts.paste ? "Prompt'tan preset" : 'Yeni preset'));
      var x = el('button', 'pz-x', '×'); x.type = 'button'; x.title = 'Kapat'; x.onclick = closeDrawer;
      top.appendChild(x); drawer.appendChild(top);

      function field(label, node, hint) {
        drawer.appendChild(el('label', 'pz-lbl', label)); drawer.appendChild(node);
        if (hint) drawer.appendChild(el('div', 'pz-hint', hint));
        return node;
      }
      var tpl = el('textarea', 'pz-ta pz-out'); tpl.rows = 8; tpl.maxLength = LIMITS.template;
      tpl.placeholder = opts.paste ? "Sohbetteki prompt'u buraya yapıştır…" : 'Prompt şablonu…';
      if (opts.paste) field('Prompt', tpl, 'Değişecek metnin yerine {metin}, vurgulanacak kelimenin yerine {kelime} yaz.');
      var name = field('Ad', el('input', 'pz-ta')); name.maxLength = LIMITS.name;
      var catSel = el('select', 'pz-ta');
      allCats().forEach(function (c) { var o = el('option', null, c); o.value = c; catSel.appendChild(o); });
      var oNew = el('option', null, '+ Yeni kategori…'); oNew.value = '__new'; catSel.appendChild(oNew);
      field('Kategori', catSel);
      var catNew = el('input', 'pz-ta'); catNew.maxLength = LIMITS.category; catNew.placeholder = 'Yeni kategori adı';
      catNew.style.display = 'none'; drawer.appendChild(catNew);
      catSel.onchange = function () { catNew.style.display = catSel.value === '__new' ? '' : 'none'; if (catSel.value === '__new') catNew.focus(); };
      var desc = field('Açıklama', el('textarea', 'pz-ta')); desc.rows = 2; desc.maxLength = LIMITS.description;
      if (!opts.paste) field('Prompt şablonu', tpl, 'Yer tutucular: {metin} → ekrandaki metin, {kelime} → vurgulanacak kelime.');

      var pvSel = el('select', 'pz-ta');
      [['', 'Önizlemesiz']].concat(PRESETS.map(function (b) { return [b.id, 'Önizleme: ' + b.name]; }))
        .concat([['__media', 'Görsel / video yükle…']]).forEach(function (o) {
          var op = el('option', null, o[1]); op.value = o[0]; pvSel.appendChild(op);
        });
      field('Önizleme', pvSel);
      var mediaIn = el('input', 'pz-ta'); mediaIn.type = 'file'; mediaIn.accept = 'image/png,image/jpeg,image/gif,image/webp,video/mp4,video/webm';
      var mediaInfo = el('div', 'pz-hint', 'En çok 2 MB (kısa video veya küçük görsel).');
      var mediaBox = el('div'); mediaBox.appendChild(mediaIn); mediaBox.appendChild(mediaInfo); drawer.appendChild(mediaBox);
      var media = src && src.media ? { type: src.media.type, data: src.media.data } : null;
      function syncMedia() { mediaBox.style.display = pvSel.value === '__media' ? '' : 'none'; }
      pvSel.onchange = syncMedia;
      mediaIn.onchange = function () {
        var f = mediaIn.files && mediaIn.files[0]; if (!f) return;
        if (f.size > MAX_MEDIA) { mediaIn.value = ''; mediaInfo.textContent = 'Dosya 2 MB sınırını aşıyor (' + (f.size / 1048576).toFixed(1) + ' MB) — daha küçük bir dosya seç.'; toast('Dosya 2 MB’tan büyük'); return; }
        var rd = new FileReader();
        rd.onload = function () {
          var d = String(rd.result);
          if (!MEDIA_RE.test(d)) { media = null; mediaInfo.textContent = 'Desteklenmeyen biçim (png, jpeg, gif, webp, mp4, webm).'; return; }
          media = { type: /^data:video/.test(d) ? 'video' : 'image', data: d };
          mediaInfo.textContent = 'Eklendi: ' + f.name + ' (' + Math.round(f.size / 1024) + ' KB)';
        };
        rd.readAsDataURL(f);
      };

      if (src) {
        name.value = asCopy ? (src.name + ' (kopya)').slice(0, LIMITS.name) : src.name;
        catSel.value = src.category; if (catSel.value !== src.category) { catSel.value = '__new'; catNew.value = src.category; catNew.style.display = ''; }
        desc.value = src.description || ''; tpl.value = src.template;
        pvSel.value = src.media ? '__media' : src.__user ? (src.pvRef || '') : src.id;
        if (media) mediaInfo.textContent = 'Mevcut ' + (media.type === 'video' ? 'video' : 'görsel') + ' korunuyor; değiştirmek için yeni dosya seç.';
      }
      syncMedia();

      var errBox = el('div', 'pz-err'); drawer.appendChild(errBox);
      var acts = el('div', 'pz-acts');
      var save = el('button', 'pz-btn pz-primary', 'Kaydet'); save.type = 'button';
      var cancel = el('button', 'pz-btn', 'Vazgeç'); cancel.type = 'button'; cancel.onclick = closeDrawer;
      acts.appendChild(save); acts.appendChild(cancel); drawer.appendChild(acts);

      save.onclick = function () {
        var now = Date.now();
        var obj = {
          id: editing ? src.id : uniqueId(slug(name.value)),
          name: name.value, category: catSel.value === '__new' ? catNew.value : catSel.value,
          description: desc.value, template: tpl.value,
          created: editing && src.created ? src.created : now, updated: now
        };
        if (pvSel.value === '__media') { if (media) obj.media = media; }
        else if (pvSel.value) obj.pvRef = pvSel.value;
        if (pvSel.value === '__media' && !media) { errBox.textContent = 'Görsel/video seçilmedi.'; return; }
        var r = validatePreset(obj);
        if (!r.ok) { errBox.textContent = r.errors.join(' · '); return; }
        var np = r.preset; np.__user = true;
        var prev = state.user.slice();
        if (editing) state.user = state.user.map(function (u) { return u.id === src.id ? np : u; });
        else state.user = [np].concat(state.user);
        if (!persist()) { state.user = prev; errBox.textContent = 'Depolama dolu — daha küçük bir görsel/video deneyin.'; return; }
        render(); toast(editing ? 'Preset güncellendi' : 'Preset kaydedildi'); openDrawer(np);
      };

      drawer.classList.add('open'); shade.classList.add('open');
      setTimeout(function () { (opts.paste ? tpl : name).focus(); }, 50);
    }

    function download(list, base) {
      if (!list.length) { toast('Dışa aktarılacak kendi presetin yok'); return; }
      var blob = new Blob([serializePresets(list.map(strip))], { type: 'application/json' });
      var a = el('a'); a.href = URL.createObjectURL(blob); a.download = (base || 'presetler') + '.derinpreset';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
      toast(list.length + ' preset dışa aktarıldı');
    }

    tNew.onclick = function () { openEditor(null, false); };
    tPaste.onclick = function () { openEditor(null, false, { paste: true }); };
    tExp.onclick = function () { download(state.user, 'presetler'); };
    tImp.onclick = function () { fileIn.value = ''; fileIn.click(); };
    fileIn.onchange = function () {
      var f = fileIn.files && fileIn.files[0]; if (!f) return;
      if (f.size > 40 * 1024 * 1024) { toast('Dosya çok büyük'); return; }
      var rd = new FileReader();
      rd.onload = function () {
        var r = parsePresets(String(rd.result));
        if (!r.presets.length) { toast('İçe aktarılamadı: ' + (r.errors[0] || 'geçersiz dosya')); return; }
        var prev = state.user;
        var m = mergePresets(state.user.map(strip), r.presets, builtinIds());
        state.user = m.list.map(function (p) { p.__user = true; return p; });
        if (!persist()) { state.user = prev; return; }
        render();
        var msg = m.added + ' preset eklendi';
        if (m.renamed.length) msg += ', ' + m.renamed.length + ' yeniden adlandırıldı';
        if (m.skipped) msg += ', ' + m.skipped + ' zaten vardı';
        if (r.errors.length) msg += ', ' + r.errors.length + ' geçersiz atlandı';
        toast(msg);
      };
      rd.onerror = function () { toast('Dosya okunamadı'); };
      rd.readAsText(f);
    };

    // Events
    search.addEventListener('input', function () { state.q = search.value; render(); });
    chips.addEventListener('click', function (e) {
      var b = e.target.closest('.pz-chip'); if (!b) return;
      state.cat = b.dataset.cat;
      render();
    });
    grid.addEventListener('click', function (e) {
      var s = e.target.closest('[data-star]');
      if (s) { e.stopPropagation(); toggleFav(s.dataset.star); return; }
      var c = e.target.closest('.pz-card');
      if (c) { var hit = allList().filter(function (p) { return p.id === c.dataset.id; })[0]; if (hit) openDrawer(hit); }
    });
    grid.addEventListener('keydown', function (e) {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('pz-card')) { e.preventDefault(); e.target.click(); }
    });
    shade.addEventListener('click', closeDrawer);
    box.addEventListener('keydown', function (e) { if (e.key === 'Escape' && state.open) closeDrawer(); });

    // Canlı önizleme: yalnız sekme görünürken (veya hover'da) oynat
    function setLive(v) { box.classList.toggle('is-live', !!v && document.visibilityState === 'visible'); }
    var visible = false;
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (en) { visible = en[0].isIntersecting; setLive(visible); }).observe(box);
    } else { visible = true; setLive(true); }
    document.addEventListener('visibilitychange', function () { setLive(visible); });

    render();
  }

  function init() {
    var m = document.getElementById('presets-mount');
    if (m && !m.dataset.pzMounted) { m.dataset.pzMounted = '1'; mount(m); }
  }
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  }
})();
