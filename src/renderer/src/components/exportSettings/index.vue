<template>
  <div class="print-settings-dialog">
    <el-dialog
      v-model:visible="showExportSettingsDialog"
      :show-close="false"
      :modal="true"
      custom-class="ag-dialog-table"
      width="500px"
    >
      <h3>Export Options</h3>
      <el-tabs v-model="activeName">
        <el-tab-pane label="Info" name="info">
          <span class="text"
            >Please customize the page appearance and click on "export" to continue.</span
          >
        </el-tab-pane>
        <el-tab-pane label="Page" name="page">
          <!-- HTML -->
          <div v-if="!isPrintable">
            <text-box
              description="The page title:"
              :input="htmlTitle"
              :emit-time="0"
              :on-change="(value) => onSelectChange('htmlTitle', value)"
            ></text-box>
          </div>

          <!-- PDF/Print -->
          <div v-if="isPrintable">
            <div v-if="exportType === 'pdf'">
              <cur-select
                class="page-size-select"
                description="Page size:"
                :value="pageSize"
                :options="pageSizeList"
                :on-change="(value) => onSelectChange('pageSize', value)"
              ></cur-select>
              <div v-if="pageSize === 'custom'" class="row">
                <div>Width/Height in mm:</div>
                <el-input-number
                  v-model="pageSizeWidth"
                  size="mini"
                  controls-position="right"
                  :min="100"
                ></el-input-number>
                <el-input-number
                  v-model="pageSizeHeight"
                  size="mini"
                  controls-position="right"
                  :min="100"
                ></el-input-number>
              </div>

              <bool
                description="Landscape orientation:"
                :bool="isLandscape"
                :on-change="(value) => onSelectChange('isLandscape', value)"
              ></bool>
            </div>

            <div class="row">
              <div class="description">Page margin in mm:</div>
              <div>
                <div class="label">Top/Bottom:</div>
                <el-input-number
                  v-model="pageMarginTop"
                  size="mini"
                  controls-position="right"
                  :min="0"
                  :max="100"
                ></el-input-number>
                <el-input-number
                  v-model="pageMarginBottom"
                  size="mini"
                  controls-position="right"
                  :min="0"
                  :max="100"
                ></el-input-number>
              </div>
              <div>
                <div class="label">Left/Right:</div>
                <el-input-number
                  v-model="pageMarginLeft"
                  size="mini"
                  controls-position="right"
                  :min="0"
                  :max="100"
                ></el-input-number>
                <el-input-number
                  v-model="pageMarginRight"
                  size="mini"
                  controls-position="right"
                  :min="0"
                  :max="100"
                ></el-input-number>
              </div>
            </div>
          </div>
        </el-tab-pane>
        <el-tab-pane label="Style" name="style">
          <bool
            description="Overwrite theme font settings"
            :bool="fontSettingsOverwrite"
            :on-change="(value) => onSelectChange('fontSettingsOverwrite', value)"
          ></bool>
          <div v-if="fontSettingsOverwrite">
            <font-text-box
              description="Font family:"
              :value="fontFamily"
              :on-change="(value) => onSelectChange('fontFamily', value)"
            ></font-text-box>
            <range
              description="Font size"
              :value="fontSize"
              :min="8"
              :max="32"
              unit="px"
              :step="1"
              :on-change="(value) => onSelectChange('fontSize', value)"
            ></range>
            <range
              description="Line height"
              :value="lineHeight"
              :min="1.0"
              :max="2.0"
              :step="0.1"
              :on-change="(value) => onSelectChange('lineHeight', value)"
            ></range>
          </div>
          <bool
            description="Auto numbering headings"
            :bool="autoNumberingHeadings"
            :on-change="(value) => onSelectChange('autoNumberingHeadings', value)"
          ></bool>
          <bool
            description="Show front matter"
            :bool="showFrontMatter"
            :on-change="(value) => onSelectChange('showFrontMatter', value)"
          ></bool>
        </el-tab-pane>
        <el-tab-pane label="Theme" name="theme">
          <div class="text">
            You can change the document appearance by choosing a theme or create a handcrafted one.
          </div>
          <cur-select
            description="Theme"
            more="https://github.com/marktext/marktext/blob/develop/docs/EXPORT_THEMES.md"
            :value="theme"
            :options="themeList"
            :on-change="(value) => onSelectChange('theme', value)"
          ></cur-select>
        </el-tab-pane>
        <el-tab-pane v-if="isPrintable" label="Header & Footer" name="header">
          <div class="text">The text appear on all pages if header and/or footer is defined.</div>
          <cur-select
            description="Header type"
            :value="headerType"
            :options="headerFooterTypes"
            :on-change="(value) => onSelectChange('headerType', value)"
          ></cur-select>
          <text-box
            v-if="headerType === 2"
            description="The left header text"
            :input="headerTextLeft"
            :emit-time="0"
            :on-change="(value) => onSelectChange('headerTextLeft', value)"
          ></text-box>
          <text-box
            v-if="headerType !== 0"
            description="The main header text"
            :input="headerTextCenter"
            :emit-time="0"
            :on-change="(value) => onSelectChange('headerTextCenter', value)"
          ></text-box>
          <text-box
            v-if="headerType === 2"
            description="The right header text"
            :input="headerTextRight"
            :emit-time="0"
            :on-change="(value) => onSelectChange('headerTextRight', value)"
          ></text-box>

          <cur-select
            description="Footer type"
            :value="footerType"
            :options="headerFooterTypes"
            :on-change="(value) => onSelectChange('footerType', value)"
          ></cur-select>
          <text-box
            v-if="footerType === 2"
            description="The left footer text"
            :input="footerTextLeft"
            :emit-time="0"
            :on-change="(value) => onSelectChange('footerTextLeft', value)"
          ></text-box>
          <text-box
            v-if="footerType !== 0"
            description="The main footer text"
            :input="footerTextCenter"
            :emit-time="0"
            :on-change="(value) => onSelectChange('footerTextCenter', value)"
          ></text-box>
          <text-box
            v-if="footerType === 2"
            description="The right footer text"
            :input="footerTextRight"
            :emit-time="0"
            :on-change="(value) => onSelectChange('footerTextRight', value)"
          ></text-box>

          <bool
            description="Customize style"
            :bool="headerFooterCustomize"
            :on-change="(value) => onSelectChange('headerFooterCustomize', value)"
          ></bool>

          <div v-if="headerFooterCustomize">
            <bool
              description="Allow styled header and footer"
              :bool="headerFooterStyled"
              :on-change="(value) => onSelectChange('headerFooterStyled', value)"
            ></bool>
            <range
              description="Header and footer font size"
              :value="headerFooterFontSize"
              :min="8"
              :max="20"
              unit="px"
              :step="1"
              :on-change="(value) => onSelectChange('headerFooterFontSize', value)"
            ></range>
          </div>
        </el-tab-pane>

        <el-tab-pane label="Table of Contents" name="toc">
          <bool
            description="Include top heading"
            detailed-description="Includes the first heading level too."
            :bool="tocIncludeTopHeading"
            :on-change="(value) => onSelectChange('tocIncludeTopHeading', value)"
          ></bool>
          <text-box
            description="Title:"
            :input="tocTitle"
            :emit-time="0"
            :on-change="(value) => onSelectChange('tocTitle', value)"
          ></text-box>
        </el-tab-pane>
      </el-tabs>
      <div class="button-controlls">
        <button class="button-primary" @click="handleClicked">Export...</button>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import fs from 'fs'
