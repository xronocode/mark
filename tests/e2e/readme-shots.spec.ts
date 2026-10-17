// FILE: tests/e2e/readme-shots.spec.ts
// VERSION: 1.1.0
// START_MODULE_CONTRACT
//   PURPOSE: C-53 T-001/R-2 — reproducible README screenshots. Renders
//            the real editor (vite preview + tauri-shim) at 1440×900 @2x
//            in the macOS theme (macOS dark for the dark shot) with realistic
//            content and writes PNGs straight into docs/assets/readme/:
//            01-agents (plan document + folder tree + Recent/Pinned +
//            outline rail), 03-diagrams (Mermaid flowchart + donut pie +
//            Vega bar in theme colours), 05-viewer (a large release-pipeline
//            diagram in the fullscreen viewer, zoomed in), 07-home (the welcome screen) and
//            08-dark (the same plan document in macOS dark).
//   SCOPE: on-demand capture ONLY — every test skips unless README_SHOTS=1
//          is set (normal e2e runs never touch the repo assets).
//          Chromium only by design: the capture must come from one engine
//          (the webkit-* playwright projects match their own spec files),
//          and the AGENTS.md release procedure invokes it with
//          `--project=chromium`.
//   DEPENDS: @playwright/test, tests/e2e/fixtures/tauri-shim,
//          tests/e2e/fixtures/helpers (bootEditor, openFileTab).
//   LINKS: .grace/changes/active/C-53/spec.xml R-2; README image
//          references; .grace/verification/runtime.xml V-M-011.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   OUT_DIR - docs/assets/readme (repo-relative, resolved from this spec).
//   ROOT - the atlas workspace path the shots use.
//   SHOTS_ENABLED - README_SHOTS=1 gate; every test skips without it.
//   PLAN_MD - the realistic agent plan document used by 01-agents and 08-dark.
//   DIAGRAMS_MD - flowchart + pie + vega document for 03-diagrams.
//   PIPELINE_MD - the large release-architecture flowchart for 05-viewer.
//   emit - mt::update-object-tree event helper.
//   emitAdd - add-file tree event.
//   emitAddDir - add-folder tree event.
//   bootAtlas - editor with the atlas tree, Recent/Pinned and the plan open (macos or macos-dark).
//   useTheme - init script with a complete prefs table for the given theme.
//   bootWelcome - boot the no-document welcome screen with realistic recents.
//   shot - page.screenshot into docs/assets/readme/<name>.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.1.0 - 2026-10-17 C-53 review: every shot in the macOS
//   theme (user: «эпловскую бери для скринов»), 05-viewer shows a large
//   release-pipeline diagram zoomed in instead of a 12-node chain.
//   PREV: v1.0.0 - 2026-10-17 C-53 T-001/R-2: initial capture spec.
// END_CHANGE_SUMMARY

