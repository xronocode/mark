<!--
  LiveViewer — headless bridge for live-streamed documents.

  Receives mt::live::update events from the Rust backend (via
  live_bridge.rs) and opens a new untitled tab in the main editor.
  C-SEC-STREAM-TABS: patches update their owned tab through the store. No separate Muya
  instance — reuses the main editor for full visual consistency.

  Phase B5b: tab-based approach (replaces overlay).
-->
<template>
  <div v-if="isLive" class="live-indicator">
    <span class="live-dot"></span>
    <span class="live-label">LIVE</span>
    <span v-if="sessionTitle" class="live-session-info">&mdash; {{ sessionTitle }}</span>
  </div>
</template>

<script setup>
// START_MODULE_CONTRACT
//   PURPOSE: Route backend live-document events through session/tab-owned store actions.
//   SCOPE: Live indicator, typed event translation and listener lifecycle; no anonymous editor loads.
//   DEPENDS: Tauri events, Vue lifecycle/refs, editor store.
//   LINKS: M-045; M-011; C-SEC-STREAM-TABS.
//   ROLE: RUNTIME
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   editorStore - Window-local owner of live session/tab bindings.
//   isLive - Whether this listener has an accepted active stream.
//   sessionTitle - Escaped title displayed in the indicator.
//   unlisten - Registered event listener disposal callback.
//   disposed - Fence for asynchronous listener registration after unmount.
//   handleLiveUpdate - Translate identified lifecycle events into owned store operations.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   LAST_CHANGE: 2026-11-13 - Resolve the live indicator background through the existing renderer theme token name.
//   LAST_CHANGE: 2026-11-11 C-SEC-STREAM-TABS: replace anonymous file-loaded patches with session-owned store actions.
// END_CHANGE_SUMMARY
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { listen } from '@tauri-apps/api/event'
import { useEditorStore } from '@/store/editor'

const editorStore = useEditorStore()
const isLive = ref(false)
const sessionTitle = ref('')
let unlisten = null
let disposed = false

const handleLiveUpdate = (event) => {
  const data = event?.payload
  if (!data || typeof data !== 'object') return

  const { update_type: type, payload } = data
  if (!type || !payload) return

  const identity = { sessionId: payload.session_id, sessionEpoch: payload.session_epoch }
  if (type === 'doc_open') {
    const id = editorStore.OPEN_LIVE_DOCUMENT({ ...identity, markdown: payload.content || '', title: payload.title })
    if (id) {
      isLive.value = true
      sessionTitle.value = payload.title || 'Meeting'
    }
  } else if (type === 'doc_patch') {
    if (isLive.value) editorStore.PATCH_LIVE_DOCUMENT({ ...identity, revision: payload.revision, markdown: payload.full_content || '' })
  } else if (type === 'doc_close') {
    if (editorStore.CLOSE_LIVE_DOCUMENT(identity)) isLive.value = false
  }
}

onMounted(async () => {
  const stop = await listen('mt::live::update', handleLiveUpdate)
  if (disposed) stop()
  else unlisten = stop
  // eslint-disable-next-line no-console
  console.log('[LiveViewer][LISTENER_REGISTERED]')
})

onBeforeUnmount(() => {
  disposed = true
  if (unlisten) {
    unlisten()
    unlisten = null
  }
})
</script>

<style scoped>
.live-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 16px;
  background: var(--sideBarBgColor, #f5f5f5);
  border-bottom: 1px solid var(--tableBorderColor, #ddd);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.5px;
  user-select: none;
  flex-shrink: 0;
  z-index: 10;
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

:root.dark .live-indicator {
  border-bottom-color: var(--tableBorderColor, #444);
}
</style>
