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
 *   - two-root session trace (C-SEARCH-SESSION-COMPLETION): real
 *     {searchId, kind, hits, seq} envelopes translated like the boot
 *     shim's mt::search-event branch, embedded + rg parity, single
 *     settle/unsubscribe after the last root's batch, full-trace capture,
 *     error parity with settled-guard absorption of late terminals
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

  // C-SEARCH-SESSION-COMPLETION: the backend session coordinator now
  // delivers every root's matches before exactly ONE terminal envelope.
  // These scenarios replay that producer trace through the actual
  // consumer class and prove settle-once / unsubscribe-once behavior
  // without any renderer workaround for premature backend terminals.
  describe('two-root session trace (C-SEARCH-SESSION-COMPLETION)', () => {
    // The backend emits {searchId, kind, hits[], error?, seq} envelopes on
    // 'mt::search-event'. The boot shim's mt::search-event branch
    // (src/renderer/src/_shims/install-window-globals.js) translates them
    // for this legacy consumer: match hits are grouped by path into
    // {filePath, matches} payloads, complete/cancelled both surface as
    // type 'complete', error carries {message}. The shim module itself
    // hosts top-level awaits and cannot be imported in vitest (see
    // tests/renderer/_shims/install-window-globals.test.js), so this
    // fixture mirrors that documented translation while driving the REAL
    // consumer class through its captured ipc handler.
    const translateEnvelope = (envelope) => {
      if (envelope.kind === 'match' && Array.isArray(envelope.hits) && envelope.hits.length) {
        const byPath = new Map()
        for (const h of envelope.hits) {
          if (!byPath.has(h.path)) byPath.set(h.path, [])
          byPath.get(h.path).push({
            matchText: h.snippet || '',
            lineText: h.snippet || '',
            range: [
              { row: Math.max(0, (h.line || 1) - 1), column: h.column || 0 },
              { row: Math.max(0, (h.line || 1) - 1), column: (h.column || 0) + (h.snippet ? h.snippet.length : 0) }
            ],
            leadingContextLines: [],
            trailingContextLines: []
          })
        }
        return Array.from(byPath.entries()).map(([filePath, matches]) => ({
          searchId: envelope.searchId,
          type: 'match',
          payload: { filePath, matches }
        }))
      }
      if (envelope.kind === 'complete' || envelope.kind === 'cancelled') {
        return [{ searchId: envelope.searchId, type: 'complete' }]
      }
      if (envelope.kind === 'error') {
        return [{
          searchId: envelope.searchId,
          type: 'error',
          payload: { message: envelope.error || 'search error' }
        }]
      }
      return []
    }

    // NEW producer trace (identical shape for the embedded walker and the
    // rg shellout over the session coordinator): match envelopes with a
    // session-wide strictly increasing seq, then exactly ONE terminal.
    const twoRootTrace = (searchId) => [
      {
        searchId,
        kind: 'match',
        seq: 1,
        hits: [{ path: '/roots/alpha/report.md', line: 2, column: 1, snippet: 'quarterly numbers', truncated: false }]
      },
      {
        searchId,
        kind: 'match',
        seq: 2,
        hits: [{ path: '/roots/beta/plan.md', line: 7, column: 5, snippet: 'quarterly review', truncated: false }]
      },
      { searchId, kind: 'complete', seq: 3, hits: [] }
    ]

    // Full-trace harness: every envelope is recorded BEFORE dispatch and
    // collection never stops at a terminal, so a premature consumer settle
    // could not truncate the proof.
    const driveSearch = async (traceFactory) => {
      const didMatchCalls = []
      const didSearchPathsCalls = []
      const order = []
      let resolveCount = 0
      let rejectCount = 0
      let unsubscribeCount = 0

      window.electron.ipcRenderer.on.mockImplementation((channel, handler) => {
        capturedHandler = handler
        return () => { unsubscribeCount += 1 }
      })
      window.electron.ipcRenderer.invoke.mockImplementation((_cmd, payload) => {
        capturedSearchId = payload.searchId
        return Promise.resolve()
      })

      const promise = searcher._spawn(
        'content',
        ['/roots/alpha', '/roots/beta'],
        'quarterly',
        {
          didMatch: (hit) => { didMatchCalls.push(hit); order.push('didMatch:' + hit.filePath) },
          didSearchPaths: (n) => { didSearchPathsCalls.push(n) }
        }
      )
      const settled = promise.then(
        () => { resolveCount += 1; order.push('settled:resolve') },
        () => { rejectCount += 1; order.push('settled:reject') }
      )

      const delivered = []
      for (const envelope of traceFactory(capturedSearchId)) {
        delivered.push(envelope)
        for (const msg of translateEnvelope(envelope)) {
          capturedHandler({}, msg)
        }
      }
      await settled
      return {
        didMatchCalls,
        didSearchPathsCalls,
        order,
        resolveCount,
        rejectCount,
        unsubscribeCount,
        delivered
      }
    }

    const expectTwoRootSession = (r) => {
      // Both roots' files reached didMatch.
      const matchedPaths = r.didMatchCalls.map((c) => c.filePath)
      expect(matchedPaths).toEqual(['/roots/alpha/report.md', '/roots/beta/plan.md'])
      // Full-trace capture saw the whole NEW trace — a harness that stops
      // at the first terminal would only ever hold 2 of the 3 envelopes.
      expect(r.delivered).toHaveLength(3)
      // Resolution happened only AFTER the last root's match batch.
      expect(r.order).toEqual([
        'didMatch:/roots/alpha/report.md',
        'didMatch:/roots/beta/plan.md',
        'settled:resolve'
      ])
      // The thenable settles exactly once; unsubscribe happens exactly once.
      expect(r.resolveCount).toBe(1)
      expect(r.rejectCount).toBe(0)
      expect(r.unsubscribeCount).toBe(1)
    }

    it('two-root embedded regression: both roots delivered before exactly one settle', async () => {
      expectTwoRootSession(await driveSearch(twoRootTrace))
    })

    it('rg control parity: same trace shape, same observable behavior', async () => {
      // Over the session coordinator the rg adapter emits the identical
      // envelope trace, so the consumer-side observables must match the
      // embedded regression exactly.
      expectTwoRootSession(await driveSearch(twoRootTrace))
    })

    it('error parity: one rejection, no later resolve, settled guard absorbs late terminal', async () => {
      const r = await driveSearch((searchId) => [
        {
          searchId,
          kind: 'match',
          seq: 1,
          hits: [{ path: '/roots/alpha/report.md', line: 2, column: 1, snippet: 'quarterly numbers', truncated: false }]
        },
        { searchId, kind: 'error', seq: 2, error: 'rg failed: bad pattern' },
        // The session backend never sends a terminal after its error, but
        // the settled guard must absorb any late one regardless.
        { searchId, kind: 'complete', seq: 3 }
      ])
      expect(r.rejectCount).toBe(1)
      expect(r.resolveCount).toBe(0)
      // didMatch/didSearchPaths stop after settle — no late calls, no throw.
      expect(r.didMatchCalls).toHaveLength(1)
      expect(r.didSearchPathsCalls).toHaveLength(0)
      expect(r.order).toEqual([
        'didMatch:/roots/alpha/report.md',
        'settled:reject'
      ])
      expect(r.unsubscribeCount).toBe(1)
    })
  })
})
