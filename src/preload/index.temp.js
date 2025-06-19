import { contextBridge, shell, clipboard, ipcRenderer } from 'electron'
import log from 'electron-log'
import fs from 'fs-extra'
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

const customElectronAPI = {
  shell,
  log,
  clipboard
}

const listenerMap = new WeakMap()

// We define a wrapper so that our send function JSON parses everything beforehand
const ipcRendererWrapper = {
  send: (channel, ...args) => {
    ipcRenderer.send(channel, ...args.map((arg) => JSON.stringify(arg)))
  },

  invoke: async (channel, ...args) => {
    const result = await ipcRenderer.invoke(channel, ...args.map((arg) => JSON.stringify(arg)))
    try {
      return JSON.parse(result)
    } catch {
      return result
    }
  },

  on: (channel, listener) => {
    const wrappedListener = (event, ...args) => {
      const parsedArgs = args.map((arg) => {
        try {
          return JSON.parse(arg)
        } catch (e) {
          console.log(e)
          return arg
        }
      })
      listener(event, ...parsedArgs)
    }
    listenerMap.set(listener, wrappedListener)
    ipcRenderer.on(channel, wrappedListener)
    return ipcRenderer
  },

  once: (channel, listener) => {
    const wrappedListener = (event, ...args) => {
      const parsedArgs = args.map((arg) => {
        try {
          return JSON.parse(arg)
        } catch (e) {
          return arg
        }
      })
      listener(event, ...parsedArgs)
    }
    ipcRenderer.once(channel, wrappedListener)
    return ipcRenderer
  },

  removeListener: (channel, listener) => {
    const wrappedListener = listenerMap.get(listener)
    if (wrappedListener) {
      ipcRenderer.removeListener(channel, wrappedListener)
      listenerMap.delete(listener)
    }
    return ipcRenderer
  },

  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel)
    return ipcRenderer
  }
}

const fileUtilsAPI = {
  isFile: (path) => isFile(path),
  isDirectory: (path) => isDirectory(path),
  emptyDir: (path) => fs.emptyDir(path),
  copy: (src, dest) => fs.copy(src, dest),
  ensureDir: (path) => fs.ensureDir(path),
  outputFile: (path, data) => fs.outputFile(path, data),
  move: (src, dest) => fs.move(src, dest),
  stat: (path) => fs.stat(path),
  writeFile: (path, data) => fs.writeFile(path, data),
  readFile: (path) => fs.readFile(path),
  ensureDirSync: (path) => ensureDirSync(path),
  pathExistsSync: (path) => fs.pathExistsSync(path),
  isChildOfDirectory: (dir, child) => isChildOfDirectory(dir, child),
  hasMarkdownExtension: (filename) => hasMarkdownExtension(filename),
  MARKDOWN_INCLUSIONS: MARKDOWN_INCLUSIONS,
  isSamePathSync: (pathA, pathB) => isSamePathSync(pathA, pathB),
  isImageFile: (filepath) => isImageFile(filepath)
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', {
      ...electronAPI,
      ipcRenderer: ipcRendererWrapper,
      ...customElectronAPI
    })
    contextBridge.exposeInMainWorld('rgPath', rgPath)
    contextBridge.exposeInMainWorld('fileUtils', fileUtilsAPI)
  } catch (error) {
    console.error(error)
  }
} else {
  window.electron = { ...electronAPI, ipcRenderer: ipcRendererWrapper, ...customElectronAPI }
  window.rgPath = rgPath
  window.fileUtils = fileUtilsAPI
}
