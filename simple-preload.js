const { contextBridge } = require('electron')

console.log('[MINIMAL-PRELOAD] Starting minimal preload script...')

// 最简化的 commandAPI - 模拟实现
const commandAPI = {
  exists: (command) => {
    console.log(`[MINIMAL-PRELOAD] Checking command: ${command}`)
    // 模拟检查结果，实际项目中需要通过 IPC 与主进程通信
    const commonCommands = ['node', 'npm', 'git', 'python', 'java']
    const result = commonCommands.includes(command)
    console.log(`[MINIMAL-PRELOAD] Command '${command}' result: ${result}`)
    return result
  }
}

// 简化的 electronAPI
const customElectronAPI = {
  logToConsole: (message) => {
    console.log('[MINIMAL-PRELOAD]', message)
  },
  writeLogFile: async (filename, content) => {
    console.log(`[MINIMAL-PRELOAD] Would write log file: ${filename}`)
    console.log(`[MINIMAL-PRELOAD] Content: ${content}`)
    return Promise.resolve()
  }
}

console.log('[MINIMAL-PRELOAD] APIs defined, checking context isolation...')

// 检查是否启用了上下文隔离
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electronAPI', customElectronAPI)
    contextBridge.exposeInMainWorld('commandExists', commandAPI)
    console.log('[MINIMAL-PRELOAD] APIs exposed via contextBridge successfully')
  } catch (error) {
    console.error('[MINIMAL-PRELOAD] Failed to expose APIs via contextBridge:', error)
  }
} else {
  // 直接挂载到 window 对象
  window.electronAPI = customElectronAPI
  window.commandExists = commandAPI
  console.log('[MINIMAL-PRELOAD] APIs attached to window object successfully')
}

console.log('[MINIMAL-PRELOAD] Minimal preload script loaded successfully')