<template>
  <div
    class="editor-wrapper"
    :class="[
      { typewriter: typewriter, focus: focus, source: sourceCode },
      { 'is-preview': isPreviewMode }
    ]"
      :style="{
      lineHeight: lineHeight,
      fontSize: `${fontSize}px`,
      'font-family': editorFontFamily
        ? `${editorFontFamily}, ${defaultFontFamily}`
        : `${defaultFontFamily}`
      }"
      :dir="textDirection"
      @mousedown.capture="handlePreviewMousedown"
      @keydown.capture="handlePreviewKeydown"
  >
    <div
      ref="editorRef"
      class="editor-component"
      :contenteditable="isPreviewMode ? 'false' : 'true'"
    ></div>
    <div v-show="imageViewerVisible" class="image-viewer">
      <span class="icon-close" @click="setImageViewerVisible(false)">
        <CloseIcon />
      </span>
      <div ref="imageViewerRef"></div>
    </div>
    <el-dialog
      v-model="dialogTableVisible"
      :show-close="isShowClose"
      :modal="true"
      custom-class="ag-dialog-table"
      width="454px"
      center
      dir="ltr"
    >
      <template #title>
        <div class="dialog-title">{{ t('editor.insertTable.title') }}</div>
      </template>
      <el-form :model="tableChecker" :inline="true">
        <el-form-item :label="t('editor.insertTable.rows')">
          <el-input-number
            ref="rowInput"
            v-model="tableChecker.rows"
            size="mini"
            controls-position="right"
            :min="1"
            :max="30"
          ></el-input-number>
        </el-form-item>
        <el-form-item :label="t('editor.insertTable.columns')">
          <el-input-number
            v-model="tableChecker.columns"
            size="mini"
            controls-position="right"
            :min="1"
            :max="20"
          ></el-input-number>
        </el-form-item>
      </el-form>
      <template #footer>
        <div class="dialog-footer">
          <el-button @click="dialogTableVisible = false">{{ t('common.cancel') }}</el-button>
          <el-button type="primary" @click="handleDialogTableConfirm">{{
            t('common.ok')
          }}</el-button>
        </div>
      </template>
    </el-dialog>
    <editor-search v-if="!sourceCode"></editor-search>
  </div>
</template>

<script setup>
// FILE: src/renderer/src/components/editorWithTabs/editor.vue
// VERSION: 1.16.0
// START_MODULE_CONTRACT
//   PURPOSE: Host the Muya WYSIWYG surface and coordinate document rendering, selection, scroll, preview, editor tools, and store/bus integration.
//   SCOPE: Renderer-side Muya lifecycle and UI orchestration; does not own Markdown parsing rules or backend file persistence.
//   DEPENDS: Muya, Pinia preferences/editor/project/layout stores, bus, renderer services/utilities, window.electron compatibility facade, @tauri-apps/plugin-clipboard-manager (writeHtml).
//   LINKS: docs/knowledge-graph.xml M-011 and M-012; docs/verification-plan.xml V-M-011 scenarios 15-16 and V-M-012.
//   ROLE: RUNTIME
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   setMarkdownToEditor - Loads a newly opened document into Muya.
//   handleFileChange - Restores a switched/reloaded tab's document, cursor, history, and scroll state.
//   scrollToCords - Restores saved scrollTop without leaving the editor hidden behind a delayed animation frame.
//   scrollToCordsAfterReload - Clamps the pre-edit scrollTop into a reloaded document's real scrollable range (no phantom padding, no blank viewport).
//   syncPreviewSurface - Mirrors previewMode onto Muya's real replacement container and restores caret focus on exit.
//   imageAction - Applies configured local/upload image insertion behavior.
//   handleExport - Routes supported export formats to renderer services.
//   handleCopyAsHtml - Copies selection (or whole document) to the clipboard as rich text/html (C-3).
//   handleCopyAsPlainText - Copies selection (or whole document) as markup-free plain text (C-12).
//   handleEditorContextMenu - Native right-click menu: undo/redo, cut/copy/paste/select-all roles, Copy as HTML / Plain Text, Share (C-10/C-11/C-12).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-08-07 v1.1.0: fix first-paint blankness and synchronize preview/caret state on Muya's actual surface for UC-030 and UC-031.
//   - 2026-08-10 v1.2.0: bind preview exit gestures to Muya's replacement surface; Finder-opened files no longer remain permanently read-only.
//   - 2026-08-10 v1.3.0: hydrate the Muya surface from the already-selected tab on mount; agent/Finder opens cannot lose their first file-loaded event during boot.
//   - 2026-08-10 v1.4.0: ignore stale file-changed payloads that would replace unsaved Muya edits when focus moves inside the document.
//   - 2026-08-10 v1.5.0: ignore stale file-loaded payloads from a different active tab and avoid reloading identical content over a live selection.
//   - 2026-08-14 v1.6.0: reset scrollTop synchronously for tabs with no saved scroll position so an agent-opened tab cannot inherit a stale scrollTop from the previously active tab and read as blank until manual scroll.
//   - 2026-09-16 v1.7.0: add copyAsHtmlRich bus handler — native clipboard-manager writeHtml puts text/html + text/plain on the clipboard for email paste, with execCommand copyAsRich fallback (C-3).
//   - 2026-09-17 v1.8.0: handleEditorContextMenu — native right-click menu (Copy / Copy as HTML / Select All) replaces the WKWebView default on the WYSIWYG surface (C-10).
//   - 2026-09-17 v1.9.0: full context menu — native cut/copy/paste/select-all roles, Muya undo/redo, Share via mt_share_file (C-11).
//   - 2026-09-17 v1.10.0: handleCopyAsPlainText — marked+sanitize+textContent pipeline writes a single plain-text flavor; context menu, Edit menu, palette (C-12).
//   - 2026-09-21 v1.11.0: scrollToCordsAfterReload — file-changed payloads with contentReloaded (loadChange live-reload, incl. background-tab activation via UPDATE_CURRENT_FILE/CLOSE fallbacks) clamp the pre-edit scrollTop into the reloaded document's range, drop leftover first-paint padding, and sync the tab's saved offset immediately; handleResetPaddingBottom now clears the padding on #ag-editor-id where it was actually set (upstream cleared the container — phantom padding stuck forever).
//   - 2026-09-22 v1.12.0: C-17 — debounced doc-markdown-changed feeds the problems panel; formatDocument bus handler applies formatMarkdown via setMarkdown (one-step undo via the cursor-setter history push).
//   - 2026-09-23 v1.13.0: C-18 — Print drives the native WKWebView print panel via mt_print_webview (window.print is ignored by WKWebView); no eager print-container clearup (the modal can outlive the call).
//   - 2026-09-23 v1.14.0: C-19 — debounced toc-active-heading scrollspy (fixed 80px band; doc-end pins the final heading; above-first-heading clears; re-armed on content change); Go-to-Heading palette command (static registry twin with dynamic-import execute).
//   - 2026-09-24 v1.15.0: C-20 — LinkPathPicker plugin registered; filePathAutoComplete option wired (md+dirs); imagePathAutoComplete wrapper fixed to a passthrough (the old f.type/f.file mapping produced "undefined" items).
//   - 2026-09-24 v1.16.0: C-21 — async dead-link validation rides the doc-markdown-changed debounce and emits doc-deadlinks for the problems panel; the same edit restores the C-19 edit-driven scrollspy re-arm that was lost in the 11e350dd handler edit (two bare clearTimeouts replaced the setTimeout re-arm), and the lint snapshot now carries the tab pathname so a tab switch inside the debounce window cannot resolve links against the wrong directory.
// END_CHANGE_SUMMARY

import { ref, reactive, watch, onMounted, onBeforeUnmount, nextTick, computed } from 'vue'
import log from 'electron-log'
// import ViewImage from 'view-image'
import Muya from 'muya/lib'
import { formatMarkdown } from '@/util/markdownFormat'
import { checkMarkdownLinks } from '@/util/linkCheck'
import TablePicker from 'muya/lib/ui/tablePicker'
import QuickInsert from 'muya/lib/ui/quickInsert'
import CodePicker from 'muya/lib/ui/codePicker'
import EmojiPicker from 'muya/lib/ui/emojiPicker'
import ImagePathPicker from 'muya/lib/ui/imagePicker'
import LinkPathPicker from 'muya/lib/ui/linkPathPicker'
import ImageSelector from 'muya/lib/ui/imageSelector'
import ImageToolbar from 'muya/lib/ui/imageToolbar'
import Transformer from 'muya/lib/ui/transformer'
import FormatPicker from 'muya/lib/ui/formatPicker'
import LinkTools from 'muya/lib/ui/linkTools'
import FootnoteTool from 'muya/lib/ui/footnoteTool'
import TableBarTools from 'muya/lib/ui/tableTools'
import FrontMenu from 'muya/lib/ui/frontMenu'
import EditorSearch from '../search'
import bus from '@/bus'
import { DEFAULT_EDITOR_FONT_FAMILY } from '@/config'
import notice from '@/services/notification'
import Printer from '@/services/printService'
import { SpellcheckerLanguageCommand } from '@/commands'
import { SpellChecker } from '@/spellchecker'
import { isOsx, animatedScrollTo } from '@/util'
import { moveImageToFolder, moveToRelativeFolder, uploadImage } from '@/util/fileSystem'
import { guessClipboardFilePath } from '@/util/clipboard'
import { getCssForOptions, getHtmlToc } from '@/util/pdf'
import { addCommonStyle, setEditorWidth, setWrapCodeBlocks } from '@/util/theme'
import { usePreferencesStore } from '@/store/preferences'
import { useEditorStore } from '@/store/editor'
import { useProjectStore } from '@/store/project'
import { useLayoutStore } from '@/store/layout'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'

