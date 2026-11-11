import { describe, it, expect } from 'vitest'
import { captureDocumentFormat } from '@/util/documentFormat'
import { documentOwner, registerDocumentSurface, inspectDocumentComposition, captureDocumentSnapshot } from '@/util/documentSnapshot'

const fixture = () => {
  const tab = { id: 'a', pathname: '/a.md', markdown: 'old', savedMarkdown: 'old', encoding: { encoding: 'utf8', isBom: false }, lineEnding: 'lf', trimTrailingNewline: 3, contentRevision: 0, isSaved: true }
  tab.savedFormat = captureDocumentFormat(tab)
  const store = { tabs: [tab], currentFile: tab }
  return { tab, store, owner: documentOwner(tab) }
}
describe('owned complete document snapshots', () => {
  it('collects pending model text before trusting a clean flag, and does not create a navigation revision', () => {
    const { tab, store, owner } = fixture()
    const stop = registerDocumentSurface(owner, { isComposing: () => false, captureCommitted: () => 'new\n' })
    try {
      const result = captureDocumentSnapshot(store, owner)
      expect(result.status).toBe('ready')
      expect(result.snapshot.markdown).toBe('new\n')
      expect(tab.isSaved).toBe(false)
      const revision = tab.contentRevision
      captureDocumentSnapshot(store, owner)
      expect(tab.contentRevision).toBe(revision)
    } finally { stop() }
  })
  it('refuses clean-looking IME without extracting preedit or touching focus', () => {
    const { tab, store, owner } = fixture()
    let captures = 0; let composing = true
    const stop = registerDocumentSurface(owner, { isComposing: () => composing, captureCommitted: () => { captures++; return '完成' } })
    try {
      expect(inspectDocumentComposition([owner]).composingOwners).toEqual([owner])
      expect(captureDocumentSnapshot(store, owner).status).toBe('composing')
      expect(captures).toBe(0); expect(tab.markdown).toBe('old')
      composing = false
      expect(captureDocumentSnapshot(store, owner).snapshot.markdown).toBe('完成')
      expect(captures).toBe(1)
    } finally { stop() }
  })
  it('never lets a reused id inherit an outgoing surface or save identity', () => {
    const { store, owner } = fixture()
    const stop = registerDocumentSurface(owner, { isComposing: () => false, captureCommitted: () => 'wrong' })
    try {
      store.tabs = [{ id: 'a', pathname: '/a.md', markdown: 'reopened' }]
      store.currentFile = store.tabs[0]
      expect(documentOwner(store.tabs[0]).documentToken).not.toBe(owner.documentToken)
      expect(captureDocumentSnapshot(store, owner).status).toBe('stale')
      expect(captureDocumentSnapshot(store, documentOwner(store.tabs[0])).status).toBe('unavailable')
    } finally { stop() }
  })
  it('uses the authoritative source instead of a following rich projection and keeps the full unmounted tail', () => {
    const { store, owner } = fixture()
    const full = '**source**\n' + 'tail\n'.repeat(210000)
    const a = registerDocumentSurface(owner, { isComposing: () => false, isAuthoritative: () => false, captureCommitted: () => { throw Error('following pane read') } })
    const b = registerDocumentSurface(owner, { isComposing: () => false, isAuthoritative: () => true, captureCommitted: () => full })
    try { expect(captureDocumentSnapshot(store, owner).snapshot.markdown).toBe(full) } finally { a(); b() }
  })
})

it('a failed complete-model extraction refuses the operation and preserves the current buffer',()=>{
  const {store,owner}=fixture()
  const stop=registerDocumentSurface(owner,{isComposing:()=>false,captureCommitted:()=>{throw Error('model unavailable')}})
  try {expect(captureDocumentSnapshot(store,owner).status).toBe('unavailable');expect(store.currentFile.markdown).toBe('old')}finally{stop()}
})

it('captures a defensive immutable format after pending owned text', () => {
  const { tab, store, owner } = fixture()
  const stop = registerDocumentSurface(owner, { isComposing: () => false, captureCommitted: () => 'new' })
  try {
    const result = captureDocumentSnapshot(store, owner)
    expect(result.snapshot.format).toEqual({ encoding: 'utf8', isBom: false, lineEnding: 'lf', finalNewline: 3 })
    expect(Object.isFrozen(result.snapshot.format)).toBe(true)
    tab.encoding.isBom = true
    expect(result.snapshot.format.isBom).toBe(false)
  } finally { stop() }
})
