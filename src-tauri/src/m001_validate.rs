// MODULE_CONTRACT
//   PURPOSE: M-001 BLOCK_VALIDATE_AGAINST_FIXTURE on-boot parity check.
//            Embed test/fixtures/ipc-channels/tauri.v2.json at compile
//            time, parse it, compare command names against the const
//            REGISTERED_COMMANDS list (the same list used in the
//            tauri::generate_handler! macro). On mismatch: emit a
//            stable BLOCK_VALIDATE_AGAINST_FIXTURE_FAIL marker, show
//            a native dialog (NSAlert / MessageBoxW / GTK), and
//            std::process::exit(1).
//   SCOPE:   compile-time fixture embedding + runtime comparison.
//            Does NOT panic — uses Result + dialog + exit per
//            V-M-001 contract.
//   DEPENDS: serde_json (parse), dialog::ask_native_error (display),
//            std::process::exit.
//   LINKS:   docs/development-plan.xml Phase-B1 step-7;
//            verification-plan.xml V-M-001;
//            test/fixtures/ipc-channels/tauri.v2.json.
//   STATUS:  Phase-B1 step-7. The const REGISTERED_COMMANDS MUST be
//            kept in sync with main.rs's tauri::generate_handler!
//            invocation by hand until B2 step-1's schema-parity
//            checker automates it. A single source of truth via
//            macro is a B2 follow-up.
//
// CHANGE_SUMMARY:
//   - 2026-04-28 B1-step-7: initial parity check.

/// The fixture is embedded at compile time. If the file is missing or
/// the path drifts, the build fails — which is the right behavior:
/// a bin that can't validate its own contract should not link.
const TAURI_V2_FIXTURE: &str =
    include_str!("../../test/fixtures/ipc-channels/tauri.v2.json");

/// Authoritative list of Tauri command names registered via
/// generate_handler! in main.rs. Names follow Rust-identifier rules
/// (`::` becomes `_`); the fixture stores the original `mt::*` form.
/// Comparison normalizes the fixture by replacing `::` → `_`.
///
/// Keep this in sync with main.rs by hand. B2 step-1 introduces the
/// macro that derives both lists from the same #[derive] hierarchy.
const REGISTERED_COMMANDS: &[&str] = &[
    "mt_fs_read",
    "mt_fs_write",
    "mt_fs_stat",
    "mt_fs_readdir",
    "mt_fs_unlink",
    "mt_search_spawn",
    "mt_search_cancel",
    "mt_watch_subscribe",
    "mt_watch_unsubscribe",
    "mt_print_to_pdf",
    "mt_prefs_get",
    "mt_prefs_set",
    "mt_prefs_get_all",
    "mt_workspace_set",
];

/// `mt::ping` is declared in M-013a's CommandMap as a typecheck
/// fixture but has no Rust handler — it's frontend-only documentation
/// so the typecheck self-test in contract.test.ts has a deterministic
/// name to assert against. The validator must EXCLUDE it from the
/// expected-runtime set, otherwise every boot will fail.
const FIXTURE_FRONTEND_ONLY: &[&str] = &["mt_ping"];

#[derive(Debug, PartialEq, Eq)]
pub struct ValidationReport {
    /// Commands present in fixture but NOT registered (frontend declared
    /// a name the backend doesn't implement).
    pub fixture_only: Vec<String>,
    /// Commands registered but NOT in fixture (backend exposes a name
    /// the frontend doesn't know about).
    pub registered_only: Vec<String>,
}

impl ValidationReport {
    pub fn is_clean(&self) -> bool {
        self.fixture_only.is_empty() && self.registered_only.is_empty()
    }

    pub fn fail_message(&self) -> String {
        let mut s = String::from("M-001 BLOCK_VALIDATE_AGAINST_FIXTURE_FAIL\n\n");
        if !self.fixture_only.is_empty() {
            s.push_str("Fixture declares commands NOT registered in tauri::generate_handler!:\n");
            for n in &self.fixture_only {
                s.push_str(&format!("  - {n}\n"));
            }
            s.push('\n');
        }
        if !self.registered_only.is_empty() {
            s.push_str("Handlers registered in main.rs but NOT in tauri.v2.json fixture:\n");
            for n in &self.registered_only {
                s.push_str(&format!("  - {n}\n"));
            }
            s.push('\n');
        }
        s.push_str(
            "Re-run `node tools/gen-tauri-v2-fixture.mjs` to refresh the fixture from M-013a CommandMap, then update m001_validate::REGISTERED_COMMANDS to match.",
        );
        s
    }
}

