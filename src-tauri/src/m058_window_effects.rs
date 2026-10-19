// FILE: src-tauri/src/m058_window_effects.rs
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: M-058 C-38 T-007 N4 e — Windows 11 Mica behind the custom
//            title bar. Applies the Mica window effect to the main
//            window at setup (Windows build >= 22000 only), exposes the
//            outcome via mt_window_effects_state, and re-tints the
//            material to the app theme (Paper/Ink, not just the OS)
//            through mt_window_set_mica_theme.
//   SCOPE: One pure build gate, one pure theme→effect mapping, managed
//          state, one boot application, two commands. macOS and Linux
//          never apply an effect and every command reports mica:false
//          (2026-10-16 user decision "Mica only": no macOS vibrancy,
//          no macOSPrivateApi, no transparent macOS window).
//   DEPENDS: tauri (WebviewWindow set_effects / EffectsBuilder / Effect,
//            State, Manager), windows-version (Windows-only target dep,
//            already in Cargo.lock via tao), serde.
//   LINKS: .grace/graph/runtime.xml M-058; .grace/verification/runtime.xml
//          V-M-058; tauri.windows.conf.json (transparent:true — M-054
//          overlay); renderer util/micaWindow.js + pages/app.vue (boot +
//          theme sync) + assets/styles/index.css (.mica-active section);
//          components/titleBar/index.vue (.title-bar-editor-bg).
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   MIN_MICA_BUILD - first Windows 11 build that ships Mica (22000).
//   WindowEffectsState - managed atomic state: is the effect live.
//   WindowEffectsPayload - command answer shape { mica: bool }.
//   mica_supported - pure gate: build number → Mica availability.
//   mica_effect_for_theme - pure mapping: app-theme darkness → MicaDark / MicaLight.
//   current_build - running OS build number (Windows-only read).
//   apply_mica_at_boot - setup hook: gate + apply the system-following effect + record state.
//   window_effects_mica - pure read of the managed state (command body).
//   mt_window_effects_state - command: { mica } report (false everywhere Mica is not live).
//   mt_window_set_mica_theme - command: re-tint to the app theme; no-op returning mica:false when inactive.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-10-16 C-38 T-007 N4 e: initial module. Windows 11 Mica behind
//     the custom title bar, tinted to the app theme; Windows 10 /
//     unsupported / failure paths leave the window fully opaque (the
//     renderer only turns the title-bar strip transparent when
//     mt_window_effects_state confirms mica:true). macOS/Linux: no-op.
// END_CHANGE_SUMMARY

use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};

/// Windows 11 (and thus Mica) starts at build 22000. Windows 10 (any
/// build < 22000) has no Mica and must keep today's opaque chrome.
// Pure gate input for the Windows-only apply path; the constant itself
// is asserted by tests on every OS lane.
#[allow(dead_code)]
pub const MIN_MICA_BUILD: u32 = 22000;

// START_BLOCK_MANAGED_STATE
/// Managed state (main.rs .manage chain). `mica` flips true only on
/// Windows after a successful set_effects; every non-Windows boot and
/// every failure path leaves it false, which is what
/// mt_window_effects_state reports to the renderer. The current tint is
/// NOT kept here — the renderer owns the theme and re-sends it on every
/// change.
#[derive(Debug, Default)]
pub struct WindowEffectsState {
    mica: AtomicBool,
}

impl WindowEffectsState {
    pub fn mica(&self) -> bool {
        self.mica.load(Ordering::SeqCst)
    }
    /// Windows-only call site (apply_mica_at_boot); kept unconditionally
    /// so the state semantics are unit-testable on every OS lane.
    #[allow(dead_code)]
    pub fn set_mica(&self, value: bool) {
        self.mica.store(value, Ordering::SeqCst);
    }
}
// END_BLOCK_MANAGED_STATE

/// Command answer. `mica` is false on every non-Windows OS and on any
/// failure — the renderer keys ALL transparency CSS on this staying
/// honest (tauri.windows.conf.json transparent:true would otherwise
/// show garbage).
#[derive(Serialize, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WindowEffectsPayload {
    pub mica: bool,
}

// START_BLOCK_PURE_GATE_AND_MAPPING
// Pure, platform-free decision helpers. Their production call sites are
// Windows-only; they stay uncfg'd so `cargo test` pins them on the
// macOS/Linux lanes too (the cfg-gated tests there are the acceptance
// evidence for the gate and the tint mapping).
#[allow(dead_code)]
pub fn mica_supported(build: u32) -> bool {
    build >= MIN_MICA_BUILD
}

#[allow(dead_code)]
pub fn mica_effect_for_theme(dark: bool) -> tauri::window::Effect {
    if dark {
        tauri::window::Effect::MicaDark
    } else {
        tauri::window::Effect::MicaLight
    }
}
// END_BLOCK_PURE_GATE_AND_MAPPING

/// The running OS build number (RtlGetVersion via windows-version).
#[cfg(target_os = "windows")]
pub fn current_build() -> u32 {
    windows_version::OsVersion::current().build
}

