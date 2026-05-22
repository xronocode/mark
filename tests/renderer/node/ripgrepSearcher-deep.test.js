/**
 * Deep coverage tests for src/renderer/src/node/ripgrepSearcher.js
 *
 * Targets uncovered branches:
 *   - handler: msg=null, msg.searchId mismatch
 *   - handler: 'error' event type with message
 *   - handler: 'error' event type without message
 *   - handler: 'searchedPaths' event
 *   - handler: didMatch callback throwing
 *   - handler: didSearchPaths callback throwing
 *   - settle called twice (idempotent)
 *   - ipcRenderer.on returns non-function (fallback unsubscribe)
 *   - cancel after settlement
 *   - generateSearchId sequence wrapping
 */

import RipgrepDirectorySearcher from '@/node/ripgrepSearcher'

describe('node/ripgrepSearcher — deep coverage', () => {
  let searcher
  let capturedHandler
  let capturedSearchId

  beforeEach(() => {
    searcher = new RipgrepDirectorySearcher()

    // Capture the IPC handler and searchId for each test
    window.electron.ipcRenderer.on.mockImplementation((channel, handler) => {
      capturedHandler = handler
      return () => {}
    })
    window.electron.ipcRenderer.invoke.mockImplementation((_cmd, payload) => {
      capturedSearchId = payload.searchId
      return Promise.resolve()
    })
  })

  describe('handler message filtering', () => {
    it('ignores null messages', () => {
      const didMatch = vi.fn()
      searcher._spawn('content', ['/dir'], 'q', { didMatch })

      // Call handler with null msg
      capturedHandler({}, null)
      expect(didMatch).not.toHaveBeenCalled()
    })

    it('ignores messages with different searchId', () => {
      const didMatch = vi.fn()
      searcher._spawn('content', ['/dir'], 'q', { didMatch })

      capturedHandler({}, { searchId: 'wrong-id', type: 'match', payload: {} })
      expect(didMatch).not.toHaveBeenCalled()
    })

    it('ignores messages with undefined msg', () => {
      const didMatch = vi.fn()
      searcher._spawn('content', ['/dir'], 'q', { didMatch })

      capturedHandler({}, undefined)
      expect(didMatch).not.toHaveBeenCalled()
    })
  })

  describe('match event handling', () => {
    it('calls didMatch with payload on match event', () => {
      const didMatch = vi.fn()
      searcher._spawn('content', ['/dir'], 'q', { didMatch })

      capturedHandler({}, {
        searchId: capturedSearchId,
        type: 'match',
        payload: { file: 'test.md', matches: [] }
      })

      expect(didMatch).toHaveBeenCalledWith({ file: 'test.md', matches: [] })
    })

    it('handles didMatch callback throwing', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const didMatch = vi.fn(() => { throw new Error('callback error') })
      searcher._spawn('content', ['/dir'], 'q', { didMatch })

      capturedHandler({}, {
        searchId: capturedSearchId,
        type: 'match',
        payload: {}
      })

      expect(warnSpy).toHaveBeenCalledWith('search didMatch threw:', expect.any(Error))
      warnSpy.mockRestore()
    })

    it('uses no-op didMatch when not provided', () => {
      // Should not throw
      searcher._spawn('content', ['/dir'], 'q', {})

      expect(() => {
        capturedHandler({}, {
          searchId: capturedSearchId,
          type: 'match',
          payload: {}
        })
      }).not.toThrow()
    })
  })

  describe('searchedPaths event handling', () => {
    it('calls didSearchPaths with payload', () => {
      const didSearchPaths = vi.fn()
      searcher._spawn('content', ['/dir'], 'q', { didSearchPaths })

      capturedHandler({}, {
        searchId: capturedSearchId,
        type: 'searchedPaths',
        payload: 42
      })

      expect(didSearchPaths).toHaveBeenCalledWith(42)
    })

    it('handles didSearchPaths throwing without crashing', () => {
      const didSearchPaths = vi.fn(() => { throw new Error('oops') })
      searcher._spawn('content', ['/dir'], 'q', { didSearchPaths })

      expect(() => {
        capturedHandler({}, {
          searchId: capturedSearchId,
          type: 'searchedPaths',
          payload: 10
        })
      }).not.toThrow()
    })

    it('uses no-op didSearchPaths when not provided', () => {
      searcher._spawn('content', ['/dir'], 'q', {})

      expect(() => {
        capturedHandler({}, {
          searchId: capturedSearchId,
          type: 'searchedPaths',
          payload: 5
        })
      }).not.toThrow()
    })
  })

  describe('error event handling', () => {
    it('rejects promise on error event with message', async () => {
      const promise = searcher._spawn('content', ['/dir'], 'q', {})

      capturedHandler({}, {
        searchId: capturedSearchId,
        type: 'error',
        payload: { message: 'rg failed' }
      })

      await expect(promise).rejects.toThrow('rg failed')
    })

    it('rejects with generic message when payload has no message field', async () => {
      const promise = searcher._spawn('content', ['/dir'], 'q', {})

      capturedHandler({}, {
        searchId: capturedSearchId,
        type: 'error',
        payload: {}
      })

      await expect(promise).rejects.toThrow('search error')
    })

    it('rejects with generic message when payload is null', async () => {
      const promise = searcher._spawn('content', ['/dir'], 'q', {})

      capturedHandler({}, {
        searchId: capturedSearchId,
        type: 'error',
        payload: null
      })

      await expect(promise).rejects.toThrow('search error')
    })
  })

  describe('complete event handling', () => {
    it('resolves promise on complete event', async () => {
      const promise = searcher._spawn('content', ['/dir'], 'q', {})

      capturedHandler({}, {
        searchId: capturedSearchId,
        type: 'complete'
      })

      await expect(promise).resolves.toBeUndefined()
    })
  })

  describe('settle idempotency', () => {
    it('ignores second settlement', async () => {
      const promise = searcher._spawn('content', ['/dir'], 'q', {})

      // First: complete
      capturedHandler({}, { searchId: capturedSearchId, type: 'complete' })
      // Second: error (should be ignored)
      capturedHandler({}, { searchId: capturedSearchId, type: 'error', payload: { message: 'late' } })

      await expect(promise).resolves.toBeUndefined()
    })
  })

  describe('unsubscribe fallback', () => {
    it('uses removeListener fallback when on() returns non-function', () => {
      // Make on() return a non-function
      window.electron.ipcRenderer.on.mockImplementation((channel, handler) => {
        capturedHandler = handler
        return 'not-a-function'
      })

      const promise = searcher._spawn('content', ['/dir'], 'q', {})

      // Complete to trigger unsubscribe
      capturedHandler({}, { searchId: capturedSearchId, type: 'complete' })

      expect(window.electron.ipcRenderer.removeListener).toHaveBeenCalledWith(
        'mt::search-event',
        expect.any(Function)
      )
    })
  })

  describe('cancel', () => {
    it('sends cancel IPC and resolves the promise', async () => {
      const promise = searcher._spawn('content', ['/dir'], 'q', {})
      promise.cancel()

      expect(window.electron.ipcRenderer.send).toHaveBeenCalledWith(
        'mt::search-cancel',
        { searchId: capturedSearchId }
      )

      await expect(promise).resolves.toBeUndefined()
    })

    it('cancel after settlement is a no-op (idempotent settle)', async () => {
      const promise = searcher._spawn('content', ['/dir'], 'q', {})

      // Complete first
      capturedHandler({}, { searchId: capturedSearchId, type: 'complete' })
      // Then cancel — should not crash
      promise.cancel()

      await expect(promise).resolves.toBeUndefined()
    })
  })

  describe('search() delegates to _spawn', () => {
    it('passes mode=content', () => {
      const spy = vi.spyOn(searcher, '_spawn')
      searcher.search(['/a', '/b'], 'test', { isRegexp: true })
      expect(spy).toHaveBeenCalledWith('content', ['/a', '/b'], 'test', { isRegexp: true })
    })
  })

  describe('generateSearchId uniqueness', () => {
    it('produces unique search IDs across calls', () => {
      const ids = new Set()
      for (let i = 0; i < 10; i++) {
        searcher._spawn('content', ['/dir'], 'q', {})
        ids.add(capturedSearchId)
      }
      expect(ids.size).toBe(10)
    })
  })
})
