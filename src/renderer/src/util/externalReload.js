// FILE: src/renderer/src/util/externalReload.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Single owner of external-file-change reload admission, the one 100ms settle + disk read with liveness revalidation, and the explicit replacement-state manifest plus synchronous commit boundary for editor tabs.
//   SCOPE: Permission-aware admission (automatic clean-tab reloads skip equal text without replacement, snapshot or announcement; explicitly confirmed reloads replace even on equal text and snapshot only unequal content), one read/settle mechanism bound to a dispatch attempt (generation + exact live tab object + path), one replacement manifest built once over the injected getSingleFileState fresh state, and one commit stage recording the pre-reload snapshot, the opened snapshot, the eligible non-unified history surgery, the stale muya blocks drop, the mixed-line-ending notice, the contentReloaded stamp and the current-tab file-changed announcement. No stores, components, window, notification or i18n imports — every external effect is injected.
//   DEPENDS: injected read/schedule/log/bus/isSamePath/buildSingleFileState/recordPreReloadSnapshot/recordOpenedSnapshot/notify/t (wired once from store/editor.js; all bindings call-time).
//   LINKS: .grace/changes/active/C-EXTERNAL-RELOAD-OPERATION; store/editor.js (thin adapters APPLY_FILE_CHANGE/loadChange); store/help.js getSingleFileState (injected builder); store/diffSnapshots.js recordSnapshot/recordOpenedSnapshot (injected recorders).
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   RELOAD_PERMISSIONS - frozen admission kinds: AUTOMATIC (clean-tab policy gate in the store) and CONFIRMED (explicit user choice through the conflict notification).
//   SETTLE_DELAY_MS - the single 100ms disk-settle constant shared by the automatic and confirmed disk paths.
//   decideAdmission - the one permission-aware boundary: automatic + equal text skips; every other combination replaces with snapshot = hasPathname && unequal. No global hash-skip.
//   buildReplacementManifest - one explicit replacement manifest: fresh injected state (new documentToken, fresh defaults/checkpoints), incoming and pre-reload markdown, old id/notifications, eligible non-unified history capture, cursor/scrollTop/muyaIndexCursor, splitSession retirement, blocks drop, mixed flag, snapshotRequired.
//   commitReplacement - strictly synchronous commit in the exact legacy loadChange order; no await may separate it from the final admission decision.
//   readWithSettle - one settle + one read per attempt, liveness revalidated before and after the read; markdown or null on staleness/failure, no retries, no queue.
//   createExternalReloadController - wires the injected effects once and returns handleFileChange, applyLoadedChange and the conflict-notification factory.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: 1.0.0 - 2026-11-20 C-EXTERNAL-RELOAD-OPERATION: extraction of the duplicated APPLY_FILE_CHANGE read/settle/snapshot/replacement sequencing and the loadChange replacement body into this one owned boundary; permissions, timing, identity, history and snapshot behavior preserved.
// END_CHANGE_SUMMARY

// The admission policy in one boundary. `currentText` is the live
// tab.markdown at admission time; `incomingText` is the ready
// change.data.markdown or the freshly read disk markdown.
//
//   automatic + equal   -> skip: no replacement, no snapshot, no
//                          announcement and no BLOCK_LIVE_RELOAD log (the
//                          silent equal-skip all four legacy sites had)
//   automatic + unequal -> replace; snapshot when the tab has a pathname
//   confirmed (any)     -> replace; snapshot only unequal content — the
//                          explicit choice keeps the current replacement/
//                          checkpoint behavior even for equal text
//
// There is deliberately no global hash-skip: the equal-text skip exists
// only on the AUTOMATIC arm, exactly as in the legacy sites.
export const RELOAD_PERMISSIONS = Object.freeze({ AUTOMATIC: 'automatic', CONFIRMED: 'confirmed' })
export const SETTLE_DELAY_MS = 100

