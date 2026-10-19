# Visual Regression Test Plan — Mark v2.0.0-alpha

## Pre-test Protocol (MANDATORY before every run)

```bash
# Option 1: Script (recommended)
bash tools/dev-smoke.sh

# Option 2: Manually
# 1. Clean state
pkill -f "target/.*/mark" ; pkill -f vite ; sleep 2

# 2. Fresh dev server
npm run dev &
until curl -s -o /dev/null -w '%{http_code}' http://localhost:1420/ | grep -q 200; do sleep 1; done

# 3. Fresh build
cargo build --manifest-path src-tauri/Cargo.toml --bin mark

# 4. Reset window-state (default size)
rm -f ~/Library/Application\ Support/com.xronocode.mark/.window-state.json

# 5. Launch with verification
./target/debug/mark 2>/tmp/mark-stderr.log &
sleep 4
grep 'BLOCK_TITLEBAR_TRANSPARENT_OVERLAY_OK' /tmp/mark-stderr.log || echo "FAIL: titlebar"
grep 'BLOCK_INVOKE_OK' /tmp/mark-stderr.log || echo "FAIL: renderer boot"
curl -s -o /dev/null -w '%{http_code}' http://localhost:1420/ | grep -q 200 || echo "FAIL: dev server died"
```

**Pass criteria for each test:**
- ✅ = visually correct + backend marker in stderr (if any)
- ❌ = broken
- ⚠️ = works with caveats

## Rules During Testing (MANDATORY)

1. **ONE instance of Mark.** If a restart is needed — first `pkill -f "target/.*/mark"`, wait 2s, only then launch a new one. Verify: `pgrep -f "target/.*/mark"` must return **one** PID.

2. **Before every screenshot** — check:
   - Dev server alive: `curl -s -o /dev/null -w '%{http_code}' http://localhost:1420/` → 200
   - Mark process alive: `pgrep -f "target/.*/mark"` → exactly 1 PID
   - If any check fails → **stop, run the Pre-test Protocol again**

3. **Tests that require restarting Mark** (run the full Pre-test Protocol again):
   - 1.10 (size persistence) — close and reopen Mark
   - 9A.7 (restore layout) — close and reopen Mark
   - 9A.8 (startup action) — close and reopen Mark
   - 11.13 (second instance) — launch a second instance, then kill it
   - 14.4–14.6 (Finder/CLI open) — may create a second instance

4. **White screen = check the dev server first**, do not hunt for a rendering bug. In 90% of cases it is a dead server.

5. **After fullscreen (1.12, 1.13)** — wait 2s after exiting, the macOS animation can delay layout recalc.

---

## GROUP 1: Window and Titlebar

| # | Test | Front (what we see) | Back (what we verify) |
|---|------|--------------------|-----------------------|
| 1.1 | Initial window size | 1024×768, centered on screen | `.window-state.json` absent → default from tauri.conf.json |
| 1.2 | Traffic lights + icons on one line | 🔴🟡🟢 on the left, then sidebar/folder/toc/gear/moon | `BLOCK_TITLEBAR_TRANSPARENT_OVERLAY_OK` in stderr |
| 1.3 | Transparent titlebar | No white strip above the icons, background == editor background | — |
| 1.4 | "Untitled-1" title | Centered in the titlebar | — |
| 1.5 | Version badge | "v2.0.0-alpha.7 DEV" on the right | Debug build only |
| 1.6 | Word count "W 0" | On the right, clickable | Click cycles Words → Chars → Paragraphs → **All** (4 modes) |
| 1.7 | Drag window by titlebar | Dragging by an empty area of the titlebar works | `data-tauri-drag-region` + fallback mousedown handler |
| 1.8 | Double-click maximize | Double-click on the titlebar → maximize/restore (macOS) | — |
| 1.9 | Window resize | Corners and edges, smooth resize | — |
| 1.10 | Size persistence across launches | Close → open → same size and position | `.window-state.json` updated |
| 1.11 | Minimize / Restore | 🟡 click → dock, click from dock → restored | — |
| 1.12 | Fullscreen (green button) | 🟢 click → fullscreen, Esc → back | — |
| 1.13 | **Fullscreen → exit → titlebar intact** | After Esc from fullscreen: icons in place, drag works, traffic lights visible | Regression: the titlebar can break after fullscreen |
| 1.14 | **Drag window past screen edge** | Drag right/left/up beyond the monitor boundary → the window is not lost, can be brought back | — |
| 1.15 | **Green button long-press → Tile** | Press and hold 🟢 → Tile Left / Tile Right menu (macOS Sequoia+) → the window takes half the screen | Verify the titlebar does not break in tiled mode |
| 1.16 | **Resize to minimum size** | Drag the corners to the minimum → UI does not break, buttons are not clipped, no overflow | — |
| 1.17 | **Filename click → rename** (macOS) | Click the filename in the titlebar → inline rename field | — |
| 1.18 | **Unsaved indicator** | Type text → red dot next to the filename in the titlebar | — |

