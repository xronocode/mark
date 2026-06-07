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

  it('shows error when no pathname provided', async () => {
    const wrapper = await mountComponent({ pathname: '' })
    expect(wrapper.find('.diff-error').text()).toContain('No file path')
  })

  it('shows error when invoke fails with Error object', async () => {
    invokeMock.mockRejectedValueOnce(new Error('file not found'))
    const wrapper = await mountComponent()
    expect(wrapper.find('.diff-error').text()).toContain('file not found')
  })

  it('shows error when invoke fails with string', async () => {
    invokeMock.mockRejectedValueOnce('custom error string')
    const wrapper = await mountComponent()
    expect(wrapper.find('.diff-error').text()).toContain('custom error string')
  })

  it('shows error when CodeMirror.MergeView not available', async () => {
    invokeMock.mockResolvedValueOnce('baseline content')
    window.CodeMirror = {}
    const wrapper = await mountComponent()
    expect(wrapper.find('.diff-error').text()).toContain('MergeView not available')
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
    expect(wrapper.find('.diff-error').exists()).toBe(false)
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