/// Parse the embedded fixture and produce the symmetric difference
/// against REGISTERED_COMMANDS (after `::` → `_` normalization and
/// FIXTURE_FRONTEND_ONLY exclusion). Pure function — no side effects;
/// used by tests and by the runtime entry point.
pub fn validate(
    fixture_json: &str,
    registered: &[&str],
    frontend_only: &[&str],
) -> Result<ValidationReport, String> {
    let parsed: serde_json::Value =
        serde_json::from_str(fixture_json).map_err(|e| format!("fixture JSON parse: {e}"))?;
    let channels = parsed
        .get("channels")
        .and_then(|c| c.as_array())
        .ok_or_else(|| "fixture has no channels[] array".to_string())?;

    // Normalize fixture names: replace `::` with `_`, drop frontend-only.
    let mut fixture_normalized: Vec<String> = channels
        .iter()
        .filter_map(|c| c.get("name").and_then(|n| n.as_str()))
        .map(|name| name.replace("::", "_"))
        .filter(|n| !frontend_only.contains(&n.as_str()))
        .collect();
    fixture_normalized.sort();
    fixture_normalized.dedup();

    let mut registered_set: Vec<String> = registered.iter().map(|s| s.to_string()).collect();
    registered_set.sort();
    registered_set.dedup();

    let fixture_only: Vec<String> = fixture_normalized
        .iter()
        .filter(|n| !registered_set.contains(n))
        .cloned()
        .collect();
    let registered_only: Vec<String> = registered_set
        .iter()
        .filter(|n| !fixture_normalized.contains(n))
        .cloned()
        .collect();

    Ok(ValidationReport {
        fixture_only,
        registered_only,
    })
}

/// Runtime entry point. Called from main.rs BEFORE tauri::Builder.
/// Logs BLOCK_VALIDATE_AGAINST_FIXTURE_OK on success;
/// shows a native dialog + exit(1) on mismatch (V-M-001: never panic).
pub fn validate_or_exit() {
    match validate(
        TAURI_V2_FIXTURE,
        REGISTERED_COMMANDS,
        FIXTURE_FRONTEND_ONLY,
    ) {
        Ok(report) if report.is_clean() => {
            eprintln!(
                "[m001][validate][BLOCK_VALIDATE_AGAINST_FIXTURE_OK registered={} fixture_only=0 registered_only=0]",
                REGISTERED_COMMANDS.len()
            );
        }
        Ok(report) => {
            eprintln!(
                "[m001][validate][BLOCK_VALIDATE_AGAINST_FIXTURE_FAIL fixture_only={} registered_only={}]",
                report.fixture_only.len(),
                report.registered_only.len()
            );
            let msg = report.fail_message();
            eprintln!("{msg}");
            // Native dialog — does not panic, returns DialogChoice ignored;
            // we exit regardless. Title kept short to fit NSAlert.
            crate::dialog::ask_native_error("Mark — IPC contract drift", &msg);
            std::process::exit(1);
        }
        Err(parse_err) => {
            eprintln!("[m001][validate][BLOCK_VALIDATE_FIXTURE_PARSE_FAIL reason={parse_err}]");
            crate::dialog::ask_native_error(
                "Mark — IPC fixture parse error",
                &format!(
                    "Embedded tauri.v2.json failed to parse: {parse_err}\n\nThis is a build artifact bug — re-run `node tools/gen-tauri-v2-fixture.mjs` and rebuild."
                ),
            );
            std::process::exit(1);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn embedded_fixture_parses_and_matches_registered() {
        // The shipped fixture + REGISTERED_COMMANDS must agree at every
        // build of this binary. Regression net for the const list drifting
        // from the fixture — the runtime check fires too late if drift
        // sneaks past code review.
        let report = validate(
            TAURI_V2_FIXTURE,
            REGISTERED_COMMANDS,
            FIXTURE_FRONTEND_ONLY,
        )
        .expect("fixture must parse");
        assert!(
            report.is_clean(),
            "shipped tauri.v2.json drift from REGISTERED_COMMANDS:\n{}",
            report.fail_message()
        );
    }

    #[test]
    fn detects_fixture_only_drift() {
        let fix = r#"{"channels":[{"name":"mt::ping"},{"name":"mt::fs::read"},{"name":"mt::extra"}]}"#;
        let registered = &["mt_fs_read"];
        let report = validate(fix, registered, &["mt_ping"]).unwrap();
        assert_eq!(report.fixture_only, vec!["mt_extra".to_string()]);
        assert!(report.registered_only.is_empty());
    }

    #[test]
    fn detects_registered_only_drift() {
        let fix = r#"{"channels":[{"name":"mt::fs::read"}]}"#;
        let registered = &["mt_fs_read", "mt_orphan"];
        let report = validate(fix, registered, &[]).unwrap();
        assert!(report.fixture_only.is_empty());
        assert_eq!(report.registered_only, vec!["mt_orphan".to_string()]);
    }

    #[test]
    fn frontend_only_names_excluded_from_drift() {
        let fix = r#"{"channels":[{"name":"mt::ping"},{"name":"mt::fs::read"}]}"#;
        let registered = &["mt_fs_read"]; // no mt_ping handler
        let report = validate(fix, registered, &["mt_ping"]).unwrap();
        assert!(
            report.is_clean(),
            "mt_ping is FIXTURE_FRONTEND_ONLY and must be excluded from drift detection"
        );
    }

    #[test]
    fn parse_error_returns_structured_err() {
        let result = validate("{ not json", &[], &[]);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("parse"));
    }

    #[test]
    fn no_channels_array_is_parse_error() {
        let result = validate(r#"{"foo":1}"#, &[], &[]);
        assert!(result.is_err());
    }

    #[test]
    fn fail_message_lists_both_drift_kinds() {
        let report = ValidationReport {
            fixture_only: vec!["mt_a".to_string()],
            registered_only: vec!["mt_b".to_string()],
        };
        let msg = report.fail_message();
        assert!(msg.contains("mt_a"));
        assert!(msg.contains("mt_b"));
        assert!(msg.contains("BLOCK_VALIDATE_AGAINST_FIXTURE_FAIL"));
    }
}
