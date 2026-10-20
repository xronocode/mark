// FILE: tests/renderer/commands/shortcut-routing-audit.test.js
// VERSION: 1.1.1
// START_MODULE_CONTRACT
//   PURPOSE: Systematic affordance audit — every chord the app advertises (palette registry, native menu accelerators, front-menu hints) must have a real dispatch route, and no route may silently claim a reserved chord.
//   SCOPE: Source-level extraction and cross-check of advertised chords (commands/index.js shortcut arrays, m009_menu.rs accelerators, muya frontMenu/config.js hints) against dispatch routes (native accelerators, editor.vue BLOCK_PARAGRAPH_SHORTCUTS, app.vue command-palette/zoom blocks); collision and platform guards. No runtime execution.
//   DEPENDS: src/renderer/src/commands/index.js, src-tauri/src/m009_menu.rs, src/renderer/src/components/editorWithTabs/editor.vue, src/renderer/src/pages/app.vue, src/muya/lib/ui/frontMenu/config.js, Vitest, Node fs/path.
//   LINKS: .grace/graph/runtime.xml M-006, M-009, M-012; .grace/verification/runtime.xml V-M-009, V-M-012; docs/release-trains/2.5.x-next.md FIX-005/FIX-006/FIX-010; .grace/changes/active/C-73.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   ROOT - repository root resolved from this test file.
//   readSource - read a repo file as text for source-level extraction.
//   chordKey - canonical `Meta+Shift+D` serialization used by every assertion.
//   registryArrayToParts - Registry shortcut array tokens to canonical modifier parts (darwin branch).
//   rustAcceleratorToParts - "CmdOrCtrl+Shift+D" accelerator string to canonical parts.
//   frontMenuDisplayToParts - "⇧⌘D" display glyphs to canonical parts.
//   GLYPHS - front-menu glyph to modifier-name table.
//   blockOf - Slice a semantic block between two markers, failing loudly when absent.
//   parseRegistryShortcuts - { id, chord } for every `shortcut:` array in the command registry (darwin branch).
//   parseNativeAccelerators - { id, chord } for every accelerator in the m009 native-menu taxonomy and builder chains.
//   parseKeydownChords - chords dispatched by editor.vue BLOCK_PARAGRAPH_SHORTCUTS (physical codes).
//   parseZoomChords - chords dispatched by app.vue BLOCK_ZOOM_KEYS_FONT_SIZE.
//   parseCommandPaletteChords - macOS-only chord dispatched by app.vue BLOCK_COMMAND_PALETTE_SHORTCUT.
//   parseFrontMenuChords - display chords rendered by the muya paragraph front menu.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.1.1 - 2026-10-20 FIX-010 review: assert macOS-only guards at registry, app-keydown, and native-menu layers.
//   PREV: v1.1.0 - FIX-010: the UC-025 reservation is now shipped; parse the app-level physical-code route and assert its macOS-only guard.
//   v1.0.0 - C-73: generalize the FIX-005/FIX-006 paragraph pin into a whole-registry advertised-chord routing audit (registry/menu/front-menu advertised ↔ native/keydown/zoom routes, collision detection, UC-025 reservation).
// END_CHANGE_SUMMARY
//
// The 2026-10-20 defect wave showed the failure class this file owns:
// the UI advertised ⇧⌘P duplicate, ⇧⌘N, ⌘1–6 (registry + front menu)
// while no layer dispatched them (FIX-005/FIX-006), and after the
// repair ⇧⌘P ended up claimed by nothing while UC-025 (Command
// Palette) has no accelerator or keydown route either (FIX-010).
// menu-consistency.test.js pins id ↔ id sync; this audit pins
// chord ↔ route sync so a displayed shortcut can never again dangle.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '..', '..', '..')
// CRLF checkout portability: normalize line endings so source-level
// string comparisons hold on Windows checkouts too.
const readSource = (relPath) => readFileSync(resolve(ROOT, relPath), 'utf-8').replace(/\r\n/g, '\n')

