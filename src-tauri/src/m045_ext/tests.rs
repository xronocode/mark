// FILE: src-tauri/src/m045_ext/tests.rs
// START_MODULE_CONTRACT
//   PURPOSE: M-045 unit tests for manifest parsing, registry operations,
//            auth helpers, incoming route events and parsed loopback URL policy.
//   SCOPE:   In-process mock-runtime handlers, per-extension dummy credential
//            stores and owned loopback HTTP fixtures. No host keychain or
//            external services. Discovery paths use a synthetic home.
//   DEPENDS: super::*.
//   LINKS:   .grace/verification/features.xml V-M-045;
//            .grace/changes/archive/C-SEC-AUDIT-FIXES.
//   STATUS:  Phase-B2b initial.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   Coverage: GRACE 4 synchronized surface for M-045.
// END_MODULE_MAP

// START_CHANGE_SUMMARY
//   - 2026-11-22 C-EXT-EDIT-PROOF T-003: failing-first /ext/apply verdict
//     and idempotency family — ext_apply_unknown_op_refused_with_zero_events
//     (400, zero events, no applied:true), the ack verdict legs
//     ext_apply_acks_applied_batch_200 / ext_apply_gate_cut_nack_answers_
//     409_with_failed_index / ext_apply_ack_timeout_answers_504 driven by
//     the new install_ack_responder fixture helper (watches the batch's
//     mt::text::op events and answers mt::ext::text_op_ack per a script,
//     silent on a missing entry) and the idempotency family
//     ext_apply_same_key_replay_returns_recorded_verdict (including a
//     refusal replay and the dedup-before-fence order proof),
//     ext_apply_same_key_in_flight_coalesces,
//     ext_apply_different_keys_apply_independently and
//     ext_apply_keyless_applies_once — all driven through the wire-faithful
//     apply_raw JSON path so the optional request_id field rides the same
//     deserialization a real client uses.
//   - 2026-11-22 C-EXT-EDIT-PROOF T-001: failing-first dead-route refusal
//     pins — text_insert_authorized_emits_with_requester_identity moves to
//     text_insert_authorized_request_refused_not_implemented (an authorized
//     /ext/text-insert answers 501 with the stable deprecated-route reason
//     naming the /ext/context + /ext/apply alternative, zero events) and
//     text_insert_authorized_old_shape_body_emits to
//     text_insert_authorized_old_shape_body_still_parses (the v1 body still
//     parses through TextInsertRequest; the honest 501 refusal); the four
//     401 gate pins stay green unchanged; the new command pins
//     mt_ext_text_insert_refuses_when_enabled and
//     mt_ext_text_transform_refuses_when_enabled drive the commands through
//     the mock-runtime fixture registry (stable ext_text_op_refused, zero
//     mt::text::op events) with the get_manifest-refusal companions
//     mt_ext_text_insert_refuses_when_disabled and
//     mt_ext_text_transform_refuses_when_unregistered kept green.
//   - 2026-11-21 C-SEC-EXT-GRANT-BOUND T-004: grant-matrix regressions — the fixture establishes the pairing grant beside the injected secret (plus a grant-less legacy-shape variant), the migrated pin enabled_extension_passes_only_declared_capability_routes keeps name/statuses/event counts while its stream 200 becomes grant-derived and gains a grant-less stream 401, and the new pins pairing_persists_the_captured_grant, grow_after_pairing_enable_is_refused_to_reapproval, stream_requires_stored_stream_document_grant, legacy_credential_without_grant_fails_closed, rebind_refused_when_new_key_fails_verification and pair_keychain_read_error_is_a_distinct_refusal cover F-001/F-002/F-03 fail-closed, grow-refusal and honest-replace semantics; DummyCredential gains a fail_write mode and cleanup clears grants.
//   - 2026-11-20 C-SEC-EDIT-TARGETING: document-bound context/apply matrix — the fixture context responder hands tab-{id} plus a fresh per-request document-gen-N generation and records the last handed pair on the fixture, the apply request literals gain explicit binding arguments (apply_bound beside the unbound apply_fixture), four new pins (context_response_carries_document_binding, apply_requires_binding_fields 400, apply_requires_matching_context_binding 409/200 with the binding inside the op payload, apply_stale_instance_binding_refused), and the C-SEC-STREAM-SCOPE family reconciled without weakening: apply_requires_text_edit_capability and fresh_pairing_restores_access move every apply-200 expectation onto dual-capability (context.read + text.edit) fixtures that read context first, single-capability text.edit applies pin the fence statuses (400/409, zero events), and every auth/capability 401 keeps its status.
//   - 2026-11-20 C-SEC-STREAM-SCOPE: capability-scoped incoming routes — flipped the over-grant pin to per-route denial, added the context/apply permission matrix, the pairing-grant-description unit pin and capability-scoped fresh-pairing restoral.
//   - 2026-11-09 C-SEC-AUDIT-FIXES: named handler, revocation and recipient/redirect regressions.
// END_CHANGE_SUMMARY

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
        session_epoch: 1,
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
        budget: super::live_server::StreamBudget::at_burst(Instant::now()),
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
        session_epoch: 1,
        session_id: "s1".to_string(),
        extension_id: "com.tokmo.voice".to_string(),
        last_seq: 42,
        revision: 99,
        document_md: "stale".to_string(),
        sections: vec![],
        budget: super::live_server::StreamBudget::at_burst(std::time::Instant::now()),
        active: true,
        last_heartbeat: std::time::Instant::now(),
    };
    assert_eq!(
        decide_open(Some(&session), "s1", "com.tokmo.voice"),
        OpenDecision::ReplaceSameSession
    );
}

#[test]
fn v2_open_different_active_session_conflicts() {
    let session = LiveSession {
        session_epoch: 1,
        session_id: "s1".to_string(),
        extension_id: "com.tokmo.voice".to_string(),
        last_seq: 0,
        revision: 1,
        document_md: String::new(),
        sections: vec![],
        budget: super::live_server::StreamBudget::at_burst(std::time::Instant::now()),
        active: true,
        last_heartbeat: std::time::Instant::now(),
    };
    assert_eq!(decide_open(Some(&session), "s2", "com.tokmo.voice"), OpenDecision::Conflict);
}

#[test]
fn v2_open_after_close_or_without_session_is_fresh() {
    assert_eq!(decide_open(None, "s1", "com.tokmo.voice"), OpenDecision::FreshOpen);
    let mut closed = LiveSession {
        session_epoch: 1,
        session_id: "s1".to_string(),
        extension_id: "com.tokmo.voice".to_string(),
        last_seq: 0,
        revision: 1,
        document_md: String::new(),
        sections: vec![],
        budget: super::live_server::StreamBudget::at_burst(std::time::Instant::now()),
        active: true,
        last_heartbeat: std::time::Instant::now(),
    };
    closed.active = false;
    assert_eq!(decide_open(Some(&closed), "s1", "com.tokmo.voice"), OpenDecision::FreshOpen);
    assert_eq!(decide_open(Some(&closed), "s2", "com.tokmo.voice"), OpenDecision::FreshOpen);
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
    // C-15 T-W2: compare real PathBufs instead of a forward-slash string
    // match (which broke on Windows where join uses '\') — and assert
    // against the ACTUAL discovery::extension_dirs() output rather than
    // re-deriving the path in the test.
    if let Some(home) = std::env::var_os("HOME") {
        let expected = std::path::Path::new(&home)
            .join(".config")
            .join("mark")
            .join("extensions");
        let dirs = super::discovery::extension_dirs();
        assert!(
            dirs.iter().any(|d| d == &expected),
            "expected {expected:?} among {dirs:?}"
        );
    }
}
// END_BLOCK_DISCOVERY_PATH_TESTS

// START_BLOCK_INCOMING_DATA_TESTS
use axum::{extract::State, http::{HeaderMap, StatusCode}, response::IntoResponse, Json};
use std::sync::{Arc, Mutex};
use tauri::{Emitter, Listener, Manager};

struct IncomingFixture {
    app: tauri::App<tauri::test::MockRuntime>,
    state: Arc<super::live_server::LiveServerState<tauri::test::MockRuntime>>,
    events: Arc<Mutex<Vec<serde_json::Value>>>,
    id: String,
    token: String,
    credential: Arc<DummyCredential>,
    live_events: Arc<Mutex<Vec<serde_json::Value>>>,
    // C-SEC-EDIT-TARGETING: the last (document_id, document_generation)
    // pair the context responder handed, recorded for apply-side assertions.
    last_binding: Arc<Mutex<Option<(String, String)>>>,
}

fn incoming_fixture(enabled: bool, capability: &str) -> IncomingFixture {
    incoming_fixture_caps(enabled, &[capability])
}

/// Paired-and-granted semantics: the fixture stores the pairing grant —
/// the manifest's incoming subset in RouteCapability::all() order —
/// beside the injected secret, so every route pin keeps its meaning
/// under C-SEC-EXT-GRANT-BOUND.
fn incoming_fixture_caps(enabled: bool, capabilities: &[&str]) -> IncomingFixture {
    incoming_fixture_with_grant(enabled, capabilities, true)
}

/// Grant-less variant: the legacy/migration shape — an enabled credential
/// with no stored grant, refused on every incoming route until a fresh
/// pairing re-approves it (pinned by legacy_credential_without_grant_fails_closed).
fn incoming_fixture_grantless(enabled: bool, capability: &str) -> IncomingFixture {
    incoming_fixture_with_grant(enabled, &[capability], false)
}

fn incoming_fixture_with_grant(enabled: bool, capabilities: &[&str], grant: bool) -> IncomingFixture {
    static NEXT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    let id = format!("fixture-ext-{}", NEXT.fetch_add(1, std::sync::atomic::Ordering::Relaxed));
    let token = format!("dummy-token-{id}");
    let app = tauri::test::mock_app();
    app.manage(ExtRegistry::new());
    let registry = app.state::<ExtRegistry>();
    let mut manifest = test_manifest(&id);
    manifest.capabilities = capabilities.iter()
        .map(|name| Capability { name: (*name).to_string(), version: 1 })
        .collect();
    registry.register(manifest, true).unwrap();
    if enabled { registry.enable(&id).unwrap(); }
    super::auth::inject_test_secret(&id, &token);
    let credential = Arc::new(DummyCredential::default());
    *credential.persistent.lock().unwrap() = Some(token.clone());
    super::auth::inject_test_backend(&id, Ok(credential.clone()));
    // C-SEC-EXT-GRANT-BOUND: the grant lives beside the credential through
    // an independent grant backend, so secret and grant stores fail
    // independently.
    if grant {
        let incoming = super::live_server::incoming_capability_names();
        let approved: Vec<String> = incoming.into_iter()
            .filter(|name| capabilities.iter().any(|cap| cap == name))
            .map(str::to_string)
            .collect();
        let grant_store = Arc::new(DummyCredential::default());
        *grant_store.persistent.lock().unwrap() =
            Some(serde_json::to_string(&approved).unwrap());
        super::auth::inject_test_grant_backend(&id, Ok(grant_store));
        super::auth::store_grant(&id, &approved).unwrap();
    }
    let events = Arc::new(Mutex::new(Vec::new()));
    let seen = events.clone();
    app.listen("mt::text::op", move |event| {
        seen.lock().unwrap().push(serde_json::from_str(event.payload()).unwrap());
    });
    let state = Arc::new(super::live_server::LiveServerState {
        session: tokio::sync::Mutex::new(None),
        next_epoch: std::sync::atomic::AtomicU64::new(1),
        app_handle: app.handle().clone(),
        pending_context: Mutex::new(std::collections::HashMap::new()),
    });
    app.manage(state.clone());
    let live_events = Arc::new(Mutex::new(Vec::new()));
    let seen_live = live_events.clone();
    app.listen("mt::live::update", move |event| {
        seen_live.lock().unwrap().push(serde_json::from_str(event.payload()).unwrap());
    });
    let last_binding = Arc::new(Mutex::new(None));
    let weak_state = Arc::downgrade(&state);
    // C-SEC-EDIT-TARGETING: each context round trip hands a fresh generation
    // (a per-request counter), modeling an instance replacement between two
    // reads; the fixture records the last handed pair for assertions.
    let handed_seq = Arc::new(std::sync::atomic::AtomicU64::new(0));
    let fixture_id = id.clone();
    let seq = handed_seq.clone();
    let handed = last_binding.clone();
    app.listen("mt::ext::context_request", move |event| {
        let payload: serde_json::Value = serde_json::from_str(event.payload()).unwrap();
        let state = weak_state.upgrade().unwrap();
        let tx = state.pending_context.lock().unwrap().remove(payload["request_id"].as_str().unwrap());
        if let Some(tx) = tx {
            let n = seq.fetch_add(1, std::sync::atomic::Ordering::Relaxed) + 1;
            let response = super::live_server::ExtContextResponse {
                markdown: "dummy context".to_string(), cursor: None, selection: None, file_path: None,
                document_id: Some(format!("tab-{fixture_id}")),
                document_generation: Some(format!("document-gen-{n}")),
            };
            *handed.lock().unwrap() = Some((response.document_id.clone().unwrap(), response.document_generation.clone().unwrap()));
            tx.send(response).unwrap();
        }
    });
    IncomingFixture { app, state, events, id, token, credential, live_events, last_binding }
}

fn handed_binding(f: &IncomingFixture) -> (String, String) {
    f.last_binding.lock().unwrap().clone().expect("fixture context responder handed a binding")
}

fn bearer_headers(token: Option<&str>) -> HeaderMap {
    let mut headers = HeaderMap::new();
    if let Some(token) = token {
        headers.insert("authorization", format!("Bearer {token}").parse().unwrap());
    }
    headers
}

