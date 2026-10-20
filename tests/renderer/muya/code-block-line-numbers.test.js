// FILE: tests/renderer/muya/code-block-line-numbers.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin the C-38 T-005 (#1648) code-block line numbers — render on/off, one row per logical line across edits, fence/indent-only scope, the non-editable gutter attrs, the measurement queue, resizeCodeBlockLineNumber sizing, and the un-force-disabled setOptions.
//   SCOPE: START_BLOCK_CODE_LINE_NUMBERS in renderContainerBlock.js, renderLineNumber.js, utils/resizeCodeLineNumber.js, contentState/codeBlockCtrl.js resizeLineNumber, and Muya#setOptions / Muya#refreshCodeBlockLineNumbers.
//   DEPENDS: StateRender (muya/lib/parser/render/index.js) with a mocked renderer loader, muya snabbdom h, codeBlockCtrl mixin, Muya prototype, Vitest + jsdom.
//   LINKS: .grace/changes/archive/C-38 T-005; .grace/verification/runtime.xml V-M-012 scenario-20; tests/e2e/code-block-line-numbers.spec.ts for the laid-out alignment.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   makeCodePre - the pre(languageInput, code>codeContent) block fixture for a given text and functionType.
//   createStateRender - real StateRender with a fake muya and a stubbed renderLeafBlock.
//   renderPre - renders the whole pre block and returns its vnode.
//   findVnode - depth-first vnode search by predicate.
//   buildGutterDom - a detached pre.line-numbers DOM (code > gutter rows + ag-code-content) for util tests.
//   StateRender - muya renderer class under test.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-15 C-38 T-005: initial pin. The render/count/queue cases fail against the pre-C-38 render (gutter commented out, setOptions force-off); the sizing cases fail against the upstream sizer implementation.
// END_CHANGE_SUMMARY

import { afterEach, describe, expect, it, vi } from 'vitest'
import { h } from 'muya/lib/parser/render/snabbdom'
import resizeCodeBlockLineNumber from 'muya/lib/utils/resizeCodeLineNumber'
import codeBlockCtrl from 'muya/lib/contentState/codeBlockCtrl'
import Muya from 'muya/lib'

vi.mock('muya/lib/renderers', () => ({
  default: async () => ({})
}))

const makeCodePre = (text, functionType = 'fencecode') => {
  const pre = { key: 'p1', type: 'pre', functionType, lang: 'js', parent: null, editable: true, children: [] }
  const input = { key: 'i1', type: 'span', functionType: 'languageInput', text: 'js', parent: pre, children: [] }
  const code = { key: 'c1', type: 'code', lang: 'js', parent: pre, children: [] }
  const content = { key: 's1', type: 'span', functionType: 'codeContent', text, lang: 'js', parent: code, children: [] }
  code.children.push(content)
  pre.children.push(input, code)
  return { pre, input, code, content }
}

let StateRender

const createStateRender = async (codeBlockLineNumbers) => {
  if (!StateRender) {
    const mod = await import('muya/lib/parser/render/index')
    StateRender = mod.default
  }
  const sr = new StateRender({
    eventCenter: { dispatch: vi.fn() },
    options: { codeBlockLineNumbers },
    contentState: {
      cursor: { start: { key: 'x' }, end: { key: 'x' } },
      selectedBlock: null,
      selectedTableCells: null
    }
  })
  // Keep leaf rendering out of scope: spans render their raw text.
  sr.renderLeafBlock = (parent, block, activeBlocks, matches, useCache, t) =>
    h(`span#${block.key}.ag-paragraph`, { attrs: {}, dataset: {} }, block.text || '')
  return sr
}

const renderPre = async (text, codeBlockLineNumbers, functionType) => {
  const sr = await createStateRender(codeBlockLineNumbers)
  const blocks = makeCodePre(text, functionType)
  const vnode = sr.renderBlock(null, blocks.pre, [], {}, false, (k) => k)
  return { sr, vnode, blocks }
}

const findVnode = (vnode, predicate) => {
  if (!vnode) return null
  if (predicate(vnode)) return vnode
  for (const child of vnode.children || []) {
    const hit = findVnode(child, predicate)
    if (hit) return hit
  }
  return null
}

