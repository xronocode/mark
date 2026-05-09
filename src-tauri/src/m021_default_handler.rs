// MODULE_CONTRACT
//   PURPOSE: M-021 mt-default-handler. Register / query / unregister
//            Mark as the macOS Launch Services default handler for
//            .md / .markdown files. Targets both
//            `net.daringfireball.markdown` (legacy popular UTI) and
//            `public.markdown` (newer system UTI). Bundle id is
//            `com.xronocode.mark` (matches tauri.conf.json identifier).
//   SCOPE:   3 Tauri commands invoked from the Settings UI:
//              - mt_set_default_md_handler
//              - mt_get_default_md_handler
//              - mt_unset_default_md_handler
//            All shell out via the `CommandRunner` trait so tests
//            never touch the real `defaults` / `lsregister` binaries.
//   DEPENDS: stdlib std::process::Command (production runner only),
//            std::time (lsregister duration timer),
//            serde (DefaultHandlerInfo serialization).
//   LINKS:   docs/development-plan.xml Phase-B4-pre-alpha-add M-021;
//            docs/verification-plan.xml V-M-021;
//            docs/knowledge-graph.xml M-021.
//   STATUS:  Phase-B4-pre-alpha-add: shipped 2026-05-09 with the 8
//            module-local tests covering V-M-021 S-01, S-02, S-04,
//            S-05, F-01, F-03, I-01, RC-01.
//
// CHANGE_SUMMARY:
//   - 2026-05-09 B4-pre-alpha-add: initial module. CommandRunner trait
//     + RealRunner + 3 Tauri commands. NEVER touches system or local
//     domains — only `-domain user` in lsregister and only the user
//     pref domain in defaults. NEVER panics — every error path returns
//     `Result<_, String>` with a typed prefix the renderer can map
//     (`tooling_missing:<tool>`, `defaults_write_failed:<rc>`, etc.).

use serde::Serialize;
use std::process::Command;
use std::time::Instant;

/// macOS bundle identifier — must match `identifier` in tauri.conf.json.
pub const MARK_BUNDLE_ID: &str = "com.xronocode.mark";

/// UTIs we register against. Both are emitted by macOS for `.md` files
/// depending on which app stamped the file with `kMDItemContentType`.
/// Newer files trend toward `public.markdown`; older Markdown editors
/// (TextMate, MacDown, Mark Text, etc.) still write
/// `net.daringfireball.markdown`. Cover both so we catch every `.md`.
pub const MD_UTIS: &[&str] = &["net.daringfireball.markdown", "public.markdown"];

/// `defaults` binary path. Hard-coded to `/usr/bin/defaults` because
/// PATH lookup in a GUI Tauri app is unreliable.
const DEFAULTS_BIN: &str = "/usr/bin/defaults";

/// `lsregister` lives deep in the CoreServices framework. The path has
/// been stable since macOS 10.6 — Apple has not relocated it across
/// versions. `which lsregister` returns nothing on a default $PATH.
const LSREGISTER_BIN: &str = "/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister";

/// LaunchServices secure preferences domain. The `secure` variant is
/// the modern one; the legacy `com.apple.LaunchServices` (without
/// `.secure`) is still read by macOS but has been deprecated since
/// 10.10.
const LS_DOMAIN: &str = "com.apple.LaunchServices/com.apple.launchservices.secure";

// ──────────────────────────────────────────────────────────────────────
// Public types
// ──────────────────────────────────────────────────────────────────────

/// Returned by `mt_get_default_md_handler`. `is_default=true` iff our
/// bundle identifier appears as the role-all/editor/viewer for any of
/// `MD_UTIS`. `current_handler` carries the bundle id of whatever app
/// IS currently the handler (useful for the Settings UI to show
/// "currently: Typora" before the user clicks "Make default").
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DefaultHandlerInfo {
    pub is_default: bool,
    pub current_handler: Option<String>,
}

// ──────────────────────────────────────────────────────────────────────
// CommandRunner abstraction
// ──────────────────────────────────────────────────────────────────────

/// Outcome of running a subprocess. `code=None` means the process was
/// killed by a signal or otherwise exited without a numeric code; we
/// treat that as failure for our purposes.
#[derive(Debug, Clone, Default)]
pub struct CmdOutput {
    pub code: Option<i32>,
    pub stdout: String,
    pub stderr: String,
}

impl CmdOutput {
    fn success(&self) -> bool {
        self.code == Some(0)
    }
}

/// Typed errors a runner can surface. We map io::ErrorKind::NotFound to
/// `ToolingMissing` so the caller can emit BLOCK_TOOLING_MISSING. All
/// other failures collapse to `IoError(message)`.
#[derive(Debug, Clone)]
pub enum CmdError {
    ToolingMissing,
    IoError(String),
}

