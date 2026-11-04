# macOS'ta derleme

Bu belge Terminal'in (ekranda varsayılan adı "Derin Terminal") macOS uygulamasını kaynak koddan derlemeyi anlatır.
Tüm komutlar `app/` klasöründen çalıştırılır.

## Gerekenler

- **macOS 13 (Ventura) veya üstü** (Package.swift: `.macOS(.v13)`).
- **Xcode Command Line Tools**: `xcode-select --install`. Swift 5.9+ bununla gelir (`swift --version` ile kontrol edin).
  Tam Xcode gerekmez. `sips`, `iconutil`, `lipo`, `codesign`, `hdiutil`, `plutil` de sistemle/CLT ile gelir.
- **python3** (CLT ile gelir): istemci anahtarı varsa onu kaynak dosyaya yazmak için kullanılır.
- **Node.js + npm** — yalnızca 3B gösterge haritasını (`app/orbit`) yeniden derlemek isterseniz:
  ```bash
  cd app/orbit && npm ci && npm run build   # Resources/web/orbit.js dosyasını üretir
  ```
  `Resources/web/orbit.js` depoda hazır duruyorsa bu adım gerekmez; `build-app.sh` Node'u çağırmaz.
- **Claude Code** (`claude` komutu) kurulu ve oturum açılmış olmalı (`claude` ile bir kez giriş yapın). Derleme için
  değil, uygulamanın çalışması için gerekir.
- İnternet: ilk derlemede SwiftPM, SwiftTerm bağımlılığını indirir; `scripts/fetch-rtk.sh` de rtk'yi indirir.

## Derleme

```bash
cd app
./build-app.sh             # yalnız derle  -> build/Terminal.app
./build-app.sh --open      # derle ve aç
./build-app.sh --install   # derle ve ~/Applications/Terminal.app olarak kopyala
UNIVERSAL=1 ./build-app.sh # Apple Silicon + Intel tek uygulamada (dağıtım için)
OUT=build/release ./build-app.sh   # çıktıyı başka klasöre koy
STAGING=1 ./build-app.sh --open    # "Terminal Staging": ayrı bundle id, STAGING şeritli ikon,
                                   # doğrudan ~/Applications'a kurulur, yerel API'ye (127.0.0.1:4800) bağlanır
```

`--open` ve `--install` birlikte verilebilir. Betik sırasıyla şunları yapar:

1. İstemci anahtarı varsa `Sources/TerminalApp/ClientKey+Build.swift` dosyasını yazar (aşağıya bakın).
2. `swift build -c release` (ikili adı `terminal-app`).
3. İkon yoksa ya da `tools/icon-logo.png` / `tools/make-icon.swift` daha yeniyse `tools/make-icon.sh` ile
   `build/AppIcon.icns` üretir (Swift + `sips` + `iconutil`; bu yüzden `.icns` yalnız Mac'te üretilebilir).
4. `build/Terminal.app` paketini kurar: `Info.plist`, `Resources/web`, `Resources/caveman`, ikon.
5. `vendor/rtk/rtk` yoksa `scripts/fetch-rtk.sh` ile indirir; başarısız olursa derleme sürer, yalnız rtk kapalı olur.
6. İmzalar: anahtar zincirinde "Terminal" adlı imza kimliği varsa onunla, yoksa ad-hoc (`-`) imza.

`UNIVERSAL=1` ile Intel için ikinci bir derleme (`.build-x86_64`) yapılır ve `lipo` ile birleştirilir; süre yaklaşık iki katına çıkar.

## DMG oluşturma

```bash
cd app
scripts/make-dmg.sh
```

Bu betik `UNIVERSAL=1 OUT=build/release ./build-app.sh` çalıştırır, sonra `build/Terminal <sürüm>.dmg` oluşturur
(sürüm `Resources/Info.plist` içindeki `CFBundleShortVersionString`). DMG'de uygulama, Applications kısayolu ve
"Nasil acilir - How to open.txt" bulunur.

## İlk açılış (Gatekeeper)

Uygulama Apple'a notarize edilmediği için başka bir Mac'te ilk açılışta "doğrulanamadı" uyarısı çıkar:

- **Sistem Ayarları > Gizlilik ve Güvenlik >** en altta **"Yine de Aç"** (bir kez yeterli), ya da
- Terminal'de: `xattr -dr com.apple.quarantine "/Applications/Terminal.app"`

Kendi Mac'inizde derleyip açtığınız uygulamada bu uyarı genelde çıkmaz.

## İsteğe bağlı parçalar yoksa ne olur?

| Parça | Yoksa |
|---|---|
| İstemci anahtarı `~/.terminal-app/client-key` (staging için `client-key-staging`; `ATALAY_CLIENT_KEY_FILE` ile değiştirilebilir) | **Derleme sorunsuz çalışır.** `ClientKey+Build.swift` silinir, `-DCLIENT_KEY` bayrağı verilmez; uygulama API çağrılarını imzalayamaz (imzalı istek bekleyen sunucu özellikleri çalışmayabilir). Anahtarı `scripts/client-key.sh` üretip API'ye kaydeder, fakat bunun için yönetici belirteci (`ATALAY_ADMIN_TOKEN` veya `~/.terminal-app/admin-token`) gerekir; yoksa betik "no admin token" diyerek çıkar. Kaynaktan derleyen herkes için bu adım gerekmez. |
| İmza kimliği "Terminal" (`scripts/signing-identity.sh`; ad `ATALAY_SIGN_ID` ile değiştirilebilir) | Ad-hoc imza kullanılır. Uygulama çalışır, ancak her yeni derlemede macOS verilen izinleri (ekran kaydı, erişilebilirlik) yeniden sorar. |
| rtk (`vendor/rtk/rtk`) | İndirilemezse uyarı verilir, rtk kapalı olarak derlenir. |
| Node / `app/orbit` derlemesi | `build-app.sh` bunu kullanmaz; yalnız `Resources/web/orbit.js` güncellenmek istenirse gerekir. |
| Arka uç (`../api`, yerel API) | Yalnız `STAGING=1` derlemesi `http://127.0.0.1:4800` adresine bağlanır; normal derleme için gerekmez. |

Not: Ad değişikliği (Atalay → Terminal) sürüyor; bazı ortam değişkenleri hâlâ `ATALAY_` önekiyle geçebilir.
Swift modülü `app/Sources/TerminalApp`, çıktı `build/Terminal.app`'tir.
