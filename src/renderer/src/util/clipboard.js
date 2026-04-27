import { isLinux, isOsx, isWindows } from './index'
import plist from 'plist'
// step-8e: @electron/remote.clipboard → window.electron.clipboard.
// Preload (src/preload/index.js customElectronAPI) imports clipboard
// directly from 'electron' and exposes it on the bridge — same API
// surface as @electron/remote.clipboard, but works without the
// @electron/remote shim and remains valid after step-8z flips
// contextIsolation:true / nodeIntegration:false. Variable name kept
// as `remoteClipboard` to minimize the diff in the four call sites
// below; future cleanup may rename to `nativeClipboard`.
const remoteClipboard = window.electron.clipboard

const hasClipboardFiles = () => {
  return remoteClipboard.has('NSFilenamesPboardType')
}

const getClipboardFiles = () => {
  if (!hasClipboardFiles()) {
    return []
  }
  return plist.parse(remoteClipboard.read('NSFilenamesPboardType'))
}

export const guessClipboardFilePath = () => {
  if (isLinux) return ''
  if (isOsx) {
    const result = getClipboardFiles()
    return Array.isArray(result) && result.length ? result[0] : ''
  } else if (isWindows) {
    const rawFilePath = remoteClipboard.read('FileNameW')
    const filePath = rawFilePath.replace(new RegExp(String.fromCharCode(0), 'g'), '')
    return filePath && typeof filePath === 'string' ? filePath : ''
  } else {
    return ''
  }
}
