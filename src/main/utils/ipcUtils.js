import { ipcMain } from 'electron'
/**
 * This wrapper helps parse all arguments parsed to the listener of an "on" function
 */
export const ipcMainWrapper = {
  on: (channel, listener) => {
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
    ipcMain.on(channel, wrappedListener)
    return ipcMain
  },
  emit: (channel, ...args) => {
    const stringifiedArgs = args.map((arg) => {
      try {
        return JSON.stringify(arg)
      } catch (e) {
        return arg
      }
    })
    ipcMain.emit(channel, ...stringifiedArgs)
  },
  handle: (channel, listener) => {
    const wrappedListener = (event, ...args) => {
      const parsedArgs = args.map((arg) => {
        try {
          return JSON.parse(arg)
        } catch (e) {
          return arg
        }
      })
      const results = listener(event, ...parsedArgs)
      return JSON.stringify(results)
    }
    ipcMain.handle(channel, wrappedListener)
  }
}
