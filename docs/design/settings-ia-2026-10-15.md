# Settings information-architecture audit (C-38, phase N2 / task T-002)

Date: 2026-10-15 · Branch: `agent/c38-n2` · Document only — no code changes.

Sources read for this audit: `.grace/changes/active/C-38/spec.xml` and `plan.xml`;
`src/renderer/src/prefComponents/*/` (all `index.vue` + `config.js`);
`src/renderer/src/_shims/preferences/schema.json`; `src/renderer/src/store/preferences.js`;
`src-tauri/src/m005_prefs.rs`, `src-tauri/src/m_v1_compat.rs`, `src-tauri/src/m014_encoding.rs`, `src-tauri/src/main.rs`;
`static/locales/en.json`, `static/locales/ru.json`; consumption sites grepped across `src/` and `src-tauri/src/`.

Path abbreviations used below (all relative to repo root):

- `PC/` = `src/renderer/src/prefComponents`
- `rs:` = `src-tauri/src`
- other paths are relative to `src/renderer/src`

---

## 1. Summary

**Counts.** `schema.json` defines **68 preference keys** (verified: `jq 'keys | length'` → 68; `src/renderer/src/_shims/preferences/schema.json:2-393`). The Settings UI additionally shows settings that are **not** in the schema (renderer-store-only keys and user-data keys): `treePathExcludePatterns`, `mathEnabled`, `frontmatterProperties`, `imageFolderPath`, `currentUploader`, `imageBed`, `githubToken`, `cliScript`, plus behavior-only store keys `liveReload`, `markdownLint`, `previewModeOnFinderOpen`, `diffMode`, `splitViewRatio`, `splitViewSwapped` — **14 extra keys**. The inventory table below has **82 rows = 68 schema keys + 14 UI/store-only keys**, every one listed.

**Sections today: 9** — General, Editor, Markdown, Spelling, Theme, Image, Keybindings, Language, Extensions (`src/renderer/src/router/index.js:33-83`, left rail `PC/sideBar/config.js:17-72`). Two of them are near-empty (Language holds exactly one setting, `PC/language/index.vue:9-15`), one (Extensions) is a gallery, not settings, and its rail label is hardcoded English (`PC/sideBar/config.js:67`).

**Main problems found:**

1. **Dead preferences shown as working controls.** The whole "Startup Options" group (`startUpAction`, `restoreLayoutState`, `defaultDirectoryToOpen`, `PC/general/index.vue:135-178`), both "open in new window" toggles, the sidebar exclude-patterns box, `fileSortBy` (shipped disabled), `autoGuessEncoding`, `autoNormalizeLineEndings`, `trimTrailingNewline` (the preference), and `preferHeadingStyle` (shipped disabled) are stored but consumed by nothing in the Tauri port (evidence per row in §2).
2. **Schema ↔ store default drift** on 4 keys (`fileSortBy`, `imageInsertAction`, `imagePreferRelativeDirectory`, `footnote`) — the schema is a preserved v1.2.3 artifact (`PC/sideBar/config.js:10-13`) and no longer describes the app.
3. **Label/units bugs**: hard-coded trailing colons in all five control components; the "14px px"-class unit duplication (a `codeFontSize` default stored as the string `'14px'` at `config.js:12` concatenated with another `px` at `util/theme.js:200`, plus the slider value+unit rendering at `PC/common/range/index.vue:9-11`); an empty "Max width" field (`editorLineWidth` default `""`, no placeholder, `PC/editor/index.vue:31-37`).
4. **Wrong grouping**: file-encoding settings under "Editor › File Representation"; the UI-language setting isolated in its own section; spelling far from other writing options; image/upload — the most technical group — at top level.
5. **Jargon labels** ("Prefer loose list item", "Auto complete markdown", "DFM Style", "ATX Style", "Trailing Newlines", "File Representation", "Front matter type") and fake/hidden controls (a permanently-on disabled "Auto detect language" switch on macOS, `PC/spellchecker/index.vue:19-24`; a hidden `codeBlockLineNumbers` toggle, `PC/editor/index.vue:61-67`; hidden `followSystemTheme`/`lightModeTheme`/`darkModeTheme`, `PC/theme/index.vue:33-59`).

---

## 2. Full inventory

Legend for **Action**: `keep` (same key, maybe new label/group) · `move` (other new section) · `drop` (remove from UI + schema; stored value left alone) · `defer` (hide until its feature exists) · `expose` (currently hidden, make visible) · `internal` (stays non-UI). Section moves are UI-only — keys never rename (C-38 constraint, `spec.xml:46`).

### 2.1 General section today