const buildGutterDom = (text, rowCount) => {
  const pre = document.createElement('pre')
  pre.className = 'ag-paragraph ag-fence-code line-numbers'
  const code = document.createElement('code')
  const rowsWrapper = document.createElement('span')
  rowsWrapper.className = 'line-numbers-rows'
  const rows = []
  for (let i = 0; i < rowCount; i++) {
    const row = document.createElement('span')
    rows.push(row)
    rowsWrapper.appendChild(row)
  }
  const content = document.createElement('span')
  content.className = 'ag-code-content'
  content.textContent = text
  code.append(rowsWrapper, content)
  pre.appendChild(code)
  document.body.appendChild(pre)
  return { pre, code, rowsWrapper, rows, content }
}

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('code-block line numbers render (C-38 T-005)', () => {
  it('adds .line-numbers to the pre and the gutter rows to the code element when the option is on', async () => {
    const { vnode } = await renderPre('const a = 1\nconst b = 2', true)

    expect(vnode.sel).toMatch(/\.line-numbers/)
    const codeVnode = findVnode(vnode, (v) => (v.sel || '').startsWith('code#c1'))
    expect(codeVnode).toBeTruthy()

    const gutter = codeVnode.children[0]
    expect(gutter.sel).toBe('span.line-numbers-rows')
    // Non-editable, invisible to a11y and selection: the numbers live only
    // in CSS counters on empty spans.
    expect(gutter.data.attrs['aria-hidden']).toBe('true')
    expect(gutter.data.attrs.contenteditable).toBe('false')
    expect(gutter.children).toHaveLength(2)
    expect(gutter.children.every((row) => row.sel === 'span')).toBe(true)

    // The copy button stays a child of the pre itself (after the front icon).
    const copyButton = findVnode(vnode, (v) => v.sel === 'a.ag-code-copy')
    expect(copyButton).toBeTruthy()
    expect(findVnode(codeVnode, (v) => v.sel === 'a.ag-code-copy')).toBeNull()
  })

  it('renders nothing when the option is off', async () => {
    const { vnode } = await renderPre('const a = 1\nconst b = 2', false)
    expect(vnode.sel).not.toMatch(/\.line-numbers/)
    expect(findVnode(vnode, (v) => (v.sel || '').includes('line-numbers-rows'))).toBeNull()
  })

  it('renders one row per logical line across edits (typed text, Enter, paste)', async () => {
    const edits = [
      ['', 1],
      ['const a = 1', 1],
      ['const a = 1\nconst b = 2', 2],
      ['const a = 1\nconst b = 2\nconst c = 3', 3],
      // Enter at the end creates an empty trailing line — it keeps a number.
      ['const a = 1\nconst b = 2\n', 3],
      // Deleting a line merges back.
      ['const a = 1\n', 2]
    ]
    for (const [text, expected] of edits) {
      const { vnode } = await renderPre(text, true)
      const gutter = findVnode(vnode, (v) => (v.sel || '') === 'span.line-numbers-rows')
      expect(gutter.children, `text=${JSON.stringify(text)}`).toHaveLength(expected)
    }
  })

  it('numbers indented code blocks but not html, math, diagram or front-matter sources', async () => {
    for (const functionType of ['indentcode']) {
      const { vnode } = await renderPre('a\nb', true, functionType)
      expect(vnode.sel).toMatch(/\.line-numbers/)
    }
    for (const functionType of ['html', 'multiplemath', 'mermaid', 'frontmatter']) {
      const { vnode } = await renderPre('a\nb', true, functionType)
      expect(vnode.sel, `${functionType} pre must stay gutter-free`).not.toMatch(/\.line-numbers/)
      expect(findVnode(vnode, (v) => (v.sel || '').includes('line-numbers-rows'))).toBeNull()
    }
  })

  it('records every rendered gutter for the post-render measurement, and only those', async () => {
    const { sr, blocks } = await renderPre('a\nb', true)
    expect(sr.lineNumberPreKeys.has(blocks.pre.key)).toBe(true)

    const off = await renderPre('a\nb', false)
    expect(off.sr.lineNumberPreKeys.has(off.blocks.pre.key)).toBe(false)
  })
})

