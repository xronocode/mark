<template>
  <div ref="sourceCodeContainer" class="source-code"></div>
</template>

<script setup>
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { useEditorStore } from '@/store/editor'
import { usePreferencesStore } from '@/store/preferences'
import { storeToRefs } from 'pinia'
import codeMirror, { setMode, setCursorAtLastLine, setTextDirection } from '../../codeMirror'
import { wordCount as getWordCount } from 'muya/lib/utils'
import { adjustCursor } from '../../util'
import bus from '../../bus'
import { oneDarkThemes, railscastsThemes } from '@/config'

const props = defineProps({
  markdown: String,
  cursor: Object,
  textDirection: {
    type: String,
    required: true
  }
})

const editorStore = useEditorStore()
const preferencesStore = usePreferencesStore()

const sourceCodeContainer = ref(null)

const editor = ref(null)
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

const prepareTabSwitch = () => {
  if (commitTimer.value) clearTimeout(commitTimer.value)
  if (tabId.value) {
    const { cursor, markdown: newMarkdown } = getMarkdownAndCursor(editor.value)
    editorStore.LISTEN_FOR_CONTENT_CHANGE({ id: tabId.value, markdown: newMarkdown, cursor })
    tabId.value = null // invalidate tab id
  }
}

const handleFileChange = ({ id, markdown: newMarkdown, cursor }) => {
  prepareTabSwitch()

  if (typeof newMarkdown === 'string') {
    editor.value.setValue(newMarkdown)
  }
  // Cursor is null when loading a file or creating a new tab in source code mode.
  if (cursor) {
    const { anchor, focus } = cursor
    editor.value.setSelection(anchor, focus, { scroll: true }) // Scroll the focus into view.
  } else {
    setCursorAtLastLine(editor.value)
  }
  tabId.value = id
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

  if (editor.value && editor.value.hasFocus()) {
    editor.value.execCommand('selectAll')
  } else {
    const activeElement = document.activeElement
    const nodeName = activeElement.nodeName
    if (nodeName === 'INPUT' || nodeName === 'TEXTAREA') {
      activeElement.select()
    }
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
      // User maybe delete `![]()` structure, and the match is null.
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
      setCursorAtLastLine()
    }
  }
}

const listenChange = () => {
  editor.value.on('cursorActivity', (cm) => {
    const { cursor, markdown: newMarkdown } = getMarkdownAndCursor(cm)
    // Attention: the cursor may be `{focus: null, anchor: null}` when press `backspace`
    const wordCount = getWordCount(newMarkdown)
    if (commitTimer.value) clearTimeout(commitTimer.value)
    commitTimer.value = setTimeout(() => {
      // See "beforeDestroy" note
      if (!viewDestroyed.value) {
        if (tabId.value) {
          editorStore.LISTEN_FOR_CONTENT_CHANGE({
            id: tabId.value,
            markdown: newMarkdown,
            wordCount,
            cursor
          })
        } else {
          // This may occur during tab switching but should not occur otherwise.
          console.warn(
            'LISTEN_FOR_CONTENT_CHANGE: Cannot commit changes because not tab id was set!'
          )
        }
      }
    }, 1000)
  })
}

onMounted(() => {
  const { id } = currentTab.value
  const { markdown, cursor, textDirection } = props
  const container = sourceCodeContainer.value
  const codeMirrorConfig = {
    value: markdown,
    lineNumbers: true,
    autofocus: true,
    lineWrapping: true,
    styleActiveLine: true,
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

  if (railscastsThemes.includes(theme.value)) {
    codeMirrorConfig.theme = 'railscasts'
  } else if (oneDarkThemes.includes(theme.value)) {
    codeMirrorConfig.theme = 'one-dark'
  }

  editor.value = codeMirror(container, codeMirrorConfig)

  bus.on('file-loaded', handleFileChange)
  bus.on('invalidate-image-cache', handleInvalidateImageCache)
  bus.on('file-changed', handleFileChange)
  bus.on('selectAll', handleSelectAll)
  bus.on('image-action', handleImageAction)

  setMode(editor.value, 'markdown')
  listenChange()

  editor.value.on('contextmenu', (cm, event) => {
    event.preventDefault()
    event.stopPropagation()
  })

  if (cursor && cursor.anchor && cursor.focus) {
    const { anchor, focus } = cursor
    editor.value.setSelection(anchor, focus, { scroll: true })
  } else {
    setCursorAtLastLine(editor.value)
  }
  tabId.value = id
})

onBeforeUnmount(() => {
  viewDestroyed.value = true
  if (commitTimer.value) clearTimeout(commitTimer.value)

  bus.off('file-loaded', handleFileChange)
  bus.off('invalidate-image-cache', handleInvalidateImageCache)
  bus.off('file-changed', handleFileChange)
  bus.off('selectAll', handleSelectAll)
  bus.off('image-action', handleImageAction)

  const { cursor, markdown: newMarkdown } = getMarkdownAndCursor(editor.value)
  bus.emit('file-changed', { id: tabId.value, markdown: newMarkdown, cursor, renderCursor: true })
})
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
