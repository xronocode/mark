// FILE: src-tauri/src/m047_bookmarks.rs
// VERSION: 1.3.0
// START_MODULE_CONTRACT
//   PURPOSE: M-047 security-scoped bookmarks (C-15 T-113). Persists macOS
//            sandbox access grants so recent files / folders reopen across
//            relaunches after LaunchServices document grants expire.
//   SCOPE: remember(path) at grant moments (recent-add, folder pick, CLI
//          boot); ensure_access(path) as a pre-read rescue hook in m013b
//          fs read/readdir. JSON store at data_root()/security-bookmarks.json.
//          Atomic sibling snapshot replacement precedes in-memory updates;
//          failures queue a main-renderer notice without denying current access.
//          Non-macOS: remember succeeds without work; access hooks are no-ops.
//   DEPENDS: mt_paths::data_root; serde/serde_json; core-foundation
//            (macOS only — already in the tree via cocoa).
//   LINKS: .grace/changes/archive/C-15/plan.xml T-113; M-013-B fs hooks;
//          M-017 recent docs; M-022 mt-paths data_root.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   BookmarkError - typed creation, state, serialization and persistence failure.
//   remember - atomically persist a granted bookmark or return a typed failure
//   report_persistence_failure - queue a content-free warning while keeping current access
//   install_warning_notifier - install the main-renderer wakeup callback
//   take_persistence_warning - consume a pending warning only for the main window.
//   ensure_access - resolve/refresh a stored bookmark, start accessing, return the path
//   ensure_access_for_write - C-24: start the scope of the nearest bookmarked ancestor before a write
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-11-15 C-BOOKMARK-PERSISTENCE-DURABILITY: atomic snapshot commit
//     before memory/eviction; typed failures and queued visible warnings.
//   - 2026-09-21 C-15 T-113: initial module — sandbox persistence for
//     App Store builds; zero behavior change for non-MAS (no bookmark →
//     path passes through unchanged).
//   - 2026-10-13 C-24: ensure_access_for_write + covering_ancestor (folder
//     grants cover assets/ writes beside a document).
//   - 2026-09-29: header normalized to canonical START/END contract
//     form (grace lint closure).
// END_CHANGE_SUMMARY

use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

const STORE_FILE: &str = "security-bookmarks.json";
const STORE_VERSION: u32 = 1;
const MAX_STORED: usize = 256;

#[derive(Clone, serde::Serialize, serde::Deserialize)]
struct Store {
    version: u32,
    bookmarks: HashMap<String, String>,
}

impl Default for Store {
    fn default() -> Self {
        Store {
            version: STORE_VERSION,
            bookmarks: HashMap::new(),
        }
    }
}

fn store_path() -> Option<PathBuf> {
    crate::mt_paths::data_root().map(|d| d.join(STORE_FILE))
}

fn state() -> &'static Mutex<Store> {
    static STATE: OnceLock<Mutex<Store>> = OnceLock::new();
    STATE.get_or_init(|| {
        let loaded = store_path()
            .and_then(|p| std::fs::read_to_string(p).ok())
            .and_then(|s| serde_json::from_str::<Store>(&s).ok())
            .filter(|s| s.version == STORE_VERSION);
        Mutex::new(loaded.unwrap_or_default())
    })
}

fn active_set() -> &'static Mutex<HashSet<String>> {
    static ACTIVE: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
    ACTIVE.get_or_init(|| Mutex::new(HashSet::new()))
}

// START_BLOCK_BOOKMARK_TRANSACTION
/// Typed failure; Display deliberately excludes paths, bookmark bytes and OS details.
#[derive(Debug)]
pub enum BookmarkError {
    DataRootUnavailable,
    CreateBookmark,
    StateUnavailable,
    Serialize(serde_json::Error),
    Io {
        stage: &'static str,
        source: std::io::Error,
    },
}

impl std::fmt::Display for BookmarkError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let stage = match self {
            Self::DataRootUnavailable => "data root",
            Self::CreateBookmark => "bookmark creation",
            Self::StateUnavailable => "store lock",
            Self::Serialize(_) => "serialization",
            Self::Io { stage, .. } => stage,
        };
        write!(f, "Bookmark permission could not be saved ({stage})")
    }
}

