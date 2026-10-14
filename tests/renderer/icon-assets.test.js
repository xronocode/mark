// FILE: tests/renderer/icon-assets.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin the C-33 icon wiring and keep the committed icon sources in sync with their generator.
//   SCOPE: Info.plist CFBundleIconName, tauri.conf bundle.macOS.files → Assets.car, Icon Composer icon.json appearances, gen.py output == committed SVGs/icon.json.
//   DEPENDS: python3 (gen.py, stdlib only), assets/icon/*, src-tauri/*.
//   LINKS: .grace/changes/active/C-33; assets/icon/gen.py; assets/icon/build.sh
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   root - repository root.
//   GENERATED - files gen.py writes and the repo commits.
//   (hash) - Assets.car.sources.sha256 recomputed like build.sh does.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - C-33: initial pins (incl. Assets.car source-hash drift check).
// END_CHANGE_SUMMARY

import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync, mkdtempSync, cpSync, rmSync, readdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'

const root = resolve(import.meta.dirname, '../..')
const GENERATED = [
  'mark-icon.svg', 'mark-icon-dark.svg', 'mark-icon-tinted.svg', 'mark-icon-small.svg',
  'mark-icon-full-bleed.svg', 'AppIcon.icon/icon.json', 'AppIcon.icon/Assets/ink.svg', 'AppIcon.icon/Assets/bowl.svg'
]

describe('C-33 icon assets', () => {
  it('Info.plist names the Icon Composer icon and the bundle ships Assets.car', () => {
    const plist = readFileSync(join(root, 'src-tauri/Info.plist'), 'utf8')
    expect(plist).toMatch(/<key>CFBundleIconName<\/key>\s*<string>AppIcon<\/string>/)
    const conf = JSON.parse(readFileSync(join(root, 'src-tauri/tauri.conf.json'), 'utf8'))
    expect(conf.bundle.macOS.files['Resources/Assets.car']).toBe('icons/Assets.car')
    expect(existsSync(join(root, 'src-tauri/icons/Assets.car'))).toBe(true)
    expect(conf.bundle.icon).toContain('icons/icon.icns')
  })

  it('the MAS overlay keeps the Assets.car mapping (merge patch only adds keys)', () => {
    const mas = JSON.parse(readFileSync(join(root, 'src-tauri/tauri.mas.conf.json'), 'utf8'))
    expect(mas.bundle?.macOS?.files).toBeUndefined()
  })

  it('icon.json defines default, dark and tinted appearances for both layers', () => {
    const doc = JSON.parse(readFileSync(join(root, 'assets/icon/AppIcon.icon/icon.json'), 'utf8'))
    expect(doc['fill-specializations'].map((s) => s.appearance ?? 'default')).toEqual(['default', 'dark'])
    for (const layer of doc.groups[0].layers) {
      expect(layer['fill-specializations'].map((s) => s.appearance ?? 'default')).toEqual(['default', 'dark', 'tinted'])
      expect(existsSync(join(root, 'assets/icon/AppIcon.icon/Assets', layer['image-name']))).toBe(true)
    }
    // layer recolouring fills every shape: no stroke-only paths allowed
    const ink = readFileSync(join(root, 'assets/icon/AppIcon.icon/Assets/ink.svg'), 'utf8')
    expect(ink).not.toMatch(/fill="none"/)
  })

  it('Assets.car was compiled from the current AppIcon.icon sources', () => {
    const dir = join(root, 'assets/icon/AppIcon.icon')
    const files = ['icon.json', ...readdirSync(join(dir, 'Assets')).sort().map((f) => 'Assets/' + f)]
    const hash = createHash('sha256')
    for (const f of files) {
      hash.update(f + '\n')
      hash.update(readFileSync(join(dir, f)))
    }
    const recorded = readFileSync(join(root, 'src-tauri/icons/Assets.car.sources.sha256'), 'utf8').trim()
    expect(hash.digest('hex'), 'rebuild with assets/icon/build.sh').toBe(recorded)
  })

  it('committed sources equal a fresh gen.py run', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'mark-icon-'))
    try {
      cpSync(join(root, 'assets/icon/gen.py'), join(tmp, 'gen.py'))
      execFileSync('python3', [join(tmp, 'gen.py')], { stdio: 'pipe' })
      for (const f of GENERATED) {
        expect(readFileSync(join(tmp, f), 'utf8'), f).toBe(readFileSync(join(root, 'assets/icon', f), 'utf8'))
      }
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })
})
