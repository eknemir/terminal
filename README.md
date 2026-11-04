<p align="center">
  <img src="windows/build/icon.png" width="140" alt="Derin Terminal">
</p>

<h1 align="center">Derin Terminal</h1>

<p align="center">
  Birden çok yapay zekâ kodlama oturumunu (Claude Code, Codex, Antigravity) tek ekranda yöneten masaüstü uygulaması.
  Windows ve macOS için.
</p>

<p align="center">
  <a href="https://github.com/eknemir/terminal/releases"><b>İndir (Releases)</b></a>
</p>

## Özellikler

- **Canlı oturum / yörünge haritası.** Her oturum haritada bir gezegen: çalışıyor, sizi bekliyor ya da onay istiyor
  durumları renkle ayrılır. Alt ajanlar, araç çağrıları, dokunulan dosyalar ve harcama canlı güncellenir.
- **Sohbet pencereleri arka planda çalışır.** Pencereyi kapatsanız da uygulamadan çıksanız da Claude çalışmaya devam
  eder; pencere geçmişiyle birlikte geri gelir.
- **Codex ve Antigravity takibi.** Bu araçların oturumları da kendi kayıtlarından okunur ve haritada görünür.
- **Git paneli.** Oturumların çalıştığı her depo için değişiklikler, commit, geçmiş grafiği ve diff.
- **Dikey video önizleme ve zaman damgalı revizyon notları.** Videoyu izlerken ilgili saniyeye not düşün, notları tek
  tıkla Claude'a gönderin.
- **Efekt presetleri galerisi.** 19 hazır efekt, önizlemeli.
- **Skill yöneticisi ve hazır skill paketi.** Skill'leri uygulama içinden kurun, açıp kapatın.
- **Model seçici.** Haiku, Sonnet ve Opus arasında geçiş.
- **Kişiselleştirme.** Uygulama adı, logo ve tema rengi ayarlardan değişir. Temalar: Cyberpunk, Derin Ajans,
  Gün batımı, Zümrüt ve Özel.
- **Otomatik Claude Code kurulumu.** API anahtarı gerekmez; Claude hesabınızla giriş yaparsınız.

## Kurulum

### Windows

PowerShell'de:

```powershell
irm https://raw.githubusercontent.com/eknemir/terminal/main/install.ps1 | iex
```

Betik, indirdiği kurulum dosyasını SHA256 ile doğrular. Dilerseniz
[Releases](https://github.com/eknemir/terminal/releases) sayfasından `Terminal-Setup-*.exe` dosyasını indirip
elle de kurabilirsiniz.

### macOS

Terminal'de:

```sh
curl -fsSL https://raw.githubusercontent.com/eknemir/terminal/main/install.sh | bash
```

Ya da [Releases](https://github.com/eknemir/terminal/releases) sayfasından `.dmg` dosyasını indirin.

### İlk açılış uyarıları

Uygulama henüz kod imzalı olmadığı için ilk açılışta sistem uyarı verebilir:

- **Windows (SmartScreen):** "Ek bilgi" → "Yine de çalıştır".
- **macOS:** Sistem Ayarları → Gizlilik ve Güvenlik → "Yine de Aç".

## Gereksinimler

- Windows 10 veya 11 (64 bit) ya da macOS 13 ve üzeri (Apple Silicon ve Intel)
- Bir Claude hesabı (Claude Code yoksa uygulama kendisi kurar)
- İsteğe bağlı: Codex ve Antigravity takibi için bu araçların kurulu olması

## Geliştirme

```sh
cd windows
npm install
npm start
```

macOS derlemesi için [docs/BUILD-macOS.md](docs/BUILD-macOS.md). Testler için `npm test`.

## Güncellemeler

Yeni sürümler uygulama içinden bildirilir ve tek tıkla kurulur.

## Lisans

MIT, bkz. [LICENSE](LICENSE).

Claude Code, Codex ve Antigravity ile çalışır; Anthropic, OpenAI veya Google ile bağlantılı değildir.
