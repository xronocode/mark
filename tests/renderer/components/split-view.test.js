// FILE: tests/renderer/components/split-view.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Verify C-29 Split View: the split container (layout, divider drag, swap, narrow collapse), which pane is the read-only mirror in editorWithTabs, and the CodeMirror mirror mode of sourceCode.vue.
//   SCOPE: Deterministic Vue/jsdom tests with a controllable ResizeObserver, mocked CodeMirror and bus.
//   DEPENDS: Vue Test Utils, Vitest, Pinia test setup, splitView.vue, editorWithTabs/index.vue, sourceCode.vue.
//   LINKS: .grace/changes/archive/C-29 (T-221..T-223, corners 1, 3, 6, 7, 10); V-M-011.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   busMock - bus stand-in; asserts the mirror registers and emits nothing.
//   cmInstance - CodeMirror instance stand-in for sourceCode.vue.
//   codeMirrorMock - CodeMirror factory mock; exposes the mount config (readOnly/autofocus).
//   observers - live FakeResizeObserver instances.
//   FakeResizeObserver - records observers so a test can report a container width.
//   setWidth - pushes a width to every live observer.
//   i18n - minimal vue-i18n instance for mounts.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-11-11 C-SOURCE-HISTORY-OWNERSHIP: model public Doc binding without changing pane-role assertions.
//   - 2026-10-29 v1.1.0: C-SPLIT-DBLCLICK-TOGGLE — divider dblclick
//     requests the toggle via cmd::execute (no swap), Alt+dblclick swaps,
//     the right-edge strip gates on width/diff/split-state and enables.
//   - 2026-10-29 v1.2.0: C-SPLIT-DUAL-EDIT — both panes editable in split
//     (splitEdit companion: render-only follow + unified undo keys +
//     unmount commit); the read-only mirror corners are retired.
//   - 2026-10-13 v1.0.0: C-29 initial coverage.
// END_CHANGE_SUMMARY

import { mount, shallowMount } from '@vue/test-utils'
import { nextTick, h } from 'vue'
import { setupTestPinia } from '../pinia'
import { createI18n } from 'vue-i18n'

const busMock = vi.hoisted(() => ({ on: vi.fn(), off: vi.fn(), emit: vi.fn() }))

const cmInstance = vi.hoisted(() => ({
  value: '',
  doc: null,
  getDoc: vi.fn(() => cmInstance.doc),
  swapDoc: vi.fn(next => {
    const old = cmInstance.doc; cmInstance.doc = next
    cmInstance.value = next.getValue(); cmInstance.getValue.mockReturnValue(cmInstance.value)
    return old
  }),
  on: vi.fn(),
  getValue: vi.fn(),
  setValue: vi.fn(),
  setOption: vi.fn(),
  getOption: vi.fn(),
  getSelection: vi.fn(() => ''),
  getScrollInfo: vi.fn(() => ({ left: 0, top: 0 })),
  scrollTo: vi.fn(),
  getCursor: vi.fn(() => ({ line: 0, ch: 0 })),
  getLine: vi.fn(() => ''),
  setSelection: vi.fn(),
  execCommand: vi.fn(),
  invalidateImageCache: vi.fn(),
  clearHistory: vi.fn(),
  setCursor: vi.fn(),
  getInputField: vi.fn(() => document.createElement('textarea'))
}))
const codeMirrorMock = vi.hoisted(() => vi.fn(() => cmInstance))

vi.mock('@/bus', () => ({ default: busMock }))
vi.mock('@/codeMirror', () => ({
  default: codeMirrorMock,
  setMode: vi.fn(),
  setCursorAtFirstLine: vi.fn(),
  setTextDirection: vi.fn()
}))
vi.mock('muya/lib/utils', async (importOriginal) => ({
  ...(await importOriginal()),
  debounce: (fn) => fn,
  wordCount: vi.fn(() => ({ word: 0, character: 0, paragraph: 0 }))
}))
vi.mock('@/util', () => ({ adjustCursor: vi.fn((c) => c), isOsx: true }))
vi.mock('@/config', () => ({ oneDarkThemes: [], railscastsThemes: [] }))

const observers = new Set()
class FakeResizeObserver {
  constructor (cb) { this.cb = cb }
  observe () { observers.add(this) }
  unobserve () {}
  disconnect () { observers.delete(this) }
}
const setWidth = async (width) => {
  for (const o of observers) o.cb([{ contentRect: { width } }])
  await nextTick()
}

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: {} } })

