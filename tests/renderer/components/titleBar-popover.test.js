// FILE: tests/renderer/components/titleBar-popover.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Verify the C-40 T-002 title-bar trim and document info popover — exact Linux button set, «?» guide entry, popover contents (name, ~-folder, size, edited-relative, stats), actions (Rename / reveal / copy path), untitled gating, and Esc/outside-click close.
//   SCOPE: Vue/jsdom component tests with mocked platform (linux), bus, clipboard plugin, and the setup.ts window.fileUtils/window.electron doubles.
//   DEPENDS: Vue Test Utils, Vitest, Pinia test setup, i18n, titleBar/index.vue, @tauri-apps/plugin-clipboard-manager mock.
//   LINKS: .grace/verification/runtime.xml V-M-011 scenario-53; .grace/changes/active/C-40 T-002.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   i18n - shared vue-i18n instance carrying the titleBar.popover and recent tables.
//   writeClipboardTextMock - spy for the native clipboard plugin write.
//   mountBar - mount titleBar with the default saved-file fixture.
//   openPopover - click the title button and settle the async stat load.
//   MARKDOWN_21_LINES - 21-line markdown fixture for the lines stat.
//   TitleBar - the component under test (loaded per test).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-15 C-40 T-002 initial pins: trimmed button
//   set, guide bus event, popover stats/meta/actions, untitled gating, close
//   paths, reading-time and size formatting.
// END_CHANGE_SUMMARY

import { shallowMount, flushPromises } from '@vue/test-utils'
import { setupTestPinia } from '../pinia'
import { createI18n } from 'vue-i18n'

const { writeClipboardTextMock } = vi.hoisted(() => ({
  writeClipboardTextMock: vi.fn(async () => {})
}))

vi.mock('@tauri-apps/plugin-clipboard-manager', () => ({
  writeText: writeClipboardTextMock
}))

vi.mock('@/bus', () => ({
  default: { on: vi.fn(), off: vi.fn(), emit: vi.fn() }
}))

vi.mock('@/config', () => ({
  PATH_SEPARATOR: '/',
  themePairs: { light: 'dark', dark: 'light' },
  isDarkTheme: vi.fn((t) => /dark/i.test(t))
}))

vi.mock('@/util', () => ({
  isOsx: false,
  isWindows: false,
  isLinux: true,
  animatedScrollTo: vi.fn()
}))

// __APP_VERSION__ is a define'd global in the real build
globalThis.__APP_VERSION__ = '2.0.0-test'

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: {
    en: {
      menu: { view: { toggleSidebar: 'Toggle Sidebar' }, counter: { words: 'Words' } },
      sideBar: { icons: { files: 'Files', toc: 'TOC', settings: 'Settings' } },
      titleBar: {
        share: 'Share',
        guide: 'Mark Guide',
        documentInfo: 'Document info',
        themeMode: { auto: 'Theme: Auto', light: 'Theme: Light', dark: 'Theme: Dark' },
        popover: {
          words: 'words',
          characters: 'characters',
          lines: 'lines',
          reading: 'reading',
          minutes: '{count} min',
          rename: 'Rename…',
          edited: 'edited {time}'
        }
      },
      recent: {
        showInFinder: 'Show in Finder',
        showInExplorer: 'Show in Explorer',
        showInFolder: 'Show in folder',
        copyPath: 'Copy path',
        time: {
          justNow: 'just now',
          minutesAgo: '{count} min ago',
          todayAt: 'today {time}',
          yesterday: 'yesterday',
          daysAgo: '{count} days ago'
        }
      },
      contextMenu: { tabs: { copyPath: 'Copy Path' } }
    }
  }
})

const MARKDOWN_21_LINES = ['# Release notes 2.3.2', '', 'Mark is a calm Markdown editor.', '', '## What changed', '']
  .concat(Array.from({ length: 15 }, (_, i) => `line ${i + 1}`))
  .join('\n')

let TitleBar = null

const mountBar = (propsOverride = {}) => {
  // setup.ts installs window.fileUtils/window.electron fresh per test;
  // homeDir is mocked to /tmp/home so /tmp/home/... abbreviates to ~/...
  return shallowMount(TitleBar, {
    props: {
      project: null,
      filename: 'notes.md',
      pathname: '/tmp/home/Notes/notes.md',
      active: true,
      wordCount: { word: 58, character: 312, paragraph: 5, all: 400 },
      markdown: MARKDOWN_21_LINES,
      platform: 'linux',
      isSaved: true,
      ...propsOverride
    },
      global: {
        plugins: [setupTestPinia(), i18n],
        // ChromeIcon must render for real: the chevron pin reads its svg.
        stubs: { ElTooltip: true, ChromeIcon: false }
      }
  })
}

const openPopover = async (wrapper) => {
  await wrapper.find('.titlebar-title-btn').trigger('click')
  await flushPromises()
  return wrapper.find('.doc-info-popover')
}

