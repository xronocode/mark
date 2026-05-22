/**
 * Function-coverage tests for src/renderer/src/prefComponents/common/bool/index.vue
 *
 * Uncovered functions: watch callback, handleMoreClick, handleSwitchChange,
 * plus the setup function itself and ref initializer.
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

import BoolComponent from '@/prefComponents/common/bool/index.vue'

const stubs = {
  'el-switch': { template: '<div @change="$emit(\'change\', true)"></div>', props: ['modelValue'] },
  'el-tooltip': true,
  InfoFilled: true
}

describe('Bool (common) – function coverage', () => {
  it('initializes status ref from bool prop', () => {
    const wrapper = shallowMount(BoolComponent, {
      props: { description: 'Test', bool: true, onChange: vi.fn() },
      global: { stubs }
    })
    expect(wrapper.vm.status).toBe(true)
    wrapper.unmount()
  })

  it('watch callback updates status when bool prop changes', async () => {
    const wrapper = shallowMount(BoolComponent, {
      props: { description: 'Test', bool: false, onChange: vi.fn() },
      global: { stubs }
    })
    expect(wrapper.vm.status).toBe(false)

    await wrapper.setProps({ bool: true })
    await nextTick()
    expect(wrapper.vm.status).toBe(true)
    wrapper.unmount()
  })

  it('watch callback does not update when value is same', async () => {
    const wrapper = shallowMount(BoolComponent, {
      props: { description: 'Test', bool: true, onChange: vi.fn() },
      global: { stubs }
    })
    // Force re-trigger with same value — watch guard should skip
    await wrapper.setProps({ bool: true })
    await nextTick()
    expect(wrapper.vm.status).toBe(true)
    wrapper.unmount()
  })

  it('handleSwitchChange calls onChange prop', () => {
    const onChange = vi.fn()
    const wrapper = shallowMount(BoolComponent, {
      props: { description: 'Test', bool: false, onChange },
      global: { stubs }
    })
    wrapper.vm.handleSwitchChange(true)
    expect(onChange).toHaveBeenCalledWith(true)
    wrapper.unmount()
  })

  it('handleMoreClick opens external link', () => {
    const wrapper = shallowMount(BoolComponent, {
      props: { description: 'Test', bool: false, onChange: vi.fn(), more: 'https://example.com' },
      global: { stubs }
    })
    wrapper.vm.handleMoreClick()
    expect(window.electron.shell.openExternal).toHaveBeenCalledWith('https://example.com')
    wrapper.unmount()
  })

  it('handleMoreClick does nothing when more is not a string', () => {
    const wrapper = shallowMount(BoolComponent, {
      props: { description: 'Test', bool: false, onChange: vi.fn() },
      global: { stubs }
    })
    wrapper.vm.handleMoreClick()
    expect(window.electron.shell.openExternal).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})
