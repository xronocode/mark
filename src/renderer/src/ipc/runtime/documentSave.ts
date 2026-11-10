// FILE: src/renderer/src/ipc/runtime/documentSave.ts
// START_MODULE_CONTRACT
//   PURPOSE: Typed destination selection and correlated complete-snapshot writes.
//   SCOPE: Strict shared-catalog format validation and defensive payload copies; no artificial cancellation of native work.
//   DEPENDS: M-013-A ipcInvoke, document DTOs and shared fileFormatCatalog.json.
//   LINKS: M-001/M-013-A/M-013-B; C-SAVE-CLOSE-DATA-SAFETY.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   ipcDocumentSave - chooseTarget and writeSnapshot with actual-settlement tracking.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   LAST_CHANGE: 2026-11-11: require validated complete format and defensive write payloads.
// END_CHANGE_SUMMARY
import { ipcInvoke, type SaveTargetRequest, type DocumentWriteRequest, type DocumentFormat } from '../contract'
import catalog from '../../../../common/fileFormatCatalog.json'

const copyFormat = (format: DocumentFormat): DocumentFormat => {
  const codec = catalog.find(entry => entry.id === format?.encoding)
  if (!codec) throw Error('MT_ENC_UNKNOWN')
  if (!codec.supported) throw Error('MT_ENC_UNSUPPORTED')
  if (typeof format.isBom !== 'boolean' || (format.isBom && !['utf8','utf16le','utf16be'].includes(format.encoding)) ||
      !['lf','crlf','mixed'].includes(format.lineEnding) || ![0,1,3].includes(format.finalNewline)) throw Error('MT_ENC_INVALID_POLICY')
  return Object.freeze({ encoding:format.encoding,isBom:format.isBom,lineEnding:format.lineEnding,finalNewline:format.finalNewline })
}
export const ipcDocumentSave = {
  chooseTarget(request: SaveTargetRequest) {
    return ipcInvoke('mt::document::choose_save_target', { request }, { timeoutMs: Infinity })
  },
  writeSnapshot(request: DocumentWriteRequest) {
    const {requestId,documentToken,id,revision,sourcePath,targetPath,markdown,format,ownedPaths}=request
    return ipcInvoke('mt::document::write_snapshot', { request:{requestId,documentToken,id,revision,sourcePath,targetPath,markdown,format:copyFormat(format),ownedPaths:ownedPaths.map(path=>({...path}))} }, { timeoutMs: Infinity })
  }
}
