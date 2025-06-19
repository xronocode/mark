<template>
  <div class="pref-editor">
    <h4>Editor</h4>
    <compound>
      <template #head>
        <h6 class="title">Text editor settings:</h6>
      </template>
      <template #children>
        <range
          description="Font size"
          :value="fontSize"
          :min="12"
          :max="32"
          unit="px"
          :step="1"
          :on-change="(value) => onSelectChange('fontSize', value)"
        ></range>
        <range
          description="Line height"
          :value="lineHeight"
          :min="1.2"
          :max="2.0"
          :step="0.1"
          :on-change="(value) => onSelectChange('lineHeight', value)"
        ></range>
        <font-text-box
          description="Font family"
          :value="editorFontFamily"
          :on-change="(value) => onSelectChange('editorFontFamily', value)"
        ></font-text-box>
        <text-box
          description="Maximum width of text editor"
          notes="Leave empty for theme default, otherwise use number with unit suffix, which is one of 'ch' for characters, 'px' for pixels, or '%' for percentage."
          :input="editorLineWidth"
          :regex-validator="/^(?:$|[0-9]+(?:ch|px|%)$)/"
          :on-change="(value) => onSelectChange('editorLineWidth', value)"
        ></text-box>
      </template>
    </compound>

    <compound>
      <template #head>
        <h6 class="title">Code block settings:</h6>
      </template>
      <template #children>
        <range
          description="Font size"
          :value="codeFontSize"
          :min="12"
          :max="28"
          unit="px"
          :step="1"
          :on-change="(value) => onSelectChange('codeFontSize', value)"
        ></range>
        <font-text-box
          description="Font family"
          :only-monospace="true"
          :value="codeFontFamily"
          :on-change="(value) => onSelectChange('codeFontFamily', value)"
        ></font-text-box>
        <!-- FIXME: Disabled due to #1648. -->
        <bool
          v-show="false"
          description="Show line numbers"
          :bool="codeBlockLineNumbers"
          :on-change="(value) => onSelectChange('codeBlockLineNumbers', value)"
        ></bool>
        <bool
          description="Remove leading and trailing empty lines"
          :bool="trimUnnecessaryCodeBlockEmptyLines"
          :on-change="(value) => onSelectChange('trimUnnecessaryCodeBlockEmptyLines', value)"
        ></bool>
      </template>
    </compound>

    <compound>
      <template #head>
        <h6 class="title">Writing behavior:</h6>
      </template>
      <template #children>
        <bool
          description="Automatically close brackets when writing"
          :bool="autoPairBracket"
          :on-change="(value) => onSelectChange('autoPairBracket', value)"
        ></bool>
        <bool
          description="Automatically complete markdown syntax"
          :bool="autoPairMarkdownSyntax"
          :on-change="(value) => onSelectChange('autoPairMarkdownSyntax', value)"
        ></bool>
        <bool
          description="Automatically close quotation marks"
          :bool="autoPairQuote"
          :on-change="(value) => onSelectChange('autoPairQuote', value)"
        ></bool>
      </template>
    </compound>

    <compound>
      <template #head>
        <h6 class="title">File representation:</h6>
      </template>
      <template #children>
        <cur-select
          description="Preferred tab width"
          :value="tabSize"
          :options="tabSizeOptions"
          :on-change="(value) => onSelectChange('tabSize', value)"
        ></cur-select>
        <cur-select
          description="Line separator type"
          :value="endOfLine"
          :options="endOfLineOptions"
          :on-change="(value) => onSelectChange('endOfLine', value)"
        ></cur-select>
        <cur-select
          description="Default encoding"
          :value="defaultEncoding"
          :options="defaultEncodingOptions"
          :on-change="(value) => onSelectChange('defaultEncoding', value)"
        ></cur-select>
        <bool
          description="Automatically detect file encoding"
          :bool="autoGuessEncoding"
          :on-change="(value) => onSelectChange('autoGuessEncoding', value)"
        ></bool>
        <cur-select
          description="Handling of trailing newline characters"
          :value="trimTrailingNewline"
          :options="trimTrailingNewlineOptions"
          :on-change="(value) => onSelectChange('trimTrailingNewline', value)"
        ></cur-select>
      </template>
    </compound>

    <compound>
      <template #head>
        <h6 class="title">Misc:</h6>
      </template>
      <template #children>
        <cur-select
          description="Text direction"
          :value="textDirection"
          :options="textDirectionOptions"
          :on-change="(value) => onSelectChange('textDirection', value)"
        ></cur-select>
        <bool
          description="Hide hint for selecting type of new paragraph"
          :bool="hideQuickInsertHint"
          :on-change="(value) => onSelectChange('hideQuickInsertHint', value)"
        ></bool>
        <bool
          description="Hide popup when cursor is over link"
          :bool="hideLinkPopup"
          :on-change="(value) => onSelectChange('hideLinkPopup', value)"
        ></bool>
        <bool
          description="Whether to automatically check any related tasks"
          :bool="autoCheck"
          :on-change="(value) => onSelectChange('autoCheck', value)"
        ></bool>
        <bool
          description="Wrap text inside code blocks"
          :bool="wrapCodeBlocks"
          :on-change="(value) => onSelectChange('wrapCodeBlocks', value)"
        ></bool>
      </template>
    </compound>
  </div>
</template>

<script setup>
import { storeToRefs } from 'pinia'
import { usePreferencesStore } from '@/store/preferences'
import Compound from '../common/compound/index.vue'
import FontTextBox from '../common/fontTextBox/index.vue'
import Range from '../common/range/index.vue'
import CurSelect from '../common/select/index.vue'
import Bool from '../common/bool/index.vue'
import TextBox from '../common/textBox/index.vue'
import {
  tabSizeOptions,
  endOfLineOptions,
  textDirectionOptions,
  trimTrailingNewlineOptions,
  getDefaultEncodingOptions
} from './config'

const preferenceStore = usePreferencesStore()

const defaultEncodingOptions = getDefaultEncodingOptions()

const {
  fontSize,
  editorFontFamily,
  lineHeight,
  autoPairBracket,
  autoPairMarkdownSyntax,
  autoPairQuote,
  tabSize,
  endOfLine,
  textDirection,
  codeFontSize,
  codeFontFamily,
  codeBlockLineNumbers,
  trimUnnecessaryCodeBlockEmptyLines,
  hideQuickInsertHint,
  hideLinkPopup,
  autoCheck,
  wrapCodeBlocks,
  editorLineWidth,
  defaultEncoding,
  autoGuessEncoding,
  trimTrailingNewline
} = storeToRefs(preferenceStore)

const onSelectChange = (type, value) => {
  preferenceStore.SET_SINGLE_PREFERENCE({ type, value })
}
</script>

<style scoped>
.pref-editor {
  & .image-ctrl {
    font-size: 14px;
    user-select: none;
    margin: 20px 0;
    color: var(--editorColor);
    & label {
      display: block;
      margin: 20px 0;
    }
  }
}
</style>