async fn insert_fixture(fixture: &IncomingFixture, token: Option<&str>) -> StatusCode {
    let req = serde_json::from_value(serde_json::json!({"text": "fixture text", "source": "fixture"})).unwrap();
    super::live_server::handle_text_insert(State(fixture.state.clone()), bearer_headers(token), Json(req))
        .await.into_response().status()
}

#[tokio::test]
async fn text_insert_refuses_no_token() {
    let f = incoming_fixture(true, "text.insert");
    assert_eq!(insert_fixture(&f, None).await, StatusCode::UNAUTHORIZED);
    assert!(f.events.lock().unwrap().is_empty());
}

#[tokio::test]
async fn text_insert_refuses_wrong_token() {
    let f = incoming_fixture(true, "text.insert");
    assert_eq!(insert_fixture(&f, Some("dummy-wrong-token")).await, StatusCode::UNAUTHORIZED);
    assert!(f.events.lock().unwrap().is_empty());
}

#[tokio::test]
async fn text_insert_refuses_disabled_extension() {
    let f = incoming_fixture(false, "text.insert");
    assert_eq!(insert_fixture(&f, Some(&f.token)).await, StatusCode::UNAUTHORIZED);
    assert!(f.events.lock().unwrap().is_empty());
    assert_eq!(f.credential.reads.load(std::sync::atomic::Ordering::Relaxed), 0);
}

#[tokio::test]
async fn text_insert_refuses_missing_capability() {
    let f = incoming_fixture(true, "stream.document");
    assert_eq!(insert_fixture(&f, Some(&f.token)).await, StatusCode::UNAUTHORIZED);
    assert!(f.events.lock().unwrap().is_empty());
    assert_eq!(f.credential.reads.load(std::sync::atomic::Ordering::Relaxed), 0);
}

// C-EXT-EDIT-PROOF: the authorized /ext/text-insert request is refused at
// the source — the deprecated unbound route answers 501 NOT_IMPLEMENTED
// with a stable machine reason naming the live /ext/context read plus
// /ext/apply alternative and emits no mt::text::op event the editor
// targeting gate would drop anyway.

#[tokio::test]
async fn text_insert_authorized_request_refused_not_implemented() {
    let f = incoming_fixture(true, "text.insert");
    let response = super::live_server::handle_text_insert(State(f.state.clone()), bearer_headers(Some(&f.token)),
        Json(serde_json::from_value(serde_json::json!({"text": "fixture text", "source": "fixture"})).unwrap()))
        .await.into_response();
    assert_eq!(response.status(), StatusCode::NOT_IMPLEMENTED);
    let bytes = axum::body::to_bytes(response.into_body(), 8192).await.unwrap();
    let body: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
    let error = body["error"].as_str().unwrap().to_string();
    assert!(error.contains("text-insert route deprecated"), "error must name the deprecated route: {error}");
    assert!(error.contains("/ext/context"), "error must name the live read alternative: {error}");
    assert!(error.contains("/ext/apply"), "error must name the live apply alternative: {error}");
    assert!(f.events.lock().unwrap().is_empty(), "zero mt::text::op events on the route refusal");
    assert_eq!(f.credential.reads.load(std::sync::atomic::Ordering::Relaxed), 1);
}

#[tokio::test]
async fn text_insert_authorized_old_shape_body_still_parses() {
    let f = incoming_fixture(true, "text.insert");
    // The actual server schema still deserializes the v1 body without an id
    // field — the request shape stays frozen; only the honest refusal moves.
    let req: super::live_server::TextInsertRequest = serde_json::from_str(r#"{"text":"old body","source":"paired fixture"}"#).unwrap();
    let response = super::live_server::handle_text_insert(State(f.state.clone()), bearer_headers(Some(&f.token)), Json(req))
        .await.into_response();
    assert_eq!(response.status(), StatusCode::NOT_IMPLEMENTED);
    let bytes = axum::body::to_bytes(response.into_body(), 8192).await.unwrap();
    let body: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
    assert!(body["error"].as_str().unwrap().contains("text-insert route deprecated"));
    assert!(f.events.lock().unwrap().is_empty());
    assert_eq!(f.credential.reads.load(std::sync::atomic::Ordering::Relaxed), 1);
}

// START_BLOCK_EXT_TEXT_OPS_COMMAND_TESTS
// C-EXT-EDIT-PROOF: the mt_ext_text_insert / mt_ext_text_transform commands
// refuse on a registered, enabled extension — their unbound events are
// dropped by the editor targeting gate, so the dead command routes answer
// the stable string-code refusal instead of emitting; the registry
// get_manifest refusals (disabled / unregistered) keep their existing
// semantics unchanged.

#[tokio::test]
async fn mt_ext_text_insert_refuses_when_enabled() {
    let f = incoming_fixture(true, "text.insert");
    let error = super::mt_ext_text_insert(
        f.app.handle().clone(), f.id.clone(), "fixture text".to_string(), None, f.app.state::<ExtRegistry>(),
    ).await.unwrap_err();
    assert_eq!(error, "ext_text_op_refused");
    assert!(f.events.lock().unwrap().is_empty(), "zero mt::text::op events on the command refusal");
    assert_eq!(f.credential.reads.load(std::sync::atomic::Ordering::Relaxed), 0);
}

#[tokio::test]
async fn mt_ext_text_transform_refuses_when_enabled() {
    let f = incoming_fixture(true, "text.insert");
    let error = super::mt_ext_text_transform(
        f.app.handle().clone(), f.id.clone(), "fixture text".to_string(), f.app.state::<ExtRegistry>(),
    ).await.unwrap_err();
    assert_eq!(error, "ext_text_op_refused");
    assert!(f.events.lock().unwrap().is_empty(), "zero mt::text::op events on the command refusal");
    assert_eq!(f.credential.reads.load(std::sync::atomic::Ordering::Relaxed), 0);
}

#[tokio::test]
async fn mt_ext_text_insert_refuses_when_disabled() {
    let f = incoming_fixture(false, "text.insert");
    let error = super::mt_ext_text_insert(
        f.app.handle().clone(), f.id.clone(), "fixture text".to_string(), None, f.app.state::<ExtRegistry>(),
    ).await.unwrap_err();
    assert!(error.contains("disabled"), "{error}");
    assert!(f.events.lock().unwrap().is_empty());
}

#[tokio::test]
async fn mt_ext_text_transform_refuses_when_unregistered() {
    let f = incoming_fixture(true, "text.insert");
    let missing = format!("{}-never-registered", f.id);
    let error = super::mt_ext_text_transform(
        f.app.handle().clone(), missing, "fixture text".to_string(), f.app.state::<ExtRegistry>(),
    ).await.unwrap_err();
    assert!(error.contains("not found"), "{error}");
    assert!(f.events.lock().unwrap().is_empty());
}
// END_BLOCK_EXT_TEXT_OPS_COMMAND_TESTS

#[tokio::test]
async fn context_requires_context_read_capability() {
    let f = incoming_fixture(true, "context.read");
    assert_eq!(context_fixture(&f, &f.token).await, StatusCode::OK);
    assert_eq!(apply_fixture(&f, &f.token).await, StatusCode::UNAUTHORIZED);
    assert_eq!(insert_fixture(&f, Some(&f.token)).await, StatusCode::UNAUTHORIZED);
    assert!(f.events.lock().unwrap().is_empty());
    // A sibling class does not grant context either.
    let edit_only = incoming_fixture(true, "text.edit");
    assert_eq!(context_fixture(&edit_only, &edit_only.token).await, StatusCode::UNAUTHORIZED);
    assert!(edit_only.events.lock().unwrap().is_empty());
}

#[tokio::test]
async fn apply_requires_text_edit_capability() {
    // Happy path moved to a dual-capability fixture: the context read
    // precedes the successful apply and the fence lets the echoed binding
    // through.
    let f = incoming_fixture_caps(true, &["context.read", "text.edit"]);
    assert_eq!(context_fixture(&f, &f.token).await, StatusCode::OK);
    let (document_id, document_generation) = handed_binding(&f);
    assert_eq!(apply_bound(&f, &f.token, Some(document_id), Some(document_generation)).await, StatusCode::OK);
    {
        let events = f.events.lock().unwrap();
        assert_eq!(events.len(), 1);
        assert_eq!(events[0]["op_type"], "insert");
        assert_eq!(events[0]["extension_id"], f.id);
        assert_eq!(events[0]["payload"]["text"], "fixture edit");
    }
    assert_eq!(insert_fixture(&f, Some(&f.token)).await, StatusCode::UNAUTHORIZED);
    // A sibling class does not grant apply either, and emits nothing.
    let read_only = incoming_fixture(true, "context.read");
    assert_eq!(apply_fixture(&read_only, &read_only.token).await, StatusCode::UNAUTHORIZED);
    assert!(read_only.events.lock().unwrap().is_empty());
    // A text.edit-only fixture still cannot read context.
    let edit_only = incoming_fixture(true, "text.edit");
    assert_eq!(context_fixture(&edit_only, &edit_only.token).await, StatusCode::UNAUTHORIZED);
    assert!(edit_only.events.lock().unwrap().is_empty());
    // Its apply now passes the capability gate but the binding fence refuses
    // before any event: a never-issued binding answers 409 CONFLICT, the
    // unbound legacy shape answers 400 BAD_REQUEST.
    assert_eq!(apply_bound(&edit_only, &edit_only.token, Some("tab-never-handed".to_string()), Some("document-gen-never-handed".to_string())).await, StatusCode::CONFLICT);
    assert_eq!(apply_fixture(&edit_only, &edit_only.token).await, StatusCode::BAD_REQUEST);
    assert!(edit_only.events.lock().unwrap().is_empty());
}

// C-SEC-EDIT-TARGETING binding matrix: the /ext/context response names the
// observed document instance, /ext/apply must echo that binding, and both
// rejection classes precede any mt::text::op emission and never answer
// applied: true.

#[tokio::test]
async fn context_response_carries_document_binding() {
    let f = incoming_fixture(true, "context.read");
    let response = super::live_server::handle_ext_context(State(f.state.clone()), bearer_headers(Some(&f.token)),
        Json(super::live_server::ExtContextRequest { extension_id: f.id.clone() }))
        .await.into_response();
    assert_eq!(response.status(), StatusCode::OK);
    let bytes = axum::body::to_bytes(response.into_body(), 8192).await.unwrap();
    let body: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(body["document_id"], format!("tab-{}", f.id));
    assert_eq!(body["document_generation"], "document-gen-1");
    assert_eq!(handed_binding(&f), (format!("tab-{}", f.id), "document-gen-1".to_string()));
    // A second context read hands a fresh generation — an instance
    // replacement invalidates the pair the first read handed.
    assert_eq!(context_fixture(&f, &f.token).await, StatusCode::OK);
    assert_eq!(handed_binding(&f), (format!("tab-{}", f.id), "document-gen-2".to_string()));
    assert!(f.events.lock().unwrap().is_empty());
}

#[tokio::test]
async fn apply_requires_binding_fields() {
    let f = incoming_fixture_caps(true, &["context.read", "text.edit"]);
    assert_eq!(context_fixture(&f, &f.token).await, StatusCode::OK);
    let (document_id, document_generation) = handed_binding(&f);
    // A legacy client omitting a binding field receives the distinct logged
    // 400 — not an extractor rejection and not a 409 — before any event.
    assert_eq!(apply_bound(&f, &f.token, None, Some(document_generation.clone())).await, StatusCode::BAD_REQUEST);
    assert_eq!(apply_bound(&f, &f.token, Some(document_id.clone()), None).await, StatusCode::BAD_REQUEST);
    assert_eq!(apply_bound(&f, &f.token, None, None).await, StatusCode::BAD_REQUEST);
    assert!(f.events.lock().unwrap().is_empty());
}

#[tokio::test]
async fn apply_requires_matching_context_binding() {
    let f = incoming_fixture_caps(true, &["context.read", "text.edit"]);
    // Apply before any context read: a well-formed but never-issued binding
    // has nothing to match — 409 with zero events.
    assert_eq!(apply_bound(&f, &f.token, Some(format!("tab-{}", f.id)), Some("document-gen-1".to_string())).await, StatusCode::CONFLICT);
    assert!(f.events.lock().unwrap().is_empty());
    // After the context read the exact handed pair is accepted, and the
    // binding travels inside the emitted op payload.
    assert_eq!(context_fixture(&f, &f.token).await, StatusCode::OK);
    let (document_id, document_generation) = handed_binding(&f);
    assert_eq!(apply_bound(&f, &f.token, Some(document_id.clone()), Some(document_generation.clone())).await, StatusCode::OK);
    let events = f.events.lock().unwrap();
    assert_eq!(events.len(), 1);
    assert_eq!(events[0]["op_type"], "insert");
    assert_eq!(events[0]["extension_id"], f.id);
    assert_eq!(events[0]["payload"]["document_id"], document_id);
    assert_eq!(events[0]["payload"]["document_generation"], document_generation);
}

#[tokio::test]
async fn apply_stale_instance_binding_refused() {
    let f = incoming_fixture_caps(true, &["context.read", "text.edit"]);
    // First instance: gen-1 is handed and the matching apply is applied.
    assert_eq!(context_fixture(&f, &f.token).await, StatusCode::OK);
    let (document_id, generation_1) = handed_binding(&f);
    assert_eq!(generation_1, "document-gen-1");
    assert_eq!(apply_bound(&f, &f.token, Some(document_id.clone()), Some(generation_1.clone())).await, StatusCode::OK);
    assert_eq!(f.events.lock().unwrap().len(), 1);
    // A second context read models an instance replacement (gen-2).
    assert_eq!(context_fixture(&f, &f.token).await, StatusCode::OK);
    let (_, generation_2) = handed_binding(&f);
    assert_eq!(generation_2, "document-gen-2");
    // The stale gen-1 apply is refused with zero new events ...
    assert_eq!(apply_bound(&f, &f.token, Some(document_id.clone()), Some(generation_1)).await, StatusCode::CONFLICT);
    // ... and so is an apply naming a wrong document_id.
    assert_eq!(apply_bound(&f, &f.token, Some("tab-somewhere-else".to_string()), Some(generation_2.clone())).await, StatusCode::CONFLICT);
    assert_eq!(f.events.lock().unwrap().len(), 1);
    // The current instance still applies.
    assert_eq!(apply_bound(&f, &f.token, Some(document_id), Some(generation_2)).await, StatusCode::OK);
    assert_eq!(f.events.lock().unwrap().len(), 2);
}
// END_BLOCK_INCOMING_DATA_TESTS

impl Drop for IncomingFixture {
    fn drop(&mut self) {
        super::auth::clear_test_secret(&self.id);
        super::auth::clear_test_grant(&self.id);
    }
}

// START_BLOCK_EXT_APPLY_VERDICT_TESTS
// C-EXT-EDIT-PROOF: /ext/apply answers by fact — the op set is validated
// before any emission, every emitted payload carries the server-issued
// batch request id and its op index, and the handler answers by the
// renderer's ack verdicts (200 applied / 409 failed index with the applied
// prefix / 504 bounded ack timeout). Apply batches are idempotent by the
// optional client request id: a replay answers the recorded first verdict
// with an additive duplicate marker and re-emits nothing, a same-key
// in-flight retry coalesces onto the pending verdict, and a keyless batch
// applies with no dedup promise. The binding fence stays ahead of every
// event; the dedup short-circuit sits after authentication and before the
// fence.

/// The per-op ack script: op_index -> Some((applied, reason)); a missing
/// index or a None entry stays silent, modeling a swallowed verdict or a
/// torn-down renderer listener.
type AckScript = Arc<Mutex<std::collections::HashMap<u64, Option<(bool, String)>>>>;

/// C-EXT-EDIT-PROOF: the renderer-side ack responder beside the
/// mt::ext::context_request responder. It watches the batch's mt::text::op
/// events and, per the script, answers mt::ext::text_op_ack
/// {request_id, op_index, applied, reason}; silence is the default, so all
/// verdict legs (200/409/504) are drivable headlessly.
fn install_ack_responder(f: &IncomingFixture, script: AckScript) {
    let handle = f.app.handle().clone();
    f.app.listen("mt::text::op", move |event| {
        let payload: serde_json::Value = serde_json::from_str(event.payload()).unwrap();
        let request_id = payload["payload"]["request_id"].as_str().map(str::to_string);
        let op_index = payload["payload"]["op_index"].as_u64();
        let (Some(request_id), Some(op_index)) = (request_id, op_index) else { return };
        let answer = script.lock().unwrap().get(&op_index).cloned().flatten();
        if let Some((applied, reason)) = answer {
            handle.emit("mt::ext::text_op_ack", serde_json::json!({
                "request_id": request_id,
                "op_index": op_index,
                "applied": applied,
                "reason": reason,
            })).unwrap();
        }
    });
}

fn ack_script(entries: &[(u64, bool, &str)]) -> AckScript {
    Arc::new(Mutex::new(entries.iter()
        .map(|(index, applied, reason)| (*index, Some((*applied, (*reason).to_string()))))
        .collect::<std::collections::HashMap<_, _>>()))
}

/// Drive /ext/apply with a raw JSON request body — wire-faithful: the
/// optional request id rides the same deserialization a real client uses
/// (a field this build does not know is ignored by serde), and the handler
/// runs concurrently so the fixture ack responder owns the verdict channel
/// while the batch is pending.
async fn apply_raw(f: &IncomingFixture, token: &str, request: serde_json::Value) -> (StatusCode, serde_json::Value) {
    let state = f.state.clone();
    let headers = bearer_headers(Some(token));
    let req: super::live_server::ExtApplyRequest = serde_json::from_value(request).unwrap();
    let pending = tokio::spawn(async move {
        super::live_server::handle_ext_apply(State(state), headers, Json(req)).await.into_response()
    });
    let response = tokio::time::timeout(std::time::Duration::from_secs(60), pending)
        .await
        .expect("apply round trip must finish well within the fixture budget")
        .unwrap();
    let status = response.status();
    let bytes = axum::body::to_bytes(response.into_body(), 65536).await.unwrap();
    let body: serde_json::Value = serde_json::from_slice(&bytes).unwrap_or(serde_json::Value::Null);
    (status, body)
}

async fn bound_apply_request(f: &IncomingFixture, operations: serde_json::Value) -> serde_json::Value {
    let (document_id, document_generation) = handed_binding(f);
    serde_json::json!({
        "extension_id": f.id.clone(),
        "document_id": document_id,
        "document_generation": document_generation,
        "operations": operations,
    })
}

#[tokio::test]
async fn ext_apply_unknown_op_refused_with_zero_events() {
    let f = incoming_fixture_caps(true, &["context.read", "text.edit"]);
    assert_eq!(context_fixture(&f, &f.token).await, StatusCode::OK);
    let request = bound_apply_request(&f, serde_json::json!([
        {"op_type": "insert_at_cursor", "content": "valid op"},
        {"op_type": "op_type_the_wire_never_defined", "content": "??"}
    ])).await;
    let (status, body) = apply_raw(&f, &f.token, request).await;
    // The unknown op refuses the whole batch before any emission — never
    // the skipped-and-counted 200 the predecessor answered.
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert!(body.get("applied").is_none(), "a refused batch never answers applied: {body}");
    assert!(f.events.lock().unwrap().is_empty(), "zero events: an unvalidated op never emits");
}

#[tokio::test]
async fn ext_apply_acks_applied_batch_200() {
    let f = incoming_fixture_caps(true, &["context.read", "text.edit"]);
    assert_eq!(context_fixture(&f, &f.token).await, StatusCode::OK);
    install_ack_responder(&f, ack_script(&[(0, true, ""), (1, true, "")]));
    let request = bound_apply_request(&f, serde_json::json!([
        {"op_type": "insert_at_cursor", "content": "first"},
        {"op_type": "replace_selection", "content": "second"}
    ])).await;
    let (status, body) = apply_raw(&f, &f.token, request).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["applied"], true);
    assert_eq!(body["operations_count"], 2);
    let events = f.events.lock().unwrap();
    assert_eq!(events.len(), 2);
    // Every emitted payload names the server-issued batch request id and
    // the op index; both ops of one batch share the request id and the
    // binding still rides the payload.
    let request_id = events[0]["payload"]["request_id"].as_str().unwrap().to_string();
    assert!(!request_id.is_empty(), "the batch request id is server-issued and non-empty");
    assert_eq!(events[0]["payload"]["op_index"], 0);
    assert_eq!(events[1]["payload"]["op_index"], 1);
    assert_eq!(events[1]["payload"]["request_id"], request_id.as_str());
    assert_eq!(events[0]["payload"]["document_generation"], handed_binding(&f).1);
}

