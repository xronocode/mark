// FILE: tests/e2e/perf/characterization-ime-seeded.spec.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Freeze CURRENT IME-composition behavior at the save/close/session boundaries and run deterministic seeded multi-action sessions for C-LARGE-DOC-STAGE-0 T-008 (spec R-6/R-7), recording every observed defect as observedLegacyBehavior paired with desiredInvariant — never as an accepted oracle.
//   SCOPE: Renderer-only Playwright WebKit tier (vite preview + tauri shim) against the real Muya composition handlers and the real Pinia editor store. WebKit automation has no native IME driver, so the composition envelope is synthesized: compositionstart/compositionend are bubbling CompositionEvents dispatched on the real contenteditable paragraph while the text itself enters through Playwright's real keyboard editing path (keyboard.type / keyboard.insertText → native input events). Muya's real isComposed gate, inputHandler, getMarkdown and store LISTEN_FOR_CONTENT_CHANGE are the subject; no markdown is written directly to fake an outcome. Native process exit, native pickers and real disk bytes are the only unreachable parts and are asserted at the renderer transport instead (see the boundary coverage note).
//   DEPENDS: Playwright webkit-perf, tests/e2e/fixtures/tauri-shim.ts, tests/e2e/fixtures/helpers.ts, the real Pinia editor store, tests/e2e/fixtures/large-doc/semantic-edge.md pinned in shape-metadata.json.
//   LINKS: .grace/changes/active/C-LARGE-DOC-STAGE-0/plan.xml T-008 (spec R-6/R-7); .grace/verification/performance.xml V-M-060; src/muya/lib/eventHandler/keyboard.js recordIsComposed/inputBinding; src/muya/lib/contentState/inputCtrl.js inputHandler; src/renderer/src/store/editor.js FILE_SAVE/FILE_SAVE_AS/ASK_FOR_SAVE_ALL/HANDLE_AUTO_SAVE/APPLY_FILE_CHANGE/UPDATE_CURRENT_FILE/CLOSE_TAB/QUIT_APP.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   FIXTURE / METADATA - committed semantic-edge fixture and its sha256/byte pin.
//   PINYIN / HANGUL / DEADKEY - composition payloads (ASCII pinyin via keyboard.type; Hangul/dead-key glyphs via keyboard.insertText).
//   fixtureIdentity - reads the fixture and proves byte length + sha256 match shape-metadata.json.
//   mulberry32 - tiny deterministic PRNG used by the seeded sessions.
//   SEED / FAILING_SEED - fixed seeds for the mixed session and the known-loss scenario.
//   readStore / readDom / readDialogs - snapshots of the real editor store, rendered surface and dialogs.
//   startComposition / endComposition / dispatchRawCompositionEnd - synthesize the composition envelope around real input-path text insertion.
//   bootDocument - reload the app and open a named document through mt::open-new-tab.
//   SAVE_ROW / SAVE_AS_ROW / SAVE_ALL_ROW / AUTOSAVE_ROW / EXTERNAL_CHANGE_ROW / TAB_SWITCH_ROW / SOURCE_TOGGLE_ROW / DIFF_ENTRY_ROW / EXPORT_ROW / COPY_ROW / WORKSPACE_REPLACE_ROW / RENAME_ROW / MOVE_ROW / CLOSE_ROW / QUIT_ROW - the table-driven R-6 boundary set.
//   runBoundaryRows - one fresh boot per row; captures before/during/after state and dual-records every row.
//   buildSeededSession / runSeededSession / minimizeTrace - deterministic mixed sessions and their retained trace.
//   runCloseLossScenario - the seeded known-loss boundary (clean-looking close during composition).
//   AUTOSAVE_ROW - type or helper used by the R-6 boundary/seeded scenarios.
//   BootOptions - type or helper used by the R-6 boundary/seeded scenarios.
//   BoundaryObservation - type or helper used by the R-6 boundary/seeded scenarios.
//   BoundaryRow - type or helper used by the R-6 boundary/seeded scenarios.
//   CLOSE_ROW - type or helper used by the R-6 boundary/seeded scenarios.
//   COPY_ROW - type or helper used by the R-6 boundary/seeded scenarios.
//   CloseLossRun - type or helper used by the R-6 boundary/seeded scenarios.
//   DEADKEY - type or helper used by the R-6 boundary/seeded scenarios.
//   DIFF_ENTRY_ROW - type or helper used by the R-6 boundary/seeded scenarios.
//   DomSnapshot - type or helper used by the R-6 boundary/seeded scenarios.
//   EXPORT_ROW - type or helper used by the R-6 boundary/seeded scenarios.
//   EXTERNAL_CHANGE_ROW - type or helper used by the R-6 boundary/seeded scenarios.
//   EXTERNAL_DOC - type or helper used by the R-6 boundary/seeded scenarios.
//   FAILING_SEED - type or helper used by the R-6 boundary/seeded scenarios.
//   FIXTURE_MARKDOWN - type or helper used by the R-6 boundary/seeded scenarios.
//   FIXTURE_PATH - type or helper used by the R-6 boundary/seeded scenarios.
//   FixtureIdentity - type or helper used by the R-6 boundary/seeded scenarios.
//   HANGUL - type or helper used by the R-6 boundary/seeded scenarios.
//   IME_PATH - type or helper used by the R-6 boundary/seeded scenarios.
//   METADATA - type or helper used by the R-6 boundary/seeded scenarios.
//   MOVE_ROW - type or helper used by the R-6 boundary/seeded scenarios.
//   QUIT_ROW - type or helper used by the R-6 boundary/seeded scenarios.
//   RENAME_ROW - type or helper used by the R-6 boundary/seeded scenarios.
//   SAVE_ALL_ROW - type or helper used by the R-6 boundary/seeded scenarios.
//   SAVE_AS_ROW - type or helper used by the R-6 boundary/seeded scenarios.
//   SEEDED_ACTIONS_HELP - type or helper used by the R-6 boundary/seeded scenarios.
//   SOURCE_TOGGLE_ROW - type or helper used by the R-6 boundary/seeded scenarios.
//   SeededKind - type or helper used by the R-6 boundary/seeded scenarios.
//   SeededSessionResult - type or helper used by the R-6 boundary/seeded scenarios.
//   SeededTraceStep - type or helper used by the R-6 boundary/seeded scenarios.
//   StoreSnapshot - type or helper used by the R-6 boundary/seeded scenarios.
//   TAB_SWITCH_ROW - type or helper used by the R-6 boundary/seeded scenarios.
//   TabSnapshot - type or helper used by the R-6 boundary/seeded scenarios.
//   WORKSPACE_REPLACE_ROW - type or helper used by the R-6 boundary/seeded scenarios.
//   digestSessionState - type or helper used by the R-6 boundary/seeded scenarios.
//   dispatchRawCompositionEnd - type or helper used by the R-6 boundary/seeded scenarios.
//   endComposition - type or helper used by the R-6 boundary/seeded scenarios.
//   invokeLog - type or helper used by the R-6 boundary/seeded scenarios.
//   minimizeTrace - type or helper used by the R-6 boundary/seeded scenarios.
//   pageErrorsByTest - type or helper used by the R-6 boundary/seeded scenarios.
//   readDialogs - type or helper used by the R-6 boundary/seeded scenarios.
//   readDom - type or helper used by the R-6 boundary/seeded scenarios.
//   resetInvokeLog - type or helper used by the R-6 boundary/seeded scenarios.
//   runSeededSession - type or helper used by the R-6 boundary/seeded scenarios.
//   watchPageErrors - type or helper used by the R-6 boundary/seeded scenarios.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-27 C-LARGE-DOC-STAGE-0 T-008: initial
//   characterization oracle. Records current composition behavior at save,
//   Save As, Save All, autosave, external change, tab switch, source mode,
//   diff entry, export, copy, workspace replace, rename, move, close and quit,
//   plus active-composition model mutations, a seeded deterministic session
//   and a seeded known-loss close scenario. No production code is modified.
// END_CHANGE_SUMMARY

import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { installTauriShim } from '../fixtures/tauri-shim'
import { bootEditor, openFileTab } from '../fixtures/helpers'

const FIXTURE = 'semantic-edge.md'
const FIXTURE_PATH = resolve('tests/e2e/fixtures/large-doc', FIXTURE)
const METADATA = JSON.parse(
  readFileSync(resolve('tests/e2e/fixtures/large-doc/shape-metadata.json'), 'utf8')
)

const PINYIN = 'nihao'
const HANGUL = '한국'
const DEADKEY = 'café'

const IME_PATH = '/tmp/mark-e2e/ime-characterization.md'
const EXTERNAL_DOC = '# External rewrite\n\nChanged on disk.\n'

const SEED = 0x5eed1a3
const FAILING_SEED = 0x1a2b3c4d

interface FixtureIdentity {
  text: string
  bytes: number
  sha256: string
}

function fixtureIdentity (): FixtureIdentity {
  const text = readFileSync(FIXTURE_PATH, 'utf8')
  const bytes = Buffer.byteLength(text)
  const sha256 = createHash('sha256').update(text).digest('hex')
  const pin = (METADATA.fixtures as Array<{ name: string, bytes: number, sha256: string }>).find(
    (f) => f.name === FIXTURE
  )
  expect(pin, `${FIXTURE} must be pinned in shape-metadata.json`).toBeTruthy()
  expect(bytes, `${FIXTURE} byte length must match its committed pin`).toBe(pin!.bytes)
  expect(sha256, `${FIXTURE} sha256 must match its committed pin`).toBe(pin!.sha256)
  return { text, bytes, sha256 }
}

const FIXTURE_MARKDOWN = readFileSync(FIXTURE_PATH, 'utf8')

test.beforeAll(() => {
  // Pin the fixture's exact bytes/sha256 from shape-metadata.json before any
  // characterization result is allowed to stand.
  fixtureIdentity()
})

