// MODULE_CONTRACT
//   PURPOSE: V-M-013a deterministic surface check. Type-level only — no
//            runtime Tauri context required, no actual IPC dispatched.
//   SCOPE:   verify that the M-013a public API is exported with the names
//            and shapes the contract promises. If a future refactor renames
//            ipcInvoke / useIpcListener / ipcCorrelated or removes any of
//            the four IpcErrorCode entries, `tsc --noEmit` fails here.
//   STATUS:  Phase-B1 stub. Runtime tests (real invoke against a mock Tauri
//            handler) deferred to B2 once the dev URL boots.
//
// CHANGE_SUMMARY:
//   - 2026-04-28 B1-step-2: initial stub.

import {
  ipcInvoke,
  useIpcListener,
  ipcCorrelated,
  IpcError,
  IpcErrorCode,
  type CommandName,
  type InvokeOptions,
  type ListenerOptions,
  type CorrelatedOptions
} from './index'

// ---------------------------------------------------------------
// 1. The four error codes named in the M-013a contract MUST exist.
//    docs/development-plan.xml M-013a contract.errors lists exactly:
//    MT_IPC_UNKNOWN_COMMAND, MT_IPC_TIMEOUT, MT_IPC_VALIDATION,
//    MT_IPC_UNKNOWN_CHANNEL.
// ---------------------------------------------------------------
const _codes: Record<keyof typeof IpcErrorCode, string> = {
  UNKNOWN_COMMAND: IpcErrorCode.UNKNOWN_COMMAND,
  TIMEOUT: IpcErrorCode.TIMEOUT,
  VALIDATION: IpcErrorCode.VALIDATION,
  UNKNOWN_CHANNEL: IpcErrorCode.UNKNOWN_CHANNEL
}
void _codes

// Stable string values — telemetry consumers depend on these.
const _stableTags: Array<'MT_IPC_UNKNOWN_COMMAND' | 'MT_IPC_TIMEOUT' | 'MT_IPC_VALIDATION' | 'MT_IPC_UNKNOWN_CHANNEL'> = [
  IpcErrorCode.UNKNOWN_COMMAND,
  IpcErrorCode.TIMEOUT,
  IpcErrorCode.VALIDATION,
  IpcErrorCode.UNKNOWN_CHANNEL
]
void _stableTags

// ---------------------------------------------------------------
// 2. ipcInvoke MUST be a typed function: command name constrains
//    args+result shape. Using an unknown command name fails compile.
// ---------------------------------------------------------------
async function _invokeShape() {
  const result = await ipcInvoke('mt::ping', { nonce: 'x' })
  // result.pong is `true` literal per CommandMap['mt::ping'].result
  const _pong: true = result.pong
  // result.nonce can be undefined per CommandMap definition
  const _nonce: string | undefined = result.nonce
  void _pong
  void _nonce

  // Timeout option must be number
  const _opt: InvokeOptions = { timeoutMs: 5_000 }
  void _opt

  // @ts-expect-error — unknown commands must not type-check
  await ipcInvoke('mt::not_a_real_command', {})
}
void _invokeShape

// ---------------------------------------------------------------
// 3. useIpcListener returns a Promise of a dispose function.
//    ListenerOptions.manual exists.
// ---------------------------------------------------------------
async function _listenerShape() {
  const dispose = await useIpcListener<{ x: number }>('mt::ping', (payload) => {
    const _x: number = payload.x
    void _x
  })
  const _disposed: void = dispose()
  void _disposed

  const _opt: ListenerOptions = { manual: true }
  void _opt
}
void _listenerShape

// ---------------------------------------------------------------
// 4. ipcCorrelated returns Promise<R>. CorrelatedOptions extends
//    InvokeOptions and adds responseChannel + correlatedTimeoutMs.
// ---------------------------------------------------------------
async function _correlatedShape() {
  const r = await ipcCorrelated('mt::ping', { nonce: 'y' }, {
    responseChannel: 'mt::ping::response',
    correlatedTimeoutMs: 60_000,
    timeoutMs: 5_000 // inherited from InvokeOptions
  })
  // R defaults to CommandResult<C> — i.e. CommandMap['mt::ping'].result
  const _pong: true = r.pong
  void _pong

  const _opt: CorrelatedOptions = { responseChannel: 'x' }
  void _opt
}
void _correlatedShape

// ---------------------------------------------------------------
// 5. IpcError instances are tagged + carry the stable code.
// ---------------------------------------------------------------
const _err = new IpcError(IpcErrorCode.TIMEOUT, 'msg', 'mt::ping')
const _isError: boolean = _err instanceof Error
const _code: 'MT_IPC_TIMEOUT' | 'MT_IPC_UNKNOWN_COMMAND' | 'MT_IPC_VALIDATION' | 'MT_IPC_UNKNOWN_CHANNEL' = _err.code
void _isError
void _code

// ---------------------------------------------------------------
// 6. CommandName MUST start with `mt::`. Today only `mt::ping`
//    exists; B2/B3 extend the union.
// ---------------------------------------------------------------
const _cmdName: CommandName = 'mt::ping'
void _cmdName
