const { contextBridge } = require('electron')
const commandExists = require('command-exists')
const path = require('path')

// 简化的 commandAPI
const commandAPI = {
  exists: (command) => {
    try {
      return commandExists.sync(command)
    } catch (error) {
      console.error('Command exists check failed:', error)
      return false
    }
  }
}

// 简化的 electronAPI
const customElectronAPI = {
  logToConsole: (message) => {
    console.log('[PRELOAD]', message)
  },
  writeLogFile: async (filename, content) => {
    try {
      const fs = require('fs').promises
      await fs.writeFile(filename, content, 'utf8')
      console.log('[PRELOAD] Log file written:', filename)
    } catch (error) {
      console.error('[PRELOAD] Failed to write log file:', error)
    }
  }
}

// 检查是否启用了上下文隔离
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electronAPI', customElectronAPI)
    contextBridge.exposeInMainWorld('commandExists', commandAPI)
    contextBridge.exposeInMainWorld('path', path)
    console.log('[PRELOAD] APIs exposed via contextBridge')
  } catch (error) {
    console.error('[PRELOAD] Failed to expose APIs via contextBridge:', error)
  }
} else {
  // 直接挂载到 window 对象
  window.electronAPI = customElectronAPI
  window.commandExists = commandAPI
  window.path = path
  console.log('[PRELOAD] APIs attached to window object')
}

console.log('[PRELOAD] Test preload script loaded successfully')
