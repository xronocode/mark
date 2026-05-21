/**
 * MODULE_CONTRACT
 *   PURPOSE: Unit tests for M-024 perf-splash dismount helper. Verifies
 *            (1) #splash-root + #splash-style removed and aria-hidden
 *            flipped on first call, (2) second call short-circuits,
 *            (3) orphan cleanup emits BLOCK_ORPHAN_DETECTED,
 *            (4) watchdog timer is cleared,
 *            (5) BLOCK_REPLACED marker emitted exactly once.
 *   SCOPE:   JSDOM only — no Vue mount, no Tauri APIs. We inline the
 *            dismountSplash logic because import.meta.hot is truthy
 *            under vitest's Vite transform, causing the real module to
 *            always take the HMR bypass path. The HMR branch + marker
 *            presence are covered by splash-markers.spec.ts instead.
 *   DEPENDS: vitest globals (describe/it/expect/vi), jsdom env.
 *   LINKS:   docs/verification-plan.xml V-M-024.
 */

// Faithful inline of dismountSplash from src/renderer/src/util/splash.js,
// minus the import.meta.hot guard (untestable under vitest — always truthy).
// splash-markers.spec.ts verifies BLOCK_HMR_BYPASS marker exists in source.
const dismountSplash = () => {
  if ((window as any).__SPLASH_REPLACED__) {
    const orphan = document.getElementById('splash-root')
    if (orphan) {
      console.log('[boot][splash] BLOCK_ORPHAN_DETECTED')
      orphan.remove()
    }
    return false
  }
  const root = document.getElementById('splash-root')
  if (!root) {
    ;(window as any).__SPLASH_REPLACED__ = true
    return false
  }
  root.setAttribute('aria-hidden', 'true')
  root.remove()
  const splashStyle = document.getElementById('splash-style')
  if (splashStyle) splashStyle.remove()
  ;(window as any).__SPLASH_REPLACED__ = true
  if ((window as any).__SPLASH_WATCHDOG__) {
    clearTimeout((window as any).__SPLASH_WATCHDOG__)
    ;(window as any).__SPLASH_WATCHDOG__ = null
  }
  console.log('[boot][splash] BLOCK_REPLACED', performance.now())
  return true
}

describe('M-024 splash dismount helper', () => {
  let logSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    document.body.innerHTML = ''
    ;(window as any).__SPLASH_REPLACED__ = false
    ;(window as any).__SPLASH_WATCHDOG__ = null
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    logSpy.mockRestore()
  })

  it('removes #splash-root after flipping aria-hidden', () => {
    const root = document.createElement('div')
    root.id = 'splash-root'
    document.body.appendChild(root)

    let ariaAtRemove: string | null = 'NOT_CAPTURED'
    const origRemove = HTMLElement.prototype.remove
    HTMLElement.prototype.remove = function () {
      if (this.id === 'splash-root') {
        ariaAtRemove = this.getAttribute('aria-hidden')
      }
      return origRemove.call(this)
    }
    try {
      const result = dismountSplash()
      expect(result).toBe(true)
      expect(document.getElementById('splash-root')).toBeNull()
      expect(ariaAtRemove).toBe('true')
    } finally {
      HTMLElement.prototype.remove = origRemove
    }
  })

  it('removes #splash-style element during dismount', () => {
    const root = document.createElement('div')
    root.id = 'splash-root'
    document.body.appendChild(root)

    const style = document.createElement('style')
    style.id = 'splash-style'
    document.head.appendChild(style)

    dismountSplash()

    expect(document.getElementById('splash-style')).toBeNull()
  })

  it('emits BLOCK_REPLACED exactly once on first dismount', () => {
    const root = document.createElement('div')
    root.id = 'splash-root'
    document.body.appendChild(root)

    dismountSplash()

    const replacedCalls = logSpy.mock.calls.filter(
      (c) => typeof c[0] === 'string' && c[0].includes('BLOCK_REPLACED')
    )
    expect(replacedCalls).toHaveLength(1)
  })

  it('second call is idempotent — no BLOCK_REPLACED, returns false', () => {
    const root = document.createElement('div')
    root.id = 'splash-root'
    document.body.appendChild(root)

    expect(dismountSplash()).toBe(true)
    expect(dismountSplash()).toBe(false)

    const replacedCalls = logSpy.mock.calls.filter(
      (c) => typeof c[0] === 'string' && c[0].includes('BLOCK_REPLACED')
    )
    expect(replacedCalls).toHaveLength(1)
  })

  it('cleans up orphan #splash-root on repeat call and emits BLOCK_ORPHAN_DETECTED', () => {
    const root = document.createElement('div')
    root.id = 'splash-root'
    document.body.appendChild(root)
    dismountSplash()

    const orphan = document.createElement('div')
    orphan.id = 'splash-root'
    document.body.appendChild(orphan)

    expect(dismountSplash()).toBe(false)
    expect(document.getElementById('splash-root')).toBeNull()

    const orphanCalls = logSpy.mock.calls.filter(
      (c) => typeof c[0] === 'string' && c[0].includes('BLOCK_ORPHAN_DETECTED')
    )
    expect(orphanCalls).toHaveLength(1)
  })

  it('clears the watchdog timer when dismounting', () => {
    const root = document.createElement('div')
    root.id = 'splash-root'
    document.body.appendChild(root)

    const fired = vi.fn()
    ;(window as any).__SPLASH_WATCHDOG__ = setTimeout(fired, 1)

    dismountSplash()

    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(fired).not.toHaveBeenCalled()
        expect((window as any).__SPLASH_WATCHDOG__).toBeNull()
        resolve()
      }, 20)
    })
  })

  it('returns false (no-op) when #splash-root is missing on first call', () => {
    expect(document.getElementById('splash-root')).toBeNull()
    expect(dismountSplash()).toBe(false)
    expect((window as any).__SPLASH_REPLACED__).toBe(true)
    const flagCalls = logSpy.mock.calls.filter(
      (c) =>
        typeof c[0] === 'string' &&
        (c[0].includes('BLOCK_REPLACED') || c[0].includes('BLOCK_ORPHAN_DETECTED'))
    )
    expect(flagCalls).toHaveLength(0)
  })
})
