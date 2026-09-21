# Markdown Feature Matrix — Mark vs VS Code vs Antigravity

Research: 2026-09-21 (C-14/C-15 session). Sources listed at the bottom.
Legend: ✅ built-in · 🧩 via extension/ecosystem · ⚠️ partial · ❌ absent.
"Mark" column grounded in this repo's code (components/commands verified);
competitor columns from official docs + product pages, marked (inferred) where
not directly documented.

## Editing & structure

| Feature | VS Code | Antigravity | Mark | Gap note |
|---|---|---|---|---|
| WYSIWYG editing | ❌ (source+preview only) | ❌ | ✅ muya rich mode | **our lead** |
| Source mode | ✅ | ✅ | ✅ CodeMirror 5 | parity |
| Split view (edit + rendered side-by-side) | ✅ preview pane | ✅ (inferred) | ❌ either-mode toggle | **P1 differentiator** |
| Document outline / TOC panel | ✅ outline view | ✅ (inferred) | ✅ sidebar TOC | parity |
| Folding (sections) | ✅ | ✅ | ❌ | P2 |
| Header breadcrumbs | ✅ | ✅ | ⚠️ title-bar file breadcrumb only | P1: heading-jump breadcrumb |
| Go-to header / workspace symbol search | ✅ | ✅ | ❌ quick-open finds files, not headings | P1, small effort |
| Multi-cursor | ✅ | ✅ | ❌ (WYSIWYG n/a; CM5 single) | P2, source mode only |
| Snippets | ✅ | ✅ | ❌ | P2 |
| Task lists / tables / fenced code | ✅ | ✅ | ✅ + live table editing | parity |
| Math (KaTeX) | ✅ | ✅ | ✅ | parity |
| Mermaid | ✅ | ✅ (inferred, VS Code lineage) | ✅ | parity |
| Front matter editing | ⚠️ raw | ⚠️ raw | ✅ rendered block | parity+ |
| Spellcheck | ✅ | ✅ | ✅ local dicts | parity |

## Quality & formatting

| Feature | VS Code | Antigravity | Mark | Gap note |
|---|---|---|---|---|
| markdownlint live validation | 🧩 | 🧩 | ❌ | **P0 — "lint agent output" fits our story** |
| Format document (Prettier) | 🧩 | 🧩 | ❌ | **P0 — tidy messy agent-written md** |
| Table formatter | 🧩 | 🧩 | ⚠️ live cell editing, no re-format | P1 |
| Link validation (dead links) | ✅ (untrusted/missing link hints) | ✅ | ❌ | P1 |
| Relative path autocomplete | ✅ | ✅ | ❌ | P1, small |
| Smart paste (URL→link on selection) | ✅ | ✅ | ❌ | **P0, small (turndown already in deps for HTML→md)** |

## Media

| Feature | VS Code | Antigravity | Mark | Gap note |
|---|---|---|---|---|
| Insert image via dialog/URL | 🧩 | 🧩 | ✅ imageSelector UI | parity |
| Paste image from clipboard → file+link | 🧩 Paste Image | 🧩 | ❌ (unverified — v1 had it; needs re-check) | **P0 if absent, small** |
| Drag-drop image into doc | ✅ | ✅ | ❌ | P1 |

## Navigation & project

| Feature | VS Code | Antigravity | Mark | Gap note |
|---|---|---|---|---|
| File tree / project sidebar | ✅ | ✅ | ✅ + context ops | parity |
| Fuzzy quick-open files | ✅ | ✅ | ✅ | parity |
| Project-wide text search | ✅ | ✅ | ✅ ripgrep (in-process for MAS in C-15) | parity |
| Diff view vs git baseline | ✅ full | ✅ full | ⚠️ vs baseline only | P2: full history UI |
| Tabs / multi-doc | ✅ | ✅ | ✅ + tab cycling | parity |
| Word count | 🧩 | 🧩 | ✅ title bar | parity+ |

## Export & interoperability

| Feature | VS Code | Antigravity | Mark | Gap note |
|---|---|---|---|---|
| Copy as HTML / rich text | 🧩 | 🧩 | ✅ native menu | **our lead** |
| Export HTML | 🧩 | 🧩 | ✅ | parity |
| Export PDF | 🧩 Markdown PDF | 🧩 | ⚠️ via pandoc (absent in MAS build — C-15 T-M5 hides it) | **P1: native webview print-to-PDF** |
| Export DOCX | 🧩 pandoc | 🧩 | ✅ via pandoc | parity (non-MAS) |
| CLI open/watch | ✅ code CLI | ✅ | ✅ mark file.md --watch | **our lead (agent loop)** |

## Agent workflow (the Mark thesis)

| Capability | VS Code | Antigravity | Mark | Gap note |
|---|---|---|---|---|
| External edit live-reload w/ cursor kept | ❌ (manual reload) | ⚠️ agent edits show in editor | ✅ | **our lead** |
| Structured agent→editor stream (HTTP) | ❌ | ⚠️ internal agent artifacts | ✅ live-viewer endpoint (opt-in localhost) | **our lead** |
| Agent plan/task rendering (md artifacts) | ❌ | ✅ Implementation-Plan view | ❌ | opportunity: render agent plans beautifully, not parity chase |
| Inline AI completions in editor | 🧩 Copilot | ✅ native | ❌ | non-goal (local-first, no LLM in editor) |
| Resource footprint with many docs open | 1.5 GB RAM / 1.2 GB disk | 2.3 GB / 0.7 GB | **113 MB / 28 MB** (measured, benchmarks page) | **our lead** |

## Prioritized gap list (what to build next)

- **P0-A markdownlint-style validation** — red squiggles for broken md; killer
  pairing with "your agent writes markdown" (agents write sloppy md). Subset of
  rules (MD001/003/009/025/032/040-class) in the renderer; medium effort.
- **P0-B Format document** — canonicalize headings/lists/tables/spacing on
  demand; same story ("tidy agent output"); medium; reuses turndown/marked deps.
- **P0-C Clipboard image paste → relative file** — verify v1 behavior, restore
  if lost; small.
- **P0-D Smart paste** — URL on selection → `[text](url)`; HTML → markdown
  (turndown already bundled); small.
- **P1** split WYSIWYG/source view; heading-jump breadcrumbs + workspace
  heading search; native print-to-PDF (also unblocks MAS export); relative-path
  autocomplete; link validation.
- **P2** folding, multi-cursor in source, snippets, table re-formatter, file
  history UI.

## Sources

- [Markdown and Visual Studio Code — official docs](https://code.visualstudio.com)
- [Markdown Preview Mermaid Support extension](https://marketplace.visualstudio.com)
- [Introducing IDE Extensions — Google Antigravity Blog](https://antigravity.google)
- [Getting Started with Google Antigravity — codelab](https://codelabs.developers.google.com/getting-started-google-antigravity)
- [Antigravity .md default-editor thread — discuss.ai.google.dev](https://discuss.ai.google.dev)
- Mark benchmark figures: `tools/benchmark/editors-bench.sh` + site Benchmarks section.
