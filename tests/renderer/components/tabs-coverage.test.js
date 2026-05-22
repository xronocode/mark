/**
 * Coverage tests for editorWithTabs/tabs.vue
 *
 * Exercises all methods, bus event handlers, scroll behavior,
 * context menu, drag-and-drop callbacks, and lifecycle hooks
 * that are NOT covered by the base tabs.test.js.
 */
import { shallowMount } from '@vue/test-utils'
import { setupTestPinia } from '../pinia'
import { createI18n } from 'vue-i18n'

/* ── hoisted mock state ─────────────────────────────────────────── */
const busMock = vi.hoisted(() => ({
  on: vi.fn(),
  off: vi.fn(),
  emit: vi.fn()
}))

const showContextMenuMock = vi.hoisted(() => vi.fn())

const dragulaInstance = vi.hoisted(() => ({
  on: vi.fn().mockReturnThis(),
  destroy: vi.fn(),
  dragging: false
}))
const dragulaMock = vi.hoisted(() => vi.fn(() => dragulaInstance))

const autoScrollInstance = vi.hoisted(() => ({
  down: false,
  destroy: vi.fn()
}))
const autoScrollMock = vi.hoisted(() => vi.fn(() => autoScrollInstance))

/* ── mocks ──────────────────────────────────────────────────────── */
vi.mock('@/bus', () => ({ default: busMock }))
vi.mock('dom-autoscroller', () => ({ default: autoScrollMock }))
vi.mock('dragula', () => ({ default: dragulaMock }))
vi.mock('@/contextMenu/tabs', () => ({
  showContextMenu: showContextMenuMock
}))

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: {} } })

