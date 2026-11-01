/**
 * Tests for src/renderer/src/services/windowMenuAccelerators.js
 *
 * Covers (C-WINDOWS-MENU-ACCELERATORS): table↔registry parity, the
 * m009_menu.rs source cross-check (drift in either direction fails),
 * matcher guards (layout independence, IME, repeat, mac meta), the
 * Ctrl+A input-surface carve-out, the darwin platform gate with the e2e
 * force seam, and end-to-end dispatch through the menu-bridge registry
 * lookup.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

const execSpy = vi.fn(async () => {})
vi.mock('@/menu-bridge', () => ({
  findCommandInRegistry: vi.fn((id) => {
    if (id === 'view.source-code-mode' || id === 'edit.select-all') {
      return { command: { id, execute: execSpy }, parent: null }
    }
    return null
  })
}))

import {
  WINDOW_MENU_ACCELERATORS,
  matchAccelerator,
  resolveEnabled,
  installWindowMenuAccelerators
} from '@/services/windowMenuAccelerators'

const M009_SOURCE = resolve(process.cwd(), 'src-tauri/src/m009_menu.rs')

const keyEvent = (over = {}) => {
  const target = over.target || document.body
  return new KeyboardEvent('keydown', {
    key: 's',
    code: 'KeyS',
    ctrlKey: true,
    altKey: true,
    shiftKey: false,
    metaKey: false,
    repeat: false,
    cancelable: true,
    bubbles: true,
    ...over
  })
}

// Port of the m009 accelerator declarations to the module's normalized
// chord form: CmdOrCtrl/Ctrl → Ctrl, modifier order Ctrl+Alt+Shift, and
// physical key names ("\\", "=", "-", "0", "Tab").
const normalizeM009 = (accel) => {
  const parts = accel.split('+').map((p) => p.trim())
  const ctrl = parts.includes('CmdOrCtrl') || parts.includes('Ctrl')
  const alt = parts.includes('Alt')
  const shift = parts.includes('Shift')
  const cmdOnly = parts.includes('Cmd') && !parts.includes('CmdOrCtrl')
  let key = parts[parts.length - 1]
  // The Rust source escapes the backslash: the raw file text carries two.
  if (key === '\\\\' || key === '\\') key = 'Backslash'
  const out = [ctrl && 'Ctrl', alt && 'Alt', shift && 'Shift', key].filter(Boolean)
  return { chord: out.join('+'), ctrl, cmdOnly }
}

const m009WinChords = () => {
  const src = readFileSync(M009_SOURCE, 'utf8')
  const entries = []
  const re = /id:\s*"([^"]+)"\.to_string\(\),\s*\n\s*label:[^\n]*\n\s*command:[^\n]*\n\s*accelerator:\s*Some\("([^"]+)"\.to_string\(\)/g
  let m
  while ((m = re.exec(src)) !== null) {
    const { chord, ctrl, cmdOnly } = normalizeM009(m[2])
    if (!ctrl || cmdOnly) continue // mac-only (bare Cmd) entries stay with the native menu
    entries.push(chord)
  }
  return entries
}

// Documented exclusions: alive elsewhere or degenerate — see spec Goals.
// window.toggle-full-screen ("Ctrl+CmdOrCtrl+F") needs no exclusion entry:
// it normalizes to the same Ctrl+F as edit.find and collapses via Set
// dedup (the degenerate double modifier is why fullscreen stays out of
// the table — Ctrl+F belongs to Find).
const EXCLUDED = new Set([
  'Ctrl+=', // zoom trio lives in app.vue setupZoomKeysFontSize
  'Ctrl+-',
  'Ctrl+0'
])

describe('windowMenuAccelerators (C-WINDOWS-MENU-ACCELERATORS)', () => {
  let dispose = null

  beforeEach(() => {
    execSpy.mockClear()
    window.__FORCE_WINDOW_ACCELERATORS = undefined
    window.electron.process.platform = 'win32'
  })

  afterEach(() => {
    if (dispose) {
      dispose()
      dispose = null
    }
    window.__FORCE_WINDOW_ACCELERATORS = undefined
    window.electron.process.platform = 'darwin'
    document.body.innerHTML = ''
  })

  describe('table ↔ m009 parity', () => {
    it('the table equals the win-relevant m009 accelerators minus documented exclusions', () => {
      const expected = new Set(m009WinChords().filter((c) => !EXCLUDED.has(c)))
      const actual = new Set(WINDOW_MENU_ACCELERATORS.map((e) => e.accelerator))
      expect([...actual].sort()).toEqual([...expected].sort())
    })

    it('excluded-alive and mac-only chords are absent from the table', () => {
      const chords = new Set(WINDOW_MENU_ACCELERATORS.map((e) => e.accelerator))
      expect(chords.has('Ctrl+=')).toBe(false)
      expect(chords.has('Ctrl+-')).toBe(false)
      expect(chords.has('Ctrl+0')).toBe(false)
      expect(chords.has('Ctrl+Ctrl+F')).toBe(false)
    })

    it('maps the mode trio to the shipped view command ids', () => {
      const byChord = Object.fromEntries(WINDOW_MENU_ACCELERATORS.map((e) => [e.accelerator, e.commandId]))
      expect(byChord['Ctrl+Alt+S']).toBe('view.source-code-mode')
      expect(byChord['Ctrl+Alt+Backslash']).toBe('view.split-view')
      expect(byChord['Ctrl+D']).toBe('view.diff-mode')
      expect(byChord['Ctrl+S']).toBe('file.save')
    })
  })

  describe('matchAccelerator guards', () => {
    it('matches Ctrl+Alt+S on physical code regardless of layout (key ы)', () => {
      const event = keyEvent({ key: 'ы' })
      expect(matchAccelerator(event)?.commandId).toBe('view.source-code-mode')
    })

    it('never matches mac meta chords, composition or auto-repeat', () => {
      expect(matchAccelerator(keyEvent({ metaKey: true, ctrlKey: false }))).toBeNull()
      expect(matchAccelerator(keyEvent({ isComposing: true }))).toBeNull()
      expect(matchAccelerator(keyEvent({ repeat: true }))).toBeNull()
    })

    it('Ctrl+A carves out non-editor input surfaces but serves the editor', () => {
      const input = document.createElement('input')
      document.body.appendChild(input)
      const inputEvent = keyEvent({ code: 'KeyA', altKey: false })
      Object.defineProperty(inputEvent, 'target', { value: input })
      expect(matchAccelerator(inputEvent)).toBeNull()

      const editor = document.createElement('div')
      editor.className = 'editor-component'
      editor.setAttribute('contenteditable', 'true')
      document.body.appendChild(editor)
      const editorEvent = keyEvent({ code: 'KeyA', altKey: false })
      Object.defineProperty(editorEvent, 'target', { value: editor })
      expect(matchAccelerator(editorEvent)?.commandId).toBe('edit.select-all')
    })

    it('unmatched chords pass through untouched', () => {
      expect(matchAccelerator(keyEvent({ code: 'KeyZ' }))).toBeNull()
      expect(matchAccelerator(keyEvent({ code: 'ControlLeft', ctrlKey: true }))).toBeNull()
    })
  })

  describe('platform gate', () => {
    it('installs on win32 and linux, never on darwin unless forced', () => {
      window.electron.process.platform = 'win32'
      expect(resolveEnabled()).toBe(true)
      window.electron.process.platform = 'linux'
      expect(resolveEnabled()).toBe(true)
      window.electron.process.platform = 'darwin'
      expect(resolveEnabled()).toBe(false)
      window.__FORCE_WINDOW_ACCELERATORS = true
      expect(resolveEnabled()).toBe(true)
    })
  })

  describe('dispatch', () => {
    it('a matched chord executes the registry command once and preventDefaults', () => {
      dispose = installWindowMenuAccelerators()
      const event = keyEvent({ code: 'KeyS', ctrlKey: true, altKey: true })
      window.dispatchEvent(event)
      expect(execSpy).toHaveBeenCalledTimes(1)
      expect(event.defaultPrevented).toBe(true)
    })

    it('the darwin gate installs nothing', () => {
      window.electron.process.platform = 'darwin'
      const noop = installWindowMenuAccelerators()
      const event = keyEvent({ code: 'KeyS', ctrlKey: true, altKey: true })
      window.dispatchEvent(event)
      expect(execSpy).not.toHaveBeenCalled()
      expect(typeof noop).toBe('function')
    })
  })
})
