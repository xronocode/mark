// FILE: src-tauri/src/m059_clipboard.rs
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: M-059 C-52 clipboard path reader. mt_read_clipboard_paths
//            returns the file paths the system clipboard carries (Finder
//            ⌘C file URLs on macOS, CF_HDROP on Windows) plus the plain
//            text, so the renderer resolver can open a folder as the
//            workspace or a Markdown file in a tab.
//   SCOPE: One command + pure parsing/classification helpers. The
//          macOS read runs NSPasteboard on the MAIN thread via
//          run_on_main_thread + a oneshot channel (C-51 T-008 lesson:
//          AppKit off the main thread aborts the process); Windows reads
//          CF_HDROP through raw user32/kernel32 FFI (no new crates);
//          Linux has no std-only file-path clipboard and returns no
//          paths (text still resolves via the clipboard plugin).
//   DEPENDS: tauri (AppHandle, run_on_main_thread), tokio (oneshot),
//            cocoa + objc (macOS pasteboard),
//            tauri-plugin-clipboard-manager (non-macOS text),
//            m_v1_compat::is_markdown (classification).
//   LINKS: .grace/changes/archive/C-52/spec.xml R-3; renderer resolver
//          src/renderer/src/util/clipboardPath.js + util/clipboardOpen.js;
//          m009_menu.rs file.open-from-clipboard (⌥⌘V).
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   mt_read_clipboard_paths - command returning ClipboardRead { paths, text } from the system clipboard
//   file_url_to_path - pure file:// URL → filesystem path (percent-decoded, localhost-only)
//   parse_file_urls - pure multi-line text → every file:// path it contains
//   percent_decode - pure percent-encoding decoder (UTF-8)
//   parse_cfhdrop_bytes - pure CF_HDROP DROPFILES blob → path list (wide + ANSI)
//   classify_path - pure std::fs classification: Directory | MarkdownFile | Other
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-10-16 C-52 T-001: initial module.
// END_CHANGE_SUMMARY

use serde::Serialize;

/// What mt_read_clipboard_paths hands the renderer. `paths` are
/// filesystem paths (already decoded, no file:// prefix); `text` is the
/// plain-text flavor (an absolute/~/file:// path copied in a terminal).
#[derive(Serialize, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct ClipboardRead {
    pub paths: Vec<String>,
    pub text: String,
}

/// How a path on the clipboard classifies for the C-52 resolver. The
/// renderer re-classifies through mt_fs_stat (it owns the routing); this
/// enum feeds the structured log anchor so traces state what was read.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PathKind {
    Directory,
    MarkdownFile,
    Other,
}

// ──────────────────────────────────────────────────────────────────────
// Pure helpers (unit-tested on every platform)
// ──────────────────────────────────────────────────────────────────────

