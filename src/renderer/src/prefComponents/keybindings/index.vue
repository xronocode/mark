<template>
  <div class="pref-keybindings">
    <!-- START_BLOCK_KEYBINDINGS_SEARCH -->
    <!-- C-38 T-004: the sheet's own search field — filters the table by
         the localized description or the accelerator. -->
    <input
      v-model="filterText"
      type="search"
      class="pref-keybindings-search"
      :placeholder="t('preferences.keybindings.searchPlaceholder')"
      :aria-label="t('preferences.keybindings.searchPlaceholder')"
    >
    <!-- END_BLOCK_KEYBINDINGS_SEARCH -->

    <section class="keybindings">
      <div class="text">
        {{ t('preferences.keybindings.description') }}
        <a class="link" @click="openKeybindingWiki">{{ t('preferences.keybindings.online') }}</a>.
      </div>
      <el-table :data="filteredKeybindings" style="width: 100%">
        <el-table-column prop="description" :label="t('preferences.keybindings.table.description')"> </el-table-column>
        <el-table-column prop="accelerator" :label="t('preferences.keybindings.table.keyCombination')" width="220"> </el-table-column>
        <el-table-column :label="t('preferences.keybindings.table.options')" width="90">
          <template #default="scope">
            <el-button
              type="text"
              size="small"
              :title="t('preferences.keybindings.table.edit')"
              @click="handleEditClick(scope.$index, scope.row)"
            >
              <Edit width="14" height="14" />
            </el-button>
            <el-button
              type="text"
              size="small"
              :title="t('preferences.keybindings.table.reset')"
              @click="handleResetClick(scope.$index, scope.row)"
            >
              <RefreshRight width="14" height="14" />
            </el-button>
            <el-button
              type="text"
              size="small"
              :title="t('preferences.keybindings.table.unbind')"
              @click="handleUnbindClick(scope.$index, scope.row)"
            >
              <Delete width="14" height="14" />
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </section>
    <section class="footer">
      <button type="button" class="pref-keybindings-btn" @click="saveKeybindings">
        {{ t('preferences.keybindings.save') }}
      </button>
      <button type="button" class="pref-keybindings-btn" @click="restoreDefaults">
        {{ t('preferences.keybindings.restoreDefaults') }}
      </button>
    </section>
    <section v-if="showDebugTools" class="keyboard-debug">
      <div><strong>{{ t('preferences.keybindings.debugOptions') }}:</strong></div>
      <button type="button" class="pref-keybindings-btn" @click="dumpKeyboardInformation">
        {{ t('preferences.keybindings.dumpKeyboardInfo') }}
      </button>
    </section>
    <key-input-dialog
      :show-with-id="selectedShortcutId"
      :on-commit="onKeybinding"
    ></key-input-dialog>
  </div>
</template>

<script setup>
// FILE: src/renderer/src/prefComponents/keybindings/index.vue
// VERSION: 2.0.0
// START_MODULE_CONTRACT
//   PURPOSE: The keyboard-shortcuts editor (C-38 T-004) — the same KeybindingConfigurator table/logic the old page owned, now rendered as the body of the Advanced › Customise sheet with its own search field and the Settings palette.
//   SCOPE: Search filtering (description + accelerator), the el-table with edit/reset/unbind, save/restore-defaults footer, debug dump; key capture stays in key-input-dialog.
//   DEPENDS: KeybindingConfigurator, key-input-dialog, @hfelix/electron-localshortcut atom-keymap (keyboard layout), services/notification, element-plus table, vue-i18n.
//   LINKS: .grace/changes/archive/C-38 T-004 (decision 4: shortcuts open as a sheet from Advanced); prefComponents/tabs/advanced/sheets/shortcutsSheet.vue; .grace/graph/runtime.xml M-011; .grace/verification/runtime.xml V-M-011.
//   ROLE: RUNTIME
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   filterText / filteredKeybindings - the sheet search: case-insensitive substring over description and accelerator.
//   rebuildKeybindingList - rebuild after a locale switch (descriptions re-translate).
//   saveKeybindings / restoreDefaults - configurator save/resetAll with failure notifications.
//   handleEditClick / handleResetClick / handleUnbindClick / onKeybinding / handleDuplicateShortcut - row actions and duplicate-shortcut warning (unchanged from v1).
//   dumpKeyboardInformation - debug-only keyboard info dump.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-10-15 v2.0.0: C-38 T-004 — page becomes the shortcuts-sheet body: h4 page title removed (the sheet carries the title), search field added, buttons/table restyled to the Settings palette; every configurator action and its vm API stay unchanged.
//   - (v1.x: standalone /preference/keybindings page — retired with the 9-route rail.)
// END_CHANGE_SUMMARY

