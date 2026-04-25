<template>
  <div class="pref-language">
    <h4>{{ t('preferences.language.title') }}</h4>
    <compound>
      <template #head>
        <h6 class="title">{{ t('preferences.language.uiLanguage.title') }}</h6>
      </template>
      <template #children>
        <cur-select
          :description="t('preferences.language.uiLanguage.description')"
          :value="language"
          :options="getLanguageOptions()"
          :on-change="(value) => onSelectChange('language', value)"
        ></cur-select>
      </template>
    </compound>
  </div>
</template>

<script setup>
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { usePreferencesStore } from '@/store/preferences'
import Compound from '../common/compound/index.vue'
import CurSelect from '../common/select/index.vue'
import { getLanguageOptions } from '../general/config'

const { t } = useI18n()
const preferenceStore = usePreferencesStore()
const { language } = storeToRefs(preferenceStore)

const onSelectChange = (type, value) => {
  preferenceStore.SET_SINGLE_PREFERENCE({ type, value })
}
</script>
