// FILE: src/renderer/src/store/preferences.js
// VERSION: 1.2.0
// START_MODULE_CONTRACT
//   PURPOSE: Pinia store for persistent user preferences, their hydration, persistence, the unified fontSize zoom actions (C-49), the UI-language application paths (concrete or 'system'), and the retired-theme id migration (C-41 T-002).
//   SCOPE: default state, SET_USER_PREFERENCE / SET_SINGLE_PREFERENCE, the C-49 zoom actions (APPLY_FONT_SIZE / ZOOM_STEP / ZOOM_ACTUAL_SIZE) and the one-time legacy `zoom` migration, the C-41 T-002 retired-theme migration in ASK_FOR_USER_PREFERENCE, ASK_FOR_USER_PREFERENCE boot hydration, buildCapabilities + default-handler queries, LISTEN_SYSTEM_LANGUAGE re-resolution (C-45).
//   DEPENDS: pinia, @tauri-apps/api/core, bus, services/notification, i18n/index.js, i18n/systemLocale.js, util/autoTheme.js, util/themeMigration.js.
//   LINKS: _shims/preferences/schema.json defaults; pages/app.vue boot + zoom keys/wheel; components/zoomIndicator; .grace/changes/active/C-49.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   usePreferencesStore - Pinia store factory (state defaults, hydration, persistence, C-49 zoom actions, LISTEN_* wiring incl. LISTEN_SYSTEM_LANGUAGE).
//   FONT_SIZE_MIN / FONT_SIZE_MAX / FONT_SIZE_DEFAULT - unified-zoom clamp bounds and base unit (C-49).
//   clampFontSize - round + clamp helper shared by the zoom actions and the legacy-zoom migration (C-49).
//   FONT_SIZE_DEFAULT - default editor text size (16).
//   FONT_SIZE_MAX - largest editor text size (36).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.2.2 - 2026-10-15 C-41 T-002: ASK_FOR_USER_PREFERENCE
//   (the single load point where stored preferences enter the store — both
//   the editor and the Settings window hydrate through it) rewrites the
//   three persisted theme keys via util/themeMigration.js before hydration
//   applies them and persists each changed key exactly once; valid stored
//   ids are never rewritten.
//   v1.2.1 - 2026-10-15 C-41 fix: SET_USER_PREFERENCE re-resolves
//   the Auto member after applying a payload, so the full-snapshot echo of a
//   followSystemTheme write cannot leave the last manual theme (Auto → Light →
//   Dark → Auto stayed dark on a light Mac).
//   v1.2.0 - 2026-10-15 C-49 T-001: one clear zoom — fontSize is
//   the only zoom (⌘+/⌘−/⌘0, pinch, View menu all route through
//   APPLY_FONT_SIZE / ZOOM_STEP / ZOOM_ACTUAL_SIZE with a 12–36 clamp and the
//   150 ms debounced persistence that used to live in pages/app.vue); new
//   persisted `baseFontSize` (the Settings size) is mirrored when fontSize
//   arrives via hydration/Settings broadcasts without its own value and is
//   restored by ⌘0 Actual Size; a stored legacy `zoom` ≠ 1 migrates once into
//   clamp(round(16 × zoom)) for both fontSize and baseFontSize and resets
//   zoom to 1 (MIGRATE_LEGACY_ZOOM); each applied step emits
//   mt::zoom-level-changed for the transient indicator.
//   v1.1.0 - C-45 T-001: default language 'system' for new profiles (stored values untouched); LISTEN_SYSTEM_LANGUAGE re-resolves on window languagechange/focus and applies only when the effective locale changed.
// END_CHANGE_SUMMARY

import { defineStore } from 'pinia'
import { invoke } from '@tauri-apps/api/core'
import bus from '../bus'
import notice from '../services/notification'
import { setLanguage, getCurrentLanguage } from '../i18n'
import { SYSTEM_LANGUAGE, resolveSystemLocale } from '../i18n/systemLocale'
import { resolveAutoTheme } from '../util/autoTheme'
import { migrateThemePreferences } from '../util/themeMigration'

// C-49: the unified zoom clamps the editor font size to 12–36 px. 16 px is
// the base unit — --mark-zoom (fontSize / 16) scales mermaid diagrams with
// it, and the legacy percentage-zoom migration derives fontSize from it.
export const FONT_SIZE_MIN = 12
export const FONT_SIZE_MAX = 36
export const FONT_SIZE_DEFAULT = 16

export const clampFontSize = (value) =>
  Math.max(FONT_SIZE_MIN, Math.min(FONT_SIZE_MAX, Math.round(value)))

