/**
 * Tests for src/renderer/src/prefComponents/sideBar/index.vue
 */

import { shallowMount } from '@vue/test-utils'

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

// Mock SVG icon imports
vi.mock('@/assets/icons/pref_general.svg', () => ({ default: { template: '<span />' } }))
vi.mock('@/assets/icons/pref_editor.svg', () => ({ default: { template: '<span />' } }))
vi.mock('@/assets/icons/pref_markdown.svg', () => ({ default: { template: '<span />' } }))
vi.mock('@/assets/icons/pref_theme.svg', () => ({ default: { template: '<span />' } }))
vi.mock('@/assets/icons/pref_image.svg', () => ({ default: { template: '<span />' } }))
vi.mock('@/assets/icons/pref_spellcheck.svg', () => ({ default: { template: '<span />' } }))
vi.mock('@/assets/icons/pref_key_binding.svg', () => ({ default: { template: '<span />' } }))
vi.mock('@/assets/icons/pref_language.svg', () => ({ default: { template: '<span />' } }))

// Mock the preferences schema
vi.mock('@/_shims/preferences/schema.json', () => ({
  default: {
    fontSize: {
      description: 'Editor--Font size',
      type: 'number'
    }
  }
}))

// Mock vue-router
const pushMock = vi.fn()
const routeMock = { name: 'general', path: '/preference/general' }

vi.mock('vue-router', () => ({
  useRouter: () => ({
    push: pushMock,
    getRoutes: () => [
      { path: '/preference/general' },
      { path: '/preference/editor' },
      { path: '/preference/markdown' }
    ]
  }),
  useRoute: () => routeMock
}))

import SideBar from '@/prefComponents/sideBar/index.vue'

describe('SideBar.vue', () => {
  let wrapper

  beforeEach(() => {
    pushMock.mockClear()
    wrapper = shallowMount(SideBar, {
      global: {
        mocks: { $t: (key) => key },
        stubs: {
          'el-autocomplete': true,
          Search: true
        }
      }
    })
  })

  afterEach(() => {
    wrapper.unmount()
  })

  it('renders without errors', () => {
    expect(wrapper.exists()).toBe(true)
  })

  it('has pref-sidebar root class', () => {
    expect(wrapper.find('.pref-sidebar').exists()).toBe(true)
  })

  it('renders the title h3', () => {
    const h3 = wrapper.find('h3.title')
    expect(h3.exists()).toBe(true)
  })

  it('renders category items', () => {
    const items = wrapper.findAll('.item')
    expect(items.length).toBeGreaterThan(0)
  })

  it('has search wrapper', () => {
    expect(wrapper.find('.search-wrapper').exists()).toBe(true)
  })
})
