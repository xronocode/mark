# Changelog

All notable changes to Mark. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions before 2.3.0 were published as alpha and beta releases. The current version's download and signatures are on [GitHub Releases](https://github.com/xronocode/mark/releases/latest).



<!-- #region releases -->

## [2.9.0] - 2026-11-22

Export to Word, page width as a per-document setting, one-step update rollback,
files that remember where you stopped reading, title-bar mode chips and GitHub
themes — plus two Windows repairs: menu shortcuts and saving work again.

### UI polish

- GitHub and GitHub Dark join the theme families as the 17th pair: GitHub's own
  light and dark palettes with matching code highlighting. They appear wherever
  themes do — the theme list, the View › Theme menu, the command palette and
  Settings.
- One notification system: every notice renders as a severity-styled card in a
  single stack in the bottom-right corner. At most three cards are visible with
  a counter for the rest, errors stay until dismissed, hovering pauses the
  dismissal timer, and Esc closes the topmost card. Selecting text in a card
  copies it, a palette command replays everything shown during the session, and
  the update banner and the per-file message strip use the same cards.
- Active-mode chips sit in the title bar's right cluster and show at a glance
  whether Diff, Split or Source is on; the two-group menu switches views and
  writing modes, and Standard is the full reset.
- View › Standard View performs the same one-click full reset from the menu and
  the command palette.
- The Mark window can be moved by the header of the fullscreen table viewer.
- Both panes of a ⌘D comparison follow theme changes and stay readable in dark
  appearance.
- Active project-search options use the shared window accent.
- The shared active-tab underline stays visible in the Graphite and One Dark
  themes.
- Settings search matches the two supported image actions.
- Notices and the What's New sheet use the shared interface font; document
  typography is unchanged.
- Keyboard focus is visible on shared Settings and quick-settings controls
  without changing values or layout.
- Reopening Settings brings the window back to the front, and Word export
  notices can open the export settings.
- Cmd/Ctrl+B applies bold in the editor; the toggle-sidebar shortcut moves to
  Shift+Cmd/B, so one shortcut no longer shadows the other.
- Closing the last tab clears leftover image overlays: the floating image
  toolbar and its resize handles no longer linger over the home screen.
- The table-creation dialog puts the cursor in the rows field as soon as it
  opens, so typing works immediately.
- Quick Look code previews follow the system light and dark appearance, with
  readable syntax colors on the light background.
- At compact window sizes the quick-settings panel fits its space with one
  scroll region, five more controls show the visible keyboard-focus outline,
  modal sheets keep focus inside, and the title-bar "Aa" button works from the
  keyboard.
- Menus that open from the table row and column drag pills keep every label on
  one line in all ten languages.

- Every control in the Settings window shows a visible keyboard-focus ring,
  and its dialogs use the same interface font as the rest of the window.
### Product mechanics

- Every file remembers where you stopped: the scroll position and the caret
  survive closing and reopening a tab, reopening the file, quitting and
  relaunching, and renaming. A caret moved only by the arrow keys survives tab
  switching too.
- Updates can be undone in one step. Every update installed through Mark's
  built-in updater snapshots the previous version and its settings first; Help › Roll Back to Mark… restores both, and
  the version you left is not offered again until a newer release ships. If an
  update ever breaks startup, the same restore runs from the terminal before
  the app boots (`mark --rollback`, `--yes` for scripts). A failed snapshot
  cancels the update, and the snapshot only takes over after the new version
  actually starts.
- Cut and copy recover from a stale selection: Cmd+X, Cmd+C and the Edit menu
  work again after a leftover table-cell or image selection — before, they
  stayed silent until an app restart.
- Rollback and update hardening: every restore path verifies before it changes
  anything, the macOS app swap keeps the previous version until the new one is
  confirmed in place, and a completed restore that could not relaunch reports
  that instead of success.
- Feedback you can trust: a failing notification action says so instead of
  failing silently, a rollback confirmation cannot fail silently, the copy
  pulse appears only after text really reached the clipboard, and a boot after
  a rollback that skipped restoring preferences tells you once.