// Debounced fontSize persistence (moved from pages/app.vue, C-49): rapid
// ⌘+/⌘−/pinch steps collapse into one mt_prefs_set write. Module-scoped so
// Pinia never proxies the timer id.
const FONT_PERSIST_DEBOUNCE_MS = 150
let fontSizePersistTimer = null

// Boot-stomp guard (see ASK_FOR_USER_PREFERENCE): preference keys the
// user has changed since store creation. Module-scoped so Pinia never
// proxies it; cleared after the one boot hydration.
const bootDirtyKeys = new Set()

// C-45: window languagechange/focus listeners bind once per renderer
// (module scope — not Pinia state — so repeated LISTEN_SYSTEM_LANGUAGE
// calls from remounts never stack duplicate listeners).
let systemLanguageListenersBound = false

export const usePreferencesStore = defineStore('preferences', {
  state: () => ({
    // C-15 T-115: capability flags from mt_build_mode. Desktop defaults
    // so shims/old backends render the full UI; app-store builds flip
    // them off at boot (FETCH_BUILD_MODE). `share` is macOS-only
    // (m032 NSSharingServicePicker) — flipped off on Windows/Linux.
    // C-48: `review` (m053 SKStoreReviewController) exists only in the
    // App Store build on macOS — desktop default is false and the
    // review flow treats "not explicitly true" as absent.
    buildCapabilities: {
      mode: 'desktop',
      exportPandoc: true,
      screenshot: true,
      setDefaultHandler: true,
      projectSearchRipgrep: true,
      updater: true,
      share: true,
      review: false
    },
    autoSave: false,
    autoSaveDelay: 5000,
    liveReload: true,
    // C-17: markdownlint-subset validation (problems panel recomputation gate).
    markdownLint: true,
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
    // C-45 T-001: brand default for NEW profiles — 'system' follows the
    // OS preferred languages (i18n/systemLocale.js resolver). Stored
    // values are never migrated: a profile that pinned 'en' or 'ru'
    // keeps its choice; only a profile with no stored language gets
    // 'system'.
    language: SYSTEM_LANGUAGE,

    editorFontFamily: 'Open Sans',
    fontSize: 16,
    // C-49: the Settings font size — ⌘0 "Actual Size" returns here. Zoom
    // steps (ZOOM_STEP) only write fontSize, so the user's Settings choice
    // is never lost. Mirrored by SET_USER_PREFERENCE when a fontSize
    // arrives from Settings/hydration without its own baseFontSize.
    baseFontSize: 16,
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
    imagePreferRelativeDirectory: true,
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
    frontmatterProperties: true,
    superSubScript: false,
    footnote: true,
    mathEnabled: true,
    isHtmlEnabled: true,
    isGitlabCompatibilityEnabled: false,
    sequenceTheme: 'hand',

    // C-41 T-001: brand defaults for NEW profiles — Auto follows
    // prefers-color-scheme (paper for light, ink for dark) via
    // util/autoTheme.js + the app.vue matchMedia listener. Stored
    // preferences always win: SET_USER_PREFERENCE only overwrites keys
    // present in the hydrated payload, so an existing user's theme /
    // followSystemTheme=false never changes on upgrade. (The alpha.6.2
    // flip of followSystemTheme to false was for the unimplemented
    // follow-system flow; C-41 T-001 ships that flow, so Auto returns
    // as the out-of-the-box default.)
    theme: 'paper',
    followSystemTheme: true,
    lightModeTheme: 'paper',
    darkModeTheme: 'ink',
    customCss: '',

    spellcheckerEnabled: false,
    spellcheckerNoUnderline: false,
    spellcheckerLanguage: 'en-US',

    // Default values that are overwritten with the entries below.
    sideBarVisibility: false,
    tabBarVisibility: false,
    sourceCodeModeEnabled: false,
    diffMode: false,
    // C-29 Split View: left pane share (0.1–0.9) and whether rich is on the left.
    splitViewRatio: 0.5,
    splitViewSwapped: false,

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
    // Shape matches Rust DefaultHandlerInfo (camelCase via serde).
    defaultMdHandler: { isDefault: false, currentHandler: null }
  }),

  getters: {
    getAll: (state) => state
  },

  actions: {
    // C-15 T-M5: query the backend once at boot; failures keep the
    // fail-open desktop defaults (dev shims, older binaries).
    async FETCH_BUILD_MODE() {
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        this.buildCapabilities = await invoke('mt_build_mode')
      } catch {
        // keep defaults
      }
    },
    SET_USER_PREFERENCE(preference) {
      const oldLanguage = this.language

      const prefKeys = preference && typeof preference === 'object' ? Object.keys(preference) : []
      prefKeys.forEach((key) => {
        if (typeof preference[key] !== 'undefined' && typeof this[key] !== 'undefined') {
          this[key] = preference[key]
        }
      })

      // START_BLOCK_AUTO_THEME_ON_BROADCAST
      // Every mt_prefs_set broadcasts the FULL snapshot, whose persisted
      // `theme` is the last manual pick. In Auto that stale value must not
      // win: Auto → Light → Dark → Auto stayed on the dark member because
      // the echo of the followSystemTheme write put `theme` back to ink
      // after app.vue had resolved paper (the follow flag did not change
      // again, so its watcher never re-ran).
      if (this.followSystemTheme) {
        const resolved = resolveAutoTheme(this)
        if (resolved && this.theme !== resolved) {
          this.theme = resolved
        }
      }
      // END_BLOCK_AUTO_THEME_ON_BROADCAST

      // START_BLOCK_BASE_FONT_SIZE_MIRROR
      // C-49: a fontSize arriving from boot hydration or a Settings-window
      // broadcast (payloads that carry no baseFontSize of their own) re-bases
      // "Actual Size" — ⌘+/⌘− steps must never overwrite the user's Settings
      // size. Payloads from post-C-49 profiles carry baseFontSize and apply
      // it verbatim above. Fire-and-forget persist: once written, every
      // later hydration carries the key and the mirror stops firing.
      const incomingFontSize = Number(preference && preference.fontSize)
      if (
        preference &&
        preference.baseFontSize === undefined &&
        Number.isFinite(incomingFontSize) &&
        this.baseFontSize !== clampFontSize(incomingFontSize)
      ) {
        this.baseFontSize = clampFontSize(incomingFontSize)
        invoke('mt_prefs_set', { key: 'baseFontSize', value: this.baseFontSize }).catch(() => {})
        console.log(
          `[prefs][zoom][BLOCK_BASE_FONT_SIZE_MIRRORED baseFontSize=${this.baseFontSize}]`
        )
      }
      // END_BLOCK_BASE_FONT_SIZE_MIRROR

      // START_BLOCK_IMAGE_UPLOAD_RETIRED
      // 2026-10-15 (user decision): image upload (PicGo / CLI script / GitHub)
      // is removed from every edition for now. A stored 'upload' falls back
      // to the default: copy the image next to the document.
      if (this.imageInsertAction === 'upload') {
        this.imageInsertAction = 'folder'
      }
      // END_BLOCK_IMAGE_UPLOAD_RETIRED
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
     *
     * Boot-stomp guard (Nurik's Windows pass): a preference the user
     * already changed since mount (e.g. the theme toggle clicked while
     * the first prefs read was still in flight — slow on a cold Windows
     * profile) is NEVER overwritten by the hydration payload, and the
     * SET_SINGLE_PREFERENCE call has already persisted the new value.
     */
    async ASK_FOR_USER_PREFERENCE() {
      try {
        const prefs = await invoke('mt_prefs_get_all')
        if (prefs && typeof prefs === 'object') {
          const hydrated = { ...prefs }
          for (const key of bootDirtyKeys) {
            delete hydrated[key]
          }
          // START_BLOCK_MIGRATE_RETIRED_THEMES
          // C-41 T-002: this action is the single load point where stored
          // preferences enter the store (both windows hydrate through it),
          // so retired theme ids are rewritten in the payload BEFORE
          // hydration applies them — SET_USER_PREFERENCE and the Auto
          // re-resolution only ever see valid ids. Each changed key is
          // persisted exactly once; the next hydration (this or any other
          // window) finds valid values and writes nothing. Keys protected
          // by the boot-stomp guard above were already deleted from the
          // payload, so a raced user pick is never overwritten.
          const themeChanges = migrateThemePreferences(hydrated)
          // END_BLOCK_MIGRATE_RETIRED_THEMES
          this.SET_USER_PREFERENCE(hydrated)
          if (themeChanges.length > 0) {
            try {
              await Promise.all(
                themeChanges.map(({ key, to }) => invoke('mt_prefs_set', { key, value: to }))
              )
              console.log(
                `[prefs][theme-migration][BLOCK_RETIRED_THEMES_MIGRATED ${themeChanges
                  .map((c) => `${c.key}:${c.from}->${c.to}`)
                  .join(' ')}]`
              )
            } catch (e) {
              // In-memory state is already migrated; persistence retries next boot.
              console.error('[prefs][theme-migration][BLOCK_RETIRED_THEMES_MIGRATE_FAILED]', e)
            }
          }
        }
        // Protection covers the boot hydration only — afterwards,
        // cross-window broadcasts (SET_USER_PREFERENCE) must keep
        // applying every key unconditionally.
        bootDirtyKeys.clear()
        console.log('[ipc][prefs_get_all][BLOCK_INVOKE_OK]')
      } catch (e) {
        console.error('[ipc][prefs_get_all][BLOCK_INVOKE_FAILED]', e)
      }
    },

    async SET_SINGLE_PREFERENCE({ type, value }) {
      if (typeof this[type] === 'undefined') {
        if (import.meta.env.DEV) {
          console.warn(`[prefs] SET_SINGLE_PREFERENCE: unknown key "${type}"`)
        }
        return
      }
      this[type] = value
      bootDirtyKeys.add(type)

      if (type === 'language') {
        setLanguage(value)
      }

      try {
        await invoke('mt_prefs_set', { key: type, value })
        console.log(`[ipc][prefs_set][BLOCK_INVOKE_OK key=${type}]`)
      } catch (e) {
        console.error(`[ipc][prefs_set][BLOCK_INVOKE_FAILED key=${type}]`, e)
      }
    },

    async SET_USER_DATA({ type, value }) {
      try {
        await invoke('mt_prefs_set', { key: type, value })
      } catch (e) {
        console.error(`[ipc][prefs_set][BLOCK_INVOKE_FAILED user_data key=${type}]`, e)
      }
    },

    // ─── C-49 unified zoom ────────────────────────────────────────────
    // One zoom for everything: ⌘+/⌘−/⌘0 keys, Ctrl+wheel/pinch (app.vue),
    // and the View-menu commands (view.zoom-in/out/actual-size) all land
    // here. The live fontSize state write applies instantly (editor.vue
    // watch → muya setFont); persistence is debounced. Each applied change
    // emits mt::zoom-level-changed for the transient zoom indicator.

    // START_BLOCK_APPLY_FONT_SIZE
    APPLY_FONT_SIZE(value) {
      const next = clampFontSize(value)
      if (next === this.fontSize) return
      this.fontSize = next
      bus.emit('mt::zoom-level-changed', {
        fontSize: next,
        baseFontSize: clampFontSize(this.baseFontSize)
      })
      if (fontSizePersistTimer) {
        clearTimeout(fontSizePersistTimer)
      }
      fontSizePersistTimer = setTimeout(() => {
        fontSizePersistTimer = null
        this.SET_SINGLE_PREFERENCE({ type: 'fontSize', value: next })
      }, FONT_PERSIST_DEBOUNCE_MS)
    },
    // END_BLOCK_APPLY_FONT_SIZE

    ZOOM_STEP(delta) {
      this.APPLY_FONT_SIZE(this.fontSize + delta)
    },

    // ⌘0 "Actual Size": back to the user's Settings size, never a hard 16.
    ZOOM_ACTUAL_SIZE() {
      this.APPLY_FONT_SIZE(this.baseFontSize)
    },

    // START_BLOCK_MIGRATE_LEGACY_ZOOM
    // One-time retirement of the palette percentage zoom (C-49 R-4): a
    // stored `zoom` ≠ 1 becomes an equivalent fontSize
    // (clamp(round(16 × zoom)), baseFontSize likewise) and zoom resets to
    // 1 so the mt::window-zoom path stays harmless. Called once from
    // pages/app.vue after boot hydration; returns whether a migration ran.
    async MIGRATE_LEGACY_ZOOM() {
      const legacyZoom = Number(this.zoom)
      if (!Number.isFinite(legacyZoom) || legacyZoom === 1) {
        return false
      }
      const migrated = clampFontSize(FONT_SIZE_DEFAULT * legacyZoom)
      this.fontSize = migrated
      this.baseFontSize = migrated
      this.zoom = 1
      try {
        await Promise.all([
          invoke('mt_prefs_set', { key: 'fontSize', value: migrated }),
          invoke('mt_prefs_set', { key: 'baseFontSize', value: migrated }),
          invoke('mt_prefs_set', { key: 'zoom', value: 1 })
        ])
        console.log(
          `[prefs][zoom-migration][BLOCK_LEGACY_ZOOM_MIGRATED zoom=${legacyZoom} fontSize=${migrated}]`
        )
      } catch (e) {
        // In-memory state is already migrated; persistence retries next boot.
        console.error('[prefs][zoom-migration][BLOCK_LEGACY_ZOOM_MIGRATE_FAILED]', e)
      }
      return true
    },
    // END_BLOCK_MIGRATE_LEGACY_ZOOM

    async SET_IMAGE_FOLDER_PATH(value) {
      if (value === undefined) {
        const { open } = await import('@tauri-apps/plugin-dialog')
        const selected = await open({ directory: true, multiple: false })
        if (selected) {
          this.SET_SINGLE_PREFERENCE({ type: 'imageFolderPath', value: selected })
        }
        return
      }
      this.SET_SINGLE_PREFERENCE({ type: 'imageFolderPath', value })
    },

    async SELECT_DEFAULT_DIRECTORY_TO_OPEN() {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const selected = await open({ directory: true, multiple: false })
      if (selected) {
        this.SET_SINGLE_PREFERENCE({ type: 'defaultDirectoryToOpen', value: selected })
      }
    },

    // Toggle a view option and notify main process to toggle menu item.
    LISTEN_TOGGLE_VIEW() {
      bus.on('view:toggle-view-entry', (entryName) => {
        this.TOGGLE_VIEW_MODE(entryName)
        this.DISPATCH_EDITOR_VIEW_STATE({ [entryName]: this[entryName] })
      })
    },

    // C-45 T-001: while the language preference is 'system', re-resolve
    // the effective UI locale when the webview reports 'languagechange'
    // or the window regains focus, so a system language change applies
    // without a restart. Applies only when the effective locale actually
    // changed, and never persists — the stored preference stays
    // 'system'. The immediate reResolve at bind time also covers a fresh
    // profile whose prefs.json has no language key at all (boot
    // hydration delivers nothing, so setLanguage never ran and the
    // store default 'system' rules).
    LISTEN_SYSTEM_LANGUAGE() {
      // START_BLOCK_SYSTEM_LANGUAGE_BIND
      if (systemLanguageListenersBound) return
      systemLanguageListenersBound = true
      const reResolve = () => {
        if (this.language !== SYSTEM_LANGUAGE) return
        const target = resolveSystemLocale()
        if (target !== getCurrentLanguage()) {
          setLanguage(target)
        }
      }
      window.addEventListener('languagechange', reResolve)
      window.addEventListener('focus', reResolve)
      reResolve()
      // END_BLOCK_SYSTEM_LANGUAGE_BIND
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
    //   mt_get_default_md_handler   → { isDefault, currentHandler }  (camelCase via serde)
    //   mt_set_default_md_handler   → register Mark for .md
    //   mt_unset_default_md_handler → unregister
    // F-1 status is queried (not persisted in prefs.json); state is
    // refreshed on Settings panel mount and after each set/unset.
    async REFRESH_DEFAULT_MD_HANDLER() {
      try {
        const result = await invoke('mt_get_default_md_handler')
        if (result && typeof result === 'object') {
          this.defaultMdHandler = {
            isDefault: !!result.isDefault,
            currentHandler: result.currentHandler ?? null
          }
          console.debug(
            `[prefs][handler][BLOCK_QUERY_OK isDefault=${this.defaultMdHandler.isDefault}]`
          )
        } else {
          console.warn('[prefs][handler][BLOCK_QUERY_UNEXPECTED_RESULT]', result)
        }
      } catch (e) {
        console.error('[prefs][handler][BLOCK_QUERY_FAILED]', e)
      }
    },

    async _mutateDefaultHandler(cmd, okMsg, failMsg) {
      try {
        await invoke(cmd)
        console.debug(`[prefs][handler][BLOCK_${cmd.replace('mt_', '').toUpperCase()}_OK]`)
        await this.REFRESH_DEFAULT_MD_HANDLER()
        try { notice.notify({ title: 'macOS Integration', type: 'primary', message: okMsg }) } catch (_) {}
      } catch (e) {
        console.error(`[prefs][handler][BLOCK_${cmd.replace('mt_', '').toUpperCase()}_FAILED]`, e)
        try { notice.notify({ title: 'macOS Integration', type: 'error', message: failMsg }) } catch (_) {}
      }
    },

    async SET_DEFAULT_MD_HANDLER() {
      return this._mutateDefaultHandler(
        'mt_set_default_md_handler',
        'Mark is now the default app for .md files',
        'Failed to set Mark as the default app for .md files'
      )
    },

    async UNSET_DEFAULT_MD_HANDLER() {
      return this._mutateDefaultHandler(
        'mt_unset_default_md_handler',
        'Mark is no longer the default app for .md files',
        'Failed to remove Mark as the default app for .md files'
      )
    }
  }
})
