# CI workspace cache and artifact lifecycle

The existing Cargo caches now store the root workspace target with a platform/toolchain/lock-specific namespace. The three ordinary Rust test calls retain their original Cargo selection and working directories while recording and deleting completed owned executables. The packaged dry-run uses an isolated app identity, exact launch ownership, normal native Quit and finally cleanup; completed ordinary runs retain evidence rather than installers.

## Verification

1. The actual combined final passed 208 tests across nine suites, locked offline Cargo metadata and release governance. Syntax, action-reference and actionlint checks passed on the same workflow source. The final GRACE gate passed all three commands with zero errors and four existing heuristic warnings.
2. Exact source/workflow proofs preserve every intended action pin, cache partition, original Cargo call and gate. The five production release jobs remain unchanged except the separately approved cache mapping. Only the two QA helpers and their two test files differ from the initially reviewed seventeen-file union; the other thirteen paths are byte-identical.
3. Independent review found two additional paths in the earlier QA source: permission denial could be treated as absent/deleted, and an asynchronous stderr error could bypass cleanup. Four actual pre-fix failures reproduced them. Corrected permission controls keep errors explicit and continue safe independent cleanup; real compiler-pending and native-active synthetic CLI pipe controls stop and reap their owned children, complete cleanup and reject without an uncaught error. A later queued pipe-error control is also retained.
4. External final receipts retain 28 generic lifecycle fixture cases and three real synthetic QA CLI cases. All 31 fixture roots and 27 recorded PIDs were absent afterward. Actual permission probes restored their owned permissions and removed their fixtures. No local native app, Cargo binary build or manual workflow dispatch ran in this combined verification.
5. Independent source, durable and final review found no remaining concrete findings. Twenty bounded XML operations preserve unrelated/protected definitions and the complete original applied archives. The earlier QA and source-union evidence remains historical; the newly found failure paths are not retroactively described as covered there.

## Limits and delivery

Generic POSIX execution uses a recorded same-PID gate; Windows records the child at spawn. The separate manual QA helper still records its native child at spawn and is not claimed to supply that POSIX pre-exec gate. Actual complete hosted backend suites, installed-app dry-run cleanup and live cache reuse must be observed on the exact PR candidate; no cache-speed claim is made.

Manual installer source requires a concrete separately owner-requested unfinished test and explicit exact-candidate dispatch authorization. The case ID alone grants neither dispatch nor retention. Both-platform upload/download hashes and owner installation acceptance remain open. No manual dispatch or release action is authorized here.

Technical approval and apply/archive use the owner's delegated authority of 2026-11-15. Main integration and Collecting bookkeeping remain subsequent delivery stages. The scope covers original CI:F-002 and CI:F-003 with their necessary artifact hygiene prerequisites; the original audit count is unchanged.
