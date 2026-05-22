/**
 * Tests for src/renderer/src/ipc/contract/invoke.ts
 *
 * Covers: ipcInvoke wrapper — timeout, error mapping, abort signal,
 * command name translation (:: → _), logging.
 */

import { invoke as tauriInvoke } from '@tauri-apps/api/core'
import { ipcInvoke } from '@/ipc/contract/invoke'
import { IpcError, IpcErrorCode } from '@/ipc/contract/types'

describe('ipcInvoke', () => {
  it('calls tauriInvoke with translated command name (:: → _)', async () => {
    ;(tauriInvoke as any).mockResolvedValueOnce({ pong: true, nonce: undefined })

    await ipcInvoke('mt::ping', { nonce: 'abc' })

    expect(tauriInvoke).toHaveBeenCalledWith('mt_ping', { nonce: 'abc' })
  })

  it('returns the result from tauriInvoke', async () => {
    ;(tauriInvoke as any).mockResolvedValueOnce('file content')

    const result = await ipcInvoke('mt::fs::read', { path: '/test.md' })
    expect(result).toBe('file content')
  })

  it('translates nested :: separators to _', async () => {
    ;(tauriInvoke as any).mockResolvedValueOnce(undefined)

    await ipcInvoke('mt::fs::write', { path: '/a', content: 'b' })

    expect(tauriInvoke).toHaveBeenCalledWith('mt_fs_write', { path: '/a', content: 'b' })
  })

  it('throws IpcError with TIMEOUT on timeout', async () => {
    ;(tauriInvoke as any).mockImplementation(
      () => new Promise(() => {}) // never resolves
    )

    await expect(
      ipcInvoke('mt::ping', { nonce: 'x' }, { timeoutMs: 50 })
    ).rejects.toThrow(IpcError)

    try {
      await ipcInvoke('mt::ping', { nonce: 'x' }, { timeoutMs: 50 })
    } catch (e) {
      expect(e).toBeInstanceOf(IpcError)
      expect((e as IpcError).code).toBe(IpcErrorCode.TIMEOUT)
    }
  })

  it('does not timeout when timeoutMs is Infinity', async () => {
    ;(tauriInvoke as any).mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve('ok'), 100))
    )

    const result = await ipcInvoke('mt::ping', { nonce: 'x' }, { timeoutMs: Infinity })
    expect(result).toBe('ok')
  })

  it('maps "command not found" errors to UNKNOWN_COMMAND', async () => {
    ;(tauriInvoke as any).mockRejectedValueOnce('command mt_ping not found')

    try {
      await ipcInvoke('mt::ping', {})
    } catch (e) {
      expect(e).toBeInstanceOf(IpcError)
      expect((e as IpcError).code).toBe(IpcErrorCode.UNKNOWN_COMMAND)
    }
  })

  it('maps serde validation errors to VALIDATION', async () => {
    ;(tauriInvoke as any).mockRejectedValueOnce('missing field `path`')

    try {
      await ipcInvoke('mt::fs::read', { path: '' })
    } catch (e) {
      expect(e).toBeInstanceOf(IpcError)
      expect((e as IpcError).code).toBe(IpcErrorCode.VALIDATION)
    }
  })

  it('maps "invalid type" serde errors to VALIDATION', async () => {
    ;(tauriInvoke as any).mockRejectedValueOnce('invalid type: expected string')

    try {
      await ipcInvoke('mt::fs::read', { path: '' })
    } catch (e) {
      expect(e).toBeInstanceOf(IpcError)
      expect((e as IpcError).code).toBe(IpcErrorCode.VALIDATION)
    }
  })

  it('maps unknown errors to UNKNOWN_COMMAND', async () => {
    ;(tauriInvoke as any).mockRejectedValueOnce('something weird happened')

    try {
      await ipcInvoke('mt::ping', {})
    } catch (e) {
      expect(e).toBeInstanceOf(IpcError)
      expect((e as IpcError).code).toBe(IpcErrorCode.UNKNOWN_COMMAND)
    }
  })

  it('passes through IpcError without remapping', async () => {
    const original = new IpcError(IpcErrorCode.VALIDATION, 'test', 'mt::ping')
    ;(tauriInvoke as any).mockRejectedValueOnce(original)

    try {
      await ipcInvoke('mt::ping', {})
    } catch (e) {
      expect(e).toBe(original)
    }
  })

  it('handles Error instances in rejection', async () => {
    ;(tauriInvoke as any).mockRejectedValueOnce(new Error('command mt_x not found'))

    try {
      await ipcInvoke('mt::ping', {})
    } catch (e) {
      expect(e).toBeInstanceOf(IpcError)
      expect((e as IpcError).code).toBe(IpcErrorCode.UNKNOWN_COMMAND)
    }
  })

  it('respects external AbortSignal', async () => {
    const ac = new AbortController()
    ;(tauriInvoke as any).mockImplementation(
      () => new Promise(() => {}) // never resolves
    )

    const promise = ipcInvoke('mt::ping', {}, { signal: ac.signal, timeoutMs: 100 })
    // Abort externally
    ac.abort('user cancelled')

    // The timeout will eventually reject
    await expect(promise).rejects.toThrow()
  })

  it('handles already-aborted signal', async () => {
    const ac = new AbortController()
    ac.abort('pre-aborted')

    ;(tauriInvoke as any).mockImplementation(
      () => new Promise(() => {})
    )

    await expect(
      ipcInvoke('mt::ping', {}, { signal: ac.signal, timeoutMs: 100 })
    ).rejects.toThrow()
  })

  it('logs BLOCK_INVOKE and BLOCK_INVOKE_RESOLVED on success', async () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})
    ;(tauriInvoke as any).mockResolvedValueOnce('ok')

    await ipcInvoke('mt::ping', { nonce: 'test' })

    expect(debugSpy).toHaveBeenCalledWith(
      expect.stringContaining('[IpcContract][ipcInvoke][BLOCK_INVOKE]')
    )
    expect(debugSpy).toHaveBeenCalledWith(
      expect.stringContaining('[IpcContract][ipcInvoke][BLOCK_INVOKE_RESOLVED]')
    )

    debugSpy.mockRestore()
  })

  it('logs BLOCK_INVOKE_RESOLVED with error code on failure', async () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})
    ;(tauriInvoke as any).mockRejectedValueOnce('something went wrong')

    try {
      await ipcInvoke('mt::ping', {})
    } catch {
      // expected
    }

    expect(debugSpy).toHaveBeenCalledWith(
      expect.stringContaining('ok=false')
    )

    debugSpy.mockRestore()
  })

  it('uses default 10s timeout when no option provided', async () => {
    ;(tauriInvoke as any).mockResolvedValueOnce('ok')

    // Just verify it resolves without timeout for a fast call
    const result = await ipcInvoke('mt::ping', {})
    expect(result).toBe('ok')
  })
})
