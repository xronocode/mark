import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'

const invokeMock = vi.fn()

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock
}))

vi.mock('codemirror/lib/codemirror.css', () => ({}))
vi.mock('codemirror/addon/merge/merge.css', () => ({}))
vi.mock('codemirror/theme/railscasts.css', () => ({}))

vi.mock('codemirror/addon/merge/merge', () => ({}))

vi.mock('diff-match-patch', () => ({
  default: class DiffMatchPatch {}
}))

vi.mock('@/config', () => ({
  oneDarkThemes: ['one-dark'],
  railscastsThemes: ['railscasts']
}))

vi.mock('@/store/preferences', () => ({
  usePreferencesStore: () => ({
    theme: 'default'
  })
}))

const tab = { diffMode: true }
const notifyMock = vi.fn()
vi.mock('@/store/editor', () => ({ useEditorStore: () => ({ currentFile: tab }) }))
vi.mock('@/i18n', () => ({ t: (key) => key }))
vi.mock('@/util', () => ({ isOsx: true }))
vi.mock('@/services/notification', () => ({ default: { notify: notifyMock } }))

vi.mock('pinia', () => ({
  storeToRefs: (store) => {
    const { ref } = require('vue')
    return { theme: ref(store.theme) }
  }
}))

describe('diffView.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.CodeMirror = null
    tab.diffMode = true
  })

  const mountComponent = async (props = {}) => {
    const mod = await import('@/components/editorWithTabs/diffView.vue')
    const wrapper = mount(mod.default, {
      props: { markdown: '# Hello', pathname: '/test.md', ...props },
      attachTo: document.createElement('div')
    })
    await flushPromises()
    await nextTick()
    return wrapper
  }

  // A failing diff never leaves the user without an editor: it exits diff
  // mode and reports the reason as a notification.
  const expectExitWith = (text) => {
    expect(tab.diffMode).toBe(false)
    expect(notifyMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'warning', message: expect.stringContaining(text) }))
  }

  it('exits with a notice when no pathname is provided', async () => {
    await mountComponent({ pathname: '' })
    expectExitWith('diffView.noPath')
  })

  it('exits with a notice when invoke fails with an Error object', async () => {
    invokeMock.mockRejectedValueOnce(new Error('file not found'))
    await mountComponent()
    expectExitWith('file not found')
  })

  it('exits with a notice when invoke fails with a string', async () => {
    invokeMock.mockRejectedValueOnce('custom error string')
    await mountComponent()
    expectExitWith('custom error string')
  })

  it('exits with a notice when CodeMirror.MergeView is not available', async () => {
    invokeMock.mockResolvedValueOnce('baseline content')
    window.CodeMirror = {}
    await mountComponent()
    expectExitWith('MergeView not available')
  })

  it('the header exit button leaves diff mode', async () => {
    invokeMock.mockResolvedValueOnce('baseline')
    window.CodeMirror = { MergeView: vi.fn(() => ({ editor: () => ({ setValue: vi.fn() }), wrap: document.createElement('div') })) }
    const wrapper = await mountComponent()
    expect(wrapper.find('.diff-exit').text()).toContain('⌘D')
    await wrapper.find('.diff-exit').trigger('click')
    expect(tab.diffMode).toBe(false)
  })

  it('creates MergeView when CodeMirror is available', async () => {
    invokeMock.mockResolvedValueOnce('baseline content')
    const mergeViewMock = vi.fn(() => ({
      editor: () => ({ setValue: vi.fn() }),
      wrap: document.createElement('div')
    }))
    window.CodeMirror = { MergeView: mergeViewMock }
    const wrapper = await mountComponent()
    expect(mergeViewMock).toHaveBeenCalled()
    expect(tab.diffMode).toBe(true)
    expect(notifyMock).not.toHaveBeenCalled()
  })

  it('destroys merge view on unmount', async () => {
    invokeMock.mockResolvedValueOnce('baseline')
    const wrapEl = document.createElement('div')
    const parentEl = document.createElement('div')
    parentEl.appendChild(wrapEl)
    window.CodeMirror = {
      MergeView: vi.fn(() => ({
        editor: () => ({ setValue: vi.fn() }),
        wrap: wrapEl
      }))
    }
    const wrapper = await mountComponent()
    wrapper.unmount()
    expect(wrapEl.parentNode).toBeNull()
  })

  it('updates editor value when markdown prop changes', async () => {
    invokeMock.mockResolvedValueOnce('baseline')
    const setValueMock = vi.fn()
    window.CodeMirror = {
      MergeView: vi.fn(() => ({
        editor: () => ({ setValue: setValueMock }),
        wrap: document.createElement('div')
      }))
    }
    const wrapper = await mountComponent()
    await wrapper.setProps({ markdown: '# Updated' })
    await nextTick()
    expect(setValueMock).toHaveBeenCalledWith('# Updated')
  })
})
