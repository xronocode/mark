// FILE: tests/renderer/muya/keyboard-selection.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Protect native vertical selection and selection notifications from passive format-toolbar interception.
//   SCOPE: Shift+Up/Down event cancellation, model/DOM selection preservation, state notifications and active-picker ownership.
//   DEPENDS: Muya Keyboard, jsdom selection, Vitest.
//   LINKS: .grace/graph/runtime.xml M-012; .grace/verification/runtime.xml V-M-012.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   cleanups - Removes DOM listeners and the harness editing host after each case.
//   createHarness - Builds an editing host with a real non-collapsed DOM selection and configurable shown tools.
//   sendKey - Dispatches a cancelable keyboard event to the editor.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - Verify vertical selection bypasses the passive toolbar while autocomplete pickers retain arrow keys.
// END_CHANGE_SUMMARY

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Keyboard from 'muya/lib/eventHandler/keyboard'

const cleanups = []
beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  cleanups.splice(0).reverse().forEach(cleanup => cleanup())
  window.getSelection().removeAllRanges()
  vi.clearAllTimers()
  vi.useRealTimers()
})

// START_BLOCK_VERTICAL_SELECTION_HARNESS
function createHarness(tools = ['ag-format-picker']) {
  const container = document.createElement('div')
  container.contentEditable = 'true'
  container.innerHTML = '<span id="selection-line" class="ag-paragraph">A selected line of text.</span>'
  document.body.appendChild(container)
  cleanups.push(() => container.remove())
  const paragraph = container.firstChild
  const anchor = { key: 'selection-line', offset: 2 }
  const focus = { key: 'selection-line', offset: 8 }
  window.getSelection().setBaseAndExtent(paragraph.firstChild, 2, paragraph.firstChild, 8)
  const eventCenter = {
    subscribe: vi.fn(),
    dispatch: vi.fn(),
    attachDOMEvent(target, type, handler) {
      target.addEventListener(type, handler)
      cleanups.push(() => target.removeEventListener(type, handler))
    }
  }
  const contentState = {
    selectedImage: null,
    cursor: { anchor, focus },
    arrowHandler: vi.fn(),
    docArrowHandler: vi.fn(),
    checkNeedRender: () => false,
    getBlock: () => ({ functionType: 'paragraphContent' }),
    getPositionReference: () => ({}),
    selectionFormats: () => ({ formats: [] })
  }
  const muya = {
    container, eventCenter, contentState,
    dispatchSelectionChange: vi.fn(),
    dispatchSelectionFormats: vi.fn()
  }
  const keyboard = new Keyboard(muya)
  keyboard.shownFloat = Object.fromEntries(tools.map(name => [name, { name }]))
  return { muya, anchor, focus }
}

function sendKey(container, type, key, shiftKey = true) {
  const event = new KeyboardEvent(type, { key, code: key, shiftKey, bubbles: true, cancelable: true })
  container.dispatchEvent(event)
  return event
}
// END_BLOCK_VERTICAL_SELECTION_HARNESS

describe('vertical keyboard selection', () => {
  // START_BLOCK_VERTICAL_SELECTION_ASSERTIONS
  it.each(['ArrowUp', 'ArrowDown'])('%s with Shift stays native while the format toolbar is shown', key => {
    const { muya, anchor, focus } = createHarness()
    const before = window.getSelection().toString()
    expect(sendKey(muya.container, 'keydown', key).defaultPrevented).toBe(false)
    expect(window.getSelection().toString()).toBe(before)
    expect(muya.contentState.cursor).toEqual({ anchor, focus })
  })

  it.each(['ArrowUp', 'ArrowDown'])('%s selection still notifies the host while the toolbar is shown', key => {
    const { muya, anchor, focus } = createHarness()
    sendKey(muya.container, 'keyup', key)
    vi.runOnlyPendingTimers()
    expect(muya.dispatchSelectionChange).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ anchor, focus }))
    expect(muya.dispatchSelectionFormats).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ anchor, focus }))
    expect(window.getSelection().toString()).toBe('select')
  })

  it.each(['ag-quick-insert', 'ag-emoji-picker', 'ag-link-path-picker'])('%s retains ownership of vertical keys', name => {
    const { muya } = createHarness(['ag-format-picker', name])
    expect(sendKey(muya.container, 'keydown', 'ArrowDown').defaultPrevented).toBe(true)
    sendKey(muya.container, 'keyup', 'ArrowDown')
    vi.runOnlyPendingTimers()
    expect(muya.dispatchSelectionChange).not.toHaveBeenCalled()
  })

  it('keeps existing unmodified toolbar navigation unchanged', () => {
    const { muya } = createHarness()
    expect(sendKey(muya.container, 'keydown', 'ArrowDown', false).defaultPrevented).toBe(true)
  })
  // END_BLOCK_VERTICAL_SELECTION_ASSERTIONS
})