// START_BLOCK_PERCENT_DECODE
/// Percent-decode a URI component as UTF-8. Invalid escapes ("%zz") and
/// truncated tails are kept literally; invalid UTF-8 bytes are replaced
/// lossily — a clipboard path must never abort the read.
pub(crate) fn percent_decode(s: &str) -> String {
    let hex = |b: u8| -> Option<u8> {
        match b {
            b'0'..=b'9' => Some(b - b'0'),
            b'a'..=b'f' => Some(b - b'a' + 10),
            b'A'..=b'F' => Some(b - b'A' + 10),
            _ => None,
        }
    };
    let bytes = s.as_bytes();
    let mut out: Vec<u8> = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let (Some(hi), Some(lo)) = (hex(bytes[i + 1]), hex(bytes[i + 2])) {
                out.push(hi * 16 + lo);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}
// END_BLOCK_PERCENT_DECODE

// START_BLOCK_FILE_URL_TO_PATH
/// Convert one `file://` URL into a filesystem path. Accepts
/// `file:///abs/path`, `file://localhost/abs/path` (both percent-
/// decoded) and `file:///C:/win/path` (drive-letter form loses the
/// leading slash). Remote hosts and non-file URLs return None.
pub(crate) fn file_url_to_path(url: &str) -> Option<String> {
    let rest = url.strip_prefix("file://").or_else(|| url.strip_prefix("FILE://"))?;
    if rest.is_empty() {
        return None;
    }
    // "file://host/path" — split the authority from the path.
    let (host, path) = match rest.find('/') {
        Some(idx) => (&rest[..idx], &rest[idx..]),
        // "file://localhost" with no path — nothing to open.
        None => return None,
    };
    if !host.is_empty() && !host.eq_ignore_ascii_case("localhost") {
        // Remote file URL (e.g. smb host) — the resolver only opens local
        // paths (spec NonGoals: no reading of remote URLs).
        return None;
    }
    let mut decoded = percent_decode(path);
    // file:///C:/x → the URL path is "/C:/x"; a drive letter is absolute
    // without the leading slash.
    let bytes = decoded.as_bytes();
    if bytes.len() >= 3 && bytes[0] == b'/' && bytes[1].is_ascii_alphabetic() && bytes[2] == b':' {
        decoded.remove(0);
    }
    // "/" (and the empty string) never opens as a workspace.
    if decoded.len() <= 1 {
        None
    } else {
        Some(decoded)
    }
}
// END_BLOCK_FILE_URL_TO_PATH

// START_BLOCK_PARSE_FILE_URLS
/// Parse every `file://` URL found in a multi-line pasteboard string
/// (Finder'sNSStringPboardType fallback and terminals' `pwd` copies both
/// end up here). Non-file lines are ignored; order is preserved.
pub(crate) fn parse_file_urls(text: &str) -> Vec<String> {
    let mut out = Vec::new();
    for line in text.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        if let Some(path) = file_url_to_path(line) {
            out.push(path);
        }
    }
    out
}
// END_BLOCK_PARSE_FILE_URLS

// START_BLOCK_PARSE_CFHDROP
/// Parse a CF_HDROP blob (DROPFILES header + double-null-terminated path
/// list) into paths. `pFiles` gives the list offset; `fWide` (the BOOL
/// at offset 16) selects UTF-16 vs ANSI. Malformed blobs yield an empty
/// vector — the read degrades to "no paths", never an error.
// Pure and unit-tested on every platform, but only the Windows reader
// calls it in production — allow(dead_code) keeps the macOS/Linux
// release builds (warnings are gated in CI) free of dead-code lints.
#[allow(dead_code)]
pub(crate) fn parse_cfhdrop_bytes(bytes: &[u8]) -> Vec<String> {
    const DROPFILES_LEN: usize = 20;
    if bytes.len() < DROPFILES_LEN {
        return Vec::new();
    }
    let p_files = u32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]) as usize;
    let f_wide = u32::from_le_bytes([bytes[16], bytes[17], bytes[18], bytes[19]]) != 0;
    if p_files < DROPFILES_LEN || p_files > bytes.len() {
        return Vec::new();
    }
    let list = &bytes[p_files..];
    let mut out = Vec::new();
    if f_wide {
        let units: Vec<u16> = list
            .chunks_exact(2)
            .map(|c| u16::from_le_bytes([c[0], c[1]]))
            .collect();
        let mut current: Vec<u16> = Vec::new();
        let mut terminated = false;
        for u in units {
            if u == 0 {
                if terminated {
                    break; // second NUL — list complete
                }
                if !current.is_empty() {
                    out.push(String::from_utf16_lossy(&current));
                }
                current.clear();
                terminated = true;
            } else {
                current.push(u);
                terminated = false;
            }
        }
    } else {
        let mut current: Vec<u8> = Vec::new();
        let mut terminated = false;
        for b in list {
            if *b == 0 {
                if terminated {
                    break;
                }
                if !current.is_empty() {
                    out.push(String::from_utf8_lossy(&current).into_owned());
                }
                current.clear();
                terminated = true;
            } else {
                current.push(*b);
                terminated = false;
            }
        }
    }
    out
}
// END_BLOCK_PARSE_CFHDROP

// START_BLOCK_CLASSIFY_PATH
/// Classify one filesystem path for the C-52 log anchor: directory,
/// Markdown file (same extension list as the sidebar tree), other
/// (including missing paths).
pub(crate) fn classify_path(path: &std::path::Path) -> PathKind {
    match std::fs::metadata(path) {
        Ok(md) if md.is_dir() => PathKind::Directory,
        Ok(_) if crate::m_v1_compat::is_markdown(
            path.file_name().and_then(|n| n.to_str()).unwrap_or(""),
        ) => PathKind::MarkdownFile,
        _ => PathKind::Other,
    }
}

