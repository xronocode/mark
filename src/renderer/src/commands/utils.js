// step-8b: import isWindows so the process.platform check below reads
// from the preload bridge (window.electron.process.platform) instead of
// direct Node-process. process.resourcesPath and process.env.APPIMAGE
// stay untouched here — they're owned by step-8d (env exposure) which
// will likely surface them via window.electron.process.{resourcesPath,
// env.APPIMAGE} after a follow-up preload extension.
import { isWindows } from '@/util'

/// Check whether the package is updatable at runtime.
export const isUpdatable = () => {
  // TODO: t('commands.utils.todoUpdateCheck')

  const resFile = window.fileUtils.isFile(window.path.join(process.resourcesPath, 'app-update.yml'))
  if (!resFile) {
    // t('commands.utils.noUpdateResourceFile')
    return false
  } else if (process.env.APPIMAGE) {
    // We are running as AppImage.
    return true
  } else if (
    isWindows &&
    window.fileUtils.isFile(window.path.join(process.resourcesPath, 'md.ico'))
  ) {
    // Windows is a little but tricky. The update resource file is always available and
    // there is no way to check the target type at runtime (electron-builder#4119).
    // As workaround we check whether "md.ico" exists that is only included in the setup.
    return true
  }

  // Otherwise assume that we cannot perform an auto update (standalone binary, archives,
  // packed for package manager).
  return false
}
