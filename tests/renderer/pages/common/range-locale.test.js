// FILE: tests/renderer/pages/common/range-locale.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin that the Settings stepper formats its number for the UI locale (C-38 T-004 review: "1.5 s" showed in the Russian UI).
//   SCOPE: prefComponents/common/range with a mocked vue-i18n locale.
//   DEPENDS: @vue/test-utils, vue-i18n (mocked).
//   LINKS: C-38 T-004; .grace/verification/runtime.xml V-M-011.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   localeState - hoisted mutable UI locale for the vue-i18n mock.
//   mountStepper - mounts the stepper with a 1.5 value and a unit.
// END_MODULE_MAP

import { mount } from '@vue/test-utils'

const localeState = vi.hoisted(() => ({ value: 'ru' }))
vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key) => key, locale: localeState })
}))
vi.mock('@element-plus/icons-vue', () => ({ InfoFilled: { template: '<span />' } }))

const mountStepper = async (unit) => {
  const Range = (await import('@/prefComponents/common/range/index.vue')).default
  return mount(Range, {
    props: { description: 'Delay', value: 1.5, min: 1, max: 10, step: 0.1, unit, onChange: vi.fn() }
  })
}

describe('prefComponents/common/range — locale-aware number (C-38 T-004 review)', () => {
  it('uses a decimal comma and the localized unit in Russian', async () => {
    localeState.value = 'ru'
    const wrapper = await mountStepper('с')
    expect(wrapper.find('.pref-value').text()).toBe('1,5 с')
  })

  it('keeps the decimal point in English', async () => {
    localeState.value = 'en'
    const wrapper = await mountStepper('s')
    expect(wrapper.find('.pref-value').text()).toBe('1.5 s')
  })
})
