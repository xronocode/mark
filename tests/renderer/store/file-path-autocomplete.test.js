// FILE: tests/renderer/store/file-path-autocomplete.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Verify the C-20 generalized ASK_FOR_FILE_PATH (dir-part/prefix resolution, extension filter, directory inclusion, 50-cap) and the byte-identical image delegate ASK_FOR_IMAGE_AUTO_PATH.
//   SCOPE: Store-action table tests with stubbed window.path/fileUtils and a seeded current file.
//   DEPENDS: Vitest, Pinia test setup, store/editor.
//   LINKS: .grace/changes/active/C-20; .grace/verification/runtime.xml V-M-011 scenario-32.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   DIR - Shared fake directory fixture.
//   setupDir - Installs a fake directory (readdir + per-name stat) and a current file.
//   useStore - Bootstraps Pinia and seeds a current file.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - C-20: link flavor (.md+dirs), no-exts flavor returns every file, image delegate parity (icon mapping), empty-src/no-file guards, cap at 50.
// END_CHANGE_SUMMARY

import { describe, expect, it, vi, beforeEach } from 'vitest'
import { setupTestPinia } from '../pinia'

vi.mock('@/i18n', () => ({
  i18n: { global: { t: (k) => k } },
  t: (k) => k
}))
vi.mock('@/services/notification', () => ({
  default: { notify: vi.fn(async () => undefined) }
}))

const DIR = {
  'notes.md': { isDirectory: false },
  'README.md': { isDirectory: false },
  'pic.png': { isDirectory: false },
  'data.json': { isDirectory: false },
  sub: { isDirectory: true }
}

const setupDir = (dir = DIR) => {
  // resolve normalizes '..' segments like real path-browserify — the
  // clamp test depends on real resolution semantics.
  const resolveReal = (base, rel) => {
    const parts = `${base}/${rel === '.' ? '' : rel}`.split('/')
    const out = []
    for (const part of parts) {
      if (part === '' || part === '.') continue
      if (part === '..') out.pop()
      else out.push(part)
    }
    return `/${out.join('/')}`
  }
  window.path = {
    dirname: () => '/docs',
    resolve: resolveReal,
    sep: '/',
    join: (a, b) => `${a}/${b}`
  }
  window.fileUtils = {
    readdir: vi.fn(async () => Object.keys(dir)),
    stat: vi.fn(async (full) => {
      const name = full.split('/').pop()
      if (!(name in dir)) throw new Error('ENOENT')
      return dir[name]
    })
  }
}

const useStore = async () => {
  const pinia = setupTestPinia()
  const { useEditorStore } = await import('@/store/editor')
  const editor = useEditorStore()
  editor.currentFile = { id: 't1', pathname: '/docs/index.md', filename: 'index.md' }
  return editor
}

describe('ASK_FOR_FILE_PATH — C-20', () => {
  beforeEach(() => {
    setupDir()
  })

  it('link flavor returns .md files and directories, filtered by prefix', async () => {
    const editor = await useStore()
    const out = await editor.ASK_FOR_FILE_PATH('no', { exts: ['md'] })
    expect(out.map((r) => r.text)).toEqual(['notes.md'])
    const all = await editor.ASK_FOR_FILE_PATH('./', { exts: ['md', 'markdown'] })
    expect(all.map((r) => r.text).sort()).toEqual(['README.md', 'notes.md', 'sub/'])
    expect(all.find((r) => r.text === 'sub/').iconClass).toBe('icon-folder')
    expect(all.find((r) => r.text === 'notes.md').iconClass).toBe('icon-file')
  })

  it('empty exts returns every file; readdir failures return []', async () => {
    const editor = await useStore()
    const out = await editor.ASK_FOR_FILE_PATH('./', {})
    expect(out.map((r) => r.text).sort()).toEqual(['README.md', 'data.json', 'notes.md', 'pic.png', 'sub/'])
    window.fileUtils.readdir.mockRejectedValueOnce(new Error('EACCES'))
    expect(await editor.ASK_FOR_FILE_PATH('./', {})).toEqual([])
  })

  it('resolves the typed dir-part into a subdirectory', async () => {
    const editor = await useStore()
    const SUB = { 'deep.md': { isDirectory: false }, 'img.png': { isDirectory: false } }
    window.fileUtils.readdir.mockImplementation(async (dir) => {
      if (String(dir).replace(/\/$/, '') === '/docs/sub') return Object.keys(SUB)
      return Object.keys(DIR)
    })
    window.fileUtils.stat.mockImplementation(async (full) => {
      const name = full.split('/').pop()
      if (name in SUB) return SUB[name]
      if (name in DIR) return DIR[name]
      throw new Error('ENOENT')
    })
    const out = await editor.ASK_FOR_FILE_PATH('sub/d', { exts: ['md'] })
    expect(out.map((r) => r.text)).toEqual(['deep.md'])
  })

  it('clamps browsing to the document subtree (C-20 security review)', async () => {
    const editor = await useStore()
    // Absolute escape.
    expect(await editor.ASK_FOR_FILE_PATH('/etc/p', { exts: ['md'] })).toEqual([])
    // Parent traversal.
    expect(await editor.ASK_FOR_FILE_PATH('../p', { exts: ['md'] })).toEqual([])
    // The document's own directory still works.
    const ok = await editor.ASK_FOR_FILE_PATH('no', { exts: ['md'] })
    expect(ok.map((r) => r.text)).toEqual(['notes.md'])
    const calledDirs = window.fileUtils.readdir.mock.calls.map((c) => String(c[0]))
    expect(calledDirs.some((d) => d.startsWith('/etc') || d.includes('..'))).toBe(false)
  })

  it('guards: no src, no pathname, and caps at 50 entries', async () => {
    const editor = await useStore()
    expect(await editor.ASK_FOR_FILE_PATH('no', { exts: ['md'] })).toBeDefined()
    expect(await editor.ASK_FOR_FILE_PATH(null)).toEqual([])
    editor.currentFile = { pathname: null }
    expect(await editor.ASK_FOR_FILE_PATH('x')).toEqual([])

    editor.currentFile = { pathname: '/docs/index.md' }
    const many = {}
    for (let i = 0; i < 80; i++) many[`f${String(i).padStart(2, '0')}.md`] = { isDirectory: false }
    setupDir(many)
    const out = await editor.ASK_FOR_FILE_PATH('./', { exts: ['md'] })
    expect(out).toHaveLength(50)
  })
})

describe('ASK_FOR_IMAGE_AUTO_PATH delegate — parity', () => {
  beforeEach(() => {
    setupDir()
  })

  it('keeps the image flavor byte-identical: image exts, folder slash, icon mapping', async () => {
    const editor = await useStore()
    const out = await editor.ASK_FOR_IMAGE_AUTO_PATH('p')
    expect(out).toEqual([{ text: 'pic.png', iconClass: 'icon-image' }])
    const dirs = await editor.ASK_FOR_IMAGE_AUTO_PATH('s')
    expect(dirs).toEqual([{ text: 'sub/', iconClass: 'icon-folder' }])
    // Non-image files stay hidden.
    expect(await editor.ASK_FOR_IMAGE_AUTO_PATH('data')).toEqual([])
  })
})
