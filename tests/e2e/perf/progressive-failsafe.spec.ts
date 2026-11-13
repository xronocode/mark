// FILE: tests/e2e/perf/progressive-failsafe.spec.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: C-LARGE-DOC-WAVE-A T-006 e2e fail-safe tier (R-3/R-6, corners 2/3/4) — on the bench page (real Muya, one ISOLATED instance per test with the primary detached for the whole scenario, the T-005 multi-instance trap pattern): an injected chunking failure abandons the progressive attempt and completes through the legacy mount with the DOM complete and canonical Markdown identical to the same-run legacy instance; edits accepted after open and before the injected failure SURVIVE the fallback (still present after it, still undoable); the pathological shapes mount progressive without unbounded traversal (nested-deep and giant-list served progressive; giant-paragraph and giant-code-block as oversized single units, firstPaint recorded in annotations for the T-009 giant-list decision); and default-off invariance on the app shell (toggle untouched: the Experimental counter records legacy only and the ag-tail-pending indication never appears).
//   SCOPE: Playwright webkit-perf. Bench tests load /bench/ with phases ['open'] (the primary legacy-opened fixture is the same-run canonical reference), then each scenario detaches the primary container, creates its own isolated instance in a fresh host, and restores the primary in a finally — exactly the phaseTailMount pattern (a second live instance corrupts the first through the document-global legacy root on its constructor mount and on undo). The default-off test drives the real app shell only.
//   DEPENDS: Playwright webkit-perf project, the built /bench/ page (window.__BENCH_EDITOR / window.__BENCH_MUYA), the committed tests/e2e/fixtures/large-doc corpus, tests/e2e/perf/helpers/experimental (getServeCounters for the default-off counter), muya.progressive.info().
//   LINKS: .grace/changes/archive/C-LARGE-DOC-WAVE-A (spec R-3, plan T-006, corners 2/3/4); src/renderer/bench/main.js phaseTailMount (the detach pattern); src/muya/lib/progressive (fallback, guards); tests/e2e/perf/progressive-mount.spec.ts (app-shell behavior tier).
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   HERE - this spec's directory (for repo-relative corpus resolution).
//   CORPUS_DIR - repository path of the committed large-doc corpus.
//   FIXTURE_1MB - size-1mb.md (the injected-failure shapes).
//   SHAPE_NESTED - nested-deep.md (depth-guard shape).
//   SHAPE_GIANT_LIST - giant-list.md (traversal-guard shape).
//   SHAPE_GIANT_PARAGRAPH - giant-paragraph.md (oversized single-unit shape).
//   SHAPE_GIANT_CODE - giant-code-block.md (oversized single-unit shape).
//   FIXTURE_MIXED - mixed-100k.md (the default-off app-shell open).
//   DONE_CEILING_MS - bounded wait for a session to settle (fail truthfully, never hang).
//   METADATA - parsed shape-metadata.json (the committed fixture byte/sha256 pins).
//   readFixture - reads a corpus fixture and proves it against its committed pin.
//   loadBenchPage - loads /bench/ with the given fixture legacy-opened (phases ['open']) and waits REPORT_DONE.
//   runIsolatedScenario - the T-005 detach pattern: removes the primary container, creates one isolated Muya in a fresh host, runs the scenario with (instance, fixtureText, legacyCanonical, sleep, nextPaint), always destroys the instance, removes its container and restores the primary at its exact position; returns the scenario outcome plus primaryIntact. The in-page scenario sources ('FAILSAFE', 'EDITS_BEFORE_FALLBACK', 'GUARD_SHAPE') and their in-page helpers (injectThrowOnce, typeWordIntoFirstParagraph) live inside this function's page.evaluate — string literals and closures, not module locals.
//   generateOversizedTailDoc - deterministic document with 110 small paragraphs then ONE >64 KB paragraph — the oversized single-unit path the corpus shapes cannot reach (their whole document fits the synchronous region), proven here through the real progressive path.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-11-02 C-LARGE-DOC-WAVE-A T-006: initial
//   fail-safe suite — injected chunking failure falls back to legacy with
//   canonical-identical Markdown, accepted edits survive the fallback and
//   stay undoable, pathological shapes mount progressive with oversized
//   single-units recorded, and the untouched default records legacy only.
// END_CHANGE_SUMMARY

