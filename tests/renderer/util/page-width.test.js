// FILE: tests/renderer/util/page-width.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin util/pageWidth.js — the C-PAGE-WIDTH-TABLES T-002 (M-061) width resolution pipeline and canvas model: document > theme > global precedence with the source named, the ch/px/% conversion with the 10% preset snap and nearest-preset anchor, canvas = window − sidebar, the render-time clamp (min(setting, canvas − indent), 400px floor) that never mutates the stored value (corner C-2), the % recompute across canvas changes (corner C-3), the F-WINDOW-AUTO-RESIZE formula integration point, and the single inline writer with its theme-ordering guarantee (review finding F1: theme→width and width→theme both settle on the effective value).
//   SCOPE: Pure functions over plain objects plus the DOM writer and the theme.js re-apply hook in jsdom; themeColor/config are mocked lightweight (mirroring theme.test.js) so the ordering test exercises the real addThemeStyle switch logic without the 34 shipped stylesheets.
//   DEPENDS: Vitest; util/pageWidth.js; util/theme.js (addThemeStyle); @/config, @/util/themeColor, @/util/index mocked.
//   LINKS: .grace/changes/active/C-PAGE-WIDTH-TABLES (plan T-002, corners C-1/C-2/C-3, findings F1/F2/F6); util/pageWidth.js; util/theme.js addThemeStyle; tests/renderer/util/editor-width-default.test.js (the 768px lockstep this suite's default arithmetic mirrors).
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   loadPipeline - lazy import of util/pageWidth.js.
//   loadTheme - lazy import of util/theme.js after the lightweight mocks.
//   aWidth - { value, unit } fixture factory.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-11-02 C-PAGE-WIDTH-TABLES T-002 (M-061):
//   new suite — precedence and source naming, parse/sanitize, presets
//   snap/anchor/bounds, canvas and rendered-box arithmetic (clamped never
//   mutates), effective resolution, the auto-resize formula point, and
//   the writer's inline property + theme-switch ordering guarantee.
// END_CHANGE_SUMMARY

// Mock the config module (mirrors theme.test.js)
vi.mock('@/config', () => ({
  THEME_STYLE_ID: 'ag-theme',
  COMMON_STYLE_ID: 'ag-common-style',
  DEFAULT_CODE_FONT_FAMILY: '"DejaVu Sans Mono", monospace',
  oneDarkThemes: Object.freeze(['one-dark']),
  railscastsThemes: Object.freeze(['ink', 'dracula', 'nord', 'gruvbox-dark'])
}))

// Mock themeColor — the paper factory carries the real themes' locked
// --editorAreaWidth re-declaration so the ordering test reproduces the
// shipped cascade: a theme switch mirrors 768px inline mid-switch and the
// width pipeline must re-write the effective value afterwards.
vi.mock('@/util/themeColor', () => {
  const factory = (name) => () => `:root { --theme: ${name}; --editorAreaWidth: calc(100px + 768px); }`
  return {
    paper: factory('paper'),
    ink: factory('ink'),
    docs: factory('docs'),
    docsDark: factory('docsDark'),
    macos: factory('macos'),
    macosDark: factory('macosDark'),
    graphite: factory('graphite'),
    oneDark: factory('oneDark'),
    ulysses: factory('ulysses'),
    dracula: factory('dracula'),
    nord: factory('nord'),
    catppuccinMocha: factory('catppuccinMocha'),
    gruvboxDark: factory('gruvboxDark'),
    tokyoNight: factory('tokyoNight'),
    solarizedDark: factory('solarizedDark'),
    ayuDark: factory('ayuDark'),
    everforestDark: factory('everforestDark'),
    rosePine: factory('rosePine'),
    kanagawa: factory('kanagawa'),
    catppuccinLatte: factory('catppuccinLatte'),
    gruvboxLight: factory('gruvboxLight'),
    tokyoNightLight: factory('tokyoNightLight'),
    solarizedLight: factory('solarizedLight'),
    ayuLight: factory('ayuLight'),
    everforestLight: factory('everforestLight'),
    oneLight: factory('oneLight'),
    alucard: factory('alucard'),
    nordLight: factory('nordLight'),
    kanagawaLotus: factory('kanagawaLotus'),
    graphiteDark: factory('graphiteDark'),
    ulyssesDark: factory('ulyssesDark'),
    rosePineDawn: factory('rosePineDawn'),
    github: factory('github'),
    githubDark: factory('githubDark')
  }
})

// Mock util/index for isLinux
vi.mock('@/util/index', () => ({
  isLinux: false,
  isOsx: true,
  isWindows: false
}))

