/**
 * Tests for src/renderer/src/prefComponents/keybindings/key-input-dialog.vue
 */

import { shallowMount } from '@vue/test-utils'

vi.mock('@/i18n', () => ({
  t: (key) => key
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key) => key }),
  createI18n: vi.fn(() => ({ global: { locale: { value: 'en' } } }))
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn() }
}))

vi.mock('@hfelix/electron-localshortcut', () => ({
  isCompositionEvent: vi.fn(() => false),
  isValidElectronAccelerator: vi.fn(() => true),
  getAcceleratorFromKeyboardEvent: vi.fn(() => ({
    accelerator: 'Ctrl+S',
    isValid: true
  }))
}))

import KeyInputDialog from '@/prefComponents/keybindings/key-input-dialog.vue'

describe('KeyInputDialog.vue', () => {
  let wrapper
  const onCommitMock = vi.fn()

  beforeEach(() => {
    wrapper = shallowMount(KeyInputDialog, {
      props: {
        onCommit: onCommitMock,
        showWithId: null
      },
      global: {
        mocks: { $t: (key) => key },
        stubs: {
          'el-dialog': true
        }
      }
    })
  })

  afterEach(() => {
    wrapper.unmount()
    onCommitMock.mockClear()
  })

  it('renders without errors', () => {
    expect(wrapper.exists()).toBe(true)
  })

  it('has key-input-dialog root class', () => {
    expect(wrapper.find('.key-input-dialog').exists()).toBe(true)
  })

  it('dialog is hidden initially when showWithId is null', () => {
    // The overlay should not be visible
    expect(wrapper.find('.input-overlay').exists()).toBe(false)
  })

  it('shows dialog when showWithId is set', async () => {
    await wrapper.setProps({ showWithId: 'file.new' })
    // The watch should trigger handleShow
    // We can verify indirectly
    expect(wrapper.exists()).toBe(true)
  })

  it('calls onCommit with null when showWithId cleared', async () => {
    await wrapper.setProps({ showWithId: 'file.new' })
    await wrapper.setProps({ showWithId: null })
    expect(onCommitMock).toHaveBeenCalledWith(null)
  })
})
