// MODULE_CONTRACT
//   PURPOSE: M-010 mt-security primitives. Backend-side guards for the
//            three classes V-M-010 names: path-sandbox (reject traversal,
//            symlink escape, NUL/overlong, lexical/canonical mismatch),
//            URL scheme allowlist (only http/https/file: + sandboxed
//            file://), and shell.open executable-extension blocklist.
//   SCOPE:   pure Rust logic; no Tauri runtime, no I/O beyond
//            std::fs::canonicalize() for symlink resolution.
//            Renderer-side concerns DEFERRED:
//              - HTML sanitizer (DOMPurify) → Phase-B3
//              - KaTeX `\href{javascript:...}` filter → Phase-B3
//              - Vega `expression`/`Function` rejection → Phase-B3
//              - Punycode homoglyph warning → Phase-B3
//              - shell.open user-confirm prompt → needs Tauri runtime,
//                wired in Phase-B3 step-9 (M-015 pandoc-bridge area)
//            Platform-specific work DEFERRED:
//              - Windows UNC + device-namespace (\\?\, \\.\) → v2.1+
//              - Windows case-fold path traversal → v2.1+
//   DEPENDS: stdlib only. No url crate, no idna, no path-clean.
//   LINKS:   docs/development-plan.xml Phase-B2 step-1;
//            docs/verification-plan.xml V-M-010 (10 scenarios + 9
//            adversarial edge cases — this module covers ~6 of them
//            plus the pure-logic subset of the rest);
//            docs/knowledge-graph.xml M-010.
//   STATUS:  Phase-B2 step-1 stub-shipped. NEVER panics — every public
//            fn returns Result<_, SecurityError>. V-M-010 hard
//            requirement: rejected paths/URLs/exts MUST reach no
//            downstream FsCmd or shell-open call.
//
// CHANGE_SUMMARY:
//   - 2026-04-28 B2-step-1: initial path/url/extension primitives + 4
//     stable BLOCK markers + 16 unit tests covering happy path +
//     adversarial inputs.

// Module-level allow(dead_code) — same pattern as m001_lifecycle. M-010
// is the contract surface for B2 step-2..5 (M-002 fs commands, M-003
// watch, M-004 search, M-013b dispatch) which all consume these guards.
// At step-1 stub-shipping no in-tree caller exists yet — tests
// exercise everything via #[cfg(test)]. Removed when B2 step-2 wires
// check_path into M-002.
#![allow(dead_code)]

use std::ffi::OsStr;
use std::path::{Component, Path, PathBuf};

/// Hard ceiling on path bytes — POSIX PATH_MAX is 4096; anything past
/// that is either a fuzz input or filesystem corruption. Reject before
/// touching any syscall.
pub const MAX_PATH_BYTES: usize = 4096;

/// HTTP/HTTPS + file:// (sandboxed) are the only schemes mark needs at
/// the backend. Renderer-side a wider set may render but only via
/// inert text after sanitization.
const ALLOWED_URL_SCHEMES: &[&str] = &["http", "https", "file"];

/// File extensions that can execute when shell.open opens them. macOS
/// + cross-platform set; Windows-specific (.bat, .cmd, .ps1, .vbs)
/// added when Windows port lands.
const DANGEROUS_SHELL_OPEN_EXTENSIONS: &[&str] = &[
    "command", // macOS shell-script bundle
    "app",     // macOS application bundle
    "scpt",    // macOS AppleScript
    "scptd",   // macOS compiled AppleScript bundle
    "lnk",     // Windows shortcut
    "url",     // Windows internet shortcut
    "desktop", // Linux desktop entry
    "applescript",
];

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SecurityError {
    /// Path contains a NUL byte. CRITICAL — most-likely fuzz / adversarial.
    NulByteInPath,
    /// Path exceeds MAX_PATH_BYTES.
    OverlongPath { len: usize },
    /// Path resolves outside the sandbox after lexical `..` collapse.
    PathTraversal { request: String, sandbox: String },
    /// canonicalize() resolved the path (via symlink) outside the sandbox.
    SymlinkEscapesSandbox { resolved: String, sandbox: String },
    /// URL scheme not in ALLOWED_URL_SCHEMES.
    DisallowedUrlScheme { scheme: String },
    /// shell.open() target has a dangerous executable extension.
    DangerousShellOpenExtension { ext: String },
    /// I/O error during canonicalization (file may not exist; not all
    /// errors are security violations — caller decides).
    IoError { kind: String, message: String },
}

