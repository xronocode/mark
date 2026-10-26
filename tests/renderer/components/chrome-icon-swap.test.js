// FILE: tests/renderer/components/chrome-icon-swap.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Verify the C-38 T-006 N4 d icon swap in the chrome components — the right chromeIcons glyph renders in the tree, tabs, find bar and notifications, with the aria/click-target behaviour preserved.
//   SCOPE: Component-level render assertions over tree.vue, treeFolder.vue, treeOpenedTab.vue, tabs.vue, search/index.vue and editorWithTabs/notifications.vue.
//   DEPENDS: Vitest, @vue/test-utils, the pinia/i18n harness, window shims from tests/renderer/setup.ts.
//   LINKS: .grace/verification/runtime.xml V-M-011 scenario-56; .grace/graph/runtime.xml M-057.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   i18n - stub vue-i18n instance for the mounted components.
//   iconNames - collected chromeIcons glyph names rendered by a wrapper (findAllComponents + props, never .vm on DOM wrappers).
//   mountTree/mountTabs/mountSearch/mountNotifications - per-component harnesses mirroring the sibling test files.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-15 C-38 T-006 initial pins.
// END_CHANGE_SUMMARY

import { shallowMount, mount } from '@vue/test-utils'
import { setupTestPinia } from '../pinia'
import { createI18n } from 'vue-i18n'
import { ChromeIcon } from '@/components/icons/chromeIcons'

vi.mock('@/bus', () => ({
  default: { on: vi.fn(), off: vi.fn(), emit: vi.fn() }
}))

vi.mock('underscore', () => ({
  debounce: (fn) => fn
}))

vi.mock('dom-autoscroller', () => ({
  default: vi.fn(() => ({ down: false, destroy: vi.fn() }))
}))

vi.mock('dragula', () => ({
  default: vi.fn(() => ({ on: vi.fn().mockReturnThis(), destroy: vi.fn(), dragging: false }))
}))

vi.mock('@/contextMenu/tabs', () => ({
  showContextMenu: vi.fn()
}))

vi.mock('../../contextMenu/sideBar', () => ({
  showContextMenu: vi.fn()
}))

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: {} } })

const iconNames = (wrapper) =>
  wrapper.findAllComponents(ChromeIcon).map((icon) => icon.props('name'))

