# Stage 0 baseline — large documents

Generated: 2026-10-26T22:55:20.558Z  
Commit: 29aae40659ad66f1c4628060fb1bf6bd36dc5688  
Driver: muya bench driver on http://localhost:4173/bench/  
Runtime: Node v22.19.0, Playwright 1.59.1, darwin-arm64, viewport 1024x768

Numbers are machine-specific observations captured on this host, not product
budgets. Hard budgets are owner-approved only after Stage 0 (spec R-9).
Observer overhead is a separate same-run control and is never folded into the
tables below. `—` means the runtime does not expose that metric (for example
`performance.memory` does not exist in WebKit) — never zero.

## mixed-100k.md

107602 bytes · sha256 `4180ed7769c4a87c82819bc7ca8e28026966695b9442e82039df5e26a4ed353f` · runs/engine: 3

| engine | open p50 (ms) | open p95 (ms) | parse/mount/first-paint (ms) | typing p50 (ms) | typing p95 (ms) | scroll fps | scroll frame p95 (ms) | jank frames > 50 ms | heap after open (MB) |
|---|---|---|---|---|---|---|---|---|---|
| chromium | 140.1 | 151.4 | 11.2 / 128.4 / 23 | 33.3 | 33.9 | 60 | 17.6 | 0 | 13.6 |
| webkit | 191 | 233 | 5 / 163 / 70 | 33 | 34 | 60 | 17.3 | 0 | not-supported |

| engine | responsiveness meter | instrumented p50 (ms) | control p50 (ms) | overhead ratio |
|---|---|---|---|---|
| chromium | longtask-api | 33.3 | 33.3 | 1× |
| webkit | event-loop-lag-proxy | 33 | 33 | 1× |

## size-1mb.md

1058416 bytes · sha256 `5f66dea2d1386f7e43f163fcb5d47dc725178bad200074b596b8a68d5b043904` · runs/engine: 3

| engine | open p50 (ms) | open p95 (ms) | parse/mount/first-paint (ms) | typing p50 (ms) | typing p95 (ms) | scroll fps | scroll frame p95 (ms) | jank frames > 50 ms | heap after open (MB) |
|---|---|---|---|---|---|---|---|---|---|
| chromium | 813.9 | 931.5 | 19.9 / 845.9 / 85.6 | 33.3 | 34.4 | 59.9 | 17.4 | 0 | 51 |
| webkit | 723 | 1316 | 19 / 640 / 60 | 33 | 35 | 60.1 | 18 | 0 | not-supported |

| engine | responsiveness meter | instrumented p50 (ms) | control p50 (ms) | overhead ratio |
|---|---|---|---|---|
| chromium | longtask-api | 33.3 | 33.6 | 0.99× |
| webkit | event-loop-lag-proxy | 33 | 33 | 1× |

## size-1_7mb-9000sections.md

1801827 bytes · sha256 `6416a3ddeee16a4fde20e16f2ad5c5b5583060de00dd174febfe5d944cf72c8b` · runs/engine: 1

| engine | open p50 (ms) | open p95 (ms) | parse/mount/first-paint (ms) | typing p50 (ms) | typing p95 (ms) | scroll fps | scroll frame p95 (ms) | jank frames > 50 ms | heap after open (MB) |
|---|---|---|---|---|---|---|---|---|---|
| chromium | 1812 | 1812 | 30.1 / 1477.8 / 334.2 | 101.6 | 148.2 | 59.9 | 17.7 | 0 | 98.2 |
| webkit | 2389 | 2389 | 51 / 2180 / 209 | 87 | 116 | 50.2 | 37 | 1 | not-supported |

| engine | responsiveness meter | instrumented p50 (ms) | control p50 (ms) | overhead ratio |
|---|---|---|---|---|
| chromium | longtask-api | 104.4 | 102.6 | 1.02× |
| webkit | event-loop-lag-proxy | 78 | 77 | 1.01× |

## How to regenerate

```sh
node src/renderer/bench/baseline/capture-baseline.mjs
```

The capture is self-contained: it builds the renderer once if the bench bundle is missing and starts/stops its own preview server (an already-running server on :4173 is reused).

