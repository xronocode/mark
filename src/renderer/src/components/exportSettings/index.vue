<template>
  <div class="print-settings-dialog">
    <el-dialog
      v-model="showExportSettingsDialog"
      :show-close="false"
      :modal="true"
      custom-class="ag-dialog-table"
      width="560px"
    >
      <h3>{{ exportType === 'pdf' ? t('exportSettings.pdfTitle') : t('exportSettings.title') }}</h3>
      <p class="dialog-subtitle">{{ t('exportSettings.info.description') }}</p>

      <div class="export-sections">
        <!-- styled HTML: just the page title -->
        <section v-if="!isPrintable" class="export-section">
          <div class="section-title">{{ t('exportSettings.page.label') }}</div>
          <text-box
            :description="t('exportSettings.page.pageTitle')"
            :input="htmlTitle"
            :emit-time="0"
            :on-change="(value) => onSelectChange('htmlTitle', value)"
          ></text-box>
        </section>

        <!-- PDF: the page box -->
        <section v-if="isPrintable" class="export-section">
          <div class="section-title">{{ t('exportSettings.page.label') }}</div>
          <!-- C-61: the dialog is pdf-only now (⌘P goes straight to the
               print panel). Page size/orientation/margins feed
               mt_export_pdf's pageOptions — the saved PDF's page box —
               and the shared @page CSS. -->
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

          <div v-if="pageSize === 'custom'" class="row">
            <div class="description">{{ t('exportSettings.page.widthHeight') }}</div>
            <div>
              <el-input-number
                v-model="pageSizeWidth"
                size="small"
                controls-position="right"
                :min="10"
                :max="2000"
              ></el-input-number>
              <el-input-number
                v-model="pageSizeHeight"
                size="small"
                controls-position="right"
                :min="10"
                :max="2000"
              ></el-input-number>
            </div>
          </div>

          <!-- C-EXPORT-SINGLE-PAGE R-3: preset in front, the four inputs
               only for Custom (values preserved across the detour). -->
          <div class="row">
            <cur-select
              :description="t('exportSettings.page.pageMarginPreset')"
              :value="marginPreset"
              :options="marginPresetList"
              :on-change="onMarginPresetChange"
            ></cur-select>
          </div>

          <div v-if="marginPreset === 'custom'" class="row">
            <div>
              <div class="label">{{ t('exportSettings.page.topBottom') }}</div>
              <el-input-number
                v-model="pageMarginTop"
                size="small"
                controls-position="right"
                :min="0"
                :max="100"
                @change="clearMarginPresetChoice"
              ></el-input-number>
              <el-input-number
                v-model="pageMarginBottom"
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
                size="small"
                controls-position="right"
                :min="0"
                :max="100"
                @change="clearMarginPresetChoice"
              ></el-input-number>
              <el-input-number
                v-model="pageMarginRight"
                size="small"
                controls-position="right"
                :min="0"
                :max="100"
                @change="clearMarginPresetChoice"
              ></el-input-number>
            </div>
          </div>
        </section>

        <!-- Style: theme + typographic override -->
        <section class="export-section">
          <div class="section-title">{{ t('exportSettings.style.label') }}</div>
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
        </section>

        <!-- Content: document-content transformations -->
        <section class="export-section">
          <div class="section-title">{{ t('exportSettings.content.label') }}</div>
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
        </section>

        <!-- PDF: running head/foot as slot strips -->
        <section v-if="isPrintable" class="export-section">
          <div class="section-title">{{ t('exportSettings.headerFooter.label') }}</div>
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
        </section>
      </div>

      <div class="button-controlls">
        <button class="button-reset" @click="handleReset">
          {{ t('exportSettings.reset') }}
        </button>
        <button class="button-primary" @click="handleClicked">
          {{ t('exportSettings.export') }}
        </button>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
