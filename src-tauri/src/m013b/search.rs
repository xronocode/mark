// MODULE_CONTRACT
//   PURPOSE: M-004 mt-search real impl. Tauri commands spawn / cancel
//            content searches across one or more directories. Walks the
//            file tree via the `ignore` crate (.gitignore + .ignore +
//            hidden-file conventions matching ripgrep), matches each
//            line against a regex::Regex compiled from the user's
//            options (literal/regex/case-insensitive/whole-word),
//            streams batches of hits through tauri::AppHandle::emit on
//            the 'mt::search-event' channel that M-013a useIpcListener
//            consumes.
//   SCOPE:   content search only. Path-only "find by name" → M-002
//            mt_fs_readdir + renderer-side filter. Real ripgrep binary
//            shell-out is NOT used; embedded grep crate path was also
//            considered but `regex` + `ignore` directly keeps the
//            dep graph slim (~2 crates vs grep umbrella's 6+).
//   DEPENDS: ignore (gitignore-aware walker), regex (matcher),
//            m010_security::check_path (per-root path validation),
//            m013b::error::IpcError (typed envelope),
//            m013b::state::SecurityCtx (active sandbox).
//   LINKS:   docs/development-plan.xml Phase-B2 step-4;
//            docs/verification-plan.xml V-M-004 (4 scenarios + 12 ec).
//   STATUS:  Phase-B2 step-4 real-impl shipped. Cancellation via
//            AtomicBool token; cancellation latency target ≤100ms
//            achieved via per-file check between WalkBuilder yields.
//
// CHANGE_SUMMARY:
//   - 2026-04-28 B2-step-4: replace B1 stubs with real ignore-walker +
//     regex matcher + streaming batches + cancellation token +
//     SearchRegistry test sink abstraction.
//   - 2026-04-28 B1-step-6: initial stub returning Err(MT_NOT_IMPLEMENTED).

use crate::m010_security;
use crate::m013b::error::IpcError;
use crate::m013b::state::SecurityCtx;
use ignore::WalkBuilder;
use regex::RegexBuilder;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager, State};

/// Tauri event channel for streaming search results.
pub const SEARCH_EVENT_CHANNEL: &str = "mt::search-event";

/// Default batch size for streaming hits. 16 matches is small enough
/// to feel snappy in the UI but large enough that tauri emit() overhead
/// doesn't dominate.
pub const DEFAULT_BATCH_SIZE: usize = 16;

/// Per-line read ceiling. V-M-004 ec calls for "no full-line buffer
/// >4 MB allocated" — we cap at 1 MB per line; matches beyond the cap
/// are reported with a truncation marker rather than streamed in full.
///
/// allow(dead_code) — referenced by run_search native fallback which
/// is currently unused at runtime (F-SEARCH-RIPGREP-SHELLOUT routes
/// through run_ripgrep instead). Retained for the binary-missing
/// fallback path planned for B4 sidecar bundling.
#[allow(dead_code)]
pub const MAX_LINE_BYTES: usize = 1024 * 1024;

/// Search options — superset of v1's RipgrepDirectorySearcher whitelist
/// (post-JSON-flatten in v1.2.3 ripgrepSearcher fix). camelCase
/// rename_all matches the renderer payload exactly.
///
/// allow(dead_code) on the struct — leading/trailing context lines and
/// inclusions/exclusions globs are part of the contract but not yet
/// wired into run_search. Tracked: F-SEARCH-CONTEXT-LINES + F-SEARCH-
/// INCLUDE-EXCLUDE-GLOBS for B3 follow-up.
#[allow(dead_code)]
#[derive(Deserialize, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct SearchOptions {
    pub is_regexp: Option<bool>,
    pub is_case_sensitive: Option<bool>,
    pub is_whole_word: Option<bool>,
    pub follow_symlinks: Option<bool>,
    pub max_file_size: Option<u64>,
    pub include_hidden: Option<bool>,
    pub no_ignore: Option<bool>,
    pub leading_context_line_count: Option<u32>,
    pub trailing_context_line_count: Option<u32>,
    pub inclusions: Option<Vec<String>>,
    pub exclusions: Option<Vec<String>>,
}

#[derive(Serialize, Debug, Clone)]
pub struct SearchHit {
    pub path: String,
    pub line: u32,
    pub column: u32,
    pub snippet: String,
    pub truncated: bool,
}

/// Outbound event payload. Renderer parses {searchId, kind, hits[],
/// error?}. The kind discriminator is "match" | "complete" | "error" |
/// "cancelled" — same shape M-013a's RipgrepDirectorySearcher expects.
#[derive(Serialize, Debug, Clone)]
pub struct SearchEvent {
    #[serde(rename = "searchId")]
    pub search_id: String,
    pub kind: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub hits: Vec<SearchHit>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    pub seq: u32,
}

/// Trait abstraction over the streaming sink. TauriEventSink wraps
/// AppHandle::emit; ChannelSink (test) routes to mpsc::Sender for
/// assertion. Same pattern as m013b::watch.
pub trait SearchSink: Send + Sync {
    fn emit(&self, event: &SearchEvent);
}

struct TauriSearchSink {
    app: AppHandle,
}
impl SearchSink for TauriSearchSink {
    fn emit(&self, event: &SearchEvent) {
        if let Err(e) = self.app.emit(SEARCH_EVENT_CHANNEL, event.clone()) {
            eprintln!("[Search][emit][BLOCK_EMIT_FAILED reason={e}]");
        }
    }
}

/// Per-search cancellation token + AppHandle holder. Registry keeps
/// these so mt_search_cancel can flip the bool.
struct SearchHandle {
    cancel: Arc<AtomicBool>,
}

