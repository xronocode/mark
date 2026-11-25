// @vitest-environment node
// FILE: tests/tools/mas-pkg-smoke.test.mjs
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Execute the Mac App Store admission procedure (tools/release/mas-pkg.sh) against a synthetic bundle, proving the package is declared upload-ready only after the exact packaged build boots on the host — a startup crash or a non-executable binary stops the procedure before the artifact/upload handoff — instead of trusting script text pins alone (F-001: the MAS procedure verified signatures but never confirmed the packaged build functioned).
//   SCOPE: The checked-in mas-pkg.sh copied byte-identical into a per-test fixture tree shaped like the repository (tools/release/mas-pkg.sh + target/release/bundle/macos/Mark.app); codesign/productbuild/pkgutil/xattr run as PATH shims that log argv and exit zero (nothing is ever really signed or packaged); PlistBuddy runs for real because the script addresses it by absolute path; every file lives in the per-test temp tree; no network, no keychain, no upload.
//   DEPENDS: Vitest; node:child_process/fs/os/path/url built-ins; bash, real PlistBuddy and a real du (macOS), skipped with an explicit reason elsewhere.
//   LINKS: tools/release/mas-pkg.sh; tools/build-mas.sh.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   masPkgScript - checked-in tools/release/mas-pkg.sh read as text.
//   assertSmokeOrdering - structural pin: the smoke section sits between the pkg signature check and the artifact/upload declaration, the steps are renumbered /4 and the coded BLOCK marker gates the handoff.
//   makeFixtureRoot - per-test repo-shaped tree: the script copied verbatim (equality asserted) plus a Mark.app whose Info.plist is real (PlistBuddy edits it) and whose Contents/MacOS/mark is the per-case stub.
//   prepareShims - codesign/productbuild/pkgutil/xattr PATH stubs that log argv and exit zero; productbuild touches its final argument so the artifact line has a real file to measure.
//   runMasPkg - spawns bash over the fixture copy under HOME=fixture root and the shim PATH.
//   assertNoProcess - polls pgrep until no process matches the stub path (the smoke must reap what it launched).
//   BOOTING_STUB - the long-lived binary behavior the smoke must accept.
//   CRASHING_STUB - the immediately-exiting binary behavior the smoke must refuse.
//   shimSource - the /bin/sh PATH-stub template that logs argv and exits zero, optionally touching its final argument.
//   repoRoot - repository root resolved from this file's location.
//   hostHasBash - one-time probe gating the execution cases.
//   hostHasPgrep - one-time probe gating the process-reaping assertion.
//   bashSkipReason - explicit reason reported when bash is absent.
//   darwinSkipReason - explicit reason reported off macOS (absolute-path PlistBuddy dependency).
//   makeTempRoot - the per-test temp tree; the only directory any test writes to or removes.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   - 2026-11-25 v1.0.0 CICD-GUARD-FIXES F-001: execution gate lands FIRST and red by design — on the pre-fix script text there is no smoke section and no BLOCK marker, so a crashing packaged build reached the artifact/upload handoff; the procedure fix adds the mandatory boot smoke and flips the gate green (booting build, crashing build, non-executable binary) while the smoke's position between signature verification and the artifact declaration stays pinned.
// END_CHANGE_SUMMARY

import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const masPkgScript = readFileSync(join(repoRoot, 'tools/release/mas-pkg.sh'), 'utf8')

const hostHasBash = (() => {
  const probe = spawnSync('bash', ['-c', 'true'], { encoding: 'utf8', timeout: 5000 })
  return !probe.error && probe.status === 0
})()
const hostHasPgrep = (() => {
  const probe = spawnSync('pgrep', ['-fl', 'mas-pkg-smoke-no-such-process'], {
    encoding: 'utf8',
    timeout: 5000
  })
  return !probe.error
})()
const bashSkipReason =
  'skipped: this host has no working bash — the gate executes the procedure script with bash'
const darwinSkipReason =
  'skipped: the MAS admission procedure is macOS-only by construction — it edits the bundle Info.plist with the absolute-path /usr/libexec/PlistBuddy'

