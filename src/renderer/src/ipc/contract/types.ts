// FILE: src/renderer/src/ipc/contract/types.ts
// START_MODULE_CONTRACT
//   PURPOSE: M-013-A typed IPC command, payload and error identities.
//   SCOPE: Complete readonly DocumentFormat in correlated requests/replies;
//          shared command/result types and stable runtime error tags.
//   DEPENDS: TypeScript and JavaScript Error.
//   LINKS: M-013-A/M-013-B; C-METADATA-SAVE-SAFETY T-002.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   IpcErrorCode - stable error constants and corresponding value union.
//   IpcError - tagged runtime transport error.
//   CommandName - sanctioned command-name union.
//   FsStat - filesystem metadata shape.
//   SearchOptions - search request options.
//   SaveTargetRequest - destination-picker request identity.
//   SaveTargetReply - owned destination-picker reply.
//   DocumentFormat - complete readonly byte-policy value.
//   DocumentWriteRequest - required text/format/revision write snapshot.
//   DocumentWriteReply - matching write identity and format acknowledgement.
//   CommandMap - command argument and result pairs.
//   ExtensionInfo - extension metadata shape.
//   CommandArgs - arguments selected by command name.
//   CommandResult - result selected by command name.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   LAST_CHANGE: 2026-11-11: require complete immutable format on both correlated write DTOs.
// END_CHANGE_SUMMARY

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
 * snake_case for each segment. CI grep enforces this in V-M-013-A.
 *
 * Phase-B1 stub state: 9 commands registered (5 fs + 2 search + 2 watch)
 * + 1 typecheck-only ping. All handlers return Err(MT_NOT_IMPLEMENTED)
 * until Phase-B2 ships real impls in M-002 / M-003 / M-004.
 */
export type CommandName =
  | 'mt::document::choose_save_target'
  | 'mt::document::write_snapshot'
  | 'mt::ping'
  | 'mt::fs::read'
  | 'mt::fs::write'
  | 'mt::fs::stat'
  | 'mt::fs::readdir'
  | 'mt::fs::mkdir'
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
  | 'mt::recent::remove'
  | 'mt::recent::insert'
  | 'mt::shortcut::register'
  | 'mt::shortcut::unregister'
  | 'mt::shortcut::list'
  | 'mt::spell::get_config'
  | 'mt::spell::set_enabled'
  | 'mt::spell::set_lang'
  | 'mt::menu::taxonomy'
  | 'mt::pandoc::status'
  | 'mt::pandoc::export'
  | 'mt::updater::check'
  | 'mt::screenshot::capture'
  | 'mt::secret::set'
  | 'mt::secret::get'
  | 'mt::secret::delete'
  | 'mt::fs::read_binary'
  | 'mt::fs::write_binary'
  | 'mt::fs::copy'
  | 'mt::fs::move'
  | 'mt::ext::discover'
  | 'mt::ext::enable'
  | 'mt::ext::disable'
  | 'mt::ext::invoke'
  | 'mt::ext::list'
  | 'mt::ext::text_insert'
  | 'mt::ext::text_transform'
  | 'mt::rollback::prepare'
  | 'mt::rollback::status'
  | 'mt::rollback::restore'
  | 'mt::rollback::restore_outcome'

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
 * Per-command args/result pairs. Extended each phase as M-013-B grows
 * real impls. Empty args use `Record<string, never>` so a renderer
 * caller is forced to pass `{}` rather than rely on undefined.
 */
export interface SaveTargetRequest { requestId: string; documentToken: string; filename: string; defaultPath: string | null }
export interface SaveTargetReply { requestId: string; documentToken: string; pathname: string }
export interface DocumentFormat {
  readonly encoding: string;
  readonly isBom: boolean;
  readonly lineEnding: 'lf' | 'crlf' | 'mixed';
  readonly finalNewline: 0 | 1 | 3;
}
export interface DocumentWriteRequest {
  requestId: string; documentToken: string; id: string; revision: number;
  sourcePath: string; targetPath: string; markdown: string; format: DocumentFormat;
  ownedPaths: { documentToken: string; pathname: string }[]
}
export interface DocumentWriteReply {
  requestId: string; documentToken: string; id: string; revision: number;
  sourcePath: string; pathname: string; filename: string; format: DocumentFormat
}

