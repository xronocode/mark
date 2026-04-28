// Path-3 diagnostic: baseline harness — same fixture, NO muya.
// Renders FIXTURE_MARKDOWN as plain text in a div. Measures the same
// initial-paint timing window as bench/main.js. Comparison answers:
// "is the 4.5× WebKit/Chromium ratio muya-specific, or general bundle
// parse+layout cost in WebKit?"
//
// If this baseline shows ~1× across engines → muya is the cost driver.
// If this baseline ALSO shows ~3-5× → WebKit general perf is the answer
//   and the dev-plan's 1.5× ratio target was unrealistic for this engine.

import { FIXTURE_MARKDOWN } from '../fixture.js'

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

function nextPaint() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(resolve)
    })
  })
}

async function phaseInitRender() {
  const t0 = performance.now()
  const editor = document.getElementById('editor')
  // Equivalent "render this fixture" workload: paint the markdown source
  // as preformatted text. Same byte count, same DOM size class, none of
  // muya's parsing/layout cost.
  editor.textContent = FIXTURE_MARKDOWN
  await nextPaint()
  const t1 = performance.now()
  log(`[PHASE_INIT_RENDER ms=${(t1 - t0).toFixed(1)}]`)
}

async function main() {
  log(`[HARNESS_BOOT ua=${navigator.userAgent.slice(0, 80)}]`)
  log(`[BASELINE_MODE no_muya=true fixture_bytes=${FIXTURE_MARKDOWN.length}]`)
  try {
    await phaseInitRender()
  } catch (err) {
    log(`init-render failed: ${err && err.message}`, 'err')
    log('[REPORT_DONE status=fail]', 'err')
    return
  }
  log('[REPORT_DONE status=ok]')
}

main().catch((err) => log(`harness fatal: ${err && err.message}`, 'err'))
