// MODULE_CONTRACT
//   PURPOSE: M-001 lifecycle primitives. Two state machines:
//            (1) CloseStateMachine — enforces the close-window
//                transitions (CLOSE_REQUESTED → PROMPT_OPEN →
//                {SAVE_FAILED|CLOSE_CANCELLED|FORCE_CLOSE} →
//                WATCHERS_CLEANED → WINDOW_DESTROYED) at compile-time.
//                Invalid transitions return CloseTransitionError, NEVER
//                panic.
//            (2) MenuGeneration — atomic counter for menu rebuilds;
//                stale-event discard via check_stale().
//            Plus the ReplayPolicy enum that documents which IPC event
//            classes are replayable vs droppable post-window-destroy.
//   SCOPE:   pure types + atomic counter. No Tauri runtime hooks —
//            those wire up in post-B1 once M-013b ships real impls
//            and we have real windows to attach event handlers to.
//   DEPENDS: stdlib only (sync::atomic).
//   LINKS:   docs/development-plan.xml Phase-B1 step-11;
//            verification-plan.xml VF-016 (lifecycle gate).
//   STATUS:  Phase-B1 step-11. Stub-level: types + invariants +
//            BLOCK markers. Runtime wiring in B2/B3.
//
// CHANGE_SUMMARY:
//   - 2026-04-28 B1-step-11: initial state-machines + replay-drop spec.

// Module-level allow(dead_code) is intentional. M-001 lifecycle types
// are the contract surface for B2/B3 wiring (M-013b dispatch picks
// ReplayPolicy; M-009 menu calls bump_menu_generation; M-001 close
// hooks drive CloseStateMachine). At B1 stub level, callers haven't
// landed yet — tests exercise the surface in #[cfg(test)]. Release
// builds would otherwise emit 13 "never used" warnings; rather than
// suppress per-item, lint the module as a whole.
#![allow(dead_code)]

use std::fmt;
use std::sync::atomic::{AtomicU64, Ordering};

// ───────────────────────────────────────────────────────────────────
// Close lifecycle state machine
// ───────────────────────────────────────────────────────────────────

/// States in the window-close lifecycle. The transition diagram is:
///
///   Idle
///     │ user clicks X / Cmd+W
///     ▼
///   CloseRequested ──┐
///     │             │ no unsaved → ForceClose
///     │ unsaved     │
///     ▼             │
///   PromptOpen      │
///     │             │
///     ├── Cancel ──→ CloseCancelled (terminal)
///     ├── Save fails ──→ SaveFailed ──→ PromptOpen (retry loop)
///     └── Save ok / Discard ──→ ForceClose
///                                  │
///                                  ▼
///                                WatchersCleaned
///                                  │
///                                  ▼
///                                WindowDestroyed (terminal)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum CloseState {
    Idle,
    CloseRequested,
    PromptOpen,
    SaveFailed,
    CloseCancelled,
    ForceClose,
    WatchersCleaned,
    WindowDestroyed,
}

impl CloseState {
    /// Is this a terminal state? Terminal = no further transitions allowed.
    pub fn is_terminal(self) -> bool {
        matches!(self, Self::CloseCancelled | Self::WindowDestroyed)
    }

    /// Stable [BLOCK_*] marker name for trace logs.
    pub fn block_marker(self) -> &'static str {
        match self {
            Self::Idle => "BLOCK_CLOSE_IDLE",
            Self::CloseRequested => "BLOCK_CLOSE_REQUESTED",
            Self::PromptOpen => "BLOCK_PROMPT_OPEN",
            Self::SaveFailed => "BLOCK_SAVE_FAILED",
            Self::CloseCancelled => "BLOCK_CLOSE_CANCELLED",
            Self::ForceClose => "BLOCK_FORCE_CLOSE",
            Self::WatchersCleaned => "BLOCK_WATCHERS_CLEANED",
            Self::WindowDestroyed => "BLOCK_WINDOW_DESTROYED",
        }
    }
}

/// Transition error when a caller asks for an illegal state change.
/// NEVER causes a panic — caller decides whether to log + drop or escalate.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CloseTransitionError {
    pub from: CloseState,
    pub to: CloseState,
    pub reason: &'static str,
}

impl fmt::Display for CloseTransitionError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "invalid close transition {:?} → {:?}: {}",
            self.from, self.to, self.reason
        )
    }
}

