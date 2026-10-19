// FILE: site/scripts/landing-fill.mjs
// VERSION: 1.1.0
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
//          Release facts (%VERSION%, %DMG_NAME%, %DMG_URL%, %DMG_MB%,
//          %EXE_NAME%, %EXE_URL%, %EXE_MB%) -> the resolved latest GitHub
//          release (all occurrences, & < > " escaped for attributes); left
//          untouched when no release is passed (diagram-only callers).
//   DEPENDS: pele, ../gallery/examples.mjs, ./gallery-theme-vars.mjs,
//            ../shared/theme-init.mjs, ../shared/brand.css
//   LINKS: M-053 SiteBuild; C-64 T-002, version sync; ./release.mjs (the
//          facts site/.vitepress/config.mts passes in);
//          site/.vitepress/config.mts loadLanding
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   LANDING_THEMES - theme ids the landing's chips recolour through
//   fillLanding - landing template (+ optional release facts) -> template with every build placeholder filled
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v1.1.0 - 2026-10-19 C-64 version sync: fillLanding takes
//                 the resolved release facts and replaces the %VERSION% /
//                 %DMG_* / %EXE_* tokens (all occurrences, attribute-safe
//                 escaping); a null release leaves them in place so
//                 diagram-only callers (og-card) keep working.]
//   PREV: [v1.0.0 - 2026-10-18 C-64 T-002: first version.]
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

// The release facts land in visible text and href attributes; escape the
// four characters that could break out of either.
const escapeRelease = (v) => String(v)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')

const releaseTokens = (release) => ({
  '%VERSION%': release.version,
  '%DMG_NAME%': release.dmg.name,
  '%DMG_URL%': release.dmg.url,
  '%DMG_MB%': release.dmg.mb,
  '%EXE_NAME%': release.exe.name,
  '%EXE_URL%': release.exe.url,
  '%EXE_MB%': release.exe.mb
})

export function fillLanding (template, vars = deriveThemeVars(), release = null) {
  // START_BLOCK_FILL_LANDING
  const byId = new Map(EXAMPLES.map((e) => [e.id, e]))
  let n = 0
  let out = template
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
  if (release) {
    for (const [token, value] of Object.entries(releaseTokens(release))) {
      out = out.replaceAll(token, escapeRelease(value))
    }
  }
  return out
  // END_BLOCK_FILL_LANDING
}
