// FILE: tools/clipboard-capture/capture-core.browser.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Provide a file://-safe browser-global clipboard capture core for the standalone fixture capture tool.
//   SCOPE: Same deterministic record building and GitHub issue handoff helpers as the testable ESM core, exposed through globalThis.ClipboardCaptureCore for classic-script loading.
//   DEPENDS: Browser ClipboardEvent/DataTransfer surface or test doubles with equivalent methods.
//   LINKS: M-044, V-M-044
//   ROLE: SCRIPT
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT

;(() => {
  const TOOL_SCHEMA_VERSION = 'clipboard-fixture-capture/v1'
  const HISTORY_SCHEMA_VERSION = 'clipboard-fixture-history/v1'
  const KNOWN_TEXT_TYPES = [
    'text/markdown',
    'text/x-markdown',
    'text/html',
    'text/plain',
    'text/rtf',
    'application/rtf'
  ]

  function normalizeLineEndings(value) {
    return String(value ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  }

  function buildCaptureRecord({
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

  function buildHistoryEnvelope(captures) {
    return {
      schemaVersion: HISTORY_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      captureCount: Array.isArray(captures) ? captures.length : 0,
      captures: Array.isArray(captures) ? captures : []
    }
  }

  function createExportFilename(record, kind = 'single') {
    const capturedAt = record?.capturedAt || new Date().toISOString()
    const compactTs = capturedAt.replace(/[-:]/g, '').replace(/\..+$/, '').replace('T', '-')
    const label = sanitizeFilenameSegment(record?.sourceLabel || kind)

    if (kind === 'history') {
      return `clipboard-history-${compactTs}.json`
    }

    return `clipboard-${label}-${compactTs}.json`
  }

  function buildIssuePacket(record) {
    const safeRecord = record || {}
    const types = (safeRecord.clipboard && safeRecord.clipboard.advertisedTypes || []).join(', ') || 'none'
    const flags = buildFlagSummary(safeRecord)

    return [
      '# Clipboard fixture packet',
      '',
      `- Capture ID: ${safeRecord.captureId || 'unknown'}`,
      `- Captured at: ${safeRecord.capturedAt || 'unknown'}`,
      `- Source label: ${safeRecord.sourceLabel || 'unlabeled'}`,
      `- Platform: ${safeRecord.platform && safeRecord.platform.platform || 'unknown'}`,
      `- Time zone: ${safeRecord.platform && safeRecord.platform.timeZone || 'unknown'}`,
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

  function buildIssueUrl({ repo, record, copiedFullPacket = false } = {}) {
    const safeRepo = String(repo || '').trim().replace(/^\/+|\/+$/g, '')
    const title = buildIssueTitle(record)
    const body = buildIssueBody(record, { copiedFullPacket })

    return `https://github.com/${safeRepo}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`
  }

  function collectAdvertisedTypes(dataTransfer) {
    const rawTypes = Array.from((dataTransfer && dataTransfer.types) || [])
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
    const items = Array.from((dataTransfer && dataTransfer.items) || [])

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
    const files = Array.from((dataTransfer && dataTransfer.files) || [])

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
    const label = sanitizeFilenameSegment(record && record.sourceLabel || 'clipboard-fixture').replace(/-/g, ' ')
    const humanLabel = label.replace(/\b\w/g, (char) => char.toUpperCase())
    return `Smart paste fixture: ${humanLabel}`
  }

  function buildIssueBody(record, { copiedFullPacket }) {
    const safeRecord = record || {}
    const types = (safeRecord.clipboard && safeRecord.clipboard.advertisedTypes || []).join(', ') || 'none'
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
      `- Platform: ${safeRecord.platform && safeRecord.platform.platform || 'unknown'}`,
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
    const textEntries = Object.entries(record && record.payloads && record.payloads.text || {})
    if (textEntries.length === 0) {
      return ['- No text payloads exposed by this browser.']
    }

    return textEntries.slice(0, 6).map(([type, payload]) => {
      return `- \`${type}\`: ${payload.length} chars, ${payload.lineCount} lines`
    })
  }

  function buildSelectionPreview(record) {
    const textPayloads = record && record.payloads && record.payloads.text || {}
    const preferredTypes = ['text/markdown', 'text/x-markdown', 'text/plain']

    for (const type of preferredTypes) {
      const payload = textPayloads[type]
      if (!payload || !payload.value) {
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
    const families = record && record.clipboard && record.clipboard.families || {}
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

  globalThis.ClipboardCaptureCore = {
    buildCaptureRecord,
    buildHistoryEnvelope,
    createExportFilename,
    buildIssuePacket,
    buildIssueUrl
  }
})()
