// FILE: tools/release-normalize.mjs
// VERSION: 2.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Propagate the package.json version (set in the preparation PR with `npm version`) into Mark's secondary Cargo, Tauri, fixture, and version-bound material surfaces without calculating a version.
//   SCOPE: Deterministic plan/check/write over an allowlisted file set, including one explicit CHANGELOG draft handoff and atomic machine/human train preparation; never edits package authority, tags, GitHub Releases, or external state.
//   DEPENDS: Node.js fs, path, and url standard-library modules; tools/release-train.mjs; package.json; release-preflight surfaces.
//   LINKS: .grace/graph/features.xml M-046; .grace/verification/features.xml V-M-046.
//   ROLE: SCRIPT
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   ReleaseNormalizeError - Stable coded normalization error.
//   planReleaseNormalization - Compute an ordered allowlisted patch from the package.json version.
//   applyReleaseNormalization - Write the planned patch and prove a second plan is empty.
//   runReleaseNormalize - Execute check or write mode with stable diagnostics.
//   SEMVER - Exact supported release version grammar.
//   SOURCE_LOCALES - Exact source locale set normalized with release materials.
//   fail - Raise one stable normalization error.
//   readJson - Read one JSON version authority.
//   withNewline - Serialize formatted JSON with a terminal newline.
//   replaceExact - Apply one required deterministic text replacement.
//   bumpFixtureDocumentVersion - Advance the release-preflight fixture and its semantic metadata.
//   replaceHeadingVersion - Advance one exact current-draft heading without touching history.
//   replaceInBlock - Transform only one named semantic block.
//   replaceWhatsNewVersion - Advance only the current in-app draft entry and URL.
//   renameLocaleDraft - Rename only one current locale draft key.
//   promoteChangelogDraft - Move the unversioned curated draft into one dated version section.
//   prepareTrainLedger - Keep the human train ledger synchronized with the machine authority.
//   addChange - Add one changed allowlisted file to the normalization plan.
//   main - Run the command-line interface.
//   invokedPath - Detect direct command-line execution.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-10-24 v2.0.0: C-RELEASE-CONVEYOR — package.json is the single version authority (Release Please and its manifest removed); the train resolves through the current-train pointer; a CHANGELOG without a numbered section receives one; the ledger status line is matched generically.
//   - 2026-10-21 v1.3.0: preserve LF or CRLF while synchronizing the human train ledger on every runner OS.
//   - 2026-10-21 v1.2.0: synchronize the human train ledger with the machine-readable Collecting-to-Preparing transition.
//   - 2026-10-20 v1.1.0: normalize only explicit draft surfaces, promote curated CHANGELOG copy into one generated section, and retire the one-use last-release boundary.
//   - 2026-10-20 v1.0.0: add Release Please-owned version propagation with no independent SemVer override.
// END_CHANGE_SUMMARY

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { resolveCurrentTrain } from './release-train.mjs'

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/
const SOURCE_LOCALES = ['de', 'en', 'es', 'fr', 'ja', 'ko', 'pt', 'ru', 'zh-CN', 'zh-TW']

export class ReleaseNormalizeError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'ReleaseNormalizeError'
    this.code = code
  }
}

const fail = (code, message) => {
  throw new ReleaseNormalizeError(code, message)
}

const readJson = (pathname) => JSON.parse(readFileSync(pathname, 'utf8'))
const withNewline = (value) => `${JSON.stringify(value, null, 2)}\n`

const replaceExact = (source, pattern, replacement, code, label) => {
  if (!pattern.test(source)) fail(code, `${label}=missing`)
  return source.replace(pattern, replacement)
}

