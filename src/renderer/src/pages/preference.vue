<template>
  <div class="pref-container">
    <title-bar v-if="showCustomTitleBar"></title-bar>
    <side-bar></side-bar>
    <div class="pref-content" :class="{ frameless: titleBarStyle === 'custom' || isOsx }">
      <div v-if="!showCustomTitleBar" class="title-bar"></div>
      <router-view class="pref-setting"></router-view>
    </div>
  </div>
</template>

<script setup>
import { computed, watch, onMounted, nextTick } from 'vue'
import { usePreferencesStore } from '@/store/preferences'
import { storeToRefs } from 'pinia'
import TitleBar from '@/prefComponents/common/titlebar'
import SideBar from '@/prefComponents/sideBar'
import { addThemeStyle } from '@/util/theme'
import { DEFAULT_STYLE } from '@/config'
import { isOsx } from '@/util'

// Store
const preferencesStore = usePreferencesStore()

// Computed properties
const { theme, titleBarStyle } = storeToRefs(preferencesStore)

const showCustomTitleBar = computed(() => {
  // macOS now uses titleBarStyle:'hiddenInset' (set in main/config.js
  // preferencesWinOptions) which surfaces the native traffic-light buttons
  // top-left, so the custom right-side close button is no longer needed.
  // Windows/Linux still need the custom titlebar when the user picked
  // titleBarStyle === 'custom'.
  if (isOsx) {
    return false
  }
  return titleBarStyle.value === 'custom'
})

// Watchers
watch(theme, (newValue, oldValue) => {
  if (newValue !== oldValue) {
    addThemeStyle(newValue)
  }
})

// Lifecycle
onMounted(() => {
  nextTick(() => {
    const state = window.marktext.initialState || DEFAULT_STYLE
    try {
      addThemeStyle(state.theme)
    } catch (_) { /* theme failure must not block pref init */ }
    preferencesStore.ASK_FOR_USER_PREFERENCE()
  })
})
</script>

<style>
.pref-container {
  --prefSideBarWidth: 280px;

  width: 100vw;
  height: 100vh;
  max-width: 100vw;
  max-height: 100vh;
  position: fixed;
  top: 0;
  left: 0;
  display: flex;
  background: var(--editorBgColor);

  & h4 {
    margin: 0 0 12px;
    font-size: 22px;
    font-weight: 500;
    color: var(--editorColor);
  }

  & h5 {
    font-size: 16px;
    font-weight: normal;
  }

  & .pref-content {
    position: relative;
    flex: 1;
    display: flex;
    flex-direction: column;
    max-width: calc(100vw - var(--prefSideBarWidth));
    & .title-bar {
      width: 100%;
      height: var(--titleBarHeight);
      position: fixed;
      top: 0;
      right: 0;
      -webkit-app-region: drag;
    }
    & .pref-setting {
      padding: 50px 20px;
      padding-top: var(--titleBarHeight);
      flex: 1;
      height: calc(100vh - var(--titleBarHeight));
      overflow: auto;
    }
    & span,
    & div,
    & h1,
    & h2,
    & h3,
    & h4,
    & h5 {
      user-select: none;
    }
  }
  & .pref-content.frameless .pref-setting {
    /* Move the scrollbar below the titlebar */
    margin-top: var(--titleBarHeight);
    padding-top: 0;
  }
}
</style>
