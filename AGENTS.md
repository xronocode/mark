# GRACE 4 Framework - Project Engineering Protocol

## Keywords
markdown, editor, wysiwyg, electron, tauri, vue3, muya, macos, homebrew, port, modernization

## Annotation
Mark Text — a WYSIWYG Markdown editor abandoned by its original author but alive in the community. The project goal is to modernize the stack (Electron + Vue 2 → Electron 30 + Vue 3 in Phase A, then Tauri v2 + Rust in Phase B), land 13 community PRs (bugfixes + features + refactor), shrink the footprint from 200 MB to ~15 MB, and make macOS installation simple via a custom Homebrew tap with ad-hoc signing — no manual Gatekeeper quarantine removal needed.

## Language Policy

English is the working language of this repository. Every committed artifact is written in English: code comments, commit messages, docs, README, CHANGELOG, `.grace` current-state XML, change specs and plans, test titles and comments, GitHub release notes, and PR/issue text. When a comment cites what a person said, translate the quote to English and keep the speaker, date, and change id.

Deliberate exceptions (stay non-English by design — do not "fix" them):
- `static/locales/*.json` and `src/renderer/src/whatsNew/data.js` — product localization (10 locales, native copy)
- localized guide and fixture content: `static/guide/ru.md`, `static/mobile-fixture.md`, `site/public/consent.js` per-locale strings
- test fixtures and assertions that verify localization behavior: RU plurals, Russian UI strings in locale regression specs, `Cmd+Я` Russian-layout keys, Cyrillic slugify/anchor/quote-pairing cases, `«Марк, отмена»` voice commands, CP-1251 encoding tests, native-driver label fallbacks like `['Cancel', 'Отмена']`
- functional data: the Cyrillic transliteration table in `src/muya/lib/parser/marked/urlify.js`
- `docs/*.xml` GRACE 3 provenance and `docs/migrations/` — frozen byte-for-byte
- `marktext/` upstream clone — reference only
- `.grace/changes/archive/` — historical record, like git history; new changes are English, archives are not retro-translated

GitHub release notes carry an English "What's new" section above the `---` separator; the automated verification block below it is never edited. Conversations with the owner may stay in Russian — chat is not repo content.

## GRACE 4 Source of Truth

Mark uses the routed GRACE 4 layout as its current-state governance model:

- `.grace/context/*.xml` — requirements, technology, principles, deployment, and UX context
- `.grace/graph/index.xml` plus routed `.grace/graph/*.xml` — modules, contracts, dependencies, relationships, and data flows
- `.grace/verification/index.xml` plus routed `.grace/verification/*.xml` — commands, scenarios, markers, and assertion evidence
- `.grace/changes/active/C-*/` and `.grace/changes/archive/C-*/` — approved future change specs and plans

The former flat XML files under `docs/` are preserved byte-for-byte as GRACE 3 migration provenance. They are not current-state artifacts and must not be edited to describe new work. Migration decisions, source hashes, verification-anchor conflicts, and their non-active evidence policy are recorded in `docs/migrations/GRACE3_to_GRACE4_2026-08-30.xml`.

## Core Principles

### 1. Never Write Code Without a Contract
Before generating or editing a governed module, read its routed graph contract and file-local MODULE_CONTRACT. Update PURPOSE, SCOPE, DEPENDS, LINKS, ROLE, and MAP_MODE when the file responsibility changes. New behavior or scope also requires an approved GRACE 4 change spec and plan under `.grace/changes/active/C-*/`. Code implements the contract, not the other way around.

### 2. Semantic Markup Is Load-Bearing Structure
Markers like `// START_BLOCK_<NAME>` and `// END_BLOCK_<NAME>` are navigation anchors, not documentation. They must be:
- uniquely named
- paired
- proportionally sized so one block fits inside an LLM working window

### 3. Knowledge Graph Is Always Current
`.grace/graph/index.xml` routes graph ownership. When you add a module, move a module, rename exports, or add dependencies, update the owning routed graph document and its index entry so future agents can navigate deterministically.

### 4. Verification Is a First-Class Artifact
Testing, traces, and log anchors are designed before large execution waves. `.grace/verification/index.xml` and its routed verification documents are part of the architecture, not an afterthought. Logs are evidence. Tests are executable contracts.

### 5. Top-Down Synthesis
Code generation follows:
`.grace/context -> approved GraceChangeSpec -> GraceChangePlan -> graph + verification deltas -> code + tests -> evidence`

Never jump straight to code when requirements, architecture, or verification intent are still unclear.

### 6. Governed Autonomy
Agents have freedom in HOW to implement, but not in WHAT to build. Contracts, plans, graph references, and verification requirements define the allowed space.

## Semantic Markup Reference

