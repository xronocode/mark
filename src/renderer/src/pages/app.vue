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
      <rename></rename>
      <tweet></tweet>
      <import-modal></import-modal>
    </div>
  </div>
</template>

<script setup>
// MODULE_CONTRACT
//   PURPOSE: Mount the main renderer shell, hydrate preferences, and apply
//            document-wide theme/common styles for the editor window.
//   SCOPE:   App-level startup wiring only. Owns initial style injection,
//            store listener registration, drag-drop bootstrap, and shell
//            component composition.
//   DEPENDS: Pinia stores, bus, util/theme helpers, shell components.
//   LINKS:   docs/knowledge-graph.xml M-011; docs/verification-plan.xml
//            V-M-011 theme swap expectations.
//   STATUS:  Initial mount path dedupes theme application so raw theme CSS
//            is injected once while common styles still initialize on boot.
//
// CHANGE_SUMMARY:
//   - 2026-05-21 drag-theme-refactor: dedupe initial addThemeStyle() calls
//     by separating common-style bootstrap from theme-style bootstrap.

import { computed, watch, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { useMainStore } from '@/store'
import { storeToRefs } from 'pinia'
import { addCommonStyle, addThemeStyle, addCustomStyle } from '@/util/theme'
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
import bus from '@/bus'
import { DEFAULT_STYLE } from '@/config'
import { useTweetStore } from '@/store/tweet'
import { useLayoutStore } from '@/store/layout'
import { useListenForMainStore } from '@/store/listenForMain'
import { usePreferencesStore } from '@/store/preferences'
import { useEditorStore } from '@/store/editor'
import { useCommandCenterStore } from '@/store/commandCenter'
import { useProjectStore } from '@/store/project'

const mainStore = useMainStore()
const editorStore = useEditorStore()
const preferencesStore = usePreferencesStore()
const layoutStore = useLayoutStore()
const projectStore = useProjectStore()
const tweetStore = useTweetStore()
const listenForMainStore = useListenForMainStore()
const commandCenterStore = useCommandCenterStore()

const timer = ref(null)
let cleanupPinchZoom = null
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
})

watch(customCss, (value) => {
  addCustomStyle({ customCss: value })
})

watch(zoom, (zoomValue) => {
  bus.emit('mt::window-zoom', zoomValue)
})

const setupDragDropHandler = () => {
  window.addEventListener(
    'dragover',
    (e) => {
      if (!e.dataTransfer.types.length) return

      if (e.dataTransfer.types.indexOf('Files') >= 0) {
        if (
          e.dataTransfer.items.length === 1 &&
          e.dataTransfer.items[0].type.indexOf('image') > -1
        ) {
          // Do nothing
        } else {
          e.preventDefault()
          if (timer.value) {
            clearTimeout(timer.value)
          }
          timer.value = setTimeout(() => {
            bus.emit('importDialog', false)
          }, 300)
          bus.emit('importDialog', true)
        }
        e.dataTransfer.dropEffect = 'copy'
      } else {
        e.stopPropagation()
        e.dataTransfer.dropEffect = 'none'
      }
    },
    false
  )
}

// C-15 Phase W QA (Nurik): "ctrl+zoom должен изменять размер шрифта, а не
// зумить внутренний фрейм". Ctrl+wheel and Ctrl+=/-/0 now drive the editor
// fontSize preference (live via editor.vue watcher, debounced persistence)
// instead of --content-zoom, which scaled the whole editor surface and
// produced a stray horizontal scrollbar at zoom > 1. The View-menu app zoom
// (ZOOM_LEVELS / EDIT_ZOOM) is untouched.
const FONT_SIZE_MIN = 12
const FONT_SIZE_MAX = 36
const FONT_SIZE_DEFAULT = 16
const FONT_PERSIST_DEBOUNCE_MS = 150

let fontSizePersistTimer = null

const persistFontSize = (value) => {
  if (fontSizePersistTimer) {
    clearTimeout(fontSizePersistTimer)
  }
  fontSizePersistTimer = setTimeout(() => {
    preferencesStore.SET_SINGLE_PREFERENCE({ type: 'fontSize', value })
    fontSizePersistTimer = null
  }, FONT_PERSIST_DEBOUNCE_MS)
}

const applyFontSize = (value) => {
  const next = Math.max(FONT_SIZE_MIN, Math.min(FONT_SIZE_MAX, Math.round(value)))
  if (next === preferencesStore.fontSize) return
  // Direct state write applies instantly (editor.vue watch → muya setFont);
  // the debounced SET_SINGLE_PREFERENCE persists and cross-broadcasts.
  preferencesStore.fontSize = next
  persistFontSize(next)
}

const setupCtrlWheelFontSize = () => {
  let accumulatedDelta = 0
  const STEP_THRESHOLD = 15

  const handler = (e) => {
    if (!e.ctrlKey) return
    e.preventDefault()

    accumulatedDelta += e.deltaY
    if (Math.abs(accumulatedDelta) < STEP_THRESHOLD) return

    const step = accumulatedDelta > 0 ? -1 : 1
    accumulatedDelta = 0
    applyFontSize(preferencesStore.fontSize + step)
  }

  // Capture phase: muya stops wheel propagation inside the editor, so the
  // old document-bubble listener never saw those events and WebView2's
  // native ctrl+wheel browser zoom leaked through.
  window.addEventListener('wheel', handler, { passive: false, capture: true })
  return () => window.removeEventListener('wheel', handler, { capture: true })
}

const setupZoomKeysFontSize = () => {
  const handler = (e) => {
    if (!(e.metaKey || e.ctrlKey)) return
    if (e.key === '=' || e.key === '+') {
      e.preventDefault()
      applyFontSize(preferencesStore.fontSize + 1)
    } else if (e.key === '-') {
      e.preventDefault()
      applyFontSize(preferencesStore.fontSize - 1)
    } else if (e.key === '0') {
      e.preventDefault()
      applyFontSize(FONT_SIZE_DEFAULT)
    }
  }
  window.addEventListener('keydown', handler, true)
  return () => window.removeEventListener('keydown', handler, true)
}

onMounted(async () => {
  if (window.marktext.initialState) {
    preferencesStore.SET_USER_PREFERENCE(window.marktext.initialState)
  }

  await commandCenterStore.LISTEN_COMMAND_CENTER_BUS()
  tweetStore.LISTEN_FOR_TWEET()
  layoutStore.LISTEN_FOR_LAYOUT()
  listenForMainStore.LISTEN_FOR_EDIT()
  projectStore.LISTEN_FOR_SIDEBAR_CONTEXT_MENU()
  await preferencesStore.ASK_FOR_USER_PREFERENCE()
  addThemeStyle(preferencesStore.theme)
  preferencesStore.LISTEN_TOGGLE_VIEW()
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
  editorStore.LISTEN_WINDOW_ZOOM()

  setupDragDropHandler()
  cleanupPinchZoom = setupCtrlWheelFontSize()
  cleanupNativeZoom = setupZoomKeysFontSize()

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
  if (cleanupPinchZoom) cleanupPinchZoom()
  if (cleanupNativeZoom) cleanupNativeZoom()
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