import { test, expect, type Page } from '@playwright/test'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { installTauriShim } from '../fixtures/tauri-shim'
import { bootEditor } from '../fixtures/helpers'
import { getServeCounters } from './helpers/experimental'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const CORPUS_DIR = path.resolve(HERE, '..', 'fixtures', 'large-doc')
const FIXTURE_1MB = 'size-1mb.md'
const SHAPE_NESTED = 'nested-deep.md'
const SHAPE_GIANT_LIST = 'giant-list.md'
const SHAPE_GIANT_PARAGRAPH = 'giant-paragraph.md'
const SHAPE_GIANT_CODE = 'giant-code-block.md'
const FIXTURE_MIXED = 'mixed-100k.md'

// Bounded waits: a wedged engine fails the gate truthfully instead of
// hanging the runner (the phaseTailMount precedent).
const DONE_CEILING_MS = 90_000

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

async function loadBenchPage (page: Page, fixtureText: string): Promise<void> {
  await page.addInitScript(
    (options) => {
      ;(window as unknown as { __BENCH_OPTIONS__: unknown }).__BENCH_OPTIONS__ = options
    },
    { fixtureText, phases: ['open'] }
  )
  await page.goto('/bench/', { waitUntil: 'load' })
  await page.waitForFunction(
    () => {
      const el = document.getElementById('report')
      return el && el.textContent.includes('REPORT_DONE')
    },
    { timeout: 60_000 }
  )
}

// The T-005 multi-instance trap pattern, verbatim in spirit: the primary
// container is removed for the WHOLE scenario (the isolated instance is
// then the only editor root in the document, so every legacy global-root
// walk — the empty constructor mount, the fallback render, every undo —
// resolves to the isolated instance), and restored at its exact position in
// a finally. The scenario gets the live instance, the same-run legacy
// canonical reference and small in-page utilities; it returns plain data.
async function runIsolatedScenario (
  page: Page,
  fixtureText: string,
  scenarioName: string
): Promise<any> {
  return page.evaluate(
    async ({ fixtureText, scenarioName, ceilingMs }) => {
      const w = window as any
      const Muya = w.__BENCH_MUYA
      const primary = w.__BENCH_EDITOR
      if (!Muya || !primary) throw new Error('bench page did not expose __BENCH_MUYA/__BENCH_EDITOR')

      const topLevel = (ed: any) => {
        const root = ed.container && ed.container.querySelector('div#ag-editor-id')
        return root ? root.children.length : -1
      }
      const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
      const nextPaint = () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        )
      const legacyCanonical = primary.getMarkdown()
      const primaryBlocksBefore = topLevel(primary)

      const primaryContainer = primary.container
      const primaryParent = primaryContainer.parentNode
      const primaryNext = primaryContainer.nextSibling
      primaryContainer.remove()

      let ed: any = null
      try {
        const host = document.createElement('div')
        host.id = 'editor-failsafe'
        document.body.insertBefore(host, document.getElementById('report'))
        ed = new Muya(host, { markdown: '', t: (key: string) => key })

        // The injected chunking failure: extendRegion throws exactly once —
        // the next tail slice hits it, the catch-all must own it.
        const injectThrowOnce = (reason: string) => {
          const sr = ed.contentState.stateRender
          const orig = sr.extendRegion.bind(sr)
          let thrown = false
          sr.extendRegion = function (...args: any[]) {
            if (!thrown) {
              thrown = true
              throw new Error(reason)
            }
            return orig(...args)
          }
          return () => thrown
        }

        // One real word through the genuine input pipeline (the bench
        // typing pattern: caret at the end of the first paragraph,
        // execCommand insertText per character).
        const typeWordIntoFirstParagraph = async (word: string) => {
          const container = ed.container
          const focusable =
            container.querySelector('[contenteditable="true"]') || container
          focusable.focus()
          const para = focusable.querySelector('p')
          if (!para) throw new Error('no paragraph found in the mounted region')
          const range = document.createRange()
          range.selectNodeContents(para)
          range.collapse(false)
          const sel = window.getSelection()
          sel.removeAllRanges()
          sel.addRange(range)
          const before = ed.getMarkdown()
          for (const ch of word) {
            const ok = document.execCommand('insertText', false, ch)
            if (ok !== true) throw new Error('execCommand insertText refused')
          }
          return { before, after: ed.getMarkdown() }
        }

        let outcome: any = null
        if (scenarioName === 'FAILSAFE') {
          const open = ed.progressiveMount(fixtureText)
          const wasThrown = injectThrowOnce('injected-chunking-failure')
          await Promise.race([open.done, sleep(ceilingMs)])
          const info = open.info()
          outcome = {
            scenario: 'FAILSAFE',
            thrown: wasThrown(),
            served: info.served,
            status: info.status,
            totalBlocks: info.totalBlocks,
            domCount: topLevel(ed),
            canonOk: ed.getMarkdown() === legacyCanonical,
            error: info.error
          }
        } else if (scenarioName === 'EDITS_BEFORE_FALLBACK') {
          const open = ed.progressiveMount(fixtureText)
          const typed = await typeWordIntoFirstParagraph('zynq')
          const typedOk = typed.after !== typed.before && typed.after.includes('zynq')
          const wasThrown = injectThrowOnce('injected-chunking-failure')
          await Promise.race([open.done, sleep(ceilingMs)])
          const info = open.info()
          const afterFallback = ed.getMarkdown()
          const wordSurvived = afterFallback.includes('zynq')
          // Undo must still restore the pre-edit document (undo walks the
          // legacy render — the reason the primary stays detached).
          let undos = 0
          while (ed.getMarkdown() !== typed.before && undos < 16) {
            ed.undo()
            await nextPaint()
            undos++
          }
          const undoRestored = ed.getMarkdown() === typed.before
          outcome = {
            scenario: 'EDITS_BEFORE_FALLBACK',
            thrown: wasThrown(),
            typedOk,
            served: info.served,
            status: info.status,
            wordSurvived,
            undoRestored,
            undos,
            totalBlocks: info.totalBlocks,
            domCount: topLevel(ed)
          }
        } else if (scenarioName === 'GUARD_SHAPE') {
          const t0 = performance.now()
          const open = ed.progressiveMount(fixtureText)
          const syncMs = performance.now() - t0
          await nextPaint()
          const firstPaintMs = performance.now() - t0
          await Promise.race([open.done, sleep(ceilingMs)])
          const info = open.info()
          outcome = {
            scenario: 'GUARD_SHAPE',
            served: info.served,
            status: info.status,
            totalBlocks: info.totalBlocks,
            domCount: topLevel(ed),
            oversizedUnits: info.oversizedUnits,
            syncRegionBlocks: info.syncRegionBlocks,
            ranges: info.ranges,
            syncMs,
            firstPaintMs,
            canonOk: ed.getMarkdown() === legacyCanonical
          }
        } else {
          throw new Error(`unknown scenario ${scenarioName}`)
        }
        return {
          outcome,
          primaryIntact: topLevel(primary) === primaryBlocksBefore,
          legacyCanonicalLength: legacyCanonical.length
        }
      } finally {
        if (ed) {
          try {
            ed.destroy()
          } catch {
            /* the scenario verdict is already recorded */
          }
          if (ed.container && ed.container.remove) ed.container.remove()
        }
        if (primaryContainer && !primaryContainer.isConnected && primaryParent) {
          primaryParent.insertBefore(primaryContainer, primaryNext)
        }
      }
    },
    { fixtureText, scenarioName, ceilingMs: DONE_CEILING_MS }
  )
}

