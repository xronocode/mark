# Attribution notice refresh evidence

Approved under owner-delegated recovery and the explicit reduced-scope decision on 2026-11-09. This child is validated independently of the in-progress security parent; the original parent spec, plan and tasks remain unchanged.

The shipping change contains only the Node formatter/count/local-command correction, three formatter tests, refreshed Node/Rust notices and M-046/V-M-046 projections. No collector, runtime dependency, tool pin, release workflow, verification-script behavior, Rust generator or Rust source change is included.

## Corrected diagnosis

The initial fixture used NOFILE 512 and produced incomplete metadata without a failing checker exit:205 old-layout records and 144 new-layout records. At NOFILE 4096 both layouts produce372 records with the same installed license-checker 25.0.1. The layout-sensitive omission diagnosis is retracted. The provisional collector and its misleading evidence remain private, never applied or shipped. NOFILE 4096 is the faithful fixture boundary used for final evidence.

## Actual offline proof

1. The exact pinned checker command `./node_modules/.bin/license-checker --production --json` produces372 records:371 third-party production identities plus the workspace root. Independent `npm ls --all --omit=dev --parseable --offline --ignore-scripts` produces377 physical paths including the root, deduplicating to the same371 third-party identities after the checker's leading-v normalization. All47 direct production dependencies are present; no missing/extra identities remain.
2. The formatter consumes that actual checker JSON and emits exactly371 third-party entries. The truthful reproducible command uses the installed local checker. No UNKNOWN Node license remains in this actual checker output; detected values may include the checker suffix `*`.
3. The actual installed cargo-bundle-licenses 4.2.0 executes its unmodified `--format json --output` command and emits638 crates. Missing all-platform locked archives were fetched into a private physical APFS clone of the registry, without builds or candidate code execution; Cargo.lock stayed SHA256 `ace2953d435d32a4f7ae9f989e70e9e1f815eb9449f7ab63f67eedaba025da03`. No retained/shared Rust cache was changed. The existing Rust formatter is unchanged. The tool's license-template/confidence warnings are preserved; they do not prevent complete output.
4. Exact `bash tools/verify-attributions.sh` exits 0 in 2.005 seconds, reports both notices up-to-date and ends with `[verify-attributions] OK`. Candidate execution is OS-sandboxed, network denied, source/tools readonly, clean environment and scratch-only output; no host credentials. Resource guards include NOFILE 4096, CPU 120 seconds, wall 180 seconds,1 GiB RSS,8 process group members and256 MiB additional output.
5. The focused command `node node_modules/vitest/vitest.mjs run tests/tools/build-notices-node.test.mjs tests/tools/release-fresh-npx.test.mjs` passes 20 tests. Restoring the old count/local command only in a disposable fixture makes all 3 formatter tests fail, and restoring the final source passes the declared final gate.
6. `grace lint --path . --change C-ATTRIBUTION-NOTICE-REFRESH --assertions final --run-commands` exits 0 with 0 errors and 4 existing Python heuristic warnings. Trusted GRACE runs with a clean environment; its exact declared Node leaf command runs through a literal OS-sandbox wrapper because Bun's JavaScript runtime traps inside the outer sandbox. The tests remain network denied with readonly source.

## Platform boundary

Node notices reflect the installed darwin-arm64 production closure. Selected platform-restricted identities include `@typescript/typescript-darwin-arm64@7.0.2`, `@esbuild/darwin-arm64@0.28.2`, `@rollup/rollup-darwin-arm64@4.60.2` and macOS-only `fsevents@2.3.3`. Other OS/CPU installs can produce different notice inventories. The Rust command uses its complete default all-platform metadata, without target narrowing. This evidence grants no release or publication authorization.