// START_BLOCK_SEEDED_PRNG
// Deterministic PRNG: mulberry32. Fixed seeds only — no Math.random, no clock,
// no engine-dependent ordering. The same seed reconstructs the same action
// list and therefore the same session.
function mulberry32 (seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
// END_BLOCK_SEEDED_PRNG

interface TabSnapshot {
  pathname: string | null
  markdown: string
  isSaved: boolean
  diffMode: boolean
}

interface StoreSnapshot {
  activeId: string | null
  activePath: string | null
  activeMarkdown: string | null
  activeSaved: boolean
  tabCount: number
  tabs: TabSnapshot[]
  sourceCode: boolean
}

interface DomSnapshot {
  editorText: string | null
  paragraphText: string | null
  sourceValue: string | null
  diffVisible: boolean
  diffText: string | null
}

async function readStore (page: Page): Promise<StoreSnapshot> {
  return page.evaluate(() => {
    const app = document.querySelector('#app') as any
    const pinia = app.__vue_app__.config.globalProperties.$pinia
    const store = pinia._s.get('editor')
    const prefs = pinia._s.get('preferences')
    return {
      activeId: store.currentFile?.id ?? null,
      activePath: store.currentFile?.pathname ?? null,
      activeMarkdown: typeof store.currentFile?.markdown === 'string' ? store.currentFile.markdown : null,
      activeSaved: !!store.currentFile?.isSaved,
      tabCount: store.tabs.length,
      tabs: store.tabs.map((t: any) => ({
        pathname: t.pathname ?? null,
        markdown: typeof t.markdown === 'string' ? t.markdown : '',
        isSaved: !!t.isSaved,
        diffMode: !!t.diffMode
      })),
      sourceCode: !!prefs.sourceCode
    }
  })
}

async function readDom (page: Page): Promise<DomSnapshot> {
  return page.evaluate(() => {
    const editor = document.querySelector('#ag-editor-id') as HTMLElement | null
    const paragraphs = document.querySelectorAll('#ag-editor-id span.ag-paragraph')
    const last = paragraphs[paragraphs.length - 1] as HTMLElement | undefined
    const cm = document.querySelector('.source-code .CodeMirror') as any
    const diff = document.querySelector('.diff-view') as HTMLElement | null
    return {
      editorText: editor ? editor.textContent : null,
      paragraphText: last ? last.textContent : null,
      sourceValue: cm?.CodeMirror?.getValue?.() ?? null,
      diffVisible: !!diff,
      diffText: diff ? diff.textContent : null
    }
  })
}

async function readDialogs (page: Page) {
  return page.evaluate(() => ({
    unsaved: document.querySelectorAll('.ag-unsaved-close-dialog').length,
    workspace: document.querySelectorAll('.workspace-mode-dialog').length,
    messageBox: document.querySelectorAll('.el-message-box').length
  }))
}

// START_BLOCK_COMPOSITION_ENVELOPE
// WebKit automation cannot attach a native IME. The envelope is synthesized on
// the REAL contenteditable paragraph: a bubbling compositionstart flips Muya's
// real isComposed flag (eventHandler/keyboard.js recordIsComposed), the text is
// then inserted through Playwright's real keyboard editing path, so the native
// input event reaches Muya's real inputBinding and is suppressed by the real
// gate, and a bubbling compositionend makes Muya's real handler call
// contentState.inputHandler and dispatch stateChange. Because the gate is real,
// the store markdown stays stale during the envelope while the DOM already
// holds the composed text — exactly the state a live IME exposes.
async function startComposition (page: Page, text: string, via: 'type' | 'insertText' = 'type') {
  const paragraph = page.locator('#ag-editor-id span.ag-paragraph').last()
  await paragraph.click()
  await page.keyboard.press('End')
  await page.evaluate(() => {
    const paragraphs = document.querySelectorAll('#ag-editor-id span.ag-paragraph')
    const target = paragraphs[paragraphs.length - 1] as HTMLElement
    target.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' }))
  })
  if (via === 'insertText') await page.keyboard.insertText(text)
  else await page.keyboard.type(text)
  await expect.poll(async () => (await readDom(page)).paragraphText, { timeout: 5_000 })
    .toContain(text)
  const during = await readStore(page)
  // The real Muya gate suppresses inputHandler while composing: the composed
  // text is in the DOM but not yet in Markdown.
  expect(during.activeMarkdown ?? '', 'composed text must not reach markdown before compositionend')
    .not.toContain(text)
}

async function endComposition (page: Page, data: string) {
  await page.evaluate((payload) => {
    const paragraphs = document.querySelectorAll('#ag-editor-id span.ag-paragraph')
    const target = paragraphs[paragraphs.length - 1] as HTMLElement
    target.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: payload }))
  }, data)
  await expect.poll(async () => (await readStore(page)).activeMarkdown ?? '', { timeout: 5_000 })
    .toContain(data)
}
async function dispatchRawCompositionEnd (page: Page, data = ''): Promise<void> {
  await page.evaluate((payload) => {
    const paragraphs = document.querySelectorAll('#ag-editor-id span.ag-paragraph')
    const target = paragraphs[paragraphs.length - 1] as HTMLElement | undefined
    if (target) target.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: payload }))
  }, data)
  await page.waitForTimeout(250)
}
// END_BLOCK_COMPOSITION_ENVELOPE

interface BootOptions {
  pathname?: string
  markdown?: string
}

async function bootDocument (page: Page, opts: BootOptions = {}): Promise<StoreSnapshot> {
  await bootEditor(page)
  const pathname = opts.pathname ?? IME_PATH
  await openFileTab(page, pathname, opts.markdown ?? FIXTURE_MARKDOWN)
  await expect.poll(async () => (await readStore(page)).activePath, { timeout: 10_000 })
    .toBe(pathname)
  await expect(page.locator('#ag-editor-id span.ag-paragraph').last())
    .toBeVisible({ timeout: 10_000 })
  return readStore(page)
}

// The store transport mocks live in the page. Every invoke name is also
// captured in window.__invokeLog by the tauri shim.
test.describe.configure({ retries: 0 })

test.describe('IME composition while editing (R-6)', () => {
  test('composition text reaches Markdown only on compositionend and dirties the tab', async ({ page }) => {
    const observedLegacyBehavior =
      'While compositionstart is active Muya suppresses inputHandler: the composed text is visible in the DOM but the store Markdown and isSaved stay unchanged. Bubbling compositionend calls the real inputHandler, commits the composed text into Markdown and flips isSaved to false.'
    const desiredInvariant =
      'Composed text is committed exactly once at compositionend, Markdown contains it and the tab is dirty until saved — no silent pre-composition loss and no double insertion.'

    await installTauriShim(page)

    // Each payload runs on its own fresh document: a previous composition can
    // leave the caret mid-payload when the target block ends with a newline
    // (footnote-definition paragraph), and that interleaving belongs to the
    // boundary matrix, not to the baseline commit assertion.
    const payloads: Array<{ pathname: string, text: string, via: 'type' | 'insertText' }> = [
      { pathname: '/tmp/mark-e2e/ime-edit-pinyin.md', text: PINYIN, via: 'type' },
      { pathname: '/tmp/mark-e2e/ime-edit-hangul.md', text: HANGUL, via: 'insertText' },
      { pathname: '/tmp/mark-e2e/ime-edit-deadkey.md', text: DEADKEY, via: 'insertText' }
    ]

    for (const payload of payloads) {
      await test.step(`compose ${JSON.stringify(payload.text)}`, async () => {
        const before = await bootDocument(page, { pathname: payload.pathname })
        expect(before.activeSaved, 'fresh named document is clean').toBe(true)
        expect(before.activeMarkdown ?? '').not.toContain(payload.text)

        await startComposition(page, payload.text, payload.via)
        const during = await readStore(page)
        expect(during.activeMarkdown ?? '', 'preedit stays out of Markdown while composing')
          .not.toContain(payload.text)
        expect(during.activeSaved, 'preedit does not dirty the tab before compositionend').toBe(true)
        expect((await readDom(page)).editorText ?? '').toContain(payload.text)

        await endComposition(page, payload.text)
        const after = await readStore(page)
        expect(after.activeMarkdown ?? '', 'compositionend commits the exact payload').toContain(payload.text)
        expect(after.activeSaved, 'committed composition dirtied the tab').toBe(false)
      })
    }

    test.info().annotations.push(
      { type: 'observedLegacyBehavior', description: observedLegacyBehavior },
      { type: 'desiredInvariant', description: desiredInvariant }
    )
  })
})

test.describe('IME composition then save (R-6/R-7)', () => {
  test('FILE_SAVE during active composition sends the pre-composition markdown and marks the tab saved', async ({ page }) => {
    const observedLegacyBehavior =
      'FILE_SAVE reads currentFile.markdown, which Muya has not updated while composition is active. The transport receives the exact pre-composition Markdown (the composed text is only in the DOM), the tab becomes isSaved=true, and compositionend later commits the text locally and marks the tab dirty again — the write and the screen disagree.'
    const desiredInvariant =
      'A save issued while an IME composition is active must either commit the composition first (so the exact composed Markdown is written and the tab matches the file) or refuse/defer the save; it must never write a document that omits visible composed text or report the tab clean while that text is uncommitted.'

    await installTauriShim(page)
    const before = await bootDocument(page)
    const preComposition = before.activeMarkdown
    expect(preComposition).toBeTruthy()

    await page.evaluate(() => {
      const w = window as any
      w.__imeSaveCalls = []
      w.__mockInvoke.mt_response_file_save = (args: any) => {
        w.__imeSaveCalls.push(args)
        return { id: args.id, pathname: args.pathname, filename: args.filename, isSaved: true }
      }
    })

    await startComposition(page, PINYIN, 'type')
    const during = await readStore(page)
    expect(during.activeMarkdown, 'composition does not change store markdown').toBe(preComposition)
    expect((await readDom(page)).editorText ?? '').toContain(PINYIN)

    await page.evaluate(async () => {
      const app = document.querySelector('#app') as any
      const store = app.__vue_app__.config.globalProperties.$pinia._s.get('editor')
      await store.FILE_SAVE()
    })
    await expect.poll(
      () => page.evaluate(() => ((window as any).__imeSaveCalls || []).length),
      { timeout: 5_000 }
    ).toBe(1)

    const calls = await page.evaluate(() => (window as any).__imeSaveCalls)
    const sent = calls[0]
    expect(sent.markdown, 'transport receives the exact pre-composition markdown').toBe(preComposition)
    expect(sent.markdown).not.toContain(PINYIN)
    const afterSave = await readStore(page)
    expect(afterSave.activeMarkdown).toBe(preComposition)
    expect(afterSave.activeSaved, 'the stale write reports the tab saved').toBe(true)
    expect((await readDom(page)).editorText ?? '').toContain(PINYIN)

    // The real compositionend still commits the text into the editor: the tab
    // is dirty again while the transport payload never contained it.
    await endComposition(page, PINYIN)
    const afterEnd = await readStore(page)
    expect(afterEnd.activeMarkdown ?? '').toContain(PINYIN)
    expect(afterEnd.activeSaved).toBe(false)

    test.info().annotations.push(
      { type: 'observedLegacyBehavior', description: observedLegacyBehavior },
      { type: 'desiredInvariant', description: desiredInvariant }
    )
  })
})

