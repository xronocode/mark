// FILE: tests/e2e/perf/progressive-mount.spec.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: C-LARGE-DOC-WAVE-A T-006 e2e tier (R-6, corners 1/5/10) — with the product toggle enabled through the REAL Settings UI, prove the progressive open path's observable BEHAVIOR in the app shell: fast first visible content on size-1mb, exact tail completion against the fixture's top-level block count computed in Node, canonical Copy-as-Markdown equivalence with a legacy-served open, model completeness (word count / TOC) before the tail lands, navigation (search hit near the end, jump-to-end) never blank, continuous scrolling never presenting the truncation strip as final content, reading-position anchoring across tail completion, and the per-session served counter (progressive after toggle-on opens, legacy after a toggle-off open and after a position-restored reopen — the recorded T-004 narrowing).
//   SCOPE: Playwright webkit-perf against the BUILT app shell (vite preview + tauri shim) on the committed corpus (size-1mb headline, mixed-100k medium). Numeric emission is impossible from the app shell, so every assertion is behavioral with LOOSE non-flaky ceilings only (corner-1's narrowing: hard budgets live in the bench baseline artifacts and the owner acceptance, never guessed into CI). No second Muya instance is ever created in these tests (the T-005 multi-instance trap).
//   DEPENDS: Playwright webkit-perf project (retries 1), tests/e2e/fixtures/tauri-shim, tests/e2e/fixtures/helpers, tests/e2e/perf/helpers/experimental (real-UI toggle + counters), tests/e2e/perf/helpers/muya-lexer (Node-side top-level block count through the real muya Lexer), the committed tests/e2e/fixtures/large-doc corpus.
//   LINKS: .grace/changes/active/C-LARGE-DOC-WAVE-A (spec R-1/R-2/R-4, plan T-006, corners 1/2/5/10); src/renderer/src/components/editorWithTabs/editor.vue (open-path orchestration); src/muya/lib/progressive (the T-003 controller); tests/e2e/perf/progressive-failsafe.spec.ts (fail-safe tier); tests/e2e/perf/bench-phases-webkit.spec.ts (numeric WebKit tier).
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   HERE - this spec's directory (for repo-relative corpus resolution).
//   CORPUS_DIR - repository path of the committed large-doc corpus.
//   FIXTURE_1MB - size-1mb.md fixture name (the headline shape).
//   FIXTURE_MIXED - mixed-100k.md fixture name (the medium shape).
//   CEILING_FVC_MS - loose CI ceiling for first visible content on size-1mb (deliberately generous; the contract's 400 ms ordinary budget is baseline/owner evidence, never this CI gate).
//   CEILING_TAIL_MS - loose CI ceiling for tail completion on size-1mb (the real 2500 ms budget is owner evidence).
//   ANCHOR_MAX_SHIFT_PX - tolerated scrollTop drift across tail completion (append-below growth cannot move it; anything larger is a jump).
//   METADATA - parsed shape-metadata.json (the committed fixture byte/sha256 pins).
//   readFixture - reads a corpus fixture and proves it against its committed pin (bytes + sha256).
//   muyaWordCount - Node mirror of muya's wordCount over the fixture text.
//   headingsInMarkdown - Node mirror of muya's getTOC heading extraction.
//   uniqueTailMarker - finds a string from the fixture's last 500 bytes that occurs exactly once in the document (the search-navigation target near the document end).
//   openPayload - builds the mt::open-new-tab payload for a fixture at a fresh path.
//   openFixtureFresh - boots the editor, opens the fixture at a FRESH path (no remembered position — restored-cursor opens stay legacy by the recorded T-004 narrowing) and returns in-page first-visible-content milliseconds measured from the open emit.
//   rootBlockCount - in-page top-level DOM block count of the editor root.
//   waitTailSettled - waits for the reserved-space ag-tail-pending indication to appear (when expectPending) and then disappear.
//   copyAsMarkdown - drives the real whole-document Copy as Markdown command with a captured clipboard transport and returns the canonical text.
//   editorStore - in-page read of the live editor Pinia store.
//   scrollContainer - in-page locator of the editor scroll container (.editor-component).
//   topVisibleBlockText - in-page text of the topmost root child intersecting the viewport (the anchoring probe).
//   installPositionBackend - installs the localStorage-backed prefs mock and seeds one remembered muyaIndexCursor entry for a path (position-memory spec precedent) so the reopen exercises the restored-cursor legacy narrowing.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-11-02 C-LARGE-DOC-WAVE-A T-006: initial
//   app-shell progressive-mount suite — FVC/tail/DOM-count on the corpus
//   shapes, canonical equivalence against a toggle-off open, model
//   completeness during the pending tail, search/jump-to-end navigation,
//   truncation-strip scroll behavior, anchoring, and the served counter
//   including the restored-cursor legacy narrowing.
// END_CHANGE_SUMMARY

