<template>
  <!-- C-40 T-004: optional 24 px status bar (approved canvas statusBar
       style) — document counts left, selection counts while text is
       selected, document type right. v-show keeps the element alive for
       the selection scoping check while the preference is off. -->
  <footer
    v-show="visible"
    ref="rootRef"
    class="status-bar"
    :aria-label="t('statusBar.title')"
  >
    <template v-if="hasSelection">
      <span class="status-bar-count">{{ selectedWordsLabel }}</span>
      <span class="status-bar-dot" aria-hidden="true">·</span>
      <span class="status-bar-count">{{ selectedCharactersLabel }}</span>
    </template>
    <template v-else>
      <span class="status-bar-count">{{ linesLabel }}</span>
      <span class="status-bar-dot" aria-hidden="true">·</span>
      <span class="status-bar-count">{{ wordsLabel }}</span>
      <span class="status-bar-dot" aria-hidden="true">·</span>
      <span class="status-bar-count">{{ charactersLabel }}</span>
      <span class="status-bar-dot" aria-hidden="true">·</span>
      <span class="status-bar-count">{{ readingLabel }}</span>
    </template>
    <span class="status-bar-spacer"></span>
    <span class="status-bar-type">{{ t('statusBar.documentType') }}</span>
  </footer>
</template>

<script setup>
// FILE: src/renderer/src/components/editorWithTabs/statusBar.vue
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: C-40 T-004 status bar — a slim 24 px strip at the bottom of the editor area showing lines · words · characters · reading time (selection-aware) left and the document type right.
//   SCOPE: Rendering plus document/selection count plumbing: tab wordCount + markdown via util/docStats, DOM-selection tracking scoped to the editor area, the statusBarVisibility preference gate; toggling lives in the view.status-bar command / View › Status Bar / Settings.
//   DEPENDS: editor/preferences stores, vue-i18n (t), util/docStats, document selectionchange.
//   LINKS: .grace/changes/active/C-40 T-004; .grace/graph/runtime.xml M-011 fn-docStats; .grace/verification/runtime.xml V-M-011 scenario-55.
//   ROLE: RUNTIME
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   visible - statusBarVisibility preference gate (default off on macOS, on elsewhere — resolved per OS in store/preferences over util/docStats.defaultStatusBarVisibility).
//   linesLabel/wordsLabel/charactersLabel/readingLabel - whole-document counts (tab wordCount for words/characters, util/docStats for lines and reading minutes).
//   hasSelection/selectedWordsLabel/selectedCharactersLabel - selection-aware replacement counts while non-collapsed text is selected inside the editor area.
//   refreshSelection - document selectionchange handler: reads document.getSelection() lazily, keeps only selections anchored inside the editor column.
//   pluralLabel - CLDR-category plural label (recent.filesCount pattern; the app's vue-i18n disables "|" plural parsing).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-10-15 v1.0.0: C-40 T-004 — initial status bar (canvas style:
//     24 px, 0.14 padding, 11.5 px muted tabular numerals, 0.45-opacity
//     dot separators, hairline top border). Lines/reading minutes share
//     util/docStats with the title-bar popover; selection counts reuse
//     muya's wordCount tokenizer scoped to the editor column.
// END_CHANGE_SUMMARY

import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { useEditorStore } from '@/store/editor'
import { usePreferencesStore } from '@/store/preferences'
import {
  countDocumentLines,
  countSelectionStats,
  readingMinutes
} from '@/util/docStats'

const { t, locale } = useI18n()

const editorStore = useEditorStore()
const preferencesStore = usePreferencesStore()
const { currentFile } = storeToRefs(editorStore)
const { statusBarVisibility } = storeToRefs(preferencesStore)

const visible = computed(() => !!statusBarVisibility.value)

// START_BLOCK_PLURAL_LABEL
// Same pattern as recent.filesCount: the app's vue-i18n disables "a | b"
// plural parsing, so plural forms live as CLDR-category sub-keys
// (statusBar.lines.one / few / many / other) picked with Intl.PluralRules
// for the UI language and falling back to .other.
const pluralLabel = (key, count) => {
  let category = 'other'
  try {
    category = new Intl.PluralRules(locale.value || 'en').select(count)
  } catch (e) {
    // unknown locale tag → .other
  }
  const fullKey = `${key}.${category}`
  const label = t(fullKey, { count })
  if (label && label !== fullKey) return label
  return t(`${key}.other`, { count })
}
// END_BLOCK_PLURAL_LABEL