import 'muya/themes/default.css'
import '@/assets/themes/codemirror/one-dark.css'
// import 'view-image/lib/imgViewer.css'
import CloseIcon from '@/assets/icons/close.svg'

const { t } = useI18n()
const STANDAR_Y = 320

const props = defineProps({
  markdown: String,
  cursor: Object,
  textDirection: {
    type: String,
    required: true
  },
  platform: String
})

// Get stores
const preferencesStore = usePreferencesStore()
const editorStore = useEditorStore()
const projectStore = useProjectStore()
const layoutStore = useLayoutStore()

// Use storeToRefs to extract reactive properties from the stores
const {
  // Preferences
  preferences,
  preferLooseListItem,
  autoPairBracket,
  autoPairMarkdownSyntax,
  autoPairQuote,
  bulletListMarker,
  orderListDelimiter,
  tabSize,
  listIndentation,
  frontmatterType,
  superSubScript,
  footnote,
  isHtmlEnabled,
  mathEnabled,
  isGitlabCompatibilityEnabled,
  lineHeight,
  fontSize,
  codeFontSize,
  codeFontFamily,
  codeBlockLineNumbers,
  trimUnnecessaryCodeBlockEmptyLines,
  editorFontFamily,
  hideQuickInsertHint,
  hideLinkPopup,
  autoCheck,
  editorLineWidth,
  wrapCodeBlocks,
  imageInsertAction,
  imagePreferRelativeDirectory,
  imageRelativeDirectoryName,
  imageFolderPath,
  theme,
  sequenceTheme,
  hideScrollbar,
  spellcheckerEnabled,
  spellcheckerNoUnderline,
  spellcheckerLanguage,

  // Edit modes
  typewriter,
  focus,
  sourceCode
} = storeToRefs(preferencesStore)

// Editor store refs
const { currentFile } = storeToRefs(editorStore)

// Project store refs
const { projectTree } = storeToRefs(projectStore)

// Component state
const defaultFontFamily = DEFAULT_EDITOR_FONT_FAMILY
const selectionChange = ref(null)
const editor = ref(null)
const isShowClose = ref(false)
const dialogTableVisible = ref(false)
const imageViewerVisible = ref(null)
const tableChecker = reactive({
  rows: 4,
  columns: 3
})

// Template refs
const editorRef = ref(null)
const imageViewerRef = ref(null)
const rowInput = ref(null)

// Non-reactive variables
let printer = null
let spellchecker = null
let switchLanguageCommand = null
let imageViewer = null

// M-022 mt-preview-mode: derive preview state from the active tab so
// the .is-preview class flips reactively when APPLY_PREVIEW_MODE /
// EXIT_PREVIEW_MODE mutate currentFile.previewMode.
const isPreviewMode = computed(() => !!currentFile.value?.previewMode)

// START_CONTRACT: syncPreviewSurface
//   PURPOSE: Keep previewMode synchronized with Muya's actual replacement container and restore an editable caret immediately on preview exit.
//   INPUTS: { preview: Boolean - desired read-only preview state, restoreCaret: Boolean - whether to restore Muya focus/selection }
//   OUTPUTS: { void }
//   SIDE_EFFECTS: Mutates contenteditable/aria-readonly/caret-color on the Muya container and may focus it.
//   LINKS: docs/verification-plan.xml V-M-011 scenario-16; docs/knowledge-graph.xml M-011.fn-syncPreviewSurface
// END_CONTRACT: syncPreviewSurface
// START_BLOCK_PREVIEW_SURFACE_SYNC
const syncPreviewSurface = (preview, restoreCaret = false) => {
  const surface = editor.value?.container
  if (!surface) return

  surface.setAttribute('contenteditable', String(!preview))
  // Vue removes the wrapper's `.is-preview` class on its next DOM patch.
  // Keep an explicit editable color meanwhile so the same mousedown that
  // exits preview cannot place a caret hidden by the still-present class.
  surface.style.caretColor = preview ? 'transparent' : 'var(--editorColor)'
  if (preview) {
    surface.setAttribute('aria-readonly', 'true')
  } else {
    surface.removeAttribute('aria-readonly')
  }

  const shouldRestoreCaret = restoreCaret && !preview && !sourceCode.value
  if (shouldRestoreCaret) {
    editor.value.focus()
  }

  console.debug(
    `[Editor][syncPreviewSurface][BLOCK_PREVIEW_SURFACE_SYNC] preview=${preview} editable=${!preview} restoredCaret=${shouldRestoreCaret}`
  )
}

watch(
  isPreviewMode,
  (preview, previousPreview) => {
    syncPreviewSurface(preview, previousPreview === true && preview === false)
  },
  { flush: 'sync' }
)
// END_BLOCK_PREVIEW_SURFACE_SYNC

// E-04 ORDERING NOTE: handler runs on `mousedown` (NOT mouseup / click).
// Reason: the user's drag-select gesture starts at mousedown — exiting
// preview at mouseup would leave the first click in a no-op limbo where
// caret-color is still transparent. By firing EXIT immediately on
// mousedown, the contenteditable flag flips before the browser starts
// extending the selection, and drag-select works on the very first
// gesture out of preview. DO NOT "fix" this to mouseup/click.
const handlePreviewMousedown = (event) => {
  if (!isPreviewMode.value) return
  // E-02: right-click (contextmenu) shouldn't exit preview. mousedown
  // fires for button=2 too, so gate on left button.
  if (event && typeof event.button === 'number' && event.button !== 0) return
  const tabId = currentFile.value && currentFile.value.id
  if (tabId) editorStore.EXIT_PREVIEW_MODE(tabId, 'click')
}

// Cmd+\\ handler — preview-aware sidebar toggle. When in preview, the
// chord exits preview AND toggles the sidebar in one gesture (the
// EXIT_PREVIEW_MODE call already restores sidebar visibility per the
// `previewModeOnFinderOpen` pref, so we run TOGGLE_LAYOUT_ENTRY only
// when NOT in preview to avoid flipping the user-restored value back).
// Other key events (arrows, Escape, plain typing) must not exit preview
// per V-M-022 E-05.
const handlePreviewKeydown = (event) => {
  if (!event) return
  const isCmdBackslash =
    event.key === '\\' && (event.metaKey || event.ctrlKey)
  if (!isCmdBackslash) return
  if (isPreviewMode.value) {
    const tabId = currentFile.value && currentFile.value.id
    if (tabId) {
      editorStore.EXIT_PREVIEW_MODE(tabId, 'cmd-toggle')
      // EXIT already adjusted sidebar per pref; do not double-toggle.
      event.preventDefault()
      return
    }
  }
  // Not in preview → plain sidebar toggle.
  layoutStore.TOGGLE_LAYOUT_ENTRY('showSideBar')
  event.preventDefault()
}

// Watchers
watch(typewriter, (value) => {
  if (value) {
    scrollToCursor()
  }
})

watch(focus, (value) => {
  if (editor.value) {
    editor.value.setFocusMode(value)
  }
})

watch(fontSize, (value, oldValue) => {
  if (value !== oldValue && editor.value) {
    editor.value.setFont({ fontSize: value })
  }
})

watch(lineHeight, (value, oldValue) => {
  if (value !== oldValue && editor.value) {
    editor.value.setFont({ lineHeight: value })
  }
})

watch(preferLooseListItem, (value, oldValue) => {
  if (value !== oldValue && editor.value) {
    editor.value.setOptions({
      preferLooseListItem: value
    })
  }
})

watch(tabSize, (value, oldValue) => {
  if (value !== oldValue && editor.value) {
    editor.value.setTabSize(value)
  }
})

watch(theme, (value, oldValue) => {
  if (value !== oldValue && editor.value) {
    // Agreement：Any black series theme needs to contain dark `word`.
    if (/dark/i.test(value)) {
      editor.value.setOptions(
        {
          mermaidTheme: 'dark',
          vegaTheme: 'dark'
        },
        true
      )
    } else {
      editor.value.setOptions(
        {
          mermaidTheme: 'default',
          vegaTheme: 'latimes'
        },
        true
      )
    }
  }
})

watch(sequenceTheme, (value, oldValue) => {
  if (value !== oldValue && editor.value) {
    editor.value.setOptions({ sequenceTheme: value }, true)
  }
})

watch(listIndentation, (value, oldValue) => {
  if (value !== oldValue && editor.value) {
    editor.value.setListIndentation(value)
  }
})

watch(frontmatterType, (value, oldValue) => {
  if (value !== oldValue && editor.value) {
    editor.value.setOptions({ frontmatterType: value })
  }
})

watch(superSubScript, (value, oldValue) => {
  if (value !== oldValue && editor.value) {
    editor.value.setOptions({ superSubScript: value }, true)
  }
})

watch(footnote, (value, oldValue) => {
  if (value !== oldValue && editor.value) {
    editor.value.setOptions({ footnote: value }, true)
  }
})

watch(mathEnabled, (value, oldValue) => {
  if (value !== oldValue && editor.value) {
    editor.value.setOptions({ math: value }, true)
  }
})

watch(isHtmlEnabled, (value, oldValue) => {
  if (value !== oldValue && editor.value) {
    editor.value.setOptions({ disableHtml: !value }, true)
  }
})

