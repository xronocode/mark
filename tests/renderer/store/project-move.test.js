// FILE: tests/renderer/store/project-move.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin the C-SIDEBAR-MOVE-FILE moveItem semantics — refusals, native move, tab migration and store re-keying — plus the cut-paste rerouting and the drag-and-drop wiring.
//   SCOPE: Store-level unit tests with a mocked fileUtils/editor-store/migration-utils, and source-level pins of the treeFile/treeFolder drag wiring and the SIDEBAR::paste delegation.
//   DEPENDS: src/renderer/src/store/project.js, src/renderer/src/components/sideBar/treeFile.vue, src/renderer/src/components/sideBar/treeFolder.vue, Vitest, Node fs/path.
//   LINKS: .grace/graph/runtime.xml M-009, M-011; docs/acceptance/registry.json C-SIDEBAR-MOVE-FILE.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   ROOT - repository root resolved from this test file for source reads.
//   readSource - read a repo file as text for source-level pins.
//   makeStore - build a project store instance with a controlled editor twin.
//   fileUtils - the mocked window.fileUtils surface (stat/move).
//   editorTwin - the controlled editor-store twin the mocked useEditorStore returns.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-11-17 C-SIDEBAR-MOVE-FILE: initial pin — same-destination and collision refusals, failure atomicity, tab migration with DIRNAME, three store migrations, clipboard clearing, paste delegation and dnd wiring.
// END_CHANGE_SUMMARY

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { setActivePinia } from 'pinia'
import { setupTestPinia } from '../pinia'

// The source tree reads window.electron.process at module-eval time
// (util/index.js platform constants), while tests/renderer/setup.ts only
// installs its shims in beforeEach — seed a hoisted fallback so the
// static imports below can resolve.
vi.hoisted(() => {
  window.electron = window.electron || {
    process: { platform: 'darwin' },
    ipcRenderer: { send: vi.fn(), invoke: vi.fn(async () => undefined) }
  }
  window.path = window.path || {
    basename: (p) => p.split('/').pop(),
    dirname: (p) => p.slice(0, p.lastIndexOf('/')) || '/',
    join: (...parts) => parts.join('/').replace(/\/+$/g, ''),
    normalize: (p) => p.replace(/\/+$/g, ''),
    sep: '/'
  }
})

vi.mock('@/services/notification', () => ({
  default: { notify: vi.fn(async () => undefined) }
}))
vi.mock('@/i18n', () => ({
  default: { global: { t: (k) => k } },
  i18n: { global: { t: (k) => k } },
  t: (k) => k
}))
vi.mock('../bus', () => ({
  default: { on: vi.fn(), off: vi.fn(), emit: vi.fn() }
}))
vi.mock('@/bus', () => ({
  default: { on: vi.fn(), off: vi.fn(), emit: vi.fn() }
}))
vi.mock('@/util/fileSystem', () => ({
  create: vi.fn(),
  paste: vi.fn(),
  rename: vi.fn()
}))
vi.mock('@/util/tableLayoutStore', () => ({
  moveTableLayoutsEntry: vi.fn(async () => undefined)
}))
vi.mock('@/util/filePositionStore', () => ({
  moveFilePositionsEntry: vi.fn(),
  loadFilePosition: vi.fn(),
  saveFilePosition: vi.fn(),
  clampEntryToMarkdown: vi.fn()
}))
vi.mock('@/util/pageWidthStore', () => ({
  movePageWidthEntry: vi.fn()
}))

import notice from '@/services/notification'
import { moveTableLayoutsEntry } from '@/util/tableLayoutStore'
import { moveFilePositionsEntry } from '@/util/filePositionStore'
import { movePageWidthEntry } from '@/util/pageWidthStore'
import { useProjectStore } from '@/store/project'

const ROOT = resolve(__dirname, '..', '..', '..')
const readSource = (relPath) => readFileSync(resolve(ROOT, relPath), 'utf-8')

const editorTwin = { tabs: [], currentFile: null }
vi.mock('@/store/editor', () => ({
  useEditorStore: () => editorTwin
}))

const fileUtils = {
  stat: vi.fn(async () => null),
  move: vi.fn(async () => undefined)
}

const makeStore = () => {
  setActivePinia(setupTestPinia())
  return useProjectStore()
}

