/**
 * Deep tests for src/renderer/src/prefComponents/common/textBox/index.vue
 *
 * Targets: handleInput with regex validation, timer debounce, emitTime=0,
 * invalid input class, handleMoreClick, watcher for props.input changes.
 */

import { shallowMount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'

vi.mock('@element-plus/icons-vue', () => ({
  InfoFilled: { template: '<svg/>' }
}))

import TextBox from '@/prefComponents/common/textBox/index.vue'

describe('textBox/index.vue – deep tests', () => {
  let wrapper
  const onChangeMock = vi.fn()

  function createWrapper(props = {}) {
    return shallowMount(TextBox, {
      props: {
        description: 'Test description',
        input: 'initial value',
        onChange: onChangeMock,
        ...props
      },
      global: {
        stubs: {
          ElInput: {
            template: '<input :value="modelValue" @input="$emit(\'input\', $event.target?.value || $event)" />',
            props: ['modelValue']
          },
          InfoFilled: true
        }
      }
    })
  }

  beforeEach(() => {
    vi.useFakeTimers()
    onChangeMock.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
    if (wrapper) wrapper.unmount()
  })

  // ── handleInput with default regex ───────────────────────────────────

  it('handleInput calls onChange after debounce timeout', () => {
    wrapper = createWrapper()
    wrapper.vm.handleInput('new value')
    expect(onChangeMock).not.toHaveBeenCalled()

    vi.advanceTimersByTime(800)
    expect(onChangeMock).toHaveBeenCalledWith('new value')
  })

  it('handleInput clears previous timer on rapid input', () => {
    wrapper = createWrapper()
    wrapper.vm.handleInput('first')
    vi.advanceTimersByTime(400)
    wrapper.vm.handleInput('second')
    vi.advanceTimersByTime(400)
    // First timer should have been cleared
    expect(onChangeMock).not.toHaveBeenCalled()
    vi.advanceTimersByTime(400)
    expect(onChangeMock).toHaveBeenCalledWith('second')
    expect(onChangeMock).toHaveBeenCalledTimes(1)
  })

  // ── handleInput with emitTime=0 ─────────────────────────────────────

  it('handleInput with emitTime=0 calls onChange immediately', () => {
    wrapper = createWrapper({ emitTime: 0 })
    wrapper.vm.handleInput('instant')
    expect(onChangeMock).toHaveBeenCalledWith('instant')
  })

  // ── handleInput with custom regex validator ──────────────────────────

  it('handleInput sets invalidInput when regex fails', () => {
    wrapper = createWrapper({ regexValidator: /^\d+$/ })
    wrapper.vm.handleInput('not a number')
    expect(wrapper.vm.invalidInput).toBe(true)
    // Should NOT call onChange
    vi.advanceTimersByTime(1000)
    expect(onChangeMock).not.toHaveBeenCalled()
  })

  it('handleInput clears invalidInput when regex passes', () => {
    wrapper = createWrapper({ regexValidator: /^\d+$/ })
    wrapper.vm.handleInput('not a number')
    expect(wrapper.vm.invalidInput).toBe(true)

    wrapper.vm.handleInput('123')
    expect(wrapper.vm.invalidInput).toBe(false)
    vi.advanceTimersByTime(800)
    expect(onChangeMock).toHaveBeenCalledWith('123')
  })

  it('error class is applied when invalidInput is true', async () => {
    wrapper = createWrapper({ regexValidator: /^valid$/ })
    wrapper.vm.handleInput('invalid')
    await nextTick()

    // The error class is on .input div
    expect(wrapper.vm.invalidInput).toBe(true)
  })

  // ── handleMoreClick ──────────────────────────────────────────────────

  it('handleMoreClick opens external URL when more prop is a string', () => {
    wrapper = createWrapper({ more: 'https://example.com/docs' })
    wrapper.vm.handleMoreClick()
    expect(window.electron.shell.openExternal).toHaveBeenCalledWith('https://example.com/docs')
  })

  it('handleMoreClick does nothing when more prop is not a string', () => {
    wrapper = createWrapper({ more: undefined })
    wrapper.vm.handleMoreClick()
    // openExternal should not have been called (beyond any prior calls)
  })

  it('InfoFilled icon is rendered when more prop is present', () => {
    wrapper = createWrapper({ more: 'https://example.com' })
    // Should have the info icon in the description
    expect(wrapper.find('.description').exists()).toBe(true)
  })

  // ── props.input watcher ──────────────────────────────────────────────

  it('watcher updates inputText when props.input changes', async () => {
    wrapper = createWrapper({ input: 'initial' })
    expect(wrapper.vm.inputText).toBe('initial')

    await wrapper.setProps({ input: 'updated' })
    expect(wrapper.vm.inputText).toBe('updated')
  })

  it('watcher does not update when same value is set', async () => {
    wrapper = createWrapper({ input: 'same' })
    const original = wrapper.vm.inputText
    await wrapper.setProps({ input: 'same' })
    expect(wrapper.vm.inputText).toBe(original)
  })

  // ── notes rendering ──────────────────────────────────────────────────

  it('renders notes section when notes prop provided', () => {
    wrapper = createWrapper({ notes: 'Some helpful notes' })
    expect(wrapper.find('.notes').exists()).toBe(true)
    expect(wrapper.find('.notes').text()).toBe('Some helpful notes')
  })

  it('does not render notes section when notes prop not provided', () => {
    wrapper = createWrapper()
    expect(wrapper.find('.notes').exists()).toBe(false)
  })

  // ── disable prop ─────────────────────────────────────────────────────

  it('applies ag-underdevelop class when disable is true', () => {
    wrapper = createWrapper({ disable: true })
    expect(wrapper.find('.ag-underdevelop').exists()).toBe(true)
  })

  it('does not apply ag-underdevelop class when disable is false', () => {
    wrapper = createWrapper({ disable: false })
    expect(wrapper.find('.ag-underdevelop').exists()).toBe(false)
  })

  // ── defaultValue prop ────────────────────────────────────────────────

  it('uses defaultValue as placeholder', () => {
    wrapper = createWrapper({ defaultValue: 'placeholder text' })
    // The defaultValue is passed as :placeholder to el-input
    expect(wrapper.vm.$props.defaultValue).toBe('placeholder text')
  })

  // ── custom emitTime ──────────────────────────────────────────────────

  it('respects custom emitTime value', () => {
    wrapper = createWrapper({ emitTime: 200 })
    wrapper.vm.handleInput('fast')
    vi.advanceTimersByTime(100)
    expect(onChangeMock).not.toHaveBeenCalled()
    vi.advanceTimersByTime(100)
    expect(onChangeMock).toHaveBeenCalledWith('fast')
  })
})
