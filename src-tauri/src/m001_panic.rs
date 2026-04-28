// MODULE_CONTRACT
//   PURPOSE: M-001 panic hook. Installed BEFORE tauri::Builder so any
//            panic in fs / keyring / spell / updater / webview Rust code
//            paths produces a stable crash artifact (file under
//            cache_root + native dialog) instead of a zombie process.
//   SCOPE:   std::panic::set_hook + crash log writer + dialog show.
//            NEVER panics inside the panic handler itself (best-effort
//            fallbacks for cache_root unavailable / write fails).
//   DEPENDS: dialog::ask_native_error, mt_paths::cache_root, std::panic.
//   LINKS:   docs/development-plan.xml Phase-B1 step-10;
//            verification-plan.xml V-M-001 (crash-log + zombie-window
//            scenarios); mt_paths shared with Phase-B-pre2 cancel_log.
//   STATUS:  Phase-B1 step-10. session_chain_id is a UUIDv4 stamped
//            once per process lifetime (no Tauri runtime needed —
//            installed before Builder).
//
// CHANGE_SUMMARY:
//   - 2026-04-28 B1-step-10: initial install_panic_hook + crash-log
//     writer.

use std::fs::OpenOptions;
use std::io::Write;
use std::panic::PanicHookInfo;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::OnceLock;
use std::time::{SystemTime, UNIX_EPOCH};

/// One-shot guard so re-entrant panics (a panic during the hook) don't
/// recurse into the dialog/file-write paths.
static IN_HOOK: AtomicBool = AtomicBool::new(false);

/// Process-lifetime session chain identifier. Generated once at hook
/// install. Used in crash-log filenames so multiple crashes from the
/// same session correlate, and crashes from different sessions don't
/// overwrite each other.
static SESSION_CHAIN: OnceLock<String> = OnceLock::new();

fn now_unix() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn new_session_chain() -> String {
    // No external uuid crate yet — the rfd/sys-locale dep set keeps
    // scope tight. A 16-hex-char timestamp+pid composite is plenty
    // for crash-log correlation.
    let pid = std::process::id();
    let ts = now_unix();
    format!("{ts:016x}-{pid:08x}")
}

/// Crash-log path: cache_root().join(format!("crash-{ts}-{chain}.log")).
/// Returns None if cache_root() can't be resolved.
fn crash_log_path(ts_unix: u64, chain: &str) -> Option<PathBuf> {
    let root = crate::mt_paths::cache_root()?;
    Some(root.join(format!("crash-{ts_unix}-{chain}.log")))
}

/// Render a panic info into a stable, agent-friendly text body.
/// Includes payload (string or downcast-failed marker), location,
/// thread name, session chain, timestamp.
pub fn format_panic_body(info: &PanicHookInfo, ts_unix: u64, chain: &str) -> String {
    let payload = info.payload();
    let payload_str = if let Some(s) = payload.downcast_ref::<&str>() {
        (*s).to_string()
    } else if let Some(s) = payload.downcast_ref::<String>() {
        s.clone()
    } else {
        "<non-string panic payload>".to_string()
    };
    let location = info
        .location()
        .map(|l| format!("{}:{}:{}", l.file(), l.line(), l.column()))
        .unwrap_or_else(|| "<unknown location>".to_string());
    let thread = std::thread::current()
        .name()
        .unwrap_or("<unnamed>")
        .to_string();
    format!(
        "Mark crash report\n\
         ts_unix:        {ts_unix}\n\
         session_chain:  {chain}\n\
         thread:         {thread}\n\
         location:       {location}\n\
         message:\n  {payload_str}\n"
    )
}

/// Install the global panic hook. Idempotent at the type level —
/// std::panic::set_hook simply replaces; calling twice is harmless.
/// Emits [m001][panic][BLOCK_PANIC_HOOK_INSTALLED] on first call.
pub fn install_panic_hook() {
    let chain = new_session_chain();
    let _ = SESSION_CHAIN.set(chain.clone());
    eprintln!(
        "[m001][panic][BLOCK_PANIC_HOOK_INSTALLED session_chain={chain}]"
    );

    std::panic::set_hook(Box::new(move |info| {
        // Re-entrancy guard: if we panic again inside the hook (e.g.
        // dialog crate failed), fall through to the default handler.
        if IN_HOOK.swap(true, Ordering::SeqCst) {
            return;
        }

        let ts = now_unix();
        let chain_str = SESSION_CHAIN.get().cloned().unwrap_or_else(new_session_chain);
        let body = format_panic_body(info, ts, &chain_str);

        // 1. Stderr trace: fire the BLOCK marker even if file-write
        //    and dialog both fail — V-M-001 requires the marker.
        eprintln!(
            "[m001][panic][BLOCK_PANIC_HOOK_FIRED ts={ts} session_chain={chain_str}]"
        );
        eprintln!("{body}");

        // 2. Best-effort crash-log file. Failure is non-fatal; we
        //    still want the dialog to show.
        let mut log_path_str = "<not written>".to_string();
        if let Some(p) = crash_log_path(ts, &chain_str) {
            log_path_str = p.display().to_string();
            // Attempt to ensure the directory exists (cache_root may
            // not exist on first launch). Failure here just falls
            // through.
            if let Some(parent) = p.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            if let Ok(mut f) = OpenOptions::new()
                .create(true)
                .append(true)
                .open(&p)
            {
                let _ = f.write_all(body.as_bytes());
            }
        }

        // 3. Native dialog. Best-effort — never panics on its own
        //    per dialog::ask_native_error contract.
        crate::dialog::ask_native_error(
            "Mark — fatal error",
            &format!(
                "{body}\nA crash log was written to:\n  {log_path_str}\n\nPlease attach this file when filing an issue at https://github.com/xronocode/mark/issues."
            ),
        );

        IN_HOOK.store(false, Ordering::SeqCst);
    }));
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn format_panic_body_with_string_payload() {
        // Manually construct a fake panic context. PanicHookInfo can't
        // be built outside the panic runtime, so we test the parts we
        // CAN build deterministically: the rest of the body string
        // shape is exercised by the format! template directly.
        let chain = "abc-def";
        let ts = 1_777_000_000_u64;
        // Use a real panic hook to capture a real PanicHookInfo, then
        // call format_panic_body. catch_unwind is the standard way.
        let captured = std::panic::catch_unwind(|| {
            std::panic::set_hook(Box::new(move |info| {
                let body = format_panic_body(info, ts, chain);
                assert!(body.contains("ts_unix:"));
                assert!(body.contains("session_chain:  abc-def"));
                assert!(body.contains("synthetic test panic"));
                assert!(body.contains("location:"));
                // SAVE for the outer assert
                std::env::set_var("__MT_TEST_PANIC_BODY", body);
            }));
            panic!("synthetic test panic");
        });
        let _ = std::panic::take_hook();
        assert!(captured.is_err());
        let body = std::env::var("__MT_TEST_PANIC_BODY").unwrap();
        assert!(body.starts_with("Mark crash report\n"));
        assert!(body.contains("synthetic test panic"));
        std::env::remove_var("__MT_TEST_PANIC_BODY");
    }

    #[test]
    fn new_session_chain_is_pid_qualified() {
        let chain = new_session_chain();
        // 16-hex-ts + dash + 8-hex-pid = 25 chars
        assert_eq!(chain.len(), 25);
        assert!(chain.contains('-'));
    }

    #[test]
    fn now_unix_is_post_2020() {
        // Sanity: clock isn't stuck at epoch.
        assert!(now_unix() > 1_577_836_800); // 2020-01-01
    }
}
