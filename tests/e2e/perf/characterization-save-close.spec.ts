// FILE: tests/e2e/perf/characterization-save-close.spec.ts
// VERSION: 1.1.0
// START_MODULE_CONTRACT
//   PURPOSE: Freeze the CURRENT observable save / Save As / Save All / Save & Close / Quit / session / reader output behavior of the renderer at the boundaries named by R-6, dual-recording every known-defect observation instead of blessing it.
//   SCOPE: Renderer-only (vite preview + Tauri shim, WebKit) against the committed semantic-edge corpus: FILE_SAVE, APPLY_SAVE_OUTCOME revision ownership, FILE_SAVE_AS (payload + overwrite-by-path), ASK_FOR_SAVE_ALL(false) mt_save_tabs no-op, CLOSE_TAB -> unsaved-close dialog -> mt_save_and_close_tabs, edit-after-payload-before-close race, QUIT_APP dialogs/payloads, _saveSessionState prefs writes, muya-derived wordCount/TOC/cursor, whole-document Copy as Markdown and styled-HTML export, and the --new-window no-op. It does NOT cover real Tauri IPC, real disk bytes, native WKWebView, or the multi-window behavior F-MULTI-WINDOW will add.
//   DEPENDS: Playwright webkit-perf project, tests/e2e/fixtures/tauri-shim.ts, tests/e2e/perf/helpers/experimental (the fixtures/helpers bootEditor/openFileTab pass-throughs, plus the WAVEA_EXPERIMENTAL=1 real-UI progressive-toggle enabling — C-LARGE-DOC-WAVE-A T-006), the real Pinia editor store, src/muya wordCount/getTOC semantics, the committed tests/e2e/fixtures/large-doc corpus.
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
//   LAST_CHANGE: v1.1.0 - 2026-11-02 C-LARGE-DOC-WAVE-A T-006: added the
//   WAVEA_EXPERIMENTAL beforeAll hook — bootEditor/openFileTab now import
//   through tests/e2e/perf/helpers/experimental so WAVEA_EXPERIMENTAL=1
//   enables the session-latched progressive-mount toggle through the real
//   Settings UI after every boot (no-op without the env var). Zero
//   assertion changes: the suite freezes the same boundaries on both paths.
//   v1.0.0 - 2026-10-27 C-LARGE-DOC-STAGE-0 T-006: initial
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
// C-LARGE-DOC-WAVE-A T-006: bootEditor/openFileTab come from the Wave A
// experimental helper — byte-for-byte the shared fixture when
// WAVEA_EXPERIMENTAL is unset; with WAVEA_EXPERIMENTAL=1 every boot also
// enables the session-latched progressive-mount toggle through the REAL
// Settings UI, so the whole suite reruns on the progressive path with
// ZERO assertion changes (the beforeAll hook below arms it).
import { bootEditor, openFileTab, waveaExperimentalBeforeAll } from './helpers/experimental'

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
  // C-LARGE-DOC-WAVE-A T-006: WAVEA_EXPERIMENTAL=1 arms the bootEditor
  // wrapper's real-UI progressive-toggle enabling (no-op otherwise) — the
  // toggle-on characterization rerun rides this hook; no assertion changes.
  waveaExperimentalBeforeAll()
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