impl std::error::Error for BookmarkError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Serialize(error) => Some(error),
            Self::Io { source, .. } => Some(source),
            _ => None,
        }
    }
}

struct OwnedCandidate {
    path: PathBuf,
    file: Option<std::fs::File>,
    committed: bool,
}

impl Drop for OwnedCandidate {
    fn drop(&mut self) {
        // Close before unlink, including when write/sync returned early.
        self.file.take();
        if !self.committed {
            if let Err(error) = std::fs::remove_file(&self.path) {
                if error.kind() != std::io::ErrorKind::NotFound {
                    safe_eprintln!(
                        "[SecurityBookmarks][cleanup][BLOCK_BOOKMARK_TEMP_CLEANUP_FAILED]"
                    );
                }
            }
        }
    }
}

fn new_candidate(parent: &std::path::Path) -> Result<OwnedCandidate, BookmarkError> {
    use std::sync::atomic::{AtomicU64, Ordering};
    static SEQUENCE: AtomicU64 = AtomicU64::new(0);
    for _ in 0..32 {
        let sequence = SEQUENCE.fetch_add(1, Ordering::Relaxed);
        let path = parent.join(format!(
            ".{STORE_FILE}-{}-{sequence}.tmp",
            std::process::id()
        ));
        let mut options = std::fs::OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        match options.open(&path) {
            Ok(file) => {
                return Ok(OwnedCandidate {
                    path,
                    file: Some(file),
                    committed: false,
                })
            }
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(source) => {
                return Err(BookmarkError::Io {
                    stage: "create",
                    source,
                })
            }
        }
    }
    Err(BookmarkError::Io {
        stage: "create",
        source: std::io::Error::new(
            std::io::ErrorKind::AlreadyExists,
            "candidate names occupied",
        ),
    })
}

fn write_synced(file: &mut std::fs::File, bytes: &[u8]) -> Result<(), BookmarkError> {
    use std::io::Write;
    file.write_all(bytes).map_err(|source| BookmarkError::Io {
        stage: "write",
        source,
    })?;
    file.sync_all().map_err(|source| BookmarkError::Io {
        stage: "sync",
        source,
    })
}

fn replace_snapshot(
    candidate: &std::path::Path,
    path: &std::path::Path,
) -> Result<(), BookmarkError> {
    std::fs::rename(candidate, path).map_err(|source| BookmarkError::Io {
        stage: "replace",
        source,
    })
}

fn persist_candidate<W, R>(
    store: &Store,
    path: &std::path::Path,
    write: W,
    replace: R,
) -> Result<(), BookmarkError>
where
    W: FnOnce(&mut std::fs::File, &[u8]) -> Result<(), BookmarkError>,
    R: FnOnce(&std::path::Path, &std::path::Path) -> Result<(), BookmarkError>,
{
    let bytes = serde_json::to_vec_pretty(store).map_err(BookmarkError::Serialize)?;
    let parent = path.parent().ok_or(BookmarkError::DataRootUnavailable)?;
    std::fs::create_dir_all(parent).map_err(|source| BookmarkError::Io {
        stage: "directory",
        source,
    })?;
    let mut candidate = new_candidate(parent)?;
    write(
        candidate
            .file
            .as_mut()
            .expect("new candidate owns its file"),
        &bytes,
    )?;
    candidate.file.take();
    // Commit point: nothing fallible follows successful replacement.
    replace(&candidate.path, path)?;
    candidate.committed = true;
    Ok(())
}

fn persist_at(store: &Store, path: &std::path::Path) -> Result<(), BookmarkError> {
    persist_candidate(store, path, write_synced, replace_snapshot)
}

fn remember_blob<F>(
    store: &mut Store,
    path: &str,
    blob: &[u8],
    persist: F,
) -> Result<(), BookmarkError>
where
    F: FnOnce(&Store) -> Result<(), BookmarkError>,
{
    let mut candidate = store.clone();
    if !candidate.bookmarks.contains_key(path) && candidate.bookmarks.len() >= MAX_STORED {
        // Preserve the existing arbitrary eviction policy, only at commit.
        if let Some(key) = candidate.bookmarks.keys().next().cloned() {
            candidate.bookmarks.remove(&key);
        }
    }
    candidate
        .bookmarks
        .insert(path.to_string(), b64_encode(blob));
    persist(&candidate)?;
    *store = candidate;
    Ok(())
}

