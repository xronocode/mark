// FILE: src-tauri/src/m045_ext/mod.rs
// START_MODULE_CONTRACT
//   PURPOSE: M-045 extension host. Discovers, registers, authenticates,
//            and invokes local HTTP-based extensions. Extensions are
//            standalone processes that expose capabilities over
//            127.0.0.1 via HTTP POST (Decision D1). Hosts a live-viewer
//            HTTP server for incoming stream.document messages from
//            external apps (Phase B5a).
//   SCOPE:   Extension lifecycle: discover manifests from known dirs,
//            health-probe, register in-memory, enable/disable, invoke
//            capabilities with keychain-backed auth. Disable succeeds only
//            after strict persistent/memory credential absence. Live server:
//            /ext/pair + /stream/* endpoints for document streaming.
//            No remote marketplace (out of scope).
//   DEPENDS: reqwest (HTTP client), keyring (keychain), rand (secret gen),
//            serde/serde_json (manifest), tokio (async), axum (HTTP server).
//   LINKS:   .grace/changes/archive/C-SEC-AUDIT-FIXES;
//            .grace/graph/features.xml M-045;
//            .grace/graph/features.xml M-045 (PhaseRef Phase-B2b,) Phase-B5a;
//            ROADMAP.md Decisions D1 (HTTP POST IPC), D10 (notarized DMG).
//   STATUS:  Phase-B5b — live_bridge + LiveViewer.vue added;
//            Phase-B4 — text_ops (text.insert + text.transform) added.
//
// CHANGE_SUMMARY:
//   - 2026-11-23 C-EXT-TRUST-COHERENCE T-003: mt_ext_disable drains the disabled extension's pending /ext/context reads inside its existing stream_gate block (live_server::drain_pending_context, BLOCK_DISABLE_CONTEXT_DRAINED with the drained count), so the woken handlers' pre-serve epoch re-check refuses them — lock order stays stream_gate, then the leaf pending-context map.
//   - 2026-11-21 C-SEC-EXT-GRANT-BOUND T-002: mt_ext_enable refuses — before taking stream_gate — while the current manifest (registry.peek_manifest) requests incoming capabilities beyond the stored approved grant (BLOCK_ENABLE_GRANT_EXCEEDED / ext_enable_reapproval_required, unreadable grant BLOCK_ENABLE_GRANT_UNREADABLE / ext_enable_grant_unreadable); an enable-minted credential deliberately receives no grant and authorizes no incoming route; mt_ext_disable additionally revokes the stored grant best-effort (BLOCK_DISABLE_GRANT_REVOKED / BLOCK_DISABLE_GRANT_REVOKE_FAILED) without joining the strict-absence success condition.
//   - 2026-11-11 C-SEC-STREAM-AUTH: fence and close the owner stream before credential revocation, including failure.
//   - 2026-11-09 C-SEC-AUDIT-FIXES T-004: fence disable before strict credential revocation and read-back.
//   - 2026-06-08 B4: text_ops module added (text.insert + text.transform
//     capabilities for extensions).
//   - 2026-06-08 B5b: live_bridge (Tauri event bridge) module added;
//     live_server handlers now emit to frontend via live_bridge.
//   - 2026-06-08 B5a: live_server (axum HTTP server) + live_endpoint
//     (discovery file write/cleanup) modules added.
//   - 2026-06-08 B2b: initial m045_ext module creation.
//   ROLE: BARREL
//   MAP_MODE: SUMMARY
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   Coverage: GRACE 4 synchronized surface for M-045.
// END_MODULE_MAP

pub mod manifest;
pub mod discovery;
pub mod registry;
pub mod auth;
pub mod invoke;
pub mod live_server;
pub mod live_endpoint;
pub mod live_bridge;
pub mod text_ops;

#[cfg(test)]
mod tests;

