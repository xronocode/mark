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

import { ipcFs } from '@/ipc/runtime'
import {
  embedLocalImages,
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

  it('embeds an absolute POSIX path and leaves no absolute path in the output (C-2)', async () => {
    vi.mocked(ipcFs.stat).mockResolvedValue(statFile(PNG_BYTES.length))
    vi.mocked(ipcFs.readBinary).mockResolvedValue(PNG_BYTES)

    const result = await embedLocalImages(
      img('/var/tmp/marktest/Pictures/shot.png'),
      '/irrelevant/base'
    )

    expect(ipcFs.stat).toHaveBeenCalledWith('/var/tmp/marktest/Pictures/shot.png')
    expect(result.html).not.toContain('/var/tmp/marktest/Pictures/shot.png')
    expect(result.embedded).toBe(1)
  })

  it('strips file:/// URLs and embeds the referenced file', async () => {
    vi.mocked(ipcFs.stat).mockResolvedValue(statFile(PNG_BYTES.length))
    vi.mocked(ipcFs.readBinary).mockResolvedValue(PNG_BYTES)

    await embedLocalImages(img('file:///var/tmp/marktest/shot.png'), null)

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

    await embedLocalImages(img('C:\\marktest\\shot.png'), null)

    expect(ipcFs.stat).toHaveBeenCalledWith('C:/marktest/shot.png')
  })

  it('normalizes extended-prefix paths and drops the prefix', async () => {
    vi.mocked(ipcFs.stat).mockResolvedValue(statFile(PNG_BYTES.length))
    vi.mocked(ipcFs.readBinary).mockResolvedValue(PNG_BYTES)

    await embedLocalImages(img('\\\\?\\C:\\marktest\\shot.png'), null)

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
