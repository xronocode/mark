<template>
  <div>
    <div class="title-bar-editor-bg" :class="{ 'tabs-visible': showTabBar }"></div>
    <div
      class="title-bar"
      data-tauri-drag-region
      :class="[
        { active: active },
        { 'tabs-visible': showTabBar },
        { frameless: effectiveTitleBarStyle === 'custom' },
        { isOsx: isOsx }
      ]"
      @dblclick.stop="handleTitleBarDblclick"
    >
      <!-- C-40 T-002 trim (canvas option A): left = sidebar toggle
           (+ the Win/Linux custom-titlebar menu and Settings gear).
           The Files and TOC buttons, the breadcrumb path and the word
           count are gone from the title bar. -->
      <div
        class="titlebar-nav title-no-drag"
        :class="{ 'titlebar-nav--osx': isOsx }"
      >
        <div
          v-if="showCustomTitleBar"
          class="titlebar-nav-btn titlebar-nav-menu"
          @click.stop="handleMenuClick"
        >
          <chrome-icon name="menu"></chrome-icon>
        </div>
        <div
          class="titlebar-nav-btn"
          :class="{ active: showSideBar }"
          :title="t('menu.view.toggleSidebar')"
          @click.stop="handleSidebarToggleClick"
        >
          <chrome-icon name="sidebar"></chrome-icon>
        </div>
        <div
          v-if="!isOsx"
          class="titlebar-nav-btn"
          :title="t('sideBar.icons.settings')"
          @click.stop="handleSettingsClick"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
        </div>
      </div>

      <div
        class="title"
        data-tauri-drag-region
        @contextmenu.stop.prevent="handleTitleContextMenu"
      >
        <span v-if="!filename">Mark</span>
        <button
          v-else
          type="button"
          class="titlebar-title-btn title-no-drag"
          :class="{ open: popoverOpen }"
          :aria-expanded="popoverOpen ? 'true' : 'false'"
          :aria-label="t('titleBar.documentInfo')"
          :title="t('titleBar.documentInfo')"
          @click.stop="togglePopover"
        >
          <span class="titlebar-title-name">{{ filename }}</span>
          <span class="save-dot" :class="{ show: !isSaved }" aria-hidden="true"></span>
          <chrome-icon name="chevron-down" :size="9" class="titlebar-title-chevron"></chrome-icon>
        </button>
      </div>

      <!-- C-40 T-002 right side: «?» (Win/Linux), theme, Share. -->
      <div class="titlebar-right title-no-drag">
        <div
          v-if="!isOsx"
          class="titlebar-nav-btn titlebar-guide-btn"
          role="button"
          tabindex="0"
          :aria-label="t('titleBar.guide')"
          :title="t('titleBar.guide')"
          @click.stop="handleGuideClick"
          @keydown.enter.prevent="handleGuideClick"
        >
          <chrome-icon name="guide"></chrome-icon>
        </div>
        <div
          class="titlebar-nav-btn"
          role="button"
          tabindex="0"
          :aria-label="themeTooltip"
          :title="themeTooltip"
          @click.stop="handleThemeToggle"
          @keydown.enter.prevent="handleThemeToggle"
        >
          <!-- C-41 T-001: three-state cycle Auto → Light → Dark; the
               icons come from the shared redrawn chrome set (C-40 T-002). -->
          <chrome-icon :name="themeMode"></chrome-icon>
        </div>
        <div
          v-if="pathname && shareCapable"
          class="titlebar-nav-btn titlebar-share-btn"
          :title="t('titleBar.share')"
          @click.stop="handleShareClick"
        >
          <chrome-icon name="share"></chrome-icon>
        </div>
      </div>

      <span v-if="isDev" class="version-badge" data-tauri-drag-region>v{{ appVersion }} DEV</span>

      <div
        v-if="effectiveTitleBarStyle === 'custom' && !isFullScreen && !isOsx"
        class="right-toolbar"
        :class="[{ 'title-no-drag': effectiveTitleBarStyle === 'custom' }]"
      >
        <div
          class="frameless-titlebar-button frameless-titlebar-close"
          @click.stop="handleCloseClick"
        >
          <div>
            <svg width="10" height="10">
              <path :d="windowIconClose" />
            </svg>
          </div>
        </div>
        <div
          class="frameless-titlebar-button frameless-titlebar-toggle"
          @click.stop="handleMaximizeClick"
        >
          <div>
            <svg width="10" height="10">
              <path v-show="!isMaximized" :d="windowIconMaximize" />
              <path v-show="isMaximized" :d="windowIconRestore" />
            </svg>
          </div>
        </div>
        <div
          class="frameless-titlebar-button frameless-titlebar-minimize"
          @click.stop="handleMinimizeClick"
        >
          <div>
            <svg width="10" height="10">
              <path :d="windowIconMinimize" />
            </svg>
          </div>
        </div>
      </div>

      <!-- C-40 T-002: document info popover from the title. Untitled
           documents show stats and Rename only (no meta, no file
           actions). -->
      <div
        v-if="popoverOpen"
        class="doc-info-popover title-no-drag"
        role="dialog"
        :aria-label="t('titleBar.documentInfo')"
      >
        <div class="doc-info-name">{{ filename }}</div>
        <div v-if="docInfoMeta" class="doc-info-meta">{{ docInfoMeta }}</div>
        <div class="doc-info-stats">
          <div class="doc-info-stat">
            <b>{{ statWords }}</b><span>{{ t('titleBar.popover.words') }}</span>
          </div>
          <div class="doc-info-stat">
            <b>{{ statCharacters }}</b><span>{{ t('titleBar.popover.characters') }}</span>
          </div>
          <div class="doc-info-stat">
            <b>{{ statLines }}</b><span>{{ t('titleBar.popover.lines') }}</span>
          </div>
          <div class="doc-info-stat">
            <b>{{ readingLabel }}</b><span>{{ t('titleBar.popover.reading') }}</span>
          </div>
        </div>
        <div class="doc-info-actions">
          <button
            type="button"
            class="doc-info-action"
            @click.stop="handleRenameClick"
          >
            {{ t('titleBar.popover.rename') }}
          </button>
          <template v-if="pathname">
            <button
              type="button"
              class="doc-info-action"
              @click.stop="handleRevealClick"
            >
              {{ showInFolderLabel }}
            </button>
            <button
              type="button"
              class="doc-info-action"
              @click.stop="handleCopyPathClick"
            >
              {{ t('recent.copyPath') }}
            </button>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
