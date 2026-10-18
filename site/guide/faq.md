---
title: FAQ
description: "Answers to the common questions about Mark: agent live reload, diagrams, platforms, editions, privacy and the CLI."
---

# FAQ

## What is Mark, and who is it for?

Mark is a free, open-source WYSIWYG Markdown editor for macOS and Windows. It is built for people who read and edit the Markdown files AI agents write — plans, specs and reports — rendered as a finished page while the agent is still working. See [Introduction](/guide/).

## Does the document reload when my agent saves the file?

Yes. Every save on disk reloads the open tab in place and keeps your scroll position. Press **⌘D** to see exactly what changed since you last looked, against a snapshot Mark takes before every reload — see [Diff View](/guide/diff-view) and [CLI Usage](/guide/cli#integration-with-ai-agents).

## Which diagrams can Mark draw?

Any Mermaid-style fenced code block: 32 diagram types, from flowcharts and sequence diagrams to sankey, venn, radar and kanban, drawn in the colours of the current theme. Every type is shown in the [diagram gallery](/diagrams/).

## Is Mark native? How big and fast is it?

Mark is built on Tauri 2 and renders with the system WebView — WebKit on macOS, WebView2 on Windows — instead of shipping its own browser engine. Measured on 2.3.0: a first window in about 0.4 s, about 30 MB on disk, and about 150 MB of memory with a plain document.

## Which systems does Mark run on?

macOS — Homebrew or the .dmg download on Apple silicon, or the Mac App Store edition on macOS 12 or later — and Windows x64 via the installer from GitHub Releases. The Homebrew cask and .dmg are Apple-silicon only; Intel Macs are not supported by the cask. See [Installation](/guide/installation).

## What is the difference between the App Store and the Homebrew/download editions?

The editor is the same. The App Store edition is sandboxed and reviewed by Apple; the Homebrew/download edition adds pandoc export, insert screenshot, the default-Markdown-app setting, git diff, a local live server for agents and the in-app updater. The full table is in [Editions](/guide/editions).

## Is Mark free and open source?

Yes. Mark is released under the MIT licence and the [source is on GitHub](https://github.com/xronocode/mark).

## Does the app collect any data?

No. The app itself has no analytics, no telemetry, no advertising and no account system; your documents never leave your machine. The website measures visits separately, as described on the [privacy page](/privacy).

## How do I open a file from a terminal or an agent?

On macOS, run `open -a Mark report.md` — it launches Mark if it is not running. Agents hand off documents the same way, and `--preview` opens a read-only tab that reloads on every save. See [CLI Usage](/guide/cli).

## What does Mark have to do with Mark Text?

Mark is inspired by Mark Text and began as a port of it; it is a different technical take on the same idea, rebuilt on Tauri 2 and Vue 3.
