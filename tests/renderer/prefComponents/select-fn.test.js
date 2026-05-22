/**
 * Function-coverage tests for src/renderer/src/prefComponents/common/select/index.vue
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

import SelectComponent from '@/prefComponents/common/select/index.vue'

const stubs = {
  'el-select': { template: '<div><slot/></div>', props: ['modelValue', 'disabled'] },
  'el-option': true,
  InfoFilled: true
}

const options = [
  { label: 'A', value: 'a' },
  { label: 'B', value: 'b' }
]

describe('Select (common) – function coverage', () => {
  it('initializes selectValue from value prop', () => {
    const wrapper = shallowMount(SelectComponent, {
      props: { value: 'a', options, onChange: vi.fn() },
      global: { stubs }
    })
    expect(wrapper.vm.selectValue).toBe('a')
    wrapper.unmount()
  })

  it('watch updates selectValue when prop changes', async () => {
    const wrapper = shallowMount(SelectComponent, {
      props: { value: 'a', options, onChange: vi.fn() },
      global: { stubs }
    })
    await wrapper.setProps({ value: 'b' })
    await nextTick()
    expect(wrapper.vm.selectValue).toBe('b')
    wrapper.unmount()
  })

  it('watch does not update when value is same', async () => {
    const wrapper = shallowMount(SelectComponent, {
      props: { value: 'a', options, onChange: vi.fn() },
      global: { stubs }
    })
    await wrapper.setProps({ value: 'a' })
    await nextTick()
    expect(wrapper.vm.selectValue).toBe('a')
    wrapper.unmount()
  })

  it('select method calls onChange prop', () => {
    const onChange = vi.fn()
    const wrapper = shallowMount(SelectComponent, {
      props: { value: 'a', options, onChange },
      global: { stubs }
    })
    wrapper.vm.select('b')
    expect(onChange).toHaveBeenCalledWith('b')
    wrapper.unmount()
  })

  it('handleMoreClick opens external link', () => {
    const wrapper = shallowMount(SelectComponent, {
      props: { value: 'a', options, onChange: vi.fn(), more: 'https://example.com' },
      global: { stubs }
    })
    wrapper.vm.handleMoreClick()
    expect(window.electron.shell.openExternal).toHaveBeenCalledWith('https://example.com')
    wrapper.unmount()
  })

  it('handleMoreClick does nothing when more is undefined', () => {
    const wrapper = shallowMount(SelectComponent, {
      props: { value: 'a', options, onChange: vi.fn() },
      global: { stubs }
    })
    wrapper.vm.handleMoreClick()
    expect(window.electron.shell.openExternal).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})
