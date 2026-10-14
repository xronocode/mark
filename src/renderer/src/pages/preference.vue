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
import { computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { usePreferencesStore } from '@/store/preferences'
import { storeToRefs } from 'pinia'
import TitleBar from '@/prefComponents/common/titlebar'
import SideBar from '@/prefComponents/sideBar'
import { addThemeStyle } from '@/util/theme'
import { resolveAutoTheme, watchSystemColorScheme } from '@/util/autoTheme'
import { DEFAULT_STYLE } from '@/config'
import { isOsx, isWindows } from '@/util'

// Store
const preferencesStore = usePreferencesStore()

// Computed properties
const { theme, titleBarStyle } = storeToRefs(preferencesStore)

const showCustomTitleBar = computed(() => {
  // macOS now uses titleBarStyle:'hiddenInset' (set in main/config.js
  // preferencesWinOptions) which surfaces the native traffic-light buttons
  // top-left, so the custom right-side close button is no longer needed.
  // C-15 T-W1: the settings window keeps NATIVE chrome on Windows (it is
  // built with default decorations in m_v1_compat), so the custom close
  // button is not needed there either — only Linux may still pick the
  // custom style.
  if (isOsx || isWindows) {
    return false
  }
  return titleBarStyle.value === 'custom'
})

// Watchers
watch(theme, (value) => {
  try {
    addThemeStyle(value)
  } catch (e) {
    console.error('[preference][theme-watcher] failed:', value, e)
  }
})

// START_BLOCK_APPLY_AUTO_THEME
// C-41 T-001 Auto mode (settings window): mirror app.vue — keep `theme` in
// sync with prefers-color-scheme while followSystemTheme is on, including
// live OS appearance flips and cross-window preference broadcasts, without
// ever persisting the resolved value.
const applyAutoTheme = () => {
  if (!preferencesStore.followSystemTheme) return
  const resolved = resolveAutoTheme(preferencesStore)
  if (resolved !== preferencesStore.theme) {
    preferencesStore.theme = resolved
  } else {
    addThemeStyle(resolved)
  }
}

watch(
  () => [preferencesStore.followSystemTheme, preferencesStore.lightModeTheme, preferencesStore.darkModeTheme],
  () => {
    applyAutoTheme()
  }
)

const stopColorSchemeWatch = watchSystemColorScheme(() => {
  applyAutoTheme()
})
// END_BLOCK_APPLY_AUTO_THEME

// Lifecycle
onMounted(() => {
  nextTick(async () => {
    const state = window.marktext.initialState || DEFAULT_STYLE
    try {
      addThemeStyle(state.theme)
    } catch (e) {
      console.error('[preference][addThemeStyle] failed:', state.theme, e)
    }
    await preferencesStore.ASK_FOR_USER_PREFERENCE()
    // C-41 T-001: resolve Auto after hydration so this window matches the
    // editor window's effective theme.
    applyAutoTheme()
  })
})

onUnmounted(() => {
  // C-41 T-001: drop the prefers-color-scheme listener with the window.
  stopColorSchemeWatch()
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
