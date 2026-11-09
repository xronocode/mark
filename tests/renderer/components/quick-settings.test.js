// FILE: tests/renderer/components/quick-settings.test.js
// VERSION: 1.1.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin the C-PAGE-WIDTH-TABLES panel wave (M-061) — the titlebar quick-settings shell (T-003), the Page tab arithmetic (T-004), the View tab theme mode + 17-family grid + the R-4 per-document override pin (T-005) and the Tables tab preferences (T-006): C-38 composition with the neutral palette, dark active-segment fix living in the SHARED segmented component (never forked), outside-click close vs inside-keep, per-unit presets with the 10% snap and the nearest-preset anchor, the 12-36 zoom-shared font range, the scope switch writing global vs per-document tiers, the footer naming the live global default, and the two table preference keys.
//   SCOPE: Vue/jsdom component tests over the real components with the real en locale and the real theme factories; util/pageWidthStore is mocked at the IO boundary (load/save spies) so the persistence contract asserted here is the calls the tabs make, not the prefs transport (pinned by tests/renderer/util/page-width-store.test.js).
//   DEPENDS: Vitest, Vue Test Utils, setupTestPinia, static/locales/en.json, the quickSettings components, prefComponents/common/segmented, util/pageWidth.js constants.
//   LINKS: .grace/changes/active/C-PAGE-WIDTH-TABLES (plan T-003/T-004/T-005/T-006, corners C-4/C-5/C-6); components/titleBar/quickSettings/*; prefComponents/common/segmented (the dark active-segment contrast fix); util/pageWidth.js; store/preferences.js (the T-006 keys).
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   mountShell / mountPageTab / mountViewTab / mountTablesTab - mount helpers over the real components (real en locale, active test pinia).
//   flush - nextTick + promise microtask drain for the async load paths.
//   enMessages - the shipped static/locales/en.json (the tabs render the real copy).
//   i18n - the vue-i18n instance carrying enMessages.
//   loadPageWidthFor - the pageWidthStore load spy the vi.mock forwards to (entry fixtures per test).
//   savePageWidth - the pageWidthStore save spy the vi.mock forwards to (call-argument pins).
//   mountShell - mount the quick-settings shell over the real components (real en locale, active test pinia).
//   mountPageTab - mount the Page tab with a pathname/entry fixture.
//   mountViewTab - mount the View tab with a pathname/entry fixture.
//   mountTablesTab - mount the Tables tab.
//   clickSegment - segmented-row interaction helper (click the button whose trimmed text matches).
//   switchAt - the Nth role=switch button of a mounted tab.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.1.0 - 2026-11-02 C-PAGE-WIDTH-TABLES T-010: the
//   quick-settings:open bus entry point — the shell opens the panel with
//   the requested tab and ignores a repeat emit while open; this is the
//   View › Page Width › Custom… route (view.page-width.custom).
//   PREV: v1.0.0 - 2026-11-02 C-PAGE-WIDTH-TABLES T-003..T-006:
//   new suite. Shell: open/close semantics (inside never closes, outside
//   mousedown and Escape do), data-darkmode parity, footer → the real
//   Settings window, the dark active-segment fix pinned in the shared
//   segmented source and absent from the panel sources. Page tab:
//   per-unit presets + Full window, unit conversion snapping 768px →
//   80ch, the nearest-preset anchor mark, per-unit stepper bounds, the
//   12-36 font range through APPLY_FONT_SIZE, line height writes, the
//   scope switch tiers (global editorLineWidth vs per-document
//   savePageWidth), untitled forced global, footer's live default. View
//   tab: titlebar cycle semantics, 17 family tiles, the R-4 pin writing
//   themeOverride (and surviving a global mode change untouched). Tables
//   tab: tableFullWidthDefault tri-state and rememberTableColumnSizes.
// END_CHANGE_SUMMARY

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { setupTestPinia } from '../pinia'
import { createI18n } from 'vue-i18n'
import { UNIT_BOUNDS, UNIT_PRESETS } from '@/util/pageWidth'
// The components import @/util (isOsx) at module scope, which reads the
// window globals the test setup installs per test — the components load
// DYNAMICALLY inside the tests (see the mount helpers). The first load
// carries the whole tree's transform, so the file-level budget covers it.
vi.setConfig({ testTimeout: 20000 })

