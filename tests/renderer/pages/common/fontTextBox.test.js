import { shallowMount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'

vi.mock('@element-plus/icons-vue', () => ({
  InfoFilled: { template: '<svg/>' },
  ArrowDown: { template: '<svg/>' }
}))

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: {} } })

describe('prefComponents/common/fontTextBox/index.vue', () => {
  it('mounts without errors', async () => {
    const FontTextBox = (await import('@/prefComponents/common/fontTextBox/index.vue')).default
    const wrapper = shallowMount(FontTextBox, {
      props: {
        description: 'Font family',
        value: 'Arial',
        onChange: vi.fn()
      },
      global: {
        plugins: [i18n],
        stubs: {
          ElAutocomplete: true,
          InfoFilled: true,
          ArrowDown: true
        }
      }
    })
    expect(wrapper.exists()).toBe(true)
    expect(wrapper.find('.pref-font-input-item').exists()).toBe(true)
  })

  it('renders description text', async () => {
    const FontTextBox = (await import('@/prefComponents/common/fontTextBox/index.vue')).default
    const wrapper = shallowMount(FontTextBox, {
      props: {
        description: 'Editor Font',
        value: 'Menlo',
        onChange: vi.fn()
      },
      global: {
        plugins: [i18n],
        stubs: {
          ElAutocomplete: true,
          InfoFilled: true,
          ArrowDown: true
        }
      }
    })
    expect(wrapper.find('.description').text()).toContain('Editor Font')
  })

  it('applies ag-underdevelop class when disabled', async () => {
    const FontTextBox = (await import('@/prefComponents/common/fontTextBox/index.vue')).default
    const wrapper = shallowMount(FontTextBox, {
      props: {
        description: 'Font',
        value: 'Arial',
        onChange: vi.fn(),
        disable: true
      },
      global: {
        plugins: [i18n],
        stubs: {
          ElAutocomplete: true,
          InfoFilled: true,
          ArrowDown: true
        }
      }
    })
    expect(wrapper.find('.ag-underdevelop').exists()).toBe(true)
  })
})