impl std::fmt::Display for SecurityError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::NulByteInPath => write!(f, "path contains NUL byte"),
            Self::OverlongPath { len } => write!(f, "path length {len} exceeds {MAX_PATH_BYTES}"),
            Self::PathTraversal { request, sandbox } => write!(
                f,
                "path traversal: {request} resolves outside sandbox {sandbox}"
            ),
            Self::SymlinkEscapesSandbox { resolved, sandbox } => write!(
                f,
                "symlink escape: resolved {resolved} outside sandbox {sandbox}"
            ),
            Self::DisallowedUrlScheme { scheme } => write!(f, "url scheme '{scheme}' not allowed"),
            Self::DangerousShellOpenExtension { ext } => {
                write!(f, "shell-open extension '.{ext}' refused")
            }
            Self::IoError { kind, message } => write!(f, "io error ({kind}): {message}"),
        }
    }
}

impl std::error::Error for SecurityError {}

// ─── Path sandbox ───────────────────────────────────────────────────

/// Lexically normalize a path: fold `.` and `..` against parent
/// components without touching the filesystem. Returns None if `..`
/// would escape an absolute root (i.e. the request is unambiguously
/// out-of-bounds even before sandbox comparison).
fn lexical_normalize(p: &Path) -> Option<PathBuf> {
    let mut out: Vec<Component> = Vec::with_capacity(8);
    for c in p.components() {
        match c {
            Component::CurDir => {}
            Component::ParentDir => {
                match out.last() {
                    Some(Component::Normal(_)) => {
                        out.pop();
                    }
                    Some(Component::Prefix(_)) | Some(Component::RootDir) => {
                        // .. above root — caller's problem to reject.
                        return None;
                    }
                    Some(Component::ParentDir) | None => {
                        // relative path; preserve `..` for comparison.
                        out.push(c);
                    }
                    Some(Component::CurDir) => unreachable!("filtered above"),
                }
            }
            other => out.push(other),
        }
    }
    let mut buf = PathBuf::new();
    for c in out {
        buf.push(c.as_os_str());
    }
    Some(buf)
}

