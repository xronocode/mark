/**
 * Tests for src/renderer/src/util/exportImages.js (M-065)
 *
 * C-SELF-CONTAINED-HTML-EXPORT unit matrix — design-context corners
 * C-1..C-4, C-6..C-11 (C-5/C-12 are covered by the component/e2e
 * layers). ipcFs is mocked at the '@/ipc/runtime' barrel; isWindows is
 * mocked so POSIX and Windows branches are both reachable.
 */

vi.mock('@/ipc/runtime', () => ({
  ipcFs: {
    stat: vi.fn(),
    readBinary: vi.fn()
  }
}))

const isWindowsMock = vi.fn(() => false)
vi.mock('@/util/index', () => ({
  isWindows: (...args) => isWindowsMock(...args)
}))

// START_MODULE_CONTRACT
//   PURPOSE: Pins for the export image-embedding scope gate (C-EXPORT-BOUNDARIES).
//   SCOPE: isInDocumentScope classification, the two-phase consent pass and
//          declined-by-default accounting in util/exportImages.js.
//   DEPENDS: util/exportImages.js.
//   LINKS: .grace/graph/features.xml M-065; V-M-065.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   (suite-local fixtures only - no exports)
// END_MODULE_MAP
//

import { ipcFs } from '@/ipc/runtime'
import {
  embedLocalImages,
  isInDocumentScope,
  EMBED_CAP_BYTES,
  IMAGE_MIME_BY_EXT
} from '@/util/exportImages'

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const PNG_B64 = btoa(String.fromCharCode(...PNG_BYTES))
const PNG_DATA_URL = `data:image/png;base64,${PNG_B64}`

const statFile = (size) => ({
  size, mode: 0o100644, mtimeMs: 0, isFile: true, isDirectory: false, isSymbolicLink: false
})

const img = (src) => `<p><img src="${src}" alt="x"></p>`

beforeEach(() => {
  vi.mocked(ipcFs.stat).mockReset()
  vi.mocked(ipcFs.readBinary).mockReset()
  isWindowsMock.mockReturnValue(false)
})

describe('embedLocalImages — embedding (corners C-1, C-2)', () => {
  it('embeds a document-relative PNG against the document directory (C-1)', async () => {
    vi.mocked(ipcFs.stat).mockResolvedValue(statFile(PNG_BYTES.length))
    vi.mocked(ipcFs.readBinary).mockResolvedValue(PNG_BYTES)

    const result = await embedLocalImages(
      img('img/shot.png'),
      '/var/tmp/marktest/docs'
    )

    expect(ipcFs.stat).toHaveBeenCalledWith('/var/tmp/marktest/docs/img/shot.png')
    expect(result.html).toContain(PNG_DATA_URL)
    expect(result.html).not.toContain('img/shot.png')
    expect(result).toMatchObject({ embedded: 1, total: 1, skipped: 0 })
  })

  it('re-pinned to consent semantics (C-2): an out-of-scope absolute path keeps its src with no consent callback', async () => {
    const result = await embedLocalImages(
      img('/var/tmp/marktest/Pictures/shot.png'),
      '/irrelevant/base'
    )

    expect(ipcFs.stat).not.toHaveBeenCalled()
    expect(ipcFs.readBinary).not.toHaveBeenCalled()
    expect(result.html).toContain('/var/tmp/marktest/Pictures/shot.png')
    expect(result).toMatchObject({ embedded: 0, total: 1, skipped: 1 })
  })

  it('strips file:/// URLs and embeds the referenced file', async () => {
    vi.mocked(ipcFs.stat).mockResolvedValue(statFile(PNG_BYTES.length))
    vi.mocked(ipcFs.readBinary).mockResolvedValue(PNG_BYTES)

    // C-EXPORT-BOUNDARIES: the absolute target is out-of-scope against
    // the null base by design — this pin exists to pin resolution, so
    // the only change is the call shape granting the single candidate.
    await embedLocalImages(img('file:///var/tmp/marktest/shot.png'), null, {
      requestScopeConsent: async (paths) => [paths[0]]
    })

    expect(ipcFs.stat).toHaveBeenCalledWith('/var/tmp/marktest/shot.png')
  })

  it('decodes %20 and unicode before reading (C-4)', async () => {
    vi.mocked(ipcFs.stat).mockResolvedValue(statFile(PNG_BYTES.length))
    vi.mocked(ipcFs.readBinary).mockResolvedValue(PNG_BYTES)

    await embedLocalImages(
      img('%D0%BA%D0%B0%D1%80%D1%82%D0%B8%D0%BD%D0%BA%D0%B0%20shot.png'),
      '/docs'
    )

    expect(ipcFs.stat).toHaveBeenCalledWith('/docs/картинка shot.png')
  })

  it('maps every extension in the MIME table to the right MIME', async () => {
    vi.mocked(ipcFs.stat).mockResolvedValue(statFile(4))
    vi.mocked(ipcFs.readBinary).mockResolvedValue(new Uint8Array([1, 2, 3, 4]))

    const entries = Object.keys(IMAGE_MIME_BY_EXT)
    const html = entries.map((ext) => img(`a.${ext}`)).join('')
    const result = await embedLocalImages(html, '/docs')

    expect(result.embedded).toBe(entries.length)
    for (const mime of Object.values(IMAGE_MIME_BY_EXT)) {
      expect(result.html).toContain(`data:${mime};base64,`)
    }
  })
})