const bumpFixtureDocumentVersion = (source, targetVersion, date) => {
  const currentRelease = /const consistentEvidence = \{[\s\S]*?packageJson: '([^']+)'/.exec(source)?.[1]
  if (!currentRelease) fail('MT_RELEASE_NORMALIZE_FIXTURE_INVALID', 'consistentEvidence=missing')
  if (currentRelease === targetVersion) return source
  const headerVersion = /\/\/ VERSION: (\d+)\.(\d+)\.(\d+)/.exec(source)
  if (!headerVersion) fail('MT_RELEASE_NORMALIZE_FIXTURE_INVALID', 'moduleVersion=missing')
  const nextModuleVersion = `${headerVersion[1]}.${Number(headerVersion[2]) + 1}.0`
  let updated = source.replace(
    /\/\/ VERSION: \d+\.\d+\.\d+/,
    `// VERSION: ${nextModuleVersion}`
  )
  updated = updated.replace(
    /\/\/   consistentEvidence - Complete v[^ ]+ version fixture\./,
    `//   consistentEvidence - Complete v${targetVersion} version fixture.`
  )
  const blockStart = updated.indexOf('const consistentEvidence = {')
  const blockEnd = updated.indexOf('// END_BLOCK_RELEASE_VERSION_TESTS')
  if (blockStart === -1 || blockEnd === -1 || blockEnd <= blockStart) {
    fail('MT_RELEASE_NORMALIZE_FIXTURE_INVALID', 'releaseVersionBlock=missing')
  }
  const before = updated.slice(0, blockStart)
  const block = updated
    .slice(blockStart, blockEnd)
    .replaceAll(`'${currentRelease}'`, `'${targetVersion}'`)
    .replaceAll(`'v${currentRelease}'`, `'v${targetVersion}'`)
  updated = before + block + updated.slice(blockEnd)
  updated = updated.replace(
    '// START_CHANGE_SUMMARY\n//   LAST_CHANGE:',
    `// START_CHANGE_SUMMARY\n//   LAST_CHANGE: ${date} v${nextModuleVersion} - advance the normalized positive fixture to v${targetVersion}.\n//   PREV:`
  )
  return updated
}

const replaceHeadingVersion = (source, prefix, fromVersion, targetVersion, label) => {
  if (fromVersion === targetVersion) return source
  const current = `${prefix}${fromVersion}`
  if (source.split(current).length !== 2) {
    fail('MT_RELEASE_NORMALIZE_MATERIAL_INVALID', `${label}=ambiguous`)
  }
  return source.replace(current, `${prefix}${targetVersion}`)
}

const replaceInBlock = (source, startMarker, endMarker, transform, label) => {
  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker)
  if (start === -1 || end === -1 || end <= start || source.indexOf(startMarker, start + 1) !== -1) {
    fail('MT_RELEASE_NORMALIZE_MATERIAL_INVALID', `${label}=block-invalid`)
  }
  const before = source.slice(0, start)
  const block = source.slice(start, end)
  return before + transform(block) + source.slice(end)
}

const replaceWhatsNewVersion = (source, fromVersion, targetVersion) => {
  if (fromVersion === targetVersion) return source
  const fromKey = `v${fromVersion.replace(/[.-]/g, '_')}`
  const targetKey = `v${targetVersion.replace(/[.-]/g, '_')}`
  let updated = replaceInBlock(
    source,
    '// START_BLOCK_WHATS_NEW_CONTENT',
    '// END_BLOCK_WHATS_NEW_CONTENT',
    (block) => {
      const entry = `  '${fromVersion}': [`
      if (block.split(entry).length !== 2) {
        fail('MT_RELEASE_NORMALIZE_MATERIAL_INVALID', 'whatsNew.content=ambiguous')
      }
      return block
        .replace(entry, `  '${targetVersion}': [`)
        .replaceAll(`whatsNew.${fromKey}.`, `whatsNew.${targetKey}.`)
    },
    'whatsNew.content'
  )
  updated = replaceInBlock(
    updated,
    '// START_BLOCK_WHATS_NEW_EXTRAS',
    '// END_BLOCK_WHATS_NEW_EXTRAS',
    (block) => {
      const current = `  '${fromVersion}': 'https://github.com/xronocode/mark/releases/tag/v${fromVersion}'`
      if (block.split(current).length !== 2) {
        fail('MT_RELEASE_NORMALIZE_MATERIAL_INVALID', 'whatsNew.url=ambiguous')
      }
      return block.replace(
        current,
        `  '${targetVersion}': 'https://github.com/xronocode/mark/releases/tag/v${targetVersion}'`
      )
    },
    'whatsNew.extras'
  )
  return updated
}

const renameLocaleDraft = (table, fromVersion, targetVersion, locale) => {
  if (fromVersion === targetVersion) return table
  const fromKey = `v${fromVersion.replace(/[.-]/g, '_')}`
  const targetKey = `v${targetVersion.replace(/[.-]/g, '_')}`
  if (!table.whatsNew?.[fromKey] || table.whatsNew[targetKey]) {
    fail('MT_RELEASE_NORMALIZE_MATERIAL_INVALID', `locale=${locale};draftKey=invalid`)
  }
  table.whatsNew = Object.fromEntries(
    Object.entries(table.whatsNew).map(([key, value]) => [key === fromKey ? targetKey : key, value])
  )
  return table
}

