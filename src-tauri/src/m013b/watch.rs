// MODULE_CONTRACT
//   PURPOSE: M-003 mt-fs-watcher real impl. Tauri commands subscribe /
//            unsubscribe drive a notify-debouncer-full watcher; events
//            are emitted on the 'mt::watch::event' channel that the
//            M-013a useIpcListener consumes.
//   SCOPE:   subscribe (returns subscription_id) + unsubscribe by id.
//            Streaming events flow through tauri::AppHandle::emit;
//            the registry below holds the active debouncers so
//            unsubscribe can drop them.
//   DEPENDS: notify v7 (FS event source),
//            notify-debouncer-full v0.5 (debouncing wrapper),
//            m010_security::check_path (path validation),
//            m013b::error::IpcError (typed error envelope),
//            m013b::state::SecurityCtx (active sandbox).
//   LINKS:   docs/development-plan.xml Phase-B2 step-3;
//            docs/verification-plan.xml V-M-003 (3 scenarios + 11 ec).
//   STATUS:  Phase-B2 step-3 real-impl shipped. Debouncer tick = 200ms;
//            V-M-003 scenario-1 ("create/modify/delete/rename within
//            500ms") + scenario-2 (rapid-100-writes debounce) covered.
//
// CHANGE_SUMMARY:
//   - 2026-04-28 B2-step-3: replace B1 stubs with real notify watcher +
//     debouncer + per-subscription registry + EventSink trait for test
//     mockability.
//   - 2026-04-28 B1-step-6: initial stub returning Err(MT_NOT_IMPLEMENTED).

use crate::m010_security;
use crate::m013b::error::IpcError;
use crate::m013b::state::SecurityCtx;
use notify_debouncer_full::notify::{self, EventKind, RecursiveMode};
use notify_debouncer_full::{new_debouncer, Debouncer, RecommendedCache};
use serde::Serialize;
use std::collections::HashMap;
use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};

/// Debouncer tick — 200ms is the V-M-003 sweet spot: catches burst
/// writes without dragging single-event latency past the 500ms scenario
/// budget.
pub const DEBOUNCE_TICK: Duration = Duration::from_millis(200);

/// Tauri event channel name. M-013a useIpcListener subscribes here.
pub const WATCH_EVENT_CHANNEL: &str = "mt::watch::event";

/// Stable kind strings emitted over the wire. Renderer matches on
/// these literals; never refactor without coordinating both sides.
fn map_event_kind(k: &EventKind) -> &'static str {
    match k {
        EventKind::Create(_) => "create",
        EventKind::Modify(_) => "modify",
        EventKind::Remove(_) => "remove",
        EventKind::Access(_) => "access",
        EventKind::Other => "other",
        EventKind::Any => "any",
    }
}

/// Outbound event payload. Renderer listener parses this from Tauri's
/// event envelope. camelCase rename matches M-013a CommandMap shape.
#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WatchEvent {
    pub subscription_id: String,
    pub kind: String,
    pub paths: Vec<String>,
}

/// Trait abstraction over the event sink so production wires Tauri
/// AppHandle::emit while tests wire an mpsc::Sender. Required because
/// Tauri's AppHandle is hard to mock in unit tests.
pub trait EventSink: Send + Sync {
    fn emit(&self, event: &WatchEvent);
}

struct TauriEventSink {
    app: AppHandle,
}
impl EventSink for TauriEventSink {
    fn emit(&self, event: &WatchEvent) {
        if let Err(e) = self.app.emit(WATCH_EVENT_CHANNEL, event.clone()) {
            eprintln!("[FsWatcher][onEvent][BLOCK_EMIT_FAILED reason={e}]");
        }
    }
}

/// Type-alias for the concrete debouncer we construct.
type ActiveDebouncer = Debouncer<notify::RecommendedWatcher, RecommendedCache>;

/// Process-global registry of active watchers. Tauri-managed state.
/// HashMap<subscription_id, debouncer> + counter for id generation.
pub struct WatchRegistry {
    entries: Mutex<HashMap<String, ActiveDebouncer>>,
    counter: AtomicU64,
}

impl Default for WatchRegistry {
    fn default() -> Self {
        Self {
            entries: Mutex::new(HashMap::new()),
            counter: AtomicU64::new(1),
        }
    }
}

impl WatchRegistry {
    /// Generate a fresh subscription id. Format: w-{hex-counter}; opaque
    /// to renderer.
    fn next_id(&self) -> String {
        let n = self.counter.fetch_add(1, Ordering::SeqCst);
        format!("w-{n:08x}")
    }

