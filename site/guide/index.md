---
description: "Learn how to install Mark, open Markdown files and review documents written by your AI agents."
---

# Introduction

Mark is a native WYSIWYG Markdown editor built with [Tauri v2](https://tauri.app) and Vue 3, for macOS and Windows. It renders tables, Mermaid-style diagram blocks, KaTeX math, and code blocks inline while you write.

## Why Mark?

- **Lightweight** — ≈30 MB on disk and a first window in ≈0.4 s (measured on 2.3.0). No Electron, no Chromium: Mark uses the system WebView.
- **AI-native** — Live file-watcher reload, CLI preview mode, diff view. Built for workflows where agents write Markdown and you review it.
- **Full-featured** — 32 themes in light/dark families, project sidebar, find & replace, export to PDF/HTML, source code mode, Split View.

## Quick install

```sh
brew tap xronocode/mark && brew install --cask mark
```

Also on the [Mac App Store](https://apps.apple.com/app/id6814590464), or the Windows `x64-setup.exe` from [GitHub Releases](https://github.com/xronocode/mark/releases/latest). See [Installation](./installation) and [Editions](./editions).

## Platform support

| Platform | Status |
|----------|--------|
| macOS Apple Silicon | Supported (primary) |
| macOS Intel | Not supported by the Homebrew cask |
| Windows x64 | Supported (installer from Releases) |
| Linux | Builds are not published |

## Next steps

- [Installation details](./installation)
- [Quick start](./quickstart)
- [Keyboard shortcuts](./shortcuts)
