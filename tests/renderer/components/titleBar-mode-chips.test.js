// FILE: tests/renderer/components/titleBar-mode-chips.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: C-TITLEBAR-MODE-CHIPS T-004 — the chips render matrix:
//            flag-truth view selection, compact writing chips, the empty
//            standard/no-document states, tab-switch swap, the narrow
//            split note, the open-menu emit and the render marker.
//   SCOPE: Deterministic Vue/jsdom tests over titleBar/modeChips.vue with
//          real Pinia stores and an inline English i18n table.
//   DEPENDS: Vue Test Utils, Vitest, Pinia test setup, vue-i18n,
//            titleBar/modeChips.vue.
//   LINKS: .grace/verification/runtime.xml V-M-062; .grace/graph/runtime.xml
//          M-062; .grace/changes/active/C-TITLEBAR-MODE-CHIPS/spec.xml
//          R-1, R-4, R-7.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   CHIPS - English table carrying the seventeen modeChips families.
//   i18n - vue-i18n instance built from CHIPS.
//   mountChips - mount helper with Pinia and i18n installed.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-27 C-TITLEBAR-MODE-CHIPS T-004: initial
//   render-matrix pins for the chips cluster.
// END_CHANGE_SUMMARY

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { setupTestPinia } from '../pinia'

// jsdom mounts the whole chips component; under full-suite load the first
// mount can exceed the 5 s default, so this suite gets a wider budget.
vi.setConfig({ testTimeout: 20_000 })

const CHIPS = {
  split: 'Split',
  source: 'Source',
  changes: 'Changes',
  typewriter: 'Typewriter',
  focus: 'Focus',
  standard: 'Standard',
  hintStandard: 'return to the standard view and turn writing modes off',
  hintSplit: 'source and rendered side by side',
  hintSource: 'edit the raw markdown',
  hintChanges: 'compare against the saved file',
  hintTypewriter: 'the cursor line stays at one height while the text scrolls',
  hintFocus: 'dims everything except the paragraph you are editing',
  viewGroup: 'Document View',
  writingGroup: 'Writing Modes',
  narrowNote: 'The window is too narrow for two panes — widen it to see both.'
}

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: { en: { titleBar: { modeChips: CHIPS } } }
})

const mountChips = async (storeState = {}) => {
  setupTestPinia()
  const { useEditorStore } = await import('@/store/editor')
  const { usePreferencesStore } = await import('@/store/preferences')
  const editor = useEditorStore()
  const prefs = usePreferencesStore()
  editor.currentFile = storeState.tab ?? { id: 'tab-1', splitView: false, diffMode: false }
  Object.assign(prefs, storeState.prefs ?? {})
  const ModeChips = (await import('@/components/titleBar/modeChips.vue')).default
  const wrapper = mount(ModeChips, { global: { plugins: [i18n] } })
  return { wrapper, editor, prefs }
}