watch(isGitlabCompatibilityEnabled, (value, oldValue) => {
  if (value !== oldValue && editor.value) {
    editor.value.setOptions({ isGitlabCompatibilityEnabled: value }, true)
  }
})

watch(hideQuickInsertHint, (value, oldValue) => {
  if (value !== oldValue && editor.value) {
    editor.value.setOptions({ hideQuickInsertHint: value })
  }
})

watch(editorLineWidth, (value, oldValue) => {
  if (value !== oldValue) {
    setEditorWidth(value)
  }
})

watch(wrapCodeBlocks, (value, oldValue) => {
  if (value !== oldValue) {
    setWrapCodeBlocks(value)
  }
})

watch(autoPairBracket, (value, oldValue) => {
  if (value !== oldValue && editor.value) {
    editor.value.setOptions({ autoPairBracket: value })
  }
})

watch(autoPairMarkdownSyntax, (value, oldValue) => {
  if (value !== oldValue && editor.value) {
    editor.value.setOptions({ autoPairMarkdownSyntax: value })
  }
})

watch(autoPairQuote, (value, oldValue) => {
  if (value !== oldValue && editor.value) {
    editor.value.setOptions({ autoPairQuote: value })
  }
})

watch(trimUnnecessaryCodeBlockEmptyLines, (value, oldValue) => {
  if (value !== oldValue && editor.value) {
    editor.value.setOptions({ trimUnnecessaryCodeBlockEmptyLines: value })
  }
})

watch(bulletListMarker, (value, oldValue) => {
  if (value !== oldValue && editor.value) {
    editor.value.setOptions({ bulletListMarker: value })
  }
})

watch(orderListDelimiter, (value, oldValue) => {
  if (value !== oldValue && editor.value) {
    editor.value.setOptions({ orderListDelimiter: value })
  }
})

watch(hideLinkPopup, (value, oldValue) => {
  if (value !== oldValue && editor.value) {
    editor.value.setOptions({ hideLinkPopup: value })
  }
})

watch(autoCheck, (value, oldValue) => {
  if (value !== oldValue && editor.value) {
    editor.value.setOptions({ autoCheck: value })
  }
})

watch(codeFontSize, (value, oldValue) => {
  if (value !== oldValue) {
    addCommonStyle({
      codeFontSize: value,
      codeFontFamily: codeFontFamily.value,
      hideScrollbar: hideScrollbar.value
    })
  }
})

watch(codeBlockLineNumbers, (value, oldValue) => {
  if (value !== oldValue && editor.value) {
    editor.value.setOptions({ codeBlockLineNumbers: value }, true)
  }
})

watch(codeFontFamily, (value, oldValue) => {
  if (value !== oldValue) {
    addCommonStyle({
      codeFontSize: codeFontSize.value,
      codeFontFamily: value,
      hideScrollbar: hideScrollbar.value
    })
  }
})

watch(hideScrollbar, (value, oldValue) => {
  if (value !== oldValue) {
    addCommonStyle({
      codeFontSize: codeFontSize.value,
      codeFontFamily: codeFontFamily.value,
      hideScrollbar: value
    })
  }
})

watch(spellcheckerEnabled, (value, oldValue) => {
  if (value !== oldValue) {
    // Set Muya's spellcheck container attribute.
    editor.value.setOptions({ spellcheckEnabled: value })

    // Disable native spell checker
    if (value) {
      spellchecker.activateSpellchecker(spellcheckerLanguage.value)
    } else {
      spellchecker.deactivateSpellchecker()
    }
  }
})

watch(spellcheckerNoUnderline, (value, oldValue) => {
  if (value !== oldValue) {
    // Set Muya's spellcheck container attribute.
    editor.value.setOptions({ spellcheckEnabled: !value })
  }
})

watch(spellcheckerLanguage, (value, oldValue) => {
  if (value !== oldValue) {
    spellchecker.lang = value
  }
})

watch(currentFile, (value, oldValue) => {
  if (value && value !== oldValue) {
    scrollToCursor(0)
    // Hide float tools if needed.
    if (editor.value) {
      editor.value.hideAllFloatTools()
    }
  }
})

watch(sourceCode, (value, oldValue) => {
  if (value && value !== oldValue) {
    if (editor.value) {
      editor.value.hideAllFloatTools()
    }
  }
})

// Methods
const photoCreatorClick = (url) => {
  window.electron.shell.openExternal(url)
}

const jumpClick = (linkInfo) => {
  const { href } = linkInfo
  editorStore.FORMAT_LINK_CLICK({ data: { href }, dirname: window.DIRNAME })
}

const imagePathAutoComplete = async (src) => {
  // The store returns display-ready items ({text, iconClass}); the old
  // f.type/f.file mapping produced "undefined" entries (latent breakage
  // from the Tauri store rewrite) — pass them through.
  return editorStore.ASK_FOR_IMAGE_AUTO_PATH(src)
}

// C-20: link-destination autocomplete (markdown files + directories).
const filePathAutoComplete = async (src) => {
  return editorStore.ASK_FOR_FILE_PATH(src, { exts: ['md', 'markdown'] })
}

const imageAction = async (image, id, alt = '') => {
  // TODO(Refactor): Refactor this method.
  const { filename, pathname: currentPathname } = currentFile.value

  // Save an image relative to the file if the relative image directory include the filename variable.
  // The image is save relative to the root folder without a variable.
  const saveRelativeToFile = () => {
    return /\${filename}/.test(imageRelativeDirectoryName.value)
  }

  // Figure out the current working directory.
  const isTabSavedOnDisk = !!currentPathname
  let relativeBasePath = isTabSavedOnDisk ? window.path.dirname(currentPathname) : null
  if (isTabSavedOnDisk && !saveRelativeToFile() && projectTree.value) {
    const { pathname: rootPath } = projectTree.value
    if (rootPath && window.fileUtils.isChildOfDirectory(rootPath, currentPathname)) {
      // Save assets relative to root directory.
      relativeBasePath = rootPath
    }
  }

  const getResolvedImagePath = (imagePath) => {
    const replacement = isTabSavedOnDisk
      ? // Filename w/o extension
        filename.replace(/\.[^/.]+$/, '')
      : ''
    return imagePath.replace(/\${filename}/g, replacement)
  }

  const resolvedImageFolderPath = getResolvedImagePath(imageFolderPath.value)
  const resolvedImageRelativeDirectoryName = getResolvedImagePath(imageRelativeDirectoryName.value)
  let destImagePath = ''
  switch (imageInsertAction.value) {
    case 'upload': {
      try {
        // 传入完整的首选项状态对象，避免对不存在的 .value 解引用
        destImagePath = await uploadImage(currentPathname, image, preferencesStore.$state)
      } catch (err) {
        notice.notify({
          title: 'Upload Image',
          type: 'warning',
          message: err
        })
        destImagePath = await moveImageToFolder(currentPathname, image, resolvedImageFolderPath)
      }
      break
    }
    case 'folder': {
      destImagePath = await moveImageToFolder(currentPathname, image, resolvedImageFolderPath)
      if (isTabSavedOnDisk && imagePreferRelativeDirectory.value) {
        destImagePath = await moveToRelativeFolder(
          relativeBasePath,
          resolvedImageRelativeDirectoryName,
          currentPathname,
          destImagePath
        )
      }
      break
    }
    case 'path': {
      if (typeof image === 'string') {
        // Input is a local path.
        destImagePath = image
      } else {
        // Save and move image to image folder if input is binary.
        destImagePath = await moveImageToFolder(currentPathname, image, resolvedImageFolderPath)

        // Respect user preferences if tab exists on disk.
        if (isTabSavedOnDisk && imagePreferRelativeDirectory.value) {
          destImagePath = await moveToRelativeFolder(
            relativeBasePath,
            resolvedImageRelativeDirectoryName,
            currentPathname,
            destImagePath
          )
        }
      }
      break
    }
  }

  if (id && sourceCode.value) {
    bus.emit('image-action', {
      id,
      result: destImagePath,
      alt
    })
  }
  return destImagePath
}

const imagePathPicker = () => {
  return editorStore.ASK_FOR_IMAGE_PATH()
}

const keyup = (event) => {
  if (event.key === 'Escape') {
    setImageViewerVisible(false)
  }
}

const setImageViewerVisible = (status) => {
  imageViewerVisible.value = status
}

const switchSpellcheckLanguage = (languageCode) => {
  const { isEnabled } = spellchecker

  // This method is also called from bus, so validate state before continuing.
  if (!isEnabled) {
    throw new Error(t('editor.spellcheck.disabledError'))
  }

  spellchecker
    .switchLanguage(languageCode)
    .then((langCode) => {
      if (!langCode) {
        // Unable to switch language due to missing dictionary. The spell checker is now in an invalid state.
        notice.notify({
          title: t('editor.spellcheck.title'),
          type: 'warning',
          message: t('editor.spellcheck.languageMissing', { languageCode })
        })
      }
    })
    .catch((error) => {
      log.error(t('editor.spellcheck.errorSwitchingLanguage', { languageCode }))
      log.error(error)

      notice.notify({
        title: t('editor.spellcheck.title'),
        type: 'error',
        message: t('editor.spellcheck.switchError', { languageCode, error: error.message })
      })
    })
}

const handleInvalidateImageCache = () => {
  if (editor.value) {
    editor.value.invalidateImageCache()
  }
}

const openSpellcheckerLanguageCommand = () => {
  if (!isOsx) {
    bus.emit('show-command-palette', switchLanguageCommand)
  }
}

const replaceMisspelling = ({ word, replacement }) => {
  if (editor.value) {
    editor.value._replaceCurrentWordInlineUnsafe(word, replacement)
  }
}

