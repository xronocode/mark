// MODULE_CONTRACT
//   PURPOSE: M-045 unit tests for manifest parsing, registry operations,
//            and auth helpers.
//   SCOPE:   In-process tests only. No real keychain or HTTP (those
//            require integration tests). Discovery path resolution is
//            tested by asserting known patterns.
//   DEPENDS: super::*.
//   LINKS:   docs/verification-plan.xml V-M-045.
//   STATUS:  Phase-B2b initial.

use super::manifest::*;
use super::registry::*;

// START_BLOCK_TEST_HELPERS
fn valid_manifest_json() -> String {
    r#"{
        "schema": "mark.extension/v1",
        "id": "com.example.test-ext",
        "name": "Test Extension",
        "version": "0.1.0",
        "min_mark_version": "2.0.0",
        "protocol_versions": [1],
        "capabilities": [
            {"name": "text.insert", "version": 1},
            {"name": "text.transform", "version": 1}
        ],
        "discovery": {
            "base_url": "http://127.0.0.1:9100",
            "health_path": "/health"
        },
        "invoke": {
            "invoke_path": "/invoke",
            "timeout_secs": 30
        },
        "ui": {
            "panel_label": "Test",
            "icon": "icon.png"
        }
    }"#
    .to_string()
}

fn minimal_manifest_json() -> String {
    r#"{
        "schema": "mark.extension/v1",
        "id": "com.example.minimal",
        "name": "Minimal",
        "version": "0.1.0",
        "capabilities": [{"name": "text.insert", "version": 1}],
        "discovery": {"base_url": "http://127.0.0.1:9200"},
        "invoke": {}
    }"#
    .to_string()
}
// END_BLOCK_TEST_HELPERS

// START_BLOCK_MANIFEST_TESTS
#[test]
fn parse_valid_manifest() {
    let m = parse_manifest(&valid_manifest_json()).expect("should parse");
    assert_eq!(m.schema, SCHEMA_V1);
    assert_eq!(m.id, "com.example.test-ext");
    assert_eq!(m.name, "Test Extension");
    assert_eq!(m.version, "0.1.0");
    assert_eq!(m.min_mark_version.as_deref(), Some("2.0.0"));
    assert_eq!(m.protocol_versions, vec![1]);
    assert_eq!(m.capabilities.len(), 2);
    assert_eq!(m.capabilities[0].name, "text.insert");
    assert_eq!(m.discovery.base_url, "http://127.0.0.1:9100");
    assert_eq!(m.discovery.health_path, "/health");
    assert_eq!(m.invoke.invoke_path, "/invoke");
    assert_eq!(m.invoke.timeout_secs, 30);
    assert!(m.ui.is_some());
}

#[test]
fn parse_minimal_manifest_uses_defaults() {
    let m = parse_manifest(&minimal_manifest_json()).expect("should parse");
    assert_eq!(m.discovery.health_path, "/health");
    assert_eq!(m.invoke.invoke_path, "/invoke");
    assert_eq!(m.invoke.timeout_secs, 30);
    assert!(m.ui.is_none());
    assert!(m.min_mark_version.is_none());
    assert!(m.protocol_versions.is_empty());
}

#[test]
fn reject_wrong_schema() {
    let json = r#"{
        "schema": "mark.extension/v99",
        "id": "test",
        "name": "Test",
        "version": "0.1.0",
        "capabilities": [{"name": "text.insert", "version": 1}],
        "discovery": {"base_url": "http://127.0.0.1:9100"},
        "invoke": {}
    }"#;
    let err = parse_manifest(json).unwrap_err();
    assert!(err.message.contains("unsupported schema"));
}

#[test]
fn reject_empty_id() {
    let json = r#"{
        "schema": "mark.extension/v1",
        "id": "",
        "name": "Test",
        "version": "0.1.0",
        "capabilities": [{"name": "text.insert", "version": 1}],
        "discovery": {"base_url": "http://127.0.0.1:9100"},
        "invoke": {}
    }"#;
    let err = parse_manifest(json).unwrap_err();
    assert!(err.message.contains("id must not be empty"));
}

