/**
 * Tests for src/renderer/src/node/paths.js
 *
 * Covers: RendererPaths constructor (the ripgrep binary-path machinery —
 * MARKTEXT_RIPGREP_PATH override, window.rgPath default, getter — was
 * removed as dead code; the Tauri search backend never read it)
 */

vi.mock('common/envPaths', () => {
  return {
    default: class EnvPaths {
      constructor(userDataPath) {
        this.userDataPath = userDataPath
      }
    }
  }
})

describe('node/paths', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  async function loadRendererPaths() {
    const mod = await import('@/node/paths')
    return mod.default
  }

  it('should throw if no userDataPath is provided', async () => {
    const RendererPaths = await loadRendererPaths()
    expect(() => new RendererPaths()).toThrow('No user data path is given.')
    expect(() => new RendererPaths('')).toThrow('No user data path is given.')
    expect(() => new RendererPaths(null)).toThrow('No user data path is given.')
  })

  it('should create instance with userDataPath', async () => {
    const RendererPaths = await loadRendererPaths()
    const paths = new RendererPaths('/tmp/mt-test')
    expect(paths.userDataPath).toBe('/tmp/mt-test')
  })
})
