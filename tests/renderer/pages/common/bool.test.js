import { shallowMount } from '@vue/test-utils'

vi.mock('@element-plus/icons-vue', () => ({
  InfoFilled: { template: '<svg/>' }
}))

describe('prefComponents/common/bool/index.vue', () => {
  it('mounts without errors', async () => {
    const Bool = (await import('@/prefComponents/common/bool/index.vue')).default
    const wrapper = shallowMount(Bool, {
      props: {
        description: 'Enable feature',
        bool: true,
        onChange: vi.fn()
      },
      global: {
        stubs: {
          ElSwitch: true,
          ElTooltip: true,
          InfoFilled: true
        }
      }
    })
    expect(wrapper.exists()).toBe(true)
    expect(wrapper.find('.pref-switch-item').exists()).toBe(true)
  })

  it('renders description text', async () => {
    const Bool = (await import('@/prefComponents/common/bool/index.vue')).default
    const wrapper = shallowMount(Bool, {
      props: {
        description: 'Auto save',
        bool: false,
        onChange: vi.fn()
      },
      global: {
        stubs: {
          ElSwitch: true,
          ElTooltip: true,
          InfoFilled: true
        }
      }
    })
    expect(wrapper.find('.description').text()).toContain('Auto save')
  })

  it('renders description with more link prop', async () => {
    const Bool = (await import('@/prefComponents/common/bool/index.vue')).default
    const wrapper = shallowMount(Bool, {
      props: {
        description: 'Feature',
        bool: true,
        onChange: vi.fn(),
        more: 'https://example.com'
      },
      global: {
        stubs: {
          ElSwitch: true,
          ElTooltip: true,
          InfoFilled: true
        }
      }
    })
    // The component renders; when more is provided the description area contains
    // an info icon (stubbed away). Just verify the component accepts and renders.
    expect(wrapper.find('.description').exists()).toBe(true)
    expect(wrapper.find('.pref-switch-item').exists()).toBe(true)
  })

  it('applies ag-underdevelop class when disabled', async () => {
    const Bool = (await import('@/prefComponents/common/bool/index.vue')).default
    const wrapper = shallowMount(Bool, {
      props: {
        description: 'Feature',
        bool: true,
        onChange: vi.fn(),
        disable: true
      },
      global: {
        stubs: {
          ElSwitch: true,
          ElTooltip: true,
          InfoFilled: true
        }
      }
    })
    expect(wrapper.find('.ag-underdevelop').exists()).toBe(true)
  })
})