const makeTempRoot = () => mkdtempSync(join(tmpdir(), 'mas-pkg-smoke-'))

// Structural pin over the checked-in text: the smoke is mandatory admission
// evidence, so it must sit between the pkg signature check and the
// artifact/upload declaration, and the whole procedure carries the /4
// renumbering with the coded BLOCK marker.
const assertSmokeOrdering = () => {
  for (const marker of ['== 1/4 ', '== 2/4 ', '== 3/4 ', '== 4/4 ']) {
    expect(masPkgScript).toContain(marker)
  }
  expect(masPkgScript).not.toMatch(/== [0-9]\/3 /)
  const signatureCheck = masPkgScript.indexOf('pkgutil --check-signature "$PKG"')
  const smoke = masPkgScript.indexOf('== 4/4 functional smoke')
  const artifact = masPkgScript.indexOf('say "artifact: $PKG')
  expect(signatureCheck).toBeGreaterThan(-1)
  expect(smoke).toBeGreaterThan(signatureCheck)
  expect(artifact).toBeGreaterThan(smoke)
  // The coded marker appears in the smoke section and gates the handoff.
  const block = masPkgScript.indexOf('BLOCK_MAS_SMOKE_NOT_BOOTED')
  expect(block).toBeGreaterThan(signatureCheck)
  expect(block).toBeLessThan(artifact)
  // The smoke launches the exact packaged bundle's binary.
  expect(masPkgScript).toContain('APP_BIN="$APP/Contents/MacOS/mark"')
}

const shimSource = (tool, logFile, touchLast) => `#!/bin/sh
# PATH shim: nothing may really sign, package or verify on this host —
# record the argv and exit zero${touchLast ? '; touch the final argument so downstream steps see the artifact' : ''}.
printf '%s\\n' "${tool} $*" >> "${logFile}"
${
  touchLast
    ? `for arg in "$@"; do last="$arg"; done\n[ -n "\${last:-}" ] && touch "$last"\nexit 0`
    : 'exit 0'
}
`

const prepareShims = (tempRoot) => {
  const shimDir = join(tempRoot, 'shims')
  const logFile = join(tempRoot, 'tooling-shims.log')
  mkdirSync(shimDir, { recursive: true })
  for (const [tool, touchLast] of [
    ['codesign', false],
    ['productbuild', true],
    ['pkgutil', false],
    ['xattr', false]
  ]) {
    const shim = join(shimDir, tool)
    writeFileSync(shim, shimSource(tool, logFile, touchLast))
    chmodSync(shim, 0o755)
  }
  return shimDir
}

// The exact bundle tree the procedure expects, under the fixture root that
// `cd "$(dirname "$0")/../.."` resolves to. Info.plist is real because the
// script edits it with the absolute-path PlistBuddy; the binary is the
// per-case stub.
const makeFixtureRoot = (tempRoot, stubBody) => {
  const fixtureRoot = join(tempRoot, 'repo')
  const scriptCopy = join(fixtureRoot, 'tools/release/mas-pkg.sh')
  const appContents = join(fixtureRoot, 'target/release/bundle/macos/Mark.app/Contents')
  mkdirSync(join(fixtureRoot, 'tools/release'), { recursive: true })
  mkdirSync(join(appContents, 'MacOS'), { recursive: true })
  // The executed script is the checked-in script, byte for byte.
  copyFileSync(join(repoRoot, 'tools/release/mas-pkg.sh'), scriptCopy)
  expect(readFileSync(scriptCopy, 'utf8')).toBe(masPkgScript)
  chmodSync(scriptCopy, 0o755)
  writeFileSync(
    join(appContents, 'Info.plist'),
    '<?xml version="1.0" encoding="UTF-8"?>\n<plist version="1.0"><dict><key>LSMinimumSystemVersion</key><string>11.0</string><key>LSApplicationCategoryType</key><string>public.app-category.utilities</string></dict></plist>\n'
  )
  const stub = join(appContents, 'MacOS', 'mark')
  writeFileSync(stub, stubBody)
  chmodSync(stub, 0o755)
  return { fixtureRoot, scriptCopy, stub }
}

