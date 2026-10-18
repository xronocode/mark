---
description: "Install Mark on macOS with Homebrew or a release download and keep the app up to date."
---

# Installation

## Mac App Store

[Get Mark on the Mac App Store](https://apps.apple.com/app/id6814590464). Installs and updates through the App Store. See [Editions](./editions) for what differs.

## Homebrew (macOS, Apple silicon)

```sh
brew tap xronocode/mark && brew install --cask mark
```

No Gatekeeper prompts. No `sudo xattr` dance. The cask is notarized.

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

```sh
mark --version
```

Or open Mark from Spotlight / Applications and create a new file with Cmd+N.