#[tokio::test]
async fn ext_apply_gate_cut_nack_answers_409_with_failed_index() {
    let f = incoming_fixture_caps(true, &["context.read", "text.edit"]);
    assert_eq!(context_fixture(&f, &f.token).await, StatusCode::OK);
    // Op 0 applies, op 1 is cut by the targeting gate class.
    install_ack_responder(&f, ack_script(&[(0, true, ""), (1, false, "targeting_gate_refused")]));
    let request = bound_apply_request(&f, serde_json::json!([
        {"op_type": "insert_at_cursor", "content": "applies"},
        {"op_type": "replace_selection", "content": "cut"}
    ])).await;
    let (status, body) = apply_raw(&f, &f.token, request).await;
    assert_eq!(status, StatusCode::CONFLICT);
    let error = body["error"].as_str().unwrap().to_string();
    assert!(error.contains("1"), "the error names the failed op index: {error}");
    assert!(error.contains("1 of 1 earlier operations applied"), "the error names the applied prefix: {error}");
    assert!(body.get("applied").is_none(), "a refused batch never answers applied: {body}");
    // Zero further events: emission stops at the nacked op.
    assert_eq!(f.events.lock().unwrap().len(), 2, "op 0 emitted, the nacked op emitted, nothing further");
}

#[tokio::test]
async fn ext_apply_ack_timeout_answers_504() {
    let f = incoming_fixture_caps(true, &["context.read", "text.edit"]);
    assert_eq!(context_fixture(&f, &f.token).await, StatusCode::OK);
    // A silent renderer: the ack script holds no entry.
    install_ack_responder(&f, ack_script(&[]));
    let request = bound_apply_request(&f, serde_json::json!([
        {"op_type": "insert_at_cursor", "content": "never acknowledged"}
    ])).await;
    let (status, body) = apply_raw(&f, &f.token, request).await;
    assert_eq!(status, StatusCode::GATEWAY_TIMEOUT);
    let error = body["error"].as_str().unwrap().to_string();
    assert!(error.contains("ack timeout"), "the timeout reason is stable: {error}");
    assert!(body.get("applied").is_none(), "a timed-out batch never answers applied: {body}");
}

#[tokio::test]
async fn ext_apply_same_key_replay_returns_recorded_verdict() {
    // Applied leg: two posts with the same request id emit exactly once and
    // the second response equals the recorded first verdict with an
    // additive duplicate marker.
    let f = incoming_fixture_caps(true, &["context.read", "text.edit"]);
    assert_eq!(context_fixture(&f, &f.token).await, StatusCode::OK);
    install_ack_responder(&f, ack_script(&[(0, true, "")]));
    let request = bound_apply_request(&f, serde_json::json!([
        {"op_type": "insert_at_cursor", "content": "idempotent"}
    ])).await;
    let mut keyed = request.clone();
    keyed["request_id"] = serde_json::json!("key-replay-applied");
    let (status_1, body_1) = apply_raw(&f, &f.token, keyed.clone()).await;
    assert_eq!(status_1, StatusCode::OK);
    assert_eq!(body_1["applied"], true);
    let (status_2, body_2) = apply_raw(&f, &f.token, keyed).await;
    assert_eq!(status_2, status_1);
    assert_eq!(body_2["applied"], body_1["applied"]);
    assert_eq!(body_2["operations_count"], body_1["operations_count"]);
    assert_eq!(body_2["duplicate"], true, "the replay carries the additive duplicate marker");
    assert_eq!(f.events.lock().unwrap().len(), 1, "the replay re-emits nothing");

    // Refusal leg: a recorded refusal verdict replays the same way.
    let refused = incoming_fixture_caps(true, &["context.read", "text.edit"]);
    assert_eq!(context_fixture(&refused, &refused.token).await, StatusCode::OK);
    install_ack_responder(&refused, ack_script(&[(0, false, "targeting_gate_refused")]));
    let request = bound_apply_request(&refused, serde_json::json!([
        {"op_type": "replace_selection", "content": "refused"}
    ])).await;
    let mut keyed_refusal = request.clone();
    keyed_refusal["request_id"] = serde_json::json!("key-replay-refused");
    let (refused_status_1, refused_body_1) = apply_raw(&refused, &refused.token, keyed_refusal.clone()).await;
    assert_eq!(refused_status_1, StatusCode::CONFLICT);
    let (refused_status_2, refused_body_2) = apply_raw(&refused, &refused.token, keyed_refusal).await;
    assert_eq!(refused_status_2, refused_status_1);
    assert_eq!(refused_body_2["error"], refused_body_1["error"]);
    assert_eq!(refused_body_2["duplicate"], true);
    assert_eq!(refused.events.lock().unwrap().len(), 1);

    // Fence-order proof: a context re-read replaces the remembered
    // generation, so the replay echoes a binding the fence would now
    // refuse — yet the dedup short-circuit (which sits after
    // authentication and before the fence) answers the recorded verdict.
    assert_eq!(context_fixture(&f, &f.token).await, StatusCode::OK);
    let (stale_status, stale_body) = apply_raw(&f, &f.token, keyed_clone_of(&f, "key-replay-applied")).await;
    assert_eq!(stale_status, status_1, "the dedup hit precedes the binding fence");
    assert_eq!(stale_body["duplicate"], true);
    assert_eq!(f.events.lock().unwrap().len(), 1, "the replay through the stale binding re-emits nothing");
}

/// Rebuild the bound apply request with the stale first-read generation and
/// the named request key — the replay the dedup must answer ahead of the
/// fence.
fn keyed_clone_of(f: &IncomingFixture, key: &str) -> serde_json::Value {
    let (document_id, _) = handed_binding(f);
    let first_generation = "document-gen-1".to_string();
    serde_json::json!({
        "extension_id": f.id.clone(),
        "request_id": key,
        "document_id": document_id,
        "document_generation": first_generation,
        "operations": [{"op_type": "insert_at_cursor", "content": "idempotent"}],
    })
}

