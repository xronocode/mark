// FILE: tests/renderer/release-materials.test.js
// VERSION: 1.4.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin exact 2.6.0 release-material identity across train scope, public prose, ten locales, README image references, tracked files, and screenshot digests.
//   SCOPE: Repository-positive integration plus isolated locale, image-set, review, and digest negative fixtures; no screenshot capture or publication.
//   DEPENDS: Vitest; tools/release-materials.mjs; public 2.6.0 release materials.
//   LINKS: .grace/verification/features.xml V-M-046; .grace/verification/runtime.xml V-M-011.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   LOCALES - Ten canonical release locale identifiers.
//   readJson - Read one repository JSON fixture.
//   localeTables - Load source and minified locale tables for pure validation.
//   rejectedWith - Assert one stable materials failure code.
//   restoreChangelogDraft - Reconstruct a stable draft fixture from a promoted release section.
//   windowsNewlines - Produce exactly one CRLF sequence per logical line break.
//   materialHeaders - Load the three human release-material sources.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-10-21 v1.4.0: keep negative material fixtures stable across collecting and prepared release-PR states.
//   - 2026-10-20 v1.3.0: prove Windows CRLF checkouts retain the same README, CHANGELOG, and release-notes identity.
//   - 2026-10-20 v1.2.0: pin the single unversioned CHANGELOG draft and exact-one numbered handoff contract.
//   - 2026-10-20 v1.1.0: add independent README, CHANGELOG, notes, in-app source, URL, and missing-PNG negative fixtures.
//   - 2026-10-20 v1.0.0: add the mandatory release-material and screenshot-manifest regression matrix.
// END_CHANGE_SUMMARY

import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  extractReadmeImages,
  validateLocaleMaterials,
  validateMaterialHeaders,
  validateReleaseMaterials,
  validateScreenshotManifest,
  validateWhatsNewSource
} from '../../tools/release-materials.mjs'

const LOCALES = ['de', 'en', 'es', 'fr', 'ja', 'ko', 'pt', 'ru', 'zh-CN', 'zh-TW']
const readJson = (path) => JSON.parse(readFileSync(resolve(path), 'utf8'))
const localeTables = () => ({
  source: Object.fromEntries(
    LOCALES.map((locale) => [locale, readJson(`static/locales/${locale}.json`)])
  ),
  minified: Object.fromEntries(
    LOCALES.map((locale) => [locale, readJson(`static/locales/${locale}.min.json`)])
  )
})
const rejectedWith = (callback, code) => {
  expect(callback).toThrow(expect.objectContaining({ code }))
}
const restoreChangelogDraft = (source, version) => {
  if (source.includes('<!-- release-draft:start -->')) return source
  const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const section = new RegExp(
    `^## \\[${escaped}\\][^\\n]*\\n+([\\s\\S]*?)(?=^## \\[)`,
    'm'
  )
  const match = section.exec(source)
  if (!match) throw new Error(`Cannot restore CHANGELOG draft for ${version}`)
  return source.replace(
    match[0],
    `<!-- release-draft:start -->\n\n${match[1].trim()}\n\n<!-- release-draft:end -->\n\n`
  )
}
const windowsNewlines = (source) =>
  source.replace(/\r\n?/g, '\n').replaceAll('\n', '\r\n')
const materialHeaders = () => ({
  readme: readFileSync(resolve('README.md'), 'utf8'),
  changelog: restoreChangelogDraft(
    readFileSync(resolve('CHANGELOG.md'), 'utf8'),
    '2.6.0'
  ),
  notes: readFileSync(resolve('docs/release-notes-en-drafts.md'), 'utf8'),
  version: '2.6.0'
})

