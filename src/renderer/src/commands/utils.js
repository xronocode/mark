// step-8b: isWindows from @/util reads window.electron.process.platform
//          via preload (no direct process.platform here).
// step-8d: process.resourcesPath → window.electron.resourcesPath (added
//          to customElectronAPI in preload because @electron-toolkit/preload
//          does not surface resourcesPath itself).
//          process.env.APPIMAGE → window.electron.process.env.APPIMAGE
//          (toolkit's electronAPI spreads process.env into the bridge).
import { isWindows } from '@/util'

/// Check whether the package is updatable at runtime.
export const isUpdatable = () => {
  // TODO: t('commands.utils.todoUpdateCheck')

  const resourcesPath = window.electron.resourcesPath
  const resFile = window.fileUtils.isFile(window.path.join(resourcesPath, 'app-update.yml'))
  if (!resFile) {
    // t('commands.utils.noUpdateResourceFile')
    return false
  } else if (window.electron.process.env.APPIMAGE) {
    // We are running as AppImage.
    return true
  } else if (
    isWindows &&
    window.fileUtils.isFile(window.path.join(resourcesPath, 'md.ico'))
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
