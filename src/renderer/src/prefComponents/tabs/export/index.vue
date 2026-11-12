<template>
  <div class="pref-tab-page pref-export">
    <compound>
      <template #head><h6 class="title">{{ t('exportSettings.page.label') }}</h6></template>
      <template #children>
        <text-box
          :description="t('exportSettings.page.pageTitle')"
          :input="htmlTitle"
          :emit-time="0"
          :on-change="(value) => onSelectChange('htmlTitle', value)"
        ></text-box>
        <div class="row">
          <cur-select
            :description="t('exportSettings.page.pageSize')"
            :value="pageSize"
            :options="pageSizeList"
            :on-change="(value) => onSelectChange('pageSize', value)"
          ></cur-select>
        </div>
        <div class="row">
          <bool
            :description="t('exportSettings.page.landscapeOrientation')"
            :bool="isLandscape"
            :on-change="(value) => onSelectChange('isLandscape', value)"
          ></bool>
        </div>
        <div v-if="pageSize === 'custom'" class="row export-number-row">
          <div class="description">{{ t('exportSettings.page.widthHeight') }}</div>
          <div>
            <el-input-number
              v-model="pageSizeWidth"
              :aria-label="t('exportSettings.page.dimensions.width')"
              size="small"
              controls-position="right"
              :min="10"
              :max="2000"
            ></el-input-number>
            <el-input-number
              v-model="pageSizeHeight"
              :aria-label="t('exportSettings.page.dimensions.height')"
              size="small"
              controls-position="right"
              :min="10"
              :max="2000"
            ></el-input-number>
          </div>
        </div>
        <div class="row">
          <cur-select
            :description="t('exportSettings.page.pageMarginPreset')"
            :value="marginPreset"
            :options="marginPresetList"
            :on-change="onMarginPresetChange"
          ></cur-select>
        </div>
        <div v-if="marginPreset === 'custom'" class="row export-number-row export-margin-fields">
          <div>
            <div class="label">{{ t('exportSettings.page.topBottom') }}</div>
            <el-input-number
              v-model="pageMarginTop"
              :aria-label="t('exportSettings.page.dimensions.top')"
              size="small"
              controls-position="right"
              :min="0"
              :max="100"
              @change="clearMarginPresetChoice"
            ></el-input-number>
            <el-input-number
              v-model="pageMarginBottom"
              :aria-label="t('exportSettings.page.dimensions.bottom')"
              size="small"
              controls-position="right"
              :min="0"
              :max="100"
              @change="clearMarginPresetChoice"
            ></el-input-number>
          </div>
          <div>
            <div class="label">{{ t('exportSettings.page.leftRight') }}</div>
            <el-input-number
              v-model="pageMarginLeft"
              :aria-label="t('exportSettings.page.dimensions.left')"
              size="small"
              controls-position="right"
              :min="0"
              :max="100"
              @change="clearMarginPresetChoice"
            ></el-input-number>
            <el-input-number
              v-model="pageMarginRight"
              :aria-label="t('exportSettings.page.dimensions.right')"
              size="small"
              controls-position="right"
              :min="0"
              :max="100"
              @change="clearMarginPresetChoice"
            ></el-input-number>
          </div>
        </div>
      </template>
    </compound>
    <compound>
      <template #head><h6 class="title">{{ t('exportSettings.style.label') }}</h6></template>
      <template #children>
        <cur-select
          :description="t('exportSettings.theme.theme')"
          more="https://github.com/xronocode/mark/blob/electron/docs/EXPORT_THEMES.md"
          :value="theme"
          :options="themeList"
          :on-change="(value) => onSelectChange('theme', value)"
        ></cur-select>
        <bool
          :description="t('exportSettings.style.overwriteThemeFont')"
          :bool="fontSettingsOverwrite"
          :on-change="(value) => onSelectChange('fontSettingsOverwrite', value)"
        ></bool>
        <div v-if="fontSettingsOverwrite">
          <font-text-box
            :description="t('exportSettings.style.fontFamily')"
            :value="fontFamily"
            :on-change="(value) => onSelectChange('fontFamily', value)"
          ></font-text-box>
          <range
            :description="t('exportSettings.style.fontSize')"
            :value="fontSize"
            :min="8"
            :max="32"
            unit="px"
            :step="1"
            :on-change="(value) => onSelectChange('fontSize', value)"
          ></range>
          <range
            :description="t('exportSettings.style.lineHeight')"
            :value="lineHeight"
            :min="1.0"
            :max="2.0"
            :step="0.1"
            :on-change="(value) => onSelectChange('lineHeight', value)"
          ></range>
        </div>
      </template>
    </compound>
    <compound>
      <template #head><h6 class="title">{{ t('exportSettings.content.label') }}</h6></template>
      <template #children>
        <bool
          :description="t('exportSettings.autoNumberingHeadings')"
          :bool="autoNumberingHeadings"
          :on-change="(value) => onSelectChange('autoNumberingHeadings', value)"
        ></bool>
        <bool
          :description="t('exportSettings.showFrontMatter')"
          :bool="showFrontMatter"
          :on-change="(value) => onSelectChange('showFrontMatter', value)"
        ></bool>
        <bool
          :description="t('exportSettings.toc.includeTopHeading')"
          :detailed-description="t('exportSettings.toc.includeTopHeadingDetail')"
          :bool="tocIncludeTopHeading"
          :on-change="(value) => onSelectChange('tocIncludeTopHeading', value)"
        ></bool>
        <text-box
          :description="t('exportSettings.toc.title')"
          :input="tocTitle"
          :emit-time="0"
          :on-change="(value) => onSelectChange('tocTitle', value)"
        ></text-box>
      </template>
    </compound>
    <compound>
      <template #head><h6 class="title">{{ t('exportSettings.headerFooter.label') }}</h6></template>
      <template #children>
        <header-footer-strip
          :label="t('exportSettings.headerFooter.headerText')"
          :left="headerTextLeft"
          :center="headerTextCenter"
          :right="headerTextRight"
          @change="(patch) => onStripChange('header', patch)"
        ></header-footer-strip>
        <header-footer-strip
          :label="t('exportSettings.headerFooter.footerText')"
          :left="footerTextLeft"
          :center="footerTextCenter"
          :right="footerTextRight"
          @change="(patch) => onStripChange('footer', patch)"
        ></header-footer-strip>
        <bool
          :description="t('exportSettings.headerFooter.customizeStyle')"
          :bool="headerFooterCustomize"
          :on-change="(value) => onSelectChange('headerFooterCustomize', value)"
        ></bool>
        <div v-if="headerFooterCustomize">
          <bool
            :description="t('exportSettings.headerFooter.allowStyled')"
            :bool="headerFooterStyled"
            :on-change="(value) => onSelectChange('headerFooterStyled', value)"
          ></bool>
          <range
            :description="t('exportSettings.headerFooter.fontSize')"
            :value="headerFooterFontSize"
            :min="8"
            :max="20"
            unit="px"
            :step="1"
            :on-change="(value) => onSelectChange('headerFooterFontSize', value)"
          ></range>
        </div>
      </template>
    </compound>
    <div class="export-actions">
      <p v-if="persistenceFailed" class="persistence-error" role="alert">
        {{ t('exportSettings.saveFailed') }}
        <button type="button" class="button-retry" @click="persistCurrentOptions">{{ t('exportSettings.retrySave') }}</button>
      </p>
      <button type="button" class="button-reset" @click="handleReset">{{ t('exportSettings.reset') }}</button>
    </div>
  </div>
