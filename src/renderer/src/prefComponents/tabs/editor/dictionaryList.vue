<template>
  <!-- START_BLOCK_DICTIONARY_LIST -->
  <div class="pref-dictionary">
    <div class="pref-dictionary-head">
      <span class="pref-dictionary-title">{{ t('preferences.editor.spelling.customDictionary.title') }}</span>
    </div>
    <div class="pref-dictionary-list">
      <div v-if="words.length === 0" class="pref-dictionary-empty">
        {{ t('preferences.editor.spelling.customDictionary.noWordsAvailable') }}
      </div>
      <div v-for="word in words" :key="word" class="pref-dictionary-row">
        <span class="pref-dictionary-word">{{ word }}</span>
        <button
          type="button"
          class="pref-dictionary-remove"
          :aria-label="t('preferences.editor.spelling.customDictionary.delete')"
          :title="t('preferences.editor.spelling.customDictionary.delete')"
          @click="removeWord(word)"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" stroke-width="1.3" />
          </svg>
        </button>
      </div>
    </div>
  </div>
  <!-- END_BLOCK_DICTIONARY_LIST -->
</template>

<script setup>
// FILE: src/renderer/src/prefComponents/tabs/editor/dictionaryList.vue
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Custom spellchecking dictionary list under the Editor › Spelling group (C-38 T-004) — words from mt_spell_get_custom_dictionary_words with a per-word remove action.
//   SCOPE: List rendering, backend word loading (guarded — the custom-dictionary backend may not exist yet), removal via mt_spell_remove_word.
//   DEPENDS: @tauri-apps/api/core (invoke), services/notification, vue-i18n.
//   LINKS: .grace/changes/active/C-38 T-004; retired prefComponents/spellchecker (same commands, new anatomy); .grace/graph/runtime.xml M-011.
//   ROLE: RUNTIME
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   words - custom-dictionary words loaded on mount (empty until the backend answers).
//   loadWords - mt_spell_get_custom_dictionary_words; a missing command logs a warning instead of throwing (F-SPELL-HUNSPELL-EMBED gate, carried over from the retired page).
//   removeWord - mt_spell_remove_word + local list update; failures notify.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v1.0.0 - 2026-10-15 C-38 T-004: replaces the retired spellchecker page's el-table with a Settings-styled list; commands and failure behaviour unchanged.]
// END_CHANGE_SUMMARY

import { ref, onMounted } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { useI18n } from 'vue-i18n'
import notice from '@/services/notification'

const { t } = useI18n()

const words = ref([])

const loadWords = async () => {
  // Custom dictionary backend is not yet implemented
  // (F-SPELL-HUNSPELL-EMBED). Call is gated behind try/catch so a
  // missing command logs a warning instead of throwing.
  try {
    const result = await invoke('mt_spell_get_custom_dictionary_words')
    if (Array.isArray(result)) {
      words.value = result.filter((w) => typeof w === 'string')
    }
  } catch (e) {
    console.warn('[spellchecker] custom-dictionary words not yet implemented (F-SPELL-HUNSPELL-EMBED)', e)
  }
}

const removeWord = (word) => {
  invoke('mt_spell_remove_word', { word })
    .then((success) => {
      if (success) {
        words.value = words.value.filter((w) => w !== word)
      } else {
        notice.notify({
          title: t('spellchecker.failedToRemoveWord'),
          type: 'error',
          message: t('spellchecker.unexpectedError')
        })
      }
    })
    .catch((error) => console.error('[dictionaryList][removeWord][BLOCK_REMOVE_WORD_FAILED]', error))
}

onMounted(loadWords)
</script>

<style>
/* START_BLOCK_DICTIONARY_METRICS */
/* A hairline-separated list inside the group card: word left, small
   remove affordance right; palette from the Settings shell. */
.pref-dictionary {
  display: flex;
  flex-direction: column;
}

.pref-dictionary .pref-dictionary-head {
  padding: 8px 14px 2px;
}

.pref-dictionary .pref-dictionary-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--prefText, #1d1d1f);
}

.pref-dictionary .pref-dictionary-list {
  display: flex;
  flex-direction: column;
  margin: 6px 14px 12px;
  border: 0.5px solid var(--prefLine, rgba(0, 0, 0, 0.08));
  border-radius: 6px;
  background: var(--prefCtrl, #ffffff);
  max-height: 180px;
  overflow-y: auto;
}

.pref-dictionary .pref-dictionary-list > * + * {
  border-top: 0.5px solid var(--prefLine, rgba(0, 0, 0, 0.08));
}

.pref-dictionary .pref-dictionary-empty {
  padding: 10px 12px;
  font-size: 12px;
  color: var(--prefSub, #6b6b70);
}

.pref-dictionary .pref-dictionary-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 4px 6px 4px 12px;
  font-size: 13px;
  color: var(--prefText, #1d1d1f);
}

.pref-dictionary .pref-dictionary-remove {
  all: unset;
  cursor: default;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 4px;
  color: var(--prefSub, #6b6b70);
}

.pref-dictionary .pref-dictionary-remove:hover {
  background: var(--prefTabOn, rgba(0, 0, 0, 0.07));
  color: #c4271b;
}
/* END_BLOCK_DICTIONARY_METRICS */
</style>