- A grouped save or close that is cancelled, blocked or fails keeps complete
  snapshots of every owned document and all tabs open.
- Double-click follows a rendered link, word selection and hover tools stay
  stable while editing, and local text links open in tabs of the current
  window.
- Typing a clock time like 12:30 stays text; supported numeric and alphabetic
  emoji still convert.
- A save writes the text and the file format as one coherent, strictly
  validated version, and opening reads the file's actual metadata.
- Undo, redo and selections in Source view stay with their document across tab
  switches and reopenings.
- Split-view edits on the rendered pane are saved even when the retained
  Source preference is enabled.
- Autosave is on by default: every change reaches disk without Cmd+S. An
  explicitly saved "off" keeps it off.
- External changes follow one rule: a clean tab silently skips an identical
  reload, a tab with edits is replaced only after confirmation, and permission
  problems are reported instead of failing silently.
- The session profile is written as one unit, so a crash can no longer leave
  it half-written, and closing a window no longer interrupts a save in
  progress.
- Invalid settings values are repaired once at startup with a plain notice
  naming the key and the reason; switching themes no longer overwrites a
  manually set page width, and clearing custom CSS really clears it.

- The editor surface keeps a single owner for the state it reports about the
  document, and the live document closes as one unit instead of piece by
  piece.
- A hardening pass on preferences, the gallery and the updater: a late
  refusal no longer rolls back values you already confirmed, the gallery's
  scan-failure notice survives a successful list refresh (which now runs
  once), checking for updates cannot double-fire, and installing the same
  capability twice changes nothing the second time.
- Feedback you can trust, continued: a failed pin or undo says so instead of
  failing silently, a refused save reports the refusal, the Settings install
  row invalidates an offer once it is consumed, and the updater reads
  Retry-After exactly (whole seconds or an IMF date) and settles on a final
  verdict once the retry ceiling is passed.
### Content rendering

- Export to Word: the File menu, the tab context menu and the export command
  write real .docx files — native Word heading styles, tables with per-column
  alignment, hyperlinks, task checkboxes, real footnotes and native equations.
  Figures export at 2x quality, and page geometry follows your remembered
  print options.
- Bold and italic follow CommonMark pairing: nested bold italic, asterisk runs
  and stray markers render exactly as GitHub renders them, in the editor and
  in exports.
- Diagrams ride a newer Pele engine: labels support sub, sup, code and kbd;
  text like List<T> is no longer eaten by label parsing; long CJK labels wrap
  between characters instead of stretching the diagram; wrapped lines sit
  closer together; %% comments no longer swallow the preceding character; and
  every rendered diagram is valid XML, which the export paths rely on.
- The default writing column is an honest 768 px of text: the out-of-the-box
  column and a manually set 768 px are now pixel-identical.
- Page width becomes a per-document setting: a quick-settings panel in the
  title bar with Page, View and Tables tabs, View-menu presets and palette
  commands. Table modes say what they do: Auto sizes to content, Fit page fits
  the text column (and says so honestly when it does not fit), Full width
  takes the whole window. Column sizes survive everything, and the old
  pretend-fit is gone.
- Dragging table borders one after another keeps your earlier column choices
  in a fitted table.
- Double-clicking a resized column border keeps the fitted table inside its
  frame.
- PDF exports on macOS land exactly where you chose in the save dialog, with
  the page geometry you selected.
- HTML exports stay in sync with the current document model.
- Export options live in Settings, and PDF, HTML and Word exports open the
  save dialog directly.
- Pasting a plain-text table from a terminal (box-drawing or aligned)
  converts it into a Markdown pipe table; pipes and backslashes inside cells
  are escaped, and real Markdown tables paste unchanged.
- A finished table resize is always processed in the same order, whichever
  handle you dragged, so saved column widths no longer depend on the drag.
- Exported HTML post-processes diagrams exactly like the live editor, so pie
  and kanban diagrams in exports match what you see.
- Exports tell you what they include: images from outside the exported area
  are embedded only after a consent card naming the files, declined links are
  skipped and counted so the result notice stays honest, and diagram sources
  that cannot render ship as readable fenced placeholders.