export function decideAdmission({ permission, currentText, incomingText, hasPathname }) {
  const unequal = currentText !== incomingText
  if (permission === RELOAD_PERMISSIONS.AUTOMATIC && !unequal) return { action: 'skip' }
  return { action: 'replace', snapshot: hasPathname && unequal }
}

// One explicit replacement manifest instead of reconstructing the state in
// every caller. `buildSingleFileState` is the store's existing
// getSingleFileState builder, injected per call: fresh defaults, fresh
// documentToken, fresh text/format checkpoints, lastSavedHistoryId -1.
// Ready data keeps its supplied filename/format metadata; disk callers
// build `data` from the completion-time tab fields with
// isMixedLineEndings: false — identical to the legacy construction.
export function buildReplacementManifest({ tab, pathname, data, buildSingleFileState }) {
  const {
    isMixedLineEndings,
    lineEnding,
    adjustLineEndingOnSave,
    trimTrailingNewline,
    encoding,
    markdown,
    filename
  } = data
  const options = { encoding, lineEnding, adjustLineEndingOnSave, trimTrailingNewline }

  // Validate a fresh loaded state only for a still-live target.
  const newFileState = buildSingleFileState({ markdown, filename, pathname, options })

  // Backup few entries that we need to restore later.
  const oldId = tab.id
  const oldNotifications = tab.notifications
  let oldHistory = null
  if (!tab.splitSession?.unified && tab.history.index >= 0 && tab.history.stack.length >= 1) {
    // Allow to restore the old document (single eligible entry; the
    // reference-freeing surgery itself happens inside commitReplacement,
    // in the same synchronous slice).
    oldHistory = {
      stack: [tab.history.stack[tab.history.index]],
      index: 0
    }
  }

  // Preserve cursor/scroll state across reload.
  const savedCursor = tab.cursor
  const savedScrollTop = tab.scrollTop
  const savedMuyaIndexCursor = tab.muyaIndexCursor

  return {
    tab, // the exact live tab object — identity is preserved by commit
    pathname,
    incomingMarkdown: markdown,
    preReloadMarkdown: tab.markdown,
    oldId,
    oldNotifications,
    oldHistory,
    savedCursor,
    savedScrollTop,
    savedMuyaIndexCursor,
    newFileState,
    filename,
    lineEnding,
    mixedLineEndings: isMixedLineEndings,
    splitSessionRetired: true,
    blocksDropped: true,
    snapshotRequired: false // set by the caller from the admission decision
  }
}

