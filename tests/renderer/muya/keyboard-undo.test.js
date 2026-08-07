// FILE: tests/renderer/muya/keyboard-undo.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Verify that Muya undo/redo shortcuts reach internal history across keyboard layouts.
//   SCOPE: Cmd/Ctrl+Z and shifted redo dispatch for Latin and non-Latin event keys.
//   DEPENDS: src/muya/lib/eventHandler/keyboard.js, Vitest, jsdom KeyboardEvent.
//   LINKS: docs/verification-plan.xml V-M-012 scenario-10; docs/knowledge-graph.xml M-012.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   createKeyboardHarness - Creates a minimal Muya/event-center harness and captures history calls.
//   dispatchShortcut - Dispatches a cancelable keydown into the Muya container.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - Add the Russian-layout Cmd+Я regression case for physical KeyZ undo routing.
// END_CHANGE_SUMMARY

import { afterEach, describe, expect, it, vi } from 'vitest'
import Keyboard from 'muya/lib/eventHandler/keyboard'

const cleanups = []

afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()()
})

// START_BLOCK_KEYBOARD_UNDO_HARNESS
function createKeyboardHarness() {
  const container = document.createElement('div')
  const listeners = []
  const eventCenter = {
    subscribe: vi.fn(),
    dispatch: vi.fn(),
    attachDOMEvent: vi.fn((target, type, handler) => {
      target.addEventListener(type, handler)
      listeners.push(() => target.removeEventListener(type, handler))
    })
  }
  const contentState = {
    selectedImage: null,
    cursor: {},
    inputHandler: vi.fn()
  }
  const muya = {
    container,
    eventCenter,
    contentState,
    undo: vi.fn(),
    redo: vi.fn()
  }

  new Keyboard(muya)
  cleanups.push(() => listeners.forEach((remove) => remove()))
  return muya
}

function dispatchShortcut(container, init) {
  const event = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    ...init
  })
  container.dispatchEvent(event)
  return event
}
// END_BLOCK_KEYBOARD_UNDO_HARNESS

describe('Muya keyboard undo/redo', () => {
  // START_BLOCK_KEYBOARD_UNDO_ASSERTIONS
  it('undoes Cmd+Я by the physical KeyZ code on a Russian layout', () => {
    const muya = createKeyboardHarness()
    const event = dispatchShortcut(muya.container, {
      key: 'я',
      code: 'KeyZ',
      metaKey: true
    })

    expect(event.defaultPrevented).toBe(true)
    expect(muya.undo).toHaveBeenCalledOnce()
    expect(muya.redo).not.toHaveBeenCalled()
  })

  it('redoes Cmd+Shift+Я by the physical KeyZ code', () => {
    const muya = createKeyboardHarness()
    const event = dispatchShortcut(muya.container, {
      key: 'Я',
      code: 'KeyZ',
      metaKey: true,
      shiftKey: true
    })

    expect(event.defaultPrevented).toBe(true)
    expect(muya.redo).toHaveBeenCalledOnce()
    expect(muya.undo).not.toHaveBeenCalled()
  })

  it('keeps Ctrl+Z undo working for non-macOS hosts', () => {
    const muya = createKeyboardHarness()
    dispatchShortcut(muya.container, {
      key: 'z',
      code: 'KeyZ',
      ctrlKey: true
    })

    expect(muya.undo).toHaveBeenCalledOnce()
  })

  it('does not treat another modified key as undo', () => {
    const muya = createKeyboardHarness()
    dispatchShortcut(muya.container, {
      key: 'x',
      code: 'KeyX',
      metaKey: true
    })

    expect(muya.undo).not.toHaveBeenCalled()
    expect(muya.redo).not.toHaveBeenCalled()
  })
  // END_BLOCK_KEYBOARD_UNDO_ASSERTIONS
})
