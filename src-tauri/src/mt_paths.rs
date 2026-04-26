// MODULE_CONTRACT
//   PURPOSE: Cross-platform helpers for the directories Mark uses outside
//            its electron-store-compatible userData root. Exists so
//            cancel_log, telemetry, and snapshot code can write to the
//            correct OS location without coupling to specific paths.
//   SCOPE: Pure path resolution from environment variables — no filesystem
//          probing, no I/O, no Tauri runtime.
//   DEPENDS: stdlib only.
//   LINKS: M-022 mt-paths; Phase-B-pre2 step-3 (cache_root); future
//          telemetry / snapshot modules will reuse cache_root + data_root.
//

use std::path::PathBuf;

/// macOS reverse-DNS application identifier. Single source of truth across
/// modules; aligns with `tauri.conf.json` `identifier` and electron-builder
/// `appId`.
pub const APP_BUNDLE_ID: &str = "com.xronocode.mark";

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
    #[cfg(target_os = "macos")]
    {
        env("HOME").map(|h| {
            PathBuf::from(h)
                .join("Library")
                .join("Caches")
                .join(APP_BUNDLE_ID)
        })
    }
    #[cfg(target_os = "linux")]
    {
        let xdg = env("XDG_CACHE_HOME").map(PathBuf::from);
        let fallback = env("HOME").map(|h| PathBuf::from(h).join(".cache"));
        xdg.or(fallback).map(|d| d.join(APP_BUNDLE_ID))
    }
    #[cfg(target_os = "windows")]
    {
        env("LOCALAPPDATA").map(|d| PathBuf::from(d).join(APP_BUNDLE_ID).join("Cache"))
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
    fn app_bundle_id_is_canonical() {
        assert_eq!(APP_BUNDLE_ID, "com.xronocode.mark");
    }
}
