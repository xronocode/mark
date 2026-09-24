<template>
  <div
    class="side-bar-toc"
    :class="[{ 'side-bar-toc-overflow': !wordWrapInToc, 'side-bar-toc-wordwrap': wordWrapInToc }]"
  >
    <div class="title">{{ t('sideBar.toc.title') }}</div>
    <el-tree
      v-if="toc.length"
      :data="toc"
      :default-expand-all="true"
      :props="defaultProps"
      :expand-on-click-node="false"
      :indent="10"
      node-key="slug"
      @node-click="handleClick"
    >
      <template #default="{ data }">
        <span class="toc-node-label" :class="{ 'toc-node-label--active': data.slug === activeSlug }">
          {{ data.label }}
        </span>
      </template>
    </el-tree>
  </div>
</template>

<script setup>
// FILE: src/renderer/src/components/sideBar/toc.vue
// VERSION: 1.1.0
// START_MODULE_CONTRACT
//   PURPOSE: Sidebar table of contents — renders listToc as a tree, jumps on click, and highlights the heading the viewport is in (C-19).
//   SCOPE: Read-only projection of the editor store TOC plus the toc-active-heading bus subscription.
//   DEPENDS: editor/preferences stores, bus, element-plus el-tree.
//   LINKS: .grace/changes/active/C-19; .grace/graph/runtime.xml M-011; .grace/verification/runtime.xml V-M-011 scenario-31.
//   ROLE: RUNTIME
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   handleClick - Emits scroll-to-header with the clicked node's slug.
//   setActiveSlug - Applies the editor's active-heading slug to the tree highlight (clears when null).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-09-23 v1.1.0: C-19 — toc-active-heading bus subscription with a scoped-slot highlight (.toc-node-label--active): the TOC shows which section the viewport is in (el-tree's is-current paths leave stale nodes in this Element Plus version).
// END_CHANGE_SUMMARY

import { useEditorStore } from '@/store/editor'
import { usePreferencesStore } from '@/store/preferences'
import { ref, onMounted, onBeforeUnmount } from 'vue'
import bus from '../../bus'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const editorStore = useEditorStore()
const preferencesStore = usePreferencesStore()

const defaultProps = {
  children: 'children',
  label: 'label'
}

const { toc } = storeToRefs(editorStore)
const { wordWrapInToc } = storeToRefs(preferencesStore)

// C-19: the active heading is rendered through the scoped slot — the
// imperative setCurrentKey/current-node-key paths can leave stale is-current
// nodes behind in this Element Plus version, so the highlight is ours.
const activeSlug = ref(null)

const handleClick = ({ slug }) => {
  bus.emit('scroll-to-header', slug)
}

// START_BLOCK_TOC_ACTIVE
// The editor publishes the slug of the heading containing the viewport
// (debounced on scroll); mirror it into the tree's current highlight.
const setActiveSlug = (slug) => {
  activeSlug.value = slug || null
}
// END_BLOCK_TOC_ACTIVE

onMounted(() => {
  bus.on('toc-active-heading', setActiveSlug)
})

onBeforeUnmount(() => {
  bus.off('toc-active-heading', setActiveSlug)
})
</script>

<style>
.side-bar-toc {
  height: calc(100% - 35px);
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
}

.side-bar-toc .title {
  color: var(--sideBarTitleColor);
  font-weight: 600;
  font-size: 16px;
  margin: 37px 0 10px 0;
  padding-left: 25px;
}

.side-bar-toc .el-tree-node {
  margin-top: 8px;
}

.side-bar-toc .el-tree {
  background: transparent;
  color: var(--sideBarColor);
}

.side-bar-toc .el-tree-node:focus > .el-tree-node__content {
  background-color: var(--sideBarItemHoverBgColor);
}

.side-bar-toc .el-tree-node__content:hover {
  background-color: var(--sideBarItemHoverBgColor);
}

/* C-19: the current (viewport) heading stands out beyond hover/focus. */
.side-bar-toc .toc-node-label--active {
  color: var(--themeColor);
  font-weight: 600;
  background-color: var(--sideBarItemHoverBgColor);
  border-radius: 4px;
  padding: 1px 4px;
}

.side-bar-toc > li {
  font-size: 14px;
  margin-bottom: 15px;
  cursor: pointer;
}
.side-bar-toc-overflow {
  overflow: auto;
}
.side-bar-toc-wordwrap {
  overflow-x: hidden;
  overflow-y: auto;
}

.side-bar-toc-wordwrap .el-tree-node__content {
  white-space: normal;
  height: auto;
  min-height: 26px;
}
</style>
