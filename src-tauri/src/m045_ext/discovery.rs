// FILE: src-tauri/src/m045_ext/discovery.rs
// VERSION: 1.1.0
// START_MODULE_CONTRACT
//   PURPOSE: M-045 extension discovery. Scans known directories for
//            extension.json manifests and health-probes each one.
//   SCOPE:   Filesystem scan + HTTP health probe. Does NOT register
//            extensions — that's registry.rs.
//   DEPENDS: manifest (parse), reqwest (health probe), mt_paths.
//   LINKS: M-045, M-022
//   STATUS:  Phase-B2b initial.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   DiscoveredExtension - Manifest and health status discovered on disk.
//   extension_dirs - Locate platform-specific extension scan directories.
//   discover_extensions - Scan local manifests and probe accepted recipients.
//   probe_health - Probe a validated local URL without proxies or redirects.
// END_MODULE_MAP

// START_CHANGE_SUMMARY
//   - 2026-11-09 C-STABILIZE-NATIVE-PROFILE-CLOSEOUT: configured data-root scan; canonical release alone retains legacy extension scan.
//   - 2026-11-09 C-SEC-AUDIT-FIXES T-005: parsed loopback recipients and no redirect/proxy escape.
// END_CHANGE_SUMMARY

use crate::m045_ext::manifest::{parse_manifest, ExtensionManifest};
use std::path::PathBuf;
use std::time::Duration;

// START_BLOCK_DISCOVERED_EXTENSION
#[derive(Debug, Clone)]
pub struct DiscoveredExtension {
    pub manifest: ExtensionManifest,
    #[allow(dead_code)]
    pub source_path: PathBuf,
    pub healthy: bool,
}
// END_BLOCK_DISCOVERED_EXTENSION

// START_BLOCK_EXTENSION_DIRS
/// Returns the list of directories to scan for extension.json files.
pub(super) fn extension_dirs() -> Vec<PathBuf> {
    extension_dirs_for_profile(
        crate::mt_paths::application_identifier(),
        std::env::var_os("HOME").map(PathBuf::from),
        crate::mt_paths::data_root(),
    )
}

fn extension_dirs_for_profile(identifier: &str, home: Option<PathBuf>, data: Option<PathBuf>) -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    // Historical release installs retain their legacy scan, in the same order.
    // Alternate app profiles must never discover the release's extensions.
    if identifier == crate::mt_paths::APP_BUNDLE_ID {
        if let Some(home) = home {
            dirs.push(home.join(".config").join("mark").join("extensions"));
        }
    }
    // Canonical Linux releases historically scan only the legacy directory.
    // Preserve that release behavior; alternate profiles use their native root.
    if identifier != crate::mt_paths::APP_BUNDLE_ID || cfg!(any(target_os = "macos", target_os = "windows")) {
        if let Some(data) = data {
            dirs.push(data.join("extensions"));
        }
    }
    dirs
}
// END_BLOCK_EXTENSION_DIRS

// START_BLOCK_SCAN
/// Scan known directories for extension.json files, parse and validate each.
fn scan_manifests() -> Vec<(ExtensionManifest, PathBuf)> {
    let mut results = Vec::new();

    for dir in extension_dirs() {
        let entries = match std::fs::read_dir(&dir) {
            Ok(e) => e,
            Err(_) => {
                safe_eprintln!(
                    "[ExtHost][discovery][BLOCK_SCAN_DIR_SKIP dir={}]",
                    dir.display()
                );
                continue;
            }
        };

        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) != Some("json") {
                continue;
            }

            let content = match std::fs::read_to_string(&path) {
                Ok(c) => c,
                Err(e) => {
                    safe_eprintln!(
                        "[ExtHost][discovery][BLOCK_SCAN_READ_FAILED path={} reason={e}]",
                        path.display()
                    );
                    continue;
                }
            };

            match parse_manifest(&content) {
                Ok(manifest) => {
                    safe_eprintln!(
                        "[ExtHost][discovery][BLOCK_SCAN_FOUND id={} path={}]",
                        manifest.id,
                        path.display()
                    );
                    results.push((manifest, path));
                }
                Err(e) => {
                    safe_eprintln!(
                        "[ExtHost][discovery][BLOCK_SCAN_PARSE_FAILED path={} reason={e}]",
                        path.display()
                    );
                }
            }
        }
    }

    results
}
// END_BLOCK_SCAN

// START_BLOCK_HEALTH_PROBE
/// Health-probe a single extension. GET {base_url}{health_path} with
/// a 5-second timeout. Returns true if status 200.
pub async fn probe_health(manifest: &ExtensionManifest) -> bool {
    let url = match super::manifest::extension_endpoint(&manifest.discovery.base_url, &manifest.discovery.health_path) {
        Ok(url) => url,
        Err(e) => {
            safe_eprintln!("[ExtHost][discovery][BLOCK_HEALTH_URL_REFUSED id={} reason={e}]", manifest.id);
            return false;
        }
    };

    let client = match reqwest::Client::builder()
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(5))
        .build()
    {
        Ok(c) => c,
        Err(e) => {
            safe_eprintln!(
                "[ExtHost][discovery][BLOCK_HEALTH_CLIENT_FAILED id={} reason={e}]",
                manifest.id
            );
            return false;
        }
    };

    match client.get(url.clone()).send().await {
        Ok(resp) if resp.status().is_success() => {
            safe_eprintln!(
                "[ExtHost][discovery][BLOCK_HEALTH_OK id={} url={url}]",
                manifest.id
            );
            true
        }
        Ok(resp) => {
            safe_eprintln!(
                "[ExtHost][discovery][BLOCK_HEALTH_BAD_STATUS id={} url={url} status={}]",
                manifest.id,
                resp.status()
            );
            false
        }
        Err(e) => {
            safe_eprintln!(
                "[ExtHost][discovery][BLOCK_HEALTH_FAILED id={} url={url} reason={e}]",
                manifest.id
            );
            false
        }
    }
}
// END_BLOCK_HEALTH_PROBE

// START_BLOCK_DISCOVER
/// Full discovery pipeline: scan + health-probe each extension.
pub async fn discover_extensions() -> Vec<DiscoveredExtension> {
    let manifests = scan_manifests();
    let mut results = Vec::with_capacity(manifests.len());

    for (manifest, source_path) in manifests {
        let healthy = probe_health(&manifest).await;
        results.push(DiscoveredExtension {
            manifest,
            source_path,
            healthy,
        });
    }

    results
}
// END_BLOCK_DISCOVER

#[cfg(test)]
mod profile_namespace_tests {
    use super::*;

    #[test]
    fn profile_namespace_discovery_preserves_release_legacy_order() {
        let home = PathBuf::from("/fixture");
        let data = home.join("Library/Application Support/com.xronocode.mark");
        let mut expected = vec![home.join(".config/mark/extensions")];
        if cfg!(any(target_os = "macos", target_os = "windows")) {
            expected.push(data.join("extensions"));
        }
        assert_eq!(extension_dirs_for_profile(crate::mt_paths::APP_BUNDLE_ID, Some(home.clone()), Some(data)), expected);
    }

    #[test]
    fn profile_namespace_discovery_excludes_release_and_legacy_roots() {
        let home = PathBuf::from("/fixture");
        let data = home.join("Library/Application Support/com.xronocode.mark.test.stabilize29");
        assert_eq!(extension_dirs_for_profile("com.xronocode.mark.test.stabilize29", Some(home), Some(data.clone())),
            vec![data.join("extensions")]);
        assert!(extension_dirs_for_profile("com.xronocode.mark.test.stabilize29", None, None).is_empty());
    }
}
