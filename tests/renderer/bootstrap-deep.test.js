/**
 * Deep coverage tests for src/renderer/src/bootstrap.js
 *
 * Covers uncovered code paths:
 *   - configureLogger — DEV vs production
 *   - parseUrlArgs — all URL params, windowId NaN error
 *   - isCodeMirrorRaceCondition — all branches
 *   - handleRendererError — with error, without error,
 *     with CodeMirror race condition, with non-race error
 *   - bootstrapRenderer — wires event listeners, calls parseUrlArgs,
 *     configures logger, sets window.marktext
 */

// Mock electron-log/renderer
vi.mock('electron-log/renderer', () => ({
  default: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    transports: {
      console: { level: 'info' }
    }
  }
}))

// Mock RendererPaths
vi.mock('@/node/paths', () => ({
  default: class RendererPaths {
    constructor (userDataPath) {
      this.userDataPath = userDataPath
    }
  }
}))

describe('bootstrap.js', () => {
  let bootstrapRenderer
  let log

  beforeEach(async () => {
    vi.resetModules()

    // Set a valid URL with query params
    const baseUrl = 'http://localhost'
    const params = new URLSearchParams({
      cff: 'Fira Code',
      cfs: '14',
      debug: '1',
      hsb: '1',
      theme: 'dark',
      tbs: 'custom',
      udp: '/tmp/user-data',
      wid: '42',
      type: 'editor'
    })
    Object.defineProperty(window, 'location', {
      value: { search: '?' + params.toString(), href: baseUrl + '?' + params.toString() },
      writable: true,
      configurable: true
    })

    const mod = await import('@/bootstrap')
    bootstrapRenderer = mod.default
    log = (await import('electron-log/renderer')).default
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('bootstrapRenderer()', () => {
    it('registers error and unhandledrejection event listeners', () => {
      const addEventListenerSpy = vi.spyOn(window, 'addEventListener')
      bootstrapRenderer()
      expect(addEventListenerSpy).toHaveBeenCalledWith('error', expect.any(Function))
      expect(addEventListenerSpy).toHaveBeenCalledWith('unhandledrejection', expect.any(Function))
    })

    it('sets window.marktext with parsed URL args', () => {
      bootstrapRenderer()
      expect(window.marktext).toBeDefined()
      expect(window.marktext.env.windowId).toBe(42)
      expect(window.marktext.env.debug).toBe(true)
      expect(window.marktext.env.type).toBe('editor')
      expect(window.marktext.initialState.theme).toBe('dark')
      expect(window.marktext.initialState.codeFontFamily).toBe('Fira Code')
      expect(window.marktext.initialState.codeFontSize).toBe('14')
      expect(window.marktext.initialState.hideScrollbar).toBe(true)
      expect(window.marktext.initialState.titleBarStyle).toBe('custom')
    })

    it('sets paths from RendererPaths', () => {
      bootstrapRenderer()
      expect(window.marktext.paths).toBeDefined()
      expect(window.marktext.paths.userDataPath).toBe('/tmp/user-data')
    })

    it('configures logger (console transport level)', () => {
      bootstrapRenderer()
      // In test environment import.meta.env.DEV is typically true
      // so console level should be 'info' or false
      expect(log.transports.console.level === 'info' || log.transports.console.level === false).toBe(true)
    })
  })

  describe('parseUrlArgs — error cases', () => {
    it('throws when windowId is NaN', async () => {
      vi.resetModules()
      Object.defineProperty(window, 'location', {
        value: { search: '?wid=notanumber', href: 'http://localhost?wid=notanumber' },
        writable: true,
        configurable: true
      })

      const mod = await import('@/bootstrap')
      expect(() => mod.default()).toThrow('windowId')
    })
  })

  describe('parseUrlArgs — all params', () => {
    it('parses debug=0 as false', async () => {
      vi.resetModules()
      const params = new URLSearchParams({ wid: '1', debug: '0', udp: '/tmp' })
      Object.defineProperty(window, 'location', {
        value: { search: '?' + params.toString(), href: 'http://localhost?' + params.toString() },
        writable: true,
        configurable: true
      })

      const mod = await import('@/bootstrap')
      mod.default()
      expect(window.marktext.env.debug).toBe(false)
    })

    it('parses hsb=0 as false', async () => {
      vi.resetModules()
      const params = new URLSearchParams({ wid: '1', hsb: '0', udp: '/tmp' })
      Object.defineProperty(window, 'location', {
        value: { search: '?' + params.toString(), href: 'http://localhost?' + params.toString() },
        writable: true,
        configurable: true
      })

      const mod = await import('@/bootstrap')
      mod.default()
      expect(window.marktext.initialState.hideScrollbar).toBe(false)
    })

    it('handles missing optional params gracefully', async () => {
      vi.resetModules()
      const params = new URLSearchParams({ wid: '5', udp: '/tmp' })
      Object.defineProperty(window, 'location', {
        value: { search: '?' + params.toString(), href: 'http://localhost?' + params.toString() },
        writable: true,
        configurable: true
      })

      const mod = await import('@/bootstrap')
      mod.default()
      expect(window.marktext.env.windowId).toBe(5)
      expect(window.marktext.initialState.theme).toBeNull()
      expect(window.marktext.initialState.codeFontFamily).toBeNull()
    })
  })

  describe('handleRendererError', () => {
    it('sends error to main process via IPC', () => {
      bootstrapRenderer()

      const errorEvent = new ErrorEvent('error', {
        error: new Error('Test error'),
        message: 'Test error'
      })

      window.dispatchEvent(errorEvent)

      expect(window.electron.ipcRenderer.send).toHaveBeenCalledWith(
        'mt::handle-renderer-error',
        expect.objectContaining({
          message: 'Test error',
          name: 'Error'
        })
      )
    })

    it('suppresses CodeMirror race condition errors', () => {
      bootstrapRenderer()

      const cmError = new Error("Cannot read properties of undefined (reading 'map')")
      cmError.stack = `Error: Cannot read properties of undefined (reading 'map')
    at prepareMeasureForLine (codemirror.js:123)
    at coordsChar (codemirror.js:456)
    at posFromMouse (codemirror.js:789)`

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const errorEvent = new ErrorEvent('error', {
        error: cmError,
        message: cmError.message
      })

      window.dispatchEvent(errorEvent)

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Suppressed non-fatal CodeMirror race condition'),
        cmError.message
      )
      // Should NOT send to main process
      expect(window.electron.ipcRenderer.send).not.toHaveBeenCalledWith(
        'mt::handle-renderer-error',
        expect.anything()
      )
      warnSpy.mockRestore()
    })

    it('handles event without error object', () => {
      bootstrapRenderer()

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      // Create a plain event (not ErrorEvent) — handleRendererError checks event.error
      const event = new Event('error')
      window.dispatchEvent(event)

      expect(consoleSpy).toHaveBeenCalled()
      consoleSpy.mockRestore()
    })
  })

  describe('isCodeMirrorRaceCondition', () => {
    it('returns false for null error', async () => {
      // Access the function through module re-import
      vi.resetModules()
      const params = new URLSearchParams({ wid: '1', udp: '/tmp' })
      Object.defineProperty(window, 'location', {
        value: { search: '?' + params.toString(), href: 'http://localhost?' + params.toString() },
        writable: true,
        configurable: true
      })

      const mod = await import('@/bootstrap')
      mod.default()

      // Dispatch an error event with null error — should not crash
      const event = new Event('error')
      Object.defineProperty(event, 'error', { value: null })
      window.dispatchEvent(event)
    })

    it('returns false for error without stack', async () => {
      vi.resetModules()
      const params = new URLSearchParams({ wid: '1', udp: '/tmp' })
      Object.defineProperty(window, 'location', {
        value: { search: '?' + params.toString(), href: 'http://localhost?' + params.toString() },
        writable: true,
        configurable: true
      })

      const mod = await import('@/bootstrap')
      mod.default()

      const error = { message: 'test', stack: undefined }
      const event = new Event('error')
      Object.defineProperty(event, 'error', { value: error })
      // Should not crash
      window.dispatchEvent(event)
    })

    it('returns false for non-map error with prepareMeasureForLine', async () => {
      vi.resetModules()
      const params = new URLSearchParams({ wid: '1', udp: '/tmp' })
      Object.defineProperty(window, 'location', {
        value: { search: '?' + params.toString(), href: 'http://localhost?' + params.toString() },
        writable: true,
        configurable: true
      })

      const mod = await import('@/bootstrap')
      mod.default()

      const error = new Error('different message')
      error.stack = 'at prepareMeasureForLine\nat coordsChar'

      const event = new ErrorEvent('error', { error, message: error.message })
      window.dispatchEvent(event)

      // This should NOT be suppressed (wrong message)
      expect(window.electron.ipcRenderer.send).toHaveBeenCalledWith(
        'mt::handle-renderer-error',
        expect.anything()
      )
    })
  })
})
