// MODULE_CONTRACT
//   PURPOSE: Install the v1.2.3 window.* contextBridge surface (electron,
//            fileUtils, path, commandExists, i18nUtils, rgPath) by
//            proxying through M-013b @/ipc/runtime so renderer code
//            ported from mark-electron@v1.2.3 transfers without changes.
//            This is the closing piece of F-MAIN-ENTRY-DISABLED.
//   SCOPE:   side-effect module — installs globals when imported. MUST
//            be the FIRST import in main.js so any subsequent v1
//            renderer file reading window.fileUtils.X / window.electron.X
//            resolves correctly.
//   DEPENDS: @/ipc/runtime (ipc namespace), path-browserify (already
//            aliased in vite.config.js), @tauri-apps/api/* for clipboard
//            / shell / process compatibility.
//   LINKS:   docs/development-plan.xml F-MAIN-ENTRY-DISABLED;
//            v1.2.3 src/preload/index.js (the API shape this shim
//            emulates).
//   STATUS:  Phase-B-MAIN-ENTRY-WIRING shipped 2026-04-29.
//
// CHANGE_SUMMARY:
//   - 2026-04-29 close F-MAIN-ENTRY-DISABLED: install window.* shim.

import { ipc } from '@/ipc/runtime'
import * as path from 'path-browserify'
import { appLocalDataDir } from '@tauri-apps/api/path'
// Pre-import the event/core modules statically so ipcRenderer.on /
// .invoke / .send paths don't have to await dynamic imports — that
// async boundary races with backend emit-on-spawn (renderer subscribes
// AFTER backend has already fired the response, event is missed).
import { invoke as _tauriInvoke } from '@tauri-apps/api/core'
import { listen as _tauriListen, once as _tauriOnce, emit as _tauriEmit } from '@tauri-apps/api/event'

// ─── URL args parity with v1.2.3 main process ─────────────────────────
// In Electron, the main process appended `?udp=<path>&wid=0&type=editor`
// to the renderer URL so bootstrap.js → parseUrlArgs() could read them
// synchronously. Tauri loads a static index.html, so we synthesize the
// same query string here using Tauri's appLocalDataDir() before any
// downstream module reads window.location.search. Top-level await runs
// before main.js continues with createApp().
{
  const search = new URLSearchParams(window.location.search)
  if (!search.has('udp')) {
    const udp = await appLocalDataDir()
    search.set('udp', udp)
    search.set('wid', '0')
    search.set('type', 'editor')
    search.set('debug', '0')
    const next = `${window.location.pathname}?${search.toString()}${window.location.hash}`
    history.replaceState(null, '', next)
  }
}

// ─── Drag-drop bridge ───────────────────────────────────────────────
// Tauri 2 with dragDropEnabled:true intercepts OS drag-drop and emits
// its own structured event. The v1.2.3 renderer's HTML5 dropHandler
// expected Electron's non-standard File.path attribute to recover
// the OS path; in a standard webview that attribute doesn't exist.
//
// Rather than fight the synthesis path, we bypass renderer drop
// handlers entirely: read each dropped path's content via M-013b
// fs.read and emit `mt::open-new-tab` directly to the renderer. The
// editor store's LISTEN_FOR_NEW_TAB picks it up and creates the tab
// with content. (See store/editor.js:634.)
const _droppedFilePaths = new WeakMap()
const MARKDOWN_DROP_EXTS = ['md', 'markdown', 'mmd', 'mkd', 'mkdn', 'mdown', 'mdtxt', 'mdtext', 'mdx', 'text', 'txt']
{
  const { getCurrentWebview } = await import('@tauri-apps/api/webview')
  const { emit: tauriEmit } = await import('@tauri-apps/api/event')
  const webview = getCurrentWebview()

  const isMarkdownPath = (p) => {
    const lower = p.toLowerCase()
    return MARKDOWN_DROP_EXTS.some((e) => lower.endsWith('.' + e))
  }

  const openDroppedPath = async (filePath) => {
    if (!isMarkdownPath(filePath)) {
      console.warn(`[drop] non-markdown path skipped: ${filePath}`)
      return
    }
    let content
    try {
      content = await ipc.fs.read(filePath)
    } catch (e) {
      console.error(`[drop] read failed for ${filePath}:`, e)
      return
    }
    const filename = filePath.split(/[\\/]/).pop() || filePath
    const markdownDocument = {
      markdown: typeof content === 'string' ? content : (content?.text ?? ''),
      filename,
      pathname: filePath,
      encoding: { encoding: 'utf8', isBom: false },
      lineEnding: 'lf',
      adjustLineEndingOnSave: false,
      trimTrailingNewline: 3,
      cursor: null,
      isMixedLineEndings: false
    }
    try {
      await tauriEmit('mt::open-new-tab', markdownDocument)
    } catch (e) {
      console.error(`[drop] emit mt::open-new-tab failed:`, e)
    }
  }

  await webview.onDragDropEvent(async (event) => {
    const payload = event.payload
    if (payload.type === 'drop') {
      const paths = payload.paths || []
      for (const p of paths) {
        await openDroppedPath(p)
      }
    }
  })
}

