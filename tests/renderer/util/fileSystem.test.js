/**
 * Tests for src/renderer/src/util/fileSystem.js
 *
 * Covers: create, paste, rename, getHash, getContentHash,
 *         moveToRelativeFolder, moveImageToFolder, uploadImage,
 *         isFileExecutable, arrayBufferToBase64 (indirectly)
 */

vi.mock('dayjs', () => {
  const mockDayjs = () => ({
    format: vi.fn((fmt) => {
      if (fmt === 'YYYY-MM-DD-HH-mm-ss') return '2024-01-15-10-30-00'
      if (fmt === 'YYYY/MM') return '2024/01'
      if (fmt === 'DD-HH-mm-ss') return '15-10-30-00'
      if (fmt === 'YYYY-MM-DD HH:mm:ss') return '2024-01-15 10:30:00'
      return '2024-01-15'
    })
  })
  mockDayjs.format = vi.fn()
  return { default: mockDayjs }
})

vi.mock('@octokit/rest', () => ({
  Octokit: class MockOctokit {
    constructor() {
      this.repos = {
        createOrUpdateFileContents: vi.fn().mockResolvedValue({
          data: { content: { download_url: 'https://example.com/image.png' } }
        })
      }
    }
  }
}))

vi.mock('@/util/index', () => ({
  isWindows: false,
  isOsx: true,
  isLinux: false
}))

import {
  create,
  paste,
  rename,
  getHash,
  getContentHash,
  moveToRelativeFolder,
  moveImageToFolder,
  uploadImage,
  isFileExecutable
} from '@/util/fileSystem'

