/**
 * Tests for src/renderer/src/prefComponents/common/fontTextBox/index.vue —
 * C-38 T-003 font-chooser row.
 */

import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'

const osState = vi.hoisted(() => ({ isOsx: true }))

vi.mock('@/util', () => ({
  isOsx: osState.isOsx,
  isWindows: !osState.isOsx,
  isLinux: false
}))

vi.mock('@element-plus/icons-vue', () => ({
  InfoFilled: { template: '<svg/>' },
  ArrowDown: { template: '<svg/>' }
}))

import FontTextBox from '@/prefComponents/common/fontTextBox/index.vue'

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: {} } })

const stubs = {
  ElAutocomplete: {
    // Minimal autocomplete stand-in: renders an input wired to v-model.
    template:
      '<input class="font-autocomplete-stub" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" @change="$emit(\'select\', $event.target.value)" />',
    props: ['modelValue', 'placeholder', 'disabled'],
    emits: ['update:modelValue', 'select']
  },
  InfoFilled: true,
  ArrowDown: true
}

describe('prefComponents/common/fontTextBox/index.vue', () => {
  beforeEach(() => {
    osState.isOsx = true
    window.electron.process.platform = 'darwin'
  })

  const mountFont = (props = {}) =>
    mount(FontTextBox, {
      props: {
        description: 'Font family',
        value: 'Arial',
        onChange: vi.fn(),
        ...props
      },
      global: { plugins: [i18n], stubs }
    })

  it('mounts as a row with the legacy root class', () => {
    const wrapper = mountFont()
    expect(wrapper.find('.pref-row.pref-font-input-item').exists()).toBe(true)
    wrapper.unmount()
  })

  it('renders the label without a trailing colon', () => {
    const wrapper = mountFont({ description: 'Editor Font' })
    const text = wrapper.find('.pref-row-label').text()
    expect(text).toBe('Editor Font')
    expect(text.endsWith(':')).toBe(false)
    wrapper.unmount()
  })

  it('shows the current family in the autocomplete field', () => {
    const wrapper = mountFont({ value: 'Menlo' })
    expect(wrapper.find('input.font-autocomplete-stub').element.value).toBe('Menlo')
    wrapper.unmount()
  })

  it('selecting a valid family calls onChange', async () => {
    const onChange = vi.fn()
    const wrapper = mountFont({ onChange })
    await wrapper.find('input.font-autocomplete-stub').setValue('Helvetica Neue')
    await wrapper.find('input.font-autocomplete-stub').trigger('change')
    expect(onChange).toHaveBeenCalledWith('Helvetica Neue')
    wrapper.unmount()
  })

  it('renders help/notes as secondary text', () => {
    const wrapper = mountFont({ notes: 'System fonts only' })
    expect(wrapper.find('.pref-row-help').text()).toBe('System fonts only')
    wrapper.unmount()
  })

  it('applies ag-underdevelop class when disabled', () => {
    const wrapper = mountFont({ disable: true })
    expect(wrapper.find('.ag-underdevelop').exists()).toBe(true)
    wrapper.unmount()
  })

  it('carries the per-OS class', () => {
    osState.isOsx = false
    window.electron.process.platform = 'win32'
    const wrapper = mountFont()
    expect(wrapper.find('.pref-font-input-item.pref-os-win').exists()).toBe(true)
    wrapper.unmount()
  })
})
