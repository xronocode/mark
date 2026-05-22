/**
 * Tests for src/renderer/src/codeMirror/modes.js
 *
 * Covers: languages array — structure, known entries.
 */

import languages from '@/codeMirror/modes'

describe('languages (modes.js)', () => {
  it('is an array', () => {
    expect(Array.isArray(languages)).toBe(true)
  })

  it('has more than 50 language entries', () => {
    expect(languages.length).toBeGreaterThan(50)
  })

  it('each entry has name, mode, and mime properties', () => {
    for (const lang of languages) {
      expect(typeof lang.name).toBe('string')
      expect(typeof lang.mode).toBe('string')
      expect(typeof lang.mime).toBe('string')
    }
  })

  it('includes javascript', () => {
    const js = languages.find((l) => l.name === 'javascript')
    expect(js).toBeDefined()
    expect(js.mode).toBe('javascript')
    expect(js.mime).toBe('text/javascript')
  })

  it('includes python', () => {
    const py = languages.find((l) => l.name === 'python')
    expect(py).toBeDefined()
    expect(py.mode).toBe('python')
  })

  it('includes rust', () => {
    const rs = languages.find((l) => l.name === 'rust')
    expect(rs).toBeDefined()
    expect(rs.mode).toBe('rust')
  })

  it('includes typescript', () => {
    const ts = languages.find((l) => l.name === 'typescript')
    expect(ts).toBeDefined()
    expect(ts.mode).toBe('javascript')
    expect(ts.mime).toBe('application/typescript')
  })

  it('includes HTML', () => {
    const html = languages.find((l) => l.name === 'html')
    expect(html).toBeDefined()
    expect(html.mode).toBe('htmlmixed')
  })

  it('includes CSS', () => {
    const css = languages.find((l) => l.name === 'css')
    expect(css).toBeDefined()
    expect(css.mode).toBe('css')
  })

  it('includes shell and sh as aliases', () => {
    const sh = languages.find((l) => l.name === 'sh')
    const shell = languages.find((l) => l.name === 'shell')
    expect(sh).toBeDefined()
    expect(shell).toBeDefined()
    expect(sh.mode).toBe(shell.mode)
  })

  it('includes go and golang as aliases', () => {
    const go = languages.find((l) => l.name === 'go')
    const golang = languages.find((l) => l.name === 'golang')
    expect(go).toBeDefined()
    expect(golang).toBeDefined()
    expect(go.mode).toBe(golang.mode)
  })

  it('includes markdown', () => {
    const md = languages.find((l) => l.name === 'markdown')
    expect(md).toBeDefined()
    expect(md.mode).toBe('gfm')
  })

  it('includes json', () => {
    const json = languages.find((l) => l.name === 'json')
    expect(json).toBeDefined()
    expect(json.mode).toBe('javascript')
    expect(json.mime).toBe('application/json')
  })

  it('includes LaTeX', () => {
    const latex = languages.find((l) => l.name === 'LaTeX')
    expect(latex).toBeDefined()
    expect(latex.mode).toBe('stex')
  })

  it('includes yaml', () => {
    const yaml = languages.find((l) => l.name === 'yaml')
    expect(yaml).toBeDefined()
    expect(yaml.mode).toBe('yaml')
  })

  it('includes dockerfile', () => {
    const docker = languages.find((l) => l.name === 'dockerfile')
    expect(docker).toBeDefined()
    expect(docker.mode).toBe('dockerfile')
  })

  it('includes sql', () => {
    const sql = languages.find((l) => l.name === 'sql')
    expect(sql).toBeDefined()
    expect(sql.mode).toBe('sql')
  })

  it('all mime types are strings', () => {
    for (const lang of languages) {
      expect(typeof lang.mime).toBe('string')
      expect(lang.mime.length).toBeGreaterThan(0)
    }
  })
})
