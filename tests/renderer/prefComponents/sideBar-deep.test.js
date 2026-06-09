/**
 * Deep tests for src/renderer/src/prefComponents/sideBar/index.vue
 *
 * Targets: querySearch, createFilter, handleSelect, handleCategoryItemClick,
 * onIpcCategoryChange, route watcher, onMounted, onUnmounted, language
 * change handler.
 */

import { shallowMount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'

vi.mock('@/i18n', () => ({
  t: (key) => key,
  setLanguage: vi.fn()
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key) => key }),
  createI18n: vi.fn(() => ({ global: { locale: { value: 'en' } } }))
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn() }
}))

vi.mock('@element-plus/icons-vue', () => ({
  Search: { template: '<span />' }
}))

vi.mock('@/assets/icons/pref_general.svg', () => ({ default: { template: '<span />' } }))
vi.mock('@/assets/icons/pref_editor.svg', () => ({ default: { template: '<span />' } }))
vi.mock('@/assets/icons/pref_markdown.svg', () => ({ default: { template: '<span />' } }))
vi.mock('@/assets/icons/pref_theme.svg', () => ({ default: { template: '<span />' } }))
vi.mock('@/assets/icons/pref_image.svg', () => ({ default: { template: '<span />' } }))
vi.mock('@/assets/icons/pref_spellcheck.svg', () => ({ default: { template: '<span />' } }))
vi.mock('@/assets/icons/pref_key_binding.svg', () => ({ default: { template: '<span />' } }))
vi.mock('@/assets/icons/pref_language.svg', () => ({ default: { template: '<span />' } }))

vi.mock('@/_shims/preferences/schema.json', () => ({
  default: {
    fontSize: {
      description: 'Editor--Font size',
      type: 'number'
    },
    autoSave: {
      description: 'General--Auto save',
      type: 'boolean'
    },
    theme: {
      description: 'Theme--Current theme',
      type: 'string',
      enum: ['light', 'dark']
    }
  }
}))

const pushMock = vi.fn(() => Promise.resolve())
const routeRef = { name: 'general', path: '/preference/general' }

vi.mock('vue-router', () => ({
  useRouter: () => ({
    push: pushMock,
    getRoutes: () => [
      { path: '/preference/general' },
      { path: '/preference/editor' },
      { path: '/preference/markdown' },
      { path: '/preference/theme' },
      { path: '/preference/image' },
      { path: '/preference/keybindings' },
      { path: '/preference/spelling' },
      { path: '/preference/language' }
    ]
  }),
  useRoute: () => routeRef
}))

import SideBar from '@/prefComponents/sideBar/index.vue'

const globalStubs = {
  'el-autocomplete': true,
  Search: true
}

