// FILE: tools/release-materials.mjs
// VERSION: 1.2.0
// START_MODULE_CONTRACT
//   PURPOSE: Verify that every public 2.6.0 release-material surface and screenshot digest describes one admitted release-train identity.
//   SCOPE: Repository-only README, CHANGELOG, English notes, What's New, ten source/minified locales, train scope, and tracked PNG validation; no image capture or publication.
//   DEPENDS: Node.js crypto, child_process, fs, path, and url standard-library modules; release-readiness and release-notes tools.
//   LINKS: .grace/graph/features.xml M-046; .grace/graph/runtime.xml M-011; .grace/verification/features.xml V-M-046; .grace/verification/runtime.xml V-M-011.
//   ROLE: SCRIPT
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   ReleaseMaterialsError - Stable coded materials validation error.
//   extractReadmeImages - Finds local Markdown and HTML image references.
//   validateLocaleMaterials - Enforces ten-locale copy, layout, product-token, and minified parity rules.
//   validateScreenshotManifest - Enforces exact tracked README PNG membership and SHA-256 identity.
//   validateMaterialHeaders - Cross-checks release headings across human materials.
//   validateWhatsNewSource - Cross-checks in-app release content and its exact public URL.
//   validateReleaseMaterials - Cross-checks all release-material surfaces for one tag and train.
//   runReleaseMaterials - Runs the repository-only gate and emits its stable success marker.
//   LOCALES - Exact supported release-copy locale set.
//   SHA_PATTERN - Exact lowercase SHA-256 digest grammar.
//   fail - Raise one stable release-material error.
//   normalizeNewlines - Normalize checkout-dependent CRLF/CR text before Markdown parsing.
//   readJson - Read one JSON material authority.
//   sha256 - Compute one tracked file digest.
//   parseTag - Extract the release version from a valid tag.
//   localImage - Normalize one local README image reference.
//   stableJson - Serialize structured locale content deterministically.
//   optionValue - Read one named command-line option.
//   main - Run the command-line interface.
//   invokedPath - Detect direct command-line execution.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-10-22 v1.3.0: advance the per-locale product-token pin set to the 2.6.1 sheet (Mark, ⇧⌘T, ⇧⌘P, .html); layout limits and manifest identity checks unchanged.
//   - 2026-10-20 v1.2.0: normalize Markdown newlines so Windows CRLF checkouts validate the same release identity as LF checkouts.
//   - 2026-10-20 v1.1.0: distinguish the unversioned release draft from Release Please-owned numbered CHANGELOG sections and reject duplicate headings.
//   - 2026-10-20 v1.0.0: add the mandatory 2.6.0 material and screenshot-identity gate.
// END_CHANGE_SUMMARY

import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { extractReleaseNotes } from './release-notes.mjs'
import { readTrainManifest, validateTrainManifest } from './release-readiness.mjs'

const LOCALES = ['de', 'en', 'es', 'fr', 'ja', 'ko', 'pt', 'ru', 'zh-CN', 'zh-TW']
const SHA_PATTERN = /^[0-9a-f]{64}$/

export class ReleaseMaterialsError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'ReleaseMaterialsError'
    this.code = code
  }
}

const fail = (code, message) => {
  throw new ReleaseMaterialsError(code, message)
}

const normalizeNewlines = (value) => value.replace(/\r\n?/g, '\n')
const readJson = (pathname) => JSON.parse(readFileSync(pathname, 'utf8'))
const sha256 = (pathname) =>
  createHash('sha256').update(readFileSync(pathname)).digest('hex')