// FILE: src/renderer/src/components/titleBar/index.vue
// VERSION: 2.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Render the trimmed main-window title bar (sidebar toggle left, document title centre, theme/Share/guide right) with the document info popover and native file-path actions, window controls, and drag affordances.
//   SCOPE: Renderer-side titlebar behavior: sidebar toggle, the C-40 T-002 document info popover (stats + folder/size/modified + Rename/Reveal/Copy path), the Win/Linux «?» Mark Guide entry, native title context menu, direct window controls, and WKWebView/macOS drag fallbacks.
//   DEPENDS: preferences/layout/project/editor stores, bus, i18n, window.electron/fileUtils IPC facade, @tauri-apps/api/window, @tauri-apps/api/path, @tauri-apps/plugin-clipboard-manager, util/relativeTime, components/icons/chromeIcons.
//   LINKS: .grace/graph/runtime.xml M-011 (renderer), M-057 (chromeIcons); .grace/verification/runtime.xml V-M-011 scenarios 14, 37, 38, 53.
//   ROLE: RUNTIME
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   handleTitleContextMenu - Opens the native file-title menu and dispatches Copy Path.
//   handleWindowDragMouseDown - Starts the macOS transparent-titlebar drag fallback.
//   RESIZE_EDGE_PX - Width of the window-edge band left to the native resize (px).
//   isOnResizeEdge - True when a press is within RESIZE_EDGE_PX of the top/left/right edge.
//   handleCloseClick - Requests native window close.
//   handleMaximizeClick - Toggles native maximize/fullscreen state.
//   handleMinimizeClick - Requests native window minimize.
//   handleMenuClick - Opens the native application menu at the pointer.
//   themeMode - Title-bar theme button state: auto | light | dark (C-41 T-001).
//   themeTooltip - Localized tooltip/aria-label for the theme button (C-41 T-001).
//   handleThemeToggle - Cycles Auto → Light → Dark → Auto and persists followSystemTheme/theme (C-41 T-001).
//   togglePopover - Opens/closes the document info popover (C-40 T-002).
//   refreshDocInfo - Reloads size/mtime via window.fileUtils.stat and the home-dir prefix for the ~-abbreviated folder (C-40 T-002).
//   statWords/statCharacters/statLines/readingLabel - Popover statistics; reading time = words/230 rounded up, min 1 (C-40 T-002).
//   docInfoMeta - "folder · size · edited <relative>" meta line; untitled documents render none (C-40 T-002).
//   handleRenameClick - Popover Rename… → editorStore.RESPONSE_FOR_RENAME (the old click-to-rename path).
//   handleRevealClick - Popover reveal → window.electron.shell.showItemInFolder.
//   handleCopyPathClick - Popover Copy path → native clipboard plugin write (WKWebView-safe).
//   handleGuideClick - Win/Linux «?» → bus mt::open-guide (C-40 T-002 / C-40 R-1).
//   onDocMouseDown/onDocKeydown - Outside-click and Escape closers for the popover.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-10-15 v2.0.0: C-40 T-002 title-bar trim (approved canvas,
//     option A): the Files and TOC buttons, the breadcrumb path and the
//     word count leave the title bar; left = sidebar toggle (plus the
//     Win/Linux custom-titlebar menu and Settings gear), centre = the
//     file name with the unsaved dot and a chevron, right = «?»
//     (Win/Linux, opens the Mark Guide), theme and Share. Clicking the
//     file name opens the document info popover (words / characters /
//     lines / reading time from the same wordCount source as the old
//     counter, ~-abbreviated folder, size, edited-relative mtime,
//     Rename… / Show in Finder|Explorer|folder / Copy path; untitled
//     tabs show stats + Rename only; Esc and outside click close it).
//     Icons come from the shared redrawn chrome set (chromeIcons.js).
//   - 2026-10-15 resize-edge: the macOS drag fallback ignores presses
//     within 6 px of the top/left/right window edges, so the top edge and
//     top corners resize the window again instead of moving it.
//   - 2026-05-21 drag-theme-refactor: restore `-webkit-app-region: drag`
//     on the title bar and add a macOS mousedown -> startDragging()
//     fallback for transparent WKWebView windows.
//   - 2026-08-07 v1.1.0: add the native title-path Copy Path menu for UC-029.
//   - 2026-08-07 v1.2.0: write Copy Path through the native Tauri clipboard plugin because WKWebView user activation expires while the native menu is open.
//   - 2026-09-16 v1.3.0: C-9 — constrain the breadcrumb inside real title clearances and clip the oldest path segments (flex-end shrink); removed with the breadcrumb itself in v2.0.0.
//   - 2026-09-28 v1.4.0: C-15 T-W1 — effectiveTitleBarStyle forces 'custom' on win32; titlebar dblclick toggles maximize on every platform.
//   - 2026-09-28 v1.5.0: C-15 Phase W QA — the share/word-count cluster sits left of the window controls (.titlebar-aux, renamed .titlebar-right in v2.0.0).
//   - 2026-09-29 v1.6.0: C-15 Phase W QA round 2 — the Share button hides behind the m048 `share` capability.
//   - 2026-10-15 v1.7.0: C-38 N1 — the Settings gear is macOS-hidden.
//   - 2026-10-15 v1.8.0: C-41 T-001 — three-state Auto → Light → Dark theme button.
// END_CHANGE_SUMMARY

