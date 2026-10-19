// FILE: tests/renderer/components/outline-rail.test.js
// VERSION: 1.1.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin the C-40 T-003 outline-rail component — rendering, scrollspy highlight, click-to-jump, and every visibility gate (preference, source/split/diff modes, ≥3 headings, editor-area width, no-overlap fit).
//   SCOPE: outlineRail.vue in jsdom with fake ResizeObserver, owned scroll/mutation-driven table occlusion and cleanup, stubbed element geometry, mocked bus; editorWithTabs wiring and sidebar TOC retirement.
//   DEPENDS: Vue Test Utils, Vitest, Pinia test setup, vue-i18n, outlineRail.vue, editorWithTabs/index.vue, sideBar/index.vue.
//   LINKS: .grace/changes/active/C-40 T-003; .grace/verification/runtime.xml V-M-011 scenario-54.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   busMock - bus stand-in; captures scroll-to-header emissions and the toc-active-heading subscription.
//   FakeResizeObserver - controllable observer so a test can push a resize (which re-runs measure()).
//   geometry - mutable element-rect fixture (container width, centred column width).
//   stubGeometry - Element.prototype.getBoundingClientRect spy reading `geometry` (the #ag-editor-id column is centred, muya layout).
//   mountRail - mounts outlineRail.vue in an owned editor/scroller/column fixture; returns { wrapper, preferencesStore }.
//   LIST_TOC - editor listToc fixture.
//   ROOT - repo root for source pins.
//   i18n - vue-i18n instance with the rail title.
//   observers - live FakeResizeObserver instances.
//   pushResize - fires every observer with the fixture width.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-10-19 v1.1.0: C-71-OUTLINE-OCCLUSION — scroll-only visibility/restoration, table mutation ownership and scheduled-work cleanup.
//   - 2026-10-15 v1.0.0: C-40 T-003 initial coverage.
// END_CHANGE_SUMMARY

import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { setupTestPinia } from '../pinia'
import { createI18n } from 'vue-i18n'

const ROOT = resolve(__dirname, '..', '..', '..')

const busMock = vi.hoisted(() => ({ on: vi.fn(), off: vi.fn(), emit: vi.fn() }))

vi.mock('@/bus', () => ({ default: busMock }))
// store/editor imports the notification service; keep the chain silent.
vi.mock('@/services/notification', () => ({ default: { notify: vi.fn() } }))

const observers = new Set()
class FakeResizeObserver {
  constructor (cb) { this.cb = cb }
  observe () { observers.add(this) }
  unobserve () {}
  disconnect () { observers.delete(this) }
}
const pushResize = async () => {
  for (const o of observers) o.cb([{ contentRect: { width: geometry.containerWidth } }])
  await nextTick()
}

// Mutable geometry fixture: the anchor's parent (.container) spans
// containerWidth; the #ag-editor-id column is `columnWidth` wide and
// centred (the muya `margin: 0 auto; max-width: var(--editorAreaWidth)`
// layout).
const geometry = { containerWidth: 1280, columnWidth: 750 }
const stubGeometry = () => {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function () {
    const columnWidth = Math.min(geometry.columnWidth, geometry.containerWidth)
    const columnRight = (geometry.containerWidth + columnWidth) / 2
    if (this.id === 'ag-editor-id') {
      return {
        left: columnRight - columnWidth, right: columnRight, top: 0, bottom: 800,
        width: columnWidth, height: 800, x: columnRight - columnWidth, y: 0, toJSON: () => ({})
      }
    }
    return {
      left: 0, right: geometry.containerWidth, top: 0, bottom: 720,
      width: geometry.containerWidth, height: 720, x: 0, y: 0, toJSON: () => ({})
    }
  })
}

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: { en: { outlineRail: { title: 'On this page' } } }
})

