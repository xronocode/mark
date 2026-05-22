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
})