// step-8g: @electron/remote.Menu also gone. Application-menu popup
// now routes through mt::window-popup-app-menu IPC (windowManager).
// Click handlers for the application menu are already main-side, so
// the IPC is fire-and-forget.
import { getCurrentWindow } from '@tauri-apps/api/window'
import { usePreferencesStore } from '@/store/preferences.js'
import { useLayoutStore } from '@/store/layout.js'
import { useProjectStore } from '@/store/project'
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { storeToRefs } from 'pinia'
import bus from '@/bus'
import { minimizePath, restorePath, maximizePath, closePath } from '../../assets/window-controls.js'
import { PATH_SEPARATOR, isDarkTheme } from '../../config'
import { isOsx as isOsxPlatform, isWindows } from '@/util'
import { useEditorStore } from '@/store/editor'
import { useI18n } from 'vue-i18n'
import { writeText as writeClipboardText } from '@tauri-apps/plugin-clipboard-manager'
import { ChromeIcon } from '../icons/chromeIcons.js'
import { formatRelativeTime } from '@/util/relativeTime.js'

const props = defineProps({
  project: Object,
  filename: String,
  pathname: String,
  active: Boolean,
  wordCount: Object,
  markdown: String,
  platform: String,
  isSaved: Boolean
})

const preferencesStore = usePreferencesStore()
const layoutStore = useLayoutStore()
const editorStore = useEditorStore()
const projectStore = useProjectStore()
const { t } = useI18n()

