---
name: motion-yonetmeni
description: "Motion graphics, kinetik tipografi, harita animasyonu, explainer, intro ve logo/lansman videosunda sanat yönetimi: brif, yöntem seçimi, üç yön, stil kartı, hareket çizelgesi, Türkçe tipografi denetimi ve klişe testi. Şablon görünümünden (koyu zemin, mor parıltı, aşağıdan kayan başlık) kaçınıp konuya özgü kararlar verir. Kullanıcı 'motion yap', 'animasyonla anlat', 'kinetik tipografi', 'harita animasyonu', 'intro/lansman videosu', 'hareketlendir', 'şablon gibi durmasın', 'klişe olmasın' dediğinde ya da bir fikri grafik videoya çevirmek istediğinde kullan. Üretimi kendisi yapmaz: kararları verir, üretimi hyperframes / motion-graphics / pre-video skill'lerine devreder; Premiere kurgusu için premiere skill'i."
---

# Motion Yönetmeni

Claude'a "güzel bir animasyon yap" dediğinde çoğu zaman aynı videoyu alırsın: koyu zemin, mor parıltı, aşağıdan kayan başlık, ortalanmış kartlar. Sebep yeteneksizlik değil, kararsızlık. Sen seçmediğin her şeyi (font, renk, eğri, düzen) model istatistiksel ortalamadan seçer. Bu skill o kararları sana geri verir.

Temel cümle: **Klişe, bir kararın yokluğudur.**

Görevin bir görünüm seçmek değil, düşünceyi hangi görsel yöntemle anlatacağına karar vermek ve bu kararı kare, hareket ve ses düzeyinde tutarlı uygulamaktır.

## 0. Diğer skill'lerle ilişki (önce oku)

Bu skill **sanat yönetimi** katmanıdır: ne anlatılacağına ve nasıl görüneceğine karar verir. Üretim ve teknik kurallar diğer skill'lerdedir; çakışırsa onlar geçerlidir.

| İş | Skill |
|---|---|
| HTML kompozisyon kurma, render | `hyperframes` (giriş), kısa motion birimi `motion-graphics`, uzun/çok sahneli `general-video` |
| 1080×1920 Reels render, ses, mastering, final encode | `pre-video` (final encode, safe zone, klasör düzeni ondan) |
| Premiere'e bindirilecek grafik, kurgu | `premiere` (`references/grafik.md`) |
| Görsel üretimi | `gorsel-uret` |
| Müşteri işi | Önce `D:\İşler\_Müşteriler\<Müşteri>.md` kartı: marka rengi/fontu stil kartını belirler, buradaki "özgün font/palet" önerisinin önüne geçer |

Bu skill'in çıktısı: stil kartı + sahne/hareket çizelgesi + klişe testi. Kodu ve render'ı yukarıdaki skill kuralıyla yap.

## 1. Brif

Üç şeyi öğren. Eksik kalanı kendin karar ver ve hangi kararı verdiğini tek satırla söyle.

1. **Tez:** Bu video tek cümlede ne söylüyor?
2. **Format:** Dikey 9:16 mı, yatay 16:9 mu? Kaç saniye? Nerede oynayacak (Reels, YouTube içi bölüm, sunum)?
3. **Malzeme:** Logo, ekran kaydı, fotoğraf, harita verisi, ses, metin var mı? Varsa yön onun etrafında kurulur.

Kullanıcı "direkt yap" dediyse ya da iş kısaysa (10 saniye, tek sahne) soru sorma, hızlı moda geç (bölüm 3).

## 2. Önce yöntem, sonra görünüm

"Neon mavi tipografi" bir yöntem değil, bir yüzeydir. Önce düşüncenin nasıl anlatılacağını seç:

- **Kanıt göster:** gerçek belge, ekran ya da fotoğraf üstünde işaretle
- **Mekanizma çiz:** bir şeyin nasıl çalıştığını parça parça kurarak göster
- **Yol ve mekan:** harita, rota, plan; hareket coğrafyanın kendisi olsun
- **Karşılaştır:** iki durumu aynı kadrajda, aynı ölçekte yan yana tut
- **Sözcüğü olay yap:** kelimenin anlamı hareketini belirlesin (düşen, büyüyen, silinen)
- **Veriyi sahneye dök:** sayı yazma, ölçek hissi ver
- **Gözlem:** sabit kadraj, uzun tutuş, az hareket

Sonra yedi ekseni doldur. Boş kalan eksen, varsayılana harcanmış eksendir.

