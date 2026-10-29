// FILE: tests/e2e/perf/characterization-save-close.spec.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Freeze the CURRENT observable save / Save As / Save All / Save & Close / Quit / session / reader output behavior of the renderer at the boundaries named by R-6, dual-recording every known-defect observation instead of blessing it.
//   SCOPE: Renderer-only (vite preview + Tauri shim, WebKit) against the committed semantic-edge corpus: FILE_SAVE, APPLY_SAVE_OUTCOME revision ownership, FILE_SAVE_AS (payload + overwrite-by-path), ASK_FOR_SAVE_ALL(false) mt_save_tabs no-op, CLOSE_TAB -> unsaved-close dialog -> mt_save_and_close_tabs, edit-after-payload-before-close race, QUIT_APP dialogs/payloads, _saveSessionState prefs writes, muya-derived wordCount/TOC/cursor, whole-document Copy as Markdown and styled-HTML export, and the --new-window no-op. It does NOT cover real Tauri IPC, real disk bytes, native WKWebView, or the multi-window behavior F-MULTI-WINDOW will add.
//   DEPENDS: Playwright webkit-perf project, tests/e2e/fixtures/tauri-shim.ts, tests/e2e/fixtures/helpers.ts, the real Pinia editor store, src/muya wordCount/getTOC semantics, the committed tests/e2e/fixtures/large-doc corpus.
//   LINKS: .grace/changes/active/C-LARGE-DOC-STAGE-0 plan T-006 and spec R-6/R-7; .grace/verification/performance.xml V-M-060; tests/e2e/unsaved-close-actions.spec.ts (dialog action model); tests/e2e/export-html-images.spec.ts (styled-HTML export harness).
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   CORPUS_DIR - repository path of the committed large-doc corpus.
//   FIXTURE_PATH - semantic-edge.md path used by every scenario.
//   FIXTURE_SHA256 - its pinned sha256 (asserted against shape-metadata.json).
//   DOC - the fixture markdown read once at module load.
//   HERE - this spec's directory (for repo-relative fixture resolution).
//   sha256 - hex digest helper used for payload identity assertions.
//   UNTITLED_SELECTOR - the editor selector used to focus/dirty a tab.
//   TARGET_PARAGRAPH_TEXT - a stable paragraph from the fixture used for typing.
//   targetParagraph - locator for that paragraph.
//   startSaveAs - opens the Save As flow through the real store action.
//   installSaveAsMock - installs a Save As transport double capturing calls.
//   installPendingSaveMock - installs a deferred save transport for race cases.
//   FIXTURE_NAME - corpus fixture name.
//   NAMED_PATH - fake /tmp path used for the named tab.
//   editTargetParagraph - types into the target paragraph until the tab is dirty.
//   headingsInMarkdown - counts headings in canonical markdown for the TOC assertion.
//   installSaveMock - installs a save transport double capturing calls.
//   invokeLog - reads the shim invoke log.
//   muyaWordCount - computes the expected word count from markdown.
//   openFixture - opens the pinned fixture as a named tab.
//   pushDualRecord - attaches observedLegacyBehavior/desiredInvariant annotations.
//   readTab - serialisable snapshot of the active tab.
//   startSave - fires the real FILE_SAVE action.
//   storeState - snapshot of tab count/saved flags/pathnames.
//   typeIntoUntitled - types into the untitled tab until dirty.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-27 C-LARGE-DOC-STAGE-0 T-006: initial
//   characterization suite — canonical Markdown and transport payload
//   identity, revision ownership with the stale-ack guard marker, Save As
//   payload/overwrite behavior, the unregistered mt_save_tabs Save All
//   no-op, named Save & Close requiring the backend force-close ack,
//   cancelled/absent ack, the late-edit-before-close silent loss, quit
//   payloads for named and untitled tabs, Escape/Don't Save, session prefs writes,
//   muya-derived counts/TOC/cursor, whole-document readers, and the
//   cross-window no-op recorded as not applicable.
// END_CHANGE_SUMMARY

import { test, expect } from '@playwright/test'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { installTauriShim } from '../fixtures/tauri-shim'
import { bootEditor, openFileTab } from '../fixtures/helpers'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const CORPUS_DIR = path.resolve(HERE, '..', 'fixtures', 'large-doc')
const FIXTURE_NAME = 'semantic-edge.md'
// Pinned twice: the corpus manifest below and this literal, so an accidental
// fixture rewrite cannot silently re-freeze different bytes.
const FIXTURE_SHA256 = 'ade8e55420d992759d1ab169e5e1fbb82a21d86ba0575fa33d43763bfe5acd23'
const FIXTURE_PATH = path.join(CORPUS_DIR, FIXTURE_NAME)
const DOC = fs.readFileSync(FIXTURE_PATH, 'utf8')
const NAMED_PATH = '/tmp/mark-e2e/semantic-edge.md'
const TARGET_PARAGRAPH_TEXT = 'measure document paint labels'
const UNTITLED_SELECTOR = '#ag-editor-id span.ag-paragraph'

const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex')

// Mirror of src/muya/lib/utils/index.js wordCount — the exact function the
// editor's change event runs over the emitted Markdown. CJK ideographs count
// as one word each (none in this fixture today, kept for fidelity).
function muyaWordCount (markdown: string) {
  const paragraph = markdown.split(/\n{2,}/).filter((line) => line).length
  const removedChinese = markdown.replace(/[\u4e00-\u9fa5]/g, '')
  const tokens = removedChinese.split(/[\s\n]+/).filter((t) => t)
  const chineseWordLength = markdown.length - removedChinese.length
  return {
    word: chineseWordLength + tokens.length,
    paragraph,
    character: tokens.reduce((acc, t) => acc + t.length, 0) + chineseWordLength,
    all: markdown.length
  }
}

