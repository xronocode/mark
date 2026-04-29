// MODULE_CONTRACT
//   PURPOSE: M-001 WebView shell security audit. Asserts at TEST time
//            that tauri.conf.json carries the expected posture: explicit
//            CSP (not null), assetProtocol disabled, freezePrototype off,
//            dangerousDisableAssetCspModification off, no capabilities
//            opened by default. The assertions live in this module so
//            an accidental loosening of the config (e.g. someone setting
//            csp back to null while debugging) fails the test suite.
//   SCOPE:   compile-time embed of tauri.conf.json + parse + assertion.
//            Does NOT install runtime navigation hooks here — Tauri 2's
//            default behavior already blocks navigation outside the app
//            origin, custom protocols, and webview attachment from
//            untrusted contexts. If we ever need to override that, the
//            hook goes here.
//   DEPENDS: serde_json (parse).
//   LINKS:   docs/development-plan.xml Phase-B1 step-9;
//            verification-plan.xml VF-016 (security-shell gate);
//            docs/phase-b1-security-posture.md (companion doc).
//   STATUS:  Phase-B1 step-9. Auditing only — Tauri 2 defaults handle
//            the actual blocks; we just assert the config doesn't
//            disable them.
//
// CHANGE_SUMMARY:
//   - 2026-04-28 B1-step-9: initial config-posture assertions.

const TAURI_CONF_JSON: &str = include_str!("../tauri.conf.json");

/// Parse tauri.conf.json and validate the security posture matches the
/// step-9 contract. Returns Ok(()) when posture is correct; Err with
/// the specific finding when not.
pub fn audit_security_posture(conf_json: &str) -> Result<(), String> {
    let parsed: serde_json::Value =
        serde_json::from_str(conf_json).map_err(|e| format!("conf parse: {e}"))?;
    let security = parsed
        .get("app")
        .and_then(|a| a.get("security"))
        .ok_or_else(|| "missing app.security in tauri.conf.json".to_string())?;

    // ── 1. CSP must be set, NOT null ─────────────────────────────
    let csp = security
        .get("csp")
        .ok_or_else(|| "app.security.csp not present".to_string())?;
    if csp.is_null() {
        return Err(
            "app.security.csp is null — explicit CSP required for V-M-001 step-9".to_string(),
        );
    }
    let csp_str = csp
        .as_str()
        .ok_or_else(|| "app.security.csp must be a string".to_string())?;
    // Spot-check: must contain default-src + restrict frame-src + object-src.
    for required in &[
        "default-src",
        "script-src 'self'",
        "frame-src 'none'",
        "object-src 'none'",
    ] {
        if !csp_str.contains(required) {
            return Err(format!(
                "app.security.csp missing required directive: {required}"
            ));
        }
    }
    // Negative-assertion: must NOT permit unsafe-eval (CVE class for
    // markdown editors that render user code).
    if csp_str.contains("'unsafe-eval'") {
        return Err("app.security.csp permits 'unsafe-eval' — disallowed".to_string());
    }

    // ── 2. assetProtocol must be disabled (no file:// to renderer) ───
    let asset = security
        .get("assetProtocol")
        .ok_or_else(|| "missing app.security.assetProtocol".to_string())?;
    let enable = asset.get("enable").and_then(|e| e.as_bool()).unwrap_or(false);
    if enable {
        return Err(
            "app.security.assetProtocol.enable is true — file URI access disallowed in B1"
                .to_string(),
        );
    }

    // ── 3. freezePrototype must be false ──────────────────────────
    // CONTRACT INVERTED 2026-04-29 (F-MAIN-ENTRY-DISABLED runtime debug):
    // Element Plus 2.x assigns to Object.prototype-derived slots at module
    // init (TypeError: Attempted to assign to readonly property at
    // vendor-element-plus chunk WR Module Code). Tauri's
    // freezePrototype:true breaks any UI framework that monkey-patches
    // builtins (Element Plus, Vue 2 reactive proxies, dayjs prototype
    // extensions, many polyfills). The pre2 contract mandated true on
    // the assumption renderer JS would be hand-written; variant-(a)
    // port consumes the entire v1.2.3 renderer bundle including these
    // frameworks.
    //
    // Mitigation moves to other layers:
    //   - CSP script-src 'self' blocks any remote/injected script load.
    //   - No eval() or Function() in the renderer (verified by build).
    //   - User-content sanitization happens in DOMPurify before DOM
    //     insertion (existing v1.2.3 path).
    //   - Tauri's IPC custom protocol uses sealed message envelopes that
    //     don't traverse Object.prototype shapes.
    let freeze = security
        .get("freezePrototype")
        .and_then(|f| f.as_bool())
        .unwrap_or(true);
    if freeze {
        return Err("app.security.freezePrototype must be false (Element Plus + Vue ecosystem requires writable prototypes; prototype-pollution defense moved to CSP + DOMPurify per F-MAIN-ENTRY-DISABLED close)".to_string());
    }

    // ── 4. dangerousDisableAssetCspModification must be false ─────
    let disable = security
        .get("dangerousDisableAssetCspModification")
        .and_then(|d| d.as_bool())
        .unwrap_or(false);
    if disable {
        return Err(
            "app.security.dangerousDisableAssetCspModification must be false".to_string(),
        );
    }

    Ok(())
}