const promoteChangelogDraft = (source, targetVersion, date) => {
  const startMarker = '<!-- release-draft:start -->'
  const endMarker = '<!-- release-draft:end -->'
  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker)
  if (start === -1 && end === -1) return source
  if (start === -1 || end === -1 || end <= start) {
    fail('MT_RELEASE_NORMALIZE_CHANGELOG_INVALID', 'draft=invalid')
  }
  const draft = source.slice(start + startMarker.length, end).trim()
  if (!draft) fail('MT_RELEASE_NORMALIZE_CHANGELOG_INVALID', 'draft=empty')
  const headingPattern = new RegExp(`^## \\[${targetVersion.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\][^\\n]*$`, 'gm')
  const headings = [...source.matchAll(headingPattern)]
  if (headings.length > 1) {
    fail('MT_RELEASE_NORMALIZE_CHANGELOG_INVALID', `numbered=${headings.length}`)
  }
  const datedHeading = `## [${targetVersion}] - ${date}`
  if (headings.length === 0) {
    // No generated section: the curated draft becomes the dated section in place.
    return `${source.slice(0, start)}${datedHeading}\n\n${draft}\n${source.slice(end + endMarker.length)}`
  }
  let withoutDraft = `${source.slice(0, start)}${source.slice(end + endMarker.length)}`
  const heading = headings[0][0]
  const headingStart = withoutDraft.indexOf(heading)
  if (headingStart === -1) fail('MT_RELEASE_NORMALIZE_CHANGELOG_INVALID', 'numbered=lost')
  const bodyStart = headingStart + heading.length
  const nextHeadingOffset = withoutDraft.slice(bodyStart).search(/^## \[/m)
  const bodyEnd = nextHeadingOffset === -1 ? withoutDraft.length : bodyStart + nextHeadingOffset
  withoutDraft =
    withoutDraft.slice(0, headingStart) +
    `${datedHeading}\n\n${draft}\n\n` +
    withoutDraft.slice(bodyEnd).replace(/^\s+/, '')
  return withoutDraft
}

const prepareTrainLedger = (source, targetVersion) => {
  const statePattern = /^(\| State \| )(Collecting|Preparing)( \|)(\r?)$/gm
  const stateRows = [...source.matchAll(statePattern)]
  if (stateRows.length !== 1) {
    fail('MT_RELEASE_NORMALIZE_LEDGER_INVALID', `stateRows=${stateRows.length}`)
  }
  let updated = source.replace(
    statePattern,
    (_match, prefix, _state, suffix, carriageReturn) =>
      `${prefix}Preparing${suffix}${carriageReturn}`
  )
  const preparedStatus = `- The checked-in train is **Preparing**. The preparation PR set ${targetVersion} with npm version and synchronized package, Cargo, Tauri, and train-ledger metadata; no tag or publication was created.`
  if (updated.includes(preparedStatus)) return updated
  updated = replaceExact(
    updated,
    /^- The checked-in train remains \*\*Collecting\*\*\.[^\r\n]*?(\r?)$/m,
    (_match, carriageReturn) => `${preparedStatus}${carriageReturn}`,
    'MT_RELEASE_NORMALIZE_LEDGER_INVALID',
    'preparation status'
  )
  return updated
}

const addChange = (changes, root, relativePath, nextContents) => {
  const pathname = resolve(root, relativePath)
  const current = existsSync(pathname) ? readFileSync(pathname, 'utf8') : null
  if (current !== nextContents) {
    changes.push({ path: relativePath, before: current, after: nextContents })
  }
}

