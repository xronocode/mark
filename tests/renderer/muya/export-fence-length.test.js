// FILE: tests/renderer/muya/export-fence-length.test.js
// VERSION: 1.1.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin that a fenced code block whose content contains backtick runs re-exports inside a fence longer than any inner run (C-51 T-009 BLOCK_FENCE_LENGTH_KEEP).
//   SCOPE: Real Muya/Guide fence-export round trips and completion of their lazy preview imports before test-environment teardown.
//   DEPENDS: src/muya/lib (Muya), src/renderer/src/util/guideDoc.js (guide source).
//   LINKS: .grace/changes/active/C-51 T-009; .grace/changes/archive/C-CI-FENCE-TEARDOWN; .grace/graph/runtime.xml M-012; .grace/verification/runtime.xml V-M-011 scenario-59 and V-M-012 scenario-muya-fence-import-teardown.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   mdToMarkdown - exports through a real throwaway Muya instance, destroys it and removes its container; suite teardown drains the remaining preview imports.
//   FENCE_BLOCK - minimal document whose text fence names a ``` fence inside.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.1.0 - C-CI-FENCE-TEARDOWN: await lazy preview imports instead of guessing a 50ms teardown deadline; restore console spies after the imports settle.
//   PREV: v1.0.0 - C-51 T-009: the guide's agent prompt names ```mermaid fences, so the exported fence must be longer than the inner runs or the re-imported markdown closes the block early.
// END_CHANGE_SUMMARY

import { beforeAll, afterAll, vi } from 'vitest'
import { describe, it, expect } from 'vitest'
import Muya from 'muya/lib'
import { loadGuideMarkdown } from '@/util/guideDoc'

const mdToMarkdown = (markdown) => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const muya = new Muya(container, { markdown })
  try {
    return muya.getMarkdown()
  } finally {
    // Tear the instance down so no render timer logs after the test ends.
    try { if (typeof muya.destroy === 'function') muya.destroy() } catch (e) { /* partial UI in jsdom */ }
    container.remove()
  }
}

const FENCE_BLOCK = '````text\n- Diagrams — ```mermaid fences\nplain text\n````\n'

describe('exportMarkdown fence length (C-51 T-009)', () => {
  // Keep real preview diagnostics quiet during these Markdown assertions.
  // Restore the spies only after all lazy imports and their chained imports
  // finish, so neither module evaluation nor its logs outlive the suite.
  beforeAll(() => {
    for (const m of ['log', 'debug', 'info', 'warn', 'error']) vi.spyOn(console, m).mockImplementation(() => {})
  })
  afterAll(async () => {
    // The Guide starts real diagram imports even though its Muya instance
    // is destroyed synchronously. Elapsed time cannot prove they finished.
    await vi.dynamicImportSettled()
    vi.restoreAllMocks()
  })

  it('a block naming ``` fences re-exports inside a longer outer fence', () => {
    const out = mdToMarkdown(FENCE_BLOCK)
    expect(out).toContain('````text\n- Diagrams — ```mermaid fences\nplain text\n````\n')
    // exactly one outer fence (open + close): the inner ``` run closed nothing.
    expect((out.match(/````/g) || []).length).toBe(2)
    // re-opening the exported markdown is byte-stable.
    expect(mdToMarkdown(out)).toBe(out)
  })

  it('blocks without backtick runs keep the classic 3-backtick fence', () => {
    const out = mdToMarkdown('```js\nconsole.log(1)\n```\n')
    expect(out).toBe('```js\nconsole.log(1)\n```\n')
    expect(out).not.toContain('````')
  })

  it('the guide agent-prompt block survives a full open/save round trip', async () => {
    const guide = await loadGuideMarkdown('en', 'darwin')
    const out = mdToMarkdown(guide)
    // The prompt fence opens with 4 backticks and closes with 4 — exactly once.
    expect(out).toContain('````text\n')
    expect((out.match(/````/g) || []).length).toBe(2)
    // The whole multi-line prompt stays inside the one block: first line, the
    // ```mermaid mention and the last line all survive the save.
    expect(out).toContain('open -a Mark <file>.md')
    expect(out).toContain('```mermaid fences;')
    expect(out).toContain('the user\'s edits are your next instruction')
  })
})
