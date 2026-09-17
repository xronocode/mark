# GRACE 4 Framework - Project Engineering Protocol

## Keywords
markdown, editor, wysiwyg, electron, tauri, vue3, muya, macos, homebrew, port, modernization

## Annotation
Mark Text — заброшенный автором, но живой в комьюнити WYSIWYG Markdown редактор. Цель проекта — модернизировать стек (Electron + Vue 2 → Electron 30 + Vue 3 в Фазе A, затем Tauri v2 + Rust в Фазе B), включить 13 комьюнити-PR-ов (bugfixes + features + refactor), уменьшить footprint с 200 MB до ~15 MB, и обеспечить простую установку на macOS через собственный Homebrew tap с ad-hoc signing, без необходимости ручного снятия Gatekeeper quarantine.

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

## Release (cutting a new version)

Releases are tag-triggered via `.github/workflows/release.yml` — **do NOT build or publish locally**. Remote is `fork` (`xronocode/mark`), not `origin`. Flow:

1. Bump the version in **all six synchronized places** (M-046 preflight `release:preflight` enforces this and fails the build on any drift):
   - `package.json` → `"version"`
   - `package-lock.json` → **two** fields: root `"version"` and `packages."".version`
   - `src-tauri/tauri.conf.json` → `"version"`
   - root `Cargo.toml` (`[workspace.package]` → `version`; `src-tauri/Cargo.toml` inherits via `version.workspace = true`)
   - root `Cargo.lock` → the `name = "mark"` package entry version (lock lives in the repo **root**, not `src-tauri/`)
2. **Advance the M-046 fixture** in `tests/renderer/release-preflight.test.js`: replace the old version literal everywhere (`consistentEvidence` object, `validateVersionEvidence` tag args, the CLI `--tag` arg) and add a CHANGE_SUMMARY entry (+ VERSION + MODULE_MAP fixture line). The renderer suite pins the current release version — forgetting this fails `npm test` in CI after ~2.5 min.
3. Validate locally BEFORE tagging:
   - `npm run release:preflight -- --tag v2.X.Y-beta` → must print `BLOCK_RELEASE_VERSION_CONSISTENT ... sources=6`
   - `npx vitest run tests/renderer/release-preflight.test.js` → 11 passed
4. Commit `chore(release): v2.X.Y-beta`, push `fork main`, then `git tag v2.X.Y-beta && git push fork v2.X.Y-beta` (tag pattern `v*.*.*` / `v*.*.*-*`).
5. Watch the run: `gh run list -R xronocode/mark`. If a tag was pushed on a bad commit, delete the remote tag, retag on the fix, push again — the release re-runs.
6. **Write the release notes** — the workflow only publishes the automated verification block (attestation/cosign), never a human changelog. Once the release is live, prepend a user-facing «Что нового» section (grouped: Вкладки / Титлбар / Редактор / …; one bullet per user-visible change, referencing the C-* change ids is optional but keep the wording user-facing) while KEEPING the automated block below a `---` separator:
   ```bash
   gh release view v2.X.Y-beta -R xronocode/mark --json body --jq '.body' > /tmp/rel-body.md
   # prepend the changelog section, then:
   gh release edit v2.X.Y-beta -R xronocode/mark --notes-file /tmp/rel-combined.md
   ```
   Derive the content from the change specs shipped in the release (`git log vPREV..vNEW --oneline` + `.grace/changes/active/C-*/spec.xml` Name/Summary fields).

**Semantics that matter:** beta tags are published as **normal releases** (`PRERELEASE=false` in the workflow, asserted by tests) so the `/releases/latest` feed advances — the in-app updater reads `https://github.com/xronocode/mark/releases/latest/download/latest.json`. A release is live iff that `latest.json` serves the new version.

## Local AI safety

If this project runs local AI inference — ollama, LM Studio, mlx/mlx-whisper, or llama.cpp — follow the canonical protocol (the full reference lives outside this repo):

- **Canon + rationale:** `~/prj/_skills/local-ai-safety/PROTOCOL.md`
- **Pre-flight check — run before any inference:** `~/prj/_skills/local-ai-safety/gpu_check.sh`

One hard rule: **GPU inference slots = 1** — never run two inference engines concurrently (ollama + LM Studio, or either + llama.cpp/mlx). That concurrent load triggered the macOS `IOGPUFamily` kernel panic on this machine. Run `gpu_check.sh` before starting inference; on **exit code 3** (engine conflict) do **not** start another engine — unload the current one first. Any engine used here is run one at a time, never simultaneously.