describe('titleBar mode chips (C-TITLEBAR-MODE-CHIPS T-004)', () => {
  let debugSpy

  beforeEach(() => {
    debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})
  })

  afterEach(() => {
    debugSpy.mockRestore()
    vi.restoreAllMocks()
  })

  it('renders nothing in the standard state', async () => {
    const { wrapper } = await mountChips()
    expect(wrapper.find('[data-testid="mode-chips"]').exists()).toBe(false)
    expect(wrapper.findAll('button')).toHaveLength(0)
  })

  it('renders nothing with no document open, even with writing modes on', async () => {
    const { wrapper } = await mountChips({
      tab: {},
      prefs: { typewriter: true, focus: true }
    })
    expect(wrapper.find('[data-testid="mode-chips"]').exists()).toBe(false)
  })

  it('shows the Split chip with its short label and hint tooltip', async () => {
    const { wrapper } = await mountChips({ tab: { id: 'tab-1', splitView: true } })
    const buttons = wrapper.findAll('button')
    expect(buttons).toHaveLength(1)
    expect(buttons[0].text()).toBe('Split')
    expect(buttons[0].attributes('aria-label')).toBe('Split')
    expect(buttons[0].attributes('title')).toBe(CHIPS.hintSplit)
    expect(buttons[0].attributes('aria-haspopup')).toBe('menu')
  })

  it('lets diff mode outrank a stale split flag', async () => {
    const { wrapper } = await mountChips({
      tab: { id: 'tab-1', splitView: true, diffMode: true }
    })
    expect(wrapper.findAll('button')).toHaveLength(1)
    expect(wrapper.find('button').text()).toBe('Changes')
    expect(wrapper.find('button').attributes('title')).toBe(CHIPS.hintChanges)
  })

  it('falls back to the source-code view when no tab view flag is set', async () => {
    const { wrapper } = await mountChips({ prefs: { sourceCode: true } })
    expect(wrapper.find('button').text()).toBe('Source')
  })

  it('adds compact icon chips for the active writing modes, at most three total', async () => {
    const { wrapper } = await mountChips({
      tab: { id: 'tab-1', splitView: true },
      prefs: { typewriter: true, focus: true }
    })
    const buttons = wrapper.findAll('button')
    expect(buttons).toHaveLength(3)
    expect(buttons[1].text()).toBe('')
    expect(buttons[1].attributes('aria-label')).toBe('Typewriter')
    expect(buttons[1].attributes('title')).toBe(CHIPS.hintTypewriter)
    expect(buttons[2].attributes('aria-label')).toBe('Focus')
    expect(buttons[2].attributes('title')).toBe(CHIPS.hintFocus)
  })

  it('swaps the view chip on tab switch and keeps the writing chip', async () => {
    const { wrapper, editor } = await mountChips({
      tab: { id: 'tab-1', splitView: true },
      prefs: { typewriter: true }
    })
    expect(wrapper.findAll('button')).toHaveLength(2)

    editor.currentFile = { id: 'tab-2', splitView: false }
    await wrapper.vm.$nextTick()

    const buttons = wrapper.findAll('button')
    expect(buttons).toHaveLength(1)
    expect(buttons[0].attributes('aria-label')).toBe('Typewriter')
  })

  it('adds the narrow-window note to the Split tooltip below 800px', async () => {
    const surface = document.createElement('div')
    surface.className = 'editor-with-tabs'
    Object.defineProperty(surface, 'clientWidth', { configurable: true, value: 520 })
    document.body.appendChild(surface)

    try {
      const { wrapper } = await mountChips({ tab: { id: 'tab-1', splitView: true } })
      const title = wrapper.find('button').attributes('title')
      expect(title).toContain(CHIPS.hintSplit)
      expect(title).toContain(CHIPS.narrowNote)
    } finally {
      surface.remove()
    }
  })

  it('emits open-menu with the clicked chip as the anchor', async () => {
    const { wrapper } = await mountChips({ tab: { id: 'tab-1', splitView: true } })
    await wrapper.find('button').trigger('click')
    const events = wrapper.emitted('open-menu')
    expect(events).toHaveLength(1)
    expect(events[0][0].anchor).toBeTruthy()
  })

  describe('switch menu (T-005)', () => {
    let bus
    let detach

    const attachCommandStub = async () => {
      bus = (await import('@/bus')).default
      const { useEditorStore } = await import('@/store/editor')
      const { usePreferencesStore } = await import('@/store/preferences')
      const handler = (id) => {
        const editor = useEditorStore()
        const prefs = usePreferencesStore()
        const current = editor.currentFile
        if (id === 'view.split-view' && current) current.splitView = !current.splitView
        if (id === 'view.diff-mode' && current) current.diffMode = !current.diffMode
        if (id === 'view.source-code-mode') prefs.sourceCode = !prefs.sourceCode
        if (id === 'view.typewriter-mode') prefs.typewriter = !prefs.typewriter
        if (id === 'view.focus-mode') prefs.focus = !prefs.focus
      }
      bus.on('cmd::execute', handler)
      detach = () => bus.off('cmd::execute', handler)
    }

    afterEach(() => {
      if (detach) detach()
      detach = null
    })

    const openMenu = async (wrapper) => {
      await wrapper.find('[data-testid="mode-chips"] button').trigger('click')
      await wrapper.vm.$nextTick()
      return wrapper.find('[data-testid="mode-menu"]')
    }

    it('opens both groups with the shipped shortcuts and the reset row', async () => {
      const { wrapper } = await mountChips({ tab: { id: 'tab-1', splitView: true } })
      const menu = await openMenu(wrapper)
      expect(menu.exists()).toBe(true)
      expect(menu.text()).toContain('Document View')
      expect(menu.text()).toContain('Writing Modes')
      expect(menu.text()).toMatch(/⌥⌘\\|Ctrl\+Alt\+\\/)
      expect(menu.text()).toMatch(/⌘D|Ctrl\+D/)
      const rows = menu.findAll('[role="menuitemradio"]')
      expect(rows).toHaveLength(4)
      expect(rows[1].attributes('aria-checked')).toBe('true')
    })

    it('switches from split to changes in one action (both flags flip)', async () => {
      await attachCommandStub()
      const { wrapper, editor } = await mountChips({
        tab: { id: 'tab-1', splitView: true, diffMode: false }
      })
      const menu = await openMenu(wrapper)
      const changes = menu.findAll('[role="menuitemradio"]')[3]
      await changes.trigger('click')
      await wrapper.vm.$nextTick()
      expect(editor.currentFile.splitView).toBe(false)
      expect(editor.currentFile.diffMode).toBe(true)
    })

    it('normalizes to standard from any state', async () => {
      await attachCommandStub()
      const { wrapper, editor, prefs } = await mountChips({
        tab: { id: 'tab-1', splitView: true, diffMode: true },
        prefs: { sourceCode: true, typewriter: true, focus: true }
      })
      const menu = await openMenu(wrapper)
      await menu.findAll('[role="menuitemradio"]')[0].trigger('click')
      await wrapper.vm.$nextTick()
      expect(editor.currentFile.splitView).toBe(false)
      expect(editor.currentFile.diffMode).toBe(false)
      expect(prefs.sourceCode).toBe(false)
      expect(prefs.typewriter).toBe(false)
      expect(prefs.focus).toBe(false)
    })

    it('keeps source code when picking split and clears diff mode', async () => {
      await attachCommandStub()
      const { wrapper, editor, prefs } = await mountChips({
        tab: { id: 'tab-1', diffMode: true },
        prefs: { sourceCode: true }
      })
      const menu = await openMenu(wrapper)
      await menu.findAll('[role="menuitemradio"]')[1].trigger('click')
      await wrapper.vm.$nextTick()
      expect(editor.currentFile.diffMode).toBe(false)
      expect(editor.currentFile.splitView).toBe(true)
      expect(prefs.sourceCode).toBe(true)
    })

    it('toggles a writing mode and checks its row', async () => {
      await attachCommandStub()
      const { wrapper, prefs } = await mountChips({ tab: { id: 'tab-1', splitView: true } })
      const menu = await openMenu(wrapper)
      const typewriterRow = menu.findAll('[role="menuitemcheckbox"]')[0]
      expect(typewriterRow.attributes('aria-checked')).toBe('false')
      await typewriterRow.trigger('click')
      await wrapper.vm.$nextTick()
      expect(prefs.typewriter).toBe(true)
      const refreshed = wrapper.find('[data-testid="mode-menu"]').findAll('[role="menuitemcheckbox"]')[0]
      expect(refreshed.attributes('aria-checked')).toBe('true')
    })

    it('stays open on inside interactions and closes on outside click', async () => {
      const { wrapper } = await mountChips({ tab: { id: 'tab-1', splitView: true } })
      await openMenu(wrapper)
      await wrapper.find('[data-testid="mode-menu"]').trigger('click')
      expect(wrapper.find('[data-testid="mode-menu"]').exists()).toBe(true)
      document.dispatchEvent(new Event('pointerdown'))
      await wrapper.vm.$nextTick()
      expect(wrapper.find('[data-testid="mode-menu"]').exists()).toBe(false)
    })

    it('closes on Escape', async () => {
      const { wrapper } = await mountChips({ tab: { id: 'tab-1', splitView: true } })
      await openMenu(wrapper)
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
      await wrapper.vm.$nextTick()
      expect(wrapper.find('[data-testid="mode-menu"]').exists()).toBe(false)
    })
  })

  it('logs the content-free render marker on state changes', async () => {
    const { wrapper } = await mountChips({
      tab: { id: 'tab-1', diffMode: true },
      prefs: { focus: true }
    })
    const lines = debugSpy.mock.calls.map((c) => String(c[0]))
    expect(
      lines.some((line) =>
        line.includes('[TitleBar][mode-chips][BLOCK_CHIPS_RENDERED view=changes writing=focus tab=tab-1]')
      )
    ).toBe(true)
    expect(wrapper.findAll('button')).toHaveLength(2)
  })
})

