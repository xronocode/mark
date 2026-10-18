// FILE: tests/e2e/table-width-persistence.spec.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin the C-65 T-001 profile persistence round trip in the built renderer — resized column widths and the per-table Full width mode are written to the tableLayouts prefs key only after a real user action, a close+reopen of the same file restores them, an edited header drops that table's widths (corner-2), and a file the (mocked) filesystem no longer has is pruned instead of applied (corner-3).
//   SCOPE: The editor.vue BLOCK_TABLE_LAYOUTS_HOST wiring (load after document loads, save on muya-table-layouts dispatches), util/tableLayoutStore.js flows, and muya.tableResize adoption.
//   DEPENDS: @playwright/test, ./fixtures/tauri-shim (with per-spec mt_prefs_get/mt_prefs_set/mt_fs_stat overrides backing an in-page prefs store), ./fixtures/helpers (bootEditor/openFileTab), the built renderer served by `npm run preview`; runs in the chromium project and the webkit-tables project.
//   LINKS: .grace/changes/active/C-65 T-001 (R-1, corners 1/2/3/5); .grace/verification/runtime.xml V-M-012 scenario-66; unit twins tests/renderer/muya/table-layout-persistence.test.js + tests/renderer/store/table-layout-store.test.js.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   DOC_PATH - the persisted fixture's fake pathname (stat says it exists).
//   TABLE_MD - a 3-column fixture with distinct header names.
//   installPersistingShim - tauri-shim + an in-page tableLayouts prefs store (get/set) and a path-aware mt_fs_stat mock.
//   tableState - the first table's fixed-layout state + col widths.
//   dragBorder - drags the border at the right edge of header column `index`.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-18 C-65: new — the round trip fails
//   without the host wiring (nothing saved), the reopen restore fails
//   without adoption, the header-edit case fails if the signature drop is
//   missing, the missing-file case fails if the prune is missing.
// END_CHANGE_SUMMARY

import { test, expect, Page } from '@playwright/test'
import { installTauriShim } from './fixtures/tauri-shim'
import { bootEditor, openFileTab } from './fixtures/helpers'

const DOC_PATH = '/tmp/mark-e8e-persist/tables.md'

const TABLE_MD = `# Persisted Tables

| Alpha column | Beta column | Gamma |
| --- | --- | --- |
| one | two | three |
| four | five | six |

Text after the table.
`

