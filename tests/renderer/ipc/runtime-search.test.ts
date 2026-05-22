/**
 * Tests for src/renderer/src/ipc/runtime/search.ts
 *
 * Covers: RipgrepDirectorySearcher, ipcSearch, SEARCH_EVENT_CHANNEL,
 * search lifecycle (spawn, match events, complete, cancel, error).
 */

// We mock the contract layer directly so we control useIpcListener behavior
const { ipcInvokeMock, useIpcListenerMock, IpcErrorMock } = vi.hoisted(() => {
  const ipcInvokeMock = vi.fn()
  const useIpcListenerMock = vi.fn()
  const IpcErrorMock = class extends Error {
    code: string
    command?: string
    constructor(code: string, message: string, command?: string) {
      super(message)
      this.code = code
      this.command = command
    }
  }
  return { ipcInvokeMock, useIpcListenerMock, IpcErrorMock }
})

vi.mock('@/ipc/contract', () => ({
  ipcInvoke: (...args: any[]) => ipcInvokeMock(...args),
  useIpcListener: (...args: any[]) => useIpcListenerMock(...args),
  IpcError: IpcErrorMock,
  IpcErrorCode: {
    UNKNOWN_COMMAND: 'MT_IPC_UNKNOWN_COMMAND',
    TIMEOUT: 'MT_IPC_TIMEOUT',
    VALIDATION: 'MT_IPC_VALIDATION',
    UNKNOWN_CHANNEL: 'MT_IPC_UNKNOWN_CHANNEL'
  }
}))

// Mock vue
vi.mock('vue', () => ({ onUnmounted: vi.fn() }))

import {
  RipgrepDirectorySearcher,
  ipcSearch,
  SEARCH_EVENT_CHANNEL
} from '@/ipc/runtime/search'

describe('SEARCH_EVENT_CHANNEL', () => {
  it('is mt::search-event', () => {
    expect(SEARCH_EVENT_CHANNEL).toBe('mt::search-event')
  })
})

describe('ipcSearch', () => {
  it('newSearcher returns a RipgrepDirectorySearcher instance', () => {
    const s = ipcSearch.newSearcher()
    expect(s).toBeInstanceOf(RipgrepDirectorySearcher)
  })

  it('exposes RipgrepDirectorySearcher class', () => {
    expect(ipcSearch.RipgrepDirectorySearcher).toBe(RipgrepDirectorySearcher)
  })
})

