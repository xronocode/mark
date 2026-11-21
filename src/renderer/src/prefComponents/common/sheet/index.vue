<template>
  <!-- START_BLOCK_SHEET_OVERLAY -->
  <div
    v-if="open"
    class="pref-sheet-overlay"
    role="dialog"
    aria-modal="true"
    :aria-label="title"
  >
    <!-- C-COMPACT-WINDOWS-FIT: the panel is keyboard-modal. ElFocusTrap
         (the element-plus deep per-component import, the el-dialog
         precedent in editor.vue's insert-table dialog) claims initial
         focus inside the panel, cycles Tab/Shift+Tab within it in both
         directions and restores focus to the invoking control on
         release. The Esc capture handler below stays byte-identical. -->
    <el-focus-trap :trapped="open" loop :focus-trap-el="sheetEl">
      <div ref="sheetEl" class="pref-sheet" :style="sheetStyle">
        <div class="pref-sheet-head">
          <span class="pref-sheet-title">{{ title }}</span>
          <button
            type="button"
            class="pref-sheet-close"
            :aria-label="t('preferences.advanced.sheets.close')"
            @click="close"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
              <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" stroke-width="1.4" />
            </svg>
          </button>
        </div>
        <div class="pref-sheet-body">
          <slot></slot>
        </div>
        <div v-if="hasFoot" class="pref-sheet-foot">
          <slot name="foot"></slot>
        </div>
      </div>
    </el-focus-trap>
  </div>
  <!-- END_BLOCK_SHEET_OVERLAY -->
</template>

<script setup>
// FILE: src/renderer/src/prefComponents/common/sheet/index.vue
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Modal sheet over the Settings window (C-38 T-004) — a centred 560px panel with a title, Close button and Esc handling that hosts the Advanced-tab pop-ups (keyboard shortcuts, extensions gallery, custom CSS).
//   SCOPE: Overlay/panel rendering, Esc key handling, close emission; content comes from the default slot and optional actions from the foot slot.
//   DEPENDS: vue-i18n (sheet close label); element-plus/es/components/focus-trap (ElFocusTrap — the keyboard modality trap, C-COMPACT-WINDOWS-FIT).
//   LINKS: .grace/changes/archive/C-38 T-004; prefComponents/tabs/advanced; .grace/graph/runtime.xml M-011; .grace/verification/runtime.xml V-M-011.
//   ROLE: RUNTIME
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   open - visibility prop (parent-owned; the sheet only emits close).
//   hasFoot - whether the foot slot carries actions (panel padding adapts).
//   sheetStyle - panel width override from the width prop (default 560px).
//   close - emits 'close' (Close button and Esc).
//   onKeydown - window Escape listener bound while the sheet is open.
//   sheetEl - the panel element bound to ElFocusTrap (C-COMPACT-WINDOWS-FIT): opening claims initial focus inside the panel, Tab/Shift+Tab cycle in both directions, release restores the invoking control's focus.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: 2026-11-21 C-COMPACT-WINDOWS-FIT: the panel is wrapped
//   in ElFocusTrap (element-plus/es/components/focus-trap deep import,
//   trapped bound to open, loop enabled) — initial focus inside the
//   panel, both-direction Tab wrap, focus restored to the invoking
//   control on release; the capture-phase Escape handler, 560px metrics
//   and slot flows are unchanged; .pref-sheet-close carries the canon
//   :focus-visible outline.
//   LAST_CHANGE: [v1.0.0 - 2026-10-15 C-38 T-004: initial control — the macOS-sheet-styled modal panel the approved mockup specifies for the Advanced-tab pop-ups.]
// END_CHANGE_SUMMARY

import { ref, onMounted, onUnmounted, useSlots } from 'vue'
import { useI18n } from 'vue-i18n'
// C-COMPACT-WINDOWS-FIT: the verified deep per-component import (the
// repo convention — main.js imports ElDialog the same way); the pinned
// ^2.14.8 build exports ElFocusTrap with the loop/trapped/focusStartEl
// props.
import { ElFocusTrap } from 'element-plus/es/components/focus-trap/index.mjs'

const props = defineProps({
  open: {
    type: Boolean,
    default: false
  },
  title: {
    type: String,
    required: true
  },
  width: {
    type: Number,
    default: 560
  }
})

const emit = defineEmits(['close'])

const { t } = useI18n()
const slots = useSlots()

// The trap container: the panel element feeds ElFocusTrap's focusTrapEl
// (the el-dialog/drawer wiring) — the ref resolves once the overlay
// mounts, and the trap claims focus, cycles Tab both ways inside the
// panel and restores the invoking control's focus when released.
const sheetEl = ref(null)

const hasFoot = Boolean(slots.foot)
const sheetStyle = props.width !== 560 ? { width: `${props.width}px` } : undefined

// START_BLOCK_SHEET_ESC
// Esc closes the sheet wherever the focus sits inside the Settings
// window. The parents keep the sheet mounted (only the overlay is
// v-if'd), so the listener guards on the open prop — a stray Escape
// with no sheet visible is a no-op.
const onKeydown = (event) => {
  if (!props.open) return
  if (event.key === 'Escape') {
    event.stopPropagation()
    close()
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown, true)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown, true)
})
// END_BLOCK_SHEET_ESC

