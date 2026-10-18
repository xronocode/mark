// FILE: site/scripts/landing-fill.mjs
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Fill the landing template's build-time placeholders so the page
//            ships real diagram SVGs (the same pele renderer as the app and
//            the gallery), the shared brand tokens and the no-flash theme
//            script without hand-copied markup (C-64 T-002).
//   SCOPE: <!--THEME_INIT--> -> inline THEME_INIT_JS; <!--BRAND_CSS--> ->
//          site/shared/brand.css (fonts under %BASE%); <!--DIAGRAM:id--> ->
//          pele SVG of that gallery example (unique idPrefix per occurrence);
//          <!--THEME_VARS_JSON--> -> the chip themes' --pele-* table. Throws
//          on an unknown example id or a render error so the build fails.
//   DEPENDS: pele, ../gallery/examples.mjs, ./gallery-theme-vars.mjs,
//            ../shared/theme-init.mjs, ../shared/brand.css
//   LINKS: M-053 SiteBuild; C-64 T-002; site/.vitepress/config.mts loadLanding
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   LANDING_THEMES - theme ids the landing's chips recolour through
//   fillLanding - landing template -> template with every build placeholder filled
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v1.0.0 - 2026-10-18 C-64 T-002: first version.]
// END_CHANGE_SUMMARY

import { readFileSync } from 'node:fs'
import { render } from 'pele'
import { EXAMPLES } from '../gallery/examples.mjs'
import { deriveThemeVars } from './gallery-theme-vars.mjs'
import { THEME_INIT_JS } from '../shared/theme-init.mjs'

export const LANDING_THEMES = ['paper', 'ink', 'nord', 'gruvbox-light', 'solarized-dark', 'catppuccin-mocha', 'rose-pine-dawn', 'dracula']

const brandCss = () =>
  readFileSync(new URL('../shared/brand.css', import.meta.url), 'utf8')
    .replace(/url\((['"])\/fonts\//g, 'url($1%BASE%fonts/')

export function fillLanding (template, vars = deriveThemeVars()) {
  // START_BLOCK_FILL_LANDING
  const byId = new Map(EXAMPLES.map((e) => [e.id, e]))
  let n = 0
  const out = template
    .replace('<!--THEME_INIT-->', `<script>${THEME_INIT_JS}</script>`)
    .replace('<!--BRAND_CSS-->', brandCss())
    .replace('<!--THEME_VARS_JSON-->', () => {
      const table = {}
      for (const id of LANDING_THEMES) {
        if (!vars[id]) throw new Error(`[SiteBuild][fillLanding][BLOCK_FILL_LANDING] unknown theme ${id}`)
        table[id] = vars[id]
      }
      return JSON.stringify(table).replace(/</g, '\\u003c')
    })
    .replace(/<!--DIAGRAM:([a-z0-9-]+)-->/g, (_, id) => {
      const e = byId.get(id)
      if (!e) throw new Error(`[SiteBuild][fillLanding][BLOCK_FILL_LANDING] unknown diagram ${id}`)
      const r = render(e.code, { idPrefix: `l${++n}-${id}-` })
      if (!r || !r.svg) throw new Error(`[SiteBuild][fillLanding][BLOCK_FILL_LANDING] render failed ${id}`)
      return r.svg
    })
  return out
  // END_BLOCK_FILL_LANDING
}