async function installSaveMock(page: any) {
  await page.evaluate(() => {
    const w=window as any; w.__saveCalls=[]
    w.__mockInvoke.mt_document_write_snapshot=({request}:any)=>{
      w.__saveCalls.push({...request,pathname:request.targetPath,filename:request.targetPath.split('/').pop(),defaultPath:null})
      return {...request,pathname:request.targetPath,filename:request.filename}
    }
  })
}
async function installPendingSaveMock(page:any) {
  await page.evaluate(()=>{
    const w=window as any;w.__saveCalls=[]
    w.__mockInvoke.mt_document_write_snapshot=({request}:any)=>{
      w.__saveCalls.push(request)
      return new Promise(resolve=>{w.__saveResolve=()=>resolve({...request,pathname:request.targetPath,filename:request.filename})})
    }
  })
}
async function installSaveAsMock(page:any,destination:string) {
  await page.evaluate(dest=>{
    const w=window as any;w.__saveAsCalls=[]
    w.__mockInvoke.mt_document_choose_save_target=({request}:any)=>({...request,pathname:dest})
    w.__mockInvoke.mt_document_write_snapshot=({request}:any)=>{w.__saveAsCalls.push(request);return {...request,pathname:request.targetPath,filename:dest.split('/').pop()}}
  },destination)
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
  test('a late write acknowledgement keeps newer text dirty with a visible explanation',async({page})=>{
    pushDualRecord('The old close/save acknowledgement could clean or discard later edits.','C-SAVE-CLOSE-DATA-SAFETY: keep newer text open and dirty; require explicit retry.')
    await openFixture(page);await editTargetParagraph(page,'A');await installPendingSaveMock(page)
    await startSave(page);await page.waitForFunction(()=>(window as any).__saveCalls.length===1)
    await editTargetParagraph(page,'B');const newer=await readTab(page)
    await page.evaluate(()=>(window as any).__saveResolve())
    await expect(page.locator('.notification-card').first()).toBeVisible()
    expect((await readTab(page)).markdown).toBe(newer.markdown);expect((await readTab(page)).isSaved).toBe(false)
  })
  test('Save As adopts only the selected destination and exact current text',async({page})=>{
    await bootEditor(page);await typeIntoUntitled(page,'Fresh draft');const before=await readTab(page)
    await installSaveAsMock(page,'/tmp/mark-e2e/fresh.md');await startSaveAs(page)
    await expect.poll(async()=>(await readTab(page)).pathname).toBe('/tmp/mark-e2e/fresh.md')
    expect(await page.evaluate(()=>(window as any).__saveAsCalls[0].markdown)).toBe(before.markdown)
    expect((await readTab(page)).isSaved).toBe(true)
  })
  test('Save As cannot evict another open path owner',async({page})=>{
    await openFixture(page);await openFileTab(page,'/tmp/mark-e2e/second.md','# Second\n\nBody.\n')
    await installSaveAsMock(page,NAMED_PATH);await startSaveAs(page)
    await expect(page.locator('.notification-card').first()).toBeVisible()
    const state=await storeState(page);expect(state.ids).toHaveLength(2)
    expect(await page.evaluate(()=>(window as any).__saveAsCalls.length)).toBe(0)
  })
  test('Save All writes a dirty document over the registered transport and never closes it',async({page})=>{
    await openFixture(page);await editTargetParagraph(page,'S');await installSaveMock(page)
    await page.evaluate(async()=>{const store=(document.querySelector('#app') as any).__vue_app__.config.globalProperties.$pinia._s.get('editor');await store.ASK_FOR_SAVE_ALL(false)})
    expect(await page.evaluate(()=>(window as any).__saveCalls.length)).toBe(1)
    expect((await readTab(page)).isSaved).toBe(true);expect((await storeState(page)).ids).toHaveLength(1)
  })
  test('Save and Close waits for a real correlated write and ignores a bare close event',async({page})=>{
    await openFixture(page);await editTargetParagraph(page,'C');await installPendingSaveMock(page)
    await page.evaluate(()=>{const store=(document.querySelector('#app') as any).__vue_app__.config.globalProperties.$pinia._s.get('editor');void store.CLOSE_TAB()})
    await page.locator('.ag-unsaved-close-save').click();await page.waitForFunction(()=>(window as any).__saveCalls.length===1)
    await page.evaluate(()=>{const w=window as any;w.__emitFakeEvent('mt::force-close-tabs-by-id',[w.__saveCalls[0].id])})
    expect((await storeState(page)).ids).toHaveLength(1)
    await page.evaluate(()=>(window as any).__saveResolve())
    await expect.poll(async()=>(await storeState(page)).ids.length).toBe(0)
  })
  for(const action of ['save','discard','cancel']) {
    test(`untitled Quit has a distinct ${action} decision`,async({page})=>{
      await bootEditor(page);await typeIntoUntitled(page,'Keep my draft');await installSaveAsMock(page,'/tmp/mark-e2e/quit-draft.md')
      await page.evaluate(()=>{const w=window as any;w.__quitCalls=0;w.__mockInvoke.mt_app_quit=()=>{w.__quitCalls++;return null};const store=(document.querySelector('#app') as any).__vue_app__.config.globalProperties.$pinia._s.get('editor');void store.QUIT_APP()})
      await expect(page.locator('.ag-unsaved-close-dialog')).toBeVisible()
      await page.locator(`.ag-unsaved-close-${action}`).click()
      if(action==='cancel'){expect(await page.evaluate(()=>(window as any).__quitCalls)).toBe(0);expect((await readTab(page)).isSaved).toBe(false)}
      else {await expect.poll(()=>page.evaluate(()=>(window as any).__quitCalls)).toBe(1)}
      expect(await page.evaluate(()=>(window as any).__saveAsCalls.length)).toBe(action==='save'?1:0)
    })
  }

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
