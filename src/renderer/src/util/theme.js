// FILE: src/renderer/src/util/theme.js
// VERSION: 2.3.0
// START_MODULE_CONTRACT
//   PURPOSE: Apply theme CSS, mirrored theme variables, and shared editor
//            style sheets to the renderer document.
//   SCOPE:   Theme/common/custom style tag management only. Owns raw theme
//            CSS injection plus the inline CSS-variable mirror consumed by
//            WKWebView-native surfaces such as the transparent title bar.
//            Exports the themeMap registry for verification (C-41 T-002).
//            C-PAGE-WIDTH-TABLES T-002: addThemeStyle ends by re-applying
//            the resolved page width (util/pageWidth.js
//            reapplyLastEditorWidth) — every theme stylesheet re-declares
//            --editorAreaWidth, so the width pipeline's inline value must
//            be re-written after theme application or a theme switch
//            would silently reset the column (review finding F1).
//            C-PREFS-TRUTH: the same precedence now also holds for the
//            legacy global tier (F-002 — a theme switch must not revert
//            the saved global editorLineWidth via the inline mirror);
//            addCustomStyle empties the custom layer for real on an empty
//            save/reset (F-001/F-011); and the per-document theme pin
//            applies through addDocumentThemeStyle, scoped to the editor
//            host only (frontend F-004) while the shell keeps the global
//            mode.
//   DEPENDS: themeColor factories, config style ids, DOM style tags;
//            util/pageWidth.js (the width re-apply hook, no-op until the
//            pipeline has applied a width).
//   LINKS:   .grace/verification/runtime.xml V-M-011 scenario-4 and
//            scenario-48 (C-41 T-002); .grace/graph/runtime.xml M-011;
//            .grace/graph/performance.xml M-061 (C-PAGE-WIDTH-TABLES);
//            util/pageWidth.js (the resolution pipeline this module
//            cooperates with).
//   STATUS:  Raw theme CSS injection preserved; `@media not print` wrapper
//            removed to reduce WKWebView stylesheet parsing fragility.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v2.3.0 - 2026-11-21 C-PREFS-TRUTH: three fixes on this
//   surface. (F-001/F-011) addCustomStyle loses the falsy-customCss early
//   return: saving or resetting an empty customCss empties the existing
//   style#custom-styles element (never force-creates a fresh empty one)
//   so the window returns to the active theme's styles for real, and a
//   later non-empty save applies again through the same element.
//   (F-002) the width precedence extends to the legacy global tier:
//   setEditorWidth remembers its value and drops the inline mirror when a
//   real global width is asserted, and addThemeStyle — when the pipeline
//   has no recorded width — removes the theme's inline mirror and
//   re-asserts the #editor-width declaration, so a theme switch no longer
//   silently reverts the saved global editorLineWidth (with no saved
//   global width the theme's own mirror stays, the shipped theme-tier
//   answer). (Frontend F-004) addDocumentThemeStyle /
//   removeDocumentThemeStyle scope a pinned per-document theme to the
//   editor host (its variables, dark classification and color-scheme)
//   while root variables, body.dark, the document color-scheme, the
//   native window theme, sidebar, title bar and quick-settings keep the
//   global mode; the pipeline-owned --editorAreaWidth is never mirrored
//   onto the surface.
//   PREV: v2.2.0 - 2026-11-02 C-PAGE-WIDTH-TABLES T-002: theme
//   switches re-apply the resolved page width. addThemeStyle ends with
//   reapplyLastEditorWidth() (util/pageWidth.js): the theme's own
//   --editorAreaWidth mirror lands mid-switch, and the width pipeline's
//   last effective value must be re-written inline after it, so a theme
//   change never resets the column. No-op until the pipeline has applied
//   a width — setEditorWidth and the raw-preference path are untouched.
//   PREV: v2.1.0 - 2026-10-17 C-55: addThemeStyle derives the pele
//   diagram variables (buildPeleVariables from muya diagramTheme.js) from
//   the just-applied theme and sets them on the document root right after
//   the dark classification — pele SVGs recolor through the CSS cascade on
//   every theme switch with zero re-renders. The variables are registered
//   in __themeVars so the next switch clears them.
// END_CHANGE_SUMMARY
//
// START_MODULE_MAP
//   themeMap - registered theme id → CSS factory registry (exported for C-41 T-002 family verification).
//   addThemeStyle - inject a theme's CSS, mirror its variables, set dark classification, cache the id.
//   setWrapCodeBlocks - toggle pre-wrap on .ag-code-content.
//   setEditorWidth - apply --editorAreaWidth for a ch/px/% value; the legacy global-tier writer whose last value addThemeStyle re-asserts after a theme switch (C-PREFS-TRUTH F-002).
//   addCommonStyle - code font family/size and optional scrollbar hiding.
//   addCustomStyle - inject user custom CSS, or empty the layer on an empty save/reset (C-PREFS-TRUTH F-001/F-011).
//   addDocumentThemeStyle - C-PREFS-TRUTH (frontend F-004): apply a pinned per-document theme scoped to the editor host element (variables, dark classification, color-scheme) — shell surfaces keep the global mode.
//   removeDocumentThemeStyle - clear the scoped pinned-theme application from the editor host before the global mode is re-applied.
//   addStyles - apply theme + common styles together.
// END_MODULE_MAP
//
// CHANGE_SUMMARY:
//   - 2026-10-16 C-51 T-008: addThemeStyle also syncs the native window
//     appearance (util/nativeWindowTheme.js) so the Settings window's
//     native title bar follows a dark/light theme instead of macOS.
//   - 2026-10-16 C-51 T-007: register the Docs and macOS family members
//     (docs, macos light; docs-dark, macos-dark dark, railscasts
//     classification) in themeMap — the neutral docs and Apple looks from
//     canvas Main/DocsDark/MacOS.
//   - 2026-10-15 C-41 T-003: register the six new family members in
//     themeMap — one-light, alucard, nord-light, kanagawa-lotus (light)
//     and graphite-dark, ulysses-dark (dark, railscasts classification
//     from config.js); plus a WCAG AA contrast pass over the kept themes.
//   - 2026-10-15 C-41 T-002: the 12 retired ids leave themeMap (dark,
//     material-dark, tokyo-night-storm, ayu-mirage, rose-pine-moon,
//     monokai-pro, synthwave-84, horizon-dark, palenight, oxocarbon-dark,
//     nightfox, cyberdream — stored values migrate via
//     util/themeMigration.js); themeMap is exported so family verification
//     can assert every family member is registered. The six C-41 T-003
//     members (one-light, alucard, nord-light, kanagawa-lotus,
//     graphite-dark, ulysses-dark) join themeMap with that task.
//   - 2026-10-15 C-49 T-001: addCommonStyle emits the WYSIWYG code font size
//     as an em ratio (codeFontSize / 16) so code blocks and inline code
//     scale with the unified fontSize zoom; the source-mode .CodeMirror
//     pane (outside the fontSize-styled editor wrapper) keeps the absolute
//     px size it always had.
//   - 2026-10-15 C-41 T-001: register the Paper (light) and Ink (dark)
//     brand themes in themeMap; Ink rides the railscasts dark
//     classification (dark CodeMirror theme + color-scheme: dark).
//   - 2026-05-21 drag-theme-refactor: stop wrapping theme CSS in
//     `@media not print` so Prism/scrollbar/sidebar rules are emitted as
//     direct stylesheet text while keeping the variable mirror unchanged.

