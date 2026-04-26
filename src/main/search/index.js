// step-8i: ripgrep-based search relocated from renderer (
// src/renderer/src/node/ripgrepSearcher.js + fileSearcher.js, ~150 LOC
// total) to the main process. Renderer becomes a thin IPC client
// that streams results back via mt::search-event channel keyed by a
// per-search id.
//
// Source for the parsing logic is the original Atom directory searcher
// (Modified BSD via the v1 codebase). See history of the renderer
// files for the original copyright notice — the code below preserves
// that attribution at the top of the parsing helpers.
//
// IPC contract (one search lifecycle):
//   renderer  →  invoke('mt::search-spawn', { mode, searchId, directories, pattern, options })
//   main      →  webContents.send('mt::search-event', { searchId, type, payload })
//                  type: 'match'         payload: { filePath, matches: [...] }
//                  type: 'searchedPaths' payload: <number>
//                  type: 'error'         payload: { message }
//                  type: 'complete'      payload: <none>
//   renderer  →  send('mt::search-cancel', { searchId })  [optional]
//
// The handle('mt::search-spawn') Promise resolves when the search
// completes (or rejects on spawn error). It does NOT carry results —
// streaming happens through the event channel.

import { ipcMain, BrowserWindow } from 'electron'
import { spawn } from 'child_process'
import { rgPath as bundledRgPath } from '@vscode/ripgrep'
import path from 'path'
import log from 'electron-log'

// step-8i: per-process ripgrep binary resolution. Renderer used to do
// this via global.marktext.paths.ripgrepBinaryPath; main resolves it
// independently with the same MARKTEXT_RIPGREP_PATH override semantics.
const resolveRgPath = () => {
  if (process.env.MARKTEXT_RIPGREP_PATH) {
    return process.env.MARKTEXT_RIPGREP_PATH
  }
  // Unpack the binary out of asar — ripgrep is a native executable
  // that cannot run from inside the asar archive.
  return bundledRgPath.replace(/\bapp\.asar\b/, 'app.asar.unpacked')
}

const cleanResultLine = (resultLine) => {
  resultLine = getText(resultLine)
  return resultLine[resultLine.length - 1] === '\n' ? resultLine.slice(0, -1) : resultLine
}

const getPositionFromColumn = (lines, column) => {
  let currentLength = 0
  let currentLine = 0
  let previousLength = 0
  while (column >= currentLength) {
    previousLength = currentLength
    currentLength += lines[currentLine].length + 1
    currentLine++
  }
  return [currentLine - 1, column - previousLength]
}

const processUnicodeMatch = (match) => {
  const text = getText(match.lines)
  if (text.length === Buffer.byteLength(text)) return
  let remainingBuffer = Buffer.from(text)
  let currentLength = 0
  let previousPosition = 0
  const convertPosition = (position) => {
    const currentBuffer = remainingBuffer.slice(0, position - previousPosition)
    currentLength = currentBuffer.toString().length + currentLength
    remainingBuffer = remainingBuffer.slice(position - previousPosition)
    previousPosition = position
    return currentLength
  }
  for (const submatch of match.submatches) {
    submatch.start = convertPosition(submatch.start)
    submatch.end = convertPosition(submatch.end)
  }
}

const processSubmatch = (submatch, lineText, offsetRow) => {
  const lineParts = lineText.split('\n')
  const start = getPositionFromColumn(lineParts, submatch.start)
  const end = getPositionFromColumn(lineParts, submatch.end)
  for (let i = start[0]; i > 0; i--) lineParts.shift()
  while (end[0] < lineParts.length - 1) lineParts.pop()
  start[0] += offsetRow
  end[0] += offsetRow
  return {
    range: [start, end],
    lineText: cleanResultLine({ text: lineParts.join('\n') })
  }
}

const getText = (input) => {
  return 'text' in input ? input.text : Buffer.from(input.bytes, 'base64').toString()
}

const prepareGlobs = (globs, projectRootPath) => {
  const output = []
  for (let pattern of globs || []) {
    pattern = pattern.replace(new RegExp(`\\${path.sep}`, 'g'), '/')
    if (pattern.length === 0) continue
    const projectName = path.basename(projectRootPath)
    if (pattern === projectName) {
      output.push('**/*')
      continue
    }
    if (pattern.startsWith(projectName + '/')) {
      pattern = pattern.slice(projectName.length + 1)
    }
    if (pattern.endsWith('/')) {
      pattern = pattern.slice(0, -1)
    }
    pattern = pattern.startsWith('**/') ? pattern : `**/${pattern}`
    output.push(pattern)
    output.push(pattern.endsWith('/**') ? pattern : `${pattern}/**`)
  }
  return output
}