- The Export settings window is one scrollable page — page setup, styling,
  content options and running heads — with one-click margin presets, plain
  header and footer fields, a Reset button, and it opens with the options you
  used last time.
- The document popover under the file name gets a quick-export row: PDF, Word
  and HTML in one row under the statistics, wired to the same commands as
  File › Export.

- The document model is written only after an image action actually
  confirms, and converting between task and regular list items no longer
  rewrites the surrounding list.
- Moving a file to another folder keeps the editor state it had, pins and
  scroll position included; the rendered pane publishes a save's state
  change at the same point after every render; and the snapshot behind an
  export no longer drifts from the live document.
### Folder work

- Searching no longer steals your Find queries, editor selections or keyboard
  copy/paste.
- Files move between sidebar folders by drag-and-drop or cut and paste; open
  tabs follow the file, and table layouts, reading positions and page widths
  travel with it.
- A multi-folder search delivers every folder's results before it reports
  complete — searches no longer end early or drop later folders.
- Search failures say so instead of showing "No results found".

- Project search behaves the same everywhere: the case option does exactly
  what it says, .gitignore rules apply only inside git repositories, and
  long result lines truncate cleanly without cutting a character in half.
### AI/agents

- Disabling an extension revokes its live access immediately, and paired
  extensions cannot reach each other's sessions.
- Live updates stay with their own tab across switches, closure, resync and
  local saves.
- Extension cards and the live-session indicator stay readable in the
  selected theme.
- Extension routes are scoped to granted permissions: reading context,
  applying edits and inserting text each need their own approval.
- Re-pairing an extension that already holds a live secret requires proving
  the old secret or an explicit trust reset.
- Extension edits apply only to the document version they were prepared
  against; stale edits are refused.
- An enabled extension's rights are fixed by what you approved in the pairing
  dialog, even if its manifest later claims more.
- Each extension streaming session carries a size and rate budget; a push
  beyond the cap is refused with a clear message.

- Errors from an extension invocation are bounded and sanitized, so a
  failing extension shows a short, honest message instead of leaking
  internals.
- Extension answers stay honest: an edit reports what actually happened
  instead of a blanket success, a timed-out request says the outcome is
  unknown rather than guessed, and a PlantUML diagram fetched from a remote
  renderer ships in the Word export as a readable placeholder instead of
  failing silently.
### Breadth

- On Windows and Linux, all 22 menu keyboard shortcuts respond again — Ctrl+S
  saves, Ctrl+N opens a file, the view-mode chords work; macOS is unchanged.
- Saving works on Windows: the security check rejected every Windows path as
  outside the sandbox; it now compares paths the way Windows writes them, and
  saves land on disk.
- A stabilization pass on editing and recovery: unsaved edits survive an
  external reload, shared-history two-pane editing and reading gestures are
  complete, and rough spots in tables, the title bar and checkboxes are
  repaired; approved security findings are closed.
- Links to executables and ambiguous document types are refused; Markdown,
  image and PDF links keep working.
- Quick Look previews show raw HTML as text and block remote content, document
  navigation and new windows; Markdown previews keep highlighting and
  embedded images.
- Opening very large documents avoids repeated redundant work.
- Ruby-annotation previews pass through the same HTML sanitizer as HTML
  blocks, so inline HTML in a ruby block can no longer run code when HTML
  rendering is enabled.
- If a macOS access bookmark fails to save, the library keeps working and
  pending access is recovered.
- A symlink swap between validation and saving is denied instead of writing
  outside the allowed area.
- The Windows Help-menu rollback no longer crashes: the restore runs off the
  interface task and every network step carries a deadline.

### References

Change ids behind the bullets above, per category in bullet order.

