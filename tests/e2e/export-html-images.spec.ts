// FILE: tests/e2e/export-html-images.spec.ts
// START_MODULE_CONTRACT
//   PURPOSE: C-SELF-CONTAINED-HTML-EXPORT — end-to-end artifact assertion
//   against the real renderer + tauri shim. Export as HTML (File › Export
//   › HTML via the menu bridge): the pass stats + reads the document's
//   local image through the read-binary bridge (mt_fs_stat /
//   mt_fs_read_binary); the saved HTML (captured at mt_fs_write) embeds
//   the image as a data:image/png;base64 URL that decodes to the fixture
//   bytes (spec AC-3, byte-identical); a remote image in the same
//   document keeps its URL (R-2); the relative src appears nowhere in the
//   saved file (R-1). C-EXPORT-BOUNDARIES-DOCX adds the consent-flow
//   intent at the same artifact layer: the embed-consent and
//   PlantUML-consent cards gate the write through the real notification
//   stack, Confirm embeds exactly the granted set, Cancel keeps the
//   declined src / the pinned source placeholder with the honest
//   {embedded}/{total} notice.
//   SCOPE: Real built renderer, tauri-shim per-path stat/read/write
//   doubles, the saved-HTML mt_fs_write capture, the JSZip-free artifact
//   assertions, the real notification-stack consent cards, no network.
//   DEPENDS: Playwright, tauri shim and editor boot helpers.
//   LINKS: M-065, .grace/changes/active/C-EXPORT-BOUNDARIES-DOCX,
//   C-SELF-CONTAINED-HTML-EXPORT, C-EXPORT-BOUNDARIES,
//   C-EXPORT-DOCUMENT-PIN
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   PNG_BYTES - the PNG signature bytes the fs bridge "returns from disk" (tiny on purpose: the assertion is byte identity, not image validity).
//   PNG_B64 - base64 form of PNG_BYTES, the byte-identical data-URL payload.
//   DOC - the consent-free in-scope document of the C-SELF-CONTAINED-HTML-EXPORT pin (relative sibling + remote image).
//   OUTSIDE_BYTES - distinct fixture bytes for the out-of-directory file; byte identity proves the right file's bytes.
//   OUTSIDE_B64 - base64 form of OUTSIDE_BYTES, the declined/granted out-of-scope payload.
//   OUTSIDE_PATH - the absolute out-of-directory image path the consent card must disclose.
//   CONSENT_DOC - document with the in-directory sibling plus the outside absolute image.
//   PLANTUML_DOC - document with exactly one ```plantuml fence.
//   PLAIN_DOC - document without plantuml fences or images (zero-fence no-card pin).
//   EMBED_CARD_TITLE - the embed-consent card title copy.
//   EMBED_CONFIRM_LABEL - the embed card Confirm button label.
//   EMBED_CANCEL_LABEL - the embed card Cancel button label.
//   PLANTUML_CARD_TITLE - the PlantUML-consent card title copy.
//   PLANTUML_ADDRESS - the remote render address the disclosure must name.
//   PLANTUML_CONFIRM_LABEL - the PlantUML card Confirm button label.
//   PLANTUML_CANCEL_LABEL - the PlantUML card Cancel button label.
// END_MODULE_MAP

import { test, expect } from '@playwright/test'
import { installTauriShim } from './fixtures/tauri-shim'
import { bootEditor, openFileTab } from './fixtures/helpers'

// The PNG signature bytes the fs bridge "returns from disk". Tiny on
// purpose: the assertion is byte identity, not image validity.
const PNG_BYTES = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const PNG_B64 = Buffer.from(PNG_BYTES).toString('base64')

const DOC = [
  '# HTML export spec',
  '',
  'local ![shot](img/shot.png)',
  '',
  'remote ![remote](https://example.com/remote.png)',
  ''
].join('\n')