impl CmdError {
    fn as_str(&self) -> &str {
        match self {
            CmdError::ToolingMissing => "tooling_missing",
            CmdError::IoError(_) => "io_error",
        }
    }
}

/// Abstraction over subprocess invocation so tests can script
/// outputs without shelling out. Production wires `RealRunner`; tests
/// wire `MockRunner` (defined in the `tests` module below).
pub trait CommandRunner: Send + Sync {
    /// Run `program` with `args`. Returns `CmdOutput` on success-or-
    /// nonzero-exit (caller inspects `.code`); returns `CmdError` only
    /// for spawn-time failures.
    fn run(&self, program: &str, args: &[&str]) -> Result<CmdOutput, CmdError>;
}

/// Production runner — wraps `std::process::Command`. Maps NotFound
/// to ToolingMissing so the caller's error translation is uniform.
pub struct RealRunner;

impl CommandRunner for RealRunner {
    fn run(&self, program: &str, args: &[&str]) -> Result<CmdOutput, CmdError> {
        match Command::new(program).args(args).output() {
            Ok(out) => Ok(CmdOutput {
                code: out.status.code(),
                stdout: String::from_utf8_lossy(&out.stdout).to_string(),
                stderr: String::from_utf8_lossy(&out.stderr).to_string(),
            }),
            Err(e) => {
                if e.kind() == std::io::ErrorKind::NotFound {
                    Err(CmdError::ToolingMissing)
                } else {
                    Err(CmdError::IoError(e.to_string()))
                }
            }
        }
    }
}

// ──────────────────────────────────────────────────────────────────────
// Core algorithms (pure-logic, runner-injected for tests)
// ──────────────────────────────────────────────────────────────────────

/// Parse the `defaults read ... LSHandlers` plist output to find the
/// bundle id currently registered for `uti`. Returns `Some(bundle_id)`
/// if any role (RoleAll / RoleEditor / RoleViewer) points at an app for
/// the matching content type; `None` if no entry exists.
///
/// `defaults read` emits a plist-1-like format:
///   {
///       LSHandlers = (
///           {
///               LSHandlerContentType = "net.daringfireball.markdown";
///               LSHandlerRoleAll = "com.example.app";
///           },
///           ...
///       );
///   }
///
/// Parser is deliberately tolerant — we walk the text scanning for
/// `LSHandlerContentType = "<uti>"` blocks delimited by `{` / `}` and
/// extract the first role assignment we find. Any failure returns None.
pub(crate) fn parse_handler_for_uti(plist_text: &str, uti: &str) -> Option<String> {
    let needle_quoted = format!("LSHandlerContentType = \"{uti}\"");
    let needle_bare = format!("LSHandlerContentType = {uti}");
    // Walk the text in entry-block chunks separated by `}`. Each chunk
    // is one LSHandlers entry.
    for chunk in plist_text.split('}') {
        let matches_uti = chunk.contains(&needle_quoted) || chunk.contains(&needle_bare);
        if !matches_uti {
            continue;
        }
        // Look for any of the three role keys. Prefer RoleAll, then
        // Editor, then Viewer. Return the first hit.
        for role_key in ["LSHandlerRoleAll", "LSHandlerRoleEditor", "LSHandlerRoleViewer"] {
            if let Some(bundle) = extract_quoted_value(chunk, role_key) {
                return Some(bundle);
            }
        }
    }
    None
}

/// Extract `<value>` from `<key> = "<value>"` or `<key> = <value>;`.
fn extract_quoted_value(haystack: &str, key: &str) -> Option<String> {
    let kv_marker = format!("{key} = ");
    let idx = haystack.find(&kv_marker)?;
    let rest = &haystack[idx + kv_marker.len()..];
    // Quoted form first.
    if let Some(stripped) = rest.strip_prefix('"') {
        let end = stripped.find('"')?;
        return Some(stripped[..end].to_string());
    }
    // Bare form: read until ';' or whitespace.
    let end = rest
        .find(|c: char| c == ';' || c == '\n' || c == '\r' || c == '}')
        .unwrap_or(rest.len());
    let val = rest[..end].trim();
    if val.is_empty() {
        None
    } else {
        Some(val.to_string())
    }
}

