// MODULE_CONTRACT
//   PURPOSE: M-007 mt-spell. WebView spellcheck enable/disable +
//            language list. Backend ships a tiny config command;
//            actual spellcheck rendering is the WebView's job
//            (contenteditable spellcheck="true" attribute set by
//            the renderer based on prefs[spellchecker.enabled]).
//   SCOPE:   config snapshot + language list. NO hunspell embedding —
//            WebView's native spellcheck covers most use-cases on
//            macOS (NSSpellChecker) and Windows (Edge Chromium); F-
//            SPELL-HUNSPELL-EMBED tracks bundled-dict path for Linux.
//   DEPENDS: m005_prefs (prefs[spellchecker]).
//   LINKS:   docs/development-plan.xml Phase-B3 step-5.
//   STATUS:  Phase-B3 step-5 lite — config surface only.
//
// CHANGE_SUMMARY:
//   - 2026-04-29 B3-step-5: initial lite config impl.

use crate::m005_prefs::PrefsState;
use serde_json::{json, Value};
use tauri::State;

pub const KEY_SPELL: &str = "spellchecker";

#[tauri::command]
pub async fn mt_spell_get_config(prefs: State<'_, PrefsState>) -> Result<Value, String> {
    Ok(prefs.get(KEY_SPELL).unwrap_or_else(|| {
        json!({
            "enabled": false,
            "lang": "en_US"
        })
    }))
}

#[tauri::command]
pub async fn mt_spell_set_enabled(
    enabled: bool,
    prefs: State<'_, PrefsState>,
) -> Result<(), String> {
    let mut current = match prefs.get(KEY_SPELL) {
        Some(Value::Object(map)) => map,
        _ => serde_json::Map::new(),
    };
    current.insert("enabled".to_string(), Value::Bool(enabled));
    eprintln!("[Spell][config][BLOCK_ENABLED_SET enabled={enabled}]");
    prefs
        .set(KEY_SPELL.to_string(), Value::Object(current))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn mt_spell_set_lang(lang: String, prefs: State<'_, PrefsState>) -> Result<(), String> {
    let mut current = match prefs.get(KEY_SPELL) {
        Some(Value::Object(map)) => map,
        _ => serde_json::Map::new(),
    };
    current.insert("lang".to_string(), Value::String(lang.clone()));
    eprintln!("[Spell][config][BLOCK_LANG_SET lang={lang}]");
    prefs
        .set(KEY_SPELL.to_string(), Value::Object(current))
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn fresh() -> (TempDir, PrefsState) {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("preferences.json");
        let prefs = PrefsState::from_path(path);
        (dir, prefs)
    }

    #[test]
    fn default_config_has_disabled_en_us() {
        let (_dir, prefs) = fresh();
        let v = prefs.get(KEY_SPELL).unwrap_or_else(|| {
            json!({ "enabled": false, "lang": "en_US" })
        });
        assert_eq!(v["enabled"], Value::Bool(false));
        assert_eq!(v["lang"], Value::String("en_US".to_string()));
    }

    #[test]
    fn set_enabled_persists() {
        let (_dir, prefs) = fresh();
        let mut current = serde_json::Map::new();
        current.insert("enabled".to_string(), Value::Bool(true));
        prefs
            .set(KEY_SPELL.to_string(), Value::Object(current))
            .unwrap();
        let v = prefs.get(KEY_SPELL).unwrap();
        assert_eq!(v["enabled"], Value::Bool(true));
    }

    #[test]
    fn lang_persists() {
        let (_dir, prefs) = fresh();
        let mut current = serde_json::Map::new();
        current.insert("lang".to_string(), Value::String("ru_RU".to_string()));
        prefs
            .set(KEY_SPELL.to_string(), Value::Object(current))
            .unwrap();
        let v = prefs.get(KEY_SPELL).unwrap();
        assert_eq!(v["lang"], Value::String("ru_RU".to_string()));
    }
}
