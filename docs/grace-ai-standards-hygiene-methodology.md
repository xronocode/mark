# GRACE Methodology: AI Standards Hygiene Overlay

Version: 0.1.0
Scope: Any GRACE project
Source standard family: AI Standards 1.6.0, agent-usage-hygiene and session-hygiene
GRACE modules: M-901, M-902, M-903, M-904, M-905, M-906

## Purpose

This methodology adopts AI Standards token and session hygiene as a GRACE overlay. It reduces wasteful context loading and fragile long-running sessions without weakening GRACE contracts, verification, knowledge graph currency, or semantic markup.

The overlay is project-independent. A GRACE project may copy this methodology and the M-901..M-906 pattern into its canonical artifacts, then adapt only file paths, commands, and module IDs.

## Non-Negotiable Precedence

Use this priority order whenever context economy conflicts with delivery safety:

```text
correctness > required verification > graph consistency > implementation velocity > context economy
```

Token hygiene is an optimization boundary, not a source-of-truth boundary. It never authorizes skipping a MODULE_CONTRACT, omitting a verification excerpt, ignoring AGENTS.md, or bypassing docs/knowledge-graph.xml.

## Adopted Concepts

Adopt from agent-usage-hygiene:

- Load the smallest sufficient context for the approved write scope.
- Prefer precise excerpts over broad artifact dumps.
- Record why broad artifacts were skipped.
- Escalate context scope when dependency, security, migration, or architecture risk appears.
- Keep review and verification focused, but never blind.

Adopt from session-hygiene:

- Keep durable handoffs for compaction, agent rotation, and paused execution.
- Record changed files, dirty files not owned by the task, blockers, verification status, and the next exact action.
- Resume from the handoff first, then open more context only when the handoff is insufficient.

Reject or constrain:

- Do not replace GRACE XML artifacts with chat memory or Markdown-only policy.
- Do not skip required tests because they are expensive.
- Do not downgrade swarm review or verification because of token budget.
- Do not accept vague skip rationales such as "not relevant" without module, flow, or file evidence.

## Context Modes

Use exactly one context mode per execution packet.

`targeted`
: One module or narrow documentation change. Required packet contents: module contract excerpt, KG excerpt, verification excerpt, approved write scope, dependency summaries, context-risk, and skipped-artifacts rationale.

`wave`
: Multiple related modules, shared surface changes, or phase-level documentation updates. Required packet contents: all touched module contracts, shared interfaces, relevant CrossLinks, phase gate excerpts, and wave-level verification.

`full`
: Architecture changes, security changes, data migration, public API changes, uncertain dependency edges, graph drift, failed verification, or release gates. Required packet contents: relevant requirements, technology decisions, development plan, verification plan, knowledge graph, operational packets, and current worktree status.

## Mandatory Escalation Triggers

Escalate from targeted to wave/full when any trigger appears:

- Security boundary, sandboxing, secrets, updater signature, or redaction logic.
- Data migration, rollback, schema, or cross-version compatibility.
- Public IPC, command, API, event, or file format contract.
- Knowledge graph node, dependency, or CrossLink changed.
- Verification plan, phase gate, required marker, or test command changed.
- Review finds a dependency it cannot validate from the current packet.
- Dirty worktree contains related edits from another user or agent.
- A required artifact is missing or stale.

Expected marker: `[GraceContext][selectScope][BLOCK_CONTEXT_ESCALATION]`.

## Operational Packet Fields

Every GRACE execution packet should include:

```xml
<context-policy>
  <mode>targeted|wave|full</mode>
  <precedence>correctness &gt; required verification &gt; graph consistency &gt; implementation velocity &gt; context economy</precedence>
  <escalation-triggers>security, migration, public contract, architecture drift, unclear dependency, graph drift, failed verification</escalation-triggers>
</context-policy>
<loaded-artifacts>
  <artifact-1>docs/development-plan.xml module excerpt</artifact-1>
  <artifact-2>docs/knowledge-graph.xml module excerpt</artifact-2>
  <artifact-3>docs/verification-plan.xml V-M excerpt</artifact-3>
</loaded-artifacts>
<skipped-artifacts>
  <artifact-1 reason="Concrete reason tied to approved scope">path-or-module-id</artifact-1>
</skipped-artifacts>
<context-risk>low|medium|high|critical</context-risk>
<additional-context-needed>none, or concrete artifact/module ID that blocks execution</additional-context-needed>
<verification-not-skipped>true</verification-not-skipped>
```

