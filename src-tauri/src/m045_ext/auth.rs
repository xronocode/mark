// FILE: src-tauri/src/m045_ext/auth.rs
// START_MODULE_CONTRACT
//   PURPOSE: M-045 extension authentication. Keychain-based shared
//            secrets for extension <-> Mark IPC auth (HTTP POST with
//            Bearer token). Uses keyring crate with in-memory fallback
//            for unsigned debug builds where keychain may silently fail.
//   SCOPE:   Generate / store / retrieve / revoke / validate shared
//            secrets, plus the pairing-time approved capability grant
//            stored beside each secret (capability names only). One
//            secret per extension id.
//   DEPENDS: keyring 4, rand 0.10 (hex secret generation), serde_json,
//            mt_paths configured service identity.
//   LINKS: M-045, M-022
//   STATUS:  Phase-B2b initial.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   generate_secret - Generate a random per-extension pairing secret.
//   store_secret - Store in memory with best-effort persistent storage, verifying through the effective credential path before reporting success.
//   get_secret - Read persistent credentials with a memory fallback.
//   revoke_secret - Revoke both stores without swallowing backend errors.
//   verify_secret_absent - Strictly prove persistent and memory absence.
//   validate_token - Compare the stored secret with a bearer token.
//   store_grant - Persist the approved incoming capability names beside the credential, verifying through get_grant.
//   get_grant - Read the stored grant with exactly get_secret's precedence.
//   revoke_grant - Revoke both grant stores without swallowing backend errors.
//   read_credential_record - Strictly read the persistent credential record for rebind proofs.
// END_MODULE_MAP

// START_CHANGE_SUMMARY
//   - 2026-11-21 C-SEC-EXT-GRANT-BOUND T-001..T-003: the approved incoming capability set persists beside the credential (grant_key "ext:{id}:approved_grant", MEM_GRANTS mirror, store_grant/get_grant/revoke_grant with get_secret's precedence; capability names only), and store_secret became honest — it verifies the new secret through get_secret (the effective credential path) before the now-conditional BLOCK_STORE_OK and restores the previous memory value on every refusal (BLOCK_STORE_VERIFY_MISMATCH / _ABSENT / _READ_FAILED); read_credential_record gives the rebind proof a strict record read.
//   - 2026-11-09 C-SEC-AUDIT-FIXES T-004: strict revocation and explicit injectable credential errors.
// END_CHANGE_SUMMARY

use rand::Rng;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

// START_BLOCK_CREDENTIAL_BACKEND
fn secret_key(ext_id: &str) -> String {
    format!("ext:{ext_id}:shared_secret")
}

static MEM_STORE: std::sync::LazyLock<Mutex<HashMap<String, String>>> =
    std::sync::LazyLock::new(|| Mutex::new(HashMap::new()));

/// Each backend distinguishes a confirmed missing credential from access errors.
/// Entry creation is a separate Result at credential(), before these operations.
pub(super) trait Credential: Send + Sync {
    fn read(&self) -> Result<Option<String>, String>;
    fn write(&self, secret: &str) -> Result<(), String>;
    fn delete(&self) -> Result<(), String>;
}

#[cfg(not(test))]
struct KeyringCredential(keyring::Entry);

#[cfg(not(test))]
impl Credential for KeyringCredential {
    fn read(&self) -> Result<Option<String>, String> {
        match self.0.get_password() {
            Ok(secret) => Ok(Some(secret)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(format!("credential_read_failed: {e}")),
        }
    }
    fn write(&self, secret: &str) -> Result<(), String> {
        self.0.set_password(secret).map_err(|e| format!("credential_write_failed: {e}"))
    }
    fn delete(&self) -> Result<(), String> {
        match self.0.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(format!("credential_delete_failed: {e}")),
        }
    }
}

#[cfg(not(test))]
fn credential(ext_id: &str) -> Result<Arc<dyn Credential>, String> {
    let entry = keyring::Entry::new(crate::mt_paths::application_identifier(), &secret_key(ext_id))
        .map_err(|e| format!("credential_entry_failed: {e}"))?;
    Ok(Arc::new(KeyringCredential(entry)))
}

