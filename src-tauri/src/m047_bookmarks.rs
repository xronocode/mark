// MODULE_CONTRACT
//   PURPOSE: M-047 security-scoped bookmarks (C-15 T-M3). Persists macOS
//            sandbox access grants so recent files / folders reopen across
//            relaunches after LaunchServices document grants expire.
//   SCOPE:   remember(path) at grant moments (recent-add, folder pick,
//            CLI boot); ensure_access(path) as a pre-read rescue hook in
//            m013b fs read/readdir. JSON store at data_root()/security-
//            bookmarks.json. Non-macOS: both calls are no-ops.
//   DEPENDS: mt_paths::data_root; serde/serde_json; core-foundation
//            (macOS only — already in the tree via cocoa).
//   LINKS: .grace/changes/active/C-15/plan.xml T-M3; M-013-B fs hooks;
//          M-017 recent docs; M-022 mt-paths data_root.
//
// START_MODULE_MAP
//   remember - create + persist a security-scoped bookmark for a granted path
//   ensure_access - resolve/refresh a stored bookmark, start accessing, return the path
//   store_load/store_save - JSON persistence (v1: {version, bookmarks{path: base64}})
//   active_set - process-global set of already-started accesses
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-09-21 C-15 T-M3: initial module — sandbox persistence for
//     App Store builds; zero behavior change for non-MAS (no bookmark →
//     path passes through unchanged).
// END_CHANGE_SUMMARY

use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

const STORE_FILE: &str = "security-bookmarks.json";
const STORE_VERSION: u32 = 1;
const MAX_STORED: usize = 256;

#[derive(serde::Serialize, serde::Deserialize)]
struct Store {
    version: u32,
    bookmarks: HashMap<String, String>,
}

impl Default for Store {
    fn default() -> Self {
        Store { version: STORE_VERSION, bookmarks: HashMap::new() }
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

fn persist(store: &Store) {
    if let Some(p) = store_path() {
        if let Some(dir) = p.parent() {
            let _ = std::fs::create_dir_all(dir);
        }
        if let Ok(json) = serde_json::to_string_pretty(store) {
            let _ = std::fs::write(p, json);
        }
    }
}

/// Record a grant: remember `path` so future processes can regain access.
/// Called whenever the OS hands Mark access (dialog/drop/CLI/LaunchServices).
/// No-op on non-macOS and when bookmark creation fails (non-sandboxed runs
/// still succeed — the bookmark is simply optional there).
pub fn remember(path: &str) {
    #[cfg(target_os = "macos")]
    {
        if let Some(blob) = imp::create_bookmark(path) {
            let b64 = b64_encode(&blob);
            let mut st = state().lock().unwrap();
            if !st.bookmarks.contains_key(path) && st.bookmarks.len() >= MAX_STORED {
                // bounded store: drop the oldest inserted key (HashMap order
                // is arbitrary but stable per process; loss is acceptable —
                // worst case one recent doc loses its grant)
                if let Some(k) = st.bookmarks.keys().next().cloned() {
                    st.bookmarks.remove(&k);
                }
            }
            st.bookmarks.insert(path.to_string(), b64);
            persist(&st);
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = path;
    }
}

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
                        remember(&resolved_str);
                    }
                    return resolved_str;
                }
            }
        }
    }
    path.to_string()
}

// -- pure helpers (tested on all platforms) --

fn b64_encode(data: &[u8]) -> String {
    data.iter().fold(String::with_capacity(data.len() * 4 / 3 + 4), |mut s, b| {
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
    fn store_version_default_matches_const() {
        let st = Store::default();
        assert_eq!(st.version, STORE_VERSION);
        assert!(st.bookmarks.is_empty());
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn remember_then_ensure_access_round_trip() {
        // Round-trips a REAL bookmark against a temp file. Unsandboxed
        // creation succeeds and resolves to the same path — this exercises
        // the CF plumbing; the sandbox grant semantics only differ under
        // an actual App Store entitlement, covered by the C-15 dry-run.
        let dir = std::env::temp_dir().join("m047-test");
        std::fs::create_dir_all(&dir).unwrap();
        let f = dir.join("probe.md");
        std::fs::write(&f, "hi").unwrap();
        let p = f.to_str().unwrap().to_string();
        remember(&p);
        let stored = { state().lock().unwrap().bookmarks.get(&p).cloned() };
        assert!(stored.is_some(), "bookmark blob persisted");
        let out = ensure_access(&p);
        assert!(out.ends_with("probe.md"), "resolved path keeps the file name: {out}");
        let _ = std::fs::remove_dir_all(&dir);
    }
}
