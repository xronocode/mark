#!/usr/bin/env bash
set -euo pipefail

# Build Mark for Mac App Store submission.
#
# Prerequisites:
#   - "Apple Distribution" certificate in keychain
#   - "3rd Party Mac Developer Installer" certificate in keychain
#   - Provisioning profile for com.xronocode.mark
#
# Usage:
#   ./tools/build-mas.sh
#
# Output:
#   target/mas/Mark.pkg — ready for upload via Transporter or xcrun altool

SIGNING_ID="Apple Distribution: Mikhail Yevdokimov (NY72L3P5TN)"
INSTALLER_ID="3rd Party Mac Developer Installer: Mikhail Yevdokimov (NY72L3P5TN)"
ENTITLEMENTS="src-tauri/entitlements.mas.plist"
APP_DIR="target/release/bundle/macos/Mark.app"
OUT_DIR="target/mas"
VERSION=$(grep '"version"' src-tauri/tauri.conf.json | head -1 | sed 's/.*: "//;s/".*//')

echo "==> Building Mark v${VERSION} for Mac App Store (app-store feature)"

# Step 1: Build with app-store feature, no updater
npm run build
cargo tauri build \
  --no-default-features \
  --features app-store \
  --config src-tauri/tauri.mas.conf.json

echo "==> Signing ${APP_DIR}"

# Step 2: Sign the .app bundle
codesign --deep --force \
  --sign "${SIGNING_ID}" \
  --entitlements "${ENTITLEMENTS}" \
  --options runtime \
  "${APP_DIR}"

# Step 3: Verify signature
codesign --verify --deep --strict "${APP_DIR}"
echo "==> Signature OK"

# Step 4: Create installer .pkg
mkdir -p "${OUT_DIR}"
productbuild \
  --component "${APP_DIR}" /Applications \
  --sign "${INSTALLER_ID}" \
  "${OUT_DIR}/Mark-${VERSION}.pkg"

echo "==> Built: ${OUT_DIR}/Mark-${VERSION}.pkg"
echo ""
echo "Upload with:"
echo "  xcrun altool --upload-app -f ${OUT_DIR}/Mark-${VERSION}.pkg -t macos -u \$APPLE_ID -p \$APP_SPECIFIC_PASSWORD"
echo "  # or use Transporter.app"
