# Drafts: English "What's new" for GitHub releases

Reviewed English sections for GitHub release notes, newest first. A draft is
the human-written section above the `---` separator; the automated attestation,
cosign and updater block below it stays unchanged. After publication, prepend
the section to the live release as described in the
[release procedure](release-process.md#5-release-notes).

## v2.8.2

```markdown
## What's new

**Changed**
- **"See everything new" opens the changelog.** The link in What's New now opens this release's section of the changelog on the Mark website instead of a GitHub release page.

**Fixed**
- The changelog page on the Mark website lists every release again; versions 2.6.0 to 2.8.1 were missing from it.
```

## v2.8.1

```markdown
## What's new

**Fixed**
- **PDF export on macOS, fixed for real.** Exporting to PDF crashed the app on every attempt since the feature first shipped — the save step called a print-settings method that does not exist on macOS. The save target now travels through the print-settings dictionary, the save job runs through the same runner as the print panel, and the fix is verified end-to-end on the crash document.
- A new automated audit checks every macOS print call the app makes against the live system APIs, so a missing or renamed method fails in CI instead of in your export click.
```

## v2.8.0

```markdown
## What's new

**Workspaces**
- **Several folders, one window.** ⇧⌘O (File › Add Folder…) opens a folder beside the ones already open. Every folder surface — the picker, drops, the clipboard and the welcome screen — goes through one Add-or-Replace chooser, with Add preselected as the safe default.
- **File › Replace Workspace…** swaps the whole workspace. Tabs with unsaved edits under removed roots raise one dialog first (Save & Close / Don't Save / Cancel); a failed save aborts the replace, and Cancel changes nothing.
- Tabs that share a filename carry a dimmed owning-folder suffix, and restoring a session brings back every root. Folders that disappeared while you were away degrade visibly — a notice lists them instead of failing silently.

**Cloud folders**
- iCloud Drive and OneDrive folders open as workspace roots under their real names. Evicted iCloud placeholders never pollute the tree, and a once-per-folder note explains that online-only files appear after they download.
- Folder picks and drive-sized trees no longer hang the app: the system picker runs to completion and a whole cloud drive streams its tree in batches.

**Search**
- Folder search labels every hit with its owning folder and keeps results complete while you type. Counts read correctly in all ten languages.

**Safety**
- Quitting with unsaved tabs asks first: Save & Quit commits them, Don't Save discards on purpose, Escape stays. The silent data-loss path is gone.
```

## v2.7.0

```markdown
## What's new

### Sessions
- **Sessions come back honestly.** Launching Mark restores the previous session's tabs, folders and active tab. With auto-restore off, the welcome screen's "Last session (N)" row reopens exactly the boot-time snapshot — never a stale no-op.
- **Recently closed tabs.** A count-badged button beside the tab strip lists them: ⇧⌘T reopens the newest, repeated presses walk back, "Reopen all" restores a batch in order. Closing the last tab surfaces the same recovery right on the welcome screen.
- Missing files are handled honestly: a fully missing session raises a warning, and reopening a deleted file says so.

### Export
- **Self-contained HTML.** Export as HTML embeds locally readable images as base64 data-URLs (8 MiB per-image cap), so a single .html file opens anywhere without its picture folder. Remote images are never fetched; PDF and print are unchanged.

### Editor
- ⇧⌘P opens the command palette again on macOS.
- Table Markdown export keeps every real cell and escapes pipes correctly.
- Turning Auto Save off cancels pending saves immediately.
- Tab switching no longer cascades render warnings through transient cursor state.

### Windows and Linux
- **Native title bar.** Real system caption buttons (Segoe MDL2/Fluent code points, no separators), the app-menu and settings buttons kept, the theme toggle as a fourth cell, and the guide button retired on every platform.

### Security
- follow-redirects 1.16.1 (Dependabot highs #144/#145).
```

---

## v2.6.0

```markdown
## What's new

### Tables
- **Tables as pictures.** Copy a table as an image from the editor, or save a PNG from the fullscreen viewer.
- **Wide tables stay under control.** Full width and Fit to page keep their state through editor updates. In fullscreen, drag to pan; edge shadows show where more columns remain, without a misleading scrollbar.
- Wide tables stay centred when they fit and keep clear of the outline when they do not. Compact toolbar labels and the column footer remain stable.

### Editor
- **Compare with what Mark opened.** ⌘D compares a note with its opened version even outside a Git repository, and reports clearly when nothing changed.
- **Editing shortcuts restored.** ⇧⌘D duplicates a paragraph; ⌘1–6 turns it into H1–H6 and keeps Markdown and the outline in sync.
- Shift+Up/Down selection no longer stalls under a formatting toolbar. The Russian transform menu keeps long labels and shortcuts on one readable row.

### Tabs and dialogs
- Closing a tab no longer leaves another tab selected over the closed document or sends later edits to the wrong file.
- A new document no longer inherits the outline of the file that was just closed.
- Unsaved dialogs follow the active theme. A dirty untitled tab now offers three distinct choices: Save & Close, Discard, and Cancel.
```

## v2.5.2

```markdown
## What's new

Window and start-page fixes:

- Double-clicking the title bar zooms the window once, instead of zooming and immediately restoring it back.
- Clicking the empty part of the title bar closes the file card.
- In the file card, the Rename, Reveal in Finder, and Copy Path buttons now sit in one row.
- Start-page rows no longer overflow their column, and "Remove from list" is centered in the row instead of covering the path.
```

## v2.5.0

```markdown
## What's new

### Diagrams
- **Diagrams as images.** Any diagram or Vega-Lite chart can be copied as an image or saved as PNG or SVG — from the corner panel, the context menu, or the fullscreen viewer. SVG carries the theme colors and looks the same everywhere.
- **Panel in the diagram corner.** On hover, a small panel appears in the top-right corner: appearance, source code, copy as image, fullscreen. When you don't need it, it's not there.
- **A look of its own for every diagram.** "Auto" follows the document theme, "Custom" keeps the author's palette from Markdown, "Light" and "Dark" pin the look. The choice is stored inside the diagram itself and undoes like any edit.
- **Calmer kanban.** Cards sit on the surface color with a light border.

### Print and export
- **Print and PDF — directly.** ⌘P opens the system print panel right away. PDF export asks for page settings and a file name, then saves the PDF without the print panel — on macOS and Windows.
- **Images back on the clipboard.** An image already embedded in a document can be copied to the clipboard — from the image panel or the context menu.

### Editor
- The footnote preference now applies to open documents immediately, without losing undo history.
- On macOS, the fullscreen diagram window closes on the first click of ×.
- The start page no longer clips the logo in a low window.

### Website
- [A gallery of all 32 diagram types](https://mark.xronocode.com/diagrams/) — recolorable into any of 32 themes, with a slideshow and fullscreen view.
- "Help › Support Mark…" is back in the download and Homebrew builds, and the Ko-fi link is on the website.
```

## v2.4.0

```markdown
## What's new

**New diagram engine — Pele.** ```mermaid``` blocks are now rendered by [Pele](https://github.com/obsidianmd/pele): the same syntax, but faster and much lighter. Diagrams follow the app theme — switching between light and dark recolors them instantly, without redrawing. New diagram types: venn, treemap, agentflow, radar, swimlane, usecase, event modeling and more (33 types in total). Diagram code slimmed down from 2.6 MB (44 files) to a single 253 KB gzipped file; 75 MB left the dependencies. The diagrams' look changed together with the engine — we say so openly. The pie chart stays a "donut"; gantt/journey/timeline/packet keep readable sizes; zoom and fullscreen work as before. Exported HTML carries the diagram theme colors.

The full change list is in [CHANGELOG.md](https://github.com/xronocode/mark/blob/main/CHANGELOG.md).
```

## v2.3.1

```markdown
## What's new

### Calmer and closer to the system
- **The Paper, Ink, Docs and macOS theme families** — every theme has a light and a dark pair. Paper and Ink are the defaults; the title-bar button switches "Auto / Light / Dark" and can follow the system.
- **A slim window title bar** with the document card, an "On this page" outline beside the text, and a status line (lines, words, reading time).
- The system font, the accent color, and one consistent icon set; the Mica material on Windows 11.
- Settings in five tabs, themed to match — including the window title bar.

### Start page
- Recent files and folders, the built-in Guide, and one-click agent connection.
- A "What's New" window after an update, with a link to the full change list.
- Interface language: "Match the system".

### Diagrams, charts and formulas in theme colors
- All 22 Mermaid types, Vega-Lite charts, and KaTeX formulas render in theme colors; pie charts are "donuts", like in Keynote.
- Diagram nodes read well in both dark and light themes; arrow labels no longer turn into dark plates.
- **Any diagram or table can open fullscreen**: a button in the corner of a large block, or ⌘-click — then zoom, pan, and "fit".
- Wide tables scroll inside the text column, and column widths are adjustable.
- Fixed: Vega-Lite charts did not render in the installed app.

### Only your notes
- The folder tree shows only Markdown files and no empty folders; a single setting brings all files back.
- **Recent** and **Pinned** sections at the top of the sidebar; pinning from the context menu.
- **Open a folder from the clipboard**: File › Open from Clipboard (⌥⌘V) — a folder copied in Finder opens as the workspace. You can also simply drag a folder onto the window.

### Closer to the agent
- **⌘D shows what the agent changed**: Mark snapshots the file before every reload from disk and diffs against that snapshot. A `.before` file or the last git commit still work as the base.
- The agent prompt lists everything Mark can render — diagrams, charts, callouts, task lists.

### And more
- One zoom for the whole app: ⌘+ / ⌘− / ⌘0 and pinch scale text, tables, code, formulas, and diagrams.
- Line numbers in code blocks work again.
- The App Store build has a Share button.
```

## v2.3.0

```markdown
## What's new

**The first version without "beta".**

### Interface
- **UI language works again**: in all 10 languages (in release builds before 2.3 it stayed English).
- **New app icon**: a marker-highlighted ¶, with dark and tinted variants for macOS 26.
- **macOS**: settings live in Mark › Settings… (⌘,); the gear is gone from the window title bar.

### Editor
- **Split View**: the raw Markdown next to the rendered page for the current tab, one shortcut away.
- **Callouts**: GitHub alerts (`> [!TIP]`) and Obsidian callouts render as blocks, including on export.
- **Front matter** opens as a properties table; **footnotes** are on by default.
- **Images**: pasted and dropped images are saved to `assets/` next to the document.
- **Large documents** open about 10× faster: a 4,100-line file loads in ~3 s instead of 37.

### Diagrams
- **Mermaid survives a typo**: the last good diagram stays on screen, with the error text below it.
- Wide diagrams keep their size and scroll; unchanged ones are not redrawn while you type.

### Copying
- **Copy as formatted text**: for emails and chats — no asterisks or brackets, but with paragraphs, lists, links, and tables.

### Fixes
- Diff mode shows changes again and closes with ⌘D.
- Context-menu items fire on the first click.
- Renaming an open file in the sidebar moves the tab to the new path.
- Selection no longer paints the area outside the text column.
```

## v2.2.0-beta

```markdown
## What's new

### Windows
- **The first Windows version!** Install via winget (`winget install xronocode.Mark`) or with the installer from the releases page. The built-in auto-updater works on both platforms.

### Links and navigation
- **Path autocompletion**: while typing a link `](…`, Mark suggests real files from the document's folder.
- **Broken-link check**: the problems panel shows links to missing files and anchors that don't exist.

### Print and export
- **Printing works**: the system print dialog with pagination and "Save as PDF"; PDF export without pandoc.

### More
- Go to heading (`Cmd/Ctrl+T`), the current-section highlight in the outline, Format Document (`Shift+Alt+F`), and the markdownlint problems panel.
```

## v2.1.15-beta

```markdown
## What's new

### Links
- **Path autocompletion**: while typing a link `](…`, Mark suggests real files from the document's folder — `.md` files and subfolders, filtered as you type; Enter inserts the path.
- **Broken-link check**: the problems panel flags links to nonexistent files and `#heading` anchors missing from the document. Working links are not shown.

### Fixes
- Fixed image autocomplete (it produced empty items since the previous release).
- Restored the current-section highlight in the outline while editing without scrolling.
```

## v2.1.14-beta

```markdown
## What's new

### Print and export
- **Printing works again**: File → Print opens the native macOS print dialog with pagination and "Save as PDF" (the item had been broken since the port — WKWebView ignores window.print).
- **PDF export without pandoc**: the same native print dialog; the document goes to PDF with its own styling (pandoc used to lose the styles). Works in the future App Store version too.

### Navigation
- **Go to heading** (Edit → Go to Heading…, `Cmd+T`): search the document's headings and jump — like symbol search in VS Code.
- **The outline shows where you are**: while reading, the section on screen is highlighted.
```

## v2.1.13-beta

```markdown
## What's new

### Editor
- **Smart link paste**: pasting a URL over selected text turns it into a markdown link `[text](url)` — the selection is no longer lost.
- **Markdown quality checks**: a new problems panel (menu/palette → "Problems") flags typical defects — heading-level jumps, multiple H1s, trailing spaces, missing blank lines, code blocks without a language. Clicking a problem jumps to it.
- **Format Document** (Edit menu, `Shift+Alt+F`): tidies the document in one action — spaces, blank lines, heading styles, level cascade. One Cmd+Z brings it all back.
- The problems panel and validation toggle off with the "Toggle markdown validation" command-palette command.

### Tabs and reliability
- Fixed a rare CI test flake (a notification timer outliving the test window).
```

## v2.1.12-beta

```markdown
## What's new

### Editor
- Fixed the long-standing "blank text until first scroll" bug: when an external agent (or another program) overwrites an open file, the reading position now fits the new document size — the tab no longer "hangs" beyond the shortened text.
- Fixed content rollback: returning to a tab changed by an agent in the background now shows the current file version, not the stale one.
- Rich R syntax highlighting: built-in functions and base identifiers get their own colors.

### Tabs
- Scroll position is preserved when switching back and forth between tabs.

### Platform
- Mac App Store preparation: sandboxed operation with access to chosen folders kept (security-scoped bookmarks), project search without external processes in the MAS build, menus and settings adapted to App Store rules.
- The full app icon set (including the 1024 px one for the App Store).
```

## v2.1.11-beta

```markdown
## What's new in v2.1.11-beta

**Editor context menu (right-click)**
- New: a full native right-click menu — Undo / Redo, Cut / Copy / Paste, Select All, and Share the file (the system share sheet). Paste and copy behave like native macOS items, including automatic availability.

**Copying**
- New: **Copy as HTML** (Cmd+Shift+C) — formatting is preserved when pasting into emails (Mail, Gmail). Without a selection, the whole document is copied.
- New: **Copy as plain text** (Cmd+Alt+Shift+C) — clean text without HTML tags and Markdown markup: headings without `#`, bold without asterisks, paragraph structure kept.
- All three variants (raw Markdown / HTML / plain text) are available in the context menu, the Edit menu, and the command palette.

**Internals**
- Removed the settings-migration code from the old Mark Text (~6,000 lines) — the app is lighter. Settings, themes, and sessions of existing installs are untouched.
```

## v2.1.10-beta

```markdown
## What's new in v2.1.10-beta

**Tabs**
- The active tab is now always visible: the bar scrolls itself to the tab on any switch — Ctrl+Tab / Ctrl+Shift+Tab, a sidebar file click, closing a neighbor, session restore, dragging, and window resizing.
- New: keyboard tab switching — **Ctrl+Tab / Ctrl+Shift+Tab** (menu Window → Select Next/Previous Tab).

**Title bar**
- Fixed: in a narrow window, the path and file name no longer collide with the buttons on the left and the word count on the right — the path clips neatly from the start; the file name and the unsaved dot are always visible.

**Editor**
- New: **Edit → Copy as HTML (Cmd+Shift+C)** — copies with formatting preserved, for pasting into emails (Mail, Gmail). Without a selection, the whole document is copied; plain-text editors receive plain Markdown.
- Fixed: external file changes now show up in **all** open tabs, not just the first one (live reload after editing a file outside Mark).
```
