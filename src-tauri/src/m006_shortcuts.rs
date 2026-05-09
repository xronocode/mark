// MODULE_CONTRACT
//   PURPOSE: M-006 mt-shortcuts. Accelerator parser + normalizer +
//            in-process registry + tauri-plugin-global-shortcut
//            platform binding for system-wide app hotkeys
//            (Cmd+Shift+M show-window class). In-editor accelerators
//            (Cmd+S/F/O/W) ride the macOS native menu via M-009 — the
//            menu binding handles them at the OS level, no global
//            registration needed.
//   SCOPE:   (a) parse "Cmd+Shift+M" → typed Accelerator; canonical
//            form for equality (PR #4134 regression net); (b) persist
//            bindings in PrefsState[KEY_SHORTCUTS] so renderer can
//            dispatch in-window shortcuts; (c) register a small set
//            of system-wide accelerators with the OS via
//            tauri-plugin-global-shortcut (default: Cmd+Shift+M → show
//            main window).
//   DEPENDS: m005_prefs (PrefsState), tauri_plugin_global_shortcut.
//   LINKS:   docs/development-plan.xml Phase-B3 step-4 (parser),
//            Phase-B4-pre-alpha step-2 (platform binding closes
//            F-SHORTCUT-PLATFORM-BIND).
//   STATUS:  Phase-B4-pre-alpha step-2 — global-shortcut wired.
//
// CHANGE_SUMMARY:
//   - 2026-04-29 B3-step-4: parser + canonical form + persistence.
//   - 2026-05-08 B4-pre-alpha-step-2: register_global_shortcuts
//                helper + tauri-plugin-global-shortcut wiring.

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

/// Pure-logic register — see m013b/fs.rs for the inner/outer split.
pub(crate) fn shortcut_register_inner(
    prefs: &PrefsState,
    command: &str,
    accelerator: &str,
) -> Result<(), String> {
    let parsed = parse_accelerator(accelerator).map_err(|e| e.to_string())?;
    let mut bindings = load_bindings(prefs);
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
        command: command.to_string(),
        accelerator: parsed,
    });
    store_bindings(prefs, &bindings)
}

pub(crate) fn shortcut_unregister_inner(prefs: &PrefsState, command: &str) -> Result<(), String> {
    let mut bindings = load_bindings(prefs);
    let before = bindings.len();
    bindings.retain(|b| b.command != command);
    if bindings.len() < before {
        eprintln!("[Shortcuts][unregister][BLOCK_REMOVED command={command}]");
    }
    store_bindings(prefs, &bindings)
}

pub(crate) fn shortcut_list_inner(prefs: &PrefsState) -> Result<Value, String> {
    serde_json::to_value(load_bindings(prefs)).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn mt_shortcut_register(
    command: String,
    accelerator: String,
    prefs: State<'_, PrefsState>,
) -> Result<(), String> {
    shortcut_register_inner(prefs.inner(), &command, &accelerator)
}

#[tauri::command]
pub async fn mt_shortcut_unregister(
    command: String,
    prefs: State<'_, PrefsState>,
) -> Result<(), String> {
    shortcut_unregister_inner(prefs.inner(), &command)
}

#[tauri::command]
pub async fn mt_shortcut_list(prefs: State<'_, PrefsState>) -> Result<Value, String> {
    shortcut_list_inner(prefs.inner())
}

// ─────────────────────────────────────────────────────────────────────
// START_BLOCK platform_binding_global
// PURPOSE:    Register OS-level system-wide shortcuts via
//             tauri-plugin-global-shortcut. Distinct from menu
//             accelerators (handled by M-009 — those fire only when
//             the app window has focus or the menu is active).
// CONTRACT:   Called once from main.rs Builder.setup AFTER set_menu.
//             Registers builtin shortcuts (Cmd+Shift+M show-window).
//             User-defined globals from prefs[shortcuts] are NOT
//             auto-registered yet — that flow needs a UI for picking
//             them and a conflict-detection pass against OS reservations
//             (Spotlight, Raycast, etc, V-M-006 ec) — deferred follow-
//             up under the existing F-SHORTCUT-PLATFORM-BIND envelope.
// LOG MARKERS: [Shortcuts][register_global][BLOCK_OK shortcut=…]
//              [Shortcuts][register_global][BLOCK_FAILED shortcut=… reason=…]
//              [Shortcuts][on_global_fired][BLOCK_DISPATCH shortcut=…]
// ─────────────────────────────────────────────────────────────────────

/// Builtin global shortcuts registered at app boot. Keep this list
/// small — every entry holds an OS-level hotkey reservation that may
/// conflict with user tools (Spotlight, Raycast, CleanShot, etc).
///
/// Returns the (accelerator-string, command-id) pairs so the same
/// list drives both registration and the on-fire dispatcher below.
pub fn builtin_globals() -> &'static [(&'static str, &'static str)] {
    &[
        // Cmd+Shift+M: bring Mark window to front from anywhere on the
        // OS. v1.2.3 had no global shortcut; this is a Phase-B
        // affordance from MarkText community wishlist.
        ("CmdOrCtrl+Shift+M", "app.show-window"),
    ]
}