import fsPromises from 'fs/promises'
import path from 'path-browserify'
import bus from '../../bus'
import Bool from '@/prefComponents/common/bool'
import CurSelect from '@/prefComponents/common/select'
import FontTextBox from '@/prefComponents/common/fontTextBox'
import Range from '@/prefComponents/common/range'
import TextBox from '@/prefComponents/common/textBox'
import { pageSizeList, headerFooterTypes, exportThemeList } from './exportOptions'

const exportType = ref('')
const themesLoaded = ref(false)
const isPrintable = ref(true)
const showExportSettingsDialog = ref(false)
const activeName = ref('info')
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
const themeList = ref(exportThemeList)
const headerType = ref(0)
const headerTextLeft = ref('')
const headerTextCenter = ref('')
const headerTextRight = ref('')
const footerType = ref(0)
const footerTextLeft = ref('')
const footerTextCenter = ref('')
const footerTextRight = ref('')
const headerFooterCustomize = ref(false)
const headerFooterStyled = ref(true)
const headerFooterFontSize = ref(12)
const tocTitle = ref('')
const tocIncludeTopHeading = ref(true)

onMounted(() => {
  bus.on('showExportDialog', showDialog)
})

onBeforeUnmount(() => {
  bus.off('showExportDialog', showDialog)
})