test.describe('export to HTML embeds local images (C-SELF-CONTAINED-HTML-EXPORT)', () => {
  test.beforeEach(async ({ page }) => {
    await installTauriShim(page)
  })

  test('Export as HTML: local PNG embedded byte-identical, remote URL untouched', async ({ page }) => {
    await page.addInitScript((pngBytes: number[]) => {
      const w = window as any
      w.__written = []
      w.__mockInvoke['plugin:dialog|save'] = () => '/tmp/mark-e2e-out.html'
      w.__mockInvoke['mt_fs_stat'] = (args: any) => {
        if (args?.path === '/tmp/html-flow/img/shot.png') {
          return {
            size: pngBytes.length,
            mode: 0o100644,
            mtimeMs: 0,
            isFile: true,
            isDirectory: false,
            isSymbolicLink: false
          }
        }
        return { isFile: false, isDirectory: false }
      }
      w.__mockInvoke['mt_fs_read_binary'] = (args: any) => {
        if (args?.path === '/tmp/html-flow/img/shot.png') return pngBytes
        return null
      }
      w.__mockInvoke['mt_fs_write'] = (args: any) => {
        w.__written.push({ path: args?.path, content: args?.content })
        return null
      }
    }, PNG_BYTES)

    await bootEditor(page)
    await openFileTab(page, '/tmp/html-flow/flow.md', DOC)

    await page.evaluate(() => {
      ;(window as any).__invokeLog = []
      ;(window as any).__emitFakeEvent('mt::menu-invoked', 'file.export-file-html')
    })

    // HTML export opens Save directly and embeds images before writing.
    await expect(page.locator('.el-dialog', { hasText: 'Export Options' })).toHaveCount(0)

    // The write happens after the embedding pass resolves.
    const written = await page.waitForFunction(
      () => (window as any).__written?.length > 0
    )
    const entry = (await written.evaluate(() => (window as any).__written))[0] as {
      path: string
      content: string
    }
    expect(entry.path).toBe('/tmp/mark-e2e-out.html')

    // AC-3: the local image is a data URL decoding to the fixture bytes.
    const dataUrl = entry.content.match(/src="data:image\/png;base64,([^"]+)"/)?.[1]
    expect(dataUrl).toBeDefined()
    expect(dataUrl).toBe(PNG_B64)

    // R-1: the relative src is gone from the saved file; R-2: the remote
    // URL survives verbatim.
    expect(entry.content).not.toContain('img/shot.png')
    expect(entry.content).toContain('https://example.com/remote.png')

    // The pass went through the binary bridge, not the UTF-8 read.
    const log = await page.evaluate(() => (window as any).__invokeLog)
    expect(log.filter((command: string) => command === 'plugin:dialog|save')).toHaveLength(1)
    expect(log.filter((command: string) => command === 'mt_fs_write')).toHaveLength(1)
    expect(log).toContain('mt_fs_stat')
    expect(log).toContain('mt_fs_read_binary')
    expect(log).not.toContain('mt_fs_read')
  })
})

// ──────────────────────────────────────────────────────────────────────
// C-EXPORT-BOUNDARIES-DOCX — the consent gates at the saved-artifact
// layer. Documents reaching outside their directory (an absolute src
// beside the in-directory sibling) or carrying exactly one ```plantuml
// fence go through the real renderer and the real notification-stack
// buttons into the same mt_fs_write capture. The card strictly gates the
// write; decisions resolve through the card actions and are never
// persisted. Coverage-first pins: the behavior reds belong to archived
// C-EXPORT-BOUNDARIES' failing-first evidence; a red run of any pin
// below on the current tree is a regression discovery.
// ──────────────────────────────────────────────────────────────────────

// Distinct fixture bytes for the out-of-directory file — byte identity
// proves the pass embedded the right file's bytes through the bridge.
const OUTSIDE_BYTES = [0x42, 0x4d, 0x36, 0x00, 0x00, 0x00]
const OUTSIDE_B64 = Buffer.from(OUTSIDE_BYTES).toString('base64')
const OUTSIDE_PATH = '/tmp/html-flow-outside/secret.png'

const CONSENT_DOC = [
  '# Consent flow spec',
  '',
  'sibling ![shot](img/shot.png)',
  '',
  'outside ![secret](/tmp/html-flow-outside/secret.png)',
  ''
].join('\n')

const PLANTUML_DOC = ['# Consent flow spec', '', '```plantuml', '@startuml', 'A -> B', '@enduml', '```', ''].join('\n')
const PLAIN_DOC = ['# Consent flow spec', '', 'Plain text, no diagrams, no images.', ''].join('\n')

const EMBED_CARD_TITLE = 'Embed images from outside the document folder?'
const EMBED_CONFIRM_LABEL = 'Embed these files'
const EMBED_CANCEL_LABEL = 'Skip them'
const PLANTUML_CARD_TITLE = 'PlantUML diagrams are rendered by plantuml.com'
const PLANTUML_ADDRESS = 'https://www.plantuml.com/plantuml'
const PLANTUML_CONFIRM_LABEL = 'Send to plantuml.com'
const PLANTUML_CANCEL_LABEL = 'Keep source local'