const handleUndo = () => {
  if (editor.value) {
    editor.value.undo()
  }
}

const handleRedo = () => {
  if (editor.value) {
    editor.value.redo()
  }
}

const handleSelectAll = () => {
  if (sourceCode.value) {
    return
  }

  const activeElement = document.activeElement
  const nodeName = activeElement.nodeName
  if (nodeName === 'INPUT' || nodeName === 'TEXTAREA') {
    if (typeof activeElement.select === 'function') {
      activeElement.select()
    }
    return
  }

  if (editor.value) {
    editor.value.selectAll()
  }
}

// Custom copyAsRich copyAsHtml pasteAsPlainText
const handleCopyPaste = (type) => {
  if (editor.value) {
    editor.value[type]()
  }
}

// START_CONTRACT: handleCopyAsHtml
//   PURPOSE: Put the selection (or whole document when nothing is selected) on the clipboard as rich HTML for email paste.
//   INPUTS: { none - reads Muya selection state (range / table cells / image) }
//   OUTPUTS: { Promise<void> - resolves after the clipboard write attempt }
//   SIDE_EFFECTS: Regenerates HTML from the markdown via muya's marked (editor options), sanitizes with DOMPurify EXPORT config, writes text/html + text/plain via the native clipboard-manager plugin; on plugin failure warns, notifies, and retries through Muya's execCommand copy event if the editor is still alive.
//   LINKS: C-3; .grace/graph/runtime.xml M-011 fn-handleCopyAsHtml; commands/index.js edit.copy-as-html
// END_CONTRACT: handleCopyAsHtml
// START_BLOCK_COPY_AS_HTML
const handleCopyAsHtml = async () => {
  const ed = editor.value
  if (!ed) return
  // Markdown text of whatever is selected — DOM range, table cells,
  // or image (muya getCopyData mirrors the copy handlers' special
  // cases). Falls back to the whole document when nothing is selected.
  const selectionData = ed.getCopyData()
  const hasSelection = !!(selectionData && selectionData.text)
  const text = hasSelection ? selectionData.text : ed.getMarkdown()
  if (!text) return
  const [{ default: marked }, { sanitize }, { EXPORT_DOMPURIFY_CONFIG }] =
    await Promise.all([
      import('muya/lib/parser/marked'),
      import('muya/lib/utils'),
      import('muya/lib/config')
    ])
  // One pipeline for every path: marked with the editor's muya options
  // (superSubScript/footnote/... respected), then DOMPurify — Markdown
  // may contain raw HTML blocks, so never write unsanitized markup.
  const html = sanitize(marked(text, ed.options), EXPORT_DOMPURIFY_CONFIG, false)
  try {
    // Native write works from menu events where no webview user
    // gesture exists (execCommand would be denied there).
    const { writeHtml } = await import('@tauri-apps/plugin-clipboard-manager')
    await writeHtml(html, text)
  } catch (e) {
    console.warn(
      `[Editor][handleCopyAsHtml][BLOCK_COPY_AS_HTML] native writeHtml failed, falling back to execCommand copy: ${e}`
    )
    // execCommand only works under a webview gesture (command palette);
    // from the menu it will silently no-op, so always tell the user.
    notice.notify({ title: t('error.copyError'), type: 'warning' })
    if (editor.value) {
      editor.value.copyAsRich()
    }
  }
}
// END_BLOCK_COPY_AS_HTML

// START_CONTRACT: handleCopyAsPlainText
//   PURPOSE: Put the selection (or whole document) on the clipboard as markup-free plain text — no HTML tags, no Markdown syntax.
//   INPUTS: { none - reads Muya selection state via getCopyData }
//   OUTPUTS: { Promise<void> - resolves after the clipboard write attempt }
//   SIDE_EFFECTS: Renders through the C-3 marked+DOMPurify pipeline, extracts textContent, and writes a single text/plain flavor via the native clipboard-manager plugin; failure warns with the anchored marker and notifies.
//   LINKS: C-12; C-3 handleCopyAsHtml (shared pipeline); commands/index.js edit.copy-as-plain-text
// END_CONTRACT: handleCopyAsPlainText
// START_BLOCK_COPY_AS_PLAIN_TEXT
const handleCopyAsPlainText = async () => {
  const ed = editor.value
  if (!ed) return
  const selectionData = ed.getCopyData()
  const hasSelection = !!(selectionData && selectionData.text)
  const text = hasSelection ? selectionData.text : ed.getMarkdown()
  if (!text) return
  const [{ default: marked }, { sanitize }, { EXPORT_DOMPURIFY_CONFIG }] =
    await Promise.all([
      import('muya/lib/parser/marked'),
      import('muya/lib/utils'),
      import('muya/lib/config')
    ])
  // Same render pipeline as Copy as HTML, then textContent: marked emits
  // newlines between block elements, so the extracted text keeps block
  // separation while every tag and Markdown marker disappears. Hard
  // breaks (<br>, incl. the literal <br/> muya stores in table cells)
  // must become newlines BEFORE parsing — textContent drops <br> and
  // would glue the surrounding words together.
  const html = sanitize(marked(text, ed.options), EXPORT_DOMPURIFY_CONFIG, false)
    .replace(/<br\b[^>]*>/gi, '\n')
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const plain = doc.body.textContent.replace(/\n{3,}/g, '\n\n').trim()
  if (!plain) return
  try {
    const { writeText } = await import('@tauri-apps/plugin-clipboard-manager')
    await writeText(plain)
  } catch (e) {
    console.warn(
      `[Editor][handleCopyAsPlainText][BLOCK_COPY_AS_PLAIN_TEXT] native writeText failed: ${e}`
    )
    notice.notify({ title: t('error.copyError'), type: 'warning' })
  }
}
// END_BLOCK_COPY_AS_PLAIN_TEXT

// START_CONTRACT: handleEditorContextMenu
//   PURPOSE: Replace WKWebView's default right-click menu with a full native menu: undo/redo (Muya history), cut/copy/paste/select-all roles, Copy as HTML, and Share.
//   INPUTS: { event: Event - the DOM contextmenu event Muya re-dispatches }
//   OUTPUTS: { Promise<void> - resolves after the native popup resolves and the clicked id is dispatched }
//   SIDE_EFFECTS: Suppresses the webview default menu; roles act via the responder chain; copyAsHtml writes the clipboard; share opens the native share sheet.
//   LINKS: C-10/C-11; muya eventHandler/clickEvent.js 'contextmenu' dispatch; mt::window-popup-context-menu (m009 roles); C-3 handleCopyAsHtml; mt_share_file
// END_CONTRACT: handleEditorContextMenu
// START_BLOCK_EDITOR_CONTEXT_MENU
const handleEditorContextMenu = async (event) => {
  if (!event || typeof event.preventDefault !== 'function') return
  event.preventDefault()
  const ed = editor.value
  if (!ed) return
  const pathname = currentFile.value && currentFile.value.pathname
  // C-11: cut/copy/paste are native roles — OS-localized labels, auto
  // enablement, and responder-chain behavior identical to the Edit
  // menu's native items. Undo/redo/selectAll stay custom: Muya owns
  // history (the app deliberately routes Cmd+Z away from the webview
  // undo), and Muya's selectAll is context-aware (a table selects the
  // table, a code block its content) unlike the native role, which
  // would always grab the whole document. Undo/redo are always enabled
  // — Muya no-ops an empty history. Share reuses the title-bar
  // mt_share_file path and only exists for saved files.
  const items = [
    { label: t('contextMenu.editor.undo'), id: 'undo' },
    { label: t('contextMenu.editor.redo'), id: 'redo' },
    { type: 'separator' },
    { role: 'cut' },
    { role: 'copy' },
    // Whole-document fallback lives inside handleCopyAsHtml (C-3).
    { label: t('contextMenu.editor.copyAsHtml'), id: 'copyAsHtml' },
    { label: t('contextMenu.editor.copyAsPlainText'), id: 'copyAsPlainText' },
    { role: 'paste' },
    { type: 'separator' },
    { label: t('contextMenu.editor.selectAll'), id: 'selectAll' }
  ]
  if (pathname) {
    items.push({ type: 'separator' }, { label: t('contextMenu.editor.share'), id: 'shareFile' })
  }
  let clickedId
  try {
    clickedId = await window.electron.ipcRenderer.invoke(
      'mt::window-popup-context-menu',
      { items, x: event.clientX, y: event.clientY }
    )
  } catch (e) {
    console.warn(
      `[Editor][handleEditorContextMenu][BLOCK_EDITOR_CONTEXT_MENU] popup failed: ${e}`
    )
    return
  }
  if (clickedId === 'undo') {
    ed.undo()
  } else if (clickedId === 'redo') {
    ed.redo()
  } else if (clickedId === 'selectAll') {
    ed.selectAll()
  } else if (clickedId === 'copyAsHtml') {
    await handleCopyAsHtml()
  } else if (clickedId === 'copyAsPlainText') {
    await handleCopyAsPlainText()
  } else if (clickedId === 'shareFile') {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('mt_share_file', { path: pathname })
    } catch (e) {
      console.warn(
        `[Editor][handleEditorContextMenu][BLOCK_EDITOR_CONTEXT_MENU] share failed: ${e}`
      )
    }
  }
}
// END_BLOCK_EDITOR_CONTEXT_MENU

const insertImage = (src) => {
  if (!sourceCode.value) {
    editor.value && editor.value.insertImage({ src })
  }
}

