// FILE: tests/renderer/muya/diagram-appearance-menu.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Verify the real Muya appearance menu preserves document/history boundaries and keyboard state.
//   SCOPE: Writable/read-only choices, source isolation, undo/redo, pending edits, focus, missing custom colors, stale targets and teardown.
//   DEPENDS: Vitest, real Muya, real Pele.
//   LINKS: .grace/changes/archive/C-62 T-002; .grace/verification/runtime.xml V-M-012.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   SOURCE - two independent diagrams surrounded by unchanged prose.
//   editors - editors owned by this test and released after each case.
//   mount - real Muya harness that waits for initial Pele insertion.
//   open - open one figure's actual appearance control.
//   choose - click a named menu radio option.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-18 C-62: real-editor appearance behavior and lifecycle regressions.
// END_CHANGE_SUMMARY
import { afterEach, describe, expect, it, vi } from 'vitest'
import Muya from 'muya/lib'
import ExportHtml from 'muya/lib/utils/exportHtml'
vi.mock('muya/lib/renderers', () => ({ default: async () => import('pele') }))

const SOURCE = '# Report\n\nBefore unchanged.\n\n```mermaid\nflowchart LR\nA[Alpha] --> B[Beta]\n```\n\nAfter unchanged.\n\n```mermaid\npie\n"One": 1\n"Two": 2\n```\n'
const editors = []
async function mount(markdown = SOURCE) {
  const element = document.createElement('div')
  document.body.appendChild(element)
  const muya = new Muya(element, { markdown })
  editors.push(muya)
  await vi.waitFor(() => expect(muya.container.querySelectorAll('.ag-pele-preview > svg')).toHaveLength(2))
  return muya
}
function open(muya, index = 0) {
  const button = muya.container.querySelectorAll('.ag-diagram-appearance')[index]
  button.click()
  return button
}
function choose(mode) { document.querySelector(`.ag-diagram-appearance-option[data-mode="${mode}"]`).click() }
afterEach(() => {
  for (const muya of editors.splice(0)) {
    muya.diagramAppearance.destroy()
    clearTimeout(muya.contentState.historyTimer)
    muya.contentState.stateRender.pelePipeline.destroy()
    muya.contentState.clear()
    muya.resize.destroy()
    muya.eventCenter.detachAllDomEvents()
    muya.container.remove()
  }
})

