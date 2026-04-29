// MODULE_CONTRACT
//   PURPOSE: M-019 mt-datacenter. Secret storage via OS keyring (macOS
//            Keychain / Windows Credential Manager / Linux Secret Service)
//            using the `keyring` crate. v1.2.3 stored image-uploader API
//            keys + GitHub PATs under serviceName="marktext"; v2 uses
//            "com.xronocode.mark" — F-DC-MIGRATE-V1-KEYCHAIN handles
//            the rename when migration ships.
//   SCOPE:   set / get / delete keyring secrets. Image-uploader runtime
//            (PicGo / aliyun / qiniu / smms etc.) deferred to F-DC-IMAGE-
//            UPLOAD; that's a substantial feature that integrates with
//            the renderer image-paste flow.
//   DEPENDS: keyring 3 — cross-platform OS-secret-store binding.
//   LINKS:   docs/development-plan.xml Phase-B3 step-7.
//   STATUS:  Phase-B3 step-7 lite — keyring CRUD only.
//
// CHANGE_SUMMARY:
//   - 2026-04-29 B3-step-7: initial keyring set/get/delete.

const SERVICE_NAME: &str = "com.xronocode.mark";

#[tauri::command]
pub async fn mt_secret_set(key: String, value: String) -> Result<(), String> {
    let entry = keyring::Entry::new(SERVICE_NAME, &key).map_err(|e| e.to_string())?;
    entry.set_password(&value).map_err(|e| {
        eprintln!("[DataCenter][secret][BLOCK_KEYRING_SET_FAILED reason={e}]");
        e.to_string()
    })?;
    eprintln!("[DataCenter][secret][BLOCK_KEYRING_SET_OK key={key}]");
    Ok(())
}

#[tauri::command]
pub async fn mt_secret_get(key: String) -> Result<Option<String>, String> {
    let entry = keyring::Entry::new(SERVICE_NAME, &key).map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(p) => {
            eprintln!("[DataCenter][secret][BLOCK_KEYRING_GET_HIT key={key}]");
            Ok(Some(p))
        }
        Err(keyring::Error::NoEntry) => {
            eprintln!("[DataCenter][secret][BLOCK_KEYRING_GET_MISS key={key}]");
            Ok(None)
        }
        Err(e) => {
            eprintln!("[DataCenter][secret][BLOCK_KEYRING_GET_FAILED reason={e}]");
            Err(e.to_string())
        }
    }
}

#[tauri::command]
pub async fn mt_secret_delete(key: String) -> Result<(), String> {
    let entry = keyring::Entry::new(SERVICE_NAME, &key).map_err(|e| e.to_string())?;
    match entry.delete_credential() {
        Ok(_) | Err(keyring::Error::NoEntry) => {
            eprintln!("[DataCenter][secret][BLOCK_KEYRING_DELETE key={key}]");
            Ok(())
        }
        Err(e) => Err(e.to_string()),
    }
}

// NOTE: keyring crate I/O hits the OS secret store, which is not safely
// usable from `#[test]` runners (CI may not have a keychain; macOS may
// prompt for permission). Tests are intentionally absent here; verification
// happens via manual smoke + V-M-019 e2e in B3a.
