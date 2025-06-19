<template>
  <div class="pref-markdown">
    <h4>Markdown</h4>
    <compound>
      <template #head>
        <h6 class="title">Lists:</h6>
      </template>
      <template #children>
        <bool
          description="Prefer loose list items"
          :bool="preferLooseListItem"
          :on-change="(value) => onSelectChange('preferLooseListItem', value)"
          more="https://spec.commonmark.org/0.29/#loose"
        ></bool>
        <cur-select
          description="Preferred marker for bullet lists"
          :value="bulletListMarker"
          :options="bulletListMarkerOptions"
          :on-change="(value) => onSelectChange('bulletListMarker', value)"
          more="https://spec.commonmark.org/0.29/#bullet-list-marker"
        ></cur-select>
        <cur-select
          description="Preferred marker for ordered lists"
          :value="orderListDelimiter"
          :options="orderListDelimiterOptions"
          :on-change="(value) => onSelectChange('orderListDelimiter', value)"
          more="https://spec.commonmark.org/0.29/#ordered-list"
        ></cur-select>
        <cur-select
          description="Preferred list indentation"
          :value="listIndentation"
          :options="listIndentationOptions"
          :on-change="(value) => onSelectChange('listIndentation', value)"
        ></cur-select>
      </template>
    </compound>

    <compound>
      <template #head>
        <h6 class="title">Markdown extensions:</h6>
      </template>
      <template #children>
        <cur-select
          description="Front matter format"
          :value="frontmatterType"
          :options="frontmatterTypeOptions"
          :on-change="(value) => onSelectChange('frontmatterType', value)"
        ></cur-select>
        <bool
          description="Enable Pandoc-style superscript and subscript"
          :bool="superSubScript"
          :on-change="(value) => onSelectChange('superSubScript', value)"
          more="https://pandoc.org/MANUAL.html#superscripts-and-subscripts"
        ></bool>
        <bool
          description="Enable Pandoc-style footnotes"
          notes="Requires restart."
          :bool="footnote"
          :on-change="(value) => onSelectChange('footnote', value)"
          more="https://pandoc.org/MANUAL.html#footnotes"
        ></bool>
      </template>
    </compound>

    <compound>
      <template #head>
        <h6 class="title">Compatibility:</h6>
      </template>
      <template #children>
        <bool
          description="Enable HTML rendering"
          :bool="isHtmlEnabled"
          :on-change="(value) => onSelectChange('isHtmlEnabled', value)"
        ></bool>
        <bool
          description="Enable GitLab compatibility mode"
          :bool="isGitlabCompatibilityEnabled"
          :on-change="(value) => onSelectChange('isGitlabCompatibilityEnabled', value)"
        ></bool>
      </template>
    </compound>

    <compound>
      <template #head>
        <h6 class="title">Diagrams:</h6>
      </template>
      <template #children>
        <cur-select
          description="Sequence diagram theme"
          :value="sequenceTheme"
          :options="sequenceThemeOptions"
          :on-change="(value) => onSelectChange('sequenceTheme', value)"
          more="https://bramp.github.io/js-sequence-diagrams/"
        ></cur-select>
      </template>
    </compound>

    <compound>
      <template #head>
        <h6 class="title">Misc:</h6>
      </template>
      <template #children>
        <cur-select
          description="Preferred heading style"
          :value="preferHeadingStyle"
          :options="preferHeadingStyleOptions"
          :on-change="(value) => onSelectChange('preferHeadingStyle', value)"
          :disable="true"
        ></cur-select>
      </template>
    </compound>
  </div>
</template>

<script setup>
import Compound from '../common/compound'
import { usePreferencesStore } from '@/store/preferences'
import Bool from '../common/bool'
import CurSelect from '../common/select'
import {
  bulletListMarkerOptions,
  orderListDelimiterOptions,
  preferHeadingStyleOptions,
  listIndentationOptions,
  frontmatterTypeOptions,
  sequenceThemeOptions
} from './config'
import { storeToRefs } from 'pinia'

const preferenceStore = usePreferencesStore()

const {
  preferLooseListItem,
  bulletListMarker,
  orderListDelimiter,
  preferHeadingStyle,
  listIndentation,
  frontmatterType,
  superSubScript,
  footnote,
  isHtmlEnabled,
  isGitlabCompatibilityEnabled,
  sequenceTheme
} = storeToRefs(preferenceStore)

const onSelectChange = (type, value) => {
  preferenceStore.SET_SINGLE_PREFERENCE({ type, value })
}
</script>

<script>
export default {
  name: 'Markdown'
}
</script>

<style scoped>
.pref-markdown {
}
</style>
