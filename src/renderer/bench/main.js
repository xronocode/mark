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
//   STATUS:  C-LARGE-DOC-STAGE-0 T-003/T-005 — typing and scroll phases are
//            REAL: typing injects through document.execCommand('insertText')
//            which fires the genuine beforeinput/input chain into muya's
//            handler (inputCtrl inputType=insertText path), measures
//            input→next-paint per keystroke, and asserts per phase that the
//            Markdown changed and undo restored the pre-edit value. Direct
//            contentState mutation is never used here (microbenchmarks live in
//            tests/renderer/perf). T-005 shares that burst with PHASE_OVERHEAD,
//            which measures observer overhead against a same-run
//            uninstrumented control; required phases stay numeric-only — a
//            SKIPPED/FAILED label in a required run fails the gate.
//            C-LARGE-DOC-WAVE-A T-005 adds the budgeted time-to-input metric
//            (tti_ms in PHASE_INIT_RENDER and PHASE_TAIL_MOUNT, both paths —
//            the injector drives one REAL keystroke at the earliest
//            input-ready moment: legacy = mount complete, progressive =
//            BLOCK_SYNC_REGION_DONE) and the PHASE_TAIL_MOUNT phase
//            (progressive open measured end-to-end on an isolated second
//            instance; runs LAST — see the multi-instance trap note there).
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
//   - 2026-10-27 C-LARGE-DOC-STAGE-0 T-004: responsiveness meters on both
//     phases (Long Tasks API where available, otherwise the separately
//     named event-loop-lag proxy — never merged cross-engine); PHASE_MEMORY
//     heap observation (Chromium-only API, labelled not-supported
//     elsewhere); PHASE_INIT_RENDER component breakdown (parse_proxy via
//     muya marked Lexer, mount, first_paint); C-68 and C-DOC-CHANGE-JOURNAL
//     retention recorded as not-applicable for the bench harness (no tab
//     lifecycle) / the change not being in this tree (R-4 lifecycle rule).
//   - 2026-10-27 C-LARGE-DOC-STAGE-0 T-005: typingBurst extracted and shared
//     with the optional PHASE_OVERHEAD diagnostic (instrumented vs
//     uninstrumented same-run control, truthfulness enforced in both).
//   - 2026-11-02 C-LARGE-DOC-WAVE-A T-005 (R-6): __BENCH_OPTIONS__.progressive
//     routes the PRIMARY open through muya.progressiveMount (empty bootstrap
//     + progressive open; tti at the sync-region signal; served= token when
//     the path is progressive); ttiProbe (one real keystroke at the earliest
//     input-ready moment, undo-restore afterwards, outside the measured
//     windows) emits tti_ms in PHASE_INIT_RENDER for BOTH paths; new
//     PHASE_TAIL_MOUNT phase — progressive open on an isolated SECOND muya
//     instance (sync region / first paint / tti / tail completion /
//     typing-during-tail / canon round-trip vs the same-run primary), with
//     the primary container detached for the whole phase and restored in a
//     finally (legacy root lookup is the proven multi-instance trap); the
//     primary's pending progressive tail is awaited before REPORT_DONE.

import Muya, {
  BLOCK_MOUNT_SERVED,
  BLOCK_SYNC_REGION_DONE,
  BLOCK_TAIL_MOUNT_DONE
} from 'muya/lib'
import { Lexer } from 'muya/lib/parser/marked'
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
// C-LARGE-DOC-WAVE-A T-005: bench-level --progressive driver flag — the
// primary editor opens through muya.progressiveMount instead of the legacy
// constructor mount. This is the harness seam, distinct from the product
// experimental toggle (T-004); absent the flag, every default and the
// legacy mount path are unchanged.
const PROGRESSIVE = OPTS.progressive === true

// The primary editor's progressive open handle (null on the legacy path) —
// kept so REPORT_DONE can never overtake a pending tail.
let primaryProgressive = null

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// Top-level block count of an editor's own root (dom_ok / primary_intact
// proofs). -1 when the root is missing — never a silent pass.
function topLevelBlockCount(editor) {
  const root = editor.container && editor.container.querySelector('div#ag-editor-id')
  return root ? root.children.length : -1
}

