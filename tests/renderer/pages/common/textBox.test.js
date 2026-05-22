import { shallowMount } from '@vue/test-utils'

vi.mock('@element-plus/icons-vue', () => ({
  InfoFilled: { template: '<svg/>' }
}))

describe('prefComponents/common/textBox/index.vue', () => {
  it('mounts without errors', async () => {
    const TextBox = (await import('@/prefComponents/common/textBox/index.vue')).default
    const wrapper = shallowMount(TextBox, {
      props: {
        description: 'Image path',
        input: '/images',
        onChange: vi.fn()
      },
      global: {
        stubs: {
          ElInput: true,
          InfoFilled: true
        }
      }
    })
    expect(wrapper.exists()).toBe(true)
    expect(wrapper.find('.pref-text-box-item').exists()).toBe(true)
  })

  it('renders description', async () => {
    const TextBox = (await import('@/prefComponents/common/textBox/index.vue')).default
    const wrapper = shallowMount(TextBox, {
      props: {
        description: 'Custom CSS',
        input: '',
        onChange: vi.fn()
      },
      global: {
        stubs: {
          ElInput: true,
          InfoFilled: true
        }
      }
    })
    expect(wrapper.find('.description').text()).toContain('Custom CSS')
  })

  it('renders notes when provided', async () => {
    const TextBox = (await import('@/prefComponents/common/textBox/index.vue')).default
    const wrapper = shallowMount(TextBox, {
      props: {
        description: 'Path',
        input: '',
        onChange: vi.fn(),
        notes: 'Use absolute paths'
      },
      global: {
        stubs: {
          ElInput: true,
          InfoFilled: true
        }
      }
    })
    expect(wrapper.find('.notes').text()).toBe('Use absolute paths')
  })

  it('applies ag-underdevelop when disabled', async () => {
    const TextBox = (await import('@/prefComponents/common/textBox/index.vue')).default
    const wrapper = shallowMount(TextBox, {
      props: {
        description: 'Path',
        input: '',
        onChange: vi.fn(),
        disable: true
      },
      global: {
        stubs: {
          ElInput: true,
          InfoFilled: true
        }
      }
    })
    expect(wrapper.find('.ag-underdevelop').exists()).toBe(true)
  })
})
