// MODULE_CONTRACT
//   PURPOSE: muya perf harness entry. Mounts muya on the fixture, runs
//            three measurement phases, reports numbers via #report div +
//            stable [BENCH] console markers.
//   SCOPE:   pure renderer benchmark — NO ipc, NO Pinia, NO Element Plus,
//            NO router. Only muya + the fixture markdown.
//   DEPENDS: muya/lib (the v1.2.3 frontend tree), bench/fixture.js
//            (FIXTURE_MARKDOWN constant).
//   LINKS:   docs/development-plan.xml Phase-B1 step-2.5;
//            verification-plan V-M-012-VB-08.
//   STATUS:  Phase-B1 step-2.5a — initial-render phase wired; typing +
//            scroll phases stubbed with TODO markers (will be filled in
//            step-2.5b once the harness is verified booting in both
//            runtimes).
//
// CHANGE_SUMMARY:
//   - 2026-04-28 B1-step-2.5a: scaffold; PHASE_INIT_RENDER live;
//     PHASE_TYPING + PHASE_SCROLL stubbed with deferred markers.

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

// ────────────────────────────────────────────────────────────────
// Phase 1 — initial render.
// Time from "before construction" to "first paint after construction".
// Target: ≤ 1500ms cold (Phase-B1 step-2.5 PASS criterion).
// ────────────────────────────────────────────────────────────────
async function phaseInitRender() {
  performance.mark('init-start')
  const t0 = performance.now()
  const editor = new Muya(document.getElementById('editor'), {
    markdown: FIXTURE_MARKDOWN,
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
// Phase 2 — typing latency.
// STUB: real keystroke simulation goes through muya's keyboard handler
// which requires synthetic KeyboardEvents OR direct contentState mutation.
// Filling in step-2.5b after harness boots cleanly in both runtimes —
// reduces risk of debugging a broken harness simultaneously with the
// cross-runtime comparison.
// ────────────────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
async function phaseTyping(editor) {
  // TODO(step-2.5b): simulate 60 keystrokes via document.execCommand
  // OR new KeyboardEvent('keypress', ...) dispatched on muya's container,
  // measuring per-keystroke layout cost via requestAnimationFrame timing.
  // Report p50, p95, max, samples via [BENCH][PHASE_TYPING ...] marker.
  log('[PHASE_TYPING SKIPPED reason=stub-deferred-to-step-2.5b]')
}

// ────────────────────────────────────────────────────────────────
// Phase 3 — scroll FPS.
// STUB: programmatic scroll loop. Filling in step-2.5b.
// ────────────────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
async function phaseScroll(editor) {
  // TODO(step-2.5b): scrollBy(0, 50) per RAF for 5 seconds, count frames,
  // emit [BENCH][PHASE_SCROLL fps=X frames=Y elapsed_ms=Z].
  log('[PHASE_SCROLL SKIPPED reason=stub-deferred-to-step-2.5b]')
}

// ────────────────────────────────────────────────────────────────
// Internal self-tests — kept in for sanity. Stripped in step-2.5b
// when real numbers replace the stubs.
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
    await phaseTyping(editor)
    await phaseScroll(editor)
  } catch (err) {
    log(`later phase threw: ${err && err.message}`, 'err')
  }
  log('[REPORT_DONE status=ok]')
}

main().catch((err) => log(`harness fatal: ${err && err.message}`, 'err'))
