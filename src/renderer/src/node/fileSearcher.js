// step-8i: file-name search (ripgrep --files mode) relocated to
// src/main/search/. This file is a thin IPC client that overrides
// search() to use mode='files'. Original API surface (cancel-able
// thenable, didMatch streams file paths) preserved.
import RipgrepDirectorySearcher from './ripgrepSearcher'

class FileSearcher extends RipgrepDirectorySearcher {
  search(directories, _pattern, options) {
    return this._spawn('files', directories, '', options)
  }
}

export default FileSearcher
