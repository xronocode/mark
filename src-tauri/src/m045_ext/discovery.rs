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
//   ScanFailure / ScanFailureKind / DiscoverOutcome - Scan failures with machine kinds beside the probed extensions.
//   extension_dirs - Locate platform-specific extension scan directories.
//   discover_extensions - Scan local manifests and probe accepted recipients.
//   discover_extensions_in - Injected seam: scan dirs plus prober, probes bounded in scan order.
//   probe_health - Probe a validated local URL without proxies or redirects.
// END_MODULE_MAP

// START_CHANGE_SUMMARY
//   - 2026-11-23 C-EXT-GALLERY-STATE T-004: bounded concurrent probes —
//     discover_extensions_in fans the scanned manifests out under the
//     named DISCOVERY_PROBE_CONCURRENCY_CAP = 4 with Semaphore/JoinSet,
//     each task carrying its scan index and holding its permit only
//     across its probe, results written into scan-index slots drained in
//     index order (scan order kept exactly; probe hygiene unchanged);
//     the scan reports read/parse failures beside the extensions through
//     ScanFailure/DiscoverOutcome (machine kinds "read"/"parse"; raw
//     error text stays in the BLOCK_ logs) and the parameterized
//     scan_manifests_in seam collects them.
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

// START_BLOCK_DISCOVER_OUTCOME
/// C-EXT-GALLERY-STATE: machine kind of a manifest scan failure — the
/// entry could not be read ("read") or was read but not parsed ("parse").
/// Raw error text stays in the BLOCK_ logs; the outcome carries only the
/// path and the kind.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ScanFailureKind {
    Read,
    Parse,
}

/// One scanned manifest entry that could not be read or parsed.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub struct ScanFailure {
    pub path: PathBuf,
    pub kind: ScanFailureKind,
}

/// The discovery result: the probed extensions beside the scan failures
/// the scan could not read or parse. The command payload reports the
/// failures beside the list as the discover Ok payload's
/// failed_manifests entries.
#[derive(Debug, Clone)]
pub struct DiscoverOutcome {
    pub extensions: Vec<DiscoveredExtension>,
    pub failed_manifests: Vec<ScanFailure>,
}
// END_BLOCK_DISCOVER_OUTCOME

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
    scan_manifests_in(extension_dirs()).0
}

/// C-EXT-GALLERY-STATE: the parameterized scan seam (the
/// extension_dirs_for_profile precedent) — takes the scan directories and
/// reports every read/parse failure beside the accepted manifests while
/// the BLOCK_SCAN_READ_FAILED / BLOCK_SCAN_PARSE_FAILED logs stay
/// verbatim.
fn scan_manifests_in(dirs: Vec<PathBuf>) -> (Vec<(ExtensionManifest, PathBuf)>, Vec<ScanFailure>) {
    let mut results = Vec::new();
    let mut failures = Vec::new();

    for dir in dirs {
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
                    failures.push(ScanFailure {
                        path: path.clone(),
                        kind: ScanFailureKind::Read,
                    });
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
                    failures.push(ScanFailure {
                        path,
                        kind: ScanFailureKind::Parse,
                    });
                }
            }
        }
    }

    (results, failures)
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
/// C-EXT-GALLERY-STATE: named bounded cap for the probe concurrency
/// (plan-level constant). The probes fan out under a Semaphore of this
/// size while every probe keeps its hygiene byte-for-byte and the results
/// keep the manifests' scan order.
pub(super) const DISCOVERY_PROBE_CONCURRENCY_CAP: usize = 4;

/// Full discovery pipeline: scan + health-probe each extension. Enters
/// through the discover_extensions_in seam and returns the full outcome —
/// the probed extensions beside the scan failures (C-EXT-GALLERY-STATE:
/// the command payload reports the failures instead of dropping them).
pub async fn discover_extensions() -> DiscoverOutcome {
    discover_extensions_in(extension_dirs(), |manifest| async move {
        probe_health(&manifest).await
    })
    .await
}

/// C-EXT-GALLERY-STATE: the injected discovery seam (the
/// extension_dirs_for_profile precedent) — the scan directories and the
/// async manifest-to-health prober are parameters so tests observe probe
/// concurrency, scan order and failure surfacing without the
/// environment. probe_health satisfies the bound. The scanned manifests
/// are probed concurrently under DISCOVERY_PROBE_CONCURRENCY_CAP: each
/// spawned task carries its scan index and holds its Semaphore permit
/// only across its probe, and the completed results are written into
/// scan-index slots drained in index order, so the outcome keeps the
/// manifests' scan order exactly while the worst-case wait drops from
/// N x 5 seconds to roughly ceil(N/cap) x 5 seconds.
pub(super) async fn discover_extensions_in<P, Fut>(
    dirs: Vec<PathBuf>,
    prober: P,
) -> DiscoverOutcome
where
    P: Fn(ExtensionManifest) -> Fut + Send + Sync + 'static,
    Fut: std::future::Future<Output = bool> + Send + 'static,
{
    let (manifests, failures) = scan_manifests_in(dirs);
    let total = manifests.len();
    let prober = std::sync::Arc::new(prober);
    let semaphore =
        std::sync::Arc::new(tokio::sync::Semaphore::new(DISCOVERY_PROBE_CONCURRENCY_CAP));
    let mut probes = tokio::task::JoinSet::new();

    for (index, (manifest, source_path)) in manifests.into_iter().enumerate() {
        let prober = std::sync::Arc::clone(&prober);
        let semaphore = std::sync::Arc::clone(&semaphore);
        probes.spawn(async move {
            // The permit is held only across this probe.
            let _permit = semaphore
                .acquire()
                .await
                .expect("the probe semaphore is never closed");
            let healthy = prober(manifest.clone()).await;
            (
                index,
                DiscoveredExtension {
                    manifest,
                    source_path,
                    healthy,
                },
            )
        });
    }

    // JoinSet yields in completion order: write each result into its
    // scan-index slot and drain in index order.
    let mut slots: Vec<Option<DiscoveredExtension>> = (0..total).map(|_| None).collect();
    while let Some(joined) = probes.join_next().await {
        let (index, extension) = joined.expect("a probe task panicked");
        slots[index] = Some(extension);
    }

    DiscoverOutcome {
        extensions: slots
            .into_iter()
            .map(|slot| slot.expect("every probe reports its scan-index slot"))
            .collect(),
        failed_manifests: failures,
    }
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