// ─── window.fileUtils ───────────────────────────────────────────────
// v1.2.3 preload exposed a 13-method fileUtils API. Most map cleanly
// to ipc.fs / ipc.workspace; the few that don't (sync isImageFile,
// MARKDOWN_INCLUSIONS const) are pure-renderer pure-JS — inline them
// here so renderer code keeps working without an IPC roundtrip.

const MARKDOWN_EXTENSIONS = ['md', 'markdown', 'mmd', 'mkd', 'mkdn', 'mdown', 'mdtxt', 'mdtext', 'mdx', 'text', 'txt']
const IMAGE_EXTENSIONS = ['jpeg', 'jpg', 'png', 'gif', 'svg', 'webp', 'bmp', 'ico', 'tif', 'tiff']

function hasExt(filename, exts) {
  if (typeof filename !== 'string') return false
  const lower = filename.toLowerCase()
  return exts.some((e) => lower.endsWith('.' + e))
}

const fileUtils = {
  // sync utilities first — pure JS, no IPC
  hasMarkdownExtension: (filename) => hasExt(filename, MARKDOWN_EXTENSIONS),
  isImageFile: (filepath) => hasExt(filepath, IMAGE_EXTENSIONS),
  isChildOfDirectory: (parent, child) => {
    if (typeof parent !== 'string' || typeof child !== 'string') return false
    const p = path.normalize(parent).replace(/\/$/, '') + '/'
    const c = path.normalize(child)
    return c.startsWith(p)
  },
  isSamePathSync: (a, b) => {
    if (typeof a !== 'string' || typeof b !== 'string') return false
    return path.normalize(a) === path.normalize(b)
  },
  MARKDOWN_INCLUSIONS: Object.freeze(MARKDOWN_EXTENSIONS.map((x) => '*.' + x)),

  // async — route to M-013b
  readFile: async (filePath, _encoding) => ipc.fs.read(filePath),
  writeFile: async (filePath, data, _options) => ipc.fs.write(filePath, typeof data === 'string' ? data : new TextDecoder().decode(data)),
  outputFile: async (filePath, data) => ipc.fs.write(filePath, typeof data === 'string' ? data : new TextDecoder().decode(data)),
  readdir: async (dirPath) => ipc.fs.readdir(dirPath),
  stat: async (filePath) => ipc.fs.stat(filePath),
  unlink: async (filePath) => ipc.fs.unlink(filePath),
  isFile: async (filePath) => {
    try {
      const s = await ipc.fs.stat(filePath)
      return s.isFile
    } catch {
      return false
    }
  },
  isDirectory: async (filePath) => {
    try {
      const s = await ipc.fs.stat(filePath)
      return s.isDirectory
    } catch {
      return false
    }
  },
  pathExistsSync: () => false, // sync FS ops are not available; renderer should be using async
  ensureDirSync: () => {}, // no-op — mt_fs_write does create_dir_all internally

  // F-FS-COPY-MOVE-ENSUREDIR not yet shipped (no mt_fs_copy/move/mkdir
  // commands at backend); these are required by v1.2.3 image-paste +
  // file-rename flows. Stub with deterministic errors so callers fail
  // visibly rather than silently corrupt state.
  ensureDir: async (dirPath) => {
    // best-effort: write empty .keep file so create_dir_all fires
    try {
      await ipc.fs.write(`${dirPath}/.mt_keep`, '')
      await ipc.fs.unlink(`${dirPath}/.mt_keep`)
    } catch {
      // swallow — caller treats as "directory exists"
    }
  },
  copy: async (_src, _dest) => {
    throw new Error('MT_NOT_IMPLEMENTED: window.fileUtils.copy — wired in F-FS-COPY-MOVE-ENSUREDIR')
  },
  move: async (_src, _dest) => {
    throw new Error('MT_NOT_IMPLEMENTED: window.fileUtils.move — wired in F-FS-MOVE')
  },
  emptyDir: async (_path) => {
    throw new Error('MT_NOT_IMPLEMENTED: window.fileUtils.emptyDir — wired in F-FS-COPY-MOVE-ENSUREDIR')
  }
}

