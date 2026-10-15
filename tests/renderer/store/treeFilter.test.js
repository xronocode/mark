// FILE: tests/renderer/store/treeFilter.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: C-51 T-001 unit tests for store/treeFilter.js — the Markdown-only default view (files and folders with Markdown anywhere below), the treeShowAllFiles restore, and folder appear/disappear as Markdown files come and go through the real treeCtrl model mutations.
//   SCOPE: pure predicate/list tests plus an integration pass over treeCtrl.addFile/addDirectory/unlinkFile mutations.
//   DEPENDS: src/renderer/src/store/treeFilter.js, src/renderer/src/store/treeCtrl.js, tests/renderer/setup.ts window.path shim.
//   LINKS: .grace/changes/active/C-51 T-001; .grace/verification/runtime.xml V-M-011.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   makeRoot - a treeCtrl-shaped root { pathname, folders, files }.
//   addMd/addOther - treeCtrl.addFile wrappers marking isMarkdown true/false.
//   addDirectory - test fixture / helper.
//   addFile - test fixture / helper.
//   addMd - test fixture / helper.
//   addOther - test fixture / helper.
//   folderHasMarkdownBelow - test fixture / helper.
//   unlinkFile - test fixture / helper.
//   visibleFiles - test fixture / helper.
//   visibleFolders - test fixture / helper.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-16 C-51 T-001: initial tests.
// END_CHANGE_SUMMARY

import { beforeEach } from 'vitest'

// treeCtrl pulls util/index.js, which reads window.electron at import time;
// tests/renderer/setup.ts installs it in a global beforeEach — so import the
// modules lazily, after the shim exists.
let folderHasMarkdownBelow, visibleFiles, visibleFolders, addFile, addDirectory, unlinkFile
beforeEach(async () => {
  ;({ folderHasMarkdownBelow, visibleFiles, visibleFolders } = await import('@/store/treeFilter'))
  ;({ addFile, addDirectory, unlinkFile } = await import('@/store/treeCtrl'))
})

const makeRoot = (pathname = '/tmp/proj') => ({
  pathname,
  name: 'proj',
  isDirectory: true,
  isFile: false,
  isMarkdown: false,
  folders: [],
  files: []
})

const addMd = (tree, pathname) =>
  addFile(tree, {
    pathname,
    name: pathname.split('/').pop(),
    isFile: true,
    isDirectory: false,
    isMarkdown: true,
    birthTime: 1
  })

const addOther = (tree, pathname) =>
  addFile(tree, {
    pathname,
    name: pathname.split('/').pop(),
    isFile: true,
    isDirectory: false,
    isMarkdown: false,
    birthTime: 1
  })

describe('store/treeFilter.js (C-51 T-001)', () => {
  describe('visibleFiles', () => {
    it('shows only Markdown files by default', () => {
      const files = [
        { name: 'a.md', isMarkdown: true },
        { name: 'b.png', isMarkdown: false },
        { name: 'c.markdown', isMarkdown: true },
        { name: 'd.txt', isMarkdown: false }
      ]
      expect(visibleFiles(files, false).map((f) => f.name)).toEqual(['a.md', 'c.markdown'])
    })

    it('shows every file when treeShowAllFiles is on', () => {
      const files = [
        { name: 'a.md', isMarkdown: true },
        { name: 'b.png', isMarkdown: false }
      ]
      expect(visibleFiles(files, true)).toHaveLength(2)
    })

    it('tolerates missing/odd shapes', () => {
      expect(visibleFiles(undefined, false)).toEqual([])
      expect(visibleFiles(null, true)).toEqual([])
      expect(visibleFiles([{ name: 'x' }, null], false)).toEqual([])
    })
  })

  describe('folderHasMarkdownBelow / visibleFolders', () => {
    it('hides folders with no Markdown anywhere below (nested empty dirs)', () => {
      const root = makeRoot()
      addDirectory(root, { pathname: '/tmp/proj/empty' })
      addDirectory(root, { pathname: '/tmp/proj/empty/deeper' })
      addDirectory(root, { pathname: '/tmp/proj/full' })
      addMd(root, '/tmp/proj/full/note.md')
      addDirectory(root, { pathname: '/tmp/proj/indirect' })
      addMd(root, '/tmp/proj/indirect/deep/leaf.md')

      const shown = visibleFolders(root.folders, false).map((f) => f.name)
      expect(shown).toEqual(['full', 'indirect'])
      expect(folderHasMarkdownBelow(root.folders.find((f) => f.name === 'empty'))).toBe(false)
    })

    it('shows every folder when treeShowAllFiles is on', () => {
      const root = makeRoot()
      addDirectory(root, { pathname: '/tmp/proj/empty' })
      addDirectory(root, { pathname: '/tmp/proj/full' })
      addMd(root, '/tmp/proj/full/note.md')
      expect(visibleFolders(root.folders, true)).toHaveLength(2)
    })

    it('a folder appears when a Markdown file is created inside it and disappears when its last one goes', () => {
      const root = makeRoot()
      addDirectory(root, { pathname: '/tmp/proj/docs' })
      expect(visibleFolders(root.folders, false)).toHaveLength(0)

      // create an .md inside → folder appears (through treeCtrl, the same
      // mutation the watcher path performs)
      addMd(root, '/tmp/proj/docs/new.md')
      expect(visibleFolders(root.folders, false).map((f) => f.name)).toEqual(['docs'])

      // a non-Markdown file alone does not keep the folder visible
      addOther(root, '/tmp/proj/docs/logo.png')
      unlinkFile(root, { pathname: '/tmp/proj/docs/new.md' })
      expect(visibleFolders(root.folders, false)).toHaveLength(0)

      // but with showAllFiles the folder (and its png) stays
      expect(visibleFolders(root.folders, true).map((f) => f.name)).toEqual(['docs'])
      expect(visibleFiles(root.folders[0].files, true).map((f) => f.name)).toEqual(['logo.png'])
    })

    it('a folder materializes from addFile alone when the watcher reports a file in a new directory', () => {
      const root = makeRoot()
      // watcher 'create' for /proj/newdir/file.md routes through addFile,
      // which creates the missing intermediate folders
      addMd(root, '/tmp/proj/newdir/file.md')
      expect(visibleFolders(root.folders, false).map((f) => f.name)).toEqual(['newdir'])
    })
  })
})
