import { app, BrowserWindow, ipcMain, Menu } from 'electron'
import EventEmitter from 'events'
import log from 'electron-log'
import Watcher, {
  WATCHER_STABILITY_THRESHOLD,
  WATCHER_STABILITY_POLL_INTERVAL
} from '../filesystem/watcher'
import { WindowType } from '../windows/base'

class WindowActivityList {
  constructor() {
    // Oldest             Newest
    //  <number>, ... , <number>
    this._buf = []
  }

  getNewest() {
    const { _buf } = this
    if (_buf.length) {
      return _buf[_buf.length - 1]
    }
    return null
  }

  getSecondNewest() {
    const { _buf } = this
    if (_buf.length >= 2) {
      return _buf[_buf.length - 2]
    }
    return null
  }

  setNewest(id) {
    // I think we do not need a linked list for only a few windows.
    const { _buf } = this
    const index = _buf.indexOf(id)
    if (index !== -1) {
      const lastIndex = _buf.length - 1
      if (index === lastIndex) {
        return
      }
      _buf.splice(index, 1)
    }
    _buf.push(id)
  }

  delete(id) {
    const { _buf } = this
    const index = _buf.indexOf(id)
    if (index !== -1) {
      _buf.splice(index, 1)
    }
  }
}

class WindowManager extends EventEmitter {
  /**
   *
   * @param {AppMenu} appMenu The application menu instance.
   * @param {Preference} preferences The preference instance.
   */
  constructor(appMenu, preferences) {
    super()

    this._appMenu = appMenu
    this._preferences = preferences

    this._activeWindowId = null
    this._windows = new Map()
    this._windowActivity = new WindowActivityList()

    // TODO(need::refactor): Please see #1035.
    this._watcher = new Watcher(preferences)

    this._listenForIpcMain()
  }

  /**
   * Add the given window to the window list.
   *
   * @param {IApplicationWindow} window The application window. We take ownership!
   */
  add(window) {
    const { id: windowId } = window
    this._windows.set(windowId, window)

    if (!this._appMenu.has(windowId)) {
      this._appMenu.addDefaultMenu(windowId)
    }

    if (this.windowCount === 1) {
      this.setActiveWindow(windowId)
    }

    window.on('window-focus', () => {
      this.setActiveWindow(windowId)
    })
    window.on('window-closed', () => {
      this.remove(windowId)
      this._watcher.unwatchByWindowId(windowId)
    })
  }

  /**
   * Return the application window by id.
   *
   * @param {string} windowId The window id.
   * @returns {BaseWindow} The application window or undefined.
   */
  get(windowId) {
    return this._windows.get(windowId)
  }

  /**
   * Return the BrowserWindow by id.
   *
   * @param {string} windowId The window id.
   * @returns {Electron.BrowserWindow} The window or undefined.
   */
  getBrowserWindow(windowId) {
    const window = this.get(windowId)
    if (window) {
      return window.browserWindow
    }
    return undefined
  }

  /**
   * Remove the given window by id.
   *
   * NOTE: All window "window-focus" events listeners are removed!
   *
   * @param {string} windowId The window id.
   * @returns {IApplicationWindow} Returns the application window. We no longer take ownership.
   */
  remove(windowId) {
    const { _windows } = this
    const window = this.get(windowId)
    if (window) {
      window.removeAllListeners('window-focus')

      this._windowActivity.delete(windowId)
      const nextWindowId = this._windowActivity.getNewest()
      this.setActiveWindow(nextWindowId)

      _windows.delete(windowId)
    }
    return window
  }

  setActiveWindow(windowId) {
    if (this._activeWindowId !== windowId) {
      this._activeWindowId = windowId
      this._windowActivity.setNewest(windowId)
      if (windowId != null) {
        // windowId is null when all windows are closed (e.g. when gracefully closed).
        this._appMenu.setActiveWindow(windowId)
      }
      this.emit('activeWindowChanged', windowId)
    }
  }

  /**
   * Returns the active window or null if no window is registered.
   * @returns {BaseWindow|undefined}
   */
  getActiveWindow() {
    return this._windows.get(this._activeWindowId)
  }

  /**
   * Returns the active window id or null if no window is registered.
   * @returns {number|null}
   */
  getActiveWindowId() {
    return this._activeWindowId
  }

  /**
   * Returns the (last) active editor window or null if no editor is registered.
   * @returns {EditorWindow|undefined}
   */
  getActiveEditor() {
    let win = this.getActiveWindow()
    if (win && win.type !== WindowType.EDITOR) {
      win = this._windows.get(this._windowActivity.getSecondNewest())
      if (win && win.type === WindowType.EDITOR) {
        return win
      }
      return undefined
    }
    return win
  }

