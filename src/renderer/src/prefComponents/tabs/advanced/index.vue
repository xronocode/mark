<template>
  <div class="pref-tab-page pref-tab-page--advanced">
    <!-- START_BLOCK_ADVANCED_IMAGES -->
    <compound>
      <template #head>
        <h6 class="title">{{ t('preferences.advanced.images.title') }}</h6>
      </template>
      <template #children>
        <cur-select
          :description="t('preferences.advanced.images.insertAction')"
          :value="imageInsertAction"
          :options="getImageActions()"
          :on-change="(value) => onSelectChange('imageInsertAction', value)"
        ></cur-select>
        <section class="pref-row pref-image-folder-item">
          <div class="pref-row-text">
            <span class="pref-row-label">{{ t('preferences.advanced.images.folder') }}</span>
            <span class="pref-row-help">{{ t('preferences.advanced.images.folderHelp') }}</span>
          </div>
          <div class="pref-row-control pref-image-folder-control">
            <input
              :value="imageFolderPath"
              type="text"
              class="pref-image-folder-field"
              :placeholder="t('preferences.advanced.images.folderPlaceholder')"
              :aria-label="t('preferences.advanced.images.folder')"
              @change="onImageFolderPathInput"
            >
            <button type="button" class="pref-image-folder-btn" @click="chooseImageFolder">
              {{ t('preferences.advanced.images.chooseFolder') }}
            </button>
            <button type="button" class="pref-image-folder-btn" @click="openImageFolder">
              {{ t('preferences.advanced.images.openFolder') }}
            </button>
          </div>
        </section>
        <bool
          :description="t('preferences.advanced.images.saveNextToDocument')"
          :help="t('preferences.advanced.images.saveNextToDocumentHelp')"
          :bool="imagePreferRelativeDirectory"
          :on-change="(value) => onSelectChange('imagePreferRelativeDirectory', value)"
        ></bool>
        <text-box
          :description="t('preferences.advanced.images.folderName')"
          :help="t('preferences.advanced.images.folderNameHelp')"
          :input="imageRelativeDirectoryName"
          :default-value="'assets'"
          :regex-validator="/^(?:$|(?![a-zA-Z]:)[^\/\\].*$)/"
          :on-change="(value) => onSelectChange('imageRelativeDirectoryName', value)"
        ></text-box>
      </template>
    </compound>
    <!-- END_BLOCK_ADVANCED_IMAGES -->

    <!-- START_BLOCK_ADVANCED_CUSTOMISE -->
    <compound>
      <template #head>
        <h6 class="title">{{ t('preferences.advanced.customise.title') }}</h6>
      </template>
      <template #children>
        <button-row
          :description="t('preferences.advanced.customise.keyboardShortcuts')"
          :value="t('preferences.advanced.customise.edit')"
          :on-click="openShortcutsSheet"
        ></button-row>
        <button-row
          :description="t('preferences.advanced.customise.extensions')"
          :value="t('preferences.advanced.customise.browse')"
          :on-click="openExtensionsSheet"
        ></button-row>
        <button-row
          :description="t('preferences.advanced.customise.customCss')"
          :help="t('preferences.advanced.customise.customCssHelp')"
          :value="t('preferences.advanced.customise.edit')"
          :on-click="openCustomCssSheet"
        ></button-row>
      </template>
    </compound>
    <!-- END_BLOCK_ADVANCED_CUSTOMISE -->

    <!-- START_BLOCK_ADVANCED_RESET -->
    <compound>
      <template #head>
        <h6 class="title">{{ t('preferences.advanced.reset.title') }}</h6>
      </template>
      <template #children>
        <button-row
          :description="t('preferences.advanced.reset.restore')"
          :help="t('preferences.advanced.reset.restoreHelp')"
          :value="t('preferences.advanced.reset.restoreButton')"
          danger
          :on-click="confirmReset"
        ></button-row>
      </template>
    </compound>
    <!-- END_BLOCK_ADVANCED_RESET -->

    <!-- START_BLOCK_ADVANCED_SHEETS -->
    <shortcuts-sheet :open="shortcutsOpen" @close="shortcutsOpen = false"></shortcuts-sheet>
    <extensions-sheet :open="extensionsOpen" @close="extensionsOpen = false"></extensions-sheet>
    <custom-css-sheet :open="customCssOpen" @close="customCssOpen = false"></custom-css-sheet>
    <!-- END_BLOCK_ADVANCED_SHEETS -->

    <!-- START_BLOCK_RESET_CONFIRM_DIALOG -->
    <!-- Custom in-app confirmation (IA §3.5: "needs a new confirmation
         dialog" — never window.confirm). -->
    <div v-if="resetConfirmOpen" class="pref-reset-overlay" role="alertdialog" aria-modal="true" :aria-label="t('preferences.advanced.reset.confirmTitle')">
      <div class="pref-reset-dialog">
        <div class="pref-reset-title">{{ t('preferences.advanced.reset.confirmTitle') }}</div>
        <p class="pref-reset-message">{{ t('preferences.advanced.reset.confirmMessage') }}</p>
        <div class="pref-reset-actions">
          <button type="button" class="pref-reset-btn" @click="cancelReset">
            {{ t('preferences.advanced.reset.cancel') }}
          </button>
          <button type="button" class="pref-reset-btn is-danger" @click="performReset">
            {{ t('preferences.advanced.reset.confirm') }}
          </button>
        </div>
      </div>
    </div>
    <!-- END_BLOCK_RESET_CONFIRM_DIALOG -->
  </div>
</template>

<script setup>
// FILE: src/renderer/src/prefComponents/tabs/advanced/index.vue
// VERSION: 2.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Advanced tab of the C-38 Settings window — Images and uploads (insert action, folder chooser, relative-folder rows, no upload (image upload stays retired)), Customise (shortcuts/extensions/custom-CSS sheets) and the destructive Reset with an in-app confirmation, per the N2 IA §3.5 and C-38 decisions 3–4.
//   SCOPE: Row composition; image folder path field + Choose/Open; the three sheets; reset confirmation driving store RESET_PREFERENCES_TO_DEFAULTS.
//   DEPENDS: prefComponents/common/{compound,bool,select,textBox,buttonRow}, tabs/advanced/config, tabs/advanced/sheets/*, store/preferences, vue-i18n.
//   LINKS: .grace/changes/active/C-38 T-004; docs/design/settings-ia-2026-10-15.md §3.5; .grace/graph/runtime.xml M-011; .grace/verification/runtime.xml V-M-011.
//   ROLE: RUNTIME
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   onSelectChange - SET_SINGLE_PREFERENCE bridge for the preference rows.
//   onImageFolderPathInput / chooseImageFolder / openImageFolder - the image folder path: typed paths persist directly, Choose opens the directory dialog (SET_IMAGE_FOLDER_PATH), Open reveals the folder in the system file manager.
//   shortcutsOpen / extensionsOpen / customCssOpen - the three sheet visibility refs (Advanced › Customise).
//   confirmReset / cancelReset / performReset - the custom confirmation dialog; confirm runs RESET_PREFERENCES_TO_DEFAULTS (preferences only — documents and user data untouched) and closes.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-10-15 v2.0.0: C-38 T-004 — real Advanced tab: the old Image page's folder logic moves into the new anatomy (image upload stays retired in every edition — no uploader UI), the Keybindings page and the Extensions gallery open as sheets from Customise (decision 4), Custom CSS edits in a sheet, and Reset asks through an in-app dialog.
//   - (v1.x: C-38 T-003 interim wrapper stacking the old Image/Keybindings/Extensions pages — retired.)
// END_CHANGE_SUMMARY

import { ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { usePreferencesStore } from '@/store/preferences'
import Compound from '@/prefComponents/common/compound/index.vue'
import Bool from '@/prefComponents/common/bool/index.vue'
import CurSelect from '@/prefComponents/common/select/index.vue'
import TextBox from '@/prefComponents/common/textBox/index.vue'
import ButtonRow from '@/prefComponents/common/buttonRow/index.vue'
import ShortcutsSheet from './sheets/shortcutsSheet.vue'
import ExtensionsSheet from './sheets/extensionsSheet.vue'
import CustomCssSheet from './sheets/customCssSheet.vue'
import { getImageActions } from './config'

const { t } = useI18n()
const preferenceStore = usePreferencesStore()

const {
  imageInsertAction,
  imageFolderPath,
  imagePreferRelativeDirectory,
  imageRelativeDirectoryName
} = storeToRefs(preferenceStore)

const onSelectChange = (type, value) => {
  preferenceStore.SET_SINGLE_PREFERENCE({ type, value })
}

// START_BLOCK_IMAGE_FOLDER
// IA §3.5 "Image folder": a path field plus Choose/Open buttons. Typed
// paths must look absolute (same regex the retired folderSetting used);
// Choose reuses the store dialog action; Open reveals in the Finder.
const onImageFolderPathInput = (event) => {
  const value = event.target.value
  if (/^(?:$|([a-zA-Z]:)?[\/\\].*$)/.test(value)) {
    onSelectChange('imageFolderPath', value)
  }
}

const chooseImageFolder = () => {
  preferenceStore.SET_IMAGE_FOLDER_PATH(undefined)
}

const openImageFolder = () => {
  if (imageFolderPath.value) {
    window.electron.shell.openPath(imageFolderPath.value)
  }
}
// END_BLOCK_IMAGE_FOLDER

const shortcutsOpen = ref(false)
const extensionsOpen = ref(false)
const customCssOpen = ref(false)

const openShortcutsSheet = () => {
  shortcutsOpen.value = true
}
const openExtensionsSheet = () => {
  extensionsOpen.value = true
}
const openCustomCssSheet = () => {
  customCssOpen.value = true
}

// START_BLOCK_RESET_FLOW
// «Restore all defaults…» asks first (custom dialog); Cancel keeps every
// value, Confirm runs the store reset (preferences only) and closes.
const resetConfirmOpen = ref(false)

const confirmReset = () => {
  resetConfirmOpen.value = true
}

const cancelReset = () => {
  resetConfirmOpen.value = false
}

const performReset = async () => {
  try {
    await preferenceStore.RESET_PREFERENCES_TO_DEFAULTS()
  } catch (e) {
    console.error('[preferences][advanced][BLOCK_RESET_FAILED]', e)
  }
  resetConfirmOpen.value = false
}
// END_BLOCK_RESET_FLOW
</script>

<style>
/* START_BLOCK_IMAGE_FOLDER_METRICS */
/* The folder row's control cluster: path field + two compact buttons
   (field metrics shared with the textBox row; buttons shrink so RU
   labels still fit at 640px). */
.pref-tab-page--advanced .pref-image-folder-control {
  flex-wrap: wrap;
  justify-content: flex-end;
}

.pref-tab-page--advanced .pref-image-folder-field {
  font: inherit;
  font-size: 13px;
  width: 150px;
  box-sizing: border-box;
  padding: 3px 8px;
  border-radius: 5px;
  border: 0.5px solid var(--prefCtrlBorder, rgba(0, 0, 0, 0.14));
  background: var(--prefCtrl, #ffffff);
  color: var(--prefText, #1d1d1f);
  text-align: right;
  outline: none;
}

.pref-tab-page--advanced .pref-image-folder-field:focus {
  border-color: var(--prefAccent, #007aff);
}

.pref-tab-page--advanced .pref-image-folder-field::placeholder {
  color: var(--prefSub, #6b6b70);
}

.pref-tab-page--advanced .pref-image-folder-btn {
  all: unset;
  cursor: default;
  font-size: 12px;
  box-sizing: border-box;
  padding: 3px 10px;
  border-radius: 6px;
  border: 0.5px solid var(--prefCtrlBorder, rgba(0, 0, 0, 0.14));
  background: var(--prefCtrl, #ffffff);
  color: var(--prefText, #1d1d1f);
  box-shadow: 0 0.5px 1px rgba(0, 0, 0, 0.08);
  white-space: nowrap;
}
/* END_BLOCK_IMAGE_FOLDER_METRICS */

/* START_BLOCK_RESET_DIALOG_METRICS */
/* Small centred alert dialog on the sheet overlay surface; Confirm is
   the destructive red fill. */
.pref-reset-overlay {
  position: fixed;
  inset: 0;
  z-index: 70;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  box-sizing: border-box;
  background: rgba(0, 0, 0, 0.25);
}

.pref-reset-overlay .pref-reset-dialog {
  width: 340px;
  max-width: 100%;
  box-sizing: border-box;
  padding: 16px;
  border-radius: 10px;
  border: 0.5px solid var(--prefCtrlBorder, rgba(0, 0, 0, 0.14));
  background: var(--prefGroup, #ffffff);
  color: var(--prefText, #1d1d1f);
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.35);
  font-family: inherit;
}

.pref-reset-overlay .pref-reset-title {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 6px;
}

.pref-reset-overlay .pref-reset-message {
  margin: 0 0 14px;
  font-size: 13px;
  line-height: 1.4;
  color: var(--prefSub, #6b6b70);
}

.pref-reset-overlay .pref-reset-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.pref-reset-overlay .pref-reset-btn {
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
}

.pref-reset-overlay .pref-reset-btn.is-danger {
  background: #c4271b;
  border-color: transparent;
  color: #fff;
}
/* END_BLOCK_RESET_DIALOG_METRICS */
</style>
