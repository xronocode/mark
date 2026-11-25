// Browser shim for the Node builtin zlib (complexity f-015).
//
// The renderer is a pure browser bundle (see fs-shim.js) and vite serves
// bare `zlib` imports as a browser-external stub that throws before any
// request — which took down both consumers: muya's PlantUML transport
// (muya/lib/parser/render/plantuml.js deflates the diagram source for the
// plantuml.com SVG URL) and the docx PlantUML prepass
// (util/exportDocx.js inflates the encoding back into the literal source).
// Both PlantUML-docx legs share this shim through the `zlib` resolve
// alias in vite.config.js (mirrored in vitest.config.ts).
//
// Minimal viable surface — only the functions those two call sites use:
//   - deflateSync(value, { level }) → { toString('base64' | 'utf8') }
//   - inflateSync(value)            → { toString('base64' | 'utf8') }
// The deflate half is a self-contained fixed-Huffman DEFLATE with a
// greedy LZ77 hash-chain matcher; the inflate half decodes stored, fixed
// and dynamic-Huffman blocks (the plantuml.com server answers with
// dynamic Huffman). Both are wrapped in the RFC 1950 zlib container
// (0x78 0x9C + big-endian adler32) and round-trip against Node's zlib —
// pinned in tests/renderer/muya/plantuml-zlib-shim.test.js. The exact
// byte stream of Node's level-3 encoder is NOT reproduced (only the
// decoded payload is contract), which is all the PlantUML text encoding
// requires: any valid deflate stream decodes to the same diagram source.
//
// No Node builtin imports — this module must stay bundleable for the
// browser (WKCWebView / WebView2), so base64 rides btoa/atob.

const MIN_MATCH = 3
const MAX_MATCH = 258
const WINDOW_SIZE = 32768
const HASH_SIZE = 1 << 15
const MAX_CHAIN = 128

// RFC 1951 fixed-Huffman literal/length code: [code, bit count].
const fixedLiteralCode = (n) => {
  if (n <= 143) return [0x30 + n, 8]
  if (n <= 255) return [0x190 + (n - 144), 9]
  if (n <= 279) return [n - 256, 7]
  return [0xc0 + (n - 280), 8]
}

const LENGTH_BASE = [
  3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67,
  83, 99, 115, 131, 163, 195, 227, 258
]
const LENGTH_EXTRA = [
  0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0
]
const DIST_BASE = [
  1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769,
  1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577
]
const DIST_EXTRA = [
  0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13
]
const CODE_LENGTH_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]

const adler32 = (bytes) => {
  let a = 1
  let b = 0
  for (let i = 0; i < bytes.length; i++) {
    a = (a + bytes[i]) % 65521
    b = (b + a) % 65521
  }
  return ((b << 16) | a) >>> 0
}

const utf8Bytes = (value) => {
  if (value instanceof Uint8Array) return value
  if (typeof value === 'string') return new TextEncoder().encode(value)
  throw new TypeError('zlib shim: expected a string or Uint8Array')
}

// ── deflate (fixed Huffman + greedy LZ77) ────────────────────────────

class BitWriter {
  constructor () {
    this.out = []
    this.acc = 0
    this.count = 0
  }

  // Value bits go LSB-first (extra bits, block headers).
  write (value, bits) {
    this.acc |= value << this.count
    this.count += bits
    while (this.count >= 8) {
      this.out.push(this.acc & 0xff)
      this.acc >>>= 8
      this.count -= 8
    }
  }

  // Huffman codes go MSB-first (RFC 1951 3.1.1).
  writeCode (code, bits) {
    for (let i = bits - 1; i >= 0; i--) this.write((code >>> i) & 1, 1)
  }

  finish () {
    if (this.count > 0) this.out.push(this.acc & 0xff)
    return Uint8Array.from(this.out)
  }
}

const hashKey = (bytes, i) =>
  (((bytes[i] << 10) ^ (bytes[i + 1] << 5) ^ bytes[i + 2]) & (HASH_SIZE - 1))