/// Validate a requested path against a workspace sandbox.
///
/// Steps:
///   1. NUL byte check (fail closed).
///   2. Length check (fail closed > MAX_PATH_BYTES).
///   3. Lexical normalize (`..` collapse). If escapes root → reject.
///   4. Sandbox-prefix check on the lexical form.
///   5. If both paths exist on FS, canonicalize and re-check (catches
///      symlinks pointing outside).
///
/// Returns the validated absolute path (canonicalized when possible).
pub fn check_path(sandbox: &Path, requested: &Path) -> Result<PathBuf, SecurityError> {
    // 1. NUL byte
    if requested.as_os_str().as_encoded_bytes().contains(&0) {
        eprintln!(
            "[Security][path][BLOCK_NUL_OR_OVERLONG reason=nul len={}]",
            requested.as_os_str().len()
        );
        return Err(SecurityError::NulByteInPath);
    }

    // 2. Overlong
    let len_bytes = requested.as_os_str().as_encoded_bytes().len();
    if len_bytes > MAX_PATH_BYTES {
        eprintln!("[Security][path][BLOCK_NUL_OR_OVERLONG reason=overlong len={len_bytes}]");
        return Err(SecurityError::OverlongPath { len: len_bytes });
    }

    // 3. Lexical normalize
    let joined = if requested.is_absolute() {
        requested.to_path_buf()
    } else {
        sandbox.join(requested)
    };
    let lexical = match lexical_normalize(&joined) {
        Some(p) => p,
        None => {
            eprintln!("[Security][path][BLOCK_REJECT_TRAVERSAL reason=above_root request={}]", joined.display());
            return Err(SecurityError::PathTraversal {
                request: joined.display().to_string(),
                sandbox: sandbox.display().to_string(),
            });
        }
    };

    // 4. Sandbox-prefix check on lexical form. Sandbox itself is also
    //    normalized (the caller may pass a path with `..` for a test
    //    fixture).
    let sandbox_lex = lexical_normalize(sandbox).unwrap_or_else(|| sandbox.to_path_buf());
    if !lexical.starts_with(&sandbox_lex) {
        eprintln!(
            "[Security][path][BLOCK_REJECT_TRAVERSAL reason=outside_sandbox request={} sandbox={}]",
            lexical.display(),
            sandbox_lex.display()
        );
        return Err(SecurityError::PathTraversal {
            request: lexical.display().to_string(),
            sandbox: sandbox_lex.display().to_string(),
        });
    }

    // 5. Symlink resolution. canonicalize() follows symlinks; if the
    //    resolved target falls outside the sandbox, that's an attack.
    //    Only run when both paths exist; if `requested` is for a not-
    //    yet-created file we can't canonicalize it but we already
    //    proved lexical safety above.
    if lexical.exists() && sandbox_lex.exists() {
        match (std::fs::canonicalize(&lexical), std::fs::canonicalize(&sandbox_lex)) {
            (Ok(req_canon), Ok(box_canon)) => {
                if !req_canon.starts_with(&box_canon) {
                    eprintln!(
                        "[Security][path][BLOCK_SYMLINK_ESCAPES resolved={} sandbox={}]",
                        req_canon.display(),
                        box_canon.display()
                    );
                    return Err(SecurityError::SymlinkEscapesSandbox {
                        resolved: req_canon.display().to_string(),
                        sandbox: box_canon.display().to_string(),
                    });
                }
                return Ok(req_canon);
            }
            (Err(e), _) | (_, Err(e)) => {
                return Err(SecurityError::IoError {
                    kind: format!("{:?}", e.kind()),
                    message: e.to_string(),
                });
            }
        }
    }

    Ok(lexical)
}

// ─── URL scheme allowlist ───────────────────────────────────────────

/// Extract the scheme from a URL string. Tolerates whitespace, control
/// chars (CRLF/tab smuggling), and case variations. Returns None if
/// the input is not a well-formed scheme:rest.
fn extract_scheme(url: &str) -> Option<String> {
    // Strip leading whitespace + control chars (defends against
    // `java\tscript:` and CRLF smuggling per V-M-010 ec).
    let cleaned: String = url
        .chars()
        .filter(|c| !c.is_control() && !c.is_whitespace())
        .collect();
    let colon = cleaned.find(':')?;
    let scheme = &cleaned[..colon];
    if scheme.is_empty() || !scheme.chars().all(|c| c.is_ascii_alphanumeric() || c == '+' || c == '-' || c == '.') {
        return None;
    }
    Some(scheme.to_ascii_lowercase())
}

/// Validate a URL against the allowlist. Rejects javascript:, data:,
/// vbscript:, custom mt://, and tab-smuggled variants. Allowed:
/// http, https, file (caller still must sandbox-check file:// targets).
pub fn check_url_scheme(url: &str) -> Result<(), SecurityError> {
    let scheme = match extract_scheme(url) {
        Some(s) => s,
        None => {
            eprintln!("[Security][url][BLOCK_SCHEME scheme=<malformed>]");
            return Err(SecurityError::DisallowedUrlScheme {
                scheme: "<malformed>".to_string(),
            });
        }
    };
    if !ALLOWED_URL_SCHEMES.contains(&scheme.as_str()) {
        eprintln!("[Security][url][BLOCK_SCHEME scheme={scheme}]");
        return Err(SecurityError::DisallowedUrlScheme { scheme });
    }
    Ok(())
}

// ─── shell.open executable-extension blocklist ──────────────────────

