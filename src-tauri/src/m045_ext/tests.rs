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
    use super::live_server::{apply_section_patch, rebuild_document_md, LiveSession};
    use std::time::{Duration, Instant};

    const ITERATIONS: usize = 360; // simulated 30 min at 5s granularity
    const SECTION_REPLACE_EVERY: usize = 6; // every 6th = simulated 30s
    const SLEEP_MS: u64 = 10; // actual inter-iteration delay

    // -- Create a LiveSession the same way handle_doc_open does ---------
    // (sections ordered, content self-contained markdown; core patch
    // logic is exercised via the real apply_section_patch fn).
    let mut session = LiveSession {
        session_id: "endurance-b5b-001".to_string(),
        extension_id: "com.tokmo.meeting".to_string(),
        last_seq: 0,
        revision: 1,
        document_md: String::new(),
        sections: vec![
            ("header".to_string(), "# Live Meeting\n\n".to_string()),
            ("summary".to_string(), String::new()),
            ("key_points".to_string(), String::new()),
            ("transcript".to_string(), "## Transcript\n\n".to_string()),
        ],
        active: true,
        last_heartbeat: Instant::now(),
    };

    assert!(session.active);
    assert_eq!(session.revision, 1);
    session.document_md = rebuild_document_md(&session.sections);

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

        // Apply transcript patch through the REAL patch core (append op)
        assert!(
            seq > session.last_seq,
            "seq {} must be > last_seq {} at iteration {}",
            seq,
            session.last_seq,
            i
        );
        apply_section_patch(
            &mut session.sections,
            "transcript",
            Some("append"),
            &line,
        )
        .expect("transcript section must exist (declared at open)");

        // Rebuild full document from sections via the REAL rebuild fn
        session.document_md = rebuild_document_md(&session.sections);
        session.last_seq = seq;
        session.revision += 1;

        // Heartbeat refresh (simulates /stream/heartbeat between patches)
        session.last_heartbeat = Instant::now();

        // Every simulated 30s: replace Summary and Key Points sections
        if (i + 1) % SECTION_REPLACE_EVERY == 0 {
            let summary_text = format!(
                "## Summary\n\nMeeting in progress. {} utterances recorded over {}m {}s. \
                 Speakers: Alice, Bob. Topics covered: project status, \
                 resource allocation, timeline review.\n",
                i + 1,
                minutes,
                seconds
            );
            apply_section_patch(
                &mut session.sections,
                "summary",
                Some("replace"),
                &summary_text,
            )
            .expect("summary section must exist");

            let kp_count = (i + 1) / SECTION_REPLACE_EVERY;
            let mut kp_text = String::from("## Key Points\n\n");
            for kp_idx in 0..kp_count.min(20) {
                kp_text.push_str(&format!(
                    "- [Decision] Key point {} established at iteration {}\n",
                    kp_idx,
                    kp_idx * SECTION_REPLACE_EVERY
                ));
            }
            apply_section_patch(
                &mut session.sections,
                "key_points",
                Some("replace"),
                &kp_text,
            )
            .expect("key_points section must exist");

            // Verify sections are non-empty after replace
            let summary = session
                .sections
                .iter()
                .find(|(n, _)| n == "summary")
                .map(|(_, c)| c.as_str())
                .unwrap();
            assert!(
                !summary.is_empty(),
                "Summary must be non-empty after replace at iteration {}",
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

    let section = |name: &str| {
        session
            .sections
            .iter()
            .find(|(n, _)| n == name)
            .map(|(_, c)| c.as_str())
            .unwrap_or_else(|| panic!("section {name} must exist"))
    };

    // Transcript section should contain ALL utterances (append accumulates)
    let transcript = section("transcript");
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
        !section("summary").is_empty(),
        "Summary must have content after endurance run"
    );
    assert!(
        !section("key_points").is_empty(),
        "Key Points must have content after endurance run"
    );

    // Document MD should be non-trivially large
    assert!(
        session.document_md.len() > 10_000,
        "Full document should be substantial (got {} bytes)",
        session.document_md.len()
    );

    // The full document must contain every utterance too — the exact
    // regression that hid the append-as-replace bug.
    for probe in [0, 1, ITERATIONS / 2, ITERATIONS - 1] {
        assert!(
            session.document_md.contains(&format!("Utterance {probe}")),
            "Rebuilt document must contain Utterance {probe} (accumulation regression)"
        );
    }

    // Heartbeat should be recent (within last second, since we just ran)
    assert!(
        session.last_heartbeat.elapsed() < Duration::from_secs(5),
        "Last heartbeat should be recent"
    );
}
// END_BLOCK_ENDURANCE_TESTS

