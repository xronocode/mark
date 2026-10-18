---
description: "What differs between the Mac App Store edition of Mark and the Homebrew / direct-download edition."
---

# Editions

Mark ships in two editions built from the same code:

- **Mac App Store**: reviewed by Apple, sandboxed, installed and updated through the App Store.
- **Homebrew / direct download**: the macOS build signed with a Developer ID and notarized by Apple, plus the Windows build. Updates through the in-app updater or `brew upgrade --cask mark`.

The editor is the same in both: rendering, themes, live reload, Split View, the copy formats, print and PDF export, Share, and diffs against a `.before` file.

## What differs

| | Homebrew / direct download | Mac App Store |
|:---|:---:|:---:|
| The editor and everything not listed below | Yes | Yes |
| Share button (macOS share sheet) | Yes | Yes |
| Diff against a `.before` file | Yes | Yes |
| Pandoc export (DOCX, ODT, EPUB… when pandoc is installed) | Yes | No |
| Insert screenshot | Yes (macOS) | No |
| Set Mark as the default Markdown app | Yes (macOS) | No |
| Diff against the last git commit | Yes | No |
| Local live server for agents (localhost HTTP endpoint) | Yes | No |
| In-app updater | Yes | No, updates come from the App Store |
| Help › Support Mark… (Ko-fi) | Yes | No |
| Reviewed by Apple and sandboxed | No (notarized on macOS) | Yes |
| Windows builds | Yes | No |

## Why the difference?

The App Store sandbox does not let an app run other programs (git, pandoc, screencapture) or open a local server. Those features are left out of the App Store build rather than shown in a disabled state.

## Installing

- Mac App Store: [Mark on the Mac App Store](https://apps.apple.com/app/id6814590464)
- Homebrew: `brew tap xronocode/mark && brew install --cask mark`
- Windows: the `x64-setup.exe` installer from [GitHub Releases](https://github.com/xronocode/mark/releases/latest)

See [Installation](./installation) for details.
