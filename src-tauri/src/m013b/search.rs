// MODULE_CONTRACT
//   PURPOSE: M-013b search command STUBS. Mirrors v1.2.3's mt::search-spawn
//            (handle) + mt::search-cancel (on) + mt::search-event
//            (outbound stream). Returns Err(MT_NOT_IMPLEMENTED) until
//            M-004 mt-search ships in Phase-B2 step-4.
//   SCOPE:   spawn + cancel commands only. Streaming results go through
//            tauri::AppHandle::emit_all on a 'mt::search-event' channel
//            (M-013a useIpcListener subscribes); not exposed as a command.
//   DEPENDS: error::IpcError, tauri::AppHandle (in real impl; not used
//            in stub).
//   LINKS:   M-013b runtime façade; M-004 mt-search (B2 successor);
//            test/fixtures/ipc-channels/electron.v1.json mt::search-spawn
//            and mt::search-event entries.
//   STATUS:  Phase-B1 stub. Real impl uses grep-searcher crate.
//
// CHANGE_SUMMARY:
//   - 2026-04-28 B1-step-6: initial stub. spawn + cancel signatures.

use crate::m013b::error::IpcError;
use serde::Deserialize;

/// Search options — superset of v1's RipgrepDirectorySearcher options
/// (after _serializeOptions whitelist). Field names match the renderer
/// payload after JSON.parse(JSON.stringify()) flattening (v1.2.3 fix in
/// src/renderer/src/node/ripgrepSearcher.js).
///
/// Fields are intentionally read-only at the stub level — M-004 wires
/// them into grep-searcher in B2 step-4. allow(dead_code) is a
/// stub-shipping marker, not permanent policy.
#[allow(dead_code)]
#[derive(Deserialize, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct SearchOptions {
    pub is_regexp: Option<bool>,
    pub is_case_sensitive: Option<bool>,
    pub is_whole_word: Option<bool>,
    pub follow_symlinks: Option<bool>,
    pub max_file_size: Option<u64>,
    pub include_hidden: Option<bool>,
    pub no_ignore: Option<bool>,
    pub leading_context_line_count: Option<u32>,
    pub trailing_context_line_count: Option<u32>,
    pub inclusions: Option<Vec<String>>,
    pub exclusions: Option<Vec<String>>,
}

/// Spawn a search across one or more directories. The result stream is
/// pushed via `mt::search-event` events (subscribed via M-013a's
/// useIpcListener). Returns the searchId on success so the renderer
/// can cancel via mt_search_cancel.
#[tauri::command]
pub async fn mt_search_spawn(
    search_id: String,
    mode: String,
    directories: Vec<String>,
    pattern: String,
    options: Option<SearchOptions>,
) -> Result<(), IpcError> {
    eprintln!(
        "[m013b][search][BLOCK_MT_SEARCH_SPAWN_NOT_IMPLEMENTED searchId={search_id} mode={mode} roots={} pattern_len={}]",
        directories.len(),
        pattern.len()
    );
    let _ = options; // suppress unused-warning until M-004 ships
    Err(IpcError::not_implemented("mt::search::spawn", "B2-step-4"))
}

/// Cancel an in-flight search by searchId. v1 equivalent:
/// ipcRenderer.send('mt::search-cancel', { searchId }).
#[tauri::command]
pub async fn mt_search_cancel(search_id: String) -> Result<(), IpcError> {
    eprintln!("[m013b][search][BLOCK_MT_SEARCH_CANCEL_NOT_IMPLEMENTED searchId={search_id}]");
    Err(IpcError::not_implemented("mt::search::cancel", "B2-step-4"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::m013b::error::MT_NOT_IMPLEMENTED;

    #[tokio::test]
    async fn spawn_returns_not_implemented() {
        let err = mt_search_spawn(
            "r-1".into(),
            "content".into(),
            vec!["/tmp".into()],
            "needle".into(),
            None,
        )
        .await
        .unwrap_err();
        assert_eq!(err.code, MT_NOT_IMPLEMENTED);
        assert_eq!(err.command, "mt::search::spawn");
        assert_eq!(err.planned_phase, "B2-step-4");
    }

    #[tokio::test]
    async fn cancel_returns_not_implemented() {
        let err = mt_search_cancel("r-1".into()).await.unwrap_err();
        assert_eq!(err.code, MT_NOT_IMPLEMENTED);
        assert_eq!(err.command, "mt::search::cancel");
    }

    #[test]
    fn search_options_deserializes_from_camel_case_json() {
        let json = r#"{
            "isRegexp": true,
            "isCaseSensitive": false,
            "maxFileSize": 1048576,
            "exclusions": ["node_modules", ".git"]
        }"#;
        let opts: SearchOptions = serde_json::from_str(json).unwrap();
        assert_eq!(opts.is_regexp, Some(true));
        assert_eq!(opts.is_case_sensitive, Some(false));
        assert_eq!(opts.max_file_size, Some(1_048_576));
        assert_eq!(opts.exclusions.unwrap().len(), 2);
    }
}
