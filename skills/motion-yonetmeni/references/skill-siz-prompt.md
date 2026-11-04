# Skill Olmadan: Tek Prompt Yöntemi

Skill kurmak istemeyen ya da kurulumu olmayan ortamda (başka bir sohbet, başka bir hesap) aynı düşünme biçimini tek prompta indirmek mümkündür. Skill'in avantajı, bu kuralları her sohbette sen yapıştırmadan otomatik uygulamasıdır. Prompt yöntemi aynı kuralların çoğunu taşır: farkı yaratan şey kural listesi ve stil kartı adımı, kurulum mekanizması değil. Stil kataloğu ve render kalıbı gibi uzun içerikler prompta sığmaz.

## Nasıl kullanılır

1. Aşağıdaki bloğu kopyala.
2. `[...]` ile işaretli yerleri kendi işine göre doldur.
3. Claude önce stil kartını gösterecek. Beğenmezsen bir ekseni değiştir ("zamanı değiştir, uzun tutuşlu olsun") ve devam et.
4. Kart onaylanınca üretim başlar.

## Prompt

```
Bir motion / animasyon videosu tasarlayacaksın. Kod yazmadan önce aşağıdaki sırayla çalış.

İŞİN BRİFİ
Tez (video tek cümlede ne söylüyor): [...]
Format ve süre: [örn. 1080x1920 dikey, 12 saniye]
Elimdeki malzeme: [logo, ekran kaydı, fotoğraf, harita, metin; yoksa "yok"]
Konu: [...]

ADIM 1: YÖNTEM
Önce düşüncenin hangi yöntemle anlatılacağını seç: kanıt gösterme, mekanizma çizme, harita/rota, karşılaştırma, sözcüğü olay yapma, veriyi sahneye dökme ya da gözlem. "Neon tipografi" gibi bir görünüm bir yöntem sayılmaz.

ADIM 2: ÜÇ YÖN
Üç gerçekten farklı yön öner. Her biri anlatım yöntemi, malzeme, kadraj ve zaman karakteri bakımından farklı olsun. Her yön için tek cümle fikir ve kullanılmayacak üç öğe yaz. Sonra en uygununu seç ve nedenini tek satırla söyle.

ADIM 3: STİL KARTI
Seçtiğin yön için şu kartı doldur ve bana göster, üretime ondan sonra geç:
- Yöntem:
- Kadraj mantığı:
- Zaman (fps, eğri ailesi, ikili çekim var mı):
- Font (başlık / gövde) ve neden bu font:
- Palet (3-5 renk) ve paletin kökeni (bir mekan, ışık, baskı tekniği, malzeme):
- Doku:
- İmza öğe (videonun hatırlanacağı tek şey):
- Ses:
- Kullanılmayacaklar (en az 3):

ADIM 4: ÜRETİM KURALLARI
- Hareket: her şeye aynı eğri ve süreyi verme. Ağır nesne geç kalkar ve uzun yerleşir, hafif etiket çabuk gelir ve çabuk durur. Her sahnede en az 1 saniye hiçbir şey kıpırdamasın. Aynı anda tek dikkat odağı olsun. İlk hareket 0. karede başlamasın.
- Animasyonu kare numarasına bağlı yaz. Zamana bağlı CSS animasyonu ve setTimeout kullanma. Rastgelelik seed'li olsun.
- Türkçe: html lang="tr", latin-ext font alt kümesi, büyük harf için toLocaleUpperCase('tr-TR'). Fontu "Pijamalı hasta yağız şoföre çabucak güvendi" cümlesi ve "İSTANBUL, IŞIK" ile test et.
- Renk: hex uydurma, paleti kaynağından türet. Bir zemin, bir metin, tek anlamlı vurgu. Saf siyah ve saf beyaz kullanma.
- Vurguyu renkli ya da italik kelimeyle yapma, ölçek, kırpma ya da zamanlamayla yap.
- Ses: sesi duyamazsın, tahmin etme. Her ses olayı ekranda fiziksel bir nesneye bağlı olsun. En az bir tam sessizlik anı olsun.

YASAKLAR (kullanırsan nedenini kartta yaz)
- Inter, Roboto, Open Sans, Poppins, Montserrat, Space Grotesk
- Mor / çivit / camgöbeği gradyan, neon parıltı, cam efekti, koyu zemin + tek asit yeşili, krem + terrakota
- Her şey ortalı, eş boy kart ızgarası, büyük sayı + küçük etiket, cihaz mockup'ı, kendi kendine yazılan terminal
- Her öğenin aşağıdan fade + slide-up girmesi, her şeyde aynı eğri, bounce / elastic, sürekli nefes alan arka plan
- Kelime kelime pop altyazı, sarı aktif kelime, emoji
- Whoosh, ding, klavye tıkırtısı, motivasyonel kurumsal müzik
- "Oyunun kurallarını değiştiren", "bir üst seviye", "unlock", "seamless" gibi ifadeler

ADIM 5: KONTROL
Bitirince videodan 6 kare al ve kendini üç testle sına: (1) Logoyu kapatsam bu video bir rakibin olabilir mi? (2) Üç rastgele kare herhangi bir yapay zeka videosundan ayırt ediliyor mu? (3) Ses kapalıyken ilk 3 saniyede ne olduğu anlaşılıyor mu? Başarısız olan kalemi düzelt, sonra teslim et.

Render etmediğin videoyu hazır diye sunma. Görmediğin kare ve duymadığın ses hakkında gözlem yazma.
```

## Tek satırlık kısa sürüm

Hızlı bir iş için:

```
[Konu] için [format, süre] bir motion videosu yap. Önce yöntemi seç (görünümü değil), üç farklı yön tart, birini seç ve nedenini söyle. Font, palet kökeni, imza öğe ve kullanılmayacak üç şeyi içeren bir stil kartı göster, sonra üret. Inter/Roboto/Poppins, mor gradyan, hep aynı eğri, aşağıdan fade+slide ve whoosh sesi yok. Her sahnede 1 saniye durgunluk olsun. Türkçe karakterleri ve BÜYÜK HARF dönüşümünü test et.
```

## Skill ile fark nedir

| | Skill | Tek prompt |
|---|---|---|
| Kurulum | Bir kez | Yok |
| Her sohbette uygulanma | Otomatik | Elle yapıştırırsın |
| Stil kataloğu (20 stil) | Hazır, bilgi gerekince açılır | Prompta sığmaz, kendin stil tarif edersin |
| Render kalıbı ve kontrol listesi | Hazır | Kısa kurallarla sınırlı |
| Tutarlılık | Yüksek | Sohbet uzadıkça kurallar unutulabilir |

Prompt yönteminde sohbet uzarsa Claude kuralları gevşetebilir. Böyle bir durumda tek cümle yazman yeter: "Stil kartına geri dön ve kuralları yeniden uygula."
