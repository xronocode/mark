# Changelog

All notable changes to Mark. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions before 2.3.0 were published as alpha and beta releases. Downloads and signatures for every version are on [GitHub Releases](https://github.com/xronocode/mark/releases).

## [2.6.0](https://github.com/xronocode/mark/compare/v2.5.3...v2.6.0) (2026-10-20)


### Features

* **safety:** manual override lane for model-review false positives ([2dc2f7b](https://github.com/xronocode/mark/commit/2dc2f7b84a5ec6cf6d7288692e14bf0e93bd9995))
* **safety:** require local review before commits and pushes ([60f5d9e](https://github.com/xronocode/mark/commit/60f5d9ef921098bbe0b733b10f6e6a7a1e780b83))
* **site:** C-64 one hero download button per system (brand Windows tiles, macOS default, Linux build-from-source), other ways as text links; ¶05 becomes a tappable all-downloads list; Android gets Send Mark to your computer ([1f21e9c](https://github.com/xronocode/mark/commit/1f21e9c36aa7f8bf50099e927f88389e5f985205))
* **site:** C-64 T-009 deep GA4 layer — os on install intent, hero_alt, nav_click, section_view, stage_drag, prompt_open, appearance_toggle, scroll_depth, code_copy, doc_nav (window capture, VitePress router), diagram_code_view, not_found, per-route re-arm of doc_read/scroll_depth; all through the consent queue; P3 tests in track-p3.test.mjs ([fe9b23b](https://github.com/xronocode/mark/commit/fe9b23b052883b58aca915dee7081d372447d41e))


### Bug Fixes

* **C-68:** integrate opened baselines with async tab and view isolation ([2f30dc2](https://github.com/xronocode/mark/commit/2f30dc2dda7064583e2f140c47aad9cf0d8adcec))
* **C-71:** integrate table geometry, viewer controls and c65cov regressions ([655d956](https://github.com/xronocode/mark/commit/655d956d295f63d0d0d09d6bc5b9d3b938f4d14c))
* **C-71:** refresh table viewport on late owning outline and scroller changes ([0e8ffcd](https://github.com/xronocode/mark/commit/0e8ffcd9299a7dd2b5ec25e3e677222cd2358960))
* **editor:** FIX-011 — three-action untitled close dialog (Save & Close default) ([4e676c0](https://github.com/xronocode/mark/commit/4e676c00674bd11e6656f782cf35737aa6fae4b1))
* **editor:** keep active tab and rendered document in sync ([943d57d](https://github.com/xronocode/mark/commit/943d57d69f7d3b9bf4f896b814649138470e01ac))
* **editor:** land the 2026-10-20 defect-catalog repairs (FIX-003..FIX-008) ([a2d7787](https://github.com/xronocode/mark/commit/a2d778729f416e407377cc879b9bd7644fb9a6b5))
* **editor:** preserve Shift-arrow selection across passive panels ([bcaebe0](https://github.com/xronocode/mark/commit/bcaebe05b071aaa8466132b5dd7c457b1fdba0c9))
* integrate accepted native vertical selection repair and train protocol ([995b01c](https://github.com/xronocode/mark/commit/995b01ce65906108dcd8fefa95ccae7dd799cba5))
* **outline:** hide contents whenever a visible table intersects it ([f17b070](https://github.com/xronocode/mark/commit/f17b070e2eac144808a6f6aba6d2609ffd3e16bb))
* **release:** normalize material line endings ([70ee8da](https://github.com/xronocode/mark/commit/70ee8dad568b4f7f6d41d4165b3b042d7a76b860))
* **release:** preserve Windows train ledger bytes ([8485fe7](https://github.com/xronocode/mark/commit/8485fe76418a165611e4428aafe1ad04b0245eee))
* **release:** synchronize prepared train ledger ([f604e51](https://github.com/xronocode/mark/commit/f604e519880564a30161abc8d0c3013ce9ee1134))
* **safety:** enforce approved private operations and fixture boundaries ([1c25aba](https://github.com/xronocode/mark/commit/1c25aba282e56757c5b7414882b5e5d5b560cf7f))
* **safety:** prove exclusive GPU ownership before loading the reviewer ([6150d17](https://github.com/xronocode/mark/commit/6150d17418ded3a3e7a1f91d65928c10546be934))
* **site:** C-64 T-009 doc_nav reports the page clicked from (snapshot on pointerdown; the VitePress router moves the URL first) ([79e484c](https://github.com/xronocode/mark/commit/79e484c5a444543b4379d9358b5a4a1f27506de2))
* **site:** stabilize analytics and base links ([a0d7581](https://github.com/xronocode/mark/commit/a0d7581a2c49d08f1d39bcf04b494c8f60200d7b))
* **tables:** C-TABLE-FIT-PERSISTENCE — keep the fit flag in the host sanitizer ([a0a524f](https://github.com/xronocode/mark/commit/a0a524fdc5812c8361600e671e741527b7e3ebe5))
* **tables:** center long-cell tables in the full editor viewport ([073f949](https://github.com/xronocode/mark/commit/073f9494c5bac43a0e0cdf06c4e584432675dd70))
* **tables:** hide unnecessary width actions and clear the edge shade ([9d413fe](https://github.com/xronocode/mark/commit/9d413febf20a3c4e821c7dadcff412015d86cf11))
* **tables:** keep a compact stable caption and scrollbar footer ([16b59d1](https://github.com/xronocode/mark/commit/16b59d1b8f718f1390d15663e782adfd263a50f7))
* **tables:** keep the column counter transparent over edge shades ([abf29f1](https://github.com/xronocode/mark/commit/abf29f139ba9f31d1aee62826a177957f301b538))
* **tables:** preserve Fit after adopted Full width ([674f91b](https://github.com/xronocode/mark/commit/674f91b6535fb35a47e4a1c960fa3f9a57d4e7ac))
* **test:** await diagram imports before fence suite teardown ([549542a](https://github.com/xronocode/mark/commit/549542adb476132bdb4551c02293220cf9c8764f))
* **test:** preserve portable privacy fixture paths and bytes on Windows ([449d463](https://github.com/xronocode/mark/commit/449d4636a3fc2645ee236a6572e9e490206d3edb))
* **toolbars:** retain visited labels until leaving the panel ([46b255c](https://github.com/xronocode/mark/commit/46b255c240c08dbfa1a8e26d526ef2fcb6a58754))
* **trace:** attribute FIX-002 with a real-app open-file trace; add dispatch_ms ([e08441c](https://github.com/xronocode/mark/commit/e08441c952f0bb9e8bd69cd7a4737ab8d494c08b))
* **viewer:** FIX-008 reopen — pan-only table navigation with edge clip shadows ([debfe5e](https://github.com/xronocode/mark/commit/debfe5eef8d72a1e6ddf110d5c78eeec2ee0c121))


### Performance

* **safety:** review complete locale field changes with strict raw fallback ([3691fa4](https://github.com/xronocode/mark/commit/3691fa48ce550fcacfd61c2443ef0bc25a39f476))

## [Unreleased]

### Known gaps
Carried over from the old status table in the README:
- Saving does not yet preserve a non-UTF-8 source encoding, and there is no manual encoding picker.
- Multiple windows: `--new-window` is accepted but has no effect yet.
- Intel Macs are not supported by the Homebrew cask; Linux builds are not published.
- Image upload services (PicGo and similar) are not supported.

<!-- release-draft:start -->

Tables can leave Mark as pictures, wide-table controls stay stable, and a focused stabilization pass repairs editing, tab ownership and close dialogs.

### Tables
- Copy a table as an image from the editor, or save it as PNG from the fullscreen table viewer.
- Full width and Fit to page keep their chosen state through editor updates; fitting tables keep their compact toolbar and footer geometry.
- The fullscreen table viewer uses drag-to-pan as its only horizontal navigation model. It no longer paints a misleading bottom scrollbar, and subtle edge shadows show which side still contains clipped columns.
- Wide tables stay centred when they fit, start inside the editor edge when they do not, and temporarily move the outline out of their way instead of sliding underneath it.
- Inline table and diagram toolbar labels remain visible after visiting an action, then clear when the pointer leaves the panel.

### Editor and navigation
- ⌘D compares a note with the version Mark opened, including outside a Git repository; unchanged notes report that clearly.
- ⇧⌘D duplicates the current paragraph. ⌘1–6 converts it to H1–H6 and persists the change to Markdown and the outline.
- Shift+Up/Down selection continues expanding while passive formatting panels are visible.
- Opening a new document after closing a file clears the old file's outline instead of retaining stale headings.
- The localized paragraph transform menu sizes itself to long labels and shortcut columns instead of wrapping or colliding.

### Tabs and dialogs
- Closing the active tab keeps the selected tab, editor body and later edits owned by the same document, including delayed background events.
- The unsaved-changes dialog follows the active light or dark theme.
- Closing a dirty untitled tab now offers three distinct actions: Save & Close opens Save As, Discard is explicit and non-default, and Cancel keeps the tab and its content.

<!-- release-draft:end -->

<!-- #region releases -->

## [2.5.3] - 2026-10-19

Mark now remembers where you were, and wide tables get the room they need.

### Interface
- A table wider than the text column opens at full width: centred when it fits the window, otherwise 24 px from the editor's edge, with the editor scrolling sideways; it never slides under the outline. «Fit to page» in the table toolbar keeps a table in the column and is remembered per table.
- The table toolbar sits above the table on the column edge, and a caption below shows which columns are in view («columns 3–7 of 15»).
- A broom in the sidebar's Recent header clears the list.
- ⌘W closes the Settings window.

### Product mechanics
- Session restore: a launch without a file reopens the folder and tabs of the last session in order, with the same active tab; missing files are skipped. The session is saved as you work, so a quit or a crash keeps it. Settings › General › Startup › «Reopen the last session on launch» (on by default).
- Column widths you drag are remembered per file in the Mark profile and restored on reopen; the Markdown is never changed. Editing a table's header resets its widths.
- The download and Homebrew build checks for updates once a day and offers Update, Later or Skip this version (Settings › General › Updates).
- Check for updates in Settings reports in its own row instead of a notice over the button.

### Fixed
- The table toolbar buttons kept working only until the next partial re-render (for example after typing elsewhere); they now always respond.
## [2.5.2] - 2026-10-18

A fix release for the window chrome and the home screen.

### Fixed
- A double click on the title bar maximizes the window once instead of maximizing and immediately restoring it.
- A click on the empty title bar closes the document info card.
- The document info card shows Rename, Show in Finder and Copy path in one row.
- Home screen rows stay inside the column, and «Remove from list» sits centred on the row instead of over the path.

## [2.5.0] - 2026-10-18

Diagrams leave Mark as pictures, each diagram gets its own look, and printing and PDF export each go straight to the point.

### Interface
- Hover a diagram and a small panel appears at its top-right edge: its look, the source, copy as image and full screen (for diagrams that need it). Labels slide in on hover and are translated; the panel never shows while you type in the source.
- On macOS the full-screen diagram window closes with the first click on × — its header now sits below the window's title bar.
- The home screen keeps its brand row visible in a short window instead of clipping it.

### Product mechanics
- Copy as Image, Save as PNG… and Save as SVG… for every ```mermaid``` diagram and ```vega-lite``` chart — from the corner panel, the editor context menu and the full-screen view. PNG is rendered at 2×; the SVG is standalone with the theme's colours and font inlined; files are named after the nearest heading.
- Copy an image that is already in the document back to the clipboard — from the image toolbar or the context menu. PNG files go as they are; other formats are converted to PNG.
- Print (⌘P) opens the system print panel directly, with your last export options. Export to PDF asks for page settings, then a file name, and writes the PDF without the print panel — on macOS and Windows.

### Content rendering
- Each mermaid diagram has its own look: Auto follows the document theme, Custom keeps the author's palette from the Markdown, Light and Dark pin it. The choice is saved as a comment in the diagram source and undoes like any edit; in read-only documents it applies to the current view only. HTML export uses the same look.
- Kanban boards draw their cards on the surface colour with a light frame over lighter columns.
- Changing the footnote setting re-renders open documents at once, without losing undo history or unsaved edits.

### Site and support
- A diagram gallery at [mark.xronocode.com/diagrams](https://mark.xronocode.com/diagrams/) shows every diagram type Mark renders, recoloured live in any of the 32 themes, with a slideshow and a full-screen show.
- Help › Support Mark… is back in the desktop (download and Homebrew) build, and the site links to Ko-fi again.

### Corrections
- The 2.4.0 notes and site counted 33 diagram types and 33 themes; the right number is 32 for both.

## [2.4.0] - 2026-10-18

The diagram engine changed: mermaid is out, [Pele](https://github.com/obsidianmd/pele) is in. The ```mermaid``` fence and its syntax are unchanged — documents open as they are.

### New diagram engine
- ```mermaid``` blocks render with Pele (obsidianmd/pele, MIT, zero dependencies): synchronous rendering, XSS-safe by construction (labels escaped, `javascript:` links stripped — no strict-mode config to maintain).
- The diagram code went from 44 bundle parts totalling 2.6 MB (plus 75 MB / 23 dependencies in node_modules) to one lazy part, 0.26 MB compressed.
- Diagrams' colours now live in CSS variables (`--pele-*`), derived per theme with the same WCAG node-contrast math: switching themes — including Auto light/dark — recolours every diagram instantly without re-rendering.
- The pie chart keeps its Keynote-style donut; gantt, journey, timeline and packet keep their readable lab sizes with in-block scrolling; diagram zoom with the editor font size and the fullscreen viewer are unchanged.
- New diagram types in mermaid blocks: venn, treemap, agentflow, radar, swimlane, use case, event modeling, tree view, cynefin, railroad and more (32 types in total).
- The look of the diagrams has changed with the engine — same syntax, new renderer.
- Exported HTML renders diagrams with Pele and inlines the theme's diagram colours, so standalone files look like the editor.

## [2.3.1] - 2026-10-17

The release is organized by the areas the gap analysis ranked highest.

### A calmer, native look
- Theme families Paper, Ink, Docs and macOS; Paper and Ink are the defaults for new profiles, and the title-bar button follows the system appearance (Auto / Light / Dark).
- A slim title bar with the document info card, an outline beside the page, and a status bar.
- The system font, accent colour and icon set throughout; a Mica window material on Windows 11.
- Settings reorganized into five tabs, themed in the active theme's colour.

### A home screen
- Recent files and folders, the Guide, and one click to connect your agent.
- What's New opens once after an update, lists the highlights and links to the release notes.
- The interface language can follow the system («As in system»), and the App Store build can ask for a rating.

### Diagrams and math in the theme
- All 22 Mermaid diagram types render in the theme's colours, with readable node contrast in the dark themes.
- Vega charts and KaTeX math follow the theme; the Mermaid pie chart draws as a Keynote-style donut; Vega renders again in the installed app.
- Any diagram or wide table opens in a fullscreen viewer with zoom, pan and a sticky table header.
- Wide tables scroll inside the text column with a thin scrollbar, narrow tables are centred, and table columns can be resized.

### Folders with just your notes
- The folder tree shows Markdown files only, without empty folders; a preference brings every file back.
- Recent and Pinned sections at the top of the sidebar, with pinning from the tree's context menu.
- Open a folder from the clipboard with ⌥⌘V, or by dropping it on the window.

### Closer to your agent
- ⌘D shows what your agent changed: Mark snapshots every open file before an external reload and diffs against that, falling back to a `.before` file or the last git commit.
- The agent prompt lists everything Mark renders — diagrams, charts, callouts, task lists — so agents pick the right tool for each part.

### And the rest
- One zoom for the whole app, remembered per window.
- Code blocks show line numbers again.
- Share ships in the App Store build.

## [2.3.0] - 2026-10-14

The first release without the beta label.

### Added
- Split View: the Markdown source beside the rendered page for the current tab, toggled with one shortcut.
- GitHub alerts (`> [!TIP]`) and Obsidian callouts render as blocks, in the editor and in exports.
- Front matter opens as a properties table.
- Copy as Structured Text: for email and chat, without Markdown markers but with paragraphs, lists, links and tables.
- New app icon, with dark and tinted variants for macOS 26.

### Changed
- Footnotes are on by default.
- Pasted and dropped images are saved to `assets/` next to the document.
- Large documents open about 10 times faster: a 4,100-line file takes about 3 s instead of 37.
- Mermaid keeps the last diagram that rendered while the source has an error, and shows the error below it. Wide diagrams keep their size and scroll; unchanged diagrams are not redrawn while you type.
- On macOS, Settings moved to Mark › Settings… (⌘,); the gear button left the title bar.

### Fixed
- The interface language setting works again in all 10 languages (release builds before 2.3 stayed in English).
- Diff mode shows changes again and closes with ⌘D.
- Context-menu items work on the first click.
- Renaming an open file in the sidebar moves its tab to the new path.
- Selection no longer highlights the area outside the text column.

## [2.2.0-beta] - 2026-10-07

### Added
- The first Windows release (x64 installer). The in-app updater works on macOS and Windows.
- Link path completion: typing `](` suggests files and folders next to the document.
- The Problems panel flags links to missing files and missing `#heading` anchors.
- Print through the system print dialog, and PDF export without pandoc.
- Go to Heading (`Cmd/Ctrl+T`), current-section highlight in the outline, Format Document (`Shift+Alt+F`), and a markdownlint Problems panel.

## [2.1.15-beta] - 2026-09-26

### Added
- Link path completion and broken-link checks in the Problems panel.

### Fixed
- Image path completion returned empty items.
- The outline highlights the current section again while you edit without scrolling.

## [2.1.14-beta] - 2026-09-24

### Added
- Go to Heading (`Cmd+T`) and current-section highlight in the outline.

### Fixed
- File › Print opens the macOS print dialog with pagination and Save as PDF. PDF export uses the same path and keeps the document's styling, without pandoc.

## [2.1.13-beta] - 2026-09-23

### Added
- Pasting a URL over selected text turns it into a Markdown link.
- A Problems panel with Markdown checks (heading level jumps, several H1s, trailing spaces, missing blank lines, code blocks without a language), with click-to-jump.
- Format Document (`Shift+Alt+F`), undone with a single ⌘Z.

## [2.1.12-beta] - 2026-09-21

### Fixed
- A tab rewritten by an agent no longer shows empty space until you scroll: the reading position is clamped to the new document length.
- Returning to a tab changed in the background shows the current file, not an older version.
- Scroll position is kept when you switch between tabs.

### Added
- Richer syntax highlighting for R.
- Groundwork for the Mac App Store build: sandboxed folder access with security-scoped bookmarks and project search without external processes.

## [2.1.11-beta] - 2026-09-18

### Added
- A native editor context menu: Undo, Redo, Cut, Copy, Paste, Select All and Share.
- Copy as Plain Text (`Cmd+Alt+Shift+C`), alongside Copy as HTML.

### Removed
- Settings migration code from MarkText (about 6,000 lines). Existing settings, themes and sessions are unaffected.

## [2.1.10-beta] - 2026-09-16

### Added
- Copy as HTML (`Cmd+Shift+C`) for pasting formatted text into email.
- Tab switching with `Ctrl+Tab` / `Ctrl+Shift+Tab`.

### Fixed
- The tab strip scrolls to keep the active tab visible.
- The title-bar path no longer overlaps the buttons in narrow windows.
- External file changes reload in every open tab, not only the first.

## [2.1.9-beta] - 2026-08-18

### Fixed
- Agent-opened tabs without a saved position start at the top.
- Live document streaming: patch semantics, resync within a session, and authentication order.

## [2.1.1-beta to 2.1.8-beta] - 2026-08-07 to 2026-08-10

Stabilisation releases.

### Fixed
- Signed in-app updates restored (2.1.2).
- Native clipboard and undo restored (2.1.3); Finder preview input restored (2.1.4).
- Documents opened by agents load reliably on first mount (2.1.5 to 2.1.7).
- Active selections are preserved (2.1.8).
- `$150 $300` is no longer treated as inline math (2.1.1).

## [2.1.0-beta] - 2026-06-14

### Added
- A local live server and live viewer that external tools can stream documents into.
- Extension host groundwork: an extension gallery in Settings and text insert / transform capabilities.

## [2.0.7-alpha] - 2026-06-07

### Added
- Update paths for Homebrew, the DMG and the App Store.

### Fixed
- Check for Updates and Screenshot menu items.

## [2.0.6-alpha] - 2026-06-06

### Added
- macOS Share sheet in the toolbar and File menu.
- Version shown in the Help menu.
- A Mac App Store build profile.

## [2.0.5-alpha] - 2026-06-03

### Fixed
- Selection visibility and the cursor in both editor modes.

## [2.0.4-alpha] - 2026-06-01

### Fixed
- Missing native menu items.

## [2.0.3-alpha] - 2026-06-01

### Changed
- Releases are signed with a Developer ID and notarized by Apple.

## [2.0.2-alpha] - 2026-06-01

### Added
- `--watch` and `--diff` command-line flags, and automatic diff against a `.before` file.
- Save All, line-ending control and PDF export.

## [2.0.1-alpha.1] - 2026-05-31

### Added
- A welcome screen with recent files and session restore.

## [2.0.0-alpha.9] - 2026-05-28

### Added
- Print, Export as HTML, file rename and move.
- Trackpad pinch to zoom and window size and position memory.
- Inline diff view.
- All themes in View › Theme.

## [2.0.0-alpha.8] - 2026-05-22

### Changed
- No splash screen on launch; a stricter content security policy.
- Files opened on their own reload when they change on disk.

[Unreleased]: https://github.com/xronocode/mark/compare/v2.5.0...HEAD
[2.5.0]: https://github.com/xronocode/mark/releases/tag/v2.5.0
[2.4.0]: https://github.com/xronocode/mark/releases/tag/v2.4.0
[2.3.1]: https://github.com/xronocode/mark/releases/tag/v2.3.1
[2.3.0]: https://github.com/xronocode/mark/releases/tag/v2.3.0
[2.2.0-beta]: https://github.com/xronocode/mark/releases/tag/v2.2.0-beta
[2.1.15-beta]: https://github.com/xronocode/mark/releases/tag/v2.1.15-beta
[2.1.14-beta]: https://github.com/xronocode/mark/releases/tag/v2.1.14-beta
[2.1.13-beta]: https://github.com/xronocode/mark/releases/tag/v2.1.13-beta
[2.1.12-beta]: https://github.com/xronocode/mark/releases/tag/v2.1.12-beta
[2.1.11-beta]: https://github.com/xronocode/mark/releases/tag/v2.1.11-beta
[2.1.10-beta]: https://github.com/xronocode/mark/releases/tag/v2.1.10-beta
[2.1.9-beta]: https://github.com/xronocode/mark/releases/tag/v2.1.9-beta
[2.1.1-beta to 2.1.8-beta]: https://github.com/xronocode/mark/compare/v2.1.0-beta...v2.1.8-beta
[2.1.0-beta]: https://github.com/xronocode/mark/releases/tag/v2.1.0-beta
[2.0.7-alpha]: https://github.com/xronocode/mark/releases/tag/v2.0.7-alpha
[2.0.6-alpha]: https://github.com/xronocode/mark/releases/tag/v2.0.6-alpha
[2.0.5-alpha]: https://github.com/xronocode/mark/releases/tag/v2.0.5-alpha
[2.0.4-alpha]: https://github.com/xronocode/mark/releases/tag/v2.0.4-alpha
[2.0.3-alpha]: https://github.com/xronocode/mark/releases/tag/v2.0.3-alpha
[2.0.2-alpha]: https://github.com/xronocode/mark/releases/tag/v2.0.2-alpha
[2.0.1-alpha.1]: https://github.com/xronocode/mark/releases/tag/v2.0.1-alpha.1
[2.0.0-alpha.9]: https://github.com/xronocode/mark/releases/tag/v2.0.0-alpha.9
[2.0.0-alpha.8]: https://github.com/xronocode/mark/releases/tag/v2.0.0-alpha.8
<!-- #endregion releases -->
