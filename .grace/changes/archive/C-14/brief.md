# Mark — Landing Design Brief (C-14, for OpenDesign generation)

## Product facts (all verified against the repo — do not invent numbers)

- **Mark** — modern WYSIWYG Markdown editor, native macOS app built with Tauri (no Chromium/Electron).
- **11 MB** app size, **~61 MB RAM**, opens under a second.
- WYSIWYG rich mode + source mode (⌘⌥S), live-rendered tables, Mermaid diagrams, KaTeX math, code highlighting, task lists.
- **Live reload with cursor preservation** — external changes (your AI agent, git, another editor) reload instantly; the editing position survives.
- Built for AI workflows: agents write Markdown, Mark renders it as they type; opt-in localhost live-viewer endpoint for external tools.
- 21 themes (Cadmium Light → Synthwave '84), project sidebar with file tree, tabs, breadcrumb title bar, search, diff view.
- Copy as HTML / Copy as Plain Text from a native right-click menu (paste into email/Docs with formatting intact).
- CLI: `mark file.md` opens files; watches and diffs from terminal workflows.
- Current version line: 2.1.x beta. macOS Apple Silicon first-class; Windows + Mac App Store are on the roadmap (do NOT promise dates).
- Open source: github.com/xronocode/mark.

## Audience & tone

Developers and technical writers who live in Markdown and increasingly have AI agents writing it for them. Tone: precise, calm, confident, no hype-words ("blazing", "revolutionary"). Existing tagline to keep or evolve: **"Your AI agents write Markdown. Finally, an editor that does it justice."** Site language: English (RU version is a future task).

## Page structure (single landing + 2 subpages)

1. **Hero** — logo, tagline, primary CTA "Download for Mac" + secondary "brew install --cask mark" (copyable), version badge pulled from the live release feed (never hardcoded).
2. **Feature grid** — 6 cards from the facts above (size/speed, WYSIWYG+source, live reload for agents, themes, sidebar/search/diff, copy-as-HTML).
3. **Screenshot gallery** — use the 8 existing screenshots, each with a one-line caption:
   - showcase-00-rich-markdown.png — rich WYSIWYG editing
   - showcase-01-code-highlighting.png — code blocks with highlighting
   - showcase-02-mermaid-flowchart.png — Mermaid diagrams
   - showcase-03-math-katex.png — KaTeX math
   - showcase-04-data-tables.png — live tables
   - showcase-05-mermaid-sequence.png — sequence diagrams
   - showcase-06-task-management.png — task lists
   - showcase-07-mixed-showcase.png — everything together
4. **AI-workflow section** — the live-reload story: "agent edits on disk → Mark re-renders with cursor kept".
5. **Download section** — three channels:
   - Homebrew: `brew tap xronocode/mark && brew install --cask mark`
   - Direct DMG: link to the GitHub latest release asset (feed-driven)
   - Mac App Store & Windows: "coming soon" slots (no dates)
6. **Footer** — GitHub link, docs link (/guide/), privacy (/privacy/), license note, © xronocode.

Subpages (plain, content-only): **/privacy/** and **/changelog/** (seeded from release history).

## Assets

- Logo: `static/logo-96px.png`, `static/logo-small.png`, `static/icon.png`
- Screenshots: `screenshots/showcase-00…07-*.png` (already sized for the web)

## Design direction

Dark-first developer-tool aesthetic with a light mode; markdown/monospace motif (subtle `#`-marks, code fences as section dividers are welcome); accent hue sampled from the logo; system font stack or self-hosted Inter + a mono for code snippets; generous whitespace; screenshots in neat window chrome; responsive down to 375px.

## Hard constraints

- Site is served under the path prefix `/mark/` → all URLs relative or `/mark/`-prefixed.
- Zero external runtime dependencies: no Google Fonts, no CDN scripts, no analytics. Must load offline.
- Version numbers and download URLs must come from the live release feed at runtime — never hardcoded in the HTML.
- Output: static HTML/CSS (JS only for the version badge fetch). It will be ported into the VitePress theme, so keep the DOM semantic and the CSS scoped to the landing layout.

## Addendum 2026-09-20 — size-first positioning (user direction)

User feedback after first deploy: size/memory footprint is Mark's single
biggest advantage and must lead the page. Angle: heavy AI users already run
agents + browsers + many terminal sessions; a heavyweight editor taxes the
machine the models run on; Electron-based competitors (never named — category
references only) ship a whole Chromium and hold hundreds of MB. Mark is
open source and positioned as the base/core to build on.

Landed: hero stat strip (11 MB / ~61 MB RAM / <1 s), dedicated #footprint
section with category comparison bars (11 MB vs 200–350 MB disk; ~61 MB vs
300–600 MB RAM), sharpened "Native Speed" card, agent-workflow copy reframed
around the many-windows pain.

## Addendum 2026-09-21 — measured Benchmarks section

User request: benchmark section vs. Antigravity, VSCode (many md files open)
and other popular editors, competitor names/logos masked. Measured live on
the dev machine (M5/32GB/macOS 26.6) with a uniform 25-doc corpus and
isolated profiles: Mark 113 MB / 28 MB installed; anonymized Electron
editers 803–2313 MB / 481–1160 MB. Repro script committed at
tools/benchmark/editors-bench.sh; methodology footnote on the page.
Honesty fix rolled in: 11 MB is the DOWNLOAD size, 28 MB installed —
hero/footprint wording corrected accordingly.
