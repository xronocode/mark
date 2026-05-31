import { shallowMount } from '@vue/test-utils'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setupTestPinia } from '../pinia'

vi.mock('../../i18n', () => ({
  t: vi.fn((key) => key)
}))

vi.mock('@/util', () => ({
  hasKeys: vi.fn((o) => o && Object.keys(o).length > 0),
  getUniqueId: vi.fn(() => `uid-${Date.now()}`),
  deepClone: vi.fn((o) => JSON.parse(JSON.stringify(o))),
  isOsx: true,
  isWindows: false,
  isLinux: false,
  animatedScrollTo: vi.fn()
}))
vi.mock('@/util/listToTree', () => ({ default: vi.fn((arr) => arr) }))

const __ipcPrefsMock = { get: vi.fn().mockResolvedValue(null), set: vi.fn(), getAll: vi.fn() }
const __ipcRecentMock = { add: vi.fn(), list: vi.fn().mockResolvedValue([]), clear: vi.fn() }

vi.mock('@/ipc/runtime', () => ({
  ipcFs: { read: vi.fn(), write: vi.fn(), stat: vi.fn(), readdir: vi.fn(), unlink: vi.fn() },
  ipcWatch: {},
  ipcSearch: {},
  ipcPrefs: __ipcPrefsMock,
  ipcWorkspace: {},
  ipcFonts: {},
  ipcRecent: __ipcRecentMock,
  ipcShortcut: {},
  ipcSpell: {},
  ipcMenu: {},
  ipcPandoc: {},
  ipcUpdater: {},
  ipcScreenshot: {},
  ipcSecret: {},
  ipc: { fs: { read: vi.fn() } }
}))

vi.mock('@/bus', () => ({
  default: { emit: vi.fn(), on: vi.fn(), off: vi.fn() }
}))

vi.mock('@/services/notification', () => ({ default: { notify: vi.fn() } }))
vi.mock('@/commands', () => ({
  FileEncodingCommand: class {},
  QuickOpenCommand: class {},
  LineEndingCommand: class {},
  TrailingNewlineCommand: class {}
}))
vi.mock('@/store/project', () => ({
  useProjectStore: vi.fn(() => ({
    ASK_FOR_OPEN_PROJECT: vi.fn(),
    projectTrees: []
  }))
}))

describe('recent/index.vue welcome screen', () => {
  let pinia

  beforeEach(() => {
    pinia = setupTestPinia()
    window.electron = {
      ipcRenderer: { send: vi.fn(), on: vi.fn(), invoke: vi.fn() },
      webFrame: { setZoomFactor: vi.fn() },
      shell: { showItemInFolder: vi.fn() }
    }
    window.marktext = { env: { HOME: '/Users/test' } }
    window.path = {
      basename: (p) => p.split('/').pop(),
      dirname: (p) => p.substring(0, p.lastIndexOf('/')),
      join: (...args) => args.join('/'),
      resolve: (...args) => args.join('/'),
      sep: '/'
    }
    window.fileUtils = { isSamePathSync: (a, b) => a === b }
    window.DIRNAME = ''
  })

  it('mounts and shows welcome screen', async () => {
    const Recent = (await import('@/components/recent/index.vue')).default
    const wrapper = shallowMount(Recent, {
      global: { plugins: [pinia] }
    })
    expect(wrapper.exists()).toBe(true)
    expect(wrapper.find('.welcome-screen').exists()).toBe(true)
    expect(wrapper.find('.welcome-title').exists()).toBe(true)
  })

  it('has new file, open file, and open folder buttons', async () => {
    const Recent = (await import('@/components/recent/index.vue')).default
    const wrapper = shallowMount(Recent, {
      global: { plugins: [pinia] }
    })
    const buttons = wrapper.findAll('.action-button')
    expect(buttons.length).toBe(3)
  })

  it('calls NEW_UNTITLED_TAB on new file click', async () => {
    const { useEditorStore } = await import('@/store/editor')
    const Recent = (await import('@/components/recent/index.vue')).default
    const wrapper = shallowMount(Recent, {
      global: { plugins: [pinia] }
    })
    const editorStore = useEditorStore()
    editorStore.NEW_UNTITLED_TAB = vi.fn()

    await wrapper.findAll('.action-button')[0].trigger('click')
    expect(editorStore.NEW_UNTITLED_TAB).toHaveBeenCalledWith({})
  })

  it('sends mt::cmd-open-file on open file click', async () => {
    const Recent = (await import('@/components/recent/index.vue')).default
    const wrapper = shallowMount(Recent, {
      global: { plugins: [pinia] }
    })
    await wrapper.findAll('.action-button')[1].trigger('click')
    expect(window.electron.ipcRenderer.send).toHaveBeenCalledWith('mt::cmd-open-file')
  })

  it('shows recent files after mount', async () => {
    __ipcRecentMock.list.mockResolvedValueOnce(['/Users/test/a.md', '/Users/test/b.md'])

    const Recent = (await import('@/components/recent/index.vue')).default
    const wrapper = shallowMount(Recent, {
      global: { plugins: [pinia] }
    })
    await new Promise((r) => setTimeout(r, 0))
    await wrapper.vm.$nextTick()

    const items = wrapper.findAll('.recent-item')
    expect(items.length).toBe(2)
  })

  it('shows restore button when session exists', async () => {
    const { useEditorStore } = await import('@/store/editor')
    const editorStore = useEditorStore()
    editorStore.GET_SESSION_PATHS = vi.fn().mockResolvedValue(['/tmp/x.md', '/tmp/y.md'])
    editorStore.GET_RECENT_FILES = vi.fn().mockResolvedValue([])

    const Recent = (await import('@/components/recent/index.vue')).default
    const wrapper = shallowMount(Recent, {
      global: { plugins: [pinia] }
    })
    await new Promise((r) => setTimeout(r, 0))
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.restore-button').exists()).toBe(true)
  })

  it('shows no-recent message when list is empty', async () => {
    const Recent = (await import('@/components/recent/index.vue')).default
    const wrapper = shallowMount(Recent, {
      global: { plugins: [pinia] }
    })
    await new Promise((r) => setTimeout(r, 0))
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.no-recent').exists()).toBe(true)
  })

  it('opens recent file on click', async () => {
    __ipcRecentMock.list.mockResolvedValueOnce(['/Users/test/doc.md'])

    const Recent = (await import('@/components/recent/index.vue')).default
    const wrapper = shallowMount(Recent, {
      global: { plugins: [pinia] }
    })
    await new Promise((r) => setTimeout(r, 0))
    await wrapper.vm.$nextTick()

    await wrapper.find('.recent-item').trigger('click')
    expect(window.electron.ipcRenderer.send).toHaveBeenCalledWith(
      'mt::open-file', '/Users/test/doc.md', {}
    )
  })
})