// The corpus giant shapes fit the synchronous region whole, so they can
// never exercise the oversized TAIL range path (nextRange's one-block
// oversized unit). This deterministic document puts ONE >64 KB paragraph
// BEYOND the 100-block sync region, proving the single-unit mount through
// the real progressive path: served progressive, done, oversizedUnits ≥ 1,
// DOM complete, canonical identical.
function generateOversizedTailDoc (): string {
  const small: string[] = []
  for (let i = 0; i < 110; i++) {
    small.push(`Small paragraph ${i} keeps the deterministic bytes flowing for the region math.`)
  }
  const giant = 'Giant tail paragraph ' + 'a'.repeat(70_000) + ' end-of-giant-marker'
  return [...small, giant].join('\n\n')
}

test.describe('progressive fail-safe and guards on the bench page (C-LARGE-DOC-WAVE-A T-006)', () => {
  test.describe.configure({ retries: 1 })
  test.setTimeout(180_000)

  test('an injected chunking failure on size-1mb abandons the attempt and completes through the legacy mount, canonical-identical', async ({ page }) => {
    const text = readFixture(FIXTURE_1MB)
    await loadBenchPage(page, text)

    const { outcome, primaryIntact } = await runIsolatedScenario(page, text, 'FAILSAFE')
    // eslint-disable-next-line no-console
    console.log(`[progressive-failsafe] tier=renderer-webkit scenario=FAILSAFE fixture=${FIXTURE_1MB} ${JSON.stringify(outcome)} primary_intact=${primaryIntact}`)

    expect(outcome.thrown, 'the injected failure fired').toBe(true)
    expect(outcome.served, 'the fallback served the open through legacy').toBe('legacy')
    expect(outcome.status, 'the session records the fallback').toBe('fallback')
    expect(outcome.totalBlocks, 'the model is whole').toBeGreaterThan(0)
    expect(outcome.domCount, 'the DOM is complete (block count equal)').toBe(outcome.totalBlocks)
    expect(outcome.canonOk, 'canonical Markdown identical to the same-run legacy round-trip').toBe(true)
    expect(primaryIntact, 'the primary instance survived the scenario').toBe(true)
  })

  test('a real word typed while the tail is pending SURVIVES the injected fallback and is still undoable', async ({ page }) => {
    const text = readFixture(FIXTURE_1MB)
    await loadBenchPage(page, text)

    const { outcome, primaryIntact } = await runIsolatedScenario(page, text, 'EDITS_BEFORE_FALLBACK')
    // eslint-disable-next-line no-console
    console.log(`[progressive-failsafe] tier=renderer-webkit scenario=EDITS_BEFORE_FALLBACK fixture=${FIXTURE_1MB} ${JSON.stringify(outcome)} primary_intact=${primaryIntact}`)

    expect(outcome.typedOk, 'the word was accepted through the real input pipeline').toBe(true)
    expect(outcome.thrown, 'the injected failure fired after the edit').toBe(true)
    expect(outcome.served, 'the open completed through the legacy fallback').toBe('legacy')
    expect(outcome.status).toBe('fallback')
    expect(outcome.wordSurvived, 'the accepted edit survived the fallback').toBe(true)
    expect(outcome.undoRestored, 'undo still restores the pre-edit document').toBe(true)
    expect(outcome.domCount, 'the DOM is complete after the fallback').toBe(outcome.totalBlocks)
    expect(primaryIntact, 'the primary instance survived the scenario').toBe(true)
  })

  for (const shape of [SHAPE_NESTED, SHAPE_GIANT_LIST, SHAPE_GIANT_PARAGRAPH, SHAPE_GIANT_CODE]) {
    test(`pathological shape ${shape} mounts progressive with bounded traversal`, async ({ page }, testInfo) => {
      const text = readFixture(shape)
      await loadBenchPage(page, text)

      const { outcome, primaryIntact } = await runIsolatedScenario(page, text, 'GUARD_SHAPE')
      // Evidence for the T-009 giant-list decision: firstPaint numbers in
      // annotations, exactly as the plan's corner-4 note requires.
      testInfo.annotations.push({
        type: 'waveA-firstPaint',
        description: `${shape} sync_ms=${outcome.syncMs.toFixed(1)} first_paint_ms=${outcome.firstPaintMs.toFixed(1)} oversized_units=${outcome.oversizedUnits} sync_region_blocks=${outcome.syncRegionBlocks} ranges=${outcome.ranges} total_blocks=${outcome.totalBlocks}`
      })
      // eslint-disable-next-line no-console
      console.log(
        `[progressive-failsafe] tier=renderer-webkit scenario=GUARD_SHAPE fixture=${shape} served=${outcome.served} status=${outcome.status} sync_ms=${outcome.syncMs.toFixed(1)} first_paint_ms=${outcome.firstPaintMs.toFixed(1)} oversized_units=${outcome.oversizedUnits} sync_region_blocks=${outcome.syncRegionBlocks} ranges=${outcome.ranges} blocks=${outcome.domCount}/${outcome.totalBlocks} canon_ok=${outcome.canonOk} primary_intact=${primaryIntact}`
      )

      expect(outcome.served, `${shape} is served by the progressive path`).toBe('progressive')
      expect(outcome.status, `${shape} completes`).toBe('done')
      expect(outcome.domCount, `${shape} DOM block count is complete`).toBe(outcome.totalBlocks)
      expect(outcome.canonOk, `${shape} canonical round-trip`).toBe(true)
      expect(primaryIntact, 'the primary instance survived the scenario').toBe(true)

      if (shape === SHAPE_GIANT_PARAGRAPH || shape === SHAPE_GIANT_CODE) {
        // Oversized single blocks mount as ONE unit. What info() actually
        // reports on these corpus shapes: the whole document (2 top-level
        // blocks) is covered by the SYNCHRONOUS region — mountRangeFresh
        // records the coverage as the initial frozen range without the
        // tail's oversized counter, so the proof is either an oversized
        // tail unit or full sync-region coverage (the recorded T-003
        // narrowing of R-1's content-chunking; decision at T-009).
        const coveredBySyncRegion = outcome.syncRegionBlocks === outcome.totalBlocks
        expect(
          outcome.oversizedUnits >= 1 || coveredBySyncRegion,
          `${shape} mounts as single units (oversized tail unit or sync-region coverage)`
        ).toBe(true)
        if (coveredBySyncRegion) {
          expect(outcome.ranges, `${shape} needed no tail ranges`).toBe(0)
        }
      } else {
        // nested-deep / giant-list: what info() actually reports is the
        // whole shape inside the initial region as well (giant-list is ONE
        // 18k-item top-level list block, nested-deep 3 blocks) — the guard
        // keeps traversal bounded (no stack blowup, status done) and the
        // oversized counter stays at zero because no oversized TAIL range
        // was ever scheduled.
        expect(outcome.oversizedUnits, `${shape} records no oversized tail units`).toBe(0)
      }
    })
  }

  test('a >64 KB paragraph beyond the sync region mounts as an oversized single unit', async ({ page }, testInfo) => {
    const text = generateOversizedTailDoc()
    await loadBenchPage(page, text)

    const { outcome, primaryIntact } = await runIsolatedScenario(page, text, 'GUARD_SHAPE')
    testInfo.annotations.push({
      type: 'waveA-firstPaint',
      description: `oversized-tail-doc sync_ms=${outcome.syncMs.toFixed(1)} first_paint_ms=${outcome.firstPaintMs.toFixed(1)} oversized_units=${outcome.oversizedUnits} sync_region_blocks=${outcome.syncRegionBlocks} ranges=${outcome.ranges} total_blocks=${outcome.totalBlocks}`
    })
    // eslint-disable-next-line no-console
    console.log(
      `[progressive-failsafe] tier=renderer-webkit scenario=GUARD_SHAPE fixture=oversized-tail-doc served=${outcome.served} status=${outcome.status} sync_ms=${outcome.syncMs.toFixed(1)} first_paint_ms=${outcome.firstPaintMs.toFixed(1)} oversized_units=${outcome.oversizedUnits} sync_region_blocks=${outcome.syncRegionBlocks} ranges=${outcome.ranges} blocks=${outcome.domCount}/${outcome.totalBlocks} canon_ok=${outcome.canonOk} primary_intact=${primaryIntact}`
    )

    expect(outcome.served).toBe('progressive')
    expect(outcome.status).toBe('done')
    expect(outcome.syncRegionBlocks, 'the sync region stopped before the document end').toBeLessThan(outcome.totalBlocks)
    expect(outcome.oversizedUnits, 'the giant tail paragraph mounted as an oversized single unit').toBeGreaterThanOrEqual(1)
    expect(outcome.ranges, 'tail ranges actually ran').toBeGreaterThanOrEqual(1)
    expect(outcome.domCount).toBe(outcome.totalBlocks)
    expect(outcome.canonOk).toBe(true)
    expect(primaryIntact).toBe(true)
  })
})