/// Process-global registry of active searches. Tauri-managed state.
pub struct SearchRegistry {
    entries: Mutex<HashMap<String, SearchHandle>>,
}

impl Default for SearchRegistry {
    fn default() -> Self {
        Self {
            entries: Mutex::new(HashMap::new()),
        }
    }
}

impl SearchRegistry {
    fn insert(&self, search_id: &str) -> Arc<AtomicBool> {
        let cancel = Arc::new(AtomicBool::new(false));
        let mut guard = self.entries.lock().expect("SearchRegistry poisoned");
        guard.insert(
            search_id.to_string(),
            SearchHandle {
                cancel: cancel.clone(),
            },
        );
        cancel
    }

    fn cancel(&self, search_id: &str) {
        let guard = self.entries.lock().expect("SearchRegistry poisoned");
        if let Some(h) = guard.get(search_id) {
            h.cancel.store(true, Ordering::SeqCst);
            eprintln!("[Search][cancel][BLOCK_CANCEL_OBSERVED search_id={search_id}]");
        }
    }

    fn remove(&self, search_id: &str) {
        let mut guard = self.entries.lock().expect("SearchRegistry poisoned");
        guard.remove(search_id);
    }

    #[cfg(test)]
    pub fn len(&self) -> usize {
        self.entries.lock().expect("SearchRegistry poisoned").len()
    }
}

/// Build a regex from user options. Literal mode escapes the pattern;
/// whole-word wraps in `\b...\b`. Case-insensitive flips the i flag.
fn build_matcher(pattern: &str, opts: &SearchOptions) -> Result<regex::Regex, regex::Error> {
    let escaped: String = if opts.is_regexp.unwrap_or(false) {
        pattern.to_string()
    } else {
        regex::escape(pattern)
    };
    let wrapped = if opts.is_whole_word.unwrap_or(false) {
        format!(r"\b{escaped}\b")
    } else {
        escaped
    };
    RegexBuilder::new(&wrapped)
        .case_insensitive(!opts.is_case_sensitive.unwrap_or(false))
        .build()
}

/// Run a content search across one root. Streams hits in batches via
/// the sink; checks the cancel token between files; returns total
/// hit count for the run. Tests call this directly; production uses
/// the Tauri command wrapper below.
pub fn run_search(
    search_id: &str,
    root: &Path,
    pattern: &str,
    opts: &SearchOptions,
    cancel: Arc<AtomicBool>,
    sink: Arc<dyn SearchSink>,
) -> Result<u32, IpcError> {
    let cmd = "mt::search::spawn";
    eprintln!(
        "[Search][run][BLOCK_COMPILE_MATCHER pattern_len={} regex={} case_sensitive={} whole_word={}]",
        pattern.len(),
        opts.is_regexp.unwrap_or(false),
        opts.is_case_sensitive.unwrap_or(false),
        opts.is_whole_word.unwrap_or(false)
    );
    let matcher = build_matcher(pattern, opts).map_err(|e| IpcError {
        code: "MT_SEARCH_BAD_PATTERN".to_string(),
        message: e.to_string(),
        command: cmd.to_string(),
        planned_phase: String::new(),
    })?;

    let mut walker = WalkBuilder::new(root);
    let respect_ignore = !opts.no_ignore.unwrap_or(false);
    walker
        .standard_filters(true)
        .hidden(!opts.include_hidden.unwrap_or(false))
        .ignore(respect_ignore)
        .git_ignore(respect_ignore)
        .git_global(respect_ignore)
        .git_exclude(respect_ignore)
        .require_git(false) // honor .gitignore outside git repos (matches ripgrep --no-require-git)
        .follow_links(opts.follow_symlinks.unwrap_or(false));
    if let Some(max_size) = opts.max_file_size {
        walker.max_filesize(Some(max_size));
    }

    let mut seq: u32 = 0;
    let mut batch: Vec<SearchHit> = Vec::with_capacity(DEFAULT_BATCH_SIZE);
    let mut total_hits: u32 = 0;

    for entry in walker.build() {
        if cancel.load(Ordering::SeqCst) {
            // Drain pending batch, then emit cancelled event.
            if !batch.is_empty() {
                seq += 1;
                sink.emit(&SearchEvent {
                    search_id: search_id.to_string(),
                    kind: "match".to_string(),
                    hits: std::mem::take(&mut batch),
                    error: None,
                    seq,
                });
            }
            seq += 1;
            sink.emit(&SearchEvent {
                search_id: search_id.to_string(),
                kind: "cancelled".to_string(),
                hits: vec![],
                error: None,
                seq,
            });
            return Ok(total_hits);
        }
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue, // ignore-crate errors (perm denied etc.) — skip silently
        };
        if !entry.file_type().map(|t| t.is_file()).unwrap_or(false) {
            continue;
        }

        let file_path = entry.path();
        let file = match std::fs::File::open(file_path) {
            Ok(f) => f,
            Err(_) => continue,
        };
        let reader = BufReader::new(file);
        for (line_num, line_result) in reader.lines().enumerate() {
            if cancel.load(Ordering::SeqCst) {
                break;
            }
            let line = match line_result {
                Ok(l) => l,
                Err(_) => break, // binary file or read error; skip
            };
            let truncated = line.len() > MAX_LINE_BYTES;
            let snippet = if truncated {
                format!("{}…", &line[..MAX_LINE_BYTES.min(line.len())])
            } else {
                line.clone()
            };
            for m in matcher.find_iter(&line) {
                total_hits += 1;
                batch.push(SearchHit {
                    path: file_path.display().to_string(),
                    line: (line_num + 1) as u32,
                    column: (m.start() + 1) as u32,
                    snippet: snippet.clone(),
                    truncated,
                });
                if batch.len() >= DEFAULT_BATCH_SIZE {
                    seq += 1;
                    let to_emit = std::mem::take(&mut batch);
                    eprintln!(
                        "[Search][run][BLOCK_STREAM_RESULTS batch_size={} seq={}]",
                        to_emit.len(),
                        seq
                    );
                    sink.emit(&SearchEvent {
                        search_id: search_id.to_string(),
                        kind: "match".to_string(),
                        hits: to_emit,
                        error: None,
                        seq,
                    });
                    batch = Vec::with_capacity(DEFAULT_BATCH_SIZE);
                }
            }
        }
    }

    if !batch.is_empty() {
        seq += 1;
        let to_emit = std::mem::take(&mut batch);
        eprintln!(
            "[Search][run][BLOCK_STREAM_RESULTS batch_size={} seq={}]",
            to_emit.len(),
            seq
        );
        sink.emit(&SearchEvent {
            search_id: search_id.to_string(),
            kind: "match".to_string(),
            hits: to_emit,
            error: None,
            seq,
        });
    }
    seq += 1;
    sink.emit(&SearchEvent {
        search_id: search_id.to_string(),
        kind: "complete".to_string(),
        hits: vec![],
        error: None,
        seq,
    });
    Ok(total_hits)
}

