// FILE: src-tauri/src/m013b/search.rs
// VERSION: 2.3.0-beta
// START_MODULE_CONTRACT
//   PURPOSE: Run cancellable content searches and stream bounded result batches to the renderer.
//   SCOPE: Tauri search commands, rg JSON-process transport, embedded ignore/regex fallback, search-session coordination (session-wide seq, exactly one terminal), cancellation, and search-event payloads.
//   DEPENDS: ignore, regex, serde_json, tauri, m010_security, m013b::error, m013b::state.
//   LINKS: M-004, V-M-004, Phase-B2 step-4, C-SEARCH-SESSION-COMPLETION.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   SEARCH_EVENT_CHANNEL - Renderer event channel for streamed search updates.
//   DEFAULT_BATCH_SIZE - Default renderer result-batch capacity.
//   MAX_LINE_BYTES - Maximum line size admitted by the embedded fallback.
//   SearchOptions - Search preferences accepted from the renderer.
//   SearchHit - One normalized text-match result.
//   SearchEvent - Batched search-event wire payload.
//   SearchSink - Event-sink abstraction shared by Tauri and tests.
//   SearchRegistry - Registry of cancellable in-flight searches.
//   SearchTerminal - Which single terminal kind (complete/cancelled/error) ends a session.
//   SearchSessionCoordinator - Session-wide owner of the seq counter and the single terminal.
//   run_session - Execute one full search session across every validated root.
//   run_search - Embedded walker adapter emitting match batches through the session coordinator.
//   mt_search_spawn - Validate and start an asynchronous rg-backed search.
//   mt_search_cancel - Cancel an in-flight search by id (flag flip; the terminal comes from the session coordinator).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: 2.3.0-beta - C-SEARCH-SESSION-COMPLETION T-001: SearchSessionCoordinator owns the session-wide seq and the single terminal (complete/cancelled/error); run_search/run_ripgrep emit match batches only, run_session finalizes exactly once across all roots and both engines — no per-root terminals, no seq restart.
//   PREVIOUS: 2.2.0-beta - C-15 T-W2: ripgrep_available probe — desktop builds without a system rg (typical Windows) degrade to the in-process walker with BLOCK_RIPGREP_FALLBACK marker.
//   PREVIOUS: 2.1.1-beta - Defined injectable rg execution so spawn-failure tests remain deterministic under parallel cargo test.
//   PREVIOUS: 2026-04-28 B2-step-4 - Replaced stubs with ignore/regex fallback, streaming batches, cancellation, and SearchRegistry.
// END_CHANGE_SUMMARY

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
/// "cancelled" — same shape M-013-A's RipgrepDirectorySearcher expects.
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
            safe_eprintln!("[Search][emit][BLOCK_EMIT_FAILED reason={e}]");
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
            safe_eprintln!("[Search][cancel][BLOCK_CANCEL_OBSERVED search_id={search_id}]");
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

/// Which single terminal ends a search session.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SearchTerminal {
    Complete,
    Cancelled,
    Error,
}

/// Session-scoped owner of event ordering and finalization across all
/// validated roots and both engine adapters (C-SEARCH-SESSION-COMPLETION).
/// Owns the strictly increasing session-wide seq counter; guarantees at
/// most one terminal event and silence afterwards.
pub struct SearchSessionCoordinator {
    search_id: String,
    sink: Arc<dyn SearchSink>,
    next_seq: u32,
    finished: bool,
}

impl SearchSessionCoordinator {
    fn new(search_id: String, sink: Arc<dyn SearchSink>) -> Self {
        Self { search_id, sink, next_seq: 1, finished: false }
    }

    fn search_id(&self) -> &str {
        &self.search_id
    }

    /// Emit one match batch under the next session-wide seq.
    /// Post-terminal or empty-batch calls are silent and return false.
    fn emit_matches(&mut self, hits: Vec<SearchHit>) -> bool {
        if self.finished || hits.is_empty() {
            return false;
        }
        let seq = self.next_seq;
        self.next_seq += 1;
        self.sink.emit(&SearchEvent {
            search_id: self.search_id.clone(),
            kind: "match".to_string(),
            hits,
            error: None,
            seq,
        });
        true
    }

    /// Emit the session's single terminal event. Later calls are
    /// no-ops that return false: terminal finalization cannot occur twice.
    fn finalize(&mut self, terminal: SearchTerminal, error: Option<String>) -> bool {
        if self.finished {
            return false;
        }
        self.finished = true;
        let seq = self.next_seq;
        self.next_seq += 1;
        let kind = match terminal {
            SearchTerminal::Complete => "complete",
            SearchTerminal::Cancelled => "cancelled",
            SearchTerminal::Error => "error",
        };
        self.sink.emit(&SearchEvent {
            search_id: self.search_id.clone(),
            kind: kind.to_string(),
            hits: vec![],
            error,
            seq,
        });
        true
    }
}

// START_CONTRACT: run_session
//   PURPOSE: Execute one full search session across every validated root through the single coordinator — the only production finalization path (C-SEARCH-SESSION-COMPLETION).
//   INPUTS: { roots: &[PathBuf] - M-010-validated roots in traversal order, pattern: &str, opts: &SearchOptions, in_process: bool - embedded walker vs rg shellout, cancel: Arc<AtomicBool>, coordinator: &mut SearchSessionCoordinator }
//   OUTPUTS: { (u32, &'static str) - total hits across all roots and the emitted terminal kind }
//   SIDE_EFFECTS: Emits match events for all roots and exactly one terminal event (complete/cancelled/error) through the coordinator; a returned engine error stops the remaining roots.
//   LINKS: mt_search_spawn, run_search, run_ripgrep, SearchSessionCoordinator, V-M-004
// END_CONTRACT: run_session
fn run_session(
    roots: &[PathBuf],
    pattern: &str,
    opts: &SearchOptions,
    in_process: bool,
    cancel: Arc<AtomicBool>,
    coordinator: &mut SearchSessionCoordinator,
) -> (u32, &'static str) {
    run_session_with_program(
        std::ffi::OsStr::new("rg"),
        roots,
        pattern,
        opts,
        in_process,
        cancel,
        coordinator,
    )
}

/// Deterministic rg-error injection seam mirroring the existing
/// run_ripgrep_with_program pattern: a thin test indirection only; every
/// production root still flows through the same coordinator and finalize
/// path.
fn run_session_with_program(
    rg_program: &std::ffi::OsStr,
    roots: &[PathBuf],
    pattern: &str,
    opts: &SearchOptions,
    in_process: bool,
    cancel: Arc<AtomicBool>,
    coordinator: &mut SearchSessionCoordinator,
) -> (u32, &'static str) {
    let mut total_hits: u32 = 0;
    for root in roots {
        if cancel.load(Ordering::SeqCst) {
            break;
        }
        let result = if in_process {
            run_search(root, pattern, opts, cancel.clone(), coordinator)
                .map_err(|e| e.message)
        } else {
            run_ripgrep_with_program(rg_program, root, pattern, opts, cancel.clone(), coordinator)
        };
        match result {
            Ok(hits) => total_hits += hits,
            Err(e) => {
                safe_eprintln!(
                    "[Search][run][BLOCK_RIPGREP_FAILED search_id={} err={e}]",
                    coordinator.search_id()
                );
                coordinator.finalize(SearchTerminal::Error, Some(e));
                return (total_hits, "error");
            }
        }
    }
    let terminal = if cancel.load(Ordering::SeqCst) {
        SearchTerminal::Cancelled
    } else {
        SearchTerminal::Complete
    };
    coordinator.finalize(terminal, None);
    (total_hits, terminal_kind_name(terminal))
}