---

## GROUP 2: Editor — Basic Functions

| # | Test | Front | Back |
|---|------|-------|----|
| 2.1 | Empty editor | "Type @ to insert", cursor blinking | — |
| 2.2 | Text input | Type a paragraph → text appears | — |
| 2.3 | Scrolling with long text | Paste 100+ lines → scrolling works, the window does not grow | — |
| 2.4 | H1-H6 headings | `# H1` → large, `###### H6` → small | — |
| 2.5 | Lists | `- item`, `1. item`, `- [ ] task` → rendered correctly | — |
| 2.6 | Code fence | ` ```js ` → syntax highlighting | — |
| 2.7 | Blockquote | `> text` → styled quote | — |
| 2.8 | Table | Via the Paragraph → Table menu → set 3×3 → table | — |
| 2.9 | Horizontal rule | `---` → horizontal line | — |
| 2.10 | Link | `[text](url)` → clickable link with popup | — |
| 2.11 | Image | `![alt](path)` → image renders | — |
| 2.12 | Inline code | `` `code` `` → monospace style | — |
| 2.13 | Bold / Italic | `**bold**`, `*italic*` → formatting | — |
| 2.14 | Math block | `$$\sum$$` → formula renders | — |
| 2.15 | Mermaid diagram | ` ```mermaid ` → SVG diagram | — |
| 2.16 | Front matter | `---\ntitle: x\n---` → styled block | — |
| 2.17 | Unsaved indicator | Type text → dot in the tab | — |
| 2.18 | Undo / Redo | Cmd+Z / Cmd+Shift+Z | — |
| 2.19 | **Duplicate paragraph** | Cmd+Shift+D (or edit.duplicate) → the line is duplicated | — |
| 2.20 | **@ quick insert** | Type `@` → dropdown list of blocks (paragraph, table, code, math...) | — |

---

## GROUP 3: Tabs

| # | Test | Front | Back |
|---|------|-------|----|
| 3.1 | New tab (Cmd+N) | "Untitled-2" appears | — |
| 3.2 | Tab switching | Click a tab → content changes | — |
| 3.3 | Close tab (Cmd+W) | The tab disappears, focus moves to the neighbor | — |
| 3.4 | Closing an unsaved tab | "Save / Don't Save / Cancel" dialog | `mt::ask-for-close` event |
| 3.5 | Middle-click close | Middle mouse button → the tab closes | — |
| 3.6 | Tab scrolling | 10+ tabs → horizontal scroll (wheel + touchpad) | — |
| 3.7 | Drag-and-drop reordering | Drag a tab → order changes (dragula) | — |
| 3.8 | Tab context menu (right-click) | **7 items:** Close This, Close Others, Close Saved, Close All, ―, Rename, Copy Path, Show in Folder | Rename/Copy Path/Show in Folder disabled for Untitled |
| 3.9 | "+" button | Button at the end of the tab bar → new tab (opacity: 0 → hover) | — |
| 3.10 | Tab bar toggle | view.toggle-tabbar → the tab bar hides/shows | — |
| 3.11 | Cycle tabs | Ctrl+Tab / Ctrl+Shift+Tab → next/prev tab | — |
| 3.12 | **Tab unsaved indicator** | Unsaved tab → red dot, hover → X to close | — |
| 3.13 | **Closing the last tab** | Cmd+W on the only tab → behavior (new empty tab or empty window) | — |

---

## GROUP 4: Sidebar

| # | Test | Front | Back |
|---|------|-------|----|
| 4.1 | Toggle sidebar | Sidebar button in the titlebar → panel on the left | — |
| 4.2 | Files panel | Folder button → file tree or "Open Folder" CTA | — |
| 4.3 | Open folder | CTA or Cmd+Shift+O → dialog → file tree | `mt_cmd_open_folder` |
| 4.4 | Tree navigation | Click a file → opens in a tab | `mt_fs_read` |
| 4.5 | Expand/collapse folder | Click the arrow → contents are shown | — |
| 4.6 | TOC panel | TOC button → list of headings of the current document | — |
| 4.7 | TOC → navigation | Click a heading in the TOC → scrolls to it in the editor | — |
| 4.8 | Opened Files section | List of open tabs, Save All, Close All | — |
| 4.9 | Sidebar resize | Drag the right edge (3px drag bar) → width changes (min 220px) | — |
| 4.10 | File context menu (right-click) | **9 items:** New File, New Directory, ―, Copy, Cut, Paste, ―, Rename, Move to Trash, ―, Show in Folder | Paste disabled if the clipboard is empty |
| 4.11 | Create file in sidebar | Right-click → New File → enter a name → the file is created | `mt_fs_write` |
| 4.12 | **Create directory** | Right-click → New Directory → enter a name → the directory is created | — |
| 4.13 | Rename file | Right-click → Rename → enter the new name | — |
| 4.14 | Delete file | Right-click → Move to Trash → confirmation | `mt_fs_unlink` |
| 4.15 | File watcher | Modify a file externally → the tree updates | `mt::watch::event` |
| 4.16 | **Copy / Cut / Paste** | Right-click → Copy → navigate to another folder → Paste → the file is copied | — |
| 4.17 | **Exclude patterns** | treePathExcludePatterns setting → files are filtered from the tree | `mt_prefs_set` |

