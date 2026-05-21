// MODULE_CONTRACT
//   PURPOSE: Apply theme CSS, mirrored theme variables, and shared editor
//            style sheets to the renderer document.
//   SCOPE:   Theme/common/custom style tag management only. Owns raw theme
//            CSS injection plus the inline CSS-variable mirror consumed by
//            WKWebView-native surfaces such as the transparent title bar.
//   DEPENDS: themeColor factories, config style ids, DOM style tags.
//   LINKS:   docs/verification-plan.xml V-M-011 scenario-4, ec theme swap;
//            docs/knowledge-graph.xml M-011.
//   STATUS:  Raw theme CSS injection preserved; `@media not print` wrapper
//            removed to reduce WKWebView stylesheet parsing fragility.
//
// CHANGE_SUMMARY:
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
  dark,
  graphite,
  materialDark,
  oneDark,
  ulysses,
  dracula,
  nord,
  catppuccinMocha,
  gruvboxDark,
  tokyoNight,
  tokyoNightStorm,
  solarizedDark,
  ayuDark,
  ayuMirage,
  everforestDark,
  rosePine,
  rosePineMoon,
  monokaiPro,
  synthwave84,
  horizonDark,
  palenight,
  oxocarbonDark,
  kanagawa,
  nightfox,
  cyberdream,
  catppuccinLatte,
  gruvboxLight,
  tokyoNightLight,
  solarizedLight,
  ayuLight,
  everforestLight,
  rosePineDawn
} from './themeColor'
import { isLinux } from './index'

const themeMap = {
  'dark': dark,
  'material-dark': materialDark,
  'ulysses': ulysses,
  'graphite': graphite,
  'one-dark': oneDark,
  'dracula': dracula,
  'nord': nord,
  'catppuccin-mocha': catppuccinMocha,
  'gruvbox-dark': gruvboxDark,
  'tokyo-night': tokyoNight,
  'tokyo-night-storm': tokyoNightStorm,
  'solarized-dark': solarizedDark,
  'ayu-dark': ayuDark,
  'ayu-mirage': ayuMirage,
  'everforest-dark': everforestDark,
  'rose-pine': rosePine,
  'rose-pine-moon': rosePineMoon,
  'monokai-pro': monokaiPro,
  'synthwave-84': synthwave84,
  'horizon-dark': horizonDark,
  'palenight': palenight,
  'oxocarbon-dark': oxocarbonDark,
  'kanagawa': kanagawa,
  'nightfox': nightfox,
  'cyberdream': cyberdream,
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
    const varRegex = /--([\w-]+):\s*([^;]+)/g
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

  sheet.textContent = `${scrollbarStyle}
span code,
td code,
th code,
code,
code[class*="language-"],
.CodeMirror,
pre.ag-paragraph {
font-family: ${codeFontFamily}, ${DEFAULT_CODE_FONT_FAMILY};
font-size: ${codeFontSize}px;
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
