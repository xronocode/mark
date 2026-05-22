/**
 * Tests for src/renderer/src/ipc/contract/correlated.ts
 *
 * Covers: ipcCorrelated — req_id correlation, success, error,
 * timeout, channel defaults, listen-before-invoke ordering.
 */

import { listen } from '@tauri-apps/api/event'
import { invoke as tauriInvoke } from '@tauri-apps/api/core'
import { ipcCorrelated } from '@/ipc/contract/correlated'
import { IpcError, IpcErrorCode } from '@/ipc/contract/types'

// Mock vue to avoid onUnmounted issues
vi.mock('vue', () => ({
  onUnmounted: vi.fn()
}))

describe('ipcCorrelated', () => {
  let capturedListenHandler: ((event: any) => void) | null
  let capturedListenChannel: string
  let listenUnlisten: ReturnType<typeof vi.fn>

  beforeEach(() => {
    capturedListenHandler = null
    capturedListenChannel = ''
    listenUnlisten = vi.fn()
    ;(listen as any).mockImplementation(async (channel: string, handler: any) => {
      capturedListenChannel = channel
      capturedListenHandler = handler
      return listenUnlisten
    })
    ;(tauriInvoke as any).mockResolvedValue(undefined)
  })

  it('resolves when the response envelope has ok: true', async () => {
    // After listen is set up and invoke is called, simulate a response
    ;(tauriInvoke as any).mockImplementation(async (_cmd: string, args: any) => {
      // Simulate backend responding via the event channel
      const reqId = args.req_id
      setTimeout(() => {
        capturedListenHandler!({
          payload: { req_id: reqId, ok: true, data: 'hello' },
          event: capturedListenChannel
        })
      }, 10)
    })

    const result = await ipcCorrelated('mt::ping', { nonce: 'test' })
    expect(result).toBe('hello')
  })

  it('uses default response channel: command::response', async () => {
    ;(tauriInvoke as any).mockImplementation(async (_cmd: string, args: any) => {
      const reqId = args.req_id
      setTimeout(() => {
        capturedListenHandler!({
          payload: { req_id: reqId, ok: true, data: 'ok' },
          event: capturedListenChannel
        })
      }, 10)
    })

    await ipcCorrelated('mt::ping', { nonce: 'x' })
    expect(capturedListenChannel).toBe('mt::ping::response')
  })

  it('uses custom responseChannel when provided', async () => {
    ;(tauriInvoke as any).mockImplementation(async (_cmd: string, args: any) => {
      const reqId = args.req_id
      setTimeout(() => {
        capturedListenHandler!({
          payload: { req_id: reqId, ok: true, data: 'custom' },
          event: 'custom-ch'
        })
      }, 10)
    })

    const result = await ipcCorrelated('mt::ping', { nonce: 'y' }, {
      responseChannel: 'custom-ch'
    })
    expect(result).toBe('custom')
    expect(capturedListenChannel).toBe('custom-ch')
  })

  it('rejects with IpcError when envelope has ok: false', async () => {
    ;(tauriInvoke as any).mockImplementation(async (_cmd: string, args: any) => {
      const reqId = args.req_id
      setTimeout(() => {
        capturedListenHandler!({
          payload: {
            req_id: reqId,
            ok: false,
            error: { code: 'MT_IPC_VALIDATION', message: 'bad args' }
          },
          event: capturedListenChannel
        })
      }, 10)
    })

    await expect(
      ipcCorrelated('mt::ping', { nonce: 'z' })
    ).rejects.toThrow(IpcError)

    try {
      ;(tauriInvoke as any).mockImplementation(async (_cmd: string, args: any) => {
        const reqId = args.req_id
        setTimeout(() => {
          capturedListenHandler!({
            payload: {
              req_id: reqId,
              ok: false,
              error: { code: 'MT_IPC_VALIDATION', message: 'bad' }
            },
            event: capturedListenChannel
          })
        }, 10)
      })
      await ipcCorrelated('mt::ping', { nonce: 'z2' })
    } catch (e) {
      expect((e as IpcError).code).toBe(IpcErrorCode.VALIDATION)
    }
  })

  it('rejects with IpcError(TIMEOUT) on timeout', async () => {
    // Invoke never triggers a response
    ;(tauriInvoke as any).mockResolvedValue(undefined)

    await expect(
      ipcCorrelated('mt::ping', { nonce: 'timeout' }, { correlatedTimeoutMs: 50 })
    ).rejects.toThrow(IpcError)

    try {
      await ipcCorrelated('mt::ping', { nonce: 'timeout2' }, { correlatedTimeoutMs: 50 })
    } catch (e) {
      expect((e as IpcError).code).toBe(IpcErrorCode.TIMEOUT)
    }
  })

  it('ignores envelope with mismatched req_id', async () => {
    ;(tauriInvoke as any).mockImplementation(async (_cmd: string, args: any) => {
      const reqId = args.req_id
      // Send a response with wrong req_id first
      setTimeout(() => {
        capturedListenHandler!({
          payload: { req_id: 'wrong-id', ok: true, data: 'wrong' },
          event: capturedListenChannel
        })
      }, 5)
      // Then send the correct one
      setTimeout(() => {
        capturedListenHandler!({
          payload: { req_id: reqId, ok: true, data: 'right' },
          event: capturedListenChannel
        })
      }, 20)
    })

    const result = await ipcCorrelated('mt::ping', { nonce: 'x' })
    expect(result).toBe('right')
  })

  it('ignores null/undefined envelope payload', async () => {
    ;(tauriInvoke as any).mockImplementation(async (_cmd: string, args: any) => {
      const reqId = args.req_id
      // Send null payload first
      setTimeout(() => {
        capturedListenHandler!({ payload: null, event: capturedListenChannel })
      }, 5)
      // Then correct
      setTimeout(() => {
        capturedListenHandler!({
          payload: { req_id: reqId, ok: true, data: 'got it' },
          event: capturedListenChannel
        })
      }, 20)
    })

    const result = await ipcCorrelated('mt::ping', {})
    expect(result).toBe('got it')
  })

  it('injects req_id into the args passed to ipcInvoke', async () => {
    ;(tauriInvoke as any).mockImplementation(async (_cmd: string, args: any) => {
      expect(args.req_id).toBeDefined()
      expect(typeof args.req_id).toBe('string')
      const reqId = args.req_id
      setTimeout(() => {
        capturedListenHandler!({
          payload: { req_id: reqId, ok: true, data: null },
          event: capturedListenChannel
        })
      }, 10)
    })

    await ipcCorrelated('mt::ping', { nonce: 'test' })
  })

  it('rejects with UNKNOWN_CHANNEL when listen itself fails', async () => {
    ;(listen as any).mockRejectedValueOnce(new Error('listen failed'))

    await expect(
      ipcCorrelated('mt::ping', {})
    ).rejects.toThrow(IpcError)

    ;(listen as any).mockRejectedValueOnce(new Error('listen failed again'))
    try {
      await ipcCorrelated('mt::ping', {})
    } catch (e) {
      expect((e as IpcError).code).toBe(IpcErrorCode.UNKNOWN_CHANNEL)
    }
  })

  it('rejects when ipcInvoke rejects', async () => {
    ;(tauriInvoke as any).mockRejectedValueOnce('command mt_ping not found')

    await expect(
      ipcCorrelated('mt::ping', {})
    ).rejects.toThrow()
  })

  it('cleans up listener on timeout', async () => {
    ;(tauriInvoke as any).mockResolvedValue(undefined)

    try {
      await ipcCorrelated('mt::ping', {}, { correlatedTimeoutMs: 50 })
    } catch {
      // expected timeout
    }

    expect(listenUnlisten).toHaveBeenCalled()
  })

  it('handles error envelope without error.message', async () => {
    ;(tauriInvoke as any).mockImplementation(async (_cmd: string, args: any) => {
      const reqId = args.req_id
      setTimeout(() => {
        capturedListenHandler!({
          payload: { req_id: reqId, ok: false, error: { code: 'MT_IPC_VALIDATION' } },
          event: capturedListenChannel
        })
      }, 10)
    })

    try {
      await ipcCorrelated('mt::ping', {})
    } catch (e) {
      expect(e).toBeInstanceOf(IpcError)
      expect((e as IpcError).message).toBe('correlated error')
    }
  })

  it('handles error envelope without error object at all', async () => {
    ;(tauriInvoke as any).mockImplementation(async (_cmd: string, args: any) => {
      const reqId = args.req_id
      setTimeout(() => {
        capturedListenHandler!({
          payload: { req_id: reqId, ok: false },
          event: capturedListenChannel
        })
      }, 10)
    })

    try {
      await ipcCorrelated('mt::ping', {})
    } catch (e) {
      expect(e).toBeInstanceOf(IpcError)
      expect((e as IpcError).code).toBe(IpcErrorCode.VALIDATION)
    }
  })
})
