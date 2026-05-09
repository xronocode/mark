/**
 * Phase-4 Wave-2 (agent 1): unit tests for `store/index.js` (useMainStore).
 *
 * The main store is small (4 state fields, 2 actions, 0 getters) so this
 * file is short. We assert:
 *   - state initialization pulls from window.electron.process.{platform,
 *     env.MARKTEXT_VERSION_STRING}.
 *   - SET_WIN_STATUS(status) flips windowActive.
 *   - SET_INITIALIZED() flips init from false → true (one-shot).
 *   - createPinia default export shape.
 */

import { setupTestPinia } from '../pinia'

describe('store/index (main store)', () => {
  beforeEach(() => {
    // Reset the env-string before activation so initial state reads
    // the value our test expects.
    ;(window as any).electron.process.platform = 'darwin'
    ;(window as any).electron.process.env.MARKTEXT_VERSION_STRING = '1.2.3-test'
    setupTestPinia()
    vi.resetModules()
  })

  it('initialises state from window.electron.process', async () => {
    const { useMainStore } = await import('@/store/index')
    const main = useMainStore()
    expect(main.platform).toBe('darwin')
    expect(main.appVersion).toBe('1.2.3-test')
    expect(main.windowActive).toBe(true)
    expect(main.init).toBe(false)
  })

  it('SET_WIN_STATUS toggles windowActive', async () => {
    const { useMainStore } = await import('@/store/index')
    const main = useMainStore()
    main.SET_WIN_STATUS(false)
    expect(main.windowActive).toBe(false)
    main.SET_WIN_STATUS(true)
    expect(main.windowActive).toBe(true)
  })

  it('SET_INITIALIZED flips init flag to true', async () => {
    const { useMainStore } = await import('@/store/index')
    const main = useMainStore()
    expect(main.init).toBe(false)
    main.SET_INITIALIZED()
    expect(main.init).toBe(true)
    // Idempotent: second call leaves it true.
    main.SET_INITIALIZED()
    expect(main.init).toBe(true)
  })

  it('default export is a Pinia instance', async () => {
    const mod = await import('@/store/index')
    const pinia = (mod as any).default
    // Pinia instance shape: has install + state + _s.
    expect(pinia).toBeDefined()
    expect(typeof pinia.install).toBe('function')
  })
})
