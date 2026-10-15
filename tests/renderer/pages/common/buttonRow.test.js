/**
 * Tests for src/renderer/src/prefComponents/common/buttonRow/index.vue —
 * the C-38 T-003 push-button row (new control for T-004 action rows).
 */

import { mount } from '@vue/test-utils'

const osState = vi.hoisted(() => ({ isOsx: true }))

vi.mock('@/util', () => ({
  isOsx: osState.isOsx,
  isWindows: !osState.isOsx,
  isLinux: false
}))

import ButtonRow from '@/prefComponents/common/buttonRow/index.vue'

describe('prefComponents/common/buttonRow/index.vue', () => {
  beforeEach(() => {
    osState.isOsx = true
    window.electron.process.platform = 'darwin'
  })

  const mountRow = (props = {}) =>
    mount(ButtonRow, {
      props: {
        description: 'Keyboard shortcuts',
        value: 'Edit…',
        onClick: vi.fn(),
        ...props
      }
    })

  it('renders a row with a labelled push button', () => {
    const wrapper = mountRow()
    expect(wrapper.find('.pref-row.pref-button-item').exists()).toBe(true)
    expect(wrapper.find('button.pref-button').text()).toBe('Edit…')
    wrapper.unmount()
  })

  it('renders the label without a trailing colon and help when given', () => {
    const wrapper = mountRow({ description: 'Custom CSS', help: 'Applies on top of the theme.' })
    expect(wrapper.find('.pref-row-label').text()).toBe('Custom CSS')
    expect(wrapper.find('.pref-row-label').text().endsWith(':')).toBe(false)
    expect(wrapper.find('.pref-row-help').text()).toBe('Applies on top of the theme.')
    wrapper.unmount()
  })

  it('clicking invokes the onClick prop', async () => {
    const onClick = vi.fn()
    const wrapper = mountRow({ onClick })
    await wrapper.find('button.pref-button').trigger('click')
    expect(onClick).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('does not invoke onClick when disabled', async () => {
    const onClick = vi.fn()
    const wrapper = mountRow({ onClick, disable: true })
    await wrapper.find('button.pref-button').trigger('click')
    expect(onClick).not.toHaveBeenCalled()
    expect(wrapper.find('.ag-underdevelop').exists()).toBe(true)
    wrapper.unmount()
  })

  it('the danger variant carries the destructive class', () => {
    const wrapper = mountRow({ danger: true, value: 'Restore…' })
    expect(wrapper.find('.pref-button-item--danger').exists()).toBe(true)
    expect(wrapper.find('button.pref-button').text()).toBe('Restore…')
    wrapper.unmount()
  })

  it('carries the per-OS class', () => {
    osState.isOsx = false
    window.electron.process.platform = 'win32'
    const wrapper = mountRow()
    expect(wrapper.find('.pref-button-item.pref-os-win').exists()).toBe(true)
    wrapper.unmount()
  })
})