1. **Anlatım yöntemi** (yukarıdaki liste)
2. **Malzeme kaynağı:** gerçek çekim, ekran kaydı, tarama, fotoğraf, saf tipografi, veri
3. **Kadraj mantığı:** kenara yaslı, kadrajdan taşan, tek dev nesne, negatif alan, sabit çalışma alanı
4. **Zaman karakteri:** sert kesme, uzun tutuş, ağır kalkış, ikili çekim, konuşmaya kilitli vurgu
5. **Tipografinin rolü:** başlık, etiket, belge, tabela, altyazı ya da olayın kendisi
6. **Renk kökeni:** mekan, ışık kaynağı, baskı tekniği, ürünün gerçek malzemesi
7. **Ses stratejisi:** nesne sesi, oda tonu, tek enstrüman, sessizlik

Son olarak **tek bir imza öğe** seç: videonun hatırlanacağı tek şey. Cesareti tek yerde harca, geri kalan her şey sakin kalsın.

Stil seçerken `references/stil-katalogu.md` dosyasını aç. Katalog bir menü değil, çıkış noktasıdır: iki uzak stili çarpıştırmak (teknik çizim + el yazısı not, risograf + harita) çoğu zaman tek stilden daha özgün sonuç verir.

## 3. Üç yön, tek seçim

**Hızlı mod** (kısa iş ya da "direkt yap"): üç yönü kafanda tart, birini seç, ilk mesajda hangisini neden seçtiğini tek satırla söyle ve üret. Klişe testi yine zorunlu.

**Tam mod** (marka işi, uzun video, belirsiz brif): üç gerçekten farklı yön öner. Fark en az dört alanda olmalı: anlatım yöntemi, malzemenin rolü, kadraj, zaman. Her yön için tek cümle fikir, 5-7 sahnelik akış, kullanılmayacak üç öğe ve zayıf kalacağı durum yaz. Kullanıcı başındaysa seçimi ona bırak (soru aracı varsa onunla). Başında değilse en uygununu seç, nedenini yaz ve devam et.

Her yolu şu soruyla sına: **"Benzer bir promptla kendiliğinden buraya varır mıydım?"** Varırdıysan o ekseni değiştir ve neyi neden değiştirdiğini yaz.

## 4. Stil kartı (her işte zorunlu)

Üretime geçmeden bu kartı doldur ve kullanıcıya göster. Boş satır bırakma.

```
STİL KARTI
Tez:
Yöntem:
Malzeme:
Kadraj:
Zaman (fps, eğri ailesi, ikili çekim var/yok):
Font (başlık / gövde) ve neden:
Palet (3-5 renk) ve kökeni:
Doku (gren, kağıt, baskı, yok):
İmza öğe:
Ses:
Kullanılmayacaklar (en az 3):
```

Kart, sonraki videoda "geçen sefer ne yapmıştım" sorusunun cevabıdır. Seri çalışıyorsan yeni video, önceki kartlardan en az üç eksende ayrışmalı; aynı font ve aynı imza öğe art arda iki videoda tekrar etmesin.

## 5. Hareket

Hareketin üç meşru işi var: dikkat yönlendirmek, ilişki göstermek, değişimi açıklamak. Bunlardan birini yapmıyorsa çıkar.

- Eğriyi kamera fiziğinden seç, her şeye aynı eğriyi ve süreyi verme. Ağır kalkışlı dolly, hızlanarak terk eden çıkış, sıfır easing'li sert kesme farklı karakterlerdir.
- Her sahnede en az bir saniye hiçbir şey kıpırdamasın. Durgunluk hareketin anlamını verir.
- Aynı anda tek dikkat odağı. Sıralamayı DOM sırasına göre değil önem sırasına göre yap.
- Girişler çıkışlardan uzun olsun. İlk hareket 0. karede başlamasın.
- Animasyonu kare numarasının fonksiyonu olarak yaz (`references/kare-saati.md`). Zamana bağlı CSS animasyonu ve `setTimeout` render'da kayar.

Eğri tablosu, süre hesapları ve kamera fiziği: `references/hareket-ve-tipografi.md`.

## 6. Tipografi, renk, ses

- **Font** konunun dünyada hangi yazıyla yaşadığından gelir: tabela, gazete, prospektüs, bilet, senaryo sayfası, afiş. Vurguyu renkli ya da italik kelimeyle değil ölçek, kırpma, kadrajdan taşma ya da zamanlama ile yap.
- **Türkçe:** `<html lang="tr">`, latin-ext alt kümesi, `toLocaleUpperCase('tr-TR')`. Her fontu "Pijamalı hasta yağız şoföre çabucak güvendi" cümlesi ve "İSTANBUL, IŞIK" ile test et. Eksik glif sessizce başka fonta düşer ve video klişeye döner.
- **Renk** hex uydurarak değil kaynaktan türetilir: çekimin derecelendirmesi, mekanın ışığı, baskı tekniği, ürünün malzemesi. Bir zemin, bir metin, tek anlamlı vurgu yeterli.
- **Ses:** Claude sesi duyamaz, tahmin etme, ölç (`ffprobe`, `loudnorm`, `silencedetect`). Her ses olayını görüntüdeki fiziksel bir nesneye bağla. Her videoda en az bir tam sessizlik anı olsun. Müziği ve sesi lisanslı kaynaktan al.