/// Register the builtin global shortcuts with the OS. Wires the plugin's
/// on-shortcut handler so that when the OS fires a registered combo,
/// we look up the command id and emit `mt::menu-invoked` with that id —
/// reusing the same renderer dispatcher path the native menu uses.
///
/// Errors per-shortcut are logged and skipped (one bad shortcut should
/// not block the others). The function as a whole returns Ok(()) once
/// the iteration completes.
pub fn register_global_shortcuts<R: tauri::Runtime>(
    handle: &tauri::AppHandle<R>,
) -> tauri::Result<()> {
    use tauri::Manager;
    use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

    let plugin = handle.global_shortcut();
    for (accel, cmd_id) in builtin_globals() {
        let cmd_id_owned = cmd_id.to_string();
        let accel_owned = accel.to_string();
        match plugin.on_shortcut(*accel, move |app, _shortcut, event| {
            // Only fire on key DOWN, not on release (state is auto-
            // emitted twice otherwise).
            if event.state() != ShortcutState::Pressed {
                return;
            }
            eprintln!(
                "[Shortcuts][on_global_fired][BLOCK_DISPATCH shortcut={accel_owned} cmd={cmd_id_owned}]"
            );
            // Show + focus main window if the dispatched command is
            // app.show-window (the only builtin today). Otherwise
            // forward into the menu pipeline.
            if cmd_id_owned == "app.show-window" {
                if let Some(win) = app.get_webview_window("main") {
                    let _ = win.show();
                    let _ = win.set_focus();
                }
                return;
            }
            // Generic path: emit through the menu-invoked event so the
            // renderer's menu-bridge dispatches via the static command
            // registry (one path for both menu and global shortcut).
            if let Err(e) = tauri::Emitter::emit(app, "mt::menu-invoked", &cmd_id_owned) {
                eprintln!(
                    "[Shortcuts][on_global_fired][BLOCK_EMIT_FAILED shortcut={accel_owned} reason={e}]"
                );
            }
        }) {
            Ok(()) => eprintln!(
                "[Shortcuts][register_global][BLOCK_OK shortcut={accel} cmd={cmd_id}]"
            ),
            Err(e) => eprintln!(
                "[Shortcuts][register_global][BLOCK_FAILED shortcut={accel} reason={e}]"
            ),
        }
    }
    Ok(())
}

