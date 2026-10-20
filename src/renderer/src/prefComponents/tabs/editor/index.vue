<template>
  <div class="pref-tab-page pref-tab-page--editor">
    <!-- START_BLOCK_EDITOR_TYPING -->
    <compound>
      <template #head>
        <h6 class="title">{{ t('preferences.editor.typing.title') }}</h6>
      </template>
      <template #children>
        <bool
          :description="t('preferences.editor.typing.autoPairBracket')"
          :bool="autoPairBracket"
          :on-change="(value) => onSelectChange('autoPairBracket', value)"
        ></bool>
        <bool
          :description="t('preferences.editor.typing.autoPairQuote')"
          :bool="autoPairQuote"
          :on-change="(value) => onSelectChange('autoPairQuote', value)"
        ></bool>
        <bool
          :description="t('preferences.editor.typing.autoPairMarkdownSyntax')"
          :help="t('preferences.editor.typing.autoPairMarkdownSyntaxHelp')"
          :bool="autoPairMarkdownSyntax"
          :on-change="(value) => onSelectChange('autoPairMarkdownSyntax', value)"
        ></bool>
        <bool
          :description="t('preferences.editor.typing.autoCheck')"
          :help="t('preferences.editor.typing.autoCheckHelp')"
          :bool="autoCheck"
          :on-change="(value) => onSelectChange('autoCheck', value)"
        ></bool>
        <bool
          :description="t('preferences.editor.typing.hideQuickInsertHint')"
          :help="t('preferences.editor.typing.hideQuickInsertHintHelp')"
          :bool="hideQuickInsertHint"
          :on-change="(value) => onSelectChange('hideQuickInsertHint', value)"
        ></bool>
        <bool
          :description="t('preferences.editor.typing.hideLinkPopup')"
          :help="t('preferences.editor.typing.hideLinkPopupHelp')"
          :bool="hideLinkPopup"
          :on-change="(value) => onSelectChange('hideLinkPopup', value)"
        ></bool>
        <cur-select
          :description="t('preferences.editor.typing.textDirection')"
          :value="textDirection"
          :options="getTextDirectionOptions()"
          :on-change="(value) => onSelectChange('textDirection', value)"
        ></cur-select>
      </template>
    </compound>
    <!-- END_BLOCK_EDITOR_TYPING -->

    <!-- START_BLOCK_EDITOR_TABS -->
    <compound>
      <template #head>
        <h6 class="title">{{ t('preferences.editor.tabs.title') }}</h6>
      </template>
      <template #children>
        <range
          :description="t('preferences.editor.tabs.tabSize')"
          :help="t('preferences.editor.tabs.tabSizeHelp')"
          :value="tabSize"
          :min="1"
          :max="4"
          :step="1"
          :on-change="(value) => onSelectChange('tabSize', value)"
        ></range>
      </template>
    </compound>
    <!-- END_BLOCK_EDITOR_TABS -->

    <!-- START_BLOCK_EDITOR_SPELLING -->
    <compound>
      <template #head>
        <h6 class="title">{{ t('preferences.editor.spelling.title') }}</h6>
      </template>
      <template #children>
        <bool
          :description="t('preferences.editor.spelling.enabled')"
          :bool="spellcheckerEnabled"
          :on-change="handleSpellcheckerEnabled"
        ></bool>
        <!-- IA §3.3: inverted control — the switch reads "Underline
             misspelled words" while the stored key keeps its
             spellcheckerNoUnderline semantics. -->
        <bool
          :description="t('preferences.editor.spelling.underline')"
          :help="isOsx && spellcheckerEnabled ? t('preferences.editor.spelling.macAutoDetectHelp') : ''"
          :bool="!spellcheckerNoUnderline"
          :disable="!spellcheckerEnabled"
          :on-change="onUnderlineChange"
        ></bool>
        <!-- IA §5 bug 8: the macOS fake "Auto detect language" switch is
             gone — the system detects the language and the help line on
             the row above says so. Non-macOS keeps the real pop-up. -->
        <cur-select
          v-if="!isOsx"
          :description="t('preferences.editor.spelling.language')"
          :value="spellcheckerLanguage"
          :options="availableDictionaries"
          :disable="!spellcheckerEnabled"
          :on-change="handleSpellcheckerLanguage"
        ></cur-select>
        <dictionary-list v-if="showDictionary" />
      </template>
    </compound>
    <!-- END_BLOCK_EDITOR_SPELLING -->

    <!-- START_BLOCK_EDITOR_CODE_BLOCKS -->
    <compound>
      <template #head>
        <h6 class="title">{{ t('preferences.editor.codeBlocks.title') }}</h6>
      </template>
      <template #children>
        <font-text-box
          :description="t('preferences.editor.codeBlocks.fontFamily')"
          :only-monospace="true"
          :value="codeFontFamily"
          :on-change="(value) => onSelectChange('codeFontFamily', value)"
        ></font-text-box>
        <range
          :description="t('preferences.editor.codeBlocks.fontSize')"
          :value="codeFontSize"
          :min="12"
          :max="28"
          :step="1"
          unit="px"
          :on-change="(value) => onSelectChange('codeFontSize', value)"
        ></range>
        <bool
          :description="t('preferences.editor.codeBlocks.lineNumbers')"
          :bool="codeBlockLineNumbers"
          :on-change="(value) => onSelectChange('codeBlockLineNumbers', value)"
        ></bool>
        <bool
          :description="t('preferences.editor.codeBlocks.wrapLongLines')"
          :bool="wrapCodeBlocks"
          :on-change="(value) => onSelectChange('wrapCodeBlocks', value)"
        ></bool>
        <bool
          :description="t('preferences.editor.codeBlocks.trimBlankLines')"
          :help="t('preferences.editor.codeBlocks.trimBlankLinesHelp')"
          :bool="trimUnnecessaryCodeBlockEmptyLines"
          :on-change="(value) => onSelectChange('trimUnnecessaryCodeBlockEmptyLines', value)"
        ></bool>
      </template>
    </compound>
    <!-- END_BLOCK_EDITOR_CODE_BLOCKS -->
  </div>
