/**
 * Tests for src/renderer/src/Main.vue
 *
 * Main.vue is a minimal shell that renders <router-view />.
 */

import { shallowMount } from '@vue/test-utils'

vi.mock('vue-router', () => ({
  useRouter: () => ({
    push: vi.fn(),
    currentRoute: { value: { path: '/' } }
  }),
  useRoute: () => ({ path: '/', name: 'editor' })
}))

import Main from '@/Main.vue'

describe('Main.vue', () => {
  let wrapper

  beforeEach(() => {
    wrapper = shallowMount(Main, {
      global: {
        stubs: {
          'router-view': true
        }
      }
    })
  })

  afterEach(() => {
    wrapper.unmount()
  })

  it('renders without errors', () => {
    expect(wrapper.exists()).toBe(true)
  })

  it('has #app root element', () => {
    expect(wrapper.find('#app').exists()).toBe(true)
  })

  it('renders a router-view stub', () => {
    const rv = wrapper.findComponent({ name: 'router-view' })
    expect(rv.exists()).toBe(true)
  })
})
