// FILE: tests/renderer/muya/edit-preview-flow.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin the C-51 T-014 edit-mode preview geometry — while a container block's source is edited, its div.ag-container-preview sits BELOW the source in normal flow (the inherited MarkText float was position:absolute and covered the following blocks), framed like the float was; multiplemath shares the rule unscoped, the html preview keeps its own hide-while-active behaviour, and no per-theme stylesheet reintroduces the absolute float.
//   SCOPE: the figure.ag-active.ag-container-block > div.ag-container-preview rule of src/muya/lib/assets/styles/index.css plus the same selector in every src/renderer/src/assets/themes/*.theme.css.
//   DEPENDS: node:fs/node:path/node:url reads of the stylesheets; Vitest.
//   LINKS: .grace/changes/archive/C-51 T-014; .grace/verification/runtime.xml V-M-011 scenario-64; the viewer twin tests/renderer/muya/block-viewer.test.js.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   HERE - this test file's directory (fs-path base for the stylesheet reads).
//   MUYA_CSS - absolute path of src/muya/lib/assets/styles/index.css (the base active-preview rule).
//   THEMES_DIR - absolute path of src/renderer/src/assets/themes (per-theme override sheets).
//   readRuleBodies - every declaration block whose selector list mentions the active-preview selector, from the muya sheet or a theme sheet.
//   ACTIVE_PREVIEW_SELECTOR - the shared selector string the base rule and the theme overrides use.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-17 C-51 T-014: new — the base rule
//   must not absolutely position the active preview (no position/top/
//   left/transform/z-index of the old float) while keeping the framed
//   panel declarations and the 20 px gap as margin-top; every theme
//   override must stay shadow/colour-only; the html preview keeps hiding
//   while its figure is active. All assertions fail on main, where the
//   rule is the absolute overlay float inherited from MarkText.
// END_CHANGE_SUMMARY

import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const MUYA_CSS = resolve(HERE, '../../../src/muya/lib/assets/styles/index.css')
const THEMES_DIR = resolve(HERE, '../../../src/renderer/src/assets/themes')

const ACTIVE_PREVIEW_SELECTOR = 'figure.ag-active.ag-container-block > div.ag-container-preview'

// Every declaration block attached to the active-preview selector in the
// given sheet (theme files repeat the selector with their own overrides).
const readRuleBodies = (css) => {
  const bodies = []
  let at = css.indexOf(ACTIVE_PREVIEW_SELECTOR)
  while (at !== -1) {
    const open = css.indexOf('{', at)
    const close = css.indexOf('}', open)
    if (open === -1 || close === -1) break
    bodies.push(css.slice(open + 1, close))
    at = css.indexOf(ACTIVE_PREVIEW_SELECTOR, close)
  }
  return bodies
}

describe('edit-mode preview sits in flow below the source (C-51 T-014)', () => {
  const css = readFileSync(MUYA_CSS, 'utf8')

  it('the base rule no longer floats the active preview over the following blocks', () => {
    const bodies = readRuleBodies(css)
    expect(bodies.length, 'the base rule exists').toBeGreaterThanOrEqual(1)
    const base = bodies[0]
    // The inherited MarkText float geometry must be gone.
    expect(base).not.toContain('position: absolute')
    expect(base).not.toContain('top: calc(100%')
    expect(base).not.toContain('left: 50%')
    expect(base).not.toContain('transform: translateX(-50%)')
    expect(base).not.toContain('z-index: 10000')
    // The full-sheet float cannot come back through a stray copy either.
    expect(css).not.toContain('top: calc(100% + 20px)')
  })

  it('the active preview keeps the framed-panel look with the float gap as margin-top', () => {
    const base = readRuleBodies(css)[0]
    expect(base).toContain('margin-top: 20px')
    expect(base).toContain('width: 100%')
    expect(base).toContain('box-sizing: border-box')
    expect(base).toContain('padding: 0.5rem')
    expect(base).toContain('background: var(--floatBgColor)')
    expect(base).toContain('border: 1px solid var(--floatBorderColor)')
    expect(base).toContain('border-radius: 4px')
    expect(base).toContain('box-shadow:')
  })

  it('the rule is unscoped: multiplemath previews edit in flow too (tables have no preview; html keeps its own rule)', () => {
    // No data-role qualifier — the selector covers multiplemath and the
    // five diagram roles alike.
    expect(css).toContain(`${ACTIVE_PREVIEW_SELECTOR} {`)
    // The html preview still hides while its figure is edited.
    expect(css).toContain("figure[data-role='HTML'].ag-active .ag-html-preview {")
    const htmlRule = css.split("figure[data-role='HTML'].ag-active .ag-html-preview {")[1].split('}')[0]
    expect(htmlRule).toContain('display: none')
  })

  it('no theme stylesheet reintroduces the absolute float (overrides stay shadow/colour-only)', () => {
    for (const file of readdirSync(THEMES_DIR)) {
      if (!file.endsWith('.theme.css')) continue
      const themeCss = readFileSync(resolve(THEMES_DIR, file), 'utf8')
      for (const body of readRuleBodies(themeCss)) {
        expect(
          body,
          `${file} must not re-declare float geometry for the active preview`
        ).not.toMatch(/position:\s*absolute|top:|left:|transform:|z-index:/)
      }
    }
  })
})