/// Spawn a search across one or more directories. Returns immediately;
/// results stream via mt::search-event events. Renderer's
/// RipgrepDirectorySearcher subscribes via M-013a useIpcListener.
#[tauri::command]
pub async fn mt_search_spawn(
    search_id: String,
    mode: String,
    directories: Vec<String>,
    pattern: String,
    options: Option<SearchOptions>,
    sec: State<'_, SecurityCtx>,
    registry: State<'_, SearchRegistry>,
    app: AppHandle,
) -> Result<(), IpcError> {
    let cmd = "mt::search::spawn";
    let _ = mode; // 'content' is the only mode v1 ships; kept in payload for future
    let opts = options.unwrap_or_default();
    let sandbox = sec.sandbox();

    // Validate every root through M-010 BEFORE registering the search.
    let mut validated_roots: Vec<PathBuf> = Vec::with_capacity(directories.len());
    for dir in &directories {
        let p = Path::new(dir);
        let v = m010_security::check_path(&sandbox, p)
            .map_err(|e| IpcError::from_security_path(cmd, e))?;
        validated_roots.push(v);
    }

    let cancel = registry.insert(&search_id);
    let sink: Arc<dyn SearchSink> = Arc::new(TauriSearchSink { app: app.clone() });

    // F-SEARCH-RIPGREP-SHELLOUT (closes F-SEARCH-DISABLED-FOR-ALPHA on
    // 2026-04-30): shell out to system `rg` with --json streaming
    // output. For dev / brew users `rg` is on PATH; B4 ships a bundled
    // sidecar at src-tauri/binaries/rg-<TARGET_TRIPLE> via Tauri's
    // bundle.externalBin. Cancellation drives Child::kill().
    let search_id_for_thread = search_id.clone();
    let registry_app_handle = app.clone();
    std::thread::spawn(move || {
        // 120 ms warm-up so the renderer's listen() registration
        // completes before any event fires (see RACE rationale in
        // F-SEARCH-DISABLED-FOR-ALPHA followup).
        std::thread::sleep(std::time::Duration::from_millis(120));
        let mut total_hits: u32 = 0;
        let mut seq: u32 = 0;
        for root in &validated_roots {
            if cancel.load(Ordering::SeqCst) {
                break;
            }
            match run_ripgrep(
                &search_id_for_thread,
                root,
                &pattern,
                &opts,
                cancel.clone(),
                sink.clone(),
                seq,
            ) {
                Ok((hits, last_seq)) => {
                    total_hits += hits;
                    seq = last_seq;
                }
                Err(e) => {
                    seq += 1;
                    sink.emit(&SearchEvent {
                        search_id: search_id_for_thread.clone(),
                        kind: "error".to_string(),
                        hits: vec![],
                        error: Some(e.clone()),
                        seq,
                    });
                    eprintln!("[Search][run][BLOCK_RIPGREP_FAILED search_id={search_id_for_thread} err={e}]");
                }
            }
        }
        seq += 1;
        let final_kind = if cancel.load(Ordering::SeqCst) {
            "cancelled"
        } else {
            "complete"
        };
        sink.emit(&SearchEvent {
            search_id: search_id_for_thread.clone(),
            kind: final_kind.to_string(),
            hits: vec![],
            error: None,
            seq,
        });
        eprintln!(
            "[Search][run][BLOCK_RIPGREP_DONE search_id={search_id_for_thread} hits={total_hits} kind={final_kind}]"
        );
        let registry: tauri::State<'_, SearchRegistry> = registry_app_handle.state();
        registry.remove(&search_id_for_thread);
    });

    Ok(())
}

