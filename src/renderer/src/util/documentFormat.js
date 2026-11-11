// FILE: src/renderer/src/util/documentFormat.js
// START_MODULE_CONTRACT
//   PURPOSE: Capture and compare the complete immutable document byte policy.
//   SCOPE: Exact supported UI codec, BOM, EOL and final-newline validation.
//   DEPENDS: common/encoding capability catalog.
//   LINKS: M-011, M-014; C-METADATA-SAVE-SAFETY T-001/T-002.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   captureDocumentFormat - defensive immutable policy from tab fields or a wire value.
//   sameDocumentFormat - compare complete valid policies, refusing incomplete values.
//   recomputeDocumentSaved - reconcile text/format checkpoints and explicit retry.
//   captureRestoredFormat - validate an untrusted restored policy and dirty intent.
//   captureFormatChoice - snapshot selected format intent without text or disk proof.
//   captureSessionFormats - validate and scope named session records.
//   applyDocumentFormat - mutate only effective byte policy and one revision.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   LAST_CHANGE: 2026-11-11: one validated immutable file-format value.
// END_CHANGE_SUMMARY
import { getEncodingCapability } from 'common/encoding'

export const captureDocumentFormat = tab => {
  const legacyEncoding = tab?.encoding && typeof tab.encoding === 'object'
  const encoding = legacyEncoding ? tab.encoding.encoding : tab?.encoding
  const isBom = legacyEncoding ? tab.encoding.isBom : tab?.isBom
  const lineEnding = tab?.isMixedLineEndings ? 'mixed' : tab?.lineEnding
  const finalNewline = tab?.finalNewline ?? tab?.trimTrailingNewline
  const capability = getEncodingCapability(encoding)
  if (!capability) throw Error('MT_ENC_UNKNOWN')
  if (!capability.supported) throw Error('MT_ENC_UNSUPPORTED')
  if (typeof isBom !== 'boolean' || (isBom && !['utf8', 'utf16le', 'utf16be'].includes(encoding)) ||
      !['lf', 'crlf', 'mixed'].includes(lineEnding) || ![0, 1, 3].includes(finalNewline)) {
    throw Error('MT_ENC_INVALID_POLICY')
  }
  return Object.freeze({ encoding, isBom, lineEnding, finalNewline })
}

export const sameDocumentFormat = (a, b) => {
  try {
    const left = captureDocumentFormat(a); const right = captureDocumentFormat(b)
    return ['encoding', 'isBom', 'lineEnding', 'finalNewline'].every(key => left[key] === right[key])
  } catch { return false }
}

export const recomputeDocumentSaved = tab => {
  let matches = false
  try {
    matches = typeof tab.savedMarkdown === 'string' && tab.markdown === tab.savedMarkdown &&
      sameDocumentFormat(captureDocumentFormat(tab), tab.savedFormat)
  } catch { /* Invalid format cannot establish a saved checkpoint. */ }
  tab.isSaved = !tab.requiresExplicitSave && matches
  return tab.isSaved
}

// The caller inspects composition before invoking a pure policy mutation.
export const applyDocumentFormat = (tab, patch) => {
  const before = captureDocumentFormat(tab)
  const next = captureDocumentFormat({ ...before, ...patch })
  if (sameDocumentFormat(before, next)) return false
  tab.encoding = { encoding: next.encoding, isBom: next.isBom }
  tab.lineEnding = next.lineEnding
  tab.isMixedLineEndings = next.lineEnding === 'mixed'
  tab.trimTrailingNewline = next.finalNewline
  tab.adjustLineEndingOnSave = next.lineEnding === 'crlf'
  tab.contentRevision = (tab.contentRevision || 0) + 1
  recomputeDocumentSaved(tab)
  return true
}

// A restorable choice is selected policy plus intent, never prior disk proof or text.
export const captureRestoredFormat = value => {
  if (!value || typeof value.dirty !== 'boolean') throw Error('MT_ENC_INVALID_POLICY')
  return Object.freeze({ format: captureDocumentFormat(value.format), dirty: value.dirty })
}

export const captureFormatChoice = tab => Object.freeze({
  format: captureDocumentFormat(tab),
  dirty: !!tab.requiresExplicitSave || !sameDocumentFormat(captureDocumentFormat(tab), tab.savedFormat)
})

export const captureSessionFormats = (records, paths) => {
  const allowed = new Set(paths)
  const seen = new Set()
  const formats = []
  let rejected = 0
  if (records == null) return { formats, rejected }
  if (!Array.isArray(records)) return { formats, rejected: 1 }
  for (const record of records) {
    try {
      if (!record || !allowed.has(record.pathname) || seen.has(record.pathname)) throw Error('MT_ENC_INVALID_POLICY')
      const choice = captureRestoredFormat(record)
      formats.push(Object.freeze({ pathname: record.pathname, ...choice }))
      seen.add(record.pathname)
    } catch { rejected++ }
  }
  return { formats, rejected }
}