| Key | Section | Current EN label | Type / options | Default (schema → store if different) | Consumed where | New section | Action | Reason |
|---|---|---|---|---|---|---|---|---|
| `autoSave` | General › Auto Save | "Auto save" | bool | false / false | `store/editor.js:1347,1387` | General | keep | Working; autosave gate on save path. |
| `autoSaveDelay` | General › Auto Save | "Auto save delay" | number range 1000–10000 ms, step 100 | 5000 / 5000 | `store/editor.js:1408,1441` | General | keep | Working; slider max 10000 has no schema counterpart (`schema.json:8-12`) — tighten or leave. |
| `titleBarStyle` | General › Window (Linux only, `PC/general/index.vue:74`) | "Title Bar Style" | enum custom/native | custom / custom | `components/titleBar/index.vue:324,380`; `pages/preference.vue:39` | Appearance | move | It is window chrome, not general behaviour. Windows hardcodes `custom` (`titleBar/index.vue:380`) although the schema claims "Windows and Linux system only" (`schema.json:14`) — gate per OS explicitly. |
| `openFilesInNewWindow` | General › Window | "Open files in new window" | bool | false / false | **NOT CONSUMED — dead** (only `store/preferences.js:33`) | — | drop | v1 Electron windowing concept; Tauri port opens tabs, no reader exists. |
| `openFolderInNewWindow` | General › Window | "Open folders in new window" | bool | false / false | **NOT CONSUMED — dead** (only `store/preferences.js:34`) | — | drop | Same as above. |
| `zoom` | General › Window | "Zoom" | select 50–200 % | 1.0 / 1.0 | `pages/app.vue:135-136` → `store/editor.js:1800-1805` (`--content-zoom`); menu `commands/index.js:615-680` | Appearance | move | Display scale belongs with appearance; consumed and working. |
| `hideScrollbar` | General › Window | "Hide scrollbars" | bool | false / false | `pages/app.vue:281` → `util/theme.js:183,187-189` | Appearance | move | Pure display; consumed and working. |
| `wordWrapInToc` | General › Sidebar | "Wrap text in table of contents" | bool | false / false | `components/sideBar/toc.vue:4,65` | Appearance | move | Outline-panel display, not file behaviour. |
| `treePathExcludePatterns` | General › Sidebar | "Exclude patterns" | text (comma list) | — (store-only, `store/preferences.js:43`) | **NOT CONSUMED — dead** (only store state + UI `PC/general/index.vue:116-122`) | — | drop | Not in schema; no tree code reads it. |
| `fileSortBy` | General › Sidebar (disabled, `PC/general/index.vue:130`) | "File Sort By" | enum modified/created/title | **modified → created** (`schema.json:47` vs `store/preferences.js:38`) | **NOT CONSUMED — dead**; TODO in code admits it (`PC/general/index.vue:124-131`) | — | drop | Shipped disabled + dead; default drift on top. |
| `restoreLayoutState` | General › Startup | radio "Restore previous editor state / Open blank state" | bool | true / true | **NOT CONSUMED — dead** (only `store/preferences.js:40`) | — | drop | Layout restore is not driven by this pref in the Tauri port. |
| `startUpAction` | General › Startup | radio "Restore opened folder / Open default directory / Open blank page" | enum folder/openLastFolder/blank | openLastFolder / openLastFolder | **NOT CONSUMED — dead** (only `store/preferences.js:39`); boot restores `workspaceRoot` instead (`rs:main.rs:294-297`, `rs:m005_prefs.rs:333-345`) | — | drop | Misleading: whatever you pick, boot always restores the last workspace. |
| `defaultDirectoryToOpen` | General › Startup | (folder picker button) | string path | — / '' | **NOT CONSUMED — dead** (only written by picker `store/preferences.js:269-275`) | — | drop | Companion of dead `startUpAction`. |
| `lastOpenedFolder` | — (schema only) | — | string | — (no default) | **NOT CONSUMED — dead** (only `store/preferences.js:42`; boot uses `workspaceRoot`, `rs:main.rs:297`) | — | drop | Schema cleanup; superseded by `workspaceRoot` (`rs:m005_prefs.rs:34`). |
| `previewModeOnFinderOpen` | — (store-only, no UI) | — | bool | — / true (`store/preferences.js:131`) | `bootstrap-ipc.js:291`; `store/editor.js:1838` | General | expose | Real, working, user-relevant behaviour (Finder-opened files enter read-only preview) — deserves a switch. |

### 2.2 Editor section today

