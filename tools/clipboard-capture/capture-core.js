// FILE: tools/clipboard-capture/capture-core.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Build deterministic clipboard fixture records and GitHub issue handoff payloads from browser paste events without mutating clipboard body content beyond line-ending normalization.
//   SCOPE: MIME/type enumeration, text payload extraction, file metadata capture, export filename generation, full issue-packet construction, and compact GitHub issue URL generation for the standalone clipboard capture tool.
//   DEPENDS: Browser ClipboardEvent/DataTransfer surface or test doubles with equivalent methods.
//   LINKS: M-044, V-M-044
//   ROLE: SCRIPT
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   TOOL_SCHEMA_VERSION - Schema version for single-capture exports.
//   HISTORY_SCHEMA_VERSION - Schema version for history exports.
//   KNOWN_TEXT_TYPES - Preferred text MIME order for deterministic capture output.
//   normalizeLineEndings - Canonicalizes CRLF/CR line endings to LF.
//   buildCaptureRecord - Builds one JSON-safe capture record from a DataTransfer-like object.
//   buildHistoryEnvelope - Wraps multiple capture records for bulk export.
//   createExportFilename - Produces stable filesystem-safe JSON export names.
//   buildIssuePacket - Produces a full markdown packet for copy/paste into GitHub issues.
//   buildIssueUrl - Produces a prefilled GitHub issue URL with a human-first triage template and compact metadata.
// END_MODULE_MAP

export const TOOL_SCHEMA_VERSION = 'clipboard-fixture-capture/v1'
export const HISTORY_SCHEMA_VERSION = 'clipboard-fixture-history/v1'

export const KNOWN_TEXT_TYPES = [
  'text/markdown',
  'text/x-markdown',
  'text/html',
  'text/plain',
  'text/rtf',
  'application/rtf'
]

