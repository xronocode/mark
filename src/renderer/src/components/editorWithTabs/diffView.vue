<!-- MODULE_CONTRACT
  PURPOSE: M-031 read-only side-by-side diff of the current tab against its baseline; C-43 prefers Mark's own snapshot of the pre-reload content over the .before/git baseline.
  SCOPE: Baseline resolution (latest per-tab snapshot → mt_diff_baseline), CodeMirror MergeView rendering, header source label, auto-exit on unavailable baseline.
  DEPENDS: editor store (currentFile.id), store/diffSnapshots (latestSnapshot), preferences store (theme), mt_diff_baseline IPC.
  LINKS: .grace/changes/active/C-43; .grace/verification/runtime.xml V-M-011 scenario-38; src-tauri/src/m031_diff.rs.
  ROLE: RUNTIME
  MAP_MODE: EXPORTS
MODULE_MAP:
  default - DiffView component; props { markdown, pathname }; header labels the baseline source (snapshot + time, or neutral "Previous version" for the stored baseline).
CHANGE_SUMMARY:
  2026-10-15 C-43 S1: snapshot baseline priority + header source label.
-->
<template>
  <div class="diff-view">
    <div class="diff-header">
      <span class="diff-side">{{ t('diffView.current') }}</span>
      <span class="diff-side">{{ baselineSideLabel }}</span>
      <button type="button" class="diff-exit" @click="exitDiff">{{ t('diffView.exit') }} <kbd>{{ exitShortcut }}</kbd></button>
    </div>
    <div ref="diffContainer" class="diff-body"></div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { usePreferencesStore } from '@/store/preferences'
import { storeToRefs } from 'pinia'
import { oneDarkThemes, railscastsThemes } from '@/config'
import DiffMatchPatch from 'diff-match-patch'
import { useEditorStore } from '@/store/editor'
import { latestSnapshot } from '@/store/diffSnapshots'
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

// C-43: which baseline createMergeView resolved — '' (not yet resolved),
// 'snapshot' (Mark's own pre-reload snapshot of this tab), or 'stored'
// (.before sidecar or git HEAD via mt_diff_baseline; the command returns
// only the content, so the two cannot be told apart).
const baselineSource = ref('')
const snapshotTakenAt = ref(null)

// The header names the baseline source in plain words so the user knows
// what they are comparing against ("Before the last external save · time"
// vs the neutral stored label).
const baselineSideLabel = computed(() => {
  const base = t('diffView.baseline')
  if (baselineSource.value === 'snapshot' && snapshotTakenAt.value != null) {
    const time = new Date(snapshotTakenAt.value).toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    })
    return `${base} · ${t('diffView.sourceSnapshot', { time })}`
  }
  if (baselineSource.value === 'stored') {
    return `${base} · ${t('diffView.sourcePrevious')}`
  }
  return base
})

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
  baselineSource.value = ''
  snapshotTakenAt.value = null

  if (!props.pathname) {
    failAndExit(t('diffView.noPath'))
    return
  }

  // START_BLOCK_RESOLVE_BASELINE
  // C-43 baseline priority: Mark's own snapshot of what the tab held just
  // before the last external save wins over the stored baseline — it exists
  // exactly when an external change was applied, including in the App Store
  // sandbox where neither a .before sidecar nor git is reachable.
  const tabId = editorStore.currentFile?.id
  const snapshot = tabId ? latestSnapshot(tabId) : null

  let baseline
  if (snapshot) {
    baseline = snapshot.markdown
    baselineSource.value = 'snapshot'
    snapshotTakenAt.value = snapshot.takenAt
    console.debug('[editor][diff][BLOCK_DIFF_BASELINE_SOURCE source=snapshot]')
  } else {
    try {
      baseline = await invoke('mt_diff_baseline', { path: props.pathname })
      baselineSource.value = 'stored'
      console.debug('[editor][diff][BLOCK_DIFF_BASELINE_SOURCE source=stored]')
    } catch (e) {
      failAndExit(typeof e === 'string' ? e : (e?.message || t('diffView.noBaseline')))
      return
    }
  }
  // END_BLOCK_RESOLVE_BASELINE

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