const deflateBytes = (value) => {
  const bytes = utf8Bytes(value)
  const writer = new BitWriter()
  // Single fixed-Huffman block (BFINAL=1, BTYPE=01).
  writer.write(1, 1)
  writer.write(1, 2)

  const head = new Int32Array(HASH_SIZE).fill(-1)
  const prev = new Int32Array(bytes.length).fill(-1)
  const insertPosition = (i) => {
    if (i + MIN_MATCH - 1 >= bytes.length) return
    const key = hashKey(bytes, i)
    prev[i] = head[key]
    head[key] = i
  }

  let i = 0
  while (i < bytes.length) {
    let bestLength = 0
    let bestDistance = 0
    if (i + MIN_MATCH <= bytes.length) {
      const key = hashKey(bytes, i)
      let candidate = head[key]
      let chain = MAX_CHAIN
      const limit = Math.min(MAX_MATCH, bytes.length - i)
      while (candidate !== -1 && chain-- > 0 && i - candidate <= WINDOW_SIZE) {
        let length = 0
        while (length < limit && bytes[candidate + length] === bytes[i + length]) length++
        if (length > bestLength) {
          bestLength = length
          bestDistance = i - candidate
          if (length === limit) break
        }
        candidate = prev[candidate]
      }
    }

    if (bestLength >= MIN_MATCH) {
      let code = LENGTH_BASE.length - 1
      while (LENGTH_BASE[code] > bestLength) code--
      const [litCode, litBits] = fixedLiteralCode(257 + code)
      writer.writeCode(litCode, litBits)
      if (LENGTH_EXTRA[code] > 0) writer.write(bestLength - LENGTH_BASE[code], LENGTH_EXTRA[code])
      let distCode = DIST_BASE.length - 1
      while (DIST_BASE[distCode] > bestDistance) distCode--
      writer.writeCode(distCode, 5)
      if (DIST_EXTRA[distCode] > 0) {
        writer.write(bestDistance - DIST_BASE[distCode], DIST_EXTRA[distCode])
      }
      for (let j = i; j < i + bestLength; j++) insertPosition(j)
      i += bestLength
    } else {
      const [litCode, litBits] = fixedLiteralCode(bytes[i])
      writer.writeCode(litCode, litBits)
      insertPosition(i)
      i++
    }
  }

  const [endCode, endBits] = fixedLiteralCode(256)
  writer.writeCode(endCode, endBits)
  const stream = writer.finish()

  // zlib wrapper (RFC 1950): 0x78 0x9C (32K window, valid check bits) +
  // big-endian adler32 of the raw bytes.
  const wrapped = new Uint8Array(stream.length + 6)
  wrapped[0] = 0x78
  wrapped[1] = 0x9c
  wrapped.set(stream, 2)
  const checksum = adler32(bytes)
  wrapped[stream.length + 2] = (checksum >>> 24) & 0xff
  wrapped[stream.length + 3] = (checksum >>> 16) & 0xff
  wrapped[stream.length + 4] = (checksum >>> 8) & 0xff
  wrapped[stream.length + 5] = checksum & 0xff
  return wrapped
}

// ── inflate (stored + fixed + dynamic Huffman) ───────────────────────

class BitReader {
  constructor (bytes, startBit) {
    this.bytes = bytes
    this.pos = startBit >> 3
    this.acc = 0
    this.count = 0
  }

  read (bits) {
    while (this.count < bits) {
      if (this.pos >= this.bytes.length) throw new Error('unexpected end of stream')
      this.acc |= this.bytes[this.pos++] << this.count
      this.count += 8
    }
    const value = this.acc & ((1 << bits) - 1)
    this.acc >>>= bits
    this.count -= bits
    return value
  }
}

// Canonical Huffman decode table from code lengths (RFC 1951 3.2.2).
const buildHuffman = (lengths) => {
  const maxLength = Math.max(...lengths)
  const count = new Array(maxLength + 1).fill(0)
  for (const len of lengths) if (len > 0) count[len]++
  const first = new Array(maxLength + 1).fill(0)
  let code = 0
  for (let bits = 1; bits <= maxLength; bits++) {
    code = (code + count[bits - 1]) << 1
    first[bits] = code
  }
  const byLength = new Array(maxLength + 1)
  for (let symbol = 0; symbol < lengths.length; symbol++) {
    const len = lengths[symbol]
    if (!len) continue
    ;(byLength[len] ||= []).push(symbol)
  }
  return { maxLength, count, first, byLength }
}

const decodeSymbol = (reader, table) => {
  let code = 0
  for (let bits = 1; bits <= table.maxLength; bits++) {
    code = (code << 1) | reader.read(1)
    const group = table.byLength[bits]
    if (group && code - table.first[bits] < group.length) {
      return group[code - table.first[bits]]
    }
  }
  throw new Error('invalid huffman code')
}