// Mirror of src/muya/lib/contentState/tocCtrl.js getTOC (ATX + setext
// headings, content trimmed). Only content/lvl are compared — block keys and
// slugs are random internal identifiers and are not frozen.
function headingsInMarkdown (markdown: string) {
  const lines = markdown.split('\n')
  const headings: Array<{ content: string; lvl: number }> = []
  for (let i = 0; i < lines.length; i++) {
    const atx = /^(#{1,6})\s+(.*)$/.exec(lines[i])
    if (atx) {
      headings.push({ content: atx[2].trim(), lvl: atx[1].length })
      continue
    }
    const next = lines[i + 1] || ''
    if (/^=+\s*$/.test(next) && lines[i].trim()) {
      headings.push({ content: lines[i].trim(), lvl: 1 })
      i++
    } else if (/^-{2,}\s*$/.test(next) && lines[i].trim()) {
      headings.push({ content: lines[i].trim(), lvl: 2 })
      i++
    }
  }
  return headings
}

test.beforeAll(() => {
  const bytes = fs.readFileSync(FIXTURE_PATH)
  const metadata = JSON.parse(fs.readFileSync(path.join(CORPUS_DIR, 'shape-metadata.json'), 'utf8'))
  const entry = metadata.fixtures.find((f: any) => f.name === FIXTURE_NAME)
  expect(entry, `shape-metadata entry for ${FIXTURE_NAME}`).toBeTruthy()
  expect(bytes.length).toBe(entry.bytes)
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(FIXTURE_SHA256)
  expect(entry.sha256).toBe(FIXTURE_SHA256)
})

async function storeState (page: any) {
  return page.evaluate(() => {
    const pinia = (document.querySelector('#app') as any).__vue_app__.config.globalProperties.$pinia
    const store = pinia._s.get('editor')
    const project = pinia._s.get('project')
    const tab = store.currentFile
    return {
      tabCount: store.tabs.length,
      ids: store.tabs.map((t: any) => t.id),
      toc: (store.listToc || []).map((item: any) => ({ content: item.content, lvl: item.lvl })),
      projectRoot: project?.projectTree?.pathname || '',
      tab: tab?.id
        ? {
            id: tab.id,
            pathname: tab.pathname || '',
            filename: tab.filename || '',
            lineEnding: tab.lineEnding,
            markdown: tab.markdown,
            isSaved: tab.isSaved,
            contentRevision: tab.contentRevision,
            lastSavedHistoryId: tab.lastSavedHistoryId,
            wordCount: tab.wordCount,
            cursor: tab.cursor
              ? { start: tab.cursor.start, end: tab.cursor.end, isEdit: tab.cursor.isEdit }
              : null,
            stackLastId:
              tab.history && tab.history.lastEditIndex >= 0
                ? tab.history.stack[tab.history.lastEditIndex]?.id
                : undefined
          }
        : null
    }
  })
}

async function readTab (page: any) {
  const state = await storeState(page)
  if (!state.tab) throw new Error('no current tab')
  return state.tab
}

async function openFixture (page: any) {
  await bootEditor(page)
  await openFileTab(page, NAMED_PATH, DOC)
  await expect(page.locator('#ag-editor-id h1').first()).toBeVisible({ timeout: 10_000 })
}

function targetParagraph (page: any) {
  return page.locator(`#ag-editor-id span.ag-paragraph`, { hasText: TARGET_PARAGRAPH_TEXT }).last()
}

// The caret lands at the start of the first visual line, independent of the
// paragraph's rendered width, so the inserted marker is the first character of
// the block and the expected cursor offset is computable from the Markdown.
async function editTargetParagraph (page: any, marker: string) {
  const paragraph = targetParagraph(page)
  await paragraph.click({ position: { x: 2, y: 4 } })
  await page.keyboard.press('Home')
  await page.keyboard.type(marker)
  await page.waitForFunction((typed: string) => {
    const store = (document.querySelector('#app') as any).__vue_app__.config.globalProperties.$pinia._s.get('editor')
    return !store.currentFile.isSaved && store.currentFile.markdown.includes(typed)
  }, marker)
}

async function typeIntoUntitled (page: any, marker: string) {
  const paragraph = page.locator(UNTITLED_SELECTOR).last()
  await paragraph.click({ position: { x: 2, y: 4 } })
  await page.keyboard.type(marker)
  await page.waitForFunction((typed: string) => {
    const store = (document.querySelector('#app') as any).__vue_app__.config.globalProperties.$pinia._s.get('editor')
    return !store.currentFile.isSaved && store.currentFile.markdown.includes(typed)
  }, marker)
}

// Capture the payload the store action will send, atomically with starting the
// real action (the transport may resolve later).
async function startSave (page: any) {
  return page.evaluate(() => {
    const store = (document.querySelector('#app') as any).__vue_app__.config.globalProperties.$pinia._s.get('editor')
    const markdown = store.currentFile.markdown
    const revision = store.currentFile.contentRevision
    const id = store.currentFile.id
    void store.FILE_SAVE()
    return { markdown, revision, id }
  })
}

async function startSaveAs (page: any) {
  return page.evaluate(() => {
    const store = (document.querySelector('#app') as any).__vue_app__.config.globalProperties.$pinia._s.get('editor')
    const tab = {
      id: store.currentFile.id,
      filename: store.currentFile.filename,
      markdown: store.currentFile.markdown
    }
    void store.FILE_SAVE_AS()
    return tab
  })
}

async function installSaveMock (page: any) {
  await page.evaluate(() => {
    const w = window as any
    w.__saveCalls = []
    w.__mockInvoke.mt_response_file_save = (args: any) => {
      w.__saveCalls.push(args)
      return { id: args.id, pathname: args.pathname, filename: args.filename, isSaved: true }
    }
  })
}

async function installPendingSaveMock (page: any) {
  await page.evaluate(() => {
    const w = window as any
    w.__saveCalls = []
    w.__saveResolve = null
    w.__mockInvoke.mt_response_file_save = (args: any) => {
      w.__saveCalls.push(args)
      return new Promise((resolve) => {
        w.__saveResolve = resolve
      })
    }
  })
}

async function installSaveAsMock (page: any, destination: string) {
  await page.evaluate((dest: string) => {
    const w = window as any
    w.__saveAsCalls = []
    w.__mockInvoke.mt_response_file_save_as = (args: any) => {
      w.__saveAsCalls.push(args)
      return {
        id: args.id,
        pathname: dest,
        filename: dest.split('/').pop(),
        isSaved: true
      }
    }
  }, destination)
}

async function invokeLog (page: any) {
  return page.evaluate(() => (window as any).__invokeLog || [])
}

function pushDualRecord (
  observedLegacyBehavior: string,
  desiredInvariant: string
) {
  test.info().annotations.push(
    { type: 'observedLegacyBehavior', description: observedLegacyBehavior },
    { type: 'desiredInvariant', description: desiredInvariant }
  )
}

test.describe('save / close / session characterization (C-LARGE-DOC-STAGE-0 T-006)', () => {
  test.describe.configure({ retries: 0 })

  test.beforeEach(async ({ page }) => {
    await installTauriShim(page)
  })

  // ------------------------------------------------------------------
  // 1. Canonical Markdown + exact bytes
  // ------------------------------------------------------------------
  test('FILE_SAVE receives the canonical editor Markdown byte-for-byte and records the saved history id', async ({ page }) => {
    await openFixture(page)
    await editTargetParagraph(page, 'Z')

    const canonicalBeforeSave = await readTab(page)
    expect(canonicalBeforeSave.isSaved).toBe(false)
    // Canonicalization observed on open: muya re-serializes the fixture —
    // the tilde fence becomes a backtick fence and table columns are padded.
    expect(canonicalBeforeSave.markdown.startsWith('# Semantic edges\n')).toBe(true)
    expect(canonicalBeforeSave.markdown).toContain('```\nfenced with tilde and document\n```')
    expect(canonicalBeforeSave.markdown).toContain('| id  | metric    | value |')
    // The frozen corpus bytes and the canonical serialization differ; the
    // suite asserts the transport against the latter, not against the file.
    expect(canonicalBeforeSave.markdown).not.toBe(DOC)
    expect(sha256(canonicalBeforeSave.markdown)).not.toBe(FIXTURE_SHA256)

    await installSaveMock(page)
    const atActionEntry = await startSave(page)
    expect(atActionEntry.markdown).toBe(canonicalBeforeSave.markdown)
    expect(atActionEntry.id).toBe(canonicalBeforeSave.id)
    await page.waitForFunction(() => (window as any).__saveCalls.length === 1)
    const call = await page.evaluate(() => (window as any).__saveCalls[0])

    expect(call.id).toBe(canonicalBeforeSave.id)
    expect(call.pathname).toBe(NAMED_PATH)
    expect(call.filename).toBe('semantic-edge.md')
    expect(call.defaultPath).toBe(null)
    // Exact string identity is the byte contract of the renderer transport.
    expect(call.markdown).toBe(canonicalBeforeSave.markdown)
    expect(sha256(call.markdown)).toBe(sha256(canonicalBeforeSave.markdown))

    await page.waitForFunction(() => {
      const store = (document.querySelector('#app') as any).__vue_app__.config.globalProperties.$pinia._s.get('editor')
      return store.currentFile.isSaved === true
    })
    const canonicalAfterSave = await readTab(page)
    expect(canonicalAfterSave.markdown).toBe(canonicalBeforeSave.markdown)
    expect(canonicalAfterSave.isSaved).toBe(true)
    expect(canonicalAfterSave.lastSavedHistoryId).not.toBe(canonicalBeforeSave.lastSavedHistoryId)
    expect(canonicalAfterSave.lastSavedHistoryId).toBe(canonicalAfterSave.stackLastId)
  })

  // ------------------------------------------------------------------
  // 2. Dirty/saved state + revision ownership / stale ack
  // ------------------------------------------------------------------
  test('contentRevision increments per edit and a stale save ack is blocked while the tab stays dirty', async ({ page }) => {
    const observedLegacyBehavior =
      'A save acknowledgement returned for revision N is applied to a tab already at revision N+1 only as a stale guard: APPLY_SAVE_OUTCOME logs [editor][save][BLOCK_STALE_SAVE_OUTCOME_IGNORED], forces isSaved=false, leaves lastSavedHistoryId unchanged (no later revision becomes clean), and leaves the ignored write unexplained outside the console.'
    const desiredInvariant =
      'Every save acknowledgement must be attributed to the exact revision it wrote; a stale ack may never mark newer content saved, must keep the newer edit dirty, and the reconciled save state must be surfaced to the user and the session/journal rather than only logged.'
    pushDualRecord(observedLegacyBehavior, desiredInvariant)

    await openFixture(page)
    const beforeEdit = await readTab(page)
    await editTargetParagraph(page, 'A')
    const afterFirstEdit = await readTab(page)
    expect(afterFirstEdit.isSaved).toBe(false)
    expect(afterFirstEdit.contentRevision).toBeGreaterThan(beforeEdit.contentRevision)

    await installPendingSaveMock(page)
    const atActionEntry = await startSave(page)
    await page.waitForFunction(() => (window as any).__saveCalls.length === 1)
    const revisionAtSave = await page.evaluate(() => {
      const store = (document.querySelector('#app') as any).__vue_app__.config.globalProperties.$pinia._s.get('editor')
      return store.currentFile.contentRevision
    })
    expect(revisionAtSave).toBe(afterFirstEdit.contentRevision)
    const lastSavedBeforeStaleAck = afterFirstEdit.lastSavedHistoryId

    await editTargetParagraph(page, 'B')
    const afterSecondEdit = await readTab(page)
    expect(afterSecondEdit.contentRevision).toBeGreaterThan(revisionAtSave)
    expect(afterSecondEdit.markdown).toContain('BA' + TARGET_PARAGRAPH_TEXT)

    await page.evaluate(() => {
      const w = window as any
      w.__warns = []
      const originalWarn = console.warn.bind(console)
      console.warn = (...parts: any[]) => {
        w.__warns.push(parts.map(String).join(' '))
        originalWarn(...parts)
      }
      w.__saveResolve({
        id: w.__saveCalls[0].id,
        pathname: w.__saveCalls[0].pathname,
        filename: w.__saveCalls[0].filename,
        isSaved: true
      })
    })
    await page.waitForFunction(() =>
      (window as any).__warns.some((line: string) => line.includes('BLOCK_STALE_SAVE_OUTCOME_IGNORED'))
    )
    const staleWarnings = await page.evaluate(() =>
      (window as any).__warns.filter((line: string) => line.includes('BLOCK_STALE_SAVE_OUTCOME_IGNORED'))
    )
    expect(staleWarnings).toHaveLength(1)
    expect(staleWarnings[0]).toContain(
      `[editor][save][BLOCK_STALE_SAVE_OUTCOME_IGNORED id=${atActionEntry.id}]`
    )

    const afterStaleAck = await readTab(page)
    expect(afterStaleAck.isSaved).toBe(false)
    expect(afterStaleAck.lastSavedHistoryId).toBe(lastSavedBeforeStaleAck)
    expect(afterStaleAck.markdown).toBe(afterSecondEdit.markdown)
    expect(afterStaleAck.contentRevision).toBe(afterSecondEdit.contentRevision)
  })

  // ------------------------------------------------------------------
  // 3a. Save As on an untitled tab
  // ------------------------------------------------------------------
  test('Save As sends the untitled tab payload and applies the acknowledged pathname/filename', async ({ page }) => {
    await bootEditor(page)
    const before = await readTab(page)
    expect(before.pathname).toBe('')
    expect(before.filename).toBe('Untitled-1')
    await typeIntoUntitled(page, 'U')
    const dirty = await readTab(page)
    expect(dirty.markdown).toBe('U\n')

    await installSaveAsMock(page, '/tmp/mark-e2e/save-as-dest.md')
    const atActionEntry = await startSaveAs(page)
    await page.waitForFunction(() => (window as any).__saveAsCalls.length === 1)
    const call = await page.evaluate(() => (window as any).__saveAsCalls[0])

    expect(call.id).toBe(atActionEntry.id)
    expect(call.filename).toBe('Untitled-1')
    expect(call.markdown).toBe(atActionEntry.markdown)
    expect('defaultPath' in call).toBe(true)
    expect(call.defaultPath).toBe(null)

    await page.waitForFunction(() => {
      const store = (document.querySelector('#app') as any).__vue_app__.config.globalProperties.$pinia._s.get('editor')
      return store.currentFile.pathname === '/tmp/mark-e2e/save-as-dest.md'
    })
    const state = await storeState(page)
    expect(state.tabCount).toBe(1)
    const after = state.tab!
    expect(after.pathname).toBe('/tmp/mark-e2e/save-as-dest.md')
    expect(after.filename).toBe('save-as-dest.md')
    expect(after.isSaved).toBe(true)
    expect(after.markdown).toBe(atActionEntry.markdown)
  })

  // ------------------------------------------------------------------
  // 3b. Save As onto a destination owned by another tab
  // ------------------------------------------------------------------
  test('Save As onto a path owned by another tab closes that other tab (observed overwrite semantics)', async ({ page }) => {
    const observedLegacyBehavior =
      'Save As onto a pathname already owned by another saved tab calls APPLY_SAVE_OUTCOME, which finds that tab by path and closes it through CLOSE_TAB before rebinding the saving tab; the owner tab and its history disappear silently and the saving tab becomes the only owner of the path.'
    const desiredInvariant =
      'Save As must detect a destination owned by another tab before writing, surface an explicit overwrite/choose-another-path decision, and never close the owning tab as a side effect of applying a save acknowledgement; the decision and its outcome must be journaled.'
    pushDualRecord(observedLegacyBehavior, desiredInvariant)

    await bootEditor(page)
    await openFileTab(page, '/tmp/mark-e2e/target.md', '# Target\n\nbody\n')
    await expect(page.locator('.editor-with-tabs h1').first()).toBeVisible({ timeout: 5_000 })
    const owner = await readTab(page)
    expect(owner.pathname).toBe('/tmp/mark-e2e/target.md')
    expect(owner.isSaved).toBe(true)

    await page.evaluate(() => {
      (window as any).__bus.emit('mt::new-untitled-tab', { selected: true, markdown: '' })
    })
    await page.waitForFunction(() => {
      const store = (document.querySelector('#app') as any).__vue_app__.config.globalProperties.$pinia._s.get('editor')
      return store.tabs.length === 2 && !store.currentFile.pathname
    })
    await typeIntoUntitled(page, 'T')
    const saving = await readTab(page)
    expect(saving.id).not.toBe(owner.id)

    await installSaveAsMock(page, '/tmp/mark-e2e/target.md')
    await startSaveAs(page)
    await page.waitForFunction(() => {
      const store = (document.querySelector('#app') as any).__vue_app__.config.globalProperties.$pinia._s.get('editor')
      return store.tabs.length === 1
    })
    const after = await storeState(page)
    expect(after.tabCount).toBe(1)
    expect(after.ids).not.toContain(owner.id)
    expect(after.tab).not.toBe(null)
    expect(after.tab!.id).toBe(saving.id)
    expect(after.tab!.pathname).toBe('/tmp/mark-e2e/target.md')
    expect(after.tab!.filename).toBe('target.md')
    expect(after.tab!.isSaved).toBe(true)
  })

  // ------------------------------------------------------------------
  // 4. Save All (ASK_FOR_SAVE_ALL(false))
  // ------------------------------------------------------------------
  test('Save All emits mt_save_tabs with the unsaved payload and applies no save outcome (observed no-op)', async ({ page }) => {
    const observedLegacyBehavior =
      'ASK_FOR_SAVE_ALL(false) sends the unsaved tab payload over the fire-and-forget mt::save-tabs channel (mt_save_tabs) and never applies a save outcome: the transport result is discarded, no tab becomes saved, dirty revisions and lastSavedHistoryId stay untouched, and the real backend command is not registered.'
    const desiredInvariant =
      'Save All must await one save transaction per targeted tab, apply each acknowledgement to the exact revision it wrote, surface partial failures, and leave no tab dirty that the backend actually saved; the transport must be registered and the outcome observable.'
    pushDualRecord(observedLegacyBehavior, desiredInvariant)

    await openFixture(page)
    await editTargetParagraph(page, 'S')
    const before = await readTab(page)
    expect(before.isSaved).toBe(false)

    await page.evaluate(() => {
      const w = window as any
      w.__saveAllCalls = []
      w.__mockInvoke.mt_save_tabs = (args: any) => {
        w.__saveAllCalls.push(args)
        // Even an outcome-shaped reply is ignored: the store uses send().
        return [{ id: args?.args?.[0]?.id, isSaved: true }]
      }
    })
    await page.evaluate(() => {
      const w = window as any
      w.__invokeLog = []
      const store = (document.querySelector('#app') as any).__vue_app__.config.globalProperties.$pinia._s.get('editor')
      store.ASK_FOR_SAVE_ALL(false)
    })
    await page.waitForFunction(() => (window as any).__saveAllCalls.length === 1)
    const log = await invokeLog(page)
    expect(log).toContain('mt_save_tabs')
    expect(log).not.toContain('mt_response_file_save')

    const call = await page.evaluate(() => (window as any).__saveAllCalls[0])
    expect(Array.isArray(call.args)).toBe(true)
    expect(call.args).toHaveLength(1)
    const payload = call.args[0]
    expect(payload.id).toBe(before.id)
    expect(payload.pathname).toBe(NAMED_PATH)
    expect(payload.filename).toBe('semantic-edge.md')
    expect(payload.markdown).toBe(before.markdown)
    expect(payload.options.lineEnding).toBe('lf')
    expect(typeof payload.defaultPath).toBe('string')

    // Give the fire-and-forget send a turn to settle before proving it applied
    // nothing; no state transition exists to wait for.
    await page.waitForTimeout(100)
    const after = await readTab(page)
    expect(after.isSaved).toBe(false)
    expect(after.contentRevision).toBe(before.contentRevision)
    expect(after.lastSavedHistoryId).toBe(before.lastSavedHistoryId)
    expect(after.markdown).toBe(before.markdown)
  })

  // ------------------------------------------------------------------
  // 5a. Save & Close of a dirty named tab, backend ack present
  // ------------------------------------------------------------------
  test('Save & Close sends mt_save_and_close_tabs with the tab payload and closes on the backend close ack', async ({ page }) => {
    const observedLegacyBehavior =
      'Save & Close for a named dirty tab sends one fire-and-forget mt::save-and-close-tabs payload through ipcRenderer.send and returns without awaiting the result; the tab closes only when the backend mt::force-close-tabs-by-id event arrives, and the renderer does not bind that close to the revision the payload captured.'
    const desiredInvariant =
      'Save & Close must be one awaited renderer transaction: write the captured revision, close the tab only on an acknowledgement for that exact revision, and keep the tab open with its edits intact if the acknowledgement is absent, stale or failed.'
    pushDualRecord(observedLegacyBehavior, desiredInvariant)

    await openFixture(page)
    await editTargetParagraph(page, 'W')
    const beforeClose = await readTab(page)

    await page.evaluate(() => {
      const w = window as any
      w.__saveCloseCalls = []
      w.__mockInvoke.mt_save_and_close_tabs = (args: any) => {
        w.__saveCloseCalls.push(args)
        // Mimic the real backend: save, then emit the force-close ack.
        return Promise.resolve(null).then(() => {
          w.__emitFakeEvent('mt::force-close-tabs-by-id', [args.args[0].id])
        })
      }
    })
    await page.evaluate(() => {
      const store = (document.querySelector('#app') as any).__vue_app__.config.globalProperties.$pinia._s.get('editor')
      store.CLOSE_TAB()
    })
    const dialog = page.locator('.ag-unsaved-close-dialog')
    await expect(dialog).toBeVisible({ timeout: 5_000 })
    await page.locator('.ag-unsaved-close-save').click()
    await expect(dialog).toBeHidden({ timeout: 5_000 })
    await page.waitForFunction(() => (window as any).__saveCloseCalls.length === 1)
    const call = await page.evaluate(() => (window as any).__saveCloseCalls[0])
    expect(Array.isArray(call.args)).toBe(true)
    expect(call.args).toHaveLength(1)
    const payload = call.args[0]
    expect(payload.id).toBe(beforeClose.id)
    expect(payload.pathname).toBe(NAMED_PATH)
    expect(payload.filename).toBe('semantic-edge.md')
    expect(payload.markdown).toBe(beforeClose.markdown)
    expect(payload.options.lineEnding).toBe('lf')

    await page.waitForFunction(() => {
      const store = (document.querySelector('#app') as any).__vue_app__.config.globalProperties.$pinia._s.get('editor')
      return store.tabs.length === 0
    })
    const after = await storeState(page)
    expect(after.tabCount).toBe(0)
  })

  // ------------------------------------------------------------------
  // 5b. Save & Close, cancelled/absent ack
  // ------------------------------------------------------------------
  test('Save & Close with an absent backend ack keeps the tab and its content open', async ({ page }) => {
    const observedLegacyBehavior =
      'Save & Close for a named tab resolves the dialog immediately after sending the payload; with no backend acknowledgement the tab remains open and dirty, the content survives, and the user receives no completion or failure signal for the save-and-close request.'
    const desiredInvariant =
      'An absent, cancelled or failed save-and-close acknowledgement must be an explicit observable outcome (failure/cancel state), must never be indistinguishable from success, and must keep the tab and its edits open.'
    pushDualRecord(observedLegacyBehavior, desiredInvariant)

    await openFixture(page)
    await editTargetParagraph(page, 'X')
    const beforeClose = await readTab(page)

    await page.evaluate(() => {
      const w = window as any
      w.__saveCloseCalls = []
      w.__mockInvoke.mt_save_and_close_tabs = (args: any) => {
        w.__saveCloseCalls.push(args)
        return null
      }
    })
    await page.evaluate(() => {
      const store = (document.querySelector('#app') as any).__vue_app__.config.globalProperties.$pinia._s.get('editor')
      store.CLOSE_TAB()
    })
    const dialog = page.locator('.ag-unsaved-close-dialog')
    await expect(dialog).toBeVisible({ timeout: 5_000 })
    await page.locator('.ag-unsaved-close-save').click()
    await expect(dialog).toBeHidden({ timeout: 5_000 })
    await page.waitForFunction(() => (window as any).__saveCloseCalls.length === 1)
    // Settle the fire-and-forget send before proving it applied nothing.
    await page.waitForTimeout(100)

    const after = await readTab(page)
    expect(after.id).toBe(beforeClose.id)
    expect(after.isSaved).toBe(false)
    expect(after.markdown).toBe(beforeClose.markdown)
    expect(after.markdown).toContain('X' + TARGET_PARAGRAPH_TEXT)
    const state = await storeState(page)
    expect(state.tabCount).toBe(1)
  })

  // ------------------------------------------------------------------
  // 6. Edit-after-payload-before-close race
  // ------------------------------------------------------------------
  test('an edit typed while save-and-close is pending is absent from the payload and is lost when the backend closes the tab', async ({ page }) => {
    const observedLegacyBehavior =
      'The save-and-close payload is snapshotted when the dialog is confirmed. An edit typed while the transport is pending is neither in that payload nor sent by any later transport; when the backend later emits mt::force-close-tabs-by-id the tab closes and the late edit disappears silently, with no payload carrying it.'
    const desiredInvariant =
      'A close request must be bound to the revision it captured: any newer edit before the close acknowledgement must abort the close (or trigger a fresh save of the newer revision) and must never be discarded silently; the abort reason must be observable.'
    pushDualRecord(observedLegacyBehavior, desiredInvariant)

    await openFixture(page)
    await editTargetParagraph(page, 'R')
    const beforeClose = await readTab(page)

    await page.evaluate(() => {
      const w = window as any
      w.__saveCloseCalls = []
      w.__mockInvoke.mt_save_and_close_tabs = (args: any) => {
        w.__saveCloseCalls.push(args)
        return new Promise((resolve) => {
          w.__saveCloseResolve = () => {
            resolve(null)
            w.__emitFakeEvent('mt::force-close-tabs-by-id', [args.args[0].id])
          }
        })
      }
    })
    await page.evaluate(() => {
      const store = (document.querySelector('#app') as any).__vue_app__.config.globalProperties.$pinia._s.get('editor')
      store.CLOSE_TAB()
    })
    const dialog = page.locator('.ag-unsaved-close-dialog')
    await expect(dialog).toBeVisible({ timeout: 5_000 })
    await page.locator('.ag-unsaved-close-save').click()
    await expect(dialog).toBeHidden({ timeout: 5_000 })
    await page.waitForFunction(() => (window as any).__saveCloseCalls.length === 1)

    await editTargetParagraph(page, 'LATE')
    const duringPending = await readTab(page)
    expect(duringPending.markdown).toContain('LATE')
    expect(duringPending.contentRevision).toBeGreaterThan(beforeClose.contentRevision)

    const pendingPayload = await page.evaluate(() => (window as any).__saveCloseCalls[0].args[0])
    expect(pendingPayload.markdown).toBe(beforeClose.markdown)
    expect(pendingPayload.markdown).not.toContain('LATE')

    await page.evaluate(() => (window as any).__saveCloseResolve())
    await page.waitForFunction(() => {
      const store = (document.querySelector('#app') as any).__vue_app__.config.globalProperties.$pinia._s.get('editor')
      return store.tabs.length === 0
    })
    const after = await storeState(page)
    expect(after.tabCount).toBe(0)
    // No transport ever carried the late edit.
    const everyPayload = await page.evaluate(() =>
      JSON.stringify((window as any).__saveCloseCalls)
    )
    expect(everyPayload).not.toContain('LATE')
  })

  // ------------------------------------------------------------------
  // 7a. Quit payload — dirty named tab
  // ------------------------------------------------------------------
  test('QUIT_APP with a dirty named tab confirms, sends mt_save_and_close_tabs, then mt_app_quit', async ({ page }) => {
    await openFixture(page)
    await editTargetParagraph(page, 'Q')
    const beforeQuit = await readTab(page)

    await page.evaluate(() => {
      const w = window as any
      w.__invokeLog = []
      w.__quitSaveCalls = []
      w.__quitCalls = 0
      w.__mockInvoke.mt_save_and_close_tabs = (args: any) => {
        w.__quitSaveCalls.push(args)
        return null
      }
      w.__mockInvoke.mt_app_quit = () => {
        w.__quitCalls += 1
        return null
      }
    })
    await page.evaluate(() => {
      const store = (document.querySelector('#app') as any).__vue_app__.config.globalProperties.$pinia._s.get('editor')
      void store.QUIT_APP()
    })
    const box = page.locator('.el-message-box')
    await expect(box).toBeVisible({ timeout: 5_000 })
    expect(await box.locator('.el-message-box__title').innerText()).toBe('Unsaved changes')
    const buttons = await box.locator('.el-button').allInnerTexts()
    expect(buttons.map((text: string) => text.trim())).toEqual(["Don't Save", 'Save & Quit'])

    await box.locator('.el-button--primary').click()
    await page.waitForFunction(() => (window as any).__quitCalls === 1)
    // Flush the session writes that precede mt_app_quit in the same action.
    await page.waitForTimeout(100)
    const log: string[] = await invokeLog(page)
    expect(log).toContain('mt_save_and_close_tabs')
    expect(log).toContain('mt_app_quit')
    expect(log.indexOf('mt_save_and_close_tabs')).toBeLessThan(log.indexOf('mt_app_quit'))
    // The session snapshot is written between the save-and-close transport and
    // the quit itself (prefs set through mt::prefs::set -> mt_prefs_set).
    expect(log.indexOf('mt_prefs_set')).toBeGreaterThan(log.indexOf('mt_save_and_close_tabs'))
    expect(log.indexOf('mt_prefs_set')).toBeLessThan(log.indexOf('mt_app_quit'))

    const calls = await page.evaluate(() => (window as any).__quitSaveCalls)
    expect(calls).toHaveLength(1)
    expect(Array.isArray(calls[0].args)).toBe(true)
    const payload = calls[0].args[0]
    expect(payload.id).toBe(beforeQuit.id)
    expect(payload.pathname).toBe(NAMED_PATH)
    expect(payload.filename).toBe('semantic-edge.md')
    expect(payload.markdown).toBe(beforeQuit.markdown)
    expect(typeof payload.defaultPath).toBe('string')
    expect(payload.options.lineEnding).toBe('lf')
  })

  // ------------------------------------------------------------------
  // 7b. Quit payload — only untitled dirty tabs
  // ------------------------------------------------------------------
  test('QUIT_APP with only an untitled dirty tab quits without any save transport', async ({ page }) => {
    await bootEditor(page)
    expect((await storeState(page)).tabCount).toBe(1)
    await typeIntoUntitled(page, 'U')

    await page.evaluate(() => {
      const w = window as any
      w.__invokeLog = []
      w.__quitCalls = 0
      w.__mockInvoke.mt_save_and_close_tabs = () => {
        w.__untitledSaveCalled = true
        return null
      }
      w.__mockInvoke.mt_save_tabs = () => {
        w.__untitledBatchSaveCalled = true
        return null
      }
      w.__mockInvoke.mt_app_quit = () => {
        w.__quitCalls += 1
        return null
      }
    })
    await page.evaluate(() => {
      const store = (document.querySelector('#app') as any).__vue_app__.config.globalProperties.$pinia._s.get('editor')
      void store.QUIT_APP()
    })
    const box = page.locator('.el-message-box')
    await expect(box).toBeVisible({ timeout: 5_000 })
    const buttons = await box.locator('.el-button').allInnerTexts()
    expect(buttons.map((text: string) => text.trim())).toEqual(["Don't Save", 'Discard & Quit'])
    expect(await box.locator('.el-message-box__message').innerText()).toContain('untitled')

    await box.locator('.el-button--primary').click()
    await page.waitForFunction(() => (window as any).__quitCalls === 1)
    // Flush the session writes that precede mt_app_quit in the same action.
    await page.waitForTimeout(100)
    const log: string[] = await invokeLog(page)
    expect(log).toContain('mt_app_quit')
    expect(log).not.toContain('mt_save_and_close_tabs')
    expect(log).not.toContain('mt_save_tabs')
    expect(await page.evaluate(() => !!(window as any).__untitledSaveCalled)).toBe(false)
    expect(await page.evaluate(() => !!(window as any).__untitledBatchSaveCalled)).toBe(false)
  })

  // ------------------------------------------------------------------
  // 7c. Quit cancel / Escape
  // ------------------------------------------------------------------
  test('Escape on the quit confirmation keeps the app open and dispatches no quit', async ({ page }) => {
    await openFixture(page)
    await editTargetParagraph(page, 'E')

    await page.evaluate(() => {
      const w = window as any
      w.__invokeLog = []
      w.__quitCalls = 0
      w.__mockInvoke.mt_app_quit = () => {
        w.__quitCalls += 1
        return null
      }
    })
    await page.evaluate(() => {
      const store = (document.querySelector('#app') as any).__vue_app__.config.globalProperties.$pinia._s.get('editor')
      void store.QUIT_APP()
    })
    const box = page.locator('.el-message-box')
    await expect(box).toBeVisible({ timeout: 5_000 })
    await page.keyboard.press('Escape')
    await expect(box).toBeHidden({ timeout: 5_000 })
    await page.waitForTimeout(150)

    expect(await page.evaluate(() => (window as any).__quitCalls)).toBe(0)
    const log: string[] = await invokeLog(page)
    expect(log).not.toContain('mt_app_quit')
    expect(log).not.toContain('mt_save_and_close_tabs')
    const state = await storeState(page)
    expect(state.tabCount).toBe(1)
    expect(state.tab!.isSaved).toBe(false)
  })

  // ------------------------------------------------------------------
  // 7d. Quit secondary action — Don't Save
  // ------------------------------------------------------------------
  test("Don't Save on the quit dialog quits without any save transport", async ({ page }) => {
    await openFixture(page)
    await editTargetParagraph(page, 'D')
    const beforeQuit = await readTab(page)

    await page.evaluate(() => {
      const w = window as any
      w.__invokeLog = []
      w.__quitCalls = 0
      w.__mockInvoke.mt_save_and_close_tabs = () => {
        w.__dontSaveTransportCalled = true
        return null
      }
      w.__mockInvoke.mt_save_tabs = () => {
        w.__dontSaveBatchCalled = true
        return null
      }
      w.__mockInvoke.mt_app_quit = () => {
        w.__quitCalls += 1
        return null
      }
    })
    await page.evaluate(() => {
      const store = (document.querySelector('#app') as any).__vue_app__.config.globalProperties.$pinia._s.get('editor')
      void store.QUIT_APP()
    })
    const box = page.locator('.el-message-box')
    await expect(box).toBeVisible({ timeout: 5_000 })
    // The secondary button is the documented discard-and-quit action (not a
    // stay-open cancel); Escape/close is the only stay-open dismissal.
    await box.locator('.el-button', { hasText: "Don't Save" }).click()
    await page.waitForFunction(() => (window as any).__quitCalls === 1)
    // Flush the session writes that precede mt_app_quit in the same action.
    await page.waitForTimeout(100)
    const log: string[] = await invokeLog(page)
    expect(log).toContain('mt_app_quit')
    expect(log).not.toContain('mt_save_and_close_tabs')
    expect(log).not.toContain('mt_save_tabs')
    expect(await page.evaluate(() => !!(window as any).__dontSaveTransportCalled)).toBe(false)
    expect(await page.evaluate(() => !!(window as any).__dontSaveBatchCalled)).toBe(false)
    // The dirty content is still in the tab state; the user chose to quit
    // without committing it (the harness stops the process at mt_app_quit).
    expect(beforeQuit.isSaved).toBe(false)
  })

  // ------------------------------------------------------------------
  // 8. Session boundary
  // ------------------------------------------------------------------
  test('_saveSessionState writes lastSessionTabs/lastSessionActive/lastSessionFolders through mt_prefs_set', async ({ page }) => {
    await openFixture(page)
    const snapshot = await storeState(page)
    const expected = {
      tabs: await page.evaluate(() => {
        const store = (document.querySelector('#app') as any).__vue_app__.config.globalProperties.$pinia._s.get('editor')
        return store.tabs.map((tab: any) => tab.pathname).filter(Boolean)
      }),
      active: snapshot.tab!.pathname,
      folders: await page.evaluate(() => {
        const project = (document.querySelector('#app') as any).__vue_app__.config.globalProperties.$pinia._s.get('project')
        return (project.projectTrees || []).map((root: any) => root.pathname).filter(Boolean)
      })
    }
    expect(expected.tabs).toEqual([NAMED_PATH])
    expect(expected.active).toBe(NAMED_PATH)

    await page.evaluate(() => {
      const w = window as any
      w.__prefsWrites = []
      w.__mockInvoke.mt_prefs_set = (args: any) => {
        w.__prefsWrites.push(args)
        return null
      }
    })
    await page.evaluate(() => {
      const w = window as any
      w.__invokeLog = []
      const store = (document.querySelector('#app') as any).__vue_app__.config.globalProperties.$pinia._s.get('editor')
      void store._saveSessionState()
    })
    await page.waitForFunction(() => {
      const writes = (window as any).__prefsWrites || []
      return ['lastSessionTabs', 'lastSessionActive', 'lastSessionFolders'].every((key) =>
        writes.some((entry: any) => entry.key === key)
      )
    })
    const writes = await page.evaluate(() => (window as any).__prefsWrites)
    const valueOf = (key: string) => {
      const matches = writes.filter((entry: any) => entry.key === key)
      expect(matches.length).toBeGreaterThan(0)
      return matches[matches.length - 1].value
    }
    // The real transport is ipcPrefs.set -> ipcInvoke('mt::prefs::set') ->
    // shim mapping 'mt_prefs_set'; mt_set_user_preference is the backend
    // broadcast command and is NOT the write channel.
    expect(valueOf('lastSessionTabs')).toEqual(expected.tabs)
    expect(valueOf('lastSessionActive')).toBe(expected.active)
    expect(valueOf('lastSessionFolders')).toEqual(expected.folders)
    const log: string[] = await invokeLog(page)
    expect(log).toContain('mt_prefs_set')
    expect(log).not.toContain('mt_set_user_preference')
  })

  // ------------------------------------------------------------------
  // 9. Word count / TOC / cursor at the forced boundary
  // ------------------------------------------------------------------
  test('after an edit and save, wordCount/TOC/cursor match the canonical Markdown computed in the spec', async ({ page }) => {
    await openFixture(page)
    await editTargetParagraph(page, 'Z')
    const cursorBeforeSave = (await readTab(page)).cursor

    await installSaveMock(page)
    const atActionEntry = await startSave(page)
    await page.waitForFunction(() => {
      const store = (document.querySelector('#app') as any).__vue_app__.config.globalProperties.$pinia._s.get('editor')
      return store.currentFile.isSaved === true
    })
    const state = await storeState(page)
    const tab = state.tab!
    expect(tab.markdown).toBe(atActionEntry.markdown)

    // wordCount: computed in the spec from the canonical Markdown with the
    // same tokenizer muya runs (src/muya/lib/utils/index.js wordCount).
    expect(tab.wordCount).toEqual(muyaWordCount(tab.markdown))

    // TOC: derived from the canonical Markdown headings (ATX + setext).
    expect(state.toc).toEqual(headingsInMarkdown(tab.markdown))
    expect(state.toc.length).toBe(3)

    // Cursor: the typed marker is the first character of the edited plain
    // paragraph, so muya's reported block offset is computable from the
    // canonical line; the caret is collapsed and marked as an edit.
    const editedLine = tab.markdown
      .split('\n')
      .find((line: string) => line.startsWith('Z') && line.includes(TARGET_PARAGRAPH_TEXT))
    expect(editedLine).toBeTruthy()
    expect(tab.markdown.split('Z').length - 1).toBe(1)
    const expectedOffset = editedLine!.indexOf('Z') + 1
    expect(tab.cursor).not.toBe(null)
    expect(tab.cursor!.start.offset).toBe(expectedOffset)
    expect(tab.cursor!.end.offset).toBe(expectedOffset)
    expect(tab.cursor!.start.key).toBe(tab.cursor!.end.key)
    expect(tab.cursor!.isEdit).toBe(true)
    // Saving does not move the caret.
    expect(tab.cursor).toEqual(cursorBeforeSave)
  })

  // ------------------------------------------------------------------
  // 10a. Controlled reader — whole-document Copy as Markdown
  // ------------------------------------------------------------------
  test('whole-document Copy as Markdown writes the canonical Markdown, for the command and the tab context path', async ({ page }) => {
    await openFixture(page)
    await editTargetParagraph(page, 'C')
    const canonical = (await readTab(page)).markdown

    await page.evaluate(() => {
      const w = window as any
      w.__commandClips = []
      w.__mockInvoke['plugin:clipboard-manager|write_text'] = (args: any) => {
        w.__commandClips.push(args)
        return null
      }
      w.__tabClips = []
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async (text: string) => {
            w.__tabClips.push(text)
          }
        }
      })
    })

    // Edit › Copy as Markdown (command palette/menu flavor): muya getMarkdown.
    await page.evaluate(() => {
      (window as any).__bus.emit('cmd::execute', 'edit.copy-as-markdown')
    })
    await page.waitForFunction(() => (window as any).__commandClips.length > 0, undefined, {
      timeout: 5_000
    })
    const commandClip = await page.evaluate(
      () => (window as any).__commandClips[(window as any).__commandClips.length - 1]
    )
    expect(commandClip).toEqual({ text: canonical })

    // Tab context menu flavor: the clicked tab's own Markdown (tabs.vue
    // TABS::copy-as-markdown -> window.electron.clipboard.writeText).
    await page.evaluate(() => {
      const store = (document.querySelector('#app') as any).__vue_app__.config.globalProperties.$pinia._s.get('editor')
      ;(window as any).__bus.emit('TABS::copy-as-markdown', store.currentFile.id)
    })
    await page.waitForFunction(() => (window as any).__tabClips.length > 0, undefined, {
      timeout: 5_000
    })
    const tabClip = await page.evaluate(
      () => (window as any).__tabClips[(window as any).__tabClips.length - 1]
    )
    expect(tabClip).toBe(canonical)
  })

  // ------------------------------------------------------------------
  // 10b. Controlled reader — styled HTML export
  // ------------------------------------------------------------------
  test('styled HTML export renders the same canonical Markdown to a captured HTML file', async ({ page }) => {
    await openFixture(page)
    await editTargetParagraph(page, 'C')
    const canonical = (await readTab(page)).markdown

    await page.evaluate(() => {
      const w = window as any
      w.__written = []
      w.__mockInvoke['plugin:dialog|save'] = () => '/tmp/mark-e2e/styled-export.html'
      w.__mockInvoke.mt_fs_write = (args: any) => {
        w.__written.push(args)
        return null
      }
    })
    await page.evaluate(() => {
      ;(window as any).__emitFakeEvent('mt::menu-invoked', 'file.export-file-html')
    })
    const dialog = page.locator('.el-dialog', { hasText: 'Export Options' })
    await expect(dialog).toBeVisible({ timeout: 5_000 })
    await dialog.locator('.button-controlls .button-primary').click()
    await page.waitForFunction(() => (window as any).__written.length > 0, undefined, {
      timeout: 10_000
    })
    const written = await page.evaluate(() => (window as any).__written[0])
    expect(written.path).toBe('/tmp/mark-e2e/styled-export.html')
    // The reader is fed the live editor document: the same headings, the
    // same edited paragraph and the same footnote text as the canonical
    // Markdown, rendered to HTML (no raw Markdown fence remains).
    expect(written.content).toContain('<h1')
    expect(written.content).toContain('Semantic edges')
    expect(written.content).toContain('Setext Heading One')
    expect(written.content).toContain('Setext Heading Two')
    expect(written.content).toContain(`C${TARGET_PARAGRAPH_TEXT}`)
    expect(written.content).toContain('The second footnote')
    expect(written.content).not.toContain('```')
    expect(canonical).toContain(`C${TARGET_PARAGRAPH_TEXT}`)
  })

  // ------------------------------------------------------------------
  // 11. Cross-window — recorded as not applicable, asserted as a no-op
  // ------------------------------------------------------------------
  test('File > New Window is a single-window no-op, so cross-window ownership is not applicable', async ({ page }) => {
    test.info().annotations.push({
      type: 'notApplicable',
      description:
        'Cross-window save/quit/session ownership cannot be characterized in this renderer harness: the --new-window CLI flag is a documented no-op until F-MULTI-WINDOW lands, and File > New Window only emits mt::cmd-new-editor-window (mt_cmd_new_editor_window) with no window factory behind the shim. F-MULTI-WINDOW is the trigger for adding real two-window coverage.'
    })
    await bootEditor(page)
    const windowsBefore = await page.evaluate(
      () => (window as any).__TAURI_INTERNALS__.metadata.windows.length
    )
    expect(windowsBefore).toBe(1)

    await page.evaluate(() => {
      const w = window as any
      w.__invokeLog = []
      w.__bus.emit('cmd::execute', 'file.new-window')
    })
    await page.waitForFunction(() =>
      ((window as any).__invokeLog || []).includes('mt_cmd_new_editor_window')
    )
    // Give any (nonexistent) window factory a turn before asserting the count.
    await page.waitForTimeout(150)
    const windowsAfter = await page.evaluate(
      () => (window as any).__TAURI_INTERNALS__.metadata.windows.length
    )
    expect(windowsAfter).toBe(1)
    expect(await page.locator('.editor-with-tabs').count()).toBe(1)
  })
})
