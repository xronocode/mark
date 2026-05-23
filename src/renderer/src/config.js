export const PATH_SEPARATOR = window.path.sep

export const THEME_STYLE_ID = 'ag-theme'
export const COMMON_STYLE_ID = 'ag-common-style'

export const DEFAULT_EDITOR_FONT_FAMILY =
  '"Open Sans", "Clear Sans", "Helvetica Neue", Helvetica, Arial, sans-serif, Segoe UI Emoji, Apple Color Emoji, "Noto Color Emoji"'
export const DEFAULT_CODE_FONT_FAMILY =
  '"DejaVu Sans Mono", "Source Code Pro", "Droid Sans Mono", monospace'
export const DEFAULT_STYLE = Object.freeze({
  codeFontFamily: DEFAULT_CODE_FONT_FAMILY,
  codeFontSize: '14px',
  hideScrollbar: false,
  theme: 'light'
})

export const railscastsThemes = Object.freeze([
  'dark',
  'material-dark',
  // New gogh dark themes
  'dracula',
  'nord',
  'catppuccin-mocha',
  'gruvbox-dark',
  'tokyo-night',
  'tokyo-night-storm',
  'solarized-dark',
  'ayu-dark',
  'ayu-mirage',
  'everforest-dark',
  'rose-pine',
  'rose-pine-moon',
  'monokai-pro',
  'synthwave-84',
  'horizon-dark',
  'palenight',
  'oxocarbon-dark',
  'kanagawa',
  'nightfox',
  'cyberdream'
])
export const oneDarkThemes = Object.freeze(['one-dark'])

export const themePairs = Object.freeze({
  'catppuccin-mocha': 'catppuccin-latte',
  'catppuccin-latte': 'catppuccin-mocha',
  'gruvbox-dark': 'gruvbox-light',
  'gruvbox-light': 'gruvbox-dark',
  'tokyo-night': 'tokyo-night-light',
  'tokyo-night-storm': 'tokyo-night-light',
  'tokyo-night-light': 'tokyo-night',
  'solarized-dark': 'solarized-light',
  'solarized-light': 'solarized-dark',
  'ayu-dark': 'ayu-light',
  'ayu-mirage': 'ayu-light',
  'ayu-light': 'ayu-dark',
  'everforest-dark': 'everforest-light',
  'everforest-light': 'everforest-dark',
  'rose-pine': 'rose-pine-dawn',
  'rose-pine-moon': 'rose-pine-dawn',
  'rose-pine-dawn': 'rose-pine',
  'dark': 'graphite',
  'graphite': 'dark',
  'material-dark': 'graphite',
  'one-dark': 'gruvbox-light',
  'ulysses': 'dark',
  'dracula': 'catppuccin-latte',
  'nord': 'solarized-light',
  'monokai-pro': 'gruvbox-light',
  'synthwave-84': 'rose-pine-dawn',
  'horizon-dark': 'rose-pine-dawn',
  'palenight': 'catppuccin-latte',
  'oxocarbon-dark': 'catppuccin-latte',
  'kanagawa': 'tokyo-night-light',
  'nightfox': 'solarized-light',
  'cyberdream': 'catppuccin-latte',
  'light': 'dark'
})

export const isDarkTheme = (theme) => {
  return railscastsThemes.includes(theme) || oneDarkThemes.includes(theme)
}
