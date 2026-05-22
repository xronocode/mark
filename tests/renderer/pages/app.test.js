import { shallowMount } from '@vue/test-utils'
import { setupTestPinia } from '../pinia'
import { createI18n } from 'vue-i18n'

vi.mock('@/bus', () => ({
  default: { on: vi.fn(), off: vi.fn(), emit: vi.fn() }
}))

vi.mock('@/util/theme', () => ({
  addCommonStyle: vi.fn(),
  addThemeStyle: vi.fn(),
  addCustomStyle: vi.fn()
}))

vi.mock('@/config', () => ({
  DEFAULT_STYLE: { theme: 'light', codeFontFamily: 'monospace', codeFontSize: '14px', hideScrollbar: false }
}))

vi.mock('@/store/tweet', () => ({
  useTweetStore: () => ({ LISTEN_FOR_TWEET: vi.fn() })
}))
vi.mock('@/store/listenForMain', () => ({
  useListenForMainStore: () => ({ LISTEN_FOR_EDIT: vi.fn() })
}))
vi.mock('@/store/commandCenter', () => ({
  useCommandCenterStore: () => ({
    LISTEN_COMMAND_CENTER_BUS: vi.fn(async () => {}),
    rootCommand: {}
  })
}))

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: {} } })

describe('App.vue page', () => {
  let pinia

  beforeEach(() => {
    pinia = setupTestPinia()
  })

  it('mounts without errors', async () => {
    const AppPage = (await import('@/pages/app.vue')).default
    const wrapper = shallowMount(AppPage, {
      global: {
        plugins: [pinia, i18n],
        stubs: {
          SideBar: true,
          TitleBar: true,
          EditorWithTabs: true,
          Recent: true,
          CommandPalette: true,
          AboutDialog: true,
          ExportSettingDialog: true,
          Rename: true,
          Tweet: true,
          ImportModal: true
        }
      }
    })
    expect(wrapper.exists()).toBe(true)
    expect(wrapper.find('.editor-container').exists()).toBe(true)
  })

  it('renders placeholder when init is false', async () => {
    const { useMainStore } = await import('@/store')
    const AppPage = (await import('@/pages/app.vue')).default
    const wrapper = shallowMount(AppPage, {
      global: {
        plugins: [pinia, i18n],
        stubs: {
          SideBar: true,
          TitleBar: true,
          EditorWithTabs: true,
          Recent: true,
          CommandPalette: true,
          AboutDialog: true,
          ExportSettingDialog: true,
          Rename: true,
          Tweet: true,
          ImportModal: true
        }
      }
    })
    const store = useMainStore()
    store.init = false
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.editor-placeholder').exists()).toBe(true)
  })
})
