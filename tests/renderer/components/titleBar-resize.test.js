/**
 * C-9: title-bar breadcrumb must never collide with the nav cluster or the
 * word count at narrow window widths. jsdom cannot lay out flex clipping,
 * so these tests pin the structure that produces the clipping (real title
 * clearances + shrinkable .title-path + non-shrinking filename) and the
 * CSS source rules themselves.
 */
// FILE: tests/renderer/components/titleBar-resize.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin the C-9 responsive breadcrumb structure and clearance rules.
//   SCOPE: component structure assertions + SFC source pins.
//   DEPENDS: @/components/titleBar/index.vue, test pinia
//   LINKS: M-011, V-M-011 scenario-25, .grace/changes/active/C-9
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   i18n - shared vue-i18n instance for component mounts
//   ROOT - repo root resolver for SFC source pins
//   mountTitleBar - mount titleBar with a 3-segment path fixture
//   readSfc - read the titleBar SFC source for CSS pins
// END_MODULE_MAP
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
      platform: 'darwin',
      isSaved: false
    },
    global: {
      plugins: [pinia, i18n],
      stubs: { ElTooltip: true }
    }
  })
}

describe('titleBar breadcrumb structure (C-9)', () => {
  it('wraps the breadcrumb in .title-breadcrumb with a shrinkable .title-path', async () => {
    const wrapper = await mountTitleBar()
    expect(wrapper.find('.title-breadcrumb').exists()).toBe(true)
    const path = wrapper.find('.title-path')
    expect(path.exists()).toBe(true)
    const segments = path.findAll('.title-path-segment')
    expect(segments.length).toBe(3)
    expect(path.text()).toContain('private')
    expect(path.text()).toContain('mark-qa-c6')
  })

  it('keeps the filename OUTSIDE the shrinkable path so it never clips', async () => {
    const wrapper = await mountTitleBar()
    const breadcrumb = wrapper.find('.title-breadcrumb')
    const filename = breadcrumb.find('.filename')
    expect(filename.exists()).toBe(true)
    expect(filename.text()).toBe('rich.md')
    // The filename is a sibling AFTER .title-path, not inside it.
    expect(filename.element.closest('.title-path')).toBeNull()
    // The save dot is also outside the clip zone.
    expect(breadcrumb.find('.save-dot').exists()).toBe(true)
  })
})

describe('titleBar CSS clearance pins (C-9)', () => {
  it('.title is absolutely positioned between real left/right clearances', () => {
    const css = readSfc()
    expect(css).toMatch(/\.title \{[\s\S]*?position: absolute/)
    expect(css).toMatch(/\.title-bar\.isOsx \.title \{[\s\S]*?left: 250px/)
    expect(css).toMatch(/\.title \{[\s\S]*?right: 150px/)
  })

  it('the path part shrinks with flex-end clipping and the filename does not shrink', () => {
    const css = readSfc()
    expect(css).toMatch(/\.title-path \{[\s\S]*?overflow: hidden/)
    expect(css).toMatch(/\.title-path \{[\s\S]*?justify-content: flex-end/)
    expect(css).toMatch(/\.title-breadcrumb \.filename \{[\s\S]*?flex-shrink: 0/)
  })

  it('the unreliable GH#339 selector and the fixed 142px padding are gone', () => {
    const css = readSfc()
    // Rule-shaped so prose mentions in comments don't false-positive.
    expect(css).not.toMatch(/div\.title > span\s*\{/)
    expect(css).not.toMatch(/padding: 0 142px;/)
  })

  it('pins the dblclick zoom guard: handler on .title-bar, guard excludes interactive zones (C-9)', () => {
    const css = readSfc()
    // The gesture lives on the whole bar...
    expect(css).toMatch(/@dblclick\.stop="handleTitleBarDblclick"/)
    // ...and the guard opts out every interactive container. (Interaction
    // itself is not jsdom-drivable here: the setup.ts window stub does not
    // intercept the component's static import in this environment.)
    expect(css).toMatch(
      /handleTitleBarDblclick[\s\S]*?closest\('\.title-no-drag, \.titlebar-nav, \.right-toolbar, \.left-toolbar'\)/
    )
  })
})
