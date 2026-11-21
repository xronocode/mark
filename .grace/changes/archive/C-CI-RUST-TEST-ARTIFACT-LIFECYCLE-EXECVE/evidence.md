# Cargo test executable lifecycle

A dedicated Node helper keeps Cargo responsible for the existing three test invocations and working directories while recording and cleaning each selected native executable. POSIX uses a gated same-PID exec with Cargo's runtime environment; Windows records the native child at spawn before further input. Owned processes are awaited before executable cleanup. Dependency and build caches, unrelated baseline files and original test selection remain intact.

## Verification

1. The exact final lifecycle and workflow suites passed 31 tests. The root final gate passed its declared command with zero errors and four existing heuristic warnings. A broader 129-test governance run remains source-bound; the final follow-up strengthened only existing test readiness and platform assertions.
2. Actual synthetic children and filesystem fixtures exercise normal/failing and cached targets, multiple harness selection, cooperative signals, bounded unresponsive-child termination, malformed/truncated/read-failed metadata, receipt-write and real output-pipe failures, ordinary brace-prefixed output and dependency/symlink ownership refusal.
3. Independent review closed five concrete findings and found no remaining source or Standards issues. Three bounded source negative controls produced actual runtime failures and restored the exact source. A real scoped Cargo IPC harness passed one selected test with 600 filtered cases, recording the native PID/digest and deleting its executable; this is not a claim of a full native suite.
4. The final corrected evidence run retains 28 external synthetic-fixture receipts. All fixture roots and 19 recorded native/external PIDs were absent afterward. An earlier passing root run suppressed individual fixture logs under the default silent test configuration; it is retained with that evidence limit rather than given a retroactive receipt claim.
5. Exact workflow AST checks preserve all prior controls outside the three wrapper calls and two existing-pin Node setup steps. Root durable additions preserve every previous graph/verification node. The immutable predecessor records the replaced shell-gate design and its actual experimental history.

## Boundaries

This is the required executable-cleanup prerequisite for original CI:F-003 workspace-cache delivery; it adds no original finding and does not itself publish the separate QA installer feature. POSIX requires Node 22.15 or newer with exec support and fails closed before Cargo compilation if unavailable. Windows spawn behavior, actual hosted complete suites and live cache reuse remain ordinary CI gates.

Technical approval and apply/archive use the owner's delegated authority of 2026-11-15. Root will separately compose the complete first CI delivery so the packaged-app cleanup path also receives its own approved source. No workflow dispatch, release, version, signing or owner acceptance is authorized by these source checks.
