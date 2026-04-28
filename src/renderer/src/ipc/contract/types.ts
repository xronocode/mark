// MODULE_CONTRACT
//   PURPOSE: Type-level surface for the M-013a frontend IPC contract.
//   SCOPE:   Command name set, payload/result discriminated unions, error
//            code enum. NOT runtime — pure types + a string-literal union
//            that downstream code grep-checks against fixture parity.
//   DEPENDS: (none — LAYER=0)
//   LINKS:   docs/knowledge-graph.xml M-013a, docs/development-plan.xml
//            Phase-B1 step-2.
//   STATUS:  Phase-B1 stub. Command set grows in B2 (fs/search/watcher),
//            B3 (prefs/shortcuts/spell/fonts/menu/recent/datacenter/cli/
//            encoding/pandoc/updater/screenshot). ts-rs codegen replaces
//            the manual literal union once Rust side stabilizes.
//
// CHANGE_SUMMARY:
//   - 2026-04-28 B1-step-2: initial stub. Empty CommandName union; only
//     internal `mt::ping` for the typecheck self-test.

/**
 * Stable error codes returned by ipcInvoke / useIpcListener / ipcCorrelated.
 * Negative-assertion: these strings MUST NOT change across versions; they
 * are the contract surface for renderer error handling and telemetry.
 */
export const IpcErrorCode = {
  UNKNOWN_COMMAND: 'MT_IPC_UNKNOWN_COMMAND',
  TIMEOUT: 'MT_IPC_TIMEOUT',
  VALIDATION: 'MT_IPC_VALIDATION',
  UNKNOWN_CHANNEL: 'MT_IPC_UNKNOWN_CHANNEL'
} as const

export type IpcErrorCode = (typeof IpcErrorCode)[keyof typeof IpcErrorCode]

/**
 * Tagged error class — preserves stack across the invoke boundary.
 * Renderer callers do `if (e instanceof IpcError && e.code === IpcErrorCode.TIMEOUT)`.
 */
export class IpcError extends Error {
  readonly code: IpcErrorCode
  readonly command: string | undefined
  readonly cause?: unknown

  constructor(code: IpcErrorCode, message: string, command?: string, cause?: unknown) {
    super(message)
    this.name = 'IpcError'
    this.code = code
    this.command = command
    this.cause = cause
  }
}

/**
 * Phase-B1 stub command set. Real entries land in B2/B3 as each Rust-side
 * `#[tauri::command]` ships. The `mt::ping` entry exists so the typecheck
 * self-test in invoke.test.ts has a deterministic name to assert against.
 *
 * Pattern: every command name MUST start with `mt::` and use lowercase
 * snake_case for the suffix. CI grep enforces this in V-M-013a.
 */
export type CommandName = 'mt::ping'

/**
 * Generic payload→result map. Phase-B1 only declares the ping pair; later
 * steps extend by intersecting:
 *   type CommandMap = PingMap & FsMap & SearchMap & ...
 */
export interface CommandMap {
  'mt::ping': {
    args: { nonce?: string }
    result: { pong: true; nonce: string | undefined }
  }
}

export type CommandArgs<C extends CommandName> = CommandMap[C]['args']
export type CommandResult<C extends CommandName> = CommandMap[C]['result']
