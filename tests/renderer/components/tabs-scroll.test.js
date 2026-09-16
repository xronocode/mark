/**
 * C-6: active-tab strip auto-scroll.
 *
 * Pins every branch of the pure geometry helper computeActiveTabScroll and
 * the tabs.vue integration (watcher on [currentFile.id, tab id order] plus
 * the post-mount call) using stubbed offsetLeft/offsetWidth/clientWidth —
 * jsdom has no layout, so geometry is defined per element.
 */
// FILE: tests/renderer/components/tabs-scroll.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Verify the C-6 active-tab auto-scroll behavior end to end at the component level.
//   SCOPE: computeActiveTabScroll pure branches; tabs.vue watcher, mount hook, guards.
//   DEPENDS: @/util/tabsScroll, @/components/editorWithTabs/tabs.vue, test pinia
//   LINKS: M-011, V-M-011 scenario-24, .grace/changes/active/C-6
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   i18n - shared vue-i18n instance for component mounts
//   resizeObservers - captured ResizeObserverStub instances (C-7 resize trigger)
//   ResizeObserverStub - global ResizeObserver stand-in capturing callbacks, observed elements, disconnect
//   stubElement - define jsdom geometry properties (offsetLeft/offsetWidth/clientWidth/scrollLeft) on an element
//   makeTabs - build the shared 5-tab strip fixture (100px tabs, 250px viewport)
//   seedAndMount - seed the editor store with the strip and mount tabs.vue with stubbed geometry
// END_MODULE_MAP
import { shallowMount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { setupTestPinia } from '../pinia'
import { createI18n } from 'vue-i18n'
import { computeActiveTabScroll } from '@/util/tabsScroll'

vi.mock('@/bus', () => ({
  default: { on: vi.fn(), off: vi.fn(), emit: vi.fn() }
}))

vi.mock('dom-autoscroller', () => ({
  default: vi.fn(() => ({ down: false, destroy: vi.fn() }))
}))

vi.mock('dragula', () => ({
  default: vi.fn(() => ({
    on: vi.fn().mockReturnThis(),
    destroy: vi.fn(),
    dragging: false
  }))
}))

vi.mock('@/contextMenu/tabs', () => ({
  showContextMenu: vi.fn()
}))

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: {} } })

/* ── geometry stubbing (jsdom has no layout) ─────────────────────── */
const stubElement = (el, props) => {
  for (const [key, value] of Object.entries(props)) {
    if (key === 'scrollLeft') {
      let backing = value
      Object.defineProperty(el, 'scrollLeft', {
        configurable: true,
        get: () => backing,
        set: (v) => {
          backing = v
        }
      })
    } else {
      Object.defineProperty(el, key, { configurable: true, get: () => value })
    }
  }
}

/* ── ResizeObserver stub (C-7) ───────────────────────────────────── */
const resizeObservers = []
class ResizeObserverStub {
  constructor(callback) {
    this.callback = callback
    this.observed = []
    this.disconnect = vi.fn()
    resizeObservers.push(this)
  }
  observe(el) {
    this.observed.push(el)
  }
  unobserve() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub)

/* ── shared 5-tab strip: tabs are 100px wide, viewport 250px ─────── */
const makeTabs = () =>
  [1, 2, 3, 4, 5].map((n) => ({
    id: `tab-${n}`,
    filename: `file${n}.md`,
    pathname: `/tmp/file${n}.md`,
    isSaved: true
  }))

const seedAndMount = async ({ currentFileIndex = 0, initialScrollLeft = 0 } = {}) => {
  const pinia = setupTestPinia()
  const { useEditorStore } = await import('@/store/editor')
  const { useLayoutStore } = await import('@/store/layout')
  const editorStore = useEditorStore()
  const strip = makeTabs()
  editorStore.tabs = strip
  editorStore.currentFile = strip[currentFileIndex]

  const Tabs = (await import('@/components/editorWithTabs/tabs.vue')).default
  const wrapper = shallowMount(Tabs, { global: { plugins: [pinia, i18n] } })

  const container = wrapper.find('.scrollable-tabs').element
  stubElement(container, { clientWidth: 250, scrollLeft: initialScrollLeft })
  wrapper.findAll('li').forEach((li, i) => {
    stubElement(li.element, { offsetLeft: i * 100, offsetWidth: 100 })
  })

  return { wrapper, editorStore, layoutStore: useLayoutStore(), container, strip }
}