  /**
   * Returns the (last) active editor window id or null if no editor is registered.
   * @returns {number|null}
   */
  getActiveEditorId() {
    const win = this.getActiveEditor()
    return win ? win.id : null
  }

  /**
   *
   * @param {WindowType} type the WindowType one of ['base', 'editor', 'settings']
   * @returns {{id: number, win: BaseWindow}[]} Return the windows of the given {type}
   */
  getWindowsByType(type) {
    if (!WindowType[type.toUpperCase()]) {
      console.error(`"${type}" is not a valid window type.`)
    }
    const { windows } = this
    const result = []
    for (const [key, value] of windows) {
      if (value.type === type) {
        result.push({
          id: key,
          win: value
        })
      }
    }
    return result
  }

  /**
   * Find the best window to open the files in.
   *
   * @param {string[]} fileList File full paths.
   * @returns {{windowId: string, fileList: string[]}[]} An array of files mapped to a window id or null to open in a new window.
   */
  findBestWindowToOpenIn(fileList) {
    if (!fileList || !Array.isArray(fileList) || !fileList.length) return []
    const { windows } = this
    const lastActiveEditorId = this.getActiveEditorId() // editor id or null

    if (this.windowCount <= 1) {
      return [{ windowId: lastActiveEditorId, fileList }]
    }

    // Array of scores, same order like fileList.
    let filePathScores = null
    for (const window of windows.values()) {
      if (window.type === WindowType.EDITOR) {
        const scores = window.getCandidateScores(fileList)
        if (!filePathScores) {
          filePathScores = scores
        } else {
          const len = filePathScores.length
          for (let i = 0; i < len; ++i) {
            // Update score only if the file is not already opened.
            if (filePathScores[i].score !== -1 && filePathScores[i].score < scores[i].score) {
              filePathScores[i] = scores[i]
            }
          }
        }
      }
    }

    const buf = []
    const len = filePathScores.length
    for (let i = 0; i < len; ++i) {
      let { id: windowId, score } = filePathScores[i]

      if (score === -1) {
        // Skip files that already opened.
        continue
      } else if (score === 0) {
        // There is no best window to open the file(s) in.
        windowId = lastActiveEditorId
      }

      let item = buf.find((w) => w.windowId === windowId)
      if (!item) {
        item = { windowId, fileList: [] }
        buf.push(item)
      }
      item.fileList.push(fileList[i])
    }
    return buf
  }

  get windows() {
    return this._windows
  }

  get windowCount() {
    return this._windows.size
  }

  // --- helper ---------------------------------

  closeWatcher() {
    this._watcher.close()
  }

  /**
   * Closes the browser window and associated application window without asking to save documents.
   *
   * @param {Electron.BrowserWindow} browserWindow The browser window.
   */
  forceClose(browserWindow) {
    if (!browserWindow) {
      return false
    }

    const { id: windowId } = browserWindow
    const { _appMenu, _windows } = this

    // Free watchers used by this window
    this._watcher.unwatchByWindowId(windowId)

    // Application clearup and remove listeners
    _appMenu.removeWindowMenu(windowId)
    const window = this.remove(windowId)

    // Destroy window wrapper and browser window
    if (window) {
      window.destroy()
    } else {
      log.error('Something went wrong: Cannot find associated application window!')
      browserWindow.destroy()
    }

    // Quit application on macOS if not windows are opened.
    if (_windows.size === 0) {
      app.quit()
    }
    return true
  }

  /**
   * Closes the application window and associated browser window without asking to save documents.
   *
   * @param {number} windowId The application window or browser window id.
   */
  forceCloseById(windowId) {
    const browserWindow = this.getBrowserWindow(windowId)
    if (browserWindow) {
      return this.forceClose(browserWindow)
    }
    return false
  }

  // --- private --------------------------------

