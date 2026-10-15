// FILE: src/renderer/src/util/themeColor.js
// VERSION: 2.1.0
// START_MODULE_CONTRACT
//   PURPOSE: One factory per registered theme returning the theme CSS plus
//            its Prism.js companion (C-41 T-002: 22 factories — the 12
//            retired gogh/dark ids are gone; the six new family members
//            land with C-41 T-003).
//   SCOPE: Static ?inline CSS imports and their factory exports only.
//   DEPENDS: assets/themes/*.theme.css, assets/themes/prismjs/*.theme.css.
//   LINKS: util/theme.js themeMap; .grace/graph/runtime.xml M-011;
//          .grace/verification/runtime.xml V-M-011 scenario-48 (C-41 T-002).
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   paper - paper theme CSS + Prism companion.
//   ink - ink theme CSS + Prism companion.
//   graphite - graphite theme CSS + Prism companion.
//   ulysses - ulysses theme CSS + Prism companion.
//   oneDark - oneDark theme CSS + Prism companion.
//   dracula - dracula theme CSS + Prism companion.
//   nord - nord theme CSS + Prism companion.
//   catppuccinMocha - catppuccinMocha theme CSS + Prism companion.
//   gruvboxDark - gruvboxDark theme CSS + Prism companion.
//   tokyoNight - tokyoNight theme CSS + Prism companion.
//   solarizedDark - solarizedDark theme CSS + Prism companion.
//   ayuDark - ayuDark theme CSS + Prism companion.
//   everforestDark - everforestDark theme CSS + Prism companion.
//   rosePine - rosePine theme CSS + Prism companion.
//   kanagawa - kanagawa theme CSS + Prism companion.
//   catppuccinLatte - catppuccinLatte theme CSS + Prism companion.
//   gruvboxLight - gruvboxLight theme CSS + Prism companion.
//   tokyoNightLight - tokyoNightLight theme CSS + Prism companion.
//   solarizedLight - solarizedLight theme CSS + Prism companion.
//   ayuLight - ayuLight theme CSS + Prism companion.
//   everforestLight - everforestLight theme CSS + Prism companion.
//   rosePineDawn - rosePineDawn theme CSS + Prism companion.
//   oneLight - oneLight theme CSS + Prism companion (C-41 T-003).
//   alucard - alucard theme CSS + Prism companion (C-41 T-003).
//   nordLight - nordLight theme CSS + Prism companion (C-41 T-003).
//   kanagawaLotus - kanagawaLotus theme CSS + Prism companion (C-41 T-003).
//   graphiteDark - graphiteDark theme CSS + Prism companion (C-41 T-003).
//   ulyssesDark - ulyssesDark theme CSS + Prism companion (C-41 T-003).
//   themeCssFactories - frozen theme-id → factory registry (C-38 T-004 swatch source; same membership as util/theme.js themeMap).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v2.1.0 - 2026-10-15 C-38 T-004: export themeCssFactories
//   (theme id → CSS factory) so the Settings family swatches read
//   --editorBgColor/--editorColor/--themeColor straight from the shipped
//   theme CSS without importing util/theme.js (platform shim at import
//   time) and without a second palette table.
//   v2.0.0 - 2026-10-15 C-41 T-002: remove the 12 retired
//   factories (dark, material-dark, tokyo-night-storm, ayu-mirage,
//   rose-pine-moon, monokai-pro, synthwave-84, horizon-dark, palenight,
//   oxocarbon-dark, nightfox, cyberdream) and their imports; stored values
//   migrate via util/themeMigration.js. The companion CSS files
//   (assets/themes/{dark,material-dark,tokyo-night-storm,ayu-mirage,
//   rose-pine-moon,monokai-pro,synthwave-84,horizon-dark,palenight,
//   oxocarbon-dark,nightfox,cyberdream}.theme.css and their prismjs
//   siblings) are orphaned by this change and must be deleted with it.
//   v1.x - 2026-10-15 C-41 T-001: Paper (light) and Ink (dark) brand
//   themes with matching Prism companions.
// END_CHANGE_SUMMARY

// C-41 T-001 brand themes — Paper (light) and Ink (dark) are the defaults
// for new profiles; every other theme below stays unchanged.
// C-41 T-003 adds six family members: one-light, alucard, nord-light,
// kanagawa-lotus (light) and graphite-dark, ulysses-dark (dark).
import paperTheme from '../assets/themes/paper.theme.css?inline'
import inkTheme from '../assets/themes/ink.theme.css?inline'

import oneLightTheme from '../assets/themes/one-light.theme.css?inline'
import alucardTheme from '../assets/themes/alucard.theme.css?inline'
import nordLightTheme from '../assets/themes/nord-light.theme.css?inline'
import kanagawaLotusTheme from '../assets/themes/kanagawa-lotus.theme.css?inline'
import graphiteDarkTheme from '../assets/themes/graphite-dark.theme.css?inline'
import ulyssesDarkTheme from '../assets/themes/ulysses-dark.theme.css?inline'

