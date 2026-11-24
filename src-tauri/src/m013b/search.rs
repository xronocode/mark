// FILE: src-tauri/src/m013b/search.rs
// VERSION: 2.6.0-beta
// START_MODULE_CONTRACT
//   PURPOSE: Run cancellable content searches and stream bounded result batches to the renderer.
//   SCOPE: Tauri search commands, rg JSON-process transport (exit-status honesty, bounded stderr capture, cancel watcher), embedded ignore/regex fallback, the files-mode session (mode "files": path-only walker leg without body reads, `rg --files` listing transport, shared inclusion/exclusion glob compilation, FILES_RESULT_CAP delivered-hits honesty), shared exclusion-mask compilation, search-session coordination (session-wide seq, exactly one terminal), cancellation, and search-event payloads (additive optional partial flag; additive optional honest matchStart/matchEnd hit bounds).
//   DEPENDS: ignore, regex, serde_json, tauri, m010_security, m013b::error, m013b::state.
//   LINKS: M-004, V-M-004, Phase-B2 step-4, C-SEARCH-SESSION-COMPLETION, C-SEARCH-ERROR-VISIBILITY, C-SEARCH-RESULT-CONTRACT, C-QUICKOPEN-FILES-MODE.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   SEARCH_EVENT_CHANNEL - Renderer event channel for streamed search updates.
//   DEFAULT_BATCH_SIZE - Default renderer result-batch capacity.
//   MAX_LINE_BYTES - Maximum line size admitted by the embedded fallback.
//   SearchOptions - Search preferences accepted from the renderer.
//   SearchHit - One normalized text-match result (additive optional matchStart/matchEnd first-submatch bounds within the delivered snippet, UTF-16 code units; wire-absent when unavailable; in files mode the path-only hit: line 0, column 0, empty snippet, bounds wire-absent).
//   SearchEvent - Batched search-event wire payload (additive optional partial flag on terminals).
//   SearchSink - Event-sink abstraction shared by Tauri and tests.
//   SearchRegistry - Registry of cancellable in-flight searches.
//   SearchTerminal - Which single terminal kind (complete/cancelled/error) ends a session.
//   SearchSessionCoordinator - Session-wide owner of the seq counter and the single terminal.
//   run_session - Execute one full search session across every validated root.
//   run_search - Embedded walker adapter emitting match batches through the session coordinator.
//   run_session_files - Execute one full files-mode session (path-only hits) across every validated root.
//   run_session_files_with_program - Files-mode session with an injectable rg program for deterministic verification.
//   run_files_walker - Embedded walker path leg: enumerate file paths without opening a single body.
//   run_ripgrep_files - rg --files listing transport for one root.
//   run_ripgrep_files_with_program - rg --files listing transport with an explicitly selected executable.
//   compile_inclusion_masks - Shared whitelist-glob semantics for the files-mode name filter; invalid globs explicitly ignored.
//   FILES_RESULT_CAP - Delivered path hits allowed per files-mode session.
//   compile_exclusion_masks - Shared mask semantics for walker filtering and rg --glob=! args; invalid masks explicitly ignored.
//   mt_search_spawn - Validate and start an asynchronous rg-backed search (mode "files" dispatches to the files-mode session).
//   mt_search_cancel - Cancel an in-flight search by id (flag flip; the terminal comes from the session coordinator).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: 2.6.0-beta - C-QUICKOPEN-FILES-MODE T-002: real files mode — mt_search_spawn dispatches the discriminator (START_BLOCK_FILES_MODE_DISPATCH) instead of discarding it; mode "files" runs the mirrored run_session_files(_with_program) session over the same coordinator/warm-up/registry/engine selection with a path-only walker leg (START_BLOCK_WALKER_PATH_LEG — no File::open, no line reading, no matcher) and the `rg --files` listing transport (START_BLOCK_BUILD_RIPGREP_FILES_COMMAND) inheriting #303's honesty machinery (bounded stderr capture, cancel watcher, 0/1-vs-error exit gate, injection seam); path-only SearchHits (line 0, column 0, empty snippet, wire-absent bounds) ride the existing match envelope so the #320 contract keeps working unchanged.
//   PREVIOUS: 2.5.0-beta - C-SEARCH-RESULT-CONTRACT T-001/T-002: SearchHit grows two additive optional match-bound fields (matchStart/matchEnd, wire-absent via skip_serializing_if) — the first submatch's span within the DELIVERED snippet text, in UTF-16 code-unit offsets (0-based start, exclusive end; the renderer substring index space) computed by one shared byte_offset_to_utf16_units conversion; filled by BOTH engines (rg --json first-submatch start/end replacing the reserved pattern_len placeholder, embedded walker match span), honest-or-absent when the match is not fully inside the delivered snippet (walker byte truncation; defensively for rg too); legacy column per-leg values untouched.
//   PREVIOUS: 2.4.0-beta - C-SEARCH-ERROR-VISIBILITY T-001/T-003: rg honesty and prompt cancel settle — stderr piped with a bounded START_BLOCK_RIPGREP_STDERR_CAPTURE tail (BLOCK log only, never the wire error), child exit status reaped and checked (0/1 normal, >=2 the single "rg exited with code N" error class), START_BLOCK_CANCEL_WATCHER thread kills+waits a silent child without needing a stdout line, compile_exclusion_masks applied symmetrically (walker filter + rg --glob=! args; invalid masks explicitly ignored), additive optional SearchEvent.partial with finalize(terminal, error, partial) computed conservatively in run_session.
//   PREVIOUS: 2.3.0-beta - C-SEARCH-SESSION-COMPLETION T-001: SearchSessionCoordinator owns the session-wide seq and the single terminal (complete/cancelled/error); run_search/run_ripgrep emit match batches only, run_session finalizes exactly once across all roots and both engines — no per-root terminals, no seq restart.
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
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager, State};

/// Tauri event channel for streaming search results.
pub const SEARCH_EVENT_CHANNEL: &str = "mt::search-event";

/// Default batch size for streaming hits. 16 matches is small enough
/// to feel snappy in the UI but large enough that tauri emit() overhead
/// doesn't dominate.
pub const DEFAULT_BATCH_SIZE: usize = 16;

/// C-QUICKOPEN-FILES-MODE: the honest area cap of one files-mode session —
/// the number of the quick-open ">30 files" promise that C-SEARCH-
/// LIFECYCLE-DISCARD removed as dead code, now enforced where the cost
/// lives: on DELIVERED path hits per session, by both legs (the walker
/// entry-loop break and the rg-local cap-stop flag). The cap is honesty,
/// not the count — the number would only move with documented rationale in
/// the change record (the #324 SEARCH_RESULT_CAP precedent). When it
/// fires, both legs stop promptly, the overshooting remainder is dropped
/// (never emitted), and the session's single terminal completes with
/// partial = true through the #303 additive flag: a cap is not a failure
/// and not a cancellation — the error voice stays empty and no capped set
/// is ever presented as complete.
const FILES_RESULT_CAP: usize = 30;

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
/// C-SEARCH-ERROR-VISIBILITY: `exclusions` masks are now applied
/// symmetrically by both engines through compile_exclusion_masks (the
/// walker filters entries; rg receives each valid mask as a --glob!=!
/// argument); invalid masks are explicitly ignored on both sides and
/// only force the session's partial flag.
///
/// allow(dead_code) on the struct — leading/trailing context line counts
/// remain unwired (tracked F-SEARCH-CONTEXT-LINES); inclusions are wired
/// for files mode through compile_inclusion_masks (content mode keeps
/// ignoring them).
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
    /// C-SEARCH-RESULT-CONTRACT: additive optional honest match bounds —
    /// the first submatch's span WITHIN THE DELIVERED snippet text, in
    /// UTF-16 code-unit offsets (0-based start, exclusive end): the exact
    /// index space of the renderer's String.substring, exact for BMP and
    /// astral content alike. Both engines' raw spans are byte offsets, so
    /// both legs convert through one shared helper (bounds_parity_
    /// across_engines pins identical semantics). Absent (wire-absent via
    /// skip_serializing_if, the struct's established optional-field
    /// style) when the match is not fully inside the delivered snippet —
    /// honest-or-absent, never a partial or fabricated span.
    #[serde(default, skip_serializing_if = "Option::is_none", rename = "matchStart")]
    pub match_start: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none", rename = "matchEnd")]
    pub match_end: Option<u32>,
}

// START_CONTRACT: byte_offset_to_utf16_units
//   PURPOSE: The one documented byte→bounds conversion (C-SEARCH-RESULT-CONTRACT): map an engine's raw byte offset within the delivered snippet text to a UTF-16 code-unit offset — the unit both engine legs deliver and the renderer's substring reads.
//   INPUTS: { text: &str - the delivered snippet text, byte_offset: usize - raw engine span offset within that text }
//   OUTPUTS: { Option<u32> - None when the offset falls outside text or is not a char boundary, else the UTF-16 code-unit offset }
//   SIDE_EFFECTS: None.
//   LINKS: SearchHit.match_start/match_end, bounds_parity_across_engines, V-M-004.
// END_CONTRACT: byte_offset_to_utf16_units
fn byte_offset_to_utf16_units(text: &str, byte_offset: usize) -> Option<u32> {
    if byte_offset > text.len() || !text.is_char_boundary(byte_offset) {
        return None;
    }
    Some(text[..byte_offset].encode_utf16().count() as u32)
}

/// Outbound event payload. Renderer parses {searchId, kind, hits[],
/// error?, partial?}. The kind discriminator is "match" | "complete" |
/// "error" | "cancelled" — same shape M-013-A's RipgrepDirectorySearcher
/// expects. C-SEARCH-ERROR-VISIBILITY: `partial` is one additive
/// optional flag, absent on match events and always present on the
/// single terminal event, honestly marking truncated/incomplete result
/// sets (error/cancelled with streamed hits, or complete with a size
/// limit or an active exclusion mask).
#[derive(Serialize, Debug, Clone)]
pub struct SearchEvent {
    #[serde(rename = "searchId")]
    pub search_id: String,
    pub kind: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub hits: Vec<SearchHit>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub partial: Option<bool>,
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
            partial: None,
            seq,
        });
        true
    }

    /// Emit the session's single terminal event. Later calls are
    /// no-ops that return false: terminal finalization cannot occur twice.
    /// C-SEARCH-ERROR-VISIBILITY: `partial` honestly marks the result set
    /// (true on error/cancelled with streamed hits, or on complete with a
    /// size limit or an active exclusion mask — computed by run_session).
    fn finalize(&mut self, terminal: SearchTerminal, error: Option<String>, partial: bool) -> bool {
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
            partial: Some(partial),
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
    // C-SEARCH-ERROR-VISIBILITY: honest partial accounting. A complete
    // terminal must not silently claim completeness when a size limit or
    // at least one exclusion mask (valid or explicitly-ignored invalid)
    // was active; error/cancelled terminals are partial whenever hits
    // were already streamed.
    let masks = compile_exclusion_masks(opts.exclusions.as_ref());
    let size_limit_active = opts.max_file_size.is_some();
    for root in roots {
        if cancel.load(Ordering::SeqCst) {
            break;
        }
        let result = if in_process {
            run_search(root, pattern, opts, cancel.clone(), coordinator)
                .map_err(|e| (0u32, e.message))
        } else {
            run_ripgrep_with_program(rg_program, root, pattern, opts, cancel.clone(), coordinator)
        };
        match result {
            Ok(hits) => total_hits += hits,
            Err((root_streamed, e)) => {
                total_hits += root_streamed;
                safe_eprintln!(
                    "[Search][run][BLOCK_RIPGREP_FAILED search_id={} err={e}]",
                    coordinator.search_id()
                );
                let partial = total_hits > 0;
                coordinator.finalize(SearchTerminal::Error, Some(e), partial);
                return (total_hits, "error");
            }
        }
    }
    let terminal = if cancel.load(Ordering::SeqCst) {
        SearchTerminal::Cancelled
    } else {
        SearchTerminal::Complete
    };
    let partial = match terminal {
        SearchTerminal::Complete => {
            size_limit_active || masks.invalid_count > 0 || !masks.valid.is_empty()
        }
        _ => total_hits > 0,
    };
    coordinator.finalize(terminal, None, partial);
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

// START_CONTRACT: run_session_files
//   PURPOSE: Execute one full files-mode session across every validated root through the single coordinator (C-QUICKOPEN-FILES-MODE): one path-only SearchHit per traversed file, no body ever opened, no pattern applied — the mirrored content-mode session discipline over the same coordinator.
//   INPUTS: { roots: &[PathBuf] - M-010-validated roots in traversal order, opts: &SearchOptions - filter options (the pattern and the content-matcher options are ignored), in_process: bool - embedded walker vs rg shellout, cancel: Arc<AtomicBool>, coordinator: &mut SearchSessionCoordinator }
//   OUTPUTS: { (u32, &'static str) - total delivered path hits across all roots and the emitted terminal kind }
//   SIDE_EFFECTS: Emits path-only match events for all roots and exactly one terminal event through the coordinator; a returned engine error stops the remaining roots.
//   LINKS: mt_search_spawn, run_files_walker, run_ripgrep_files, SearchSessionCoordinator, V-M-004
// END_CONTRACT: run_session_files
fn run_session_files(
    roots: &[PathBuf],
    opts: &SearchOptions,
    in_process: bool,
    cancel: Arc<AtomicBool>,
    coordinator: &mut SearchSessionCoordinator,
) -> (u32, &'static str) {
    run_session_files_with_program(
        std::ffi::OsStr::new("rg"),
        roots,
        opts,
        in_process,
        cancel,
        coordinator,
    )
}

/// Deterministic rg-error injection seam mirroring run_session_with_program:
/// a thin test indirection only; every production root still flows through
/// the same coordinator and finalize path.
fn run_session_files_with_program(
    rg_program: &std::ffi::OsStr,
    roots: &[PathBuf],
    opts: &SearchOptions,
    in_process: bool,
    cancel: Arc<AtomicBool>,
    coordinator: &mut SearchSessionCoordinator,
) -> (u32, &'static str) {
    let mut total_paths: u32 = 0;
    // START_BLOCK_FILES_CAP_STOP
    // C-QUICKOPEN-FILES-MODE T-004: the cap machinery is LOCAL to the
    // files-mode session and deliberately distinct from the shared cancel
    // token. `cap_stop` stops both legs promptly once FILES_RESULT_CAP
    // delivered path hits are reached; the cancel watcher and the
    // exit-status gate of the rg transport observe it too, so a cap-killed
    // rg child can never surface as a false Cancelled or "rg exited with
    // code N" terminal. `delivered` counts delivered path hits per session
    // exactly, so the delivered set never exceeds the cap — including when
    // the crossing batch overshoots (the remainder is dropped, never
    // emitted). The shared cancel token is never written by the cap path:
    // the terminal decision below reads ONLY the shared cancel flag, so a
    // capped session completes (never cancels, never errors).
    let cap_stop = Arc::new(AtomicBool::new(false));
    let delivered = Arc::new(AtomicUsize::new(0));
    // END_BLOCK_FILES_CAP_STOP
    // Honest partial accounting, mirroring run_session: a complete terminal
    // must not silently claim completeness when a size limit, at least one
    // exclusion mask, or any explicitly-ignored invalid glob (exclusion or
    // inclusion) was active; error/cancelled terminals are partial whenever
    // hits were already streamed.
    let inclusions = compile_inclusion_masks(opts.inclusions.as_ref());
    let masks = compile_exclusion_masks(opts.exclusions.as_ref());
    let size_limit_active = opts.max_file_size.is_some();
    for root in roots {
        if cancel.load(Ordering::SeqCst) || cap_stop.load(Ordering::SeqCst) {
            break;
        }
        let result = if in_process {
            Ok(run_files_walker(
                root,
                opts,
                &inclusions.valid,
                &masks.valid,
                cancel.clone(),
                cap_stop.clone(),
                delivered.clone(),
                coordinator,
            ))
        } else {
            run_ripgrep_files_with_program(
                rg_program,
                root,
                opts,
                &inclusions.valid,
                &masks.valid,
                cancel.clone(),
                cap_stop.clone(),
                delivered.clone(),
                coordinator,
            )
        };
        match result {
            Ok((hits, _capped)) => total_paths += hits,
            Err((root_streamed, e)) => {
                total_paths += root_streamed;
                safe_eprintln!(
                    "[Search][run][BLOCK_RIPGREP_FAILED search_id={} err={e}]",
                    coordinator.search_id()
                );
                let partial = total_paths > 0;
                coordinator.finalize(SearchTerminal::Error, Some(e), partial);
                return (total_paths, "error");
            }
        }
    }
    let terminal = if cancel.load(Ordering::SeqCst) {
        SearchTerminal::Cancelled
    } else {
        SearchTerminal::Complete
    };
    // C-QUICKOPEN-FILES-MODE: the complete-terminal partial formula carries
    // the #303 triggers over unchanged (size limit, valid exclusion masks,
    // any ignored invalid glob — exclusion or inclusion) and grows exactly
    // one new trigger: cap_fired — a capped set is never presented as
    // complete.
    let cap_fired = cap_stop.load(Ordering::SeqCst);
    let partial = match terminal {
        SearchTerminal::Complete => {
            size_limit_active
                || masks.invalid_count > 0
                || inclusions.invalid_count > 0
                || !masks.valid.is_empty()
                || cap_fired
        }
        _ => total_paths > 0,
    };
    coordinator.finalize(terminal, None, partial);
    (total_paths, terminal_kind_name(terminal))
}

// START_BLOCK_ENGINE_PARITY_TABLE
// C-SEARCH-ENGINE-PARITY: the one documented engine-parity table of the
// search zone. It governs BOTH engines — the embedded ignore/regex walker
// and the rg shell-out — across all FOUR transport legs (content walker,
// files walker, content rg search, rg files listing). Every shared
// semantic appears here exactly once, with its owning code anchor per
// leg; the single flag source below (resolve_engine_flags) is the only
// place these decisions are made, so the same options and the same
// fixture cannot produce different result sets depending on which engine
// a machine selected. Per-leg leftovers are only the legs' inherent shape
// (rg process arguments versus ignore-crate builder calls) and the
// documented files-mode size row.
//
// CASE MODE — explicit-option-only on both engines:
//   semantic: the renderer's isCaseSensitive toggle is the only case
//   control. Toggle off: case-INsensitive for EVERY pattern, including
//   Mixed-case patterns. Toggle on: exact case only.
//   walker anchor: build_matcher — case_insensitive(!opts.is_case_sensitive
//   .unwrap_or(false)) (the unchanged canon).
//   rg content anchor: START_BLOCK_BUILD_RIPGREP_COMMAND — an explicit
//   --case-sensitive on the toggle, an explicit --ignore-case otherwise.
//   files legs: no matcher — the row does not apply.
//   removal reason: rg's --smart-case was the divergence source. Its
//   documented implicit mode searched case-SENSITIVELY whenever the
//   pattern contained any uppercase character, silently overriding the
//   renderer's explicit toggle on the rg leg only (the pattern "Needle"
//   with default options returned all three case variants on the walker
//   but only the exact-case line on rg). Receipt: the failing-first
//   engine_parity_case_modes_across_legs (red on the pre-change tree: rg
//   leg 1 variant vs walker 3; green once the case decision flows through
//   resolve_engine_flags).
// END_BLOCK_ENGINE_PARITY_TABLE

// START_CONTRACT: resolve_engine_flags
//   PURPOSE: The one shared flag-resolution artifact (C-SEARCH-ENGINE-PARITY): resolve the engine-parity table's shared semantics from SearchOptions exactly once so both WalkBuilder chains and both rg command builders draw from one source — no per-leg hardcoded flag may decide an aligned row outside this function (the gitignore-outside row completes here with T-003's --no-require-git delivery).
//   INPUTS: { opts: &SearchOptions - renderer search preferences }
//   OUTPUTS: { EngineFlags - the resolved shared semantics consumed by all four transport legs }
//   SIDE_EFFECTS: None.
//   LINKS: START_BLOCK_ENGINE_PARITY_TABLE, run_files_walker, run_search, run_ripgrep_with_program, run_ripgrep_files_with_program, engine_parity_case_modes_across_legs, V-M-004.
// END_CONTRACT: resolve_engine_flags
/// Resolved shared engine semantics — the engine-parity table's flag
/// source. One construction per transport leg; every field is the table's
/// decision, never a per-leg re-derivation.
#[derive(Clone, Copy, Debug)]
struct EngineFlags {
    /// Case row (explicit-option-only): insensitive by default, sensitive
    /// on the renderer's isCaseSensitive toggle — the walker's
    /// build_matcher semantics is the canon on both engines.
    case_sensitive: bool,
    /// The ignore-family switch: no_ignore disables every ignore source.
    no_ignore: bool,
    /// Hidden entries stay invisible unless include_hidden is set.
    include_hidden: bool,
    /// Symlink traversal.
    follow_symlinks: bool,
    /// Whole-word matching.
    whole_word: bool,
    /// Literal (escaped) versus raw regex pattern handling.
    is_regexp: bool,
    /// Per-file size ceiling. The files-LISTING leg deliberately skips it
    /// — the documented files-mode size row (see the parity table).
    max_file_size: Option<u64>,
}

fn resolve_engine_flags(opts: &SearchOptions) -> EngineFlags {
    EngineFlags {
        // Explicit-option-only (C-SEARCH-ENGINE-PARITY): the renderer's
        // isCaseSensitive toggle is the only case control; there is no
        // pattern-dependent implicit mode on either engine.
        case_sensitive: opts.is_case_sensitive.unwrap_or(false),
        no_ignore: opts.no_ignore.unwrap_or(false),
        include_hidden: opts.include_hidden.unwrap_or(false),
        follow_symlinks: opts.follow_symlinks.unwrap_or(false),
        whole_word: opts.is_whole_word.unwrap_or(false),
        is_regexp: opts.is_regexp.unwrap_or(false),
        max_file_size: opts.max_file_size,
    }
}

// START_BLOCK_WALKER_PATH_LEG
// C-QUICKOPEN-FILES-MODE: the files-mode walker path leg — the identical
// WalkBuilder filter setup of the content walker (standard filters, hidden,
// ignore rules, require_git(false), symlink following, max_filesize metadata
// skip) minus the body scan: no File::open, no BufReader lines, no matcher.
// Each admitted file entry emits exactly one path-only SearchHit in ordinary
// traversal order through the same coordinator batching.
fn run_files_walker(
    root: &Path,
    opts: &SearchOptions,
    inclusion_globs: &[String],
    exclusion_masks: &[String],
    cancel: Arc<AtomicBool>,
    cap_stop: Arc<AtomicBool>,
    delivered: Arc<AtomicUsize>,
    coordinator: &mut SearchSessionCoordinator,
) -> (u32, bool) {
    // The engine-parity table's shared semantics resolve exactly once —
    // this leg consumes resolve_engine_flags (C-SEARCH-ENGINE-PARITY).
    let flags = resolve_engine_flags(opts);
    let mut walker = WalkBuilder::new(root);
    let respect_ignore = !flags.no_ignore;
    walker
        .standard_filters(true)
        .hidden(!flags.include_hidden)
        .ignore(respect_ignore)
        .git_ignore(respect_ignore)
        .git_global(respect_ignore)
        .git_exclude(respect_ignore)
        .require_git(false) // honor .gitignore outside git repos (matches ripgrep --no-require-git)
        .follow_links(flags.follow_symlinks);
    if let Some(max_size) = flags.max_file_size {
        walker.max_filesize(Some(max_size));
    }
    // Whitelist name filtering (C-QUICKOPEN-FILES-MODE): ONE combined
    // OverrideBuilder per root, built in the explicit shared order —
    // inclusions first, exclusions after, last match wins — so the
    // gitignore last-match-wins semantics make exclusions sit ON TOP of
    // inclusions (a path matching both is excluded). Invalid globs were
    // dropped at compile time (compile_inclusion_masks) and only force the
    // session's partial flag.
    if !inclusion_globs.is_empty() || !exclusion_masks.is_empty() {
        let mut builder = ignore::overrides::OverrideBuilder::new(root);
        for glob in inclusion_globs {
            let _ = builder.add(glob);
        }
        for mask in exclusion_masks {
            let _ = builder.add(&format!("!{mask}"));
        }
        if let Ok(overrides) = builder.build() {
            walker.overrides(overrides);
        }
    }

    let mut batch: Vec<SearchHit> = Vec::with_capacity(DEFAULT_BATCH_SIZE);
    let mut total: u32 = 0;
    let mut capped = false;
    for entry in walker.build() {
        if cancel.load(Ordering::SeqCst) {
            // Drain the pending batch; the session terminal is owned by
            // run_session_files's coordinator, not by this leg.
            coordinator.emit_matches(std::mem::take(&mut batch));
            return (total, capped);
        }
        if cap_stop.load(Ordering::SeqCst) {
            // The session-wide FILES_RESULT_CAP fired (possibly in another
            // root): stop the traversal promptly.
            capped = true;
            break;
        }
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue, // ignore-crate errors (perm denied etc.) — skip silently
        };
        if !entry.file_type().map(|t| t.is_file()).unwrap_or(false) {
            continue;
        }
        // C-QUICKOPEN-FILES-MODE T-004: cap enforcement per delivered hit,
        // BEFORE emission, against the session-wide delivered counter — the
        // delivered set truncates to the cap exactly; the overshooting
        // remainder is dropped, never emitted.
        let seen = delivered.fetch_add(1, Ordering::SeqCst);
        if seen >= FILES_RESULT_CAP {
            capped = true;
            cap_stop.store(true, Ordering::SeqCst);
            break;
        }
        // Path-only hit: the name-only decision. The body is never opened —
        // line 0, column 0, empty snippet, truncated false, bounds wire-absent
        // (the established skip_serializing_if style).
        total += 1;
        batch.push(SearchHit {
            path: entry.path().display().to_string(),
            line: 0,
            column: 0,
            snippet: String::new(),
            truncated: false,
            match_start: None,
            match_end: None,
        });
        if batch.len() >= DEFAULT_BATCH_SIZE {
            coordinator.emit_matches(std::mem::take(&mut batch));
        }
    }
    if !batch.is_empty() {
        coordinator.emit_matches(std::mem::take(&mut batch));
    }
    (total, capped)
}
// END_BLOCK_WALKER_PATH_LEG

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

