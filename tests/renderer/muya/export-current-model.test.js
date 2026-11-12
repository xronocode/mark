// FILE: tests/renderer/muya/export-current-model.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Prove both public Muya HTML exports snapshot the current complete model after render-only loads without mutating document state.
//   SCOPE: Real Muya and ExportHtml content, ordinary/render-only imports, asynchronous source capture, unmounted model content, cache/change/history/cursor invariants and fixture teardown.
//   DEPENDS: Muya, ExportHtml through the public export APIs, Vitest and jsdom.
//   LINKS: M-012; V-M-012; C-MUYA-CURRENT-MODEL-EXPORT.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   METHODS - Existing public raw/styled HTML export entry points.
//   PREVIOUS - Distinct previous-document source and marker.
//   SELECTED - Distinct selected-document source and marker.
//   LATER - Distinct later-document source and marker.
//   withEditor - Construct real Muya, await its initial change event and always destroy its owned fixture.
//   exportedText - Parse the actual exported body for content ownership assertions.
//   snapshotState - Capture serializable history/cursor and current/cached Markdown without writing state.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   LAST_CHANGE: 2026-11-12 C-MUYA-CURRENT-MODEL-EXPORT: real-model and output-content regressions for stale cached export input.
// END_CHANGE_SUMMARY

import { afterAll, describe, expect, it, vi } from 'vitest'
import Muya from 'muya/lib'

const METHODS = ['exportStyledHTML', 'exportHtml']
const PREVIOUS = '# Previous document\n\nWRONG-PREVIOUS-BUFFER.\n'
const SELECTED = '# Selected document\n\nRIGHT-SELECTED-BUFFER.\n'
const LATER = '# Later document\n\nLATER-UNRELATED-BUFFER.\n'

async function withEditor(markdown, run) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const muya = new Muya(container, { markdown })
  try {
    // The constructor already scheduled this actual event. Wait for it so
    // later read-only assertions cannot count an unrelated initial notification.
    await new Promise(resolve => muya.once('change', resolve))
    return await run(muya)
  } finally {
    muya.destroy()
    container.remove()
  }
}

async function exportedText(muya, method) {
  const html = await muya[method]({ title: 'Current model', extraCss: '', printOptimization: false })
  return new DOMParser().parseFromString(html, 'text/html').body.textContent
}

function snapshotState(muya) {
  return {
    history: JSON.stringify(muya.getHistory()),
    cursor: JSON.stringify(muya.getCursor()),
    markdown: muya.getMarkdown(),
    cachedMarkdown: muya.markdown
  }
}

afterAll(async () => { await vi.dynamicImportSettled() })

describe.each(METHODS)('%s current-model snapshot', method => {
  it('exports the selected render-only model without refreshing cache or changing document state', async () => {
    await withEditor(PREVIOUS, async muya => {
      muya.setMarkdown(SELECTED, null, false, undefined, undefined, { renderOnly: true })
      expect(muya.getMarkdown()).toBe(SELECTED)
      expect(muya.markdown).toBe(PREVIOUS)
      const before = snapshotState(muya)
      const changed = vi.fn()
      muya.on('change', changed)

      const text = await exportedText(muya, method)
      expect(text).toContain('RIGHT-SELECTED-BUFFER.')
      expect(text).not.toContain('WRONG-PREVIOUS-BUFFER.')
      expect(snapshotState(muya)).toEqual(before)
      expect(changed).not.toHaveBeenCalled()
    })
  })

  it('preserves normal current-document output and read-only state', async () => {
    await withEditor(SELECTED, async muya => {
      const before = snapshotState(muya)
      const changed = vi.fn()
      muya.on('change', changed)
      expect(await exportedText(muya, method)).toContain('RIGHT-SELECTED-BUFFER.')
      expect(snapshotState(muya)).toEqual(before)
      expect(changed).not.toHaveBeenCalled()
    })
  })

  it('keeps the entry snapshot when the model changes during asynchronous conversion', async () => {
    await withEditor(PREVIOUS, async muya => {
      muya.setMarkdown(SELECTED, null, false, undefined, undefined, { renderOnly: true })
      const pending = exportedText(muya, method)
      muya.setMarkdown(LATER, null, false, undefined, undefined, { renderOnly: true })
      const text = await pending
      expect(muya.getMarkdown()).toBe(LATER)
      expect(text).toContain('RIGHT-SELECTED-BUFFER.')
      expect(text).not.toContain('WRONG-PREVIOUS-BUFFER.')
      expect(text).not.toContain('LATER-UNRELATED-BUFFER.')
    })
  })

  it('exports complete model content that is absent from the mounted editor DOM', async () => {
    await withEditor(PREVIOUS, async muya => {
      const complete = `${SELECTED}\nFINAL-MODEL-TAIL.\n`
      muya.setMarkdown(complete, null, false, undefined, undefined, { renderOnly: true })
      const root = muya.container.firstElementChild
      for (const element of Array.from(root.children).slice(1)) element.remove()
      expect(muya.container.textContent).not.toContain('FINAL-MODEL-TAIL.')
      expect(muya.getMarkdown()).toContain('FINAL-MODEL-TAIL.')

      const text = await exportedText(muya, method)
      expect(text).toContain('RIGHT-SELECTED-BUFFER.')
      expect(text).toContain('FINAL-MODEL-TAIL.')
      expect(text).not.toContain('WRONG-PREVIOUS-BUFFER.')
    })
  })
})