import {
  THEME_STYLE_ID,
  COMMON_STYLE_ID,
  DEFAULT_CODE_FONT_FAMILY,
  oneDarkThemes,
  railscastsThemes
} from '../config'
import {
  paper,
  ink,
  oneLight,
  alucard,
  nordLight,
  kanagawaLotus,
  graphiteDark,
  ulyssesDark,
  docs,
  docsDark,
  macos,
  macosDark,
  github,
  githubDark,
  graphite,
  oneDark,
  ulysses,
  dracula,
  nord,
  catppuccinMocha,
  gruvboxDark,
  tokyoNight,
  solarizedDark,
  ayuDark,
  everforestDark,
  rosePine,
  kanagawa,
  catppuccinLatte,
  gruvboxLight,
  tokyoNightLight,
  solarizedLight,
  ayuLight,
  everforestLight,
  rosePineDawn
} from './themeColor'
import {
  buildPeleVariables,
  readActiveThemeTokens
} from '../../../muya/lib/parser/render/diagramTheme'
import { isLinux } from './index'
import { syncNativeWindowTheme } from './nativeWindowTheme'
// C-PAGE-WIDTH-TABLES T-002: the width pipeline's re-apply hook — theme
// stylesheets re-declare --editorAreaWidth, so the resolved width must be
// re-written inline after every theme application (no-op until the
// pipeline has applied one).
import { reapplyLastEditorWidth } from './pageWidth'