/// Run the `set` algorithm for ONE uti against ONE runner. Logs the
/// per-uti markers and returns Ok(()) on idempotent-noop OR
/// successful-write. Caller drives the lsregister reload AFTER all
/// utis are written.
fn set_one_uti(runner: &dyn CommandRunner, uti: &str) -> Result<(), String> {
    // 1. Read current LSHandlers; if our entry is already there, log
    //    BLOCK_IDEMPOTENT_NOOP and short-circuit.
    let read_out = match runner.run(DEFAULTS_BIN, &["read", LS_DOMAIN, "LSHandlers"]) {
        Ok(o) => o,
        Err(CmdError::ToolingMissing) => {
            eprintln!("[m021][set_handler][BLOCK_TOOLING_MISSING tool=defaults]");
            return Err("tooling_missing:defaults".into());
        }
        Err(CmdError::IoError(msg)) => {
            eprintln!(
                "[m021][set_handler][BLOCK_DEFAULTS_WRITE_FAILED reason=io_error rc=-1] err={msg}"
            );
            return Err(format!("defaults_read_failed:{msg}"));
        }
    };
    // `defaults read` returns rc=1 when the key is missing entirely —
    // that's not a failure for us, it just means no LSHandlers exist
    // yet. Treat empty-and-rc=1 as empty plist.
    let plist = if read_out.success() {
        read_out.stdout
    } else {
        String::new()
    };
    if let Some(existing) = parse_handler_for_uti(&plist, uti) {
        if existing == MARK_BUNDLE_ID {
            eprintln!(
                "[m021][set_handler][BLOCK_IDEMPOTENT_NOOP existing={MARK_BUNDLE_ID} uti={uti}]"
            );
            return Ok(());
        }
    }

    // 2. defaults write append-array. The value is a plist literal
    //    `{LSHandlerContentType="<uti>";LSHandlerRoleAll="<bundle>";}`
    let value = format!(
        "{{LSHandlerContentType=\"{uti}\";LSHandlerRoleAll=\"{MARK_BUNDLE_ID}\";}}"
    );
    let write_out = runner.run(
        DEFAULTS_BIN,
        &[
            "write",
            LS_DOMAIN,
            "LSHandlers",
            "-array-add",
            value.as_str(),
        ],
    );
    let out = match write_out {
        Ok(o) => o,
        Err(CmdError::ToolingMissing) => {
            eprintln!("[m021][set_handler][BLOCK_TOOLING_MISSING tool=defaults]");
            return Err("tooling_missing:defaults".into());
        }
        Err(CmdError::IoError(msg)) => {
            eprintln!(
                "[m021][set_handler][BLOCK_DEFAULTS_WRITE_FAILED reason=io_error rc=-1]"
            );
            return Err(format!("defaults_write_failed:{msg}"));
        }
    };
    if !out.success() {
        let rc = out.code.unwrap_or(-1);
        // Heuristic: most permission failures land with non-zero rc and
        // the substring "permission" / "not permitted" / "Operation not
        // permitted" / "denied" in stderr.
        let stderr_lower = out.stderr.to_lowercase();
        let reason = if stderr_lower.contains("permission")
            || stderr_lower.contains("not permitted")
            || stderr_lower.contains("denied")
        {
            "permission_denied"
        } else {
            "io_error"
        };
        eprintln!(
            "[m021][set_handler][BLOCK_DEFAULTS_WRITE_FAILED reason={reason} rc={rc}]"
        );
        return Err(format!("defaults_write_failed:{rc}"));
    }
    eprintln!("[m021][set_handler][BLOCK_DEFAULTS_WRITE_OK domain=user uti={uti}]");
    eprintln!(
        "[m021][set_handler][BLOCK_REGISTERED uti={uti} bundle={MARK_BUNDLE_ID}]"
    );
    Ok(())
}

/// Run lsregister -kill -r -domain user. Times the call and emits
/// BLOCK_LSREGISTER_RELOADED on success or BLOCK_LSREGISTER_FAILED on
/// non-zero rc. Used by both set + unset.
fn lsregister_reload(runner: &dyn CommandRunner, op: &str) -> Result<(), String> {
    let started = Instant::now();
    let out = runner.run(
        LSREGISTER_BIN,
        &["-kill", "-r", "-domain", "user"],
    );
    let elapsed_ms = started.elapsed().as_millis();
    match out {
        Ok(o) if o.success() => {
            eprintln!(
                "[m021][{op}][BLOCK_LSREGISTER_RELOADED domain=user duration_ms={elapsed_ms}]"
            );
            Ok(())
        }
        Ok(o) => {
            let rc = o.code.unwrap_or(-1);
            eprintln!("[m021][{op}][BLOCK_LSREGISTER_FAILED rc={rc}]");
            Err(format!("lsregister_failed:{rc}"))
        }
        Err(CmdError::ToolingMissing) => {
            eprintln!("[m021][{op}][BLOCK_TOOLING_MISSING tool=lsregister]");
            Err("tooling_missing:lsregister".into())
        }
        Err(CmdError::IoError(msg)) => {
            eprintln!("[m021][{op}][BLOCK_LSREGISTER_FAILED rc=-1]");
            Err(format!("lsregister_failed:{msg}"))
        }
    }
}

