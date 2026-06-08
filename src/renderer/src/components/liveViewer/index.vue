<!--
  LiveViewer — Muya renderer for live-streamed documents.

  Receives mt::live::update events from the Rust backend (via
  live_bridge.rs) and renders the document in real time using a
  dedicated Muya instance. During a live session the container is
  read-only (contenteditable=false, keyboard/paste blocked). When
  the session ends (doc_close) editing is re-enabled and the undo
  stack is cleared so the user starts with a clean history.

  Phase B5b: initial implementation. Uses setMarkdown() for full
  content replacement on each patch.

  S2 spike decision: setMarkdown() confirmed for v1. Incremental
  contentState deferred to v2 if documents exceed 100 KB.
  See: tokmo/docs/research/s2-muya-spike.md
-->
<template>
  <div class="live-viewer" :class="{ 'live-active': isLive }">
    <div v-if="isLive" class="live-indicator">
      <span class="live-dot"></span>
      <span class="live-label">LIVE</span>
      <span v-if="sessionInfo" class="live-session-info">&mdash; {{ sessionInfo }}</span>
    </div>
    <div
      ref="editorContainer"
      class="live-editor-container"
      :style="{
        lineHeight: lineHeight,
        fontSize: `${fontSize}px`,
        'font-family': editorFontFamily
          ? `${editorFontFamily}, ${defaultFontFamily}`
          : `${defaultFontFamily}`
      }"
    ></div>
    <div v-if="!isLive" class="live-idle">
      {{ t('liveViewer.idle', 'No active live session') }}
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { listen } from '@tauri-apps/api/event'
import Muya from 'muya/lib'
import { DEFAULT_EDITOR_FONT_FAMILY } from '@/config'
import { usePreferencesStore } from '@/store/preferences'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'

import 'muya/themes/default.css'

const { t } = useI18n()

// START_BLOCK_STATE

const isLive = ref(false)
const sessionInfo = ref('')
const editorContainer = ref(null)
const defaultFontFamily = DEFAULT_EDITOR_FONT_FAMILY

const preferencesStore = usePreferencesStore()
const {
  lineHeight,
  fontSize,
  editorFontFamily
} = storeToRefs(preferencesStore)

let muya = null
let unlisten = null

// END_BLOCK_STATE

// START_BLOCK_MUYA_INIT

/**
 * Initialize a minimal Muya instance. No UI plugins (QuickInsert,
 * FormatPicker, etc.) are registered — the live viewer is
 * display-only during live sessions. The container starts as
 * contenteditable=false; it is toggled to true on doc_close so the
 * user can edit the final document.
 */
const initMuya = () => {
  if (!editorContainer.value || muya) return

  const options = {
    markdown: '',
    fontSize: fontSize.value,
    lineHeight: lineHeight.value,
    focusMode: false,
    hideQuickInsertHint: true,
    hideLinkPopup: true,
    trimUnnecessaryCodeBlockEmptyLines: true,
    t
  }

  muya = new Muya(editorContainer.value, options)

  // Default to read-only; toggled on doc_open / doc_close.
  if (muya.container) {
    muya.container.setAttribute('contenteditable', 'false')
  }

  // eslint-disable-next-line no-console
  console.log('[LiveViewer][BLOCK_MUYA_INIT_OK]')
}

// END_BLOCK_MUYA_INIT

// START_BLOCK_READONLY

/**
 * Block keyboard and paste input during a live session. Attached to
 * the Muya container element so events are caught before Muya's own
 * handlers can process them.
 */
const blockInputHandler = (e) => {
  e.preventDefault()
  e.stopPropagation()
}

/**
 * Enter read-only mode: set contenteditable=false and block
 * keyboard/paste events on the Muya container.
 */
const enterReadOnly = () => {
  if (!muya?.container) return
  muya.container.setAttribute('contenteditable', 'false')
  muya.container.addEventListener('keydown', blockInputHandler, true)
  muya.container.addEventListener('keypress', blockInputHandler, true)
  muya.container.addEventListener('paste', blockInputHandler, true)

  // eslint-disable-next-line no-console
  console.log('[LiveViewer][BLOCK_READONLY_ENTER]')
}

/**
 * Exit read-only mode: restore contenteditable=true and remove the
 * keyboard/paste blockers so the user can edit the final document.
 */
const exitReadOnly = () => {
  if (!muya?.container) return
  muya.container.setAttribute('contenteditable', 'true')
  muya.container.removeEventListener('keydown', blockInputHandler, true)
  muya.container.removeEventListener('keypress', blockInputHandler, true)
  muya.container.removeEventListener('paste', blockInputHandler, true)

  // eslint-disable-next-line no-console
  console.log('[LiveViewer][BLOCK_READONLY_EXIT]')
}

