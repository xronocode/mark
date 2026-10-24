# Engineering protocol

This document is the canonical public engineering policy for Mark. `AGENTS.md`
is only a short router to this policy and the contributor, safety and delivery
documents.

## Language policy

English is the working language of the repository. Code comments, commit
messages, documentation, README and CHANGELOG entries, current `.grace` XML,
change specs and plans, test titles and comments, release notes and pull-request
text are written in English. Translate quoted feedback to English while
preserving its date and change identifier when those facts matter.

The following content stays non-English by design:

- `static/locales/*.json` and localized What's New copy;
- localized guides, consent strings and mobile fixtures;
- tests for translated UI, plural rules, keyboard layouts, Cyrillic parsing,
  voice commands, encodings and native-label fallbacks;
- the Cyrillic transliteration table in
  `src/muya/lib/parser/marked/urlify.js`;
- frozen GRACE 3 provenance in `docs/*.xml` and `docs/migrations/**`;
- the reference-only `marktext/` clone;
- `.grace/changes/archive/**`, which is historical evidence.

## GRACE source of truth

Mark uses the routed GRACE 4 layout:

- `.grace/context/*.xml` records requirements, technology and principles;
- `.grace/graph/index.xml` routes module, dependency and data-flow ownership;
- `.grace/verification/index.xml` routes commands, scenarios, markers and
  assertion evidence;
- `.grace/changes/active/C-*/` and `.grace/changes/archive/C-*/` contain approved
  future work and completed or retired change bundles.

The flat XML files in `docs/` are frozen GRACE 3 migration provenance, not
current-state artifacts. Do not edit them to describe new work. Migration
decisions and hashes are recorded in
`docs/migrations/GRACE3_to_GRACE4_2026-08-30.xml`.

## Contract-first changes

Before editing a governed module, read its routed graph contract and file-local
`MODULE_CONTRACT`. New behavior or scope requires an approved GRACE 4 change
spec and plan. Work flows top-down:

`.grace/context -> approved spec -> approved plan -> graph and verification -> code and tests -> evidence`

When responsibility, exports or dependencies change, update `PURPOSE`, `SCOPE`,
`DEPENDS`, `LINKS`, `ROLE`, `MAP_MODE`, the module map and the owning routed
graph document. When tests, commands, critical scenarios, assertions or log
markers change, update the owning routed verification document.

## Semantic markup

Semantic markers are navigation structure. Keep them unique, paired and sized
so one block can be reviewed in a working window.

```text
// FILE: path/to/file.ext
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: One-sentence responsibility.
//   SCOPE: Operations owned by the module.
//   DEPENDS: Module dependencies.
//   LINKS: Graph and verification references.
//   ROLE: RUNTIME | TEST | BARREL | CONFIG | TYPES | SCRIPT
//   MAP_MODE: EXPORTS | LOCALS | SUMMARY | NONE
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   symbol - one-line description
// END_MODULE_MAP
```

Function contracts use `START_CONTRACT: name` / `END_CONTRACT: name`. Code
regions use unique `START_BLOCK_NAME` / `END_BLOCK_NAME` anchors. Meaningful
behavior changes are recorded in `START_CHANGE_SUMMARY`.

Use `RUNTIME + EXPORTS` for normal source APIs, `TEST + LOCALS` for substantial
tests, `BARREL + SUMMARY` for re-export modules, `CONFIG + NONE` for
configuration, `TYPES + EXPORTS` for type-only modules and `SCRIPT + LOCALS` for
tools.

## XML anchors

Current `.grace/*.xml` semantic entities use their unique ID as the tag name;
identity is not stored in an attribute. For example, use
`<M-045><Name>ExtensionHost</Name>...</M-045>` rather than
`<Module ID="M-045">...</Module>`. The same rule applies to `V-M-*`, `GD-*`,
`VD-*`, `DF-*`, `UC-*`, functions, changes and tasks. Structural wrappers such
as `Contract`, `Inputs`, `Commands`, `Scenarios` and `Markers` remain generic.
Frozen GRACE 3 XML is not converted retroactively.

## Logging and verification

Important logs identify their semantic block and use structured fields:

```text
logger.info(`[ModuleName][functionName][BLOCK_NAME] message`, {
  correlationId,
  stableField: value,
});
```

Redact secrets and high-risk payloads. A missing marker on a critical branch is
a verification defect. Prefer deterministic assertions, then trace assertions
when execution trajectory matters. Keep module-local tests close to their
module and define explicit wave-level gates for broad changes.

## Modification checklist

1. Read the module contract, graph entry and relevant verification entry.
2. Confirm an approved active spec and plan for new behavior or scope.
3. Preserve semantic anchors unless intentionally replacing them with better
   anchors.
4. Synchronize module maps, graph ownership and verification evidence.
5. Add a change-summary entry and strengthen nearby verification for bug fixes.
6. Before editing, run `grace lint --path . --assertions current`. During the
   change, run `grace lint --path . --change C-<ID> --assertions target`. Before
   archiving, run `grace lint --path . --change C-<ID> --assertions final
   --run-commands`; afterwards rerun current lint and
   `grace status --path . --with modules --json`.
7. Follow the [commit and push safety protocol](commit-push-safety.md).

## Delivery boundary

The [release-train protocol](release-trains/README.md) is authoritative for
reported, fixed, verified, accepted, queued, frozen, sealed and released states.
“Works”, “accepted”, “include in the next patch” and a green build do not start
a release. Version changes, tags, publishing workflows, store uploads and tap
publication require a separate explicit owner authorization through the release
workflow. Keep desktop and mobile branches, versions, evidence and release
cadences independent.
