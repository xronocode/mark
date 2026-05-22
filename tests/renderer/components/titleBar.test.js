import { shallowMount } from '@vue/test-utils'
import { setupTestPinia } from '../pinia'
import { createI18n } from 'vue-i18n'

vi.mock('@/bus', () => ({
  default: { on: vi.fn(), off: vi.fn(), emit: vi.fn() }
}))

vi.mock('../../assets/window-controls.js', () => ({
  minimizePath: 'M0,0',
  restorePath: 'M0,0',
  maximizePath: 'M0,0',
  closePath: 'M0,0'
}))

vi.mock('../../config', () => ({
  PATH_SEPARATOR: '/',
  themePairs: { light: 'dark', dark: 'light' },
  isDarkTheme: vi.fn((t) => /dark/i.test(t))
}))

vi.mock('@/util', () => ({
  isOsx: false,
  isWindows: false,
  isLinux: true,
  animatedScrollTo: vi.fn()
}))

// __APP_VERSION__ is a define'd global in the real build
globalThis.__APP_VERSION__ = '2.0.0-test'

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: {} } })

describe('titleBar/index.vue', () => {
  let pinia

  beforeEach(() => {
    pinia = setupTestPinia()
  })

  it('mounts without errors', async () => {
    const TitleBar = (await import('@/components/titleBar/index.vue')).default
    const wrapper = shallowMount(TitleBar, {
      props: {
        project: null,
        filename: 'test.md',
        pathname: '/tmp/test.md',
        active: true,
        wordCount: { word: 10, character: 50, paragraph: 2, all: 60 },
        platform: 'darwin',
        isSaved: true
      },
      global: {
        plugins: [pinia, i18n],
        stubs: {
          ElTooltip: true
        }
      }
    })
    expect(wrapper.exists()).toBe(true)
    expect(wrapper.find('.title-bar').exists()).toBe(true)
  })

  it('displays filename in title', async () => {
    const TitleBar = (await import('@/components/titleBar/index.vue')).default
    const wrapper = shallowMount(TitleBar, {
      props: {
        project: null,
        filename: 'notes.md',
        pathname: '/home/user/notes.md',
        active: true,
        wordCount: null,
        platform: 'linux',
        isSaved: true
      },
      global: {
        plugins: [pinia, i18n],
        stubs: {
          ElTooltip: true
        }
      }
    })
    expect(wrapper.find('.filename').text()).toBe('notes.md')
  })

  it('shows Mark when no filename', async () => {
    const TitleBar = (await import('@/components/titleBar/index.vue')).default
    const wrapper = shallowMount(TitleBar, {
      props: {
        project: null,
        filename: '',
        pathname: '',
        active: true,
        wordCount: null,
        platform: 'darwin',
        isSaved: true
      },
      global: {
        plugins: [pinia, i18n],
        stubs: {
          ElTooltip: true
        }
      }
    })
    expect(wrapper.find('.title').text()).toContain('Mark')
  })

  it('renders navigation buttons', async () => {
    const TitleBar = (await import('@/components/titleBar/index.vue')).default
    const wrapper = shallowMount(TitleBar, {
      props: {
        project: null,
        filename: 'test.md',
        pathname: '/tmp/test.md',
        active: true,
        wordCount: null,
        platform: 'darwin',
        isSaved: true
      },
      global: {
        plugins: [pinia, i18n],
        stubs: {
          ElTooltip: true
        }
      }
    })
    expect(wrapper.find('.titlebar-nav').exists()).toBe(true)
    const navBtns = wrapper.findAll('.titlebar-nav-btn')
    // sidebar toggle, files, toc, settings, theme toggle = 5
    expect(navBtns.length).toBe(5)
  })
})