#[tokio::test]
async fn ext_apply_same_key_in_flight_coalesces() {
    let f = incoming_fixture_caps(true, &["context.read", "text.edit"]);
    assert_eq!(context_fixture(&f, &f.token).await, StatusCode::OK);
    install_ack_responder(&f, ack_script(&[(0, true, "")]));
    let mut request = bound_apply_request(&f, serde_json::json!([
        {"op_type": "insert_at_cursor", "content": "coalesced"}
    ])).await;
    request["request_id"] = serde_json::json!("key-in-flight");
    let (status_a, body_a) = apply_raw(&f, &f.token, request.clone()).await;
    let (status_b, body_b) = apply_raw(&f, &f.token, request).await;
    // Both callers share the pending verdict; the coalesced attempt answers
    // the verdict with the duplicate marker instead of emitting again.
    assert_eq!(status_a, StatusCode::OK);
    assert_eq!(status_b, status_a);
    assert_eq!(body_b["applied"], body_a["applied"]);
    assert_eq!(body_a["applied"], true);
    assert_eq!(body_b["duplicate"], true, "the in-flight coalesce carries the duplicate marker");
    assert_eq!(f.events.lock().unwrap().len(), 1, "one emit for the same-key pair");
}

#[tokio::test]
async fn ext_apply_different_keys_apply_independently() {
    let f = incoming_fixture_caps(true, &["context.read", "text.edit"]);
    assert_eq!(context_fixture(&f, &f.token).await, StatusCode::OK);
    install_ack_responder(&f, ack_script(&[(0, true, "")]));
    let request = bound_apply_request(&f, serde_json::json!([
        {"op_type": "insert_at_cursor", "content": "independent"}
    ])).await;
    let mut first = request.clone();
    first["request_id"] = serde_json::json!("key-independent-a");
    let mut second = request;
    second["request_id"] = serde_json::json!("key-independent-b");
    let (status_a, body_a) = apply_raw(&f, &f.token, first).await;
    let (status_b, body_b) = apply_raw(&f, &f.token, second).await;
    assert_eq!(status_a, StatusCode::OK);
    assert_eq!(status_b, StatusCode::OK);
    assert_eq!(body_a["applied"], true);
    assert_eq!(body_b["applied"], true);
    assert!(body_a.get("duplicate").is_none(), "a distinct-key apply is not a duplicate: {body_a}");
    assert!(body_b.get("duplicate").is_none(), "a distinct-key apply is not a duplicate: {body_b}");
    assert_eq!(f.events.lock().unwrap().len(), 2, "distinct keys emit independently");
}

#[tokio::test]
async fn ext_apply_keyless_applies_once() {
    let f = incoming_fixture_caps(true, &["context.read", "text.edit"]);
    assert_eq!(context_fixture(&f, &f.token).await, StatusCode::OK);
    install_ack_responder(&f, ack_script(&[(0, true, "")]));
    // An absent key applies once per post — the server mints its ack
    // correlation id and makes no dedup promise, so no legacy caller is
    // refused and no duplicate marker appears.
    let request = bound_apply_request(&f, serde_json::json!([
        {"op_type": "insert_at_cursor", "content": "keyless"}
    ])).await;
    let (status_a, body_a) = apply_raw(&f, &f.token, request.clone()).await;
    let (status_b, body_b) = apply_raw(&f, &f.token, request).await;
    assert_eq!(status_a, StatusCode::OK);
    assert_eq!(status_b, StatusCode::OK);
    assert_eq!(body_a["applied"], true);
    assert_eq!(body_b["applied"], true);
    assert!(body_a.get("duplicate").is_none(), "a keyless post holds no dedup promise: {body_a}");
    assert_eq!(f.events.lock().unwrap().len(), 2, "each keyless post emits its batch exactly once");
}
// END_BLOCK_EXT_APPLY_VERDICT_TESTS

// START_BLOCK_DISABLE_AUTH_TESTS
#[derive(Default)]
struct DummyCredential {
    persistent: Mutex<Option<String>>,
    fail_delete: std::sync::atomic::AtomicBool,
    fail_read: std::sync::atomic::AtomicBool,
    fail_write: std::sync::atomic::AtomicBool,
    keep_after_delete: std::sync::atomic::AtomicBool,
    reads: std::sync::atomic::AtomicUsize,
    read_pause: Mutex<Option<(std::sync::mpsc::Sender<()>, Arc<(Mutex<bool>, std::sync::Condvar)>)>>,
}

impl super::auth::Credential for DummyCredential {
    fn read(&self) -> Result<Option<String>, String> {
        self.reads.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let pause = self.read_pause.lock().unwrap().take();
        if let Some((entered, release)) = pause {
            entered.send(()).unwrap();
            let (ready, wake) = &*release;
            let guard = ready.lock().unwrap();
            drop(wake.wait_while(guard, |ready| !*ready).unwrap());
        }
        if self.fail_read.load(std::sync::atomic::Ordering::Relaxed) {
            Err("dummy credential read access failed".to_string())
        } else { Ok(self.persistent.lock().unwrap().clone()) }
    }
    fn write(&self, secret: &str) -> Result<(), String> {
        if self.fail_write.load(std::sync::atomic::Ordering::Relaxed) {
            return Err("dummy credential write access failed".to_string());
        }
        *self.persistent.lock().unwrap() = Some(secret.to_string());
        Ok(())
    }
    fn delete(&self) -> Result<(), String> {
        if self.fail_delete.load(std::sync::atomic::Ordering::Relaxed) {
            return Err("dummy credential delete failed".to_string());
        }
        if !self.keep_after_delete.load(std::sync::atomic::Ordering::Relaxed) {
            *self.persistent.lock().unwrap() = None;
        }
        Ok(())
    }
}

async fn context_fixture(f: &IncomingFixture, token: &str) -> StatusCode {
    super::live_server::handle_ext_context(State(f.state.clone()), bearer_headers(Some(token)),
        Json(super::live_server::ExtContextRequest { extension_id: f.id.clone() }))
        .await.into_response().status()
}

/// The unbound legacy apply shape (no binding fields) — every pre-fence
/// refusal pin (401) keeps using it.
async fn apply_fixture(f: &IncomingFixture, token: &str) -> StatusCode {
    apply_bound(f, token, None, None).await
}

/// C-SEC-EDIT-TARGETING: an apply carrying explicit binding arguments — the
/// fence classification (400 missing / 409 mismatch / 200 matched) depends
/// on this pair and the remembered /ext/context binding.
async fn apply_bound(
    f: &IncomingFixture,
    token: &str,
    document_id: Option<String>,
    document_generation: Option<String>,
) -> StatusCode {
    super::live_server::handle_ext_apply(State(f.state.clone()), bearer_headers(Some(token)),
        Json(super::live_server::ExtApplyRequest {
            extension_id: f.id.clone(), undo_label: None,
            document_id, document_generation,
            operations: vec![super::live_server::EditOperation { op_type: "insert_at_cursor".to_string(), content: Some("fixture edit".to_string()) }],
        })).await.into_response().status()
}

async fn assert_old_token_fenced(f: &IncomingFixture) {
    assert_eq!(context_fixture(f, &f.token).await, StatusCode::UNAUTHORIZED);
    assert_eq!(apply_fixture(f, &f.token).await, StatusCode::UNAUTHORIZED);
    assert_eq!(insert_fixture(f, Some(&f.token)).await, StatusCode::UNAUTHORIZED);
    assert!(f.events.lock().unwrap().is_empty());
}

#[tokio::test]
async fn disable_revokes_and_verifies_absence() {
    let f = incoming_fixture(true, "text.insert");
    // Persistent NoEntry alone cannot prove absence while memory still holds a token.
    *f.credential.persistent.lock().unwrap() = None;
    assert!(super::auth::verify_secret_absent(&f.id).is_err());
    assert_eq!(super::auth::get_secret(&f.id).unwrap().as_deref(), Some(f.token.as_str()));
    *f.credential.persistent.lock().unwrap() = Some(f.token.clone());
    super::mt_ext_disable(f.id.clone(), f.app.state(), f.app.handle().clone()).await.unwrap();
    super::auth::verify_secret_absent(&f.id).unwrap();
    assert!(super::auth::get_secret(&f.id).unwrap().is_none());
    assert!(f.credential.persistent.lock().unwrap().is_none());
    assert!(!super::auth::validate_token(&f.id, &f.token));
    assert_old_token_fenced(&f).await;
    // Confirmed missing credentials remain a successful, idempotent disable.
    super::mt_ext_disable(f.id.clone(), f.app.state(), f.app.handle().clone()).await.unwrap();
}

#[tokio::test]
async fn disable_surfaces_revoke_failure() {
    let f = incoming_fixture(true, "text.insert");
    f.credential.fail_delete.store(true, std::sync::atomic::Ordering::Relaxed);
    assert_eq!(super::mt_ext_disable(f.id.clone(), f.app.state(), f.app.handle().clone()).await.unwrap_err(), "ext_disable_revoke_failed");
    assert!(f.app.state::<ExtRegistry>().get_manifest(&f.id).is_err());
    assert_eq!(f.credential.persistent.lock().unwrap().as_deref(), Some(f.token.as_str()));
    assert!(super::auth::validate_token(&f.id, &f.token), "the enabled-state gate must fence a still-valid persistent token");
    assert_old_token_fenced(&f).await;
}

#[tokio::test]
async fn disable_refuses_unverified_revocation() {
    for mode in ["entry", "read", "survives"] {
        let f = incoming_fixture(true, "text.insert");
        match mode {
            "entry" => super::auth::inject_test_backend(&f.id, Err("dummy credential entry creation failed".to_string())),
            "read" => f.credential.fail_read.store(true, std::sync::atomic::Ordering::Relaxed),
            _ => f.credential.keep_after_delete.store(true, std::sync::atomic::Ordering::Relaxed),
        }
        assert_eq!(super::mt_ext_disable(f.id.clone(), f.app.state(), f.app.handle().clone()).await.unwrap_err(), "ext_disable_revoke_failed", "{mode}");
        assert!(super::auth::verify_secret_absent(&f.id).is_err(), "{mode}");
        assert_old_token_fenced(&f).await;
        if mode != "survives" {
            // The best-effort read can be None on backend failure; it cannot
            // supply the strict absence proof needed by successful disable.
            assert!(super::auth::get_secret(&f.id).unwrap().is_none());
        }
    }
}

#[tokio::test]
async fn enabled_extension_passes_only_declared_capability_routes() {
    let f = incoming_fixture(true, "text.insert");
    assert_eq!(context_fixture(&f, &f.token).await, StatusCode::UNAUTHORIZED);
    assert_eq!(apply_fixture(&f, &f.token).await, StatusCode::UNAUTHORIZED);
    // C-EXT-EDIT-PROOF: the declared route still admits the caller past the
    // gate — where the deprecated insert route answers the honest 501 with
    // zero events instead of the removed ok:true emission.
    assert_eq!(insert_fixture(&f, Some(&f.token)).await, StatusCode::NOT_IMPLEMENTED);
    assert!(f.events.lock().unwrap().is_empty());
    let other = incoming_fixture(true, "stream.document");
    assert_eq!(context_fixture(&other, &other.token).await, StatusCode::UNAUTHORIZED);
    assert_eq!(apply_fixture(&other, &other.token).await, StatusCode::UNAUTHORIZED);
    assert!(other.events.lock().unwrap().is_empty());
    assert_eq!(insert_fixture(&other, Some(&other.token)).await, StatusCode::UNAUTHORIZED);
    // The owned stream route keeps working under C-SEC-STREAM-AUTH fencing;
    // since C-SEC-EXT-GRANT-BOUND its 200 is grant-derived — the stored
    // stream.document grant, not the live manifest, authorizes it.
    assert_eq!(stream_open_fixture(&other, &other.id, &other.token, "session-a").await.status(), StatusCode::OK);
    // F-002 pin: a stream.document credential without a stored grant is
    // refused at open even while enabled and its manifest declares the
    // capability.
    let grantless = incoming_fixture_grantless(true, "stream.document");
    assert_eq!(stream_open_fixture(&grantless, &grantless.id, &grantless.token, "session-g").await.status(), StatusCode::UNAUTHORIZED);
    assert!(grantless.events.lock().unwrap().is_empty());
    assert!(grantless.live_events.lock().unwrap().is_empty());
}

#[test]
fn pairing_grant_description_names_only_declared_capabilities() {
    let stream_only = super::live_server::pairing_grant_description(
        "TokMo", "tokmo", &["stream.document".to_string()]);
    assert!(stream_only.contains("send streamed documents to Mark"), "{stream_only}");
    assert!(!stream_only.contains("read the current text of the active tab"), "{stream_only}");
    assert!(!stream_only.contains("edit the current text of the active tab"), "{stream_only}");

    // Declared in reverse all() order to pin the fixed dialog listing order.
    let read_edit = super::live_server::pairing_grant_description(
        "Editor", "editor", &["text.edit".to_string(), "context.read".to_string()]);
    let read_pos = read_edit.find("read the current text of the active tab");
    let edit_pos = read_edit.find("edit the current text of the active tab");
    assert!(read_pos.is_some() && edit_pos.is_some(), "{read_edit}");
    assert!(read_pos.unwrap() < edit_pos.unwrap(), "{read_edit}");
    assert!(!read_edit.contains("send streamed documents to Mark"), "{read_edit}");
    assert!(!read_edit.contains("insert text at the active tab cursor"), "{read_edit}");

    for declared in [Vec::new(), vec!["text.transform".to_string()]] {
        let fallback = super::live_server::pairing_grant_description("Bare", "bare", &declared);
        assert!(fallback.contains("declares no incoming data routes"), "{fallback}");
        assert!(!fallback.contains("read the current text of the active tab"), "{fallback}");
        assert!(!fallback.contains("edit the current text of the active tab"), "{fallback}");
    }
}

