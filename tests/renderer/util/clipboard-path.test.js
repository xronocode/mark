// FILE: tests/renderer/util/clipboard-path.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: C-52 unit pins for util/clipboardPath.js — clipboard text
//            parsing (absolute, ~, file:// with %20, quotes, trailing
//            newline, multi-line → first line, garbage → null), the
//            editable-target guard, stat classification, candidate
//            resolution order and the mt::open-new-tab markdown emit.
//   SCOPE: pure resolver behaviour with a mocked @/ipc/runtime and the
//            globally mocked @tauri-apps/api/event.
//   DEPENDS: vitest, tests/renderer/setup.ts (window.* globals +
//            @tauri-apps mocks), @/ipc/runtime mock.
//   LINKS: .grace/changes/archive/C-52/spec.xml R-3;
//          .grace/verification/runtime.xml V-M-011 scenario-62.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   ipcFsMock - ipc.fs double (stat / read) driving the default resolvers.
//   emitMock - @tauri-apps/api/event emit spy (mt::open-new-tab pin).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-10-16 C-52 T-001: initial pins.
// END_CHANGE_SUMMARY

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { emit } from '@tauri-apps/api/event'

const ipcFsMock = { stat: vi.fn(), read: vi.fn() }
vi.mock('@/ipc/runtime', () => ({
  ipc: { fs: { stat: (p) => ipcFsMock.stat(p), read: (p) => ipcFsMock.read(p) } }
}))

import {
  parseClipboardTextToPath,
  fileUrlToPath,
  isAbsolutePath,
  isEditableTarget,
  classifyStat,
  resolveClipboardTarget,
  openMarkdownFileTab
} from '@/util/clipboardPath'

const emitMock = vi.mocked(emit)