// ────────────────────────────────────────────────────────────────
// Responsiveness observers (C-LARGE-DOC-STAGE-0 T-004, R-3):
// PerformanceObserver('longtask') where the Long Tasks API exists,
// otherwise a separately named 20 ms event-loop-lag proxy (ticker
// drift). The two series are NEVER merged cross-engine — each phase
// marker states which one it carries.
// ────────────────────────────────────────────────────────────────
const LONGTASK_SUPPORTED =
  typeof PerformanceObserver !== 'undefined' &&
  PerformanceObserver.supportedEntryTypes &&
  PerformanceObserver.supportedEntryTypes.includes('longtask')

function makeResponsiveness() {
  const tasks = [] // longtask durations (ms) — Long Tasks API only
  const lag = [] // ticker drift (ms) — event-loop-lag proxy
  let observer = null
  let tickerId = null
  let tickerExpected = 0
  function start() {
    if (LONGTASK_SUPPORTED) {
      observer = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) tasks.push(e.duration)
      })
      observer.observe({ type: 'longtask', buffered: false })
    } else {
      tickerExpected = performance.now()
      tickerId = setInterval(() => {
        const now = performance.now()
        lag.push(now - tickerExpected)
        tickerExpected = now + 20
      }, 20)
    }
  }
  function stop() {
    if (observer) observer.disconnect()
    if (tickerId) clearInterval(tickerId)
    const suffix = LONGTASK_SUPPORTED
      ? `longtasks=${tasks.length} longtask_max_ms=${tasks.length ? Math.max(...tasks).toFixed(1) : 0} longtasks_gt_50ms=${tasks.filter((d) => d > 50).length} meter=longtask-api`
      : `loop_lag_p50_ms=${percentile(lag, 50).toFixed(1)} loop_lag_p95_ms=${percentile(lag, 95).toFixed(1)} loop_lag_max_ms=${lag.length ? Math.max(...lag).toFixed(1) : 0} meter=event-loop-lag-proxy`
    return suffix
  }
  return { start, stop }
}

// Heap observation (R-4): performance.memory exists only in Chromium;
// elsewhere the marker states not-supported instead of guessing.
function heapMarker(label) {
  if (performance.memory && Number.isFinite(performance.memory.usedJSHeapSize)) {
    return `${label}_heap_used_mb=${(performance.memory.usedJSHeapSize / 1048576).toFixed(1)}`
  }
  return `${label}_heap=not-supported`
}

// ────────────────────────────────────────────────────────────────
// C-LARGE-DOC-WAVE-A T-005 (R-6): time-to-input probe. ONE real
// keystroke through the genuine input pipeline (the same injector as
// PHASE_TYPING), driven at the earliest input-ready moment:
//   legacy path      right after the constructor returns (mount complete)
//   progressive path right after progressiveMount returns (sync region
//                    mounted, BLOCK_SYNC_REGION_DONE fired; scheduler
//                    lanes are async, so no tail slice has run yet)
// tti_ms = open start → keystroke ACCEPTED (execCommand ok AND the
// document markdown changed — synchronous reads; no paint wait is folded
// into the metric). restore() undoes the keystroke afterwards with the
// bounded typingBurst undo pattern, OUTSIDE every measured window (the
// undo path runs a full re-render whose cost belongs to no metric here).
// ────────────────────────────────────────────────────────────────
function ttiProbe(editor, openT0) {
  const mdBefore = editor.getMarkdown()
  const ch = 'z' // typingBurst marker letter; landed check follows its pattern
  placeCaretInFirstParagraph(editor)
  const ok = document.execCommand('insertText', false, ch)
  const mdAfter = editor.getMarkdown()
  const accepted = ok === true && mdAfter !== mdBefore && mdAfter.includes(ch)
  const ttiMs = performance.now() - openT0
  return {
    accepted,
    ttiMs,
    async restore() {
      let undos = 0
      while (editor.getMarkdown() !== mdBefore && undos < 6) {
        editor.undo()
        await nextPaint()
        undos++
      }
      return editor.getMarkdown() === mdBefore
    }
  }
}

