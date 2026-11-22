// FILE: src-tauri/src/m016_updater.rs
// VERSION: 1.2.0
// START_MODULE_CONTRACT
//   PURPOSE: M-016 mt-updater. Wraps tauri-plugin-updater so the
//            renderer's existing mt::updater::check IPC contract
//            keeps working while update polling routes through the
//            ed25519-signed feed at tauri.conf.json plugins.updater
//            .endpoints[].
//   SCOPE:   Signed-feed status checks only. Download/install/relaunch
//            is exposed by tauri-plugin-updater directly to the renderer
//            for every non-App-Store installation, including Homebrew.
//   DEPENDS: tauri-plugin-updater (B4 step-5 wired); std::env for
//            CARGO_PKG_VERSION fallback when the plugin endpoint is
//            unreachable.
//   LINKS:   .grace/graph/runtime.xml M-016 (PhaseRef Phase-B4) step-5/6;
//            tauri.conf.json plugins.updater config;
//            docs/release-trains/README.md#owner-only-github-rollout (user setup).
//   STATUS:  Phase-B4 step-5 wired 2026-05-08 — plugin loaded in
//            main.rs Builder; mt_updater_check proxies to
//            UpdaterExt::updater().check().
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   UpdateStatus - Stable renderer-facing status for update checks.
//   no_update - Build an unavailable status for non-App-Store failures.
//   mt_updater_check - Check the signed feed or return a safe quiet status.
// END_MODULE_MAP
//
// CHANGE_SUMMARY:
//   - 2026-11-23 v1.2.0 C-UPDATER-NET-BOUNDS T-005/T-006: mt_updater_check
//     builds through the plugin's own UpdaterBuilder::timeout seam —
//     UPDATER_CHECK_TIMEOUT_SECS = 15 s per request over the
//     metadata-only feed (the two-endpoint sweep worst case ≈ 30 s is
//     tolerated by the 24 h launch check and turned into bounded
//     feedback on the manual path; mirrors the zone's rollback connect
//     deadline ROLLBACK_CONNECT_TIMEOUT_SECS = 10); a builder failure
//     joins the same quiet-with-statusNote path; the Ok/Err arms and
//     their BLOCK markers are byte-identical. The deadline changes how
//     soon the launch path settles, not whether it is silent. The
//     updater_backup_channel stand (T-006) pins the real plugin's
//     failover + package delivery on a local two-endpoint fixture.
//   - 2026-10-24 v1.1.0: point signing setup to the canonical owner-only rollout instructions.
//   - 2026-04-29 B3-step-10: initial stub with stable shape.
//   - 2026-08-07 v2.1.2-beta: make the signed in-app updater the only
//                Help-menu path; Homebrew remains an external fallback.
//   - 2026-05-08 B4-step-5: proxy to tauri-plugin-updater.

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateStatus {
    pub current_version: String,
    pub available: bool,
    pub latest_version: Option<String>,
    pub download_url: Option<String>,
    pub status_note: Option<String>,
}

#[cfg(not(feature = "app-store"))]
fn no_update(current: String, note: Option<String>) -> UpdateStatus {
    UpdateStatus {
        current_version: current,
        available: false,
        latest_version: None,
        download_url: None,
        status_note: note,
    }
}

// C-UPDATER-NET-BOUNDS R-1: the check deadline (the m068 constants
// convention, cfg-gated with the desktop command). The feed response is
// metadata-only JSON (a latest.json is well under 10 KB), so 15 s is a
// generous per-request bound; the plugin's two-endpoint failover makes
// the honest worst sweep ≈ 30 s, which the 24 h-throttled launch check
// tolerates and the manual command turns into bounded feedback (the
// Err→statusNote squash below is unchanged — a timed-out check is a
// real rejection rendered as the existing statusNote warning, never a
// quiet «up to date»). Mirrors the rollback connect deadline
// (ROLLBACK_CONNECT_TIMEOUT_SECS = 10, m068_rollback.rs).
#[cfg(not(feature = "app-store"))]
const UPDATER_CHECK_TIMEOUT_SECS: u64 = 15;