| Key | Section | Current EN label | Type / options | Default (schema → store) | Consumed where | New section | Action | Reason |
|---|---|---|---|---|---|---|---|---|
| `fontSize` | Editor › Text Editor | "Font size" | range 12–32 px | 16 / 16 | muya options `components/editorWithTabs/editor.vue:1869`; ctrl± keys `pages/app.vue:231-237` | Appearance | move | Prose typography groups with Appearance (per R-2 "fonts, size"). |
| `lineHeight` | Editor › Text Editor | "Line height" | range 1.2–2.0 | 1.6 / 1.6 | `editor.vue:1870` | Appearance | move | Same group as text size. |
| `editorFontFamily` | Editor › Text Editor | "Font family" | font autocomplete | "Open Sans" / same | `editor.vue:11-12` | Appearance | move | Same. |
| `editorLineWidth` | Editor › Text Editor | "Max width" | text, regex `^[0-9]+(ch\|px\|%)?$` | **"" / ""** → renders as an empty field (`PC/editor/index.vue:31-37`, no placeholder, unlike `PC/image/components/folderSetting/index.vue:8-9`) | `editor.vue:571-575` → `util/theme.js:174-180` | Appearance | move | Working; fix default presentation (placeholder "Unlimited", unit hint). |
| `codeFontSize` | Editor › Code Block | "Font size" | range 12–28 px | 14 / 14 — schema description still says "range is 12 ~ 18" (`schema.json:100`) | `editor.vue:631-639` → `util/theme.js:200`; boot `pages/app.vue:280,284` | Editor | keep | Code-specific; stays with code blocks. Note the unit-duplication chain (§5 bug 2). |
| `codeFontFamily` | Editor › Code Block | "Font family" | font autocomplete (mono) | "DejaVu Sans Mono" / same | `editor.vue:647-655` → `util/theme.js:199` | Editor | keep | Same. |
| `codeBlockLineNumbers` | Editor › Code Block (**hidden** `v-show="false"`, `PC/editor/index.vue:61-67`, FIXME #1648) | "Show line numbers" | bool | true / true | `editor.vue:1871`, watcher `editor.vue:641-645` | Editor | keep (unhide) | Consumed by muya but unreachable in UI — either unhide or drop; recommend unhide when #1648 clears. |
| `trimUnnecessaryCodeBlockEmptyLines` | Editor › Code Block | "Remove empty lines" | bool | true / true | `editor.vue:1864,601-605` | Editor | keep | Working; re-label plainly. |
| `autoPairBracket` | Editor › Writing Behavior | "Auto close brackets" | bool | true / true | `editor.vue:1862,583-587` | Editor | keep | Working; group renamed "Typing". |
| `autoPairMarkdownSyntax` | Editor › Writing Behavior | "Auto complete markdown" | bool | true / true | `editor.vue:1863,589-593` | Editor | keep | Working; label is jargon — rewrite (§3). |
| `autoPairQuote` | Editor › Writing Behavior | "Auto close quotes" | bool | true / true | `editor.vue:1865,595-599` | Editor | keep | Working. |
| `tabSize` | Editor › File Representation | "Tab width" | select 1–4 | 4 / 4 | `editor.vue:1868` | Editor | keep | Schema calls it Markdown (`schema.json:239-243`) — UI shows it under Editor; new IA keeps it in Editor › Tabs & indentation per R-2. |
| `endOfLine` | Editor › File Representation | "Line separator" | enum default/lf/crlf | default / default | `rs:m_v1_compat.rs:101-104,118`; blank files `store/editor.js:1236-1237`; menu writes `store/editor.js:857` | General | move | File-on-disk semantics → "Files & saving", not typing. |
| `defaultEncoding` | Editor › File Representation | "Default encoding" | select (~38 encodings) | utf8 / utf8 | `store/editor.js:1236-1237`; `store/help.js:88,111` | General | move | Same — file semantics. |
| `autoGuessEncoding` | Editor › File Representation | "Auto detect encoding" | bool | true / true | **NOT CONSUMED — dead**: `rs:m014_encoding.rs:3,15,51` always does BOM + chardet best-guess regardless | — | drop | Toggle lies: detection is always on in the Rust reader. |
| `autoNormalizeLineEndings` | Editor › File Representation | "Auto-normalize line endings to LF on open" | bool | false / false | **NOT CONSUMED — dead** (only `store/preferences.js:62`) | — | drop | No reader normalizes by this flag. |
| `trimTrailingNewline` | Editor › File Representation | "Trailing Newlines" | select 0–3 | 2 / 2 | **Preference NOT consumed**: new files hardcode `3` (`store/help.js:30`), menu command writes per-file state only (`store/editor.js:1585-1587`) | — | drop (settings row) | The per-file menu item stays; the global setting never applied. |
| `textDirection` | Editor › Misc | "Text Direction" | enum ltr/rtl | ltr / ltr | `editor.vue:15` (`:dir`); `components/editorWithTabs/index.vue:16` | Editor | keep | Working. |
| `hideQuickInsertHint` | Editor › Misc | "Hide quick insert hint" | bool | false / false | `editor.vue:1880,565-569` | Editor | keep | Working; phrase positively with help text. |
| `hideLinkPopup` | Editor › Misc | "Hide link popup" | bool | false / false | `editor.vue:1881,619-623` | Editor | keep | Working. |
| `autoCheck` | Editor › Misc | "Auto check" | bool | false / false | `editor.vue:1882,625-629` (muya `autoCheck`) | Editor | keep | Working but the label explains nothing (schema: "automatically check related task", `schema.json:209-213`). |
| `wrapCodeBlocks` | Editor › Misc | "Wrap code blocks" | bool | true / true | `editor.vue:577-581` → `util/theme.js:167-172` | Editor | keep | Working; belongs with Code blocks group. |

### 2.3 Markdown section today

| Key | Section | Current EN label | Type / options | Default (schema → store) | Consumed where | New section | Action | Reason |
|---|---|---|---|---|---|---|---|---|
| `preferLooseListItem` | Markdown › Lists | "Prefer loose list items" | bool | true / true | `editor.vue:1861` | Markdown | keep | Working; "loose" is CommonMark jargon — rewrite with spaced/compact wording. |
| `bulletListMarker` | Markdown › Lists | "Bullet list marker" | select `*` `-` `+` | "-" / "-" | `editor.vue:1866,607-611` | Markdown | keep | Working. |
| `orderListDelimiter` | Markdown › Lists | "Ordered list delimiter" | select `.` `)` | "." / "." | `editor.vue:1867,613-617` | Markdown | keep | Working. |
| `listIndentation` | Markdown › Lists | "List Indentation" | select dfm/tab/1–4 | 1 / 1 | `editor.vue:1872` | Markdown | keep | Working; "DFM Style" option label is jargon (`en.json:850`). |
| `frontmatterType` | Markdown › Extensions | "Frontmatter Type" | select YAML/TOML/JSON… | "-" / "-" | `editor.vue:1873` | Markdown | keep | Working. |
| `frontmatterProperties` | Markdown › Extensions | "Show YAML front matter as a properties table…" | bool | — (store-only, `store/preferences.js:80`) | `editor.vue:1874` | Markdown | keep | Working but absent from schema → invisible to settings search (`PC/sideBar/config.js:78`). Add to schema. |
| `superSubScript` | Markdown › Extensions | "Super/Sub script" | bool | false / false | `editor.vue:1875` | Markdown | keep | Working; label fine, add help (Pandoc `^x^`/`~x~`). |
| `footnote` | Markdown › Extensions | "Footnote" | bool | **false → true** (`schema.json:259-263` vs `store/preferences.js:82`) | `editor.vue:1876` | Markdown | keep | Working; schema default is stale. |
| `mathEnabled` | Markdown › Extensions | "Math rendering ($…$)" | bool | — (store-only, `store/preferences.js:83`) | `editor.vue:1877` (muya `math`) | Markdown | keep | Working; missing from schema (search gap) **and** missing RU label (`en.json:796`, absent in `ru.json`). |
| `isHtmlEnabled` | Markdown › Compatibility | "Enable HTML support" | bool | true / true | `editor.vue:1878` (`disableHtml: !value`) | Markdown | keep | Working. |
| `isGitlabCompatibilityEnabled` | Markdown › Compatibility | "Enable GitLab compatibility" | bool | false / false | `editor.vue:1879` | Markdown | keep | Working. |
| `sequenceTheme` | Markdown › Diagrams | "Sequence Theme" | select hand/simple | hand / hand | `editor.vue:1883` | Markdown | keep | Working; only sequence diagrams are configurable — merge group into Extensions/Diagrams. |
| `preferHeadingStyle` | Markdown › Misc (**disabled**, `PC/markdown/index.vue:118`) | "Prefer Heading Style" | select atx/setext | atx / atx | **NOT CONSUMED — dead** (only UI + `store/preferences.js:76`) | — | drop | Never passed to muya; shipped disabled. |

### 2.4 Theme section today

| Key | Section | Current EN label | Type / options | Default (schema → store) | Consumed where | New section | Action | Reason |
|---|---|---|---|---|---|---|---|---|
| `theme` | Theme | theme cards (lorem-markdown previews) | string (theme id) | light / light | `pages/app.vue:123,255`; `editor.vue:1893-1903` (mermaid/vega dark) | Appearance | move | The only real control here; becomes compact swatches (R-3). |
| `followSystemTheme` | Theme (**hidden** `v-if="false"`, `PC/theme/index.vue:33-38`) | "Follow System Theme" | bool | false / false | **NOT CONSUMED — dead**: backend force-overrides to false every boot (`rs:m005_prefs.rs:374-395`); no `prefers-color-scheme` listener exists | Appearance | defer | Returns as the Auto segment of the light/dark segmented control when F-THEME-FOLLOW-SYSTEM lands (spec R-3). |
| `lightModeTheme` | Theme (**hidden**, `PC/theme/index.vue:40-58`) | "Light mode theme" | select | light / light | **NOT CONSUMED — dead** (hidden UI; comment `PC/theme/index.vue:27-32`) | Appearance | defer | Pairs with follow-system. |
| `darkModeTheme` | Theme (**hidden**) | "Dark mode theme" | select | dark / dark | **NOT CONSUMED — dead** | Appearance | defer | Same. |
| `customCss` | Theme | "Custom CSS" | textarea | "" / "" | `pages/app.vue:131-132` → `util/theme.js:207-211` | Advanced | move | Power-user feature → Advanced. |

### 2.5 Spelling section today

| Key | Section | Current EN label | Type / options | Default (schema → store) | Consumed where | New section | Action | Reason |
|---|---|---|---|---|---|---|---|---|
| `spellcheckerEnabled` | Spelling | "Enable spell checking" | bool | false / false | `editor.vue:1884,667-679,1922` | Editor | move | Real writing option; folds into Editor › Spelling. |
| `spellcheckerNoUnderline` | Spelling | "Hide marks for spelling errors" | bool | false / false | `editor.vue:681-686` (sets muya `spellcheckEnabled: !value`) | Editor | move | Working; propose positive label "Underline misspelled words" with an inverted control (key semantics unchanged). |
| `spellcheckerLanguage` | Spelling (hidden on macOS, `PC/spellchecker/index.vue:26`) | "Default language" | select (dictionaries) | en-US / en-US | `editor.vue:1922,688-692`; `PC/spellchecker/index.vue:133-140` (`mt_spell_set_lang`) | Editor | move | Working. The macOS "Auto detect language" row is a hardcoded `:bool="true" :disable="true"` fake switch (`PC/spellchecker/index.vue:19-24`) — replace with plain help text. |

### 2.6 Image section today

| Key | Section | Current EN label | Type / options | Default (schema → store) | Consumed where | New section | Action | Reason |
|---|---|---|---|---|---|---|---|---|
| `imageInsertAction` | Image | "Default action when insert image" | select upload/folder/path | **path → folder** (`schema.json:325-329` vs `store/preferences.js:67`) | `editor.vue:787-814` | Advanced | move | Working; heaviest, most technical group → Advanced › Images (R-2). |
| `imageFolderPath` | Image › Folder Setting | "Global image folder" | text (path) | — (user-data, `store/preferences.js:141`) | `editor.vue:765` → `util/fileSystem.js:150-151` | Advanced | move | Working (user-data key, not in schema). |
| `imagePreferRelativeDirectory` | Image › Folder Setting | "Prefer relative directory" | bool | **false → true** (`schema.json:330-334` vs `store/preferences.js:68`) | `editor.vue:767` | Advanced | move | Working; schema default stale. |
| `imageRelativeDirectoryName` | Image › Folder Setting | "Relative folder name" | text | assets / assets | `editor.vue:741,766` | Advanced | move | Working (supports `${filename}`). |
| `currentUploader` | Image › Uploader | "Current Uploader: {name}" | select (services) | — (user-data) | `util/fileSystem.js:257,267,332-362` | Advanced | move | Working (user-data). GitHub option shows a deprecation warning (`PC/image/components/uploader/index.vue:123-124`). |
| `imageBed` | Image › Uploader | (GitHub owner/repo/branch form) | object | — (user-data) | `util/fileSystem.js:257-258` | Advanced | move | Working (user-data). |
| `githubToken` | Image › Uploader | "GitHub Token" | text (secret) | — (user-data) | `util/fileSystem.js:257` | Advanced | move | Working (user-data); uploader deprecated. |
| `cliScript` | Image › Uploader | "Script Location" | text (path) | — (user-data) | `util/fileSystem.js:308,361-362` | Advanced | move | Working (user-data). |

### 2.7 Language section today

| Key | Section | Current EN label | Type / options | Default (schema → store) | Consumed where | New section | Action | Reason |
|---|---|---|---|---|---|---|---|---|
| `language` | Language | "Application UI language" | select (10 locales) | en / en | `store/preferences.js:185-187,237-239` (`setLanguage`) | General | move | One-setting section folds into General › Language. |

### 2.8 Schema keys with no UI today (internal / search-indexed)

| Key | Section | Current EN label | Type / options | Default (schema → store) | Consumed where | New section | Action | Reason |
|---|---|---|---|---|---|---|---|---|
| `sideBarVisibility` | — (`--internal`) | — | bool | false / false | `rs:m_v1_compat.rs:89-92,113,119`; written `store/layout.js:46-49,57-60` | — | internal | Driven by the sidebar toggle; keep out of Settings. |
| `tabBarVisibility` | — (`--internal`) | — | bool | false / false | `rs:m_v1_compat.rs:93-96,120` | — | internal | Same. |
| `sourceCodeModeEnabled` | — (`--internal`) | — | bool | false / false | `rs:m_v1_compat.rs:97-100,121` | — | internal | View-menu driven. |
| `autoSnapWindowWidth` | — | — | bool | true / **absent from store state** (`store/preferences.js:27-157`) | **NOT CONSUMED — dead**: window auto-resize is a logging stub (`store/layout.js:13-29`, comment lines 18-22) | — | drop | Schema-only; no store key, no reader. |
| `searchExclusions` | — (`--internal`) | — | array of glob | [] / [] | `store/search.js:97` | — | internal | Consumed by project search; set programmatically. |
| `searchMaxFileSize` | — (`--internal`) | — | string (K/M/G) | "" / "" | `store/search.js:98` | — | internal | Same. |
| `searchIncludeHidden` | — (`--internal`) | — | bool | false / false | `store/search.js:99` | — | internal | Same. |
| `searchNoIgnore` | — (`--internal`) | — | bool | false / false | `store/search.js:100` | — | internal | Same. |
| `searchFollowSymlinks` | — (`--internal`) | — | bool | true / true | `store/search.js:101` | — | internal | Same. |
| `watcherUsePolling` | — (`--internal`) | — | bool | false / false | **NOT CONSUMED — dead** (only `store/preferences.js:124`; v1 watcher concept) | — | drop | No file watcher reads it in the port. |

### 2.9 Store-only behavior keys (no schema, no Settings UI)

| Key | Type / default | Consumed where | New section | Action | Reason |
|---|---|---|---|---|---|
| `liveReload` | bool, true (`store/preferences.js:29`) | `store/editor.js:1629-1635` | — | internal | Works; toggled by command/menu, keep out of Settings. |
| `markdownLint` | bool, true (`store/preferences.js:31`) | `components/problems/index.vue:63`; toggle command `commands/index.js:812-813` | — | internal | Problems-panel gate; command-palette toggled. |
| `diffMode` | bool, false (`store/preferences.js:113`) | `bootstrap-ipc.js:279-308` (per-tab diff gating) | — | internal | Read from prefs broadcast at open time. |
| `splitViewRatio` | number 0.5 (`store/preferences.js:115`) | split-view component (consumer not re-verified in this audit — **unverified**) | — | internal | C-29 session state. |
| `splitViewSwapped` | bool false (`store/preferences.js:116`) | split-view component (**unverified**) | — | internal | Same. |
| `typewriter` / `focus` / `sourceCode` | view modes, explicitly "not part of persistent settings" (`store/preferences.js:135-138`) | `editor.vue:1859` etc. | — | internal | Not preferences; excluded from counts. |
| `workspaceRoot` + `mt_migration` | backend namespaces (`rs:m005_prefs.rs:34,42`) | `rs:main.rs:294-297`; `rs:m005_prefs.rs:168-208` | — | internal | Backend bookkeeping, never user-facing. |

---

## 3. New information architecture (5 sections)

Every visible setting, ordered, grouped. Labels: sentence case, no trailing colons, writer-friendly; help text only where the label alone is not enough. RU labels included. Control types follow R-3 (switches, pop-ups, steppers, right-aligned values).

### 3.1 General

**Startup**

| Setting | EN label | RU label | Control / help |
|---|---|---|---|
| `previewModeOnFinderOpen` (newly exposed) | Open documents from Finder in reading view | Открывать файлы из Finder в режиме чтения | Switch. Help: "Files opened by double-clicking in Finder or via the Dock start read-only; click to edit." |

**Language**

| Setting | EN label | RU label | Control / help |
|---|---|---|---|
| `language` | App language | Язык интерфейса | Pop-up with the 10 locales. |

**Files and saving**

| Setting | EN label | RU label | Control / help |
|---|---|---|---|
| `autoSave` | Save changes automatically | Автосохранение | Switch. Help: "Saves the current file shortly after you stop typing." |
| `autoSaveDelay` | Save after a pause of | Интервал автосохранения | Stepper, seconds (1–10 s, step 0.1; stored value stays ms). Help: "How long to wait after the last keystroke before saving." |
| `defaultEncoding` | File encoding for new files | Кодировка новых файлов | Pop-up. Help: "Files that state their own encoding always open correctly regardless of this setting." |
| `endOfLine` | Line endings | Концы строк | Pop-up: "Match my operating system", "LF (Unix, macOS)", "CRLF (Windows)". Help: "Used for new files and when saving." |

**Updates**

| Item | EN label | RU label | Control / help |
|---|---|---|---|
| (action, no key) | Check for updates | Проверить обновления | Button; opens the updater flow. (Updater prefs live in the About area today; grouping per R-2.) |

### 3.2 Appearance

**Theme**

| Setting | EN label | RU label | Control / help |
|---|---|---|---|
| `theme` | Theme | Тема | Compact light/dark swatch pairs (R-3), replacing the Lorem cards. |
| `followSystemTheme` + `lightModeTheme` + `darkModeTheme` (deferred) | Use my computer's appearance | Как в системе | Segmented control Light / Dark / Auto. Ships when F-THEME-FOLLOW-SYSTEM lands; keys unchanged. |

**Text** (prose typography)

| Setting | EN label | RU label | Control / help |
|---|---|---|---|
| `editorFontFamily` | Text font | Шрифт текста | Font pop-up with system fonts. |
| `fontSize` | Text size | Размер текста | Stepper, px (12–32). |
| `lineHeight` | Line spacing | Межстрочный интервал | Stepper (1.2–2.0). |
| `editorLineWidth` | Writing area width | Ширина области набора | Text field. Placeholder "Unlimited". Help: "Leave empty for full width, or enter a number with px, % or ch — for example 720px." |

**Window and panels**

| Setting | EN label | RU label | Control / help |
|---|---|---|---|
| `zoom` | Zoom | Масштаб | Pop-up 50–200 %. |
| `hideScrollbar` | Hide scroll bars | Скрывать полосы прокрутки | Switch. |
| `wordWrapInToc` | Wrap long headings in the outline | Переносить длинные заголовки в оглавлении | Switch. |
| `titleBarStyle` (Windows/Linux only; hidden on macOS) | Window title bar | Заголовок окна | Pop-up: Custom / System. Help: "Custom draws Mark's own title bar with tabs. Requires a restart." |

### 3.3 Editor

**Typing**

| Setting | EN label | RU label | Control / help |
|---|---|---|---|
| `autoPairBracket` | Close brackets automatically | Автозакрытие скобок | Switch. |
| `autoPairQuote` | Close quotes automatically | Автозакрытие кавычек | Switch. |
| `autoPairMarkdownSyntax` | Close markdown markers | Автозакрытие markdown-маркеров | Switch. Help: "Typing ** or __ inserts the closing marker for you." |
| `autoCheck` | Check off tasks with a click | Отмечать задачи щелчком | Switch. Help: "Lets you toggle task-list checkboxes in the document." (wording to confirm — see §6) |
| `hideQuickInsertHint` | Hide the insert hint on empty lines | Скрывать подсказку вставки на пустых строках | Switch. Help: "The small '+' hint shown when starting a new paragraph." |
| `hideLinkPopup` | Hide the link preview | Скрывать предпросмотр ссылок | Switch. Help: "The tooltip shown when the cursor is on a link." |
| `textDirection` | Text direction | Направление текста | Pop-up: Left to right / Right to left. |

**Tabs and indentation**

| Setting | EN label | RU label | Control / help |
|---|---|---|---|
| `tabSize` | Spaces inserted by Tab | Пробелов при нажатии Tab | Stepper 1–4. Help: "Tab inserts spaces instead of a tab character." |

**Spelling**

| Setting | EN label | RU label | Control / help |
|---|---|---|---|
| `spellcheckerEnabled` | Check spelling | Проверять орфографию | Switch. |
| `spellcheckerNoUnderline` | Underline misspelled words | Подчёркивать ошибки | Switch (inverted control; key semantics unchanged). |
| `spellcheckerLanguage` | Spelling language | Язык проверки орфографии | Pop-up (non-macOS). Help (macOS): "On macOS the system detects the document language automatically." Custom-dictionary list stays below. |

**Code blocks**

| Setting | EN label | RU label | Control / help |
|---|---|---|---|
| `codeFontFamily` | Code font | Шрифт кода | Mono font pop-up. |
| `codeFontSize` | Code text size | Размер кода | Stepper, px (12–28). |
| `codeBlockLineNumbers` | Show line numbers | Показывать номера строк | Switch (unhidden once muya #1648 clears). |
| `wrapCodeBlocks` | Wrap long lines in code blocks | Переносить длинные строки в коде | Switch. |
| `trimUnnecessaryCodeBlockEmptyLines` | Trim blank lines around code | Удалять пустые строки вокруг кода | Switch. Help: "Removes empty lines at the very top and bottom of a code block." |

### 3.4 Markdown

**Lists**

| Setting | EN label | RU label | Control / help |
|---|---|---|---|
| `preferLooseListItem` | Spacing between list items | Интервал между элементами списка | Segmented: Compact / Spaced. Help: "Spaced puts a blank line between items, which some renderers require." |
| `bulletListMarker` | Bullet character | Маркер списка | Pop-up: `-` `*` `+`. |
| `orderListDelimiter` | Numbered list format | Формат нумерованного списка | Pop-up: "1. item" / "1) item". |
| `listIndentation` | List indentation | Отступ в списках | Pop-up: "Align with text", "Use a tab", "1–4 spaces". Help: "How nested list lines are indented when written to the file." |

**Extensions**

| Setting | EN label | RU label | Control / help |
|---|---|---|---|
| `footnote` | Footnotes | Сноски | Switch. Help: "Enables [^1] footnote syntax (Pandoc extension)." |
| `mathEnabled` | Math formulas | Формулы | Switch. Help: "Renders $…$ and $$…$$ with KaTeX." (RU label currently missing — see §5 bug 11.) |
| `superSubScript` | Superscript and subscript | Верхний и нижний индексы | Switch. Help: "Enables ^text^ and ~text~ (Pandoc extension)." |
| `frontmatterType` | Front matter format | Формат front matter | Pop-up: YAML / TOML / JSON (;) / JSON ({}). Help: "The delimiter for the metadata block at the top of a document." |
| `frontmatterProperties` | Show front matter as a properties table | Показывать front matter таблицей свойств | Switch. Help: "Click the table to edit the raw YAML." |

**Compatibility**

| Setting | EN label | RU label | Control / help |
|---|---|---|---|
| `isHtmlEnabled` | Allow HTML inside documents | Разрешать HTML в документах | Switch. Help: "Off shows raw HTML tags as text." |
| `isGitlabCompatibilityEnabled` | GitLab-flavored Markdown | Markdown в стиле GitLab | Switch. Help: "Enables GitLab extras such as its diagram and reference syntax." |
| `sequenceTheme` | Sequence diagram style | Стиль диаграмм последовательности | Pop-up: Hand-drawn / Simple. |

### 3.5 Advanced

**Images and uploads**

| Setting | EN label | RU label | Control / help |
|---|---|---|---|
| `imageInsertAction` | When I add an image | При добавлении изображения | Pop-up: "Copy it into a folder" / "Keep its original location" / "Upload to the cloud". |
| `imageFolderPath` | Image folder | Папка для изображений | Path field + Choose/Open buttons. Help: "Where pasted and dropped images are stored when not kept next to the document." |
| `imagePreferRelativeDirectory` | Save images next to the document | Сохранять изображения рядом с документом | Switch. Help: "Uses the folder below inside the document's folder and writes relative links." |
| `imageRelativeDirectoryName` | Image folder name | Имя папки для изображений | Text field. Help: "`${filename}` inserts the document's name." |
| `currentUploader` + `imageBed` + `githubToken` + `cliScript` | Upload images to | Загружать изображения на | Pop-up (none / PicGo / CLI script / GitHub-deprecated) + per-service forms, unchanged behaviour. |

**Keyboard shortcuts** — the whole Keybindings page moves here unchanged (`PC/keybindings/index.vue`).

**Extensions** — the gallery page moves here (`src/renderer/src/components/extensionGallery`, route today `router/index.js:78-82`).

**Custom styling**

| Setting | EN label | RU label | Control / help |
|---|---|---|---|
| `customCss` | Custom CSS | Пользовательский CSS | Textarea. Help: "Applies on top of the selected theme." |

**Reset** — one destructive action row: "Restore all defaults" / «Восстановить настройки по умолчанию» with a confirmation (per R-2 "reset" item; needs a new confirmation dialog, no key changes).

---

## 4. Key migrations

No key is renamed, so **no storage migration is required for kept keys** (C-38 constraint "Every preference keeps its key", `spec.xml:46`). What happens to stored values:

1. **Dropped keys (14):** `startUpAction`, `restoreLayoutState`, `defaultDirectoryToOpen`, `openFilesInNewWindow`, `openFolderInNewWindow`, `fileSortBy`, `lastOpenedFolder`, `treePathExcludePatterns`, `autoGuessEncoding`, `autoNormalizeLineEndings`, `trimTrailingNewline`, `preferHeadingStyle`, `autoSnapWindowWidth`, `watcherUsePolling`. Rule: leave the stored value untouched in `preferences.json` (the backend is a loose KV store and ignores unknown keys, `rs:m005_prefs.rs:54-60`); remove the keys from `schema.json` so they vanish from the settings search index; renderer stops reading/writing them. No destructive cleanup — a future re-implementation can still read the old value.
2. **Deferred keys (3):** `followSystemTheme`, `lightModeTheme`, `darkModeTheme` stay in schema and storage, UI returns with F-THEME-FOLLOW-SYSTEM as the Auto segment (`PC/theme/index.vue:26-32`, `rs:m005_prefs.rs:366-373`). The boot-time force-override to `false` stays until then.
3. **Section moves (25 settings):** UI-only; sections are not part of any key, nothing to migrate.
4. **Newly exposed (1):** `previewModeOnFinderOpen` already exists and persists (`store/preferences.js:126-131`); only a switch is added.
5. **Schema hygiene:** add `mathEnabled`, `frontmatterProperties`, `treePathExcludePatterns`-successor (if the tree filter is ever implemented) to `schema.json` when they get UI, so search covers them; fix the 4 stale defaults (`fileSortBy` — dropped anyway; `imageInsertAction` → `folder`; `imagePreferRelativeDirectory` → `true`; `footnote` → `true`) to match `store/preferences.js`.
6. **`autoSaveDelay` unit:** if the UI shows seconds (§3.1), the stored value stays milliseconds; only presentation converts.

---

## 5. Bugs found while auditing

1. **Trailing colons are hard-coded in every control**, so the C-38 "no colons" rule cannot be met by locale changes alone: `PC/common/bool/index.vue:4`, `PC/common/range/index.vue:7`, `PC/common/select/index.vue:4`, `PC/common/textBox/index.vue:4`, `PC/common/fontTextBox/index.vue:4` all render `{{ description }}:`.
2. **Unit duplication ("14px px" family):** `config.js:12` stores the default `codeFontSize` as the string `'14px'`, while `util/theme.js:200` unconditionally appends `px` (`font-size: ${codeFontSize}px;`) → `14pxpx` whenever that string value flows in; the Settings slider also prints the unit twice-ish — value span `{{ selectValue }} {{ unit }}` plus tooltip `value + unit` (`PC/common/range/index.vue:9-11,25`). Fix: store numbers only, render the unit once. (Exact on-screen repro of the spec's "14px px" not re-verified in a live app — no app run in this audit.)
3. **Empty "Max width" field:** `editorLineWidth` default is `""` (`schema.json:93-98`, `store/preferences.js:54`) and the text box gets no placeholder or unit hint (`PC/editor/index.vue:31-37`), unlike the image-folder box which does (`PC/image/components/folderSetting/index.vue:8-9`).
4. **Schema ↔ store default drift (4 keys):** `fileSortBy` modified↔created (`schema.json:47` / `store/preferences.js:38`), `imageInsertAction` path↔folder (`schema.json:328` / `store/preferences.js:67`), `imagePreferRelativeDirectory` false↔true (`schema.json:333` / `store/preferences.js:68`), `footnote` false↔true (`schema.json:262` / `store/preferences.js:82`). The schema also still says `codeFontSize` "range is 12 ~ 18" while the UI allows 12–28 (`schema.json:100` vs `PC/editor/index.vue:48-49`).
5. **Dead controls presented as live:** the entire Startup group (`PC/general/index.vue:135-178`), open-in-new-window toggles (`PC/general/index.vue:81-95`), exclude-patterns box (`PC/general/index.vue:116-122`) — none consumed; `autoGuessEncoding`/`autoNormalizeLineEndings` (`PC/editor/index.vue:122-131`) — the Rust reader always guesses (`rs:m014_encoding.rs:51`); `trimTrailingNewline` preference — new files hardcode `3` (`store/help.js:30`), the menu writes per-file state (`store/editor.js:1585-1587`).
6. **Disabled controls shipped:** `fileSortBy` (`PC/general/index.vue:130`, TODO comment at :124), `preferHeadingStyle` (`PC/markdown/index.vue:118`).
7. **Working control hidden:** `codeBlockLineNumbers` `v-show="false"` with FIXME #1648 (`PC/editor/index.vue:61-67`) though muya consumes it (`components/editorWithTabs/editor.vue:1871,641-645`).
8. **Fake switch on macOS:** "Auto detect language" is `:bool="true" :disable="true"` (`PC/spellchecker/index.vue:19-24`); the real language select is `v-show="!isOsx"` (line 26).
9. **Follow-system theme trio hidden and force-reset:** UI `v-if="false"` (`PC/theme/index.vue:33-59`); backend overrides any persisted `true` to `false` on every boot (`rs:m005_prefs.rs:374-395`).
10. **`titleBarStyle` OS gating inconsistent:** shown only on Linux (`PC/general/index.vue:74` `v-if="isLinux"`) though the schema says "Windows and Linux system only" (`schema.json:14`); Windows hardcodes `'custom'` (`components/titleBar/index.vue:380`).
11. **Missing RU translation:** `preferences.markdown.extensions.mathRendering` exists in `en.json:796` but not in `ru.json` (whole extensions block `ru.json:788-808`), so RU UI falls back to English (`fallbackLocale: 'en'`, `src/renderer/src/i18n/index.js:11`).
12. **Dead/duplicated locale blocks:** `markdown.listItem.*` (`en.json:769-783`) vs the actually used `markdown.lists.*` (`en.json:846-860`; UI keys at `PC/markdown/index.vue:10-35`); unused `markdown.frontmatter.*`, `markdown.heading.*`, `image.imageInsertAction.*` (`en.json:655-662`, UI uses `image.actions.*`, `PC/image/config.js:3-12`); RU has the same duplicates (`ru.json:765-779, 651-658`).
13. **Settings-search gaps:** the search index is generated from `schema.json` only (`PC/sideBar/config.js:14,78`), so `mathEnabled`, `frontmatterProperties`, `treePathExcludePatterns` are unfindable; the rail label "Extensions" is hardcoded English (`PC/sideBar/config.js:67`); `View`/`Searcher`/`Watcher`/`Custom CSS` search hits route to the General tab fallback (`PC/sideBar/config.js:104-115`).
14. **`autoSnapWindowWidth` is schema-only:** no store state (`store/preferences.js:27-157` has no such key), and the auto-resize it promises is a logging stub (`store/layout.js:13-29`, esp. 18-22).
15. **Boot URL params can null-stomp style defaults (unverified impact):** `bootstrap.js:14-42` puts `null` into `initialState.codeFontSize`/`codeFontFamily`/`titleBarStyle` when URL params are absent (the Tauri shim only injects `udp/wid/type/debug/theme`, `install-window-globals.js:44-91`), and `SET_USER_PREFERENCE` assigns `null` because it only checks `!== 'undefined'` (`store/preferences.js:178-183`) via `pages/app.vue:246`. `util/theme.js:200` would then render `font-size: nullpx`. Marked unverified: no live repro run; flagging because it feeds bug 2's code path.

---

## 6. Open questions for the product owner

1. Startup behaviour: boot currently always restores the last workspace (`rs:main.rs:294-297`). Drop the dead startup prefs permanently (recommended), or re-implement "open blank page / specific folder" for the Tauri port?
2. `codeBlockLineNumbers` is hidden behind muya issue #1648 (`PC/editor/index.vue:61`) — unhide in the redesign, or keep hidden until the muya fix?
3. GitHub image uploader shows a deprecation warning (`PC/image/components/uploader/index.vue:123-124`) — remove it from the new Advanced UI?
4. Confirm the intended user-visible behaviour of `autoCheck` (task-list toggling) so the label in §3.3 can be finalised — schema wording is opaque (`schema.json:209-213`).
5. Should `liveReload` / `markdownLint` (working, command-toggled) ever surface in Settings, or stay power-user internals?
6. With 5 fixed-width tabs (R-3), does the Keybindings table stay inline in Advanced or open as a sheet (it is the tallest page)?
