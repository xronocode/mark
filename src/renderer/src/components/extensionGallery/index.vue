<!--
  ExtensionGallery -- "Apps / Extensions" screen.

  Displays discovered extensions with enable/disable toggles and
  install CTAs for not-yet-installed extensions. Uses Tauri IPC
  (mt::ext::list, mt::ext::enable, mt::ext::disable, mt::ext::discover)
  to communicate with the M-045 extension host backend.

  Phase B3: initial implementation.
-->
<template>
  <div class="extension-gallery">
    <div class="gallery-header">
      <h2 class="gallery-title">{{ t('extensions.title', 'Extensions') }}</h2>
      <button class="gallery-refresh-btn" :disabled="loading" @click="refresh">
        {{ loading ? t('extensions.refreshing', 'Refreshing...') : t('extensions.refresh', 'Refresh') }}
      </button>
    </div>

    <div v-if="loading && extensions.length === 0" class="gallery-loading">
      {{ t('extensions.loading', 'Discovering extensions...') }}
    </div>

    <div v-else-if="extensions.length === 0" class="gallery-empty">
      {{ t('extensions.empty', 'No extensions found. Install an extension to get started.') }}
    </div>

    <div v-else class="gallery-list">
      <div
        v-for="ext in extensions"
        :key="ext.id"
        class="ext-card"
        :class="{ 'ext-disabled': !ext.enabled, 'ext-unhealthy': !ext.healthy }"
      >
        <div class="ext-card-header">
          <div class="ext-name-row">
            <span class="ext-name">{{ ext.name }}</span>
            <span class="ext-version">v{{ ext.version }}</span>
          </div>
          <div class="ext-toggle">
            <label class="toggle-switch" :title="ext.enabled ? t('extensions.disable', 'Disable') : t('extensions.enable', 'Enable')">
              <input
                type="checkbox"
                :checked="ext.enabled"
                :disabled="toggling[ext.id]"
                @change="toggleExtension(ext)"
              />
              <span class="toggle-slider"></span>
            </label>
          </div>
        </div>

        <div class="ext-id">{{ ext.id }}</div>

        <div v-if="ext.description" class="ext-description">
          {{ ext.description }}
        </div>

        <div v-if="ext.capabilities.length > 0" class="ext-capabilities">
          <span
            v-for="cap in ext.capabilities"
            :key="cap"
            class="ext-cap-tag"
          >{{ cap }}</span>
        </div>

        <div class="ext-footer">
          <div class="ext-status">
            <span v-if="!ext.healthy" class="ext-status-badge ext-status-offline">
              {{ t('extensions.offline', 'Offline') }}
            </span>
            <span v-else-if="ext.enabled" class="ext-status-badge ext-status-active">
              {{ t('extensions.active', 'Active') }}
            </span>
            <span v-else class="ext-status-badge ext-status-inactive">
              {{ t('extensions.inactive', 'Disabled') }}
            </span>
          </div>
          <a
            v-if="ext.install_url && !ext.healthy"
            :href="ext.install_url"
            target="_blank"
            class="ext-install-btn"
          >
            {{ t('extensions.getExtension', 'Get') }} {{ ext.name }}
          </a>
        </div>
      </div>
    </div>

    <div v-if="error" class="gallery-error">
      {{ error }}
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

// START_BLOCK_STATE

const extensions = ref([])
const loading = ref(false)
const error = ref('')
const toggling = ref({})

// END_BLOCK_STATE

// START_BLOCK_IPC

/**
 * Fetch the list of registered extensions from the backend.
 * Calls mt_ext_list (normalized from mt::ext::list).
 */
const fetchExtensions = async () => {
  try {
    const list = await invoke('mt_ext_list')
    extensions.value = list
    error.value = ''
    // eslint-disable-next-line no-console
    console.log(`[ExtGallery][BLOCK_LIST_OK count=${list.length}]`)
  } catch (err) {
    error.value = String(err)
    // eslint-disable-next-line no-console
    console.error('[ExtGallery][BLOCK_LIST_FAILED]', err)
  }
}

/**
 * Trigger extension discovery (scan known dirs, health-probe, register).
 * Then refresh the list.
 */
const refresh = async () => {
  loading.value = true
  error.value = ''
  try {
    await invoke('mt_ext_discover')
    // eslint-disable-next-line no-console
    console.log('[ExtGallery][BLOCK_DISCOVER_OK]')
  } catch (err) {
    error.value = String(err)
    // eslint-disable-next-line no-console
    console.error('[ExtGallery][BLOCK_DISCOVER_FAILED]', err)
  }
  await fetchExtensions()
  loading.value = false
}

/**
 * Toggle an extension between enabled and disabled.
 */
const toggleExtension = async (ext) => {
  const action = ext.enabled ? 'mt_ext_disable' : 'mt_ext_enable'
  toggling.value[ext.id] = true
  try {
    await invoke(action, { id: ext.id })
    // eslint-disable-next-line no-console
    console.log(`[ExtGallery][BLOCK_TOGGLE_OK id=${ext.id} action=${action}]`)
  } catch (err) {
    error.value = String(err)
    // eslint-disable-next-line no-console
    console.error(`[ExtGallery][BLOCK_TOGGLE_FAILED id=${ext.id}]`, err)
  }
  await fetchExtensions()
  toggling.value[ext.id] = false
}

