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
 * Command name set. Each entry pairs with a Rust `#[tauri::command]`
 * handler in src-tauri/src/m013b/. The `::` separator is namespace-only;
 * invoke.ts translates it to `_` before calling tauriInvoke (Tauri 2
 * requires Rust-identifier names).
 *
 * Pattern: every command name MUST start with `mt::` and use lowercase
 * snake_case for each segment. CI grep enforces this in V-M-013a.
 *
 * Phase-B1 stub state: 9 commands registered (5 fs + 2 search + 2 watch)
 * + 1 typecheck-only ping. All handlers return Err(MT_NOT_IMPLEMENTED)
 * until Phase-B2 ships real impls in M-002 / M-003 / M-004.
 */
export type CommandName =
  | 'mt::ping'
  | 'mt::fs::read'
  | 'mt::fs::write'
  | 'mt::fs::stat'
  | 'mt::fs::readdir'
  | 'mt::fs::unlink'
  | 'mt::search::spawn'
  | 'mt::search::cancel'
  | 'mt::watch::subscribe'
  | 'mt::watch::unsubscribe'
  | 'mt::print_to_pdf'
  | 'mt::prefs::get'
  | 'mt::prefs::set'
  | 'mt::prefs::get_all'
  | 'mt::workspace::set'
  | 'mt::fonts::list'
  | 'mt::recent::add'
  | 'mt::recent::list'
  | 'mt::recent::clear'

/**
 * Plain JSON-cloneable file stats. Mirrors v1.2.3's contextBridge
 * structured-clone-safe shape (preload step-8z follow-up commit
 * 99cb11d2) so renderer callers don't need to differentiate between
 * Tauri-era and Electron-era stat returns.
 */
export interface FsStat {
  size: number
  mode: number
  mtimeMs: number
  isFile: boolean
  isDirectory: boolean
  isSymbolicLink: boolean
}

/**
 * v1's RipgrepDirectorySearcher options after _serializeOptions
 * whitelist (post-JSON-flatten in v1.2.3 ripgrepSearcher fix).
 * camelCase matches the Rust-side serde rename_all attribute.
 */
export interface SearchOptions {
  isRegexp?: boolean
  isCaseSensitive?: boolean
  isWholeWord?: boolean
  followSymlinks?: boolean
  maxFileSize?: number
  includeHidden?: boolean
  noIgnore?: boolean
  leadingContextLineCount?: number
  trailingContextLineCount?: number
  inclusions?: string[]
  exclusions?: string[]
}

/**
 * Per-command args/result pairs. Extended each phase as M-013b grows
 * real impls. Empty args use `Record<string, never>` so a renderer
 * caller is forced to pass `{}` rather than rely on undefined.
 */
export interface CommandMap {
  'mt::ping': {
    args: { nonce?: string }
    result: { pong: true; nonce: string | undefined }
  }
  'mt::fs::read': {
    args: { path: string }
    result: string
  }
  'mt::fs::write': {
    args: { path: string; content: string }
    result: void
  }
  'mt::fs::stat': {
    args: { path: string }
    result: FsStat
  }
  'mt::fs::readdir': {
    args: { path: string }
    result: string[]
  }
  'mt::fs::unlink': {
    args: { path: string }
    result: void
  }
  'mt::search::spawn': {
    args: {
      searchId: string
      mode: string
      directories: string[]
      pattern: string
      options?: SearchOptions
    }
    result: void
  }
  'mt::search::cancel': {
    args: { searchId: string }
    result: void
  }
  'mt::watch::subscribe': {
    args: { path: string; recursive?: boolean }
    result: string
  }
  'mt::watch::unsubscribe': {
    args: { subscriptionId: string }
    result: void
  }
  'mt::print_to_pdf': {
    args: { html: string }
    result: Uint8Array
  }
  'mt::prefs::get': {
    args: { key: string }
    result: unknown
  }
  'mt::prefs::set': {
    args: { key: string; value: unknown }
    result: void
  }
  'mt::prefs::get_all': {
    args: Record<string, never>
    result: Record<string, unknown>
  }
  'mt::workspace::set': {
    args: { path: string }
    result: void
  }
  'mt::fonts::list': {
    args: Record<string, never>
    result: string[]
  }
  'mt::recent::add': {
    args: { path: string }
    result: void
  }
  'mt::recent::list': {
    args: Record<string, never>
    result: string[]
  }
  'mt::recent::clear': {
    args: Record<string, never>
    result: void
  }
}

export type CommandArgs<C extends CommandName> = CommandMap[C]['args']
export type CommandResult<C extends CommandName> = CommandMap[C]['result']
