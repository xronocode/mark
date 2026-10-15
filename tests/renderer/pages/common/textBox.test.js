/**
 * Tests for src/renderer/src/prefComponents/common/textBox/index.vue —
 * C-38 T-003 right-aligned field row.
 */

import { mount } from '@vue/test-utils'

const osState = vi.hoisted(() => ({ isOsx: true }))

vi.mock('@/util', () => ({
  isOsx: osState.isOsx,
  isWindows: !osState.isOsx,
  isLinux: false
}))

vi.mock('@element-plus/icons-vue', () => ({
  InfoFilled: { template: '<svg/>' }
}))

import TextBox from '@/prefComponents/common/textBox/index.vue'

describe('prefComponents/common/textBox/index.vue', () => {
  beforeEach(() => {
    osState.isOsx = true
    window.electron.process.platform = 'darwin'
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const mountBox = (props = {}) =>
    mount(TextBox, {
      props: {
        description: 'Image path',
        input: '/images',
        onChange: vi.fn(),
        ...props
      }
    })

  it('mounts as a row with the legacy root class and a text field', () => {
    const wrapper = mountBox()
    expect(wrapper.find('.pref-row.pref-text-box-item').exists()).toBe(true)
    expect(wrapper.find('input.pref-field').exists()).toBe(true)
    wrapper.unmount()
  })

  it('renders the label without a trailing colon', () => {
    const wrapper = mountBox({ description: 'Custom CSS' })
    const text = wrapper.find('.pref-row-label').text()
    expect(text).toBe('Custom CSS')
    expect(text.endsWith(':')).toBe(false)
    wrapper.unmount()
  })

  it('carries the value and the placeholder (default)', () => {
    const wrapper = mountBox({ input: '', defaultValue: 'Unlimited' })
    const field = wrapper.find('input.pref-field')
    expect(field.element.value).toBe('')
    expect(field.attributes('placeholder')).toBe('Unlimited')
    wrapper.unmount()
  })

  it('typing calls onChange after the debounce', () => {
    const onChange = vi.fn()
    const wrapper = mountBox({ onChange })
    wrapper.find('input.pref-field').setValue('720px')
    vi.advanceTimersByTime(900)
    expect(onChange).toHaveBeenCalledWith('720px')
    wrapper.unmount()
  })

  it('marks invalid input against the regex validator', async () => {
    const wrapper = mountBox({ regexValidator: /^[0-9]+$/ })
    await wrapper.find('input.pref-field').setValue('abc')
    expect(wrapper.find('input.pref-field.error').exists()).toBe(true)
    wrapper.unmount()
  })

  it('renders notes as help text when provided', () => {
    const wrapper = mountBox({ notes: 'Use absolute paths' })
    expect(wrapper.find('.pref-row-help').text()).toBe('Use absolute paths')
    wrapper.unmount()
  })

  it('applies ag-underdevelop when disabled', () => {
    const wrapper = mountBox({ disable: true })
    expect(wrapper.find('.ag-underdevelop').exists()).toBe(true)
    wrapper.unmount()
  })

  it('carries the per-OS class', () => {
    osState.isOsx = false
    window.electron.process.platform = 'win32'
    const wrapper = mountBox()
    expect(wrapper.find('.pref-text-box-item.pref-os-win').exists()).toBe(true)
    wrapper.unmount()
  })
})