const isOsx = isOsxPlatform
const appVersion = __APP_VERSION__
const isDev = import.meta.env.DEV
const windowIconMinimize = minimizePath
const windowIconRestore = restorePath
const windowIconMaximize = maximizePath
const windowIconClose = closePath

// Direct Tauri Window API replaces the v1 mt::window-state IPC
// roundtrip. No backend command needed — is_fullscreen() and
// is_maximized() are sync-ish promise calls that resolve from the OS.
// Subsequent state changes are tracked via tauri://resize event (fires
// on max/unmax/fullscreen).
const isFullScreen = ref(false)
const isMaximized = ref(false)
const refreshWindowState = async () => {
  try {
    const win = getCurrentWindow()
    isFullScreen.value = await win.isFullscreen()
    isMaximized.value = await win.isMaximized()
  } catch (e) {
    console.warn('[titleBar][refreshWindowState] failed', e)
  }
}
refreshWindowState()

const { titleBarStyle, theme, followSystemTheme, lightModeTheme, darkModeTheme } = storeToRefs(preferencesStore)
const { showTabBar, showSideBar } = storeToRefs(layoutStore)

// START_BLOCK_THEME_CYCLE
// C-41 T-001: three-state theme button (Avenex order Auto → Light → Dark).
// Auto = followSystemTheme with the effective theme resolved from
// prefers-color-scheme by app.vue's START_BLOCK_APPLY_AUTO_THEME; Light and
// Dark pin the manual lightModeTheme/darkModeTheme member.
const THEME_CYCLE = Object.freeze({ auto: 'light', light: 'dark', dark: 'auto' })

const themeMode = computed(() => {
  if (followSystemTheme.value) return 'auto'
  return isDarkTheme(theme.value) ? 'dark' : 'light'
})

const themeTooltip = computed(() => t(`titleBar.themeMode.${themeMode.value}`))

const handleThemeToggle = () => {
  const next = THEME_CYCLE[themeMode.value]
  if (next === 'auto') {
    // app.vue's followSystemTheme watcher resolves and applies immediately.
    preferencesStore.SET_SINGLE_PREFERENCE({ type: 'followSystemTheme', value: true })
    return
  }
  if (followSystemTheme.value) {
    preferencesStore.SET_SINGLE_PREFERENCE({ type: 'followSystemTheme', value: false })
  }
  const member = next === 'light' ? lightModeTheme.value : darkModeTheme.value
  preferencesStore.SET_SINGLE_PREFERENCE({ type: 'theme', value: member })
}
// END_BLOCK_THEME_CYCLE

// C-15 Phase W QA round 2: mt_share_file is an NSSharingServicePicker
// shim — macOS-only (m048 capability). Hide, don't fail silently.
const shareCapable = computed(() => preferencesStore.buildCapabilities.share === true)

// START_BLOCK_DOC_INFO_POPOVER
// C-40 T-002: clicking the file name opens the document info popover.
// Statistics reuse the tab's wordCount (the old title-bar counter's
// source, whole-document); reading time = words/230 rounded up, min 1.
// File metadata (size, mtime) loads per open via window.fileUtils.stat;
// the folder is ~-abbreviated once the home dir resolves. Untitled
// tabs (no pathname) show stats and Rename only.
const popoverOpen = ref(false)
const docSizeBytes = ref(0)
const docMtimeMs = ref(0)
const homeDirPrefix = ref(null) // null = not loaded yet, '' = unavailable

const togglePopover = () => {
  if (popoverOpen.value) {
    closePopover()
  } else {
    popoverOpen.value = true
    refreshDocInfo()
  }
}

const closePopover = () => {
  popoverOpen.value = false
}

const ensureHomeDir = async () => {
  if (homeDirPrefix.value !== null) return
  try {
    const { homeDir } = await import('@tauri-apps/api/path')
    const dir = await homeDir()
    homeDirPrefix.value = typeof dir === 'string' && dir ? dir.replace(/[/\\]+$/, '') : ''
  } catch (e) {
    homeDirPrefix.value = ''
  }
}