describe('embedLocalImages — untouched and uncounted (corners C-5-src, C-6, C-9)', () => {
  it('leaves remote http(s) src untouched and reads nothing', async () => {
    const result = await embedLocalImages(
      img('https://example.com/remote.png'),
      '/docs'
    )

    expect(ipcFs.stat).not.toHaveBeenCalled()
    expect(ipcFs.readBinary).not.toHaveBeenCalled()
    expect(result.html).toContain('https://example.com/remote.png')
    expect(result).toMatchObject({ embedded: 0, total: 0, skipped: 0 })
  })

  it('leaves existing data: URLs untouched', async () => {
    const result = await embedLocalImages(img('data:image/png;base64,AAAA'), '/docs')

    expect(ipcFs.stat).not.toHaveBeenCalled()
    expect(result.total).toBe(0)
  })

  it('passes relative src through uncounted when no document directory exists (C-9, untitled)', async () => {
    const result = await embedLocalImages(img('img/shot.png'), null)

    expect(ipcFs.stat).not.toHaveBeenCalled()
    expect(result.html).toContain('img/shot.png')
    expect(result).toMatchObject({ embedded: 0, total: 0, skipped: 0 })
  })

  it('leaves pele-style inline SVG markup untouched (no src attribute)', async () => {
    const result = await embedLocalImages(
      '<div class="ag-pele-preview"><svg><rect width="1"></rect></svg></div>',
      '/docs'
    )

    // The pass must not touch nodes without an img src; compare through
    // the DOM rather than the string (serializers may normalize SVG
    // self-closing tags) — the structure and content are preserved.
    const probe = document.createElement('div')
    probe.innerHTML = result.html
    const svg = probe.querySelector('.ag-pele-preview svg')
    expect(svg).not.toBeNull()
    expect(svg.querySelector('rect').getAttribute('width')).toBe('1')
    expect(result.total).toBe(0)
  })
})

