import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

const listenMock = vi.fn()
const unlistenMock = vi.fn()

vi.mock('@tauri-apps/api/event', () => ({
  listen: listenMock
}))

vi.mock('muya/lib', () => {
  const setMarkdownMock = vi.fn()
  const destroyMock = vi.fn()
  return {
    default: class Muya {
      constructor(el) {
        this.container = el
        this.setMarkdown = setMarkdownMock
        this.destroy = destroyMock
      }
    }
  }
})

vi.mock('muya/themes/default.css', () => ({}))

vi.mock('@/config', () => ({
  DEFAULT_EDITOR_FONT_FAMILY: 'Open Sans'
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key, fallback) => fallback || key })
}))

vi.mock('@/store/preferences', () => ({
  usePreferencesStore: () => ({
    lineHeight: '1.6',
    fontSize: 16,
    editorFontFamily: ''
  })
}))

vi.mock('pinia', () => ({
  storeToRefs: (store) => {
    const { ref } = require('vue')
    return {
      lineHeight: ref(store.lineHeight),
      fontSize: ref(store.fontSize),
      editorFontFamily: ref(store.editorFontFamily)
    }
  }
}))

describe('LiveViewer', () => {
  let eventHandler

  beforeEach(() => {
    vi.clearAllMocks()
    listenMock.mockImplementation(async (_event, handler) => {
      eventHandler = handler
      return unlistenMock
    })
  })

  const mountComponent = async () => {
    const LiveViewer = (await import('@/components/liveViewer/index.vue')).default
    const wrapper = mount(LiveViewer, {
      attachTo: document.createElement('div')
    })
    await nextTick()
    await nextTick()
    return wrapper
  }

  it('renders idle state initially', async () => {
    const wrapper = await mountComponent()
    expect(wrapper.find('.live-idle').exists()).toBe(true)
    expect(wrapper.find('.live-indicator').exists()).toBe(false)
  })

  it('registers Tauri event listener on mount', async () => {
    await mountComponent()
    expect(listenMock).toHaveBeenCalledWith('mt::live::update', expect.any(Function))
  })

  it('handles doc_open event', async () => {
    const wrapper = await mountComponent()
    eventHandler({ payload: { update_type: 'doc_open', payload: { session_id: 's1', title: 'Test', content: '# Hello' } } })
    await nextTick()
    expect(wrapper.find('.live-indicator').exists()).toBe(true)
    expect(wrapper.find('.live-session-info').text()).toContain('Test')
  })

  it('handles doc_patch event', async () => {
    const wrapper = await mountComponent()
    eventHandler({ payload: { update_type: 'doc_open', payload: { session_id: 's1', title: 'X', content: '' } } })
    await nextTick()
    eventHandler({ payload: { update_type: 'doc_patch', payload: { full_content: '# Updated', revision: 2, section: 'body' } } })
    await nextTick()
    expect(wrapper.find('.live-indicator').exists()).toBe(true)
  })

  it('handles doc_close event', async () => {
    const wrapper = await mountComponent()
    eventHandler({ payload: { update_type: 'doc_open', payload: { session_id: 's1', title: 'X', content: '' } } })
    await nextTick()
    eventHandler({ payload: { update_type: 'doc_close', payload: { session_id: 's1', final_revision: 5 } } })
    await nextTick()
    expect(wrapper.find('.live-idle').exists()).toBe(true)
  })

  it('ignores invalid event payloads', async () => {
    await mountComponent()
    eventHandler({ payload: null })
    eventHandler({ payload: { update_type: null, payload: null } })
    eventHandler({ payload: 'not-an-object' })
  })

  it('unlistens and destroys muya on unmount', async () => {
    const wrapper = await mountComponent()
    wrapper.unmount()
    expect(unlistenMock).toHaveBeenCalled()
  })
})
