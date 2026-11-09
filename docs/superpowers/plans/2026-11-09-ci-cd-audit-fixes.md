# CI/CD Audit Fixes Implementation Plan

> **For agentic workers:** Execute this plan task by task, using the approved GRACE change as the scope and verification authority.

**Goal:** Close the six confirmed CI/CD audit findings without changing release authorization or publishing a release.

**Architecture:** Keep the existing required `status check` as the PR gate. Harden the existing workflows in place, pin their executable inputs, and give the owner-executed gateway deploy a checked candidate procedure. Preserve the production signing path.

**Tech Stack:** GitHub Actions, Node/npm, Rust, Tauri, Playwright, Cloudflare Wrangler, GRACE 4.

**Spec:** `.grace/changes/archive/C-CI-CD-AUDIT-FIXES/spec.xml`

## Constraints

- Production signing credentials stay confined to `release-signing`.
- No version bump, release tag, publication, or Worker deployment in this change.
- Manual gateway deployment remains owner-executed.
- Existing required status names remain stable.

## Tasks

### 1. Repair unsigned QA build and error propagation

- [x] Split each verification command into its own Actions step.
- [x] Disable updater artifact generation only for manual QA packaging.
- [x] Extend workflow regression assertions to cover the unsigned boundary and command ordering.
- [x] Verify with the focused Vitest suite and actionlint 1.7.12.

### 2. Complete and de-duplicate the required test workflow

- [x] Restore checkout and pull-request read permission for change classification; classify mixed code/documentation changes as non-docs.
- [x] Run `typecheck:ipc` in a required test job.
- [x] Execute each of `webkit-pele-theme` and `webkit-tree` once while keeping screenshot upload.
- [x] Add workflow regression assertions; run the focused suite and typecheck.

### 3. Pin executable CI inputs

- [x] Add one checked-in Rust toolchain version for local work, PR checks, QA and release packaging.
- [x] Pin action references in the active CI and dry-run workflows to verified commits; include the toolchain in Rust cache keys.
- [x] Verify every workflow's action reference is immutable and validate workflow syntax.

### 4. Gate the owner-executed Worker deployment

- [x] Require a clean checkout at the exact current `main` commit and successful checks for that SHA before `wrangler deploy`.
- [x] Record commit SHA and deployed Worker version in the owner procedure; require `/feed` and `/pkg` route checks after deployment.
- [x] Test the preflight's refusal paths without deploying.

### 5. Close governance and verify

- [x] Update the M-046/M-071 graph and verification entries and file-local change summaries.
- [x] Repair the pre-existing unrelated module-map mismatch that prevents current-state GRACE lint.
- [x] Run GRACE target/final/current checks, focused tests, actionlint, and review the exact candidate before commit.