import graphiteTheme from '../assets/themes/graphite.theme.css?inline'
import oneDarkTheme from '../assets/themes/one-dark.theme.css?inline'
import ulyssesTheme from '../assets/themes/ulysses.theme.css?inline'

// Kept gogh themes - Dark
import draculaTheme from '../assets/themes/dracula.theme.css?inline'
import nordTheme from '../assets/themes/nord.theme.css?inline'
import catppuccinMochaTheme from '../assets/themes/catppuccin-mocha.theme.css?inline'
import gruvboxDarkTheme from '../assets/themes/gruvbox-dark.theme.css?inline'
import tokyoNightTheme from '../assets/themes/tokyo-night.theme.css?inline'
import solarizedDarkTheme from '../assets/themes/solarized-dark.theme.css?inline'
import ayuDarkTheme from '../assets/themes/ayu-dark.theme.css?inline'
import everforestDarkTheme from '../assets/themes/everforest-dark.theme.css?inline'
import rosePineTheme from '../assets/themes/rose-pine.theme.css?inline'
import kanagawaTheme from '../assets/themes/kanagawa.theme.css?inline'

// Kept gogh themes - Light
import catppuccinLatteTheme from '../assets/themes/catppuccin-latte.theme.css?inline'
import gruvboxLightTheme from '../assets/themes/gruvbox-light.theme.css?inline'
import tokyoNightLightTheme from '../assets/themes/tokyo-night-light.theme.css?inline'
import solarizedLightTheme from '../assets/themes/solarized-light.theme.css?inline'
import ayuLightTheme from '../assets/themes/ayu-light.theme.css?inline'
import everforestLightTheme from '../assets/themes/everforest-light.theme.css?inline'
import rosePineDawnTheme from '../assets/themes/rose-pine-dawn.theme.css?inline'

// Prism.js syntax highlighting themes
// C-41 T-001: brand Prism companions for Paper/Ink.
// C-41 T-003: Prism companions for the six new family members.
import paperPrismTheme from '../assets/themes/prismjs/paper.theme.css?inline'
import inkPrismTheme from '../assets/themes/prismjs/ink.theme.css?inline'
import oneLightPrismTheme from '../assets/themes/prismjs/one-light.theme.css?inline'
import alucardPrismTheme from '../assets/themes/prismjs/alucard.theme.css?inline'
import nordLightPrismTheme from '../assets/themes/prismjs/nord-light.theme.css?inline'
import kanagawaLotusPrismTheme from '../assets/themes/prismjs/kanagawa-lotus.theme.css?inline'
import graphiteDarkPrismTheme from '../assets/themes/prismjs/graphite-dark.theme.css?inline'
import ulyssesDarkPrismTheme from '../assets/themes/prismjs/ulysses-dark.theme.css?inline'
import oneDarkPrismTheme from '../assets/themes/prismjs/one-dark.theme.css?inline'
import draculaPrismTheme from '../assets/themes/prismjs/dracula.theme.css?inline'
import nordPrismTheme from '../assets/themes/prismjs/nord.theme.css?inline'
import catppuccinMochaPrismTheme from '../assets/themes/prismjs/catppuccin-mocha.theme.css?inline'
import catppuccinLattePrismTheme from '../assets/themes/prismjs/catppuccin-latte.theme.css?inline'
import gruvboxDarkPrismTheme from '../assets/themes/prismjs/gruvbox-dark.theme.css?inline'
import gruvboxLightPrismTheme from '../assets/themes/prismjs/gruvbox-light.theme.css?inline'
import tokyoNightPrismTheme from '../assets/themes/prismjs/tokyo-night.theme.css?inline'
import tokyoNightLightPrismTheme from '../assets/themes/prismjs/tokyo-night-light.theme.css?inline'
import rosePinePrismTheme from '../assets/themes/prismjs/rose-pine.theme.css?inline'
import rosePineDawnPrismTheme from '../assets/themes/prismjs/rose-pine-dawn.theme.css?inline'
import solarizedDarkPrismTheme from '../assets/themes/prismjs/solarized-dark.theme.css?inline'
import solarizedLightPrismTheme from '../assets/themes/prismjs/solarized-light.theme.css?inline'
import kanagawaPrismTheme from '../assets/themes/prismjs/kanagawa.theme.css?inline'
import everforestDarkPrismTheme from '../assets/themes/prismjs/everforest-dark.theme.css?inline'
import everforestLightPrismTheme from '../assets/themes/prismjs/everforest-light.theme.css?inline'
import ayuDarkPrismTheme from '../assets/themes/prismjs/ayu-dark.theme.css?inline'
import ayuLightPrismTheme from '../assets/themes/prismjs/ayu-light.theme.css?inline'
import graphitePrismTheme from '../assets/themes/prismjs/graphite.theme.css?inline'
import ulyssesPrismTheme from '../assets/themes/prismjs/ulysses.theme.css?inline'