import log from 'electron-log'
// step-8l: deep import to bypass @hfelix/electron-localshortcut/src/index.js,
// which transitively loads electron-localshortcut.js (uses BrowserWindow,
// only valid in main process). The atom-keymap subtree is pure JS and
// has no Electron coupling.
import { setKeyboardLayout } from '@hfelix/electron-localshortcut/src/atom-keymap'
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import KeyInputDialog from './key-input-dialog.vue'
import KeybindingConfigurator from './KeybindingConfigurator'
import notice from '@/services/notification'
import { Edit, RefreshRight, Delete } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'

const { t, locale } = useI18n()

const showDebugTools = ref(false)
const keybindingConfigurator = ref(null)
const selectedShortcutId = ref(null)
const keybindingList = ref([])
const filterText = ref('')

// 重新构建快捷键列表的函数
const rebuildKeybindingList = () => {
  if (keybindingConfigurator.value) {
    keybindingList.value = keybindingConfigurator.value.rebuildKeybindingList()
  }
}

// START_BLOCK_FILTER_KEYBINDINGS
// The sheet search: case-insensitive substring over the localized
// description and the accelerator; an empty query shows everything.
const filteredKeybindings = computed(() => {
  const q = filterText.value.trim().toLowerCase()
  if (!q) return keybindingList.value
  return keybindingList.value.filter(
    (entry) =>
      String(entry.description || '').toLowerCase().indexOf(q) >= 0 ||
      String(entry.accelerator || '').toLowerCase().indexOf(q) >= 0
  )
})
// END_BLOCK_FILTER_KEYBINDINGS

// 监听语言变化，重新构建快捷键列表
watch(locale, () => {
  rebuildKeybindingList()
})

onMounted(() => {
  window.electron.ipcRenderer
    .invoke('mt::keybinding-get-keyboard-info')
    .then(({ layout, keymap }) => {
      // Update the key mapper to prevent problems on non-US keyboards.
      setKeyboardLayout(layout, keymap)
    })
    .catch((error) => log.error('Error while loading keyboard information for settings:', error))

  window.electron.ipcRenderer
    .invoke('mt::keybinding-get-pref-keybindings')
    .then(({ defaultKeybindings, userKeybindings }) => {
      keybindingConfigurator.value = new KeybindingConfigurator(defaultKeybindings, userKeybindings)
      keybindingList.value = keybindingConfigurator.value.getKeybindings()
    })
    .catch((error) => log.error('Error while loading keyboard information for settings:', error))

  // Show keyboard debugging tools which has been moved from CLI because we
  // need an active window on Windows.
  showDebugTools.value = window.marktext.env.debug
})

onUnmounted(() => {
  keybindingList.value = []
  keybindingConfigurator.value = null
})

const openKeybindingWiki = () => {
  window.electron.shell.openExternal(
    'https://github.com/xronocode/mark/blob/electron/docs/KEYBINDINGS.md'
  )
}

const saveKeybindings = () => {
  if (keybindingConfigurator.value && keybindingList.value.length > 0) {
    keybindingConfigurator.value
      .save()
      .then((success) => {
        if (!success) {
          notice.notify({
            title: t('preferences.keybindings.failedToSave'),
            type: 'error',
            message: t('preferences.keybindings.saveError')
          })
        }
      })
      .catch((error) => log.error(error))
  }
}

const restoreDefaults = () => {
  keybindingConfigurator.value
    .resetAll()
    .then((success) => {
      if (!success) {
        notice.notify({
          title: t('preferences.keybindings.failedToSave'),
          type: 'error',
          message: t('preferences.keybindings.saveError')
        })
      }
    })
    .catch((error) => log.error(error))
}

const handleEditClick = (index, entry) => {
  if (index >= 0 && entry) {
    selectedShortcutId.value = entry.id
  }
}

const handleResetClick = (index, entry) => {
  const { id } = entry
  const success = keybindingConfigurator.value.resetToDefault(id)
  if (!success) {
    handleDuplicateShortcut(id, keybindingConfigurator.value.getDefaultAccelerator(id))
  }
}

const handleUnbindClick = (index, entry) => {
  keybindingConfigurator.value.unbind(entry.id)
}

