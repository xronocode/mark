<template>
  <teleport to="body">
    <div
      v-if="mode"
      class="workspace-mode-overlay"
      @mousedown="onBackdrop"
    >
      <div
        ref="boxRef"
        class="workspace-mode-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="workspace-mode-title"
        @keydown="onKeydown"
      >
        <div class="workspace-mode-header">
          <span id="workspace-mode-title" class="workspace-mode-title">{{
            mode === 'chooser' ? t('workspace.chooser.title') : t('workspace.replaceConfirm.title')
          }}</span>
          <button
            type="button"
            class="workspace-mode-x"
            :aria-label="t('workspace.chooser.cancel')"
            @click="chooseCancel"
          >✕</button>
        </div>
        <div class="workspace-mode-message">
          <template v-if="mode === 'chooser'">
            {{ t('workspace.chooser.message', { folder: chooserFolderName }) }}
          </template>
          <template v-else>
            {{ t('workspace.replaceConfirm.message', { count: dirtyCount }) }}
          </template>
        </div>
        <div class="workspace-mode-actions">
          <!-- macOS order (FIX-011 house rule): destructive leftmost, plain
               Cancel, default rightmost — the destructive action never sits
               next to the default, and nothing is labelled "Close". -->
          <button
            type="button"
            class="workspace-mode-btn workspace-mode-destructive"
            @click="chooseDestructive"
          >{{ destructiveLabel }}</button>
          <button
            type="button"
            class="workspace-mode-btn workspace-mode-cancel"
            @click="chooseCancel"
          >{{ t('workspace.chooser.cancel') }}</button>
          <button
            ref="defaultBtnRef"
            type="button"
            class="workspace-mode-btn workspace-mode-default"
            @click="chooseDefault"
          >{{ defaultLabel }}</button>
        </div>
      </div>
    </div>
  </teleport>
</template>

<script setup>
// FILE: src/renderer/src/components/sideBar/workspaceModeDialog.vue
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: C-MULTI-SOURCE-WORKSPACE — the shared Add-or-Replace chooser
//            for ambiguous folder inputs (drop, clipboard, Recent, switcher)
//            and the one-shot replace dirty-confirm (Save & Close / Don't
//            Save / Cancel) before a replace closes roots owning dirty tabs.
//   SCOPE: Store-driven modal rendering only — reads pendingFolderChoice /
//          pendingReplaceConfirm from the project store and resolves them
//          through RESOLVE_FOLDER_CHOICE / RESOLVE_REPLACE_CONFIRM. No open
//          logic lives here; Escape, the close glyph and a backdrop click
//          resolve Cancel (the nondestructive default), Tab is trapped.
//   DEPENDS: store/project (pending states + resolution actions); vue-i18n;
//            window.path.basename for the chooser folder label.
//   LINKS: .grace/changes/active/C-MULTI-SOURCE-WORKSPACE;
//          .grace/graph/features.xml M-036; .grace/verification/features.xml
//          V-M-036; pages/app.vue (mount); components/editorWithTabs/
//          unsavedCloseDialog.js (the FIX-011 three-action house pattern);
//          tests/renderer/components/sideBar/workspaceModeDialog.test.js.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   (default export) - WorkspaceModeDialog, mounted once at the app level
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-22 C-MULTI-SOURCE-WORKSPACE: new module.
//   One dialog, two store-driven modes: the chooser (Add preselected as the
//   safe default, Replace labelled destructive, Cancel) and the replace
//   dirty-confirm (Save & Close default, Don't Save destructive, Cancel —
//   Cancel leaves roots, tabs and dirty flags untouched).
// END_CHANGE_SUMMARY