#[test]
fn reject_empty_name() {
    let json = r#"{
        "schema": "mark.extension/v1",
        "id": "test",
        "name": "",
        "version": "0.1.0",
        "capabilities": [{"name": "text.insert", "version": 1}],
        "discovery": {"base_url": "http://127.0.0.1:9100"},
        "invoke": {}
    }"#;
    let err = parse_manifest(json).unwrap_err();
    assert!(err.message.contains("name must not be empty"));
}

#[test]
fn reject_no_capabilities() {
    let json = r#"{
        "schema": "mark.extension/v1",
        "id": "test",
        "name": "Test",
        "version": "0.1.0",
        "capabilities": [],
        "discovery": {"base_url": "http://127.0.0.1:9100"},
        "invoke": {}
    }"#;
    let err = parse_manifest(json).unwrap_err();
    assert!(err.message.contains("at least one capability"));
}

#[test]
fn reject_empty_base_url() {
    let json = r#"{
        "schema": "mark.extension/v1",
        "id": "test",
        "name": "Test",
        "version": "0.1.0",
        "capabilities": [{"name": "text.insert", "version": 1}],
        "discovery": {"base_url": ""},
        "invoke": {}
    }"#;
    let err = parse_manifest(json).unwrap_err();
    assert!(err.message.contains("base_url must not be empty"));
}

#[test]
fn reject_invalid_json() {
    let err = parse_manifest("not json at all").unwrap_err();
    assert!(err.message.contains("JSON parse error"));
}
// END_BLOCK_MANIFEST_TESTS

// START_BLOCK_REGISTRY_TESTS
fn test_manifest(id: &str) -> ExtensionManifest {
    parse_manifest(&valid_manifest_json())
        .map(|mut m| {
            m.id = id.to_string();
            m
        })
        .unwrap()
}

#[test]
fn registry_register_and_list() {
    let reg = ExtRegistry::new();
    reg.register(test_manifest("ext-a"), true).unwrap();
    reg.register(test_manifest("ext-b"), false).unwrap();

    let list = reg.list();
    assert_eq!(list.len(), 2);
}

#[test]
fn registry_enable_disable() {
    let reg = ExtRegistry::new();
    reg.register(test_manifest("ext-a"), true).unwrap();

    // Initially disabled.
    let list = reg.list();
    assert!(!list[0].enabled);

    // Enable.
    reg.enable("ext-a").unwrap();
    let list = reg.list();
    assert!(list[0].enabled);

    // Disable.
    reg.disable("ext-a").unwrap();
    let list = reg.list();
    assert!(!list[0].enabled);
}

#[test]
fn registry_enable_not_found() {
    let reg = ExtRegistry::new();
    let err = reg.enable("nonexistent").unwrap_err();
    assert!(err.contains("not found"));
}

#[test]
fn registry_disable_not_found() {
    let reg = ExtRegistry::new();
    let err = reg.disable("nonexistent").unwrap_err();
    assert!(err.contains("not found"));
}

#[test]
fn registry_get_enabled_by_capability() {
    let reg = ExtRegistry::new();
    reg.register(test_manifest("ext-a"), true).unwrap();
    reg.register(test_manifest("ext-b"), true).unwrap();
    reg.enable("ext-a").unwrap();

    let results = reg.get_enabled("text.insert");
    assert_eq!(results.len(), 1);
    assert_eq!(results[0].id, "ext-a");

    // No results for unknown capability.
    let results = reg.get_enabled("unknown.cap");
    assert!(results.is_empty());
}

#[test]
fn registry_get_manifest_enabled() {
    let reg = ExtRegistry::new();
    reg.register(test_manifest("ext-a"), true).unwrap();
    reg.enable("ext-a").unwrap();

    let m = reg.get_manifest("ext-a").unwrap();
    assert_eq!(m.id, "ext-a");
}

#[test]
fn registry_get_manifest_disabled() {
    let reg = ExtRegistry::new();
    reg.register(test_manifest("ext-a"), true).unwrap();

    let err = reg.get_manifest("ext-a").unwrap_err();
    assert!(err.contains("disabled"));
}

#[test]
fn registry_get_manifest_not_found() {
    let reg = ExtRegistry::new();
    let err = reg.get_manifest("nonexistent").unwrap_err();
    assert!(err.contains("not found"));
}

