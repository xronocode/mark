---
description: "Install Mark on macOS (Mac App Store, Homebrew or a .dmg) and on Windows (the x64 installer), and keep the app up to date."
---

# Installation

## Mac App Store

[Get Mark on the Mac App Store](https://apps.apple.com/app/id6814590464). Installs and updates through the App Store. See [Editions](./editions) for what differs.

## Homebrew (macOS, Apple silicon)

```sh
brew install --cask xronocode/mark/mark
```

No Gatekeeper prompts. No `sudo xattr` dance. The cask is notarized. The tap is added automatically by the one-liner; updates arrive through the in-app updater or `brew upgrade --cask mark`.

## Windows (x64)

Download `Mark_<version>_x64-setup.exe` from [the latest release](https://github.com/xronocode/mark/releases/latest). The installer is not code-signed yet, so SmartScreen shows "Windows protected your PC": choose *More info*, then *Run anyway*.

## Build from source

Requirements: Node.js 20+, Rust 1.77+, macOS 13+.

```sh
git clone https://github.com/xronocode/mark.git
cd mark
npm install
npm run build
```

The built app will be in `src-tauri/target/release/bundle/`.

## Verify installation

Open Mark from Spotlight / Applications and create a new file with Cmd+N — or check the version from a terminal:

```sh
/Applications/Mark.app/Contents/MacOS/mark --print-version
```

Homebrew and the `.dmg` do not put a `mark` command on your `PATH`; see [CLI Usage](./cli) for the app binary, its flags and an optional shell alias.
