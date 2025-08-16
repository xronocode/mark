import crypto from 'crypto'

import { statSync, constants } from 'fs'
import { exec, execFile } from 'child_process'
import { tmpdir } from 'os'
import dayjs from 'dayjs'
import { Octokit } from '@octokit/rest'
import { isWindows } from './index'

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

export const getHash = (content, encoding, type) => {
  return crypto.createHash(type).update(content, encoding).digest('hex')
}

export const getContentHash = (content) => {
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
      const hash = getContentHash(imagePath)
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

    const buffer = Buffer.from(await image.arrayBuffer())
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
    const message = `Upload by MarkText at ${dayjs().format('YYYY-MM-DD HH:mm:ss')}`
    const payload = { owner, repo, path: filePath, branch, message, content }
    if (!branch) delete payload.branch
    octokit.repos
      .createOrUpdateFileContents(payload)
      .then((result) => resolvePromise(result.data.content.download_url))
      .catch(() => rejectPromise('Upload failed, the image will be copied to the image folder'))
  }

  const uploadByCommand = async (uploader, filepath, suffix = '') => {
    let localIsPath = true
    let localPath = filepath
    if (typeof filepath !== 'string') {
      localIsPath = false
      const data = new Uint8Array(filepath)
      localPath = window.path.join(tmpdir(), `${Date.now()}${suffix}`)
      await window.fileUtils.writeFile(localPath, data)
    }
    const handleExec = (err, data) => {
      if (!localIsPath) window.fileUtils.unlink(localPath)
      if (err) return rejectPromise(err)
      const parts = data.split('[PicGo SUCCESS]:')
      if (parts.length === 2) resolvePromise(parts[1].trim())
      else rejectPromise('PicGo upload error')
    }
    if (uploader === 'picgo') {
      exec(`picgo u "${localPath}"`, handleExec)
    } else {
      execFile(cliScript, [localPath], (err, data) => {
        if (!localIsPath) window.fileUtils.unlink(localPath)
        if (err) return rejectPromise(err)
        resolvePromise(data.trim())
      })
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
            const fileBuffer = await window.fileUtils.readFile(imagePath)
            const base64 = Buffer.from(fileBuffer).toString('base64')
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
            uploadByGithub(Buffer.from(reader.result).toString('base64'), image.name)
        }
      }
      reader.readAsArrayBuffer(image)
    }
  }
  return promise
}

export const isFileExecutableSync = (filepath) => {
  try {
    const stat = statSync(filepath)
    if (process.platform === 'win32') {
      return stat.isFile()
    } else {
      return (
        stat.isFile() &&
        (stat.mode & (constants.S_IXUSR | constants.S_IXGRP | constants.S_IXOTH)) !== 0
      )
    }
  } catch {
    return false
  }
}
