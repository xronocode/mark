/**
 * Vitest global setup — renderer test harness.
 *
 * USAGE PATTERN FOR PHASE-4 TEST AUTHORS
 * =======================================
 *
 * 1. Module-level mocks below intercept the three Tauri API surfaces
 *    (`@tauri-apps/api/core`, `@tauri-apps/api/event`,
 *    `@tauri-apps/api/window`). Any renderer code-under-test that imports
 *    these gets the mock automatically. To control return values per
 *    test, import the mocked symbol and use `.mockResolvedValueOnce(...)`:
 *
 *      import { invoke } from '@tauri-apps/api/core'
 *      ...
 *      ;(invoke as any).mockResolvedValueOnce({ data: 42 })
 *
 * 2. Window-shim globals (window.fileUtils / window.path / window.electron
 *    / window.marktext / window.commandExists / window.i18nUtils /
 *    window.rgPath) are installed before EACH test by `installWindowGlobals`,
 *    invoked from the global `beforeEach`. Tests don't have to call
 *    anything to get them. Override per-test by re-assigning fields:
 *
 *      ;(window.fileUtils.readFile as any).mockResolvedValueOnce('content')
 *
 * 3. Pinia: each test that needs a store should call `setupTestPinia()`
 *    in its own `beforeEach` to get a fresh Pinia instance. The helper
 *    is exported from this file (re-export through `tests/renderer/pinia.ts`
 *    for convenience).
 *
 * 4. After each test all mocks are reset (`vi.resetAllMocks()`) so state
 *    doesn't leak between cases. Window globals are re-installed fresh
 *    on the next `beforeEach`.
 *
 * KNOWN PITFALLS (Phase-4 agents read these)
 * ==========================================
 *
 *   - Stores that import `mitt` event bus (`../bus`) require an
 *     additional `vi.mock('@/bus', ...)` per test file — bus is a
 *     module-level singleton that leaks listener state across tests.
 *
 *   - Element Plus components (`el-button`, `el-dialog`, etc.) need
 *     stubbing via `@vue/test-utils` `mount({ global: { stubs: {...} }})`
 *     for component-level tests. Don't try to actually render them —
 *     they trigger DOM-injection animations that hang jsdom.
 *
 *   - The editor store (`store/editor.js`) is huge (49KB) and pulls in
 *     muya. Prefer mocking `muya` imports rather than letting the real
 *     module load in tests.
 *
 *   - `i18n/index.js` calls `createI18n` at module top-level and
 *     synchronously imports the EN locale JSON. That works in jsdom but
 *     is slow (~50ms per test file that imports it). Cache the i18n
 *     instance in your fixtures rather than re-importing in many files.
 */