// The persistence boundary: the tabs must make the RIGHT calls; the
// prefs transport itself is pinned by page-width-store.test.js.
const loadPageWidthFor = vi.fn(async () => null)
const savePageWidth = vi.fn(async () => true)

vi.mock('@/util/pageWidthStore', () => ({
  loadPageWidthFor: (...args) => loadPageWidthFor(...args),
  savePageWidth: (...args) => savePageWidth(...args)
}))

// Config is imported for isDarkTheme/theme ids (real — window.path is
// installed by the test setup; the theme factories are pure strings).
const enMessages = JSON.parse(readFileSync(resolve('static/locales/en.json'), 'utf8'))

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: { en: enMessages }
})

const flush = async () => {
  await flushPromises()
}

const mountShell = async (pathname = '/tmp/doc.md') => {
  const QuickSettings = (await import('@/components/titleBar/quickSettings/index.vue')).default
  const wrapper = mount(QuickSettings, {
    props: { pathname },
    global: { plugins: [i18n] }
  })
  await flush()
  return wrapper
}

const mountPageTab = async ({ pathname = '/tmp/doc.md', entry = null } = {}) => {
  loadPageWidthFor.mockResolvedValue(entry)
  const PageTab = (await import('@/components/titleBar/quickSettings/pageTab.vue')).default
  const wrapper = mount(PageTab, {
    props: { pathname },
    global: { plugins: [i18n] }
  })
  await flush()
  return wrapper
}

const mountViewTab = async ({ pathname = '/tmp/doc.md', entry = null } = {}) => {
  loadPageWidthFor.mockResolvedValue(entry)
  const ViewTab = (await import('@/components/titleBar/quickSettings/viewTab.vue')).default
  const wrapper = mount(ViewTab, {
    props: { pathname },
    global: { plugins: [i18n] }
  })
  await flush()
  return wrapper
}

const mountTablesTab = async () => {
  const TablesTab = (await import('@/components/titleBar/quickSettings/tablesTab.vue')).default
  const wrapper = mount(TablesTab, {
    global: { plugins: [i18n] }
  })
  await flush()
  return wrapper
}

// The segmented rows render <button class="pref-segment"> per option.
const clickSegment = (wrapper, text, scope = null) => {
  const root = scope || wrapper
  const btn = root.findAll('button.pref-segment').find((b) => b.text().trim() === text)
  expect(btn, `segment "${text}"`).toBeTruthy()
  return btn.trigger('click')
}

const switchAt = (wrapper, index) => wrapper.findAll('button[role="switch"]')[index]

