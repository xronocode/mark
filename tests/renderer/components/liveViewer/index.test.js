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

describe('LiveViewer – extended coverage', () => {
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

  // ── Initial state ────────────────────────────────────────────

  it('renders idle state initially', async () => {
    const wrapper = await mountComponent()
    // In idle state (isLive=false), indicator is hidden via v-if
    expect(wrapper.find('.live-indicator').exists()).toBe(false)
  })

  it('has a root element', async () => {
    const wrapper = await mountComponent()
    expect(wrapper.element).toBeTruthy()
  })

  it('does not show indicator when idle', async () => {
    const wrapper = await mountComponent()
    expect(wrapper.find('.live-indicator').exists()).toBe(false)
    expect(wrapper.find('.live-session-info').exists()).toBe(false)
  })

  // ── Listener registration ───────────────────────────────────

  it('registers Tauri event listener on mount', async () => {
    await mountComponent()
    expect(listenMock).toHaveBeenCalledWith('mt::live::update', expect.any(Function))
  })

  // ── doc_open ─────────────────────────────────────────────────

  it('doc_open — shows indicator, sets session info, emits new-untitled-tab', async () => {
    const wrapper = await mountComponent()
    eventHandler({
      payload: {
        update_type: 'doc_open',
        payload: { session_id: 's1', title: 'Test Meeting', content: '# Hello' }
      }
    })
    await nextTick()

    expect(wrapper.find('.live-indicator').exists()).toBe(true)
    expect(wrapper.find('.live-session-info').text()).toContain('Test Meeting')
    expect(busMock.emit).toHaveBeenCalledWith('mt::new-untitled-tab', {
      markdown: '# Hello',
      selected: true
    })
  })

  it('doc_open with missing title defaults to Meeting', async () => {
    const wrapper = await mountComponent()
    eventHandler({
      payload: {
        update_type: 'doc_open',
        payload: { session_id: 's1', content: '' }
      }
    })
    await nextTick()

    expect(wrapper.find('.live-session-info').text()).toContain('Meeting')
  })

  it('doc_open with missing content defaults to empty string', async () => {
    await mountComponent()
    eventHandler({
      payload: {
        update_type: 'doc_open',
        payload: { session_id: 's1', title: 'X' }
      }
    })
    await nextTick()

    expect(busMock.emit).toHaveBeenCalledWith('mt::new-untitled-tab', {
      markdown: '',
      selected: true
    })
  })

  it('doc_open shows indicator', async () => {
    const wrapper = await mountComponent()
    expect(wrapper.find('.live-indicator').exists()).toBe(false)

    eventHandler({
      payload: {
        update_type: 'doc_open',
        payload: { session_id: 's1', title: 'X', content: '' }
      }
    })
    await nextTick()

    expect(wrapper.find('.live-indicator').exists()).toBe(true)
  })

  // ── doc_patch ────────────────────────────────────────────────

  it('doc_patch updates content when live', async () => {
    await mountComponent()
    // First, open a session
    eventHandler({
      payload: {
        update_type: 'doc_open',
        payload: { session_id: 's1', title: 'X', content: 'initial' }
      }
    })
    await nextTick()
    busMock.emit.mockClear()

    eventHandler({
      payload: {
        update_type: 'doc_patch',
        payload: { full_content: '# Updated', revision: 2, section: 'body' }
      }
    })
    await nextTick()

    expect(busMock.emit).toHaveBeenCalledWith('file-loaded', { markdown: '# Updated' })
  })

  it('doc_patch with missing full_content defaults to empty string', async () => {
    await mountComponent()
    eventHandler({
      payload: {
        update_type: 'doc_open',
        payload: { session_id: 's1', title: 'X', content: '' }
      }
    })
    await nextTick()
    busMock.emit.mockClear()

    eventHandler({
      payload: {
        update_type: 'doc_patch',
        payload: { revision: 3 }
      }
    })
    await nextTick()

    expect(busMock.emit).toHaveBeenCalledWith('file-loaded', { markdown: '' })
  })

  it('doc_patch is ignored when not live', async () => {
    await mountComponent()
    busMock.emit.mockClear()

    eventHandler({
      payload: {
        update_type: 'doc_patch',
        payload: { full_content: 'X', revision: 1 }
      }
    })
    await nextTick()

    expect(busMock.emit).not.toHaveBeenCalledWith('file-loaded', expect.anything())
  })

  // ── doc_close ────────────────────────────────────────────────

  it('doc_close exits live mode', async () => {
    const wrapper = await mountComponent()
    eventHandler({
      payload: {
        update_type: 'doc_open',
        payload: { session_id: 's1', title: 'X', content: '' }
      }
    })
    await nextTick()
    expect(wrapper.find('.live-indicator').exists()).toBe(true)

    eventHandler({
      payload: {
        update_type: 'doc_close',
        payload: { session_id: 's1', final_revision: 5 }
      }
    })
    await nextTick()

    expect(wrapper.find('.live-indicator').exists()).toBe(false)
  })

  it('doc_close does not throw without prior open', async () => {
    await mountComponent()

    // Should not throw
    eventHandler({
      payload: {
        update_type: 'doc_close',
        payload: { session_id: 's1', final_revision: 1 }
      }
    })
    await nextTick()
  })

  // ── doc_open shows live-dot and live-label ──────────────────

  it('doc_open renders live-dot and live-label', async () => {
    const wrapper = await mountComponent()
    eventHandler({
      payload: {
        update_type: 'doc_open',
        payload: { session_id: 's1', title: 'X', content: '' }
      }
    })
    await nextTick()

    expect(wrapper.find('.live-dot').exists()).toBe(true)
    expect(wrapper.find('.live-label').text()).toBe('LIVE')
  })

  it('live-dot and live-label hidden when idle', async () => {
    const wrapper = await mountComponent()
    expect(wrapper.find('.live-dot').exists()).toBe(false)
    expect(wrapper.find('.live-label').exists()).toBe(false)
  })

  // ── Invalid event payloads ───────────────────────────────────

  it('ignores event with null payload', async () => {
    await mountComponent()
    eventHandler({ payload: null })
    // No error thrown, no state change
  })

  it('ignores event with string payload', async () => {
    await mountComponent()
    eventHandler({ payload: 'not-an-object' })
  })

  it('ignores event with null update_type and null payload', async () => {
    await mountComponent()
    eventHandler({ payload: { update_type: null, payload: null } })
  })

  it('ignores event with update_type but null inner payload', async () => {
    await mountComponent()
    eventHandler({ payload: { update_type: 'doc_open', payload: null } })
  })

  it('ignores event with undefined payload field', async () => {
    await mountComponent()
    eventHandler({})
  })

  // ── Unmount ──────────────────────────────────────────────────

  it('unregisters listener on unmount when idle', async () => {
    const wrapper = await mountComponent()
    wrapper.unmount()
    expect(unlistenMock).toHaveBeenCalled()
  })

  it('unregisters listener on unmount when still live', async () => {
    const wrapper = await mountComponent()
    eventHandler({
      payload: {
        update_type: 'doc_open',
        payload: { session_id: 's1', title: 'X', content: '' }
      }
    })
    await nextTick()

    wrapper.unmount()
    expect(unlistenMock).toHaveBeenCalled()
  })

  // ── Multiple open/close cycles ───────────────────────────────

  it('handles multiple doc_open → doc_close cycles', async () => {
    const wrapper = await mountComponent()

    // First session
    eventHandler({
      payload: {
        update_type: 'doc_open',
        payload: { session_id: 's1', title: 'Session 1', content: '# One' }
      }
    })
    await nextTick()
    expect(wrapper.find('.live-indicator').exists()).toBe(true)

    eventHandler({
      payload: {
        update_type: 'doc_close',
        payload: { session_id: 's1', final_revision: 3 }
      }
    })
    await nextTick()
    expect(wrapper.find('.live-indicator').exists()).toBe(false)

    // Second session
    eventHandler({
      payload: {
        update_type: 'doc_open',
        payload: { session_id: 's2', title: 'Session 2', content: '# Two' }
      }
    })
    await nextTick()
    expect(wrapper.find('.live-session-info').text()).toContain('Session 2')

    eventHandler({
      payload: {
        update_type: 'doc_close',
        payload: { session_id: 's2', final_revision: 7 }
      }
    })
    await nextTick()
    expect(wrapper.find('.live-indicator').exists()).toBe(false)
  })

  // ── Branch coverage: console.log || fallback operators ───────
  // These exercise the '?' fallback branches in console.log template
  // literals. V8 counts each || as a branch.

  it('doc_open with missing session_id hits fallback branch', async () => {
    await mountComponent()
    // payload.session_id is undefined, so the `|| "?"` branch fires
    eventHandler({
      payload: {
        update_type: 'doc_open',
        payload: { title: 'X', content: '' }
      }
    })
    await nextTick()
    // No error — emits bus event regardless
    expect(busMock.emit).toHaveBeenCalledWith('mt::new-untitled-tab', {
      markdown: '',
      selected: true
    })
  })

  it('doc_open with explicit session_id hits truthy branch', async () => {
    await mountComponent()
    eventHandler({
      payload: {
        update_type: 'doc_open',
        payload: { session_id: 'abc', title: 'X', content: '' }
      }
    })
    await nextTick()
  })

  it('doc_patch with missing revision and section hits fallback branches', async () => {
    await mountComponent()
    eventHandler({
      payload: {
        update_type: 'doc_open',
        payload: { session_id: 's1', title: 'X', content: '' }
      }
    })
    await nextTick()
    busMock.emit.mockClear()

    // No revision or section — both `|| "?"` branches fire
    eventHandler({
      payload: {
        update_type: 'doc_patch',
        payload: { full_content: '# No meta' }
      }
    })
    await nextTick()
    expect(busMock.emit).toHaveBeenCalledWith('file-loaded', { markdown: '# No meta' })
  })

  it('doc_patch with explicit revision and section hits truthy branches', async () => {
    await mountComponent()
    eventHandler({
      payload: {
        update_type: 'doc_open',
        payload: { session_id: 's1', title: 'X', content: '' }
      }
    })
    await nextTick()
    busMock.emit.mockClear()

    eventHandler({
      payload: {
        update_type: 'doc_patch',
        payload: { full_content: '# Meta', revision: 5, section: 'body' }
      }
    })
    await nextTick()
    expect(busMock.emit).toHaveBeenCalledWith('file-loaded', { markdown: '# Meta' })
  })

  it('doc_close with missing session_id and final_revision hits fallback branches', async () => {
    const wrapper = await mountComponent()
    eventHandler({
      payload: {
        update_type: 'doc_open',
        payload: { session_id: 's1', title: 'X', content: '' }
      }
    })
    await nextTick()

    // No session_id or final_revision — both `|| "?"` branches fire
    eventHandler({
      payload: {
        update_type: 'doc_close',
        payload: {}
      }
    })
    await nextTick()
    expect(wrapper.find('.live-indicator').exists()).toBe(false)
  })

  it('doc_close with explicit session_id and final_revision hits truthy branches', async () => {
    const wrapper = await mountComponent()
    eventHandler({
      payload: {
        update_type: 'doc_open',
        payload: { session_id: 's1', title: 'X', content: '' }
      }
    })
    await nextTick()

    eventHandler({
      payload: {
        update_type: 'doc_close',
        payload: { session_id: 's1', final_revision: 10 }
      }
    })
    await nextTick()
    expect(wrapper.find('.live-indicator').exists()).toBe(false)
  })

  // ── Branch coverage: template conditionals ───────────────────

  it('sessionInfo conditionally renders when truthy', async () => {
    const wrapper = await mountComponent()
    eventHandler({
      payload: {
        update_type: 'doc_open',
        payload: { session_id: 's1', title: 'Board Meeting', content: '' }
      }
    })
    await nextTick()
    expect(wrapper.find('.live-session-info').exists()).toBe(true)
  })

  it('sessionInfo not rendered when title is empty string (falsy)', async () => {
    const wrapper = await mountComponent()
    eventHandler({
      payload: {
        update_type: 'doc_open',
        payload: { session_id: 's1', title: '', content: '' }
      }
    })
    await nextTick()
    // title '' is falsy, so sessionTitle.value = 'Meeting' (default)
    expect(wrapper.find('.live-session-info').text()).toContain('Meeting')
  })

  // ── Branch coverage: guard clauses ──────────────────────────

  it('doc_open with content emits correct markdown', async () => {
    await mountComponent()
    // With content
    eventHandler({
      payload: {
        update_type: 'doc_open',
        payload: { session_id: 's1', title: 'X', content: '# Content' }
      }
    })
    await nextTick()
    expect(busMock.emit).toHaveBeenCalledWith('mt::new-untitled-tab', {
      markdown: '# Content',
      selected: true
    })
  })

  // ── Edge: unknown update_type is silently ignored ────────────

  it('unknown update_type is silently ignored', async () => {
    const wrapper = await mountComponent()
    eventHandler({
      payload: {
        update_type: 'unknown_type',
        payload: { something: true }
      }
    })
    await nextTick()
    // No state change — still idle
    expect(wrapper.find('.live-indicator').exists()).toBe(false)
  })
})