/// Static kind name for the DONE log line.
fn terminal_kind_name(terminal: SearchTerminal) -> &'static str {
    match terminal {
        SearchTerminal::Complete => "complete",
        SearchTerminal::Cancelled => "cancelled",
        SearchTerminal::Error => "error",
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

/// Embedded walker adapter: run a content search across one root,
/// streaming match batches through the session coordinator. Checks the
/// cancel token between files; returns the per-root hit count. This
/// adapter owns neither terminals nor seq (C-SEARCH-SESSION-COMPLETION):
/// run_session finalizes the session. Tests call this directly;
/// production goes through run_session via mt_search_spawn.
pub fn run_search(
    root: &Path,
    pattern: &str,
    opts: &SearchOptions,
    cancel: Arc<AtomicBool>,
    coordinator: &mut SearchSessionCoordinator,
) -> Result<u32, IpcError> {
    let cmd = "mt::search::spawn";
    safe_eprintln!(
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

    let mut batch: Vec<SearchHit> = Vec::with_capacity(DEFAULT_BATCH_SIZE);
    let mut total_hits: u32 = 0;

    for entry in walker.build() {
        if cancel.load(Ordering::SeqCst) {
            // Drain the pending batch; the session terminal is owned by
            // run_session's coordinator, not by this adapter.
            coordinator.emit_matches(std::mem::take(&mut batch));
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
                    let to_emit = std::mem::take(&mut batch);
                    safe_eprintln!(
                        "[Search][run][BLOCK_STREAM_RESULTS batch_size={}]",
                        to_emit.len()
                    );
                    coordinator.emit_matches(to_emit);
                    batch = Vec::with_capacity(DEFAULT_BATCH_SIZE);
                }
            }
        }
    }

    if !batch.is_empty() {
        let to_emit = std::mem::take(&mut batch);
        safe_eprintln!(
            "[Search][run][BLOCK_STREAM_RESULTS batch_size={}]",
            to_emit.len()
        );
        coordinator.emit_matches(to_emit);
    }
    Ok(total_hits)
}

/// Spawn a search across one or more directories. Returns immediately;
/// results stream via mt::search-event events. Renderer's
/// RipgrepDirectorySearcher subscribes via M-013-A useIpcListener.
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

    let _ = mode;
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

    // C-15 T-M4: App Store builds spawn no binaries — the same wire
    // contract streams from an in-process ignore+regex walker instead.
    // C-15 T-W2: desktop builds without a system rg (typical Windows
    // install) fall back to the same walker so project search works
    // without ripgrep; the fallback logs a marker once per search.
    #[cfg(feature = "app-store")]
    let in_process = true;
    #[cfg(not(feature = "app-store"))]
    let in_process = {
        let have_rg = ripgrep_available();
        if !have_rg {
            safe_eprintln!("[m013b][search][spawn][BLOCK_RIPGREP_FALLBACK reason=rg-missing]");
        }
        !have_rg
    };

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
        // C-SEARCH-SESSION-COMPLETION: one session coordinator owns the
        // session-wide seq and the single terminal for every validated
        // root and both engine adapters (C-15 T-M4/T-W2 selection
        // unchanged; run_session is the only finalization path).
        let mut coordinator =
            SearchSessionCoordinator::new(search_id_for_thread.clone(), sink.clone());
        let (total_hits, kind) = run_session(
            &validated_roots,
            &pattern,
            &opts,
            in_process,
            cancel,
            &mut coordinator,
        );
        safe_eprintln!(
            "[Search][run][BLOCK_RIPGREP_DONE search_id={search_id_for_thread} hits={total_hits} kind={kind}]"
        );
        let registry: tauri::State<'_, SearchRegistry> = registry_app_handle.state();
        registry.remove(&search_id_for_thread);
    });

    Ok(())
}

// START_CONTRACT: ripgrep_available
//   PURPOSE: Probe for a usable rg binary (C-15 T-W2). Windows machines rarely have ripgrep on PATH; search degrades to the in-process walker instead of failing.
//   INPUTS: { program: &OsStr - injectable executable for tests }
//   OUTPUTS: { bool - true iff the binary spawns and exits 0 for --version }
//   SIDE_EFFECTS: Spawns a short-lived child process.
//   LINKS: mt_search_spawn in_process decision; V-M-004.
// END_CONTRACT: ripgrep_available
fn ripgrep_available() -> bool {
    ripgrep_available_with_program(std::ffi::OsStr::new("rg"))
}

