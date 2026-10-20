// FILE: tests/renderer/release-notes.test.js
// VERSION: 1.2.0
// START_MODULE_CONTRACT
//   PURPOSE: Prove the reviewed English release-note draft is selected by exact tag and the automated verification block remains byte-stable below one separator.
//   SCOPE: Pure extraction/composition regressions; no GitHub API calls or publication.
//   DEPENDS: Vitest; tools/release-notes.mjs; docs/release-notes-en-drafts.md.
//   LINKS: .grace/verification/features.xml V-M-046.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   drafts - Checked-in English release-note draft ledger.
//   windowsDrafts - The same ledger with one canonical CRLF sequence per line break.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-10-20 v1.2.0: build the CRLF fixture from normalized LF so the regression itself is platform-independent.
//   - 2026-10-20 v1.1.0: cover exact-tag extraction from Windows CRLF checkouts.
//   - 2026-10-20 v1.0.0: pin exact-tag note extraction and automated-block preservation for 2.6.0.
// END_CHANGE_SUMMARY

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  composeReleaseBody,
  extractReleaseNotes
} from '../../tools/release-notes.mjs'

const drafts = readFileSync(resolve('docs/release-notes-en-drafts.md'), 'utf8')
const windowsDrafts = drafts.replace(/\r\n?/g, '\n').replaceAll('\n', '\r\n')

// START_BLOCK_RELEASE_NOTES_TESTS
describe('release notes', () => {
  it('extracts the reviewed 2.6.0 human section only', () => {
    const notes = extractReleaseNotes(drafts, 'v2.6.0')
    expect(notes).toContain("## What's new")
    expect(notes).toContain('### Tables')
    expect(notes).not.toContain('```markdown')
    expect(notes).not.toContain('## v2.5.2')
  })

  it('extracts the same reviewed section from a Windows CRLF checkout', () => {
    expect(extractReleaseNotes(windowsDrafts, 'v2.6.0')).toBe(extractReleaseNotes(drafts, 'v2.6.0'))
  })

  it('rejects an absent or malformed tag independently', () => {
    expect(() => extractReleaseNotes(drafts, '2.6.0')).toThrow(
      expect.objectContaining({ code: 'MT_RELEASE_NOTES_TAG_INVALID' })
    )
    expect(() => extractReleaseNotes(drafts, 'v9.9.9')).toThrow(
      expect.objectContaining({ code: 'MT_RELEASE_NOTES_MISSING' })
    )
  })

  it('preserves the automated verification bytes below one separator', () => {
    const human = extractReleaseNotes(drafts, 'v2.6.0')
    const automated = '---\nattestation: abc\ncosign: def\n'
    const combined = composeReleaseBody(human, automated)
    expect(combined.match(/^---$/gm)).toHaveLength(1)
    expect(combined.endsWith('attestation: abc\ncosign: def\n')).toBe(true)
    expect(combined.indexOf("## What's new")).toBeLessThan(combined.indexOf('attestation: abc'))
  })

  it('rejects empty generated evidence instead of publishing human notes alone', () => {
    expect(() => composeReleaseBody("## What's new\n- item", '')).toThrow(
      expect.objectContaining({ code: 'MT_RELEASE_NOTES_INVALID' })
    )
  })
})
// END_BLOCK_RELEASE_NOTES_TESTS
