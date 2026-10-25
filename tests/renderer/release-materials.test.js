// FILE: tests/renderer/release-materials.test.js
// VERSION: 2.1.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin exact release-material identity for the checked-in package version across train scope, public prose, ten locales, README image references, tracked files, and screenshot digests.
//   SCOPE: Repository-positive integration plus isolated locale, image-set, review, and digest negative fixtures; no screenshot capture or publication.
//   DEPENDS: Vitest; tools/release-materials.mjs; the release materials of the package.json version and the train that carries it.
//   LINKS: .grace/verification/features.xml V-M-046; .grace/verification/runtime.xml V-M-011.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   LOCALES - Ten canonical release locale identifiers.
//   VERSION - The checked-in package.json version whose materials the repository carries.
//   VERSION_KEY - Locale whatsNew key of VERSION.
//   VERSION_TRAIN - Train ledger whose computedVersion is VERSION, if any.
//   STRICT_STATES - Train states whose materials must be complete.
//   SCREENSHOTS - Screenshot manifest path of VERSION.
//   readJson - Read one repository JSON fixture.
//   localeTables - Load source and minified locale tables for pure validation.
//   rejectedWith - Assert one stable materials failure code.
//   restoreChangelogDraft - Reconstruct a stable draft fixture from a promoted release section.
//   windowsNewlines - Produce exactly one CRLF sequence per logical line break.
//   materialHeaders - Load the three human release-material sources.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-10-24 v2.1.0: the in-app link is checked through the release date that must equal the CHANGELOG heading date.
//   - 2026-10-24 v2.0.0: C-RELEASE-CONVEYOR — derive the version, its train, locale keys and screenshot manifest from the repository instead of pinning 2.8.1, so a version bump no longer breaks this suite.
//   - 2026-10-21 v1.4.0: keep negative material fixtures stable across collecting and prepared release-PR states.
//   - 2026-10-20 v1.3.0: prove Windows CRLF checkouts retain the same README, CHANGELOG, and release-notes identity.
//   - 2026-10-20 v1.2.0: pin the single unversioned CHANGELOG draft and exact-one numbered handoff contract.
//   - 2026-10-20 v1.1.0: add independent README, CHANGELOG, notes, in-app source, URL, and missing-PNG negative fixtures.
//   - 2026-10-20 v1.0.0: add the mandatory release-material and screenshot-manifest regression matrix.
// END_CHANGE_SUMMARY

import { mkdtempSync, readdirSync, readFileSync } from 'node:fs'
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
const VERSION = readJson('package.json').version
const VERSION_KEY = `v${VERSION.replace(/[.-]/g, '_')}`
const STRICT_STATES = new Set(['Frozen', 'Ready', 'Released'])
const VERSION_TRAIN = readdirSync(resolve('docs/release-trains'))
  .filter((name) => /^\d+\.\d+\.(x|\d+)-next\.json$/.test(name))
  .map((name) => ({ path: `docs/release-trains/${name}`, train: readJson(`docs/release-trains/${name}`) }))
  .find(({ train }) => train.computedVersion === VERSION && STRICT_STATES.has(train.state))
const SCREENSHOTS = `docs/assets/readme/${VERSION}.manifest.json`
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
  const escapedVersion = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  if (new RegExp(`^## \\[${escapedVersion}\\]`, 'm').test(source)) {
    // A draft next to a dated VERSION section belongs to the next release.
    source = source.replace(/<!-- release-draft:start -->[\s\S]*?<!-- release-draft:end -->\n*/, '')
  }
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
    VERSION
  ),
  notes: readFileSync(resolve('docs/release-notes-en-drafts.md'), 'utf8'),
  version: VERSION
})

