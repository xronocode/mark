# Public artifact format and rules

Every artifact that leaves the repository — PR descriptions, release notes,
issue comments written in the project voice, README "What's new" sections,
App Store release notes — follows one format. The reader of the first
section is a **user**, not an engineer: they must understand what changed in
the app from the first screen of text, without opening any linked document.

Cross-references: the [language policy](engineering-protocol.md#language-policy)
(English, with the listed localization exceptions), the
[commit/push safety protocol](commit-push-safety.md), the
[delivery protocol](release-trains/README.md).

## Rule 1 — User-visible first, always

The first section of any public artifact is a plain-language list of what
the user gets. One bullet per user-visible change. Everyday words; no
internal identifiers (C-*, R-*, M-*, corner numbers, gate names, store or
file names) in this section — those belong in References at the bottom.

Good: "Mark now keeps a history of everything it told you during the
session — open it with ⇧⌘P and search for «Notifications»."
Bad: "R-6 lands the palette entry via commandCenter registration (corner
C-1..C-3)."

If a change has no user-visible effect, it does not appear in this section;
it appears in "Under the hood".

## Rule 2 — Fixed section order

1. **What's new** — plain-language user-facing changes (Rule 1).
2. **Under the hood** — engineering-relevant changes (refactors, test
   migrations, dependency changes), still one line each, still readable.
3. **Evidence** — gates as facts (Rule 3).
4. **Release status** — which train this rides or an explicit "not queued
   into any release train"; acceptance state ("owner acceptance pending",
   "accepted 2026-10-22" with the registry pointer).
5. **References** — change bundle ids, spec links, acceptance registry,
   migration notes. Internal identifiers live here and only here.

A section that has nothing to say is omitted (never "N/A").

## Rule 3 — Security gates are stated as one-line facts

Every public artifact that claims verification states each gate as a fact
with its number, in Evidence. The allowed forms:

- `tests: <n> passed, <n> failed (<suite>)`
- `e2e: <n>/<n> passed (<spec or project>)`
- `build: green (<command>)`
- `safety gate: gitleaks clean, deterministic checks pass`
- `grace lint: 0 findings in scope`

Never published alongside those facts: absolute paths, hostnames, model
names beyond "local model", review payloads or evidence file paths, hook
internals, timestamps of local runs, machine details. Gate facts say what
passed — never how the gate is implemented or where its evidence lives
(that stays under the common Git directory).

Failures are stated honestly in the same format, with ownership: `3 failed
(site gallery) — parallel uncommitted theme work, not in this PR's scope`.

## Rule 4 — No unverifiable claims

Numbers must come from a run that actually happened on the artifact being
published (the merge candidate, not a shared working tree). Visual claims
require the probe/crop evidence behind them. "Works", "verified" and
"green" without a number or artifact are not evidence.

## Rule 5 — Language and voice

English (policy exceptions unchanged). No AI-slop markers: no arrow chains,
no em-dash chains, no formulaic transitions. Written like a maintainer who
knows the reader is busy. Product names stay untranslated (Mark, Paper,
Ink, Docs, macOS, Mermaid, Guide; ⌘D / ⌥⌘V in locale copy).

## Rule 6 — Pre-send checklist

Before anything public is posted, the author confirms:

- [ ] First section is user-readable plain language (test: a non-engineer
      understands every bullet).
- [ ] No internal identifiers outside References.
- [ ] Every gate claim is a fact with a number from a run on this artifact.
- [ ] Release status states the train (or the explicit not-queued note) and
      acceptance state.
- [ ] No paths, hostnames, payloads, or private infrastructure references.
- [ ] An outside developer could read it without needing the backstory
      (Rule 7).
- [ ] Sensitive framing was agreed with the owner first (Rule 8).
- [ ] Owner approval for the send is on record (draft → ok → send).

## Rule 7 — Handover-ready

A newcomer reading the README, docs, commit history, PRs and release notes
must be able to understand what Mark is, how it is built and how it
evolved, without seeing the maintainer's working process. Describe outcomes
and designs, not the path to them: no accounts of mistakes, retries, loops,
clean-ups, abandoned attempts, tool, agent or AI usage, or session
mechanics. Titles name the change in neutral engineering terms (what it
does), never the motive. Required ledgers (release trains, acceptance) stay
factual and terse.

## Rule 8 — Agree sensitive framing first

Before publishing anything that touches the maintainer's process, tooling,
AI usage, mishaps, history rewrites or reputation, propose the title and
first lines to the owner and publish only after an explicit ok. When in
doubt, ask.
