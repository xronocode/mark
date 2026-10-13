<template>
  <div
    class="editor-with-tabs"
    :style="{ 'max-width': showSideBar ? `calc(100vw - ${sideBarWidth}px` : '100vw' }"
  >
    <tabs v-show="showTabBar"></tabs>
    <div class="container">
      <split-view :enabled="splitView && !diffMode">
        <template #rich="{ active }">
          <editor
            :markdown="markdown"
            :cursor="cursor"
            :text-direction="textDirection"
            :platform="platform"
            :mirror="active && sourceCode"
          ></editor>
        </template>
        <template #source="{ active }">
          <source-code
            v-if="sourceCode"
            key="source-edit"
            :markdown="markdown"
            :muyaIndexCursor="muyaIndexCursor"
            :text-direction="textDirection"
          ></source-code>
          <source-code
            v-else-if="active"
            key="source-mirror"
            mirror
            :markdown="markdown"
            :text-direction="textDirection"
          ></source-code>
        </template>
      </split-view>
      <diff-view
        v-if="diffMode"
        :markdown="markdown"
        :pathname="pathname"
      ></diff-view>
    </div>
    <tab-notifications></tab-notifications>
  </div>
</template>

<script setup>
import { useLayoutStore } from '@/store/layout'
import { storeToRefs } from 'pinia'
import Tabs from './tabs.vue'
import Editor from './editor.vue'
import SourceCode from './sourceCode.vue'
import DiffView from './diffView.vue'
import SplitView from './splitView.vue'
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
    flex: 1;
    overflow: hidden;
    zoom: var(--content-zoom, 1);
  }
}
</style>
