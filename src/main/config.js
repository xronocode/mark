import path from 'path'
export const isOsx = process.platform === 'darwin'
export const isWindows = process.platform === 'win32'
export const isLinux = process.platform === 'linux'

export const editorWinOptions = Object.freeze({
  minWidth: 550,
  minHeight: 350,
  webPreferences: {
    // step-8z: contextIsolation:false → true. preload's contextBridge
    // path now activates and seals the renderer's window.electron /
    // window.fileUtils / window.path / window.commandExists /
    // window.i18nUtils / window.rgPath surface against tampering. The
    // contextIsolated branch in src/preload/index.js was already in
    // place from day one — only the runtime gate flips here.
    contextIsolation: true,
    // WORKAROUND: We cannot enable spellcheck if it was disabled during
    // renderer startup due to a bug in Electron (Electron#32755). We'll
    // enable it always and set the HTML spelling attribute to false.
    spellcheck: true,
    // step-8z: nodeIntegration:true → false. Renderer no longer has
    // direct access to Node-core. Every Node-shaped API the renderer
    // uses is brokered by preload (window.fileUtils, window.path,
    // window.electron.process.env, etc.) or by mt::* IPC handlers.
    nodeIntegration: false,
    // step-8z: webSecurity left at false intentionally — Mark loads
    // user-selected images and theme CSS via file:// URLs, which
    // the same-origin policy would block. Tightening this is a
    // separate v1.3 ticket: route file:// access through a custom
    // protocol handler with explicit allow-list.
    webSecurity: false,
    preload: path.join(__dirname, '../preload/index.js')
  },
  useContentSize: true,
  show: true,
  frame: false,
  titleBarStyle: 'hiddenInset',
  zoomFactor: 1.0
})

export const preferencesWinOptions = Object.freeze({
  minWidth: 450,
  minHeight: 350,
  width: 950,
  height: 650,
  webPreferences: {
    // step-8z: see editorWinOptions for rationale. Same flip applied
    // here so Preferences window benefits from the same isolation
    // posture as the editor.
    contextIsolation: true,
    // Always true to access native spellchecker.
    spellcheck: true,
    nodeIntegration: false,
    webSecurity: false,
    preload: path.join(__dirname, '../preload/index.js')
  },
  fullscreenable: false,
  fullscreen: false,
  minimizable: false,
  useContentSize: true,
  show: true,
  frame: false,
  // On macOS, hiddenInset shows the native traffic-light buttons (close/min/max)
  // at the top-left and gives us a transparent draggable strip — same chrome the
  // editor uses, instead of the custom right-side close button. Ignored on
  // Windows/Linux where `frame: false` keeps the existing custom titlebar.
  titleBarStyle: 'hiddenInset',
  thickFrame: !isOsx,
  zoomFactor: 1.0
})

export const PANDOC_EXTENSIONS = Object.freeze([
  'html',
  'docx',
  'odt',
  'latex',
  'tex',
  'ltx',
  'rst',
  'rest',
  'org',
  'wiki',
  'dokuwiki',
  'textile',
  'opml',
  'epub'
])

export const BLACK_LIST = Object.freeze(['$RECYCLE.BIN'])

export const EXTENSION_HASN = Object.freeze({
  styledHtml: '.html',
  pdf: '.pdf'
})

export const TITLE_BAR_HEIGHT = isOsx ? 21 : 32
export const LINE_ENDING_REG = /(?:\r\n|\n)/g
export const LF_LINE_ENDING_REG = /(?:[^\r]\n)|(?:^\n$)/
export const CRLF_LINE_ENDING_REG = /\r\n/

export const GITHUB_REPO_URL = 'https://github.com/xronocode/mark'
// copy from muya
export const URL_REG =
  /^http(s)?:\/\/([a-z0-9\-._~]+\.[a-z]{2,}|[0-9.]+|localhost|\[[a-f0-9.:]+\])(:[0-9]{1,5})?(\/[\S]+)?/i