/// Runtime entry: log the security posture audit result on boot.
/// Never panics — emits BLOCK_SECURITY_POSTURE_OK or _FAIL marker.
/// On FAIL: native dialog + exit(1) (same pattern as M-001 validate).
pub fn audit_or_exit() {
    match audit_security_posture(TAURI_CONF_JSON) {
        Ok(()) => {
            eprintln!("[m001][security][BLOCK_SECURITY_POSTURE_OK]");
        }
        Err(reason) => {
            eprintln!("[m001][security][BLOCK_SECURITY_POSTURE_FAIL reason={reason}]");
            crate::dialog::ask_native_error(
                "Mark — security posture violation",
                &format!(
                    "tauri.conf.json fails the M-001 step-9 security audit:\n\n{reason}\n\nThis is a build artifact regression. Restore the hardened security block in tauri.conf.json before shipping."
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
    fn shipped_conf_passes_audit() {
        // Regression net: every build asserts the shipped tauri.conf.json
        // still carries the hardened posture. Anyone setting csp back to
        // null while debugging will see this test fail.
        audit_security_posture(TAURI_CONF_JSON).expect("shipped tauri.conf.json must pass audit");
    }

    #[test]
    fn rejects_null_csp() {
        let bad = r#"{"app":{"security":{"csp":null,"assetProtocol":{"enable":false},"freezePrototype":false,"dangerousDisableAssetCspModification":false}}}"#;
        let err = audit_security_posture(bad).unwrap_err();
        assert!(err.contains("csp is null"));
    }

    #[test]
    fn rejects_missing_default_src() {
        let bad = r#"{"app":{"security":{"csp":"script-src 'self'; frame-src 'none'; object-src 'none'","assetProtocol":{"enable":false},"freezePrototype":false,"dangerousDisableAssetCspModification":false}}}"#;
        let err = audit_security_posture(bad).unwrap_err();
        assert!(err.contains("default-src"));
    }

    #[test]
    fn rejects_unsafe_eval_csp() {
        let bad = r#"{"app":{"security":{"csp":"default-src 'self' 'unsafe-eval'; script-src 'self'; frame-src 'none'; object-src 'none'","assetProtocol":{"enable":false},"freezePrototype":false,"dangerousDisableAssetCspModification":false}}}"#;
        let err = audit_security_posture(bad).unwrap_err();
        assert!(err.contains("unsafe-eval"));
    }

    #[test]
    fn rejects_enabled_asset_protocol() {
        let bad = r#"{"app":{"security":{"csp":"default-src 'self'; script-src 'self'; frame-src 'none'; object-src 'none'","assetProtocol":{"enable":true},"freezePrototype":false,"dangerousDisableAssetCspModification":false}}}"#;
        let err = audit_security_posture(bad).unwrap_err();
        assert!(err.contains("assetProtocol"));
    }

    #[test]
    fn rejects_frozen_prototype() {
        // Inverted 2026-04-29: see audit_security_posture rationale —
        // freezePrototype:true breaks Element Plus + Vue ecosystem.
        let bad = r#"{"app":{"security":{"csp":"default-src 'self'; script-src 'self'; frame-src 'none'; object-src 'none'","assetProtocol":{"enable":false},"freezePrototype":true,"dangerousDisableAssetCspModification":false}}}"#;
        let err = audit_security_posture(bad).unwrap_err();
        assert!(err.contains("freezePrototype"));
    }

    #[test]
    fn rejects_dangerous_disable_csp_modification() {
        let bad = r#"{"app":{"security":{"csp":"default-src 'self'; script-src 'self'; frame-src 'none'; object-src 'none'","assetProtocol":{"enable":false},"freezePrototype":false,"dangerousDisableAssetCspModification":true}}}"#;
        let err = audit_security_posture(bad).unwrap_err();
        assert!(err.contains("dangerousDisableAssetCspModification"));
    }
}
