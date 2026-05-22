import { shallowMount } from '@vue/test-utils'
import { setupTestPinia } from '../pinia'
import { createI18n } from 'vue-i18n'

vi.mock('@/bus', () => ({
  default: { on: vi.fn(), off: vi.fn(), emit: vi.fn() }
}))

vi.mock('@/assets/icons/import_file.svg?url', () => ({
  default: 'import_file.svg'
}))

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: {} } })

describe('import/index.vue', () => {
  let pinia

  beforeEach(() => {
    pinia = setupTestPinia()
  })

  it('mounts without errors', async () => {
    const ImportModal = (await import('@/components/import/index.vue')).default
    const wrapper = shallowMount(ImportModal, {
      global: {
        plugins: [pinia, i18n],
        stubs: {
          ElDialog: true
        }
      }
    })
    expect(wrapper.exists()).toBe(true)
    expect(wrapper.find('.import-dialog').exists()).toBe(true)
  })

  it('renders supported file types list', async () => {
    const ImportModal = (await import('@/components/import/index.vue')).default
    const wrapper = shallowMount(ImportModal, {
      global: {
        plugins: [pinia, i18n],
        stubs: {
          ElDialog: { template: '<div><slot /></div>' }
        }
      }
    })
    const fileTypes = wrapper.findAll('.file-list div')
    expect(fileTypes.length).toBe(5)
    const texts = fileTypes.map((el) => el.text())
    expect(texts).toContain('.md')
    expect(texts).toContain('.html')
    expect(texts).toContain('.docx')
  })

  it('registers importDialog bus listener', async () => {
    const bus = (await import('@/bus')).default
    const ImportModal = (await import('@/components/import/index.vue')).default
    shallowMount(ImportModal, {
      global: {
        plugins: [pinia, i18n],
        stubs: {
          ElDialog: true
        }
      }
    })
    expect(bus.on).toHaveBeenCalledWith('importDialog', expect.any(Function))
  })
})