#[allow(unused_imports)]
pub use registry::{ExtRegistry, ExtensionInfo};
#[allow(unused_imports)]
pub use live_server::{start_live_server, LiveServerState};
#[allow(unused_imports)]
pub use live_endpoint::{write_endpoint, cleanup_endpoint, make_endpoint};
#[allow(unused_imports)]
pub use live_bridge::{emit_live_update, emit_doc_open, emit_doc_patch, emit_doc_close, emit_context_request, LiveUpdate};
#[allow(unused_imports)]
pub use text_ops::{mt_ext_text_insert, mt_ext_text_transform};

// START_BLOCK_TAURI_COMMANDS

/// Discover extensions from known directories, probe health, and
/// register them in the registry. Returns the list of discovered
/// extensions.
#[tauri::command]
pub async fn mt_ext_discover(
    registry: tauri::State<'_, ExtRegistry>,
) -> Result<Vec<ExtensionInfo>, String> {
    let discovered = discovery::discover_extensions().await;

    let _stream_gate = registry.stream_gate.lock().await;
    for ext in &discovered {
        registry.register(ext.manifest.clone(), ext.healthy)?;
    }

    safe_eprintln!(
        "[ExtHost][command][BLOCK_DISCOVER count={}]",
        discovered.len()
    );
    Ok(registry.list())
}

/// Enable an extension by id. Generates and stores a shared secret
/// in the keychain if one doesn't already exist. C-SEC-EXT-GRANT-BOUND:
/// the enable is refused while the current manifest requests incoming
/// capabilities beyond the stored approved grant — a fresh pairing is
/// the re-approval path (the gallery surfaces
/// ext_enable_reapproval_required). A credential minted here carries NO
/// grant and therefore authorizes no incoming route.
#[tauri::command]
pub async fn mt_ext_enable(
    id: String,
    registry: tauri::State<'_, ExtRegistry>,
) -> Result<(), String> {
    // Ensure a shared secret exists for this extension.
    if auth::get_secret(&id)?.is_none() {
        let secret = auth::generate_secret();
        auth::store_secret(&id, &secret)?;
        safe_eprintln!("[ExtHost][command][BLOCK_ENABLE_SECRET_GENERATED id={id}]");
    }

    // Coverage gate: enabling must not confer incoming rights beyond the
    // grant approved at pairing. The current manifest is read through
    // peek_manifest — get_manifest answers only for enabled ids and would
    // self-refuse the extension being enabled — and this credential I/O
    // runs BEFORE stream_gate is taken (native credential I/O holds
    // neither gate nor session lock).
    let incoming = live_server::incoming_capability_names();
    let requested: Vec<String> = registry
        .peek_manifest(&id)
        .map(|m| {
            m.capabilities
                .iter()
                .map(|c| c.name.clone())
                .filter(|name| incoming.contains(&name.as_str()))
                .collect()
        })
        .unwrap_or_default();
    if !requested.is_empty() {
        let grant = auth::get_grant(&id).map_err(|e| {
            safe_eprintln!("[ExtHost][command][BLOCK_ENABLE_GRANT_UNREADABLE id={id} reason={e}]");
            "ext_enable_grant_unreadable".to_string()
        })?;
        let missing: Vec<&str> = requested
            .iter()
            .map(String::as_str)
            .filter(|name| !grant.iter().flatten().any(|granted| granted.as_str() == *name))
            .collect();
        if !missing.is_empty() {
            safe_eprintln!(
                "[ExtHost][command][BLOCK_ENABLE_GRANT_EXCEEDED id={id} missing={}]",
                missing.join(","),
            );
            return Err("ext_enable_reapproval_required".to_string());
        }
    }

    let _stream_gate = registry.stream_gate.lock().await;
    registry.enable(&id)?;
    safe_eprintln!("[ExtHost][command][BLOCK_ENABLE id={id}]");
    Ok(())
}

