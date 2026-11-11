import { shallowMount } from '@vue/test-utils'
import { setupTestPinia } from '../pinia'
import { createI18n } from 'vue-i18n'

vi.mock('@/bus', () => ({
  default: { on: vi.fn(), off: vi.fn(), emit: vi.fn() }
}))

// C-SEC-COVERAGE-IMPORTS: stub shell child modules at import as well as at mount.
// Rendering stubs alone still compile the unused production editor/dialog trees.
vi.mock('@/components/recent', () => ({ default: { name: 'Recent', template: '<div />' } }))
vi.mock('@/components/editorWithTabs', () => ({ default: { name: 'EditorWithTabs', template: '<div />' } }))
vi.mock('@/components/titleBar', () => ({ default: { name: 'TitleBar', template: '<div />' } }))
vi.mock('@/components/sideBar', () => ({ default: { name: 'SideBar', template: '<div />' } }))
vi.mock('@/components/about', () => ({ default: { name: 'AboutDialog', template: '<div />' } }))
vi.mock('@/components/commandPalette', () => ({ default: { name: 'CommandPalette', template: '<div />' } }))
vi.mock('@/components/projectSearch', () => ({ default: { name: 'ProjectSearch', template: '<div />' } }))
vi.mock('@/components/problems', () => ({ default: { name: 'ProblemsPanel', template: '<div />' } }))
vi.mock('@/components/exportSettings', () => ({ default: { name: 'ExportSettingDialog', template: '<div />' } }))
vi.mock('@/components/rename', () => ({ default: { name: 'Rename', template: '<div />' } }))
vi.mock('@/components/tweet', () => ({ default: { name: 'Tweet', template: '<div />' } }))
vi.mock('@/components/import', () => ({ default: { name: 'ImportModal', template: '<div />' } }))
vi.mock('@/components/liveViewer', () => ({ default: { name: 'LiveViewer', template: '<div />' } }))
vi.mock('@/components/zoomIndicator', () => ({ default: { name: 'ZoomIndicator', template: '<div />' } }))
vi.mock('@/components/updateNotice', () => ({ default: { name: 'UpdateNotice', template: '<div />' } }))
vi.mock('@/components/rollbackConfirm', () => ({ default: { name: 'RollbackConfirm', template: '<div />' } }))
vi.mock('@/components/notificationStack', () => ({ default: { name: 'NotificationStack', template: '<div />' } }))
vi.mock('@/components/notificationsHistory', () => ({ default: { name: 'NotificationsHistory', template: '<div />' } }))
vi.mock('@/components/whatsNew', () => ({ default: { name: 'WhatsNewDialog', template: '<div />' } }))
vi.mock('@/components/sideBar/workspaceModeDialog.vue', () => ({ default: { name: 'WorkspaceModeDialog', template: '<div />' } }))

vi.mock('@/util/theme', () => ({
  addCommonStyle: vi.fn(),
  addThemeStyle: vi.fn(),
  addCustomStyle: vi.fn()
}))

vi.mock('@/config', () => ({
  DEFAULT_STYLE: { theme: 'light', codeFontFamily: 'monospace', codeFontSize: '14px', hideScrollbar: false },
  // C-38 T-007: app.vue re-tints Mica through isDarkTheme in the theme
  // watcher / boot block.
  isDarkTheme: vi.fn(() => false)
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
  }, 15_000) // bounded shell mount; the unrelated editor import is stubbed above

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
