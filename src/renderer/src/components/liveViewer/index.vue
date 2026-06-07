<!--
  LiveViewer — read-only Muya renderer for live-streamed documents.

  Receives mt::live::update events from the Rust backend (via
  live_bridge.rs) and renders the document in real time using a
  dedicated Muya instance in read-only mode (contenteditable=false).

  Phase B5b: initial implementation. Uses setMarkdown() for full
  content replacement on each patch. TODO: incremental contentState
  updates (S2 spike result).
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
 * Initialize a minimal, read-only Muya instance. No UI plugins
 * (QuickInsert, FormatPicker, etc.) are registered — the live viewer
 * is display-only. The container is set to contenteditable=false
 * after Muya init to prevent user edits.
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

  // Make read-only: disable contenteditable on the Muya container.
  if (muya.container) {
    muya.container.setAttribute('contenteditable', 'false')
  }

  // eslint-disable-next-line no-console
  console.log('[LiveViewer][BLOCK_MUYA_INIT_OK]')
}

// END_BLOCK_MUYA_INIT

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

    if (muya) {
      muya.setMarkdown(payload.content || '')
    }

    // eslint-disable-next-line no-console
    console.log(
      `[LiveViewer][BLOCK_DOC_OPEN session_id=${payload.session_id || '?'}]`
    )
  } else if (type === 'doc_patch') {
    if (muya && isLive.value) {
      // Full content replacement. TODO(S2): incremental contentState
      // updates for better performance with large documents.
      muya.setMarkdown(payload.full_content || '')
    }

    // eslint-disable-next-line no-console
    console.log(
      `[LiveViewer][BLOCK_DOC_PATCH rev=${payload.revision || '?'} section=${payload.section || '?'}]`
    )
  } else if (type === 'doc_close') {
    isLive.value = false

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
