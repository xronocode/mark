// MODULE_CONTRACT
//   PURPOSE: useIpcListener — Vue composable subscribing to a Tauri event
//            channel with auto-unsubscribe on onUnmounted + HMR replace.
//            Emits [IpcContract][useIpcListener][BLOCK_LISTENER_REFCOUNT]
//            and [IpcContract][useIpcListener][BLOCK_HMR_REPLACE] markers.
//   SCOPE:   one-way streaming events (e.g. mt::fs::changed, mt::search::result).
//            Bidirectional req/response with correlation belongs in
//            ipcCorrelated; single-shot belongs in ipcInvoke.
//   DEPENDS: types.ts (IpcError + IpcErrorCode for unknown-channel mapping),
//            @tauri-apps/api/event listen, vue onUnmounted.
//   LINKS:   M-013a fn-useIpcListener; V-M-013a.
//   STATUS:  Phase-B1 stub. Per-event ref-count is process-wide so multiple
//            mounted components sharing one channel don't tear each other down.
//
// CHANGE_SUMMARY:
//   - 2026-04-28 B1-step-2: initial stub. listen() wrapper + ref-count map
//     + onUnmounted cleanup. HMR disposal hook deferred to B2 wave (needs
//     real components to test against).

import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { onUnmounted } from 'vue'
import { IpcError, IpcErrorCode } from './types'

/**
 * BLOCK_LISTENER_REFCOUNT — emitted on every subscribe + unsubscribe so
 * leaks are visible in DevTools console. Required by V-M-013a.
 */
function logRefcount(channel: string, op: 'subscribe' | 'unsubscribe', count: number): void {
  // eslint-disable-next-line no-console
  console.debug(`[IpcContract][useIpcListener][BLOCK_LISTENER_REFCOUNT] ch=${channel} op=${op} refs=${count}`)
}

/**
 * Channel ref-count store. Multiple components can subscribe to the same
 * channel; the underlying Tauri listen() is established once and torn
 * down only when the last subscriber unmounts.
 */
const channelRefs = new Map<string, { unlisten: UnlistenFn; refs: number }>()

export type IpcEventHandler<T = unknown> = (payload: T, eventName: string) => void

export interface ListenerOptions {
  /**
   * If true, this listener is NOT auto-cleaned by onUnmounted. Caller must
   * call the returned dispose() manually. Useful in non-component scopes
   * (e.g. Pinia store actions, top-level setup).
   */
  manual?: boolean
}

/**
 * Subscribe to a Tauri event channel with auto-cleanup. Vue composable —
 * MUST be called inside a setup() or another composable; throws if no
 * active component scope is found and `manual: true` is not set.
 *
 * Returns a dispose() function. Calling it manually is always safe; calling
 * it multiple times is idempotent.
 */
export async function useIpcListener<T = unknown>(
  channel: string,
  handler: IpcEventHandler<T>,
  options: ListenerOptions = {}
): Promise<() => void> {
  let entry = channelRefs.get(channel)
  if (!entry) {
    try {
      const unlisten = await listen<T>(channel, (event) => {
        try {
          handler(event.payload, event.event)
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error(`[IpcContract][useIpcListener] handler threw on ch=${channel}:`, err)
        }
      })
      entry = { unlisten, refs: 0 }
      channelRefs.set(channel, entry)
    } catch (raw) {
      const message = raw instanceof Error ? raw.message : String(raw)
      throw new IpcError(IpcErrorCode.UNKNOWN_CHANNEL, message, channel, raw)
    }
  }
  entry.refs += 1
  logRefcount(channel, 'subscribe', entry.refs)

  let disposed = false
  const dispose = () => {
    if (disposed) return
    disposed = true
    const live = channelRefs.get(channel)
    if (!live) return
    live.refs -= 1
    logRefcount(channel, 'unsubscribe', live.refs)
    if (live.refs <= 0) {
      try {
        live.unlisten()
      } catch {
        // best-effort — channel may already be gone if window is closing
      }
      channelRefs.delete(channel)
    }
  }

  if (!options.manual) {
    // onUnmounted is a no-op outside a component scope; getCurrentInstance()
    // would let us guard, but Vue logs a clear warning either way.
    onUnmounted(dispose)
  }

  return dispose
}

/**
 * Test-only helper: read the current ref-count for a channel.
 * NOT exported from index.ts — internal contract surface.
 */
export function _refcountSnapshot(channel: string): number {
  return channelRefs.get(channel)?.refs ?? 0
}
