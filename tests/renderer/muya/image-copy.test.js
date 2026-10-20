// FILE: tests/renderer/muya/image-copy.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin the C-56 T-006 embedded-image copy helpers of muya utils/diagramExport.js — source classification (absolute/relative/file:///asset:// local paths resolved against the document, remote http(s), data: with inline decode, blob:/empty never resolve), the data-URL decoder, the PNG magic-bytes gate, the natural-size canvas PNG re-encoder and the pass-through-vs-convert decision of imageCopyPngBytes.
//   SCOPE: src/muya/lib/utils/diagramExport.js (the T-006 exports) against jsdom with injectable canvas/image/object-URL doubles (the same dependency-injection style as diagram-export.test.js).
//   DEPENDS: vitest + jsdom; muya/lib/utils/diagramExport.
//   LINKS: .grace/changes/archive/C-56 T-006; .grace/verification/runtime.xml V-M-012 scenario-65; e2e twin tests/e2e/diagram-export.spec.ts (embedded-image copy group); consumers editor.vue handleImageCopyAction + ui/imageToolbar.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   JPEG_MAGIC_BYTES - minimal JPEG signature fixture (non-PNG → canvas re-encode path).
//   PNG_BYTES_24x16 - minimal PNG-shaped buffer (8-byte signature + IHDR saying 24×16).
//   toBase64 - small-bytes base64 helper (btoa or Buffer fallback).
//   makeFakeImage - image double with naturalWidth/naturalHeight + decode().
//   makeFakeCanvas - canvas double (drawImage spy, instant PNG toBlob).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-18 C-56 T-006: first version.
// END_CHANGE_SUMMARY

import { describe, expect, it, vi } from 'vitest'
import {
  decodeDataUrl,
  imageBytesToPng,
  imageCopyPngBytes,
  isPngBytes,
  resolveImageCopySource
} from 'muya/lib/utils/diagramExport'

// START_BLOCK_IMAGE_COPY_DOUBLES
const PNG_BYTES_24x16 = (() => {
  const bytes = new Uint8Array(32)
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0)
  bytes.set([0x49, 0x48, 0x44, 0x52], 12) // "IHDR"
  new DataView(bytes.buffer).setUint32(16, 24)
  new DataView(bytes.buffer).setUint32(20, 16)
  return bytes
})()

const JPEG_MAGIC_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46])

const toBase64 = (bytes) => {
  const binary = Array.from(bytes, (b) => String.fromCharCode(b)).join('')
  if (typeof btoa === 'function') return btoa(binary)
  return Buffer.from(bytes).toString('base64')
}

const makeFakeImage = (width = 32, height = 20) => ({
  src: '',
  naturalWidth: width,
  naturalHeight: height,
  width,
  height,
  decode: vi.fn(async () => {})
})

const makeFakeCanvas = () => {
  const drawImage = vi.fn()
  return {
    drawImage,
    canvas: {
      getContext: () => ({ drawImage }),
      toBlob: (cb) => cb({ arrayBuffer: async () => PNG_BYTES_24x16.buffer })
    }
  }
}
// END_BLOCK_IMAGE_COPY_DOUBLES

// START_BLOCK_IMAGE_COPY_SOURCE_TESTS
describe('C-56 T-006 resolveImageCopySource', () => {
  it('classifies absolute local paths (unix and windows) untouched', () => {
    expect(resolveImageCopySource('/Users/<fixture>/img.png')).toEqual({
      kind: 'local',
      path: '/Users/<fixture>/img.png'
    })
    expect(resolveImageCopySource('C:\\docs\\img.png')).toEqual({
      kind: 'local',
      path: 'C:\\docs\\img.png'
    })
    expect(resolveImageCopySource('C:/docs/img.png')).toEqual({
      kind: 'local',
      path: 'C:/docs/img.png'
    })
  })

  it('decodes file:// URLs exactly like the render bridge', () => {
    expect(resolveImageCopySource('file:///Users/<fixture>/my%20img.png')).toEqual({
      kind: 'local',
      path: '/Users/<fixture>/my img.png'
    })
    // Windows file URL — the drive stays.
    expect(resolveImageCopySource('file:///C:/docs/img.png')).toEqual({
      kind: 'local',
      path: 'C:/docs/img.png'
    })
  })

  it('decodes Tauri asset://localhost URLs to the OS path', () => {
    const assetUrl = `asset://localhost/${encodeURIComponent('/Users/<fixture>/assets/logo v2.png')}`
    expect(resolveImageCopySource(assetUrl)).toEqual({
      kind: 'local',
      path: '/Users/<fixture>/assets/logo v2.png'
    })
  })

  it('resolves relative paths against the document directory (.. included)', () => {
    expect(
      resolveImageCopySource('assets/logo.png', { docPath: '/docs/sub/note.md' })
    ).toEqual({ kind: 'local', path: '/docs/sub/assets/logo.png' })
    expect(
      resolveImageCopySource('../shared/x.png', { docPath: '/docs/sub/note.md' })
    ).toEqual({ kind: 'local', path: '/docs/shared/x.png' })
    // Windows separators fold; the drive prefix survives.
    expect(
      resolveImageCopySource('assets\\logo.png', { docPath: 'C:\\docs\\note.md' })
    ).toEqual({ kind: 'local', path: 'C:/docs/assets/logo.png' })
  })

  it('a relative src without a saved document resolves to null (the failure-notice path)', () => {
    expect(resolveImageCopySource('assets/logo.png')).toBeNull()
    expect(resolveImageCopySource('assets/logo.png', { docPath: '' })).toBeNull()
    expect(resolveImageCopySource('note.md', { docPath: 'untitled' })).toBeNull()
  })

  it('classifies remotes, decodes data: URLs inline and never resolves blob:/empty', () => {
    expect(resolveImageCopySource('https://example.com/a.png')).toEqual({
      kind: 'remote',
      url: 'https://example.com/a.png'
    })
    const data = resolveImageCopySource(`data:image/png;base64,${toBase64(PNG_BYTES_24x16)}`)
    expect(data.kind).toBe('data')
    expect(data.mime).toBe('image/png')
    expect(Array.from(data.bytes.slice(0, 8))).toEqual(Array.from(PNG_BYTES_24x16.slice(0, 8)))
    expect(resolveImageCopySource('blob:https://example.com/xyz')).toBeNull()
    expect(resolveImageCopySource('')).toBeNull()
    expect(resolveImageCopySource(null)).toBeNull()
  })
})

