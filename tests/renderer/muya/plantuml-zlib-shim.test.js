// FILE: tests/renderer/muya/plantuml-zlib-shim.test.js
// START_MODULE_CONTRACT
//   PURPOSE: Pin the complexity f-015 zlib fix — the `zlib` resolve alias in vite.config.js and vitest.config.ts routes muya's PlantUML transport and the docx PlantUML prepass to the real browser-bundleable shim (_shims/zlib.js), the shim's deflate/inflate round-trip against the Node zlib reference (both directions, decoded parity), the PlantUML text-encoding end-to-end (Diagram.parse → charset reverse → inflate → source) and the docx decode leg (base64 string → inflate → source).
//   SCOPE: src/renderer/src/_shims/zlib.js (behavior), vite.config.js + vitest.config.ts (the alias entries), src/renderer/src/util/exportDocx.js decodePlantUmlSource (the Buffer-free call shape), muya/lib/parser/render/plantuml.js (the encode consumer).
//   DEPENDS: Vitest + jsdom; node:zlib as the reference implementation; the muya Diagram class (imported through the browser alias graph).
//   LINKS: complexity f-015 (2026-11-25 audit); src/renderer/src/_shims/zlib.js; vite.config.js; vitest.config.ts; muya/lib/parser/render/plantuml.js; util/exportDocx.js.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   SAMPLES - round-trip corpus: empty, ASCII diagram, Cyrillic source, long repeats.
//   __dirname - test file directory for repo-relative source reads.
//   REPO_ROOT - repository root for the vite/vitest alias map reads.
// END_MODULE_MAP

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import nodeZlib from 'node:zlib'
import shimZlib, { deflateSync, inflateSync } from 'zlib'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '../../..')

const SAMPLES = [
  '',
  'A',
  'Alice -> Bob: Authentication request',
  '@startuml\nAlice -> Bob: Authentication Request\nBob --> Alice: Authentication Response\n@enduml',
  'Лиза открыла класс. Учитель класса — среднее тире.\n@startuml\nблок — диаграмма\n@enduml',
  'ab'.repeat(20000),
  JSON.stringify({
    rows: 30,
    columns: 6,
    cells: Array.from({ length: 180 }, (_, k) => `cell-${k}-значение`)
  })
]

describe('zlib shim round-trips against the Node reference (complexity f-015)', () => {
  it('deflateSync output inflates back with node zlib (shim → node)', () => {
    for (const source of SAMPLES) {
      const stream = deflateSync(source, { level: 3 }).toString('base64')
      const bytes = Buffer.from(stream, 'base64')
      expect(nodeZlib.inflateSync(bytes).toString('utf8')).toBe(source)
    }
  })

  it('node zlib output inflates back with the shim (node → shim)', () => {
    for (const source of SAMPLES) {
      for (const level of [1, 3, 6, 9]) {
        const stream = nodeZlib.deflateSync(Buffer.from(source, 'utf8'), { level })
        expect(inflateSync(new Uint8Array(stream)).toString('utf8')).toBe(source)
      }
    }
  })

  it('shim inflate accepts the base64 string the docx prepass hands it', () => {
    for (const source of SAMPLES) {
      const stream = deflateSync(source, { level: 3 }).toString('base64')
      expect(inflateSync(stream).toString('utf8')).toBe(source)
    }
  })

  it('the shim imports no Node builtins (bundleable for the browser)', () => {
    const source = readFileSync(resolve(REPO_ROOT, 'src/renderer/src/_shims/zlib.js'), 'utf8')
    expect(source).not.toMatch(/from ['"](?:node:)?zlib['"]/)
    expect(source).not.toMatch(/require\(['"](node:)?zlib['"]\)/)
  })

  it('vite and vitest route bare zlib to the browser shim (complexity f-015 structural pin)', () => {
    const vite = readFileSync(resolve(REPO_ROOT, 'vite.config.js'), 'utf8')
    const vitest = readFileSync(resolve(REPO_ROOT, 'vitest.config.ts'), 'utf8')
    expect(vite).toMatch(/zlib: resolve\(__dirname, 'src\/renderer\/src\/_shims\/zlib\.js'\)/)
    expect(vitest).toMatch(/zlib: resolve\(__dirname, 'src\/renderer\/src\/_shims\/zlib\.js'\)/)
  })
})

describe('the PlantUML consumers ride the shim', () => {
  // The transformation close to base64 (muya plantuml.js encode).
  const CHARSET_IN = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  const CHARSET_OUT = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_'

  const reverseCharset = (encoded) =>
    [...encoded]
      .map((char) => {
        const index = CHARSET_OUT.indexOf(char)
        expect(index).toBeGreaterThanOrEqual(0)
        return CHARSET_IN[index]
      })
      .join('')

  it('Diagram.parse produces the PlantUML text encoding and it decodes back (encode consumer)', async () => {
    const Diagram = (await import('muya/lib/parser/render/plantuml')).default
    for (const source of SAMPLES.slice(1)) {
      const diagram = Diagram.parse(source)
      expect(diagram.encodedInput).not.toBe('')
      const base64 = reverseCharset(diagram.encodedInput)
      expect(inflateSync(base64).toString('utf8')).toBe(source)
      // The reference inflator decodes the same stream (interop with the
      // plantuml.com server's deflate decoder).
      const bytes = Buffer.from(base64, 'base64')
      expect(nodeZlib.inflateSync(bytes).toString('utf8')).toBe(source)
    }
  })

  it('the docx decode leg recovers the literal source through the shim (decode consumer)', async () => {
    const Diagram = (await import('muya/lib/parser/render/plantuml')).default
    const source = '@startuml\nAlice -> Bob: Authentication Request\n@enduml'
    const encoded = `~1${Diagram.parse(source).encodedInput}`
    // Mirror of decodePlantUmlSource (util/exportDocx.js) with the
    // Buffer-free call shape: the base64 string rides in directly.
    const tail = encoded.startsWith('~1') ? encoded.slice(2) : encoded
    const base64 = reverseCharset(tail)
    expect(inflateSync(base64).toString('utf8')).toBe(source)
  })

  it('the default export keeps the Node call surface', () => {
    expect(typeof shimZlib.deflateSync).toBe('function')
    expect(typeof shimZlib.inflateSync).toBe('function')
    const stream = shimZlib.deflateSync('roundtrip', { level: 3 })
    expect(stream.toString('base64')).toBe(deflateSync('roundtrip').toString('base64'))
    expect(shimZlib.inflateSync(stream).toString('utf8')).toBe('roundtrip')
  })
})
