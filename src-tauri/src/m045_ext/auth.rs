// MODULE_CONTRACT
//   PURPOSE: M-045 extension authentication. Keychain-based shared
//            secrets for extension <-> Mark IPC auth (HTTP POST with
//            Bearer token). Uses keyring crate directly, same pattern
//            as m019_datacenter.
//   SCOPE:   Generate / store / retrieve / revoke / validate shared
//            secrets. One secret per extension id.
//   DEPENDS: keyring 3, rand 0.8 (hex secret generation).
//   LINKS:   docs/knowledge-graph.xml M-045;
//            docs/development-plan.xml Phase-B2b.
//   STATUS:  Phase-B2b initial.

use rand::Rng;

// START_BLOCK_CONSTANTS
const SERVICE_NAME: &str = "com.xronocode.mark";

/// Keyring key prefix for extension secrets.
fn secret_key(ext_id: &str) -> String {
    format!("ext:{ext_id}:shared_secret")
}
// END_BLOCK_CONSTANTS

// START_BLOCK_GENERATE
/// Generate a cryptographically random 32-byte hex secret.
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
/// Store a shared secret for an extension in the OS keychain.
pub fn store_secret(ext_id: &str, secret: &str) -> Result<(), String> {
    let key = secret_key(ext_id);
    let entry = keyring::Entry::new(SERVICE_NAME, &key).map_err(|e| {
        safe_eprintln!("[ExtHost][auth][BLOCK_KEYRING_ENTRY_FAILED id={ext_id} reason={e}]");
        e.to_string()
    })?;
    entry.set_password(secret).map_err(|e| {
        safe_eprintln!("[ExtHost][auth][BLOCK_STORE_FAILED id={ext_id} reason={e}]");
        e.to_string()
    })?;
    safe_eprintln!("[ExtHost][auth][BLOCK_STORE_OK id={ext_id}]");
    Ok(())
}
// END_BLOCK_STORE

// START_BLOCK_GET
/// Retrieve the shared secret for an extension from the OS keychain.
/// Returns Ok(None) if no secret is stored.
pub fn get_secret(ext_id: &str) -> Result<Option<String>, String> {
    let key = secret_key(ext_id);
    let entry = keyring::Entry::new(SERVICE_NAME, &key).map_err(|e| {
        safe_eprintln!("[ExtHost][auth][BLOCK_KEYRING_ENTRY_FAILED id={ext_id} reason={e}]");
        e.to_string()
    })?;
    match entry.get_password() {
        Ok(secret) => {
            safe_eprintln!("[ExtHost][auth][BLOCK_GET_HIT id={ext_id}]");
            Ok(Some(secret))
        }
        Err(keyring::Error::NoEntry) => {
            safe_eprintln!("[ExtHost][auth][BLOCK_GET_MISS id={ext_id}]");
            Ok(None)
        }
        Err(e) => {
            safe_eprintln!("[ExtHost][auth][BLOCK_GET_FAILED id={ext_id} reason={e}]");
            Err(e.to_string())
        }
    }
}
// END_BLOCK_GET

// START_BLOCK_REVOKE
/// Delete the shared secret for an extension from the OS keychain.
pub fn revoke_secret(ext_id: &str) -> Result<(), String> {
    let key = secret_key(ext_id);
    let entry = keyring::Entry::new(SERVICE_NAME, &key).map_err(|e| e.to_string())?;
    match entry.delete_credential() {
        Ok(_) | Err(keyring::Error::NoEntry) => {
            safe_eprintln!("[ExtHost][auth][BLOCK_REVOKE id={ext_id}]");
            Ok(())
        }
        Err(e) => {
            safe_eprintln!("[ExtHost][auth][BLOCK_REVOKE_FAILED id={ext_id} reason={e}]");
            Err(e.to_string())
        }
    }
}
// END_BLOCK_REVOKE

// START_BLOCK_VALIDATE
/// Validate a token against the stored secret for an extension.
/// Returns false if no secret is stored or if the token doesn't match.
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

/// Constant-time byte comparison to prevent timing attacks.
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
