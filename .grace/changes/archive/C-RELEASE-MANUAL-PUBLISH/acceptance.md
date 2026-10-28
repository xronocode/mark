# C-RELEASE-MANUAL-PUBLISH — archive record

- Implemented: merged as `7b10f30f` (PR #77, 2026-10-26).
- Owner instruction: 2026-10-26 chat decision that the train always waits and
  nothing publishes without an explicit owner approval (train rule 1), recorded
  in the spec's approval basis and in `docs/release-trains/README.md` (PR #75).
- Plan approval: the three clean four-corner passes in the plan ReviewLog were
  accepted on 2026-10-28; the plan's pre-execution target literals were
  reconciled to the shipped shape with the same semantics (the environment
  block is multiline, the docs name the `release` Environment, and the repealed
  veto markers survive only in historical workflow comments).
- Post-merge state verified 2026-10-28: the `release-notify` Environment is gone
  from the repository; `release`, `release-authorize`, `release-cask` and
  `release-signing` remain.

## Final gate before archival (2026-10-28, main @ `d14335e4`)

`grace lint --path . --change C-RELEASE-MANUAL-PUBLISH --assertions target`

- 0 errors: `publish` declares the `release` Environment, `docs/release-process.md`
  documents the synchronous gate, governance declares `release`, the contract
  test pins the draft-first publish path, and no active veto-window job or
  `RELEASE_VETO_MINUTES` key remains.

## Intentionally not verified here

The first live release after the repeal will show the publish job paused on the
`release` Environment approval. That observation belongs to the release
workflow, not to this archival; no release activity is authorized by it.
