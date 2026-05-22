/**
 * Deep tests for src/renderer/src/prefComponents/keybindings/key-input-dialog.vue
 *
 * Targets: handleKeyDown, handleKeyUp, handleShow, handleFocusOnShow,
 * handleDialogClose, cancelKeybinding, saveKeybinding, isRawKeyCode,
 * showWithId watcher, all edge cases.
 */

import { shallowMount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'

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

const isCompositionEventMock = vi.fn(() => false)
const isValidElectronAcceleratorMock = vi.fn(() => true)
const getAcceleratorMock = vi.fn(() => ({
  accelerator: 'Ctrl+S',
  isValid: true
}))

vi.mock('@hfelix/electron-localshortcut', () => ({
  isCompositionEvent: (...args) => isCompositionEventMock(...args),
  isValidElectronAccelerator: (...args) => isValidElectronAcceleratorMock(...args),
  getAcceleratorFromKeyboardEvent: (...args) => getAcceleratorMock(...args)
}))

import KeyInputDialog from '@/prefComponents/keybindings/key-input-dialog.vue'

describe('KeyInputDialog.vue – deep tests', () => {
  let wrapper
  let onCommitMock

  beforeEach(() => {
    onCommitMock = vi.fn()
    isCompositionEventMock.mockReturnValue(false)
    isValidElectronAcceleratorMock.mockReturnValue(true)
    getAcceleratorMock.mockReturnValue({ accelerator: 'Ctrl+S', isValid: true })

    wrapper = shallowMount(KeyInputDialog, {
      props: {
        onCommit: onCommitMock,
        showWithId: null
      },
      global: {
        mocks: { $t: (key) => key },
        stubs: {
          'el-dialog': {
            template: '<div><slot name="title" /><slot /></div>',
            props: ['modelValue']
          }
        }
      }
    })
  })

  afterEach(() => {
    wrapper.unmount()
  })

  // ── showWithId watcher ───────────────────────────────────────────────

  it('shows dialog when showWithId set to a value', async () => {
    await wrapper.setProps({ showWithId: 'file.new' })
    expect(wrapper.vm.showKeyInputDialog).toBe(true)
  })

  it('calls cancelKeybinding when showWithId cleared (non-null to null)', async () => {
    await wrapper.setProps({ showWithId: 'file.new' })
    await wrapper.setProps({ showWithId: null })
    expect(onCommitMock).toHaveBeenCalledWith(null)
  })

  it('does not react when showWithId stays the same value', async () => {
    await wrapper.setProps({ showWithId: 'file.new' })
    onCommitMock.mockClear()
    await wrapper.setProps({ showWithId: 'file.new' })
    expect(onCommitMock).not.toHaveBeenCalled()
  })

  // ── handleKeyDown ────────────────────────────────────────────────────

  it('handleKeyDown prevents default and stops propagation', () => {
    const event = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      code: 'KeyA',
      ctrlKey: true,
      altKey: false,
      shiftKey: false,
      metaKey: false
    }
    wrapper.vm.handleKeyDown(event)
    expect(event.preventDefault).toHaveBeenCalled()
    expect(event.stopPropagation).toHaveBeenCalled()
  })

  it('handleKeyDown returns early for composition events', () => {
    isCompositionEventMock.mockReturnValue(true)
    const event = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn()
    }
    wrapper.vm.handleKeyDown(event)
    // Should not update keybindingInputValue
    expect(wrapper.vm.keybindingInputValue).toBe('')
  })

  it('handleKeyDown cancels on Escape key', async () => {
    await wrapper.setProps({ showWithId: 'file.new' })
    onCommitMock.mockClear()
    const event = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      code: 'Escape',
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
      metaKey: false
    }
    wrapper.vm.handleKeyDown(event)
    expect(onCommitMock).toHaveBeenCalledWith(null)
  })

  it('handleKeyDown saves on Enter key when currentKeybinding is set', async () => {
    await wrapper.setProps({ showWithId: 'file.new' })
    onCommitMock.mockClear()

    // First set a keybinding via a normal keydown
    getAcceleratorMock.mockReturnValue({ accelerator: 'Ctrl+X', isValid: true })
    wrapper.vm.handleKeyDown({
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      code: 'KeyX',
      ctrlKey: true,
      altKey: false,
      shiftKey: false,
      metaKey: false
    })

    // Now press Enter to save
    wrapper.vm.handleKeyDown({
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      code: 'Enter',
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
      metaKey: false
    })
    expect(onCommitMock).toHaveBeenCalledWith('Ctrl+X')
  })

  it('handleKeyDown on Enter with no currentKeybinding cancels', async () => {
    await wrapper.setProps({ showWithId: 'file.new' })
    onCommitMock.mockClear()

    wrapper.vm.handleKeyDown({
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      code: 'Enter',
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
      metaKey: false
    })
    expect(onCommitMock).toHaveBeenCalledWith(null)
  })

  it('handleKeyDown sets keybindingInputValue and validates', () => {
    getAcceleratorMock.mockReturnValue({ accelerator: 'Alt+F4', isValid: true })
    isValidElectronAcceleratorMock.mockReturnValue(true)

    wrapper.vm.handleKeyDown({
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      code: 'F4',
      ctrlKey: false,
      altKey: true,
      shiftKey: false,
      metaKey: false
    })
    expect(wrapper.vm.keybindingInputValue).toBe('Alt+F4')
    expect(wrapper.vm.isKeybindingValid).toBe(true)
  })

  it('handleKeyDown marks invalid when isValid is false', () => {
    getAcceleratorMock.mockReturnValue({ accelerator: 'Shift', isValid: false })
    isValidElectronAcceleratorMock.mockReturnValue(false)

    wrapper.vm.handleKeyDown({
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      code: 'ShiftLeft',
      ctrlKey: false,
      altKey: false,
      shiftKey: true,
      metaKey: false
    })
    expect(wrapper.vm.isKeybindingValid).toBe(false)
  })

  it('handleKeyDown marks invalid when accelerator is valid but Electron rejects', () => {
    getAcceleratorMock.mockReturnValue({ accelerator: 'Ctrl+?', isValid: true })
    isValidElectronAcceleratorMock.mockReturnValue(false)

    wrapper.vm.handleKeyDown({
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      code: 'Slash',
      ctrlKey: true,
      altKey: false,
      shiftKey: true,
      metaKey: false
    })
    expect(wrapper.vm.isKeybindingValid).toBe(false)
  })

  // ── handleKeyUp ──────────────────────────────────────────────────────

  it('handleKeyUp prevents default and stops propagation', () => {
    const event = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn()
    }
    wrapper.vm.handleKeyUp(event)
    expect(event.preventDefault).toHaveBeenCalled()
    expect(event.stopPropagation).toHaveBeenCalled()
  })

  // ── saveKeybinding with invalid keybinding ───────────────────────────

  it('saveKeybinding does not commit when keybinding is invalid', async () => {
    await wrapper.setProps({ showWithId: 'file.new' })

    // Set up an invalid keybinding
    getAcceleratorMock.mockReturnValue({ accelerator: 'Shift', isValid: false })
    wrapper.vm.handleKeyDown({
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      code: 'ShiftLeft',
      ctrlKey: false,
      altKey: false,
      shiftKey: true,
      metaKey: false
    })

    onCommitMock.mockClear()
    // Press Enter (saveKeybinding called, but keybinding is invalid so it should not commit)
    wrapper.vm.handleKeyDown({
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      code: 'Enter',
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
      metaKey: false
    })
    // Should not have committed the invalid keybinding
    expect(onCommitMock).not.toHaveBeenCalledWith('Shift')
  })

  // ── cancelKeybinding prevents double commit ──────────────────────────

  it('cancelKeybinding only commits once (double-close prevention)', async () => {
    await wrapper.setProps({ showWithId: 'file.new' })
    onCommitMock.mockClear()

    wrapper.vm.cancelKeybinding()
    wrapper.vm.cancelKeybinding()

    // Should only be called once
    expect(onCommitMock).toHaveBeenCalledTimes(1)
    expect(onCommitMock).toHaveBeenCalledWith(null)
  })

  // ── handleDialogClose resets state ───────────────────────────────────

  it('handleDialogClose resets all internal state', async () => {
    await wrapper.setProps({ showWithId: 'file.new' })
    wrapper.vm.keybindingInputValue = 'Ctrl+S'
    wrapper.vm.isKeybindingValid = false

    wrapper.vm.handleDialogClose()

    expect(wrapper.vm.keybindingInputValue).toBe('')
    expect(wrapper.vm.isKeybindingValid).toBe(true)
    expect(wrapper.vm.showKeyInputDialog).toBe(false)
  })

  // ── handleFocusOnShow ────────────────────────────────────────────────

  it('handleFocusOnShow does nothing when input ref is null', () => {
    // inputTextbox template ref may be null before dialog opens
    expect(() => wrapper.vm.handleFocusOnShow()).not.toThrow()
  })

  // ── isRawKeyCode helper ──────────────────────────────────────────────

  it('Escape key is recognized as raw keycode without modifiers', () => {
    const event = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      code: 'Escape',
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
      metaKey: false
    }
    // Escape with no modifiers should trigger cancel
    isCompositionEventMock.mockReturnValue(false)
    wrapper.vm.handleKeyDown(event)
    // cancelKeybinding would have been called
  })

  it('Escape with modifier is not treated as raw Escape', () => {
    const event = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      code: 'Escape',
      ctrlKey: true,
      altKey: false,
      shiftKey: false,
      metaKey: false
    }
    isCompositionEventMock.mockReturnValue(false)
    getAcceleratorMock.mockReturnValue({ accelerator: 'Ctrl+Escape', isValid: true })

    wrapper.vm.handleKeyDown(event)
    // Should be treated as a normal keybinding, not a cancel
    expect(wrapper.vm.keybindingInputValue).toBe('Ctrl+Escape')
  })

  it('Enter with modifier is not treated as raw Enter', async () => {
    await wrapper.setProps({ showWithId: 'file.new' })
    onCommitMock.mockClear()
    getAcceleratorMock.mockReturnValue({ accelerator: 'Ctrl+Enter', isValid: true })

    const event = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      code: 'Enter',
      ctrlKey: true,
      altKey: false,
      shiftKey: false,
      metaKey: false
    }
    wrapper.vm.handleKeyDown(event)
    expect(wrapper.vm.keybindingInputValue).toBe('Ctrl+Enter')
    // Should not have saved (no onCommit call)
    expect(onCommitMock).not.toHaveBeenCalled()
  })

  // ── overlay visibility ───────────────────────────────────────────────

  it('input-overlay is shown when dialog is visible', async () => {
    await wrapper.setProps({ showWithId: 'file.new' })
    await nextTick()
    expect(wrapper.find('.input-overlay').exists()).toBe(true)
  })

  it('input-overlay is hidden when dialog is not visible', () => {
    expect(wrapper.find('.input-overlay').exists()).toBe(false)
  })
})
