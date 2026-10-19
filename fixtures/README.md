# Sanitized legacy preference examples

These six JSON files preserve example preference, data-center and window-state
shapes from two retired Electron generations. Home paths use the synthetic
identity `/Users/<fixture>`. Other preference values remain representative;
these files are not complete captured user profiles.

The original archives, browser Local Storage records, property lists and runtime
logs were preserved privately and removed from the public tree. The legacy
import pipeline was retired in C-13. Current application startup and tests do
not require the original captured profiles.

`fixture-pin.lock` lists the SHA-256 digest and byte size of every retained JSON
example. `tests/renderer/publication-privacy.test.js` checks that the corpus is
complete, paths are synthetic and the manifest matches. Update the manifest
deliberately when changing these examples. Keep new examples synthetic from the
start; do not copy a live application profile into this directory.