describe('embedLocalImages — counted skips (corners C-7, C-8, C-11)', () => {
  it('keeps src and counts skipped for a missing file (C-7)', async () => {
    vi.mocked(ipcFs.stat).mockRejectedValue(new Error('ENOENT'))

    const result = await embedLocalImages(img('gone.png'), '/docs')

    expect(result.html).toContain('gone.png')
    expect(result).toMatchObject({ embedded: 0, total: 1, skipped: 1 })
    expect(ipcFs.readBinary).not.toHaveBeenCalled()
  })

  it('skips without a read at or above the cap (C-8)', async () => {
    vi.mocked(ipcFs.stat).mockResolvedValue(statFile(EMBED_CAP_BYTES))

    const result = await embedLocalImages(img('huge.png'), '/docs')

    expect(ipcFs.readBinary).not.toHaveBeenCalled()
    expect(result.html).toContain('huge.png')
    expect(result.skipped).toBe(1)
  })

  it('counts a read failure as skipped, not an export failure', async () => {
    vi.mocked(ipcFs.stat).mockResolvedValue(statFile(PNG_BYTES.length))
    vi.mocked(ipcFs.readBinary).mockRejectedValue(new Error('EACCES'))

    const result = await embedLocalImages(img('locked.png'), '/docs')

    expect(result.html).toContain('locked.png')
    expect(result).toMatchObject({ embedded: 0, total: 1, skipped: 1 })
  })

  it('never embeds an unknown extension with a guessed MIME (C-11)', async () => {
    const result = await embedLocalImages(img('diagram.tiff'), '/docs')

    expect(ipcFs.stat).not.toHaveBeenCalled()
    expect(result.html).toContain('diagram.tiff')
    expect(result).toMatchObject({ embedded: 0, total: 1, skipped: 1 })
  })
})

describe('embedLocalImages — dedup (corner C-10)', () => {
  it('reads one file once for three references (two spellings of one path) and counts three references', async () => {
    vi.mocked(ipcFs.stat).mockResolvedValue(statFile(PNG_BYTES.length))
    vi.mocked(ipcFs.readBinary).mockResolvedValue(PNG_BYTES)

    const result = await embedLocalImages(
      `${img('img/same.png')}${img('img/same.png')}${img('file:///docs/img/same.png')}`,
      '/docs'
    )

    expect(ipcFs.stat).toHaveBeenCalledTimes(1)
    expect(ipcFs.readBinary).toHaveBeenCalledTimes(1)
    expect((result.html.match(new RegExp(PNG_B64, 'g')) || []).length).toBe(3)
    expect(result).toMatchObject({ embedded: 3, total: 3, skipped: 0 })
  })

  it('reuses a missing-file outcome without a second stat', async () => {
    vi.mocked(ipcFs.stat).mockRejectedValue(new Error('ENOENT'))

    const result = await embedLocalImages(`${img('gone.png')}${img('gone.png')}`, '/docs')

    expect(ipcFs.stat).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({ embedded: 0, total: 2, skipped: 2 })
  })
})

describe('embedLocalImages — Windows normalization (corner C-3)', () => {
  beforeEach(() => {
    isWindowsMock.mockReturnValue(true)
  })

  it('normalizes drive-letter paths with backslashes', async () => {
    vi.mocked(ipcFs.stat).mockResolvedValue(statFile(PNG_BYTES.length))
    vi.mocked(ipcFs.readBinary).mockResolvedValue(PNG_BYTES)

    // C-EXPORT-BOUNDARIES: call-only update — assertions unchanged; the
    // normalized absolute target is out-of-scope against the null base,
    // so the consent callback grants the single candidate.
    await embedLocalImages(img('C:\\marktest\\shot.png'), null, {
      requestScopeConsent: async (paths) => [paths[0]]
    })

    expect(ipcFs.stat).toHaveBeenCalledWith('C:/marktest/shot.png')
  })

  it('normalizes extended-prefix paths and drops the prefix', async () => {
    vi.mocked(ipcFs.stat).mockResolvedValue(statFile(PNG_BYTES.length))
    vi.mocked(ipcFs.readBinary).mockResolvedValue(PNG_BYTES)

    // C-EXPORT-BOUNDARIES: call-only update, as above.
    await embedLocalImages(img('\\\\?\\C:\\marktest\\shot.png'), null, {
      requestScopeConsent: async (paths) => [paths[0]]
    })

    expect(ipcFs.stat).toHaveBeenCalledWith('C:/marktest/shot.png')
  })

  it('passes generic UNC through untouched and uncounted', async () => {
    const result = await embedLocalImages(img('\\\\server\\share\\shot.png'), null)

    expect(ipcFs.stat).not.toHaveBeenCalled()
    expect(result.html).toContain('\\\\server\\share\\shot.png')
    expect(result.total).toBe(0)
  })
})

