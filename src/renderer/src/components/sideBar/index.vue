<template>
  <div
    v-show="showSideBar"
    ref="sideBar"
    class="side-bar"
    :style="{ width: `${finalSideBarWidth}px` }"
  >
    <div class="side-bar-content">
      <search-toolbar></search-toolbar>
      <div class="side-bar-body">
        <!-- Results take over when there's an active query, regardless of rightColumn. -->
        <side-bar-search v-if="hasSearchQuery"></side-bar-search>
        <tree
          v-else-if="rightColumn === 'files'"
          :openedFiles="openedFiles"
          :tabs="tabs"
        ></tree>
        <toc v-else-if="rightColumn === 'toc'"></toc>
        <!-- Default empty state when sidebar is open but no view is selected — per
             spec, do NOT default to Files; the search toolbar above is the cue. -->
      </div>
    </div>
    <div ref="dragBar" class="drag-bar"></div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick } from 'vue'
import { storeToRefs } from 'pinia'
import { useLayoutStore } from '@/store/layout'
import { useProjectStore } from '@/store/project'
import { useEditorStore } from '@/store/editor'
import { useSearchStore } from '@/store/search'
import Tree from './tree.vue'
import SideBarSearch from './search.vue'
import Toc from './toc.vue'
import SearchToolbar from './searchToolbar.vue'

const layoutStore = useLayoutStore()
const projectStore = useProjectStore()
const editorStore = useEditorStore()
const searchStore = useSearchStore()

const sideBar = ref(null)
const dragBar = ref(null)

const openedFiles = ref([])
const sideBarViewWidth = ref(280)

const { rightColumn, showSideBar, sideBarWidth } = storeToRefs(layoutStore)
// projectTrees no longer destructured here — tree.vue reads directly from store.
const { tabs } = storeToRefs(editorStore)

const hasSearchQuery = computed(() => searchStore.hasQuery)

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