const handleSearch = ({ value, opt }) => {
  const searchMatches = editor.value.search(value, opt)
  editorStore.SEARCH(searchMatches)
  scrollToHighlight()
}

const handReplace = ({ value, opt }) => {
  const searchMatches = editor.value.replace(value, opt)
  editorStore.SEARCH(searchMatches)
}

const handleUploadedImage = (url, deletionUrl) => {
  insertImage(url)
  editorStore.SHOW_IMAGE_DELETION_URL(deletionUrl)
}

const scrollToCursor = (duration = 300) => {
  nextTick(() => {
    const { container } = editor.value
    if (!container) return
    const { y } = editor.value.getSelection().cursorCoords
    // The DOM selection may not yet be inside the freshly rendered document
    // (e.g. right after setMarkdown for a tab with no saved scrollTop), in
    // which case cursorCoords can report a stale/invalid y. Skip the
    // animation rather than scroll to a meaningless offset.
    if (!Number.isFinite(y)) return
    animatedScrollTo(container, container.scrollTop + y - STANDAR_Y, duration)
  })
}

// START_CONTRACT: scrollToCords
//   PURPOSE: Restore a saved editor scroll position without allowing delayed animation-frame scheduling to leave the document hidden.
//   INPUTS: { y: Number - saved scrollTop in CSS pixels }
//   OUTPUTS: { void }
//   SIDE_EFFECTS: May add temporary bottom padding, observes editor size, updates scrollTop, visibility, and pointer-events.
//   LINKS: docs/verification-plan.xml V-M-011 scenario-15; docs/knowledge-graph.xml M-011.fn-scrollToCords
// END_CONTRACT: scrollToCords
// START_BLOCK_FIRST_PAINT_SCROLL_RESTORE
const scrollToCords = (y) => {
  const { container } = editor.value
  // Depending on how much the user previously scrolled, sometimes the container has not fully rendered all elements.
  // Hence, container.scrollHeight < [saved scrollTop]
  // What we need to do is to temporarily add a padding to the container so that we can actually set the scrollTop without getting clamped.

  const maxScrollHeight = container.scrollHeight - container.clientHeight // max scroll height is actually calculated as such
  if (y > maxScrollHeight) {
    const editorId = container.firstElementChild
    editorId.style.paddingBottom = `${y - maxScrollHeight + 100}px` // 100px is the default ag-editor-id padding
    // attach a resize observer so we know when to remove the padding when it is of the "correct" height
    resizeObserverForEditor.observe(editorId)
  }

  // WKWebView may throttle requestAnimationFrame while a new window is
  // backgrounded. Reveal and position synchronously so the document can
  // never remain blank until the first keyboard/pointer event.
  container.scrollTop = y
  container.style.visibility = 'visible'
  container.style.pointerEvents = 'auto'
  console.debug(
    `[Editor][scrollToCords][BLOCK_SCROLL_RESTORED] scrollTop=${y} phase=sync`
  )

  // Re-apply once after layout settles; correctness no longer depends on it.
  requestAnimationFrame(() => {
    if (!container) return
    container.scrollTop = y
  })
}
// END_BLOCK_FIRST_PAINT_SCROLL_RESTORE

// START_CONTRACT: scrollToCordsAfterReload
//   PURPOSE: Restore scroll after a disk content reload by clamping the pre-edit scrollTop into the reloaded document's real scrollable range.
//   INPUTS: { y: Number - scrollTop saved before the external content change, tabId?: string - optional emitting tab id for immediate store sync }
//   OUTPUTS: { void }
//   SIDE_EFFECTS: Clears leftover first-paint padding, updates scrollTop, visibility, pointer-events, and the tab's saved scrollTop in the store, schedules one defensive re-clamp on the next animation frame.
//   LINKS: .grace/verification/runtime.xml V-M-011 scenario-29; .grace/graph/runtime.xml M-011 Interface fn-scrollToCordsAfterReload
// END_CONTRACT: scrollToCordsAfterReload
// START_BLOCK_RELOAD_SCROLL_CLAMPED
const scrollToCordsAfterReload = (y, tabId) => {
  const { container } = editor.value
  // The pre-edit scrollTop belongs to the OLD document. The reloaded document
  // can be shorter, so restoring it unclamped parks the viewport past the end
  // of the new content and reads as blank until the user scrolls. Leftover
  // first-paint padding from a previous same-document restore would inflate
  // scrollHeight and defeat the clamp, so drop it before measuring.
  const editorId = container.firstElementChild
  if (editorId && editorId.style.paddingBottom) {
    editorId.style.paddingBottom = ''
    resizeObserverForEditor.unobserve(editorId)
  }
  const maxScrollHeight = container.scrollHeight - container.clientHeight
  const clamped = Math.max(0, Math.min(y, maxScrollHeight))
  container.scrollTop = clamped
  container.style.visibility = 'visible'
  container.style.pointerEvents = 'auto'
  // Sync the tab's saved offset immediately: muya's scroll listener is
  // debounced (100ms) and never fires when the clamp equals the current
  // offset, so the store would keep the stale pre-edit value and hand it back
  // to a later same-document restore (tab switch away and back).
  if (tabId) editorStore.updateScrollPosition(tabId, clamped)
  console.debug(
    `[Editor][scrollToCordsAfterReload][BLOCK_RELOAD_SCROLL_CLAMPED] requested=${y} applied=${clamped}`
  )
  // The post-reload layout can still settle shorter (font metrics, collapsed
  // widgets). Keep the restored offset inside the valid range; never scroll
  // further down than the real content allows, and keep the store in step so
  // a later same-document restore cannot re-apply the pre-adjustment value.
  requestAnimationFrame(() => {
    const max = container.scrollHeight - container.clientHeight
    if (container.scrollTop > max) {
      const adjusted = Math.max(0, max)
      container.scrollTop = adjusted
      if (tabId) editorStore.updateScrollPosition(tabId, adjusted)
    }
  })
}
// END_BLOCK_RELOAD_SCROLL_CLAMPED

const scrollToHighlight = () => {
  return scrollToElement('.ag-highlight')
}

const scrollToHeader = (slug) => {
  if (!slug) return
  return scrollToElement(`#${slug}`)
}

const scrollToElement = (selector) => {
  // Scroll to search highlight word
  const { container } = editor.value
  let anchor
  try {
    anchor = document.querySelector(selector)
  } catch (e) {
    // Invalid CSS selector (e.g. '#' from an empty heading slug). See #4087.
    return
  }
  if (anchor) {
    const { y } = anchor.getBoundingClientRect()
    const DURATION = 300
    animatedScrollTo(container, container.scrollTop + y - STANDAR_Y, DURATION)
  }
}

const handleFindAction = (action) => {
  const searchMatches = editor.value.find(action)
  editorStore.SEARCH(searchMatches)
  scrollToHighlight()
}

const handleExport = async (options) => {
  const { type, header, footer, headerFooterStyled, htmlTitle } = options

  if (!/^pdf|print|styledHtml$/.test(type)) {
    throw new Error(`Invalid type to export: "${type}".`)
  }

  const extraCss = await getCssForOptions(options)
  const htmlToc = getHtmlToc(editor.value.getTOC(), options)

  switch (type) {
    case 'styledHtml': {
      try {
        const content = await editor.value.exportStyledHTML({
          title: htmlTitle || '',
          printOptimization: false,
          extraCss,
          toc: htmlToc
        })
        editorStore.EXPORT({ type, content })
      } catch (err) {
        log.error('Failed to export document:', err)
        notice.notify({
          title: t('editor.export.failed', { type: htmlTitle || 'html' }),
          type: 'error',
          message: err.message || t('editor.export.error')
        })
      }
      break
    }
    case 'pdf': {
      // C-18: page setup (size/orientation) is owned by the native print
      // panel; the export-settings margins still apply via @page CSS.
      try {
        const { pageSize, pageSizeWidth, pageSizeHeight, isLandscape } = options
        const pageOptions = {
          pageSize,
          pageSizeWidth,
          pageSizeHeight,
          isLandscape
        }

        const html = await editor.value.exportStyledHTML({
          title: '',
          printOptimization: true,
          extraCss,
          toc: htmlToc,
          header,
          footer,
          headerFooterStyled
        })
        printer.renderMarkdown(html, true)
        editorStore.EXPORT({ type, pageOptions })
      } catch (err) {
        log.error('Failed to export document:', err)
        notice.notify({
          title: t('editor.export.failed', { type: 'PDF' }),
          type: 'error',
          message: t('editor.export.errorExporting', { type: htmlTitle || 'PDF' })
        })
        handlePrintServiceClearup()
      }
      break
    }
    case 'print': {
      // NOTE: Print doesn't support page size or orientation.
      try {
        const html = await editor.value.exportStyledHTML({
          title: '',
          printOptimization: true,
          extraCss,
          toc: htmlToc,
          header,
          footer,
          headerFooterStyled
        })
        printer.renderMarkdown(html, true)
        // C-18: window.print() is silently ignored by WKWebView on macOS —
        // drive the native print panel from the backend instead. The print
        // container stays in the DOM (screen-invisible, print-only CSS)
        // until the next export replaces it; the modal can outlive this
        // function's return, so there is no eager clearup here.
        const { invoke } = await import('@tauri-apps/api/core')
        await invoke('mt_print_webview')
      } catch (err) {
        log.error('Failed to export document:', err)
        notice.notify({
          title: t('editor.print.failed'),
          type: 'error',
          message: t('editor.print.error', { title: htmlTitle || '' })
        })
        handlePrintServiceClearup()
      }
      break
    }
  }
}

