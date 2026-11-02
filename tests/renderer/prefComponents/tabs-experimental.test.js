/**
 * Tests for src/renderer/src/prefComponents/tabs/experimental/index.vue
 * (C-LARGE-DOC-WAVE-A T-004, corner-10)
 *
 * Covers: the single progressive-mount toggle row (label + the
 * contract-naming caption), the per-session served-opens counter line,
 * the default-off state, the toggle routing through
 * SET_EXPERIMENTAL_PROGRESSIVE_MOUNT (never SET_SINGLE_PREFERENCE — no
 * mt_prefs_set write), and the counter reflecting the store counts.
 */

import { mount, flushPromises } from '@vue/test-utils'
import { setupTestPinia } from '../pinia'

vi.mock('@/i18n', () => ({ t: (key) => key, setLanguage: vi.fn() }))
vi.mock('vue-i18n', () => ({
  // Interpolating identity: params become visible in the rendered text.
  useI18n: () => ({ t: (key, params) => (params ? `${key} ${JSON.stringify(params)}` : key) }),
  createI18n: vi.fn(() => ({ global: { locale: { value: 'en' } } }))
}))
vi.mock('@/bus', () => ({ default: { on: vi.fn(), emit: vi.fn(), off: vi.fn() } }))
vi.mock('@/services/notification', () => ({ default: { notify: vi.fn() } }))

const invokeMock = vi.hoisted(() => vi.fn())
vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }))

import ExperimentalTab from '@/prefComponents/tabs/experimental/index.vue'
import { usePreferencesStore } from '@/store/preferences'

const rowStub = {
  props: ['description', 'help', 'bool', 'onChange'],
  template: '<div class="row-stub" :data-desc="description">{{ description }}{{ help ? "|" + help : "" }}</div>'
}
const globalStubs = {
  compound: { template: '<section class="group-stub"><slot name="head"/><slot name="children"/></section>' },
  bool: rowStub
}

const mountTab = () => mount(ExperimentalTab, { global: { stubs: globalStubs } })

describe('tabs/experimental — C-LARGE-DOC-WAVE-A T-004 (corner-10)', () => {
  let wrapper

  beforeEach(() => {
    setupTestPinia()
    invokeMock.mockReset()
  })

  afterEach(() => {
    wrapper?.unmount()
  })

  it('renders the progressive-mount toggle with the contract-naming caption', () => {
    wrapper = mountTab()
    const rows = wrapper.findAll('.row-stub')
    expect(rows).toHaveLength(1)
    expect(rows[0].attributes('data-desc')).toBe('preferences.experimental.progressiveMount')
    expect(rows[0].text()).toContain('preferences.experimental.progressiveMountHelp')
    expect(wrapper.findAll('.group-stub h6.title').map((h) => h.text())).toEqual([
      'preferences.experimental.title'
    ])
  })

  it('renders the per-session served-opens counter line from the store counts', () => {
    const store = usePreferencesStore()
    store.progressiveMountServedProgressiveCount = 3
    store.progressiveMountServedLegacyCount = 5
    wrapper = mountTab()
    const text = wrapper.text()
    expect(text).toContain('preferences.experimental.sessionCount')
    expect(text).toContain('"progressive":3')
    expect(text).toContain('"legacy":5')
  })

  it('defaults to off and the switch routes through the session-only action (no mt_prefs_set)', async () => {
    const store = usePreferencesStore()
    wrapper = mountTab()
    // Default off (corner-10).
    expect(store.experimentalProgressiveMount).toBe(false)

    // Drive the switch row exactly like the real Bool control does: its
    // onChange prop is the tab's onProgressiveMountChange bridge.
    const boolRow = wrapper.findComponent(rowStub)
    expect(boolRow.exists()).toBe(true)
    expect(boolRow.props('bool')).toBe(false)
    boolRow.props('onChange')(true)
    await flushPromises()
    expect(store.experimentalProgressiveMount).toBe(true)
    // Session-only: the flip must never reach mt_prefs_set.
    expect(invokeMock).not.toHaveBeenCalled()

    // The switch state follows the store (the bool prop binding).
    expect(wrapper.findComponent(rowStub).props('bool')).toBe(true)
  })
})
