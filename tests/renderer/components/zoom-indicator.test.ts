// FILE: tests/renderer/components/zoom-indicator.test.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin the C-49 transient zoom pill — shows round(fontSize / baseFontSize × 100) + ' %' on mt::zoom-level-changed, hides after ~1 s, restarts the timer on repeat events, is aria-live polite, and drops the transition under prefers-reduced-motion.
//   SCOPE: components/zoomIndicator/index.vue only (event → pill lifecycle).
//   DEPENDS: @vue/test-utils, mocked @/bus, Vitest + jsdom.
//   LINKS: .grace/changes/archive/C-49 R-5; .grace/verification/runtime.xml V-M-011 scenario-41.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   handlers - bus event → component listener registry installed by the mocked bus.
//   emitZoom - fire mt::zoom-level-changed through the mocked bus.
//   mountIndicator - mount the pill with optional matchMedia stub.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-15 C-49 T-001: initial pin. Every case fails
//   without the component (or with a watcher-based design that flashes on boot
//   hydration — the pill must be event-driven).
// END_CHANGE_SUMMARY

import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

const handlers = new Map()

vi.mock('@/bus', () => ({
  default: {
    on: (event, fn) => handlers.set(event, fn),
    off: (event, fn) => {
      if (handlers.get(event) === fn) handlers.delete(event)
    },
    emit: (event, payload) => {
      const fn = handlers.get(event)
      if (fn) fn(payload)
    }
  }
}))

import ZoomIndicator from '@/components/zoomIndicator/index.vue'

// Fire the bus event and let the reactive DOM update settle.
const emitZoom = async (payload?: unknown) => {
  handlers.get('mt::zoom-level-changed')(payload)
  await nextTick()
}

const mountIndicator = () => mount(ZoomIndicator)

describe('components/zoomIndicator (C-49 R-5)', () => {
  beforeEach(() => {
    handlers.clear()
    vi.useFakeTimers()
    // jsdom ships no matchMedia; default to "motion allowed".
    window.matchMedia = vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
  })

  afterEach(() => {
    vi.runAllTimers()
    vi.useRealTimers()
    delete window.matchMedia
  })

  it('is hidden until a zoom change arrives (boot hydration never flashes it)', () => {
    const wrapper = mountIndicator()
    expect(wrapper.find('.zoom-indicator').exists()).toBe(false)
  })

  it('shows round(fontSize / baseFontSize × 100) with a percent sign', async () => {
    const wrapper = mountIndicator()
    await emitZoom({ fontSize: 20, baseFontSize: 16 })
    expect(wrapper.text()).toBe('125 %')
  })

  it('is an aria-live polite status region', async () => {
    const wrapper = mountIndicator()
    await emitZoom({ fontSize: 17, baseFontSize: 16 })
    const pill = wrapper.find('.zoom-indicator')
    expect(pill.attributes('role')).toBe('status')
    expect(pill.attributes('aria-live')).toBe('polite')
  })

  it('hides after ~1 s', async () => {
    const wrapper = mountIndicator()
    await emitZoom({ fontSize: 20, baseFontSize: 16 })
    expect(wrapper.find('.zoom-indicator').exists()).toBe(true)
    vi.advanceTimersByTime(1000)
    await nextTick()
    expect(wrapper.find('.zoom-indicator').exists()).toBe(false)
  })

  it('a repeated zoom change restarts the hide timer', async () => {
    const wrapper = mountIndicator()
    await emitZoom({ fontSize: 17, baseFontSize: 16 })
    vi.advanceTimersByTime(800)
    await emitZoom({ fontSize: 18, baseFontSize: 16 })
    vi.advanceTimersByTime(800)
    // The first window (800 + 800 > 1000) has passed; the restart keeps it up.
    expect(wrapper.find('.zoom-indicator').exists()).toBe(true)
    expect(wrapper.text()).toBe('113 %')
    vi.advanceTimersByTime(200)
    await nextTick()
    expect(wrapper.find('.zoom-indicator').exists()).toBe(false)
  })

  it('ignores malformed payloads', async () => {
    const wrapper = mountIndicator()
    await emitZoom(undefined)
    await emitZoom({ fontSize: NaN, baseFontSize: 16 })
    await emitZoom({ fontSize: 20, baseFontSize: 0 })
    expect(wrapper.find('.zoom-indicator').exists()).toBe(false)
  })

  it('drops the transition under prefers-reduced-motion', async () => {
    window.matchMedia = vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
    const wrapper = mountIndicator()
    await emitZoom({ fontSize: 20, baseFontSize: 16 })
    expect(wrapper.find('.zoom-indicator-reduced-motion').exists()).toBe(true)
  })

  it('unsubscribes from the bus on unmount', () => {
    const wrapper = mountIndicator()
    wrapper.unmount()
    expect(handlers.has('mt::zoom-level-changed')).toBe(false)
  })
})
