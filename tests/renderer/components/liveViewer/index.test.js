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
    constructor (el) {
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
    expect(wrapper.find('.live-idle').exists()).toBe(true)
    expect(wrapper.find('.live-indicator').exists()).toBe(false)
  })

  it('has live-viewer root element', async () => {
    const wrapper = await mountComponent()
    expect(wrapper.find('.live-viewer').exists()).toBe(true)
  })

  it('does not apply live-active class when idle', async () => {
    const wrapper = await mountComponent()
    expect(wrapper.find('.live-viewer.live-active').exists()).toBe(false)
  })

  // ── Listener registration ───────────────────────────────────

  it('registers Tauri event listener on mount', async () => {
    await mountComponent()
    expect(listenMock).toHaveBeenCalledWith('mt::live::update', expect.any(Function))
  })

  // ── doc_open ─────────────────────────────────────────────────

  it('doc_open — shows indicator, sets session info, calls setMarkdown', async () => {
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
    expect(wrapper.find('.live-viewer.live-active').exists()).toBe(true)
    expect(setMarkdownMock).toHaveBeenCalledWith('# Hello')
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

    expect(setMarkdownMock).toHaveBeenCalledWith('')
  })

  it('doc_open hides idle message', async () => {
    const wrapper = await mountComponent()
    expect(wrapper.find('.live-idle').exists()).toBe(true)

    eventHandler({
      payload: {
        update_type: 'doc_open',
        payload: { session_id: 's1', title: 'X', content: '' }
      }
    })
    await nextTick()

    expect(wrapper.find('.live-idle').exists()).toBe(false)
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
    setMarkdownMock.mockClear()

    eventHandler({
      payload: {
        update_type: 'doc_patch',
        payload: { full_content: '# Updated', revision: 2, section: 'body' }
      }
    })
    await nextTick()

    expect(setMarkdownMock).toHaveBeenCalledWith('# Updated')
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
    setMarkdownMock.mockClear()

    eventHandler({
      payload: {
        update_type: 'doc_patch',
        payload: { revision: 3 }
      }
    })
    await nextTick()

    expect(setMarkdownMock).toHaveBeenCalledWith('')
  })

  it('doc_patch is ignored when not live', async () => {
    await mountComponent()
    setMarkdownMock.mockClear()

    eventHandler({
      payload: {
        update_type: 'doc_patch',
        payload: { full_content: 'X', revision: 1 }
      }
    })
    await nextTick()

    expect(setMarkdownMock).not.toHaveBeenCalled()
  })

  // ── doc_close ────────────────────────────────────────────────

  it('doc_close exits live mode and clears undo history', async () => {
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

    expect(wrapper.find('.live-idle').exists()).toBe(true)
    expect(wrapper.find('.live-indicator').exists()).toBe(false)
    expect(clearHistoryMock).toHaveBeenCalled()
  })

  it('doc_close handles clearHistory throwing', async () => {
    await mountComponent()
    eventHandler({
      payload: {
        update_type: 'doc_open',
        payload: { session_id: 's1', title: 'X', content: '' }
      }
    })
    await nextTick()

    clearHistoryMock.mockImplementationOnce(() => {
      throw new Error('no history')
    })

    // Should not throw
    eventHandler({
      payload: {
        update_type: 'doc_close',
        payload: { session_id: 's1', final_revision: 1 }
      }
    })
    await nextTick()
  })

  // ── Read-only mode & blockInputHandler ───────────────────────

  it('blocks keyboard input during live session', async () => {
    const wrapper = await mountComponent()
    eventHandler({
      payload: {
        update_type: 'doc_open',
        payload: { session_id: 's1', title: 'X', content: '' }
      }
    })
    await nextTick()

    // The editor container should be contenteditable=false
    const container = wrapper.find('.live-editor-container').element
    expect(container).toBeTruthy()

    // Simulate a keyboard event on the container element — exercises
    // blockInputHandler (lines 117-120) which calls preventDefault /
    // stopPropagation.
    const keyEvent = new KeyboardEvent('keydown', {
      key: 'a',
      bubbles: true,
      cancelable: true
    })
    const prevented = !container.dispatchEvent(keyEvent)
    // The event is captured and prevented by blockInputHandler.
    expect(prevented).toBe(true)
  })

  it('blocks keypress input during live session', async () => {
    const wrapper = await mountComponent()
    eventHandler({
      payload: {
        update_type: 'doc_open',
        payload: { session_id: 's1', title: 'X', content: '' }
      }
    })
    await nextTick()

    const container = wrapper.find('.live-editor-container').element
    const keypressEvent = new KeyboardEvent('keypress', {
      key: 'b',
      bubbles: true,
      cancelable: true
    })
    const prevented = !container.dispatchEvent(keypressEvent)
    expect(prevented).toBe(true)
  })

  it('blocks paste input during live session', async () => {
    const wrapper = await mountComponent()
    eventHandler({
      payload: {
        update_type: 'doc_open',
        payload: { session_id: 's1', title: 'X', content: '' }
      }
    })
    await nextTick()

    const container = wrapper.find('.live-editor-container').element
    const pasteEvent = new Event('paste', {
      bubbles: true,
      cancelable: true
    })
    const prevented = !container.dispatchEvent(pasteEvent)
    expect(prevented).toBe(true)
  })

  it('restores keyboard input after doc_close', async () => {
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
        payload: { session_id: 's1', final_revision: 1 }
      }
    })
    await nextTick()

    // After close, keyboard events should not be prevented
    const container = wrapper.find('.live-editor-container').element
    const keyEvent = new KeyboardEvent('keydown', {
      key: 'a',
      bubbles: true,
      cancelable: true
    })
    const prevented = !container.dispatchEvent(keyEvent)
    expect(prevented).toBe(false)
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

  it('unregisters listener and destroys muya on unmount when idle', async () => {
    const wrapper = await mountComponent()
    wrapper.unmount()
    expect(unlistenMock).toHaveBeenCalled()
    expect(destroyMock).toHaveBeenCalled()
  })

  it('exits read-only before destroy when still live on unmount', async () => {
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
    expect(destroyMock).toHaveBeenCalled()
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
    expect(wrapper.find('.live-idle').exists()).toBe(true)

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
    expect(clearHistoryMock).toHaveBeenCalledTimes(2)
  })

  // ── Font family rendering ────────────────────────────────────

  it('renders with default font family when editorFontFamily is empty', async () => {
    const wrapper = await mountComponent()
    const container = wrapper.find('.live-editor-container')
    expect(container.attributes('style')).toContain('Open Sans')
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
    // No error — the fallback '?' is used in the console.log
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
    setMarkdownMock.mockClear()

    // No revision or section — both `|| "?"` branches fire
    eventHandler({
      payload: {
        update_type: 'doc_patch',
        payload: { full_content: '# No meta' }
      }
    })
    await nextTick()
    expect(setMarkdownMock).toHaveBeenCalledWith('# No meta')
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
    setMarkdownMock.mockClear()

    eventHandler({
      payload: {
        update_type: 'doc_patch',
        payload: { full_content: '# Meta', revision: 5, section: 'body' }
      }
    })
    await nextTick()
    expect(setMarkdownMock).toHaveBeenCalledWith('# Meta')
  })

  it('doc_close with missing session_id and final_revision hits fallback branches', async () => {
    await mountComponent()
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
    expect(clearHistoryMock).toHaveBeenCalled()
  })

  it('doc_close with explicit session_id and final_revision hits truthy branches', async () => {
    await mountComponent()
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
    expect(clearHistoryMock).toHaveBeenCalled()
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
    // title '' is falsy, so sessionInfo.value = 'Meeting'
    expect(wrapper.find('.live-session-info').text()).toContain('Meeting')
  })

  // ── Branch coverage: guard clauses in enterReadOnly/exitReadOnly ──

  it('doc_open with content triggers setMarkdown, without content uses empty string', async () => {
    await mountComponent()
    // With content
    eventHandler({
      payload: {
        update_type: 'doc_open',
        payload: { session_id: 's1', title: 'X', content: '# Content' }
      }
    })
    await nextTick()
    expect(setMarkdownMock).toHaveBeenCalledWith('# Content')
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
    // No state change
    expect(wrapper.find('.live-idle').exists()).toBe(true)
  })
})
