import { shallowMount } from '@vue/test-utils'
import { setupTestPinia } from '../pinia'
import { createI18n } from 'vue-i18n'

vi.mock('@/bus', () => ({
  default: { on: vi.fn(), off: vi.fn(), emit: vi.fn() }
}))

vi.mock('./exportOptions', () => ({
  getPageSizeList: () => [{ label: 'A4', value: 'A4' }],
  getHeaderFooterTypes: () => [{ label: 'None', value: 0 }],
  getExportThemeList: () => [{ label: 'Default', value: 'default' }]
}))

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: {} } })

describe('exportSettings/index.vue', () => {
  let pinia

  beforeEach(() => {
    pinia = setupTestPinia()
    window.marktext = {
      paths: { userDataPath: '/tmp/mt-test' },
      env: { type: 'editor', windowId: 1, debug: false, paths: { userDataPath: '/tmp/mt-test' } }
    }
  })

  it('mounts without errors', async () => {
    const ExportSettings = (await import('@/components/exportSettings/index.vue')).default
    const wrapper = shallowMount(ExportSettings, {
      global: {
        plugins: [pinia, i18n],
        stubs: {
          ElDialog: true,
          ElTabs: true,
          ElTabPane: true,
          ElInputNumber: true,
          Bool: true,
          CurSelect: true,
          FontTextBox: true,
          Range: true,
          TextBox: true
        }
      }
    })
    expect(wrapper.exists()).toBe(true)
    expect(wrapper.find('.print-settings-dialog').exists()).toBe(true)
  })

  it('registers showExportDialog bus listener', async () => {
    const bus = (await import('@/bus')).default
    const ExportSettings = (await import('@/components/exportSettings/index.vue')).default
    shallowMount(ExportSettings, {
      global: {
        plugins: [pinia, i18n],
        stubs: {
          ElDialog: true,
          ElTabs: true,
          ElTabPane: true,
          ElInputNumber: true,
          Bool: true,
          CurSelect: true,
          FontTextBox: true,
          Range: true,
          TextBox: true
        }
      }
    })
    expect(bus.on).toHaveBeenCalledWith('showExportDialog', expect.any(Function))
  })
})