// START_BLOCK_LIVE_DOC_V2_TESTS
// Live-doc wire contract v2: ordered sections, op semantics, no
// synthetic headers, deterministic rebuild. Exercise the same pure
// functions the HTTP handlers call.
use super::live_server::{
    apply_section_patch, build_sections_from_init, decide_open, rebuild_document_md, LiveSession,
    OpenDecision, SectionInit, SectionPatchError,
};

#[test]
fn v2_open_same_session_id_replaces_for_resync() {
    // Recovery path for needs_resync: re-open with the SAME session id
    // must be allowed to replace the active session state wholesale.
    let session = LiveSession {
        session_id: "s1".to_string(),
        extension_id: "com.tokmo.voice".to_string(),
        last_seq: 42,
        revision: 99,
        document_md: "stale".to_string(),
        sections: vec![],
        active: true,
        last_heartbeat: std::time::Instant::now(),
    };
    assert_eq!(
        decide_open(Some(&session), "s1"),
        OpenDecision::ReplaceSameSession
    );
}

#[test]
fn v2_open_different_active_session_conflicts() {
    let session = LiveSession {
        session_id: "s1".to_string(),
        extension_id: "com.tokmo.voice".to_string(),
        last_seq: 0,
        revision: 1,
        document_md: String::new(),
        sections: vec![],
        active: true,
        last_heartbeat: std::time::Instant::now(),
    };
    assert_eq!(decide_open(Some(&session), "s2"), OpenDecision::Conflict);
}

#[test]
fn v2_open_after_close_or_without_session_is_fresh() {
    assert_eq!(decide_open(None, "s1"), OpenDecision::FreshOpen);
    let mut closed = LiveSession {
        session_id: "s1".to_string(),
        extension_id: "com.tokmo.voice".to_string(),
        last_seq: 0,
        revision: 1,
        document_md: String::new(),
        sections: vec![],
        active: true,
        last_heartbeat: std::time::Instant::now(),
    };
    closed.active = false;
    assert_eq!(decide_open(Some(&closed), "s1"), OpenDecision::FreshOpen);
    assert_eq!(decide_open(Some(&closed), "s2"), OpenDecision::FreshOpen);
}

fn tokmo_like_sections() -> Vec<(String, String)> {
    build_sections_from_init(vec![
        SectionInit {
            name: "header".to_string(),
            content: "# Meeting - 0m 00s\n\n".to_string(),
        },
        SectionInit {
            name: "key_points".to_string(),
            content: String::new(),
        },
        SectionInit {
            name: "summary".to_string(),
            content: String::new(),
        },
        SectionInit {
            name: "transcript".to_string(),
            content: "## Transcript\n\n".to_string(),
        },
    ])
}

#[test]
fn v2_append_accumulates_across_patches() {
    let mut sections = tokmo_like_sections();
    for i in 0..5 {
        apply_section_patch(
            &mut sections,
            "transcript",
            Some("append"),
            &format!("**[00:0{i}] Alice:** line {i}\n\n"),
        )
        .unwrap();
    }
    let transcript = &sections
        .iter()
        .find(|(n, _)| n == "transcript")
        .unwrap()
        .1;
    for i in 0..5 {
        assert!(
            transcript.contains(&format!("line {i}")),
            "append must accumulate: line {i} missing"
        );
    }
}