// C-41 T-002: registered themes only — retired ids are absent by design
// (migrated on load); the six C-41 T-003 members join with that task.
export const themeMap = {
  // C-41 T-001: Paper/Ink brand themes (defaults for new profiles).
  'paper': paper,
  'ink': ink,
  // C-41 T-003: new family members — one-light/alucard/nord-light/
  // kanagawa-lotus are light; graphite-dark/ulysses-dark are dark.
  'one-light': oneLight,
  'alucard': alucard,
  'nord-light': nordLight,
  'kanagawa-lotus': kanagawaLotus,
  'graphite-dark': graphiteDark,
  'ulysses-dark': ulyssesDark,
  // C-51 T-007: Docs and macOS family members — docs/macos are light;
  // docs-dark/macos-dark are dark (railscasts classification).
  'docs': docs,
  'docs-dark': docsDark,
  'macos': macos,
  'macos-dark': macosDark,
  // C-GITHUB-THEME: GitHub family members — github is light; github-dark
  // is dark (railscasts classification).
  'github': github,
  'github-dark': githubDark,
  'graphite': graphite,
  'one-dark': oneDark,
  'ulysses': ulysses,
  'dracula': dracula,
  'nord': nord,
  'catppuccin-mocha': catppuccinMocha,
  'gruvbox-dark': gruvboxDark,
  'tokyo-night': tokyoNight,
  'solarized-dark': solarizedDark,
  'ayu-dark': ayuDark,
  'everforest-dark': everforestDark,
  'rose-pine': rosePine,
  'kanagawa': kanagawa,
  'catppuccin-latte': catppuccinLatte,
  'gruvbox-light': gruvboxLight,
  'tokyo-night-light': tokyoNightLight,
  'solarized-light': solarizedLight,
  'ayu-light': ayuLight,
  'everforest-light': everforestLight,
  'rose-pine-dawn': rosePineDawn
}

const getEmojiPickerPatch = () => {
  return isLinux
    ? '.ag-emoji-picker section .emoji-wrapper .item span { font-family: sans-serif, "Noto Color Emoji"; }'
    : ''
}

const getOrCreateStyleEl = (id) => {
  let el = document.querySelector(`#${id}`)
  if (!el) {
    el = document.createElement('style')
    el.id = id
    document.head.appendChild(el)
  }
  return el
}

export const addThemeStyle = (theme) => {
  if (!theme || typeof theme !== 'string') return

  const isCmRailscasts = railscastsThemes.includes(theme)
  const isCmOneDark = oneDarkThemes.includes(theme)
  const isDarkTheme = isCmOneDark || isCmRailscasts
  const themeStyleEle = getOrCreateStyleEl(THEME_STYLE_ID)

  const themeFn = themeMap[theme]
  const css = themeFn ? themeFn() : ''
  themeStyleEle.textContent = css

  const root = document.documentElement
  const prevVars = root.__themeVars || []
  prevVars.forEach(name => root.style.removeProperty(name))

  const setVars = []
  if (css) {
    // `}` ends a value too: Vite's CSS minifier drops the semicolon after
    // the last declaration of a block, and `[^;]+` then swallowed the rest of
    // the stylesheet — the browser rejected the value and that variable
    // (e.g. the last one in :root, --chartPalette) never reached the root
    // (C-51 T-007 review).
    const varRegex = /--([\w-]+):\s*([^;}]+)/g
    let m
    while ((m = varRegex.exec(css)) !== null) {
      const name = `--${m[1]}`
      root.style.setProperty(name, m[2].trim())
      setVars.push(name)
    }
  }
  document.body.classList.remove('dark')
  if (isDarkTheme) {
    document.body.classList.add('dark')
    root.style.setProperty('--titleBarBorderColor', 'rgba(255, 255, 255, 0.06)')
  } else {
    root.style.setProperty('--titleBarBorderColor', 'rgba(0, 0, 0, 0.08)')
  }

  // C-55: derive the pele diagram variables from the just-applied theme
  // (tokens read off the inline mirror above + the dark flag) and set them
  // on the root. Pele SVGs resolve their colours through these variables
  // at display time, so a theme switch recolors every diagram through the
  // CSS cascade with zero re-renders. Registered in __themeVars so a later
  // switch removes stale values first.
  const peleVars = buildPeleVariables(readActiveThemeTokens())
  for (const [name, value] of Object.entries(peleVars)) {
    root.style.setProperty(name, value)
    setVars.push(name)
  }
  root.__themeVars = setVars

  try { localStorage.setItem('mark-cached-theme', theme) } catch (_) {}

  root.style.colorScheme = isDarkTheme ? 'dark' : 'light'
  // C-51 T-008: native title bars (Settings) follow the theme, not macOS.
  syncNativeWindowTheme(isDarkTheme)

  const cm = document.querySelector('.CodeMirror')
  if (cm) {
    cm.classList.remove('cm-s-default')
    cm.classList.remove('cm-s-one-dark')
    cm.classList.remove('cm-s-railscasts')
    if (isCmOneDark) {
      cm.classList.add('cm-s-one-dark')
    } else if (isCmRailscasts) {
      cm.classList.add('cm-s-railscasts')
    } else {
      cm.classList.add('cm-s-default')
    }
  }

  // C-PAGE-WIDTH-TABLES T-002 (finding F1): the theme CSS (and its inline
  // mirror above) re-declared --editorAreaWidth, so the width pipeline's
  // last effective value must be re-written inline afterwards — both
  // switch orders (theme then width, width then theme) settle on the
  // effective value. No-op until the pipeline has applied a width.
  // C-PREFS-TRUTH (F-002): the same precedence now holds for the LEGACY
  // global tier. When the pipeline has no recorded width (an entry-less
  // or untitled document), the theme's inline mirror above would
  // silently revert the saved global editorLineWidth that setEditorWidth
  // declared in the #editor-width style element — drop the mirror and
  // re-assert that declaration instead, both switch orders. With no
  // saved global width the theme's own mirror stays: the theme tier is
  // then the legitimate cascade answer (shipped behaviour, pinned by
  // tests/renderer/util/page-width.test.js).
  if (!reapplyLastEditorWidth() && lastGlobalEditorWidth) {
    document.documentElement.style.removeProperty('--editorAreaWidth')
    setEditorWidth(lastGlobalEditorWidth)
  }
}