describe('C-56 T-006 decodeDataUrl', () => {
  it('decodes base64 payloads with params before ;base64', () => {
    const url = `data:image/png;charset=utf-8;base64,${toBase64(PNG_BYTES_24x16)}`
    const out = decodeDataUrl(url)
    expect(out.mime).toBe('image/png')
    expect(Array.from(out.bytes)).toEqual(Array.from(PNG_BYTES_24x16))
  })

  it('returns null for malformed input and falls back to a default mime', () => {
    expect(decodeDataUrl('data:image/png')).toBeNull() // no comma/payload
    expect(decodeDataUrl('http://x/y.png')).toBeNull()
    expect(decodeDataUrl('data:;base64,!!!not-base64!!!')).toBeNull()
    expect(decodeDataUrl('data:,plain').mime).toBe('application/octet-stream')
  })
})
// END_BLOCK_IMAGE_COPY_SOURCE_TESTS

// START_BLOCK_IMAGE_COPY_PNG_TESTS
describe('C-56 T-006 isPngBytes', () => {
  it('accepts only the 8-byte PNG signature', () => {
    expect(isPngBytes(PNG_BYTES_24x16)).toBe(true)
    expect(isPngBytes(JPEG_MAGIC_BYTES)).toBe(false)
    expect(isPngBytes(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(false) // truncated
    expect(isPngBytes('not bytes')).toBe(false)
  })
})

describe('C-56 T-006 imageBytesToPng', () => {
  it('re-encodes non-PNG bytes on a canvas at NATURAL size', async () => {
    const fake = makeFakeCanvas()
    const img = makeFakeImage(32, 20)
    const objectUrls = []
    const jpeg = new Uint8Array([...JPEG_MAGIC_BYTES, 0, 1, 2, 3, 4, 5, 6, 7])
    const result = await imageBytesToPng(jpeg, {
      mime: 'image/jpeg',
      createCanvas: () => fake.canvas,
      makeImage: () => img,
      makeObjectUrl: (bytes, mime) => {
        objectUrls.push({ bytes, mime })
        return 'blob:mock-1'
      }
    })
    // The object URL wraps the exact bytes with the hint mime.
    expect(objectUrls).toEqual([{ bytes: jpeg, mime: 'image/jpeg' }])
    // Natural size, not a default box.
    expect(result.width).toBe(32)
    expect(result.height).toBe(20)
    expect(fake.drawImage).toHaveBeenCalledWith(img, 0, 0, 32, 20)
    // The re-encoded bytes are the canvas PNG.
    expect(result.bytes).toEqual(PNG_BYTES_24x16)
  })

  it('rejects an image with no natural size (a sizeless SVG) and empty bytes', async () => {
    await expect(imageBytesToPng(new Uint8Array([1, 2, 3]), {
      createCanvas: () => makeFakeCanvas().canvas,
      makeImage: () => makeFakeImage(0, 0),
      makeObjectUrl: () => 'blob:mock-2'
    })).rejects.toThrow(/no natural size/)
    await expect(imageBytesToPng(new Uint8Array(0), {
      createCanvas: () => makeFakeCanvas().canvas,
      makeImage: () => makeFakeImage(),
      makeObjectUrl: () => 'blob:mock-3'
    })).rejects.toThrow(/no image bytes/)
  })
})

describe('C-56 T-006 imageCopyPngBytes (the pass-through gate)', () => {
  it('passes real PNG bytes through untouched with their IHDR size', async () => {
    const canvas = vi.fn(() => makeFakeCanvas().canvas)
    const result = await imageCopyPngBytes(PNG_BYTES_24x16, { createCanvas: canvas })
    // Same bytes — no re-encode, no canvas touched.
    expect(result.bytes).toBe(PNG_BYTES_24x16)
    expect(result.width).toBe(24)
    expect(result.height).toBe(16)
    expect(canvas).not.toHaveBeenCalled()
  })

  it('converts every other format through the canvas', async () => {
    const fake = makeFakeCanvas()
    const result = await imageCopyPngBytes(new Uint8Array([...JPEG_MAGIC_BYTES, 9, 9]), {
      mime: 'image/jpeg',
      createCanvas: () => fake.canvas,
      makeImage: () => makeFakeImage(24, 16),
      makeObjectUrl: () => 'blob:mock-4'
    })
    expect(fake.drawImage).toHaveBeenCalled()
    expect(result.bytes).toEqual(PNG_BYTES_24x16)
  })
})
// END_BLOCK_IMAGE_COPY_PNG_TESTS