describe('mode chips branch coverage (C-TITLEBAR-MODE-CHIPS)', () => {
  afterEach(() => {
    vi.doUnmock('@/util')
    vi.resetModules()
  })

  it('renders the macOS shortcut glyphs when the platform is macOS', async () => {
    vi.resetModules()
    vi.doMock('@/util', async () => {
      const actual = await vi.importActual('@/util')
      return { ...actual, isOsx: true }
    })
    const { wrapper } = await mountChips({ tab: { id: 'tab-1', splitView: true } })
    await wrapper.find('[data-testid="mode-chips"] button').trigger('click')
    expect(wrapper.find('[data-testid="mode-menu"]').text()).toMatch(/⌥⌘\\/)
  })

  it('keeps the menu open state stable on the second chip click', async () => {
    const { wrapper } = await mountChips({ tab: { id: 'tab-1', splitView: true } })
    const chip = wrapper.find('[data-testid="mode-chips"] button')
    await chip.trigger('click')
    expect(wrapper.find('[data-testid="mode-menu"]').exists()).toBe(true)
    await chip.trigger('click')
    expect(wrapper.find('[data-testid="mode-menu"]').exists()).toBe(false)
  })

  it('ignores outside clicks and non-Escape keys while the menu is closed', async () => {
    await mountChips({ tab: { id: 'tab-1', splitView: true } })
    expect(() => document.dispatchEvent(new Event('pointerdown'))).not.toThrow()
    expect(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }))).not.toThrow()
    expect(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))).not.toThrow()
  })

  it('measures the window when no editor surface is mounted', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(window, 'innerWidth')
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 700 })
    try {
      const { wrapper } = await mountChips({ tab: { id: 'tab-1', splitView: true } })
      expect(wrapper.find('button').attributes('title')).toMatch(/too narrow/)
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200 })
      window.dispatchEvent(new Event('resize'))
      await wrapper.vm.$nextTick()
      expect(wrapper.find('button').attributes('title')).not.toMatch(/too narrow/)
    } finally {
      if (descriptor) Object.defineProperty(window, 'innerWidth', descriptor)
    }
  })

  it('observes the editor surface and disconnects on unmount', async () => {
    const observe = vi.fn()
    const disconnect = vi.fn()
    const Original = globalThis.ResizeObserver
    globalThis.ResizeObserver = class {
      observe(...args) { observe(...args) }
      disconnect(...args) { disconnect(...args) }
    }
    const surface = document.createElement('div')
    surface.className = 'editor-with-tabs'
    Object.defineProperty(surface, 'clientWidth', { configurable: true, value: 1200 })
    document.body.appendChild(surface)
    try {
      const { wrapper } = await mountChips({ tab: { id: 'tab-1', splitView: true } })
      expect(observe).toHaveBeenCalled()
      wrapper.unmount()
      expect(disconnect).toHaveBeenCalled()
    } finally {
      surface.remove()
      globalThis.ResizeObserver = Original
    }
  })

  it('applies menu selections that are already in effect as no-ops', async () => {
    const bus = (await import('@/bus')).default
    const emitted = []
    const handler = (id) => emitted.push(id)
    bus.on('cmd::execute', handler)
    try {
      const { wrapper } = await mountChips({ tab: { id: 'tab-1' }, prefs: { typewriter: true } })
      await wrapper.find('[data-testid="mode-chips"] button').trigger('click')
      const rows = wrapper.find('[data-testid="mode-menu"]').findAll('[role="menuitemradio"]')
      await rows[0].trigger('click') // standard is the full reset: only writing modes emit
      expect(emitted).toEqual(['view.typewriter-mode'])
    } finally {
      bus.off('cmd::execute', handler)
    }
  })

  it('toggles focus and logs the action', async () => {
    const bus = (await import('@/bus')).default
    const emitted = []
    const handler = (id) => emitted.push(id)
    bus.on('cmd::execute', handler)
    try {
      const { wrapper } = await mountChips({ tab: { id: 'tab-1' }, prefs: { typewriter: true, focus: false } })
      await wrapper.find('[data-testid="mode-chips"] button').trigger('click')
      const boxes = wrapper.find('[data-testid="mode-menu"]').findAll('[role="menuitemcheckbox"]')
      await boxes[1].trigger('click')
      expect(emitted).toEqual(['view.focus-mode'])
    } finally {
      bus.off('cmd::execute', handler)
    }
  })
})
