import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'

const listenMock = vi.fn()
const unlistenMock = vi.fn()

vi.mock('@tauri-apps/api/event', () => ({
  listen: listenMock
}))

const busMock = { emit: vi.fn() }

vi.mock('@/bus', () => ({
  default: busMock
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
    // In idle state (isLive=false), the v-if hides the indicator
    expect(wrapper.find('.live-indicator').exists()).toBe(false)
  })

  it('registers Tauri event listener on mount', async () => {
    await mountComponent()
    expect(listenMock).toHaveBeenCalledWith('mt::live::update', expect.any(Function))
  })

  it('handles doc_open — shows indicator and emits new-untitled-tab', async () => {
    const wrapper = await mountComponent()
    eventHandler({ payload: { update_type: 'doc_open', payload: { session_id: 's1', title: 'Test', content: '# Hello' } } })
    await nextTick()
    expect(wrapper.find('.live-indicator').exists()).toBe(true)
    expect(wrapper.find('.live-session-info').text()).toContain('Test')
    expect(busMock.emit).toHaveBeenCalledWith('mt::new-untitled-tab', {
      markdown: '# Hello',
      selected: true
    })
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
    busMock.emit.mockClear()
    eventHandler({ payload: { update_type: 'doc_patch', payload: { full_content: '# Updated', revision: 2, section: 'body' } } })
    await nextTick()
    expect(busMock.emit).toHaveBeenCalledWith('file-loaded', { markdown: '# Updated' })
  })

  it('ignores doc_patch when not live', async () => {
    await mountComponent()
    busMock.emit.mockClear()
    eventHandler({ payload: { update_type: 'doc_patch', payload: { full_content: 'X', revision: 1 } } })
    await nextTick()
    expect(busMock.emit).not.toHaveBeenCalledWith('file-loaded', expect.anything())
  })

  it('handles doc_close — exits live mode', async () => {
    const wrapper = await mountComponent()
    eventHandler({ payload: { update_type: 'doc_open', payload: { session_id: 's1', title: 'X', content: '' } } })
    await nextTick()
    expect(wrapper.find('.live-indicator').exists()).toBe(true)
    eventHandler({ payload: { update_type: 'doc_close', payload: { session_id: 's1', final_revision: 5 } } })
    await nextTick()
    expect(wrapper.find('.live-indicator').exists()).toBe(false)
  })

  it('handles doc_close gracefully even without prior open', async () => {
    await mountComponent()
    // Should not throw
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

  it('unlistens on unmount if still live', async () => {
    const wrapper = await mountComponent()
    eventHandler({ payload: { update_type: 'doc_open', payload: { session_id: 's1', title: 'X', content: '' } } })
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
