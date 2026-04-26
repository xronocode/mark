// MODULE_CONTRACT
//   PURPOSE: Persist a single JSONL record per migration-dialog Cancel,
//            so downstream code can detect repeated cancels (Phase-B-pre2
//            step-4: rate-limit dialog after 3 cancels in 7 days).
//   SCOPE: Append-only writer for `sessions.jsonl` inside cache_root.
//          Pure record construction + append. No retention policy here —
//          step-4 reads the same file and decides what to show.
//   DEPENDS: serde + serde_json (already on the dep list); std::fs append.
//   LINKS: M-022 mt-paths (provides cache_root); Phase-B-pre2 step-3
//          (this module is its sole owner) and step-4 (reader).
//   LOG MARKERS: none emitted by this module. The call site (main.rs)
//                emits [main][bootstrap][BLOCK_MIGRATION_CANCEL_PERSISTED]
//                and [main][bootstrap][BLOCK_MIGRATION_CANCEL_PERSIST_FAILED]
//                based on the io::Result returned by append_record.
//                Per the trace-contract decision in Phase-B-pre2 step-7,
//                modules return Result and the bootstrap layer owns the
//                outcome marker — single emit point per outcome.
//

use serde::{Deserialize, Serialize};
use std::fs::OpenOptions;
use std::io::Write;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

const FILE_NAME: &str = "sessions.jsonl";

#[derive(Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct CancelRecord {
    /// Unix timestamp in seconds since the epoch. Plain integer keeps the
    /// file dependency-free for downstream tooling (jq, awk, grep).
    pub ts_unix: u64,
    pub app_version: String,
    /// Always "cancel" for this writer; future writers may add other choices.
    pub event: String,
}

impl CancelRecord {
    pub fn new_now(app_version: &str) -> Self {
        let ts_unix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        Self {
            ts_unix,
            app_version: app_version.to_string(),
            event: "cancel".to_string(),
        }
    }
}

/// Append a CancelRecord as a single JSON-Lines record to
/// `cache_root/sessions.jsonl`, creating intermediate directories on demand.
///
/// Append-only and idempotent w.r.t. directory creation; on I/O failure the
/// caller decides whether to abort the bootstrap or continue.
pub fn append_record(cache_root: &Path, record: &CancelRecord) -> std::io::Result<()> {
    std::fs::create_dir_all(cache_root)?;
    let path = cache_root.join(FILE_NAME);
    let line = serde_json::to_string(record)
        .map_err(|e| std::io::Error::other(format!("serialize: {e}")))?;
    let mut file = OpenOptions::new().create(true).append(true).open(&path)?;
    writeln!(file, "{line}")?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn record_round_trips_through_jsonl() {
        let tmp = TempDir::new().unwrap();
        let rec = CancelRecord {
            ts_unix: 1714086600,
            app_version: "0.0.1".into(),
            event: "cancel".into(),
        };
        append_record(tmp.path(), &rec).unwrap();

        let path = tmp.path().join("sessions.jsonl");
        let contents = std::fs::read_to_string(&path).unwrap();
        let parsed: CancelRecord = serde_json::from_str(contents.trim()).unwrap();
        assert_eq!(parsed, rec);
    }

    #[test]
    fn appends_one_line_per_call() {
        let tmp = TempDir::new().unwrap();
        for i in 0..3 {
            let rec = CancelRecord {
                ts_unix: 1714086600 + i,
                app_version: "0.0.1".into(),
                event: "cancel".into(),
            };
            append_record(tmp.path(), &rec).unwrap();
        }
        let contents = std::fs::read_to_string(tmp.path().join("sessions.jsonl")).unwrap();
        let lines: Vec<&str> = contents.trim().lines().collect();
        assert_eq!(lines.len(), 3);
        for (i, line) in lines.iter().enumerate() {
            let parsed: CancelRecord = serde_json::from_str(line).unwrap();
            assert_eq!(parsed.ts_unix, 1714086600 + i as u64);
            assert_eq!(parsed.event, "cancel");
        }
    }

    #[test]
    fn creates_cache_root_if_missing() {
        let tmp = TempDir::new().unwrap();
        let nested = tmp.path().join("a/b/c");
        // Pre: nested does not exist.
        assert!(!nested.exists());
        let rec = CancelRecord::new_now("0.0.1");
        append_record(&nested, &rec).unwrap();
        assert!(nested.join("sessions.jsonl").is_file());
    }

    #[test]
    fn cancel_record_new_now_uses_recent_timestamp() {
        let now_unix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();
        let rec = CancelRecord::new_now("0.0.1");
        // Allow a 5-second skew either way (tests may be slow on CI).
        assert!(rec.ts_unix.abs_diff(now_unix) < 5);
        assert_eq!(rec.app_version, "0.0.1");
        assert_eq!(rec.event, "cancel");
    }

    #[test]
    fn jsonl_does_not_contain_secret_substrings() {
        // Negative assertion borrowed from V-M-005: sessions.jsonl must
        // never accidentally embed GitHub-token-shaped substrings.
        let tmp = TempDir::new().unwrap();
        let rec = CancelRecord::new_now("0.0.1");
        append_record(tmp.path(), &rec).unwrap();
        let contents = std::fs::read_to_string(tmp.path().join("sessions.jsonl")).unwrap();
        for needle in ["github_pat_", "ghp_", "ghs_", "gho_", "Bearer "] {
            assert!(
                !contents.contains(needle),
                "unexpected substring {needle:?} found in sessions.jsonl",
            );
        }
    }
}