/// Disable an extension by id.
#[tauri::command]
pub async fn mt_ext_disable<R: tauri::Runtime>(
    id: String,
    registry: tauri::State<'_, ExtRegistry>,
    app: tauri::AppHandle<R>,
) -> Result<(), String> {
    // Fence stream mutations and deactivate the owned session before native I/O.
    // Lock order matches handlers: stream_gate, then session; never keyring I/O.
    {
        use tauri::Manager;
        let _stream_gate = registry.stream_gate.lock().await;
        registry.disable(&id)?;
        if let Some(state) = app.try_state::<std::sync::Arc<LiveServerState<R>>>() {
            // C-EXT-TRUST-COHERENCE: drain this extension's pending
            // /ext/context reads under the same fence, so the woken
            // handlers' pre-serve epoch re-check refuses them instead of
            // serving content for a disabled extension.
            let drained = live_server::drain_pending_context(&state, &id);
            if drained > 0 {
                safe_eprintln!(
                    "[ExtHost][command][BLOCK_DISABLE_CONTEXT_DRAINED id={id} count={drained}]"
                );
            }
            let mut guard = state.session.lock().await;
            if let Some(session) = guard.as_mut().filter(|s| s.active && s.extension_id == id) {
                session.active = false;
                let _ = live_bridge::emit_doc_close(&app, &session.session_id, session.session_epoch, session.revision);
            }
        }
    }
    let revoked_id = id.clone();
    let revoked = tokio::task::spawn_blocking(move || {
        auth::revoke_secret(&revoked_id)?;
        auth::verify_secret_absent(&revoked_id)
    }).await.map_err(|e| format!("credential worker failed: {e}"))
        .and_then(|result| result);
    if let Err(detail) = revoked {
        safe_eprintln!("[ExtHost][command][BLOCK_DISABLE_REVOKE_FAILED id={id} reason={detail}]");
        return Err("ext_disable_revoke_failed".to_string());
    }
    // C-SEC-EXT-GRANT-BOUND: the approved grant is revoked best-effort
    // with its own log. A stale grant is inert while no valid token
    // exists (every route requires a valid token AND its grant), so it
    // deliberately never joins the strict-absence success condition.
    let grant_id = id.clone();
    let grant_revoked = tokio::task::spawn_blocking(move || auth::revoke_grant(&grant_id)).await;
    match grant_revoked {
        Ok(Ok(())) => safe_eprintln!("[ExtHost][command][BLOCK_DISABLE_GRANT_REVOKED id={id}]"),
        Ok(Err(e)) => safe_eprintln!(
            "[ExtHost][command][BLOCK_DISABLE_GRANT_REVOKE_FAILED id={id} reason={e}]"
        ),
        Err(e) => safe_eprintln!(
            "[ExtHost][command][BLOCK_DISABLE_GRANT_REVOKE_FAILED id={id} reason={e}]"
        ),
    }
    safe_eprintln!("[ExtHost][command][BLOCK_DISABLE id={id}]");
    Ok(())
}

/// Invoke a capability on an enabled extension. Looks up the manifest
/// from the registry, retrieves the auth token from keychain, and
/// calls the extension over HTTP POST.
#[tauri::command]
pub async fn mt_ext_invoke(
    id: String,
    capability: String,
    payload: serde_json::Value,
    registry: tauri::State<'_, ExtRegistry>,
) -> Result<serde_json::Value, String> {
    let manifest = registry.get_manifest(&id)?;
    let token = auth::get_secret(&id)?;

    let result = invoke::invoke_extension(
        &manifest,
        &capability,
        payload,
        token.as_deref(),
    )
    .await
    .map_err(|e| {
        safe_eprintln!(
            "[ExtHost][command][BLOCK_INVOKE_FAILED id={id} cap={capability} reason={e}]"
        );
        format!("{e}")
    })?;

    safe_eprintln!("[ExtHost][command][BLOCK_INVOKE_OK id={id} cap={capability}]");
    Ok(result)
}

/// List all registered extensions with their current state.
#[tauri::command]
pub async fn mt_ext_list(
    registry: tauri::State<'_, ExtRegistry>,
) -> Result<Vec<ExtensionInfo>, String> {
    Ok(registry.list())
}

// END_BLOCK_TAURI_COMMANDS