const LIST_TOC = [
  { slug: 'h1-title', content: 'Release notes', lvl: 1, githubSlug: 'release-notes' },
  { slug: 'h2-alpha', content: 'Alpha Section', lvl: 2, githubSlug: 'alpha-section' },
  { slug: 'h4-nested', content: 'Nested bits', lvl: 4, githubSlug: 'nested-bits' },
  { slug: 'h2-beta', content: 'Beta Section', lvl: 2, githubSlug: 'beta-section' }
]

// Mounts the rail attached to a fake editor container. The pinia instance
// is created HERE (the active one at mount time) and its preference store
// is returned so tests can flip prefs on the live instance.
const mountRail = async ({
  props = {},
  listToc = LIST_TOC,
  preferenceVisible = true
} = {}) => {
  document.body.innerHTML = '<div id="rail-host" class="editor-with-tabs"><div class="editor-component"><div id="ag-editor-id"></div></div></div>'
  const host = document.getElementById('rail-host')

  const pinia = setupTestPinia()
  const { useEditorStore } = await import('@/store/editor')
  const { usePreferencesStore } = await import('@/store/preferences')
  const editorStore = useEditorStore()
  editorStore.listToc = listToc
  const preferencesStore = usePreferencesStore()
  preferencesStore.outlineRailVisible = preferenceVisible

  const OutlineRail = (await import('@/components/editorWithTabs/outlineRail.vue')).default
  const wrapper = mount(OutlineRail, {
    props: { sourceCode: false, splitView: false, diffMode: false, ...props },
    attachTo: host,
    global: { plugins: [pinia, i18n] }
  })
  // attachTo mounts into a wrapper div inside the host; in the app the rail
  // root sits directly in the editor .container next to the column, so move
  // it there and re-measure.
  host.appendChild(wrapper.element)
  await pushResize()
  await nextTick()
  return { wrapper, preferencesStore }
}

