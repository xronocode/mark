// FILE: tests/renderer/muya/plantuml-browser-external-stub.test.js
// START_MODULE_CONTRACT
//   PURPOSE: Pin the mechanism behind complexity f-015 — with `zlib` bound to vite's browser-external stub semantics (a module whose property access throws: "Module ... has been externalized for browser compatibility"), muya's PlantUML encode throws before any request, exactly what the renderer bundle served before the zlib resolve alias. This is the mechanism pin; the behavioral parity pins for the fixed stage live in plantuml-zlib-shim.test.js.
//   SCOPE: muya/lib/parser/render/plantuml.js Diagram.parse under the stubbed `zlib` module.
//   DEPENDS: Vitest + jsdom; vi.mock of the `zlib` module id (the mock layer overrides the resolve alias, so the stub binds both pre- and post-fix).
//   LINKS: complexity f-015 (2026-11-25 audit); tests/renderer/muya/plantuml-zlib-shim.test.js; vite.config.js zlib alias.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   STUB_MESSAGE - the vite browser-external stub message shape the stub proxy throws.
// END_MODULE_MAP
//
// RED-FIRST NOTE (documented): a plain-import red-first run is NOT
// constructible in vitest — the runner resolves a bare `zlib` through its
// Node-backed module graph (a probe on the pre-fix tree returned the real
// builtin: `typeof zlib.deflateSync === 'function'`), so Diagram.parse
// worked under vitest while the browser bundle threw. The deterministic
// red runs are (a) the structural alias pins in plantuml-zlib-shim.test.js
// (no `zlib` entry in the vite/vitest alias maps before the fix) and
// (b) this file: the stub semantics vite serves the browser, which make
// Diagram.parse throw. After the fix this file stays meaningful — it pins
// the failure mode the alias removes.

import { describe, expect, it, vi } from 'vitest'

// vite's browser-external stub message shape; every property access
// throws (the exact module the renderer got for bare `zlib` before the
// alias).
const STUB_MESSAGE = (prop) =>
  `Module "zlib" has been externalized for browser compatibility (property "${String(prop)}").`

vi.mock('zlib', () => ({
  default: new Proxy(
    {},
    {
      get(_target, prop) {
        throw new Error(STUB_MESSAGE(prop))
      }
    }
  )
}))

describe('plantuml encode under vite browser-external stub semantics (complexity f-015)', () => {
  it('Diagram.parse throws on the stubbed zlib before any request', async () => {
    const Diagram = (await import('muya/lib/parser/render/plantuml')).default
    expect(() => Diagram.parse('@startuml\nAlice -> Bob: hi\n@enduml')).toThrowError(
      /externalized for browser compatibility/
    )
  })
})
