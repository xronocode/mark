<p align="center"><img src="static/logo-small.png" alt="MarkText" width="100" height="100"></p>

<h1 align="center">MarkText</h1>

<div align="center">
  <strong>🔆 Next generation markdown editor 🌙</strong><br>
  A simple and elegant open-source markdown editor that focused on speed and usability.<br>
</div>

<div align="center">
  <!-- Latest Release Version -->
  <a href="https://github.com/Tkaixiang/marktext/releases/latest">
    <img alt="GitHub Release" src="https://img.shields.io/github/v/release/tkaixiang/marktext">
  </a>
  <!-- Downloads total -->
  <a href="https://github.com/Tkaixiang/marktext/releases">
    <img alt="GitHub Downloads (all assets, all releases)" src="https://img.shields.io/github/downloads/tkaixiang/marktext/total">
  </a>
  <!-- Downloads latest release -->
  <a href="https://github.com/Tkaixiang/marktext/releases/latest">
    <img alt="GitHub Downloads (all assets, latest release)" src="https://img.shields.io/github/downloads/tkaixiang/marktext/latest/total">
  </a>
</div>

<div align="center">
  <strong>English</strong> | <a href="#简体中文">简体中文</a> | <a href="#繁體中文">繁體中文</a> | <a href="#한국어">한국어</a> | <a href="#日本語">日本語</a> | <a href="#español">Español</a> | <a href="#français">Français</a> | <a href="#português">Português</a> | <a href="#deutsch">Deutsch</a>
</div>

---

