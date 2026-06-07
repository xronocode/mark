// MODULE_CONTRACT
//   PURPOSE: M-045 live endpoint discovery. Writes and cleans up a
//            JSON file at a well-known path so external apps (e.g.
//            TokMo) can discover Mark's live-viewer HTTP server port.
//   SCOPE:   File I/O only: atomic write (temp + rename), cleanup on
//            graceful exit, stale PID detection. No HTTP, no session
//            state.
//   DEPENDS: serde/serde_json, std::fs, std::process.
//   LINKS:   docs/knowledge-graph.xml M-045;
//            docs/development-plan.xml Phase-B5a;
//            ROADMAP.md Decision D1 (HTTP POST IPC).
//   STATUS:  Phase-B5a initial — discovery file write/cleanup/stale.
//
// CHANGE_SUMMARY:
//   - 2026-06-08 B5a: initial live_endpoint module creation.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

// START_BLOCK_TYPES

/// Endpoint descriptor written to the discovery file. External apps
/// read this to find Mark's live-viewer server.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LiveEndpoint {
    /// Process ID of the Mark instance that owns this endpoint.
    pub pid: u32,
    /// TCP port the live-viewer HTTP server is listening on.
    pub port: u16,
    /// Protocol version (1 for v1).
    pub protocol_version: u32,
    /// Mark application version (from Cargo.toml).
    pub mark_version: String,
    /// Unique instance identifier for this Mark process.
    pub instance_id: String,
    /// ISO 8601 timestamp when the server started.
    pub started_at: String,
    /// Platform identifier, e.g. "macos-aarch64".
    pub platform: String,
}

// END_BLOCK_TYPES

// START_BLOCK_PATH

/// Returns the path to the discovery file:
/// ~/Library/Application Support/com.xronocode.mark/live-endpoint.json
fn endpoint_path() -> Result<PathBuf, String> {
    let home = std::env::var("HOME").map_err(|_| "HOME not set".to_string())?;
    let dir = PathBuf::from(home)
        .join("Library")
        .join("Application Support")
        .join("com.xronocode.mark");

    // Ensure directory exists.
    if !dir.exists() {
        std::fs::create_dir_all(&dir).map_err(|e| {
            safe_eprintln!(
                "[ExtHost][live_endpoint][BLOCK_MKDIR_FAILED path={} reason={e}]",
                dir.display()
            );
            e.to_string()
        })?;
    }

    Ok(dir.join("live-endpoint.json"))
}

// END_BLOCK_PATH

// START_BLOCK_WRITE

/// Write the endpoint discovery file. Uses atomic write (temp file +
/// rename) to prevent partial reads by external apps.
pub fn write_endpoint(endpoint: &LiveEndpoint) -> Result<(), String> {
    let path = endpoint_path()?;

    let json = serde_json::to_string_pretty(endpoint).map_err(|e| {
        safe_eprintln!(
            "[ExtHost][live_endpoint][BLOCK_SERIALIZE_FAILED reason={e}]"
        );
        e.to_string()
    })?;

    // Atomic write: write to a temp file in the same directory, then
    // rename. rename() is atomic on the same filesystem (POSIX guarantee).
    let tmp_path = path.with_extension("json.tmp");

    std::fs::write(&tmp_path, json.as_bytes()).map_err(|e| {
        safe_eprintln!(
            "[ExtHost][live_endpoint][BLOCK_WRITE_TMP_FAILED path={} reason={e}]",
            tmp_path.display()
        );
        e.to_string()
    })?;

    std::fs::rename(&tmp_path, &path).map_err(|e| {
        safe_eprintln!(
            "[ExtHost][live_endpoint][BLOCK_RENAME_FAILED src={} dst={} reason={e}]",
            tmp_path.display(),
            path.display()
        );
        // Clean up temp file on rename failure.
        let _ = std::fs::remove_file(&tmp_path);
        e.to_string()
    })?;

    safe_eprintln!(
        "[ExtHost][live_endpoint][BLOCK_WRITE_OK path={} port={} pid={}]",
        path.display(),
        endpoint.port,
        endpoint.pid,
    );

    Ok(())
}

// END_BLOCK_WRITE

// START_BLOCK_CLEANUP

/// Delete the discovery file on graceful exit. Best-effort: if the
/// file doesn't exist or can't be deleted, we log but don't fail.
pub fn cleanup_endpoint() -> Result<(), String> {
    let path = match endpoint_path() {
        Ok(p) => p,
        Err(e) => {
            safe_eprintln!(
                "[ExtHost][live_endpoint][BLOCK_CLEANUP_PATH_FAILED reason={e}]"
            );
            return Err(e);
        }
    };

    if !path.exists() {
        safe_eprintln!(
            "[ExtHost][live_endpoint][BLOCK_CLEANUP_NOOP reason=file_absent]"
        );
        return Ok(());
    }

    std::fs::remove_file(&path).map_err(|e| {
        safe_eprintln!(
            "[ExtHost][live_endpoint][BLOCK_CLEANUP_FAILED path={} reason={e}]",
            path.display()
        );
        e.to_string()
    })?;

    safe_eprintln!(
        "[ExtHost][live_endpoint][BLOCK_CLEANUP_OK path={}]",
        path.display()
    );

    Ok(())
}

