// FILE: tests/renderer/util/image-relative-save.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin the C-24 image save path: bitmaps go straight into the document's relative folder with a collision-safe name, and the global folder is never an empty (cwd-relative) path.
//   SCOPE: saveImageToRelativeFolder, resolveImageFolder and the binary branch of moveImageToFolder in src/renderer/src/util/fileSystem.js (START_BLOCK_IMAGE_RELATIVE_SAVE).
//   DEPENDS: src/renderer/src/util/fileSystem.js, node:path (posix) as window.path, Web Crypto, Vitest.
//   LINKS: .grace/changes/active/C-24 R-2/R-3; .grace/verification/runtime.xml V-M-011.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   writes - recorded window.fileUtils.writeFile calls.
//   pngFile - File-like clipboard bitmap with fixed bytes.
// END_MODULE_MAP

import { beforeEach, describe, expect, it, vi } from 'vitest'
import path from 'node:path'

vi.mock('@/util/index', () => ({ isWindows: false, isOsx: true, isLinux: false }))

import { moveImageToFolder, resolveImageFolder, saveImageToRelativeFolder } from '@/util/fileSystem'

let writes
const pngFile = (bytes = [0x89, 0x50, 0x4e, 0x47]) => ({
  name: 'image.png',
  arrayBuffer: async () => new Uint8Array(bytes).buffer
})

beforeEach(() => {
  writes = []
  window.path = path.posix
  window.fileUtils = {
    ensureDir: vi.fn(async () => {}),
    writeFile: vi.fn(async (p, data) => { writes.push({ p, data }) }),
    isImageFile: (p) => /\.(png|jpe?g|gif)$/i.test(p),
    copy: vi.fn(async () => {})
  }
})

describe('saveImageToRelativeFolder', () => {
  it('writes a pasted bitmap into <doc dir>/assets and returns a document-relative path', async () => {
    const rel = await saveImageToRelativeFolder('/notes', 'assets', '/notes/report.md', pngFile())
    expect(window.fileUtils.ensureDir).toHaveBeenCalledWith('/notes/assets')
    expect(writes).toHaveLength(1)
    expect(writes[0].p.startsWith('/notes/assets/')).toBe(true)
    expect(rel).toMatch(/^assets\/\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}-[0-9a-f]{8}-image\.png$/)
  })

  it('resolves against a project root above the document', async () => {
    const rel = await saveImageToRelativeFolder('/proj', 'assets', '/proj/docs/a.md', pngFile())
    expect(writes[0].p.startsWith('/proj/assets/')).toBe(true)
    expect(rel.startsWith('../assets/')).toBe(true)
  })

  it('defaults an empty directory name to assets and rejects absolute names', async () => {
    await saveImageToRelativeFolder('/n', '', '/n/a.md', pngFile())
    expect(writes[0].p.startsWith('/n/assets/')).toBe(true)
    await expect(saveImageToRelativeFolder('/n', '/etc', '/n/a.md', pngFile())).rejects.toThrow('Invalid relative directory name.')
  })

  it('two different bitmaps pasted in the same second get different names', async () => {
    await saveImageToRelativeFolder('/n', 'assets', '/n/a.md', pngFile([1, 2, 3]))
    await saveImageToRelativeFolder('/n', 'assets', '/n/a.md', pngFile([4, 5, 6]))
    expect(writes[0].p).not.toBe(writes[1].p)
  })
})

describe('resolveImageFolder', () => {
  it('keeps a configured folder', () => {
    expect(resolveImageFolder('/pics', '/data')).toBe('/pics')
  })
  it('falls back to <userData>/images instead of an empty, cwd-relative path', () => {
    expect(resolveImageFolder('', '/data')).toBe('/data/images')
  })
  it('throws rather than writing relative to the process cwd', () => {
    expect(() => resolveImageFolder('', '')).toThrow(/No image folder/)
  })
})

describe('moveImageToFolder (binary)', () => {
  it('names the file <timestamp>-<hash8>-<name> inside the output folder', async () => {
    const out = await moveImageToFolder('/n/a.md', pngFile(), '/out')
    expect(out).toMatch(/^\/out\/\d{4}(-\d{2}){5}-[0-9a-f]{8}-image\.png$/)
  })
})