// START_BLOCK_RELEASE_MATERIALS_TESTS
describe('release materials', () => {
  it('validates every checked-in 2.6.0 material surface together', () => {
    expect(validateReleaseMaterials(process.cwd(), 'v2.6.0')).toMatchObject({
      version: '2.6.0',
      locales: { localeCount: 10, itemCount: 4 },
      screenshots: { imageCount: 9 },
      scopeItems: 14
    })
  })

  it('validates human material headers after a Windows CRLF checkout', () => {
    const materials = materialHeaders()
    materials.readme = windowsNewlines(materials.readme)
    materials.changelog = windowsNewlines(materials.changelog)
    materials.notes = windowsNewlines(materials.notes)
    expect(validateMaterialHeaders(materials)).toBeUndefined()
  })

  it('extracts local Markdown and HTML image references while ignoring remote badges', () => {
    const source = [
      '![local](docs/a.png)',
      '![remote](https://example.test/badge.svg)',
      '<source srcset="docs/dark.png 1x, docs/dark@2x.png 2x">',
      '<img src="docs/light.png">'
    ].join('\n')
    expect(extractReadmeImages(source)).toEqual([
      'docs/a.png',
      'docs/dark.png',
      'docs/dark@2x.png',
      'docs/light.png'
    ])
  })

  it('rejects source/minified locale drift independently', () => {
    const { source, minified } = localeTables()
    minified.fr.whatsNew.v2_6_0.tableImages.title = 'drift'
    rejectedWith(
      () => validateLocaleMaterials(source, minified, '2.6.0'),
      'MT_RELEASE_LOCALE_MIN_DRIFT'
    )
  })

  it('rejects a missing CHANGELOG entry independently', () => {
    const materials = materialHeaders()
    materials.changelog = materials.changelog.replace('<!-- release-draft:start -->', '')
    rejectedWith(
      () => validateMaterialHeaders(materials),
      'MT_RELEASE_CHANGELOG_VERSION_MISMATCH'
    )
  })

  it('accepts exactly one Release Please-owned numbered CHANGELOG section after draft promotion', () => {
    const materials = materialHeaders()
    materials.state = 'Frozen'
    materials.changelog = materials.changelog
      .replace('<!-- release-draft:start -->', '## [2.6.0] - 2026-10-20')
      .replace('<!-- release-draft:end -->', '')
    expect(validateMaterialHeaders(materials)).toBeUndefined()
  })

  it('rejects duplicate numbered CHANGELOG sections independently', () => {
    const materials = materialHeaders()
    materials.changelog = materials.changelog
      .replace('<!-- release-draft:start -->', '## [2.6.0] - 2026-10-20')
      .replace('<!-- release-draft:end -->', '## [2.6.0] - 2026-10-20')
    rejectedWith(
      () => validateMaterialHeaders(materials),
      'MT_RELEASE_CHANGELOG_VERSION_MISMATCH'
    )
  })

  it('rejects a stale README heading independently', () => {
    const materials = materialHeaders()
    materials.readme = materials.readme.replace("## What's new in 2.6.0", "## What's new in 2.5.3")
    rejectedWith(
      () => validateMaterialHeaders(materials),
      'MT_RELEASE_README_VERSION_MISMATCH'
    )
  })

  it('rejects an absent reviewed release-notes draft independently', () => {
    const materials = materialHeaders()
    materials.notes = materials.notes.replace('## v2.6.0', '## v9.9.9')
    rejectedWith(
      () => validateMaterialHeaders(materials),
      'MT_RELEASE_NOTES_MISSING'
    )
  })

  it('rejects missing in-app content for the requested version independently', () => {
    const source = readFileSync(resolve('src/renderer/src/whatsNew/data.js'), 'utf8')
      .replace("'2.6.0': [", "'9.9.9': [")
    rejectedWith(
      () => validateWhatsNewSource(source, '2.6.0'),
      'MT_RELEASE_WHATS_NEW_MISMATCH'
    )
  })

  it('rejects a wrong in-app release URL independently', () => {
    const source = readFileSync(resolve('src/renderer/src/whatsNew/data.js'), 'utf8')
      .replace('/releases/tag/v2.6.0', '/releases/tag/v9.9.9')
    rejectedWith(
      () => validateWhatsNewSource(source, '2.6.0'),
      'MT_RELEASE_WHATS_NEW_MISMATCH'
    )
  })

  it('rejects one missing locale independently', () => {
    const { source, minified } = localeTables()
    delete source.ja
    rejectedWith(
      () => validateLocaleMaterials(source, minified, '2.6.0'),
      'MT_RELEASE_LOCALE_MISSING'
    )
  })

  it('rejects copy that exceeds the board layout independently', () => {
    const { source, minified } = localeTables()
    source.en.whatsNew.v2_6_0.tableImages.title = 'x'.repeat(33)
    minified.en = structuredClone(source.en)
    rejectedWith(
      () => validateLocaleMaterials(source, minified, '2.6.0'),
      'MT_RELEASE_LOCALE_LAYOUT_INVALID'
    )
  })

  it('rejects a screenshot digest mismatch independently', () => {
    const manifest = readJson('docs/assets/readme/2.6.0.manifest.json')
    manifest.images[0].sha256 = '0'.repeat(64)
    const readme = readFileSync(resolve('README.md'), 'utf8')
    rejectedWith(
      () =>
        validateScreenshotManifest({
          workspaceRoot: process.cwd(),
          readme,
          manifest,
          version: '2.6.0',
          trackedPaths: new Set(manifest.images.map(({ path }) => path))
        }),
      'MT_RELEASE_SCREENSHOT_DIGEST_MISMATCH'
    )
  })

  it('rejects a missing README PNG independently', () => {
    const root = mkdtempSync(resolve(tmpdir(), 'mark-materials-'))
    const path = 'docs/assets/readme/missing.png'
    rejectedWith(
      () => validateScreenshotManifest({
        workspaceRoot: root,
        readme: `![missing](${path})`,
        manifest: {
          schemaVersion: '1.0.0',
          releaseVersion: '2.6.0',
          captureCommand: 'README_SHOTS=1 npx playwright test tests/e2e/readme-shots.spec.ts --project=chromium',
          captureState: 'fresh-reviewed',
          review: { reviewer: 'owner', reviewedAt: '2026-10-20', scenarios: ['Reviewed.'] },
          images: [{ path, sha256: '0'.repeat(64) }]
        },
        version: '2.6.0',
        trackedPaths: new Set([path])
      }),
      'MT_RELEASE_SCREENSHOT_MISSING'
    )
  })

  it('rejects a missing README image manifest entry independently', () => {
    const manifest = readJson('docs/assets/readme/2.6.0.manifest.json')
    manifest.images.pop()
    const readme = readFileSync(resolve('README.md'), 'utf8')
    rejectedWith(
      () =>
        validateScreenshotManifest({
          workspaceRoot: process.cwd(),
          readme,
          manifest,
          version: '2.6.0',
          trackedPaths: new Set(manifest.images.map(({ path }) => path))
        }),
      'MT_RELEASE_SCREENSHOT_SET_MISMATCH'
    )
  })

  it('rejects missing visual-review evidence independently', () => {
    const manifest = readJson('docs/assets/readme/2.6.0.manifest.json')
    manifest.review.scenarios = []
    const readme = readFileSync(resolve('README.md'), 'utf8')
    rejectedWith(
      () =>
        validateScreenshotManifest({
          workspaceRoot: process.cwd(),
          readme,
          manifest,
          version: '2.6.0',
          trackedPaths: new Set(manifest.images.map(({ path }) => path))
        }),
      'MT_RELEASE_SCREENSHOT_REVIEW_MISSING'
    )
  })

  it('rejects a release tag that disagrees with the computed materials version', () => {
    rejectedWith(
      () => validateReleaseMaterials(process.cwd(), 'v2.5.4'),
      'MT_RELEASE_IDENTITY_MISMATCH'
    )
  })
})
// END_BLOCK_RELEASE_MATERIALS_TESTS
