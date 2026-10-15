/**
 * C-9 pinned the responsive breadcrumb structure; C-40 T-002 removed the
 * breadcrumb (and the word count) from the title bar entirely. These
 * tests pin the replacement structure — the flex-centred title between
 * the nav/right clusters with ellipsis clipping — plus the surviving
 * C-9/C-15 gestures (dblclick zoom guard, drag region) as CSS/source
 * pins, since jsdom cannot lay out flex clipping.
 */
// FILE: tests/renderer/components/titleBar-resize.test.js
// VERSION: 2.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin the C-40 T-002 title structure (flex-centred title button, ellipsis clipping, no breadcrumb/word count) and the dblclick zoom guard.
//   SCOPE: component structure assertions + SFC source pins.
//   DEPENDS: @/components/titleBar/index.vue, test pinia
//   LINKS: M-011, V-M-011 scenario-25 (C-9, superseded), scenario-53 (C-40 T-002)
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   i18n - shared vue-i18n instance for component mounts
//   ROOT - repo root resolver for SFC source pins
//   mountTitleBar - mount titleBar with a saved-file fixture
//   readSfc - read the titleBar SFC source for CSS pins
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-10-15 v2.0.0: C-40 T-002 — the breadcrumb left the title bar;
//     the pins now cover the flex-centred title button (max-width +
//     ellipsis, shrink-proof save dot/chevron) and the updated dblclick
//     guard selector list (.titlebar-right replaces .titlebar-aux).
//   - 2026-09-16 v1.0.0: C-9 breadcrumb clearance pins (superseded).
// END_CHANGE_SUMMARY
import { shallowMount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
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

globalThis.__APP_VERSION__ = '2.0.0-test'

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: {} } })

const ROOT = resolve(__dirname, '..', '..', '..')
const readSfc = () =>
  readFileSync(resolve(ROOT, 'src/renderer/src/components/titleBar/index.vue'), 'utf-8')

const mountTitleBar = async () => {
  const pinia = setupTestPinia()
  const TitleBar = (await import('@/components/titleBar/index.vue')).default
  return shallowMount(TitleBar, {
    props: {
      project: null,
      filename: 'rich.md',
      pathname: '/private/tmp/mark-qa-c6/rich.md',
      active: true,
      wordCount: { word: 292, character: 1500, paragraph: 5, all: 1600 },
      markdown: '# rich\n',
      platform: 'darwin',
      isSaved: false
    },
    global: {
      plugins: [pinia, i18n],
      stubs: { ElTooltip: true }
    }
  })
}

describe('titleBar title structure (C-40 T-002)', () => {
  it('centres the title button between the clusters instead of a breadcrumb', async () => {
    const wrapper = await mountTitleBar()
    expect(wrapper.find('.titlebar-title-btn').exists()).toBe(true)
    expect(wrapper.find('.titlebar-title-name').text()).toBe('rich.md')
    // The old breadcrumb pieces are gone entirely.
    expect(wrapper.find('.title-breadcrumb').exists()).toBe(false)
    expect(wrapper.find('.title-path').exists()).toBe(false)
    expect(wrapper.find('.word-count').exists()).toBe(false)
    // The unsaved dot is still visible for a dirty tab.
    expect(wrapper.find('.titlebar-title-btn .save-dot.show').exists()).toBe(true)
  })
})

describe('titleBar CSS pins (C-40 T-002)', () => {
  it('.title is the flexible centre with clipping; the name ellipsizes', () => {
    const css = readSfc()
    expect(css).toMatch(/\.title \{[\s\S]*?flex: 1 1 auto/)
    expect(css).toMatch(/\.title \{[\s\S]*?min-width: 0/)
    expect(css).toMatch(/\.title \{[\s\S]*?overflow: hidden/)
    expect(css).toMatch(/\.titlebar-title-btn \{[\s\S]*?max-width: min\(420px, 100%\)/)
    expect(css).toMatch(/\.titlebar-title-name \{[\s\S]*?text-overflow: ellipsis/)
  })

  it('the save dot and chevron never shrink out of the title button', () => {
    const css = readSfc()
    expect(css).toMatch(/\.save-dot \{[\s\S]*?flex-shrink: 0/)
    expect(css).toMatch(/\.titlebar-title-chevron \{[\s\S]*?flex-shrink: 0/)
  })

  it('the macOS bar clears the traffic lights via padding (no absolute nav shift)', () => {
    const css = readSfc()
    expect(css).toMatch(/\.title-bar\.isOsx \{[\s\S]*?padding-left: 86px/)
    // The C-9/C-38 clearance hacks are gone with the breadcrumb.
    expect(css).not.toMatch(/left: 222px/)
    expect(css).not.toMatch(/padding: 0 142px;/)
  })

  it('pins the dblclick zoom guard: handler on .title-bar, guard excludes every interactive zone', () => {
    const css = readSfc()
    // The gesture lives on the whole bar...
    expect(css).toMatch(/@dblclick\.stop="handleTitleBarDblclick"/)
    // ...and the guard opts out every interactive container, including the
    // renamed right cluster (was .titlebar-aux) and the popover (which
    // carries .title-no-drag).
    expect(css).toMatch(
      /handleTitleBarDblclick[\s\S]*?closest\('\.title-no-drag, \.titlebar-nav, \.titlebar-right, \.right-toolbar'\)/
    )
  })
})