describe('util/clipboardPath (C-52)', () => {
  beforeEach(() => {
    ipcFsMock.stat.mockReset()
    ipcFsMock.read.mockReset()
    emitMock.mockReset()
    emitMock.mockResolvedValue(undefined)
  })

  // ── text parsing ──────────────────────────────────────────────────

  describe('parseClipboardTextToPath', () => {
    it('accepts a bare absolute path', () => {
      expect(parseClipboardTextToPath('/Users/<fixture>/docs', '')).toBe('/Users/<fixture>/docs')
    })

    it('trims surrounding whitespace and a trailing newline', () => {
      expect(parseClipboardTextToPath('  /tmp/folder\n', '')).toBe('/tmp/folder')
      expect(parseClipboardTextToPath('/tmp/folder\r\n', '')).toBe('/tmp/folder')
    })

    it('considers only the FIRST line of a multi-line copy', () => {
      expect(parseClipboardTextToPath('/a/b\n/a/c\n/a/d', '')).toBe('/a/b')
    })

    it('strips one pair of matching surrounding quotes', () => {
      expect(parseClipboardTextToPath('"/tmp/my folder"', '')).toBe('/tmp/my folder')
      expect(parseClipboardTextToPath("'/tmp/folder'", '')).toBe('/tmp/folder')
    })

    it('expands ~ against the home directory', () => {
      expect(parseClipboardTextToPath('~/Documents/notes', '/Users/<fixture>')).toBe(
        '/Users/<fixture>/Documents/notes'
      )
      expect(parseClipboardTextToPath('~/Documents', '/Users/<fixture>/')).toBe('/Users/<fixture>/Documents')
    })

    it('rejects ~ when no home directory is known', () => {
      expect(parseClipboardTextToPath('~/Documents', '')).toBeNull()
    })

    it('decodes a file:// URL with percent escapes', () => {
      expect(parseClipboardTextToPath('file:///Users/<fixture>/My%20Docs', '')).toBe(
        '/Users/<fixture>/My Docs'
      )
    })

    it('accepts file://localhost and a Windows drive-letter URL', () => {
      expect(parseClipboardTextToPath('file://localhost/tmp/x', '')).toBe('/tmp/x')
      expect(parseClipboardTextToPath('file:///C:/Users/<fixture>/notes.md', '')).toBe('C:/Users/<fixture>/notes.md')
    })

    it('returns null for garbage, relative paths, remote hosts and empty text', () => {
      expect(parseClipboardTextToPath('hello world', '')).toBeNull()
      expect(parseClipboardTextToPath('notes.md', '')).toBeNull()
      expect(parseClipboardTextToPath('', '')).toBeNull()
      expect(parseClipboardTextToPath('   \n  ', '')).toBeNull()
      expect(parseClipboardTextToPath('file://server/share/x', '')).toBeNull()
      expect(parseClipboardTextToPath('https://example.com/a', '')).toBeNull()
      expect(parseClipboardTextToPath(undefined, '')).toBeNull()
      expect(parseClipboardTextToPath(null, '')).toBeNull()
    })
  })

  describe('fileUrlToPath', () => {
    it('returns "" for non-file URLs and degenerate file URLs', () => {
      expect(fileUrlToPath('https://x.dev/a')).toBe('')
      expect(fileUrlToPath('file://')).toBe('')
      expect(fileUrlToPath('file:///')).toBe('')
      expect(fileUrlToPath('not a url')).toBe('')
    })

    it('falls back to manual parsing when the URL constructor rejects the string', () => {
      // A space in the host makes new URL() throw; the manual branch
      // rejects the remote host without crashing.
      expect(fileUrlToPath('file://ho st/a')).toBe('')
      expect(fileUrlToPath('file://loc alhost/x')).toBe('')
    })
  })

  describe('isAbsolutePath', () => {
    it('accepts posix, UNC and drive-letter forms; rejects relative', () => {
      expect(isAbsolutePath('/a')).toBe(true)
      expect(isAbsolutePath('\\\\server\\share')).toBe(true)
      expect(isAbsolutePath('C:\\Users\\x')).toBe(true)
      expect(isAbsolutePath('C:/Users/<fixture>')).toBe(true)
      expect(isAbsolutePath('a/b')).toBe(false)
      expect(isAbsolutePath('~/x')).toBe(false)
    })
  })

  // ── editable-target guard (R-2: never steal a paste from a control) ─

  describe('isEditableTarget', () => {
    it('flags inputs, textareas, selects and contenteditable; passes everything else', () => {
      const input = document.createElement('input')
      const textarea = document.createElement('textarea')
      const select = document.createElement('select')
      const div = document.createElement('div')
      const editable = document.createElement('div')
      editable.contentEditable = 'true'
      expect(isEditableTarget(input)).toBe(true)
      expect(isEditableTarget(textarea)).toBe(true)
      expect(isEditableTarget(select)).toBe(true)
      expect(isEditableTarget(editable)).toBe(true)
      expect(isEditableTarget(div)).toBe(false)
      expect(isEditableTarget(null)).toBe(false)
      expect(isEditableTarget(window)).toBe(false)
    })
  })

  // ── classification + resolution ───────────────────────────────────

  describe('classifyStat', () => {
    const hasMd = (p) => /\.(md|markdown|txt)$/i.test(p)
    it('classifies directories and Markdown files; rejects the rest', () => {
      expect(classifyStat('/a', { isDirectory: true, isFile: false }, hasMd)).toBe('folder')
      expect(classifyStat('/a/b.md', { isDirectory: false, isFile: true }, hasMd)).toBe('markdown')
      expect(classifyStat('/a/b.png', { isDirectory: false, isFile: true }, hasMd)).toBeNull()
      expect(classifyStat('/a', null, hasMd)).toBeNull()
    })
  })

  describe('resolveClipboardTarget', () => {
    it('prefers pasteboard file paths over the parsed text', async () => {
      const stat = vi.fn(async (p) =>
        p === '/from/pasteboard' ? { isDirectory: true } : { isDirectory: false, isFile: true }
      )
      const target = await resolveClipboardTarget(
        { filePaths: ['/from/pasteboard'], text: '/from/text.md' },
        { stat }
      )
      expect(target).toEqual({ kind: 'folder', path: '/from/pasteboard' })
      expect(stat).toHaveBeenCalledTimes(1)
    })

    it('falls back to the clipboard text when no pasteboard paths exist', async () => {
      const target = await resolveClipboardTarget(
        { filePaths: [], text: '  /tmp/notes.md\n' },
        { stat: vi.fn(async () => ({ isDirectory: false, isFile: true })) }
      )
      expect(target).toEqual({ kind: 'markdown', path: '/tmp/notes.md' })
    })

    it('expands ~ text against homeDir', async () => {
      const stat = vi.fn(async () => ({ isDirectory: true }))
      const target = await resolveClipboardTarget(
        { filePaths: [], text: '~/prj' },
        { stat, homeDir: '/Users/<fixture>' }
      )
      expect(target).toEqual({ kind: 'folder', path: '/Users/<fixture>/prj' })
    })

    it('returns null when nothing stats as folder or Markdown', async () => {
      const stat = vi.fn(async () => {
        throw new Error('MT_FS_NOT_FOUND')
      })
      const target = await resolveClipboardTarget(
        { filePaths: ['/gone'], text: '/gone/too' },
        { stat }
      )
      expect(target).toBeNull()
      // both candidates were tried
      expect(stat).toHaveBeenCalledTimes(2)
    })

    it('uses the real ipc.fs.stat default when no stat is injected', async () => {
      ipcFsMock.stat.mockResolvedValue({ isDirectory: true, isFile: false })
      const target = await resolveClipboardTarget({ filePaths: ['/via/ipc'], text: '' })
      expect(target).toEqual({ kind: 'folder', path: '/via/ipc' })
      expect(ipcFsMock.stat).toHaveBeenCalledWith('/via/ipc')
    })
  })

  // ── the drop-shaped markdown tab open ─────────────────────────────

  describe('openMarkdownFileTab', () => {
    it('reads the file and emits mt::open-new-tab with the drop payload', async () => {
      ipcFsMock.read.mockResolvedValue('# Title\n\nbody')
      await openMarkdownFileTab('/tmp/docs/notes.md')
      expect(ipcFsMock.read).toHaveBeenCalledWith('/tmp/docs/notes.md')
      expect(emitMock).toHaveBeenCalledTimes(1)
      const [channel, payload] = emitMock.mock.calls[0]
      expect(channel).toBe('mt::open-new-tab')
      expect(payload).toMatchObject({
        markdown: '# Title\n\nbody',
        filename: 'notes.md',
        pathname: '/tmp/docs/notes.md',
        lineEnding: 'lf'
      })
      expect(payload.encoding).toEqual({ encoding: 'utf8', isBom: false })
    })

    it('never emits when the read fails', async () => {
      ipcFsMock.read.mockRejectedValue(new Error('MT_FS_NOT_FOUND'))
      await openMarkdownFileTab('/gone/note.md')
      expect(emitMock).not.toHaveBeenCalled()
    })
  })
})
