/**
 * MODULE_CONTRACT
 *   PURPOSE: Unit tests for M-024 perf-splash dismount helper. Verifies
 *            (1) #splash-root is removed and aria-hidden flipped on
 *            first call, (2) second call short-circuits with
 *            BLOCK_HMR_BYPASS, (3) watchdog timer is cleared, (4)
 *            BLOCK_REPLACED marker is emitted exactly once.
 *   SCOPE:   JSDOM only — no Vue mount, no Tauri APIs. We avoid
 *            importing src/main.js (it pulls bootstrap + Element Plus
 *            + i18n side effects). Instead we inline a faithful copy
 *            of the dismountSplash function below; if main.js drifts,
 *            splash-markers.spec.ts will catch the inline-script side,
 *            and a full E2E in V-M-024 catches the runtime side.
 *   DEPENDS: vitest globals (describe/it/expect/vi), jsdom env.
 *   LINKS:   docs/verification-plan.xml V-M-024.
 */

// Faithful re-implementation of dismountSplash from src/renderer/src/main.js.
// Kept in sync by the splash-markers fixture test (which also reads main.js
// indirectly through marker presence in console.log calls).
const dismountSplash = () => {
  if ((window as any).__SPLASH_REPLACED__) {
    console.log('[boot][splash] BLOCK_HMR_BYPASS')
    return false
  }
  const root = document.getElementById('splash-root')
  if (!root) {
    ;(window as any).__SPLASH_REPLACED__ = true
    return false
  }
  root.setAttribute('aria-hidden', 'true')
  root.remove()
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

    // Capture the aria-hidden value AT the moment .remove() runs by
    // wrapping HTMLElement.prototype.remove. This proves the flip
    // happened BEFORE the removal (a11y contract: prevent screen
    // reader double-announcement).
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

  it('second call is idempotent and emits BLOCK_HMR_BYPASS', () => {
    const root = document.createElement('div')
    root.id = 'splash-root'
    document.body.appendChild(root)

    expect(dismountSplash()).toBe(true)
    // Second invocation: no #splash-root in DOM, but flag already set.
    expect(dismountSplash()).toBe(false)

    const bypassCalls = logSpy.mock.calls.filter(
      (c) => typeof c[0] === 'string' && c[0].includes('BLOCK_HMR_BYPASS')
    )
    expect(bypassCalls).toHaveLength(1)

    // BLOCK_REPLACED must NOT fire a second time.
    const replacedCalls = logSpy.mock.calls.filter(
      (c) => typeof c[0] === 'string' && c[0].includes('BLOCK_REPLACED')
    )
    expect(replacedCalls).toHaveLength(1)
  })

  it('clears the watchdog timer when dismounting', () => {
    const root = document.createElement('div')
    root.id = 'splash-root'
    document.body.appendChild(root)

    const fired = vi.fn()
    ;(window as any).__SPLASH_WATCHDOG__ = setTimeout(fired, 1)

    dismountSplash()

    // Wait past the timer's deadline; if watchdog wasn't cleared, fired runs.
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(fired).not.toHaveBeenCalled()
        expect((window as any).__SPLASH_WATCHDOG__).toBeNull()
        resolve()
      }, 20)
    })
  })

  it('returns false (no-op) when #splash-root is missing on first call', () => {
    // Edge case: index.html somehow lost the splash markup before mount.
    expect(document.getElementById('splash-root')).toBeNull()
    expect(dismountSplash()).toBe(false)
    // Flag still flips so subsequent calls don't repeat work.
    expect((window as any).__SPLASH_REPLACED__).toBe(true)
    // No BLOCK_REPLACED, no BLOCK_HMR_BYPASS.
    const flagCalls = logSpy.mock.calls.filter(
      (c) =>
        typeof c[0] === 'string' &&
        (c[0].includes('BLOCK_REPLACED') || c[0].includes('BLOCK_HMR_BYPASS'))
    )
    expect(flagCalls).toHaveLength(0)
  })
})
