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

    <div v-if="scanFailures" class="gallery-notice">
      {{ t('extensions.scanFailed', 'Some extension manifests could not be read or parsed during discovery; they were skipped.') }}
    </div>

    <div v-if="error" class="gallery-error">
      {{ error }}
    </div>
  </div>
</template>

<script setup>
// START_MODULE_CONTRACT
//   PURPOSE: Display discovered extensions and route discovery and enable/disable actions to the extension host.
//   SCOPE: Gallery state, extension IPC actions and presentation using the renderer theme tokens.
//   DEPENDS: Vue refs/lifecycle, Vue i18n, Tauri core invoke, extension host commands.
//   LINKS: M-011; M-045; V-M-011.
//   ROLE: RUNTIME
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   t - Translate gallery labels and failure messages.
//   extensions - Most recently fetched extension list.
//   loading - Discovery and refresh progress.
//   error - Current visible failure message.
//   errorSource - Which surface wrote the current notice (guard audit f-006).
//   scanFailures - Scan-failure notice state from the discover payload.
//   fetchGeneration - Monotonic list-fetch generation guarding the display.
//   toggling - Per-extension enable/disable progress.
//   landList - The single landing path for every fetched list (fe f-007).
//   fetchExtensions - Read the registered extension list.
//   refresh - Discover extensions and refresh the list.
//   toggleExtension - Apply an enable/disable action and refresh visible state.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   LAST_CHANGE: 2026-11-26 fe f-007 - A refresh cycle stops fetching the
//   list twice: mt_ext_discover already returns the registered list in its
//   Ok payload, so the payload lands through the new shared landList path
//   (display, revoke-pending proof and the list-owned error rule once for
//   mount, refresh and the fallbacks) under the same monotonic generation
//   guard, and the redundant second mt_ext_list IPC is gone; a payload
//   without a usable list and a failed discovery keep the explicit
//   mt_ext_list fetch.
//   2026-11-23 C-EXT-GALLERY-STATE T-005 - The gallery
//   display stops trusting arrival order: every list fetch carries a
//   monotonic fetchGeneration and lands only when still newest (a late
//   stale snapshot mutates nothing — no list, no error clearing, no
//   revoke-pending cleanup), and refresh reads the discover Ok payload's
//   failed_manifests tolerantly (an absent field means no notice) into a
//   distinct localized scan-failure notice (extensions.scanFailed, all
//   ten locales) that survives the awaited list fetch and is replaced
//   only by the next discovery's outcome.
//   2026-11-23 - Keep the disable retry honest: a per-id
//   revoke-pending set forces the toggle to keep sending Disable after
//   ext_disable_revoke_failed (cleared on a successful disable or an
//   enabled listing), and the ext_enable_revoke_pending refusal maps to
//   the ten-locale extensions.revokePending instruction (C-EXT-TRUST-COHERENCE).
//   2026-11-21 - Map the ext_enable_reapproval_required enable refusal to a re-approval instruction on the existing gallery-error surface (C-SEC-EXT-GRANT-BOUND).
// END_CHANGE_SUMMARY
import { ref, onMounted } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

// START_BLOCK_STATE

const extensions = ref([])
const loading = ref(false)
const error = ref('')
const toggling = ref({})
// C-EXT-TRUST-COHERENCE: extension ids whose last disable could not
// verify its revocation (ext_disable_revoke_failed). Their toggle keeps
// sending Disable until the revocation is proven by a successful
// disable or an enabled listing. Not rendered — plain logic state.
const revokePendingIds = new Set()
// C-EXT-GALLERY-STATE: monotonic fetch generation — every list fetch
// captures its generation at start and lands only when that generation
// is still the newest, so a late stale snapshot flips nothing.
let fetchGeneration = 0
// Guard audit f-006: which surface wrote the current error notice. A
// successful list fetch may clear only a notice the list surface owns —
// a discovery-failure notice ('discover') survives the awaited list
// fetch and is replaced by the next discovery's outcome, the same rule
// the scanFailures notice already follows.
let errorSource = ''
// C-EXT-GALLERY-STATE: the distinct scan-failure notice state, set by the
// discover Ok payload and replaced only by the next discovery's outcome.
const scanFailures = ref(false)

// END_BLOCK_STATE

// START_BLOCK_IPC

/**
 * The single landing path for every fetched list (fe f-007): display,
 * revoke-pending proof and the list-owned error rule live here once.
 * C-EXT-TRUST-COHERENCE: an enabled listing proves the extension is
 * not revoke-pending anymore. Guard audit f-006: never wipe a
 * discovery-failure notice here.
 */
const landList = (list) => {
  extensions.value = list
  for (const ext of list) {
    if (ext.enabled) revokePendingIds.delete(ext.id)
  }
  if (errorSource !== 'discover') {
    error.value = ''
    errorSource = ''
  }
}

/**
 * Fetch the list of registered extensions from the backend.
 * Calls mt_ext_list (normalized from mt::ext::list).
 * C-EXT-GALLERY-STATE: the fetch is generation-guarded — a resolved list
 * lands only when its generation is still the newest; a discarded fetch
 * mutates nothing (list, error surface and revoke-pending set all
 * untouched).
 */
const fetchExtensions = async () => {
  const generation = ++fetchGeneration
  try {
    const list = await invoke('mt_ext_list')
    if (generation !== fetchGeneration) {
      // eslint-disable-next-line no-console
      console.log(`[ExtGallery][BLOCK_LIST_STALE generation=${generation} newest=${fetchGeneration}]`)
      return
    }
    landList(list)
    // eslint-disable-next-line no-console
    console.log(`[ExtGallery][BLOCK_LIST_OK count=${list.length}]`)
  } catch (err) {
    if (generation !== fetchGeneration) {
      // eslint-disable-next-line no-console
      console.log(`[ExtGallery][BLOCK_LIST_STALE generation=${generation} newest=${fetchGeneration}]`)
      return
    }
    error.value = String(err)
    errorSource = 'list'
    // eslint-disable-next-line no-console
    console.error('[ExtGallery][BLOCK_LIST_FAILED]', err)
  }
}