test.describe('export consent gates gate the saved artifact (C-EXPORT-BOUNDARIES-DOCX)', () => {
  test.beforeEach(async ({ page }) => {
    await installTauriShim(page)
  })

  // Per-path stat/read doubles: every requested path is recorded so the
  // pins can prove the pass touched only the in-scope sibling plus the
  // granted outside file (the document's own pin reads aside).
  const installImageDoubles = (page: import('@playwright/test').Page) =>
    page.addInitScript(
      ({ pngBytes, outsideBytes }: { pngBytes: number[]; outsideBytes: number[] }) => {
        const w = window as any
        w.__written = []
        w.__statPaths = []
        w.__readPaths = []
        w.__mockInvoke['plugin:dialog|save'] = () => '/tmp/consent-flow/out.html'
        w.__mockInvoke['mt_fs_stat'] = (args: any) => {
          w.__statPaths.push(args?.path)
          if (args?.path === '/tmp/html-flow/img/shot.png') {
            return { size: pngBytes.length, mode: 0o100644, mtimeMs: 0, isFile: true, isDirectory: false, isSymbolicLink: false }
          }
          if (args?.path === '/tmp/html-flow-outside/secret.png') {
            return { size: outsideBytes.length, mode: 0o100644, mtimeMs: 0, isFile: true, isDirectory: false, isSymbolicLink: false }
          }
          return { isFile: false, isDirectory: false }
        }
        w.__mockInvoke['mt_fs_read_binary'] = (args: any) => {
          w.__readPaths.push(args?.path)
          if (args?.path === '/tmp/html-flow/img/shot.png') return pngBytes
          if (args?.path === '/tmp/html-flow-outside/secret.png') return outsideBytes
          return null
        }
        w.__mockInvoke['mt_fs_write'] = (args: any) => {
          w.__written.push({ path: args?.path, content: args?.content })
          return null
        }
      },
      { pngBytes: PNG_BYTES, outsideBytes: OUTSIDE_BYTES }
    )

  const startExport = async (page: import('@playwright/test').Page) => {
    await page.evaluate(() => {
      ;(window as any).__invokeLog = []
      // Scope the per-path recordings to the export flow: the live
      // preview already resolved the images through the bridge at
      // tab-open, before any export exists.
      ;(window as any).__statPaths = []
      ;(window as any).__readPaths = []
      ;(window as any).__emitFakeEvent('mt::menu-invoked', 'file.export-file-html')
    })
  }

  const firstWrite = async (page: import('@playwright/test').Page) => {
    await page.waitForFunction(() => ((window as any).__written?.length ?? 0) > 0, undefined, {
      timeout: 15_000
    })
    const entries = await page.evaluate(() => (window as any).__written)
    return entries[0] as { path: string; content: string }
  }

  test('embed consent: the card lists the resolved outside paths and gates the write; Confirm embeds exactly the granted set', async ({ page }) => {
    await installImageDoubles(page)
    await bootEditor(page)
    await openFileTab(page, '/tmp/html-flow/consent.md', CONSENT_DOC)
    await startExport(page)

    // The embed-consent card mounts naming the resolved outside path,
    // its count and the document directory.
    const card = page.locator('.notification-card', { hasText: EMBED_CARD_TITLE })
    await expect(card).toBeVisible()
    await expect(card).toContainText('1 image file(s) outside the document directory (/tmp/html-flow)')
    await expect(card).toContainText(OUTSIDE_PATH)

    // The gate strictly precedes any out-of-scope I/O and any write.
    expect(await page.evaluate(() => (window as any).__written)).toHaveLength(0)
    expect(await page.evaluate(() => (window as any).__statPaths)).not.toContain(OUTSIDE_PATH)
    expect(await page.evaluate(() => (window as any).__readPaths)).not.toContain(OUTSIDE_PATH)

    await page.locator('.notification-card .action-btn', { hasText: EMBED_CONFIRM_LABEL }).click()
    const entry = await firstWrite(page)
    expect(entry.path).toBe('/tmp/consent-flow/out.html')

    // Exactly the granted set embeds, byte-identical through the bridge:
    // the in-scope sibling first, then the granted outside file.
    const dataUrls = [...entry.content.matchAll(/src="data:image\/png;base64,([^"]+)"/g)].map((m) => m[1])
    expect(dataUrls).toEqual([PNG_B64, OUTSIDE_B64])
    expect(entry.content).not.toContain(OUTSIDE_PATH)

    // The two-phase recording contract: the C-21 dead-link checker
    // (editor.vue runLinkCheck :3687, the doc-markdown-changed debounce)
    // stats the RELATIVE sibling through the same bridge — once per run,
    // per-run cache (linkCheck.js :142-148) — while linkCheck.js :165
    // skips absolute dests, so the outside path is link-check-immune. A
    // late link-check stat may therefore land inside the export window
    // under load, and the sibling's stat count is not a single-fire
    // claim. The deterministic product contract is:
    //   - reads belong to the embed pass alone (the per-path outcome
    //     cache in exportImages.js fires exactly one stat+read per
    //     unique path; nothing else reads image bytes) — pinned as the
    //     exact ordered read surface;
    //   - the outside path fires exactly one stat and exactly one read.
    const imageStatPaths = ((await page.evaluate(() => (window as any).__statPaths)) as string[]).filter((p) => p !== '/tmp/html-flow/consent.md')
    expect([...new Set(imageStatPaths)]).toEqual(['/tmp/html-flow/img/shot.png', OUTSIDE_PATH])
    expect(imageStatPaths.filter((p) => p === OUTSIDE_PATH)).toHaveLength(1)
    const imageReadPaths = ((await page.evaluate(() => (window as any).__readPaths)) as string[]).filter((p) => p !== '/tmp/html-flow/consent.md')
    expect(imageReadPaths).toEqual(['/tmp/html-flow/img/shot.png', OUTSIDE_PATH])
    expect(imageReadPaths.filter((p) => p === OUTSIDE_PATH)).toHaveLength(1)
  })

  test('embed consent: Cancel keeps the declined src with the in-scope sibling embedded and the honest embedded/total notice', async ({ page }) => {
    await installImageDoubles(page)
    await bootEditor(page)
    await openFileTab(page, '/tmp/html-flow/consent.md', CONSENT_DOC)
    await startExport(page)

    await expect(page.locator('.notification-card', { hasText: EMBED_CARD_TITLE })).toBeVisible()
    await page.locator('.notification-card .action-btn', { hasText: EMBED_CANCEL_LABEL }).click()
    const entry = await firstWrite(page)

    // Declined: the outside img keeps its original src verbatim and its
    // bytes appear nowhere; the in-scope sibling still embeds byte-identically.
    // Declined: the outside img keeps its src exactly as the pass
    // received it (muya renders absolute paths as file:// URLs) and its
    // bytes appear nowhere; the in-scope sibling still embeds
    // byte-identically.
    expect(entry.content).toContain(`src="file://${OUTSIDE_PATH}"`)
    expect(entry.content).not.toContain(OUTSIDE_B64)
    const dataUrl = entry.content.match(/src="data:image\/png;base64,([^"]+)"/)?.[1]
    expect(dataUrl).toBe(PNG_B64)

    // Declined references cost zero I/O (the outside path is
    // link-check-immune too — linkCheck.js :165 skips absolute dests).
    expect(await page.evaluate(() => (window as any).__statPaths)).not.toContain(OUTSIDE_PATH)
    expect(await page.evaluate(() => (window as any).__readPaths)).not.toContain(OUTSIDE_PATH)

    // The sibling's embed read is single-fire — image reads belong to
    // the embed pass alone, the C-21 link checker only stats.
    const imageReadPaths = ((await page.evaluate(() => (window as any).__readPaths)) as string[]).filter((p) => p !== '/tmp/html-flow/consent.md')
    expect(imageReadPaths).toEqual(['/tmp/html-flow/img/shot.png'])

    // The honest skip notice: the exact {embedded}/{total} pair with the
    // declined reference counted as skipped — counts only.
    await expect(page.locator('.notification-card', { hasText: 'Some images were not embedded' })).toBeVisible()
    await expect(page.locator('.notification-card', { hasText: '1 of 2 images embedded' })).toBeVisible()
  })

  // REGRESSION STOP (recorded, halted leg): this pin is behavioral-RED on
  // the current tree — a regression discovery, not an adapted assertion.
  // The consented branch (exportHtml.js :255-258) runs Diagram.encode,
  // whose `import zlib from 'zlib'` resolves in the renderer bundle to
  // vite's empty browser-external stub, so zlib.deflateSync throws and
  // the renderDiagram catch writes '< Invalid Diagram >' — the consented
  // artifact carries the error text instead of the promised plantuml.com
  // img. Verified 2026-11-25: dist/assets/plantuml-*.js imports
  // __vite-browser-external for its zlib binding (stub exports {}), and
  // the probed artifact contains 'Invalid Diagram'. Fixing it needs a
  // production change (browser deflate for Diagram.encode) — outside this
  // verification-scoped change. test.fail() keeps the pin executable: it
  // passes only while the regression exists and flips red the moment the
  // consented render heals, forcing re-scope.
  test.fail('plantuml consent: the card names the remote address and count before render; Confirm yields exactly one plantuml.com reference', async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as any
      w.__written = []
      w.__mockInvoke['plugin:dialog|save'] = () => '/tmp/consent-flow/diagram.html'
      w.__mockInvoke['mt_fs_write'] = (args: any) => {
        w.__written.push({ path: args?.path, content: args?.content })
        return null
      }
    })

    await bootEditor(page)
    await openFileTab(page, '/tmp/consent-flow/diagram.md', PLANTUML_DOC)
    await startExport(page)

    // The disclosure names the remote address and the per-diagram count
    // before any render — no write exists while the card is up.
    const card = page.locator('.notification-card', { hasText: PLANTUML_CARD_TITLE })
    await expect(card).toBeVisible()
    await expect(card).toContainText('1 PlantUML diagram(s)')
    await expect(card).toContainText(PLANTUML_ADDRESS)
    expect(await page.evaluate(() => (window as any).__written)).toHaveLength(0)

    await page.locator('.notification-card .action-btn', { hasText: PLANTUML_CONFIRM_LABEL }).click()
    const entry = await firstWrite(page)
    expect(entry.path).toBe('/tmp/consent-flow/diagram.html')

    // Exactly one plantuml.com reference — the src string the offline
    // renderer builds (plantuml.js :54, no network dependency) — and no
    // declined placeholder block.
    expect(entry.content.match(/plantuml\.com/g) ?? []).toHaveLength(1)
    expect(entry.content).toContain('src="https://www.plantuml.com/plantuml/svg/~1')
    expect(entry.content).not.toContain('ag-plantuml-export-source')
  })

  test('plantuml consent: Cancel yields the pinned source placeholder with no plantuml.com URL in the artifact', async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as any
      w.__written = []
      w.__mockInvoke['plugin:dialog|save'] = () => '/tmp/consent-flow/diagram.html'
      w.__mockInvoke['mt_fs_write'] = (args: any) => {
        w.__written.push({ path: args?.path, content: args?.content })
        return null
      }
    })

    await bootEditor(page)
    await openFileTab(page, '/tmp/consent-flow/diagram.md', PLANTUML_DOC)
    await startExport(page)

    await expect(page.locator('.notification-card', { hasText: PLANTUML_CARD_TITLE })).toBeVisible()
    await page.locator('.notification-card .action-btn', { hasText: PLANTUML_CANCEL_LABEL }).click()
    const entry = await firstWrite(page)

    // The pinned declined shape: exactly one pre.ag-plantuml-export-source
    // holding the escaped literal diagram source; the remote address
    // appears nowhere in the artifact.
    expect(entry.content.match(/<pre class="ag-plantuml-export-source">/g) ?? []).toHaveLength(1)
    expect(entry.content).toContain('@startuml')
    expect(entry.content).toContain('A -&gt; B')
    expect(entry.content).toContain('@enduml')
    expect(entry.content).not.toContain('plantuml.com')
  })

  test('plantuml consent: a document without plantuml fences raises no card and writes the plain artifact', async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as any
      w.__written = []
      w.__mockInvoke['plugin:dialog|save'] = () => '/tmp/consent-flow/plain.html'
      w.__mockInvoke['mt_fs_write'] = (args: any) => {
        w.__written.push({ path: args?.path, content: args?.content })
        return null
      }
    })

    await bootEditor(page)
    await openFileTab(page, '/tmp/consent-flow/plain.md', PLAIN_DOC)
    await startExport(page)

    const entry = await firstWrite(page)
    expect(entry.path).toBe('/tmp/consent-flow/plain.html')

    // Count 0 skips both dialogs entirely — no consent card ever mounts.
    await expect(page.locator('.notification-card', { hasText: PLANTUML_CARD_TITLE })).toHaveCount(0)
    await expect(page.locator('.notification-card', { hasText: EMBED_CARD_TITLE })).toHaveCount(0)
    expect(entry.content).not.toContain('ag-plantuml-export-source')
    expect(entry.content).not.toContain('plantuml.com')
  })
})
