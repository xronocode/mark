/**
 * Smoke test — proves the Phase-3 vitest harness works end-to-end.
 *
 * What this verifies:
 *   1. vitest can run TS test files (tsx/jsx-free).
 *   2. Vue 3 + Pinia load under jsdom.
 *   3. Module-resolution aliases (`@/` → src/renderer/src) work.
 *   4. `@tauri-apps/api/*` mocks installed by setup.ts intercept imports
 *      (notification store's transitive deps must NOT touch real Tauri).
 *   5. `window.electron` shim is present (notification store touches it
 *      indirectly via `notice.notify`).
 *
 * Phase-4 will replace this file with real per-store unit tests.
 */

import { setupTestPinia } from '../pinia'

// Mock the notification SERVICE singleton — pulling in index.css + DOMPurify
// would slow this smoke test down ~100ms and isn't what we're testing here.
vi.mock('@/services/notification', () => ({
  default: {
    notify: vi.fn(async (_opts: unknown) => undefined)
  }
}))

// Mock i18n so the store doesn't try to load the EN locale JSON (~2k keys).
vi.mock('@/i18n', () => ({
  t: (key: string) => key
}))

describe('smoke: store pipeline', () => {
  beforeEach(() => {
    setupTestPinia()
  })

  it('useNotificationStore is constructable and exposes SHOW_NOTIFICATION', async () => {
    // Late import so the per-test pinia is active before defineStore runs.
    const { useNotificationStore } = await import('@/store/notification')
    const store = useNotificationStore()

    expect(store).toBeDefined()
    expect(store.$id).toBe('notification')
    expect(typeof store.SHOW_NOTIFICATION).toBe('function')
    expect(typeof store.SHOW_PANDOC_MISSING).toBe('function')
  })

  it('window.* shim globals are installed by setup.ts', () => {
    expect(window.fileUtils).toBeDefined()
    expect(typeof window.fileUtils.hasMarkdownExtension).toBe('function')
    expect(window.fileUtils.hasMarkdownExtension('foo.md')).toBe(true)
    expect(window.fileUtils.hasMarkdownExtension('foo.png')).toBe(false)

    expect(window.electron).toBeDefined()
    expect(typeof window.electron.shell.openExternal).toBe('function')

    expect(window.path).toBeDefined()
    expect(window.path.basename('/a/b/c.md')).toBe('c.md')
  })
})
