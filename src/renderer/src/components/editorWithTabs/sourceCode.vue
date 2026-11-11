<!-- MODULE_CONTRACT
  PURPOSE: Host the editable Markdown source surface and commit user changes to its owning tab; unified split sessions use the same Muya-owned document history in all modes.
  SCOPE: C-SOURCE-HISTORY-OWNERSHIP: ordinary Source uses lifetime-scoped native Docs, retaining local undo/redo and selection across tab activation and remount. CodeMirror lifecycle, cursor/scroll synchronization, file event handling and exact-source projection of actual model changes. Split companion (splitEdit, C-SPLIT-DUAL-EDIT): editable, follows the tab markdown render-only (isRenderingFromStore guard, 150 ms debounce, scroll kept, remembered caret translated/clamped, IME fenced), CodeMirror history kept empty (unified muya history owns undo via bus undo/redo), locked tabs read-only; the C-29 read-only mirror branch is retired. C-SPLIT-SCROLL-SYNC: the pane pairs its scroller with the muya container ('source' side of splitScrollSync), align to the rich pane's fraction on mount/split activation, and the editable pane re-anchors on its caret line through pane-width changes.
  DEPENDS: editor/preferences stores, bus, CodeMirror adapter, util/sourceDocumentHistory.ts, util/splitScrollSync.js.
  ROLE: RUNTIME
END_MODULE_CONTRACT
CHANGE_SUMMARY: 2026-11-11 C-SOURCE-HISTORY-OWNERSHIP: bind ordinary native Docs to id/token; preserve local history and reject retired/outgoing events.
  2026-11-09 C-STABILIZE-SPLIT-DUAL-EDIT: preserve never-unified source cursor/tab commits and reject stale outgoing unified events.
  2026-11-09 C-STABILIZE-SPLIT-DUAL-EDIT: one content operation per change, Muya-owned raw history in unified sessions, source commands/search/assets, translated reversed selections, composition fences, post-Vue tab reconciliation and complete cleanup.
  2026-10-29 C-SPLIT-DUAL-EDIT: splitEdit prop; render-only store-follow (guard + clearHistory + translateAndClamp caret + IME fence); unified undo extraKeys (bus undo/redo); lock covers the companion; mountMirror retired — one editable instance.
  2026-10-27 C-SPLIT-SCROLL-SYNC: splitActive prop; both instances attach to splitScrollSync ('source'), mount/split-on aligns to the rich fraction (alignToFraction), the editable pane centers its caret line on transitions and width changes (reanchorSourcePane), unmount detaches.
  2026-08-10 v2.1.7 rebinds tab identity after file-loaded events and guards null unmount commits.
  2026-10-15 C-40 T-004: a locked tab (View › Lock Document) is read-only in the source pane too (CodeMirror setOption readOnly on mount + on lock changes; selection/copy stay available). Finder previewMode is intentionally not applied here.
  2026-10-13 C-29: `mirror` prop — read-only Split View pane; renders from props.markdown 150 ms after changes and never commits, emits or resets tab state.
  2026-10-13 C-29 live-smoke fix: CodeMirror instance held in shallowRef. Method calls through the deep ref's Proxy (setValue on file-changed, refresh) left proxied line handles in the display, so the next click or arrow key threw `info.map` in WKWebView and the caret jumped or ignored the click.
  2026-10-13 C-29 live-smoke fix: container ResizeObserver calls cm.refresh(). With lineWrapping CodeMirror re-measures only on window resize, so dragging the split divider left the caret drawn at the pre-wrap line position.
-->
<template>
  <div ref="sourceCodeContainer" class="source-code"><editor-search v-if="sourceCode && unified" /></div>
</template>

