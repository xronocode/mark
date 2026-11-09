import { shallowMount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { setupTestPinia } from '../pinia'
import { createI18n } from 'vue-i18n'

vi.mock('@/bus', () => ({
  default: { on: vi.fn(), off: vi.fn(), emit: vi.fn() }
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
        pathname: '/tmp/home/<fixture>/notes.md',
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
    expect(wrapper.find('.titlebar-title-name').text()).toBe('notes.md')
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

  it('renders the trimmed navigation clusters (C-40 T-002)', async () => {
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
    // Amendment 5: left = menu + sidebar toggle + gear on Win/Linux
    // mounts (Files/TOC were gone since C-40 T-002).
    const navBtns = wrapper.findAll('.titlebar-nav .titlebar-nav-btn')
    expect(navBtns.length).toBe(3)
    // right cluster after amendment 3: Share only — this mount mocks
    // isOsx=false, so theme rides the caption row and the guide button
    // is gone everywhere.
    const rightBtns = wrapper.findAll('.titlebar-right .titlebar-nav-btn')
    expect(rightBtns.length).toBe(1)
    expect(rightBtns[0].attributes('title')).toBe('titleBar.share')
    expect(wrapper.find('.frameless-titlebar-theme').exists()).toBe(true)
  })

  it('shows share button when pathname is set', async () => {
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
    expect(wrapper.find('.titlebar-share-btn').exists()).toBe(true)
  })

  it('hides share button when no pathname', async () => {
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
    expect(wrapper.find('.titlebar-share-btn').exists()).toBe(false)
  })

  it('share button click invokes mt_share_file', async () => {
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
    await wrapper.find('.titlebar-share-btn').trigger('click')
    await vi.dynamicImportSettled()
    const { invoke } = await import('@tauri-apps/api/core')
    expect(invoke).toHaveBeenCalledWith('mt_share_file', { path: '/tmp/test.md' })
  })

  // 2026-11-09 wall-pierce guard: muya's table side-wall handles inject
  // z-index 3 into the ROOT stacking context (no ancestor of the editor
  // creates one), so at the bar's old z-index 2 they painted through
  // the quick-settings and doc-info popovers the bar owns. The bar must
  // stay above the walls (6) yet below the image-viewer overlay (11).
  // Style blocks are not mounted, so the guard reads the SFC source.
  it('keeps the bar stacked above the table wall handles (z 6 > 3)', () => {
    const src = readFileSync(
      resolve('src/renderer/src/components/titleBar/index.vue'),
      'utf8'
    )
    const bar = src.match(/\.title-bar\s*\{[\s\S]*?\}/)
    expect(bar).toBeTruthy()
    expect(bar[0]).toMatch(/z-index:\s*6/)
  })
})
