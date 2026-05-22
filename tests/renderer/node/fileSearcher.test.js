/**
 * Tests for src/renderer/src/node/fileSearcher.js
 *
 * Covers: FileSearcher class — search() delegates to _spawn with mode='files'
 */

vi.mock('@/node/ripgrepSearcher', () => {
  return {
    default: class MockRipgrepDirectorySearcher {
      _spawn(mode, directories, pattern, options) {
        return { mode, directories, pattern, options }
      }

      search(directories, pattern, options) {
        return this._spawn('content', directories, pattern, options)
      }

      _serializeOptions(options) {
        return options || {}
      }
    }
  }
})

import FileSearcher from '@/node/fileSearcher'

describe('node/fileSearcher', () => {
  it('should create a FileSearcher instance', () => {
    const searcher = new FileSearcher()
    expect(searcher).toBeDefined()
  })

  it('should override search to use mode "files"', () => {
    const searcher = new FileSearcher()
    const result = searcher.search(['/path/to/dir'], 'pattern', { flag: true })
    expect(result.mode).toBe('files')
    expect(result.directories).toEqual(['/path/to/dir'])
    expect(result.pattern).toBe('')
    expect(result.options).toEqual({ flag: true })
  })

  it('should pass empty string as pattern', () => {
    const searcher = new FileSearcher()
    const result = searcher.search(['/dir'], 'ignored-pattern', {})
    expect(result.pattern).toBe('')
  })

  it('should pass directories through', () => {
    const searcher = new FileSearcher()
    const dirs = ['/a', '/b', '/c']
    const result = searcher.search(dirs, '', {})
    expect(result.directories).toBe(dirs)
  })

  it('should inherit from RipgrepDirectorySearcher', () => {
    const searcher = new FileSearcher()
    // Should have _spawn from parent
    expect(typeof searcher._spawn).toBe('function')
  })
})