- [MarkText](https://github.com/marktext/marktext) is a free and open source markdown editor originally written by [Jocs](https://github.com/Jocs) and [contributors](https://github.com/marktext/marktext/graphs/contributors).
- Sadly, the core repository became unmaintained since about 3 years ago, but various Quality of Life issues remained that I noticed in my daily usage.
- This repository serves as an attempt at modernising my favourite Markdown Editor, and is a fork based off [Jacob Whall's Fork](https://github.com/jacobwhall/marktext)

  - See [my motivation below](#5-motivation)
- You can read more about my motivation below
- Multi-language support powered by Trae AI Claude 4.0

# 1. Installing

> ⚠️ These releases are still in **beta** (since I do not know how much stuff I might have broken during the migration). Please report any bugs in the [issue tracker](https://github.com/Tkaixiang/marktext/issues)

## Windows

- Simply check out the [Releases Page](https://github.com/Tkaixiang/marktext/releases)!
- Tested on:

  - `Windows 11`

## Linux

- Simply check out the [Releases Page](https://github.com/Tkaixiang/marktext/releases)
- Tested on:
  - `Ubuntu 24.0.2` (`AppImage` and `.deb` packages)
  - *Would love some help in testing the other Linux packages!*

### Linux Package Managers

##### 1. Arch Linux ![AUR Version](https://img.shields.io/aur/version/marktext-tkaixiang-bin?label=(AUR)%20marktext-tkaixiang-bin)

- 在 [AUR](https://aur.archlinux.org/packages/marktext-tkaixiang-bin) 上可用，感谢 [@kromsam](https://github.com/kromsam)

## MacOS

- Simply check out the [Releases Page](https://github.com/Tkaixiang/marktext/releases)

- I unfortunately do not have an `Apple Developer Account` which is required to create a `Developer ID` to sign the binaries

  - Without signing, all binaries will appear as "Damaged" by default
  - *If you would love to help with this, feel free to reach out!*

### macOS Preferences Fix

- ✅ **Fixed**: macOS version preferences window missing close button issue
  - Preferences window now properly displays close button on macOS
  - Fixed window management related user experience issues


# 2. Screenshots

![](docs/marktext.png?raw=true)

# 3. ✨Features ⭐

- Realtime preview (WYSIWYG) and a clean and simple interface to get a distraction-free writing experience.
- Support [CommonMark Spec](https://spec.commonmark.org/0.29/), [GitHub Flavored Markdown Spec](https://github.github.com/gfm/) and selective support [Pandoc markdown](https://pandoc.org/MANUAL.html#pandocs-markdown).
- Markdown extensions such as math expressions (KaTeX), front matter and emojis.
- Support paragraphs and inline style shortcuts to improve your writing efficiency.
- Output **HTML** and **PDF** files.
- Various themes: **Cadmium Light**, **Material Dark** etc.
- Various editing modes: **Source Code mode**, **Typewriter mode**, **Focus mode**.
- Paste images directly from clipboard.

## 3.1 🌙 Themes🔆

| Cadmium Light                                   | Dark                                          |
| ----------------------------------------------- | --------------------------------------------- |
| ![](docs/themeImages/cadmium-light.png?raw=true)  | ![](docs/themeImages/dark.png?raw=true)         |
| Graphite Light                                  | Material Dark                                 |
| ![](docs/themeImages/graphite-light.png?raw=true) | ![](docs/themeImages/materal-dark.png?raw=true) |
| Ulysses Light                                   | One Dark                                      |
| ![](docs/themeImages/ulysses-light.png?raw=true)  | ![](docs/themeImages/one-dark.png?raw=true)     |

## 3.2 😸Edit Modes🐶

|    Source Code    |       Typewriter       |       Focus       |
| :----------------: | :--------------------: | :---------------: |
| ![](docs/source.gif) | ![](docs/typewriter.gif) | ![](docs/focus.gif) |

# 4. Internationalization Support

## 4.1 🌍 Multi-language Support

- ✅ **Complete internationalization**: Support for multiple language interfaces
- ✅ **Smart language detection**: Automatically detects system language and sets as default
- ✅ **Real-time language switching**: Switch interface language in preferences in real-time
- ✅ **Menu bar internationalization**: All menu items and shortcut descriptions support multiple languages
- ✅ **Preferences internationalization**: Preferences window fully supports multiple languages
- ✅ **Export settings internationalization**: Export-related interfaces support multiple languages

### Supported Languages

- 🇺🇸 **English** - Default language
- 🇨🇳 **简体中文 (Simplified Chinese)**
- 🇹🇼 **繁體中文 (Traditional Chinese)**
- 🇰🇷 **한국어 (Korean)**
- 🇯🇵 **日本語 (Japanese)**
- 🇪🇸 **Español (Spanish)**
- 🇫🇷 **Français (French)**
- 🇵🇹 **Português (Portuguese)**
- 🇩🇪 **Deutsch (German)**

### How to Switch Languages

1. Open **Preferences** (Shortcut: `Cmd/Ctrl + ,`)
2. Find **Language** setting in the **General** tab
3. Select your preferred language
4. Language takes effect immediately without restarting the application

---

<div id="english"></div>

## English Version

<div align="center">
  <strong>🔆 Next generation markdown editor 🌙</strong><br>
  A simple and elegant open-source markdown editor that focused on speed and usability.<br>
</div>

- [MarkText](https://github.com/marktext/marktext) is a free and open source markdown editor originally written by [Jocs](https://github.com/Jocs) and [contributors](https://github.com/marktext/marktext/graphs/contributors).
- Sadly, the core repository became unmaintained since about 3 years ago, but various Quality of Life issues remained that I noticed in my daily usage.
- This repository serves as an attempt at modernising my favourite Markdown Editor, and is a fork based off [Jacob Whall&#39;s Fork](https://github.com/jacobwhall/marktext)

  - See [my motivation below](#1-soo-is-this-fork-any-different-from-the-countless-others)
- You can read more about my motivation below

# 1. Installing

> ⚠️ These releases are still in **beta** (since I do not know how much stuff I might have broken during the migration). Please report any bugs in the [issue tracker](https://github.com/Tkaixiang/marktext/issues)

## Windows

- Simply check out the [Releases Page](https://github.com/Tkaixiang/marktext/releases)!
- Tested on:

  - `Windows 11`

## Linux

- Simply check out the [Releases Page](https://github.com/Tkaixiang/marktext/releases)
- Tested on:
  - `Ubuntu 24.0.2` (`AppImage` and `.deb` packages)
  - *Would love some help in testing the other Linux packages!*

### Linux Package Managers

##### 1. Arch Linux ![AUR Version](https://img.shields.io/aur/version/marktext-tkaixiang-bin?label=(AUR)%20marktext-tkaixiang-bin)

- Available on [AUR](https://aur.archlinux.org/packages/marktext-tkaixiang-bin) thanks to [@kromsam](https://github.com/kromsam)

## MacOS

- I unfortunately do not have an `Apple Developer Account` which is required to create a `Developer ID` to sign the binaries

  - Without signing, all binaries will appear as "Damaged" by default
  - *If you would love to help with this, feel free to reach out!*

### macOS Preferences Fix

- ✅ **Fixed**: macOS version preferences window missing close button issue
  - Preferences window now properly displays close button on macOS
  - Fixed window management related user experience issues

# 2. Screenshots

![](docs/marktext.png?raw=true)

# 3. ✨Features ⭐

- Realtime preview (WYSIWYG) and a clean and simple interface to get a distraction-free writing experience.
- Support [CommonMark Spec](https://spec.commonmark.org/0.29/), [GitHub Flavored Markdown Spec](https://github.github.com/gfm/) and selective support [Pandoc markdown](https://pandoc.org/MANUAL.html#pandocs-markdown).
- Markdown extensions such as math expressions (KaTeX), front matter and emojis.
- Support paragraphs and inline style shortcuts to improve your writing efficiency.
- Output **HTML** and **PDF** files.
- Various themes: **Cadmium Light**, **Material Dark** etc.
- Various editing modes: **Source Code mode**, **Typewriter mode**, **Focus mode**.
- Paste images directly from clipboard.

## 3.1 🌙 Themes🔆

| Cadmium Light                                   | Dark                                          |
| ----------------------------------------------- | --------------------------------------------- |
| ![](docs/themeImages/cadmium-light.png?raw=true)  | ![](docs/themeImages/dark.png?raw=true)         |
| Graphite Light                                  | Material Dark                                 |
| ![](docs/themeImages/graphite-light.png?raw=true) | ![](docs/themeImages/materal-dark.png?raw=true) |
| Ulysses Light                                   | One Dark                                      |
| ![](docs/themeImages/ulysses-light.png?raw=true)  | ![](docs/themeImages/one-dark.png?raw=true)     |

## 3.2 😸Edit Modes🐶

|    Source Code    |       Typewriter       |       Focus       |
| :----------------: | :--------------------: | :---------------: |
| ![](docs/source.gif) | ![](docs/typewriter.gif) | ![](docs/focus.gif) |

# 4. Internationalization Support

## 4.1 🌍 Multi-language Support

- ✅ **Complete internationalization**: Support for Chinese and English interfaces
- ✅ **Smart language detection**: Automatically detects system language and sets as default
- ✅ **Real-time language switching**: Switch interface language in preferences in real-time
- ✅ **Menu bar internationalization**: All menu items and shortcut descriptions support multiple languages
- ✅ **Preferences internationalization**: Preferences window fully supports multiple languages
- ✅ **Export settings internationalization**: Export-related interfaces support multiple languages

### Supported Languages

- 🇨🇳 **Chinese (Simplified)** - Default language
- 🇺🇸 **English**

### How to Switch Languages

1. Open **Preferences** (Shortcut: `Cmd/Ctrl + ,`)
2. Find **Language** setting in the **General** tab
3. Select your preferred language
4. Language takes effect immediately without restarting the application

# 5. Project Motivation

1. I love writing. I have used many markdown editors, yet there is still no editor that can fully satisfy my needs. I don't like being distracted by unnecessary buttons or toolbars during writing, but sometimes I need speed. **MarkText** uses virtual DOM to render pages, which has the characteristics of high efficiency and open source, so that real-time preview and the smooth experience it gives you can be achieved.
2. As mentioned above, **MarkText** will be free and open source forever. We hope that all markdown lovers can contribute their own code and help develop **MarkText** into a popular markdown editor.
3. There are many markdown editors, each with their own merits, but it is still difficult for all markdown users to find a perfect editor. I hope **MarkText** can satisfy the needs of as many markdown users as possible. Although the latest version of **MarkText** is not yet perfect, we will try our best to make it as perfect as possible.

# 6. Contributing

**MarkText** is in full development, please make sure to read the [Contributing Guide](CONTRIBUTING.md) before making a PR. Want to add some features to **MarkText**? Please refer to [TODO LIST](https://github.com/marktext/marktext/blob/master/.github/TODOLIST.md) and open issues.

## Differences from Original MarkText

This project is based on further development of [Jacob Whall](https://github.com/jacobwhall/marktext)'s MarkText fork, with main improvements including:

### Technical Architecture Upgrade
- 🔄 **Build Tool Modernization**: Using `electron-vite` to replace the original `Babel + Webpack` build system
- ⚡ **Development Experience Optimization**: Faster hot reload and build speed
- 🎯 **Vue3 Ecosystem Migration**: Migrated from Vue2 to Vue3, using `Pinia` to replace `Vuex` for state management
- 📦 **Library Updates**: All libraries updated to their latest possible versions
- 🔧 **ESModules Support**: The `renderer` process is now fully **`ESModules` only**

## 1. Soo is this fork any different from the countless others?

- A main gripe I had when looking into `marktext` was that the development framework + environment was aging badly and took forever to compile

  - Most libraries were outdated and some couldn't even be installed with modern versions of Node.JS/Python
- Hence, this fork is kind of a major "re-write" that makes use of [electron-vite](https://electron-vite.org/) instead of the old `Babel + Webpack` setup

  - The goal here is to give `marktext` a **fresh start** using **modern frameworks and libraries as much as possible**
  - Everything has also been migrated to `Vue3` and `Pinia` with all libraries updated to their latest possible versions
- The `main` and `preload` processes are still compiled to `CommonJS`, but the `renderer` is now fully **`ESModules` only** (_which posed some interesting issues during migration_)

## 2. That's cool! How can I help?

- Any form of:

  1. Testing for bugs (Bug-Reports)
  2. Pull Requests

  Are more than welcome!
- You can find a basic list of commands for getting around this repo below, but otherwise - the file structure should be **very similar to the original marktext**

## 3. Project Setup

### Prerequisites

Before getting started, please ensure you have the following software installed on your computer:

- [Node.js](https://nodejs.org/) (>= 16.x, latest LTS version recommended)
- [Git](https://git-scm.com/)

### Installation

```bash
# Clone the repository
git clone https://github.com/Tkaixiang/marktext.git
cd marktext

# Install dependencies
npm install
```

### Development

```bash
# Start development server
npm run dev
```

### Build

```bash
# Build application
npm run build

# Build Windows version
npm run build:win

# Build macOS version
npm run build:mac

# Build Linux version
npm run build:linux
```