/// Record future access without denying the OS-granted access already in use.
/// Non-macOS remains a successful no-op. Callers must consume a failure.
pub fn remember(path: &str) -> Result<(), BookmarkError> {
    #[cfg(target_os = "macos")]
    {
        let blob = imp::create_bookmark(path).ok_or(BookmarkError::CreateBookmark)?;
        let target = store_path().ok_or(BookmarkError::DataRootUnavailable)?;
        let mut store = state()
            .lock()
            .map_err(|_| BookmarkError::StateUnavailable)?;
        remember_blob(&mut store, path, &blob, |candidate| {
            persist_at(candidate, &target)
        })
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = path;
        Ok(())
    }
}
// END_BLOCK_BOOKMARK_TRANSACTION

// START_BLOCK_BOOKMARK_WARNING_QUEUE
static WARNING_PENDING: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
static WARNING_NOTIFIER: OnceLock<Box<dyn Fn() + Send + Sync>> = OnceLock::new();

pub fn install_warning_notifier(notify: impl Fn() + Send + Sync + 'static) {
    let _ = WARNING_NOTIFIER.set(Box::new(notify));
}

pub fn report_persistence_failure(error: &BookmarkError) {
    safe_eprintln!("[SecurityBookmarks][persist][BLOCK_BOOKMARK_PERSIST_FAILED reason={error}]");
    WARNING_PENDING.store(true, std::sync::atomic::Ordering::SeqCst);
    if let Some(notify) = WARNING_NOTIFIER.get() {
        notify();
    }
}

pub fn take_persistence_warning(window_label: &str) -> bool {
    // Settings has a separate Pinia store and no mounted notification stack.
    // Only the window that can render the visible notice owns consumption.
    window_label == "main" && WARNING_PENDING.swap(false, std::sync::atomic::Ordering::SeqCst)
}
// END_BLOCK_BOOKMARK_WARNING_QUEUE

/// Pre-read rescue hook: if a bookmark exists for `path`, resolve it
/// (refreshing when stale), start the security scope, and return the
/// (possibly refreshed) path. Otherwise return the input unchanged.
pub fn ensure_access(path: &str) -> String {
    #[cfg(target_os = "macos")]
    {
        let b64 = {
            let st = state().lock().unwrap();
            st.bookmarks.get(path).cloned()
        };
        if let Some(b64) = b64 {
            if let Some(blob) = b64_decode(&b64) {
                if let Some(resolved) = imp::resolve_bookmark(&blob) {
                    let resolved_str = resolved.to_string_lossy().into_owned();
                    let mut active = active_set().lock().unwrap();
                    if active.insert(resolved_str.clone()) {
                        imp::start_accessing(&resolved);
                    }
                    // refresh stale bookmarks so moves survive
                    if resolved_str != path {
                        if let Err(error) = remember(&resolved_str) {
                            report_persistence_failure(&error);
                        }
                    }
                    return resolved_str;
                }
            }
        }
    }
    path.to_string()
}

