// FILE: tests/renderer/util/editor-width-default.test.js
// C-PAGE-WIDTH-TABLES-REV1 T-101 — the 768 px default lands in lockstep:
// the shared :root declaration and every shipped theme re-declaration carry
// the SAME calc form, and no raw 750 px default survives anywhere.
// Width-space rule (spec R-2 revision): 768 is the rendered CONTENT-column
// width; --editorAreaWidth therefore carries calc(100px + 768px) everywhere
// (border-box + 100px horizontal padding), so the pre-JS fallback renders
// identically to the applied "768px" preference.
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = join(dirname(fileURLToPath(import.meta.url)), '../../../src/renderer/src')
const THEMES_DIR = join(root, 'assets/themes')
const INDEX_CSS = join(root, 'assets/styles/index.css')
const CALC = '--editorAreaWidth: calc(100px + 768px);'
const RAW_750 = '--editorAreaWidth: 750px;'

const themeFiles = () =>
  readdirSync(THEMES_DIR).filter(f => f.endsWith('.theme.css')).sort()

describe('editor width default — 768 px lockstep (T-101)', () => {
  it('the shared :root default carries the calc form', () => {
    expect(readFileSync(INDEX_CSS, 'utf8')).toContain(CALC)
    expect(readFileSync(INDEX_CSS, 'utf8')).not.toContain(RAW_750)
  })

  it('every shipped theme re-declares the same calc form (no theme diverges)', () => {
    const files = themeFiles()
    expect(files.length).toBe(34)
    const stragglers = files.filter(f => {
      const css = readFileSync(join(THEMES_DIR, f), 'utf8')
      return !css.includes(CALC) || css.includes(RAW_750)
    })
    expect(stragglers, `themes missing the lockstep value: ${stragglers.join(', ')}`).toEqual([])
  })

  it('no shipped width source keeps a raw 750 px default', () => {
    const offenders = [INDEX_CSS, ...themeFiles().map(f => join(THEMES_DIR, f))]
      .filter(f => readFileSync(f, 'utf8').includes(RAW_750))
    expect(offenders).toEqual([])
  })
})
