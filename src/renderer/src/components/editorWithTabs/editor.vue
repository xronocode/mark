<template>
  <div
    class="editor-wrapper"
    :class="[
      { typewriter: typewriter, focus: focus, source: sourceCode && !mirror },
      { 'is-preview': isPreviewMode, 'is-mirror': mirror }
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
      @keydown.capture="handleEditorSurfaceKeydown"
      @click.capture="handleMirrorGuard"
      @paste.capture="handleMirrorGuard"
      @drop.capture="handleMirrorGuard"
  >
    <div
      ref="editorRef"
      class="editor-component"
      :contenteditable="isReadOnlySurface ? 'false' : 'true'"
    ></div>
    <div v-show="imageViewerVisible" class="image-viewer">
      <span class="icon-close" @click="setImageViewerVisible(false)">
        <chrome-icon name="close" :size="16" aria-hidden="true" />
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
// VERSION: 1.30.0
// START_MODULE_CONTRACT
//   PURPOSE: Host the Muya WYSIWYG surface and coordinate document rendering, selection, scroll, preview, editor tools, and store/bus integration.
//   SCOPE: Renderer-side Muya lifecycle and UI orchestration, including active/rendered document ownership, missed-activation recovery and invalidating tab block caches after a footnote grammar change; does not own Markdown parsing rules or backend file persistence.
//   DEPENDS: Muya, Pinia preferences/editor/project/layout stores, bus, renderer services/utilities, window.electron compatibility facade, @tauri-apps/plugin-clipboard-manager (writeHtml + writeImage), @tauri-apps/plugin-dialog (save), muya/lib/utils/diagramExport (C-56 picture export + image-copy helpers), muya/lib/utils/getImageInfo (C-56 T-006 DOM image info), window.__markImageLoader (the existing read-binary bridge, C-56 T-006), util/tableLayoutStore (C-65 per-file table layout persistence).
//   LINKS: .grace/graph/runtime.xml M-011.fn-reconcileActiveDocument and M-012; .grace/verification/runtime.xml V-M-011 scenario-68 and V-M-012; .grace/changes/archive/C-56 (diagram export, embedded-image copy); .grace/changes/archive/C-65 T-001 (the table layout prefs host wiring).
//   ROLE: RUNTIME
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   setMarkdownToEditor - Loads only the selected document; equal store text may skip rendering only when Muya already belongs to that tab.
//   renderedTabId - Identity of the successfully rendered Muya buffer, independent of active-tab selection.
//   handleFileChange - Restores only the active tab's document, cursor, history and scroll; tracks the owner of successfully rendered content.
//   reconcileActiveDocument - Restores the selected tab after a missed activation event, without duplicating a successful synchronous render.
//   scrollToCords - Restores saved scrollTop without leaving the editor hidden behind a delayed animation frame.
//   scrollToCordsAfterReload - Clamps the pre-edit scrollTop into a reloaded document's real scrollable range (no phantom padding, no blank viewport).
//   syncPreviewSurface - Mirrors previewMode onto Muya's real replacement container and restores caret focus on exit.
//   imageAction - Applies configured local/upload image insertion behavior; with the relative preference on a saved document it writes straight into the relative folder (C-24).
//   handleDropImage - Inserts an image dropped from Finder (mt::drop-image) at the cursor through imageAction (C-24 R-4).
//   handleExport - Routes supported export formats to renderer services; C-61 splits print (direct native panel, remembered options) from pdf (settings → save dialog → mt_export_pdf, container cleared on every outcome).
//   handleCopyAsHtml - Copies selection (or whole document) to the clipboard as rich text/html (C-3).
//   copyRenderedAsPlainText - Shared C-12/C-32 render → convert → single text/plain write pipeline.
//   diffGuarded - M-031: document-mutating bus handlers become no-ops while the diff view replaces the editing surface.
//   handleCopyAsPlainText - Copies selection (or whole document) as markup-free plain text (C-12).
//   handleCopyAsStructuredText - Copies selection (or whole document) as plain text that keeps paragraphs, bullets, link targets and table rows (C-32).
//   handleCopyAsMarkdown - Copies selection (or whole document) as raw Markdown text (C-40 T-004).
//   handleDiagramExportAction - C-56 picture export transport: a rendered Pele diagram / Vega-Lite chart block leaves Mark as a 2× PNG on the clipboard (writeImage) or a PNG/SVG file (save dialog + fs write); owns the toast and failure notices.
//   handleImageCopyAction - C-56 T-006 embedded-image copy transport: an already-inserted ![](…) image goes back on the clipboard as a picture — local files through the existing read-binary bridge, remotes via fetch, PNG bytes as-is, other formats re-encoded on a canvas; serves the muya image toolbar button and the editor context-menu item.
//   handleEditorSurfaceKeydown - FIX-005/FIX-006 wrapper keydown entry: runs the paragraph shortcut wave, then the preview Cmd+\ chord.
//   handleParagraphShortcutKeys - FIX-005/FIX-006: physical-code chords inside the WYSIWYG surface — ⇧⌘D duplicate, ⇧⌘N new paragraph, ⇧⌘⌫ delete paragraph, ⌘1–6 heading levels (visual-regression-plan 13C; ⇧⌘P stays reserved for UC-025 Command Palette).
//   handlePreviewKeydown - Cmd+\ preview-aware sidebar toggle (V-M-022 E-05 keeps other keys from exiting preview).
//   syncMirrorFromSource - C-29 Split View: debounced read-only re-render of the muya pane from the source pane; never writes to the store.
//   handleMirrorGuard - C-29: blocks checkbox clicks, paste and drop on the read-only mirror pane.
//   handleEditorContextMenu - Native right-click menu: undo/redo, cut/copy/paste/select-all roles, Copy as HTML / Plain Text / Structured Text, the C-56 Copy as Image / Save as PNG… / Save as SVG… items (diagram/chart blocks only), Share (C-10/C-11/C-12/C-32/C-56).
//   Muya options wiring - disableTableColumnResize is set from the mirror prop: the read-only Split View mirror pane gets no column-resize handles (C-39 T-002); reading/locked tabs keep them.
//   handleTableLayoutsChange - C-65 T-001: muya-table-layouts dispatches (fired by muya only after a real resize / reset / Full width toggle) are saved under the active tab's pathname through util/tableLayoutStore; the mirror never persists and untitled tabs never persist.
//   applyStoredTableLayouts - C-65 T-001: load the active file's persisted table layouts (prune + cap inside the store util) and hand them to muya.tableResize.applyPersistedLayouts; sequenced per tab so a slow load cannot land on a switched document.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.30.0 - 2026-10-20 FIX-005/FIX-006: the desktop
//   paragraph shortcuts are wired through a capture keydown on the
//   editor wrapper (handleEditorSurfaceKeydown →
//   handleParagraphShortcutKeys): ⇧⌘D duplicate, ⇧⌘N new paragraph,
//   ⇧⌘⌫ delete paragraph and ⌘1–6 → Heading 1–6, matched by physical
//   key code so Russian layouts work; scoped to the WYSIWYG surface and
//   suppressed on read-only surfaces, the locked tab and the fullscreen
//   viewer. ⇧⌘P is no longer displayed for duplicate (UC-025 keeps it
//   reserved for the Command Palette).
//   PREV: v1.29.0 - C-TAB-CLOSE-OWNERSHIP: reject other-tab renders, track the displayed document owner, recover missed activation and prevent stale-surface changes/scroll from reaching a different tab.
//   PREV: v1.28.1 - 2026-10-19 fix: a fresh open whose content the store already holds still applies the stored table layouts (the early return skipped them).
//   - 2026-10-18 v1.28.0: C-65 T-001 — persistent table column widths and
//     the per-table Full width mode. applyStoredTableLayouts runs after
//     every document load (file-loaded / file-changed): the store util
//     loads the file's profile entry (pruning files that no longer exist
//     and capping the store) and muya.tableResize.applyPersistedLayouts
//     adopts it into the fresh block keys. handleTableLayoutsChange saves
//     the muya-table-layouts dispatches (only muya fires them, only after
//     a real user action) under the active pathname. A sequence counter
//     drops loads that resolve after the tab switched; the mirror and
//     untitled tabs opt out entirely.
//   - 2026-10-18 v1.27.0: C-56 T-006 — Copy image for embedded Markdown
//     images. handleImageCopyAction({ imageInfo }) is the single transport:
//     resolveImageCopySource classifies the raw Markdown src (local
//     path/file:///asset:// resolved against the document, remote http(s),
//     data:); local bytes come through the EXISTING read-binary bridge
//     (window.__markImageLoader → mt::fs::read_binary — no new fs scope),
//     remotes via fetch; imageCopyPngBytes passes real PNG bytes through
//     and re-encodes JPEG/WebP/GIF/SVG on a canvas at natural size; the
//     clipboard write reuses T-002's writeImage capability and the
//     «Copied»/«Could not copy the image» notices. Entry points: the muya
//     image toolbar's new Copy-image button (muya-image-copy event) and a
//     Copy Image item in the editor context menu (only when the
//     right-click target is an img inside a muya image wrapper).
//   - 2026-10-18 v1.26.1: C-56 T-005 — doc only, no code change: the
//     muya-diagram-export event gained a third producer (the diagram
//     corner pill's Copy-as-image button dispatches { action:
//     'copyImage', element: FIGURE } from muya clickEvent
//     START_BLOCK_TOOLBAR_CLICK); this handler already serves it
//     unchanged.
//   - 2026-10-18 v1.26.0: C-56 — per-block diagram/chart picture export.
//     handleDiagramExportAction({ action, element }) is the single
//     transport (clipboard writeImage of the 2× PNG, save dialog + binary
//     fs write for PNG/SVG) behind BOTH entry points: the editor context
//     menu (three new items below the copy items, present only when the
//     right-click target is inside a MERMAID/VEGA-LITE figure — corner-3 —
//     and disabled when the block never rendered — corner-4) and the
//     fullscreen block viewer toolbar (muya-diagram-export event carries
//     the LIVE source, so the viewer's zoom/pan never leaks — corner-2).
//     The standalone SVG itself is built by the new muya util
//     diagramExport.js; capabilities gain exactly one permission
//     (clipboard-manager:allow-write-image) in default.json and mas.json.
//   - 2026-10-18 v1.25.0: C-61 — handleExport splits Print from Export to
//     PDF. The pdf case remembers the dialog options
//     (editorStore.REMEMBER_EXPORT_OPTIONS), passes page size/orientation
//     AND margins in pageOptions, awaits the store flow (native save
//     dialog → silent mt_export_pdf) and clears the print container on
//     every outcome (save-cancel included). The print case keeps driving
//     mt_print_webview directly and now clears the container after the
//     invoke resolves on macOS (the backend resolves when the panel
//     closes); on Windows the WebView2 print UI keeps a live preview, so
//     the container is replaced by the next export instead.
//   - 2026-10-18 v1.24.0: C-60 — footnote toggles reparse Muya's current
//     buffer; drop saved tab block caches so tab activation uses the new
//     grammar too. Markdown, history, isSaved and disk files are unchanged.
//   - 2026-10-15 v1.23.0: C-39 T-002 — the Muya options carry
//     disableTableColumnResize: props.mirror, so the read-only Split View
//     mirror pane renders no table column-resize handles. Reading/locked
//     tabs keep the handles: resizing is view-only session state in
//     muya.tableResize and never marks the document dirty.
//   - 2026-10-15 v1.22.0: C-38 T-006 N4 d — the image-viewer close glyph
//     renders from the drawn chromeIcons set (the assets/icons/close.svg
//     import is gone); the viewer keeps its size and colour.
//   - 2026-10-15 v1.21.0: C-40 T-004 — the preview-exit gestures (mousedown
//     on the document, plain Cmd/Ctrl+\) are suppressed while the active
//     tab is locked, so a lock survives interaction and only View › Lock
//     Document / the palette / the tab context menu unlock it; new
//     copyAsMarkdown bus handler (edit.copy-as-markdown — raw Markdown
//     selection-or-document clipboard write).
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
//   - 2026-10-13 v1.17.0: C-24 — imageAction writes pasted/dropped images straight into the relative assets/ folder (the old global staging copy wrote to a cwd-relative path when imageFolderPath was empty, so paste failed on a fresh install); the global folder falls back to <userData>/images; mt::drop-image now has a listener (dropped images used to vanish); in the App Store sandbox a denied assets/ write asks once for folder access (mt_grant_folder_access) and otherwise saves globally with a notice.
//   - 2026-10-13 v1.18.0: C-29 — `mirror` prop: in Split View with source mode on, the muya pane is visible, read-only (contenteditable=false), re-rendered from the tab markdown 150 ms after edits without focus or cursor, and its change events never reach the store; undo/redo, checkbox clicks, paste and drop are inert on it.
//   - 2026-10-14 v1.19.0: C-32 — handleCopyAsStructuredText: C-12 render pipeline + htmlToStructuredText (bullets, "text (url)" links, quotes, " | " table rows) as one text/plain flavor; context menu, Edit menu, palette, bus. C-12 and C-32 share copyRenderedAsPlainText, which now also catches render failures (previously an unhandled rejection).
//   - 2026-10-14 v1.19.1: review follow-up — diffGuarded drops document-mutating bus commands (undo/redo, format, paragraph, replace, image insert, extension edits, Format Document) while the diff view hides the editor (BLOCK_DIFF_EDIT_BLOCKED).
//   - 2026-10-15 v1.20.0: C-38 T-005 — wrapCodeBlocks and codeFontSize watchers call muya.refreshCodeBlockLineNumbers(): both are pure CSS changes that re-render nothing, so the line-number gutters must be re-measured (or reset to natural heights when wrapping turns off) explicitly.
// END_CHANGE_SUMMARY

