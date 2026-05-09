/**
 * Unit tests for src/renderer/src/store/treeCtrl.js
 *
 * Pure helper module — no Pinia, no IPC. Public surface:
 *   - addFile(tree, file)
 *   - addDirectory(tree, dir)
 *   - unlinkFile(tree, file)
 *   - unlinkDirectory(tree, dir)
 *
 * The private `isPathInsideTree` and `rejectOutOfTree` are exercised
 * through the four public functions (prefix-string collisions, '..',
 * non-absolute paths). PATH_SEPARATOR resolves to window.path.sep
 * which is '/' from the setup shim — we honor that everywhere.
 *
 * `getUniqueId` is a non-deterministic monotonic counter; we don't
 * mock it, just don't assert on returned ids.
 */

// Build a fresh empty tree for each test
const makeTree = (pathname = '/root') => ({
  id: 'root-id',
  pathname,
  name: pathname.split('/').pop() ?? '',
  isCollapsed: false,
  isDirectory: true,
  isFile: false,
  isMarkdown: false,
  folders: [],
  files: []
})

const makeFile = (pathname: string, name?: string) => ({
  pathname,
  name: name ?? pathname.split('/').pop()!,
  birthTime: 0,
  isDirectory: false,
  isFile: true,
  isMarkdown: /\.md$/i.test(pathname)
})

