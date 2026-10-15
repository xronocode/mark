<template>
  <nav
    class="pref-toolbar"
    :class="{ 'pref-toolbar--mac': isOsx, 'pref-toolbar--underline': !isOsx }"
    role="tablist"
    :aria-label="t('preferences.title')"
  >
    <!-- START_BLOCK_TAB_BUTTONS -->
    <button
      v-for="tab in tabs"
      :key="tab.id"
      type="button"
      class="pref-tab"
      :class="{ 'pref-tab--active': tab.id === activeTabId }"
      role="tab"
      :data-tab="tab.id"
      :aria-selected="tab.id === activeTabId ? 'true' : 'false'"
      :aria-pressed="tab.id === activeTabId ? 'true' : 'false'"
      :title="tab.label"
      @click="pick(tab)"
    >
      <component :is="tab.icon" />
      <span class="pref-tab-label">{{ tab.label }}</span>
    </button>
    <!-- END_BLOCK_TAB_BUTTONS -->
    <search-panel ref="searchPanelRef" @closed="searchOpen = false" />
  </nav>
</template>

<script setup>
// FILE: src/renderer/src/prefComponents/tabsBar/index.vue
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: The C-38 T-003 Settings toolbar — 5 icon tabs (centred macOS-style on macOS, underline tabs on Windows/Linux) that drive the /preference router-view, plus the ⌘F/Ctrl+F settings-search panel.
//   SCOPE: Tab rendering and routing, active-tab tracking from the route, search-panel open/close on Cmd/Ctrl+F.
//   DEPENDS: prefComponents/tabsBar/config (TABS), tabsBar/icons (TAB_ICONS), tabsBar/searchPanel, vue-router, vue-i18n, util (isOsx).
//   LINKS: .grace/changes/active/C-38 T-003; .grace/graph/runtime.xml M-011; .grace/verification/runtime.xml V-M-011.
//   ROLE: RUNTIME
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   tabs - TABS enriched with the translated label and the mockup icon per id.
//   activeTabId - route.name when it is one of the 5 tab ids (redirects resolve before this renders).
//   pick - router.push to the tab path (no re-push when already active).
//   onKeydown - ⌘F/Ctrl+F toggles the search panel (the mockup toolbar has no search field; see searchPanel.vue).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-10-15 v1.0.0: C-38 T-003 — replaces the 9-item left rail (prefComponents/sideBar/index.vue) with the 5-tab toolbar from the approved mockup.
// END_CHANGE_SUMMARY

import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { TABS, TAB_IDS } from './config'
import { TAB_ICONS } from './icons'
import SearchPanel from './searchPanel.vue'
import { isOsx } from '@/util'

const { t } = useI18n()
const router = useRouter()
const route = useRoute()

const tabs = TABS.map((tab) => ({ ...tab, label: t(tab.labelKey), icon: TAB_ICONS[tab.id] }))

const activeTabId = computed(() => (TAB_IDS.includes(route.name) ? route.name : null))

// START_BLOCK_PICK_TAB
// Tab switches are plain route pushes; the shell (preference.vue)
// reacts to the route to persist the last tab and update the window
// title, so toolbar, URL, title and memory can never diverge.
const pick = (tab) => {
  if (tab.id === activeTabId.value) return
  router.push({ path: tab.path }).catch(() => {})
}
// END_BLOCK_PICK_TAB

const searchPanelRef = ref(null)
const searchOpen = ref(false)

// START_BLOCK_SEARCH_SHORTCUT
// ⌘F (macOS) / Ctrl+F (Windows/Linux) opens settings search. The
// approved mockup toolbar carries only the 5 centred tabs — no search
// field — so search stays available through the standard shortcut
// instead of extra chrome.
const onKeydown = (event) => {
  const isFind = (event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === 'f'
  if (!isFind) return
  event.preventDefault()
  const panel = searchPanelRef.value
  if (!panel) return
  if (searchOpen.value) {
    panel.close()
  } else {
    searchOpen.value = true
    panel.openPanel()
  }
}
// END_BLOCK_SEARCH_SHORTCUT

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
})
</script>

<style>
/* START_BLOCK_TOOLBAR_METRICS */
/* Mockup metrics: macOS — centred column tabs (icon 22px, label 11px
   underneath, 7px-radius soft background on the active tab); Windows/
   Linux — row tabs with a 2px accent underline. Colors come from the
   pref palette vars the shell defines (light/dark parity). */
.pref-toolbar {
  position: relative;
  display: flex;
  box-sizing: border-box;
  background: var(--prefBar, #ececec);
  border-bottom: 0.5px solid var(--prefLine, rgba(0, 0, 0, 0.08));
  -webkit-app-region: no-drag;
  user-select: none;
  flex: 0 0 auto;
}

.pref-toolbar--mac {
  justify-content: center;
  gap: 2px;
  padding: 2px 12px 8px;
}

.pref-toolbar--underline {
  gap: 4px;
  padding: 0 12px;
  border-bottom-width: 1px;
}

.pref-toolbar .pref-tab {
  all: unset;
  cursor: default;
  display: flex;
  box-sizing: border-box;
}

.pref-toolbar--mac .pref-tab {
  flex-direction: column;
  align-items: center;
  gap: 3px;
  min-width: 76px;
  padding: 6px 8px 5px;
  border-radius: 7px;
  color: var(--prefSub, #6b6b70);
}

.pref-toolbar--mac .pref-tab--active {
  color: var(--prefAccent, #007aff);
  background: var(--prefTabOn, rgba(0, 0, 0, 0.07));
}

.pref-toolbar--mac .pref-tab--active .pref-tab-label {
  color: var(--prefText, #1d1d1f);
}

.pref-toolbar--mac .pref-tab-label {
  font-size: 11px;
  color: var(--prefSub, #6b6b70);
}

.pref-toolbar--underline .pref-tab {
  flex-direction: row;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  color: var(--prefSub, #6b6b70);
  border-bottom: 2px solid transparent;
}

.pref-toolbar--underline .pref-tab--active {
  color: var(--prefText, #1d1d1f);
  border-bottom-color: var(--prefAccent, #005fb8);
}

.pref-toolbar--underline .pref-tab-label {
  font-size: 13px;
  font-weight: 400;
}

.pref-toolbar--underline .pref-tab--active .pref-tab-label {
  font-weight: 600;
}
/* END_BLOCK_TOOLBAR_METRICS */
</style>
