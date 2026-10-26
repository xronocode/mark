# Release procedure

Releases are tag-triggered through `.github/workflows/release.yml`; do not build
or publish them locally. The remote is `fork` (`xronocode/mark`), not `origin`.
Start this flow only after the separate release instruction and train admission
defined by the [release-train protocol](release-trains/README.md).

## 1. Preparation pull request

Preparation is squash-merged like every pull request; merge commits and rebase
are disabled. Set the version with:

```sh
npm version 2.X.Y --no-git-tag-version
npm run release:normalize -- --write
```

`package.json` is the single version authority. The first command also updates
both `package-lock.json` fields. Normalization propagates the version to
`src-tauri/tauri.conf.json`, the root `Cargo.toml` workspace package and the
root `Cargo.lock` Mark entry; advances the M-046 fixture in
`tests/renderer/release-preflight.test.js`; moves the current train to
Preparing; and retargets draft materials when necessary. Never edit these
surfaces by hand. `docs/release-trains/current.json` names the current train.

Validate locally:

```sh
npm run release:preflight -- --tag v2.X.Y
npm run release:normalize -- --require-clean
npx vitest run tests/renderer/release-*.test.js
```

The preflight must print `BLOCK_RELEASE_VERSION_CONSISTENT ... sources=6`,
normalization must report `files=0`, and the release tests must pass.

## 2. Release materials

Every user-facing surface must match the release before the tag. Reconcile the
frozen train, including FIX-* repairs, shipped change specs and the exact release
diff. Rank the material by the current product categories: UI polish, product
mechanics, content rendering, folder work, AI/agents and breadth.

- Add the version to `src/renderer/src/whatsNew/data.js` with no more than four
  items, locale keys in all ten `static/locales/*.json` files, an “Also” line
  and the exact release URL. Titles are at most 32 characters and texts at most
  90. Run `tests/renderer/whatsNew/content.test.js`.
- Update the README “What's new” section: keep the three most recent releases
  and replace anything older with one line pointing to CHANGELOG. Capture fresh
  screenshots with
  `README_SHOTS=1 npx playwright test tests/e2e/readme-shots.spec.ts --project=chromium`
  and commit them under `docs/assets/readme/` with their manifest evidence.
- Add a dated CHANGELOG entry using the same categories.
- Draft the English, user-facing release-note section for the post-publication
  step.
- Write and proofread all ten locales as native copy. Keep shortcuts and product
  names such as Mark, Paper, Ink, Docs, macOS, Mermaid and Guide untranslated.

## 3. Freeze and seal

Freeze and seal through ordinary squash pull requests. The freeze records the
`payloadSha` whose required checks are green and classifies every commit since
the previous release. The seal sets the train to Ready. Corrections after the
freeze are bookkeeping commits; every commit in that span may touch only
`docs/release-trains/*` or `docs/assets/readme/*.manifest.json`.

Never push a release tag manually. The tag ruleset admits only the release bot.

## 4. Promotion and publication

`release/promote` waits on the `release-authorize` Environment. The owner's
approval there is the release instruction, and the bot creates the annotated
tag on the seal. The seal must be on main but does not need to be its current
tip, so unrelated merges may continue.

The tag run builds the release, waits for the owner to approve the synchronous
`release` Environment gate (C-RELEASE-MANUAL-PUBLISH: publication is manual-only —
the first approval created the tag, this one publishes), then publishes,
proves that `releases/latest` advanced and opens the Homebrew cask pull request.
Monitor it with:

```sh
gh run list -R xronocode/mark
```

Use the [recovery matrix](release-trains/README.md#recovery-matrix) for failures.
After publication, record `Released` in the train and open the next train by
updating `current.json`.

## 5. Release notes

The workflow publishes only the automated verification block. Once the release
is live, prepend the drafted English “What's new” section and keep the automated
block below a `---` separator:

```sh
gh release view v2.X.Y-beta -R xronocode/mark --json body --jq '.body' > /tmp/rel-body.md
# prepend the user-facing section, then:
gh release edit v2.X.Y-beta -R xronocode/mark --notes-file /tmp/rel-combined.md
```

Derive the content from the frozen train, shipped change specs and exact release
diff (`git log vPREV..vNEW --oneline` plus the relevant spec names, summaries and
decisions).

Beta tags are published as normal releases (`--prerelease=false` on the
draft-to-published edit, asserted by tests), so `/releases/latest` advances for
the in-app updater. A release is live
only when `https://github.com/xronocode/mark/releases/latest/download/latest.json`
serves the new version.