import { computed, nextTick, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { useProjectStore } from '@/store/project'

const { t } = useI18n()
const projectStore = useProjectStore()
const { pendingFolderChoice, pendingReplaceConfirm } = storeToRefs(projectStore)

const boxRef = ref(null)
const defaultBtnRef = ref(null)

const mode = computed(() => {
  if (pendingReplaceConfirm.value) return 'replace-confirm'
  if (pendingFolderChoice.value) return 'chooser'
  return null
})

const chooserFolderName = computed(() => {
  const pathname = pendingFolderChoice.value?.pathname || ''
  const base = window.path?.basename ? window.path.basename(pathname) : ''
  return base || pathname
})

const dirtyCount = computed(() => pendingReplaceConfirm.value?.dirtyIds?.length || 0)

const destructiveLabel = computed(() =>
  mode.value === 'chooser'
    ? t('workspace.chooser.replace')
    : t('workspace.replaceConfirm.dontSave')
)

const defaultLabel = computed(() =>
  mode.value === 'chooser'
    ? t('workspace.chooser.add')
    : t('workspace.replaceConfirm.saveClose')
)

// The safe default gets focus when a mode opens — Enter resolves Add /
// Save & Close, never the destructive action.
watch(mode, async (value) => {
  if (value) {
    await nextTick()
    defaultBtnRef.value?.focus()
  }
})

const chooseDefault = () => {
  if (mode.value === 'chooser') {
    void projectStore.RESOLVE_FOLDER_CHOICE('add')
  } else {
    void projectStore.RESOLVE_REPLACE_CONFIRM('save-close')
  }
}

const chooseDestructive = () => {
  if (mode.value === 'chooser') {
    void projectStore.RESOLVE_FOLDER_CHOICE('replace')
  } else {
    void projectStore.RESOLVE_REPLACE_CONFIRM('dont-save')
  }
}

const chooseCancel = () => {
  if (mode.value === 'chooser') {
    void projectStore.RESOLVE_FOLDER_CHOICE('cancel')
  } else {
    void projectStore.RESOLVE_REPLACE_CONFIRM('cancel')
  }
}

const onBackdrop = (event) => {
  if (event.target === event.currentTarget) chooseCancel()
}

const onKeydown = (event) => {
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    chooseCancel()
    return
  }
  if (event.key === 'Tab' && boxRef.value) {
    // Keep focus inside the dialog while it is open.
    event.preventDefault()
    const focusables = Array.from(
      boxRef.value.querySelectorAll('button')
    )
    if (!focusables.length) return
    const index = focusables.indexOf(document.activeElement)
    const next = event.shiftKey
      ? focusables[(index - 1 + focusables.length) % focusables.length]
      : focusables[(index + 1) % focusables.length]
    next.focus()
  }
}
</script>

<style scoped>
.workspace-mode-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--maskColor, rgba(0, 0, 0, 0.5));
}

.workspace-mode-dialog {
  min-width: 340px;
  max-width: 440px;
  padding: 16px 18px;
  border-radius: 8px;
  background: var(--floatBgColor, #fff);
  color: var(--editorColor, #303133);
  box-shadow: var(--floatShadow, 0 4px 24px rgba(0, 0, 0, 0.2));
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.workspace-mode-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.workspace-mode-title {
  font-size: 14px;
  font-weight: 600;
}

.workspace-mode-x {
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 12px;
  color: var(--editorColor50, #888);
  padding: 2px 4px;
}

.workspace-mode-message {
  font-size: 13px;
  line-height: 1.5;
  color: var(--editorColor, #303133);
}

.workspace-mode-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.workspace-mode-btn {
  padding: 5px 14px;
  font-size: 13px;
  border-radius: 5px;
  border: 1px solid var(--editorColor10, #dcdfe6);
  background: transparent;
  color: var(--editorColor, #303133);
  cursor: pointer;
}

.workspace-mode-btn:focus-visible {
  outline: 2px solid var(--themeColor, #409eff);
  outline-offset: 1px;
}

.workspace-mode-default {
  background: var(--themeColor, #409eff);
  border-color: var(--themeColor, #409eff);
  color: #fff;
}

.workspace-mode-destructive {
  color: var(--deleteColor, #d03050);
  border-color: currentColor;
  margin-right: auto;
}
</style>