describe('computeActiveTabScroll (pure geometry)', () => {
  it('returns null when the tab is already fully visible', () => {
    expect(
      computeActiveTabScroll({ activeLeft: 100, activeWidth: 100, scrollLeft: 0, viewportWidth: 250 })
    ).toBeNull()
  })

  it('left-clipped tab aligns its left edge with the viewport', () => {
    expect(
      computeActiveTabScroll({ activeLeft: 100, activeWidth: 100, scrollLeft: 250, viewportWidth: 250 })
    ).toBe(100)
  })

  it('right-clipped tab aligns its right edge with the viewport', () => {
    expect(
      computeActiveTabScroll({ activeLeft: 400, activeWidth: 100, scrollLeft: 0, viewportWidth: 250 })
    ).toBe(250)
  })

  it('clamps the target at 0 (left edge of the strip)', () => {
    expect(
      computeActiveTabScroll({ activeLeft: 0, activeWidth: 100, scrollLeft: 250, viewportWidth: 250 })
    ).toBe(0)
  })

  it('tab wider than the viewport left-aligns and stays idempotent', () => {
    expect(
      computeActiveTabScroll({ activeLeft: 30, activeWidth: 400, scrollLeft: 0, viewportWidth: 250 })
    ).toBe(30)
    // Re-triggering from the scrolled position returns the same target (no
    // oscillation between the two clip branches).
    expect(
      computeActiveTabScroll({ activeLeft: 30, activeWidth: 400, scrollLeft: 30, viewportWidth: 250 })
    ).toBe(30)
  })
})

