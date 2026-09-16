// FILE: tests/renderer/util/clipboard-fixture-capture.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Verify that the standalone clipboard fixture capture core produces deterministic JSON-ready records from DataTransfer-like mocks.
//   SCOPE: Line-ending normalization, MIME ordering, metadata-only file capture, and export filename generation.
//   DEPENDS: tools/clipboard-capture/capture-core.js, vitest
//   LINKS: V-M-044, M-044
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   createDataTransfer - Builds deterministic DataTransfer-like mocks.
// END_MODULE_MAP

import {
  buildCaptureRecord,
  buildIssuePacket,
  buildIssueUrl,
  createExportFilename,
  normalizeLineEndings
} from '../../../tools/clipboard-capture/capture-core.js'

function createDataTransfer({ types = [], dataByType = {}, items = [], files = [] } = {}) {
  return {
    types,
    items,
    files,
    getData(type) {
      return dataByType[type] ?? ''
    }
  }
}

describe('clipboard-fixture-capture core', () => {
  it('normalizes CRLF and CR line endings to LF', () => {
    expect(normalizeLineEndings('a\r\nb\rc')).toBe('a\nb\nc')
  })

  it('builds deterministic text payloads in preferred MIME order', () => {
    const dataTransfer = createDataTransfer({
      types: ['text/plain', 'text/html', 'text/x-markdown', 'vscode-editor-data'],
      dataByType: {
        'text/plain': 'plain\r\nbody',
        'text/html': '<p>rich</p>',
        'text/x-markdown': '- `item`',
        'vscode-editor-data': '{"version":1}'
      }
    })

    const record = buildCaptureRecord({
      dataTransfer,
      sourceLabel: 'Claude VSCode',
      note: 'Rendered list with inline code',
      platformMeta: {
        userAgent: 'fixture-agent',
        platform: 'Win32',
        language: 'en-US',
        languages: ['en-US'],
        timeZone: 'UTC',
        href: 'file:///tool/index.html'
      }
    })

    expect(record.sourceLabel).toBe('Claude VSCode')
    expect(Object.keys(record.payloads.text)).toEqual([
      'text/x-markdown',
      'text/html',
      'text/plain',
      'vscode-editor-data'
    ])
    expect(record.payloads.text['text/plain']).toEqual({
      value: 'plain\nbody',
      length: 10,
      lineCount: 2
    })
    expect(record.payloads.text['vscode-editor-data'].value).toBe('{"version":1}')
    expect(record.clipboard.families.hasMarkdown).toBe(true)
    expect(record.clipboard.families.hasHtml).toBe(true)
    expect(record.clipboard.families.hasPlain).toBe(true)
    expect(record.clipboard.families.customTextTypes).toEqual(['vscode-editor-data'])
  })

  it('keeps advertised empty html payloads and records file metadata only', () => {
    const imageFile = { name: 'snippet.png', type: 'image/png', size: 2048 }
    const dataTransfer = createDataTransfer({
      types: ['text/html', 'Files'],
      dataByType: {
        'text/html': ''
      },
      items: [
        { kind: 'string', type: 'text/html' },
        { kind: 'file', type: 'image/png', getAsFile: () => imageFile }
      ],
      files: [imageFile]
    })

    const record = buildCaptureRecord({
      dataTransfer,
      platformMeta: {
        userAgent: 'fixture-agent',
        platform: 'MacIntel'
      }
    })

    expect(record.payloads.text['text/html']).toEqual({
      value: '',
      length: 0,
      lineCount: 0
    })
    expect(record.payloads.files).toEqual([
      { index: 0, name: 'snippet.png', type: 'image/png', size: 2048 }
    ])
    expect(record.payloads.items[1]).toEqual({
      index: 1,
      kind: 'file',
      type: 'image/png',
      fileName: 'snippet.png',
      fileType: 'image/png',
      fileSize: 2048
    })
    expect(record.clipboard.families.hasFiles).toBe(true)
    expect(record.clipboard.families.hasImageFiles).toBe(true)
  })

  it('creates filesystem-safe export filenames', () => {
    const fileName = createExportFilename({
      sourceLabel: 'Claude VSCode / Lists + Code',
      capturedAt: '2026-05-24T18:42:13.000Z'
    })

    expect(fileName).toBe('clipboard-claude-vscode-lists-code-20260524-184213.json')
  })

  it('builds a full issue packet with fixture JSON', () => {
    const record = buildCaptureRecord({
      dataTransfer: createDataTransfer({
        types: ['text/plain'],
        dataByType: { 'text/plain': 'plain body' }
      }),
      sourceLabel: 'chatgpt-web',
      note: 'inline code lost',
      platformMeta: { platform: 'Win32', timeZone: 'UTC' }
    })

    const packet = buildIssuePacket(record)

    expect(packet).toContain('# Clipboard fixture packet')
    expect(packet).toContain('- Source label: chatgpt-web')
    expect(packet).toContain('## Full fixture JSON')
    expect(packet).toContain('"text/plain"')
  })

  it('builds a compact human-first GitHub issue URL', () => {
    const record = buildCaptureRecord({
      dataTransfer: createDataTransfer({
        types: ['text/plain', 'text/html'],
        dataByType: {
          'text/plain': 'plain body',
          'text/html': '<p><code>inline</code> body</p>'
        }
      }),
      sourceLabel: 'claude-vscode',
      note: 'inline code formatting dropped',
      platformMeta: { platform: 'Win32', timeZone: 'UTC' }
    })

    const url = buildIssueUrl({
      repo: 'xronocode/mark',
      record,
      copiedFullPacket: true
    })

    expect(url.startsWith('https://github.com/xronocode/mark/issues/new?')).toBe(true)
    const decoded = decodeURIComponent(url)

    expect(decoded).toContain('Smart paste fixture: Claude Vscode')
    expect(decoded).toContain('## What broke')
    expect(decoded).toContain('- Selection preview: plain body')
    expect(decoded).toContain('- Reporter note: inline code formatting dropped')
    expect(decoded).toContain('<summary>Payload inventory</summary>')
    expect(decoded).toContain('The full fixture packet was copied to the clipboard')
    expect(decoded).not.toContain('## Compact previews')
    expect(decoded).not.toContain('<p><code>inline</code> body</p>')
  })
})