// ─── canonical chord form ─────────────────────────────────────────
// Darwin terms throughout: Cmd/CmdOrCtrl → Meta, Ctrl stays Ctrl,
// Alt is Option. Physical codes normalize to their character
// (KeyD → D, Digit3 → 3) so registry arrays, Rust accelerators and
// keydown handlers compare equal.

const chordKey = (parts) => {
  const key = parts.find((p) => !['Meta', 'Ctrl', 'Alt', 'Shift'].includes(p))
  const bits = ['Meta', 'Ctrl', 'Alt', 'Shift'].filter((m) => parts.includes(m))
  return [...bits, key ?? '?'].join('+')
}

// Registry arrays look like [isOsx ? 'Cmd' : 'Ctrl', 'Shift', 'D'] —
// the darwin branch is the advertised surface this audit pins.
const registryArrayToParts = (line) => {
  const inner = line.slice(line.indexOf('[') + 1, line.lastIndexOf(']'))
  const parts = []
  for (const token of inner.split(',')) {
    const t = token.trim()
    if (t === 'isOsx ? \'Cmd\' : \'Ctrl\'' || t === '\'Cmd\'') parts.push('Meta')
    else if (t === '\'Ctrl\'' || t === '\'Alt\'' || t === '\'Shift\'' || t === '\'+\'') {
      parts.push(t.slice(1, -1))
    } else {
      const m = t.match(/^'([^']+)'$/)
      if (m) parts.push(m[1])
    }
  }
  return parts
}

// Rust accelerators: "CmdOrCtrl+Shift+D", "Cmd+,", "Alt+CmdOrCtrl+V".
const rustAcceleratorToParts = (accel) =>
  accel.split('+').map((p) => {
    if (p === 'CmdOrCtrl' || p === 'Cmd' || p === 'Super') return 'Meta'
    if (p === 'Option') return 'Alt'
    return p
  })

// frontMenu display glyphs: `⇧${COMMAND_KEY}D`, `⇧${COMMAND_KEY}⌫`.
const GLYPHS = { '⇧': 'Shift', '⌘': 'Meta', '⌃': 'Meta', '⌥': 'Alt', '⌫': 'Backspace', '⌦': 'Delete' }
const frontMenuDisplayToParts = (display) => {
  const parts = []
  let key = ''
  for (const ch of display.replace('${COMMAND_KEY}', '⌘')) {
    if (GLYPHS[ch]) parts.push(GLYPHS[ch])
    else key += ch
  }
  if (key) parts.push(key)
  return parts
}

// ─── extractors ───────────────────────────────────────────────────

const parseRegistryShortcuts = () => {
  const js = readSource('src/renderer/src/commands/index.js')
  const lines = js.split('\n')
  const out = []
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*shortcut:\s*\[/.test(lines[i])) continue
    for (let j = i; j >= Math.max(i - 12, 0); j--) {
      const m = lines[j].match(/^\s*id:\s*'([^']+)'/)
      if (m) {
        out.push({ id: m[1], chord: chordKey(registryArrayToParts(lines[i])) })
        break
      }
    }
  }
  return out
}

const parseNativeAccelerators = () => {
  const rust = readSource('src-tauri/src/m009_menu.rs')
  const out = []
  let currentId = null
  for (const line of rust.split('\n')) {
    // Taxonomy form: id: "x".to_string() … accelerator: Some("A"…)
    // (the string closes before .to_string(), so no trailing paren).
    const idm = line.match(/^\s*id:\s*"([^"]+)"/)
    if (idm) {
      currentId = idm[1]
      continue
    }
    const am = line.match(/^\s*accelerator:\s*Some\("([^"]+)"/)
    if (am && currentId) {
      out.push({ id: currentId, chord: chordKey(rustAcceleratorToParts(am[1])) })
      currentId = null
      continue
    }
    // Builder form in build_native_menu:
    // MenuItemBuilder::with_id("x", "Label") followed by
    // .accelerator("A") in the same chain.
    const bid = line.match(/with_id\("([^"]+)"/)
    if (bid) {
      currentId = bid[1]
      continue
    }
    const bam = line.match(/^\s*\.accelerator\("([^"]+)"\)/)
    if (bam && currentId) {
      out.push({ id: currentId, chord: chordKey(rustAcceleratorToParts(bam[1])) })
      currentId = null
    }
  }
  return out
}