// START_BLOCK_BOUNDARY_SET
// Coverage note (R-6 boundary set): all fifteen names are renderer-reachable
// in this harness and no row is skipped. Three parts are native-only and are
// asserted at the renderer transport boundary instead of the OS:
//   - QUIT's actual process exit (the row asserts the mt_app_quit intent and
//     the absence of an unsaved prompt/save channel, not the exit itself);
//   - the native folder/save pickers (mocked through plugin:dialog|*; the real
//     store/dialog code path still runs);
//   - real disk bytes (writes/reads are captured at mt_fs_write/mt_fs_read).
interface BoundaryObservation {
  before: StoreSnapshot
  during: StoreSnapshot
  duringDom: DomSnapshot
  after: StoreSnapshot
  afterDom: DomSnapshot
  dialogs: { unsaved: number, workspace: number, messageBox: number }
  invokeLog: string[]
  pageErrors: string[]
}

interface BoundaryRow {
  name: string
  setup: (page: Page) => Promise<void>
  fire: (page: Page) => Promise<void>
  settle?: (page: Page) => Promise<void>
  check: (obs: BoundaryObservation, page: Page) => Promise<void> | void
  // A row may characterize a crash as its observed outcome. The runner then
  // requires the expected subject error to be present and only rejects page
  // errors outside the declared pattern (plus the documented shim gap).
  expectedSubjectError?: RegExp
  observedLegacyBehavior: string
  desiredInvariant: string
}

async function resetInvokeLog (page: Page) {
  await page.evaluate(() => {
    ;(window as any).__invokeLog = []
  })
}

async function invokeLog (page: Page): Promise<string[]> {
  return page.evaluate(() => (window as any).__invokeLog || [])
}

const pageErrorsByTest = new WeakMap<Page, string[]>()

function watchPageErrors (page: Page): string[] {
  const existing = pageErrorsByTest.get(page)
  if (existing) return existing
  const errors: string[] = []
  page.on('pageerror', (err) => errors.push(String(err)))
  pageErrorsByTest.set(page, errors)
  return errors
}

async function runBoundaryRows (page: Page, rows: BoundaryRow[]) {
  const pageErrors = watchPageErrors(page)
  for (const row of rows) {
    await test.step(`boundary: ${row.name}`, async () => {
      const errorsBefore = pageErrors.length
      await row.setup(page)
      await resetInvokeLog(page)
      const before = await readStore(page)
      await startComposition(page, PINYIN, 'type')
      const during = await readStore(page)
      const duringDom = await readDom(page)
      expect(during.activeMarkdown ?? '', `${row.name}: preedit must not be in markdown yet`)
        .not.toContain(PINYIN)
      expect(duringDom.paragraphText ?? '', `${row.name}: preedit must be in the DOM`).toContain(PINYIN)

      await row.fire(page)
      if (row.settle) await row.settle(page)
      // Fixed settle window for late async rejections (watcher teardown, diff
      // renderer) so they are attributed to the row that caused them.
      await page.waitForTimeout(150)

      const after = await readStore(page)
      const afterDom = await readDom(page)
      const obs: BoundaryObservation = {
        before,
        during,
        duringDom,
        after,
        afterDom,
        dialogs: await readDialogs(page),
        invokeLog: await invokeLog(page),
        pageErrors: pageErrors.slice(errorsBefore)
      }
      await row.check(obs, page)
      // START_BLOCK_HARNESS_UNLISTEN_GAP
      // Renderer-only harness gap: the tauri shim does not implement
      // window.__TAURI_EVENT_PLUGIN_INTERNALS__.unregisterListener, so tearing
      // down a file watcher (tab close, workspace replace, live reload) leaves
      // an unhandled rejection in the page. It is not a composition-subject
      // failure and is kept visible in the row report instead of silently
      // disappearing; every other page error still fails the row.
      const HARNESS_UNLISTEN_GAP = '__TAURI_EVENT_PLUGIN_INTERNALS__.unregisterListener'
      const harnessOnlyErrors = obs.pageErrors.filter((e) => e.includes(HARNESS_UNLISTEN_GAP))
      const subjectErrors = obs.pageErrors.filter((e) => !e.includes(HARNESS_UNLISTEN_GAP))
      if (harnessOnlyErrors.length) {
        // eslint-disable-next-line no-console
        console.log(
          `[IME-BOUNDARY][harness] ${row.name}: ${harnessOnlyErrors.length} watcher-unlisten rejection(s) ignored (shim gap)`
        )
      }
      if (row.expectedSubjectError) {
        expect(
          subjectErrors.some((e) => row.expectedSubjectError!.test(e)),
          `${row.name}: declared observed subject error must occur`
        ).toBe(true)
      }
      const unexpectedSubjectErrors = subjectErrors.filter(
        (e) => !row.expectedSubjectError || !row.expectedSubjectError.test(e)
      )
      expect(
        unexpectedSubjectErrors,
        `${row.name}: no uncaught page error outside the declared observed error and the known shim gap`
      ).toEqual([])
      // END_BLOCK_HARNESS_UNLISTEN_GAP

      test.info().annotations.push(
        { type: 'observedLegacyBehavior', description: `[boundary=${row.name}] ${row.observedLegacyBehavior}` },
        { type: 'desiredInvariant', description: `[boundary=${row.name}] ${row.desiredInvariant}` }
      )
    })
  }
}

const SAVE_ROW: BoundaryRow = {
  name: 'save',
  setup: async (page) => {
    await bootDocument(page)
    await page.evaluate(() => {
      const w = window as any
      w.__imeSaveCalls = []
      w.__mockInvoke.mt_response_file_save = (args: any) => {
        w.__imeSaveCalls.push({ args, atFire: { dom: document.querySelector('#ag-editor-id')?.textContent ?? null } })
        return { id: args.id, pathname: args.pathname, filename: args.filename, isSaved: true }
      }
    })
  },
  fire: async (page) => {
    await page.evaluate(async () => {
      const app = document.querySelector('#app') as any
      await app.__vue_app__.config.globalProperties.$pinia._s.get('editor').FILE_SAVE()
    })
    await expect.poll(() => page.evaluate(() => (window as any).__imeSaveCalls.length), { timeout: 5_000 }).toBe(1)
  },
  check: async (obs, page) => {
    const calls = await page.evaluate(() => (window as any).__imeSaveCalls)
    expect(calls[0].args.markdown).toBe(obs.before.activeMarkdown)
    expect(calls[0].args.markdown).not.toContain(PINYIN)
    expect(calls[0].atFire.dom ?? '').toContain(PINYIN)
    expect(obs.after.activeMarkdown).toBe(obs.before.activeMarkdown)
    expect(obs.after.activeSaved).toBe(true)
    expect(obs.afterDom.editorText ?? '').toContain(PINYIN)
  },
  observedLegacyBehavior:
    'Save writes currentFile.markdown without the active composition, reports isSaved=true, and leaves the composed text only in the DOM.',
  desiredInvariant:
    'Save during composition must commit the composition or refuse/defer; it must never persist a document missing visible composed text.'
}

const SAVE_AS_ROW: BoundaryRow = {
  name: 'save-as',
  setup: async (page) => {
    await bootDocument(page)
    await page.evaluate(() => {
      const w = window as any
      w.__imeSaveAsCalls = []
      w.__mockInvoke.mt_response_file_save_as = (args: any) => {
        w.__imeSaveAsCalls.push(args)
        return { id: args.id, pathname: '/tmp/mark-e2e/ime-saved-as.md', filename: 'ime-saved-as.md', isSaved: true }
      }
    })
  },
  fire: async (page) => {
    await page.evaluate(async () => {
      const app = document.querySelector('#app') as any
      await app.__vue_app__.config.globalProperties.$pinia._s.get('editor').FILE_SAVE_AS()
    })
    await expect.poll(() => page.evaluate(() => (window as any).__imeSaveAsCalls.length), { timeout: 5_000 }).toBe(1)
  },
  check: async (obs, page) => {
    const calls = await page.evaluate(() => (window as any).__imeSaveAsCalls)
    expect(calls[0].markdown).toBe(obs.before.activeMarkdown)
    expect(calls[0].markdown).not.toContain(PINYIN)
    expect(obs.after.activePath).toBe('/tmp/mark-e2e/ime-saved-as.md')
    expect(obs.after.activeMarkdown).toBe(obs.before.activeMarkdown)
    expect(obs.after.activeSaved).toBe(true)
    expect(obs.afterDom.editorText ?? '').toContain(PINYIN)
  },
  observedLegacyBehavior:
    'Save As sends the pre-composition markdown, moves the tab to the chosen path, marks it saved and leaves the composed text only in the DOM.',
  desiredInvariant:
    'Save As during composition must commit the composition before the write or refuse/defer; the selected destination must receive the composed document.'
}