const inflateRaw = (wrapped) => {
  if (wrapped.length < 6) throw new Error('truncated zlib stream')
  const cmf = wrapped[0]
  const flg = wrapped[1]
  if ((cmf & 0x0f) !== 8) throw new Error('unexpected compression method')
  if (((cmf << 8) | flg) % 31 !== 0) throw new Error('bad zlib header')
  const out = []

  const reader = new BitReader(wrapped, 16)
  let final = 0
  do {
    final = reader.read(1)
    const type = reader.read(2)
    if (type === 0) {
      // Stored: drop to byte boundary, LEN/NLEN, raw copy.
      reader.acc = 0
      reader.count = 0
      const len = reader.bytes[reader.pos] | (reader.bytes[reader.pos + 1] << 8)
      reader.pos += 4
      for (let i = 0; i < len; i++) out.push(reader.bytes[reader.pos + i])
      reader.pos += len
    } else {
      let literalTable
      let distanceTable
      if (type === 1) {
        const fixedLengths = new Array(288)
        for (let i = 0; i < 288; i++) {
          fixedLengths[i] = i <= 143 ? 8 : i <= 255 ? 9 : i <= 279 ? 7 : 8
        }
        literalTable = buildHuffman(fixedLengths)
        distanceTable = buildHuffman(new Array(30).fill(5))
      } else {
        const hlit = reader.read(5) + 257
        const hdist = reader.read(5) + 1
        const hclen = reader.read(4) + 4
        const codeLengths = new Array(19).fill(0)
        for (let i = 0; i < hclen; i++) codeLengths[CODE_LENGTH_ORDER[i]] = reader.read(3)
        const codeLengthTable = buildHuffman(codeLengths)
        const lengths = []
        while (lengths.length < hlit + hdist) {
          const symbol = decodeSymbol(reader, codeLengthTable)
          if (symbol < 16) {
            lengths.push(symbol)
          } else if (symbol === 16) {
            if (!lengths.length) throw new Error('repeat with no previous length')
            const repeat = 3 + reader.read(2)
            for (let i = 0; i < repeat; i++) lengths.push(lengths[lengths.length - 1])
          } else if (symbol === 17) {
            const repeat = 3 + reader.read(3)
            for (let i = 0; i < repeat; i++) lengths.push(0)
          } else {
            const repeat = 11 + reader.read(7)
            for (let i = 0; i < repeat; i++) lengths.push(0)
          }
        }
        literalTable = buildHuffman(lengths.slice(0, hlit))
        distanceTable = buildHuffman(lengths.slice(hlit))
      }

      for (;;) {
        const symbol = decodeSymbol(reader, literalTable)
        if (symbol < 256) {
          out.push(symbol)
        } else if (symbol === 256) {
          break
        } else {
          const lengthIndex = symbol - 257
          const length = LENGTH_BASE[lengthIndex] + reader.read(LENGTH_EXTRA[lengthIndex])
          const distSymbol = decodeSymbol(reader, distanceTable)
          const distance = DIST_BASE[distSymbol] + reader.read(DIST_EXTRA[distSymbol])
          const start = out.length - distance
          if (start < 0) throw new Error('distance before start')
          // Overlapping copies must go byte by byte.
          for (let i = 0; i < length; i++) out.push(out[start + i])
        }
      }
    }
  } while (!final)

  return Uint8Array.from(out)
}

const inflateBytes = (value) => {
  let bytes
  if (value instanceof Uint8Array) {
    bytes = value
  } else if (value && value.bytes instanceof Uint8Array) {
    // A shimResult from deflateSync — Node lets inflateSync consume
    // deflateSync's Buffer, the shim keeps that ergonomics.
    bytes = value.bytes
  } else if (typeof value === 'string') {
    // The docx prepass historically handed Buffer.from(base64, 'base64');
    // the renderer has no Buffer (step-8j), so the base64 string rides in
    // directly. atob is the browser decode; Latin-1 maps bytes 1:1.
    const binary = atob(value)
    bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  } else {
    throw new TypeError('zlib shim: expected a Uint8Array or a base64 string')
  }
  const raw = inflateRaw(bytes)
  const expected =
    ((bytes[bytes.length - 4] << 24) |
      (bytes[bytes.length - 3] << 16) |
      (bytes[bytes.length - 2] << 8) |
      bytes[bytes.length - 1]) >>> 0
  if (adler32(raw) !== expected) throw new Error('adler32 mismatch')
  return raw
}

// ── the Buffer-less surface both call sites consume ──────────────────

const toBinaryString = (bytes) => {
  let binary = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return binary
}

const fromBinaryString = (binary) => {
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

const asText = (bytes, encoding) => {
  if (encoding === 'utf8' || encoding === 'utf-8' || encoding === undefined) {
    return new TextDecoder().decode(bytes)
  }
  if (encoding === 'base64') return btoa(toBinaryString(bytes))
  if (encoding === 'binary' || encoding === 'latin1') return toBinaryString(bytes)
  throw new TypeError(`zlib shim: unsupported encoding ${encoding}`)
}

// Node's zlib.deflateSync/inflateSync return Buffers; the shim hands back
// a minimal { toString } carrying the encodings the two call sites use.
const shimResult = (bytes) => ({
  toString: (encoding) => asText(bytes, encoding),
  // Raw byte access for anything Buffer-shaped downstream.
  bytes,
  length: bytes.length
})

export const deflateSync = (value, _options = {}) => shimResult(deflateBytes(value))
export const inflateSync = (value) => shimResult(inflateBytes(value))

export default { deflateSync, inflateSync }