// START_CONTRACT: normalizeLineEndings
//   PURPOSE: Canonicalize clipboard text bodies to LF so fixtures remain diff-stable across platforms.
//   INPUTS: { value: unknown - Clipboard text body or arbitrary value }
//   OUTPUTS: { string - String with CRLF/CR converted to LF }
//   SIDE_EFFECTS: none
//   LINKS: M-044, V-M-044
// END_CONTRACT: normalizeLineEndings
export function normalizeLineEndings(value) {
  return String(value ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

// START_CONTRACT: buildCaptureRecord
//   PURPOSE: Produce a deterministic, JSON-safe clipboard capture record from browser clipboard metadata and payload bodies.
//   INPUTS: { input: object - { dataTransfer, sourceLabel, note, platformMeta } }
//   OUTPUTS: { object - Clipboard capture record with payloads, metadata, and presence flags }
//   SIDE_EFFECTS: none
//   LINKS: M-044, V-M-044
// END_CONTRACT: buildCaptureRecord
export function buildCaptureRecord({
  dataTransfer,
  sourceLabel = '',
  note = '',
  platformMeta = {}
} = {}) {
  const advertisedTypes = collectAdvertisedTypes(dataTransfer)
  const textPayloads = collectTextPayloads(dataTransfer, advertisedTypes)
  const filePayloads = collectFilePayloads(dataTransfer)
  const itemPayloads = collectItemPayloads(dataTransfer)
  const captureId = generateCaptureId()

  return {
    schemaVersion: TOOL_SCHEMA_VERSION,
    captureId,
    capturedAt: new Date().toISOString(),
    sourceLabel: String(sourceLabel).trim(),
    note: String(note).trim(),
    captureTool: {
      name: 'clipboard-fixture-capture',
      version: '1.0.0'
    },
    platform: buildPlatformMeta(platformMeta),
    clipboard: {
      advertisedTypes,
      itemCount: itemPayloads.length,
      fileCount: filePayloads.length,
      families: buildFamilies(textPayloads, filePayloads)
    },
    payloads: {
      text: textPayloads,
      items: itemPayloads,
      files: filePayloads
    }
  }
}

// START_CONTRACT: buildHistoryEnvelope
//   PURPOSE: Wrap multiple clipboard capture records into one portable export payload.
//   INPUTS: { captures: Array - Ordered clipboard capture records }
//   OUTPUTS: { object - History envelope for JSON export }
//   SIDE_EFFECTS: none
//   LINKS: M-044, V-M-044
// END_CONTRACT: buildHistoryEnvelope
export function buildHistoryEnvelope(captures) {
  return {
    schemaVersion: HISTORY_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    captureCount: Array.isArray(captures) ? captures.length : 0,
    captures: Array.isArray(captures) ? captures : []
  }
}

// START_CONTRACT: createExportFilename
//   PURPOSE: Generate a stable, filesystem-safe filename for clipboard fixture JSON.
//   INPUTS: { record: object - Clipboard capture record, kind: string - 'single' or 'history' }
//   OUTPUTS: { string - Suggested JSON filename }
//   SIDE_EFFECTS: none
//   LINKS: M-044, V-M-044
// END_CONTRACT: createExportFilename
export function createExportFilename(record, kind = 'single') {
  const capturedAt = record?.capturedAt || new Date().toISOString()
  const compactTs = capturedAt.replace(/[-:]/g, '').replace(/\..+$/, '').replace('T', '-')
  const label = sanitizeFilenameSegment(record?.sourceLabel || kind)

  if (kind === 'history') {
    return `clipboard-history-${compactTs}.json`
  }

  return `clipboard-${label}-${compactTs}.json`
}

// START_CONTRACT: buildIssuePacket
//   PURPOSE: Create a full markdown issue packet containing the complete capture JSON for manual paste into GitHub issues.
//   INPUTS: { record: object - Clipboard capture record }
//   OUTPUTS: { string - Full markdown issue packet }
//   SIDE_EFFECTS: none
//   LINKS: M-044, V-M-044
// END_CONTRACT: buildIssuePacket
export function buildIssuePacket(record) {
  const safeRecord = record || {}
  const types = safeRecord.clipboard?.advertisedTypes?.join(', ') || 'none'
  const flags = buildFlagSummary(safeRecord)

  return [
    '# Clipboard fixture packet',
    '',
    `- Capture ID: ${safeRecord.captureId || 'unknown'}`,
    `- Captured at: ${safeRecord.capturedAt || 'unknown'}`,
    `- Source label: ${safeRecord.sourceLabel || 'unlabeled'}`,
    `- Platform: ${safeRecord.platform?.platform || 'unknown'}`,
    `- Time zone: ${safeRecord.platform?.timeZone || 'unknown'}`,
    `- Advertised types: ${types}`,
    `- Flags: ${flags}`,
    `- Note: ${safeRecord.note || 'none'}`,
    '',
    '## Full fixture JSON',
    '',
    '```json',
    JSON.stringify(safeRecord, null, 2),
    '```',
    ''
  ].join('\n')
}

// START_CONTRACT: buildIssueUrl
//   PURPOSE: Create a prefilled GitHub issue URL from a clipboard capture using a human-first triage template and compact metadata.
//   INPUTS: { input: object - { repo, record, copiedFullPacket } }
//   OUTPUTS: { string - GitHub issue URL }
//   SIDE_EFFECTS: none
//   LINKS: M-044, V-M-044
// END_CONTRACT: buildIssueUrl
export function buildIssueUrl({ repo, record, copiedFullPacket = false } = {}) {
  const safeRepo = String(repo || '').trim().replace(/^\/+|\/+$/g, '')
  const title = buildIssueTitle(record)
  const body = buildIssueBody(record, { copiedFullPacket })

  return `https://github.com/${safeRepo}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`
}

function collectAdvertisedTypes(dataTransfer) {
  const rawTypes = Array.from(dataTransfer?.types || [])
  return rawTypes.filter((type) => typeof type === 'string' && type.length > 0)
}

function collectTextPayloads(dataTransfer, advertisedTypes) {
  const orderedTypes = getOrderedTextTypes(advertisedTypes)
  const payloads = {}

  for (const type of orderedTypes) {
    const body = safeGetData(dataTransfer, type)
    if (body !== '' || advertisedTypes.includes(type)) {
      const normalized = normalizeLineEndings(body)
      payloads[type] = {
        value: normalized,
        length: normalized.length,
        lineCount: normalized.length === 0 ? 0 : normalized.split('\n').length
      }
    }
  }

  return payloads
}

function collectItemPayloads(dataTransfer) {
  const items = Array.from(dataTransfer?.items || [])

  return items.map((item, index) => {
    const file = typeof item?.getAsFile === 'function' ? item.getAsFile() : null

    return {
      index,
      kind: item?.kind || 'unknown',
      type: item?.type || '',
      fileName: file?.name || '',
      fileType: file?.type || '',
      fileSize: typeof file?.size === 'number' ? file.size : null
    }
  })
}

function collectFilePayloads(dataTransfer) {
  const files = Array.from(dataTransfer?.files || [])

  return files.map((file, index) => ({
    index,
    name: file?.name || '',
    type: file?.type || '',
    size: typeof file?.size === 'number' ? file.size : 0
  }))
}

function getOrderedTextTypes(advertisedTypes) {
  const ordered = []

  for (const type of KNOWN_TEXT_TYPES) {
    if (advertisedTypes.includes(type) && !ordered.includes(type)) {
      ordered.push(type)
    }
  }

  for (const type of advertisedTypes) {
    if (shouldAttemptStringRead(type) && !ordered.includes(type)) {
      ordered.push(type)
    }
  }

  return ordered
}

function shouldAttemptStringRead(type) {
  return typeof type === 'string' && type.length > 0 && type !== 'Files'
}

function safeGetData(dataTransfer, type) {
  if (!dataTransfer || typeof dataTransfer.getData !== 'function') {
    return ''
  }

  try {
    return String(dataTransfer.getData(type) ?? '')
  } catch {
    return ''
  }
}

function buildFamilies(textPayloads, filePayloads) {
  const textTypes = Object.keys(textPayloads)
  const customTextTypes = textTypes.filter((type) => !KNOWN_TEXT_TYPES.includes(type))

  return {
    hasMarkdown: Boolean(textPayloads['text/markdown'] || textPayloads['text/x-markdown']),
    hasHtml: Object.prototype.hasOwnProperty.call(textPayloads, 'text/html'),
    hasPlain: Object.prototype.hasOwnProperty.call(textPayloads, 'text/plain'),
    hasRtf: Boolean(textPayloads['text/rtf'] || textPayloads['application/rtf']),
    hasFiles: filePayloads.length > 0,
    hasImageFiles: filePayloads.some((file) => file.type.startsWith('image/')),
    customTextTypes
  }
}

function buildIssueTitle(record) {
  const label = sanitizeFilenameSegment(record?.sourceLabel || 'clipboard-fixture').replace(/-/g, ' ')
  const humanLabel = label.replace(/\b\w/g, (char) => char.toUpperCase())
  return `Smart paste fixture: ${humanLabel}`
}

function buildIssueBody(record, { copiedFullPacket }) {
  const safeRecord = record || {}
  const types = safeRecord.clipboard?.advertisedTypes?.join(', ') || 'none'
  const selectionPreview = buildSelectionPreview(safeRecord)
  const packetHint = copiedFullPacket
    ? 'The full fixture packet was copied to the clipboard by the capture tool. Paste it below if raw payload evidence is needed.'
    : 'Use the capture tool to copy or download the full fixture packet, then paste it below if raw payload evidence is needed.'

  return [
    '## What broke',
    '- Expected in Mark:',
    '- Actual in Mark:',
    '',
    '## Source context',
    `- Source label: ${safeRecord.sourceLabel || 'unlabeled'}`,
    `- Selection preview: ${selectionPreview || 'unavailable'}`,
    `- Reporter note: ${safeRecord.note || 'none'}`,
    '',
    '## Clipboard capture',
    `- Captured at: ${safeRecord.capturedAt || 'unknown'}`,
    `- Platform: ${safeRecord.platform?.platform || 'unknown'}`,
    `- Advertised types: ${types}`,
    `- Flags: ${buildFlagSummary(safeRecord)}`,
    '',
    '<details>',
    '<summary>Payload inventory</summary>',
    '',
    ...buildPayloadSummaryLines(safeRecord),
    '',
    '</details>',
    '',
    '## Full fixture',
    packetHint,
    ''
  ].join('\n')
}

function buildPayloadSummaryLines(record) {
  const textEntries = Object.entries(record?.payloads?.text || {})
  if (textEntries.length === 0) {
    return ['- No text payloads exposed by this browser.']
  }

  return textEntries.slice(0, 6).map(([type, payload]) => {
    return `- \`${type}\`: ${payload.length} chars, ${payload.lineCount} lines`
  })
}

function buildSelectionPreview(record) {
  const textPayloads = record?.payloads?.text || {}
  const preferredTypes = ['text/markdown', 'text/x-markdown', 'text/plain']

  for (const type of preferredTypes) {
    const payload = textPayloads[type]
    if (!payload?.value) {
      continue
    }

    const normalized = String(payload.value).replace(/\s+/g, ' ').trim()
    if (normalized.length > 0) {
      return clipText(normalized, 160)
    }
  }

  return ''
}

function buildFlagSummary(record) {
  const families = record?.clipboard?.families || {}
  return [
    `markdown=${Boolean(families.hasMarkdown)}`,
    `html=${Boolean(families.hasHtml)}`,
    `plain=${Boolean(families.hasPlain)}`,
    `rtf=${Boolean(families.hasRtf)}`,
    `files=${Boolean(families.hasFiles)}`,
    `imageFiles=${Boolean(families.hasImageFiles)}`
  ].join(', ')
}

function clipText(value, limit) {
  const text = String(value || '')
  if (text.length <= limit) {
    return text
  }

  return `${text.slice(0, limit)}…`
}

function buildPlatformMeta(platformMeta) {
  const nav = globalThis.navigator || {}
  const userAgentData =
    nav.userAgentData && typeof nav.userAgentData.toJSON === 'function'
      ? nav.userAgentData.toJSON()
      : null
  const defaultTimeZone = (() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || ''
    } catch {
      return ''
    }
  })()

  return {
    userAgent: platformMeta.userAgent ?? nav.userAgent ?? '',
    platform: platformMeta.platform ?? nav.platform ?? '',
    language: platformMeta.language ?? nav.language ?? '',
    languages: platformMeta.languages ?? nav.languages ?? [],
    timeZone: platformMeta.timeZone ?? defaultTimeZone,
    href: platformMeta.href ?? globalThis.location?.href ?? '',
    userAgentData: platformMeta.userAgentData ?? userAgentData
  }
}

function sanitizeFilenameSegment(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return normalized || 'capture'
}

function generateCaptureId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID()
  }

  return `capture-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`
}
