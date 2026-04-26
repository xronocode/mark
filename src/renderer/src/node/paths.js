import EnvPaths from 'common/envPaths'

// // "vscode-ripgrep" is unpacked out of asar because of the binary.
const rgDiskPath = window.rgPath.replace(/\bapp\.asar\b/, 'app.asar.unpacked')

class RendererPaths extends EnvPaths {
  /**
   * Configure and sets all application paths.
   *
   * @param {string} userDataPath The user data path.
   */
  constructor(userDataPath) {
    if (!userDataPath) {
      throw new Error('No user data path is given.')
    }

    // Initialize environment paths
    super(userDataPath)

    // Allow to use a local ripgrep binary (e.g. an optimized version).
    // step-8d: process.env.MARKTEXT_RIPGREP_PATH → window.electron.process.env.*
    // (preload bridge — @electron-toolkit/preload spreads the env object).
    const overridePath = window.electron.process.env.MARKTEXT_RIPGREP_PATH
    if (overridePath) {
      // NOTE: Binary must be a compatible version, otherwise the searcher may fail.
      this._ripgrepBinaryPath = overridePath
    } else {
      this._ripgrepBinaryPath = rgDiskPath
    }
  }

  // Returns the path to ripgrep on disk.
  get ripgrepBinaryPath() {
    return this._ripgrepBinaryPath
  }
}

export default RendererPaths
