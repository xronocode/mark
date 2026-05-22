/**
 * showcase-screenshots.ts — Capture themed editor screenshots for README.
 *
 * Each frame features DIFFERENT content showcasing a distinct editor capability,
 * with the most visually interesting part at the TOP of the viewport.
 *
 * Usage:
 *   npx playwright test tests/e2e/showcase-screenshots.spec.ts
 */
import { test } from '@playwright/test'
import { installTauriShim } from './fixtures/tauri-shim'
import * as fs from 'fs'

// --- Frame content: each highlights a different feature at viewport top ---

const FRAMES = [
  {
    name: 'rich-markdown',
    theme: 'catppuccin-latte',
    md: `# Welcome to Mark

> A next-generation Markdown editor — fast, beautiful, extensible.

Write with **confidence** using *live preview*, \`inline code\`,
and [rich formatting](https://github.com/xronocode/mark) that stays
out of your way.

---

## Why Mark?

- **Instant rendering** — see your changes as you type
- **33 built-in themes** — from warm Catppuccin to neon Synthwave
- **Native performance** — built with Tauri 2 + Rust backend
- **Agent-friendly** — file watching, CLI integration, live reload
- **Rich diagrams** — Mermaid, Vega-Lite, Flowchart.js, PlantUML
- **Math typesetting** — full KaTeX support for $\\LaTeX$ equations
- **60+ languages** — syntax highlighting powered by CodeMirror 6

### Keyboard First

| Shortcut | Action |
|----------|--------|
| \`Cmd+B\` | **Bold** |
| \`Cmd+I\` | *Italic* |
| \`Cmd+K\` | [Link]() |
| \`Cmd+E\` | \`Code\` |
| \`Cmd+Shift+M\` | Math block |
`
  },
  {
    name: 'code-highlighting',
    theme: 'one-dark',
    md: `# Syntax Highlighting

Mark supports **60+ languages** with CodeMirror 6.

\`\`\`rust
use tauri::Manager;

#[tauri::command]
async fn read_file(path: &str) -> Result<String, String> {
    tokio::fs::read_to_string(path)
        .await
        .map_err(|e| format!("Failed to read {path}: {e}"))
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![read_file])
        .run(tauri::generate_context!())
        .expect("error running tauri application");
}
\`\`\`

\`\`\`python
import asyncio
from pathlib import Path

async def process_documents(folder: Path):
    """Batch-process markdown files with async I/O."""
    tasks = [
        parse_markdown(f)
        for f in folder.glob("**/*.md")
        if not f.name.startswith(".")
    ]
    results = await asyncio.gather(*tasks)
    return {r.path: r.metadata for r in results}
\`\`\`

\`\`\`typescript
interface EditorState {
  tabs: Map<string, TabInfo>;
  activeId: string | null;
  dirty: Set<string>;
}
\`\`\`
`
  },
  {
    name: 'mermaid-flowchart',
    theme: 'dracula',
    md: `# System Architecture

\`\`\`mermaid
graph TD
    classDef purple fill:#ab47bc,stroke:#6a1b9a,color:#fff
    classDef blue fill:#42a5f5,stroke:#1565c0,color:#fff
    classDef green fill:#66bb6a,stroke:#2e7d32,color:#fff
    classDef amber fill:#ffa726,stroke:#e65100,color:#000
    classDef red fill:#ef5350,stroke:#c62828,color:#fff
    classDef teal fill:#26a69a,stroke:#00695c,color:#fff

    A["Mark Editor"]:::purple

    B["Window Manager · Native Titlebar"]:::blue
    C["Theme Engine · 33 Themes"]:::blue

    D["Muya WYSIWYG · Live Preview"]:::green
    E["CodeMirror 6 · Source Mode"]:::green

    F["Mermaid Diagrams"]:::amber
    G["KaTeX Mathematics"]:::amber
    H["Vega-Lite Charts"]:::amber
    I["Code Highlight · 60+ Languages"]:::amber

    J["Rust Backend · Tauri 2"]:::red

    K["File System API"]:::teal
    L["File Watcher · Live Reload"]:::teal
    M["Window State Persistence"]:::teal

    A --> B & C
    B --> D & E
    D --> F & G & H & I
    D <==>|"Tauri IPC"| J
    J --> K & L & M
    L -.->|"change event"| D
    C -.->|"CSS vars"| D
\`\`\`

Mermaid diagrams render inline with **full theme integration** —
dark themes automatically apply dark diagram styles.

\`\`\`mermaid
pie title Editor Feature Usage
    "Markdown Editing" : 40
    "Code Blocks" : 25
    "Diagrams" : 15
    "Math Equations" : 12
    "Tables & Lists" : 8
\`\`\`
`
  },
  {
    name: 'math-katex',
    theme: 'tokyo-night',
    md: `# Mathematical Typesetting

Full $\\LaTeX$ support via KaTeX — render complex equations instantly.

$$
\\nabla \\times \\mathbf{E} = -\\frac{\\partial \\mathbf{B}}{\\partial t}
$$

$$
\\int_{-\\infty}^{\\infty} e^{-x^2} \\, dx = \\sqrt{\\pi}
$$

$$
i\\hbar \\frac{\\partial}{\\partial t} \\Psi(\\mathbf{r}, t) = \\hat{H} \\Psi(\\mathbf{r}, t)
$$

### Inline Math

The Euler identity $e^{i\\pi} + 1 = 0$ connects five fundamental constants.
The quadratic formula gives $x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$.

### Matrix Notation

$$
A = \\begin{pmatrix}
a_{11} & a_{12} & a_{13} \\\\
a_{21} & a_{22} & a_{23} \\\\
a_{31} & a_{32} & a_{33}
\\end{pmatrix}
$$
`
  },
  {
    name: 'data-tables',
    theme: 'rose-pine-dawn',
    md: `# Project Dashboard

| Module | Status | Tests | Coverage | Size |
|--------|--------|-------|----------|------|
| Core Editor | ✅ Stable | 142 | 94% | 48 KB |
| Theme Engine | ✅ Stable | 38 | 100% | 12 KB |
| File Watcher | ✅ Stable | 27 | 89% | 8 KB |
| Mermaid | ✅ Fixed | 15 | 78% | 6 KB |
| KaTeX Math | ✅ Stable | 21 | 85% | 4 KB |
| Export PDF | 🔧 Beta | 9 | 67% | 15 KB |
| Plugin API | 📋 Planned | — | — | — |
| Collab Edit | 📋 Planned | — | — | — |

---

### Release Timeline

| Version | Date | Highlights |
|---------|------|------------|
| v2.0-alpha.5 | May 2026 | Mermaid fix, file watching |
| v2.0-alpha.6 | Jun 2026 | Performance pass, splash |
| v2.0-beta.1 | Jul 2026 | Plugin system, export |
| v2.0 | Aug 2026 | Stable release |

> 358 unit tests · 7 E2E tests · 400+ Cargo tests
`
  },
  {
    name: 'mermaid-sequence',
    theme: 'nord',
    md: `# File Save Flow

\`\`\`mermaid
sequenceDiagram
    participant U as User
    participant E as Editor
    participant S as Store
    participant R as Rust Backend
    participant F as File System

    U->>E: Cmd+S
    E->>S: SAVE_FILE action
    S->>S: Check dirty state
    alt File is dirty
        S->>R: mt_save_file(path, content)
        R->>F: tokio::fs::write()
        F-->>R: Ok(())
        R-->>S: SaveResult::Success
        S->>E: Clear dirty flag
        E->>U: ✓ Saved indicator
    else File is clean
        S->>E: No-op (already saved)
    end
\`\`\`

Every user action flows through the **Pinia store** layer,
which communicates with the **Rust backend** via Tauri IPC.
`
  },
  {
    name: 'task-management',
    theme: 'gruvbox-light',
    md: `# Mark v2 — Roadmap

## ✅ Phase A — Core Port (Complete)

- [x] Tauri v2 + Vue 3 scaffold
- [x] Muya WYSIWYG editor integration
- [x] CodeMirror 6 source mode
- [x] File open / save / save-as
- [x] Tab management with dirty tracking
- [x] 33 theme engine with dark/light detection
- [x] Mermaid diagram rendering (WKWebView fix)
- [x] KaTeX math equations
- [x] Standalone file watching + live reload
- [x] Native macOS menu with accelerators

## 🔧 Phase B — Performance (In Progress)

- [x] Static HTML splash screen (< 100ms)
- [x] Parallel pending-opens drain
- [ ] Lazy diagram renderer loading (~2.5 MB saved)
- [ ] Element Plus tree-shaking (~600 KB saved)
- [ ] Deferred muya init for background tabs
- [ ] Window state persistence plugin
- [ ] Launch benchmark harness + CI gate

## 📋 Phase C — Polish (Planned)

- [ ] Plugin system architecture
- [ ] Export to PDF / HTML
- [ ] Collaborative editing via CRDT
- [ ] Quicklook / file preview extension
- [ ] Auto-update via Tauri updater
`
  },
  {
    name: 'mixed-showcase',
    theme: 'synthwave-84',
    md: `# Mark — Feature Overview

## Live Preview with Themes

Switch between **33 built-in themes** instantly.
From warm ☀️ *Catppuccin Latte* to neon 🌃 *Synthwave '84*.

## Diagrams & Visualizations

\`\`\`mermaid
pie title Editor Usage
    "Markdown" : 45
    "Code Blocks" : 25
    "Diagrams" : 15
    "Math" : 10
    "Tables" : 5
\`\`\`

## Code + Math Together

The time complexity of merge sort is $O(n \\log n)$:

\`\`\`javascript
function mergeSort(arr) {
  if (arr.length <= 1) return arr;
  const mid = Math.floor(arr.length / 2);
  const left = mergeSort(arr.slice(0, mid));
  const right = mergeSort(arr.slice(mid));
  return merge(left, right);
}
\`\`\`

| Feature | Mark | VS Code | Typora |
|---------|------|---------|--------|
| Native App | ✅ Tauri | ❌ Electron | ✅ Electron |
| Themes | 33 | 10+ | 6 |
| Diagrams | 5 types | ext. | 3 types |
| Math | ✅ KaTeX | ext. | ✅ |
| Bundle | ~2 MB* | 200+ MB | 80 MB |

*\\* Target after Phase B optimizations*
`
  },
]

