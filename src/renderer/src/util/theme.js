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

const ORIGINAL_THEME = '#409EFF'
const patchTheme = (css) => {
  return `@media not print {\n${css}\n}`
}

const getEmojiPickerPatch = () => {
  return isLinux
    ? '.ag-emoji-picker section .emoji-wrapper .item span { font-family: sans-serif, "Noto Color Emoji"; }'
    : ''
}

const getThemeCluster = (themeColor) => {
  const tintColor = (color, tint) => {
    let red = parseInt(color.slice(1, 3), 16)
    let green = parseInt(color.slice(3, 5), 16)
    let blue = parseInt(color.slice(5, 7), 16)
    if (tint === 0) {
      // when primary color is in its rgb space
      return [red, green, blue].join(',')
    } else {
      red += Math.round(tint * (255 - red))
      green += Math.round(tint * (255 - green))
      blue += Math.round(tint * (255 - blue))
      red = red.toString(16)
      green = green.toString(16)
      blue = blue.toString(16)
      return `#${red}${green}${blue}`
    }
  }

  const clusters = [
    {
      color: themeColor,
      variable: 'var(--themeColor)'
    }
  ]
  for (let i = 9; i >= 1; i--) {
    clusters.push({
      color: tintColor(themeColor, Number((i / 10).toFixed(2))),
      variable: `var(--themeColor${10 - i}0)`
    })
  }

  return clusters
}

// F-THEME-DIAG (smoke 2026-05-11): normalize null/undefined for log
// readability — single helper shared by BLOCK_ENTRY / BLOCK_APPLIED /
// BLOCK_VERIFY so all three markers display the same sentinels.
const _formatTheme = (theme) =>
  theme === null ? 'null' : theme === undefined ? 'undef' : theme