### Module Level
```
// FILE: path/to/file.ext
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: [What this module does - one sentence]
//   SCOPE: [What operations are included]
//   DEPENDS: [List of module dependencies]
//   LINKS: [Knowledge graph references]
//   ROLE: [Optional: RUNTIME | TEST | BARREL | CONFIG | TYPES | SCRIPT]
//   MAP_MODE: [Optional: EXPORTS | LOCALS | SUMMARY | NONE]
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   exportedSymbol - one-line description
// END_MODULE_MAP
```

### Function or Component Level
```
// START_CONTRACT: functionName
//   PURPOSE: [What it does]
//   INPUTS: { paramName: Type - description }
//   OUTPUTS: { ReturnType - description }
//   SIDE_EFFECTS: [External state changes or "none"]
//   LINKS: [Related modules/functions]
// END_CONTRACT: functionName
```

### Code Block Level
```
// START_BLOCK_VALIDATE_INPUT
// ... code ...
// END_BLOCK_VALIDATE_INPUT
```

### Change Tracking
```
// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v1.2.0 - What changed and why]
// END_CHANGE_SUMMARY
```

### Optional Lint Semantics

Use `ROLE` and `MAP_MODE` only when the file should be linted differently from a normal runtime module.

- `RUNTIME` + `EXPORTS`: normal source files with public APIs
- `TEST` + `LOCALS`: tests where the map should describe helpers, fixtures, and assertion surfaces
- `BARREL` + `SUMMARY`: re-export aggregators and grouped entry points
- `CONFIG` + `NONE`: build or tool configuration files
- `TYPES` + `EXPORTS`: pure type/interface modules
- `SCRIPT` + `LOCALS`: CLI/bootstrap/smoke scripts

## Logging and Trace Convention

All important logs must point back to semantic blocks:
```
logger.info(`[ModuleName][functionName][BLOCK_NAME] message`, {
  correlationId,
  stableField: value,
});
```

Rules:
- prefer structured fields over prose-heavy log lines
- redact secrets and high-risk payloads
- treat missing log anchors on critical branches as a verification defect
- update tests when log markers change intentionally

## Verification Conventions

`.grace/verification/index.xml` and the routed verification documents are the project-wide verification contract. Keep them current when module scope, test files, commands, critical log markers, assertions, or gate expectations change. Future execution is governed by the active GRACE 4 change spec/plan; `docs/operational-packets.xml` is retained only as GRACE 3 provenance.

Testing rules:
- deterministic assertions first
- trace or log assertions when trajectory matters
- test files may also carry MODULE_CONTRACT, MODULE_MAP, semantic blocks, and CHANGE_SUMMARY when they are substantial
- module-local tests should stay close to the module they verify
- wave-level and phase-level checks should be explicit in the verification plan

## File Structure
```
docs/
  requirements.xml       - Preserved GRACE 3 provenance; not current state
  technology.xml         - Preserved GRACE 3 provenance; not current state
  development-plan.xml   - Preserved GRACE 3 provenance; not current state
  verification-plan.xml  - Preserved GRACE 3 provenance; not current state
  knowledge-graph.xml    - Preserved GRACE 3 provenance; not current state
  operational-packets.xml - Preserved GRACE 3 provenance; not current state
  migrations/            - Migration inventory, hashes, decisions, and validation
.grace/
  context/               - Current requirements, technology, principles, deployment, UX
  graph/                 - Routed module/data-flow graph plus index.xml
  verification/          - Routed verification contracts plus index.xml
  changes/active/        - Approved work in progress (C-*)
  changes/archive/       - Completed or retired change bundles (C-*)
marktext/                - Upstream clone (reference only, do not commit into the port repo)
src/                     - will be populated in Phase-A (electron-vite restructure)
src-tauri/               - will be populated in Phase-B (Tauri Rust backend)
tests/
  ... tests with GRACE-aware evidence where appropriate ...
```

## GRACE 4 XML Anchor Convention

In current `.grace/*.xml` artifacts, semantic entities use their unique ID as the XML tag name. Semantic anchor identity must not be stored in XML attributes. Use child elements for names, paths, types, and other metadata.

### Tag naming conventions

