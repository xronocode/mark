/**
 * Tests for src/renderer/src/pages/preference.vue — the C-38 T-003 shell.
 *
 * Covers: shell structure (toolbar + body), per-OS root class, the
 * window title following the active tab, and the remembered-tab
 * persistence on tab switches.
 */

import { shallowMount } from '@vue/test-utils'
import { reactive, nextTick } from 'vue'
import { setupTestPinia } from '../pinia'
import { createI18n } from 'vue-i18n'
import { getCurrentWindow } from '@tauri-apps/api/window'

vi.mock('@/util/theme', () => ({
  addThemeStyle: vi.fn()
}))

vi.mock('@/util/autoTheme', () => ({
  resolveAutoTheme: vi.fn(() => 'paper'),
  watchSystemColorScheme: vi.fn(() => () => {})
}))

vi.mock('@/config', () => ({
  DEFAULT_STYLE: { theme: 'light' }
}))

const osState = vi.hoisted(() => ({ isOsx: true }))

vi.mock('@/util', () => ({
  // Getters: the component reads the binding at render/call time.
  get isOsx () { return osState.isOsx },
  get isWindows () { return !osState.isOsx },
  isLinux: false
}))

const routeRef = reactive({ name: 'general', path: '/preference/general' })
const pushMock = vi.fn(async () => undefined)

vi.mock('vue-router', () => ({
  useRoute: () => routeRef,
  useRouter: () => ({ push: pushMock })
}))

import TabsBar from '@/prefComponents/tabsBar'

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: {
    en: {
      preferences: {
        title: 'Preferences',
        tabs: {
          export: 'Export',
          general: 'General',
          appearance: 'Appearance',
          editor: 'Editor',
          markdown: 'Markdown',
          advanced: 'Advanced'
        }
      }
    }
  }
})

describe('preference.vue page (C-38 T-003 shell)', () => {
  let pinia

  beforeEach(() => {
    pinia = setupTestPinia()
    window.localStorage.clear()
    pushMock.mockClear()
    routeRef.name = 'general'
    osState.isOsx = true
  })

  const mountShell = async () => {
    const Preference = (await import('@/pages/preference.vue')).default
    return shallowMount(Preference, {
      global: {
        plugins: [pinia, i18n],
        stubs: {
          TabsBar: true,
          RouterView: true
        }
      }
    })
  }

  it('mounts with the toolbar + body structure', async () => {
    const wrapper = await mountShell()
    expect(wrapper.find('.pref-container').exists()).toBe(true)
    expect(wrapper.find('.pref-body').exists()).toBe(true)
    expect(wrapper.findComponent(TabsBar).exists()).toBe(true)
    wrapper.unmount()
  })

  it('carries the macOS root class when isOsx', async () => {
    osState.isOsx = true
    const wrapper = await mountShell()
    expect(wrapper.find('.pref-container.is-mac').exists()).toBe(true)
    wrapper.unmount()
  })

  it('carries the Windows/Linux root class when not isOsx', async () => {
    osState.isOsx = false
    const wrapper = await mountShell()
    expect(wrapper.find('.pref-container.is-win').exists()).toBe(true)
    wrapper.unmount()
  })

  it('sets the window title to the active tab (macOS: bare label)', async () => {
    const wrapper = await mountShell()
    expect(document.title).toBe('General')
    const win = getCurrentWindow()
    expect(win.setTitle).toHaveBeenCalledWith('General')
    wrapper.unmount()
  })

  it('appends the app name for Windows/Linux titles', async () => {
    osState.isOsx = false
    const wrapper = await mountShell()
    expect(document.title).toBe('General — Mark')
    wrapper.unmount()
  })

  it('retitles when the route moves to another tab', async () => {
    const wrapper = await mountShell()
    routeRef.name = 'appearance'
    await nextTick()
    expect(document.title).toBe('Appearance')
    wrapper.unmount()
  })

  it('persists the active tab as the remembered tab', async () => {
    const wrapper = await mountShell()
    routeRef.name = 'markdown'
    await nextTick()
    expect(window.localStorage.getItem('settings.lastTab')).toBe('markdown')
    wrapper.unmount()
  })

  it('ignores non-tab routes (no title stomp, no persistence)', async () => {
    const wrapper = await mountShell()
    // The mount itself persisted the initial tab; only the route change matters.
    window.localStorage.removeItem('settings.lastTab')
    routeRef.name = undefined
    await nextTick()
    expect(window.localStorage.getItem('settings.lastTab')).toBeNull()
    wrapper.unmount()
  })

  it('routes an already-open window when the other window requests Export', async () => {
    const wrapper = await mountShell()
    window.dispatchEvent(new StorageEvent('storage', { key: 'settings.lastTab', newValue: 'export', storageArea: localStorage }))
    expect(pushMock).toHaveBeenCalledWith({ path: '/preference/export' })
    routeRef.name = 'export'
    await nextTick()
    expect(document.title).toBe('Export')
    wrapper.unmount()
  })

  it('ignores null/invalid/unrelated storage events and requests for the current tab', async () => {
    const wrapper = await mountShell()
    for (const [key, newValue] of [['other', 'export'], ['settings.lastTab', null], ['settings.lastTab', 'invalid'], ['settings.lastTab', 'general']]) {
      window.dispatchEvent(new StorageEvent('storage', { key, newValue, storageArea: localStorage }))
    }
    window.dispatchEvent(new StorageEvent('storage', { key: 'settings.lastTab', newValue: 'export', storageArea: sessionStorage }))
    expect(pushMock).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('removes its cross-window listener when the Settings shell unmounts', async () => {
    const wrapper = await mountShell()
    wrapper.unmount()
    window.dispatchEvent(new StorageEvent('storage', { key: 'settings.lastTab', newValue: 'export', storageArea: localStorage }))
    expect(pushMock).not.toHaveBeenCalled()
  })
})