const handlePrintServiceClearup = () => {
  printer.clearup()
}

const handleEditParagraph = (type) => {
  if (type === 'table') {
    tableChecker.rows = 4
    tableChecker.columns = 3
    dialogTableVisible.value = true
    nextTick(() => {
      rowInput.value.focus()
    })
  } else if (editor.value) {
    editor.value.updateParagraph(type)
  }
}

// handle `duplicate`, `delete`, `create paragraph below`
const handleParagraph = (type) => {
  if (editor.value) {
    switch (type) {
      case 'duplicate': {
        return editor.value.duplicate()
      }
      case 'createParagraph': {
        return editor.value.insertParagraph('after', '', true)
      }
      case 'deleteParagraph': {
        return editor.value.deleteParagraph()
      }
      default:
        console.error(`unknow paragraph edit type: ${type}`)
    }
  }
}

const handleInlineFormat = (type) => {
  editor.value && editor.value.format(type)
}

const handleDialogTableConfirm = () => {
  dialogTableVisible.value = false
  editor.value && editor.value.createTable(tableChecker)
}

// listen for `open-single-file` event, it will call this method only when open a new file.
const setMarkdownToEditor = ({ id, markdown: newMarkdown, cursor: newCursor }) => {
  if (id && currentFile.value?.id && id !== currentFile.value.id) {
    console.warn(`[Editor][setMarkdownToEditor][BLOCK_STALE_FILE_LOADED_IGNORED id=${id}]`)
    return
  }
  if (editor.value) {
    if (
      id &&
      currentFile.value?.id === id &&
      typeof newMarkdown === 'string' &&
      newMarkdown === currentFile.value.markdown
    ) {
      if (newCursor) editor.value.setCursor(newCursor)
      return
    }
    editor.value.clearHistory()
    if (newCursor) {
      editor.value.setMarkdown(newMarkdown, newCursor, true)
    } else {
      editor.value.setMarkdown(newMarkdown)
    }
    if (!isPreviewMode.value) {
      nextTick(() => editor.value?.focus())
    }
  }
}

// listen for markdown change form source mode or change tabs etc
const handleFileChange = ({
  id,
  markdown: newMarkdown,
  cursor: newCursor,
  renderCursor,
  history,
  scrollTop,
  muyaIndexCursor,
  contentReloaded = false,
  blocks = undefined
}) => {
  if (editor.value) {
    const activeFile = currentFile.value
    // A delayed tab/render event must not overwrite newer unsaved Muya
    // content. Legitimate tab switches and disk reloads update the store
    // before emitting file-changed, so their Markdown already matches.
    if (
      id &&
      activeFile?.id === id &&
      activeFile.isSaved === false &&
      typeof activeFile.markdown === 'string' &&
      typeof newMarkdown === 'string' &&
      activeFile.markdown !== newMarkdown
    ) {
      console.debug(
        `[Editor][handleFileChange][BLOCK_STALE_CHANGE_IGNORED] tab=${id}`
      )
      return
    }
    const { container } = editor.value
    if (history) {
      editor.value.setHistory(history)
    }

    if (typeof newMarkdown === 'string') {
      const sameDocument = id && activeFile?.id === id && newMarkdown === activeFile.markdown
      if (sameDocument && newCursor && renderCursor !== true && !history && !blocks && !muyaIndexCursor) {
        editor.value.setCursor(newCursor)
      } else {
        editor.value.setMarkdown(newMarkdown, newCursor, renderCursor, muyaIndexCursor, blocks)
      }
    } else if (newCursor) {
      editor.value.setCursor(newCursor)
    }

    if (typeof scrollTop === 'number') {
      // A disk content reload renders a NEW document: the pre-edit scrollTop
      // must be clamped into the new scrollable range. Same-document restores
      // (boot, tab switch back) keep the padding-preserving scrollToCords.
      if (contentReloaded) {
        scrollToCordsAfterReload(scrollTop, id || activeFile?.id)
      } else {
        scrollToCords(scrollTop)
      }
    } else {
      container.style.visibility = 'visible'
      container.style.pointerEvents = 'auto'
      // Tabs with no saved scroll position (new/agent-opened documents) must
      // not inherit the previously active tab's scrollTop: a shorter document
      // would then sit scrolled out of view and read as blank until the user
      // manually scrolls and the browser clamps scrollTop back into range.
      container.scrollTop = 0
      scrollToCursor(0)
    }
  }
}

// START_CONTRACT: hydrateMountedDocument
//   PURPOSE: Render the selected tab when its open event arrived before the editor component subscribed to the event bus during parallel boot.
//   INPUTS: { none - reads the active editor tab }
//   OUTPUTS: { void - Muya surface is synchronized with the active tab }
//   SIDE_EFFECTS: Calls Muya history/markdown/cursor APIs and reveals the editor container.
//   LINKS: docs/verification-plan.xml V-M-011 scenario-17; docs/knowledge-graph.xml M-011.fn-hydrateMountedDocument
// END_CONTRACT: hydrateMountedDocument
// START_BLOCK_BOOT_DOCUMENT_HYDRATION
const hydrateMountedDocument = () => {
  const file = currentFile.value
  if (
    !editor.value ||
    typeof editor.value.setMarkdown !== 'function' ||
    !file ||
    typeof file.markdown !== 'string'
  ) return

  handleFileChange({
    id: file.id,
    markdown: file.markdown,
    cursor: file.cursor,
    renderCursor: true,
    history: file.history,
    scrollTop: file.scrollTop,
    muyaIndexCursor: file.muyaIndexCursor,
    blocks: file.blocks
  })
  console.debug(
    `[Editor][hydrateMountedDocument][BLOCK_BOOT_DOCUMENT_HYDRATED] tab=${file.id || '<untitled>'}`
  )
}
// END_BLOCK_BOOT_DOCUMENT_HYDRATION

const handleInsertParagraph = (location) => {
  editor.value && editor.value.insertParagraph(location)
}

// START_BLOCK_EXT_TEXT_OPS

/**
 * Handle extension text.insert: insert text at cursor position.
 * Emitted by textOps.js via bus when the backend receives
 * mt_ext_text_insert from an extension.
 *
 * Strategy: insert a new paragraph after the current cursor with the
 * provided markdown content. Muya's insertParagraph('after', text, true)
 * inserts a block after the currently focused block.
 */
const handleExtTextInsert = ({ text }) => {
  if (!editor.value || typeof text !== 'string') return
  try {
    editor.value.insertParagraph('after', text, true)
    // eslint-disable-next-line no-console
    console.log(`[Editor][BLOCK_EXT_TEXT_INSERT_OK len=${text.length}]`)
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[Editor][BLOCK_EXT_TEXT_INSERT_FAILED]', err)
  }
}

/**
 * Handle extension text.transform: replace current selection with new text.
 * Emitted by textOps.js via bus when the backend receives
 * mt_ext_text_transform from an extension.
 *
 * Strategy: get the current selection, use Muya's replace mechanism to
 * substitute the selected text. If nothing is selected, insert at cursor.
 */
const handleExtTextTransform = ({ text }) => {
  if (!editor.value || typeof text !== 'string') return
  try {
    const selection = editor.value.getSelection()
    if (selection && selection.selectedText) {
      const searchMatches = editor.value.replace(
        { value: text, opt: { isSingle: true } }
      )
      if (searchMatches === undefined) {
        editor.value.insertParagraph('after', text, true)
      }
    } else {
      // No selection — replace entire document (Edit Agent sends full markdown).
      editor.value.setMarkdown(text)
    }
    // eslint-disable-next-line no-console
    console.log(`[Editor][BLOCK_EXT_TEXT_TRANSFORM_OK len=${text.length} hadSelection=${!!(selection && selection.selectedText)}]`)
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[Editor][BLOCK_EXT_TEXT_TRANSFORM_FAILED]', err)
  }
}

/**
 * Handle undo request from an extension.
 * E1a: triggered by TokMo EditAgent "Марк, отмена" command.
 */
const handleExtUndo = ({ extensionId }) => {
  if (!editor.value) return
  try {
    editor.value.contentState.undo()
    // eslint-disable-next-line no-console
    console.log(`[Editor][BLOCK_EXT_UNDO_OK ext=${extensionId}]`)
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[Editor][BLOCK_EXT_UNDO_FAILED]', err)
  }
}

let docLintTimer = null
let tocActiveTimer = null

// START_BLOCK_TOC_ACTIVE_HEADING
// Find the last heading whose top is at/above the viewport's upper
// quarter and publish its slug for the TOC highlight (C-19).
const emitActiveHeading = () => {
  const container = editor.value?.container
  if (!container) return
  const headingEls = container.querySelectorAll('[data-head]')
  if (headingEls.length === 0) return
  const threshold = container.getBoundingClientRect().top + 80
  let active = null
  for (const el of headingEls) {
    if (el.getBoundingClientRect().top <= threshold) active = el
    else break
  }
  // Scrollspy edge: at the very bottom of the document the last section's
  // heading may never cross the threshold (short trailing content) —
  // pin the last heading instead so the highlight reaches the final
  // section.
  if (!active) {
    // Above the first heading (front matter / preamble): no highlight —
    // NOT the last heading.
    bus.emit('toc-active-heading', null)
    return
  }
  if (container.scrollTop + container.clientHeight >= container.scrollHeight - 2) {
    active = headingEls[headingEls.length - 1]
  }
  bus.emit('toc-active-heading', active.id)
}
// END_BLOCK_TOC_ACTIVE_HEADING

