# Real-app acceptance protocol (Stage 0, tier 3)

Status: manual, owner-run, never a CI gate.

This directory is the third evidence tier of `C-LARGE-DOC-STAGE-0` (spec R-5).
It exists because the two CI tiers are **not** the shipped application:

| Tier | What it proves | Where it runs | Label in evidence |
|---|---|---|---|
| 1 | derived-state costs in isolation | `npx vitest run tests/renderer/perf` | unit microbench |
| 2 | real input pipeline + scroll in a browser engine | bench driver (Chromium) / `--project=webkit-perf` (WebKit) | renderer/browser evidence |
| 3 | the **actual Tauri artifact on system WKWebView** | owner machine, manually | native-app evidence |

Playwright WebKit is *never* called native evidence. A capture that labels it
`native-wkwebview` is rejected by `verify-capture.mjs`.

## What the owner does

1. **Pin the artifact and the fixture.** From the checkout that produced the
   artifact:

   ```sh
   node src/renderer/bench/acceptance/fixture-identity.mjs \
     --fixture tests/e2e/fixtures/large-doc/size-1mb.md \
     --fixture-id F-SIZE-1MB
   ```

   This prints `bytes` and `sha256` of the exact file the app must open, plus
   the `BLOCK_FIXTURE` marker line. Copy them into the capture (below).

2. **Record the artifact identity.** `artifactCommit` is the commit the Tauri
   artifact was built from (`git rev-parse HEAD` at build time), and
   `artifactLabel` is a free-form build identifier (for example the bundle
   name) with no private path.

3. **Run the app and measure.** Open exactly that fixture in the built app on
   the macOS system WKWebView. Record the observations as `BLOCK_*` markers.
   Markers are content-free: numeric values, opaque fixture/tab IDs, and a
   status — **never** document text, selected text, private paths or hashes of
   private content.

   | Marker | Required keys | Meaning |
   |---|---|---|
   | `BLOCK_FIXTURE` | `id`, `bytes`, `sha256` | exact input identity |
   | `BLOCK_OPEN` | `first_content_ms`, `time_to_input_ms` | open path |
   | `BLOCK_TYPING` | `n`, `p50_ms`, `p95_ms`, `truth` | typing latency; `truth` must be `ok` (the edit changed the document and undo restored it) |
   | `BLOCK_SCROLL` | `frames`, `frame_p95_ms`, `jank_frames` | scroll frame distribution, not average FPS alone |
   | `BLOCK_CLOSE` | `ms` | close/teardown |
   | `BLOCK_DONE` | `status` | `ok` only when every required phase above was measured |

4. **Write the capture** as JSON next to the template below, under the ignored
   local directory `.mark-local/acceptance/` (never committed):

   ```sh
   cp src/renderer/bench/acceptance/capture-template.json \
      .mark-local/acceptance/$(date +%Y%m%d)-size-1mb.json
   ```

5. **Verify the capture** before handing it to review:

   ```sh
   node src/renderer/bench/acceptance/verify-capture.mjs \
     --capture .mark-local/acceptance/20261027-size-1mb.json
   ```

   The verifier fails on: a browser-tier or Playwright label masquerading as
   native evidence, a fixture hash/byte mismatch against the real file, a
   missing required marker, an unknown marker name, an unfilled template
   placeholder, a private absolute path, or a commit that does not exist in
   this repository.

6. **Review.** The owner reads the verified capture. Only then does tier 3
   count as evidence. It still does not authorize a release or train
   admission.

## Honesty rules

- Without an approved WAL, a hard crash may lose every edit since the last
  committed save (an untitled buffer in full), and the current in-place save
  can damage even the previous file. No capture may claim otherwise.
- A required phase that was not measured is recorded as missing and fails the
  gate; `not-supported` is acceptable only for an optional metric (for
  example retained-memory observation where the runtime exposes no API).
- Captures stay outside the repository. Only the sanitized numbers and the
  fixture/artifact identity may be quoted in committed evidence.

## Files

- `fixture-identity.mjs` — prints exact fixture identity + the `BLOCK_FIXTURE`
  line; refuses non-repository fixtures.
- `verify-capture.mjs` — validates a capture manifest against its fixture,
  markers, labels and commit; exits non-zero on any violation.
- `capture-template.json` — the manifest shape with placeholders. Unfilled
  placeholders are rejected.
