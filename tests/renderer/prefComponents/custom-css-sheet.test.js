// FILE: tests/renderer/prefComponents/custom-css-sheet.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: C-PREFS-TRUTH T-002 (F-001/F-011) — pin the Custom CSS
//            sheet's save path: an empty draft produces the customCss
//            preference write that CLEARS the stale style#custom-styles
//            layer (util/theme.js addCustomStyle empties the element for
//            real), and a non-empty draft produces the apply. The sheet's
//            own template/markup beyond the save path is untouched.
//   SCOPE: The save button path (draft → SET_SINGLE_PREFERENCE customCss →
//          the app.vue watch → addCustomStyle) with the real preferences
//          store; the layer-clearing behaviour asserted through the same
//          util the watch calls.
//   DEPENDS: Vue Test Utils, Vitest, Pinia test setup,
//            prefComponents/tabs/advanced/sheets/customCssSheet.vue,
//            util/theme.js addCustomStyle.
//   LINKS: src/renderer/src/prefComponents/tabs/advanced/sheets/customCssSheet.vue save;
//          src/renderer/src/util/theme.js addCustomStyle (C-PREFS-TRUTH);
//          tests/renderer/util/theme.test.js (the layer pins).
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   mountSheet - mounts the sheet with the pref-sheet child stubbed.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-11-21 C-PREFS-TRUTH T-002: new — the empty
//   draft save writes the clearing customCss value ('' — the truthy→falsy
//   transition the watch delivers to addCustomStyle) and a non-empty draft
//   writes the apply; closing stays wired to the close emit only.
// END_CHANGE_SUMMARY

import { beforeEach, describe, expect, it, vi } from 'vitest'
// config.js reads window.path.sep at module scope — the global setup installs
// the shim per-test (beforeEach), too late for this file's import chain.
vi.hoisted(() => {
  // config.js and util/index.js read window.path / window.electron at module
  // scope — the global setup installs them per-test (beforeEach), too late
  // for this file's import chain.
  const w = globalThis.window
  w.path = w.path || { sep: '/', dirname: (p) => String(p).split('/').slice(0, -1).join('/') }
  w.electron = w.electron || { process: { platform: 'darwin', env: {} } }
})
import { mount } from '@vue/test-utils'
import { setupTestPinia } from '../pinia'

vi.mock('@/i18n', () => ({ t: (key) => key, setLanguage: vi.fn() }))
vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key) => key })
}))
vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn() }
}))
vi.mock('@/bus', () => ({ default: { on: vi.fn(), emit: vi.fn(), off: vi.fn() } }))
vi.mock('@/services/notification', () => ({ default: { notify: vi.fn() } }))

import CustomCssSheet from '@/prefComponents/tabs/advanced/sheets/customCssSheet.vue'
import { usePreferencesStore } from '@/store/preferences'
import { addCustomStyle } from '@/util/theme'

const mountSheet = async () => {
  const wrapper = mount(CustomCssSheet, {
    props: { open: true },
    global: {
      stubs: {
        'pref-sheet': {
          template: '<section class="sheet-stub"><slot/><slot name="foot"/></section>'
        }
      }
    }
  })
  return wrapper
}

describe('customCssSheet save path (C-PREFS-TRUTH F-001/F-011)', () => {
  let store
  let setSingleSpy

  beforeEach(() => {
    setupTestPinia()
    store = usePreferencesStore()
    setSingleSpy = vi.spyOn(store, 'SET_SINGLE_PREFERENCE')
    document.head.innerHTML = ''
  })

  it('an empty draft produces the customCss write that clears the stale layer', async () => {
    // The stale layer is on the surface and the store holds the old value.
    store.customCss = 'body { color: red; }'
    addCustomStyle({ customCss: store.customCss })
    expect(document.querySelector('#custom-styles').textContent).not.toBe('')

    const wrapper = await mountSheet()
    const textarea = wrapper.find('textarea.pref-custom-css')
    expect(textarea.element.value).toBe('body { color: red; }')

    await textarea.setValue('')
    await wrapper.find('button.is-primary').trigger('click')

    // The sheet's save writes the preference; the watch delivers the empty
    // value to addCustomStyle, which empties the existing layer.
    expect(setSingleSpy).toHaveBeenCalledWith({ type: 'customCss', value: '' })
    expect(wrapper.emitted('close')).toHaveLength(1)
    addCustomStyle({ customCss: '' })
    expect(document.querySelector('#custom-styles').textContent).toBe('')
    wrapper.unmount()
  })

  it('a non-empty draft produces the apply write', async () => {
    store.customCss = ''
    const wrapper = await mountSheet()
    await wrapper.find('textarea.pref-custom-css').setValue('mark { color: blue; }')
    await wrapper.find('button.is-primary').trigger('click')

    expect(setSingleSpy).toHaveBeenCalledWith({ type: 'customCss', value: 'mark { color: blue; }' })
    expect(wrapper.emitted('close')).toHaveLength(1)
    // And through the same util the watch calls, the layer applies again.
    addCustomStyle({ customCss: 'mark { color: blue; }' })
    expect(document.querySelector('#custom-styles').textContent).toBe('mark { color: blue; }')
    wrapper.unmount()
  })

  it('closing without Save writes no preference', async () => {
    store.customCss = 'body { color: red; }'
    const wrapper = await mountSheet()
    await wrapper.find('textarea.pref-custom-css').setValue('unsaved edit')
    await wrapper.findAll('button').at(0)?.trigger('click')
    expect(setSingleSpy).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})
