# Phase-B4 step-10 — Hunspell linkage decision

**Date:** 2026-05-07
**Decision:** No hunspell linkage in v2.0. Step-10 closes as N/A.

## Context

H3-4 verification list called for: "hunspell-rs swapped for nuspell
(Apache-2.0) OR LGPL relink-able artifacts published. Decision recorded."

The driving concern: `hunspell-rs` (the most common Rust binding to
upstream Hunspell) wraps the GNU LGPL-2.1 hunspell C library. Static
linking the LGPL into a closed-source binary triggers the relink
obligation — distributors must either ship the unlinked .o files or
provide a way for users to relink with a modified hunspell. For an
MIT-licensed project shipping a Tauri-bundled DMG, this is friction.

`nuspell` is a from-scratch C++17 reimplementation of Hunspell under
Apache-2.0 (later relicensed; check upstream). Its Rust binding
(`nuspell-rs`) is permissive, removing the relink obligation entirely.

## Current state

`src-tauri/Cargo.toml` does NOT depend on hunspell-rs, nuspell, OR
any other LGPL-tainted spellchecker crate. Spell-check on each
platform is delegated to OS-native APIs:

  - **macOS:** `NSSpellChecker` (Cocoa API, system-provided).
  - **Windows:** Edge Chromium WebView's built-in spellchecker.
  - **Linux:** No spellcheck wired yet — `F-SPELL-HUNSPELL-EMBED`
    deferred to post-v2.0.

`m007_spell` is a config-surface stub returning the user's preferred
language; the actual word-checking happens in the OS API layer above.

## Why this is fine for v2.0

- macOS and Windows users get spellcheck via OS APIs without bundling
  any dictionary or LGPL artifact. NSSpellChecker uses Apple-shipped
  language packs; Edge Chromium uses Microsoft-shipped language packs.
  Neither vendor's licensing flows into Mark's distribution.
- Linux Tauri-bundled DMGs aren't shipped in v2.0 (target is macOS
  via Homebrew; Linux installs follow in a later cask + apt path
  governed by `F-SPELL-HUNSPELL-EMBED`).
- The Cargo SBOM (B4-step-9 sbom/sbom-rust.cdx.json) carries no
  hunspell or nuspell entries, confirmed by inspection.

## When step-10 reopens

If `F-SPELL-HUNSPELL-EMBED` lands a Linux dictionary path that
requires a Rust binding (instead of, say, shelling out to the
system's `aspell` / `enchant` CLI), step-10 reopens to:

  1. Pick `nuspell-rs` over `hunspell-rs` for the relink-friendly
     license posture.
  2. Update `src-tauri/about.toml` accepted-license list if nuspell
     pulls in a new SPDX identifier.
  3. Re-run `tools/verify-attributions.sh --refresh` so NOTICES-rust.md
     reflects the addition.
  4. Bundle the chosen .dic / .aff files under
     `src-tauri/resources/hunspell_dictionaries/<lang>/` together
     with each upstream's `LICENSE` file, per H3-4 of the verification
     plan.

Until then, no action required on this step.

## Cross-references

- `src-tauri/src/m007_spell.rs` — config-surface stub
- `src-tauri/about.toml` — accepted SPDX identifiers (no LGPL listed)
- `sbom/sbom-rust.cdx.json` — generated supply-chain manifest
- `docs/development-plan.xml` F-SPELL-HUNSPELL-EMBED — Linux path followup
- B4-step-8 NOTICES-rust.md — current Rust dep license breakdown
