<template>
  <!-- START_BLOCK_QUICK_SETTINGS_BUTTON -->
  <div
    ref="buttonRef"
    class="titlebar-nav-btn quick-settings-btn"
    role="button"
    tabindex="0"
    :aria-label="t('quickSettings.title')"
    :title="t('quickSettings.title')"
    :aria-expanded="open ? 'true' : 'false'"
    @click.stop="toggle"
    @keydown.enter.prevent="toggle"
  >
    <!-- The «Aa» affordance is a SYSTEM-FONT text glyph, not a drawn
         icon: letterforms hand-drawn on the icon grid failed twice
         (2026-11-09 — lucide 24-grid paths rendered thinner than the
         chrome family; a 16-grid redraw had bad letter proportions).
         «Aa» set in the bar's own font reads as typography next to the
         icon glyphs — the Notion/Bear page-settings precedent. It
         replaces chevrons-left-right, which read as "code view" beside
         the source-mode chip. -->
    <span class="qs-aa" aria-hidden="true">Aa</span>
  </div>
  <!-- END_BLOCK_QUICK_SETTINGS_BUTTON -->

  <!-- START_BLOCK_QUICK_SETTINGS_PANEL -->
  <aside
    v-if="open"
    ref="panelRef"
    class="quick-settings-popover title-no-drag"
    role="dialog"
    :aria-label="t('quickSettings.title')"
    :data-darkmode="isDarkMember ? 'true' : 'false'"
  >
    <nav class="quick-toolbar" role="tablist" :aria-label="t('quickSettings.title')">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        type="button"
        class="quick-tab"
        :class="{ 'quick-tab--active': tab.id === activeTab }"
        role="tab"
        :aria-selected="tab.id === activeTab ? 'true' : 'false'"
        @click="activeTab = tab.id"
      >
        <span class="quick-tab-icon" v-html="tab.icon"></span>
        <span class="quick-tab-label">{{ tab.label }}</span>
      </button>
    </nav>

    <div class="quick-body">
      <page-tab v-show="activeTab === 'page'" :pathname="pathname"></page-tab>
      <view-tab v-show="activeTab === 'view'" :pathname="pathname"></view-tab>
      <tables-tab v-show="activeTab === 'tables'"></tables-tab>
    </div>

    <button type="button" class="quick-openall" @click.stop="openSettings">
      <span>{{ t('quickSettings.openSettings') }}</span>
      <span class="cap">{{ acceleratorCaption }}</span>
    </button>
  </aside>
  <!-- END_BLOCK_QUICK_SETTINGS_PANEL -->
</template>