describe('resizeCodeBlockLineNumber sizing (C-38 T-005)', () => {
  it('clears stale measured heights when the code does not wrap (natural one-line rows)', () => {
    const { pre, rows, rowsWrapper } = buildGutterDom('a\nb', 2)
    rows[0].style.height = '44px' // left over from a wrapping configuration
    rowsWrapper.style.top = '3px'

    // jsdom computes a non-wrapping white-space for the span.
    expect(resizeCodeBlockLineNumber(pre)).toBe(true)
    expect(rows[0].style.height).toBe('')
    expect(rows[1].style.height).toBe('')
    expect(rowsWrapper.style.top).toBe('')
  })

  it('bridges wrapped lines: each row height equals its logical line rendered height', () => {
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      whiteSpace: 'pre-wrap',
      lineHeight: '20px',
      fontSize: '14px'
    })
    // Line tops at 0, 20 and 60: the middle logical line wraps to two visual
    // rows (20 and 40), so its number must be 40px tall.
    const rectQueue = [
      { top: 0, bottom: 20, height: 20, left: 0, right: 5, width: 5 },
      { top: 20, bottom: 40, height: 20, left: 0, right: 5, width: 5 },
      { top: 60, bottom: 80, height: 20, left: 0, right: 5, width: 5 }
    ]
    const rangeStub = {
      setStart: vi.fn(),
      setEnd: vi.fn(),
      getClientRects: () => {
        const rect = rectQueue.shift()
        return rect ? [rect] : []
      },
      getBoundingClientRect: () => ({ top: 0, bottom: 0, height: 0, left: 0, right: 0, width: 0 })
    }
    vi.spyOn(document, 'createRange').mockReturnValue(rangeStub)

    const { pre, rows, rowsWrapper } = buildGutterDom('a\nlooooooooooooooong wrapped line\nb', 3)
    expect(resizeCodeBlockLineNumber(pre)).toBe(true)
    // Only differences are applied; the gutter keeps its natural top.
    expect(rowsWrapper.style.top).toBe('')
    expect(rows[0].style.height).toBe('20px')
    expect(rows[1].style.height).toBe('40px')
    // The last row keeps its natural height — nothing is below it.
    expect(rows[2].style.height).toBe('')
  })

  it('skips the empty rect WebKit reports at the previous row end (C-38 T-005 review)', () => {
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      whiteSpace: 'pre-wrap',
      lineHeight: '20px',
      fontSize: '14px'
    })
    const empty = (top) => ({ top, bottom: top + 20, height: 20, left: 90, right: 90, width: 0 })
    const real = (top) => ({ top, bottom: top + 20, height: 20, left: 0, right: 5, width: 5 })
    const rectQueue = [[real(0)], [empty(0), real(20)], [empty(40), real(60)]]
    const rangeStub = {
      setStart: vi.fn(),
      setEnd: vi.fn(),
      getClientRects: () => rectQueue.shift() || [],
      getBoundingClientRect: () => ({ top: 0, bottom: 0, height: 0, left: 0, right: 0, width: 0 })
    }
    vi.spyOn(document, 'createRange').mockReturnValue(rangeStub)

    const { pre, rows } = buildGutterDom('a\nlooooooooooooooong wrapped line\nb', 3)
    expect(resizeCodeBlockLineNumber(pre)).toBe(true)
    expect(rows[0].style.height).toBe('20px')
    expect(rows[1].style.height).toBe('40px')
  })

  it('fails soft (clears heights) when no caret rects exist, e.g. a hidden editor or jsdom', () => {
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      whiteSpace: 'pre-wrap',
      lineHeight: '20px',
      fontSize: '14px'
    })
    const rangeStub = {
      setStart: vi.fn(),
      setEnd: vi.fn(),
      getClientRects: () => [],
      getBoundingClientRect: () => ({ top: 0, bottom: 0, height: 0, left: 0, right: 0, width: 0 })
    }
    vi.spyOn(document, 'createRange').mockReturnValue(rangeStub)

    const { pre, rows } = buildGutterDom('a\nb', 2)
    rows[0].style.height = '20px'
    expect(resizeCodeBlockLineNumber(pre)).toBe(false)
    expect(rows[0].style.height).toBe('')
  })

  it('bails when the gutter and the DOM text disagree (mid-update)', () => {
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      whiteSpace: 'pre-wrap',
      lineHeight: '20px',
      fontSize: '14px'
    })
    const { pre } = buildGutterDom('a\nb\nc', 2) // 3 logical lines, 2 rows
    expect(resizeCodeBlockLineNumber(pre)).toBe(false)
  })

  it('returns false for a pre without gutter or code', () => {
    const pre = document.createElement('pre')
    document.body.appendChild(pre)
    expect(resizeCodeBlockLineNumber(pre)).toBe(false)
  })
})