// The booting stub loops on one-second sleeps: still alive well past the
// smoke's 5s window, while any orphaned sleep child left by the smoke's
// kill holds the inherited stdio pipes open for at most one second (a long
// single sleep would stall the spawnSync read long after the script exits).
const BOOTING_STUB = '#!/bin/sh\nwhile :; do sleep 1; done\n'
const CRASHING_STUB = '#!/bin/sh\nexit 1\n'

const runMasPkg = ({ fixtureRoot, scriptCopy, shimDir }) =>
  spawnSync('bash', [scriptCopy], {
    encoding: 'utf8',
    timeout: 60000,
    env: {
      ...process.env,
      HOME: fixtureRoot,
      PATH: `${shimDir}${delimiter}${process.env.PATH ?? ''}`
    }
  })

const assertNoProcess = (stub) => {
  if (!hostHasPgrep) return
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const probe = spawnSync('pgrep', ['-f', stub], { encoding: 'utf8' })
    if (probe.status !== 0) return
    spawnSync('sleep', ['1'], { encoding: 'utf8' })
  }
  throw new Error('the smoke left the launched packaged-build process running')
}

describe('MAS pkg functional smoke execution gate (F-001)', () => {
  it('gates the artifact handoff on the functional smoke', () => {
    assertSmokeOrdering()
  })

  it.skipIf(!hostHasBash || process.platform !== 'darwin')(
    'declares the artifact ready after a booting packaged build',
    { timeout: 90000 },
    () => {
      const tempRoot = makeTempRoot()
      try {
        const fixture = makeFixtureRoot(tempRoot, BOOTING_STUB)
        const result = runMasPkg({ ...fixture, shimDir: prepareShims(tempRoot) })
        expect(
          result.status,
          `procedure failed on a booting packaged build:\n${result.stderr ?? ''}`
        ).toBe(0)
        // Smoke evidence precedes the handoff; nothing real was signed.
        expect(result.stderr).toContain('functional smoke OK')
        // The script prints its repo-relative PKG path.
        expect(result.stderr).toContain('artifact: target/release/bundle/macos/Mark-mas.pkg')
        // The smoke reaps what it launched.
        assertNoProcess(fixture.stub)
      } finally {
        rmSync(tempRoot, { recursive: true, force: true })
      }
    }
  )

  it.skipIf(!hostHasBash || process.platform !== 'darwin')(
    'stops a crashing packaged build before the artifact declaration',
    { timeout: 90000 },
    () => {
      const tempRoot = makeTempRoot()
      try {
        const fixture = makeFixtureRoot(tempRoot, CRASHING_STUB)
        const result = runMasPkg({ ...fixture, shimDir: prepareShims(tempRoot) })
        expect(
          result.status,
          'the procedure declared a crashing packaged build upload-ready'
        ).not.toBe(0)
        expect(result.stderr).toContain('BLOCK_MAS_SMOKE_NOT_BOOTED')
        expect(result.stderr).not.toContain('artifact:')
        expect(result.stderr).not.toContain('next: upload')
        assertNoProcess(fixture.stub)
      } finally {
        rmSync(tempRoot, { recursive: true, force: true })
      }
    }
  )

  it.skipIf(!hostHasBash || process.platform !== 'darwin')(
    'refuses a packaged build whose binary is not executable',
    { timeout: 30000 },
    () => {
      const tempRoot = makeTempRoot()
      try {
        const fixture = makeFixtureRoot(tempRoot, BOOTING_STUB)
        chmodSync(fixture.stub, 0o644)
        const result = runMasPkg({ ...fixture, shimDir: prepareShims(tempRoot) })
        expect(result.status).not.toBe(0)
        expect(result.stderr).toContain('BLOCK_MAS_SMOKE_NOT_BOOTED')
        expect(result.stderr).not.toContain('artifact:')
      } finally {
        rmSync(tempRoot, { recursive: true, force: true })
      }
    }
  )
})
