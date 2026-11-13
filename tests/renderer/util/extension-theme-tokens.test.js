// FILE: tests/renderer/util/extension-theme-tokens.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Detect extension surfaces referencing tokens absent from the shipped Paper/Ink palettes.
//   SCOPE: Actual Gallery and LiveViewer SFC style declarations against actual theme declarations.
//   DEPENDS: Vitest, Vue SFC parser, PostCSS, filesystem.
//   LINKS: M-011; V-M-011.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   renderer - Resolve renderer source files relative to this suite.
//   read - Read a renderer source file without importing CSS through Vitest transforms.
//   referencedTokens - Extract variable references from actual component style declarations.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   LAST_CHANGE: 2026-11-13 - Guard extension surfaces against undefined theme tokens and light fallbacks in dark themes.
// END_CHANGE_SUMMARY

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parse } from '@vue/compiler-sfc'
import postcss from 'postcss'

const renderer = resolve(__dirname, '../../../src/renderer/src')
const read = path => readFileSync(resolve(renderer, path), 'utf8')
const referencedTokens = component => {
  const { descriptor, errors } = parse(read(`components/${component}/index.vue`))
  expect(errors).toEqual([])
  const references = new Set()
  for (const style of descriptor.styles) {
    postcss.parse(style.content).walkDecls(declaration => {
      for (const match of declaration.value.matchAll(/var\(\s*(--[\w-]+)/g)) references.add(match[1])
    })
  }
  expect(references.size).toBeGreaterThan(0)
  return references
}

describe.each(['paper', 'ink'])('%s extension surface token contract', theme => {
  it.each(['extensionGallery', 'liveViewer'])('%s references defined theme tokens', component => {
    const declared = new Set()
    postcss.parse(read(`assets/themes/${theme}.theme.css`)).walkDecls(declaration => {
      if (declaration.prop.startsWith('--')) declared.add(declaration.prop)
    })
    expect(declared.size).toBeGreaterThan(0)
    const missing = [...referencedTokens(component)].filter(token => !declared.has(token))
    expect(missing).toEqual([])
  })
})