describe('ContentState#resizeLineNumber dispatch (C-38 T-005)', () => {
  const makeContentState = () => {
    class FakeContentState {}
    codeBlockCtrl(FakeContentState)
    const cs = new FakeContentState()
    cs.stateRender = { lineNumberPreKeys: new Set() }
    cs.muya = {
      options: { codeBlockLineNumbers: true },
      container: null
    }
    return cs
  }

  it('is a no-op when the option is off', () => {
    const cs = makeContentState()
    cs.muya.options.codeBlockLineNumbers = false
    const { pre } = buildGutterDom('a\nb', 2)
    pre.id = 'q1'
    cs.stateRender.lineNumberPreKeys.add('q1')
    cs.resizeLineNumber()
    // The queued keys are not even drained.
    expect(cs.stateRender.lineNumberPreKeys.has('q1')).toBe(true)
  })

  it('measures the queued code blocks and drains the queue', () => {
    const cs = makeContentState()
    const { pre, rows } = buildGutterDom('a\nb', 2)
    rows[0].style.height = '99px' // stale measured height
    pre.id = 'q1'
    cs.stateRender.lineNumberPreKeys.add('q1')
    cs.stateRender.lineNumberPreKeys.add('gone') // removed block → skipped

    cs.resizeLineNumber()
    expect(cs.stateRender.lineNumberPreKeys.size).toBe(0)
    // jsdom (non-wrapping computed style) → the measured path clears heights.
    expect(rows[0].style.height).toBe('')
  })

  it('force mode measures every pre.line-numbers inside this muya container only', () => {
    const cs = makeContentState()
    const mine = buildGutterDom('a\nb', 2)
    const foreign = buildGutterDom('c\nd', 2)
    mine.rows[0].style.height = '99px'
    foreign.rows[0].style.height = '99px'
    const container = document.createElement('div')
    container.appendChild(mine.pre)
    document.body.appendChild(container)
    cs.muya.container = container

    cs.resizeLineNumber(true)
    // Both exist in the document, but only the container one was touched.
    expect(mine.rows[0].style.height).toBe('')
    expect(foreign.rows[0].style.height).toBe('99px')
  })
})

describe('Muya#setOptions / refreshCodeBlockLineNumbers (C-38 T-005)', () => {
  const makeMuyaStub = () => ({
    options: {},
    container: {
      classList: { contains: () => false, add: vi.fn(), remove: vi.fn() }
    },
    contentState: {
      render: vi.fn(),
      resizeLineNumber: vi.fn(),
      turndownConfig: {}
    }
  })

  it('no longer force-disables codeBlockLineNumbers (#1648)', () => {
    const stub = makeMuyaStub()
    Muya.prototype.setOptions.call(stub, { codeBlockLineNumbers: true })
    expect(stub.options.codeBlockLineNumbers).toBe(true)
  })

  it('refreshCodeBlockLineNumbers forces a full gutter re-measure', () => {
    const stub = makeMuyaStub()
    Muya.prototype.refreshCodeBlockLineNumbers.call(stub)
    expect(stub.contentState.resizeLineNumber).toHaveBeenCalledWith(true)
  })
})
