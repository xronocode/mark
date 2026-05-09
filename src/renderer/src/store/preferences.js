import { defineStore } from 'pinia'
import bus from '../bus'
import { setLanguage } from '../i18n'

export const usePreferencesStore = defineStore('preferences', {
  state: () => ({
    autoSave: false,
    autoSaveDelay: 5000,
    titleBarStyle: 'custom',
    openFilesInNewWindow: false,
    openFolderInNewWindow: false,
    zoom: 1.0,
    hideScrollbar: false,
    wordWrapInToc: false,
    fileSortBy: 'created',
    startUpAction: 'openLastFolder',
    restoreLayoutState: true,
    defaultDirectoryToOpen: '',
    lastOpenedFolder: '',
    treePathExcludePatterns: [],
    language: 'en',

    editorFontFamily: 'Open Sans',
    fontSize: 16,
    lineHeight: 1.6,
    codeFontSize: 14,
    codeFontFamily: 'DejaVu Sans Mono',
    codeBlockLineNumbers: true,
    trimUnnecessaryCodeBlockEmptyLines: true,
    wrapCodeBlocks: true,
    editorLineWidth: '',

    autoPairBracket: true,
    autoPairMarkdownSyntax: true,
    autoPairQuote: true,
    endOfLine: 'default',
    defaultEncoding: 'utf8',
    autoGuessEncoding: true,
    autoNormalizeLineEndings: false,

    trimTrailingNewline: 2,
    textDirection: 'ltr',
    hideQuickInsertHint: false,
    imageInsertAction: 'folder',
    imagePreferRelativeDirectory: false,
    imageRelativeDirectoryName: 'assets',
    hideLinkPopup: false,
    autoCheck: false,

    preferLooseListItem: true,
    bulletListMarker: '-',
    orderListDelimiter: '.',
    preferHeadingStyle: 'atx',
    tabSize: 4,
    listIndentation: 1,
    frontmatterType: '-',
    superSubScript: false,
    footnote: false,
    isHtmlEnabled: true,
    isGitlabCompatibilityEnabled: false,
    sequenceTheme: 'hand',

    theme: 'light',
    followSystemTheme: true,
    lightModeTheme: 'light',
    darkModeTheme: 'dark',
    customCss: '',

    spellcheckerEnabled: false,
    spellcheckerNoUnderline: false,
    spellcheckerLanguage: 'en-US',

    // Default values that are overwritten with the entries below.
    sideBarVisibility: false,
    tabBarVisibility: false,
    sourceCodeModeEnabled: false,

    searchExclusions: [],
    searchMaxFileSize: '',
    searchIncludeHidden: false,
    searchNoIgnore: false,
    searchFollowSymlinks: true,

    watcherUsePolling: false,

    // --------------------------------------------------------------------------

    // Edit modes of the current window (not part of persistent settings)
    typewriter: false, // typewriter mode
    focus: false, // focus mode
    sourceCode: false, // source code mode

    // user configration
    imageFolderPath: '',
    webImages: [],
    cloudImages: [],
    currentUploader: 'none',
    githubToken: '',
    imageBed: {
      github: {
        owner: '',
        repo: '',
        branch: ''
      }
    },
    cliScript: ''
  }),

  getters: {
    getAll: (state) => state
  },

  actions: {
    SET_USER_PREFERENCE(preference) {
      const oldLanguage = this.language

      Object.keys(preference).forEach((key) => {
        if (typeof preference[key] !== 'undefined' && typeof this[key] !== 'undefined') {
          this[key] = preference[key]
        }
      })

      // Update i18n language if language preference changed
      if (preference.language && preference.language !== oldLanguage) {
        setLanguage(preference.language)
      }
    },
    SET_MODE({ type, checked }) {
      this[type] = checked
    },
    TOGGLE_VIEW_MODE(entryName) {
      this[entryName] = !this[entryName]
    },
    /**
     * Path B-clean W1: pull initial prefs via direct invoke, no
     * listener race. The cross-window broadcast listener for
     * mt::user-preference is registered ONCE at boot in bootstrap-ipc.js
     * — it stays warm for the app's lifetime and catches all SET_* from
     * other windows.
     */
    async ASK_FOR_USER_PREFERENCE() {
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        const prefs = await invoke('mt_prefs_get_all')
        if (prefs && typeof prefs === 'object') {
          this.SET_USER_PREFERENCE(prefs)
        }
        console.log('[ipc][prefs_get_all][BLOCK_INVOKE_OK]')
      } catch (e) {
        console.error('[ipc][prefs_get_all][BLOCK_INVOKE_FAILED]', e)
      }
    },

    async SET_SINGLE_PREFERENCE({ type, value }) {
      // Update local state immediately for responsive UI
      this[type] = value

      // Update i18n language if language preference changed
      if (type === 'language') {
        setLanguage(value)
      }

      // Persist + broadcast via backend. Backend persists to prefs.json
      // and emits mt::user-preference to all windows; the boot-time
      // listener in bootstrap-ipc.js folds the broadcast into store
      // state for OTHER windows.
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        await invoke('mt_prefs_set', { key: type, value })
        console.log(`[ipc][prefs_set][BLOCK_INVOKE_OK key=${type}]`)
      } catch (e) {
        console.error(`[ipc][prefs_set][BLOCK_INVOKE_FAILED key=${type}]`, e)
      }
    },

    async SET_USER_DATA({ type, value }) {
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        await invoke('mt_prefs_set', { key: type, value })
      } catch (e) {
        console.error(`[ipc][prefs_set][BLOCK_INVOKE_FAILED user_data key=${type}]`, e)
      }
    },

    SET_IMAGE_FOLDER_PATH(value) {
      // Deferred — F-PREFS-IMAGE-DIALOG. For now, just persist the
      // path verbatim if user typed it manually.
      this.SET_SINGLE_PREFERENCE({ type: 'imageFolderPath', value })
    },

    SELECT_DEFAULT_DIRECTORY_TO_OPEN() {
      // Deferred — F-PREFS-DIR-PICKER. No-op until directory picker
      // wired through tauri-plugin-dialog.
      console.warn('[prefs] SELECT_DEFAULT_DIRECTORY_TO_OPEN: not yet implemented in Tauri port')
    },

    // Toggle a view option and notify main process to toggle menu item.
    LISTEN_TOGGLE_VIEW() {
      bus.on('view:toggle-view-entry', (entryName) => {
        this.TOGGLE_VIEW_MODE(entryName)
        this.DISPATCH_EDITOR_VIEW_STATE({ [entryName]: this[entryName] })
      })
    },

    DISPATCH_EDITOR_VIEW_STATE(viewState) {
      // Path B-clean W6: legacy mt::view-layout-changed → mt_view_layout_changed
      // (m_v1_compat). Backend command still works; full migration to
      // canonical module deferred to W6+.
      const { windowId } = window.marktext.env
      window.electron.ipcRenderer.send('mt::view-layout-changed', windowId, viewState)
    }
  }
})