test.describe('default-off invariance on the app shell (C-LARGE-DOC-WAVE-A T-006 corner-2)', () => {
  test.describe.configure({ retries: 1 })
  test.setTimeout(120_000)

  test('with the toggle untouched, an open is served legacy only and the tail indication never appears', async ({ page }) => {
    const text = readFixture(FIXTURE_MIXED)
    await installTauriShim(page)
    await bootEditor(page)

    // The counter line read from the REAL Experimental tab (the helper
    // only bridges the event transport — the toggle itself stays untouched).
    const c0 = await getServeCounters(page)
    expect(c0.toggleOn, 'the toggle is off by default').toBe(false)

    await page.evaluate((payload: any) => {
      ;(window as any).__emitFakeEvent('mt::open-new-tab', payload)
    }, {
      pathname: '/tmp/mark-e2e/default-off.md',
      filename: 'default-off.md',
      markdown: text,
      isUtf8BomEncoded: false,
      lineEnding: 'lf',
      adjustLineEndingOnSave: false
    })
    await page.waitForFunction(
      () => (document.querySelector('#ag-editor-id') as HTMLElement)?.children.length > 0,
      undefined,
      { timeout: 20_000 }
    )
    await page.waitForTimeout(800)

    // The reserved-space indication never appears on the default path.
    expect(await page.locator('.editor-wrapper.ag-tail-pending').count()).toBe(0)

    // The Experimental counter records legacy only (a fresh session starts
    // at zero-zero; this open added exactly one legacy).
    const c1 = await getServeCounters(page)
    expect(c1.toggleOn, 'the toggle is still off').toBe(false)
    expect(c1.progressive, 'no progressive opens were served').toBe(c0.progressive)
    expect(c1.legacy, 'the open was served legacy').toBe(c0.legacy + 1)
    // eslint-disable-next-line no-console
    console.log(
      `[progressive-failsafe] tier=renderer-webkit scenario=DEFAULT_OFF fixture=${FIXTURE_MIXED} counters="${c1.text}"`
    )
  })
})