// START_CONTRACT: planReleaseNormalization
//   PURPOSE: Compute the allowlisted version-propagation patch from package.json, never from an explicit target.
//   INPUTS: { workspaceRoot: string - repository root, options: object - deterministic fixture date }
//   OUTPUTS: { object - authoritative version, state, and ordered file changes }
//   SIDE_EFFECTS: Reads allowlisted repository files only.
//   LINKS: .grace/verification/features.xml V-M-046 normalization scenarios
// END_CONTRACT: planReleaseNormalization
// START_BLOCK_PLAN_RELEASE_NORMALIZATION
export const planReleaseNormalization = (
  workspaceRoot,
  { date = new Date().toISOString().slice(0, 10) } = {}
) => {
  const root = resolve(workspaceRoot)
  const packageVersion = readJson(resolve(root, 'package.json')).version
  if (!SEMVER.test(packageVersion ?? '')) {
    fail('MT_RELEASE_NORMALIZE_AUTHORITY_MISMATCH', `package=${packageVersion ?? 'missing'}`)
  }
  const current = resolveCurrentTrain(root)
  const train = readJson(resolve(root, current.json))
  const previousVersion = train.previousRelease?.tag?.replace(/^v/, '')
  if (packageVersion === previousVersion) {
    return { version: packageVersion, state: 'awaiting-version', changes: [] }
  }
  const changes = []

  const cargoTomlPath = resolve(root, 'Cargo.toml')
  const cargoToml = readFileSync(cargoTomlPath, 'utf8')
  addChange(
    changes,
    root,
    'Cargo.toml',
    replaceExact(
      cargoToml,
      /(\[workspace\.package\][\s\S]*?^version\s*=\s*")[^"]+(".*$)/m,
      `$1${packageVersion}$2`,
      'MT_RELEASE_NORMALIZE_SURFACE_INVALID',
      'Cargo.toml workspace version'
    )
  )

  const cargoLock = readFileSync(resolve(root, 'Cargo.lock'), 'utf8')
  addChange(
    changes,
    root,
    'Cargo.lock',
    replaceExact(
      cargoLock,
      /(\[\[package\]\]\s*\nname\s*=\s*"mark"\s*\nversion\s*=\s*")[^"]+("\s*\n)/m,
      `$1${packageVersion}$2`,
      'MT_RELEASE_NORMALIZE_SURFACE_INVALID',
      'Cargo.lock mark version'
    )
  )

  const tauriPath = 'src-tauri/tauri.conf.json'
  const tauriSource = readFileSync(resolve(root, tauriPath), 'utf8')
  const tauriVersion = readJson(resolve(root, tauriPath)).version
  addChange(
    changes,
    root,
    tauriPath,
    tauriSource.replace(
      new RegExp(`("version"\\s*:\\s*")${tauriVersion.replaceAll('.', '\\.')}(")`),
      `$1${packageVersion}$2`
    )
  )

  const fixturePath = 'tests/renderer/release-preflight.test.js'
  addChange(
    changes,
    root,
    fixturePath,
    bumpFixtureDocumentVersion(
      readFileSync(resolve(root, fixturePath), 'utf8'),
      packageVersion,
      date
    )
  )

  const oldMaterialVersion = train.computedVersion
  train.computedVersion = packageVersion
  if (train.state === 'Collecting') {
    train.state = 'Preparing'
    train.transitions.push({
      state: 'Preparing',
      date,
      actor: 'release-normalize',
      evidence: `Preparation set ${packageVersion}; no tag or publication was created.`
    })
  } else if (train.state !== 'Preparing') {
    fail('MT_RELEASE_NORMALIZE_LIFECYCLE_INVALID', `state=${train.state}`)
  }
  train.materials.screenshotManifest = `docs/assets/readme/${packageVersion}.manifest.json`
  addChange(changes, root, current.json, withNewline(train))
  const trainLedgerPath = current.markdown
  addChange(
    changes,
    root,
    trainLedgerPath,
    prepareTrainLedger(readFileSync(resolve(root, trainLedgerPath), 'utf8'), packageVersion)
  )

  addChange(
    changes,
    root,
    'README.md',
    replaceHeadingVersion(
      readFileSync(resolve(root, 'README.md'), 'utf8'),
      "## What's new in ",
      oldMaterialVersion,
      packageVersion,
      'README'
    )
  )
  addChange(
    changes,
    root,
    'docs/release-notes-en-drafts.md',
    replaceHeadingVersion(
      readFileSync(resolve(root, 'docs/release-notes-en-drafts.md'), 'utf8'),
      '## v',
      oldMaterialVersion,
      packageVersion,
      'releaseNotes'
    )
  )
  addChange(
    changes,
    root,
    'src/renderer/src/whatsNew/data.js',
    replaceWhatsNewVersion(
      readFileSync(resolve(root, 'src/renderer/src/whatsNew/data.js'), 'utf8'),
      oldMaterialVersion,
      packageVersion
    )
  )
  addChange(
    changes,
    root,
    'CHANGELOG.md',
    promoteChangelogDraft(readFileSync(resolve(root, 'CHANGELOG.md'), 'utf8'), packageVersion, date)
  )

  for (const locale of SOURCE_LOCALES) {
    const sourcePath = `static/locales/${locale}.json`
    const minPath = `static/locales/${locale}.min.json`
    const table = renameLocaleDraft(
      readJson(resolve(root, sourcePath)),
      oldMaterialVersion,
      packageVersion,
      locale
    )
    addChange(changes, root, sourcePath, withNewline(table))
    addChange(changes, root, minPath, JSON.stringify(table))
  }

  const oldManifestPath = resolve(root, `docs/assets/readme/${oldMaterialVersion}.manifest.json`)
  if (existsSync(oldManifestPath)) {
    const screenshot = readJson(oldManifestPath)
    screenshot.releaseVersion = packageVersion
    screenshot.payloadSha = null
    addChange(
      changes,
      root,
      `docs/assets/readme/${packageVersion}.manifest.json`,
      withNewline(screenshot)
    )
  }
  return { version: packageVersion, state: 'planned', changes }
}
// END_BLOCK_PLAN_RELEASE_NORMALIZATION

// START_CONTRACT: applyReleaseNormalization
//   PURPOSE: Write exactly one computed normalization plan and prove replanning is byte-empty.
//   INPUTS: { workspaceRoot: string - repository root, plan: object - output of planReleaseNormalization, options: object - deterministic fixture date }
//   OUTPUTS: { object - version and written path list }
//   SIDE_EFFECTS: Writes only the allowlisted paths present in the plan.
//   LINKS: .grace/verification/features.xml V-M-046 normalization scenarios
// END_CONTRACT: applyReleaseNormalization
// START_BLOCK_APPLY_RELEASE_NORMALIZATION
export const applyReleaseNormalization = (workspaceRoot, plan, options = {}) => {
  const root = resolve(workspaceRoot)
  for (const change of plan.changes) {
    writeFileSync(resolve(root, change.path), change.after)
  }
  const second = planReleaseNormalization(root, options)
  if (second.changes.length) {
    fail('MT_RELEASE_NORMALIZE_NOT_IDEMPOTENT', `remaining=${second.changes.length}`)
  }
  return { version: plan.version, written: plan.changes.map(({ path }) => path) }
}
// END_BLOCK_APPLY_RELEASE_NORMALIZATION

// START_CONTRACT: runReleaseNormalize
//   PURPOSE: Run non-writing check or explicit trusted write mode and emit stable normalization evidence.
//   INPUTS: { workspaceRoot: string - repository root, options: object - write and requireClean flags }
//   OUTPUTS: { object - normalization state and path list }
//   SIDE_EFFECTS: Writes allowlisted files only when write is true; otherwise stdout only.
//   LINKS: .grace/verification/features.xml V-M-046 required-log-markers
// END_CONTRACT: runReleaseNormalize
// START_BLOCK_RUN_RELEASE_NORMALIZE
export const runReleaseNormalize = (workspaceRoot, options = {}) => {
  const plan = planReleaseNormalization(workspaceRoot, options)
  if (options.requireClean && plan.changes.length) {
    fail('MT_RELEASE_NORMALIZE_DRIFT', `files=${plan.changes.length}`)
  }
  const result = options.write
    ? applyReleaseNormalization(workspaceRoot, plan, options)
    : { version: plan.version, state: plan.state, planned: plan.changes.map(({ path }) => path) }
  console.info(
    `[ReleaseNormalize][plan][BLOCK_RELEASE_NORMALIZE_${options.write ? 'APPLIED' : 'CHECKED'}] version=${plan.version} state=${plan.state} files=${plan.changes.length}`
  )
  return result
}
// END_BLOCK_RUN_RELEASE_NORMALIZE

const main = () => {
  try {
    const args = process.argv.slice(2)
    if (args.some((arg) => ['--version', '--target', '--release-as'].includes(arg))) {
      fail('MT_RELEASE_NORMALIZE_OVERRIDE_FORBIDDEN', 'explicitTarget=forbidden')
    }
    const write = args.includes('--write')
    const check = args.includes('--check') || !write
    if (write && check && args.includes('--check')) {
      fail('MT_RELEASE_NORMALIZE_ARGUMENT_INVALID', 'mode=conflicting')
    }
    runReleaseNormalize(process.cwd(), {
      write,
      requireClean: args.includes('--require-clean')
    })
  } catch (error) {
    const code = error?.code ?? 'MT_RELEASE_NORMALIZE_INVALID'
    console.error(`[ReleaseNormalize][plan][BLOCK_RELEASE_NORMALIZE_REJECTED] code=${code} ${error.message}`)
    process.exitCode = 1
  }
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : ''
if (import.meta.url === invokedPath) main()
