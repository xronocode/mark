// FILE: src/renderer/src/util/documentOperations.js
// START_MODULE_CONTRACT
//   PURPOSE: Coordinate owned snapshot saves and all-or-nothing logical document closure.
//   SCOPE: Attempt/lifetime/text/format/revision correlation, write admission, three-way decisions and final freshness barrier.
//   DEPENDS: documentSnapshot/documentFormat; injected transport, prompts, notices and owned commit callbacks.
//   LINKS: M-011; C-SAVE-CLOSE-DATA-SAFETY T-002/T-003.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   createDocumentOperations - isolated per-store coordinator; run/save/isBusy/invalidate.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   LAST_CHANGE: 2026-11-10 C-SAVE-CLOSE-DATA-SAFETY: correlated writes and IME-first batch barrier.
// END_CHANGE_SUMMARY
import { documentOwner } from './documentSnapshot'
import { captureDocumentFormat, sameDocumentFormat } from './documentFormat'

export const createDocumentOperations = deps => {
  let serial = 0
  let active = null
  const pending = new Map()
  const invalid = new Set()
  const key = owner => owner.documentToken
  const sameOwner = (a,b) => a?.id === b?.id && a?.documentToken === b?.documentToken
  const find = owner => deps.getTabs().find(tab => sameOwner(documentOwner(tab),owner))
  const sameVersion = (a,b) => a && b && sameOwner(a,b) && a.revision === b.revision && a.markdown === b.markdown && a.sourcePath === b.sourcePath && sameDocumentFormat(a.format,b.format)
  const result = (status, owners, reason, request) => {
    const outcome = { status, affectedOwners: owners, reason }
    if (status === 'blocked' || status === 'failed') {
      console.debug(`[DocumentOperations][run][BLOCK_DOCUMENT_OPERATION_REFUSED reason=${reason}]`)
      deps.notify?.(outcome, request)
    }
    return outcome
  }
  const capture = owner => {
    if (invalid.has(key(owner))) return {status:'stale',owner}
    return deps.capture(owner)
  }
  const busy = owner => pending.has(key(owner)) || !!active?.owners.some(o=>sameOwner(o,owner))
  const collision = (pathname,owner) => deps.getTabs().some(tab => !sameOwner(documentOwner(tab),owner) && tab.pathname && (
    deps.samePath ? deps.samePath(tab.pathname,pathname) : tab.pathname === pathname
  ))

  const saveOwned = async (owner, options = {}, attempt = null) => {
    const request = {kind:'save',owners:[owner],saveAs:!!options.saveAs,...options.request}
    if (deps.inspectComposition([owner]).composingOwners.length) return result('blocked',[owner],'composing',request)
    if (pending.has(key(owner)) || (active && active !== attempt)) return result('blocked',[owner],'busy',request)
    if (!attempt) invalid.delete(key(owner))
    const initial = capture(owner)
    if (initial.status !== 'ready') return result('blocked',[owner],initial.status,request)
    const sourcePath = initial.snapshot.sourcePath
    const requestId = `save-${Date.now()}-${++serial}`
    pending.set(key(owner),{ sourcePath, targetPath:sourcePath })
    try {
      let targetPath = sourcePath
      if (!targetPath || options.saveAs) {
        const selected = await deps.chooseTarget({ requestId, documentToken:owner.documentToken, filename:initial.snapshot.filename || 'Untitled.md', defaultPath:deps.defaultPath?.() || null })
        if (selected === null) return result('cancelled',[owner],'picker-cancelled',request)
        if (!selected || selected.requestId !== requestId || selected.documentToken !== owner.documentToken || !selected.pathname) throw Error('Invalid save destination response')
        targetPath = selected.pathname
      }
      const fresh = capture(owner)
      if (fresh.status !== 'ready' || fresh.snapshot.sourcePath !== sourcePath) return result('blocked',[owner],fresh.status === 'composing' ? 'composing' : 'stale',request)
      if (collision(targetPath,owner) || [...pending.entries()].some(([token,write]) => token !== key(owner) && write.targetPath && (deps.samePath ? deps.samePath(write.targetPath,targetPath) : write.targetPath===targetPath))) {
        return result('blocked',[owner],'collision',request)
      }
      pending.set(key(owner),{sourcePath,targetPath})
      const snapshot = Object.freeze({...fresh.snapshot,requestId,targetPath})
      const reply = await deps.writeSnapshot({...snapshot, ownedPaths:deps.getTabs().filter(t=>!sameOwner(documentOwner(t),owner)&&t.pathname).map(t=>({documentToken:documentOwner(t).documentToken,pathname:t.pathname}))})
      if (!reply || reply.requestId !== requestId || !sameOwner(reply,owner) || reply.revision !== snapshot.revision || reply.sourcePath !== sourcePath || reply.pathname !== targetPath || !sameDocumentFormat(reply.format,snapshot.format)) throw Error('Invalid save acknowledgement')
      const current = capture(owner)
      const tab = find(owner)
      if (!tab || current.status !== 'ready' || current.snapshot.sourcePath !== sourcePath) {
        if (tab) { tab.requiresExplicitSave = true; tab.isSaved = false }
        return result('blocked',[owner],current.status === 'composing' ? 'composing' : 'stale',request)
      }
      if (collision(targetPath,owner)) return result('blocked',[owner],'collision',request)
      // The destination belongs to this attempt even when newer edits arrived.
      tab.pathname = reply.pathname
      tab.filename = reply.filename || tab.filename
      const unchanged = sameVersion(current.snapshot,snapshot)
      tab.savedMarkdown = snapshot.markdown
      tab.savedFormat = captureDocumentFormat(snapshot.format)
      tab.requiresExplicitSave = !unchanged
      tab.isSaved = unchanged
      if (unchanged && snapshot.historyId !== undefined) tab.lastSavedHistoryId = snapshot.historyId
      deps.onSaved?.(tab,unchanged)
      if (!unchanged) return result('blocked',[owner],'changed',request)
      return {status:'completed',affectedOwners:[owner],snapshot:Object.freeze({...current.snapshot,sourcePath:targetPath,isSaved:true})}
    } catch (error) {
      const tab=find(owner); if(tab) { tab.isSaved=false; tab.requiresExplicitSave=true }
      const encodingCode = String(error?.message || error).match(/MT_ENC_(?:UNKNOWN|UNSUPPORTED|INVALID_POLICY|UNREPRESENTABLE|MIXED_EOL)/)?.[0]
      if (encodingCode) return result('failed',[owner],encodingCode,request)
      if (String(error?.message || error).includes('MT_DOCUMENT_DESTINATION_OWNED')) return result('blocked',[owner],'collision',request)
      return result('failed',[owner],'write-failed',request)
    } finally { pending.delete(key(owner)) }
  }

  const run = async request => {
    const owners = (request.owners || deps.getTabs().map(documentOwner)).map(o=>({...o}))
    const context = {...request,owners}
    if (deps.inspectComposition(owners).composingOwners.length) return result('blocked',owners,'composing',context)
    if (active || owners.some(owner=>pending.has(key(owner)))) return result('blocked',owners,'busy',context)
    owners.forEach(owner=>invalid.delete(key(owner)))
    const attempt = {owners}
    active = attempt
    try {
      const first = owners.map(capture)
      const bad = first.find(r=>r.status!=='ready')
      if (bad) return result('blocked',owners,bad.status,context)
      const proof = new Map(first.map(r=>[key(r.snapshot),r.snapshot]))
      const dirty = first.filter(r=>!r.snapshot.isSaved).map(r=>r.snapshot)
      const savingOnly = request.kind === 'save-all'
      let decision = 'save'
      if (!savingOnly && dirty.length) decision = request.decision || await deps.confirm({kind:request.kind,snapshots:dirty})
      if (decision === 'cancel') return result('cancelled',owners,'cancelled',context)
      if (!['save','discard'].includes(decision)) return result('failed',owners,'invalid-decision',context)
      if (request.confirmedSnapshots && decision === 'discard') {
        for(const s of request.confirmedSnapshots) proof.set(key(s),s)
      }
      if (decision === 'save') {
        for (const owner of owners) {
          const current = capture(owner)
          if (current.status!=='ready') return result('blocked',owners,current.status,context)
          // Recapture after dialogs: previously clean tabs may have acquired text.
          if (!current.snapshot.isSaved) {
            const saved = await saveOwned(owner,{request:context},attempt)
            if (saved.status!=='completed') return saved
            proof.set(key(owner),saved.snapshot)
          }
        }
      }
      if (!savingOnly) await deps.prepareCommit?.(context)
      if (deps.inspectComposition(owners).composingOwners.length) return result('blocked',owners,'composing',context)
      for (const owner of owners) {
        const current=capture(owner)
        if(current.status!=='ready' || !sameVersion(current.snapshot,proof.get(key(owner))) || (decision==='save' && !current.snapshot.isSaved)) return result('blocked',owners,'changed',context)
      }
      if (['quit','window-close'].includes(request.kind)) {
        const live=deps.getTabs().map(documentOwner)
        if(deps.inspectComposition(live).composingOwners.length) return result('blocked',owners,'composing',context)
        for(const owner of live) {
          if(owners.some(o=>sameOwner(o,owner))) continue
          const current=capture(owner)
          if(current.status!=='ready'||!current.snapshot.isSaved||pending.has(key(owner))) return result('blocked',owners,'new-dirty',context)
        }
      }
      if (!savingOnly) {
        // No await between final snapshots and the owned synchronous commit.
        const committed=request.commit?.(owners)
        if(committed && typeof committed.then==='function') await committed
      }
      return {status:'completed',affectedOwners:owners}
    } catch (error) {
      return result('failed',owners,'operation-failed',context)
    } finally { active = null }
  }
  const reservePathChange = owners => {
    if(active || owners.some(owner=>pending.has(key(owner)))) return null
    owners.forEach(owner=>pending.set(key(owner),{sourcePath:find(owner)?.pathname,targetPath:find(owner)?.pathname}))
    return () => owners.forEach(owner=>pending.delete(key(owner)))
  }
  return {run, save:(owner,options)=>saveOwned(owner,options), isBusy:busy, invalidate:owner=>invalid.add(key(owner)),reservePathChange}
}
