// FILE: tests/renderer/prefComponents/tabs-general-tree-files.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: C-51 T-001 unit tests for the Settings › General › Files and saving «Show all files» switch — row presence/binding, SET_SINGLE_PREFERENCE persistence, the store default, RESETTABLE membership, and the schema.json entry.
//   SCOPE: prefComponents/tabs/general/index.vue row composition over stubbed controls + store/schema assertions.
//   DEPENDS: prefComponents/tabs/general/index.vue, store/preferences, _shims/preferences/schema.json, tests/renderer/setup.ts.
//   LINKS: .grace/changes/archive/C-51 T-001; .grace/verification/runtime.xml V-M-011.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   rowStub / globalStubs / mountTab - label-rendering row stubs (same shape as tabs-general.test.js).
//   SCHEMA - test fixture / helper.
//   globalStubs - test fixture / helper.
//   mountTab - test fixture / helper.
//   osState - test fixture / helper.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-16 C-51 T-001: initial tests.
// END_CHANGE_SUMMARY

import { setupTestPinia } from '../pinia'
import { mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const osState = vi.hoisted(() => ({ isOsx: true }))

vi.mock('@/util', () => ({
  get isOsx () { return osState.isOsx },
  get isWindows () { return !osState.isOsx },
  isLinux: false,
  delay: vi.fn(), serialize: vi.fn(), merge: vi.fn()
}))

vi.mock('@/i18n', () => ({ t: (key) => key, setLanguage: vi.fn() }))
vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key) => key }),
  createI18n: vi.fn(() => ({ global: { locale: { value: 'en' } } }))
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn() },
  ElMessageBox: { confirm: vi.fn() }
}))

vi.mock('@/bus', () => ({ default: { on: vi.fn(), emit: vi.fn(), off: vi.fn() } }))
vi.mock('@/services/notification', () => ({ default: { notify: vi.fn() } }))
vi.mock('@/commands', () => ({ default: [] }))
vi.mock('@tauri-apps/api/app', () => ({ getVersion: vi.fn(async () => '9.9.9') }))
vi.mock('common/encoding', () => ({
  ENCODING_NAME_MAP: Object.freeze({ utf8: 'UTF-8', gbk: 'GBK' })
}))

import GeneralTab from '@/prefComponents/tabs/general/index.vue'
import { usePreferencesStore, RESETTABLE_PREFERENCE_KEYS } from '@/store/preferences'

const rowStub = {
  props: ['description', 'help', 'value', 'bool', 'options', 'disable', 'onChange'],
  template:
    '<div class="row-stub" :data-desc="description">{{ description }}{{ help ? "|" + help : "" }}</div>'
}
const globalStubs = {
  compound: { template: '<section class="group-stub"><slot name="head"/><slot name="children"/></section>' },
  bool: rowStub,
  'cur-select': rowStub,
  range: rowStub,
  'button-row': rowStub
}

const mountTab = () => mount(GeneralTab, { global: { stubs: globalStubs } })

const SCHEMA = JSON.parse(
  readFileSync(
    resolve(__dirname, '../../../src/renderer/src/_shims/preferences/schema.json'),
    'utf8'
  )
)

describe('Settings › Files «Show all files» (C-51 T-001)', () => {
  beforeEach(() => {
    setupTestPinia()
  })

  it('renders the switch row at the end of the Files-and-saving group', () => {
    const wrapper = mountTab()
    const keys = wrapper.findAll('.row-stub').map((r) => r.attributes('data-desc'))
    expect(keys).toContain('preferences.general.filesAndSaving.showAllFiles')
    expect(keys.indexOf('preferences.general.filesAndSaving.showAllFiles')).toBe(
      keys.indexOf('preferences.general.filesAndSaving.endOfLine') + 1
    )
  })

  it('binds the store state and persists through SET_SINGLE_PREFERENCE', async () => {
    const store = usePreferencesStore()
    const spy = vi.spyOn(store, 'SET_SINGLE_PREFERENCE')
    const wrapper = mountTab()
    const boolRow = wrapper
      .findAllComponents('.row-stub')
      .find((c) => c.props('description') === 'preferences.general.filesAndSaving.showAllFiles')
    expect(boolRow.props('bool')).toBe(false)
    await boolRow.props('onChange')(true)
    expect(spy).toHaveBeenCalledWith({ type: 'treeShowAllFiles', value: true })
    expect(store.treeShowAllFiles).toBe(true)
  })

  it('the preference defaults to false, is resettable and schema-documented', () => {
    const store = usePreferencesStore()
    expect(store.treeShowAllFiles).toBe(false)
    expect(RESETTABLE_PREFERENCE_KEYS).toContain('treeShowAllFiles')
    expect(SCHEMA.treeShowAllFiles).toEqual({
      description: expect.stringContaining('General--'),
      type: 'boolean',
      default: false
    })
    // search index routes it to the General tab
    expect(SCHEMA.treeShowAllFiles.description.startsWith('General--')).toBe(true)
  })
})
