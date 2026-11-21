# Bookmark persistence evidence

A complete private sibling snapshot is written and synced before atomic replacement. In-memory grants and cap eviction commit only after replacement succeeds. Typed failures keep current work available and queue a main-window warning.

1. Backend: 78 selected tests passed before the warning ownership correction. The exact corrected Rust candidate compiled and its 10 affected bookmark tests passed; the recent, compatibility and validator implementations were unchanged by that correction.
2. Renderer: 45 passed, 0 failed; three pre-existing todos remain. The Settings warning-consumption regression failed before correction and passed afterward. The renderer build passed.
3. Real macOS CF fault matrix: six cases across eight owned processes proved that a real child-only partial write preserves the previous two grants on disk and in memory, a fresh process reloads them, and recovery adds a third. The unchanged transaction-block hash binds that proof across the later main-window warning ownership correction.
4. An isolated packaged macOS app with a task-only directory obstructing its bookmark-store target opened the document and showed one sticky permission-not-saved card with a repeated-failure count. The original source and directory sentinel remained unchanged, and no temporary files remained. Removing only that obstruction allowed a second native document open to persist a valid version-1 store.
5. Settings and other secondary windows cannot consume the global pending warning. The backend uses the injected invoking window label; only the main renderer registers and drains the queue. Notification transport does not include paths or bookmark data.
6. Selected final assertions and command evidence passed with zero errors, four existing heuristic warnings and the declared durable-scope overlap with the untouched C-50 bundle. Independent review has zero remaining actionable source findings; its warning-consumption finding was corrected.
7. All task-owned app and test processes stopped, the application Quit normally, and app/executable/renderer copies were deleted. Source hashes, artifact identities, digests, native call records, recipes, logs, synthetic profiles and outputs remain separate evidence. No pixel-rendering or owner verdict is inferred.

Real App Store sandbox reopen and supported-platform hosted checks remain open acceptance gates. Unsandboxed CF/native-app evidence does not establish sandbox acceptance. No hardware/power-loss durability, multiprocess protocol, signing change or release is claimed.

Technical specification, plan and source apply/archive use the explicit autonomous execution delegation recorded for 2026-11-15. Broader acceptance remains separate from integration.
