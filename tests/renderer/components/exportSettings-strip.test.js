// FILE: tests/renderer/components/exportSettings-strip.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: C-EXPORT-SINGLE-PAGE T-003 pin — the headerFooterStrip slot
//            component for real: three focusable text inputs, slot
//            placeholders, and the one-field change patches the parent
//            merges (the fn/deep suites stub it, leaving its branches
//            uncovered for the 85% gate).
//   SCOPE: src/renderer/src/components/exportSettings/headerFooterStrip.vue
//          in isolation; no store, no bus, no export pipeline.
//   DEPENDS: Vitest, @vue/test-utils, vue-i18n test instance.
//   LINKS: .grace/changes/archive/C-EXPORT-SINGLE-PAGE (R-4);
//          .grace/graph/features.xml M-072.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   i18n - test i18n instance carrying the headerFooter slot placeholders.
//   ElInputStub - real-input double for el-input wired to the v-model contract.
//   mountStrip - mount helper with the strip's props contract.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: 2026-11-07 v1.0.0 - C-EXPORT-SINGLE-PAGE follow-up:
//   initial file — direct coverage of the strip component (CI branch
//   coverage had it fully uncovered because every other suite stubs it).
// END_CHANGE_SUMMARY
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: {
    en: {
      exportSettings: {
        headerFooter: {
          leftSlot: 'Left',
          centerSlot: 'Center',
          rightSlot: 'Right'
        }
      }
    }
  }
})

import HeaderFooterStrip from '@/components/exportSettings/headerFooterStrip.vue'

// el-input double: a real input wired to the v-model contract, so the
// strip's writable computables are exercised for real (the element-plus
// component itself is not under test here).
const ElInputStub = {
  props: ['modelValue', 'placeholder', 'ariaLabel', 'size'],
  emits: ['update:modelValue'],
  template: `<input
    :value="modelValue"
    :placeholder="placeholder"
    :aria-label="ariaLabel"
    @input="$emit('update:modelValue', $event.target.value)"
  />`
}

const mountStrip = (props = {}) => mount(HeaderFooterStrip, {
  props: {
    label: 'Header',
    left: '',
    center: '',
    right: '',
    ...props
  },
  global: { plugins: [i18n], stubs: { ElInput: ElInputStub } }
})

describe('headerFooterStrip (C-EXPORT-SINGLE-PAGE R-4)', () => {
  it('renders three real text inputs in left→center→right order with slot placeholders and the label', () => {
    const w = mountStrip({ left: 'L', center: 'C' })
    const inputs = w.findAll('input')
    expect(inputs).toHaveLength(3)
    expect(inputs.map((i) => i.attributes('placeholder'))).toEqual(['Left', 'Center', 'Right'])
    expect(inputs[0].element.value).toBe('L')
    expect(inputs[1].element.value).toBe('C')
    expect(inputs[2].element.value).toBe('')
    expect(w.text()).toContain('Header')
  })

  it('typing in a slot emits a one-field patch; the other slots are untouched', async () => {
    const w = mountStrip({ left: 'L' })
    await w.findAll('input')[1].setValue('Centre text')
    expect(w.emitted('change')).toHaveLength(1)
    expect(w.emitted('change')[0]).toEqual([{ center: 'Centre text' }])
    // props remain the source of truth until the parent merges the patch
    expect(w.findAll('input')[0].element.value).toBe('L')
  })

  it('each slot patches only its own field', async () => {
    const w = mountStrip()
    const inputs = w.findAll('input')
    await inputs[0].setValue('l')
    await inputs[2].setValue('r')
    const patches = w.emitted('change')
    expect(patches).toEqual([[{ left: 'l' }], [{ right: 'r' }]])
  })

  it('carries aria-labels naming the strip and the slot', () => {
    const w = mountStrip({ label: 'Footer' })
    const labels = w.findAll('input').map((i) => i.attributes('aria-label'))
    expect(labels).toEqual(['Footer — Left', 'Footer — Center', 'Footer — Right'])
  })
})