/// Reject opening files that can execute via shell.open. Independent of
/// sandbox membership — even files inside the workspace must not be
/// executed without explicit user confirmation (deferred to runtime
/// confirm prompt in B3).
pub fn check_shell_open_extension(path: &Path) -> Result<(), SecurityError> {
    if let Some(ext) = path.extension().and_then(OsStr::to_str) {
        let lower = ext.to_ascii_lowercase();
        if DANGEROUS_SHELL_OPEN_EXTENSIONS.contains(&lower.as_str()) {
            eprintln!("[Security][shellOpen][BLOCK_EXECUTABLE_EXT ext={lower}]");
            return Err(SecurityError::DangerousShellOpenExtension { ext: lower });
        }
    }
    Ok(())
}

// ─── Tests ──────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    // ─── path sandbox ──────────────────────────────────────────────
    #[test]
    fn nul_byte_in_path_rejected() {
        let sandbox = Path::new("/workspace");
        let bad = Path::new("/workspace/foo\0.md");
        let err = check_path(sandbox, bad).unwrap_err();
        assert_eq!(err, SecurityError::NulByteInPath);
    }

    #[test]
    fn overlong_path_rejected() {
        let sandbox = Path::new("/workspace");
        let long = format!("/workspace/{}", "a".repeat(MAX_PATH_BYTES + 10));
        let err = check_path(sandbox, Path::new(&long)).unwrap_err();
        assert!(matches!(err, SecurityError::OverlongPath { len } if len > MAX_PATH_BYTES));
    }

    #[test]
    fn lexical_traversal_above_root_rejected() {
        let sandbox = Path::new("/workspace");
        let bad = Path::new("/workspace/../../etc/passwd");
        let err = check_path(sandbox, bad).unwrap_err();
        assert!(matches!(err, SecurityError::PathTraversal { .. }));
    }

    #[test]
    fn lexical_traversal_relative_rejected() {
        let sandbox = Path::new("/workspace");
        let err = check_path(sandbox, Path::new("../../../etc/passwd")).unwrap_err();
        assert!(matches!(err, SecurityError::PathTraversal { .. }));
    }

    #[test]
    fn happy_path_inside_sandbox() {
        let sandbox = Path::new("/workspace");
        let ok = check_path(sandbox, Path::new("/workspace/foo/bar.md")).unwrap();
        assert!(ok.starts_with(sandbox));
    }

    #[test]
    fn dotdot_inside_sandbox_collapses() {
        let sandbox = Path::new("/workspace");
        let ok = check_path(sandbox, Path::new("/workspace/foo/../bar.md")).unwrap();
        // After collapse: /workspace/bar.md — still inside sandbox.
        assert_eq!(ok, PathBuf::from("/workspace/bar.md"));
    }

    #[test]
    fn relative_request_resolves_under_sandbox() {
        let sandbox = Path::new("/workspace");
        let ok = check_path(sandbox, Path::new("notes/today.md")).unwrap();
        assert_eq!(ok, PathBuf::from("/workspace/notes/today.md"));
    }

    #[test]
    fn symlink_escape_rejected_post_canonicalize() {
        // Real FS test: create a symlink inside sandbox pointing outside.
        // canonicalize() resolves it to the outside target → reject.
        let sandbox_dir = TempDir::new().unwrap();
        let outside_dir = TempDir::new().unwrap();
        let outside_file = outside_dir.path().join("secret.txt");
        fs::write(&outside_file, "secret").unwrap();
        let link_inside = sandbox_dir.path().join("evil_link");
        std::os::unix::fs::symlink(&outside_file, &link_inside).unwrap();

        let err = check_path(sandbox_dir.path(), &link_inside).unwrap_err();
        assert!(
            matches!(err, SecurityError::SymlinkEscapesSandbox { .. }),
            "expected symlink escape, got {err:?}"
        );
    }

    #[test]
    fn symlink_inside_sandbox_allowed() {
        let sandbox_dir = TempDir::new().unwrap();
        let target = sandbox_dir.path().join("real.txt");
        fs::write(&target, "ok").unwrap();
        let link = sandbox_dir.path().join("alias");
        std::os::unix::fs::symlink(&target, &link).unwrap();

        let resolved = check_path(sandbox_dir.path(), &link).unwrap();
        assert!(resolved.starts_with(sandbox_dir.path().canonicalize().unwrap()));
    }

    // ─── url scheme ────────────────────────────────────────────────
    #[test]
    fn https_scheme_allowed() {
        check_url_scheme("https://example.com/").unwrap();
    }

    #[test]
    fn http_scheme_allowed() {
        check_url_scheme("http://example.com/").unwrap();
    }

    #[test]
    fn file_scheme_allowed_at_scheme_layer() {
        // Note: file:// targets still go through check_path for sandbox.
        // This test only asserts the scheme layer accepts file:.
        check_url_scheme("file:///tmp/x").unwrap();
    }

    #[test]
    fn javascript_scheme_rejected() {
        let err = check_url_scheme("javascript:alert(1)").unwrap_err();
        assert!(matches!(err, SecurityError::DisallowedUrlScheme { ref scheme } if scheme == "javascript"));
    }

    #[test]
    fn data_scheme_rejected() {
        let err = check_url_scheme("data:text/html,<script>alert(1)</script>").unwrap_err();
        assert!(matches!(err, SecurityError::DisallowedUrlScheme { ref scheme } if scheme == "data"));
    }

    #[test]
    fn vbscript_scheme_rejected() {
        let err = check_url_scheme("vbscript:msgbox(1)").unwrap_err();
        assert!(matches!(err, SecurityError::DisallowedUrlScheme { ref scheme } if scheme == "vbscript"));
    }

    #[test]
    fn custom_mt_scheme_rejected() {
        let err = check_url_scheme("mt://internal/foo").unwrap_err();
        assert!(matches!(err, SecurityError::DisallowedUrlScheme { ref scheme } if scheme == "mt"));
    }

    #[test]
    fn tab_smuggled_javascript_rejected() {
        // "java\tscript:..." — tab inside scheme. Expected: tab stripped,
        // remaining "javascript" → rejected.
        let err = check_url_scheme("java\tscript:alert(1)").unwrap_err();
        assert!(matches!(err, SecurityError::DisallowedUrlScheme { ref scheme } if scheme == "javascript"));
    }

    #[test]
    fn crlf_smuggled_javascript_rejected() {
        let err = check_url_scheme("java\r\nscript:alert(1)").unwrap_err();
        assert!(matches!(err, SecurityError::DisallowedUrlScheme { ref scheme } if scheme == "javascript"));
    }

    #[test]
    fn case_insensitive_scheme_match() {
        check_url_scheme("HTTPS://example.com").unwrap();
        check_url_scheme("HtTp://example.com").unwrap();
        let err = check_url_scheme("JavaScript:alert(1)").unwrap_err();
        assert!(matches!(err, SecurityError::DisallowedUrlScheme { ref scheme } if scheme == "javascript"));
    }

    #[test]
    fn malformed_url_no_colon_rejected() {
        let err = check_url_scheme("not a url").unwrap_err();
        assert!(matches!(err, SecurityError::DisallowedUrlScheme { .. }));
    }

    // ─── shell-open extension ─────────────────────────────────────
    #[test]
    fn dangerous_extensions_rejected() {
        for ext in DANGEROUS_SHELL_OPEN_EXTENSIONS {
            let path = PathBuf::from(format!("/tmp/file.{ext}"));
            let err = check_shell_open_extension(&path).unwrap_err();
            assert!(
                matches!(err, SecurityError::DangerousShellOpenExtension { .. }),
                "{ext} should be rejected"
            );
        }
    }

    #[test]
    fn dangerous_extensions_case_insensitive() {
        let err = check_shell_open_extension(Path::new("/tmp/MALWARE.APP")).unwrap_err();
        assert!(matches!(err, SecurityError::DangerousShellOpenExtension { ref ext } if ext == "app"));
        let err = check_shell_open_extension(Path::new("/tmp/x.LnK")).unwrap_err();
        assert!(matches!(err, SecurityError::DangerousShellOpenExtension { ref ext } if ext == "lnk"));
    }

    #[test]
    fn safe_extensions_pass() {
        for ext in &["md", "txt", "png", "pdf", "html", ""] {
            let path = if ext.is_empty() {
                PathBuf::from("/tmp/no_ext")
            } else {
                PathBuf::from(format!("/tmp/file.{ext}"))
            };
            check_shell_open_extension(&path).unwrap();
        }
    }
}