fn ripgrep_available_with_program(program: &std::ffi::OsStr) -> bool {
    std::process::Command::new(program)
        .arg("--version")
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

// START_CONTRACT: run_ripgrep
//   PURPOSE: Execute the production rg binary and stream normalized match batches through the session coordinator.
//   INPUTS: { root: &Path, pattern: &str, opts: &SearchOptions, cancel: Arc<AtomicBool>, coordinator: &mut SearchSessionCoordinator }
//   OUTPUTS: { Result<u32, String> - per-root total hits, or a stable spawn/stream error }
//   SIDE_EFFECTS: Spawns and waits for an rg child process; emits match batches through the coordinator (terminals are owned by run_session).
//   LINKS: M-004, V-M-004, run_session
// END_CONTRACT: run_ripgrep
fn run_ripgrep(
    root: &Path,
    pattern: &str,
    opts: &SearchOptions,
    cancel: Arc<AtomicBool>,
    coordinator: &mut SearchSessionCoordinator,
) -> Result<u32, String> {
    run_ripgrep_with_program(
        std::ffi::OsStr::new("rg"),
        root,
        pattern,
        opts,
        cancel,
        coordinator,
    )
}

// START_CONTRACT: run_ripgrep_with_program
//   PURPOSE: Run the rg transport with an explicitly selected executable for deterministic failure verification.
//   INPUTS: { rg_program: &OsStr - executable path/name, remaining inputs: same as run_ripgrep }
//   OUTPUTS: { Result<u32, String> - per-root total hits, or a stable spawn/stream error }
//   SIDE_EFFECTS: Spawns and waits for the selected child process; emits match batches through the coordinator.
//   LINKS: run_ripgrep, run_session, V-M-004 scenario-5
// END_CONTRACT: run_ripgrep_with_program
fn run_ripgrep_with_program(
    rg_program: &std::ffi::OsStr,
    root: &Path,
    pattern: &str,
    opts: &SearchOptions,
    cancel: Arc<AtomicBool>,
    coordinator: &mut SearchSessionCoordinator,
) -> Result<u32, String> {
    use std::io::{BufRead, BufReader};
    use std::process::{Command, Stdio};

    // START_BLOCK_BUILD_RIPGREP_COMMAND
    let mut cmd = Command::new(rg_program);
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
    // END_BLOCK_BUILD_RIPGREP_COMMAND

    // START_BLOCK_SPAWN_RIPGREP_PROCESS
    safe_eprintln!(
        "[Search][rg][BLOCK_SPAWN search_id={} root={}]",
        coordinator.search_id(),
        root.display()
    );
    let mut child = cmd.spawn().map_err(|e| format!("spawn rg: {e}"))?;
    let stdout = child.stdout.take().ok_or("no stdout")?;
    let reader = BufReader::new(stdout);
    // END_BLOCK_SPAWN_RIPGREP_PROCESS

    let mut total: u32 = 0;
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
            coordinator.emit_matches(std::mem::take(&mut batch));
        }
    }

    coordinator.emit_matches(std::mem::take(&mut batch));

    let _ = child.wait();
    let _ = pattern_len; // reserved for future range-end calc
    Ok(total)
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

    /// Session-level harness: single root over the embedded walker with a
    /// channel sink. Returns total hits, the emitted terminal kind and the
    /// receiver carrying every event the session produced.
    fn run_session_one_root(
        search_id: &str,
        root: &Path,
        pattern: &str,
        opts: &SearchOptions,
        cancel: Arc<AtomicBool>,
    ) -> (u32, &'static str, mpsc::Receiver<SearchEvent>) {
        let (tx, rx) = mpsc::channel();
        let sink: Arc<dyn SearchSink> = Arc::new(ChannelSink { tx });
        let mut coordinator = SearchSessionCoordinator::new(search_id.to_string(), sink);
        let roots = vec![root.to_path_buf()];
        let (total, kind) = run_session(&roots, pattern, opts, true, cancel, &mut coordinator);
        (total, kind, rx)
    }

    /// Full-trace collector (C-SEARCH-SESSION-COMPLETION): drains until a
    /// quiet period or the total cap deadline, pushing EVERY event — it
    /// never stops at a terminal kind, so session proofs observe any
    /// post-terminal event instead of truncating at the first one.
    fn collect_all(
        rx: &mpsc::Receiver<SearchEvent>,
        quiet: Duration,
        cap: Duration,
    ) -> Vec<SearchEvent> {
        let mut out = Vec::new();
        let deadline = std::time::Instant::now() + cap;
        loop {
            if std::time::Instant::now() >= deadline {
                break;
            }
            match rx.recv_timeout(quiet) {
                Ok(ev) => out.push(ev),
                Err(_) => break, // quiet period elapsed or sender dropped
            }
        }
        out
    }

    fn count_terminals(events: &[SearchEvent]) -> usize {
        events
            .iter()
            .filter(|e| matches!(e.kind.as_str(), "complete" | "cancelled" | "error"))
            .count()
    }

    fn assert_seq_strictly_increasing(events: &[SearchEvent]) {
        if let Some(first) = events.first() {
            assert_eq!(first.seq, 1, "first session event must carry seq 1");
        }
        for w in events.windows(2) {
            assert!(
                w[1].seq > w[0].seq,
                "session seq must strictly increase (got {} then {})",
                w[0].seq,
                w[1].seq
            );
        }
    }

    /// Sink that runs a hook at each emit boundary — deterministic
    /// cancel/error timing exactly when an event is published.
    struct HookSink {
        tx: mpsc::Sender<SearchEvent>,
        on_emit: Box<dyn Fn(&SearchEvent) + Send + Sync>,
    }
    impl SearchSink for HookSink {
        fn emit(&self, event: &SearchEvent) {
            let _ = self.tx.send(event.clone());
            (self.on_emit)(event);
        }
    }

    #[test]
    fn literal_match_in_one_file() {
        let dir = TempDir::new().unwrap();
        write(dir.path().join("a.md"), "hello world\nbye world\n").unwrap();
        let cancel = Arc::new(AtomicBool::new(false));
        let opts = SearchOptions::default();
        let (total, _kind, rx) = run_session_one_root("s-1", dir.path(), "world", &opts, cancel);
        assert_eq!(total, 2);
        let events = collect_until_terminal(&rx, Duration::from_secs(1));
        assert!(events.iter().any(|e| e.kind == "match"));
        assert!(events.iter().any(|e| e.kind == "complete"));
    }

    #[test]
    fn regex_mode_uses_pattern_as_is() {
        let dir = TempDir::new().unwrap();
        write(dir.path().join("a.md"), "foo123 bar456\n").unwrap();
        let cancel = Arc::new(AtomicBool::new(false));
        let opts = SearchOptions {
            is_regexp: Some(true),
            ..Default::default()
        };
        let (total, _kind, rx) =
            run_session_one_root("s-1", dir.path(), r"\w+\d+", &opts, cancel);
        assert_eq!(total, 2);
        let _ = collect_until_terminal(&rx, Duration::from_secs(1));
    }

    #[test]
    fn case_insensitive_default() {
        let dir = TempDir::new().unwrap();
        write(dir.path().join("a.md"), "Hello World\n").unwrap();
        let cancel = Arc::new(AtomicBool::new(false));
        let opts = SearchOptions {
            is_case_sensitive: Some(false),
            ..Default::default()
        };
        let (total, _kind, rx) = run_session_one_root("s-1", dir.path(), "HELLO", &opts, cancel);
        assert_eq!(total, 1);
        let _ = collect_until_terminal(&rx, Duration::from_secs(1));
    }

    #[test]
    fn case_sensitive_excludes_mismatched_case() {
        let dir = TempDir::new().unwrap();
        write(dir.path().join("a.md"), "Hello World\nhello world\n").unwrap();
        let cancel = Arc::new(AtomicBool::new(false));
        let opts = SearchOptions {
            is_case_sensitive: Some(true),
            ..Default::default()
        };
        let (total, _kind, rx) = run_session_one_root("s-1", dir.path(), "hello", &opts, cancel);
        assert_eq!(total, 1);
        let _ = collect_until_terminal(&rx, Duration::from_secs(1));
    }

    #[test]
    fn whole_word_excludes_substring() {
        let dir = TempDir::new().unwrap();
        write(dir.path().join("a.md"), "cat catalog scattered\n").unwrap();
        let cancel = Arc::new(AtomicBool::new(false));
        let opts = SearchOptions {
            is_whole_word: Some(true),
            ..Default::default()
        };
        let (total, _kind, rx) = run_session_one_root("s-1", dir.path(), "cat", &opts, cancel);
        assert_eq!(total, 1, "only standalone 'cat' should match");
        let _ = collect_until_terminal(&rx, Duration::from_secs(1));
    }

    #[test]
    fn gitignore_excluded_files_skipped() {
        let dir = TempDir::new().unwrap();
        write(dir.path().join(".gitignore"), "secret.md\n").unwrap();
        write(dir.path().join("public.md"), "needle\n").unwrap();
        write(dir.path().join("secret.md"), "needle\n").unwrap();
        let cancel = Arc::new(AtomicBool::new(false));
        let opts = SearchOptions::default();
        let (total, _kind, rx) = run_session_one_root("s-1", dir.path(), "needle", &opts, cancel);
        assert_eq!(total, 1, "secret.md should be gitignored");
        let _ = collect_until_terminal(&rx, Duration::from_secs(1));
    }

    #[test]
    fn no_ignore_includes_gitignored_files() {
        let dir = TempDir::new().unwrap();
        write(dir.path().join(".gitignore"), "secret.md\n").unwrap();
        write(dir.path().join("public.md"), "needle\n").unwrap();
        write(dir.path().join("secret.md"), "needle\n").unwrap();
        let cancel = Arc::new(AtomicBool::new(false));
        let opts = SearchOptions {
            no_ignore: Some(true),
            ..Default::default()
        };
        let (total, _kind, rx) = run_session_one_root("s-1", dir.path(), "needle", &opts, cancel);
        assert_eq!(total, 2, "with no_ignore both files match");
        let _ = collect_until_terminal(&rx, Duration::from_secs(1));
    }

    #[test]
    fn cancellation_returns_immediately_when_pre_cancelled() {
        // Deterministic test: pre-set cancel BEFORE run_session starts.
        // The session must observe the flag and emit exactly one
        // 'cancelled' terminal without streaming any hit batches. Tests
        // V-M-004 negative-assertion "After cancel: zero
        // BLOCK_STREAM_RESULTS with seq > cancel_seq".
        let dir = TempDir::new().unwrap();
        for i in 0..20 {
            write(
                dir.path().join(format!("file-{i:03}.md")),
                "needle\n".repeat(10),
            )
            .unwrap();
        }
        let cancel = Arc::new(AtomicBool::new(true)); // pre-cancelled
        let opts = SearchOptions::default();

        let (total, kind, rx) =
            run_session_one_root("s-cancel", dir.path(), "needle", &opts, cancel);
        assert_eq!(
            total, 0,
            "pre-cancelled search must not produce any hits"
        );
        assert_eq!(kind, "cancelled");
        let events = collect_all(&rx, Duration::from_millis(400), Duration::from_millis(1500));
        // Session-level trace: exactly one 'cancelled' event, zero match
        // events, and nothing after the terminal.
        assert_eq!(events.len(), 1, "expected exactly one event; got {events:?}");
        assert_eq!(events[0].kind, "cancelled");
        assert!(
            !events.iter().any(|e| e.kind == "match"),
            "pre-cancelled search must emit zero match batches"
        );
    }

    #[test]
    fn cancellation_mid_stream_caps_total_hits() {
        // Larger workload (500 files × 100 hits = 50_000 potential hits)
        // ensures the search runs long enough for a runtime cancel to
        // catch it. Adapter-level: run_search stops early on the flag and
        // returns; the session terminal is not this adapter's concern.
        // Asserts total hits < workload total.
        let dir = TempDir::new().unwrap();
        for i in 0..500 {
            write(
                dir.path().join(format!("file-{i:04}.md")),
                "needle\n".repeat(100),
            )
            .unwrap();
        }
        let (tx, _rx) = mpsc::channel();
        let cancel = Arc::new(AtomicBool::new(false));
        let cancel_for_thread = cancel.clone();
        let opts = SearchOptions::default();

        let dir_path = dir.path().to_path_buf();
        let handle = std::thread::spawn(move || {
            let sink: Arc<dyn SearchSink> = Arc::new(ChannelSink { tx });
            let mut coordinator = SearchSessionCoordinator::new("s-cancel".to_string(), sink);
            run_search(&dir_path, "needle", &opts, cancel_for_thread, &mut coordinator)
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
        let mut coordinator = SearchSessionCoordinator::new("s-1".to_string(), sink);
        let cancel = Arc::new(AtomicBool::new(false));
        let opts = SearchOptions {
            is_regexp: Some(true),
            ..Default::default()
        };
        let err = run_search(dir.path(), "[invalid", &opts, cancel, &mut coordinator).unwrap_err();
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
        let cancel = Arc::new(AtomicBool::new(false));
        let opts = SearchOptions::default();
        let (total, _kind, rx) = run_session_one_root("s-1", dir.path(), "needle", &opts, cancel);
        assert_eq!(total, 1, "hidden .secret.md should be skipped");
        let _ = collect_until_terminal(&rx, Duration::from_secs(1));
    }

    #[test]
    fn include_hidden_picks_up_dotfiles() {
        let dir = TempDir::new().unwrap();
        write(dir.path().join(".secret.md"), "needle\n").unwrap();
        let cancel = Arc::new(AtomicBool::new(false));
        let opts = SearchOptions {
            include_hidden: Some(true),
            ..Default::default()
        };
        let (total, _kind, rx) = run_session_one_root("s-1", dir.path(), "needle", &opts, cancel);
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
        let cancel = Arc::new(AtomicBool::new(false));
        let opts = SearchOptions {
            max_file_size: Some(1024), // 1 KB ceiling — big.md skipped
            ..Default::default()
        };
        let (total, _kind, rx) = run_session_one_root("s-1", dir.path(), "needle", &opts, cancel);
        assert_eq!(total, 1, "only small.md should be searched");
        let _ = collect_until_terminal(&rx, Duration::from_secs(1));
    }

    #[test]
    fn cancellation_drains_partial_batch_before_emit_cancelled() {
        // Build a workload that produces hits but stop the session via
        // cancel BEFORE the batch fills. The drain branch in run_search
        // emits the partial batch through the coordinator, then
        // run_session emits the single 'cancelled' terminal.
        let dir = TempDir::new().unwrap();
        // 2 hits is below DEFAULT_BATCH_SIZE (16) so the partial-batch
        // drain branch will fire when cancel observed mid-walk.
        write(dir.path().join("a.md"), "needle\nneedle\n").unwrap();
        write(dir.path().join("b.md"), "needle\nneedle\n").unwrap();
        let (tx, rx) = mpsc::channel();
        let cancel = Arc::new(AtomicBool::new(false));
        let cancel_for_thread = cancel.clone();
        let opts = SearchOptions::default();
        let dir_path = dir.path().to_path_buf();
        let handle = std::thread::spawn(move || {
            let sink: Arc<dyn SearchSink> = Arc::new(ChannelSink { tx });
            let mut coordinator = SearchSessionCoordinator::new("s-drain".to_string(), sink);
            let roots = vec![dir_path];
            run_session(&roots, "needle", &opts, true, cancel_for_thread, &mut coordinator)
        });
        // Give walker time to find first file but cancel before all done.
        std::thread::sleep(Duration::from_millis(2));
        cancel.store(true, Ordering::SeqCst);
        let _total = handle.join().unwrap().0;
        let events = collect_all(&rx, Duration::from_millis(400), Duration::from_millis(1500));
        // Either we got 'cancelled' OR the search completed before cancel
        // was observed — both are valid; the assertion is no panic.
        assert!(
            events
                .iter()
                .any(|e| e.kind == "cancelled" || e.kind == "complete"),
            "expected terminal event"
        );
        // C-SEARCH-SESSION-COMPLETION: exactly ONE terminal, it is the
        // last event, and every match batch precedes it.
        assert_eq!(count_terminals(&events), 1, "exactly one terminal; got {events:?}");
        let last = events.last().unwrap();
        assert!(
            last.kind == "cancelled" || last.kind == "complete",
            "terminal must be the final event; got {events:?}"
        );
        let terminal_pos = events
            .iter()
            .position(|e| matches!(e.kind.as_str(), "complete" | "cancelled" | "error"))
            .unwrap();
        assert!(
            events[..terminal_pos].iter().all(|e| e.kind == "match"),
            "only match events may precede the terminal; got {events:?}"
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
        let cancel = Arc::new(AtomicBool::new(false));
        let opts = SearchOptions::default();
        let (_total, _kind, rx) = run_session_one_root("s-1", dir.path(), "needle", &opts, cancel);
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
        let cancel = Arc::new(AtomicBool::new(false));
        let opts = SearchOptions::default();
        let (total, kind, rx) =
            run_session_one_root("s-empty", dir.path(), "needle", &opts, cancel);
        assert_eq!(total, 0);
        assert_eq!(kind, "complete");
        let events = collect_all(&rx, Duration::from_millis(400), Duration::from_millis(1500));
        // Session level: zero matches → exactly one event, kind complete,
        // seq 1 (the first seq of the session-wide counter).
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].kind, "complete");
        assert_eq!(events[0].seq, 1);
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
            safe_eprintln!("[test][skip] rg binary not on PATH");
            return;
        }
        let dir = TempDir::new().unwrap();
        write(dir.path().join("a.md"), "alpha needle beta\n").unwrap();
        let (tx, rx) = mpsc::channel();
        let cancel = Arc::new(AtomicBool::new(false));
        let opts = SearchOptions::default();
        let sink: Arc<dyn SearchSink> = Arc::new(ChannelSink { tx });
        let mut coordinator = SearchSessionCoordinator::new("rg-1".to_string(), sink);
        let hits = run_ripgrep(dir.path(), "needle", &opts, cancel, &mut coordinator)
            .unwrap_or(0);
        assert!(hits >= 1, "expected at least one rg match, got {hits}");
        let events = collect_until_terminal(&rx, Duration::from_millis(500));
        // run_ripgrep emits match batches only — no terminal event of its
        // own anymore (the session coordinator owns terminals). At least
        // one match event expected when hits > 0.
        if hits > 0 {
            assert!(events.iter().any(|e| e.kind == "match"));
        }
    }

    #[test]
    fn run_ripgrep_no_matches_returns_zero_hits() {
        if !rg_available() {
            safe_eprintln!("[test][skip] rg binary not on PATH");
            return;
        }
        let dir = TempDir::new().unwrap();
        write(dir.path().join("a.md"), "no relevant content\n").unwrap();
        let (tx, _rx) = mpsc::channel();
        let cancel = Arc::new(AtomicBool::new(false));
        let opts = SearchOptions::default();
        let sink: Arc<dyn SearchSink> = Arc::new(ChannelSink { tx });
        let mut coordinator = SearchSessionCoordinator::new("rg-2".to_string(), sink);
        let hits = run_ripgrep(dir.path(), "needle", &opts, cancel, &mut coordinator)
            .unwrap_or(0);
        assert_eq!(hits, 0);
    }

    #[test]
    fn run_ripgrep_with_options_runs_without_error() {
        if !rg_available() {
            safe_eprintln!("[test][skip] rg binary not on PATH");
            return;
        }
        let dir = TempDir::new().unwrap();
        write(dir.path().join(".hidden.md"), "needle\n").unwrap();
        write(dir.path().join("vis.md"), "Needle\n").unwrap();
        let (tx, _rx) = mpsc::channel();
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
        let sink: Arc<dyn SearchSink> = Arc::new(ChannelSink { tx });
        let mut coordinator = SearchSessionCoordinator::new("rg-opt".to_string(), sink);
        // Use a regex; with case-sensitive whole-word, only lowercase
        // 'needle' matches (the hidden file). At minimum expect one hit,
        // and the call itself returns Ok.
        let result = run_ripgrep(dir.path(), r"needle", &opts, cancel, &mut coordinator);
        assert!(result.is_ok(), "rg with full options must run cleanly: {result:?}");
    }

    #[test]
    fn run_ripgrep_pre_cancelled_returns_zero_hits() {
        if !rg_available() {
            safe_eprintln!("[test][skip] rg binary not on PATH");
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
        let cancel = Arc::new(AtomicBool::new(true)); // pre-cancelled
        let opts = SearchOptions::default();
        let sink: Arc<dyn SearchSink> = Arc::new(ChannelSink { tx });
        let mut coordinator = SearchSessionCoordinator::new("rg-cancel".to_string(), sink);
        let hits = run_ripgrep(dir.path(), "needle", &opts, cancel, &mut coordinator)
            .unwrap_or(u32::MAX);
        // With pre-cancel, the loop break fires on the first read iteration
        // and no batches accumulate; hits should be 0 or very small (rg
        // may have produced output before kill landed). Strict bound:
        // less than the worst-case 30*20 = 600.
        assert!(hits < 600, "pre-cancel should bound hits well below ceiling; got {hits}");
    }

    #[test]
    fn run_ripgrep_spawn_failure_returns_err() {
        // Inject an impossible executable path rather than mutating PATH:
        // Rust tests share one process and execute in parallel by default.
        let invalid_rg = Path::new("/dev/null/mark-rg-does-not-exist").as_os_str();
        let dir = TempDir::new().unwrap();
        let (tx, _rx) = mpsc::channel();
        let cancel = Arc::new(AtomicBool::new(false));
        let opts = SearchOptions::default();
        let sink: Arc<dyn SearchSink> = Arc::new(ChannelSink { tx });
        let mut coordinator = SearchSessionCoordinator::new("rg-fail".to_string(), sink);
        let result = run_ripgrep_with_program(
            invalid_rg,
            dir.path(),
            "needle",
            &opts,
            cancel,
            &mut coordinator,
        );
        assert!(result.is_err(), "invalid rg executable must fail to spawn");
        assert!(result.unwrap_err().contains("spawn rg"));
    }

    #[test]
    fn batches_at_default_size() {
        let dir = TempDir::new().unwrap();
        // 50 hits in one file → expect ceil(50/16)=4 batches + 1 complete
        let content = "needle\n".repeat(50);
        write(dir.path().join("a.md"), content).unwrap();
        let cancel = Arc::new(AtomicBool::new(false));
        let opts = SearchOptions::default();
        let (total, _kind, rx) = run_session_one_root("s-batch", dir.path(), "needle", &opts, cancel);
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

    // ─── C-SEARCH-SESSION-COMPLETION: session-trace family ─────────────
    // Every test below executes the production run_session path and the
    // single coordinator used by mt_search_spawn; full-trace capture via
    // collect_all proves single-terminal + zero post-terminal events.

    #[test]
    fn session_two_roots_single_complete_after_all_matches() {
        // Core regression: against the double-terminal tree the producer
        // trace for two roots was match, complete, match, complete,
        // complete with seq restarting per root. The session coordinator
        // must deliver both roots' matches before exactly one terminal.
        let root_a = TempDir::new().unwrap();
        write(root_a.path().join("a.md"), "needle alpha\n").unwrap();
        let root_b = TempDir::new().unwrap();
        write(root_b.path().join("b.md"), "needle beta\n").unwrap();
        let (tx, rx) = mpsc::channel();
        let sink: Arc<dyn SearchSink> = Arc::new(ChannelSink { tx });
        let mut coordinator = SearchSessionCoordinator::new("s-two-roots".to_string(), sink);
        let roots = vec![root_a.path().to_path_buf(), root_b.path().to_path_buf()];
        let opts = SearchOptions::default();
        let cancel = Arc::new(AtomicBool::new(false));
        let (total, kind) = run_session(&roots, "needle", &opts, true, cancel, &mut coordinator);
        assert_eq!(total, 2, "one matching file per root");
        assert_eq!(kind, "complete");
        let events = collect_all(&rx, Duration::from_millis(400), Duration::from_secs(2));
        let mut saw_a = false;
        let mut saw_b = false;
        for ev in &events {
            if ev.kind == "match" {
                for hit in &ev.hits {
                    if hit.path.ends_with("a.md") {
                        saw_a = true;
                    }
                    if hit.path.ends_with("b.md") {
                        saw_b = true;
                    }
                }
            }
        }
        assert!(
            saw_a && saw_b,
            "both roots' matches must be delivered; events={events:?}"
        );
        assert_eq!(count_terminals(&events), 1, "exactly one terminal; got {events:?}");
        assert_eq!(events.last().unwrap().kind, "complete", "terminal is the last event");
        assert_seq_strictly_increasing(&events);
    }

    #[test]
    fn session_one_root_and_zero_matches_and_batched_shapes() {
        let opts = SearchOptions::default();
        // (a) one root with matches: matches first, exactly one complete.
        {
            let dir = TempDir::new().unwrap();
            write(dir.path().join("a.md"), "needle\nneedle\nneedle\n").unwrap();
            let (total, kind, rx) = run_session_one_root(
                "s-shapes-a",
                dir.path(),
                "needle",
                &opts,
                Arc::new(AtomicBool::new(false)),
            );
            assert_eq!(total, 3);
            assert_eq!(kind, "complete");
            let events = collect_all(&rx, Duration::from_millis(400), Duration::from_secs(2));
            assert!(events.iter().any(|e| e.kind == "match"));
            assert_eq!(count_terminals(&events), 1);
            assert_eq!(events.last().unwrap().kind, "complete");
            assert_seq_strictly_increasing(&events);
        }
        // (b) two empty roots: exactly one event — "complete" with seq 1.
        {
            let dir_a = TempDir::new().unwrap();
            let dir_b = TempDir::new().unwrap();
            let (tx, rx) = mpsc::channel();
            let sink: Arc<dyn SearchSink> = Arc::new(ChannelSink { tx });
            let mut coordinator = SearchSessionCoordinator::new("s-shapes-b".to_string(), sink);
            let roots = vec![dir_a.path().to_path_buf(), dir_b.path().to_path_buf()];
            let (total, kind) = run_session(
                &roots,
                "needle",
                &opts,
                true,
                Arc::new(AtomicBool::new(false)),
                &mut coordinator,
            );
            assert_eq!(total, 0);
            assert_eq!(kind, "complete");
            let events = collect_all(&rx, Duration::from_millis(400), Duration::from_secs(2));
            assert_eq!(events.len(), 1, "zero matches → exactly one event; got {events:?}");
            assert_eq!(events[0].kind, "complete");
            assert_eq!(events[0].seq, 1);
        }
        // (c) 50-hit single file: 4+ match batches then one complete.
        {
            let dir = TempDir::new().unwrap();
            let content = "needle\n".repeat(50);
            write(dir.path().join("a.md"), content).unwrap();
            let (total, kind, rx) = run_session_one_root(
                "s-shapes-c",
                dir.path(),
                "needle",
                &opts,
                Arc::new(AtomicBool::new(false)),
            );
            assert_eq!(total, 50);
            assert_eq!(kind, "complete");
            let events = collect_all(&rx, Duration::from_millis(400), Duration::from_secs(2));
            let match_batches = events.iter().filter(|e| e.kind == "match").count();
            assert!(match_batches >= 4, "expected ≥4 batches; got {match_batches}");
            assert_eq!(count_terminals(&events), 1);
            assert_eq!(events.last().unwrap().kind, "complete");
            assert_seq_strictly_increasing(&events);
        }
    }

    #[test]
    fn session_seq_strictly_increasing_across_root_boundary() {
        // 30 hits per root → 2 batches per root; the final drain of root A
        // and the first batch of root B straddle the root boundary, so a
        // per-root seq restart would show a second seq == 1.
        let root_a = TempDir::new().unwrap();
        write(root_a.path().join("a.md"), "needle\n".repeat(30)).unwrap();
        let root_b = TempDir::new().unwrap();
        write(root_b.path().join("b.md"), "needle\n".repeat(30)).unwrap();
        let (tx, rx) = mpsc::channel();
        let sink: Arc<dyn SearchSink> = Arc::new(ChannelSink { tx });
        let mut coordinator = SearchSessionCoordinator::new("s-seq-boundary".to_string(), sink);
        let roots = vec![root_a.path().to_path_buf(), root_b.path().to_path_buf()];
        let opts = SearchOptions::default();
        let cancel = Arc::new(AtomicBool::new(false));
        let (total, kind) = run_session(&roots, "needle", &opts, true, cancel, &mut coordinator);
        assert_eq!(total, 60);
        assert_eq!(kind, "complete");
        let events = collect_all(&rx, Duration::from_millis(400), Duration::from_secs(2));
        assert!(events.len() >= 2, "expected several events; got {events:?}");
        assert_eq!(
            events.iter().filter(|e| e.seq == 1).count(),
            1,
            "no seq restart at the root boundary; events={events:?}"
        );
        assert_seq_strictly_increasing(&events);
    }

    #[test]
    fn session_pre_cancelled_single_cancelled_no_matches() {
        let dir = TempDir::new().unwrap();
        write(dir.path().join("a.md"), "needle\n".repeat(10)).unwrap();
        let (tx, rx) = mpsc::channel();
        let sink: Arc<dyn SearchSink> = Arc::new(ChannelSink { tx });
        let mut coordinator = SearchSessionCoordinator::new("s-precancel".to_string(), sink);
        let roots = vec![dir.path().to_path_buf()];
        let opts = SearchOptions::default();
        let cancel = Arc::new(AtomicBool::new(true));
        let (total, kind) = run_session(&roots, "needle", &opts, true, cancel, &mut coordinator);
        assert_eq!(total, 0);
        assert_eq!(kind, "cancelled");
        let events = collect_all(&rx, Duration::from_millis(400), Duration::from_millis(1500));
        assert_eq!(events.len(), 1, "trace == [cancelled]; got {events:?}");
        assert_eq!(events[0].kind, "cancelled");
        assert!(!events.iter().any(|e| e.kind == "match"));
    }

    #[test]
    fn session_cancel_between_roots_single_terminal_no_second_root() {
        // HookSink flips the cancel flag on the first match emit. The flag
        // is set before run_search returns, so the loop's cancel check for
        // root B fires deterministically → exactly one "cancelled"
        // terminal and zero second-root events.
        let root_a = TempDir::new().unwrap();
        write(root_a.path().join("a.md"), "needle alpha\n").unwrap();
        let root_b = TempDir::new().unwrap();
        write(root_b.path().join("b.md"), "needle beta\n").unwrap();
        let (tx, rx) = mpsc::channel();
        let cancel = Arc::new(AtomicBool::new(false));
        let cancel_for_hook = cancel.clone();
        let sink: Arc<dyn SearchSink> = Arc::new(HookSink {
            tx,
            on_emit: Box::new(move |_ev: &SearchEvent| {
                cancel_for_hook.store(true, Ordering::SeqCst);
            }),
        });
        let mut coordinator = SearchSessionCoordinator::new("s-between".to_string(), sink);
        let roots = vec![root_a.path().to_path_buf(), root_b.path().to_path_buf()];
        let opts = SearchOptions::default();
        let (_total, kind) =
            run_session(&roots, "needle", &opts, true, cancel.clone(), &mut coordinator);
        assert_eq!(kind, "cancelled");
        let events = collect_all(&rx, Duration::from_millis(400), Duration::from_millis(1500));
        assert!(
            !events
                .iter()
                .any(|e| e.hits.iter().any(|h| h.path.ends_with("b.md"))),
            "second root must not be searched after cancel; events={events:?}"
        );
        assert_eq!(count_terminals(&events), 1);
        assert_eq!(events.last().unwrap().kind, "cancelled");
        assert_seq_strictly_increasing(&events);
    }

    #[test]
    fn session_cancel_mid_stream_drains_batch_then_single_cancelled() {
        // Workload large enough to observe a runtime cancel mid-stream;
        // tolerant to fast hosts where the walk finishes before the flag.
        let dir = TempDir::new().unwrap();
        for i in 0..500 {
            write(
                dir.path().join(format!("file-{i:04}.md")),
                "needle\n".repeat(100),
            )
            .unwrap();
        }
        let (tx, rx) = mpsc::channel();
        let cancel = Arc::new(AtomicBool::new(false));
        let cancel_for_thread = cancel.clone();
        let opts = SearchOptions::default();
        let dir_path = dir.path().to_path_buf();
        let handle = std::thread::spawn(move || {
            let sink: Arc<dyn SearchSink> = Arc::new(ChannelSink { tx });
            let mut coordinator = SearchSessionCoordinator::new("s-mid-cancel".to_string(), sink);
            let roots = vec![dir_path];
            run_session(&roots, "needle", &opts, true, cancel_for_thread, &mut coordinator)
        });
        std::thread::sleep(Duration::from_millis(5));
        cancel.store(true, Ordering::SeqCst);
        let (_total, kind) = handle.join().unwrap();
        let events = collect_all(&rx, Duration::from_millis(400), Duration::from_secs(3));
        // Exactly one terminal, and it is the LAST event — zero
        // post-terminal events even with the cancel racing the stream.
        assert_eq!(count_terminals(&events), 1, "exactly one terminal; got {events:?}");
        assert_eq!(
            events.last().unwrap().kind, kind,
            "terminal must be the final event"
        );
        // Every match batch (including any drained partial batch)
        // precedes the single terminal.
        let terminal_pos = events
            .iter()
            .position(|e| matches!(e.kind.as_str(), "complete" | "cancelled" | "error"))
            .unwrap();
        assert!(
            events[..terminal_pos].iter().all(|e| e.kind == "match"),
            "only match events may precede the terminal; got {events:?}"
        );
    }

    #[test]
    fn session_embedded_error_stops_remaining_roots() {
        // Bad regexp on the first of two roots: one error terminal, the
        // second root is never started, no complete afterwards.
        let root_a = TempDir::new().unwrap();
        write(root_a.path().join("a.md"), "hello\n").unwrap();
        let root_b = TempDir::new().unwrap();
        write(root_b.path().join("b.md"), "needle\n").unwrap();
        let (tx, rx) = mpsc::channel();
        let sink: Arc<dyn SearchSink> = Arc::new(ChannelSink { tx });
        let mut coordinator = SearchSessionCoordinator::new("s-embedded-err".to_string(), sink);
        let roots = vec![root_a.path().to_path_buf(), root_b.path().to_path_buf()];
        let opts = SearchOptions {
            is_regexp: Some(true),
            ..Default::default()
        };
        let cancel = Arc::new(AtomicBool::new(false));
        let (total, kind) =
            run_session(&roots, "[invalid", &opts, true, cancel, &mut coordinator);
        assert_eq!(kind, "error");
        assert_eq!(total, 0);
        let events = collect_all(&rx, Duration::from_millis(400), Duration::from_millis(1500));
        assert_eq!(count_terminals(&events), 1);
        let last = events.last().unwrap();
        assert_eq!(last.kind, "error");
        assert!(last.error.is_some());
        assert!(
            !events
                .iter()
                .any(|e| e.hits.iter().any(|h| h.path.ends_with("b.md"))),
            "second root must not be started after an engine error; events={events:?}"
        );
        assert!(!events.iter().any(|e| e.kind == "complete"));
    }

    #[test]
    fn session_rg_error_stops_remaining_roots() {
        // rg adapter error parity: invalid executable on the first of two
        // roots via run_session_with_program — same session invariants.
        let root_a = TempDir::new().unwrap();
        write(root_a.path().join("a.md"), "needle\n").unwrap();
        let root_b = TempDir::new().unwrap();
        write(root_b.path().join("b.md"), "needle\n").unwrap();
        let (tx, rx) = mpsc::channel();
        let sink: Arc<dyn SearchSink> = Arc::new(ChannelSink { tx });
        let mut coordinator = SearchSessionCoordinator::new("s-rg-err".to_string(), sink);
        let roots = vec![root_a.path().to_path_buf(), root_b.path().to_path_buf()];
        let opts = SearchOptions::default();
        let cancel = Arc::new(AtomicBool::new(false));
        let invalid_rg = Path::new("/dev/null/mark-rg-does-not-exist").as_os_str();
        let (total, kind) = run_session_with_program(
            invalid_rg,
            &roots,
            "needle",
            &opts,
            false,
            cancel,
            &mut coordinator,
        );
        assert_eq!(kind, "error");
        assert_eq!(total, 0);
        let events = collect_all(&rx, Duration::from_millis(400), Duration::from_millis(1500));
        assert_eq!(count_terminals(&events), 1);
        let last = events.last().unwrap();
        assert_eq!(last.kind, "error");
        assert!(
            last.error.as_deref().unwrap_or("").contains("spawn rg"),
            "spawn failure surfaces as the error payload; got {last:?}"
        );
        assert!(
            !events
                .iter()
                .any(|e| e.hits.iter().any(|h| h.path.ends_with("b.md"))),
            "second root must not be started after an engine error; events={events:?}"
        );
        assert!(!events.iter().any(|e| e.kind == "complete"));
    }

    #[test]
    fn session_rg_two_roots_parity_with_embedded() {
        // rg control parity for the full producer trace: same session
        // invariants as the embedded two-root regression.
        if !rg_available() {
            safe_eprintln!("[test][skip] rg binary not on PATH");
            return;
        }
        let root_a = TempDir::new().unwrap();
        write(root_a.path().join("a.md"), "needle alpha\n").unwrap();
        let root_b = TempDir::new().unwrap();
        write(root_b.path().join("b.md"), "needle beta\n").unwrap();
        let (tx, rx) = mpsc::channel();
        let sink: Arc<dyn SearchSink> = Arc::new(ChannelSink { tx });
        let mut coordinator = SearchSessionCoordinator::new("s-rg-two".to_string(), sink);
        let roots = vec![root_a.path().to_path_buf(), root_b.path().to_path_buf()];
        let opts = SearchOptions::default();
        let cancel = Arc::new(AtomicBool::new(false));
        let (total, kind) = run_session(&roots, "needle", &opts, false, cancel, &mut coordinator);
        assert_eq!(total, 2, "one matching file per root");
        assert_eq!(kind, "complete");
        let events = collect_all(&rx, Duration::from_millis(400), Duration::from_secs(3));
        let mut saw_a = false;
        let mut saw_b = false;
        for ev in &events {
            if ev.kind == "match" {
                for hit in &ev.hits {
                    if hit.path.ends_with("a.md") {
                        saw_a = true;
                    }
                    if hit.path.ends_with("b.md") {
                        saw_b = true;
                    }
                }
            }
        }
        assert!(saw_a, "root a match missing; events={events:?}");
        assert!(saw_b, "root b match missing; events={events:?}");
        assert_eq!(count_terminals(&events), 1);
        assert_eq!(events.last().unwrap().kind, "complete");
        assert_seq_strictly_increasing(&events);
    }

    #[test]
    fn coordinator_finalize_is_one_shot() {
        // Unit-level post-terminal silence: finalize returns true once and
        // emits one event; any later finalize or emit_matches is a silent
        // no-op returning false.
        let (tx, rx) = mpsc::channel();
        let sink: Arc<dyn SearchSink> = Arc::new(ChannelSink { tx });
        let mut coordinator = SearchSessionCoordinator::new("s-unit".to_string(), sink);
        assert!(coordinator.finalize(SearchTerminal::Complete, None));
        assert!(!coordinator.finalize(SearchTerminal::Cancelled, None));
        assert!(!coordinator.emit_matches(vec![SearchHit {
            path: "x.md".to_string(),
            line: 1,
            column: 1,
            snippet: "needle".to_string(),
            truncated: false,
        }]));
        let events = collect_all(&rx, Duration::from_millis(300), Duration::from_millis(1500));
        assert_eq!(events.len(), 1, "exactly one terminal event; got {events:?}");
        assert_eq!(events[0].kind, "complete");
        assert_eq!(events[0].seq, 1);
    }

    #[test]
    fn concurrent_sessions_are_isolated() {
        // Two run_session calls on two threads with separate sinks and
        // TempDirs; cancelling session A mid-run must not finish, feed or
        // renumber session B — per-session coordinator owns all state,
        // nothing static is shared.
        let dir_a = TempDir::new().unwrap();
        for i in 0..300 {
            write(
                dir_a.path().join(format!("file-{i:03}.md")),
                "needle\n".repeat(20),
            )
            .unwrap();
        }
        let dir_b = TempDir::new().unwrap();
        write(dir_b.path().join("only.md"), "needle\n").unwrap();

        let (tx_a, rx_a) = mpsc::channel();
        let (tx_b, rx_b) = mpsc::channel();
        let cancel_a = Arc::new(AtomicBool::new(false));

        let opts_a = SearchOptions::default();
        let opts_b = SearchOptions::default();
        let roots_a = vec![dir_a.path().to_path_buf()];
        let roots_b = vec![dir_b.path().to_path_buf()];

        let cancel_a_for_thread = cancel_a.clone();
        let handle_a = std::thread::spawn(move || {
            let sink: Arc<dyn SearchSink> = Arc::new(ChannelSink { tx: tx_a });
            let mut coordinator = SearchSessionCoordinator::new("s-iso-a".to_string(), sink);
            run_session(&roots_a, "needle", &opts_a, true, cancel_a_for_thread, &mut coordinator)
        });
        let handle_b = std::thread::spawn(move || {
            let sink: Arc<dyn SearchSink> = Arc::new(ChannelSink { tx: tx_b });
            let mut coordinator = SearchSessionCoordinator::new("s-iso-b".to_string(), sink);
            run_session(&roots_b, "needle", &opts_b, true, Arc::new(AtomicBool::new(false)), &mut coordinator)
        });
        // Let both sessions start, then cancel ONLY A.
        std::thread::sleep(Duration::from_millis(5));
        cancel_a.store(true, Ordering::SeqCst);
        let (_total_a, kind_a) = handle_a.join().unwrap();
        let (_total_b, kind_b) = handle_b.join().unwrap();
        assert_eq!(kind_b, "complete", "cancelling A must not finish B");
        // B's stream: its own trace, seq starting at 1, only its own
        // searchId — no foreign terminal kind in its stream.
        let events_b = collect_all(&rx_b, Duration::from_millis(400), Duration::from_millis(1500));
        assert!(!events_b.is_empty());
        assert!(events_b.iter().all(|e| e.search_id == "s-iso-b"));
        assert_eq!(events_b[0].seq, 1, "session B owns its seq counter from 1");
        assert_seq_strictly_increasing(&events_b);
        assert_eq!(events_b.last().unwrap().kind, "complete");
        // A's stream: single terminal (cancelled, or complete if the walk
        // finished before the flag), only its own searchId.
        let events_a = collect_all(&rx_a, Duration::from_millis(400), Duration::from_millis(1500));
        assert!(events_a.iter().all(|e| e.search_id == "s-iso-a"));
        assert_eq!(count_terminals(&events_a), 1);
        assert!(
            kind_a == "cancelled" || kind_a == "complete",
            "A's terminal kind is well-formed; got {kind_a}"
        );
    }

    // C-15 T-W2: desktop builds without a system rg must degrade to the
    // in-process walker — the probe drives that decision.
    #[test]
    fn ripgrep_probe_reports_missing_binary() {
        assert!(!ripgrep_available_with_program(std::ffi::OsStr::new(
            "mark-no-such-rg-binary-xyz"
        )));
    }

    #[test]
    fn ripgrep_probe_rejects_nonzero_exit() {
        // `false` exists on unix and exits 1; on Windows fall back to a
        // missing-binary name so the assertion still holds cross-host.
        if cfg!(unix) {
            assert!(!ripgrep_available_with_program(std::ffi::OsStr::new("false")));
        } else {
            assert!(!ripgrep_available_with_program(std::ffi::OsStr::new(
                "mark-no-such-rg-binary-xyz"
            )));
        }
    }
}