describe('editorWithTabs/outlineRail.vue', () => {
  beforeEach(() => {
    observers.clear()
    globalThis.ResizeObserver = FakeResizeObserver
    document.body.innerHTML = ''
    geometry.containerWidth = 1280
    geometry.columnWidth = 750
    busMock.on.mockClear()
    busMock.off.mockClear()
    busMock.emit.mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    delete globalThis.ResizeObserver
  })

  const isHidden = (wrapper) => {
    const style = wrapper.find('.outline-rail-anchor').attributes('style') || ''
    return style.includes('display: none')
  }

  it('renders the header and the h1–h3 items when every gate passes', async () => {
    stubGeometry()
    const { wrapper } = await mountRail()
    expect(isHidden(wrapper)).toBe(false)
    expect(wrapper.find('.outline-rail-header').text()).toBe('On this page')
    expect(wrapper.find('.outline-rail').attributes('aria-label')).toBe('On this page')
    expect(
      wrapper.findAll('.outline-rail-item').map((i) => i.text())
    ).toEqual(['Release notes', 'Alpha Section', 'Beta Section'])
    wrapper.unmount()
  })

  it('hides on owned scroll intersection, restores without hover and cleans up all scheduled work', async () => {
    stubGeometry()
    const disconnect = vi.spyOn(MutationObserver.prototype, 'disconnect')
    const { wrapper } = await mountRail()
    const host = document.getElementById('rail-host')
    const scroller = host.querySelector('.editor-component')
    const rail = wrapper.find('.outline-rail')
    rail.element.getBoundingClientRect = () => ({ left: 1100, top: 46, right: 1280, bottom: 200 })
    scroller.getBoundingClientRect = () => ({ left: 0, top: 0, right: 1300, bottom: 720 })
    const figure = document.createElement('figure')
    figure.dataset.role = 'TABLE'
    figure.innerHTML = '<div class="ag-table-scroll"><table></table></div>'
    const table = figure.querySelector('table')
    let top = 800
    table.getBoundingClientRect = () => ({ left: 100, top, right: 1200, bottom: top + 100 })
    host.querySelector('#ag-editor-id').appendChild(figure)
    await vi.waitFor(() => expect(rail.classes()).not.toContain('outline-rail--occluded'))
    top = 80
    scroller.dispatchEvent(new Event('scroll'))
    await vi.waitFor(() => expect(rail.classes()).toContain('outline-rail--occluded'))
    expect(rail.attributes('inert')).toBe('')
    expect(rail.attributes('aria-hidden')).toBe('true')
    // An owned style mutation can change table geometry without a scroll.
    top = 800
    table.style.width = '500px'
    await vi.waitFor(() => expect(rail.classes()).not.toContain('outline-rail--occluded'))
    expect(rail.attributes('inert')).toBeUndefined()
    const foreign = figure.cloneNode(true)
    foreign.querySelector('table').getBoundingClientRect = () => ({ left: 100, top: 80, right: 1200, bottom: 180 })
    document.body.appendChild(foreign)
    scroller.dispatchEvent(new Event('scroll'))
    await nextTick()
    expect(rail.classes()).not.toContain('outline-rail--occluded')
    const remove = vi.spyOn(host, 'removeEventListener')
    const cancel = vi.spyOn(window, 'cancelAnimationFrame')
    // Leave one queued frame for unmount to cancel.
    scroller.dispatchEvent(new Event('scroll'))
    wrapper.unmount()
    expect(remove).toHaveBeenCalledWith('scroll', expect.any(Function), true)
    expect(cancel).toHaveBeenCalled()
    expect(disconnect).toHaveBeenCalled()
    expect(observers.size).toBe(0)
  })

  it('hides in source mode, split view, and diff view', async () => {
    stubGeometry()
    for (const prop of ['sourceCode', 'splitView', 'diffMode']) {
      const { wrapper } = await mountRail({ props: { [prop]: true } })
      expect(isHidden(wrapper), prop).toBe(true)
      wrapper.unmount()
    }
  })

  it('hides when the outlineRailVisible preference is off', async () => {
    stubGeometry()
    const { wrapper } = await mountRail({ preferenceVisible: false })
    expect(isHidden(wrapper)).toBe(true)
    wrapper.unmount()
  })

  it('hides with fewer than 3 h1–h3 headings (h4/h5 do not count)', async () => {
    stubGeometry()
    const { wrapper } = await mountRail({
      listToc: [
        { slug: 'h1', content: 'One', lvl: 1 },
        { slug: 'h4a', content: 'A', lvl: 4 },
        { slug: 'h4b', content: 'B', lvl: 4 },
        { slug: 'h4c', content: 'C', lvl: 4 },
        { slug: 'h5d', content: 'D', lvl: 5 }
      ]
    })
    expect(isHidden(wrapper)).toBe(true)
    wrapper.unmount()
  })

  it('hides below 1000px of editor width and re-shows when it grows', async () => {
    stubGeometry()
    const { wrapper } = await mountRail()
    expect(isHidden(wrapper)).toBe(false)

    // Simulate the container shrinking (sidebar opened / window resized).
    geometry.containerWidth = 900
    await pushResize()
    expect(isHidden(wrapper)).toBe(true)

    geometry.containerWidth = 1280
    await pushResize()
    expect(isHidden(wrapper)).toBe(false)
    wrapper.unmount()
  })

  it('hides when the rail would overlap the centred text column (wide editorLineWidth)', async () => {
    // A 1100px container shows the default 750px column, but a 950px
    // column (editorLineWidth) leaves no room: rail left = 908, text
    // right = (1100+950)/2 - 50 = 1025 → hidden.
    geometry.containerWidth = 1100
    geometry.columnWidth = 950
    stubGeometry()
    const { wrapper } = await mountRail()
    expect(isHidden(wrapper)).toBe(true)
    wrapper.unmount()
  })

  it('emits scroll-to-header with the clicked item slug', async () => {
    stubGeometry()
    const { wrapper } = await mountRail()
    await wrapper.findAll('.outline-rail-item')[2].trigger('click')
    expect(busMock.emit).toHaveBeenCalledWith('scroll-to-header', 'h2-beta')
    wrapper.unmount()
  })

  it('subscribes to toc-active-heading and highlights the current section only', async () => {
    stubGeometry()
    const { wrapper } = await mountRail()

    const subscription = busMock.on.mock.calls.find(([event]) => event === 'toc-active-heading')
    expect(subscription).toBeTruthy()
    const setActive = subscription[1]

    setActive('h2-alpha')
    await nextTick()
    const current = wrapper.findAll('.outline-rail-item--current')
    expect(current).toHaveLength(1)
    expect(current[0].text()).toBe('Alpha Section')

    // A viewport inside an unlisted h4 highlights its nearest listed ancestor.
    setActive('h4-nested')
    await nextTick()
    expect(wrapper.find('.outline-rail-item--current').text()).toBe('Alpha Section')

    // Above the first heading: no highlight.
    setActive(null)
    await nextTick()
    expect(wrapper.findAll('.outline-rail-item--current')).toHaveLength(0)

    wrapper.unmount()
    expect(busMock.off).toHaveBeenCalledWith('toc-active-heading', setActive)
  })

  it('indents deeper levels and honours wordWrapInToc', async () => {
    stubGeometry()
    const { wrapper, preferencesStore } = await mountRail()
    const items = wrapper.findAll('.outline-rail-item')
    expect(items[0].attributes('style')).toContain('--outline-rail-indent: 0px')
    expect(items[1].attributes('style')).toContain('--outline-rail-indent: 10px')

    preferencesStore.wordWrapInToc = true
    await nextTick()
    expect(wrapper.find('.outline-rail').classes()).toContain('outline-rail--wrap')
    wrapper.unmount()
  })
})

