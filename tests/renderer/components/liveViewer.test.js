import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'

const listenMock = vi.fn()
const unlistenMock = vi.fn()

vi.mock('@tauri-apps/api/event', () => ({
  listen: listenMock
}))

const storeMock = {
  OPEN_LIVE_DOCUMENT: vi.fn(), PATCH_LIVE_DOCUMENT: vi.fn(), CLOSE_LIVE_DOCUMENT: vi.fn()
}
vi.mock('@/store/editor', () => ({ useEditorStore: () => storeMock }))

describe('LiveViewer', () => {
  let eventHandler

  beforeEach(() => {
    vi.clearAllMocks()
    storeMock.OPEN_LIVE_DOCUMENT.mockReturnValue('live-tab')
    storeMock.PATCH_LIVE_DOCUMENT.mockReturnValue(true)
    storeMock.CLOSE_LIVE_DOCUMENT.mockReturnValue(true)
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
    // In idle state (isLive=false), the v-if hides the indicator
    expect(wrapper.find('.live-indicator').exists()).toBe(false)
  })

  it('registers Tauri event listener on mount', async () => {
    await mountComponent()
    expect(listenMock).toHaveBeenCalledWith('mt::live::update', expect.any(Function))
  })

  it('handles doc_open — shows indicator and opens an owned tab', async () => {
    const wrapper = await mountComponent()
    eventHandler({ payload: { update_type: 'doc_open', payload: { session_id: 's1', session_epoch: 1, title: 'Test', content: '# Hello' } } })
    await nextTick()
    expect(wrapper.find('.live-indicator').exists()).toBe(true)
    expect(wrapper.find('.live-session-info').text()).toContain('Test')
    expect(storeMock.OPEN_LIVE_DOCUMENT).toHaveBeenCalledWith(expect.objectContaining({
      markdown: '# Hello',
      sessionId: 's1', sessionEpoch: 1
    }))
  })

  it('handles doc_open with missing title — defaults to Meeting', async () => {
    const wrapper = await mountComponent()
    eventHandler({ payload: { update_type: 'doc_open', payload: { session_id: 's1', session_epoch: 1, content: '' } } })
    await nextTick()
    expect(wrapper.find('.live-session-info').text()).toContain('Meeting')
  })

  it('handles doc_patch event', async () => {
    await mountComponent()
    eventHandler({ payload: { update_type: 'doc_open', payload: { session_id: 's1', session_epoch: 1, title: 'X', content: '' } } })
    await nextTick()
    storeMock.PATCH_LIVE_DOCUMENT.mockClear()
    eventHandler({ payload: { update_type: 'doc_patch', payload: { session_id: 's1', session_epoch: 1, full_content: '# Updated', revision: 2, section: 'body' } } })
    await nextTick()
    expect(storeMock.PATCH_LIVE_DOCUMENT).toHaveBeenCalledWith(expect.objectContaining({ sessionId: 's1', sessionEpoch: 1, markdown: '# Updated' }))
  })

  it('ignores doc_patch when not live', async () => {
    await mountComponent()
    storeMock.PATCH_LIVE_DOCUMENT.mockClear()
    eventHandler({ payload: { update_type: 'doc_patch', payload: { session_id: 's1', session_epoch: 1, full_content: 'X', revision: 1 } } })
    await nextTick()
    expect(storeMock.PATCH_LIVE_DOCUMENT).not.toHaveBeenCalled()
  })

  it('handles doc_close — exits live mode', async () => {
    const wrapper = await mountComponent()
    eventHandler({ payload: { update_type: 'doc_open', payload: { session_id: 's1', session_epoch: 1, title: 'X', content: '' } } })
    await nextTick()
    expect(wrapper.find('.live-indicator').exists()).toBe(true)
    eventHandler({ payload: { update_type: 'doc_close', payload: { session_id: 's1', session_epoch: 1, final_revision: 5 } } })
    await nextTick()
    expect(wrapper.find('.live-indicator').exists()).toBe(false)
  })

  it('handles doc_close gracefully even without prior open', async () => {
    await mountComponent()
    // Should not throw
    eventHandler({ payload: { update_type: 'doc_close', payload: { session_id: 's1', session_epoch: 1, final_revision: 1 } } })
    await nextTick()
  })

  it('ignores invalid event payloads', async () => {
    await mountComponent()
    eventHandler({ payload: null })
    eventHandler({ payload: { update_type: null, payload: null } })
    eventHandler({ payload: 'not-an-object' })
    eventHandler({ payload: { update_type: 'doc_open', payload: null } })
  })

  it('unlistens on unmount if still live', async () => {
    const wrapper = await mountComponent()
    eventHandler({ payload: { update_type: 'doc_open', payload: { session_id: 's1', session_epoch: 1, title: 'X', content: '' } } })
    await nextTick()
    wrapper.unmount()
    expect(unlistenMock).toHaveBeenCalled()
  })

  it('unlistens on unmount when idle', async () => {
    const wrapper = await mountComponent()
    wrapper.unmount()
    expect(unlistenMock).toHaveBeenCalled()
  })
})
