# Stage 0 baselines — large documents (C-LARGE-DOC-STAGE-0, R-8/T-009)

Two artifacts, generated together by `capture-baseline.mjs`:

- `baseline.json` — machine-readable. One entry per fixture with the exact
  fixture bytes/sha256, the captured commit (`commit`) and the recorded
  pre-change base (`recordedBaseCommit`), per-engine numbers (open, typing,
  scroll), the responsiveness meter that produced them, the same-run
  observer-overhead control, and the heap observations.
- `baseline.md` — the human table over the same data, with cost breakdowns
  (parse proxy / mount / first paint) and the overhead table separated from
  the baseline numbers.

## What the numbers are — and are not

They are **observations from one owner machine**, captured through
`src/renderer/bench/run-bench.mjs`. They are not product budgets and not a
CI gate: absolute and relative budgets are owner decisions recorded only
after Stage 0 (spec R-9), and nothing here authorizes a release or a train
admission.

Honest labels carried in the data:

- `responsiveness.meter` says which API produced the number —
  `longtask-api` (Chromium) or `event-loop-lag-proxy` (WebKit). The two
  series are never merged.
- `memory.after_open` / `memory.after_edit` are `null` where the runtime
  exposes no heap API (WebKit); `—` in the table means *not available*,
  never zero.
- `overhead` is the same typing burst measured with the responsiveness
  observers on and off in one run. It is reported separately and never
  folded into the baseline numbers.
- `verdict` records whether the driver's required phases passed. A failed
  entry is kept in the artifact rather than dropped.

## Regenerate

```sh
node src/renderer/bench/baseline/capture-baseline.mjs
```

The capture is self-contained: it builds the renderer once if the bench bundle
is missing and starts/stops its own preview server (an already-running server
on :4173 is reused).

Fixture set and runs/engine are declared in `capture-baseline.mjs`
(`mixed-100k.md` ×3, `size-1mb.md` ×3, `size-1_7mb-9000sections.md` ×1).
The 10 MB shape stays an optional local diagnostic and is not captured here.

## Related evidence

The same fixtures feed the required renderer-CI phases
(`tests/e2e/perf/bench-phases-webkit.spec.ts` under `--project=webkit-perf`)
and the driver's Chromium tier. The real-app tier is owner-run and never
part of these artifacts — see `../../acceptance/README.md`.