| Entity type | Anti-pattern | Correct (attribute-free semantic anchor) |
|---|---|---|
| Module | `<Module ID="M-045">...</Module>` | `<M-045><Name>ExtensionHost</Name>...</M-045>` |
| Verification module | `<Verification ID="V-M-045">...</Verification>` | `<V-M-045><Priority>high</Priority>...</V-M-045>` |
| Graph document | `<GraphDocument ID="GD-FEATURES">...</GraphDocument>` | `<GD-FEATURES><Path>graph/features.xml</Path>...</GD-FEATURES>` |
| Verification document | `<VerificationDocument ID="VD-FEATURES">...</VerificationDocument>` | `<VD-FEATURES><Path>verification/features.xml</Path>...</VD-FEATURES>` |
| Flow | `<Flow ID="DF-SEARCH">...</Flow>` | `<DF-SEARCH><Name>Search</Name>...</DF-SEARCH>` |
| Use case | `<UseCase ID="UC-001">...</UseCase>` | `<UC-001>...</UC-001>` |
| Function | `<Function ID="fn-search">...</Function>` | `<fn-search>...</fn-search>` |
| Change/task | `<Change ID="C-...">` / `<Task ID="T-...">` | `<C-...>...</C-...>` / `<T-...>...</T-...>` |

### What NOT to change
- structural wrappers such as `<Contract>`, `<Inputs>`, `<Outputs>`, `<Commands>`, `<Scenarios>`, and `<Markers>` stay generic
- conflicting or orphan legacy verification bodies remain under non-anchor evidence wrappers and never become active duplicate V-M-* anchors
- preserved GRACE 3 XML remains byte-for-byte and is not rewritten to this convention
- code-level markup already uses unique names and stays as-is

## Rules for Modifications

1. Read the MODULE_CONTRACT before editing any file.
2. After editing source or test files, update MODULE_MAP in a way that matches the file's role and map mode.
3. After adding, removing, moving, or changing modules, update `.grace/graph/index.xml` and the owning routed graph document.
4. After changing test files, commands, critical scenarios, assertions, or log markers, update `.grace/verification/index.xml` and the owning routed verification document.
5. After fixing bugs, add a CHANGE_SUMMARY entry and strengthen nearby verification if the old evidence was weak.
6. Never remove semantic markup anchors unless the structure is intentionally replaced with better anchors.
7. New behavior or scope starts from an approved `.grace/changes/active/C-*/change-spec.xml` and `change-plan.xml`; do not reconstruct historical work as retroactive changes.
8. Run `grace lint --path . --assertions current` and `grace status --path . --with modules --json` before handing off a governed change.

## Acceptance and release trains

Read [the delivery protocol](docs/release-trains/README.md) and follow its Current train link when recording a fix, owner acceptance, a handoff or a release instruction. Keep historical train paths and IDs stable.

- Track reported → fixed → verified → owner accepted → queued → released, with commit/build evidence and integration state recorded separately.
- “Works”, “accepted”, “mark for release” and “include in the next patch” mean record acceptance and queue the checked scope. They never mean start a release.
- Record the owner's date, precise accepted scenarios and tested artifact. Acceptance of one fix does not accept other features in the same build. Material changes to accepted behavior require a new check.
- Queue accepted work in the current collecting train. Its target version/date may remain unassigned. Keep pending candidates distinct from included items.
- Before freezing a candidate, account for every user-facing change since the previous release, including changes already in main and small repairs without C-* bundles.
- Version bumps, release tags, publishing workflow dispatches, store uploads and tap publication require a separate explicit owner instruction to release. A frozen train or green CI is not that instruction.
- This is delivery bookkeeping; implementation and structural refactors still follow their own GRACE contracts, approved scopes and gates.

## Release (cutting a new version)

Releases are tag-triggered via `.github/workflows/release.yml` — **do NOT build or publish locally**. Remote is `fork` (`xronocode/mark`), not `origin`. Start this flow only after the separate release instruction and train admission described above:

1. **Preparation PR** (squash-merged like every PR — merge commits and rebase are disabled): set the version with `npm version 2.X.Y --no-git-tag-version` (package.json is the single version authority; this also writes both `package-lock.json` fields), then `npm run release:normalize -- --write`. Normalization propagates it to the remaining synchronized places — `src-tauri/tauri.conf.json`, root `Cargo.toml` `[workspace.package]`, root `Cargo.lock` (`name = "mark"`) — advances the M-046 fixture in `tests/renderer/release-preflight.test.js`, moves the current train to Preparing, and re-targets the draft materials if the version differs from the plan. Never edit these surfaces by hand. The current train is named by `docs/release-trains/current.json`.
2. Validate locally:
   - `npm run release:preflight -- --tag v2.X.Y` → must print `BLOCK_RELEASE_VERSION_CONSISTENT ... sources=6`
   - `npm run release:normalize -- --require-clean` → `files=0`
   - `npx vitest run tests/renderer/release-*.test.js` → all pass
