// FILE: tests/renderer/util/document-format.test.js
// START_MODULE_CONTRACT
//   PURPOSE: Pin immutable format capture and every visible codec disposition.
//   SCOPE: Pure format/catalog invariants; no native-byte or system-IME claim.
//   DEPENDS: documentFormat, common encoding/catalog, Vitest.
//   LINKS: V-M-011, V-M-014; C-METADATA-SAVE-SAFETY T-001.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   tab - complete baseline tab byte-policy fixture.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   LAST_CHANGE: 2026-11-11: immutable complete-format and codec disposition tests.
// END_CHANGE_SUMMARY
import { describe, it, expect } from 'vitest'
import { captureDocumentFormat, sameDocumentFormat, recomputeDocumentSaved, applyDocumentFormat } from '@/util/documentFormat'
import catalog from 'common/fileFormatCatalog.json'
import { ENCODING_NAME_MAP } from 'common/encoding'

const tab = () => ({ encoding: { encoding: 'utf8', isBom: false }, lineEnding: 'lf', trimTrailingNewline: 3 })
describe('immutable document format and explicit codec catalog', () => {
  it('captures a defensive complete format without changing the document', () => {
    const source = tab(); const before = structuredClone(source)
    const format = captureDocumentFormat(source)
    expect(format).toEqual({ encoding: 'utf8', isBom: false, lineEnding: 'lf', finalNewline: 3 })
    expect(Object.isFrozen(format)).toBe(true)
    expect(source).toEqual(before)
    source.encoding.isBom = true
    expect(format.isBom).toBe(false)
    expect(before.encoding.isBom).toBe(false)
  })
  it('compares every owned policy and accepts equivalent defensive copies', () => {
    const a = captureDocumentFormat(tab())
    expect(sameDocumentFormat(a, { ...a })).toBe(true)
    for (const patch of [{ encoding: 'utf16le' }, { isBom: true }, { lineEnding: 'crlf' }, { finalNewline: 0 }]) {
      expect(sameDocumentFormat(a, { ...a, ...patch })).toBe(false)
    }
    expect(sameDocumentFormat(a, null)).toBe(false)
  })
  it('retains mixed source as an explicit policy requiring a later choice', () => {
    expect(captureDocumentFormat({ ...tab(), isMixedLineEndings: true }).lineEnding).toBe('mixed')
  })
  it.each([
    { encoding: { encoding: 'unknown', isBom: false } },
    { encoding: { encoding: 'utf32le', isBom: false } },
    { encoding: { encoding: 'cp1251', isBom: true } },
    { encoding: { encoding: 'utf8', isBom: 'false' } },
    { lineEnding: 'default' }, { trimTrailingNewline: 2 }
  ])('refuses invalid or unavailable formats without a fallback: %j', patch => {
    const source = { ...tab(), ...patch }; const before = structuredClone(source)
    expect(() => captureDocumentFormat(source)).toThrow(/MT_ENC_/)
    expect(source).toEqual(before)
  })
  it('accounts for all 36 visible IDs with exactly 32 supported codecs', () => {
    expect(catalog.map(c => c.id).sort()).toEqual(Object.keys(ENCODING_NAME_MAP).sort())
    expect(new Set(catalog.map(c => c.id)).size).toBe(36)
    expect(catalog.filter(c => c.supported)).toHaveLength(32)
    expect(catalog.filter(c => !c.supported).map(c => c.id).sort()).toEqual(['big5hkscs', 'gb2312', 'utf32be', 'utf32le'])
    expect(catalog.filter(c => !c.supported).every(c => c.unavailableReason)).toBe(true)
  })
})

describe('text and format saved checkpoint reconciliation', () => {
  const checkpoint = () => ({ ...tab(), markdown: 'saved? \n', savedMarkdown: 'saved? \n', savedFormat: captureDocumentFormat(tab()), requiresExplicitSave: false, contentRevision: 4, isSaved: true, history: { stack: [] }, cursor: { line: 1 } })
  it('changes only policy/revision and keeps dirty text, selection and history intact', () => {
    const source = checkpoint(); source.markdown += 'new'; source.isSaved = false
    const markdown = source.markdown; const history = source.history; const cursor = source.cursor
    expect(applyDocumentFormat(source, { lineEnding: 'crlf' })).toBe(true)
    expect(source.contentRevision).toBe(5); expect(source.isSaved).toBe(false)
    expect(source.markdown).toBe(markdown); expect(source.history).toBe(history); expect(source.cursor).toBe(cursor)
    expect(applyDocumentFormat(source, { lineEnding: 'crlf' })).toBe(false)
    expect(source.contentRevision).toBe(5); expect(source.isSaved).toBe(false)
  })
  it('text undo cannot clear pending format; selecting the actual saved policy can', () => {
    const source = checkpoint(); applyDocumentFormat(source, { isBom: true })
    source.markdown = 'edited'; expect(recomputeDocumentSaved(source)).toBe(false)
    source.markdown = source.savedMarkdown; expect(recomputeDocumentSaved(source)).toBe(false)
    applyDocumentFormat(source, { isBom: false }); expect(source.isSaved).toBe(true)
  })
  it('retains an explicit retry obligation across text and format reversions', () => {
    const source = checkpoint(); source.requiresExplicitSave = true
    applyDocumentFormat(source, { finalNewline: 0 }); applyDocumentFormat(source, { finalNewline: 3 })
    expect(recomputeDocumentSaved(source)).toBe(false)
    expect(source.requiresExplicitSave).toBe(true)
  })
  it('never establishes a checkpoint for an incomplete or invalid tab', () => {
    const source = { ...tab(), markdown: 'saved', isSaved: true }
    expect(recomputeDocumentSaved(source)).toBe(false)
    expect(source.isSaved).toBe(false)
  })
  it('refuses an invalid patch without changing any state', () => {
    const source = checkpoint(); const before = structuredClone(source)
    expect(() => applyDocumentFormat(source, { encoding: 'gb2312' })).toThrow('MT_ENC_UNSUPPORTED')
    expect(source).toEqual(before)
  })
  it('an explicit supported EOL choice clears mixed policy without rewriting text', () => {
    const source = checkpoint(); source.markdown = 'A\r\nB\n'; source.lineEnding = 'mixed'; source.isMixedLineEndings = true
    expect(applyDocumentFormat(source, { lineEnding: 'lf' })).toBe(true)
    expect(captureDocumentFormat(source).lineEnding).toBe('lf')
    expect(source.markdown).toBe('A\r\nB\n'); expect(source.isSaved).toBe(false)
  })
})