Validation marker: `[GracePacket][validate][BLOCK_PACKET_CONTEXT_FIELDS]`.

## Handoff Packet

Use this compact handoff shape when a session may be resumed by another agent:

```xml
<HandoffPacket>
  <current-task>Short exact task name and approved scope.</current-task>
  <current-phase>Phase or module ID.</current-phase>
  <changed-files>
    <file-1>path</file-1>
  </changed-files>
  <dirty-files-not-owned-by-task>
    <file-1 reason="Pre-existing user/agent change; do not revert">path</file-1>
  </dirty-files-not-owned-by-task>
  <decisions>
    <decision-1>Decision and rationale.</decision-1>
  </decisions>
  <verification-status>
    <status>not-run|passed|failed|blocked</status>
    <evidence>Commands or checks already run.</evidence>
  </verification-status>
  <blockers>
    <blocker-1>Concrete blocker or none.</blocker-1>
  </blockers>
  <next-exact-action>Next command, file edit, or user approval needed.</next-exact-action>
</HandoffPacket>
```

Handoff marker: `[GraceContext][handoff][BLOCK_COMPACT_SUMMARY]`.

## Skill Behavior

`$grace-plan`
: Default mode is wave. Full mode is required for new architecture, phase gates, public contracts, or migration policy. Targeted mode is allowed only for a narrow amendment to an already approved plan.

`$grace-execute`
: Controller loads canonical artifacts once, then emits targeted packets per approved step. Execution stops when verification excerpts are missing or skeletal.

`$grace-reviewer`
: Default mode is targeted for a small diff. Escalate to wave/full on unclear dependencies, security, migration, public API changes, or graph drift. Marker: `[GraceReview][scope][BLOCK_ESCALATE_TO_FULL]`.

`$grace-verification`
: Default mode is wave for module gates and full for phase gates. Verification may summarize unrelated suites but cannot skip critical path gates or required markers.

`$grace-refresh`
: Default mode is wave when graph or verification references changed. Full mode is required after broad refactors or suspected drift.

`$grace-multiagent-execute`
: Each worker gets a targeted packet. The controller owns shared artifact merges, graph baseline, verification baseline, and cross-worker conflict resolution.

## Verification Gates

`V-GH-001 ContextEconomyDoesNotSkipVerification`
: Targeted packets must still include contract, KG, verification excerpt, dependency summaries, and `verification-not-skipped=true`.

`V-GH-002 ContextEscalatesOnRisk`
: Security, migration, public API, architecture, or uncertain dependency risk forces wave/full context.

`V-GH-003 SkippedArtifactsAreExplicit`
: Skipped artifacts require concrete path/module ID and rationale.

`V-GH-004 DurableSessionHandoff`
: Handoffs include current task, changed files, unrelated dirty files, blockers, verification status, and next exact action.

`V-GH-005 HygieneGraphAndPolicyStayCanonical`
: development-plan, verification-plan, knowledge-graph, operational-packets, and this methodology reference the same hygiene modules and gates.

## Adoption Checklist

- Add M-901..M-906 or project-specific equivalents to `docs/development-plan.xml`.
- Add V-M entries and V-GH gates to `docs/verification-plan.xml`.
- Add KG nodes and CrossLinks to `docs/knowledge-graph.xml`.
- Extend `docs/operational-packets.xml` with context and handoff fields.
- Keep this Markdown as explanatory methodology, not the only canonical record.
- Run XML validation and `rg` checks for all hygiene IDs.

## Runtime Boundary

M-901..M-906 are meta-process modules. They must not become runtime dependencies of product modules. In application projects, they may govern how agents work, but they do not participate in production dependency graphs, build order, or application startup.
