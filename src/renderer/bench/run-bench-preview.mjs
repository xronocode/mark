#!/usr/bin/env node
// FILE: src/renderer/bench/run-bench-preview.mjs
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Make the bench-driver verification commands self-contained: ensure the built bench page exists, reuse or start `vite preview` on a fixed port, run run-bench.mjs with the caller's arguments, then stop the server it started.
//   SCOPE: Process/HTTP lifecycle only — it builds nothing itself unless src/renderer/dist/bench/index.html is missing, never changes the driver's phase semantics, and never leaves a spawned preview server behind (SIGTERM then SIGKILL in a finally block). An already-running server on the port is reused and never killed.
//   DEPENDS: src/renderer/bench/run-bench.mjs, node:child_process (spawn/spawnSync), node:fs, Node 18+ global fetch, vite preview via node_modules/.bin.
//   LINKS: .grace/changes/active/C-LARGE-DOC-STAGE-0 plan T-003/T-004/T-012; .grace/verification/performance.xml V-M-060.
//   ROLE: SCRIPT
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   HERE - directory of this script.
//   REPO_ROOT - repository root resolved from this script.
//   DRIVER - absolute path to run-bench.mjs.
//   BENCH_DIST - built bench entry served by preview.
//   VITE_BIN - local vite binary path.
//   URL - bench URL probed and passed to the driver through BENCH_URL.
//   PORT - fixed preview port shared with the Playwright webServer config.
//   sleep - promise delay helper.
//   probe - true when the bench page answers on the port.
//   waitForServer - polls probe until the deadline.
//   ensureBuild - builds the renderer when the bench bundle is absent.
//   killTree - terminates a spawned preview process group.
//   main - probe or start preview, run the driver, always stop what it started.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - C-LARGE-DOC-STAGE-0 T-009/T-010: self-contained driver command (reuse or own the preview server; build only when missing).
// END_CHANGE_SUMMARY

import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(HERE, '../../..')
const DRIVER = path.join(HERE, 'run-bench.mjs')
const BENCH_DIST = path.join(REPO_ROOT, 'src/renderer/dist/bench/index.html')
const VITE_BIN = path.join(REPO_ROOT, 'node_modules/.bin/vite')
const PORT = 4173
const URL = `http://localhost:${PORT}/bench/`

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function probe () {
  try {
    const res = await fetch(URL, { method: 'GET' })
    return res.ok
  } catch (err) {
    return false
  }
}

async function waitForServer (timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await probe()) return true
    await sleep(250)
  }
  return false
}

function ensureBuild () {
  if (existsSync(BENCH_DIST)) return true
  console.error('[bench][preview] bench bundle missing — building once (npm run build)')
  const res = spawnSync('npm', ['run', 'build'], { cwd: REPO_ROOT, stdio: 'inherit' })
  return res.status === 0 && existsSync(BENCH_DIST)
}

function killTree (child) {
  if (!child || child.exitCode !== null) return
  try {
    process.kill(-child.pid, 'SIGTERM')
  } catch (err) {
    try { child.kill('SIGTERM') } catch (err2) { /* already gone */ }
  }
  setTimeout(() => {
    try { process.kill(-child.pid, 'SIGKILL') } catch (err) { /* already gone */ }
  }, 2000).unref()
}

async function main () {
  const driverArgs = process.argv.slice(2)
  let child = null
  let started = false

  try {
    if (!(await probe())) {
      if (!ensureBuild()) {
        console.error('[bench][preview] build failed — cannot run the driver')
        return 2
      }
      console.error(`[bench][preview] starting vite preview on :${PORT}`)
      child = spawn(VITE_BIN, ['preview', '--port', String(PORT), '--strictPort'], {
        cwd: REPO_ROOT,
        stdio: 'ignore',
        detached: true
      })
      started = true
      const up = await waitForServer(60_000)
      if (!up) {
        console.error('[bench][preview] preview server did not answer within 60s')
        return 2
      }
    } else {
      console.error(`[bench][preview] reusing the server already on :${PORT}`)
    }

    const res = spawnSync(process.execPath, [DRIVER, ...driverArgs], {
      cwd: REPO_ROOT,
      stdio: 'inherit',
      env: { ...process.env, BENCH_URL: URL }
    })
    return res.status ?? 1
  } finally {
    if (started) killTree(child)
  }
}

main().then((code) => {
  process.exitCode = code
}).catch((err) => {
  console.error('[bench][preview] fatal:', err)
  process.exitCode = 2
})
