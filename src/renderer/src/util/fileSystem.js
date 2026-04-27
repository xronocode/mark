// step-8a: removed `import { statSync, constants } from 'fs'`.
// step-8h: removed `import { exec, execFile } from 'child_process'`.
// step-8j: removed `import crypto from 'crypto'` and
//          `import { tmpdir } from 'os'`. Hashing now uses Web Crypto
//          (crypto.subtle.digest); tmpdir comes from the preload-cached
//          `window.electron.tmpDir`. Buffer.from(...).toString('base64')
//          and Buffer.from(arrayBuffer) usages are replaced with
//          Uint8Array + a local arrayBufferToBase64 helper.
import dayjs from 'dayjs'
import { Octokit } from '@octokit/rest'
import { isWindows } from './index'

// step-8j: ArrayBuffer → base64 without Node Buffer.
// Walks bytes building a binary string and uses btoa(). Acceptable
// for the image-upload path: max payload is 5 MB (MAX_SIZE below)
// so the temporary string never exceeds a few megabytes.
const arrayBufferToBase64 = (buffer) => {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

export const create = async (pathname, type) => {
  return type === 'directory'
    ? window.fileUtils.ensureDir(pathname)
    : window.fileUtils.outputFile(pathname, '')
}

export const paste = async ({ src, dest, type }) => {
  return type === 'cut' ? window.fileUtils.move(src, dest) : window.fileUtils.copy(src, dest)
}

export const rename = async (src, dest) => {
  return window.fileUtils.move(src, dest)
}

// step-8j: was `crypto.createHash(type).update(content, encoding).digest('hex')`.
// Now Web Crypto subtle.digest. `content` is treated as a UTF-8 string
// (matches the previous `update(content, 'utf8')` semantics — every
// caller passed a string path). `type` is mapped to a SubtleCrypto
// algorithm name. Returns a Promise<string> of hex bytes.
const SUBTLE_DIGEST_ALG = {
  sha1: 'SHA-1',
  sha256: 'SHA-256',
  sha384: 'SHA-384',
  sha512: 'SHA-512'
}
export const getHash = async (content, _encoding, type) => {
  const alg = SUBTLE_DIGEST_ALG[String(type).toLowerCase()]
  if (!alg) {
    throw new Error(`getHash: unsupported algorithm "${type}"`)
  }
  const data = new TextEncoder().encode(String(content))
  const digest = await crypto.subtle.digest(alg, data)
  const bytes = new Uint8Array(digest)
  let hex = ''
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0')
  }
  return hex
}

export const getContentHash = async (content) => {
  return getHash(content, 'utf8', 'sha1')
}

/**
 * Moves an image to a relative position.
 *
 * @param {String} cwd The relative base path (project root or full folder path of opened file).
 * @param {String} relativeName The relative directory name.
 * @param {String} filePath The full path to the opened file in editor.
 * @param {String} imagePath The image to move.
 * @returns {String} The relative path the image from given `filePath`.
 */
export const moveToRelativeFolder = async (cwd, relativeName, filePath, imagePath) => {
  if (!relativeName) {
    relativeName = 'assets'
  } else if (window.path.isAbsolute(relativeName)) {
    throw new Error('Invalid relative directory name.')
  }

  const absPath = window.path.resolve(cwd, relativeName)
  const dstPath = window.path.resolve(absPath, window.path.basename(imagePath))
  await window.fileUtils.ensureDir(absPath)
  await window.fileUtils.move(imagePath, dstPath, { overwrite: true })

  const dstRelPath = window.path.relative(window.path.dirname(filePath), dstPath)
  if (isWindows) {
    return dstRelPath.replace(/\\/g, '/')
  }
  return dstRelPath
}

export const moveImageToFolder = async (pathname, image, outputDir) => {
  await window.fileUtils.ensureDir(outputDir)
  const isPath = typeof image === 'string'
  if (isPath) {
    const dir = window.path.dirname(pathname)
    const imagePath = window.path.resolve(dir, image)
    const isImage = window.fileUtils.isImageFile(imagePath)
    if (isImage) {
      const filename = window.path.basename(imagePath)
      const ext = window.path.extname(imagePath)
      const noHashPath = window.path.join(outputDir, filename)
      if (noHashPath === imagePath) {
        return imagePath
      }
      // step-8j: getContentHash is now async (Web Crypto subtle.digest).
      const hash = await getContentHash(imagePath)
      const hashFilePath = window.path.join(outputDir, `${hash}${ext}`)
      await window.fileUtils.copy(imagePath, hashFilePath)
      return hashFilePath
    } else {
      return image
    }
  } else {
    const imagePath = window.path.join(
      outputDir,
      `${dayjs().format('YYYY-MM-DD-HH-mm-ss')}-${image.name}`
    )

    // step-8j: Buffer.from(arrayBuffer) → Uint8Array. fs-extra's writeFile
    // (called via preload) accepts a Uint8Array as the data argument.
    const buffer = new Uint8Array(await image.arrayBuffer())
    await window.fileUtils.writeFile(imagePath, buffer, 'binary')
    return imagePath
  }
}

/**
 * @jocs todo, rewrite it use class
 */