describe('RipgrepDirectorySearcher', () => {
  let capturedListenerHandler: ((payload: any, eventName: string) => void) | null
  let listenerDispose: ReturnType<typeof vi.fn>

  beforeEach(() => {
    capturedListenerHandler = null
    listenerDispose = vi.fn()

    useIpcListenerMock.mockImplementation(async (_ch: string, handler: any) => {
      capturedListenerHandler = handler
      return listenerDispose
    })

    ipcInvokeMock.mockResolvedValue(undefined)
  })

  it('search returns a promise with .cancel method', () => {
    const searcher = new RipgrepDirectorySearcher()
    const p = searcher.search(['/docs'], 'hello')

    expect(typeof p.then).toBe('function')
    expect(typeof p.cancel).toBe('function')

    p.cancel()
  })

  it('resolves when "complete" event is received', async () => {
    const searcher = new RipgrepDirectorySearcher()

    ipcInvokeMock.mockImplementation(async (cmd: string, args: any) => {
      if (cmd === 'mt::search::spawn') {
        const searchId = args.searchId
        setTimeout(() => {
          capturedListenerHandler!(
            { searchId, kind: 'complete', seq: 1 },
            SEARCH_EVENT_CHANNEL
          )
        }, 10)
      }
    })

    const p = searcher.search(['/docs'], 'query')
    await p
  })

  it('calls didMatch for each hit in match events', async () => {
    const didMatch = vi.fn()
    const searcher = new RipgrepDirectorySearcher()

    ipcInvokeMock.mockImplementation(async (cmd: string, args: any) => {
      if (cmd === 'mt::search::spawn') {
        const searchId = args.searchId
        setTimeout(() => {
          capturedListenerHandler!(
            {
              searchId,
              kind: 'match',
              hits: [
                { path: '/a.md', line: 1, column: 0, snippet: 'hello world', truncated: false },
                { path: '/b.md', line: 5, column: 3, snippet: 'hello there', truncated: false }
              ],
              seq: 1
            },
            SEARCH_EVENT_CHANNEL
          )
        }, 10)
        setTimeout(() => {
          capturedListenerHandler!(
            { searchId, kind: 'complete', seq: 2 },
            SEARCH_EVENT_CHANNEL
          )
        }, 20)
      }
    })

    await searcher.search(['/docs'], 'hello', { didMatch })
    expect(didMatch).toHaveBeenCalledTimes(2)
    expect(didMatch).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/a.md' })
    )
  })

  it('calls didSearchPaths every 16 matches', async () => {
    const didMatch = vi.fn()
    const didSearchPaths = vi.fn()
    const searcher = new RipgrepDirectorySearcher()

    ipcInvokeMock.mockImplementation(async (cmd: string, args: any) => {
      if (cmd === 'mt::search::spawn') {
        const searchId = args.searchId
        const hits = Array.from({ length: 32 }, (_, i) => ({
          path: `/file${i}.md`,
          line: i,
          column: 0,
          snippet: 'match',
          truncated: false
        }))
        setTimeout(() => {
          capturedListenerHandler!(
            { searchId, kind: 'match', hits, seq: 1 },
            SEARCH_EVENT_CHANNEL
          )
        }, 10)
        setTimeout(() => {
          capturedListenerHandler!(
            { searchId, kind: 'complete', seq: 2 },
            SEARCH_EVENT_CHANNEL
          )
        }, 20)
      }
    })

    await searcher.search(['/docs'], 'q', { didMatch, didSearchPaths })
    expect(didSearchPaths).toHaveBeenCalledTimes(2)
    expect(didSearchPaths).toHaveBeenCalledWith(16)
    expect(didSearchPaths).toHaveBeenCalledWith(32)
  })

  it('resolves on "cancelled" event', async () => {
    const searcher = new RipgrepDirectorySearcher()

    ipcInvokeMock.mockImplementation(async (cmd: string, args: any) => {
      if (cmd === 'mt::search::spawn') {
        const searchId = args.searchId
        setTimeout(() => {
          capturedListenerHandler!(
            { searchId, kind: 'cancelled', seq: 1 },
            SEARCH_EVENT_CHANNEL
          )
        }, 10)
      }
    })

    await searcher.search(['/docs'], 'query')
  })

  it('rejects on "error" event', async () => {
    const searcher = new RipgrepDirectorySearcher()

    ipcInvokeMock.mockImplementation(async (cmd: string, args: any) => {
      if (cmd === 'mt::search::spawn') {
        const searchId = args.searchId
        setTimeout(() => {
          capturedListenerHandler!(
            { searchId, kind: 'error', error: 'rg failed', seq: 1 },
            SEARCH_EVENT_CHANNEL
          )
        }, 10)
      }
    })

    await expect(searcher.search(['/docs'], 'query')).rejects.toThrow()
  })

  it('cancel() calls ipcInvoke(mt::search::cancel) and resolves', async () => {
    const searcher = new RipgrepDirectorySearcher()
    ipcInvokeMock.mockResolvedValue(undefined)

    const p = searcher.search(['/docs'], 'query')
    p.cancel()

    await p
    expect(ipcInvokeMock).toHaveBeenCalledWith(
      'mt::search::cancel',
      expect.objectContaining({ searchId: expect.any(String) })
    )
  })

  it('ignores events with mismatched searchId', async () => {
    const didMatch = vi.fn()
    const searcher = new RipgrepDirectorySearcher()

    ipcInvokeMock.mockImplementation(async (cmd: string, args: any) => {
      if (cmd === 'mt::search::spawn') {
        const searchId = args.searchId
        setTimeout(() => {
          capturedListenerHandler!(
            {
              searchId: 'wrong-id',
              kind: 'match',
              hits: [{ path: '/x.md', line: 1, column: 0, snippet: 'nope', truncated: false }],
              seq: 1
            },
            SEARCH_EVENT_CHANNEL
          )
        }, 5)
        setTimeout(() => {
          capturedListenerHandler!(
            { searchId, kind: 'complete', seq: 2 },
            SEARCH_EVENT_CHANNEL
          )
        }, 20)
      }
    })

    await searcher.search(['/docs'], 'q', { didMatch })
    expect(didMatch).not.toHaveBeenCalled()
  })

  it('passes search options to ipcInvoke', async () => {
    const searcher = new RipgrepDirectorySearcher()

    ipcInvokeMock.mockImplementation(async (cmd: string, args: any) => {
      if (cmd === 'mt::search::spawn') {
        const searchId = args.searchId
        setTimeout(() => {
          capturedListenerHandler!(
            { searchId, kind: 'complete', seq: 1 },
            SEARCH_EVENT_CHANNEL
          )
        }, 10)
      }
    })

    await searcher.search(['/docs'], 'pattern', {
      isRegexp: true,
      isCaseSensitive: true,
      isWholeWord: false,
      followSymlinks: true,
      inclusions: ['*.md'],
      exclusions: ['node_modules']
    })

    expect(ipcInvokeMock).toHaveBeenCalledWith(
      'mt::search::spawn',
      expect.objectContaining({
        mode: 'content',
        directories: ['/docs'],
        pattern: 'pattern',
        options: expect.objectContaining({
          isRegexp: true,
          isCaseSensitive: true,
          inclusions: ['*.md'],
          exclusions: ['node_modules']
        })
      })
    )
  })

  it('handles match event with empty hits array', async () => {
    const didMatch = vi.fn()
    const searcher = new RipgrepDirectorySearcher()

    ipcInvokeMock.mockImplementation(async (cmd: string, args: any) => {
      if (cmd === 'mt::search::spawn') {
        const searchId = args.searchId
        setTimeout(() => {
          capturedListenerHandler!(
            { searchId, kind: 'match', hits: [], seq: 1 },
            SEARCH_EVENT_CHANNEL
          )
        }, 10)
        setTimeout(() => {
          capturedListenerHandler!(
            { searchId, kind: 'complete', seq: 2 },
            SEARCH_EVENT_CHANNEL
          )
        }, 20)
      }
    })

    await searcher.search(['/docs'], 'q', { didMatch })
    expect(didMatch).not.toHaveBeenCalled()
  })

  it('handles match event with undefined hits', async () => {
    const didMatch = vi.fn()
    const searcher = new RipgrepDirectorySearcher()

    ipcInvokeMock.mockImplementation(async (cmd: string, args: any) => {
      if (cmd === 'mt::search::spawn') {
        const searchId = args.searchId
        setTimeout(() => {
          capturedListenerHandler!(
            { searchId, kind: 'match', seq: 1 },
            SEARCH_EVENT_CHANNEL
          )
        }, 10)
        setTimeout(() => {
          capturedListenerHandler!(
            { searchId, kind: 'complete', seq: 2 },
            SEARCH_EVENT_CHANNEL
          )
        }, 20)
      }
    })

    await searcher.search(['/docs'], 'q', { didMatch })
    expect(didMatch).not.toHaveBeenCalled()
  })

  it('handles didMatch throwing without crashing', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const didMatch = vi.fn(() => { throw new Error('boom') })
    const searcher = new RipgrepDirectorySearcher()

    ipcInvokeMock.mockImplementation(async (cmd: string, args: any) => {
      if (cmd === 'mt::search::spawn') {
        const searchId = args.searchId
        setTimeout(() => {
          capturedListenerHandler!(
            {
              searchId,
              kind: 'match',
              hits: [{ path: '/a.md', line: 1, column: 0, snippet: 'x', truncated: false }],
              seq: 1
            },
            SEARCH_EVENT_CHANNEL
          )
        }, 10)
        setTimeout(() => {
          capturedListenerHandler!(
            { searchId, kind: 'complete', seq: 2 },
            SEARCH_EVENT_CHANNEL
          )
        }, 20)
      }
    })

    await searcher.search(['/docs'], 'q', { didMatch })
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('didMatch threw'),
      expect.any(Error)
    )
    warnSpy.mockRestore()
  })

  it('error event without message still rejects', async () => {
    const searcher = new RipgrepDirectorySearcher()

    ipcInvokeMock.mockImplementation(async (cmd: string, args: any) => {
      if (cmd === 'mt::search::spawn') {
        const searchId = args.searchId
        setTimeout(() => {
          capturedListenerHandler!(
            { searchId, kind: 'error', seq: 1 },
            SEARCH_EVENT_CHANNEL
          )
        }, 10)
      }
    })

    await expect(searcher.search(['/docs'], 'q')).rejects.toThrow()
  })

  it('rejects when useIpcListener itself fails', async () => {
    useIpcListenerMock.mockRejectedValueOnce(new Error('listen failed'))
    const searcher = new RipgrepDirectorySearcher()

    await expect(searcher.search(['/docs'], 'q')).rejects.toThrow()
  })
})