/// Set algorithm: register Mark for every UTI in MD_UTIS, then reload
/// Launch Services. Each UTI is independent — failure on one short-
/// circuits and the lsregister reload is skipped.
pub(crate) fn set_default_md_handler_inner(
    runner: &dyn CommandRunner,
) -> Result<(), String> {
    for uti in MD_UTIS {
        set_one_uti(runner, uti)?;
    }
    lsregister_reload(runner, "set_handler")?;
    Ok(())
}

/// Get algorithm. Reads LSHandlers, parses for Mark across MD_UTIS;
/// if not found, walks for whatever IS the current handler.
pub(crate) fn get_default_md_handler_inner(
    runner: &dyn CommandRunner,
) -> Result<DefaultHandlerInfo, String> {
    let read_out = match runner.run(DEFAULTS_BIN, &["read", LS_DOMAIN, "LSHandlers"]) {
        Ok(o) => o,
        Err(CmdError::ToolingMissing) => {
            eprintln!("[m021][get_handler][BLOCK_TOOLING_MISSING tool=defaults]");
            return Err("tooling_missing:defaults".into());
        }
        Err(CmdError::IoError(msg)) => {
            eprintln!(
                "[m021][get_handler][BLOCK_DEFAULTS_READ_FAILED reason=io_error]"
            );
            return Err(format!("defaults_read_failed:{msg}"));
        }
    };
    // rc=1 with empty stdout = no LSHandlers key set. Treat as empty.
    let plist = if read_out.success() {
        read_out.stdout
    } else {
        String::new()
    };

    // Walk the UTIs in priority order: net.daringfireball first, then
    // public.markdown. If we are the handler for either, report
    // is_default=true with our bundle id.
    let mut other_handler: Option<(String, String)> = None; // (uti, bundle)
    for uti in MD_UTIS {
        if let Some(bundle) = parse_handler_for_uti(&plist, uti) {
            if bundle == MARK_BUNDLE_ID {
                eprintln!(
                    "[m021][get_handler][BLOCK_QUERIED is_default=true current={MARK_BUNDLE_ID} uti={uti}]"
                );
                return Ok(DefaultHandlerInfo {
                    is_default: true,
                    current_handler: Some(MARK_BUNDLE_ID.to_string()),
                });
            } else if other_handler.is_none() {
                other_handler = Some(((*uti).to_string(), bundle));
            }
        }
    }
    // We are not the default. Return whatever IS, if anything.
    match other_handler {
        Some((uti, bundle)) => {
            eprintln!(
                "[m021][get_handler][BLOCK_QUERIED is_default=false current={bundle} uti={uti}]"
            );
            Ok(DefaultHandlerInfo {
                is_default: false,
                current_handler: Some(bundle),
            })
        }
        None => {
            eprintln!("[m021][get_handler][BLOCK_QUERIED is_default=false current=none uti=none]");
            Ok(DefaultHandlerInfo {
                is_default: false,
                current_handler: None,
            })
        }
    }
}

