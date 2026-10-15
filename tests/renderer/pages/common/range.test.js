/**
 * Tests for src/renderer/src/prefComponents/common/range/index.vue —
 * C-38 T-003 stepper row (the retired slider).
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

import Range from '@/prefComponents/common/range/index.vue'

describe('prefComponents/common/range/index.vue (stepper)', () => {
  beforeEach(() => {
    osState.isOsx = true
    window.electron.process.platform = 'darwin'
  })

  const mountRange = (props = {}) =>
    mount(Range, {
      props: {
        description: 'Font size',
        value: 14,
        min: 12,
        max: 32,
        step: 1,
        onChange: vi.fn(),
        ...props
      }
    })

  it('mounts as a row with the legacy root class', () => {
    const wrapper = mountRange()
    expect(wrapper.find('.pref-row.pref-range-item').exists()).toBe(true)
    expect(wrapper.find('.pref-stepper').exists()).toBe(true)
    wrapper.unmount()
  })

  it('renders the label without a trailing colon', () => {
    const wrapper = mountRange({ description: 'Line height' })
    const text = wrapper.find('.pref-row-label').text()
    expect(text).toBe('Line height')
    expect(text.endsWith(':')).toBe(false)
    wrapper.unmount()
  })

  it('renders value and unit exactly once (the "14px px" regression)', () => {
    const wrapper = mountRange({ value: 14, unit: 'px' })
    const text = wrapper.find('.pref-value').text()
    expect(text).toBe('14 px')
    // exactly one occurrence of the unit in the whole row
    expect(text.split('px').length - 1).toBe(1)
    wrapper.unmount()
  })

  it('renders the bare value when no unit is given', () => {
    const wrapper = mountRange({ value: 4 })
    expect(wrapper.find('.pref-value').text()).toBe('4')
    wrapper.unmount()
  })

  it('coerces legacy string values ("14px") to numbers', () => {
    const wrapper = mountRange({ value: '14px', unit: 'px' })
    expect(wrapper.find('.pref-value').text()).toBe('14 px')
    wrapper.unmount()
  })

  it('Increase steps up and calls onChange with the number', async () => {
    const onChange = vi.fn()
    const wrapper = mountRange({ value: 14, onChange })
    await wrapper.find('button[aria-label="Increase"]').trigger('click')
    expect(onChange).toHaveBeenCalledWith(15)
    expect(wrapper.find('.pref-value').text()).toBe('15')
    wrapper.unmount()
  })

  it('Decrease steps down', async () => {
    const onChange = vi.fn()
    const wrapper = mountRange({ value: 14, onChange })
    await wrapper.find('button[aria-label="Decrease"]').trigger('click')
    expect(onChange).toHaveBeenCalledWith(13)
    wrapper.unmount()
  })

  it('clamps at min and max (buttons disable, onChange not re-fired)', async () => {
    const onChange = vi.fn()
    const wrapper = mountRange({ value: 32, max: 32, onChange })
    expect(wrapper.find('button[aria-label="Increase"]').attributes('disabled')).toBeDefined()
    await wrapper.find('button[aria-label="Increase"]').trigger('click')
    expect(onChange).not.toHaveBeenCalled()

    await wrapper.setProps({ value: 12, min: 12 })
    expect(wrapper.find('button[aria-label="Decrease"]').attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })

  it('rounds float steps (1.6 + 0.1 stays 1.7, not 1.7000000000000002)', async () => {
    const wrapper = mountRange({ value: 1.6, min: 1.2, max: 2, step: 0.1 })
    await wrapper.find('button[aria-label="Increase"]').trigger('click')
    expect(wrapper.find('.pref-value').text()).toBe('1.7')
    wrapper.unmount()
  })

  it('does not step when disabled', async () => {
    const onChange = vi.fn()
    const wrapper = mountRange({ value: 14, onChange, disable: true })
    await wrapper.find('button[aria-label="Increase"]').trigger('click')
    expect(onChange).not.toHaveBeenCalled()
    expect(wrapper.find('.ag-underdevelop').exists()).toBe(true)
    wrapper.unmount()
  })

  it('carries the per-OS class', () => {
    osState.isOsx = false
    window.electron.process.platform = 'win32'
    const wrapper = mountRange()
    expect(wrapper.find('.pref-range-item.pref-os-win').exists()).toBe(true)
    wrapper.unmount()
  })
})
