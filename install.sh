#!/bin/bash
# Installs the latest Terminal for macOS from https://github.com/eknemir/terminal/releases
#   curl -fsSL https://raw.githubusercontent.com/eknemir/terminal/main/install.sh | bash
# Downloads Terminal.dmg from the latest release, checks its SHA-256 against the release's SHA256SUMS.txt, copies
# Terminal.app into /Applications and clears the quarantine flag (the app isn't notarized yet).
set -euo pipefail

REPO="eknemir/terminal"
DEST="${TERMINAL_INSTALL_DIR:-/Applications}"
[ "$(uname -s)" = "Darwin" ] || { echo "install.sh is for macOS; on Windows use install.ps1" >&2; exit 1; }

TMP="$(mktemp -d)"
MNT=""
cleanup() { [ -n "$MNT" ] && hdiutil detach "$MNT" -quiet >/dev/null 2>&1 || true; rm -rf "$TMP"; }
trap cleanup EXIT

echo "Terminal: looking up the latest release of $REPO..."
JSON="$(curl -fsSL -H 'Accept: application/vnd.github+json' -H 'User-Agent: terminal-installer' \
  "https://api.github.com/repos/$REPO/releases/latest")"
url_of() { # the browser_download_url of the asset whose name matches the regex $1
  printf '%s' "$JSON" | /usr/bin/python3 -c 'import json,re,sys
for a in json.load(sys.stdin).get("assets", []):
    if re.fullmatch(sys.argv[1], a["name"]): print(a["name"] + "\t" + a["browser_download_url"]); break' "$1"
}
DMG_LINE="$(url_of 'Terminal(-[0-9][^/]*)?\.dmg')"
SUM_LINE="$(url_of 'SHA256SUMS\.txt')"
[ -n "$DMG_LINE" ] || { echo "No Terminal .dmg in the latest release" >&2; exit 1; }
[ -n "$SUM_LINE" ] || { echo "No SHA256SUMS.txt in the latest release: refusing to install an unverified file" >&2; exit 1; }
DMG_NAME="${DMG_LINE%%$'\t'*}"; DMG_URL="${DMG_LINE#*$'\t'}"
SUM_URL="${SUM_LINE#*$'\t'}"

echo "Terminal: downloading $DMG_NAME..."
curl -fL --progress-bar -o "$TMP/$DMG_NAME" "$DMG_URL"
curl -fsSL -o "$TMP/SHA256SUMS.txt" "$SUM_URL"
EXPECTED="$(awk -v n="$DMG_NAME" '{ f=$2; sub(/^\*/, "", f); if (f == n) print tolower($1) }' "$TMP/SHA256SUMS.txt" | head -n1)"
[ -n "$EXPECTED" ] || { echo "SHA256SUMS.txt has no line for $DMG_NAME" >&2; exit 1; }
ACTUAL="$(shasum -a 256 "$TMP/$DMG_NAME" | awk '{print tolower($1)}')"
[ "$ACTUAL" = "$EXPECTED" ] || { echo "Checksum mismatch for $DMG_NAME: expected $EXPECTED, got $ACTUAL" >&2; exit 1; }
echo "Terminal: SHA-256 verified ($ACTUAL)"

MNT="$TMP/mnt"; mkdir -p "$MNT"
hdiutil attach "$TMP/$DMG_NAME" -nobrowse -readonly -quiet -mountpoint "$MNT"
APP="$(find "$MNT" -maxdepth 1 -name '*.app' -print -quit)"
[ -n "$APP" ] || { echo "No .app inside $DMG_NAME" >&2; exit 1; }
NAME="$(basename "$APP")"

SUDO=""
[ -w "$DEST" ] || SUDO="sudo"
echo "Terminal: copying $NAME to $DEST..."
$SUDO rm -rf "$DEST/$NAME"
$SUDO ditto "$APP" "$DEST/$NAME"
$SUDO xattr -dr com.apple.quarantine "$DEST/$NAME" 2>/dev/null || true
echo "Terminal: installed $DEST/$NAME. Chats need Claude Code (the claude command)."