/// Unset algorithm. Read LSHandlers, build a new array with our
/// entries removed, write back, reload.
///
/// `defaults` doesn't have an array-remove-by-predicate; we delete
/// the whole LSHandlers array and append back every entry that DOES
/// NOT mention MARK_BUNDLE_ID. If no Mark entries exist, this is a
/// no-op (BLOCK_REMOVED existing=none).
pub(crate) fn unset_default_md_handler_inner(
    runner: &dyn CommandRunner,
) -> Result<(), String> {
    let read_out = match runner.run(DEFAULTS_BIN, &["read", LS_DOMAIN, "LSHandlers"]) {
        Ok(o) => o,
        Err(CmdError::ToolingMissing) => {
            eprintln!("[m021][unset_handler][BLOCK_TOOLING_MISSING tool=defaults]");
            return Err("tooling_missing:defaults".into());
        }
        Err(CmdError::IoError(msg)) => {
            eprintln!(
                "[m021][unset_handler][BLOCK_DEFAULTS_READ_FAILED reason=io_error]"
            );
            return Err(format!("defaults_read_failed:{msg}"));
        }
    };
    let plist = if read_out.success() {
        read_out.stdout
    } else {
        String::new()
    };

    // Find any Mark entries.
    let mut had_mark_entry = false;
    for uti in MD_UTIS {
        if let Some(bundle) = parse_handler_for_uti(&plist, uti) {
            if bundle == MARK_BUNDLE_ID {
                had_mark_entry = true;
                break;
            }
        }
    }
    if !had_mark_entry {
        eprintln!("[m021][unset_handler][BLOCK_REMOVED existing=none]");
        // Even when there's nothing to remove, still reload LS so the
        // operation is observable end-to-end (BLOCK_LSREGISTER_RELOADED
        // is part of the V-M-021 unset trace).
        lsregister_reload(runner, "unset_handler")?;
        return Ok(());
    }

    // Delete the whole LSHandlers array, then re-append every entry
    // that does NOT belong to Mark. Production macOS tolerates the
    // delete+rewrite sequence; partial state is recoverable on next
    // boot via re-set.
    let del_out = runner.run(DEFAULTS_BIN, &["delete", LS_DOMAIN, "LSHandlers"]);
    match del_out {
        Ok(o) if o.success() => {}
        Ok(o) => {
            // rc != 0 may simply mean "key already missing"; not fatal.
            let stderr_lower = o.stderr.to_lowercase();
            if !(stderr_lower.contains("does not exist") || stderr_lower.is_empty()) {
                let rc = o.code.unwrap_or(-1);
                eprintln!(
                    "[m021][unset_handler][BLOCK_DEFAULTS_WRITE_FAILED reason=io_error rc={rc}]"
                );
                return Err(format!("defaults_delete_failed:{rc}"));
            }
        }
        Err(CmdError::ToolingMissing) => {
            eprintln!("[m021][unset_handler][BLOCK_TOOLING_MISSING tool=defaults]");
            return Err("tooling_missing:defaults".into());
        }
        Err(CmdError::IoError(msg)) => {
            eprintln!(
                "[m021][unset_handler][BLOCK_DEFAULTS_WRITE_FAILED reason=io_error rc=-1]"
            );
            return Err(format!("defaults_delete_failed:{msg}"));
        }
    }

    // Re-append every non-Mark entry parsed from the original plist.
    // We re-walk per-chunk to preserve foreign entries verbatim.
    for chunk in plist.split('}') {
        let chunk = chunk.trim();
        if chunk.is_empty() || !chunk.contains("LSHandlerContentType") {
            continue;
        }
        // Skip Mark entries.
        let has_mark_role = chunk.contains(&format!("\"{MARK_BUNDLE_ID}\""))
            || chunk.contains(&format!(" {MARK_BUNDLE_ID};"));
        if has_mark_role {
            continue;
        }
        // Reconstruct minimal entry. We extract the content type +
        // first role we recognize.
        let content_type = extract_quoted_value(chunk, "LSHandlerContentType");
        let role_key_and_val = ["LSHandlerRoleAll", "LSHandlerRoleEditor", "LSHandlerRoleViewer"]
            .iter()
            .find_map(|k| extract_quoted_value(chunk, k).map(|v| (*k, v)));
        if let (Some(ct), Some((rk, rv))) = (content_type, role_key_and_val) {
            let value = format!("{{LSHandlerContentType=\"{ct}\";{rk}=\"{rv}\";}}");
            let _ = runner.run(
                DEFAULTS_BIN,
                &[
                    "write",
                    LS_DOMAIN,
                    "LSHandlers",
                    "-array-add",
                    value.as_str(),
                ],
            );
        }
    }

    eprintln!("[m021][unset_handler][BLOCK_REMOVED existing={MARK_BUNDLE_ID}]");
    lsregister_reload(runner, "unset_handler")?;
    Ok(())
}

// ──────────────────────────────────────────────────────────────────────
// Tauri commands (production runner)
// ──────────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn mt_set_default_md_handler() -> Result<(), String> {
    set_default_md_handler_inner(&RealRunner)
}

#[tauri::command]
pub async fn mt_get_default_md_handler() -> Result<DefaultHandlerInfo, String> {
    get_default_md_handler_inner(&RealRunner)
}

#[tauri::command]
pub async fn mt_unset_default_md_handler() -> Result<(), String> {
    unset_default_md_handler_inner(&RealRunner)
}