describe('quick settings shell (T-003, corner C-4)', () => {
  beforeEach(() => {
    setupTestPinia()
    loadPageWidthFor.mockReset().mockResolvedValue(null)
    savePageWidth.mockReset().mockResolvedValue(true)
  })

  it('mounts the «Aa» text-glyph button and opens the panel on click', async () => {
    const wrapper = await mountShell()
    const btn = wrapper.find('.quick-settings-btn')
    expect(btn.exists()).toBe(true)
    expect(btn.classes()).toContain('titlebar-nav-btn')
    // The owner's 2026-11-09 glyph (third pass): «Aa» as a system-font
    // text glyph — drawn svg attempts (lucide 24-grid, chrome 16-grid)
    // failed typographic quality; chevrons-left-right read as "code
    // view" beside the source chip.
    expect(btn.find('.qs-aa').text()).toBe('Aa')

    expect(wrapper.find('.quick-settings-popover').exists()).toBe(false)
    await btn.trigger('click')
    expect(wrapper.find('.quick-settings-popover').exists()).toBe(true)
    // Three live tabs (Page / View / Tables).
    expect(wrapper.findAll('.quick-tab')).toHaveLength(3)
  })

  it('opens on the quick-settings:open bus event with the requested tab (T-010 Custom…)', async () => {
    // View › Page Width › Custom… (the view.page-width.custom command)
    // opens the panel through this bus event; the shell keeps owning
    // open/close, the command owns nothing but the emit.
    const bus = (await import('@/bus')).default
    const wrapper = await mountShell()
    expect(wrapper.find('.quick-settings-popover').exists()).toBe(false)

    bus.emit('quick-settings:open', { tab: 'view' })
    await flush()
    const panel = wrapper.find('.quick-settings-popover')
    expect(panel.exists()).toBe(true)
    // The requested tab is the active one (the View tab chip highlighted).
    expect(wrapper.findAll('.quick-tab')[1].classes()).toContain('quick-tab--active')

    // Opening again while open is a no-op (no tab reset), and the
    // event without a payload lands on the Page tab.
    bus.emit('quick-settings:open', undefined)
    await flush()
    expect(wrapper.find('.quick-settings-popover').exists()).toBe(true)
    expect(wrapper.findAll('.quick-tab')[1].classes()).toContain('quick-tab--active')
  })

  it('carries the data-darkmode attribute following the theme member', async () => {
    const { usePreferencesStore } = await import('@/store/preferences')
    const preferencesStore = usePreferencesStore()
    const wrapper = await mountShell()
    const btn = wrapper.find('.quick-settings-btn')
    await btn.trigger('click')
    expect(wrapper.find('.quick-settings-popover').attributes('data-darkmode')).toBe('false')

    // 'ink' is the dark member of the Paper family (railscasts
    // classification) — the panel follows the MEMBER, not the theme name.
    preferencesStore.theme = 'ink'
    await flush()
    expect(wrapper.find('.quick-settings-popover').attributes('data-darkmode')).toBe('true')
  })

  it('keeps the panel open on inner interactions and closes it on outside mousedown and Escape', async () => {
    const wrapper = await mountShell()
    await wrapper.find('.quick-settings-btn').trigger('click')
    const panel = wrapper.find('.quick-settings-popover')
    expect(panel.exists()).toBe(true)

    // Inner interactions never close it (tab switches included).
    await wrapper.findAll('.quick-tab')[1].trigger('click')
    expect(wrapper.find('.quick-settings-popover').exists()).toBe(true)

    // Outside click closes (window capture-phase mousedown, the
    // doc-info-popover precedent).
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    await flush()
    expect(wrapper.find('.quick-settings-popover').exists()).toBe(false)

    // Escape closes too.
    await wrapper.find('.quick-settings-btn').trigger('click')
    expect(wrapper.find('.quick-settings-popover').exists()).toBe(true)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await flush()
    expect(wrapper.find('.quick-settings-popover').exists()).toBe(false)
  })

  it('the footer row opens the real Settings window and closes the panel', async () => {
    const { useProjectStore } = await import('@/store/project')
    const projectStore = useProjectStore()
    const spy = vi.spyOn(projectStore, 'OPEN_SETTING_WINDOW').mockResolvedValue(undefined)
    const wrapper = await mountShell()
    await wrapper.find('.quick-settings-btn').trigger('click')
    await wrapper.find('.quick-openall').trigger('click')
    expect(spy).toHaveBeenCalledTimes(1)
    expect(wrapper.find('.quick-settings-popover').exists()).toBe(false)
  })

  it('the dark active-segment contrast fix lives in the shared segmented component, never forked into the panel', async () => {
    const segmentedSource = readFileSync(
      resolve('src/renderer/src/prefComponents/common/segmented/index.vue'),
      'utf8'
    )
    expect(segmentedSource).toContain('body.dark .pref-segmented-item.pref-os-mac .pref-segment.is-active')
    expect(segmentedSource).toContain('#5a5a60')
    expect(segmentedSource).toContain('rgba(255, 255, 255, 0.16)')
    // The is-near anchor mark ships with the shared component too.
    expect(segmentedSource).toContain('is-near')

    for (const file of [
      'src/renderer/src/components/titleBar/quickSettings/index.vue',
      'src/renderer/src/components/titleBar/quickSettings/pageTab.vue',
      'src/renderer/src/components/titleBar/quickSettings/viewTab.vue',
      'src/renderer/src/components/titleBar/quickSettings/tablesTab.vue'
    ]) {
      const source = readFileSync(resolve(file), 'utf8')
      expect(source, file).not.toContain('#5a5a60')
    }
  })

  it('the shared segmented renders the markedValue anchor as is-near without stealing the active state', async () => {
    const SegmentedRow = (await import('@/prefComponents/common/segmented/index.vue')).default
    const wrapper = mount(SegmentedRow, {
      props: {
        description: 'Preset',
        value: 700,
        markedValue: 750,
        options: [
          { value: 600, label: '600' },
          { value: 750, label: '750' },
          { value: 900, label: '900' },
          { value: 'full', label: 'Full window' }
        ],
        onChange: vi.fn()
      },
      global: { plugins: [i18n] }
    })
    const near = wrapper.findAll('.pref-segment').find((b) => b.text() === '750')
    expect(near.classes()).toContain('is-near')
    expect(near.classes()).not.toContain('is-active')
    expect(near.attributes('aria-checked')).toBe('false')
  })
})