export interface CommandMap {
  'mt::document::choose_save_target': { args: { request: SaveTargetRequest }; result: SaveTargetReply | null }
  'mt::document::write_snapshot': { args: { request: DocumentWriteRequest }; result: DocumentWriteReply }
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
  'mt::fs::mkdir': {
    args: { path: string }
    result: void
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
  'mt::recent::remove': {
    args: { path: string }
    result: number | null
  }
  'mt::recent::insert': {
    args: { path: string; index: number }
    result: void
  }
  'mt::shortcut::register': {
    args: { command: string; accelerator: string }
    result: void
  }
  'mt::shortcut::unregister': {
    args: { command: string }
    result: void
  }
  'mt::shortcut::list': {
    args: Record<string, never>
    result: Array<{ command: string; accelerator: { modifiers: number; key: string } }>
  }
  'mt::spell::get_config': {
    args: Record<string, never>
    result: { enabled: boolean; lang: string }
  }
  'mt::spell::set_enabled': {
    args: { enabled: boolean }
    result: void
  }
  'mt::spell::set_lang': {
    args: { lang: string }
    result: void
  }
  'mt::menu::taxonomy': {
    args: Record<string, never>
    result: Array<{
      id: string
      label: string
      command: string | null
      accelerator: string | null
      items: unknown[] | null
    }>
  }
  'mt::pandoc::status': {
    args: Record<string, never>
    result: { available: boolean; version: string | null; path: string | null }
  }
  'mt::pandoc::export': {
    args: { input: string; format: string }
    result: Uint8Array
  }
  'mt::updater::check': {
    args: Record<string, never>
    result: {
      currentVersion: string
      available: boolean
      latestVersion: string | null
      downloadUrl: string | null
      statusNote: string | null
    }
  }
  'mt::screenshot::capture': {
    args: { options?: { mode?: string } }
    result: Uint8Array
  }
  'mt::secret::set': {
    args: { key: string; value: string }
    result: void
  }
  'mt::secret::get': {
    args: { key: string }
    result: string | null
  }
  'mt::secret::delete': {
    args: { key: string }
    result: void
  }
  'mt::fs::read_binary': {
    args: { path: string }
    result: Uint8Array
  }
  'mt::fs::write_binary': {
    args: { path: string; data: Uint8Array }
    result: void
  }
  'mt::fs::copy': {
    args: { src: string; dest: string }
    result: void
  }
  'mt::fs::move': {
    args: { src: string; dest: string }
    result: void
  }
  'mt::ext::discover': {
    args: Record<string, never>
    result: ExtensionInfo[]
  }
  'mt::ext::enable': {
    args: { id: string }
    result: void
  }
  'mt::ext::disable': {
    args: { id: string }
    result: void
  }
  'mt::ext::invoke': {
    args: { id: string; capability: string; payload: unknown }
    result: unknown
  }
  'mt::ext::list': {
    args: Record<string, never>
    result: ExtensionInfo[]
  }
  'mt::ext::text_insert': {
    args: { extension_id: string; text: string; position?: { line: number; ch: number } }
    result: void
  }
  'mt::ext::text_transform': {
    args: { extension_id: string; text: string }
    result: void
  }
  'mt::rollback::prepare': {
    args: Record<string, never>
    result: void
  }
  'mt::rollback::status': {
    args: Record<string, never>
    result: {
      available: boolean
      previousVersion: string | null
      currentVersion: string
    }
  }
  'mt::rollback::restore': {
    args: Record<string, never>
    result: void
  }
  'mt::rollback::restore_outcome': {
    args: Record<string, never>
    result: { prefs: string; error: string; at: number } | null
  }
}

/**
 * Extension info returned from the M-045 registry. Matches the Rust
 * ExtensionInfo struct in m045_ext/registry.rs.
 */
export interface ExtensionInfo {
  id: string
  name: string
  version: string
  description: string | null
  install_url: string | null
  enabled: boolean
  healthy: boolean
  capabilities: string[]
}

export type CommandArgs<C extends CommandName> = CommandMap[C]['args']
export type CommandResult<C extends CommandName> = CommandMap[C]['result']
