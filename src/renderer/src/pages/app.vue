<template>
  <div class="editor-container">
    <side-bar v-if="init"></side-bar>

    <div class="editor-middle">
      <title-bar
        :project="projectTree"
        :pathname="pathname"
        :filename="filename"
        :active="windowActive"
        :word-count="wordCount"
        :markdown="markdown"
        :platform="platform"
        :is-saved="isSaved"
      ></title-bar>

      <div v-if="!init" class="editor-placeholder"></div>
      <live-viewer v-if="init"></live-viewer>
      <recent v-if="!hasCurrentFile && init"></recent>
      <editor-with-tabs
        v-if="hasCurrentFile && init"
        :markdown="markdown"
        :cursor="cursor"
        :muyaIndexCursor="muyaIndexCursor"
        :source-code="sourceCode"
        :diff-mode="diffMode"
        :split-view="splitView"
        :pathname="pathname"
        :show-tab-bar="showTabBar"
        :text-direction="textDirection"
        :platform="platform"
      ></editor-with-tabs>
      <command-palette></command-palette>
      <project-search></project-search>
      <problems-panel></problems-panel>
      <about-dialog></about-dialog>
      <export-setting-dialog></export-setting-dialog>
      <whats-new-dialog></whats-new-dialog>
      <rename></rename>
      <tweet></tweet>
      <import-modal></import-modal>
      <zoom-indicator></zoom-indicator>
      <update-notice></update-notice>
    </div>
  </div>
</template>

<script setup>
// MODULE_CONTRACT
//   PURPOSE: Mount the main renderer shell, hydrate preferences, and apply
//            document-wide theme/common styles for the editor window.
//   SCOPE:   App-level startup wiring only. Owns initial style injection,
//            store listener registration, drag-drop bootstrap, the unified
//            fontSize zoom key/wheel handlers (C-49), the --mark-zoom
//            document property for diagram scaling, and shell component
//            composition.
//   DEPENDS: Pinia stores, bus, util/theme helpers, shell components.
//   LINKS:   docs/knowledge-graph.xml M-011; docs/verification-plan.xml
//            V-M-011 theme swap expectations; .grace/changes/active/C-49.
//   STATUS:  Initial mount path dedupes theme application so raw theme CSS
//            is injected once while common styles still initialize on boot.
//
// CHANGE_SUMMARY:
//   - 2026-10-19 C-66: the shell mounts the update notice
//     (components/updateNotice) and the detached startup chain grows the
//     automatic update check as its last step
//     (START_BLOCK_C66_UPDATE_CHECK): autoUpdatesStore.RUN_LAUNCH_CHECK
//     runs after initWhatsNew (a What's New sheet this launch defers the
//     notice to the next launch) and after FETCH_BUILD_MODE (the App
//     Store build never checks); at most once per 24 h, silent offline.
//   - 2026-10-16 C-40 T-005: install the View-menu checkmark watchers
//     (util/menuChecks.watchViewMenuChecks) so the native sidebar /
//     tab bar / outline / status-bar check items follow every later
//     state change from any toggle surface (boot sync runs in
//     APPLY_BOOTSTRAP_EDITOR).
//   - 2026-10-16 C-38 T-007 N4 e: Windows 11 Mica — boot asks
//     mt_window_effects_state (START_BLOCK_MICA_BOOT) and only a
//     confirmed mica:true installs the mica-active root class; the
//     theme watcher re-tints the material via mt_window_set_mica_theme
//     on every app theme change. No-op everywhere Mica is not live.
//   - 2026-10-15 C-40 T-002: pass the current tab's markdown to the
//     title bar so the document info popover can count lines.
//   - 2026-10-15 C-38 T-005 review: onMounted stops before attaching the
//     window drag/zoom listeners when the component was unmounted during
//     its awaits (the longer hydration made the old leak reproducible).
//   - 2026-10-15 C-49 T-001: one clear zoom — ⌘+/⌘−/⌘0 and Ctrl+wheel now
//     route through the preferences-store zoom actions (ZOOM_STEP /
//     ZOOM_ACTUAL_SIZE: clamp 12–36, 150 ms debounced persist, transient
//     mt::zoom-level-changed event for the new zoom-indicator pill); ⌘0
//     restores the persisted baseFontSize (the Settings size) instead of a
//     hard 16; both handlers skip the fullscreen block viewer (R-6);
//     --mark-zoom = fontSize / 16 is kept on the document element so
//     pele SVGs scale with the text; MIGRATE_LEGACY_ZOOM retires the
//     palette percentage zoom after hydration.
//   - 2026-10-15 C-40 G-3: register editorStore.LISTEN_FOR_OPEN_GUIDE so the
//     'mt::open-guide' bus event (Help › Mark Guide, help.guide palette
//     command) opens the guide as a temporary untitled tab.
//   - 2026-10-15 2.3.1 review: setupDragDropHandler returns a cleanup and
//     onUnmounted removes the window dragover listener (it leaked across
//     remounts and reacted with a stale store).
//   - 2026-10-15 C-48 review fix: START_BLOCK_C48_STARTUP is detached
//     (void async IIFE, try/catch + BLOCK_C48_STARTUP_FAILED) so
//     addCommonStyle never waits on the gate/review IPC; the boot prefs
//     snapshot (snapshotBootPrefs) starts first thing in onMounted so the
//     gate's legacy-install detection sees the pre-boot profile.
//   - 2026-10-15 C-48 T-001: What's New — startup gate (initWhatsNew)
//     records lastSeenVersion / lastUpdateAt and opens the sheet once
//     after an update (components/whatsNew mounts here); Help › What's
//     New reopens it. The App Store review request inits after the gate
//     (review/reviewRequest) with the gate outcome as session facts.
//   - 2026-10-15 C-46 T-001: drag-over no longer opens the import
//     dialog while the welcome screen is visible (no current file) —
//     the welcome screen shows its own drop-zone highlight, driven by
//     the native drag bridge ('mt::native-drag'); dropped files open
//     through that bridge.
//   - 2026-10-15 C-41 T-001: Auto theme — after hydration, resolve
//     followSystemTheme via util/autoTheme before the first addThemeStyle,
//     re-resolve on mode/member preference changes (incl. cross-window
//     broadcasts), and follow LIVE prefers-color-scheme flips through a
//     matchMedia change listener (START_BLOCK_APPLY_AUTO_THEME). While in
//     Auto the resolved theme is a local state write; the persisted
//     `theme` preference is untouched.
//   - 2026-05-21 drag-theme-refactor: dedupe initial addThemeStyle() calls
//     by separating common-style bootstrap from theme-style bootstrap.