describe('store/treeCtrl', () => {
  describe('addFile', () => {
    it('adds a top-level file to tree.files', async () => {
      const { addFile } = await import('@/store/treeCtrl')
      const tree = makeTree('/root')
      addFile(tree, makeFile('/root/a.md'))
      expect(tree.files.length).toBe(1)
      expect(tree.files[0].pathname).toBe('/root/a.md')
      expect(tree.files[0].name).toBe('a.md')
    })

    it('creates intermediate directories as needed (nested)', async () => {
      const { addFile } = await import('@/store/treeCtrl')
      const tree = makeTree('/root')
      addFile(tree, makeFile('/root/sub/deep/leaf.md'))
      expect(tree.folders.length).toBe(1)
      expect(tree.folders[0].name).toBe('sub')
      expect(tree.folders[0].folders[0].name).toBe('deep')
      expect(tree.folders[0].folders[0].files[0].name).toBe('leaf.md')
      expect(tree.folders[0].folders[0].pathname).toBe('/root/sub/deep')
    })

    it('reuses an existing intermediate folder (does not duplicate)', async () => {
      const { addFile } = await import('@/store/treeCtrl')
      const tree = makeTree('/root')
      addFile(tree, makeFile('/root/sub/a.md'))
      addFile(tree, makeFile('/root/sub/b.md'))
      expect(tree.folders.length).toBe(1)
      expect(tree.folders[0].files.length).toBe(2)
    })

    it('inserts files in alphabetical order', async () => {
      const { addFile } = await import('@/store/treeCtrl')
      const tree = makeTree('/root')
      addFile(tree, makeFile('/root/c.md'))
      addFile(tree, makeFile('/root/a.md'))
      addFile(tree, makeFile('/root/b.md'))
      expect(tree.files.map((f: any) => f.name)).toEqual(['a.md', 'b.md', 'c.md'])
    })

    it('skip-duplicate when a file with same name already exists', async () => {
      const { addFile } = await import('@/store/treeCtrl')
      const tree = makeTree('/root')
      addFile(tree, makeFile('/root/dup.md'))
      const idBefore = tree.files[0].id
      addFile(tree, makeFile('/root/dup.md'))
      expect(tree.files.length).toBe(1)
      expect(tree.files[0].id).toBe(idBefore)
    })

    it('rejects out-of-tree paths (sibling)', async () => {
      const { addFile } = await import('@/store/treeCtrl')
      const tree = makeTree('/root')
      const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})
      addFile(tree, makeFile('/elsewhere/a.md'))
      expect(tree.files.length).toBe(0)
      expect(debugSpy).toHaveBeenCalled()
      debugSpy.mockRestore()
    })

    it('rejects prefix-collision (/foo vs /foobar)', async () => {
      const { addFile } = await import('@/store/treeCtrl')
      const tree = makeTree('/foo')
      // override window.path.relative to model real Node behavior:
      // relative('/foo', '/foobar/x.md') === '../foobar/x.md'
      ;(window.path.relative as any).mockImplementation((from: string, to: string) => {
        if (from === '/foo' && to.startsWith('/foobar')) return '../foobar' + to.slice('/foobar'.length)
        if (to.startsWith(from + '/')) return to.slice(from.length + 1)
        if (to === from) return ''
        return to
      })
      const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})
      addFile(tree, makeFile('/foobar/a.md'))
      expect(tree.files.length).toBe(0)
      expect(tree.folders.length).toBe(0)
      expect(debugSpy).toHaveBeenCalled()
      debugSpy.mockRestore()
    })

    it('rejects non-absolute pathname', async () => {
      const { addFile } = await import('@/store/treeCtrl')
      const tree = makeTree('/root')
      const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})
      addFile(tree, makeFile('relative/a.md'))
      expect(tree.files.length).toBe(0)
      expect(debugSpy).toHaveBeenCalled()
      debugSpy.mockRestore()
    })

    it('rejects empty pathname', async () => {
      const { addFile } = await import('@/store/treeCtrl')
      const tree = makeTree('/root')
      const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})
      addFile(tree, { pathname: '', name: '', birthTime: 0, isDirectory: false, isFile: true, isMarkdown: false })
      expect(tree.files.length).toBe(0)
      expect(debugSpy).toHaveBeenCalled()
      debugSpy.mockRestore()
    })
  })

  describe('addDirectory', () => {
    it('adds a single direct subdirectory', async () => {
      const { addDirectory } = await import('@/store/treeCtrl')
      const tree = makeTree('/root')
      addDirectory(tree, { pathname: '/root/foo' })
      expect(tree.folders.length).toBe(1)
      expect(tree.folders[0].name).toBe('foo')
      expect(tree.folders[0].pathname).toBe('/root/foo')
    })

    it('inserts folders in alphabetical order', async () => {
      const { addDirectory } = await import('@/store/treeCtrl')
      const tree = makeTree('/root')
      addDirectory(tree, { pathname: '/root/c' })
      addDirectory(tree, { pathname: '/root/a' })
      addDirectory(tree, { pathname: '/root/b' })
      expect(tree.folders.map((f: any) => f.name)).toEqual(['a', 'b', 'c'])
    })

    it('idempotent — re-adding existing dir is a no-op', async () => {
      const { addDirectory } = await import('@/store/treeCtrl')
      const tree = makeTree('/root')
      addDirectory(tree, { pathname: '/root/foo' })
      const idBefore = tree.folders[0].id
      addDirectory(tree, { pathname: '/root/foo' })
      expect(tree.folders.length).toBe(1)
      expect(tree.folders[0].id).toBe(idBefore)
    })

    it('creates intermediate dirs and reuses for nested target', async () => {
      const { addDirectory } = await import('@/store/treeCtrl')
      const tree = makeTree('/root')
      addDirectory(tree, { pathname: '/root/a/b/c' })
      expect(tree.folders.length).toBe(1)
      expect(tree.folders[0].folders[0].folders[0].name).toBe('c')
    })

    it('rejects out-of-tree dir', async () => {
      const { addDirectory } = await import('@/store/treeCtrl')
      const tree = makeTree('/root')
      const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})
      addDirectory(tree, { pathname: '/elsewhere/foo' })
      expect(tree.folders.length).toBe(0)
      expect(debugSpy).toHaveBeenCalled()
      debugSpy.mockRestore()
    })
  })

  describe('unlinkFile', () => {
    it('removes a top-level file', async () => {
      const { addFile, unlinkFile } = await import('@/store/treeCtrl')
      const tree = makeTree('/root')
      addFile(tree, makeFile('/root/a.md'))
      addFile(tree, makeFile('/root/b.md'))
      unlinkFile(tree, makeFile('/root/a.md'))
      expect(tree.files.map((f: any) => f.name)).toEqual(['b.md'])
    })

    it('removes a nested file', async () => {
      const { addFile, unlinkFile } = await import('@/store/treeCtrl')
      const tree = makeTree('/root')
      addFile(tree, makeFile('/root/sub/x.md'))
      addFile(tree, makeFile('/root/sub/y.md'))
      unlinkFile(tree, makeFile('/root/sub/x.md'))
      expect(tree.folders[0].files.map((f: any) => f.name)).toEqual(['y.md'])
    })

    it('no-op if file not present (folder exists, file missing)', async () => {
      const { addFile, unlinkFile } = await import('@/store/treeCtrl')
      const tree = makeTree('/root')
      addFile(tree, makeFile('/root/sub/x.md'))
      unlinkFile(tree, makeFile('/root/sub/missing.md'))
      expect(tree.folders[0].files.length).toBe(1)
    })

    it('no-op if intermediate folder is missing', async () => {
      const { unlinkFile } = await import('@/store/treeCtrl')
      const tree = makeTree('/root')
      // No throw, no mutation
      expect(() => unlinkFile(tree, makeFile('/root/missing-dir/a.md'))).not.toThrow()
      expect(tree.files.length).toBe(0)
      expect(tree.folders.length).toBe(0)
    })

    it('rejects out-of-tree file', async () => {
      const { addFile, unlinkFile } = await import('@/store/treeCtrl')
      const tree = makeTree('/root')
      addFile(tree, makeFile('/root/a.md'))
      const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})
      unlinkFile(tree, makeFile('/elsewhere/a.md'))
      expect(tree.files.length).toBe(1)
      expect(debugSpy).toHaveBeenCalled()
      debugSpy.mockRestore()
    })
  })

  describe('unlinkDirectory', () => {
    it('removes a top-level subdirectory', async () => {
      const { addDirectory, unlinkDirectory } = await import('@/store/treeCtrl')
      const tree = makeTree('/root')
      addDirectory(tree, { pathname: '/root/a' })
      addDirectory(tree, { pathname: '/root/b' })
      unlinkDirectory(tree, { pathname: '/root/a' })
      expect(tree.folders.map((f: any) => f.name)).toEqual(['b'])
    })

    it('removes a nested subdirectory', async () => {
      const { addDirectory, unlinkDirectory } = await import('@/store/treeCtrl')
      const tree = makeTree('/root')
      addDirectory(tree, { pathname: '/root/a/b' })
      addDirectory(tree, { pathname: '/root/a/c' })
      unlinkDirectory(tree, { pathname: '/root/a/b' })
      expect(tree.folders[0].folders.map((f: any) => f.name)).toEqual(['c'])
    })

    it('no-op if intermediate folder missing', async () => {
      const { unlinkDirectory } = await import('@/store/treeCtrl')
      const tree = makeTree('/root')
      expect(() => unlinkDirectory(tree, { pathname: '/root/x/y' })).not.toThrow()
      expect(tree.folders.length).toBe(0)
    })

    it('no-op if directory not in folder list', async () => {
      const { addDirectory, unlinkDirectory } = await import('@/store/treeCtrl')
      const tree = makeTree('/root')
      addDirectory(tree, { pathname: '/root/a' })
      unlinkDirectory(tree, { pathname: '/root/missing' })
      expect(tree.folders.length).toBe(1)
    })

    it('rejects out-of-tree dir', async () => {
      const { addDirectory, unlinkDirectory } = await import('@/store/treeCtrl')
      const tree = makeTree('/root')
      addDirectory(tree, { pathname: '/root/a' })
      const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})
      unlinkDirectory(tree, { pathname: '/elsewhere/a' })
      expect(tree.folders.length).toBe(1)
      expect(debugSpy).toHaveBeenCalled()
      debugSpy.mockRestore()
    })
  })

  describe('isPathInsideTree edge cases (via public API)', () => {
    it('treats tree-equal pathname as inside (relative === "")', async () => {
      const { addDirectory } = await import('@/store/treeCtrl')
      const tree = makeTree('/root')
      // pathname === tree.pathname means relative is '' — accepted, but
      // subDirectories list is empty → no folders created. No throw.
      expect(() => addDirectory(tree, { pathname: '/root' })).not.toThrow()
      expect(tree.folders.length).toBe(0)
    })

    it('rejects parent-sibling traversal (".." prefix)', async () => {
      const { addFile } = await import('@/store/treeCtrl')
      const tree = makeTree('/root/sub')
      ;(window.path.relative as any).mockImplementation((from: string, to: string) => {
        if (from === '/root/sub' && to === '/root/other/x.md') return '../other/x.md'
        if (to.startsWith(from + '/')) return to.slice(from.length + 1)
        return to
      })
      const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})
      addFile(tree, makeFile('/root/other/x.md'))
      expect(tree.files.length).toBe(0)
      debugSpy.mockRestore()
    })

    it('NFC vs NFD: relative returning ".." path is rejected', async () => {
      const { addFile } = await import('@/store/treeCtrl')
      // Composed (NFC) e-acute vs decomposed (NFD) — when normalization
      // mismatches, Node's path.relative would yield '../<other>'.
      const tree = makeTree('/r/café') // NFC
      ;(window.path.relative as any).mockImplementation((from: string, to: string) => {
        if (from !== to && !to.startsWith(from + '/')) return '../' + to
        if (to.startsWith(from + '/')) return to.slice(from.length + 1)
        return ''
      })
      const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})
      addFile(tree, makeFile('/r/café/x.md')) // NFD
      expect(tree.files.length).toBe(0)
      debugSpy.mockRestore()
    })
  })
})
