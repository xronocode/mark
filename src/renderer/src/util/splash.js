export const dismountSplash = () => {
  if (window.__SPLASH_REPLACED__) {
    return false
  }
  const root = document.getElementById('splash-root')
  if (!root) {
    window.__SPLASH_REPLACED__ = true
    return false
  }
  root.setAttribute('aria-hidden', 'true')
  root.remove()
  window.__SPLASH_REPLACED__ = true
  if (window.__SPLASH_WATCHDOG__) {
    clearTimeout(window.__SPLASH_WATCHDOG__)
    window.__SPLASH_WATCHDOG__ = null
  }
  console.log('[boot][splash] BLOCK_REPLACED', performance.now())
  return true
}
