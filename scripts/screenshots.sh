#!/usr/bin/env bash
# README の画像（docs/images/report-{light,dark}.png）を撮り直す。
# 使い方: scripts/screenshots.sh [対象リポジトリ]（既定 ../tekito-uranai）
# Chrome を画面なし（headless）で動かして撮る。Mac 以外では CHROME に Chrome のパスを渡す。
set -euo pipefail

target="${1:-../tekito-uranai}"
chrome="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
out="$(mktemp -d)"
trap 'rm -rf "$out"' EXIT

npm run -s cli -- report "$target" --out "$out" > /dev/null

# preferredColorScheme: 0 = ダーク、1 = ライト
for scheme in light dark; do
  value=$([ "$scheme" = light ] && echo 1 || echo 0)
  "$chrome" --headless=new --disable-gpu --hide-scrollbars \
    --window-size=1280,760 --virtual-time-budget=5000 \
    --blink-settings=preferredColorScheme=$value \
    --screenshot="docs/images/report-$scheme.png" "file://$out/index.html" 2> /dev/null
  echo "docs/images/report-$scheme.png"
done