3. **Materials (mandatory, part of the preparation PR)** — every user-facing surface must match the release. Reconcile the frozen train items (including FIX-* repairs), shipped change specs and exact release diff (`git log vPREV..HEAD --oneline` + `.grace/changes/active/C-*/spec.xml` Name/Summary/Decisions), ranked by the latest gap-analysis categories (UI polish → product mechanics → content rendering → folder work → AI/agents → breadth):
   - **What's New sheet**: the new version's entry in `src/renderer/src/whatsNew/data.js` (≤ 4 items) with locale keys in **all ten** `static/locales/*.json` (titles ≤ 32 chars, texts ≤ 90), the "Also" line and the "See everything new" release URL; `tests/renderer/whatsNew/content.test.js` must pass.
   - **README**: «What's new in vX.Y.Z» section in the same categories with a one-line pointer to the previous release's highlights in CHANGELOG, stale claims fixed, and fresh screenshots — capture with `README_SHOTS=1 npx playwright test tests/e2e/readme-shots.spec.ts --project=chromium` and commit the PNGs in `docs/assets/readme/`.
   - **CHANGELOG.md**: a dated `## [X.Y.Z]` entry in the same categories.
   - **Release notes**: draft the user-facing "What's new" section now, **in English** (step 6 pastes it once the release is live).
   - All ten locales are written/proofread as **native copy** (meaning from the approved sheet texts, not literal translations; ⌘D / ⌥⌘V and product names — Mark, Paper, Ink, Docs, macOS, Mermaid, Guide — stay untranslated).
4. **Freeze and seal** through ordinary squash PRs: the freeze records `payloadSha` (the merged product commit with green `status check`, `release/governance`, `release/readiness`) and classifies every commit since the previous release; the seal sets `Ready`. Corrections after the freeze are just more bookkeeping commits — the seal span may hold any number of them as long as each touches only `docs/release-trains/*` or `docs/assets/readme/*.manifest.json`. **Never push a tag yourself**: the tag ruleset admits only the release bot.
5. **Release**: `release/promote` waits on the `release-authorize` Environment; the owner's approval there is the release instruction and the bot creates the annotated tag on the seal (the seal only has to be on main, so other merges may continue). The tag run builds (~17 min), holds the no-veto window (`RELEASE_VETO_MINUTES`, default 20; cancelling the run is the veto), publishes, proves `releases/latest` advanced, and opens the Homebrew cask PR. Watch with `gh run list -R xronocode/mark`; recovery paths are in [the delivery protocol](docs/release-trains/README.md#recovery-matrix). After publication record `Released` in the train and open the next train by editing `current.json`.
6. **Write the release notes** — the workflow only publishes the automated verification block (attestation/cosign), never a human changelog. Once the release is live, prepend a user-facing "What's new" section **in English** (grouped: Tabs / Title bar / Editor / …; one bullet per user-visible change, referencing the C-* change ids is optional but keep the wording user-facing) while KEEPING the automated block below a `---` separator:
   ```bash
   gh release view v2.X.Y-beta -R xronocode/mark --json body --jq '.body' > /tmp/rel-body.md
   # prepend the changelog section, then:
   gh release edit v2.X.Y-beta -R xronocode/mark --notes-file /tmp/rel-combined.md
   ```
   Derive the content from the frozen train, shipped change specs and exact release diff (`git log vPREV..vNEW --oneline` + `.grace/changes/active/C-*/spec.xml` Name/Summary fields).

**Semantics that matter:** beta tags are published as **normal releases** (`PRERELEASE=false` in the workflow, asserted by tests) so the `/releases/latest` feed advances — the in-app updater reads `https://github.com/xronocode/mark/releases/latest/download/latest.json`. A release is live iff that `latest.json` serves the new version.

## Commit and push safety

Before every local commit and push, follow [the mandatory safety protocol](docs/commit-push-safety.md): exact staged/outgoing checks, Gitleaks, two serial local-model passes, independent final diff inspection and candidate identity recheck. No hook bypass, cloud fallback or commit containing private recovery/build/session material. Install the shared hooks with `python3 tools/security_gate.py install`; stage the reviewed gate before installation. Apply merges/cherry-picks with `--no-commit`, then commit through the hooks. Desktop and mobile keep independent branches, versions, acceptance ledgers and release cadences.

## Local AI safety

If this project runs local AI inference — ollama, LM Studio, mlx/mlx-whisper, or llama.cpp — follow the canonical protocol (the full reference lives outside this repo):

- **Canon + rationale:** `~/prj/_skills/local-ai-safety/PROTOCOL.md`
- **Pre-flight check — run before any inference:** `~/prj/_skills/local-ai-safety/gpu_check.sh`

One hard rule: **GPU inference slots = 1** — never run two inference engines concurrently (ollama + LM Studio, or either + llama.cpp/mlx). That concurrent load triggered the macOS `IOGPUFamily` kernel panic on this machine. Run `gpu_check.sh` before starting inference; on **exit code 3** (engine conflict) do **not** start another engine — unload the current one first. Any engine used here is run one at a time, never simultaneously.