Ayrıntı, font eşleşmeleri ve altyazı kuralları: `references/hareket-ve-tipografi.md`.

## 7. Üretim yolu

Önce hangi aracın gerçekten mevcut olduğunu doğrula, olmayan aracı varmış gibi anlatma.

| Yol | Ne zaman |
|---|---|
| **Artifact Motion türü** | Artifact türleri listesinde Motion varsa. Listede yoksa bu hesapta açık değildir; tek cümleyle söyle ve aşağıdaki yola geç. |
| **HTML + kare kare render** | Çalışma ortamında `node`, `ffmpeg` ve Playwright varsa gerçek MP4 üretmenin en güvenilir yolu. Kalıp: `references/kare-saati.md` |
| **Remotion / HyperFrames** | Kullanıcının kendi projesi varsa; aynı kurallar geçerli. |

**Dürüst sınır:** Claude kodla animasyon yazar, video modeli değildir. Fotogerçekçi insan, canlı aksiyon ya da karmaşık 3D karakter gereken planlar Veo, Runway gibi video modellerinin işidir. Bu skill onların etrafındaki tipografiyi, grafiği, kurguyu ve ritmi yönetir.

**Şeffaf grafik** gerekiyorsa (Premiere ya da CapCut üstüne bindirme) alfa kanallı çıktı ver (ProRes 4444 ya da WebM alpha). Siyah zeminle teslim etme.

## 8. Klişe testi (yayından önce)

Videodan 6 kare al (0., 1., 3., 6., 10. saniye ve son kare) ve `references/klise-listesi.md` dosyasını tara. Her "evet" bir puan: 0-1 temiz, 2-3 her birinin gerekçesi olmalı, 4 ve üstü en kötü iki kalemi düzelt ve tekrar test et.

Üç göz testi:
- **Logo testi:** Logoyu kapat. Bu video bir rakibin olabilir mi?
- **Rastgele kare testi:** Üç rastgele kare, herhangi bir yapay zeka videosundan ayırt ediliyor mu?
- **Sessiz izleme testi:** Ses kapalıyken ilk 3 saniyede ne olduğu anlaşılıyor mu?

Belirsiz notu teknik nota çevir. "Daha dinamik" yerine: "3. sahnede başlığı koru, yalnız işaret çizgisini 12 karede aç, sonra her şey sabit; diğer sahnelere dokunma."

## 9. Dürüstlük

- Render etmediğin videoyu hazır video diye sunma. Kodu yazmak, son render'ın doğrulanması değildir.
- Görmediğin kare ve duymadığın ses hakkında gözlem yazma, "doğrulanamadı" de.
- Gerçek veri yoksa grafiği "şematik" diye etiketle. Uydurma yüzde ve sayaç yok.
- Erişemediğin referansı analiz etmiş gibi davranma. Referanstan ilke al, bir tasarımcının ya da markanın imzasını kopyalama.
- İzlenme garantisi verme. Font, müzik ve görsel için kullanım hakkını ayrıca kontrol et.

## 10. Teslim biçimi

1. Dosya ve bir cümle bağlam.
2. **Ne yaptım:** 3-5 madde, her biri bir karar ve gerekçesi ("Başlığı kadrajdan taşırdım çünkü...").
3. **Klişe testi sonucu:** puan ve bilinçli istisnalar.
4. **Doğrulanamayanlar:** varsa tek satır.
5. **Stil kartı** (tek satır özet, sonraki videoda tekrar kontrolü için).
6. Varsa tek bir doğal sonraki adım.

## Referans dosyaları

| Dosya | Ne zaman oku |
|---|---|
| `references/stil-katalogu.md` | Stil seçerken: 20 stil, her birinin sistem kuralı ve klişe riski |
| `references/hareket-ve-tipografi.md` | Eğri, süre, font, Türkçe altyazı, renk türetme ve ses kuralları |
| `references/klise-listesi.md` | Yayın öncesi klişe taraması |
| `references/kare-saati.md` | HTML ile kare kare render kalıbı ve ffmpeg komutları |
| `references/skill-siz-prompt.md` | Skill kurulamayan ortamda aynı yöntemi tek prompta indirmek için |
