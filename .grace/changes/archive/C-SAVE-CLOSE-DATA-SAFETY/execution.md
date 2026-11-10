# Save and close data safety

Applied implementation source: `fa25b309fd85450aa907a2fcd908de6d33a0bf6b` (PR #214). Destination selection precedes fresh owned snapshot capture; correlated writes and the final group barrier preserve newer input and stop destructive transitions on cancellation, failure or stale ownership. Approved requirements, assertions, scopes and tasks are unchanged; only the completed bundle's lifecycle status changed.

Fresh target and final assertions with command execution passed before archiving: renderer coverage 5615 passed, 0 failed, 2 existing skipped and 3 existing todo; IPC typecheck and renderer build passed. Each lifecycle check reported 0 errors and 5 known warnings (deferred renderer-scope overlap and four Python-analysis heuristics). The unchanged implementation's backend, browser, packaging and hosted evidence remains attributed to the source commit; latest applicable CI/test/dryrun and CodeQL checks passed.

Owner QA on 2026-11-10 accepted Save All on the source-bound isolated app (binary SHA-256 `6f2c96e7dd236cc56d6773e1dc93c968a1ad39b5a1011202f062a05a33d6d7a0`). Additional owner observations verified Save As cancellation for a dirty untitled document, group cancellation for two untitled documents, Cancel after the native window-close control, and Save & Quit with both texts present on disk and process exit. The named-plus-untitled cancellation case retains earlier native implementation evidence rather than an additional owner verdict.

Real macOS and Windows conversion IME remain unverified. Synthetic browser composition tests are separate evidence. A reported missing picker for a nonempty untitled document was not reproduced by subsequent native single/group checks; its cause remains unknown and is not claimed repaired. Initial Save As directory selection is a separate unimplemented UX proposal.

This closes the scoped implementation, not native acceptance for unverified scenarios or release readiness. Format/encoding/BOM/EOL, general Rename/Move, physical write ordering and atomic/crash recovery remain separate. No release version, train dispatch, tag or publication is authorized by this record.
