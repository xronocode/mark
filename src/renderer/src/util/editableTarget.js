// FILE: src/renderer/src/util/editableTarget.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Tell whether a key event target is a text control (input, textarea, select, contenteditable) so a global paste handler leaves native paste alone.
//   SCOPE: isEditableTarget — pure, no imports (safe in the boot chunk; C-52 orchestrator fix: importing it from clipboardPath pulled ipc/runtime, which reads window.electron at import time, before the shim installs it).
//   DEPENDS: none.
//   LINKS: .grace/changes/archive/C-52; util/clipboardPath.js (re-export); components/recent/index.vue.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   isEditableTarget - true for input/textarea/select and contenteditable (attribute "", "true", "plaintext-only" or the property).
// END_MODULE_MAP

// START_BLOCK_IS_EDITABLE_TARGET
export const isEditableTarget = (el) => {
  if (!el || typeof el !== 'object') return false
  const tag = typeof el.tagName === 'string' ? el.tagName.toLowerCase() : ''
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true
  if (el.isContentEditable === true) return true
  if (typeof el.getAttribute === 'function') {
    const attr = el.getAttribute('contenteditable')
    // contenteditable="" (empty string) means TRUE per the HTML spec
    if (attr === '' || attr === 'true' || attr === 'plaintext-only') return true
  }
  const state = typeof el.contentEditable === 'string' ? el.contentEditable : ''
  return state === 'true' || state === 'plaintext-only'
}
// END_BLOCK_IS_EDITABLE_TARGET
