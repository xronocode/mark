/**
 * Tests for src/renderer/src/prefComponents/common/select/index.vue —
 * C-38 T-003 pop-up row (native select).
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

import Select from '@/prefComponents/common/select/index.vue'

const options = [
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' }
]

describe('prefComponents/common/select/index.vue', () => {
  beforeEach(() => {
    osState.isOsx = true
    window.electron.process.platform = 'darwin'
  })

  const mountSelect = (props = {}) =>
    mount(Select, {
      props: {
        description: 'Theme',
        value: 'light',
        options,
        onChange: vi.fn(),
        ...props
      }
    })

  it('mounts as a row with the legacy root class and a native popup', () => {
    const wrapper = mountSelect()
    expect(wrapper.find('.pref-row.pref-select-item').exists()).toBe(true)
    expect(wrapper.find('select.pref-popup').exists()).toBe(true)
    expect(wrapper.findAll('option')).toHaveLength(2)
    wrapper.unmount()
  })

  it('renders the label without a trailing colon', () => {
    const wrapper = mountSelect({ description: 'Language' })
    const text = wrapper.find('.pref-row-label').text()
    expect(text).toBe('Language')
    expect(text.endsWith(':')).toBe(false)
    wrapper.unmount()
  })

  it('shows the current value as the selected option', () => {
    const wrapper = mountSelect({ value: 'dark' })
    expect(wrapper.find('select.pref-popup').element.value).toBe('dark')
    wrapper.unmount()
  })

  it('changing the select calls onChange with the picked value', async () => {
    const onChange = vi.fn()
    const wrapper = mountSelect({ onChange })
    await wrapper.find('select.pref-popup').setValue('dark')
    expect(onChange).toHaveBeenCalledWith('dark')
    wrapper.unmount()
  })

  it('renders notes as help text when provided', () => {
    const wrapper = mountSelect({ notes: 'Restart required' })
    expect(wrapper.find('.pref-row-help').text()).toBe('Restart required')
    wrapper.unmount()
  })

  it('renders help (prop) with priority over notes', () => {
    const wrapper = mountSelect({ help: 'Help wins', notes: 'legacy' })
    expect(wrapper.find('.pref-row-help').text()).toBe('Help wins')
    wrapper.unmount()
  })

  it('applies ag-underdevelop and disables the popup when disabled', () => {
    const wrapper = mountSelect({ disable: true })
    expect(wrapper.find('.ag-underdevelop').exists()).toBe(true)
    expect(wrapper.find('select.pref-popup').attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })

  it('carries the per-OS class', () => {
    osState.isOsx = false
    window.electron.process.platform = 'win32'
    const wrapper = mountSelect()
    expect(wrapper.find('.pref-select-item.pref-os-win').exists()).toBe(true)
    wrapper.unmount()
  })
})
