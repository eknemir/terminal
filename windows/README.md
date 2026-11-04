<p align="center">
  <img src="build/icon.png" width="120" alt="Derin Terminal">
</p>

# Derin Terminal — Windows

Derin Terminal'in Windows sürümü: Electron üzerinde çalışan pano, xterm.js ve node-pty (ConPTY) ile terminaller.
Genel tanıtım ve özellikler için [ana README](../README.md).

## Kurulum

PowerShell'de:

```powershell
irm https://raw.githubusercontent.com/eknemir/terminal/main/install.ps1 | iex
```

Betik kurulum dosyasını SHA256 ile doğrular. Alternatif olarak
[Releases](https://github.com/eknemir/terminal/releases) sayfasından `Terminal-Setup-*.exe` indirilebilir.

İlk açılışta SmartScreen uyarısı çıkarsa: "Ek bilgi" → "Yine de çalıştır".

## Geliştirme

```sh
cd windows
npm install          # node-pty hazır derlenmiş gelir, derleme gerekmez
npm start            # uygulamayı kaynaktan çalıştırır
npm run dist         # dist/Terminal-Setup-<sürüm>.exe üretir
npm test             # testler
```

Gereksinimler: Windows 10 veya 11 (64 bit), Node.js 20+.

## Güncellemeler

Uygulama yeni sürümleri kendisi denetler ve uygulama içinden kurar; her indirme yayınla birlikte gelen sağlama
toplamına göre doğrulanır.

## Lisans

MIT, bkz. [LICENSE](../LICENSE).