/**
 * Trigger extension discovery (scan known dirs, health-probe, register).
 * Then refresh the list. C-EXT-GALLERY-STATE: the discover Ok payload
 * feeds the distinct scan-failure notice through a tolerant reader — an
 * absent or undefined failed_manifests field means no notice; the notice
 * is replaced only by the next discovery's outcome. fe f-007: the same
 * payload already carries the registered list, so a refresh cycle issues
 * ONE IPC list call — the payload lands through the shared guarded path
 * and no second mt_ext_list is issued for the same data. The tolerant
 * fallback (a payload without a usable list) and the discover-failure
 * path keep the explicit mt_ext_list fetch.
 */
const refresh = async () => {
  loading.value = true
  error.value = ''
  errorSource = ''
  const generation = ++fetchGeneration
  try {
    const report = await invoke('mt_ext_discover')
    scanFailures.value = Array.isArray(report?.failed_manifests) && report.failed_manifests.length > 0
    // eslint-disable-next-line no-console
    console.log(`[ExtGallery][BLOCK_DISCOVER_OK scanFailures=${scanFailures.value}]`)
    if (Array.isArray(report?.extensions)) {
      if (generation !== fetchGeneration) {
        // eslint-disable-next-line no-console
        console.log(`[ExtGallery][BLOCK_LIST_STALE generation=${generation} newest=${fetchGeneration}]`)
      } else {
        landList(report.extensions)
        // eslint-disable-next-line no-console
        console.log(`[ExtGallery][BLOCK_LIST_OK count=${report.extensions.length}]`)
      }
    } else {
      // Tolerant fallback: a payload without a usable list (an undefined
      // report or a missing extensions field) keeps the explicit
      // mt_ext_list fetch.
      await fetchExtensions()
    }
  } catch (err) {
    error.value = String(err)
    errorSource = 'discover'
    // eslint-disable-next-line no-console
    console.error('[ExtGallery][BLOCK_DISCOVER_FAILED]', err)
    await fetchExtensions()
  }
  loading.value = false
}

/**
 * Toggle an extension between enabled and disabled.
 * C-EXT-TRUST-COHERENCE: the toggle action follows the operation
 * outcome, not only the refetched flag — an id in revokePendingIds keeps
 * sending Disable until the revocation is proven (a successful disable)
 * or the refetched list shows the extension enabled again.
 */
const toggleExtension = async (ext) => {
  const action = revokePendingIds.has(ext.id) || ext.enabled ? 'mt_ext_disable' : 'mt_ext_enable'
  let toggleFailure = ''
  toggling.value[ext.id] = true
  try {
    await invoke(action, { id: ext.id })
    if (action === 'mt_ext_disable') revokePendingIds.delete(ext.id)
    // eslint-disable-next-line no-console
    console.log(`[ExtGallery][BLOCK_TOGGLE_OK id=${ext.id} action=${action}]`)
  } catch (err) {
    const message = String(err)
    if (action === 'mt_ext_enable' && message === 'ext_enable_reapproval_required') {
      // C-SEC-EXT-GRANT-BOUND: enabling would confer incoming access the
      // stored pairing grant does not cover — a fresh pairing is the
      // re-approval path. The gallery stays a toggle plus error surface;
      // no native dialog lives here.
      toggleFailure = t('extensions.reapprovalRequired', 'This extension now requests more access than its pairing approved. Disable it, then pair again to approve the new access.')
    } else if (action === 'mt_ext_disable' && message === 'ext_disable_revoke_failed') {
      // C-EXT-TRUST-COHERENCE: the revocation could not be verified —
      // the retry stays Disable until proof.
      revokePendingIds.add(ext.id)
      toggleFailure = t('extensions.disableFailed', 'The extension is disabled, but access revocation could not be verified. Try again.')
    } else if (action === 'mt_ext_enable' && message === 'ext_enable_revoke_pending') {
      // C-EXT-TRUST-COHERENCE: enabling is locked while a revoke-pending
      // marker stands — the retry-disable is the revocation retry, and a
      // fresh pairing follows once it succeeds.
      toggleFailure = t('extensions.revokePending', 'Disable the extension again to retry revoking its access; pair it afresh once the revocation succeeds.')
    } else {
      toggleFailure = message
    }
    // eslint-disable-next-line no-console
    console.error(`[ExtGallery][BLOCK_TOGGLE_FAILED id=${ext.id}]`, err)
  }
  await fetchExtensions()
  if (toggleFailure) {
    error.value = toggleFailure
    errorSource = 'toggle'
  }
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
  background: var(--sideBarBgColor, #f5f5f5);
  color: var(--editorColor, #333);
  cursor: pointer;
  transition: background 0.15s;
}

.gallery-refresh-btn:hover:not(:disabled) {
  background: var(--sideBarItemHoverBgColor, #e8e8e8);
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
  background: var(--sideBarBgColor, #fafafa);
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
  background: var(--sideBarItemHoverBgColor, #e8e8e8);
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

.gallery-notice {
  margin-top: 12px;
  padding: 10px 14px;
  background: #fff8e1;
  color: #8d6e00;
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

:root.dark .gallery-notice {
  background: #4e4000;
  color: #ffe082;
}

/* END_BLOCK_STYLES */
</style>