fn classify_counts(paths: &[String]) -> (usize, usize) {
    let mut folders = 0;
    let mut markdown = 0;
    for p in paths {
        match classify_path(std::path::Path::new(p)) {
            PathKind::Directory => folders += 1,
            PathKind::MarkdownFile => markdown += 1,
            PathKind::Other => {}
        }
    }
    (folders, markdown)
}
// END_BLOCK_CLASSIFY_PATH

// ──────────────────────────────────────────────────────────────────────
// Platform reads
// ──────────────────────────────────────────────────────────────────────

// START_BLOCK_READ_PASTEBOARD_MACOS
/// Read NSPasteboard on the thread this is called from — the caller MUST
/// be on the main thread (AppKit). File URLs come from the pasteboard
/// items' `public.file-url` flavor (each value is a `file://` URL string,
/// parsed by the pure helper); text comes from `public.utf8-plain-text`.
/// Every failure degrades to an empty value — a clipboard read must
/// never reject the command.
#[cfg(target_os = "macos")]
fn read_pasteboard_on_main() -> (Vec<String>, String) {
    use cocoa::base::{id, nil};
    use objc::{class, msg_send, sel, sel_impl};

    // C-52 fallback shape: if readObjectsForClasses is unavailable, the
    // plain-text flavor may still carry file:// URLs.
    unsafe fn nsstring_to_string(ns: id) -> String {
        let c_str: *const std::os::raw::c_char = msg_send![ns, UTF8String];
        if c_str.is_null() {
            return String::new();
        }
        std::ffi::CStr::from_ptr(c_str).to_string_lossy().into_owned()
    }

    unsafe {
        let pb: id = msg_send![class!(NSPasteboard), generalPasteboard];
        if pb == nil {
            return (Vec::new(), String::new());
        }
        let type_file_url: id = msg_send![
            class!(NSString),
            stringWithUTF8String: b"public.file-url\0".as_ptr() as *const std::os::raw::c_char
        ];
        let type_text: id = msg_send![
            class!(NSString),
            stringWithUTF8String: b"public.utf8-plain-text\0".as_ptr() as *const std::os::raw::c_char
        ];

        let mut paths: Vec<String> = Vec::new();
        let items: id = msg_send![pb, pasteboardItems];
        if items != nil {
            let count: usize = msg_send![items, count];
            for i in 0..count {
                let item: id = msg_send![items, objectAtIndex: i];
                if item == nil {
                    continue;
                }
                let url_str: id = msg_send![item, stringForType: type_file_url];
                if url_str == nil {
                    continue;
                }
                paths.extend(parse_file_urls(&nsstring_to_string(url_str)));
            }
        }

        let text_ns: id = msg_send![pb, stringForType: type_text];
        let text = if text_ns == nil {
            String::new()
        } else {
            nsstring_to_string(text_ns)
        };
        (paths, text)
    }
}
// END_BLOCK_READ_PASTEBOARD_MACOS

// START_BLOCK_READ_HDROP_WINDOWS
/// Read CF_HDROP from the Windows clipboard through raw user32/kernel32
/// FFI (keeps the dependency tree unchanged). Failures at any step
/// degrade to an empty path list.
#[cfg(target_os = "windows")]
fn read_hdrop_paths() -> Vec<String> {
    use std::os::raw::{c_int, c_uint, c_void};

    type HANDLE = *mut c_void;
    const CF_HDROP: c_uint = 15;

    #[link(name = "user32")]
    extern "system" {
        fn OpenClipboard(hWndNewOwner: HANDLE) -> c_int;
        fn CloseClipboard() -> c_int;
        fn IsClipboardFormatAvailable(format: c_uint) -> c_int;
        fn GetClipboardData(uFormat: c_uint) -> HANDLE;
    }
    #[link(name = "kernel32")]
    extern "system" {
        fn GlobalLock(hMem: HANDLE) -> *mut c_void;
        fn GlobalUnlock(hMem: HANDLE) -> c_int;
        fn GlobalSize(hMem: HANDLE) -> usize;
    }

    unsafe {
        if OpenClipboard(std::ptr::null_mut()) == 0 {
            return Vec::new();
        }
        let mut paths = Vec::new();
        if IsClipboardFormatAvailable(CF_HDROP) != 0 {
            let handle = GetClipboardData(CF_HDROP);
            if !handle.is_null() {
                let ptr = GlobalLock(handle);
                if !ptr.is_null() {
                    let size = GlobalSize(handle);
                    if size > 0 {
                        let bytes = std::slice::from_raw_parts(ptr as *const u8, size);
                        paths = parse_cfhdrop_bytes(bytes);
                    }
                    GlobalUnlock(handle);
                }
            }
        }
        CloseClipboard();
        paths
    }
}
// END_BLOCK_READ_HDROP_WINDOWS