import { test, expect, type Page } from '@playwright/test'
import { installTauriShim } from './fixtures/tauri-shim'
import { bootEditor, openFileTab } from './fixtures/helpers'
import { mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// Capture is opt-in: a normal e2e run (CI included) must skip every test
// here — the PNGs land in the repo, they are release materials.
const SHOTS_ENABLED = process.env.README_SHOTS === '1'
test.skip(!SHOTS_ENABLED, 'README screenshot capture — set README_SHOTS=1 to run')

// README frame: 1440×900 at 2× (retina PNGs, width attr in README = 800).
test.use({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../docs/assets/readme')

const ROOT = '/Users/ada/projects/atlas'

// START_BLOCK_PLAN_DOC
// The 01-agents / 08-dark document: what a coding agent actually produces —
// a reviewable plan with a table, a checklist and open questions (≥ 3
// h1–h3 headings so the outline rail appears).
const PLAN_MD = `# Checkout redesign — implementation plan

**Author:** the coding agent · **Date:** 17 October 2026 · **Status:** ready for review

## Goal

Replace the two-step checkout with a single page. The customer picks a plan, pays and lands on the receipt — no redirect in between.

## Steps

| # | Step | Owner | Estimate |
|---|------|-------|----------|
| 1 | Single-page layout with the plan picker | Dana | 2 days |
| 2 | Payment sheet with Apple Pay and cards | Amir | 3 days |
| 3 | Receipt page and confirmation email | Dana | 1 day |
| 4 | Analytics events for every step | Amir | 1 day |

## Checks before launch

- [x] Plan picker matches the design tokens
- [x] A failed payment keeps the cart intact
- [ ] Load test: 500 checkouts per minute
- [ ] Rollback plan for the payments service

## Open questions

1. Do we keep the old checkout reachable for a week as a fallback?
2. Should the receipt email move to the notification service now, or after launch?
`
// END_BLOCK_PLAN_DOC

// START_BLOCK_DIAGRAMS_DOC
// 03-diagrams: a Mermaid flowchart, the donut pie and a Vega bar chart,
// all in the active theme's colours (C-51 T-003/T-005).
const DIAGRAMS_MD = `# How a release ships

Every change walks the same loop, from an agent's draft to a signed build.

\`\`\`mermaid
flowchart LR
    A[Agent drafts the notes] --> B{Review passed?}
    B -- yes --> C[Tag the release]
    B -- no --> D[Another revision pass]
    D --> A
    C --> E[(Signed artifacts)]
    E --> F[Updater rolls out]
\`\`\`

## Where the week went

\`\`\`mermaid
pie title Hours by activity
    "Writing" : 46
    "Reviewing" : 28
    "Fixing" : 16
    "Meetings" : 10
\`\`\`

## Where the readers come from

\`\`\`vega-lite
{"data":{"values":[{"source":"Search","readers":4200},{"source":"Referrals","readers":2600},{"source":"Social","readers":1800},{"source":"Direct","readers":1200}]},"mark":{"type":"bar","cornerRadiusEnd":4},"encoding":{"x":{"field":"source","type":"nominal","sort":{"field":"readers","order":"descending"},"axis":{"title":null}},"y":{"field":"readers","type":"quantitative","axis":{"title":"Readers"}}}}
\`\`\`
`
// END_BLOCK_DIAGRAMS_DOC

// START_BLOCK_PIPELINE_DOC
// 05-viewer: a 12-stage LR flowchart whose natural width far exceeds the
// text column — the C-51 T-010 need rule gives it the expand button.
const PIPELINE_MD = `# Release architecture

How a change travels from the agent's draft to every account.

\`\`\`mermaid
flowchart LR
  Issue[Issue tracker] --> Draft[Agent drafts plan.md] --> Rev{Human review}
  Rev -->|changes| Draft
  Rev -->|approved| Lint
  subgraph CI["Continuous integration"]
    Lint[Lint + types] --> U[Unit tests] & E1[E2E · Chromium] & E2[E2E · WebKit] & R[Rust tests]
    U & E1 & E2 & R --> Gate{All green?}
  end
  Gate -->|no| Fix[Fix forward] --> Lint
  Gate -->|yes| Mac & Win & Lin
  subgraph Build["Build and sign"]
    Mac[macOS app] --> Sign[Sign + notarize]
    Win[Windows installer] --> SignW[Authenticode]
    Lin[Linux AppImage] --> Sum[Checksums]
  end
  Sign & SignW & Sum --> Assets[(Release assets)]
  subgraph Rollout["Rollout"]
    Staff[Staff cohort] --> Ten[10% of accounts] --> Budget{Error budget ok?}
    Budget -->|yes| All[Everyone]
    Budget -->|no| Back[Roll back]
  end
  Assets --> Staff
  All --> Metrics[(Metrics + feedback)]
\`\`\`

Open the diagram full screen to read the stages.
`
// END_BLOCK_PIPELINE_DOC

const emit = (page: Page, type: string, change: Record<string, unknown>) =>
  page.evaluate(([t, c]) => {
    ;(window as any).__emitFakeEvent('mt::update-object-tree', { type: t, change: c })
  }, [type, change] as const)

const emitAdd = (page: Page, pathname: string, isMarkdown: boolean) =>
  emit(page, 'add', {
    pathname,
    name: pathname.split('/').pop(),
    isFile: true,
    isDirectory: false,
    isMarkdown,
    birthTime: 1
  })
const emitAddDir = (page: Page, pathname: string) =>
  emit(page, 'addDir', { pathname, name: pathname.split('/').pop() })

// START_BLOCK_BOOT_ATLAS
// The atlas workspace used by 01-agents and 08-dark: the folder tree
// (Markdown files only — logo.png is filtered by the C-51 tree), a
// Recent list with the plan on top, the plan pinned and open. The prefs
// table is complete (a partial override does not reach the theme on
// boot — the shim only applies what mt_prefs_get_all returns).
async function bootAtlas(page: Page, theme: 'macos' | 'macos-dark') {
  const atlasRoot = ROOT
  await installTauriShim(page)
  await page.addInitScript(({ t, root }: { t: string; root: string }) => {
    const w = window as any
    w.__mockInvoke = {
      ...w.__mockInvoke,
      mt_walk_project: () => {},
      mt_watch_subscribe: () => 'fake-sub-id',
      mt_watch_unsubscribe: () => {},
      mt_pick_folder: () => null,
      mt_recent_list: () => [
        `${root}/checkout-plan.md`,
        '/Users/ada/notes/reading-list.md',
        '/Users/ada/papers/attention-notes.md'
      ],
      mt_recent_remove: () => 0,
      mt_recent_insert: () => null,
      mt_window_popup_context_menu: () => 'pinFileMenuItem',
      mt_prefs_get: () => null,
      mt_prefs_set: () => null,
      // No `.before` baseline: with one, opening the plan enters diff
      // mode (bootstrap-ipc auto-diff) and the shot shows source lines.
      mt_fs_stat: (args: any) => {
        if (String(args?.path ?? '').endsWith('.before')) throw new Error('ENOENT')
        return {
        isFile: true,
        isDirectory: false,
        size: 128,
        mode: 0,
        mtimeMs: Date.now() - 3 * 60 * 1000,
        isSymbolicLink: false
        }
      },
      mt_prefs_get_all: () => ({
        theme: t,
        autoSave: false,
        autoSaveDelay: 5000,
        titleBarStyle: 'custom',
        openFilesInNewWindow: false,
        openFolderInNewWindow: false,
        hideScrollbar: false,
        sideBarVisibility: true,
        tabBarVisibility: true,
        sourceCodeModeEnabled: false,
        outlineRailVisible: true,
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
        // A slightly narrower column leaves the outline rail room beside the
        // sidebar at 1440 px (the rail hides rather than overlap the text).
        editorLineWidth: '680px',
        listIndentation: 1,
        frontmatterType: '-',
        followSystemTheme: false,
        lightModeTheme: 'macos',
        darkModeTheme: 'macos-dark',
        customCss: '',
        bulletListMarker: '-',
        orderListDelimiter: '.',
        preferLooseListItem: true,
        tabSize: 4,
        lineHeight: 1.6,
        fontWeight: 'normal',
        trimUnnecessaryCodeBlockEmptyLines: false,
        sequenceTheme: 'hand'
      })
    }
  }, { t: theme, root: atlasRoot })

  await bootEditor(page, { sideBarVisibility: true })

  // The atlas tree: the open plan, two more notes, a nested doc folder
  // and one non-Markdown file the tree filters out.
  await page.evaluate((root: string) => {
    const el = document.querySelector('#app') as any
    const pinia = el?.__vue_app__?.config?.globalProperties?.$pinia
    pinia.state.value.project.projectTrees.push({
      pathname: root,
      name: root.split('/').pop(),
      isDirectory: true,
      isFile: false,
      isMarkdown: false,
      folders: [],
      files: []
    })
  }, atlasRoot)
  await emitAddDir(page, `${ROOT}/docs`)
  await emitAdd(page, `${ROOT}/docs/onboarding.md`, true)
  await emitAdd(page, `${ROOT}/checkout-plan.md`, true)
  await emitAdd(page, `${ROOT}/roadmap.md`, true)
  await emitAdd(page, `${ROOT}/meeting-notes.md`, true)
  await emitAdd(page, `${ROOT}/assets/logo.png`, false)
  await page.waitForTimeout(300)

  await openFileTab(page, `${ROOT}/checkout-plan.md`, PLAN_MD)

  // Pin the current plan so the Pinned section shows (context menu mock
  // returns the pin item).
  await page.locator('.side-bar-file', { hasText: 'checkout-plan.md' }).first().click({ button: 'right' })
  await expect(page.locator('[data-section="pinned"] .section-file-name')).toHaveText('checkout-plan.md')

  // Expand docs/ so the guide lines and the nested file render.
  await page.locator('.side-bar-folder .folder-name', { hasText: 'docs' }).click()
  await page.waitForTimeout(200)
}
// END_BLOCK_BOOT_ATLAS

// START_BLOCK_BOOT_WELCOME
// 07-home: the no-document welcome screen with realistic recents, the
// last session, one recent folder and the What's-new footer link.
// START_BLOCK_USE_THEME
// The single-document shots (03, 05, 07) boot in the macOS theme too:
// a complete prefs table, since the shim only applies what
// mt_prefs_get_all returns.
async function useTheme(page: Page, theme: string) {
  await page.addInitScript((t: string) => {
    const w = window as any
    w.__mockInvoke = {
      ...w.__mockInvoke,
      mt_prefs_get_all: () => ({ theme: t, titleBarStyle: 'custom', sideBarVisibility: false, tabBarVisibility: true, outlineRailVisible: true, fontSize: 16, lineHeight: 1.6, editorFontFamily: 'Open Sans', codeFontFamily: 'DejaVu Sans Mono', codeFontSize: '14px', followSystemTheme: false, lightModeTheme: 'macos', darkModeTheme: 'macos-dark', language: 'en', sequenceTheme: 'hand', statusBarVisibility: true, spellcheckerEnabled: false, autoSave: false, hideScrollbar: true })
    }
  }, theme)
}
// END_BLOCK_USE_THEME

async function bootWelcome(page: Page) {
  await installTauriShim(page)
  await useTheme(page, 'macos')
  await page.addInitScript(() => {
    const w = window as any
    w.__mockInvoke = {
      ...w.__mockInvoke,
      mt_recent_list: () => [
        '/Users/ada/projects/atlas/checkout-plan.md',
        '/Users/ada/notes/reading-list.md',
        '/Users/ada/papers/attention-notes.md'
      ],
      mt_recent_remove: () => 1,
      mt_recent_insert: () => null,
      mt_fs_stat: (args: any) => ({
        isFile: true,
        isDirectory: false,
        size: 128,
        mode: 0,
        mtimeMs:
          args?.path?.includes('checkout-plan')
            ? Date.now() - 3 * 60 * 1000
            : args?.path?.includes('reading-list')
              ? Date.now() - 5 * 60 * 60 * 1000
              : Date.now() - 26 * 60 * 60 * 1000,
        isSymbolicLink: false
      }),
      mt_prefs_get: (args: any) => {
        if (args?.key === 'lastSessionTabs') {
          return ['/Users/ada/projects/atlas/checkout-plan.md', '/Users/ada/notes/reading-list.md']
        }
        if (args?.key === 'recentFolders') return ['/Users/ada/projects/atlas']
        if (args?.key === 'lastUpdateAt') return new Date().toISOString()
        return null
      },
      mt_prefs_set: () => null
    }
  })

  await page.goto('/?type=editor&wid=0&udp=/tmp/mark-e2e&debug=0')
  await page.waitForFunction(() => {
    const ls = (window as any).__shimListeners
    if (!ls) return false
    for (const m of ls.values()) if (m.event === 'mt::bootstrap-editor') return true
    return false
  }, undefined, { timeout: 15_000 })

  await page.evaluate(() => {
    ;(window as any).__emitFakeEvent('mt::bootstrap-editor', {
      addBlankTab: false,
      markdownList: [],
      lineEnding: 'lf',
      sideBarVisibility: false,
      tabBarVisibility: true,
      sourceCodeModeEnabled: false
    })
  })
  await page.locator('.welcome-screen').waitFor({ state: 'visible', timeout: 15_000 })
  await page.waitForTimeout(400)
}
// END_BLOCK_BOOT_WELCOME

function shot(page: Page, name: string) {
  mkdirSync(OUT_DIR, { recursive: true })
  return page.screenshot({ path: `${OUT_DIR}/${name}`, type: 'png' })
}

test.describe('README screenshots (C-53 R-2)', () => {
  test.setTimeout(120_000)

  test('01-agents — plan document, folder tree, Recent/Pinned, outline rail (macOS)', async ({ page }) => {
    await bootAtlas(page, 'macos')

    await expect(page.locator('.side-bar-file.current', { hasText: 'checkout-plan.md' })).toBeVisible()
    await expect(page.locator('[data-section="recent"]')).toBeVisible()
    await expect(page.locator('[data-section="pinned"]')).toBeVisible()
    // The outline rail needs the document's headings and a wide editor.
    await expect(page.locator('.outline-rail')).toBeVisible({ timeout: 10_000 })
    await page.waitForTimeout(400)

    await shot(page, '01-agents.png')
  })

  test('03-diagrams — flowchart, donut pie and Vega bar in the theme colours (macOS)', async ({ page }) => {
    await installTauriShim(page)
    await useTheme(page, 'macos')
    await bootEditor(page)
    await openFileTab(page, `${ROOT}/how-a-release-ships.md`, DIAGRAMS_MD)

    // Two mermaid diagrams + the vega bar, all painted (root SVGs only —
    // some diagram types nest svgs).
    await expect(
      page.locator('figure[data-role="MERMAID"] div.ag-container-preview svg:not(svg svg)')
    ).toHaveCount(2, { timeout: 30_000 })
    await expect(
      page.locator('figure[data-role="VEGA-LITE"] div.ag-container-preview svg:not(svg svg)')
    ).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('.ag-mermaid-error')).toHaveCount(0)
    await page.waitForTimeout(600)

    await shot(page, '03-diagrams.png')
  })

  test('05-viewer — a wide diagram in the fullscreen viewer (macOS)', async ({ page }) => {
    await installTauriShim(page)
    await useTheme(page, 'macos')
    await bootEditor(page)
    await openFileTab(page, `${ROOT}/deployment-pipeline.md`, PIPELINE_MD)

    const preview = page.locator('div.ag-container-preview.ag-mermaid-preview').first()
    await preview.waitFor({ state: 'visible', timeout: 30_000 })
    await page.locator('div.ag-mermaid-preview svg').first().waitFor({ state: 'visible', timeout: 30_000 })

    // The wide diagram needs the viewer: its expand button is laid out.
    const expand = page.locator('figure[data-role="MERMAID"] > button.ag-block-expand').first()
    await expect(page.locator('figure[data-role="MERMAID"]').first()).toHaveClass(/ag-expand-needed/)
    await expand.click()

    const viewer = page.locator('.ag-block-viewer')
    await expect(viewer).toHaveClass(/ag-block-viewer-open/)
    await expect(viewer.locator('.ag-block-viewer-canvas svg').first()).toBeVisible()
    await page.waitForTimeout(500) // fit + deferred re-fit
    // Zoom in so the shot reads at README width: the point is the detail.
    for (let i = 0; i < 3; i++) {
      await viewer.locator('.ag-block-viewer-zoom-in').click()
      await page.waitForTimeout(250)
    }
    await page.mouse.move(5, 880)
    await page.waitForTimeout(600)

    await shot(page, '05-viewer.png')
  })

  test('07-home — the welcome screen with recents and Connect your agent (macOS)', async ({ page }) => {
    await bootWelcome(page)

    await expect(page.locator('.welcome-screen .brand-name')).toHaveText('Mark')
    await expect(page.locator('.welcome-screen .recent-item').first()).toBeVisible()
    await expect(page.locator('.welcome-screen .agent-row .chip-button.accent')).toHaveText('Copy prompt')

    await shot(page, '07-home.png')
  })

  test('08-dark — the same plan document in macOS dark', async ({ page }) => {
    await bootAtlas(page, 'macos-dark')

    // The dark body class is what the shot needs (the title-bar toggle
    // lights it when the boot theme alone did not).
    for (let i = 0; i < 3; i++) {
      if (await page.evaluate(() => document.body.classList.contains('dark'))) break
      await page.locator('.titlebar-nav-btn[title*="Theme"]').first().click()
      await page.waitForTimeout(250)
    }
    await expect(page.locator('body')).toHaveClass(/(^|\s)dark(\s|$)/, { timeout: 5_000 })

    await expect(page.locator('.side-bar-file.current', { hasText: 'checkout-plan.md' })).toBeVisible()
    await expect(page.locator('.outline-rail')).toBeVisible({ timeout: 10_000 })
    await page.waitForTimeout(400)

    await shot(page, '08-dark.png')
  })
})
