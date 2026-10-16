// FILE: src/renderer/src/util/clipboardPath.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: C-52 clipboard/drop path resolver primitives — parse a
//            clipboard text into a filesystem path (first line, quotes,
//            file:// URL, ~), classify a stat'd path (folder vs
//            Markdown), resolve clipboard candidates in order, and open
//            a Markdown file in a tab with the drag-drop bridge's exact
//            mt::open-new-tab payload.
//   SCOPE: pure parsing/classification plus the shared tab-open emit;
//            NO stores, NO i18n, NO notification — routing lives in
//            util/clipboardOpen.js so the drag-drop shim in
//            _shims/install-window-globals.js can import these parts
//            without dragging Pinia into the boot shim.
//   DEPENDS: @/ipc/runtime (ipc.fs read/stat), @tauri-apps/api/event
//            (emit mt::open-new-tab). window.fileUtils is read lazily
//            inside functions, never at import time (test-setup rule).
//   LINKS: .grace/changes/active/C-52/spec.xml R-3/R-4;
//            _shims/install-window-globals.js (drop path);
//            util/clipboardOpen.js (orchestrator); m059_clipboard.rs
//            (mt_read_clipboard_paths).
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   parseClipboardTextToPath - clipboard text → absolute path candidate (null when unusable).
//   fileUrlToPath - file:// URL → path (percent-decoded, localhost only, drive-letter aware).
//   isAbsolutePath - '/', '\\\\' UNC and drive-letter forms.
//   isEditableTarget - INPUT/TEXTAREA/SELECT/contentEditable focus guard for the ⌘V handler.
//   classifyStat - stat result → 'folder' | 'markdown' | null.
//   resolveClipboardTarget - pasteboard paths first, then the parsed text; first usable wins.
//   openMarkdownFileTab - fs read + mt::open-new-tab emit (the drop bridge's markdown branch).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-10-16 C-52 T-001: initial module (parsing + classification
//     extracted so the menu command, the welcome-screen ⌘V and the
//     folder-drop fix share one resolver).
//   - 2026-10-17 C-52 gate fix: isEditableTarget also honours the
//     contenteditable attribute and the contentEditable property (jsdom
//     keeps isContentEditable false even for editable elements, so the
//     guard leaked ⌘V in unit tests); resolveClipboardTarget catches a
//     rejecting stat for INJECTED deps too, not just the ipc default —
//     its contract says a stat failure eliminates the candidate.
// END_CHANGE_SUMMARY

import { ipc } from '@/ipc/runtime'
import { emit as tauriEmit } from '@tauri-apps/api/event'

