<!-- MODULE_CONTRACT
  PURPOSE: M-031 read-only side-by-side diff of the current tab against its baseline; C-43 prefers Mark's own snapshot of the pre-reload content over the .before/git baseline; C-68 adds the «opened» fallback so ⌘D always has something to compare outside git, and replaces no-baseline errors with calm notices.
  SCOPE: Tab-scoped baseline resolution (latest snapshot → mt_diff_baseline → opened snapshot), request/view lifetime guards, calm exits, CodeMirror MergeView rendering and source labels.
  DEPENDS: editor store (currentFile.id), store/diffSnapshots (latestSnapshot, openedSnapshot), preferences store (theme), mt_diff_baseline IPC.
  LINKS: .grace/changes/active/C-68; .grace/changes/archive/C-43; .grace/verification/runtime.xml V-M-011 scenario-39/scenario-67; src-tauri/src/m031_diff.rs.
  ROLE: RUNTIME
  MAP_MODE: EXPORTS
MODULE_MAP:
  default - DiffView component; props { markdown, pathname }; header labels the baseline source (snapshot + time, opened + time, or neutral "Previous version" for the stored baseline).
CHANGE_SUMMARY:
  2026-10-19 integration: discard obsolete baseline/import completions after tab/path changes, exit or unmount; log a stable fallback reason without backend paths.
  2026-10-19 C-68 T-001: opened-baseline fallback + calm notices (backend errors never reach the UI; equal content / no baseline exit with an info notice instead of a warning).
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
import { latestSnapshot, openedSnapshot } from '@/store/diffSnapshots'
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
let requestVersion = 0
let activeTabId = null
let disposed = false
const exitShortcut = isOsx ? '⌘D' : 'Ctrl+D'

// C-43/C-68: which baseline createMergeView resolved — '' (not yet
// resolved), 'snapshot' (Mark's own pre-reload snapshot of this tab),
// 'stored' (.before sidecar or git HEAD via mt_diff_baseline; the command
// returns only the content, so the two cannot be told apart), or 'opened'
// (the content the tab last loaded from disk — C-68's everywhere fallback).
const baselineSource = ref('')
const snapshotTakenAt = ref(null)

// The header names the baseline source in plain words so the user knows
// what they are comparing against ("Before the last external save · time",
// "Since you opened the file · time", or the neutral stored label).
const baselineSideLabel = computed(() => {
  const base = t('diffView.baseline')
  const timeSource =
    baselineSource.value === 'snapshot' || baselineSource.value === 'opened'
  if (timeSource && snapshotTakenAt.value != null) {
    const time = new Date(snapshotTakenAt.value).toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    })
    const key =
      baselineSource.value === 'snapshot'
        ? 'diffView.sourceSnapshot'
        : 'diffView.sourceOpened'
    return `${base} · ${t(key, { time })}`
  }
  if (baselineSource.value === 'stored') {
    return `${base} · ${t('diffView.sourcePrevious')}`
  }
  return base
})

// The diff view replaces the editing surface (index.vue v-show), so it must
// always offer a way back: a header button, and automatic exits — a calm
// info notice when there is nothing to compare (C-68), a warning only for
// a genuinely broken diff surface (MergeView unavailable).
const exitDiff = () => {
  requestVersion++
  const tab = editorStore.currentFile
  if (tab && tab.id === activeTabId && tab.diffMode) tab.diffMode = false
}

const failAndExit = (message) => {
  console.warn(`[editor][diff][BLOCK_DIFF_UNAVAILABLE] ${message}`)
  notice.notify({ title: t('diffView.unavailable'), message, type: 'warning' })
  exitDiff()
}

// START_BLOCK_NOTHING_TO_COMPARE
// C-68 R-3: «nothing to compare» is a normal state, not a failure — an
// info notice with calm wording, never the raw backend error. Used for an
// untitled tab, a titled tab with no baseline at all, and a resolved
// baseline that equals the current markdown.
const nothingToCompare = (message, reason) => {
  console.debug(`[editor][diff][BLOCK_DIFF_NOTHING_TO_COMPARE reason=${reason}]`)
  notice.notify({ title: t('diffView.unavailable'), message, type: 'info' })
  exitDiff()
}
// END_BLOCK_NOTHING_TO_COMPARE

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
  const request = ++requestVersion
  const tabId = editorStore.currentFile?.id
  const pathname = props.pathname
  activeTabId = tabId
  const isCurrent = () => !disposed && request === requestVersion &&
    editorStore.currentFile?.id === tabId && editorStore.currentFile?.diffMode !== false &&
    props.pathname === pathname
  destroyMergeView()
  baselineSource.value = ''
  snapshotTakenAt.value = null

  if (!props.pathname) {
    nothingToCompare(t('diffView.nothingToCompare'), 'no-path')
    return
  }

  // START_BLOCK_RESOLVE_BASELINE
  // C-43/C-68 baseline priority:
  //   1. Mark's own snapshot of what the tab held just before the last
  //      external save — it exists exactly when an external change was
  //      applied, including in the App Store sandbox where neither a
  //      .before sidecar nor git is reachable.
  //   2. The stored baseline (mt_diff_baseline: .before sidecar or git
  //      HEAD).
  //   3. The «opened» snapshot — the content this tab last loaded from
  //      disk (C-68), so an ordinary note outside git still diffs against
  //      something. A backend error («Not a git repository») is a fallback
  //      signal here, never a user-facing error.
  const snapshot = tabId ? latestSnapshot(tabId) : null
  const opened = tabId ? openedSnapshot(tabId) : null

  let baseline
  if (snapshot) {
    baseline = snapshot.markdown
    baselineSource.value = 'snapshot'
    snapshotTakenAt.value = snapshot.takenAt
    console.debug('[editor][diff][BLOCK_DIFF_BASELINE_SOURCE source=snapshot]')
  } else {
    try {
      baseline = await invoke('mt_diff_baseline', { path: pathname })
      if (!isCurrent()) return
      baselineSource.value = 'stored'
      console.debug('[editor][diff][BLOCK_DIFF_BASELINE_SOURCE source=stored]')
    } catch {
      if (!isCurrent()) return
      console.debug('[editor][diff][BLOCK_DIFF_BASELINE_FALLBACK reason=backend-unavailable]')
      if (opened) {
        baseline = opened.markdown
        baselineSource.value = 'opened'
        snapshotTakenAt.value = opened.takenAt
        console.debug('[editor][diff][BLOCK_DIFF_BASELINE_SOURCE source=opened]')
      } else {
        nothingToCompare(t('diffView.noChanges'), 'no-baseline')
        return
      }
    }
  }

  // C-68 R-3: a resolved baseline that equals the current markdown means
  // there is nothing to show — a calm notice instead of an empty diff.
  if (baseline === props.markdown) {
    nothingToCompare(t('diffView.noChanges'), 'no-changes')
    return
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
  if (!isCurrent() || !diffContainer.value) return
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

watch([() => props.pathname, () => editorStore.currentFile?.id], () => {
  createMergeView()
})

onMounted(() => {
  createMergeView()
})

onBeforeUnmount(() => {
  disposed = true
  requestVersion++
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
