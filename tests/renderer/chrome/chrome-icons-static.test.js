// FILE: tests/renderer/chrome/chrome-icons-static.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: C-38 T-006 N4 d guard — no chrome component imports the iconfont sprite, the assets/icons svg set, or references `#icon-` sprite ids; every chrome icon renders from the one drawn chromeIcons module (M-057).
//   SCOPE: Static source scan over src/renderer/src/{components,prefComponents,pages}.
//   DEPENDS: Vitest, node:fs/node:path source reads.
//   LINKS: .grace/verification/runtime.xml V-M-011 scenario-56; .grace/graph/runtime.xml M-057.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   ROOT - repository root.
//   RENDERER_SRC - src/renderer/src.
//   isAllowed - allow-list membership check.
//   SCAN_ROOTS - the chrome source trees covered by the scan.
//   ALLOW_LIST - files exempt from the scan; each entry MUST carry a comment. Empty today — document-side surfaces (muya front menus, CodeMirror, diagrams) live outside the scanned roots.
//   collectSourceFiles - recursive .vue/.js collector for a root.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-15 C-38 T-006 initial guard.
// END_CHANGE_SUMMARY

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve, join, relative } from 'node:path'

const ROOT = resolve(__dirname, '..', '..', '..')
const RENDERER_SRC = join(ROOT, 'src', 'renderer', 'src')

const SCAN_ROOTS = [
  join(RENDERER_SRC, 'components'),
  join(RENDERER_SRC, 'prefComponents'),
  join(RENDERER_SRC, 'pages')
]

// Exemptions must reference genuinely document-side files that cannot
// draw from the chrome set, each with a reason. There are none today:
// the muya editor content (front menus, CodeMirror pane, diagrams)
// lives under src/muya, outside the scanned roots.
const ALLOW_LIST = []

const collectSourceFiles = (dir) => {
  const out = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) {
      out.push(...collectSourceFiles(full))
    } else if (/\.(vue|js|ts)$/.test(entry)) {
      out.push(full)
    }
  }
  return out
}

const isAllowed = (file) =>
  ALLOW_LIST.some((allowed) => file === join(RENDERER_SRC, allowed.path))

describe('chrome draws from one icon set (C-38 T-006 N4 d)', () => {
  const files = SCAN_ROOTS.flatMap((root) => collectSourceFiles(root))
    .filter((file) => !isAllowed(file))

  it('scans a non-empty chrome surface', () => {
    expect(files.length).toBeGreaterThan(50)
  })

  it('no chrome file imports the iconfont sprite', () => {
    const offenders = files.filter((file) =>
      /['"][^'"\n]*assets\/symbolIcon[^'"\n]*['"]/.test(readFileSync(file, 'utf8'))
    )
    expect(offenders.map((f) => relative(ROOT, f))).toEqual([])
  })

  it('no chrome file imports from assets/icons', () => {
    const offenders = files.filter((file) =>
      /['"][^'"\n]*assets\/icons[^'"\n]*['"]/.test(readFileSync(file, 'utf8'))
    )
    expect(offenders.map((f) => relative(ROOT, f))).toEqual([])
  })

  it('no chrome file references sprite ids (#icon-…) through use[href]', () => {
    const offenders = files.filter((file) =>
      /(?:xlink:)?href="#icon-/.test(readFileSync(file, 'utf8'))
    )
    expect(offenders.map((f) => relative(ROOT, f))).toEqual([])
  })

  it('the notification service template renders chromeIconMarkup, not sprite use refs', () => {
    const template = readFileSync(
      join(RENDERER_SRC, 'services', 'notification', 'index.html'),
      'utf8'
    )
    expect(template).not.toMatch(/#icon-/)
    expect(template).toMatch(/\{\{iconSvg\}\}/)
    const service = readFileSync(
      join(RENDERER_SRC, 'services', 'notification', 'index.js'),
      'utf8'
    )
    expect(service).toMatch(/chromeIconMarkup/)
  })
})