</template>

<script setup>
// FILE: src/renderer/src/prefComponents/tabs/editor/index.vue
// VERSION: 2.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Editor tab of the C-38 Settings window — Typing, Tabs and indentation, Spelling (with the custom dictionary on non-macOS) and Code blocks groups per the N2 IA §3.3.
//   SCOPE: Row composition; inverted spellcheckerNoUnderline control; macOS vs non-macOS spelling rows; dictionary/language loading through the spellchecker shims.
//   DEPENDS: prefComponents/common/{compound,bool,select,range,fontTextBox}, tabs/editor/dictionaryList, tabs/editor/config, store/preferences, @/spellchecker (+languageMap), @tauri-apps/api/core (mt_spell_set_lang), util (isOsx), i18n.
//   LINKS: .grace/changes/archive/C-38 T-004; docs/design/settings-ia-2026-10-15.md §3.3; .grace/graph/runtime.xml M-011; .grace/verification/runtime.xml V-M-011.
//   ROLE: RUNTIME
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   onSelectChange - SET_SINGLE_PREFERENCE bridge shared by every row.
//   onUnderlineChange - the "Underline misspelled words" switch writes the inverted spellcheckerNoUnderline value (key semantics unchanged).
//   handleSpellcheckerEnabled / handleSpellcheckerLanguage - spelling toggles; the language also pushes mt_spell_set_lang (non-macOS).
//   availableDictionaries / dictionarySupported / showDictionary - SpellChecker.getAvailableDictionaries on mount (non-macOS only); the custom dictionary list shows when the backend reports words support.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-10-15 v2.0.0: C-38 T-004 — real Editor tab: the old Editor + Spellchecker pages are retired (dead file-representation rows dropped per IA §4.1; text typography moved to Appearance; encoding/line endings to General); codeBlockLineNumbers is a visible switch (T-005 fixed #1648); the fake macOS auto-detect switch is gone; the custom dictionary list is Settings-styled.
//   - (v1.x: C-38 T-003 interim wrapper stacking the old pages — retired.)
// END_CHANGE_SUMMARY

import { ref, computed, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { invoke } from '@tauri-apps/api/core'
import { usePreferencesStore } from '@/store/preferences'
import Compound from '@/prefComponents/common/compound/index.vue'
import Bool from '@/prefComponents/common/bool/index.vue'
import CurSelect from '@/prefComponents/common/select/index.vue'
import Range from '@/prefComponents/common/range/index.vue'
import FontTextBox from '@/prefComponents/common/fontTextBox/index.vue'
import DictionaryList from './dictionaryList.vue'
import { getTextDirectionOptions } from './config'
import { isOsx } from '@/util'
import { SpellChecker } from '@/spellchecker'
import { getLanguageName } from '@/spellchecker/languageMap'

const { t } = useI18n()
const preferenceStore = usePreferencesStore()

const {
  autoPairBracket,
  autoPairQuote,
  autoPairMarkdownSyntax,
  autoCheck,
  hideQuickInsertHint,
  hideLinkPopup,
  textDirection,
  tabSize,
  spellcheckerEnabled,
  spellcheckerNoUnderline,
  spellcheckerLanguage,
  codeFontFamily,
  codeFontSize,
  codeBlockLineNumbers,
  wrapCodeBlocks,
  trimUnnecessaryCodeBlockEmptyLines
} = storeToRefs(preferenceStore)

const onSelectChange = (type, value) => {
  preferenceStore.SET_SINGLE_PREFERENCE({ type, value })
}

// IA §3.3: positive label, inverted control — on = underline (stored
// spellcheckerNoUnderline false).
const onUnderlineChange = (value) => {
  onSelectChange('spellcheckerNoUnderline', !value)
}

const handleSpellcheckerEnabled = (isEnabled) => {
  onSelectChange('spellcheckerEnabled', isEnabled)
}

// START_BLOCK_SPELLCHECKER_LANGUAGE
// Non-macOS: the dictionary list comes from the spellchecker backend and
// the pick also pushes mt_spell_set_lang (same behaviour the retired
// page had). macOS never mounts this path — the system detects the
// document language (help line on the underline row).
const availableDictionaries = ref([])
const dictionarySupported = ref(false)

const showDictionary = computed(() => !isOsx && spellcheckerEnabled.value && dictionarySupported.value)

const handleSpellcheckerLanguage = async (languageCode) => {
  onSelectChange('spellcheckerLanguage', languageCode)
  try {
    await invoke('mt_spell_set_lang', { lang: languageCode })
  } catch (e) {
    console.warn('[spellchecker] set-lang failed', e)
  }
}

const loadDictionaries = async () => {
  try {
    const dictionaries = await SpellChecker.getAvailableDictionaries()
    availableDictionaries.value = dictionaries.map((code) => ({
      value: code,
      label: getLanguageName(code)
    }))
    dictionarySupported.value = availableDictionaries.value.length > 0
  } catch (e) {
    console.warn('[spellchecker] dictionaries unavailable', e)
  }
}
// END_BLOCK_SPELLCHECKER_LANGUAGE

onMounted(() => {
  if (!isOsx) {
    loadDictionaries()
  }
})
</script>
