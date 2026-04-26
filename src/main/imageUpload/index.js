// step-8h: image-upload helper logic relocated from
// src/renderer/src/util/fileSystem.js (uploadByCommand /
// getPreferredPathEnv / resolvePicgoBinary / parsePicgoOutput) to the
// main process. Renderer keeps only a thin IPC client and the local
// FileReader / tmpfile orchestration; the actual exec of `picgo` /
// user-provided cliScript happens here, free of contextIsolation
// constraints and with unrestricted access to process.env.PATH/HOME.

import { ipcMain } from 'electron'
import { exec, execFile } from 'child_process'
import fs from 'fs'
import log from 'electron-log'

const isOsx = process.platform === 'darwin'
const isLinux = process.platform === 'linux'
const isWindows = process.platform === 'win32'

/**
 * Build a robust PATH for spawned processes. Electron packaged apps on
 * macOS frequently miss Homebrew paths because GUI launches inherit a
 * scrubbed env; the renderer doesn't see those binaries either. We
 * augment with the standard system + Homebrew prefixes so user-installed
 * tools (notably picgo) resolve.
 */
const getPreferredPathEnv = () => {
  const extras = isOsx
    ? ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin']
    : isLinux
      ? ['/usr/local/bin', '/usr/bin', '/bin']
      : []
  const cur = (process.env.PATH || '').split(isWindows ? ';' : ':')
  const merged = [...cur]
  for (const p of extras) if (p && !merged.includes(p)) merged.push(p)
  return merged.filter(Boolean).join(isWindows ? ';' : ':')
}

/**
 * Locate the picgo binary among canonical install locations. Returns
 * the resolved path/command name suitable for shell exec, or null.
 */
const resolvePicgoBinary = () => {
  const candidates = isWindows
    ? ['picgo', 'picgo.exe']
    : [
        'picgo',
        '/opt/homebrew/bin/picgo',
        '/usr/local/bin/picgo',
        '/usr/bin/picgo',
        `${process.env.HOME || ''}/.npm-global/bin/picgo`,
        `${process.env.HOME || ''}/.npm/bin/picgo`,
        '/usr/local/lib/node_modules/.bin/picgo'
      ]
  for (const c of candidates) {
    try {
      if (c.startsWith('/') && fs.existsSync(c)) return c
      // Bare command name: rely on shell PATH lookup at exec time.
      // Skipping a synchronous which() probe keeps this fast and
      // avoids FS calls per-launch beyond what's needed.
      if (!c.startsWith('/')) return c
    } catch {}
  }
  return null
}

/**
 * Parse picgo CLI output (which mixes ANSI-coloured prose, JSON lines,
 * and free-form messages) and extract the uploaded image URL.
 * Returns null if no URL with an unambiguous success signal can be
 * recognised — the caller treats that as an error.
 */
const parsePicgoOutput = (text) => {
  const raw = String(text || '')
  const cleaned = raw.replace(/\[[0-9;]*m/g, '') // strip ANSI colours
  try {
    const lines = cleaned
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
    for (const line of lines) {
      if (
        (line.startsWith('{') && line.endsWith('}')) ||
        (line.startsWith('[') && line.endsWith(']'))
      ) {
        try {
          const obj = JSON.parse(line)
          if (obj) {
            if (obj.success === true && typeof obj.imgUrl === 'string') return obj.imgUrl
            if (obj.success === true && Array.isArray(obj.result) && obj.result.length > 0)
              return String(obj.result[obj.result.length - 1])
            if (obj.success === true && typeof obj.url === 'string') return obj.url
          }
        } catch {}
      }
      const kv = line.match(/(?:success|succeeded|uploaded)\s*:?\s*(https?:\/\/\S+)/i)
      if (kv && kv[1]) return kv[1]
    }
  } catch {}
  const marker = cleaned.split('[PicGo SUCCESS]:')
  if (marker.length >= 2) {
    const candidate = marker[marker.length - 1].trim()
    if (/^https?:\/\//i.test(candidate)) return candidate
  }
  return null
}

/**
 * Run picgo or the user-provided cliScript on `filepath`. Returns the
 * uploaded image URL on success, throws an Error on failure.
 *
 * cliScript is invoked via execFile with a single positional argument
 * (the image path). picgo is invoked through `exec` so its argv goes
 * through the system shell — required because picgo has historically
 * relied on shell-driven PATH resolution.
 */
const runUploadCommand = ({ uploader, filepath, cliScript }) => {
  return new Promise((resolve, reject) => {
    const env = { ...process.env, PATH: getPreferredPathEnv() }
    if (uploader === 'picgo') {
      const cmd = resolvePicgoBinary()
      if (!cmd) {
        reject(new Error('PicGo command not found in PATH'))
        return
      }
      // Quote the filepath to handle spaces; picgo accepts a single arg.
      exec(`${cmd} u "${filepath}"`, { env }, (err, stdout, stderr) => {
        if (err) {
          reject(new Error(`PicGo exec error: ${err.message}`))
          return
        }
        const text = String(stdout || '') + (stderr ? `\n${String(stderr)}` : '')
        const url = parsePicgoOutput(text)
        if (url) resolve(url)
        else reject(new Error(`PicGo upload error: cannot parse output\n${text.slice(0, 400)}`))
      })
    } else if (uploader === 'cliScript') {
      if (!cliScript) {
        reject(new Error('cliScript path not configured'))
        return
      }
      execFile(cliScript, [filepath], { env }, (err, stdout) => {
        if (err) {
          reject(new Error(`cliScript exec error: ${err.message}`))
          return
        }
        // cliScript convention: stdout last line is the URL.
        resolve(String(stdout || '').trim())
      })
    } else {
      reject(new Error(`Unknown uploader: ${uploader}`))
    }
  })
}

/**
 * Register IPC handlers for image upload. Idempotent — safe to call
 * once at app boot (from src/main/app/index.js).
 */
export default () => {
  ipcMain.handle('mt::image-upload-run-command', async (_e, payload) => {
    if (!payload || typeof payload !== 'object') {
      throw new Error('mt::image-upload-run-command: invalid payload')
    }
    const { uploader, filepath, cliScript } = payload
    if (typeof filepath !== 'string' || !filepath) {
      throw new Error('mt::image-upload-run-command: filepath required')
    }
    try {
      return await runUploadCommand({ uploader, filepath, cliScript })
    } catch (err) {
      // Re-throw as a plain Error so Electron IPC serializes the message
      // cleanly back to the renderer's invoke() Promise rejection path.
      log.warn(`mt::image-upload-run-command failed: ${err && err.message}`)
      throw err instanceof Error ? err : new Error(String(err))
    }
  })
}
