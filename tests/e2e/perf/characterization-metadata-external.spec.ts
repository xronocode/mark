// FILE: tests/e2e/perf/characterization-metadata-external.spec.ts
// VERSION: 1.2.0
// START_MODULE_CONTRACT
//   PURPOSE: Freeze the CURRENT metadata / external-change / byte-policy / rename-Move-To / live-reference behavior of the renderer store (C-LARGE-DOC-STAGE-0 R-6/R-7, task T-007) so a later large-document refactor cannot change it invisibly — every known-defect family is recorded as today's fact (observedLegacyBehavior) plus a future gate (desiredInvariant), never as an approved oracle.
//   SCOPE: Renderer-only harness (vite preview + tauri shim): named tabs opened through the real mt::open-new-tab payload; line-ending/encoding/final-newline metadata changed through the real SET_LINE_ENDING store action and the mt::set-line-ending / mt::set-file-encoding / mt::set-final-newline bus channels; FILE_SAVE / FILE_SAVE_AS / CLOSE_TAB / RENAME / RESPONSE_FOR_RENAME / MOVE_FILE_TO through the real Pinia editor store (the title-bar inline rename dialog reached through the real bus 'rename' path); external changes delivered through the real mt::watch::event {kind, paths} watcher shape and the mt_fs_read disk transport; byte-policy fixtures read from the repository (utf8.md / utf8-bom.md / utf8-crlf.md); live-reference alias matrix (tab identity, history snapshot separation, listToc/toc copies, source-mode mirror); an exported dependency-free cursor/TOC DTO scaffold (future contract, explicitly not wired into the runtime). Only backend transports are mocked (window.__mockInvoke, window.fileUtils.move, the directory picker). No production code, shared fixture or config is touched; the suite freezes observations only.
//   DEPENDS: Playwright webkit-perf project, tests/e2e/fixtures/tauri-shim.ts, tests/e2e/perf/helpers/experimental (the fixtures/helpers bootEditor pass-through, plus the WAVEA_EXPERIMENTAL=1 real-UI progressive-toggle enabling — C-LARGE-DOC-WAVE-A T-006), src/renderer/src/store/editor.js (SET_LINE_ENDING, FILE_SAVE, FILE_SAVE_AS, APPLY_SAVE_OUTCOME, CLOSE_TAB, RENAME, RESPONSE_FOR_RENAME, MOVE_FILE_TO, APPLY_FILE_CHANGE, loadChange), src/renderer/src/store/diffSnapshots.js, src/renderer/src/store/project.js watcher translation, src/renderer/src/components/rename/index.vue (inline-rename dialog), src/renderer/src/components/titleBar/index.vue (rename entry point), src/renderer/src/util/listToTree.js (TOC tree copies).
//   LINKS: M-060, M-011, M-012
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   E2E_ROOT - the only disk namespace the suite uses for named tabs (/tmp/mark-e2e).
//   BYTE_DIR - repository-relative byte-policy fixture directory.
//   readFixture - reads one fixture from BYTE_DIR as raw bytes.
//   decodeLikeBackend - UTF-8 bytes to JS string with a leading BOM stripped, mirroring M-014.
//   UTF8_PLAIN - decoded text of the committed utf8.md fixture.
//   UTF8_BOM_RAW - raw bytes of the committed utf8-bom.md fixture (BOM included).
//   UTF8_BOM_TEXT - production-decoded text of utf8-bom.md (BOM stripped).
//   UTF8_CRLF_RAW - raw bytes of the committed utf8-crlf.md fixture (CRLF included).
//   UTF8_CRLF_TEXT - production-decoded text of utf8-crlf.md (CRLF preserved by decode).
//   DEFAULT_OPEN_METADATA - the metadata shape build_open_new_tab_payload always sends (utf8/no BOM, lf, no save adjust, trim option 3).
//   TabState - serializable per-tab snapshot returned by readTabs.
//   openTab - emits the real mt::open-new-tab event with the production payload shape and waits for the tab.
//   readTabs - returns a serializable snapshot of every tab (markdown, dirty flag, revision, metadata, notifications, cursor).
//   tabByPath - picks one tab snapshot by pathname.
//   dirtyThroughEditor - clicks the last paragraph and types until the active tab reports isSaved=false.
//   settleFrames - waits two animation frames so store updates from the editor flush.
//   installInvokeLog - installs window.__invokeLog before boot so every tauri command name is recorded.
//   saveInvocations - filters the invoke log to save/write/temp/backup/recovery command names.
//   installSaveSuccess - installs a success-returning mt_response_file_save mock capturing args.
//   installSaveReject - installs a throwing mt_response_file_save mock counting attempts.
//   saveCalls - returns the captured mt_response_file_save arguments.
//   callFileSave - invokes the real FILE_SAVE action without awaiting it.
//   callStore - invokes any real editor-store action without awaiting it.
//   installMoveSpy - overrides window.fileUtils.move with a recording success/reject transport.
//   moveCalls - returns the recorded window.fileUtils.move calls.
//   installDirectoryPicker - overrides plugin:dialog|open with a recording directory-picker reply.
//   dialogCalls - returns the recorded plugin:dialog|open arguments.
//   openRenameDialog - runs the real RESPONSE_FOR_RENAME entry and waits for the inline rename input.
//   installDeferredSave - installs a save transport whose promise stays pending until resolved by the test.
//   resolveDeferredSave - resolves every pending deferred save acknowledgement.
//   pendingSaveCount - number of save acknowledgements still pending.
//   collectMarkers - collects the real live-reload, diff-snapshot and diff-baseline console markers.
//   expectMarker - polls until a marker line containing a substring appears and returns it.
//   fixtureBytes - hex encoding of a fixture's raw bytes for byte-identity assertions.
//   CHARACTERIZATION_DTO_VERSION - version tag of the future cursor/TOC DTO contract.
//   CursorDto - explicit-field future cursor DTO shape.
//   TocEntryDto - explicit-field future TOC entry DTO shape.
//   TocDto - explicit-field future TOC DTO shape.
//   buildCursorDto - pure live-cursor to CursorDto normalizer (drops undocumented fields).
//   buildTocDto - pure live toc-tree to TocDto normalizer (drops parent links and undocumented fields).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   CURRENT: 2026-11-11 C-METADATA-SAVE-SAFETY: repaired metadata false-clean,
//   close and source-format transport cases assert desired invariants. Separate
//   external equality, Rename/Move, physical order and durability families remain.
//   CURRENT: 2026-11-10 C-STABILIZE-DIRTY-CHARACTERIZATION: external-event
//   observations follow the implemented dirty-buffer preservation contract;
//   seeded determinism and all timing/performance boundaries remain intact.
//   LAST_CHANGE: v1.2.0 - 2026-11-02 C-LARGE-DOC-WAVE-A T-006: added the
//   WAVEA_EXPERIMENTAL beforeAll hook — bootEditor now imports through
//   tests/e2e/perf/helpers/experimental so WAVEA_EXPERIMENTAL=1 enables
//   the session-latched progressive-mount toggle through the real Settings
//   UI after every boot (no-op without the env var). Zero assertion
//   changes: the suite freezes the same boundaries on both paths.
//   v1.1.0 - 2026-10-27 C-LARGE-DOC-STAGE-0 T-007 follow-up:
//   added the rename / Move To characterization group (the title-bar inline
//   rename confirm calls the undefined editorStore.rename and throws; cancel
//   paths are no-ops; direct RENAME and successful Move To clear the dirty
//   flag without a save and close discards the edit; a Move To failure keeps
//   the buffer with a "Move failed" notice; a pending save acknowledgement
//   resolves against the pre-move pathname and reverts a completed rename or
//   Move To) and the live-reference alias + DTO scaffold group (currentFile
//   is the tab entry, history entries own separate blocks/cursor snapshots,
//   toc is a copied tree over listToc, the source-mode CodeMirror map mirrors
//   markdown by value, a source-mode round trip mints a history entry and a
//   revision bump, and the exported stage0-dto/1 builders are shape-tested
//   but deliberately not wired into the runtime).
//   v1.0.0 - 2026-10-27 C-LARGE-DOC-STAGE-0 T-007: initial
//   characterization suite. Freezes: metadata changes never reach the
//   FILE_SAVE transport and falsely mark a dirty tab clean; EOL/final-
//   newline metadata followed by close drops the edit without a prompt;
//   external rewrites reload with a pre-reload diff baseline; BOM-only
//   external rewrites compare equal (string-only equality) while EOL-only
//   rewrites reload and normalize; Save carries a JS string so BOM/CRLF
//   bytes are lost on writeback; a rejected save leaves the tab dirty with
//   no temp/WAL recovery path and stays retryable; Save As onto a path
//   owned by another tab silently takes the path with the destination
//   never stat'ed; navigation does not dirty the tab after the focus click
//   (the click itself bumps contentRevision once); a delete event marks the
//   tab dirty and leaves it open; an external rewrite overwrites a dirty
//   buffer silently (liveReload on).
// END_CHANGE_SUMMARY

