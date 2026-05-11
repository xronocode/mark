import { defineStore } from 'pinia'
import bus from '../bus'
import notice from '../services/notification'
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
    // Default flipped to false in alpha.6.2: the v1 Electron port wired
    // followSystemTheme through main-process nativeTheme, but the Tauri
    // port has not implemented that flow yet (no matchMedia listener +
    // no apply-on-toggle hook). With the legacy default of `true`, the
    // theme picker cards rendered as disabled (opacity 0.4) and the
    // click handler was guarded by `!followSystemTheme && …` — so
    // clicking a card was a silent no-op, matching the user smoke
    // 2026-05-11 alpha.6.1 report "Карточки видны, но клик не применяет
    // тему". Flipping the default unblocks the manual theme switcher;
    // the follow-system path is tracked separately as
    // F-THEME-FOLLOW-SYSTEM (Tauri port).
    followSystemTheme: false,
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

    // M-022 mt-preview-mode: when true (default) Finder/CLI opened files
    // enter preview mode (read-only + sidebar collapsed) on first load;
    // user can disable via Settings later. Honoured by bootstrap-ipc.js
    // (gate before APPLY_PREVIEW_MODE) and by APPLY_PREVIEW_MODE itself
    // (so direct programmatic callers also respect it).
    previewModeOnFinderOpen: true,

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
    cliScript: '',

    // M-021 default-handler — F-1 status (queried, not persisted).
    // Populated by REFRESH_DEFAULT_MD_HANDLER from the backend.
    defaultMdHandler: { is_default: false, current_handler: null }
  }),

  getters: {
    getAll: (state) => state
  },

  actions: {
    SET_USER_PREFERENCE(preference) {
      const oldLanguage = this.language

      const _keys = preference && typeof preference === 'object' ? Object.keys(preference) : []
      let _applied = 0
      _keys.forEach((key) => {
        if (typeof preference[key] !== 'undefined' && typeof this[key] !== 'undefined') {
          this[key] = preference[key]
          _applied += 1
        }
      })
      // F-THEME-DIAG (smoke 2026-05-11): expose which keys actually
      // landed in the store vs. were dropped (unknown key OR undefined
      // value). theme=Y/N flags whether the broadcast/init carried a
      // theme update — used to localize the break point in the picker
      // → broadcast → editor chain.
      const _themeFlag =
        typeof preference?.theme !== 'undefined' && typeof this.theme !== 'undefined' ? 'Y' : 'N'
      console.log(
        `[prefs][SET_USER][BLOCK_KEYS_APPLIED count=${_applied} total=${_keys.length} theme=${_themeFlag} themeValue=${preference?.theme ?? 'undef'}]`
      )

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
     * Pull initial prefs via direct invoke. The cross-window broadcast
     * listener for mt::user-preference is registered ONCE at boot in
     * bootstrap-ipc.js — it stays warm for the app's lifetime and
     * catches all SET_* from other windows, avoiding a listener race.
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
      // F-THEME-DIAG (smoke 2026-05-11): record the call site BEFORE
      // the local state mutation. If a user click on a theme card lands
      // here but no BLOCK_LOCAL_SET marker appears, the click handler
      // itself was guarded out (e.g. followSystemTheme flag).
      console.log(
        `[prefs][SET_SINGLE][BLOCK_LOCAL_SET key=${type} value=${typeof value === 'string' ? value : JSON.stringify(value)}]`
      )
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
      // mt::view-layout-changed routes through the v1-compat command
      // mt_view_layout_changed (m_v1_compat.rs) for view-state
      // persistence. Migration to a canonical module is deferred —
      // backend remains alive and functional.
      const { windowId } = window.marktext.env
      window.electron.ipcRenderer.send('mt::view-layout-changed', windowId, viewState)
    },

    // ─── M-021 default-handler (macOS Integration) ────────────────────
    // Three actions wrap the m021_default_handler Tauri commands:
    //   mt_get_default_md_handler   → { is_default, current_handler }
    //   mt_set_default_md_handler   → register Mark for .md
    //   mt_unset_default_md_handler → unregister
    // F-1 status is queried (not persisted in prefs.json); state is
    // refreshed on Settings panel mount and after each set/unset.
    async REFRESH_DEFAULT_MD_HANDLER() {
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        const result = await invoke('mt_get_default_md_handler')
        if (result && typeof result === 'object') {
          this.defaultMdHandler = {
            is_default: !!result.is_default,
            current_handler: result.current_handler ?? null
          }
        }
        console.debug(
          `[prefs][handler][BLOCK_QUERY_OK is_default=${this.defaultMdHandler.is_default}]`
        )
      } catch (e) {
        console.error('[prefs][handler][BLOCK_QUERY_FAILED]', e)
      }
    },

    async SET_DEFAULT_MD_HANDLER() {
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        await invoke('mt_set_default_md_handler')
        console.debug('[prefs][handler][BLOCK_SET_OK]')
        await this.REFRESH_DEFAULT_MD_HANDLER()
        notice.notify({
          title: 'macOS Integration',
          type: 'primary',
          message: 'Mark is now the default app for .md files'
        })
      } catch (e) {
        console.error('[prefs][handler][BLOCK_SET_FAILED]', e)
        notice.notify({
          title: 'macOS Integration',
          type: 'error',
          message: 'Failed to set Mark as the default app for .md files'
        })
      }
    },

    async UNSET_DEFAULT_MD_HANDLER() {
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        await invoke('mt_unset_default_md_handler')
        console.debug('[prefs][handler][BLOCK_UNSET_OK]')
        await this.REFRESH_DEFAULT_MD_HANDLER()
        notice.notify({
          title: 'macOS Integration',
          type: 'primary',
          message: 'Mark is no longer the default app for .md files'
        })
      } catch (e) {
        console.error('[prefs][handler][BLOCK_UNSET_FAILED]', e)
        notice.notify({
          title: 'macOS Integration',
          type: 'error',
          message: 'Failed to remove Mark as the default app for .md files'
        })
      }
    }
  }
})
