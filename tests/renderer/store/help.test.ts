/**
 * Unit tests for src/renderer/src/store/help.js
 *
 * Pure factory module — no Pinia, no IPC. Public surface:
 *   - defaultFileState (constant)
 *   - getOptionsFromState(file)
 *   - getFileStateFromData(data)
 *   - getBlankFileState(tabs, defaultEncoding?, lineEnding?, markdown?)
 *   - getSingleFileState({ id?, markdown, filename, pathname, options })
 *   - createDocumentState(markdownDocument, id?)
 */

// i18n is imported by help.js but only for side-effect (named import
// `i18n` is unused at runtime in current code). Mock to avoid pulling
// the JSON locale at module-load time.
vi.mock('@/i18n', () => ({
  i18n: { global: { t: (k: string) => k } },
  t: (k: string) => k,
  setLanguage: vi.fn()
}))

describe('store/help', () => {
  describe('defaultFileState', () => {
    it('has expected default fields', async () => {
      const { defaultFileState } = await import('@/store/help')
      expect(defaultFileState.isSaved).toBe(true)
      expect(defaultFileState.pathname).toBe('')
      expect(defaultFileState.filename).toBe('Untitled-1')
      expect(defaultFileState.markdown).toBe('')
      expect(defaultFileState.encoding).toEqual({ encoding: 'utf8', isBom: false })
      expect(defaultFileState.lineEnding).toBe('lf')
      expect(defaultFileState.trimTrailingNewline).toBe(3)
      expect(defaultFileState.adjustLineEndingOnSave).toBe(false)
      expect(defaultFileState.history).toEqual({ stack: [], index: -1 })
      expect(defaultFileState.cursor).toBeNull()
      expect(defaultFileState.wordCount).toEqual({ paragraph: 0, word: 0, character: 0, all: 0 })
      expect(defaultFileState.searchMatches).toEqual({ index: -1, matches: [], value: '' })
      expect(defaultFileState.notifications).toEqual([])
    })
  })

  describe('getOptionsFromState', () => {
    it('extracts encoding/lineEnding/adjustLineEndingOnSave/trimTrailingNewline', async () => {
      const { getOptionsFromState } = await import('@/store/help')
      const file = {
        encoding: { encoding: 'utf8', isBom: false },
        lineEnding: 'crlf',
        adjustLineEndingOnSave: true,
        trimTrailingNewline: 1,
        irrelevant: 'ignored'
      }
      const opts = getOptionsFromState(file)
      expect(opts).toEqual({
        encoding: { encoding: 'utf8', isBom: false },
        lineEnding: 'crlf',
        adjustLineEndingOnSave: true,
        trimTrailingNewline: 1
      })
      expect((opts as any).irrelevant).toBeUndefined()
    })

    it('returns undefined values for missing fields (no defaults)', async () => {
      const { getOptionsFromState } = await import('@/store/help')
      const opts = getOptionsFromState({} as any)
      expect(opts.encoding).toBeUndefined()
      expect(opts.lineEnding).toBeUndefined()
      expect(opts.adjustLineEndingOnSave).toBeUndefined()
      expect(opts.trimTrailingNewline).toBeUndefined()
    })
  })

  describe('getFileStateFromData', () => {
    it('builds a state with id + caller-provided fields', async () => {
      const { getFileStateFromData } = await import('@/store/help')
      const state = getFileStateFromData({
        markdown: '# hi',
        filename: 'a.md',
        pathname: '/x/a.md',
        encoding: { encoding: 'utf8', isBom: false },
        lineEnding: 'lf',
        adjustLineEndingOnSave: false,
        trimTrailingNewline: 2
      })
      expect(state.id).toBeDefined()
      expect(state.markdown).toBe('# hi')
      expect(state.filename).toBe('a.md')
      expect(state.pathname).toBe('/x/a.md')
      expect(state.lineEnding).toBe('lf')
      expect(state.trimTrailingNewline).toBe(2)
      // defaults preserved
      expect(state.isSaved).toBe(true)
      expect(state.history).toEqual({ stack: [], index: -1 })
      expect(state.notifications).toEqual([])
    })

    it('returned state is a clone (does not mutate defaultFileState)', async () => {
      const { getFileStateFromData, defaultFileState } = await import('@/store/help')
      const state = getFileStateFromData({
        markdown: 'm',
        filename: 'f',
        pathname: '/p',
        encoding: { encoding: 'utf8', isBom: false },
        lineEnding: 'lf',
        adjustLineEndingOnSave: false,
        trimTrailingNewline: 1
      })
      state.notifications.push({ id: 1 } as any)
      expect(defaultFileState.notifications.length).toBe(0)
    })
  })

  describe('getBlankFileState', () => {
    it('returns Untitled-1 when tabs list is empty', async () => {
      const { getBlankFileState } = await import('@/store/help')
      const state = getBlankFileState([])
      expect(state.filename).toBe('Untitled-1')
      expect(state.id).toBeDefined()
      expect(state.markdown).toBe('')
      expect(state.lineEnding).toBe('lf')
      expect(state.adjustLineEndingOnSave).toBe(false)
      expect(state.encoding.encoding).toBe('utf8')
      expect((state as any).lastSavedHistoryId).toBe(-1)
    })

    it('increments past existing untitled tabs', async () => {
      const { getBlankFileState } = await import('@/store/help')
      const tabs = [
        { pathname: '', filename: 'Untitled-1' },
        { pathname: '', filename: 'Untitled-3' },
        { pathname: '/saved/x.md', filename: 'x.md' }
      ]
      const state = getBlankFileState(tabs)
      expect(state.filename).toBe('Untitled-4')
    })

    it('honors defaultEncoding override', async () => {
      const { getBlankFileState } = await import('@/store/help')
      const state = getBlankFileState([], 'gbk')
      expect(state.encoding.encoding).toBe('gbk')
    })

    it('crlf lineEnding sets adjustLineEndingOnSave true', async () => {
      const { getBlankFileState } = await import('@/store/help')
      const state = getBlankFileState([], 'utf8', 'crlf')
      expect(state.lineEnding).toBe('crlf')
      expect(state.adjustLineEndingOnSave).toBe(true)
    })

    it('CRLF (uppercase) is also treated as crlf', async () => {
      const { getBlankFileState } = await import('@/store/help')
      const state = getBlankFileState([], 'utf8', 'CRLF')
      expect(state.adjustLineEndingOnSave).toBe(true)
    })

    it('honors markdown content arg', async () => {
      const { getBlankFileState } = await import('@/store/help')
      const state = getBlankFileState([], 'utf8', 'lf', '# hello')
      expect(state.markdown).toBe('# hello')
    })

    it('null markdown is normalized to empty string', async () => {
      const { getBlankFileState } = await import('@/store/help')
      const state = getBlankFileState([], 'utf8', 'lf', null as any)
      expect(state.markdown).toBe('')
    })

    it('does not mutate defaultFileState (clone)', async () => {
      const { getBlankFileState, defaultFileState } = await import('@/store/help')
      const state = getBlankFileState([])
      state.encoding.encoding = 'mutated'
      expect(defaultFileState.encoding.encoding).toBe('utf8')
    })
  })

  describe('getSingleFileState', () => {
    it('builds a state with provided id and options', async () => {
      const { getSingleFileState } = await import('@/store/help')
      const state = getSingleFileState({
        id: 'fixed-id',
        markdown: 'body',
        filename: 'doc.md',
        pathname: '/p/doc.md',
        options: {
          encoding: { encoding: 'utf8', isBom: false },
          lineEnding: 'lf',
          adjustLineEndingOnSave: false,
          trimTrailingNewline: 2
        }
      })
      expect(state.id).toBe('fixed-id')
      expect(state.markdown).toBe('body')
      expect(state.filename).toBe('doc.md')
      expect(state.pathname).toBe('/p/doc.md')
      expect(state.encoding).toEqual({ encoding: 'utf8', isBom: false })
      expect(state.lineEnding).toBe('lf')
      expect(state.trimTrailingNewline).toBe(2)
      expect((state as any).lastSavedHistoryId).toBe(-1)
    })

    it('generates an id when not provided', async () => {
      const { getSingleFileState } = await import('@/store/help')
      const state = getSingleFileState({
        markdown: 'b',
        filename: 'f.md',
        pathname: '/f.md',
        options: {
          encoding: { encoding: 'utf8', isBom: false },
          lineEnding: 'lf',
          adjustLineEndingOnSave: false,
          trimTrailingNewline: 1
        }
      })
      expect(state.id).toBeDefined()
      expect(typeof state.id).toBe('string')
    })

    it('returned state is a clone of defaultFileState', async () => {
      const { getSingleFileState, defaultFileState } = await import('@/store/help')
      const state = getSingleFileState({
        markdown: 'm',
        filename: 'f',
        pathname: '/p',
        options: {
          encoding: { encoding: 'utf8', isBom: false },
          lineEnding: 'lf',
          adjustLineEndingOnSave: false,
          trimTrailingNewline: 1
        }
      })
      state.notifications.push({ id: 1 } as any)
      expect(defaultFileState.notifications.length).toBe(0)
    })
  })

  describe('createDocumentState', () => {
    it('builds a state from a markdown document with cursor default null', async () => {
      const { createDocumentState } = await import('@/store/help')
      const state = createDocumentState({
        markdown: '# m',
        filename: 'd.md',
        pathname: '/d.md',
        encoding: { encoding: 'utf8', isBom: false },
        lineEnding: 'lf',
        adjustLineEndingOnSave: false,
        trimTrailingNewline: 1
      })
      expect(state.markdown).toBe('# m')
      expect(state.cursor).toBeNull()
      expect(state.id).toBeDefined()
      expect((state as any).lastSavedHistoryId).toBe(-1)
    })

    it('honors provided id', async () => {
      const { createDocumentState } = await import('@/store/help')
      const state = createDocumentState(
        {
          markdown: '',
          filename: 'x',
          pathname: '/x',
          encoding: { encoding: 'utf8', isBom: false },
          lineEnding: 'lf',
          adjustLineEndingOnSave: false,
          trimTrailingNewline: 1
        },
        'preset-id'
      )
      expect(state.id).toBe('preset-id')
    })

    it('preserves explicit cursor', async () => {
      const { createDocumentState } = await import('@/store/help')
      const cursor = { anchor: { line: 1, ch: 0 }, head: { line: 1, ch: 5 } }
      const state = createDocumentState({
        markdown: 'a',
        filename: 'a',
        pathname: '/a',
        encoding: { encoding: 'utf8', isBom: false },
        lineEnding: 'lf',
        adjustLineEndingOnSave: false,
        trimTrailingNewline: 1,
        cursor
      } as any)
      expect(state.cursor).toEqual(cursor)
    })

    it('does not mutate defaultFileState', async () => {
      const { createDocumentState, defaultFileState } = await import('@/store/help')
      const state = createDocumentState({
        markdown: '',
        filename: '',
        pathname: '',
        encoding: { encoding: 'utf8', isBom: false },
        lineEnding: 'lf',
        adjustLineEndingOnSave: false,
        trimTrailingNewline: 1
      })
      state.history.stack.push({ x: 1 } as any)
      expect(defaultFileState.history.stack.length).toBe(0)
    })
  })
})