describe('util/fileSystem', () => {
  describe('create', () => {
    it('should call ensureDir for directory type', async () => {
      await create('/path/to/dir', 'directory')
      expect(window.fileUtils.ensureDir).toHaveBeenCalledWith('/path/to/dir')
    })

    it('should call outputFile for file type', async () => {
      await create('/path/to/file.md', 'file')
      expect(window.fileUtils.outputFile).toHaveBeenCalledWith('/path/to/file.md', '')
    })
  })

  describe('paste', () => {
    it('should call move for cut type', async () => {
      await paste({ src: '/a', dest: '/b', type: 'cut' })
      expect(window.fileUtils.move).toHaveBeenCalledWith('/a', '/b')
    })

    it('should call copy for copy type', async () => {
      await paste({ src: '/a', dest: '/b', type: 'copy' })
      expect(window.fileUtils.copy).toHaveBeenCalledWith('/a', '/b')
    })
  })

  describe('rename', () => {
    it('should call move', async () => {
      await rename('/old', '/new')
      expect(window.fileUtils.move).toHaveBeenCalledWith('/old', '/new')
    })
  })

  describe('getHash', () => {
    it('should compute SHA-1 hash', async () => {
      const hash = await getHash('hello', 'utf8', 'sha1')
      expect(typeof hash).toBe('string')
      expect(hash).toHaveLength(40) // SHA-1 = 40 hex chars
    })

    it('should compute SHA-256 hash', async () => {
      const hash = await getHash('hello', 'utf8', 'sha256')
      expect(typeof hash).toBe('string')
      expect(hash).toHaveLength(64) // SHA-256 = 64 hex chars
    })

    it('should compute SHA-384 hash', async () => {
      const hash = await getHash('hello', 'utf8', 'sha384')
      expect(hash).toHaveLength(96)
    })

    it('should compute SHA-512 hash', async () => {
      const hash = await getHash('hello', 'utf8', 'sha512')
      expect(hash).toHaveLength(128)
    })

    it('should throw for unsupported algorithm', async () => {
      await expect(getHash('hello', 'utf8', 'md5')).rejects.toThrow('unsupported algorithm')
    })

    it('should handle case-insensitive algorithm name', async () => {
      const hash = await getHash('hello', 'utf8', 'SHA1')
      expect(hash).toHaveLength(40)
    })
  })

  describe('getContentHash', () => {
    it('should compute SHA-1 hash of content', async () => {
      const hash = await getContentHash('test content')
      expect(typeof hash).toBe('string')
      expect(hash).toHaveLength(40)
    })
  })

  describe('moveToRelativeFolder', () => {
    it('should use "assets" as default relative name', async () => {
      window.path.resolve.mockImplementation((...args) => args.join('/'))
      window.path.basename.mockReturnValue('image.png')
      window.path.dirname.mockReturnValue('/project')
      window.path.relative.mockReturnValue('assets/image.png')

      const result = await moveToRelativeFolder('/project', '', '/project/file.md', '/tmp/image.png')
      expect(window.fileUtils.ensureDir).toHaveBeenCalled()
      expect(window.fileUtils.move).toHaveBeenCalled()
      expect(result).toBe('assets/image.png')
    })

    it('should throw for absolute relative name', async () => {
      window.path.isAbsolute.mockReturnValue(true)
      await expect(
        moveToRelativeFolder('/project', '/absolute/path', '/project/file.md', '/tmp/img.png')
      ).rejects.toThrow('Invalid relative directory name.')
    })

    it('should use provided relative name', async () => {
      window.path.isAbsolute.mockReturnValue(false)
      window.path.resolve.mockImplementation((...args) => args.join('/'))
      window.path.basename.mockReturnValue('img.png')
      window.path.dirname.mockReturnValue('/project')
      window.path.relative.mockReturnValue('images/img.png')

      const result = await moveToRelativeFolder('/project', 'images', '/project/file.md', '/tmp/img.png')
      expect(result).toBe('images/img.png')
    })
  })

  describe('moveImageToFolder', () => {
    it('should copy string image path to output dir with hash', async () => {
      window.path.dirname.mockReturnValue('/docs')
      window.path.resolve.mockReturnValue('/docs/image.png')
      window.fileUtils.isImageFile.mockReturnValue(true)
      window.path.basename.mockReturnValue('image.png')
      window.path.extname.mockReturnValue('.png')
      window.path.join.mockImplementation((...args) => args.join('/'))

      const result = await moveImageToFolder('/docs/file.md', 'image.png', '/output')
      expect(window.fileUtils.ensureDir).toHaveBeenCalledWith('/output')
      expect(window.fileUtils.copy).toHaveBeenCalled()
      expect(result).toContain('.png')
    })

    it('should return same path if image path matches output path', async () => {
      window.path.dirname.mockReturnValue('/output')
      window.path.resolve.mockReturnValue('/output/image.png')
      window.fileUtils.isImageFile.mockReturnValue(true)
      window.path.basename.mockReturnValue('image.png')
      window.path.extname.mockReturnValue('.png')
      window.path.join.mockReturnValue('/output/image.png')

      const result = await moveImageToFolder('/output/file.md', 'image.png', '/output')
      expect(result).toBe('/output/image.png')
    })

    it('should return non-image string as-is', async () => {
      window.path.dirname.mockReturnValue('/docs')
      window.path.resolve.mockReturnValue('/docs/file.txt')
      window.fileUtils.isImageFile.mockReturnValue(false)

      const result = await moveImageToFolder('/docs/file.md', 'file.txt', '/output')
      expect(result).toBe('file.txt')
    })

    it('should handle File object (non-string image)', async () => {
      const mockFile = {
        name: 'photo.png',
        arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(4))
      }
      window.path.join.mockReturnValue('/output/2024-01-15-10-30-00-photo.png')
      window.path.extname.mockReturnValue('.png')

      const result = await moveImageToFolder('/docs/file.md', mockFile, '/output')
      expect(window.fileUtils.writeFile).toHaveBeenCalled()
      expect(result).toBe('/output/2024-01-15-10-30-00-photo.png')
    })
  })

  describe('uploadImage', () => {
    const basePrefs = {
      currentUploader: 'github',
      imageBed: { github: { owner: 'user', repo: 'repo', branch: 'main' } },
      githubToken: 'token123',
      cliScript: ''
    }

    it('should reject when currentUploader is none', async () => {
      const prefs = { ...basePrefs, currentUploader: 'none' }
      await expect(uploadImage('/docs/file.md', 'img.png', prefs)).rejects.toBeTruthy()
    })

    it('should resolve non-image string path', async () => {
      window.path.dirname.mockReturnValue('/docs')
      window.path.resolve.mockReturnValue('/docs/data.txt')
      window.fileUtils.isImageFile.mockReturnValue(false)

      const result = await uploadImage('/docs/file.md', 'data.txt', basePrefs)
      expect(result).toBe('data.txt')
    })

    it('should reject for oversized image path', async () => {
      window.path.dirname.mockReturnValue('/docs')
      window.path.resolve.mockReturnValue('/docs/big.png')
      window.fileUtils.isImageFile.mockReturnValue(true)
      window.fileUtils.stat.mockResolvedValue({ size: 10 * 1024 * 1024 })

      await expect(uploadImage('/docs/file.md', 'big.png', basePrefs)).rejects.toContain(
        'Cannot upload more than 5M'
      )
    })

    it('should upload by github for string image path', async () => {
      window.path.dirname.mockReturnValue('/docs')
      window.path.resolve.mockReturnValue('/docs/img.png')
      window.fileUtils.isImageFile.mockReturnValue(true)
      window.fileUtils.stat.mockResolvedValue({ size: 1024 })
      window.path.basename.mockReturnValue('img.png')
      window.fileUtils.readFile.mockResolvedValue(new Uint8Array([72, 101]).buffer)

      const result = await uploadImage('/docs/file.md', 'img.png', basePrefs)
      expect(result).toBe('https://example.com/image.png')
    })

    it('should upload by picgo for string image path', async () => {
      window.path.dirname.mockReturnValue('/docs')
      window.path.resolve.mockReturnValue('/docs/img.png')
      window.fileUtils.isImageFile.mockReturnValue(true)
      window.fileUtils.stat.mockResolvedValue({ size: 1024 })
      window.electron.ipcRenderer.invoke.mockResolvedValue('https://uploaded.com/img.png')

      const prefs = { ...basePrefs, currentUploader: 'picgo' }
      const result = await uploadImage('/docs/file.md', 'img.png', prefs)
      expect(result).toBe('https://uploaded.com/img.png')
    })

    it('should upload by cliScript for string image path', async () => {
      window.path.dirname.mockReturnValue('/docs')
      window.path.resolve.mockReturnValue('/docs/img.png')
      window.fileUtils.isImageFile.mockReturnValue(true)
      window.fileUtils.stat.mockResolvedValue({ size: 1024 })
      window.electron.ipcRenderer.invoke.mockResolvedValue('https://uploaded.com/img.png')

      const prefs = { ...basePrefs, currentUploader: 'cliScript' }
      const result = await uploadImage('/docs/file.md', 'img.png', prefs)
      expect(result).toBe('https://uploaded.com/img.png')
    })

    it('should reject when command upload returns empty URL', async () => {
      window.path.dirname.mockReturnValue('/docs')
      window.path.resolve.mockReturnValue('/docs/img.png')
      window.fileUtils.isImageFile.mockReturnValue(true)
      window.fileUtils.stat.mockResolvedValue({ size: 1024 })
      window.electron.ipcRenderer.invoke.mockResolvedValue('')

      const prefs = { ...basePrefs, currentUploader: 'picgo' }
      await expect(uploadImage('/docs/file.md', 'img.png', prefs)).rejects.toContain('empty URL')
    })

    it('should reject when command upload throws', async () => {
      window.path.dirname.mockReturnValue('/docs')
      window.path.resolve.mockReturnValue('/docs/img.png')
      window.fileUtils.isImageFile.mockReturnValue(true)
      window.fileUtils.stat.mockResolvedValue({ size: 1024 })
      window.electron.ipcRenderer.invoke.mockRejectedValue(new Error('cmd failed'))

      const prefs = { ...basePrefs, currentUploader: 'picgo' }
      await expect(uploadImage('/docs/file.md', 'img.png', prefs)).rejects.toBe('cmd failed')
    })

    it('should reject when command upload throws non-Error', async () => {
      window.path.dirname.mockReturnValue('/docs')
      window.path.resolve.mockReturnValue('/docs/img.png')
      window.fileUtils.isImageFile.mockReturnValue(true)
      window.fileUtils.stat.mockResolvedValue({ size: 1024 })
      window.electron.ipcRenderer.invoke.mockRejectedValue('string error')

      const prefs = { ...basePrefs, currentUploader: 'picgo' }
      await expect(uploadImage('/docs/file.md', 'img.png', prefs)).rejects.toBe('string error')
    })

    it('should reject for oversized File object', async () => {
      const mockFile = { size: 10 * 1024 * 1024, name: 'big.png' }
      await expect(uploadImage('/docs/file.md', mockFile, basePrefs)).rejects.toContain(
        'Cannot upload more than 5M'
      )
    })

    it('should handle File object upload with github', async () => {
      const ab = new ArrayBuffer(4)
      const mockFile = {
        size: 1024,
        name: 'photo.png',
        arrayBuffer: vi.fn().mockResolvedValue(ab)
      }

      // FileReader mock — must be a real class (used with `new`)
      const origFileReader = globalThis.FileReader
      globalThis.FileReader = class MockFileReader {
        constructor() {
          this.onload = null
          this.result = null
        }

        readAsArrayBuffer() {
          this.result = ab
          if (this.onload) this.onload()
        }
      }

      const result = await uploadImage('/docs/file.md', mockFile, basePrefs)
      expect(result).toBe('https://example.com/image.png')

      globalThis.FileReader = origFileReader
    })

    it('should handle File object upload with picgo', async () => {
      const ab = new ArrayBuffer(4)
      const mockFile = {
        size: 1024,
        name: 'photo.png',
        arrayBuffer: vi.fn().mockResolvedValue(ab)
      }

      window.path.extname.mockReturnValue('.png')
      window.path.join.mockReturnValue('/tmp/123456.png')
      window.electron.ipcRenderer.invoke.mockResolvedValue('https://uploaded.com/photo.png')

      const origFileReader = globalThis.FileReader
      globalThis.FileReader = class MockFileReader {
        constructor() {
          this.onload = null
          this.result = null
        }

        readAsArrayBuffer() {
          this.result = ab
          if (this.onload) this.onload()
        }
      }

      const prefs = { ...basePrefs, currentUploader: 'picgo' }
      const result = await uploadImage('/docs/file.md', mockFile, prefs)
      expect(result).toBe('https://uploaded.com/photo.png')

      globalThis.FileReader = origFileReader
    })

    it('should upload github without branch if branch is empty', async () => {
      window.path.dirname.mockReturnValue('/docs')
      window.path.resolve.mockReturnValue('/docs/img.png')
      window.fileUtils.isImageFile.mockReturnValue(true)
      window.fileUtils.stat.mockResolvedValue({ size: 1024 })
      window.path.basename.mockReturnValue('img.png')
      window.fileUtils.readFile.mockResolvedValue(new Uint8Array([72, 101]).buffer)

      const prefs = {
        ...basePrefs,
        imageBed: { github: { owner: 'user', repo: 'repo', branch: '' } }
      }
      const result = await uploadImage('/docs/file.md', 'img.png', prefs)
      expect(result).toBe('https://example.com/image.png')
    })
  })

  describe('isFileExecutable', () => {
    it('should return true for executable file on non-Windows', async () => {
      window.fileUtils.stat.mockResolvedValue({ isFile: true, mode: 0o755 })
      const result = await isFileExecutable('/usr/bin/node')
      expect(result).toBe(true)
    })

    it('should return false for non-executable file', async () => {
      window.fileUtils.stat.mockResolvedValue({ isFile: true, mode: 0o644 })
      const result = await isFileExecutable('/usr/bin/node')
      expect(result).toBe(false)
    })

    it('should return false for directory', async () => {
      window.fileUtils.stat.mockResolvedValue({ isFile: false, mode: 0o755 })
      const result = await isFileExecutable('/usr/bin')
      expect(result).toBe(false)
    })

    it('should return false on stat error', async () => {
      window.fileUtils.stat.mockRejectedValue(new Error('ENOENT'))
      const result = await isFileExecutable('/nonexistent')
      expect(result).toBe(false)
    })
  })
})