async fn fresh_pair_secret(f: &IncomingFixture) -> String {
    let response = super::live_server::handle_pair(State(f.state.clone()), Json(super::live_server::PairRequest {
        extension_id: f.id.clone(), extension_name: "Dummy paired fixture".to_string(), protocol_version: 1,
        prior_secret: None,
    })).await.into_response();
    assert_eq!(response.status(), StatusCode::OK);
    let body = axum::body::to_bytes(response.into_body(), 8192).await.unwrap();
    let paired: serde_json::Value = serde_json::from_slice(&body).unwrap();
    let fresh = paired["shared_secret"].as_str().unwrap();
    assert_ne!(fresh, f.token);
    fresh.to_string()
}

#[tokio::test]
async fn fresh_pairing_restores_access() {
    // A text.edit pairing restores exactly the apply route: the fresh token
    // passes the capability gate — the old apply 200 becomes a binding-fence
    // refusal (400 for the unbound legacy shape, 409 for a never-issued
    // binding) — while context/insert stay capability-refused.
    let f = incoming_fixture(true, "text.edit");
    super::mt_ext_disable(f.id.clone(), f.app.state(), f.app.handle().clone()).await.unwrap();
    assert_old_token_fenced(&f).await;
    // Pair inside the verified-empty trust-reset window (enable would re-key
    // an empty store and turn the pair into a refused rebind); enabling a
    // paired id does not re-key it.
    let fresh = fresh_pair_secret(&f).await;
    super::mt_ext_enable(f.id.clone(), f.app.state()).await.unwrap();
    assert_eq!(apply_fixture(&f, &f.token).await, StatusCode::UNAUTHORIZED);
    assert_eq!(apply_fixture(&f, &fresh).await, StatusCode::BAD_REQUEST);
    assert_eq!(apply_bound(&f, &fresh, Some("tab-never-handed".to_string()), Some("document-gen-never-handed".to_string())).await, StatusCode::CONFLICT);
    assert!(f.events.lock().unwrap().is_empty());
    assert_eq!(context_fixture(&f, &fresh).await, StatusCode::UNAUTHORIZED);
    assert_eq!(insert_fixture(&f, Some(&fresh)).await, StatusCode::UNAUTHORIZED);
    assert_eq!(apply_fixture(&f, &f.token).await, StatusCode::UNAUTHORIZED);

    // C-SEC-EDIT-TARGETING: the apply 200 lives behind the dual-capability
    // pairing — the context read hands the binding the apply echoes.
    let editor = incoming_fixture_caps(true, &["context.read", "text.edit"]);
    super::mt_ext_disable(editor.id.clone(), editor.app.state(), editor.app.handle().clone()).await.unwrap();
    assert_old_token_fenced(&editor).await;
    let fresh_edit = fresh_pair_secret(&editor).await;
    super::mt_ext_enable(editor.id.clone(), editor.app.state()).await.unwrap();
    assert_eq!(apply_fixture(&editor, &editor.token).await, StatusCode::UNAUTHORIZED);
    assert_eq!(context_fixture(&editor, &fresh_edit).await, StatusCode::OK);
    let (document_id, document_generation) = handed_binding(&editor);
    assert_eq!(apply_bound(&editor, &fresh_edit, Some(document_id), Some(document_generation)).await, StatusCode::OK);
    assert_eq!(editor.events.lock().unwrap().len(), 1);
    assert_eq!(insert_fixture(&editor, Some(&fresh_edit)).await, StatusCode::UNAUTHORIZED);
    assert_eq!(apply_fixture(&editor, &editor.token).await, StatusCode::UNAUTHORIZED);

    // A context.read pairing restores exactly the context route.
    let reader = incoming_fixture(true, "context.read");
    super::mt_ext_disable(reader.id.clone(), reader.app.state(), reader.app.handle().clone()).await.unwrap();
    assert_old_token_fenced(&reader).await;
    let fresh_read = fresh_pair_secret(&reader).await;
    super::mt_ext_enable(reader.id.clone(), reader.app.state()).await.unwrap();
    assert_eq!(context_fixture(&reader, &fresh_read).await, StatusCode::OK);
    assert_eq!(apply_fixture(&reader, &fresh_read).await, StatusCode::UNAUTHORIZED);
    assert_eq!(insert_fixture(&reader, Some(&fresh_read)).await, StatusCode::UNAUTHORIZED);

    // A text.insert pairing restores exactly the insert route: the fresh
    // token is admitted past the gate, where C-EXT-EDIT-PROOF answers the
    // honest 501 route refusal with zero events; the old token stays fenced.
    let inserter = incoming_fixture(true, "text.insert");
    super::mt_ext_disable(inserter.id.clone(), inserter.app.state(), inserter.app.handle().clone()).await.unwrap();
    assert_old_token_fenced(&inserter).await;
    let fresh_insert = fresh_pair_secret(&inserter).await;
    super::mt_ext_enable(inserter.id.clone(), inserter.app.state()).await.unwrap();
    assert_eq!(insert_fixture(&inserter, Some(&fresh_insert)).await, StatusCode::NOT_IMPLEMENTED);
    assert!(inserter.events.lock().unwrap().is_empty());
    assert_eq!(context_fixture(&inserter, &fresh_insert).await, StatusCode::UNAUTHORIZED);
    assert_eq!(apply_fixture(&inserter, &fresh_insert).await, StatusCode::UNAUTHORIZED);
    assert_eq!(insert_fixture(&inserter, Some(&inserter.token)).await, StatusCode::UNAUTHORIZED);
}
// END_BLOCK_DISABLE_AUTH_TESTS

// START_BLOCK_GRANT_BOUND_SECURITY_TESTS
// C-SEC-EXT-GRANT-BOUND: the approved incoming set is captured at pairing
// and stored beside the credential; every incoming route — the data routes
// and every /stream/* route at open and on state changes — authorizes by
// that stored grant; enabling beyond the grant is refused into explicit
// re-approval; credentials without a grant fail closed; and key
// replacement is honest. The fail-closed migration shape and the debug
// rebind refusals over a dead/unreadable keychain are deliberate, pinned
// consequences.

async fn pair_request(f: &IncomingFixture, id: &str, prior_secret: Option<String>) -> axum::response::Response {
    super::live_server::handle_pair(State(f.state.clone()), Json(super::live_server::PairRequest {
        extension_id: id.to_string(), extension_name: "Grant matrix fixture".to_string(), protocol_version: 1,
        prior_secret,
    })).await.into_response()
}

#[tokio::test]
async fn pairing_persists_the_captured_grant() {
    // Disabled-but-registered: get_manifest refuses the id, yet the pair
    // captures the real declared set — exactly what the (auto-)approval
    // presented — instead of the honest-empty fallback reserved for
    // unregistered ids.
    let f = incoming_fixture_grantless(false, "context.read");
    assert!(f.app.state::<ExtRegistry>().get_manifest(&f.id).is_err());
    super::mt_ext_disable(f.id.clone(), f.app.state(), f.app.handle().clone()).await.unwrap();
    assert_old_token_fenced(&f).await;
    let fresh = fresh_pair_secret(&f).await;
    assert_eq!(
        super::auth::get_grant(&f.id).unwrap().as_deref(),
        Some(["context.read".to_string()].as_slice()),
    );
    super::mt_ext_enable(f.id.clone(), f.app.state()).await.unwrap();
    assert_eq!(context_fixture(&f, &fresh).await, StatusCode::OK);
    assert_eq!(apply_fixture(&f, &fresh).await, StatusCode::UNAUTHORIZED);
    assert_eq!(insert_fixture(&f, Some(&fresh)).await, StatusCode::UNAUTHORIZED);
    assert_eq!(context_fixture(&f, &f.token).await, StatusCode::UNAUTHORIZED);
    assert!(f.events.lock().unwrap().is_empty());

    // An unregistered id captures the honest empty grant.
    let unregistered_id = format!("{}-never-registered", f.id);
    let response = pair_request(&f, &unregistered_id, None).await;
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(super::auth::get_grant(&unregistered_id).unwrap(), Some(Vec::<String>::new()));
    assert!(super::auth::get_secret(&unregistered_id).unwrap().is_some());
    super::auth::clear_test_secret(&unregistered_id);
    super::auth::clear_test_grant(&unregistered_id);
}

#[tokio::test]
async fn grow_after_pairing_enable_is_refused_to_reapproval() {
    let f = incoming_fixture_grantless(false, "context.read");
    super::mt_ext_disable(f.id.clone(), f.app.state(), f.app.handle().clone()).await.unwrap();
    let fresh = fresh_pair_secret(&f).await;
    assert_eq!(
        super::auth::get_grant(&f.id).unwrap().as_deref(),
        Some(["context.read".to_string()].as_slice()),
    );
    // The manifest grows behind the pairing: re-registration replaces the
    // stored state (the extension is disabled again) with a larger
    // incoming request.
    let mut grown = test_manifest(&f.id);
    grown.capabilities = vec![
        Capability { name: "context.read".to_string(), version: 1 },
        Capability { name: "text.edit".to_string(), version: 1 },
    ];
    f.app.state::<ExtRegistry>().register(grown, true).unwrap();
    let error = super::mt_ext_enable(f.id.clone(), f.app.state()).await.unwrap_err();
    assert_eq!(error, "ext_enable_reapproval_required");
    assert!(f.app.state::<ExtRegistry>().get_manifest(&f.id).is_err(), "the refused enable leaves the registry disabled");
    assert_eq!(super::auth::get_secret(&f.id).unwrap().as_deref(), Some(fresh.as_str()), "the refused enable re-keys nothing");
    assert!(f.events.lock().unwrap().is_empty());

    // A shrunk manifest enables and works within the stored grant.
    let mut shrunk = test_manifest(&f.id);
    shrunk.capabilities = vec![Capability { name: "context.read".to_string(), version: 1 }];
    f.app.state::<ExtRegistry>().register(shrunk, true).unwrap();
    super::mt_ext_enable(f.id.clone(), f.app.state()).await.unwrap();
    assert_eq!(context_fixture(&f, &fresh).await, StatusCode::OK);
    assert_eq!(apply_fixture(&f, &fresh).await, StatusCode::UNAUTHORIZED);

    // An enable-minted credential deliberately receives NO grant: with an
    // incoming-capability manifest it is refused exactly the same way.
    let minted = incoming_fixture_grantless(true, "text.insert");
    super::mt_ext_disable(minted.id.clone(), minted.app.state(), minted.app.handle().clone()).await.unwrap();
    super::mt_ext_enable(minted.id.clone(), minted.app.state()).await.unwrap_err();
    assert!(super::auth::get_secret(&minted.id).unwrap().is_some(), "the enable minted its credential");
    assert_eq!(super::auth::get_grant(&minted.id).unwrap(), None, "the minted credential holds no grant");

    // A manifest with no incoming-route capabilities enables freely.
    let bare = incoming_fixture_grantless(true, "text.insert");
    let mut transform_only = test_manifest(&bare.id);
    transform_only.capabilities = vec![Capability { name: "text.transform".to_string(), version: 1 }];
    bare.app.state::<ExtRegistry>().register(transform_only, true).unwrap();
    super::mt_ext_enable(bare.id.clone(), bare.app.state()).await.unwrap();
}

#[tokio::test]
async fn legacy_credential_without_grant_fails_closed() {
    // Recorded fail-closed migration consequence: a credential paired
    // before C-SEC-EXT-GRANT-BOUND holds no stored grant and authorizes
    // no incoming route — data routes and stream alike — until the owner
    // disables and freshly pairs (re-approval).
    let f = incoming_fixture_grantless(true, "context.read");
    assert_eq!(context_fixture(&f, &f.token).await, StatusCode::UNAUTHORIZED);
    assert_eq!(apply_fixture(&f, &f.token).await, StatusCode::UNAUTHORIZED);
    assert_eq!(insert_fixture(&f, Some(&f.token)).await, StatusCode::UNAUTHORIZED);
    assert_eq!(stream_open_fixture(&f, &f.id, &f.token, "session-legacy").await.status(), StatusCode::UNAUTHORIZED);
    assert!(f.events.lock().unwrap().is_empty());
    assert!(f.live_events.lock().unwrap().is_empty());
    assert!(f.state.session.lock().await.is_none());
}

#[tokio::test]
async fn stream_requires_stored_stream_document_grant() {
    let f = incoming_fixture(true, "stream.document");
    assert_eq!(stream_open_fixture(&f, &f.id, &f.token, "session-a").await.status(), StatusCode::OK);
    assert_eq!(stream_route_fixture(&f, "patch").await, StatusCode::OK);
    assert_eq!(stream_route_fixture(&f, "heartbeat").await, StatusCode::OK);
    assert_eq!(stream_route_fixture(&f, "close").await, StatusCode::OK);
    {
        let guard = f.state.session.lock().await;
        let session = guard.as_ref().unwrap();
        assert!(!session.active);
        assert_eq!(session.revision, 2);
        assert_eq!(session.document_md, "replacement");
        assert_eq!(session.last_seq, 1);
    }
    let live_event_count = f.live_events.lock().unwrap().len();
    // Revoking the stored grant fences every state change and the re-open
    // with no session mutation, revision drift or live event.
    super::auth::revoke_grant(&f.id).unwrap();
    for route in ["patch", "close", "heartbeat"] {
        assert_eq!(stream_route_fixture(&f, route).await, StatusCode::UNAUTHORIZED, "{route}");
    }
    assert_eq!(stream_open_fixture(&f, &f.id, &f.token, "session-a").await.status(), StatusCode::UNAUTHORIZED);
    {
        let guard = f.state.session.lock().await;
        let session = guard.as_ref().unwrap();
        assert!(!session.active);
        assert_eq!(session.revision, 2);
        assert_eq!(session.document_md, "replacement");
        assert_eq!(session.last_seq, 1);
    }
    assert_eq!(f.live_events.lock().unwrap().len(), live_event_count);
    assert!(f.events.lock().unwrap().is_empty());
}