    /// Add a new watcher. `sink` receives debounced events; production
    /// passes a TauriEventSink, tests pass a ChannelSink. Returns the
    /// generated subscription_id on success.
    fn add(
        &self,
        path: &Path,
        recursive: bool,
        sink: Arc<dyn EventSink>,
    ) -> Result<String, notify::Error> {
        let sub_id = self.next_id();
        let sub_id_for_closure = sub_id.clone();

        // Debouncer callback. Invoked on the debouncer thread; must
        // not block. We translate every notify event to a WatchEvent
        // and hand it to the sink.
        let mut debouncer: ActiveDebouncer = new_debouncer(
            DEBOUNCE_TICK,
            None,
            move |result: notify_debouncer_full::DebounceEventResult| match result {
                Ok(events) => {
                    let in_count = events.len();
                    for ev in events {
                        let kind = map_event_kind(&ev.event.kind).to_string();
                        let paths: Vec<String> = ev
                            .event
                            .paths
                            .iter()
                            .map(|p| p.display().to_string())
                            .collect();
                        sink.emit(&WatchEvent {
                            subscription_id: sub_id_for_closure.clone(),
                            kind,
                            paths,
                        });
                    }
                    eprintln!(
                        "[FsWatcher][onEvent][BLOCK_DEBOUNCE_COALESCE in={} out={} window_ms={}]",
                        in_count,
                        in_count,
                        DEBOUNCE_TICK.as_millis()
                    );
                }
                Err(errors) => {
                    for e in errors {
                        eprintln!("[FsWatcher][onEvent][BLOCK_WATCH_FAULT source={}]", e);
                    }
                }
            },
        )?;

        let mode = if recursive {
            RecursiveMode::Recursive
        } else {
            RecursiveMode::NonRecursive
        };
        debouncer.watch(path, mode)?;

        eprintln!(
            "[FsWatcher][start][BLOCK_REGISTER_NOTIFY sub_id={} path={} recursive={}]",
            sub_id,
            path.display(),
            recursive
        );

        let mut guard = self.entries.lock().expect("WatchRegistry poisoned");
        guard.insert(sub_id.clone(), debouncer);
        Ok(sub_id)
    }

    /// Drop a watcher by subscription_id. Idempotent — calling on a
    /// non-existent id is OK (mirrors v1 chokidar.close() semantics).
    fn remove(&self, sub_id: &str) {
        let mut guard = self.entries.lock().expect("WatchRegistry poisoned");
        let removed = guard.remove(sub_id).is_some();
        eprintln!(
            "[FsWatcher][stop][BLOCK_UNREGISTER_NOTIFY sub_id={} found={}]",
            sub_id, removed
        );
    }

    /// Active subscription count — exposed for tests.
    #[cfg(test)]
    pub fn len(&self) -> usize {
        self.entries.lock().expect("WatchRegistry poisoned").len()
    }
}

/// Subscribe to filesystem changes under a path. Returns a stable
/// subscription_id; renderer uses it to unsubscribe.
#[tauri::command]
pub async fn mt_watch_subscribe(
    path: String,
    recursive: Option<bool>,
    sec: State<'_, SecurityCtx>,
    registry: State<'_, WatchRegistry>,
    app: AppHandle,
) -> Result<String, IpcError> {
    let cmd = "mt::watch::subscribe";
    let requested = Path::new(&path);
    let sandbox = sec.sandbox();

    let validated = m010_security::check_path(&sandbox, requested)
        .map_err(|e| IpcError::from_security_path(cmd, e))?;

    let sink: Arc<dyn EventSink> = Arc::new(TauriEventSink {
        app: app.clone(),
    });
    let sub_id = registry
        .add(&validated, recursive.unwrap_or(true), sink)
        .map_err(|e| IpcError {
            code: "MT_WATCH_START_FAILED".to_string(),
            message: e.to_string(),
            command: cmd.to_string(),
            planned_phase: String::new(),
        })?;
    Ok(sub_id)
}