import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { installTauriShim } from '../fixtures/tauri-shim'
// C-LARGE-DOC-WAVE-A T-006: bootEditor comes from the Wave A experimental
// helper — byte-for-byte the shared fixture when WAVEA_EXPERIMENTAL is
// unset; with WAVEA_EXPERIMENTAL=1 every boot also enables the
// session-latched progressive-mount toggle through the REAL Settings UI,
// so the whole suite reruns on the progressive path with ZERO assertion
// changes (the beforeAll hook below arms it).
import { bootEditor, waveaExperimentalBeforeAll } from './helpers/experimental'

// C-LARGE-DOC-WAVE-A T-006: the WAVEA_EXPERIMENTAL=1 characterization
// rerun hook — arms the bootEditor wrapper's real-UI toggle enabling
// (no-op without the env var); no assertion changes.
test.beforeAll(() => {
  waveaExperimentalBeforeAll()
})

const E2E_ROOT = '/tmp/mark-e2e'

const BYTE_DIR = 'tests/e2e/fixtures/large-doc/byte-policy'
const readFixture = (name: string): Buffer => readFileSync(resolve(BYTE_DIR, name))

// Mirrors M-014 detect_and_decode for a UTF-8 fixture: the bytes are decoded
// to a JS string and a leading BOM is stripped before the renderer ever sees
// them. Legacy non-UTF fixtures decode lossily through chardet/encoding_rs;
// the committed UTF-8 BOM fixture exercises the same strip.
const decodeLikeBackend = (raw: Buffer): string =>
  raw.toString('utf8').replace(/^\uFEFF/, '')

const UTF8_PLAIN = readFixture('utf8.md').toString('utf8')
const UTF8_BOM_RAW = readFixture('utf8-bom.md')
const UTF8_BOM_TEXT = decodeLikeBackend(UTF8_BOM_RAW)
const UTF8_CRLF_RAW = readFixture('utf8-crlf.md')
const UTF8_CRLF_TEXT = decodeLikeBackend(UTF8_CRLF_RAW)

// Default UTF8/LF fixture metadata. Byte-policy cases provide the actual source
// metadata now supplied by the shared native open; this browser is not a decoder.
const DEFAULT_OPEN_METADATA = {
  encoding: { encoding: 'utf8', isBom: false },
  lineEnding: 'lf',
  adjustLineEndingOnSave: false,
  trimTrailingNewline: 3
}

interface TabState {
  id: string
  pathname: string
  filename: string
  markdown: string
  isSaved: boolean
  contentRevision: number
  encoding: { encoding: string | null, isBom: boolean | null }
  lineEnding: string | null
  adjustLineEndingOnSave: boolean | null
  trimTrailingNewline: number | null
  lastSavedHistoryId: number | null
  notifications: Array<{ msg: string, style: string, showConfirm: boolean, exclusiveType: string | null }>
  cursor: { anchor: [string, number], focus: [string, number] } | null
}

async function openTab (page: Page, pathname: string, markdown: string, metadata = DEFAULT_OPEN_METADATA): Promise<void> {
  const filename = pathname.split('/').pop() || pathname
  await page.evaluate(({ p, md, fn, meta }: {
    p: string
    md: string
    fn: string
    meta: typeof DEFAULT_OPEN_METADATA
  }) => {
    ;(window as any).__emitFakeEvent('mt::open-new-tab', {
      markdown: md,
      filename: fn,
      pathname: p,
      ...meta,
      cursor: null,
      isMixedLineEndings: false,
      previewMode: false
    })
  }, { p: pathname, md: markdown, fn: filename, meta: metadata })
  await page.waitForFunction((p: string) => {
    const store = (document.querySelector('#app') as any).__vue_app__
      .config.globalProperties.$pinia._s.get('editor')
    return Array.isArray(store.tabs) && store.tabs.some((t: any) => t.pathname === p)
  }, pathname, { timeout: 5_000 })
}

async function readTabs (page: Page): Promise<TabState[]> {
  return page.evaluate(() => {
    const store = (document.querySelector('#app') as any).__vue_app__
      .config.globalProperties.$pinia._s.get('editor')
    return store.tabs.map((t: any) => ({
      id: t.id,
      pathname: t.pathname,
      filename: t.filename,
      markdown: t.markdown,
      isSaved: t.isSaved,
      contentRevision: t.contentRevision ?? 0,
      encoding: {
        encoding: t.encoding?.encoding ?? null,
        isBom: t.encoding?.isBom ?? null
      },
      lineEnding: t.lineEnding ?? null,
      adjustLineEndingOnSave: t.adjustLineEndingOnSave ?? null,
      trimTrailingNewline: t.trimTrailingNewline ?? null,
      lastSavedHistoryId: t.lastSavedHistoryId ?? null,
      notifications: (t.notifications ?? []).map((n: any) => ({
        msg: n.msg,
        style: n.style,
        showConfirm: !!n.showConfirm,
        exclusiveType: n.exclusiveType ?? null
      })),
      cursor: t.cursor?.anchor && t.cursor?.focus
        ? {
            anchor: [t.cursor.anchor.key, t.cursor.anchor.offset],
            focus: [t.cursor.focus.key, t.cursor.focus.offset]
          }
        : null
    }))
  })
}

function tabByPath (tabs: TabState[], pathname: string): TabState {
  const tab = tabs.find((t) => t.pathname === pathname)
  expect(tab, `tab for ${pathname} must exist`).toBeTruthy()
  return tab!
}

async function dirtyThroughEditor (page: Page, text: string): Promise<void> {
  await page.locator('#ag-editor-id span.ag-paragraph').last().click()
  await page.keyboard.type(text)
  await page.waitForFunction(() => {
    const store = (document.querySelector('#app') as any).__vue_app__
      .config.globalProperties.$pinia._s.get('editor')
    return !!store.currentFile && !store.currentFile.isSaved
  }, undefined, { timeout: 5_000 })
}

const settleFrames = (page: Page): Promise<void> =>
  page.evaluate(() => new Promise<void>((done) => {
    requestAnimationFrame(() => requestAnimationFrame(() => done()))
  }))

async function installInvokeLog (page: Page): Promise<void> {
  // Registered after installTauriShim so the shim's invoke closure (which
  // appends to this array when present) sees the log from the first call.
  await page.addInitScript(() => {
    ;(window as any).__invokeLog = []
  })
}

async function saveInvocations (page: Page): Promise<string[]> {
  return page.evaluate(() => ((window as any).__invokeLog as string[])
    .filter((cmd) => /save|write|temp|backup|wal|recover/i.test(cmd)))
}

async function installSaveSuccess (page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as any
    w.__saveCalls = []
    w.__mockInvoke.mt_document_write_snapshot = ({request:args}: any) => {
      w.__saveCalls.push(args)
      return {...args,pathname:args.targetPath,filename:args.targetPath.split('/').pop()}
    }
  })
}

async function installSaveReject (page: Page, message: string): Promise<void> {
  await page.evaluate((msg: string) => {
    const w = window as any
    w.__saveAttempts = 0
    w.__mockInvoke.mt_document_write_snapshot = () => {
      w.__saveAttempts++
      throw new Error(msg)
    }
  }, message)
}

async function saveCalls (page: Page): Promise<any[]> {
  return page.evaluate(() => (window as any).__saveCalls || [])
}

async function callFileSave (page: Page): Promise<void> {
  await page.evaluate(() => {
    const store = (document.querySelector('#app') as any).__vue_app__
      .config.globalProperties.$pinia._s.get('editor')
    void store.FILE_SAVE()
  })
}

async function callStore (page: Page, action: string, argument?: unknown): Promise<void> {
  await page.evaluate(({ name, value }: { name: string, value: unknown }) => {
    const store = (document.querySelector('#app') as any).__vue_app__
      .config.globalProperties.$pinia._s.get('editor')
    void store[name](value)
  }, { name: action, value: argument })
}

async function installMoveSpy (page: Page, mode: 'success' | 'reject'): Promise<void> {
  await page.evaluate((behaviour: string) => {
    const w = window as any
    w.__moveCalls = []
    w.fileUtils.move = (src: string, dest: string) => {
      w.__moveCalls.push({ src, dest })
      if (behaviour === 'reject') {
        return Promise.reject(new Error('move transport failed (characterization fixture)'))
      }
      return Promise.resolve(null)
    }
  }, mode)
}

async function moveCalls (page: Page): Promise<Array<{ src: string, dest: string }>> {
  return page.evaluate(() => (window as any).__moveCalls || [])
}

async function installDirectoryPicker (page: Page, destination: string | null): Promise<void> {
  await page.evaluate((dest: string | null) => {
    const w = window as any
    w.__dialogCalls = []
    w.__mockInvoke['plugin:dialog|open'] = (args: any) => {
      w.__dialogCalls.push(args)
      return dest
    }
  }, destination)
}

async function dialogCalls (page: Page): Promise<any[]> {
  return page.evaluate(() => (window as any).__dialogCalls || [])
}

async function openRenameDialog (page: Page): Promise<void> {
  // The real title-bar/popover entry point: RESPONSE_FOR_RENAME emits the
  // bus 'rename' event, and components/rename/index.vue opens its inline
  // input prefilled with the current filename.
  await callStore(page, 'RESPONSE_FOR_RENAME')
  await page.locator('.rename input.search').waitFor({ state: 'visible', timeout: 5_000 })
}

