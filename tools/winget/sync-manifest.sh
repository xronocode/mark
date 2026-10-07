#!/usr/bin/env bash
# FILE: tools/winget/sync-manifest.sh
# VERSION: 1.2.0
# START_MODULE_CONTRACT
#   PURPOSE: Generate winget-pkgs manifests for a published Mark Windows release and open the submission PR.
#   SCOPE: download the x64 NSIS installer from a live GitHub release, hash it, render installer/locale/version YAML, sparse-clone microsoft/winget-pkgs, push a branch to the xronocode fork, open the PR.
#   DEPENDS: gh (authenticated), git, curl, shasum; network access to github.com.
#   LINKS: .grace/changes/active/C-15/plan.xml T-105; C-15 spec Amendment #3 (winget pulled ahead of the site card); M-046 release lane.
#   ROLE: SCRIPT
#   MAP_MODE: LOCALS
# END_MODULE_CONTRACT
#
# CHANGE_SUMMARY:
#   - 2026-10-07 v1.2.0: catalog enforces ManifestVersion 1.12.0 and filenames
#     MUST carry the full PackageIdentifier prefix (xronocode.Mark.*.yaml, not
#     Mark.*.yaml) — both learned from PR #448088 validation failures.
# START_MODULE_MAP
#   main - tag -> rendered manifests -> fork branch -> PR to microsoft/winget-pkgs
#   render_manifests - write the three YAML files from tag/sha/date into a staging dir
# END_MODULE_MAP
#
# Usage: tools/winget/sync-manifest.sh v2.2.0-beta
# Requires the release to be LIVE (the installer URL must resolve).

set -euo pipefail

TAG="${1:?usage: sync-manifest.sh <tag, e.g. v2.2.0-beta>}"
VER="${TAG#v}"
REPO="xronocode/mark"
PKG_ID="xronocode.Mark"
ASSET="Mark_${VER}_x64-setup.exe"
URL="https://github.com/${REPO}/releases/download/${TAG}/${ASSET}"
WORK="$(mktemp -d /tmp/winget-sync.XXXXXX)"
STAGE="${WORK}/stage"
MANIFEST_DIR="manifests/x/xronocode/Mark/${VER}"

echo "[winget-sync] ${PKG_ID} ${VER}"
echo "[winget-sync] installer: ${URL}"

# START_BLOCK_FETCH_AND_HASH
curl -fSL --retry 3 -o "${WORK}/${ASSET}" "${URL}"
HASH="$(shasum -a 256 "${WORK}/${ASSET}" | awk '{print $1}')"
RELEASE_DATE="$(gh release view "${TAG}" -R "${REPO}" --json publishedAt --jq '.publishedAt[0:10]')"
echo "[winget-sync] sha256=${HASH} date=${RELEASE_DATE}"
# END_BLOCK_FETCH_AND_HASH

# START_BLOCK_RENDER_MANIFESTS
DEST="${STAGE}/${MANIFEST_DIR}"
mkdir -p "${DEST}"

cat > "${DEST}/xronocode.Mark.installer.yaml" <<YAML
# yaml-language-server: \$schema=https://aka.ms/winget-manifest.installer.1.12.0.schema.json
PackageIdentifier: ${PKG_ID}
PackageVersion: ${VER}
InstallerType: nullsoft
Installers:
- Architecture: x64
  InstallerType: nullsoft
  Scope: user
  InstallerUrl: ${URL}
  InstallerSha256: ${HASH}
  InstallModes:
  - silent
  - silentWithProgress
  AppsAndFeaturesEntries:
  - DisplayName: Mark
    DisplayVersion: ${VER}
    Publisher: xronocode
  ReleaseDate: ${RELEASE_DATE}
ManifestType: installer
ManifestVersion: 1.12.0
YAML

cat > "${DEST}/xronocode.Mark.locale.en-US.yaml" <<YAML
# yaml-language-server: \$schema=https://aka.ms/winget-manifest.defaultLocale.1.12.0.schema.json
PackageIdentifier: ${PKG_ID}
PackageVersion: ${VER}
PackageLocale: en-US
Publisher: xronocode
PublisherUrl: https://github.com/${REPO}
PackageName: Mark
Moniker: mark
ShortDescription: Lightweight WYSIWYG markdown editor
Description: Mark is a fast, lightweight WYSIWYG markdown editor — a ~10 MB native (Tauri) port of Mark Text for macOS and Windows with tabs, project tree, themes, pandoc export and a built-in updater.
License: MIT
LicenseUrl: https://github.com/${REPO}/blob/main/LICENSE
Tags:
- markdown
- editor
- wysiwyg
- notes
ReleaseNotesUrl: https://github.com/${REPO}/releases/tag/${TAG}
ManifestType: defaultLocale
ManifestVersion: 1.12.0
YAML

cat > "${DEST}/xronocode.Mark.yaml" <<YAML
# yaml-language-server: \$schema=https://aka.ms/winget-manifest.version.1.12.0.schema.json
PackageIdentifier: ${PKG_ID}
PackageVersion: ${VER}
DefaultLocale: en-US
ManifestType: version
ManifestVersion: 1.12.0
YAML
# END_BLOCK_RENDER_MANIFESTS

# START_BLOCK_SUBMIT_PR
# Blobless depth-1 clone + no-cone sparse on our publisher dir (new package:
# the dir does not exist upstream yet — no-cone patterns allow that).
cd "${WORK}"
git clone --filter=blob:none --sparse --depth 1 https://github.com/microsoft/winget-pkgs.git
cd winget-pkgs
git sparse-checkout set --no-cone 'manifests/x/xronocode/*'
BR="Mark-${VER}"
git checkout -b "${BR}"
mkdir -p "${MANIFEST_DIR}"
cp "${STAGE}/${MANIFEST_DIR}"/*.yaml "${MANIFEST_DIR}/"
git add "${MANIFEST_DIR}"
git commit -m "Add ${PKG_ID} version ${VER}"
gh repo fork microsoft/winget-pkgs --clone=false 2>/dev/null || true
git remote add fork "https://github.com/xronocode/winget-pkgs.git" 2>/dev/null || true
git push -u fork "${BR}"
gh pr create -R microsoft/winget-pkgs \
  --head "xronocode:${BR}" \
  --title "Add ${PKG_ID} version ${VER}" \
  --body "New version of ${PKG_ID}.

- Installer: \`${ASSET}\` from https://github.com/${REPO}/releases/tag/${TAG}
- sha256: \`${HASH}\`
- NSIS per-user installer (\`/S\` silent), x64 only.
- Homepage: https://mark.xronocode.com

Generated with tools/winget/sync-manifest.sh in the Mark repo."
echo "[winget-sync] PR opened for ${VER}"
# END_BLOCK_SUBMIT_PR