function makePrefs(theme: string) {
  return {
    theme,
    autoSave: false,
    autoSaveDelay: 5000,
    titleBarStyle: 'custom',
    openFilesInNewWindow: false,
    openFolderInNewWindow: false,
    hideScrollbar: false,
    sideBarVisibility: false,
    tabBarVisibility: false,
    sourceCodeModeEnabled: false,
    searchExclusions: [],
    searchMaxFileSize: '',
    searchIncludeHidden: false,
    searchNoIgnore: false,
    searchFollowSymlinks: false,
    watcherUsePolling: false,
    spellcheckerEnabled: false,
    spellcheckerNoUnderline: false,
    spellcheckerLanguage: 'en-US',
    language: 'en',
    endOfLine: 'default',
    textDirection: 'ltr',
    codeFontSize: '14px',
    codeFontFamily: 'DejaVu Sans Mono',
    editorFontFamily: 'Open Sans',
    fontSize: 16,
    editorLineWidth: '',
    listIndentation: 1,
    frontmatterType: '-',
    followSystemTheme: false,
    lightModeTheme: 'light',
    darkModeTheme: 'dark',
    customCss: '',
    bulletListMarker: '-',
    orderListDelimiter: '.',
    preferLooseListItem: true,
    tabSize: 4,
    lineHeight: 1.6,
    fontWeight: 'normal',
    trimUnnecessaryCodeBlockEmptyLines: false,
    sequenceTheme: 'hand'
  }
}