describe('tabs.vue — coverage', () => {
  let pinia, editorStore, layoutStore

  const seedStores = async (extraTabs = []) => {
    pinia = setupTestPinia()
    const { useEditorStore } = await import('@/store/editor')
    const { useLayoutStore } = await import('@/store/layout')
    editorStore = useEditorStore()
    layoutStore = useLayoutStore()
    const tab1 = {
      id: 'tab-1',
      filename: 'hello.md',
      pathname: '/tmp/hello.md',
      isSaved: true
    }
    const tab2 = {
      id: 'tab-2',
      filename: 'world.md',
      pathname: '/tmp/world.md',
      isSaved: false
    }
    editorStore.currentFile = tab1
    editorStore.tabs = [tab1, tab2, ...extraTabs]

    // Stub store actions that tabs.vue calls
    editorStore.UPDATE_CURRENT_FILE = vi.fn()
    editorStore.FORCE_CLOSE_TAB = vi.fn()
    editorStore.CLOSE_UNSAVED_TAB = vi.fn()
    editorStore.NEW_UNTITLED_TAB = vi.fn()
    editorStore.CLOSE_TAB = vi.fn()
    editorStore.CLOSE_OTHER_TABS = vi.fn()
    editorStore.CLOSE_SAVED_TABS = vi.fn()
    editorStore.CLOSE_ALL_TABS = vi.fn()
    editorStore.EXCHANGE_TABS_BY_ID = vi.fn()
    editorStore.RENAME_FILE = vi.fn()
    layoutStore.CHANGE_SIDE_BAR_WIDTH = vi.fn()
  }

  const mountTabs = async () => {
    const Tabs = (await import('@/components/editorWithTabs/tabs.vue')).default
    return shallowMount(Tabs, {
      global: { plugins: [pinia, i18n] }
    })
  }

  beforeEach(async () => {
    // Re-establish mock return values after vi.resetAllMocks() from setup.ts afterEach
    dragulaInstance.on.mockReturnThis()
    await seedStores()
  })

  /* ── selectFile ─────────────────────────────────────────────── */
  it('selectFile calls UPDATE_CURRENT_FILE when clicking a non-active tab', async () => {
    const wrapper = await mountTabs()
    const items = wrapper.findAll('li')
    await items[1].trigger('click')
    expect(editorStore.UPDATE_CURRENT_FILE).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'tab-2' })
    )
  })

  it('selectFile does NOT call UPDATE_CURRENT_FILE when clicking the active tab', async () => {
    const wrapper = await mountTabs()
    const items = wrapper.findAll('li')
    await items[0].trigger('click')
    expect(editorStore.UPDATE_CURRENT_FILE).not.toHaveBeenCalled()
  })

  /* ── removeFileInTab ───────────────────────────────────────── */
  it('removeFileInTab calls FORCE_CLOSE_TAB for a saved file', async () => {
    const wrapper = await mountTabs()
    const closeIcons = wrapper.findAll('svg.close-icon')
    await closeIcons[0].trigger('click')
    expect(editorStore.FORCE_CLOSE_TAB).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'tab-1' })
    )
  })

  it('removeFileInTab calls CLOSE_UNSAVED_TAB for an unsaved file', async () => {
    const wrapper = await mountTabs()
    const closeIcons = wrapper.findAll('svg.close-icon')
    await closeIcons[1].trigger('click')
    expect(editorStore.CLOSE_UNSAVED_TAB).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'tab-2' })
    )
  })

  /* ── newFile ───────────────────────────────────────────────── */
  it('newFile button calls NEW_UNTITLED_TAB', async () => {
    const wrapper = await mountTabs()
    await wrapper.find('.new-file').trigger('click')
    expect(editorStore.NEW_UNTITLED_TAB).toHaveBeenCalledWith({})
  })

  /* ── middle-click to close ─────────────────────────────────── */
  it('closeTab via bus handler calls CLOSE_TAB for matching tab', async () => {
    await mountTabs()
    const call = busMock.on.mock.calls.find((c) => c[0] === 'TABS::close-this')
    call[1]('tab-1')
    expect(editorStore.CLOSE_TAB).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'tab-1' })
    )
  })

  /* ── handleContextMenu ─────────────────────────────────────── */
  it('contextmenu calls showContextMenu for a tab with an id', async () => {
    const wrapper = await mountTabs()
    const items = wrapper.findAll('li')
    // @contextmenu.prevent triggers on right-click contextmenu event
    await items[0].trigger('contextmenu')
    expect(showContextMenuMock).toHaveBeenCalled()
  })

  it('contextmenu does nothing for a tab without an id', async () => {
    await seedStores([{ id: '', filename: 'no-id.md', pathname: '', isSaved: true }])
    const wrapper = await mountTabs()
    const items = wrapper.findAll('li')
    const lastItem = items[items.length - 1]
    showContextMenuMock.mockClear()
    await lastItem.trigger('contextmenu')
    expect(showContextMenuMock).not.toHaveBeenCalled()
  })

  /* ── handleTabScroll ───────────────────────────────────────── */
  it('handles wheel events on the tab container', async () => {
    const wrapper = await mountTabs()
    const tabContainer = wrapper.find('.scrollable-tabs')
    const wheelEvent = new WheelEvent('wheel', { deltaY: 50, deltaX: 0, bubbles: true })
    tabContainer.element.dispatchEvent(wheelEvent)
  })

  it('prefers deltaX over deltaY when deltaX is non-zero', async () => {
    const wrapper = await mountTabs()
    const tabContainer = wrapper.find('.scrollable-tabs')
    const wheelEvent = new WheelEvent('wheel', { deltaY: 50, deltaX: 30, bubbles: true })
    tabContainer.element.dispatchEvent(wheelEvent)
  })

  /* ── bus event: closeTab ───────────────────────────────────── */
  it('closeTab (bus) does nothing if tab id not found', async () => {
    await mountTabs()
    const call = busMock.on.mock.calls.find((c) => c[0] === 'TABS::close-this')
    call[1]('nonexistent')
    expect(editorStore.CLOSE_TAB).not.toHaveBeenCalled()
  })

  /* ── bus event: closeOthers ────────────────────────────────── */
  it('closeOthers calls CLOSE_OTHER_TABS', async () => {
    await mountTabs()
    const call = busMock.on.mock.calls.find((c) => c[0] === 'TABS::close-others')
    call[1]('tab-1')
    expect(editorStore.CLOSE_OTHER_TABS).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'tab-1' })
    )
  })

  it('closeOthers does nothing for unknown id', async () => {
    await mountTabs()
    const call = busMock.on.mock.calls.find((c) => c[0] === 'TABS::close-others')
    call[1]('unknown')
    expect(editorStore.CLOSE_OTHER_TABS).not.toHaveBeenCalled()
  })

  /* ── bus event: closeSaved ─────────────────────────────────── */
  it('closeSaved calls CLOSE_SAVED_TABS', async () => {
    await mountTabs()
    const call = busMock.on.mock.calls.find((c) => c[0] === 'TABS::close-saved')
    call[1]()
    expect(editorStore.CLOSE_SAVED_TABS).toHaveBeenCalled()
  })

  /* ── bus event: closeAll ───────────────────────────────────── */
  it('closeAll calls CLOSE_ALL_TABS', async () => {
    await mountTabs()
    const call = busMock.on.mock.calls.find((c) => c[0] === 'TABS::close-all')
    call[1]()
    expect(editorStore.CLOSE_ALL_TABS).toHaveBeenCalled()
  })

  /* ── bus event: rename ─────────────────────────────────────── */
  it('rename calls RENAME_FILE for a tab with pathname', async () => {
    await mountTabs()
    const call = busMock.on.mock.calls.find((c) => c[0] === 'TABS::rename')
    call[1]('tab-1')
    expect(editorStore.RENAME_FILE).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'tab-1' })
    )
  })

  it('rename does nothing for tab without pathname', async () => {
    await seedStores([{ id: 'tab-3', filename: 'nopath.md', pathname: '', isSaved: true }])
    await mountTabs()
    const call = busMock.on.mock.calls.find((c) => c[0] === 'TABS::rename')
    call[1]('tab-3')
    expect(editorStore.RENAME_FILE).not.toHaveBeenCalled()
  })

  it('rename does nothing for unknown tab id', async () => {
    await mountTabs()
    const call = busMock.on.mock.calls.find((c) => c[0] === 'TABS::rename')
    call[1]('unknown')
    expect(editorStore.RENAME_FILE).not.toHaveBeenCalled()
  })

  /* ── bus event: copyPath ───────────────────────────────────── */
  it('copyPath writes pathname to clipboard', async () => {
    await mountTabs()
    const call = busMock.on.mock.calls.find((c) => c[0] === 'TABS::copy-path')
    call[1]('tab-1')
    expect(window.electron.clipboard.writeText).toHaveBeenCalledWith('/tmp/hello.md')
  })

  it('copyPath does nothing for tab without pathname', async () => {
    await seedStores([{ id: 'tab-np', filename: 'x.md', pathname: '', isSaved: true }])
    await mountTabs()
    const call = busMock.on.mock.calls.find((c) => c[0] === 'TABS::copy-path')
    call[1]('tab-np')
    expect(window.electron.clipboard.writeText).not.toHaveBeenCalled()
  })

  /* ── bus event: showInFolder ───────────────────────────────── */
  it('showInFolder calls shell.showItemInFolder', async () => {
    await mountTabs()
    const call = busMock.on.mock.calls.find((c) => c[0] === 'TABS::show-in-folder')
    call[1]('tab-1')
    expect(window.electron.shell.showItemInFolder).toHaveBeenCalledWith('/tmp/hello.md')
  })

  it('showInFolder does nothing for tab without pathname', async () => {
    await seedStores([{ id: 'tab-np2', filename: 'y.md', pathname: '', isSaved: true }])
    await mountTabs()
    const call = busMock.on.mock.calls.find((c) => c[0] === 'TABS::show-in-folder')
    call[1]('tab-np2')
    expect(window.electron.shell.showItemInFolder).not.toHaveBeenCalled()
  })

  /* ── bus event: changeMaxWidth ─────────────────────────────── */
  it('changeMaxWidth calls CHANGE_SIDE_BAR_WIDTH', async () => {
    await mountTabs()
    const call = busMock.on.mock.calls.find((c) => c[0] === 'EDITOR_TABS::change-max-width')
    call[1](300)
    expect(layoutStore.CHANGE_SIDE_BAR_WIDTH).toHaveBeenCalledWith(300)
  })

  /* ── dragula drop callback ─────────────────────────────────── */
  it('dragula drop handler calls EXCHANGE_TABS_BY_ID with normal sibling', async () => {
    await mountTabs()
    const dropCall = dragulaInstance.on.mock.calls.find((c) => c[0] === 'drop')
    expect(dropCall).toBeTruthy()
    const dropCb = dropCall[1]

    const el = document.createElement('li')
    el.setAttribute('data-id', 'tab-1')
    const sibling = document.createElement('li')
    sibling.setAttribute('data-id', 'tab-2')

    dropCb(el, null, null, sibling)
    expect(editorStore.EXCHANGE_TABS_BY_ID).toHaveBeenCalledWith({
      fromId: 'tab-1',
      toId: 'tab-2'
    })
  })

  it('dragula drop handler treats null sibling as last tab', async () => {
    await mountTabs()
    const dropCall = dragulaInstance.on.mock.calls.find((c) => c[0] === 'drop')
    const dropCb = dropCall[1]

    const el = document.createElement('li')
    el.setAttribute('data-id', 'tab-1')

    dropCb(el, null, null, null)
    expect(editorStore.EXCHANGE_TABS_BY_ID).toHaveBeenCalledWith({
      fromId: 'tab-1',
      toId: null
    })
  })

  it('dragula drop handler logs error for gu-mirror sibling (no data-id)', async () => {
    // A gu-mirror sibling has no data-id, so the guard fires
    await mountTabs()
    const dropCall = dragulaInstance.on.mock.calls.find((c) => c[0] === 'drop')
    const dropCb = dropCall[1]

    const el = document.createElement('li')
    el.setAttribute('data-id', 'tab-1')
    const mirror = document.createElement('li')
    mirror.classList.add('gu-mirror')
    // no data-id => nextTabId is null => (sibling && !nextTabId) is true => error

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    dropCb(el, null, null, mirror)
    expect(consoleSpy).toHaveBeenCalled()
    expect(editorStore.EXCHANGE_TABS_BY_ID).not.toHaveBeenCalled()
    consoleSpy.mockRestore()
  })

  it('dragula drop handler logs error when dropped element has no data-id', async () => {
    await mountTabs()
    const dropCall = dragulaInstance.on.mock.calls.find((c) => c[0] === 'drop')
    const dropCb = dropCall[1]

    const el = document.createElement('li')
    const sibling = document.createElement('li')
    sibling.setAttribute('data-id', 'tab-2')

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    dropCb(el, null, null, sibling)
    expect(editorStore.EXCHANGE_TABS_BY_ID).not.toHaveBeenCalled()
    expect(consoleSpy).toHaveBeenCalled()
    consoleSpy.mockRestore()
  })

  it('dragula drop handler logs error when sibling has no data-id', async () => {
    await mountTabs()
    const dropCall = dragulaInstance.on.mock.calls.find((c) => c[0] === 'drop')
    const dropCb = dropCall[1]

    const el = document.createElement('li')
    el.setAttribute('data-id', 'tab-1')
    const sibling = document.createElement('li')

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    dropCb(el, null, null, sibling)
    expect(editorStore.EXCHANGE_TABS_BY_ID).not.toHaveBeenCalled()
    expect(consoleSpy).toHaveBeenCalled()
    consoleSpy.mockRestore()
  })

  /* ── autoScroll callback ───────────────────────────────────── */
  it('autoScroll callback checks drake.dragging and autoScroller.down', async () => {
    await mountTabs()
    const config = autoScrollMock.mock.calls[autoScrollMock.mock.calls.length - 1][1]
    expect(config.autoScroll).toBeDefined()

    // The callback accesses the component's local `drake` and `autoScroller`
    // variables. `drake` is `dragulaInstance` (returned by dragula mock)
    // and `autoScroller` is `autoScrollInstance` (returned by autoScroll mock).
    // Set properties on the actual instances the component captured:
    autoScrollInstance.down = false
    dragulaInstance.dragging = false
    expect(config.autoScroll()).toBe(false)

    autoScrollInstance.down = true
    dragulaInstance.dragging = true
    expect(config.autoScroll()).toBe(true)

    autoScrollInstance.down = true
    dragulaInstance.dragging = false
    expect(config.autoScroll()).toBe(false)
  })

  /* ── onBeforeUnmount ───────────────────────────────────────── */
  it('unmount cleans up bus event listeners', async () => {
    const wrapper = await mountTabs()
    wrapper.unmount()
    expect(busMock.off).toHaveBeenCalledWith('TABS::close-this', expect.any(Function))
    expect(busMock.off).toHaveBeenCalledWith('TABS::close-others', expect.any(Function))
    expect(busMock.off).toHaveBeenCalledWith('TABS::close-saved', expect.any(Function))
    expect(busMock.off).toHaveBeenCalledWith('TABS::close-all', expect.any(Function))
    expect(busMock.off).toHaveBeenCalledWith('TABS::rename', expect.any(Function))
    expect(busMock.off).toHaveBeenCalledWith('TABS::copy-path', expect.any(Function))
    expect(busMock.off).toHaveBeenCalledWith('TABS::show-in-folder', expect.any(Function))
    expect(busMock.off).toHaveBeenCalledWith(
      'EDITOR_TABS::change-max-width',
      expect.any(Function)
    )
  })

  it('unmount destroys drake and autoScroller', async () => {
    const wrapper = await mountTabs()
    // Capture references before unmount
    dragulaInstance.destroy.mockClear()
    autoScrollInstance.destroy.mockClear()
    wrapper.unmount()
    expect(dragulaInstance.destroy).toHaveBeenCalled()
    expect(autoScrollInstance.destroy).toHaveBeenCalledWith(true)
  })

  /* ── unsaved CSS class ─────────────────────────────────────── */
  it('applies unsaved class to unsaved tabs', async () => {
    const wrapper = await mountTabs()
    const unsaved = wrapper.findAll('li.unsaved')
    expect(unsaved.length).toBe(1)
    expect(unsaved[0].text()).toContain('world.md')
  })

  /* ── tab title attribute ───────────────────────────────────── */
  it('sets title attribute to pathname', async () => {
    const wrapper = await mountTabs()
    const items = wrapper.findAll('li')
    expect(items[0].attributes('title')).toBe('/tmp/hello.md')
  })

  /* ── data-id attribute ─────────────────────────────────────── */
  it('sets data-id attribute on each tab', async () => {
    const wrapper = await mountTabs()
    const items = wrapper.findAll('li')
    expect(items[0].attributes('data-id')).toBe('tab-1')
    expect(items[1].attributes('data-id')).toBe('tab-2')
  })
})