// START_BLOCK_APPLY_AT_BOOT
/// Setup hook (main.rs). Windows: gate on the OS build, then apply the
/// system-following Mica effect (Effect::Mica) so the material is live
/// before first paint; the renderer immediately re-tints to the app
/// theme via mt_window_set_mica_theme once it knows Paper vs Ink.
/// Non-Windows: log the gate outcome and change nothing.
pub fn apply_mica_at_boot(app: &tauri::AppHandle) {
    #[cfg(target_os = "windows")]
    {
        use tauri::Manager;
        let Some(win) = app.get_webview_window("main") else {
            safe_eprintln!("[window_effects][apply][BLOCK_MICA_FAILED reason=no-main-window]");
            return;
        };
        let build = current_build();
        if !mica_supported(build) {
            safe_eprintln!("[window_effects][apply][BLOCK_MICA_UNSUPPORTED build={}]", build);
            return;
        }
        let result = win.set_effects(
            tauri::window::EffectsBuilder::new()
                .effect(tauri::window::Effect::Mica)
                .build(),
        );
        match result {
            Ok(()) => {
                let state = app.state::<WindowEffectsState>();
                state.set_mica(true);
                safe_eprintln!("[window_effects][apply][BLOCK_MICA_APPLIED theme=system]");
            }
            Err(e) => {
                safe_eprintln!("[window_effects][apply][BLOCK_MICA_FAILED reason={}]", e);
            }
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        // No Mica off Windows (and no Windows build number to report).
        let _ = app;
        safe_eprintln!(
            "[window_effects][apply][BLOCK_MICA_UNSUPPORTED build=0 os={}]",
            std::env::consts::OS
        );
    }
}
// END_BLOCK_APPLY_AT_BOOT

/// Pure command body for mt_window_effects_state — kept free of Tauri
/// types so `cargo test` can run it without an app instance (same
/// pattern as main.rs's drain_inner).
pub fn window_effects_mica(state: &WindowEffectsState) -> bool {
    state.mica()
}

#[tauri::command]
pub fn mt_window_effects_state(
    state: tauri::State<'_, WindowEffectsState>,
) -> WindowEffectsPayload {
    WindowEffectsPayload {
        mica: window_effects_mica(&state),
    }
}

// START_BLOCK_SET_MICA_THEME_WINDOWS
/// Windows: re-tint the live Mica material to the app theme. No-op
/// returning mica:false when the effect is not active (Windows 10,
/// failed boot application, or any pre-gate call).
#[cfg(target_os = "windows")]
#[tauri::command]
pub fn mt_window_set_mica_theme(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, WindowEffectsState>,
    dark: bool,
) -> Result<WindowEffectsPayload, String> {
    if !state.mica() {
        return Ok(WindowEffectsPayload { mica: false });
    }
    window
        .set_effects(
            tauri::window::EffectsBuilder::new()
                .effect(mica_effect_for_theme(dark))
                .build(),
        )
        .map_err(|e| format!("set_effects: {e}"))?;
    safe_eprintln!(
        "[window_effects][apply][BLOCK_MICA_APPLIED theme={}]",
        if dark { "dark" } else { "light" }
    );
    Ok(WindowEffectsPayload { mica: true })
}
// END_BLOCK_SET_MICA_THEME_WINDOWS

// START_BLOCK_SET_MICA_THEME_NOOP
/// macOS / Linux: no effect exists, so the answer is always mica:false.
/// The renderer never even calls this (installMicaWindowEffect leaves
/// the mica flag down), but the stub keeps the command surface uniform
/// for shared renderer code.
#[cfg(not(target_os = "windows"))]
#[tauri::command]
pub fn mt_window_set_mica_theme(dark: bool) -> Result<WindowEffectsPayload, String> {
    let _ = dark;
    Ok(WindowEffectsPayload { mica: false })
}
// END_BLOCK_SET_MICA_THEME_NOOP

#[cfg(test)]
mod tests {
    use super::*;

    // ── pure build gate ──────────────────────────────────────────────

    #[test]
    fn mica_gate_is_false_below_windows_11_and_true_from_build_22000() {
        assert!(!mica_supported(21_999), "Windows 10 builds have no Mica");
        assert!(mica_supported(22_000), "Windows 11 21H2 (build 22000) is the first Mica build");
        assert!(mica_supported(26_100), "current Windows 11 builds are supported");
        assert!(!mica_supported(0));
        assert_eq!(MIN_MICA_BUILD, 22_000);
    }

    // ── pure theme → effect mapping ─────────────────────────────────

    #[test]
    fn dark_app_themes_map_to_mica_dark_and_light_to_mica_light() {
        assert!(matches!(
            mica_effect_for_theme(true),
            tauri::window::Effect::MicaDark
        ));
        assert!(matches!(
            mica_effect_for_theme(false),
            tauri::window::Effect::MicaLight
        ));
    }

    // ── managed state semantics ─────────────────────────────────────

    #[test]
    fn default_state_reports_mica_false() {
        let state = WindowEffectsState::default();
        assert!(!state.mica());
        // The exact value mt_window_effects_state reports on every
        // non-Windows OS and on any Windows failure path — the renderer
        // keys all transparency CSS on this staying false.
        assert!(!window_effects_mica(&state));
    }

    #[test]
    fn state_setter_round_trips_the_effect_flag() {
        let state = WindowEffectsState::default();
        state.set_mica(true);
        assert!(state.mica());
        assert!(window_effects_mica(&state));
        state.set_mica(false);
        assert!(!window_effects_mica(&state));
    }

    // ── command surface off Windows ─────────────────────────────────

    // The macOS/Linux CI lanes compile the no-op variant; plain
    // `cargo test` there pins the contract the renderer depends on:
    // never an error, always mica:false.
    #[cfg(not(target_os = "windows"))]
    #[test]
    fn mt_window_set_mica_theme_is_a_noop_returning_mica_false_off_windows() {
        for dark in [true, false] {
            let payload = mt_window_set_mica_theme(dark).expect("no-op must not error");
            assert_eq!(payload, WindowEffectsPayload { mica: false });
        }
    }

    // ── Windows lane ────────────────────────────────────────────────
    // The window-touching surface (set_effects) stays thin; what can be
    // tested without a real window is pinned here.

    #[cfg(target_os = "windows")]
    #[test]
    fn the_running_build_resolves_through_the_same_gate() {
        let build = current_build();
        assert_eq!(mica_supported(build), build >= MIN_MICA_BUILD);
    }
}