const onKeybinding = (value) => {
  const selectedId = selectedShortcutId.value
  if (value && selectedId) {
    const success = keybindingConfigurator.value.change(selectedId, value)
    if (!success) {
      handleDuplicateShortcut(selectedId, value)
    }
  }
  selectedShortcutId.value = null
}

const handleDuplicateShortcut = (id, accelerator) => {
  notice.notify({
    title: t('preferences.keybindings.shortcutInUse'),
    type: 'warning',
    message: t('preferences.keybindings.shortcutInUseMessage', { accelerator })
  })
}

const dumpKeyboardInformation = () => {
  window.electron.ipcRenderer.send('mt::keybinding-debug-dump-keyboard-info')
}
</script>

<style scoped>
.pref-keybindings .keybindings {
  font-size: 13px;
  color: var(--prefText, #1d1d1f);
}
.pref-keybindings .keybindings > div.text {
  margin-bottom: 10px;
  color: var(--prefSub, #6b6b70);
}
.pref-keybindings .link {
  color: var(--prefAccent, #007aff);
  cursor: pointer;
}
.pref-keybindings .footer {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
}
.pref-keybindings .keyboard-debug {
  margin-top: 10px;
  font-size: 12px;
  color: var(--prefSub, #6b6b70);
}
</style>
<style>
/* START_BLOCK_KEYBINDINGS_SHEET_METRICS */
/* C-38 T-004: the search field and action buttons adopt the Settings
   field/button metrics; the Element Plus table is recoloured onto the
   pref palette (group-card surface, hairline separators). */
.pref-keybindings .pref-keybindings-search {
  font: inherit;
  font-size: 13px;
  box-sizing: border-box;
  width: 100%;
  padding: 4px 8px;
  margin-bottom: 10px;
  border-radius: 6px;
  border: 0.5px solid var(--prefCtrlBorder, rgba(0, 0, 0, 0.14));
  background: var(--prefCtrl, #ffffff);
  color: var(--prefText, #1d1d1f);
  outline: none;
}

.pref-keybindings .pref-keybindings-search:focus {
  border-color: var(--prefAccent, #007aff);
}

.pref-keybindings .pref-keybindings-btn {
  all: unset;
  cursor: default;
  font-size: 13px;
  box-sizing: border-box;
  padding: 3px 12px;
  border-radius: 6px;
  border: 0.5px solid var(--prefCtrlBorder, rgba(0, 0, 0, 0.14));
  background: var(--prefCtrl, #ffffff);
  color: var(--prefText, #1d1d1f);
  box-shadow: 0 0.5px 1px rgba(0, 0, 0, 0.08);
  margin-top: 10px;
}

.pref-keybindings .pref-keybindings-btn + .pref-keybindings-btn {
  margin-left: 8px;
}

.pref-keybindings .el-table,
.pref-keybindings .el-table__expanded-cell {
  background: transparent;
  --el-table-border-color: var(--prefLine, rgba(0, 0, 0, 0.08));
  --el-table-tr-bg-color: transparent;
  --el-table-header-bg-color: transparent;
  --el-table-header-text-color: var(--prefSub, #6b6b70);
  --el-table-text-color: var(--prefText, #1d1d1f);
  --el-table-row-hover-bg-color: var(--prefTabOn, rgba(0, 0, 0, 0.07));
  --el-fill-color-light: var(--prefTabOn, rgba(0, 0, 0, 0.07));
  font-size: 13px;
}

.pref-keybindings .el-table table {
  margin: 0;
  border: none;
}

.pref-keybindings .el-table th,
.pref-keybindings .el-table tr {
  background: transparent;
}

.pref-keybindings .el-table th.el-table__cell.is-leaf,
.pref-keybindings .el-table th,
.pref-keybindings .el-table td {
  border: none;
}

.pref-keybindings .el-table button {
  padding: 2px 2px;
  margin: 4px 0px;
  color: var(--prefAccent, #007aff);
  background: none;
  border: none;
}

.pref-keybindings .el-table button:not(:last-child) {
  margin-right: 4px;
}

.pref-keybindings .el-table button:hover,
.pref-keybindings .el-table button:active {
  opacity: 0.9;
  background: none;
  border: none;
}

.pref-keybindings .el-table .el-table__cell {
  padding: 2px 0;
  margin: 0;
}

.pref-keybindings .el-table .el-table__empty-block {
  background: transparent;
}
/* END_BLOCK_KEYBINDINGS_SHEET_METRICS */
</style>
