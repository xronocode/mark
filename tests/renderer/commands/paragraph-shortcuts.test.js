// FILE: tests/renderer/commands/paragraph-shortcuts.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin the FIX-005/FIX-006 paragraph shortcut wave — one canonical binding per command across the registry (palette display), the desktop keydown layer (editor.vue) and the muya front-menu hints.
//   SCOPE: Registry shortcut arrays, source-level keydown chord extraction, frontMenu display strings, and their cross-layer agreement; ⇧⌘P must stay unclaimed by duplicate.
//   DEPENDS: src/renderer/src/commands/index.js, src/renderer/src/components/editorWithTabs/editor.vue, src/muya/lib/ui/frontMenu/config.js, Vitest, Node fs/path.
//   LINKS: .grace/graph/runtime.xml M-009, M-012; .grace/verification/runtime.xml V-M-009; docs/release-trains/2.5.x-next.md FIX-005/FIX-006.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   ROOT - repository root resolved from this test file for source reads.
//   readSource - read a repo file as text for source-level chord extraction.
//   CANONICAL - The canonical binding table shared by every layer (visual-regression-plan 13C; ⇧⌘P reserved for the Command Palette per UC-025).
//   registryShortcut - Shortcut array of a registry command id.
//   keydownLayerChords - Chords dispatched by the editor.vue keydown block.
//   frontMenuDisplays - shortCut strings rendered by the muya paragraph front menu.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-20 FIX-005/FIX-006 wave: pin duplicate ⇧⌘D / new paragraph ⇧⌘N / delete ⇧⌘⌫ / headings ⌘1–6 across registry, keydown layer and front-menu hints.
// END_CHANGE_SUMMARY

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/i18n', () => ({
  t: (key) => `t:${key}`
}))

vi.mock('@/bus', () => ({
  default: { emit: vi.fn(), on: vi.fn(), off: vi.fn() }
}))

vi.mock('@/util', () => ({
  delay: () => Promise.resolve(),
  isOsx: true,
  isWindows: false,
  isLinux: false
}))

vi.mock('@/store/preferences', () => ({
  usePreferencesStore: () => ({})
}))

vi.mock('@/commands/utils', () => ({
  isUpdatable: () => false
}))

import commands from '@/commands/index'

const ROOT = resolve(__dirname, '..', '..', '..')
const readSource = (relPath) => readFileSync(resolve(ROOT, relPath), 'utf-8')

// isOsx:true in the mock, so the palette arrays use the macOS names.
const CANONICAL = {
  'edit.duplicate': ['Cmd', 'Shift', 'D'],
  'edit.create-paragraph': ['Cmd', 'Shift', 'N'],
  'edit.delete-paragraph': ['Cmd', 'Shift', 'Backspace'],
  'paragraph.heading-1': ['Cmd', '1'],
  'paragraph.heading-2': ['Cmd', '2'],
  'paragraph.heading-3': ['Cmd', '3'],
  'paragraph.heading-4': ['Cmd', '4'],
  'paragraph.heading-5': ['Cmd', '5'],
  'paragraph.heading-6': ['Cmd', '6']
}

const registryShortcut = (id) => {
  const command = commands.find((c) => c?.id === id)
  return command ? command.shortcut : undefined
}

// Source-level extraction of the physical-code chords the desktop
// keydown layer dispatches (editor.vue BLOCK_PARAGRAPH_SHORTCUTS).
const keydownLayerChords = () => {
  const source = readSource('src/renderer/src/components/editorWithTabs/editor.vue')
  const block = source.slice(
    source.indexOf('START_BLOCK_PARAGRAPH_SHORTCUTS'),
    source.indexOf('END_BLOCK_PARAGRAPH_SHORTCUTS')
  )
  return {
    duplicate: block.includes("event.code === 'KeyD'"),
    createParagraph: block.includes("event.code === 'KeyN'"),
    deleteParagraph: block.includes("event.code === 'Backspace'"),
    headings: block.includes('/^Digit([1-6])$/.exec(event.code)'),
    emits: {
      duplicate: block.includes("bus.emit('duplicate'"),
      createParagraph: block.includes("bus.emit('createParagraph'"),
      deleteParagraph: block.includes("bus.emit('deleteParagraph'"),
      heading: block.includes('bus.emit(\'paragraph\', `heading ${headingLevel[1]}`)')
    },
    compositionGuard: block.includes('event.isComposing'),
    readOnlyGuard: block.includes('isReadOnlySurface.value || currentFile.value?.locked'),
    viewerGuard: block.includes("closest('.ag-block-viewer')"),
    surfaceGuard: block.includes("closest('.editor-component')")
  }
}

// The shortCut strings the muya paragraph front menu displays. The
// constants are template literals over COMMAND_KEY ('⌘' on macOS), so
// resolve that substitution before comparing.
const frontMenuDisplays = () => {
  const source = readSource('src/muya/lib/ui/frontMenu/config.js')
  const pick = (name) => {
    const m = source.match(new RegExp(`const ${name} = \`([^\`]+)\``))
    return m ? m[1].replace(/\$\{COMMAND_KEY\}/g, '⌘') : null
  }
  return {
    duplicate: pick('DUPLICATE_SHORTCUT'),
    newParagraph: pick('NEW_PARAGRAPH_SHORTCUT'),
    delete: pick('DELETE_SHORTCUT')
  }
}

describe('FIX-005/FIX-006 paragraph shortcut wave', () => {
  it('the registry carries the canonical palette shortcuts', () => {
    for (const [id, shortcut] of Object.entries(CANONICAL)) {
      expect(registryShortcut(id), id).toEqual(shortcut)
    }
  })

  it('duplicate no longer claims the Command Palette chord (UC-025)', () => {
    expect(registryShortcut('edit.duplicate')).not.toEqual(['Cmd', 'Shift', 'P'])
    const duplicates = commands.filter(
      (c) => Array.isArray(c?.shortcut) && c.shortcut.join('+') === 'Cmd+Shift+P'
    )
    expect(duplicates).toEqual([])
  })

  it('the desktop keydown layer dispatches the same chords', () => {
    const layer = keydownLayerChords()
    expect(layer.duplicate).toBe(true)
    expect(layer.createParagraph).toBe(true)
    expect(layer.deleteParagraph).toBe(true)
    expect(layer.headings).toBe(true)
    expect(layer.emits.duplicate).toBe(true)
    expect(layer.emits.createParagraph).toBe(true)
    expect(layer.emits.deleteParagraph).toBe(true)
    expect(layer.emits.heading).toBe(true)
  })

  it('the keydown layer keeps its guards (IME, read-only, viewer, surface scope)', () => {
    const layer = keydownLayerChords()
    expect(layer.compositionGuard).toBe(true)
    expect(layer.readOnlyGuard).toBe(true)
    expect(layer.viewerGuard).toBe(true)
    expect(layer.surfaceGuard).toBe(true)
  })

  it('the muya front-menu hints match the wired bindings', () => {
    const displays = frontMenuDisplays()
    expect(displays.duplicate).toBe('⇧⌘D')
    expect(displays.newParagraph).toBe('⇧⌘N')
    expect(displays.delete).toBe('⇧⌘⌫')
  })

  it('the front menu never re-displays ⇧⌘P for duplicate', () => {
    const source = readSource('src/muya/lib/ui/frontMenu/config.js')
    expect(source).not.toContain('⇧${COMMAND_KEY}P')
  })
})
