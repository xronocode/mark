<template>
  <div v-if="visible" class="ag-whats-new-scrim" @mousedown.self="close">
    <div
      ref="sheet"
      class="ag-whats-new-sheet"
      role="dialog"
      aria-modal="true"
      :aria-label="t('whatsNew.title')"
      tabindex="-1"
      @keydown.esc="close"
      @keydown.tab="onTab"
    >
      <span class="eyebrow">{{ t('whatsNew.eyebrow', { version }) }}</span>
      <h3 class="title">{{ t('whatsNew.title') }}</h3>
      <ul class="news" v-if="items.length">
        <li v-for="item in items" :key="item.titleKey">
          <span class="news-icon" aria-hidden="true">{{ item.icon }}</span>
          <div class="news-body">
            <b>{{ t(item.titleKey) }}</b>
            <span>{{ t(item.textKey) }}</span>
          </div>
        </li>
      </ul>
      <div class="sheet-foot">
        <button ref="guideLink" class="guide-link" type="button" @click="openGuide">
          {{ t('whatsNew.seeGuide') }}
        </button>
        <button ref="continueButton" class="continue-button" type="button" @click="close">
          {{ t('whatsNew.continue') }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
// MODULE_CONTRACT
//   PURPOSE: C-48 What's New sheet — the once-per-update modal (board 3
//            mockup) with focus trap, Esc/Continue close, focus return,
//            and the "See the guide" deep link.
//   SCOPE:   own visibility only. Opens on the `whatsNewDialog` bus event
//            (Help › What's New command and the pages/app.vue startup
//            gate both emit it); never reads or writes prefs itself.
//   DEPENDS: bus, i18n t, whatsNew/data.js, whatsNew/gate.js
//            (getRunningVersion).
//   LINKS:   .grace/changes/archive/C-48/spec.xml R-1; commands/index.js
//            help.whats-new; review/reviewRequest.js probes
//            .ag-whats-new-sheet to block its ask.
//
// CHANGE_SUMMARY:
//   - 2026-10-15 C-48 review fix: "See the guide" emits mt::open-guide
//     with {} (C-40's guide has no 'whats-new' section); the dialog
//     aria-label uses the localized whatsNew.title key instead of a
//     hard-coded English string.
//   - 2026-10-15 C-48 T-001: initial component.
import { ref, nextTick, onMounted, onBeforeUnmount } from 'vue'
import bus from '@/bus'
import { t } from '@/i18n'
import { getWhatsNewItems } from '@/whatsNew/data'
import { getRunningVersion } from '@/whatsNew/gate'

const visible = ref(false)
const version = ref(getRunningVersion())
const items = ref([])
const sheet = ref(null)
const continueButton = ref(null)
const guideLink = ref(null)
let restoreFocusTo = null

// START_BLOCK_OPEN_SHEET
// payload (optional): { version } — the startup gate passes the upgraded
// version; the Help menu reopen passes nothing and the running version
// is used. Items clamp to the 4-entry cap inside getWhatsNewItems.
const openSheet = (payload) => {
  version.value = (payload && typeof payload.version === 'string' && payload.version) || getRunningVersion()
  items.value = getWhatsNewItems(version.value)
  if (!items.value.length) return
  restoreFocusTo = document.activeElement
  visible.value = true
  nextTick(() => {
    if (continueButton.value) continueButton.value.focus()
    else if (sheet.value) sheet.value.focus()
  })
}
// END_BLOCK_OPEN_SHEET

const close = () => {
  if (!visible.value) return
  visible.value = false
  // Return focus to where the user was before the sheet appeared.
  if (restoreFocusTo && typeof restoreFocusTo.focus === 'function') {
    restoreFocusTo.focus()
  }
  restoreFocusTo = null
}

// START_BLOCK_FOCUS_TRAP
// Tab (and Shift+Tab) cycle inside the sheet — the two footer controls
// are the only focusable elements; moving past either end wraps.
const onTab = (e) => {
  const focusables = [guideLink.value, continueButton.value].filter(Boolean)
  if (focusables.length < 2) return
  const idx = focusables.indexOf(document.activeElement)
  e.preventDefault()
  const nextIdx = e.shiftKey ? (idx <= 0 ? focusables.length - 1 : idx - 1) : idx === focusables.length - 1 ? 0 : idx + 1
  focusables[nextIdx].focus()
}
// END_BLOCK_FOCUS_TRAP

// START_BLOCK_OPEN_GUIDE
// C-40 owns the Guide; the link rides the bus so this sheet needs no
// Guide import. The guide has no What's New section, so it opens at the
// top (empty payload, same as Help › Mark Guide). Keep the sheet open —
// the Guide opens as a tab and the user closes this sheet when done.
const openGuide = () => {
  bus.emit('mt::open-guide', {})
}
// END_BLOCK_OPEN_GUIDE

onMounted(() => {
  bus.on('whatsNewDialog', openSheet)
})

onBeforeUnmount(() => {
  bus.off('whatsNewDialog', openSheet)
})
</script>

<style scoped>
/* Colors come from the active theme (Paper/Ink/…) via the shared CSS
   variables — never hard-coded palette values (AGENTS design rule). */
.ag-whats-new-scrim {
  position: fixed;
  inset: 0;
  background: var(--maskColor, rgba(0, 0, 0, 0.3));
  z-index: 1000;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 12vh;
}

.ag-whats-new-sheet {
  width: 520px;
  max-width: calc(100vw - 48px);
  background: var(--floatBgColor, #fff);
  color: var(--floatFontColor, inherit);
  border-radius: 14px;
  box-shadow: 0 30px 60px -20px var(--floatShadow, rgba(0, 0, 0, 0.45)),
    0 0 0 1px var(--floatBorderColor, rgba(0, 0, 0, 0.1));
  padding: 26px 28px 22px;
  display: grid;
  gap: 16px;
  outline: none;
}

.ag-whats-new-sheet .eyebrow {
  font-size: 11px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--editorColor50, rgba(0, 0, 0, 0.5));
}

.ag-whats-new-sheet .title {
  margin: 0;
  font-size: 30px;
  line-height: 1.05;
  letter-spacing: -0.02em;
  font-weight: 800;
  color: var(--editorColor, inherit);
}

.ag-whats-new-sheet .news {
  display: grid;
  gap: 12px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.ag-whats-new-sheet .news li {
  display: grid;
  grid-template-columns: 34px 1fr;
  gap: 12px;
  align-items: start;
}

.ag-whats-new-sheet .news-icon {
  width: 34px;
  height: 34px;
  border-radius: 9px;
  background: var(--inputBgColor, rgba(0, 0, 0, 0.05));
  display: grid;
  place-items: center;
  font-size: 16px;
}

.ag-whats-new-sheet .news-body b {
  display: block;
  font-size: 14.5px;
  color: var(--editorColor, inherit);
}

.ag-whats-new-sheet .news-body span {
  font-size: 13.5px;
  color: var(--editorColor50, rgba(0, 0, 0, 0.5));
}

.ag-whats-new-sheet .sheet-foot {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 4px;
}

.ag-whats-new-sheet .guide-link {
  font-size: 13.5px;
  color: var(--editorColor, inherit);
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  text-decoration: underline;
  text-decoration-color: var(--highlightColor, currentColor);
  text-decoration-thickness: 2px;
  text-underline-offset: 3px;
}

.ag-whats-new-sheet .continue-button {
  height: 30px;
  padding: 0 14px;
  border: none;
  border-radius: 7px;
  background: var(--buttonPrimaryBgColor, #333);
  color: var(--buttonPrimaryFontColor, #fff);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}

.ag-whats-new-sheet .continue-button:hover {
  background: var(--buttonPrimaryBgColorHover, #222);
}

.ag-whats-new-sheet .continue-button:focus-visible {
  outline: 2px solid var(--focusColor, currentColor);
  outline-offset: 2px;
}

.ag-whats-new-sheet .guide-link:focus-visible {
  outline: 2px solid var(--focusColor, currentColor);
  outline-offset: 2px;
}
</style>