/// Shared exclusion-mask semantics for BOTH engines (C-SEARCH-ERROR-VISIBILITY).
/// Each mask is validated once here and consumed two ways: the embedded
/// walker applies every valid mask through ignore's override globs (the
/// same gitignore-style globset engine rg uses for `--glob`), and the rg
/// transport receives every valid raw mask verbatim as a `--glob=!mask`
/// argument.
///
/// Documented semantics (defined exactly once):
/// - masks match against the entry's path RELATIVE to its search root
///   (rg matches against the per-root relative path as well);
/// - a bare mask (no `/`) matches the basename at any depth and the
///   walker prunes the whole masked subtree, mirroring rg's `--glob`
///   behavior; gitignore-style glob syntax otherwise (`*` does not
///   cross path separators);
/// - case-SENSITIVE (the documented choice; matches rg's default);
/// - an INVALID mask (empty/whitespace-only, NUL byte, or a glob the
///   engine rejects — e.g. an unclosed `[`) is explicitly ignored per
///   this change's recorded choice: never passed to rg, never used by
///   the walker — it only increments `invalid_count` so the session's
///   terminal can force the honest partial flag.
struct ExclusionMasks {
    /// Raw valid mask texts, passed to rg as `--glob=!mask` verbatim.
    valid: Vec<String>,
    /// Invalid masks dropped by both engines; forces the partial flag.
    invalid_count: usize,
}

fn compile_exclusion_masks(exclusions: Option<&Vec<String>>) -> ExclusionMasks {
    let mut valid = Vec::new();
    let mut invalid_count = 0usize;
    // The "!"-prefixed override form is the exclusion class of the same
    // gitignore-style glob engine rg uses for --glob; the builder root is
    // irrelevant for a syntax validity check. add() alone validates.
    let mut validator = ignore::overrides::OverrideBuilder::new(Path::new(""));
    for raw in exclusions.into_iter().flatten() {
        let trimmed = raw.trim();
        if trimmed.is_empty() || trimmed.contains('\0') {
            invalid_count += 1;
            continue;
        }
        match validator.add(&format!("!{trimmed}")) {
            Ok(_) => valid.push(trimmed.to_string()),
            Err(_) => {
                // Invalid mask: explicitly ignored by BOTH engines —
                // never handed to rg, never used by the walker.
                invalid_count += 1;
            }
        }
    }
    ExclusionMasks {
        valid,
        invalid_count,
    }
}

// START_CONTRACT: compile_inclusion_masks
//   PURPOSE: The files-mode whitelist-glob semantics (C-QUICKOPEN-FILES-MODE) — the one documented extension of the compile_exclusion_masks canon: the renderer-computed name filter finally reaches BOTH files-mode legs.
//   INPUTS: { inclusions: Option<&Vec<String>> - raw renderer globs }
//   OUTPUTS: { InclusionMasks - valid raw glob texts plus the ignored-invalid count }
//   SIDE_EFFECTS: None.
//   LINKS: compile_exclusion_masks, run_files_walker, run_ripgrep_files_with_program, run_session_files, V-M-004.
// END_CONTRACT: compile_inclusion_masks
/// Files-mode whitelist-glob semantics for BOTH legs (C-QUICKOPEN-FILES-MODE).
/// Each glob is validated once here and consumed two ways: the walker path
/// leg applies every valid glob through ignore's whitelist overrides (the
/// same gitignore-style globset engine rg uses for `--glob`), and the rg
/// files transport receives every valid raw glob verbatim as a `--glob=`
/// argument.
///
/// Documented semantics (defined exactly once, as the extension of the
/// exclusion canon beside compile_exclusion_masks):
/// - valid globs match against the entry's path RELATIVE to its search root
///   (rg matches against the per-root relative path as well);
/// - a bare glob (no `/`) matches the basename at any depth and the walker
///   prunes nothing on its behalf — it widens the whitelist; gitignore-style
///   glob syntax otherwise (`*` does not cross path separators);
/// - case-SENSITIVE (the documented choice; recorded v1 parity with rg's
///   --glob default — quickOpen's tab matching stays case-insensitive
///   renderer-side);
/// - an INVALID glob (empty/whitespace-only, NUL byte, or a glob the engine
///   rejects — e.g. an unclosed `[`) is explicitly ignored by BOTH legs —
///   never passed to rg, never used by the walker — it only increments
///   `invalid_count` so the session's terminal can force the honest partial
///   flag. Valid inclusions never force partial by themselves; absent or
///   empty inclusions mean no name filter (all traversed files, subject to
///   ignore rules, exclusions and the files cap).
struct InclusionMasks {
    /// Raw valid glob texts, passed to rg as `--glob=glob` verbatim.
    valid: Vec<String>,
    /// Invalid globs dropped by both legs; forces the partial flag.
    invalid_count: usize,
}

