/**
 * Tests for src/renderer/src/node/paths.js
 *
 * Covers: RendererPaths constructor, ripgrepBinaryPath getter, env override
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

// paths.js evaluates `window.rgPath.replace(...)` at the module top level,
// so we must use dynamic import after setting window.rgPath in each test.
describe('node/paths', () => {
  beforeEach(() => {
    vi.resetModules()
    window.rgPath = '/app/node_modules/vscode-ripgrep/bin/rg'
    window.electron.process.env = {}
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

  it('should set ripgrepBinaryPath from window.rgPath with asar unpacked', async () => {
    window.rgPath = '/app/app.asar/node_modules/vscode-ripgrep/bin/rg'
    const RendererPaths = await loadRendererPaths()
    const paths = new RendererPaths('/tmp/mt-test')
    expect(paths.ripgrepBinaryPath).toBe(
      '/app/app.asar.unpacked/node_modules/vscode-ripgrep/bin/rg'
    )
  })

  it('should use rgPath as-is when no app.asar in path', async () => {
    window.rgPath = '/usr/local/bin/rg'
    const RendererPaths = await loadRendererPaths()
    const paths = new RendererPaths('/tmp/mt-test')
    expect(paths.ripgrepBinaryPath).toBe('/usr/local/bin/rg')
  })

  it('should use MARKTEXT_RIPGREP_PATH env override when set', async () => {
    window.electron.process.env.MARKTEXT_RIPGREP_PATH = '/custom/rg'
    const RendererPaths = await loadRendererPaths()
    const paths = new RendererPaths('/tmp/mt-test')
    expect(paths.ripgrepBinaryPath).toBe('/custom/rg')
  })

  it('should prefer env override over window.rgPath', async () => {
    window.rgPath = '/default/rg'
    window.electron.process.env.MARKTEXT_RIPGREP_PATH = '/override/rg'
    const RendererPaths = await loadRendererPaths()
    const paths = new RendererPaths('/tmp/mt-test')
    expect(paths.ripgrepBinaryPath).toBe('/override/rg')
  })
})
