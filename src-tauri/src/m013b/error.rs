// MODULE_CONTRACT
//   PURPOSE: Structured error envelope for M-013b stubs. Every Phase-B1
//            stub command returns this shape on Err so the M-013a
//            renderer-side mapInvokeError() can route MT_NOT_IMPLEMENTED
//            distinctly from real validation/timeout/unknown-command errors.
//   SCOPE:   error type only — no command logic.
//   DEPENDS: serde (Serialize) so Tauri can JSON-serialize Err to renderer.
//   LINKS:   M-013b runtime façade; V-M-013b verification.
//   STATUS:  Phase-B1 stub. Real impls (B2/B3) will define their own
//            error variants and may shadow this with richer types.
//
// CHANGE_SUMMARY:
//   - 2026-04-28 B1-step-6: initial stub. IpcError + MT_NOT_IMPLEMENTED.

use serde::Serialize;

/// Stable error code returned by every M-013b stub command.
/// Renderer matches on this string in M-013a's mapInvokeError().
pub const MT_NOT_IMPLEMENTED: &str = "MT_NOT_IMPLEMENTED";

/// Structured error envelope. Tauri serializes this to JSON for the
/// renderer; M-013a's invoke.ts maps it to an IpcError with the
/// preserved code field.
#[derive(Serialize, Debug, Clone, PartialEq, Eq)]
pub struct IpcError {
    /// Stable code. Currently only MT_NOT_IMPLEMENTED until B2 ships
    /// real impls; B2 may add MT_FS_PATH_DENIED, MT_SEARCH_CANCELLED,
    /// etc.
    pub code: String,
    /// Human-readable message — never the only signal; renderer should
    /// match on `code`, not `message`.
    pub message: String,
    /// Channel name being invoked (e.g. "mt::fs::read"). Lets the
    /// renderer know which command was rejected even if the call
    /// site lost the context.
    pub command: String,
    /// Phase identifier when the real impl is expected to land
    /// (e.g. "B2-step-2" for M-002 fs commands).
    pub planned_phase: String,
}

impl IpcError {
    /// Construct a not-implemented error for a stub command.
    /// `command` is the M-013a-side channel name (with `mt::` prefix);
    /// `planned_phase` is the dev-plan phase reference (e.g. "B2-step-2").
    pub fn not_implemented(command: &str, planned_phase: &str) -> Self {
        Self {
            code: MT_NOT_IMPLEMENTED.to_string(),
            message: format!(
                "command '{command}' has no Phase-B1 implementation; will be wired in Phase-{planned_phase}"
            ),
            command: command.to_string(),
            planned_phase: planned_phase.to_string(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn not_implemented_carries_stable_fields() {
        let e = IpcError::not_implemented("mt::fs::read", "B2-step-2");
        assert_eq!(e.code, "MT_NOT_IMPLEMENTED");
        assert_eq!(e.command, "mt::fs::read");
        assert_eq!(e.planned_phase, "B2-step-2");
        assert!(e.message.contains("mt::fs::read"));
        assert!(e.message.contains("B2-step-2"));
    }

    #[test]
    fn serializes_to_canonical_json_shape() {
        let e = IpcError::not_implemented("mt::search::spawn", "B2-step-4");
        let json = serde_json::to_value(&e).unwrap();
        assert_eq!(json["code"], "MT_NOT_IMPLEMENTED");
        assert_eq!(json["command"], "mt::search::spawn");
        assert_eq!(json["planned_phase"], "B2-step-4");
        assert!(json["message"].is_string());
    }

    #[test]
    fn equality_is_value_based() {
        let a = IpcError::not_implemented("mt::fs::read", "B2-step-2");
        let b = IpcError::not_implemented("mt::fs::read", "B2-step-2");
        assert_eq!(a, b);
    }
}