---

## GROUP 5: Search

| # | Test | Front | Back |
|---|------|-------|----|
| 5.1 | Find (Cmd+F) | The search panel appears | — |
| 5.2 | Text search | Type a word → matches highlighted, "1/N" counter | — |
| 5.3 | Next / Previous | Enter / Shift+Enter → navigate the matches | — |
| 5.4 | Case Sensitive | Aa button → case-sensitive search | — |
| 5.5 | Whole Word | \b button → whole words only | — |
| 5.6 | Regex | .* button → regex search, error on an invalid regex | — |
| 5.7 | Replace (Cmd+H) | The replace field appears | — |
| 5.8 | Replace one | Button → a single replacement | — |
| 5.9 | Replace all | Button → all replacements, the counter updates | — |
| 5.10 | Find in Folder (Cmd+Shift+F) | Sidebar search across all project files | `mt_search_spawn` |
| 5.11 | Search results | List of files with match counts | `mt::search-event` |
| 5.12 | Cancel search | Cancel button → the search is aborted | `mt_search_cancel` |
| 5.13 | Close find bar | Escape → the panel closes | — |

---

## GROUP 6: Editor Modes

| # | Test | Front | Back |
|---|------|-------|----|
| 6.1 | Source Code Mode (Cmd+Alt+S) | CodeMirror instead of WYSIWYG, raw markdown | — |
| 6.2 | Source → back | Cmd+Alt+S again → back to WYSIWYG | — |
| 6.3 | Focus Mode | Only the current paragraph is bright, the rest are dimmed | — |
| 6.4 | Typewriter Mode | Cursor always centered on screen, auto-scroll | — |
| 6.5 | Focus + Typewriter combined | Both modes at the same time | — |
| 6.6 | Diff View | Enable → side-by-side diff vs git HEAD | `mt_diff_baseline` |
| 6.7 | Diff for Untitled | "No baseline for untitled" error | — |
| 6.8 | **Diff: inline toggle** | Switch side-by-side ↔ inline in the diff view | — |
| 6.9 | **Text direction toggle** | view.text-direction-ltr / view.text-direction-rtl → text direction changes | — |

---

## GROUP 7: Themes (34 items)

| # | Test | Front | Back |
|---|------|-------|----|
| 7.1 | Quick theme toggle (🌙 button) | Click → light ↔ dark switch | `mt_prefs_set` |
| 7.2 | Editor background after switching | Dark background in dark, light in light | CSS variables |
| 7.3 | Titlebar color in dark | The titlebar picks up the theme color (does not stay white) | — |
| 7.4 | Sidebar color in dark | The sidebar picks up the theme color | — |
| 7.5 | Preferences → Theme | Theme cards, click → applied instantly | — |
| 7.6 | Each of the 34 themes | Apply → verify it renders without artifacts | — |
| 7.7 | Custom CSS | Enter `body { font-size: 20px }` → the font grows | — |
| 7.8 | **Theme via the native menu** | View → Theme → pick from the submenu → applied | — |

**Theme list for the full run:**
Light (10): ayu-light, light, catppuccin-latte, everforest-light, graphite, gruvbox-light, rose-pine-dawn, solarized-light, tokyo-night-light, ulysses
Dark (23): ayu-dark, ayu-mirage, dark, catppuccin-mocha, cyberdream, dracula, everforest-dark, gruvbox-dark, horizon-dark, kanagawa, material-dark, monokai-pro, nightfox, nord, one-dark, oxocarbon-dark, palenight, rose-pine, rose-pine-moon, solarized-dark, synthwave-84, tokyo-night, tokyo-night-storm

---

## GROUP 8: File Operations

