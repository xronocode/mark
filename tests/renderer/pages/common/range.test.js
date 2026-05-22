import { shallowMount } from '@vue/test-utils'

vi.mock('@element-plus/icons-vue', () => ({
  InfoFilled: { template: '<svg/>' }
}))

describe('prefComponents/common/range/index.vue', () => {
  it('mounts without errors', async () => {
    const Range = (await import('@/prefComponents/common/range/index.vue')).default
    const wrapper = shallowMount(Range, {
      props: {
        description: 'Font size',
        value: 14,
        min: 8,
        max: 32,
        step: 1,
        onChange: vi.fn()
      },
      global: {
        stubs: {
          ElSlider: true,
          InfoFilled: true
        }
      }
    })
    expect(wrapper.exists()).toBe(true)
    expect(wrapper.find('.pref-range-item').exists()).toBe(true)
  })

  it('displays description and value', async () => {
    const Range = (await import('@/prefComponents/common/range/index.vue')).default
    const wrapper = shallowMount(Range, {
      props: {
        description: 'Line height',
        value: 1.6,
        min: 1.0,
        max: 2.0,
        step: 0.1,
        onChange: vi.fn()
      },
      global: {
        stubs: {
          ElSlider: true,
          InfoFilled: true
        }
      }
    })
    expect(wrapper.find('.description').text()).toContain('Line height')
    expect(wrapper.find('.value').text()).toContain('1.6')
  })

  it('displays unit when provided', async () => {
    const Range = (await import('@/prefComponents/common/range/index.vue')).default
    const wrapper = shallowMount(Range, {
      props: {
        description: 'Font size',
        value: 14,
        min: 8,
        max: 32,
        step: 1,
        unit: 'px',
        onChange: vi.fn()
      },
      global: {
        stubs: {
          ElSlider: true,
          InfoFilled: true
        }
      }
    })
    expect(wrapper.find('.value').text()).toContain('px')
  })

  it('applies ag-underdevelop class when disabled', async () => {
    const Range = (await import('@/prefComponents/common/range/index.vue')).default
    const wrapper = shallowMount(Range, {
      props: {
        description: 'Size',
        value: 14,
        min: 8,
        max: 32,
        step: 1,
        onChange: vi.fn(),
        disable: true
      },
      global: {
        stubs: {
          ElSlider: true,
          InfoFilled: true
        }
      }
    })
    expect(wrapper.find('.ag-underdevelop').exists()).toBe(true)
  })
})