// C-41 T-001 brand themes - with matching Prism themes
export const paper = () => {
  return paperTheme + '\n' + paperPrismTheme
}

export const ink = () => {
  return inkTheme + '\n' + inkPrismTheme
}

// C-41 T-003 new family members - with matching Prism themes
export const oneLight = () => {
  return oneLightTheme + '\n' + oneLightPrismTheme
}

export const alucard = () => {
  return alucardTheme + '\n' + alucardPrismTheme
}

export const nordLight = () => {
  return nordLightTheme + '\n' + nordLightPrismTheme
}

export const kanagawaLotus = () => {
  return kanagawaLotusTheme + '\n' + kanagawaLotusPrismTheme
}

export const graphiteDark = () => {
  return graphiteDarkTheme + '\n' + graphiteDarkPrismTheme
}

export const ulyssesDark = () => {
  return ulyssesDarkTheme + '\n' + ulyssesDarkPrismTheme
}

// Original themes
export const graphite = () => {
  return graphiteTheme + '\n' + graphitePrismTheme
}

export const oneDark = () => {
  return oneDarkTheme + '\n' + oneDarkPrismTheme
}

export const ulysses = () => {
  return ulyssesTheme + '\n' + ulyssesPrismTheme
}

// Kept gogh themes - Dark (with matching Prism themes)
export const dracula = () => {
  return draculaTheme + '\n' + draculaPrismTheme
}

export const nord = () => {
  return nordTheme + '\n' + nordPrismTheme
}

export const catppuccinMocha = () => {
  return catppuccinMochaTheme + '\n' + catppuccinMochaPrismTheme
}

export const gruvboxDark = () => {
  return gruvboxDarkTheme + '\n' + gruvboxDarkPrismTheme
}

export const tokyoNight = () => {
  return tokyoNightTheme + '\n' + tokyoNightPrismTheme
}

export const solarizedDark = () => {
  return solarizedDarkTheme + '\n' + solarizedDarkPrismTheme
}

export const ayuDark = () => {
  return ayuDarkTheme + '\n' + ayuDarkPrismTheme
}

export const everforestDark = () => {
  return everforestDarkTheme + '\n' + everforestDarkPrismTheme
}

export const rosePine = () => {
  return rosePineTheme + '\n' + rosePinePrismTheme
}

export const kanagawa = () => {
  return kanagawaTheme + '\n' + kanagawaPrismTheme
}

// Kept gogh themes - Light (with matching Prism themes)
export const catppuccinLatte = () => {
  return catppuccinLatteTheme + '\n' + catppuccinLattePrismTheme
}

export const gruvboxLight = () => {
  return gruvboxLightTheme + '\n' + gruvboxLightPrismTheme
}

export const tokyoNightLight = () => {
  return tokyoNightLightTheme + '\n' + tokyoNightLightPrismTheme
}

export const solarizedLight = () => {
  return solarizedLightTheme + '\n' + solarizedLightPrismTheme
}

export const ayuLight = () => {
  return ayuLightTheme + '\n' + ayuLightPrismTheme
}

export const everforestLight = () => {
  return everforestLightTheme + '\n' + everforestLightPrismTheme
}

export const rosePineDawn = () => {
  return rosePineDawnTheme + '\n' + rosePineDawnPrismTheme
}

// START_BLOCK_THEME_CSS_FACTORIES
// C-38 T-004: theme-id → CSS factory registry for consumers that must not
// import util/theme.js (which pulls the platform shim at import time) —
// the Settings Appearance tab reads each theme's CSS variables from these
// strings to paint the family swatches, so there is no second hand-maintained
// palette table anywhere.
export const themeCssFactories = Object.freeze({
  paper,
  ink,
  'one-light': oneLight,
  alucard,
  'nord-light': nordLight,
  'kanagawa-lotus': kanagawaLotus,
  'graphite-dark': graphiteDark,
  'ulysses-dark': ulyssesDark,
  graphite,
  'one-dark': oneDark,
  ulysses,
  dracula,
  nord,
  'catppuccin-mocha': catppuccinMocha,
  'gruvbox-dark': gruvboxDark,
  'tokyo-night': tokyoNight,
  'solarized-dark': solarizedDark,
  'ayu-dark': ayuDark,
  'everforest-dark': everforestDark,
  'rose-pine': rosePine,
  kanagawa,
  'catppuccin-latte': catppuccinLatte,
  'gruvbox-light': gruvboxLight,
  'tokyo-night-light': tokyoNightLight,
  'solarized-light': solarizedLight,
  'ayu-light': ayuLight,
  'everforest-light': everforestLight,
  'rose-pine-dawn': rosePineDawn
})
// END_BLOCK_THEME_CSS_FACTORIES
