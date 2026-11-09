// FILE: src-tauri/src/mt_paths.rs
// VERSION: 2.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Resolve OS-native cache and durable data roots in the configured application namespace.
//   SCOPE: Immutable validated namespace selection and pure path calculation; no filesystem I/O or Tauri runtime dependency.
//   DEPENDS: stdlib; main initializes the identifier from the generated Tauri Context before state access.
//   LINKS: M-022, .grace/graph/runtime.xml M-022; .grace/verification/runtime.xml V-M-022.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   APP_BUNDLE_ID - Canonical release identifier, retained as the default for non-app callers.
//   initialize_application_identifier - Bind the validated configured namespace once.
//   application_identifier - Read the initialized namespace for native consumer identities.
//   cache_root - Resolve the current namespace's OS-native cache root.
//   cache_root_from_env - Resolve cache root using a synthetic environment lookup.
//   data_root - Resolve the current namespace's durable data root.
//   data_root_from_env - Resolve durable root using a synthetic environment lookup.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   - 2026-11-09 C-STABILIZE-NATIVE-PROFILE-CLOSEOUT: expose the same initialized identifier for native credential/discovery/default-handler consumers.
//   - 2026-11-09 C-STABILIZE-PROFILE-ISOLATION: separate configured test namespaces while preserving release paths and pre-boot rollback state ownership.
// END_CHANGE_SUMMARY

use std::path::PathBuf;
use std::sync::OnceLock;

/// Canonical release namespace. Alternate builds use their configured identifier.
pub const APP_BUNDLE_ID: &str = "com.xronocode.mark";

static APPLICATION_IDENTIFIER: OnceLock<String> = OnceLock::new();

fn valid_application_identifier(identifier: &str) -> bool {
    !identifier.is_empty()
        && identifier.len() <= 255
        && identifier.split('.').all(|part| {
            !part.is_empty()
                && part
                    .bytes()
                    .all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'_')
        })
}

fn initialize_identifier(
    namespace: &OnceLock<String>,
    identifier: &str,
) -> Result<(), &'static str> {
    if !valid_application_identifier(identifier) {
        return Err("Invalid application profile identifier");
    }
    if let Some(existing) = namespace.get() {
        return if existing == identifier {
            Ok(())
        } else {
            Err("Application profile identifier already initialized")
        };
    }
    match namespace.set(identifier.to_owned()) {
        Ok(()) => Ok(()),
        Err(_)
            if namespace
                .get()
                .is_some_and(|existing| existing == identifier) =>
        {
            Ok(())
        }
        Err(_) => Err("Application profile identifier already initialized"),
    }
}

/// Bind the generated Tauri configuration before any application state access.
pub(crate) fn initialize_application_identifier(identifier: &str) -> Result<(), &'static str> {
    initialize_identifier(&APPLICATION_IDENTIFIER, identifier)
}

fn identifier_for_namespace(namespace: &OnceLock<String>) -> &str {
    namespace
        .get()
        .map(String::as_str)
        .unwrap_or(APP_BUNDLE_ID)
}

/// Shared identity for native credentials, discovery and default handlers.
pub(crate) fn application_identifier() -> &'static str {
    identifier_for_namespace(&APPLICATION_IDENTIFIER)
}

/// Returns the OS-specific cache root for Mark.
///
/// - macOS:   `$HOME/Library/Caches/com.xronocode.mark`
/// - Linux:   `$XDG_CACHE_HOME/com.xronocode.mark` (fallback `$HOME/.cache/com.xronocode.mark`)
/// - Windows: `%LOCALAPPDATA%\com.xronocode.mark\Cache`
///
/// Returns `None` only when the necessary environment variables are unset
/// (very rare; usually means a broken sandbox or sysprep image).
pub fn cache_root() -> Option<PathBuf> {
    cache_root_from_env(|k| std::env::var_os(k))
}

/// Test-friendly inner that takes the env lookup as a closure.
pub(crate) fn cache_root_from_env<F>(env: F) -> Option<PathBuf>
where
    F: Fn(&str) -> Option<std::ffi::OsString>,
{
    cache_root_for_identifier_from_env(env, application_identifier())
}