const SAVE_ALL_ROW: BoundaryRow = {
  name: 'save-all',
  setup: async (page) => {
    await bootDocument(page)
    await page.evaluate(() => {
      const w = window as any
      w.__imeSaveAllCalls = []
      w.__mockInvoke.mt_save_tabs = (args: any) => {
        w.__imeSaveAllCalls.push(args)
        return null
      }
    })
  },
  fire: async (page) => {
    await page.evaluate(() => {
      const app = document.querySelector('#app') as any
      app.__vue_app__.config.globalProperties.$pinia._s.get('editor').ASK_FOR_SAVE_ALL(false)
    })
    await expect.poll(() => page.evaluate(() => (window as any).__imeSaveAllCalls.length), { timeout: 5_000 }).toBe(1)
  },
  check: async (obs, page) => {
    const calls = await page.evaluate(() => (window as any).__imeSaveAllCalls)
    const payloadTabs = calls[0]?.args
    expect(Array.isArray(payloadTabs), 'shim wraps the tabs array as {args: [...]}').toBe(true)
    expect(payloadTabs).toHaveLength(0)
    expect(obs.invokeLog).toContain('mt_save_tabs')
    expect(obs.after.activeMarkdown).toBe(obs.before.activeMarkdown)
    expect(obs.after.activeSaved).toBe(true)
    expect(obs.afterDom.editorText ?? '').toContain(PINYIN)
  },
  observedLegacyBehavior:
    'Save All filters by isSaved; the composing tab still looks clean, so mt_save_tabs receives an empty tab list (and that channel is unregistered/no-op in this harness), while the composed text remains only in the DOM.',
  desiredInvariant:
    'Save All must treat an active composition as unsaved work: either include the committed composition in the payload or refuse/defer the save instead of reporting/sending an empty set.'
}

const AUTOSAVE_ROW: BoundaryRow = {
  name: 'autosave',
  setup: async (page) => {
    await bootDocument(page)
    await page.evaluate(() => {
      const w = window as any
      w.__imeSaveCalls = []
      w.__mockInvoke.mt_response_file_save = (args: any) => {
        const app = document.querySelector('#app') as any
        const store = app.__vue_app__.config.globalProperties.$pinia._s.get('editor')
        w.__imeSaveCalls.push({
          args,
          atFire: {
            markdown: store.currentFile.markdown,
            dom: document.querySelector('#ag-editor-id')?.textContent ?? null
          }
        })
        return { id: args.id, pathname: args.pathname, filename: args.filename, isSaved: true }
      }
      const prefs = (document.querySelector('#app') as any).__vue_app__.config.globalProperties.$pinia._s.get('preferences')
      prefs.autoSave = true
      prefs.autoSaveDelay = 2_500
    })
    // A committed edit arms the autosave debounce; the composition below then
    // starts before the timer fires.
    const paragraph = page.locator('#ag-editor-id span.ag-paragraph').last()
    await paragraph.click()
    await page.keyboard.press('End')
    await page.keyboard.type('Z')
    await expect.poll(async () => (await readStore(page)).activeMarkdown ?? '', { timeout: 5_000 })
      .toContain('Z')
  },
  fire: async (page) => {
    await expect.poll(() => page.evaluate(() => (window as any).__imeSaveCalls.length), { timeout: 8_000 }).toBe(1)
  },
  check: async (obs, page) => {
    const calls = await page.evaluate(() => (window as any).__imeSaveCalls)
    expect(calls[0].args.markdown, 'autosave payload keeps the committed edit').toContain('Z')
    expect(calls[0].args.markdown, 'autosave payload omits the active composition').not.toContain(PINYIN)
    expect(calls[0].atFire.dom ?? '', 'composition was live when the timer fired').toContain(PINYIN)
    expect(calls[0].atFire.markdown).not.toContain(PINYIN)
    expect(obs.after.activeSaved, 'the stale autosave reports the tab clean').toBe(true)
    expect(obs.afterDom.editorText ?? '').toContain(PINYIN)
  },
  observedLegacyBehavior:
    'The autosave debounce armed by the last committed edit fires during the active composition; it writes the stale markdown (committed edit only, no composed text), marks the tab saved and leaves the preedit in the DOM.',
  desiredInvariant:
    'Autosave must not fire a write that omits an active composition; it must commit the composition first or defer until compositionend.'
}

const EXTERNAL_CHANGE_ROW: BoundaryRow = {
  name: 'external-change',
  expectedSubjectError: /TypeError: .*(?:\.key|'key')/,
  setup: async (page) => {
    await bootDocument(page)
    await page.evaluate(() => {
      const w = window as any
      w.__mockInvoke.mt_fs_read = () => '# External rewrite\n\nChanged on disk.\n'
    })
  },
  fire: async (page) => {
    await page.evaluate((external: string) => {
      const app = document.querySelector('#app') as any
      const store = app.__vue_app__.config.globalProperties.$pinia._s.get('editor')
      store.APPLY_FILE_CHANGE('change', {
        pathname: store.currentFile.pathname,
        kind: 'change',
        data: { markdown: external, filename: 'ime-characterization.md' }
      })
    }, EXTERNAL_DOC)
    await expect.poll(async () => (await readStore(page)).activeMarkdown, { timeout: 8_000 }).toBe(EXTERNAL_DOC)
  },
  check: async (obs) => {
    expect(obs.after.activeMarkdown).toBe(EXTERNAL_DOC)
    expect(obs.after.activeMarkdown ?? '').not.toContain(PINYIN)
    expect(obs.afterDom.editorText ?? '').toContain('External rewrite')
    expect(obs.afterDom.editorText ?? '').not.toContain(PINYIN)
    expect(obs.dialogs.unsaved).toBe(0)
    expect(obs.after.activeSaved, 'the externally reloaded tab is clean').toBe(true)
    expect(
      obs.pageErrors.some((e) => /TypeError: .*(?:\.key|'key')/.test(e)),
      'the reload path throws while composition is active'
    ).toBe(true)
  },
  observedLegacyBehavior:
    'The live-reload path applies the disk content to a tab that looks clean and throws TypeError (evaluating t.key) while the active composition is being replaced; the composed text is discarded with no conflict prompt and never enters markdown.',
  desiredInvariant:
    'An external reload during composition must surface the uncommitted composition (conflict/snapshot) or defer the reload; it must neither discard composed text nor throw.'
}

const TAB_SWITCH_ROW: BoundaryRow = {
  name: 'tab-switch',
  setup: async (page) => {
    await bootEditor(page)
    await openFileTab(page, '/tmp/mark-e2e/ime-switch-a.md', '# A\n\nAlpha body.\n')
    await expect.poll(async () => (await readStore(page)).activePath, { timeout: 5_000 })
      .toBe('/tmp/mark-e2e/ime-switch-a.md')
    await openFileTab(page, '/tmp/mark-e2e/ime-switch-b.md', '# B\n\nBeta body.\n')
    await expect.poll(async () => (await readStore(page)).activePath, { timeout: 5_000 })
      .toBe('/tmp/mark-e2e/ime-switch-b.md')
  },
  fire: async (page) => {
    await page.evaluate(() => {
      const app = document.querySelector('#app') as any
      const store = app.__vue_app__.config.globalProperties.$pinia._s.get('editor')
      const other = store.tabs.find((t: any) => t.id !== store.currentFile.id)
      store.UPDATE_CURRENT_FILE(other)
    })
    await expect.poll(async () => (await readStore(page)).activePath, { timeout: 5_000 })
      .toBe('/tmp/mark-e2e/ime-switch-a.md')
  },
  check: async (obs) => {
    expect(obs.after.activePath).toBe('/tmp/mark-e2e/ime-switch-a.md')
    const b = obs.after.tabs.find((t) => t.pathname === '/tmp/mark-e2e/ime-switch-b.md')
    expect(b, 'background tab survives the switch').toBeTruthy()
    expect(b!.markdown ?? '').not.toContain(PINYIN)
    expect(b!.isSaved, 'background tab remains clean after its preedit was discarded').toBe(true)
    for (const tab of obs.after.tabs) expect(tab.markdown).not.toContain(PINYIN)
    expect(obs.afterDom.editorText ?? '').toContain('Alpha body')
    expect(obs.afterDom.editorText ?? '').not.toContain(PINYIN)
  },
  observedLegacyBehavior:
    'Switching the active tab re-renders the editor from the newly active tab; the composing surface is replaced and the preedit is discarded while the background tab stays isSaved=true.',
  desiredInvariant:
    'A tab switch during composition must finalize/cancel the composition explicitly (and reflect it in Markdown/dirty state) rather than destroying the preedit and leaving the tab clean.'
}

const SOURCE_TOGGLE_ROW: BoundaryRow = {
  name: 'source-mode',
  setup: async (page) => {
    await bootDocument(page)
  },
  fire: async (page) => {
    await page.evaluate(() => {
      ;(window as any).__bus.emit('view:toggle-view-entry', 'sourceCode')
    })
    await expect.poll(() => page.evaluate(() => !!document.querySelector('.source-code .CodeMirror')), { timeout: 5_000 }).toBe(true)
    // Capture what the controlled source reader exposes while the composition
    // is still active.
    await page.evaluate(() => {
      const cm = document.querySelector('.source-code .CodeMirror') as any
      ;(window as any).__imeSourceObserved = {
        value: cm?.CodeMirror?.getValue?.() ?? null,
        markdown: (document.querySelector('#app') as any).__vue_app__.config.globalProperties.$pinia._s.get('editor').currentFile.markdown,
        dom: document.querySelector('#ag-editor-id')?.textContent ?? null
      }
    })
    // Toggle back to the rich surface: the preedit has no committed markdown
    // to restore from.
    await page.evaluate(() => {
      ;(window as any).__bus.emit('view:toggle-view-entry', 'sourceCode')
    })
    await expect.poll(() => page.evaluate(() => !!document.querySelector('.source-code .CodeMirror')), { timeout: 5_000 }).toBe(false)
  },
  check: async (obs, page) => {
    const source = await page.evaluate(() => (window as any).__imeSourceObserved)
    expect(source.value, 'source reader shows the stale committed markdown').toBe(obs.before.activeMarkdown)
    expect(source.value).not.toContain(PINYIN)
    expect(source.markdown).toBe(obs.before.activeMarkdown)
    expect(source.dom ?? '', 'hidden rich DOM still held the preedit in source mode').toContain(PINYIN)
    expect(obs.after.activeMarkdown).toBe(obs.before.activeMarkdown)
    expect(obs.after.activeSaved).toBe(true)
    expect(obs.afterDom.editorText ?? '', 'returning to the rich surface loses the preedit').not.toContain(PINYIN)
  },
  observedLegacyBehavior:
    'Toggling to Source Code shows the committed markdown without the active composition; toggling back re-renders the rich surface from that markdown and the composed text is gone.',
  desiredInvariant:
    'A source-mode round-trip must not discard an active composition; either the composition is committed to both surfaces or the toggle is refused/deferred until compositionend.'
}

