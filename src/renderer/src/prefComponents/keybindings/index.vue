<template>
  <div class="pref-keybindings">
    <h4>Key Bindings</h4>
    <section class="keybindings">
      <div class="text">
        Customize MarkText shortcuts and click on the save button below to apply all changes
        (requires a restart). All available and default key binding can be found
        <a class="link" @click="openKeybindingWiki">online</a>.
      </div>
      <el-table :data="keybindingList" style="width: 100%">
        <el-table-column prop="description" label="Description"> </el-table-column>
        <el-table-column prop="accelerator" label="Key Combination" width="220"> </el-table-column>
        <el-table-column fixed="right" label="Options" width="90">
          <template #default="scope">
            <el-button
              type="text"
              size="small"
              title="Edit"
              @click="handleEditClick(scope.$index, scope.row)"
            >
              <Edit width="14" height="14" />
            </el-button>
            <el-button
              type="text"
              size="small"
              title="Reset"
              @click="handleResetClick(scope.$index, scope.row)"
            >
              <RefreshRight width="14" height="14" />
            </el-button>
            <el-button
              type="text"
              size="small"
              title="Unbind"
              @click="handleUnbindClick(scope.$index, scope.row)"
            >
              <Delete width="14" height="14" />
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </section>
    <section class="footer">
      <separator></separator>
      <el-button size="medium" @click="saveKeybindings">Save</el-button>
      <el-button size="medium" @click="restoreDefaults">Restore default key bindings</el-button>
    </section>
    <section v-if="showDebugTools" class="keyboard-debug">
      <separator></separator>
      <div><strong>Debug options:</strong></div>
      <el-button size="medium" @click="dumpKeyboardInformation"
        >Dump keyboard information</el-button
      >
    </section>
    <key-input-dialog
      :show-with-id="selectedShortcutId"
      :on-commit="onKeybinding"
    ></key-input-dialog>
  </div>
</template>

<script setup>
import log from 'electron-log'
import { setKeyboardLayout } from '@hfelix/electron-localshortcut'
import { ref, onMounted, onUnmounted } from 'vue'
import Separator from '../common/separator'
import KeyInputDialog from './key-input-dialog.vue'
import KeybindingConfigurator from './KeybindingConfigurator'
import notice from '@/services/notification'
import { Edit, RefreshRight, Delete } from '@element-plus/icons-vue'

const showDebugTools = ref(false)
const keybindingConfigurator = ref(null)
const selectedShortcutId = ref(null)
const keybindingList = ref([])

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
  showDebugTools.value = global.marktext.env.debug
})

onUnmounted(() => {
  keybindingList.value = []
  keybindingConfigurator.value = null
})

const openKeybindingWiki = () => {
  window.electron.shell.openExternal(
    'https://github.com/marktext/marktext/blob/master/docs/KEYBINDINGS.md'
  )
}

const saveKeybindings = () => {
  if (keybindingConfigurator.value && keybindingList.value.length > 0) {
    keybindingConfigurator.value
      .save()
      .then((success) => {
        if (!success) {
          notice.notify({
            title: 'Failed to save',
            type: 'error',
            message: 'An unexpected error occurred while saving.'
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
          title: 'Failed to save',
          type: 'error',
          message: 'An unexpected error occurred while saving.'
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
    title: 'Shortcut already in use',
    type: 'warning',
    message: `The shortcut "${accelerator}" is already in use. Please unset the shortcut and try again.`
  })
}

const dumpKeyboardInformation = () => {
  window.electron.ipcRenderer.send('mt::keybinding-debug-dump-keyboard-info')
}
</script>

<style scoped>
.pref-keybindings {
  & .keyboard-debug,
  & .keybindings {
    font-size: 14px;
    margin: 20px 0;
    color: var(--editorColor);
    & .link {
      cursor: pointer;
    }
  }
  & .keybindings > div.text {
    margin-bottom: 10px;
  }
  & .link {
    color: var(--themeColor);
    cursor: pointer;
  }
  & button.el-button {
    font-size: 13px;
  }
}
.el-table,
.el-table__expanded-cell {
  background: var(--editorBgColor);
}
.el-table button {
  padding: 2px 2px;
  margin: 4px 0px;
  color: var(--themeColor);
  background: none;
  border: none;
}
.el-table button:not(:last-child) {
  margin-right: 4px;
}
.el-table button:hover,
.el-table button:active {
  opacity: 0.9;
  background: none;
}
</style>
<style>
.pref-keybindings .el-table table {
  margin: 0;
  border: none;
}
.pref-keybindings .el-table th,
.pref-keybindings .el-table tr {
  background: var(--editorBgColor) !important;
}
.pref-keybindings .el-table th.el-table__cell.is-leaf,
.pref-keybindings .el-table th,
.pref-keybindings .el-table td {
  border: none !important;
}
.pref-keybindings .el-table th.el-table__cell.is-leaf:last-child,
.pref-keybindings .el-table th:last-child,
.pref-keybindings .el-table td:last-child {
  border-right: 1px solid var(--tableBorderColor) !important;
}
.pref-keybindings .el-table--border::after,
.pref-keybindings .el-table--group::after,
.pref-keybindings .el-table::before,
.pref-keybindings .el-table__fixed-right::before,
.pref-keybindings .el-table__fixed::before {
  background: var(--tableBorderColor) !important;
}
.pref-keybindings .el-table__body tr.hover-row.current-row > td,
.pref-keybindings .el-table__body tr.hover-row.el-table__row--striped.current-row > td,
.pref-keybindings .el-table__body tr.hover-row.el-table__row--striped > td,
.pref-keybindings .el-table__body tr.hover-row > td {
  background: var(--selectionColor) !important;
}
.pref-keybindings .el-table .el-table__cell {
  padding: 2px 0;
  margin: 0;
}
</style>