// END_BLOCK_IPC

// START_BLOCK_LIFECYCLE

onMounted(async () => {
  loading.value = true
  await fetchExtensions()
  loading.value = false
  // eslint-disable-next-line no-console
  console.log('[ExtGallery][BLOCK_MOUNTED]')
})

// END_BLOCK_LIFECYCLE
</script>

<style scoped>
/* START_BLOCK_STYLES */

.extension-gallery {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow-y: auto;
  padding: 24px;
  color: var(--editorColor, #333);
}

.gallery-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
  flex-shrink: 0;
}

.gallery-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--editorColor, #333);
  margin: 0;
}

.gallery-refresh-btn {
  padding: 6px 14px;
  font-size: 12px;
  border: 1px solid var(--tableBorderColor, #ddd);
  border-radius: 4px;
  background: var(--sideBarBg, #f5f5f5);
  color: var(--editorColor, #333);
  cursor: pointer;
  transition: background 0.15s;
}

.gallery-refresh-btn:hover:not(:disabled) {
  background: var(--sideBarItemHoverBg, #e8e8e8);
}

.gallery-refresh-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.gallery-loading,
.gallery-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  color: var(--editorColor50, #999);
  font-size: 14px;
  font-style: italic;
  user-select: none;
}

.gallery-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ext-card {
  padding: 16px;
  border: 1px solid var(--tableBorderColor, #ddd);
  border-radius: 8px;
  background: var(--sideBarBg, #fafafa);
  transition: border-color 0.15s, box-shadow 0.15s;
}

.ext-card:hover {
  border-color: var(--themeColor, #409eff);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
}

.ext-card.ext-disabled {
  opacity: 0.7;
}

.ext-card.ext-unhealthy {
  border-left: 3px solid #e53935;
}

.ext-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.ext-name-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.ext-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--editorColor, #333);
}

.ext-version {
  font-size: 12px;
  color: var(--editorColor50, #999);
}

.ext-id {
  font-size: 11px;
  color: var(--editorColor50, #999);
  margin-bottom: 8px;
  font-family: monospace;
}

.ext-description {
  font-size: 13px;
  color: var(--editorColor, #555);
  margin-bottom: 8px;
  line-height: 1.4;
}

.ext-capabilities {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 8px;
}

.ext-cap-tag {
  display: inline-block;
  padding: 2px 8px;
  font-size: 11px;
  border-radius: 10px;
  background: var(--sideBarItemHoverBg, #e8e8e8);
  color: var(--editorColor, #333);
  font-family: monospace;
}

.ext-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.ext-status {
  display: flex;
  align-items: center;
  gap: 6px;
}

.ext-install-btn {
  display: inline-block;
  padding: 4px 12px;
  font-size: 12px;
  font-weight: 600;
  color: white;
  background: var(--themeColor, #409eff);
  border-radius: 4px;
  text-decoration: none;
  transition: opacity 0.15s;
}

.ext-install-btn:hover {
  opacity: 0.85;
}

.ext-status-badge {
  display: inline-block;
  padding: 2px 10px;
  font-size: 11px;
  font-weight: 600;
  border-radius: 10px;
  letter-spacing: 0.3px;
}

.ext-status-active {
  background: #e8f5e9;
  color: #2e7d32;
}

.ext-status-inactive {
  background: #f5f5f5;
  color: #757575;
}

.ext-status-offline {
  background: #ffebee;
  color: #c62828;
}

/* Toggle switch */
.toggle-switch {
  position: relative;
  display: inline-block;
  width: 36px;
  height: 20px;
  cursor: pointer;
}

.toggle-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.toggle-slider {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--tableBorderColor, #ccc);
  border-radius: 20px;
  transition: background 0.2s;
}

.toggle-slider::before {
  content: '';
  position: absolute;
  width: 16px;
  height: 16px;
  left: 2px;
  bottom: 2px;
  background: white;
  border-radius: 50%;
  transition: transform 0.2s;
}

.toggle-switch input:checked + .toggle-slider {
  background: var(--themeColor, #409eff);
}

.toggle-switch input:checked + .toggle-slider::before {
  transform: translateX(16px);
}

.toggle-switch input:disabled + .toggle-slider {
  opacity: 0.5;
  cursor: not-allowed;
}

.gallery-error {
  margin-top: 12px;
  padding: 10px 14px;
  background: #ffebee;
  color: #c62828;
  border-radius: 4px;
  font-size: 12px;
}

/* Dark theme support */
:root.dark .ext-status-active {
  background: #1b5e20;
  color: #a5d6a7;
}

:root.dark .ext-status-inactive {
  background: #424242;
  color: #bdbdbd;
}

:root.dark .ext-status-offline {
  background: #b71c1c;
  color: #ef9a9a;
}

:root.dark .gallery-error {
  background: #b71c1c;
  color: #ef9a9a;
}

/* END_BLOCK_STYLES */
</style>