| # | Test | Front | Back |
|---|------|-------|----|
| 8.1 | Save (Cmd+S) new file | Save As dialog → pick a path → the file is created | `mt_response_file_save` |
| 8.2 | Save an existing file | Saves without a dialog, the unsaved dot disappears | `mt_response_file_save` |
| 8.3 | Save As (Cmd+Shift+S) | Dialog → new path → the file is copied | `mt_response_file_save_as` |
| 8.4 | Open File (Cmd+O) | Dialog → pick .md → opens in a new tab | `mt_cmd_open_file` + `mt_fs_read` |
| 8.5 | Open Folder (Cmd+Shift+O) | Dialog → the sidebar shows the tree | `mt_cmd_open_folder` |
| 8.6 | File drag-and-drop | Drag a .md into the window → opens in a tab | `onDragDropEvent` |
| 8.7 | Export HTML | File → Export HTML → a .html file is created | — |
| 8.8 | Export PDF | File → Export PDF → a .pdf file is created | `mt_pandoc_export` or `mt_print_to_pdf` |
| 8.9 | Auto-save | Enable in settings → change text → the file saves after 5s | `mt_prefs_set` + `mt_response_file_save` |
| 8.10 | Rename file | Click the name in the titlebar → enter the new name | — |
| 8.11 | File encoding | Status bar → encoding → change → re-read | — |
| 8.12 | Line endings | LF / CRLF → change → verify on save | — |
| 8.13 | Open Recent | File → Open Recent → file list | `mt_recent_list` |
| 8.14 | **Import file** | file.import-file → pick a file → imported | — |
| 8.15 | **Move file** | file.move-file → dialog → the file is moved, the tab updated | — |
| 8.16 | **Print** | file.print → system print dialog | — |

---

## GROUP 9: Preferences

### 9A. General

| # | Setting | Enable | Verify | Disable | Verify |
|---|-----------|----------|-----------|-----------|-----------|
| 9A.1 | Auto-save | ✓ toggle | Change text → the file is saved | ✗ toggle | The file does NOT save on its own |
| 9A.2 | Auto-save delay | 1000ms | Saves after ~1s | 10000ms | Saves after ~10s |
| 9A.3 | Hide scrollbar | ✓ | The scrollbar disappears | ✗ | The scrollbar is visible |
| 9A.4 | Zoom | 0.5 | Everything small | 2.0 | Everything large |
| 9A.5 | Word wrap in TOC | ✓ | Long headings wrap | ✗ | Truncated |
| 9A.6 | File sort | "title" | Alphabetical order | "modified" | By date |
| 9A.7 | Restore layout | ✓ | Close/open → the same state | ✗ | Empty on startup |
| 9A.8 | Startup action | "blank" | Empty tab | "openLastFolder" | Previous folder |
| 9A.9 | Language | "ru" | UI in Russian | "en" | UI in English |
| 9A.10 | **Open files in new window** | ✓ | Open File → new window | ✗ | Same window |
| 9A.11 | **Open folder in new window** | ✓ | Open Folder → new window | ✗ | Same window |
| 9A.12 | **Tree path exclude patterns** | `["node_modules","*.log"]` | These files are hidden in the tree | `[]` | All visible |

### 9B. Editor

| # | Setting | Value 1 | Verify | Value 2 | Verify |
|---|-----------|-----------|-----------|-----------|-----------|
| 9B.1 | Font size | 12px | Small font | 32px | Large font |
| 9B.2 | Line height | 1.2 | Dense lines | 2.0 | Loose lines |
| 9B.3 | Font family | "Open Sans" | The font changes | "Arial" | A different font |
| 9B.4 | Editor line width | "80ch" | Narrow column | "" (empty) | Full width |
| 9B.5 | Code font size | 12px | Small code | 28px | Large code |
| 9B.6 | Code font family | "Menlo" | Code font | "Courier" | A different one |
| 9B.7 | Code line numbers | ✓ | Line numbers in the code fence | ✗ | No numbers |
| 9B.8 | Wrap code blocks | ✓ | Long lines wrap | ✗ | Horizontal scroll |
| 9B.9 | Auto-pair brackets | ✓ | `(` → `()` automatically | ✗ | Only `(` |
| 9B.10 | Auto-pair quotes | ✓ | `"` → `""` automatically | ✗ | Only `"` |
| 9B.11 | Tab size | 2 | 2-space indent | 4 | 4 spaces |
| 9B.12 | End of line | "lf" | LF on save | "crlf" | CRLF on save |
| 9B.13 | Text direction | "rtl" | Text right-to-left | "ltr" | Normal |
| 9B.14 | Default encoding | "utf8" | UTF-8 by default | "latin1" | Latin-1 |
| 9B.15 | Auto-guess encoding | ✓ | A CP1251 file → detected | ✗ | Read as UTF-8 (garbled) |
| 9B.16 | Hide quick insert | ✓ | No "Type @" hint | ✗ | The hint is visible |
| 9B.17 | Hide link popup | ✓ | Hover → no popup | ✗ | Hover → popup |
| 9B.18 | **Auto-pair markdown syntax** | ✓ | `**` → `****` with the cursor inside | ✗ | Only `**` |
| 9B.19 | **Trim unnecessary code block empty lines** | ✓ | Empty lines in the code fence are removed | ✗ | Kept |
| 9B.20 | **Auto-normalize line endings** | ✓ | Mixed LF/CRLF → normalized | ✗ | Left as is |
| 9B.21 | **Trim trailing newline** | 0 | Untouched | 2 | One \n at the end |
| 9B.22 | **Auto-check (task lists)** | ✓ | Click a checkbox → the ✓ persists | ✗ | — |

