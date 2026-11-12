# Immutable action reference evidence

## Checked references

Each original commit returned HTTP 404; each replacement commit and its action metadata returned HTTP 200. All six replacement uses passed runtime and input checks without executing upstream action code.

| Action | Exact commit | Exact metadata |
|:--|:--|:--|
| tauri-apps/tauri-action | [Commit](https://github.com/tauri-apps/tauri-action/commit/84b9d35b5fc46c1e45415bdb6144030364f7ebc5) | [action.yml](https://github.com/tauri-apps/tauri-action/blob/84b9d35b5fc46c1e45415bdb6144030364f7ebc5/action.yml) |
| actions/attest-build-provenance | [Commit](https://github.com/actions/attest-build-provenance/commit/e8998f949152b193b063cb0ec769d69d929409be) | [action.yml](https://github.com/actions/attest-build-provenance/blob/e8998f949152b193b063cb0ec769d69d929409be/action.yml) |
| sigstore/cosign-installer | [Commit](https://github.com/sigstore/cosign-installer/commit/398d4b0eeef1380460a10c8013a76f728fb906ac) | [action.yml](https://github.com/sigstore/cosign-installer/blob/398d4b0eeef1380460a10c8013a76f728fb906ac/action.yml) |

## Local verification

- tests: 98 passed, 0 failed (action references, governance and GitHub controls).
- tests: 71 passed, 0 failed (declared focused gate); syntax check passed.
- Online references: 39 uses, 10 unique commits and 10 unique metadata records passed.
- actionlint: 0 findings (release and governance workflows, v1.7.12).
- Shell equivalence: 5 checks passed for output bytes, exit status, SBOM arguments and asset hashes.
- Fresh selected final validation on the integrated implementation: both leaf commands passed; GRACE reported zero errors and four unchanged heuristic warnings.
- Final standards and specification reviews: zero remaining findings on both axes.

## Hosted verification

[PR #227 checks](https://github.com/xronocode/mark/pull/227/checks) passed on `05e995ecf41e34dc9975a5a416d00111249b7af5`. Its complete tree matches squash `6e0d98475d52f023507c456a5a1416c115204d23`.

- All four required contexts, CI, unsigned QA build and five CodeQL analyses passed.
- Renderer: macOS 5860 passed, 2 skips, 3 todos; Windows/Linux 5856 passed each, 6 skips, 3 todos.
- Backend: macOS 599, Windows 542 and Linux 557 passed; one ignored test on each host.
- Native Quick Look: 24 cases passed with zero observed network requests.
- [Browser matrix](https://github.com/xronocode/mark/actions/runs/43178051440), final attempt: 810 passed, one flaky case passed its existing configured retry, eight existing Chromium skips. The earlier Source-to-Split failure passed the same-head failed-job rerun. Source/Split focus and external-delete timing remain open runtime follow-ups; no product fix or clean first-attempt result is claimed.

## Lifecycle and limits

The owner explicitly approved apply/archive on 2026-11-12 after reviewing the exact hosted results and runtime follow-ups. The complete bundle is applied and archived. Admission is operational in the collecting train; dispatch-build owner acceptance remains pending. No version, tag, signing, dispatch or publication is authorized. Read-only configuration validation is not signed-release acceptance.