fn cache_root_for_identifier_from_env<F>(env: F, identifier: &str) -> Option<PathBuf>
where
    F: Fn(&str) -> Option<std::ffi::OsString>,
{
    #[cfg(target_os = "macos")]
    {
        env("HOME").map(|h| {
            PathBuf::from(h)
                .join("Library")
                .join("Caches")
                .join(identifier)
        })
    }
    #[cfg(target_os = "linux")]
    {
        let xdg = env("XDG_CACHE_HOME").map(PathBuf::from);
        let fallback = env("HOME").map(|h| PathBuf::from(h).join(".cache"));
        xdg.or(fallback).map(|d| d.join(identifier))
    }
    #[cfg(target_os = "windows")]
    {
        env("LOCALAPPDATA").map(|d| PathBuf::from(d).join(identifier).join("Cache"))
    }
}

/// Durable data root for Mark (survives cache purges; security bookmarks
/// live here per C-15 T-M3). Mirrors cache_root's env-resolution contract.
///
/// - macOS:   `$HOME/Library/Application Support/com.xronocode.mark`
/// - Linux:   `$XDG_DATA_HOME/com.xronocode.mark` (fallback `$HOME/.local/share`)
/// - Windows: `%APPDATA%\com.xronocode.mark\Data`
pub fn data_root() -> Option<PathBuf> {
    data_root_from_env(|k| std::env::var_os(k))
}

pub(crate) fn data_root_from_env<F>(env: F) -> Option<PathBuf>
where
    F: Fn(&str) -> Option<std::ffi::OsString>,
{
    data_root_for_identifier_from_env(env, application_identifier())
}