// FILE: src/renderer/src/components/exportSettings/index.vue
// VERSION: 2.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Export settings dialog (C-EXPORT-SINGLE-PAGE single-page
//     anatomy) — one scrollable column with semantic sections (Page
//     pdf-only / Style incl. theme / Content / Header &amp; Footer
//     pdf-only), hydrated from the remembered appearance options on open,
//     margin presets in front of the four margin inputs, header/footer
//     slot strips whose filled slots derive the legacy type integer, and
//     a Reset button restoring factory defaults in-form.
//   SCOPE: The dialog form and the bus 'export' payload assembly; opening
//     via bus 'showExportDialog' ('pdf' | 'styledHtml'); no export
//     execution (editor.vue handleExport owns the pipeline).
//   DEPENDS: prefComponents common controls (bool/select/fontTextBox/
//     range/textBox); headerFooterStrip; exportOptions (lists, margin
//     presets, deriveHeaderFooterType); store/editor
//     getRememberedExportAppearance; bus; i18n (ten locales);
//     window.marktext/fileUtils for export-theme discovery.
//   LINKS: .grace/graph/features.xml M-072;
//     .grace/verification/features.xml V-M-072;
//     .grace/changes/archive/C-61 (pdf-only dialog, remembered options);
//     .grace/changes/active/C-EXPORT-SINGLE-PAGE.
//   ROLE: RUNTIME
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   exportType/themesLoaded/isPrintable/showExportSettingsDialog -
//     dialog lifecycle refs (bus-driven).
//   htmlTitle/pageSize/pageSizeWidth/pageSizeHeight/isLandscape -
//     per-open page-geometry fields (factory defaults on every open).
//   pageMarginTop/Right/Bottom/Left - margin values (hydrated).
//   marginPresetChoice/customMarginsStash/marginPreset/marginPresetList -
//     preset select state: null = derive from values; stash keeps Custom
//     values across a preset detour (corner-3).
//   fontSettingsOverwrite/fontFamily/fontSize/lineHeight - typographic
//     override (toggle inferred from remembered font-key presence).
//   autoNumberingHeadings/showFrontMatter/tocIncludeTopHeading/tocTitle -
//     content transformations (hydrated).
//   theme/themeList/pageSizeList/marginPresetList - theme + option lists.
//   headerText*/footerText* - slot strip texts (hydrated from remembered
//     header/footer objects; the type integer is derived, never stored).
//   headerFooterCustomize/headerFooterStyled/headerFooterFontSize -
//     running-head style block (customize inferred from
//     headerFooterFontSize presence).
//   state - the key→ref map the change handlers write through.
//   showDialog/hydrateFromRemembered/handleReset/handleClicked/
//   onSelectChange/onStripChange/onMarginPresetChange/
//   clearMarginPresetChoice/updateTranslations/loadThemesFromDisk -
//     dialog behaviour.
//   FACTORY_DEFAULTS - the reset/hydration baseline.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: 2026-11-07 v2.0.0 - C-EXPORT-SINGLE-PAGE T-002/T-003:
//   tabs removed in favour of one scrollable column; theme joins Style,
//   numbering/front-matter/TOC form Content; margin presets added; the
//   header/footer type selects and six conditional text boxes replaced by
//   two slot strips; dialog hydrates from remembered options (R-5) and
//   gains Reset (R-6). v1 (MarkText heritage): six el-tabs panes,
//   hardcoded defaults on every open.
// END_CHANGE_SUMMARY
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
// step-8a: no direct Node-core imports in the production renderer bundle —
// loadThemesFromDisk uses window.fileUtils.readdir/readFile via preload.
import bus from '../../bus'
import Bool from '@/prefComponents/common/bool'
import CurSelect from '@/prefComponents/common/select'
import FontTextBox from '@/prefComponents/common/fontTextBox'
import Range from '@/prefComponents/common/range'
import TextBox from '@/prefComponents/common/textBox'
import HeaderFooterStrip from './headerFooterStrip.vue'
import {
  getPageSizeList,
  getExportThemeList,
  getMarginPresetList,
  MARGIN_PRESETS,
  matchMarginPreset,
  deriveHeaderFooterType
} from './exportOptions'
import { getRememberedExportAppearance } from '@/store/editor'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