const close = () => {
  emit('close')
}
</script>

<style>
/* START_BLOCK_SHEET_METRICS */
/* Mockup sheet: dimmed overlay over the whole Settings window, centred
   panel on the group-card surface with a hairline border, 10px radius
   and the standard push-button Close in the header. */
.pref-sheet-overlay {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  box-sizing: border-box;
  background: rgba(0, 0, 0, 0.25);
}

.pref-sheet-overlay .pref-sheet {
  display: flex;
  flex-direction: column;
  width: 560px;
  max-width: 100%;
  max-height: calc(100vh - 48px);
  box-sizing: border-box;
  border-radius: 10px;
  border: 0.5px solid var(--prefCtrlBorder, rgba(0, 0, 0, 0.14));
  background: var(--prefGroup, #ffffff);
  color: var(--prefText, #1d1d1f);
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.35);
  overflow: hidden;
  font-family: inherit;
}

.pref-sheet-overlay .pref-sheet-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 0.5px solid var(--prefLine, rgba(0, 0, 0, 0.08));
  user-select: none;
}

.pref-sheet-overlay .pref-sheet-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--prefText, #1d1d1f);
}

.pref-sheet-overlay .pref-sheet-close {
  all: unset;
  cursor: default;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 5px;
  color: var(--prefSub, #6b6b70);
}

.pref-sheet-overlay .pref-sheet-close:hover {
  background: var(--prefTabOn, rgba(0, 0, 0, 0.07));
  color: var(--prefText, #1d1d1f);
}

/* C-SETTINGS-KEYBOARD-FOCUS canon: visible only for keyboard focus —
   the 22px button must not clip the 2px ring (outline paints outside
   the border box and the 24px head padding gives it room). */
.pref-sheet-overlay .pref-sheet-close:focus-visible {
  outline: 2px solid var(--prefAccent);
  outline-offset: 1px;
}

.pref-sheet-overlay .pref-sheet-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 14px 16px;
}

.pref-sheet-overlay .pref-sheet-body::-webkit-scrollbar,
.pref-sheet-overlay .pref-sheet-body::-webkit-scrollbar-track,
.pref-sheet-overlay .pref-sheet-body::-webkit-scrollbar-corner {
  background: transparent;
}

.pref-sheet-overlay .pref-sheet-body::-webkit-scrollbar:vertical {
  width: 10px;
}

.pref-sheet-overlay .pref-sheet-body::-webkit-scrollbar-thumb {
  background: var(--prefOff, #d8d8dc);
  border: 3px solid transparent;
  border-radius: 6px;
  background-clip: padding-box;
}

.pref-sheet-overlay .pref-sheet-foot {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 10px 16px;
  border-top: 0.5px solid var(--prefLine, rgba(0, 0, 0, 0.08));
}
/* END_BLOCK_SHEET_METRICS */
</style>
