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
5. Run the two model reviewers described below, then store only a hash-bound
   receipt in the common Git directory and inspect the final diff independently
   before commit or push.

Removed baseline lines are excluded from new-exposure matching so a cleanup can
remove a private value safely. Added lines and complete new blobs are always
checked. Push review checks every outgoing intermediate commit, so adding and
later removing a secret does not hide it.

The gate also enforces desktop/mobile lane separation, exact staged-index and
outgoing-history snapshots, the public/private path boundary, safe branch
deletion proof, the AI-attribution and branch-name ban, and reviewed screenshot
manifest binding. The path boundary rejects owner-workspace and private
companion references (owner-workspace paths, private repository and worktree names),
non-local CGNAT and `*.ts.net` addresses, and absolute homes whose user segment
is not a documented synthetic example; `/Users/<fixture>/`, `/Users/<user>/`,
`/Users/me/`, `~/project` and `~/Library/...` remain valid.

## Two model reviewers

After the deterministic checks pass, the exact candidate runs through two
independent reviewers: two serial local passes and one independent non-local pass.
The local passes are a review and a skeptical independent recheck on the
owner-local model; the non-local pass runs on the owner-configured host. Every
chunk must pass every pass; a malformed verdict, a different loaded model, a redirect, an unreachable
endpoint or a missing non-local configuration stops the commit or push.

The endpoints and model names are owner-local configuration, never repository
content. The gate reads `MARK_SAFETY_LOCAL_ENDPOINT`, `MARK_SAFETY_LOCAL_MODEL`,
`MARK_SAFETY_REMOTE_ENDPOINT`, `MARK_SAFETY_REMOTE_MODEL` and the optional
`MARK_SAFETY_*_GPU_CHECK`, or the owner-only `reviewers.json` in the common Git
safety directory:

```json
{
  "local": {"endpoint": "http://127.0.0.1:11434", "model": "qwen3:4b"},
  "nonLocal": {"endpoint": "http://<overlay-address>:11434", "model": "qwen3:4b"}
}
```

The file stays outside the repository and must be mode `0600`. The local
reviewer must be loopback; the non-local reviewer must resolve to loopback,
RFC 1918, the CGNAT shared range, `.local` or `*.ts.net`, so candidate bytes are
never sent to a public address.

`MARK_SAFETY_OVERRIDE="<reason>"` skips only the two model reviewers, after the
deterministic checks and Gitleaks have passed for the exact candidate identity.
It writes an identity-bound private receipt and prints an explicit override
marker; the same content must repeat the override at push time. Deterministic
exposure, lane, Gitleaks and identity checks remain mandatory and
unbypassable.

## Message-only main rewrites

A non-fast-forward update of `main` is admitted only through a separately
approved history-rewrite change and an exact owner-local manifest. The manifest
binds the expected old tip, total reachable count, rewritten commit and merge
counts, GPG-signature removal count, and every approved old-message digest and
replacement text. It stays outside the repository.

The gate walks the old and new commit DAGs from their tips through corresponding
ordered parents. Trees, raw author and committer headers, topology and all
non-signature headers must match exactly. Every replacement message must match
the manifest and pass the normal attribution, exposure and Gitleaks checks.
Original `gpgsig` headers cannot remain valid after a commit or ancestor SHA
changes; when the approved plan accepts that consequence, rewritten commits
must contain no copied or replacement signature and the exact removal count is
recorded in the private receipt. Unchanged commit objects retain their original
signatures.

The lane rejects shallow history, stale remote-tracking state, fast-forwards,
multiple refs, other branches, no-op manifests and any unlisted message change.
Existing tag identities are immutable and cannot be updated through either
push lane; create a new tag through the release process instead. Review the
prepared graph explicitly before the push:

```sh
python3 tools/security_gate.py review-history-rewrite \
  --remote fork --old "$OLD_MAIN" --new "$NEW_MAIN" \
  --manifest /private/path/history-rewrite.json
```

For the single force-with-lease push, provide the same file through
`MARK_HISTORY_REWRITE_MANIFEST`. Temporarily suspend only the main ruleset,
restore and read it back immediately after the push, and never publish the
manifest or recovery ref.

## Desktop PR rebases after a main rewrite

A rewritten desktop pull-request branch is pushed separately from `main` and from every
other ref. The gate reads the live identities for both the target branch and
`main` from the actual push endpoint supplied by Git's pre-push hook, requires
the negotiated old branch tip to match the live target,
requires the local remote-tracking `main` to match live `main`, and proves that
the rebuilt head descends from that current `main`. It then scans every commit
unique to the rebuilt branch while binding both remote identities into the
candidate and private receipt. The endpoint itself is used only for the live
lookup and is not copied into candidate data, receipts or diagnostics.

Fetch immediately before rebuilding and use an exact `--force-with-lease` for
the old branch tip. A stale branch, stale `main`, multiple-ref push, mobile branch, tag, main
update, fast-forward or head not based on current remote `main` fails this lane.
The message-only manifest is never accepted for a non-main branch.

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
