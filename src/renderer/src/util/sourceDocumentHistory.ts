// FILE: src/renderer/src/util/sourceDocumentHistory.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Retain ordinary Source CodeMirror documents only for their live document lifetime.
//   SCOPE: Store-scoped ephemeral Doc registry, canonical replacement, detach/rebind and retirement; no persistence, token creation or saved-state authority.
//   DEPENDS: CodeMirror 5 public Doc/getDoc/swapDoc API.
//   LINKS: M-011, M-012; C-SOURCE-HISTORY-OWNERSHIP.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   createSourceDocumentHistory - Obtain the store-local ordinary Source lifetime registry.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   LAST_CHANGE: 2026-11-11 C-SOURCE-HISTORY-OWNERSHIP: detached native Docs preserve independent history and selections.
// END_CHANGE_SUMMARY
// CodeMirror 5 ships JavaScript without declarations; the public boundary is typed below.
// @ts-expect-error Missing vendor declarations, without adding a new dependency.
import CodeMirror from 'codemirror/lib/codemirror'

type Owner = Readonly<{ id: string; documentToken: string }>
type SourceDoc = { getValue(): string }
type SourceEditor = {
  getDoc(): SourceDoc
  getOption(name: string): unknown
  swapDoc(doc: SourceDoc): SourceDoc
}
type SourceStore = { tabs: Array<{ id: string; documentToken?: string; splitSession?: { unified?: boolean } }> }
type Binding = { doc: SourceDoc; serialization: string; restored: boolean }
type Registry = {
  bind(cm: SourceEditor, owner: Owner, markdown: string): Binding
  retain(liveOwners: Owner[]): void
  release(cm: SourceEditor): boolean
  retire(owner: Owner): void
}
const registries = new WeakMap<SourceStore, Registry>()
const sameOwner = (a: Owner, b: Owner) => a.id === b.id && a.documentToken === b.documentToken
const normalized = (markdown: string) => markdown.replace(/\r\n?/g, '\n')
const nativeDocs = CodeMirror as { Doc: new (markdown: string, mode: unknown, firstLine?: number, lineSeparator?: string, direction?: unknown) => SourceDoc }
const newDoc = (cm: SourceEditor, markdown: string): SourceDoc =>
  new nativeDocs.Doc(markdown, cm.getOption('mode'), undefined, undefined, cm.getOption('direction'))

export const createSourceDocumentHistory = (store: SourceStore): Registry => {
  let registry = registries.get(store)
  if (!registry) {
    const docs = new Map<string, { owner: Owner; doc: SourceDoc }>()
    const active = new WeakMap<SourceEditor, Owner>()
    registry = {
      bind(cm, owner, markdown) {
        if (!owner.id || !owner.documentToken) throw Error('Source document owner is required')
        let entry = docs.get(owner.documentToken)
        const restored = !!entry && sameOwner(entry.owner, owner) && entry.doc.getValue() === normalized(markdown)
        if (!restored) {
          entry = { owner: { ...owner }, doc: newDoc(cm, markdown) }
          docs.set(owner.documentToken, entry)
        }
        const doc = entry!.doc
        if (cm.getDoc() !== doc) cm.swapDoc(doc)
        active.set(cm, { ...owner })
        return { doc, serialization: doc.getValue(), restored }
      },
      retain(liveOwners) {
        const live = new Map(liveOwners.map(owner => [owner.documentToken, owner]))
        for (const [token, entry] of docs) {
          const owner = live.get(token)
          if (!owner || !sameOwner(entry.owner, owner)) docs.delete(token)
        }
      },
      release(cm) {
        // A detached Doc keeps its own native history/selection. The disposable
        // view projection must not read or commit potentially composing text.
        const detached = active.has(cm)
        if (detached) cm.swapDoc(newDoc(cm, ''))
        active.delete(cm)
        return detached
      },
      retire(owner) {
        const entry = docs.get(owner.documentToken)
        if (entry && sameOwner(entry.owner, owner)) docs.delete(owner.documentToken)
      }
    }
    registries.set(store, registry)
  }
  // Also prune before remount: tabs may have closed while no Source component
  // existed. Tokens are supplied by the document owner, never minted here.
  registry.retain(store.tabs.filter(tab => tab.documentToken && !tab.splitSession?.unified)
    .map(tab => ({ id: tab.id, documentToken: tab.documentToken! })))
  return registry
}