</template>

<script>
// Preserve an unresolved write warning when this Settings realm revisits the tab.
let persistenceFailedInRealm = false
</script>

<script setup>
// FILE: src/renderer/src/prefComponents/tabs/export/index.vue
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Own future-export defaults in the existing Preferences shell with immediate apply.
//   SCOPE: Original Page/Style/Content/Header-Footer controls, presets, optional-key removal, Reset and honest persistence failure/retry; no export execution or modal.
//   DEPENDS: Existing Preferences controls, exportOptions/headerFooterStrip, editor appearance accessor/store, exportPageDefaults, bus language notification and i18n.
//   LINKS: M-072; V-M-072; C-EXPORT-SETTINGS-SECTION.
//   ROLE: RUNTIME
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   FACTORY_DEFAULTS - Original form baseline plus typed page defaults.
//   editorStore/persistenceFailedInRealm/persistenceFailed/suppressPersistence - Persistence target, retained visible failure and batched Reset guard.
//   htmlTitle/pageSize/pageSizeWidth/pageSizeHeight/isLandscape - Explicit future-export defaults.
//   pageMarginTop/pageMarginRight/pageMarginBottom/pageMarginLeft - Appearance margins.
//   fontSettingsOverwrite/fontFamily/fontSize/lineHeight - Optional font override.
//   autoNumberingHeadings/showFrontMatter/tocIncludeTopHeading/tocTitle - Content controls.
//   theme/themeList/pageSizeList/marginPresetList - Existing localized options.
//   headerTextLeft/headerTextCenter/headerTextRight/footerTextLeft/footerTextCenter/footerTextRight - Header/footer slots.
//   headerFooterCustomize/headerFooterStyled/headerFooterFontSize - Optional running-head style.
//   marginPresetChoice/customMarginsStash/marginPreset - Preset derivation and custom-value detours.
//   hydrateFromRemembered/handleReset/buildOptions/persistCurrentOptions - Hydrate, assemble and persist without exporting.
//   state/onSelectChange/onStripChange/onMarginPresetChange/clearMarginPresetChoice - Existing control bindings.
//   updateTranslations/loadThemesFromDisk - Localized lists and existing export-theme discovery.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   LAST_CHANGE: 2026-11-12 C-EXPORT-SETTINGS-SECTION: relocate the shipped form into immediate-apply Preferences.
// END_CHANGE_SUMMARY
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
// step-8a: no direct Node-core imports in the production renderer bundle —
// loadThemesFromDisk uses window.fileUtils.readdir/readFile via preload.
import bus from '@/bus'
import Compound from '@/prefComponents/common/compound'
import Bool from '@/prefComponents/common/bool'
import CurSelect from '@/prefComponents/common/select'
import FontTextBox from '@/prefComponents/common/fontTextBox'
import Range from '@/prefComponents/common/range'
import TextBox from '@/prefComponents/common/textBox'
import HeaderFooterStrip from '@/components/exportSettings/headerFooterStrip.vue'
import {
  getPageSizeList,
  getExportThemeList,
  getMarginPresetList,
  MARGIN_PRESETS,
  matchMarginPreset,
  deriveHeaderFooterType
} from '@/components/exportSettings/exportOptions'
import { getRememberedExportAppearance, useEditorStore } from '@/store/editor'
import { DEFAULT_EXPORT_PAGE_OPTIONS, getRememberedExportPageOptions, rememberExportPageOptions } from '@/util/exportPageDefaults'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const editorStore = useEditorStore()
const persistenceFailed = ref(persistenceFailedInRealm)
let suppressPersistence = false

