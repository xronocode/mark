// @vitest-environment node
// FILE: tests/tools/dev-smoke.test.mjs
// START_MODULE_CONTRACT
//   PURPOSE: Pin the owned-PID dev-smoke discipline end to end with fixture process doubles; the suite can never signal a real process outside its sandbox.
//   SCOPE: Drives the real tools/dev-smoke.sh per test in a fresh git-init sandbox root with a sandbox HOME and a PATH shim of scripted curl/lsof/ps/sleep/npm stubs plus a recording kill shim; the shim records signals without delivering them, and spawned fixture processes are cleaned up from the spawn registry.
//   DEPENDS: Vitest; Node built-ins; tools/dev-smoke.sh; POSIX sh; git.
//   LINKS: C-DEV-ENV-ISOLATION; tools/dev-smoke.sh START_MODULE_CONTRACT (owned-PID kill discipline, honest busy-port report, MARK_DEV_PIDFILE seam).
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   DEV_SMOKE - absolute path of the real dev-smoke.sh under test.
//   STUB_CURL - scripted HTTP status shim (constant or per-call sequence).
//   STUB_LSOF - scripted port-listener report shim.
//   STUB_PS - scripted owner command shim.
//   STUB_SLEEP - short real pause shim.
//   STUB_KILL - recording kill shim (-0 probes read the live-set, signals logged never delivered).
//   STUB_NPM - dev-server root-process double (registers, idles).
//   STUB_MARK - mark binary double (registers, prints the six BLOCK markers, idles).
//   stubs - shim name to script body.
//   sandboxes - per-run sandbox cleanup registry.
//   track - register a sandbox for afterEach cleanup.
//   makeSandbox - Fresh git-init root with shim bin dir, live-set, kill/spawn logs and the MARK_DEV_PIDFILE pidfile.
//   runDevSmoke - Run the real script with the sandbox env and captured status.
//   output - combined stdout+stderr of a run.
//   killLogPids - PIDs the recording kill shim saw signalled.
//   spawnLogPids - Real fixture processes spawned by the run (cleanup registry).
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   - 2026-11-21 C-DEV-ENV-ISOLATION: four failing-first pins — refuses_foreign_pids, busy_port_reports_owner_and_does_not_kill, kills_only_spawned_pids, adopts_no_foreign_200 — against fixture process doubles in per-test sandboxes.
// END_CHANGE_SUMMARY
import { afterEach, describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { vi } from 'vitest'

// The real dev-smoke cycle legitimately runs ~10s under the fixture shims
// (30 readiness polls + launch gates); the 5s default times out honest runs.
vi.setConfig({ testTimeout: 30000 })

const DEV_SMOKE = fileURLToPath(new URL('../../tools/dev-smoke.sh', import.meta.url))

// Stub process tools: curl codes are scripted per call, lsof/ps name the
// scripted port owner, sleep pauses briefly so freshly spawned fixtures win
// their registration race, npm plays the dev server root process, and kill
// is a full recording shim — "-0 PID" probes read the fixture live-set and
// real signals are logged without ever being delivered.
const STUB_CURL = `#!/bin/sh
# Fixture curl: FIXTURE_CURL_CODE pins a constant; otherwise the sequence in
# FIXTURE_CURL_SEQUENCE plays one code per call with the last one repeating.
if [ -n "\${FIXTURE_CURL_CODE:-}" ]; then
  printf '%s' "$FIXTURE_CURL_CODE"
  exit 0
fi
count_file="\${FIXTURE_CURL_COUNT:?FIXTURE_CURL_COUNT required}"
prev=$(cat "$count_file" 2>/dev/null || echo 0)
next=$((prev + 1))
printf '%s\\n' "$next" > "$count_file"
code=""
i=0
for c in \${FIXTURE_CURL_SEQUENCE:-000}; do
  code="$c"
  i=$((i + 1))
  if [ "$i" -ge "$next" ]; then
    break
  fi
done
printf '%s' "$code"
`

const STUB_LSOF = `#!/bin/sh
# Fixture lsof: a header line plus the scripted listener record.
printf '%s\\n' 'COMMAND  PID  USER   FD   TYPE DEVICE SIZE/OFF NODE NAME'
if [ -n "\${FIXTURE_LSOF_LINE:-}" ]; then
  printf '%s\\n' "$FIXTURE_LSOF_LINE"
fi
`

const STUB_PS = `#!/bin/sh
# Fixture ps: prints the scripted command for any -p lookup.
if [ -n "\${FIXTURE_PS_COMMAND:-}" ]; then
  printf '%s\\n' "$FIXTURE_PS_COMMAND"
fi
`

const STUB_SLEEP = `#!/bin/sh
# Fixture sleep: one short real pause; arguments are ignored.
exec /bin/sleep 0.25
`

const STUB_KILL = `#!/bin/sh
# Recording kill shim: "-0 PID" probes read the fixture live-set; any real
# signal logs the PID to FIXTURE_KILL_LOG and is never delivered.
live="\${FIXTURE_LIVE_FILE:?FIXTURE_LIVE_FILE required}"
log="\${FIXTURE_KILL_LOG:?FIXTURE_KILL_LOG required}"
if [ "$1" = "-0" ]; then
  case " $(cat "$live" 2>/dev/null) " in
    *" $2 "*) exit 0 ;;
  esac
  exit 1
fi
last=""
for a in "$@"; do last="$a"; done
printf '%s\\n' "$last" >> "$log"
exit 0
`

const STUB_NPM = `#!/bin/sh
# Fixture npm dev server: records the call, registers its PID in the
# fixture live-set and spawn registry, then idles instead of binding a port.
printf '%s\\n' "npm $*" >> "\${FIXTURE_NPM_LOG:?FIXTURE_NPM_LOG required}"
printf '%s\\n' "$$" >> "\${FIXTURE_SPAWN_LOG:?FIXTURE_SPAWN_LOG required}"
printf ' %s ' "$$" >> "\${FIXTURE_LIVE_FILE:?FIXTURE_LIVE_FILE required}"
exec /bin/sleep 300
`

const STUB_MARK = `#!/bin/sh
# Fixture mark binary: registers its PID, prints the BLOCK markers the
# launch gate verifies, then idles.
printf '%s\\n' "$$" >> "\${FIXTURE_SPAWN_LOG:?FIXTURE_SPAWN_LOG required}"
printf ' %s ' "$$" >> "\${FIXTURE_LIVE_FILE:?FIXTURE_LIVE_FILE required}"
printf '%s\\n%s\\n%s\\n%s\\n%s\\n%s\\n' '[BLOCK_BOOT]' '[BLOCK_PREFS]' '[BLOCK_MENU]' '[BLOCK_WINDOW]' '[BLOCK_SERVER]' '[BLOCK_TITLEBAR_TRANSPARENT_OVERLAY_OK]' >&2
exec /bin/sleep 300
`

const stubs = {
  curl: STUB_CURL,
  lsof: STUB_LSOF,
  ps: STUB_PS,
  sleep: STUB_SLEEP,
  kill: STUB_KILL,
  npm: STUB_NPM,
}

const sandboxes = []
function track(sandbox) {
  sandboxes.push(sandbox)
  return sandbox
}

afterEach(() => {
  for (const sandbox of sandboxes.splice(0)) {
    for (const pid of spawnLogPids(sandbox)) {
      try {
        process.kill(pid, 'SIGKILL')
      } catch {
        // fixture process already gone
      }
    }
    rmSync(sandbox.root, { recursive: true, force: true })
  }
})

function makeSandbox({ livePids = [], curlCode = '', curlSequence = '', lsofLine = '', psCommand = '' } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'dev-smoke-fixture-'))
  const sandbox = {
    root,
    bin: join(root, 'bin'),
    home: join(root, 'home'),
    paths: {
      live: join(root, 'fixture-live.pids'),
      killLog: join(root, 'fixture-kills.log'),
      spawnLog: join(root, 'fixture-spawns.log'),
      npmLog: join(root, 'fixture-npm.log'),
      curlCount: join(root, 'fixture-curl.count'),
      pidfile: join(root, 'run.pids'),
    },
  }
  mkdirSync(sandbox.bin, { recursive: true })
  mkdirSync(sandbox.home, { recursive: true })
  const init = spawnSync('git', ['init', '-q', root])
  expect(init.error).toBeUndefined()
  writeFileSync(sandbox.paths.live, livePids.join(' '))
  writeFileSync(sandbox.paths.pidfile, '')
  for (const [name, body] of Object.entries(stubs)) {
    const path = join(sandbox.bin, name)
    writeFileSync(path, body)
    chmodSync(path, 0o755)
  }
  mkdirSync(join(sandbox.root, 'target', 'debug'), { recursive: true })
  const markPath = join(sandbox.root, 'target', 'debug', 'mark')
  writeFileSync(markPath, STUB_MARK)
  chmodSync(markPath, 0o755)
  sandbox.env = {
    ...process.env,
    HOME: sandbox.home,
    GIT_CONFIG_NOSYSTEM: '1',
    MARK_DEV_PIDFILE: sandbox.paths.pidfile,
    FIXTURE_LIVE_FILE: sandbox.paths.live,
    FIXTURE_KILL_LOG: sandbox.paths.killLog,
    FIXTURE_SPAWN_LOG: sandbox.paths.spawnLog,
    FIXTURE_NPM_LOG: sandbox.paths.npmLog,
    FIXTURE_CURL_COUNT: sandbox.paths.curlCount,
    FIXTURE_CURL_CODE: curlCode,
    FIXTURE_CURL_SEQUENCE: curlSequence,
    FIXTURE_LSOF_LINE: lsofLine,
    FIXTURE_PS_COMMAND: psCommand,
    // node:path's delimiter is ';' on win32, but the script runs under bash
    // (git-bash on the Windows runner) where PATH is ':'-separated — a ';'
    // join makes the whole PATH one dead entry and NO shim is found (the
    // real curl answers 000, kill probes miss). Use the separator the
    // TARGET shell expects: if the ambient PATH already looks msys-style
    // (':' present), join with ':' regardless of the host OS.
    // Windows/git-bash: MSYS bash converts a NATIVE (';'-separated) PATH at
    // startup — each entry, including a forward-slashed drive path, becomes
    // a POSIX entry it can resolve. A ':'-joined hand-made PATH breaks that
    // conversion (drive letters contain ':' and split the entries), which
    // is why no shim was ever found there. Keep the ambient separator.
    PATH: `${sandbox.bin.replace(/\\/g, '/')}${process.env.PATH?.includes(';') ? ';' : ':'}${process.env.PATH ?? ''}`,
  }
  return sandbox
}

