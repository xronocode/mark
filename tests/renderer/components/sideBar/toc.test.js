// FILE: tests/renderer/components/sideBar/toc.test.js
// VERSION: 2.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin the C-40 T-003 sidebar TOC retirement — no component mounts sideBar/toc.vue and the sidebar has no right-column 'toc' mode anymore.
//   SCOPE: Source-level retirement assertions only (the retired component itself is listed for deletion; importing it here would break once it is removed).
//   DEPENDS: node fs/path, Vitest.
//   LINKS: .grace/changes/archive/C-40 T-003; .grace/verification/runtime.xml V-M-011 scenario-54.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   readSource - reads a renderer source file from the repo root.
//   ROOT - repo root for source pins.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-10-15 v2.0.0: C-40 T-003 — the sidebar TOC panel retired in
//     favour of the «On this page» outline rail; these tests now pin the
//     retirement (runtime behaviour is covered in outline-rail.test.js).
//   - 2026-09-23 v1.0.0: C-19 mount coverage of the TOC tree (retired).
// END_CHANGE_SUMMARY

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(__dirname, '..', '..', '..', '..')
const readSource = (relPath) => readFileSync(resolve(ROOT, relPath), 'utf8')

describe('sideBar TOC retirement (C-40 T-003)', () => {
  it('no live renderer source imports the retired sideBar/toc.vue', () => {
    const importers = [
      'src/renderer/src/components/sideBar/index.vue',
      'src/renderer/src/components/sideBar/tree.vue',
      'src/renderer/src/pages/app.vue',
      'src/renderer/src/components/titleBar/index.vue'
    ].filter((f) => {
      const src = readSource(f)
      return src.includes("sideBar/toc") || src.includes("from './toc.vue'")
    })
    expect(importers).toEqual([])
  })

  it('the sidebar template renders only the Files tree (no toc branch)', () => {
    const source = readSource('src/renderer/src/components/sideBar/index.vue')
    expect(source).not.toContain('<toc')
    expect(source).not.toContain("rightColumn === 'toc'")
    expect(source).toContain('<tree')
  })
})