- UI polish: C-EDITOR-A11Y-CSS, C-GITHUB-THEME, C-NOTIFICATION-SYSTEM, C-TITLEBAR-MODE-CHIPS,
  FIX-021, C-VIEWER-WINDOW-DRAG, FIX-DIFF-THEME-SYNC,
  FIX-PROJECT-SEARCH-ACCENT, FIX-SHARED-ACTIVE-TAB-MARKER,
  FIX-IMAGE-ACTION-CATALOG, FIX-SHELL-CHROME-FONT, C-SETTINGS-KEYBOARD-FOCUS,
  C-SETTINGS-WINDOW-RESTORE, FIX-SIDEBAR-BOLD-CONFLICT,
  FIX-IMAGE-TOOLBAR-RESIDUE, C-TABLE-DIALOG-CREATION-VERIFICATION,
  C-QUICKLOOK-SYNTAX-THEME, C-COMPACT-WINDOWS-FIT, C-TABLE-BAR-MENU-OVERLAP.
- Product mechanics: C-SURFACE-OWNERSHIP, C-LATE-REFUSAL-HONESTY,
  C-HONEST-FAILURE-NOTICES, C-FILE-POSITION-MEMORY, C-UPDATER-ROLLBACK, FIX-020,
  C-UPDATER-REVIEW-FIXES, C-RENDER-REVIEW-FIXES, C-SAVE-CLOSE-DATA-SAFETY,
  C-MD-LINK-TABS, FIX-EMOJI-TIMESTAMPS, C-METADATA-SAVE-SAFETY,
  C-SOURCE-HISTORY-OWNERSHIP, C-SPLIT-SAVE-AUTHORITY, C-AUTOSAVE-DEFAULT-ON,
  C-EXTERNAL-RELOAD-OPERATION, C-SESSION-WRITE-ATOMICITY, C-PREFS-TRUTH.
- Content rendering: C-MUYA-MODEL-SURGERY, C-MOVE-AND-SNAPSHOT-CONSISTENCY,
  C-NATIVE-DOCX-RTF-EXPORT, C-COMMONMARK-EMPHASIS,
  DEPS-PELE-1-10, C-PAGE-WIDTH-TABLES-768, C-PAGE-WIDTH-TABLES,
  C-TABLE-SEQUENTIAL-RESIZE, C-TABLE-FITTED-RESET,
  FIX-NATIVE-PDF-DESTINATION, C-MUYA-CURRENT-MODEL-EXPORT,
  C-EXPORT-SETTINGS-SECTION-RECOVERY, C-PASTE-ASCII-TABLES,
  C-TABLE-LAYOUT-COMPLETION, C-PELE-HTML-POSTPROCESS, C-EXPORT-BOUNDARIES,
  C-EXPORT-SINGLE-PAGE, C-DOC-POPOVER-EXPORT-HUB.
- Folder work: C-SEARCH-ENGINE-PARITY, C-HOSTED-VALIDATION-RECOVERY, C-SIDEBAR-MOVE-FILE,
  C-SEARCH-SESSION-COMPLETION, C-SEARCH-ERROR-VISIBILITY.
- AI/agents: C-EXT-DELIVERY-HONESTY, C-EXT-ACK-HONESTY, C-SEC-STREAM-AUTH, C-SEC-STREAM-TABS,
  FIX-EXTENSION-THEME-TOKENS, C-SEC-STREAM-SCOPE, C-SEC-PAIR-REBIND,
  C-SEC-EDIT-TARGETING, C-SEC-EXT-GRANT-BOUND, C-STREAM-BUDGET.
- Breadth: C-WINDOWS-MENU-ACCELERATORS, C-WINDOWS-SAVE-PIPELINE,
  C-STABILIZE-29, C-SEC-LINK-OPEN, C-QUICKLOOK-CONTENT-BOUNDARY,
  FIX-LARGE-DOCUMENT-EMPTY-GUARD, FIX-022, FIX-023, C-SEC-SAVE-HANDLE,
  C-WIN-ROLLBACK-PANIC.


## [2.8.2] - 2026-10-24

The "See everything new" link in What's New now opens this changelog.

### Changed
- "See everything new" in What's New opens the release's section of the changelog on the Mark website instead of a GitHub release page.

### Fixed
- The changelog page on the Mark website lists every release again; versions 2.6.0 to 2.8.1 were missing from it.


## [2.8.1] - 2026-10-23

Export to PDF on macOS works for the first time since the feature shipped — and can no longer take the app down.