const showDialog = (type) => {
  exportType.value = type
  isPrintable.value = type !== 'styledHtml'
  if (!isPrintable.value && (activeName.value === 'header' || activeName.value === 'page')) {
    activeName.value = 'info'
  }

  showExportSettingsDialog.value = true
  bus.emit('editor-blur')

  if (!themesLoaded.value) {
    themesLoaded.value = true
    loadThemesFromDisk()
  }
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

  if (headerType.value !== 0) {
    Object.assign(options, {
      header: {
        type: headerType.value,
        left: headerTextLeft.value,
        center: headerTextCenter.value,
        right: headerTextRight.value
      }
    })
  }

  if (footerType.value !== 0) {
    Object.assign(options, {
      footer: {
        type: footerType.value,
        left: footerTextLeft.value,
        center: footerTextCenter.value,
        right: footerTextRight.value
      }
    })
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

const onSelectChange = (key, value) => {
  const state = {
    htmlTitle,
    pageSize,
    isLandscape,
    fontSettingsOverwrite,
    fontFamily,
    fontSize,
    lineHeight,
    autoNumberingHeadings,
    showFrontMatter,
    theme,
    headerType,
    headerTextLeft,
    headerTextCenter,
    headerTextRight,
    footerType,
    footerTextLeft,
    footerTextCenter,
    footerTextRight,
    headerFooterCustomize,
    headerFooterStyled,
    headerFooterFontSize,
    tocIncludeTopHeading,
    tocTitle
  }
  if (key in state) {
    state[key].value = value
  }
}

const loadThemesFromDisk = () => {
  const { userDataPath } = global.marktext.paths
  const themeDir = path.join(userDataPath, 'themes/export')

  // Search for dictionaries on filesystem.
  if (window.fileUtils.isDirectory(themeDir)) {
    fs.readdirSync(themeDir).forEach(async (filename) => {
      const fullname = path.join(themeDir, filename)
      if (/.+\.css$/i.test(filename) && window.fileUtils.isFile(fullname)) {
        try {
          const content = await fsPromises.readFile(fullname, 'utf8')

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
  }
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

.button-controlls {
  margin-top: 8px;
  text-align: right;
}

.button-controlls .button-primary {
  font-size: 14px;
}

.el-tab-pane section:first-child {
  margin-top: 0;
}
</style>
<style>
.print-settings-dialog #pane-header .pref-text-box-item .el-input {
  width: 90% !important;
}

.print-settings-dialog .el-dialog__body {
  padding: 0 20px 20px 20px;
}
.print-settings-dialog .pref-select-item .el-select {
  width: 240px;
}
.print-settings-dialog .el-tabs__content {
  max-height: 350px;
  overflow-x: hidden;
  overflow-y: auto;
}

.print-settings-dialog .el-tabs__content::-webkit-scrollbar:vertical {
  width: 5px;
}
</style>
