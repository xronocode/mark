<!-- MODULE_CONTRACT
  PURPOSE: Host CodeMirror Source Code mode and commit edits to the active tab; with `mirror` (C-29 Split View) host a read-only CodeMirror copy of the tab instead.
  SCOPE: CodeMirror lifecycle, cursor/scroll synchronization, and file event handling. Mirror mode: readOnly, no store writes, no bus listeners, no tab-state resets, debounced re-render from the markdown prop.
  DEPENDS: editor/preferences stores, bus, CodeMirror adapter.
  ROLE: RUNTIME
END_MODULE_CONTRACT
CHANGE_SUMMARY: 2026-08-10 v2.1.7 rebinds tab identity after file-loaded events and guards null unmount commits.
  2026-10-13 C-29: `mirror` prop — read-only Split View pane; renders from props.markdown 150 ms after changes and never commits, emits or resets tab state.
  2026-10-13 C-29 live-smoke fix: CodeMirror instance held in shallowRef. Method calls through the deep ref's Proxy (setValue on file-changed, refresh) left proxied line handles in the display, so the next click or arrow key threw `info.map` in WKWebView and the caret jumped or ignored the click.
  2026-10-13 C-29 live-smoke fix: container ResizeObserver calls cm.refresh(). With lineWrapping CodeMirror re-measures only on window resize, so dragging the split divider left the caret drawn at the pre-wrap line position.
-->
<template>
  <div ref="sourceCodeContainer" class="source-code"></div>
</template>

<script setup>
import { ref, shallowRef, watch, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { useEditorStore } from '@/store/editor'
import { usePreferencesStore } from '@/store/preferences'
import { storeToRefs } from 'pinia'
import codeMirror, { setMode, setCursorAtFirstLine, setTextDirection } from '../../codeMirror'
import { debounce, wordCount as getWordCount } from 'muya/lib/utils'
import { adjustCursor } from '../../util'
import bus from '../../bus'
import { oneDarkThemes, railscastsThemes } from '@/config'

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
  }
})

const editorStore = useEditorStore()
const preferencesStore = usePreferencesStore()

const sourceCodeContainer = ref(null)

// shallowRef: a deep ref would hand CodeMirror a reactive Proxy as `this`, so
// the display caches proxied line handles that never === the raw ones and
// measurement throws `info.map` (codemirror5#6886).
const editor = shallowRef(null)
const commitTimer = ref(null)
const viewDestroyed = ref(false)
const tabId = ref(null)

const { theme, sourceCode } = storeToRefs(preferencesStore)
const { currentFile: currentTab } = storeToRefs(editorStore)

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
  if (anchor && focus && anchor.line > focus.line) {
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
  if (tabId.value) {
    const { cursor, markdown: newMarkdown } = getMarkdownAndCursor(editor.value)
    editorStore.LISTEN_FOR_CONTENT_CHANGE({
      id: tabId.value,
      markdown: newMarkdown,
      muyaIndexCursor: cursor
    })
    tabId.value = null
  }
}

const scrollToCords = (y) => {
  requestAnimationFrame(() => {
    // Ensures there we have scrolled to that position before the browser paints the next frame
    // prevents "flickers"
    if (!sourceCodeContainer.value) return
    sourceCodeContainer.value.scrollTop = y
  })
}

const handleFileChange = ({ id, markdown: newMarkdown, muyaIndexCursor, scrollTop }) => {
  if (!editor.value) return

  if (id && currentTab.value?.id && currentTab.value.id !== id) prepareTabSwitch()
  if (id) tabId.value = id

  if (typeof newMarkdown === 'string') {
    editor.value.setValue(newMarkdown)
  }

  // t('editor.sourceCode.cursorNullComment')

  if (muyaIndexCursor) {
    const { anchor, focus } = muyaIndexCursor

    editor.value.setSelection(anchor, focus, { scroll: true }) // Scroll the focus into view.
  } else {
    setCursorAtFirstLine(editor.value)
  }

  if (typeof scrollTop === 'number') {
    scrollToCords(scrollTop)
  }
}

const handleInvalidateImageCache = () => {
  if (editor.value) {
    editor.value.invalidateImageCache()
  }
}