/**
 * Clear Muya's undo/redo history. Called on doc_close so the user
 * gets a clean undo stack after a live session (Option A — v1).
 */
const clearUndoHistory = () => {
  if (!muya) return
  try {
    muya.clearHistory()
    // eslint-disable-next-line no-console
    console.log('[LiveViewer][BLOCK_UNDO_CLEARED]')
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[LiveViewer][BLOCK_UNDO_CLEAR_FAILED]', err)
  }
}

// END_BLOCK_READONLY

// START_BLOCK_EVENT_HANDLER

/**
 * Handle mt::live::update events from the Rust backend.
 *
 * Event payload shape (from live_bridge.rs LiveUpdate):
 *   { update_type: string, payload: object }
 *
 * update_type values:
 *   "doc_open"  — { session_id, title, content }
 *   "doc_patch" — { full_content, section, revision }
 *   "doc_close" — { session_id, final_revision }
 */
const handleLiveUpdate = (event) => {
  const data = event?.payload
  if (!data || typeof data !== 'object') return

  const { update_type: type, payload } = data
  if (!type || !payload) return

  if (type === 'doc_open') {
    isLive.value = true
    sessionInfo.value = payload.title || 'Meeting'

    // Lock the editor for the duration of the live session.
    enterReadOnly()

    if (muya) {
      muya.setMarkdown(payload.content || '')
    }

    // eslint-disable-next-line no-console
    console.log(
      `[LiveViewer][BLOCK_DOC_OPEN session_id=${payload.session_id || '?'}]`
    )
  } else if (type === 'doc_patch') {
    if (muya && isLive.value) {
      // Full content replacement — S2 spike confirmed setMarkdown() for v1.
      // See: tokmo/docs/research/s2-muya-spike.md
      muya.setMarkdown(payload.full_content || '')
    }

    // eslint-disable-next-line no-console
    console.log(
      `[LiveViewer][BLOCK_DOC_PATCH rev=${payload.revision || '?'} section=${payload.section || '?'}]`
    )
  } else if (type === 'doc_close') {
    isLive.value = false

    // Unlock the editor so the user can edit the final document.
    exitReadOnly()

    // Clear undo/redo history accumulated during the live session
    // (Option A — v1: full clear). The user starts with a clean
    // undo stack after each live session.
    clearUndoHistory()

    // eslint-disable-next-line no-console
    console.log(
      `[LiveViewer][BLOCK_DOC_CLOSE session_id=${payload.session_id || '?'} final_rev=${payload.final_revision || '?'}]`
    )
  }
}

// END_BLOCK_EVENT_HANDLER

// START_BLOCK_LIFECYCLE

onMounted(async () => {
  await nextTick()
  initMuya()

  // Register Tauri event listener for live updates from the backend.
  unlisten = await listen('mt::live::update', handleLiveUpdate)

  // eslint-disable-next-line no-console
  console.log('[LiveViewer][BLOCK_LISTENER_REGISTERED]')
})

onBeforeUnmount(() => {
  if (unlisten) {
    unlisten()
    unlisten = null
  }

  // Remove keyboard blockers before destroying Muya to avoid
  // dangling event listeners on the container element.
  if (isLive.value && muya?.container) {
    exitReadOnly()
  }

  if (muya) {
    muya.destroy()
    muya = null
  }

  // eslint-disable-next-line no-console
  console.log('[LiveViewer][BLOCK_DESTROYED]')
})

// END_BLOCK_LIFECYCLE
</script>

<style scoped>
/* START_BLOCK_STYLES */

.live-viewer {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  position: relative;
}

.live-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 16px;
  background: var(--sideBarBg, #f5f5f5);
  border-bottom: 1px solid var(--tableBorderColor, #ddd);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.5px;
  user-select: none;
  flex-shrink: 0;
}

.live-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #e53935;
  animation: live-pulse 1.5s ease-in-out infinite;
}

@keyframes live-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.live-label {
  color: #e53935;
  font-weight: 700;
}

.live-session-info {
  color: var(--editorColor, #333);
  font-weight: 400;
}

.live-editor-container {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

/* Read-only: hide the cursor and disable interactions. */
.live-editor-container :deep([contenteditable="false"]) {
  caret-color: transparent;
  cursor: default;
}

.live-idle {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--editorColor50, #999);
  font-size: 14px;
  font-style: italic;
  user-select: none;
}

/* Dark theme support: inherit from Mark's CSS custom properties. */
:root.dark .live-indicator {
  border-bottom-color: var(--tableBorderColor, #444);
}

/* END_BLOCK_STYLES */
</style>