const refreshDocInfo = async () => {
  docSizeBytes.value = 0
  docMtimeMs.value = 0
  void ensureHomeDir()
  if (!props.pathname) return
  try {
    const s = await window.fileUtils.stat(props.pathname)
    if (!popoverOpen.value) return
    docSizeBytes.value = Number(s?.size ?? 0) || 0
    docMtimeMs.value = Number(s?.mtimeMs ?? s?.mtime_ms ?? 0) || 0
  } catch (e) {
    // Do not log the absolute path (docs/technology.xml redaction contract).
    console.warn('[TitleBar][refreshDocInfo][BLOCK_DOC_INFO_STAT] failed=true', e)
  }
}

const formatFileSize = (bytes) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return ''
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`
  const mb = kb / 1024
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`
}

const folderLabel = computed(() => {
  if (!props.pathname) return ''
  const sep = PATH_SEPARATOR
  const idx = props.pathname.lastIndexOf(sep)
  if (idx <= 0) return ''
  let dir = props.pathname.slice(0, idx)
  const home = homeDirPrefix.value
  if (home && (dir === home || dir.startsWith(home + sep) || dir.startsWith(home + '/'))) {
    dir = '~' + dir.slice(home.length)
  }
  return dir
})

const modifiedLabel = computed(() => {
  const mtime = docMtimeMs.value
  if (!Number.isFinite(mtime) || mtime <= 0) return ''
  const rel = formatRelativeTime(mtime, Date.now(), t)
  const time = rel || new Date(mtime).toLocaleDateString()
  return t('titleBar.popover.edited', { time })
})

const docInfoMeta = computed(() => {
  return [folderLabel.value, formatFileSize(docSizeBytes.value), modifiedLabel.value]
    .filter(Boolean)
    .join(' · ')
})

const statWords = computed(() => props.wordCount?.word ?? 0)
const statCharacters = computed(() => props.wordCount?.character ?? 0)
const statLines = computed(() => {
  const md = props.markdown
  return md ? md.split('\n').length : 0
})
const READING_WORDS_PER_MINUTE = 230
const readingLabel = computed(() => {
  const minutes = Math.max(1, Math.ceil(statWords.value / READING_WORDS_PER_MINUTE))
  return t('titleBar.popover.minutes', { count: minutes })
})

// The popover must not go stale when the active tab changes under it.
watch(
  () => props.pathname,
  () => {
    if (popoverOpen.value) refreshDocInfo()
  }
)

const handleRenameClick = () => {
  closePopover()
  // The old click-to-rename path: untitled → Save As, named → the
  // rename dialog (bus 'rename').
  editorStore.RESPONSE_FOR_RENAME()
}

const showInFolderLabel = computed(() => {
  if (isOsx) return t('recent.showInFinder')
  if (isWindows) return t('recent.showInExplorer')
  return t('recent.showInFolder')
})

const handleRevealClick = () => {
  if (!props.pathname) return
  closePopover()
  window.electron.shell.showItemInFolder(props.pathname)
  console.debug('[TitleBar][handleRevealClick][BLOCK_REVEAL_IN_FOLDER] revealed=true')
}

const handleCopyPathClick = async () => {
  if (!props.pathname) return
  try {
    await writeClipboardText(props.pathname)
    console.debug('[TitleBar][handleCopyPathClick][BLOCK_COPY_PATH] copied=true')
  } catch (e) {
    console.warn('[TitleBar][handleCopyPathClick][BLOCK_COPY_PATH] copied=false', e)
  }
  closePopover()
}

// Outside click and Escape close the popover. The title button itself
// is excluded so its click can toggle the popover closed.
const onDocMouseDown = (event) => {
  if (!popoverOpen.value) return
  const target = event.target instanceof Element ? event.target : null
  if (!target) return
  if (target.closest('.doc-info-popover, .titlebar-title-btn')) return
  closePopover()
}

const onDocKeydown = (event) => {
  if (!popoverOpen.value) return
  if (event.key === 'Escape') closePopover()
}
// END_BLOCK_DOC_INFO_POPOVER

const handleGuideClick = () => {
  // Same channel as Help › Mark Guide and the palette (C-40 R-1).
  bus.emit('mt::open-guide', {})
}