// A save whose promise stays pending until the test resolves it, so a rename
// or Move To can complete BEFORE the save acknowledgement lands.
async function installDeferredSave (page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as any
    w.__saveCalls = []
    w.__saveResolvers = []
    w.__mockInvoke.mt_document_write_snapshot = ({request:args}: any) => new Promise((resolve: any) => {
      w.__saveCalls.push(args)
      w.__saveResolvers.push(() => resolve({
        ...args,
        pathname: args.targetPath,
        filename: args.targetPath.split('/').pop()
      }))
    })
  })
}

async function resolveDeferredSave (page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as any
    const resolvers = w.__saveResolvers.splice(0)
    resolvers.forEach((resolve: any) => resolve())
  })
}

async function pendingSaveCount (page: Page): Promise<number> {
  return page.evaluate(() => ((window as any).__saveResolvers || []).length)
}

function collectMarkers (page: Page): string[] {
  const lines: string[] = []
  page.on('console', (message) => {
    const text = message.text()
    if (
      text.includes('[editor][live_reload]') ||
      text.includes('[DiffSnapshots]') ||
      text.includes('[editor][diff]')
    ) {
      lines.push(text)
    }
  })
  return lines
}

async function expectMarker (markers: string[], needle: string): Promise<string> {
  await expect.poll(
    () => markers.some((line) => line.includes(needle)),
    { timeout: 5_000 }
  ).toBe(true)
  return markers.find((line) => line.includes(needle))!
}

const fixtureBytes = (raw: Buffer): string => raw.toString('hex')

// ─── DTO scaffold (future contract, NOT used by current code) ───────────────
// Stage 0 deliverable: a dependency-free, explicit-field DTO builder that a
// later wave can diff old/new serialized state against. The version tag names
// the intended contract; the suite proves the CURRENT runtime does not import
// or expose these builders (see the DTO shape test). The scaffold freezes the
// field NAMES and types only — block keys inside `CursorDto` are opaque values,
// and no timestamp/DOM/history-internal field is part of the contract.
export const CHARACTERIZATION_DTO_VERSION = 'stage0-dto/1'

export interface CursorDto {
  version: string
  kind: 'cursor'
  anchor: { key: string, offset: number } | null
  focus: { key: string, offset: number } | null
}

export interface TocEntryDto {
  level: number
  label: string
  slug: string
  children: TocEntryDto[]
}

export interface TocDto {
  version: string
  kind: 'toc'
  entries: TocEntryDto[]
}

export function buildCursorDto (cursor: unknown): CursorDto {
  const point = (value: any): { key: string, offset: number } | null =>
    value && typeof value.key === 'string' && typeof value.offset === 'number'
      ? { key: value.key, offset: value.offset }
      : null
  const source = (cursor || {}) as any
  return {
    version: CHARACTERIZATION_DTO_VERSION,
    kind: 'cursor',
    anchor: point(source.anchor),
    focus: point(source.focus)
  }
}

export function buildTocDto (nodes: unknown): TocDto {
  const toEntry = (node: any): TocEntryDto => ({
    level: typeof node?.lvl === 'number' ? node.lvl : 0,
    label: typeof node?.label === 'string' ? node.label : '',
    slug: typeof node?.slug === 'string' ? node.slug : '',
    children: Array.isArray(node?.children) ? node.children.map(toEntry) : []
  })
  return {
    version: CHARACTERIZATION_DTO_VERSION,
    kind: 'toc',
    entries: Array.isArray(nodes) ? nodes.map(toEntry) : []
  }
}