/// Validate a transition in isolation (pure function). Used by the
/// state machine and exposed for testing.
pub fn is_valid_transition(from: CloseState, to: CloseState) -> bool {
    use CloseState::*;
    match (from, to) {
        // Open the lifecycle from Idle
        (Idle, CloseRequested) => true,

        // From CloseRequested branch: prompt or fast-path force-close
        (CloseRequested, PromptOpen) => true,
        (CloseRequested, ForceClose) => true,

        // Inside the prompt
        (PromptOpen, CloseCancelled) => true,
        (PromptOpen, SaveFailed) => true,
        (PromptOpen, ForceClose) => true,

        // Save-failed retry loop
        (SaveFailed, PromptOpen) => true,
        (SaveFailed, CloseCancelled) => true,
        (SaveFailed, ForceClose) => true,

        // Force-close → cleanup
        (ForceClose, WatchersCleaned) => true,
        (WatchersCleaned, WindowDestroyed) => true,

        // Everything else is invalid
        _ => false,
    }
}

/// Per-window state machine. Caller owns instances 1:1 with
/// WebviewWindow handles. Cheap to clone (Copy state, no refcounts).
#[derive(Debug, Clone, Copy)]
pub struct CloseStateMachine {
    state: CloseState,
}

impl Default for CloseStateMachine {
    fn default() -> Self {
        Self { state: CloseState::Idle }
    }
}

impl CloseStateMachine {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn state(&self) -> CloseState {
        self.state
    }

    pub fn is_terminal(&self) -> bool {
        self.state.is_terminal()
    }

    /// Attempt a transition. Logs the [BLOCK_*] marker on success;
    /// returns Err(CloseTransitionError) on invalid request.
    /// Eprintln traces are V-M-001 evidence — never moved to debug-only.
    pub fn transition(&mut self, to: CloseState) -> Result<CloseState, CloseTransitionError> {
        if !is_valid_transition(self.state, to) {
            return Err(CloseTransitionError {
                from: self.state,
                to,
                reason: "transition not in close-lifecycle diagram",
            });
        }
        let from = self.state;
        self.state = to;
        eprintln!(
            "[m001][lifecycle][{} from={:?} to={:?}]",
            to.block_marker(),
            from,
            to
        );
        Ok(to)
    }
}

// ───────────────────────────────────────────────────────────────────
// Menu generation counter
// ───────────────────────────────────────────────────────────────────

/// Process-global menu-rebuild generation counter. Each prefs change /
/// theme switch / language change increments it; in-flight menu events
/// stamped with the OLD generation get dropped via check_stale.
///
/// V-M-001 marker: [m001][lifecycle][BLOCK_STALE_MENU_GENERATION
/// expected=N actual=M] fires every drop so leaks are observable.
static MENU_GENERATION: AtomicU64 = AtomicU64::new(0);

/// Read the current generation (for stamping outgoing menu events).
pub fn current_menu_generation() -> u64 {
    MENU_GENERATION.load(Ordering::SeqCst)
}

/// Bump on every menu rebuild. Returns the NEW generation so the
/// caller can stamp the freshly-built menu's events.
pub fn bump_menu_generation() -> u64 {
    let next = MENU_GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
    eprintln!("[m001][lifecycle][BLOCK_MENU_GENERATION_BUMPED next={next}]");
    next
}

/// Returns true if `event_generation` is still current (event should
/// be processed); false if stale (event should be dropped). Emits
/// the BLOCK_STALE_MENU_GENERATION marker on drop so leaks are
/// observable in the trace.
pub fn check_stale(event_generation: u64) -> bool {
    let current = current_menu_generation();
    if event_generation == current {
        return false;
    }
    eprintln!(
        "[m001][lifecycle][BLOCK_STALE_MENU_GENERATION expected={current} actual={event_generation}]"
    );
    true
}

/// Test-only reset. Pub(crate) is intentional — tests in other modules
/// could need it but production code MUST NOT call this.
#[cfg(test)]
pub(crate) fn _reset_menu_generation_for_test() {
    MENU_GENERATION.store(0, Ordering::SeqCst);
}

/// Test-only serialization lock. Cargo runs tests in parallel by
/// default; tests that touch the process-global MENU_GENERATION must
/// hold this lock to avoid race-induced flakes. Acquired via
/// `_menu_test_lock().lock().unwrap()` at the top of each affected
/// test; the guard is held to end-of-scope.
#[cfg(test)]
pub(crate) fn _menu_test_lock() -> &'static std::sync::Mutex<()> {
    static LOCK: std::sync::OnceLock<std::sync::Mutex<()>> = std::sync::OnceLock::new();
    LOCK.get_or_init(|| std::sync::Mutex::new(()))
}

