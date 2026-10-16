// FILE: tests/renderer/muya/vega-csp-renderer.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin that the vega-lite renderer loader embeds with a CSP-safe expression evaluator (ast + vega-interpreter) — the packaged app's CSP has no 'unsafe-eval', so vega's default codegen fails there.
//   SCOPE: src/muya/lib/renderers/index.js loadRenderer('vega-lite') with vega-embed mocked; a real vega-interpreter.
//   DEPENDS: src/muya/lib/renderers/index.js, vega-interpreter, Vitest.
//   LINKS: C-51 T-008; tests/e2e/rich-markdown-coverage.spec.ts (end-to-end under the real CSP); .grace/verification/runtime.xml V-M-012.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   embedSpy - vega-embed double recording (el, spec, opts).
// END_MODULE_MAP

import { describe, it, expect, vi } from 'vitest'
import { expressionInterpreter } from 'vega-interpreter'

const embedSpy = vi.fn(async () => ({ view: {} }))
vi.mock('vega-embed', () => ({ default: embedSpy }))

describe('loadRenderer vega-lite (C-51 T-008)', () => {
  it('embeds with ast + the vega interpreter, caller opts merged on top', async () => {
    const { default: loadRenderer } = await import('../../../src/muya/lib/renderers/index.js')
    const render = await loadRenderer('vega-lite')
    const spec = { mark: 'bar' }
    await render('#k', spec, { renderer: 'svg', actions: false })
    expect(embedSpy).toHaveBeenCalledTimes(1)
    const [el, passedSpec, opts] = embedSpy.mock.calls[0]
    expect(el).toBe('#k')
    expect(passedSpec).toBe(spec)
    expect(opts).toMatchObject({ ast: true, renderer: 'svg', actions: false })
    expect(opts.expr).toBe(expressionInterpreter)
  })

  it('is cached: the same wrapper comes back', async () => {
    const { default: loadRenderer } = await import('../../../src/muya/lib/renderers/index.js')
    expect(await loadRenderer('vega-lite')).toBe(await loadRenderer('vega-lite'))
  })
})
