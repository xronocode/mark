<template>
  <div ref="diffContainer" class="diff-view">
    <div v-if="error" class="diff-error">{{ error }}</div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { usePreferencesStore } from '@/store/preferences'
import { storeToRefs } from 'pinia'
import { oneDarkThemes, railscastsThemes } from '@/config'
import DiffMatchPatch from 'diff-match-patch'

import 'codemirror/lib/codemirror.css'
import 'codemirror/addon/merge/merge.css'
import 'codemirror/theme/railscasts.css'

const props = defineProps({
  markdown: { type: String, default: '' },
  pathname: { type: String, default: '' }
})

const preferencesStore = usePreferencesStore()
const { theme } = storeToRefs(preferencesStore)

const diffContainer = ref(null)
const error = ref(null)
let mergeView = null

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
  error.value = null

  if (!props.pathname) {
    error.value = 'No file path — save the file first to enable diff view.'
    return
  }

  let baseline
  try {
    baseline = await invoke('mt_diff_baseline', { path: props.pathname })
  } catch (e) {
    error.value = typeof e === 'string' ? e : (e?.message || 'Failed to load baseline')
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
    error.value = 'CodeMirror MergeView not available'
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
  overflow: auto;
}
.diff-view .CodeMirror-merge {
  height: 100%;
}
.diff-view .CodeMirror {
  background: transparent;
}
.diff-view .CodeMirror-gutters {
  border-right: none;
  background-color: transparent;
}
.diff-error {
  padding: 24px;
  color: var(--editorColor);
  font-size: 14px;
  opacity: 0.7;
}
</style>
