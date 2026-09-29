# winget distribution (C-15 T-105)

`winget install xronocode.Mark` once the first manifest is merged into
microsoft/winget-pkgs.

Flow (after the first live Windows release — the installer URL must resolve):

    tools/winget/sync-manifest.sh v2.2.0-beta

The script downloads the release installer, hashes it, renders the three
manifests (reference copies under `reference/`), sparse-clones
winget-pkgs, pushes a branch to the xronocode fork and opens the PR.
Re-run per release to publish `winget upgrade` versions.

Notes:
- NSIS bundle uses Tauri's default per-user install → `Scope: user`,
  silent switch is NSIS-standard `/S` (matches the CI smoke install).
- Winget only serves PUBLISHED releases — dry-run QA artifacts are not
  winget-installable; testers update via the in-app updater
  (`/releases/latest/download/latest.json`) after the first install.
- Post-merge validation: `winget show xronocode.Mark` /
  `winget upgrade` on a Windows machine.
