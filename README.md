<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/readme/cover-dark.png">
  <img src="docs/assets/readme/cover.png" alt="Mark: Watch your agent write. A native Markdown editor for macOS and Windows." width="800">
</picture>

<br><br>

**Mark is a WYSIWYG Markdown editor for reading and editing the files your AI agents write, while they write them.**

<br>

[![Latest release](https://img.shields.io/github/v/release/xronocode/mark?style=flat-square)](https://github.com/xronocode/mark/releases/latest)
&ensp;[![Tests](https://github.com/xronocode/mark/actions/workflows/test.yml/badge.svg)](https://github.com/xronocode/mark/actions/workflows/test.yml)
&ensp;[![License: MIT](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)
&ensp;![Platform: macOS · Windows](https://img.shields.io/badge/platform-macOS%20%C2%B7%20Windows-lightgrey?style=flat-square)

</div>

## Install

**Mac App Store**

[Get Mark on the Mac App Store](https://apps.apple.com/app/id6814590464). Installs and updates through the App Store.

**Homebrew (macOS, Apple silicon)**

```sh
brew tap xronocode/mark && brew install --cask mark
```

Developer ID signed and notarized by Apple. Updates through the in-app updater or `brew upgrade --cask mark`.

**Windows (x64)**

Download `Mark_<version>_x64-setup.exe` from [the latest release](https://github.com/xronocode/mark/releases/latest). The installer is not code-signed yet, so SmartScreen shows "Windows protected your PC": choose *More info*, then *Run anyway*.

The App Store build and the Homebrew/download build are the same editor with a few differences. See [Two editions, same editor](#two-editions-same-editor).

## What's new in 2.3

- The first stable release.
- **Split View**: the Markdown source beside the rendered page for the current tab, toggled with ⌥⌘\ (Ctrl+Alt+\ on Windows).
- **Callouts**: GitHub alerts (`> [!TIP]`) and Obsidian callouts render as blocks, in the editor and in exports.
- **Front matter** opens as a properties table. **Footnotes** are on by default.
- **Images** you paste or drop are saved to `assets/` next to the document.
- **Large documents** open about 10 times faster: a 4,100-line file takes about 3 s instead of 37.
- **Mermaid** keeps the last diagram that rendered while you fix a typo, and shows the error below it. Wide diagrams keep their size and scroll.
- **Copy as Structured Text**: for email and chat. No asterisks or brackets, but paragraphs, lists, links and tables survive the paste.
- The interface language setting works again in all 10 languages. New app icon. On macOS, Settings moved to Mark › Settings… (⌘,).
- Fixes: Diff mode shows changes again and closes with ⌘D; context-menu items work on the first click; renaming an open file in the sidebar moves its tab to the new path.

Full history in [CHANGELOG.md](CHANGELOG.md).

## Why Mark

Agents write plans, specs and reports as Markdown. In a terminal the tables collapse and the diagrams are code. Mark shows the finished page and lets you edit it in place.

**Watch your agent write.** Keep the file open while an agent works on it. Every save on disk reloads the tab in place and keeps your scroll position, so you can follow a long pass and step in when it finishes.

<img src="docs/assets/readme/01-agents.png" alt="Mark reloading a plan while an agent edits it" width="800">

**Write in the finished page.** Headings, tables, task lists, footnotes, callouts and front matter look done while you type. When you need the raw Markdown, Split View puts it beside the page.

<img src="docs/assets/readme/06-split.png" alt="Split View with Markdown source on the left and the rendered page on the right" width="800">

**Diagrams and math inline.** Mermaid diagrams, KaTeX formulas and highlighted code render in the document, not in a preview pane.

<img src="docs/assets/readme/03-diagrams.png" alt="A Mermaid flowchart and KaTeX formulas rendered inline" width="800">

**Copy it clean.** Copy as Markdown, as HTML for email, as plain text, or as structured text that keeps paragraphs, bullets, links and tables readable wherever you paste.

<img src="docs/assets/readme/04-copy.png" alt="Copy as Structured Text pasted into a chat" width="800">

Also: more than 30 light and dark themes, a folder sidebar, find in file and in folder, a diff view against a `.before` file, print and PDF export, and no account, analytics or telemetry.

## Numbers

Measured on 2026-10-15 on one Apple silicon Mac, Mark 2.3.0. Your numbers will differ.

| | Mark |
|:---|:---|
| First window | ≈ 0.4 s |
| On disk | ≈ 30 MB |
| Memory, plain document | ≈ 150 MB (Mark process 33 MB plus its WebKit page renderer) |
| Memory, rich document (Mermaid, KaTeX, a table) | ≈ 310 MB |
| Same rich document in an Electron notes app | ≈ 400 MB |
| Same rich document in an Electron code editor | ≈ 1 GB |
| Opening a 4,100-line file | ≈ 3 s |

Mark uses the system WebView (WebKit on macOS, WebView2 on Windows) instead of shipping its own browser engine.

## Two editions, same editor

Mark ships in two editions built from the same code. The editor, rendering, themes, live reload, Split View, copy formats, print and PDF export, Share, and diffs against a `.before` file are the same in both.

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
| Reviewed by Apple and sandboxed | No (notarized on macOS) | Yes |
| Windows builds | Yes | No |

**Why the difference?** The App Store sandbox does not let an app run other programs (git, pandoc, screencapture) or open a local server, so those features are left out of the App Store build.

## Set up your agent

Add this to your agent's instructions (`CLAUDE.md`, `AGENTS.md`, a system prompt, or whatever your agent reads):

```markdown
When you produce a plan, spec, report, or any document longer than ~50 lines,
write it to a .md file and open it for the user:

    open -a Mark <file>.md        # macOS

The user reads and edits it in Mark, which reloads the file whenever it changes
on disk. When the file changes after you wrote it, read it again: the user left
corrections or comments inline. Treat those edits as your next instruction.
```

Your agent writes, Mark renders, you edit, the agent reads your changes.

<details>
<summary><b>Example: review a plan before the agent runs it</b></summary>

```
You: "Write an implementation plan for the new auth module."

The agent writes plan.md and runs `open -a Mark plan.md`.

You read it with the tables and Mermaid diagrams rendered.
You delete step 3, rewrite step 5 and add a note: "use JWT, not sessions".
Save.

The agent reads the file again:
"Step 3 removed, step 5 now uses JWT. Proceeding with the revised plan."
```

</details>

<details>
<summary><b>Example: a knowledge base two authors keep</b></summary>

```
Add to your agent's instructions:

    Maintain a knowledge base in docs/kb.md.
    After each significant decision, append a dated entry.
    The user may reorganise or annotate entries in Mark;
    treat their edits as authoritative.

Open docs/kb.md in Mark once and leave it open.
Every time the agent appends, the tab reloads.
```

</details>

<details>
<summary><b>Command-line flags</b></summary>

The Mark binary accepts these flags. On macOS, `open -a Mark --args --watch notes.md` passes them when Mark starts.

| Flag | Effect |
|:---|:---|
| `--preview` | Open the file read-only; click to start editing |
| `--watch` | Reload the file whenever it changes on disk, even if live reload is off in Settings |
| `--diff` | Open the file in diff view |
| `-d`, `--dir <DIR>` | Open a folder as the sidebar root |

If `notes.md.before` sits next to `notes.md`, diff view compares against it. Have your agent copy the file to `.before` before it edits, and you see exactly what changed.

</details>

## Build from source

Requirements: Node.js 22, stable Rust, and on macOS the Xcode command line tools.

```sh
git clone https://github.com/xronocode/mark.git && cd mark
npm ci
npm run tauri dev       # development build with hot reload
npm run tauri build     # release bundle in target/release/bundle
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for tests and pull requests.

## Acknowledgements

Mark began as a port of [MarkText](https://github.com/marktext/marktext) and would not exist without it:

- **[@Jocs](https://github.com/Jocs)** created MarkText: the muya WYSIWYG engine, the theme system, and the inline editing model Mark still builds on.
- **[@Tkaixiang](https://github.com/Tkaixiang)** maintained the [community fork](https://github.com/Tkaixiang/marktext) that kept MarkText alive with security fixes (CVE-2023-2318), crash fixes and the Mermaid v11 upgrade. Mark's early Electron phase was based on that fork.
- **The MarkText community**: years of issues and pull requests about what a good Markdown editor should do.
- **The Tauri team**, for a framework that runs on the system WebView.

## Contributing

Bug reports, ideas and pull requests are welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md). To report a security problem, see [SECURITY.md](SECURITY.md).

Documentation: [mark.xronocode.com](https://mark.xronocode.com). If Mark is useful to you, you can [support it on Ko-fi](https://ko-fi.com/xronocode).

## License

[MIT](LICENSE). Maintained by [@xronocode](https://github.com/xronocode).
