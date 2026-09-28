#!/usr/bin/env bash
# FILE: tools/release/mas-pkg.sh
# VERSION: 1.0.0
# START_MODULE_CONTRACT
#   PURPOSE: C-15 T-M6 — sign the MAS app build with Apple Distribution +
#            Entitlements.plist, wrap into an App Store .pkg via
#            productbuild signed with Mac Installer Distribution.
#   SCOPE: codesign + productbuild + pkgutil --check-signature; no upload
#          (Transporter/upload is a separate human step).
#   DEPENDS: release MAS bundle (tauri build --config mas.conf.json
#            --features app-store), both distribution identities in the
#          login keychain.
#   LINKS: tools/release/asc-metadata.md; .grace/changes/active/C-15 T-M6.
#   ROLE: SCRIPT
#   MAP_MODE: LOCALS
# END_MODULE_CONTRACT
#
# START_MODULE_MAP
#   main - sign app, build signed pkg, verify signatures, print artifact path
# END_MODULE_MAP

set -euo pipefail
cd "$(dirname "$0")/../.."

APP_IDENTITY="Apple Distribution: Mikhail Yevdokimov (NY72L3P5TN)"
PKG_IDENTITY="3rd Party Mac Developer Installer: Mikhail Yevdokimov (NY72L3P5TN)"
APP="target/release/bundle/macos/Mark.app"
PKG="target/release/bundle/macos/Mark-mas.pkg"

say() { printf '%s\n' "$*" >&2; }

[ -d "$APP" ] || { say "missing $APP — build first:"; \
  say "  npx tauri build --config src-tauri/mas.conf.json --features app-store"; exit 1; }

say "== 1/3 signing app =="

# ASC requirement 90869: arm64-only builds must declare macOS >= 12.0.
/usr/libexec/PlistBuddy -c "Delete :LSMinimumSystemVersion" "$APP/Contents/Info.plist" >/dev/null 2>&1 || true
/usr/libexec/PlistBuddy -c "Add :LSMinimumSystemVersion string 12.0" "$APP/Contents/Info.plist"

# ASC requirement 90242: LSApplicationCategoryType must be present.
/usr/libexec/PlistBuddy -c "Delete :LSApplicationCategoryType" "$APP/Contents/Info.plist" >/dev/null 2>&1 || true
/usr/libexec/PlistBuddy -c "Add :LSApplicationCategoryType string public.app-category.productivity" "$APP/Contents/Info.plist"

# ASC requirement 90889: TestFlight builds embed a provisioning profile.
PROFILE="$HOME/Downloads/Mark_MAS.provisionprofile"
if [ -f "$PROFILE" ]; then
  cp "$PROFILE" "$APP/Contents/embedded.provisionprofile"
  say "embedded.provisionprofile installed"
else
  say "WARNING: $PROFILE not found — TestFlight upload will be rejected (90889)"
fi

# ITMS-91109: downloaded files (provisionprofile!) carry com.apple.quarantine
# — ASC rejects the whole package. Strip xattrs from the bundle before signing.
xattr -cr "$APP"

codesign --force --deep --sign "$APP_IDENTITY" \
  --entitlements src-tauri/Entitlements-mas.plist --options runtime "$APP"
codesign --verify --deep --strict "$APP"
say "app signature OK"

say "== 2/3 building pkg =="
rm -f "$PKG"
productbuild --component "$APP" /Applications \
  --sign "$PKG_IDENTITY" "$PKG"

say "== 3/3 verifying pkg =="
pkgutil --check-signature "$PKG"
say "artifact: $PKG ($(du -h "$PKG" | cut -f1))"
say "next: upload via Transporter or 'xcrun altool --upload-app'"