// Factory form values preserve the shipped controls and their optional toggles.
const FACTORY_DEFAULTS = () => ({
  ...DEFAULT_EXPORT_PAGE_OPTIONS(),
  pageMarginTop: 20,
  pageMarginRight: 15,
  pageMarginBottom: 20,
  pageMarginLeft: 15,
  fontSettingsOverwrite: false,
  fontFamily: 'Default',
  fontSize: 14,
  lineHeight: 1.5,
  autoNumberingHeadings: false,
  showFrontMatter: false,
  theme: 'default',
  headerTextLeft: '',
  headerTextCenter: '',
  headerTextRight: '',
  footerTextLeft: '',
  footerTextCenter: '',
  footerTextRight: '',
  headerFooterCustomize: false,
  headerFooterStyled: true,
  headerFooterFontSize: 12,
  tocTitle: '',
  tocIncludeTopHeading: true
})

const htmlTitle = ref('')
const pageSize = ref('A4')
const pageSizeWidth = ref(210)
const pageSizeHeight = ref(297)
const isLandscape = ref(false)
const pageMarginTop = ref(20)
const pageMarginRight = ref(15)
const pageMarginBottom = ref(20)
const pageMarginLeft = ref(15)
const fontSettingsOverwrite = ref(false)
const fontFamily = ref('Default')
const fontSize = ref(14)
const lineHeight = ref(1.5)
const autoNumberingHeadings = ref(false)
const showFrontMatter = ref(false)
const theme = ref('default')
const themeList = ref(getExportThemeList())
const pageSizeList = ref(getPageSizeList())
const marginPresetList = ref(getMarginPresetList())
const headerTextLeft = ref('')
const headerTextCenter = ref('')
const headerTextRight = ref('')
const footerTextLeft = ref('')
const footerTextCenter = ref('')
const footerTextRight = ref('')
const headerFooterCustomize = ref(false)
const headerFooterStyled = ref(true)
const headerFooterFontSize = ref(12)
const tocTitle = ref('')
const tocIncludeTopHeading = ref(true)