describe('store/project.js moveItem (C-SIDEBAR-MOVE-FILE)', () => {
  let store

  beforeEach(() => {
    window.path = {
      basename: (p) => p.split('/').pop(),
      dirname: (p) => p.split('/').slice(0, -1).join('/'),
      normalize: (p) => p.replace(/\/+$/, '')
    }
    window.fileUtils = fileUtils
    window.DIRNAME = '/root'
    // setup.ts owns window.electron; only guarantee the platform field
    // the source tree reads at import time.
    window.electron.process = { platform: 'darwin' }
    editorTwin.tabs = []
    editorTwin.currentFile = null
    fileUtils.stat.mockReset()
    // A missing destination rejects (native stat semantics).
    fileUtils.stat.mockRejectedValue(new Error('no such file'))
    fileUtils.move.mockReset()
    fileUtils.move.mockResolvedValue(undefined)
    vi.mocked(moveTableLayoutsEntry).mockClear()
    vi.mocked(moveFilePositionsEntry).mockClear()
    vi.mocked(movePageWidthEntry).mockClear()
    vi.mocked(notice.notify).mockClear()
    store = makeStore()
    store.clipboard = null
  })

  it('refuses a move into the source folder with no filesystem call', async () => {
    const ok = await store.moveItem('/root/a/one.md', '/root/a')
    expect(ok).toBe(false)
    expect(fileUtils.stat).not.toHaveBeenCalled()
    expect(fileUtils.move).not.toHaveBeenCalled()
    expect(notice.notify).toHaveBeenCalled()
  })

  it('refuses a colliding destination before any native call, naming the file', async () => {
    fileUtils.stat.mockResolvedValue({ isFile: true })
    const ok = await store.moveItem('/root/a/one.md', '/root/b')
    expect(ok).toBe(false)
    expect(fileUtils.move).not.toHaveBeenCalled()
    const message = vi.mocked(notice.notify).mock.calls[0][0].message
    expect(message).toContain('one.md')
  })

  it('moves and migrates an open tab with DIRNAME for the current file', async () => {
    const tab = { id: 7, pathname: '/root/a/one.md', filename: 'one.md' }
    editorTwin.tabs = [tab]
    editorTwin.currentFile = tab
    const ok = await store.moveItem('/root/a/one.md', '/root/b')
    expect(ok).toBe(true)
    expect(fileUtils.move).toHaveBeenCalledWith('/root/a/one.md', '/root/b/one.md')
    expect(tab.pathname).toBe('/root/b/one.md')
    expect(window.DIRNAME).toBe('/root/b')
  })

  it('re-keys the three per-pathname stores after a successful move', async () => {
    await store.moveItem('/root/a/one.md', '/root/b')
    expect(moveTableLayoutsEntry).toHaveBeenCalledWith('/root/a/one.md', '/root/b/one.md')
    expect(moveFilePositionsEntry).toHaveBeenCalledWith('/root/a/one.md', '/root/b/one.md')
    expect(movePageWidthEntry).toHaveBeenCalledWith('/root/a/one.md', '/root/b/one.md')
  })

  it('leaves tabs, stores and clipboard untouched when the native move fails', async () => {
    const tab = { id: 7, pathname: '/root/a/one.md', filename: 'one.md' }
    editorTwin.tabs = [tab]
    store.clipboard = { type: 'cut', src: '/root/a/one.md' }
    fileUtils.move.mockRejectedValue(new Error('boom'))
    const ok = await store.moveItem('/root/a/one.md', '/root/b')
    expect(ok).toBe(false)
    expect(tab.pathname).toBe('/root/a/one.md')
    expect(moveTableLayoutsEntry).not.toHaveBeenCalled()
    expect(store.clipboard).toEqual({ type: 'cut', src: '/root/a/one.md' })
    expect(notice.notify).toHaveBeenCalled()
  })

  it('clears the clipboard when the moved file was its source', async () => {
    store.clipboard = { type: 'cut', src: '/root/a/one.md' }
    await store.moveItem('/root/a/one.md', '/root/b')
    expect(store.clipboard).toBeNull()
  })

  it('SIDEBAR::paste delegates cut sources to moveItem', () => {
    const source = readSource('src/renderer/src/store/project.js')
    expect(source).toContain("clipboard.type === 'cut'")
    expect(source).toContain('this.moveItem(clipboard.src, dirname)')
  })

  it('treeFile rows are draggable and carry the pathname', () => {
    const source = readSource('src/renderer/src/components/sideBar/treeFile.vue')
    expect(source).toContain('draggable="true"')
    expect(source).toContain('@dragstart="handleDragStart"')
    expect(source).toContain('text/markmark-move-path')
  })

  it('treeFolder rows are the only drop targets and emit SIDEBAR::move-item', () => {
    const source = readSource('src/renderer/src/components/sideBar/treeFolder.vue')
    expect(source).toContain('@dragover="handleDragOver"')
    expect(source).toContain('@drop="handleDrop"')
    expect(source).toContain("bus.emit('SIDEBAR::move-item'")
  })
})