// A test binary never initializes an OS credential backend, even if a fixture
// forgets to inject one. Each extension has its own backend, avoiding global
// keyring-builder changes and cross-test credential races.
#[cfg(test)]
type TestBackends = HashMap<String, Result<Arc<dyn Credential>, String>>;
#[cfg(test)]
static TEST_BACKENDS: std::sync::LazyLock<Mutex<TestBackends>> =
    std::sync::LazyLock::new(|| Mutex::new(HashMap::new()));
#[cfg(test)]
fn credential(ext_id: &str) -> Result<Arc<dyn Credential>, String> {
    TEST_BACKENDS.lock().map_err(|_| "test backend lock failed".to_string())?
        .get(ext_id).cloned().unwrap_or_else(|| Err("test backend not installed".to_string()))
}
// END_BLOCK_CREDENTIAL_BACKEND

// START_BLOCK_GENERATE
pub fn generate_secret() -> String {
    let mut bytes = [0u8; 32];
    rand::rng().fill_bytes(&mut bytes);
    hex_encode(&bytes)
}

pub(crate) fn hex_encode(bytes: &[u8]) -> String {
    let mut s = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        s.push_str(&format!("{b:02x}"));
    }
    s
}
// END_BLOCK_GENERATE

// START_BLOCK_STORE
/// Honest store: the write reports success only after the new secret is
/// verified through get_secret — the effective credential path every
/// reader uses. A failed keychain write keeps its in-memory-fallback
/// warning, but when the effective path does not answer the new secret
/// (the old persistent record still served, no record, or an unreadable
/// store) the store refuses and restores the previous memory value, so
/// a refused store leaves the prior credential exactly as found. Error
/// strings carry no secret material.
pub fn store_secret(ext_id: &str, secret: &str) -> Result<(), String> {
    let previous = MEM_STORE.lock().map_err(|_| "memory credential store unavailable".to_string())?
        .insert(secret_key(ext_id), secret.to_string());
    let persisted = credential(ext_id).and_then(|entry| entry.write(secret));
    if let Err(e) = persisted {
        safe_eprintln!("[ExtHost][auth][BLOCK_KEYCHAIN_STORE_FAILED id={ext_id} reason={e} (in-memory fallback active)]");
    }
    match get_secret(ext_id) {
        Ok(Some(stored)) if constant_time_eq(stored.as_bytes(), secret.as_bytes()) => {
            safe_eprintln!("[ExtHost][auth][BLOCK_STORE_OK id={ext_id}]");
            Ok(())
        }
        Ok(Some(_)) => {
            safe_eprintln!("[ExtHost][auth][BLOCK_STORE_VERIFY_MISMATCH id={ext_id}]");
            restore_previous_memory(ext_id, previous);
            Err("stored credential verification failed".to_string())
        }
        Ok(None) => {
            safe_eprintln!("[ExtHost][auth][BLOCK_STORE_VERIFY_ABSENT id={ext_id}]");
            restore_previous_memory(ext_id, previous);
            Err("stored credential verification found no record".to_string())
        }
        Err(e) => {
            safe_eprintln!("[ExtHost][auth][BLOCK_STORE_VERIFY_READ_FAILED id={ext_id} reason={e}]");
            restore_previous_memory(ext_id, previous);
            Err(e)
        }
    }
}

/// Restore the memory mirror to the value captured before a refused
/// store, so the effective credential path answers exactly as before.
fn restore_previous_memory(ext_id: &str, previous: Option<String>) {
    match MEM_STORE.lock() {
        Ok(mut store) => match previous {
            Some(previous) => { store.insert(secret_key(ext_id), previous); }
            None => { store.remove(&secret_key(ext_id)); }
        },
        Err(e) => safe_eprintln!("[ExtHost][auth][BLOCK_STORE_RESTORE_FAILED id={ext_id} reason={e}]"),
    }
}

/// Strict credential-record read for the rebind-only old-key proof:
/// unlike get_secret, a failing keychain read is an Err — it can never
/// be answered from the memory mirror, because proving the previous
/// record dead requires reading the record itself.
pub(super) fn read_credential_record(ext_id: &str) -> Result<Option<String>, String> {
    credential(ext_id)?.read()
}
// END_BLOCK_STORE

