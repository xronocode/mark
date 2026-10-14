// FILE: tests/renderer/editions-doc.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin the "Two editions, same editor" tables in README.md and site/guide/editions.md to the M-048 build-mode flags, so the documented desktop-only features cannot drift from the code.
//   SCOPE: Parses both BuildMode literals in src-tauri/src/m048_build_mode.rs, derives the flags that are off in the app-store variant and on in the macOS desktop variant, and checks each one is documented as desktop-only; checks share is documented as available in both editions.
//   DEPENDS: Vitest, node:fs, src-tauri/src/m048_build_mode.rs, README.md, site/guide/editions.md.
//   LINKS: .grace/verification/runtime.xml V-M-048 scenario-4 (C-42 R-5); .grace/changes/active/C-42/spec.xml.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   ROOT - repo root resolver for the source and doc pins.
//   read - reads a repo file as UTF-8.
//   IMPLEMENTATION_ONLY - flags that switch how a feature works, not whether it exists (not documented as a difference).
//   DOC_ROW - doc row pattern for each user-visible desktop-only flag.
//   parseVariant - extracts one BuildMode literal's flags (true / false / macos) from m048.
//   tableRows - extracts the Markdown table rows that follow a heading.
//   cells - splits one table row into trimmed cells.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - C-42 G2: initial editions-table pin.
// END_CHANGE_SUMMARY

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(__dirname, '..', '..')
const read = (rel) => readFileSync(resolve(ROOT, rel), 'utf-8')

// project_search_ripgrep: App Store builds search through an in-process
// walker instead of spawning rg; project search exists in both editions.
const IMPLEMENTATION_ONLY = new Set(['project_search_ripgrep'])

const DOC_ROW = {
  export_pandoc: /pandoc export/i,
  screenshot: /insert screenshot/i,
  set_default_handler: /default markdown app/i,
  updater: /in-app updater/i
}

const parseVariant = (src, mode) => {
  const start = src.indexOf(`mode: "${mode}"`)
  expect(start, `m048 has a ${mode} BuildMode literal`).toBeGreaterThan(-1)
  const body = src.slice(start, src.indexOf('})', start))
  const flags = {}
  for (const [, name, value] of body.matchAll(/^\s*([a-z_]+):\s*([^,\n]+),/gm)) {
    if (name === 'mode') continue
    const v = value.trim()
    flags[name] = v === 'true' ? true : v === 'false' ? false : /target_os = "macos"/.test(v) ? 'macos' : v
  }
  return flags
}

const tableRows = (doc, heading) => {
  const at = doc.search(heading)
  expect(at, `doc has a heading matching ${heading}`).toBeGreaterThan(-1)
  const rest = doc.slice(at)
  const next = rest.search(/\n#{1,2} /)
  const section = next === -1 ? rest : rest.slice(0, next)
  return section.split('\n').filter((l) => l.startsWith('|') && !/^\|\s*:?-/.test(l))
}

const cells = (row) => row.split('|').slice(1, -1).map((c) => c.trim())

describe('editions table matches M-048 build-mode flags (C-42)', () => {
  const src = read('src-tauri/src/m048_build_mode.rs')
  const appStore = parseVariant(src, 'app-store')
  const desktop = parseVariant(src, 'desktop')

  const desktopOnly = Object.keys(desktop)
    .filter((f) => appStore[f] === false && (desktop[f] === true || desktop[f] === 'macos'))
    .filter((f) => !IMPLEMENTATION_ONLY.has(f))
    .sort()

  it('both variants expose the same flags', () => {
    expect(Object.keys(appStore).sort()).toEqual(Object.keys(desktop).sort())
  })

  it('the desktop-only flag set is the documented one (a new flag needs a doc row)', () => {
    expect(desktopOnly).toEqual(Object.keys(DOC_ROW).sort())
  })

  it('share is available in both variants on macOS', () => {
    expect(appStore.share).toBe('macos')
    expect(desktop.share).toBe('macos')
  })

  const docs = [
    ['README.md', /^## Two editions, same editor/m],
    ['site/guide/editions.md', /^## What differs/m]
  ]

  for (const [file, heading] of docs) {
    describe(file, () => {
      const rows = tableRows(read(file), heading).map(cells)

      it('has a three-column editions table with desktop first, App Store second', () => {
        expect(rows.length).toBeGreaterThan(5)
        expect(rows[0][1]).toMatch(/homebrew/i)
        expect(rows[0][2]).toMatch(/app store/i)
        for (const r of rows) expect(r).toHaveLength(3)
      })

      for (const flag of Object.keys(DOC_ROW)) {
        it(`documents ${flag} as desktop-only`, () => {
          const row = rows.find((r) => DOC_ROW[flag].test(r[0]))
          expect(row, `${file} has a row for ${flag}`).toBeTruthy()
          expect(row[1]).toMatch(/^Yes/)
          expect(row[2]).toMatch(/^No/)
        })
      }

      it('documents share as available in both editions', () => {
        const row = rows.find((r) => /share/i.test(r[0]))
        expect(row, `${file} has a Share row`).toBeTruthy()
        expect(row[1]).toMatch(/^Yes/)
        expect(row[2]).toMatch(/^Yes/)
      })
    })
  }
})