// ───────────────────────────────────────────────────────────────────
// Replay / drop policy
// ───────────────────────────────────────────────────────────────────

/// Policy for IPC events that arrive after their target window has
/// transitioned past the relevant state. Conservative defaults:
///
/// - Filesystem changes (M-003 watcher) → DROP after WatchersCleaned.
/// - Search results (M-004) → DROP after CloseCancelled / WindowDestroyed.
/// - User input forwarded from menu/shortcut → REPLAY only if window is
///   still in {Idle, CloseRequested, PromptOpen, SaveFailed} — i.e. the
///   user is still interacting; replay otherwise drops.
/// - Crash-log writes from M-001 panic hook → ALWAYS WRITE — they don't
///   go through the IPC replay path; they bypass via cache_root file IO.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ReplayPolicy {
    /// Always deliver. Use sparingly — fundamentally a "must succeed" event.
    Replay,
    /// Drop after the window enters its terminal-cleanup branch
    /// (ForceClose or beyond). Default for streaming events.
    DropAfterCleanup,
    /// Drop unconditionally if the window is in any non-Idle state.
    /// Used for low-priority telemetry pings.
    DropIfBusy,
}

/// Decide whether to deliver an event given its policy + the current
/// close-state. Pure function; no I/O.
pub fn should_deliver(policy: ReplayPolicy, current: CloseState) -> bool {
    use CloseState::*;
    match policy {
        ReplayPolicy::Replay => true,
        ReplayPolicy::DropAfterCleanup => !matches!(
            current,
            ForceClose | WatchersCleaned | WindowDestroyed | CloseCancelled
        ),
        ReplayPolicy::DropIfBusy => current == Idle,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── close state machine ─────────────────────────────────────────
    #[test]
    fn happy_path_close_with_save() {
        let mut sm = CloseStateMachine::new();
        assert_eq!(sm.state(), CloseState::Idle);
        sm.transition(CloseState::CloseRequested).unwrap();
        sm.transition(CloseState::PromptOpen).unwrap();
        sm.transition(CloseState::ForceClose).unwrap();
        sm.transition(CloseState::WatchersCleaned).unwrap();
        sm.transition(CloseState::WindowDestroyed).unwrap();
        assert!(sm.is_terminal());
    }

    #[test]
    fn fast_path_force_close_no_unsaved() {
        let mut sm = CloseStateMachine::new();
        sm.transition(CloseState::CloseRequested).unwrap();
        sm.transition(CloseState::ForceClose).unwrap();
        sm.transition(CloseState::WatchersCleaned).unwrap();
        sm.transition(CloseState::WindowDestroyed).unwrap();
        assert!(sm.is_terminal());
    }

    #[test]
    fn cancel_path_short_circuits() {
        let mut sm = CloseStateMachine::new();
        sm.transition(CloseState::CloseRequested).unwrap();
        sm.transition(CloseState::PromptOpen).unwrap();
        sm.transition(CloseState::CloseCancelled).unwrap();
        assert!(sm.is_terminal());
    }

    #[test]
    fn save_failed_can_retry() {
        let mut sm = CloseStateMachine::new();
        sm.transition(CloseState::CloseRequested).unwrap();
        sm.transition(CloseState::PromptOpen).unwrap();
        sm.transition(CloseState::SaveFailed).unwrap();
        sm.transition(CloseState::PromptOpen).unwrap();
        sm.transition(CloseState::ForceClose).unwrap();
        sm.transition(CloseState::WatchersCleaned).unwrap();
        sm.transition(CloseState::WindowDestroyed).unwrap();
    }

    #[test]
    fn invalid_skip_destroyed_returns_err() {
        let mut sm = CloseStateMachine::new();
        let err = sm
            .transition(CloseState::WindowDestroyed)
            .expect_err("Idle → WindowDestroyed must be invalid");
        assert_eq!(err.from, CloseState::Idle);
        assert_eq!(err.to, CloseState::WindowDestroyed);
    }

    #[test]
    fn invalid_skip_watchers_cleaned() {
        let mut sm = CloseStateMachine::new();
        sm.transition(CloseState::CloseRequested).unwrap();
        sm.transition(CloseState::ForceClose).unwrap();
        // Skip WatchersCleaned → must be invalid (V-M-001 contract:
        // watchers MUST be cleaned before destroy).
        let err = sm
            .transition(CloseState::WindowDestroyed)
            .expect_err("ForceClose → WindowDestroyed must be invalid");
        assert!(err.reason.contains("not in close-lifecycle diagram"));
    }

    #[test]
    fn terminal_states_have_no_outgoing_edges() {
        for terminal in [CloseState::CloseCancelled, CloseState::WindowDestroyed] {
            for to in [
                CloseState::Idle,
                CloseState::CloseRequested,
                CloseState::PromptOpen,
                CloseState::ForceClose,
                CloseState::WatchersCleaned,
            ] {
                assert!(
                    !is_valid_transition(terminal, to),
                    "{terminal:?} → {to:?} must be invalid"
                );
            }
        }
    }

    #[test]
    fn block_marker_is_stable() {
        // Snapshot test: V-M-001 trace consumers depend on these literals.
        assert_eq!(CloseState::Idle.block_marker(), "BLOCK_CLOSE_IDLE");
        assert_eq!(
            CloseState::CloseRequested.block_marker(),
            "BLOCK_CLOSE_REQUESTED"
        );
        assert_eq!(CloseState::PromptOpen.block_marker(), "BLOCK_PROMPT_OPEN");
        assert_eq!(CloseState::SaveFailed.block_marker(), "BLOCK_SAVE_FAILED");
        assert_eq!(
            CloseState::CloseCancelled.block_marker(),
            "BLOCK_CLOSE_CANCELLED"
        );
        assert_eq!(CloseState::ForceClose.block_marker(), "BLOCK_FORCE_CLOSE");
        assert_eq!(
            CloseState::WatchersCleaned.block_marker(),
            "BLOCK_WATCHERS_CLEANED"
        );
        assert_eq!(
            CloseState::WindowDestroyed.block_marker(),
            "BLOCK_WINDOW_DESTROYED"
        );
    }

    // ── menu generation counter ─────────────────────────────────────
    // Note: tests share a process-global atomic; they MUST coordinate.
    // Using _reset_menu_generation_for_test() at the top of each.
    // serial_test crate would be the textbook fix; the manual approach
    // works at this stub level.

    #[test]
    fn menu_generation_starts_zero_after_reset() {
        let _g = _menu_test_lock().lock().unwrap();
        _reset_menu_generation_for_test();
        assert_eq!(current_menu_generation(), 0);
    }

    #[test]
    fn bump_increments_and_returns_next() {
        let _g = _menu_test_lock().lock().unwrap();
        _reset_menu_generation_for_test();
        let next = bump_menu_generation();
        assert_eq!(next, 1);
        let after = bump_menu_generation();
        assert_eq!(after, 2);
        assert_eq!(current_menu_generation(), 2);
    }

    #[test]
    fn check_stale_detects_old_generation() {
        let _g = _menu_test_lock().lock().unwrap();
        _reset_menu_generation_for_test();
        bump_menu_generation(); // current = 1
        bump_menu_generation(); // current = 2
        assert!(check_stale(0), "gen 0 must be stale when current is 2");
        assert!(check_stale(1), "gen 1 must be stale when current is 2");
        assert!(!check_stale(2), "gen 2 must not be stale when current is 2");
    }

    // ── replay policy ───────────────────────────────────────────────
    #[test]
    fn replay_policy_replay_always_delivers() {
        for s in [
            CloseState::Idle,
            CloseState::PromptOpen,
            CloseState::WindowDestroyed,
        ] {
            assert!(should_deliver(ReplayPolicy::Replay, s));
        }
    }

    #[test]
    fn replay_policy_drop_after_cleanup_terminal_drops() {
        for s in [
            CloseState::ForceClose,
            CloseState::WatchersCleaned,
            CloseState::WindowDestroyed,
            CloseState::CloseCancelled,
        ] {
            assert!(!should_deliver(ReplayPolicy::DropAfterCleanup, s));
        }
        for s in [
            CloseState::Idle,
            CloseState::CloseRequested,
            CloseState::PromptOpen,
            CloseState::SaveFailed,
        ] {
            assert!(should_deliver(ReplayPolicy::DropAfterCleanup, s));
        }
    }

    #[test]
    fn replay_policy_drop_if_busy_only_idle_delivers() {
        assert!(should_deliver(ReplayPolicy::DropIfBusy, CloseState::Idle));
        for s in [
            CloseState::CloseRequested,
            CloseState::PromptOpen,
            CloseState::SaveFailed,
            CloseState::ForceClose,
            CloseState::WatchersCleaned,
            CloseState::WindowDestroyed,
            CloseState::CloseCancelled,
        ] {
            assert!(!should_deliver(ReplayPolicy::DropIfBusy, s));
        }
    }
}
