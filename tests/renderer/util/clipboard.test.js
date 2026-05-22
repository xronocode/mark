/**
 * Tests for src/renderer/src/util/clipboard.js
 *
 * Covers: guessClipboardFilePath with all platform branches
 */

// clipboard.js captures `window.electron.clipboard` at module top level,
// so we use dynamic imports after window globals are installed by setup.ts.

// Default mock: darwin
vi.mock('@/util/index', () => ({
  isLinux: false,
  isOsx: true,
  isWindows: false
}))

vi.mock('plist', () => ({
  default: {
    parse: vi.fn((data) => ['/path/to/file.png'])
  }
}))

describe('util/clipboard', () => {
  describe('guessClipboardFilePath (macOS)', () => {
    it('should return first file from clipboard on macOS', async () => {
      window.electron.clipboard = {
        has: vi.fn().mockReturnValue(true),
        read: vi.fn().mockReturnValue('<plist data>')
      }
      vi.resetModules()
      const { guessClipboardFilePath } = await import('@/util/clipboard')

      const result = guessClipboardFilePath()
      expect(result).toBe('/path/to/file.png')
    })

    it('should return empty string when no clipboard files on macOS', async () => {
      window.electron.clipboard = {
        has: vi.fn().mockReturnValue(false),
        read: vi.fn()
      }
      vi.resetModules()
      const { guessClipboardFilePath } = await import('@/util/clipboard')

      const result = guessClipboardFilePath()
      expect(result).toBe('')
    })
  })
})

// Test Linux path
describe('util/clipboard (Linux)', () => {
  it('should return empty string on Linux', async () => {
    vi.resetModules()
    vi.doMock('@/util/index', () => ({
      isLinux: true,
      isOsx: false,
      isWindows: false
    }))
    const { guessClipboardFilePath: guessFn } = await import('@/util/clipboard')
    expect(guessFn()).toBe('')
  })
})

// Test Windows path
describe('util/clipboard (Windows)', () => {
  it('should read FileNameW from clipboard on Windows', async () => {
    vi.resetModules()
    vi.doMock('@/util/index', () => ({
      isLinux: false,
      isOsx: false,
      isWindows: true
    }))
    vi.doMock('plist', () => ({
      default: { parse: vi.fn() }
    }))

    window.electron.clipboard = {
      has: vi.fn(),
      read: vi.fn().mockReturnValue('C:\\path\\file.png\0\0')
    }

    const { guessClipboardFilePath: guessFn } = await import('@/util/clipboard')
    const result = guessFn()
    expect(result).toBe('C:\\path\\file.png')
  })

  it('should return empty string for empty FileNameW on Windows', async () => {
    vi.resetModules()
    vi.doMock('@/util/index', () => ({
      isLinux: false,
      isOsx: false,
      isWindows: true
    }))
    vi.doMock('plist', () => ({
      default: { parse: vi.fn() }
    }))

    window.electron.clipboard = {
      has: vi.fn(),
      read: vi.fn().mockReturnValue('\0\0')
    }

    const { guessClipboardFilePath: guessFn } = await import('@/util/clipboard')
    const result = guessFn()
    expect(result).toBe('')
  })
})

// Test unknown platform
describe('util/clipboard (unknown platform)', () => {
  it('should return empty string on unknown platform', async () => {
    vi.resetModules()
    vi.doMock('@/util/index', () => ({
      isLinux: false,
      isOsx: false,
      isWindows: false
    }))
    vi.doMock('plist', () => ({
      default: { parse: vi.fn() }
    }))

    const { guessClipboardFilePath: guessFn } = await import('@/util/clipboard')
    expect(guessFn()).toBe('')
  })
})

// Test macOS with non-array plist result
describe('util/clipboard (macOS, non-array plist)', () => {
  it('should return empty string when plist parse returns non-array', async () => {
    vi.resetModules()
    vi.doMock('@/util/index', () => ({
      isLinux: false,
      isOsx: true,
      isWindows: false
    }))
    vi.doMock('plist', () => ({
      default: { parse: vi.fn().mockReturnValue('not-an-array') }
    }))

    window.electron.clipboard = {
      has: vi.fn().mockReturnValue(true),
      read: vi.fn().mockReturnValue('data')
    }

    const { guessClipboardFilePath: guessFn } = await import('@/util/clipboard')
    expect(guessFn()).toBe('')
  })

  it('should return empty string when plist parse returns empty array', async () => {
    vi.resetModules()
    vi.doMock('@/util/index', () => ({
      isLinux: false,
      isOsx: true,
      isWindows: false
    }))
    vi.doMock('plist', () => ({
      default: { parse: vi.fn().mockReturnValue([]) }
    }))

    window.electron.clipboard = {
      has: vi.fn().mockReturnValue(true),
      read: vi.fn().mockReturnValue('data')
    }

    const { guessClipboardFilePath: guessFn } = await import('@/util/clipboard')
    expect(guessFn()).toBe('')
  })
})