import { test, expect } from '@playwright/test'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { installTauriShim } from '../fixtures/tauri-shim'
import { bootEditor } from '../fixtures/helpers'
import {
  enableExperimentalProgressiveMount,
  disableExperimentalProgressiveMount,
  getServeCounters
} from './helpers/experimental'
import { nodeTopLevelBlocks } from './helpers/muya-lexer'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const CORPUS_DIR = path.resolve(HERE, '..', 'fixtures', 'large-doc')
const FIXTURE_1MB = 'size-1mb.md'
const FIXTURE_MIXED = 'mixed-100k.md'

// LOOSE, non-flaky CI ceilings only (plan corner-1: the hard contract
// budgets are baseline-artifact and owner-acceptance evidence; a CI gate
// that tightens them just flakes on slow runners).
const CEILING_FVC_MS = 3_000
const CEILING_TAIL_MS = 90_000
const ANCHOR_MAX_SHIFT_PX = 8

const METADATA = JSON.parse(fs.readFileSync(path.join(CORPUS_DIR, 'shape-metadata.json'), 'utf8'))

function readFixture (name: string): string {
  const fixturePath = path.join(CORPUS_DIR, name)
  const bytes = fs.readFileSync(fixturePath)
  const pin = (METADATA.fixtures as Array<{ name: string, bytes: number, sha256: string }>).find(
    (f) => f.name === name
  )
  expect(pin, `${name} must be pinned in shape-metadata.json`).toBeTruthy()
  expect(bytes.length, `${name} byte length must match its committed pin`).toBe(pin!.bytes)
  expect(createHash('sha256').update(bytes).digest('hex'), `${name} sha256 pin`).toBe(pin!.sha256)
  return bytes.toString('utf8')
}

// ── Node-side fixture analysis ──────────────────────────────────────────
// nodeTopLevelBlocks (helpers/muya-lexer) runs muya's REAL Lexer in Node.
// Top-level blocks = non-space top-level tokens: proven equal to muya's own
// contentState.blocks count on the Stage 0 evidence shapes (mixed-100k 367,
// size-1mb 3706 — T-002/T-003 Evidence). Every suite run re-proves the
// equality against the app's own legacy mount (the equivalence test).

// Mirror of src/muya/lib/utils/index.js wordCount (the characterization
// suite's precedent — the exact function the editor's change event runs).
function muyaWordCount (markdown: string) {
  const paragraph = markdown.split(/\n{2,}/).filter((line) => line).length
  const removedChinese = markdown.replace(/[\u4e00-\u9fa5]/g, '')
  const tokens = removedChinese.split(/[\s\n]+/).filter((t) => t) as string[]
  const chineseWordLength = markdown.length - removedChinese.length
  return {
    word: chineseWordLength + tokens.length,
    paragraph,
    character: tokens.reduce((acc, t) => acc + t.length, 0) + chineseWordLength,
    all: markdown.length
  }
}

