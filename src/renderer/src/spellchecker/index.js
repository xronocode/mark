import { isOsx } from '@/util'
import { invoke } from '@tauri-apps/api/core'

/**
 * High level spell checker API. Path B-clean W8: backend Rust commands
 * (m007_spell.rs::mt_spell_set_enabled / mt_spell_set_lang) are
 * called via direct @tauri-apps/api/core invoke; the v1 Electron
 * spellChecker IPC compat layer has been removed.
 *
 * On macOS the OS-level NSSpellChecker handles language detection;
 * the Rust side just persists the enable flag. On Linux/Windows the
 * full Hunspell flow is deferred per F-SPELL-HUNSPELL-EMBED — the
 * dictionary-listing + word-removal commands below are NEW backend
 * surfaces that don't yet exist, so calls degrade to empty defaults.
 */
export class SpellChecker {
  /**
   * @param {boolean} enabled Whether spell checking is enabled in settings.
   * @param {string} lang Initial language code.
   */
  constructor(enabled = true, lang) {
    this.enabled = enabled
    this.currentSpellcheckerLanguage = lang
    this.isProviderAvailable = true
  }

  get isEnabled() {
    return this.isProviderAvailable && this.enabled
  }

  /**
   * Enable the spell checker and set `lang` (or detect on macOS).
   * Returns a boolean indicating success.
   */
  async activateSpellchecker(lang) {
    try {
      this.enabled = true
      this.isProviderAvailable = true
      if (isOsx) {
        await invoke('mt_spell_set_enabled', { enabled: true })
        return true
      }
      return await this.switchLanguage(lang || this.currentSpellcheckerLanguage)
    } catch (error) {
      this.deactivateSpellchecker()
      throw error
    }
  }

  deactivateSpellchecker() {
    this.enabled = false
    this.isProviderAvailable = false
    invoke('mt_spell_set_enabled', { enabled: false }).catch((e) => {
      console.warn('[spellchecker] deactivate invoke failed', e)
    })
  }

  get lang() {
    return this.isEnabled ? this.currentSpellcheckerLanguage : ''
  }

  set lang(lang) {
    this.currentSpellcheckerLanguage = lang
  }

  /**
   * Switch language. macOS auto-detects; Linux/Windows fail without
   * F-SPELL-HUNSPELL-EMBED. NOTE: can throw.
   */
  async switchLanguage(lang) {
    if (isOsx) {
      return true
    } else if (!lang) {
      throw new Error('Expected non-empty language for spell checker.')
    } else if (this.isEnabled) {
      await invoke('mt_spell_set_lang', { lang })
      this.lang = lang
      return true
    }
    return false
  }

  /**
   * Returns available dictionaries. macOS returns empty (OS handles).
   * Linux/Windows: deferred to F-SPELL-HUNSPELL-EMBED — currently
   * empty array as well.
   */
  static async getAvailableDictionaries() {
    if (isOsx) {
      return []
    }
    try {
      return await invoke('mt_spell_get_available_dictionaries')
    } catch (e) {
      console.warn('[spellchecker] available dicts not yet implemented (F-SPELL-HUNSPELL-EMBED)', e)
      return []
    }
  }
}
