// FILE: tests/renderer/prefComponents/appearance-title-bar.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: C-PREFS-TRUTH T-007 (F-010) — pin the platform branch of the
//            Appearance tab's title-bar row: on Windows the no-op System
//            frame choice is presented DISABLED with the explicit
//            why-this-is-disabled help line (Windows ships decorations:false
//            per tauri.windows.conf.json and the title bar forces 'custom'
//            on Windows), while Linux and macOS behave exactly as before
//            (both options offered and honored; macOS hides the row).
//   SCOPE: prefComponents/tabs/appearance/index.vue title-bar row only —
//          options, per-option disabled flag and the help line per platform.
//   DEPENDS: Vue Test Utils, Vitest, Pinia test setup, appearance/index.vue,
//            @/util mocked with isOsx/isWindows getters.
//   LINKS: src/renderer/src/prefComponents/tabs/appearance/index.vue
//          getTitleBarStyleOptions (C-PREFS-TRUTH);
//          src-tauri/tauri.windows.conf.json (decorations:false);
//          components/titleBar effectiveTitleBarStyle;
//          tests/renderer/i18n/locale-keys.test.js (the ten-locale rule).
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   osState - the hoisted platform fixture (independent isOsx / isWindows fields).
//   selectStub - the cur-select stub exposing the options/help props.
//   globalStubs - the shared row/select stub table for the tab mount.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-11-21 C-PREFS-TRUTH T-007: new — Windows
//   renders the System option disabled with titleBarStyleWindowsHelp, the
//   Linux row keeps custom/native both enabled, and macOS keeps the row
//   hidden exactly as before.
// END_CHANGE_SUMMARY

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setupTestPinia } from '../pinia'

const osState = vi.hoisted(() => ({ isOsx: false, isWindows: false }))

vi.mock('@/util', () => ({
  get isOsx () { return osState.isOsx },
  get isWindows () { return osState.isWindows },
  isLinux: false,
  delay: vi.fn(), serialize: vi.fn(), merge: vi.fn()
}))

vi.mock('@/i18n', () => ({ t: (key) => key, setLanguage: vi.fn() }))
vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key) => key }),
  createI18n: vi.fn(() => ({ global: { locale: { value: 'en' } } }))
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn() }
}))

vi.mock('@/bus', () => ({ default: { on: vi.fn(), emit: vi.fn(), off: vi.fn() } }))
vi.mock('@/services/notification', () => ({ default: { notify: vi.fn() } }))

import AppearanceTab from '@/prefComponents/tabs/appearance/index.vue'

const selectStub = {
  props: ['description', 'help', 'value', 'options'],
  // The row surfaces as a DOM stub — help and the option list ride along as
  // data-attributes (DOM wrappers have no .props()).
  template: `
    <div class="row-stub select-stub" :data-desc="description"
      :data-help="help"
      :data-values="(options || []).map((o) => o.value).join(',')"
      :data-native-disabled="(options || []).some((o) => o.value === 'native' && o.disabled) ? '1' : '0'">
    </div>`
}

const globalStubs = {
  compound: { template: '<section class="group-stub"><slot name="head"/><slot name="children"/></section>' },
  bool: { template: '<div class="row-stub"/>', props: ['description'] },
  'cur-select': selectStub,
  range: { template: '<div class="row-stub"/>', props: ['description'] },
  'text-box': { template: '<div class="row-stub"/>', props: ['description'] },
  'font-text-box': { template: '<div class="row-stub"/>', props: ['description'] },
  segmented: { template: '<div class="row-stub"/>', props: ['description'] }
}

describe('appearance title-bar row per platform (C-PREFS-TRUTH F-010)', () => {
  let wrapper

  const titleBarRow = () =>
    wrapper
      .findAll('.select-stub')
      .find((r) => r.attributes('data-desc') === 'preferences.appearance.window.titleBarStyle')

  const mountTab = () => mount(AppearanceTab, { global: { stubs: globalStubs } })

  beforeEach(() => {
    setupTestPinia()
    osState.isOsx = false
    osState.isWindows = false
  })

  afterEach(() => {
    wrapper?.unmount()
  })

  it('on Windows no enabled System choice is presented: native renders disabled with the why-line', () => {
    osState.isOsx = false
    osState.isWindows = true
    wrapper = mountTab()
    const row = titleBarRow()
    expect(row).toBeTruthy()
    expect(row.attributes('data-help')).toBe('preferences.appearance.window.titleBarStyleWindowsHelp')
    expect(row.attributes('data-values')).toBe('custom,native')
    expect(row.attributes('data-native-disabled')).toBe('1')
  })

  it('on Linux both options are offered and enabled with the regular help line (exactly as before)', () => {
    osState.isOsx = false
    osState.isWindows = false
    wrapper = mountTab()
    const row = titleBarRow()
    expect(row).toBeTruthy()
    expect(row.attributes('data-values')).toBe('custom,native')
    expect(row.attributes('data-native-disabled')).toBe('0')
    expect(row.attributes('data-help')).toBe('preferences.appearance.window.titleBarStyleHelp')
  })

  it('on macOS the row stays hidden exactly as before', () => {
    osState.isOsx = true
    osState.isWindows = false
    wrapper = mountTab()
    expect(titleBarRow()).toBeUndefined()
  })
})