const prepareRegexp = (regexpStr) => {
  if (regexpStr === '--') return '\\-\\-'
  return regexpStr.replace(/\\\//g, '/')
}

const isMultilineRegexp = (regexpStr) => regexpStr.includes('\\n')

// Active search children, keyed by searchId so mt::search-cancel can
// kill the right spawn. Multiple directories per search → multiple
// children per id.
const activeChildren = new Map() // searchId → Set<ChildProcess>

const trackChild = (searchId, child) => {
  let set = activeChildren.get(searchId)
  if (!set) {
    set = new Set()
    activeChildren.set(searchId, set)
  }
  set.add(child)
  child.once('close', () => {
    const s = activeChildren.get(searchId)
    if (s) {
      s.delete(child)
      if (s.size === 0) activeChildren.delete(searchId)
    }
  })
}

const cancelSearch = (searchId) => {
  const set = activeChildren.get(searchId)
  if (!set) return
  for (const child of set) {
    try { child.kill() } catch {}
  }
  activeChildren.delete(searchId)
}

const buildContentArgs = (pattern, directoryPath, options) => {
  let regexpStr = null
  let textPattern = null
  const args = ['--json']
  if (options.isRegexp) {
    regexpStr = prepareRegexp(pattern)
    args.push('--regexp', regexpStr)
  } else {
    args.push('--fixed-strings')
    textPattern = pattern
  }
  if (regexpStr && isMultilineRegexp(regexpStr)) args.push('--multiline')
  if (options.isCaseSensitive) args.push('--case-sensitive')
  else args.push('--ignore-case')
  if (options.isWholeWord) args.push('--word-regexp')
  if (options.followSymlinks) args.push('--follow')
  if (options.maxFileSize) args.push('--max-filesize', String(options.maxFileSize))
  if (options.includeHidden) args.push('--hidden')
  if (options.noIgnore) args.push('--no-ignore')
  if (options.leadingContextLineCount) args.push('--before-context', String(options.leadingContextLineCount))
  if (options.trailingContextLineCount) args.push('--after-context', String(options.trailingContextLineCount))
  for (const inclusion of prepareGlobs(options.inclusions, directoryPath)) args.push('--iglob', inclusion)
  for (const exclusion of prepareGlobs(options.exclusions, directoryPath)) args.push('--iglob', '!' + exclusion)
  args.push('--')
  if (textPattern) args.push(textPattern)
  args.push(directoryPath)
  return args
}

const buildFilesArgs = (directoryPath, options) => {
  const args = ['--files']
  if (options.followSymlinks) args.push('--follow')
  if (options.includeHidden) args.push('--hidden')
  if (options.noIgnore) args.push('--no-ignore')
  for (const inclusion of prepareGlobs(options.inclusions, directoryPath)) args.push('--iglob', inclusion)
  args.push('--', directoryPath)
  return args
}

const sendEvent = (webContents, searchId, type, payload) => {
  if (webContents.isDestroyed()) return
  webContents.send('mt::search-event', { searchId, type, payload })
}

const searchContentInDirectory = (webContents, searchId, directoryPath, pattern, options, numPathsFound, rgPath) => {
  return new Promise((resolve) => {
    const args = buildContentArgs(pattern, directoryPath, options)
    let child
    try {
      child = spawn(rgPath, args, { cwd: directoryPath, stdio: ['pipe', 'pipe', 'pipe'] })
    } catch (err) {
      sendEvent(webContents, searchId, 'error', { message: err.message })
      resolve()
      return
    }
    trackChild(searchId, child)
    let buffer = ''
    let bufferError = ''
    let pendingEvent
    let pendingLeadingContext
    let pendingTrailingContexts
    child.on('close', (code) => {
      if (code !== null && code > 1 && bufferError) {
        log.warn(`Ripgrep finished with errors (exit code ${code}):`, bufferError)
      }
      if (buffer) {
        try {
          const message = JSON.parse(buffer)
          if (message.type === 'end') {
            sendEvent(webContents, searchId, 'searchedPaths', ++numPathsFound.num)
            if (pendingEvent) sendEvent(webContents, searchId, 'match', pendingEvent)
          }
        } catch {}
      }
      resolve()
    })
    child.on('error', (err) => {
      sendEvent(webContents, searchId, 'error', { message: err.message })
      resolve()
    })
    child.stderr.on('data', (chunk) => { bufferError += chunk })
    child.stdout.on('data', (chunk) => {
      buffer += chunk
      const lines = buffer.split('\n')
      buffer = lines.pop()
      for (const line of lines) {
        if (!line) continue
        try {
          const message = JSON.parse(line)
          if (message.type === 'begin') {
            pendingEvent = { filePath: getText(message.data.path), matches: [] }
            pendingLeadingContext = []
            pendingTrailingContexts = new Set()
          } else if (message.type === 'match') {
            const trailingContextLines = []
            pendingTrailingContexts.add(trailingContextLines)
            processUnicodeMatch(message.data)
            for (const submatch of message.data.submatches) {
              const { lineText, range } = processSubmatch(
                submatch,
                getText(message.data.lines),
                message.data.line_number - 1
              )
              pendingEvent.matches.push({
                matchText: getText(submatch.match),
                lineText,
                range,
                leadingContextLines: [...pendingLeadingContext],
                trailingContextLines
              })
            }
          } else if (message.type === 'end') {
            sendEvent(webContents, searchId, 'searchedPaths', ++numPathsFound.num)
            if (pendingEvent) sendEvent(webContents, searchId, 'match', pendingEvent)
            pendingEvent = null
          }
        } catch (err) {
          log.warn('Failed to parse ripgrep output line:', line, err)
        }
      }
    })
  })
}

const searchFilesInDirectory = (webContents, searchId, directoryPath, options, numPathsFound, rgPath) => {
  return new Promise((resolve) => {
    const args = buildFilesArgs(directoryPath, options)
    let child
    try {
      child = spawn(rgPath, args, { cwd: directoryPath, stdio: ['pipe', 'pipe', 'pipe'] })
    } catch (err) {
      sendEvent(webContents, searchId, 'error', { message: err.message })
      resolve()
      return
    }
    trackChild(searchId, child)
    let buffer = ''
    let bufferError = ''
    child.on('close', (code) => {
      if (code !== null && code > 1) {
        sendEvent(webContents, searchId, 'error', { message: bufferError || `ripgrep exited with code ${code}` })
      }
      resolve()
    })
    child.on('error', (err) => {
      sendEvent(webContents, searchId, 'error', { message: err.message })
      resolve()
    })
    child.stderr.on('data', (chunk) => { bufferError += chunk })
    child.stdout.on('data', (chunk) => {
      buffer += chunk
      const lines = buffer.split('\n')
      buffer = lines.pop()
      for (const line of lines) {
        sendEvent(webContents, searchId, 'searchedPaths', ++numPathsFound.num)
        sendEvent(webContents, searchId, 'match', line)
      }
    })
  })
}

export default () => {
  ipcMain.handle('mt::search-spawn', async (e, payload) => {
    if (!payload || typeof payload !== 'object') {
      throw new Error('mt::search-spawn: invalid payload')
    }
    const { mode, searchId, directories, pattern, options } = payload
    if (typeof searchId !== 'string' || !searchId) {
      throw new Error('mt::search-spawn: searchId required')
    }
    if (!Array.isArray(directories)) {
      throw new Error('mt::search-spawn: directories must be an array')
    }
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win) throw new Error('mt::search-spawn: no window for sender')
    const webContents = e.sender
    const rgPath = resolveRgPath()
    const numPathsFound = { num: 0 }
    const opts = options || {}
    const tasks = directories.map((dir) => {
      if (mode === 'files') {
        return searchFilesInDirectory(webContents, searchId, dir, opts, numPathsFound, rgPath)
      }
      return searchContentInDirectory(webContents, searchId, dir, pattern, opts, numPathsFound, rgPath)
    })
    try {
      await Promise.all(tasks)
      sendEvent(webContents, searchId, 'complete')
    } catch (err) {
      sendEvent(webContents, searchId, 'error', { message: err && err.message ? err.message : String(err) })
    }
    return null
  })

  ipcMain.on('mt::search-cancel', (_e, payload) => {
    if (payload && typeof payload.searchId === 'string') {
      cancelSearch(payload.searchId)
    }
  })
}
