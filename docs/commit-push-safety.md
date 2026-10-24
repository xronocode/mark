# Commit and push safety

Every local commit and push must pass the repository's deterministic safety
gate. Product tests and code review do not replace this publication boundary.
Never use `--no-verify`, disable the shared hooks or weaken the candidate being
checked.

## Required sequence

1. Inspect the exact staged files, deletions, commit message and task scope. For
   a push, inspect every outgoing commit and proposed ref update, not only the
   final tree.
2. Run the static exposure checks. They reject credentials, signing material,
   personal absolute paths, private infrastructure, generated output, session
   files, reserved private paths, unsupported captured profiles and
   unreviewable binary payloads.
3. Run Gitleaks with its default rules, full redaction, no repository
   allow-comments and no caller-provided ignore or configuration overrides.
4. Rebuild the exact candidate after scanning. Any staged-tree, message, ref or
   outgoing-commit identity change invalidates the result.
5. Store only a hash-bound receipt in the common Git directory and inspect the
   final diff independently before commit or push.

Removed baseline lines are excluded from new-exposure matching so a cleanup can
remove a private value safely. Added lines and complete new blobs are always
checked. Push review checks every outgoing intermediate commit, so adding and
later removing a secret does not hide it.

The gate also enforces desktop/mobile lane separation, exact staged-index and
outgoing-history snapshots, the public/private path boundary, safe branch
deletion proof, the AI-attribution and branch-name ban, and reviewed screenshot
manifest binding.

Additional owner-local review may be performed outside the repository. It is
discretionary and is neither implemented nor claimed by this public gate.

## Hooks and commands

The pre-commit hook performs the early deterministic scan. The commit-message
hook scans the final staged candidate before the commit is written. The pre-push
hook repeats the full scan for every outgoing commit. Shared hooks live in the
common Git directory, so worktrees use the same reviewed implementation.

Install or update them only from a staged gate candidate:

```sh
python3 tools/security_gate.py install
```

Run an explicit staged review without committing:

```sh
python3 tools/security_gate.py review-staged --message 'type(scope): summary'
```

Hook upgrades must preserve any unrelated existing hook. Apply merges and
cherry-picks with `--no-commit`, then create the commit through the installed
hooks. Do not publish recovery refs, private archives, raw review material,
`.env` files, signing keys, machine-specific test configuration or generated
simulator/build directories.

## Binary evidence

Binary additions fail closed. The automated exception is a changed regular PNG
under `docs/assets/readme/` with a valid PNG signature and an exact lowercase
SHA-256 entry in a changed release screenshot manifest in the same candidate.
The manifest must record `fresh-reviewed` state, reviewer, review date and
non-empty visual-review scenarios. Push review validates that evidence for each
outgoing commit independently; a later manifest cannot authorize an earlier
binary commit.

## Branch and attribution policy

Commit messages must not credit an AI assistant through attribution trailers or
“Generated with” lines, and branch names must not start with an assistant name.
The `reference-transaction` hook applies the branch rule locally. Product
content may still name tools when that is relevant.

A deletion-only push of non-main branches publishes no content and may proceed
only when every deleted tip is already in `<remote>/main` or is the exact head
of a pull request merged into main. Mixed pushes, main, tags and unproven tips
remain blocked. Fetch before housekeeping so the remote main proof is current.

## Evidence and delivery lanes

Console output contains stable markers, relative paths, categories and payload
hashes, never matched secrets. Private receipts identify the operation, exact
candidate digest, checks and gate digest. Fix a finding in the candidate and run
the gate again.

Desktop uses `main`, desktop versions, release trains and `v*` tags. Mobile uses
`mobile/*` with its own version, tests, acceptance ledger and publication flow.
Shared-source synchronization is an explicit reviewed task. Both lanes use the
same deterministic safety gate.