// START_CONTRACT: handleTitleContextMenu
//   PURPOSE: Open a native context menu for the active title path and copy the exact pathname only after explicit user selection.
//   INPUTS: { event: MouseEvent - context-menu pointer coordinates }
//   OUTPUTS: { Promise<void> - resolves after menu dismissal and optional clipboard write }
//   SIDE_EFFECTS: Invokes native context-menu IPC, may write the active pathname to the OS clipboard, and emits path-redacted diagnostics.
//   LINKS: .grace/verification/runtime.xml V-M-011 scenario-14; .grace/graph/runtime.xml M-011.
// END_CONTRACT: handleTitleContextMenu
// START_BLOCK_TITLE_PATH_CONTEXT_MENU
const handleTitleContextMenu = async (event) => {
  if (!props.pathname) return

  try {
    const clickedId = await window.electron.ipcRenderer.invoke(
      'mt::window-popup-context-menu',
      {
        items: [{ label: t('contextMenu.tabs.copyPath'), id: 'copyPath' }],
        x: Number.isFinite(event?.clientX) ? event.clientX : 0,
        y: Number.isFinite(event?.clientY) ? event.clientY : 0
      }
    )

    if (clickedId === 'copyPath') {
      await writeClipboardText(props.pathname)
      // Do not log the absolute path (docs/technology.xml redaction contract).
      console.debug('[TitleBar][handleTitleContextMenu][BLOCK_COPY_PATH] copied=true')
    }
  } catch (error) {
    console.warn('[TitleBar][handleTitleContextMenu][BLOCK_COPY_PATH] copied=false', error)
  }
}
// END_BLOCK_TITLE_PATH_CONTEXT_MENU

const showCustomTitleBar = computed(() => {
  return effectiveTitleBarStyle.value === 'custom' && !isOsx
})

// C-15 T-W1: Windows ships with decorations:false (tauri.windows.conf.json
// overlay) unconditionally — native chrome is not an option there, so the
// effective style is always 'custom' regardless of the stored preference.
// macOS and Linux honor the user preference.
const effectiveTitleBarStyle = computed(() => {
  return isWindows ? 'custom' : titleBarStyle.value
})

// START_BLOCK_RESIZE_EDGE_GUARD
// The transparent title bar starts at the window's top pixel, so a press
// on the top edge or a top corner used to start a window drag instead of
// the native resize. Presses this close to the top/left/right edges are
// left to AppKit (no preventDefault, no startDragging).
const RESIZE_EDGE_PX = 6
const isOnResizeEdge = (event) =>
  event.clientY <= RESIZE_EDGE_PX ||
  event.clientX <= RESIZE_EDGE_PX ||
  event.clientX >= window.innerWidth - RESIZE_EDGE_PX
// END_BLOCK_RESIZE_EDGE_GUARD

const handleWindowDragMouseDown = (event) => {
  if (!isOsx || event.button !== 0) return
  if (isOnResizeEdge(event)) return
  const target = event.target instanceof Element ? event.target : null
  if (!target) return

  const dragTarget = target.closest('[data-tauri-drag-region]')
  if (!dragTarget || target.closest('.title-no-drag')) return

  event.preventDefault()
  getCurrentWindow().startDragging()
}

watch(
  () => props.filename,
  (value) => {
    // Set filename when hover on dock
    const hasOpenFolder = props.project && props.project.name
    let title = ''
    if (value) {
      title = hasOpenFolder ? `${value} - ${props.project.name}` : `${value}`
    } else {
      title = hasOpenFolder ? props.project.name : ''
    }

    document.title = title
  }
)

// Sidebar toggle: emits the canonical bus event (same path as Cmd+J).
const handleSidebarToggleClick = () => {
  bus.emit('view:toggle-layout-entry', 'showSideBar')
}

const handleSettingsClick = () => {
  projectStore.OPEN_SETTING_WINDOW()
}

const handleShareClick = async () => {
  if (!props.pathname) return
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('mt_share_file', { path: props.pathname })
  } catch (e) {
    console.warn('[titleBar] share failed:', e)
  }
}

// Window controls call @tauri-apps/api/window directly. The 3-state
// machine for maximize-toggle (fullscreen → exit; maximized →
// unmaximize; else → maximize) lives renderer-side since Tauri's
// Window API exposes the state queries cheaply.
const handleCloseClick = async () => {
  // Lifecycle hook in m001_save_close.wire_close_handler will
  // intercept WindowEvent::CloseRequested and run the dirty-tab
  // dialog before destroy.
  await getCurrentWindow().close()
}

const handleMaximizeClick = async () => {
  const win = getCurrentWindow()
  if (await win.isFullscreen()) {
    await win.setFullscreen(false)
  } else if (await win.isMaximized()) {
    await win.unmaximize()
  } else {
    await win.maximize()
  }
}