<script setup>
import { ref, computed, shallowRef, watch, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { useEditorStore } from '@/store/editor'
import { usePreferencesStore } from '@/store/preferences'
import { storeToRefs } from 'pinia'
import codeMirror, { setMode, setCursorAtFirstLine, setTextDirection } from '../../codeMirror'
import { debounce, wordCount as getWordCount } from 'muya/lib/utils'
import { adjustCursor } from '../../util'
import bus from '../../bus'
import { documentOwner, registerDocumentSurface } from '@/util/documentSnapshot'
import { createSourceDocumentHistory } from '@/util/sourceDocumentHistory'
import { oneDarkThemes, railscastsThemes } from '@/config'
import {
  splitScrollSync,
  scrollFraction,
  computeAnchorTarget,
  contentOffsetOfRect
} from '@/util/splitScrollSync'
import { createCompositionFence, translateAndClamp, preserveSourceSyntax } from '@/util/splitDualEdit'
import { nextTick } from 'vue'
import EditorSearch from '../search/index.vue'
import { applySourceCommand, sourceSearch } from '@/util/splitCommands'
import notice from '@/services/notification'
import { formatMarkdown } from '@/util/markdownFormat'

const props = defineProps({
  markdown: String,
  muyaIndexCursor: Object,
  textDirection: {
    type: String,
    required: true
  },
  mirror: {
    type: Boolean,
    default: false
  },
  // C-SPLIT-SCROLL-SYNC: Split View is active (both panes visible) — this
  // pane pairs its scroller and aligns/re-anchors with the rich pane.
  splitActive: {
    type: Boolean,
    default: false
  },
  // C-SPLIT-DUAL-EDIT: this pane is the split companion in WYSIWYG mode —
  // editable, following the store render-only, undo unified with muya.
  splitEdit: {
    type: Boolean,
    default: false
  }
})

const editorStore = useEditorStore()
const preferencesStore = usePreferencesStore()
const sourceHistory = createSourceDocumentHistory(editorStore)

const sourceCodeContainer = ref(null)

// shallowRef: a deep ref would hand CodeMirror a reactive Proxy as `this`, so
// the display caches proxied line handles that never === the raw ones and
// measurement throws `info.map` (codemirror5#6886).
const editor = shallowRef(null)
const commitTimer = ref(null)
const viewDestroyed = ref(false)
let renderedDocumentOwner = null
const tabId = ref(null)

const { theme, sourceCode } = storeToRefs(preferencesStore)
const { currentFile: currentTab } = storeToRefs(editorStore)
const unified = computed(() => !!currentTab.value?.splitSession?.unified)
const sourceFocused = () => unified.value && currentTab.value.splitSession.focused === 'source'
const sameOwner = (a, b) => !!a && !!b && a.id === b.id && a.documentToken === b.documentToken
const renderedOwner = () => editorStore.tabs.find(tab => sameOwner(documentOwner(tab), renderedDocumentOwner))
const ownsCurrentDocument = () => sameOwner(renderedDocumentOwner, currentTab.value?.id ? documentOwner(currentTab.value) : null)
watch(() => editorStore.tabs.map(tab => [tab.id, tab.documentToken, !!tab.splitSession?.unified]), () => {
  sourceHistory.retain(editorStore.tabs.filter(tab => !tab.splitSession?.unified).map(documentOwner))
}, { flush: 'post' })
const currentSelection = () => ({ anchor: editor.value.getCursor('anchor'), head: editor.value.getCursor('head') })
const rememberSelection = () => {
  if (unified.value && editor.value && ownsCurrentDocument() && !isRenderingFromStore) {
    currentTab.value.splitSession.source = currentSelection()
    currentTab.value.splitSession.selectedSourceText = editor.value.getSelection()
    bus.emit('split:selection-changed')
  }
}
const handleSourceFocus = () => { if (unified.value && ownsCurrentDocument()) bus.emit('split:focus', 'source') }

// START_BLOCK_LOCKED_READ_ONLY
// C-40 T-004: while the active tab is locked (View › Lock Document) the
// source pane is read-only too — the lock is a document state, not a
// WYSIWYG-surface state (readOnly keeps selection/copy working).
// Unified sessions apply the Finder preview state to both panes; ordinary
// never-unified source mode retains its existing semantics.
const applyLockedReadOnly = () => {
  if (!editor.value) return
  // The lock is a document state: both split panes stay read-only in
  // dual editing (selection/copy keep working through readOnly).
  editor.value.setOption('readOnly', (currentTab.value?.locked || (unified.value && currentTab.value?.previewMode)) ? true : false)
}

watch(() => [currentTab.value?.locked, currentTab.value?.previewMode, unified.value], applyLockedReadOnly)
// END_BLOCK_LOCKED_READ_ONLY

watch(
  () => props.textDirection,
  (value, oldValue) => {
    if (value !== oldValue && editor.value) {
      setTextDirection(editor.value, value)
    }
  }
)

const getMarkdownAndCursor = (cm) => {
  let focus = cm.getCursor('head')
  let anchor = cm.getCursor('anchor')

  const markdown = cm.getValue()
  const convertToMuyaCursor = (cursor) => {
    const line = cm.getLine(cursor.line)
    const preLine = cm.getLine(cursor.line - 1)
    const nextLine = cm.getLine(cursor.line + 1)
    return adjustCursor(cursor, preLine, line, nextLine)
  }

  anchor = convertToMuyaCursor(anchor) // Selection start as Muya cursor
  focus = convertToMuyaCursor(focus) // Selection end as Muya cursor

  // Normalize cursor that `anchor` is always before `focus` because
  // this is the expected behavior in Muya.
  if (anchor && focus && (anchor.line > focus.line || (anchor.line === focus.line && anchor.ch > focus.ch))) {
    const tmpCursor = focus
    focus = anchor
    anchor = tmpCursor
  }
  return { cursor: { focus, anchor }, markdown }
}

/**
 * This is to write the OLD content of the editor before switching to another tab
 * @param id
 */
const prepareTabSwitch = () => {
  if (commitTimer.value) clearTimeout(commitTimer.value)
  const owner = renderedOwner()
  if (!owner || compositionFence.isArmed()) return
  if (owner.splitSession?.unified) {
    // The store flushes an outgoing unified owner before changing tabs.
    if (ownsCurrentDocument()) { rememberSelection(); bus.emit('split:flush') }
    return
  }
  const { cursor, markdown: newMarkdown } = getMarkdownAndCursor(editor.value)
  editorStore.LISTEN_FOR_CONTENT_CHANGE({
    id: owner.id,
    markdown: preserveSourceSyntax(owner.markdown, sourceSerialization ?? newMarkdown, newMarkdown),
    muyaIndexCursor: cursor
  })
}

const scrollToCords = (y) => {
  requestAnimationFrame(() => {
    // Ensures there we have scrolled to that position before the browser paints the next frame
    // prevents "flickers"
    if (!sourceCodeContainer.value) return
    sourceCodeContainer.value.scrollTop = y
  })
}

const handleFileChange = ({ id, documentToken, markdown: newMarkdown, muyaIndexCursor, scrollTop, contentReloaded }) => {
  const incoming = currentTab.value
  if (!editor.value || !incoming?.id || (id && id !== incoming.id)) return
  const nextOwner = documentOwner(incoming)
  if (documentToken && documentToken !== nextOwner.documentToken) return
  // Activation/reload producers update the canonical owner before emitting.
  // A tokenless delayed payload cannot import a retired document into it.
  if (typeof newMarkdown === 'string' && newMarkdown !== incoming.markdown) return
  if (compositionFence.markDeferred()) return
  const switching = !sameOwner(renderedDocumentOwner, nextOwner)
  if (switching) prepareTabSwitch()
  if (followSyncTimer) clearTimeout(followSyncTimer)
  followSyncTimer = null
  isRenderingFromStore = true
  let restored = false
  if (!unified.value && !props.mirror) {
    if (contentReloaded) sourceHistory.retire(nextOwner)
    // Set depth before attaching an ordinary Doc after a unified projection.
    editor.value.setOption('undoDepth', 200)
    const binding = sourceHistory.bind(editor.value, nextOwner, typeof newMarkdown === 'string' ? newMarkdown : incoming.markdown)
    sourceSerialization = binding.serialization
    restored = binding.restored
  } else {
    sourceHistory.release(editor.value)
    sourceHistory.retire(nextOwner)
    if (typeof newMarkdown === 'string' && newMarkdown !== editor.value.getValue()) editor.value.setValue(newMarkdown)
    sourceSerialization = editor.value.getValue()
  }
  tabId.value = incoming.id
  renderedDocumentOwner = nextOwner
  setTextDirection(editor.value, props.textDirection)
  const selection = incoming.splitSession?.source
  if (selection?.anchor && selection?.head) editor.value.setSelection(selection.anchor, selection.head, { scroll: false })
  else if (!restored) {
    if (muyaIndexCursor?.anchor && muyaIndexCursor?.focus) editor.value.setSelection(muyaIndexCursor.anchor, muyaIndexCursor.focus, { scroll: false })
    else if (unified.value) editor.value.setCursor({ line: 0, ch: 0 })
    else setCursorAtFirstLine(editor.value)
  }
  applyUnifiedKeys()
  isRenderingFromStore = false
  if (unified.value && props.splitActive) {
    alignToFraction()
    afterSplitLayout(alignToFraction)
  } else if (typeof scrollTop === 'number') scrollToCords(incoming.splitSession?.sourceScrollTop ?? scrollTop)
}

// Synchronous events can precede Vue activation; include lifetime replacement
// even when the visible tab id and pathname are reused.
watch(() => [currentTab.value?.id, currentTab.value?.documentToken], () => {
  const tab = currentTab.value
  if (editor.value && tab?.id && !ownsCurrentDocument()) handleFileChange(tab)
}, { flush: 'post' })

const handleInvalidateImageCache = () => {
  if (editor.value) {
    editor.value.invalidateImageCache()
  }
}

const handleSelectAll = () => {
  if (!sourceCode.value || unified.value) {
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
    editor.value.execCommand('selectAll')
  }
}

const handleImageAction = ({ id, result, alt }) => {
  const value = editor.value.getValue()
  const focus = editor.value.getCursor('focus')
  const anchor = editor.value.getCursor('anchor')
  const lines = value.split('\n')
  const index = lines.findIndex((line) => line.indexOf(id) > 0)

  if (index > -1) {
    const oldLine = lines[index]
    lines[index] = oldLine.replace(new RegExp(`!\\[${id}\\]\\(.*\\)`), `![${alt}](${result})`)
    const newValue = lines.join('\n')
    editor.value.setValue(newValue)
    const match = /(!\[.*\]\(.*\))/.exec(oldLine)
    if (!match) {
      // t('editor.sourceCode.imageStructureDeletedComment')
      return
    }
    const range = {
      start: match.index,
      end: match.index + match[1].length
    }
    const delta = alt.length + result.length + 5 - match[1].length

    const adjustPointer = (pointer) => {
      if (!pointer) {
        return
      }
      if (pointer.line !== index) {
        return
      }
      if (pointer.ch <= range.start) {
        // do nothing.
      } else if (pointer.ch > range.start && pointer.ch < range.end) {
        pointer.ch = range.start + alt.length + result.length + 5
      } else {
        pointer.ch += delta
      }
    }

    adjustPointer(focus)
    adjustPointer(anchor)
    if (focus && anchor) {
      editor.value.setSelection(anchor, focus, { scroll: true })
    } else {
      setCursorAtFirstLine()
    }
  }
}

// START_BLOCK_SOURCE_FOLLOW_SYNC
// C-SPLIT-DUAL-EDIT: while this pane is the split companion (splitEdit), it
// follows the tab markdown with the same 150 ms debounce as the muya side;
// the update is render-only (cursorActivity inert under the guard), the
// scroll position is kept, CodeMirror's own history is cleared (the unified
// muya history owns undo), and the remembered caret is translated and
// clamped into the new text instead of resetting to the document start.
const FOLLOW_SYNC_DELAY_MS = 150
let followSyncTimer = null
let isRenderingFromStore = false
const compositionFence = createCompositionFence()
const renderFromStore = () => {
  followSyncTimer = null
  const cm = editor.value
  const markdown = currentTab.value?.markdown
  if (!cm || !ownsCurrentDocument() || typeof markdown !== 'string' || cm.getValue() === markdown) return
  if (compositionFence.markDeferred()) return
  const old = cm.getValue()
  const selection = currentTab.value?.splitSession?.source || currentSelection()
  const next = { anchor: translateAndClamp(selection.anchor, old, markdown), head: translateAndClamp(selection.head, old, markdown) }
  const scroll = cm.getScrollInfo()
  isRenderingFromStore = true
  cm.setValue(markdown)
  sourceSerialization = cm.getValue()
  cm.clearHistory()
  cm.setSelection(next.anchor, next.head, { scroll: false })
  cm.scrollTo(scroll.left, scroll.top)
  if (unified.value) currentTab.value.splitSession.source = next
  isRenderingFromStore = false
  rememberSelection()
}
watch(() => props.markdown, () => {
  if (!unified.value && !props.splitEdit) return
  if (followSyncTimer) clearTimeout(followSyncTimer)
  followSyncTimer = setTimeout(renderFromStore, FOLLOW_SYNC_DELAY_MS)
})
const handleHistoryRestored = (meta) => {
  if (!ownsCurrentDocument()) return
  renderFromStore()
  const selection = meta?.source
  if (selection && editor.value) {
    isRenderingFromStore = true
    editor.value.setSelection(selection.anchor, selection.head, { scroll: false })
    isRenderingFromStore = false
    rememberSelection()
  }
}
// CodeMirror displays normalized line breaks; this is the rendered baseline,
// while the tab retains the exact canonical source and its disk checkpoint.
let sourceSerialization = null
const handleCompositionStart = () => { sourceSerialization = editor.value?.getValue(); compositionFence.arm() }
const captureCommittedSource = () => {
  const owner = renderedOwner()
  const cm = editor.value
  if (!owner || !cm || !ownsCurrentDocument()) return null
  const { cursor, markdown:nativeMarkdown } = getMarkdownAndCursor(cm)
  const markdown = preserveSourceSyntax(owner.markdown, sourceSerialization ?? nativeMarkdown, nativeMarkdown)
  sourceSerialization=nativeMarkdown
  if (markdown !== owner.markdown) {
    if (unified.value) bus.emit('split:source-edit', { id: owner.id, markdown, cursor, selection: currentSelection(), wordCount: getWordCount(markdown) })
    else editorStore.LISTEN_FOR_CONTENT_CHANGE({ id: owner.id, markdown, muyaIndexCursor: cursor, wordCount: getWordCount(markdown) })
  }
  return owner.markdown
}
const unregisterSaveSurface = registerDocumentSurface(() => renderedDocumentOwner, {
  isComposing: () => compositionFence.isArmed(),
  isAuthoritative: () => !props.mirror && (!unified.value || sourceFocused()),
  captureCommitted: captureCommittedSource
})
const handleCompositionEnd = () => {
  const deferred = compositionFence.release()
  captureCommittedSource()
  if (!ownsCurrentDocument()) { handleFileChange(currentTab.value); return }
  applyUnifiedKeys()
  if (deferred) renderFromStore()
}
// END_BLOCK_SOURCE_FOLLOW_SYNC

// START_BLOCK_SOURCE_RESIZE_REFRESH
// CodeMirror re-measures wrapped lines only on window resize; the Split View
// divider and the split toggle change the pane width without one.
let resizeObserver = null
let refreshFrame = 0

const observeContainerWidth = () => {
  const container = sourceCodeContainer.value
  if (!container || typeof ResizeObserver !== 'function') return
  let lastWidth = container.clientWidth
  resizeObserver = new ResizeObserver(() => {
    const width = container.clientWidth
    if (width === lastWidth) return
    lastWidth = width
    if (refreshFrame) cancelAnimationFrame(refreshFrame)
    refreshFrame = requestAnimationFrame(() => {
      refreshFrame = 0
      if (editor.value && !viewDestroyed.value) {
        editor.value.refresh()
        // C-SPLIT-SCROLL-SYNC: divider drags re-wrap this pane too; keep
        // the caret anchor centered and the rich pane aligned.
        if (props.splitActive && !props.mirror) {
          if (sourceFocused()) reanchorSourcePane()
          else alignToFraction()
        }
      }
    })
  })
  resizeObserver.observe(container)
}

const stopObservingContainer = () => {
  if (resizeObserver) resizeObserver.disconnect()
  resizeObserver = null
  if (refreshFrame) cancelAnimationFrame(refreshFrame)
  refreshFrame = 0
}
// END_BLOCK_SOURCE_RESIZE_REFRESH

// START_CONTRACT: alignSourcePane
//   PURPOSE: C-SPLIT-SCROLL-SYNC — pair this pane's scroller with the rich pane ('source' side): on mount and on split activation align to the rich pane's reading fraction; in source-mode split (editable CodeMirror) re-anchor on the caret line typewriter-style and align the rich mirror.
//   INPUTS: { props.mirror: Boolean, props.splitActive: Boolean }
//   OUTPUTS: { void }
//   SIDE_EFFECTS: writes scrollTop on this container and, via splitScrollSync.align, on the rich pane scroller (echo-guarded).
//   LINKS: .grace/changes/archive/C-SPLIT-SCROLL-SYNC T-303; util/splitScrollSync.js.
// END_CONTRACT: alignSourcePane
// START_BLOCK_SPLIT_ALIGN_SYNC
const afterSplitLayout = (fn) => {
  // Two frames: the re-wrap from the flex change settles before we measure.
  nextTick(() => requestAnimationFrame(() => requestAnimationFrame(fn)))
}

const alignToFraction = () => {
  splitScrollSync.align('source', splitScrollSync.fractionOf('rich') ?? 0)
}

const reanchorSourcePane = () => {
  const el = sourceCodeContainer.value
  const cm = editor.value
  if (!el) return
  if (!cm) {
    alignToFraction()
    return
  }
  const coords = cm.cursorCoords(null, 'window')
  if (coords && Number.isFinite(coords.top)) {
    const offset = contentOffsetOfRect(el, { top: coords.top })
    if (Number.isFinite(offset)) {
      el.scrollTop = computeAnchorTarget({
        anchorOffset: offset,
        viewportHeight: el.clientHeight,
        scrollHeight: el.scrollHeight
      })
    }
  }
  splitScrollSync.align('rich', scrollFraction(el))
}

watch(
  () => props.splitActive,
  (active) => {
    if (!active) return
    afterSplitLayout(() => {
      if (sourceFocused() || (!unified.value && sourceCode.value)) reanchorSourcePane()
      else alignToFraction()
    })
  }
)
// END_BLOCK_SPLIT_ALIGN_SYNC

const insertAsset = (image, alt = '') => {
  const cm = editor.value
  if (!cm || cm.getOption('readOnly')) return
  const id = tabId.value
  const owner = renderedDocumentOwner
  const target = cm.setBookmark(cm.getCursor('head'))
  bus.emit('split:insert-asset', { image, alt, id, complete: result => {
    const position = target.find()
    target.clear()
    if (!viewDestroyed.value && sameOwner(owner, renderedDocumentOwner) && ownsCurrentDocument() && position && result && !cm.getOption('readOnly')) {
      cm.replaceRange(`![${alt}](${result})`, position, position, '+input')
    }
  } })
}
const handleAssetInput = (cm, event) => {
  if (!unified.value) return
  if (cm.getOption('readOnly')) { event.preventDefault(); event.stopPropagation(); return }
  const data = event.clipboardData || event.dataTransfer
  const images = Array.from(data?.files || []).filter(file => /^image\//.test(file.type))
  if (!images.length) return
  event.preventDefault()
  event.stopPropagation()
  handleSourceFocus()
  images.forEach(image => insertAsset(image, image.name?.replace(/\.[^.]+$/, '') || ''))
}
const listenChange = () => {
  const cm = editor.value
  cm.on('cursorActivity', () => {
    if (unified.value) { rememberSelection(); return }
    if (isRenderingFromStore || viewDestroyed.value || !ownsCurrentDocument() || compositionFence.isArmed()) return
    const { cursor, markdown } = getMarkdownAndCursor(cm)
    const owner=editorStore.tabs.find(tab=>tab.id===tabId.value)
    if (owner && markdown !== owner.markdown && !compositionFence.isArmed()) captureCommittedSource()
    else editorStore.updateMuyaIndexCursor(tabId.value, cursor)
  })
  cm.on('focus', handleSourceFocus)
  cm.on('paste', handleAssetInput)
  cm.on('drop', handleAssetInput)
  cm.on('beforeChange', (instance, change) => {
    if (unified.value && /^(undo|redo)$/.test(change.origin)) {
      change.cancel()
      queueMicrotask(() => bus.emit(change.origin))
    }
  })
  cm.on('changes', () => {
    if (!unified.value && !isRenderingFromStore && !viewDestroyed.value && ownsCurrentDocument()) {
      if (!compositionFence.isArmed()) captureCommittedSource()
      return
    }
    if (!unified.value || isRenderingFromStore || viewDestroyed.value || !ownsCurrentDocument()) return
    const { cursor, markdown: nativeMarkdown } = getMarkdownAndCursor(cm)
    const markdown = preserveSourceSyntax(currentTab.value.markdown, sourceSerialization ?? nativeMarkdown, nativeMarkdown)
    sourceSerialization = nativeMarkdown
    if (markdown === currentTab.value.markdown) return
    const wordCount = getWordCount(markdown)
    bus.emit('split:source-edit', { id: tabId.value, markdown, cursor, selection: currentSelection(), wordCount })
    cm.clearHistory()
  })
}
let searchState = { value: '', matches: [], index: -1, opt: {} }
let searchMarks = []
const runSearch = (value = searchState.value, opt = searchState.opt) => {
  searchMarks.forEach(mark => mark.clear())
  searchState = { ...sourceSearch(editor.value.getValue(), value, opt), opt }
  searchMarks = searchState.matches.map(match => editor.value.markText(match.start, match.end, { className: 'ag-highlight' }))
  editorStore.SEARCH(searchState)
  return searchState
}
const handleSourceCommand = async ({ command, payload }) => {
  const cm = editor.value
  if (!cm || !sourceFocused()) return
  if (command === 'focus') {
    cm.getInputField().focus({ preventScroll: true })
    return
  }
  if (command === 'selectAll') { cm.execCommand('selectAll'); return }
  if (command === 'search') { runSearch(payload.value, payload.opt); return }
  if (command === 'find') {
    if (!searchState.matches.length) return
    searchState.index = (searchState.index + (payload === 'prev' ? -1 : 1) + searchState.matches.length) % searchState.matches.length
    const match = searchState.matches[searchState.index]
    cm.setSelection(match.start, match.end)
    cm.scrollIntoView(match.start)
    editorStore.SEARCH(searchState)
    return
  }
  if (cm.getOption('readOnly')) return
  bus.emit('split:flush')
  if (command === 'insertAsset') { insertAsset(payload.image, payload.alt); return }
  if (command === 'pasteAsPlainText') {
    const owner = renderedDocumentOwner
    const { readText } = await import('@tauri-apps/plugin-clipboard-manager')
    const text = await readText()
    if (sameOwner(owner, renderedDocumentOwner) && ownsCurrentDocument() && !cm.getOption('readOnly') && text) cm.replaceSelection(text, 'end', '+input')
    return
  }
  if (command === 'replace') {
    const matches = searchState.matches
    const selected = payload.opt.isSingle ? [matches[Math.max(0, searchState.index)]].filter(Boolean) : matches
    cm.operation(() => selected.slice().reverse().forEach(match => cm.replaceRange(payload.value, match.start, match.end, '+input')))
    runSearch()
    return
  }
  if (command === 'transform') {
    if (cm.somethingSelected()) cm.replaceSelection(payload, 'end', '+input')
    else cm.replaceRange(payload, { line: 0, ch: 0 }, cm.posFromIndex(cm.getValue().length), '+input')
    return
  }
  if (command === 'formatDocument') {
    const formatted = formatMarkdown(cm.getValue())
    if (formatted !== null) cm.replaceRange(formatted, { line: 0, ch: 0 }, cm.posFromIndex(cm.getValue().length), '+input')
    return
  }
  const result = applySourceCommand(cm.getValue(), currentSelection(), command, payload)
  if (!result) return
  if (result.reason) { notice.notify({ title: 'Markdown source', message: result.reason, type: 'info' }); return }
  cm.operation(() => {
    cm.replaceRange(result.text, cm.posFromIndex(result.from), cm.posFromIndex(result.to), '+input')
    cm.setSelection(cm.posFromIndex(result.anchor), cm.posFromIndex(result.head))
  })
}
const handleSourceSelection = (request) => {
  if (sourceFocused() && editor.value) {
    request.selected = editor.value.getSelection()
    request.text = request.selected || editor.value.getValue()
  }
}
const applyUnifiedKeys = () => {
  const cm = editor.value
  if (!cm || !ownsCurrentDocument()) return
  if (unified.value) {
    if (compositionFence.markDeferred()) return
    const rendering = isRenderingFromStore
    isRenderingFromStore = true
    const selection = currentSelection()
    sourceHistory.retire(renderedDocumentOwner)
    if (sourceHistory.release(cm)) {
      cm.setValue(currentTab.value.markdown)
      sourceSerialization = cm.getValue()
      cm.setSelection(selection.anchor, selection.head, { scroll: false })
    }
    isRenderingFromStore = rendering
    cm.setOption('undoDepth', 0)
    cm.clearHistory()
  } else cm.setOption('undoDepth', 200)
}
watch(unified, applyUnifiedKeys)

// One config for both panes so theme and gutter never drift apart; the
// read-only mirror differs only in focus, readOnly and the active line.
const buildCodeMirrorConfig = ({ value, textDirection, readOnly }) => {
  const config = {
    value,
    lineNumbers: true,
    // C-SPLIT-DUAL-EDIT: the split companion must not steal focus from
    // the rich pane at mount (the anchor re-centering reads muya's caret);
    // the full-window source editor keeps its autofocus.
    autofocus: !readOnly && !props.splitEdit,
    lineWrapping: true,
    styleActiveLine: !readOnly,
    direction: textDirection,
    viewportMargin: Infinity,
    lineNumberFormatter(line) {
      if (line % 10 === 0 || line === 1) {
        return line
      } else {
        return ''
      }
    }
  }
  if (readOnly) config.readOnly = true
  // C-SPLIT-DUAL-EDIT: while the unified muya history owns the document,
  // undo/redo from this pane route to it (CodeMirror's own stack is kept
  // empty; extraKeys take precedence over the default keymap).
  {
    const historyCommand = (name) => cm => { if (unified.value) bus.emit(name); else cm.execCommand(name) }
    config.extraKeys = {
      ...config.extraKeys,
      'Cmd-Z': historyCommand('undo'),
      'Ctrl-Z': historyCommand('undo'),
      'Shift-Cmd-Z': historyCommand('redo'),
      'Cmd-Y': historyCommand('redo'),
      'Ctrl-Y': historyCommand('redo'),
      'Ctrl-Shift-Z': historyCommand('redo')
    }
  }
  const sourceShortcut = (command, payload) => cm => {
    if (!unified.value) return codeMirror.Pass
    handleSourceFocus()
    handleSourceCommand({ command, payload })
  }
  Object.assign(config.extraKeys, {
    'Cmd-B': sourceShortcut('format', 'strong'), 'Ctrl-B': sourceShortcut('format', 'strong'),
    'Cmd-I': sourceShortcut('format', 'em'), 'Ctrl-I': sourceShortcut('format', 'em'),
    'Shift-Cmd-D': sourceShortcut('duplicate'), 'Shift-Ctrl-D': sourceShortcut('duplicate'),
    'Shift-Cmd-N': sourceShortcut('createParagraph'), 'Shift-Ctrl-N': sourceShortcut('createParagraph'),
    'Shift-Cmd-Backspace': sourceShortcut('deleteParagraph'), 'Shift-Ctrl-Backspace': sourceShortcut('deleteParagraph')
  })
  for (let level = 1; level <= 6; level++) {
    config.extraKeys[`Cmd-${level}`] = sourceShortcut('paragraph', `heading ${level}`)
    config.extraKeys[`Ctrl-${level}`] = sourceShortcut('paragraph', `heading ${level}`)
  }
  if (railscastsThemes.includes(theme.value)) {
    config.theme = 'railscasts'
  } else if (oneDarkThemes.includes(theme.value)) {
    config.theme = 'one-dark'
  }
  return config
}

onMounted(() => {
  const { id } = currentTab.value
  // reset currentTab scrollTop position because the codeMirror scroll position is completely different from the muya scroll position
  // reset blocks as well because the blocks are only valid in muya
  // reset cursor because this is a direct "key-cursor", not a muyaIndexCursor, which is {focus: number, anchor: number}
  // The document editor (source mode) owns and resets the tab's muya-side
  // state; the split companion (C-SPLIT-DUAL-EDIT) must not clear the rich
  // pane's saved scroll/cursor.
  if (!props.splitEdit && !unified.value) {
    currentTab.value.scrollTop = undefined
    currentTab.value.blocks = undefined
    currentTab.value.cursor = undefined
  }

  const { markdown, muyaIndexCursor, textDirection } = props
  const container = sourceCodeContainer.value
  container.addEventListener('scroll', handleScroll)
  const codeMirrorConfig = buildCodeMirrorConfig({ value: markdown, textDirection, readOnly: false })

  bus.on('file-loaded', handleFileChange)
  bus.on('invalidate-image-cache', handleInvalidateImageCache)
  bus.on('file-changed', handleFileChange)
  bus.on('selectAll', handleSelectAll)
  bus.on('image-action', handleImageAction)
  bus.on('split:source-command', handleSourceCommand)
  bus.on('split:source-selection', handleSourceSelection)
  bus.on('split:history-restored', handleHistoryRestored)

  // For some reason, code mirror does not seem to play well with Vue's refs if we reference editor.value directly.
  // See https://github.com/codemirror/codemirror5/issues/6886 - hence, we need to use a local variable first.
  const codeMirrorInstance = codeMirror(container, codeMirrorConfig)

  setMode(codeMirrorInstance, 'markdown')

  codeMirrorInstance.on('contextmenu', (cm, event) => {
    event.preventDefault()
    event.stopPropagation()
    handleSourceFocus()
    bus.emit('split:contextmenu', event)
  })

  let restoredOrdinary = false
  if (!unified.value && !props.mirror) {
    const binding = sourceHistory.bind(codeMirrorInstance, documentOwner(currentTab.value), currentTab.value.markdown)
    restoredOrdinary = binding.restored
  }
  setTextDirection(codeMirrorInstance, textDirection)
  const savedSelection = currentTab.value?.splitSession?.source
  if (savedSelection) {
    codeMirrorInstance.setSelection(savedSelection.anchor, savedSelection.head, { scroll: false })
  } else if (!restoredOrdinary && muyaIndexCursor && muyaIndexCursor.anchor && muyaIndexCursor.focus) {
    const { anchor, focus } = muyaIndexCursor
    codeMirrorInstance.setSelection(anchor, focus, { scroll: !unified.value })
  } else if (!restoredOrdinary) {
    if (unified.value) codeMirrorInstance.setCursor({ line: 0, ch: 0 })
    else setCursorAtFirstLine(codeMirrorInstance)
  }

  editor.value = codeMirrorInstance
  tabId.value = id
  sourceSerialization = codeMirrorInstance.getValue()
  renderedDocumentOwner = currentTab.value?.id === id ? documentOwner(currentTab.value) : null

  // C-40 T-004: a tab already locked when the source pane mounts (source
  // mode toggled while locked) starts read-only. Unlocked mounts keep
  // CodeMirror's default and never touch the option.
  applyLockedReadOnly()
  applyUnifiedKeys()

  listenChange()
  observeContainerWidth()

  // C-SPLIT-SCROLL-SYNC: pair the editable pane too; when split is already
  // on (source mode + split), align it to the rich pane's fraction.
  splitScrollSync.attach('source', sourceCodeContainer.value)
  if (props.splitActive) { alignToFraction(); afterSplitLayout(alignToFraction) }

  // C-SPLIT-DUAL-EDIT: the IME fence listens on CodeMirror's input field;
  // a composition in THIS pane defers its store-driven re-renders.
  const inputField = editor.value?.getInputField?.()
  if (inputField) {
    inputField.addEventListener('compositionstart', handleCompositionStart)
    inputField.addEventListener('compositionend', handleCompositionEnd)
  }
})

onBeforeUnmount(() => {
  unregisterSaveSurface()
  rememberSelection()
  if (unified.value) bus.emit('split:flush')
  const input = editor.value?.getInputField?.()
  input?.removeEventListener('compositionstart', handleCompositionStart)
  input?.removeEventListener('compositionend', handleCompositionEnd)
  viewDestroyed.value = true
  if (commitTimer.value) clearTimeout(commitTimer.value)
  if (followSyncTimer) clearTimeout(followSyncTimer)
  followSyncTimer = null
  stopObservingContainer()
  // C-SPLIT-SCROLL-SYNC: leave the scroll pair cleanly.
  splitScrollSync.detach('source')

  bus.off('file-loaded', handleFileChange)
  bus.off('invalidate-image-cache', handleInvalidateImageCache)
  bus.off('file-changed', handleFileChange)
  bus.off('selectAll', handleSelectAll)
  bus.off('image-action', handleImageAction)
  bus.off('split:source-command', handleSourceCommand)
  bus.off('split:source-selection', handleSourceSelection)
  bus.off('split:history-restored', handleHistoryRestored)
  searchMarks.forEach(mark => mark.clear())

  try {
    const owner = renderedOwner()
    if (owner && editor.value && !owner.splitSession?.unified && !compositionFence.isArmed()) {
      const { cursor, markdown: newMarkdown } = getMarkdownAndCursor(editor.value)
      bus.emit('file-changed', {
        id: tabId.value,
        markdown: preserveSourceSyntax(owner.markdown, sourceSerialization ?? newMarkdown, newMarkdown),
        muyaIndexCursor: cursor,
        renderCursor: true
      })
    }

  } finally {
    if (compositionFence.isArmed() && renderedDocumentOwner) sourceHistory.retire(renderedDocumentOwner)
    sourceHistory.release(editor.value)
    sourceCodeContainer.value.removeEventListener('scroll', handleScroll)
  }
})

const handleScroll = debounce(() => {
  if (!tabId.value || !sourceCodeContainer.value) {
    return
  }
  if (viewDestroyed.value || !ownsCurrentDocument()) return
  if (unified.value) currentTab.value.splitSession.sourceScrollTop = sourceCodeContainer.value.scrollTop
  else editorStore.updateScrollPosition(tabId.value, sourceCodeContainer.value.scrollTop)
}, 100)
</script>

<style>
.source-code {
  height: calc(100vh - var(--titleBarHeight));
  box-sizing: border-box;
  overflow: auto;
}
.source-code .CodeMirror {
  height: auto;
  margin: 50px auto;
  max-width: var(--editorAreaWidth);
  background: transparent;
}
.source-code .CodeMirror-gutters {
  border-right: none;
  background-color: transparent;
}
.source-code .CodeMirror-activeline-background,
.source-code .CodeMirror-activeline-gutter {
  background: var(--floatHoverColor);
}
</style>