<script setup>
// FILE: src/renderer/src/components/titleBar/quickSettings/index.vue
// VERSION: 1.3.0
// START_MODULE_CONTRACT
//   PURPOSE: C-PAGE-WIDTH-TABLES T-003 (M-061) the titlebar quick-settings shell — the «Aa» button (a system-font text glyph) beside the theme button and the popover panel (Page / View / Tables live tabs) built exclusively from the C-38 component set in the neutral settings palette. The panel is NOT tinted by the editor theme: it follows the theme mode light/dark member (data-darkmode attribute over the verbatim --pref* palette) and every inner interaction keeps it open — only an outside click or Escape closes it; the footer opens the real Settings window.
//   SCOPE: Shell only — open/close (window capture-phase mousedown closer, the doc-info-popover precedent; T-010 adds the quick-settings:open bus entry point the View › Page Width › Custom… menu row and its palette command use), tab switching, dark-member parity, palette/row-anatomy CSS for its subtree and the Settings hand-off. The tab bodies (quickSettings/pageTab.vue, viewTab.vue, tablesTab.vue) own their domain state; this file holds no width or theme logic of its own. The dark active-segment contrast fix lives in the shared segmented component, never here.
//   DEPENDS: vue, vue-i18n, @/bus (the quick-settings:open entry point), @/store/preferences (theme member for the data-darkmode parity), @/store/project (OPEN_SETTING_WINDOW — the same Settings entry the gear and palette use), the three tab components.
//   LINKS: .grace/changes/active/C-PAGE-WIDTH-TABLES (plan T-003, corner C-4; plan T-010 — the Custom… bus entry); .grace/graph/performance.xml M-061; components/titleBar/index.vue (the mount point beside the theme button); prefComponents/common/* (the C-38 controls); pages/preference.vue (the palette source these verbatim values mirror); the approved real-app mock artifacts (boot.js section 1 glyph, approved.html structure, approved.css metrics).
//   ROLE: RUNTIME
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   open - panel visibility; the v-if keeps every tab's state per open (each open reloads the document tiers).
//   activeTab - the live tab id ('page' | 'view' | 'tables').
//   tabs - the three tab descriptors with the approved 18px glyph markup (page / view / tables).
//   isDarkMember - the theme mode light/dark member (isDarkTheme over the active theme) driving the data-darkmode attribute.
//   acceleratorCaption - "⌘," on macOS, "Ctrl+," elsewhere (native menu convention; the caption never lies about the platform).
//   toggle - open/close; opening measures the button to right-align the panel under it.
//   openPanel - the shared open path with an explicit tab (the button opens 'page'; the quick-settings:open bus event opens the requested tab).
//   openSettings - projectStore.OPEN_SETTING_WINDOW (the real Settings window, footer row).
//   onDocMouseDown/onDocKeydown - outside-click (window capture phase, ahead of Tauri drag.js) and Escape closers; inner interactions never close (the closer excludes the panel and this button).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.3.0 - 2026-11-09 owner glyph rework, third pass:
//   «Aa» becomes a system-font text glyph (span.qs-aa, 12.5px semibold)
//   after both drawn attempts failed live review — lucide a-large-small
//   (24-grid, 15px, 1.7) rendered thinner than the chrome family, and a
//   chrome 16-grid redraw (1.4 stroke) had bad letter proportions.
//   Letters come from the bar's own font, the Notion/Bear page-settings
//   precedent; chevrons-left-right read as "code view" beside the
//   source-mode chip (mode-source draws the same chevrons). No behavior,
//   palette or panel change.
//   PREV: v1.1.0 - 2026-11-02 C-PAGE-WIDTH-TABLES T-010: the
//   quick-settings:open bus entry point — View › Page Width › Custom…
//   (view.page-width.custom) opens the panel on the requested tab; the
//   open path is extracted into openPanel(tab) and the listener leaves
//   with the component. The v1.0.0 shell (T-003, M-061) shipped the
//   chevrons-left-right button of the approved mock; the glyph is
//   history since the 2026-11-09 rework.
// END_CHANGE_SUMMARY

import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import bus from '@/bus'
import { usePreferencesStore } from '@/store/preferences'
import { useProjectStore } from '@/store/project'
import { isDarkTheme } from '@/config'
import { isOsx } from '@/util'
import PageTab from './pageTab.vue'
import ViewTab from './viewTab.vue'
import TablesTab from './tablesTab.vue'

// The active document's pathname: the per-document tiers (width entry,
// theme override) key off it; untitled tabs carry '' and the tabs force
// the global scope for them (review finding F4).
const props = defineProps({
  pathname: { type: String, default: '' }
})

const { t } = useI18n()
const preferencesStore = usePreferencesStore()
const projectStore = useProjectStore()

const { theme } = storeToRefs(preferencesStore)

const open = ref(false)
const activeTab = ref('page')
const panelRef = ref(null)
const buttonRef = ref(null)

// The approved tab glyphs (approved.html verbatim drawings).
const TAB_ICONS = {
  page:
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M19 17V7"/><path d="M5 17V7"/><path d="m15 15 3-3-3-3"/><path d="m9 9-3 3 3 3"/></svg>',
  view:
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 010 17z" fill="currentColor" stroke="none"/></svg>',
  tables:
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4.5" width="18" height="15" rx="2"/><path d="M3 10h18M9 10v9.5M15 10v9.5"/></svg>'
}

const tabs = computed(() => [
  { id: 'page', label: t('quickSettings.tabs.page'), icon: TAB_ICONS.page },
  { id: 'view', label: t('quickSettings.tabs.view'), icon: TAB_ICONS.view },
  { id: 'tables', label: t('quickSettings.tabs.tables'), icon: TAB_ICONS.tables }
])

// START_BLOCK_DARK_MEMBER
// The panel follows the theme MODE member (light/dark), never the
// specific theme's colours: the same classification the titlebar cycle
// and body.dark use (util/theme.js addThemeStyle). The attribute keeps
// the parity legible in the DOM; the palette below keys off it.
const isDarkMember = computed(() => isDarkTheme(theme.value))
// END_BLOCK_DARK_MEMBER