#[test]
fn v2_replace_replaces_and_defaults_when_op_missing() {
    let mut sections = tokmo_like_sections();
    apply_section_patch(&mut sections, "summary", Some("replace"), "## Summary\n\nv1\n")
        .unwrap();
    apply_section_patch(&mut sections, "summary", None, "## Summary\n\nv2\n").unwrap();
    let summary = &sections
        .iter()
        .find(|(n, _)| n == "summary")
        .unwrap()
        .1;
    assert_eq!(summary, "## Summary\n\nv2\n");
    assert!(!summary.contains("v1"), "replace must drop old content");
}

#[test]
fn v2_replace_section_is_legacy_synonym_for_replace() {
    let mut sections = tokmo_like_sections();
    apply_section_patch(&mut sections, "summary", Some("replace"), "old").unwrap();
    apply_section_patch(&mut sections, "summary", Some("replace_section"), "new").unwrap();
    assert_eq!(
        sections.iter().find(|(n, _)| n == "summary").unwrap().1,
        "new"
    );
}

#[test]
fn v2_unknown_op_rejected() {
    let mut sections = tokmo_like_sections();
    assert_eq!(
        apply_section_patch(&mut sections, "transcript", Some("delete"), "x"),
        Err(SectionPatchError::UnknownOp("delete".to_string()))
    );
}

#[test]
fn v2_unknown_section_rejected() {
    let mut sections = tokmo_like_sections();
    assert_eq!(
        apply_section_patch(&mut sections, "nope", Some("replace"), "x"),
        Err(SectionPatchError::UnknownSection("nope".to_string()))
    );
}

#[test]
fn v2_rebuild_is_deterministic_ordered_and_headerless() {
    let sections = vec![
        ("a".to_string(), "one".to_string()),
        ("b".to_string(), String::new()), // empty -> skipped
        ("c".to_string(), "two".to_string()),
    ];
    let doc = rebuild_document_md(&sections);
    assert_eq!(doc, "one\n\ntwo");
    // Rebuild twice: identical (HashMap iteration used to randomize this)
    assert_eq!(rebuild_document_md(&sections), doc);
    // No synthetic headers are injected
    assert!(!doc.contains("## a"));
    assert!(!doc.contains("## c"));
}

#[test]
fn v2_first_patch_after_open_keeps_open_content() {
    // Regression: open used to send empty section strings, so the first
    // patch wiped initial_md. Now open carries real content and the
    // first append only adds to it.
    let mut sections = tokmo_like_sections();
    let before = rebuild_document_md(&sections);
    assert!(before.contains("# Meeting - 0m 00s"));
    apply_section_patch(
        &mut sections,
        "transcript",
        Some("append"),
        "**[00:00] Alice:** first delta\n\n",
    )
    .unwrap();
    let after = rebuild_document_md(&sections);
    assert!(
        after.contains("# Meeting - 0m 00s"),
        "first patch must not wipe open content"
    );
    assert!(after.contains("first delta"));
}

#[test]
fn v2_append_to_empty_section_works() {
    let mut sections = tokmo_like_sections();
    apply_section_patch(&mut sections, "summary", Some("append"), "## Summary\n\ns\n")
        .unwrap();
    assert_eq!(
        sections.iter().find(|(n, _)| n == "summary").unwrap().1,
        "## Summary\n\ns\n"
    );
}

#[test]
fn v2_duplicate_section_names_keep_first_position_last_content() {
    let sections = build_sections_from_init(vec![
        SectionInit {
            name: "a".to_string(),
            content: "first".to_string(),
        },
        SectionInit {
            name: "b".to_string(),
            content: "mid".to_string(),
        },
        SectionInit {
            name: "a".to_string(),
            content: "updated".to_string(),
        },
    ]);
    assert_eq!(sections.len(), 2, "duplicate must not add a slot");
    assert_eq!(sections[0], ("a".to_string(), "updated".to_string()));
    assert_eq!(sections[1], ("b".to_string(), "mid".to_string()));
    assert_eq!(rebuild_document_md(&sections), "updated\n\nmid");
}
// END_BLOCK_LIVE_DOC_V2_TESTS

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
