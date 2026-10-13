// FILE: tests/renderer/util/image-folder-access.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin the App Store sandbox decision path for images saved beside a document (C-24 T-006): ask once for folder access, retry on a covering grant, otherwise save globally with a notice; never swallow unrelated errors.
//   SCOPE: saveImageWithFolderAccess / isPermissionError in src/renderer/src/util/fileSystem.js (START_BLOCK_IMAGE_FOLDER_ACCESS).
//   DEPENDS: src/renderer/src/util/fileSystem.js, Vitest.
//   LINKS: .grace/changes/archive/C-24; M-047 mt_grant_folder_access.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   denied - a permission error as the Tauri fs bridge reports it.
//   setup - stubs for save/fallback/requestAccess/notify with call counts.
// END_MODULE_MAP

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/util/index', () => ({ isWindows: false, isOsx: true, isLinux: false }))

import { __resetDeclinedFolders, isPermissionError, saveImageWithFolderAccess } from '@/util/fileSystem'

const denied = () => Object.assign(new Error('Operation not permitted (os error 1)'), { code: 'EPERM' })

function setup ({ saves = [], granted = '/notes', isAppStore = true } = {}) {
  const queue = [...saves]
  const calls = { save: 0 }
  const opts = {
    dir: '/notes',
    isAppStore,
    save: vi.fn(async () => {
      calls.save++
      const next = queue.shift()
      if (next instanceof Error) throw next
      return next
    }),
    fallback: vi.fn(async () => '/data/images/x.png'),
    requestAccess: vi.fn(async () => granted),
    notify: vi.fn()
  }
  return { opts, calls }
}

beforeEach(() => __resetDeclinedFolders())

describe('saveImageWithFolderAccess', () => {
  it('saves directly when the write succeeds (no prompt)', async () => {
    const { opts } = setup({ saves: ['assets/x.png'] })
    expect(await saveImageWithFolderAccess(opts)).toBe('assets/x.png')
    expect(opts.requestAccess).not.toHaveBeenCalled()
  })

  it('asks for access on a sandbox denial and retries when the grant covers the folder', async () => {
    const { opts } = setup({ saves: [denied(), 'assets/x.png'], granted: '/' })
    expect(await saveImageWithFolderAccess(opts)).toBe('assets/x.png')
    expect(opts.requestAccess).toHaveBeenCalledWith('/notes')
    expect(opts.fallback).not.toHaveBeenCalled()
  })

  it('falls back with a notice when the user cancels, and does not ask again this session', async () => {
    const first = setup({ saves: [denied()], granted: null })
    expect(await saveImageWithFolderAccess(first.opts)).toBe('/data/images/x.png')
    expect(first.opts.notify).toHaveBeenCalledWith(expect.stringContaining('/notes'))
    const second = setup({ saves: [denied()], granted: '/notes' })
    expect(await saveImageWithFolderAccess(second.opts)).toBe('/data/images/x.png')
    expect(second.opts.requestAccess).not.toHaveBeenCalled()
  })

  it('a grant for an unrelated folder does not count', async () => {
    const { opts } = setup({ saves: [denied()], granted: '/notes-old' })
    expect(await saveImageWithFolderAccess(opts)).toBe('/data/images/x.png')
    expect(opts.save).toHaveBeenCalledTimes(1)
  })

  it('falls back if the retry is still denied', async () => {
    const { opts } = setup({ saves: [denied(), denied()] })
    expect(await saveImageWithFolderAccess(opts)).toBe('/data/images/x.png')
    expect(opts.notify).toHaveBeenCalled()
  })

  it('outside the App Store build, or for non-permission errors, the error propagates', async () => {
    const desktop = setup({ saves: [denied()], isAppStore: false })
    await expect(saveImageWithFolderAccess(desktop.opts)).rejects.toThrow('not permitted')
    const other = setup({ saves: [new Error('disk full')] })
    await expect(saveImageWithFolderAccess(other.opts)).rejects.toThrow('disk full')
    expect(other.opts.requestAccess).not.toHaveBeenCalled()
  })
})

describe('saveImageWithFolderAccess review-2 cases', () => {
  it('a failing picker counts as a decline and still falls back', async () => {
    const { opts } = setup({ saves: [denied()] })
    opts.requestAccess = vi.fn(async () => { throw new Error('dialog plugin missing') })
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await saveImageWithFolderAccess(opts)).toBe('/data/images/x.png')
    expect(opts.notify).toHaveBeenCalled()
    err.mockRestore()
  })

  it('a grant of the target assets folder itself counts', async () => {
    const { opts } = setup({ saves: [denied(), 'assets/x.png'], granted: '/notes/assets' })
    opts.target = '/notes/assets'
    expect(await saveImageWithFolderAccess(opts)).toBe('assets/x.png')
  })
})

describe('isPermissionError', () => {
  it('recognises sandbox and permission failures only', () => {
    expect(isPermissionError(denied())).toBe(true)
    expect(isPermissionError({ code: 'EACCES' })).toBe(true)
    expect(isPermissionError({ code: 'MT_FS_PERM_DENIED', message: 'x' })).toBe(true)
    expect(isPermissionError('Permission denied (os error 13)')).toBe(true)
    expect(isPermissionError(new Error('No space left on device'))).toBe(false)
    expect(isPermissionError(null)).toBe(false)
    expect(isPermissionError({ code: 'MT_FS_IO', message: 'Operation not permitted (os error 1)' })).toBe(true)
    expect(isPermissionError({ code: 'MT_FS_PATH_DENIED', message: 'path traversal: /x resolves outside sandbox /y' })).toBe(false)
  })
})
