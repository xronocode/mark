// FILE: src/renderer/src/ipc/runtime/documentSave.ts
// START_MODULE_CONTRACT
//   PURPOSE: Typed destination selection and correlated complete-snapshot writes.
//   SCOPE: No swallowed responses or artificial cancellation of native work.
//   DEPENDS: M-013-A ipcInvoke and document DTOs.
//   LINKS: M-001/M-013-A/M-013-B; C-SAVE-CLOSE-DATA-SAFETY.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   ipcDocumentSave - chooseTarget and writeSnapshot with actual-settlement tracking.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   LAST_CHANGE: 2026-11-10 Split picker from payload collection and write.
// END_CHANGE_SUMMARY
import { ipcInvoke, type SaveTargetRequest, type DocumentWriteRequest } from '../contract'
export const ipcDocumentSave = {
  chooseTarget(request: SaveTargetRequest) {
    return ipcInvoke('mt::document::choose_save_target', { request }, { timeoutMs: Infinity })
  },
  writeSnapshot(request: DocumentWriteRequest) {
    const {requestId,documentToken,id,revision,sourcePath,targetPath,markdown,ownedPaths}=request
    return ipcInvoke('mt::document::write_snapshot', { request:{requestId,documentToken,id,revision,sourcePath,targetPath,markdown,ownedPaths} }, { timeoutMs: Infinity })
  }
}