export const uploadImage = async (pathname, image, preferences) => {
  const { currentUploader, imageBed, githubToken: auth, cliScript } = preferences
  const { owner, repo, branch } = imageBed.github
  const isPath = typeof image === 'string'
  const MAX_SIZE = 5 * 1024 * 1024
  let resolvePromise, rejectPromise
  const promise = new Promise((res, rej) => {
    resolvePromise = res
    rejectPromise = rej
  })

  if (currentUploader === 'none') {
    rejectPromise('No image uploader provided.')
  }

  const uploadByGithub = (content, filename) => {
    const octokit = new Octokit({ auth })
    const filePath = `${dayjs().format('YYYY/MM')}/${dayjs().format('DD-HH-mm-ss')}-${filename}`
    const message = `Upload by Mark at ${dayjs().format('YYYY-MM-DD HH:mm:ss')}`
    const payload = { owner, repo, path: filePath, branch, message, content }
    if (!branch) delete payload.branch
    octokit.repos
      .createOrUpdateFileContents(payload)
      .then((result) => resolvePromise(result.data.content.download_url))
      .catch(() => rejectPromise('Upload failed, the image will be copied to the image folder'))
  }

  // step-8h: getPreferredPathEnv / resolvePicgoBinary / parsePicgoOutput
  // moved to src/main/imageUpload/index.js. Renderer keeps only the
  // FileReader / tmpfile orchestration; the picgo / cliScript invocation
  // goes through mt::image-upload-run-command. Main returns the URL
  // string on success or throws an Error whose message we surface to
  // the rejectPromise() chain.
  const uploadByCommand = async (uploader, filepath, suffix = '') => {
    let localIsPath = true
    let localPath = filepath
    if (typeof filepath !== 'string') {
      localIsPath = false
      const data = new Uint8Array(filepath)
      // step-8j: tmpdir() → preload-cached window.electron.tmpDir.
      localPath = window.path.join(window.electron.tmpDir, `${Date.now()}${suffix}`)
      await window.fileUtils.writeFile(localPath, data)
    }
    const cleanup = () => {
      if (!localIsPath && window.fileUtils?.unlink) {
        try { window.fileUtils.unlink(localPath) } catch {}
      }
    }
    try {
      const url = await window.electron.ipcRenderer.invoke('mt::image-upload-run-command', {
        uploader,
        filepath: localPath,
        cliScript
      })
      cleanup()
      if (url) resolvePromise(url)
      else rejectPromise('Image upload returned an empty URL')
    } catch (err) {
      cleanup()
      rejectPromise(err && err.message ? err.message : String(err))
    }
  }

  const notification = () => {
    rejectPromise('Cannot upload more than 5M image, the image will be copied to the image folder')
  }

  if (isPath) {
    const dir = window.path.dirname(pathname)
    const imagePath = window.path.resolve(dir, image)
    const isImg = window.fileUtils.isImageFile(imagePath)
    if (isImg) {
      const { size } = await window.fileUtils.stat(imagePath)
      if (size > MAX_SIZE) notification()
      else {
        switch (currentUploader) {
          case 'cliScript':
          case 'picgo':
            uploadByCommand(currentUploader, imagePath)
            break
          case 'github': {
            // step-8j: Buffer.from(...).toString('base64') → arrayBufferToBase64.
            // window.fileUtils.readFile without encoding returns a Buffer
            // through the contextIsolation:false bridge today; under
            // structured cloning that surfaces as a Uint8Array view, which
            // arrayBufferToBase64 handles uniformly via Uint8Array(buf).
            const fileBuffer = await window.fileUtils.readFile(imagePath)
            const base64 = arrayBufferToBase64(fileBuffer.buffer || fileBuffer)
            uploadByGithub(base64, window.path.basename(imagePath))
            break
          }
        }
      }
    } else {
      resolvePromise(image)
    }
  } else {
    const { size } = image
    if (size > MAX_SIZE) notification()
    else {
      const reader = new FileReader()
      reader.onload = () => {
        switch (currentUploader) {
          case 'picgo':
          case 'cliScript':
            uploadByCommand(currentUploader, reader.result, window.path.extname(image.name))
            break
          default:
            // step-8j: Buffer.from(arrayBuffer).toString('base64') → arrayBufferToBase64.
            uploadByGithub(arrayBufferToBase64(reader.result), image.name)
        }
      }
      reader.readAsArrayBuffer(image)
    }
  }
  return promise
}

// step-8a: was isFileExecutableSync (sync statSync + fs.constants).
// Now async via window.fileUtils.stat — caller (image uploader prefs
// pane) has been refactored from computed → watch+ref so this Promise
// can land asynchronously without blocking Vue's reactivity graph.
// POSIX exec bits are hardcoded: S_IXUSR=0o100, S_IXGRP=0o010,
// S_IXOTH=0o001 → mask 0o111. These constants are stable POSIX-spec
// values, never platform-dependent.
export const isFileExecutable = async (filepath) => {
  try {
    const stat = await window.fileUtils.stat(filepath)
    // step-8b: process.platform === 'win32' → isWindows.
    // step-8z follow-up: stat.isFile() (method) → stat.isFile (boolean).
    // Preload now precomputes the boolean so contextIsolation:true's
    // structured-clone boundary doesn't strip the method.
    if (isWindows) {
      return stat.isFile
    }
    return stat.isFile && (stat.mode & 0o111) !== 0
  } catch {
    return false
  }
}