describe('embedLocalImages — markup integrity', () => {
  it('leaves non-image markup byte-identical', async () => {
    // Valid muya-shaped markup (explicit thead/tbody) round-trips
    // through the DOM parser unchanged.
    const html = [
      '<h2 id="title">Title</h2>',
      '<table><thead><tr><th>h</th></tr></thead><tbody><tr><td>cell</td></tr></tbody></table>',
      '<pre><code>const x = 1</code></pre>'
    ].join('')

    const result = await embedLocalImages(html, '/docs')

    expect(result.html).toBe(html)
  })
})

// ──────────────────────────────────────────────────────────────────────
// START_BLOCK_SCOPE_GATE_PINS
// C-EXPORT-BOUNDARIES red-first pins: the out-of-scope gate, the granted
// subset, consent-list integrity, the unchanged cap/MIME gates under a
// grant and declined accounting. These fail on pre-fix code, which
// embedded '/irrelevant/base' absolute paths unconditionally.
// ──────────────────────────────────────────────────────────────────────
describe('embedLocalImages — embed scope consent gate (C-EXPORT-BOUNDARIES)', () => {
  it('not embed an out-of-scope absolute path without consent', async () => {
    const result = await embedLocalImages(
      img('/var/tmp/marktest/Pictures/shot.png'),
      '/irrelevant/base'
    )

    // Out-of-scope refused: no I/O at all, the src survives and the
    // reference counts skipped.
    expect(ipcFs.stat).not.toHaveBeenCalled()
    expect(ipcFs.readBinary).not.toHaveBeenCalled()
    expect(result.html).toContain('/var/tmp/marktest/Pictures/shot.png')
    expect(result).toMatchObject({ embedded: 0, total: 1, skipped: 1 })
  })

  it('isInDocumentScope keeps segment boundaries, trailing slashes and Windows case-folding', () => {
    // Segment-boundary prefix: '/docs' never claims '/docsfiles/x.png'.
    expect(isInDocumentScope('/docsfiles/x.png', '/docs')).toBe(false)
    expect(isInDocumentScope('/docs/img/x.png', '/docs')).toBe(true)
    expect(isInDocumentScope('/docs', '/docs')).toBe(true)
    // Trailing slashes on either side are tolerated.
    expect(isInDocumentScope('/docs/img/x.png', '/docs/')).toBe(true)
    expect(isInDocumentScope('/docs/img/', '/docs')).toBe(true)
    // Falsy baseDir is never in scope.
    expect(isInDocumentScope('/docs/img/x.png', null)).toBe(false)
    expect(isInDocumentScope('/docs/img/x.png', '')).toBe(false)
  })

  it('isInDocumentScope folds case only under isWindows()', async () => {
    isWindowsMock.mockReturnValue(true)
    expect(isInDocumentScope('/Docs/Img/x.png', '/docs')).toBe(true)
    isWindowsMock.mockReturnValue(false)
    expect(isInDocumentScope('/Docs/Img/x.png', '/docs')).toBe(false)
  })

  it('still embeds an in-scope sibling image (C-1 unchanged)', async () => {
    vi.mocked(ipcFs.stat).mockResolvedValue(statFile(PNG_BYTES.length))
    vi.mocked(ipcFs.readBinary).mockResolvedValue(PNG_BYTES)

    // An out-of-scope sibling next to an in-scope reference: the
    // in-scope embed must be byte-identical to the C-1 behavior even
    // when the consent callback declines everything.
    const result = await embedLocalImages(
      `${img('/var/tmp/elsewhere/Pictures/shot.png')}${img('img/shot.png')}`,
      '/var/tmp/marktest/docs',
      { requestScopeConsent: async () => [] }
    )

    expect(ipcFs.stat).toHaveBeenCalledTimes(1)
    expect(ipcFs.stat).toHaveBeenCalledWith('/var/tmp/marktest/docs/img/shot.png')
    expect(result.html).toContain(PNG_DATA_URL)
    expect(result.html).toContain('/var/tmp/elsewhere/Pictures/shot.png')
    expect(result).toMatchObject({ embedded: 1, total: 2, skipped: 1 })
  })

  it('embeds exactly the granted subset of the consented list', async () => {
    vi.mocked(ipcFs.stat).mockResolvedValue(statFile(PNG_BYTES.length))
    vi.mocked(ipcFs.readBinary).mockResolvedValue(PNG_BYTES)

    const result = await embedLocalImages(
      `${img('/var/tmp/marktest/Pictures/one.png')}${img('/var/tmp/marktest/Pictures/two.png')}`,
      '/irrelevant/base',
      { requestScopeConsent: async (paths) => [paths[0]] }
    )

    expect(ipcFs.stat).toHaveBeenCalledTimes(1)
    expect(ipcFs.stat).toHaveBeenCalledWith('/var/tmp/marktest/Pictures/one.png')
    expect(result.html).toContain(PNG_DATA_URL)
    expect(result.html).toContain('/var/tmp/marktest/Pictures/two.png')
    expect(result.html).not.toContain('/var/tmp/marktest/Pictures/one.png')
    expect(result).toMatchObject({ embedded: 1, total: 2, skipped: 1 })
  })

  it('deduplicates the consent list by resolved path across two spellings plus a file:// form', async () => {
    vi.mocked(ipcFs.stat).mockResolvedValue(statFile(PNG_BYTES.length))
    vi.mocked(ipcFs.readBinary).mockResolvedValue(PNG_BYTES)

    const seenLists = []
    const result = await embedLocalImages(
      `${img('/var/tmp/marktest/docs/img/same.png')}` +
        `${img(' /var/tmp/marktest/docs/img/same.png ')}` +
        `${img('file:///var/tmp/marktest/docs/img/same.png')}`,
      '/irrelevant/base',
      {
        requestScopeConsent: async (paths) => {
          seenLists.push([...paths])
          return [paths[0]]
        }
      }
    )

    // One callback, one entry — the three spellings resolve to the same
    // path and the granted file embeds for all three references.
    expect(seenLists).toHaveLength(1)
    expect(seenLists[0]).toEqual(['/var/tmp/marktest/docs/img/same.png'])
    expect(ipcFs.stat).toHaveBeenCalledTimes(1)
    expect(ipcFs.readBinary).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({ embedded: 3, total: 3, skipped: 0 })
  })

  it('grants embed through the unchanged cap and MIME gates', async () => {
    vi.mocked(ipcFs.stat).mockResolvedValue(statFile(EMBED_CAP_BYTES))
    vi.mocked(ipcFs.readBinary).mockResolvedValue(PNG_BYTES)

    const result = await embedLocalImages(
      `${img('/var/tmp/marktest/Pictures/huge.png')}${img('/var/tmp/marktest/Pictures/diagram.tiff')}`,
      '/irrelevant/base',
      { requestScopeConsent: async (paths) => paths }
    )

    // Cap: granted, but at EMBED_CAP_BYTES it still skips without a read.
    expect(ipcFs.readBinary).not.toHaveBeenCalled()
    expect(result.html).toContain('huge.png')
    // MIME: an unknown extension is never even a consent candidate.
    expect(ipcFs.stat).toHaveBeenCalledTimes(1)
    expect(ipcFs.stat).toHaveBeenCalledWith('/var/tmp/marktest/Pictures/huge.png')
    expect(result.html).toContain('diagram.tiff')
    expect(result).toMatchObject({ embedded: 0, total: 2, skipped: 2 })
  })

  it('counts declined references as skipped, never as embedded', async () => {
    const result = await embedLocalImages(
      `${img('/var/tmp/marktest/Pictures/one.png')}${img('/var/tmp/marktest/Pictures/one.png')}${img('/var/tmp/marktest/Pictures/two.png')}`,
      '/irrelevant/base'
    )

    // Declined-by-default: zero I/O, every declined reference stays in
    // total/skipped and never reaches embedded.
    expect(ipcFs.stat).not.toHaveBeenCalled()
    expect(ipcFs.readBinary).not.toHaveBeenCalled()
    expect(result).toMatchObject({ embedded: 0, total: 3, skipped: 3 })
  })
})
// END_BLOCK_SCOPE_GATE_PINS
