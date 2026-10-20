// FILE: tests/renderer/components/unsaved-close-dialog.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin the FIX-011 three-action unsaved-changes dialog: exactly three visible labeled actions with distinct results (Save & Close / Discard / Cancel), default focus on Save & Close with destructive/default styling separated, and Cancel semantics for Escape, the close glyph and a backdrop click.
//   SCOPE: askUnsavedClose and UNSAVED_CLOSE_ACTIONS in src/renderer/src/components/editorWithTabs/unsavedCloseDialog.js, in jsdom with real DOM events.
//   DEPENDS: src/renderer/src/components/editorWithTabs/unsavedCloseDialog, Vitest + jsdom.
//   LINKS: .grace/changes/active/C-FIX-011-UNTITLED-CLOSE-ACTIONS; .grace/verification/runtime.xml V-M-011; docs/release-trains/2.5.x-next.md#fix-011; src/renderer/src/store/editor.js CLOSE_UNSAVED_TAB.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   openDialog - opens askUnsavedClose and returns { promise, overlay } before resolution.
//   buttons - the three action buttons of the live dialog, in display order.
//   labels - reads the three button labels plus their order from the live dialog.
//   pressKey - dispatches a bubbling cancelable keydown on the dialog box.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-20 FIX-011: new spec — three visible
//   labels, three distinct results, default styling/focus, and the
//   Cancel-equivalence of Escape, the close glyph and the backdrop.
// END_CHANGE_SUMMARY

import { describe, expect, it, afterEach } from 'vitest'
import { askUnsavedClose, UNSAVED_CLOSE_ACTIONS } from '@/components/editorWithTabs/unsavedCloseDialog'

const openDialog = async (opts = { filename: 'Untitled-1', named: false }) => {
  let resolveCapture
  const promise = new Promise((r) => { resolveCapture = r })
  const asked = askUnsavedClose(opts)
  asked.then(resolveCapture)
  const overlay = document.querySelector('.ag-unsaved-close-overlay')
  expect(overlay).toBeTruthy()
  return { asked, overlay, settled: promise }
}

const buttons = (overlay) => Array.from(overlay.querySelectorAll('.ag-unsaved-close-btn'))
const labels = (overlay) => buttons(overlay).map(b => b.textContent)

const pressKey = (overlay, key, shiftKey = false) => {
  const box = overlay.querySelector('.ag-unsaved-close-dialog')
  box.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, shiftKey }))
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('unsavedCloseDialog (FIX-011 three-action model)', () => {
  it('shows exactly three visible actions with the expected labels and order', async () => {
    const { overlay } = await openDialog()
    expect(labels(overlay)).toEqual(['Discard', 'Cancel', 'Save & Close'])
  })

  it('focuses Save & Close by default and styles default and destructive actions apart', async () => {
    const { overlay } = await openDialog()
    const [discard, cancel, save] = buttons(overlay)
    expect(document.activeElement).toBe(save)
    expect(discard.classList.contains('ag-unsaved-close-discard')).toBe(true)
    expect(save.classList.contains('ag-unsaved-close-save')).toBe(true)
    expect(discard.classList.contains('ag-unsaved-close-save')).toBe(false)
    expect(cancel.classList.contains('ag-unsaved-close-save')).toBe(false)
  })

  it('resolves the three distinct results and cleans up', async () => {
    const a = await openDialog()
    buttons(a.overlay)[2].click()
    await expect(a.asked).resolves.toBe(UNSAVED_CLOSE_ACTIONS.SAVE)
    expect(document.querySelector('.ag-unsaved-close-overlay')).toBeNull()

    const b = await openDialog()
    buttons(b.overlay)[0].click()
    await expect(b.asked).resolves.toBe(UNSAVED_CLOSE_ACTIONS.DISCARD)
    expect(document.querySelector('.ag-unsaved-close-overlay')).toBeNull()

    const c = await openDialog()
    buttons(c.overlay)[1].click()
    await expect(c.asked).resolves.toBe(UNSAVED_CLOSE_ACTIONS.CANCEL)
    expect(document.querySelector('.ag-unsaved-close-overlay')).toBeNull()
  })

  it('Escape resolves Cancel', async () => {
    const { overlay, asked } = await openDialog()
    pressKey(overlay, 'Escape')
    await expect(asked).resolves.toBe(UNSAVED_CLOSE_ACTIONS.CANCEL)
  })

  it('the close glyph resolves Cancel and keeps its accessible name', async () => {
    const { overlay, asked } = await openDialog()
    const x = overlay.querySelector('.ag-unsaved-close-x')
    expect(x.getAttribute('aria-label')).toBe('Cancel')
    x.click()
    await expect(asked).resolves.toBe(UNSAVED_CLOSE_ACTIONS.CANCEL)
  })

  it('a backdrop click resolves Cancel; a click inside the box and Tab stay contained', async () => {
    const { overlay, asked } = await openDialog()
    // A mousedown inside the box is NOT a dismissal.
    const inside = overlay.querySelector('.ag-unsaved-close-dialog')
    inside.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    expect(document.querySelector('.ag-unsaved-close-overlay')).toBeTruthy()

    pressKey(overlay, 'Tab')
    const focusables = Array.from(overlay.querySelectorAll('button'))
    expect(focusables).toContain(document.activeElement)
    pressKey(overlay, 'Tab', true)
    expect(focusables).toContain(document.activeElement)

    // A mousedown on the backdrop itself cancels.
    overlay.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    await expect(asked).resolves.toBe(UNSAVED_CLOSE_ACTIONS.CANCEL)
  })

  it('the untitled message announces Save As; the named message asks to save', async () => {
    const untitled = await openDialog({ filename: 'Untitled-1', named: false })
    const untitledText = untitled.overlay.querySelector('.ag-unsaved-close-message').textContent
    expect(untitledText).toContain('unsaved and untitled')
    expect(untitledText).toContain('Save & Close will ask where to save it')
    pressKey(untitled.overlay, 'Escape')

    const named = await openDialog({ filename: 'notes.md', named: true })
    const namedText = named.overlay.querySelector('.ag-unsaved-close-message').textContent
    expect(namedText).toContain('notes.md')
    expect(namedText).toContain('Save before closing the tab?')
    pressKey(named.overlay, 'Escape')

    await expect(untitled.asked).resolves.toBe(UNSAVED_CLOSE_ACTIONS.CANCEL)
    await expect(named.asked).resolves.toBe(UNSAVED_CLOSE_ACTIONS.CANCEL)
  })
})