// START_BLOCK_MT_READ_CLIPBOARD_PATHS
/// C-52 R-3: the File › Open from Clipboard resolver's backend read.
/// macOS dispatches the whole pasteboard read to the main thread and
/// waits on a oneshot (the m053/m032 pattern); other platforms read
/// CF_HDROP/empty paths synchronously and the text through the
/// clipboard-manager plugin (arboard), which is main-thread-free off
/// macOS.
#[tauri::command]
pub async fn mt_read_clipboard_paths(app: tauri::AppHandle) -> Result<ClipboardRead, String> {
    #[cfg(target_os = "macos")]
    {
        let (tx, rx) = tokio::sync::oneshot::channel::<(Vec<String>, String)>();
        app.run_on_main_thread(move || {
            let out = read_pasteboard_on_main();
            let _ = tx.send(out);
        })
        .map_err(|e| format!("main thread dispatch: {e}"))?;
        let (paths, text) = rx.await.map_err(|e| format!("main thread reply: {e}"))?;
        let (folders, markdown) = classify_counts(&paths);
        safe_eprintln!(
            "[Clipboard][read][BLOCK_CLIPBOARD_READ paths={} folders={} markdown={} textBytes={}]",
            paths.len(),
            folders,
            markdown,
            text.len()
        );
        Ok(ClipboardRead { paths, text })
    }
    #[cfg(not(target_os = "macos"))]
    {
        #[cfg(target_os = "windows")]
        let paths = read_hdrop_paths();
        #[cfg(not(target_os = "windows"))]
        let paths: Vec<String> = Vec::new();
        let text = read_clipboard_text(&app);
        let (folders, markdown) = classify_counts(&paths);
        safe_eprintln!(
            "[Clipboard][read][BLOCK_CLIPBOARD_READ paths={} folders={} markdown={} textBytes={}]",
            paths.len(),
            folders,
            markdown,
            text.len()
        );
        Ok(ClipboardRead { paths, text })
    }
}

/// Plain-text flavor off macOS (WKWebView only needs the macOS path; the
/// plugin's arboard handle is main-thread-free on Windows/Linux).
#[cfg(not(target_os = "macos"))]
fn read_clipboard_text(app: &tauri::AppHandle) -> String {
    use tauri_plugin_clipboard_manager::ClipboardExt;
    app.clipboard().read_text().unwrap_or_default()
}
// END_BLOCK_MT_READ_CLIPBOARD_PATHS

#[cfg(test)]
mod tests {
    use super::*;

    // ── percent_decode ────────────────────────────────────────────────

    #[test]
    fn percent_decode_decodes_space_and_unicode() {
        assert_eq!(percent_decode("/a%20b"), "/a b");
        assert_eq!(percent_decode("/caf%C3%A9"), "/café");
    }

    #[test]
    fn percent_decode_keeps_invalid_escapes_literal() {
        assert_eq!(percent_decode("100%zz"), "100%zz");
        assert_eq!(percent_decode("tail%2"), "tail%2");
        assert_eq!(percent_decode("plain"), "plain");
    }

    // ── file_url_to_path ──────────────────────────────────────────────

    #[test]
    fn file_url_to_path_decodes_posix_path() {
        assert_eq!(
            file_url_to_path("file:///Users/<fixture>/My%20Docs"),
            Some("/Users/<fixture>/My Docs".to_string())
        );
    }

    #[test]
    fn file_url_to_path_accepts_localhost_and_rejects_remote_hosts() {
        assert_eq!(
            file_url_to_path("file://localhost/tmp/x"),
            Some("/tmp/x".to_string())
        );
        assert_eq!(file_url_to_path("file://server/share/x"), None);
    }

