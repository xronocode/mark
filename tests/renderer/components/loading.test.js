import { shallowMount } from '@vue/test-utils'

describe('loading/index.vue', () => {
  it('mounts without errors', async () => {
    const Loading = (await import('@/components/loading/index.vue')).default
    const wrapper = shallowMount(Loading)
    expect(wrapper.exists()).toBe(true)
    expect(wrapper.find('.cpt-loading').exists()).toBe(true)
  })

  it('renders 3 dot spans', async () => {
    const Loading = (await import('@/components/loading/index.vue')).default
    const wrapper = shallowMount(Loading)
    const dots = wrapper.findAll('.loader span')
    expect(dots.length).toBe(3)
  })

  it('applies custom size', async () => {
    const Loading = (await import('@/components/loading/index.vue')).default
    const wrapper = shallowMount(Loading, {
      props: { size: 20 }
    })
    const dot = wrapper.find('.loader span')
    expect(dot.attributes('style')).toContain('width: 20px')
    expect(dot.attributes('style')).toContain('height: 20px')
  })

  it('uses default size of 14px', async () => {
    const Loading = (await import('@/components/loading/index.vue')).default
    const wrapper = shallowMount(Loading)
    const dot = wrapper.find('.loader span')
    expect(dot.attributes('style')).toContain('width: 14px')
    expect(dot.attributes('style')).toContain('height: 14px')
  })
})
