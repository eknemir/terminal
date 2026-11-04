# Hareket, Tipografi, Renk ve Ses

## İçindekiler
1. Hareket gramerinin temeli
2. Eğri tablosu
3. Süre ve kare hesapları
4. Tipografi ve font eşleşmeleri
5. Türkçe kontrolleri ve altyazı kuralları
6. Renk türetme
7. Ses

## 1. Hareket gramerinin temeli

Hareketin üç meşru işi var: dikkat yönlendirmek, ilişki göstermek, değişimi açıklamak. Bunlardan birini yapmıyorsa çıkar.

Hareketi "güzel görünsün" diye değil, kamerası olan bir dünyada fizik neyse onu taklit etmek için seç. Ağır bir nesne geç kalkar ve uzun yerleşir. Hafif bir etiket çabuk gelir ve çabuk durur. Kamera operatörü bir pan'in sonunda 2-4 karelik küçük bir düzeltme yapar.

## 2. Eğri tablosu

| Hareket | Eğri | Süre (30 fps) |
|---|---|---|
| Dolly / kamera hareketi | `cubic-bezier(0.55, 0, 0.1, 1)` (ağır kalkış, uzun oturma) | 36-75 kare |
| Hızlanarak terk | `cubic-bezier(0.7, 0, 0.84, 0)` | 9-15 kare |
| Damga / vuruş | easing yok | 1-2 kare |
| Tripod pan | doğrusal, sonda 2-4 karelik düzeltme | duruma göre |
| El kamerası | seed'li, düşük genlikli gürültü | sürekli, az |
| Kalem çizgisi | hızlı, yavaş, hızlı (sinüs ease-in-out) | çizgi uzunluğuna göre |
| Stop-motion | ikili çekim: her 2 karede bir güncelle | 8-12 fps hissi |
| Sert kesme | easing yok | 0 kare |

Her şeye aynı eğriyi ve aynı süreyi vermek klişenin en yaygın biçimidir. Bir videoda en az üç farklı hız karakteri kullan.

## 3. Süre ve kare hesapları

- 30 fps'te 0,1 sn = 3 kare, 0,3 sn = 9 kare, 1 sn = 30 kare.
- Girişler çıkışlardan uzun olsun. Çıkış, girişin yaklaşık yüzde 60-75'i kadar sürsün.
- Sahneler arası hız farkı en az 3 kat. Hep aynı tempo, tempo olmaması demektir.
- İlk hareket 0. karede başlamasın. 3-9 kare bekle, izleyici ekrana yerleşsin.
- **Her sahnede en az 1 saniye hiçbir şey kıpırdamasın.** Sahne evreleri: kurulum, nefes, çözülme. Her şeyi kuruluma yığma.
- Aynı anda tek dikkat odağı. Sıralamayı önem sırasına göre yap.
- Olay listesini kare numaralı yaz (başlangıç dahil, bitiş hariç) ve sabit kalan aralıkları da yaz. Prototipte önce en zor 5-8 saniyeyi çıkar, bütün videoyu sonra bitir.

## 4. Tipografi ve font eşleşmeleri

Font, konunun dünyada hangi yazıyla yaşadığından gelir: tabela, gazete, prospektüs, bilet, senaryo sayfası, afiş. "Modern görünsün" bir font gerekçesi değildir.

Kurallar:
- Tek aile ya da açıkça farklı iki aile (serif + sans ya da sans + mono).
- Uç ağırlık kontrastı (300/900, 100/800). 400/700 gibi hareket halindeyken fark edilmeyen çiftlerden kaçın.
- Vurguyu renk ya da italikle değil ölçek, kırpma, kadrajdan taşma ya da zamanlama (bir vuruş geç gelmek) ile yap.
- 1080×1920 dikey için başlangıç ölçüleri: başlık 90-140 px, gövde 42-54 px, etiket 30-36 px. Telefon önizlemesinde mutlaka kontrol et.

Başlangıç için Türkçe karakter desteği genelde iyi olan, açık lisanslı aileler (hepsini yine de test cümlesiyle doğrula): Fraunces, Newsreader, IBM Plex Serif / Sans / Mono, Archivo (genişlik ekseni), Bricolage Grotesque, Caveat (el yazısı). Stilin dünyasına göre başka aile de seçebilirsin; seçilen font eksik glifte sessizce sistem fontuna düşer.

Fontu `@font-face` ile projeye göm, render öncesi `document.fonts.check('900 100px "FontAdı"')` ile yüklendiğini doğrula.

## 5. Türkçe kontrolleri ve altyazı kuralları

Zorunlu kontroller:
- `<html lang="tr">`
- latin + latin-ext alt kümesi
- JavaScript'te büyük harf dönüşümü `toLocaleUpperCase('tr-TR')` ile. Aksi halde "i" harfi "I" olur ve "İstanbul" yanlış yazılır.
- Test cümleleri: "Pijamalı hasta yağız şoföre çabucak güvendi" ve büyük harf hali. Ayrıca "İSTANBUL" ve "IŞIK" doğru çıkıyor mu bak.

Altyazı:
- Satır başına en fazla yaklaşık 42 karakter, en fazla iki satır.
- Okuma hızı en fazla 17 karakter/saniye, ekranda en az yaklaşık 1 saniye.
- Satırı anlam sınırında böl. Edatı ("gibi", "diye") önceki sözcükten, sıfatı addan ayırma.
- Ondalık virgül, binlik nokta (1.250,50 TL), saat 00.30, üç nokta tek karakter (…).
- Altyazı nötr olabilir, karakteri başlık taşır. Altyazı, başlık ve ses aynı cümleyi üç kez söylemesin.
- Kelime kelime pop, sarı aktif kelime ve emoji kalıbından kaçın.

## 6. Renk türetme

Paleti hex uydurarak değil kaynaktan türet:
- Çekimin son derecelendirmesinden 3-5 renk örnekle
- Mekanın ışık kaynağından (sodyum lamba yaklaşık 2000K, tungsten 3200K, gün ışığı 5600K)
- Baskı tekniğinden (sınırlı mürekkep, kayık baskı)
- Ürünün gerçek malzemesinden

Bir zemin, bir metin, tek anlamlı vurgu yeterli. Rengin anlamı sahneler boyunca sabit kalsın. Kontrast: normal metin en az 4,5:1, büyük metin en az 3:1. Saf #000 ve #fff yerine zemin ve metni paletten türet.

Doku: Kusursuzluk, kod görüntüsünün en büyük ele vereni. Gren (seed'i kare numarası olsun), 1-2 px gate weave, parlak kenarda halation. Hepsini az kullan: bir lensin karakteri gibi, filtre paketi gibi değil.

## 7. Ses

Claude sesi duyamaz. Tahmin etme, ölç.

- Ölçüm: `ffprobe`, `ffmpeg -af loudnorm=print_format=json`, `silencedetect`
- Her ses olayını görüntüdeki fiziksel bir nesneye bağla: kağıdın yerleşmesi, çizginin çizilmesi, damganın inmesi. Karşılığı olmayan ses ekleme.
- Konuşma önde. Müzik konuşmanın altında yaklaşık 18 dB geride.
- Sosyal medya master'ı yaklaşık -14 / -16 LUFS.
- Her videoda en az bir tam sessizlik anı bırak.
- Müzik ve ses için lisansı net kaynak kullan. İnternette görünmek izin değildir.
- Sesi kendin kaydetmek, kütüphaneden seçmekten daha özgün sonuç verir; mümkünse alan kaydı kullan.
