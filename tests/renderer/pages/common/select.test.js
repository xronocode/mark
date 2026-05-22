import { shallowMount } from '@vue/test-utils'

vi.mock('@element-plus/icons-vue', () => ({
  InfoFilled: { template: '<svg/>' }
}))

describe('prefComponents/common/select/index.vue', () => {
  const options = [
    { label: 'Light', value: 'light' },
    { label: 'Dark', value: 'dark' }
  ]

  it('mounts without errors', async () => {
    const Select = (await import('@/prefComponents/common/select/index.vue')).default
    const wrapper = shallowMount(Select, {
      props: {
        description: 'Theme',
        value: 'light',
        options,
        onChange: vi.fn()
      },
      global: {
        stubs: {
          ElSelect: true,
          ElOption: true,
          InfoFilled: true
        }
      }
    })
    expect(wrapper.exists()).toBe(true)
    expect(wrapper.find('.pref-select-item').exists()).toBe(true)
  })

  it('renders description text', async () => {
    const Select = (await import('@/prefComponents/common/select/index.vue')).default
    const wrapper = shallowMount(Select, {
      props: {
        description: 'Language',
        value: 'en',
        options: [{ label: 'English', value: 'en' }],
        onChange: vi.fn()
      },
      global: {
        stubs: {
          ElSelect: true,
          ElOption: true,
          InfoFilled: true
        }
      }
    })
    expect(wrapper.find('.description').text()).toContain('Language')
  })

  it('renders notes when provided', async () => {
    const Select = (await import('@/prefComponents/common/select/index.vue')).default
    const wrapper = shallowMount(Select, {
      props: {
        description: 'Theme',
        value: 'light',
        options,
        onChange: vi.fn(),
        notes: 'Restart required'
      },
      global: {
        stubs: {
          ElSelect: true,
          ElOption: true,
          InfoFilled: true
        }
      }
    })
    expect(wrapper.find('.notes').text()).toBe('Restart required')
  })

  it('applies ag-underdevelop when disabled', async () => {
    const Select = (await import('@/prefComponents/common/select/index.vue')).default
    const wrapper = shallowMount(Select, {
      props: {
        description: 'Theme',
        value: 'light',
        options,
        onChange: vi.fn(),
        disable: true
      },
      global: {
        stubs: {
          ElSelect: true,
          ElOption: true,
          InfoFilled: true
        }
      }
    })
    expect(wrapper.find('.ag-underdevelop').exists()).toBe(true)
  })
})
