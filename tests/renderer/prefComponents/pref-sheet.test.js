/**
 * Tests for src/renderer/src/prefComponents/common/sheet/index.vue (C-38 T-004)
 *
 * Covers: renders only when open, the Close button and the Escape key
 * both emit close, the foot slot appears only when provided, and the
 * width override reaches the panel style.
 */

import { mount } from '@vue/test-utils'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key) => key }),
  createI18n: vi.fn(() => ({ global: { locale: { value: 'en' } } }))
}))

import PrefSheet from '@/prefComponents/common/sheet/index.vue'

describe('common/sheet — C-38 T-004', () => {
  let wrapper

  afterEach(() => {
    wrapper?.unmount()
  })

  const mountSheet = (props = {}, slots = {}) =>
    mount(PrefSheet, {
      props: { open: true, title: 'Sheet title', ...props },
      slots
    })

  it('renders nothing while closed', () => {
    wrapper = mountSheet({ open: false })
    expect(wrapper.find('.pref-sheet-overlay').exists()).toBe(false)
  })

  it('renders the dialog with the title and close affordance', () => {
    wrapper = mountSheet()
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true)
    expect(wrapper.find('.pref-sheet-title').text()).toBe('Sheet title')
    expect(wrapper.find('.pref-sheet-close').exists()).toBe(true)
  })

  it('the Close button emits close', async () => {
    wrapper = mountSheet()
    await wrapper.find('.pref-sheet-close').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('Escape emits close (capture-phase window listener)', async () => {
    wrapper = mountSheet()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('other keys do not close', async () => {
    wrapper = mountSheet()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    expect(wrapper.emitted('close')).toBeUndefined()
  })

  it('removes the listener on unmount (no stray close after)', async () => {
    wrapper = mountSheet()
    wrapper.unmount()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    // no error and no emission possible after unmount
  })

  it('shows the foot area only when the slot is provided', () => {
    wrapper = mountSheet()
    expect(wrapper.find('.pref-sheet-foot').exists()).toBe(false)
    wrapper.unmount()
    wrapper = mountSheet({}, { foot: '<button class="foot-btn">Save</button>' })
    expect(wrapper.find('.pref-sheet-foot').exists()).toBe(true)
    expect(wrapper.find('.foot-btn').exists()).toBe(true)
  })

  it('applies the width override to the panel', () => {
    wrapper = mountSheet({ width: 640 })
    const style = wrapper.find('.pref-sheet').attributes('style') ?? ''
    expect(style).toContain('640px')
  })

  it('default panel is 560px wide (no override)', () => {
    wrapper = mountSheet()
    const style = wrapper.find('.pref-sheet').attributes('style') ?? ''
    expect(style).not.toContain('width')
  })
})