// START_BLOCK_DOCUMENT_COUNTS
// Words/characters come from the tab's wordCount (the muya change event —
// the same source as the title-bar popover); lines from the tab markdown
// and reading minutes from util/docStats (words/230 rounded up, min 1).
const words = computed(() => currentFile.value?.wordCount?.word ?? 0)
const characters = computed(() => currentFile.value?.wordCount?.character ?? 0)
const lines = computed(() => countDocumentLines(currentFile.value?.markdown))

const linesLabel = computed(() => pluralLabel('statusBar.lines', lines.value))
const wordsLabel = computed(() => pluralLabel('statusBar.words', words.value))
const charactersLabel = computed(() =>
  pluralLabel('statusBar.characters', characters.value)
)
const readingLabel = computed(() =>
  t('statusBar.readingTime', { count: readingMinutes(words.value) })
)
// END_BLOCK_DOCUMENT_COUNTS

// START_BLOCK_SELECTION_TRACKING
// While non-collapsed text is selected inside the editor column, the left
// side shows the selection counts instead («12 words selected · 34
// characters selected»). document.selectionchange is read lazily; a
// selection outside the editor area (dialogs, sidebar) is ignored.
// CodeMirror source-mode selections do not surface through
// document.getSelection and simply keep the document counts.
const rootRef = ref(null)
const selectionText = ref('')

const hasSelection = computed(() => selectionText.value.length > 0)
const selectionStats = computed(() => countSelectionStats(selectionText.value))
const selectedWordsLabel = computed(() =>
  pluralLabel('statusBar.selectedWords', selectionStats.value.word)
)
const selectedCharactersLabel = computed(() =>
  pluralLabel('statusBar.selectedCharacters', selectionStats.value.character)
)

const isEditorSelection = (selection) => {
  const root = rootRef.value ? rootRef.value.closest('.editor-with-tabs') : null
  if (!root) return false
  const node = selection.anchorNode
  if (!node) return false
  const element = node.nodeType === 1 ? node : node.parentNode
  return !!element && root.contains(element)
}

const refreshSelection = () => {
  if (!visible.value) {
    selectionText.value = ''
    return
  }
  let selection = null
  try {
    selection = document.getSelection ? document.getSelection() : null
  } catch (e) {
    selection = null
  }
  if (
    !selection ||
    selection.rangeCount === 0 ||
    selection.isCollapsed ||
    !isEditorSelection(selection)
  ) {
    selectionText.value = ''
    return
  }
  selectionText.value = String(selection)
}
// END_BLOCK_SELECTION_TRACKING

onMounted(() => {
  document.addEventListener('selectionchange', refreshSelection)
})

onBeforeUnmount(() => {
  document.removeEventListener('selectionchange', refreshSelection)
})

// A stale selection must not survive a tab switch or a hide of the bar.
watch(
  () => [currentFile.value?.id, visible.value],
  () => {
    selectionText.value = ''
  }
)
</script>

<style>
/* C-40 T-004 canvas statusBar style: height 24, padding 0 14, gap 8,
   11.5 px muted tabular numerals, 0.45-opacity dot separators, hairline
   top rule, chrome background. */
.status-bar {
  height: 24px;
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 14px;
  box-sizing: border-box;
  border-top: 0.5px solid var(--floatBorderColor, rgba(128, 128, 128, 0.2));
  background: var(--editorBgColor, #ffffff);
  font-size: 11.5px;
  color: var(--editorColor50, rgba(128, 128, 128, 0.6));
  font-variant-numeric: tabular-nums;
  user-select: none;
  overflow: hidden;
  white-space: nowrap;
}

.status-bar-dot {
  opacity: 0.45;
}

.status-bar-spacer {
  flex: 1 1 auto;
}

.status-bar-type {
  color: var(--editorColor50, rgba(128, 128, 128, 0.6));
}
</style>
