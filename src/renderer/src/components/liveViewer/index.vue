<!--
  LiveViewer — headless bridge for live-streamed documents.

  Receives mt::live::update events from the Rust backend (via
  live_bridge.rs) and opens a new untitled tab in the main editor.
  Patches update the tab content via setMarkdown(). No separate Muya
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
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { listen } from '@tauri-apps/api/event'
import bus from '@/bus'

const isLive = ref(false)
const sessionTitle = ref('')
let unlisten = null

const handleLiveUpdate = (event) => {
  const data = event?.payload
  if (!data || typeof data !== 'object') return

  const { update_type: type, payload } = data
  if (!type || !payload) return

  if (type === 'doc_open') {
    isLive.value = true
    sessionTitle.value = payload.title || 'Meeting'

    bus.emit('mt::new-untitled-tab', {
      markdown: payload.content || '',
      selected: true
    })

    // eslint-disable-next-line no-console
    console.log(`[LiveViewer][DOC_OPEN session=${payload.session_id}]`)
  } else if (type === 'doc_patch') {
    if (isLive.value) {
      bus.emit('file-loaded', { markdown: payload.full_content || '' })
    }

    // eslint-disable-next-line no-console
    console.log(`[LiveViewer][DOC_PATCH rev=${payload.revision} section=${payload.section}]`)
  } else if (type === 'doc_close') {
    isLive.value = false

    // eslint-disable-next-line no-console
    console.log(`[LiveViewer][DOC_CLOSE session=${payload.session_id} rev=${payload.final_revision}]`)
  }
}

onMounted(async () => {
  unlisten = await listen('mt::live::update', handleLiveUpdate)
  // eslint-disable-next-line no-console
  console.log('[LiveViewer][LISTENER_REGISTERED]')
})

onBeforeUnmount(() => {
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
  background: var(--sideBarBg, #f5f5f5);
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
