// MODULE_CONTRACT
//   PURPOSE: M-005 mt-prefs **STUB**. Refuses to initialize the prefs
//            store as long as any legacy namespace is present, until
//            Phase-B3 ships the real migration logic. Acts as a hard
//            safety net so a future merge cannot accidentally produce
//            a Tauri binary that boots, opens windows, and silently
//            ignores user data from Mark v1.x / MarkText.
//   SCOPE: Read-only check against LegacyLayouts; returns Result. The
//          decision to actually exit the process belongs to main.rs
//          (single emit-point per outcome, per trace-contract step-7).
//   DEPENDS: stdlib only; consumes LegacyLayouts shape from crate::legacy.
//   LINKS: M-005 mt-prefs (full module ships in Phase-B3); V-M-005;
//          Phase-B-pre2 step-6.
//   LOG MARKERS: none emitted directly. The MT_PREFS_V1_RUNNING constant
//                is the stable error identifier that the call site
//                (main.rs) embeds in its abort marker.

use crate::legacy::LegacyLayouts;

/// Stable error identifier emitted by the bootstrap layer when this
/// stub refuses to run. Tests assert against this exact byte string.
/// MT_ prefix follows the V-M-005 convention for error/abort markers
/// (vs BLOCK_ for milestones).
pub const MT_PREFS_V1_RUNNING: &str = "MT_PREFS_V1_RUNNING";

/// Phase-B-pre2 step-6 stub gate.
///
/// Returns `Ok(())` only when `layouts` reports no legacy namespace.
/// Otherwise returns `Err(MT_PREFS_V1_RUNNING)` so the caller can log
/// the canonical abort marker and exit non-zero.
///
/// Step-5 (snapshot+preflight) will move legacy data OUT of Application
/// Support before this stub runs, so the post-snapshot LegacyLayouts
/// will be empty and `init` will return Ok. Until step-5 lands, the
/// Continue path of the migration dialog will always end in this abort
/// — by design.
pub fn init(layouts: &LegacyLayouts) -> Result<(), &'static str> {
    if layouts.any_detected() {
        return Err(MT_PREFS_V1_RUNNING);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::legacy::{LegacyLayouts, LegacyNamespace};
    use std::path::PathBuf;

    fn empty_layouts() -> LegacyLayouts {
        LegacyLayouts::default()
    }

    fn legacy_layout_with(marktext: bool, mark: bool) -> LegacyLayouts {
        let ns = |name: &str| LegacyNamespace {
            root: PathBuf::from(format!("/tmp/{name}")),
            has_preferences: true,
            has_data_center: false,
            has_window_state: false,
            has_local_storage: false,
        };
        LegacyLayouts {
            marktext: if marktext { Some(ns("marktext")) } else { None },
            mark: if mark { Some(ns("mark")) } else { None },
        }
    }

    #[test]
    fn init_returns_ok_when_no_legacy() {
        assert_eq!(init(&empty_layouts()), Ok(()));
    }

    #[test]
    fn init_aborts_when_marktext_only_present() {
        assert_eq!(init(&legacy_layout_with(true, false)), Err(MT_PREFS_V1_RUNNING));
    }

    #[test]
    fn init_aborts_when_mark_only_present() {
        assert_eq!(init(&legacy_layout_with(false, true)), Err(MT_PREFS_V1_RUNNING));
    }

    #[test]
    fn init_aborts_when_both_namespaces_present() {
        assert_eq!(init(&legacy_layout_with(true, true)), Err(MT_PREFS_V1_RUNNING));
    }

    #[test]
    fn marker_constant_is_stable_byte_string() {
        // Stability test: scenario assertions in V-M-005 grep for this
        // exact identifier. Renaming it requires a synchronized update
        // to the verification plan.
        assert_eq!(MT_PREFS_V1_RUNNING, "MT_PREFS_V1_RUNNING");
    }
}