describe('titleBar trim + document info popover (C-40 T-002)', () => {
  let bus

  beforeEach(async () => {
    writeClipboardTextMock.mockClear()
    bus = (await import('@/bus')).default
    TitleBar = (await import('@/components/titleBar/index.vue')).default
  })

  // START_BLOCK_TRIMMED_BUTTON_SET
  describe('trimmed button set (linux frameless)', () => {
    it('left cluster = app menu + sidebar toggle + Settings; right = guide + theme + share', () => {
      const wrapper = mountBar()
      const left = wrapper.findAll('.titlebar-nav .titlebar-nav-btn')
      expect(left.length).toBe(3)
      expect(left[0].classes()).toContain('titlebar-nav-menu')
      expect(left[1].attributes('title')).toBe('Toggle Sidebar')
      expect(left[2].attributes('title')).toBe('Settings')

      const right = wrapper.findAll('.titlebar-right .titlebar-nav-btn')
      expect(right.length).toBe(3)
      expect(right[0].attributes('title')).toBe('Mark Guide')
      expect(right[1].attributes('title')).toMatch(/^Theme: /)
      expect(right[2].attributes('title')).toBe('Share')
    })

    it('the Files and TOC buttons, the breadcrumb and the word count are gone', () => {
      const wrapper = mountBar()
      expect(wrapper.findAll('.titlebar-nav-btn[title="Files"]').length).toBe(0)
      expect(wrapper.findAll('.titlebar-nav-btn[title="TOC"]').length).toBe(0)
      expect(wrapper.find('.title-path').exists()).toBe(false)
      expect(wrapper.find('.word-count').exists()).toBe(false)
      expect(wrapper.find('.titlebar-title-name').text()).toBe('notes.md')
      // The chevron and the unsaved dot live in the title button.
      expect(wrapper.find('.titlebar-title-btn svg').exists()).toBe(true)
    })

    it('shows the plain app name when no document is open (no title button)', () => {
      const wrapper = mountBar({ filename: '', pathname: '', wordCount: null, markdown: '' })
      expect(wrapper.find('.title').text()).toContain('Mark')
      expect(wrapper.find('.titlebar-title-btn').exists()).toBe(false)
    })
  })
  // END_BLOCK_TRIMMED_BUTTON_SET

  // START_BLOCK_GUIDE_BUTTON
  describe('«?» Mark Guide entry (Win/Linux)', () => {
    it('emits mt::open-guide on the bus', async () => {
      const wrapper = mountBar()
      await wrapper.find('.titlebar-guide-btn').trigger('click')
      expect(bus.emit).toHaveBeenCalledWith('mt::open-guide', {})
    })
  })
  // END_BLOCK_GUIDE_BUTTON

  // START_BLOCK_POPOVER_CONTENT
  describe('popover contents', () => {
    it('opens from the file name with aria-expanded and the hover state', async () => {
      const wrapper = mountBar()
      const btn = wrapper.find('.titlebar-title-btn')
      expect(btn.attributes('aria-expanded')).toBe('false')
      await btn.trigger('click')
      expect(wrapper.find('.doc-info-popover').exists()).toBe(true)
      expect(btn.attributes('aria-expanded')).toBe('true')
      expect(btn.classes()).toContain('open')
      expect(wrapper.find('.doc-info-popover').attributes('role')).toBe('dialog')
    })

    it('shows name, ~-abbreviated folder, size and edited-relative mtime', async () => {
      // Pin the clock to midday: near local midnight «4 min ago» crosses the
      // calendar day and the formatter says «yesterday» (CI ran at 00:02).
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date(2026, 9, 16, 12, 0, 0))
      window.fileUtils.stat.mockResolvedValue({
        isFile: true,
        isDirectory: false,
        size: 2150,
        mtimeMs: Date.now() - 4 * 60_000,
        mode: 0,
        isSymbolicLink: false
      })
      const wrapper = mountBar()
      await openPopover(wrapper)
      expect(wrapper.find('.doc-info-name').text()).toBe('notes.md')
      // homeDir is mocked to /tmp/home → /tmp/home/Notes abbreviates to ~/Notes
      expect(wrapper.find('.doc-info-meta').text()).toBe('~/Notes · 2.1 KB · edited 4 min ago')
      vi.useRealTimers()
    })

    it('stats come from wordCount + markdown: words, characters, lines, reading time', async () => {
      const wrapper = mountBar()
      await openPopover(wrapper)
      const numbers = wrapper.findAll('.doc-info-stat b').map((n) => n.text())
      expect(numbers).toEqual(['58', '312', '21', '1 min'])
      const labels = wrapper.findAll('.doc-info-stat span').map((n) => n.text())
      expect(labels).toEqual(['words', 'characters', 'lines', 'reading'])
    })

    it('reading time = words/230 rounded up, minimum 1', () => {
      const zero = mountBar({ wordCount: { word: 0, character: 0, paragraph: 0, all: 0 } })
      expect(zero.vm.readingLabel).toBe('1 min')
      const justOver = mountBar({ wordCount: { word: 231, character: 5, paragraph: 1, all: 5 } })
      expect(justOver.vm.readingLabel).toBe('2 min')
      const exact = mountBar({ wordCount: { word: 460, character: 5, paragraph: 1, all: 5 } })
      expect(exact.vm.readingLabel).toBe('2 min')
      const long = mountBar({ wordCount: { word: 461, character: 5, paragraph: 1, all: 5 } })
      expect(long.vm.readingLabel).toBe('3 min')
    })

    it('counts lines from the markdown prop and tolerates a missing wordCount', () => {
      const wrapper = mountBar({ wordCount: null, markdown: 'a\nb\nc' })
      expect(wrapper.vm.statLines).toBe(3)
      expect(wrapper.vm.statWords).toBe(0)
      expect(wrapper.vm.statCharacters).toBe(0)
    })
  })
  // END_BLOCK_POPOVER_CONTENT

  // START_BLOCK_POPOVER_UNTITLED
  describe('untitled documents', () => {
    it('show stats and Rename only — no meta line, no file actions', async () => {
      window.fileUtils.stat.mockClear()
      const wrapper = mountBar({ filename: 'Untitled-1', pathname: '', markdown: '' })
      await openPopover(wrapper)
      expect(wrapper.find('.doc-info-meta').exists()).toBe(false)
      const actions = wrapper.findAll('.doc-info-action')
      expect(actions.length).toBe(1)
      expect(actions[0].text()).toBe('Rename…')
      // No stat call for a pathname-less tab.
      expect(window.fileUtils.stat).not.toHaveBeenCalled()
    })
  })
  // END_BLOCK_POPOVER_UNTITLED

  // START_BLOCK_POPOVER_ACTIONS
  describe('popover actions', () => {
    it('Rename reuses RESPONSE_FOR_RENAME and closes the popover', async () => {
      // Mount first: each mount installs a fresh pinia, and the component
      // binds the editor store of that instance.
      const wrapper = mountBar()
      const { useEditorStore } = await import('@/store/editor')
      const editorStore = useEditorStore()
      editorStore.RESPONSE_FOR_RENAME = vi.fn()
      await openPopover(wrapper)
      await wrapper.findAll('.doc-info-action')[0].trigger('click')
      expect(editorStore.RESPONSE_FOR_RENAME).toHaveBeenCalled()
      expect(wrapper.find('.doc-info-popover').exists()).toBe(false)
    })

    it('reveal uses window.electron.shell.showItemInFolder with the label per OS', async () => {
      const wrapper = mountBar()
      await openPopover(wrapper)
      const reveal = wrapper.findAll('.doc-info-action').find((a) => a.text() === 'Show in folder')
      expect(reveal).toBeTruthy()
      await reveal.trigger('click')
      expect(window.electron.shell.showItemInFolder).toHaveBeenCalledWith('/tmp/home/Notes/notes.md')
      expect(wrapper.find('.doc-info-popover').exists()).toBe(false)
    })

    it('copy path writes through the native clipboard plugin and closes', async () => {
      const wrapper = mountBar()
      await openPopover(wrapper)
      const copy = wrapper.findAll('.doc-info-action').find((a) => a.text() === 'Copy path')
      expect(copy).toBeTruthy()
      await copy.trigger('click')
      await flushPromises()
      expect(writeClipboardTextMock).toHaveBeenCalledWith('/tmp/home/Notes/notes.md')
      expect(wrapper.find('.doc-info-popover').exists()).toBe(false)
    })
  })
  // END_BLOCK_POPOVER_ACTIONS

  // START_BLOCK_POPOVER_CLOSE
  describe('close behavior', () => {
    it('Escape closes the popover', async () => {
      const wrapper = mountBar()
      await openPopover(wrapper)
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
      await flushPromises()
      expect(wrapper.find('.doc-info-popover').exists()).toBe(false)
    })

    it('an outside click closes; clicks inside the popover or on the title do not', async () => {
      const wrapper = mountBar()
      await openPopover(wrapper)

      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
      await flushPromises()
      expect(wrapper.find('.doc-info-popover').exists()).toBe(false)

      // Reopen: a press inside the popover must survive.
      await openPopover(wrapper)
      wrapper.find('.doc-info-popover').element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
      await flushPromises()
      expect(wrapper.find('.doc-info-popover').exists()).toBe(true)

      // A press on the title button must survive the closer so the
      // click can toggle the popover closed.
      wrapper.find('.titlebar-title-btn').element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
      await flushPromises()
      expect(wrapper.find('.doc-info-popover').exists()).toBe(true)

      // The click itself toggles it closed.
      await wrapper.find('.titlebar-title-btn').trigger('click')
      expect(wrapper.find('.doc-info-popover').exists()).toBe(false)
    })

    it('switching to another file refreshes the popover metadata', async () => {
      window.fileUtils.stat.mockResolvedValueOnce({
        size: 2150,
        mtimeMs: Date.now() - 60_000
      })
      const wrapper = mountBar()
      await openPopover(wrapper)
      expect(window.fileUtils.stat).toHaveBeenCalledTimes(1)

      await wrapper.setProps({ pathname: '/tmp/home/Docs/other.md', filename: 'other.md' })
      await flushPromises()
      expect(window.fileUtils.stat).toHaveBeenCalledTimes(2)
      expect(wrapper.find('.doc-info-meta').text()).toContain('~/Docs')
    })
  })
  // END_BLOCK_POPOVER_CLOSE
})