export const setWrapCodeBlocks = (value) => {
  const result = value
    ? '.ag-code-content { display: block; white-space: pre-wrap; word-break: break-word; overflow: hidden; }'
    : '.ag-code-content { display: block; white-space: pre; word-break: break-word; overflow: auto; }'
  getOrCreateStyleEl('ag-code-wrap').textContent = result
}

// C-PREFS-TRUTH (F-002): the legacy global-tier writer remembers its
// value so addThemeStyle can re-assert the tier after a theme switch's
// inline mirror. Exactly one tier owns the variable at a time: a recorded
// pipeline width always wins first through reapplyLastEditorWidth, and
// util/pageWidth.js's clearAppliedEditorWidth hands the variable off to
// this writer.
let lastGlobalEditorWidth = null

export const setEditorWidth = (value) => {
  let result = ''
  if (value && /^[0-9]+(?:ch|px|%)$/.test(value)) {
    result = `:root { --editorAreaWidth: calc(100px + ${value}); }`
  }
  getOrCreateStyleEl('editor-width').textContent = result
  // C-PREFS-TRUTH (F-002): an inline --editorAreaWidth left by a theme
  // switch's mirror would out-rank this declaration forever — drop the
  // mirror when a real global width is asserted, in both switch orders.
  // An empty/unlimited value keeps the theme's own mirror: the theme tier
  // is then the cascade answer.
  if (result) {
    document.documentElement.style.removeProperty('--editorAreaWidth')
  }
  lastGlobalEditorWidth = result ? value : null
}

export const addCommonStyle = (options) => {
  const { codeFontFamily, codeFontSize, hideScrollbar } = options
  const sheet = getOrCreateStyleEl(COMMON_STYLE_ID)

  let scrollbarStyle = ''
  if (hideScrollbar) {
    scrollbarStyle = '::-webkit-scrollbar {display: none;}'
  }

  // C-49: the WYSIWYG code selectors are em-based relative to the editor
  // fontSize (inline style on .editor-component), so code blocks and inline
  // code scale with the unified ⌘+/⌘−/⌘0 zoom — at the 16 px base font the
  // ratio equals the old fixed px value (14/16 → 0.875em = 14px). The
  // source-mode CodeMirror pane lives outside that wrapper, so it keeps the
  // absolute px size.
  // codeFontSize may be stored as a number (14) or a string with a unit
  // ('14px', the v1 default) — parse it, or the ratio becomes NaNem and the
  // whole rule is dropped (code stops zooming; the audit's "14px px" bug).
  const codePx = Number.parseFloat(codeFontSize) || 14
  const codeFontRatio = `${codePx / 16}em`
  sheet.textContent = `${scrollbarStyle}
span code,
td code,
th code,
code,
code[class*="language-"],
pre.ag-paragraph {
font-family: ${codeFontFamily}, ${DEFAULT_CODE_FONT_FAMILY};
font-size: ${codeFontRatio};
}

.CodeMirror {
font-family: ${codeFontFamily}, ${DEFAULT_CODE_FONT_FAMILY};
font-size: ${codePx}px;
}

${getEmojiPickerPatch()}
`
}