const acceleratorCaption = computed(() => (isOsx ? '⌘,' : 'Ctrl+,'))

// START_BLOCK_OPEN_CLOSE
// Opening right-aligns the panel under the button (the approved mock
// placement); the coordinates are relative to the positioned .title-bar
// ancestor, so a plain offset from the button's right edge is enough.
const toggle = () => {
  if (open.value) {
    open.value = false
    return
  }
  openPanel('page')
}

const openPanel = (tabId) => {
  activeTab.value = tabId || 'page'
  open.value = true
  requestAnimationFrame(() => {
    const panel = panelRef.value
    const button = buttonRef.value
    if (!panel || !button) return
    const bar = panel.offsetParent
    const buttonRight = button.getBoundingClientRect().right
    const barRight = bar ? bar.getBoundingClientRect().right : window.innerWidth
    panel.style.right = `${Math.max(8, barRight - buttonRight)}px`
  })
}

// C-PAGE-WIDTH-TABLES T-010: View › Page Width › Custom… (the
// view.page-width.custom command) and its palette row open the panel on
// the requested tab through this bus event — the shell keeps owning
// open/close, the command owns nothing but the emit.
const onQuickSettingsOpen = (payload) => {
  if (open.value) return
  openPanel(payload && payload.tab)
}

// The footer opens the REAL Settings window (the same entry point the
// Win/Linux gear and the palette use) and closes the panel.
const openSettings = () => {
  open.value = false
  projectStore.OPEN_SETTING_WINDOW()
}
// END_BLOCK_OPEN_CLOSE

// Outside click and Escape close the panel; interactions inside never
// do. The mousedown closer listens on window in the CAPTURE phase —
// Tauri's drag.js stops immediate propagation on data-tauri-drag-region
// targets at document level (the doc-info-popover lesson), and the
// button itself is excluded so its click can toggle the panel closed.
const onDocMouseDown = (event) => {
  if (!open.value) return
  const target = event.target instanceof Element ? event.target : null
  if (!target) return
  if (target.closest('.quick-settings-popover, .quick-settings-btn')) return
  open.value = false
}

const onDocKeydown = (event) => {
  if (!open.value) return
  if (event.key === 'Escape') open.value = false
}

onMounted(() => {
  window.addEventListener('mousedown', onDocMouseDown, true)
  document.addEventListener('keydown', onDocKeydown)
  bus.on('quick-settings:open', onQuickSettingsOpen)
})

onBeforeUnmount(() => {
  window.removeEventListener('mousedown', onDocMouseDown, true)
  document.removeEventListener('keydown', onDocKeydown)
  bus.off('quick-settings:open', onQuickSettingsOpen)
})
</script>

<style>
/* START_BLOCK_QUICK_PALETTE */
/* The neutral settings palette, VERBATIM from the C-38 shell
   (pages/preference.vue .pref-container — the values the approved mock
   approved.css carries as well). The panel is a miniature of the real
   Settings window: it is never tinted by the editor theme; dark parity
   follows the theme mode member via the data-darkmode attribute. */
.quick-settings-popover {
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
}

.quick-settings-popover[data-darkmode='true'] {
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
}
/* END_BLOCK_QUICK_PALETTE */

/* START_BLOCK_QUICK_PANEL_METRICS */
/* Panel shell metrics from the approved mock (approved.css .prefwin):
   fixed width 428px, 12px radius, hairline border, the settings shadow.
   Anchored under the title-bar like the doc-info popover. */
.quick-settings-popover {
  position: absolute;
  top: calc(100% + 6px);
  right: 8px;
  width: 428px;
  max-width: calc(100vw - 32px);
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  background: var(--prefBg);
  color: var(--prefText);
  font-family: var(--chromeFontFamily, inherit);
  -webkit-font-smoothing: antialiased;
  border: 0.5px solid var(--prefLine);
  border-radius: 12px;
  box-shadow: 0 6px 20px var(--floatShadow, rgba(0, 0, 0, 0.2));
  overflow: hidden;
  cursor: default;
  z-index: 1000;
}

/* Toolbar: the tabsBar mac column-tab anatomy verbatim (no fake traffic
   lights — the real title bar is right above; decorative chrome is
   forbidden, the v5 lesson). */