// The strictly synchronous commit stage — the exact legacy loadChange
// order. Callers must invoke it in the same synchronous slice as the final
// admission decision (no await in between), so the manifest captured at
// admission time still describes the tab at commit time.
export function commitReplacement(manifest, { store, deps }) {
  const { tab, pathname, incomingMarkdown, newFileState } = manifest

  // START_BLOCK_PRE_RELOAD_SNAPSHOT
  // C-43: keep what the tab had just before the external content lands —
  // the diff view's preferred baseline. snapshotRequired comes from the
  // admission decision (pathful tab, unequal text): untitled tabs never
  // snapshot, and equal-text confirmed replacements checkpoint without
  // adding a duplicate unequal-content ring entry.
  if (manifest.snapshotRequired) {
    deps.recordPreReloadSnapshot(manifest.oldId, manifest.preReloadMarkdown)
  }
  // END_BLOCK_PRE_RELOAD_SNAPSHOT

  // Free reference from the old history array (same surgery the legacy
  // loadChange performed at capture time).
  if (manifest.oldHistory) {
    tab.history.index--
    tab.history.stack.pop()
  }

  // Update file content and restore some entries.
  Object.assign(tab, newFileState)
  delete tab.splitSession
  tab.id = manifest.oldId
  tab.notifications = manifest.oldNotifications

  // Restore cursor/scroll state (Object.assign overwrites with defaults).
  tab.cursor = manifest.savedCursor
  tab.scrollTop = manifest.savedScrollTop
  tab.muyaIndexCursor = manifest.savedMuyaIndexCursor
  // defaultFileState carries no `blocks` key, so Object.assign above kept
  // the STALE muya blocks of the pre-edit document. Tab activation
  // (UPDATE_CURRENT_FILE / CLOSE fallbacks) forwards tab.blocks, and
  // muya's setMarkdown renders `blocks` verbatim when present — the old
  // document would resurrect over the reloaded content. The reloaded
  // markdown is the source of truth; the next render repopulates blocks.
  tab.blocks = undefined

  // START_BLOCK_RECORD_OPENED_SNAPSHOT_RELOAD
  // C-68 R-1: an external reload is also a disk load — the opened slot
  // now mirrors the content that just landed. The pre-reload snapshot
  // ring (recorded just above for admitted unequal replacements) keeps
  // its place as the preferred diff baseline.
  deps.recordOpenedSnapshot(tab.id, incomingMarkdown)
  // END_BLOCK_RECORD_OPENED_SNAPSHOT_RELOAD

  if (manifest.oldHistory) {
    tab.history = manifest.oldHistory
  }

  if (manifest.mixedLineEndings) {
    store.pushTabNotification({
      tabId: tab.id,
      msg: deps.t('store.editor.mixedLineEndingsNormalized', {
        name: manifest.filename,
        lineEnding: manifest.lineEnding.toUpperCase()
      }),
      showConfirm: false,
      style: 'info',
      exclusiveType: ''
    })
  }

  // Stamp the tab so a later activation (the user switches to a
  // background tab after an external edit) also routes its scroll
  // restore through the reload clamp instead of the padding trick.
  tab.contentReloaded = true

  // Reload the editor if the tab is currently opened.
  if (pathname === store.currentFile.pathname) {
    // save current state first
    store.currentFile = tab
    const { id, cursor, history, scrollTop, muyaIndexCursor } = tab // Should not use blocks history as this is loaded from disk
    deps.bus.emit('file-changed', {
      id,
      markdown: incomingMarkdown,
      muyaIndexCursor,
      cursor,
      renderCursor: true,
      history,
      scrollTop,
      // The scrollTop above belongs to the pre-edit document; the editor
      // must clamp it into the reloaded document's scrollable range
      // instead of restoring it over different-height content.
      contentReloaded: true
    })
  }
}

// The one read/settle mechanism, shared by the automatic and confirmed
// disk paths: exactly one settle, then at most one read, liveness
// revalidated before and after the read. No retry loop, no global queue.
// `null` means "this attempt is dead" (stale generation, closed tab,
// renamed path, superseded event) or the read failed — the caller returns
// without touching the tab. The automatic caller passes an attempt whose
// isLive also re-runs the clean-tab gate between settle and read, which
// preserves the legacy "clean check before starting an automatic disk
// read"; the confirmed caller passes the raw attempt (its drift check
// compares against the markdown/revision captured at the choice).
export async function readWithSettle({ pathname, attempt, deps }) {
  await new Promise((resolve) => deps.schedule(resolve)) // one settle, SETTLE_DELAY_MS
  if (!attempt.isLive()) return null
  try {
    const markdown = await deps.read(pathname) // one read
    if (!attempt.isLive()) return null
    return markdown
  } catch (e) {
    deps.log.error(`[editor][live_reload][BLOCK_READ_FAILED path=${pathname}]`, e)
    return null // read failure changes nothing and starts no retry
  }
}

