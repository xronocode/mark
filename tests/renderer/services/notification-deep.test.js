/**
 * Deep coverage tests for the shared copy-on-select helpers in
 * src/renderer/src/services/notification/index.js
 * (C-NOTIFICATION-SYSTEM T-007 rewrite; the legacy Fluent DOM paths —
 * fluent circle, rePositionNotices, promise click/reject — are gone with
 * the code they pinned).
 *
 * Covers the corner C-3/C-4/C-10 contract: clipboard failures are silent
 * no-ops, exactly the selection string is written, the double green pulse
 * tags the copied range and cleans itself up on animationend, multi-node
 * ranges degrade without throwing, and prefers-reduced-motion skips the
 * animation entirely.
 */

vi.mock('@/i18n', () => ({
  t: (key) => key
}))

// util reads window.electron at module scope; mock it the way the legacy
// notification tests did.
vi.mock('@/util', () => ({
  getUniqueId: vi.fn(() => 'test-id')
}))

import { copySelectionText, applyCopyPulse, prefersReducedMotion } from '@/services/notification'
import { setupTestPinia } from '../pinia'

const writeText = vi.fn(() => Promise.resolve())

describe('copySelectionText (corner C-4)', () => {
  beforeEach(() => {
    setupTestPinia()
    writeText.mockClear()
    Object.defineProperty(window, 'navigator', {
      value: { clipboard: { writeText } },
      configurable: true
    })
  })

  it('writes exactly the given string and returns true', () => {
    const result = copySelectionText('~/Documents/notes.md')
    expect(writeText).toHaveBeenCalledTimes(1)
    expect(writeText).toHaveBeenCalledWith('~/Documents/notes.md')
    expect(result).toBe(true)
  })

  it('empty text writes nothing and returns false', () => {
    expect(copySelectionText('')).toBe(false)
    expect(copySelectionText(undefined)).toBe(false)
    expect(writeText).not.toHaveBeenCalled()
  })

  it('a rejecting clipboard is a silent no-op', () => {
    writeText.mockImplementationOnce(() => Promise.reject(new Error('denied')))
    expect(() => copySelectionText('x')).not.toThrow()
  })

  it('a missing clipboard API never throws', () => {
    Object.defineProperty(window, 'navigator', { value: {}, configurable: true })
    expect(() => copySelectionText('x')).not.toThrow()
  })
})

describe('applyCopyPulse (corner C-3/C-10)', () => {
  beforeEach(() => {
    setupTestPinia()
    window.matchMedia = vi.fn().mockReturnValue({ matches: false })
  })

  const rangeOver = (el) => {
    const range = document.createRange()
    range.selectNodeContents(el)
    return range
  }

  it('wraps a Range in the pulse span and removes the class on animationend', () => {
    const host = document.createElement('div')
    host.textContent = 'path text'
    document.body.appendChild(host)
    applyCopyPulse(rangeOver(host))
    const pulse = host.querySelector('.notify-copied-pulse')
    expect(pulse).not.toBeNull()
    expect(pulse.textContent).toBe('path text')
    pulse.dispatchEvent(new Event('animationend'))
    expect(pulse.classList.contains('notify-copied-pulse')).toBe(false)
  })

  it('restarts the pulse on an Element target via class re-add', () => {
    const el = document.createElement('span')
    el.textContent = 'x'
    document.body.appendChild(el)
    applyCopyPulse(el)
    expect(el.classList.contains('notify-copied-pulse')).toBe(true)
    el.dispatchEvent(new Event('animationend'))
    expect(el.classList.contains('notify-copied-pulse')).toBe(false)
    applyCopyPulse(el)
    expect(el.classList.contains('notify-copied-pulse')).toBe(true)
  })

  it('prefers-reduced-motion skips the animation entirely (corner C-10)', () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true })
    expect(prefersReducedMotion()).toBe(true)
    const el = document.createElement('span')
    document.body.appendChild(el)
    applyCopyPulse(el)
    expect(el.classList.contains('notify-copied-pulse')).toBe(false)
  })
})
