import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'

const listenMock = vi.fn()
const unlistenMock = vi.fn()

vi.mock('@tauri-apps/api/event', () => ({
  listen: listenMock
}))

const setMarkdownMock = vi.fn()
const destroyMock = vi.fn()
const clearHistoryMock = vi.fn()

vi.mock('muya/lib', () => ({
  default: class Muya {
    constructor(el) {
      this.container = el
      this.setMarkdown = setMarkdownMock
      this.destroy = destroyMock
      this.clearHistory = clearHistoryMock
    }
  }
}))

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
    await flushPromises()
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

  it('handles doc_open — shows indicator and enters read-only', async () => {
    const wrapper = await mountComponent()
    eventHandler({ payload: { update_type: 'doc_open', payload: { session_id: 's1', title: 'Test', content: '# Hello' } } })
    await nextTick()
    expect(wrapper.find('.live-indicator').exists()).toBe(true)
    expect(wrapper.find('.live-session-info').text()).toContain('Test')
    expect(setMarkdownMock).toHaveBeenCalledWith('# Hello')
  })

  it('handles doc_open with missing title — defaults to Meeting', async () => {
    const wrapper = await mountComponent()
    eventHandler({ payload: { update_type: 'doc_open', payload: { session_id: 's1', content: '' } } })
    await nextTick()
    expect(wrapper.find('.live-session-info').text()).toContain('Meeting')
  })

  it('handles doc_patch event', async () => {
    await mountComponent()
    eventHandler({ payload: { update_type: 'doc_open', payload: { session_id: 's1', title: 'X', content: '' } } })
    await nextTick()
    setMarkdownMock.mockClear()
    eventHandler({ payload: { update_type: 'doc_patch', payload: { full_content: '# Updated', revision: 2, section: 'body' } } })
    await nextTick()
    expect(setMarkdownMock).toHaveBeenCalledWith('# Updated')
  })

  it('ignores doc_patch when not live', async () => {
    await mountComponent()
    setMarkdownMock.mockClear()
    eventHandler({ payload: { update_type: 'doc_patch', payload: { full_content: 'X', revision: 1 } } })
    await nextTick()
    expect(setMarkdownMock).not.toHaveBeenCalled()
  })

  it('handles doc_close — exits read-only and clears undo history', async () => {
    const wrapper = await mountComponent()
    eventHandler({ payload: { update_type: 'doc_open', payload: { session_id: 's1', title: 'X', content: '' } } })
    await nextTick()
    eventHandler({ payload: { update_type: 'doc_close', payload: { session_id: 's1', final_revision: 5 } } })
    await nextTick()
    expect(wrapper.find('.live-idle').exists()).toBe(true)
    expect(clearHistoryMock).toHaveBeenCalled()
  })

  it('handles clearHistory throwing', async () => {
    await mountComponent()
    eventHandler({ payload: { update_type: 'doc_open', payload: { session_id: 's1', title: 'X', content: '' } } })
    await nextTick()
    clearHistoryMock.mockImplementationOnce(() => { throw new Error('no history') })
    eventHandler({ payload: { update_type: 'doc_close', payload: { session_id: 's1', final_revision: 1 } } })
    await nextTick()
  })

  it('ignores invalid event payloads', async () => {
    await mountComponent()
    eventHandler({ payload: null })
    eventHandler({ payload: { update_type: null, payload: null } })
    eventHandler({ payload: 'not-an-object' })
    eventHandler({ payload: { update_type: 'doc_open', payload: null } })
  })

  it('exits read-only on unmount if still live', async () => {
    const wrapper = await mountComponent()
    eventHandler({ payload: { update_type: 'doc_open', payload: { session_id: 's1', title: 'X', content: '' } } })
    await nextTick()
    wrapper.unmount()
    expect(unlistenMock).toHaveBeenCalled()
  })

  it('unlistens and destroys muya on unmount when idle', async () => {
    const wrapper = await mountComponent()
    wrapper.unmount()
    expect(unlistenMock).toHaveBeenCalled()
    expect(destroyMock).toHaveBeenCalled()
  })
})
