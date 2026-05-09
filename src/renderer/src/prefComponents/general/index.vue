<template>
  <div class="pref-general">
    <h4>{{ t('preferences.general.title') }}</h4>

    <!--
      M-021 default-handler — macOS Integration cluster.
      User explicit ask: a prominent way to make Mark the default
      app for .md files. Lives at the TOP of General settings.
    -->
    <section class="macos-integration">
      <div class="macos-integration-head">
        <h6 class="title">macOS Integration</h6>
      </div>
      <div class="macos-integration-body">
        <p class="status">
          <template v-if="isDefault">
            Mark is the default app for <code>.md</code> files.
          </template>
          <template v-else-if="currentHandler">
            Default app for <code>.md</code> files: <strong>{{ currentHandler }}</strong>
          </template>
          <template v-else>
            No default app is set for <code>.md</code> files.
          </template>
        </p>
        <div class="actions">
          <el-button
            v-if="!isDefault"
            type="primary"
            size="default"
            @click="setAsDefault"
          >
            Set Mark as default for .md files
          </el-button>
          <el-button
            v-else
            size="default"
            @click="unsetDefault"
          >
            Remove as default
          </el-button>
        </div>
      </div>
    </section>

    <compound>
      <template #head>
        <h6 class="title">{{ t('preferences.general.autoSave.title') }}</h6>
      </template>
      <template #children>
        <bool
          :description="t('preferences.general.autoSave.description')"
          :bool="autoSave"
          :on-change="(value) => onSelectChange('autoSave', value)"
        ></bool>
        <range
          :description="t('preferences.general.autoSave.delayDescription')"
          :value="autoSaveDelay"
          :min="1000"
          :max="10000"
          unit="ms"
          :step="100"
          :on-change="(value) => onSelectChange('autoSaveDelay', value)"
        ></range>
      </template>
    </compound>

    <compound>
      <template #head>
        <h6 class="title">{{ t('preferences.general.window.title') }}</h6>
      </template>
      <template #children>
        <cur-select
          v-if="!isOsx"
          :description="t('preferences.general.window.titleBarStyle.title')"
          :notes="t('preferences.general.window.requiresRestart')"
          :value="titleBarStyle"
          :options="getTitleBarStyleOptions()"
          :on-change="(value) => onSelectChange('titleBarStyle', value)"
        ></cur-select>
        <bool
          :description="t('preferences.general.window.hideScrollbars')"
          :bool="hideScrollbar"
          :on-change="(value) => onSelectChange('hideScrollbar', value)"
        ></bool>
        <bool
          :description="t('preferences.general.window.openFilesInNewWindow')"
          :bool="openFilesInNewWindow"
          :on-change="(value) => onSelectChange('openFilesInNewWindow', value)"
        ></bool>
        <bool
          :description="t('preferences.general.window.openFoldersInNewWindow')"
          :bool="openFolderInNewWindow"
          :on-change="(value) => onSelectChange('openFolderInNewWindow', value)"
        ></bool>
        <cur-select
          :description="t('preferences.general.window.zoom')"
          :value="zoom"
          :options="zoomOptions"
          :on-change="(value) => onSelectChange('zoom', value)"
        ></cur-select>
      </template>
    </compound>

    <compound>
      <template #head>
        <h6 class="title">{{ t('preferences.general.sidebar.title') }}</h6>
      </template>
      <template #children>
        <bool
          :description="t('preferences.general.sidebar.wrapTextInToc')"
          :bool="wordWrapInToc"
          :on-change="(value) => onSelectChange('wordWrapInToc', value)"
        ></bool>

        <text-box
          :description="t('preferences.general.sidebar.excludePatterns')"
          :notes="t('preferences.general.sidebar.excludePatternsNotes')"
          :input="projectPaths.join(',')"
          :on-change="(value) => onSelectChange('treePathExcludePatterns', value.split(','))"
          more="https://github.com/isaacs/minimatch"
        ></text-box>

        <!-- TODO: The description is very bad and the entry isn't used by the editor. -->
        <cur-select
          :description="t('preferences.general.sidebar.fileSortBy.title')"
          :value="fileSortBy"
          :options="getFileSortByOptions()"
          :on-change="(value) => onSelectChange('fileSortBy', value)"
          :disable="true"
        ></cur-select>
      </template>
    </compound>

    <compound>
      <template #head>
        <h6 class="title">{{ t('preferences.general.startup.title') }}</h6>
      </template>
      <template #children>
        <h6>{{ t('preferences.general.startup.layoutOptions') }}</h6>
        <section>
          <el-radio-group v-model="restoreLayoutState" class="startup-action-ctrl">
            <el-radio :value="true">{{
              t('preferences.general.startup.restorePreviousState')
            }}</el-radio>
            <el-radio :value="false">{{
              t('preferences.general.startup.openBlankState')
            }}</el-radio>
          </el-radio-group>
        </section>
        <h6>{{ t('preferences.general.startup.startupFilesFolders') }}</h6>
        <section>
          <el-radio-group v-model="startUpAction" class="startup-action-ctrl">
            <!--
              Hide "lastState" for now (#2064).
            <el-radio class="ag-underdevelop" value="lastState">Restore last editor session</el-radio>
            -->
            <el-radio value="openLastFolder">{{
              t('preferences.general.startup.openLastFolder')
            }}</el-radio>
            <div>
              <el-radio value="folder"
                >{{ t('preferences.general.startup.openDefaultDirectory')
                }}<span>: {{ defaultDirectoryToOpen }}</span></el-radio
              >
              <el-button size="small" @click="selectDefaultDirectoryToOpen">{{
                t('preferences.general.startup.selectFolder')
              }}</el-button>
            </div>
            <div>
              <el-radio value="blank">{{
                t('preferences.general.startup.openBlankPage')
              }}</el-radio>
            </div>
          </el-radio-group>
        </section>
      </template>
    </compound>

  </div>
</template>

<script setup>
import { computed, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { usePreferencesStore } from '@/store/preferences'
import Compound from '../common/compound/index.vue'
import Range from '../common/range/index.vue'
import CurSelect from '../common/select/index.vue'
import Bool from '../common/bool/index.vue'
import textBox from '../common/textBox/index.vue'
import { isOsx } from '@/util'

import {
  getTitleBarStyleOptions,
  zoomOptions,
  getFileSortByOptions
} from './config'

const { t } = useI18n()
const preferenceStore = usePreferencesStore()

const {
  autoSave,
  autoSaveDelay,
  titleBarStyle,
  defaultDirectoryToOpen,
  openFilesInNewWindow,
  openFolderInNewWindow,
  treePathExcludePatterns: projectPaths,
  zoom,
  hideScrollbar,
  wordWrapInToc,
  fileSortBy
} = storeToRefs(preferenceStore)

const startUpAction = computed({
  get: () => preferenceStore.startUpAction,
  set: (value) => {
    const type = 'startUpAction'
    preferenceStore.SET_SINGLE_PREFERENCE({ type, value })
  }
})

const restoreLayoutState = computed({
  get: () => preferenceStore.restoreLayoutState,
  set: (value) => {
    const type = 'restoreLayoutState'
    preferenceStore.SET_SINGLE_PREFERENCE({ type, value })
  }
})

const onSelectChange = (type, value) => {
  preferenceStore.SET_SINGLE_PREFERENCE({ type, value })
}

const selectDefaultDirectoryToOpen = () => {
  preferenceStore.SELECT_DEFAULT_DIRECTORY_TO_OPEN()
}

// ─── M-021 default-handler bindings ──────────────────────────────────
const isDefault = computed(() => preferenceStore.defaultMdHandler.is_default)
const currentHandler = computed(() => preferenceStore.defaultMdHandler.current_handler)

const setAsDefault = () => {
  preferenceStore.SET_DEFAULT_MD_HANDLER()
}

const unsetDefault = () => {
  preferenceStore.UNSET_DEFAULT_MD_HANDLER()
}

onMounted(() => {
  preferenceStore.REFRESH_DEFAULT_MD_HANDLER()
})
</script>

<style scoped>
/* M-021 macOS Integration cluster — visually distinct, sits at top. */
.pref-general .macos-integration {
  display: block;
  padding: 16px 20px;
  margin-bottom: 24px;
  background: var(--floatBgColor, var(--editorBgColor));
  border: 1px solid var(--itemBgColor, rgba(0, 0, 0, 0.08));
  border-radius: 6px;
}
.pref-general .macos-integration-head {
  margin-bottom: 8px;
}
.pref-general .macos-integration-head .title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--editorColor);
}
.pref-general .macos-integration-body .status {
  margin: 0 0 12px 0;
  font-size: 13px;
  color: var(--editorColor);
  line-height: 1.5;
}
.pref-general .macos-integration-body .status code {
  font-family: var(--monoFont, monospace);
  font-size: 12px;
  background: var(--itemBgColor, rgba(0, 0, 0, 0.05));
  padding: 1px 4px;
  border-radius: 3px;
}
.pref-general .macos-integration-body .actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.pref-general .startup-action-ctrl div {
  display: flex;
  align-items: center;
}
.pref-general .startup-action-ctrl {
  font-size: 14px;
  user-select: none;
  color: var(--editorColor);
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.pref-general .startup-action-ctrl .el-button--small {
  margin-left: 10px;
}

.pref-general .startup-action-ctrl label {
  margin: 5px 0;
}
</style>
