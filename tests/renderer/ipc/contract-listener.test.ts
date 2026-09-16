/**
 * Tests for src/renderer/src/ipc/contract/listener.ts
 *
 * Covers: useIpcListener — subscribe, unsubscribe, ref-counting,
 * manual disposal, error handling, handler exceptions.
 */

import { listen } from '@tauri-apps/api/event'

// Mock vue's onUnmounted
const onUnmountedMock = vi.fn()
vi.mock('vue', () => ({
  onUnmounted: (...args: any[]) => onUnmountedMock(...args)
}))

// Must import AFTER mocks are set up
import { useIpcListener, _refcountSnapshot } from '@/ipc/contract/listener'
import { IpcError, IpcErrorCode } from '@/ipc/contract/types'

describe('useIpcListener', () => {
  let capturedHandler: ((event: any) => void) | null = null
  let unlistenSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    capturedHandler = null
    unlistenSpy = vi.fn()
    ;(listen as any).mockImplementation(async (_channel: string, handler: any) => {
      capturedHandler = handler
      return unlistenSpy
    })
  })

  it('calls listen with channel and handler wrapper', async () => {
    const handler = vi.fn()
    await useIpcListener('test-ch-listen', handler, { manual: true })

    expect(listen).toHaveBeenCalledWith('test-ch-listen', expect.any(Function))
  })

  it('invokes handler with payload and event name', async () => {
    const handler = vi.fn()
    await useIpcListener('test-ch-invoke', handler, { manual: true })

    capturedHandler!({ payload: { data: 42 }, event: 'test-ch-invoke' })
    expect(handler).toHaveBeenCalledWith({ data: 42 }, 'test-ch-invoke')
  })

  it('returns a dispose function', async () => {
    const handler = vi.fn()
    const dispose = await useIpcListener('ch1', handler, { manual: true })

    expect(typeof dispose).toBe('function')
  })

  it('dispose calls unlisten and removes channel from refcount', async () => {
    const handler = vi.fn()
    const dispose = await useIpcListener('ch-dispose', handler, { manual: true })

    expect(_refcountSnapshot('ch-dispose')).toBe(1)

    dispose()

    expect(unlistenSpy).toHaveBeenCalled()
    expect(_refcountSnapshot('ch-dispose')).toBe(0)
  })

  it('dispose is idempotent', async () => {
    const handler = vi.fn()
    const dispose = await useIpcListener('ch-idem', handler, { manual: true })

    dispose()
    dispose()
    dispose()

    expect(unlistenSpy).toHaveBeenCalledTimes(1)
  })

  it('ref-count increments with multiple subscribers', async () => {
    const handler1 = vi.fn()
    const handler2 = vi.fn()

    const dispose1 = await useIpcListener('ch-multi', handler1, { manual: true })
    // Second subscriber reuses existing listener
    const dispose2 = await useIpcListener('ch-multi', handler2, { manual: true })

    expect(_refcountSnapshot('ch-multi')).toBe(2)

    // First dispose decrements but doesn't call unlisten
    dispose1()
    expect(_refcountSnapshot('ch-multi')).toBe(1)
    expect(unlistenSpy).not.toHaveBeenCalled()

    // Second dispose tears down
    dispose2()
    expect(_refcountSnapshot('ch-multi')).toBe(0)
    expect(unlistenSpy).toHaveBeenCalled()
  })

  it('registers onUnmounted callback when manual is false', async () => {
    const handler = vi.fn()
    await useIpcListener('ch-auto', handler)

    expect(onUnmountedMock).toHaveBeenCalledWith(expect.any(Function))
  })

  it('does NOT register onUnmounted when manual is true', async () => {
    const handler = vi.fn()
    await useIpcListener('ch-manual', handler, { manual: true })

    expect(onUnmountedMock).not.toHaveBeenCalled()
  })

  it('throws IpcError(UNKNOWN_CHANNEL) when listen() fails', async () => {
    ;(listen as any).mockRejectedValueOnce(new Error('channel not available'))

    await expect(
      useIpcListener('bad-ch', vi.fn(), { manual: true })
    ).rejects.toThrow(IpcError)

    try {
      ;(listen as any).mockRejectedValueOnce(new Error('channel broke'))
      await useIpcListener('bad-ch2', vi.fn(), { manual: true })
    } catch (e) {
      expect((e as IpcError).code).toBe(IpcErrorCode.UNKNOWN_CHANNEL)
    }
  })

  it('throws IpcError with string rejection from listen', async () => {
    ;(listen as any).mockRejectedValueOnce('string error')

    try {
      await useIpcListener('bad-ch3', vi.fn(), { manual: true })
    } catch (e) {
      expect(e).toBeInstanceOf(IpcError)
      expect((e as IpcError).code).toBe(IpcErrorCode.UNKNOWN_CHANNEL)
    }
  })

  it('catches handler exceptions without crashing', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const badHandler = vi.fn(() => {
      throw new Error('handler boom')
    })

    await useIpcListener('ch-throw', badHandler, { manual: true })
    capturedHandler!({ payload: 'x', event: 'ch-throw' })

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[IpcContract][useIpcListener] handler threw'),
      expect.any(Error)
    )

    errorSpy.mockRestore()
  })

  it('logs refcount on subscribe and unsubscribe', async () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})

    const dispose = await useIpcListener('ch-log', vi.fn(), { manual: true })

    expect(debugSpy).toHaveBeenCalledWith(
      expect.stringContaining('op=subscribe')
    )

    dispose()

    expect(debugSpy).toHaveBeenCalledWith(
      expect.stringContaining('op=unsubscribe')
    )

    debugSpy.mockRestore()
  })

  it('handles unlisten throwing gracefully on dispose', async () => {
    unlistenSpy.mockImplementation(() => {
      throw new Error('already gone')
    })

    const dispose = await useIpcListener('ch-unlisten-err', vi.fn(), { manual: true })

    // Should not throw
    expect(() => dispose()).not.toThrow()
  })

  // ---- C-2: fan-out delivery (previously only the FIRST subscriber's
  // handler was wired into listen(); later subscribers got nothing —
  // the bug that killed every file-watcher subscription after the
  // first). ----

  it('delivers events to a second subscriber on the same channel', async () => {
    const handler1 = vi.fn()
    const handler2 = vi.fn()
    await useIpcListener('ch-fanout', handler1, { manual: true })
    await useIpcListener('ch-fanout', handler2, { manual: true })

    capturedHandler!({ payload: { n: 1 }, event: 'ch-fanout' })

    expect(handler1).toHaveBeenCalledWith({ n: 1 }, 'ch-fanout')
    expect(handler2).toHaveBeenCalledWith({ n: 1 }, 'ch-fanout')
  })

  it('second subscriber keeps receiving after the first disposes', async () => {
    const handler1 = vi.fn()
    const handler2 = vi.fn()
    const dispose1 = await useIpcListener('ch-survive', handler1, { manual: true })
    await useIpcListener('ch-survive', handler2, { manual: true })

    dispose1()
    capturedHandler!({ payload: 'x', event: 'ch-survive' })

    expect(handler1).not.toHaveBeenCalled()
    expect(handler2).toHaveBeenCalledWith('x', 'ch-survive')
    expect(unlistenSpy).not.toHaveBeenCalled()
  })

  it('re-subscribe after full teardown re-establishes delivery', async () => {
    const dispose1 = await useIpcListener('ch-resub', vi.fn(), { manual: true })
    dispose1()
    expect(unlistenSpy).toHaveBeenCalledTimes(1)

    const handler = vi.fn()
    const dispose2 = await useIpcListener('ch-resub', handler, { manual: true })
    // listen() called again for the fresh registration…
    expect(listen).toHaveBeenCalledTimes(2)
    // …and the new handler receives events.
    capturedHandler!({ payload: 7, event: 'ch-resub' })
    expect(handler).toHaveBeenCalledWith(7, 'ch-resub')
    dispose2()
  })

  it('a throwing handler does not starve sibling handlers', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const good = vi.fn()
    const bad = vi.fn(() => {
      throw new Error('boom')
    })
    await useIpcListener('ch-sibling', bad, { manual: true })
    await useIpcListener('ch-sibling', good, { manual: true })

    capturedHandler!({ payload: 'v', event: 'ch-sibling' })

    expect(bad).toHaveBeenCalled()
    expect(good).toHaveBeenCalledWith('v', 'ch-sibling')
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('handler threw'),
      expect.any(Error)
    )
    errorSpy.mockRestore()
  })

  it('concurrent first subscribes share one listen() registration', async () => {
    // Defer listen() resolution so both subscribes race the creation.
    let release!: (fn: () => void) => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    ;(listen as any).mockImplementationOnce(async (_c: string, _h: any) => {
      await gate
      return vi.fn()
    })

    const p1 = useIpcListener('ch-race', vi.fn(), { manual: true })
    const p2 = useIpcListener('ch-race', vi.fn(), { manual: true })
    release()
    const [d1, d2] = await Promise.all([p1, p2])

    expect(listen).toHaveBeenCalledTimes(1)
    expect(_refcountSnapshot('ch-race')).toBe(2)
    d1()
    expect(_refcountSnapshot('ch-race')).toBe(1)
    d2()
    expect(_refcountSnapshot('ch-race')).toBe(0)
  })

  // Review-1 finding: the SAME handler reference subscribed twice must
  // behave as two independent subscriptions — not deduped by Set
  // semantics (previously the second dispose crashed and the second
  // subscription silently received nothing).
  it('the same handler function subscribed twice gets two delivery slots', async () => {
    const shared = vi.fn()
    const dispose1 = await useIpcListener('ch-dup', shared, { manual: true })
    const dispose2 = await useIpcListener('ch-dup', shared, { manual: true })

    expect(_refcountSnapshot('ch-dup')).toBe(2)

    capturedHandler!({ payload: 'x', event: 'ch-dup' })
    expect(shared).toHaveBeenCalledTimes(2)

    // First dispose leaves the second alive; second dispose tears down
    // cleanly — no throw, unlisten exactly once.
    expect(() => dispose1()).not.toThrow()
    capturedHandler!({ payload: 'y', event: 'ch-dup' })
    expect(shared).toHaveBeenCalledTimes(3)
    expect(() => dispose2()).not.toThrow()
    expect(unlistenSpy).toHaveBeenCalledTimes(1)
    expect(_refcountSnapshot('ch-dup')).toBe(0)
  })

  it('a failed listen() creation frees the channel for a later retry', async () => {
    ;(listen as any).mockRejectedValueOnce(new Error('transient'))
    await expect(
      useIpcListener('ch-retry', vi.fn(), { manual: true })
    ).rejects.toThrow(IpcError)

    // Second attempt must actually call listen() again (no stuck pending
    // entry from the first failure) and succeed.
    const handler = vi.fn()
    const dispose = await useIpcListener('ch-retry', handler, { manual: true })
    expect(listen).toHaveBeenCalledWith('ch-retry', expect.any(Function))
    capturedHandler!({ payload: true, event: 'ch-retry' })
    expect(handler).toHaveBeenCalledWith(true, 'ch-retry')
    dispose()
  })

  it('BLOCK_LISTENER_REFCOUNT logs the subscriber (handler-set) count', async () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})
    const d1 = await useIpcListener('ch-count', vi.fn(), { manual: true })
    await useIpcListener('ch-count', vi.fn(), { manual: true })
    expect(debugSpy).toHaveBeenCalledWith(
      expect.stringMatching(/ch-count.*op=subscribe.*refs=2/)
    )
    d1()
    expect(debugSpy).toHaveBeenCalledWith(
      expect.stringMatching(/ch-count.*op=unsubscribe.*refs=1/)
    )
    debugSpy.mockRestore()
  })
})