// ──────────────────────────────────────────────────────────────────────
// Tests — V-M-021 matrix subset verifiable without real shell
// ──────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;
    use std::sync::Mutex;

    /// Scripted-output runner. Each entry maps a `(program, args-joined)`
    /// key to a queue of CmdResults; `run` pops the front of the queue
    /// each invocation. If a key exhausts its queue or is absent,
    /// returns IoError("unscripted") so missing scripting surfaces fast.
    struct MockRunner {
        scripts: Mutex<HashMap<String, Vec<Result<CmdOutput, CmdError>>>>,
        calls: Mutex<Vec<(String, Vec<String>)>>,
    }

    impl MockRunner {
        fn new() -> Self {
            Self {
                scripts: Mutex::new(HashMap::new()),
                calls: Mutex::new(Vec::new()),
            }
        }
        fn key(program: &str, args: &[&str]) -> String {
            format!("{program} {}", args.join(" "))
        }
        fn script(&self, program: &str, args: &[&str], outcome: Result<CmdOutput, CmdError>) {
            let k = Self::key(program, args);
            self.scripts
                .lock()
                .unwrap()
                .entry(k)
                .or_default()
                .push(outcome);
        }
        /// Convenience: install ONE scripted result that matches any
        /// invocation of `program` regardless of args. Useful for
        /// "always fail" / "always missing" runners.
        fn always(&self, program: &str, outcome: Result<CmdOutput, CmdError>) {
            let k = format!("__any__ {program}");
            self.scripts
                .lock()
                .unwrap()
                .entry(k)
                .or_default()
                .push(outcome);
        }
        fn calls(&self) -> Vec<(String, Vec<String>)> {
            self.calls.lock().unwrap().clone()
        }
    }

    impl CommandRunner for MockRunner {
        fn run(&self, program: &str, args: &[&str]) -> Result<CmdOutput, CmdError> {
            self.calls
                .lock()
                .unwrap()
                .push((program.to_string(), args.iter().map(|s| s.to_string()).collect()));
            let exact_key = Self::key(program, args);
            let any_key = format!("__any__ {program}");
            let mut scripts = self.scripts.lock().unwrap();
            if let Some(q) = scripts.get_mut(&exact_key) {
                if !q.is_empty() {
                    return q.remove(0);
                }
            }
            if let Some(q) = scripts.get_mut(&any_key) {
                if !q.is_empty() {
                    return clone_outcome(&q[0]);
                }
            }
            Err(CmdError::IoError(format!("unscripted: {exact_key}")))
        }
    }

    fn clone_outcome(
        outcome: &Result<CmdOutput, CmdError>,
    ) -> Result<CmdOutput, CmdError> {
        match outcome {
            Ok(o) => Ok(o.clone()),
            Err(CmdError::ToolingMissing) => Err(CmdError::ToolingMissing),
            Err(CmdError::IoError(s)) => Err(CmdError::IoError(s.clone())),
        }
    }

    fn ok_stdout(s: &str) -> Result<CmdOutput, CmdError> {
        Ok(CmdOutput {
            code: Some(0),
            stdout: s.to_string(),
            stderr: String::new(),
        })
    }
    fn ok_empty() -> Result<CmdOutput, CmdError> {
        Ok(CmdOutput {
            code: Some(0),
            stdout: String::new(),
            stderr: String::new(),
        })
    }
    fn defaults_missing_key() -> Result<CmdOutput, CmdError> {
        // `defaults read` rc=1 when key doesn't exist.
        Ok(CmdOutput {
            code: Some(1),
            stdout: String::new(),
            stderr: "The domain/default pair of (...) does not exist".into(),
        })
    }
    fn perm_denied() -> Result<CmdOutput, CmdError> {
        Ok(CmdOutput {
            code: Some(1),
            stdout: String::new(),
            stderr: "Operation not permitted".into(),
        })
    }

    // ── S-01: happy-path set ──────────────────────────────────────────
    #[test]
    fn s01_set_happy_path_emits_block_registered_for_both_utis() {
        let runner = MockRunner::new();
        // LSHandlers key missing initially → defaults read returns rc=1.
        runner.script(
            DEFAULTS_BIN,
            &["read", LS_DOMAIN, "LSHandlers"],
            defaults_missing_key(),
        );
        runner.script(
            DEFAULTS_BIN,
            &["read", LS_DOMAIN, "LSHandlers"],
            defaults_missing_key(),
        );
        // Two writes succeed.
        runner.always(DEFAULTS_BIN, ok_empty());
        runner.always(LSREGISTER_BIN, ok_empty());
        set_default_md_handler_inner(&runner).expect("set must succeed");

        // Verify both writes were issued.
        let calls = runner.calls();
        let writes: Vec<_> = calls
            .iter()
            .filter(|(p, a)| p == DEFAULTS_BIN && a.first().map(|s| s.as_str()) == Some("write"))
            .collect();
        assert_eq!(writes.len(), 2, "expected one write per UTI; got {writes:?}");
        // lsregister was invoked exactly once.
        let lsr_calls: Vec<_> = calls.iter().filter(|(p, _)| p == LSREGISTER_BIN).collect();
        assert_eq!(lsr_calls.len(), 1);
        assert_eq!(
            lsr_calls[0].1,
            vec!["-kill".to_string(), "-r".into(), "-domain".into(), "user".into()],
            "lsregister must use -domain user, never system/local"
        );
    }

    // ── S-02: idempotent re-set ────────────────────────────────────────
    #[test]
    fn s02_idempotent_reset_skips_writes_for_already_registered_utis() {
        let plist = format!(
            r#"
            {{
                LSHandlers = (
                    {{
                        LSHandlerContentType = "net.daringfireball.markdown";
                        LSHandlerRoleAll = "{MARK_BUNDLE_ID}";
                    }},
                    {{
                        LSHandlerContentType = "public.markdown";
                        LSHandlerRoleAll = "{MARK_BUNDLE_ID}";
                    }}
                );
            }}"#
        );
        let runner = MockRunner::new();
        runner.script(
            DEFAULTS_BIN,
            &["read", LS_DOMAIN, "LSHandlers"],
            ok_stdout(&plist),
        );
        runner.script(
            DEFAULTS_BIN,
            &["read", LS_DOMAIN, "LSHandlers"],
            ok_stdout(&plist),
        );
        runner.always(LSREGISTER_BIN, ok_empty());

        set_default_md_handler_inner(&runner).expect("idempotent re-set must succeed");

        // No `defaults write` should have been issued.
        let calls = runner.calls();
        let writes: Vec<_> = calls
            .iter()
            .filter(|(p, a)| p == DEFAULTS_BIN && a.first().map(|s| s.as_str()) == Some("write"))
            .collect();
        assert!(
            writes.is_empty(),
            "idempotent re-set must not call defaults write; got {writes:?}"
        );
    }

    // ── S-04: get-after-set returns is_default=true ────────────────────
    #[test]
    fn s04_get_after_set_reports_is_default_true() {
        let plist = format!(
            r#"
            {{ LSHandlers = (
                {{
                    LSHandlerContentType = "public.markdown";
                    LSHandlerRoleAll = "{MARK_BUNDLE_ID}";
                }}
            );}}"#
        );
        let runner = MockRunner::new();
        runner.always(DEFAULTS_BIN, ok_stdout(&plist));
        let info = get_default_md_handler_inner(&runner).expect("get must succeed");
        assert_eq!(
            info,
            DefaultHandlerInfo {
                is_default: true,
                current_handler: Some(MARK_BUNDLE_ID.to_string()),
            }
        );
    }

    // ── S-05: get when no handler at all ──────────────────────────────
    #[test]
    fn s05_get_when_no_handler_returns_none() {
        let runner = MockRunner::new();
        runner.always(DEFAULTS_BIN, defaults_missing_key());
        let info = get_default_md_handler_inner(&runner).expect("get must succeed");
        assert_eq!(
            info,
            DefaultHandlerInfo {
                is_default: false,
                current_handler: None,
            }
        );
    }

    // ── S-05b: get when foreign app is current handler ────────────────
    #[test]
    fn s05b_get_reports_foreign_handler() {
        let plist = r#"
            { LSHandlers = (
                {
                    LSHandlerContentType = "net.daringfireball.markdown";
                    LSHandlerRoleAll = "com.example.typora";
                }
            );}"#;
        let runner = MockRunner::new();
        runner.always(DEFAULTS_BIN, ok_stdout(plist));
        let info = get_default_md_handler_inner(&runner).expect("get must succeed");
        assert_eq!(info.is_default, false);
        assert_eq!(info.current_handler.as_deref(), Some("com.example.typora"));
    }

    // ── F-01: defaults binary missing ──────────────────────────────────
    #[test]
    fn f01_defaults_missing_returns_tooling_error() {
        let runner = MockRunner::new();
        runner.always(DEFAULTS_BIN, Err(CmdError::ToolingMissing));
        let err = set_default_md_handler_inner(&runner)
            .expect_err("must fail when defaults is missing");
        assert!(
            err.starts_with("tooling_missing:defaults"),
            "unexpected err string: {err}"
        );
    }

    // ── F-03: permission denied on write ───────────────────────────────
    #[test]
    fn f03_permission_denied_on_write_returns_typed_error() {
        let runner = MockRunner::new();
        runner.script(
            DEFAULTS_BIN,
            &["read", LS_DOMAIN, "LSHandlers"],
            defaults_missing_key(),
        );
        // Any defaults invocation other than the read above (i.e. the
        // write) returns permission-denied.
        runner.always(DEFAULTS_BIN, perm_denied());
        let err = set_default_md_handler_inner(&runner)
            .expect_err("must fail on perm denied");
        assert!(
            err.starts_with("defaults_write_failed:"),
            "unexpected err string: {err}"
        );
    }

    // ── I-01: unset before set (idempotent) ────────────────────────────
    #[test]
    fn i01_unset_before_set_is_idempotent_ok() {
        let runner = MockRunner::new();
        // No LSHandlers to begin with.
        runner.script(
            DEFAULTS_BIN,
            &["read", LS_DOMAIN, "LSHandlers"],
            defaults_missing_key(),
        );
        runner.always(LSREGISTER_BIN, ok_empty());
        runner.always(DEFAULTS_BIN, ok_empty());
        unset_default_md_handler_inner(&runner).expect("unset must be idempotent ok");
    }

    // ── RC-01: partial failure recovery (write OK, lsregister fails;
    //          re-run heals) ──────────────────────────────────────────
    #[test]
    fn rc01_lsregister_fail_then_rerun_heals() {
        // First attempt: writes succeed but lsregister returns rc=2.
        let runner = MockRunner::new();
        runner.script(
            DEFAULTS_BIN,
            &["read", LS_DOMAIN, "LSHandlers"],
            defaults_missing_key(),
        );
        runner.script(
            DEFAULTS_BIN,
            &["read", LS_DOMAIN, "LSHandlers"],
            defaults_missing_key(),
        );
        // Both writes succeed.
        let write_value_a = format!(
            "{{LSHandlerContentType=\"{}\";LSHandlerRoleAll=\"{MARK_BUNDLE_ID}\";}}",
            MD_UTIS[0]
        );
        let write_value_b = format!(
            "{{LSHandlerContentType=\"{}\";LSHandlerRoleAll=\"{MARK_BUNDLE_ID}\";}}",
            MD_UTIS[1]
        );
        runner.script(
            DEFAULTS_BIN,
            &[
                "write",
                LS_DOMAIN,
                "LSHandlers",
                "-array-add",
                write_value_a.as_str(),
            ],
            ok_empty(),
        );
        runner.script(
            DEFAULTS_BIN,
            &[
                "write",
                LS_DOMAIN,
                "LSHandlers",
                "-array-add",
                write_value_b.as_str(),
            ],
            ok_empty(),
        );
        // First lsregister: fail.
        runner.script(
            LSREGISTER_BIN,
            &["-kill", "-r", "-domain", "user"],
            Ok(CmdOutput { code: Some(2), stdout: String::new(), stderr: "boom".into() }),
        );
        let err = set_default_md_handler_inner(&runner).expect_err("first run should fail");
        assert!(err.starts_with("lsregister_failed:"), "unexpected err: {err}");

        // Re-run: now LSHandlers reflects our prior writes; reads return
        // an idempotent plist; lsregister succeeds. The set call must
        // complete without issuing additional defaults writes (S-02 gate
        // applies) because both UTIs are already registered.
        let plist = format!(
            r#"{{
                LSHandlers = (
                    {{
                        LSHandlerContentType = "{}";
                        LSHandlerRoleAll = "{MARK_BUNDLE_ID}";
                    }},
                    {{
                        LSHandlerContentType = "{}";
                        LSHandlerRoleAll = "{MARK_BUNDLE_ID}";
                    }}
                );
            }}"#,
            MD_UTIS[0], MD_UTIS[1]
        );
        let runner2 = MockRunner::new();
        runner2.always(DEFAULTS_BIN, ok_stdout(&plist));
        runner2.always(LSREGISTER_BIN, ok_empty());
        set_default_md_handler_inner(&runner2).expect("rerun must heal");
        let calls = runner2.calls();
        let writes: Vec<_> = calls
            .iter()
            .filter(|(p, a)| p == DEFAULTS_BIN && a.first().map(|s| s.as_str()) == Some("write"))
            .collect();
        assert!(writes.is_empty(), "rerun must not re-write");
    }

    // ── parse_handler_for_uti unit tests ───────────────────────────────
    #[test]
    fn parser_extracts_role_all_for_uti() {
        let plist = r#"
            { LSHandlers = (
                {
                    LSHandlerContentType = "public.markdown";
                    LSHandlerRoleAll = "com.xronocode.mark";
                }
            );}"#;
        assert_eq!(
            parse_handler_for_uti(plist, "public.markdown").as_deref(),
            Some("com.xronocode.mark")
        );
        assert_eq!(parse_handler_for_uti(plist, "public.text"), None);
    }

    #[test]
    fn parser_handles_multiple_entries_picks_matching_uti() {
        let plist = r#"
            { LSHandlers = (
                {
                    LSHandlerContentType = "public.html";
                    LSHandlerRoleAll = "com.apple.Safari";
                },
                {
                    LSHandlerContentType = "net.daringfireball.markdown";
                    LSHandlerRoleEditor = "com.example.typora";
                }
            );}"#;
        assert_eq!(
            parse_handler_for_uti(plist, "public.html").as_deref(),
            Some("com.apple.Safari")
        );
        assert_eq!(
            parse_handler_for_uti(plist, "net.daringfireball.markdown").as_deref(),
            Some("com.example.typora")
        );
    }
}
