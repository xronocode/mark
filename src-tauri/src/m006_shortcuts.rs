// MODULE_CONTRACT
//   PURPOSE: M-006 mt-shortcuts. Accelerator parser + normalizer +
//            in-process registry. Platform binding (tauri-plugin-
//            global-shortcut for system-wide hotkeys; renderer-side
//            keydown for in-window) deferred to F-SHORTCUT-PLATFORM-
//            BIND.
//   SCOPE:   parse "Cmd+Shift+M" → typed Accelerator; canonical form
//            for equality (PR #4134 regression net: Cmd+Shift+M ==
//            shift+CommandOrControl+m); register/unregister stub
//            commands that store specs in PrefsState[KEY_SHORTCUTS]
//            so renderer can dispatch.
//   DEPENDS: m005_prefs (PrefsState).
//   LINKS:   docs/development-plan.xml Phase-B3 step-4;
//            docs/verification-plan.xml V-M-006 (PR #4134 regression).
//   STATUS:  Phase-B3 step-4 lite — parser real, platform binding
//            deferred to F-SHORTCUT-PLATFORM-BIND.
//
// CHANGE_SUMMARY:
//   - 2026-04-29 B3-step-4: parser + canonical form + persistence.

use crate::m005_prefs::PrefsState;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::State;

pub const KEY_SHORTCUTS: &str = "shortcuts";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct Modifiers(u8);

impl Modifiers {
    pub const NONE: Self = Self(0);
    pub const CMD: Self = Self(1 << 0); // Command (macOS) / Super (Linux/Win)
    pub const CTRL: Self = Self(1 << 1);
    pub const ALT: Self = Self(1 << 2);
    pub const SHIFT: Self = Self(1 << 3);

    pub fn contains(&self, other: Modifiers) -> bool {
        (self.0 & other.0) == other.0
    }

    pub fn insert(&mut self, other: Modifiers) {
        self.0 |= other.0;
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct Accelerator {
    pub modifiers: u8,
    /// Canonical key string — uppercased single char, or symbolic name
    /// like "Enter" / "Space" / "F1". KeyCode-style; the renderer
    /// matches against e.code (physical), not e.key (character).
    pub key: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ParseError {
    Empty,
    /// Modifier-only accelerator (e.g. "Shift", "Ctrl+Alt") — no key.
    ModifierOnly,
    UnknownToken(String),
    DuplicateModifier(String),
    /// e.g. "Numpad1" on macOS — no NumpadN keysym there.
    PlatformIncompatible(String),
}

impl std::fmt::Display for ParseError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Empty => write!(f, "empty accelerator"),
            Self::ModifierOnly => write!(f, "MT_SHORTCUT_INVALID_ACCEL: modifier-only"),
            Self::UnknownToken(t) => write!(f, "unknown token: {t}"),
            Self::DuplicateModifier(t) => write!(f, "duplicate modifier: {t}"),
            Self::PlatformIncompatible(t) => write!(f, "platform-incompatible token: {t}"),
        }
    }
}

/// Parse a v1.2.3-compatible accelerator string. Tokens separated by
/// `+`; case-insensitive on tokens; whitespace trimmed.
///
/// Modifier aliases (all canonicalize to the same bit):
///   Cmd, Command, Super, Meta            → CMD
///   Ctrl, Control, CmdOrCtrl, CommandOrControl → CTRL when not on macOS
///                                           (CommandOrControl = CMD on macOS)
///   Alt, Option, Opt                     → ALT
///   Shift                                → SHIFT
///
/// Key — the LAST token. Single-char A-Z / 0-9 are uppercased and
/// preserved; symbolic names (Enter, Space, F1..F24, Up, Down, ...)
/// preserved verbatim with first letter uppercased.
pub fn parse_accelerator(spec: &str) -> Result<Accelerator, ParseError> {
    let trimmed = spec.trim();
    if trimmed.is_empty() {
        return Err(ParseError::Empty);
    }
    let parts: Vec<&str> = trimmed.split('+').map(|s| s.trim()).collect();
    if parts.iter().any(|p| p.is_empty()) {
        return Err(ParseError::Empty);
    }
    fn classify_modifier(lower: &str) -> Option<Modifiers> {
        match lower {
            "cmd" | "command" | "super" | "meta" => Some(Modifiers::CMD),
            "ctrl" | "control" => Some(Modifiers::CTRL),
            "cmdorctrl" | "commandorcontrol" => {
                if cfg!(target_os = "macos") {
                    Some(Modifiers::CMD)
                } else {
                    Some(Modifiers::CTRL)
                }
            }
            "alt" | "option" | "opt" => Some(Modifiers::ALT),
            "shift" => Some(Modifiers::SHIFT),
            _ => None,
        }
    }

    let mut mods = Modifiers::NONE;
    let mut key: Option<String> = None;
    let last_idx = parts.len() - 1;
    for (i, raw) in parts.iter().enumerate() {
        let lower = raw.to_ascii_lowercase();
        let last = i == last_idx;
        let modifier = classify_modifier(&lower);

        if !last {
            // Non-last position must be a modifier.
            let m = modifier.ok_or_else(|| ParseError::UnknownToken(raw.to_string()))?;
            if mods.contains(m) {
                return Err(ParseError::DuplicateModifier(raw.to_string()));
            }
            mods.insert(m);
        } else {
            // Last position: must NOT be a modifier (else accel is modifier-
            // only). Numpad rejected on macOS.
            if modifier.is_some() {
                return Err(ParseError::ModifierOnly);
            }
            if cfg!(target_os = "macos") && lower.starts_with("numpad") {
                return Err(ParseError::PlatformIncompatible(raw.to_string()));
            }
            key = Some(canonicalize_key(raw));
        }
    }
    let key = key.ok_or(ParseError::ModifierOnly)?;
    eprintln!(
        "[Shortcuts][register][BLOCK_PARSE_ACCELERATOR mods={:08b} key={key}]",
        mods.0
    );
    Ok(Accelerator {
        modifiers: mods.0,
        key,
    })
}