// START_BLOCK_WRITE_ACCESS_COVERING
/// C-24: before a write (assets/ image, mkdir, copy), regain access through
/// the bookmark of the nearest granted ancestor folder. A file grant alone
/// does not cover its siblings in the sandbox; a folder grant covers the
/// whole subtree. No covering bookmark → nothing to do (non-MAS writes and
/// already-active scopes pass through).
pub fn ensure_access_for_write(path: &str) {
    #[cfg(target_os = "macos")]
    {
        let anc = {
            let st = state().lock().unwrap();
            covering_ancestor(path, st.bookmarks.keys())
        };
        if let Some(anc) = anc {
            // Already started this session: no re-resolve, no store write.
            let started = active_set().lock().unwrap().contains(&anc);
            if !started {
                ensure_access(&anc);
            }
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = path;
    }
}

/// The longest stored key that is `path` itself or a parent folder of it.
pub(crate) fn covering_ancestor<'a, I>(path: &str, keys: I) -> Option<String>
where
    I: IntoIterator<Item = &'a String>,
{
    keys.into_iter()
        .filter(|k| {
            let k = k.trim_end_matches('/');
            !k.is_empty() && (path == k || path.starts_with(&format!("{k}/")))
        })
        .max_by_key(|k| k.len())
        .cloned()
}
// END_BLOCK_WRITE_ACCESS_COVERING

// -- pure helpers (tested on all platforms) --

fn b64_encode(data: &[u8]) -> String {
    data.iter()
        .fold(String::with_capacity(data.len() * 4 / 3 + 4), |mut s, b| {
            s.push_str(&format!("{b:02x}"));
            s
        })
}

fn b64_decode(hex: &str) -> Option<Vec<u8>> {
    if hex.len() % 2 != 0 {
        return None;
    }
    (0..hex.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&hex[i..i + 2], 16).ok())
        .collect()
}

// -- macOS implementation via core-foundation --

#[cfg(target_os = "macos")]
mod imp {
    use core_foundation::base::{kCFAllocatorDefault, TCFType};
    use core_foundation::data::CFData;
    use core_foundation::error::CFError;
    use core_foundation::string::CFString;
    use core_foundation::url::CFURL;
    use core_foundation_sys::url::{
        kCFURLBookmarkCreationWithSecurityScope, kCFURLBookmarkResolutionWithSecurityScope,
        CFURLCreateBookmarkData, CFURLCreateByResolvingBookmarkData,
        CFURLStartAccessingSecurityScopedResource,
    };
    use std::path::{Path, PathBuf};

    fn cfurl(path: &Path) -> CFURL {
        let s = CFString::new(&path.to_string_lossy());
        CFURL::from_file_system_path(s, core_foundation_sys::url::kCFURLPOSIXPathStyle, true)
    }

    pub fn create_bookmark(path: &str) -> Option<Vec<u8>> {
        let url = cfurl(Path::new(path));
        let mut err: core_foundation_sys::error::CFErrorRef = std::ptr::null_mut();
        let data_ref = unsafe {
            CFURLCreateBookmarkData(
                kCFAllocatorDefault,
                url.as_concrete_TypeRef(),
                kCFURLBookmarkCreationWithSecurityScope,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                &mut err,
            )
        };
        if data_ref.is_null() {
            if !err.is_null() {
                unsafe { CFError::wrap_under_create_rule(err) };
            }
            return None;
        }
        let data = unsafe { CFData::wrap_under_create_rule(data_ref) };
        Some(data.bytes().to_vec())
    }

    pub fn resolve_bookmark(blob: &[u8]) -> Option<PathBuf> {
        let data = CFData::from_buffer(blob);
        let mut stale: core_foundation_sys::base::Boolean = 0;
        let mut err: core_foundation_sys::error::CFErrorRef = std::ptr::null_mut();
        let url_ref = unsafe {
            CFURLCreateByResolvingBookmarkData(
                kCFAllocatorDefault,
                data.as_concrete_TypeRef(),
                kCFURLBookmarkResolutionWithSecurityScope,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                &mut stale,
                &mut err,
            )
        };
        if url_ref.is_null() {
            if !err.is_null() {
                unsafe { CFError::wrap_under_create_rule(err) };
            }
            return None;
        }
        let url = unsafe { CFURL::wrap_under_create_rule(url_ref) };
        url.to_path()
    }

