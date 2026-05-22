/**
 * Function-coverage tests for src/renderer/src/prefComponents/common/range/index.vue
 *
 * Uncovered functions: watch callback, handleMoreClick, select,
 * ref initializer, setup.
 */

import { shallowMount } from '@vue/test-utils'
import { nextTick } from 'vue'

vi.mock('@/i18n', () => ({ t: (key) => key, setLanguage: vi.fn() }))
vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key) => key }),
  createI18n: vi.fn(() => ({ global: { locale: { value: 'en' } } }))
}))
vi.mock('@element-plus/icons-vue', () => ({
  InfoFilled: { template: '<span />' }
}))

import RangeComponent from '@/prefComponents/common/range/index.vue'

const stubs = {
  'el-slider': { template: '<div></div>', props: ['modelValue', 'min', 'max', 'step'] },
  InfoFilled: true
}

describe('Range (common) – function coverage', () => {
  it('initializes selectValue from value prop', () => {
    const wrapper = shallowMount(RangeComponent, {
      props: { description: 'Font size', value: 14, min: 12, max: 32, step: 1, onChange: vi.fn() },
      global: { stubs }
    })
    expect(wrapper.vm.selectValue).toBe(14)
    wrapper.unmount()
  })

  it('watch updates selectValue when prop changes', async () => {
    const wrapper = shallowMount(RangeComponent, {
      props: { description: 'Font size', value: 14, min: 12, max: 32, step: 1, onChange: vi.fn() },
      global: { stubs }
    })
    await wrapper.setProps({ value: 20 })
    await nextTick()
    expect(wrapper.vm.selectValue).toBe(20)
    wrapper.unmount()
  })

  it('watch does not update when value is same', async () => {
    const wrapper = shallowMount(RangeComponent, {
      props: { description: 'Font size', value: 14, min: 12, max: 32, step: 1, onChange: vi.fn() },
      global: { stubs }
    })
    await wrapper.setProps({ value: 14 })
    await nextTick()
    expect(wrapper.vm.selectValue).toBe(14)
    wrapper.unmount()
  })

  it('select method calls onChange prop', () => {
    const onChange = vi.fn()
    const wrapper = shallowMount(RangeComponent, {
      props: { description: 'Font size', value: 14, min: 12, max: 32, step: 1, onChange },
      global: { stubs }
    })
    wrapper.vm.select(18)
    expect(onChange).toHaveBeenCalledWith(18)
    wrapper.unmount()
  })

  it('handleMoreClick opens external link', () => {
    const wrapper = shallowMount(RangeComponent, {
      props: { description: 'Test', value: 14, min: 12, max: 32, step: 1, onChange: vi.fn(), more: 'https://example.com' },
      global: { stubs }
    })
    wrapper.vm.handleMoreClick()
    expect(window.electron.shell.openExternal).toHaveBeenCalledWith('https://example.com')
    wrapper.unmount()
  })

  it('handleMoreClick does nothing without more prop', () => {
    const wrapper = shallowMount(RangeComponent, {
      props: { description: 'Test', value: 14, min: 12, max: 32, step: 1, onChange: vi.fn() },
      global: { stubs }
    })
    wrapper.vm.handleMoreClick()
    expect(window.electron.shell.openExternal).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})