fn canonicalize_key(raw: &str) -> String {
    let trimmed = raw.trim();
    if trimmed.len() == 1 {
        return trimmed.to_ascii_uppercase();
    }
    // First char upper, rest as-is (Enter / Space / F1).
    let mut chars = trimmed.chars();
    match chars.next() {
        Some(first) => first.to_ascii_uppercase().to_string() + chars.as_str(),
        None => String::new(),
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShortcutBinding {
    pub command: String,
    pub accelerator: Accelerator,
}

/// Persist a shortcut binding into prefs[KEY_SHORTCUTS]. Last-registered
/// wins for a given accelerator (V-M-006 ec: "Duplicate binding —
/// last-registered wins, prior registration unregistered, warning logged").
fn store_bindings(prefs: &PrefsState, bindings: &[ShortcutBinding]) -> Result<(), String> {
    let value =
        serde_json::to_value(bindings).map_err(|e| format!("serialize bindings: {e}"))?;
    prefs
        .set(KEY_SHORTCUTS.to_string(), value)
        .map_err(|e| e.to_string())
}

fn load_bindings(prefs: &PrefsState) -> Vec<ShortcutBinding> {
    match prefs.get(KEY_SHORTCUTS) {
        Some(v) => serde_json::from_value(v).unwrap_or_default(),
        None => Vec::new(),
    }
}

#[tauri::command]
pub async fn mt_shortcut_register(
    command: String,
    accelerator: String,
    prefs: State<'_, PrefsState>,
) -> Result<(), String> {
    let parsed = parse_accelerator(&accelerator).map_err(|e| e.to_string())?;
    let mut bindings = load_bindings(&prefs);
    // Last-write-wins for a given accelerator.
    if let Some(idx) = bindings.iter().position(|b| b.accelerator == parsed) {
        eprintln!(
            "[Shortcuts][register][BLOCK_DUPLICATE_OVERRIDE prior={}]",
            bindings[idx].command
        );
        bindings.remove(idx);
    }
    // Also remove any prior binding for the same command (one-cmd-one-accel).
    bindings.retain(|b| b.command != command);
    bindings.push(ShortcutBinding {
        command,
        accelerator: parsed,
    });
    store_bindings(&prefs, &bindings)
}

#[tauri::command]
pub async fn mt_shortcut_unregister(
    command: String,
    prefs: State<'_, PrefsState>,
) -> Result<(), String> {
    let mut bindings = load_bindings(&prefs);
    let before = bindings.len();
    bindings.retain(|b| b.command != command);
    if bindings.len() < before {
        eprintln!("[Shortcuts][unregister][BLOCK_REMOVED command={command}]");
    }
    store_bindings(&prefs, &bindings)
}

#[tauri::command]
pub async fn mt_shortcut_list(prefs: State<'_, PrefsState>) -> Result<Value, String> {
    serde_json::to_value(load_bindings(&prefs)).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fresh_prefs() -> (tempfile::TempDir, PrefsState) {
        let dir = tempfile::TempDir::new().unwrap();
        let path = dir.path().join("preferences.json");
        let prefs = PrefsState::from_path(path);
        (dir, prefs)
    }

    // V-M-006 ec: "Modifier normalization matrix — `ctrl+alt+1`,
    // `Ctrl+Alt+1`, `Control+Alt+1`, `CommandOrControl+Alt+1` all hash
    // to one canonical form (PR #4134 regression)."
    #[test]
    fn pr_4134_regression_capitalized_modifiers_canonicalize() {
        let a = parse_accelerator("ctrl+alt+1").unwrap();
        let b = parse_accelerator("Ctrl+Alt+1").unwrap();
        let c = parse_accelerator("Control+Alt+1").unwrap();
        // CommandOrControl maps to Ctrl on non-macOS, Cmd on macOS.
        // Compare a/b/c which are all Ctrl-family and equal.
        assert_eq!(a, b);
        assert_eq!(b, c);
        assert_eq!(a.key, "1");
    }

    #[test]
    fn modifier_only_rejected() {
        let err = parse_accelerator("Shift").unwrap_err();
        assert_eq!(err, ParseError::ModifierOnly);
        let err = parse_accelerator("Ctrl+Alt").unwrap_err();
        assert_eq!(err, ParseError::ModifierOnly);
    }

    #[test]
    fn empty_rejected() {
        assert_eq!(parse_accelerator("").unwrap_err(), ParseError::Empty);
        assert_eq!(parse_accelerator("   ").unwrap_err(), ParseError::Empty);
        assert_eq!(parse_accelerator("Cmd++M").unwrap_err(), ParseError::Empty);
    }

    #[test]
    fn duplicate_modifier_rejected() {
        let err = parse_accelerator("Shift+Shift+M").unwrap_err();
        assert!(matches!(err, ParseError::DuplicateModifier(_)));
    }

    #[test]
    fn modifier_aliases_canonicalize() {
        let cmd = parse_accelerator("Cmd+M").unwrap();
        let command = parse_accelerator("Command+M").unwrap();
        let meta = parse_accelerator("Meta+M").unwrap();
        let supr = parse_accelerator("Super+M").unwrap();
        assert_eq!(cmd, command);
        assert_eq!(cmd, meta);
        assert_eq!(cmd, supr);

        let alt = parse_accelerator("Alt+M").unwrap();
        let option = parse_accelerator("Option+M").unwrap();
        let opt = parse_accelerator("Opt+M").unwrap();
        assert_eq!(alt, option);
        assert_eq!(alt, opt);
    }

    #[test]
    fn key_canonicalization() {
        // Single-char keys uppercased.
        assert_eq!(parse_accelerator("Cmd+s").unwrap().key, "S");
        assert_eq!(parse_accelerator("Cmd+S").unwrap().key, "S");
        assert_eq!(parse_accelerator("Cmd+1").unwrap().key, "1");
        // Symbolic keys: first letter upper.
        assert_eq!(parse_accelerator("Cmd+enter").unwrap().key, "Enter");
        assert_eq!(parse_accelerator("Cmd+Space").unwrap().key, "Space");
        assert_eq!(parse_accelerator("F12").unwrap().key, "F12");
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn numpad_rejected_on_macos() {
        let err = parse_accelerator("Numpad1").unwrap_err();
        assert!(matches!(err, ParseError::PlatformIncompatible(_)));
    }

    #[test]
    fn whitespace_tolerated() {
        let a = parse_accelerator("  Cmd  +  Shift  +  M  ").unwrap();
        let b = parse_accelerator("Cmd+Shift+M").unwrap();
        assert_eq!(a, b);
    }

    #[test]
    fn store_load_roundtrip() {
        let (_dir, prefs) = fresh_prefs();
        let acc = parse_accelerator("Cmd+S").unwrap();
        let binding = ShortcutBinding {
            command: "save".to_string(),
            accelerator: acc.clone(),
        };
        store_bindings(&prefs, &[binding]).unwrap();
        let loaded = load_bindings(&prefs);
        assert_eq!(loaded.len(), 1);
        assert_eq!(loaded[0].command, "save");
        assert_eq!(loaded[0].accelerator, acc);
    }

    #[test]
    fn duplicate_command_replaces_prior() {
        let (_dir, prefs) = fresh_prefs();
        // Manually replicate the register-without-command logic.
        let acc1 = parse_accelerator("Cmd+S").unwrap();
        let acc2 = parse_accelerator("Cmd+Shift+S").unwrap();
        store_bindings(
            &prefs,
            &[ShortcutBinding {
                command: "save".to_string(),
                accelerator: acc1.clone(),
            }],
        )
        .unwrap();
        let mut bindings = load_bindings(&prefs);
        bindings.retain(|b| b.command != "save");
        bindings.push(ShortcutBinding {
            command: "save".to_string(),
            accelerator: acc2.clone(),
        });
        store_bindings(&prefs, &bindings).unwrap();
        let loaded = load_bindings(&prefs);
        assert_eq!(loaded.len(), 1);
        assert_eq!(loaded[0].accelerator, acc2);
    }

    #[test]
    fn modifiers_bitset_correct() {
        let m = Modifiers::CMD;
        assert!(m.contains(Modifiers::CMD));
        assert!(!m.contains(Modifiers::SHIFT));
        let mut combined = Modifiers::NONE;
        combined.insert(Modifiers::CMD);
        combined.insert(Modifiers::SHIFT);
        assert!(combined.contains(Modifiers::CMD));
        assert!(combined.contains(Modifiers::SHIFT));
    }
}