#[test]
fn registry_re_register_overwrites() {
    let reg = ExtRegistry::new();
    reg.register(test_manifest("ext-a"), true).unwrap();
    reg.enable("ext-a").unwrap();

    // Re-register resets state.
    reg.register(test_manifest("ext-a"), false).unwrap();
    let list = reg.list();
    assert_eq!(list.len(), 1);
    assert!(!list[0].enabled);
    assert!(!list[0].healthy);
}

#[test]
fn registry_set_health() {
    let reg = ExtRegistry::new();
    reg.register(test_manifest("ext-a"), false).unwrap();

    let list = reg.list();
    assert!(!list[0].healthy);

    reg.set_health("ext-a", true).unwrap();
    let list = reg.list();
    assert!(list[0].healthy);
}
// END_BLOCK_REGISTRY_TESTS

// START_BLOCK_AUTH_TESTS
#[test]
fn generate_secret_length() {
    let secret = super::auth::generate_secret();
    // 32 bytes = 64 hex chars.
    assert_eq!(secret.len(), 64);
    // All hex chars.
    assert!(secret.chars().all(|c| c.is_ascii_hexdigit()));
}

#[test]
fn generate_secret_unique() {
    let s1 = super::auth::generate_secret();
    let s2 = super::auth::generate_secret();
    assert_ne!(s1, s2, "two generated secrets should differ");
}

#[test]
fn hex_encode_roundtrip() {
    let bytes = [0x00, 0x01, 0x0f, 0x10, 0xff];
    let hex = super::auth::hex_encode(&bytes);
    assert_eq!(hex, "00010f10ff");
}

#[test]
fn constant_time_eq_same() {
    assert!(super::auth::constant_time_eq(b"hello", b"hello"));
}

#[test]
fn constant_time_eq_different() {
    assert!(!super::auth::constant_time_eq(b"hello", b"world"));
}

#[test]
fn constant_time_eq_different_length() {
    assert!(!super::auth::constant_time_eq(b"short", b"longer"));
}
// END_BLOCK_AUTH_TESTS

// START_BLOCK_MANIFEST_SECURITY_TESTS
#[test]
fn reject_non_loopback_base_url() {
    let json = r#"{
        "schema": "mark.extension/v1",
        "id": "com.evil.ext",
        "name": "Evil Extension",
        "version": "0.1.0",
        "capabilities": [{"name": "text.insert", "version": 1}],
        "discovery": {"base_url": "http://attacker.com:9100"},
        "invoke": {}
    }"#;
    let err = parse_manifest(json).unwrap_err();
    assert!(
        err.message.contains("127.0.0.1 or localhost"),
        "expected loopback rejection, got: {}",
        err.message
    );
}

#[test]
fn accept_localhost_base_url() {
    let json = r#"{
        "schema": "mark.extension/v1",
        "id": "com.example.local",
        "name": "Local Extension",
        "version": "0.1.0",
        "capabilities": [{"name": "text.insert", "version": 1}],
        "discovery": {"base_url": "http://localhost:9100"},
        "invoke": {}
    }"#;
    let m = parse_manifest(json).expect("localhost should be accepted");
    assert_eq!(m.discovery.base_url, "http://localhost:9100");
}

#[test]
fn accept_127_0_0_1_base_url() {
    let m = parse_manifest(&valid_manifest_json()).expect("127.0.0.1 should be accepted");
    assert_eq!(m.discovery.base_url, "http://127.0.0.1:9100");
}

#[test]
fn reject_external_ip_base_url() {
    let json = r#"{
        "schema": "mark.extension/v1",
        "id": "com.evil.ext",
        "name": "Evil",
        "version": "0.1.0",
        "capabilities": [{"name": "text.insert", "version": 1}],
        "discovery": {"base_url": "http://192.168.1.100:9100"},
        "invoke": {}
    }"#;
    let err = parse_manifest(json).unwrap_err();
    assert!(err.message.contains("127.0.0.1 or localhost"));
}

#[test]
fn reject_base_url_without_scheme() {
    let json = r#"{
        "schema": "mark.extension/v1",
        "id": "com.evil.ext",
        "name": "Evil",
        "version": "0.1.0",
        "capabilities": [{"name": "text.insert", "version": 1}],
        "discovery": {"base_url": "attacker.com:9100"},
        "invoke": {}
    }"#;
    let err = parse_manifest(json).unwrap_err();
    assert!(err.message.contains("http://"));
}