import { vi, beforeEach, afterEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

// ─── @tauri-apps/api/core ──────────────────────────────────────────
vi.mock('@tauri-apps/api/core', () => {
  return {
    invoke: vi.fn(async (_cmd: string, _args?: unknown) => undefined),
    convertFileSrc: vi.fn((p: string) => p)
  }
})

// ─── @tauri-apps/api/event ─────────────────────────────────────────
vi.mock('@tauri-apps/api/event', () => {
  return {
    listen: vi.fn(async (_channel: string, _handler: (...a: unknown[]) => void) => {
      // Returns unlisten dispose — no-op in tests by default.
      return () => {}
    }),
    once: vi.fn(async (_channel: string, _handler: (...a: unknown[]) => void) => {
      return () => {}
    }),
    emit: vi.fn(async (_channel: string, _payload?: unknown) => undefined),
    emitTo: vi.fn(async (_target: unknown, _channel: string, _payload?: unknown) => undefined),
    TauriEvent: {}
  }
})

// ─── @tauri-apps/api/window ────────────────────────────────────────
vi.mock('@tauri-apps/api/window', () => {
  const stubWindow = {
    label: 'main',
    minimize: vi.fn(async () => {}),
    maximize: vi.fn(async () => {}),
    unmaximize: vi.fn(async () => {}),
    toggleMaximize: vi.fn(async () => {}),
    setFullscreen: vi.fn(async (_v: boolean) => {}),
    isFullscreen: vi.fn(async () => false),
    isMaximized: vi.fn(async () => false),
    close: vi.fn(async () => {}),
    hide: vi.fn(async () => {}),
    show: vi.fn(async () => {}),
    setSize: vi.fn(async () => {}),
    outerSize: vi.fn(async () => ({ width: 1280, height: 800 })),
    innerSize: vi.fn(async () => ({ width: 1280, height: 800 })),
    setTitle: vi.fn(async () => {}),
    onResized: vi.fn(async () => () => {}),
    onCloseRequested: vi.fn(async () => () => {})
  }
  return {
    getCurrentWindow: vi.fn(() => stubWindow),
    getCurrent: vi.fn(() => stubWindow),
    Window: class {},
    LogicalSize: class {
      width: number
      height: number
      constructor(w: number, h: number) {
        this.width = w
        this.height = h
      }
    },
    PhysicalSize: class {
      width: number
      height: number
      constructor(w: number, h: number) {
        this.width = w
        this.height = h
      }
    }
  }
})

// ─── @tauri-apps/api/path ──────────────────────────────────────────
// Used by install-window-globals + a few stores indirectly.
vi.mock('@tauri-apps/api/path', () => {
  return {
    appLocalDataDir: vi.fn(async () => '/tmp/mt-test'),
    appConfigDir: vi.fn(async () => '/tmp/mt-test/config'),
    appDataDir: vi.fn(async () => '/tmp/mt-test/data'),
    homeDir: vi.fn(async () => '/tmp/home'),
    tempDir: vi.fn(async () => '/tmp'),
    join: vi.fn(async (...parts: string[]) => parts.join('/')),
    resolve: vi.fn(async (...parts: string[]) => '/' + parts.join('/').replace(/^\/+/, ''))
  }
})

// ─── @tauri-apps/api/webview ───────────────────────────────────────
vi.mock('@tauri-apps/api/webview', () => {
  const stubWebview = {
    label: 'main',
    onDragDropEvent: vi.fn(async () => () => {})
  }
  return {
    getCurrentWebview: vi.fn(() => stubWebview)
  }
})

// ─── window.* shim helper ──────────────────────────────────────────
/**
 * Install the v1.2.3 window.* contextBridge surface as plain stubs.
 * Mirrors `_shims/install-window-globals.js` in shape only — actual
 * impls are `vi.fn()` so tests can assert call counts / args, or
 * override return values per case via `.mockResolvedValueOnce(...)`.
 */
export function installWindowGlobals() {
  const w = globalThis.window as unknown as Record<string, unknown>

  w.fileUtils = {
    hasMarkdownExtension: vi.fn((p: string) => /\.(md|markdown|mmd|mkd|mkdn|mdown|mdtxt|mdtext|mdx|text|txt)$/i.test(p)),
    isImageFile: vi.fn((p: string) => /\.(jpe?g|png|gif|svg|webp|bmp|ico|tiff?)$/i.test(p)),
    isChildOfDirectory: vi.fn((parent: string, child: string) => {
      const p = parent.replace(/\/$/, '') + '/'
      return child.startsWith(p)
    }),
    isSamePathSync: vi.fn((a: string, b: string) => a === b),
    MARKDOWN_INCLUSIONS: Object.freeze(['*.md', '*.markdown']),
    readFile: vi.fn(async (_p: string) => ''),
    writeFile: vi.fn(async (_p: string, _data: string) => undefined),
    outputFile: vi.fn(async (_p: string, _data: string) => undefined),
    readdir: vi.fn(async (_p: string) => []),
    stat: vi.fn(async (_p: string) => ({ isFile: true, isDirectory: false, size: 0 })),
    unlink: vi.fn(async (_p: string) => undefined),
    isFile: vi.fn(async (_p: string) => true),
    isDirectory: vi.fn(async (_p: string) => false),
    pathExistsSync: vi.fn(() => false),
    ensureDirSync: vi.fn(() => {}),
    ensureDir: vi.fn(async (_p: string) => undefined),
    copy: vi.fn(async (_a: string, _b: string) => undefined),
    move: vi.fn(async (_a: string, _b: string) => undefined),
    emptyDir: vi.fn(async (_p: string) => undefined)
  }

  w.path = {
    basename: vi.fn((p: string) => p.split('/').pop() ?? ''),
    dirname: vi.fn((p: string) => {
      const idx = p.lastIndexOf('/')
      if (idx <= 0) return '/'
      return p.slice(0, idx)
    }),
    extname: vi.fn((p: string) => {
      const base = p.split('/').pop() ?? ''
      const idx = base.lastIndexOf('.')
      return idx <= 0 ? '' : base.slice(idx)
    }),
    join: vi.fn((...parts: string[]) => parts.join('/').replace(/\/+/g, '/')),
    resolve: vi.fn((...parts: string[]) => '/' + parts.join('/').replace(/^\/+/, '')),
    normalize: vi.fn((p: string) => p.replace(/\/+/g, '/')),
    relative: vi.fn((from: string, to: string) => {
      if (to.startsWith(from)) return to.slice(from.length).replace(/^\/+/, '')
      return to
    }),
    isAbsolute: vi.fn((p: string) => p.startsWith('/')),
    sep: '/',
    delimiter: ':'
  }

  w.electron = {
    ipcRenderer: {
      send: vi.fn(),
      invoke: vi.fn(async () => undefined),
      on: vi.fn(() => () => {}),
      once: vi.fn(() => () => {}),
      removeListener: vi.fn(),
      removeAllListeners: vi.fn()
    },
    shell: {
      openExternal: vi.fn(async (_url: string) => undefined),
      openPath: vi.fn(async (_p: string) => undefined),
      showItemInFolder: vi.fn(async (_p: string) => undefined)
    },
    clipboard: {
      readText: vi.fn(async () => ''),
      writeText: vi.fn(async (_t: string) => undefined),
      read: vi.fn(async () => []),
      write: vi.fn(async () => undefined)
    },
    process: {
      platform: 'darwin',
      versions: { node: '0.0.0', electron: '0.0.0', chrome: '', v8: '' },
      env: {}
    },
    fonts: { list: vi.fn(async () => []) },
    webFrame: {
      setZoomLevel: vi.fn(),
      getZoomLevel: vi.fn(() => 0),
      setZoomFactor: vi.fn(),
      getZoomFactor: vi.fn(() => 1)
    },
    webUtils: { getPathForFile: vi.fn(() => '') },
    resourcesPath: '',
    tmpDir: '/tmp'
  }

  w.commandExists = { exists: vi.fn(async (_cmd: string) => false) }
  w.i18nUtils = { loadTranslations: vi.fn(async (_locale: string) => ({})) }
  w.rgPath = '/ipc-routed/rg'
  w.marktext = { env: { type: 'editor', windowId: 1, debug: false, paths: { userDataPath: '/tmp/mt-test' } } }
}

/**
 * Create + activate a fresh Pinia instance for the current test.
 * Phase-4 tests should call this in their own `beforeEach` so each test
 * gets isolated store state.
 */
export function setupTestPinia() {
  const pinia = createPinia()
  setActivePinia(pinia)
  return pinia
}

// ─── lifecycle hooks ──────────────────────────────────────────────
beforeEach(() => {
  installWindowGlobals()
})

afterEach(() => {
  vi.resetAllMocks()
})