const handleSelectAll = () => {
  if (!sourceCode.value) {
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

// START_BLOCK_SOURCE_MIRROR_SYNC
// C-29: the read-only Split View copy follows the tab markdown with the same
// 150 ms debounce as the muya mirror; scroll position is kept across updates.
const MIRROR_SYNC_DELAY_MS = 150
let mirrorSyncTimer = null

const renderMirror = () => {
  mirrorSyncTimer = null
  const cm = editor.value
  const markdown = props.markdown
  if (!cm || typeof markdown !== 'string' || cm.getValue() === markdown) return
  const scrollTop = sourceCodeContainer.value ? sourceCodeContainer.value.scrollTop : 0
  cm.setValue(markdown)
  if (sourceCodeContainer.value) sourceCodeContainer.value.scrollTop = scrollTop
}

watch(
  () => props.markdown,
  () => {
    if (!props.mirror) return
    if (mirrorSyncTimer) clearTimeout(mirrorSyncTimer)
    mirrorSyncTimer = setTimeout(renderMirror, MIRROR_SYNC_DELAY_MS)
  }
)
// END_BLOCK_SOURCE_MIRROR_SYNC

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
      if (editor.value && !viewDestroyed.value) editor.value.refresh()
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

const listenChange = () => {
  editor.value.on('cursorActivity', (cm) => {
    const { cursor, markdown: newMarkdown } = getMarkdownAndCursor(cm)
    // Attention: the cursor may be `{focus: null, anchor: null}` when press `backspace`
    const wordCount = getWordCount(newMarkdown)
    // See "beforeDestroy" note
    if (!viewDestroyed.value) {
      if (tabId.value) {
        editorStore.LISTEN_FOR_CONTENT_CHANGE({
          id: tabId.value,
          markdown: newMarkdown,
          wordCount,
          muyaIndexCursor: cursor
        })
      } else {
        // This may occur during tab switching but should not occur otherwise.
        console.warn('LISTEN_FOR_CONTENT_CHANGE: Cannot commit changes because not tab id was set!')
      }
    }
  })
}

// One config for both panes so theme and gutter never drift apart; the
// read-only mirror differs only in focus, readOnly and the active line.
const buildCodeMirrorConfig = ({ value, textDirection, readOnly }) => {
  const config = {
    value,
    lineNumbers: true,
    autofocus: !readOnly,
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
  if (railscastsThemes.includes(theme.value)) {
    config.theme = 'railscasts'
  } else if (oneDarkThemes.includes(theme.value)) {
    config.theme = 'one-dark'
  }
  return config
}

const mountMirror = () => {
  const { markdown, textDirection } = props
  const codeMirrorConfig = buildCodeMirrorConfig({ value: markdown || '', textDirection, readOnly: true })
  const codeMirrorInstance = codeMirror(sourceCodeContainer.value, codeMirrorConfig)
  setMode(codeMirrorInstance, 'markdown')
  editor.value = codeMirrorInstance
}

onMounted(() => {
  if (props.mirror) {
    mountMirror()
    observeContainerWidth()
    return
  }
  const { id } = currentTab.value
  // reset currentTab scrollTop position because the codeMirror scroll position is completely different from the muya scroll position
  // reset blocks as well because the blocks are only valid in muya
  // reset cursor because this is a direct "key-cursor", not a muyaIndexCursor, which is {focus: number, anchor: number}
  currentTab.value.scrollTop = undefined
  currentTab.value.blocks = undefined
  currentTab.value.cursor = undefined

  const { markdown, muyaIndexCursor, textDirection } = props
  const container = sourceCodeContainer.value
  container.addEventListener('scroll', handleScroll)
  const codeMirrorConfig = buildCodeMirrorConfig({ value: markdown, textDirection, readOnly: false })

  bus.on('file-loaded', handleFileChange)
  bus.on('invalidate-image-cache', handleInvalidateImageCache)
  bus.on('file-changed', handleFileChange)
  bus.on('selectAll', handleSelectAll)
  bus.on('image-action', handleImageAction)

  // For some reason, code mirror does not seem to play well with Vue's refs if we reference editor.value directly.
  // See https://github.com/codemirror/codemirror5/issues/6886 - hence, we need to use a local variable first.
  const codeMirrorInstance = codeMirror(container, codeMirrorConfig)

  setMode(codeMirrorInstance, 'markdown')

  codeMirrorInstance.on('contextmenu', (cm, event) => {
    event.preventDefault()
    event.stopPropagation()
  })

  if (muyaIndexCursor && muyaIndexCursor.anchor && muyaIndexCursor.focus) {
    const { anchor, focus } = muyaIndexCursor
    codeMirrorInstance.setSelection(anchor, focus, { scroll: true })
  } else {
    setCursorAtFirstLine(codeMirrorInstance)
  }

  editor.value = codeMirrorInstance
  tabId.value = id

  listenChange()
  observeContainerWidth()
})

onBeforeUnmount(() => {
  viewDestroyed.value = true
  if (commitTimer.value) clearTimeout(commitTimer.value)
  if (mirrorSyncTimer) clearTimeout(mirrorSyncTimer)
  mirrorSyncTimer = null
  stopObservingContainer()
  if (props.mirror) return

  bus.off('file-loaded', handleFileChange)
  bus.off('invalidate-image-cache', handleInvalidateImageCache)
  bus.off('file-changed', handleFileChange)
  bus.off('selectAll', handleSelectAll)
  bus.off('image-action', handleImageAction)

  if (tabId.value && editor.value) {
    const { cursor, markdown: newMarkdown } = getMarkdownAndCursor(editor.value)
    bus.emit('file-changed', {
      id: tabId.value,
      markdown: newMarkdown,
      muyaIndexCursor: cursor,
      renderCursor: true
    })
  }

  sourceCodeContainer.value.removeEventListener('scroll', handleScroll)
})

const handleScroll = debounce(() => {
  if (!tabId.value || !sourceCodeContainer.value) {
    return
  }
  editorStore.updateScrollPosition(tabId.value, sourceCodeContainer.value.scrollTop)
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
