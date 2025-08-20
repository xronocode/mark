<p align="center"><img src="static/logo-small.png" alt="MarkText" width="100" height="100"></p>

<h1 align="center">MarkText</h1>

<div align="center">
  <strong>🔆 下一代 Markdown 编辑器 🌙</strong><br>
  一个简洁优雅的开源 Markdown 编辑器，专注于速度和易用性。<br>
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
  <a href="#english">English</a> | <strong>中文</strong>
</div>

---

## 中文版

- [MarkText](https://github.com/marktext/marktext) 是一个免费开源的 Markdown 编辑器，最初由 [Jocs](https://github.com/Jocs) 和 [贡献者们](https://github.com/marktext/marktext/graphs/contributors) 开发。

- 遗憾的是，核心仓库在大约 3 年前就停止了维护，但在我日常使用中仍然发现了各种影响使用体验的问题。

- 这个仓库是我尝试现代化我最喜欢的 Markdown 编辑器的努力，基于 [Jacob Whall 的分支](https://github.com/jacobwhall/marktext) 进行开发。
  
  - 查看[我的动机](#1-这个分支与其他无数分支有什么不同)

- 您可以在下面阅读更多关于我的动机

# 1. 安装

> ⚠️ 这些版本仍处于 **测试阶段**（因为我不知道在迁移过程中可能破坏了多少功能）。请在 [问题跟踪器](https://github.com/Tkaixiang/marktext/issues) 中报告任何错误。

## Windows

- 直接查看 [发布页面](https://github.com/Tkaixiang/marktext/releases)！

- 测试环境：
  
  - `Windows 11`

## Linux

- 直接查看 [发布页面](https://github.com/Tkaixiang/marktext/releases)
- 测试环境：
  - `Ubuntu 24.0.2`（`AppImage` 和 `.deb` 包）
  - *希望能得到帮助测试其他 Linux 包！*

### Linux 包管理器

##### 1. Arch Linux ![AUR Version](https://img.shields.io/aur/version/marktext-tkaixiang-bin?label=(AUR)%20marktext-tkaixiang-bin)

- 在 [AUR](https://aur.archlinux.org/packages/marktext-tkaixiang-bin) 上可用，感谢 [@kromsam](https://github.com/kromsam)

## MacOS

- 我很遗憾没有 `Apple Developer Account`，这是创建 `Developer ID` 来签名二进制文件所必需的
  
  - 没有签名，所有二进制文件默认会显示为"已损坏"
  
  - *如果您愿意帮助解决这个问题，请随时联系我！*

### macOS 偏好设置修复

- ✅ **已修复**：macOS 版本偏好设置窗口无关闭按钮的问题
  - 现在偏好设置窗口在 macOS 上正确显示关闭按钮
  - 修复了窗口管理相关的用户体验问题

# 2. 截图

![](docs/marktext.png?raw=true)

# 3. ✨功能特性 ⭐

- 实时预览（所见即所得）和简洁的界面，提供无干扰的写作体验。
- 支持 [CommonMark 规范](https://spec.commonmark.org/0.29/)、[GitHub Flavored Markdown 规范](https://github.github.com/gfm/) 和选择性支持 [Pandoc markdown](https://pandoc.org/MANUAL.html#pandocs-markdown)。
- Markdown 扩展，如数学表达式（KaTeX）、前言和表情符号。
- 支持段落和内联样式快捷键，提高写作效率。
- 输出 **HTML** 和 **PDF** 文件。
- 多种主题：**Cadmium Light**、**Material Dark** 等。
- 多种编辑模式：**源代码模式**、**打字机模式**、**专注模式**。
- 直接从剪贴板粘贴图片。

## 3.1 🌙 主题 🔆

| Cadmium Light                                     | Dark                                            |
| ------------------------------------------------- | ----------------------------------------------- |
| ![](docs/themeImages/cadmium-light.png?raw=true)  | ![](docs/themeImages/dark.png?raw=true)         |
| Graphite Light                                    | Material Dark                                   |
| ![](docs/themeImages/graphite-light.png?raw=true) | ![](docs/themeImages/materal-dark.png?raw=true) |
| Ulysses Light                                     | One Dark                                        |
| ![](docs/themeImages/ulysses-light.png?raw=true)  | ![](docs/themeImages/one-dark.png?raw=true)     |

## 3.2 😸编辑模式 🐶

| 源代码模式          | 打字机模式               | 专注模式               |
|:--------------------:|:------------------------:|:-------------------:|
| ![](docs/source.gif) | ![](docs/typewriter.gif) | ![](docs/focus.gif) |

# 4. 国际化支持

## 4.1 🌍 多语言支持

- ✅ **完整的国际化功能**：支持中文和英文界面
- ✅ **智能语言检测**：自动检测系统语言并设置为默认语言
- ✅ **实时语言切换**：在偏好设置中可以实时切换界面语言
- ✅ **菜单栏国际化**：所有菜单项、快捷键描述都支持多语言
- ✅ **偏好设置国际化**：偏好设置窗口完全支持多语言
- ✅ **导出设置国际化**：导出功能相关界面支持多语言

### 支持的语言

- 🇨🇳 **中文（简体）** - 默认语言
- 🇺🇸 **English** - 英语

### 语言切换方法

1. 打开 **偏好设置**（快捷键：`Cmd/Ctrl + ,`）
2. 在 **通用** 选项卡中找到 **语言** 设置
3. 选择您偏好的语言
4. 语言会立即生效，无需重启应用

# 5. 开发动机

## 1. 这个分支与其他无数分支有什么不同？

- 我在研究 `marktext` 时的一个主要不满是开发框架 + 环境老化严重，编译时间极长
  
  - 大多数库都过时了，有些甚至无法在现代版本的 Node.JS/Python 中安装

- 因此，这个分支是一种主要的"重写"，使用 [electron-vite](https://electron-vite.org/) 而不是旧的 `Babel + Webpack` 设置
  
  - 这里的目标是使用**尽可能现代的框架和库**给 `marktext` 一个**全新的开始**
  - 所有内容也已迁移到 `Vue3` 和 `Pinia`，所有库都更新到最新可能的版本

- `main` 和 `preload` 进程仍然编译为 `CommonJS`，但 `renderer` 现在完全是 **`ESModules` 专用**（*这在迁移过程中带来了一些有趣的问题*）

## 2. 太棒了！我如何帮助？

- 任何形式的：
  
  1. 错误测试（错误报告）
  2. 拉取请求
  
  都非常欢迎！

- 您可以在下面找到使用此仓库的基本命令列表，但除此之外 - 文件结构应该与**原始 marktext 非常相似**

## 3. 项目设置

### 先决条件

- Python (`>= 3.12`)

- Node.JS (`>= 22`)

- 很多耐心

### 安装

```bash
$ npm install
```

### 开发

```bash
$ npm run dev
```

### 构建

```bash
# Windows 版本
$ npm run build:win

# macOS 版本
$ npm run build:mac

# Linux 版本
$ npm run build:linux
```

---

<div id="english"></div>

## English Version

<div align="center">
  <strong>🔆 Next generation markdown editor 🌙</strong><br>
  A simple and elegant open-source markdown editor that focused on speed and usability.<br>
</div>

- [MarkText](https://github.com/marktext/marktext) is a free and open source markdown editor originally written by [Jocs](https://github.com/Jocs) and [contributors](https://github.com/marktext/marktext/graphs/contributors).

- Sadly, the core repository became unmaintained since about 3 years ago, but various Quality of Life issues remained that I noticed in my daily usage.

- This repository serves as an attempt at modernising my favourite Markdown Editor, and is a fork based off [Jacob Whall's Fork](https://github.com/jacobwhall/marktext)
  
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

| Cadmium Light                                     | Dark                                            |
| ------------------------------------------------- | ----------------------------------------------- |
| ![](docs/themeImages/cadmium-light.png?raw=true)  | ![](docs/themeImages/dark.png?raw=true)         |
| Graphite Light                                    | Material Dark                                   |
| ![](docs/themeImages/graphite-light.png?raw=true) | ![](docs/themeImages/materal-dark.png?raw=true) |
| Ulysses Light                                     | One Dark                                        |
| ![](docs/themeImages/ulysses-light.png?raw=true)  | ![](docs/themeImages/one-dark.png?raw=true)     |

## 3.2 😸Edit Modes🐶

| Source Code          | Typewriter               | Focus               |
|:--------------------:|:------------------------:|:-------------------:|
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

# 5. Motivation

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

### Pre-Requisites

- Python (`>= 3.12`)

- Node.JS (`>= 22`)

- A lot of patience

### Install

```bash
$ npm install
```

### Development

```bash
$ npm run dev
```

### Build

```bash
# For windows
$ npm run build:win

# For macOS
$ npm run build:mac

# For Linux
$ npm run build:linux
```
