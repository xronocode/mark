<template>
  <div class="pref-tab-page pref-tab-page--markdown">
    <!-- START_BLOCK_MARKDOWN_LISTS -->
    <compound>
      <template #head>
        <h6 class="title">{{ t('preferences.markdown.lists.title') }}</h6>
      </template>
      <template #children>
        <!-- IA §3.4: "loose" is CommonMark jargon — a Compact/Spaced
             segmented control with help text carries the same key. -->
        <segmented
          :description="t('preferences.markdown.lists.spacing')"
          :help="t('preferences.markdown.lists.spacingHelp')"
          :value="listSpacing"
          :options="listSpacingOptions"
          :on-change="onListSpacingChange"
        ></segmented>
        <cur-select
          :description="t('preferences.markdown.lists.bulletCharacter')"
          :value="bulletListMarker"
          :options="bulletListMarkerOptions"
          :on-change="(value) => onSelectChange('bulletListMarker', value)"
        ></cur-select>
        <cur-select
          :description="t('preferences.markdown.lists.orderedListFormat')"
          :value="orderListDelimiter"
          :options="getOrderListDelimiterOptions()"
          :on-change="(value) => onSelectChange('orderListDelimiter', value)"
        ></cur-select>
        <cur-select
          :description="t('preferences.markdown.lists.indentation')"
          :help="t('preferences.markdown.lists.indentationHelp')"
          :value="listIndentation"
          :options="getListIndentationOptions()"
          :on-change="(value) => onSelectChange('listIndentation', value)"
        ></cur-select>
      </template>
    </compound>
    <!-- END_BLOCK_MARKDOWN_LISTS -->

    <!-- START_BLOCK_MARKDOWN_EXTENSIONS -->
    <compound>
      <template #head>
        <h6 class="title">{{ t('preferences.markdown.extensions.title') }}</h6>
      </template>
      <template #children>
        <bool
          :description="t('preferences.markdown.extensions.footnote')"
          :help="t('preferences.markdown.extensions.footnoteHelp')"
          :bool="footnote"
          :on-change="(value) => onSelectChange('footnote', value)"
        ></bool>
        <bool
          :description="t('preferences.markdown.extensions.math')"
          :help="t('preferences.markdown.extensions.mathHelp')"
          :bool="mathEnabled"
          :on-change="(value) => onSelectChange('mathEnabled', value)"
        ></bool>
        <bool
          :description="t('preferences.markdown.extensions.superSubScript')"
          :help="t('preferences.markdown.extensions.superSubScriptHelp')"
          :bool="superSubScript"
          :on-change="(value) => onSelectChange('superSubScript', value)"
        ></bool>
        <cur-select
          :description="t('preferences.markdown.extensions.frontmatterFormat')"
          :help="t('preferences.markdown.extensions.frontmatterFormatHelp')"
          :value="frontmatterType"
          :options="getFrontmatterTypeOptions()"
          :on-change="(value) => onSelectChange('frontmatterType', value)"
        ></cur-select>
        <bool
          :description="t('preferences.markdown.extensions.frontmatterProperties')"
          :help="t('preferences.markdown.extensions.frontmatterPropertiesHelp')"
          :bool="frontmatterProperties"
          :on-change="(value) => onSelectChange('frontmatterProperties', value)"
        ></bool>
      </template>
    </compound>
    <!-- END_BLOCK_MARKDOWN_EXTENSIONS -->

    <!-- START_BLOCK_MARKDOWN_COMPATIBILITY -->
    <compound>
      <template #head>
        <h6 class="title">{{ t('preferences.markdown.compatibility.title') }}</h6>
      </template>
      <template #children>
        <bool
          :description="t('preferences.markdown.compatibility.allowHtml')"
          :help="t('preferences.markdown.compatibility.allowHtmlHelp')"
          :bool="isHtmlEnabled"
          :on-change="(value) => onSelectChange('isHtmlEnabled', value)"
        ></bool>
        <bool
          :description="t('preferences.markdown.compatibility.gitlabFlavored')"
          :help="t('preferences.markdown.compatibility.gitlabFlavoredHelp')"
          :bool="isGitlabCompatibilityEnabled"
          :on-change="(value) => onSelectChange('isGitlabCompatibilityEnabled', value)"
        ></bool>
        <cur-select
          :description="t('preferences.markdown.compatibility.sequenceDiagramStyle')"
          :value="sequenceTheme"
          :options="getSequenceThemeOptions()"
          :on-change="(value) => onSelectChange('sequenceTheme', value)"
        ></cur-select>
      </template>
    </compound>
    <!-- END_BLOCK_MARKDOWN_COMPATIBILITY -->
  </div>
