import './globalSetting'
import path from 'path'
import { app, dialog } from 'electron'
import log from 'electron-log'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { initialize as remoteInitializeServer } from '@electron/remote/main'

import cli from './cli'
import setupExceptionHandler, { initExceptionLogger } from './exceptionHandler'
import setupEnvironment from './app/env'
import { getLogLevel } from './utils'
import Accessor from './app/accessor'
import App from './app'

// -----------------------------------------------
// Exception handling and logging setup
setupExceptionHandler()
const args = cli()
const appEnvironment = setupEnvironment(args)

const initializeLogger = (env) => {
  log.initialize() // allows listening for logs from the renderer process
  log.transports.console.level = process.env.NODE_ENV === 'development' ? 'info' : 'error'
  log.transports.rendererConsole = null
  log.transports.file.resolvePathFn = (variables) => {
    if (variables.browserWindow && variables.browserWindow.id) {
      return path.join(env.paths.logPath, `renderer-${variables.browserWindow.id}.log`)
    }
    return path.join(env.paths.logPath, 'main.log')
  }
  log.transports.file.level = getLogLevel()
  log.transports.file.sync = true
  initExceptionLogger()
}
initializeLogger(appEnvironment)

// -----------------------------------------------
// Disable GPU if requested
if (args['--disable-gpu']) {
  app.disableHardwareAcceleration()
}

// Single instance lock (except macOS & development)
if (!process.mas && process.env.NODE_ENV !== 'development') {
  const gotLock = app.requestSingleInstanceLock()
  if (!gotLock) {
    process.stdout.write('Other instance detected: exiting...\n')
    process.exit(0)
  }
}

// Enable remote module for windows
remoteInitializeServer()

// Windows-specific AppUserModelID
electronApp.setAppUserModelId('com.electron.marktext')

// Dev shortcuts and reload suppression
app.on('browser-window-created', (_, window) => {
  optimizer.watchWindowShortcuts(window)
})

// Instantiate and start the main App controller
let accessor
try {
  accessor = new Accessor(appEnvironment)
} catch (err) {
  const msgHint = err.message.includes('Config schema violation')
    ? 'This seems to be an issue with your configuration file(s). '
    : ''
  log.error(`Initialization failed! ${msgHint}`, err)

  const EXIT_ON_ERROR = !!process.env.MARKTEXT_EXIT_ON_ERROR
  const SHOW_ERROR_DIALOG = !process.env.MARKTEXT_ERROR_INTERACTION
  if (!EXIT_ON_ERROR && SHOW_ERROR_DIALOG) {
    dialog.showErrorBox('Error during startup', `${msgHint}${err.message}\n\n${err.stack}`)
  }
  process.exit(1)
}
const appController = new App(accessor, args)
appController.init()

// Quit when all windows are closed (except on macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