test.describe('metadata / external change / byte policy characterization (T-007)', () => {
  test('metadata changes retain dirty text and the save carries a complete immutable format', async ({page}) => {
    await installTauriShim(page); await bootEditor(page)
    await openTab(page, `${E2E_ROOT}/metadata-save.md`, '# Metadata\n\nbody text\n')
    await dirtyThroughEditor(page, '!')
    const before = tabByPath(await readTabs(page),`${E2E_ROOT}/metadata-save.md`)
    await page.evaluate(() => {
      const store=(document.querySelector('#app') as any).__vue_app__.config.globalProperties.$pinia._s.get('editor')
      store.SET_LINE_ENDING('crlf'); (window as any).__bus.emit('mt::set-file-encoding','cp1251')
    })
    const changed=tabByPath(await readTabs(page),`${E2E_ROOT}/metadata-save.md`)
    expect(changed.markdown).toBe(before.markdown); expect(changed.isSaved).toBe(false)
    expect(changed.encoding.encoding).toBe('cp1251'); expect(changed.lineEnding).toBe('crlf')
    await installSaveSuccess(page); await callFileSave(page)
    await expect.poll(async()=>(await saveCalls(page)).length).toBe(1)
    const request=(await saveCalls(page))[0]
    expect(request.markdown).toBe(before.markdown)
    expect(request.format).toEqual({encoding:'cp1251',isBom:false,lineEnding:'crlf',finalNewline:3})
    await expect.poll(async()=>tabByPath(await readTabs(page),`${E2E_ROOT}/metadata-save.md`).isSaved).toBe(true)
  })

  test('closing after EOL/final-newline changes still prompts and cancellation preserves the edit', async ({page}) => {
    await installTauriShim(page); await installInvokeLog(page); await bootEditor(page)
    await openTab(page, `${E2E_ROOT}/metadata-close.md`, '# Close\n\nunsaved body\n')
    await dirtyThroughEditor(page,'!')
    await page.evaluate(() => {
      const store=(document.querySelector('#app') as any).__vue_app__.config.globalProperties.$pinia._s.get('editor')
      store.SET_LINE_ENDING('crlf'); (window as any).__bus.emit('mt::set-final-newline',1)
    })
    const before=await readTabs(page); expect(before[0].isSaved).toBe(false)
    await callStore(page,'CLOSE_TAB')
    await expect(page.locator('.ag-unsaved-close-dialog')).toBeVisible()
    await page.locator('.ag-unsaved-close-cancel').click()
    expect(await readTabs(page)).toEqual(before)
    expect((await saveInvocations(page)).filter(cmd=>/save/i.test(cmd))).toEqual([])
  })

  test('an external rewrite reloads the tab and the diff baseline is the pre-reload snapshot', async ({ page }) => {
    const observedLegacyBehavior =
      'A mt::watch::event {kind: "modify", paths} for an open saved tab re-reads the "disk" through mt_fs_read, replaces tab.markdown through loadChange, keeps the tab id and isSaved=true, records the pre-reload markdown in the C-43 ring and refreshes the C-68 opened slot; ⌘D then labels the baseline "Before the last external save" and mt_diff_baseline is never consulted.'
    const desiredInvariant =
      'An external change must be compared against a defined, named baseline and applied atomically: the pre-reload version must stay recoverable and the reload must not interleave with a pending save (no stale write can land after the external bytes).'
    test.info().annotations.push(
      { type: 'observedLegacyBehavior', description: observedLegacyBehavior },
      { type: 'desiredInvariant', description: desiredInvariant }
    )

    const original = '# External\n\noriginal paragraph\n'
    const external = '# External\n\nexternal paragraph\n'

    await installTauriShim(page)
    await page.addInitScript(() => {
      ;(window as any).__diffBaselineCalls = []
      ;(window as any).__mockInvoke.mt_diff_baseline = (args: any) => {
        ;(window as any).__diffBaselineCalls.push(args)
        return '# stored baseline (must not win over the snapshot)\n'
      }
    })
    await bootEditor(page)
    await openTab(page, `${E2E_ROOT}/external-change.md`, original)
    await expect(page.locator('.editor-with-tabs p').last()).toContainText('original paragraph', { timeout: 5_000 })
    const before = tabByPath(await readTabs(page), `${E2E_ROOT}/external-change.md`)
    const markers = collectMarkers(page)

    await page.evaluate(({ p, md }: { p: string, md: string }) => {
      ;(window as any).__mockInvoke.mt_fs_read = () => md
      ;(window as any).__emitFakeEvent('mt::watch::event', { kind: 'modify', paths: [p] })
    }, { p: `${E2E_ROOT}/external-change.md`, md: external })

    await page.waitForFunction((md: string) => {
      const store = (document.querySelector('#app') as any).__vue_app__
        .config.globalProperties.$pinia._s.get('editor')
      return store.currentFile?.markdown === md
    }, external, { timeout: 5_000 })

    const after = tabByPath(await readTabs(page), `${E2E_ROOT}/external-change.md`)
    expect(after.id).toBe(before.id)
    expect(after.markdown).toBe(external)
    expect(after.isSaved).toBe(true)
    // A fresh disk load establishes a new document token at revision zero.
    expect(after.contentRevision).toBe(0)
    expect(await expectMarker(markers, 'BLOCK_LIVE_RELOAD')).toContain('source=disk')
    await expectMarker(markers, 'BLOCK_SNAPSHOT_RECORDED')
    await expectMarker(markers, 'BLOCK_OPENED_SNAPSHOT_RECORDED')

    await page.evaluate(() => (window as any).__emitFakeEvent('mt::menu-invoked', 'view.diff-mode'))
    const diff = page.locator('.diff-view')
    await diff.waitFor({ state: 'visible', timeout: 5_000 })
    await expect(diff.locator('.diff-side').nth(1)).toContainText('Before the last external save')
    await expect(diff.locator('.diff-body')).toContainText('external paragraph', { timeout: 10_000 })
    await expect(diff.locator('.diff-body')).toContainText('original paragraph', { timeout: 10_000 })
    expect(await page.evaluate(() => (window as any).__diffBaselineCalls)).toEqual([])
  })

  test('a BOM-only external rewrite compares equal and is skipped while an EOL-only rewrite is reloaded', async ({ page }) => {
    const observedLegacyBehavior =
      'Live reload compares only the decoded markdown string. A rewrite with the same text but a UTF-8 BOM (raw bytes differ, M-014 decode strips the BOM) equals tab.markdown, so the watcher logs BLOCK_RELOAD_SKIPPED reason=hash-match, records no snapshot and leaves the tab on stale bytes. An EOL-only rewrite (LF -> CRLF) decodes to a different string, so it IS reloaded and the complete decoded CRLF text remains the saved checkpoint despite the LF representation in the rich renderer. External byte-equality repair remains deferred.'
    const desiredInvariant =
      'External equality must be byte-aware (hash the raw bytes before decoding): a BOM/EOL/final-newline-only rewrite must be reported as a disk change, and no equality decision may rest on the decoded JS string alone.'
    test.info().annotations.push(
      { type: 'observedLegacyBehavior', description: observedLegacyBehavior },
      { type: 'desiredInvariant', description: desiredInvariant }
    )

    // The fixture pair proves the byte difference the string comparison cannot see.
    expect(fixtureBytes(UTF8_BOM_RAW)).not.toBe(fixtureBytes(Buffer.from(UTF8_PLAIN, 'utf8')))
    expect(UTF8_BOM_TEXT).toBe(UTF8_PLAIN)
    expect(UTF8_CRLF_TEXT).not.toBe(UTF8_PLAIN)
    expect(UTF8_CRLF_TEXT).toContain('\r\n')
    expect(UTF8_PLAIN).not.toContain('\r\n')

    await installTauriShim(page)
    await bootEditor(page)
    await openTab(page, `${E2E_ROOT}/byte-equal.md`, UTF8_PLAIN)
    await expect(page.locator('.editor-with-tabs h1').first()).toContainText('Byte policy sample', { timeout: 5_000 })
    const markers = collectMarkers(page)

    // BOM-only rewrite: identical decoded text, different raw bytes.
    await page.evaluate(({ p, md }: { p: string, md: string }) => {
      ;(window as any).__mockInvoke.mt_fs_read = () => md
      ;(window as any).__emitFakeEvent('mt::watch::event', { kind: 'modify', paths: [p] })
    }, { p: `${E2E_ROOT}/byte-equal.md`, md: UTF8_BOM_TEXT })
    const skipLine = await expectMarker(markers, 'BLOCK_RELOAD_SKIPPED')
    expect(skipLine).toContain('reason=hash-match')
    expect(markers.some((line) => line.includes('BLOCK_LIVE_RELOAD'))).toBe(false)
    expect(markers.some((line) => line.includes('BLOCK_SNAPSHOT_RECORDED'))).toBe(false)
    expect(tabByPath(await readTabs(page), `${E2E_ROOT}/byte-equal.md`).markdown).toBe(UTF8_PLAIN)

    // EOL-only rewrite: detected as a change; renderer imports without rewriting source CRLF.
    await page.evaluate(({ p, md }: { p: string, md: string }) => {
      ;(window as any).__mockInvoke.mt_fs_read = () => md
      ;(window as any).__emitFakeEvent('mt::watch::event', { kind: 'modify', paths: [p] })
    }, { p: `${E2E_ROOT}/byte-equal.md`, md: UTF8_CRLF_TEXT })
    await expectMarker(markers, 'BLOCK_LIVE_RELOAD')
    await expectMarker(markers, 'BLOCK_SNAPSHOT_RECORDED')
    const afterEol = tabByPath(await readTabs(page), `${E2E_ROOT}/byte-equal.md`)
    expect(afterEol.markdown).toBe(UTF8_CRLF_TEXT)
    expect(afterEol.isSaved).toBe(true)
  })

  test('BOM/CRLF fixtures carry actual format through save while canonical text remains a string', async ({page}) => {
    await installTauriShim(page); await bootEditor(page)
    for (const fixture of [
      {name:'bom',text:UTF8_BOM_TEXT,bom:true,eol:'lf'},
      {name:'crlf',text:UTF8_CRLF_TEXT,bom:false,eol:'crlf'}
    ]) {
      await openTab(page,`${E2E_ROOT}/byte-${fixture.name}.md`,fixture.text,{
        ...DEFAULT_OPEN_METADATA, encoding:{encoding:'utf8',isBom:fixture.bom}, lineEnding:fixture.eol
      })
      await dirtyThroughEditor(page,'!'); await installSaveSuccess(page); await callFileSave(page)
      await expect.poll(async()=>(await saveCalls(page)).length).toBe(1)
      const request=(await saveCalls(page))[0]
      expect(request.format).toEqual({encoding:'utf8',isBom:fixture.bom,lineEnding:fixture.eol,finalNewline:3})
      expect(request.markdown).toContain('!'); expect(typeof request.markdown).toBe('string')
    }
    test.info().annotations.push({type:'evidence-tier',description:'Renderer policy transport only; native codec tests prove exact BOM/EOL bytes.'})
  })

  test('a rejected save transport leaves the edit unsaved with a failure notice and no recovery path', async ({ page }) => {
    const observedLegacyBehavior =
      'When mt_response_file_save throws, FILE_SAVE catches it, shows a "Save failure" notification, leaves tab.isSaved=false with the edit intact and contentRevision/pathname unchanged, and calls no filesystem write, temp, backup or recovery command — the only save-related invocation is the rejected in-place transport. The renderer therefore has no WAL and no recovery copy for a file the backend may already have truncated in place.'
    const desiredInvariant =
      'A failed save must leave the previous file untouched and recoverable through an atomic old-or-new write (temp + commit). Without an approved WAL the product must not claim unsaved-edit recovery, and the UI must not imply the edit was persisted.'
    test.info().annotations.push(
      { type: 'observedLegacyBehavior', description: observedLegacyBehavior },
      { type: 'desiredInvariant', description: desiredInvariant }
    )

    await installTauriShim(page)
    await installInvokeLog(page)
    await bootEditor(page)
    await openTab(page, `${E2E_ROOT}/save-reject.md`, '# Save\n\nbuffer text\n')
    await expect(page.locator('.editor-with-tabs p').last()).toContainText('buffer text', { timeout: 5_000 })
    await dirtyThroughEditor(page, 'Q')
    const before = tabByPath(await readTabs(page), `${E2E_ROOT}/save-reject.md`)
    expect(before.isSaved).toBe(false)

    await installSaveReject(page, 'disk full (characterization fixture)')
    await callFileSave(page)
    await expect.poll(() => page.evaluate(() => (window as any).__saveAttempts), { timeout: 5_000 }).toBe(1)
    await expect(page.locator('.notification-card').first()).toContainText('Saving or closing failed', { timeout: 5_000 })
    await expect(page.locator('.notification-card').first()).toContainText('save-reject.md')

    const after = tabByPath(await readTabs(page), `${E2E_ROOT}/save-reject.md`)
    // No phantom clean state and no silent data loss.
    expect(after.isSaved).toBe(false)
    expect(after.markdown).toContain('buffer textQ')
    expect(after.contentRevision).toBe(before.contentRevision)
    expect(after.pathname).toBe(before.pathname)
    expect(after.id).toBe(before.id)
    // The renderer never reaches a write/temp/recovery command: no WAL exists.
    expect(await saveInvocations(page)).toEqual(['mt_document_write_snapshot'])
  })

  test('Save As onto a live-owned path preserves both buffers and rejects before writing',async({page})=>{
    const target=`${E2E_ROOT}/save-as-target.md`;const source=`${E2E_ROOT}/save-as-source.md`
    await installTauriShim(page);await bootEditor(page)
    await openTab(page,target,'# Target\n\nother owner\n');await openTab(page,source,'# Source\n\ncurrent buffer\n')
    const before=await readTabs(page)
    await page.evaluate(dest=>{
      const w=window as any;w.__writes=[]
      w.__mockInvoke.mt_document_choose_save_target=({request}:any)=>({...request,pathname:dest})
      w.__mockInvoke.mt_document_write_snapshot=({request}:any)=>{w.__writes.push(request);return {...request,pathname:request.targetPath}}
      const store=(document.querySelector('#app') as any).__vue_app__.config.globalProperties.$pinia._s.get('editor');void store.FILE_SAVE_AS()
    },target)
    await expect(page.locator('.notification-card').first()).toBeVisible()
    expect((await readTabs(page)).map(t=>({id:t.id,pathname:t.pathname,markdown:t.markdown}))).toEqual(before.map(t=>({id:t.id,pathname:t.pathname,markdown:t.markdown})))
    expect(await page.evaluate(()=>(window as any).__writes.length)).toBe(0)
    test.info().annotations.push({type:'observedLegacyBehavior',description:'Previously a Save As reply evicted the other live owner.'},{type:'desiredInvariant',description:'C-SAVE-CLOSE-DATA-SAFETY rejects live-owned path collisions. General filesystem expected-absence/atomicity remains a separate change.'})
  })

  test('navigation-only caret and selection changes do not dirty the tab', async ({ page }) => {
    const observedLegacyBehavior =
      'Focus, caret and selection events leave the complete text/format revision and dirty state unchanged. This is the B revision-ownership invariant; historical focus bump behavior is retained only in archived evidence.'
    const desiredInvariant =
      'Cursor and selection navigation must never increment the content revision or dirty the tab: revision and dirty state belong to semantic content edits only, so the focus-click revision bump must also disappear before revision ownership gates a save.'
    test.info().annotations.push(
      { type: 'observedLegacyBehavior', description: observedLegacyBehavior },
      { type: 'desiredInvariant', description: desiredInvariant }
    )

    await installTauriShim(page)
    await bootEditor(page)
    await openTab(page, `${E2E_ROOT}/navigation.md`, '# Navigation\n\nalpha paragraph\n\nbeta paragraph\n')
    await expect(page.locator('.editor-with-tabs p').last()).toContainText('beta paragraph', { timeout: 5_000 })
    await settleFrames(page)
    const settled = tabByPath(await readTabs(page), `${E2E_ROOT}/navigation.md`)
    expect(settled.isSaved).toBe(true)
    expect(settled.markdown).toBe('# Navigation\n\nalpha paragraph\n\nbeta paragraph\n')

    await page.locator('#ag-editor-id span.ag-paragraph').last().click()
    await settleFrames(page)
    await expect.poll(
      async () => tabByPath(await readTabs(page), `${E2E_ROOT}/navigation.md`).contentRevision,
      { timeout: 5_000 }
    ).toBe(settled.contentRevision)
    const focused = tabByPath(await readTabs(page), `${E2E_ROOT}/navigation.md`)
    expect(focused.isSaved).toBe(true)
    expect(focused.cursor).not.toBeNull()

    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('Shift+ArrowLeft')
    await settleFrames(page)
    const navigated = tabByPath(await readTabs(page), `${E2E_ROOT}/navigation.md`)
    expect(navigated.cursor).not.toEqual(focused.cursor)
    expect(navigated.contentRevision).toBe(focused.contentRevision)
    expect(navigated.isSaved).toBe(true)
    expect(navigated.markdown).toBe(focused.markdown)
  })

  test('a rejected save leaves the tab dirty and a second save attempt still succeeds', async ({ page }) => {
    const observedLegacyBehavior =
      'After a rejected mt_response_file_save the tab keeps its edit, dirty flag and revision; replacing the transport mock with a success reply and calling FILE_SAVE again applies the outcome (isSaved=true, lastSavedHistoryId advances) with the same buffer and no lost text. The runtime invoke override is the fault-injection seam a future freshness-failure suite can drive.'
    const desiredInvariant =
      'The save fault-injection seam must stay available for future freshness-failure scenarios, and a retry after a failed save must persist exactly the current buffer under the same revision ownership (no partial write, no stale outcome applied).'
    test.info().annotations.push(
      { type: 'observedLegacyBehavior', description: observedLegacyBehavior },
      { type: 'desiredInvariant', description: desiredInvariant }
    )

    await installTauriShim(page)
    await installInvokeLog(page)
    await bootEditor(page)
    await openTab(page, `${E2E_ROOT}/save-retry.md`, '# Retry\n\nbody\n')
    await expect(page.locator('.editor-with-tabs p').last()).toContainText('body', { timeout: 5_000 })
    await dirtyThroughEditor(page, 'R')
    const dirty = tabByPath(await readTabs(page), `${E2E_ROOT}/save-retry.md`)
    const revision = dirty.contentRevision

    await installSaveReject(page, 'transient failure (characterization fixture)')
    await callFileSave(page)
    await expect.poll(() => page.evaluate(() => (window as any).__saveAttempts), { timeout: 5_000 }).toBe(1)
    const afterFailure = tabByPath(await readTabs(page), `${E2E_ROOT}/save-retry.md`)
    expect(afterFailure.isSaved).toBe(false)
    expect(afterFailure.contentRevision).toBe(revision)
    expect(afterFailure.markdown).toContain('bodyR')

    await installSaveSuccess(page)
    await callFileSave(page)
    await expect.poll(
      async () => tabByPath(await readTabs(page), `${E2E_ROOT}/save-retry.md`).isSaved,
      { timeout: 5_000 }
    ).toBe(true)
    const savedCalls = await saveCalls(page)
    expect(savedCalls).toHaveLength(1)
    expect(savedCalls[0].markdown).toBe(afterFailure.markdown)
    const afterRetry = tabByPath(await readTabs(page), `${E2E_ROOT}/save-retry.md`)
    expect(afterRetry.markdown).toBe(afterFailure.markdown)
    expect(afterRetry.contentRevision).toBe(revision)
    expect(await saveInvocations(page)).toEqual(['mt_document_write_snapshot', 'mt_document_write_snapshot'])
  })

  test('an external delete on the open path marks the tab dirty and leaves it open', async ({ page }) => {
    const observedLegacyBehavior =
      'A mt::watch::event {kind: "remove", paths} for the open saved path routes to APPLY_FILE_CHANGE("unlink", {pathname}): the tab stays open with its markdown intact, isSaved flips to false and a warn tab notification "\"<name>\" has been removed on disk." appears. No save, temp or commit command runs — the renderer has no temp/commit phase to abort because the save path is in place. The same watcher modify kind would reload the file (see the dirty-buffer test) with no conflict prompt.'
    const desiredInvariant =
      'An external modify/delete after a temp completion but before the destination commit must fail closed: abort the commit, preserve the old and new bytes, and surface the conflict for explicit resolution. Without an approved WAL the product must not claim unsaved-edit recovery.'
    test.info().annotations.push(
      { type: 'observedLegacyBehavior', description: observedLegacyBehavior },
      { type: 'desiredInvariant', description: desiredInvariant }
    )

    await installTauriShim(page)
    await installInvokeLog(page)
    await bootEditor(page)
    await openTab(page, `${E2E_ROOT}/external-delete.md`, '# Delete\n\nstill on screen\n')
    await expect(page.locator('.editor-with-tabs p').last()).toContainText('still on screen', { timeout: 5_000 })

    await page.evaluate((p: string) => {
      ;(window as any).__emitFakeEvent('mt::watch::event', { kind: 'remove', paths: [p] })
    }, `${E2E_ROOT}/external-delete.md`)

    await expect.poll(async () => {
      const tab = tabByPath(await readTabs(page), `${E2E_ROOT}/external-delete.md`)
      return tab.notifications.length
    }, { timeout: 5_000 }).toBe(1)

    const tab = tabByPath(await readTabs(page), `${E2E_ROOT}/external-delete.md`)
    expect(tab.notifications).toEqual([{
      msg: '"external-delete.md" has been removed on disk.',
      style: 'warn',
      showConfirm: false,
      exclusiveType: 'file_changed'
    }])
    expect(tab.isSaved).toBe(false)
    expect(tab.markdown).toBe('# Delete\n\nstill on screen\n')
    expect((await readTabs(page))).toHaveLength(1)
    await expect(page.locator('.editor-notifications').first())
      .toContainText('has been removed on disk.', { timeout: 5_000 })
    expect(await page.locator('.ag-unsaved-close-dialog').count()).toBe(0)
    expect(await saveInvocations(page)).toEqual([])
  })

  test('an external rewrite while the tab is dirty preserves the unsaved buffer pending an explicit choice', async ({ page }) => {
    const observedLegacyBehavior =
      'Before C-STABILIZE-DIRTY-RELOAD, default liveReload silently replaced a dirty buffer. The repaired contract keeps local content, save metadata, revision, cursor and history intact, emits the dirty conflict marker and offers the existing per-tab explicit reload choice without automatically reading, writing or recording a reload snapshot.'
    const desiredInvariant =
      'An external change must never overwrite unsaved local edits without an explicit decision: a dirty tab must prompt (keep local / reload / show both) and the pre-reload local buffer must remain recoverable, not silently replaced.'
    test.info().annotations.push(
      { type: 'observedLegacyBehavior', description: observedLegacyBehavior },
      { type: 'desiredInvariant', description: desiredInvariant }
    )

    const local = '# Dirty\n\nlocal paragraph\n'
    const external = '# Dirty\n\nexternal replacement\n'
    const pathname = `${E2E_ROOT}/dirty-external.md`

    await installTauriShim(page)
    await installInvokeLog(page)
    await bootEditor(page)
    await openTab(page, pathname, local)
    await expect(page.locator('.editor-with-tabs p').last()).toContainText('local paragraph', { timeout: 5_000 })
    await dirtyThroughEditor(page, ' LOCAL-EDIT')
    const dirty = tabByPath(await readTabs(page), pathname)
    expect(dirty.markdown).toContain('local paragraph LOCAL-EDIT')
    expect(dirty.isSaved).toBe(false)
    const historyBefore = await page.evaluate(() => {
      const store = (document.querySelector('#app') as any).__vue_app__
        .config.globalProperties.$pinia._s.get('editor')
      return JSON.stringify(store.currentFile.history)
    })
    const writesBefore = await saveInvocations(page)
    const markers = collectMarkers(page)

    await page.evaluate(({ p, md }: { p: string, md: string }) => {
      const w = window as any
      w.__dirtyExternalReads = 0
      w.__mockInvoke.mt_fs_read = () => {
        w.__dirtyExternalReads++
        return md
      }
      w.__emitFakeEvent('mt::watch::event', { kind: 'modify', paths: [p] })
    }, { p: pathname, md: external })

    // An unchanged buffer alone could pass before the watcher handles the event.
    // Await the actual dirty guard and its actionable conflict notification.
    await expectMarker(markers, 'BLOCK_RELOAD_CONFLICT path=dirty-external.md reason=dirty-tab')
    await page.waitForFunction((p: string) => {
      const store = (document.querySelector('#app') as any).__vue_app__
        .config.globalProperties.$pinia._s.get('editor')
      return store.tabs.find((t: any) => t.pathname === p)?.notifications
        .some((n: any) => n.exclusiveType === 'file_changed' && n.showConfirm)
    }, pathname, { timeout: 5_000 })
    const after = tabByPath(await readTabs(page), pathname)
    expect({ ...after, notifications: dirty.notifications }).toEqual(dirty)
    expect(after.markdown).not.toBe(external)
    expect(after.notifications.filter((n) => n.exclusiveType === 'file_changed')).toHaveLength(1)
    expect(after.notifications.find((n) => n.exclusiveType === 'file_changed')?.showConfirm).toBe(true)
    expect(await page.evaluate(() => {
      const store = (document.querySelector('#app') as any).__vue_app__
        .config.globalProperties.$pinia._s.get('editor')
      return JSON.stringify(store.currentFile.history)
    })).toBe(historyBefore)
    expect(await page.evaluate(() => (window as any).__dirtyExternalReads)).toBe(0)
    expect(await saveInvocations(page)).toEqual(writesBefore)
    expect(markers.some((line) => line.includes('BLOCK_SNAPSHOT_RECORDED'))).toBe(false)
    expect(markers.some((line) => line.includes('BLOCK_LIVE_RELOAD'))).toBe(false)
    expect(await page.locator('.ag-unsaved-close-dialog').count()).toBe(0)
  })
})