const DIFF_ENTRY_ROW: BoundaryRow = {
  name: 'diff-entry',
  expectedSubjectError: /dealigned/,
  setup: async (page) => {
    await bootDocument(page)
  },
  fire: async (page) => {
    await page.evaluate(() => {
      ;(window as any).__bus.emit('cmd::execute', 'view.diff-mode')
    })
    await expect.poll(() => page.evaluate(() => !!document.querySelector('.diff-view')), { timeout: 8_000 }).toBe(true)
  },
  check: async (obs) => {
    expect(obs.afterDom.diffVisible).toBe(true)
    expect(obs.afterDom.diffText ?? '', 'diff baseline excludes the active composition').not.toContain(PINYIN)
    expect(obs.after.activeMarkdown).toBe(obs.before.activeMarkdown)
    expect(obs.after.activeSaved).toBe(true)
    expect(obs.afterDom.editorText ?? '').toContain(PINYIN)
    expect(
      obs.pageErrors.some((e) => /dealigned/.test(e)),
      'the diff renderer throws while composition is active'
    ).toBe(true)
  },
  observedLegacyBehavior:
    'Diff entry renders the committed store markdown (the active composition is absent from both panes), leaves the tab clean and throws an unhandled TypeError from the diff renderer (null dealigned) while the composition is still active.',
  desiredInvariant:
    'A reader/diff entered during composition must not present a document that omits visible composed text or throw; it should finalize the composition first or label the surface as stale.'
}

const EXPORT_ROW: BoundaryRow = {
  name: 'export',
  setup: async (page) => {
    await bootDocument(page)
    await page.evaluate(() => {
      const w = window as any
      w.__imeFsWrites = []
      w.__mockInvoke['plugin:dialog|save'] = () => '/tmp/mark-e2e/ime-export.html'
      w.__mockInvoke.mt_fs_write = (args: any) => {
        w.__imeFsWrites.push(args)
        return null
      }
    })
  },
  fire: async (page) => {
    await page.evaluate(() => {
      ;(window as any).__bus.emit('export', { type: 'styledHtml', htmlTitle: 'IME characterization export' })
    })
    await expect.poll(() => page.evaluate(() => ((window as any).__imeFsWrites || []).length), { timeout: 8_000 }).toBe(1)
  },
  check: async (obs, page) => {
    const writes = await page.evaluate(() => (window as any).__imeFsWrites)
    expect(writes[0].path).toBe('/tmp/mark-e2e/ime-export.html')
    expect(writes[0].content, 'export contains the committed document').toContain('Semantic edges')
    expect(writes[0].content, 'export omits the active composition').not.toContain(PINYIN)
    expect(obs.after.activeMarkdown).toBe(obs.before.activeMarkdown)
    expect(obs.after.activeSaved).toBe(true)
    expect(obs.afterDom.editorText ?? '').toContain(PINYIN)
  },
  observedLegacyBehavior:
    'The styled-HTML export reader renders the committed markdown; the active composition is missing from the exported file while the tab stays clean.',
  desiredInvariant:
    'An export requested during composition must include the composed text (commit first) or warn/refuse; it must not silently emit a document missing visible text.'
}

const COPY_ROW: BoundaryRow = {
  name: 'copy',
  setup: async (page) => {
    await bootDocument(page)
    await page.evaluate(() => {
      const w = window as any
      w.__imeClipWrites = []
      w.__mockInvoke['plugin:clipboard-manager|write_text'] = (args: any) => {
        w.__imeClipWrites.push(args)
        return null
      }
    })
  },
  fire: async (page) => {
    await page.evaluate(() => {
      ;(window as any).__bus.emit('cmd::execute', 'edit.copy-as-markdown')
    })
    await expect.poll(() => page.evaluate(() => ((window as any).__imeClipWrites || []).length), { timeout: 5_000 }).toBeGreaterThan(0)
  },
  check: async (obs, page) => {
    const writes = await page.evaluate(() => (window as any).__imeClipWrites)
    const text = writes[writes.length - 1].text
    expect(text, 'copy-as-markdown copies the stale committed markdown').toBe(obs.before.activeMarkdown)
    expect(text).not.toContain(PINYIN)
    expect(obs.after.activeMarkdown).toBe(obs.before.activeMarkdown)
    expect(obs.after.activeSaved).toBe(true)
    expect(obs.afterDom.editorText ?? '').toContain(PINYIN)
  },
  observedLegacyBehavior:
    'Copy as Markdown reads the committed document; the active composition is absent from the clipboard while the tab stays clean.',
  desiredInvariant:
    'A whole-document copy during composition must not silently omit visible composed text; commit first or refuse/mark the copy incomplete.'
}

const WORKSPACE_REPLACE_ROW: BoundaryRow = {
  name: 'workspace-replace',
  setup: async (page) => {
    // The document lives under root A; the root is registered AFTER boot so
    // the boot navigation does not clear the in-memory project store.
    await bootDocument(page, { pathname: '/tmp/mark-e2e/ws-a/ime-doc.md' })
    await page.evaluate(() => {
      const w = window as any
      w.__mockInvoke.mt_walk_project = () => null
      const app = document.querySelector('#app') as any
      const project = app.__vue_app__.config.globalProperties.$pinia._s.get('project')
      project.ADD_PROJECT('/tmp/mark-e2e/ws-a')
    })
    await expect.poll(
      () => page.evaluate(() => {
        const app = document.querySelector('#app') as any
        return app.__vue_app__.config.globalProperties.$pinia._s.get('project').projectTrees
          .map((r: any) => r.pathname)
      }),
      { timeout: 5_000 }
    ).toEqual(['/tmp/mark-e2e/ws-a'])
  },
  fire: async (page) => {
    await page.evaluate(async () => {
      const app = document.querySelector('#app') as any
      const project = app.__vue_app__.config.globalProperties.$pinia._s.get('project')
      await project.OPEN_FOLDER('/tmp/mark-e2e/ws-b', { mode: 'replace', origin: 'characterization' })
    })
    await expect.poll(
      () => page.evaluate(() => {
        const app = document.querySelector('#app') as any
        const project = app.__vue_app__.config.globalProperties.$pinia._s.get('project')
        return project.projectTrees.map((r: any) => r.pathname)
      }),
      { timeout: 8_000 }
    ).toEqual(['/tmp/mark-e2e/ws-b'])
  },
  check: async (obs) => {
    expect(obs.after.tabCount, 'clean-looking composing tab was closed by the replace').toBe(0)
    expect(obs.after.tabs).toEqual([])
    expect(obs.dialogs.workspace, 'no dirty-confirm dialog appeared').toBe(0)
    expect(obs.dialogs.unsaved).toBe(0)
    expect(obs.afterDom.editorText).toBeNull()
    expect(obs.invokeLog).not.toContain('mt_response_file_save')
  },
  observedLegacyBehavior:
    'Workspace replacement counts only isSaved=false tabs as dirty; the composing tab still looks clean, so it is closed silently with no confirm dialog and no save transport, and the preedit disappears with it.',
  desiredInvariant:
    'A replace must treat active composition as unsaved content: prompt, save or explicitly cancel before closing the composing tab — never close it silently.'
}

const RENAME_ROW: BoundaryRow = {
  name: 'rename',
  setup: async (page) => {
    await bootDocument(page, { pathname: '/tmp/mark-e2e/ime-rename.md' })
    await page.evaluate(() => {
      const w = window as any
      w.__imeMoves = []
      w.__mockInvoke.mt_fs_move = (args: any) => {
        w.__imeMoves.push(args)
        return null
      }
    })
  },
  fire: async (page) => {
    await page.evaluate(async () => {
      const app = document.querySelector('#app') as any
      await app.__vue_app__.config.globalProperties.$pinia._s.get('editor').RENAME('ime-renamed.md')
    })
    await expect.poll(async () => (await readStore(page)).activePath, { timeout: 5_000 })
      .toBe('/tmp/mark-e2e/ime-renamed.md')
  },
  check: async (obs, page) => {
    const moves = await page.evaluate(() => (window as any).__imeMoves)
    expect(moves[0]).toEqual({ src: '/tmp/mark-e2e/ime-rename.md', dest: '/tmp/mark-e2e/ime-renamed.md' })
    expect(obs.after.activePath).toBe('/tmp/mark-e2e/ime-renamed.md')
    expect(obs.after.activeMarkdown).toBe(obs.before.activeMarkdown)
    expect(obs.after.activeMarkdown ?? '').not.toContain(PINYIN)
    expect(obs.after.activeSaved, 'rename reports a composing tab clean').toBe(true)
    expect(obs.afterDom.editorText ?? '').toContain(PINYIN)
  },
  observedLegacyBehavior:
    'A metadata-only rename applies isSaved=true through APPLY_SAVE_OUTCOME without writing or committing the document; the active composition is still only in the DOM while the renamed tab reports clean.',
  desiredInvariant:
    'Rename must not mark a tab clean while uncommitted composition exists; it must preserve the dirty state (or commit the composition first) regardless of the pathname change.'
}

