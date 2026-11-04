# Installs the latest Terminal for Windows from https://github.com/eknemir/terminal/releases
#   irm https://raw.githubusercontent.com/eknemir/terminal/main/install.ps1 | iex
# Downloads Terminal-Setup-<version>.exe from the latest release, checks its SHA-256 against the release's
# SHA256SUMS.txt, then runs it (per-user install, no administrator needed).
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

$Repo = 'eknemir/terminal'
$Headers = @{ 'User-Agent' = 'terminal-installer'; 'Accept' = 'application/vnd.github+json' }

Write-Host "Terminal: looking up the latest release of $Repo..."
$release = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases/latest" -Headers $Headers
$exe = $release.assets | Where-Object { $_.name -match '^Terminal-Setup-[0-9][^/\\]*\.exe$' } | Select-Object -First 1
$sums = $release.assets | Where-Object { $_.name -eq 'SHA256SUMS.txt' } | Select-Object -First 1
if (-not $exe) { throw "No Terminal-Setup-*.exe in release $($release.tag_name)" }
if (-not $sums) { throw "No SHA256SUMS.txt in release $($release.tag_name): refusing to install an unverified file" }

$dir = Join-Path ([IO.Path]::GetTempPath()) ("terminal-install-" + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $dir | Out-Null
try {
  $file = Join-Path $dir $exe.name
  Write-Host "Terminal: downloading $($exe.name) ($([math]::Round($exe.size / 1MB, 1)) MB)..."
  Invoke-WebRequest -Uri $exe.browser_download_url -OutFile $file -Headers @{ 'User-Agent' = 'terminal-installer' } -UseBasicParsing
  $sumText = (Invoke-WebRequest -Uri $sums.browser_download_url -Headers @{ 'User-Agent' = 'terminal-installer' } -UseBasicParsing).Content
  if ($sumText -is [byte[]]) { $sumText = [Text.Encoding]::UTF8.GetString($sumText) }

  $expected = $null
  foreach ($line in ($sumText -split "`r?`n")) {
    if ($line -match '^\s*([0-9a-fA-F]{64})\s+\*?(.+?)\s*$' -and $Matches[2] -eq $exe.name) { $expected = $Matches[1].ToLower() }
  }
  if (-not $expected) { throw "SHA256SUMS.txt has no line for $($exe.name)" }
  $actual = (Get-FileHash -Algorithm SHA256 -Path $file).Hash.ToLower()
  if ($actual -ne $expected) { throw "Checksum mismatch for $($exe.name): expected $expected, got $actual" }
  Write-Host "Terminal: SHA-256 verified ($actual)"

  Write-Host 'Terminal: running the installer (if SmartScreen warns: More info > Run anyway; it is not code-signed yet)...'
  $p = Start-Process -FilePath $file -PassThru -Wait
  if ($p.ExitCode -ne 0) { throw "The installer exited with code $($p.ExitCode)" }
  Write-Host 'Terminal: installed. Chats need Claude Code: irm https://claude.ai/install.ps1 | iex'
} finally {
  Remove-Item -Recurse -Force $dir -ErrorAction SilentlyContinue
}