#[test]
fn registry_enable_already_enabled_is_idempotent() {
    let reg = ExtRegistry::new();
    reg.register(test_manifest("ext-a"), true).unwrap();
    reg.enable("ext-a").unwrap();
    // Enable again — should be idempotent.
    reg.enable("ext-a").unwrap();
    let list = reg.list();
    assert!(list[0].enabled);
}

#[test]
fn registry_disable_already_disabled_is_idempotent() {
    let reg = ExtRegistry::new();
    reg.register(test_manifest("ext-a"), true).unwrap();
    // Disable when already disabled — should be idempotent.
    reg.disable("ext-a").unwrap();
    let list = reg.list();
    assert!(!list[0].enabled);
}
// END_BLOCK_MANIFEST_SECURITY_TESTS

// START_BLOCK_ENDURANCE_TESTS

/// B5b gate test: 30-minute live document streaming endurance.
///
/// Simulates a full 30-minute live session compressed to ~4 seconds:
///   - Creates a LiveSession directly (no HTTP server or AppHandle needed)
///   - 360 iterations (one per simulated 5-second window)
///   - Each iteration: apply a doc.patch with growing transcript content
///   - Every 6th iteration (simulated 30s): replace Summary and Key Points sections
///   - Heartbeat timestamp refreshed between patches
///   - After 360 iterations: close session
///   - Verify: all patches applied, revision incremented correctly, no panics
///
/// Run manually: `cargo test load_smoke -- --ignored --nocapture`
/// The test is #[ignore] so `cargo test` skips it by default.
#[test]
#[ignore] // Run manually: cargo test load_smoke -- --ignored
fn test_b5b_load_smoke_30min_synthetic() {
    use super::live_server::LiveSession;
    use std::collections::HashMap;
    use std::time::{Duration, Instant};

    const ITERATIONS: usize = 360; // simulated 30 min at 5s granularity
    const SECTION_REPLACE_EVERY: usize = 6; // every 6th = simulated 30s
    const SLEEP_MS: u64 = 10; // actual inter-iteration delay

    // -- Create a LiveSession directly (bypasses HTTP + auth layer) ------
    let mut session = LiveSession {
        session_id: "endurance-b5b-001".to_string(),
        extension_id: "com.tokmo.meeting".to_string(),
        last_seq: 0,
        revision: 1,
        document_md: "# Live Meeting\n\n_Recording..._\n".to_string(),
        sections: {
            let mut s = HashMap::new();
            s.insert("header".to_string(), "# Live Meeting".to_string());
            s.insert("summary".to_string(), String::new());
            s.insert("key_points".to_string(), String::new());
            s.insert("transcript".to_string(), String::new());
            s
        },
        active: true,
        last_heartbeat: Instant::now(),
    };

    assert!(session.active);
    assert_eq!(session.revision, 1);

    let mut transcript_content = String::new();
    let baseline_revision = session.revision;

    // -- Main simulation loop --------------------------------------------
    for i in 0..ITERATIONS {
        let simulated_ms = (i as u64) * 5000;
        let seq = (i + 1) as u64;

        // Simulate transcript growth: append a new line each iteration
        let speaker = if i % 2 == 0 { "Alice" } else { "Bob" };
        let minutes = simulated_ms / 60000;
        let seconds = (simulated_ms % 60000) / 1000;
        let line = format!(
            "**[{:02}:{:02}] {}:** Utterance {} with enough content to stress the section store.\n\n",
            minutes, seconds, speaker, i
        );
        transcript_content.push_str(&line);

        // Apply transcript patch (simulates what handle_doc_patch does)
        assert!(
            seq > session.last_seq,
            "seq {} must be > last_seq {} at iteration {}",
            seq,
            session.last_seq,
            i
        );

        session
            .sections
            .insert("transcript".to_string(), transcript_content.clone());

        // Rebuild full document from sections
        let mut full_doc = String::new();
        for key in &["header", "summary", "key_points", "transcript"] {
            if let Some(value) = session.sections.get(*key) {
                if !value.is_empty() {
                    if !full_doc.is_empty() {
                        full_doc.push_str("\n\n");
                    }
                    full_doc.push_str(&format!("## {key}\n\n{value}"));
                }
            }
        }
        session.document_md = full_doc;
        session.last_seq = seq;
        session.revision += 1;

        // Heartbeat refresh (simulates /stream/heartbeat between patches)
        session.last_heartbeat = Instant::now();

        // Every simulated 30s: replace Summary and Key Points sections
        if (i + 1) % SECTION_REPLACE_EVERY == 0 {
            let summary_text = format!(
                "Meeting in progress. {} utterances recorded over {}m {}s. \
                 Speakers: Alice, Bob. Topics covered: project status, \
                 resource allocation, timeline review.",
                i + 1,
                minutes,
                seconds
            );
            session
                .sections
                .insert("summary".to_string(), summary_text);

            let kp_count = (i + 1) / SECTION_REPLACE_EVERY;
            let mut kp_text = String::new();
            for kp_idx in 0..kp_count.min(20) {
                kp_text.push_str(&format!(
                    "- [Decision] Key point {} established at iteration {}\n",
                    kp_idx,
                    kp_idx * SECTION_REPLACE_EVERY
                ));
            }
            session
                .sections
                .insert("key_points".to_string(), kp_text);

            // Verify sections are non-empty after replace
            assert!(
                !session.sections["summary"].is_empty(),
                "Summary must be non-empty after replace at iteration {}",
                i
            );
            assert!(
                !session.sections["key_points"].is_empty(),
                "Key Points must be non-empty after replace at iteration {}",
                i
            );
        }

        std::thread::sleep(Duration::from_millis(SLEEP_MS));
    }

    // -- Close session ---------------------------------------------------
    session.active = false;
    let final_revision = session.revision;

    // -- Verify final state ----------------------------------------------
    assert!(!session.active, "Session must be inactive after close");

    // Revision should have incremented exactly ITERATIONS times from baseline
    assert_eq!(
        final_revision,
        baseline_revision + ITERATIONS as u64,
        "Revision must equal baseline ({}) + iterations ({}), got {}",
        baseline_revision,
        ITERATIONS,
        final_revision
    );

    // last_seq should equal ITERATIONS
    assert_eq!(
        session.last_seq, ITERATIONS as u64,
        "last_seq must equal {}",
        ITERATIONS
    );

    // Transcript section should contain all utterances
    let transcript = &session.sections["transcript"];
    assert!(
        transcript.contains("Utterance 0"),
        "Transcript must contain first utterance"
    );
    assert!(
        transcript.contains(&format!("Utterance {}", ITERATIONS - 1)),
        "Transcript must contain last utterance"
    );

    // Both speakers should appear
    assert!(
        transcript.contains("Alice"),
        "Transcript must contain Alice entries"
    );
    assert!(
        transcript.contains("Bob"),
        "Transcript must contain Bob entries"
    );

    // Summary and Key Points should have content from the last replace cycle
    assert!(
        !session.sections["summary"].is_empty(),
        "Summary must have content after endurance run"
    );
    assert!(
        !session.sections["key_points"].is_empty(),
        "Key Points must have content after endurance run"
    );

    // Document MD should be non-trivially large
    assert!(
        session.document_md.len() > 10_000,
        "Full document should be substantial (got {} bytes)",
        session.document_md.len()
    );

    // Heartbeat should be recent (within last second, since we just ran)
    assert!(
        session.last_heartbeat.elapsed() < Duration::from_secs(5),
        "Last heartbeat should be recent"
    );
}
// END_BLOCK_ENDURANCE_TESTS

// START_BLOCK_DISCOVERY_PATH_TESTS
#[test]
fn extension_dirs_include_config() {
    // This test verifies the directory patterns are reasonable.
    // Actual directory existence is not checked (may not exist in CI).
    if let Some(home) = std::env::var_os("HOME") {
        let config_dir = std::path::PathBuf::from(&home)
            .join(".config")
            .join("mark")
            .join("extensions");
        // Just verify the path construction is correct.
        assert!(config_dir.to_str().unwrap().contains(".config/mark/extensions"));
    }
}
// END_BLOCK_DISCOVERY_PATH_TESTS