// C-9: the title box shrank to the area between the nav cluster and the
// right toolbar, so the dblclick-to-zoom gesture moved to the whole bar;
// interactive zones opt out. C-15 T-W1: frameless Windows/Linux windows
// get the same gesture (native Windows maximizes on titlebar dblclick),
// and handleMaximizeClick already no-ops gracefully for every state.
const handleTitleBarDblclick = (event) => {
  if (
    event.target.closest('.title-no-drag, .titlebar-nav, .titlebar-right, .right-toolbar')
  ) {
    return
  }
  handleMaximizeClick()
}

const handleMinimizeClick = async () => {
  await getCurrentWindow().minimize()
}

const handleMenuClick = async (event) => {
  try {
    const rect = event.currentTarget.getBoundingClientRect()
    await window.electron.ipcRenderer.invoke('mt::window-popup-app-menu', {
      x: rect.left,
      y: rect.bottom
    })
  } catch (e) {
    console.warn('[titleBar] menu popup failed:', e)
  }
}

// Tauri 2 doesn't expose discrete max/unmax/fullscreen events the way
// Electron did. Instead, every window state change (maximize /
// unmaximize / enter-fs / leave-fs) triggers a `tauri://resize` event
// since the inner-size changes. We listen to resize and re-query
// is_fullscreen + is_maximized — single source of truth, no
// event-bridge needed in Rust.
let resizeUnlisten = null
;(async () => {
  try {
    resizeUnlisten = await getCurrentWindow().onResized(() => {
      refreshWindowState()
    })
  } catch (e) {
    console.warn('[titleBar] onResized listener registration failed', e)
  }
})()

onMounted(() => {
  if (isOsx) {
    document.addEventListener('mousedown', handleWindowDragMouseDown)
  }
  document.addEventListener('mousedown', onDocMouseDown)
  document.addEventListener('keydown', onDocKeydown)
})

onBeforeUnmount(() => {
  if (isOsx) {
    document.removeEventListener('mousedown', handleWindowDragMouseDown)
  }
  document.removeEventListener('mousedown', onDocMouseDown)
  document.removeEventListener('keydown', onDocKeydown)
  if (typeof resizeUnlisten === 'function') {
    resizeUnlisten()
    resizeUnlisten = null
  }
})
</script>

<style scoped>
.title-bar-editor-bg {
  height: var(--titleBarHeight);
  background: var(--editorBgColor, #ffffff);
  border-bottom: 1px solid var(--titleBarBorderColor, rgba(0, 0, 0, 0.08));
  position: relative;
  left: 0;
  top: 0;
  right: 0;
}
.title-bar {
  user-select: none;
  background: transparent;
  height: var(--titleBarHeight);
  box-sizing: border-box;
  color: var(--editorColor50);
  position: fixed;
  left: 0;
  top: 0;
  right: 0;
  z-index: 2;
  transition: color 0.4s ease-in-out;
  cursor: default;
  /* C-40 T-002: the bar is a flex row (canvas geometry) — left cluster,
     centered title, right cluster, absolutely-positioned window controls. */
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 12px 0 14px;
}
.title-bar.isOsx {
  /* clear the traffic lights (~78px) like the old nav shift did */
  padding-left: 86px;
}
.active {
  color: var(--editorColor);
}
.version-badge {
  position: absolute;
  right: 150px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 10px;
  color: var(--editorColor50);
  opacity: 0.6;
  font-weight: 400;
  letter-spacing: 0.03em;
  pointer-events: none;
}
img {
  height: 90%;
  margin-top: 1px;
  vertical-align: top;
}

/* Centre: the document title button (canvas titleBtn metrics). */
.title {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  line-height: var(--titleBarHeight);
  font-size: 13px;
  text-align: center;
}
.titlebar-title-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: min(420px, 100%);
  height: 26px;
  padding: 0 10px;
  box-sizing: border-box;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--editorColor);
  background: transparent;
  font-family: inherit;
  cursor: default;
  transition: background-color 0.15s ease;
}
.titlebar-title-btn:hover,
.titlebar-title-btn.open {
  background: var(--floatHoverColor, rgba(0, 0, 0, 0.06));
}
.titlebar-title-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.titlebar-title-chevron {
  flex-shrink: 0;
  opacity: 0.55;
}
.save-dot {
  flex-shrink: 0;
  width: 6px;
  height: 6px;
  border-radius: 3px;
  background: var(--highlightThemeColor);
  visibility: hidden;
}
.save-dot.show {
  visibility: visible;
}

