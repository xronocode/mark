# F-004 partial-wave execution evidence

2026-11-09. Base: `5ddb413` (the stabilization CI integration). Only T-001 and residual T-002 were executed. The approved spec, approved plan and design context were imported unchanged from the prepared bundle. The full security change remains active; no applied/archive transition is claimed.

## Choices and source changes

- Pin `license-checker` at **25.0.1** and `@cyclonedx/cyclonedx-npm` at **6.0.1** as exact devDependencies, including the complete npm lock resolution. CycloneDX 6.0.1 preserves the workflow's existing explicit version; the official npm registry's exact-version metadata confirms both versions and integrity values. CycloneDX declares Node >=20.18.0 and npm >=9, compatible with the Node 22 release lane.
- Resolve only lock metadata using `npm install --package-lock-only --ignore-scripts --save-dev --save-exact license-checker@25.0.1 @cyclonedx/cyclonedx-npm@6.0.1 --registry=https://registry.npmjs.org --userconfig=/dev/null --no-audit --no-fund` and a task-local cache. No dependency lifecycle scripts or newly downloaded package code ran. No existing locked package version changed. npm added 212 package entries, removed two redundant nested peer entries, and removed the now-inapplicable peer-only flag from safer-buffer.
- Replace release-package executors with `./node_modules/.bin/license-checker` and `./node_modules/.bin/cyclonedx-npm`, installed by the existing preceding `npm ci`. Preserve cargo tool pins, CI workflow changes, signing/publication boundaries and the checked gateway deploy wrapper.
- Add `tests/tools/release-fresh-npx.test.mjs`: reject the full executor token family, including bare/short/long flags, misleading trailing `--no-install`, npm exec/x and Windows command suffixes; report source file and line; accept direct local binaries. Assert exact root/lock pins and install-before-use ordering.
- Remove only the obsolete unpinned logout instruction from the gateway README; retain the grant-revocation instruction and checked deployment section. The checked deploy wrapper's bytes are unchanged.

## Verification

1. Before observed source writes, both `grace lint --path . --assertions current` and `grace lint --path . --change C-SEC-AUDIT-FIXES --assertions baseline` passed with zero errors and four existing Python heuristic warnings.
2. Red phase: the new guard's synthetic fixtures passed, while the unchanged release executor lines failed with their exact filenames/lines and the direct-invocation assertion failed. After the source edits, the four focused suites passed **102/102 tests**: release-fresh-npx (17), stats-gateway (54), stats-gateway-deploy (7), release-github-controls (24).
3. Focused tests ran against a disposable byte copy through macOS sandbox-exec: no network permission, no host-home/credential read permission, read-only fixture source and shared pre-existing test dependencies, and scratch-only writes. Environment was empty except explicitly supplied PATH, scratch-local HOME/TMPDIR, CI, NO_COLOR, TZ and GOMAXPROCS. Limits: 90-second process CPU, 150-second wall, 32 MiB/file, 256 open files, 16 monitored group processes, 1 GiB monitored group RSS and 256 MiB monitored output. The native user-process limit was 1024 because the host already had more than 512 user processes. No limit was hit.
4. `bash -n tools/verify-attributions.sh` and `git diff --check` passed. The approved bundle and checked deployment wrapper were compared byte-for-byte with their inputs. No README package-executor instruction remains.

## Remaining work and limits

The selected full-change target assertions intentionally remain unsatisfied: F-001/F-002/F-003/F-005/F-006 source and regression work, locale changes, central graph/verification projection work and whole-suite command evidence are pending. This partial worker does not mutate those projections or mark the entire change applied.

The focused proof uses only the already installed test runner and synthetic fixtures/source metadata. Actual newly locked license-checker/CycloneDX execution after a clean install with the registry unavailable, generated NOTICE/SBOM compatibility, and hosted release logs remain required F-004 acceptance evidence. No production command, live deployment, keychain access, commit or push was performed. Local Node 22.19/npm 10.9.3 reported engine warnings for existing jsdom-related dependencies requiring a newer Node 22 patch; those locked versions predate this change. Whole-suite/final GRACE, exact-candidate safety and required CI remain central integration gates.