describe('diagram appearance menu in real Muya', () => {
  it('opens/dismisses without a document/history change and restores focus', async () => {
    const muya = await mount()
    const before = muya.getMarkdown()
    const index = muya.contentState.history.index
    const button = open(muya)
    expect(button.getAttribute('aria-expanded')).toBe('true')
    expect(document.querySelector('[data-mode="custom"]').disabled).toBe(true)
    document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    const outsideKeyup = vi.fn()
    document.addEventListener('keyup', outsideKeyup)
    document.activeElement.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', bubbles: true, cancelable: true }))
    document.removeEventListener('keyup', outsideKeyup)
    expect(outsideKeyup).not.toHaveBeenCalled()
    expect(document.querySelector('.ag-diagram-appearance-menu')).toBeNull()
    expect(document.activeElement).toBe(button)
    expect(muya.getMarkdown()).toBe(before)
    expect(muya.contentState.history.index).toBe(index)
  })
  it('stores one isolated edit, and undo/redo restore the mode and original source', async () => {
    const muya = await mount()
    const before = muya.getMarkdown()
    const state = muya.contentState
    const index = state.history.index
    const changed = vi.fn()
    muya.on('change', changed)
    open(muya); choose('light')
    expect(muya.getMarkdown()).toBe(before.replace('```mermaid\n', '```mermaid\n%% mark:appearance light %%\n'))
    expect(state.history.index).toBe(index + 1)
    expect(changed).toHaveBeenCalledTimes(1)
    expect(muya.container.querySelectorAll('.ag-pele-preview')[1].dataset.diagramAppearance).toBe('auto')
    state.history.undo()
    expect(muya.getMarkdown()).toBe(before)
    state.history.redo()
    expect(muya.getMarkdown()).toContain('%% mark:appearance light %%')
    const sameIndex = state.history.index
    open(muya); choose('light')
    expect(state.history.index).toBe(sameIndex)
  })
  it('keeps a pending human edit as a separate undo step', async () => {
    const muya = await mount()
    const state = muya.contentState
    const paragraph = state.blocks[1].children[0]
    paragraph.text += ' Pending human edit.'
    state.cursor = { start: { key: paragraph.key, offset: 3 }, end: { key: paragraph.key, offset: 9 }, isEdit: true }
    const edited = muya.getMarkdown()
    const cursor = state.getMuyaIndexCursor()
    open(muya); choose('dark')
    expect(state.getMuyaIndexCursor()).toEqual(cursor)
    state.history.undo()
    expect(muya.getMarkdown()).toBe(edited)
    state.history.undo()
    expect(muya.getMarkdown()).toBe(SOURCE)
  })
  it('retains author YAML and enables Custom when a palette is defined', async () => {
    const custom = SOURCE.replace('flowchart LR', '---\nconfig:\n  themeVariables:\n    primaryColor: "#ffe0b2"\n---\nflowchart LR')
    const muya = await mount(custom)
    open(muya)
    expect(document.querySelector('[data-mode="custom"]').disabled).toBe(false)
    choose('custom')
    expect(muya.getMarkdown()).toContain('primaryColor: "#ffe0b2"\n---\n%% mark:appearance custom %%')
    expect(muya.container.querySelector('.ag-pele-preview').style.getPropertyValue('--pele-surface')).toBe('#ffe0b2')
  })
  it('maps a source-code selection past an inserted metadata line without changing selected text', async () => {
    const muya = await mount()
    const figure = muya.container.querySelector('figure[data-role="MERMAID"]')
    const source = muya.diagramAppearance.source(figure.id)
    const line = source.code.children.find(line => line.text.includes('Alpha'))
    const offset = line.text.indexOf('Alpha')
    muya.contentState.cursor = { start: { key: line.key, offset }, end: { key: line.key, offset: offset + 5 }, noHistory: true }
    open(muya); choose('light')
    const cursor = muya.contentState.cursor
    const selected = muya.contentState.getBlock(cursor.start.key).text.slice(cursor.start.offset, cursor.end.offset)
    expect(selected).toBe('Alpha')
  })
  it('keeps read-only choices view-only, source-scoped and exportable', async () => {
    const muya = await mount()
    muya.container.setAttribute('aria-readonly', 'true')
    const before = muya.getMarkdown()
    const index = muya.contentState.history.index
    const changed = vi.fn(); muya.on('change', changed)
    open(muya)
    expect(document.querySelector('.ag-diagram-appearance-readonly')).not.toBeNull()
    choose('dark')
    expect(muya.getMarkdown()).toBe(before)
    expect(muya.contentState.history.index).toBe(index)
    expect(changed).not.toHaveBeenCalled()
    expect(muya.container.querySelector('.ag-pele-preview').dataset.diagramAppearance).toBe('dark')
    const figure = muya.container.querySelector('figure[data-role="MERMAID"]')
    const source = muya.diagramAppearance.source(figure.id).text
    expect(muya.diagramAppearance.getExportOverride(0, source)).toBe('dark')
    expect(muya.diagramAppearance.getOverride(figure.id, source + '\n%% external update')).toBeUndefined()
  })
  it('skips disabled Custom with arrows and keeps native button keys out of editor commands', async () => {
    const muya = await mount()
    const before = muya.getMarkdown()
    const button = open(muya)
    document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }))
    expect(document.activeElement.dataset.mode).toBe('light')
    document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }))
    button.dispatchEvent(new KeyboardEvent('keyup', { key: 'Tab', bubbles: true, cancelable: true }))
    expect(muya.getMarkdown()).toBe(before)
    expect(document.activeElement).toBe(button)
  })
  it('expires a temporary choice when editing is enabled, then persists a new choice normally', async () => {
    const muya = await mount()
    muya.container.setAttribute('aria-readonly', 'true')
    open(muya); choose('dark')
    expect(muya.getMarkdown()).toBe(SOURCE)
    muya.container.removeAttribute('aria-readonly')
    await vi.waitFor(() => expect(muya.container.querySelector('.ag-pele-preview').dataset.diagramAppearance).toBe('auto'))
    expect(muya.getMarkdown()).toBe(SOURCE)
    open(muya)
    expect(document.querySelector('.ag-diagram-appearance-option[aria-checked="true"]').dataset.mode).toBe('auto')
    choose('dark')
    expect(muya.getMarkdown()).toContain('%% mark:appearance dark %%')
  })
  it('exports independent read-only choices through actual Markdown parsing, including a nested fence', async () => {
    const code = 'flowchart LR\nA[Alpha] --> B[Beta]'
    const nested = '# Nested\n\n> ```mermaid\n> ' + code.replaceAll('\n', '\n> ') + '\n> ```\n\n```mermaid\n' + code + '\n```\n'
    const muya = await mount(nested)
    muya.container.setAttribute('aria-readonly', 'true')
    open(muya); choose('dark')
    open(muya, 1); choose('light')
    const exporter = new ExportHtml(muya.getMarkdown(), muya)
    const html = await exporter.generate({ printOptimization: false, title: 'Appearance', extraCss: '', toc: null })
    const result = document.createElement('div'); result.innerHTML = html
    expect([...result.querySelectorAll('div.mermaid')].map(element => element.dataset.diagramAppearance)).toEqual(['dark', 'light'])
  })
  it('rejects a removed figure and removes an open menu on teardown', async () => {
    const muya = await mount()
    const before = muya.getMarkdown()
    const button = open(muya)
    const figure = button.closest('figure')
    figure.remove()
    expect(muya.diagramAppearance.choose('light')).toBe(false)
    expect(muya.getMarkdown()).toBe(before)
    open(muya, 0)
    muya.diagramAppearance.destroy()
    expect(document.querySelector('.ag-diagram-appearance-menu')).toBeNull()
  })
})
