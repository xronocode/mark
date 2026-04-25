<p align="center"><img src="static/logo-small.png" alt="Mark" width="100" height="100"></p>

<h1 align="center">Mark</h1>

<div align="center">
  <strong>🔆 Modernized Markdown editor with Russian support 🌙</strong><br>
  A simple and elegant open-source Markdown editor focused on speed and usability.<br>
</div>

<div align="center">
  <a href="https://github.com/xronocode/mark/releases/latest">
    <img alt="GitHub Release" src="https://img.shields.io/github/v/release/xronocode/mark">
  </a>
  <a href="https://github.com/xronocode/mark/releases">
    <img alt="GitHub Downloads" src="https://img.shields.io/github/downloads/xronocode/mark/total">
  </a>
</div>

---

## Lineage

This project is a downstream fork in a chain of Markdown editor work:

1. **[marktext/marktext](https://github.com/marktext/marktext)** — original by [Jocs](https://github.com/Jocs) and [contributors](https://github.com/marktext/marktext/graphs/contributors). Unmaintained for ~3 years.
2. **[Tkaixiang/marktext](https://github.com/Tkaixiang/marktext)** — actively maintained modernization fork by [@tkaixiang](https://github.com/tkaixiang) which migrated the stack to electron-vite + Vue 3 + Pinia and bumped Electron to 41. **This is the upstream we track.**
3. **[xronocode/mark](https://github.com/xronocode/mark)** (this repo) — adds Russian localization, ad-hoc macOS signing for Apple Silicon, and Homebrew cask distribution. Roadmap also includes a Tauri v2 port for ~15 MB footprint.

All credit for the editor itself goes to Jocs, tkaixiang, and the marktext community. We rebase on tkaixiang's `main` branch and contribute fixes upstream where appropriate.

## Installing

> ⚠️ Beta releases. Please report bugs in the [issue tracker](https://github.com/xronocode/mark/issues).

### macOS (Apple Silicon and Intel)

Coming soon via Homebrew tap:

```bash
brew tap xronocode/mark
brew install --cask mark
```

The cask postflight script clears the quarantine attribute automatically, so no manual `xattr -cr` is needed. Until the cask is published, see the [Releases page](https://github.com/xronocode/mark/releases).

### Windows / Linux

See the [Releases page](https://github.com/xronocode/mark/releases). For Arch Linux, the upstream `marktext-tkaixiang-bin` AUR package by [@kromsam](https://github.com/kromsam) is also a viable choice.

## Screenshots

![](docs/marktext.png?raw=true)

## Features

- 🆕 Now available in **10 languages** from the `Preferences` editor (Russian translation added by this fork; the other 9 by [@hubo1989](https://github.com/hubo1989) upstream):

  - `English` 🇺🇸
  - `Русский` 🇷🇺
  - `简体中文` 🇨🇳
  - `繁體中文` 🇹🇼
  - `Deutsch` 🇩🇪
  - `Español` 🇪🇸
  - `Français` 🇫🇷
  - `日本語` 🇯🇵
  - `한국어` 🇰🇷
  - `Português` 🇵🇹

- Realtime preview (WYSIWYG) with a clean, distraction-free interface.

- Supports [CommonMark](https://spec.commonmark.org/0.29/), [GitHub Flavored Markdown](https://github.github.com/gfm/) and selective [Pandoc Markdown](https://pandoc.org/MANUAL.html#pandocs-markdown).

- Markdown extensions: math expressions (KaTeX), front matter, emojis, footnotes, super/subscript.

- Diagram blocks: Mermaid (v11), Vega-Lite, PlantUML, flowcharts, sequence diagrams.

- Output to **HTML** and **PDF**.

- **33 built-in themes** including Dracula, Nord, Catppuccin, Tokyo Night, Gruvbox, and more.

- Editing modes: **Source Code**, **Typewriter**, **Focus**.

- Paste images directly from clipboard.

### Themes

**Light**: Ayu Light, Cadmium Light, Catppuccin Latte, Everforest Light, Graphite Light, Gruvbox Light, Rosé Pine Dawn, Solarized Light, Tokyo Night Light, Ulysses Light

**Dark**: Ayu Dark, Ayu Mirage, Cadmium Dark, Catppuccin Mocha, cyberdream, Dracula, Everforest Dark, Gruvbox Dark, Horizon Dark, Kanagawa, Material Dark, Monokai Pro, Nightfox, Nord, One Dark, Oxocarbon Dark, Palenight, Rosé Pine, Rosé Pine Moon, Solarized Dark, Synthwave '84, Tokyo Night, Tokyo Night Storm

| Cadmium Light                                     | Dark                                            |
| ------------------------------------------------- | ----------------------------------------------- |
| ![](docs/themeImages/cadmium-light.png?raw=true)  | ![](docs/themeImages/dark.png?raw=true)         |
| Graphite Light                                    | Material Dark                                   |
| ![](docs/themeImages/graphite-light.png?raw=true) | ![](docs/themeImages/materal-dark.png?raw=true) |
| Ulysses Light                                     | One Dark                                        |
| ![](docs/themeImages/ulysses-light.png?raw=true)  | ![](docs/themeImages/one-dark.png?raw=true)     |

> 📖 See [docs/THEMES.md](docs/THEMES.md) for the complete theme list.

### Edit Modes

| Source Code          | Typewriter               | Focus               |
|:--------------------:|:------------------------:|:-------------------:|
| ![](docs/source.gif) | ![](docs/typewriter.gif) | ![](docs/focus.gif) |

## Contributors

Original authors and upstream contributors:

<a href="https://github.com/marktext/marktext/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=marktext/marktext" />
</a>

Modernization fork (electron-vite + Vue 3):

<a href="https://github.com/Tkaixiang/marktext/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=Tkaixiang/marktext" />
</a>

This downstream fork (xronocode/mark): see [commit log](https://github.com/xronocode/mark/commits/main).

## Project Setup

See [Developer Documentation](docs/dev/README.md). Quick start:

```bash
# Clean install (skip native postinstall, then rebuild against Electron ABI)
npm install --ignore-scripts
node node_modules/electron/install.js
./node_modules/.bin/electron-rebuild

# Generate locale .min.json files
npm run minify-locales

# Production build
npm run build

# Run unpacked (preview mode — needs PERF_TESTING for locale lookup)
unset ELECTRON_RUN_AS_NODE
PERF_TESTING=true ./node_modules/.bin/electron .
```

## License

MIT — see [LICENSE](LICENSE). Original copyright Jocs 2017+, tkaixiang 2024+, xronocode 2026+.