### 9C. Markdown

| # | Setting | Value 1 | Verify | Value 2 | Verify |
|---|-----------|-----------|-----------|-----------|-----------|
| 9C.1 | Bullet list marker | "-" | Hyphen | "*" | Asterisk |
| 9C.2 | Order list delimiter | "." | `1.` | ")" | `1)` |
| 9C.3 | List indentation | 2 | 2-space indent | 4 | 4-space |
| 9C.4 | Frontmatter type | "-" (YAML) | `---` | "+" (TOML) | `+++` |
| 9C.5 | Superscript/subscript | ✓ | `^sup^` renders | ✗ | As plain text |
| 9C.6 | Footnotes | ✓ | `[^1]` renders | ✗ | As plain text |
| 9C.7 | HTML enabled | ✓ | `<b>bold</b>` renders | ✗ | As plain text |
| 9C.8 | GitLab compat | ✓ | GitLab extensions work | ✗ | Standard markdown |
| 9C.9 | Sequence theme | "hand" | Handwritten style | "simple" | Clean style |
| 9C.10 | **Prefer loose list item** | ✓ | Lists with blank lines between items | ✗ | Tight lists |
| 9C.11 | **Heading style** | "atx" | `# Heading` | "setext" | `Heading\n===` |

### 9D. Theme

| # | Test | Verify |
|---|------|-----------|
| 9D.1 | Theme selection | Click a card → the theme is applied instantly |
| 9D.2 | Custom CSS | Enter CSS → applied to the editor |
| 9D.3 | Clear Custom CSS | Delete the text → default style |

### 9E. Spelling

| # | Setting | Enable | Verify | Disable | Verify |
|---|-----------|----------|-----------|-----------|-----------|
| 9E.1 | Spellchecker | ✓ | Errors are underlined | ✗ | No underlines |
| 9E.2 | No underline | ✓ | The underline is hidden | ✗ | The underline is visible |
| 9E.3 | **Spellchecker language** | "en-US" | English errors | "ru" | Russian errors |

### 9F. Image

| # | Setting | Value | Verify |
|---|-----------|---------|-----------|
| 9F.1 | Image insert action | "path" | Inserted by absolute path |
| 9F.2 | Image insert action | "folder" | Copied into the folder |
| 9F.3 | Image folder path | Set a path | Images are saved there |
| 9F.4 | Relative directory | ✓ + "images" | The path is relative |
| 9F.5 | **Image insert action** | "upload" | Image bed settings (github token etc.) |

### 9G. Keybindings

| # | Test | Verify |
|---|------|-----------|
| 9G.1 | Shortcut table | All commands are shown with their current bindings |
| 9G.2 | Change a shortcut | Click → type a new one → save → works |
| 9G.3 | Reset a shortcut | Reset → default value |
| 9G.4 | Unbind | Remove the binding → the command is no longer triggered by the key |

---

## GROUP 10: Menu (native)

### 10A. Mark menu (macOS only)

| # | Item | Verify |
|---|-------|-----------|
| 10A.1 | Mark → About Mark | Dialog with the app version |
| 10A.2 | Mark → Preferences (Cmd+,) | The settings window opens |
| 10A.3 | Mark → Quit (Cmd+Q) | The app quits (with a dialog if unsaved) |

### 10B. File menu

| # | Item | Verify |
|---|-------|-----------|
| 10B.1 | File → New Tab (Cmd+N) | A new tab is created |
| 10B.2 | File → Open File (Cmd+O) | File open dialog |
| 10B.3 | File → Open Folder (Cmd+Shift+O) | Folder open dialog |
| 10B.4 | File → Open Recent | Dynamic submenu → list of recent files | `mt_recent_list` |
| 10B.5 | File → Save (Cmd+S) | The file is saved |
| 10B.6 | File → Save As (Cmd+Shift+S) | "Save as" dialog |
| 10B.7 | File → Close Tab (Cmd+W) | The tab closes |
| 10B.8 | File → Export PDF | The PDF is created |
| 10B.9 | File → Export HTML | The HTML is created |

### 10C. Edit menu