// START_BLOCK_RELEASE_MATERIALS_TESTS
describe('release materials', () => {
  // While a new version is only being prepared its materials are still
  // drafts; the release/readiness job enforces them from Frozen on, so
  // the full positive check runs whenever the version has a sealed train.
  it.runIf(VERSION_TRAIN)('validates every checked-in material surface of the package version together', () => {
    const items = VERSION_TRAIN.train.materials.itemIds.length
    expect(
      validateReleaseMaterials(process.cwd(), `v${VERSION}`, { trainPath: VERSION_TRAIN.path })
    ).toMatchObject({
      version: VERSION,
      locales: { localeCount: 10, itemCount: items },
      screenshots: { imageCount: readJson(SCREENSHOTS).images.length },
      scopeItems: items
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
    const [entry] = Object.keys(minified.fr.whatsNew[VERSION_KEY])
    minified.fr.whatsNew[VERSION_KEY][entry].title = 'drift'
    rejectedWith(
      () => validateLocaleMaterials(source, minified, VERSION),
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

  it('accepts exactly one numbered CHANGELOG section after draft promotion', () => {
    const materials = materialHeaders()
    materials.state = 'Frozen'
    materials.changelog = materials.changelog
      .replace('<!-- release-draft:start -->', `## [${VERSION}] - 2026-10-23`)
      .replace('<!-- release-draft:end -->', '')
    expect(validateMaterialHeaders(materials)).toBeUndefined()
  })

  it('accepts the next release draft beside a Released version only', () => {
    const materials = materialHeaders()
    materials.changelog = materials.changelog
      .replace('<!-- release-draft:start -->', `## [${VERSION}] - 2026-10-23\n\n<!-- release-draft:start -->`)
    expect(validateMaterialHeaders({ ...materials, state: 'Released' })).toBeUndefined()
    rejectedWith(() => validateMaterialHeaders({ ...materials, state: 'Ready' }), 'MT_RELEASE_CHANGELOG_VERSION_MISMATCH')
  })

  it('rejects duplicate numbered CHANGELOG sections independently', () => {
    const materials = materialHeaders()
    materials.changelog = materials.changelog
      .replace('<!-- release-draft:start -->', `## [${VERSION}] - 2026-10-23`)
      .replace('<!-- release-draft:end -->', `## [${VERSION}] - 2026-10-23`)
    rejectedWith(
      () => validateMaterialHeaders(materials),
      'MT_RELEASE_CHANGELOG_VERSION_MISMATCH'
    )
  })

  it('rejects a stale README heading independently', () => {
    const materials = materialHeaders()
    materials.readme = materials.readme.replace(`## What's new in ${VERSION}`, "## What's new in 0.0.1")
    rejectedWith(
      () => validateMaterialHeaders(materials),
      'MT_RELEASE_README_VERSION_MISMATCH'
    )
  })

  it('rejects an absent reviewed release-notes draft independently', () => {
    const materials = materialHeaders()
    materials.notes = materials.notes.replace(`## v${VERSION}`, '## v9.9.9')
    rejectedWith(
      () => validateMaterialHeaders(materials),
      'MT_RELEASE_NOTES_MISSING'
    )
  })

  it('rejects missing in-app content for the requested version independently', () => {
    const source = readFileSync(resolve('src/renderer/src/whatsNew/data.js'), 'utf8')
      .replace(`'${VERSION}': [`, "'9.9.9': [")
    rejectedWith(
      () => validateWhatsNewSource(source, VERSION, '2026-01-01'),
      'MT_RELEASE_WHATS_NEW_MISMATCH'
    )
  })

  it('rejects an in-app release date that differs from the CHANGELOG heading independently', () => {
    const source = readFileSync(resolve('src/renderer/src/whatsNew/data.js'), 'utf8')
    const date = new RegExp(`^## \\[${VERSION.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\] - (\\d{4}-\\d{2}-\\d{2})`, 'm').exec(readFileSync(resolve('CHANGELOG.md'), 'utf8'))?.[1]
    expect(validateWhatsNewSource(source, VERSION, date)).toBe(true)
    rejectedWith(
      () => validateWhatsNewSource(source, VERSION, '1999-01-01'),
      'MT_RELEASE_WHATS_NEW_MISMATCH'
    )
  })

  it('rejects a locale that translates a product name the English copy uses', () => {
    const { source, minified } = localeTables()
    const [entry] = Object.keys(source.en.whatsNew[VERSION_KEY])
    const english = JSON.stringify(source.en.whatsNew[VERSION_KEY])
    const token = ['Mark', 'macOS', 'PDF', 'Markdown'].find((name) => english.includes(name))
    if (!token) return
    source.de.whatsNew[VERSION_KEY][entry].text = source.de.whatsNew[VERSION_KEY][entry].text.replaceAll(token, 'X')
    minified.de = structuredClone(source.de)
    rejectedWith(() => validateLocaleMaterials(source, minified, VERSION), 'MT_RELEASE_LOCALE_COPY_INVALID')
  })

  it('rejects one missing locale independently', () => {
    const { source, minified } = localeTables()
    delete source.ja
    rejectedWith(
      () => validateLocaleMaterials(source, minified, VERSION),
      'MT_RELEASE_LOCALE_MISSING'
    )
  })

  it('rejects copy that exceeds the board layout independently', () => {
    const { source, minified } = localeTables()
    const [entry] = Object.keys(source.en.whatsNew[VERSION_KEY])
    source.en.whatsNew[VERSION_KEY][entry].title = 'x'.repeat(33)
    minified.en = structuredClone(source.en)
    rejectedWith(
      () => validateLocaleMaterials(source, minified, VERSION),
      'MT_RELEASE_LOCALE_LAYOUT_INVALID'
    )
  })

  it('rejects a screenshot digest mismatch independently', () => {
    const manifest = readJson(SCREENSHOTS)
    manifest.images[0].sha256 = '0'.repeat(64)
    const readme = readFileSync(resolve('README.md'), 'utf8')
    rejectedWith(
      () =>
        validateScreenshotManifest({
          workspaceRoot: process.cwd(),
          readme,
          manifest,
          version: VERSION,
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
          releaseVersion: VERSION,
          captureCommand: 'README_SHOTS=1 npx playwright test tests/e2e/readme-shots.spec.ts --project=chromium',
          captureState: 'fresh-reviewed',
          review: { reviewer: 'owner', reviewedAt: '2026-10-20', scenarios: ['Reviewed.'] },
          images: [{ path, sha256: '0'.repeat(64) }]
        },
        version: VERSION,
        trackedPaths: new Set([path])
      }),
      'MT_RELEASE_SCREENSHOT_MISSING'
    )
  })

  it('rejects a missing README image manifest entry independently', () => {
    const manifest = readJson(SCREENSHOTS)
    manifest.images.pop()
    const readme = readFileSync(resolve('README.md'), 'utf8')
    rejectedWith(
      () =>
        validateScreenshotManifest({
          workspaceRoot: process.cwd(),
          readme,
          manifest,
          version: VERSION,
          trackedPaths: new Set(manifest.images.map(({ path }) => path))
        }),
      'MT_RELEASE_SCREENSHOT_SET_MISMATCH'
    )
  })

  it('rejects missing visual-review evidence independently', () => {
    const manifest = readJson(SCREENSHOTS)
    manifest.review.scenarios = []
    const readme = readFileSync(resolve('README.md'), 'utf8')
    rejectedWith(
      () =>
        validateScreenshotManifest({
          workspaceRoot: process.cwd(),
          readme,
          manifest,
          version: VERSION,
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
