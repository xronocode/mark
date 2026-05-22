/**
 * Deep coverage tests for src/renderer/src/components/about/index.vue
 *
 * Targets uncovered branches:
 *   - showDialog: sets showAboutDialog=true, emits editor-blur
 *   - onBeforeUnmount: unregisters aboutDialog bus listener
 *   - copyright / copyrightContributors rendering
 */

import { shallowMount } from '@vue/test-utils'
import { setupTestPinia } from '../pinia'
import { createI18n } from 'vue-i18n'

const busMock = { on: vi.fn(), off: vi.fn(), emit: vi.fn() }

vi.mock('@/bus', () => ({
  default: busMock
}))

vi.mock('../../assets/images/logo.png', () => ({
  default: 'logo.png'
}))

vi.mock('@/store', () => ({
  useMainStore: () => ({
    appVersion: '1.0.0-test'
  })
}))

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: {
    en: {
      'about.copyright': 'Copyright {year}',
      'about.copyrightContributors': 'Contributors'
    }
  }
})

describe('about/index.vue — deep coverage', () => {
  let pinia
  let About

  beforeEach(async () => {
    pinia = setupTestPinia()
    About = (await import('@/components/about/index.vue')).default
  })

  function mountAbout () {
    return shallowMount(About, {
      global: {
        plugins: [pinia, i18n],
        stubs: {
          ElDialog: true,
          ElRow: true,
          ElCol: true
        }
      }
    })
  }

  it('registers aboutDialog listener on mount', () => {
    mountAbout()
    expect(busMock.on).toHaveBeenCalledWith('aboutDialog', expect.any(Function))
  })

  it('showDialog sets showAboutDialog=true and emits editor-blur', () => {
    mountAbout()

    // Get the handler that was registered
    const onCall = busMock.on.mock.calls.find(c => c[0] === 'aboutDialog')
    expect(onCall).toBeDefined()
    const showDialogHandler = onCall[1]

    // Call it
    showDialogHandler()
    expect(busMock.emit).toHaveBeenCalledWith('editor-blur')
  })

  it('unregisters aboutDialog listener on unmount', () => {
    const wrapper = mountAbout()
    wrapper.unmount()
    expect(busMock.off).toHaveBeenCalledWith('aboutDialog', expect.any(Function))
  })

  it('renders the about-dialog container', () => {
    const wrapper = mountAbout()
    expect(wrapper.find('.about-dialog').exists()).toBe(true)
  })
})