| # | Item | Verify |
|---|-------|-----------|
| 10C.1 | Edit → Undo (Cmd+Z) | Undoes the last action in the webview |
| 10C.2 | Edit → Redo (Cmd+Shift+Z) | Redoes the undone action |
| 10C.3 | Edit → Cut (Cmd+X) | Cut the selection |
| 10C.4 | Edit → Copy (Cmd+C) | Copy the selection |
| 10C.5 | Edit → Paste (Cmd+V) | Paste from the clipboard |
| 10C.6 | Edit → Select All (Cmd+A) | Select everything |
| 10C.7 | Edit → Find (Cmd+F) | Search panel |
| 10C.8 | Edit → Replace (Cmd+H) | Replace panel |
| 10C.9 | Edit → Find in Folder (Cmd+Shift+F) | Project-wide search |

### 10D. View menu

| # | Item | Verify |
|---|-------|-----------|
| 10D.1 | View → Toggle Sidebar (Cmd+B) | Sidebar |
| 10D.2 | View → Source Code Mode (Cmd+Alt+S) | Source code mode |
| 10D.3 | View → Theme → (submenu) | Submenu: light, dark, graphite, material-dark, one-dark, ulysses → the theme is applied |

### 10E. Help menu

| # | Item | Verify |
|---|-------|-----------|
| 10E.1 | Help → Documentation | An external link to the GitHub docs opens |
| 10E.2 | Help → Check for Updates | Update check | `mt_updater_check` |

---

## GROUP 11: Special Scenarios

| # | Scenario | Verify front | Verify back |
|---|----------|-----------------|---------------|
| 11.1 | Large file (10K+ lines) | Smooth scrolling, no freezes | Memory < 500MB |
| 11.2 | File with a non-standard encoding | CP1251/Shift-JIS → the text is readable | `mt_fs_read` with auto-guess |
| 11.3 | File without an extension | Opens as plain text | — |
| 11.4 | 20+ tabs at once | All render, switching < 100ms | — |
| 11.5 | External file change | The file updates in the editor | `mt::watch::event` |
| 11.6 | Deleting an open file | Notification, the tab is marked | `mt::watch::event` |
| 11.7 | Cmd+Q with unsaved changes | "Save before quit?" dialog | `mt::ask-for-close` |
| 11.8 | Two windows (if supported) | File → New Window | — |
| 11.9 | Dev server dies (debug only) | White screen, but no crash | — |
| 11.10 | Empty folder | The sidebar shows an empty tree | — |
| 11.11 | **Opening .md from Finder** | Double-click a .md → Mark opens the file | `mt_drain_pending_opens` |
| 11.12 | **Opening .md from the CLI** | `./mark file.md` → the file opens in a tab | `mt_drain_pending_opens` |
| 11.13 | **Mark already running + open .md** | The second instance passes the file to the first, does not create a new window | — |
| 11.14 | **Batch save & close** | Several unsaved tabs → Cmd+Q → a dialog for each/all | `mt_save_and_close_tabs` |
| 11.15 | **Zoom via Cmd+Scroll** | Cmd+scroll → zoom from 62.5% to 200% (12 levels) | — |
| 11.16 | **Always on Top** | window.toggle-always-on-top → the window stays above all others | — |

---

## GROUP 12: IPC Backend Validation

These tests verify that the backend responds correctly.

### 12A. Preferences & Config

| # | Command | Test |
|---|---------|------|
| 12A.1 | `mt_prefs_get_all` | Returns all settings with defaults |
| 12A.2 | `mt_prefs_set` + `mt_prefs_get` | Set → Get → the value matches |
| 12A.3 | `mt_workspace_set` | Sets the workspace root |

### 12B. Fonts & Menu

| # | Command | Test |
|---|---------|------|
| 12B.1 | `mt_fonts_list` | List of > 10 fonts |
| 12B.2 | `mt_menu_taxonomy` | JSON with all menu items |

### 12C. File System

| # | Command | Test |
|---|---------|------|
| 12C.1 | `mt_fs_read` / `mt_fs_write` | Write → read → the content matches |
| 12C.2 | `mt_fs_stat` | Size and modification time are correct |
| 12C.3 | `mt_fs_readdir` | List of files in a directory |
| 12C.4 | `mt_fs_unlink` | The file is deleted |
| 12C.5 | `mt_walk_project` | Recursive walk → all files are found |

### 12D. Search

| # | Command | Test |
|---|---------|------|
| 12D.1 | `mt_search_spawn` | The search finds known text |
| 12D.2 | `mt_search_cancel` | The search is aborted without an error |

### 12E. File Watch

| # | Command | Test |
|---|---------|------|
| 12E.1 | `mt_watch_subscribe` | Subscribe to a file → event on change |
| 12E.2 | `mt_watch_unsubscribe` | Unsubscribe → no more events arrive |

### 12F. Recent Files

| # | Command | Test |
|---|---------|------|
| 12F.1 | `mt_recent_add` + `mt_recent_list` | Add → the list contains it |
| 12F.2 | `mt_recent_clear` | Clear → the list is empty |

### 12G. Shortcuts

