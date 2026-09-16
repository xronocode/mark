// MODULE_CONTRACT
//   PURPOSE: useIpcListener — Vue composable subscribing to a Tauri event
//            channel with auto-unsubscribe on onUnmounted. Emits
//            [IpcContract][useIpcListener][BLOCK_LISTENER_REFCOUNT] markers
//            on every subscribe/unsubscribe (HMR-replace disposal remains
//            deferred; no BLOCK_HMR_REPLACE marker is emitted today).
//   SCOPE:   one-way streaming events (e.g. mt::watch::event, mt::search::result).
//            Bidirectional req/response with correlation belongs in
//            ipcCorrelated; single-shot belongs in ipcInvoke.
//   DEPENDS: types.ts (IpcError + IpcErrorCode for unknown-channel mapping),
//            @tauri-apps/api/event listen, vue onUnmounted.
//   LINKS:   M-013-A fn-useIpcListener; V-M-013-A scenario-5; C-2.
//   STATUS:  Fan-out delivery. One Tauri listen() per channel fans every
//            event out to ALL registered handlers (C-2: previously only the
//            first subscriber's handler was baked into listen() — every
//            later subscriber on the channel silently received nothing,
//            which killed all but the first file-watcher subscription).
//            Concurrent first subscribes share one creation promise, so a
//            channel never gets duplicate listen() registrations.
//
// CHANGE_SUMMARY:
//   - 2026-09-16 C-2: per-channel handler Set with fan-out iteration;
//     single-creation promise guards the concurrent-first-subscribe race;
//     per-handler try/catch so one throwing handler cannot starve the
//     others. BLOCK_LISTENER_REFCOUNT now logs the handler-set size.
//     Review-1 refinement: the Set stores per-subscription token objects
//     (`{ handler }`) — a plain handler Set would dedupe the same function
//     reference subscribed twice, crashing the second dispose and silently
//     dropping that subscription.
//   - 2026-04-28 B1-step-2: initial stub. listen() wrapper + ref-count map
//     + onUnmounted cleanup. HMR disposal hook deferred to B2 wave (needs
//     real components to test against).

import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { onUnmounted } from 'vue'
import { IpcError, IpcErrorCode } from './types'

/**
 * BLOCK_LISTENER_REFCOUNT — emitted on every subscribe + unsubscribe so
 * leaks are visible in DevTools console. Required by V-M-013-A.
 */
function logRefcount(channel: string, op: 'subscribe' | 'unsubscribe', count: number): void {
  // eslint-disable-next-line no-console
  console.debug(`[IpcContract][useIpcListener][BLOCK_LISTENER_REFCOUNT] ch=${channel} op=${op} refs=${count}`)
}

interface ChannelEntry {
  unlisten: UnlistenFn
  /**
   * Live subscriber tokens; the listen() wrapper fans out to all of them.
   * Tokens are fresh objects per subscription, so registering the SAME
   * handler function twice creates two independent subscriptions (a plain
   * handler Set would dedupe them and break the second dispose — review-1
   * finding).
   */
  handlers: Set<{ handler: IpcEventHandler }>
}

/**
 * Channel registry. One Tauri listen() per channel; every event payload is
 * delivered to every handler in `handlers` (registration order).
 */
const channelEntries = new Map<string, ChannelEntry>()

/**
 * In-flight channel creations. Two subscribers racing to be first on a
 * channel must share ONE listen() call — otherwise the channel gets two
 * OS-level registrations and every event would be delivered twice.
 */
const pendingChannels = new Map<string, Promise<ChannelEntry>>()

async function ensureEntry(channel: string): Promise<ChannelEntry> {
  const existing = channelEntries.get(channel)
  if (existing) return existing

  const pending = pendingChannels.get(channel)
  if (pending) return pending

  const created = (async () => {
    const handlers = new Set<{ handler: IpcEventHandler }>()
    const unlisten = await listen(channel, (event) => {
      for (const { handler } of handlers) {
        try {
          handler(event.payload, event.event)
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error(`[IpcContract][useIpcListener] handler threw on ch=${channel}:`, err)
        }
      }
    })
    const entry: ChannelEntry = { unlisten, handlers }
    channelEntries.set(channel, entry)
    return entry
  })()

  pendingChannels.set(channel, created)
  try {
    return await created
  } catch (raw) {
    const message = raw instanceof Error ? raw.message : String(raw)
    throw new IpcError(IpcErrorCode.UNKNOWN_CHANNEL, message, channel, raw)
  } finally {
    pendingChannels.delete(channel)
  }
}

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
 * Subscribe to a Tauri event channel with auto-cleanup. Safe in component
 * setup() AND in non-component scopes (Pinia actions): outside a component
 * onUnmounted is a no-op, so pass `manual: true` there and keep the
 * dispose function.
 *
 * Every event on the channel is delivered to every active subscriber
 * (C-2 fan-out). Returns a dispose() function; idempotent.
 */
export async function useIpcListener<T = unknown>(
  channel: string,
  handler: IpcEventHandler<T>,
  options: ListenerOptions = {}
): Promise<() => void> {
  const entry = await ensureEntry(channel)
  const token = { handler: handler as IpcEventHandler }
  entry.handlers.add(token)
  logRefcount(channel, 'subscribe', entry.handlers.size)

  let disposed = false
  const dispose = () => {
    if (disposed) return
    disposed = true
    // Invariant: while this closure has not run, its token is still in
    // the live entry's Set, so the entry cannot have been torn down (only
    // the last dispose empties the Set and deletes the entry).
    const live = channelEntries.get(channel)!
    live.handlers.delete(token)
    logRefcount(channel, 'unsubscribe', live.handlers.size)
    if (live.handlers.size === 0) {
      try {
        live.unlisten()
      } catch {
        // best-effort — channel may already be gone if window is closing
      }
      channelEntries.delete(channel)
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
  return channelEntries.get(channel)?.handlers.size ?? 0
}
