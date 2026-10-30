// FILE: tests/renderer/commands/standard-view.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Verify the FIX-021 renderer command view.standard-mode — the
//            native View › Standard View full reset re-dispatches only the
//            ACTIVE mode toggles (diff, split, source, typewriter, focus)
//            through the five shipped view.* commands and is a no-op in the
//            standard state or without an open tab.
//   SCOPE: Registry execute path with mocked stores/bus.
//   DEPENDS: Vitest, @/commands/index, mocked stores/bus/i18n/util.
//   LINKS: .grace/verification/runtime.xml V-M-011; docs/acceptance/registry.json FIX-021.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   preferencesStoreMock - preferences store stub carrying the three writing/view preference flags.
//   editorStoreMock - editor store stub carrying currentFile with the two per-tab flags.
//   findCmd - registry lookup by command id.
//   busEmitMock - bus.emit spy capturing view:toggle-view-entry dispatches.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-30 FIX-021 initial pins: all-five-on
//   reset (per-tab flags flip in place, writing modes emit through the
//   bus, dispatch order diff→split→source→typewriter→focus), no-op when
//   nothing is active, no-op without an open tab.
// END_CHANGE_SUMMARY

// vi.mock factories are hoisted above every declaration, so the shared
// mocks live in vi.hoisted — the registry imports '@/bus' and
// '@/store/preferences' statically and would otherwise read them early.
const { busEmitMock, preferencesStoreMock, editorStoreMock } = vi.hoisted(() => ({
  busEmitMock: vi.fn(),
  preferencesStoreMock: { sourceCode: false, typewriter: false, focus: false },
  editorStoreMock: {
    currentFile: { id: 'tab-1', pathname: '/tmp/x.md', diffMode: false, splitView: false }
  }
}))

vi.mock('@/i18n', () => ({
  t: (key) => `t:${key}`
}))

vi.mock('@/services/notification', () => ({
  default: { notify: vi.fn() }
}))

vi.mock('@/bus', () => ({
  default: { emit: busEmitMock, on: vi.fn(), off: vi.fn() }
}))

vi.mock('@/util', () => ({
  delay: () => Promise.resolve(),
  isOsx: true,
  isWindows: false,
  isLinux: false,
  getUniqueId: () => `id-${Math.random().toString(36).slice(2)}`
}))

vi.mock('@/store/preferences', () => ({
  usePreferencesStore: () => preferencesStoreMock
}))

vi.mock('@/store/editor', () => ({
  useEditorStore: () => editorStoreMock
}))

import commands from '@/commands/index'

const findCmd = (id) => {
  const cmd = commands.find((c) => c.id === id)
  if (!cmd) throw new Error(`registry missing ${id}`)
  return cmd
}

beforeEach(() => {
  busEmitMock.mockClear()
  editorStoreMock.currentFile = { id: 'tab-1', pathname: '/tmp/x.md', diffMode: false, splitView: false }
  preferencesStoreMock.sourceCode = false
  preferencesStoreMock.typewriter = false
  preferencesStoreMock.focus = false
})

describe('view.standard-mode (FIX-021)', () => {
  test('is registered next to the view mode group', () => {
    const ids = commands.map((c) => c.id)
    expect(ids).toContain('view.standard-mode')
    expect(ids.indexOf('view.standard-mode')).toBeLessThan(ids.indexOf('view.source-code-mode'))
  })

  test('resets all five active modes in the chip order', async () => {
    editorStoreMock.currentFile.diffMode = true
    editorStoreMock.currentFile.splitView = true
    preferencesStoreMock.sourceCode = true
    preferencesStoreMock.typewriter = true
    preferencesStoreMock.focus = true

    // The typewriter/focus toggles ride focusEditorAndExecute's 150 ms
    // timer, so the reset runs under fake timers and flushes them.
    vi.useFakeTimers()
    try {
      const done = findCmd('view.standard-mode').execute()
      await vi.advanceTimersByTimeAsync(250)
      await done
    } finally {
      vi.useRealTimers()
    }

    // Per-tab flags are flipped in place by the shipped toggle commands.
    expect(editorStoreMock.currentFile.diffMode).toBe(false)
    expect(editorStoreMock.currentFile.splitView).toBe(false)
    // Writing/source modes ride the view entry bus events, in order.
    const toggles = busEmitMock.mock.calls.filter((c) => c[0] === 'view:toggle-view-entry')
    expect(toggles).toEqual([
      ['view:toggle-view-entry', 'sourceCode'],
      ['view:toggle-view-entry', 'typewriter'],
      ['view:toggle-view-entry', 'focus']
    ])
  })

  test('is a no-op in the standard state', async () => {
    await findCmd('view.standard-mode').execute()

    expect(busEmitMock).not.toHaveBeenCalled()
    expect(editorStoreMock.currentFile.diffMode).toBe(false)
    expect(editorStoreMock.currentFile.splitView).toBe(false)
  })

  test('is a no-op without an open tab', async () => {
    editorStoreMock.currentFile = { id: null }
    await findCmd('view.standard-mode').execute()
    expect(busEmitMock).not.toHaveBeenCalled()
  })
})
