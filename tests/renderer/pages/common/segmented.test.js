/**
 * Tests for src/renderer/src/prefComponents/common/segmented/index.vue —
 * the C-38 T-003 segmented control row (new control for T-004 rows).
 */

import { mount } from '@vue/test-utils'

const osState = vi.hoisted(() => ({ isOsx: true }))

vi.mock('@/util', () => ({
  isOsx: osState.isOsx,
  isWindows: !osState.isOsx,
  isLinux: false
}))

import Segmented from '@/prefComponents/common/segmented/index.vue'

const options = [
  { label: 'Auto', value: 'auto' },
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' }
]

describe('prefComponents/common/segmented/index.vue', () => {
  beforeEach(() => {
    osState.isOsx = true
    window.electron.process.platform = 'darwin'
  })

  const mountSegmented = (props = {}) =>
    mount(Segmented, {
      props: {
        description: 'Appearance',
        value: 'auto',
        options,
        onChange: vi.fn(),
        ...props
      }
    })

  it('renders a radiogroup with one radio per option', () => {
    const wrapper = mountSegmented()
    expect(wrapper.find('.pref-row.pref-segmented-item').exists()).toBe(true)
    expect(wrapper.find('[role="radiogroup"]').exists()).toBe(true)
    expect(wrapper.findAll('[role="radio"]')).toHaveLength(3)
    wrapper.unmount()
  })

  it('renders the label without a trailing colon and help when given', () => {
    const wrapper = mountSegmented({ description: 'Appearance', help: 'Auto follows your Mac' })
    expect(wrapper.find('.pref-row-label').text()).toBe('Appearance')
    expect(wrapper.find('.pref-row-label').text().endsWith(':')).toBe(false)
    expect(wrapper.find('.pref-row-help').text()).toBe('Auto follows your Mac')
    wrapper.unmount()
  })

  it('marks the active segment (aria-checked)', () => {
    const wrapper = mountSegmented({ value: 'dark' })
    const active = wrapper.find('[role="radio"][aria-checked="true"]')
    expect(active.text()).toBe('Dark')
    expect(active.classes()).toContain('is-active')
    wrapper.unmount()
  })

  it('clicking a segment calls onChange with its value', async () => {
    const onChange = vi.fn()
    const wrapper = mountSegmented({ onChange })
    const segments = wrapper.findAll('[role="radio"]')
    await segments[1].trigger('click')
    expect(onChange).toHaveBeenCalledWith('light')
    wrapper.unmount()
  })

  it('re-picking the active segment is a no-op', async () => {
    const onChange = vi.fn()
    const wrapper = mountSegmented({ value: 'auto', onChange })
    await wrapper.findAll('[role="radio"]')[0].trigger('click')
    expect(onChange).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('does not fire when disabled', async () => {
    const onChange = vi.fn()
    const wrapper = mountSegmented({ onChange, disable: true })
    await wrapper.findAll('[role="radio"]')[1].trigger('click')
    expect(onChange).not.toHaveBeenCalled()
    expect(wrapper.find('.ag-underdevelop').exists()).toBe(true)
    wrapper.unmount()
  })

  it('mirrors external value changes through the watcher', async () => {
    const wrapper = mountSegmented({ value: 'auto' })
    await wrapper.setProps({ value: 'light' })
    expect(wrapper.find('[role="radio"][aria-checked="true"]').text()).toBe('Light')
    wrapper.unmount()
  })

  it('carries the per-OS class', () => {
    osState.isOsx = false
    window.electron.process.platform = 'win32'
    const wrapper = mountSegmented()
    expect(wrapper.find('.pref-segmented-item.pref-os-win').exists()).toBe(true)
    wrapper.unmount()
  })
})