test.describe('showcase screenshots', () => {
  test.setTimeout(120_000)

  for (let i = 0; i < FRAMES.length; i++) {
    const { name, theme, md } = FRAMES[i]

    test(`capture ${name} (${theme})`, async ({ page }) => {
      const prefs = makePrefs(theme)

      await installTauriShim(page)

      await page.addInitScript((p: any) => {
        ;(window as any).__mockInvoke = {
          ...(window as any).__mockInvoke,
          mt_prefs_get_all: () => p,
        }
      }, prefs)

      await page.setViewportSize({ width: 1280, height: 800 })
      await page.goto('/?type=editor&wid=0&udp=/tmp/mark-showcase&debug=0')

      await page.waitForFunction(() => {
        const ls = (window as any).__shimListeners
        if (!ls) return false
        for (const m of ls.values()) if (m.event === 'mt::bootstrap-editor') return true
        return false
      }, undefined, { timeout: 15_000 })

      await page.evaluate((markdown: string) => {
        ;(window as any).__emitFakeEvent('mt::bootstrap-editor', {
          addBlankTab: false,
          markdownList: [markdown],
          lineEnding: 'lf',
          sideBarVisibility: false,
          tabBarVisibility: false,
          sourceCodeModeEnabled: false
        })
      }, md)

      await page.locator('.editor-component, .editor-wrapper').first()
        .waitFor({ state: 'visible', timeout: 15_000 })

      // Wait for diagrams and math to render.
      await page.waitForTimeout(4000)

      // Wait for mermaid SVG if the content includes mermaid blocks.
      if (md.includes('```mermaid')) {
        try {
          await page.locator('.ag-container-preview svg').first()
            .waitFor({ state: 'visible', timeout: 15_000 })
          await page.waitForTimeout(1000)
        } catch {
          // Continue even if mermaid doesn't render.
        }
      }

      // Wait for KaTeX if content includes math.
      if (md.includes('$$')) {
        try {
          await page.locator('.ag-math-render, .katex').first()
            .waitFor({ state: 'visible', timeout: 10_000 })
        } catch {
          // Continue even if KaTeX doesn't render.
        }
      }

      await page.waitForTimeout(500)

      fs.mkdirSync('screenshots', { recursive: true })

      const idx = String(i).padStart(2, '0')
      await page.screenshot({
        path: `screenshots/showcase-${idx}-${name}.png`,
        type: 'png',
        clip: { x: 0, y: 0, width: 1280, height: 800 }
      })
    })
  }
})
