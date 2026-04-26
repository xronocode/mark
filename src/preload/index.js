import { contextBridge, shell, clipboard, webUtils } from 'electron'
import fs from 'fs-extra'
import { tmpdir } from 'os'
import { isFile, isDirectory, ensureDirSync } from 'common/filesystem'
import { electronAPI } from '@electron-toolkit/preload'
import {
  isChildOfDirectory,
  hasMarkdownExtension,
  MARKDOWN_INCLUSIONS,
  isSamePathSync,
  isImageFile
} from 'common/filesystem/paths'
import { rgPath } from '@vscode/ripgrep'
import path from 'path'
import commandExists from 'command-exists'
import { loadTranslations } from '../common/i18n'

const i18nUtils = {
  loadTranslations
}

const customElectronAPI = {
  shell,
  clipboard,
  webUtils,
  // step-8d: expose process.resourcesPath via the bridge.
  // @electron-toolkit/preload's electronAPI exposes process.{platform,
  // versions, env} but NOT resourcesPath, which is Electron-specific
  // and used by isUpdatable() in renderer/commands/utils.js.
  resourcesPath: process.resourcesPath,
  // step-8j: expose os.tmpdir() resolved once at preload time. tmpdir
  // does not change during a process lifetime, so caching is correct
  // and avoids an IPC roundtrip per upload.
  tmpDir: tmpdir()
}

const fileUtilsAPI = {
  isFile: (path) => isFile(path),
  isDirectory: (path) => isDirectory(path),
  emptyDir: (path) => fs.emptyDir(path),
  copy: (src, dest) => fs.copy(src, dest),
  ensureDir: (path) => fs.ensureDir(path),
  outputFile: (path, data) => fs.outputFile(path, data),
  move: (src, dest, options) => fs.move(src, dest, options),
  stat: (path) => fs.stat(path),
  writeFile: (path, data, options) => fs.writeFile(path, data, options),
  // step-8a: parametric encoding so renderer callers can request 'utf8'
  // and receive a String directly. Pass null/undefined for raw Buffer.
  readFile: (path, encoding) => fs.readFile(path, encoding),
  // step-8a: async directory listing — replaces fs.readdirSync in
  // renderer (loadThemesFromDisk and similar). Returns Promise<string[]>
  // of entry names (NOT full paths).
  readdir: (path) => fs.readdir(path),
  ensureDirSync: (path) => ensureDirSync(path),
  pathExistsSync: (path) => fs.pathExistsSync(path),
  isChildOfDirectory: (dir, child) => isChildOfDirectory(dir, child),
  hasMarkdownExtension: (filename) => hasMarkdownExtension(filename),
  MARKDOWN_INCLUSIONS,
  isSamePathSync: (pathA, pathB) => isSamePathSync(pathA, pathB),
  isImageFile: (filepath) => isImageFile(filepath)
}

const commandAPI = {
  exists: (command) => {
    try {
      // 先尝试使用 command-exists 检查
      if (commandExists.sync(command)) {
        return true
      }

      // 对于 picgo，额外检查常见安装路径
      if (command === 'picgo' && process.platform === 'darwin') {
        const commonPaths = [
          '/usr/local/bin/picgo',
          '/opt/homebrew/bin/picgo',
          `${process.env.HOME}/.npm-global/bin/picgo`,
          `${process.env.HOME}/.npm/bin/picgo`,
          '/usr/local/lib/node_modules/.bin/picgo'
        ]

        for (const picgoPath of commonPaths) {
          if (fs.pathExistsSync(picgoPath)) {
            console.log(`Found picgo at: ${picgoPath}`)
            return true
          }
        }
      }

      return false
    } catch (error) {
      console.error('Error checking command existence:', error)
      return false
    }
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', {
      ...electronAPI,
      ...customElectronAPI
    })
    contextBridge.exposeInMainWorld('rgPath', rgPath)
    contextBridge.exposeInMainWorld('fileUtils', fileUtilsAPI)
    contextBridge.exposeInMainWorld('path', path)
    contextBridge.exposeInMainWorld('commandExists', commandAPI)
    contextBridge.exposeInMainWorld('i18nUtils', i18nUtils)
  } catch (error) {
    console.error(error)
  }
} else {
  window.electron = { ...electronAPI, ...customElectronAPI }
  window.rgPath = rgPath
  window.fileUtils = fileUtilsAPI
  window.path = path
  window.commandExists = commandAPI
  window.i18nUtils = i18nUtils
}