/* Left cluster: sidebar toggle (+ Win/Linux menu and Settings gear). */
.titlebar-nav {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 0; /* explicit: no gap between buttons */
  z-index: 10;
}
.titlebar-nav-btn {
  position: relative;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  cursor: default;
  color: var(--editorColor80);
  transition: background-color 0.15s ease, color 0.15s ease;
}
.titlebar-nav-btn:hover {
  background-color: var(--floatHoverColor, rgba(0, 0, 0, 0.06));
  color: var(--sideBarTitleColor);
}
.titlebar-nav-btn.active {
  color: var(--sideBarTitleColor);
}
.titlebar-nav-btn.active::after {
  /* Underline bar when this view is currently the active sidebar content. */
  content: '';
  position: absolute;
  bottom: -3px;
  left: 50%;
  transform: translateX(-50%);
  width: 14px;
  height: 2px;
  background-color: var(--highlightThemeColor);
  border-radius: 1px;
}
.titlebar-nav-btn svg {
  pointer-events: none;
}

/* Right cluster: «?» (Win/Linux), theme, Share. Frameless Win/Linux
   keeps clear of the min/max/close cluster on the right edge. */
.titlebar-right {
  display: flex;
  align-items: center;
  gap: 2px;
  margin-right: 6px;
}
.title-bar.frameless:not(.isOsx) .titlebar-right {
  margin-right: 146px;
}

.title-no-drag {
  -webkit-app-region: no-drag;
}

/* C-40 T-002: document info popover (canvas pop/stat/popBtn metrics). */
.doc-info-popover {
  position: absolute;
  top: calc(100% + 6px);
  left: 50%;
  transform: translateX(-50%);
  width: 360px;
  max-width: calc(100vw - 32px);
  box-sizing: border-box;
  padding: 16px;
  border-radius: 12px;
  background: var(--floatBgColor, #ffffff);
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.22),
    0 0 0 0.5px var(--floatBorderColor, rgba(0, 0, 0, 0.12));
  color: var(--editorColor);
  text-align: left;
  cursor: default;
  z-index: 1000;
}
.doc-info-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--editorColor);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.doc-info-meta {
  font-size: 11.5px;
  color: var(--editorColor50);
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.doc-info-stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
  margin: 14px 0;
}
.doc-info-stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--floatHoverColor, rgba(0, 0, 0, 0.04));
  font-size: 11px;
  color: var(--editorColor50);
  min-width: 0;
}
.doc-info-stat b {
  font-size: 16px;
  font-weight: 600;
  color: var(--editorColor);
  font-variant-numeric: tabular-nums;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.doc-info-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.doc-info-action {
  font-size: 12px;
  padding: 5px 10px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--editorColor);
  font-family: inherit;
  cursor: default;
  box-shadow: inset 0 0 0 0.5px var(--floatBorderColor, rgba(0, 0, 0, 0.16));
  transition: background-color 0.15s ease;
}
.doc-info-action:hover {
  background: var(--floatHoverColor, rgba(0, 0, 0, 0.06));
}

/* frameless window controls */
.right-toolbar {
  height: 100%;
  position: absolute;
  top: 0;
  right: 0;
  width: 138px;
  display: flex;
  align-items: center;
  flex-direction: row-reverse;
  & .item {
    margin-right: 10px;
  }
}
.frameless-titlebar-button {
  position: relative;
  display: block;
  width: 46px;
  height: var(--titleBarHeight);
  /* theme-aware so the icons stay visible on dark backgrounds */
  color: var(--editorColor, #000000);
}
.frameless-titlebar-button > div {
  position: absolute;
  display: inline-flex;
  top: 50%;
  left: 50%;
  transform: translateX(-50%) translateY(-50%);
}
.frameless-titlebar-close:hover {
  background-color: rgb(228, 79, 79);
}
.frameless-titlebar-minimize:hover,
.frameless-titlebar-toggle:hover {
  background-color: var(--floatHoverColor, rgba(0, 0, 0, 0.1));
}
.frameless-titlebar-button svg {
  fill: currentColor;
}
.frameless-titlebar-close:hover svg {
  fill: #ffffff;
}
</style>
