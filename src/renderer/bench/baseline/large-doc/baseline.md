# Stage 0 baseline — large documents

Generated: 2026-11-02T00:20:07.377Z  
Commit: 6f770729e78e3ff22562fb847916c657ca68d0da  
Driver: muya bench driver on http://localhost:4173/bench/  
Runtime: Node v22.19.0, Playwright 1.59.1, darwin-arm64, viewport 1024x768

Numbers are machine-specific observations captured on this host, not product
budgets. Hard budgets are owner-approved only after Stage 0 (spec R-9).
Observer overhead is a separate same-run control and is never folded into the
tables below. `—` means the runtime does not expose that metric (for example
`performance.memory` does not exist in WebKit) — never zero.

C-LARGE-DOC-WAVE-A T-005: every fixture is captured on BOTH mount paths as
paired entries (`path: legacy | progressive`). The legacy tables below cover
the default path; each progressive entry adds its own tail-mount table
(sync region / first paint / time-to-input / tail completion — separate
phases, never summed, per Wave A R-6).

## mixed-100k.md

107602 bytes · sha256 `4180ed7769c4a87c82819bc7ca8e28026966695b9442e82039df5e26a4ed353f` · runs/engine: 3

### legacy path

| engine | open p50 (ms) | open p95 (ms) | parse/mount/first-paint (ms) | typing p50 (ms) | typing p95 (ms) | scroll fps | scroll frame p95 (ms) | jank frames > 50 ms | heap after open (MB) |
|---|---|---|---|---|---|---|---|---|---|
| chromium | 91.2 | 116.1 | 7.8 / 93.6 / 22.5 | 33.3 | 33.5 | 60 | 17.3 | 0 | 17.4 |
| webkit | 98 | 114 | 3 / 82 / 32 | 33 | 34 | 60 | 17.7 | 0 | not-supported |

| engine | responsiveness meter | instrumented p50 (ms) | control p50 (ms) | overhead ratio |
|---|---|---|---|---|
| chromium | longtask-api | 33.3 | 33.3 | 1× |
| webkit | event-loop-lag-proxy | 33 | 33 | 1× |

### progressive path (Wave A)

| engine | open p50 (ms) | sync_region p50 (ms) | first_paint p50 (ms) | tti p50 (ms) | tail_done p50 (ms) | served | canon_ok | dom_ok | typing_during_tail |
|---|---|---|---|---|---|---|---|---|---|
| chromium | 36.8 | 22.6 | 47.6 | 26 | 118 | progressive | true | true | true |
| webkit | 66 | 20 | 77 | 24 | 77 | progressive | true | true | true |

| engine | typing p50 (ms) | typing p95 (ms) | scroll fps | scroll frame p95 (ms) |
|---|---|---|---|---|
| chromium | 33.3 | 33.5 | 60 | 17.3 |
| webkit | 33 | 34 | 60 | 17.3 |

## size-1mb.md

1058416 bytes · sha256 `5f66dea2d1386f7e43f163fcb5d47dc725178bad200074b596b8a68d5b043904` · runs/engine: 3

### legacy path

| engine | open p50 (ms) | open p95 (ms) | parse/mount/first-paint (ms) | typing p50 (ms) | typing p95 (ms) | scroll fps | scroll frame p95 (ms) | jank frames > 50 ms | heap after open (MB) |
|---|---|---|---|---|---|---|---|---|---|
| chromium | 563.7 | 574.9 | 11.7 / 505.7 / 69.2 | 33.3 | 34.2 | 60 | 17.6 | 0 | 73.1 |
| webkit | 471 | 478 | 12 / 428 / 50 | 33 | 34 | 60.1 | 18 | 0 | not-supported |

| engine | responsiveness meter | instrumented p50 (ms) | control p50 (ms) | overhead ratio |
|---|---|---|---|---|
| chromium | longtask-api | 33.3 | 33.3 | 1× |
| webkit | event-loop-lag-proxy | 33 | 33 | 1× |

### progressive path (Wave A)

| engine | open p50 (ms) | sync_region p50 (ms) | first_paint p50 (ms) | tti p50 (ms) | tail_done p50 (ms) | served | canon_ok | dom_ok | typing_during_tail |
|---|---|---|---|---|---|---|---|---|---|
| chromium | 75.6 | 25.4 | 53.5 | 36.4 | 1065 | progressive | true | true | true |
| webkit | 92 | 26 | 105 | 39 | 820 | progressive | true | true | true |

| engine | typing p50 (ms) | typing p95 (ms) | scroll fps | scroll frame p95 (ms) |
|---|---|---|---|---|
| chromium | 33.4 | 45.7 | 60 | 17.6 |
| webkit | 33 | 59 | 60.1 | 17.7 |

## size-1_7mb-9000sections.md

1801827 bytes · sha256 `6416a3ddeee16a4fde20e16f2ad5c5b5583060de00dd174febfe5d944cf72c8b` · runs/engine: 1

### legacy path

| engine | open p50 (ms) | open p95 (ms) | parse/mount/first-paint (ms) | typing p50 (ms) | typing p95 (ms) | scroll fps | scroll frame p95 (ms) | jank frames > 50 ms | heap after open (MB) |
|---|---|---|---|---|---|---|---|---|---|
| chromium | 1499.6 | 1499.6 | 23.1 / 1158.1 / 341.5 | 138 | 166.7 | 55.9 | 33.3 | 0 | 98.2 |
| webkit | 1458 | 1458 | 25 / 1263 / 195 | 73 | 102 | 46 | 46 | 1 | not-supported |

| engine | responsiveness meter | instrumented p50 (ms) | control p50 (ms) | overhead ratio |
|---|---|---|---|---|
| chromium | longtask-api | 125.1 | 104.4 | 1.2× |
| webkit | event-loop-lag-proxy | 70 | 88 | 0.8× |

### progressive path (Wave A)

| engine | open p50 (ms) | sync_region p50 (ms) | first_paint p50 (ms) | tti p50 (ms) | tail_done p50 (ms) | served | canon_ok | dom_ok | typing_during_tail |
|---|---|---|---|---|---|---|---|---|---|
| chromium | 205.5 | 83.1 | 236.6 | 145.8 | 22380 | progressive | true | true | true |
| webkit | 356 | 55 | 250 | 121 | 12643 | progressive | true | true | true |

| engine | typing p50 (ms) | typing p95 (ms) | scroll fps | scroll frame p95 (ms) |
|---|---|---|---|---|
| chromium | 80.4 | 120.5 | 45.7 | 50 |
| webkit | 224 | 282 | 40.1 | 53 |

## How to regenerate

```sh
node src/renderer/bench/baseline/capture-baseline.mjs
```

The capture is self-contained: it builds the renderer once if the bench bundle is missing and starts/stops its own preview server (an already-running server on :4173 is reused). Both mount paths (legacy + progressive) are captured per fixture as paired entries with a `path` field.

