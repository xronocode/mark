/**
 * Tests for sideBar/treeOpenedTab.vue (mapped from recentlyOpenedTab in the task spec).
 * The file was renamed to treeOpenedTab.vue in the source.
 */
import { shallowMount } from '@vue/test-utils'
import { setupTestPinia } from '../../pinia'
import { createI18n } from 'vue-i18n'

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: {} } })

describe('sideBar/treeOpenedTab.vue', () => {
  let pinia

  beforeEach(async () => {
    pinia = setupTestPinia()
    const { useEditorStore } = await import('@/store/editor')
    const editorStore = useEditorStore()
    editorStore.currentFile = {
      id: 'tab-1',
      pathname: '/tmp/test.md',
      filename: 'test.md',
      isSaved: true
    }
    editorStore.tabs = [editorStore.currentFile]
  })

  it('mounts without errors', async () => {
    const OpenedTab = (await import('@/components/sideBar/treeOpenedTab.vue')).default
    const wrapper = shallowMount(OpenedTab, {
      props: {
        file: {
          id: 'tab-1',
          pathname: '/tmp/test.md',
          filename: 'test.md',
          isSaved: true
        }
      },
      global: {
        plugins: [pinia, i18n]
      }
    })
    expect(wrapper.exists()).toBe(true)
    expect(wrapper.find('.opened-file').exists()).toBe(true)
  })

  it('marks active file with active class', async () => {
    const OpenedTab = (await import('@/components/sideBar/treeOpenedTab.vue')).default
    const wrapper = shallowMount(OpenedTab, {
      props: {
        file: {
          id: 'tab-1',
          pathname: '/tmp/test.md',
          filename: 'test.md',
          isSaved: true
        }
      },
      global: {
        plugins: [pinia, i18n]
      }
    })
    expect(wrapper.find('.opened-file.active').exists()).toBe(true)
  })

  it('shows unsaved class for unsaved files', async () => {
    const OpenedTab = (await import('@/components/sideBar/treeOpenedTab.vue')).default
    const wrapper = shallowMount(OpenedTab, {
      props: {
        file: {
          id: 'tab-2',
          pathname: '/tmp/unsaved.md',
          filename: 'unsaved.md',
          isSaved: false
        }
      },
      global: {
        plugins: [pinia, i18n]
      }
    })
    expect(wrapper.find('.opened-file.unsaved').exists()).toBe(true)
  })

  it('displays the filename', async () => {
    const OpenedTab = (await import('@/components/sideBar/treeOpenedTab.vue')).default
    const wrapper = shallowMount(OpenedTab, {
      props: {
        file: {
          id: 'tab-1',
          pathname: '/tmp/test.md',
          filename: 'test.md',
          isSaved: true
        }
      },
      global: {
        plugins: [pinia, i18n]
      }
    })
    expect(wrapper.find('.name').text()).toBe('test.md')
  })
})