export const addThemeStyle = (theme) => {
  // F-THEME-DIAG (smoke 2026-05-11): track every entry so we can see
  // whether a click → state mutation actually drives the apply step.
  // The case=match/default flag tells us whether the theme name was
  // recognized; default=no CSS gets written and the editor stays on
  // whatever style was painted last (typical symptom: "click does
  // nothing" for a newly-added theme).
  console.log(`[theme][addThemeStyle][BLOCK_ENTRY theme=${_formatTheme(theme)}]`)
  const isCmRailscasts = railscastsThemes.includes(theme)
  const isCmOneDark = oneDarkThemes.includes(theme)
  const isDarkTheme = isCmOneDark || isCmRailscasts
  let themeStyleEle = document.querySelector(`#${THEME_STYLE_ID}`)
  if (!themeStyleEle) {
    themeStyleEle = document.createElement('style')
    themeStyleEle.id = THEME_STYLE_ID
    document.head.appendChild(themeStyleEle)
  }

  let _matched = true
  switch (theme) {
    case 'light':
      themeStyleEle.innerHTML = ''
      break
    case 'dark':
      themeStyleEle.innerHTML = patchTheme(dark())
      break
    case 'material-dark':
      themeStyleEle.innerHTML = patchTheme(materialDark())
      break
    case 'ulysses':
      themeStyleEle.innerHTML = patchTheme(ulysses())
      break
    case 'graphite':
      themeStyleEle.innerHTML = patchTheme(graphite())
      break
    case 'one-dark':
      themeStyleEle.innerHTML = patchTheme(oneDark())
      break
    // New gogh themes - Dark
    case 'dracula':
      themeStyleEle.innerHTML = patchTheme(dracula())
      break
    case 'nord':
      themeStyleEle.innerHTML = patchTheme(nord())
      break
    case 'catppuccin-mocha':
      themeStyleEle.innerHTML = patchTheme(catppuccinMocha())
      break
    case 'gruvbox-dark':
      themeStyleEle.innerHTML = patchTheme(gruvboxDark())
      break
    case 'tokyo-night':
      themeStyleEle.innerHTML = patchTheme(tokyoNight())
      break
    case 'tokyo-night-storm':
      themeStyleEle.innerHTML = patchTheme(tokyoNightStorm())
      break
    case 'solarized-dark':
      themeStyleEle.innerHTML = patchTheme(solarizedDark())
      break
    case 'ayu-dark':
      themeStyleEle.innerHTML = patchTheme(ayuDark())
      break
    case 'ayu-mirage':
      themeStyleEle.innerHTML = patchTheme(ayuMirage())
      break
    case 'everforest-dark':
      themeStyleEle.innerHTML = patchTheme(everforestDark())
      break
    case 'rose-pine':
      themeStyleEle.innerHTML = patchTheme(rosePine())
      break
    case 'rose-pine-moon':
      themeStyleEle.innerHTML = patchTheme(rosePineMoon())
      break
    case 'monokai-pro':
      themeStyleEle.innerHTML = patchTheme(monokaiPro())
      break
    case 'synthwave-84':
      themeStyleEle.innerHTML = patchTheme(synthwave84())
      break
    case 'horizon-dark':
      themeStyleEle.innerHTML = patchTheme(horizonDark())
      break
    case 'palenight':
      themeStyleEle.innerHTML = patchTheme(palenight())
      break
    case 'oxocarbon-dark':
      themeStyleEle.innerHTML = patchTheme(oxocarbonDark())
      break
    case 'kanagawa':
      themeStyleEle.innerHTML = patchTheme(kanagawa())
      break
    case 'nightfox':
      themeStyleEle.innerHTML = patchTheme(nightfox())
      break
    case 'cyberdream':
      themeStyleEle.innerHTML = patchTheme(cyberdream())
      break
    // New gogh themes - Light
    case 'catppuccin-latte':
      themeStyleEle.innerHTML = patchTheme(catppuccinLatte())
      break
    case 'gruvbox-light':
      themeStyleEle.innerHTML = patchTheme(gruvboxLight())
      break
    case 'tokyo-night-light':
      themeStyleEle.innerHTML = patchTheme(tokyoNightLight())
      break
    case 'solarized-light':
      themeStyleEle.innerHTML = patchTheme(solarizedLight())
      break
    case 'ayu-light':
      themeStyleEle.innerHTML = patchTheme(ayuLight())
      break
    case 'everforest-light':
      themeStyleEle.innerHTML = patchTheme(everforestLight())
      break
    case 'rose-pine-dawn':
      themeStyleEle.innerHTML = patchTheme(rosePineDawn())
      break
    default:
      _matched = false
      break
  }
  // F-THEME-DIAG: case=match means a switch arm ran (CSS written or
  // 'light' which intentionally clears it); case=default means the
  // theme name was unrecognized so innerHTML was left untouched.
  console.log(
    `[theme][addThemeStyle][BLOCK_APPLIED theme=${_formatTheme(theme)} case=${_matched ? 'match' : 'default'}]`
  )
  // F-THEME-DIAG-VERIFY (smoke 2026-05-11 alpha.6.5): the prior smoke
  // confirmed BLOCK_APPLIED case=match fires on every click, BUT both
  // windows stayed visually unstyled. Probe BOTH the :root cascade
  // origin AND a consumer element so one smoke cycle localizes the
  // break to one of three layers:
  //   :root.editorBg=#... + consumer.bg=#...   → cascade works, both layers see new theme — break is purely visual (paint? compositor?)
  //   :root.editorBg=#... + consumer.bg=white  → :root got it, consumer doesn't read it (specificity / Vue scoped / Element Plus override)
  //   :root.editorBg=''                        → innerHTML write didn't propagate to :root (WKWebView parse fail / nested @media / stale stylesheet)
  // TODO(F-THEME-DIAG-VERIFY): remove this block after root-cause known.
  try {
    const cs = getComputedStyle(document.documentElement)
    const editorBg = cs.getPropertyValue('--editorBgColor').trim()
    const editorColor = cs.getPropertyValue('--editorColor').trim()
    const themeColor = cs.getPropertyValue('--themeColor').trim()
    const inlineLength = themeStyleEle.innerHTML?.length ?? 0
    const styleElementPresent = !!document.querySelector(`#${THEME_STYLE_ID}`)
    // Consumer-element probe: pick the highest-LOC user of --editorBgColor
    // (`.editor-with-tabs` is the main editor surface; falls back through
    // `.pref-container` for Settings window, then `body`).
    const consumer =
      document.querySelector('.editor-with-tabs') ||
      document.querySelector('.pref-container') ||
      document.body
    const consumerSelector = consumer === document.body
      ? 'body'
      : consumer.className.split(' ').filter(Boolean)[0] || consumer.tagName.toLowerCase()
    const consumerCs = getComputedStyle(consumer)
    const consumerBg = consumerCs.backgroundColor
    const consumerColor = consumerCs.color
    console.log(
      `[theme][addThemeStyle][BLOCK_VERIFY theme=${_formatTheme(theme)} editorBg=${editorBg} editorColor=${editorColor} themeColor=${themeColor} inlineLen=${inlineLength} styleElPresent=${styleElementPresent} consumer=${consumerSelector} consumerBg=${consumerBg} consumerColor=${consumerColor}]`
    )
  } catch (e) {
    console.error('[theme][addThemeStyle][BLOCK_VERIFY_FAILED]', {
      theme,
      err: e?.message ?? String(e),
      stack: e?.stack ?? null
    })
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

  styleEle.innerHTML = result
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

  styleEle.innerHTML = result
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

  sheet.innerHTML = `${scrollbarStyle}
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
  customStyleEle.innerHTML = customCss
}

// Append common sheet and theme at the end of head - order is important.
export const addStyles = (options) => {
  const { theme } = options
  addThemeStyle(theme)
  addCommonStyle(options)
}