// START_BLOCK_DEADLINK_EMIT
// C-21: validate the snapshot's link destinations off the same debounce
// as the lint emit; a newer snapshot always wins.
let linkCheckSeq = 0
const runLinkCheck = async ({ markdown, pathname }) => {
  const seq = ++linkCheckSeq
  const statFn = pathname
    ? async (p) => {
        try {
          const s = await window.fileUtils.stat(p)
          return !!(s.isFile ?? s.is_file)
        } catch {
          return false
        }
      }
    : null
  const fileDir = pathname ? window.path.dirname(pathname) : ''
  const issues = await checkMarkdownLinks(markdown, { statFn, fileDir })
  if (seq !== linkCheckSeq) return
  bus.emit('doc-deadlinks', { issues })
}
// END_BLOCK_DEADLINK_EMIT

// START_CONTRACT: handleFormatDocument
//   PURPOSE: Canonicalize the active document (C-17 Format document) — trailing whitespace, blank-line structure, setext→ATX, heading-cascade demotion.
//   INPUTS: { none - reads the active Muya document }
//   OUTPUTS: { void }
//   SIDE_EFFECTS: Replaces the document via setMarkdown when the formatter produced changes; one muya undo step restores the original (the cursor-setter history push).
//   LINKS: .grace/verification/runtime.xml V-M-011 scenario-30; .grace/graph/runtime.xml M-011 Interface fn-handleFormatDocument
// END_CONTRACT: handleFormatDocument
// START_BLOCK_FORMAT_DOCUMENT_COMMAND
const handleFormatDocument = () => {
  if (!editor.value) return
  const markdown = editor.value.getMarkdown()
  const formatted = formatMarkdown(markdown)
  if (formatted === null) {
    // Already canonical — no history churn, no re-render.
    console.debug('[Editor][handleFormatDocument][BLOCK_FORMAT_DOCUMENT_NOOP]')
    return
  }
  // setMarkdown lands a fresh history entry (cursor-setter push), so a
  // single undo restores the pre-format document.
  editor.value.setMarkdown(formatted, null, false)
  console.debug('[Editor][handleFormatDocument][BLOCK_FORMAT_DOCUMENT_APPLIED]')
}
// END_BLOCK_FORMAT_DOCUMENT_COMMAND

/**
 * Handle context request from the backend.
 * E1a: the TokMo EditAgent asked for the current editor state via
 * POST /ext/context. Gather Muya state and emit the response back
 * to the backend so it can forward to TokMo.
 */
const handleExtContextRequest = async ({ requestId }) => {
  if (!editor.value || !requestId) return
  try {
    const markdown = editor.value.getMarkdown?.() || ''
    const selectionData = editor.value.getSelection?.() || {}
    const filePath = currentFile.value?.pathname || null

    const cursor = selectionData.cursorCoords
      ? { line: selectionData.cursorCoords.y || 0, ch: 0 }
      : null

    const selection = selectionData.selectedText
      ? { text: selectionData.selectedText, start: null, end: null }
      : null

    const { emit: tauriEmit } = await import('@tauri-apps/api/event')
    await tauriEmit('mt::ext::context_response', {
      request_id: requestId,
      context: { markdown, cursor, selection, file_path: filePath }
    })

    // eslint-disable-next-line no-console
    console.log(`[Editor][BLOCK_EXT_CONTEXT_RESPONSE_OK request_id=${requestId} md_len=${markdown.length}]`)
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[Editor][BLOCK_EXT_CONTEXT_RESPONSE_FAILED]', err)
  }
}

// END_BLOCK_EXT_TEXT_OPS

const blurEditor = () => {
  editor.value.blur(false, true)
}

const focusEditor = () => {
  editor.value.focus()
}

const handleScreenShot = () => {
  if (editor.value) {
    document.execCommand('paste')
  }
}

const handleResetPaddingBottom = () => {
  const { container } = editor.value
  const editorId = container.firstElementChild
  const newScollableHeightWithoutPadding =
    container.scrollHeight -
    container.clientHeight -
    parseFloat(editorId.style.paddingBottom)

  if (newScollableHeightWithoutPadding > currentFile.value.scrollTop) {
    // The padding lives on #ag-editor-id (set by scrollToCords), not on the
    // scroll container — clearing the container's own style (the upstream
    // Mark Text bug) left the phantom padding in place forever, inflating
    // every later scrollHeight measurement.
    editorId.style.paddingBottom = ''
    resizeObserverForEditor.unobserve(editorId) // unobserve #ag-editor-id since we have removed the padding
  }
}
const resizeObserverForEditor = new ResizeObserver(handleResetPaddingBottom)