describe('tabs.vue — active tab auto-scroll (C-6)', () => {
  it('switching to an off-screen right tab scrolls the strip to reveal it', async () => {
    const { editorStore, container } = await seedAndMount()
    await nextTick() // flush the mount hook (tab-1 visible → no-op)
    expect(container.scrollLeft).toBe(0)

    editorStore.currentFile = editorStore.tabs[4] // tab-5 at 400..500, viewport 250
    await nextTick()
    await nextTick()
    expect(container.scrollLeft).toBe(250)
  })

  it('switching to a left-clipped tab scrolls the strip left', async () => {
    // Start on tab-2 with scrollLeft 100 (window 100..350 → tab-2 visible,
    // so the mount hook must not move the strip).
    const { editorStore, container } = await seedAndMount({
      currentFileIndex: 1,
      initialScrollLeft: 100
    })
    await nextTick()
    expect(container.scrollLeft).toBe(100)

    editorStore.currentFile = editorStore.tabs[0] // tab-1 at 0..100, clipped left
    await nextTick()
    await nextTick()
    expect(container.scrollLeft).toBe(0)
  })

  it('switching between fully visible tabs does not scroll', async () => {
    // Window 50..300: tab-3 (200..300) and tab-2 (100..200) both visible.
    const { editorStore, container } = await seedAndMount({
      currentFileIndex: 2,
      initialScrollLeft: 50
    })
    await nextTick()
    expect(container.scrollLeft).toBe(50)

    editorStore.currentFile = editorStore.tabs[1]
    await nextTick()
    await nextTick()
    expect(container.scrollLeft).toBe(50)
  })

  it('reorder that moves the active tab off-screen scrolls even though its id is unchanged', async () => {
    const { wrapper, editorStore, container } = await seedAndMount()
    const strip = editorStore.tabs
    editorStore.currentFile = strip[4]
    await nextTick()
    await nextTick()
    expect(container.scrollLeft).toBe(250)

    // Drag tab-5 (still active) to the front of the strip: left 0..100.
    editorStore.tabs = [strip[4], strip[0], strip[1], strip[2], strip[3]]
    await nextTick() // DOM patched; watcher schedules the scroll callback

    // Vue moved the same keyed nodes, so the static geometry stubs are stale —
    // re-stub for the new visual order before the callback runs.
    wrapper.findAll('li').forEach((li, i) => {
      stubElement(li.element, { offsetLeft: i * 100, offsetWidth: 100 })
    })
    await nextTick()
    expect(container.scrollLeft).toBe(0)
  })

  it('real in-place splice reorder (EXCHANGE_TABS_BY_ID) triggers the scroll', async () => {
    const { wrapper, editorStore, container } = await seedAndMount()
    editorStore.currentFile = editorStore.tabs[4]
    await nextTick()
    await nextTick()
    expect(container.scrollLeft).toBe(250)

    // The production drag-drop path mutates the array in place (splice), not
    // by replacement — this pins the reactive dependency on reindexing.
    editorStore.EXCHANGE_TABS_BY_ID({ fromId: 'tab-5', toId: 'tab-1' })
    expect(editorStore.tabs[0].id).toBe('tab-5')
    await nextTick()

    wrapper.findAll('li').forEach((li, i) => {
      stubElement(li.element, { offsetLeft: i * 100, offsetWidth: 100 })
    })
    await nextTick()
    expect(container.scrollLeft).toBe(0)
  })

  it('replacing currentFile with a clone of the same id does not re-scroll', async () => {
    // Start on visible tab-2 at scrollLeft 0, then manually wheel to 250 —
    // if the watcher fired on the clone (same join string), tab-2 would be
    // left-clipped and the strip would jump to 100; it must stay at 250.
    const { editorStore, container } = await seedAndMount({ currentFileIndex: 1 })
    await nextTick()
    container.scrollLeft = 250

    editorStore.currentFile = { ...editorStore.tabs[1] }
    await nextTick()
    await nextTick()
    expect(container.scrollLeft).toBe(250)
  })

  it('re-showing the hidden tab bar scrolls the active tab back into view', async () => {
    const { layoutStore, editorStore, container } = await seedAndMount({ currentFileIndex: 4 })
    await nextTick()
    await nextTick()
    expect(container.scrollLeft).toBe(250)

    // display:none discards scrollLeft in a real browser; simulate that.
    layoutStore.showTabBar = false
    await nextTick()
    container.scrollLeft = 0

    layoutStore.showTabBar = true
    await nextTick()
    await nextTick()
    expect(container.scrollLeft).toBe(250)
  })

  it('a transient active id with no matching tab is a silent no-op', async () => {
    const { editorStore, container } = await seedAndMount({
      currentFileIndex: 2,
      initialScrollLeft: 100
    })
    await nextTick()
    expect(container.scrollLeft).toBe(100)

    editorStore.currentFile = { id: 'ghost', filename: 'g.md', pathname: '/tmp/g.md', isSaved: true }
    await nextTick()
    await nextTick()
    expect(container.scrollLeft).toBe(100)
  })

  it('initial mount scrolls a restored active tab beyond the fold into view', async () => {
    // seedAndMount stubs geometry synchronously right after mount, i.e.
    // before the post-mount nextTick(scrollActiveTabIntoView) runs.
    const { container } = await seedAndMount({ currentFileIndex: 4 })
    await nextTick()
    expect(container.scrollLeft).toBe(250)
  })

  it('container resize re-reveals the active tab (C-7)', async () => {
    // Active tab-5 aligned at scrollLeft 250 with a 250px viewport; the
    // strip then shrinks to 120px → tab-5 (400..500) must re-align to 380.
    const { container } = await seedAndMount({ currentFileIndex: 4 })
    await nextTick()
    expect(container.scrollLeft).toBe(250)

    const observer = resizeObservers[resizeObservers.length - 1]
    expect(observer.observed).toContain(container)

    stubElement(container, { clientWidth: 120, scrollLeft: 250 })
    observer.callback([{ contentRect: { width: 120 } }])
    await nextTick()
    await nextTick()
    expect(container.scrollLeft).toBe(380)
  })

  it('zero-width resize (display:none) never scrolls (C-7)', async () => {
    const { container } = await seedAndMount({ currentFileIndex: 1, initialScrollLeft: 100 })
    await nextTick()
    const observer = resizeObservers[resizeObservers.length - 1]
    observer.callback([{ contentRect: { width: 0 } }])
    await nextTick()
    await nextTick()
    expect(container.scrollLeft).toBe(100)
  })

  it('resize observer disconnects on unmount (C-7)', async () => {
    const { wrapper } = await seedAndMount()
    const observer = resizeObservers[resizeObservers.length - 1]
    wrapper.unmount()
    expect(observer.disconnect).toHaveBeenCalled()
  })
})
