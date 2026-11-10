// FILE: src/renderer/src/util/documentSnapshot.js
// START_MODULE_CONTRACT
//   PURPOSE: Collect complete committed text and format for one live document lifetime.
//   SCOPE: Transient owner tokens, mounted editing-surface registrations and IME-first immutable text/format snapshots.
//   DEPENDS: documentFormat; surface adapters own model/history integration.
//   LINKS: M-011, M-012; C-SAVE-CLOSE-DATA-SAFETY T-001.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   createDocumentToken - fresh nonpersistent document lifetime.
//   documentOwner - identity for a live tab (also supports directly constructed tabs).
//   registerDocumentSurface - register actual rendered ownership; returns exact cleanup.
//   inspectDocumentComposition - inspect every target pane without extracting text.
//   captureDocumentSnapshot - fail-closed complete-model snapshot and pending-text commit.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   LAST_CHANGE: 2026-11-10 C-SAVE-CLOSE-DATA-SAFETY: fresh complete model and IME-first lifetime ownership.
// END_CHANGE_SUMMARY

import { captureDocumentFormat, recomputeDocumentSaved } from './documentFormat'

let serial = 0
const surfaces = new Map()
export const createDocumentToken = () => `document-${Date.now()}-${++serial}`
export const documentOwner = tab => ({ id: tab.id, documentToken: tab.documentToken ||= createDocumentToken() })
const matches = (a, b) => a && b && a.id === b.id && a.documentToken === b.documentToken
const surfaceOwner = entry => typeof entry.owner === 'function' ? entry.owner() : entry.owner

export const registerDocumentSurface = (owner, adapter) => {
  const key = Symbol('document surface')
  surfaces.set(key, { owner, adapter })
  return () => surfaces.delete(key)
}

export const inspectDocumentComposition = owners => ({
  composingOwners: owners.filter(owner => [...surfaces.values()].some(entry => matches(surfaceOwner(entry), owner) && entry.adapter.isComposing()))
})

export const captureDocumentSnapshot = (store, owner) => {
  const tab = store.tabs.find(tab => matches(documentOwner(tab), owner))
  if (!tab) return { status: 'stale', owner }
  const entries = [...surfaces.values()].filter(entry => matches(surfaceOwner(entry), owner))
  if (entries.some(entry => entry.adapter.isComposing())) return { status: 'composing', owner }
  const authoritative = entries.filter(entry => entry.adapter.isAuthoritative?.() !== false)
  // A mounted outgoing surface cannot impersonate a newly selected/reopened tab.
  if ((entries.length && !authoritative.length) || (!entries.length && surfaces.size && store.currentFile?.id === owner.id)) {
    return { status: 'unavailable', owner }
  }
  if (authoritative.length > 1) return { status: 'unavailable', owner }
  if (authoritative.length) {
    let markdown
    try { markdown = authoritative[0].adapter.captureCommitted() } catch { return {status:'unavailable',owner} }
    if (typeof markdown !== 'string' || !matches(documentOwner(tab), owner)) return { status: 'unavailable', owner }
    if (markdown !== tab.markdown) {
      tab.markdown = markdown
      tab.contentRevision = (tab.contentRevision || 0) + 1
      recomputeDocumentSaved(tab)
    }
  }
  let format
  try { format = captureDocumentFormat(tab) } catch (error) { return { status: 'format-error', owner, code: error.message } }
  return { status: 'ready', snapshot: Object.freeze({
    ...owner, revision: tab.contentRevision || 0, sourcePath: tab.pathname || '',
    format, markdown: tab.markdown, filename: tab.filename, isSaved: !!tab.isSaved,
    historyId: tab.history?.stack?.[tab.history.lastEditIndex]?.id
  }) }
}