import { ref, reactive, watch, onMounted, onBeforeUnmount, nextTick, computed } from 'vue'
import log from 'electron-log'
// import ViewImage from 'view-image'
import Muya from 'muya/lib'
import { formatMarkdown } from '@/util/markdownFormat'
import { checkMarkdownLinks } from '@/util/linkCheck'
import { htmlToStructuredText, structuredMarkedOptions } from '@/util/structuredText'
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
import BlockViewer from 'muya/lib/ui/blockViewer'
import EditorSearch from '../search'
import bus from '@/bus'
import { DEFAULT_EDITOR_FONT_FAMILY } from '@/config'
import notice from '@/services/notification'
import Printer from '@/services/printService'
import { SpellcheckerLanguageCommand } from '@/commands'
import { SpellChecker } from '@/spellchecker'
import { isOsx, animatedScrollTo } from '@/util'
import {
  moveImageToFolder,
  resolveImageFolder,
  saveImageToRelativeFolder,
  saveImageWithFolderAccess,
  uploadImage
} from '@/util/fileSystem'
import { guessClipboardFilePath } from '@/util/clipboard'
// C-56: pure DOM/string picture-export helpers (no clipboard/dialog/fs I/O
// inside muya — the transports live in this component). diagramExport has
// no import-time window access and its module graph is already part of
// muya's static bundle.
import {
  buildStandaloneSvg,
  diagramExportSvg,
  EXPORTABLE_FIGURE_SELECTOR,
  imageCopyPngBytes,
  nearestHeadingText,
  rasterizeSvg,
  resolveDiagramExportFigure,
  resolveImageCopySource,
  suggestFileName
} from 'muya/lib/utils/diagramExport'
import { buildTableSvg, resolveTableExportTable, TABLE_EXPORT_FIGURE_SELECTOR } from 'muya/lib/utils/tableExport'
// C-56 T-006: muya's DOM-side image info (tokenizes the wrapper's raw
// Markdown) for the right-click Copy Image item.
import { getImageInfo as getDomImageInfo } from 'muya/lib/utils/getImageInfo'
import { getCssForOptions, getHtmlToc } from '@/util/pdf'
import { loadTableLayoutsFor, saveTableLayoutsFor } from '@/util/tableLayoutStore'
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
// C-38 T-006 N4 d: the image-viewer close glyph renders from the drawn
// chromeIcons set (the assets/icons/close.svg import is gone).
import { ChromeIcon } from '../icons/chromeIcons.js'

const { t } = useI18n()
const STANDAR_Y = 320

