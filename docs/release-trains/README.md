# Acceptance and release trains

Owner instruction recorded on 2026-10-19: a confirmed fix joins a release train; accepting it does not start a release. This protocol governs delivery bookkeeping and release admission. Existing GRACE specs/plans still govern implementation and structural refactors.

Current train: [2.5.x-next](2.5.x-next.md). It collects stabilization work after 2.5.3; its version and publication date are unassigned.

## A fix moves through these stages

| Stage | Required record | Next action |
|---|---|---|
| Reported | Stable item ID, date, symptom, expected behavior and reproduction or missing details | Investigate and scope the repair. |
| Fixed | Source commit(s), affected behavior and remaining limitations | Run the relevant checks. |
| Verified | Automated evidence and the exact test build | Present the fix for owner acceptance. |
| Accepted | Owner, date, tested build, accepted scenarios and explicit confirmation | Queue the accepted scope in the current train. |
| Queued | Train ID plus integration state and remaining release gates | Continue collecting or prepare a candidate. |
| Released | Version/tag/commit, release run and actual channel evidence | Close this delivery record. |

An item can be integrated into main before or after acceptance. Keep **acceptance**, **integration** and **publication** distinct. A local accepted commit may be queued while integration remains pending. Green tests or main ancestry do not count as owner acceptance or delivery to users.

Reuse a C-* ID when one exists. A small repair without a C-* bundle receives a delivery ID such as FIX-001; this records facts and does not retroactively invent an approved GRACE change. Implementation scope continues to follow the project contract rules.

## Record acceptance immediately

When the owner confirms that the active check works:

1. Record the owner/date and precise scenario in the train item; link the source commit and existing verification evidence.
2. Identify the tested artifact by source revision plus binary hash or CI artifact/run. Product version alone is insufficient for a local test build.
3. Move that item to `queued` in the collecting train. If the owner names a different train, use that destination.
4. Update nearby verification/handoff references to point to the acceptance record.

Acceptance covers the scenarios actually reviewed. Testing Shift+Up/Down does not accept unrelated table/export changes in the same binary. A material change to accepted behavior sets the item to `needs-recheck`; preserve the earlier acceptance and its build as history. A rejected or unresolved item stays pending or moves to a later train with the reason recorded.

## The train has its own lifecycle

- **Collecting:** accepted items accumulate. Version/date, integration and candidate checks can remain pending.
- **Frozen:** exact item scope and candidate commit are recorded, included user-facing changes are accounted for, and applicable checks/acceptance pass. Freezing or reviewing a candidate does not authorize publication.
- **Released:** the separately authorized release has shipped and its actual channel results are recorded.

Keep one collecting stabilization train. On completion, retain its record with the released version and start a new file with a distinct train ID. Train IDs, item IDs and file paths remain stable and are never reused; update the Current train link above to select the new train. Record moved/deferred items and destination rather than silently removing their history.

Before freezing, compare the proposed candidate with the previous release. Every user-visible change in that diff must be accounted for. Main or a parent commit may contain an unaccepted feature; resolve it through acceptance or a reviewed adjustment of the release branch. A queue row cannot exclude code that is still present in the candidate.

Required release admission evidence:

- Accepted scenarios and integration commit for each included item; any new behavior change has fresh acceptance.
- Candidate-specific passing CI, relevant local/browser/native checks, and applicable speed/memory/size comparisons. Preserve existing thresholds.
- No known content-loss or release-blocking defect in the included flows.
- Reviewed contents and release materials covering both C-* changes and small FIX-* repairs.
- The owner's explicit instruction to release this train/version. Record it separately from acceptance.

Statements such as “works”, “accepted”, “mark for release”, “include in the next patch”, and a request to freeze/review the candidate authorize the corresponding preparation or queue update. They do not authorize version bumps, tags, publishing workflow dispatches, store uploads or tap publication. An explicit release instruction authorizes its stated release scope; do not ask again for steps already authorized by it.

After that instruction, follow the [repository release procedure](../../AGENTS.md#release-cutting-a-new-version). Do not infer a release from a test result. Ordinary integration/CI and local test builds remain separate from publication.

After publication, record GitHub assets, updater `latest.json`, Homebrew version/hash and any other channels included in that release's scope. App Store approval has its own version and external status; do not infer it from a direct-download release. A successful workflow alone is not proof that an update is available to users.

## Keep one small record per item

Use the train file as the delivery ledger; C-* bundles and routed verification retain their own implementation/evidence details. Roadmaps link to it instead of maintaining another acceptance list. Record status changes as short dated events. A new runtime, database, scheduling service or per-click approval flow is unnecessary for this protocol.

Template for an item:

```markdown
### C-... or FIX-...

- Summary / reported / reproduction:
- Source commit(s) / integration state:
- Automated evidence:
- Tested artifact / source revision / artifact hash:
- Owner acceptance date and precise scope:
- Train / state / remaining gates:
- Release note draft:
- History: dated status changes; release authorization and publication stay separate.
```
