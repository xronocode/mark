import { shallowMount } from '@vue/test-utils'

describe('prefComponents/common/separator/index.vue', () => {
  it('mounts without errors', async () => {
    const Separator = (await import('@/prefComponents/common/separator/index.vue')).default
    const wrapper = shallowMount(Separator)
    expect(wrapper.exists()).toBe(true)
    expect(wrapper.find('.pref-separator').exists()).toBe(true)
  })
})