describe('page tab (T-004, corners C-2/C-3/C-5)', () => {
  beforeEach(() => {
    setupTestPinia()
    loadPageWidthFor.mockReset().mockResolvedValue(null)
    savePageWidth.mockReset().mockResolvedValue(true)
  })

  it('seeds from the global setting and shows the per-unit presets plus Full window', async () => {
    const { usePreferencesStore } = await import('@/store/preferences')
    const preferencesStore = usePreferencesStore()
    preferencesStore.editorLineWidth = '80ch'
    const wrapper = await mountPageTab({ pathname: '' })
    expect(wrapper.text()).toContain('80 ch')

    const labels = wrapper.findAll('button.pref-segment').map((b) => b.text().trim())
    // The ch preset set (60/80/110) plus the always-present Full window.
    expect(labels).toEqual(expect.arrayContaining(['60', '80', '110', 'Full window']))
    // The active preset is 80 (exact match, no anchor mark needed).
    const active = wrapper.findAll('button.pref-segment.is-active').map((b) => b.text().trim())
    expect(active).toContain('80')
  })

  it('presets follow the unit: px 600/750/900, % 60/80/100, ch 60/80/110', async () => {
    const { UNIT_PRESETS_KEYS } = { UNIT_PRESETS_KEYS: Object.keys(UNIT_PRESETS) }
    expect(UNIT_PRESETS_KEYS.sort()).toEqual(['%', 'ch', 'px'].sort())
    expect(UNIT_PRESETS.ch).toEqual([60, 80, 110])
    expect(UNIT_PRESETS.px).toEqual([600, 750, 900])
    expect(UNIT_PRESETS['%']).toEqual([60, 80, 100])

    const wrapper = await mountPageTab({ pathname: '' })
    await clickSegment(wrapper, 'px')
    await flush()
    let labels = wrapper.findAll('button.pref-segment').map((b) => b.text().trim())
    expect(labels).toEqual(expect.arrayContaining(['600', '750', '900', 'Full window']))

    await clickSegment(wrapper, '%')
    await flush()
    labels = wrapper.findAll('button.pref-segment').map((b) => b.text().trim())
    expect(labels).toEqual(expect.arrayContaining(['60%', '80%', '100%', 'Full window']))
  })

  it('converts on unit switch with the 10% snap (768px → 80 ch) and updates the store tier', async () => {
    const { usePreferencesStore } = await import('@/store/preferences')
    const preferencesStore = usePreferencesStore()
    const wrapper = await mountPageTab({ pathname: '' })
    // Seeded 768px (the shipped default); switching to ch converts
    // 768/9.375 ≈ 82 and snaps onto the 80 preset.
    await clickSegment(wrapper, 'ch')
    await flush()
    expect(wrapper.text()).toContain('80 ch')
    expect(preferencesStore.editorLineWidth).toBe('80ch')
  })

  it('marks the nearest preset as the anchor for a non-preset value', async () => {
    const wrapper = await mountPageTab({
      pathname: '/tmp/doc.md',
      entry: { value: 700, unit: 'px', themeOverride: null, savedAt: 1 }
    })
    const near = wrapper.findAll('button.pref-segment').find((b) => b.text().trim() === '750')
    expect(near).toBeTruthy()
    expect(near.classes()).toContain('is-near')
    // No preset is active for a custom value.
    const actives = wrapper.findAll('button.pref-segment.is-active').map((b) => b.text().trim())
    expect(actives).not.toContain('750')
  })

  it('stepper bounds follow the unit', async () => {
    const RangeRow = (await import('@/prefComponents/common/range/index.vue')).default
    const wrapper = await mountPageTab({ pathname: '' })
    const boundsRows = () =>
      wrapper.findAllComponents(RangeRow).map((c) => [c.props('min'), c.props('max')])

    expect(boundsRows()[0]).toEqual(UNIT_BOUNDS.px)
    await clickSegment(wrapper, 'ch')
    await flush()
    expect(boundsRows()[0]).toEqual(UNIT_BOUNDS.ch)
    await clickSegment(wrapper, '%')
    await flush()
    expect(boundsRows()[0]).toEqual(UNIT_BOUNDS['%'])
  })

  it('Full window switches to the {100,%} sentinel, shows the verbatim label and disables the stepper', async () => {
    const RangeRow = (await import('@/prefComponents/common/range/index.vue')).default
    const { usePreferencesStore } = await import('@/store/preferences')
    const preferencesStore = usePreferencesStore()
    const wrapper = await mountPageTab({ pathname: '' })
    await clickSegment(wrapper, 'Full window')
    await flush()

    const widthRow = wrapper.findAllComponents(RangeRow)[0]
    expect(widthRow.props('displayText')).toBe(enMessages.quickSettings.page.fullWindow)
    expect(widthRow.props('disable')).toBe(true)
    // The sentinel persists through the ordinary grammar.
    expect(preferencesStore.editorLineWidth).toBe('100%')
  })

  it('the scope switch writes the per-document tier when off and the global tier when on', async () => {
    const { usePreferencesStore } = await import('@/store/preferences')
    const preferencesStore = usePreferencesStore()
    const singlePref = vi.spyOn(preferencesStore, 'SET_SINGLE_PREFERENCE')

    const wrapper = await mountPageTab({ pathname: '/tmp/doc.md' })

    // Off (per-document): picking 900 saves the entry, not the global key.
    await clickSegment(wrapper, '900')
    await flush()
    expect(savePageWidth).toHaveBeenCalledWith('/tmp/doc.md', { value: 900, unit: 'px' })
    expect(singlePref.mock.calls.filter(([a]) => a.type === 'editorLineWidth')).toHaveLength(0)

    // On (global): the same width moves to editorLineWidth and the
    // per-document entry is removed (the switch semantics).
    await switchAt(wrapper, 0).trigger('click')
    await flush()
    const widthWrite = singlePref.mock.calls.find(([a]) => a.type === 'editorLineWidth')
    expect(widthWrite).toBeTruthy()
    expect(widthWrite[0].value).toBe('900px')
    expect(savePageWidth).toHaveBeenCalledWith('/tmp/doc.md', null)
  })

  it('untitled documents are forced global and the switch names that scope', async () => {
    const { usePreferencesStore } = await import('@/store/preferences')
    const preferencesStore = usePreferencesStore()
    const singlePref = vi.spyOn(preferencesStore, 'SET_SINGLE_PREFERENCE')
    const wrapper = await mountPageTab({ pathname: '' })

    const scopeSwitch = switchAt(wrapper, 0)
    expect(scopeSwitch.attributes('aria-disabled')).toBe('true')

    await clickSegment(wrapper, '600')
    await flush()
    const widthWrite = singlePref.mock.calls.find(([a]) => a.type === 'editorLineWidth')
    expect(widthWrite[0].value).toBe('600px')
    expect(savePageWidth).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain(enMessages.quickSettings.page.scopeHelpUntitled)
  })

  it('the footer names the live global default, never a hardcoded 750/768', async () => {
    const { usePreferencesStore } = await import('@/store/preferences')
    const preferencesStore = usePreferencesStore()
    preferencesStore.editorLineWidth = '640px'
    const wrapper = await mountPageTab({ pathname: '' })
    expect(wrapper.text()).toContain('640 px')

    preferencesStore.editorLineWidth = ''
    await flush()
    expect(wrapper.text()).toContain('768 px')
  })

  it('reset removes the active override and falls back to the theme default', async () => {
    const { usePreferencesStore } = await import('@/store/preferences')
    const preferencesStore = usePreferencesStore()
    preferencesStore.editorLineWidth = '900px'
    const singlePref = vi.spyOn(preferencesStore, 'SET_SINGLE_PREFERENCE')

    // Global scope reset → editorLineWidth '' (the honest theme default).
    const wrapper = await mountPageTab({ pathname: '' })
    await wrapper.find('.linkish').trigger('click')
    await flush()
    const reset = singlePref.mock.calls.find(([a]) => a.type === 'editorLineWidth')
    expect(reset[0].value).toBe('')

    // Document scope reset → the per-document entry is removed.
    savePageWidth.mockClear()
    const docWrapper = await mountPageTab({
      pathname: '/tmp/doc.md',
      entry: { value: 900, unit: 'px', themeOverride: null, savedAt: 1 }
    })
    await docWrapper.find('.linkish').trigger('click')
    await flush()
    expect(savePageWidth).toHaveBeenCalledWith('/tmp/doc.md', null)
  })

  it('font size rides the 12-36 zoom-shared APPLY_FONT_SIZE and line height writes its preference', async () => {
    const RangeRow = (await import('@/prefComponents/common/range/index.vue')).default
    const { usePreferencesStore } = await import('@/store/preferences')
    const preferencesStore = usePreferencesStore()
    const applyFont = vi.spyOn(preferencesStore, 'APPLY_FONT_SIZE')
    const singlePref = vi.spyOn(preferencesStore, 'SET_SINGLE_PREFERENCE')

    const wrapper = await mountPageTab({ pathname: '' })
    const ranges = wrapper.findAllComponents(RangeRow)
    // The font row carries the single 12-36 range shared with zoom.
    expect(ranges[1].props('min')).toBe(12)
    expect(ranges[1].props('max')).toBe(36)
    const fontRow = ranges[1].find('.pref-stepper')
    await fontRow.find('button[aria-label="Increase"]').trigger('click')
    expect(applyFont).toHaveBeenCalledWith(17)

    const lineHeightRow = ranges[2].find('.pref-stepper')
    await lineHeightRow.find('button[aria-label="Increase"]').trigger('click')
    const lhWrite = singlePref.mock.calls.find(([a]) => a.type === 'lineHeight')
    expect(lhWrite[0].value).toBeCloseTo(1.7, 5)
  })
})