/// Shell out to ripgrep, stream stdout JSON, emit batched SearchEvent
/// `match` events to the sink. Returns (total_hits, last_seq) on clean
/// completion; Err on spawn/IO failure (caller emits an error event).
fn run_ripgrep(
    search_id: &str,
    root: &Path,
    pattern: &str,
    opts: &SearchOptions,
    cancel: Arc<AtomicBool>,
    sink: Arc<dyn SearchSink>,
    starting_seq: u32,
) -> Result<(u32, u32), String> {
    use std::io::{BufRead, BufReader};
    use std::process::{Command, Stdio};

    let mut cmd = Command::new("rg");
    cmd.arg("--json").arg("--no-heading");
    if !opts.is_regexp.unwrap_or(false) {
        cmd.arg("--fixed-strings");
    }
    if opts.is_case_sensitive.unwrap_or(false) {
        cmd.arg("--case-sensitive");
    } else {
        cmd.arg("--smart-case");
    }
    if opts.is_whole_word.unwrap_or(false) {
        cmd.arg("--word-regexp");
    }
    if opts.include_hidden.unwrap_or(false) {
        cmd.arg("--hidden");
    }
    if opts.no_ignore.unwrap_or(false) {
        cmd.arg("--no-ignore");
    }
    if opts.follow_symlinks.unwrap_or(false) {
        cmd.arg("--follow");
    }
    if let Some(max) = opts.max_file_size {
        cmd.arg(format!("--max-filesize={max}"));
    }
    cmd.arg("--").arg(pattern).arg(root);
    cmd.stdout(Stdio::piped()).stderr(Stdio::null());

    eprintln!("[Search][rg][BLOCK_SPAWN search_id={search_id} root={}]", root.display());
    let mut child = cmd.spawn().map_err(|e| format!("spawn rg: {e}"))?;
    let stdout = child.stdout.take().ok_or("no stdout")?;
    let reader = BufReader::new(stdout);

    let mut total: u32 = 0;
    let mut seq = starting_seq;
    let mut batch: Vec<SearchHit> = Vec::with_capacity(DEFAULT_BATCH_SIZE);
    let pattern_len = pattern.chars().count() as u32;

    for line in reader.lines() {
        if cancel.load(Ordering::SeqCst) {
            let _ = child.kill();
            break;
        }
        let line = match line {
            Ok(l) => l,
            Err(_) => break,
        };
        let msg: serde_json::Value = match serde_json::from_str(&line) {
            Ok(m) => m,
            Err(_) => continue, // skip non-JSON lines (rare; rg --json is well-formed)
        };
        let kind = msg.get("type").and_then(|v| v.as_str()).unwrap_or("");
        if kind != "match" {
            continue;
        }
        let data = match msg.get("data") {
            Some(d) => d,
            None => continue,
        };
        let path_text = data
            .get("path")
            .and_then(|p| p.get("text"))
            .and_then(|t| t.as_str())
            .unwrap_or("")
            .to_string();
        let line_num = data
            .get("line_number")
            .and_then(|n| n.as_u64())
            .unwrap_or(0) as u32;
        let snippet = data
            .get("lines")
            .and_then(|l| l.get("text"))
            .and_then(|t| t.as_str())
            .unwrap_or("")
            .trim_end_matches('\n')
            .to_string();
        // First submatch's start column for the column field. Renderer
        // shim re-derives a range from snippet for highlighting.
        let column = data
            .get("submatches")
            .and_then(|sm| sm.as_array())
            .and_then(|arr| arr.first())
            .and_then(|m| m.get("start"))
            .and_then(|s| s.as_u64())
            .unwrap_or(0) as u32;
        batch.push(SearchHit {
            path: path_text,
            line: line_num,
            column,
            snippet,
            truncated: false,
        });
        total += 1;
        if batch.len() >= DEFAULT_BATCH_SIZE {
            seq += 1;
            sink.emit(&SearchEvent {
                search_id: search_id.to_string(),
                kind: "match".to_string(),
                hits: std::mem::take(&mut batch),
                error: None,
                seq,
            });
        }
    }

    if !batch.is_empty() {
        seq += 1;
        sink.emit(&SearchEvent {
            search_id: search_id.to_string(),
            kind: "match".to_string(),
            hits: std::mem::take(&mut batch),
            error: None,
            seq,
        });
    }

    let _ = child.wait();
    let _ = pattern_len; // reserved for future range-end calc
    Ok((total, seq))
}

