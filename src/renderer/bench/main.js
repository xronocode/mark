// MODULE_CONTRACT
//   PURPOSE: muya perf harness entry. Mounts muya on the fixture (built-in
//            or driver-provided via window.__BENCH_OPTIONS__), runs the
//            requested measurement phases (initial render, real-input typing,
//            scroll jank), reports numbers via #report div + stable [BENCH]
//            console markers.
//   SCOPE:   pure renderer benchmark — NO ipc, NO Pinia, NO Element Plus,
//            NO router. Only muya + fixture markdown.
//   DEPENDS: muya/lib (the v1.2.3 frontend tree), bench/fixture.js
//            (FIXTURE_MARKDOWN default), run-bench.mjs (driver).
//   LINKS:   .grace/graph/runtime.xml M-012 (PhaseRef Phase-B1) step-2.5;
//            .grace/graph/performance.xml M-060 (C-LARGE-DOC-STAGE-0 T-003);
//            verification V-M-012-VB-08, V-M-060.
//   STATUS:  C-LARGE-DOC-STAGE-0 T-003 — typing and scroll phases are REAL:
//            typing injects through document.execCommand('insertText') which
//            fires the genuine beforeinput/input chain into muya's handler
//            (inputCtrl inputType=insertText path), measures input→next-paint
//            per keystroke, and asserts per phase that the Markdown changed
//            and undo restored the pre-edit value. Direct contentState
//            mutation is never used here (microbenchmarks live in
//            tests/renderer/perf).
//
// CHANGE_SUMMARY:
//   - 2026-04-28 B1-step-2.5a: scaffold; PHASE_INIT_RENDER live;
//     PHASE_TYPING + PHASE_SCROLL stubbed with deferred markers.
//   - 2026-04-28 B1-step-2.5b: driver + cross-engine comparison (init only).
//   - 2026-10-27 C-LARGE-DOC-STAGE-0 T-003: real PHASE_TYPING (execCommand
//     insertText through the actual input pipeline + markdown-changed/undo
//     truthfulness assertions) and real PHASE_SCROLL (frame-interval jank
//     distribution); driver-provided fixture/phases via
//     window.__BENCH_OPTIONS__; SKIPPED markers are gone for required runs.

import Muya from 'muya/lib'
import { FIXTURE_MARKDOWN } from './fixture.js'

// ────────────────────────────────────────────────────────────────
// Reporting: write to #report div + console.log with stable prefix.
// Stable prefix [BENCH] required by V-M-012-VB-08 grep self-test.
// ────────────────────────────────────────────────────────────────
const reportEl = () => document.getElementById('report')
function log(line, kind) {
  const el = reportEl()
  if (el) {
    const span = document.createElement('span')
    span.textContent = '\n' + line
    if (kind === 'err') span.className = 'err'
    el.appendChild(span)
    el.scrollTop = el.scrollHeight
  }
  // eslint-disable-next-line no-console
  ;(kind === 'err' ? console.error : console.log)('[BENCH] ' + line)
}

// Wait for two requestAnimationFrame ticks — first lets layout settle,
// second guarantees a paint has been committed. This is the standard
// pattern for "render is visible to the user" timing.
function nextPaint() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(resolve)
    })
  })
}

function median(arr) {
  if (!arr.length) return NaN
  const s = [...arr].sort((a, b) => a - b)
  const m = s.length >>> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

function percentile(arr, p) {
  if (!arr.length) return NaN
  const s = [...arr].sort((a, b) => a - b)
  const idx = Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)
  return s[Math.max(0, idx)]
}

// Driver-provided options (run-bench.mjs injects them before page scripts).
const OPTS = window.__BENCH_OPTIONS__ || {}
const FIXTURE_TEXT =
  typeof OPTS.fixtureText === 'string' && OPTS.fixtureText.length
    ? OPTS.fixtureText
    : FIXTURE_MARKDOWN
const PHASES =
  Array.isArray(OPTS.phases) && OPTS.phases.length
    ? OPTS.phases
    : ['open', 'typing', 'scroll']
const TYPING_SAMPLES = Number.isFinite(OPTS.typingSamples) ? OPTS.typingSamples : 60
const SCROLL_MS = Number.isFinite(OPTS.scrollMs) ? OPTS.scrollMs : 3000

// ────────────────────────────────────────────────────────────────
// Phase 1 — initial render.
// Time from "before construction" to "first paint after construction".
// The 1500ms Phase-B1 step-2.5 criterion applies to the built-in ~6 KB
// fixture; corpus fixtures report numbers only (driver decides gating).
// ────────────────────────────────────────────────────────────────
async function phaseInitRender() {
  performance.mark('init-start')
  const t0 = performance.now()
  const editor = new Muya(document.getElementById('editor'), {
    markdown: FIXTURE_TEXT,
    // muya's I18nCSS expects a translation function; identity works for
    // the harness — we don't render any l10n-dependent UI.
    t: (key) => key
  })
  await nextPaint()
  const t1 = performance.now()
  performance.mark('init-end')
  performance.measure('PHASE_INIT_RENDER', 'init-start', 'init-end')
  log(`[PHASE_INIT_RENDER ms=${(t1 - t0).toFixed(1)}]`)
  return editor
}

