#!/bin/bash
# FILE: assets/icon/build.sh
# VERSION: 1.0.0
# START_MODULE_CONTRACT
#   PURPOSE: Rebuild every shipped Mark icon artefact from the generated SVG sources (C-33).
#   SCOPE: gen.py → icns (hand-assembled iconset: pixel 16 px master, enlarged-glyph 32/64), ico, Linux/Windows PNG sets, Assets.car via actool.
#   DEPENDS: python3 (+ Pillow for the ico), rsvg-convert, ImageMagick (magick), iconutil, xcrun actool (Xcode 26+).
#   LINKS: .grace/changes/active/C-33; assets/icon/gen.py; src-tauri/tauri.conf.json bundle.icon / bundle.macOS.files
#   ROLE: SCRIPT
#   MAP_MODE: LOCALS
# END_MODULE_CONTRACT
#
# START_MODULE_MAP
#   render - rasterise one SVG to a square PNG.
# END_MODULE_MAP
#
# START_CHANGE_SUMMARY
#   LAST_CHANGE: v1.0.0 - C-33: initial build pipeline; records Assets.car.sources.sha256 for drift detection; ico frames stored as PNG.
# END_CHANGE_SUMMARY
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="$HERE/../../src-tauri/icons"
SITE="$HERE/../../site/public"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

render() { rsvg-convert -w "$2" -h "$2" "$1" -o "$3"; }

python3 "$HERE/gen.py"

# START_BLOCK_ICNS
SET="$TMP/icon.iconset"; mkdir -p "$SET"
render "$HERE/mark-icon-16.svg" 16 "$SET/icon_16x16.png"
render "$HERE/mark-icon-small.svg" 32 "$SET/icon_16x16@2x.png"
render "$HERE/mark-icon-small.svg" 32 "$SET/icon_32x32.png"
render "$HERE/mark-icon-small.svg" 64 "$SET/icon_32x32@2x.png"
for s in 128 256 512; do render "$HERE/mark-icon.svg" "$s" "$SET/icon_${s}x${s}.png"; done
for s in 128 256 512; do render "$HERE/mark-icon.svg" "$((s * 2))" "$SET/icon_${s}x${s}@2x.png"; done
iconutil -c icns "$SET" -o "$OUT/icon.icns"
# END_BLOCK_ICNS

# START_BLOCK_RASTER_SETS
FB="$HERE/mark-icon-full-bleed.svg"
render "$FB" 32 "$OUT/32x32.png"
render "$FB" 64 "$OUT/64x64.png"
render "$FB" 128 "$OUT/128x128.png"
render "$FB" 256 "$OUT/128x128@2x.png"
render "$FB" 512 "$OUT/icon.png"
for s in 30 44 71 89 107 142 150 284 310; do render "$FB" "$s" "$OUT/Square${s}x${s}Logo.png"; done
render "$FB" 50 "$OUT/StoreLogo.png"
for s in 16 24 32 48 64 256; do render "$FB" "$s" "$TMP/ico-$s.png"; done
python3 - "$TMP" "$OUT/icon.ico" <<'PY'
import sys
from PIL import Image
tmp, out = sys.argv[1], sys.argv[2]
big = Image.open(f'{tmp}/ico-256.png')
big.save(out, format='ICO', sizes=[(s, s) for s in (16, 24, 32, 48, 64, 256)])
PY
render "$FB" 96 "$SITE/logo-96px.png"
# END_BLOCK_RASTER_SETS

# START_BLOCK_ASSETS_CAR
mkdir -p "$TMP/car"
xcrun actool "$HERE/AppIcon.icon" --compile "$TMP/car" --platform macosx \
  --minimum-deployment-target 12.0 --app-icon AppIcon \
  --output-partial-info-plist "$TMP/partial.plist" --output-format human-readable-text \
  --notices --warnings --errors > "$TMP/actool.log" 2>&1 || { cat "$TMP/actool.log"; exit 1; }
cp "$TMP/car/Assets.car" "$OUT/Assets.car"
# Record which .icon sources this Assets.car was compiled from; the
# icon-assets test fails when the sources change without a rebuild.
( cd "$HERE/AppIcon.icon" && for f in icon.json $(cd "$HERE/AppIcon.icon" && ls Assets | sort | sed 's|^|Assets/|'); do printf '%s\n' "$f"; cat "$f"; done ) | shasum -a 256 | cut -d' ' -f1 > "$OUT/Assets.car.sources.sha256"
grep -i -E "warning|error" "$TMP/actool.log" || true
# END_BLOCK_ASSETS_CAR

echo "icons rebuilt into $OUT"