#[cfg(not(feature = "app-store"))]
#[tauri::command]
pub async fn mt_updater_check(app: tauri::AppHandle) -> Result<UpdateStatus, String> {
    use tauri_plugin_updater::UpdaterExt;
    let current = env!("CARGO_PKG_VERSION").to_string();

    let updater = match app
        .updater_builder()
        .timeout(std::time::Duration::from_secs(UPDATER_CHECK_TIMEOUT_SECS))
        .build()
    {
        Ok(u) => u,
        Err(e) => {
            safe_eprintln!("[Updater][check][BLOCK_PLUGIN_UNAVAILABLE err={e}]");
            return Ok(no_update(
                current,
                Some(format!("updater plugin not initialized: {e}")),
            ));
        }
    };

    match updater.check().await {
        Ok(Some(update)) => {
            safe_eprintln!(
                "[Updater][check][BLOCK_UPDATE_AVAILABLE current={current} latest={}]",
                update.version
            );
            Ok(UpdateStatus {
                current_version: current,
                available: true,
                latest_version: Some(update.version.clone()),
                download_url: Some(update.download_url.to_string()),
                status_note: None,
            })
        }
        Ok(None) => {
            safe_eprintln!("[Updater][check][BLOCK_UP_TO_DATE current={current}]");
            Ok(no_update(current, None))
        }
        Err(e) => {
            safe_eprintln!("[Updater][check][BLOCK_FEED_FAILED err={e}]");
            Ok(no_update(
                current,
                Some(format!("update check failed: {e}")),
            ))
        }
    }
}

#[cfg(feature = "app-store")]
#[tauri::command]
pub async fn mt_updater_check(_app: tauri::AppHandle) -> Result<UpdateStatus, String> {
    Ok(UpdateStatus {
        current_version: env!("CARGO_PKG_VERSION").to_string(),
        available: false,
        latest_version: None,
        download_url: None,
        status_note: Some("Updates are managed by the App Store".to_string()),
    })
}

#[cfg(all(test, not(feature = "app-store")))]
mod tests {
    use super::*;

    #[test]
    fn no_update_serializes_without_install_method_routing() {
        let status = no_update("2.1.2-beta".to_string(), None);
        let json = serde_json::to_value(status).expect("UpdateStatus must serialize");

        assert_eq!(json["currentVersion"], "2.1.2-beta");
        assert_eq!(json["available"], false);
        assert!(json.get("installMethod").is_none());
    }

    // ── C-UPDATER-NET-BOUNDS T-004: the check-deadline pins ─────────
    // (the rollback_fetch_deadline_lives_in_the_client_builder
    // precedent, m068_rollback.rs — the deadline provably lives in the
    // plugin's own builder, never in a timer race around the call.)

    #[test]
    fn updater_check_deadline_lives_in_the_builder() {
        let src = include_str!("m016_updater.rs");
        let start = src
            .find("pub async fn mt_updater_check")
            .expect("the desktop check command exists");
        let rest = &src[start..];
        let end = rest
            .find("#[cfg(feature = \"app-store\")]")
            .expect("the app-store stub section follows the desktop command");
        let body = &rest[..end];
        for needle in [
            "updater_builder()",
            ".timeout(std::time::Duration::from_secs(UPDATER_CHECK_TIMEOUT_SECS))",
        ] {
            assert!(
                body.contains(needle),
                "the check deadline provably lives in the plugin builder: {needle}"
            );
        }
    }

    #[test]
    fn updater_check_deadline_constant_is_pinned() {
        assert_eq!(UPDATER_CHECK_TIMEOUT_SECS, 15);
    }
}

// ─── C-UPDATER-NET-BOUNDS T-006: the backup-channel stand ──────────
/// R-7: the real tauri-plugin-updater runs against a controlled local
/// two-endpoint fixture — a hung primary and a mirror serving a
/// latest.json whose platform url points at a gateway-imitating local
/// route carrying the minisign-verified payload bytes — driven through
/// the plugin's own injectable UpdaterBuilder seams (endpoints, target,
/// pubkey, timeout) on a tauri::test mock app with the plugin properly
/// registered (updater_builder() reads the plugin's managed
/// UpdaterState). Zero external network: the fixture listener binds
/// 127.0.0.1:0 only and the test fails if the recorded request log
/// contains anything but its loopback routes. The minisign constants
/// are a throwaway keypair generated at implementation time with the
/// tauri signer CLI (the plugin's own offline_tests precedent), the
/// signature bound to the fixture version 999.0.0.
#[cfg(all(test, not(feature = "app-store")))]
mod updater_backup_channel {
    use std::io::{BufRead, BufReader, Write};
    use std::net::TcpListener;
    use std::sync::{Arc, Mutex};
    use std::time::{Duration, Instant};
    use tauri_plugin_updater::UpdaterExt;

