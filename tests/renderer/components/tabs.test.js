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

vi.mock('../../contextMenu/tabs', () => ({
  showContextMenu: vi.fn()
}))

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: {} } })

describe('tabs.vue', () => {
  let pinia

  beforeEach(async () => {
    pinia = setupTestPinia()
    const { useEditorStore } = await import('@/store/editor')
    const editorStore = useEditorStore()
    editorStore.currentFile = {
      id: 'tab-1',
      filename: 'test.md',
      pathname: '/tmp/test.md',
      isSaved: true
    }
    editorStore.tabs = [editorStore.currentFile]
  })

  it('mounts and renders tab list', async () => {
    const Tabs = (await import('@/components/editorWithTabs/tabs.vue')).default
    const wrapper = shallowMount(Tabs, {
      global: {
        plugins: [pinia, i18n]
      }
    })
    expect(wrapper.exists()).toBe(true)
    expect(wrapper.find('.editor-tabs').exists()).toBe(true)
    // Should render one tab
    const items = wrapper.findAll('li')
    expect(items.length).toBe(1)
    expect(items[0].text()).toContain('test.md')
  })

  it('marks current tab as active', async () => {
    const Tabs = (await import('@/components/editorWithTabs/tabs.vue')).default
    const wrapper = shallowMount(Tabs, {
      global: {
        plugins: [pinia, i18n]
      }
    })
    const active = wrapper.find('li.active')
    expect(active.exists()).toBe(true)
  })

  it('has a new-file button', async () => {
    const Tabs = (await import('@/components/editorWithTabs/tabs.vue')).default
    const wrapper = shallowMount(Tabs, {
      global: {
        plugins: [pinia, i18n]
      }
    })
    expect(wrapper.find('.new-file').exists()).toBe(true)
  })
})

// ── C-MULTI-SOURCE-WORKSPACE: duplicate-filename disambiguation ─────

describe('tabs.vue — duplicate-filename suffix (C-MULTI-SOURCE-WORKSPACE)', () => {
  let pinia

  const mountTabs = async () => {
    const Tabs = (await import('@/components/editorWithTabs/tabs.vue')).default
    return shallowMount(Tabs, { global: { plugins: [pinia, i18n] } })
  }

  beforeEach(async () => {
    pinia = setupTestPinia()
    const { useProjectStore } = await import('@/store/project')
    const projectStore = useProjectStore()
    projectStore.projectTrees = [
      { pathname: '/tmp/Notes', name: 'Notes' },
      { pathname: '/tmp/repo', name: 'repo' }
    ]
  })

  it('shows the owning-root suffix on both tabs when filenames collide', async () => {
    const { useEditorStore } = await import('@/store/editor')
    const editorStore = useEditorStore()
    editorStore.tabs = [
      { id: 't1', filename: 'plan.md', pathname: '/tmp/Notes/plan.md', isSaved: true },
      { id: 't2', filename: 'plan.md', pathname: '/tmp/repo/plan.md', isSaved: true }
    ]
    editorStore.currentFile = editorStore.tabs[0]

    const wrapper = await mountTabs()
    const suffixes = wrapper.findAll('.tab-owner-suffix')
    expect(suffixes).toHaveLength(2)
    expect(suffixes[0].text()).toBe('Notes')
    expect(suffixes[1].text()).toBe('repo')
  })

  it('shows the parent directory for a duplicate filename outside every root', async () => {
    const { useEditorStore } = await import('@/store/editor')
    const editorStore = useEditorStore()
    editorStore.tabs = [
      { id: 't1', filename: 'plan.md', pathname: '/tmp/Notes/plan.md', isSaved: true },
      { id: 't2', filename: 'plan.md', pathname: '/tmp/loose/plan.md', isSaved: true }
    ]
    editorStore.currentFile = editorStore.tabs[0]

    const wrapper = await mountTabs()
    const suffixes = wrapper.findAll('.tab-owner-suffix')
    expect(suffixes).toHaveLength(2)
    expect(suffixes[1].text()).toBe('loose')
  })

  it('shows no suffix when the filename is unique', async () => {
    const { useEditorStore } = await import('@/store/editor')
    const editorStore = useEditorStore()
    editorStore.tabs = [
      { id: 't1', filename: 'plan.md', pathname: '/tmp/Notes/plan.md', isSaved: true },
      { id: 't2', filename: 'other.md', pathname: '/tmp/repo/other.md', isSaved: true }
    ]
    editorStore.currentFile = editorStore.tabs[0]

    const wrapper = await mountTabs()
    expect(wrapper.findAll('.tab-owner-suffix')).toHaveLength(0)
  })

  it('shows no suffix for untitled tabs without a pathname', async () => {
    const { useEditorStore } = await import('@/store/editor')
    const editorStore = useEditorStore()
    editorStore.tabs = [
      { id: 't1', filename: 'Untitled-1', pathname: '', isSaved: true },
      { id: 't2', filename: 'Untitled-2', pathname: '', isSaved: true }
    ]
    editorStore.currentFile = editorStore.tabs[0]

    const wrapper = await mountTabs()
    expect(wrapper.findAll('.tab-owner-suffix')).toHaveLength(0)
  })
})
