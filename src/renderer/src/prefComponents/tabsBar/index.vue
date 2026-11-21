<template>
  <nav
    class="pref-toolbar"
    :class="{ 'pref-toolbar--mac': isOsx, 'pref-toolbar--underline': !isOsx }"
    role="tablist"
    :aria-label="t('preferences.title')"
    :data-tauri-drag-region="isOsx ? '' : null"
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
// VERSION: 1.2.0
// START_MODULE_CONTRACT
//   PURPOSE: The C-38 T-003 Settings toolbar — icon tabs (the 5 mockup tabs plus the C-LARGE-DOC-WAVE-A Experimental tab; centred macOS-style on macOS, underline tabs on Windows/Linux) that drive the /preference router-view, plus the ⌘F/Ctrl+F settings-search panel.
//   SCOPE: Tab rendering and routing, active-tab tracking from the route, search-panel open/close on Cmd/Ctrl+F. C-COMPACT-WINDOWS-FIT: the base tab shrinks (min-width: 0; the mac variant keeps its 76px floor) and labels ellipsize on both style variants, so the seven tabs stay inside the fixed 640x620 window; keyboard focus carries the C-SETTINGS-KEYBOARD-FOCUS outline.
//   DEPENDS: prefComponents/tabsBar/config (TABS), tabsBar/icons (TAB_ICONS), tabsBar/searchPanel, vue-router, vue-i18n, util (isOsx).
//   LINKS: .grace/changes/archive/C-38 T-003; .grace/changes/archive/C-LARGE-DOC-WAVE-A (T-004 experimental tab); .grace/graph/runtime.xml M-011; .grace/verification/runtime.xml V-M-011.
//   ROLE: RUNTIME
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   tabs - TABS enriched with the translated label and the mockup icon per id.
//   activeTabId - route.name when it is one of the tab ids (redirects resolve before this renders).
//   pick - router.push to the tab path (no re-push when already active).
//   onKeydown - ⌘F/Ctrl+F toggles the search panel (the mockup toolbar has no search field; see searchPanel.vue).
//   toolbar fit (C-COMPACT-WINDOWS-FIT) - base .pref-tab min-width: 0 with the mac 76px floor kept; .pref-tab-label ellipsizes (nowrap + hidden + ellipsis) on both variants; .pref-tab:focus-visible carries the canon 2px accent outline at 1px offset.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-11-21 C-COMPACT-WINDOWS-FIT: the base .pref-tab gains
//     min-width: 0 (shrink allowance; the mac variant keeps its 76px
//     floor) and the shared .pref-tab-label ellipsizes (overflow hidden,
//     nowrap, ellipsis) on both style variants, so the seven tabs stay
//     inside the fixed 640x620 Settings window with the longest shipped
//     labels (de "Erscheinungsbild"); the tab gains the canon
//     :focus-visible accent outline. Template/JS untouched.
//   - 2026-11-02 v1.2.0: C-LARGE-DOC-WAVE-A T-004 — the toolbar renders
//     the Experimental tab that TABS/TAB_ICONS now carry (no logic change
//     here: tabs already map over the catalog).
//   - 2026-10-16 v1.1.0: C-51 T-008 — on macOS the Settings window has a transparent title bar over full-size content (m_v1_compat settings_transparent_titlebar), so the toolbar is the title-bar surface in the theme colour: it reserves the 28 px traffic-light strip and is a window drag region.
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

// Computed: labels must follow a language switch (review fix).
const tabs = computed(() => TABS.map((tab) => ({ ...tab, label: t(tab.labelKey), icon: TAB_ICONS[tab.id] })))

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
  /* 28 px: the transparent title bar (traffic lights + window title)
     sits over the top of the toolbar — C-51 T-008. */
  padding: 30px 12px 8px;
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
  /* C-COMPACT-WINDOWS-FIT: shrink allowance — a tab may go below its
     content width so the toolbar never pushes past the fixed 640px
     window. The macOS variant keeps its 76px floor below (7×76px +
     24px padding + gaps always fit 640px, so the floor never itself
     overflows). */
  min-width: 0;
}

/* C-COMPACT-WINDOWS-FIT: the shared label rule for BOTH style variants
   (mac column tabs, Win/Linux row tabs). The label is a flex child, so
   it is blockified and overflow paints: labels ellipsize instead of
   pushing tabs past the window edge. */
.pref-toolbar .pref-tab-label {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

/* C-SETTINGS-KEYBOARD-FOCUS canon: keyboard-visible outline only. */
.pref-toolbar .pref-tab:focus-visible {
  outline: 2px solid var(--prefAccent);
  outline-offset: 1px;
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