// C-EXPORT-SINGLE-PAGE R-3: null = derive the shown preset from the four
// values; an explicit 'custom' survives while the values still match a
// preset (the user chose Custom). The stash keeps the pre-detour values.
const marginPresetChoice = ref(null)
let customMarginsStash = null

const marginPreset = computed(() => {
  if (marginPresetChoice.value) return marginPresetChoice.value
  return matchMarginPreset({
    pageMarginTop: pageMarginTop.value,
    pageMarginRight: pageMarginRight.value,
    pageMarginBottom: pageMarginBottom.value,
    pageMarginLeft: pageMarginLeft.value
  })
})

onMounted(() => {
  loadThemesFromDisk()
  bus.on('language-changed', updateTranslations)
})

onBeforeUnmount(() => {
  bus.off('language-changed', updateTranslations)
})

const updateTranslations = () => {
  themeList.value = getExportThemeList()
  pageSizeList.value = getPageSizeList()
  marginPresetList.value = getMarginPresetList()
}

// Hydrate once before installing the persistence watcher.
const hydrateFromRemembered = (remembered) => {
  const factory = FACTORY_DEFAULTS()
  const geometryKeys = ['htmlTitle', 'pageSize', 'pageSizeWidth', 'pageSizeHeight', 'isLandscape']
  const page = getRememberedExportPageOptions()
  for (const key of geometryKeys) {
    state[key].value = page[key]
  }

  theme.value = remembered.theme || 'default'
  pageMarginTop.value = remembered.pageMarginTop
  pageMarginRight.value = remembered.pageMarginRight
  pageMarginBottom.value = remembered.pageMarginBottom
  pageMarginLeft.value = remembered.pageMarginLeft
  autoNumberingHeadings.value = !!remembered.autoNumberingHeadings
  showFrontMatter.value = !!remembered.showFrontMatter
  tocTitle.value = remembered.tocTitle ?? factory.tocTitle
  tocIncludeTopHeading.value = remembered.tocIncludeTopHeading !== false

  fontSettingsOverwrite.value = 'fontSize' in remembered
  fontFamily.value = remembered.fontFamily || factory.fontFamily
  fontSize.value = remembered.fontSize ?? factory.fontSize
  lineHeight.value = remembered.lineHeight ?? factory.lineHeight

  headerTextLeft.value = remembered.header?.left ?? ''
  headerTextCenter.value = remembered.header?.center ?? ''
  headerTextRight.value = remembered.header?.right ?? ''
  footerTextLeft.value = remembered.footer?.left ?? ''
  footerTextCenter.value = remembered.footer?.center ?? ''
  footerTextRight.value = remembered.footer?.right ?? ''

  headerFooterCustomize.value = 'headerFooterFontSize' in remembered
  headerFooterStyled.value = remembered.headerFooterStyled !== false
  headerFooterFontSize.value = remembered.headerFooterFontSize ?? factory.headerFooterFontSize

  marginPresetChoice.value = null
  customMarginsStash = null
}

// Reset remembers one complete factory snapshot, including optional-key removal.
const handleReset = async () => {
  suppressPersistence = true
  const factory = FACTORY_DEFAULTS()
  for (const key of Object.keys(factory)) {
    state[key].value = factory[key]
  }
  marginPresetChoice.value = null
  customMarginsStash = null
  await nextTick()
  suppressPersistence = false
  persistCurrentOptions()
}