### Safety
- Export to PDF no longer aborts the app: the silent save job addressed a print-settings method that does not exist on macOS (`setJobSavingURL:`), which raised an Objective-C exception on every export since 2.5.0; the save target now travels through the print-settings dictionary, and the job runs through the same modal runner as the print panel.
- A new selector-audit test verifies every macOS print call this app makes against the live system APIs, so an imagined or renamed API fails in CI instead of in your export click.

## [2.8.0] - 2026-10-23

Work in several folders at once, open cloud folders as roots, and trust folder search again.

### Workspaces
- ⇧⌘O (File › Add Folder…) opens a folder beside the ones already open; every folder surface — the picker, drops, clipboard and the welcome screen — routes through one Add-or-Replace chooser, with Add preselected as the safe default.
- File › Replace Workspace… swaps the whole workspace; tabs with unsaved edits under removed roots raise one dialog first (Save & Close / Don't Save / Cancel), a failed save aborts the replace, and Cancel touches nothing.
- Tabs sharing a filename carry a dimmed owning-root suffix (the full path stays in the tooltip); restoring a session brings back every root, and folders that disappeared degrade visibly with a notice that lists them.

### Cloud folders
- iCloud Drive and OneDrive folders open as workspace roots; evicted iCloud placeholder files never pollute the tree, and a once-per-root notice explains that online-only files appear after they download.
- Cloud roots read by their product names — "iCloud Drive", "OneDrive" — instead of container identifiers.
- Folder picks and whole-drive trees no longer hang the app: the system picker runs to completion, and adding a drive-sized root streams its tree in batches instead of freezing the window.

### Search
- Folder search labels every hit with its owning root and keeps results complete while you type (a race between keystroke-canceled searches could drop late roots).
- Result counts pluralize correctly in all ten languages.

### Safety
- Quitting with unsaved tabs asks first (⌘Q and File › Quit): Save & Quit commits them, Don't Save discards on purpose, Escape stays — the silent data-loss path is gone.
- PDF export can no longer take Mark down right after you choose where to save (a rare macOS crash, first observed 2026-10-23): the print job runs beside the app instead of parking it mid-loop, and print-path failures surface as a notice (`FIX-017`).

## [2.7.0] - 2026-10-22

Sessions come back the way you left them, HTML exports travel on their own, and Windows gets its real title bar back.

### Sessions
- Launching Mark restores the previous session's tabs, folders and active tab; when auto-restore is off, the welcome screen's "Last session (N)" row reopens exactly the boot-time snapshot instead of a stale no-op.
- A count-badged button beside the tab strip lists recently closed tabs: reopen one with ⇧⌘T (newest to oldest through repeated presses), reopen all in strip order, or clear the history; closing the last tab surfaces the same recovery on the welcome screen.
- Missing files are skipped honestly: a fully missing session raises a localized warning, and reopening a deleted file reports it instead of failing silently.

### Export
- Export as HTML embeds locally readable images (relative, absolute and file:/// forms) as base64 data-URLs under an 8 MiB per-image cap, so a single .html file opens anywhere untouched; remote images are never fetched, and PDF/print flows are unchanged.

### Editor
- ⇧⌘P opens the command palette again on macOS through one owned accelerator.
- Table Markdown export escapes pipes by parity and keeps every real cell when rows are ragged.
- Disabling Auto Save cancels already queued writes instead of saving once more.
- Tab switching no longer cascades render warnings through transient cursor state.

### Windows and Linux
- The title bar renders native system caption buttons (Segoe MDL2/Fluent code points, no separators), keeps the app-menu and settings buttons, places the theme toggle as a fourth caption cell, and drops the guide button on every platform.

### Security
- follow-redirects 1.16.1 (Dependabot highs #144/#145).

## [2.6.0] - 2026-10-20

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

## [Unreleased]

### Known gaps
Carried over from the old status table in the README:
- Saving does not yet preserve a non-UTF-8 source encoding, and there is no manual encoding picker.
- Multiple windows: `--new-window` is accepted but has no effect yet.
- Intel Macs are not supported by the Homebrew cask; Linux builds are not published.
- Image upload services (PicGo and similar) are not supported.


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
<!-- #endregion releases -->
