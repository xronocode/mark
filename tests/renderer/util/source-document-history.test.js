// FILE: tests/renderer/util/source-document-history.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Verify ephemeral Source lifetime registry with actual CodeMirror.Doc history.
//   SCOPE: Native redo/selection retention, detach/rebind, pruning, token replacement and canonical invalidation.
//   DEPENDS: CodeMirror 5 public Doc API, sourceDocumentHistory.ts.
//   LINKS: M-011, M-012; C-SOURCE-HISTORY-OWNERSHIP.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   owner - Explicit live lifetime fixture without token creation by the registry.
//   view - Minimal public view binding around actual native Docs; no history simulation.
//   write - One separately undoable actual Doc change.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   LAST_CHANGE: 2026-11-11 C-SOURCE-HISTORY-OWNERSHIP: pin native Doc isolation and retirement.
// END_CHANGE_SUMMARY
import CodeMirror from 'codemirror/lib/codemirror'
import { createSourceDocumentHistory } from '@/util/sourceDocumentHistory'
const owner = (id, documentToken = id + '-lifetime') => ({ id, documentToken })
const view = () => {
  let doc = new CodeMirror.Doc('unbound')
  return { getDoc: () => doc, getOption: name => name === 'direction' ? 'ltr' : null,
    swapDoc: next => { const old = doc; doc = next; return old } }
}
const write = (doc, text) => { doc.changeGeneration(true); doc.replaceRange(text, { line: 0, ch: doc.getValue().length }, undefined, '+input') }
it('retains real per-document undo, redo and reversed selection without serializing docs on tabs', () => {
  const a = owner('a'); const b = owner('b'); const store = { tabs: [a, b] }
  const registry = createSourceDocumentHistory(store); const cm = view()
  const first = registry.bind(cm, a, 'A').doc
  write(first, '1'); write(first, '2'); first.undo(); first.setSelection({ line: 0, ch: 2 }, { line: 0, ch: 0 })
  const second = registry.bind(cm, b, 'B').doc; write(second, 'x')
  expect(registry.bind(cm, a, 'A1')).toMatchObject({ restored: true, doc: first })
  expect(first.getCursor('anchor')).toMatchObject({ ch: 2 }); expect(first.getCursor('head')).toMatchObject({ ch: 0 })
  first.redo(); expect(first.getValue()).toBe('A12')
  expect(registry.bind(cm, b, 'Bx').doc).toBe(second); second.undo(); expect(second.getValue()).toBe('B')
  expect(Object.keys(store.tabs[0])).toEqual(['id', 'documentToken'])
})
it('detaches for remount, and prunes lifetimes that closed while Source was absent', () => {
  const a = owner('a'); const store = { tabs: [a] }; const registry = createSourceDocumentHistory(store); const cm = view()
  const doc = registry.bind(cm, a, 'A').doc; write(doc, '1')
  registry.release(cm); expect(cm.getDoc()).not.toBe(doc)
  const secondView = view(); expect(createSourceDocumentHistory(store).bind(secondView, a, 'A1').doc).toBe(doc)
  registry.release(secondView); store.tabs = []
  createSourceDocumentHistory(store)
  store.tabs = [a]
  expect(registry.bind(view(), a, 'A1').doc.historySize()).toEqual({ undo: 0, redo: 0 })
})
it('refuses history reuse for same id/new token or same token/unrelated id', () => {
  const old = owner('a'); const replacement = owner('a', 'new-lifetime'); const other = owner('other', 'new-lifetime')
  const registry = createSourceDocumentHistory({ tabs: [old] }); const cm = view()
  write(registry.bind(cm, old, 'A').doc, '1')
  const next = registry.bind(cm, replacement, 'NEW').doc
  next.undo(); expect(next.getValue()).toBe('NEW')
  write(next, 'X')
  const unrelated = registry.bind(cm, other, 'NEWX').doc
  unrelated.undo(); expect(unrelated.getValue()).toBe('NEWX')
})
it('canonical replacement and explicit retirement start without an import history', () => {
  const a = owner('a'); const registry = createSourceDocumentHistory({ tabs: [a] }); const cm = view()
  write(registry.bind(cm, a, 'A').doc, '1')
  const replaced = registry.bind(cm, a, 'REPLACED').doc
  replaced.undo(); expect(replaced.getValue()).toBe('REPLACED')
  write(replaced, '2'); registry.retire(a)
  expect(registry.bind(cm, a, 'REPLACED2').doc.historySize()).toEqual({ undo: 0, redo: 0 })
})
it('compares normalized view bytes while leaving canonical source and checkpoints untouched', () => {
  const a = { ...owner('a'), markdown: '# A\r\n\r\nText\r\n', savedMarkdown: '# A\r\n\r\nText\r\n' }
  const registry = createSourceDocumentHistory({ tabs: [a] }); const cm = view()
  const doc = registry.bind(cm, a, a.markdown).doc
  expect(doc.getValue()).toBe('# A\n\nText\n')
  expect(registry.bind(cm, a, a.markdown)).toMatchObject({ restored: true, doc })
  expect(a.markdown).toBe(a.savedMarkdown); expect(a.markdown).toContain('\r\n')
})
it('retires ordinary history on unified adoption and rejects absent ownership', () => {
  const a = owner('a'); const store = { tabs: [a] }; const registry = createSourceDocumentHistory(store); const cm = view()
  write(registry.bind(cm, a, 'A').doc, '1')
  a.splitSession = { unified: true }; createSourceDocumentHistory(store)
  delete a.splitSession
  expect(registry.bind(cm, a, 'A1').doc.historySize()).toEqual({ undo: 0, redo: 0 })
  expect(() => registry.bind(cm, { id: 'missing' }, 'X')).toThrow('owner is required')
})