const loadPipeline = async () => await import('@/util/pageWidth')
const loadTheme = async () => await import('@/util/theme')

const aWidth = (value, unit) => ({ value, unit })

describe('util/pageWidth (C-PAGE-WIDTH-TABLES T-002)', () => {
  beforeEach(() => {
    document.head.innerHTML = ''
    document.body.innerHTML = ''
    document.body.className = ''
    document.documentElement.style.cssText = ''
    delete document.documentElement.__themeVars
  })

  describe('sanitizeWidth / parseWidth', () => {
    it('keeps only finite positive values in the three units, integers out', async () => {
      const { sanitizeWidth } = await loadPipeline()
      expect(sanitizeWidth(aWidth(900.6, 'px'))).toEqual({ value: 901, unit: 'px' })
      expect(sanitizeWidth(aWidth(80, 'ch'))).toEqual({ value: 80, unit: 'ch' })
      expect(sanitizeWidth(aWidth(95, '%'))).toEqual({ value: 95, unit: '%' })
      expect(sanitizeWidth(aWidth(0, 'px'))).toBeNull()
      expect(sanitizeWidth(aWidth(-3, 'px'))).toBeNull()
      expect(sanitizeWidth(aWidth('80', 'ch'))).toBeNull()
      expect(sanitizeWidth(aWidth(80, 'em'))).toBeNull()
      expect(sanitizeWidth(null)).toBeNull()
      expect(sanitizeWidth('80ch')).toBeNull()
    })

    it('parses the raw Appearance-field grammar (768px / 80ch / 95%) and rejects junk', async () => {
      const { parseWidth } = await loadPipeline()
      expect(parseWidth('768px')).toEqual({ value: 768, unit: 'px' })
      expect(parseWidth(' 80ch ')).toEqual({ value: 80, unit: 'ch' })
      expect(parseWidth('95%')).toEqual({ value: 95, unit: '%' })
      expect(parseWidth('')).toBeNull()
      expect(parseWidth('750')).toBeNull()
      expect(parseWidth('auto')).toBeNull()
      expect(parseWidth('-20px')).toBeNull()
      expect(parseWidth(null)).toBeNull()
      // Width objects pass through the sanitizer.
      expect(parseWidth(aWidth(750, 'px'))).toEqual({ value: 750, unit: 'px' })
      expect(parseWidth({ value: 'x', unit: 'px' })).toBeNull()
    })
  })

  describe('resolveWidth precedence (corner C-1)', () => {
    it('resolves document > theme > global and names the active source', async () => {
      const { resolveWidth, WIDTH_SOURCES } = await loadPipeline()
      expect(WIDTH_SOURCES.DOCUMENT).toBe('document')
      const all = resolveWidth({
        document: aWidth(900, 'px'),
        theme: aWidth(768, 'px'),
        global: aWidth(768, 'px')
      })
      expect(all).toEqual({ value: 900, unit: 'px', source: 'document' })
      const themeTier = resolveWidth({ document: null, theme: aWidth(800, 'px'), global: aWidth(768, 'px') })
      expect(themeTier).toEqual({ value: 800, unit: 'px', source: 'theme' })
      const globalTier = resolveWidth({ document: undefined, theme: null, global: aWidth(768, 'px') })
      expect(globalTier).toEqual({ value: 768, unit: 'px', source: 'global' })
    })

    it('skips invalid document/theme candidates; the empty global falls to the shipped 768px default still named global', async () => {
      const { resolveWidth, DEFAULT_GLOBAL_WIDTH } = await loadPipeline()
      expect(DEFAULT_GLOBAL_WIDTH).toEqual({ value: 768, unit: 'px' })
      // Junk document entry does not shadow the theme tier.
      const junkDoc = resolveWidth({ document: { value: NaN, unit: 'px' }, theme: aWidth(800, 'px') })
      expect(junkDoc.source).toBe('theme')
      // No entry anywhere: the shipped default, source 'global'.
      const fallback = resolveWidth({})
      expect(fallback).toEqual({ value: 768, unit: 'px', source: 'global' })
      // An invalid global falls back identically.
      expect(resolveWidth({ global: 'not-a-width' })).toEqual({ value: 768, unit: 'px', source: 'global' })
    })
  })

  describe('unit conversion with the 10% preset snap (corner C-5)', () => {
    it('converts ch⇄px on the shipped 80ch ≈ 750px identity and snaps onto presets', async () => {
      const { convertWidth, CH_TO_PX } = await loadPipeline()
      expect(CH_TO_PX).toBe(9.375)
      // 80ch → 750px exactly — the C-5 chain's first hop.
      expect(convertWidth(80, 'ch', 'px')).toEqual({ value: 750, unit: 'px', snapped: true })
      // 96ch → 900px (a preset).
      expect(convertWidth(96, 'ch', 'px')).toEqual({ value: 900, unit: 'px', snapped: true })
      // 768px → 81.92ch lands within 10% of the 80ch preset.
      expect(convertWidth(768, 'px', 'ch')).toEqual({ value: 80, unit: 'ch', snapped: true })
      // Far from every preset: no snap.
      expect(convertWidth(50, 'px', 'ch')).toEqual({ value: 5, unit: 'ch', snapped: false })
    })

    it('converts through % against the given canvas; without one the answer is null', async () => {
      const { convertWidth } = await loadPipeline()
      // 80ch → 750px → 80% on the C-5 reference canvas (750 / 937.5).
      expect(convertWidth(80, 'ch', '%', 937.5)).toEqual({ value: 80, unit: '%', snapped: true })
      // 80% → 750px on the same canvas.
      expect(convertWidth(80, '%', 'px', 937.5)).toEqual({ value: 750, unit: 'px', snapped: true })
      // % of a different canvas follows the canvas — the adaptive unit.
      // 960px lands within 10% of the 900 preset and snaps onto it;
      // 62.5% of 1200 lands within 10% of the 60 preset likewise.
      expect(convertWidth(80, '%', 'px', 1200)).toEqual({ value: 900, unit: 'px', snapped: true })
      expect(convertWidth(750, 'px', '%', 1200)).toEqual({ value: 60, unit: '%', snapped: true })
      // A %-answer far from every preset stays unsnapped
      // (480px is more than 10% away from 600/750/900).
      expect(convertWidth(40, '%', 'px', 1200)).toEqual({ value: 480, unit: 'px', snapped: false })
      // A %-touching conversion with no canvas cannot answer.
      expect(convertWidth(80, 'ch', '%')).toBeNull()
      expect(convertWidth(80, '%', 'px')).toBeNull()
      // Same-unit ch⇄px conversions never need a canvas.
      expect(convertWidth(80, 'ch', 'px')).toEqual({ value: 750, unit: 'px', snapped: true })
      // Junk in, null out.
      expect(convertWidth(0, 'px', 'ch')).toBeNull()
      expect(convertWidth(80, 'ch', 'em')).toBeNull()
    })

    it('snaps only within 10% of the preset; nearestPreset anchors non-preset values', async () => {
      const { snapToPreset, nearestPreset, isPresetValue, clampUnitValue } = await loadPipeline()
      expect(snapToPreset(78, '%')).toEqual({ value: 80, snapped: true })
      expect(snapToPreset(70, '%')).toEqual({ value: 70, snapped: false })
      expect(snapToPreset(768, 'px')).toEqual({ value: 750, snapped: true })
      expect(snapToPreset(400, 'px')).toEqual({ value: 400, snapped: false })
      // The anchor mark: the closest preset for any non-preset value.
      expect(nearestPreset('px', 768)).toBe(750)
      expect(nearestPreset('ch', 85)).toBe(80)
      expect(nearestPreset('ch', 95)).toBe(80) // tie 80/110 → the lower preset
      expect(nearestPreset('%', 65)).toBe(60)
      // Exact preset membership (checkmarks / anchor suppression).
      expect(isPresetValue('px', 750)).toBe(true)
      expect(isPresetValue('px', 768)).toBe(false)
      // Stepper bounds clamp (input guard, never the persistence path).
      expect(clampUnitValue('ch', 20)).toBe(40)
      expect(clampUnitValue('ch', 500)).toBe(130)
      expect(clampUnitValue('%', 150)).toBe(100)
      expect(clampUnitValue('px', 750)).toBe(750)
    })
  })

  describe('canvas and rendered box (corners C-2/C-3)', () => {
    it('canvas = window − sidebar, contributing only while visible', async () => {
      const { computeCanvasWidth } = await loadPipeline()
      expect(computeCanvasWidth(1480, { sidebarVisible: true, sidebarWidth: 280 })).toBe(1200)
      expect(computeCanvasWidth(1480, {})).toBe(1480)
      expect(computeCanvasWidth(1480, { sidebarVisible: true, sidebarWidth: 0 })).toBe(1480)
      expect(computeCanvasWidth(1480, { sidebarVisible: true, sidebarWidth: 220 })).toBe(1260)
      expect(computeCanvasWidth(100, { sidebarVisible: true, sidebarWidth: 280 })).toBe(0)
      expect(computeCanvasWidth(undefined)).toBe(0)
    })

    it('rendered = min(setting, canvas − indent) with the 400px box floor — and the setting input is never mutated', async () => {
      const { computeRenderedBox, EDITOR_INDENT_PX, MIN_RENDERED_BOX_PX } = await loadPipeline()
      expect(EDITOR_INDENT_PX).toBe(100)
      expect(MIN_RENDERED_BOX_PX).toBe(400)
      // 900px setting on a 1200px canvas: column 900, box 1000 (calc form).
      const roomy = computeRenderedBox(aWidth(900, 'px'), 1200)
      expect(roomy).toEqual({ boxPx: 1000, columnPx: 900, clamped: false, floored: false })
      // C-2: the same 900px setting on a 500px canvas renders canvas − indent
      // (column 400 → box 500), clamped — and the WIDTH OBJECT is untouched.
      const setting = aWidth(900, 'px')
      const snapshot = JSON.stringify(setting)
      const squeezed = computeRenderedBox(setting, 500)
      expect(squeezed.columnPx).toBe(400)
      expect(squeezed.boxPx).toBe(500)
      expect(squeezed.clamped).toBe(true)
      expect(squeezed.floored).toBe(false)
      expect(JSON.stringify(setting)).toBe(snapshot)
      // Widening the window restores the full setting with no write anywhere.
      expect(computeRenderedBox(setting, 1200).boxPx).toBe(1000)
      // A canvas smaller than the floor: the box floors at 400px.
      const tiny = computeRenderedBox(aWidth(900, 'px'), 350)
      expect(tiny.boxPx).toBe(400)
      expect(tiny.floored).toBe(true)
      // A setting smaller than the floor rides the floor too (muya min-width):
      // the floor decided, not the canvas — clamped stays false.
      const small = computeRenderedBox(aWidth(100, 'px'), 1200)
      expect(small.boxPx).toBe(400)
      expect(small.floored).toBe(true)
      expect(small.clamped).toBe(false)
      // A canvas-degenerate call answers null rather than guessing.
      expect(computeRenderedBox(aWidth(80, '%'), undefined)).toBeNull()
      expect(computeRenderedBox(null, 1200)).toBeNull()
    })

    it('a % width recomputes across canvas changes from the SAME stored value (corner C-3)', async () => {
      const { computeRenderedBox } = await loadPipeline()
      const setting = aWidth(80, '%')
      // Sidebar shown: canvas 1200 → 960px column.
      const shown = computeRenderedBox(setting, 1200)
      expect(shown.columnPx).toBe(960)
      expect(shown.boxPx).toBe(1060)
      // Sidebar hidden: canvas 1480 → 1184px column — same value object.
      const hidden = computeRenderedBox(setting, 1480)
      expect(hidden.columnPx).toBe(1184)
      expect(hidden.boxPx).toBe(1284)
      // The stored % value itself never moved.
      expect(setting).toEqual({ value: 80, unit: '%' })
    })
  })

  describe('resolveEffectiveWidth and the auto-resize integration point', () => {
    it('resolves and projects in one call with the source named', async () => {
      const { resolveEffectiveWidth } = await loadPipeline()
      const effective = resolveEffectiveWidth(
        { document: aWidth(900, 'px'), theme: aWidth(768, 'px'), global: aWidth(768, 'px') },
        1200
      )
      expect(effective).toMatchObject({
        value: 900,
        unit: 'px',
        source: 'document',
        settingPx: 900,
        columnPx: 900,
        boxPx: 1000,
        clamped: false
      })
      // No document entry → the theme tier drives; nothing anywhere → the default.
      expect(resolveEffectiveWidth({ theme: aWidth(800, 'px') }, 1200).source).toBe('theme')
      const fallback = resolveEffectiveWidth({}, 1200)
      expect(fallback.source).toBe('global')
      expect(fallback.boxPx).toBe(868) // calc(100px + 768px)
      // A %-width candidate without a canvas has no answer.
      expect(resolveEffectiveWidth({ document: aWidth(80, '%') }, undefined)).toBeNull()
    })

    it('the F-WINDOW-AUTO-RESIZE formula point: target = sidebar part + effective box, never the hardcoded 820', async () => {
      const { computeAutoResizeTargetWidth, resolveEffectiveWidth } = await loadPipeline()
      const effective = resolveEffectiveWidth({ document: aWidth(900, 'px') }, 1200)
      // Sidebar shown: 280 + 1000 = 1280 (the old code hardcoded 820 regardless).
      expect(computeAutoResizeTargetWidth(effective.boxPx, { sidebarVisible: true, sidebarWidth: 280 })).toBe(1280)
      // Sidebar hidden: just the effective box.
      expect(computeAutoResizeTargetWidth(effective.boxPx, {})).toBe(1000)
      // Junk box degrades to the sidebar part only — never a NaN target.
      expect(computeAutoResizeTargetWidth(undefined, { sidebarVisible: true, sidebarWidth: 280 })).toBe(280)
    })
  })

  describe('the writer and the theme-ordering guarantee (finding F1)', () => {
    it('reapplyLastEditorWidth is a no-op until the pipeline has applied a width', async () => {
      const { reapplyLastEditorWidth } = await loadPipeline()
      expect(reapplyLastEditorWidth()).toBe(false)
    })

    it('applyEditorWidth writes exactly one inline custom property on the editor root', async () => {
      const { applyEditorWidth, getLastAppliedEditorWidth } = await loadPipeline()
      document.documentElement.style.setProperty('--sentinel', 'keep-me')
      const applied = applyEditorWidth({ boxPx: 1000.4, source: 'document' })
      expect(applied).toEqual({ boxPx: 1000, source: 'document' })
      expect(document.documentElement.style.getPropertyValue('--editorAreaWidth')).toBe('1000px')
      // One property write — nothing else on the root moved (C-3: no content re-render surface).
      expect(document.documentElement.style.getPropertyValue('--sentinel')).toBe('keep-me')
      expect(document.documentElement.style.length).toBe(2)
      expect(getLastAppliedEditorWidth()).toEqual({ boxPx: 1000, source: 'document' })
      // Junk degrades to a no-op, not a garbage value.
      expect(applyEditorWidth({ boxPx: NaN, source: 'document' })).toBeNull()
      expect(document.documentElement.style.getPropertyValue('--editorAreaWidth')).toBe('1000px')
    })

    it('reapplyLastEditorWidth restores the effective value after the property is wiped', async () => {
      const { applyEditorWidth, reapplyLastEditorWidth } = await loadPipeline()
      applyEditorWidth({ boxPx: 1060, source: 'global' })
      document.documentElement.style.removeProperty('--editorAreaWidth')
      expect(reapplyLastEditorWidth()).toBe(true)
      expect(document.documentElement.style.getPropertyValue('--editorAreaWidth')).toBe('1060px')
    })

    it('width then theme: a theme switch re-declaring --editorAreaWidth still settles on the effective width', async () => {
      const pipeline = await loadPipeline()
      const theme = await loadTheme()
      // The pipeline applies a per-document 900px (box 1000).
      pipeline.applyEditorWidth({ boxPx: 1000, source: 'document' })
      expect(document.documentElement.style.getPropertyValue('--editorAreaWidth')).toBe('1000px')
      // The theme switch mirrors the theme's own calc(100px + 768px) inline…
      theme.addThemeStyle('paper')
      const mirrored = document.documentElement.style.getPropertyValue('--editorAreaWidth')
      // …and addThemeStyle must end with the effective value re-applied.
      expect(mirrored).toBe('1000px')
    })

    it('theme then width: the pipeline wins after a theme application', async () => {
      const pipeline = await loadPipeline()
      const theme = await loadTheme()
      // An effective width is already in play (box 1000 for a 900px document).
      pipeline.applyEditorWidth({ boxPx: 1000, source: 'document' })
      // The theme switch mirrors the theme's literal calc(100px + 768px)
      // inline mid-switch, and addThemeStyle must END on the effective value.
      theme.addThemeStyle('paper')
      expect(document.documentElement.style.getPropertyValue('--editorAreaWidth')).toBe('1000px')
      // A fresh apply wins on top of the theme.
      pipeline.applyEditorWidth({ boxPx: 1284, source: 'global' })
      expect(document.documentElement.style.getPropertyValue('--editorAreaWidth')).toBe('1284px')
      // And a FOLLOW-UP theme switch keeps it (the last applied value rides).
      theme.addThemeStyle('ink')
      expect(document.documentElement.style.getPropertyValue('--editorAreaWidth')).toBe('1284px')
    })

    it('theme switch with no pipeline width ever applied leaves the theme default in place', async () => {
      // Fresh module registry: a pristine writer state proves the hook is
      // a no-op before the pipeline's first apply (zero regression for
      // callers that never use the pipeline). The mid-switch literal the
      // theme mirror writes is the theme CSS value, verbatim.
      vi.resetModules()
      const pipeline = await import('@/util/pageWidth')
      const theme = await import('@/util/theme')
      expect(pipeline.getLastAppliedEditorWidth()).toBeNull()
      theme.addThemeStyle('paper')
      // The theme's own mirror survives untouched.
      expect(document.documentElement.style.getPropertyValue('--editorAreaWidth')).toBe('calc(100px + 768px)')
    })
  })
})