describe('chrome icon swap (C-38 T-006 N4 d)', () => {
  let pinia

  beforeEach(() => {
    pinia = setupTestPinia()
  })

  describe('sideBar/tree.vue', () => {
    const mountTree = async (tabs = []) => {
      const Tree = (await import('@/components/sideBar/tree.vue')).default
      return shallowMount(Tree, {
        props: { openedFiles: [], tabs },
        global: {
          plugins: [pinia, i18n],
          stubs: { Folder: true, File: true, OpenedFile: true, TransitionGroup: true }
        }
      })
    }

    it('renders the opened-files header actions from chromeIcons (save-all, close-all, chevron)', async () => {
      const wrapper = await mountTree([{ id: 'tab-1', filename: 'a.md', isSaved: true }])
      const names = iconNames(wrapper)
      expect(names).toContain('chevron-right')
      expect(names).toContain('save-all')
      expect(names).toContain('close-all')
    })

    it('renders the empty-root row with the file-plus glyph', async () => {
      const { useProjectStore } = await import('@/store/project')
      const projectStore = useProjectStore()
      projectStore.projectTrees = [
        { pathname: '/tmp/root', name: 'root', folders: [], files: [] }
      ]
      const wrapper = await mountTree()
      // No create cache → the new-file row is rendered with its glyph.
      expect(iconNames(wrapper)).toContain('file-plus')
    })
  })

  describe('sideBar/treeFolder.vue', () => {
    const mountFolder = async (isCollapsed) => {
      const TreeFolder = (await import('@/components/sideBar/treeFolder.vue')).default
      return shallowMount(TreeFolder, {
        props: {
          folder: {
            id: 'folder-1',
            name: 'docs',
            pathname: '/tmp/docs',
            isCollapsed,
            folders: [],
            files: []
          },
          depth: 0
        },
        global: { plugins: [pinia, i18n], stubs: { TreeFolder: true, File: true } }
      })
    }

    it('renders folder-open while expanded and folder once collapsed', async () => {
      // C-51 T-001: the row also carries the right disclosure chevron.
      const expanded = await mountFolder(false)
      expect(iconNames(expanded)).toEqual(['folder-open', 'chevron-right'])

      const collapsed = await mountFolder(true)
      expect(iconNames(collapsed)).toEqual(['folder', 'chevron-right'])
    })
  })

  describe('sideBar/treeOpenedTab.vue', () => {
    it('renders the close glyph as an aria-hidden svg that still closes on click', async () => {
      const { useEditorStore } = await import('@/store/editor')
      const editorStore = useEditorStore()
      editorStore.currentFile = { id: 'other', filename: 'other.md' }
      editorStore.FORCE_CLOSE_TAB = vi.fn()

      const OpenedFile = (await import('@/components/sideBar/treeOpenedTab.vue')).default
      const wrapper = mount(OpenedFile, {
        props: { file: { id: 'tab-1', filename: 'a.md', pathname: '/tmp/a.md', isSaved: true } },
        global: { plugins: [pinia, i18n] }
      })

      const svg = wrapper.find('svg.chrome-icon')
      expect(svg.exists()).toBe(true)
      expect(svg.attributes('aria-hidden')).toBe('true')
      await svg.trigger('click')
      expect(editorStore.FORCE_CLOSE_TAB).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'tab-1' })
      )
    })
  })

  describe('editorWithTabs/tabs.vue', () => {
    const mountTabs = async () => {
      const { useEditorStore } = await import('@/store/editor')
      const editorStore = useEditorStore()
      const tab1 = { id: 'tab-1', filename: 'hello.md', pathname: '/tmp/hello.md', isSaved: true }
      const tab2 = { id: 'tab-2', filename: 'world.md', pathname: '/tmp/world.md', isSaved: false }
      editorStore.currentFile = tab1
      editorStore.tabs = [tab1, tab2]
      editorStore.UPDATE_CURRENT_FILE = vi.fn()
      editorStore.FORCE_CLOSE_TAB = vi.fn()
      editorStore.CLOSE_UNSAVED_TAB = vi.fn()
      editorStore.NEW_UNTITLED_TAB = vi.fn()

      const Tabs = (await import('@/components/editorWithTabs/tabs.vue')).default
      return shallowMount(Tabs, { global: { plugins: [pinia, i18n] } })
    }

    it('renders close + dot glyphs per tab and the plus glyph on the new-file button', async () => {
      const wrapper = await mountTabs()
      const names = iconNames(wrapper)
      expect(names.filter((n) => n === 'close')).toHaveLength(2)
      expect(names.filter((n) => n === 'dot')).toHaveLength(2)
      expect(names).toContain('plus')
    })

    it('keeps the close click target working through the glyph component', async () => {
      const wrapper = await mountTabs()
      const closeIcons = wrapper.findAll('.close-icon')
      expect(closeIcons).toHaveLength(2)
      const { useEditorStore } = await import('@/store/editor')
      await closeIcons[0].trigger('click')
      expect(useEditorStore().FORCE_CLOSE_TAB).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'tab-1' })
      )
    })

    it('pins the active-tab marker to the chrome accent', async () => {
      const wrapper = await mountTabs()
      const source = wrapper.html()
      expect(source).not.toMatch(/#icon-|xlink/)
      // Style contract: the marker rule exists in the SFC source.
      const { readFileSync } = await import('node:fs')
      const { resolve } = await import('node:path')
      const sfc = readFileSync(
        resolve(__dirname, '../../../src/renderer/src/components/editorWithTabs/tabs.vue'),
        'utf8'
      )
      expect(sfc).toMatch(/li\.active[\s\S]*?background: var\(--chromeAccent\)/)
    })
  })

  describe('search/index.vue (find bar)', () => {
    const mountSearch = async () => {
      const { useEditorStore } = await import('@/store/editor')
      const editorStore = useEditorStore()
      editorStore.currentFile = { id: 'tab-1', searchMatches: null }

      const Search = (await import('@/components/search/index.vue')).default
      return shallowMount(Search, {
        global: {
          plugins: [pinia, i18n],
          stubs: { ElTooltip: true }
        }
      })
    }

    it('renders the toggle glyphs, the navigation arrows and the close from chromeIcons', async () => {
      const wrapper = await mountSearch()
      const names = iconNames(wrapper)
      expect(names).toContain('case-sensitive')
      expect(names).toContain('whole-word')
      expect(names).toContain('regex')
      expect(names).toContain('arrow-up')
      expect(names).toContain('arrow-down')
      expect(names).toContain('chevron-down')
      expect(names).toContain('close')
    })

    it('renders real aria-hidden svgs for the toggles (deep mount)', async () => {
      const { useEditorStore } = await import('@/store/editor')
      const editorStore = useEditorStore()
      editorStore.currentFile = { id: 'tab-1', searchMatches: null }

      const Search = (await import('@/components/search/index.vue')).default
      const wrapper = mount(Search, {
        global: {
          plugins: [pinia, i18n],
          stubs: { ElTooltip: true }
        }
      })
      const caseIcon = wrapper.find('.is-case-sensitive svg.chrome-icon')
      expect(caseIcon.exists()).toBe(true)
      expect(caseIcon.attributes('aria-hidden')).toBe('true')
      expect(caseIcon.attributes('viewBox')).toBe('0 0 16 16')
    })
  })

  describe('editorWithTabs/notifications.vue', () => {
    it('renders the severity glyph and dismiss control from chromeIcons with aria preserved', async () => {
      const { useEditorStore } = await import('@/store/editor')
      const editorStore = useEditorStore()
      editorStore.currentFile = {
        id: 'tab-1',
        notifications: [{ msg: 'saved', style: 'primary', showConfirm: false }]
      }

      const Notifications = (await import('@/components/editorWithTabs/notifications.vue')).default
      const wrapper = mount(Notifications, { global: { plugins: [pinia, i18n] } })

      const svg = wrapper.find('.inline-button svg.chrome-icon')
      expect(svg.exists()).toBe(true)
      expect(svg.attributes('aria-hidden')).toBe('true')
      // C-NOTIFICATION-SYSTEM T-006: the banner gained the severity glyph
      // (legacy 'primary' maps to info) ahead of the dismiss control.
      expect(iconNames(wrapper)).toEqual(['info', 'close'])
    })
  })

  describe('notificationCard (C-NOTIFICATION-SYSTEM)', () => {
    it('draws the severity glyph and close from chromeIcons, never the sprite', async () => {
      const { readFileSync } = await import('node:fs')
      const { resolve } = await import('node:path')
      const card = readFileSync(
        resolve(__dirname, '../../../src/renderer/src/components/notificationCard/index.vue'),
        'utf8'
      )
      // Every severity maps to a drawn glyph through the ChromeIcon
      // component; no sprite use refs anywhere.
      expect(card).toMatch(/SEVERITY_ICONS/)
      expect(card).toMatch(/name="close"/)
      expect(card).not.toMatch(/#icon-/)
    })
  })
})