    /// The throwaway fixture keypair's public key (base64, exactly as
    /// the plugin config carries it) — `tauri signer generate`.
    const FIXTURE_PUBKEY_B64: &str = "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IENBMDk1OTQ1MTE2MkQ0NUQKUldSZDFHSVJSVmtKeXZjR08zTytVcWdmLzkrWjNrWEpMQmpNRkkvVVVyVFBNYXNHbFhVM01kZnoK";
    /// The signature of FIXTURE_PAYLOAD with the fixture secret key,
    /// bound to the fixture version 999.0.0 — `tauri signer sign
    /// --app-version 999.0.0` (base64, exactly as a latest.json
    /// carries it).
    const FIXTURE_SIGNATURE_B64: &str = "dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZSBmcm9tIHRhdXJpIHNlY3JldCBrZXkKUlVSZDFHSVJSVmtKeXB5OThIQ2hSR0Q0eXJFRnNZOWxzUE9UZThrRGFnMk03azhWSzFIZ2dTSUhwOW8rMTllYmU3QVZyUjFCQWI2UlpkVHVLYVA0MWNGUndqWFF2MDl1cXdVPQp0cnVzdGVkIGNvbW1lbnQ6IHRpbWVzdGFtcDoxNzk1Mzc0OTgyCWZpbGU6cGF5bG9hZC5iaW4JdmVyc2lvbjo5OTkuMC4wCjhFQlVEbTAvTHczby9Sa3ZxZlZEcE9ZODQveHJxbUJyUjhhN2NNTmU4SkxGREtHMHRqc0pWZnhqOGIrSTl4Mmw2OGh6WDBGbUhWU004RzRUT2pzWkFBPT0K";
    /// The signed fixture payload bytes the /pkg route serves.
    const FIXTURE_PAYLOAD: &[u8] = b"mark backup-channel fixture payload";
    const FIXTURE_VERSION: &str = "999.0.0";
    const BUILDER_TIMEOUT_SECS: u64 = 15;

