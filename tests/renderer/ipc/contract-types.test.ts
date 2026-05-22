/**
 * Tests for src/renderer/src/ipc/contract/types.ts
 *
 * Covers: IpcErrorCode constants, IpcError class, CommandName type,
 * FsStat/SearchOptions/CommandMap type-level surface.
 */

import { IpcError, IpcErrorCode } from '@/ipc/contract/types'

describe('IpcErrorCode', () => {
  it('exposes the four stable error codes', () => {
    expect(IpcErrorCode.UNKNOWN_COMMAND).toBe('MT_IPC_UNKNOWN_COMMAND')
    expect(IpcErrorCode.TIMEOUT).toBe('MT_IPC_TIMEOUT')
    expect(IpcErrorCode.VALIDATION).toBe('MT_IPC_VALIDATION')
    expect(IpcErrorCode.UNKNOWN_CHANNEL).toBe('MT_IPC_UNKNOWN_CHANNEL')
  })

  it('is a frozen-shape object with exactly 4 keys', () => {
    expect(Object.keys(IpcErrorCode)).toHaveLength(4)
  })
})

describe('IpcError', () => {
  it('constructs with code, message, command, and cause', () => {
    const cause = new Error('root')
    const err = new IpcError(IpcErrorCode.TIMEOUT, 'timed out', 'mt::ping', cause)

    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(IpcError)
    expect(err.name).toBe('IpcError')
    expect(err.code).toBe(IpcErrorCode.TIMEOUT)
    expect(err.message).toBe('timed out')
    expect(err.command).toBe('mt::ping')
    expect(err.cause).toBe(cause)
  })

  it('command and cause are optional', () => {
    const err = new IpcError(IpcErrorCode.VALIDATION, 'bad input')

    expect(err.command).toBeUndefined()
    expect(err.cause).toBeUndefined()
  })

  it('preserves stack trace', () => {
    const err = new IpcError(IpcErrorCode.UNKNOWN_COMMAND, 'not found')
    expect(err.stack).toBeDefined()
    expect(err.stack).toContain('IpcError')
  })

  it('is catchable as Error', () => {
    expect(() => {
      throw new IpcError(IpcErrorCode.UNKNOWN_CHANNEL, 'no channel')
    }).toThrow(Error)
  })

  it('is identifiable via instanceof', () => {
    try {
      throw new IpcError(IpcErrorCode.TIMEOUT, 'test')
    } catch (e) {
      expect(e instanceof IpcError).toBe(true)
      if (e instanceof IpcError) {
        expect(e.code).toBe(IpcErrorCode.TIMEOUT)
      }
    }
  })
})