fn data_root_for_identifier_from_env<F>(env: F, identifier: &str) -> Option<PathBuf>
where
    F: Fn(&str) -> Option<std::ffi::OsString>,
{
    #[cfg(target_os = "macos")]
    {
        env("HOME").map(|h| {
            PathBuf::from(h)
                .join("Library")
                .join("Application Support")
                .join(identifier)
        })
    }
    #[cfg(target_os = "linux")]
    {
        let xdg = env("XDG_DATA_HOME").map(PathBuf::from);
        let fallback = env("HOME").map(|h| PathBuf::from(h).join(".local").join("share"));
        xdg.or(fallback).map(|d| d.join(identifier))
    }
    #[cfg(target_os = "windows")]
    {
        env("APPDATA").map(|d| PathBuf::from(d).join(identifier).join("Data"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::ffi::OsString;

    fn mock_env(pairs: &[(&str, &str)]) -> impl Fn(&str) -> Option<OsString> {
        let map: std::collections::HashMap<String, String> = pairs
            .iter()
            .map(|(k, v)| (k.to_string(), v.to_string()))
            .collect();
        move |key: &str| map.get(key).map(OsString::from)
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn macos_cache_root_under_library_caches() {
        let env = mock_env(&[("HOME", "/Users/test")]);
        let p = cache_root_from_env(&env).unwrap();
        assert_eq!(
            p,
            PathBuf::from("/Users/test/Library/Caches/com.xronocode.mark")
        );
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn macos_cache_root_none_without_home() {
        let env = mock_env(&[]);
        assert_eq!(cache_root_from_env(&env), None);
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn linux_cache_root_prefers_xdg_cache_home() {
        let env = mock_env(&[
            ("XDG_CACHE_HOME", "/var/cache/test"),
            ("HOME", "/home/test"),
        ]);
        let p = cache_root_from_env(&env).unwrap();
        assert_eq!(p, PathBuf::from("/var/cache/test/com.xronocode.mark"));
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn linux_cache_root_falls_back_to_home_dot_cache() {
        let env = mock_env(&[("HOME", "/home/test")]);
        let p = cache_root_from_env(&env).unwrap();
        assert_eq!(p, PathBuf::from("/home/test/.cache/com.xronocode.mark"));
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn windows_cache_root_under_localappdata() {
        let env = mock_env(&[("LOCALAPPDATA", "C:\\Users\\test\\AppData\\Local")]);
        let p = cache_root_from_env(&env).unwrap();
        assert_eq!(
            p,
            PathBuf::from("C:\\Users\\test\\AppData\\Local\\com.xronocode.mark\\Cache")
        );
    }

    #[test]
    fn cache_root_real_env_returns_some_when_home_or_localappdata_set() {
        // Smoke: on the host running the test suite, real env should yield Some(_).
        if std::env::var_os("HOME").is_some() || std::env::var_os("LOCALAPPDATA").is_some() {
            assert!(cache_root().is_some());
        }
    }

    #[test]
    fn configured_identifiers_have_disjoint_cache_and_data_roots() {
        let env = mock_env(&[
            ("HOME", "/Users/test"),
            ("XDG_CACHE_HOME", "/test/cache"),
            ("XDG_DATA_HOME", "/test/data"),
            ("LOCALAPPDATA", r"C:\Users\test\AppData\Local"),
            ("APPDATA", r"C:\Users\test\AppData\Roaming"),
        ]);
        let test_id = "com.xronocode.mark.test.stabilize29";
        let release_cache = cache_root_for_identifier_from_env(&env, APP_BUNDLE_ID).unwrap();
        let test_cache = cache_root_for_identifier_from_env(&env, test_id).unwrap();
        let release_data = data_root_for_identifier_from_env(&env, APP_BUNDLE_ID).unwrap();
        let test_data = data_root_for_identifier_from_env(&env, test_id).unwrap();
        assert_ne!(
            release_cache, test_cache,
            "test preferences must not share release cache"
        );
        assert_ne!(
            release_data, test_data,
            "test durable state must not share release data"
        );
        assert!(test_cache.to_string_lossy().contains(test_id));
        assert!(test_data.to_string_lossy().contains(test_id));
    }

    #[test]
    fn application_identifier_is_validated_and_immutable() {
        let namespace = OnceLock::new();
        for invalid in [
            "",
            ".",
            "..",
            "com..test",
            "com.example/other",
            "com.example\\other",
            "com.example test",
        ] {
            assert!(
                initialize_identifier(&namespace, invalid).is_err(),
                "{}",
                invalid
            );
            assert!(namespace.get().is_none());
        }
        let test_id = "com.xronocode.mark.test.stabilize29";
        assert_eq!(initialize_identifier(&namespace, test_id), Ok(()));
        assert_eq!(initialize_identifier(&namespace, test_id), Ok(()));
        assert!(initialize_identifier(&namespace, APP_BUNDLE_ID).is_err());
        assert_eq!(namespace.get().map(String::as_str), Some(test_id));
    }

    #[test]
    fn canonical_identifier_preserves_existing_cache_and_data_roots() {
        let env = mock_env(&[
            ("HOME", "/Users/test"),
            ("XDG_CACHE_HOME", "/test/cache"),
            ("XDG_DATA_HOME", "/test/data"),
            ("LOCALAPPDATA", r"C:\Users\test\AppData\Local"),
            ("APPDATA", r"C:\Users\test\AppData\Roaming"),
        ]);
        #[cfg(target_os = "macos")]
        {
            assert_eq!(
                cache_root_for_identifier_from_env(&env, APP_BUNDLE_ID).unwrap(),
                PathBuf::from("/Users/test/Library/Caches/com.xronocode.mark")
            );
            assert_eq!(
                data_root_for_identifier_from_env(&env, APP_BUNDLE_ID).unwrap(),
                PathBuf::from("/Users/test/Library/Application Support/com.xronocode.mark")
            );
        }
        #[cfg(target_os = "linux")]
        {
            assert_eq!(
                cache_root_for_identifier_from_env(&env, APP_BUNDLE_ID).unwrap(),
                PathBuf::from("/test/cache/com.xronocode.mark")
            );
            assert_eq!(
                data_root_for_identifier_from_env(&env, APP_BUNDLE_ID).unwrap(),
                PathBuf::from("/test/data/com.xronocode.mark")
            );
        }
        #[cfg(target_os = "windows")]
        {
            assert_eq!(
                cache_root_for_identifier_from_env(&env, APP_BUNDLE_ID).unwrap(),
                PathBuf::from(r"C:\Users\test\AppData\Local\com.xronocode.mark\Cache")
            );
            assert_eq!(
                data_root_for_identifier_from_env(&env, APP_BUNDLE_ID).unwrap(),
                PathBuf::from(r"C:\Users\test\AppData\Roaming\com.xronocode.mark\Data")
            );
        }
    }

    #[test]
    fn profile_namespace_native_identity_preserves_release_and_uses_configured_id() {
        let namespace = OnceLock::new();
        assert_eq!(identifier_for_namespace(&namespace), APP_BUNDLE_ID);
        initialize_identifier(&namespace, "com.xronocode.mark.test.stabilize29").unwrap();
        assert_eq!(identifier_for_namespace(&namespace), "com.xronocode.mark.test.stabilize29");
        assert_ne!(identifier_for_namespace(&namespace), APP_BUNDLE_ID);
    }

    #[test]
    fn app_bundle_id_is_canonical() {
        assert_eq!(APP_BUNDLE_ID, "com.xronocode.mark");
    }
}
