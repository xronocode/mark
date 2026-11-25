// FILE: tests/renderer/muya/table-publish-stage.test.js
// START_MODULE_CONTRACT
//   PURPOSE: Pin the normalized publish stage of the muya table mutation flow — the table toolbar actions (align, delete — the insert-row/column picker path shares the method) publish their content change AFTER the DOM re-render, the same single stage every other muya mutation flow uses (editTable, createTable, image/link/paste/undo handlers). The complexity f-006 divergence published before the render, so the 'change' listeners saw the stale DOM: a store-side publish that triggers an export rasterized the old table surface.
//   SCOPE: src/muya/lib/contentState/tableBlockCtrl.js tableToolBarClick completion points (publish/render ordering) via a real Muya in jsdom.
//   DEPENDS: Muya (real instance), Vitest + jsdom.
//   LINKS: complexity f-006 (2026-11-25 audit, «Вставка публикует изменение на разных этапах в зависимости от контекста»); src/muya/lib/contentState/tableBlockCtrl.js tableToolBarClick vs editTable/createTable.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   TABLE_MD - the two-column table document every case mounts.
//   CLEANUP - teardown callbacks run after each test.
//   mountMuya - real Muya instance over a table document in jsdom.
//   setCursorInHeaderCell - parks the contentState cursor inside the first header cell, as a user click would.
// END_MODULE_MAP

import { describe, expect, it, afterEach } from 'vitest'

const TABLE_MD = '| A | B |\n| --- | --- |\n| 1 | 2 |\n'

const CLEANUP = []
afterEach(() => {
  while (CLEANUP.length) CLEANUP.pop()()
})

// Real Muya over a table document. The instance is NOT destroyed (destroy
// expects the UI plugins the app registers); removing its container from
// the DOM is enough for the test.
const mountMuya = async () => {
  const { default: Muya } = await import('muya/lib')
  const el = document.createElement('div')
  document.body.appendChild(el)
  const muya = new Muya(el, { markdown: TABLE_MD })
  CLEANUP.push(() => muya.container.remove())
  return muya
}

const setCursorInHeaderCell = (muya) => {
  const state = muya.contentState
  const findFigure = (blocks) => {
    for (const block of blocks) {
      if (block.type === 'figure') return block
      if (block.children.length) {
        const found = findFigure(block.children)
        if (found) return found
      }
    }
    return null
  }
  const figure = findFigure(state.getBlocks())
  expect(figure).toBeTruthy()
  // The block tree keeps children as block objects (parent/preSibling are keys).
  const headRow = figure.children[0].children[0].children[0]
  const cell = state.firstInDescendant(headRow)
  state.cursor = {
    start: { key: cell.key, offset: 0 },
    end: { key: cell.key, offset: 0 },
    isEdit: true
  }
  return cell
}

describe('muya table mutations publish after the render (complexity f-006)', () => {
  it('align action: the published change already carries the re-rendered cell styles', async () => {
    const muya = await mountMuya()
    setCursorInHeaderCell(muya)

    let stylesAtPublish = null
    muya.on('change', () => {
      const table = muya.container.querySelector('table.ag-paragraph')
      stylesAtPublish = table
        ? [...table.querySelectorAll('thead th')].map((th) => th.getAttribute('style'))
        : null
    })

    muya.contentState.tableToolBarClick('left')

    // The publish (this 'change' event) must describe the post-render DOM:
    // the first column carries the align style by the time listeners run.
    expect(stylesAtPublish).toEqual(['text-align:left', null])
  })

  it('delete action: the published change already describes the paragraph that replaced the table', async () => {
    const muya = await mountMuya()
    setCursorInHeaderCell(muya)

    let surfaceAtPublish = null
    muya.on('change', () => {
      surfaceAtPublish = {
        table: !!muya.container.querySelector('table.ag-paragraph'),
        paragraph: !!muya.container.querySelector('p.ag-paragraph')
      }
    })

    muya.contentState.tableToolBarClick('delete')

    // Post-render publish: the table surface is gone from the DOM before
    // any 'change' listener sees the mutated model.
    expect(surfaceAtPublish).toEqual({ table: false, paragraph: true })
    // The model side is unchanged by the normalization.
    expect(muya.getMarkdown()).toBe('\n')
  })
})
