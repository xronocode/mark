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

## When the App Store catches up

The App Store edition updates only after Apple reviews each build, so it can sit a few releases behind the download. The App Store currently serves **2.1.17**; its next update brings **2.5.0** in one step — four releases of changes at once:

<div class="catchup" aria-label="Releases between App Store 2.1.17 and 2.5.0">
  <ol class="catchup-track">
    <li class="is-now"><a href="#catchup-now"><b>2.1.17</b><span>App Store today</span></a></li>
    <li><a href="#catchup-2-3-0"><b>2.3.0</b><span>Oct 14</span></a></li>
    <li><a href="#catchup-2-3-1"><b>2.3.1</b><span>Oct 17</span></a></li>
    <li><a href="#catchup-2-4-0"><b>2.4.0</b><span>Oct 18</span></a></li>
    <li class="is-next"><a href="#catchup-2-5-0"><b>2.5.0</b><span>Next App Store update</span></a></li>
  </ol>
  <div class="catchup-cards">
    <section id="catchup-now" class="catchup-card is-now">
      <header><b>2.1.17</b><span>On the App Store now</span></header>
      <p>The WYSIWYG editor with live reload, themes, diagrams and math, link completion, the Problems panel, Go to Heading, print and PDF export.</p>
    </section>
    <section id="catchup-2-3-0" class="catchup-card">
      <header><b>2.3.0</b><span>The first release without the beta label</span></header>
      <ul>
        <li><i>◫</i><b>Split View</b> — the Markdown source beside the page.</li>
        <li><i>❝</i><b>Callouts</b> — GitHub alerts and Obsidian callouts as blocks.</li>
        <li><i>✎</i><b>Copy as Structured Text</b> — for email and chat.</li>
        <li><i>↯</i><b>Large files ~10× faster</b> — 4,100 lines in about 3 s.</li>
      </ul>
    </section>
    <section id="catchup-2-3-1" class="catchup-card">
      <header><b>2.3.1</b><span>A calmer, native Mark</span></header>
      <ul>
        <li><i>◐</i><b>Paper, Ink, Docs and macOS themes</b>, a slim title bar, an outline beside the page.</li>
        <li><i>⌂</i><b>A home screen</b> — recent files and folders, the Guide, your agent.</li>
        <li><i>◔</i><b>Diagrams and math in the theme's colours</b>, full screen for any of them.</li>
        <li><i>▤</i><b>Only your notes</b> — folders list Markdown files, Recent and Pinned on top.</li>
      </ul>
    </section>
    <section id="catchup-2-4-0" class="catchup-card">
      <header><b>2.4.0</b><span>A new diagram engine</span></header>
      <ul>
        <li><i>◔</i><b>Pele</b> renders <code>mermaid</code> blocks — same syntax, faster and lighter.</li>
        <li><i>◐</i><b>Instant recolouring</b> when the theme switches.</li>
        <li><i>✳</i><b>32 diagram types</b> — Venn, treemap, radar, swimlane and more.</li>
        <li><i>⤓</i><b>A much lighter app</b> — diagram code down from 2.6 MB to 0.26 MB.</li>
      </ul>
    </section>
    <section id="catchup-2-5-0" class="catchup-card is-next">
      <header><b>2.5.0</b><span>Diagrams leave as pictures</span></header>
      <ul>
        <li><i>⧉</i><b>Copy as image, save as PNG or SVG</b> for any diagram or chart.</li>
        <li><i>◐</i><b>A look for each diagram</b> — Auto, the author's palette, Light or Dark.</li>
        <li><i>⎙</i><b>Print and PDF, each direct</b> — ⌘P opens the print panel; PDF saves straight to a file.</li>
        <li><i>▣</i><b>Copy images back out</b> of the document to the clipboard.</li>
      </ul>
    </section>
  </div>
</div>

Everything in these releases reaches the App Store edition except the desktop-only features in the table above. The full notes are in the [changelog](/changelog).

<style>
/* C-64 T-001: the catch-up track on the shared brand tokens (paper/ink/
   marker, loaded site-wide by the docs theme) — "now" is hollow, "next"
   is the marker. Scoped under .vp-doc; the track scrolls inside itself,
   never the page, at 390 px. */
.vp-doc .catchup { margin: 24px 0 8px; }
.vp-doc .catchup-track { list-style: none; counter-reset: none; display: flex; gap: 0; margin: 0 0 16px; padding: 0 0 4px; overflow-x: auto; scrollbar-width: thin; }
.vp-doc .catchup-track li, .vp-doc .catchup-track li + li { flex: 1 1 0; min-width: 96px; position: relative; margin: 0; padding: 0; }
.vp-doc .catchup-track li::before { content: ""; position: absolute; top: 9px; left: 0; right: 0; height: 2px; background: var(--rule); }
.vp-doc .catchup-track li:first-child::before { left: 50%; }
.vp-doc .catchup-track li:last-child::before { right: 50%; }
.vp-doc .catchup-track a { position: relative; display: flex; flex-direction: column; align-items: center; gap: 2px; padding-top: 26px; text-decoration: none; color: var(--ink); text-align: center; }
.vp-doc .catchup-track a::before { content: ""; position: absolute; top: 3px; left: calc(50% - 7px); width: 14px; height: 14px; border-radius: 50%; background: var(--paper); border: 2px solid var(--ink-2); box-sizing: border-box; }
.vp-doc .catchup-track .is-now a::before { border-style: dashed; border-color: var(--mute); }
.vp-doc .catchup-track .is-next a::before { background: var(--marker); border-color: var(--marker); }
.vp-doc .catchup-track .is-next b { color: var(--ink); }
.vp-doc .catchup-track b { font-size: 15px; font-variant-numeric: tabular-nums; }
.vp-doc .catchup-track span { font-size: 12px; line-height: 1.3; color: var(--mute); }
.vp-doc .catchup-cards { display: flex; gap: 12px; overflow-x: auto; scroll-snap-type: x mandatory; padding-bottom: 8px; }
.vp-doc .catchup-card { flex: 0 0 min(264px, 82%); scroll-snap-align: start; border: 1px solid var(--rule); border-radius: 12px; padding: 14px 16px; background: var(--card); scroll-margin-top: 96px; }
.vp-doc .catchup-card.is-now { background: transparent; border-style: dashed; }
.vp-doc .catchup-card.is-next { border-color: var(--marker); border-width: 2px; }
.vp-doc .catchup-card header { display: flex; flex-direction: column; margin-bottom: 8px; }
.vp-doc .catchup-card header b { font-size: 18px; }
.vp-doc .catchup-card header span { font-size: 13px; line-height: 1.4; color: var(--ink-2); }
.vp-doc .catchup-card p { margin: 0; font-size: 14px; line-height: 1.5; color: var(--ink-2); }
.vp-doc .catchup-card ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
.vp-doc .catchup-card li, .vp-doc .catchup-card li + li { margin: 0; font-size: 14px; line-height: 1.45; color: var(--ink-2); padding-left: 24px; position: relative; }
.vp-doc .catchup-card li i { position: absolute; left: 0; top: 0; font-style: normal; color: var(--marker); width: 18px; text-align: center; }
.vp-doc .catchup-card li b { color: var(--ink); font-weight: 600; }
</style>

## Installing

- Mac App Store: [Mark on the Mac App Store](https://apps.apple.com/app/id6814590464)
- Homebrew: `brew tap xronocode/mark && brew install --cask mark`
- Windows: the `x64-setup.exe` installer from [GitHub Releases](https://github.com/xronocode/mark/releases/latest)

See [Installation](./installation) for details.
