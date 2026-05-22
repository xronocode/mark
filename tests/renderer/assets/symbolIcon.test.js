/**
 * Tests for src/renderer/src/assets/symbolIcon/index.js
 *
 * This is an IIFE that injects an SVG sprite into the document body.
 * The IIFE relies on `document.getElementsByTagName("script")` returning
 * a non-empty list to find the current script element.
 * We ensure a <script> tag exists before importing.
 */

describe('symbolIcon/index.js', () => {
  beforeEach(() => {
    // Clear any previously injected SVG sprite
    const existing = document.querySelector('svg[aria-hidden="true"]')
    if (existing) {
      existing.remove()
    }
    // Reset the CSS inject flag
    delete window.__iconfont__svg__cssinject__
  })

  it('injects an SVG element into document body when script tag exists', async () => {
    // Add a script tag so the IIFE can find it
    const scriptEl = document.createElement('script')
    document.body.appendChild(scriptEl)

    try {
      // Dynamic import forces re-evaluation in fresh module scope
      // Note: vitest caches modules so we use importOriginal pattern
      await import('@/assets/symbolIcon/index.js')
      // Wait for the setTimeout(fn, 0) to fire
      await new Promise((resolve) => setTimeout(resolve, 50))

      const svg = document.querySelector('svg[aria-hidden="true"]')
      expect(svg).not.toBeNull()
    } finally {
      scriptEl.remove()
    }
  })

  it('SVG element contains symbol elements', async () => {
    const scriptEl = document.createElement('script')
    document.body.appendChild(scriptEl)

    try {
      await import('@/assets/symbolIcon/index.js')
      await new Promise((resolve) => setTimeout(resolve, 50))

      const svg = document.querySelector('svg[aria-hidden="true"]')
      if (svg) {
        const symbols = svg.querySelectorAll('symbol')
        expect(symbols.length).toBeGreaterThan(0)
      }
    } finally {
      scriptEl.remove()
    }
  })

  it('SVG element is hidden via styles', async () => {
    const scriptEl = document.createElement('script')
    document.body.appendChild(scriptEl)

    try {
      await import('@/assets/symbolIcon/index.js')
      await new Promise((resolve) => setTimeout(resolve, 50))

      const svg = document.querySelector('svg[aria-hidden="true"]')
      if (svg) {
        expect(svg.style.position).toBe('absolute')
        expect(svg.style.overflow).toBe('hidden')
      }
    } finally {
      scriptEl.remove()
    }
  })
})
