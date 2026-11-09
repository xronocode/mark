<template>
  <div
    class="editor-with-tabs"
    :style="{ 'max-width': showSideBar ? `calc(100vw - ${sideBarWidth}px` : '100vw' }"
  >
    <tabs v-show="showTabBar"></tabs>
    <div class="container">
      <!-- M-031: the diff view replaces the editing surface. Without the
           v-show it rendered below the full-height editor and was clipped by
           .container (overflow: hidden), so `mark --diff` showed no diff. -->
      <split-view v-show="!diffMode" :enabled="splitView && !diffMode" :diff-mode="diffMode">
        <template #rich="{ active }">
          <editor
            :markdown="markdown"
            :cursor="cursor"
            :text-direction="textDirection"
            :platform="platform"
            :split-active="active"
          ></editor>
        </template>
        <template #source="{ active }">
          <!-- C-SPLIT-DUAL-EDIT: ONE editable source-code instance serves
               both full-window source mode and the split companion — in
               split both panes are editable against the single store
               document (the C-29 read-only mirror branch is retired). -->
          <source-code
            v-if="sourceCode || active"
            key="source-edit"
            :markdown="markdown"
            :muyaIndexCursor="muyaIndexCursor"
            :text-direction="textDirection"
            :split-active="active"
            :split-edit="active && !sourceCode"
          ></source-code>
        </template>
      </split-view>
      <diff-view
        v-if="diffMode"
        :markdown="markdown"
        :pathname="pathname"
      ></diff-view>
      <!-- C-40 T-003: «On this page» outline rail — plain WYSIWYG surface
           only (own gates hide it in source/split/diff modes). -->
      <outline-rail
        :source-code="sourceCode"
        :split-view="splitView"
        :diff-mode="diffMode"
      ></outline-rail>
    </div>
    <tab-notifications></tab-notifications>
    <!-- C-40 T-004: optional status bar pinned to the bottom of the
         editor column (own statusBarVisibility preference gate). -->
    <status-bar></status-bar>
  </div>
</template>

<script setup>
// FILE: src/renderer/src/components/editorWithTabs/index.vue
// VERSION: 1.2.0
// START_MODULE_CONTRACT
//   PURPOSE: Compose the editor column — tabs, split/source/diff surfaces, the C-40 T-003 outline rail, and the C-40 T-004 status bar — inside the editorWithTabs container.
//   SCOPE: Layout composition and prop pass-through only; mode state lives in the stores and the child components.
//   DEPENDS: layout store, tabs/editor/sourceCode/diffView/splitView/notifications components, outlineRail.vue, statusBar.vue.
//   LINKS: .grace/graph/runtime.xml M-011; .grace/changes/archive/C-40 T-003/T-004.
//   ROLE: RUNTIME
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_CHANGE_SUMMARY
//   - 2026-10-29 v1.5.0: C-SPLIT-DUAL-EDIT — one editable source-code
//     instance for both source mode and the split companion (:split-edit);
//     the :mirror mirror branch is retired (both panes edit the single
//     store document in split).
//   - 2026-10-29 v1.4.0: C-SPLIT-DBLCLICK-TOGGLE — pass :diff-mode to the
//     split container so the right-edge enable strip never renders while
//     the diff view replaces the editing surface.
//   - 2026-10-27 v1.3.0: C-SPLIT-SCROLL-SYNC — pass the split `active`
//     slot prop down as :split-active to editor and both source-code
//     instances so each surface knows when Split View drives anchoring
//     and scroll pairing.
//   - 2026-10-15 v1.2.0: C-40 T-004 — mount the optional status bar as
//     the last child of the editor column (bottom of the editor area,
//     below tab notifications; statusBarVisibility preference gate,
//     default off on macOS / on elsewhere).
//   - 2026-10-15 v1.1.0: C-40 T-003 — mount the «On this page»
//     rail inside .container (now position:relative, its positioning
//     context) with the source/split/diff mode gates passed as props.
// END_CHANGE_SUMMARY
import { useLayoutStore } from '@/store/layout'
import { storeToRefs } from 'pinia'
import Tabs from './tabs.vue'
import Editor from './editor.vue'
import SourceCode from './sourceCode.vue'
import DiffView from './diffView.vue'
import SplitView from './splitView.vue'
import OutlineRail from './outlineRail.vue'
import StatusBar from './statusBar.vue'
import TabNotifications from './notifications.vue'

defineProps({
  markdown: {
    type: String,
    required: true
  },
  cursor: {
    validator(value) {
      return typeof value === 'object'
    },
    required: true
  },
  muyaIndexCursor: {
    type: Object
  },
  sourceCode: {
    type: Boolean,
    required: true
  },
  diffMode: {
    type: Boolean,
    default: false
  },
  splitView: {
    type: Boolean,
    default: false
  },
  pathname: {
    type: String,
    default: ''
  },
  showTabBar: {
    type: Boolean,
    required: true
  },
  textDirection: {
    type: String,
    required: true
  },
  platform: {
    type: String,
    required: true
  }
})

const layoutStore = useLayoutStore()

const { showSideBar, sideBarWidth } = storeToRefs(layoutStore)
</script>

<style scoped>
.editor-with-tabs {
  position: relative;
  height: 100%;
  flex: 1;
  display: flex;
  flex-direction: column;

  overflow: hidden;
  background: var(--editorBgColor);
  & > .container {
    /* C-40 T-003: positioning context for the absolutely-positioned
       outline rail (its canvas geometry: right 22px inside the editor
       area below the tab bar). */
    position: relative;
    flex: 1;
    overflow: hidden;
    zoom: var(--content-zoom, 1);
  }
}
</style>
