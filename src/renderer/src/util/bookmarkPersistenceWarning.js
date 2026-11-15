// FILE: src/renderer/src/util/bookmarkPersistenceWarning.js
// START_MODULE_CONTRACT
//   PURPOSE: Deliver queued bookmark-persistence failures through the existing notice surface.
//   SCOPE: Serialize boot/live pending-warning drains; show one sticky deduplicated card.
//   DEPENDS: injected invoke, notification facade and translation function.
//   LINKS: M-011 boot IPC; M-047 permission store; M-067 notification stack.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   createBookmarkPersistenceWarningDrain - create an app-lifetime serialized warning consumer.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   - 2026-11-15 C-BOOKMARK-PERSISTENCE-DURABILITY: boot-safe failure guidance.
// END_CHANGE_SUMMARY

export const createBookmarkPersistenceWarningDrain = ({ invoke, notify, translate }) => {
  let tail = Promise.resolve()
  return () => {
    // Each wakeup gets a serialized pass, including one arriving during a read.
    // This avoids concurrent consumers and the lost-wakeup gap at promise cleanup.
    tail = tail.then(async () => {
      try {
        const pending = await invoke('mt_take_bookmark_persistence_warning')
        if (pending !== true) return
        notify({
          severity: 'error',
          source: 'file',
          sticky: true,
          dedupKey: 'bookmark-persistence-failure',
          title: translate('workspace.bookmarkPersistenceFailedTitle'),
          message: translate('workspace.bookmarkPersistenceFailedMessage')
        })
      } catch (error) {
        // A failed invoke must not abort startup or reject an unawaited event handler.
        console.error('[SecurityBookmarks][warning][BLOCK_BOOKMARK_WARNING_DRAIN_FAILED]')
      }
    })
    return tail
  }
}