fn compile_inclusion_masks(inclusions: Option<&Vec<String>>) -> InclusionMasks {
    let mut valid = Vec::new();
    let mut invalid_count = 0usize;
    // The plain (whitelist) form is the inclusion class of the same
    // gitignore-style glob engine rg uses for --glob; the builder root is
    // irrelevant for a syntax validity check. add() alone validates.
    let mut validator = ignore::overrides::OverrideBuilder::new(Path::new(""));
    for raw in inclusions.into_iter().flatten() {
        let trimmed = raw.trim();
        if trimmed.is_empty() || trimmed.contains('\0') {
            invalid_count += 1;
            continue;
        }
        match validator.add(trimmed) {
            Ok(_) => valid.push(trimmed.to_string()),
            Err(_) => {
                // Invalid glob: explicitly ignored by BOTH legs —
                // never handed to rg, never used by the walker.
                invalid_count += 1;
            }
        }
    }
    InclusionMasks {
        valid,
        invalid_count,
    }
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

    // The engine-parity table's shared semantics resolve exactly once —
    // this leg consumes resolve_engine_flags (C-SEARCH-ENGINE-PARITY).
    let flags = resolve_engine_flags(opts);
    let mut walker = WalkBuilder::new(root);
    let respect_ignore = !flags.no_ignore;
    walker
        .standard_filters(true)
        .hidden(!flags.include_hidden)
        .ignore(respect_ignore)
        .git_ignore(respect_ignore)
        .git_global(respect_ignore)
        .git_exclude(respect_ignore)
        .require_git(false) // honor .gitignore outside git repos (matches ripgrep --no-require-git)
        .follow_links(flags.follow_symlinks);
    if let Some(max_size) = flags.max_file_size {
        walker.max_filesize(Some(max_size));
    }

    // C-SEARCH-ERROR-VISIBILITY: exclusion masks filter entries BEFORE any
    // file is opened, through ignore's override globs — the same
    // gitignore-style glob engine rg receives as --glob=! arguments (see
    // compile_exclusion_masks for the one documented mask semantics).
    // The walker prunes masked subtrees natively; invalid masks were
    // dropped at compile time and only force the session's partial flag.
    let exclusion_masks = compile_exclusion_masks(opts.exclusions.as_ref());
    if !exclusion_masks.valid.is_empty() {
        let mut builder = ignore::overrides::OverrideBuilder::new(root);
        for mask in &exclusion_masks.valid {
            // compile_exclusion_masks already validated the glob syntax;
            // a divergent error here degrades to "ignored" exactly like an
            // invalid mask rather than failing the session.
            let _ = builder.add(&format!("!{mask}"));
        }
        if let Ok(overrides) = builder.build() {
            walker.overrides(overrides);
        }
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
            // C-SEARCH-RESULT-CONTRACT: bounds live in the DELIVERED
            // snippet's index space; the ellipsis marker is decoration the
            // renderer never indexes into, so the delivered text ends at
            // this byte offset.
            let delivered_end_byte = snippet.len() - if truncated { '…'.len_utf8() } else { 0 };
            for m in matcher.find_iter(&line) {
                total_hits += 1;
                // Honest-or-absent: every walker hit carries the span of
                // the match it represents as UTF-16 code units over the
                // delivered snippet (converted through the one shared
                // helper); a match not fully inside the delivered
                // (byte-truncated) text stays wire-absent — never a
                // partial span. The legacy 1-based column keeps its
                // current value untouched (known walker/rg divergence is
                // superseded for rendering by the bounds; recorded debt).
                let (match_start, match_end) = if m.end() <= delivered_end_byte {
                    match (
                        byte_offset_to_utf16_units(&snippet, m.start()),
                        byte_offset_to_utf16_units(&snippet, m.end()),
                    ) {
                        (Some(s), Some(e)) => (Some(s), Some(e)),
                        _ => (None, None),
                    }
                } else {
                    (None, None)
                };
                batch.push(SearchHit {
                    path: file_path.display().to_string(),
                    line: (line_num + 1) as u32,
                    column: (m.start() + 1) as u32,
                    snippet: snippet.clone(),
                    truncated,
                    match_start,
                    match_end,
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
        // START_BLOCK_FILES_MODE_DISPATCH
        // C-QUICKOPEN-FILES-MODE: the discriminator is dispatched, not
        // discarded. mode "files" runs the mirrored files-mode session —
        // the same coordinator, 120 ms warm-up, registry insert/remove
        // lifecycle, M-010 root validation and engine selection; the
        // pattern and the content-matcher options are ignored there, so an
        // invalid content pattern can never fail a files search. Every
        // other mode value keeps the content run_session byte-for-byte.
        let (total_hits, kind) = if mode == "files" {
            run_session_files(&validated_roots, &opts, in_process, cancel, &mut coordinator)
        } else {
            run_session(&validated_roots, &pattern, &opts, in_process, cancel, &mut coordinator)
        };
        // END_BLOCK_FILES_MODE_DISPATCH
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
) -> Result<u32, (u32, String)> {
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
//   PURPOSE: Run the rg transport with an explicitly selected executable for deterministic failure verification; the child's exit status decides normal completion (0/1) versus the single error terminal class, and its stderr feeds a bounded BLOCK-log-only capture.
//   INPUTS: { rg_program: &OsStr - executable path/name, remaining inputs: same as run_ripgrep }
//   OUTPUTS: { Result<u32, (u32, String)> - per-root total hits, or the streamed-so-far total plus a stable spawn/stream/exit-status error class }
//   SIDE_EFFECTS: Spawns the selected child process; a START_BLOCK_CANCEL_WATCHER thread kills+waits a silent child on the cancel flag and reaps it exactly once; a bounded stderr capture thread drains the pipe to the BLOCK log only; emits match batches through the coordinator (terminals are owned by run_session).
//   LINKS: run_ripgrep, run_session, compile_exclusion_masks, V-M-004 scenario-5, C-SEARCH-ERROR-VISIBILITY
// END_CONTRACT: run_ripgrep_with_program
fn run_ripgrep_with_program(
    rg_program: &std::ffi::OsStr,
    root: &Path,
    pattern: &str,
    opts: &SearchOptions,
    cancel: Arc<AtomicBool>,
    coordinator: &mut SearchSessionCoordinator,
) -> Result<u32, (u32, String)> {
    use std::io::{BufRead, BufReader, Read};
    use std::process::{Command, Stdio};

    // START_BLOCK_BUILD_RIPGREP_COMMAND
    // Every shared semantic below resolves through resolve_engine_flags
    // (C-SEARCH-ENGINE-PARITY) — no per-leg hardcoded flag decides an
    // aligned row here.
    let flags = resolve_engine_flags(opts);
    let mut cmd = Command::new(rg_program);
    cmd.arg("--json").arg("--no-heading");
    if !flags.is_regexp {
        cmd.arg("--fixed-strings");
    }
    // Case row (C-SEARCH-ENGINE-PARITY): explicit-option-only. The
    // pattern-dependent --smart-case branch is gone — its documented
    // implicit mode searched case-sensitively for any Mixed-case pattern
    // and silently overrode the renderer's explicit toggle on this leg
    // only (see the parity table's case row).
    if flags.case_sensitive {
        cmd.arg("--case-sensitive");
    } else {
        cmd.arg("--ignore-case");
    }
    if flags.whole_word {
        cmd.arg("--word-regexp");
    }
    if flags.include_hidden {
        cmd.arg("--hidden");
    }
    if flags.no_ignore {
        cmd.arg("--no-ignore");
    }
    if flags.follow_symlinks {
        cmd.arg("--follow");
    }
    // C-SEARCH-ERROR-VISIBILITY: exclusion masks go to rg symmetrically
    // with the walker — each VALID mask verbatim as a --glob=! argument
    // (compile_exclusion_masks); invalid masks are explicitly ignored
    // here and only force the session's partial flag.
    let exclusions = compile_exclusion_masks(opts.exclusions.as_ref());
    for mask in &exclusions.valid {
        cmd.arg(format!("--glob=!{mask}"));
    }
    if let Some(max) = flags.max_file_size {
        cmd.arg(format!("--max-filesize={max}"));
    }
    cmd.arg("--").arg(pattern).arg(root);
    cmd.stdout(Stdio::piped()).stderr(Stdio::piped());
    // END_BLOCK_BUILD_RIPGREP_COMMAND

    // START_BLOCK_SPAWN_RIPGREP_PROCESS
    safe_eprintln!(
        "[Search][rg][BLOCK_SPAWN search_id={} root={}]",
        coordinator.search_id(),
        root.display()
    );
    let mut child = cmd.spawn().map_err(|e| (0u32, format!("spawn rg: {e}")))?;
    let stdout = child.stdout.take().ok_or((0u32, "no stdout".to_string()))?;
    let mut stderr = child.stderr.take().ok_or((0u32, "no stderr".to_string()))?;
    let reader = BufReader::new(stdout);
    // END_BLOCK_SPAWN_RIPGREP_PROCESS

    // START_BLOCK_RIPGREP_STDERR_CAPTURE
    // Bounded stderr capture (C-SEARCH-ERROR-VISIBILITY): a small fixed
    // cap so a chatty child can neither deadlock on a full pipe nor
    // allocate without bound; the drained tail reaches the BLOCK log
    // only — captured stderr text never enters the wire error field.
    const STDERR_CAPTURE_CAP_BYTES: usize = 8 * 1024;
    let stderr_handle = std::thread::spawn(move || {
        let mut captured: Vec<u8> = Vec::new();
        let mut chunk = [0u8; 1024];
        loop {
            match stderr.read(&mut chunk) {
                Ok(0) => break,
                Ok(n) => {
                    let room = STDERR_CAPTURE_CAP_BYTES.saturating_sub(captured.len());
                    if room > 0 {
                        let take = n.min(room);
                        captured.extend_from_slice(&chunk[..take]);
                    }
                    // Cap reached: keep draining to EOF without retaining.
                }
                Err(_) => break,
            }
        }
        captured
    });
    // END_BLOCK_RIPGREP_STDERR_CAPTURE

    // START_BLOCK_CANCEL_WATCHER
    // C-SEARCH-ERROR-VISIBILITY T-003: a quiet rg child must not hold the
    // session hostage until its next stdout line. A bounded watcher
    // thread observes the cancel flag, kills the child on the flag,
    // waits for it and exits. It never removes registry entries and
    // never emits a terminal — SearchSessionCoordinator (run_session)
    // stays the single terminal owner. The watcher owns the child and
    // reaps it exactly once; the main path observes the exit status
    // through the channel below.
    let watcher_stop = Arc::new(AtomicBool::new(false));
    let (status_tx, status_rx) = std::sync::mpsc::channel();
    let watcher = {
        let cancel_for_watcher = Arc::clone(&cancel);
        let stop_for_watcher = Arc::clone(&watcher_stop);
        std::thread::spawn(move || {
            let mut child = child;
            if cancel_for_watcher.load(Ordering::SeqCst) {
                let _ = child.kill();
            } else {
                loop {
                    if cancel_for_watcher.load(Ordering::SeqCst) {
                        let _ = child.kill();
                        break;
                    }
                    if stop_for_watcher.load(Ordering::SeqCst) {
                        break;
                    }
                    std::thread::sleep(std::time::Duration::from_millis(5));
                }
            }
            // Reap exactly once here — the killed or naturally exited
            // child cannot leak as a zombie.
            let status = child.wait();
            let _ = status_tx.send(status);
        })
    };
    // END_BLOCK_CANCEL_WATCHER

    let mut total: u32 = 0;
    let mut batch: Vec<SearchHit> = Vec::with_capacity(DEFAULT_BATCH_SIZE);

    for line in reader.lines() {
        if cancel.load(Ordering::SeqCst) {
            // The watcher owns kill+wait; EOF from the kill unblocks this
            // loop even when the child never produced another line.
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
        // C-SEARCH-RESULT-CONTRACT: the first submatch's span feeds the
        // legacy 0-based column field (per-leg value untouched) AND the
        // additive matchStart/matchEnd bounds. rg --json submatch
        // offsets are byte offsets within the line, so the conversion to
        // UTF-16 code units over the delivered snippet runs through the
        // same shared helper as the walker leg (bounds_parity_across_
        // engines pins identical semantics). A span not fully inside the
        // delivered line stays wire-absent — honest-or-absent, never a
        // partial span. The renderer shim maps present bounds into the
        // array-pair range for highlighting.
        let first_submatch = data
            .get("submatches")
            .and_then(|sm| sm.as_array())
            .and_then(|arr| arr.first());
        let column = first_submatch
            .and_then(|m| m.get("start"))
            .and_then(|s| s.as_u64())
            .unwrap_or(0) as u32;
        let raw_start = first_submatch
            .and_then(|m| m.get("start"))
            .and_then(|s| s.as_u64());
        let raw_end = first_submatch
            .and_then(|m| m.get("end"))
            .and_then(|s| s.as_u64());
        let (match_start, match_end) = match (raw_start, raw_end) {
            (Some(s), Some(e)) if e as usize <= snippet.len() => {
                match (
                    byte_offset_to_utf16_units(&snippet, s as usize),
                    byte_offset_to_utf16_units(&snippet, e as usize),
                ) {
                    (Some(bs), Some(be)) => (Some(bs), Some(be)),
                    _ => (None, None),
                }
            }
            _ => (None, None),
        };
        batch.push(SearchHit {
            path: path_text,
            line: line_num,
            column,
            snippet,
            truncated: false,
            match_start,
            match_end,
        });
        total += 1;
        if batch.len() >= DEFAULT_BATCH_SIZE {
            coordinator.emit_matches(std::mem::take(&mut batch));
        }
    }

    coordinator.emit_matches(std::mem::take(&mut batch));

    // C-SEARCH-ERROR-VISIBILITY: stop the watcher cleanly when no cancel
    // raced in, then observe the reaped child's exit status through the
    // watcher channel (the watcher reaps exactly once; this side never
    // blocks on wait() itself).
    watcher_stop.store(true, Ordering::SeqCst);
    if watcher.join().is_err() {
        return Err((0u32, "rg watcher thread failed".to_string()));
    }
    let status = match status_rx.recv() {
        Ok(Ok(status)) => status,
        Ok(Err(e)) => return Err((0u32, format!("wait rg: {e}"))),
        Err(_) => return Err((0u32, "rg watcher dropped the exit status".to_string())),
    };
    let stderr_bytes = stderr_handle.join().unwrap_or_default();
    let stderr_tail = String::from_utf8_lossy(&stderr_bytes);
    if !stderr_tail.is_empty() {
        // BLOCK log only — the captured tail never enters the wire error.
        safe_eprintln!(
            "[Search][rg][BLOCK_RIPGREP_STDERR_TAIL bytes={} tail={}]",
            stderr_tail.len(),
            stderr_tail
        );
    }

    // Exit-status honesty: codes 0 (matches) and 1 (no matches) keep
    // completing normally; any other exit — when not cancelled — is the
    // single error terminal class. The message carries the exit code
    // only: captured stderr text, query text, match contents and user
    // paths never enter the wire error field.
    if !cancel.load(Ordering::SeqCst) {
        let abnormal = match status.code() {
            Some(code) if code != 0 && code != 1 => Some(format!("rg exited with code {code}")),
            Some(_) => None,
            None => Some("rg exited with code signal".to_string()),
        };
        if let Some(message) = abnormal {
            safe_eprintln!("[Search][rg][BLOCK_RIPGREP_EXIT class={message}]");
            return Err((total, message));
        }
    }
    Ok(total)
}

// START_CONTRACT: run_ripgrep_files
//   PURPOSE: Execute the `rg --files` listing transport for one root and stream path-only hits through the session coordinator (C-QUICKOPEN-FILES-MODE) — the files-mode counterpart of run_ripgrep.
//   INPUTS: { root: &Path, opts: &SearchOptions, inclusion_globs: &[String] - valid globs from compile_inclusion_masks, exclusion_masks: &[String] - valid masks from compile_exclusion_masks, cancel: Arc<AtomicBool>, cap_stop: Arc<AtomicBool> - session-local cap flag, delivered: Arc<AtomicUsize> - session-wide delivered counter, coordinator: &mut SearchSessionCoordinator }
//   OUTPUTS: { Result<(u32, bool), (u32, String)> - per-root delivered path hits plus the cap-fired marker, or the streamed-so-far total plus a stable spawn/stream error }
//   SIDE_EFFECTS: Spawns and waits for an rg child process; emits path-only match batches through the coordinator (terminals are owned by run_session_files).
//   LINKS: M-004, V-M-004, run_session_files
// END_CONTRACT: run_ripgrep_files
fn run_ripgrep_files(
    root: &Path,
    opts: &SearchOptions,
    inclusion_globs: &[String],
    exclusion_masks: &[String],
    cancel: Arc<AtomicBool>,
    cap_stop: Arc<AtomicBool>,
    delivered: Arc<AtomicUsize>,
    coordinator: &mut SearchSessionCoordinator,
) -> Result<(u32, bool), (u32, String)> {
    run_ripgrep_files_with_program(
        std::ffi::OsStr::new("rg"),
        root,
        opts,
        inclusion_globs,
        exclusion_masks,
        cancel,
        cap_stop,
        delivered,
        coordinator,
    )
}

// START_CONTRACT: run_ripgrep_files_with_program
//   PURPOSE: Run the `rg --files` listing transport with an explicitly selected executable for deterministic failure verification; the child's exit status decides normal completion (0/1) versus the single error terminal class, and its stderr feeds a bounded BLOCK-log-only capture — the #303 honesty machinery inherited in shape from the content transport, with the exit gate extended for the session-local cap stop so a cap-killed child is never a false error.
//   INPUTS: { rg_program: &OsStr - executable path/name, remaining inputs: same as run_ripgrep_files }
//   OUTPUTS: { Result<(u32, bool), (u32, String)> - per-root delivered path hits plus the cap-fired marker, or the streamed-so-far total plus a stable spawn/stream/exit-status error class }
//   SIDE_EFFECTS: Spawns the selected child process; a START_BLOCK_CANCEL_WATCHER thread kills+waits a silent child on the cancel OR cap-stop flag and reaps it exactly once; a bounded stderr capture thread drains the pipe to the BLOCK log only; emits path-only match batches through the coordinator (terminals are owned by run_session_files).
//   LINKS: run_ripgrep_files, run_session_files, compile_inclusion_masks, compile_exclusion_masks, V-M-004, C-QUICKOPEN-FILES-MODE
// END_CONTRACT: run_ripgrep_files_with_program
fn run_ripgrep_files_with_program(
    rg_program: &std::ffi::OsStr,
    root: &Path,
    opts: &SearchOptions,
    inclusion_globs: &[String],
    exclusion_masks: &[String],
    cancel: Arc<AtomicBool>,
    cap_stop: Arc<AtomicBool>,
    delivered: Arc<AtomicUsize>,
    coordinator: &mut SearchSessionCoordinator,
) -> Result<(u32, bool), (u32, String)> {
    use std::io::{BufRead, BufReader, Read};
    use std::process::{Command, Stdio};

    // START_BLOCK_BUILD_RIPGREP_FILES_COMMAND
    // C-QUICKOPEN-FILES-MODE: the files-mode transport lists paths (`rg
    // --files`) instead of running the pattern search — plain listing lines,
    // no --json. The listing passes NO --max-filesize (a content-search-time
    // filter; the walker leg's max_filesize metadata skip stays); this
    // per-transport size divergence is documented in the plan and owned by
    // C-SEARCH-ENGINE-PARITY — quickOpen never sends maxFileSize.
    let mut cmd = Command::new(rg_program);
    // The listing's shared rows resolve through resolve_engine_flags too
    // (C-SEARCH-ENGINE-PARITY); the size row stays a documented leftover —
    // no --max-filesize here (see the block comment above).
    let flags = resolve_engine_flags(opts);
    cmd.arg("--files");
    if flags.include_hidden {
        cmd.arg("--hidden");
    }
    if flags.no_ignore {
        cmd.arg("--no-ignore");
    }
    if flags.follow_symlinks {
        cmd.arg("--follow");
    }
    // Whitelist name filtering symmetric with the walker leg, in the
    // explicit shared order — inclusions first, exclusions after, last
    // match wins: each VALID inclusion glob verbatim as a --glob= argument
    // (compile_inclusion_masks), then each VALID exclusion mask as a
    // --glob=! argument (compile_exclusion_masks) so exclusions sit ON TOP
    // of inclusions. Invalid globs are explicitly ignored here (they would
    // make rg exit 2) and only force the session's partial flag.
    for glob in inclusion_globs {
        cmd.arg(format!("--glob={glob}"));
    }
    for mask in exclusion_masks {
        cmd.arg(format!("--glob=!{mask}"));
    }
    cmd.arg(root);
    cmd.stdout(Stdio::piped()).stderr(Stdio::piped());
    // END_BLOCK_BUILD_RIPGREP_FILES_COMMAND

    // START_BLOCK_SPAWN_RIPGREP_FILES_PROCESS
    safe_eprintln!(
        "[Search][rg][BLOCK_SPAWN_FILES search_id={} root={}]",
        coordinator.search_id(),
        root.display()
    );
    let mut child = cmd.spawn().map_err(|e| (0u32, format!("spawn rg: {e}")))?;
    let stdout = child.stdout.take().ok_or((0u32, "no stdout".to_string()))?;
    let mut stderr = child.stderr.take().ok_or((0u32, "no stderr".to_string()))?;
    let reader = BufReader::new(stdout);
    // END_BLOCK_SPAWN_RIPGREP_FILES_PROCESS

    // START_BLOCK_RIPGREP_FILES_STDERR_CAPTURE
    // Bounded stderr capture, the #303 shape inherited verbatim: a small
    // fixed cap so a chatty child can neither deadlock on a full pipe nor
    // allocate without bound; the drained tail reaches the BLOCK log only —
    // captured stderr text never enters the wire error field.
    const STDERR_CAPTURE_CAP_BYTES: usize = 8 * 1024;
    let stderr_handle = std::thread::spawn(move || {
        let mut captured: Vec<u8> = Vec::new();
        let mut chunk = [0u8; 1024];
        loop {
            match stderr.read(&mut chunk) {
                Ok(0) => break,
                Ok(n) => {
                    let room = STDERR_CAPTURE_CAP_BYTES.saturating_sub(captured.len());
                    if room > 0 {
                        let take = n.min(room);
                        captured.extend_from_slice(&chunk[..take]);
                    }
                    // Cap reached: keep draining to EOF without retaining.
                }
                Err(_) => break,
            }
        }
        captured
    });
    // END_BLOCK_RIPGREP_FILES_STDERR_CAPTURE

    // START_BLOCK_CANCEL_WATCHER_FILES
    // The #303 watcher shape inherited verbatim, extended for the files cap
    // (C-QUICKOPEN-FILES-MODE T-004): a quiet rg child must not hold the
    // session hostage until its next stdout line. The watcher observes BOTH
    // the shared cancel flag AND the session-local cap_stop flag, kills the
    // child on either, waits for it and exits — so a cap-killed child
    // settles as promptly as a cancelled one. It never removes registry
    // entries and never emits a terminal — SearchSessionCoordinator
    // (run_session_files) stays the single terminal owner. The watcher owns
    // the child and reaps it exactly once; the main path observes the exit
    // status through the channel below.
    let watcher_stop = Arc::new(AtomicBool::new(false));
    let (status_tx, status_rx) = std::sync::mpsc::channel();
    let watcher = {
        let cancel_for_watcher = Arc::clone(&cancel);
        let cap_for_watcher = Arc::clone(&cap_stop);
        let stop_for_watcher = Arc::clone(&watcher_stop);
        std::thread::spawn(move || {
            let mut child = child;
            if cancel_for_watcher.load(Ordering::SeqCst) || cap_for_watcher.load(Ordering::SeqCst)
            {
                let _ = child.kill();
            } else {
                loop {
                    if cancel_for_watcher.load(Ordering::SeqCst)
                        || cap_for_watcher.load(Ordering::SeqCst)
                    {
                        let _ = child.kill();
                        break;
                    }
                    if stop_for_watcher.load(Ordering::SeqCst) {
                        break;
                    }
                    std::thread::sleep(std::time::Duration::from_millis(5));
                }
            }
            // Reap exactly once here — the killed or naturally exited
            // child cannot leak as a zombie.
            let status = child.wait();
            let _ = status_tx.send(status);
        })
    };
    // END_BLOCK_CANCEL_WATCHER_FILES

    let mut total: u32 = 0;
    let mut capped = false;
    let mut batch: Vec<SearchHit> = Vec::with_capacity(DEFAULT_BATCH_SIZE);

    // The listing transport reads plain path lines — one path-only hit per
    // non-empty line, no JSON parsing, no body anywhere. The session-wide
    // FILES_RESULT_CAP stops the read loop promptly (T-004): the
    // overshooting remainder is dropped, never emitted.
    for line in reader.lines() {
        if cancel.load(Ordering::SeqCst) {
            // The watcher owns kill+wait; EOF from the kill unblocks this
            // loop even when the child never produced another line.
            break;
        }
        if cap_stop.load(Ordering::SeqCst) {
            capped = true;
            break;
        }
        let line = match line {
            Ok(l) => l,
            Err(_) => break,
        };
        if line.is_empty() {
            continue;
        }
        let seen = delivered.fetch_add(1, Ordering::SeqCst);
        if seen >= FILES_RESULT_CAP {
            capped = true;
            cap_stop.store(true, Ordering::SeqCst);
            break;
        }
        total += 1;
        batch.push(SearchHit {
            path: line,
            line: 0,
            column: 0,
            snippet: String::new(),
            truncated: false,
            match_start: None,
            match_end: None,
        });
        if batch.len() >= DEFAULT_BATCH_SIZE {
            coordinator.emit_matches(std::mem::take(&mut batch));
        }
    }

    coordinator.emit_matches(std::mem::take(&mut batch));

    // Stop the watcher cleanly when no cancel raced in, then observe the
    // reaped child's exit status through the watcher channel (the watcher
    // reaps exactly once; this side never blocks on wait() itself).
    watcher_stop.store(true, Ordering::SeqCst);
    if watcher.join().is_err() {
        return Err((0u32, "rg watcher thread failed".to_string()));
    }
    let status = match status_rx.recv() {
        Ok(Ok(status)) => status,
        Ok(Err(e)) => return Err((0u32, format!("wait rg: {e}"))),
        Err(_) => return Err((0u32, "rg watcher dropped the exit status".to_string())),
    };
    let stderr_bytes = stderr_handle.join().unwrap_or_default();
    let stderr_tail = String::from_utf8_lossy(&stderr_bytes);
    if !stderr_tail.is_empty() {
        // BLOCK log only — the captured tail never enters the wire error.
        safe_eprintln!(
            "[Search][rg][BLOCK_RIPGREP_STDERR_TAIL bytes={} tail={}]",
            stderr_tail.len(),
            stderr_tail
        );
    }

    // Exit-status honesty, the #303 shape inherited verbatim with the
    // C-QUICKOPEN-FILES-MODE T-004 gate extension: codes 0 (listings) and
    // 1 (no listings) keep completing normally; any other exit — when not
    // cancelled AND not cap-stopped — is the single error terminal class.
    // A cap-killed rg child (signal or nonzero exit) can never surface as
    // a false "rg exited with code N" terminal, while a genuine exit-2
    // without cap or cancel still errors exactly as in #303. The message
    // carries the exit code only: captured stderr text, query text, match
    // contents and user paths never enter the wire error field.
    if !cancel.load(Ordering::SeqCst) && !cap_stop.load(Ordering::SeqCst) {
        let abnormal = match status.code() {
            Some(code) if code != 0 && code != 1 => Some(format!("rg exited with code {code}")),
            Some(_) => None,
            None => Some("rg exited with code signal".to_string()),
        };
        if let Some(message) = abnormal {
            safe_eprintln!("[Search][rg][BLOCK_RIPGREP_EXIT class={message}]");
            return Err((total, message));
        }
    }
    Ok((total, capped))
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
            partial: None,
            seq: 3,
        };
        let s = serde_json::to_string(&ev).unwrap();
        assert!(s.contains("\"searchId\":\"s-1\""), "got {s}");
        assert!(s.contains("\"seq\":3"));
        // Empty hits + None error + None partial skipped per skip_serializing_if.
        assert!(!s.contains("\"hits\""));
        assert!(!s.contains("\"error\""));
        // C-SEARCH-ERROR-VISIBILITY: the additive optional partial field
        // keeps absent-field serialization on match events…
        assert!(!s.contains("\"partial\""));
        // …and pins the terminal shape: partial always present on terminals.
        let terminal = SearchEvent {
            search_id: "s-1".to_string(),
            kind: "complete".to_string(),
            hits: vec![],
            error: None,
            partial: Some(true),
            seq: 4,
        };
        let t = serde_json::to_string(&terminal).unwrap();
        assert!(t.contains("\"partial\":true"), "got {t}");
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
        assert!(result.unwrap_err().1.contains("spawn rg"));
    }

    /// Write a unix executable script into a temp dir and return its path.
    /// Deterministic injection seam for run_ripgrep_with_program — never
    /// mutates process-global PATH (Rust tests run in parallel).
    #[cfg(unix)]
    fn write_exec_script(dir: &Path, name: &str, body: &str) -> PathBuf {
        use std::os::unix::fs::PermissionsExt;
        let path = dir.join(name);
        write(&path, body).unwrap();
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755)).unwrap();
        path
    }

    // ─── C-SEARCH-ERROR-VISIBILITY: rg honesty family ──────────────────
    // Failing-first receipts (traced against the pre-change tree): the old
    // transport nulled stderr, never read the child's exit status and
    // returned Ok(total) unconditionally, so
    // every scenario below either saw a normal completion where the single
    // error terminal belongs, no partial marker at all, or a cancel that
    // only settled when the child's next stdout line arrived.

    #[test]
    #[cfg(unix)]
    fn rg_exit_two_is_single_error_terminal() {
        // (a) An injected rg program that streams one match, then exits 2:
        // exactly one error terminal with the stable "rg exited with code 2"
        // class message (captured stderr text never enters the wire), zero
        // post-terminal events, the second root never started, and the
        // partial marker set because hits were already streamed.
        let dir = TempDir::new().unwrap();
        let script = write_exec_script(
            dir.path(),
            "rg-exit-two.sh",
            "#!/bin/sh\nprintf '%s\\n' '{\"type\":\"match\",\"data\":{\"path\":{\"text\":\"streamed-hit.md\"},\"line_number\":3,\"lines\":{\"text\":\"needle here\\n\"},\"submatches\":[{\"match\":{\"text\":\"needle\"},\"start\":0,\"end\":6}]}}'\necho 'regex compile boom' >&2\nexit 2\n",
        );
        let root_a = TempDir::new().unwrap();
        write(root_a.path().join("a.md"), "needle\n").unwrap();
        let root_b = TempDir::new().unwrap();
        write(root_b.path().join("b.md"), "needle\n").unwrap();
        let (tx, rx) = mpsc::channel();
        let sink: Arc<dyn SearchSink> = Arc::new(ChannelSink { tx });
        let mut coordinator = SearchSessionCoordinator::new("rg-exit-two".to_string(), sink);
        let roots = vec![root_a.path().to_path_buf(), root_b.path().to_path_buf()];
        let opts = SearchOptions::default();
        let cancel = Arc::new(AtomicBool::new(false));
        let (total, kind) = run_session_with_program(
            script.as_os_str(),
            &roots,
            "needle",
            &opts,
            false,
            cancel,
            &mut coordinator,
        );
        assert_eq!(kind, "error");
        assert_eq!(total, 1, "the streamed hit before the failure counts");
        let events = collect_all(&rx, Duration::from_millis(400), Duration::from_millis(1500));
        assert_eq!(count_terminals(&events), 1, "exactly one terminal; got {events:?}");
        let last = events.last().unwrap();
        assert_eq!(last.kind, "error");
        assert_eq!(
            last.error.as_deref(),
            Some("rg exited with code 2"),
            "stable class message carries the exit code only (no stderr text); got {last:?}"
        );
        assert_eq!(
            last.partial,
            Some(true),
            "error terminal with already-streamed hits must carry the partial marker"
        );
        assert!(
            !events
                .iter()
                .any(|e| e.hits.iter().any(|h| h.path.ends_with("b.md"))),
            "remaining roots must not be started after the error; events={events:?}"
        );
        assert!(
            events[..events.len() - 1].iter().all(|e| e.kind == "match"),
            "zero post-terminal events — only match events precede the terminal; got {events:?}"
        );
    }

    #[test]
    #[cfg(unix)]
    fn rg_exit_codes_zero_and_one_complete_normally() {
        // (b) Exit codes 0 and 1 keep completing normally — 1 = no matches.
        // Both engines: the embedded walker completes normally for
        // matches and no-matches alike, and the injected rg program proves
        // the transport rule deterministically.
        let dir = TempDir::new().unwrap();

        // Injected rg exit 0 with a streamed match: normal completion, and
        // a complete terminal without limits is NOT partial.
        let exit_zero = write_exec_script(
            dir.path(),
            "rg-exit-zero.sh",
            "#!/bin/sh\nprintf '%s\\n' '{\"type\":\"match\",\"data\":{\"path\":{\"text\":\"hit.md\"},\"line_number\":1,\"lines\":{\"text\":\"needle\\n\"},\"submatches\":[{\"match\":{\"text\":\"needle\"},\"start\":0,\"end\":6}]}}'\nexit 0\n",
        );
        {
            let (tx, rx) = mpsc::channel();
            let sink: Arc<dyn SearchSink> = Arc::new(ChannelSink { tx });
            let mut coordinator =
                SearchSessionCoordinator::new("rg-exit-zero".to_string(), sink);
            let roots = vec![dir.path().to_path_buf()];
            let opts = SearchOptions::default();
            let cancel = Arc::new(AtomicBool::new(false));
            let (total, kind) = run_session_with_program(
                exit_zero.as_os_str(),
                &roots,
                "needle",
                &opts,
                false,
                cancel,
                &mut coordinator,
            );
            assert_eq!(kind, "complete");
            assert_eq!(total, 1);
            let events = collect_all(&rx, Duration::from_millis(400), Duration::from_millis(1500));
            let last = events.last().unwrap();
            assert_eq!(last.kind, "complete");
            assert_eq!(
                last.partial,
                Some(false),
                "complete without size limit or masks is not partial"
            );
        }

        // Injected rg exit 1 = no matches: still normal completion.
        let exit_one = write_exec_script(dir.path(), "rg-exit-one.sh", "#!/bin/sh\nexit 1\n");
        {
            let (tx, rx) = mpsc::channel();
            let sink: Arc<dyn SearchSink> = Arc::new(ChannelSink { tx });
            let mut coordinator =
                SearchSessionCoordinator::new("rg-exit-one".to_string(), sink);
            let roots = vec![dir.path().to_path_buf()];
            let opts = SearchOptions::default();
            let cancel = Arc::new(AtomicBool::new(false));
            let (total, kind) = run_session_with_program(
                exit_one.as_os_str(),
                &roots,
                "needle",
                &opts,
                false,
                cancel,
                &mut coordinator,
            );
            assert_eq!(kind, "complete", "exit 1 (no matches) stays normal");
            assert_eq!(total, 0);
            let events = collect_all(&rx, Duration::from_millis(400), Duration::from_millis(1500));
            assert_eq!(events.last().unwrap().kind, "complete");
        }

        // Walker parity: no matches → normal complete.
        {
            let empty = TempDir::new().unwrap();
            let (total, kind, rx) = run_session_one_root(
                "walker-no-match",
                empty.path(),
                "needle",
                &SearchOptions::default(),
                Arc::new(AtomicBool::new(false)),
            );
            assert_eq!(total, 0);
            assert_eq!(kind, "complete");
            let events = collect_all(&rx, Duration::from_millis(400), Duration::from_millis(1500));
            assert_eq!(events.last().unwrap().kind, "complete");
        }

        // Native rg parity (availability-guarded): no matches → rg exit 1 →
        // normal completion.
        if rg_available() {
            let (tx, rx) = mpsc::channel();
            let sink: Arc<dyn SearchSink> = Arc::new(ChannelSink { tx });
            let mut coordinator =
                SearchSessionCoordinator::new("rg-native-exit-one".to_string(), sink);
            let roots = vec![dir.path().to_path_buf()];
            let opts = SearchOptions::default();
            let cancel = Arc::new(AtomicBool::new(false));
            let (total, kind) = run_session(
                &roots,
                "zz-no-such-needle-zz",
                &opts,
                false,
                cancel,
                &mut coordinator,
            );
            assert_eq!(kind, "complete", "native rg exit 1 stays normal");
            assert_eq!(total, 0);
            let events = collect_all(&rx, Duration::from_millis(400), Duration::from_millis(1500));
            assert_eq!(events.last().unwrap().kind, "complete");
        }
    }

    #[test]
    fn exclusions_applied_symmetrically() {
        // (c) One shared mask semantics: a masked file is absent while an
        // unmasked sibling with the same needle is present — in the
        // embedded walker and, availability-guarded, in rg.
        let dir = TempDir::new().unwrap();
        write(dir.path().join("secret.md"), "needle\n").unwrap();
        write(dir.path().join("public.md"), "needle\n").unwrap();
        let opts = SearchOptions {
            exclusions: Some(vec!["secret.md".to_string()]),
            ..Default::default()
        };

        // Embedded walker leg: the compiled mask filters before opening.
        {
            let (total, kind, rx) = run_session_one_root(
                "s-excl-walker",
                dir.path(),
                "needle",
                &opts,
                Arc::new(AtomicBool::new(false)),
            );
            assert_eq!(total, 1, "only the unmasked sibling matches");
            assert_eq!(kind, "complete");
            let events = collect_all(&rx, Duration::from_millis(400), Duration::from_millis(1500));
            assert!(
                !events
                    .iter()
                    .any(|e| e.hits.iter().any(|h| h.path.ends_with("secret.md"))),
                "masked file must be absent; events={events:?}"
            );
            assert!(
                events
                    .iter()
                    .any(|e| e.hits.iter().any(|h| h.path.ends_with("public.md"))),
                "unmasked sibling must be present; events={events:?}"
            );
            let terminal = events.last().unwrap();
            assert_eq!(terminal.kind, "complete");
            assert_eq!(
                terminal.partial,
                Some(true),
                "a complete terminal under an active mask must be partial"
            );
        }

        // rg leg (availability-guarded): --glob=!secret.md symmetric.
        if rg_available() {
            let (tx, rx) = mpsc::channel();
            let sink: Arc<dyn SearchSink> = Arc::new(ChannelSink { tx });
            let mut coordinator = SearchSessionCoordinator::new("s-excl-rg".to_string(), sink);
            let roots = vec![dir.path().to_path_buf()];
            let cancel = Arc::new(AtomicBool::new(false));
            let (total, kind) =
                run_session(&roots, "needle", &opts, false, cancel, &mut coordinator);
            assert_eq!(total, 1, "rg applies the same mask symmetrically");
            assert_eq!(kind, "complete");
            let events = collect_all(&rx, Duration::from_millis(400), Duration::from_millis(1500));
            assert!(
                !events
                    .iter()
                    .any(|e| e.hits.iter().any(|h| h.path.ends_with("secret.md"))),
                "rg must exclude the masked file too; events={events:?}"
            );
            assert!(
                events
                    .iter()
                    .any(|e| e.hits.iter().any(|h| h.path.ends_with("public.md"))),
                "rg must keep the unmasked sibling; events={events:?}"
            );
            assert_eq!(events.last().unwrap().partial, Some(true));
        }
    }

    #[test]
    fn invalid_exclusion_mask_is_ignored_and_forces_partial() {
        // (d) An invalid mask (unclosed `[` — a glob compile error) is
        // explicitly ignored per this plan's recorded choice: never passed
        // to rg (which would exit 2 on a bad glob), never used by the
        // walker — and it forces the terminal's partial flag so
        // completeness is never silently claimed.
        let dir = TempDir::new().unwrap();
        write(dir.path().join("a.md"), "needle\n").unwrap();
        let opts = SearchOptions {
            exclusions: Some(vec!["[".to_string()]),
            ..Default::default()
        };

        // Walker leg: the invalid mask filters nothing.
        {
            let (total, kind, rx) = run_session_one_root(
                "s-invalid-mask-walker",
                dir.path(),
                "needle",
                &opts,
                Arc::new(AtomicBool::new(false)),
            );
            assert_eq!(total, 1, "invalid mask must not filter the walker");
            assert_eq!(kind, "complete");
            let events = collect_all(&rx, Duration::from_millis(400), Duration::from_millis(1500));
            assert_eq!(events.last().unwrap().kind, "complete");
            assert_eq!(
                events.last().unwrap().partial,
                Some(true),
                "invalid mask forces the honest partial flag"
            );
        }

        // rg leg (availability-guarded): if "[" were ever passed as
        // --glob=![, rg would exit 2 and the session would end in the
        // error terminal — normal completion proves the invalid mask was
        // ignored on the rg side as well.
        if rg_available() {
            let (tx, rx) = mpsc::channel();
            let sink: Arc<dyn SearchSink> = Arc::new(ChannelSink { tx });
            let mut coordinator =
                SearchSessionCoordinator::new("s-invalid-mask-rg".to_string(), sink);
            let roots = vec![dir.path().to_path_buf()];
            let cancel = Arc::new(AtomicBool::new(false));
            let (total, kind) =
                run_session(&roots, "needle", &opts, false, cancel, &mut coordinator);
            assert_eq!(kind, "complete", "invalid mask must never reach rg");
            assert_eq!(total, 1);
            let events = collect_all(&rx, Duration::from_millis(400), Duration::from_millis(1500));
            assert_eq!(events.last().unwrap().partial, Some(true));
        }
    }

    #[test]
    fn max_file_size_suppressing_candidates_marks_terminal_partial() {
        // (e) A max_file_size that suppresses candidates (big.md skipped by
        // the walker ceiling) marks the complete terminal partial —
        // completeness is never silently claimed.
        let dir = TempDir::new().unwrap();
        let big = "needle\n".repeat(20_000);
        write(dir.path().join("big.md"), big).unwrap();
        write(dir.path().join("small.md"), "needle\n").unwrap();
        let opts = SearchOptions {
            max_file_size: Some(1024),
            ..Default::default()
        };
        let (total, kind, rx) = run_session_one_root(
            "s-partial-size",
            dir.path(),
            "needle",
            &opts,
            Arc::new(AtomicBool::new(false)),
        );
        assert_eq!(total, 1, "only small.md is searched under the ceiling");
        assert_eq!(kind, "complete");
        let events = collect_all(&rx, Duration::from_millis(400), Duration::from_millis(1500));
        assert_eq!(events.last().unwrap().kind, "complete");
        assert_eq!(
            events.last().unwrap().partial,
            Some(true),
            "a size-limit-suppressed candidate set must be marked partial"
        );
    }

    #[test]
    #[cfg(unix)]
    fn silent_child_cancel_arrives_without_a_line() {
        // T-003: a deterministic silent child (no stdout at all, sleeps
        // well past the deadline) through the run_ripgrep_with_program
        // program-injection seam — unix-gated, no PATH mutation anywhere.
        // The single cancelled terminal arrives within the test deadline
        // without any child output line; the child is killed and reaped
        // (run_ripgrep_with_program only returns after the watcher joined,
        // and the watcher exits only after kill + wait).
        let dir = TempDir::new().unwrap();
        let script = write_exec_script(
            dir.path(),
            "silent-rg.sh",
            "#!/bin/sh\n# no stdout at all; exec so kill hits the sleeper itself (a forked\n# grandchild would hold the stdout pipe open for the full sleep)\nexec sleep 30\n",
        );
        let root = TempDir::new().unwrap();
        write(root.path().join("a.md"), "needle\n").unwrap();
        let (tx, rx) = mpsc::channel();
        let sink: Arc<dyn SearchSink> = Arc::new(ChannelSink { tx });
        let mut coordinator = SearchSessionCoordinator::new("rg-silent".to_string(), sink);
        let cancel = Arc::new(AtomicBool::new(false));
        let cancel_for_thread = cancel.clone();
        let roots = vec![root.path().to_path_buf()];
        let opts = SearchOptions::default();
        let handle = std::thread::spawn(move || {
            run_session_with_program(
                script.as_os_str(),
                &roots,
                "needle",
                &opts,
                false,
                cancel_for_thread,
                &mut coordinator,
            )
        });
        // Let the silent child spawn and block with no output.
        std::thread::sleep(Duration::from_millis(200));
        let started = std::time::Instant::now();
        cancel.store(true, Ordering::SeqCst);
        let (total, kind) = handle.join().unwrap();
        let elapsed = started.elapsed();
        assert!(
            elapsed < Duration::from_secs(10),
            "cancel must settle a silent child promptly (watcher kill+wait); took {elapsed:?}"
        );
        assert_eq!(kind, "cancelled");
        assert_eq!(total, 0, "a silent child streams no hits");
        let events = collect_all(&rx, Duration::from_millis(400), Duration::from_millis(1500));
        assert_eq!(count_terminals(&events), 1, "exactly one terminal; got {events:?}");
        assert_eq!(events.last().unwrap().kind, "cancelled");
        assert!(
            !events.iter().any(|e| e.kind == "match"),
            "no child output line ever arrived; events={events:?}"
        );
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
        assert!(coordinator.finalize(SearchTerminal::Complete, None, false));
        assert!(!coordinator.finalize(SearchTerminal::Cancelled, None, true));
        assert!(!coordinator.emit_matches(vec![SearchHit {
            path: "x.md".to_string(),
            line: 1,
            column: 1,
            snippet: "needle".to_string(),
            truncated: false,
            match_start: None,
            match_end: None,
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

    // ─── C-SEARCH-RESULT-CONTRACT: honest match bounds ─────────────────
    // Failing-first receipts (traced against the pre-change tree): SearchHit
    // carried no match-bound fields at all, so every present-bounds
    // assertion below is red before the additive fields land. The
    // absence assertions are control pins: they hold trivially while the
    // fields do not exist and keep the honest-or-absent rule pinned once
    // they do.
    //
    // Units convention (this change's documented decision): match bounds
    // are UTF-16 code-unit offsets (0-based start, exclusive end)
    // computed at the backend against the DELIVERED snippet text — the
    // exact index space of the renderer's String.substring, exact for
    // BMP and astral content alike. Both engines' raw spans are byte
    // offsets (regex crate Match spans, rg --json submatch start/end),
    // so the conversion runs through one shared helper; Unicode
    // scalar-value counts are rejected because they diverge from JS
    // substring indices on astral-plane characters.

    /// JS-substring oracle: slice `snippet` the way the renderer's
    /// substring(start, end) slices UTF-16 code units.
    fn utf16_substring(snippet: &str, start: u64, end: u64) -> Option<String> {
        let units: Vec<u16> = snippet.encode_utf16().collect();
        let (s, e) = (start as usize, end as usize);
        if s > e || e > units.len() {
            return None;
        }
        String::from_utf16(&units[s..e]).ok()
    }

    /// First delivered hit for a file/line pair as its wire form.
    fn first_hit_value(
        events: &[SearchEvent],
        file_suffix: &str,
        line: u32,
    ) -> serde_json::Value {
        for ev in events {
            if ev.kind != "match" {
                continue;
            }
            for hit in &ev.hits {
                if hit.path.ends_with(file_suffix) && hit.line == line {
                    return serde_json::to_value(hit).expect("hit serializes");
                }
            }
        }
        panic!("no hit for {file_suffix}:{line}; events={events:?}");
    }

    /// All match-batch hits of one session as (file, line, start, end,
    /// snippet) wire tuples, ordered by (file, line) for engine parity.
    fn wire_bounds_by_line(rx: &mpsc::Receiver<SearchEvent>) -> Vec<(String, u32, u64, u64, String)> {
        let events = collect_until_terminal(rx, Duration::from_secs(2));
        let mut out = Vec::new();
        for ev in &events {
            if ev.kind != "match" {
                continue;
            }
            for hit in &ev.hits {
                let v = serde_json::to_value(hit).expect("hit serializes");
                let file = hit
                    .path
                    .rsplit(|c| c == '/' || c == '\\')
                    .next()
                    .unwrap_or("")
                    .to_string();
                let start = v.get("matchStart").and_then(|x| x.as_u64()).unwrap_or_else(|| {
                    panic!(
                        "matchStart absent for {file}:{} — every fully-delivered match must carry honest bounds; hit={v}",
                        hit.line
                    )
                });
                let end = v.get("matchEnd").and_then(|x| x.as_u64()).unwrap_or_else(|| {
                    panic!("matchEnd absent for {file}:{}; hit={v}", hit.line)
                });
                let snippet = v
                    .get("snippet")
                    .and_then(|x| x.as_str())
                    .unwrap_or_default()
                    .to_string();
                out.push((file, hit.line, start, end, snippet));
            }
        }
        out.sort_by(|a, b| (&a.0, a.1).cmp(&(&b.0, b.1)));
        out
    }

    #[test]
    fn search_hit_bounds_wire_form() {
        // (a) A hit with known bounds serializes BOTH camelCase wire
        // fields; the snake_case rust names never leak into the wire.
        let dir = TempDir::new().unwrap();
        write(dir.path().join("ascii.md"), "alpha needle beta\n").unwrap();
        let cancel = Arc::new(AtomicBool::new(false));
        let opts = SearchOptions::default();
        let (_total, _kind, rx) =
            run_session_one_root("s-bounds-wire", dir.path(), "needle", &opts, cancel);
        let events = collect_until_terminal(&rx, Duration::from_secs(1));
        let v = first_hit_value(&events, "ascii.md", 1);
        let start = v
            .get("matchStart")
            .and_then(|x| x.as_u64())
            .expect("matchStart wire field must be present with honest bounds");
        let end = v
            .get("matchEnd")
            .and_then(|x| x.as_u64())
            .expect("matchEnd wire field must be present with honest bounds");
        let raw = serde_json::to_string(&v).unwrap();
        assert!(
            !raw.contains("\"match_start\"") && !raw.contains("\"match_end\""),
            "snake_case field names must not leak into the wire; got {raw}"
        );
        // Honest bounds: 0-based UTF-16 start, exclusive end, against the
        // delivered snippet — the renderer's substring(start, end) must
        // recover the matched text exactly.
        let snippet = v.get("snippet").and_then(|x| x.as_str()).unwrap_or_default();
        assert_eq!(
            start, 6,
            "'needle' starts at UTF-16 unit 6 in 'alpha needle beta'"
        );
        assert_eq!(end, 12, "exclusive end is 6 + 6 units");
        assert_eq!(
            utf16_substring(snippet, start, end).as_deref(),
            Some("needle"),
            "substring(start, end) of the delivered snippet must equal the matched text"
        );
    }

    #[test]
    fn bounds_parity_across_engines() {
        // (b)+(c) One fixture searched by BOTH engines yields identical
        // bounds semantics: same 0-based start, same exclusive end, same
        // unit — UTF-16 code units over the delivered snippet. The
        // multi-byte fixture is the delivery-baseline probe: byte spans
        // and UTF-16 units diverge on Cyrillic prefixes, so parity plus
        // substring equality proves the shared conversion (never a
        // known-false byte span).
        let dir = TempDir::new().unwrap();
        write(
            dir.path().join("ascii.md"),
            "alpha needle beta\nplain line\nneedle again\n",
        )
        .unwrap();
        write(
            dir.path().join("multi.md"),
            "Слово needle слово\nиголка needle хвост\n",
        )
        .unwrap();
        let opts = SearchOptions::default();

        // Walker leg (in-process; the App Store / missing-rg path).
        let cancel = Arc::new(AtomicBool::new(false));
        let (_total, _kind, rx) =
            run_session_one_root("s-parity-walker", dir.path(), "needle", &opts, cancel);
        let walker_hits = wire_bounds_by_line(&rx);
        assert_eq!(walker_hits.len(), 4, "two ASCII + two multi-byte matches");

        // rg leg under its existing availability guard.
        if rg_available() {
            let (tx, rx) = mpsc::channel();
            let sink: Arc<dyn SearchSink> = Arc::new(ChannelSink { tx });
            let mut coordinator = SearchSessionCoordinator::new("s-parity-rg".to_string(), sink);
            let roots = vec![dir.path().to_path_buf()];
            let cancel = Arc::new(AtomicBool::new(false));
            let (total, kind) =
                run_session(&roots, "needle", &opts, false, cancel, &mut coordinator);
            assert_eq!(kind, "complete");
            assert_eq!(total, 4);
            let rg_hits = wire_bounds_by_line(&rx);
            assert_eq!(rg_hits.len(), 4);
            for (w, r) in walker_hits.iter().zip(rg_hits.iter()) {
                assert_eq!(w.0, r.0, "parity covers the same file");
                assert_eq!(w.1, r.1, "parity covers the same line");
                assert_eq!(
                    (w.2, w.3),
                    (r.2, r.3),
                    "identical bounds semantics for the same match on {}:{}",
                    w.0,
                    w.1
                );
                assert_eq!(w.4, r.4, "same delivered snippet on {}:{}", w.0, w.1);
            }
        }

        // Delivery-baseline units probe on the walker leg: ASCII lines —
        // byte offset and UTF-16 unit coincide; multi-byte lines — they
        // diverge and the delivered bounds MUST be UTF-16 units.
        let by_key = |file: &str, line: u32| -> (u64, u64, String) {
            walker_hits
                .iter()
                .find(|h| h.0 == file && h.1 == line)
                .map(|h| (h.2, h.3, h.4.clone()))
                .unwrap_or_else(|| panic!("no walker hit for {file}:{line}"))
        };
        let (s, e, snip) = by_key("ascii.md", 1);
        assert_eq!((s, e), (6, 12));
        assert_eq!(utf16_substring(&snip, s, e).as_deref(), Some("needle"));
        let (s, e, snip) = by_key("ascii.md", 3);
        assert_eq!((s, e), (0, 6));
        assert_eq!(utf16_substring(&snip, s, e).as_deref(), Some("needle"));
        // "Слово needle слово": byte start 11, UTF-16 start 6.
        let (s, e, snip) = by_key("multi.md", 1);
        assert_ne!(
            s, 11,
            "probe guard: the multi-byte prefix really diverges byte-vs-unit"
        );
        assert_eq!(
            s, 6,
            "UTF-16 code-unit start on the multi-byte line (a byte span would be a known-false highlight)"
        );
        assert_eq!(e, 12);
        assert_eq!(utf16_substring(&snip, s, e).as_deref(), Some("needle"));
        // "иголка needle хвост": byte start 13, UTF-16 start 7.
        let (s, e, snip) = by_key("multi.md", 2);
        assert_eq!((s, e), (7, 13));
        assert_eq!(utf16_substring(&snip, s, e).as_deref(), Some("needle"));
    }

    #[test]
    fn match_beyond_truncated_snippet_yields_absent_bounds() {
        // (d) Honest-or-absent: the walker's byte-truncated snippet (1 MB
        // cap + ellipsis marker) does not fully contain the match, so the
        // hit must be delivered WITHOUT either bound field — never a
        // partial or fabricated span — and the batch still delivers the
        // hit itself.
        let dir = TempDir::new().unwrap();
        let mut line = "x".repeat(MAX_LINE_BYTES + 10);
        line.push_str("needle");
        line.push_str(&"y".repeat(50));
        write(dir.path().join("big.md"), line + "\n").unwrap();
        let cancel = Arc::new(AtomicBool::new(false));
        let opts = SearchOptions::default();
        let (total, kind, rx) =
            run_session_one_root("s-bounds-truncated", dir.path(), "needle", &opts, cancel);
        assert_eq!(kind, "complete");
        assert_eq!(total, 1, "the hit itself is still delivered");
        let events = collect_until_terminal(&rx, Duration::from_secs(2));
        let v = first_hit_value(&events, "big.md", 1);
        assert_eq!(
            v.get("truncated").and_then(|x| x.as_bool()),
            Some(true),
            "fixture sanity: the snippet really is byte-truncated"
        );
        let raw = serde_json::to_string(&v).unwrap();
        assert!(
            !raw.contains("\"matchStart\"") && !raw.contains("\"matchEnd\""),
            "bounds must stay wire-absent when the match is not fully inside the delivered snippet; got {raw}"
        );
    }

    #[test]
    #[cfg(unix)]
    fn rg_bounds_absent_when_submatch_exceeds_delivered_line() {
        // Defensive rg-leg symmetry (deterministic injection, no native rg
        // needed): a submatch span beyond the delivered line text must
        // stay wire-absent — honest-or-absent, never a partial span — and
        // the hit itself is still delivered.
        let dir = TempDir::new().unwrap();
        let script = write_exec_script(
            dir.path(),
            "rg-bounds-overflow.sh",
            "#!/bin/sh\nprintf '%s\\n' '{\"type\":\"match\",\"data\":{\"path\":{\"text\":\"hit.md\"},\"line_number\":1,\"lines\":{\"text\":\"needle here\\n\"},\"submatches\":[{\"match\":{\"text\":\"needle\"},\"start\":0,\"end\":999999}]}}'\nexit 0\n",
        );
        let (tx, rx) = mpsc::channel();
        let sink: Arc<dyn SearchSink> = Arc::new(ChannelSink { tx });
        let mut coordinator =
            SearchSessionCoordinator::new("rg-bounds-overflow".to_string(), sink);
        let cancel = Arc::new(AtomicBool::new(false));
        let opts = SearchOptions::default();
        let total = run_ripgrep_with_program(
            script.as_os_str(),
            dir.path(),
            "needle",
            &opts,
            cancel,
            &mut coordinator,
        )
        .expect("the injected rg completes normally");
        assert_eq!(total, 1, "the hit itself is still delivered");
        let events = collect_until_terminal(&rx, Duration::from_millis(500));
        let v = first_hit_value(&events, "hit.md", 1);
        let raw = serde_json::to_string(&v).unwrap();
        assert!(
            !raw.contains("\"matchStart\"") && !raw.contains("\"matchEnd\""),
            "out-of-line submatch spans must stay wire-absent; got {raw}"
        );
    }

    // ─── C-QUICKOPEN-FILES-MODE T-001: failing-first receipts ──────────
    // (a) Behavioral receipts on today's surface: quickOpen's real call
    // shape is mode "files" with the empty pattern, but today's
    // mt_search_spawn discards the discriminator, so the CONTENT session
    // runs. The receipt replays that call shape through the content
    // run_session (the path mode "files" takes today) and documents the
    // defects this change fixes. The content path stays byte-for-byte
    // untouched, so this receipt stays green before and after the
    // files-mode session lands — it pins the reason the dispatch exists.
    //
    // (b) The permanent named files-mode pins below (red-by-absence in
    // this commit: they target the intended session surface and do not
    // compile until T-002..T-004 land) become the change's permanent
    // green backend suite.

    /// Delivered hit paths across a full session trace, in arrival order.
    fn delivered_paths(events: &[SearchEvent]) -> Vec<String> {
        events
            .iter()
            .filter(|e| e.kind == "match")
            .flat_map(|e| e.hits.iter().map(|h| h.path.clone()))
            .collect()
    }

    #[test]
    #[allow(dead_code)]
    fn files_fixture_through_content_run_session_receipts() {
        // Receipt fixture: a matching-name file, the body-bait decoy (name
        // misses the inclusion globs, body carries the query text) and —
        // unix-gated — the unreadable permission decoy (name matches the
        // inclusion globs). Non-root assumption documented in the plan:
        // a root process bypasses permission checks, so the decoy proof
        // requires tests not running as root; the red-first property on
        // any identity rests on the body-bait and unbounded-count
        // receipts, which are platform-independent.
        let dir = TempDir::new().unwrap();
        write(dir.path().join("note-a.md"), "needle\n").unwrap();
        write(dir.path().join("bait.txt"), "needle query text\n").unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let locked = dir.path().join("locked.md");
            write(&locked, "needle\n").unwrap();
            std::fs::set_permissions(&locked, std::fs::Permissions::from_mode(0o000)).unwrap();
        }
        let opts = SearchOptions {
            inclusions: Some(vec!["*.md".to_string()]),
            ..Default::default()
        };
        let (total, kind, rx) =
            run_session_one_root("s-receipt", dir.path(), "", &opts, Arc::new(AtomicBool::new(false)));
        let events = collect_all(&rx, Duration::from_millis(400), Duration::from_millis(1500));
        assert_eq!(kind, "complete");
        assert!(total >= 1);
        // Receipt 1: the body-bait IS delivered with a body-derived
        // snippet and a non-zero line — the empty content pattern matches
        // inside every read body regardless of the file name, so a name
        // filter computed by quickOpen never protects it.
        let bait = events
            .iter()
            .filter(|e| e.kind == "match")
            .flat_map(|e| e.hits.iter())
            .find(|h| h.path.ends_with("bait.txt"))
            .expect("receipt: today's content spawn delivers the body-bait decoy");
        assert!(bait.line >= 1, "body-derived line number; got {bait:?}");
        assert!(!bait.snippet.is_empty(), "body-derived snippet; got {bait:?}");
        // Receipt 2: the unreadable permission decoy is silently skipped —
        // its open fails and the content walker continues past it.
        #[cfg(unix)]
        assert!(
            !events
                .iter()
                .any(|e| e.hits.iter().any(|h| h.path.ends_with("locked.md"))),
            "receipt: today's content spawn cannot deliver the unreadable decoy (open fails, entry skipped)"
        );
        // Receipt 3: the inclusions option changes nothing — the same
        // fixture searched without them delivers the same name set.
        let mut with_names = delivered_paths(&events);
        with_names.sort();
        let (_t2, _k2, rx2) = run_session_one_root(
            "s-receipt-no-inc",
            dir.path(),
            "",
            &SearchOptions::default(),
            Arc::new(AtomicBool::new(false)),
        );
        let events2 = collect_all(&rx2, Duration::from_millis(400), Duration::from_millis(1500));
        let mut without_names = delivered_paths(&events2);
        without_names.sort();
        assert_eq!(
            with_names, without_names,
            "receipt: the inclusions option is dead on today's content path"
        );
        // Receipt 4: the delivered count is unbounded past 30 — a 35-file
        // fixture delivers every path today.
        let dir35 = TempDir::new().unwrap();
        for i in 0..35 {
            write(dir35.path().join(format!("many-{i:03}.txt")), "needle\n").unwrap();
        }
        let (_t35, kind35, rx35) = run_session_one_root(
            "s-receipt-unbounded",
            dir35.path(),
            "",
            &SearchOptions::default(),
            Arc::new(AtomicBool::new(false)),
        );
        assert_eq!(kind35, "complete");
        let events35 = collect_all(&rx35, Duration::from_millis(400), Duration::from_millis(1500));
        let mut names35 = delivered_paths(&events35);
        names35.sort();
        names35.dedup();
        assert_eq!(
            names35.len(),
            35,
            "receipt: today's session delivers all 35 paths — unbounded past 30"
        );
    }

    /// Files-mode session harness: single root with a channel sink,
    /// mirroring run_session_one_root over the intended files-mode
    /// session surface (C-QUICKOPEN-FILES-MODE T-001 red-by-absence:
    /// compiles once the files-mode session lands in T-002).
    fn run_session_files_one_root(
        search_id: &str,
        root: &Path,
        opts: &SearchOptions,
        cancel: Arc<AtomicBool>,
    ) -> (u32, &'static str, mpsc::Receiver<SearchEvent>) {
        let (tx, rx) = mpsc::channel();
        let sink: Arc<dyn SearchSink> = Arc::new(ChannelSink { tx });
        let mut coordinator = SearchSessionCoordinator::new(search_id.to_string(), sink);
        let roots = vec![root.to_path_buf()];
        let (total, kind) = run_session_files(&roots, opts, true, cancel, &mut coordinator);
        (total, kind, rx)
    }

    #[test]
    fn files_mode_walker_lists_paths_without_reading_bodies() {
        // Instrumented fixture (T-001): the files-mode session must make
        // the name-only decision — no File::open, no line reading, no
        // matcher anywhere on the walker path leg.
        let dir = TempDir::new().unwrap();
        write(dir.path().join("note-a.md"), "needle\n").unwrap();
        std::fs::create_dir_all(dir.path().join("nested")).unwrap();
        write(dir.path().join("nested/note-b.md"), "needle\n").unwrap();
        // Body-bait decoy: the name misses the inclusion globs while the
        // body carries the query text — a body-reading or name-unfiltered
        // leg would deliver it.
        write(dir.path().join("bait.txt"), "needle query text\n").unwrap();
        // Unreadable permission decoy: the name matches the inclusion
        // globs; a body read would fail its open and skip it exactly as
        // today's content spawn does. Non-root assumption documented in
        // the plan and the spec; the red-first property on any identity
        // rests on the body-bait absence and the path-only shape
        // assertions, which are platform-independent.
        #[cfg(unix)]
        let locked = dir.path().join("locked.md");
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            write(&locked, "needle\n").unwrap();
            std::fs::set_permissions(&locked, std::fs::Permissions::from_mode(0o000)).unwrap();
        }
        let opts = SearchOptions {
            inclusions: Some(vec!["*.md".to_string()]),
            ..Default::default()
        };
        let (total, kind, rx) = run_session_files_one_root(
            "s-files-walker",
            dir.path(),
            &opts,
            Arc::new(AtomicBool::new(false)),
        );
        assert_eq!(kind, "complete");
        let events = collect_all(&rx, Duration::from_millis(400), Duration::from_millis(1500));
        let paths = delivered_paths(&events);
        // The unreadable decoy IS delivered: the name-only decision never
        // opened it (a body read would fail its open and skip it).
        #[cfg(unix)]
        assert!(
            paths.iter().any(|p| p.ends_with("locked.md")),
            "the unreadable permission decoy must be delivered without a body read; paths={paths:?}"
        );
        // The body-bait is NEVER delivered.
        assert!(
            !paths.iter().any(|p| p.ends_with("bait.txt")),
            "a file whose name misses the inclusion globs must never be delivered, even with matching body text; paths={paths:?}"
        );
        // The nested bare-glob file is delivered (basename at any depth).
        assert!(
            paths.iter().any(|p| p.ends_with("note-b.md")),
            "a bare inclusion glob matches the basename at any depth; paths={paths:?}"
        );
        assert!(
            paths.iter().any(|p| p.ends_with("note-a.md")),
            "the plain matching-name file is delivered; paths={paths:?}"
        );
        assert_eq!(
            total,
            paths.len() as u32,
            "the files-mode total counts delivered path hits only"
        );
        // Every delivered hit is pinned path-only through its exact wire
        // form (serde_json serialization — the wire shape is exact).
        for ev in &events {
            assert!(matches!(ev.kind.as_str(), "match" | "complete" | "cancelled" | "error"));
            for h in &ev.hits {
                assert_eq!(h.line, 0, "path-only hit carries line 0; got {h:?}");
                assert_eq!(h.column, 0, "path-only hit carries column 0; got {h:?}");
                assert_eq!(h.snippet, "", "path-only hit carries the empty snippet");
                assert!(!h.truncated, "path-only hit is never truncated");
                let raw = serde_json::to_string(h).unwrap();
                assert!(
                    !raw.contains("\"matchStart\"") && !raw.contains("\"matchEnd\""),
                    "path-only hit bounds stay wire-absent; got {raw}"
                );
                assert!(
                    raw.contains("\"snippet\":\"\""),
                    "the empty snippet serializes as the empty string; got {raw}"
                );
            }
        }
        assert_eq!(
            events.last().unwrap().partial,
            Some(false),
            "valid inclusions alone complete with the honest non-partial terminal"
        );
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&locked, std::fs::Permissions::from_mode(0o644)).unwrap();
        }
    }

    #[test]
    fn files_mode_inclusions_filter_both_legs() {
        // Whitelist symmetry on one fixture: inclusions whitelist the name
        // domain on both legs, exclusions sit ON TOP of inclusions (last
        // match wins), an invalid inclusion glob is ignored by both legs
        // and only forces the honest partial flag.
        let dir = TempDir::new().unwrap();
        write(dir.path().join("keep.md"), "x\n").unwrap();
        write(dir.path().join("masked.md"), "x\n").unwrap();
        write(dir.path().join("plain.txt"), "x\n").unwrap();

        // Inclusions + exclusions: a file matching both is absent while
        // the included unmasked sibling is present.
        let opts = SearchOptions {
            inclusions: Some(vec!["*.md".to_string()]),
            exclusions: Some(vec!["masked.md".to_string()]),
            ..Default::default()
        };

        // Walker leg (always runs — the App Store / missing-rg path).
        {
            let (total, kind, rx) = run_session_files_one_root(
                "s-files-inc-walker",
                dir.path(),
                &opts,
                Arc::new(AtomicBool::new(false)),
            );
            assert_eq!(kind, "complete");
            assert_eq!(total, 1, "only the included, unmasked file is delivered");
            let events = collect_all(&rx, Duration::from_millis(400), Duration::from_millis(1500));
            let paths = delivered_paths(&events);
            assert!(
                paths.iter().any(|p| p.ends_with("keep.md")),
                "the included unmasked sibling is present; paths={paths:?}"
            );
            assert!(
                !paths.iter().any(|p| p.ends_with("masked.md")),
                "exclusions sit on top of inclusions (last match wins); paths={paths:?}"
            );
            assert!(
                !paths.iter().any(|p| p.ends_with("plain.txt")),
                "inclusions whitelist the name domain; paths={paths:?}"
            );
            assert_eq!(
                events.last().unwrap().partial,
                Some(true),
                "an active exclusion mask keeps forcing the honest partial flag"
            );
        }

        // Invalid inclusion glob: ignored by the walker (filters nothing
        // beyond the valid globs) and forces the honest partial flag.
        {
            let opts_invalid = SearchOptions {
                inclusions: Some(vec!["*.md".to_string(), "[".to_string()]),
                ..Default::default()
            };
            let (total, kind, rx) = run_session_files_one_root(
                "s-files-inc-invalid",
                dir.path(),
                &opts_invalid,
                Arc::new(AtomicBool::new(false)),
            );
            assert_eq!(kind, "complete", "an invalid inclusion glob never fails the session");
            assert_eq!(
                total, 2,
                "the invalid glob is ignored; the valid inclusion still filters"
            );
            let events = collect_all(&rx, Duration::from_millis(400), Duration::from_millis(1500));
            assert_eq!(
                events.last().unwrap().partial,
                Some(true),
                "an ignored invalid inclusion glob forces the honest partial flag"
            );
        }

        // Valid inclusions alone complete with partial = false.
        {
            let opts_only = SearchOptions {
                inclusions: Some(vec!["*.md".to_string()]),
                ..Default::default()
            };
            let (_total, kind, rx) = run_session_files_one_root(
                "s-files-inc-only",
                dir.path(),
                &opts_only,
                Arc::new(AtomicBool::new(false)),
            );
            assert_eq!(kind, "complete");
            let events = collect_all(&rx, Duration::from_millis(400), Duration::from_millis(1500));
            assert_eq!(
                events.last().unwrap().partial,
                Some(false),
                "valid inclusions never force partial by themselves"
            );
        }

        // rg leg (availability-guarded, canon skip marker): the same
        // whitelist semantics through the `rg --files` transport.
        if rg_available() {
            let (tx, rx) = mpsc::channel();
            let sink: Arc<dyn SearchSink> = Arc::new(ChannelSink { tx });
            let mut coordinator =
                SearchSessionCoordinator::new("s-files-inc-rg".to_string(), sink);
            let roots = vec![dir.path().to_path_buf()];
            let cancel = Arc::new(AtomicBool::new(false));
            let (total, kind) =
                run_session_files(&roots, &opts, false, cancel, &mut coordinator);
            assert_eq!(kind, "complete");
            assert_eq!(total, 1, "rg applies the same whitelist symmetrically");
            let events = collect_all(&rx, Duration::from_millis(400), Duration::from_millis(1500));
            let paths = delivered_paths(&events);
            assert!(paths.iter().any(|p| p.ends_with("keep.md")));
            assert!(
                !paths.iter().any(|p| p.ends_with("masked.md")),
                "rg keeps exclusions on top of inclusions; paths={paths:?}"
            );
            assert!(
                !paths.iter().any(|p| p.ends_with("plain.txt")),
                "rg whitelists the name domain through the inclusion globs; paths={paths:?}"
            );
            assert_eq!(events.last().unwrap().partial, Some(true));
        }
    }

    #[test]
    fn files_mode_cap_truncates_and_marks_partial() {
        // Above-cap fixture: exactly FILES_RESULT_CAP delivered across the
        // session's match events, the single complete terminal carrying
        // partial = true, zero post-terminal events (full-trace
        // collection). A cap is not a failure and not a cancellation.
        let dir = TempDir::new().unwrap();
        for i in 0..(FILES_RESULT_CAP + 10) {
            write(dir.path().join(format!("file-{i:03}.md")), "x\n").unwrap();
        }
        {
            let (total, kind, rx) = run_session_files_one_root(
                "s-files-cap",
                dir.path(),
                &SearchOptions::default(),
                Arc::new(AtomicBool::new(false)),
            );
            assert_eq!(
                kind, "complete",
                "a capped session completes — never cancelled, never an error"
            );
            assert_eq!(
                total,
                FILES_RESULT_CAP as u32,
                "the delivered set truncates to the cap exactly"
            );
            let events = collect_all(&rx, Duration::from_millis(400), Duration::from_millis(1500));
            let delivered: usize = events
                .iter()
                .filter(|e| e.kind == "match")
                .map(|e| e.hits.len())
                .sum();
            assert_eq!(
                delivered,
                FILES_RESULT_CAP,
                "the streamed hit count truncates to the cap exactly, including the crossing batch"
            );
            assert_eq!(count_terminals(&events), 1, "exactly one terminal; got {events:?}");
            let last = events.last().unwrap();
            assert_eq!(last.kind, "complete");
            assert_eq!(
                last.partial,
                Some(true),
                "a capped set is never presented as complete"
            );
            assert!(
                events[..events.len() - 1].iter().all(|e| e.kind == "match"),
                "zero post-terminal events — only match events precede the terminal; got {events:?}"
            );
        }
        // Below-cap fixture: the honest non-partial complete terminal.
        {
            let dir2 = TempDir::new().unwrap();
            for i in 0..5 {
                write(dir2.path().join(format!("few-{i}.md")), "x\n").unwrap();
            }
            let (total, kind, rx) = run_session_files_one_root(
                "s-files-below-cap",
                dir2.path(),
                &SearchOptions::default(),
                Arc::new(AtomicBool::new(false)),
            );
            assert_eq!(total, 5);
            assert_eq!(kind, "complete");
            let events = collect_all(&rx, Duration::from_millis(400), Duration::from_millis(1500));
            assert_eq!(
                events.last().unwrap().partial,
                Some(false),
                "a below-cap fixture completes honestly non-partial"
            );
        }
        // rg leg truncation semantics (availability-guarded, canon skip
        // marker): the cap stops the rg read loop promptly and the
        // cap-killed child never surfaces as a false cancelled/error.
        if rg_available() {
            let (tx, rx) = mpsc::channel();
            let sink: Arc<dyn SearchSink> = Arc::new(ChannelSink { tx });
            let mut coordinator = SearchSessionCoordinator::new("s-files-cap-rg".to_string(), sink);
            let roots = vec![dir.path().to_path_buf()];
            let cancel = Arc::new(AtomicBool::new(false));
            let (total, kind) =
                run_session_files(&roots, &SearchOptions::default(), false, cancel, &mut coordinator);
            assert_eq!(
                kind, "complete",
                "the capped rg-leg session completes — never cancelled, never an error"
            );
            assert_eq!(total, FILES_RESULT_CAP as u32);
            let events = collect_all(&rx, Duration::from_millis(400), Duration::from_millis(1500));
            assert_eq!(count_terminals(&events), 1);
            let last = events.last().unwrap();
            assert_eq!(last.kind, "complete");
            assert_eq!(last.partial, Some(true));
            assert!(
                events[..events.len() - 1].iter().all(|e| e.kind == "match"),
                "zero post-terminal events; got {events:?}"
            );
        }
    }

    #[test]
    fn files_mode_rg_transport_honesty() {
        // (a) Injected spawn failure: an impossible executable path — the
        // single error terminal, the second root never started, zero hits.
        {
            let invalid_rg = Path::new("/dev/null/mark-rg-does-not-exist").as_os_str();
            let root_a = TempDir::new().unwrap();
            write(root_a.path().join("a.md"), "x\n").unwrap();
            let root_b = TempDir::new().unwrap();
            write(root_b.path().join("b.md"), "x\n").unwrap();
            let (tx, rx) = mpsc::channel();
            let sink: Arc<dyn SearchSink> = Arc::new(ChannelSink { tx });
            let mut coordinator =
                SearchSessionCoordinator::new("s-files-spawn-fail".to_string(), sink);
            let roots = vec![root_a.path().to_path_buf(), root_b.path().to_path_buf()];
            let cancel = Arc::new(AtomicBool::new(false));
            let (total, kind) = run_session_files_with_program(
                invalid_rg,
                &roots,
                &SearchOptions::default(),
                false,
                cancel,
                &mut coordinator,
            );
            assert_eq!(kind, "error");
            assert_eq!(total, 0);
            let events = collect_all(&rx, Duration::from_millis(400), Duration::from_millis(1500));
            assert_eq!(count_terminals(&events), 1, "exactly one terminal; got {events:?}");
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
                "the second root must not be started after the engine error; events={events:?}"
            );
            assert!(!events.iter().any(|e| e.kind == "complete"));
        }

        // (b) The write_exec_script exit-2 injection: one listing line
        // streamed, then exit 2 — exactly one error terminal with the
        // stable "rg exited with code N" class carrying the code only, and
        // the partial marker because hits were already streamed.
        #[cfg(unix)]
        {
            let dir = TempDir::new().unwrap();
            let script = write_exec_script(
                dir.path(),
                "rg-files-exit-two.sh",
                "#!/bin/sh\nprintf '%s\\n' 'streamed-hit.md'\necho 'boom' >&2\nexit 2\n",
            );
            let root = TempDir::new().unwrap();
            write(root.path().join("a.md"), "x\n").unwrap();
            let (tx, rx) = mpsc::channel();
            let sink: Arc<dyn SearchSink> = Arc::new(ChannelSink { tx });
            let mut coordinator =
                SearchSessionCoordinator::new("s-files-exit-two".to_string(), sink);
            let roots = vec![root.path().to_path_buf()];
            let cancel = Arc::new(AtomicBool::new(false));
            let (total, kind) = run_session_files_with_program(
                script.as_os_str(),
                &roots,
                &SearchOptions::default(),
                false,
                cancel,
                &mut coordinator,
            );
            assert_eq!(kind, "error");
            assert_eq!(total, 1, "the streamed listing line counts");
            let events = collect_all(&rx, Duration::from_millis(400), Duration::from_millis(1500));
            assert_eq!(count_terminals(&events), 1);
            let last = events.last().unwrap();
            assert_eq!(last.kind, "error");
            assert_eq!(
                last.error.as_deref(),
                Some("rg exited with code 2"),
                "stable class message carries the exit code only (no stderr text); got {last:?}"
            );
            assert_eq!(
                last.partial,
                Some(true),
                "an error terminal with already-streamed hits carries the partial marker"
            );
            assert!(
                events[..events.len() - 1].iter().all(|e| e.kind == "match"),
                "zero post-terminal events; got {events:?}"
            );
        }

        // (c) Codes 0 and 1 keep completing normally (1 = no listings).
        #[cfg(unix)]
        {
            let dir = TempDir::new().unwrap();
            let exit_zero = write_exec_script(
                dir.path(),
                "rg-files-exit-zero.sh",
                "#!/bin/sh\nprintf '%s\\n' 'listed.md'\nexit 0\n",
            );
            let root = TempDir::new().unwrap();
            let (tx, rx) = mpsc::channel();
            let sink: Arc<dyn SearchSink> = Arc::new(ChannelSink { tx });
            let mut coordinator =
                SearchSessionCoordinator::new("s-files-exit-zero".to_string(), sink);
            let roots = vec![root.path().to_path_buf()];
            let cancel = Arc::new(AtomicBool::new(false));
            let (total, kind) = run_session_files_with_program(
                exit_zero.as_os_str(),
                &roots,
                &SearchOptions::default(),
                false,
                cancel,
                &mut coordinator,
            );
            assert_eq!(kind, "complete", "exit 0 stays normal");
            assert_eq!(total, 1);
            let events = collect_all(&rx, Duration::from_millis(400), Duration::from_millis(1500));
            assert_eq!(events.last().unwrap().kind, "complete");
            assert_eq!(events.last().unwrap().partial, Some(false));

            let exit_one = write_exec_script(dir.path(), "rg-files-exit-one.sh", "#!/bin/sh\nexit 1\n");
            let (tx, rx) = mpsc::channel();
            let sink: Arc<dyn SearchSink> = Arc::new(ChannelSink { tx });
            let mut coordinator =
                SearchSessionCoordinator::new("s-files-exit-one".to_string(), sink);
            let cancel = Arc::new(AtomicBool::new(false));
            let (total, kind) = run_session_files_with_program(
                exit_one.as_os_str(),
                &roots,
                &SearchOptions::default(),
                false,
                cancel,
                &mut coordinator,
            );
            assert_eq!(kind, "complete", "exit 1 (no listings) stays normal");
            assert_eq!(total, 0);
            let events = collect_all(&rx, Duration::from_millis(400), Duration::from_millis(1500));
            assert_eq!(events.last().unwrap().kind, "complete");
        }

        // (d) A pre-cancelled files session: exactly one cancelled
        // terminal with no match events.
        {
            let dir = TempDir::new().unwrap();
            write(dir.path().join("a.md"), "x\n").unwrap();
            let (total, kind, rx) = run_session_files_one_root(
                "s-files-precancel",
                dir.path(),
                &SearchOptions::default(),
                Arc::new(AtomicBool::new(true)),
            );
            assert_eq!(total, 0);
            assert_eq!(kind, "cancelled");
            let events = collect_all(&rx, Duration::from_millis(400), Duration::from_millis(1500));
            assert_eq!(events.len(), 1, "trace == [cancelled]; got {events:?}");
            assert_eq!(events[0].kind, "cancelled");
            assert!(
                !events.iter().any(|e| e.kind == "match"),
                "a pre-cancelled files session streams no match events"
            );
        }
    }

    #[test]
    fn files_mode_rg_parity_with_walker_on_one_fixture() {
        // T-006: both supported engines pinned individually on the SAME
        // instrumented fixture — the walker leg always (run_session_files
        // with in_process = true, no guard — the App Store and missing-rg
        // fallback paths), the rg leg under the existing availability guard
        // with the canon skip marker — yielding identical expected path
        // sets under the same inclusions, exclusions and cap.
        let dir = TempDir::new().unwrap();
        write(dir.path().join("keep.md"), "x\n").unwrap();
        write(dir.path().join("masked.md"), "x\n").unwrap();
        write(dir.path().join("plain.txt"), "x\n").unwrap();
        std::fs::create_dir_all(dir.path().join("nested")).unwrap();
        write(dir.path().join("nested/deep.md"), "x\n").unwrap();
        let opts = SearchOptions {
            inclusions: Some(vec!["*.md".to_string()]),
            exclusions: Some(vec!["masked.md".to_string()]),
            ..Default::default()
        };

        // Walker leg: always runs.
        let (total_w, kind_w, rx_w) = run_session_files_one_root(
            "s-files-parity-walker",
            dir.path(),
            &opts,
            Arc::new(AtomicBool::new(false)),
        );
        assert_eq!(kind_w, "complete");
        let events_w = collect_all(&rx_w, Duration::from_millis(400), Duration::from_millis(1500));
        let mut walker_paths = delivered_paths(&events_w);
        walker_paths.sort();
        assert_eq!(total_w as usize, walker_paths.len());

        if !rg_available() {
            safe_eprintln!("[test][skip] rg binary not on PATH");
            return;
        }
        // rg leg: availability-guarded, same fixture, same options.
        let (tx, rx) = mpsc::channel();
        let sink: Arc<dyn SearchSink> = Arc::new(ChannelSink { tx });
        let mut coordinator = SearchSessionCoordinator::new("s-files-parity-rg".to_string(), sink);
        let roots = vec![dir.path().to_path_buf()];
        let cancel = Arc::new(AtomicBool::new(false));
        let (total_r, kind_r) =
            run_session_files(&roots, &opts, false, cancel, &mut coordinator);
        assert_eq!(kind_r, "complete");
        let events_r = collect_all(&rx, Duration::from_millis(400), Duration::from_millis(1500));
        let mut rg_paths = delivered_paths(&events_r);
        rg_paths.sort();
        assert_eq!(total_r as usize, rg_paths.len());
        // Identical expected path sets under the same inclusions, exclusions
        // and cap.
        assert_eq!(
            walker_paths, rg_paths,
            "walker and rg legs must deliver identical path sets on one fixture"
        );
        // The expected set itself: the included unmasked files at any depth,
        // the masked file absent, the non-included name absent.
        assert_eq!(walker_paths.len(), 2, "got {walker_paths:?}");
        assert!(
            walker_paths.iter().any(|p| p.ends_with("keep.md")),
            "the included unmasked file is delivered; got {walker_paths:?}"
        );
        assert!(
            walker_paths.iter().any(|p| p.ends_with("deep.md")),
            "the bare inclusion glob matches the nested basename on both legs; got {walker_paths:?}"
        );
        assert!(
            !walker_paths.iter().any(|p| p.ends_with("masked.md")),
            "the exclusion sits on top of the inclusion on both legs; got {walker_paths:?}"
        );
        assert!(
            !walker_paths.iter().any(|p| p.ends_with("plain.txt")),
            "the inclusion whitelists the name domain on both legs; got {walker_paths:?}"
        );
        // The parity fixture stays below FILES_RESULT_CAP, so neither leg
        // truncates and the terminals stay honestly non-partial.
        assert!(walker_paths.len() < FILES_RESULT_CAP);
    }

    #[test]
    fn files_mode_mid_walk_cancel_drains_pending_batch_then_single_terminal() {
        // T-006: the walker path leg keeps the between-entry cancel
        // discipline, mirroring cancellation_drains_partial_batch_before_
        // emit_cancelled — a mid-walk cancel drains the pending batch, then
        // the single terminal lands; zero post-terminal events. Tolerant to
        // fast hosts where the (cap-bounded) walk finishes before the flag.
        let dir = TempDir::new().unwrap();
        for i in 0..500 {
            write(dir.path().join(format!("file-{i:04}.md")), "x\n").unwrap();
        }
        let (tx, rx) = mpsc::channel();
        let cancel = Arc::new(AtomicBool::new(false));
        let cancel_for_thread = cancel.clone();
        let opts = SearchOptions::default();
        let dir_path = dir.path().to_path_buf();
        let handle = std::thread::spawn(move || {
            let sink: Arc<dyn SearchSink> = Arc::new(ChannelSink { tx });
            let mut coordinator =
                SearchSessionCoordinator::new("s-files-mid-cancel".to_string(), sink);
            let roots = vec![dir_path];
            run_session_files(&roots, &opts, true, cancel_for_thread, &mut coordinator)
        });
        std::thread::sleep(Duration::from_millis(2));
        cancel.store(true, Ordering::SeqCst);
        let (_total, kind) = handle.join().unwrap();
        let events = collect_all(&rx, Duration::from_millis(400), Duration::from_millis(1500));
        assert!(
            kind == "cancelled" || kind == "complete",
            "terminal kind is well-formed; got {kind}"
        );
        // Exactly ONE terminal and it is the LAST event — zero post-terminal
        // events; every match batch (including any drained partial batch)
        // precedes it.
        assert_eq!(count_terminals(&events), 1, "exactly one terminal; got {events:?}");
        assert_eq!(
            events.last().unwrap().kind,
            kind,
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
        assert_seq_strictly_increasing(&events);
    }

    // ─── C-SEARCH-ENGINE-PARITY T-001: failing-first parity pins ────────
    // Red receipts recorded against the pre-change tree (VERSION
    // 2.6.0-beta), preserved as pre-change evidence, never relabeled
    // post-fix:
    // (a) engine_parity_case_modes_across_legs — the walker default
    //     matches all three case variants of the Mixed-case pattern
    //     "Needle" while rg --smart-case matches only the exact-case line
    //     (result-set mismatch on the rg leg);
    // (b) engine_parity_gitignore_outside_git_across_legs — the walker
    //     legs filter the gitignored file outside a git repository while
    //     both rg legs do not (result-set mismatch on the rg legs);
    // (c) walker_utf8_boundary_truncation_does_not_panic — the raw byte
    //     slice at MAX_LINE_BYTES panics inside a multi-byte character
    //     (red by panic);
    // (d) engine_parity_hidden_and_excludes_across_legs — the
    //     agreeing-row insurance suite, green before AND after by
    //     construction so the implementation tasks cannot silently break
    //     an aligned row while the shared flag source is re-plumbed.
    // Discipline: no PATH mutation, no network, no git binary invocation;
    // the walker legs always run (the App Store / missing-rg engine), the
    // rg legs sit under the existing availability guard with the canon
    // skip marker; the git-repository companion fixture uses a bare .git
    // entry — the same presence heuristic the ignore crate and rg consult.

    /// Sorted delivered snippet set (content mode) — the parity unit for
    /// result-set comparisons across engines.
    fn delivered_snippets(events: &[SearchEvent]) -> Vec<String> {
        let mut out: Vec<String> = events
            .iter()
            .filter(|e| e.kind == "match")
            .flat_map(|e| e.hits.iter().map(|h| h.snippet.clone()))
            .collect();
        out.sort();
        out
    }

    /// rg content-session harness mirroring run_session_one_root
    /// (in_process = false; callers availability-guard the call).
    fn run_session_one_root_rg(
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
        let (total, kind) = run_session(&roots, pattern, opts, false, cancel, &mut coordinator);
        (total, kind, rx)
    }

    /// rg files-session harness mirroring run_session_files_one_root
    /// (in_process = false; callers availability-guard the call).
    fn run_session_files_one_root_rg(
        search_id: &str,
        root: &Path,
        opts: &SearchOptions,
        cancel: Arc<AtomicBool>,
    ) -> (u32, &'static str, mpsc::Receiver<SearchEvent>) {
        let (tx, rx) = mpsc::channel();
        let sink: Arc<dyn SearchSink> = Arc::new(ChannelSink { tx });
        let mut coordinator = SearchSessionCoordinator::new(search_id.to_string(), sink);
        let roots = vec![root.to_path_buf()];
        let (total, kind) = run_session_files(&roots, opts, false, cancel, &mut coordinator);
        (total, kind, rx)
    }

    #[test]
    fn engine_parity_case_modes_across_legs() {
        // One fixture whose lines carry "needle", "NEEDLE" and "Needle";
        // three case rows must agree across engines.
        let dir = TempDir::new().unwrap();
        write(dir.path().join("cases.md"), "needle\nNEEDLE\nNeedle\n").unwrap();
        let all_three: Vec<String> = vec![
            "NEEDLE".to_string(),
            "Needle".to_string(),
            "needle".to_string(),
        ];
        let exact_only: Vec<String> = vec!["Needle".to_string()];

        // Walker legs (always run — the App Store / missing-rg engine).
        let walker_default_set: Vec<String>;
        {
            let opts = SearchOptions::default();
            let (total, kind, rx) = run_session_one_root(
                "s-case-walker-default",
                dir.path(),
                "Needle",
                &opts,
                Arc::new(AtomicBool::new(false)),
            );
            assert_eq!(kind, "complete");
            assert_eq!(total, 3, "walker default matches all three case variants");
            let events = collect_until_terminal(&rx, Duration::from_secs(2));
            let set = delivered_snippets(&events);
            assert_eq!(set, all_three, "walker default must cover every case variant");
            walker_default_set = set;
        }
        {
            // The explicit toggle is the only case control: sensitive mode
            // yields only the exact line on the walker.
            let opts = SearchOptions {
                is_case_sensitive: Some(true),
                ..Default::default()
            };
            let (total, kind, rx) = run_session_one_root(
                "s-case-walker-sensitive",
                dir.path(),
                "Needle",
                &opts,
                Arc::new(AtomicBool::new(false)),
            );
            assert_eq!(kind, "complete");
            assert_eq!(total, 1, "walker sensitive mode matches only the exact case");
            let events = collect_until_terminal(&rx, Duration::from_secs(2));
            assert_eq!(delivered_snippets(&events), exact_only);
        }
        {
            // Lowercase pattern: insensitive everywhere (#320 parity shape).
            let opts = SearchOptions::default();
            let (total, kind, rx) = run_session_one_root(
                "s-case-walker-lower",
                dir.path(),
                "needle",
                &opts,
                Arc::new(AtomicBool::new(false)),
            );
            assert_eq!(kind, "complete");
            assert_eq!(total, 3);
            let events = collect_until_terminal(&rx, Duration::from_secs(2));
            assert_eq!(delivered_snippets(&events), all_three);
        }

        // rg legs (availability-guarded, canon skip marker).
        if !rg_available() {
            safe_eprintln!("[test][skip] rg binary not on PATH");
            return;
        }
        {
            let opts = SearchOptions::default();
            let (total, kind, rx) = run_session_one_root_rg(
                "s-case-rg-default",
                dir.path(),
                "Needle",
                &opts,
                Arc::new(AtomicBool::new(false)),
            );
            assert_eq!(kind, "complete");
            assert_eq!(total, 3, "rg must match all three variants like the walker");
            let events = collect_until_terminal(&rx, Duration::from_secs(2));
            let rg_set = delivered_snippets(&events);
            assert_eq!(
                rg_set, walker_default_set,
                "IDENTICAL result set on both legs for the Mixed-case default pattern — the pattern-dependent smart-case mode must not override the explicit toggle"
            );
        }
        {
            let opts = SearchOptions {
                is_case_sensitive: Some(true),
                ..Default::default()
            };
            let (total, kind, rx) = run_session_one_root_rg(
                "s-case-rg-sensitive",
                dir.path(),
                "Needle",
                &opts,
                Arc::new(AtomicBool::new(false)),
            );
            assert_eq!(kind, "complete");
            assert_eq!(total, 1);
            let events = collect_until_terminal(&rx, Duration::from_secs(2));
            assert_eq!(delivered_snippets(&events), exact_only);
        }
        {
            let opts = SearchOptions::default();
            let (total, kind, rx) = run_session_one_root_rg(
                "s-case-rg-lower",
                dir.path(),
                "needle",
                &opts,
                Arc::new(AtomicBool::new(false)),
            );
            assert_eq!(kind, "complete");
            assert_eq!(total, 3);
            let events = collect_until_terminal(&rx, Duration::from_secs(2));
            assert_eq!(delivered_snippets(&events), all_three);
        }
    }

    #[test]
    fn engine_parity_gitignore_outside_git_across_legs() {
        // A plain folder — NO .git entry — with a .gitignore listing one
        // file and a sibling file, both bodies carrying the needle. The
        // walker canon (require_git(false)) filters the gitignored file
        // everywhere; every leg must deliver the identical set.
        let dir = TempDir::new().unwrap();
        write(dir.path().join(".gitignore"), "secret.md\n").unwrap();
        write(dir.path().join("secret.md"), "needle\n").unwrap();
        write(dir.path().join("public.md"), "needle\n").unwrap();
        let opts = SearchOptions::default();

        // Content walker leg (always).
        let (total_w, kind_w, rx_w) = run_session_one_root(
            "s-gi-walker",
            dir.path(),
            "needle",
            &opts,
            Arc::new(AtomicBool::new(false)),
        );
        assert_eq!(kind_w, "complete");
        assert_eq!(total_w, 1, "walker filters the gitignored file outside git");
        let events_w = collect_until_terminal(&rx_w, Duration::from_secs(2));
        assert!(
            events_w
                .iter()
                .any(|e| e.hits.iter().any(|h| h.path.ends_with("public.md"))),
            "the sibling must be present"
        );
        assert!(
            !events_w
                .iter()
                .any(|e| e.hits.iter().any(|h| h.path.ends_with("secret.md"))),
            "the gitignored file must be absent"
        );

        // Files-mode walker leg (always).
        let (pfw_total, pfw_kind, pfw_rx) = run_session_files_one_root(
            "s-gi-files-walker",
            dir.path(),
            &opts,
            Arc::new(AtomicBool::new(false)),
        );
        assert_eq!(pfw_kind, "complete");
        assert_eq!(pfw_total, 1, "files-mode walker filters the gitignored file too");
        let files_walker_events =
            collect_all(&pfw_rx, Duration::from_millis(400), Duration::from_millis(1500));
        let mut files_walker_paths = delivered_paths(&files_walker_events);
        files_walker_paths.sort();
        assert_eq!(files_walker_paths.len(), 1);
        assert!(files_walker_paths[0].ends_with("public.md"));

        // rg legs (availability-guarded, canon skip marker): content AND
        // files mode must filter identically outside a git repository.
        if !rg_available() {
            safe_eprintln!("[test][skip] rg binary not on PATH");
            return;
        }
        {
            let (total_r, kind_r, rx_r) = run_session_one_root_rg(
                "s-gi-rg",
                dir.path(),
                "needle",
                &opts,
                Arc::new(AtomicBool::new(false)),
            );
            assert_eq!(kind_r, "complete");
            assert_eq!(
                total_r, total_w,
                "IDENTICAL content result set outside a git repository — rg must honor .gitignore exactly like the walker"
            );
            let events_r = collect_until_terminal(&rx_r, Duration::from_secs(2));
            assert!(
                !events_r
                    .iter()
                    .any(|e| e.hits.iter().any(|h| h.path.ends_with("secret.md"))),
                "the gitignored file must be absent on the rg content leg too"
            );
            assert!(
                events_r
                    .iter()
                    .any(|e| e.hits.iter().any(|h| h.path.ends_with("public.md"))),
                "the sibling must be present on the rg content leg"
            );
        }
        {
            let (total_rf, kind_rf, rx_rf) = run_session_files_one_root_rg(
                "s-gi-files-rg",
                dir.path(),
                &opts,
                Arc::new(AtomicBool::new(false)),
            );
            assert_eq!(kind_rf, "complete");
            assert_eq!(
                total_rf, pfw_total,
                "IDENTICAL files-mode listing outside a git repository"
            );
            let files_rg_events =
                collect_all(&rx_rf, Duration::from_millis(400), Duration::from_millis(1500));
            let mut files_rg_paths = delivered_paths(&files_rg_events);
            files_rg_paths.sort();
            assert_eq!(
                files_rg_paths, files_walker_paths,
                "IDENTICAL path sets on both files-mode legs"
            );
        }

        // Companion: INSIDE a git repository nothing changes on either
        // engine. The fixture carries a bare .git directory — the same
        // presence heuristic the ignore crate and rg consult for
        // require_git; no git binary invocation, no PATH mutation.
        let repo = TempDir::new().unwrap();
        std::fs::create_dir(repo.path().join(".git")).unwrap();
        write(repo.path().join(".gitignore"), "secret.md\n").unwrap();
        write(repo.path().join("secret.md"), "needle\n").unwrap();
        write(repo.path().join("public.md"), "needle\n").unwrap();
        let (total_rw, kind_rw, _rx_rw) = run_session_one_root(
            "s-gi-repo-walker",
            repo.path(),
            "needle",
            &opts,
            Arc::new(AtomicBool::new(false)),
        );
        assert_eq!(kind_rw, "complete");
        assert_eq!(total_rw, 1, "inside git the walker filter is unchanged");
        let (total_rr, kind_rr, _rx_rr) = run_session_one_root_rg(
            "s-gi-repo-rg",
            repo.path(),
            "needle",
            &opts,
            Arc::new(AtomicBool::new(false)),
        );
        assert_eq!(kind_rr, "complete");
        assert_eq!(
            total_rr, total_rw,
            "inside a git repository both engines filter identically"
        );
    }

    #[test]
    fn walker_utf8_boundary_truncation_does_not_panic() {
        // The byte cut at MAX_LINE_BYTES lands inside a multi-byte
        // character: 1-byte filler up to MAX_LINE_BYTES - 1, then Cyrillic
        // letters (2 bytes each — the first one straddles the cap), an
        // emoji (4 bytes) and the needle after the cut. Today the raw
        // slice `&line[..MAX_LINE_BYTES.min(line.len())]` panics; the
        // session must complete instead, deliver the hit with the
        // truncated flag and the ellipsis marker, valid UTF-8 only, and
        // honest-or-absent bounds per the #320 rule.
        let mut line = "x".repeat(MAX_LINE_BYTES - 1);
        line.push_str("бб"); // 4 bytes: the cut at MAX_LINE_BYTES lands inside the first б
        line.push_str("🙂🙂"); // astral-plane content after the cut
        line.push_str("needle");
        line.push_str(&"y".repeat(50));
        let dir = TempDir::new().unwrap();
        write(dir.path().join("cyr.md"), line + "\n").unwrap();
        let cancel = Arc::new(AtomicBool::new(false));
        let opts = SearchOptions::default();
        let (total, kind, rx) =
            run_session_one_root("s-utf8-trunc", dir.path(), "needle", &opts, cancel);
        // No panic above — the session completes and delivers the hit.
        assert_eq!(kind, "complete");
        assert_eq!(total, 1, "the cap-crossing multi-byte hit is still delivered");
        let events = collect_until_terminal(&rx, Duration::from_secs(2));
        let v = first_hit_value(&events, "cyr.md", 1);
        assert_eq!(
            v.get("truncated").and_then(|x| x.as_bool()),
            Some(true),
            "fixture sanity: the snippet really is byte-truncated"
        );
        let snippet = v
            .get("snippet")
            .and_then(|x| x.as_str())
            .expect("snippet delivered");
        assert!(snippet.ends_with('…'), "the ellipsis marker must be present");
        assert!(
            snippet.len() <= MAX_LINE_BYTES + '…'.len_utf8(),
            "the delivered snippet stays within the cap plus the marker bytes"
        );
        // The delivered text is the longest prefix ending on a char
        // boundary: String::from_utf8 on the wire form proves valid UTF-8.
        let delivered_end_byte = snippet.len() - '…'.len_utf8();
        assert!(
            String::from_utf8(snippet[..delivered_end_byte].as_bytes().to_vec()).is_ok(),
            "the delivered text must end on a UTF-8 character boundary"
        );
        // Honest-or-absent: the needle sits beyond the cap, so the match
        // is not fully inside the delivered text — the bounds stay
        // wire-absent, pinned via serde_json serialization.
        let raw = serde_json::to_string(&v).unwrap();
        assert!(
            !raw.contains("\"matchStart\"") && !raw.contains("\"matchEnd\""),
            "bounds must stay wire-absent when the match is not fully inside the delivered snippet; got {raw}"
        );
    }

    #[test]
    fn engine_parity_hidden_and_excludes_across_legs() {
        // Agreeing-row insurance suite: every row below already agrees on
        // the pre-change tree; the pin keeps the implementation tasks from
        // silently breaking an aligned row while the shared flag source is
        // re-plumbed. Green before AND after by construction; each row is
        // asserted identically on the walker leg (always) and the rg leg
        // (availability-guarded).

        // Row: hidden files skipped by default.
        let hidden_dir = TempDir::new().unwrap();
        write(hidden_dir.path().join(".secret.md"), "needle\n").unwrap();
        write(hidden_dir.path().join("public.md"), "needle\n").unwrap();
        let hidden_opts = SearchOptions::default();

        // Row: include_hidden picks the dotfile up.
        let dot_dir = TempDir::new().unwrap();
        write(dot_dir.path().join(".secret.md"), "needle\n").unwrap();
        let dot_opts = SearchOptions {
            include_hidden: Some(true),
            ..Default::default()
        };

        // Row: exclusion masks — masked file absent, sibling present.
        let excl_dir = TempDir::new().unwrap();
        write(excl_dir.path().join("secret.md"), "needle\n").unwrap();
        write(excl_dir.path().join("public.md"), "needle\n").unwrap();
        let excl_opts = SearchOptions {
            exclusions: Some(vec!["secret.md".to_string()]),
            ..Default::default()
        };

        // Row: invalid mask ignored + the honest partial flag.
        let invalid_dir = TempDir::new().unwrap();
        write(invalid_dir.path().join("a.md"), "needle\n").unwrap();
        let invalid_opts = SearchOptions {
            exclusions: Some(vec!["[".to_string()]),
            ..Default::default()
        };

        // Row: content-mode maxFileSize — the size-limited fixture yields
        // identically filtered results on both legs.
        let size_dir = TempDir::new().unwrap();
        write(size_dir.path().join("big.md"), "needle\n".repeat(20_000)).unwrap();
        write(size_dir.path().join("small.md"), "needle\n").unwrap();
        let size_opts = SearchOptions {
            max_file_size: Some(1024),
            ..Default::default()
        };

        // Row: follow_symlinks — default skips the symlink, follow picks
        // both paths up (unix-gated symlink creation).
        #[cfg(unix)]
        let (link_dir, link_default_total, link_follow_total) = {
            let dir = TempDir::new().unwrap();
            write(dir.path().join("real.md"), "needle\n").unwrap();
            std::fs::create_dir_all(dir.path().join("sub")).unwrap();
            std::os::unix::fs::symlink(dir.path().join("real.md"), dir.path().join("sub/link.md"))
                .unwrap();
            let default_opts = SearchOptions::default();
            let (total_def, kind_def, _rx) = run_session_one_root(
                "s-rows-follow-def-w",
                dir.path(),
                "needle",
                &default_opts,
                Arc::new(AtomicBool::new(false)),
            );
            assert_eq!(kind_def, "complete");
            assert_eq!(total_def, 1, "default: the symlink is not followed");
            let follow_opts = SearchOptions {
                follow_symlinks: Some(true),
                ..Default::default()
            };
            let (total_fol, kind_fol, _rx) = run_session_one_root(
                "s-rows-follow-on-w",
                dir.path(),
                "needle",
                &follow_opts,
                Arc::new(AtomicBool::new(false)),
            );
            assert_eq!(kind_fol, "complete");
            assert_eq!(total_fol, 2, "follow_symlinks: both paths deliver");
            (dir, total_def, total_fol)
        };

        // Row: whole-word.
        let word_dir = TempDir::new().unwrap();
        write(word_dir.path().join("a.md"), "cat catalog scattered\n").unwrap();
        let word_opts = SearchOptions {
            is_whole_word: Some(true),
            ..Default::default()
        };

        // Row: literal and regex shapes (one match per line — the row pins
        // pattern-semantics parity, not the recorded per-line delivery
        // divergence the #320 bounds supersede).
        let lit_dir = TempDir::new().unwrap();
        write(lit_dir.path().join("a.md"), "foo.bar\nfooXbar\n").unwrap();
        let lit_opts = SearchOptions::default();
        let regex_dir = TempDir::new().unwrap();
        write(regex_dir.path().join("a.md"), "foo123\nbar456\n").unwrap();
        let regex_opts = SearchOptions {
            is_regexp: Some(true),
            ..Default::default()
        };

        // Walker legs (always run).
        {
            let (total, kind, rx) = run_session_one_root(
                "s-rows-hidden-w",
                hidden_dir.path(),
                "needle",
                &hidden_opts,
                Arc::new(AtomicBool::new(false)),
            );
            assert_eq!(kind, "complete");
            assert_eq!(total, 1, "hidden: only the public file matches");
            let events = collect_until_terminal(&rx, Duration::from_secs(2));
            assert!(!events.iter().any(|e| e.hits.iter().any(|h| h.path.ends_with(".secret.md"))));
        }
        {
            let (total, kind, rx) = run_session_one_root(
                "s-rows-dot-w",
                dot_dir.path(),
                "needle",
                &dot_opts,
                Arc::new(AtomicBool::new(false)),
            );
            assert_eq!(kind, "complete");
            assert_eq!(total, 1);
            let events = collect_until_terminal(&rx, Duration::from_secs(2));
            assert!(events.iter().any(|e| e.hits.iter().any(|h| h.path.ends_with(".secret.md"))));
        }
        {
            let (total, kind, rx) = run_session_one_root(
                "s-rows-excl-w",
                excl_dir.path(),
                "needle",
                &excl_opts,
                Arc::new(AtomicBool::new(false)),
            );
            assert_eq!(kind, "complete");
            assert_eq!(total, 1, "exclusions: only the unmasked sibling matches");
            let events = collect_until_terminal(&rx, Duration::from_secs(2));
            assert!(!events.iter().any(|e| e.hits.iter().any(|h| h.path.ends_with("secret.md"))));
            assert!(events.iter().any(|e| e.hits.iter().any(|h| h.path.ends_with("public.md"))));
            assert_eq!(events.last().unwrap().partial, Some(true));
        }
        {
            let (total, kind, rx) = run_session_one_root(
                "s-rows-invalid-w",
                invalid_dir.path(),
                "needle",
                &invalid_opts,
                Arc::new(AtomicBool::new(false)),
            );
            assert_eq!(kind, "complete");
            assert_eq!(total, 1, "invalid mask filters nothing");
            let events = collect_until_terminal(&rx, Duration::from_secs(2));
            assert_eq!(events.last().unwrap().partial, Some(true));
        }
        {
            let (total, kind, rx) = run_session_one_root(
                "s-rows-size-w",
                size_dir.path(),
                "needle",
                &size_opts,
                Arc::new(AtomicBool::new(false)),
            );
            assert_eq!(kind, "complete");
            assert_eq!(total, 1, "maxFileSize: only the small file is searched");
            let events = collect_until_terminal(&rx, Duration::from_secs(2));
            assert!(!events.iter().any(|e| e.hits.iter().any(|h| h.path.ends_with("big.md"))));
        }
        {
            let (total, kind, rx) = run_session_one_root(
                "s-rows-word-w",
                word_dir.path(),
                "cat",
                &word_opts,
                Arc::new(AtomicBool::new(false)),
            );
            assert_eq!(kind, "complete");
            assert_eq!(total, 1, "whole-word: only the standalone word matches");
        }
        {
            let (total, kind, rx) = run_session_one_root(
                "s-rows-lit-w",
                lit_dir.path(),
                "foo.bar",
                &lit_opts,
                Arc::new(AtomicBool::new(false)),
            );
            assert_eq!(kind, "complete");
            assert_eq!(total, 1, "literal mode: the dot matches a literal dot only");
            let events = collect_until_terminal(&rx, Duration::from_secs(2));
            assert_eq!(delivered_snippets(&events), vec!["foo.bar".to_string()]);
        }
        {
            let (total, kind, rx) = run_session_one_root(
                "s-rows-regex-w",
                regex_dir.path(),
                r"\w+\d+",
                &regex_opts,
                Arc::new(AtomicBool::new(false)),
            );
            assert_eq!(kind, "complete");
            assert_eq!(total, 2, "regex mode: both tokens match");
        }

        // rg legs (availability-guarded, canon skip marker): the same
        // rows, identical expectations.
        if !rg_available() {
            safe_eprintln!("[test][skip] rg binary not on PATH");
            return;
        }
        {
            let (total, kind, rx) = run_session_one_root_rg(
                "s-rows-hidden-r",
                hidden_dir.path(),
                "needle",
                &hidden_opts,
                Arc::new(AtomicBool::new(false)),
            );
            assert_eq!(kind, "complete");
            assert_eq!(total, 1, "rg hidden row must agree with the walker");
            let events = collect_until_terminal(&rx, Duration::from_secs(2));
            assert!(!events.iter().any(|e| e.hits.iter().any(|h| h.path.ends_with(".secret.md"))));
        }
        {
            let (total, kind, rx) = run_session_one_root_rg(
                "s-rows-dot-r",
                dot_dir.path(),
                "needle",
                &dot_opts,
                Arc::new(AtomicBool::new(false)),
            );
            assert_eq!(kind, "complete");
            assert_eq!(total, 1);
            let events = collect_until_terminal(&rx, Duration::from_secs(2));
            assert!(events.iter().any(|e| e.hits.iter().any(|h| h.path.ends_with(".secret.md"))));
        }
        {
            let (total, kind, rx) = run_session_one_root_rg(
                "s-rows-excl-r",
                excl_dir.path(),
                "needle",
                &excl_opts,
                Arc::new(AtomicBool::new(false)),
            );
            assert_eq!(kind, "complete");
            assert_eq!(total, 1, "rg exclusion row must agree with the walker");
            let events = collect_until_terminal(&rx, Duration::from_secs(2));
            assert!(!events.iter().any(|e| e.hits.iter().any(|h| h.path.ends_with("secret.md"))));
            assert!(events.iter().any(|e| e.hits.iter().any(|h| h.path.ends_with("public.md"))));
            assert_eq!(events.last().unwrap().partial, Some(true));
        }
        {
            let (total, kind, rx) = run_session_one_root_rg(
                "s-rows-invalid-r",
                invalid_dir.path(),
                "needle",
                &invalid_opts,
                Arc::new(AtomicBool::new(false)),
            );
            assert_eq!(kind, "complete", "invalid mask must never reach rg");
            assert_eq!(total, 1);
            let events = collect_until_terminal(&rx, Duration::from_secs(2));
            assert_eq!(events.last().unwrap().partial, Some(true));
        }
        {
            let (total, kind, rx) = run_session_one_root_rg(
                "s-rows-size-r",
                size_dir.path(),
                "needle",
                &size_opts,
                Arc::new(AtomicBool::new(false)),
            );
            assert_eq!(kind, "complete");
            assert_eq!(total, 1, "rg maxFileSize row must agree with the walker");
            let events = collect_until_terminal(&rx, Duration::from_secs(2));
            assert!(!events.iter().any(|e| e.hits.iter().any(|h| h.path.ends_with("big.md"))));
        }
        #[cfg(unix)]
        {
            let default_opts = SearchOptions::default();
            let (total_def, kind_def, _rx) = run_session_one_root_rg(
                "s-rows-follow-def-r",
                link_dir.path(),
                "needle",
                &default_opts,
                Arc::new(AtomicBool::new(false)),
            );
            assert_eq!(kind_def, "complete");
            assert_eq!(total_def, link_default_total, "rg follow-off row agrees");
            let follow_opts = SearchOptions {
                follow_symlinks: Some(true),
                ..Default::default()
            };
            let (total_fol, kind_fol, _rx) = run_session_one_root_rg(
                "s-rows-follow-on-r",
                link_dir.path(),
                "needle",
                &follow_opts,
                Arc::new(AtomicBool::new(false)),
            );
            assert_eq!(kind_fol, "complete");
            assert_eq!(total_fol, link_follow_total, "rg follow-on row agrees");
        }
        {
            let (total, kind, rx) = run_session_one_root_rg(
                "s-rows-word-r",
                word_dir.path(),
                "cat",
                &word_opts,
                Arc::new(AtomicBool::new(false)),
            );
            assert_eq!(kind, "complete");
            assert_eq!(total, 1, "rg whole-word row must agree with the walker");
        }
        {
            let (total, kind, rx) = run_session_one_root_rg(
                "s-rows-lit-r",
                lit_dir.path(),
                "foo.bar",
                &lit_opts,
                Arc::new(AtomicBool::new(false)),
            );
            assert_eq!(kind, "complete");
            assert_eq!(total, 1);
            let events = collect_until_terminal(&rx, Duration::from_secs(2));
            assert_eq!(delivered_snippets(&events), vec!["foo.bar".to_string()]);
        }
        {
            let (total, kind, rx) = run_session_one_root_rg(
                "s-rows-regex-r",
                regex_dir.path(),
                r"\w+\d+",
                &regex_opts,
                Arc::new(AtomicBool::new(false)),
            );
            assert_eq!(kind, "complete");
            assert_eq!(total, 2);
        }
    }
}