// END_BLOCK_CLEANUP

// START_BLOCK_STALE_CHECK

/// Check if an existing discovery file has a stale PID (process not
/// running). Returns true if the file exists and the PID is not alive.
/// Returns false if the file doesn't exist, can't be read, or the PID
/// is still running.
pub fn check_stale() -> bool {
    let path = match endpoint_path() {
        Ok(p) => p,
        Err(_) => return false,
    };

    let content = match std::fs::read_to_string(&path) {
        Ok(c) => c,
        Err(_) => return false,
    };

    let endpoint: LiveEndpoint = match serde_json::from_str(&content) {
        Ok(e) => e,
        Err(e) => {
            safe_eprintln!(
                "[ExtHost][live_endpoint][BLOCK_STALE_PARSE_FAILED reason={e}]"
            );
            // Unparseable file is effectively stale.
            return true;
        }
    };

    let pid_alive = is_pid_alive(endpoint.pid);

    if !pid_alive {
        safe_eprintln!(
            "[ExtHost][live_endpoint][BLOCK_STALE_DETECTED pid={} port={}]",
            endpoint.pid,
            endpoint.port,
        );
    }

    !pid_alive
}

/// Check if a process with the given PID is still running.
/// Uses `kill -0 <pid>` via std::process::Command to avoid a libc
/// dependency. Returns true if the process exists, false otherwise.
fn is_pid_alive(pid: u32) -> bool {
    #[cfg(unix)]
    {
        std::process::Command::new("kill")
            .args(["-0", &pid.to_string()])
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .map(|s| s.success())
            .unwrap_or(false)
    }
    #[cfg(not(unix))]
    {
        let _ = pid;
        // On non-Unix platforms, assume stale to be safe.
        false
    }
}

// END_BLOCK_STALE_CHECK

// START_BLOCK_HELPERS

/// Create a LiveEndpoint for the current process.
pub fn make_endpoint(port: u16) -> LiveEndpoint {
    let platform = if cfg!(target_os = "macos") {
        if cfg!(target_arch = "aarch64") {
            "macos-aarch64"
        } else {
            "macos-x86_64"
        }
    } else if cfg!(target_os = "linux") {
        "linux-x86_64"
    } else {
        "unknown"
    };

    // Simple instance_id: pid + boot timestamp. Not a UUID to avoid
    // adding a dependency just for this.
    let pid = std::process::id();
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    let instance_id = format!("{pid}-{}", now.as_millis());

    // ISO 8601 timestamp (manual formatting to avoid chrono dependency).
    let secs = now.as_secs();
    let started_at = format_unix_timestamp(secs);

    LiveEndpoint {
        pid,
        port,
        protocol_version: 1,
        mark_version: env!("CARGO_PKG_VERSION").to_string(),
        instance_id,
        started_at,
        platform: platform.to_string(),
    }
}

/// Format a Unix timestamp as an ISO 8601 string (UTC).
/// Minimal implementation to avoid pulling in chrono.
fn format_unix_timestamp(secs: u64) -> String {
    // Days per month (non-leap year).
    const DAYS_IN_MONTH: [u64; 12] = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

    let total_days = secs / 86400;
    let time_of_day = secs % 86400;
    let hours = time_of_day / 3600;
    let minutes = (time_of_day % 3600) / 60;
    let seconds = time_of_day % 60;

    // Calculate year.
    let mut year = 1970u64;
    let mut remaining_days = total_days;
    loop {
        let days_in_year = if is_leap_year(year) { 366 } else { 365 };
        if remaining_days < days_in_year {
            break;
        }
        remaining_days -= days_in_year;
        year += 1;
    }

    // Calculate month and day.
    let mut month = 0usize;
    for m in 0..12 {
        let dim = if m == 1 && is_leap_year(year) {
            29
        } else {
            DAYS_IN_MONTH[m]
        };
        if remaining_days < dim {
            month = m;
            break;
        }
        remaining_days -= dim;
    }

    let day = remaining_days + 1;

    format!(
        "{year:04}-{:02}-{day:02}T{hours:02}:{minutes:02}:{seconds:02}Z",
        month + 1
    )
}

fn is_leap_year(y: u64) -> bool {
    (y % 4 == 0 && y % 100 != 0) || y % 400 == 0
}

// END_BLOCK_HELPERS