describe('view tab (T-005, corners C-1/C-6)', () => {
  beforeEach(() => {
    setupTestPinia()
    loadPageWidthFor.mockReset().mockResolvedValue(null)
    savePageWidth.mockReset().mockResolvedValue(true)
  })

  it('renders all 17 family tiles from the shipped theme CSS', async () => {
    const { THEME_FAMILIES } = await import('@/util/themeFamilies')
    const { familySwatchColors } = await import('@/util/themeSwatchColors')
    const wrapper = await mountViewTab({ pathname: '' })
    const tiles = wrapper.findAll('.theme-family-tile')
    expect(tiles).toHaveLength(17)
    expect(tiles.length).toBe(THEME_FAMILIES.length)
    // Every tile paints both member halves (the Aa + accent bar anatomy)
    // carrying a family id and a name.
    for (const tile of tiles) {
      expect(tile.findAll('.family-half')).toHaveLength(2)
      expect(tile.findAll('.family-accent-bar')).toHaveLength(2)
      expect(tile.attributes('data-family')).toBeTruthy()
      expect(tile.find('.family-name').text()).toBeTruthy()
    }
    // The tile colours are parsed from the SHIPPED theme CSS (the
    // memoized parser — never a second palette table): each family
    // resolves real background/fg/accent values.
    for (const family of THEME_FAMILIES) {
      const colors = familySwatchColors(family)
      for (const member of [colors.light, colors.dark]) {
        expect(member.bg).toMatch(/^(#|rgb|var)/)
        expect(member.fg).toMatch(/^(#|rgb|var)/)
        expect(member.accent).toMatch(/^(#|rgb|var)/)
      }
    }
  })

  it('the mode segmented follows the titlebar cycle semantics', async () => {
    const { usePreferencesStore } = await import('@/store/preferences')
    const preferencesStore = usePreferencesStore()
    // Defaults: Auto (followSystemTheme on).
    expect(preferencesStore.followSystemTheme).toBe(true)
    const wrapper = await mountViewTab({ pathname: '' })

    // Dark: followSystemTheme off + the manual dark member.
    await clickSegment(wrapper, enMessages.quickSettings.view.modeDark)
    await flush()
    expect(preferencesStore.followSystemTheme).toBe(false)
    expect(preferencesStore.theme).toBe(preferencesStore.darkModeTheme)

    // Auto again: followSystemTheme back on.
    await clickSegment(wrapper, enMessages.quickSettings.view.modeAuto)
    await flush()
    expect(preferencesStore.followSystemTheme).toBe(true)
  })

  it('a family pick writes the same preferences the Appearance tab writes', async () => {
    const { usePreferencesStore } = await import('@/store/preferences')
    const preferencesStore = usePreferencesStore()
    const wrapper = await mountViewTab({ pathname: '' })

    const githubTile = wrapper.find('.theme-family-tile[data-family="github"]')
    await githubTile.trigger('click')
    await flush()
    expect(preferencesStore.lightModeTheme).toBe('github')
    expect(preferencesStore.darkModeTheme).toBe('github-dark')
    // The current mode is dark (previous test state does not leak —
    // fresh store each test), so the light member applies for Auto
    // resolution... Auto resolves via prefers-color-scheme; assert the
    // theme is a member of the picked family.
    expect(['github', 'github-dark']).toContain(preferencesStore.theme)
  })

  it('the R-4 switch pins the document and a global mode change leaves the pin untouched', async () => {
    const { usePreferencesStore } = await import('@/store/preferences')
    const preferencesStore = usePreferencesStore()
    const wrapper = await mountViewTab({
      pathname: '/tmp/doc.md',
      entry: { value: 900, unit: 'px', themeOverride: null, savedAt: 1 }
    })

    // Pin ON: the current theme snapshots into the entry's themeOverride.
    await switchAt(wrapper, 0).trigger('click')
    await flush()
    expect(savePageWidth).toHaveBeenCalledWith('/tmp/doc.md', {
      value: 900,
      unit: 'px',
      themeOverride: preferencesStore.theme
    })
    const pinnedTheme = preferencesStore.theme

    // The tile selection now follows the pinned theme.
    savePageWidth.mockClear()
    expect(wrapper.find('.theme-family-tile.is-selected').attributes('data-family')).toBe(
      // 'paper' family id for the paper/ink pair
      'paper'
    )

    // Corner C-6: cycling the global mode while pinned is a no-op for
    // the document's stored theme — no second save, same override.
    await clickSegment(wrapper, enMessages.quickSettings.view.modeDark)
    await flush()
    expect(savePageWidth).not.toHaveBeenCalled()

    // Pin OFF: the width stays, the override clears.
    await switchAt(wrapper, 0).trigger('click')
    await flush()
    expect(savePageWidth).toHaveBeenCalledWith('/tmp/doc.md', {
      value: 900,
      unit: 'px',
      themeOverride: null
    })
    expect(pinnedTheme).toBe('paper')
  })

  it('the source line names the pinned family and scope', async () => {
    const wrapper = await mountViewTab({
      pathname: '/tmp/doc.md',
      entry: { value: 900, unit: 'px', themeOverride: 'ink', savedAt: 1 }
    })
    expect(wrapper.text()).toContain(
      enMessages.quickSettings.view.sourcePinned.replace('{family}', 'Paper')
    )
  })
})

describe('tables tab (T-006)', () => {
  beforeEach(() => {
    setupTestPinia()
    loadPageWidthFor.mockReset().mockResolvedValue(null)
    savePageWidth.mockReset().mockResolvedValue(true)
  })

  it('ships Auto as the default table mode and true as the sizes-memory default', async () => {
    const { usePreferencesStore } = await import('@/store/preferences')
    const preferencesStore = usePreferencesStore()
    expect(preferencesStore.tableFullWidthDefault).toBe('auto')
    expect(preferencesStore.rememberTableColumnSizes).toBe(true)

    const wrapper = await mountTablesTab()
    const active = wrapper.findAll('button.pref-segment.is-active').map((b) => b.text().trim())
    expect(active).toEqual([enMessages.quickSettings.tables.modeAuto])
    expect(switchAt(wrapper, 0).attributes('aria-checked')).toBe('true')
    // The owner terminology correction: "column sizes", never "widths".
    expect(wrapper.text()).toContain(enMessages.quickSettings.tables.rememberSizes)
    expect(wrapper.text().toLowerCase()).not.toContain('column widths')
  })

  it('both rows write the same preference objects the rest of the app reads', async () => {
    const { usePreferencesStore } = await import('@/store/preferences')
    const preferencesStore = usePreferencesStore()
    const singlePref = vi.spyOn(preferencesStore, 'SET_SINGLE_PREFERENCE')
    const wrapper = await mountTablesTab()

    await clickSegment(wrapper, enMessages.quickSettings.tables.modeFit)
    await flush()
    expect(preferencesStore.tableFullWidthDefault).toBe('fit')
    expect(
      singlePref.mock.calls.find(([a]) => a.type === 'tableFullWidthDefault')[0].value
    ).toBe('fit')

    await switchAt(wrapper, 0).trigger('click')
    await flush()
    expect(preferencesStore.rememberTableColumnSizes).toBe(false)
    expect(
      singlePref.mock.calls.find(([a]) => a.type === 'rememberTableColumnSizes')[0].value
    ).toBe(false)
  })
})