import { computed, watch, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { useMainStore } from '@/store'
import { storeToRefs } from 'pinia'
import { addCommonStyle, addThemeStyle, addCustomStyle } from '@/util/theme'
import { resolveAutoTheme, watchSystemColorScheme } from '@/util/autoTheme'
import { installMicaWindowEffect, syncMicaTheme } from '@/util/micaWindow'
import { watchViewMenuChecks } from '@/util/menuChecks'
import Recent from '@/components/recent'
import EditorWithTabs from '@/components/editorWithTabs'
import TitleBar from '@/components/titleBar'
import SideBar from '@/components/sideBar'
import AboutDialog from '@/components/about'
import CommandPalette from '@/components/commandPalette'
import ProjectSearch from '@/components/projectSearch'
import ProblemsPanel from '@/components/problems'
import ExportSettingDialog from '@/components/exportSettings'
import Rename from '@/components/rename'
import Tweet from '@/components/tweet'
import ImportModal from '@/components/import'
import LiveViewer from '@/components/liveViewer'
import ZoomIndicator from '@/components/zoomIndicator'
import UpdateNotice from '@/components/updateNotice'
import WhatsNewDialog from '@/components/whatsNew'
import bus from '@/bus'
import { DEFAULT_STYLE, isDarkTheme } from '@/config'
import { initWhatsNew, getRunningVersion, snapshotBootPrefs } from '@/whatsNew/gate'
import { initReviewRequest } from '@/review/reviewRequest'
import { useTweetStore } from '@/store/tweet'
import { useLayoutStore } from '@/store/layout'
import { useListenForMainStore } from '@/store/listenForMain'
import { usePreferencesStore } from '@/store/preferences'
import { useEditorStore } from '@/store/editor'
import { useCommandCenterStore } from '@/store/commandCenter'
import { useProjectStore } from '@/store/project'
import { useAutoUpdatesStore } from '@/store/autoUpdates'

const mainStore = useMainStore()
const editorStore = useEditorStore()
const preferencesStore = usePreferencesStore()
const layoutStore = useLayoutStore()
const projectStore = useProjectStore()
const tweetStore = useTweetStore()
const listenForMainStore = useListenForMainStore()
const commandCenterStore = useCommandCenterStore()
const autoUpdatesStore = useAutoUpdatesStore()

const timer = ref(null)
let cleanupPinchZoom = null
let cleanupDragDrop = null
let cleanupNativeZoom = null

// States from Pini
const { windowActive, platform, init } = storeToRefs(mainStore)
const { showTabBar } = storeToRefs(layoutStore)
const { sourceCode, theme, customCss, textDirection, zoom } = storeToRefs(preferencesStore)
const { projectTree } = storeToRefs(projectStore)
const { currentFile } = storeToRefs(editorStore)

const pathname = computed(() => currentFile.value?.pathname)
const filename = computed(() => currentFile.value?.filename)
const isSaved = computed(() => currentFile.value?.isSaved)
const markdown = computed(() => currentFile.value?.markdown)
const cursor = computed(() => currentFile.value?.cursor)
const wordCount = computed(() => currentFile.value?.wordCount)
const muyaIndexCursor = computed(() => currentFile.value?.muyaIndexCursor)
const diffMode = computed(() => !!currentFile.value?.diffMode)
const splitView = computed(() => !!currentFile.value?.splitView)

const hasCurrentFile = computed(() => {
  return markdown.value !== undefined
})

// Watchers
watch(theme, (value) => {
  try {
    addThemeStyle(value)
  } catch (e) {
    console.error('[app][theme-watcher] failed:', value, e)
  }
  // C-38 T-007 N4 e: re-tint the Windows 11 Mica material to the new
  // app theme (no-op unless the effect was confirmed at boot).
  void syncMicaTheme(isDarkTheme(value))
})

// START_BLOCK_APPLY_AUTO_THEME
// C-41 T-001 Auto mode: keep `theme` in sync with prefers-color-scheme while
// followSystemTheme is on. Local state write only — the persisted theme
// preference is never rewritten by following the system; the watch(theme)
// above applies the CSS the moment the state flips. Re-resolves when the
// mode flag or either mode member (lightModeTheme/darkModeTheme) changes,
// including cross-window SET_USER_PREFERENCE broadcasts.
const applyAutoTheme = () => {
  if (!preferencesStore.followSystemTheme) return
  const resolved = resolveAutoTheme(preferencesStore)
  if (resolved !== preferencesStore.theme) {
    preferencesStore.theme = resolved
  } else {
    addThemeStyle(resolved)
  }
}

watch(
  () => [preferencesStore.followSystemTheme, preferencesStore.lightModeTheme, preferencesStore.darkModeTheme],
  () => {
    applyAutoTheme()
  }
)

const stopColorSchemeWatch = watchSystemColorScheme(() => {
  applyAutoTheme()
})
// END_BLOCK_APPLY_AUTO_THEME

watch(customCss, (value) => {
  addCustomStyle({ customCss: value })
})

watch(zoom, (zoomValue) => {
  bus.emit('mt::window-zoom', zoomValue)
})

// START_BLOCK_MENU_CHECK_SYNC
// C-40 T-005: native View-menu checkmarks follow the real state. The
// four CheckMenuItems (sidebar, tab bar, outline, status bar) are built
// with fixed defaults, so every later change from any surface — palette,
// title bar button, Settings, keyboard, the menu itself — pushes the new
// state through mt_menu_set_checked. The boot-time full sync lives in
// the editor store (APPLY_BOOTSTRAP_EDITOR, after layout hydration);
// these watchers cover everything after that. Editor window only (the
// Settings window mounts preference.vue, not this page).
watchViewMenuChecks()
// END_BLOCK_MENU_CHECK_SYNC

const setupDragDropHandler = () => {
  const onDragOver = (e) => {
    if (!e.dataTransfer.types.length) return

    if (e.dataTransfer.types.indexOf('Files') >= 0) {
      if (
        e.dataTransfer.items.length === 1 &&
        e.dataTransfer.items[0].type.indexOf('image') > -1
      ) {
        // Do nothing
      } else {
        e.preventDefault()
        // C-46: while the welcome screen is up (no file open) it owns
        // the drop affordance — its highlight follows the native drag
        // bridge ('mt::native-drag') and drops open through that bridge,
        // so the app-wide import dialog must not open on top of it.
        if (hasCurrentFile.value) {
          if (timer.value) {
            clearTimeout(timer.value)
          }
          timer.value = setTimeout(() => {
            bus.emit('importDialog', false)
          }, 300)
          bus.emit('importDialog', true)
        }
      }
      e.dataTransfer.dropEffect = 'copy'
    } else {
      e.stopPropagation()
      e.dataTransfer.dropEffect = 'none'
    }
  }
  window.addEventListener('dragover', onDragOver, false)
  // Removed on unmount: a remounted page must not leave the old handler
  // reacting to drags with a stale store (2.3.1 review).
  return () => window.removeEventListener('dragover', onDragOver, false)
}

// C-15 Phase W QA (Nurik): "ctrl+zoom должен изменять размер шрифта, а не
// зумить внутренний фрейм". Ctrl+wheel and Ctrl+=/-/0 drive the editor
// fontSize preference (live via editor.vue watcher, debounced persistence)
// instead of --content-zoom, which scaled the whole editor surface and
// produced a stray horizontal scrollbar at zoom > 1.
//
// C-49 T-001: the clamping, baseFontSize tracking, debounced persistence
// and the mt::zoom-level-changed indicator event live in the preferences
// store (ZOOM_STEP / ZOOM_ACTUAL_SIZE) so the keyboard/wheel handlers here
// and the View-menu commands (view.zoom-in/out/actual-size) run exactly
// the same code. The native menu claims the accelerators on
// macOS/Windows/Linux before the webview sees the keys; this keydown
// handler covers the surfaces the menu does not (and e2e), mirroring how
// view.split-view pairs a native accelerator with the registry shortcut.
const setupCtrlWheelFontSize = () => {
  let accumulatedDelta = 0
  const STEP_THRESHOLD = 15

  const handler = (e) => {
    if (!e.ctrlKey) return
    // The fullscreen block viewer owns pinch / Ctrl+wheel for its own zoom;
    // it must not also change the editor font size underneath.
    if (e.target && e.target.closest && e.target.closest('.ag-block-viewer')) return
    e.preventDefault()

    accumulatedDelta += e.deltaY
    if (Math.abs(accumulatedDelta) < STEP_THRESHOLD) return

    const step = accumulatedDelta > 0 ? -1 : 1
    accumulatedDelta = 0
    preferencesStore.ZOOM_STEP(step)
  }

  // Capture phase: muya stops wheel propagation inside the editor, so the
  // old document-bubble listener never saw those events and WebView2's
  // native ctrl+wheel browser zoom leaked through.
  window.addEventListener('wheel', handler, { passive: false, capture: true })
  return () => window.removeEventListener('wheel', handler, { capture: true })
}

// START_BLOCK_ZOOM_KEYS_FONT_SIZE
const setupZoomKeysFontSize = () => {
  const handler = (e) => {
    if (!(e.metaKey || e.ctrlKey)) return
    // R-6: the fullscreen block viewer owns its own +/−/0 keys; a
    // Cmd-modified press inside it must not also zoom the editor beneath.
    if (e.target && e.target.closest && e.target.closest('.ag-block-viewer')) return
    if (e.key === '=' || e.key === '+') {
      e.preventDefault()
      preferencesStore.ZOOM_STEP(1)
    } else if (e.key === '-') {
      e.preventDefault()
      preferencesStore.ZOOM_STEP(-1)
    } else if (e.key === '0') {
      e.preventDefault()
      // "Actual Size" — the user's Settings size, not a hard 16.
      preferencesStore.ZOOM_ACTUAL_SIZE()
    }
  }
  window.addEventListener('keydown', handler, true)
  return () => window.removeEventListener('keydown', handler, true)
}
// END_BLOCK_ZOOM_KEYS_FONT_SIZE

// START_BLOCK_MARK_ZOOM
// C-49 R-1: --mark-zoom = fontSize / 16 on the document element. The
// pele pipeline stores each diagram's natural width and computes
// max-width: calc(var(--mark-zoom, 1) * natural px), so diagrams and their
// labels scale with the editor text while width:100% keeps them inside
// the column. immediate: true covers the hydrated boot value.
watch(
  () => preferencesStore.fontSize,
  (fontSize) => {
    document.documentElement.style.setProperty('--mark-zoom', String(fontSize / 16))
  },
  { immediate: true }
)
// END_BLOCK_MARK_ZOOM

let isUnmounted = false

// C-52: a dropped folder (shim drop bridge) opens as the workspace,
// replacing the current one — the shim cannot import the store itself.
const onOpenFolderAsWorkspace = (pathname) => {
  if (typeof pathname === 'string' && pathname) {
    projectStore.OPEN_FOLDER_AS_WORKSPACE(pathname)
  }
}
bus.on('mt::open-folder-as-workspace', onOpenFolderAsWorkspace)

onMounted(async () => {
  // C-48: snapshot prefs BEFORE this boot writes anything (hydration
  // mirror, legacy zoom migration, session restore) — the What's New gate
  // reads legacy-install signals from it (pre-C-48 profiles carry no
  // lastSeenVersion). Started here, awaited inside START_BLOCK_C48_STARTUP.
  const bootPrefs = snapshotBootPrefs()
  if (window.marktext.initialState) {
    preferencesStore.SET_USER_PREFERENCE(window.marktext.initialState)
  }

  await commandCenterStore.LISTEN_COMMAND_CENTER_BUS()
  tweetStore.LISTEN_FOR_TWEET()
  layoutStore.LISTEN_FOR_LAYOUT()
  listenForMainStore.LISTEN_FOR_EDIT()
  projectStore.LISTEN_FOR_SIDEBAR_CONTEXT_MENU()
  await preferencesStore.ASK_FOR_USER_PREFERENCE()
  // C-49 R-4: retire the palette percentage zoom — a stored `zoom` ≠ 1
  // becomes an equivalent fontSize (and baseFontSize) once, then zoom = 1.
  await preferencesStore.MIGRATE_LEGACY_ZOOM()
  // C-41 T-001: resolve Auto (followSystemTheme) before the first style
  // application so the editor window opens on lightModeTheme/darkModeTheme
  // instead of whatever `theme` was last persisted while following the OS.
  if (preferencesStore.followSystemTheme) {
    preferencesStore.theme = resolveAutoTheme(preferencesStore)
  }
  addThemeStyle(preferencesStore.theme)

  // START_BLOCK_MICA_BOOT
  // C-38 T-007 N4 e: Windows 11 Mica behind the custom title bar. Ask
  // the backend whether the effect is live; only a confirmed mica:true
  // installs the mica-active root class that turns the title-bar strip
  // transparent (assets/styles/index.css). Re-tint to the hydrated app
  // theme right away — the backend applies the system-following
  // material at boot, the app theme (Paper/Ink) wins from here on.
  // Detached: boot must not depend on the IPC round-trip.
  void installMicaWindowEffect().then(() =>
    syncMicaTheme(isDarkTheme(preferencesStore.theme))
  )
  // END_BLOCK_MICA_BOOT

  preferencesStore.LISTEN_TOGGLE_VIEW()
  // C-45 T-001: follow the OS preferred languages while the language
  // preference is 'system' (re-resolves on languagechange / focus).
  preferencesStore.LISTEN_SYSTEM_LANGUAGE()
  editorStore.LISTEN_FOR_CLOSE()
  editorStore.LISTEN_FOR_SAVE_AS()
  editorStore.LISTEN_FOR_MOVE_TO()
  editorStore.LISTEN_FOR_SAVE()
  editorStore.LISTEN_FOR_SAVE_ALL()
  editorStore.LISTEN_FOR_BOOTSTRAP_WINDOW()
  editorStore.LISTEN_FOR_RENAME()
  editorStore.LINTEN_FOR_SET_LINE_ENDING()
  editorStore.LINTEN_FOR_SET_ENCODING()
  editorStore.LINTEN_FOR_SET_FINAL_NEWLINE()
  editorStore.LISTEN_FOR_NEW_TAB()
  editorStore.LISTEN_FOR_CLOSE_TAB()
  editorStore.LISTEN_FOR_TAB_CYCLE()
  // C-40 G-3: 'mt::open-guide' (Help › Mark Guide / help.guide palette
  // command) opens the localized guide document as a temporary tab.
  editorStore.LISTEN_FOR_OPEN_GUIDE()
  editorStore.LISTEN_WINDOW_ZOOM()

  // C-38 T-005 review: the window listeners attach after several awaits —
  // a component unmounted meanwhile (tests, HMR) must not leak them.
  if (isUnmounted) return
  cleanupDragDrop = setupDragDropHandler()
  cleanupPinchZoom = setupCtrlWheelFontSize()
  cleanupNativeZoom = setupZoomKeysFontSize()

  // START_BLOCK_C48_STARTUP
  // C-48: What's New gate first (it records lastSeenVersion and stamps
  // lastUpdateAt for the C-46 welcome footer), then the review request —
  // its "never in a session where the version changed" rule consumes the
  // gate outcome, so ordering is load-bearing. FETCH_BUILD_MODE is
  // awaited here because bootstrap-ipc fires it as a floating promise
  // that races this mount; the review init only registers when the m048
  // `review` capability is explicitly true. Detached: the common styles
  // below must never wait on these IPC round-trips.
  void (async () => {
    try {
      const versionStatus = await initWhatsNew({ bootPrefs })
      if (versionStatus.show) {
        bus.emit('whatsNewDialog', { version: versionStatus.version })
      }
      await preferencesStore.FETCH_BUILD_MODE()
      await initReviewRequest({
        preferencesStore,
        versionStatus,
        runningVersion: getRunningVersion()
      })
      // START_BLOCK_C66_UPDATE_CHECK
      // C-66: automatic update check, last in the startup chain — it
      // consumes both earlier outcomes: the What's New gate (a sheet this
      // launch defers the notice to the next one) and FETCH_BUILD_MODE
      // (the App Store build never checks). Inside the same detached
      // try/catch: a failing check must never break the boot above it.
      await autoUpdatesStore.RUN_LAUNCH_CHECK({
        whatsNewShown: versionStatus.show,
        isDesktopBuild: preferencesStore.buildCapabilities.updater !== false
      })
      // END_BLOCK_C66_UPDATE_CHECK
    } catch (e) {
      console.error('[app][onMounted][BLOCK_C48_STARTUP_FAILED]', e)
    }
  })()
  // END_BLOCK_C48_STARTUP

  nextTick(() => {
    const style = {
      theme: preferencesStore.theme,
      codeFontFamily: preferencesStore.codeFontFamily,
      codeFontSize: preferencesStore.codeFontSize,
      hideScrollbar: preferencesStore.hideScrollbar
    }
    try {
      addCommonStyle(style)
    } catch (e) {
      console.error('[app][addCommonStyle] failed:', style, e)
    }
  })
})

onUnmounted(() => {
  bus.off('mt::open-folder-as-workspace', onOpenFolderAsWorkspace)
  isUnmounted = true
  if (cleanupDragDrop) cleanupDragDrop()
  if (cleanupPinchZoom) cleanupPinchZoom()
  if (cleanupNativeZoom) cleanupNativeZoom()
  // C-41 T-001: drop the prefers-color-scheme listener with the window.
  stopColorSchemeWatch()
})
</script>

<style scoped>
.editor-placeholder,
.editor-container {
  display: flex;
  flex-direction: row;
  position: absolute;
  width: 100vw;
  height: 100vh;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--editorBgColor, #ffffff);
}
.editor-container .hide {
  z-index: -1;
  opacity: 0;
  position: absolute;
  left: -10000px;
}
.editor-placeholder {
  background: var(--editorBgColor);
}
.editor-middle {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 100vh;
  position: relative;
  & > .editor {
    flex: 1;
  }
}
</style>
