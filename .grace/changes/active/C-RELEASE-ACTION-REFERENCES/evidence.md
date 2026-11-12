# Immutable action reference evidence

## Checked references

Each original commit returned HTTP 404; each replacement commit and its action metadata returned HTTP 200. All six replacement uses passed runtime and input checks without executing upstream action code.

| Action | Exact commit | Exact metadata |
|:--|:--|:--|
| tauri-apps/tauri-action | [Commit](https://github.com/tauri-apps/tauri-action/commit/84b9d35b5fc46c1e45415bdb6144030364f7ebc5) | [action.yml](https://github.com/tauri-apps/tauri-action/blob/84b9d35b5fc46c1e45415bdb6144030364f7ebc5/action.yml) |
| actions/attest-build-provenance | [Commit](https://github.com/actions/attest-build-provenance/commit/e8998f949152b193b063cb0ec769d69d929409be) | [action.yml](https://github.com/actions/attest-build-provenance/blob/e8998f949152b193b063cb0ec769d69d929409be/action.yml) |
| sigstore/cosign-installer | [Commit](https://github.com/sigstore/cosign-installer/commit/398d4b0eeef1380460a10c8013a76f728fb906ac) | [action.yml](https://github.com/sigstore/cosign-installer/blob/398d4b0eeef1380460a10c8013a76f728fb906ac/action.yml) |

## Local verification

1. tests: 98 passed, 0 failed (action references, governance and GitHub controls).
2. tests: 71 passed, 0 failed (declared focused gate).
3. online references: 39 uses, 10 unique commits and 10 unique metadata records passed.
4. actionlint: 0 findings (release and governance workflows, v1.7.12).
5. shell equivalence: 5 checks passed for output bytes, exit status, SBOM arguments and asset hashes.
6. grace lint: 0 findings in scope; four existing heuristic warnings remain.

## Review

Standards review identified a missing release-workflow change summary; the entry is present. Specification review found no substantive implementation findings.

## Hosted verification

Pending the proposed PR head. Configuration validation does not establish signed-release acceptance.

## Lifecycle

The specification and plan remain approved. Apply/archive requires the owner decision after final local and hosted evidence. No release is authorized.