| # | Command | Test |
|---|---------|------|
| 12G.1 | `mt_shortcut_list` | The shortcut list is non-empty |
| 12G.2 | `mt_shortcut_register` / `_unregister` | Register → the shortcut works → unregister |

### 12H. Spellcheck

| # | Command | Test |
|---|---------|------|
| 12H.1 | `mt_spell_get_config` | Returns enabled, language, noUnderline |
| 12H.2 | `mt_spell_set_enabled` | Enable/disable → the config is updated |
| 12H.3 | `mt_spell_set_lang` | Change the language → the config is updated |

### 12I. Export & Tools

| # | Command | Test |
|---|---------|------|
| 12I.1 | `mt_updater_check` | Does not crash, returns a result |
| 12I.2 | `mt_pandoc_status` | Returns Pandoc availability |
| 12I.3 | `mt_screenshot_capture` | macOS: screen capture returns a path |
| 12I.4 | `mt_diff_baseline` | Returns the git HEAD version of the file |

### 12J. Keychain (Secrets)

| # | Command | Test |
|---|---------|------|
| 12J.1 | `mt_secret_set` + `mt_secret_get` | Set → Get → matches |
| 12J.2 | `mt_secret_delete` | Delete → Get → error |

### 12K. Default Handler (macOS)

| # | Command | Test |
|---|---------|------|
| 12K.1 | `mt_get_default_md_handler` | Returns {isDefault: bool} |
| 12K.2 | `mt_set_default_md_handler` | Set → get → isDefault: true |
| 12K.3 | `mt_unset_default_md_handler` | Unset → get → isDefault: false |

---

## GROUP 13: Formatting (paragraph + format commands)

### 13A. Paragraph commands (structural blocks)