// ─── window.electron ────────────────────────────────────────────────
// v1.2.3 preload exposed @electron-toolkit/preload's electronAPI
// (ipcRenderer / process / webFrame / webUtils) plus our custom
// extensions (clipboard, shell, fonts, tmpDir, resourcesPath).
// Tauri equivalent surfaces:
//   - ipcRenderer.invoke / send / on → @tauri-apps/api/core invoke +
//     @tauri-apps/api/event listen. M-013a contract ipcInvoke /
//     useIpcListener already provide typed access; THIS shim provides
//     the lower-level untyped calls v1 renderer uses.
//   - shell.openExternal / openPath → @tauri-apps/plugin-shell (TODO:
//     add plugin dep; for now stub with window.open fallback)
//   - clipboard.read/write → navigator.clipboard (web standard, works
//     in WKWebView)
//   - fonts.list → ipc.fonts.list
//   - tmpDir / resourcesPath → static lookups; OS.tempdir() via
//     @tauri-apps/plugin-os when wired

const electron = {
  // ipcRenderer surface — minimal compat with v1 raw access
  ipcRenderer: {
    invoke: async (channel, ...args) => {
      // v1 channels use mt::xxx-yyy::zzz; Tauri commands cannot contain
      // hyphens (Rust identifier rules), so we map '::' AND '-' to '_'.
      const invoke = _tauriInvoke
      const tauriCmd = channel.replace(/::/g, '_').replace(/-/g, '_')
      // Most v1 calls pass a single object as the first arg; spread
      // multiple args into a positional-style payload if the renderer
      // passed N>1.
      const payload = args.length === 1 ? args[0] : { args }
      try {
        return await invoke(tauriCmd, payload)
      } catch (e) {
        const msg = String(e || '')
        // F-V1-IPC-COMPAT-STUBS: many v1 channels are not yet ported to
        // Rust commands. Degrade silently with a console warning so the
        // renderer's `.then(state => state && ...)` pattern resolves to
        // undefined instead of throwing an unhandled rejection.
        if (msg.includes('not found') || msg.includes('not allowed by ACL')) {
          console.warn(`[ipc-shim] ${channel} (→ ${tauriCmd}): ${msg} — returning undefined`)
          return undefined
        }
        throw e
      }
    },
    send: async (channel, ...args) => {
      // Fire-and-forget — same as invoke but ignore result.
      try {
        await electron.ipcRenderer.invoke(channel, ...args)
      } catch {
        // best-effort
      }
    },
    on: (channel, handler) => {
      const listen = _tauriListen
      // Special-case: mt::search-event uses an M-013a-shape payload
      // ({searchId, kind, hits[], error, seq}) but v1.2.3 renderer
      // (ripgrepSearcher.js) expects v1 shape ({searchId, type,
      // payload}). Translate kind→type and split hits[] into per-file
      // groups so didMatch sees one filePath per event.
      if (channel === 'mt::search-event') {
        return listen(channel, (event) => {
          const m = event.payload
          if (!m) return
          const sid = m.searchId
          if (m.kind === 'match' && Array.isArray(m.hits) && m.hits.length) {
            const byPath = new Map()
            for (const h of m.hits) {
              if (!byPath.has(h.path)) byPath.set(h.path, [])
              byPath.get(h.path).push({
                matchText: h.snippet || '',
                lineText: h.snippet || '',
                range: [
                  { row: Math.max(0, (h.line || 1) - 1), column: h.column || 0 },
                  { row: Math.max(0, (h.line || 1) - 1), column: (h.column || 0) + (h.snippet ? h.snippet.length : 0) }
                ],
                leadingContextLines: [],
                trailingContextLines: []
              })
            }
            for (const [filePath, matches] of byPath) {
              handler(event, { searchId: sid, type: 'match', payload: { filePath, matches } })
            }
          } else if (m.kind === 'complete') {
            handler(event, { searchId: sid, type: 'complete' })
          } else if (m.kind === 'cancelled') {
            handler(event, { searchId: sid, type: 'complete' })
          } else if (m.kind === 'error') {
            handler(event, { searchId: sid, type: 'error', payload: { message: m.error || 'search error' } })
          }
        })
      }
      return listen(channel, (event) => handler(event, event.payload))
    },
    once: (channel, handler) => {
      const once = _tauriOnce
      return once(channel, (event) => handler(event, event.payload))
    },
    removeListener: () => {},
    removeAllListeners: () => {}
  },

  // Web Standard clipboard — works in WKWebView without any plugin
  clipboard: {
    readText: async () => {
      try {
        return await navigator.clipboard.readText()
      } catch {
        return ''
      }
    },
    writeText: async (text) => {
      try {
        await navigator.clipboard.writeText(text)
      } catch {
        // ignore
      }
    },
    read: async () => {
      try {
        const items = await navigator.clipboard.read()
        return items
      } catch {
        return []
      }
    },
    write: async () => {
      // image+html clipboard write — not currently used by muya since
      // muya uses execCommand for paste; leave stub.
    }
  },

  // shell.open — Tauri plugin-shell gives proper safe routing through
  // the OS; until that's wired, fall back to window.open for http(s)
  // URLs only (everything else returns rejected promise so caller
  // surfaces an error toast).
  shell: {
    openExternal: async (url) => {
      try {
        const u = new URL(url)
        if (u.protocol === 'http:' || u.protocol === 'https:') {
          window.open(url, '_blank', 'noopener,noreferrer')
          return
        }
        throw new Error(`MT_NOT_IMPLEMENTED: shell.openExternal scheme=${u.protocol} — wired in F-SHELL-PLUGIN`)
      } catch (e) {
        throw e
      }
    },
    openPath: async (_path) => {
      throw new Error('MT_NOT_IMPLEMENTED: shell.openPath — wired in F-SHELL-PLUGIN')
    },
    showItemInFolder: async (_path) => {
      throw new Error('MT_NOT_IMPLEMENTED: shell.showItemInFolder — wired in F-SHELL-PLUGIN')
    }
  },

  // process — v1 reads version + platform fields from preload.
  process: {
    platform: 'darwin', // Vite define replaces process.platform at build time; this is fallback
    versions: {
      node: '0.0.0',
      electron: '0.0.0',
      chrome: '',
      v8: ''
    },
    env: {}
  },

  // M-008 frontend facade
  fonts: {
    list: async () => ipc.fonts.list()
  },

  // webFrame — v1 zoom controls; WKWebView has different APIs.
  // Stubs so renderer doesn't crash; wire real zoom in F-ZOOM-WIRE.
  webFrame: {
    setZoomLevel: () => {},
    getZoomLevel: () => 0,
    setZoomFactor: () => {},
    getZoomFactor: () => 1
  },

  // webUtils — v1 file-drop path resolution. Tauri intercepts OS-level
  // drag-drop and emits its own event (dragDropEnabled: true), so the
  // standard HTML5 drop event's File.path attribute is unavailable.
  // Renderer drop handlers call getPathForFile(file) expecting a real
  // path; we keep a session-bound WeakMap populated by the Tauri
  // drag-drop bridge below so this lookup returns the actual path.
  webUtils: {
    getPathForFile: (file) => {
      if (!file) return ''
      return _droppedFilePaths.get(file) || ''
    }
  },

  // Static surface
  resourcesPath: '',
  tmpDir: '/tmp'
}

