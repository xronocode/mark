<template>
  <div class="welcome-screen">
    <div class="welcome-content">
      <h1 class="welcome-title">{{ t('recent.welcome') }}</h1>

      <div class="welcome-actions">
        <button class="action-button" @click="newFile">
          <span class="action-icon">+</span>
          {{ t('recent.newFile') }}
        </button>
        <button class="action-button" @click="openFile">
          <span class="action-icon icon-file"></span>
          {{ t('recent.openFile') }}
        </button>
        <button class="action-button" @click="openFolder">
          <span class="action-icon icon-folder"></span>
          {{ t('recent.openFolder') }}
        </button>
      </div>

      <div v-if="sessionPaths.length" class="welcome-section">
        <button class="restore-button" @click="restoreSession">
          {{ t('recent.restoreSession') }}
          <span class="restore-count">({{ sessionPaths.length }})</span>
        </button>
      </div>

      <div class="welcome-section">
        <h2 class="section-title">{{ t('recent.recentFiles') }}</h2>
        <ul v-if="recentFiles.length" class="recent-list">
          <li
            v-for="filePath in recentFiles"
            :key="filePath"
            class="recent-item"
            @click="openRecent(filePath)"
          >
            <span class="recent-filename">{{ basename(filePath) }}</span>
            <span class="recent-dir">{{ dirname(filePath) }}</span>
          </li>
        </ul>
        <p v-else class="no-recent">{{ t('recent.noRecentFiles') }}</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useEditorStore } from '@/store/editor'
import { useProjectStore } from '@/store/project'
import { t } from '../../i18n'

const editorStore = useEditorStore()
const projectStore = useProjectStore()

const recentFiles = ref([])
const sessionPaths = ref([])
let _homeDir = ''

onMounted(async () => {
  try {
    const { homeDir } = await import('@tauri-apps/api/path')
    _homeDir = (await homeDir()).replace(/\/+$/, '')
  } catch { /* dev/test fallback */ }
  const [recent, session] = await Promise.all([
    editorStore.GET_RECENT_FILES(),
    editorStore.GET_SESSION_PATHS()
  ])
  recentFiles.value = (recent || []).slice(0, 5)
  sessionPaths.value = session || []
})

const basename = (p) => {
  if (!p) return ''
  const parts = p.split('/')
  return parts[parts.length - 1] || p
}

const dirname = (p) => {
  if (!p) return ''
  const idx = p.lastIndexOf('/')
  if (idx <= 0) return '/'
  const dir = p.substring(0, idx)
  if (_homeDir && dir.startsWith(_homeDir)) return '~' + dir.substring(_homeDir.length)
  return dir
}

const newFile = () => editorStore.NEW_UNTITLED_TAB({})

const openFile = () => {
  window.electron.ipcRenderer.send('mt::cmd-open-file')
}

const openFolder = () => {
  projectStore.ASK_FOR_OPEN_PROJECT()
}

const openRecent = (filePath) => {
  window.electron.ipcRenderer.send('mt::open-file', filePath, {})
}

const restoreSession = () => {
  editorStore.RESTORE_SESSION()
}
</script>

<style scoped>
.welcome-screen {
  background: var(--editorBgColor);
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow-y: auto;
  user-select: none;
  zoom: var(--content-zoom, 1);
}

.welcome-content {
  max-width: 480px;
  width: 100%;
  padding: 40px 32px;
}

.welcome-title {
  font-size: 26px;
  font-weight: 300;
  color: var(--editorColor);
  margin: 0 0 32px;
  text-align: center;
}

.welcome-actions {
  display: flex;
  gap: 12px;
  margin-bottom: 28px;
  justify-content: center;
}

.action-button {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border: 1px solid var(--floatBorderColor, #444);
  border-radius: 4px;
  background: transparent;
  color: var(--editorColor);
  font-size: 13px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}
.action-button:hover {
  background: var(--sideBarItemHoverBgColor, rgba(255, 255, 255, 0.06));
  border-color: var(--themeColor, #409eff);
}

.action-icon {
  font-size: 15px;
  opacity: 0.7;
}

.welcome-section {
  margin-bottom: 24px;
}

.section-title {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--editorColor50, rgba(255, 255, 255, 0.5));
  margin: 0 0 10px;
}

.restore-button {
  width: 100%;
  padding: 10px 16px;
  border: 1px dashed var(--floatBorderColor, #444);
  border-radius: 4px;
  background: transparent;
  color: var(--themeColor, #409eff);
  font-size: 14px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
  text-align: center;
}
.restore-button:hover {
  background: var(--sideBarItemHoverBgColor, rgba(255, 255, 255, 0.06));
  border-color: var(--themeColor, #409eff);
}

.restore-count {
  opacity: 0.6;
  font-size: 12px;
}

.recent-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.recent-item {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.12s;
}
.recent-item:hover {
  background: var(--sideBarItemHoverBgColor, rgba(255, 255, 255, 0.06));
}

.recent-filename {
  font-size: 14px;
  color: var(--themeColor, #409eff);
  white-space: nowrap;
}

.recent-dir {
  font-size: 12px;
  color: var(--editorColor50, rgba(255, 255, 255, 0.5));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.no-recent {
  font-size: 13px;
  color: var(--editorColor50, rgba(255, 255, 255, 0.5));
  margin: 0;
  padding: 6px 10px;
}
</style>
