// FILE: tests/renderer/components/tabs-lock.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Verify the C-40 T-004 tab-chrome pieces — the lock badge on read-only tabs and the tab-context-menu bus handlers (lock/unlock, split view, copy-document flavors).
//   SCOPE: Vue/jsdom component tests over editorWithTabs/tabs.vue with mocked bus/dragula/contextMenu and a stubbed i18n.
//   DEPENDS: Vue Test Utils, Vitest, Pinia test setup, tests/renderer/setup.ts window shims.
//   LINKS: .grace/verification/runtime.xml V-M-011 scenario-55; .grace/changes/active/C-40 T-004.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   busListener - fetch the handler registered for a bus channel from the bus mock.
//   i18n - stub vue-i18n instance for tabs.vue and the context-menu labels.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-15 C-40 T-004 initial pins: badge on
//   previewMode tabs (hidden on editable ones), toggle-lock handler,
//   per-tab split view, exact copy-as-markdown write, rendered-flavor
//   activation + delayed dispatch.
// END_CHANGE_SUMMARY

import { shallowMount } from '@vue/test-utils'
import { setupTestPinia } from '../pinia'
import { createI18n } from 'vue-i18n'

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

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: { en: { tabs: { lockedTitle: 'Read-only' } } }
})

const busListener = (bus, channel) => {
  const call = bus.on.mock.calls.find((c) => c[0] === channel)
  return call ? call[1] : null
}

