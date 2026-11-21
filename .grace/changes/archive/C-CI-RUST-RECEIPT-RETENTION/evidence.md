# Hosted Rust receipt retention

The generic Cargo jobs retain their existing state, result and native-runner JSON through the existing pinned artifact action. Collection runs under always(), uses an error on zero matching files, one-day retention and a job/OS/run/attempt name. The lane uses the unchanged lifecycle helper and Node22 setup for its original unfiltered root Cargo call. Logs, binaries and caches are excluded.

## Verification

1. Identical final regression bytes reproduced four missing-collector/bare-lane failures before the correction; 25 controls passed. Corrected focused tests passed 34 cases across two suites.
2. The root final passed 152 tests across six suites and release governance, with both declared commands successful, zero errors and four existing heuristic warnings. Syntax, actionlint and whitespace checks passed.
3. Complete workflow AST inversion preserves every original control outside the validated collector additions and lane Node/Cargo wrapper. All helper bytes and prior archives remain unchanged. Five bounded durable additions preserve every byte outside the two owned definitions; source, durable and final independent review found no remaining findings.
4. Inert filesystem selection covers two invocation directories with spaces and excludes neighboring logs, binaries and unrelated paths. Node glob selection is a local approximation; no real artifact upload or native Cargo build ran in this follow-up.

## Delivery and limits

Actual exact-head hosted receipt download, ZIP members, hashes, source/PID/digest and cleanup evidence remain required. Zero-match policy does not certify complete schemas; partial failure/cancel records are not cleanup success. Abrupt runner destruction cannot guarantee collection. Packaged QA cleanup, cache behavior and manual installer/owner acceptance remain separate.

The prior synthetic-console retention issue and this actual Cargo receipt-export gap are distinct. Prior approved bodies and evidence remain historical. Technical approval and apply/archive use the delegated authority of 2026-11-15; ordinary guarded source delivery and subsequent Collecting remain separate stages. No release or manual dispatch is authorized.
