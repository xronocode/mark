#!/usr/bin/env node
// Phase-B1.5 step-8: warnings allowlist verifier.
//
// Input: cargo build --message-format=json output (one JSON object per
// line; we filter for {reason: "compiler-message", message: {...}}).
// Output: JSON summary on stdout (exit 0 on success, 1 on
// unallowlisted warning, 2 on parse error or invariant break).
//
// Allowlist source: docs/ci-warnings-allowlist.md. Each entry's
// `pattern:` field (regex) is matched against compiler_message.message.
// A warning that matches ANY allowlist pattern passes; unmatched
// warnings fail the build.
//
// Negative-assertions also baked in: see FORBIDDEN_LINTS — these
// always fail regardless of allowlist.

import { readFileSync } from 'node:fs'

const FORBIDDEN_LINTS = new Set([
  'unsafe_code',
  'unconditional_recursion',
  'useless_attribute'
])

function parseAllowlistMd(md) {
  // Extract every `- pattern: <regex>` line. We don't enforce the
  // section structure beyond that — the markdown is documentation,
  // the patterns are the contract.
  const patterns = []
  const re = /^\s*-\s*pattern:\s*`(.+?)`\s*$/gm
  let m
  while ((m = re.exec(md))) {
    try {
      patterns.push(new RegExp(m[1]))
    } catch (e) {
      throw new Error(`bad regex in allowlist: ${m[1]} (${e.message})`)
    }
  }
  return patterns
}

function classifyMessage(msg) {
  // cargo emits warnings with level: "warning" and errors with "error".
  // We only check warnings here; errors fail the build anyway via
  // cargo's exit code.
  if (!msg) return null
  if (msg.level !== 'warning') return null
  // Lint code lives at msg.code?.code (e.g. "dead_code") or null for
  // category-less lints.
  return {
    text: msg.message ?? '',
    code: msg.code?.code ?? null,
    spans: msg.spans ?? []
  }
}

function main() {
  const args = process.argv.slice(2)
  if (args.length !== 2) {
    console.error('usage: check-warnings-allowlist.mjs <cargo-json> <allowlist-md>')
    process.exit(2)
  }
  const [cargoJsonPath, allowlistPath] = args

  let allowlistPatterns
  try {
    allowlistPatterns = parseAllowlistMd(readFileSync(allowlistPath, 'utf8'))
  } catch (e) {
    console.error(`allowlist parse failed: ${e.message}`)
    process.exit(2)
  }

  const lines = readFileSync(cargoJsonPath, 'utf8').split('\n').filter(Boolean)
  const warnings = []
  for (const line of lines) {
    let obj
    try {
      obj = JSON.parse(line)
    } catch {
      continue // cargo emits non-JSON lines too (build script output, etc.)
    }
    if (obj.reason !== 'compiler-message') continue
    const cls = classifyMessage(obj.message)
    if (cls) warnings.push(cls)
  }

  const forbidden = []
  const unallowed = []
  const allowed = []

  for (const w of warnings) {
    if (w.code && FORBIDDEN_LINTS.has(w.code)) {
      forbidden.push(w)
      continue
    }
    const matched = allowlistPatterns.some((p) => p.test(w.text))
    if (matched) {
      allowed.push(w)
    } else {
      unallowed.push(w)
    }
  }

  const summary = {
    total_warnings: warnings.length,
    allowed_count: allowed.length,
    unallowed_count: unallowed.length,
    forbidden_count: forbidden.length,
    forbidden_codes: [...new Set(forbidden.map((w) => w.code).filter(Boolean))],
    unallowed_messages: unallowed.map((w) => ({
      text: w.text.split('\n')[0].slice(0, 200),
      code: w.code
    }))
  }

  console.log(JSON.stringify(summary, null, 2))

  if (forbidden.length > 0) {
    console.error(`\n❌ ${forbidden.length} forbidden lint(s) emitted; see summary.forbidden_codes`)
    process.exit(1)
  }
  if (unallowed.length > 0) {
    console.error(
      `\n❌ ${unallowed.length} warning(s) not in docs/ci-warnings-allowlist.md.`
    )
    console.error(
      'Either fix the warning or add a W-NNN entry to the allowlist with rationale + planned-resolution.'
    )
    process.exit(1)
  }
  console.error(`\n✅ ${allowed.length} warning(s) allowlisted; ${warnings.length - allowed.length} unaccounted = 0`)
  process.exit(0)
}

main()