const MOVE_ROW: BoundaryRow = {
  name: 'move',
  setup: async (page) => {
    await bootDocument(page, { pathname: '/tmp/mark-e2e/ime-move.md' })
    await page.evaluate(() => {
      const w = window as any
      w.__imeMoves = []
      w.__mockInvoke.mt_fs_move = (args: any) => {
        w.__imeMoves.push(args)
        return null
      }
      w.__mockInvoke['plugin:dialog|open'] = () => '/tmp/mark-e2e/moved-ime'
    })
  },
  fire: async (page) => {
    await page.evaluate(async () => {
      const app = document.querySelector('#app') as any
      await app.__vue_app__.config.globalProperties.$pinia._s.get('editor').MOVE_FILE_TO()
    })
    await expect.poll(async () => (await readStore(page)).activePath, { timeout: 5_000 })
      .toBe('/tmp/mark-e2e/moved-ime/ime-move.md')
  },
  check: async (obs, page) => {
    const moves = await page.evaluate(() => (window as any).__imeMoves)
    expect(moves[0]).toEqual({ src: '/tmp/mark-e2e/ime-move.md', dest: '/tmp/mark-e2e/moved-ime/ime-move.md' })
    expect(obs.after.activePath).toBe('/tmp/mark-e2e/moved-ime/ime-move.md')
    expect(obs.after.activeMarkdown).toBe(obs.before.activeMarkdown)
    expect(obs.after.activeMarkdown ?? '').not.toContain(PINYIN)
    expect(obs.after.activeSaved, 'move reports a composing tab clean').toBe(true)
    expect(obs.afterDom.editorText ?? '').toContain(PINYIN)
  },
  observedLegacyBehavior:
    'Move To applies isSaved=true through APPLY_SAVE_OUTCOME without writing or committing the document; the active composition stays only in the DOM while the moved tab reports clean.',
  desiredInvariant:
    'Move To must not mark a tab clean while uncommitted composition exists; it must preserve the dirty state (or commit the composition first) regardless of the destination change.'
}

const CLOSE_ROW: BoundaryRow = {
  name: 'close',
  setup: async (page) => {
    await bootDocument(page)
    await page.evaluate(() => {
      const w = window as any
      w.__imeSaveCalls = []
      w.__mockInvoke.mt_response_file_save = (args: any) => {
        w.__imeSaveCalls.push(args)
        return { id: args.id, pathname: args.pathname, filename: args.filename, isSaved: true }
      }
    })
  },
  fire: async (page) => {
    await page.evaluate(() => {
      const app = document.querySelector('#app') as any
      app.__vue_app__.config.globalProperties.$pinia._s.get('editor').CLOSE_TAB()
    })
    await expect.poll(async () => (await readStore(page)).tabCount, { timeout: 5_000 }).toBe(0)
  },
  check: async (obs, page) => {
    expect(obs.after.tabCount).toBe(0)
    expect(obs.dialogs.unsaved, 'no unsaved-close dialog appeared').toBe(0)
    expect(obs.dialogs.messageBox).toBe(0)
    expect(await page.evaluate(() => (window as any).__imeSaveCalls.length)).toBe(0)
    expect(obs.afterDom.editorText).toBeNull()
  },
  observedLegacyBehavior:
    'CLOSE_TAB checks only isSaved; the composing tab still looks clean, so it closes with no unsaved-close dialog and no save transport, discarding the preedit.',
  desiredInvariant:
    'Close during active composition must not discard the preedit: commit it first (making the tab dirty and prompting) or refuse/ask before closing.'
}

const QUIT_ROW: BoundaryRow = {
  name: 'quit',
  setup: async (page) => {
    await bootDocument(page)
    await page.evaluate(() => {
      const w = window as any
      w.__imeQuitCalls = []
      w.__mockInvoke.mt_app_quit = (args: any) => {
        w.__imeQuitCalls.push(args ?? null)
        return null
      }
    })
  },
  fire: async (page) => {
    await page.evaluate(async () => {
      const app = document.querySelector('#app') as any
      await app.__vue_app__.config.globalProperties.$pinia._s.get('editor').QUIT_APP()
    })
    await expect.poll(() => page.evaluate(() => (window as any).__imeQuitCalls.length), { timeout: 8_000 }).toBe(1)
  },
  check: async (obs) => {
    expect(obs.dialogs.messageBox, 'no unsaved-changes quit prompt appeared').toBe(0)
    expect(obs.invokeLog).not.toContain('mt_save_and_close_tabs')
    expect(obs.invokeLog).not.toContain('mt_save_tabs')
    expect(obs.after.tabCount).toBe(1)
    expect(obs.after.activeMarkdown).toBe(obs.before.activeMarkdown)
    expect(obs.after.activeMarkdown ?? '').not.toContain(PINYIN)
    expect(obs.after.activeSaved, 'quit path considers the composing tab clean').toBe(true)
    expect(obs.afterDom.editorText ?? '').toContain(PINYIN)
  },
  observedLegacyBehavior:
    'QUIT_APP filters unsaved tabs by isSaved; the composing tab still looks clean, so it calls mt_app_quit with no unsaved-changes prompt and no save/close payload. Only renderer intent is observable here; the actual process exit is native.',
  desiredInvariant:
    'Quit during active composition must not drop the preedit: prompt and commit it (or explicitly discard with user confirmation) before requesting app exit.'
}
// END_BLOCK_BOUNDARY_SET

test.describe('IME composition across the boundary set (R-6)', () => {
  test.describe.configure({ timeout: 90_000 })

  test('save family: save, Save As, Save All, autosave', async ({ page }) => {
    const observedLegacyBehavior =
      'All four save paths read the committed currentFile.markdown captured before/during the composition: FILE_SAVE and Save As write the pre-composition text, Save All sends an empty tab list because the composing tab still looks clean, and autosave writes the stale debounced payload. Each path reports or leaves the tab clean while the composed text exists only in the DOM.'
    const desiredInvariant =
      'No save path may persist or acknowledge a document that omits active composed text; each must commit the composition before the write/listing or defer/refuse until compositionend.'

    await installTauriShim(page)
    await runBoundaryRows(page, [SAVE_ROW, SAVE_AS_ROW, SAVE_ALL_ROW, AUTOSAVE_ROW])

    test.info().annotations.push(
      { type: 'observedLegacyBehavior', description: observedLegacyBehavior },
      { type: 'desiredInvariant', description: desiredInvariant }
    )
  })

  test('readers: external change, tab switch, source mode, diff entry, export, copy', async ({ page }) => {
    const observedLegacyBehavior =
      'Every controlled reader observes the committed store markdown only: an external reload replaces the composing surface with disk content and throws (TypeError on t.key), a tab switch re-renders the other tab and discards the preedit, source mode drops the preedit on the round-trip, diff entry renders stale text and throws (unhandled dealigned TypeError), and export/copy emit the document without the composed text. The composing tab keeps looking clean in all six cases.'
    const desiredInvariant =
      'A reader or surface change crossing a live composition must either include the composed text (commit first) or report/defer the stale state; none of them may silently present or persist a document missing visible composed text.'

    await installTauriShim(page)
    await runBoundaryRows(page, [
      EXTERNAL_CHANGE_ROW,
      TAB_SWITCH_ROW,
      SOURCE_TOGGLE_ROW,
      DIFF_ENTRY_ROW,
      EXPORT_ROW,
      COPY_ROW
    ])

    test.info().annotations.push(
      { type: 'observedLegacyBehavior', description: observedLegacyBehavior },
      { type: 'desiredInvariant', description: desiredInvariant }
    )
  })

  test('close family: workspace replace, rename, move, close, quit', async ({ page }) => {
    const observedLegacyBehavior =
      'Dirty detection is isSaved-only, and the active composition is invisible to it. Workspace replacement, close and quit all treat the composing tab as saved and drop it without a prompt or save payload; rename and move set isSaved=true without committing the composition. The composed text exists only in the DOM throughout.'
    const desiredInvariant =
      'Every close/lifecycle boundary must treat an active composition as unsaved content and must not silently discard it or mark the document clean; each must commit, prompt or refuse before proceeding.'

    await installTauriShim(page)
    await runBoundaryRows(page, [WORKSPACE_REPLACE_ROW, RENAME_ROW, MOVE_ROW, CLOSE_ROW, QUIT_ROW])

    test.info().annotations.push(
      { type: 'observedLegacyBehavior', description: observedLegacyBehavior },
      { type: 'desiredInvariant', description: desiredInvariant }
    )
  })
})

