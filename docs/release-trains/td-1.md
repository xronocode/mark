# td-1 — technical-debt lane

| Field | Value |
|---|---|
| State | Merged |
| Lane branch | `integ/techdebt` |
| Base | main `2bae3364` (2026-10-29, PR #129) |
| Protocol | [Acceptance and release trains](README.md) |
| Machine-readable authority | [td-1.json](td-1.json) — deterministic admission state; this Markdown file remains the human evidence ledger |

- 2026-10-31 — lane opened on `integ/techdebt` from main `2bae3364`, following the owner instruction of 2026-10-30 that technical-debt fixes collect on their own train. Collecting; no admissions yet.
- 2026-10-31 — lane synced with main through `8c4bff76` (lane-train tooling via #132, macos-15 runners via #136); the full suite now runs on this branch.

## Admitted items

### DEV-BADGE

- Summary: developer tools ship disabled in every default build (explicit `--features devtools` opt-in or a debug build), and a runtime-drawn orange DEV chevron marks the app icon while they are on.
- Source commit: `b9d8e5f6` (PR #133); admission commit on the lane.
- Testing protocol (rule 4): full suite green on the lane CI after the sync (macos-15, ubuntu, windows); macOS debug-launch check with the Dock chevron and the `BLOCK_DEV_BADGE_APPLIED` marker; cargo 467/0 on macOS including the M-069 badge tests.

### GRAPH-INDEX-XML

- Summary: the rollback manager comment in the graph index no longer contains a double hyphen, so strict XML parsers accept the file again.
- Source commit: `f5f18ab9` (PR #134); admission commit on the lane.
- Testing protocol (rule 4): xmllint --noout accepts .grace/graph/index.xml; lane CI green.

### RELAUNCH-SILENCE

- Summary: the cfg-asymmetric `relaunch` parameter of the rollback restore core is silenced for non-macOS clippy runs, matching the existing `fetch`/`spawn_installer` treatment.
- Source commit: `d688f2fc` (PR #135); admission commit on the lane.
- Testing protocol (rule 4): cargo check green on macOS with the patch; lane CI green.

### TD-1-ADMIN (operational)

- Summary: lane bookkeeping — the td-1 opening commit, the main sync merge (lane-train tooling and macos-15 runners) and the three admission commits.
- Source commits: `9f507343`, `8c4bff76`, `8461c4e5`, `dc9fc5f1`, `ce6eebcc`.
- Testing protocol (rule 4): release:readiness validated the lane at every step; lane CI green through the sync.

## Freeze

- 2026-10-31 — departed into main as merge commit `0d142333` (PR #139) at the owner's go; carried by [2.9.x-next](2.9.x-next.md) as the td-1 lane item. Merged.
- 2026-10-31 — frozen at the owner's departure instruction; `lane.headSha` is fixed at `ce6eebcc` and every lane commit is accounted through it (eight entries, four items). The lane takes no more admissions.
