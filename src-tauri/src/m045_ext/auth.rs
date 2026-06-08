// MODULE_CONTRACT
//   PURPOSE: M-045 extension authentication. Keychain-based shared
//            secrets for extension <-> Mark IPC auth (HTTP POST with
//            Bearer token). Uses keyring crate with in-memory fallback
//            for unsigned debug builds where keychain may silently fail.
//   SCOPE:   Generate / store / retrieve / revoke / validate shared
//            secrets. One secret per extension id.
//   DEPENDS: keyring 3, rand 0.8 (hex secret generation).
//   LINKS:   docs/knowledge-graph.xml M-045;
//            docs/development-plan.xml Phase-B2b.
//   STATUS:  Phase-B2b initial.

use rand::Rng;
use std::collections::HashMap;
use std::sync::Mutex;

// START_BLOCK_CONSTANTS
const SERVICE_NAME: &str = "com.xronocode.mark";

fn secret_key(ext_id: &str) -> String {
    format!("ext:{ext_id}:shared_secret")
}

static MEM_STORE: std::sync::LazyLock<Mutex<HashMap<String, String>>> =
    std::sync::LazyLock::new(|| Mutex::new(HashMap::new()));
// END_BLOCK_CONSTANTS

// START_BLOCK_GENERATE
pub fn generate_secret() -> String {
    let mut bytes = [0u8; 32];
    rand::thread_rng().fill(&mut bytes);
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
pub fn store_secret(ext_id: &str, secret: &str) -> Result<(), String> {
    let key = secret_key(ext_id);

    // Always store in memory (guaranteed to work).
    if let Ok(mut store) = MEM_STORE.lock() {
        store.insert(key.clone(), secret.to_string());
    }

    // Best-effort keychain persistence.
    match keyring::Entry::new(SERVICE_NAME, &key) {
        Ok(entry) => {
            if let Err(e) = entry.set_password(secret) {
                safe_eprintln!("[ExtHost][auth][BLOCK_KEYCHAIN_STORE_FAILED id={ext_id} reason={e} (in-memory fallback active)]");
            } else {
                // Verify the store actually persisted.
                match entry.get_password() {
                    Ok(ref read_back) if read_back == secret => {
                        safe_eprintln!("[ExtHost][auth][BLOCK_STORE_OK id={ext_id} backend=keychain]");
                    }
                    _ => {
                        safe_eprintln!("[ExtHost][auth][BLOCK_KEYCHAIN_VERIFY_FAILED id={ext_id} (in-memory fallback active)]");
                    }
                }
            }
        }
        Err(e) => {
            safe_eprintln!("[ExtHost][auth][BLOCK_KEYRING_ENTRY_FAILED id={ext_id} reason={e} (in-memory fallback active)]");
        }
    }

    safe_eprintln!("[ExtHost][auth][BLOCK_STORE_OK id={ext_id}]");
    Ok(())
}
// END_BLOCK_STORE

// START_BLOCK_GET
pub fn get_secret(ext_id: &str) -> Result<Option<String>, String> {
    let key = secret_key(ext_id);

    // Try keychain first.
    if let Ok(entry) = keyring::Entry::new(SERVICE_NAME, &key) {
        match entry.get_password() {
            Ok(secret) => {
                safe_eprintln!("[ExtHost][auth][BLOCK_GET_HIT id={ext_id} backend=keychain]");
                return Ok(Some(secret));
            }
            Err(keyring::Error::NoEntry) => {}
            Err(e) => {
                safe_eprintln!("[ExtHost][auth][BLOCK_KEYCHAIN_GET_FAILED id={ext_id} reason={e}]");
            }
        }
    }

    // Fall back to in-memory store.
    if let Ok(store) = MEM_STORE.lock() {
        if let Some(secret) = store.get(&key) {
            safe_eprintln!("[ExtHost][auth][BLOCK_GET_HIT id={ext_id} backend=memory]");
            return Ok(Some(secret.clone()));
        }
    }

    safe_eprintln!("[ExtHost][auth][BLOCK_GET_MISS id={ext_id}]");
    Ok(None)
}
// END_BLOCK_GET

// START_BLOCK_REVOKE
pub fn revoke_secret(ext_id: &str) -> Result<(), String> {
    let key = secret_key(ext_id);

    if let Ok(mut store) = MEM_STORE.lock() {
        store.remove(&key);
    }

    if let Ok(entry) = keyring::Entry::new(SERVICE_NAME, &key) {
        match entry.delete_credential() {
            Ok(_) | Err(keyring::Error::NoEntry) => {}
            Err(e) => {
                safe_eprintln!("[ExtHost][auth][BLOCK_REVOKE_FAILED id={ext_id} reason={e}]");
            }
        }
    }

    safe_eprintln!("[ExtHost][auth][BLOCK_REVOKE id={ext_id}]");
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
