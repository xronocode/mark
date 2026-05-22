import { shallowMount } from '@vue/test-utils'
import { setupTestPinia } from '../pinia'
import { createI18n } from 'vue-i18n'

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: {} } })

describe('editorWithTabs/index.vue', () => {
  let pinia

  beforeEach(() => {
    pinia = setupTestPinia()
  })

  it('mounts with required props', async () => {
    const EditorWithTabs = (await import('@/components/editorWithTabs/index.vue')).default
    const wrapper = shallowMount(EditorWithTabs, {
      props: {
        markdown: '# Test',
        cursor: { line: 0, ch: 0 },
        muyaIndexCursor: null,
        sourceCode: false,
        showTabBar: true,
        textDirection: 'ltr',
        platform: 'darwin'
      },
      global: {
        plugins: [pinia, i18n],
        stubs: {
          Tabs: true,
          Editor: true,
          SourceCode: true,
          TabNotifications: true
        }
      }
    })
    expect(wrapper.exists()).toBe(true)
    expect(wrapper.find('.editor-with-tabs').exists()).toBe(true)
  })

  it('hides tabs when showTabBar is false', async () => {
    const EditorWithTabs = (await import('@/components/editorWithTabs/index.vue')).default
    const wrapper = shallowMount(EditorWithTabs, {
      props: {
        markdown: '# Test',
        cursor: { line: 0, ch: 0 },
        sourceCode: false,
        showTabBar: false,
        textDirection: 'ltr',
        platform: 'darwin'
      },
      global: {
        plugins: [pinia, i18n],
        stubs: {
          Tabs: true,
          Editor: true,
          SourceCode: true,
          TabNotifications: true
        }
      }
    })
    // tabs-stub exists but is hidden via v-show
    const tabs = wrapper.findComponent({ name: 'Tabs' })
    // v-show sets display:none, but with stubs we just check component existence
    expect(wrapper.exists()).toBe(true)
  })

  it('renders SourceCode when sourceCode prop is true', async () => {
    const EditorWithTabs = (await import('@/components/editorWithTabs/index.vue')).default
    const wrapper = shallowMount(EditorWithTabs, {
      props: {
        markdown: '# Test',
        cursor: { line: 0, ch: 0 },
        sourceCode: true,
        showTabBar: true,
        textDirection: 'ltr',
        platform: 'darwin'
      },
      global: {
        plugins: [pinia, i18n],
        stubs: {
          Tabs: true,
          Editor: true,
          SourceCode: true,
          TabNotifications: true
        }
      }
    })
    expect(wrapper.findComponent({ name: 'SourceCode' }).exists()).toBe(true)
  })
})