test.describe('model mutations while composition is active (R-6)', () => {
  test('format (bold through the real command path) discards the preedit and mutates the paragraph', async ({ page }) => {
    const observedLegacyBehavior =
      'The real bold command (format.strong → cmd::execute → focusEditorAndExecute → bus format) does not throw while a composition is active: it discards the preedit, injects the bold markers into the rendered footnote paragraph (****), and leaves the store markdown unchanged and isSaved=true. (Directly emitting the format bus event without the command focus step throws IndexSizeError synchronously in the same state; the command route is the user-observable path asserted here.)'
    const desiredInvariant =
      'Formatting during an active composition must either apply to the committed text or be deferred until compositionend; it must not discard the preedit, mutate the paragraph against stale offsets or leave markdown clean.'

    await installTauriShim(page)
    const before = await bootDocument(page)
    await startComposition(page, PINYIN, 'type')
    const duringDom = await readDom(page)
    expect(duringDom.editorText ?? '').toContain(PINYIN)
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(String(err)))

    await page.evaluate(() => {
      ;(window as any).__bus.emit('cmd::execute', 'format.strong')
    })
    // focusEditorAndExecute fires the command after 150 ms.
    await page.waitForTimeout(700)

    const after = await readStore(page)
    const dom = await readDom(page)
    expect(errors, 'the real command path does not throw').toEqual([])
    expect(after.activeMarkdown).toBe(before.activeMarkdown)
    expect(after.activeMarkdown ?? '').not.toContain(PINYIN)
    expect(after.activeSaved, 'markdown still looks clean after the partial format').toBe(true)
    expect(dom.editorText ?? '', 'the preedit was destroyed by the format render').not.toContain(PINYIN)
    expect(dom.editorText ?? '', 'the bold markers were injected into the rendered paragraph').toContain('****')

    test.info().annotations.push(
      { type: 'observedLegacyBehavior', description: observedLegacyBehavior },
      { type: 'desiredInvariant', description: desiredInvariant }
    )
  })

  test('replace re-renders from stale blocks and drops the preedit without a crash', async ({ page }) => {
    const observedLegacyBehavior =
      'The replace command re-renders from the committed blocks; the composing text is removed from the DOM, the store markdown and isSaved are unchanged, and a later compositionend cannot restore it. No exception is thrown.'
    const desiredInvariant =
      'Replace during composition must not silently discard the preedit; it should commit the composition first or refuse until compositionend.'

    await installTauriShim(page)
    const before = await bootDocument(page)
    await startComposition(page, PINYIN, 'type')
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(String(err)))

    await page.evaluate(() => {
      ;(window as any).__bus.emit('replaceValue', { value: 'semantic', opt: { isSingle: true } })
    })
    await page.waitForTimeout(500)
    await dispatchRawCompositionEnd(page, '你好')

    const after = await readStore(page)
    const dom = await readDom(page)
    expect(errors, 'replace path does not throw').toEqual([])
    expect(after.activeMarkdown).toBe(before.activeMarkdown)
    expect(after.activeMarkdown ?? '').not.toContain(PINYIN)
    expect(after.activeSaved).toBe(true)
    expect(dom.editorText ?? '').not.toContain(PINYIN)

    test.info().annotations.push(
      { type: 'observedLegacyBehavior', description: observedLegacyBehavior },
      { type: 'desiredInvariant', description: desiredInvariant }
    )
  })

  test('extension rewrite replaces the document and discards the preedit', async ({ page }) => {
    const observedLegacyBehavior =
      'Extension text.transform with no selection calls setMarkdown and replaces the whole document from the extension payload; the active composition is discarded, the rewritten document is loaded, and the later compositionend marks the tab dirty even though its markdown did not change.'
    const desiredInvariant =
      'An extension rewrite during composition must surface the conflict (the preedit is user work) instead of silently replacing the document; at minimum the discarded preedit must be visible/observable to the user.'

    await installTauriShim(page)
    await bootDocument(page)
    await startComposition(page, PINYIN, 'type')
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(String(err)))
    const rewritten = '# Rewritten by extension\n\nAgent text.\n'

    await page.evaluate((text: string) => {
      ;(window as any).__bus.emit('ext-text-transform', { text })
    }, rewritten)
    await expect.poll(async () => (await readStore(page)).activeMarkdown, { timeout: 8_000 })
      .toBe(rewritten)
    await dispatchRawCompositionEnd(page, '你好')

    const after = await readStore(page)
    const dom = await readDom(page)
    expect(errors, 'extension rewrite path does not throw').toEqual([])
    expect(after.activeMarkdown).toBe(rewritten)
    expect(after.activeMarkdown ?? '').not.toContain(PINYIN)
    expect(after.activeSaved, 'compositionend after the rewrite dirties the rewritten tab').toBe(false)
    expect(dom.editorText ?? '').not.toContain(PINYIN)

    test.info().annotations.push(
      { type: 'observedLegacyBehavior', description: observedLegacyBehavior },
      { type: 'desiredInvariant', description: desiredInvariant }
    )
  })

  test('history undo/reparse during composition drops the preedit', async ({ page }) => {
    const observedLegacyBehavior =
      'Undo runs the Muya history reparse while composition is active; the composing DOM text disappears and the store markdown is restored to a committed history state (never the preedit), and the later compositionend cannot bring the preedit back. No exception is thrown.'
    const desiredInvariant =
      'History mutations during composition must not silently discard the preedit; commit the composition before undoing/redoing or refuse until compositionend.'

    await installTauriShim(page)
    const before = await bootDocument(page)
    // One committed edit so the history path has a step to execute.
    const paragraph = page.locator('#ag-editor-id span.ag-paragraph').last()
    await paragraph.click()
    await page.keyboard.press('End')
    await page.keyboard.type('Z')
    await expect.poll(async () => (await readStore(page)).activeMarkdown ?? '', { timeout: 5_000 }).toContain('Z')
    const beforeComposition = await readStore(page)
    await startComposition(page, PINYIN, 'type')
    const historyAtCompositionStart = await page.evaluate(() => {
      const app = document.querySelector('#app') as any
      const store = app.__vue_app__.config.globalProperties.$pinia._s.get('editor')
      const history = store.currentFile.history
      return { index: history.index, length: history.stack.length }
    })
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(String(err)))

    await page.evaluate(() => {
      ;(window as any).__bus.emit('undo')
    })
    await page.waitForTimeout(500)
    const historyAfterUndo = await page.evaluate(() => {
      const app = document.querySelector('#app') as any
      const store = app.__vue_app__.config.globalProperties.$pinia._s.get('editor')
      const history = store.currentFile.history
      return { index: history.index, length: history.stack.length }
    })
    // Deliver the compositionend the way an IME would after the reparse; the
    // preedit is already gone, so no payload assertion is possible here.
    await dispatchRawCompositionEnd(page, '你好')

    const after = await readStore(page)
    const dom = await readDom(page)
    expect(errors, 'undo path does not throw').toEqual([])
    expect(after.activeMarkdown ?? '').not.toContain(PINYIN)
    expect(dom.editorText ?? '').not.toContain(PINYIN)
    // Undo restored a committed history state — never the preedit.
    expect([before.activeMarkdown, beforeComposition.activeMarkdown])
      .toContain(after.activeMarkdown)
    expect(historyAfterUndo.index).toBe(historyAtCompositionStart.index - 1)

    test.info().annotations.push(
      { type: 'observedLegacyBehavior', description: observedLegacyBehavior },
      { type: 'desiredInvariant', description: desiredInvariant }
    )
  })
})

// START_BLOCK_SEEDED_SESSIONS
type SeededKind = 'edit' | 'undo' | 'redo' | 'save' | 'switch' | 'source' | 'external'

interface SeededTraceStep {
  action: string
  state: unknown
}

interface SeededSessionResult {
  seed: number
  actions: SeededKind[]
  trace: SeededTraceStep[]
  minimized: SeededTraceStep[]
  finalState: unknown
}

function buildSeededSession (seed: number): SeededKind[] {
  // Fixed multiset guarantees the required mix; the seeded shuffle fixes the
  // order. One edit is pinned first so history actions have something to do.
  const rest: SeededKind[] = [
    'edit', 'edit', 'undo', 'undo', 'redo', 'save', 'save',
    'switch', 'switch', 'source', 'external'
  ]
  const rand = mulberry32(seed)
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    const tmp = rest[i]
    rest[i] = rest[j]
    rest[j] = tmp
  }
  return ['edit', ...rest]
}

function digestSessionState (state: StoreSnapshot) {
  return {
    activePath: state.activePath,
    tabCount: state.tabCount,
    sourceCode: state.sourceCode,
    tabs: state.tabs
      .map((t) => ({ pathname: t.pathname, markdown: t.markdown, isSaved: t.isSaved }))
      .sort((a, b) => String(a.pathname).localeCompare(String(b.pathname)))
  }
}

function minimizeTrace (trace: SeededTraceStep[]): SeededTraceStep[] {
  // Collapse consecutive steps whose observable digest did not change. The
  // seed still reconstructs the full action list, so no hidden information is
  // needed to replay a failure from the retained trace.
  const minimized: SeededTraceStep[] = []
  let previous = ''
  for (const step of trace) {
    const digest = JSON.stringify(step.state)
    if (digest !== previous) {
      minimized.push(step)
      previous = digest
    }
  }
  return minimized.length ? minimized : trace.slice(-1)
}

async function runSeededSession (page: Page, seed: number): Promise<SeededSessionResult> {
  await bootEditor(page)
  await openFileTab(page, '/tmp/mark-e2e/ime-seed-a.md', '# Seed A\n\nAlpha paragraph.\n')
  await expect.poll(async () => (await readStore(page)).activePath, { timeout: 5_000 })
    .toBe('/tmp/mark-e2e/ime-seed-a.md')
  await openFileTab(page, '/tmp/mark-e2e/ime-seed-b.md', '# Seed B\n\nBeta paragraph.\n')
  await expect.poll(async () => (await readStore(page)).activePath, { timeout: 5_000 })
    .toBe('/tmp/mark-e2e/ime-seed-b.md')

  await page.evaluate(() => {
    const w = window as any
    w.__imeSeedSaveCalls = []
    w.__mockInvoke.mt_response_file_save = (args: any) => {
      w.__imeSeedSaveCalls.push(args)
      return { id: args.id, pathname: args.pathname, filename: args.filename, isSaved: true }
    }
  })

  const actions = buildSeededSession(seed)
  const trace: SeededTraceStep[] = []
  for (let index = 0; index < actions.length; index++) {
    const action = actions[index]
    let detail: Record<string, unknown> = {}
    switch (action) {
      case 'edit': {
        const token = `x${index}`
        const paragraph = page.locator('#ag-editor-id span.ag-paragraph').last()
        await paragraph.click()
        await page.keyboard.press('End')
        await page.keyboard.type(token)
        await expect.poll(async () => (await readStore(page)).activeMarkdown ?? '', { timeout: 5_000 })
          .toContain(token)
        await page.waitForTimeout(120)
        detail = { token }
        break
      }
      case 'undo': {
        await page.evaluate(() => { (window as any).__bus.emit('undo') })
        await page.waitForTimeout(250)
        break
      }
      case 'redo': {
        await page.evaluate(() => { (window as any).__bus.emit('redo') })
        await page.waitForTimeout(250)
        break
      }
      case 'save': {
        const before = await page.evaluate(() => (window as any).__imeSeedSaveCalls.length)
        await page.evaluate(async () => {
          const app = document.querySelector('#app') as any
          await app.__vue_app__.config.globalProperties.$pinia._s.get('editor').FILE_SAVE()
        })
        await expect.poll(() => page.evaluate(() => (window as any).__imeSeedSaveCalls.length), { timeout: 5_000 })
          .toBe(before + 1)
        detail = { saveCall: before + 1 }
        break
      }
      case 'switch': {
        const target = await page.evaluate(() => {
          const app = document.querySelector('#app') as any
          const store = app.__vue_app__.config.globalProperties.$pinia._s.get('editor')
          const other = store.tabs.find((t: any) => t.id !== store.currentFile.id)
          store.UPDATE_CURRENT_FILE(other)
          return other.pathname
        })
        await expect.poll(async () => (await readStore(page)).activePath, { timeout: 5_000 }).toBe(target)
        await page.waitForTimeout(100)
        detail = { target }
        break
      }
      case 'source': {
        await page.evaluate(() => { (window as any).__bus.emit('view:toggle-view-entry', 'sourceCode') })
        await expect.poll(() => page.evaluate(() => !!document.querySelector('.source-code .CodeMirror')), { timeout: 5_000 }).toBe(true)
        await page.waitForTimeout(150)
        const sourceValue = (await readDom(page)).sourceValue
        await page.evaluate(() => { (window as any).__bus.emit('view:toggle-view-entry', 'sourceCode') })
        await expect.poll(() => page.evaluate(() => !!document.querySelector('.source-code .CodeMirror')), { timeout: 5_000 }).toBe(false)
        await page.waitForTimeout(150)
        detail = { sourceValueLength: sourceValue?.length ?? 0 }
        break
      }
      case 'external': {
        const external = `# External ${index}\n\nExternal body ${index}.\n`
        await page.evaluate((markdown: string) => {
          const app = document.querySelector('#app') as any
          const store = app.__vue_app__.config.globalProperties.$pinia._s.get('editor')
          store.APPLY_FILE_CHANGE('change', {
            pathname: store.currentFile.pathname,
            kind: 'change',
            data: { markdown, filename: store.currentFile.filename }
          })
        }, external)
        await expect.poll(async () => (await readStore(page)).activeMarkdown, { timeout: 8_000 }).toBe(external)
        detail = { external }
        break
      }
    }
    trace.push({ action: `${action}${JSON.stringify(detail)}`, state: digestSessionState(await readStore(page)) })
  }

  const finalState = digestSessionState(await readStore(page))
  return { seed, actions, trace, minimized: minimizeTrace(trace), finalState }
}

