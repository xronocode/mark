import { shallowMount } from '@vue/test-utils'

describe('prefComponents/common/compound/index.vue', () => {
  it('mounts without errors', async () => {
    const Compound = (await import('@/prefComponents/common/compound/index.vue')).default
    const wrapper = shallowMount(Compound, {
      slots: {
        head: '<h6 class="title">Group Title</h6>',
        children: '<div class="child-content">Content</div>'
      }
    })
    expect(wrapper.exists()).toBe(true)
    expect(wrapper.find('.pref-group-item').exists()).toBe(true)
  })

  it('renders head slot', async () => {
    const Compound = (await import('@/prefComponents/common/compound/index.vue')).default
    const wrapper = shallowMount(Compound, {
      slots: {
        head: '<h6>My Group</h6>',
        children: '<span>stuff</span>'
      }
    })
    expect(wrapper.find('.pref-group-title h6').text()).toBe('My Group')
  })

  it('renders children slot', async () => {
    const Compound = (await import('@/prefComponents/common/compound/index.vue')).default
    const wrapper = shallowMount(Compound, {
      slots: {
        head: '<h6>G</h6>',
        children: '<div class="inner">Inner content</div>'
      }
    })
    expect(wrapper.find('.pref-group .inner').exists()).toBe(true)
  })

  it('renders notes when provided', async () => {
    const Compound = (await import('@/prefComponents/common/compound/index.vue')).default
    const wrapper = shallowMount(Compound, {
      props: {
        notes: 'Some important note'
      },
      slots: {
        head: '<h6>G</h6>',
        children: '<div>C</div>'
      }
    })
    expect(wrapper.find('.pref-group-notes').text()).toBe('Some important note')
  })

  it('does not render notes when not provided', async () => {
    const Compound = (await import('@/prefComponents/common/compound/index.vue')).default
    const wrapper = shallowMount(Compound, {
      slots: {
        head: '<h6>G</h6>',
        children: '<div>C</div>'
      }
    })
    expect(wrapper.find('.pref-group-notes').exists()).toBe(false)
  })
})