test.describe('table layout persistence (C-65 T-001)', () => {
  test.beforeEach(async ({ page }) => {
    await installTauriShim(page)
  })

  // The shim's in-page prefs store: mt_prefs_get/mt_prefs_set over one
  // key, mt_fs_stat resolving isFile only for the fixture path (the
  // prune's verdict is controllable per test via __existingPaths).
  async function installPersistingShim(page: Page, { exists = true } = {}) {
    await page.addInitScript(({ path, existsFirst }) => {
      ;(window as any).__tableLayoutsStore = null
      ;(window as any).__prefsSets = 0
      ;(window as any).__existingPaths = existsFirst ? [path] : []
      ;(window as any).__mockInvoke = {
        ...(window as any).__mockInvoke,
        'mt_prefs_get': ({ key }: { key: string }) =>
          key === 'tableLayouts' ? (window as any).__tableLayoutsStore : null,
        'mt_prefs_set': ({ key, value }: { key: string; value: unknown }) => {
          if (key === 'tableLayouts') {
            ;(window as any).__tableLayoutsStore = value
            ;(window as any).__prefsSets += 1
          }
          return null
        },
        'mt_fs_stat': ({ path: p }: { path: string }) => {
          const existing = (window as any).__existingPaths as string[]
          const isFile = existing.includes(p)
          return { isFile, isDirectory: false, is_file: isFile }
        }
      }
    }, { path: DOC_PATH, existsFirst: exists })
  }

  async function openDoc(page: Page) {
    await bootEditor(page)
    await openFileTab(page, DOC_PATH, TABLE_MD)
    await page.locator("figure[data-role='TABLE'] table").first()
      .waitFor({ state: 'visible', timeout: 15_000 })
  }

  async function closeActiveTab(page: Page) {
    const before = await page.locator('.tabs-container li').count()
    await page.locator('.tabs-container li.active .close-icon').first().click()
    await page.waitForFunction(
      (n) => document.querySelectorAll('.tabs-container li').length === n - 1,
      before,
      { timeout: 10_000 }
    )
  }

  const tableState = (page: Page) => page.evaluate(() => {
    const table = document.querySelector("figure[data-role='TABLE'] table") as HTMLTableElement | null
    if (!table) return null
    return {
      fixed: table.classList.contains('ag-column-widths-fixed'),
      colWidths: Array.from(table.querySelectorAll('colgroup col')).map((c) => c.style.width),
      fullWidth: (table.closest('figure') as HTMLElement).classList.contains('ag-table-full-width'),
      caption: ((table.closest('figure') as HTMLElement).querySelector('div.ag-table-caption') as HTMLElement).textContent || ''
    }
  })

  // Drag the border at the RIGHT edge of header column `index` by `delta`.
  async function dragBorder(page: Page, index: number, delta: number) {
    const th = page.locator("figure[data-role='TABLE'] thead th").nth(index)
    const box = await th.boundingBox()
    expect(box).not.toBeNull()
    const x = box!.x + box!.width
    const y = box!.y + box!.height / 2
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x + delta, y, { steps: 10 })
    await page.mouse.up()
  }

  const savedStore = (page: Page) => page.evaluate(() => (window as any).__tableLayoutsStore)

  test('resize → quit-reopen keeps the widths; the markdown never carries them', async ({ page }) => {
    await installPersistingShim(page)
    await openDoc(page)

    expect((await tableState(page))!.fixed).toBe(false)
    await dragBorder(page, 0, 120)
    const resized = await tableState(page)
    expect(resized!.fixed).toBe(true)
    expect(resized!.colWidths.length).toBe(3)

    // The profile saw the write: one file entry with the widths + manual
    // (the entry also carries the updatedAt stamp of the store).
    await page.waitForFunction(() => {
      const store = (window as any).__tableLayoutsStore
      const files = store && store.files && store.files['/tmp/mark-e8e-persist/tables.md']
      return !!(files && Object.keys(files).filter((k) => k !== 'updatedAt').length === 1)
    }, undefined, { timeout: 5_000 })
    const store: any = await savedStore(page)
    const fileEntry = store.files[DOC_PATH]
    const pid = Object.keys(fileEntry).find((k) => k !== 'updatedAt')!
    const entry = fileEntry[pid]
    expect(entry.widths.length).toBe(3)
    expect(entry.manual).toEqual([true, false, false])
    expect(entry.fullWidth).toBe(false)

    // Quit-reopen (close the tab, open the same file again).
    await closeActiveTab(page)
    await openDoc(page)
    await page.waitForFunction(() =>
      (document.querySelector("figure[data-role='TABLE'] table") as HTMLElement)
        .classList.contains('ag-column-widths-fixed')
    , undefined, { timeout: 5_000 })

    const reopened = await tableState(page)
    expect(reopened!.colWidths).toEqual(resized!.colWidths)

    // The markdown stays byte-identical — widths live only in the profile.
    const markdown = await page.evaluate(() => {
      const el = document.querySelector('#app') as any
      return el?.__vue_app__?.config?.globalProperties?.$pinia?.state?.value?.editor?.currentFile?.markdown ?? ''
    })
    expect(markdown).toBe(TABLE_MD)
  })

  test('never resized → nothing stored (corner-5)', async ({ page }) => {
    await installPersistingShim(page)
    await openDoc(page)

    await page.waitForTimeout(600)
    expect(await savedStore(page)).toBeNull()
    expect((await tableState(page))!.fixed).toBe(false)
  })

  test('Full width is remembered per table across a reopen (R-6)', async ({ page }) => {
    await installPersistingShim(page)
    await openDoc(page)

    const tableBox = await page.locator("figure[data-role='TABLE'] table").first().boundingBox()
    await page.mouse.move(tableBox!.x + tableBox!.width / 2, tableBox!.y + tableBox!.height / 2)
    const toggle = page.locator("figure[data-role='TABLE'] button.ag-table-toolbar-toggle")
    const box = await toggle.boundingBox()
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2)
    expect((await tableState(page))!.fullWidth).toBe(true)

    await page.waitForFunction(() => {
      const store = (window as any).__tableLayoutsStore
      const files = store && store.files && store.files['/tmp/mark-e8e-persist/tables.md']
      if (!files) return false
      const pid = Object.keys(files).find((k) => k !== 'updatedAt')
      const entry = pid ? files[pid] : null
      return !!(entry && entry.fullWidth === true)
    }, undefined, { timeout: 5_000 })

    await closeActiveTab(page)
    await openDoc(page)
    await page.waitForFunction(() =>
      (document.querySelector("figure[data-role='TABLE']") as HTMLElement)
        .classList.contains('ag-table-full-width')
    , undefined, { timeout: 5_000 })

    const reopened = await tableState(page)
    expect(reopened!.fullWidth).toBe(true)
    expect(reopened!.caption).toBe('all 3 columns')
  })

  test('an edited header drops the restored widths (corner-2)', async ({ page }) => {
    await installPersistingShim(page)
    await openDoc(page)

    await dragBorder(page, 0, 120)
    await closeActiveTab(page)
    await openDoc(page)
    await page.waitForFunction(() =>
      (document.querySelector("figure[data-role='TABLE'] table") as HTMLElement)
        .classList.contains('ag-column-widths-fixed')
    , undefined, { timeout: 5_000 })

    // Edit the header text: the signature changes, the widths drop.
    const th = page.locator("figure[data-role='TABLE'] thead th").first()
    const box = await th.boundingBox()
    await page.mouse.click(box!.x + 20, box!.y + box!.height / 2)
    await page.keyboard.type('X')

    await page.waitForFunction(() =>
      !(document.querySelector("figure[data-role='TABLE'] table") as HTMLElement)
        .classList.contains('ag-column-widths-fixed')
    , undefined, { timeout: 5_000 })
    expect((await tableState(page))!.fixed).toBe(false)
  })

  test('a file the filesystem no longer has is pruned, not applied (corner-3)', async ({ page }) => {
    await installPersistingShim(page, { exists: false })
    await openDoc(page)

    await dragBorder(page, 1, -30)
    await page.waitForFunction(() => (window as any).__tableLayoutsStore !== null, undefined, { timeout: 5_000 })

    await closeActiveTab(page)
    await openDoc(page)
    await page.waitForTimeout(800)

    expect((await tableState(page))!.fixed).toBe(false)
    // The load pruned the orphan and wrote the correction back.
    const store: any = await savedStore(page)
    expect(store.files[DOC_PATH]).toBeUndefined()
  })
})