#[tokio::test]
async fn rebind_refused_when_new_key_fails_verification() {
    // Keychain write failure: the effective credential path still serves
    // the old record, so the verifying store refuses with a distinct
    // mismatch state, rolls the memory mirror back, and the pair answers
    // 500 — never paired:true — while the prior token stays valid and
    // authorized on its granted routes.
    let f = incoming_fixture(true, "context.read");
    f.credential.fail_write.store(true, std::sync::atomic::Ordering::Relaxed);
    let response = pair_request(&f, &f.id, Some(f.token.clone())).await;
    assert_eq!(response.status(), StatusCode::INTERNAL_SERVER_ERROR);
    assert_eq!(super::auth::get_secret(&f.id).unwrap().as_deref(), Some(f.token.as_str()));
    assert!(super::auth::validate_token(&f.id, &f.token), "the prior token still validates");
    assert_eq!(f.credential.persistent.lock().unwrap().as_deref(), Some(f.token.as_str()), "the failed keychain write displaced nothing");
    assert_eq!(context_fixture(&f, &f.token).await, StatusCode::OK, "the prior token is still authorized on its granted route");
    assert!(f.events.lock().unwrap().is_empty());
}

#[tokio::test]
async fn pair_keychain_read_error_is_a_distinct_refusal() {
    // Keychain read error: the new key verifies through the effective
    // (memory) path, but the rebind-only proof must read the credential
    // record itself — an unreadable record cannot prove the previous key
    // dead, a distinct refusal that never reports success and restores
    // the prior credential, so the refused rebind re-keys nothing.
    let f = incoming_fixture(true, "context.read");
    f.credential.fail_read.store(true, std::sync::atomic::Ordering::Relaxed);
    let response = pair_request(&f, &f.id, Some(f.token.clone())).await;
    assert_eq!(response.status(), StatusCode::INTERNAL_SERVER_ERROR);
    assert!(super::auth::validate_token(&f.id, &f.token), "the prior token still validates after the refused rebind");
    assert_eq!(super::auth::get_secret(&f.id).unwrap().as_deref(), Some(f.token.as_str()));
    assert_eq!(f.credential.persistent.lock().unwrap().as_deref(), Some(f.token.as_str()));
    assert_eq!(context_fixture(&f, &f.token).await, StatusCode::OK);
    assert!(f.events.lock().unwrap().is_empty());
}
// END_BLOCK_GRANT_BOUND_SECURITY_TESTS

// START_BLOCK_LOOPBACK_URL_TESTS
#[test]
fn manifest_rejects_userinfo_url() {
    for url in ["http://localhost:1@evil.example/", "http://user@127.0.0.1/", "http://:pass@localhost/", "http://@localhost/"] {
        let mut manifest = test_manifest("userinfo-fixture");
        manifest.discovery.base_url = url.to_string();
        assert!(validate_manifest(&manifest).is_err(), "{url}");
    }
}

#[tokio::test]
async fn invoke_rejects_userinfo_final_url() {
    let mut manifest = test_manifest("invoke-userinfo-fixture");
    manifest.discovery.base_url = "http://localhost:1@evil.example/".to_string();
    let error = super::invoke::invoke_extension(&manifest, "text.insert", serde_json::json!({"text":"dummy"}), Some("dummy-bearer"))
        .await.unwrap_err();
    // A network failure cannot satisfy this test: rejection must happen in validation.
    assert!(error.message.contains("userinfo"), "{}", error.message);
    manifest.discovery.base_url = "http://localhost".to_string();
    manifest.invoke.invoke_path = ":1@evil.example/".to_string();
    let error = super::invoke::invoke_extension(&manifest, "text.insert", serde_json::json!({}), Some("dummy-bearer"))
        .await.unwrap_err();
    assert!(error.message.contains("userinfo"), "{}", error.message);
}

#[test]
fn manifest_rejects_non_loopback_host_without_userinfo() {
    for url in ["http://evil.example/", "http://[::ffff:127.0.0.1]/", "https://192.0.2.1/", "file:///tmp/fixture", "ftp://localhost/"] {
        let mut manifest = test_manifest("host-fixture");
        manifest.discovery.base_url = url.to_string();
        assert!(validate_manifest(&manifest).is_err(), "{url}");
    }
}

#[test]
fn manifest_accepts_loopback_hosts() {
    for url in ["http://127.0.0.1:9100/base", "https://localhost:9100/base", "http://[::1]:9100/base"] {
        let mut manifest = test_manifest("loopback-fixture");
        manifest.discovery.base_url = url.to_string();
        validate_manifest(&manifest).unwrap();
    }
    assert!(validate_loopback_url("http://::1/").is_err());
}

#[test]
fn invoke_rejects_host_changing_path() {
    for base in ["http://127.0.0.1:9100", "http://127.0.0.1:9100/prefix"] {
        for path in ["http://evil.example/invoke", "//evil.example/invoke"] {
            if let Ok(endpoint) = extension_endpoint(base, path) {
                let base = validate_loopback_url(base).unwrap();
                assert_eq!(endpoint.host(), base.host());
                assert_eq!(endpoint.origin(), base.origin());
            }
        }
    }
    assert!(extension_endpoint("http://localhost", ".evil.example/invoke").is_err());
    assert!(extension_endpoint("http://localhost", ":9101/invoke").is_err());
}

/// The confined launcher can pass listeners bound to exclusive fixture ports.
/// Normal CI uses ephemeral loopback sockets. Each tag is consumed once per run.
fn fixture_listener(tag: &str) -> std::net::TcpListener {
    #[cfg(unix)]
    if let Ok(raw) = std::env::var(format!("MARK_TEST_FD_{tag}")) {
        use std::os::fd::FromRawFd;
        let listener = unsafe { std::net::TcpListener::from_raw_fd(raw.parse().unwrap()) };
        assert_eq!(listener.local_addr().unwrap().ip(), std::net::Ipv4Addr::LOCALHOST);
        return listener;
    }
    std::net::TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, 0)).unwrap()
}

/// Serve a single small synthetic HTTP response, returning the observed request.
fn serve_fixture(
    listener: std::net::TcpListener,
    status: &str,
    headers: String,
    body: &str,
    wait_ms: u64,
) -> std::thread::JoinHandle<Option<String>> {
    use std::io::{Read, Write};
    let response = format!("HTTP/1.1 {status}\r\nContent-Length: {}\r\nConnection: close\r\n{headers}\r\n{body}", body.len());
    listener.set_nonblocking(true).unwrap();
    std::thread::spawn(move || {
        let deadline = std::time::Instant::now() + std::time::Duration::from_millis(wait_ms);
        let mut stream = loop {
            match listener.accept() {
                Ok((stream, _)) => break stream,
                Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    if std::time::Instant::now() >= deadline { return None; }
                    std::thread::sleep(std::time::Duration::from_millis(5));
                },
                Err(e) => panic!("fixture accept failed: {e}"),
            }
        };
        stream.set_nonblocking(false).unwrap();
        stream.set_read_timeout(Some(std::time::Duration::from_secs(2))).unwrap();
        let mut request = Vec::new();
        loop {
            let mut bytes = [0u8; 4096];
            let len = stream.read(&mut bytes).unwrap();
            if len == 0 { break; }
            request.extend_from_slice(&bytes[..len]);
            assert!(request.len() < 16384, "fixture request bound");
            if let Some(end) = request.windows(4).position(|part| part == b"\r\n\r\n") {
                let text = String::from_utf8_lossy(&request[..end]);
                let content_length = text.lines().find_map(|line| {
                    let (name, value) = line.split_once(':')?;
                    name.eq_ignore_ascii_case("content-length").then(|| value.trim().parse::<usize>().unwrap())
                }).unwrap_or(0);
                if request.len() >= end + 4 + content_length { break; }
            }
        }
        stream.write_all(response.as_bytes()).unwrap();
        Some(String::from_utf8(request).unwrap())
    })
}

