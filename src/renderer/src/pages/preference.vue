<template>
  <div class="pref-container" :class="isOsx ? 'is-mac' : 'is-win'">
    <tabs-bar></tabs-bar>
    <div class="pref-body">
      <router-view class="pref-setting"></router-view>
    </div>
  </div>
</template>

<script setup>
// FILE: src/renderer/src/pages/preference.vue
// VERSION: 2.1.0
// START_MODULE_CONTRACT
//   PURPOSE: The C-38 T-003 Settings window shell — native-titlebar window (title follows the active tab), 5-tab toolbar, scrollable grouped body, remembered tab, and the theme/auto-theme wiring the settings webview has always owned.
//   SCOPE: Shell layout + palette (per-OS metrics, dark parity via body.dark), tab-title sync (document + native window), last-tab persistence, theme application for this window.
//   DEPENDS: prefComponents/tabsBar, prefComponents/tabsBar/config (TAB_IDS/tabTitle/writeLastTab), util/theme, util/autoTheme, store/preferences, util (isOsx), @tauri-apps/api/window (setTitle).
//   LINKS: .grace/changes/active/C-38 T-003; .grace/graph/runtime.xml M-011; .grace/verification/runtime.xml V-M-011.
//   ROLE: RUNTIME
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   showCustomTitleBar - removed (v2): the settings window is native-decorated on every OS in the Tauri port; the old Linux custom-close overlay (prefComponents/common/titlebar.vue) is retired.
//   applyWindowTitle - sets document.title AND the native window title to the active tab (macOS: bare label; Windows/Linux: '<label> — Mark').
//   watch route.name - persists the active tab (writeLastTab) and re-applies the window title; non-tab routes are ignored.
//   watch locale - re-applies the title after a language switch.
//   APPLY_AUTO_THEME block - unchanged C-41 behaviour: keep `theme` synced with prefers-color-scheme while followSystemTheme is on.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-10-15 v2.1.0: C-38 T-006 N4 a/b — the Settings accent and
//     font now alias the shared chrome identity: --prefAccent mirrors
//     --chromeAccent and --prefAccentSoft mirrors --chromeAccentSoft
//     (AccentColor with the per-OS fallback in assets/styles/index.css;
//     the per-OS/dark literal accents and font-family stacks are gone),
//     and the shell uses --chromeFontFamily.
//   - 2026-10-15 v2.0.0: C-38 T-003 — new shell per the approved mockup: left rail replaced by the tabsBar toolbar; body 18/24px with scroll; neutral system palette with CSS AccentColor fallback per OS and body.dark parity; window title follows the active tab; last tab remembered (localStorage, guarded); per-OS class (is-mac/is-win) on the root.
//   - (v1.x: 280px sideBar rail + 9 routed pages — retired.)
// END_CHANGE_SUMMARY

import { watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { usePreferencesStore } from '@/store/preferences'
import { storeToRefs } from 'pinia'
import TabsBar from '@/prefComponents/tabsBar'
import { TABS, TAB_IDS, tabTitle, writeLastTab } from '@/prefComponents/tabsBar/config'
import { addThemeStyle } from '@/util/theme'
import { resolveAutoTheme, watchSystemColorScheme } from '@/util/autoTheme'
import { DEFAULT_STYLE } from '@/config'
import { isOsx } from '@/util'
import { getCurrentWindow } from '@tauri-apps/api/window'

// Store
const preferencesStore = usePreferencesStore()
const route = useRoute()
const { t, locale } = useI18n()

const { theme } = storeToRefs(preferencesStore)

const tabLabel = (id) => {
  const tab = TABS.find((x) => x.id === id)
  return tab ? t(tab.labelKey) : ''
}

// Watchers
watch(theme, (value) => {
  try {
    addThemeStyle(value)
  } catch (e) {
    console.error('[preference][theme-watcher] failed:', value, e)
  }
})

// START_BLOCK_APPLY_WINDOW_TITLE
// The native window title follows the active tab (mockup: macOS shows
// the bare tab name in the title area, Windows/Linux append ' — Mark').
// document.title covers the browser/e2e context; getCurrentWindow()
// .setTitle covers the native titlebar of the settings webview.
const currentWindow = getCurrentWindow()
const applyWindowTitle = (id) => {
  if (!TAB_IDS.includes(id)) return
  const title = tabTitle(tabLabel(id), isOsx)
  document.title = title
  try {
    currentWindow.setTitle(title).catch(() => {})
  } catch (e) {
    // The Tauri window API is unavailable (plain browser) — document.title
    // already carries the tab name.
  }
}
// END_BLOCK_APPLY_WINDOW_TITLE

// START_BLOCK_REMEMBER_TAB
// The active tab is persisted on every switch and re-applied by the
// /preference root redirect the next time the window opens.
watch(
  () => route.name,
  (name) => {
    if (!TAB_IDS.includes(name)) return
    writeLastTab(name)
    applyWindowTitle(name)
  },
  { immediate: true }
)

watch(locale, () => {
  applyWindowTitle(route.name)
})
// END_BLOCK_REMEMBER_TAB

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
/* START_BLOCK_PREF_PALETTE */
/* Mockup palette (renderVals): neutral system greys, per-OS radii and
   control metrics. Dark parity keyed off the app's existing body.dark
   classification set by util/theme.js. Since C-38 T-006 the accent and
   the font come from the shared chrome identity in
   assets/styles/index.css: --prefAccent mirrors --chromeAccent (CSS
   AccentColor where supported, per-OS fallback otherwise — the values
   here are just aliases now) and the shell uses --chromeFontFamily. */
.pref-container {
  --prefAccent: var(--chromeAccent);
  --prefAccentSoft: var(--chromeAccentSoft);
  --prefBg: #ececec;
  --prefBar: #ececec;
  --prefGroup: #ffffff;
  --prefText: #1d1d1f;
  --prefSub: #6b6b70;
  --prefLine: rgba(0, 0, 0, 0.08);
  --prefCtrl: #ffffff;
  --prefCtrlBorder: rgba(0, 0, 0, 0.14);
  --prefKnob: #ffffff;
  --prefOff: #d8d8dc;
  --prefTabOn: rgba(0, 0, 0, 0.07);
  --prefGroupRadius: 9px;
  --prefCtrlRadius: 6px;

  width: 100vw;
  height: 100vh;
  max-width: 100vw;
  max-height: 100vh;
  position: fixed;
  top: 0;
  left: 0;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  overflow: hidden;
  background: var(--prefBg);
  color: var(--prefText);
  color-scheme: light;
  font-family: var(--chromeFontFamily);
  -webkit-font-smoothing: antialiased;
}

.pref-container.is-win {
  --prefBg: #f3f3f3;
  --prefBar: #f3f3f3;
  --prefGroup: #fbfbfb;
  --prefCtrl: #ffffff;
  --prefGroupRadius: 6px;
  --prefCtrlRadius: 4px;
}

body.dark .pref-container {
  --prefBg: #242424;
  --prefBar: #2c2c2c;
  --prefGroup: #2f2f2f;
  --prefText: #ececec;
  --prefSub: #a3a3a3;
  --prefLine: rgba(255, 255, 255, 0.09);
  --prefCtrl: #454545;
  --prefCtrlBorder: rgba(255, 255, 255, 0.12);
  --prefKnob: #f2f2f2;
  --prefOff: #4a4a4a;
  --prefTabOn: rgba(255, 255, 255, 0.1);
  color-scheme: dark;
}

body.dark .pref-container.is-win {
  --prefBg: #202020;
  --prefBar: #202020;
  --prefGroup: #2b2b2b;
  --prefCtrl: #373737;
}
/* END_BLOCK_PREF_PALETTE */

/* START_BLOCK_PREF_ROW */
/* Shared control-row anatomy (mockup): ≥40px rows, 13px label with an
   optional 11px secondary help line on the left, the control right-
   aligned. Every prefComponents/common control renders this root. */
.pref-container .pref-row {
  display: flex;
  align-items: center;
  gap: 16px;
  min-height: 40px;
  padding: 8px 14px;
  box-sizing: border-box;
  /* Review fix: no wrapping — a long help text wraps inside the label
     column instead of pushing the control onto its own line. */
  flex-wrap: nowrap;
  font-size: 13px;
  color: var(--prefText);
}

.pref-container .pref-row .pref-row-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1 1 0;
  min-width: 0;
}

.pref-container .pref-row .pref-row-label {
  font-size: 13px;
  color: var(--prefText);
}

.pref-container .pref-row .pref-row-help {
  font-size: 11px;
  line-height: 1.35;
  color: var(--prefSub);
}

.pref-container .pref-row .pref-row-control {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 8px;
}

.pref-container .pref-row .pref-more-link {
  cursor: pointer;
  opacity: 0.7;
  color: var(--prefSub);
}

.pref-container .pref-row .pref-more-link:hover {
  color: var(--prefAccent);
}

.pref-container .ag-underdevelop {
  opacity: 0.55;
}
/* END_BLOCK_PREF_ROW */

/* START_BLOCK_PREF_BODY */
/* Body per mockup: 18/24px padding, scroll only vertically, content
   column with 18px gaps between groups. */
.pref-container .pref-body {
  flex: 1 1 auto;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 18px 24px 24px;
}

/* C-38 T-003 review: the global theme stylesheet paints scrollbars
   with the theme's float-hover colour (a beige/ink strip down the right edge here);
   the Settings body keeps a transparent track over the window colour. */
.pref-container .pref-body::-webkit-scrollbar,
.pref-container .pref-body::-webkit-scrollbar-track,
.pref-container .pref-body::-webkit-scrollbar-corner {
  background: transparent;
}

.pref-container .pref-body::-webkit-scrollbar:vertical {
  width: 10px;
}

.pref-container .pref-body::-webkit-scrollbar-thumb {
  background: var(--prefOff);
  border: 3px solid transparent;
  border-radius: 6px;
  background-clip: padding-box;
}

.pref-container .pref-body .pref-setting {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.pref-container h4 {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
  color: var(--prefText);
}

.pref-container h5 {
  font-size: 14px;
  font-weight: 500;
}

.pref-container .pref-body span,
.pref-container .pref-body div,
.pref-container .pref-body h1,
.pref-container .pref-body h2,
.pref-container .pref-body h3,
.pref-container .pref-body h4,
.pref-container .pref-body h5 {
  user-select: none;
}
/* END_BLOCK_PREF_BODY */
</style>