// ────────────────────────────────────────────────────────────────
// Phase 1 — initial render, with component breakdown (R-4):
// parse_proxy = muya marked Lexer over the fixture (tokenizer stage of
// the real pipeline); mount = Muya constructor; first_paint = end of
// constructor → committed paint. All labelled proxies.
// C-LARGE-DOC-WAVE-A T-005: --progressive routes the open through
// muya.progressiveMount (empty bootstrap, then parse-whole + sync
// region; mount_ms = open start → sync region done), and both paths
// emit tti_ms from the probe above. On the progressive path served=
// records which path actually served the open (fallback honesty).
// Phases are reported separately and never summed (R-6): ms/first_paint
// describe visibility up to the sync region; tail completion is the
// tail-mount phase's own metric.
// ────────────────────────────────────────────────────────────────
async function phaseInitRender() {
  const tParse0 = performance.now()
  const tokens = new Lexer().lex(FIXTURE_TEXT)
  const parseProxyMs = performance.now() - tParse0
  void tokens

  performance.mark('init-start')
  const t0 = performance.now()
  // muya's I18nCSS expects a translation function; identity works for
  // the harness — we don't render any l10n-dependent UI.
  const t = (key) => key
  let editor
  let mountMs
  let served = 'legacy'
  let probe
  if (PROGRESSIVE) {
    // Bootstrap empty, then open progressively. At this moment the page
    // holds exactly one muya instance, so the empty constructor mount's
    // legacy root lookup finds nothing and falls back to this instance's
    // own container (the multi-instance trap is handled in the
    // tail-mount phase, where a second instance exists).
    editor = new Muya(document.getElementById('editor'), { markdown: '', t })
    const open = editor.progressiveMount(FIXTURE_TEXT)
    primaryProgressive = open
    mountMs = performance.now() - t0
    served = open.info().served || 'progressive'
    probe = ttiProbe(editor, t0)
  } else {
    editor = new Muya(document.getElementById('editor'), {
      markdown: FIXTURE_TEXT,
      t
    })
    mountMs = performance.now() - t0
    probe = ttiProbe(editor, t0)
  }
  // C-LARGE-DOC-WAVE-A T-002: expose the live instance and the engine class
  // for driver-side mount-path probes (progressive feasibility spike; the
  // tail-mount driver phase reuses this later). Read-only access; phases own
  // the primary instance's lifecycle.
  window.__BENCH_EDITOR = editor
  window.__BENCH_MUYA = Muya
  await nextPaint()
  const t1 = performance.now()
  performance.mark('init-end')
  performance.measure('PHASE_INIT_RENDER', 'init-start', 'init-end')
  const ttiToken = probe.accepted ? `tti_ms=${probe.ttiMs.toFixed(1)}` : 'tti_ms=FAILED'
  const servedToken = PROGRESSIVE ? ` served=${served}` : ''
  log(
    `[PHASE_INIT_RENDER ms=${(t1 - t0).toFixed(1)} parse_proxy_ms=${parseProxyMs.toFixed(1)} mount_ms=${mountMs.toFixed(1)} first_paint_ms=${(t1 - t0 - mountMs).toFixed(1)} ${ttiToken}${servedToken} tokens=${tokens.length} ${heapMarker('after_open')}]`
  )
  if (!probe.accepted) {
    log('[PHASE_INIT_RENDER FAILED reason=tti-keystroke-not-accepted]', 'err')
    throw new Error('open tti probe: the real keystroke was not accepted')
  }
  // Restore AFTER the phase line: the undo re-render cost must stay out of
  // the measured ms / first_paint windows above.
  await probe.restore()
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

// One deterministic typing burst: `count` real insertions through the
// engine's input pipeline, then undo back to the pre-edit markdown.
// `instrumented=false` is the same-run uninstrumented control used by
// PHASE_OVERHEAD (no PerformanceObserver, no lag ticker) — R-5 requires
// observer overhead to be measured against it, never assumed.
async function typingBurst(editor, count, instrumented) {
  const mdBefore = editor.getMarkdown()
  const marker = 'zynq' // letters unlikely to collide with fixture pools
  await placeCaretInFirstParagraph(editor)
  const resp = instrumented
    ? makeResponsiveness()
    : { start () {}, stop () { return 'meter=disabled-control' } }
  resp.start()

  const samples = []
  for (let i = 0; i < count; i++) {
    const ch = marker[i % marker.length]
    const t0 = performance.now()
    const ok = document.execCommand('insertText', false, ch)
    if (!ok) throw new Error('typing: execCommand insertText returned false (engine refused)')
    await nextPaint()
    samples.push(performance.now() - t0)
    // Keep the caret at the end of the growing paragraph.
    const sel = window.getSelection()
    if (!sel.rangeCount) await placeCaretInFirstParagraph(editor)
  }
  const respSuffix = resp.stop()

  const mdAfter = editor.getMarkdown()
  const changed = mdAfter !== mdBefore && mdAfter.includes(marker[0])
  let restored = false
  let undos = 0
  while (editor.getMarkdown() !== mdBefore && undos < count + 4) {
    editor.undo()
    await nextPaint()
    undos++
  }
  restored = editor.getMarkdown() === mdBefore

  return { samples, changed, restored, undos, respSuffix }
}

async function phaseTyping(editor) {
  const { samples, changed, restored, undos, respSuffix } = await typingBurst(
    editor,
    TYPING_SAMPLES,
    true
  )
  const insertions = samples.length

  if (!changed) {
    log(`[PHASE_TYPING FAILED reason=markdown-not-changed insertions=${insertions}]`, 'err')
    throw new Error('typing truthfulness: markdown did not change')
  }
  if (!restored) {
    log(`[PHASE_TYPING FAILED reason=undo-not-restored undos=${undos}]`, 'err')
    throw new Error('typing truthfulness: undo did not restore pre-edit markdown')
  }
  log(
    `[PHASE_TYPING n=${samples.length} p50_ms=${percentile(samples, 50).toFixed(1)} p95_ms=${percentile(samples, 95).toFixed(1)} max_ms=${Math.max(...samples).toFixed(1)} mean_ms=${(samples.reduce((a, b) => a + b, 0) / samples.length).toFixed(1)} ${respSuffix} truth=ok]`
  )
  log(`[PHASE_MEMORY note=retained-after-edits ${heapMarker('after_edit')} c68_opened_baseline=not-applicable-bench-harness doc_change_journal=not-applicable-change-not-in-tree]`)
}

// ────────────────────────────────────────────────────────────────
// Phase 2b — instrumentation overhead (R-5).
// The SAME page run measures the same typing burst twice: once with the
// responsiveness observers active and once with them fully off. The delta
// is observer overhead — reported on its own line and NEVER folded into
// the baseline numbers. This phase is an optional diagnostic, not one of
// the required phases.
// ────────────────────────────────────────────────────────────────
async function phaseOverhead(editor) {
  const count = Math.max(12, Math.min(40, TYPING_SAMPLES))
  const on = await typingBurst(editor, count, true)
  const off = await typingBurst(editor, count, false)
  if (!on.changed || !on.restored || !off.changed || !off.restored) {
    log(
      `[PHASE_OVERHEAD FAILED reason=truthfulness instrumented_changed=${on.changed} instrumented_restored=${on.restored} control_changed=${off.changed} control_restored=${off.restored}]`,
      'err'
    )
    throw new Error('overhead control truthfulness failed')
  }
  const p50on = percentile(on.samples, 50)
  const p50off = percentile(off.samples, 50)
  const p95on = percentile(on.samples, 95)
  const p95off = percentile(off.samples, 95)
  log(
    `[PHASE_OVERHEAD n=${count} instrumented_p50_ms=${p50on.toFixed(1)} control_p50_ms=${p50off.toFixed(1)} delta_p50_ms=${(p50on - p50off).toFixed(1)} ratio_p50=${(p50on / p50off).toFixed(2)} instrumented_p95_ms=${p95on.toFixed(1)} control_p95_ms=${p95off.toFixed(1)} ratio_p95=${(p95on / p95off).toFixed(2)} truth=ok note=same-run-uninstrumented-control]`
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
  const resp = makeResponsiveness()
  resp.start()
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
  const respSuffix = resp.stop()
  const elapsed = performance.now() - t0
  const gt50 = intervals.filter((d) => d > 50).length
  log(
    `[PHASE_SCROLL frames=${frames} elapsed_ms=${elapsed.toFixed(0)} fps=${((frames / elapsed) * 1000).toFixed(1)} frame_p50_ms=${percentile(intervals, 50).toFixed(1)} frame_p95_ms=${percentile(intervals, 95).toFixed(1)} frame_max_ms=${Math.max(...intervals).toFixed(1)} frames_gt_50ms=${gt50} ${respSuffix}]`
  )
}

// ────────────────────────────────────────────────────────────────
// Phase 4 — progressive tail-mount (C-LARGE-DOC-WAVE-A T-005, R-6).
// Measures the progressive open path end-to-end on a SECOND, isolated
// muya instance while the same-run primary (legacy- or progressive-
// opened) stays the canonical Markdown reference:
//   sync_region_ms   open start → BLOCK_SYNC_REGION_DONE (sync region
//                    mounted: editor visible and input-ready)
//   first_paint_ms   open start → first committed paint of the sync region
//   tti_ms           open start → first real keystroke ACCEPTED, driven
//                    immediately after the sync region landed
//   tail_done_ms     open start → BLOCK_TAIL_MOUNT_DONE (whole document
//                    mounted) — its own budget, never summed with tti
//   typing_during_tail  one real keystroke accepted AND undone while the
//                    tail was still pending (input-ready proof)
//   canon_ok         progressive round-trip getMarkdown() === the primary
//                    instance's getMarkdown() (same-run reference)
//   dom_ok           the secondary's OWN root carries every top-level block
//   primary_intact   the primary's DOM survived the phase unchanged
//
// MULTI-INSTANCE TRAP (T-002 proof, T-005 decision): the legacy
// StateRender root lookup document.querySelector('div#ag-editor-id') is
// DOCUMENT-GLOBAL. T-003 made the progressive primitives instance-scoped
// (renderRegion/extendRegion resolve their own root), but two legacy
// paths still walk the global query: (a) the SECOND instance's empty
// constructor mount (setMarkdown('') → contentState.render) and (b) every
// undo (history.restore → contentState.render — the typing_during_tail
// proof needs one). Constructing the secondary beside a mounted primary
// therefore patches the PRIMARY's root through that global query. The
// primary container is consequently detached (kept in memory) for the
// WHOLE phase: the secondary is then the only editor root in the
// document, every legacy query resolves to it, and the finally restores
// the primary at its exact position. The phase runs LAST so every
// primary-driven phase (typing/scroll) executes single-instance.
// ────────────────────────────────────────────────────────────────
async function phaseTailMount(primary) {
  const primaryContainer = primary.container
  const primaryParent = primaryContainer.parentNode
  const primaryNext = primaryContainer.nextSibling
  const primaryBlocksBefore = topLevelBlockCount(primary)
  primaryContainer.remove()

  let secondary = null
  try {
    const host = document.createElement('div')
    host.id = 'editor-tail-mount'
    document.body.insertBefore(host, document.getElementById('report'))
    const tOpen0 = performance.now()

    const marks = { syncBlocks: null, tailMs: null, tailBlocks: null, served: null }
    const onSync = (payload) => {
      marks.syncBlocks = payload && payload.blocks
    }
    const onTail = (payload) => {
      marks.tailMs = payload && payload.ms
      marks.tailBlocks = payload && payload.blocks
    }
    const onServed = (payload) => {
      marks.served = payload && payload.served
    }

    // Empty bootstrap: with the primary detached this is the ONLY editor
    // root in the document, so the constructor's legacy render falls back
    // to this instance's own container and bootstraps its own root.
    secondary = new Muya(host, {
      markdown: '',
      t: (key) => key
    })
    secondary.on(BLOCK_SYNC_REGION_DONE, onSync)
    secondary.on(BLOCK_TAIL_MOUNT_DONE, onTail)
    secondary.on(BLOCK_MOUNT_SERVED, onServed)

    const open = secondary.progressiveMount(FIXTURE_TEXT)
    // open() returns after BLOCK_SYNC_REGION_DONE fired (synchronously).
    const syncRegionMs = performance.now() - tOpen0
    const tailPendingAtProbe = open.info().status === 'tailing'

    // tti: earliest input-ready moment — right after the sync region.
    const probe = ttiProbe(secondary, tOpen0)

    await nextPaint()
    const firstPaintMs = performance.now() - tOpen0

    // typing_during_tail: undo the probe keystroke while the tail is
    // still pending. Undo runs the full legacy render — exactly why the
    // primary must stay detached for the whole phase.
    const undone = await probe.restore()

    // Tail completion. The scheduler's timer lane guarantees completion
    // under continuous input; the race only guards a wedged engine so the
    // phase fails truthfully instead of hanging the driver.
    await Promise.race([open.done, sleep(60_000)])

    const info = open.info()
    const tailDoneMs = marks.tailMs != null ? marks.tailMs : performance.now() - tOpen0
    const canonOk = secondary.getMarkdown() === primary.getMarkdown()
    const domOk = topLevelBlockCount(secondary) === info.totalBlocks
    // primary_intact: the secondary's operations must not have touched the
    // primary's DOM. The primary's OWN pending progressive tail may have
    // legitimately advanced while detached (instance-scoped mounting), so
    // the expected count is the primary session's current mountedThrough —
    // not the phase-start snapshot. Reads happen in one task; no slice can
    // interleave (scheduler lanes are async).
    const primaryExpected = primaryProgressive && primaryProgressive.info()
      ? primaryProgressive.info().mountedThrough
      : primaryBlocksBefore
    const primaryIntact = topLevelBlockCount(primary) === primaryExpected
    const typingDuringTail = tailPendingAtProbe
      ? probe.accepted && undone
        ? 'ok'
        : 'FAILED'
      : 'no-tail-window'

    log(
      `[PHASE_TAIL_MOUNT sync_region_ms=${syncRegionMs.toFixed(1)} sync_blocks=${marks.syncBlocks ?? info.syncRegionBlocks} total_blocks=${info.totalBlocks} first_paint_ms=${firstPaintMs.toFixed(1)} ${probe.accepted ? `tti_ms=${probe.ttiMs.toFixed(1)}` : 'tti_ms=FAILED'} tail_done_ms=${tailDoneMs.toFixed(1)} served=${info.served ?? 'unknown'} canon_ok=${canonOk} dom_ok=${domOk} typing_during_tail=${typingDuringTail} primary_intact=${primaryIntact} note=isolated-second-instance]`
    )
    if (!probe.accepted) {
      log('[PHASE_TAIL_MOUNT FAILED reason=tti-keystroke-not-accepted]', 'err')
      throw new Error('tail-mount truthfulness: the tti keystroke was not accepted')
    }
    if (typingDuringTail === 'FAILED') {
      log(
        `[PHASE_TAIL_MOUNT FAILED reason=typing-during-tail-not-restored accepted=${probe.accepted} undone=${undone}]`,
        'err'
      )
      throw new Error('tail-mount truthfulness: typing during tail did not restore')
    }
    if (!canonOk || !domOk || !primaryIntact) {
      log(
        `[PHASE_TAIL_MOUNT FAILED reason=evidence canon_ok=${canonOk} dom_ok=${domOk} primary_intact=${primaryIntact}]`,
        'err'
      )
      throw new Error('tail-mount truthfulness: canon/dom/primary check failed')
    }
  } finally {
    if (secondary) {
      try {
        secondary.destroy()
      } catch {
        /* teardown isolation — the phase verdict is already logged */
      }
      const secContainer = secondary.container
      if (secContainer && secContainer.remove) secContainer.remove()
    }
    // Restore the primary at its exact position; skip only if something
    // already re-attached it (never expected on this page).
    if (primaryContainer && !primaryContainer.isConnected && primaryParent) {
      primaryParent.insertBefore(primaryContainer, primaryNext)
    }
  }
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
  log(
    `[HARNESS_OPTS fixture_bytes=${new Blob([FIXTURE_TEXT]).size} phases=${PHASES.join('+')}${PROGRESSIVE ? ' progressive=true' : ''}]`
  )
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
    if (PHASES.includes('overhead')) await phaseOverhead(editor)
    if (PHASES.includes('scroll')) await phaseScroll(editor)
    // C-LARGE-DOC-WAVE-A T-005: tail-mount runs LAST — every phase that
    // uses the primary executes single-instance; the isolated tail-mount
    // measurement then detaches and restores the primary (trap note on
    // phaseTailMount).
    if (PHASES.includes('tail-mount')) await phaseTailMount(editor)
    // A progressive primary must finish its tail before the report ends —
    // REPORT_DONE never overtakes a pending tail (evidence honesty).
    if (primaryProgressive) {
      const info = primaryProgressive.info()
      if (info && (info.status === 'sync' || info.status === 'tailing')) {
        await Promise.race([primaryProgressive.done, sleep(60_000)])
      }
    }
  } catch (err) {
    log(`later phase threw: ${err && err.message}`, 'err')
    log('[REPORT_DONE status=fail]', 'err')
    return
  }
  log('[REPORT_DONE status=ok]')
}

main().catch((err) => log(`harness fatal: ${err && err.message}`, 'err'))