.quick-settings-popover .quick-toolbar {
  display: flex;
  justify-content: center;
  gap: 2px;
  padding: 10px 12px 8px;
  box-sizing: border-box;
  background: var(--prefBar);
  border-bottom: 0.5px solid var(--prefLine);
  user-select: none;
}

.quick-settings-popover .quick-tab {
  all: unset;
  cursor: default;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  min-width: 76px;
  box-sizing: border-box;
  padding: 6px 8px 5px;
  border-radius: 7px;
  color: var(--prefSub);
}

.quick-settings-popover .quick-tab--active {
  color: var(--prefAccent);
  background: var(--prefTabOn);
}

.quick-settings-popover .quick-tab-label {
  font-size: 11px;
  color: var(--prefSub);
}

.quick-settings-popover .quick-tab--active .quick-tab-label {
  color: var(--prefText);
}

.quick-settings-popover .quick-tab svg {
  width: 18px;
  height: 18px;
  pointer-events: none;
}

.quick-settings-popover .quick-tab:focus-visible,
.quick-settings-popover .quick-openall:focus-visible {
  outline: 2px solid var(--prefAccent);
  outline-offset: 1px;
}

/* Body: 16/18px padding, scroll only vertically (approved.css). */
.quick-settings-popover .quick-body {
  padding: 16px 18px 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 62vh;
  overflow-y: auto;
  overflow-x: hidden;
}

.quick-settings-popover .quick-body::-webkit-scrollbar,
.quick-settings-popover .quick-body::-webkit-scrollbar-track,
.quick-settings-popover .quick-body::-webkit-scrollbar-corner {
  background: transparent;
}

/* Footer: the "Open Settings…" row (approved.css .pref-openall). */
.quick-settings-popover .quick-openall {
  all: unset;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  box-sizing: border-box;
  padding: 9px 16px;
  font-size: 13px;
  color: var(--prefAccent);
  border-top: 0.5px solid var(--prefLine);
}

.quick-settings-popover .quick-openall:hover {
  background: rgba(0, 0, 0, 0.04);
}

.quick-settings-popover[data-darkmode='true'] .quick-openall:hover {
  background: rgba(255, 255, 255, 0.05);
}

.quick-settings-popover .quick-openall .cap {
  font-size: 11px;
  color: var(--prefSub);
}
/* END_BLOCK_QUICK_PANEL_METRICS */

/* START_BLOCK_QUICK_ROW_ANATOMY */
/* The C-38 row anatomy for this subtree, VERBATIM from the shell
   (pages/preference.vue .pref-container .pref-row): the shared controls
   carry their own control metrics; the row layout belongs to the shell
   that hosts them, and the editor window does not load the Settings
   shell's stylesheet. :deep() reaches the control components' roots. */
.quick-settings-popover .pref-row {
  display: flex;
  align-items: center;
  gap: 16px;
  min-height: 40px;
  padding: 8px 14px;
  box-sizing: border-box;
  flex-wrap: nowrap;
  font-size: 13px;
  color: var(--prefText);
}

.quick-settings-popover .pref-row .pref-row-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1 1 0;
  min-width: 0;
}

.quick-settings-popover .pref-row .pref-row-label {
  font-size: 13px;
  color: var(--prefText);
}

.quick-settings-popover .pref-row .pref-row-help {
  font-size: 11px;
  line-height: 1.35;
  color: var(--prefSub);
}

.quick-settings-popover .pref-row .pref-row-control {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 8px;
}

.quick-settings-popover .ag-underdevelop {
  opacity: 0.55;
}
/* END_BLOCK_QUICK_ROW_ANATOMY */

/* START_BLOCK_QS_AA_GLYPH */
/* The button's «Aa»: a text glyph in the inherited bar font — the icon
   svg attempts (lucide 24-grid, then a chrome 16-grid redraw) failed
   typographic quality at this size; the system font's letters are the
   reference. 12.5px semibold optically matches the 16px icon family
   (cap height ≈ 9px against the icons' ~12.4px box with their natural
   whitespace); -0.2px tracking keeps the pair tight. */
.quick-settings-btn .qs-aa {
  font-size: 12.5px;
  font-weight: 600;
  line-height: 1;
  letter-spacing: -0.2px;
  user-select: none;
  -webkit-user-select: none;
}
/* END_BLOCK_QS_AA_GLYPH */
</style>