// C-EXPORT-SINGLE-PAGE R-6: the factory baseline Reset restores and
// per-open geometry/htmlTitle start from (the v1 hardcoded refs).
const FACTORY_DEFAULTS = () => ({
  htmlTitle: '',
  pageSize: 'A4',
  pageSizeWidth: 210,
  pageSizeHeight: 297,
  isLandscape: false,
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

const exportType = ref('')
const themesLoaded = ref(false)
const isPrintable = ref(true)
const showExportSettingsDialog = ref(false)
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
  bus.on('showExportDialog', showDialog)
  bus.on('language-changed', updateTranslations)
})

onBeforeUnmount(() => {
  bus.off('showExportDialog', showDialog)
  bus.off('language-changed', updateTranslations)
})

const updateTranslations = () => {
  themeList.value = getExportThemeList()
  pageSizeList.value = getPageSizeList()
  marginPresetList.value = getMarginPresetList()
}

const showDialog = (type) => {
  exportType.value = type
  isPrintable.value = type !== 'styledHtml'

  showExportSettingsDialog.value = true
  bus.emit('editor-blur')

  hydrateFromRemembered(getRememberedExportAppearance())

  if (!themesLoaded.value) {
    themesLoaded.value = true
    loadThemesFromDisk()
  }
}

// C-EXPORT-SINGLE-PAGE R-5: appearance fields come from the remembered
// options (defaults on first use; optional keys present only when the
// last export carried them — toggles are inferred from that presence).
// Geometry and htmlTitle stay per-open factory defaults. The theme
// payload stores null for "default"; the select uses the sentinel.
const hydrateFromRemembered = (remembered) => {
  const factory = FACTORY_DEFAULTS()
  const geometryKeys = ['htmlTitle', 'pageSize', 'pageSizeWidth', 'pageSizeHeight', 'isLandscape']
  for (const key of geometryKeys) {
    state[key].value = factory[key]
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

// R-6: factory defaults in-form; remembered storage is refreshed only on
// Export (REMEMBER_EXPORT_OPTIONS), exactly as before.
const handleReset = () => {
  const factory = FACTORY_DEFAULTS()
  for (const key of Object.keys(factory)) {
    state[key].value = factory[key]
  }
  marginPresetChoice.value = null
  customMarginsStash = null
}

const handleClicked = () => {
  const options = {
    type: exportType.value,
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

  if (!isPrintable.value) {
    options.htmlTitle = htmlTitle.value
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

  showExportSettingsDialog.value = false
  bus.emit('export', options)
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
  const { userDataPath } = window.marktext.paths
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
</script>

<style scoped>
.print-settings-dialog {
  user-select: none;
}
.row {
  margin-bottom: 8px;
}
.description {
  margin-bottom: 10px;
  white-space: pre-wrap;
  word-break: break-word;
}
.label {
  margin-bottom: 5px;
}
.label ~ div {
  margin-right: 20px;
}
.text {
  white-space: pre-wrap;
  word-break: break-word;
}
.dialog-subtitle {
  margin: 0 0 12px 0;
  font-size: 12px;
  color: var(--prefSub, #6b6b70);
}
.export-section {
  margin-bottom: 14px;
}
.export-section + .export-section {
  border-top: 1px solid rgba(128, 128, 128, 0.25);
  padding-top: 12px;
}
.section-title {
  margin-bottom: 8px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--prefSub, #6b6b70);
}

.button-controlls {
  margin-top: 8px;
  text-align: right;
}

.button-controlls .button-primary {
  font-size: 14px;
}

.button-controlls .button-reset {
  margin-right: 10px;
  font-size: 13px;
  border: none;
  background: transparent;
  color: var(--prefSub, #6b6b70);
  cursor: pointer;
}

.button-controlls .button-reset:hover {
  color: var(--prefAccent, #005fb8);
}
</style>
<style>
.print-settings-dialog .el-dialog__body {
  padding: 0 20px 20px 20px;
}
.print-settings-dialog .pref-select-item .el-select {
  width: 240px;
}
.print-settings-dialog .export-sections {
  max-height: 420px;
  overflow-x: hidden;
  overflow-y: auto;
}

.print-settings-dialog .export-sections::-webkit-scrollbar:vertical {
  width: 5px;
}

.el-input-number {
  & div {
    background: var(--inputBgColor);
  }
  & input {
    border: none !important;
  }
}
</style>