describe('editorWithTabs/index.vue wiring', () => {
  it('mounts the rail inside the container and passes the mode gates', async () => {
    stubGeometry()
    const pinia = setupTestPinia()
    const { useEditorStore } = await import('@/store/editor')
    useEditorStore().listToc = LIST_TOC

    const EditorWithTabs = (await import('@/components/editorWithTabs/index.vue')).default
    const wrapper = mount(EditorWithTabs, {
      props: {
        markdown: '# Test',
        cursor: { line: 0, ch: 0 },
        sourceCode: true,
        showTabBar: true,
        textDirection: 'ltr',
        platform: 'darwin'
      },
      attachTo: document.body,
      global: {
        plugins: [pinia, i18n],
        stubs: {
          Tabs: true,
          Editor: true,
          SourceCode: true,
          TabNotifications: true,
          // SplitView stays real (display:contents passthrough).
          SplitView: false
        }
      }
    })
    const rail = wrapper.findComponent({ name: 'outlineRail' })
    expect(rail.exists()).toBe(true)
    expect(rail.props('sourceCode')).toBe(true)
    // The rail lives inside .container, its positioning context.
    expect(wrapper.find('.container > .outline-rail-anchor').exists()).toBe(true)
    wrapper.unmount()
  }, 20_000)
})

describe('sidebar TOC retirement (C-40 T-003)', () => {
  it('sideBar/index.vue no longer imports or renders the toc panel', async () => {
    const source = readFileSync(
      resolve(ROOT, 'src/renderer/src/components/sideBar/index.vue'),
      'utf8'
    )
    expect(source).not.toContain("from './toc.vue'")
    expect(source).not.toContain("rightColumn === 'toc'")
  })

  it('a stale rightColumn=toc shows Files, never the TOC panel', async () => {
    const pinia = setupTestPinia()
    const { useLayoutStore } = await import('@/store/layout')
    useLayoutStore().rightColumn = 'toc'

    const SideBar = (await import('@/components/sideBar/index.vue')).default
    const wrapper = mount(SideBar, {
      attachTo: document.body,
      global: {
        plugins: [pinia, i18n],
        stubs: { tree: true, SideBarSearch: true, SearchToolbar: true }
      }
    })
    expect(wrapper.find('.side-bar-toc').exists()).toBe(false)
    expect(wrapper.find('tree-stub').exists()).toBe(true)
    wrapper.unmount()
  })
})
