# Preliminary owner positions — C-LARGE-DOC-STAGE-0 (recorded 2026-10-29)

Owner instruction: "act on your recommendation" — recorded as PRELIMINARY
positions; each is re-confirmed against the final baseline tables in the
T-011 decision document before anything binds. The fifth decision
(absolute/relative budgets) intentionally waits for those tables per the
spec (never guessed).

1. Target document size: **1.7 MB / 9000 sections** — the accepted backlog
   reference shape; goal is first visible content in a few hundred
   milliseconds.
2. Wave order: **Wave A first** (progressive mount / opening path). Early
   evidence: on 1 MB, mount is 809 ms of ~890 total while parsing is 18 ms
   and all derived per-edit work is single-digit milliseconds.
3. Crash-durability contract: **no WAL, honest** — atomic old-or-new save;
   no unsaved-recovery guarantee is claimed; a WAL may be added later as a
   separately approved change.
4. Experimental access model: **visible Experimental settings section** —
   local, default-off, session-latched until a separately approved flip.