| # | Command | Input/action | Result |
|---|---------|---------------|-----------|
| 13A.1 | paragraph.heading-1 | Cmd on a paragraph | Paragraph → `# Heading 1` |
| 13A.2 | paragraph.heading-2 | Cmd on a paragraph | Paragraph → `## Heading 2` |
| 13A.3 | paragraph.heading-3 | Cmd on a paragraph | Paragraph → `### Heading 3` |
| 13A.4 | paragraph.heading-4 | — | `#### Heading 4` |
| 13A.5 | paragraph.heading-5 | — | `##### Heading 5` |
| 13A.6 | paragraph.heading-6 | — | `###### Heading 6` |
| 13A.7 | paragraph.upgrade-heading | On H3 → Upgrade | H3 → H2 |
| 13A.8 | paragraph.degrade-heading | On H2 → Degrade | H2 → H3 |
| 13A.9 | paragraph.table | Command | Insert a table (rows/cols dialog) |
| 13A.10 | paragraph.code-fence | Command | Insert a ` ``` ` block |
| 13A.11 | paragraph.quote-block | Command | Insert a `> ` quote |
| 13A.12 | paragraph.math-formula | Command | Insert a `$$ $$` block |
| 13A.13 | paragraph.html-block | Command | Insert an HTML block |
| 13A.14 | paragraph.order-list | Command | Insert an ordered list |
| 13A.15 | paragraph.bullet-list | Command | Insert a bullet list |
| 13A.16 | paragraph.task-list | Command | Insert a `- [ ] ` checklist |
| 13A.17 | paragraph.horizontal-line | Command | Insert `---` |
| 13A.18 | paragraph.front-matter | Command | Insert YAML front matter |
| 13A.19 | paragraph.reset-paragraph | On a heading → Reset | Reset to a plain paragraph |

### 13B. Format commands (inline formatting)

| # | Command | Action | Result |
|---|---------|----------|-----------|
| 13B.1 | format.strong | Select text → Cmd+B | `**text**` |
| 13B.2 | format.emphasis | Select text → Cmd+I | `*text*` |
| 13B.3 | format.underline | Select text → Cmd+U | `<u>text</u>` |
| 13B.4 | format.highlight | Select text → command | `==text==` |
| 13B.5 | format.superscript | Select → command | `^text^` |
| 13B.6 | format.subscript | Select → command | `~text~` |
| 13B.7 | format.inline-code | Select → Cmd+E | `` `text` `` |
| 13B.8 | format.inline-math | Select → command | `$text$` |
| 13B.9 | format.strike | Select → command | `~~text~~` |
| 13B.10 | format.hyperlink | Select → Cmd+K | `[text](url)` dialog |
| 13B.11 | format.image | Command | `![alt](url)` dialog |
| 13B.12 | format.clear-format | Select → command | All inline formatting is removed |

### 13C. Edit commands (structural)

| # | Command | Action | Result |
|---|---------|----------|-----------|
| 13C.1 | edit.duplicate | Cmd+Shift+D | The current line is duplicated |
| 13C.2 | edit.create-paragraph | Enter | New paragraph after the cursor |
| 13C.3 | edit.delete-paragraph | Cmd+Shift+Backspace | The current paragraph is deleted |

---

## GROUP 14: macOS Integration

| # | Test | Front | Back |
|---|------|-------|----|
| 14.1 | Settings → Set as default | "Set Mark as default for .md" button → confirmation | `mt_set_default_md_handler` |
| 14.2 | Verify default | After set → .md files are associated with Mark | `mt_get_default_md_handler` → isDefault: true |
| 14.3 | Remove default | "Remove as default" button → confirmation | `mt_unset_default_md_handler` |
| 14.4 | Open via Finder | Double-click a .md in Finder → Mark opens the file | `mt_drain_pending_opens` |
| 14.5 | Open via CLI | `./target/debug/mark /path/to/file.md` → the file opens | `mt_drain_pending_opens` |
| 14.6 | Already running | Mark is running + open a .md from Finder → the file lands in the existing window | Single-instance lock |
| 14.7 | **Preview mode on Finder open** | previewModeOnFinderOpen=true → the file opens in preview mode | `mt_prefs_get` |
| 14.8 | **Screenshot** | edit.screenshot → screencapture → the image is inserted | `mt_screenshot_capture` |

---

## GROUP 15: Settings Window

| # | Test | Front | Back |
|---|------|-------|----|
| 15.1 | Open settings | Cmd+, or Mark → Preferences → a separate window | `mt_open_setting_window` |
| 15.2 | Panel navigation | Click: General, Editor, Markdown, Theme, Spelling, Image, Keybindings | — |
| 15.3 | Drag by titlebar | Dragging the settings window works | webkit-app-region: drag |
| 15.4 | Close (X) | X button → the window closes | — |
| 15.5 | Close (Cmd+W) | Shortcut → the window closes | — |
| 15.6 | Live changes | Change the theme in Settings → the main window updates instantly | broadcast event |
| 15.7 | Font picker | General → Font → list of system fonts | `mt_fonts_list` |
| 15.8 | Theme cards | Theme → cards with previews → click → applied | — |
| 15.9 | Custom CSS textarea | Enter CSS → applied → delete → reverted | — |
| 15.10 | Keybindings table | Table of all commands with their current bindings, filtering | — |

---

## Run Order

**Quick smoke (5 min):** 1.1–1.3, 2.1–2.3, 3.1–3.3, 4.1–4.2, 7.1, 8.1–8.2
**Standard (40 min):** Groups 1–6 in full + 7.1–7.5 + 8.1–8.5 + 15.1–15.6
**Full regression (3 h):** All groups 1–15
**Theme marathon (20 min):** 7.6 — all 33 themes
**Formatting pass (30 min):** Group 13 in full
**macOS integration (15 min):** Group 14 in full

---

## Automation

Already automated (Playwright + Tauri):
- Group 2 (markdown element rendering) — partially covered by e2e
- Group 3 (tabs) — `new-tab.spec.ts`
- Group 5 (search) — `search.spec.ts`
- Group 6 (modes) — `view-modes.spec.ts`
- Group 12 (IPC) — can be automated via vitest with invoke mocks

Requires manual verification:
- Group 1 (titlebar, drag, traffic lights, tile) — native elements outside Playwright
- Group 7.6 (all 33 themes) — visual diff, screenshot-compare is possible
- Group 9 (settings) — toggle/input, needs UI automation
- Group 11 (edge cases) — special conditions
- Group 13 (formatting) — can be partially automated via e2e
- Group 14 (macOS integration) — native APIs, manual verification
- Group 15 (settings window) — a separate webview window

## Statistics

| Group | Tests | Description |
|--------|--------|----------|
| 1. Window and titlebar | 18 | Size, drag, resize, fullscreen, tile, traffic lights |
| 2. Editor | 20 | Input, scrolling, markdown elements, undo |
| 3. Tabs | 13 | Create, close, drag, context menu, cycle |
| 4. Sidebar | 17 | Tree, TOC, resize, context menu, watch |
| 5. Search | 13 | Find, replace, regex, find-in-folder |
| 6. Modes | 9 | Source, focus, typewriter, diff, RTL |
| 7. Themes | 8 + 33 | Toggle, custom CSS + all 33 themes individually |
| 8. File operations | 16 | Save, open, export, drag-drop, recent, import |
| 9. Settings | 56 | 7 panels × ~8 settings each |
| 10. Menu | 24 | 5 menus × ~5 items |
| 11. Special scenarios | 16 | Edge cases, lifecycle, zoom |
| 12. IPC backend | 30 | 11 subgroups, all IPC commands |
| 13. Formatting | 34 | Paragraph + format + edit commands |
| 14. macOS Integration | 8 | Default handler, Apple Events, screenshot |
| 15. Settings window | 10 | Navigation, drag, realtime apply |
| **TOTAL** | **~295** | |
