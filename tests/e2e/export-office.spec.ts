// FILE: tests/e2e/export-office.spec.ts
// START_MODULE_CONTRACT
//   PURPOSE: C-NATIVE-DOCX-RTF-EXPORT — invoke-order traces against the
//   real renderer + tauri shim. Export to Word (File › Export to Word…,
//   modal-less R-1): NO export-settings dialog ever opens (owner decision
//   2026-10-23); plugin:dialog|save (Word filter, .md→.docx default name)
//   → mt_fs_write_binary (the ipc runtime normalizes
//   mt::fs::write_binary) with the converted bytes (docx ZIP magic);
//   mt_print_webview / mt_export_pdf are NEVER invoked (R-3); a cancelled
//   save dialog writes nothing and notifies nobody. Tab context menu
//   (R-2): the popup spec carries Export to PDF/HTML/Word after the file
//   block, gated on pathname exactly like Copy path; clicking Export to
//   Word on a background tab activates that tab and exports ITS buffer
//   (both the filename and output content are checked).
//   C-EXPORT-BOUNDARIES-DOCX adds the consent-flow intent on the docx
//   door: the embed-consent and PlantUML-consent cards gate the
//   save-then-write flow before the store dispatch, Confirm writes a ZIP
//   whose media carries exactly the granted images, Cancel keeps the
//   declined bytes absent with the honest {embedded}/{total} notice, and
//   the PlantUML card's Cancel keeps the literal source with no
//   plantuml.com string in word/document.xml.
//   SCOPE: Real built renderer, tauri-shim save/write/stat/read doubles,
//   the mt_fs_write_binary ZIP double unpacked with JSZip, the real
//   notification-stack consent cards, no network.
//   DEPENDS: Playwright, tauri shim and editor boot helpers, JSZip.
//   LINKS: M-066, .grace/changes/active/C-EXPORT-BOUNDARIES-DOCX,
//   C-NATIVE-DOCX-RTF-EXPORT, C-EXPORT-BOUNDARIES,
//   C-EXPORT-DOCUMENT-PIN
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   DOC - the consent-free Word-export fixture document (bold, кириллица и中文, tasks, quote, math, footnote).
//   PNG_BYTES - the PNG signature bytes the fs bridge "returns from disk" for the in-directory sibling (byte identity, not image validity).
//   OUTSIDE_BYTES - distinct fixture bytes for the out-of-directory file; byte identity proves the right file's bytes.
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
import JSZip from 'jszip'

const DOC = [
  '# Word export spec',
  '',
  'body with **bold** text, кириллица и中文',
  '',
  '- [ ] task open',
  '- [x] task done',
  '',
  '> quote block',
  '',
  'Inline math $E = mc^2$.',
  '',
  'Footnote here[^1].',
  '',
  '[^1]: The footnote body.'
].join('\n')

