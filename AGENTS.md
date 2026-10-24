# Mark repository workflow

This file is the short entry point for contributors and automation working in
this repository. The durable rules live in the linked documents:

- [Contributing](CONTRIBUTING.md) — build, test, language and pull-request basics.
- [Engineering protocol](docs/engineering-protocol.md) — GRACE contracts,
  semantic markup, graph and verification maintenance.
- [Commit and push safety](docs/commit-push-safety.md) — mandatory deterministic
  checks for the exact staged or outgoing candidate.
- [Release procedure](docs/release-process.md) — preparation, freeze, seal,
  promotion and post-publication steps.
- [Release-train protocol](docs/release-trains/README.md) — acceptance,
  admission, freeze, seal and release boundaries.

Before changing a governed module, read its file-local `MODULE_CONTRACT`, its
routed graph contract, and the approved change spec and plan. Keep module maps,
graph ownership and verification evidence synchronized with the implementation.

Repository artifacts are written in English except for the deliberate
localization and historical-provenance exceptions documented in the engineering
protocol. Do not rewrite frozen `docs/*.xml`, `docs/migrations/**` or archived
change bundles to describe new work.

An acceptance or a green build is not release authorization. Version changes,
tags and publication require the separate owner-controlled release workflow.

For a governed change, check current state before editing, prove the active
change's target assertions during implementation, and run its final assertions
with commands before archiving. Before handoff, rerun current-state integrity
and status:

```sh
grace lint --path . --assertions current                         # before editing
grace lint --path . --change C-<ID> --assertions target          # during implementation
grace lint --path . --change C-<ID> --assertions final --run-commands
grace lint --path . --assertions current                         # after archiving
grace status --path . --with modules --json
```
