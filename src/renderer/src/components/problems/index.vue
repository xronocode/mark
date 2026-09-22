<template>
  <div v-if="showPanel" class="problems-overlay" @click.self="close" @keydown.escape="close">
    <div class="problems-panel">
      <div class="panel-header">
        <span class="panel-title">{{ t('problems.title') }}</span>
        <span class="panel-count">{{ issues.length }}</span>
        <button class="panel-close" :title="t('common.close')" @click="close">&times;</button>
      </div>
      <div class="panel-body">
        <div v-if="issues.length === 0" class="empty">{{ t('problems.noIssues') }}</div>
        <button
          v-for="(issue, index) of issues"
          :key="`${issue.rule}-${issue.line}-${index}`"
          class="issue"
          :title="t('problems.jumpToIssue')"
          @click="jump(issue)"
        >
          <span class="rule" :class="issue.rule">{{ issue.rule.toUpperCase() }}</span>
          <span class="excerpt">{{ issue.excerpt }}</span>
          <span class="line">:{{ issue.line }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
// FILE: src/renderer/src/components/problems/index.vue
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Overlay panel listing markdownlint-subset document problems with click-to-jump (C-17 P0-A surface).
//   SCOPE: Bus-driven visibility and issue list; reads the lint preference; jumps via the editor-store TOC slug for the nearest preceding heading.
//   DEPENDS: Vue, i18n, bus, editor store (listToc), markdownLint util.
//   LINKS: .grace/changes/active/C-17; .grace/graph/runtime.xml M-011; .grace/verification/runtime.xml V-M-011 scenario-30.
//   ROLE: RUNTIME
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   jump - Scrolls the editor to the nearest heading above the issue via its TOC slug.
//   toggle - Bus 'problems' visibility flip.
//   recompute - Recomputes the issue list from a doc-markdown-changed payload.
//   headingSlugForLine - Maps an issue line to the nearest preceding heading's listToc slug.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-09-22 v1.0.0: C-17 — problems overlay (projectSearch pattern); issues recomputed on doc-markdown-changed; preference-gated; jump maps the issue's preceding-heading count to editorStore.listToc.
// END_CHANGE_SUMMARY

import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import bus from '../../bus'
import { useEditorStore } from '@/store/editor'
import { usePreferencesStore } from '@/store/preferences'
import { lintMarkdown, classifyHeadingLine } from '@/util/markdownLint'

const { t } = useI18n()
const editorStore = useEditorStore()
const preferencesStore = usePreferencesStore()
const { markdownLint: lintEnabled } = storeToRefs(preferencesStore)
const { listToc } = storeToRefs(editorStore)

const showPanel = ref(false)
const issues = ref([])

const close = () => {
  showPanel.value = false
}

const toggle = () => {
  showPanel.value = !showPanel.value
}

// Map an issue to the slug of the nearest heading ABOVE its line: heading
// N of the document (line-wise) is TOC entry N-1 (both are document order).
const headingSlugForLine = (markdown, line) => {
  const lines = markdown.split('\n')
  let headingIndex = -1
  let count = 0
  for (let i = 0; i < lines.length && i < line; i++) {
    if (classifyHeadingLine(lines, i)) {
      headingIndex = count
      count += 1
    }
  }
  if (headingIndex < 0) return null
  return listToc.value?.[headingIndex]?.slug ?? null
}

const jump = (issue) => {
  const slug = headingSlugForLine(lastMarkdown.value, issue.line)
  if (slug) bus.emit('scroll-to-header', slug)
}

const lastMarkdown = ref('')

const recompute = ({ markdown } = {}) => {
  lastMarkdown.value = typeof markdown === 'string' ? markdown : ''
  issues.value = lintEnabled.value ? lintMarkdown(lastMarkdown.value) : []
}

// Turning validation off clears the open panel immediately (not on the
// next edit); turning it back on re-lints the last known document.
watch(lintEnabled, (enabled) => {
  if (!enabled) {
    issues.value = []
  } else if (lastMarkdown.value) {
    issues.value = lintMarkdown(lastMarkdown.value)
  }
})

bus.on('problems', toggle)
bus.on('doc-markdown-changed', recompute)
</script>

<style>
.problems-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.25);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  z-index: 1000;
  padding-top: 12vh;
}

.problems-panel {
  width: min(560px, 90vw);
  max-height: 60vh;
  display: flex;
  flex-direction: column;
  background: var(--floatBgColor, #fff);
  color: var(--editorColor, #333);
  border: 1px solid var(--floatBorderColor, #ddd);
  border-radius: 6px;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.18);
}

.problems-panel .panel-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--floatBorderColor, #eee);
  font-weight: 600;
}

.problems-panel .panel-count {
  background: var(--themeColor, #409eff);
  color: #fff;
  border-radius: 9px;
  font-size: 12px;
  padding: 1px 8px;
}

.problems-panel .panel-close {
  margin-left: auto;
  border: none;
  background: transparent;
  font-size: 18px;
  cursor: pointer;
  color: inherit;
}

.problems-panel .panel-body {
  overflow-y: auto;
  padding: 6px 0;
}

.problems-panel .empty {
  padding: 18px;
  text-align: center;
  opacity: 0.6;
}

.problems-panel .issue {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  text-align: left;
  padding: 6px 14px;
  border: none;
  background: transparent;
  cursor: pointer;
  color: inherit;
  font-size: 13px;
}

.problems-panel .issue:hover {
  background: var(--sideBarItemHoverBgColor, rgba(0, 0, 0, 0.05));
}

.problems-panel .rule {
  flex: none;
  font-size: 11px;
  font-weight: 600;
  border-radius: 3px;
  padding: 1px 5px;
  background: rgba(230, 162, 60, 0.18);
  color: #c76b18;
}

.problems-panel .excerpt {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.problems-panel .line {
  flex: none;
  opacity: 0.5;
}
</style>
