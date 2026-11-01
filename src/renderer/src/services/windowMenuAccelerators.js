//
// FILE: src/renderer/src/services/windowMenuAccelerators.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: C-WINDOWS-MENU-ACCELERATORS — rescue the app-level menu
//            accelerators on Windows/Linux, where the C-15 T-W1 hidden
//            menu bar (hide_menu in main.rs setup) leaves the accelerator
//            table unregistered: one window-level capture keydown
//            dispatcher maps the audited chord table to the SAME static
//            command registry ids the native menu dispatches.
//   SCOPE: The frozen chord table (22 entries), event→accelerator
//          normalization on physical event.code, IMe-composition and
//          auto-repeat guards, the Ctrl+A input-surface carve-out,
//          dispatch through menu-bridge's findCommandInRegistry wrapper,
//          and the runtime platform gate (inactive on darwin; the e2e
//          seam window.__FORCE_WINDOW_ACCELERATORS === true overrides).
//          Owns no commands, no stores, no Rust surface; chords already
//          alive in the renderer (zoom trio, Ctrl+\ sidebar, palette)
//          stay with their owners and are absent from the table.
//   DEPENDS: menu-bridge (findCommandInRegistry), the static command registry
//            shape it walks.
//   LINKS: .grace/graph/runtime.xml M-070; .grace/verification/runtime.xml
//          V-M-070; .grace/changes/active/C-WINDOWS-MENU-ACCELERATORS
//          spec.xml Goals 1-2.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   WINDOW_MENU_ACCELERATORS - frozen chord table (accelerator → commandId).
//   normalizeChord - canonical modifier order Ctrl+Alt+Shift then key.
//   matchAccelerator - KeyboardEvent → table entry or null (guards and the
//                      Ctrl+A input-surface carve-out inside).
//   resolveEnabled - runtime platform gate (darwin → off; test seam honored).
//   installWindowMenuAccelerators - window capture listener + disposer.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-11-01 C-WINDOWS-MENU-ACCELERATORS: initial
//   rescue table + dispatcher (22 chords, guards, Ctrl+A carve-out,
//   e2e seam; polygon root cause: hidden menu bar = dead accelerators).
// END_CHANGE_SUMMARY

import { findCommandInRegistry } from '../menu-bridge'

// The audited rescue table — exactly the win/linux-relevant m009 menu
// accelerators that no renderer binding serves today. Normalized chord
// form: Ctrl(+Alt)(+Shift)+Key with physical key names.
export const WINDOW_MENU_ACCELERATORS = Object.freeze(
  Object.entries({
    'Ctrl+N': 'file.new-tab',
    'Ctrl+O': 'file.open-file',
    'Ctrl+Shift+O': 'file.add-folder',
    'Ctrl+Alt+V': 'file.open-from-clipboard',
    'Ctrl+S': 'file.save',
    'Ctrl+Shift+S': 'file.save-as',
    'Ctrl+W': 'file.close-tab',
    'Ctrl+Shift+T': 'file.reopen-closed-tab',
    'Ctrl+P': 'file.print',
    'Ctrl+A': 'edit.select-all',
    'Ctrl+F': 'edit.find',
    'Ctrl+G': 'edit.find-next',
    'Ctrl+Shift+G': 'edit.find-previous',
    'Ctrl+H': 'edit.replace',
    'Ctrl+Shift+F': 'edit.find-in-folder',
    'Ctrl+B': 'view.toggle-sidebar',
    'Ctrl+Alt+S': 'view.source-code-mode',
    'Ctrl+Alt+Backslash': 'view.split-view',
    'Ctrl+D': 'view.diff-mode',
    'Ctrl+Tab': 'tabs.cycleForward',
    'Ctrl+Shift+Tab': 'tabs.cycleBackward',
    'Ctrl+M': 'window.minimize'
  }).map(([accelerator, commandId]) => Object.freeze({ accelerator, commandId }))
)

const TABLE_BY_CHORD = new Map(WINDOW_MENU_ACCELERATORS.map((e) => [e.accelerator, e]))

// Chords the browser already handles correctly when focus is in a plain
// input surface outside the editor (search fields, dialogs): hijacking
// them there would be a regression, not menu parity.
const INPUT_DEFAULT_CHORDS = new Set(['Ctrl+A'])

const isInputSurface = (target) =>
  !!(target && target.closest && target.closest('input, textarea, select'))

const isEditorSurface = (target) =>
  !!(target && target.closest && target.closest('.editor-component, #ag-editor-id'))

// event.code → chord key. Physical codes keep the chords working on
// non-Latin layouts (house rule from the paragraph shortcut wave).
const keyFromCode = (code) => {
  if (!code) return ''
  if (code.startsWith('Key') && code.length === 4) return code.slice(3)
  if (code.startsWith('Digit') && code.length === 6) return code.slice(5)
  if (code === 'Backslash') return 'Backslash'
  if (code === 'Tab') return 'Tab'
  return ''
}

export const normalizeChord = ({ ctrl, alt, shift, key }) => {
  const parts = []
  if (ctrl) parts.push('Ctrl')
  if (alt) parts.push('Alt')
  if (shift) parts.push('Shift')
  if (!key) return ''
  parts.push(key)
  return parts.join('+')
}

export const matchAccelerator = (event) => {
  if (!event || event.isComposing || event.repeat) return null
  const key = keyFromCode(event.code)
  if (!key) return null
  const chord = normalizeChord({
    ctrl: event.ctrlKey && !event.metaKey,
    alt: event.altKey,
    shift: event.shiftKey,
    key
  })
  const entry = TABLE_BY_CHORD.get(chord) || null
  if (!entry) return null
  if (INPUT_DEFAULT_CHORDS.has(chord) && isInputSurface(event.target) && !isEditorSurface(event.target)) {
    return null
  }
  return entry
}

// darwin keeps its visible native menu — the dispatcher must stay off
// there so chords never double-fire. The runtime platform is read at
// install time (unit tests mutate window.electron.process.platform
// per-case); the explicit force flag is the e2e seam for darwin builds.
export const resolveEnabled = () => {
  if (typeof window !== 'undefined' && window.__FORCE_WINDOW_ACCELERATORS === true) return true
  const platform =
    (typeof window !== 'undefined' && window.electron && window.electron.process && window.electron.process.platform) || ''
  return !!platform && platform !== 'darwin'
}

const handleAcceleratorKeydown = (event) => {
  const entry = matchAccelerator(event)
  if (!entry) return
  event.preventDefault()
  const result = findCommandInRegistry && findCommandInRegistry(entry.commandId)
  if (!result) {
    console.warn(`[WindowAccelerators] no command for chord ${entry.accelerator} (${entry.commandId})`)
    return
  }
  const { command, parent } = result
  try {
    if (typeof command.execute === 'function') {
      void command.execute()
    } else if (parent && typeof parent.executeSubcommand === 'function' && command.value !== undefined) {
      void parent.executeSubcommand(null, command.value)
    } else {
      console.warn(`[WindowAccelerators] command ${entry.commandId} has no execute()`)
      return
    }
    console.debug(`[WindowAccelerators][BLOCK_ACCELERATOR_FIRED chord=${entry.accelerator} cmd=${entry.commandId}]`)
  } catch (e) {
    console.error(`[WindowAccelerators] command ${entry.commandId} failed:`, e)
  }
}

export const installWindowMenuAccelerators = () => {
  if (!resolveEnabled()) return () => {}
  window.addEventListener('keydown', handleAcceleratorKeydown, true)
  return () => window.removeEventListener('keydown', handleAcceleratorKeydown, true)
}