const props = defineProps({
  markdown: String,
  cursor: Object,
  textDirection: {
    type: String,
    required: true
  },
  platform: String,
  // C-29: Split View with source mode on — this muya pane is the read-only
  // mirror of the CodeMirror pane and must never write to the store.
  mirror: {
    type: Boolean,
    default: false
  }
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
  frontmatterProperties,
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
// This identity belongs to the Muya buffer, independently of the selected tab.
// It changes only after a document render succeeds.
let renderedTabId = null
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
const isReadOnlySurface = computed(() => isPreviewMode.value || props.mirror)

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
  isReadOnlySurface,
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
  // C-40 T-004: a locked tab stays read-only — a click inside the
  // document must not silently unlock it (only View › Lock Document /
  // the palette / the tab context menu unlock).
  if (currentFile.value?.locked) return
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
  // C-29: Cmd/Ctrl+Alt+\ is Split View — only the plain chord is ours.
  const isCmdBackslash =
    event.key === '\\' && (event.metaKey || event.ctrlKey) && !event.altKey
  if (!isCmdBackslash) return
  if (isPreviewMode.value) {
    // C-40 T-004: a locked tab stays read-only — the chord degrades to
    // the plain sidebar toggle instead of exiting the lock.
    if (!currentFile.value?.locked) {
      const tabId = currentFile.value && currentFile.value.id
      if (tabId) {
        editorStore.EXIT_PREVIEW_MODE(tabId, 'cmd-toggle')
        // EXIT already adjusted sidebar per pref; do not double-toggle.
        event.preventDefault()
        return
      }
    }
  }
  // Not in preview (or locked) → plain sidebar toggle.
  layoutStore.TOGGLE_LAYOUT_ENTRY('showSideBar')
  event.preventDefault()
}

// Wrapper keydown entry: the paragraph shortcut wave runs first, then
// the preview Cmd+\ chord. FIX-005/FIX-006.
const handleEditorSurfaceKeydown = (event) => {
  handleParagraphShortcutKeys(event)
  handlePreviewKeydown(event)
}

// START_BLOCK_PARAGRAPH_SHORTCUTS
// FIX-005/FIX-006 (2026-10-20): the paragraph front menu advertised
// ⇧⌘P duplicate / ⇧⌘N new paragraph / ⇧⌘D delete, and the test plan
// promised Cmd+1–6 → Heading 1–6, but no layer ever dispatched them —
// the native menu intentionally keeps paragraph commands palette-only
// (menu-consistency RENDERER_ONLY_ALLOWLIST), so this capture handler is
// the desktop shortcut path. Canonical bindings follow
// docs/visual-regression-plan.md 13C: duplicate ⇧⌘D, delete ⇧⌘⌫,
// new paragraph ⇧⌘N, headings ⌘1–6; ⇧⌘P stays reserved for the Command
// Palette (UC-025). Physical `code` matching keeps the chords working
// on non-Latin (e.g. Russian) layouts, mirroring the KeyZ undo rule.
const handleParagraphShortcutKeys = (event) => {
  if (!event || event.isComposing) return
  const cmdOrCtrl = isOsx ? event.metaKey : event.ctrlKey
  if (!cmdOrCtrl || event.altKey) return
  // Only chords typed into the WYSIWYG surface itself: not the search
  // bar, not the fullscreen block viewer (it owns its +/−/0/1 keys).
  const target = event.target
  if (!target || !target.closest || !target.closest('.editor-component')) return
  if (target.closest('.ag-block-viewer')) return
  // Read-only surfaces (preview / Split View mirror / locked tab) must
  // not transform the document underneath.
  if (isReadOnlySurface.value || currentFile.value?.locked) return
  if (event.shiftKey) {
    if (event.code === 'KeyD') {
      event.preventDefault()
      bus.emit('duplicate', 'duplicate')
      return
    }
    if (event.code === 'KeyN') {
      event.preventDefault()
      bus.emit('createParagraph', 'createParagraph')
      return
    }
    if (event.code === 'Backspace') {
      event.preventDefault()
      bus.emit('deleteParagraph', 'deleteParagraph')
      return
    }
    return
  }
  const headingLevel = /^Digit([1-6])$/.exec(event.code)
  if (headingLevel) {
    event.preventDefault()
    bus.emit('paragraph', `heading ${headingLevel[1]}`)
  }
}
// END_BLOCK_PARAGRAPH_SHORTCUTS

// START_CONTRACT: syncMirrorFromSource
//   PURPOSE: C-29 — while this muya pane mirrors the CodeMirror pane, re-render it from the tab markdown (debounced: 150 ms, or twice the last render time up to 2 s on heavy documents) without taking focus.
//   INPUTS: { props.mirror: Boolean, props.markdown: String }
//   OUTPUTS: { void }
//   SIDE_EFFECTS: muya setMarkdown (render-only; the change event it dispatches is dropped by the mirror guard in the change listener).
//   LINKS: .grace/changes/archive/C-29 T-222; splitView.vue.
// END_CONTRACT: syncMirrorFromSource
// START_BLOCK_SPLIT_MIRROR_SYNC
const MIRROR_SYNC_DELAY_MS = 150
const MIRROR_SYNC_MAX_DELAY_MS = 2000
let mirrorSyncTimer = null
let mirroredMarkdown = null
// Heavy documents: wait at least twice the last render so a typing pause
// shorter than one render never lands in the middle of a stall.
let lastMirrorRenderMs = 0
const mirrorSyncDelay = () =>
  Math.min(MIRROR_SYNC_MAX_DELAY_MS, Math.max(MIRROR_SYNC_DELAY_MS, lastMirrorRenderMs * 2))

const renderMirror = () => {
  mirrorSyncTimer = null
  if (!props.mirror || !editor.value) return
  const markdown = props.markdown
  if (typeof markdown !== 'string' || markdown === mirroredMarkdown) return
  const surface = editor.value.container
  const scrollTop = surface ? surface.scrollTop : 0
  const started = performance.now()
  editor.value.setMarkdown(markdown, null, false)
  renderedTabId = currentFile.value?.id || null
  mirroredMarkdown = markdown
  if (surface) surface.scrollTop = scrollTop
  lastMirrorRenderMs = performance.now() - started
  console.debug(
    `[Editor][syncMirrorFromSource][BLOCK_SPLIT_MIRROR_SYNC] chars=${markdown.length} ms=${Math.round(lastMirrorRenderMs)}`
  )
}

const scheduleMirrorSync = (immediate = false) => {
  if (mirrorSyncTimer) clearTimeout(mirrorSyncTimer)
  mirrorSyncTimer = null
  if (!props.mirror) return
  if (immediate) {
    renderMirror()
  } else {
    mirrorSyncTimer = setTimeout(renderMirror, mirrorSyncDelay())
  }
}

watch(
  () => props.mirror,
  (value) => {
    mirroredMarkdown = null
    lastMirrorRenderMs = 0
    scheduleMirrorSync(value)
  }
)

watch(
  () => props.markdown,
  () => scheduleMirrorSync(false)
)

// The mirror is read-only: checkbox toggles, pastes and drops must not
// edit the muya copy (it would drift from the source pane).
const handleMirrorGuard = (event) => {
  if (!props.mirror) return
  const target = event.target
  const isCheckbox = target && target.tagName === 'INPUT'
  if (event.type === 'click' && !isCheckbox) return
  event.preventDefault()
  event.stopPropagation()
}
// END_BLOCK_SPLIT_MIRROR_SYNC

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

watch(frontmatterProperties, (value, oldValue) => {
  if (value !== oldValue && editor.value) {
    editor.value.setOptions({ frontmatterProperties: value }, true)
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
    // START_BLOCK_FOOTNOTE_TAB_CACHE_INVALIDATION
    // Background tabs still carry blocks from the previous grammar.
    // Their Markdown/source cursor/history remain available for activation.
    // Also needed when this is the read-only Split View mirror: cache
    // invalidation never writes source content or changes its save state.
    for (const tab of editorStore.tabs) delete tab.blocks
    // END_BLOCK_FOOTNOTE_TAB_CACHE_INVALIDATION
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
    // C-38 T-005: the wrap mode flips .ag-code-content white-space via CSS
    // only — no muya re-render — so re-measure the line-number gutters
    // explicitly (heights are cleared back to natural rows when wrap is off).
    if (editor.value) {
      editor.value.refreshCodeBlockLineNumbers()
    }
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
    // C-38 T-005: CSS-only change again — wrapped lines change height, so
    // the measured gutters must be recomputed.
    if (editor.value) {
      editor.value.refreshCodeBlockLineNumbers()
    }
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

  // Resolved only when used: the relative-folder path never needs it.
  const globalImageFolder = () =>
    resolveImageFolder(getResolvedImagePath(imageFolderPath.value), window.marktext?.paths?.userDataPath)
  const resolvedImageRelativeDirectoryName = getResolvedImagePath(imageRelativeDirectoryName.value)
  const useRelativeFolder = isTabSavedOnDisk && imagePreferRelativeDirectory.value
  // C-24: write straight into the document's relative folder (no staging copy
  // in the global folder) and return a document-relative path.
  const saveGlobally = (input) => moveImageToFolder(currentPathname, input, globalImageFolder())
  const saveImage = (input) =>
    useRelativeFolder
      ? saveImageWithFolderAccess({
        save: () => saveImageToRelativeFolder(relativeBasePath, resolvedImageRelativeDirectoryName, currentPathname, input),
        fallback: () => saveGlobally(input),
        dir: relativeBasePath,
        target: window.path.resolve(relativeBasePath, resolvedImageRelativeDirectoryName || 'assets'),
        isAppStore: preferencesStore.buildCapabilities?.mode === 'app-store',
        requestAccess: async (dir) => {
          const { invoke } = await import('@tauri-apps/api/core')
          return invoke('mt_grant_folder_access', { dir })
        },
        notify: (message) => notice.notify({ title: 'Image', type: 'warning', message })
      })
      : saveGlobally(input)
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
        destImagePath = await moveImageToFolder(currentPathname, image, globalImageFolder())
      }
      break
    }
    case 'folder': {
      destImagePath = await saveImage(image)
      break
    }
    case 'path': {
      if (typeof image === 'string') {
        // Input is a local path.
        destImagePath = image
      } else {
        // Binary input (pasted bitmap) has no path of its own: save it.
        destImagePath = await saveImage(image)
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
  if (props.mirror) return
  if (editor.value) {
    editor.value.undo()
  }
}

const handleRedo = () => {
  if (props.mirror) return
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

// START_CONTRACT: copyRenderedAsPlainText
//   PURPOSE: Shared C-12/C-32 pipeline — render the selection (or whole document) through marked + DOMPurify EXPORT and write convert(html) as the single text/plain flavor.
//   INPUTS: { convert: (html: string) => string - HTML → plain text; marker: string - log anchor of the calling handler; markedOptions: object - extra marked render hooks over the editor options }
//   OUTPUTS: { Promise<void> - resolves after the clipboard write attempt }
//   SIDE_EFFECTS: Native clipboard-manager writeText; any render or write failure warns with `${marker} copy failed` and notifies.
//   LINKS: C-12 handleCopyAsPlainText; C-32 handleCopyAsStructuredText; C-3 handleCopyAsHtml (same render pipeline)
// END_CONTRACT: copyRenderedAsPlainText
const copyRenderedAsPlainText = async (convert, marker, markedOptions = null) => {
  const ed = editor.value
  if (!ed) return
  const selectionData = ed.getCopyData()
  const text = selectionData && selectionData.text ? selectionData.text : ed.getMarkdown()
  if (!text) return
  try {
    const [{ default: marked }, { sanitize }, { EXPORT_DOMPURIFY_CONFIG }] = await Promise.all([
      import('muya/lib/parser/marked'),
      import('muya/lib/utils'),
      import('muya/lib/config')
    ])
    const options = markedOptions ? { ...ed.options, ...markedOptions } : ed.options
    const plain = convert(sanitize(marked(text, options), EXPORT_DOMPURIFY_CONFIG, false))
    if (!plain) return
    const { writeText } = await import('@tauri-apps/plugin-clipboard-manager')
    await writeText(plain)
  } catch (e) {
    console.warn(`${marker} copy failed: ${e}`)
    notice.notify({ title: t('error.copyError'), type: 'warning' })
  }
}

// START_CONTRACT: handleCopyAsPlainText
//   PURPOSE: Put the selection (or whole document) on the clipboard as markup-free plain text — no HTML tags, no Markdown syntax.
//   INPUTS: { none - reads Muya selection state via getCopyData }
//   OUTPUTS: { Promise<void> - resolves after the clipboard write attempt }
//   SIDE_EFFECTS: copyRenderedAsPlainText with a textContent extraction; failure warns with the anchored marker and notifies.
//   LINKS: C-12; C-3 handleCopyAsHtml (shared pipeline); commands/index.js edit.copy-as-plain-text
// END_CONTRACT: handleCopyAsPlainText
// START_BLOCK_COPY_AS_PLAIN_TEXT
const handleCopyAsPlainText = () =>
  copyRenderedAsPlainText((html) => {
    // marked emits newlines between block elements, so textContent keeps
    // block separation while every tag and Markdown marker disappears.
    // Hard breaks (<br>, incl. the literal <br/> muya stores in table
    // cells) must become newlines BEFORE parsing — textContent drops <br>
    // and would glue the surrounding words together.
    const doc = new DOMParser().parseFromString(html.replace(/<br\b[^>]*>/gi, '\n'), 'text/html')
    return doc.body.textContent.replace(/\n{3,}/g, '\n\n').trim()
  }, '[Editor][handleCopyAsPlainText][BLOCK_COPY_AS_PLAIN_TEXT]')
// END_BLOCK_COPY_AS_PLAIN_TEXT

// START_CONTRACT: handleCopyAsStructuredText
//   PURPOSE: Put the selection (or whole document) on the clipboard as plain text that keeps the document structure.
//   INPUTS: { none - reads Muya selection state via getCopyData }
//   OUTPUTS: { Promise<void> - resolves after the clipboard write attempt }
//   SIDE_EFFECTS: copyRenderedAsPlainText with util/structuredText.js htmlToStructuredText; failure warns with the anchored marker and notifies.
//   LINKS: C-32; util/structuredText.js; C-12 handleCopyAsPlainText; commands/index.js edit.copy-as-structured-text
// END_CONTRACT: handleCopyAsStructuredText
// START_BLOCK_COPY_AS_STRUCTURED_TEXT
const handleCopyAsStructuredText = () =>
  copyRenderedAsPlainText(
    htmlToStructuredText,
    '[Editor][handleCopyAsStructuredText][BLOCK_COPY_AS_STRUCTURED_TEXT]',
    structuredMarkedOptions
  )
// END_BLOCK_COPY_AS_STRUCTURED_TEXT

// START_CONTRACT: handleCopyAsMarkdown
//   PURPOSE: Put the selection (or whole document) on the clipboard as raw Markdown text — the document flavor of R-2's copy-document tools (C-40 T-004).
//   INPUTS: { none - reads Muya selection state via getCopyData }
//   OUTPUTS: { Promise<void> - resolves after the clipboard write attempt }
//   SIDE_EFFECTS: Native clipboard-manager writeText; failure warns with the anchored marker and notifies.
//   LINKS: C-40 T-004; commands/index.js edit.copy-as-markdown; contextMenu/tabs copyAsMarkdown (whole-document flavor over the tab markdown).
// END_CONTRACT: handleCopyAsMarkdown
// START_BLOCK_COPY_AS_MARKDOWN
const handleCopyAsMarkdown = async () => {
  const ed = editor.value
  if (!ed) return
  const selectionData = ed.getCopyData()
  const text = selectionData && selectionData.text ? selectionData.text : ed.getMarkdown()
  if (!text) return
  try {
    const { writeText } = await import('@tauri-apps/plugin-clipboard-manager')
    await writeText(text)
  } catch (e) {
    console.warn(`[Editor][handleCopyAsMarkdown][BLOCK_COPY_AS_MARKDOWN] copy failed: ${e}`)
    notice.notify({ title: t('error.copyError'), type: 'warning' })
  }
}
// END_BLOCK_COPY_AS_MARKDOWN

// START_CONTRACT: handleDiagramExportAction
//   PURPOSE: C-56 — let a rendered diagram (```mermaid → Pele) or chart (```vega-lite) block leave Mark as a picture: copied to the clipboard as a 2× PNG, or saved to disk as PNG/SVG.
//   INPUTS: { action: 'copyImage' | 'savePng' | 'saveSvg', element: Element - anything inside the exportable block (context-menu target), the live preview div (the block viewer dispatch) or the figure itself (the C-56 T-005 corner-pill Copy-as-image dispatch) }
//   OUTPUTS: { Promise<void> - resolves after the transport attempt; never rejects }
//   SIDE_EFFECTS: Native clipboard-manager writeImage (2× PNG); plugin-dialog save + fs write (binary PNG / text SVG); success/failure notices; failures and cancels warn with the anchored marker and write nothing (corner-5).
//   LINKS: C-56 R-1..R-5 + T-005 (the corner pill); muya/lib/utils/diagramExport (buildStandaloneSvg/rasterizeSvg/suggestFileName/nearestHeadingText); ui/blockViewer muya-diagram-export; muya clickEvent START_BLOCK_TOOLBAR_CLICK; clipboard-manager:allow-write-image capability.
// END_CONTRACT: handleDiagramExportAction
// START_BLOCK_DIAGRAM_EXPORT
const DIAGRAM_EXPORT_MARKER = '[Editor][handleDiagramExportAction][BLOCK_DIAGRAM_EXPORT]'

// 1-based index of the figure among the exportable blocks of the document
// (the <doc>-diagram-N fallback name, corner-6).
const diagramIndexInDoc = (figure) => {
  const root = figure.closest
    ? figure.closest('#ag-editor-id') || figure.parentElement
    : figure.parentElement
  if (!root || typeof root.querySelectorAll !== 'function') return 1
  const figures = Array.from(root.querySelectorAll(EXPORTABLE_FIGURE_SELECTOR))
  const index = figures.indexOf(figure)
  return index >= 0 ? index + 1 : 1
}

// C-70: 1-based index of a table figure among the document's tables (the
// <doc>-table-N fallback name).
const tableIndexInDoc = (figure) => {
  const root = figure && figure.closest ? figure.closest('#ag-editor-id') : null
  if (!root) return 1
  const figures = Array.from(root.querySelectorAll(TABLE_EXPORT_FIGURE_SELECTOR))
  const index = figures.indexOf(figure)
  return index >= 0 ? index + 1 : 1
}

// The picture source of the block: a C-56 diagram SVG made standalone, or
// (C-70) a table drawn from its live layout. null → nothing to export.
const resolveExportPicture = (element) => {
  const isTable = !!(element.closest && element.closest(TABLE_EXPORT_FIGURE_SELECTOR)) ||
    element.tagName === 'TABLE'
  if (isTable) {
    const table = resolveTableExportTable(element)
    const built = table ? buildTableSvg(table) : null
    if (!built) return null
    const figure = table.closest('figure')
    return { standalone: built.svg, figure, index: tableIndexInDoc(figure), noun: 'table' }
  }
  const svg = diagramExportSvg(element)
  if (!svg) return null
  const figure = svg.closest('figure')
  return { svgEl: svg, figure, index: diagramIndexInDoc(figure), noun: 'diagram' }
}

const handleDiagramExportAction = async ({ action, element } = {}) => {
  if (!action || !element) return
  if (!editor.value) return
  const picture = resolveExportPicture(element)
  if (!picture) {
    // Never-rendered blocks never reach here from the disabled menu items;
    // the viewer dispatches only rendered clones — defensive, not silent.
    console.warn(`${DIAGRAM_EXPORT_MARKER} no rendered svg, action ignored`, { action })
    return
  }
  const { figure } = picture
  const standaloneOf = () => picture.standalone || buildStandaloneSvg(picture.svgEl)

  if (action === 'copyImage') {
    try {
      const standalone = standaloneOf()
      if (!standalone) return
      const { bytes, width, height } = await rasterizeSvg(standalone, { scale: 2 })
      const { writeImage } = await import('@tauri-apps/plugin-clipboard-manager')
      await writeImage(bytes)
      notice.notify({
        title: t('editor.diagramExport.title'),
        message: t('editor.diagramExport.copied')
      })
      console.debug(`${DIAGRAM_EXPORT_MARKER} copied png`, { width, height })
    } catch (e) {
      // corner-5: rejected clipboard write → failure notice + marker, no
      // unhandled rejection.
      console.warn(`${DIAGRAM_EXPORT_MARKER} copy failed: ${e}`)
      notice.notify({
        title: t('editor.diagramExport.title'),
        type: 'warning',
        message: t('editor.diagramExport.copyFailed')
      })
    }
    return
  }

  const kind = action === 'saveSvg' ? 'svg' : 'png'
  try {
    const standalone = standaloneOf()
    if (!standalone) return
    const fileName = suggestFileName({
      headingText: nearestHeadingText(figure),
      // An unsaved tab's display name (Untitled-N) is not a document name.
      docName: currentFile.value && currentFile.value.pathname ? currentFile.value.filename : '',
      index: picture.index,
      ext: kind,
      noun: picture.noun
    })
    const { save } = await import('@tauri-apps/plugin-dialog')
    // The user-selected path is the sandbox-safe write target (works in
    // the App Store build, corner-7 — no new entitlement involved).
    const filePath = await save({
      title: t('editor.diagramExport.title'),
      defaultPath: fileName,
      filters: [{ name: kind.toUpperCase(), extensions: [kind] }]
    })
    if (!filePath) return
    if (kind === 'svg') {
      await window.fileUtils.writeFile(filePath, standalone)
    } else {
      const { bytes } = await rasterizeSvg(standalone, { scale: 2 })
      await window.fileUtils.writeFile(filePath, bytes, 'binary')
    }
    notice.notify({
      title: t('store.editor.exportSuccessTitle'),
      message: t('store.editor.exportSuccessMessage', {
        name: window.path.basename(filePath)
      })
    })
    console.debug(`${DIAGRAM_EXPORT_MARKER} saved ${kind}`, { filePath })
  } catch (e) {
    console.warn(`${DIAGRAM_EXPORT_MARKER} save failed: ${e}`)
    notice.notify({
      title: t('editor.diagramExport.title'),
      type: 'warning',
      message: t('editor.diagramExport.saveFailed')
    })
  }
}
// END_BLOCK_DIAGRAM_EXPORT

// START_CONTRACT: handleImageCopyAction
//   PURPOSE: C-56 T-006 — put an already-inserted ![](…) image back on the clipboard as a picture (PNG).
//   INPUTS: { imageInfo: object - muya image info whose token.attrs.src is the raw Markdown source (from the image toolbar dispatch or the context-menu item) }
//   OUTPUTS: { Promise<void> - resolves after the transport attempt; never rejects }
//   SIDE_EFFECTS: Local images read through the existing read-binary bridge (window.__markImageLoader — the same mt::fs::read_binary path the display uses; no new fs scope); remote http(s) images fetched; non-PNG bytes re-encoded on a canvas at natural size; clipboard-manager writeImage; the T-002 «Copied» toast or the existing «Could not copy the image» failure notice with the anchored marker (CORS/network/decode failures never reject).
//   LINKS: C-56 T-006; muya ui/imageToolbar (muya-image-copy dispatch); muya/lib/utils/diagramExport resolveImageCopySource/imageCopyPngBytes; clipboard-manager:allow-write-image (the T-002 capability — nothing new).
// END_CONTRACT: handleImageCopyAction
// START_BLOCK_IMAGE_COPY
const IMAGE_COPY_MARKER = '[Editor][handleImageCopyAction][BLOCK_IMAGE_COPY]'

// Bytes + content type of a classified source. Local reads go through the
// existing binary bridge: __markImageLoader wraps the exact mt::fs::
// read_binary bytes in a blob: URL, and fetching that URL in-page returns
// the identical bytes (CSP blocks file:// img-src, so the bridge is the
// only reader — same one the display uses).
const readImageCopyBytes = async (source) => {
  if (source.kind === 'data') {
    return { bytes: source.bytes, mime: source.mime }
  }
  if (source.kind === 'remote') {
    // A CORS rejection or network failure rejects here → the shared
    // catch-all notice below (never an unhandled rejection).
    const response = await fetch(source.url)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    const blob = await response.blob()
    return { bytes: new Uint8Array(await blob.arrayBuffer()), mime: blob.type || 'image/png' }
  }
  if (typeof window.__markImageLoader !== 'function') {
    throw new Error('no binary image reader available')
  }
  const blobUrl = await window.__markImageLoader(source.path)
  try {
    const blob = await (await fetch(blobUrl)).blob()
    return { bytes: new Uint8Array(await blob.arrayBuffer()), mime: blob.type || '' }
  } finally {
    if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
      URL.revokeObjectURL(blobUrl)
    }
  }
}

const handleImageCopyAction = async ({ imageInfo } = {}) => {
  if (!editor.value) return
  const rawSrc = imageInfo && imageInfo.token && imageInfo.token.attrs
    ? imageInfo.token.attrs.src
    : ''
  try {
    const source = resolveImageCopySource(rawSrc, {
      docPath: currentFile.value && currentFile.value.pathname ? currentFile.value.pathname : ''
    })
    if (!source) {
      throw new Error('unresolvable image source')
    }
    const { bytes, mime } = await readImageCopyBytes(source)
    if (!bytes || bytes.length === 0) {
      throw new Error('empty image bytes')
    }
    // PNG bytes pass through untouched; every other format is re-encoded
    // on a canvas at natural size (muya util).
    const { bytes: pngBytes } = await imageCopyPngBytes(bytes, { mime })
    const { writeImage } = await import('@tauri-apps/plugin-clipboard-manager')
    await writeImage(pngBytes)
    notice.notify({
      title: t('editor.image.copyTitle'),
      message: t('editor.diagramExport.copied')
    })
    console.debug(`${IMAGE_COPY_MARKER} copied png`, { source: source.kind })
  } catch (e) {
    console.warn(`${IMAGE_COPY_MARKER} copy failed: ${e}`)
    notice.notify({
      title: t('editor.image.copyTitle'),
      type: 'warning',
      message: t('editor.diagramExport.copyFailed')
    })
  }
}
// END_BLOCK_IMAGE_COPY

// START_CONTRACT: handleEditorContextMenu
//   PURPOSE: Replace WKWebView's default right-click menu with a full native menu: undo/redo (Muya history), cut/copy/paste/select-all roles, Copy as HTML, the C-56 picture-export items on diagram/chart blocks, the C-56 T-006 Copy Image item on embedded ![](…) images, and Share.
//   INPUTS: { event: Event - the DOM contextmenu event Muya re-dispatches }
//   OUTPUTS: { Promise<void> - resolves after the native popup resolves and the clicked id is dispatched }
//   SIDE_EFFECTS: Suppresses the webview default menu; roles act via the responder chain; copyAsHtml writes the clipboard; diagram items run handleDiagramExportAction; copyEmbeddedImage runs handleImageCopyAction; share opens the native share sheet.
//   LINKS: C-10/C-11; muya eventHandler/clickEvent.js 'contextmenu' dispatch; mt::window-popup-context-menu (m009 roles); C-3 handleCopyAsHtml; mt_share_file; C-56 handleDiagramExportAction; C-56 T-006 handleImageCopyAction + muya utils/getImageInfo
// END_CONTRACT: handleEditorContextMenu
// START_BLOCK_EDITOR_CONTEXT_MENU
const handleEditorContextMenu = async (event) => {
  if (!event || typeof event.preventDefault !== 'function') return
  event.preventDefault()
  const ed = editor.value
  if (!ed) return
  const pathname = currentFile.value && currentFile.value.pathname
  // C-56: the picture-export items appear ONLY when the right-click
  // target is inside a rendered Pele diagram (```mermaid) or Vega-Lite
  // chart block (corner-3 — paragraphs/tables/code/math/follow-up
  // diagram roles get nothing), and are DISABLED when the block has no
  // rendered SVG yet (corner-4). A keep-last-good stale SVG is a rendered
  // SVG — it exports.
  const diagramFigure = resolveDiagramExportFigure(event.target)
  const diagramRendered = !!(
    diagramFigure &&
    diagramFigure.querySelector('div.ag-container-preview svg')
  )
  // C-56 T-006: Copy Image appears ONLY when the right-click target is a
  // rendered img inside a muya image wrapper (a failed image has its img
  // removed and gets nothing). muya's DOM-side getImageInfo tokenizes the
  // wrapper's raw Markdown so the transport sees the original src.
  let contextImageInfo = null
  try {
    const imageWrapper = event.target && typeof event.target.closest === 'function' &&
      event.target.tagName === 'IMG'
      ? event.target.closest('span.ag-inline-image')
      : null
    contextImageInfo = imageWrapper ? getDomImageInfo(imageWrapper) : null
  } catch (_) {
    contextImageInfo = null
  }
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
    { label: t('contextMenu.editor.copyAsStructuredText'), id: 'copyAsStructuredText' },
    { role: 'paste' },
    // C-56: below copy/paste, diagram/chart blocks only.
    ...(diagramFigure
      ? [
          { type: 'separator' },
          {
            label: t('contextMenu.editor.copyAsImage'),
            id: 'copyAsImage',
            enabled: diagramRendered
          },
          {
            label: t('contextMenu.editor.saveAsPng'),
            id: 'saveDiagramPng',
            enabled: diagramRendered
          },
          {
            label: t('contextMenu.editor.saveAsSvg'),
            id: 'saveDiagramSvg',
            enabled: diagramRendered
          }
        ]
      : []),
    // C-56 T-006: embedded ![](…) images get their own copy group.
    ...(contextImageInfo
      ? [
          { type: 'separator' },
          {
            label: t('contextMenu.editor.copyImage'),
            id: 'copyEmbeddedImage'
          }
        ]
      : []),
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
  } else if (clickedId === 'copyAsStructuredText') {
    await handleCopyAsStructuredText()
  } else if (clickedId === 'copyAsImage') {
    // C-56: the figure element carries the block context into the shared
    // transport (the same handler serves the block viewer dispatch).
    await handleDiagramExportAction({ action: 'copyImage', element: diagramFigure })
  } else if (clickedId === 'saveDiagramPng') {
    await handleDiagramExportAction({ action: 'savePng', element: diagramFigure })
  } else if (clickedId === 'saveDiagramSvg') {
    await handleDiagramExportAction({ action: 'saveSvg', element: diagramFigure })
  } else if (clickedId === 'copyEmbeddedImage') {
    // C-56 T-006: the muya image info carries the raw Markdown src into
    // the shared transport (the same handler serves the toolbar button).
    await handleImageCopyAction({ imageInfo: contextImageInfo })
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

// START_BLOCK_DROP_IMAGE
// C-24 R-4: Tauri intercepts OS file drops and the window shim emits
// mt::drop-image for image files; nothing listened before, so a dropped image
// silently vanished. Insert it at the cursor through the same imageAction
// pipeline as paste (copy into assets/, relative link).
let offDropImage = null
const handleDropImage = async (_event, payload) => {
  const imagePath = payload && payload.path
  if (!imagePath || sourceCode.value || !editor.value) return
  const name = window.path.basename(imagePath)
  // Brackets in a file name would end the alt text early.
  const alt = name.replace(/\.[^/.]+$/, '').replace(/[[\]\\]/g, '\\$&')
  const result = await editor.value.insertImageFromPath(imagePath, alt)
  if (result === null) {
    notice.notify({ title: 'Image', type: 'warning', message: `${name}: this image type cannot be inserted (use PNG, JPEG, GIF, SVG or WebP)` })
  } else if (result === '') {
    notice.notify({ title: 'Image', type: 'warning', message: `Could not insert ${name} here` })
  }
}
// END_BLOCK_DROP_IMAGE

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
    if (!editor.value) return
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
      // C-61 R-2: Export to PDF = settings dialog (already OK'd) → native
      // save dialog → silent mt_export_pdf write; no print panel. Page
      // size/orientation and margins travel in pageOptions (the backend
      // maps them onto the PDF page box; the shared @page CSS carries the
      // visible margins).
      try {
        const {
          pageSize,
          pageSizeWidth,
          pageSizeHeight,
          isLandscape,
          pageMarginTop,
          pageMarginRight,
          pageMarginBottom,
          pageMarginLeft
        } = options
        const pageOptions = {
          pageSize,
          pageSizeWidth,
          pageSizeHeight,
          isLandscape,
          pageMarginTop,
          pageMarginRight,
          pageMarginBottom,
          pageMarginLeft
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
        // C-61 R-1: remember the appearance so a later ⌘P renders the
        // print container without the settings dialog.
        editorStore.REMEMBER_EXPORT_OPTIONS(options)
        await editorStore.EXPORT({ type, pageOptions })
        // The flow is over — saved, cancelled in the save dialog (corner-2:
        // nothing written, no notice), or a notified failure. The container
        // goes in every case.
        handlePrintServiceClearup()
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
      // C-61 R-1: ⌘P arrives here straight from editorStore.PRINT_DOCUMENT
      // (remembered options; no export-settings dialog). Page size and
      // orientation belong to the native panel.
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
        // window.print() is silently ignored by WKWebView — drive the
        // native print panel from the backend instead.
        const { invoke } = await import('@tauri-apps/api/core')
        await invoke('mt_print_webview')
        // On macOS the backend resolves only after the panel closes, so
        // the container can go. On Windows the WebView2 print UI keeps a
        // live preview bound to this DOM — the container is replaced by
        // the next export instead (C-18 semantics).
        if (isOsx) {
          handlePrintServiceClearup()
        }
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
  if (props.mirror) return
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
  if (props.mirror) return
  editor.value && editor.value.format(type)
}

const handleDialogTableConfirm = () => {
  dialogTableVisible.value = false
  editor.value && editor.value.createTable(tableChecker)
}

// START_CONTRACT: applyStoredTableLayouts / handleTableLayoutsChange
//   PURPOSE: C-65 T-001 — the host side of persistent table layouts: load the active file's stored widths + Full width modes into muya after every document load, and save muya's dispatches (fired only after a real resize / reset / mode toggle) back into the profile.
//   INPUTS: { none - reads currentFile (id + pathname) and the muya-table-layouts event payload { entries } }
//   OUTPUTS: { Promise<void> / Promise<boolean> }
//   SIDE_EFFECTS: ipcPrefs reads/writes of the tableLayouts key (through util/tableLayoutStore: prune missing files, cap the store); muya.tableResize.applyPersistedLayouts adoption (DOM widths/classes, never markdown/history/isSaved); console markers BLOCK_TABLE_LAYOUTS_APPLIED / BLOCK_TABLE_LAYOUTS_SAVED.
//   LINKS: C-65 R-1/R-6; util/tableLayoutStore.js; muya lib/tableResize (the identity/serialize counterpart); store/editor.js RENAME/RENAME_IF_NEEDED (the rename move).
// END_CONTRACT: applyStoredTableLayouts / handleTableLayoutsChange
// START_BLOCK_TABLE_LAYOUTS_HOST
const tableLayoutsSeq = { tabId: null, seq: 0 }

const applyStoredTableLayouts = async () => {
  const muya = editor.value
  if (!muya || !muya.tableResize || props.mirror) return
  const file = currentFile.value
  const tabId = file && file.id
  const pathname = file && file.pathname
  const seq = ++tableLayoutsSeq.seq
  tableLayoutsSeq.tabId = tabId || null
  if (!pathname) {
    // Untitled/unsaved document: no profile entry, and stale entries from
    // the previously loaded file must not leak into this one.
    muya.tableResize.applyPersistedLayouts(null)
    return
  }
  let entries = {}
  try {
    entries = await loadTableLayoutsFor(pathname)
  } catch (e) {
    console.warn(`[Editor][applyStoredTableLayouts][BLOCK_TABLE_LAYOUTS_APPLY_FAILED] ${e}`)
  }
  if (seq !== tableLayoutsSeq.seq || currentFile.value?.id !== tabId || editor.value !== muya) return
  muya.tableResize.applyPersistedLayouts(entries)
  console.debug(
    `[Editor][applyStoredTableLayouts][BLOCK_TABLE_LAYOUTS_APPLIED] tab=${tabId} tables=${Object.keys(entries).length}`
  )
}

const handleTableLayoutsChange = async ({ entries } = {}) => {
  if (props.mirror) return
  const pathname = currentFile.value && currentFile.value.pathname
  if (!pathname || !entries || typeof entries !== 'object') return
  const saved = await saveTableLayoutsFor(pathname, entries)
  if (saved) {
    console.debug(
      `[Editor][handleTableLayoutsChange][BLOCK_TABLE_LAYOUTS_SAVED] tables=${Object.keys(entries).length}`
    )
  }
}
// END_BLOCK_TABLE_LAYOUTS_HOST

// listen for `open-single-file` event, it will call this method only when open a new file.
const setMarkdownToEditor = ({ id, markdown: newMarkdown, cursor: newCursor }) => {
  if (id && id !== currentFile.value?.id) {
    console.warn(`[Editor][setMarkdownToEditor][BLOCK_STALE_FILE_LOADED_IGNORED id=${id}]`)
    return
  }
  if (editor.value) {
    if (
      id &&
      renderedTabId === id &&
      currentFile.value?.id === id &&
      typeof newMarkdown === 'string' &&
      newMarkdown === currentFile.value.markdown
    ) {
      if (newCursor) editor.value.setCursor(newCursor)
      // C-65: a fresh open whose content the store already holds still
      // adopts the file's stored table layouts (this early return used to
      // skip them, so reopened files lost their column widths).
      if (!props.mirror) applyStoredTableLayouts()
      return
    }
    editor.value.clearHistory()
    if (newCursor) {
      editor.value.setMarkdown(newMarkdown, newCursor, true)
    } else {
      editor.value.setMarkdown(newMarkdown)
    }
    // C-29: the mirror already shows this document; skip the debounced re-render.
    renderedTabId = currentFile.value?.id || null
    if (props.mirror) mirroredMarkdown = newMarkdown
    // C-65: adopt the stored table layouts of the newly opened document.
    applyStoredTableLayouts()
    if (!isReadOnlySurface.value) {
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
    // START_BLOCK_RENDER_OWNER_MISMATCH
    // Selection changes before rendering. A late event from a closed/source
    // pane must not put its document into the now-selected neighbor.
    if (id && id !== activeFile?.id) {
      console.debug('[Editor][handleFileChange][BLOCK_RENDER_OWNER_MISMATCH]')
      return
    }
    if (typeof newMarkdown !== 'string' && renderedTabId !== activeFile?.id) return
    // END_BLOCK_RENDER_OWNER_MISMATCH
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
      const sameDocument = id && renderedTabId === id && activeFile?.id === id && newMarkdown === activeFile.markdown
      if (sameDocument && newCursor && renderCursor !== true && !history && !blocks && !muyaIndexCursor) {
        editor.value.setCursor(newCursor)
      } else {
        editor.value.setMarkdown(newMarkdown, newCursor, renderCursor, muyaIndexCursor, blocks)
      }
      renderedTabId = activeFile?.id || null
      if (props.mirror) mirroredMarkdown = newMarkdown
      // FIX-002: phase-3 mark — first paint after the Muya render of a
      // sidebar-clicked file. UPDATE_CURRENT_FILE routes the render
      // through this handler (the parallel file-loaded event then skips
      // as a duplicate), so the paint stamp belongs here; the arrival
      // stamp is set by bootstrap-ipc.js.
      if (typeof window !== 'undefined' && typeof window.__openFileArrivalAt === 'number') {
        const arrivalAt = window.__openFileArrivalAt
        window.__openFileArrivalAt = undefined
        requestAnimationFrame(() => {
          // eslint-disable-next-line no-console
          console.log(
            `[editor][open-file][BLOCK_OPEN_FIRST_PAINT since_arrival_ms=${Math.round(performance.now() - arrivalAt)}]`
          )
        })
      }
    } else if (newCursor) {
      editor.value.setCursor(newCursor)
    }

    // C-65: tab switches and reloads adopt the now-active file's stored
    // table layouts (a no-op when the muya session already carries them).
    if (!props.mirror) applyStoredTableLayouts()

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

// START_CONTRACT: reconcileActiveDocument
//   PURPOSE: Restore the selected document if its activation event did not render this Muya instance.
//   INPUTS: { none - reads currentFile and the last successfully rendered tab identity }
//   OUTPUTS: { void }
//   SIDE_EFFECTS: Restores active tab history/content/cursor/scroll through handleFileChange; logs a content-free recovery marker.
//   LINKS: .grace/graph/runtime.xml M-011.fn-reconcileActiveDocument; C-TAB-CLOSE-OWNERSHIP.
// END_CONTRACT: reconcileActiveDocument
// START_BLOCK_ACTIVE_DOCUMENT_RECONCILED
const reconcileActiveDocument = () => {
  const file = currentFile.value
  if (!editor.value || !file?.id || file.id === renderedTabId || typeof file.markdown !== 'string') return
  handleFileChange({ ...file, renderCursor: true })
  console.debug('[Editor][reconcileActiveDocument][BLOCK_ACTIVE_DOCUMENT_RECONCILED]')
}

// Ordinary bus delivery is synchronous. Check after Vue has applied the tab
// selection and mode props, so successful delivery needs no second render.
watch(() => currentFile.value?.id, reconcileActiveDocument, { flush: 'post' })
// END_BLOCK_ACTIVE_DOCUMENT_RECONCILED

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
  if (props.mirror) return
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

// START_CONTRACT: diffGuarded
//   PURPOSE: M-031 — while the diff view replaces the editing surface, bus commands that would mutate the hidden Muya document are dropped.
//   INPUTS: { handler: Function - a document-mutating bus handler }
//   OUTPUTS: { Function - the same handler, no-op while currentFile.diffMode is on }
//   SIDE_EFFECTS: console.warn with BLOCK_DIFF_EDIT_BLOCKED when a command is dropped
//   LINKS: index.vue split-view v-show; diffView.vue
// END_CONTRACT: diffGuarded
// START_BLOCK_DIFF_EDIT_GUARD
const isDiffMode = computed(() => !!currentFile.value?.diffMode)
const guardDiff = (name, handler) => (...args) => {
  if (isDiffMode.value) {
    console.warn(`[Editor][diffGuarded][BLOCK_DIFF_EDIT_BLOCKED] ${name} ignored while the diff view is open`)
    return
  }
  return handler(...args)
}
const diffGuarded = Object.fromEntries(
  Object.entries({
    handleUndo, handleRedo, handleEditParagraph, handleInlineFormat, handReplace, insertImage,
    handleUploadedImage, handleCopyPaste, handleParagraph, handleInsertParagraph, handleScreenShot,
    replaceMisspelling, handleExtTextInsert, handleExtTextTransform, handleExtUndo, handleFormatDocument
  }).map(([name, handler]) => [name, guardDiff(name, handler)])
)

// END_BLOCK_DIFF_EDIT_GUARD

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
  Muya.use(BlockViewer)

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
    frontmatterProperties: frontmatterProperties.value,
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
    // C-39 T-002: the read-only Split View mirror pane gets no column
    // resize handles (props.mirror is fixed per instance); every other
    // surface — including reading/locked tabs — keeps them, because
    // resizing is view-only and never dirties the document.
    disableTableColumnResize: props.mirror,
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
  syncPreviewSurface(isReadOnlySurface.value, !isReadOnlySurface.value)

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
  bus.on('undo', diffGuarded.handleUndo)
  bus.on('redo', diffGuarded.handleRedo)
  bus.on('selectAll', handleSelectAll)
  bus.on('export', handleExport)
  bus.on('paragraph', diffGuarded.handleEditParagraph)
  bus.on('format', diffGuarded.handleInlineFormat)
  bus.on('searchValue', handleSearch)
  bus.on('replaceValue', diffGuarded.handReplace)
  bus.on('find-action', handleFindAction)
  bus.on('insert-image', diffGuarded.insertImage)
  offDropImage = window.electron?.ipcRenderer?.on?.('mt::drop-image', handleDropImage) || null
  bus.on('image-uploaded', diffGuarded.handleUploadedImage)
  bus.on('file-changed', handleFileChange)
  bus.on('editor-blur', blurEditor)
  bus.on('editor-focus', focusEditor)
  bus.on('copyAsRich', handleCopyPaste)
  bus.on('copyAsHtml', handleCopyPaste)
  bus.on('pasteAsPlainText', diffGuarded.handleCopyPaste)
  bus.on('copyAsHtmlRich', handleCopyAsHtml)
  bus.on('copyAsPlainText', handleCopyAsPlainText)
  bus.on('copyAsStructuredText', handleCopyAsStructuredText)
  bus.on('copyAsMarkdown', handleCopyAsMarkdown)
  bus.on('duplicate', diffGuarded.handleParagraph)
  bus.on('createParagraph', diffGuarded.handleParagraph)
  bus.on('deleteParagraph', diffGuarded.handleParagraph)
  bus.on('insertParagraph', diffGuarded.handleInsertParagraph)
  bus.on('scroll-to-header', scrollToHeader)
  bus.on('screenshot-captured', diffGuarded.handleScreenShot)
  bus.on('switch-spellchecker-language', switchSpellcheckLanguage)
  bus.on('open-command-spellchecker-switch-language', openSpellcheckerLanguageCommand)
  bus.on('replace-misspelling', diffGuarded.replaceMisspelling)
  bus.on('ext-text-insert', diffGuarded.handleExtTextInsert)
  bus.on('ext-text-transform', diffGuarded.handleExtTextTransform)
  bus.on('ext-undo', diffGuarded.handleExtUndo)
  bus.on('ext-context-request', handleExtContextRequest)
  bus.on('formatDocument', diffGuarded.handleFormatDocument)

  // The pending-open drain runs in parallel with Vue mount. If an agent or
  // Finder event selected a tab before this component subscribed, replay the
  // active tab once so the first paint cannot be an empty white surface.
  hydrateMountedDocument()

  editor.value.on('change', (changes) => {
    // C-29: the split mirror renders from the store; never write it back
    // (muya normalizes markdown and would rewrite the source).
    if (props.mirror) return
    // A selected tab may not have reached the Muya buffer yet. Never attach
    // the previous surface's text/blocks/history to that new document.
    const id = renderedTabId
    if (id && id === currentFile.value?.id) {
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
    // C-29: the source pane owns the tab's scroll offset while muya mirrors it.
    if (props.mirror || !renderedTabId || renderedTabId !== currentFile.value?.id) return
    editorStore.updateScrollPosition(renderedTabId, scrollEvent.scrollTop)
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
    if (props.mirror) return
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
    if (props.mirror) return
    editorStore.SELECTION_FORMATS(formats)
  })

  // C-10: Muya re-dispatches the DOM contextmenu event; subscribing here
  // lets us preventDefault (suppressing WKWebView's default menu) and show
  // the app's native context menu instead.
  editor.value.on('contextmenu', handleEditorContextMenu)
  // C-56: the fullscreen block viewer toolbar dispatches picture exports
  // with the LIVE source element (never its zoomed clone) — the shared
  // transport builds the standalone SVG at natural size.
  editor.value.on('muya-diagram-export', handleDiagramExportAction)
  // C-56 T-006: the image toolbar's Copy image button hands the muya image
  // info (raw Markdown src) to the embedded-image copy transport.
  editor.value.on('muya-image-copy', handleImageCopyAction)
  // C-65 T-001: muya fires this only after a real table layout action
  // (drag end with movement, double-click reset, Full width toggle).
  editor.value.on('muya-table-layouts', handleTableLayoutsChange)

  document.addEventListener('keyup', keyup)

  setWrapCodeBlocks(wrapCodeBlocks.value)
  setEditorWidth(editorLineWidth.value)
})

onBeforeUnmount(() => {
  if (mirrorSyncTimer) clearTimeout(mirrorSyncTimer)
  mirrorSyncTimer = null
  bus.off('file-loaded', setMarkdownToEditor)
  bus.off('invalidate-image-cache', handleInvalidateImageCache)
  bus.off('undo', diffGuarded.handleUndo)
  bus.off('redo', diffGuarded.handleRedo)
  bus.off('selectAll', handleSelectAll)
  bus.off('export', handleExport)
  bus.off('paragraph', diffGuarded.handleEditParagraph)
  bus.off('format', diffGuarded.handleInlineFormat)
  bus.off('searchValue', handleSearch)
  bus.off('replaceValue', diffGuarded.handReplace)
  bus.off('find-action', handleFindAction)
  bus.off('insert-image', diffGuarded.insertImage)
  if (typeof offDropImage === 'function') offDropImage()
  offDropImage = null
  bus.off('image-uploaded', diffGuarded.handleUploadedImage)
  bus.off('file-changed', handleFileChange)
  bus.off('editor-blur', blurEditor)
  bus.off('editor-focus', focusEditor)
  bus.off('copyAsRich', handleCopyPaste)
  bus.off('copyAsHtml', handleCopyPaste)
  bus.off('pasteAsPlainText', diffGuarded.handleCopyPaste)
  bus.off('copyAsHtmlRich', handleCopyAsHtml)
  bus.off('copyAsPlainText', handleCopyAsPlainText)
  bus.off('copyAsStructuredText', handleCopyAsStructuredText)
  bus.off('copyAsMarkdown', handleCopyAsMarkdown)
  bus.off('duplicate', diffGuarded.handleParagraph)
  bus.off('createParagraph', diffGuarded.handleParagraph)
  bus.off('deleteParagraph', diffGuarded.handleParagraph)
  bus.off('insertParagraph', diffGuarded.handleInsertParagraph)
  bus.off('scroll-to-header', scrollToHeader)
  bus.off('screenshot-captured', diffGuarded.handleScreenShot)
  bus.off('switch-spellchecker-language', switchSpellcheckLanguage)
  bus.off('open-command-spellchecker-switch-language', openSpellcheckerLanguageCommand)
  bus.off('replace-misspelling', diffGuarded.replaceMisspelling)
  bus.off('ext-text-insert', diffGuarded.handleExtTextInsert)
  bus.off('ext-text-transform', diffGuarded.handleExtTextTransform)
  bus.off('ext-undo', diffGuarded.handleExtUndo)
  bus.off('ext-context-request', handleExtContextRequest)
  bus.off('formatDocument', diffGuarded.handleFormatDocument)
  if (docLintTimer) clearTimeout(docLintTimer)
  if (tocActiveTimer) clearTimeout(tocActiveTimer)

  document.removeEventListener('keyup', keyup)
  editor.value.off('change')
  editor.value.off('scroll')
  // C-56: drop the viewer export dispatch before muya is destroyed.
  editor.value.off('muya-diagram-export', handleDiagramExportAction)
  // C-56 T-006: drop the image-copy dispatch before muya is destroyed.
  editor.value.off('muya-image-copy', handleImageCopyAction)
  // C-65: drop the table-layouts dispatch before muya is destroyed.
  editor.value.off('muya-table-layouts', handleTableLayoutsChange)

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
  /* The text column must be a WebKit selection root, otherwise fully
   * selected blocks paint their selection gaps across the whole window
   * instead of stopping at the column edge. A flex item is a selection
   * root without clipping (wide tables still overflow visibly). */
  display: flex;
  flex-direction: column;
}

.editor-component > #ag-editor-id {
  width: 100%;
  flex-shrink: 0;
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
      color: #efefef;
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