// START_BLOCK_FILE_URL_TO_PATH
// file:///a%20b → /a b. Remote hosts are rejected (spec NonGoals: no
// reading of remote URLs); file://localhost/… is accepted; a Windows
// drive-letter URL loses its leading slash. Returns '' when the URL
// carries no usable path.
export const fileUrlToPath = (url) => {
  if (typeof url !== 'string' || !/^file:\/\//i.test(url)) return ''
  try {
    const parsed = new URL(url)
    let pathname = parsed.pathname || ''
    try {
      pathname = decodeURIComponent(pathname)
    } catch {
      // malformed escape — keep the raw form; a broken path simply won't stat
    }
    if (parsed.host && parsed.host !== 'localhost') return ''
    if (/^\/[a-zA-Z]:/.test(pathname)) pathname = pathname.slice(1)
    return pathname === '/' ? '' : pathname
  } catch {
    // Non-standard shape (jsdom URL edge, crafted text) — manual split.
    const rest = url.replace(/^file:\/\//i, '')
    const slash = rest.indexOf('/')
    if (slash < 0) return ''
    let pathname = rest.slice(slash)
    const host = rest.slice(0, slash)
    if (host && host !== 'localhost') return ''
    try {
      pathname = decodeURIComponent(pathname)
    } catch {
      // keep raw
    }
    if (/^\/[a-zA-Z]:/.test(pathname)) pathname = pathname.slice(1)
    return pathname === '/' ? '' : pathname
  }
}
// END_BLOCK_FILE_URL_TO_PATH

// START_BLOCK_IS_ABSOLUTE_PATH
export const isAbsolutePath = (p) =>
  typeof p === 'string' &&
  (p.startsWith('/') || /^\\{2}/.test(p) || /^[a-zA-Z]:[\\/]/.test(p))
// END_BLOCK_IS_ABSOLUTE_PATH

// START_BLOCK_PARSE_CLIPBOARD_TEXT
// `pwd | pbcopy` puts a bare absolute path (with a trailing newline) on
// the clipboard; shells and editors often quote it. Only the FIRST line
// is considered; ~ expands against homeDir (null when homeDir is
// unknown — the candidate can't be checked); anything that is not an
// absolute path after normalization returns null.
export const parseClipboardTextToPath = (text, homeDir = '') => {
  if (typeof text !== 'string') return null
  const firstLine = text.split(/\r?\n/, 1)[0] || ''
  let candidate = firstLine.trim()
  if (!candidate) return null
  if (candidate.length >= 2) {
    const head = candidate[0]
    const tail = candidate[candidate.length - 1]
    if ((head === '"' && tail === '"') || (head === "'" && tail === "'")) {
      candidate = candidate.slice(1, -1).trim()
      if (!candidate) return null
    }
  }
  if (/^file:\/\//i.test(candidate)) {
    candidate = fileUrlToPath(candidate)
    if (!candidate) return null
  } else if (candidate.startsWith('~')) {
    if (typeof homeDir !== 'string' || !homeDir) return null
    candidate = homeDir.replace(/\/+$/, '') + candidate.slice(1)
  }
  return isAbsolutePath(candidate) ? candidate : null
}
// END_BLOCK_PARSE_CLIPBOARD_TEXT

// START_BLOCK_IS_EDITABLE_TARGET
// Lives in ./editableTarget (dependency-free) so the welcome screen can
// import it without pulling ipc/runtime into the boot chunk.
export { isEditableTarget } from './editableTarget'
// END_BLOCK_IS_EDITABLE_TARGET

// START_BLOCK_CLASSIFY_STAT
// A directory opens as the workspace; a Markdown file opens in a tab;
// everything else (images, binaries, missing paths) is not usable here.
export const classifyStat = (pathname, stat, hasMarkdownExtension) => {
  if (!stat) return null
  if (stat.isDirectory) return 'folder'
  const check = hasMarkdownExtension || ((p) => !!window.fileUtils?.hasMarkdownExtension?.(p))
  if (stat.isFile && check(pathname)) return 'markdown'
  return null
}
// END_BLOCK_CLASSIFY_STAT

// START_BLOCK_RESOLVE_CLIPBOARD_TARGET
// Candidates in priority order: the native pasteboard file paths
// (Finder ⌘C), then the clipboard text parsed as a path. The first
// candidate that stats as a folder or a Markdown file wins; stat
// failures (missing path, degraded IPC — from the injected dep just as
// from the ipc default) simply eliminate the candidate. `deps` is
// injectable for tests ({ stat, hasMarkdownExtension, homeDir }).
export const resolveClipboardTarget = async ({ filePaths = [], text = '' } = {}, deps = {}) => {
  const stat = deps.stat || ((p) => ipc.fs.stat(p))
  const homeDir = typeof deps.homeDir === 'string' ? deps.homeDir : ''

  const candidates = []
  if (Array.isArray(filePaths)) {
    for (const p of filePaths) {
      if (typeof p === 'string' && p) candidates.push(p)
    }
  }
  const fromText = parseClipboardTextToPath(text, homeDir)
  if (fromText) candidates.push(fromText)

  for (const candidate of candidates) {
    let candidateStat = null
    try {
      candidateStat = await stat(candidate)
    } catch {
      // unstatable candidate — try the next one
    }
    const kind = classifyStat(candidate, candidateStat, deps.hasMarkdownExtension)
    if (kind) return { kind, path: candidate }
  }
  return null
}
// END_BLOCK_RESOLVE_CLIPBOARD_TARGET

// START_BLOCK_OPEN_MARKDOWN_FILE_TAB
// Open one Markdown file exactly like the drag-drop bridge's markdown
// branch (C-52 R-1: ".md → open in a tab like a drop"): fs read, then
// the IMarkdownDocumentRaw-shaped mt::open-new-tab emit the editor
// store's LISTEN_FOR_NEW_TAB consumes. Read/emit failures log and stop —
// an unreadable file must never reject the resolver.
export const openMarkdownFileTab = async (filePath) => {
  let content
  try {
    content = await ipc.fs.read(filePath)
  } catch (e) {
    console.error('[ClipboardPath][openMarkdownFileTab][BLOCK_READ_FAILED] path skipped', e)
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
    console.info(`[ClipboardPath][openMarkdownFileTab][BLOCK_TAB_OPENED] file=${filename}`)
  } catch (e) {
    console.error('[ClipboardPath][openMarkdownFileTab][BLOCK_EMIT_FAILED]', e)
  }
}
// END_BLOCK_OPEN_MARKDOWN_FILE_TAB