#[tokio::test]
async fn invoke_honest_loopback_ok() {
    let listener = fixture_listener("INVOKE_OK");
    let mut manifest = test_manifest("honest-invoke-fixture");
    manifest.discovery.base_url = format!("http://{}", listener.local_addr().unwrap());
    manifest.invoke.timeout_secs = 2;
    let server = serve_fixture(listener, "200 OK", String::new(), r#"{"fixture":"ok"}"#, 2000);
    let result = super::invoke::invoke_extension(&manifest, "text.insert", serde_json::json!({"text":"dummy body"}), Some("dummy-fixture-bearer"))
        .await.unwrap();
    assert_eq!(result["fixture"], "ok");
    let request = server.join().unwrap().unwrap();
    assert!(request.starts_with("POST /invoke "));
    assert!(request.to_ascii_lowercase().contains("authorization: bearer dummy-fixture-bearer"));
    assert!(request.contains("dummy body"));
}

#[tokio::test]
async fn probe_health_honest_loopback_ok() {
    let listener = fixture_listener("PROBE_OK");
    let mut manifest = test_manifest("honest-probe-fixture");
    manifest.discovery.base_url = format!("http://{}", listener.local_addr().unwrap());
    let server = serve_fixture(listener, "200 OK", String::new(), "healthy", 2000);
    assert!(super::discovery::probe_health(&manifest).await);
    let request = server.join().unwrap().unwrap();
    assert!(request.starts_with("GET /health "));
    assert!(!request.to_ascii_lowercase().contains("authorization:"));
}

#[tokio::test]
async fn invoke_redirect_response_not_followed() {
    let origin = fixture_listener("INVOKE_REDIRECT_ORIGIN");
    let target = fixture_listener("INVOKE_REDIRECT_TARGET");
    let target_addr = target.local_addr().unwrap();
    let mut manifest = test_manifest("redirect-invoke-fixture");
    manifest.discovery.base_url = format!("http://{}", origin.local_addr().unwrap());
    manifest.invoke.timeout_secs = 2;
    let origin_server = serve_fixture(origin, "307 Temporary Redirect", format!("Location: http://{target_addr}/other\r\n"), "redirect", 2000);
    let target_server = serve_fixture(target, "200 OK", String::new(), r#"{"unexpected":true}"#, 700);
    let result = super::invoke::invoke_extension(&manifest, "text.insert", serde_json::json!({"text":"dummy body"}), Some("dummy-bearer"))
        .await;
    let origin_request = origin_server.join().unwrap().unwrap();
    let target_request = target_server.join().unwrap();
    assert!(matches!(result.unwrap_err().kind, super::invoke::InvokeErrorKind::BadStatus));
    assert!(origin_request.contains("dummy body"));
    assert!(target_request.is_none(), "redirect target received a request");

    let origin = fixture_listener("PROBE_REDIRECT_ORIGIN");
    let target = fixture_listener("PROBE_REDIRECT_TARGET");
    let target_addr = target.local_addr().unwrap();
    manifest.discovery.base_url = format!("http://{}", origin.local_addr().unwrap());
    let origin_server = serve_fixture(origin, "307 Temporary Redirect", format!("Location: http://{target_addr}/other\r\n"), "redirect", 2000);
    let target_server = serve_fixture(target, "200 OK", String::new(), "unexpected", 700);
    assert!(!super::discovery::probe_health(&manifest).await);
    assert!(origin_server.join().unwrap().is_some());
    assert!(target_server.join().unwrap().is_none(), "health probe followed its redirect");
}
// END_BLOCK_LOOPBACK_URL_TESTS

// START_BLOCK_STREAM_SECURITY_TESTS
async fn stream_open_fixture(f: &IncomingFixture, id: &str, token: &str, sid: &str) -> axum::response::Response {
    let request = serde_json::from_value(serde_json::json!({
        "extension_id": id, "session_id": sid, "title": "Dummy stream", "initial_md": "original",
        "sections": [{"name":"body", "content":"original"}]
    })).unwrap();
    super::live_server::handle_doc_open(State(f.state.clone()), bearer_headers(Some(token)), Json(request)).await.into_response()
}

async fn stream_route_fixture(f: &IncomingFixture, route: &str) -> StatusCode {
    let headers = bearer_headers(Some(&f.token));
    let body = serde_json::json!({"session_id":"session-a", "seq":1, "base_revision":1, "section":"body", "content":"replacement"});
    let state = State(f.state.clone());
    match route {
        "patch" => super::live_server::handle_doc_patch(state, headers, Json(serde_json::from_value(body).unwrap())).await.into_response().status(),
        "close" => super::live_server::handle_doc_close(state, headers, Json(serde_json::from_value(body).unwrap())).await.into_response().status(),
        _ => super::live_server::handle_heartbeat(state, headers, Json(serde_json::from_value(body).unwrap())).await.into_response().status(),
    }
}

#[tokio::test]
async fn stream_disabled_owner_is_fenced_even_when_keyring_delete_fails() {
    let f = incoming_fixture(true, "stream.document");
    assert_eq!(stream_open_fixture(&f, &f.id, &f.token, "session-a").await.status(), StatusCode::OK);
    f.credential.fail_delete.store(true, std::sync::atomic::Ordering::Relaxed);
    assert_eq!(super::mt_ext_disable(f.id.clone(), f.app.state(), f.app.handle().clone()).await.unwrap_err(), "ext_disable_revoke_failed");
    assert_eq!(stream_open_fixture(&f, &f.id, &f.token, "session-a").await.status(), StatusCode::UNAUTHORIZED);
    for route in ["patch", "close", "heartbeat"] {
        assert_eq!(stream_route_fixture(&f, route).await, StatusCode::UNAUTHORIZED, "{route}");
    }
    assert!(!f.state.session.lock().await.as_ref().unwrap().active);
}

#[tokio::test]
async fn stream_foreign_owner_cannot_disclose_or_replace_session() {
    let f = incoming_fixture(true, "stream.document");
    let other_id = format!("{}-other", f.id);
    let other_token = "dummy-other-stream-token";
    f.app.state::<ExtRegistry>().register(test_manifest(&other_id), true).unwrap();
    f.app.state::<ExtRegistry>().enable(&other_id).unwrap();
    super::auth::inject_test_secret(&other_id, other_token);
    // The foreign owner is fully paired-and-granted: a valid token AND a
    // stored stream.document grant — it is the owner/epoch fencing, not a
    // missing grant, that fences it.
    let grant: Vec<String> = vec!["stream.document".to_string()];
    let other_grant_store = Arc::new(DummyCredential::default());
    *other_grant_store.persistent.lock().unwrap() =
        Some(serde_json::to_string(&grant).unwrap());
    super::auth::inject_test_grant_backend(&other_id, Ok(other_grant_store));
    super::auth::store_grant(&other_id, &grant).unwrap();
    assert_eq!(stream_open_fixture(&f, &f.id, &f.token, "session-a").await.status(), StatusCode::OK);
    for sid in ["different-session", "session-a"] {
        let response = stream_open_fixture(&f, &other_id, other_token, sid).await;
        assert_eq!(response.status(), StatusCode::CONFLICT);
        let bytes = axum::body::to_bytes(response.into_body(), 4096).await.unwrap();
        let body: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
        assert!(body.get("existing_session_id").is_none());
        assert!(!String::from_utf8_lossy(&bytes).contains("session-a"));
        let guard = f.state.session.lock().await;
        assert_eq!(guard.as_ref().unwrap().extension_id, f.id);
        assert_eq!(guard.as_ref().unwrap().document_md, "original");
    }
    assert_eq!(stream_open_fixture(&f, &f.id, &f.token, "session-a").await.status(), StatusCode::OK);
    super::auth::clear_test_secret(&other_id);
    super::auth::clear_test_grant(&other_id);
}

#[tokio::test]
async fn stream_authentication_cannot_cross_disable_or_session_replacement() {
    for replacement in [false, true] {
        for route in ["open", "patch", "close", "heartbeat"] {
            if replacement && route == "open" { continue; }
            let f = incoming_fixture(true, "stream.document");
            assert_eq!(stream_open_fixture(&f, &f.id, &f.token, "session-a").await.status(), StatusCode::OK);
            let (entered_tx, entered_rx) = std::sync::mpsc::channel();
            let release = Arc::new((Mutex::new(false), std::sync::Condvar::new()));
            *f.credential.read_pause.lock().unwrap() = Some((entered_tx, release.clone()));
            let state = f.state.clone(); let id = f.id.clone(); let token = f.token.clone();
            let pending = tokio::spawn(async move {
                let headers = bearer_headers(Some(&token));
                let body = serde_json::json!({"extension_id":id, "session_id":"session-a", "title":"Dummy",
                    "seq":1,"base_revision":1,"section":"body","content":"stale", "initial_md":"stale"});
                let state = State(state);
                match route {
                    "open" => super::live_server::handle_doc_open(state, headers, Json(serde_json::from_value(body).unwrap())).await.into_response().status(),
                    "patch" => super::live_server::handle_doc_patch(state, headers, Json(serde_json::from_value(body).unwrap())).await.into_response().status(),
                    "close" => super::live_server::handle_doc_close(state, headers, Json(serde_json::from_value(body).unwrap())).await.into_response().status(),
                    _ => super::live_server::handle_heartbeat(state, headers, Json(serde_json::from_value(body).unwrap())).await.into_response().status(),
                }
            });
            tokio::task::spawn_blocking(move || entered_rx.recv_timeout(std::time::Duration::from_secs(5)).unwrap()).await.unwrap();
            if replacement {
                assert_eq!(stream_open_fixture(&f, &f.id, &f.token, "session-a").await.status(), StatusCode::OK);
            } else {
                f.credential.fail_delete.store(true, std::sync::atomic::Ordering::Relaxed);
                assert!(super::mt_ext_disable(f.id.clone(), f.app.state(), f.app.handle().clone()).await.is_err());
            }
            let event_count = f.live_events.lock().unwrap().len();
            let expected_heartbeat = f.state.session.lock().await.as_ref().unwrap().last_heartbeat;
            *release.0.lock().unwrap() = true; release.1.notify_all();
            assert_eq!(pending.await.unwrap(), if replacement { StatusCode::CONFLICT } else { StatusCode::UNAUTHORIZED }, "{route}");
            let guard = f.state.session.lock().await; let session = guard.as_ref().unwrap();
            assert_eq!(session.document_md, "original");
            assert_eq!(session.revision, 1);
            assert_eq!(session.last_heartbeat, expected_heartbeat);
            assert_eq!(session.active, replacement);
            assert_eq!(f.live_events.lock().unwrap().len(), event_count);
        }
    }
}

#[tokio::test]
async fn stream_events_keep_ordered_identity_and_disable_only_closes_its_owner() {
    let f = incoming_fixture(true, "stream.document");
    let other_id = format!("{}-disabled", f.id);
    f.app.state::<ExtRegistry>().register(test_manifest(&other_id), true).unwrap();
    assert_eq!(stream_open_fixture(&f, &f.id, &f.token, "session-a").await.status(), StatusCode::OK);
    // No credential is stored for B; disabling it still cannot close A.
    let _ = super::mt_ext_disable(other_id, f.app.state(), f.app.handle().clone()).await;
    assert!(f.state.session.lock().await.as_ref().unwrap().active);
    assert_eq!(stream_route_fixture(&f, "patch").await, StatusCode::OK);
    assert_eq!(stream_open_fixture(&f, &f.id, &f.token, "session-a").await.status(), StatusCode::OK);
    f.credential.fail_delete.store(true, std::sync::atomic::Ordering::Relaxed);
    assert!(super::mt_ext_disable(f.id.clone(), f.app.state(), f.app.handle().clone()).await.is_err());
    let events = f.live_events.lock().unwrap();
    assert_eq!(events.iter().map(|e| e["update_type"].as_str().unwrap()).collect::<Vec<_>>(), vec!["doc_open","doc_patch","doc_open","doc_close"]);
    let first = events[0]["payload"]["session_epoch"].as_u64().unwrap();
    let second = events[2]["payload"]["session_epoch"].as_u64().unwrap();
    assert!(second > first);
    for (event, epoch) in events.iter().zip([first, first, second, second]) {
        assert_eq!(event["payload"]["session_id"], "session-a");
        assert_eq!(event["payload"]["session_epoch"], epoch);
    }
}
// END_BLOCK_STREAM_SECURITY_TESTS

// START_BLOCK_STREAM_BUDGET_TESTS
// C-STREAM-BUDGET: per-session stream budgets — cumulative bytes (the
// authoritative document_md at open plus the GROSS content bytes of
// every accepted patch), the post-dedup section count at open, and the
// token-bucket patch rate. Red-first family: against the baseline tree
// every refusal scenario instead succeeds (over-cap opens create
// sessions, over-rate patches apply) and the budget/rate pins do not
// compile — recorded as the change bundle's failure evidence. Every
// refusal pins 413/413/429 through the existing {"error": ...} shape
// with the budget and cap named, the last valid revision intact, zero
// new live events and the session still active; exact-cap boundaries
// pass; duplicates, resync answers, heartbeat and close stay
// budget-free. The rate family never sleeps: buckets are drained and
// charged through the fixture session mutex and the pure
// decide_rate_admission core is driven with synthetic Instants.
use super::live_server::{
    decide_rate_admission, RateDecision, STREAM_BUDGET_MAX_SECTIONS,
    STREAM_BUDGET_RATE_BURST, STREAM_BUDGET_TOTAL_BYTES,
};

async fn budget_open(f: &IncomingFixture, sid: &str, initial_md: &str) -> axum::response::Response {
    let request = serde_json::from_value(serde_json::json!({
        "extension_id": f.id.clone(), "session_id": sid, "title": "Budget stream", "initial_md": initial_md,
    })).unwrap();
    super::live_server::handle_doc_open(State(f.state.clone()), bearer_headers(Some(&f.token)), Json(request))
        .await.into_response()
}

async fn budget_open_sections(f: &IncomingFixture, sid: &str, sections: Vec<serde_json::Value>) -> axum::response::Response {
    let request = serde_json::from_value(serde_json::json!({
        "extension_id": f.id.clone(), "session_id": sid, "title": "Budget stream", "sections": sections,
    })).unwrap();
    super::live_server::handle_doc_open(State(f.state.clone()), bearer_headers(Some(&f.token)), Json(request))
        .await.into_response()
}

async fn budget_patch(f: &IncomingFixture, sid: &str, seq: u64, base_revision: u64, content: &str) -> axum::response::Response {
    let request = serde_json::from_value(serde_json::json!({
        "session_id": sid, "seq": seq, "base_revision": base_revision,
        "op": "replace", "section": "body", "content": content,
    })).unwrap();
    super::live_server::handle_doc_patch(State(f.state.clone()), bearer_headers(Some(&f.token)), Json(request))
        .await.into_response()
}

async fn budget_heartbeat(f: &IncomingFixture, sid: &str) -> axum::response::Response {
    let request = serde_json::from_value(serde_json::json!({"session_id": sid})).unwrap();
    super::live_server::handle_heartbeat(State(f.state.clone()), bearer_headers(Some(&f.token)), Json(request))
        .await.into_response()
}

async fn budget_close(f: &IncomingFixture, sid: &str) -> axum::response::Response {
    let request = serde_json::from_value(serde_json::json!({"session_id": sid, "seq": 99})).unwrap();
    super::live_server::handle_doc_close(State(f.state.clone()), bearer_headers(Some(&f.token)), Json(request))
        .await.into_response()
}

async fn budget_body(response: axum::response::Response) -> serde_json::Value {
    let bytes = axum::body::to_bytes(response.into_body(), 65536).await.unwrap();
    serde_json::from_slice(&bytes).unwrap()
}

#[tokio::test]
async fn stream_budget_open_refuses_over_total_bytes() {
    let f = incoming_fixture_caps(true, &["stream.document"]);
    // No sections -> the authoritative document_md is initial_md; one
    // byte past the 64 MiB cap must be refused before any session
    // exists.
    let over = "x".repeat(STREAM_BUDGET_TOTAL_BYTES as usize + 1);
    let response = budget_open(&f, "session-budget-bytes", &over).await;
    assert_eq!(response.status(), StatusCode::PAYLOAD_TOO_LARGE);
    let body = budget_body(response).await;
    let error = body["error"].as_str().unwrap().to_string();
    assert!(error.contains("STREAM_BUDGET_TOTAL_BYTES"), "error must name the budget: {error}");
    assert!(error.contains("67108864"), "error must name the cap: {error}");
    assert!(f.state.session.lock().await.is_none(), "no session may be created");
    assert!(f.live_events.lock().unwrap().is_empty(), "zero live events on refusal");
}

#[tokio::test]
async fn stream_budget_open_refuses_over_section_count() {
    let f = incoming_fixture_caps(true, &["stream.document"]);
    // 4097 distinct sections — one past the post-dedup cap.
    let sections = (0..=STREAM_BUDGET_MAX_SECTIONS)
        .map(|i| serde_json::json!({"name": format!("s-{i}"), "content": "x"}))
        .collect::<Vec<_>>();
    assert_eq!(sections.len(), STREAM_BUDGET_MAX_SECTIONS + 1);
    let response = budget_open_sections(&f, "session-budget-sections", sections).await;
    assert_eq!(response.status(), StatusCode::PAYLOAD_TOO_LARGE);
    let body = budget_body(response).await;
    let error = body["error"].as_str().unwrap().to_string();
    assert!(error.contains("STREAM_BUDGET_MAX_SECTIONS"), "error must name the budget: {error}");
    assert!(error.contains("4096"), "error must name the 4096 cap: {error}");
    assert!(f.state.session.lock().await.is_none(), "no session may be created");
    assert!(f.live_events.lock().unwrap().is_empty(), "zero live events on refusal");
}

#[tokio::test]
async fn stream_budget_patch_refuses_over_cumulative_bytes() {
    let f = incoming_fixture_caps(true, &["stream.document"]);
    let response = budget_open_sections(&f, "session-budget-cumulative", vec![
        serde_json::json!({"name": "body", "content": "original"}),
    ]).await;
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(budget_body(response).await["revision"], 1);
    let events_before = f.live_events.lock().unwrap().len();
    assert_eq!(events_before, 1, "doc_open emitted");

    // Open charged 8 bytes; 8 + 67108857 = 67108865 — one byte past.
    let patch = "x".repeat(STREAM_BUDGET_TOTAL_BYTES as usize - "original".len() + 1);
    let response = budget_patch(&f, "session-budget-cumulative", 1, 1, &patch).await;
    assert_eq!(response.status(), StatusCode::PAYLOAD_TOO_LARGE);
    let body = budget_body(response).await;
    let error = body["error"].as_str().unwrap().to_string();
    assert!(error.contains("STREAM_BUDGET_TOTAL_BYTES"), "error must name the budget: {error}");
    assert!(error.contains("67108864"), "error must name the cap: {error}");

    // Nothing applied: the last valid revision survives untouched with
    // zero new events and the session still active.
    let guard = f.state.session.lock().await;
    let session = guard.as_ref().unwrap();
    assert_eq!(session.revision, 1);
    assert_eq!(session.last_seq, 0);
    assert_eq!(session.document_md, "original");
    assert_eq!(session.sections, vec![("body".to_string(), "original".to_string())]);
    assert_eq!(session.budget.cumulative_bytes, "original".len() as u64);
    assert!(session.active);
    drop(guard);
    assert_eq!(f.live_events.lock().unwrap().len(), events_before);
}

#[tokio::test]
async fn stream_budget_patch_refuses_over_rate() {
    let f = incoming_fixture_caps(true, &["stream.document"]);
    let response = budget_open_sections(&f, "session-budget-rate", vec![
        serde_json::json!({"name": "body", "content": "original"}),
    ]).await;
    assert_eq!(response.status(), StatusCode::OK);
    // Apply seq 1 so a later retransmit of the SAME seq is a true
    // duplicate after the bucket drains.
    let response = budget_patch(&f, "session-budget-rate", 1, 1, "delta-1").await;
    assert_eq!(response.status(), StatusCode::OK);
    let body = budget_body(response).await;
    assert_eq!(body["applied_revision"], 2);
    assert_eq!(body["duplicate"], false);
    assert_eq!(body["needs_resync"], false);

    // Drain the bucket below one token with last_refill at now, via
    // the fixture session mutex — no real-time waits.
    let (drained_credit, drained_refill) = {
        let mut guard = f.state.session.lock().await;
        let session = guard.as_mut().unwrap();
        session.budget.credit = 0.5;
        session.budget.last_refill = std::time::Instant::now();
        (session.budget.credit, session.budget.last_refill)
    };
    let events_before = f.live_events.lock().unwrap().len();

    // A new-seq patch on the current base revision hits the exhausted
    // bucket: 429 with the rate budget named.
    let response = budget_patch(&f, "session-budget-rate", 2, 2, "delta-2").await;
    assert_eq!(response.status(), StatusCode::TOO_MANY_REQUESTS);
    let body = budget_body(response).await;
    let error = body["error"].as_str().unwrap().to_string();
    assert!(error.contains("STREAM_BUDGET_RATE_PER_MINUTE"), "error must name the rate budget: {error}");

    // Zero mutation: bucket not debited, revision/last_seq/document
    // untouched, no event emitted, session stays active.
    {
        let guard = f.state.session.lock().await;
        let session = guard.as_ref().unwrap();
        assert_eq!(session.revision, 2);
        assert_eq!(session.last_seq, 1);
        assert_eq!(session.document_md, "delta-1");
        assert_eq!(session.budget.credit, drained_credit);
        assert_eq!(session.budget.last_refill, drained_refill);
        assert!(session.active);
    }
    assert_eq!(f.live_events.lock().unwrap().len(), events_before);

    // An immediate retransmit of the APPLIED seq stays a duplicate and
    // consumes nothing: 200 duplicate:true with the bucket unchanged.
    let response = budget_patch(&f, "session-budget-rate", 1, 2, "delta-1").await;
    assert_eq!(response.status(), StatusCode::OK);
    let body = budget_body(response).await;
    assert_eq!(body["applied_revision"], 2);
    assert_eq!(body["duplicate"], true);
    assert_eq!(body["needs_resync"], false);
    {
        let guard = f.state.session.lock().await;
        let session = guard.as_ref().unwrap();
        assert_eq!(session.budget.credit, drained_credit, "duplicate must not debit");
        assert_eq!(session.budget.last_refill, drained_refill);
        assert_eq!(session.document_md, "delta-1", "duplicate must not apply");
    }
}

#[tokio::test]
async fn stream_budget_rejection_keeps_last_valid_revision() {
    let f = incoming_fixture_caps(true, &["stream.document"]);
    let response = budget_open_sections(&f, "session-budget-reject", vec![
        serde_json::json!({"name": "body", "content": "original"}),
    ]).await;
    assert_eq!(response.status(), StatusCode::OK);

    // Byte-class refusal: one byte past the cumulative cap.
    let patch = "x".repeat(STREAM_BUDGET_TOTAL_BYTES as usize - "original".len() + 1);
    let response = budget_patch(&f, "session-budget-reject", 1, 1, &patch).await;
    assert_eq!(response.status(), StatusCode::PAYLOAD_TOO_LARGE);

    // Heartbeat still reports the previous revision; session active.
    let response = budget_heartbeat(&f, "session-budget-reject").await;
    assert_eq!(response.status(), StatusCode::OK);
    let body = budget_body(response).await;
    assert_eq!(body["alive"], true);
    assert_eq!(body["revision"], 1);

    // Rate-class refusal: drain below one token (no real-time waits).
    {
        let mut guard = f.state.session.lock().await;
        let session = guard.as_mut().unwrap();
        session.budget.credit = 0.25;
        session.budget.last_refill = std::time::Instant::now();
    }
    let response = budget_patch(&f, "session-budget-reject", 1, 1, "still-refused").await;
    assert_eq!(response.status(), StatusCode::TOO_MANY_REQUESTS);
    let response = budget_heartbeat(&f, "session-budget-reject").await;
    let body = budget_body(response).await;
    assert_eq!(body["revision"], 1);
    assert!(f.state.session.lock().await.as_ref().unwrap().active);

    // The next valid in-budget patch on the SAME base_revision applies
    // normally: no needs_resync, no reset, revision advances 1 -> 2.
    {
        let mut guard = f.state.session.lock().await;
        let session = guard.as_mut().unwrap();
        session.budget.credit = STREAM_BUDGET_RATE_BURST as f64;
        session.budget.last_refill = std::time::Instant::now();
    }
    let response = budget_patch(&f, "session-budget-reject", 1, 1, "valid-after-refusal").await;
    assert_eq!(response.status(), StatusCode::OK);
    let body = budget_body(response).await;
    assert_eq!(body["applied_revision"], 2);
    assert_eq!(body["duplicate"], false);
    assert_eq!(body["needs_resync"], false);
    {
        let guard = f.state.session.lock().await;
        let session = guard.as_ref().unwrap();
        assert_eq!(session.revision, 2);
        assert_eq!(session.document_md, "valid-after-refusal");
        assert_eq!(
            session.budget.cumulative_bytes,
            ("original".len() + "valid-after-refusal".len()) as u64,
        );
    }
}

#[tokio::test]
async fn stream_budget_boundaries_at_exact_cap_pass() {
    // Exact byte cap: an authoritative document of exactly 67108864
    // bytes opens (refusal is strictly past the cap) and the open
    // charges those bytes into the cumulative budget with the rate
    // bucket initialized at burst.
    let f = incoming_fixture_caps(true, &["stream.document"]);
    let exact = "x".repeat(STREAM_BUDGET_TOTAL_BYTES as usize);
    let response = budget_open(&f, "session-budget-exact-bytes", &exact).await;
    assert_eq!(response.status(), StatusCode::OK);
    {
        let guard = f.state.session.lock().await;
        let session = guard.as_ref().unwrap();
        assert_eq!(session.revision, 1);
        assert_eq!(session.budget.cumulative_bytes, STREAM_BUDGET_TOTAL_BYTES);
        assert_eq!(session.budget.credit, STREAM_BUDGET_RATE_BURST as f64);
    }

    // Exact section cap: exactly 4096 post-dedup sections open.
    let f = incoming_fixture_caps(true, &["stream.document"]);
    let sections = (0..STREAM_BUDGET_MAX_SECTIONS)
        .map(|i| serde_json::json!({"name": format!("s-{i}"), "content": "x"}))
        .collect::<Vec<_>>();
    assert_eq!(sections.len(), STREAM_BUDGET_MAX_SECTIONS);
    let response = budget_open_sections(&f, "session-budget-exact-sections", sections).await;
    assert_eq!(response.status(), StatusCode::OK);
    assert!(f.state.session.lock().await.as_ref().unwrap().active);

    // Exact cumulative cap: 8 (open) + 67108856 (patch) == 67108864.
    let f = incoming_fixture_caps(true, &["stream.document"]);
    let response = budget_open_sections(&f, "session-budget-exact-cumulative", vec![
        serde_json::json!({"name": "body", "content": "original"}),
    ]).await;
    assert_eq!(response.status(), StatusCode::OK);
    let patch = "y".repeat(STREAM_BUDGET_TOTAL_BYTES as usize - "original".len());
    let response = budget_patch(&f, "session-budget-exact-cumulative", 1, 1, &patch).await;
    assert_eq!(response.status(), StatusCode::OK);
    let body = budget_body(response).await;
    assert_eq!(body["applied_revision"], 2);
    assert_eq!(f.state.session.lock().await.as_ref().unwrap().budget.cumulative_bytes, STREAM_BUDGET_TOTAL_BYTES);

    // Rate boundary — pure core with synthetic Instants, no sleeps:
    // exactly 1.0 token with no refill time admits and debits to 0.0.
    let now = std::time::Instant::now();
    assert_eq!(
        decide_rate_admission(1.0, now, now),
        RateDecision::Admit { credit: 0.0, last_refill: now },
    );
    // Less than one token with no refill time is exhausted.
    assert_eq!(
        decide_rate_admission(0.999, now, now),
        RateDecision::Exhausted,
    );
    // One token per 2 s refill: 0 tokens 2 s later admits at exactly
    // 1.0 (then debits to 0.0).
    let past = now - std::time::Duration::from_secs(2);
    assert_eq!(
        decide_rate_admission(0.0, past, now),
        RateDecision::Admit { credit: 0.0, last_refill: now },
    );
    // Half the refill window is not enough.
    let past = now - std::time::Duration::from_secs(1);
    assert_eq!(
        decide_rate_admission(0.0, past, now),
        RateDecision::Exhausted,
    );
    // Refill caps at the burst (60) no matter how long the gap.
    let past = now - std::time::Duration::from_secs(200);
    assert_eq!(
        decide_rate_admission(0.0, past, now),
        RateDecision::Admit { credit: 59.0, last_refill: now },
    );

    // Handler-level rate boundary: a patch at exactly 1.0 bucket token
    // is admitted and the debit leaves the bucket unable to admit the
    // next immediate patch (refill within microseconds stays below a
    // full token).
    let f = incoming_fixture_caps(true, &["stream.document"]);
    let response = budget_open_sections(&f, "session-budget-exact-rate", vec![
        serde_json::json!({"name": "body", "content": "original"}),
    ]).await;
    assert_eq!(response.status(), StatusCode::OK);
    {
        let mut guard = f.state.session.lock().await;
        let session = guard.as_mut().unwrap();
        session.budget.credit = 1.0;
        session.budget.last_refill = std::time::Instant::now();
    }
    let response = budget_patch(&f, "session-budget-exact-rate", 1, 1, "boundary").await;
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(budget_body(response).await["applied_revision"], 2);
    {
        let guard = f.state.session.lock().await;
        let session = guard.as_ref().unwrap();
        assert!(session.budget.credit < 1.0, "boundary token debited: {}", session.budget.credit);
    }
    let response = budget_patch(&f, "session-budget-exact-rate", 2, 2, "second").await;
    assert_eq!(response.status(), StatusCode::TOO_MANY_REQUESTS);
}

#[tokio::test]
async fn stream_budget_under_budget_traffic_unchanged() {
    let f = incoming_fixture_caps(true, &["stream.document"]);
    // open -> 200 accepted at revision 1.
    let response = budget_open_sections(&f, "session-budget-normal", vec![
        serde_json::json!({"name": "body", "content": "original"}),
    ]).await;
    assert_eq!(response.status(), StatusCode::OK);
    let body = budget_body(response).await;
    assert_eq!(body["accepted"], true);
    assert_eq!(body["revision"], 1);

    // patch -> 200, revision 1 -> 2, no duplicate, no resync.
    let response = budget_patch(&f, "session-budget-normal", 1, 1, "delta-1").await;
    assert_eq!(response.status(), StatusCode::OK);
    let body = budget_body(response).await;
    assert_eq!(body["applied_revision"], 2);
    assert_eq!(body["duplicate"], false);
    assert_eq!(body["needs_resync"], false);

    // duplicate retransmit of the applied seq -> 200 duplicate:true.
    let response = budget_patch(&f, "session-budget-normal", 1, 2, "delta-1").await;
    assert_eq!(response.status(), StatusCode::OK);
    let body = budget_body(response).await;
    assert_eq!(body["applied_revision"], 2);
    assert_eq!(body["duplicate"], true);
    assert_eq!(body["needs_resync"], false);

    // heartbeat -> 200 alive at revision 2.
    let response = budget_heartbeat(&f, "session-budget-normal").await;
    assert_eq!(response.status(), StatusCode::OK);
    let body = budget_body(response).await;
    assert_eq!(body["alive"], true);
    assert_eq!(body["revision"], 2);

    // close -> 200 closed with the final revision.
    let response = budget_close(&f, "session-budget-normal").await;
    assert_eq!(response.status(), StatusCode::OK);
    let body = budget_body(response).await;
    assert_eq!(body["closed"], true);
    assert_eq!(body["final_revision"], 2);

    // Emitted mt::live::update sequence unchanged: exactly one
    // doc_open, one doc_patch (revision 2), one doc_close.
    let events = f.live_events.lock().unwrap();
    assert_eq!(
        events.iter().map(|e| e["update_type"].as_str().unwrap()).collect::<Vec<_>>(),
        vec!["doc_open", "doc_patch", "doc_close"],
    );
    assert_eq!(events[1]["payload"]["revision"], 2);
    assert_eq!(events[1]["payload"]["full_content"], "delta-1");
    assert_eq!(events[2]["payload"]["final_revision"], 2);
}
// END_BLOCK_STREAM_BUDGET_TESTS