// START_BLOCK_GRANT_STORE
fn grant_key(ext_id: &str) -> String {
    format!("ext:{ext_id}:approved_grant")
}

/// Memory mirror of the approved incoming capability sets. Capability
/// names only — no secret material ever enters a grant record.
static MEM_GRANTS: std::sync::LazyLock<Mutex<HashMap<String, Vec<String>>>> =
    std::sync::LazyLock::new(|| Mutex::new(HashMap::new()));

#[cfg(not(test))]
fn grant_credential(ext_id: &str) -> Result<Arc<dyn Credential>, String> {
    let entry = keyring::Entry::new(crate::mt_paths::application_identifier(), &grant_key(ext_id))
        .map_err(|e| format!("credential_entry_failed: {e}"))?;
    Ok(Arc::new(KeyringCredential(entry)))
}

// Parallel injection map so secret and grant backends can fail
// independently in tests. Mirrors TEST_BACKENDS.
#[cfg(test)]
type TestGrantBackends = HashMap<String, Result<Arc<dyn Credential>, String>>;
#[cfg(test)]
static TEST_GRANT_BACKENDS: std::sync::LazyLock<Mutex<TestGrantBackends>> =
    std::sync::LazyLock::new(|| Mutex::new(HashMap::new()));
#[cfg(test)]
fn grant_credential(ext_id: &str) -> Result<Arc<dyn Credential>, String> {
    TEST_GRANT_BACKENDS.lock().map_err(|_| "test grant backend lock failed".to_string())?
        .get(ext_id).cloned().unwrap_or_else(|| Err("test grant backend not installed".to_string()))
}

/// Persist the approved incoming capability set beside the credential:
/// a canonical serde_json array under grant_key, mirrored into
/// MEM_GRANTS and verified through get_grant (the same precedence every
/// route authorizes by) before Ok. Callers validate the names against
/// RouteCapability; auth validates nothing about them.
pub(super) fn store_grant(ext_id: &str, capabilities: &[String]) -> Result<(), String> {
    let encoded = serde_json::to_string(&capabilities)
        .map_err(|e| format!("grant encode failed: {e}"))?;
    MEM_GRANTS.lock().map_err(|_| "memory grant store unavailable".to_string())?
        .insert(grant_key(ext_id), capabilities.to_vec());
    let persisted = grant_credential(ext_id).and_then(|entry| entry.write(&encoded));
    if let Err(e) = persisted {
        safe_eprintln!("[ExtHost][auth][BLOCK_GRANT_STORE_FAILED id={ext_id} reason={e}]");
    }
    match get_grant(ext_id)? {
        Some(stored) if stored.as_slice() == capabilities => {
            safe_eprintln!("[ExtHost][auth][BLOCK_GRANT_STORE_OK id={ext_id}]");
            Ok(())
        }
        other => {
            safe_eprintln!("[ExtHost][auth][BLOCK_GRANT_STORE_FAILED id={ext_id} reason=verification mismatch]");
            Err(format!("grant verification failed (stored {:?} names)", other.map(|grant| grant.len())))
        }
    }
}

/// Read the stored grant with exactly get_secret's precedence:
/// persistent-first, memory fallback after a logged read error,
/// Ok(None) when neither store holds a record. A decode failure of a
/// persisted record counts as a read error.
pub(super) fn get_grant(ext_id: &str) -> Result<Option<Vec<String>>, String> {
    match grant_credential(ext_id).and_then(|entry| entry.read()) {
        Ok(Some(encoded)) => match serde_json::from_str::<Vec<String>>(&encoded) {
            Ok(grant) => return Ok(Some(grant)),
            Err(e) => safe_eprintln!("[ExtHost][auth][BLOCK_GRANT_GET_FAILED id={ext_id} reason=decode failed: {e}]"),
        },
        Ok(None) => {},
        Err(e) => safe_eprintln!("[ExtHost][auth][BLOCK_GRANT_GET_FAILED id={ext_id} reason={e}]"),
    }
    let store = MEM_GRANTS.lock().map_err(|_| "memory grant store unavailable".to_string())?;
    Ok(store.get(&grant_key(ext_id)).cloned())
}