function runDevSmoke(sandbox, args = ['--quick']) {
  return spawnSync('bash', [DEV_SMOKE, ...args], {
    cwd: sandbox.root,
    env: sandbox.env,
    encoding: 'utf8',
  })
}

const output = (result) => (result.stdout ?? '') + (result.stderr ?? '')

function killLogPids(sandbox) {
  return existsSync(sandbox.paths.killLog)
    ? readFileSync(sandbox.paths.killLog, 'utf8').split('\n').filter(Boolean)
    : []
}

function spawnLogPids(sandbox) {
  return existsSync(sandbox.paths.spawnLog)
    ? readFileSync(sandbox.paths.spawnLog, 'utf8').split('\n').map(Number).filter((p) => Number.isInteger(p) && p > 0)
    : []
}

describe('owned-PID dev-smoke discipline (C-DEV-ENV-ISOLATION)', () => {
  it('refuses_foreign_pids', () => {
    // A live process matching the retired broad cmdline kill patterns
    // ("npm run dev", "vite serve", "target/debug/mark") is never signalled
    // when it is absent from the run pidfile; the recorded dev server is
    // still cleaned up and the restart path still relaunches a server.
    const sandbox = track(makeSandbox({
      livePids: ['111111', '333331'],
      curlCode: '000',
      psCommand: 'node /other/worktree/node_modules/.bin/vite serve',
    }))
    writeFileSync(sandbox.paths.pidfile, 'dev-server:111111\n')
    const result = runDevSmoke(sandbox, ['--quick'])
    expect(result.status).not.toBe(0)
    const killed = killLogPids(sandbox)
    expect([...new Set(killed)]).toEqual(['111111'])
    expect(killed).not.toContain('333331')
    expect(readFileSync(sandbox.paths.pidfile, 'utf8')).not.toContain('333331')
    expect(output(result)).not.toContain('333331')
    expect(readFileSync(sandbox.paths.npmLog, 'utf8')).toContain('run dev')
  })

  it('busy_port_reports_owner_and_does_not_kill', () => {
    // A foreign listener owns the fixed dev port: the run reports the owner
    // by PID and command and fails with zero kill invocations, and never
    // starts its own server on top.
    const sandbox = track(makeSandbox({
      curlCode: '200',
      lsofLine: 'node 424242 owner 11u IPv4 0t0 TCP localhost:1420 (LISTEN)',
      psCommand: 'node /other/worktree/node_modules/.bin/vite serve',
    }))
    const result = runDevSmoke(sandbox, ['--quick'])
    expect(result.status).not.toBe(0)
    const out = output(result)
    expect(out).toContain('424242')
    expect(out).toContain('vite serve')
    expect(out).toContain('untracked')
    expect(out).not.toContain('Dev server already running')
    expect(out).not.toContain('Dev server ready')
    expect(killLogPids(sandbox)).toEqual([])
    expect(existsSync(sandbox.paths.npmLog)).toBe(false)
  })

  it('kills_only_spawned_pids', { retry: 1 }, () => {
    // The restart and cleanup paths kill exactly the pidfile-recorded PIDs
    // and nothing else: the foreign live PID survives, and the freshly
    // spawned (recorded) dev server and mark binary are left running.
    const sandbox = track(makeSandbox({
      livePids: ['111111', '222222', '333333'],
      curlSequence: '000 200',
    }))
    writeFileSync(sandbox.paths.pidfile, 'dev-server:111111\nmark:222222\n')
    const result = runDevSmoke(sandbox, ['--quick'])
    expect(result.status).toBe(0)
    const killed = [...new Set(killLogPids(sandbox))].sort()
    expect(killed).toEqual(['111111', '222222'])
    expect(killed).not.toContain('333333')
    const out = output(result)
    expect(out).toContain('Dev server ready')
    expect(out).toContain('Mark launched')
    expect(out).not.toContain('333333')
    const pidfile = readFileSync(sandbox.paths.pidfile, 'utf8')
    expect(pidfile).toMatch(/dev-server:(\d+)/)
    expect(pidfile).toMatch(/mark:(\d+)/)
    expect(pidfile).not.toContain('333333')
  })

  it('adopts_no_foreign_200', () => {
    // A 200 from an untracked port owner is not readiness for this build:
    // the recorded dev server is dead, so the answer belongs to someone
    // else and the run fails with the ownership report instead of adopting.
    const sandbox = track(makeSandbox({
      curlCode: '200',
      lsofLine: 'nginx 515151 owner 12u IPv4 0t0 TCP *:1420 (LISTEN)',
      psCommand: 'nginx -g daemon off;',
    }))
    writeFileSync(sandbox.paths.pidfile, 'dev-server:444444\n')
    const result = runDevSmoke(sandbox, ['--quick'])
    expect(result.status).not.toBe(0)
    const out = output(result)
    expect(out).not.toContain('Dev server already running')
    expect(out).not.toContain('Dev server ready')
    expect(out).toContain('515151')
    expect(out).toContain('nginx -g daemon off;')
    expect(killLogPids(sandbox)).toEqual([])
  })
})
