/**
 * Unit tests for src/renderer/src/store/listenForMain.js
 *
 * Post-Path-B-clean (W6) the surface is small. Two actions:
 *   - EDITOR_EDIT_ACTION(type) — for 'findInFolder' it forces sidebar
 *     layout to { rightColumn:'search', showSideBar:true }; always
 *     emits the bus event.
 *   - LISTEN_FOR_EDIT() — registers a bus.on('mt::editor-edit-action')
 *     handler that delegates to EDITOR_EDIT_ACTION.
 */

import { setupTestPinia } from '../pinia'

// Bus per-file mock — singleton would leak listeners across files.
const busOnMock = vi.fn()
const busEmitMock = vi.fn()
const busOffMock = vi.fn()

vi.mock('@/bus', () => ({
  default: {
    on: busOnMock,
    emit: busEmitMock,
    off: busOffMock
  }
}))

// Stub layout store with a plain Pinia-style object (avoid pulling
// the real layout module + its imports).
const setLayoutMock = vi.fn()
vi.mock('@/store/layout', () => ({
  useLayoutStore: () => ({ SET_LAYOUT: setLayoutMock })
}))

describe('store/listenForMain', () => {
  beforeEach(() => {
    setupTestPinia()
    busOnMock.mockReset()
    busEmitMock.mockReset()
    busOffMock.mockReset()
    setLayoutMock.mockReset()
  })

  it('store is constructable with id "listenForMain"', async () => {
    const { useListenForMainStore } = await import('@/store/listenForMain')
    const s = useListenForMainStore()
    expect(s).toBeDefined()
    expect(s.$id).toBe('listenForMain')
    expect(Object.keys(s.$state)).toEqual([])
  })

  describe('EDITOR_EDIT_ACTION', () => {
    it('emits the bus event for any type', async () => {
      const { useListenForMainStore } = await import('@/store/listenForMain')
      const s = useListenForMainStore()
      s.EDITOR_EDIT_ACTION('find')
      expect(busEmitMock).toHaveBeenCalledWith('find', 'find')
      expect(setLayoutMock).not.toHaveBeenCalled()
    })

    it('findInFolder forces sidebar to search column + emits', async () => {
      const { useListenForMainStore } = await import('@/store/listenForMain')
      const s = useListenForMainStore()
      s.EDITOR_EDIT_ACTION('findInFolder')
      expect(setLayoutMock).toHaveBeenCalledWith({
        rightColumn: 'search',
        showSideBar: true
      })
      expect(busEmitMock).toHaveBeenCalledWith('findInFolder', 'findInFolder')
    })

    it('non-findInFolder does NOT touch layout', async () => {
      const { useListenForMainStore } = await import('@/store/listenForMain')
      const s = useListenForMainStore()
      s.EDITOR_EDIT_ACTION('replace')
      expect(setLayoutMock).not.toHaveBeenCalled()
      expect(busEmitMock).toHaveBeenCalledWith('replace', 'replace')
    })
  })

  describe('LISTEN_FOR_EDIT', () => {
    it('registers a bus.on("mt::editor-edit-action") handler', async () => {
      const { useListenForMainStore } = await import('@/store/listenForMain')
      const s = useListenForMainStore()
      s.LISTEN_FOR_EDIT()
      expect(busOnMock).toHaveBeenCalledTimes(1)
      expect(busOnMock).toHaveBeenCalledWith('mt::editor-edit-action', expect.any(Function))
    })

    it('handler dispatches EDITOR_EDIT_ACTION on emit', async () => {
      const { useListenForMainStore } = await import('@/store/listenForMain')
      const s = useListenForMainStore()
      s.LISTEN_FOR_EDIT()
      const handler = busOnMock.mock.calls[0][1] as (t: string) => void

      handler('findInFolder')
      expect(setLayoutMock).toHaveBeenCalledWith({
        rightColumn: 'search',
        showSideBar: true
      })
      expect(busEmitMock).toHaveBeenCalledWith('findInFolder', 'findInFolder')
    })

    it('handler with non-findInFolder type only emits', async () => {
      const { useListenForMainStore } = await import('@/store/listenForMain')
      const s = useListenForMainStore()
      s.LISTEN_FOR_EDIT()
      const handler = busOnMock.mock.calls[0][1] as (t: string) => void
      handler('quickOpen')
      expect(setLayoutMock).not.toHaveBeenCalled()
      expect(busEmitMock).toHaveBeenCalledWith('quickOpen', 'quickOpen')
    })
  })
})