    #[test]
    fn file_url_to_path_strips_drive_letter_slash() {
        assert_eq!(
            file_url_to_path("file:///C:/Users/<fixture>/notes.md"),
            Some("C:/Users/<fixture>/notes.md".to_string())
        );
    }

    #[test]
    fn file_url_to_path_rejects_non_file_and_empty() {
        assert_eq!(file_url_to_path("https://example.com/a"), None);
        assert_eq!(file_url_to_path("file://"), None);
        assert_eq!(file_url_to_path("file:///"), None);
        assert_eq!(file_url_to_path("/plain/path"), None);
    }

    // ── parse_file_urls ───────────────────────────────────────────────

    #[test]
    fn parse_file_urls_extracts_all_file_lines_in_order() {
        let text = "file:///a/one%20md\ntext line\nfile:///b/two\n";
        assert_eq!(
            parse_file_urls(text),
            vec!["/a/one md".to_string(), "/b/two".to_string()]
        );
    }

    #[test]
    fn parse_file_urls_ignores_non_file_lines() {
        assert!(parse_file_urls("hello\nworld").is_empty());
        assert!(parse_file_urls("").is_empty());
    }

    // ── parse_cfhdrop_bytes ───────────────────────────────────────────

    fn hdrop_wide(paths: &[&str]) -> Vec<u8> {
        let mut bytes = vec![0u8; 20];
        bytes[0..4].copy_from_slice(&20u32.to_le_bytes()); // pFiles
        bytes[16..20].copy_from_slice(&1u32.to_le_bytes()); // fWide = TRUE
        for p in paths {
            for u in p.encode_utf16() {
                bytes.extend_from_slice(&u.to_le_bytes());
            }
            bytes.extend_from_slice(&0u16.to_le_bytes());
        }
        bytes.extend_from_slice(&0u16.to_le_bytes()); // list terminator
        bytes
    }

    fn hdrop_ansi(paths: &[&str]) -> Vec<u8> {
        let mut bytes = vec![0u8; 20];
        bytes[0..4].copy_from_slice(&20u32.to_le_bytes());
        for p in paths {
            bytes.extend_from_slice(p.as_bytes());
            bytes.push(0);
        }
        bytes.push(0);
        bytes
    }

    #[test]
    fn cfhpdrop_parses_wide_and_ansi_lists() {
        let wide = hdrop_wide(&["C:\\docs\\pläne", "C:\\notes.md"]);
        assert_eq!(
            parse_cfhdrop_bytes(&wide),
            vec!["C:\\docs\\pläne".to_string(), "C:\\notes.md".to_string()]
        );
        let ansi = hdrop_ansi(&["C:\\a\\b.md"]);
        assert_eq!(parse_cfhdrop_bytes(&ansi), vec!["C:\\a\\b.md".to_string()]);
    }

    #[test]
    fn cfhpdrop_degrades_on_malformed_blobs() {
        assert!(parse_cfhdrop_bytes(&[]).is_empty());
        assert!(parse_cfhdrop_bytes(&[0u8; 10]).is_empty());
        // pFiles beyond the buffer
        let mut bogus = vec![0u8; 20];
        bogus[0..4].copy_from_slice(&9999u32.to_le_bytes());
        assert!(parse_cfhdrop_bytes(&bogus).is_empty());
        // empty list (immediate double NUL)
        assert!(parse_cfhdrop_bytes(&hdrop_wide(&[])).is_empty());
    }

    // ── classify_path ─────────────────────────────────────────────────

    #[test]
    fn classify_path_sorts_directories_markdown_and_other() {
        let dir = tempfile::TempDir::new().unwrap();
        let md = dir.path().join("note.md");
        std::fs::write(&md, "x").unwrap();
        let png = dir.path().join("pic.png");
        std::fs::write(&png, "x").unwrap();
        let sub = dir.path().join("sub");
        std::fs::create_dir(&sub).unwrap();

        assert_eq!(classify_path(&sub), PathKind::Directory);
        assert_eq!(classify_path(dir.path()), PathKind::Directory);
        assert_eq!(classify_path(&md), PathKind::MarkdownFile);
        assert_eq!(classify_path(&png), PathKind::Other);
        assert_eq!(
            classify_path(std::path::Path::new("/nonexistent-12345/x.md")),
            PathKind::Other
        );
    }
}