const buildOptions = () => {
  const options = {
    htmlTitle: htmlTitle.value,
    pageSize: pageSize.value,
    pageSizeWidth: pageSizeWidth.value,
    pageSizeHeight: pageSizeHeight.value,
    isLandscape: isLandscape.value,
    pageMarginTop: pageMarginTop.value,
    pageMarginRight: pageMarginRight.value,
    pageMarginBottom: pageMarginBottom.value,
    pageMarginLeft: pageMarginLeft.value,
    autoNumberingHeadings: autoNumberingHeadings.value,
    showFrontMatter: showFrontMatter.value,
    theme: theme.value === 'default' ? null : theme.value,
    tocTitle: tocTitle.value,
    tocIncludeTopHeading: tocIncludeTopHeading.value
  }

  if (fontSettingsOverwrite.value) {
    Object.assign(options, {
      fontSize: fontSize.value,
      lineHeight: lineHeight.value,
      fontFamily: fontFamily.value === 'Default' ? null : fontFamily.value
    })
  }

  // R-4: the legacy type integer is derived from which slots carry text
  // (0 none, 1 single centre cell, 2 three cells); the key is emitted
  // only when at least one slot is filled.
  const headerType = deriveHeaderFooterType({
    left: headerTextLeft.value,
    center: headerTextCenter.value,
    right: headerTextRight.value
  })
  if (headerType !== 0) {
    options.header = {
      type: headerType,
      left: headerTextLeft.value,
      center: headerTextCenter.value,
      right: headerTextRight.value
    }
  }

  const footerType = deriveHeaderFooterType({
    left: footerTextLeft.value,
    center: footerTextCenter.value,
    right: footerTextRight.value
  })
  if (footerType !== 0) {
    options.footer = {
      type: footerType,
      left: footerTextLeft.value,
      center: footerTextCenter.value,
      right: footerTextRight.value
    }
  }

  if (headerFooterCustomize.value) {
    Object.assign(options, {
      headerFooterStyled: headerFooterStyled.value,
      headerFooterFontSize: headerFooterFontSize.value
    })
  }

  return options
}

const state = {
  htmlTitle,
  pageSize,
  pageSizeWidth,
  pageSizeHeight,
  isLandscape,
  pageMarginTop,
  pageMarginRight,
  pageMarginBottom,
  pageMarginLeft,
  fontSettingsOverwrite,
  fontFamily,
  fontSize,
  lineHeight,
  autoNumberingHeadings,
  showFrontMatter,
  theme,
  headerTextLeft,
  headerTextCenter,
  headerTextRight,
  footerTextLeft,
  footerTextCenter,
  footerTextRight,
  headerFooterCustomize,
  headerFooterStyled,
  headerFooterFontSize,
  tocIncludeTopHeading,
  tocTitle
}

const onSelectChange = (key, value) => {
  if (key in state) {
    state[key].value = value
  }
}

const onStripChange = (which, patch) => {
  const prefix = which === 'header' ? 'header' : 'footer'
  for (const slot of ['left', 'center', 'right']) {
    if (slot in patch) {
      state[`${prefix}Text${slot[0].toUpperCase()}${slot.slice(1)}`].value = patch[slot]
    }
  }
}

const onMarginPresetChange = (value) => {
  if (value !== 'custom') {
    if (marginPreset.value === 'custom') {
      customMarginsStash = {
        pageMarginTop: pageMarginTop.value,
        pageMarginRight: pageMarginRight.value,
        pageMarginBottom: pageMarginBottom.value,
        pageMarginLeft: pageMarginLeft.value
      }
    }
    const preset = MARGIN_PRESETS[value]
    if (preset) {
      pageMarginTop.value = preset.pageMarginTop
      pageMarginRight.value = preset.pageMarginRight
      pageMarginBottom.value = preset.pageMarginBottom
      pageMarginLeft.value = preset.pageMarginLeft
    }
    marginPresetChoice.value = null
  } else {
    if (customMarginsStash) {
      pageMarginTop.value = customMarginsStash.pageMarginTop
      pageMarginRight.value = customMarginsStash.pageMarginRight
      pageMarginBottom.value = customMarginsStash.pageMarginBottom
      pageMarginLeft.value = customMarginsStash.pageMarginLeft
      customMarginsStash = null
    }
    marginPresetChoice.value = 'custom'
  }
}

