#!/usr/bin/env node
// Phase-B4 step-8: build NOTICES-node.md from npm production deps.
// Reads license-checker JSON from stdin (or first arg) and emits a
// markdown table sorted by license group → package name.
//
// Usage:
//   npx --package license-checker -- license-checker --production --json |
//     node tools/build-notices-node.mjs > NOTICES-node.md
//
// CI runs verify-attributions.sh which re-runs this script and diffs
// against the committed NOTICES-node.md. New deps without an attribution
// line fail CI.

import { readFileSync } from 'node:fs'

const input = process.argv[2] === '-' || !process.argv[2]
  ? readFileSync(0, 'utf8')
  : readFileSync(process.argv[2], 'utf8')

const data = JSON.parse(input)

// Group packages by license string.
//
// Self-package exclusion: license-checker includes the workspace
// root package in its output (here: reborn-mark@<workspace-version>).
// That entry would re-write NOTICES-node.md every version bump,
// breaking the verify-attributions CI gate without anything actually
// changing about third-party deps. Skip the self-package by name.
const SELF_PACKAGE_NAMES = new Set(['reborn-mark', 'mark'])

const byLicense = new Map()
for (const [pkgKey, info] of Object.entries(data)) {
  // pkgKey is "name@version"; split off last @ to handle scoped names.
  const lastAt = pkgKey.lastIndexOf('@')
  const name = pkgKey.slice(0, lastAt)
  if (SELF_PACKAGE_NAMES.has(name)) continue
  const version = pkgKey.slice(lastAt + 1)
  const lic = Array.isArray(info.licenses) ? info.licenses.join(' OR ') : (info.licenses || 'UNKNOWN')
  if (!byLicense.has(lic)) byLicense.set(lic, [])
  byLicense.get(lic).push({ name, version, repo: info.repository || '', publisher: info.publisher || '' })
}

// Sort license groups by descending count, then name within group.
const groups = [...byLicense.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
for (const [, pkgs] of groups) pkgs.sort((a, b) => a.name.localeCompare(b.name))

const total = Object.keys(data).length
const generatedAt = new Date().toISOString().slice(0, 10)

let out = ''
out += `# NOTICES — Node.js production dependencies\n\n`
out += `Generated ${generatedAt} from \`license-checker --production\` over **${total} packages**.\n\n`
out += `Each entry lists the package name, version, license SPDX identifier, and upstream repository when available. Re-generate with:\n\n`
out += '```sh\n'
out += 'npx --package license-checker -- license-checker --production --json | \\\n'
out += '  node tools/build-notices-node.mjs > NOTICES-node.md\n'
out += '```\n\n'
out += `## License summary\n\n`
out += `| License | Package count |\n`
out += `|---|---:|\n`
for (const [lic, pkgs] of groups) {
  out += `| ${lic} | ${pkgs.length} |\n`
}
out += `\n`

for (const [lic, pkgs] of groups) {
  out += `## ${lic} (${pkgs.length})\n\n`
  out += `| Package | Version | Repository |\n`
  out += `|---|---|---|\n`
  for (const p of pkgs) {
    const repo = p.repo ? p.repo.replace(/\|/g, '\\|') : ''
    out += `| ${p.name} | ${p.version} | ${repo} |\n`
  }
  out += `\n`
}

process.stdout.write(out)
