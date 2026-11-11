# Safer document links and isolated live streams

## What's new

- Markdown links refuse executable files, ambiguous filenames and unsupported external attachment types. Markdown documents still open inside Mark; permitted images and PDFs keep their external route.
- Disabling an extension blocks its document stream and closes its active session even when credential deletion fails.
- One extension cannot discover or replace another extension's active streaming session.
- Live updates stay with their own tab. Switching or closing tabs cannot put streamed content into another document or its save request.

## Under the hood

- Deployment tooling has a dedicated manifest and integrity lockfile. The checked wrapper runs the prepared local CLI and refuses missing or mismatched tooling without downloading packages.
- Cloudflare credentials are excluded from admission subprocesses and passed only to the explicit-token deployment process. Tool output redacts the deployment token.
- Streaming authentication rechecks enabled identity and session incarnation at the mutation boundary. Every live document event carries an ordered session incarnation.
- Required CI prepares the separate deployment toolchain without installation scripts and includes the browser stream-ownership regression in WebKit.

## Evidence

1. tests: 599 passed, 0 failed, 1 ignored (complete Rust backend binary).
2. tests: 5728 passed, 0 failed, 2 skipped, 3 todo (414 renderer/tool test files; installed graph matches the committed lockfile).
3. e2e: 14/14 passed (Chromium and WebKit; rich/source/split modes, autosave on/off, background/closed tabs, stale events, resync and delayed local save).
4. build: green (`npm run build` and production `cargo check --locked --offline --manifest-path src-tauri/Cargo.toml --bin mark`).
5. IPC types: green (`npm run typecheck:ipc`).
6. grace lint: all six final gates passed with declared commands. After archiving, current-state integrity reports 0 errors and 4 existing heuristic Python warnings.
7. coverage: green with the committed thresholds and original test deadlines. Statements 92.04%, branches 85.23%, functions 88.42%, lines 93.57%. All 414 test files passed. Application-shell fixtures now stub unused child imports before shallow rendering.
8. Deployment preparation: Wrangler 4.159.0 reports its expected version after a credential-free install with installation scripts disabled; all 91 locked package records carry integrity.

Windows-native link activation was not exercised. Executable fixtures contain inert data and fake opening callbacks; browser save checks inspect fixture transport requests. No document-supplied executable was launched. New authentication and deployment fixtures use dummy credentials; no production deployment was performed.

## Release status

Local functional, coverage and GRACE checks pass. The implementation bundles are applied and archived. Hosted CI must pass before merge; product runtime acceptance remains separate from integration. Not queued into any release train. No version change, tag, release or production deployment is included.

## References

| Finding | Implementation |
|---|---|
| F-001 | [Opening guards](../../../src-tauri/src/m010_security.rs), [document link dispatch](../../../src-tauri/src/m_v1_compat.rs) |
| F-002 | [Prepared deployment wrapper](../../../tools/stats-gateway/deploy-checked.mjs), [tool lockfile](../../../tools/stats-gateway/package-lock.json) |
| F-003 | [Extension disable](../../../src-tauri/src/m045_ext/mod.rs), [stream authorization](../../../src-tauri/src/m045_ext/live_server.rs) |
| F-004 | [Owned tab state](../../../src/renderer/src/store/editor.js), [live event bridge](../../../src/renderer/src/components/liveViewer/index.vue) |
| F-005 | [Session ownership](../../../src-tauri/src/m045_ext/live_server.rs) |

[Reviewed repair plan](2026-11-11-security-findings-validation.md).

Archived change bundles: C-SEC-LINK-OPEN, C-SEC-STREAM-AUTH, C-SEC-STREAM-TABS, C-SEC-GATEWAY-TOOLS, C-SEC-GATEWAY-LOCK-SCAN and C-SEC-COVERAGE-IMPORTS. Their specs, immutable plan assertions and verification evidence are retained under `.grace/changes/archive/`.