const clearMarginPresetChoice = () => {
  marginPresetChoice.value = null
  customMarginsStash = null
}

const loadThemesFromDisk = async () => {
  const userDataPath = window.marktext?.paths?.userDataPath
  if (!userDataPath || !window.fileUtils?.isDirectory) return
  const themeDir = window.path.join(userDataPath, 'themes/export')

  // Search for dictionaries on filesystem.
  if (!window.fileUtils.isDirectory(themeDir)) {
    return
  }
  let entries
  try {
    entries = await window.fileUtils.readdir(themeDir)
  } catch (e) {
    console.error('loadThemesFromDisk readdir failed:', e)
    return
  }
  await Promise.all(
    entries.map(async (filename) => {
      const fullname = window.path.join(themeDir, filename)
      if (/.+\.css$/i.test(filename) && window.fileUtils.isFile(fullname)) {
        try {
          const content = await window.fileUtils.readFile(fullname, 'utf8')

          // Match comment with theme name in first line only.
          const match = content.match(/^(?:\/\*+[ \t]*([A-z0-9 -]+)[ \t]*(?:\*+\/|[\n\r])?)/)

          let label
          if (match && match[1]) {
            label = match[1]
          } else {
            label = filename
          }

          themeList.value.push({
            value: filename,
            label
          })
        } catch (e) {
          console.error('loadThemesFromDisk failed:', e)
        }
      }
    })
  )
}

const persistCurrentOptions = () => {
  const options = buildOptions()
  const appearanceSaved = editorStore.REMEMBER_EXPORT_OPTIONS(options)
  const pageSaved = rememberExportPageOptions(options)
  persistenceFailed.value = !appearanceSaved || !pageSaved
  persistenceFailedInRealm = persistenceFailed.value
}

hydrateFromRemembered(getRememberedExportAppearance())
watch(Object.values(state), () => {
  if (!suppressPersistence) persistCurrentOptions()
}, { flush: 'post' })

</script>

<style scoped>
.pref-export { display: flex; flex-direction: column; gap: 18px; }
.row { margin: 0; }
.export-number-row { padding: 8px 14px; }
.export-margin-fields { display: flex; flex-wrap: wrap; gap: 10px 24px; }
.description { margin-bottom: 10px; white-space: pre-wrap; word-break: break-word; }
.label { margin-bottom: 5px; }
.label ~ div { margin-right: 20px; }
.export-actions { display: flex; justify-content: flex-end; align-items: start; gap: 12px; }
.export-actions button {
  font: inherit; font-size: 13px; padding: 3px 12px; cursor: default;
  border: 0.5px solid var(--prefCtrlBorder, rgba(0,0,0,.14));
  border-radius: var(--prefCtrlRadius, 6px); background: var(--prefCtrl, #fff);
  color: var(--prefText, #1d1d1f); box-shadow: 0 .5px 1px rgba(0,0,0,.08);
}
.export-actions button:focus-visible { outline: 2px solid var(--prefAccent); outline-offset: 2px; }
.persistence-error { flex: 1; margin: 0; font-size: 13px; color: #c4271b; }
.persistence-error .button-retry { margin-top: 6px; }
:global(body.dark) .persistence-error { color: #ff6961; }
.pref-export :deep(.el-input-number) {
  width: 104px;
  height: 28px;
  margin: 0 8px 0 0;
}
.pref-export :deep(.el-input) {
  --el-input-bg-color: var(--prefCtrl);
  --el-input-text-color: var(--prefText);
  --el-input-border-color: var(--prefCtrlBorder);
  --el-input-hover-border-color: var(--prefSub);
  --el-input-focus-border-color: var(--prefAccent);
  --el-input-border-radius: var(--prefCtrlRadius);
}
.pref-export :deep(input.el-input__inner) {
  background: transparent;
  border: 0;
  color: var(--prefText);
  font: inherit;
  font-variant-numeric: tabular-nums;
}
.pref-export :deep(.el-input-number.is-controls-right span.el-input-number__increase),
.pref-export :deep(.el-input-number.is-controls-right span.el-input-number__decrease) {
  background: var(--prefCtrl);
  color: var(--prefText);
}
.pref-export :deep(.el-input__inner::placeholder) { color: var(--prefSub); }

</style>