// ────────────────────────────────────────────────────────────────
// Phase 2 — typing latency through the REAL input pipeline.
// document.execCommand('insertText') is deprecated but it is the only
// scriptable insertion that fires the genuine beforeinput → input chain
// with inputType=insertText — the exact path muya's keyboard.js
// inputHandler / inputCtrl consumes (same path as compositionend for
// IME). Per keystroke we measure dispatch → next committed paint.
// Truthfulness (R-2): after the loop the document Markdown must contain
// the inserted text, and undo must restore the pre-edit Markdown.
// ────────────────────────────────────────────────────────────────
async function placeCaretInFirstParagraph(editor) {
  const container = editor.container || document.querySelector('#editor .ag-editor-container, #editor [contenteditable]')
  if (!container) throw new Error('typing: muya container not found')
  const focusable = container.querySelector('[contenteditable="true"]') || container
  focusable.focus()
  // Put the caret at the end of the first paragraph's text node.
  const para = focusable.querySelector('p')
  if (!para) throw new Error('typing: no paragraph found in fixture')
  const range = document.createRange()
  range.selectNodeContents(para)
  range.collapse(false)
  const sel = window.getSelection()
  sel.removeAllRanges()
  sel.addRange(range)
  return focusable
}

async function phaseTyping(editor) {
  const mdBefore = editor.getMarkdown()
  const marker = 'zynq' // letters unlikely to collide with fixture pools
  const focusable = await placeCaretInFirstParagraph(editor)

  const samples = []
  let insertions = 0
  for (let i = 0; i < TYPING_SAMPLES; i++) {
    const ch = marker[i % marker.length]
    const t0 = performance.now()
    const ok = document.execCommand('insertText', false, ch)
    if (!ok) throw new Error('typing: execCommand insertText returned false (engine refused)')
    await nextPaint()
    samples.push(performance.now() - t0)
    insertions++
    // Keep the caret at the end of the growing paragraph.
    const sel = window.getSelection()
    if (!sel.rangeCount) await placeCaretInFirstParagraph(editor)
  }
  void focusable

  const mdAfter = editor.getMarkdown()
  const changed = mdAfter !== mdBefore && mdAfter.includes(marker[0])
  let restored = false
  let undos = 0
  while (editor.getMarkdown() !== mdBefore && undos < insertions + 4) {
    editor.undo()
    await nextPaint()
    undos++
  }
  restored = editor.getMarkdown() === mdBefore

  if (!changed) {
    log(`[PHASE_TYPING FAILED reason=markdown-not-changed insertions=${insertions}]`, 'err')
    throw new Error('typing truthfulness: markdown did not change')
  }
  if (!restored) {
    log(`[PHASE_TYPING FAILED reason=undo-not-restored undos=${undos}]`, 'err')
    throw new Error('typing truthfulness: undo did not restore pre-edit markdown')
  }
  log(
    `[PHASE_TYPING n=${samples.length} p50_ms=${percentile(samples, 50).toFixed(1)} p95_ms=${percentile(samples, 95).toFixed(1)} max_ms=${Math.max(...samples).toFixed(1)} mean_ms=${(samples.reduce((a, b) => a + b, 0) / samples.length).toFixed(1)} truth=ok]`
  )
}

// ────────────────────────────────────────────────────────────────
// Phase 3 — scroll jank.
// Programmatic scroll of the document (the harness body is the scroll
// container): one scrollBy per animation frame for SCROLL_MS, recording
// the frame-interval distribution — jank (p95/max, >50ms frames), not
// just average FPS.
// ────────────────────────────────────────────────────────────────
async function phaseScroll() {
  const intervals = []
  let frames = 0
  const t0 = performance.now()
  let last = t0
  await new Promise((resolve) => {
    const step = (now) => {
      const atBottom = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 4
      if (atBottom) window.scrollTo(0, 0)
      else window.scrollBy(0, 90)
      frames++
      intervals.push(now - last)
      last = now
      if (now - t0 >= SCROLL_MS) resolve()
      else requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  })
  const elapsed = performance.now() - t0
  const gt50 = intervals.filter((d) => d > 50).length
  log(
    `[PHASE_SCROLL frames=${frames} elapsed_ms=${elapsed.toFixed(0)} fps=${((frames / elapsed) * 1000).toFixed(1)} frame_p50_ms=${percentile(intervals, 50).toFixed(1)} frame_p95_ms=${percentile(intervals, 95).toFixed(1)} frame_max_ms=${Math.max(...intervals).toFixed(1)} frames_gt_50ms=${gt50}]`
  )
}

// ────────────────────────────────────────────────────────────────
// Internal self-tests — kept in for sanity.
// ────────────────────────────────────────────────────────────────
function selfTest() {
  // median + percentile sanity
  const sample = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
  if (median(sample) !== 5.5) throw new Error('median broken')
  if (percentile(sample, 95) !== 10) throw new Error('p95 broken')
  if (percentile(sample, 50) !== 5) throw new Error('p50 broken')
}

async function main() {
  log(`[HARNESS_BOOT ua=${navigator.userAgent.slice(0, 80)}]`)
  log(`[HARNESS_OPTS fixture_bytes=${new Blob([FIXTURE_TEXT]).size} phases=${PHASES.join('+')}]`)
  selfTest()
  let editor
  try {
    editor = await phaseInitRender()
  } catch (err) {
    log(`init-render failed: ${err && err.message}`, 'err')
    log('[REPORT_DONE status=fail]', 'err')
    return
  }
  try {
    if (PHASES.includes('typing')) await phaseTyping(editor)
    if (PHASES.includes('scroll')) await phaseScroll(editor)
  } catch (err) {
    log(`later phase threw: ${err && err.message}`, 'err')
    log('[REPORT_DONE status=fail]', 'err')
    return
  }
  log('[REPORT_DONE status=ok]')
}

main().catch((err) => log(`harness fatal: ${err && err.message}`, 'err'))