test.describe('export to word and the tab-menu export group', () => {
  test.beforeEach(async ({ page }) => {
    await installTauriShim(page)
  })

  test('Export to Word… is modal-less: save dialog → write_binary, never a settings dialog, never the print surface', async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as any
      w.__saveCalls = []
      w.__writeCalls = []
      w.__mockInvoke['plugin:dialog|save'] = (args: any) => {
        w.__saveCalls.push(args?.options ?? null)
        return '/tmp/mark-e2e-out.docx'
      }
      w.__mockInvoke['mt_fs_write_binary'] = (args: any) => {
        w.__writeCalls.push(args ?? null)
      }
    })

    await bootEditor(page)
    await openFileTab(page, '/tmp/word-flow.md', DOC)

    await page.evaluate(() => {
      ;(window as any).__invokeLog = []
      ;(window as any).__emitFakeEvent('mt::menu-invoked', 'file.export-file-docx')
    })

    await page.waitForFunction(
      () => (window as any).__invokeLog?.includes('mt_fs_write_binary')
    )

    // R-1 pin: the settings dialog never mounts on the docx path.
    await expect(page.locator('.el-dialog')).toHaveCount(0)

    const saveCalls = await page.evaluate(() => (window as any).__saveCalls)
    expect(saveCalls).toHaveLength(1)
    expect(saveCalls[0]).toMatchObject({
      filters: [{ name: 'Word', extensions: ['docx'] }]
    })
    expect(saveCalls[0].defaultPath).toBe('word-flow.docx')

    // The written bytes are a real docx (ZIP magic) at the chosen path.
    const writes = await page.evaluate(() => (window as any).__writeCalls)
    expect(writes).toHaveLength(1)
    expect(writes[0].path).toBe('/tmp/mark-e2e-out.docx')
    const bytes = new Uint8Array(writes[0].data)
    expect(bytes.length).toBeGreaterThan(1000)
    expect(bytes[0]).toBe(0x50) // 'P'
    expect(bytes[1]).toBe(0x4b) // 'K'

    const log = await page.evaluate(() => (window as any).__invokeLog)
    const relevant = log.filter(
      (c: string) =>
        c === 'mt_print_webview' ||
        c === 'mt_export_pdf' ||
        c === 'plugin:dialog|save' ||
        c === 'mt_fs_write_binary'
    )
    expect(relevant).toEqual(['plugin:dialog|save', 'mt_fs_write_binary'])
  })

  test('a cancelled save dialog converts nothing, writes nothing, shows nothing (corner C-12)', async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as any
      w.__writeCalls = []
      w.__mockInvoke['plugin:dialog|save'] = () => null
      w.__mockInvoke['mt_fs_write_binary'] = (args: any) => {
        w.__writeCalls.push(args ?? null)
      }
    })

    await bootEditor(page)
    await openFileTab(page, '/tmp/word-cancel.md', DOC)

    await page.evaluate(() => {
      ;(window as any).__invokeLog = []
      ;(window as any).__emitFakeEvent('mt::menu-invoked', 'file.export-file-docx')
    })

    // The save dialog resolves (to null) quickly; give the flow a beat,
    // then pin that nothing was written and no dialog ever mounted.
    await page.waitForTimeout(500)
    const writes = await page.evaluate(() => (window as any).__writeCalls)
    expect(writes).toHaveLength(0)
    await expect(page.locator('.el-dialog')).toHaveCount(0)
  })

  test('tab context menu: the export group sits after the file block, gated on pathname; a background-tab Word export activates that tab first', async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as any
      w.__saveCalls = []
      w.__writeCalls = []
      w.__popupSpecs = []
      w.__mockInvoke['mt_window_popup_context_menu'] = (args: any) => {
        // the electron shim may wrap positional args; unwrap defensively
        const spec = args && args.items ? args : (args?.args?.[0] ?? {})
        w.__popupSpecs.push(spec)
        return 'tabExportDocx'
      }
      w.__mockInvoke['plugin:dialog|save'] = (args: any) => {
        w.__saveCalls.push(args?.options ?? null)
        return '/tmp/mark-e2e-tab.docx'
      }
      w.__mockInvoke['mt_fs_write_binary'] = (args: any) => {
        w.__writeCalls.push(args ?? null)
      }
    })

    await bootEditor(page)
    // First tab stays in the background; the second one is active.
    await openFileTab(page, '/tmp/word-bg.md', DOC)
    await openFileTab(page, '/tmp/word-fg.md', '# Foreground\n')

    await page.evaluate(() => {
      ;(window as any).__invokeLog = []
    })
    await page.locator('li[data-id][title="/tmp/word-bg.md"]').click({ button: 'right' })

    await page.waitForFunction(
      () => (window as any).__invokeLog?.includes('mt_fs_write_binary')
    )

    const specs = await page.evaluate(() => (window as any).__popupSpecs)
    expect(specs).toHaveLength(1)
    const items = specs[0].items
    const ids = items.map((i: any) => i.id)
    expect(ids).toContain('tabExportPdf')
    expect(ids).toContain('tabExportHtml')
    expect(ids).toContain('tabExportDocx')
    const lastSeparator = items.map((i: any) => i.type).lastIndexOf('separator')
    expect(items.findIndex((i: any) => i.id === 'tabExportPdf')).toBeGreaterThan(lastSeparator)
    expect(items.find((i: any) => i.id === 'tabExportDocx').enabled).toBe(true)

    // Filename selection and actual document content must identify the same tab.
    const saveCalls = await page.evaluate(() => (window as any).__saveCalls)
    expect(saveCalls).toHaveLength(1)
    expect(saveCalls[0].defaultPath).toBe('word-bg.docx')
    const writes = await page.evaluate(() => (window as any).__writeCalls)
    expect(writes).toHaveLength(1)
    const zip = await JSZip.loadAsync(new Uint8Array(writes[0].data))
    const documentXml = await zip.file('word/document.xml')!.async('string')
    const documentText = await page.evaluate(xml => {
      const doc = new DOMParser().parseFromString(xml, 'application/xml')
      return Array.from(doc.getElementsByTagName('w:t')).map(node => node.textContent).join('')
    }, documentXml)
    expect(documentText).toContain('Word export spec')
    expect(documentText).toContain('кириллица и中文')
    expect(documentText).not.toContain('Foreground')

    // The modal-less pin holds on the tab-menu door too.
    await expect(page.locator('.el-dialog')).toHaveCount(0)
  })

  for (const format of ['Pdf', 'Html']) {
    test(`a background-tab ${format} export goes directly to Save for the selected document`, async ({ page }) => {
      await page.addInitScript(kind => {
        const w = window as any
        w.__saveCalls = []
        w.__invokeLog = []
        w.__exportedContent = []
        w.__mockInvoke.mt_window_popup_context_menu = () => `tabExport${kind}`
        w.__mockInvoke['plugin:dialog|save'] = (args: any) => {
          w.__saveCalls.push(args.options)
          return `/tmp/background.${args.options.filters[0].extensions[0]}`
        }
        w.__mockInvoke.mt_export_pdf = () => {
          w.__exportedContent.push(document.querySelector('article.print-container')?.textContent ?? '')
        }
        w.__mockInvoke.mt_fs_write = (args: any) => {
          const html = new DOMParser().parseFromString(args?.content ?? '', 'text/html')
          w.__exportedContent.push(html.body.textContent)
        }
      }, format)
      await bootEditor(page)
      await openFileTab(page, '/tmp/background.md', '# Background document\n\nOwn buffer.\n')
      await openFileTab(page, '/tmp/foreground.md', '# Foreground document\n')
      await page.locator('li[data-id][title="/tmp/background.md"]').click({ button: 'right' })
      const write = format === 'Pdf' ? 'mt_export_pdf' : 'mt_fs_write'
      await expect.poll(() => page.evaluate(command => (window as any).__invokeLog.includes(command), write)).toBe(true)
      const calls = await page.evaluate(() => (window as any).__saveCalls)
      expect(calls).toHaveLength(1)
      expect(calls[0].defaultPath).toBe(`background.${format.toLowerCase()}`)
      const content = await page.evaluate(() => (window as any).__exportedContent)
      expect(content).toHaveLength(1)
      expect(content[0]).toContain('Background document')
      expect(content[0]).toContain('Own buffer.')
      expect(content[0]).not.toContain('Foreground document')
      await expect(page.locator('.el-dialog')).toHaveCount(0)
    })

    test(`titlebar ${format} quick export closes the popover and opens Save directly`, async ({ page }) => {
      await page.addInitScript(() => {
        const w = window as any
        w.__invokeLog = []
        w.__mockInvoke['plugin:dialog|save'] = (args: any) => `/tmp/popover.${args.options.filters[0].extensions[0]}`
      })
      await bootEditor(page)
      await openFileTab(page, '/tmp/popover.md', '# Popover export\n\nOwn buffer.\n')
      await page.locator('.title-bar .title').click()
      const popover = page.locator('.doc-info-popover')
      await expect(popover).toBeVisible()
      await popover.getByRole('button', { name: format === 'Pdf' ? 'Export as PDF' : 'Export as HTML', exact: true }).click()
      await expect(popover).toHaveCount(0)
      const write = format === 'Pdf' ? 'mt_export_pdf' : 'mt_fs_write'
      await expect.poll(() => page.evaluate(command => (window as any).__invokeLog.includes(command), write)).toBe(true)
      await expect(page.locator('.el-dialog')).toHaveCount(0)
    })
  }
})

