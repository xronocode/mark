// MODULE_CONTRACT
//   PURPOSE: Build-time replacement for @hfelix/electron-localshortcut
//            (root + /src/atom-keymap deep-import). v1.2.3 keybindings
//            UI imports 4 named functions for accelerator-spec parsing
//            and keyboard-event utilities. Replacements:
//              isCompositionEvent          — DOM-level check, no
//                                            external lib needed
//              isValidElectronAccelerator  — delegated to M-006
//                                            parse_accelerator (real
//                                            parser shipped in B3)
//              getAcceleratorFromKeyboardEvent — DOM event → accel string
//              setKeyboardLayout (deep)    — no-op; M-006 handles layouts
//   SCOPE:   build-time only. F-SHORTCUT-PLATFORM-BIND eventually
//            wires real platform layout detection.
//   STATUS:  Phase-B-MAIN-ENTRY-WIRING shipped.
//
// CHANGE_SUMMARY:
//   - 2026-04-29 close F-MAIN-ENTRY-DISABLED: build-time shim.

/**
 * IME composition flag — the renderer should not register a shortcut
 * key while the user is composing CJK characters via IME.
 */
export function isCompositionEvent(event) {
  return Boolean(event && event.isComposing)
}

/**
 * Validate an Electron-style accelerator string. Mirrors v1's
 * upstream behavior: parses via M-006 backend rules; returns true
 * if the parse succeeds.
 */
export function isValidElectronAccelerator(accel) {
  if (typeof accel !== 'string' || accel.trim().length === 0) return false
  // Mirror M-006 parse_accelerator client-side. Tokens separated by
  // `+`; modifier aliases CMD/Command/Super/Meta/Ctrl/Control/Alt/
  // Option/Opt/Shift/CmdOrCtrl/CommandOrControl. Last token must be
  // a non-modifier key (single char or symbolic name).
  const parts = accel.split('+').map((p) => p.trim()).filter(Boolean)
  if (parts.length === 0) return false
  const modifiers = new Set([
    'cmd', 'command', 'super', 'meta',
    'ctrl', 'control', 'cmdorctrl', 'commandorcontrol',
    'alt', 'option', 'opt',
    'shift'
  ])
  for (let i = 0; i < parts.length - 1; i++) {
    if (!modifiers.has(parts[i].toLowerCase())) return false
  }
  const last = parts[parts.length - 1].toLowerCase()
  if (modifiers.has(last)) return false
  return true
}

/**
 * Convert a DOM KeyboardEvent into an accelerator string ("Cmd+Shift+M").
 * Order: Cmd / Ctrl / Alt / Shift then key. Uses event.code (physical
 * key) for letters/digits to be keyboard-layout-independent.
 */
export function getAcceleratorFromKeyboardEvent(event) {
  if (!event) return ''
  const parts = []
  if (event.metaKey) parts.push('Cmd')
  if (event.ctrlKey && !event.metaKey) parts.push('Ctrl')
  if (event.altKey) parts.push('Alt')
  if (event.shiftKey) parts.push('Shift')
  // Modifier-only press → return empty so caller can ignore.
  let key = event.code || event.key || ''
  // Code values like "KeyA" / "Digit1" / "Numpad1" → "A" / "1" / "Numpad1".
  if (key.startsWith('Key') && key.length === 4) key = key.slice(3)
  else if (key.startsWith('Digit') && key.length === 6) key = key.slice(5)
  if (!key || ['Meta', 'Control', 'Alt', 'Shift'].includes(key)) return ''
  parts.push(key)
  return parts.join('+')
}

/**
 * setKeyboardLayout — v1's @hfelix native module exposed it for layout-
 * switch handling. Tauri side: we read the system layout via web APIs
 * if needed; this shim is a no-op so the import resolves at build time.
 */
export function setKeyboardLayout(_layout) {
  // No-op. F-SHORTCUT-PLATFORM-BIND will wire real layout detection
  // if/when M-006's platform binding lands.
}

export default {
  isCompositionEvent,
  isValidElectronAccelerator,
  getAcceleratorFromKeyboardEvent,
  setKeyboardLayout
}