onMounted(() => {
  printer = new Printer()
  const ele = editorRef.value

  // use muya UI plugins
  Muya.use(TablePicker)
  Muya.use(QuickInsert)
  Muya.use(CodePicker)
  Muya.use(EmojiPicker)
  Muya.use(ImagePathPicker)
  Muya.use(LinkPathPicker)
  Muya.use(ImageSelector, {
    // step-8c: process.env.UNSPLASH_ACCESS_KEY → import.meta.env.VITE_UNSPLASH_ACCESS_KEY.
    // Vite requires VITE_-prefixed names to expose env vars to client code at
    // build time. CI / packagers should set VITE_UNSPLASH_ACCESS_KEY before
    // running `npm run build`; absence yields undefined here, which the
    // ImageSelector plugin already tolerates (Unsplash search disabled).
    unsplashAccessKey: import.meta.env.VITE_UNSPLASH_ACCESS_KEY,
    photoCreatorClick
  })
  Muya.use(Transformer)
  Muya.use(ImageToolbar)
  Muya.use(FormatPicker)
  Muya.use(FrontMenu)
  Muya.use(LinkTools, {
    jumpClick
  })
  Muya.use(FootnoteTool)
  Muya.use(TableBarTools)

  const options = {
    focusMode: focus.value,
    markdown: props.markdown,
    preferLooseListItem: preferLooseListItem.value,
    autoPairBracket: autoPairBracket.value,
    autoPairMarkdownSyntax: autoPairMarkdownSyntax.value,
    trimUnnecessaryCodeBlockEmptyLines: trimUnnecessaryCodeBlockEmptyLines.value,
    autoPairQuote: autoPairQuote.value,
    bulletListMarker: bulletListMarker.value,
    orderListDelimiter: orderListDelimiter.value,
    tabSize: tabSize.value,
    fontSize: fontSize.value,
    lineHeight: lineHeight.value,
    codeBlockLineNumbers: codeBlockLineNumbers.value,
    listIndentation: listIndentation.value,
    frontmatterType: frontmatterType.value,
    superSubScript: superSubScript.value,
    footnote: footnote.value,
    math: mathEnabled.value,
    disableHtml: !isHtmlEnabled.value,
    isGitlabCompatibilityEnabled: isGitlabCompatibilityEnabled.value,
    hideQuickInsertHint: hideQuickInsertHint.value,
    hideLinkPopup: hideLinkPopup.value,
    autoCheck: autoCheck.value,
    sequenceTheme: sequenceTheme.value,
    spellcheckEnabled: spellcheckerEnabled.value,
    imageAction,
    imagePathPicker,
    clipboardFilePath: guessClipboardFilePath,
    imagePathAutoComplete,
    filePathAutoComplete,
    t // 添加翻译函数
  }

  if (/dark/i.test(theme.value)) {
    Object.assign(options, {
      mermaidTheme: 'dark',
      vegaTheme: 'dark'
    })
  } else {
    Object.assign(options, {
      mermaidTheme: 'default',
      vegaTheme: 'latimes'
    })
  }

  editor.value = new Muya(ele, options)

  // Muya replaces the Vue ref node, so apply preview/editable state to the
  // actual replacement surface after construction. Normal editing also gets
  // an initial focused selection, making the caret visible on first paint.
  syncPreviewSurface(isPreviewMode.value, !isPreviewMode.value)

  const { container } = editor.value

  // Listen for language changes and update Muya's translation function
  bus.on('language-changed', () => {
    if (editor.value) {
      editor.value.setOptions({ t })
    }
  })

  // Create spell check wrapper and enable spell checking if preferred.
  spellchecker = new SpellChecker(spellcheckerEnabled.value, spellcheckerLanguage.value)

  // Register command palette entry for switching spellchecker language.
  switchLanguageCommand = new SpellcheckerLanguageCommand(spellchecker)
  setTimeout(() => bus.emit('cmd::register-command', switchLanguageCommand), 100)

  if (typewriter.value) {
    scrollToCursor()
  }

  // listen for bus events.
  bus.on('file-loaded', setMarkdownToEditor)
  bus.on('invalidate-image-cache', handleInvalidateImageCache)
  bus.on('undo', handleUndo)
  bus.on('redo', handleRedo)
  bus.on('selectAll', handleSelectAll)
  bus.on('export', handleExport)
  bus.on('paragraph', handleEditParagraph)
  bus.on('format', handleInlineFormat)
  bus.on('searchValue', handleSearch)
  bus.on('replaceValue', handReplace)
  bus.on('find-action', handleFindAction)
  bus.on('insert-image', insertImage)
  bus.on('image-uploaded', handleUploadedImage)
  bus.on('file-changed', handleFileChange)
  bus.on('editor-blur', blurEditor)
  bus.on('editor-focus', focusEditor)
  bus.on('copyAsRich', handleCopyPaste)
  bus.on('copyAsHtml', handleCopyPaste)
  bus.on('pasteAsPlainText', handleCopyPaste)
  bus.on('copyAsHtmlRich', handleCopyAsHtml)
  bus.on('copyAsPlainText', handleCopyAsPlainText)
  bus.on('duplicate', handleParagraph)
  bus.on('createParagraph', handleParagraph)
  bus.on('deleteParagraph', handleParagraph)
  bus.on('insertParagraph', handleInsertParagraph)
  bus.on('scroll-to-header', scrollToHeader)
  bus.on('screenshot-captured', handleScreenShot)
  bus.on('switch-spellchecker-language', switchSpellcheckLanguage)
  bus.on('open-command-spellchecker-switch-language', openSpellcheckerLanguageCommand)
  bus.on('replace-misspelling', replaceMisspelling)
  bus.on('ext-text-insert', handleExtTextInsert)
  bus.on('ext-text-transform', handleExtTextTransform)
  bus.on('ext-undo', handleExtUndo)
  bus.on('ext-context-request', handleExtContextRequest)
  bus.on('formatDocument', handleFormatDocument)

  // The pending-open drain runs in parallel with Vue mount. If an agent or
  // Finder event selected a tab before this component subscribed, replay the
  // active tab once so the first paint cannot be an empty white surface.
  hydrateMountedDocument()

  editor.value.on('change', (changes) => {
    // There is a chance that this event is fired AFTER the tab is switched. If we purely rely on this.currentFile later on
    // it can cause invalid updates. Hence, we need the id to identify changes as part of each tab
    const { id } = currentFile.value
    if (id) {
      editorStore.LISTEN_FOR_CONTENT_CHANGE(
        Object.assign(changes, { id, blocks: editor.value.contentState.getBlocks() })
      )
      // C-17: feed the problems panel (debounced — typing must not lint
      // on every keystroke). Snapshot {id, markdown} at event time so the
      // timer can never emit another tab's document.
      const lintSnapshot = { id, markdown: changes.markdown, pathname: currentFile.value.pathname }
      if (docLintTimer) clearTimeout(docLintTimer)
      // C-19: edits can move headings without scrolling — re-arm the
      // scrollspy so the TOC highlight follows editing too.
      if (tocActiveTimer) clearTimeout(tocActiveTimer)
      tocActiveTimer = setTimeout(emitActiveHeading, 200)
      docLintTimer = setTimeout(() => {
        bus.emit('doc-markdown-changed', lintSnapshot)
        // C-21: async dead-link check rides the same debounce; only the
        // active tab's snapshot is checked (stale results dropped by seq).
        runLinkCheck(lintSnapshot)
      }, 500)
    }
  })

  editor.value.on('scroll', (scrollEvent) => {
    editorStore.updateScrollPosition(currentFile.value.id, scrollEvent.scrollTop)
    // C-19: track the heading the viewport is in (debounced — scroll
    // events fire at frame rate) and tell the TOC to highlight it.
    if (tocActiveTimer) clearTimeout(tocActiveTimer)
    tocActiveTimer = setTimeout(emitActiveHeading, 200)
  })

  editor.value.on('heading-copy-link', ({ key }) => {
    editorStore.copyGithubSlug(key)
  })

  editor.value.on('format-click', ({ event, formatType, data }) => {
    const ctrlOrMeta = (isOsx && event.metaKey) || (!isOsx && event.ctrlKey)
    if (formatType === 'link' && ctrlOrMeta) {
      editorStore.FORMAT_LINK_CLICK({ data, dirname: window.DIRNAME })
    } else if (formatType === 'image' && ctrlOrMeta) {
      if (imageViewer) {
        imageViewer.destroy()
      }

      // Disabled due to #2120.
      // imageViewer = new ViewImage(imageViewerRef.value, {
      //   url: data,
      //   snapView: true
      // })

      setImageViewerVisible(true)
    }
  })

  // Disabled due to #2120.
  // editor.value.on('preview-image', ({ data }) => {
  //   if (imageViewer) {
  //     imageViewer.destroy()
  //   }
  //
  //   imageViewer = new ViewImage(imageViewerRef.value, {
  //     url: data,
  //     snapView: true
  //   })
  //
  //   setImageViewerVisible(true)
  // })

  editor.value.on('selectionChange', (changes) => {
    const { y } = changes.cursorCoords
    if (typewriter.value) {
      const startPosition = container.scrollTop
      const toPosition = startPosition + y - STANDAR_Y

      // Prevent micro shakes and unnecessary scrolling.
      if (Math.abs(startPosition - toPosition) > 2) {
        animatedScrollTo(container, toPosition, 100)
      }
    }

    // Used to fix #628: auto scroll cursor to visible if the cursor is too low.
    if (container.clientHeight - y < 100) {
      // editableHeight is the lowest cursor position(till to top) that editor allowed.
      const editableHeight = container.clientHeight - 100
      animatedScrollTo(container, container.scrollTop + (y - editableHeight), 0)
    }

    selectionChange.value = changes
    editorStore.SELECTION_CHANGE(changes)
  })

  editor.value.on('selectionFormats', (formats) => {
    editorStore.SELECTION_FORMATS(formats)
  })

  // C-10: Muya re-dispatches the DOM contextmenu event; subscribing here
  // lets us preventDefault (suppressing WKWebView's default menu) and show
  // the app's native context menu instead.
  editor.value.on('contextmenu', handleEditorContextMenu)

  document.addEventListener('keyup', keyup)

  setWrapCodeBlocks(wrapCodeBlocks.value)
  setEditorWidth(editorLineWidth.value)
})

onBeforeUnmount(() => {
  bus.off('file-loaded', setMarkdownToEditor)
  bus.off('invalidate-image-cache', handleInvalidateImageCache)
  bus.off('undo', handleUndo)
  bus.off('redo', handleRedo)
  bus.off('selectAll', handleSelectAll)
  bus.off('export', handleExport)
  bus.off('paragraph', handleEditParagraph)
  bus.off('format', handleInlineFormat)
  bus.off('searchValue', handleSearch)
  bus.off('replaceValue', handReplace)
  bus.off('find-action', handleFindAction)
  bus.off('insert-image', insertImage)
  bus.off('image-uploaded', handleUploadedImage)
  bus.off('file-changed', handleFileChange)
  bus.off('editor-blur', blurEditor)
  bus.off('editor-focus', focusEditor)
  bus.off('copyAsRich', handleCopyPaste)
  bus.off('copyAsHtml', handleCopyPaste)
  bus.off('pasteAsPlainText', handleCopyPaste)
  bus.off('copyAsHtmlRich', handleCopyAsHtml)
  bus.off('copyAsPlainText', handleCopyAsPlainText)
  bus.off('duplicate', handleParagraph)
  bus.off('createParagraph', handleParagraph)
  bus.off('deleteParagraph', handleParagraph)
  bus.off('insertParagraph', handleInsertParagraph)
  bus.off('scroll-to-header', scrollToHeader)
  bus.off('screenshot-captured', handleScreenShot)
  bus.off('switch-spellchecker-language', switchSpellcheckLanguage)
  bus.off('open-command-spellchecker-switch-language', openSpellcheckerLanguageCommand)
  bus.off('replace-misspelling', replaceMisspelling)
  bus.off('ext-text-insert', handleExtTextInsert)
  bus.off('ext-text-transform', handleExtTextTransform)
  bus.off('ext-undo', handleExtUndo)
  bus.off('ext-context-request', handleExtContextRequest)
  bus.off('formatDocument', handleFormatDocument)
  if (docLintTimer) clearTimeout(docLintTimer)
  if (tocActiveTimer) clearTimeout(tocActiveTimer)

  document.removeEventListener('keyup', keyup)
  editor.value.off('change')
  editor.value.off('scroll')

  resizeObserverForEditor.disconnect()

  if (editor.value) {
    editor.value.destroy()
    editor.value = null
  }
})
</script>

<style>
/* ... existing style ... */
.editor-wrapper {
  height: 100%;
  position: relative;
  flex: 1;
  color: var(--editorColor);
  & .ag-dialog-table {
    & .el-button {
      font-size: 13px;
      width: 70px;
    }
  }
}

.editor-wrapper.source {
  position: absolute;
  z-index: -1;
  top: 0;
  left: 0;
  overflow: hidden;
}

.editor-component {
  height: 100%;
  overflow: auto;
  box-sizing: border-box;
  cursor: default;
  overflow-anchor: none !important;
  background: var(--editorBgColor);
  color: var(--editorColor);
}

/* M-022 mt-preview-mode: read-only visual treatment.
 * - caret-color:transparent hides the blinking cursor that contenteditable
 *   would otherwise show on focus.
 * - pointer-events:auto preserved so the mousedown handler still fires.
 * - Editing surface keeps contenteditable=false (set via the template
 *   attribute) so muya's typed-input pipeline can't mutate the document
 *   while in preview.
 */
.is-preview .editor-component {
  caret-color: transparent;
  pointer-events: auto;
}

.typewriter .editor-component {
  padding-top: calc(50vh - 136px);
  padding-bottom: calc(50vh - 54px);
}

.image-viewer {
  position: fixed;
  backdrop-filter: blur(5px);
  top: 0;
  right: 0;
  left: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.8);
  z-index: 11;
  & .icon-close {
    z-index: 1000;
    width: 30px;
    height: 30px;
    position: absolute;
    top: 50px;
    left: 50px;
    display: block;
    & svg {
      fill: #efefef;
      width: 100%;
      height: 100%;
    }
  }
}

.iv-container {
  width: 100%;
  height: 100%;
}

.iv-snap-view {
  opacity: 1;
  bottom: 20px;
  right: 20px;
  top: auto;
  left: auto;
}
</style>