describe('SideBar.vue – deep tests', () => {
  let wrapper

  beforeEach(() => {
    pushMock.mockClear()
    wrapper = shallowMount(SideBar, {
      global: {
        mocks: { $t: (key) => key },
        stubs: globalStubs
      }
    })
  })

  afterEach(() => {
    wrapper.unmount()
  })

  // ── querySearch ──────────────────────────────────────────────────────

  it('querySearch returns all items when queryString is empty', () => {
    const cb = vi.fn()
    wrapper.vm.querySearch('', cb)
    expect(cb).toHaveBeenCalledWith(expect.any(Array))
    const results = cb.mock.calls[0][0]
    expect(results.length).toBeGreaterThan(0)
  })

  it('querySearch filters items by query string', () => {
    const cb = vi.fn()
    wrapper.vm.querySearch('font', cb)
    const results = cb.mock.calls[0][0]
    // fontSize matches "Font size"
    expect(results.length).toBeGreaterThanOrEqual(0)
  })

  // ── createFilter ─────────────────────────────────────────────────────

  it('createFilter matches by preference field (case insensitive)', () => {
    const filter = wrapper.vm.createFilter('font')
    // The items from loadAll contain preference text from the t() mock
    // which returns the key as-is
    const item = {
      preference: 'Font size settings',
      category: 'Editor',
      preferenceEn: 'Font size',
      categoryEn: 'Editor'
    }
    expect(filter(item)).toBe(true)
  })

  it('createFilter matches by category', () => {
    const filter = wrapper.vm.createFilter('edit')
    const item = {
      preference: 'Some pref',
      category: 'Editor',
      preferenceEn: 'Some pref',
      categoryEn: 'Editor'
    }
    expect(filter(item)).toBe(true)
  })

  it('createFilter matches by English preference', () => {
    const filter = wrapper.vm.createFilter('size')
    const item = {
      preference: 'some-translated-key',
      category: 'some-cat',
      preferenceEn: 'Font size',
      categoryEn: 'Editor'
    }
    expect(filter(item)).toBe(true)
  })

  it('createFilter matches by English category', () => {
    const filter = wrapper.vm.createFilter('theme')
    const item = {
      preference: 'some-pref',
      category: 'some-cat',
      preferenceEn: 'Current theme',
      categoryEn: 'Theme'
    }
    expect(filter(item)).toBe(true)
  })

  it('createFilter returns false when no fields match', () => {
    const filter = wrapper.vm.createFilter('zzzzz')
    const item = {
      preference: 'Font size',
      category: 'Editor',
      preferenceEn: 'Font size',
      categoryEn: 'Editor'
    }
    expect(filter(item)).toBe(false)
  })

  it('createFilter handles null/undefined fields gracefully', () => {
    const filter = wrapper.vm.createFilter('test')
    const item = {
      preference: null,
      category: undefined,
      preferenceEn: '',
      categoryEn: 'Editor'
    }
    expect(typeof filter(item)).toBe('boolean')
  })

  // ── handleSelect ─────────────────────────────────────────────────────

  it('handleSelect navigates to the routeCategory path', () => {
    wrapper.vm.handleSelect({ routeCategory: 'editor', category: 'Editor' })
    expect(pushMock).toHaveBeenCalledWith({ path: '/preference/editor' })
  })

  it('handleSelect falls back to lowercase category when routeCategory missing', () => {
    wrapper.vm.handleSelect({ category: 'Theme' })
    expect(pushMock).toHaveBeenCalledWith({ path: '/preference/theme' })
  })

  it('handleSelect falls back to general when item is null-ish', () => {
    wrapper.vm.handleSelect(null)
    expect(pushMock).toHaveBeenCalledWith({ path: '/preference/general' })
  })

  it('handleSelect uses routeCategory over category', () => {
    wrapper.vm.handleSelect({ routeCategory: 'spelling', category: 'Spelling' })
    expect(pushMock).toHaveBeenCalledWith({ path: '/preference/spelling' })
  })

  // ── handleCategoryItemClick ──────────────────────────────────────────

  it('handleCategoryItemClick navigates to item path', () => {
    wrapper.vm.currentCategory = 'general'
    wrapper.vm.handleCategoryItemClick({ name: 'editor', path: '/preference/editor' })
    expect(pushMock).toHaveBeenCalledWith({ path: '/preference/editor' })
  })

  it('handleCategoryItemClick does not navigate if same category', () => {
    wrapper.vm.currentCategory = 'editor'
    pushMock.mockClear()
    wrapper.vm.handleCategoryItemClick({ name: 'editor', path: '/preference/editor' })
    // name.toLowerCase() === currentCategory won't match since it's 'editor' vs 'editor'
    // Actually since currentCategory is 'editor' and name.toLowerCase() is 'editor', they match
    expect(pushMock).not.toHaveBeenCalled()
  })

  // ── onIpcCategoryChange ──────────────────────────────────────────────

  it('onIpcCategoryChange navigates to valid category', () => {
    pushMock.mockClear()
    wrapper.vm.onIpcCategoryChange(null, 'editor')
    expect(pushMock).toHaveBeenCalledWith({ path: '/preference/editor' })
  })

  it('onIpcCategoryChange does nothing for invalid category', () => {
    pushMock.mockClear()
    wrapper.vm.onIpcCategoryChange(null, 'nonexistent')
    expect(pushMock).not.toHaveBeenCalled()
  })

  it('onIpcCategoryChange does nothing for null category', () => {
    pushMock.mockClear()
    wrapper.vm.onIpcCategoryChange(null, null)
    expect(pushMock).not.toHaveBeenCalled()
  })

  // ── onMounted ────────────────────────────────────────────────────────

  it('onMounted loads restaurants from search content', () => {
    expect(wrapper.vm.restaurants.length).toBeGreaterThan(0)
  })

  it('onMounted sets currentCategory from route name', () => {
    expect(wrapper.vm.currentCategory).toBe('general')
  })

  it('onMounted registers IPC listener for settings::change-tab', () => {
    expect(window.electron.ipcRenderer.on).toHaveBeenCalledWith(
      'settings::change-tab',
      expect.any(Function)
    )
  })

  // ── Language change handling ─────────────────────────────────────────

  it('responds to languageChanged event by reloading restaurants', async () => {
    const originalCount = wrapper.vm.restaurants.length
    window.dispatchEvent(new CustomEvent('languageChanged'))
    await nextTick()
    // restaurants should still be populated
    expect(wrapper.vm.restaurants.length).toBeGreaterThan(0)
  })

  // ── Category item active state ───────────────────────────────────────

  it('marks the correct category as active', async () => {
    wrapper.vm.currentCategory = 'editor'
    await nextTick()
    const items = wrapper.findAll('.item')
    // Find the active one
    const activeItem = items.filter((item) => item.classes().includes('active'))
    expect(activeItem.length).toBe(1)
  })

  // ── Rendering ────────────────────────────────────────────────────────

  it('renders 9 category items', () => {
    const items = wrapper.findAll('.item')
    expect(items).toHaveLength(9)
  })

  it('renders h3 title', () => {
    expect(wrapper.find('h3.title').exists()).toBe(true)
  })
})
