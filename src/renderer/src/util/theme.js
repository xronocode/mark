// START_MODULE_CONTRACT
//   PURPOSE: Apply theme CSS, mirrored theme variables, and shared editor
//            style sheets to the renderer document.
//   SCOPE:   Theme/common/custom style tag management only. Owns raw theme
//            CSS injection plus the inline CSS-variable mirror consumed by
//            WKWebView-native surfaces such as the transparent title bar.
//            Exports the themeMap registry for verification (C-41 T-002).
//   DEPENDS: themeColor factories, config style ids, DOM style tags.
//   LINKS:   .grace/verification/runtime.xml V-M-011 scenario-4 and
//            scenario-48 (C-41 T-002); .grace/graph/runtime.xml M-011.
//   STATUS:  Raw theme CSS injection preserved; `@media not print` wrapper
//            removed to reduce WKWebView stylesheet parsing fragility.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   themeMap - registered theme id → CSS factory registry (exported for C-41 T-002 family verification).
//   addThemeStyle - inject a theme's CSS, mirror its variables, set dark classification, cache the id.
//   setWrapCodeBlocks - toggle pre-wrap on .ag-code-content.
//   setEditorWidth - apply --editorAreaWidth for a ch/px/% value.
//   addCommonStyle - code font family/size and optional scrollbar hiding.
//   addCustomStyle - inject user custom CSS.
//   addStyles - apply theme + common styles together.
// END_MODULE_MAP
//
// CHANGE_SUMMARY:
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
import { isLinux } from './index'

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
  root.__themeVars = setVars

  document.body.classList.remove('dark')
  if (isDarkTheme) {
    document.body.classList.add('dark')
    root.style.setProperty('--titleBarBorderColor', 'rgba(255, 255, 255, 0.06)')
  } else {
    root.style.setProperty('--titleBarBorderColor', 'rgba(0, 0, 0, 0.08)')
  }

  try { localStorage.setItem('mark-cached-theme', theme) } catch (_) {}

  root.style.colorScheme = isDarkTheme ? 'dark' : 'light'

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
}

export const setWrapCodeBlocks = (value) => {
  const result = value
    ? '.ag-code-content { display: block; white-space: pre-wrap; word-break: break-word; overflow: hidden; }'
    : '.ag-code-content { display: block; white-space: pre; word-break: break-word; overflow: auto; }'
  getOrCreateStyleEl('ag-code-wrap').textContent = result
}

export const setEditorWidth = (value) => {
  let result = ''
  if (value && /^[0-9]+(?:ch|px|%)$/.test(value)) {
    result = `:root { --editorAreaWidth: calc(100px + ${value}); }`
  }
  getOrCreateStyleEl('editor-width').textContent = result
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

export const addCustomStyle = (options) => {
  const { customCss } = options
  if (!customCss) return
  getOrCreateStyleEl('custom-styles').textContent = customCss
}

export const addStyles = (options) => {
  const { theme } = options
  addThemeStyle(theme)
  addCommonStyle(options)
}