const blockOf = (source, startMarker, endMarker) => {
  const s = source.indexOf(startMarker)
  const e = source.indexOf(endMarker, s)
  if (s === -1 || e === -1) throw new Error(`semantic block ${startMarker} not found — routing audit cannot run silently`)
  return source.slice(s, e)
}

const parseKeydownChords = () => {
  const vue = readSource('src/renderer/src/components/editorWithTabs/editor.vue')
  const block = blockOf(vue, 'START_BLOCK_PARAGRAPH_SHORTCUTS', 'END_BLOCK_PARAGRAPH_SHORTCUTS')
  // The handler gates on cmdOrCtrl && !altKey; the shiftKey branch
  // holds the letter/backspace codes, the Digit regex below it the
  // heading chords.
  const shiftEnd = block.indexOf('const headingLevel')
  const shiftPart = block.slice(0, shiftEnd === -1 ? block.length : shiftEnd)
  const digitPart = shiftEnd === -1 ? '' : block.slice(shiftEnd)
  const chords = []
  for (const m of shiftPart.matchAll(/event\.code === '([A-Za-z]+)'/g)) {
    chords.push(chordKey(['Meta', 'Shift', m[1].replace(/^Key/, '')]))
  }
  // The heading branch matches the character class /^Digit([1-6])$/ —
  // six chords, one per member.
  if (/Digit\(\[1-6\]\)/.test(digitPart)) {
    for (let i = 1; i <= 6; i++) chords.push(chordKey(['Meta', String(i)]))
  }
  return chords
}

const parseZoomChords = () => {
  const vue = readSource('src/renderer/src/pages/app.vue')
  const block = blockOf(vue, 'START_BLOCK_ZOOM_KEYS_FONT_SIZE', 'END_BLOCK_ZOOM_KEYS_FONT_SIZE')
  const chords = []
  if (/e\.key === '=' \|\| e\.key === '\+'/.test(block)) {
    // The handler accepts '=' and '+' for the same step; '=' is the
    // advertised/primary form, '+' its alias.
    chords.push(chordKey(['Meta', '=']), chordKey(['Meta', '+']))
  }
  if (/e\.key === '-'/.test(block)) chords.push(chordKey(['Meta', '-']))
  if (/e\.key === '0'/.test(block)) chords.push(chordKey(['Meta', '0']))
  if (chords.length !== 4) throw new Error('BLOCK_ZOOM_KEYS_FONT_SIZE no longer matches the known =/-/0 routes — update the audit extractor')
  return chords
}

const parseCommandPaletteChords = () => {
  const registry = readSource('src/renderer/src/commands/index.js')
  const vue = readSource('src/renderer/src/pages/app.vue')
  const rust = readSource('src-tauri/src/m009_menu.rs')
  const block = blockOf(vue, 'START_BLOCK_COMMAND_PALETTE_SHORTCUT', 'END_BLOCK_COMMAND_PALETTE_SHORTCUT')
  if (!registry.includes("...(isOsx ? [{\n    // FIX-010 / UC-025")) throw new Error('Command Palette registry command must stay macOS-only')
  if (!block.includes('if (!isOsx)')) throw new Error('Command Palette key route must stay macOS-only')
  if (!block.includes("e.code !== 'KeyP'")) throw new Error('Command Palette must use physical KeyP for layout independence')
  if (!block.includes("EXECUTE_COMMAND_BY_ID('view.command-palette')")) throw new Error('Command Palette route must dispatch its registry id')
  if (!/#\[cfg\(target_os = "macos"\)\]\s*let view_submenu = view_submenu\.item\([\s\S]*?with_id\("view\.command-palette"/.test(rust)) {
    throw new Error('Command Palette native menu row must stay macOS-only')
  }
  return [chordKey(['Meta', 'Shift', 'P'])]
}

