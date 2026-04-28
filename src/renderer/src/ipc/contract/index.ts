// MODULE_CONTRACT
//   PURPOSE: M-013a barrel — single import surface for renderer code.
//            `import { ipcInvoke, useIpcListener, ipcCorrelated, IpcError }
//            from '@/ipc/contract'` is the only sanctioned form.
//   SCOPE:   re-exports only. No runtime behavior.
//   DEPENDS: types.ts, invoke.ts, listener.ts, correlated.ts.
//   LINKS:   M-013a; the v1 Electron-bridge surface (window.electron.*,
//            window.fileUtils.*, window.path.*) gets emulated by M-013b
//            (next layer) that consumes M-013a internally.
//
// CHANGE_SUMMARY:
//   - 2026-04-28 B1-step-2: initial stub.

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
  type CommandMap
} from './types'
