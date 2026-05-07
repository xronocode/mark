#!/usr/bin/env node
// Phase-B4 step-8: build NOTICES-rust.md from cargo-bundle-licenses output.
//
// cargo-bundle-licenses emits JSON like:
//   { "third_party_libraries": [
//       { "package_name": "foo", "package_version": "1.0", "license": "MIT", ... }
//   ]}
//
// Usage:
//   cargo-bundle-licenses --format json --output /tmp/rust-licenses.json
//   node tools/build-notices-rust.mjs /tmp/rust-licenses.json > NOTICES-rust.md

import { readFileSync } from 'node:fs'

const path = process.argv[2]
if (!path || path === '-') {
  console.error('usage: node build-notices-rust.mjs <licenses.json>')
  process.exit(2)
}
const data = JSON.parse(readFileSync(path, 'utf8'))
const libs = data.third_party_libraries || []

// Self-crate exclusion (same rationale as Node side): cargo-bundle-
// licenses includes the workspace root crate. Version bumps would
// otherwise re-write NOTICES-rust.md + break verify-attributions.
const SELF_CRATE_NAMES = new Set(['mark', 'reborn-mark'])

const byLicense = new Map()
for (const lib of libs) {
  if (SELF_CRATE_NAMES.has(lib.package_name)) continue
  const lic = lib.license || 'UNKNOWN'
  if (!byLicense.has(lic)) byLicense.set(lic, [])
  byLicense.get(lic).push({
    name: lib.package_name,
    version: lib.package_version,
    repo: lib.repository || '',
  })
}

const groups = [...byLicense.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
for (const [, pkgs] of groups) pkgs.sort((a, b) => a.name.localeCompare(b.name))

const total = libs.length
const generatedAt = new Date().toISOString().slice(0, 10)

let out = ''
out += `# NOTICES — Rust dependencies (Tauri backend)\n\n`
out += `Generated ${generatedAt} from \`cargo-bundle-licenses --format json\` over **${total} crates**.\n\n`
out += `Each entry lists the crate name, version, license SPDX identifier, and upstream repository when available. Re-generate with:\n\n`
out += '```sh\n'
out += '(cd src-tauri && cargo-bundle-licenses --format json --output /tmp/rust-licenses.json)\n'
out += 'node tools/build-notices-rust.mjs /tmp/rust-licenses.json > NOTICES-rust.md\n'
out += '```\n\n'
out += `## License summary\n\n`
out += `| License | Crate count |\n`
out += `|---|---:|\n`
for (const [lic, pkgs] of groups) {
  out += `| ${lic} | ${pkgs.length} |\n`
}
out += `\n`

for (const [lic, pkgs] of groups) {
  out += `## ${lic} (${pkgs.length})\n\n`
  out += `| Crate | Version | Repository |\n`
  out += `|---|---|---|\n`
  for (const p of pkgs) {
    const repo = p.repo ? p.repo.replace(/\|/g, '\\|') : ''
    out += `| ${p.name} | ${p.version} | ${repo} |\n`
  }
  out += `\n`
}

process.stdout.write(out)