// C-PREFS-TRUTH (F-001/F-011): an empty customCss is a real clear, not a
// no-op. The sheet save (customCssSheet.vue → SET_SINGLE_PREFERENCE → the
// app.vue watch) and the reset path both deliver the truthy→falsy
// transition here: an existing style#custom-styles element is EMPTIED so
// the window immediately returns to the active theme's styles (light or
// dark alike — the theme stylesheets own the cascade again), a later
// non-empty save applies again through the same element, and no fresh
// empty element is force-created when none exists.
export const addCustomStyle = (options) => {
  const { customCss } = options
  if (!customCss) {
    const existing = document.querySelector('#custom-styles')
    if (existing) {
      existing.textContent = ''
    }
    return
  }
  getOrCreateStyleEl('custom-styles').textContent = customCss
}

export const addStyles = (options) => {
  const { theme } = options
  addThemeStyle(theme)
  addCommonStyle(options)
}

// START_BLOCK_DOCUMENT_SURFACE_THEME
// C-PREFS-TRUTH (frontend F-004): the per-document theme pin (editor.vue
// applyDocumentSurfaceTheme) applies its theme to the DOCUMENT SURFACE
// only — the pinned id's CSS variables, dark classification and
// color-scheme land as inline properties/classes on the editor host
// element, whose subtree (the document) inherits them, while the shared
// shell surfaces — root-level variables, body.dark, the document
// color-scheme, the native window theme (syncNativeWindowTheme), the file
// sidebar, the title bar and the quick-settings panel — keep following the
// global mode. Deliberately NOT part of the scoped application: the theme
// stylesheet swap (#ag-theme — shell-wide), the cached-theme localStorage
// write and the width re-apply (the surface mirror must never shadow the
// single inline --editorAreaWidth writer in util/pageWidth.js, so that
// variable is skipped here and inherited from the root). A global cycle
// while a pin governs the surface re-asserts the scoped application;
// restoreGlobalSurfaceTheme removes it before the global addThemeStyle
// re-applies the global mode, so unpinning and tab switches restore
// today's global contract.
export const addDocumentThemeStyle = (theme, host) => {
  if (!theme || typeof theme !== 'string') return false
  if (!host || !host.style || typeof host.style.setProperty !== 'function') return false

  const isCmRailscasts = railscastsThemes.includes(theme)
  const isCmOneDark = oneDarkThemes.includes(theme)
  const isDarkTheme = isCmOneDark || isCmRailscasts
  const themeFn = themeMap[theme]
  const css = themeFn ? themeFn() : ''

  const prevVars = host.__docThemeVars || []
  prevVars.forEach(name => host.style.removeProperty(name))

  const setVars = []
  if (css) {
    const varRegex = /--([\w-]+):\s*([^;}]+)/g
    let m
    while ((m = varRegex.exec(css)) !== null) {
      const name = `--${m[1]}`
      // The width pipeline owns --editorAreaWidth inline on the document
      // root; a scoped copy on the host would shadow it for the editor
      // subtree and break the document > theme > global precedence.
      if (name === '--editorAreaWidth') continue
      host.style.setProperty(name, m[2].trim())
      setVars.push(name)
    }
  }
  host.__docThemeVars = setVars

  // Dark classification and color-scheme stay scoped to the surface —
  // body.dark and document.documentElement.colorScheme keep the global mode.
  host.classList.toggle('document-theme-dark', isDarkTheme)
  host.style.colorScheme = isDarkTheme ? 'dark' : 'light'

  const cm = host.querySelector('.CodeMirror')
  if (cm) {
    cm.classList.remove('cm-s-default')
    cm.classList.remove('cm-s-one-dark')
    cm.classList.remove('cm-s-railscasts')
    if (isCmOneDark) {
      cm.classList.add('cm-s-one-dark')
    } else if (isCmRailscasts) {
      cm.classList.add('cm-s-railscasts')
    } else {
      cm.classList.add('cm-s-default')
    }
  }
  return true
}

export const removeDocumentThemeStyle = (host) => {
  if (!host || !host.style) return false
  const prevVars = host.__docThemeVars || []
  prevVars.forEach(name => host.style.removeProperty(name))
  host.__docThemeVars = []
  host.classList.remove('document-theme-dark')
  host.style.removeProperty('color-scheme')
  return prevVars.length > 0
}
// END_BLOCK_DOCUMENT_SURFACE_THEME
