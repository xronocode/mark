// MODULE_CONTRACT
//   PURPOSE: M-013b frontend facade for the file-watcher. subscribe()
//            registers a listener, calls mt::watch::subscribe, returns
//            a dispose function that both unregisters the listener and
//            calls mt::watch::unsubscribe. Mirrors v1.2.3's chokidar-
//            backed watcher API where the renderer received fs:changed
//            events keyed by window.
//   SCOPE:   subscribe + unsubscribe. Streaming events flow on the
//            'mt::watch::event' Tauri channel; we filter by
//            subscriptionId so multiple subscriptions don't cross-feed.
//   DEPENDS: M-013a contract (ipcInvoke, useIpcListener, IpcError).
//   LINKS:   docs/development-plan.xml Phase-B2 step-5;
//            src-tauri/src/m013b/watch.rs WATCH_EVENT_CHANNEL constant.
//   STATUS:  Phase-B2 step-5 shipped.
//
// CHANGE_SUMMARY:
//   - 2026-04-28 B2-step-5: initial facade.

import { ipcInvoke, useIpcListener, type ListenerOptions } from '../contract'

export const WATCH_EVENT_CHANNEL = 'mt::watch::event'

export interface WatchEvent {
  subscriptionId: string
  /** "create" | "modify" | "remove" | "access" | "other" | "any" */
  kind: string
  paths: string[]
}

export type WatchEventHandler = (event: WatchEvent) => void

export interface SubscribeOptions {
  /** Watch sub-directories recursively. Defaults to true. */
  recursive?: boolean
  /**
   * Listener-side options forwarded to useIpcListener. `manual: true`
   * means the dispose function must be called by hand; otherwise the
   * Vue composable auto-disposes on onUnmounted.
   */
  listener?: ListenerOptions
}

/**
 * Subscribe to filesystem changes under `path`. Returns a Promise of
 * a dispose function. Calling dispose() is idempotent and:
 *   1. unregisters the per-subscription channel listener,
 *   2. invokes mt::watch::unsubscribe so the Rust side drops the watcher.
 *
 * Pattern:
 *   const dispose = await ipcWatch.subscribe('/path', (e) => { ... })
 *   // ...
 *   dispose()  // or trust onUnmounted auto-cleanup
 */
async function subscribe(
  path: string,
  handler: WatchEventHandler,
  options: SubscribeOptions = {}
): Promise<() => void> {
  const subscriptionId = await ipcInvoke('mt::watch::subscribe', {
    path,
    recursive: options.recursive ?? true
  })

  // Filter events by subscriptionId so multiple subscriptions on the
  // same channel don't cross-feed.
  const disposeListener = await useIpcListener<WatchEvent>(
    WATCH_EVENT_CHANNEL,
    (event) => {
      if (event.subscriptionId === subscriptionId) handler(event)
    },
    options.listener
  )

  let disposed = false
  return () => {
    if (disposed) return
    disposed = true
    try {
      disposeListener()
    } catch {
      // best-effort
    }
    ipcInvoke('mt::watch::unsubscribe', { subscriptionId }).catch(() => {
      // best-effort: server may have already cleaned up
    })
  }
}

export const ipcWatch = { subscribe }
export type IpcWatch = typeof ipcWatch
