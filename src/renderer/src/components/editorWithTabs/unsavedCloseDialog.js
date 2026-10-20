// FILE: src/renderer/src/components/editorWithTabs/unsavedCloseDialog.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: FIX-011 — the three-action unsaved-changes confirmation for closing a tab: default Save & Close, a separate non-default Discard, and a visible Cancel (Escape and the close glyph are Cancel), replacing the two-discard ElMessageBox that had no visible cancel.
//   SCOPE: One imperative promise-based dialog (askUnsavedClose) teleported to document.body: overlay + themed box, role=dialog with aria-modal and labelled title, three buttons in the macOS order (Discard, Cancel, Save & Close — default focus on Save & Close), a Tab focus trap, and the finish-once resolution 'save' | 'discard' | 'cancel'. No store or transport logic lives here.
//   DEPENDS: DOM APIs only (createElement/getComputedStyle/focus); theme via the float CSS variables consumed in unsavedCloseDialog.css; the editor store action CLOSE_UNSAVED_TAB owns the save/discard transports.
//   LINKS: .grace/changes/active/C-FIX-011-UNTITLED-CLOSE-ACTIONS; .grace/graph/runtime.xml M-011; .grace/verification/runtime.xml V-M-011; src/renderer/src/store/editor.js CLOSE_UNSAVED_TAB; assets/styles/index.css FIX-007 float-token dialog theming (this module reuses the same tokens); tests/renderer/components/unsaved-close-dialog.test.js; tests/e2e/unsaved-close-actions.spec.ts.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   UNSAVED_CLOSE_ACTIONS - frozen result vocabulary { SAVE, DISCARD, CANCEL }.
//   askUnsavedClose - imperative dialog: ({ filename, named }) => Promise<'save'|'discard'|'cancel'>; resolves exactly once and always cleans up its DOM and listeners.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-20 FIX-011 (C-FIX-011-UNTITLED-CLOSE-ACTIONS):
//   new module. The dirty-tab close confirm now exposes the owner-approved
//   action model — default Save & Close (for an untitled tab it leads into
//   Save As and the tab closes only after the write succeeds), a separate
//   non-default destructive Discard, and a visible Cancel whose result
//   Escape and the close glyph share. Element Plus MessageBox cannot show
//   three buttons, so this is a plain DOM dialog reusing the FIX-007 float
//   tokens for light/dark parity.
// END_CHANGE_SUMMARY

import './unsavedCloseDialog.css'

export const UNSAVED_CLOSE_ACTIONS = Object.freeze({
  SAVE: 'save',
  DISCARD: 'discard',
  CANCEL: 'cancel'
})

// START_BLOCK_UNSAVED_CLOSE_DIALOG
// The dialog is built imperatively (the ElMessageBox pattern) so the Pinia
// store action can await it from anywhere. Every exit path funnels through
// finish(), which is idempotent: Escape, the close glyph and a backdrop
// click resolve CANCEL — the nondestructive default for an ambiguous
// dismissal — never discard.
export const askUnsavedClose = ({ filename = '', named = false } = {}) => new Promise((resolve) => {
  const overlay = document.createElement('div')
  overlay.className = 'ag-unsaved-close-overlay'

  const box = document.createElement('div')
  box.className = 'ag-unsaved-close-dialog'
  box.setAttribute('role', 'dialog')
  box.setAttribute('aria-modal', 'true')
  box.setAttribute('aria-labelledby', 'ag-unsaved-close-title')

  const header = document.createElement('div')
  header.className = 'ag-unsaved-close-header'
  const title = document.createElement('span')
  title.id = 'ag-unsaved-close-title'
  title.className = 'ag-unsaved-close-title'
  title.textContent = 'Unsaved changes'
  const closeBtn = document.createElement('button')
  closeBtn.type = 'button'
  closeBtn.className = 'ag-unsaved-close-x'
  closeBtn.setAttribute('aria-label', 'Cancel')
  closeBtn.textContent = '✕'
  header.appendChild(title)
  header.appendChild(closeBtn)

  const message = document.createElement('div')
  message.className = 'ag-unsaved-close-message'
  message.textContent = named
    ? `"${filename}" has unsaved changes. Save before closing the tab?`
    : `"${filename}" is unsaved and untitled — Save & Close will ask where to save it.`

  const actions = document.createElement('div')
  actions.className = 'ag-unsaved-close-actions'
  const makeButton = (className, label) => {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = className
    btn.textContent = label
    return btn
  }
  // macOS order: destructive leftmost, plain Cancel, default rightmost —
  // the destructive action never sits next to the default, and nothing is
  // labelled "Close".
  const discardBtn = makeButton('ag-unsaved-close-btn ag-unsaved-close-discard', 'Discard')
  const cancelBtn = makeButton('ag-unsaved-close-btn ag-unsaved-close-cancel', 'Cancel')
  const saveBtn = makeButton('ag-unsaved-close-btn ag-unsaved-close-save', 'Save & Close')
  actions.appendChild(discardBtn)
  actions.appendChild(cancelBtn)
  actions.appendChild(saveBtn)

  box.appendChild(header)
  box.appendChild(message)
  box.appendChild(actions)
  overlay.appendChild(box)
  document.body.appendChild(overlay)

  let finished = false
  const focusables = [discardBtn, cancelBtn, saveBtn, closeBtn]
  const finish = (action) => {
    if (finished) return
    finished = true
    box.removeEventListener('keydown', onKeydown)
    overlay.removeEventListener('mousedown', onBackdrop)
    overlay.remove()
    resolve(action)
  }
  const onKeydown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      finish(UNSAVED_CLOSE_ACTIONS.CANCEL)
      return
    }
    if (event.key === 'Tab') {
      // Keep focus inside the dialog while it is open.
      event.preventDefault()
      const index = focusables.indexOf(document.activeElement)
      const next = event.shiftKey
        ? focusables[(index - 1 + focusables.length) % focusables.length]
        : focusables[(index + 1) % focusables.length]
      next.focus()
    }
  }
  const onBackdrop = (event) => {
    if (event.target === overlay) finish(UNSAVED_CLOSE_ACTIONS.CANCEL)
  }

  discardBtn.addEventListener('click', () => finish(UNSAVED_CLOSE_ACTIONS.DISCARD))
  cancelBtn.addEventListener('click', () => finish(UNSAVED_CLOSE_ACTIONS.CANCEL))
  saveBtn.addEventListener('click', () => finish(UNSAVED_CLOSE_ACTIONS.SAVE))
  closeBtn.addEventListener('click', () => finish(UNSAVED_CLOSE_ACTIONS.CANCEL))
  box.addEventListener('keydown', onKeydown)
  overlay.addEventListener('mousedown', onBackdrop)

  // The default action is focused, so Enter saves; nothing defaults to a
  // discard path.
  saveBtn.focus()
  console.debug('[UnsavedCloseDialog][askUnsavedClose][BLOCK_UNSAVED_CLOSE_DIALOG_OPEN]')
})
// END_BLOCK_UNSAVED_CLOSE_DIALOG
