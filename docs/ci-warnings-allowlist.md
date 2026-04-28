# CI toolchain-warnings allowlist

This file is the source of truth for warnings that release-tauri.yml's
`warnings-allowlist-check` step accepts. Any warning emitted by
`cargo build --release --bin mark` that is NOT listed here fails the
check; any listed warning is acknowledged as expected behavior.

Format: one entry per warning class, with a stable id, the kind, the
emitting code, the rationale, and an expected resolution phase.

The verifier script (tools/check-warnings-allowlist.mjs) parses this
file by extracting the `pattern:` field from each entry and matching
each cargo `compiler-message` against ALL patterns. Unmatched warnings
fail; matched ones pass through.

## Format

```
### W-NNN — short title

- pattern: regex matched against compiler_message.message
- code: rustc lint code (e.g. `dead_code`, `unused_imports`)
- emitter: source file path glob (informational; not enforced)
- rationale: why this warning is acceptable today
- planned: which phase removes the underlying cause
```

## Active entries

(none — current B1 release build is warning-free as of 2026-04-28
commit closing Phase-B1)

## Historical entries (resolved)

### W-001 — m001_lifecycle stub surface dead at release

- pattern: `(enum|struct|function|method|associated items|static) .* (is never used|are never used|is never constructed)`
- code: `dead_code`
- emitter: `src-tauri/src/m001_lifecycle.rs`
- rationale: B1 step-11 ships the lifecycle primitives (CloseStateMachine,
  MenuGeneration, ReplayPolicy) as the contract surface; tests
  exercise them in `#[cfg(test)]` but no production caller has landed
  yet. Callers come in B2 (M-013b dispatch wiring ReplayPolicy) and
  B3 step-12 (M-009 menu wiring MenuGeneration).
- planned: resolved 2026-04-28 by adding `#![allow(dead_code)]` at
  module level in m001_lifecycle.rs. Suppression is intentional and
  scoped — when callers wire up in B2/B3, individual items lose the
  warning naturally and the module-level allow can be removed.
- status: **historical** — not currently emitted.

### W-002 — m013b re-exports unused at release

- pattern: `unused imports?: .IpcError. and .MT_NOT_IMPLEMENTED.`
- code: `unused_imports`
- emitter: `src-tauri/src/m013b/mod.rs`
- rationale: M-013b mod.rs re-exports `IpcError` and `MT_NOT_IMPLEMENTED`
  for downstream B2 consumers (`use crate::m013b::IpcError`). Internal
  callers (m013b::fs, search, watch) reach into `error::` directly,
  so the re-export has no in-tree user yet.
- planned: resolved 2026-04-28 by adding `#[allow(unused_imports)]` to
  the re-export line. Removed when B2 starts importing from the barrel.
- status: **historical** — not currently emitted.

## Adding new entries

When a new expected warning appears (e.g. B2 ships intentional
deprecation of a symbol mid-port), add a new W-NNN section with all
five fields populated. The verifier script does NOT validate the
fields beyond `pattern:` — the rest is documentation for future
maintainers + audit trail.

## Removing entries

When the underlying cause is fixed:
1. Move the entry from "Active" to "Historical (resolved)".
2. Note the resolution date and commit hash.
3. The verifier script does NOT distinguish active vs historical —
   moving an entry to historical does NOT loosen the check (entries
   in either section are accepted). The split is documentation only.
4. To **tighten** (i.e. start failing on a previously-allowed warning),
   delete the entry entirely.

## Negative-assertion: forbidden warnings

These categories MUST NEVER appear in cargo output, even via allowlist.
The verifier rejects them unconditionally:

- `unsafe_code` — Mark v2 builds with `#![deny(unsafe_code)]`-equivalent
  posture. Any unsafe block in M-001..M-013b indicates a contract
  violation requiring escalation.
- Lints from rustc's `correctness` group (e.g. `unconditional_recursion`,
  `useless_attribute`) — always real bugs.
- `clippy::panic`, `clippy::unwrap_used`, `clippy::expect_used` IF
  emitted from production code paths (ignored in `#[cfg(test)]`).
  V-M-001 hard requirement: never panic.