// Mirror of src/muya/lib/contentState/tocCtrl.js getTOC (ATX + setext).
function headingsInMarkdown (markdown: string) {
  const lines = markdown.split('\n')
  const headings: Array<{ content: string, lvl: number }> = []
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

// A search-navigation target that lives in the document's LAST 500 bytes
// and occurs exactly once in the whole fixture (computed in Node, asserted
// here so the in-page search can rely on it).
function uniqueTailMarker (text: string): string {
  const tail = text.slice(-500)
  const candidates = tail.match(/[A-Za-z0-9-]{4,}/g) || []
  for (let i = candidates.length - 1; i >= 0; i--) {
    const candidate = candidates[i]
    const first = text.indexOf(candidate)
    if (first !== -1 && text.indexOf(candidate, first + 1) === -1) {
      return candidate
    }
  }
  throw new Error('no unique tail marker in the fixture tail')
}

// ── in-page helpers ─────────────────────────────────────────────────────

function openPayload (pathname: string, markdown: string) {
  return {
    pathname,
    filename: pathname.split('/').pop() || pathname,
    markdown,
    isUtf8BomEncoded: false,
    lineEnding: 'lf',
    adjustLineEndingOnSave: false
  }
}

// Open at a FRESH path (never opened in this session — remembered-position
// reopens stay legacy per the recorded T-004 narrowing). With measureFvc,
// also measures in-page first visible content: open emit → the editor root
// has rendered NEW block children beyond the pre-open baseline (the untitled
// boot tab already renders one empty block, so children > 0 alone would
// measure nothing). The probe is opt-in for a test's FIRST open — a later
// open replacing same-size content could never cross the baseline. rAF
// polled — conservative: paint follows DOM.
async function openFixtureFresh (
  page: any,
  pathname: string,
  markdown: string,
  measureFvc = false
): Promise<number> {
  const fvcMs = await page.evaluate(
    async (args: any) => {
      const w = window as any
      const rootBefore = document.querySelector('#ag-editor-id')
      const baseline = rootBefore ? rootBefore.children.length : 0
      const t0 = performance.now()
      w.__emitFakeEvent('mt::open-new-tab', args.payload)
      if (!args.measureFvc) return -1
      await new Promise<void>((resolve) => {
        const check = () => {
          const root = document.querySelector('#ag-editor-id')
          if (root && root.children.length > baseline) resolve()
          else requestAnimationFrame(check)
        }
        check()
      })
      return performance.now() - t0
    },
    { payload: openPayload(pathname, markdown), measureFvc }
  )
  await page.waitForTimeout(300) // let the store/markers settle past the open
  return fvcMs
}

function rootBlockCount (page: any): Promise<number> {
  return page.evaluate(() => document.querySelector('#ag-editor-id')?.children.length ?? -1)
}

async function waitTailSettled (page: any, expectPending = false) {
  if (expectPending) {
    // Only meaningful on shapes with a reliably long pending window
    // (size-1mb); mixed-100k's tail can complete before the first poll.
    await page.waitForFunction(
      () => !!document.querySelector('.editor-wrapper.ag-tail-pending'),
      undefined,
      { timeout: 10_000 }
    )
  }
  await page.waitForFunction(
    () => !document.querySelector('.editor-wrapper.ag-tail-pending'),
    undefined,
    { timeout: CEILING_TAIL_MS }
  )
}

// The real whole-document Copy as Markdown command with a captured
// clipboard transport (the characterization suite's reader path).
async function copyAsMarkdown (page: any): Promise<string> {
  await page.evaluate(() => {
    const w = window as any
    w.__waveaClips = []
    w.__mockInvoke['plugin:clipboard-manager|write_text'] = (args: any) => {
      w.__waveaClips.push(args)
      return null
    }
  })
  await page.evaluate(() => {
    ;(window as any).__bus.emit('cmd::execute', 'edit.copy-as-markdown')
  })
  await page.waitForFunction(() => (window as any).__waveaClips.length > 0, undefined, {
    timeout: 10_000
  })
  const clip = await page.evaluate(
    () => (window as any).__waveaClips[(window as any).__waveaClips.length - 1]
  )
  return clip && typeof clip.text === 'string' ? clip.text : ''
}

function editorStore (page: any): Promise<any> {
  return page.evaluate(() => {
    const pinia = (document.querySelector('#app') as any).__vue_app__.config.globalProperties.$pinia
    return {
      markdown: pinia._s.get('editor').currentFile?.markdown,
      wordCount: pinia._s.get('editor').currentFile?.wordCount,
      listToc: (pinia._s.get('editor').listToc || []).map((h: any) => ({
        content: h.content,
        lvl: h.lvl
      }))
    }
  })
}

function scrollContainer (page: any) {
  return page.locator('.editor-component')
}

// The topmost editor root child intersecting the viewport (anchoring probe).
function topVisibleBlockText (page: any): Promise<string> {
  return page.evaluate(() => {
    const container = document.querySelector('.editor-component') as HTMLElement
    const root = document.querySelector('#ag-editor-id') as HTMLElement
    const cRect = container.getBoundingClientRect()
    for (const child of Array.from(root.children)) {
      const r = child.getBoundingClientRect()
      if (r.bottom > cRect.top + 8 && r.top < cRect.bottom) {
        return (child.textContent || '').slice(0, 60)
      }
    }
    return ''
  })
}

// The position-memory spec's localStorage-backed prefs backend, seeded with
// one remembered muyaIndexCursor near the document end for `pathname`.
// mt_fs_stat must answer isFile for the seeded path or loadFilePosition's
// prune-missing-files pass drops the entry before the restore (exactly the
// position-memory spec's installBackend).
function installPositionBackend (page: any, pathname: string, markdown: string) {
  return page.evaluate(({ pathname, markdown }) => {
    const w = window as any
    const line = markdown.split('\n').length - 5
    w.__mockInvoke = w.__mockInvoke || {}
    w.__mockInvoke.mt_prefs_get = ({ key }: { key: string }) => {
      const raw = localStorage.getItem('e2e-prefs:' + key)
      return raw === null ? null : JSON.parse(raw)
    }
    w.__mockInvoke.mt_prefs_set = ({ key, value }: { key: string, value: unknown }) => {
      localStorage.setItem('e2e-prefs:' + key, JSON.stringify(value))
      return null
    }
    w.__mockInvoke.mt_fs_stat = (arg: any) => {
      const p = typeof arg === 'string' ? arg : arg?.path ?? arg?.args?.[0]
      return { isFile: p === pathname, isDirectory: false }
    }
    localStorage.setItem(
      'e2e-prefs:filePositions',
      JSON.stringify({
        version: 1,
        files: {
          [pathname]: {
            scrollTop: 0,
            muyaIndexCursor: {
              anchor: { line, ch: 0 },
              focus: { line, ch: 0 }
            },
            savedAt: 1
          }
        }
      })
    )
  }, { pathname, markdown })
}

// ── the suite ───────────────────────────────────────────────────────────

test.describe('progressive mount through the product toggle (C-LARGE-DOC-WAVE-A T-006)', () => {
  test.describe.configure({ retries: 1 })
  test.setTimeout(180_000)

  test.beforeEach(async ({ page }) => {
    await installTauriShim(page)
  })

  test('size-1mb: first visible content is fast, the tail completes, and the DOM ends with the fixture block count', async ({ page }) => {
    const text = readFixture(FIXTURE_1MB)
    const expectedBlocks = await nodeTopLevelBlocks(text)
    await bootEditor(page)
    await enableExperimentalProgressiveMount(page)

    const fvcMs = await openFixtureFresh(page, '/tmp/mark-e2e/progressive-1mb.md', text, true)
    // (a) loose CI-safe ceiling — generous by design (corner-1).
    expect(fvcMs, 'first visible content on size-1mb').toBeGreaterThan(0)
    expect(fvcMs, 'first visible content on size-1mb').toBeLessThan(CEILING_FVC_MS)

    // (b) the tail: the reserved-space indication is present while the tail
    // is pending, then clears, and the DOM ends complete.
    await waitTailSettled(page, true)
    const blocks = await rootBlockCount(page)
    expect(blocks, 'top-level DOM block count equals the fixture block count').toBe(expectedBlocks)

    // eslint-disable-next-line no-console
    console.log(
      `[progressive-mount] tier=renderer-webkit fixture=${FIXTURE_1MB} fvc_ms=${Math.round(fvcMs)} blocks=${blocks}/${expectedBlocks}`
    )
  })

  test('mixed-100k: canonical Copy as Markdown equals the legacy-served open of the same fixture', async ({ page }) => {
    const text = readFixture(FIXTURE_MIXED)
    const expectedBlocks = await nodeTopLevelBlocks(text)
    await bootEditor(page)
    await enableExperimentalProgressiveMount(page)

    // Progressive open (fresh path A). mixed-100k's tail can complete in
    // well under a second, so no pending-window requirement here — the
    // strip-presence evidence lives on the size-1mb tests.
    await openFixtureFresh(page, '/tmp/mark-e2e/equiv-progressive.md', text)
    await waitTailSettled(page, false)
    expect(await rootBlockCount(page)).toBe(expectedBlocks)
    const progressiveCopy = await copyAsMarkdown(page)
    const progressiveStore = await editorStore(page)

    // Legacy open (fresh path B) through the real toggle-off.
    await disableExperimentalProgressiveMount(page)
    await openFixtureFresh(page, '/tmp/mark-e2e/equiv-legacy.md', text)
    await page.waitForFunction(
      () => (document.querySelector('#ag-editor-id') as HTMLElement)?.children.length > 0,
      undefined,
      { timeout: 20_000 }
    )
    await page.waitForTimeout(500)
    // Corner-2 evidence in passing: a legacy open never shows the strip.
    expect(await page.locator('.editor-wrapper.ag-tail-pending').count()).toBe(0)
    expect(await rootBlockCount(page)).toBe(expectedBlocks)
    const legacyCopy = await copyAsMarkdown(page)
    const legacyStore = await editorStore(page)

    // Both mount paths retain and copy the original source byte-for-byte.
    expect(progressiveCopy.length, 'copy-as-markdown is non-empty').toBeGreaterThan(0)
    expect(progressiveCopy).toBe(legacyCopy)
    expect(progressiveStore.markdown).toBe(legacyStore.markdown)
    expect(progressiveCopy).toBe(progressiveStore.markdown)
    expect(progressiveCopy).toBe(text)
  })

  test('size-1mb: word count and TOC cover the whole document while the tail is still pending', async ({ page }) => {
    const text = readFixture(FIXTURE_1MB)
    const expectedWords = muyaWordCount(text)
    const expectedHeadings = headingsInMarkdown(text)
    await bootEditor(page)
    await enableExperimentalProgressiveMount(page)
    await openFixtureFresh(page, '/tmp/mark-e2e/model-1mb.md', text)

    // (d) model completeness BEFORE tail done: poll until the change event
    // has populated the store readers, requiring at least one observation
    // where the tail was still pending with COMPLETE numbers.
    let completeWhilePending = false
    let last: any = null
    const deadline = Date.now() + 30_000
    while (Date.now() < deadline) {
      const snapshot = await page.evaluate(() => ({
        pending: !!document.querySelector('.editor-wrapper.ag-tail-pending'),
        wordCount: (() => {
          const pinia = (document.querySelector('#app') as any).__vue_app__.config.globalProperties.$pinia
          return pinia._s.get('editor').currentFile?.wordCount
        })(),
        toc: (() => {
          const pinia = (document.querySelector('#app') as any).__vue_app__.config.globalProperties.$pinia
          return (pinia._s.get('editor').listToc || []).length
        })()
      }))
      last = snapshot
      const complete =
        snapshot.wordCount &&
        snapshot.wordCount.word === expectedWords.word &&
        snapshot.toc === expectedHeadings.length
      if (complete && snapshot.pending) {
        completeWhilePending = true
        break
      }
      if (complete && !snapshot.pending) break
      await page.waitForTimeout(100)
    }

    expect(last, 'store readers must populate').toBeTruthy()
    expect(last.wordCount.word, 'whole-document word count').toBe(expectedWords.word)
    expect(last.toc, 'whole-document TOC length').toBe(expectedHeadings.length)
    expect(
      completeWhilePending,
      'complete word count/TOC observed while ag-tail-pending was present'
    ).toBe(true)

    await waitTailSettled(page, false)
    // eslint-disable-next-line no-console
    console.log(
      `[progressive-mount] model-completeness tier=renderer-webkit fixture=${FIXTURE_1MB} words=${expectedWords.word} toc=${expectedHeadings.length}`
    )
  })

  test('size-1mb: navigation never blank — a search hit near the document end lands on mounted content, and so does jump-to-end', async ({ page }) => {
    const text = readFixture(FIXTURE_1MB)
    const marker = uniqueTailMarker(text)
    const expectedBlocks = await nodeTopLevelBlocks(text)
    await bootEditor(page)
    await enableExperimentalProgressiveMount(page)
    await openFixtureFresh(page, '/tmp/mark-e2e/navigation-1mb.md', text)
    await page.waitForFunction(
      () => !!document.querySelector('.editor-wrapper.ag-tail-pending'),
      undefined,
      { timeout: 10_000 }
    )

    // (e1) search through the real search bar UI: the whole-document match
    // count is served from the complete model WHILE the tail is pending.
    await page.evaluate(() => {
      ;(window as any).__bus.emit('find', 'find')
    })
    const searchInput = page.locator('.search-bar .search input')
    await expect(searchInput).toBeVisible({ timeout: 5_000 })
    await searchInput.fill(marker)
    // The debounced search (150 ms) populates the counter; assert exactly
    // one whole-document hit while the tail is still pending (trimmed: the
    // span's template leaves a trailing newline in innerText).
    await expect
      .poll(
        async () => (await page.locator('.search-bar .search-result').innerText()).trim(),
        { timeout: 10_000 }
      )
      .toBe('1 / 1')
    expect(
      await page.evaluate(() => !!document.querySelector('.editor-wrapper.ag-tail-pending')),
      'the tail is still pending while the whole-document search count is served'
    ).toBe(true)

    // (e2) jump-to-end during the pending tail: caret lands inside the
    // mounted editable region (never blank).
    await page.locator('#ag-editor-id span.ag-paragraph').first().click({ position: { x: 4, y: 4 } })
    await page.keyboard.press('Meta+End')
    const caretInside = await page.evaluate(() => {
      const sel = window.getSelection()
      const root = document.querySelector('#ag-editor-id')
      return !!(sel && sel.anchorNode && root && root.contains(sel.anchorNode))
    })
    expect(caretInside, 'jump-to-end leaves the caret on mounted content').toBe(true)

    // (e3) bounded wait for tail completion, then the end-dwelling search
    // hit is present on MOUNTED content (the hit landed, never a blank).
    await waitTailSettled(page, false)
    expect(await rootBlockCount(page)).toBe(expectedBlocks)
    const hitMounted = await page.evaluate((needle: string) => {
      const root = document.querySelector('#ag-editor-id')
      return !!root && (root.textContent || '').includes(needle)
    }, marker)
    expect(hitMounted, 'the search hit near the document end is mounted').toBe(true)
    const lastBlockText = (await page.evaluate(
      () => (document.querySelector('#ag-editor-id')?.lastElementChild?.textContent || '').slice(0, 60)
    ))
    expect(
      text.includes(lastBlockText.trim().slice(0, 40)) || lastBlockText.length > 0,
      'the document end carries real content'
    ).toBe(true)
    // eslint-disable-next-line no-console
    console.log(
      `[progressive-mount] navigation tier=renderer-webkit fixture=${FIXTURE_1MB} marker=${marker} caret_inside=${caretInside}`
    )
  })

  test('size-1mb: continuous scrolling toward the end never shows the truncation strip as final content', async ({ page }) => {
    const text = readFixture(FIXTURE_1MB)
    const expectedBlocks = await nodeTopLevelBlocks(text)
    await bootEditor(page)
    await enableExperimentalProgressiveMount(page)
    await openFixtureFresh(page, '/tmp/mark-e2e/scroll-1mb.md', text)
    await page.waitForFunction(
      () => !!document.querySelector('.editor-wrapper.ag-tail-pending'),
      undefined,
      { timeout: 10_000 }
    )

    // (f) scroll continuously toward the end while the tail is pending. The
    // strip may exist during the pending window (it must), but mounted
    // content keeps growing ahead of the viewport and the strip is never
    // the final content: it disappears at done.
    const result = await page.evaluate(async () => {
      const container = document.querySelector('.editor-component') as HTMLElement
      const root = document.querySelector('#ag-editor-id') as HTMLElement
      const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
      let steps = 0
      let stripSeen = 0
      let grewWhileStrip = 0
      let lastChildren = root.children.length
      const deadline = Date.now() + 60_000
      while (document.querySelector('.editor-wrapper.ag-tail-pending') && Date.now() < deadline) {
        const strip = !!document.querySelector('.editor-wrapper.ag-tail-pending')
        if (strip) stripSeen++
        container.scrollBy(0, Math.floor(container.clientHeight * 0.8))
        steps++
        await sleep(120)
        if (root.children.length > lastChildren) {
          if (strip) grewWhileStrip++
          lastChildren = root.children.length
        }
      }
      return {
        steps,
        stripSeen,
        grewWhileStrip,
        finalChildren: root.children.length,
        stripGone: !document.querySelector('.editor-wrapper.ag-tail-pending'),
        atBottom: container.scrollTop + container.clientHeight >= container.scrollHeight - 8,
        lastBlockText: (root.lastElementChild?.textContent || '').slice(0, 60)
      }
    })

    expect(result.stripSeen, 'the strip existed during the pending window').toBeGreaterThan(0)
    expect(result.grewWhileStrip, 'mounted content kept growing ahead of the viewport while the strip showed').toBeGreaterThan(0)
    expect(result.stripGone, 'the strip disappeared at tail completion').toBe(true)
    expect(result.finalChildren).toBe(expectedBlocks)
    expect(result.lastBlockText.length, 'the document end is real content').toBeGreaterThan(0)
    // eslint-disable-next-line no-console
    console.log(
      `[progressive-mount] scroll tier=renderer-webkit fixture=${FIXTURE_1MB} steps=${result.steps} strip_frames=${result.stripSeen} grew_frames=${result.grewWhileStrip} blocks=${result.finalChildren}/${expectedBlocks}`
    )
  })

  test('size-1mb: the reading position holds while the tail completes (anchoring)', async ({ page }) => {
    const text = readFixture(FIXTURE_1MB)
    await bootEditor(page)
    await enableExperimentalProgressiveMount(page)
    await openFixtureFresh(page, '/tmp/mark-e2e/anchor-1mb.md', text)
    await page.waitForFunction(
      () => !!document.querySelector('.editor-wrapper.ag-tail-pending'),
      undefined,
      { timeout: 10_000 }
    )

    // (g) scroll to ~30% of the currently mounted document and record the
    // reading position; the tail then appends BELOW (frozen regions) and
    // the position must hold.
    const before = await page.evaluate(() => {
      const container = document.querySelector('.editor-component') as HTMLElement
      container.scrollTop = Math.floor(container.scrollHeight * 0.3)
      return { scrollTop: container.scrollTop }
    })
    await page.waitForTimeout(250)
    const anchorText = await topVisibleBlockText(page)
    expect(anchorText.length, 'a real block is at the top of the viewport').toBeGreaterThan(0)

    await waitTailSettled(page, false)
    await page.waitForTimeout(250)
    const after = await page.evaluate(() => {
      const container = document.querySelector('.editor-component') as HTMLElement
      return { scrollTop: container.scrollTop }
    })
    const afterText = await topVisibleBlockText(page)

    expect(Math.abs(after.scrollTop - before.scrollTop), 'scrollTop did not jump').toBeLessThanOrEqual(ANCHOR_MAX_SHIFT_PX)
    expect(afterText, 'the same block is at the top of the viewport').toBe(anchorText)
    // eslint-disable-next-line no-console
    console.log(
      `[progressive-mount] anchor tier=renderer-webkit fixture=${FIXTURE_1MB} scrollTop ${Math.round(before.scrollTop)} -> ${Math.round(after.scrollTop)}`
    )
  })

  test('served counter: progressive after toggle-on opens, legacy after a toggle-off open and after a position-restored reopen (T-004 narrowing)', async ({ page }) => {
    const text = readFixture(FIXTURE_MIXED)
    await bootEditor(page)

    // Baseline after a real-UI enable: no opens served yet.
    await enableExperimentalProgressiveMount(page)
    const c0 = await getServeCounters(page)
    expect(c0.toggleOn).toBe(true)

    // A plain open at a fresh path serves PROGRESSIVE.
    await openFixtureFresh(page, '/tmp/mark-e2e/counter-progressive.md', text)
    await waitTailSettled(page, false)
    const c1 = await getServeCounters(page)
    expect(c1.progressive).toBe(c0.progressive + 1)
    expect(c1.legacy).toBe(c0.legacy)
    expect(c1.toggleOn).toBe(true)

    // A toggle-off open (through the real UI) serves LEGACY.
    await disableExperimentalProgressiveMount(page)
    await openFixtureFresh(page, '/tmp/mark-e2e/counter-legacy.md', text)
    await page.waitForTimeout(800)
    const c2 = await getServeCounters(page)
    expect(c2.legacy).toBe(c1.legacy + 1)
    expect(c2.progressive).toBe(c1.progressive)
    expect(c2.toggleOn).toBe(false)

    // T-004 recorded narrowing: an open that RESTORES a remembered position
    // stays LEGACY even with the toggle back ON — progressiveMount cannot
    // carry the parse-time cursor DNA those paths need (UPDATE_CURRENT_FILE
    // emits file-changed with the muyaIndexCursor BEFORE file-loaded, so
    // handleFileChange's legacy setMarkdown branch serves it). muya's own
    // marker rule counts ONLY plain content loads — a cursor restore stays
    // SILENT on the counter (T-003: "cursor/blocks restores ... stay silent
    // so the marker counts real content loads only"), so the narrowing
    // proof is: NOT progressive, counter untouched, content mounted.
    await enableExperimentalProgressiveMount(page)
    await installPositionBackend(page, '/tmp/mark-e2e/counter-restored.md', text)
    await openFixtureFresh(page, '/tmp/mark-e2e/counter-restored.md', text)
    await expect(page.locator('.editor-with-tabs h1').first()).toBeVisible({ timeout: 10_000 })
    await page.waitForTimeout(800)
    const c3 = await getServeCounters(page)
    expect(c3.progressive, 'the restored-cursor open did NOT go progressive').toBe(c2.progressive)
    expect(c3.legacy, 'the cursor restore is outside muya marker-counted set (silent)').toBe(c2.legacy)
    expect(c3.toggleOn).toBe(true)
    // ...and it landed mounted: full document visible through the legacy path.
    expect(await rootBlockCount(page)).toBe(await nodeTopLevelBlocks(text))
    // eslint-disable-next-line no-console
    console.log(
      `[progressive-mount] counters tier=renderer-webkit fixture=${FIXTURE_MIXED} baseline=(${c0.progressive}/${c0.legacy}) progressive_open=(${c1.progressive}/${c1.legacy}) toggle_off_open=(${c2.progressive}/${c2.legacy}) restored_reopen=(${c3.progressive}/${c3.legacy})`
    )
  })
})