    pub fn start_accessing(path: &Path) {
        let url = cfurl(path);
        unsafe {
            CFURLStartAccessingSecurityScopedResource(url.as_concrete_TypeRef());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hex_round_trip() {
        let blob = vec![0u8, 1, 2, 255, 16];
        let enc = b64_encode(&blob);
        assert_eq!(b64_decode(&enc).unwrap(), blob);
        assert!(b64_decode("abc").is_none()); // odd length
        assert!(b64_decode("zz").is_none()); // non-hex
    }

    #[test]
    fn covering_ancestor_picks_the_nearest_granted_folder() {
        let keys: Vec<String> = vec![
            "/Users/me".into(),
            "/Users/me/notes".into(),
            "/Users/me/notes/doc.md".into(),
            "/Users/me/notes-old".into(),
        ];
        assert_eq!(
            covering_ancestor("/Users/me/notes/assets/x.png", &keys).as_deref(),
            Some("/Users/me/notes")
        );
        assert_eq!(
            covering_ancestor("/Users/me/notes", &keys).as_deref(),
            Some("/Users/me/notes")
        );
        // a sibling with a shared prefix is not an ancestor
        assert_eq!(
            covering_ancestor("/Users/me/notes-older/a", &keys).as_deref(),
            Some("/Users/me")
        );
        assert_eq!(covering_ancestor("/tmp/a.png", &keys), None);
        let trailing: Vec<String> = vec!["/Users/me/notes/".into()];
        assert_eq!(
            covering_ancestor("/Users/me/notes/assets", &trailing).as_deref(),
            Some("/Users/me/notes/")
        );
    }

    #[test]
    fn store_version_default_matches_const() {
        let st = Store::default();
        assert_eq!(st.version, STORE_VERSION);
        assert!(st.bookmarks.is_empty());
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn native_bookmark_persist_and_resolve_round_trip() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("probe.md");
        std::fs::write(&file, "hi").unwrap();
        let path = file.to_str().unwrap();
        let blob = imp::create_bookmark(path).expect("real CF bookmark");
        let target = dir.path().join(STORE_FILE);
        let mut store = Store::default();
        remember_blob(&mut store, path, &blob, |candidate| {
            persist_at(candidate, &target)
        })
        .unwrap();
        let loaded: Store = serde_json::from_slice(&std::fs::read(&target).unwrap()).unwrap();
        let blob = b64_decode(loaded.bookmarks.get(path).unwrap()).unwrap();
        assert_eq!(
            imp::resolve_bookmark(&blob)
                .unwrap()
                .canonicalize()
                .unwrap(),
            file.canonicalize().unwrap()
        );
    }

    fn seeded_store() -> Store {
        Store {
            version: STORE_VERSION,
            bookmarks: HashMap::from([("/existing.md".into(), "0011".into())]),
        }
    }

    #[test]
    fn failed_replacement_keeps_snapshot_and_memory_and_removes_owned_temp() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(STORE_FILE);
        let unrelated = dir.path().join("unrelated.tmp");
        std::fs::write(&unrelated, b"unrelated survives").unwrap();
        let mut store = seeded_store();
        let original = serde_json::to_vec_pretty(&store).unwrap();
        std::fs::write(&path, &original).unwrap();
        let result = remember_blob(&mut store, "/new.md", &[3, 4], |candidate| {
            persist_candidate(candidate, &path, write_synced, |_, _| {
                Err(BookmarkError::Io {
                    stage: "replace",
                    source: std::io::Error::other("injected rename failure"),
                })
            })
        });
        assert!(result.is_err());
        assert_eq!(serde_json::to_vec_pretty(&store).unwrap(), original);
        assert_eq!(std::fs::read(&path).unwrap(), original);
        assert_eq!(std::fs::read(&unrelated).unwrap(), b"unrelated survives");
        assert_eq!(std::fs::read_dir(dir.path()).unwrap().count(), 2);
    }

    #[test]
    fn partial_write_and_sync_failure_preserve_previous_disk_and_memory() {
        for stage in ["write", "sync"] {
            let dir = tempfile::tempdir().unwrap();
            let path = dir.path().join(STORE_FILE);
            let mut store = seeded_store();
            let original = serde_json::to_vec_pretty(&store).unwrap();
            std::fs::write(&path, &original).unwrap();
            let result = remember_blob(&mut store, "/new.md", &[5, 6], |candidate| {
                persist_candidate(
                    candidate,
                    &path,
                    |file, bytes| {
                        use std::io::Write;
                        let len = if stage == "write" {
                            bytes.len() / 2
                        } else {
                            bytes.len()
                        };
                        file.write_all(&bytes[..len]).unwrap();
                        Err(BookmarkError::Io {
                            stage,
                            source: std::io::Error::other("injected I/O failure"),
                        })
                    },
                    replace_snapshot,
                )
            });
            assert!(
                matches!(result, Err(BookmarkError::Io { stage: actual, .. }) if actual == stage)
            );
            assert_eq!(serde_json::to_vec_pretty(&store).unwrap(), original);
            assert_eq!(std::fs::read(&path).unwrap(), original);
            assert_eq!(std::fs::read_dir(dir.path()).unwrap().count(), 1);
        }
    }

    #[test]
    fn directory_target_and_parent_file_leave_memory_unchanged() {
        let dir = tempfile::tempdir().unwrap();
        let target_dir = dir.path().join("directory-target");
        std::fs::create_dir(&target_dir).unwrap();
        let parent_file = dir.path().join("parent-file");
        std::fs::write(&parent_file, b"parent survives").unwrap();
        for path in [target_dir.clone(), parent_file.join(STORE_FILE)] {
            let mut store = seeded_store();
            let original = serde_json::to_vec(&store).unwrap();
            assert!(
                remember_blob(&mut store, "/new.md", &[7], |candidate| persist_at(
                    candidate, &path
                ))
                .is_err()
            );
            assert_eq!(serde_json::to_vec(&store).unwrap(), original);
        }
        assert!(target_dir.is_dir());
        assert_eq!(std::fs::read(parent_file).unwrap(), b"parent survives");
        assert_eq!(std::fs::read_dir(dir.path()).unwrap().count(), 2);
    }

    #[test]
    fn successful_insert_update_and_reload_keep_schema_and_private_temp_cleanup() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("nested").join(STORE_FILE);
        let mut store = seeded_store();
        remember_blob(&mut store, "/new.md", &[9, 10], |candidate| {
            persist_at(candidate, &path)
        })
        .unwrap();
        remember_blob(&mut store, "/new.md", &[11], |candidate| {
            persist_at(candidate, &path)
        })
        .unwrap();
        let loaded: Store = serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
        assert_eq!(loaded.version, 1);
        assert_eq!(loaded.bookmarks, store.bookmarks);
        assert_eq!(loaded.bookmarks.get("/new.md").unwrap(), "0b");
        assert_eq!(loaded.bookmarks.get("/existing.md").unwrap(), "0011");
        assert_eq!(
            std::fs::read_dir(path.parent().unwrap()).unwrap().count(),
            1
        );
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(
                std::fs::metadata(&path).unwrap().permissions().mode() & 0o777,
                0o600
            );
        }
    }

    #[test]
    fn eviction_and_existing_key_update_commit_only_on_success() {
        let mut store = Store::default();
        for i in 0..MAX_STORED {
            store.bookmarks.insert(format!("/doc-{i}"), "00".into());
        }
        let original = store.bookmarks.clone();
        let failure = remember_blob(&mut store, "/new.md", &[1], |_| {
            Err(BookmarkError::DataRootUnavailable)
        });
        assert!(failure.is_err());
        assert_eq!(store.bookmarks, original);
        remember_blob(&mut store, "/doc-0", &[2], |_| Ok(())).unwrap();
        assert_eq!(store.bookmarks.len(), MAX_STORED);
        assert_eq!(store.bookmarks.get("/doc-0").unwrap(), "02");
        remember_blob(&mut store, "/new.md", &[3], |_| Ok(())).unwrap();
        assert_eq!(store.bookmarks.len(), MAX_STORED);
        assert_eq!(store.bookmarks.get("/new.md").unwrap(), "03");
    }

    #[test]
    fn failure_warning_is_content_free_and_consumed_once() {
        while take_persistence_warning("main") {}
        let error = BookmarkError::Io {
            stage: "write",
            source: std::io::Error::other("sensitive fixture details"),
        };
        report_persistence_failure(&error);
        report_persistence_failure(&error);
        assert!(!take_persistence_warning("settings"));
        assert!(!take_persistence_warning("other"));
        assert!(!take_persistence_warning(""));
        assert!(take_persistence_warning("main"));
        assert!(!take_persistence_warning("main"));
        assert!(!error.to_string().contains("sensitive"));
    }
}
