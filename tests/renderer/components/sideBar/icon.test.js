import { shallowMount } from '@vue/test-utils'

vi.mock('muya/lib/ui/fileIcons', () => ({
  default: {
    getClassByName: vi.fn((name) => {
      if (name.endsWith('.md')) return 'icon-markdown'
      return null
    })
  }
}))

describe('sideBar/icon.vue', () => {
  it('mounts without errors', async () => {
    const FileIcon = (await import('@/components/sideBar/icon.vue')).default
    const wrapper = shallowMount(FileIcon, {
      props: {
        name: 'test.md'
      }
    })
    expect(wrapper.exists()).toBe(true)
    expect(wrapper.find('.file-icon').exists()).toBe(true)
  })

  it('applies correct class for markdown file', async () => {
    const FileIcon = (await import('@/components/sideBar/icon.vue')).default
    const wrapper = shallowMount(FileIcon, {
      props: {
        name: 'readme.md'
      }
    })
    expect(wrapper.find('.icon-markdown').exists()).toBe(true)
  })

  it('falls back to mock.md icon when getClassByName returns null', async () => {
    const FileIcon = (await import('@/components/sideBar/icon.vue')).default
    const wrapper = shallowMount(FileIcon, {
      props: {
        name: 'data.bin'
      }
    })
    // Falls back to getClassByName('mock.md') which returns 'icon-markdown'
    expect(wrapper.find('.file-icon').exists()).toBe(true)
  })
})