const parseFrontMenuChords = () => {
  const js = readSource('src/muya/lib/ui/frontMenu/config.js')
  const out = []
  for (const m of js.matchAll(/_SHORTCUT = `([^`]+)`/g)) {
    out.push(chordKey(frontMenuDisplayToParts(m[1])))
  }
  return out
}

// ─── the audit ────────────────────────────────────────────────────

describe('advertised-chord routing audit (C-73)', () => {
  const registry = parseRegistryShortcuts()
  const native = parseNativeAccelerators()
  const keydown = parseKeydownChords()
  const zoom = parseZoomChords()
  const commandPalette = parseCommandPaletteChords()
  const frontMenu = parseFrontMenuChords()

  // Registry commands whose advertised chord is dispatched by a layer
  // this audit does not parse (muya keyboard bindings, search bar,
  // CodeMirror). Each entry names the route so the exemption stays
  // reviewable; empty by default — extend only with a source pointer.
  const ROUTED_ELSEWHERE = {
    // example: 'edit.find': 'muya search component keydown (src/muya/lib/components/search/'
  }

  it('extracts a non-empty population from every source', () => {
    // Guards against a silent extractor drift: if any source changes
    // shape and yields nothing, the audit must fail loudly, not pass
    // vacuously.
    expect(registry.length).toBeGreaterThanOrEqual(20)
    expect(native.length).toBeGreaterThanOrEqual(20)
    expect(keydown.length).toBeGreaterThanOrEqual(9)
    expect(commandPalette).toEqual(['Meta+Shift+P'])
    expect(frontMenu.length).toBeGreaterThanOrEqual(3)
  })

  it('every registry-advertised chord has a dispatch route', () => {
    const nativeById = new Map(native.map((n) => [n.id, n.chord]))
    const routes = new Set([...keydown, ...zoom, ...commandPalette, ...native.map((n) => n.chord)])
    const unrouted = registry.filter(
      (r) => !routes.has(r.chord) && nativeById.get(r.id) !== r.chord && !ROUTED_ELSEWHERE[r.id]
    )
    expect(unrouted.map((r) => `${r.id}: ${r.chord}`)).toEqual([])
  })

  it('every desktop keydown chord is advertised in the registry', () => {
    const advertised = new Set(registry.map((r) => r.chord))
    // '+' is an accepted alias of the advertised '=' zoom step, not a
    // separate binding.
    const aliasOfAdvertised = new Set([chordKey(['Meta', '+'])])
    const silent = [...keydown, ...zoom, ...commandPalette].filter((c) => !advertised.has(c) && !aliasOfAdvertised.has(c))
    expect(silent).toEqual([])
  })

  it('every front-menu display chord is both advertised and routed', () => {
    const advertised = new Set(registry.map((r) => r.chord))
    const routes = new Set([...keydown, ...native.map((n) => n.chord)])
    const dangling = frontMenu.filter((c) => !advertised.has(c) || !routes.has(c))
    expect(dangling).toEqual([])
  })

  it('no chord is advertised by two different registry ids', () => {
    const byChord = new Map()
    for (const r of registry) {
      if (!byChord.has(r.chord)) byChord.set(r.chord, [])
      byChord.get(r.chord).push(r.id)
    }
    const collisions = [...byChord.entries()]
      .filter(([, ids]) => ids.length > 1)
      .map(([chord, ids]) => `${chord}: ${ids.join(', ')}`)
    expect(collisions).toEqual([])
  })

  it('registry and native menu agree on the chord for shared ids', () => {
    const nativeById = new Map(native.map((n) => [n.id, n.chord]))
    const disagreements = registry
      .filter((r) => nativeById.has(r.id) && nativeById.get(r.id) !== r.chord)
      .map((r) => `${r.id}: registry ${r.chord} vs menu ${nativeById.get(r.id)}`)
    expect(disagreements).toEqual([])
  })

  it('UC-025 has one advertised owner and both native and app-level macOS routes', () => {
    const owners = registry.filter((item) => item.chord === 'Meta+Shift+P')
    expect(owners).toEqual([{ id: 'view.command-palette', chord: 'Meta+Shift+P' }])
    expect(commandPalette).toEqual(['Meta+Shift+P'])
    expect(native).toContainEqual({ id: 'view.command-palette', chord: 'Meta+Shift+P' })
  })
})
