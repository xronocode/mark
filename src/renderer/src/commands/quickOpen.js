import bus from '../bus'
import { delay } from '@/util'
import FileSearcher from '@/node/fileSearcher'
import getCommandDescriptionById from './descriptions'
import { t } from '../i18n'

const SPECIAL_CHARS = /[\[\]\\^$.\|\?\*\+\(\)\/]{1}/g // eslint-disable-line no-useless-escape

// The quick open command
class QuickOpenCommand {
  constructor(rootState) {
    this.id = 'file.quick-open'
    this.description = getCommandDescriptionById('file.quick-open')
    this.placeholder = t('commandPalette.placeholders.searchFileToOpen')
    this.shortcut = null

    this.subcommands = []
    this.subcommandSelectedIndex = -1

    // Reference to folder and editor and project state.
    this._editorState = rootState.editor
    this._folderState = rootState.project

    this._directorySearcher = new FileSearcher()
    this._cancelFn = null
  }

  search = async (query) => {
    // Show opened files when no query given.
    if (!query) {
      return this.subcommands
    }

    const { _cancelFn } = this
    if (_cancelFn) {
      _cancelFn()
      this._cancelFn = null
    }

    const timeout = delay(300)
    this._cancelFn = () => {
      timeout.cancel()
      this._cancelFn = null
    }

    await timeout
    return this._doSearch(query)
  }

  run = async () => {
    const { _editorState, _folderState } = this
    if (!_folderState.projectTree && _editorState.tabs.length === 0) {
      throw new Error(null)
    }

    this.subcommands = _editorState.tabs
      .map((t) => t.pathname)
      // Filter untitled tabs
      .filter((t) => !!t)
      .map((pathname) => {
        const item = { id: pathname }
        Object.assign(item, this._getPath(pathname))
        return item
      })
  }

  execute = async () => {
    // Timeout to hide the command palette and then show again to prevent issues.
    await delay(100)
    bus.emit('show-command-palette', this)
  }

  executeSubcommand = async (id) => {
    const { windowId } = window.marktext.env
    window.electron.ipcRenderer.send('mt::open-file-by-window-id', windowId, id)
  }

  unload = () => {
    this.subcommands = []
    // C-SEARCH-LIFECYCLE-DISCARD T-003: closing the palette cancels the
    // in-flight work through the existing _cancelFn seam — the pending
    // debounce timer or the active searcher walk — so a closed dialog
    // leaves no running traversal behind.
    if (this._cancelFn) {
      this._cancelFn()
    }
  }

  // --- private ------------------------------------------

  _doSearch = (query) => {
    this._cancelFn = null
    const { _editorState, _folderState } = this
    const isRootDirOpened = !!_folderState.projectTree
    const tabsAvailable = _editorState.tabs.length > 0

    // Only show opened files if no directory is opened.
    if (!isRootDirOpened && !tabsAvailable) {
      return []
    }

    const searchResult = []
    const rootPath = isRootDirOpened ? _folderState.projectTree.pathname : null

    // Add files that are not in the current root directory but opened.
    if (tabsAvailable) {
      const re = new RegExp(
        query.replace(SPECIAL_CHARS, (p) => {
          if (p === '*') return '.*'
          return p === '\\' ? '\\\\' : `\\${p}`
        }),
        'i'
      )

      for (const tab of _editorState.tabs) {
        const { pathname } = tab
        if (
          pathname &&
          re.test(pathname) &&
          (!rootPath || !window.fileUtils.isChildOfDirectory(rootPath, pathname))
        ) {
          searchResult.push(pathname)
        }
      }
    }

    if (!isRootDirOpened) {
      return searchResult.map((pathname) => {
        return {
          id: pathname,
          description: pathname,
          title: pathname
        }
      })
    }

    // Search root directory on disk.
    return new Promise((resolve, reject) => {
      let canceled = false
      // C-SEARCH-LIFECYCLE-DISCARD T-003: close over the RAW searcher
      // promise — the chained .then()/.catch() result is a plain
      // Promise whose .cancel is undefined (the same latent chained-
      // promise cancel drop C-SEARCH-ERROR-VISIBILITY fixed in the
      // store), which left the _cancelFn seam unable to stop the walk.
      const searchPromise = this._directorySearcher
        .search([rootPath], '', {
          didMatch: (result) => {
            if (canceled) return
            // C-SEARCH-RESULT-CONTRACT: normalize here, where the envelope
            // is consumed — a plain string (today's searcher shape) is kept
            // as-is; the window shim's grouped { filePath, matches } row
            // contributes its string pathname so `const item = { id:
            // pathname }` builds a string id again and executeSubcommand
            // can open the file; any other non-string shape is dropped.
            const pathname =
              typeof result === 'string'
                ? result
                : result && typeof result.filePath === 'string'
                  ? result.filePath
                  : null
            if (pathname !== null) {
              searchResult.push(pathname)
            }
          },
          // C-SEARCH-LIFECYCLE-DISCARD T-003: the didSearchPaths option
          // is gone — its ">30 files" limit waited for a searchedPaths
          // event the wire never delivers (dead code). The files-mode
          // cost and limit design stays with C-QUICKOPEN-FILES-MODE.

          // Only search markdown files that contain the query string.
          inclusions: this._getInclusions(query)
        })
      searchPromise
        .then(() => {
          this._cancelFn = null
          resolve(
            searchResult.map((pathname) => {
              const item = { id: pathname }
              Object.assign(item, this._getPath(pathname))
              return item
            })
          )
        })
        .catch((error) => {
          this._cancelFn = null
          reject(error)
        })

      this._cancelFn = () => {
        this._cancelFn = null
        canceled = true
        if (searchPromise.cancel) {
          searchPromise.cancel()
        }
      }
    })
  }

  _getInclusions = (query) => {
    // NOTE: This will fail on `foo.m` because we search for `foo.m.md`.
    if (window.fileUtils.hasMarkdownExtension(query)) {
      return [`*${query}`]
    }

    const inclusions = []
    for (let i = 0; i < window.fileUtils.MARKDOWN_INCLUSIONS.length; ++i) {
      inclusions[i] = `*${query}` + window.fileUtils.MARKDOWN_INCLUSIONS[i]
    }
    return inclusions
  }

  _getPath = (pathname) => {
    const rootPath = this._folderState.projectTree.pathname
    if (!window.fileUtils.isChildOfDirectory(rootPath, pathname)) {
      return { title: pathname, description: pathname }
    }

    const p = window.path.relative(rootPath, pathname)
    const item = { description: p }
    if (p.length > 50) {
      item.title = p
    }
    return item
  }
}

export default QuickOpenCommand