pub(super) fn revoke_grant(ext_id: &str) -> Result<(), String> {
    MEM_GRANTS.lock().map_err(|_| "memory grant store unavailable".to_string())?
        .remove(&grant_key(ext_id));
    grant_credential(ext_id)?.delete()?;
    safe_eprintln!("[ExtHost][auth][BLOCK_GRANT_REVOKED id={ext_id}]");
    Ok(())
}
// END_BLOCK_GRANT_STORE

// START_BLOCK_GET
pub fn get_secret(ext_id: &str) -> Result<Option<String>, String> {
    match credential(ext_id).and_then(|entry| entry.read()) {
        Ok(Some(secret)) => return Ok(Some(secret)),
        Ok(None) => {},
        Err(e) => safe_eprintln!("[ExtHost][auth][BLOCK_KEYCHAIN_GET_FAILED id={ext_id} reason={e}]"),
    }
    let store = MEM_STORE.lock().map_err(|_| "memory credential store unavailable".to_string())?;
    Ok(store.get(&secret_key(ext_id)).cloned())
}
// END_BLOCK_GET

// START_BLOCK_REVOKE
pub fn revoke_secret(ext_id: &str) -> Result<(), String> {
    MEM_STORE.lock().map_err(|_| "memory credential store unavailable".to_string())?
        .remove(&secret_key(ext_id));
    credential(ext_id)?.delete()?;
    safe_eprintln!("[ExtHost][auth][BLOCK_REVOKE id={ext_id}]");
    Ok(())
}

/// Unlike get_secret, an inaccessible persistent store can never mean absent.
pub fn verify_secret_absent(ext_id: &str) -> Result<(), String> {
    if credential(ext_id)?.read()?.is_some() {
        return Err("persistent credential survives revocation".to_string());
    }
    let store = MEM_STORE.lock().map_err(|_| "memory credential store unavailable".to_string())?;
    if store.contains_key(&secret_key(ext_id)) {
        return Err("memory credential survives revocation".to_string());
    }
    Ok(())
}
// END_BLOCK_REVOKE

// START_BLOCK_VALIDATE
pub fn validate_token(ext_id: &str, token: &str) -> bool {
    match get_secret(ext_id) {
        Ok(Some(secret)) => {
            let valid = constant_time_eq(secret.as_bytes(), token.as_bytes());
            if !valid {
                safe_eprintln!("[ExtHost][auth][BLOCK_VALIDATE_MISMATCH id={ext_id}]");
            }
            valid
        }
        Ok(None) => {
            safe_eprintln!("[ExtHost][auth][BLOCK_VALIDATE_NO_SECRET id={ext_id}]");
            false
        }
        Err(e) => {
            safe_eprintln!("[ExtHost][auth][BLOCK_VALIDATE_ERROR id={ext_id} reason={e}]");
            false
        }
    }
}

pub(crate) fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (x, y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}
// END_BLOCK_VALIDATE

// START_BLOCK_TEST_BACKEND
#[cfg(test)]
pub(super) fn inject_test_secret(ext_id: &str, secret: &str) {
    MEM_STORE.lock().unwrap().insert(secret_key(ext_id), secret.to_string());
}
#[cfg(test)]
pub(super) fn inject_test_backend(ext_id: &str, backend: Result<Arc<dyn Credential>, String>) {
    TEST_BACKENDS.lock().unwrap().insert(ext_id.to_string(), backend);
}
#[cfg(test)]
pub(super) fn clear_test_secret(ext_id: &str) {
    MEM_STORE.lock().unwrap().remove(&secret_key(ext_id));
    TEST_BACKENDS.lock().unwrap().remove(ext_id);
}
#[cfg(test)]
pub(super) fn inject_test_grant_backend(ext_id: &str, backend: Result<Arc<dyn Credential>, String>) {
    TEST_GRANT_BACKENDS.lock().unwrap().insert(ext_id.to_string(), backend);
}
#[cfg(test)]
pub(super) fn clear_test_grant(ext_id: &str) {
    MEM_GRANTS.lock().unwrap().remove(&grant_key(ext_id));
    TEST_GRANT_BACKENDS.lock().unwrap().remove(ext_id);
}
// END_BLOCK_TEST_BACKEND
