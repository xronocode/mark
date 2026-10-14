<template>
  <div class="diff-view">
    <div class="diff-header">
      <span class="diff-side">{{ t('diffView.current') }}</span>
      <span class="diff-side">{{ t('diffView.baseline') }}</span>
      <button type="button" class="diff-exit" @click="exitDiff">{{ t('diffView.exit') }} <kbd>{{ exitShortcut }}</kbd></button>
    </div>
    <div ref="diffContainer" class="diff-body"></div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { usePreferencesStore } from '@/store/preferences'
import { storeToRefs } from 'pinia'
import { oneDarkThemes, railscastsThemes } from '@/config'
import DiffMatchPatch from 'diff-match-patch'
import { useEditorStore } from '@/store/editor'
import { t } from '@/i18n'
import { isOsx } from '@/util'
import notice from '@/services/notification'

import 'codemirror/lib/codemirror.css'
import 'codemirror/addon/merge/merge.css'
import 'codemirror/theme/railscasts.css'

const props = defineProps({
  markdown: { type: String, default: '' },
  pathname: { type: String, default: '' }
})

const preferencesStore = usePreferencesStore()
const { theme } = storeToRefs(preferencesStore)

const editorStore = useEditorStore()
const diffContainer = ref(null)
let mergeView = null
const exitShortcut = isOsx ? '⌘D' : 'Ctrl+D'

// The diff view replaces the editing surface (index.vue v-show), so it must
// always offer a way back: a header button, and an automatic exit when the
// baseline cannot be shown (untitled tab, missing/unreadable .before or git
// baseline) — the error becomes a notification instead of a dead end.
const exitDiff = () => {
  const tab = editorStore.currentFile
  if (tab && tab.diffMode) tab.diffMode = false
}

const failAndExit = (message) => {
  console.warn(`[editor][diff][BLOCK_DIFF_UNAVAILABLE] ${message}`)
  notice.notify({ title: t('diffView.unavailable'), message, type: 'warning' })
  exitDiff()
}

const getTheme = () => {
  if (railscastsThemes.includes(theme.value)) return 'railscasts'
  if (oneDarkThemes.includes(theme.value)) return 'one-dark'
  return 'default'
}

const destroyMergeView = () => {
  if (mergeView) {
    const wrap = mergeView.wrap
    if (wrap && wrap.parentNode) {
      wrap.parentNode.removeChild(wrap)
    }
    mergeView = null
  }
}

const createMergeView = async () => {
  destroyMergeView()

  if (!props.pathname) {
    failAndExit(t('diffView.noPath'))
    return
  }

  let baseline
  try {
    baseline = await invoke('mt_diff_baseline', { path: props.pathname })
  } catch (e) {
    failAndExit(typeof e === 'string' ? e : (e?.message || t('diffView.noBaseline')))
    return
  }

  if (!diffContainer.value) return

  // CodeMirror merge addon requires these globals
  window.diff_match_patch = DiffMatchPatch
  window.DIFF_DELETE = -1
  window.DIFF_INSERT = 1
  window.DIFF_EQUAL = 0

  // Dynamically import the merge addon after globals are set
  await import('codemirror/addon/merge/merge')
  const CodeMirror = window.CodeMirror
  if (!CodeMirror || !CodeMirror.MergeView) {
    failAndExit('CodeMirror MergeView not available')
    return
  }

  const cmTheme = getTheme()

  mergeView = CodeMirror.MergeView(diffContainer.value, {
    value: props.markdown,
    orig: baseline,
    lineNumbers: true,
    mode: 'text/x-markdown',
    readOnly: true,
    theme: cmTheme,
    collapseIdentical: true,
    connect: 'align'
  })

  const totalLines = props.markdown.split('\n').length
  console.error(`[editor][diff][BLOCK_DIFF_RENDERED mode=inline lines_total=${totalLines}]`)
}

watch(() => props.markdown, (val) => {
  if (mergeView) {
    mergeView.editor().setValue(val)
  }
})

watch(() => props.pathname, () => {
  createMergeView()
})

onMounted(() => {
  createMergeView()
})

onBeforeUnmount(() => {
  destroyMergeView()
})
</script>

<style>
.diff-view {
  height: calc(100vh - var(--titleBarHeight));
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
}
.diff-header {
  flex: 0 0 auto;
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  align-items: center;
  gap: 12px;
  padding: 6px 12px;
  border-bottom: 1px solid var(--floatBorderColor, rgba(128, 128, 128, 0.25));
  color: var(--editorColor);
  font-size: 12px;
}
.diff-side {
  opacity: 0.7;
}
.diff-exit {
  font: inherit;
  color: inherit;
  background: transparent;
  border: 1px solid var(--floatBorderColor, rgba(128, 128, 128, 0.35));
  border-radius: 6px;
  padding: 3px 10px;
  cursor: pointer;
}
.diff-exit:hover {
  background: var(--floatHoverColor, rgba(128, 128, 128, 0.15));
}
.diff-exit kbd {
  font-family: inherit;
  opacity: 0.6;
  margin-left: 6px;
}
.diff-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
}
.diff-body .CodeMirror-merge {
  height: 100%;
}
.diff-view .CodeMirror {
  background: transparent;
}
.diff-view .CodeMirror-gutters {
  border-right: none;
  background-color: transparent;
}
</style>