// END_BLOCK platform_binding_global

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

    #[test]
    fn builtin_globals_parse_cleanly() {
        // Every entry in builtin_globals() must parse — otherwise
        // register_global_shortcuts would silently fail at runtime
        // with a Tauri-side "invalid accelerator" instead of a clear
        // dev-time test failure.
        for (accel, cmd) in builtin_globals() {
            let parsed = parse_accelerator(accel)
                .unwrap_or_else(|e| panic!("builtin global {accel} ({cmd}) failed to parse: {e}"));
            // Sanity: builtin globals SHOULD have at least one modifier
            // (raw "M" would conflict with typing in any text field).
            assert_ne!(
                parsed.modifiers, 0,
                "builtin global {accel} has no modifier — would fire on every keypress"
            );
        }
    }

    #[test]
    fn builtin_globals_include_show_window() {
        // Smoke for B4-pre-alpha-step-2: Cmd+Shift+M must show the
        // main window. Documented user expectation from MarkText
        // community wishlist.
        let pairs: Vec<_> = builtin_globals().to_vec();
        assert!(
            pairs.iter().any(|(_, cmd)| *cmd == "app.show-window"),
            "builtin globals must include app.show-window — found: {:?}",
            pairs
        );
    }

    #[test]
    fn shortcut_register_inner_persists_binding() {
        let (_dir, prefs) = fresh_prefs();
        shortcut_register_inner(&prefs, "save", "Cmd+S").unwrap();
        let loaded = load_bindings(&prefs);
        assert_eq!(loaded.len(), 1);
        assert_eq!(loaded[0].command, "save");
        assert_eq!(loaded[0].accelerator.key, "S");
    }

    #[test]
    fn shortcut_register_inner_invalid_accel_returns_error() {
        let (_dir, prefs) = fresh_prefs();
        let err = shortcut_register_inner(&prefs, "save", "").unwrap_err();
        assert!(err.contains("empty"), "got {err}");
        assert_eq!(load_bindings(&prefs).len(), 0);
    }

    #[test]
    fn shortcut_register_inner_dedupes_command() {
        let (_dir, prefs) = fresh_prefs();
        shortcut_register_inner(&prefs, "save", "Cmd+S").unwrap();
        shortcut_register_inner(&prefs, "save", "Cmd+Shift+S").unwrap();
        let loaded = load_bindings(&prefs);
        assert_eq!(loaded.len(), 1, "command must remain a single binding");
        let parsed = parse_accelerator("Cmd+Shift+S").unwrap();
        assert_eq!(loaded[0].accelerator, parsed);
    }

    #[test]
    fn shortcut_register_inner_overrides_duplicate_accelerator() {
        let (_dir, prefs) = fresh_prefs();
        shortcut_register_inner(&prefs, "save", "Cmd+S").unwrap();
        shortcut_register_inner(&prefs, "save-as", "Cmd+S").unwrap();
        let loaded = load_bindings(&prefs);
        assert_eq!(loaded.len(), 1, "accelerator owned by last registrant");
        assert_eq!(loaded[0].command, "save-as");
    }

    #[test]
    fn shortcut_unregister_inner_removes_binding() {
        let (_dir, prefs) = fresh_prefs();
        shortcut_register_inner(&prefs, "save", "Cmd+S").unwrap();
        shortcut_register_inner(&prefs, "find", "Cmd+F").unwrap();
        shortcut_unregister_inner(&prefs, "save").unwrap();
        let loaded = load_bindings(&prefs);
        assert_eq!(loaded.len(), 1);
        assert_eq!(loaded[0].command, "find");
    }

    #[test]
    fn shortcut_unregister_inner_unknown_command_is_noop() {
        let (_dir, prefs) = fresh_prefs();
        shortcut_register_inner(&prefs, "save", "Cmd+S").unwrap();
        shortcut_unregister_inner(&prefs, "ghost").unwrap();
        assert_eq!(load_bindings(&prefs).len(), 1);
    }

    #[test]
    fn shortcut_list_inner_returns_json_array() {
        let (_dir, prefs) = fresh_prefs();
        shortcut_register_inner(&prefs, "save", "Cmd+S").unwrap();
        let v = shortcut_list_inner(&prefs).unwrap();
        let arr = v.as_array().expect("expected JSON array");
        assert_eq!(arr.len(), 1);
        assert_eq!(arr[0]["command"], serde_json::json!("save"));
    }

    #[test]
    fn unknown_token_in_non_last_position_rejected() {
        let err = parse_accelerator("Bogus+S").unwrap_err();
        assert!(matches!(err, ParseError::UnknownToken(_)));
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn cmd_or_ctrl_maps_to_cmd_on_macos() {
        let a = parse_accelerator("CmdOrCtrl+S").unwrap();
        let b = parse_accelerator("Cmd+S").unwrap();
        assert_eq!(a, b);
    }
}