    /// One hand-rolled HTTP/1.1 fixture on 127.0.0.1:0 with three
    /// routes; every request line is recorded for the evidence
    /// assertions. GET /feed-hang — the failing primary (accepted,
    /// never answered); GET /latest.json — the mirror manifest carrying
    /// the package URL as a real feed does; GET /pkg/<...> — the
    /// gateway-imitating route serving the signed payload bytes.
    fn spawn_fixture() -> (u16, Arc<Mutex<Vec<String>>>) {
        let listener = TcpListener::bind("127.0.0.1:0").expect("loopback listener binds");
        let port = listener.local_addr().unwrap().port();
        let log: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(Vec::new()));
        let log_thread = log.clone();
        let latest = format!(
            r#"{{"version":"{FIXTURE_VERSION}","notes":"backup-channel fixture","pub_date":"2025-01-01T00:00:00Z","platforms":{{"test-target":{{"url":"http://127.0.0.1:{port}/pkg/darwin-aarch64/{FIXTURE_VERSION}","signature":"{FIXTURE_SIGNATURE_B64}"}}}}}}"#
        );
        std::thread::spawn(move || {
            let log = log_thread;
            for stream in listener.incoming() {
                let Ok(stream) = stream else { continue };
                let log = log.clone();
                let latest = latest.clone();
                std::thread::spawn(move || {
                    let Ok(peer) = stream.peer_addr() else {
                        return;
                    };
                    let mut writer = match stream.try_clone() {
                        Ok(w) => w,
                        Err(_) => return,
                    };
                    let mut reader = BufReader::new(stream);
                    let mut request_line = String::new();
                    if reader.read_line(&mut request_line).unwrap_or(0) == 0 {
                        return;
                    }
                    // Drain the headers to the empty line.
                    loop {
                        let mut line = String::new();
                        if reader.read_line(&mut line).unwrap_or(0) == 0 || line == "\r\n" {
                            break;
                        }
                    }
                    let path = request_line
                        .split_whitespace()
                        .nth(1)
                        .unwrap_or_default()
                        .to_string();
                    log.lock()
                        .unwrap()
                        .push(format!("{peer} {}", request_line.trim_end()));

                    if path == "/feed-hang" {
                        // The failing primary: accepted, never answered —
                        // the builder deadline must cut the request off.
                        loop {
                            std::thread::park();
                        }
                    }
                    let (status, content_type, body): (&str, &str, Vec<u8>) = if path
                        == "/latest.json"
                    {
                        ("200 OK", "application/json", latest.into_bytes())
                    } else if path.starts_with("/pkg/") {
                        ("200 OK", "application/octet-stream", FIXTURE_PAYLOAD.to_vec())
                    } else {
                        (
                            "404 Not Found",
                            "text/plain",
                            b"fixture route not found".to_vec(),
                        )
                    };
                    let head = format!(
                        "HTTP/1.1 {status}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                        body.len()
                    );
                    let _ = writer.write_all(head.as_bytes());
                    let _ = writer.write_all(&body);
                });
            }
        });
        (port, log)
    }

    /// A tauri::test mock app with the REAL updater plugin registered:
    /// the plugin's setup deserializes the plugins.updater section and
    /// manages the UpdaterState that UpdaterExt::updater_builder()
    /// consumes (without the registration the state read panics).
    fn mock_app_with_registered_plugin() -> tauri::App<tauri::test::MockRuntime> {
        let mut context = tauri::test::mock_context(tauri::test::noop_assets());
        context.config_mut().plugins.0.insert(
            "updater".to_string(),
            serde_json::json!({ "pubkey": FIXTURE_PUBKEY_B64 }),
        );
        tauri::test::mock_builder()
            .plugin(tauri_plugin_updater::Builder::new().build())
            .build(context)
            .expect("mock app builds with the registered updater plugin")
    }

    #[test]
    fn backup_feed_channel_delivers_the_package_via_the_feed_carried_url_under_the_deadline() {
        let (port, log) = spawn_fixture();
        let app = mock_app_with_registered_plugin();
        let handle = app.handle().clone();

        // The plugin's own injectable seams: the hung primary first, the
        // mirror second — the failover loop must ride past the deadline
        // on the primary and answer from the mirror.
        let endpoints = vec![
            format!("http://127.0.0.1:{port}/feed-hang")
                .parse()
                .expect("primary endpoint parses"),
            format!("http://127.0.0.1:{port}/latest.json")
                .parse()
                .expect("mirror endpoint parses"),
        ];

        let started = Instant::now();
        let update = tauri::async_runtime::block_on(async {
            handle
                .updater_builder()
                .endpoints(endpoints)
                .expect("endpoints set")
                .target("test-target")
                .pubkey(FIXTURE_PUBKEY_B64)
                .timeout(Duration::from_secs(BUILDER_TIMEOUT_SECS))
                .build()
                .expect("updater builds")
                .check()
                .await
                .expect("the mirror answers after the hung primary")
        });
        let elapsed = started.elapsed();
        assert!(
            elapsed >= Duration::from_secs(BUILDER_TIMEOUT_SECS),
            "the deadline provably engaged on the hung primary (not an instant fail): elapsed {elapsed:?}"
        );

        let update = update.expect("the mirror announces the fixture release");
        assert_eq!(update.version, FIXTURE_VERSION);
        assert!(
            update
                .download_url
                .as_str()
                .contains(&format!("/pkg/darwin-aarch64/{FIXTURE_VERSION}")),
            "the package URL is the feed-carried gateway route, used verbatim: {}",
            update.download_url
        );

        // The download leg under the same deadline class: the Update
        // resource carries its own request timeout (what the renderer's
        // DownloadOptions.timeout plumbing sets — commands.rs:182-184),
        // and Update::download verifies the fetched bytes against the
        // feed-carried signature.
        let mut update = update;
        update.timeout = Some(Duration::from_secs(BUILDER_TIMEOUT_SECS));
        let bytes = tauri::async_runtime::block_on(update.download(|_, _| {}, || {}))
            .expect("the package downloads and minisign-verifies");
        assert_eq!(
            bytes, FIXTURE_PAYLOAD,
            "the signed fixture bytes arrive through the feed-carried URL"
        );

        // The evidence: the failover path — hung primary, mirror
        // manifest, package bytes served on the feed-carried /pkg
        // route — and nothing but the loopback fixture routes.
        let log = log.lock().unwrap();
        let joined = log.join("\n");
        assert!(
            joined.contains("GET /feed-hang"),
            "the hung primary was attempted: {joined}"
        );
        assert!(
            joined.contains("GET /latest.json"),
            "the mirror manifest was fetched: {joined}"
        );
        assert!(
            joined.contains(&format!("GET /pkg/darwin-aarch64/{FIXTURE_VERSION}")),
            "the package bytes were served on the feed-carried route: {joined}"
        );
        for entry in log.iter() {
            assert!(
                entry.contains("127.0.0.1"),
                "zero external network — a non-loopback request was recorded: {entry}"
            );
        }
    }
}