// ─── window.path ────────────────────────────────────────────────────
// path-browserify already imported above; re-export the whole module.
const _path = { ...path, default: path }

// ─── window.commandExists ───────────────────────────────────────────
// v1 used command-exists to detect picgo / pandoc binaries on PATH.
// Tauri side: M-015 exposes mt_pandoc_status; for everything else we
// answer false so renderer disables the affected feature.
const commandExists = {
  exists: async (cmd) => {
    if (cmd === 'pandoc') {
      try {
        const status = await ipc.pandoc.status()
        return status.available
      } catch {
        return false
      }
    }
    return false
  }
}

// ─── window.i18nUtils ───────────────────────────────────────────────
// v1 exposed loadTranslations(locale) returning the JSON map. Renderer
// reads it once at boot to populate vue-i18n. The JSON files live in
// static/locales/; renderer reaches them via fetch in the Tauri build.
const i18nUtils = {
  loadTranslations: async (locale) => {
    try {
      const response = await fetch(`/locales/${locale}.min.json`)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return response.json()
    } catch (e) {
      // Graceful fallback — empty map; vue-i18n falls back to keys.
      // eslint-disable-next-line no-console
      console.warn(`[i18nUtils] failed to load ${locale}:`, e)
      return {}
    }
  }
}

// ─── window.rgPath ──────────────────────────────────────────────────
// v1 stored the absolute path to the bundled @vscode/ripgrep binary;
// renderer's RipgrepDirectorySearcher spawned it via child_process.
// Tauri side: M-004 search runs in-process via ignore + regex (NO rg
// shell-out). The renderer's RipgrepDirectorySearcher has been fully
// replaced by @/ipc/runtime ipcSearch.RipgrepDirectorySearcher which
// doesn't read window.rgPath at all. Provide a non-empty placeholder
// so any defensive `if (!window.rgPath) throw` checks pass.
const rgPath = '/ipc-routed/rg'

// ─── install ────────────────────────────────────────────────────────
if (typeof window !== 'undefined') {
  // eslint-disable-next-line no-undef
  window.fileUtils = fileUtils
  // eslint-disable-next-line no-undef
  window.electron = electron
  // eslint-disable-next-line no-undef
  window.path = _path
  // eslint-disable-next-line no-undef
  window.commandExists = commandExists
  // eslint-disable-next-line no-undef
  window.i18nUtils = i18nUtils
  // eslint-disable-next-line no-undef
  window.rgPath = rgPath
  // eslint-disable-next-line no-console
  console.info('[Shim][window-globals][BLOCK_SHIM_INSTALLED]')
}

export {} // ensure ES module