export function createExternalReloadController(deps) {
  // The one-shot, generation-bound conflict choice for a dirty tab. The
  // action is truthy-status: a declined or stale call returns BEFORE the
  // consume flip, so the notification stays actionable exactly as the
  // legacy reloadConfirmed flag kept it, and only the successful
  // truthy+live path consumes it.
  const buildConflictAction = ({ type, change, tab, store, attempt }) => {
    let consumed = false
    return async (status) => {
      if (!status || consumed || !attempt.isLive()) return
      consumed = true
      if (change.data) {
        // Ready-data confirmation stays synchronous: decideAdmission and
        // commitReplacement run in the same tick. Equal text still
        // replaces (confirmed semantics); only unequal content snapshots.
        const admission = decideAdmission({
          permission: RELOAD_PERMISSIONS.CONFIRMED,
          currentText: tab.markdown,
          incomingText: change.data.markdown,
          hasPathname: !!tab.pathname
        })
        const manifest = buildReplacementManifest({
          tab,
          pathname: attempt.pathname,
          data: change.data,
          buildSingleFileState: deps.buildSingleFileState
        })
        manifest.snapshotRequired = admission.snapshot
        commitReplacement(manifest, { store, deps })
        return
      }
      // Disk confirmation captures the local markdown/revision at the
      // choice — not at dispatch. Edits made during the settle delay or
      // while the read waited require fresh resolution, so the stale
      // result dead-ends into the current conflict flow instead of
      // applying over content the user never agreed to replace.
      const confirmedMarkdown = tab.markdown
      const confirmedRevision = tab.contentRevision || 0
      const markdown = await readWithSettle({ pathname: attempt.pathname, attempt, deps })
      if (markdown === null) return
      if (tab.markdown !== confirmedMarkdown ||
        (tab.contentRevision || 0) !== confirmedRevision) {
        // Confirmation covers only the local content the user chose to
        // replace, not edits made while the read waited.
        store.APPLY_FILE_CHANGE(type, change)
        return
      }
      const admission = decideAdmission({
        permission: RELOAD_PERMISSIONS.CONFIRMED,
        currentText: tab.markdown,
        incomingText: markdown,
        hasPathname: !!tab.pathname
      })
      const data = {
        markdown,
        filename: tab.filename,
        encoding: tab.encoding,
        lineEnding: tab.lineEnding,
        adjustLineEndingOnSave: tab.adjustLineEndingOnSave,
        trimTrailingNewline: tab.trimTrailingNewline,
        isMixedLineEndings: false
      }
      const manifest = buildReplacementManifest({
        tab,
        pathname: attempt.pathname,
        data,
        buildSingleFileState: deps.buildSingleFileState
      })
      manifest.snapshotRequired = admission.snapshot
      // Same synchronous slice as the admission decision above — no await
      // may reopen the live-reference race between the two.
      commitReplacement(manifest, { store, deps })
    }
  }

  // One permission-aware admission path for the ready embedded data and
  // the disk read of an external add/change event. AUTOMATIC arrives only
  // when the store's clean-tab flag gate granted the reload; every other
  // dispatch is CONFIRMED. The owner never re-reads preferences.
  const handleFileChange = async ({ type, change, tab, store, attempt }) => {
    if (attempt.permission !== RELOAD_PERMISSIONS.AUTOMATIC) {
      // Dirty (or policy-denied) at dispatch: the existing explicit
      // conflict choice. Automatic flags never authorize losing dirty
      // edits, so they can never reach this arm as AUTOMATIC.
      deps.log.log(`[editor][live_reload][BLOCK_RELOAD_CONFLICT path=${attempt.filename} reason=dirty-tab]`)
      tab.isSaved = false
      store.pushTabNotification({
        tabId: tab.id,
        msg: deps.t('store.editor.fileChangedOnDisk', { name: attempt.filename }),
        showConfirm: true,
        exclusiveType: 'file_changed',
        action: buildConflictAction({ type, change, tab, store, attempt })
      })
      return
    }

    if (change.data) {
      // Ready embedded data (legacy direct path) — fully synchronous.
      if (!attempt.isLive()) return
      const admission = decideAdmission({
        permission: RELOAD_PERMISSIONS.AUTOMATIC,
        currentText: tab.markdown,
        incomingText: change.data.markdown,
        hasPathname: !!tab.pathname
      })
      if (admission.action === 'skip') return
      deps.log.log(`[editor][live_reload][BLOCK_LIVE_RELOAD path=${attempt.filename} source=data]`)
      const manifest = buildReplacementManifest({
        tab,
        pathname: attempt.pathname,
        data: change.data,
        buildSingleFileState: deps.buildSingleFileState
      })
      manifest.snapshotRequired = admission.snapshot
      commitReplacement(manifest, { store, deps })
      return
    }

    // Disk read. The clean-tab gate re-runs between the settle and the
    // read through the attempt's liveness slot (composed below), so an
    // edit during the settle window never starts a read. The raw attempt
    // stays the disambiguation lens afterwards: a dead attempt (newer
    // event, closed tab, renamed path) is silent, while local drift
    // re-enters the current conflict flow through a fresh dispatch — the
    // dispatch-time closure, deliberately not the choice-time capture.
    const cleanGate = {
      ...attempt,
      isLive: () => attempt.isLive() && tab.isSaved && !attempt.localContentChanged()
    }
    const markdown = await readWithSettle({ pathname: attempt.pathname, attempt: cleanGate, deps })
    if (markdown === null) {
      if (attempt.isLive() && (!tab.isSaved || attempt.localContentChanged())) {
        store.APPLY_FILE_CHANGE(type, change)
      }
      return
    }
    if (!tab.isSaved || attempt.localContentChanged()) {
      // Resolve the current local state through the same conflict flow,
      // invalidating this old read generation.
      store.APPLY_FILE_CHANGE(type, change)
      return
    }
    // Hash-skip: don't reload if content matches current tab (automatic
    // path only — a confirmed reload replaces even on equal text).
    const admission = decideAdmission({
      permission: RELOAD_PERMISSIONS.AUTOMATIC,
      currentText: tab.markdown,
      incomingText: markdown,
      hasPathname: !!tab.pathname
    })
    if (admission.action === 'skip') {
      deps.log.log(`[editor][live_reload][BLOCK_RELOAD_SKIPPED path=${attempt.filename} reason=hash-match]`)
      return
    }
    deps.log.log(`[editor][live_reload][BLOCK_LIVE_RELOAD path=${attempt.filename} source=disk]`)
    const data = {
      markdown,
      filename: tab.filename,
      encoding: tab.encoding,
      lineEnding: tab.lineEnding,
      adjustLineEndingOnSave: tab.adjustLineEndingOnSave,
      trimTrailingNewline: tab.trimTrailingNewline,
      isMixedLineEndings: false
    }
    const manifest = buildReplacementManifest({
      tab,
      pathname: attempt.pathname,
      data,
      buildSingleFileState: deps.buildSingleFileState
    })
    manifest.snapshotRequired = admission.snapshot
    // Same synchronous slice as the admission decision above — no await
    // may separate final admission from the owned replacement commit.
    commitReplacement(manifest, { store, deps })
  }

  // The store's committed replacement entry (the loadChange target). It
  // performs NO admission — permission decisions live in handleFileChange
  // only — and keeps the loadChange signature, error text and notify
  // behavior intact for its other callers.
  const applyLoadedChange = ({ change, store }) => {
    const { pathname } = change
    const tab = store.tabs.find((t) => deps.isSamePath(t.pathname, pathname))
    if (!tab) {
      // The tab may be closed in the meanwhile.
      deps.log.error('loadChange: Cannot find tab in tab list.')
      deps.notify({
        title: deps.t('store.editor.errorLoadingTabTitle'),
        message: deps.t('store.editor.errorLoadingTabMessage'),
        type: 'error',
        time: 20000,
        showConfirm: false
      })
      return
    }
    const manifest = buildReplacementManifest({
      tab,
      pathname,
      data: change.data,
      buildSingleFileState: deps.buildSingleFileState
    })
    commitReplacement(manifest, { store, deps })
  }

  return { handleFileChange, applyLoadedChange, buildConflictAction }
}