const SEEDED_ACTIONS_HELP =
  'multiset edit3/undo2/redo1/save2/switch2/source1/external1, seeded Fisher-Yates order, edit pinned first'

test.describe('seeded mixed sessions (R-6)', () => {
  test.describe.configure({ timeout: 120_000 })

  test('the same seed produces the identical final state', async ({ page }) => {
    const observedLegacyBehavior =
      'A fixed seed drives the same 12-action edit/undo/redo/save/tab-switch/source-toggle/external-event sequence and the same final observed store state (both tab markdowns, dirty flags, active path, source mode). No wall-clock or random input enters the result.'
    const desiredInvariant =
      'The seeded driver stays deterministic so a failing session is reproducible from the retained seed and minimized trace alone.'

    await installTauriShim(page)
    const first = await runSeededSession(page, SEED)
    const second = await runSeededSession(page, SEED)

    expect(second.finalState, 'same seed, same final observed state').toEqual(first.finalState)
    expect(first.actions).toEqual(second.actions)
    const final = first.finalState as ReturnType<typeof digestSessionState>
    expect(final.tabCount).toBe(2)
    expect(final.tabs).toHaveLength(2)
    expect(final.tabs.map((t) => t.pathname).sort()).toEqual([
      '/tmp/mark-e2e/ime-seed-a.md',
      '/tmp/mark-e2e/ime-seed-b.md'
    ])
    expect(['/tmp/mark-e2e/ime-seed-a.md', '/tmp/mark-e2e/ime-seed-b.md'])
      .toContain(final.activePath)

    // eslint-disable-next-line no-console
    console.log(
      `[IME-SEEDED] seed=0x${SEED.toString(16)} actions=${first.actions.join(',')} (${SEEDED_ACTIONS_HELP})`
    )
    // eslint-disable-next-line no-console
    console.log(`[IME-SEEDED] minimized-trace=${JSON.stringify(first.minimized)}`)
    // eslint-disable-next-line no-console
    console.log(`[IME-SEEDED] final-state=${JSON.stringify(first.finalState)}`)

    test.info().annotations.push(
      { type: 'observedLegacyBehavior', description: observedLegacyBehavior },
      { type: 'desiredInvariant', description: desiredInvariant },
      { type: 'seed', description: `0x${SEED.toString(16)}` },
      {
        type: 'minimizedTrace',
        description: JSON.stringify({ seed: SEED, actions: first.actions, minimized: first.minimized })
      }
    )
  })
})
// END_BLOCK_SEEDED_SESSIONS

// START_BLOCK_FAILING_SEED
interface CloseLossRun {
  payload: string
  preludeSave: boolean
  duringMarkdown: string | null
  duringDom: string | null
  tabCountAfterClose: number
  dialogCount: number
  saveCallsDuringComposition: number
  anyMarkdownReceivedPayload: boolean
  trace: SeededTraceStep[]
}

async function runCloseLossScenario (page: Page, seed: number): Promise<CloseLossRun> {
  const rand = mulberry32(seed)
  const payloads = [PINYIN, HANGUL, DEADKEY]
  const payload = payloads[Math.floor(rand() * payloads.length)]!
  const preludeSave = rand() < 0.5

  await bootEditor(page)
  await openFileTab(page, '/tmp/mark-e2e/ime-failing-seed.md', FIXTURE_MARKDOWN)
  await expect.poll(async () => (await readStore(page)).activePath, { timeout: 5_000 })
    .toBe('/tmp/mark-e2e/ime-failing-seed.md')

  await page.evaluate(() => {
    const w = window as any
    w.__imeLossSaveCalls = []
    w.__mockInvoke.mt_response_file_save = (args: any) => {
      w.__imeLossSaveCalls.push(args)
      return { id: args.id, pathname: args.pathname, filename: args.filename, isSaved: true }
    }
  })

  if (preludeSave) {
    await page.evaluate(async () => {
      const app = document.querySelector('#app') as any
      await app.__vue_app__.config.globalProperties.$pinia._s.get('editor').FILE_SAVE()
    })
    await expect.poll(() => page.evaluate(() => (window as any).__imeLossSaveCalls.length), { timeout: 5_000 }).toBe(1)
  }

  // From here on, any save transport call would be caused by the composition
  // boundary; reset the capture so the assertion is unambiguous.
  await page.evaluate(() => {
    ;(window as any).__imeLossSaveCalls = []
  })

  await startComposition(page, payload, payload === PINYIN ? 'type' : 'insertText')
  const during = await readStore(page)
  const duringDom = await readDom(page)
  expect(during.activeMarkdown ?? '').not.toContain(payload)
  expect(duringDom.editorText ?? '').toContain(payload)
  expect(during.activeSaved, 'the composing tab looks clean').toBe(true)

  await page.evaluate(() => {
    const app = document.querySelector('#app') as any
    app.__vue_app__.config.globalProperties.$pinia._s.get('editor').CLOSE_TAB()
  })
  await expect.poll(async () => (await readStore(page)).tabCount, { timeout: 5_000 }).toBe(0)
  await page.waitForTimeout(250)

  const after = await readStore(page)
  const dialogs = await readDialogs(page)
  const saveCalls = await page.evaluate(() => (window as any).__imeLossSaveCalls.length)
  const anyMarkdownReceivedPayload = during.tabs.some((tab) => tab.markdown.includes(payload))

  return {
    payload,
    preludeSave,
    duringMarkdown: during.activeMarkdown,
    duringDom: duringDom.editorText,
    tabCountAfterClose: after.tabCount,
    dialogCount: dialogs.unsaved + dialogs.workspace + dialogs.messageBox,
    saveCallsDuringComposition: saveCalls,
    anyMarkdownReceivedPayload,
    trace: [
      { action: `open(${'/tmp/mark-e2e/ime-failing-seed.md'})`, state: { activePath: during.activePath, clean: true } },
      { action: preludeSave ? 'prelude-save' : 'no-prelude', state: { clean: true } },
      { action: `compose(${payload})`, state: { markdownHasPayload: false, domHasPayload: true } },
      { action: 'close', state: { tabCount: 0, dialogCount: 0, saveCalls: 0 } }
    ]
  }
}

test.describe('seeded known-loss reproduction (R-6/R-7)', () => {
  test.describe.configure({ timeout: 60_000 })

  test('a seeded clean-looking close drops the active composition (desired invariant currently fails)', async ({ page }) => {
    const observedLegacyBehavior =
      'CLOSE_TAB during an active IME composition sees isSaved=true (Muya has not dispatched a change), so the tab closes with no unsaved-close dialog and no save transport; the composed text never enters any tab markdown and is lost with the tab. This is asserted as today\'s fact, not as acceptable behavior.'
    const desiredInvariant =
      'Closing a tab whose only unsaved content is an active composition must not discard the preedit: commit it first (making the tab dirty and prompting) or refuse to close until compositionend.'

    await installTauriShim(page)
    // The scenario is reconstructible from the fixed seed + retained trace;
    // the same-seed determinism of the mixed driver is pinned by the seeded
    // session test above.
    const first = await runCloseLossScenario(page, FAILING_SEED)

    // The desired invariant fails, the observed behavior passes.
    expect(first.tabCountAfterClose).toBe(0)
    expect(first.dialogCount, 'no prompt appeared').toBe(0)
    expect(first.saveCallsDuringComposition, 'no save transport was attempted').toBe(0)
    expect(first.anyMarkdownReceivedPayload, 'the composed text never reached markdown').toBe(false)
    expect(first.duringDom ?? '').toContain(first.payload)
    expect(first.duringMarkdown ?? '').not.toContain(first.payload)

    // eslint-disable-next-line no-console
    console.log(
      `[IME-SEEDED][failing] seed=0x${FAILING_SEED.toString(16)} payload=${first.payload} preludeSave=${first.preludeSave}`
    )
    // eslint-disable-next-line no-console
    console.log(`[IME-SEEDED][failing] minimized-trace=${JSON.stringify(minimizeTrace(first.trace))}`)

    test.info().annotations.push(
      { type: 'observedLegacyBehavior', description: observedLegacyBehavior },
      { type: 'desiredInvariant', description: desiredInvariant },
      { type: 'seed', description: `0x${FAILING_SEED.toString(16)}` },
      {
        type: 'minimizedTrace',
        description: JSON.stringify({
          seed: FAILING_SEED,
          payload: first.payload,
          preludeSave: first.preludeSave,
          minimized: minimizeTrace(first.trace)
        })
      }
    )
  })
})
// END_BLOCK_FAILING_SEED