test.describe('rename / Move To characterization (T-007 follow-up)', () => {
  test('the title-bar inline rename dialog cannot complete: editorStore.rename is undefined', async ({ page }) => {
    const observedLegacyBehavior =
      'The real title-bar inline rename path opens the dialog prefilled with the current filename, but confirming calls editorStore.rename(name) while the store defines only RENAME and RESPONSE_FOR_RENAME: the confirm throws TypeError (console error "rename is not a function"), the dialog stays open, window.fileUtils.move is never called, and pathname/filename/markdown/contentRevision/isSaved stay untouched. No save transport fires.'
    const desiredInvariant =
      'Confirming the inline rename must invoke a real action, validate the proposed name and complete one atomic rename that preserves the buffer and dirty state; a UI handler must never throw or leave the dialog open as a silent no-op.'
    test.info().annotations.push(
      { type: 'observedLegacyBehavior', description: observedLegacyBehavior },
      { type: 'desiredInvariant', description: desiredInvariant }
    )

    const pathname = `${E2E_ROOT}/rename-dialog.md`
    const errors: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text())
    })

    await installTauriShim(page)
    await installInvokeLog(page)
    await bootEditor(page)
    await openTab(page, pathname, '# Rename\n\nbody\n')
    await expect(page.locator('.editor-with-tabs p').last()).toContainText('body', { timeout: 5_000 })
    await dirtyThroughEditor(page, '!')
    const before = tabByPath(await readTabs(page), pathname)
    await installMoveSpy(page, 'success')

    await openRenameDialog(page)
    await expect(page.locator('.rename input.search')).toHaveValue('rename-dialog.md')
    expect(await page.evaluate(() => {
      const store = (document.querySelector('#app') as any).__vue_app__
        .config.globalProperties.$pinia._s.get('editor')
      return typeof store.rename
    })).toBe('undefined')

    await page.locator('.rename input.search').fill('renamed-from-dialog.md')
    await page.locator('.rename input.search').press('Enter')
    await expect.poll(() => errors.some((line) => /rename is not a function/.test(line)), { timeout: 5_000 }).toBe(true)

    // The confirm threw before hiding the dialog and before touching transport.
    await expect(page.locator('.rename input.search')).toBeVisible()
    const after = tabByPath(await readTabs(page), pathname)
    expect(after.id).toBe(before.id)
    expect(after.pathname).toBe(pathname)
    expect(after.filename).toBe('rename-dialog.md')
    expect(after.markdown).toBe(before.markdown)
    expect(after.contentRevision).toBe(before.contentRevision)
    expect(after.isSaved).toBe(false)
    expect(await moveCalls(page)).toEqual([])
    expect(await saveInvocations(page)).toEqual([])

    // Escaping the broken dialog is the only working dismissal; it still
    // leaves the path untouched.
    await page.keyboard.press('Escape')
    await expect(page.locator('.rename input.search')).toBeHidden({ timeout: 5_000 })
    expect(tabByPath(await readTabs(page), pathname).pathname).toBe(pathname)
    expect(await moveCalls(page)).toEqual([])
  })

  test('a cancelled inline rename leaves the path and dirty state untouched', async ({ page }) => {
    const observedLegacyBehavior =
      'Opening the inline rename dialog, editing the proposed name and dismissing it with Escape calls no move transport and mutates nothing: pathname, filename, markdown, contentRevision and the dirty flag stay exactly as they were, and no save transport fires.'
    const desiredInvariant =
      'Cancel must be a strict no-op: no transport call, no tab mutation and the dirty buffer preserved; only an explicit confirm may move the file.'
    test.info().annotations.push(
      { type: 'observedLegacyBehavior', description: observedLegacyBehavior },
      { type: 'desiredInvariant', description: desiredInvariant }
    )

    const pathname = `${E2E_ROOT}/rename-cancel.md`
    await installTauriShim(page)
    await installInvokeLog(page)
    await bootEditor(page)
    await openTab(page, pathname, '# Cancel\n\nbody\n')
    await expect(page.locator('.editor-with-tabs p').last()).toContainText('body', { timeout: 5_000 })
    await dirtyThroughEditor(page, '!')
    const before = tabByPath(await readTabs(page), pathname)
    await installMoveSpy(page, 'success')

    await openRenameDialog(page)
    await page.locator('.rename input.search').fill('should-not-apply.md')
    await page.keyboard.press('Escape')
    await expect(page.locator('.rename input.search')).toBeHidden({ timeout: 5_000 })

    const after = tabByPath(await readTabs(page), pathname)
    expect(after.pathname).toBe(before.pathname)
    expect(after.filename).toBe(before.filename)
    expect(after.markdown).toBe(before.markdown)
    expect(after.contentRevision).toBe(before.contentRevision)
    expect(after.isSaved).toBe(false)
    expect(await moveCalls(page)).toEqual([])
    expect(await saveInvocations(page)).toEqual([])
  })

  test('a direct RENAME preserves dirty text and close still requires a decision', async ({ page }) => {
    const observedLegacyBehavior =
      'Calling the real RENAME store action on a dirty named tab moves the file through window.fileUtils.move and applies an isSaved=true outcome: pathname/filename change, the edited markdown stays, contentRevision is unchanged, lastSavedHistoryId advances and no save transport runs. A later CLOSE_TAB force-closes the tab with no unsaved-close dialog, silently discarding the edit.'
    const desiredInvariant =
      'Renaming a dirty document must move the bytes without claiming the buffer was written: the dirty flag and the last-saved marker must follow the tab, and close must still prompt for the unsaved edit. A rename is not a save.'
    test.info().annotations.push(
      { type: 'observedLegacyBehavior', description: observedLegacyBehavior },
      { type: 'desiredInvariant', description: desiredInvariant }
    )

    const pathname = `${E2E_ROOT}/direct-rename.md`
    const renamed = `${E2E_ROOT}/direct-renamed.md`
    await installTauriShim(page)
    await installInvokeLog(page)
    await bootEditor(page)
    await openTab(page, pathname, '# Rename\n\nbody\n')
    await expect(page.locator('.editor-with-tabs p').last()).toContainText('body', { timeout: 5_000 })
    await dirtyThroughEditor(page, '!')
    const before = tabByPath(await readTabs(page), pathname)
    expect(before.isSaved).toBe(false)
    await installMoveSpy(page, 'success')

    await callStore(page, 'RENAME', 'direct-renamed.md')
    await expect.poll(async () => (await readTabs(page))[0].pathname, { timeout: 5_000 }).toBe(renamed)

    const after = tabByPath(await readTabs(page), renamed)
    expect(after.id).toBe(before.id)
    expect(after.filename).toBe('direct-renamed.md')
    expect(after.markdown).toBe(before.markdown)
    expect(after.markdown).toContain('body!')
    expect(after.contentRevision).toBe(before.contentRevision)
    // Correlated-save authority cannot be synthesized by path-only mutation.
    expect(after.isSaved).toBe(false)
    expect(after.lastSavedHistoryId).toBe(before.lastSavedHistoryId)
    expect(await moveCalls(page)).toEqual([{ src: pathname, dest: renamed }])
    expect(await saveInvocations(page)).toEqual([])

    await callStore(page, 'CLOSE_TAB')
    await expect(page.locator('.ag-unsaved-close-dialog')).toBeVisible()
    await page.locator('.ag-unsaved-close-cancel').click()
    expect((await readTabs(page))[0].markdown).toBe(before.markdown)
    expect(await saveInvocations(page)).toEqual([])
  })

  test('Move To cancelled performs no move and keeps the dirty buffer', async ({ page }) => {
    const observedLegacyBehavior =
      'MOVE_FILE_TO requests the native directory picker with {options: {directory: true, multiple: false}}; a null picker result returns without calling window.fileUtils.move, and the tab keeps its pathname, filename, markdown, contentRevision and dirty flag. No save transport runs.'
    const desiredInvariant =
      'Cancelling Move To must be a strict no-op with no transport call and no tab mutation, preserving the dirty buffer.'
    test.info().annotations.push(
      { type: 'observedLegacyBehavior', description: observedLegacyBehavior },
      { type: 'desiredInvariant', description: desiredInvariant }
    )

    const pathname = `${E2E_ROOT}/move-cancel.md`
    await installTauriShim(page)
    await installInvokeLog(page)
    await bootEditor(page)
    await openTab(page, pathname, '# Move\n\nbody\n')
    await expect(page.locator('.editor-with-tabs p').last()).toContainText('body', { timeout: 5_000 })
    await dirtyThroughEditor(page, '!')
    const before = tabByPath(await readTabs(page), pathname)
    await installMoveSpy(page, 'success')
    await installDirectoryPicker(page, null)

    await callStore(page, 'MOVE_FILE_TO')
    await expect.poll(async () => (await dialogCalls(page)).length, { timeout: 5_000 }).toBe(1)
    expect(await dialogCalls(page)).toEqual([{ options: { directory: true, multiple: false } }])

    const after = tabByPath(await readTabs(page), pathname)
    expect(after.pathname).toBe(before.pathname)
    expect(after.filename).toBe(before.filename)
    expect(after.markdown).toBe(before.markdown)
    expect(after.contentRevision).toBe(before.contentRevision)
    expect(after.isSaved).toBe(false)
    expect(await moveCalls(page)).toEqual([])
    expect(await saveInvocations(page)).toEqual([])
  })

  test('Move To failure preserves the dirty buffer and reports Move failed', async ({ page }) => {
    const observedLegacyBehavior =
      'When window.fileUtils.move rejects, MOVE_FILE_TO catches it and shows an error notification titled "Move failed" with the transport message; the tab keeps its old pathname/filename, edited markdown, contentRevision and dirty flag, and no save transport runs.'
    const desiredInvariant =
      'A failed move must leave the source path and the buffer untouched, surface the failure to the user and stay retryable; no partial state may be committed.'
    test.info().annotations.push(
      { type: 'observedLegacyBehavior', description: observedLegacyBehavior },
      { type: 'desiredInvariant', description: desiredInvariant }
    )

    const pathname = `${E2E_ROOT}/move-fail.md`
    await installTauriShim(page)
    await installInvokeLog(page)
    await bootEditor(page)
    await openTab(page, pathname, '# Fail\n\nbody\n')
    await expect(page.locator('.editor-with-tabs p').last()).toContainText('body', { timeout: 5_000 })
    await dirtyThroughEditor(page, '!')
    const before = tabByPath(await readTabs(page), pathname)
    await installMoveSpy(page, 'reject')
    await installDirectoryPicker(page, `${E2E_ROOT}/moved-dir`)

    await callStore(page, 'MOVE_FILE_TO')
    await expect(page.locator('.notification-card').first()).toContainText('Move failed', { timeout: 5_000 })
    await expect(page.locator('.notification-card').first()).toContainText('move transport failed (characterization fixture)')

    const after = tabByPath(await readTabs(page), pathname)
    expect(after.pathname).toBe(before.pathname)
    expect(after.filename).toBe(before.filename)
    expect(after.markdown).toBe(before.markdown)
    expect(after.contentRevision).toBe(before.contentRevision)
    expect(after.isSaved).toBe(false)
    expect(await moveCalls(page)).toEqual([{ src: pathname, dest: `${E2E_ROOT}/moved-dir/move-fail.md` }])
    expect(await saveInvocations(page)).toEqual([])
  })

  for(const kind of ['MOVE_FILE_TO','RENAME']) {
    test(`a pending save prevents ${kind} from changing destination ownership`,async({page})=>{
      const pathname=`${E2E_ROOT}/pending-path.md`
      await installTauriShim(page);await installInvokeLog(page);await bootEditor(page);await openTab(page,pathname,'# Pending\n\nbody\n')
      await dirtyThroughEditor(page,'!');await installDeferredSave(page);await callFileSave(page)
      await expect.poll(async()=>(await saveCalls(page)).length).toBe(1)
      await installMoveSpy(page,'success');await installDirectoryPicker(page,`${E2E_ROOT}/reorder-dir`)
      if(kind==='RENAME')await callStore(page,kind,'new.md');else await callStore(page,kind)
      expect((await readTabs(page))[0].pathname).toBe(pathname);expect(await moveCalls(page)).toEqual([])
      await expect(page.locator('.notification-card').first()).toBeVisible()
      await resolveDeferredSave(page)
      await expect.poll(async()=>(await readTabs(page))[0].isSaved).toBe(true)
      expect((await readTabs(page))[0].pathname).toBe(pathname)
      test.info().annotations.push({type:'observedLegacyBehavior',description:'A stale save acknowledgement previously reverted Move To/rename ownership.'},{type:'desiredInvariant',description:'A known overlapping save blocks the path transition with feedback; a fresh explicit path action follows settlement.'})
    })
  }
})

