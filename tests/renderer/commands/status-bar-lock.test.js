// FILE: tests/renderer/commands/status-bar-lock.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Verify the C-40 T-004 renderer commands — view.status-bar (persisted preference toggle), view.lock-document (per-tab lock dispatch), and edit.copy-as-markdown (copyAsMarkdown bus event).
//   SCOPE: Registry execute paths with mocked stores/bus (focusEditorAndExecute delays under fake timers).
//   DEPENDS: Vitest, @/commands/index, mocked stores/bus/i18n.
//   LINKS: .grace/verification/runtime.xml V-M-011 scenario-55, V-M-014; .grace/changes/archive/C-40 T-004.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   preferencesStoreMock - preferences store stub carrying statusBarVisibility + SET_SINGLE_PREFERENCE capture.
//   editorStoreMock - editor store stub carrying the TOGGLE_LOCK_DOCUMENT spy.
//   findCmd - registry lookup by command id.
//   setSinglePreferenceMock - SET_SINGLE_PREFERENCE spy.
//   toggleLockMock - TOGGLE_LOCK_DOCUMENT spy.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-15 C-40 T-004 initial pins: status-bar
//   preference flip + persistence write, lock dispatch to the editor
//   store (no tab id → current file), copy-as-markdown bus emit.
// END_CHANGE_SUMMARY

vi.mock('@/i18n', () => ({
  t: (key) => `t:${key}`
}))

vi.mock('@/services/notification', () => ({
  default: { notify: vi.fn() }
}))

vi.mock('@/bus', () => ({
  default: { emit: vi.fn(), on: vi.fn(), off: vi.fn() }
}))

vi.mock('@/util', () => ({
  delay: () => Promise.resolve(),
  isOsx: true,
  isWindows: false,
  isLinux: false,
  getUniqueId: () => `id-${Math.random().toString(36).slice(2)}`
}))

const setSinglePreferenceMock = vi.fn()
const preferencesStoreMock = {
  statusBarVisibility: false,
  SET_SINGLE_PREFERENCE: setSinglePreferenceMock
}
vi.mock('@/store/preferences', () => ({
  usePreferencesStore: () => preferencesStoreMock
}))

const toggleLockMock = vi.fn()
const editorStoreMock = {
  currentFile: { id: 'tab-1', pathname: '/tmp/x.md' },
  TOGGLE_LOCK_DOCUMENT: toggleLockMock
}
vi.mock('@/store/editor', () => ({
  useEditorStore: () => editorStoreMock
}))

vi.mock('@/commands/utils', () => ({
  isUpdatable: () => false
}))

vi.mock('@/store/project', () => ({
  useProjectStore: () => ({ ASK_FOR_OPEN_PROJECT: vi.fn() })
}))

import commands from '@/commands/index'
import bus from '@/bus'

const findCmd = (id) => commands.find((c) => c.id === id)

describe('commands — C-40 T-004 (status bar, lock, copy as markdown)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    preferencesStoreMock.statusBarVisibility = false
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('registers the three commands', () => {
    expect(findCmd('view.status-bar')).toBeTruthy()
    expect(findCmd('view.lock-document')).toBeTruthy()
    expect(findCmd('edit.copy-as-markdown')).toBeTruthy()
  })

  it('view.status-bar flips and persists statusBarVisibility', async () => {
    await findCmd('view.status-bar').execute()
    expect(setSinglePreferenceMock).toHaveBeenCalledWith({
      type: 'statusBarVisibility',
      value: true
    })

    preferencesStoreMock.statusBarVisibility = true
    await findCmd('view.status-bar').execute()
    expect(setSinglePreferenceMock).toHaveBeenLastCalledWith({
      type: 'statusBarVisibility',
      value: false
    })
  })

  it('view.lock-document dispatches to TOGGLE_LOCK_DOCUMENT on the current file', async () => {
    await findCmd('view.lock-document').execute()
    expect(toggleLockMock).toHaveBeenCalledWith()
    expect(toggleLockMock).toHaveBeenCalledTimes(1)
  })

  it('edit.copy-as-markdown emits copyAsMarkdown after the focus delay', () => {
    findCmd('edit.copy-as-markdown').execute()
    vi.advanceTimersByTime(200)
    expect(bus.emit).toHaveBeenCalledWith('copyAsMarkdown')
  })
})
