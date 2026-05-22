/**
 * Tests for src/renderer/src/ipc/runtime/watch.ts
 *
 * Covers: ipcWatch.subscribe, WATCH_EVENT_CHANNEL, dispose,
 * event filtering by subscriptionId.
 */

const ipcInvokeMock = vi.fn()
const useIpcListenerMock = vi.fn()

vi.mock('@/ipc/contract', () => ({
  ipcInvoke: (...args: any[]) => ipcInvokeMock(...args),
  useIpcListener: (...args: any[]) => useIpcListenerMock(...args)
}))

// Mock vue
vi.mock('vue', () => ({ onUnmounted: vi.fn() }))

import { ipcWatch, WATCH_EVENT_CHANNEL } from '@/ipc/runtime/watch'

describe('WATCH_EVENT_CHANNEL', () => {
  it('is mt::watch::event', () => {
    expect(WATCH_EVENT_CHANNEL).toBe('mt::watch::event')
  })
})

describe('ipcWatch', () => {
  let capturedListenerHandler: ((payload: any, eventName: string) => void) | null
  let listenerDispose: ReturnType<typeof vi.fn>

  beforeEach(() => {
    capturedListenerHandler = null
    listenerDispose = vi.fn()

    useIpcListenerMock.mockImplementation(async (_ch: string, handler: any, _opts: any) => {
      capturedListenerHandler = handler
      return listenerDispose
    })
  })

  describe('subscribe', () => {
    it('calls ipcInvoke(mt::watch::subscribe) with path and recursive', async () => {
      ipcInvokeMock.mockResolvedValueOnce('sub-123')

      await ipcWatch.subscribe('/docs', vi.fn(), { listener: { manual: true } })

      expect(ipcInvokeMock).toHaveBeenCalledWith('mt::watch::subscribe', {
        path: '/docs',
        recursive: true
      })
    })

    it('defaults recursive to true', async () => {
      ipcInvokeMock.mockResolvedValueOnce('sub-456')

      await ipcWatch.subscribe('/docs', vi.fn(), { listener: { manual: true } })

      expect(ipcInvokeMock).toHaveBeenCalledWith('mt::watch::subscribe', {
        path: '/docs',
        recursive: true
      })
    })

    it('respects recursive: false', async () => {
      ipcInvokeMock.mockResolvedValueOnce('sub-789')

      await ipcWatch.subscribe('/docs', vi.fn(), {
        recursive: false,
        listener: { manual: true }
      })

      expect(ipcInvokeMock).toHaveBeenCalledWith('mt::watch::subscribe', {
        path: '/docs',
        recursive: false
      })
    })

    it('returns a dispose function', async () => {
      ipcInvokeMock.mockResolvedValueOnce('sub-aaa')

      const dispose = await ipcWatch.subscribe('/docs', vi.fn(), {
        listener: { manual: true }
      })

      expect(typeof dispose).toBe('function')
    })

    it('dispose calls unsubscribe and cleans up listener', async () => {
      ipcInvokeMock
        .mockResolvedValueOnce('sub-bbb') // subscribe
        .mockResolvedValue(undefined) // unsubscribe

      const dispose = await ipcWatch.subscribe('/docs', vi.fn(), {
        listener: { manual: true }
      })

      dispose()

      expect(ipcInvokeMock).toHaveBeenCalledWith('mt::watch::unsubscribe', {
        subscriptionId: 'sub-bbb'
      })
      expect(listenerDispose).toHaveBeenCalled()
    })

    it('dispose is idempotent', async () => {
      ipcInvokeMock
        .mockResolvedValueOnce('sub-ccc')
        .mockResolvedValue(undefined)

      const dispose = await ipcWatch.subscribe('/docs', vi.fn(), {
        listener: { manual: true }
      })

      dispose()
      dispose()
      dispose()

      const unsubCalls = ipcInvokeMock.mock.calls.filter(
        (c: any[]) => c[0] === 'mt::watch::unsubscribe'
      )
      expect(unsubCalls).toHaveLength(1)
    })

    it('only calls handler for matching subscriptionId', async () => {
      ipcInvokeMock.mockResolvedValueOnce('sub-match')

      const handler = vi.fn()
      await ipcWatch.subscribe('/docs', handler, {
        listener: { manual: true }
      })

      // Event with wrong subscriptionId
      capturedListenerHandler!(
        { subscriptionId: 'other-sub', kind: 'modify', paths: ['/x'] },
        WATCH_EVENT_CHANNEL
      )
      expect(handler).not.toHaveBeenCalled()

      // Event with correct subscriptionId
      capturedListenerHandler!(
        { subscriptionId: 'sub-match', kind: 'modify', paths: ['/docs/a.md'] },
        WATCH_EVENT_CHANNEL
      )
      expect(handler).toHaveBeenCalledWith({
        subscriptionId: 'sub-match',
        kind: 'modify',
        paths: ['/docs/a.md']
      })
    })

    it('sets up listener on WATCH_EVENT_CHANNEL', async () => {
      ipcInvokeMock.mockResolvedValueOnce('sub-ch')

      await ipcWatch.subscribe('/docs', vi.fn(), {
        listener: { manual: true }
      })

      expect(useIpcListenerMock).toHaveBeenCalledWith(
        WATCH_EVENT_CHANNEL,
        expect.any(Function),
        { manual: true }
      )
    })

    it('handles unsubscribe invoke failure gracefully', async () => {
      ipcInvokeMock
        .mockResolvedValueOnce('sub-err')
        .mockRejectedValue(new Error('already cleaned'))

      const dispose = await ipcWatch.subscribe('/docs', vi.fn(), {
        listener: { manual: true }
      })

      expect(() => dispose()).not.toThrow()
    })

    it('handles listener dispose throwing gracefully', async () => {
      listenerDispose.mockImplementation(() => { throw new Error('already gone') })
      ipcInvokeMock
        .mockResolvedValueOnce('sub-throw')
        .mockResolvedValue(undefined)

      const dispose = await ipcWatch.subscribe('/docs', vi.fn(), {
        listener: { manual: true }
      })

      expect(() => dispose()).not.toThrow()
    })
  })
})