// ──────────────────────────────────────────────────────────────────────
// C-EXPORT-BOUNDARIES-DOCX — the consent gates at the written-archive
// layer (the JSZip double). Documents reaching outside their directory
// or carrying exactly one ```plantuml fence go through the real renderer
// and the real notification-stack buttons into the mt_fs_write_binary
// ZIP double. The card strictly gates the save-then-write flow (the
// gates run in the handleExport docx branch before the store dispatch);
// decisions resolve through the card actions and are never persisted.
// Coverage-first pins: the behavior reds belong to archived
// C-EXPORT-BOUNDARIES' failing-first evidence; a red run of any pin
// below on the current tree is a regression discovery.
// ──────────────────────────────────────────────────────────────────────

// The PNG signature bytes the fs bridge "returns from disk" for the
// in-directory sibling, and distinct fixture bytes for the
// out-of-directory file — byte identity proves the right file's bytes.
const PNG_BYTES = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const OUTSIDE_BYTES = [0x42, 0x4d, 0x36, 0x00, 0x00, 0x00]
const OUTSIDE_PATH = '/tmp/word-flow-outside/secret.png'

const CONSENT_DOC = [
  '# Consent flow spec',
  '',
  'sibling ![shot](img/shot.png)',
  '',
  'outside ![secret](/tmp/word-flow-outside/secret.png)',
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

test.describe('docx-door consent gates gate the written archive (C-EXPORT-BOUNDARIES-DOCX)', () => {
  test.beforeEach(async ({ page }) => {
    await installTauriShim(page)
  })

  // The save/write doubles plus per-path stat/read doubles: every
  // requested path is recorded so the pins can prove the embed pass
  // touched only the in-scope sibling plus the granted outside file.
  const installWordImageDoubles = (page: import('@playwright/test').Page) =>
    page.addInitScript(
      ({ pngBytes, outsideBytes }: { pngBytes: number[]; outsideBytes: number[] }) => {
        const w = window as any
        w.__saveCalls = []
        w.__writeCalls = []
        w.__statPaths = []
        w.__readPaths = []
        w.__mockInvoke['plugin:dialog|save'] = (args: any) => {
          w.__saveCalls.push(args?.options ?? null)
          return '/tmp/mark-e2e-consent.docx'
        }
        w.__mockInvoke['mt_fs_stat'] = (args: any) => {
          w.__statPaths.push(args?.path)
          if (args?.path === '/tmp/word-flow/img/shot.png') {
            return { size: pngBytes.length, mode: 0o100644, mtimeMs: 0, isFile: true, isDirectory: false, isSymbolicLink: false }
          }
          if (args?.path === '/tmp/word-flow-outside/secret.png') {
            return { size: outsideBytes.length, mode: 0o100644, mtimeMs: 0, isFile: true, isDirectory: false, isSymbolicLink: false }
          }
          return { isFile: false, isDirectory: false }
        }
        w.__mockInvoke['mt_fs_read_binary'] = (args: any) => {
          w.__readPaths.push(args?.path)
          if (args?.path === '/tmp/word-flow/img/shot.png') return pngBytes
          if (args?.path === '/tmp/word-flow-outside/secret.png') return outsideBytes
          return null
        }
        w.__mockInvoke['mt_fs_write_binary'] = (args: any) => {
          w.__writeCalls.push(args ?? null)
        }
      },
      { pngBytes: PNG_BYTES, outsideBytes: OUTSIDE_BYTES }
    )

  const startDocxExport = async (page: import('@playwright/test').Page) => {
    await page.evaluate(() => {
      ;(window as any).__invokeLog = []
      // Scope the per-path recordings to the export flow: the live
      // preview already resolved the images through the bridge at
      // tab-open, before any export exists.
      ;(window as any).__statPaths = []
      ;(window as any).__readPaths = []
      ;(window as any).__emitFakeEvent('mt::menu-invoked', 'file.export-file-docx')
    })
  }

  const waitBinaryWrite = (page: import('@playwright/test').Page) =>
    page.waitForFunction(() => (window as any).__invokeLog?.includes('mt_fs_write_binary'), undefined, {
      timeout: 15_000
    })

  const mediaPartBytes = async (zip: JSZip) => {
    const names = Object.keys(zip.files).filter((name) => name.startsWith('word/media/'))
    const bytes = await Promise.all(names.map((name) => zip.file(name)!.async('uint8array')))
    return bytes.map((part) => Array.from(part))
  }

  test('embed consent: the card gates the save dialog flow; Confirm writes a ZIP whose media carries exactly the granted images', async ({ page }) => {
    await installWordImageDoubles(page)
    await bootEditor(page)
    await openFileTab(page, '/tmp/word-flow/consent.md', CONSENT_DOC)
    await startDocxExport(page)

    // The embed-consent card mounts before the save dialog resolves into
    // conversion — the gate runs in the handleExport docx branch.
    const card = page.locator('.notification-card', { hasText: EMBED_CARD_TITLE })
    await expect(card).toBeVisible()
    await expect(card).toContainText('1 image file(s) outside the document directory (/tmp/word-flow)')
    await expect(card).toContainText(OUTSIDE_PATH)
    expect(await page.evaluate(() => (window as any).__saveCalls)).toHaveLength(0)
    expect(await page.evaluate(() => (window as any).__writeCalls)).toHaveLength(0)

    await page.locator('.notification-card .action-btn', { hasText: EMBED_CONFIRM_LABEL }).click()
    await waitBinaryWrite(page)

    const writes = await page.evaluate(() => (window as any).__writeCalls)
    expect(writes).toHaveLength(1)
    const zip = await JSZip.loadAsync(new Uint8Array(writes[0].data))

    // The media carries exactly the granted images, byte-identical to
    // their fixtures (the converter preserves the data-URL bytes).
    const mediaArrays = await mediaPartBytes(zip)
    expect(mediaArrays).toHaveLength(2)
    expect(mediaArrays).toContainEqual(PNG_BYTES)
    expect(mediaArrays).toContainEqual(OUTSIDE_BYTES)

    // The save-then-write order stays the pinned one.
    const log = await page.evaluate(() => (window as any).__invokeLog)
    const relevant = log.filter(
      (c: string) =>
        c === 'mt_print_webview' ||
        c === 'mt_export_pdf' ||
        c === 'plugin:dialog|save' ||
        c === 'mt_fs_write_binary'
    )
    expect(relevant).toEqual(['plugin:dialog|save', 'mt_fs_write_binary'])

    // The two-phase recording contract (see the html door): the C-21
    // dead-link checker stats the relative sibling through the same
    // bridge (debounced, once per run), absolute dests are skipped, so
    // the sibling's stat count is not a single-fire claim under load.
    // Deterministic pins: the exact ordered read surface (the embed
    // pass's per-path outcome cache) and exactly one stat + read of the
    // outside path.
    const imageStatPaths = ((await page.evaluate(() => (window as any).__statPaths)) as string[]).filter((p) => p !== '/tmp/word-flow/consent.md')
    expect([...new Set(imageStatPaths)]).toEqual(['/tmp/word-flow/img/shot.png', '/tmp/word-flow-outside/secret.png'])
    expect(imageStatPaths.filter((p) => p === '/tmp/word-flow-outside/secret.png')).toHaveLength(1)
    const imageReadPaths = ((await page.evaluate(() => (window as any).__readPaths)) as string[]).filter((p) => p !== '/tmp/word-flow/consent.md')
    expect(imageReadPaths).toEqual(['/tmp/word-flow/img/shot.png', '/tmp/word-flow-outside/secret.png'])
    expect(imageReadPaths.filter((p) => p === '/tmp/word-flow-outside/secret.png')).toHaveLength(1)
  })

  test('embed consent: Cancel writes a ZIP with the outside bytes absent, the in-scope sibling present and the honest notice', async ({ page }) => {
    await installWordImageDoubles(page)
    await bootEditor(page)
    await openFileTab(page, '/tmp/word-flow/consent.md', CONSENT_DOC)
    await startDocxExport(page)

    await expect(page.locator('.notification-card', { hasText: EMBED_CARD_TITLE })).toBeVisible()
    await page.locator('.notification-card .action-btn', { hasText: EMBED_CANCEL_LABEL }).click()
    await waitBinaryWrite(page)

    const writes = await page.evaluate(() => (window as any).__writeCalls)
    expect(writes).toHaveLength(1)
    const zip = await JSZip.loadAsync(new Uint8Array(writes[0].data))

    // Declined: no media part carries the outside bytes; the in-scope
    // sibling still lands.
    const mediaArrays = await mediaPartBytes(zip)
    expect(mediaArrays).toHaveLength(1)
    expect(mediaArrays).toContainEqual(PNG_BYTES)
    expect(mediaArrays).not.toContainEqual(OUTSIDE_BYTES)

    // Declined references cost zero I/O (the outside path is
    // link-check-immune too — linkCheck.js :165 skips absolute dests).
    expect(await page.evaluate(() => (window as any).__statPaths)).not.toContain(OUTSIDE_PATH)
    expect(await page.evaluate(() => (window as any).__readPaths)).not.toContain(OUTSIDE_PATH)

    // The sibling's embed read is single-fire — image reads belong to
    // the embed pass alone, the C-21 link checker only stats.
    const imageReadPaths = ((await page.evaluate(() => (window as any).__readPaths)) as string[]).filter((p) => p !== '/tmp/word-flow/consent.md')
    expect(imageReadPaths).toEqual(['/tmp/word-flow/img/shot.png'])

    // The honest skip notice: the exact {embedded}/{total} pair with the
    // declined reference counted as skipped — counts only.
    await expect(page.locator('.notification-card', { hasText: 'Some images were not embedded' })).toBeVisible()
    await expect(page.locator('.notification-card', { hasText: '1 of 2 images embedded' })).toBeVisible()

    // The save/write invoke order stays the pinned one.
    const log = await page.evaluate(() => (window as any).__invokeLog)
    const relevant = log.filter(
      (c: string) =>
        c === 'mt_print_webview' ||
        c === 'mt_export_pdf' ||
        c === 'plugin:dialog|save' ||
        c === 'mt_fs_write_binary'
    )
    expect(relevant).toEqual(['plugin:dialog|save', 'mt_fs_write_binary'])
  })

  test('plantuml consent: the card disclosure rides the docx flow; Cancel keeps the literal source with no plantuml.com string', async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as any
      w.__saveCalls = []
      w.__writeCalls = []
      w.__mockInvoke['plugin:dialog|save'] = (args: any) => {
        w.__saveCalls.push(args?.options ?? null)
        return '/tmp/mark-e2e-consent.docx'
      }
      w.__mockInvoke['mt_fs_write_binary'] = (args: any) => {
        w.__writeCalls.push(args ?? null)
      }
    })

    await bootEditor(page)
    await openFileTab(page, '/tmp/word-flow/diagram.md', PLANTUML_DOC)
    await startDocxExport(page)

    // The same disclosure (address + count) mounts before conversion —
    // no save dialog resolves and no write exists while the card is up.
    const card = page.locator('.notification-card', { hasText: PLANTUML_CARD_TITLE })
    await expect(card).toBeVisible()
    await expect(card).toContainText('1 PlantUML diagram(s)')
    await expect(card).toContainText(PLANTUML_ADDRESS)
    expect(await page.evaluate(() => (window as any).__saveCalls)).toHaveLength(0)
    expect(await page.evaluate(() => (window as any).__writeCalls)).toHaveLength(0)

    await page.locator('.notification-card .action-btn', { hasText: PLANTUML_CANCEL_LABEL }).click()
    await waitBinaryWrite(page)

    const writes = await page.evaluate(() => (window as any).__writeCalls)
    expect(writes).toHaveLength(1)
    const zip = await JSZip.loadAsync(new Uint8Array(writes[0].data))
    const documentXml = await zip.file('word/document.xml')!.async('string')
    const documentText = await page.evaluate(xml => {
      const doc = new DOMParser().parseFromString(xml, 'application/xml')
      return Array.from(doc.getElementsByTagName('w:t')).map(node => node.textContent).join('')
    }, documentXml)

    // The literal diagram source survives; the remote address appears
    // nowhere in the document text.
    expect(documentText).toContain('@startuml')
    expect(documentText).toContain('A -> B')
    expect(documentText).toContain('@enduml')
    expect(documentText).not.toContain('plantuml.com')
  })

  test('plantuml consent: Confirm resolves the card and writes a valid ZIP; the consented form stays unit-pinned and html-door proven', async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as any
      w.__saveCalls = []
      w.__writeCalls = []
      w.__mockInvoke['plugin:dialog|save'] = (args: any) => {
        w.__saveCalls.push(args?.options ?? null)
        return '/tmp/mark-e2e-consent.docx'
      }
      w.__mockInvoke['mt_fs_write_binary'] = (args: any) => {
        w.__writeCalls.push(args ?? null)
      }
    })

    await bootEditor(page)
    await openFileTab(page, '/tmp/word-flow/diagram.md', PLANTUML_DOC)
    await startDocxExport(page)

    await expect(page.locator('.notification-card', { hasText: PLANTUML_CARD_TITLE })).toBeVisible()
    await page.locator('.notification-card .action-btn', { hasText: PLANTUML_CONFIRM_LABEL }).click()
    await waitBinaryWrite(page)

    // The converter is offline by construction; the substantive consented
    // muya-HTML form is proven by the html-door e2e and the unit
    // decision-handoff pins. This leg pins the card resolution plus a
    // real, valid ZIP (the existing PK-magic canon).
    const writes = await page.evaluate(() => (window as any).__writeCalls)
    expect(writes).toHaveLength(1)
    expect(writes[0].path).toBe('/tmp/mark-e2e-consent.docx')
    const bytes = new Uint8Array(writes[0].data)
    expect(bytes[0]).toBe(0x50) // 'P'
    expect(bytes[1]).toBe(0x4b) // 'K'
    const zip = await JSZip.loadAsync(new Uint8Array(writes[0].data))
    expect(zip.file('word/document.xml')).toBeTruthy()
    expect(await page.evaluate(() => (window as any).__saveCalls)).toHaveLength(1)
  })

  test('plantuml consent: a document without plantuml fences raises no card on the docx flow either', async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as any
      w.__saveCalls = []
      w.__writeCalls = []
      w.__mockInvoke['plugin:dialog|save'] = (args: any) => {
        w.__saveCalls.push(args?.options ?? null)
        return '/tmp/mark-e2e-consent.docx'
      }
      w.__mockInvoke['mt_fs_write_binary'] = (args: any) => {
        w.__writeCalls.push(args ?? null)
      }
    })

    await bootEditor(page)
    await openFileTab(page, '/tmp/word-flow/plain.md', PLAIN_DOC)
    await startDocxExport(page)
    await waitBinaryWrite(page)

    // Count 0 skips both dialogs entirely — no consent card ever mounts.
    await expect(page.locator('.notification-card', { hasText: PLANTUML_CARD_TITLE })).toHaveCount(0)
    await expect(page.locator('.notification-card', { hasText: EMBED_CARD_TITLE })).toHaveCount(0)
    expect(await page.evaluate(() => (window as any).__saveCalls)).toHaveLength(1)
    expect(await page.evaluate(() => (window as any).__writeCalls)).toHaveLength(1)
  })
})
