// MODULE_CONTRACT
//   PURPOSE: M-045 extension discovery. Scans known directories for
//            extension.json manifests and health-probes each one.
//   SCOPE:   Filesystem scan + HTTP health probe. Does NOT register
//            extensions — that's registry.rs.
//   DEPENDS: manifest (parse), reqwest (health probe), mt_paths.
//   LINKS:   docs/knowledge-graph.xml M-045;
//            docs/development-plan.xml Phase-B2b.
//   STATUS:  Phase-B2b initial.

use crate::m045_ext::manifest::{parse_manifest, ExtensionManifest};
use std::path::PathBuf;
use std::time::Duration;

// START_BLOCK_DISCOVERED_EXTENSION
#[derive(Debug, Clone)]
pub struct DiscoveredExtension {
    pub manifest: ExtensionManifest,
    pub source_path: PathBuf,
    pub healthy: bool,
}
// END_BLOCK_DISCOVERED_EXTENSION

// START_BLOCK_EXTENSION_DIRS
/// Returns the list of directories to scan for extension.json files.
fn extension_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();

    if let Some(home) = std::env::var_os("HOME").map(PathBuf::from) {
        // ~/.config/mark/extensions/
        dirs.push(home.join(".config").join("mark").join("extensions"));

        // macOS: ~/Library/Application Support/com.xronocode.mark/extensions/
        #[cfg(target_os = "macos")]
        dirs.push(
            home.join("Library")
                .join("Application Support")
                .join("com.xronocode.mark")
                .join("extensions"),
        );
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
    let url = format!(
        "{}{}",
        manifest.discovery.base_url.trim_end_matches('/'),
        manifest.discovery.health_path
    );

    let client = match reqwest::Client::builder()
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

    match client.get(&url).send().await {
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