describe('C-29 Split View', () => {
  let pinia
  let preferences

  beforeEach(async () => {
    observers.clear()
    globalThis.ResizeObserver = FakeResizeObserver
    pinia = setupTestPinia()
    const { usePreferencesStore } = await import('@/store/preferences')
    preferences = usePreferencesStore()
    preferences.SET_SINGLE_PREFERENCE = vi.fn(function ({ type, value }) { this[type] = value })
    busMock.on.mockClear()
    busMock.emit.mockClear()
    codeMirrorMock.mockClear()
    cmInstance.setValue.mockClear()
    cmInstance.on.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ─── splitView.vue ───────────────────────────────────────────

  const mountSplit = async (enabled, extraProps = {}) => {
    const SplitView = (await import('@/components/editorWithTabs/splitView.vue')).default
    const host = document.createElement('div')
    document.body.appendChild(host)
    const wrapper = mount(SplitView, {
      attachTo: host,
      props: { enabled, ...extraProps },
      global: { plugins: [pinia] },
      slots: {
        rich: ({ active }) => h('div', { class: 'probe-rich', 'data-active': String(active) }),
        source: ({ active }) => h('div', { class: 'probe-source', 'data-active': String(active) })
      }
    })
    await setWidth(1200)
    return wrapper
  }

  describe('container', () => {
    it('is inert while disabled: no divider, no split class, slots told inactive (C-SPLIT-DBLCLICK-TOGGLE: the enable strip IS present)', async () => {
      const wrapper = await mountSplit(false)
      expect(wrapper.find('.split-divider').exists()).toBe(false)
      expect(wrapper.classes()).not.toContain('is-split')
      expect(wrapper.find('.probe-rich').attributes('data-active')).toBe('false')
      expect(wrapper.find('.split-edge-strip').exists()).toBe(true)
    })

    it('splits when enabled on a wide container and places the left pane at the saved ratio', async () => {
      preferences.splitViewRatio = 0.3
      const wrapper = await mountSplit(true)
      expect(wrapper.classes()).toContain('is-split')
      expect(wrapper.find('.split-divider').exists()).toBe(true)
      expect(wrapper.find('.probe-source').attributes('data-active')).toBe('true')
      expect(wrapper.attributes('style')).toContain('--split-left: 30%')
    })

    it('corner-6: collapses below 800px and restores the ratio when wide again', async () => {
      preferences.splitViewRatio = 0.4
      const wrapper = await mountSplit(true)
      await setWidth(799)
      expect(wrapper.classes()).not.toContain('is-split')
      expect(wrapper.find('.probe-rich').attributes('data-active')).toBe('false')
      await setWidth(1000)
      expect(wrapper.classes()).toContain('is-split')
      expect(wrapper.attributes('style')).toContain('--split-left: 40%')
    })

    it('corner-10: drag clamps to 10–90% and persists once on release', async () => {
      const wrapper = await mountSplit(true)
      wrapper.element.getBoundingClientRect = () => ({ left: 0, width: 1000, top: 0, height: 500 })
      const divider = wrapper.find('.split-divider')
      divider.element.dispatchEvent(new MouseEvent('pointerdown', { button: 0, clientX: 500, bubbles: true, cancelable: true }))
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 5 }))
      await nextTick()
      expect(wrapper.attributes('style')).toContain('--split-left: 10%')
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 999 }))
      await nextTick()
      expect(wrapper.attributes('style')).toContain('--split-left: 90%')
      expect(preferences.SET_SINGLE_PREFERENCE).not.toHaveBeenCalled()
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 620 }))
      window.dispatchEvent(new MouseEvent('pointerup', {}))
      await nextTick()
      expect(preferences.SET_SINGLE_PREFERENCE).toHaveBeenCalledTimes(1)
      expect(preferences.SET_SINGLE_PREFERENCE).toHaveBeenCalledWith({ type: 'splitViewRatio', value: 0.62 })
    })

    it('corner-7: a corrupt stored ratio falls back to 50%', async () => {
      preferences.splitViewRatio = 'garbage'
      const wrapper = await mountSplit(true)
      expect(wrapper.attributes('style')).toContain('--split-left: 50%')
    })

    it('keyboard: arrows move the divider 5% within the clamp, Enter swaps', async () => {
      preferences.splitViewRatio = 0.5
      const wrapper = await mountSplit(true)
      const divider = wrapper.find('.split-divider')
      expect(divider.attributes('tabindex')).toBe('0')
      await divider.trigger('keydown', { key: 'ArrowLeft' })
      expect(preferences.SET_SINGLE_PREFERENCE).toHaveBeenLastCalledWith({ type: 'splitViewRatio', value: 0.45 })
      preferences.splitViewRatio = 0.9
      preferences.SET_SINGLE_PREFERENCE.mockClear()
      await divider.trigger('keydown', { key: 'ArrowRight' })
      expect(preferences.SET_SINGLE_PREFERENCE).not.toHaveBeenCalled()
      await divider.trigger('keydown', { key: 'Enter' })
      expect(preferences.SET_SINGLE_PREFERENCE).toHaveBeenCalledWith({ type: 'splitViewSwapped', value: true })
    })

    it('C-SPLIT-DBLCLICK-TOGGLE: plain divider double-click requests the split toggle, never a swap', async () => {
      const wrapper = await mountSplit(true)
      await wrapper.find('.split-divider').trigger('dblclick')
      expect(busMock.emit).toHaveBeenCalledWith('cmd::execute', 'view.split-view')
      expect(preferences.SET_SINGLE_PREFERENCE).not.toHaveBeenCalledWith({ type: 'splitViewSwapped', value: true })
      expect(wrapper.classes()).not.toContain('is-swapped')
    })

    it('C-SPLIT-DBLCLICK-TOGGLE: Alt+double-click on the divider swaps sides and persists it', async () => {
      const wrapper = await mountSplit(true)
      await wrapper.find('.split-divider').trigger('dblclick', { altKey: true })
      expect(preferences.SET_SINGLE_PREFERENCE).toHaveBeenCalledWith({ type: 'splitViewSwapped', value: true })
      await nextTick()
      expect(wrapper.classes()).toContain('is-swapped')
    })

    it('C-SPLIT-DBLCLICK-TOGGLE R-2: the right-edge strip gates on width and diff, and enables split on double-click', async () => {
      const wrapper = await mountSplit(false)
      const strip = wrapper.find('.split-edge-strip')
      expect(strip.exists()).toBe(true)
      expect(strip.attributes('data-action')).toBe('toggle-split')
      await strip.trigger('dblclick')
      expect(busMock.emit).toHaveBeenCalledWith('cmd::execute', 'view.split-view')

      // Narrow container: the split cannot open, so no strip.
      await setWidth(700)
      expect(wrapper.find('.split-edge-strip').exists()).toBe(false)
      await setWidth(1000)
      expect(wrapper.find('.split-edge-strip').exists()).toBe(true)

      // Split on: the strip is gone (the divider owns toggling now).
      const on = await mountSplit(true)
      expect(on.find('.split-edge-strip').exists()).toBe(false)

      // Diff mode replaces the surface: no strip even while split is off.
      const diff = await mountSplit(false, { diffMode: true })
      expect(diff.find('.split-edge-strip').exists()).toBe(false)
    })
  })

  // ─── editorWithTabs/index.vue ────────────────────────────────

  const mountTabs = async (props) => {
    const EditorWithTabs = (await import('@/components/editorWithTabs/index.vue')).default
    const host = document.createElement('div')
    document.body.appendChild(host)
    const wrapper = shallowMount(EditorWithTabs, {
      attachTo: host,
      props: {
        markdown: '# Doc',
        cursor: {},
        sourceCode: false,
        showTabBar: false,
        textDirection: 'ltr',
        platform: 'darwin',
        ...props
      },
      global: {
        plugins: [pinia, i18n],
        stubs: { SplitView: false, Tabs: true, TabNotifications: true, DiffView: true }
      }
    })
    await setWidth(1200)
    return wrapper
  }

  const sources = (wrapper) => wrapper.findAllComponents({ name: 'sourceCode' })

  describe('pane roles', () => {
    // 20 s: this first pane-roles test pays the cold import of
    // editorWithTabs/index.vue (muya, CodeMirror, the outline rail), which
    // exceeds the 5 s default under a loaded full-suite run (C-40 review).
    it('split off: muya only, no source companion', async () => {
      const wrapper = await mountTabs({ splitView: false })
      expect(sources(wrapper)).toHaveLength(0)
      expect(wrapper.findComponent({ name: 'editor' }).props('mirror')).toBeFalsy()
    }, 20_000)

    it('C-SPLIT-DUAL-EDIT: split on in WYSIWYG mode — BOTH panes editable, source is the split companion', async () => {
      const wrapper = await mountTabs({ splitView: true })
      expect(wrapper.findComponent({ name: 'editor' }).props('mirror')).toBeFalsy()
      const [source] = sources(wrapper)
      expect(source.props('mirror')).toBeFalsy()
      expect(source.props('splitEdit')).toBe(true)
    })

    it('C-SPLIT-DUAL-EDIT corner-2: split on in source mode — one editable source instance, muya follows the store', async () => {
      const wrapper = await mountTabs({ splitView: true, sourceCode: true })
      expect(wrapper.findComponent({ name: 'editor' }).props('mirror')).toBeFalsy()
      const [source] = sources(wrapper)
      expect(source.props('mirror')).toBeFalsy()
      // Source mode owns the document: the pane is the editor, not the companion.
      expect(source.props('splitEdit')).toBe(false)
    })

    it('diff mode suppresses the split', async () => {
      const wrapper = await mountTabs({ splitView: true, diffMode: true })
      expect(sources(wrapper)).toHaveLength(0)
      expect(wrapper.find('.split-view').classes()).not.toContain('is-split')
    })

    it('corner-6: below 800px the split collapses and the mirror pane goes away', async () => {
      const wrapper = await mountTabs({ splitView: true })
      await setWidth(700)
      expect(sources(wrapper)).toHaveLength(0)
    })
  })

  // ─── sourceCode.vue mirror mode ──────────────────────────────

  const mountSource = async (props) => {
    const { useEditorStore } = await import('@/store/editor')
    const editorStore = useEditorStore()
    editorStore.currentFile = { id: 'tab-1', markdown: '# One', scrollTop: 42, blocks: ['b'], cursor: { c: 1 } }
    editorStore.tabs = [editorStore.currentFile]
    editorStore.updateTabIdToIndex()
    editorStore.LISTEN_FOR_CONTENT_CHANGE = vi.fn()
    const SourceCode = (await import('@/components/editorWithTabs/sourceCode.vue')).default
    const wrapper = shallowMount(SourceCode, {
      props: { markdown: '# One', textDirection: 'ltr', ...props },
      global: { plugins: [pinia, i18n] }
    })
    return { wrapper, editorStore }
  }

  describe('split companion (C-SPLIT-DUAL-EDIT)', () => {
    it('mounts editable with bus listeners and no tab-state resets', async () => {
      const { editorStore } = await mountSource({ splitEdit: true })
      const config = codeMirrorMock.mock.calls[0][1]
      expect(config.readOnly).toBeUndefined()
      expect(busMock.on).toHaveBeenCalledWith('file-changed', expect.any(Function))
      // The unified muya history owns undo: the undo/redo keys route to bus.
      expect(config.extraKeys['Cmd-Z']).toBeTypeOf('function')
      expect(editorStore.currentFile.scrollTop).toBe(42)
      expect(editorStore.currentFile.blocks).toEqual(['b'])
    })

    it('follows the markdown 150 ms after changes render-only and never commits', async () => {
      vi.useFakeTimers()
      const { wrapper, editorStore } = await mountSource({ splitEdit: true })
      cmInstance.getValue.mockReturnValue('# One')
      await wrapper.setProps({ markdown: '# One!' })
      editorStore.currentFile.markdown = '# One!!'
      await wrapper.setProps({ markdown: '# One!!' })
      vi.advanceTimersByTime(149)
      expect(cmInstance.setValue).not.toHaveBeenCalled()
      vi.advanceTimersByTime(1)
      expect(cmInstance.setValue).toHaveBeenCalledTimes(1)
      expect(cmInstance.setValue).toHaveBeenCalledWith('# One!!')
      // The unified history owns undo: CodeMirror's own stack is cleared.
      expect(cmInstance.clearHistory).toHaveBeenCalled()
      expect(editorStore.LISTEN_FOR_CONTENT_CHANGE).not.toHaveBeenCalled()
    })

    it('unmounting the companion commits its content through file-changed (the pane owns the tab text)', async () => {
      cmInstance.getValue.mockReturnValue('# One')
      const { wrapper } = await mountSource({ splitEdit: true })
      wrapper.unmount()
      expect(busMock.emit).toHaveBeenCalledWith('file-changed', expect.objectContaining({ id: 'tab-1' }))
    })
  })
})