describe('tabs.vue — C-40 T-004 lock badge + document tools', () => {
  let pinia
  let editorStore
  let bus

  beforeEach(async () => {
    pinia = setupTestPinia()
    const editorMod = await import('@/store/editor')
    editorStore = editorMod.useEditorStore()
    editorStore.currentFile = {
      id: 'tab-1',
      filename: 'notes.md',
      pathname: '/tmp/notes.md',
      isSaved: true,
      markdown: '# notes',
      previewMode: false
    }
    editorStore.tabs = [editorStore.currentFile]
    bus = (await import('@/bus')).default
    bus.on.mockClear()
  })

  const mountTabs = async () => {
    const Tabs = (await import('@/components/editorWithTabs/tabs.vue')).default
    return shallowMount(Tabs, { global: { plugins: [pinia, i18n] } })
  }

  it('shows the lock badge on a read-only tab, not on an editable one', async () => {
    const wrapper = await mountTabs()
    expect(wrapper.find('.tab-lock-badge').exists()).toBe(false)

    editorStore.currentFile.previewMode = true
    await wrapper.vm.$nextTick()

    const badge = wrapper.find('.tab-lock-badge')
    expect(badge.exists()).toBe(true)
    expect(badge.attributes('title')).toBe('Read-only')
  })

  it('TABS::toggle-lock toggles the specific tab through the store action', async () => {
    await mountTabs()
    editorStore.TOGGLE_LOCK_DOCUMENT = vi.fn()

    const handler = busListener(bus, 'TABS::toggle-lock')
    expect(handler).toBeTruthy()
    handler('tab-1')
    expect(editorStore.TOGGLE_LOCK_DOCUMENT).toHaveBeenCalledWith('tab-1')
  })

  it('TABS::toggle-split-view flips the clicked tab only', async () => {
    editorStore.tabs = [
      editorStore.currentFile,
      { id: 'tab-2', filename: 'other.md', pathname: '/tmp/other.md', isSaved: true, markdown: '', splitView: false }
    ]
    await mountTabs()

    const handler = busListener(bus, 'TABS::toggle-split-view')
    handler('tab-2')
    expect(editorStore.tabs[1].splitView).toBe(true)
    expect(editorStore.tabs[0].splitView).toBeUndefined()
  })

  it('TABS::copy-as-markdown writes the clicked tab markdown to the clipboard', async () => {
    await mountTabs()
    window.electron.clipboard.writeText.mockClear()

    const handler = busListener(bus, 'TABS::copy-as-markdown')
    handler('tab-1')
    expect(window.electron.clipboard.writeText).toHaveBeenCalledWith('# notes')
  })

  it('TABS::copy-document-as activates a background tab then runs the editor pipeline', async () => {
    vi.useFakeTimers()
    try {
      const background = {
        id: 'tab-2',
        filename: 'other.md',
        pathname: '/tmp/other.md',
        isSaved: true,
        markdown: '# other'
      }
      editorStore.tabs = [editorStore.currentFile, background]
      await mountTabs()
      editorStore.UPDATE_CURRENT_FILE = vi.fn()

      const handler = busListener(bus, 'TABS::copy-document-as')

      // Background tab → activated first, HTML flavor after the settle delay.
      handler({ kind: 'html', tabId: 'tab-2' })
      expect(editorStore.UPDATE_CURRENT_FILE).toHaveBeenCalledWith(background)
      expect(bus.emit).not.toHaveBeenCalledWith('copyAsHtmlRich')
      vi.advanceTimersByTime(200)
      expect(bus.emit).toHaveBeenCalledWith('copyAsHtmlRich')

      // Current tab → no re-activation; structured flavor dispatches.
      bus.emit.mockClear()
      editorStore.UPDATE_CURRENT_FILE.mockClear()
      handler({ kind: 'structuredText', tabId: 'tab-1' })
      expect(editorStore.UPDATE_CURRENT_FILE).not.toHaveBeenCalled()
      vi.advanceTimersByTime(200)
      expect(bus.emit).toHaveBeenCalledWith('copyAsStructuredText')
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('contextMenu/tabs — C-40 T-004 entries', () => {
  it('registers the lock, split-view and copy-document handlers', async () => {
    const { HANDLERS, getLOCK, getSPLIT_VIEW, getCOPY_AS_MARKDOWN, getCOPY_AS_HTML, getCOPY_AS_STRUCTURED } =
      await import('@/contextMenu/tabs/menuItems')

    for (const id of ['lockDocument', 'splitView', 'copyAsMarkdown', 'copyAsHtml', 'copyAsStructuredText']) {
      expect(HANDLERS[id], id).toBeTypeOf('function')
    }
    // Label flips with the tab state; the id stays stable.
    expect(getLOCK(false).id).toBe('lockDocument')
    expect(getLOCK(true).id).toBe('lockDocument')
    expect(getSPLIT_VIEW().id).toBe('splitView')
    expect(getCOPY_AS_MARKDOWN().id).toBe('copyAsMarkdown')
    expect(getCOPY_AS_HTML().id).toBe('copyAsHtml')
    expect(getCOPY_AS_STRUCTURED().id).toBe('copyAsStructuredText')
  })

  it('showContextMenu passes the lock, split-view and copy items to the native menu', async () => {
    // The component-level mock above covers tabs.vue; assert the REAL
    // menu builder (label i18n loads the real en table — ids are stable).
    const { showContextMenu } = await vi.importActual('@/contextMenu/tabs/index')
    window.electron.ipcRenderer.invoke.mockResolvedValue(null)

    const tab = { id: 'tab-1', pathname: '/tmp/x.md', locked: false }
    await showContextMenu({ clientX: 1, clientY: 2 }, tab)

    const payload = window.electron.ipcRenderer.invoke.mock.calls[0][1]
    const ids = payload.items.filter((i) => i.type !== 'separator').map((i) => i.id)
    expect(ids).toEqual([
      'closeThisTab', 'closeOtherTabs', 'closeSavedTabs', 'closeAllTabs',
      'lockDocument', 'splitView', 'copyAsMarkdown', 'copyAsHtml',
      'copyAsStructuredText', 'renameFile', 'copyPath', 'showInFolder'
    ])
    // Separators between the groups.
    expect(payload.items.filter((i) => i.type === 'separator').length).toBe(2)
  })
})
