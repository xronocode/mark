<template>
  <div
    v-show="showSideBar"
    ref="sideBar"
    class="side-bar"
    :style="{ width: `${finalSideBarWidth}px` }"
  >
    <div class="side-bar-content">
      <div class="side-bar-body">
        <!-- C-40 T-003: the sidebar TOC panel is retired in favour of the
             «On this page» outline rail (editorWithTabs/outlineRail.vue).
             The sidebar is Files-only; a stale rightColumn='toc' value
             (the title-bar TOC button until C-40 T-002 removes it) simply
             shows Files. -->
        <tree
          :openedFiles="openedFiles"
          :tabs="tabs"
        ></tree>
      </div>
    </div>
    <div ref="dragBar" class="drag-bar"></div>
  </div>
</template>

<script setup>
// FILE: src/renderer/src/components/sideBar/index.vue
// VERSION: 2.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Sidebar shell (Files tree + width drag) — the sidebar is Files-only since the TOC panel moved to the outline rail (C-40 T-003).
//   SCOPE: Sidebar visibility/width composition; no right-column switching anymore.
//   DEPENDS: layout/editor/project stores, tree.vue.
//   LINKS: .grace/changes/active/C-40 T-003; .grace/graph/runtime.xml M-011.
//   ROLE: RUNTIME
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_CHANGE_SUMMARY
//   - 2026-10-15 v2.0.0: C-40 T-003 — retire the sidebar TOC panel and the
//     right-column 'toc' mode (outline lives in the editor-area rail now);
//     the tree renders unconditionally, so a 'toc' rightColumn value
//     (title-bar button until T-002 removes it) falls back to Files.
// END_CHANGE_SUMMARY
import { ref, computed, onMounted, nextTick } from 'vue'
import { storeToRefs } from 'pinia'
import { useLayoutStore } from '@/store/layout'
import { useProjectStore } from '@/store/project'
import { useEditorStore } from '@/store/editor'
import Tree from './tree.vue'

const layoutStore = useLayoutStore()
const projectStore = useProjectStore()
const editorStore = useEditorStore()

const sideBar = ref(null)
const dragBar = ref(null)

const openedFiles = ref([])
const sideBarViewWidth = ref(280)

const { showSideBar, sideBarWidth } = storeToRefs(layoutStore)
const { tabs } = storeToRefs(editorStore)

const finalSideBarWidth = computed(() => {
  if (!showSideBar.value) return 0
  return sideBarViewWidth.value < 220 ? 220 : sideBarViewWidth.value
})

onMounted(() => {
  nextTick(() => {
    const dragBarEl = dragBar.value
    let startX = 0
    let currentSideBarWidth = +sideBarWidth.value
    let startWidth = currentSideBarWidth

    sideBarViewWidth.value = currentSideBarWidth

    const mouseUpHandler = () => {
      document.removeEventListener('mousemove', mouseMoveHandler, false)
      document.removeEventListener('mouseup', mouseUpHandler, false)
      layoutStore.CHANGE_SIDE_BAR_WIDTH(currentSideBarWidth < 220 ? 220 : currentSideBarWidth)
    }

    const mouseMoveHandler = (event) => {
      const offset = event.clientX - startX
      currentSideBarWidth = startWidth + offset
      sideBarViewWidth.value = currentSideBarWidth
    }

    const mouseDownHandler = (event) => {
      startX = event.clientX
      startWidth = +sideBarWidth.value
      document.addEventListener('mousemove', mouseMoveHandler, false)
      document.addEventListener('mouseup', mouseUpHandler, false)
    }

    // The drag bar is absent while the sidebar is hidden at mount (tests,
    // a boot with the sidebar closed) — nothing to wire then.
    if (!dragBarEl) return
    dragBarEl.addEventListener('mousedown', mouseDownHandler, false)
  })
})
</script>

<style scoped>
.side-bar {
  display: flex;
  flex-shrink: 0;
  flex-grow: 0;
  width: 280px;
  height: 100vh;
  min-width: 220px;
  position: relative;
  color: var(--sideBarColor);
  user-select: none;
  -webkit-app-region: no-drag;
  background: var(--sideBarBgColor);
  border-right: 1px solid var(--itemBgColor);
}
.side-bar-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  /* Leave room for the titlebar so the search toolbar isn't tucked under
     macOS traffic lights or the custom title region. */
  padding-top: var(--titleBarHeight);
}
.side-bar-body {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.drag-bar {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  height: 100%;
  width: 3px;
  cursor: col-resize;
}
.drag-bar:hover {
  border-right: 2px solid var(--iconColor);
}
</style>
