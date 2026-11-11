// START_MODULE_CONTRACT
//   PURPOSE: M-013-A barrel — single import surface for renderer code.
//            `import { ipcInvoke, useIpcListener, ipcCorrelated, IpcError }
//            from '@/ipc/contract'` is the only sanctioned form.
//   SCOPE:   re-exports only. No runtime behavior.
//   DEPENDS: types.ts, invoke.ts, listener.ts, correlated.ts.
//   LINKS:   M-013-A; the v1 Electron-bridge surface (window.electron.*,
//            window.fileUtils.*, window.path.*) gets emulated by M-013-B
//            (next layer) that consumes M-013-A internally.
//
//   ROLE: BARREL
//   MAP_MODE: SUMMARY
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   Runtime API - typed invoke, listener, correlation and stable errors.
//   Document DTOs - required format, picker and snapshot request/reply types.
//   Command DTOs - command pairs, filesystem/search and extension shapes.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   - 2026-11-11: export the complete readonly DocumentFormat contract.
//   - 2026-04-28 B1-step-2: initial stub.

// END_CHANGE_SUMMARY

export { ipcInvoke } from './invoke'
export type { InvokeOptions } from './invoke'

export { useIpcListener, _refcountSnapshot } from './listener'
export type { IpcEventHandler, ListenerOptions } from './listener'

export { ipcCorrelated } from './correlated'
export type { CorrelatedOptions } from './correlated'

export {
  IpcError,
  IpcErrorCode,
  type CommandName,
  type CommandArgs,
  type CommandResult,
  type CommandMap,
  type SaveTargetRequest,
  type SaveTargetReply,
  type DocumentFormat,
  type DocumentWriteRequest,
  type DocumentWriteReply,
  type FsStat,
  type SearchOptions,
  type ExtensionInfo
} from './types'
