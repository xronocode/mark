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

const patchTheme = (css) => {
  return `@media not print {\n${css}\n}`
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
  themeStyleEle.textContent = themeFn ? patchTheme(themeFn()) : ''

  document.body.classList.remove('dark')
  if (isDarkTheme) {
    document.body.classList.add('dark')
  }

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
