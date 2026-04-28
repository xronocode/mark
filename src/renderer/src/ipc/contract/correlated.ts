// MODULE_CONTRACT
//   PURPOSE: ipcCorrelated — request/response correlation via req_id, used
//            for patterns where the Rust side answers via an event channel
//            rather than a direct invoke return. Replaces the v1 dynamic
//            channel pattern `mt::response-of-image-path-${id}`.
//   SCOPE:   one-shot correlated request → single response event matched
//            on req_id. Multi-result streaming (search) stays on
//            useIpcListener; fire-and-forget invokes stay on ipcInvoke.
//   DEPENDS: types.ts (IpcError + IpcErrorCode), invoke.ts (ipcInvoke),
//            listener.ts (useIpcListener), @tauri-apps/api/event listen.
//   LINKS:   M-013a fn-ipcCorrelated; V-M-013a.
//   STATUS:  Phase-B1 stub. Default 30s timeout. req_id is UUIDv4 generated
//            in renderer; future B2 step swaps to UUIDv7 from a Rust-side
//            tauri::Request extension to align with TraceContract.
//
// CHANGE_SUMMARY:
//   - 2026-04-28 B1-step-2: initial stub. crypto.randomUUID() for req_id;
//     renderer-only correlation; Rust counterpart wired in B2/B3.

import { listen } from '@tauri-apps/api/event'
import { ipcInvoke, type InvokeOptions } from './invoke'
import { IpcError, IpcErrorCode, type CommandArgs, type CommandName, type CommandResult } from './types'

const DEFAULT_CORRELATED_TIMEOUT_MS = 30_000

interface CorrelatedEnvelope<T> {
  req_id: string
  ok: boolean
  data?: T
  error?: { code: string; message: string }
}

/**
 * Generate a req_id. Web Crypto is mandatory in WKWebView/Chromium contexts
 * where this code runs; no fallback needed.
 */
function newReqId(): string {
  return crypto.randomUUID()
}

export interface CorrelatedOptions extends InvokeOptions {
  /**
   * Event channel name where the Rust side will publish the response.
   * Defaults to `${command}::response` if omitted.
   */
  responseChannel?: string
  /** Override correlated timeout (default 30s, longer than ipcInvoke's 10s). */
  correlatedTimeoutMs?: number
}

/**
 * Issue a correlated request: invoke `${command}` with an injected req_id,
 * then wait for the matching envelope on the response channel.
 *
 * Pattern (renderer side):
 *   const data = await ipcCorrelated('mt::image_resolve', { url }, {
 *     responseChannel: 'mt::image_resolve::response'
 *   })
 *
 * Rust side MUST emit `{ req_id, ok, data | error }` on responseChannel.
 */
export async function ipcCorrelated<C extends CommandName, R = CommandResult<C>>(
  command: C,
  args: CommandArgs<C>,
  options: CorrelatedOptions = {}
): Promise<R> {
  const reqId = newReqId()
  const channel = options.responseChannel ?? `${command}::response`
  const timeoutMs = options.correlatedTimeoutMs ?? DEFAULT_CORRELATED_TIMEOUT_MS

  return new Promise<R>((resolve, reject) => {
    let unlisten: (() => void) | null = null
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null
    const settle = (action: () => void) => {
      if (unlisten) {
        try {
          unlisten()
        } catch {
          // best-effort
        }
        unlisten = null
      }
      if (timeoutHandle !== null) {
        clearTimeout(timeoutHandle)
        timeoutHandle = null
      }
      action()
    }

    timeoutHandle = setTimeout(() => {
      settle(() => reject(new IpcError(IpcErrorCode.TIMEOUT, `ipcCorrelated ${command} req_id=${reqId} timed out after ${timeoutMs}ms`, command)))
    }, timeoutMs)

    listen<CorrelatedEnvelope<R>>(channel, (event) => {
      const env = event.payload
      if (!env || env.req_id !== reqId) return
      if (env.ok) {
        settle(() => resolve(env.data as R))
      } else {
        const code = (env.error?.code as IpcErrorCode) ?? IpcErrorCode.VALIDATION
        settle(() => reject(new IpcError(code, env.error?.message ?? 'correlated error', command)))
      }
    })
      .then((u) => {
        unlisten = u
        // Now dispatch the request — the listener is established, so even
        // a near-instant Rust response will not race the subscription.
        const augmentedArgs = { ...(args as Record<string, unknown>), req_id: reqId }
        ipcInvoke(command, augmentedArgs as CommandArgs<C>, options).catch((err) => {
          settle(() => reject(err))
        })
      })
      .catch((raw) => {
        const message = raw instanceof Error ? raw.message : String(raw)
        settle(() => reject(new IpcError(IpcErrorCode.UNKNOWN_CHANNEL, message, command, raw)))
      })
  })
}