test.describe('live-reference alias + DTO scaffold (T-007 follow-up)', () => {
  test('live references: tab identity, history snapshots, TOC copies and the source-mode mirror', async ({ page }) => {
    const observedLegacyBehavior =
      'currentFile is the same reactive tab object as tabs[tabIdToIndex[id]]. tab.blocks and tab.cursor are NOT the same objects as any history stack entry\'s blocks/cursor, although both are structurally equal to the current entry (each history entry owns its own snapshot). listToc holds flat {content,lvl,slug,githubSlug} entries; toc is a separate tree of fresh nodes {parent,lvl,label,slug,children} whose labels/slugs mirror listToc with no shared object identity, while each child.parent points at its live parent node. Entering Source Code mode keeps the tab object, markdown, dirty flag, revision and TOC lengths unchanged and drops tab.cursor to undefined; the CodeMirror source map mirrors the tab markdown by value. Leaving Source Code mode restores a cursor but mints one new history entry and bumps contentRevision by one with no content change.'
    const desiredInvariant =
      'Live references must be explicit and owned: no future DTO/export boundary may hand out a mutable alias of the tab, history entries must stay immutable snapshots (never aliased into the live tab), and navigation/source-mode round trips must not mint revisions or history entries.'
    test.info().annotations.push(
      { type: 'observedLegacyBehavior', description: observedLegacyBehavior },
      { type: 'desiredInvariant', description: desiredInvariant }
    )

    const pathname = `${E2E_ROOT}/alias.md`
    await installTauriShim(page)
    await bootEditor(page)
    await openTab(page, pathname, '# One\n\nalpha para\n\n## Two\n\nbeta para\n')
    await expect(page.locator('.editor-with-tabs h1').first()).toContainText('One', { timeout: 5_000 })
    await dirtyThroughEditor(page, 'X')

    const before = await page.evaluate(() => {
      const store = (document.querySelector('#app') as any).__vue_app__
        .config.globalProperties.$pinia._s.get('editor')
      const tab = store.currentFile
      const history = tab.history || {}
      const listToc = store.listToc || []
      const toc = store.toc || []
      const plain = (node: any): any => ({
        lvl: node.lvl,
        label: node.label,
        slug: node.slug,
        children: (node.children || []).map(plain)
      })
      return {
        currentIsTabEntry: tab === store.tabs[store.tabIdToIndex[tab.id]],
        tabCount: store.tabs.length,
        listToc: listToc.map((item: any) => ({
          keys: Object.keys(item).sort(),
          content: item.content,
          lvl: item.lvl,
          slug: item.slug,
          slugIsString: typeof item.slug === 'string' && item.slug.length > 0,
          githubSlug: item.githubSlug
        })),
        toc: toc.map(plain),
        tocKeys: toc.length ? Object.keys(toc[0]).sort() : [],
        tocSharesListObject: toc.some((node: any) => listToc.includes(node)),
        tocChildParentIsRoot: toc.length > 0 && toc[0].children?.[0]?.parent === toc[0],
        history: {
          stackLength: history.stack?.length ?? 0,
          index: history.index,
          lastEditIndex: history.lastEditIndex,
          entries: (history.stack || []).map((entry: any) => ({
            hasBlocks: Array.isArray(entry.blocks),
            hasCursor: !!entry.cursor,
            blocksAreTabBlocks: entry.blocks === tab.blocks,
            cursorIsTabCursor: entry.cursor === tab.cursor
          })),
          tabBlocksMatchCurrent: JSON.stringify(tab.blocks) === JSON.stringify(history.stack?.[history.lastEditIndex]?.blocks),
          tabCursorMatchCurrent: JSON.stringify(tab.cursor) === JSON.stringify(history.stack?.[history.lastEditIndex]?.cursor)
        },
        revision: tab.contentRevision,
        markdown: tab.markdown,
        isSaved: tab.isSaved,
        id: tab.id
      }
    })

    expect(before.currentIsTabEntry).toBe(true)
    expect(before.tabCount).toBe(1)
    expect(before.listToc).toHaveLength(2)
    expect(before.listToc[0].content).toBe('One')
    expect(before.listToc[1].content).toBe('Two')
    expect(before.listToc[0].lvl).toBe(1)
    expect(before.listToc[1].lvl).toBe(2)
    expect(before.listToc[0].githubSlug).toBe('one')
    expect(before.listToc[1].githubSlug).toBe('two')
    for (const item of before.listToc) {
      expect(item.keys).toEqual(['content', 'githubSlug', 'lvl', 'slug'])
      expect(item.slugIsString).toBe(true)
    }
    expect(before.toc).toHaveLength(1)
    expect(before.tocKeys).toEqual(['children', 'label', 'lvl', 'parent', 'slug'])
    expect(before.toc[0].label).toBe('One')
    expect(before.toc[0].lvl).toBe(1)
    expect(before.toc[0].children).toHaveLength(1)
    expect(before.toc[0].children[0].label).toBe('Two')
    expect(before.toc[0].children[0].lvl).toBe(2)
    // Structure mirrors listToc by value, never by object identity.
    expect(before.toc[0].slug).toBe(before.listToc[0].slug)
    expect(before.toc[0].children[0].slug).toBe(before.listToc[1].slug)
    expect(before.tocSharesListObject).toBe(false)
    expect(before.tocChildParentIsRoot).toBe(true)

    // History entries own their snapshots; the live tab is not aliased into them.
    expect(before.history.entries.length).toBeGreaterThanOrEqual(2)
    for (const entry of before.history.entries) {
      expect(entry.hasBlocks).toBe(true)
      expect(entry.hasCursor).toBe(true)
      expect(entry.blocksAreTabBlocks).toBe(false)
      expect(entry.cursorIsTabCursor).toBe(false)
    }
    expect(before.history.tabBlocksMatchCurrent).toBe(true)
    expect(before.history.tabCursorMatchCurrent).toBe(true)
    expect(before.isSaved).toBe(false)

    // Source Code mode: same tab object and values; cursor dropped; the
    // CodeMirror map mirrors the markdown by value.
    await page.evaluate(() => (window as any).__emitFakeEvent('mt::menu-invoked', 'view.source-code-mode'))
    await page.locator('.source-code .CodeMirror').waitFor({ state: 'visible', timeout: 5_000 })
    const inSource = await page.evaluate(() => {
      const store = (document.querySelector('#app') as any).__vue_app__
        .config.globalProperties.$pinia._s.get('editor')
      const tab = store.currentFile
      const cm = (document.querySelector('.source-code .CodeMirror') as any)?.CodeMirror
      return {
        sameTabObject: tab === store.tabs[store.tabIdToIndex[tab.id]],
        id: tab.id,
        markdown: tab.markdown,
        revision: tab.contentRevision,
        isSaved: tab.isSaved,
        cursor: tab.cursor,
        listTocLength: (store.listToc || []).length,
        tocLength: (store.toc || []).length,
        sourceMapValue: cm?.getValue ? cm.getValue() : null
      }
    })
    expect(inSource.sameTabObject).toBe(true)
    expect(inSource.id).toBe(before.id)
    expect(inSource.markdown).toBe(before.markdown)
    expect(inSource.revision).toBe(before.revision)
    expect(inSource.isSaved).toBe(false)
    expect(inSource.cursor).toBeUndefined()
    expect(inSource.listTocLength).toBe(2)
    expect(inSource.tocLength).toBe(1)
    expect(inSource.sourceMapValue).toBe(before.markdown)

    await page.evaluate(() => (window as any).__emitFakeEvent('mt::menu-invoked', 'view.source-code-mode'))
    await page.locator('.source-code').waitFor({ state: 'hidden', timeout: 5_000 })
    await expect.poll(async () => (await readTabs(page))[0].contentRevision, { timeout: 5_000 })
      .toBe(before.revision)

    const after = await page.evaluate(() => {
      const store = (document.querySelector('#app') as any).__vue_app__
        .config.globalProperties.$pinia._s.get('editor')
      const tab = store.currentFile
      return {
        sameTabObject: tab === store.tabs[store.tabIdToIndex[tab.id]],
        id: tab.id,
        markdown: tab.markdown,
        revision: tab.contentRevision,
        isSaved: tab.isSaved,
        historyStackLength: tab.history?.stack?.length ?? 0,
        lastEditIndex: tab.history?.lastEditIndex ?? null,
        hasCursor: !!tab.cursor
      }
    })
    expect(after.sameTabObject).toBe(true)
    expect(after.id).toBe(before.id)
    expect(after.markdown).toBe(before.markdown)
    expect(after.isSaved).toBe(false)
    // Source mode retains the existing history-entry behavior; identical text
    // no longer mints a document revision. History is a separate characterization.
    expect(after.revision).toBe(before.revision)
    expect(after.historyStackLength).toBe(before.history.stackLength + 1)
    expect(after.lastEditIndex).toBe(before.history.lastEditIndex)
    expect(after.hasCursor).toBe(true)
  })

  test('the exported cursor/TOC DTO scaffold pins an explicit versioned shape and is not wired into the runtime', async ({ page }) => {
    const observedLegacyBehavior =
      'The spec exports dependency-free buildCursorDto/buildTocDto builders (version tag stage0-dto/1, kind cursor/toc, explicit {anchor,focus}/{level,label,slug,children} fields). They normalize live store values and drop undocumented fields such as history ids, renderRange, parent links and extra keys, but nothing in the renderer imports or exposes them: the runtime has no global builder and no tab carries a DTO field. The scaffold describes a FUTURE serialization contract, not current product code.'
    const desiredInvariant =
      'A future old/new differential harness must consume only versioned, explicit-field DTOs; the DTO must be the single serialization boundary (no live proxies, no internal history shape) and its version must change whenever a field changes.'
    test.info().annotations.push(
      { type: 'observedLegacyBehavior', description: observedLegacyBehavior },
      { type: 'desiredInvariant', description: desiredInvariant }
    )

    expect(CHARACTERIZATION_DTO_VERSION).toBe('stage0-dto/1')
    expect(buildCursorDto({
      anchor: { key: 'ag-1', offset: 2 },
      focus: { key: 'ag-1', offset: 2 },
      historyId: 5,
      renderRange: [null, null]
    })).toEqual({
      version: 'stage0-dto/1',
      kind: 'cursor',
      anchor: { key: 'ag-1', offset: 2 },
      focus: { key: 'ag-1', offset: 2 }
    })
    expect(buildCursorDto(null)).toEqual({
      version: 'stage0-dto/1',
      kind: 'cursor',
      anchor: null,
      focus: null
    })

    await installTauriShim(page)
    await bootEditor(page)
    await openTab(page, `${E2E_ROOT}/dto.md`, '# Alpha\n\nbody\n\n## Beta\n\nmore\n')
    await expect(page.locator('.editor-with-tabs h1').first()).toContainText('Alpha', { timeout: 5_000 })
    await expect.poll(() => page.evaluate(() => {
      const store = (document.querySelector('#app') as any).__vue_app__
        .config.globalProperties.$pinia._s.get('editor')
      return (store.toc || []).length
    }), { timeout: 5_000 }).toBeGreaterThan(0)

    const live = await page.evaluate(() => {
      const store = (document.querySelector('#app') as any).__vue_app__
        .config.globalProperties.$pinia._s.get('editor')
      const tab = store.currentFile
      return {
        toc: store.toc,
        cursor: tab.cursor,
        tabKeys: Object.keys(tab),
        runtimeBuilderType: typeof (window as any).buildCursorDto
      }
    })

    const tocDto = buildTocDto(live.toc)
    expect(tocDto.version).toBe('stage0-dto/1')
    expect(tocDto.kind).toBe('toc')
    expect(tocDto.entries).toHaveLength(1)
    expect(Object.keys(tocDto.entries[0]).sort()).toEqual(['children', 'label', 'level', 'slug'])
    expect(tocDto.entries[0].label).toBe('Alpha')
    expect(tocDto.entries[0].level).toBe(1)
    expect(tocDto.entries[0].slug).toBe(live.toc[0].slug)
    expect(tocDto.entries[0].children).toHaveLength(1)
    expect(Object.keys(tocDto.entries[0].children[0]).sort()).toEqual(['children', 'label', 'level', 'slug'])
    expect(tocDto.entries[0].children[0].label).toBe('Beta')
    expect(tocDto.entries[0].children[0].level).toBe(2)
    expect(tocDto.entries[0].children[0].slug).toBe(live.toc[0].children[0].slug)

    const cursorDto = buildCursorDto(live.cursor)
    expect(cursorDto).toEqual({
      version: 'stage0-dto/1',
      kind: 'cursor',
      anchor: { key: live.cursor.anchor.key, offset: live.cursor.anchor.offset },
      focus: { key: live.cursor.focus.key, offset: live.cursor.focus.offset }
    })

    // Honesty: the scaffold is not part of the current runtime.
    expect(live.runtimeBuilderType).toBe('undefined')
    expect(live.tabKeys).not.toContain('cursorDto')
    expect(live.tabKeys).not.toContain('tocDto')
  })
})