</template>

<script setup>
// FILE: src/renderer/src/prefComponents/tabs/markdown/index.vue
// VERSION: 2.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Markdown tab of the C-38 Settings window — Lists (spacing as a Compact/Spaced segmented control, bullet character, ordered format, indentation), Extensions (footnotes, math, super/subscript, front matter) and Compatibility (HTML, GitLab, sequence diagrams) per the N2 IA §3.4.
//   SCOPE: Row composition; preferLooseListItem presented through the compact/spaced mapping (key semantics unchanged); sequence diagrams fold into Compatibility (IA §2.3).
//   DEPENDS: prefComponents/common/{compound,bool,select,segmented}, tabs/markdown/config, store/preferences, i18n.
//   LINKS: .grace/changes/archive/C-38 T-004; docs/design/settings-ia-2026-10-15.md §3.4; .grace/graph/runtime.xml M-011; .grace/verification/runtime.xml V-M-011.
//   ROLE: RUNTIME
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   onSelectChange - SET_SINGLE_PREFERENCE bridge shared by every row.
//   listSpacing / onListSpacingChange - preferLooseListItem mapped to the IA Compact/Spaced segmented values (stored boolean unchanged).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-10-15 v2.0.0: C-38 T-004 — real Markdown tab: the old page's jargon rows are rewritten per the IA; the dead preferHeadingStyle row is gone (IA §4.1); the one-row Diagnostics group folds into Compatibility; mathEnabled and frontmatterProperties join the schema-backed search index (schema.json).
//   - (v1.x: C-38 T-003 interim wrapper stacking the old page — retired.)
// END_CHANGE_SUMMARY

import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { usePreferencesStore } from '@/store/preferences'
import Compound from '@/prefComponents/common/compound/index.vue'
import Bool from '@/prefComponents/common/bool/index.vue'
import CurSelect from '@/prefComponents/common/select/index.vue'
import Segmented from '@/prefComponents/common/segmented/index.vue'
import {
  bulletListMarkerOptions,
  getOrderListDelimiterOptions,
  getListIndentationOptions,
  getFrontmatterTypeOptions,
  getSequenceThemeOptions
} from './config'

const { t } = useI18n()
const preferenceStore = usePreferencesStore()

const {
  preferLooseListItem,
  bulletListMarker,
  orderListDelimiter,
  listIndentation,
  footnote,
  mathEnabled,
  superSubScript,
  frontmatterType,
  frontmatterProperties,
  isHtmlEnabled,
  isGitlabCompatibilityEnabled,
  sequenceTheme
} = storeToRefs(preferenceStore)

const onSelectChange = (type, value) => {
  preferenceStore.SET_SINGLE_PREFERENCE({ type, value })
}

// START_BLOCK_LIST_SPACING
// IA §3.4: "Spacing between list items" — Compact = preferLooseListItem
// false, Spaced = true; the stored key keeps its CommonMark semantics.
const listSpacing = computed(() => (preferLooseListItem.value ? 'spaced' : 'compact'))

// Computed: labels must follow a language switch (review fix).
const listSpacingOptions = computed(() => [
  { label: t('preferences.markdown.lists.spacingCompact'), value: 'compact' },
  { label: t('preferences.markdown.lists.spacingSpaced'), value: 'spaced' }
])

const onListSpacingChange = (value) => {
  onSelectChange('preferLooseListItem', value === 'spaced')
}
// END_BLOCK_LIST_SPACING
</script>
