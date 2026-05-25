# Installation

## Homebrew (recommended)

```sh
brew tap xronocode/mark && brew install --cask mark@alpha
```

No Gatekeeper prompts. No `sudo xattr` dance. The cask is notarized.

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