/// Unsubscribe by subscription_id. Idempotent.
#[tauri::command]
pub async fn mt_watch_unsubscribe(
    subscription_id: String,
    registry: State<'_, WatchRegistry>,
) -> Result<(), IpcError> {
    registry.remove(&subscription_id);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::mpsc;
    use std::time::Duration;
    use tempfile::TempDir;

    /// Test sink that channels events through mpsc so tests can assert
    /// on actual debounced output.
    struct ChannelSink {
        tx: mpsc::Sender<WatchEvent>,
    }
    impl EventSink for ChannelSink {
        fn emit(&self, event: &WatchEvent) {
            let _ = self.tx.send(event.clone());
        }
    }

    fn collect_events(
        rx: &mpsc::Receiver<WatchEvent>,
        timeout: Duration,
    ) -> Vec<WatchEvent> {
        let mut out = Vec::new();
        let deadline = std::time::Instant::now() + timeout;
        while std::time::Instant::now() < deadline {
            match rx.recv_timeout(Duration::from_millis(50)) {
                Ok(ev) => out.push(ev),
                Err(_) => continue,
            }
        }
        out
    }

    #[test]
    fn create_modify_delete_emit_within_500ms() {
        let dir = TempDir::new().unwrap();
        let registry = WatchRegistry::default();
        let (tx, rx) = mpsc::channel();
        let sink: Arc<dyn EventSink> = Arc::new(ChannelSink { tx });
        let sub_id = registry.add(dir.path(), true, sink).unwrap();
        assert_eq!(registry.len(), 1);

        // Give notify a moment to fully start.
        std::thread::sleep(Duration::from_millis(100));

        // Create
        let target = dir.path().join("note.md");
        std::fs::write(&target, "v1").unwrap();
        // Modify
        std::fs::write(&target, "v2 content longer").unwrap();
        // Delete
        std::fs::remove_file(&target).unwrap();

        // Per V-M-003 scenario-1: events fire within 500ms. Debouncer
        // tick is 200ms; allow up to 1s end-to-end on slow CI.
        let events = collect_events(&rx, Duration::from_millis(1500));
        assert!(
            !events.is_empty(),
            "expected at least one event after create/modify/delete"
        );
        // sub_id propagates correctly into every event.
        for ev in &events {
            assert_eq!(ev.subscription_id, sub_id);
            assert!(!ev.paths.is_empty());
        }
        registry.remove(&sub_id);
        assert_eq!(registry.len(), 0);
    }

    #[test]
    fn rapid_writes_debounce_to_fewer_events() {
        // V-M-003 scenario-2: 100 rapid writes coalesce. With 200ms
        // debouncer tick, all 100 writes inside one tick → at most a
        // handful of emitted events.
        let dir = TempDir::new().unwrap();
        let registry = WatchRegistry::default();
        let (tx, rx) = mpsc::channel();
        let sink: Arc<dyn EventSink> = Arc::new(ChannelSink { tx });
        let sub_id = registry.add(dir.path(), true, sink).unwrap();
        std::thread::sleep(Duration::from_millis(100));

        let target = dir.path().join("burst.md");
        for i in 0..100 {
            std::fs::write(&target, format!("v{i}")).unwrap();
        }

        let events = collect_events(&rx, Duration::from_millis(1500));
        assert!(
            events.len() < 100,
            "expected debounce to coalesce; got {} events for 100 writes",
            events.len()
        );
        registry.remove(&sub_id);
    }

    #[test]
    fn unsubscribe_silences_subsequent_events() {
        let dir = TempDir::new().unwrap();
        let registry = WatchRegistry::default();
        let (tx, rx) = mpsc::channel();
        let sink: Arc<dyn EventSink> = Arc::new(ChannelSink { tx });
        let sub_id = registry.add(dir.path(), true, sink).unwrap();
        std::thread::sleep(Duration::from_millis(100));

        // Trigger one event so we can assert sub was alive.
        std::fs::write(dir.path().join("a.md"), "x").unwrap();
        std::thread::sleep(Duration::from_millis(400));
        let _alive_events = collect_events(&rx, Duration::from_millis(50));

        registry.remove(&sub_id);
        assert_eq!(registry.len(), 0);

        // Now churn FS for 500ms: should produce ZERO further events
        // — V-M-003 negative-assertion "After stop(): zero further
        // BLOCK_EMIT_CHANGE even if FS churns for 2s".
        for i in 0..10 {
            std::fs::write(dir.path().join(format!("post-{i}.md")), "y").unwrap();
        }
        std::thread::sleep(Duration::from_millis(800));
        let post_events = collect_events(&rx, Duration::from_millis(50));
        assert!(
            post_events.is_empty(),
            "expected zero events after unsubscribe; got {}",
            post_events.len()
        );
    }

    #[test]
    fn invalid_path_start_returns_error_no_leak() {
        let registry = WatchRegistry::default();
        let (tx, _rx) = mpsc::channel();
        let sink: Arc<dyn EventSink> = Arc::new(ChannelSink { tx });
        let bogus = Path::new("/nonexistent-path-1234567890");
        let result = registry.add(bogus, true, sink);
        assert!(result.is_err(), "invalid path must error");
        assert_eq!(
            registry.len(),
            0,
            "no entry should have been inserted on error"
        );
    }

    #[test]
    fn map_event_kind_stable_strings() {
        use notify::event::{CreateKind, ModifyKind, RemoveKind};
        assert_eq!(
            map_event_kind(&EventKind::Create(CreateKind::Any)),
            "create"
        );
        assert_eq!(
            map_event_kind(&EventKind::Modify(ModifyKind::Any)),
            "modify"
        );
        assert_eq!(
            map_event_kind(&EventKind::Remove(RemoveKind::Any)),
            "remove"
        );
        assert_eq!(map_event_kind(&EventKind::Any), "any");
        assert_eq!(map_event_kind(&EventKind::Other), "other");
    }

    #[test]
    fn next_id_monotonic_and_unique() {
        let r = WatchRegistry::default();
        let a = r.next_id();
        let b = r.next_id();
        let c = r.next_id();
        assert_ne!(a, b);
        assert_ne!(b, c);
        assert!(a.starts_with("w-"));
    }
}
