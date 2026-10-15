/**
 * Tests for src/renderer/src/prefComponents/common/bool/index.vue —
 * C-38 T-003 switch row anatomy.
 */

import { mount } from '@vue/test-utils'
import Bool from '@/prefComponents/common/bool/index.vue'

const osState = vi.hoisted(() => ({ isOsx: true }))

vi.mock('@/util', () => ({
  isOsx: osState.isOsx,
  isWindows: !osState.isOsx,
  isLinux: false
}))

vi.mock('@element-plus/icons-vue', () => ({
  InfoFilled: { template: '<svg/>' }
}))

describe('prefComponents/common/bool/index.vue', () => {
  beforeEach(() => {
    osState.isOsx = true
    window.electron.process.platform = 'darwin'
  })

  const mountBool = (props = {}) =>
    mount(Bool, {
      props: {
        description: 'Enable feature',
        bool: true,
        onChange: vi.fn(),
        ...props
      }
    })

  it('mounts as a row with the legacy root class', () => {
    const wrapper = mountBool()
    expect(wrapper.find('.pref-row.pref-switch-item').exists()).toBe(true)
    wrapper.unmount()
  })

  it('renders the label without a trailing colon', () => {
    const wrapper = mountBool({ description: 'Auto save' })
    const text = wrapper.find('.pref-row-label').text()
    expect(text).toBe('Auto save')
    expect(text.endsWith(':')).toBe(false)
    wrapper.unmount()
  })

  it('renders help as secondary text (help prop wins over legacy notes)', () => {
    const wrapper = mountBool({ help: 'Saves for you', notes: 'legacy note' })
    expect(wrapper.find('.pref-row-help').text()).toBe('Saves for you')
    wrapper.unmount()
  })

  it('falls back to legacy detailedDescription as help', () => {
    const wrapper = mountBool({ detailedDescription: 'tooltip text' })
    expect(wrapper.find('.pref-row-help').text()).toBe('tooltip text')
    wrapper.unmount()
  })

  it('renders no help line when no help-ish prop is given', () => {
    const wrapper = mountBool()
    expect(wrapper.find('.pref-row-help').exists()).toBe(false)
    wrapper.unmount()
  })

  it('renders a role=switch button reflecting the bool prop', () => {
    const wrapper = mountBool({ bool: true })
    const sw = wrapper.find('button[role="switch"]')
    expect(sw.exists()).toBe(true)
    expect(sw.attributes('aria-checked')).toBe('true')
    wrapper.unmount()
  })

  it('clicking toggles the state and calls onChange with the new value', async () => {
    const onChange = vi.fn()
    const wrapper = mountBool({ bool: false, onChange })
    await wrapper.find('button[role="switch"]').trigger('click')
    expect(onChange).toHaveBeenCalledWith(true)
    expect(wrapper.find('button[role="switch"]').attributes('aria-checked')).toBe('true')
    wrapper.unmount()
  })

  it('clicking is a no-op when disabled', async () => {
    const onChange = vi.fn()
    const wrapper = mountBool({ bool: false, onChange, disable: true })
    await wrapper.find('button[role="switch"]').trigger('click')
    expect(onChange).not.toHaveBeenCalled()
    expect(wrapper.find('.ag-underdevelop').exists()).toBe(true)
    wrapper.unmount()
  })

  it('carries the macOS per-OS class when isOsx', () => {
    osState.isOsx = true
    window.electron.process.platform = 'darwin'
    const wrapper = mountBool()
    expect(wrapper.find('.pref-switch-item.pref-os-mac').exists()).toBe(true)
    wrapper.unmount()
  })

  it('carries the Windows per-OS class when not isOsx', () => {
    osState.isOsx = false
    window.electron.process.platform = 'win32'
    const wrapper = mountBool()
    expect(wrapper.find('.pref-switch-item.pref-os-win').exists()).toBe(true)
    wrapper.unmount()
  })
})
