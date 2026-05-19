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
  // New gogh themes - Dark
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
  // New gogh themes - Light
  catppuccinLatte,
  gruvboxLight,
  tokyoNightLight,
  solarizedLight,
  ayuLight,
  everforestLight,
  rosePineDawn
} from './themeColor'
import { isLinux } from './index'

const patchTheme = (css) => {
  return `@media not print {\n${css}\n}`
}

const getEmojiPickerPatch = () => {
  return isLinux
    ? '.ag-emoji-picker section .emoji-wrapper .item span { font-family: sans-serif, "Noto Color Emoji"; }'
    : ''
}

export const addThemeStyle = (theme) => {
  const isCmRailscasts = railscastsThemes.includes(theme)
  const isCmOneDark = oneDarkThemes.includes(theme)
  const isDarkTheme = isCmOneDark || isCmRailscasts
  let themeStyleEle = document.querySelector(`#${THEME_STYLE_ID}`)
  if (!themeStyleEle) {
    themeStyleEle = document.createElement('style')
    themeStyleEle.id = THEME_STYLE_ID
    document.head.appendChild(themeStyleEle)
  }

  switch (theme) {
    case 'light':
      themeStyleEle.textContent = ''
      break
    case 'dark':
      themeStyleEle.textContent = patchTheme(dark())
      break
    case 'material-dark':
      themeStyleEle.textContent = patchTheme(materialDark())
      break
    case 'ulysses':
      themeStyleEle.textContent = patchTheme(ulysses())
      break
    case 'graphite':
      themeStyleEle.textContent = patchTheme(graphite())
      break
    case 'one-dark':
      themeStyleEle.textContent = patchTheme(oneDark())
      break
    case 'dracula':
      themeStyleEle.textContent = patchTheme(dracula())
      break
    case 'nord':
      themeStyleEle.textContent = patchTheme(nord())
      break
    case 'catppuccin-mocha':
      themeStyleEle.textContent = patchTheme(catppuccinMocha())
      break
    case 'gruvbox-dark':
      themeStyleEle.textContent = patchTheme(gruvboxDark())
      break
    case 'tokyo-night':
      themeStyleEle.textContent = patchTheme(tokyoNight())
      break
    case 'tokyo-night-storm':
      themeStyleEle.textContent = patchTheme(tokyoNightStorm())
      break
    case 'solarized-dark':
      themeStyleEle.textContent = patchTheme(solarizedDark())
      break
    case 'ayu-dark':
      themeStyleEle.textContent = patchTheme(ayuDark())
      break
    case 'ayu-mirage':
      themeStyleEle.textContent = patchTheme(ayuMirage())
      break
    case 'everforest-dark':
      themeStyleEle.textContent = patchTheme(everforestDark())
      break
    case 'rose-pine':
      themeStyleEle.textContent = patchTheme(rosePine())
      break
    case 'rose-pine-moon':
      themeStyleEle.textContent = patchTheme(rosePineMoon())
      break
    case 'monokai-pro':
      themeStyleEle.textContent = patchTheme(monokaiPro())
      break
    case 'synthwave-84':
      themeStyleEle.textContent = patchTheme(synthwave84())
      break
    case 'horizon-dark':
      themeStyleEle.textContent = patchTheme(horizonDark())
      break
    case 'palenight':
      themeStyleEle.textContent = patchTheme(palenight())
      break
    case 'oxocarbon-dark':
      themeStyleEle.textContent = patchTheme(oxocarbonDark())
      break
    case 'kanagawa':
      themeStyleEle.textContent = patchTheme(kanagawa())
      break
    case 'nightfox':
      themeStyleEle.textContent = patchTheme(nightfox())
      break
    case 'cyberdream':
      themeStyleEle.textContent = patchTheme(cyberdream())
      break
    case 'catppuccin-latte':
      themeStyleEle.textContent = patchTheme(catppuccinLatte())
      break
    case 'gruvbox-light':
      themeStyleEle.textContent = patchTheme(gruvboxLight())
      break
    case 'tokyo-night-light':
      themeStyleEle.textContent = patchTheme(tokyoNightLight())
      break
    case 'solarized-light':
      themeStyleEle.textContent = patchTheme(solarizedLight())
      break
    case 'ayu-light':
      themeStyleEle.textContent = patchTheme(ayuLight())
      break
    case 'everforest-light':
      themeStyleEle.textContent = patchTheme(everforestLight())
      break
    case 'rose-pine-dawn':
      themeStyleEle.textContent = patchTheme(rosePineDawn())
      break
    default:
      break
  }

  // workaround: use dark icons
  document.body.classList.remove('dark')
  if (isDarkTheme) {
    document.body.classList.add('dark')
  }

  // change CodeMirror theme
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
  const CODE_WRAP_STYLE_ID = 'ag-code-wrap'
  let result = ''
  if (value) {
    result =
      '.ag-code-content { display: block; white-space: pre-wrap; word-break: break-word; overflow: hidden; }'
  } else {
    result =
      '.ag-code-content { display: block; white-space: pre; word-break: break-word; overflow: auto; }'
  }
  let styleEle = document.querySelector(`#${CODE_WRAP_STYLE_ID}`)
  if (!styleEle) {
    styleEle = document.createElement('style')
    styleEle.setAttribute('id', CODE_WRAP_STYLE_ID)
    document.head.appendChild(styleEle)
  }

  styleEle.textContent = result
}

export const setEditorWidth = (value) => {
  const EDITOR_WIDTH_STYLE_ID = 'editor-width'
  let result = ''
  if (value && /^[0-9]+(?:ch|px|%)$/.test(value)) {
    // Overwrite the theme value and add 100px for padding.
    result = `:root { --editorAreaWidth: calc(100px + ${value}); }`
  }
  let styleEle = document.querySelector(`#${EDITOR_WIDTH_STYLE_ID}`)
  if (!styleEle) {
    styleEle = document.createElement('style')
    styleEle.setAttribute('id', EDITOR_WIDTH_STYLE_ID)
    document.head.appendChild(styleEle)
  }

  styleEle.textContent = result
}

export const addCommonStyle = (options) => {
  const { codeFontFamily, codeFontSize, hideScrollbar } = options
  let sheet = document.querySelector(`#${COMMON_STYLE_ID}`)
  if (!sheet) {
    sheet = document.createElement('style')
    sheet.id = COMMON_STYLE_ID
    document.head.appendChild(sheet)
  }

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

  let customStyleEle = document.querySelector('#custom-styles')
  if (!customStyleEle) {
    customStyleEle = document.createElement('style')
    customStyleEle.id = 'custom-styles'
    document.head.appendChild(customStyleEle)
  }
  customStyleEle.textContent = customCss
}

// Append common sheet and theme at the end of head - order is important.
export const addStyles = (options) => {
  const { theme } = options
  addThemeStyle(theme)
  addCommonStyle(options)
}