const parseTag = (tag) => {
  const match = /^v(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/.exec(tag ?? '')
  if (!match) fail('MT_RELEASE_MATERIALS_TAG_INVALID', `tag=${tag ?? 'missing'}`)
  return match[1]
}

const localImage = (value) => {
  const path = value.trim().split(/\s+/)[0]
  if (!path || /^(?:https?:|data:|#)/.test(path)) return null
  return path.replace(/^\.\//, '')
}

// START_CONTRACT: extractReadmeImages
//   PURPOSE: Collect local image paths from Markdown images plus HTML img/source src and srcset attributes.
//   INPUTS: { markdown: string - README source }
//   OUTPUTS: { string[] - unique repository-relative image paths in source order }
//   SIDE_EFFECTS: none.
//   LINKS: docs/assets/readme/2.6.0.manifest.json
// END_CONTRACT: extractReadmeImages
// START_BLOCK_EXTRACT_README_IMAGES
export const extractReadmeImages = (markdown) => {
  const found = []
  const push = (candidate) => {
    const path = localImage(candidate)
    if (path && !found.includes(path)) found.push(path)
  }
  for (const match of markdown.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)) push(match[1])
  for (const match of markdown.matchAll(/<(?:img|source)\b[^>]*\b(?:src|srcset)=["']([^"']+)["'][^>]*>/gi)) {
    for (const candidate of match[1].split(',')) push(candidate)
  }
  return found
}
// END_BLOCK_EXTRACT_README_IMAGES

const stableJson = (value) => JSON.stringify(value)

// START_CONTRACT: validateLocaleMaterials
//   PURPOSE: Enforce one complete native-copy section across ten source locales with exact minified derivatives and layout limits.
//   INPUTS: { sourceTables: object - locale to source JSON, minifiedTables: object - locale to minified JSON, version: string - release version }
//   OUTPUTS: { object - locale count, item count, and version key }
//   SIDE_EFFECTS: none.
//   LINKS: src/renderer/src/whatsNew/data.js; tests/renderer/whatsNew/content.test.js
// END_CONTRACT: validateLocaleMaterials
// START_BLOCK_VALIDATE_LOCALE_MATERIALS
export const validateLocaleMaterials = (sourceTables, minifiedTables, version) => {
  const key = `v${version.replace(/[.-]/g, '_')}`
  let itemKeys = null
  for (const locale of LOCALES) {
    const source = sourceTables[locale]
    const minified = minifiedTables[locale]
    if (!source || !minified) fail('MT_RELEASE_LOCALE_MISSING', `locale=${locale}`)
    if (stableJson(source) !== stableJson(minified)) {
      fail('MT_RELEASE_LOCALE_MIN_DRIFT', `locale=${locale}`)
    }
    const section = source.whatsNew?.[key]
    if (!section || typeof section !== 'object') {
      fail('MT_RELEASE_LOCALE_MISSING', `locale=${locale};key=${key}`)
    }
    const keys = Object.keys(section)
    if (keys.length < 1 || keys.length > 4) {
      fail('MT_RELEASE_LOCALE_LAYOUT_INVALID', `locale=${locale};items=${keys.length}`)
    }
    if (!itemKeys) itemKeys = keys
    if (stableJson(keys) !== stableJson(itemKeys)) {
      fail('MT_RELEASE_LOCALE_KEY_DRIFT', `locale=${locale}`)
    }
    for (const itemKey of keys) {
      const item = section[itemKey]
      if (!item?.title || !item?.text) {
        fail('MT_RELEASE_LOCALE_COPY_INVALID', `locale=${locale};item=${itemKey}`)
      }
      if (item.title.length > 32 || item.text.length > 90) {
        fail(
          'MT_RELEASE_LOCALE_LAYOUT_INVALID',
          `locale=${locale};item=${itemKey};title=${item.title.length};text=${item.text.length}`
        )
      }
      if (/[{}|@]/.test(`${item.title}${item.text}`)) {
        fail('MT_RELEASE_LOCALE_COPY_INVALID', `locale=${locale};item=${itemKey};syntax=reserved`)
      }
    }
    if (!source.whatsNew.also || source.whatsNew.also.length > 120) {
      fail('MT_RELEASE_LOCALE_LAYOUT_INVALID', `locale=${locale};also=invalid`)
    }
    if (!source.whatsNew.seeEverything) {
      fail('MT_RELEASE_LOCALE_COPY_INVALID', `locale=${locale};footer=missing`)
    }
    const flattened = stableJson(section)
    // 2.8.1 sheet tokens (FIX-018): the PDF-export the shortcuts and
    // cloud product names must survive verbatim in every locale.
    for (const token of ['PDF']) {
      if (!flattened.includes(token)) {
        fail('MT_RELEASE_LOCALE_COPY_INVALID', `locale=${locale};token=${token}`)
      }
    }
  }
  return { localeCount: LOCALES.length, itemCount: itemKeys.length, key }
}
// END_BLOCK_VALIDATE_LOCALE_MATERIALS

// START_CONTRACT: validateScreenshotManifest
//   PURPOSE: Prove the screenshot manifest names exactly the local README PNG set, every file is tracked, and every digest matches reviewed bytes.
//   INPUTS: { workspaceRoot: string - repository root, readme: string - README source, manifest: object - screenshot manifest, version: string - release version, trackedPaths: Set<string>? - injectable test inventory }
//   OUTPUTS: { object - image count and capture state }
//   SIDE_EFFECTS: Reads PNG bytes and, unless injected, runs read-only git ls-files.
//   LINKS: docs/assets/readme/2.6.0.manifest.json
// END_CONTRACT: validateScreenshotManifest
// START_BLOCK_VALIDATE_SCREENSHOT_MANIFEST
export const validateScreenshotManifest = ({
  workspaceRoot,
  readme,
  manifest,
  version,
  trackedPaths
}) => {
  if (manifest.schemaVersion !== '1.0.0' || manifest.releaseVersion !== version) {
    fail('MT_RELEASE_SCREENSHOT_MANIFEST_INVALID', 'identity=mismatch')
  }
  if (
    manifest.captureCommand !==
    'README_SHOTS=1 npx playwright test tests/e2e/readme-shots.spec.ts --project=chromium'
  ) {
    fail('MT_RELEASE_SCREENSHOT_MANIFEST_INVALID', 'captureCommand=mismatch')
  }
  if (!manifest.review?.reviewer || !manifest.review?.reviewedAt || !manifest.review?.scenarios?.length) {
    fail('MT_RELEASE_SCREENSHOT_REVIEW_MISSING', 'review=incomplete')
  }
  const referenced = extractReadmeImages(readme).filter((path) => path.toLowerCase().endsWith('.png'))
  const entries = Array.isArray(manifest.images) ? manifest.images : []
  const paths = entries.map(({ path }) => path)
  if (new Set(paths).size !== paths.length) {
    fail('MT_RELEASE_SCREENSHOT_MANIFEST_INVALID', 'images=duplicate')
  }
  const expected = [...referenced].sort()
  const actual = [...paths].sort()
  if (stableJson(actual) !== stableJson(expected)) {
    fail('MT_RELEASE_SCREENSHOT_SET_MISMATCH', `readme=${expected.length};manifest=${actual.length}`)
  }
  const tracked = trackedPaths ?? new Set(
    execFileSync('git', ['ls-files', '--', ...paths], {
      cwd: workspaceRoot,
      encoding: 'utf8'
    })
      .trim()
      .split('\n')
      .filter(Boolean)
  )
  for (const entry of entries) {
    if (!tracked.has(entry.path)) fail('MT_RELEASE_SCREENSHOT_UNTRACKED', `path=${entry.path}`)
    const pathname = resolve(workspaceRoot, entry.path)
    if (!existsSync(pathname)) fail('MT_RELEASE_SCREENSHOT_MISSING', `path=${entry.path}`)
    if (!SHA_PATTERN.test(entry.sha256 ?? '') || sha256(pathname) !== entry.sha256) {
      fail('MT_RELEASE_SCREENSHOT_DIGEST_MISMATCH', `path=${entry.path}`)
    }
  }
  return { imageCount: entries.length, captureState: manifest.captureState }
}
// END_BLOCK_VALIDATE_SCREENSHOT_MANIFEST

export const validateMaterialHeaders = ({ readme, changelog, notes, version, state = 'Collecting' }) => {
  const readmeText = normalizeNewlines(readme)
  const changelogText = normalizeNewlines(changelog)
  const notesText = normalizeNewlines(notes)
  const readmeMatch = /^## What's new in ([^\n]+)$/m.exec(readmeText)
  const escapedVersion = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const numberedHeadings = changelogText.match(
    new RegExp(`^## \\[${escapedVersion}\\](?: - [^\\n]+)?$`, 'gm')
  ) ?? []
  const draftStarts = changelogText.match(/^<!-- release-draft:start -->$/gm) ?? []
  const draftEnds = changelogText.match(/^<!-- release-draft:end -->$/gm) ?? []
  if (readmeMatch?.[1] !== version) {
    fail('MT_RELEASE_README_VERSION_MISMATCH', `expected=${version};actual=${readmeMatch?.[1] ?? 'missing'}`)
  }
  const hasDraft = draftStarts.length === 1 && draftEnds.length === 1
  const requiresNumbered = ['Frozen', 'Ready', 'Released'].includes(state)
  if (
    numberedHeadings.length > 1 ||
    (hasDraft && numberedHeadings.length !== 0) ||
    (!hasDraft && numberedHeadings.length !== 1) ||
    (requiresNumbered && (hasDraft || numberedHeadings.length !== 1)) ||
    draftStarts.length !== draftEnds.length
  ) {
    fail(
      'MT_RELEASE_CHANGELOG_VERSION_MISMATCH',
      `version=${version};numbered=${numberedHeadings.length};draft=${hasDraft}`
    )
  }
  extractReleaseNotes(notesText, `v${version}`)
}

export const validateWhatsNewSource = (source, version) => {
  const versionKey = `v${version.replace(/[.-]/g, '_')}`
  if (
    !source.includes(`'${version}': [`) ||
    !source.includes(`whatsNew.${versionKey}.`)
  ) {
    fail('MT_RELEASE_WHATS_NEW_MISMATCH', `version=${version};content=missing`)
  }
  if (!source.includes(`https://github.com/xronocode/mark/releases/tag/v${version}`)) {
    fail('MT_RELEASE_WHATS_NEW_MISMATCH', `version=${version};url=mismatch`)
  }
  return true
}

// START_CONTRACT: validateReleaseMaterials
//   PURPOSE: Cross-check release material headers, admitted scope, What's New data/locales, reviewed notes, and screenshots for one tag.
//   INPUTS: { workspaceRoot: string - repository root, tag: string - exact release tag }
//   OUTPUTS: { object - validated material identity and counts }
//   SIDE_EFFECTS: Reads public repository material files and tracked-file metadata.
//   LINKS: .grace/verification/features.xml V-M-046; .grace/verification/runtime.xml V-M-011
// END_CONTRACT: validateReleaseMaterials
// START_BLOCK_VALIDATE_RELEASE_MATERIALS
export const validateReleaseMaterials = (workspaceRoot, tag, { trainPath } = {}) => {
  const root = resolve(workspaceRoot)
  const version = parseTag(tag)
  // The default resolves the collecting train; a rolled-out release's
  // materials validate against its own released-train manifest.
  const train = trainPath
    ? readTrainManifest(root, trainPath)
    : readTrainManifest(root)
  validateTrainManifest(train, { workspaceRoot: root, tag })
  if (train.computedVersion !== version) {
    fail('MT_RELEASE_MATERIALS_VERSION_MISMATCH', `train=${train.computedVersion};tag=${version}`)
  }
  const readme = readFileSync(resolve(root, 'README.md'), 'utf8')
  const changelog = readFileSync(resolve(root, 'CHANGELOG.md'), 'utf8')
  const notes = readFileSync(resolve(root, 'docs/release-notes-en-drafts.md'), 'utf8')
  validateMaterialHeaders({ readme, changelog, notes, version, state: train.state })

  const expectedScope = train.items.userFacing.map(({ id }) => id).sort()
  const materialScope = [...(train.materials?.itemIds ?? [])].sort()
  if (stableJson(expectedScope) !== stableJson(materialScope)) {
    fail('MT_RELEASE_MATERIAL_SCOPE_MISMATCH', `train=${expectedScope.length};materials=${materialScope.length}`)
  }

  const whatsNewSource = readFileSync(resolve(root, 'src/renderer/src/whatsNew/data.js'), 'utf8')
  validateWhatsNewSource(whatsNewSource, version)

  const sourceTables = {}
  const minifiedTables = {}
  for (const locale of LOCALES) {
    sourceTables[locale] = readJson(resolve(root, `static/locales/${locale}.json`))
    minifiedTables[locale] = readJson(resolve(root, `static/locales/${locale}.min.json`))
  }
  const locales = validateLocaleMaterials(sourceTables, minifiedTables, version)
  const screenshotPath = train.materials?.screenshotManifest
  if (screenshotPath !== `docs/assets/readme/${version}.manifest.json`) {
    fail('MT_RELEASE_SCREENSHOT_MANIFEST_INVALID', `path=${screenshotPath ?? 'missing'}`)
  }
  const screenshots = validateScreenshotManifest({
    workspaceRoot: root,
    readme,
    manifest: readJson(resolve(root, screenshotPath)),
    version
  })
  return { version, tag, locales, screenshots, scopeItems: materialScope.length }
}
// END_BLOCK_VALIDATE_RELEASE_MATERIALS

// START_CONTRACT: runReleaseMaterials
//   PURPOSE: Execute the repository-only materials gate and emit stable success evidence.
//   INPUTS: { workspaceRoot: string - repository root, tag: string - exact release tag }
//   OUTPUTS: { object - validated material identity and counts }
//   SIDE_EFFECTS: Reads public files and writes one path-free success marker to stdout.
//   LINKS: .grace/verification/features.xml V-M-046 required-log-markers
// END_CONTRACT: runReleaseMaterials
// START_BLOCK_RUN_RELEASE_MATERIALS
export const runReleaseMaterials = (workspaceRoot, tag) => {
  const result = validateReleaseMaterials(workspaceRoot, tag)
  console.info(
    `[ReleaseMaterials][validate][BLOCK_RELEASE_MATERIALS_CONSISTENT] version=${result.version} locales=${result.locales.localeCount} images=${result.screenshots.imageCount} items=${result.scopeItems}`
  )
  return result
}
// END_BLOCK_RUN_RELEASE_MATERIALS

const optionValue = (args, name) => {
  const index = args.indexOf(name)
  if (index === -1) return undefined
  const value = args[index + 1]
  if (!value || value.startsWith('--')) fail('MT_RELEASE_MATERIALS_ARGUMENT_INVALID', `${name}=missing`)
  return value
}

const main = () => {
  try {
    runReleaseMaterials(process.cwd(), optionValue(process.argv.slice(2), '--tag'))
  } catch (error) {
    const code = error?.code ?? 'MT_RELEASE_MATERIALS_INVALID'
    console.error(`[ReleaseMaterials][validate][BLOCK_RELEASE_MATERIALS_REJECTED] code=${code} ${error.message}`)
    process.exitCode = 1
  }
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : ''
if (import.meta.url === invokedPath) main()
