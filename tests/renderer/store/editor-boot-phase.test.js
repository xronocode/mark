import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setupTestPinia } from '../pinia'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue({})
}))

const busEmitMock = vi.fn()
vi.mock('@/bus', () => ({
  default: { emit: busEmitMock, on: vi.fn(), off: vi.fn() }
}))

vi.mock('@/ipc/runtime', () => ({
  ipcFs: {
    read: vi.fn(async () => 'mocked content'),
    write: vi.fn(), stat: vi.fn(), readdir: vi.fn(), unlink: vi.fn()
  },
  ipcWatch: {},
  ipcSearch: {}, ipcPrefs: { get: vi.fn(async () => null), set: vi.fn(async () => {}), getAll: vi.fn(async () => ({})) }, ipcWorkspace: {}, ipcFonts: {},
  ipcRecent: { add: vi.fn(async () => {}), list: vi.fn(async () => []), clear: vi.fn(async () => {}) }, ipcShortcut: {}, ipcSpell: {}, ipcMenu: {},
  ipcPandoc: {}, ipcUpdater: {}, ipcScreenshot: {}, ipcSecret: {},
  ipc: { fs: { read: vi.fn(async () => 'mocked content') } }
}))
vi.mock('@/services/notification', () => ({ default: { notify: vi.fn() } }))
vi.mock('@/commands', () => ({
  FileEncodingCommand: class {},
  QuickOpenCommand: class {},
  LineEndingCommand: class {},
  TrailingNewlineCommand: class {}
}))

describe('M-028 boot phase deferral', () => {
  let editor
  let editorMod

  beforeEach(async () => {
    setupTestPinia()
    editorMod = await import('@/store/editor')
    editorMod.__resetBootPhase()
    editor = editorMod.useEditorStore()
    busEmitMock.mockReset()
  })

  function makeDoc(name) {
    return {
      markdown: `# ${name}`,
      filename: `${name}.md`,
      pathname: `/tmp/${name}.md`,
      encoding: 'utf-8',
      lineEnding: 'lf',
      adjustLineEndingOnSave: false,
      trimTrailingNewline: false
    }
  }

  it('suppresses bus.emit(file-changed) during boot phase', () => {
    editor.NEW_TAB_WITH_CONTENT({ markdownDocument: makeDoc('boot-test'), selected: true })

    const fileChangedCalls = busEmitMock.mock.calls.filter(c => c[0] === 'file-changed')
    expect(fileChangedCalls).toHaveLength(0)
    expect(editor.currentFile.markdown).toBe('# boot-test')
  })

  it('suppresses bus.emit(file-loaded) during boot phase', () => {
    editor.NEW_TAB_WITH_CONTENT({ markdownDocument: makeDoc('boot-test'), selected: true })

    const fileLoadedCalls = busEmitMock.mock.calls.filter(c => c[0] === 'file-loaded')
    expect(fileLoadedCalls).toHaveLength(0)
  })

  it('defers updateTabIdToIndex during boot phase', () => {
    editor.NEW_TAB_WITH_CONTENT({ markdownDocument: makeDoc('boot-idx'), selected: true })

    expect(editor.tabIdToIndex).toEqual({})
  })

  it('END_BOOT_PHASE rebuilds tabIdToIndex', () => {
    editor.NEW_TAB_WITH_CONTENT({ markdownDocument: makeDoc('a'), selected: true })
    editor.NEW_TAB_WITH_CONTENT({ markdownDocument: makeDoc('b'), selected: false })

    expect(Object.keys(editor.tabIdToIndex)).toHaveLength(0)

    editor.END_BOOT_PHASE()

    expect(Object.keys(editor.tabIdToIndex)).toHaveLength(2)
  })

  it('emits file-changed after END_BOOT_PHASE on tab switch', () => {
    editor.NEW_TAB_WITH_CONTENT({ markdownDocument: makeDoc('first'), selected: true })
    editor.NEW_TAB_WITH_CONTENT({ markdownDocument: makeDoc('second'), selected: false })

    editor.END_BOOT_PHASE()
    busEmitMock.mockReset()

    editor.UPDATE_CURRENT_FILE(editor.tabs[1])
    const fileChangedCalls = busEmitMock.mock.calls.filter(c => c[0] === 'file-changed')
    expect(fileChangedCalls).toHaveLength(1)
    expect(fileChangedCalls[0][1].id).toBe(editor.tabs[1].id)
  })

  it('END_BOOT_PHASE is idempotent', () => {
    editor.END_BOOT_PHASE()
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    editor.END_BOOT_PHASE()
    const bootCalls = spy.mock.calls.filter(c =>
      String(c[0]).includes('BLOCK_BOOT_PHASE_ENDED')
    )
    expect(bootCalls).toHaveLength(0)
    spy.mockRestore()
  })

  it('handles multiple tabs created during boot correctly', () => {
    for (let i = 0; i < 5; i++) {
      editor.NEW_TAB_WITH_CONTENT({
        markdownDocument: makeDoc(`file-${i}`),
        selected: i === 4
      })
    }

    expect(editor.tabs).toHaveLength(5)
    expect(editor.currentFile.markdown).toBe('# file-4')
    const fileChangedCalls = busEmitMock.mock.calls.filter(c => c[0] === 'file-changed')
    expect(fileChangedCalls).toHaveLength(0)

    editor.END_BOOT_PHASE()
    expect(Object.keys(editor.tabIdToIndex)).toHaveLength(5)
  })
})
