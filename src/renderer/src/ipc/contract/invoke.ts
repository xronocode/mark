// MODULE_CONTRACT
//   PURPOSE: ipcInvoke — typed, timeout-bounded wrapper around Tauri's
//            invoke() that surfaces stable error codes (IpcErrorCode) and
//            emits [IpcContract] BLOCK_INVOKE / BLOCK_INVOKE_RESOLVED log
//            markers for trace correlation.
//   SCOPE:   single-shot request/response IPC only. Streaming events go
//            through useIpcListener; correlated patterns (req_id) go
//            through ipcCorrelated.
//   DEPENDS: types.ts (IpcError + IpcErrorCode + CommandName/Args/Result),
//            @tauri-apps/api/core invoke().
//   LINKS:   M-013a fn-ipcInvoke; docs/verification-plan.xml V-M-013a.
//   STATUS:  Phase-B1 stub. Schema validation is a no-op pass-through
//            until ts-rs codegen lands in B1 step-3/4. Default 10s timeout.
//
// CHANGE_SUMMARY:
//   - 2026-04-28 B1-step-2: initial stub. Real invoke + AbortController
//     timeout + error mapping; schema validation skipped (V-M-013a leaves
//     a deterministic check for the future ts-rs entry).

import { invoke as tauriInvoke } from '@tauri-apps/api/core'
import {
  IpcError,
  IpcErrorCode,
  type CommandArgs,
  type CommandName,
  type CommandResult
} from './types'

const DEFAULT_TIMEOUT_MS = 10_000

export interface InvokeOptions {
  /** Override the default 10s timeout. Pass Infinity to disable. */
  timeoutMs?: number
  /** Optional AbortSignal — composes with the internal timeout. */
  signal?: AbortSignal
}

/**
 * BLOCK_INVOKE — emitted at the start of every invoke. Stable trace marker
 * required by V-M-013a.
 */
function logInvokeStart(cmd: string, hasArgs: boolean): void {
  // eslint-disable-next-line no-console
  console.debug(`[IpcContract][ipcInvoke][BLOCK_INVOKE] cmd=${cmd} hasArgs=${hasArgs}`)
}

/**
 * BLOCK_INVOKE_RESOLVED — emitted on every settled invoke (success or
 * mapped error). Stable trace marker required by V-M-013a.
 */
function logInvokeResolved(cmd: string, durationMs: number, ok: boolean, errCode?: string): void {
  // eslint-disable-next-line no-console
  console.debug(
    `[IpcContract][ipcInvoke][BLOCK_INVOKE_RESOLVED] cmd=${cmd} ms=${durationMs} ok=${ok}${errCode ? ` err=${errCode}` : ''}`
  )
}

/**
 * Map an unknown error from tauriInvoke to a typed IpcError.
 * Tauri 2 rejects with strings or structured errors depending on the
 * Rust-side return shape. This normalizes both so callers always see
 * IpcError with a stable code.
 */
function mapInvokeError(cmd: string, raw: unknown): IpcError {
  if (raw instanceof IpcError) return raw
  const message = raw instanceof Error ? raw.message : String(raw)
  // Heuristic: Tauri returns "command not found" for unknown commands.
  // Schema mismatches surface as Rust serde errors. These are best-effort
  // mappings until B2 ships structured error envelopes.
  if (/command\s+.+\s+not\s+found/i.test(message)) {
    return new IpcError(IpcErrorCode.UNKNOWN_COMMAND, message, cmd, raw)
  }
  if (/missing\s+field|invalid\s+type|expected\s+/i.test(message)) {
    return new IpcError(IpcErrorCode.VALIDATION, message, cmd, raw)
  }
  // Unknown channel / handler-not-registered surfaces as a different shape;
  // V-M-013a treats UNKNOWN_CHANNEL as the listener-side error and reuses
  // UNKNOWN_COMMAND for the invoke side.
  return new IpcError(IpcErrorCode.UNKNOWN_COMMAND, message, cmd, raw)
}

/**
 * Typed invoke. Phase-B1 stub semantics:
 *   - real Tauri invoke is dispatched
 *   - timeout enforced via Promise.race + AbortController
 *   - errors mapped to IpcError with stable codes
 *   - schema validation deferred (no-op pass-through)
 */
export async function ipcInvoke<C extends CommandName>(
  command: C,
  args: CommandArgs<C>,
  options: InvokeOptions = {}
): Promise<CommandResult<C>> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, signal } = options
  const start = performance.now()
  logInvokeStart(command, args !== undefined)

  let timeoutHandle: ReturnType<typeof setTimeout> | null = null
  const abort = new AbortController()
  const onUserAbort = () => abort.abort(signal?.reason)
  if (signal) {
    if (signal.aborted) onUserAbort()
    else signal.addEventListener('abort', onUserAbort, { once: true })
  }

  try {
    // B1 step-6.5: Tauri command names can't contain `::` (Rust function
    // identifier rule). M-013a CommandName uses `mt::ping`-style for
    // namespace clarity at the contract level; translate to `mt_ping`
    // before invoking. Preserves the contract surface while satisfying
    // Tauri 2's #[tauri::command] naming. M-013b backend handlers are
    // named accordingly (mt_fs_read, mt_search_spawn, etc.).
    const tauriCommand = command.replace(/::/g, '_')
    const invokePromise = tauriInvoke<CommandResult<C>>(tauriCommand, args as Record<string, unknown>)
    const timeoutPromise = new Promise<never>((_, reject) => {
      if (timeoutMs === Infinity) return
      timeoutHandle = setTimeout(() => {
        reject(new IpcError(IpcErrorCode.TIMEOUT, `invoke ${command} timed out after ${timeoutMs}ms`, command))
        abort.abort('timeout')
      }, timeoutMs)
    })
    const result = await Promise.race([invokePromise, timeoutPromise])
    const ms = Math.round(performance.now() - start)
    logInvokeResolved(command, ms, true)
    return result
  } catch (raw) {
    const err = mapInvokeError(command, raw)
    const ms = Math.round(performance.now() - start)
    logInvokeResolved(command, ms, false, err.code)
    throw err
  } finally {
    if (timeoutHandle !== null) clearTimeout(timeoutHandle)
    if (signal) signal.removeEventListener('abort', onUserAbort)
  }
}