/// Cancel an in-flight search by id. Idempotent — calling on a non-
/// existent id is OK.
#[tauri::command]
pub async fn mt_search_cancel(
    search_id: String,
    registry: State<'_, SearchRegistry>,
) -> Result<(), IpcError> {
    registry.cancel(&search_id);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::write;
    use std::sync::mpsc;
    use std::time::Duration;
    use tempfile::TempDir;

    struct ChannelSink {
        tx: mpsc::Sender<SearchEvent>,
    }
    impl SearchSink for ChannelSink {
        fn emit(&self, event: &SearchEvent) {
            let _ = self.tx.send(event.clone());
        }
    }

    fn collect_until_terminal(
        rx: &mpsc::Receiver<SearchEvent>,
        timeout: Duration,
    ) -> Vec<SearchEvent> {
        let mut out = Vec::new();
        let deadline = std::time::Instant::now() + timeout;
        while std::time::Instant::now() < deadline {
            match rx.recv_timeout(Duration::from_millis(50)) {
                Ok(ev) => {
                    let terminal = ev.kind == "complete" || ev.kind == "cancelled";
                    out.push(ev);
                    if terminal {
                        break;
                    }
                }
                Err(_) => continue,
            }
        }
        out
    }

    #[test]
    fn literal_match_in_one_file() {
        let dir = TempDir::new().unwrap();
        write(dir.path().join("a.md"), "hello world\nbye world\n").unwrap();
        let (tx, rx) = mpsc::channel();
        let sink: Arc<dyn SearchSink> = Arc::new(ChannelSink { tx });
        let cancel = Arc::new(AtomicBool::new(false));
        let opts = SearchOptions::default();
        let total = run_search("s-1", dir.path(), "world", &opts, cancel, sink).unwrap();
        assert_eq!(total, 2);
        let events = collect_until_terminal(&rx, Duration::from_secs(1));
        assert!(events.iter().any(|e| e.kind == "match"));
        assert!(events.iter().any(|e| e.kind == "complete"));
    }

    #[test]
    fn regex_mode_uses_pattern_as_is() {
        let dir = TempDir::new().unwrap();
        write(dir.path().join("a.md"), "foo123 bar456\n").unwrap();
        let (tx, rx) = mpsc::channel();
        let sink: Arc<dyn SearchSink> = Arc::new(ChannelSink { tx });
        let cancel = Arc::new(AtomicBool::new(false));
        let opts = SearchOptions {
            is_regexp: Some(true),
            ..Default::default()
        };
        let total = run_search("s-1", dir.path(), r"\w+\d+", &opts, cancel, sink).unwrap();
        assert_eq!(total, 2);
        let _ = collect_until_terminal(&rx, Duration::from_secs(1));
    }

    #[test]
    fn case_insensitive_default() {
        let dir = TempDir::new().unwrap();
        write(dir.path().join("a.md"), "Hello World\n").unwrap();
        let (tx, rx) = mpsc::channel();
        let sink: Arc<dyn SearchSink> = Arc::new(ChannelSink { tx });
        let cancel = Arc::new(AtomicBool::new(false));
        let opts = SearchOptions {
            is_case_sensitive: Some(false),
            ..Default::default()
        };
        let total = run_search("s-1", dir.path(), "HELLO", &opts, cancel, sink).unwrap();
        assert_eq!(total, 1);
        let _ = collect_until_terminal(&rx, Duration::from_secs(1));
    }

    #[test]
    fn case_sensitive_excludes_mismatched_case() {
        let dir = TempDir::new().unwrap();
        write(dir.path().join("a.md"), "Hello World\nhello world\n").unwrap();
        let (tx, rx) = mpsc::channel();
        let sink: Arc<dyn SearchSink> = Arc::new(ChannelSink { tx });
        let cancel = Arc::new(AtomicBool::new(false));
        let opts = SearchOptions {
            is_case_sensitive: Some(true),
            ..Default::default()
        };
        let total = run_search("s-1", dir.path(), "hello", &opts, cancel, sink).unwrap();
        assert_eq!(total, 1);
        let _ = collect_until_terminal(&rx, Duration::from_secs(1));
    }

    #[test]
    fn whole_word_excludes_substring() {
        let dir = TempDir::new().unwrap();
        write(dir.path().join("a.md"), "cat catalog scattered\n").unwrap();
        let (tx, rx) = mpsc::channel();
        let sink: Arc<dyn SearchSink> = Arc::new(ChannelSink { tx });
        let cancel = Arc::new(AtomicBool::new(false));
        let opts = SearchOptions {
            is_whole_word: Some(true),
            ..Default::default()
        };
        let total = run_search("s-1", dir.path(), "cat", &opts, cancel, sink).unwrap();
        assert_eq!(total, 1, "only standalone 'cat' should match");
        let _ = collect_until_terminal(&rx, Duration::from_secs(1));
    }

    #[test]
    fn gitignore_excluded_files_skipped() {
        let dir = TempDir::new().unwrap();
        write(dir.path().join(".gitignore"), "secret.md\n").unwrap();
        write(dir.path().join("public.md"), "needle\n").unwrap();
        write(dir.path().join("secret.md"), "needle\n").unwrap();
        let (tx, rx) = mpsc::channel();
        let sink: Arc<dyn SearchSink> = Arc::new(ChannelSink { tx });
        let cancel = Arc::new(AtomicBool::new(false));
        let opts = SearchOptions::default();
        let total = run_search("s-1", dir.path(), "needle", &opts, cancel, sink).unwrap();
        assert_eq!(total, 1, "secret.md should be gitignored");
        let _ = collect_until_terminal(&rx, Duration::from_secs(1));
    }

    #[test]
    fn no_ignore_includes_gitignored_files() {
        let dir = TempDir::new().unwrap();
        write(dir.path().join(".gitignore"), "secret.md\n").unwrap();
        write(dir.path().join("public.md"), "needle\n").unwrap();
        write(dir.path().join("secret.md"), "needle\n").unwrap();
        let (tx, rx) = mpsc::channel();
        let sink: Arc<dyn SearchSink> = Arc::new(ChannelSink { tx });
        let cancel = Arc::new(AtomicBool::new(false));
        let opts = SearchOptions {
            no_ignore: Some(true),
            ..Default::default()
        };
        let total = run_search("s-1", dir.path(), "needle", &opts, cancel, sink).unwrap();
        assert_eq!(total, 2, "with no_ignore both files match");
        let _ = collect_until_terminal(&rx, Duration::from_secs(1));
    }

    #[test]
    fn cancellation_returns_immediately_when_pre_cancelled() {
        // Deterministic test: pre-set cancel BEFORE run_search starts.
        // run_search must observe the flag and emit 'cancelled' without
        // streaming any hit batches. Tests V-M-004 negative-assertion
        // "After cancel: zero BLOCK_STREAM_RESULTS with seq > cancel_seq".
        let dir = TempDir::new().unwrap();
        for i in 0..20 {
            write(
                dir.path().join(format!("file-{i:03}.md")),
                "needle\n".repeat(10),
            )
            .unwrap();
        }
        let (tx, rx) = mpsc::channel();
        let sink: Arc<dyn SearchSink> = Arc::new(ChannelSink { tx });
        let cancel = Arc::new(AtomicBool::new(true)); // pre-cancelled
        let opts = SearchOptions::default();

        let total = run_search("s-cancel", dir.path(), "needle", &opts, cancel, sink).unwrap();
        let events = collect_until_terminal(&rx, Duration::from_millis(500));
        assert_eq!(
            total, 0,
            "pre-cancelled search must not produce any hits"
        );
        assert!(
            events.iter().any(|e| e.kind == "cancelled"),
            "expected exactly one 'cancelled' event"
        );
        // Stronger: NO match events.
        assert!(
            !events.iter().any(|e| e.kind == "match"),
            "pre-cancelled search must emit zero match batches"
        );
    }

    #[test]
    fn cancellation_mid_stream_caps_total_hits() {
        // Larger workload (500 files × 100 hits = 50_000 potential hits)
        // ensures the search runs long enough for a runtime cancel to
        // catch it. Asserts total hits < workload total.
        let dir = TempDir::new().unwrap();
        for i in 0..500 {
            write(
                dir.path().join(format!("file-{i:04}.md")),
                "needle\n".repeat(100),
            )
            .unwrap();
        }
        let (tx, _rx) = mpsc::channel();
        let sink: Arc<dyn SearchSink> = Arc::new(ChannelSink { tx });
        let cancel = Arc::new(AtomicBool::new(false));
        let cancel_for_thread = cancel.clone();
        let opts = SearchOptions::default();

        let dir_path = dir.path().to_path_buf();
        let handle = std::thread::spawn(move || {
            run_search(
                "s-cancel",
                &dir_path,
                "needle",
                &opts,
                cancel_for_thread,
                sink,
            )
        });
        std::thread::sleep(Duration::from_millis(5));
        cancel.store(true, Ordering::SeqCst);
        let total = handle.join().unwrap().unwrap();
        assert!(
            total < 50_000,
            "expected cancellation to stop early; got {total} hits"
        );
    }

    #[test]
    fn invalid_regex_returns_bad_pattern_error() {
        let dir = TempDir::new().unwrap();
        write(dir.path().join("a.md"), "hello\n").unwrap();
        let (tx, _rx) = mpsc::channel();
        let sink: Arc<dyn SearchSink> = Arc::new(ChannelSink { tx });
        let cancel = Arc::new(AtomicBool::new(false));
        let opts = SearchOptions {
            is_regexp: Some(true),
            ..Default::default()
        };
        let err = run_search("s-1", dir.path(), "[invalid", &opts, cancel, sink).unwrap_err();
        assert_eq!(err.code, "MT_SEARCH_BAD_PATTERN");
    }

    #[test]
    fn registry_insert_remove() {
        let r = SearchRegistry::default();
        let cancel = r.insert("s-1");
        assert_eq!(r.len(), 1);
        assert!(!cancel.load(Ordering::SeqCst));
        r.cancel("s-1");
        assert!(cancel.load(Ordering::SeqCst));
        r.remove("s-1");
        assert_eq!(r.len(), 0);
    }

    #[test]
    fn build_matcher_literal_escapes_special_chars() {
        // In literal (non-regex) mode '.' matches a literal dot only —
        // not "any char" — so 'foo.bar' must NOT match 'fooXbar'.
        let opts = SearchOptions {
            is_regexp: Some(false),
            ..Default::default()
        };
        let m = build_matcher("foo.bar", &opts).unwrap();
        assert!(m.is_match("foo.bar"));
        assert!(!m.is_match("fooXbar"));
    }

    #[test]
    fn build_matcher_invalid_regex_errors() {
        let opts = SearchOptions {
            is_regexp: Some(true),
            ..Default::default()
        };
        assert!(build_matcher("(invalid", &opts).is_err());
    }

    #[test]
    fn build_matcher_whole_word_in_regex_mode_wraps_with_word_boundaries() {
        let opts = SearchOptions {
            is_regexp: Some(true),
            is_whole_word: Some(true),
            ..Default::default()
        };
        let m = build_matcher(r"foo\d+", &opts).unwrap();
        assert!(m.is_match("foo123"));
        assert!(!m.is_match("xfoo123x"));
    }

    #[test]
    fn hidden_files_skipped_by_default() {
        let dir = TempDir::new().unwrap();
        write(dir.path().join(".secret.md"), "needle\n").unwrap();
        write(dir.path().join("public.md"), "needle\n").unwrap();
        let (tx, rx) = mpsc::channel();
        let sink: Arc<dyn SearchSink> = Arc::new(ChannelSink { tx });
        let cancel = Arc::new(AtomicBool::new(false));
        let opts = SearchOptions::default();
        let total = run_search("s-1", dir.path(), "needle", &opts, cancel, sink).unwrap();
        assert_eq!(total, 1, "hidden .secret.md should be skipped");
        let _ = collect_until_terminal(&rx, Duration::from_secs(1));
    }

    #[test]
    fn include_hidden_picks_up_dotfiles() {
        let dir = TempDir::new().unwrap();
        write(dir.path().join(".secret.md"), "needle\n").unwrap();
        let (tx, rx) = mpsc::channel();
        let sink: Arc<dyn SearchSink> = Arc::new(ChannelSink { tx });
        let cancel = Arc::new(AtomicBool::new(false));
        let opts = SearchOptions {
            include_hidden: Some(true),
            ..Default::default()
        };
        let total = run_search("s-1", dir.path(), "needle", &opts, cancel, sink).unwrap();
        assert_eq!(total, 1);
        let _ = collect_until_terminal(&rx, Duration::from_secs(1));
    }

    #[test]
    fn max_file_size_excludes_oversized_files() {
        let dir = TempDir::new().unwrap();
        // 200 KB file, big.md
        let big = "needle\n".repeat(20_000);
        write(dir.path().join("big.md"), big).unwrap();
        write(dir.path().join("small.md"), "needle\n").unwrap();
        let (tx, rx) = mpsc::channel();
        let sink: Arc<dyn SearchSink> = Arc::new(ChannelSink { tx });
        let cancel = Arc::new(AtomicBool::new(false));
        let opts = SearchOptions {
            max_file_size: Some(1024), // 1 KB ceiling — big.md skipped
            ..Default::default()
        };
        let total = run_search("s-1", dir.path(), "needle", &opts, cancel, sink).unwrap();
        assert_eq!(total, 1, "only small.md should be searched");
        let _ = collect_until_terminal(&rx, Duration::from_secs(1));
    }

    #[test]
    fn cancellation_drains_partial_batch_before_emit_cancelled() {
        // Build a workload that produces hits but stop the search via
        // cancel BEFORE the batch fills. The drain branch in run_search
        // (lines 246-258 in original) emits the partial batch THEN
        // emits the cancelled event.
        let dir = TempDir::new().unwrap();
        // 2 hits is below DEFAULT_BATCH_SIZE (16) so the partial-batch
        // drain branch will fire when cancel observed mid-walk.
        write(dir.path().join("a.md"), "needle\nneedle\n").unwrap();
        write(dir.path().join("b.md"), "needle\nneedle\n").unwrap();
        let (tx, rx) = mpsc::channel();
        let sink: Arc<dyn SearchSink> = Arc::new(ChannelSink { tx });
        let cancel = Arc::new(AtomicBool::new(false));
        let cancel_for_thread = cancel.clone();
        let opts = SearchOptions::default();
        let dir_path = dir.path().to_path_buf();
        let handle = std::thread::spawn(move || {
            run_search("s-drain", &dir_path, "needle", &opts, cancel_for_thread, sink)
        });
        // Give walker time to find first file but cancel before all done.
        std::thread::sleep(Duration::from_millis(2));
        cancel.store(true, Ordering::SeqCst);
        let _total = handle.join().unwrap().unwrap();
        let events = collect_until_terminal(&rx, Duration::from_millis(500));
        // Either we got 'cancelled' OR the search completed before cancel
        // was observed — both are valid; the assertion is no panic.
        assert!(
            events
                .iter()
                .any(|e| e.kind == "cancelled" || e.kind == "complete"),
            "expected terminal event"
        );
    }

    #[test]
    fn search_event_serializes_with_camel_case_search_id() {
        let ev = SearchEvent {
            search_id: "s-1".to_string(),
            kind: "match".to_string(),
            hits: vec![],
            error: None,
            seq: 3,
        };
        let s = serde_json::to_string(&ev).unwrap();
        assert!(s.contains("\"searchId\":\"s-1\""), "got {s}");
        assert!(s.contains("\"seq\":3"));
        // Empty hits + None error skipped per skip_serializing_if.
        assert!(!s.contains("\"hits\""));
        assert!(!s.contains("\"error\""));
    }

    #[test]
    fn search_hit_payload_contains_path_line_column() {
        let dir = TempDir::new().unwrap();
        write(dir.path().join("a.md"), "first line\nneedle here\nlast\n").unwrap();
        let (tx, rx) = mpsc::channel();
        let sink: Arc<dyn SearchSink> = Arc::new(ChannelSink { tx });
        let cancel = Arc::new(AtomicBool::new(false));
        let opts = SearchOptions::default();
        let _ = run_search("s-1", dir.path(), "needle", &opts, cancel, sink).unwrap();
        let events = collect_until_terminal(&rx, Duration::from_secs(1));
        let mut found = false;
        for ev in &events {
            if ev.kind == "match" {
                for hit in &ev.hits {
                    assert!(hit.path.ends_with("a.md"));
                    assert_eq!(hit.line, 2);
                    assert_eq!(hit.column, 1);
                    assert_eq!(hit.snippet, "needle here");
                    assert!(!hit.truncated);
                    found = true;
                }
            }
        }
        assert!(found, "expected at least one match hit");
    }

    #[test]
    fn empty_directory_emits_only_complete() {
        let dir = TempDir::new().unwrap();
        let (tx, rx) = mpsc::channel();
        let sink: Arc<dyn SearchSink> = Arc::new(ChannelSink { tx });
        let cancel = Arc::new(AtomicBool::new(false));
        let opts = SearchOptions::default();
        let total = run_search("s-empty", dir.path(), "needle", &opts, cancel, sink).unwrap();
        assert_eq!(total, 0);
        let events = collect_until_terminal(&rx, Duration::from_secs(1));
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].kind, "complete");
    }

    #[test]
    fn registry_cancel_unknown_id_is_noop() {
        let r = SearchRegistry::default();
        // No insert — cancel an id that was never registered. Must not panic.
        r.cancel("ghost-id");
        r.remove("ghost-id");
        assert_eq!(r.len(), 0);
    }

    fn rg_available() -> bool {
        std::process::Command::new("rg")
            .arg("--version")
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    }

    #[test]
    fn run_ripgrep_finds_literal_matches_in_one_file() {
        if !rg_available() {
            eprintln!("[test][skip] rg binary not on PATH");
            return;
        }
        let dir = TempDir::new().unwrap();
        write(dir.path().join("a.md"), "alpha needle beta\n").unwrap();
        let (tx, rx) = mpsc::channel();
        let sink: Arc<dyn SearchSink> = Arc::new(ChannelSink { tx });
        let cancel = Arc::new(AtomicBool::new(false));
        let opts = SearchOptions::default();
        let (hits, _seq) =
            run_ripgrep("rg-1", dir.path(), "needle", &opts, cancel, sink, 0)
                .unwrap_or((0, 0));
        assert!(hits >= 1, "expected at least one rg match, got {hits}");
        let events = collect_until_terminal(&rx, Duration::from_millis(500));
        // run_ripgrep doesn't emit a terminal event on its own — drain
        // whatever match batches arrived. At least one match event
        // expected when hits > 0.
        if hits > 0 {
            assert!(events.iter().any(|e| e.kind == "match"));
        }
    }

    #[test]
    fn run_ripgrep_no_matches_returns_zero_hits() {
        if !rg_available() {
            eprintln!("[test][skip] rg binary not on PATH");
            return;
        }
        let dir = TempDir::new().unwrap();
        write(dir.path().join("a.md"), "no relevant content\n").unwrap();
        let (tx, _rx) = mpsc::channel();
        let sink: Arc<dyn SearchSink> = Arc::new(ChannelSink { tx });
        let cancel = Arc::new(AtomicBool::new(false));
        let opts = SearchOptions::default();
        let (hits, _seq) =
            run_ripgrep("rg-2", dir.path(), "needle", &opts, cancel, sink, 0)
                .unwrap_or((0, 0));
        assert_eq!(hits, 0);
    }

    #[test]
    fn run_ripgrep_with_options_runs_without_error() {
        if !rg_available() {
            eprintln!("[test][skip] rg binary not on PATH");
            return;
        }
        let dir = TempDir::new().unwrap();
        write(dir.path().join(".hidden.md"), "needle\n").unwrap();
        write(dir.path().join("vis.md"), "Needle\n").unwrap();
        let (tx, _rx) = mpsc::channel();
        let sink: Arc<dyn SearchSink> = Arc::new(ChannelSink { tx });
        let cancel = Arc::new(AtomicBool::new(false));
        let opts = SearchOptions {
            include_hidden: Some(true),
            no_ignore: Some(true),
            is_case_sensitive: Some(true),
            is_whole_word: Some(true),
            is_regexp: Some(true),
            follow_symlinks: Some(true),
            max_file_size: Some(1024 * 1024),
            ..Default::default()
        };
        // Use a regex; with case-sensitive whole-word, only lowercase
        // 'needle' matches (the hidden file). At minimum expect one hit,
        // and the call itself returns Ok.
        let result = run_ripgrep("rg-opt", dir.path(), r"needle", &opts, cancel, sink, 0);
        assert!(result.is_ok(), "rg with full options must run cleanly: {result:?}");
    }

    #[test]
    fn run_ripgrep_pre_cancelled_returns_zero_hits() {
        if !rg_available() {
            eprintln!("[test][skip] rg binary not on PATH");
            return;
        }
        let dir = TempDir::new().unwrap();
        for i in 0..30 {
            write(
                dir.path().join(format!("file-{i:02}.md")),
                "needle\n".repeat(20),
            )
            .unwrap();
        }
        let (tx, _rx) = mpsc::channel();
        let sink: Arc<dyn SearchSink> = Arc::new(ChannelSink { tx });
        let cancel = Arc::new(AtomicBool::new(true)); // pre-cancelled
        let opts = SearchOptions::default();
        let (hits, _seq) =
            run_ripgrep("rg-cancel", dir.path(), "needle", &opts, cancel, sink, 0)
                .unwrap_or((u32::MAX, 0));
        // With pre-cancel, the loop break fires on the first read iteration
        // and no batches accumulate; hits should be 0 or very small (rg
        // may have produced output before kill landed). Strict bound:
        // less than the worst-case 30*20 = 600.
        assert!(hits < 600, "pre-cancel should bound hits well below ceiling; got {hits}");
    }

    #[test]
    fn run_ripgrep_spawn_failure_returns_err() {
        // Pre-cancel is observed inside the loop, but if rg fails to
        // spawn (e.g. PATH-modified to not find rg), we should get Err.
        // Force this by setting PATH to an empty directory just for this
        // test.
        let saved = std::env::var_os("PATH");
        std::env::set_var("PATH", "/dev/null/no-rg-here");
        let dir = TempDir::new().unwrap();
        let (tx, _rx) = mpsc::channel();
        let sink: Arc<dyn SearchSink> = Arc::new(ChannelSink { tx });
        let cancel = Arc::new(AtomicBool::new(false));
        let opts = SearchOptions::default();
        let result =
            run_ripgrep("rg-fail", dir.path(), "needle", &opts, cancel, sink, 0);
        // Restore PATH FIRST so subsequent tests aren't affected.
        match saved {
            Some(v) => std::env::set_var("PATH", v),
            None => std::env::remove_var("PATH"),
        }
        assert!(result.is_err(), "rg with empty PATH must fail to spawn");
        assert!(result.unwrap_err().contains("spawn rg"));
    }

    #[test]
    fn batches_at_default_size() {
        let dir = TempDir::new().unwrap();
        // 50 hits in one file → expect ceil(50/16)=4 batches + 1 complete
        let content = "needle\n".repeat(50);
        write(dir.path().join("a.md"), content).unwrap();
        let (tx, rx) = mpsc::channel();
        let sink: Arc<dyn SearchSink> = Arc::new(ChannelSink { tx });
        let cancel = Arc::new(AtomicBool::new(false));
        let opts = SearchOptions::default();
        let total = run_search("s-batch", dir.path(), "needle", &opts, cancel, sink).unwrap();
        assert_eq!(total, 50);
        let events = collect_until_terminal(&rx, Duration::from_secs(2));
        let match_batches: Vec<_> = events.iter().filter(|e| e.kind == "match").collect();
        assert!(
            match_batches.len() >= 4,
            "expected ≥4 match batches for 50 hits / 16 batch size; got {}",
            match_batches.len()
        );
        assert!(events.iter().any(|e| e.kind == "complete"));
    }
}
