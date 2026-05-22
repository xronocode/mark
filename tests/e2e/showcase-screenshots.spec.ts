/**
 * showcase-screenshots.ts — Capture themed editor screenshots for README GIF.
 *
 * Usage:
 *   npx playwright test scripts/showcase-screenshots.ts
 *   # then: magick -delay 180 -loop 0 screenshots/showcase-*.png -resize 960x mark-showcase.gif
 */
import { test } from '@playwright/test'
import { installTauriShim } from './fixtures/tauri-shim'
import * as fs from 'fs'

const SHOWCASE_MD = `# Welcome to Mark

A modern Markdown editor built with **Tauri** and **Vue**.

## Features

- **Live preview** with syntax highlighting
- Support for \`inline code\` and code blocks
- Math equations with KaTeX: $E = mc^2$
- Diagrams with Mermaid, Vega-Lite, and more

## Code Example

\`\`\`javascript
async function fetchData(url) {
  const response = await fetch(url);
  const data = await response.json();
  return data.map(item => ({
    id: item.id,
    title: item.title,
    status: item.done ? '✓' : '○'
  }));
}
\`\`\`

## Architecture

\`\`\`mermaid
graph LR
    A[Tauri Core] --> B[Rust Backend]
    A --> C[WKWebView]
    C --> D[Vue 3 + Pinia]
    D --> E[Muya Editor]
    D --> F[CodeMirror]
    B --> G[File System]
    B --> H[Window State]
\`\`\`

## Task List

- [x] Tauri v2 migration
- [x] Theme engine with 30+ themes
- [x] Mermaid diagram support
- [ ] Plugin system
- [ ] Collaborative editing

> "The best writing tool is the one that gets out of your way."

---

| Feature | Status | Priority |
|---------|--------|----------|
| Themes  | ✓ Done | High     |
| Export  | ✓ Done | Medium   |
| Plugins | Planned | Low    |
`

const THEMES = [
  'catppuccin-latte',
  'one-dark',
  'dracula',
  'rose-pine-dawn',
  'tokyo-night',
  'nord',
  'gruvbox-light',
  'synthwave-84',
  'solarized-light',
  'everforest-dark',
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
    tabBarVisibility: true,
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

  for (let i = 0; i < THEMES.length; i++) {
    const theme = THEMES[i]

    test(`capture ${theme}`, async ({ page }) => {
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

      // Wait for IPC listeners to register.
      await page.waitForFunction(() => {
        const ls = (window as any).__shimListeners
        if (!ls) return false
        for (const m of ls.values()) if (m.event === 'mt::bootstrap-editor') return true
        return false
      }, undefined, { timeout: 15_000 })

      // Bootstrap with markdown content.
      await page.evaluate((md: string) => {
        ;(window as any).__emitFakeEvent('mt::bootstrap-editor', {
          addBlankTab: false,
          markdownList: [md],
          lineEnding: 'lf',
          sideBarVisibility: false,
          tabBarVisibility: true,
          sourceCodeModeEnabled: false
        })
      }, SHOWCASE_MD)

      // Wait for editor to mount.
      await page.locator('.editor-component, .editor-wrapper').first()
        .waitFor({ state: 'visible', timeout: 15_000 })

      // Give muya + mermaid time to render diagrams.
      await page.waitForTimeout(3000)

      // Wait for mermaid SVG if present.
      try {
        await page.locator('.ag-container-preview svg').first()
          .waitFor({ state: 'visible', timeout: 10_000 })
      } catch {
        // Mermaid may not render in all themes — continue anyway.
      }

      // Extra settle time for CSS transitions.
      await page.waitForTimeout(500)

      // Ensure screenshots dir exists.
      fs.mkdirSync('screenshots', { recursive: true })

      const idx = String(i).padStart(2, '0')
      await page.screenshot({
        path: `screenshots/showcase-${idx}-${theme}.png`,
        type: 'png',
        clip: { x: 0, y: 0, width: 1280, height: 800 }
      })
    })
  }
})
