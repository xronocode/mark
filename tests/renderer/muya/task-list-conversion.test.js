// FILE: tests/renderer/muya/task-list-conversion.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin updateTaskListItem's delivered block-tree outcome — every sibling survives every conversion branch and the mixed list keeps today's sibling-list split shape (C-MUYA-MODEL-SURGERY meaningful-proof guards, green on the pre-change tree), plus the structural pin that the conversion constructs no transient surgery (no discarded block, no remove-and-reinsert walk).
//   SCOPE: ContentState.prototype.updateTaskListItem on a real jsdom Muya: mid/first/last/only-child conversions and the createBlock/removeBlock structural observation.
//   DEPENDS: src/muya/lib (Muya, ContentState), Vitest, jsdom.
//   LINKS: .grace/graph/runtime.xml M-012; .grace/verification/runtime.xml V-M-012; src/muya/lib/contentState/updateCtrl.js.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   LIST - the five-item bullet list fixture shared by the conversion pins.
//   mounted - teardown registry of the real jsdom Muya instances.
//   mountMuya - mounts a real jsdom Muya registered for afterEach teardown.
//   convertLi - drives updateTaskListItem on the n-th bullet li the way checkInlineUpdate would after typing the task marker.
//   treeKeys - collects every block key of the delivered tree.
//   recordCreateBlock - spies ContentState.prototype.createBlock, recording constructed blocks.
// END_MODULE_MAP

import { afterEach, describe, expect, it, vi } from 'vitest'
import Muya from 'muya/lib'
import ContentState from 'muya/lib/contentState'

const LIST = '- one\n- two\n- three\n- four\n- five\n'
const mounted = []

function mountMuya (markdown) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const muya = new Muya(container, { markdown })
  mounted.push(muya)
  return muya
}

// Place the caret at the end of the li's paragraph text, prepend the task
// marker and run the conversion exactly as checkInlineUpdate would.
function convertLi (muya, index, marker = '[ ] ') {
  const state = muya.contentState
  const li = state.blocks[0].children[index]
  const p = li.children.find((b) => b.type === 'p')
  p.children[0].text = `${marker}${p.children[0].text}`
  const spanKey = p.children[0].key
  state.cursor = {
    start: { key: spanKey, offset: p.children[0].text.length },
    end: { key: spanKey, offset: p.children[0].text.length },
    isEdit: true
  }
  return state.updateTaskListItem(p, 'tasklist', marker)
}

function treeKeys (blocks, acc = new Set()) {
  for (const block of blocks) {
    acc.add(block.key)
    treeKeys(block.children, acc)
  }
  return acc
}

function recordCreateBlock () {
  const original = ContentState.prototype.createBlock
  const created = []
  const spy = vi.spyOn(ContentState.prototype, 'createBlock').mockImplementation(function (...args) {
    const block = original.apply(this, args)
    created.push(block)
    return block
  })
  return { created, stop: () => spy.mockRestore() }
}

afterEach(() => {
  for (const muya of mounted.splice(0)) {
    clearTimeout(muya.contentState.historyTimer)
    muya.contentState.clear()
    muya.eventCenter.detachAllDomEvents()
    muya.container.remove()
  }
  vi.restoreAllMocks()
})

describe('updateTaskListItem conversion — sibling preservation (meaningful-proof guards)', () => {
  it('mid_list_conversion_preserves_all_five_siblings_in_order', () => {
    const muya = mountMuya(LIST)
    convertLi(muya, 1)
    expect(muya.getMarkdown()).toBe('- one\n\n- [ ] two\n\n- three\n- four\n- five\n')
  })

  it('first_child_conversion_preserves_its_siblings', () => {
    const muya = mountMuya(LIST)
    convertLi(muya, 0)
    expect(muya.getMarkdown()).toBe('- [ ] one\n\n- two\n- three\n- four\n- five\n')
  })

  it('last_child_conversion_preserves_its_siblings', () => {
    const muya = mountMuya(LIST)
    convertLi(muya, 4)
    expect(muya.getMarkdown()).toBe('- one\n- two\n- three\n- four\n\n- [ ] five\n')
  })

  it('only_child_conversion_keeps_the_delivered_list_shape', () => {
    const muya = mountMuya('- solo\n')
    convertLi(muya, 0)
    expect(muya.getMarkdown()).toBe('- [ ] solo\n')
  })
})

describe('updateTaskListItem conversion — structural no-transient-surgery pin', () => {
  it('conversion_constructs_no_transient_list_wrapper', () => {
    const cases = [
      { name: 'mid-list', markdown: LIST, index: 1, assertNoUl: false },
      { name: 'first-child', markdown: LIST, index: 0, assertNoUl: false },
      { name: 'last-child', markdown: LIST, index: 4, assertNoUl: false },
      { name: 'only-child', markdown: '- solo\n', index: 0, assertNoUl: true }
    ]
    for (const { name, markdown, index, assertNoUl } of cases) {
      const muya = mountMuya(markdown)
      const state = muya.contentState
      const { created, stop } = recordCreateBlock()
      const removeSpy = vi.spyOn(ContentState.prototype, 'removeBlock')
      try {
        convertLi(muya, index)
        // No already-placed block is removed and re-inserted to assemble a
        // wrapper — each list's final children are assembled in one pass.
        expect(removeSpy, name).not.toHaveBeenCalled()
        // Every constructed block lands in the delivered tree — zero
        // constructed-then-discarded blocks.
        const keys = treeKeys(state.blocks)
        for (const block of created) {
          expect(keys.has(block.key), `${name}: constructed ${block.type} was discarded`).toBe(true)
        }
        if (assertNoUl) {
          expect(created.filter((b) => b.type === 'ul'), name).toHaveLength(0)
        }
      } finally {
        stop()
        removeSpy.mockRestore()
      }
    }
  })
})