  _listenForIpcMain() {
    // HACK: Don't use this event! Please see #1034 and #1035
    ipcMain.on('mt::window-add-file-path', (e, filePath) => {
      const win = BrowserWindow.fromWebContents(e.sender)
      const editor = this.get(win.id)
      if (!editor) {
        log.error(`Cannot find window id "${win.id}" to add opened file.`)
        return
      }
      editor.addToOpenedFiles(filePath)
    })

    // Force close a BrowserWindow
    ipcMain.on('mt::close-window', (e) => {
      const win = BrowserWindow.fromWebContents(e.sender)
      this.forceClose(win)
    })

    ipcMain.on('mt::open-file', (e, filePath, options) => {
      const win = BrowserWindow.fromWebContents(e.sender)
      const editor = this.get(win.id)
      if (!editor) {
        log.error(`Cannot find window id "${win.id}" to open file.`)
        return
      }
      editor.openTab(filePath, options, true)
    })

    ipcMain.on('mt::window-tab-closed', (e, pathname) => {
      const win = BrowserWindow.fromWebContents(e.sender)
      const editor = this.get(win.id)
      if (editor) {
        editor.removeFromOpenedFiles(pathname)
      }
    })

    ipcMain.on('mt::window-toggle-always-on-top', (e) => {
      const win = BrowserWindow.fromWebContents(e.sender)
      const flag = !win.isAlwaysOnTop()
      win.setAlwaysOnTop(flag)
      this._appMenu.updateAlwaysOnTopMenu(win.id, flag)
    })

    // V-A6-7: renderer's projectStore.CLOSE_PROJECT(rootPathname) sends this.
    // Resolve the EditorWindow scope strictly via fromWebContents (sender
    // identity), never trust the pathname payload as a cross-window key —
    // a path that's a root of window 1 must not be closeable from window 2.
    ipcMain.on('mt::close-project-root', (e, pathname) => {
      const win = BrowserWindow.fromWebContents(e.sender)
      if (!win || win.isDestroyed()) {
        log.debug('[WindowManager][onCloseProjectRoot][BLOCK_SKIP_DEAD_WINDOW] reason=fromWebContents-null')
        return
      }
      log.debug(`[WindowManager][onCloseProjectRoot][BLOCK_DISPATCH] winId=${win.id} path=${pathname}`)
      const editor = this.get(win.id)
      if (!editor || typeof editor.closeFolder !== 'function') {
        log.debug(`[WindowManager][onCloseProjectRoot][BLOCK_NOOP_UNKNOWN_PATH] winId=${win.id} path=${pathname}`)
        return
      }
      // editor.closeFolder is idempotent — unknown path → no-op + miss log.
      editor.closeFolder(pathname)
    })

    // v1.0.3: auto-resize feature disabled. v1.0.1's
    // `mt::request-window-content-size` handler was implicated in a
    // silent main-process exit on cold start (after this listener was
    // hit by the renderer's bootstrap-editor flow, the app would quit
    // within ~1.5s). Until the root cause is understood and properly
    // gated, we remove the IPC handler entirely. The renderer side
    // still emits the IPC but main no longer listens, which is a safe
    // no-op — Electron drops unhandled ipcMain.on messages silently.
    // Re-introduce in v1.1.0 with proper sequencing tests.

    // --- local events ---------------

    ipcMain.on('watcher-unwatch-all-by-id', (windowId) => {
      this._watcher.unwatchByWindowId(windowId)
    })
    ipcMain.on('watcher-watch-file', (win, filePath) => {
      this._watcher.watch(win, filePath, 'file')
    })
    ipcMain.on('watcher-watch-directory', (win, pathname) => {
      this._watcher.watch(win, pathname, 'dir')
    })
    ipcMain.on('watcher-unwatch-file', (win, filePath) => {
      this._watcher.unwatch(win, filePath, 'file')
    })
    ipcMain.on('watcher-unwatch-directory', (win, pathname) => {
      this._watcher.unwatch(win, pathname, 'dir')
    })

    ipcMain.on('window-add-file-path', (windowId, filePath) => {
      const editor = this.get(windowId)
      if (!editor) {
        log.error(`Cannot find window id "${windowId}" to add opened file.`)
        return
      }
      editor.addToOpenedFiles(filePath)
    })
    ipcMain.on('window-change-file-path', (windowId, pathname, oldPathname) => {
      const editor = this.get(windowId)
      if (!editor) {
        log.error(`Cannot find window id "${windowId}" to change file path.`)
        return
      }
      editor.changeOpenedFilePath(pathname, oldPathname)
    })

    ipcMain.on('window-file-saved', (windowId, pathname) => {
      // A changed event is emitted earliest after the stability threshold.
      const duration = WATCHER_STABILITY_THRESHOLD + WATCHER_STABILITY_POLL_INTERVAL * 2
      this._watcher.ignoreChangedEvent(windowId, pathname, duration)
    })

    ipcMain.on('window-close-by-id', (id) => {
      this.forceCloseById(id)
    })
    ipcMain.on('window-reload-by-id', (id) => {
      const window = this.get(id)
      if (window) {
        window.reload()
      }
    })
    ipcMain.on('window-toggle-always-on-top', (win) => {
      const flag = !win.isAlwaysOnTop()
      win.setAlwaysOnTop(flag)
      this._appMenu.updateAlwaysOnTopMenu(win.id, flag)
    })

    ipcMain.on('broadcast-preferences-changed', (prefs) => {
      // We can not dynamic change the title bar style, so do not need to send it to renderer.
      if (typeof prefs.titleBarStyle !== 'undefined') {
        delete prefs.titleBarStyle
      }
      if (Object.keys(prefs).length > 0) {
        for (const { browserWindow } of this._windows.values()) {
          browserWindow.webContents.send('mt::user-preference', prefs)
        }
      }
    })

    ipcMain.on('broadcast-user-data-changed', (userData) => {
      for (const { browserWindow } of this._windows.values()) {
        browserWindow.webContents.send('mt::user-preference', userData)
      }
    })

    // step-8f: window-control IPCs replacing @electron/remote.getCurrentWindow()
    // calls in renderer (titleBar, commands, preferences titlebar). Each
    // resolver uses BrowserWindow.fromWebContents(e.sender) so the action
    // is scoped to the calling window — matches the previous semantics
    // of getCurrentWindow().{minimize,maximize,unmaximize,setFullScreen}
    // without the @electron/remote round-trip.
    ipcMain.on('mt::window-minimize', (e) => {
      const win = BrowserWindow.fromWebContents(e.sender)
      if (win) win.minimize()
    })

    ipcMain.on('mt::window-maximize-toggle', (e) => {
      const win = BrowserWindow.fromWebContents(e.sender)
      if (!win) return
      // Mirrors titleBar handleMaximizeClick original logic exactly:
      // fullscreen → exit fullscreen (no maximize change),
      // maximized   → unmaximize,
      // otherwise   → maximize.
      if (win.isFullScreen()) {
        win.setFullScreen(false)
      } else if (win.isMaximized()) {
        win.unmaximize()
      } else {
        win.maximize()
      }
    })

    ipcMain.on('mt::window-fullscreen-toggle', (e) => {
      const win = BrowserWindow.fromWebContents(e.sender)
      if (win) win.setFullScreen(!win.isFullScreen())
    })

    ipcMain.handle('mt::window-state', (e) => {
      const win = BrowserWindow.fromWebContents(e.sender)
      if (!win) return { isMaximized: false, isFullScreen: false }
      return {
        isMaximized: win.isMaximized(),
        isFullScreen: win.isFullScreen()
      }
    })

    // step-8g: native context-menu popup with serialized spec.
    // Renderer sends `{ items: [{ label, id, enabled?, accelerator?,
    // type? }, ...], x, y }`. Main builds a Menu, popups it on the
    // calling BrowserWindow, and resolves the Promise with the clicked
    // item's id (or null if dismissed without selection). Click handlers
    // remain on the renderer side, indexed by id.
    ipcMain.handle('mt::window-popup-context-menu', (e, payload) => {
      const win = BrowserWindow.fromWebContents(e.sender)
      if (!win || !payload || !Array.isArray(payload.items)) return null
      return new Promise((resolve) => {
        let resolved = false
        const finish = (val) => {
          if (!resolved) {
            resolved = true
            resolve(val)
          }
        }
        const template = payload.items.map((item) => {
          if (!item || item.type === 'separator') return { type: 'separator' }
          return {
            label: String(item.label ?? ''),
            id: item.id,
            enabled: item.enabled !== false,
            accelerator: item.accelerator,
            click: () => finish(item.id ?? null)
          }
        })
        const menu = Menu.buildFromTemplate(template)
        menu.popup({
          window: win,
          x: Number.isFinite(payload.x) ? payload.x | 0 : undefined,
          y: Number.isFinite(payload.y) ? payload.y | 0 : undefined,
          callback: () => finish(null)
        })
      })
    })

    // step-8g: popup the application menu at the requested coordinates.
    // Replaces titleBar/index.vue's RemoteMenu.getApplicationMenu().popup
    // call. Application-menu click handlers are already main-side, so
    // this IPC is fire-and-forget.
    ipcMain.on('mt::window-popup-app-menu', (e, coords) => {
      const win = BrowserWindow.fromWebContents(e.sender)
      const appMenu = Menu.getApplicationMenu()
      if (!win || !appMenu) return
      appMenu.popup({
        window: win,
        x: Number.isFinite(coords?.x) ? coords.x | 0 : undefined,
        y: Number.isFinite(coords?.y) ? coords.y | 0 : undefined
      })
    })
  }
}

export default WindowManager
