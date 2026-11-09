// MODULE_CONTRACT
//   PURPOSE: M-010 mt-security primitives. Backend-side guards for the
//            three classes V-M-010 names: path-sandbox (reject traversal,
//            symlink escape, NUL/overlong, lexical/canonical mismatch),
//            URL scheme allowlist (only http/https/file: + sandboxed
//            file://), and shell.open executable-extension blocklist.
//   SCOPE:   pure Rust logic; no Tauri runtime, no I/O beyond
//            std::fs::symlink_metadata()/canonicalize() for entry resolution.
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
//   LINKS:   .grace/graph/runtime.xml M-010 (PhaseRef Phase-B2) step-1;
//            .grace/verification/runtime.xml V-M-010 (10 scenarios + 9
//            adversarial edge cases — this module covers ~6 of them
//            plus the pure-logic subset of the rest);
//            .grace/graph/runtime.xml M-010;
//            .grace/changes/archive/C-SEC-AUDIT-FIXES T-007.
//   STATUS:  Phase-B2 step-1 stub-shipped. NEVER panics — every public
//            fn returns Result<_, SecurityError>. V-M-010 hard
//            requirement: rejected paths/URLs/exts MUST reach no
//            downstream FsCmd or shell-open call.
//
// CHANGE_SUMMARY:
//   - 2026-11-10 C-STABILIZE-PATH-TEST-PORTABILITY: three positive fixtures assert exact native canonical temporary paths on every platform; runtime guard policy is unchanged.
//   - 2026-11-09 C-SEC-AUDIT-FIXES T-007: missing paths resolve their
//     nearest existing directory entry before fencing; dangling links and
//     non-NotFound I/O errors deny, preserving root/Windows prefix semantics.
//   - 2026-04-28 B2-step-1: initial path/url/extension primitives + 4
//     stable BLOCK markers + 16 unit tests covering happy path +
//     adversarial inputs.

// Module-level allow(dead_code) — same pattern as m001_lifecycle. M-010
// is the contract surface for B2 step-2..5 (M-002 fs commands, M-003
// watch, M-004 search, M-013-B dispatch) which all consume these guards.
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
    /// I/O error during directory-entry resolution. Fail closed before any
    /// filesystem operation; only an absent entry permits ancestor walking.
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
///   5. Resolve the nearest existing directory entries (including dangling
///      symlinks) and re-check the canonical fence before any create/open.
///
/// Returns the validated absolute path (canonicalized when possible).
pub fn check_path(sandbox: &Path, requested: &Path) -> Result<PathBuf, SecurityError> {
    // 1. NUL byte
    if requested.as_os_str().as_encoded_bytes().contains(&0) {
        safe_eprintln!(
            "[Security][path][BLOCK_NUL_OR_OVERLONG reason=nul len={}]",
            requested.as_os_str().len()
        );
        return Err(SecurityError::NulByteInPath);
    }

    // 2. Overlong
    let len_bytes = requested.as_os_str().as_encoded_bytes().len();
    if len_bytes > MAX_PATH_BYTES {
        safe_eprintln!("[Security][path][BLOCK_NUL_OR_OVERLONG reason=overlong len={len_bytes}]");
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
            safe_eprintln!("[Security][path][BLOCK_REJECT_TRAVERSAL reason=above_root request={}]", joined.display());
            return Err(SecurityError::PathTraversal {
                request: joined.display().to_string(),
                sandbox: sandbox.display().to_string(),
            });
        }
    };

    // 4. Sandbox-prefix check on lexical form. Sandbox itself is also
    //    normalized (the caller may pass a path with `..` for a test
    //    fixture).
    // C-WINDOWS-SAVE-PIPELINE: compare Windows-honestly. The permissive
    // default sandbox "/" admits every absolute path on POSIX by
    // prefix; on Windows a DOS path (Prefix(D:) + RootDir components)
    // never starts_with a bare root, which denied EVERY absolute write
    // on that platform. A root-only sandbox therefore means global;
    // otherwise both sides are compared with the \\?\ / \\?\UNC\
    // device prefixes stripped (canonicalize-stored sandboxes are UNC,
    // renderer requests are DOS form).
    let sandbox_lex = lexical_normalize(sandbox).unwrap_or_else(|| sandbox.to_path_buf());
    let permissive = is_permissive_root(&sandbox_lex);
    if !permissive
        && !strip_device_prefix(&lexical).starts_with(&strip_device_prefix(&sandbox_lex))
    {
        safe_eprintln!(
            "[Security][path][BLOCK_REJECT_TRAVERSAL reason=outside_sandbox request={} sandbox={}]",
            lexical.display(),
            sandbox_lex.display()
        );
        return Err(SecurityError::PathTraversal {
            request: lexical.display().to_string(),
            sandbox: sandbox_lex.display().to_string(),
        });
    }

    // 5. Missing leaves still have a real directory-entry ancestor. Resolve
    // it before appending the missing suffix; exists() would hide dangling
    // symlinks and skip the fence for writes through an outward parent link.
    let req_canon = canonicalize_nearest_ancestor(&lexical)?;
    if !permissive {
        let box_canon = canonicalize_nearest_ancestor(&sandbox_lex)?;
        if !strip_device_prefix(&req_canon).starts_with(&strip_device_prefix(&box_canon)) {
            safe_eprintln!(
                "[Security][path][BLOCK_SYMLINK_ESCAPES resolved={} sandbox={}]",
                req_canon.display(),
                box_canon.display()
            );
            return Err(SecurityError::SymlinkEscapesSandbox {
                resolved: req_canon.display().to_string(),
                sandbox: box_canon.display().to_string(),
            });
        }
    }
    Ok(req_canon)
}

fn path_resolution_error(error: std::io::Error) -> SecurityError {
    safe_eprintln!("[Security][path][BLOCK_PATH_RESOLUTION_FAILED kind={:?}]", error.kind());
    SecurityError::IoError {
        kind: format!("{:?}", error.kind()),
        message: error.to_string(),
    }
}

/// A dangling symlink is an existing directory entry, not a missing path.
/// Only NotFound may advance; permission, loop and NotADirectory errors deny.
fn nearest_existing_ancestor(path: &Path) -> Result<Option<PathBuf>, SecurityError> {
    for candidate in path.ancestors() {
        match std::fs::symlink_metadata(candidate) {
            Ok(_) => return Ok(Some(candidate.to_path_buf())),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(path_resolution_error(error)),
        }
    }
    Ok(None)
}

fn canonicalize_nearest_ancestor(path: &Path) -> Result<PathBuf, SecurityError> {
    let Some(ancestor) = nearest_existing_ancestor(path)? else {
        // No existing entry before an entirely missing relative sandbox root.
        // The lexical fence already pins the path to that sandbox. This also
        // preserves the platform-independent Windows-prefix fixture forms.
        return Ok(path.to_path_buf());
    };
    // In particular, do not walk above an unresolved dangling link: fail closed.
    let canonical = std::fs::canonicalize(&ancestor).map_err(path_resolution_error)?;
    let suffix = path.strip_prefix(&ancestor).map_err(|error| {
        path_resolution_error(std::io::Error::new(std::io::ErrorKind::InvalidInput, error))
    })?;
    if suffix.as_os_str().is_empty() {
        Ok(canonical)
    } else {
        Ok(canonical.join(suffix))
    }
}

/// C-WINDOWS-SAVE-PIPELINE: true when the sandbox is only a root with
/// no drive prefix and no further components — the SecurityCtx::default
/// "/" (and its Windows lexical form "\"). A drive root (D:\) is NOT
/// permissive: it carries a Prefix component and stays drive-scoped.
fn is_permissive_root(p: &Path) -> bool {
    let mut components = p.components();
    components
        .next()
        .is_some_and(|first| matches!(first, Component::RootDir))
        && components.all(|c| matches!(c, Component::RootDir | Component::CurDir))
}

/// C-WINDOWS-SAVE-PIPELINE: strip Windows device prefixes so a UNC-form
/// sandbox (fs::canonicalize output, \\?\D:\ws or \\?\UNC\server\ws)
/// compares equal to the DOS/UNC form the request carries. Pure string
/// logic — a no-op on forms without the prefix and on non-Windows hosts.
fn strip_device_prefix(p: &Path) -> PathBuf {
    let s = p.as_os_str().as_encoded_bytes();
    if let Some(rest) = s.strip_prefix(br"\\?\UNC\") {
        let mut out = std::ffi::OsString::from("\\\\");
        out.push(unsafe { std::ffi::OsStr::from_encoded_bytes_unchecked(rest) });
        PathBuf::from(out)
    } else if let Some(rest) = s.strip_prefix(br"\\?\") {
        PathBuf::from(unsafe { std::ffi::OsStr::from_encoded_bytes_unchecked(rest) })
    } else {
        p.to_path_buf()
    }
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
            safe_eprintln!("[Security][url][BLOCK_SCHEME scheme=<malformed>]");
            return Err(SecurityError::DisallowedUrlScheme {
                scheme: "<malformed>".to_string(),
            });
        }
    };
    if !ALLOWED_URL_SCHEMES.contains(&scheme.as_str()) {
        safe_eprintln!("[Security][url][BLOCK_SCHEME scheme={scheme}]");
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
            safe_eprintln!("[Security][shellOpen][BLOCK_EXECUTABLE_EXT ext={lower}]");
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

    #[cfg(unix)]
    fn ancestor_escape_fixture() -> (TempDir, TempDir, PathBuf) {
        let sandbox = TempDir::new().unwrap();
        let outside = TempDir::new().unwrap();
        let link = sandbox.path().join("outside-link");
        std::os::unix::fs::symlink(outside.path(), &link).unwrap();
        (sandbox, outside, link)
    }

    #[cfg(unix)]
    #[test]
    fn ancestor_escape_text_new() {
        let (sandbox, outside, link) = ancestor_escape_fixture();
        let requested = link.join("new/deep/note.md");
        assert!(matches!(check_path(sandbox.path(), &requested), Err(SecurityError::SymlinkEscapesSandbox { .. })));
        let error = crate::m013b::fs::fs_write_inner(requested.to_str().unwrap(), "fixture", sandbox.path()).unwrap_err();
        assert!(error.message.contains("symlink escape"));
        assert!(!outside.path().join("new").exists());
    }

    #[cfg(unix)]
    #[test]
    fn ancestor_escape_binary_new() {
        let (sandbox, outside, link) = ancestor_escape_fixture();
        let requested = link.join("new/deep/image.png");
        assert!(matches!(check_path(sandbox.path(), &requested), Err(SecurityError::SymlinkEscapesSandbox { .. })));
        let error = crate::m013b::fs::fs_write_binary_inner(requested.to_str().unwrap(), &[0, 1, 255], sandbox.path()).unwrap_err();
        assert!(error.message.contains("symlink escape"));
        assert!(!outside.path().join("new").exists());
    }

    #[cfg(unix)]
    #[test]
    fn ancestor_escape_mkdir() {
        let (sandbox, outside, link) = ancestor_escape_fixture();
        let requested = link.join("new/deep");
        assert!(matches!(check_path(sandbox.path(), &requested), Err(SecurityError::SymlinkEscapesSandbox { .. })));
        let error = crate::m013b::fs::fs_mkdir_inner(requested.to_str().unwrap(), sandbox.path()).unwrap_err();
        assert!(error.message.contains("symlink escape"));
        assert!(!outside.path().join("new").exists());
    }

    #[cfg(unix)]
    #[test]
    fn ancestor_io_error_refused() {
        let sandbox = TempDir::new().unwrap();
        let not_a_directory = sandbox.path().join("file.md");
        fs::write(&not_a_directory, b"fixture").unwrap();
        let result = check_path(sandbox.path(), &not_a_directory.join("child.md"));
        assert!(matches!(result, Err(SecurityError::IoError { .. })), "{result:?}");
    }

    #[test]
    fn ancestor_nonexistent_sandbox_is_pinned() {
        let root = TempDir::new().unwrap();
        let sandbox = root.path().join("missing/workspace");
        let requested = sandbox.join("nested/new.md");
        let validated = check_path(&sandbox, &requested).unwrap();
        assert_eq!(validated, root.path().canonicalize().unwrap().join("missing/workspace/nested/new.md"));
        assert!(!sandbox.exists());
    }

    // ─── path sandbox ──────────────────────────────────────────────
    // C-WINDOWS-SAVE-PIPELINE: the Windows fixture matrix. Fixtures are
    // plain PathBuf strings so the suite runs on every host — the
    // helpers are string/component logic with no Windows-only API.
    #[test]
    fn permissive_root_default_allows_windows_absolute() {
        // SecurityCtx::default ("/"); a DOS absolute path must pass on
        // every host — on Windows it previously died at the bare-root
        // prefix compare (Prefix(D:) never starts_with RootDir).
        let ok = check_path(Path::new("/"), Path::new(r"D:\work\a.md"));
        assert!(ok.is_ok(), "permissive default must admit DOS absolute: {ok:?}");
    }

    #[test]
    fn unc_sandbox_matches_dos_request() {
        // Workspace restored from fs::canonicalize → \\?\ UNC sandbox;
        // the renderer sends the DOS form.
        let ok = check_path(Path::new(r"\\?\D:\ws"), Path::new(r"D:\ws\notes.md"));
        assert!(ok.is_ok(), "UNC sandbox must admit the DOS-form request: {ok:?}");
    }

    #[test]
    fn dos_sandbox_matches_unc_request() {
        let ok = check_path(Path::new(r"D:\ws"), Path::new(r"\\?\D:\ws\notes.md"));
        assert!(ok.is_ok(), "DOS sandbox must admit the UNC-form request: {ok:?}");
    }

    #[test]
    fn unc_cross_drive_still_denied() {
        // Denial matrix at the comparison layer: on a POSIX host a
        // Windows-style string is a RELATIVE path and check_path would
        // join it under the sandbox (always inside), so the invariant
        // is pinned on the exact comparison check_path performs.
        let req = strip_device_prefix(Path::new(r"\\?\C:\other\x.md"));
        let sandbox = strip_device_prefix(Path::new(r"\\?\D:\ws"));
        assert!(!req.starts_with(&sandbox), "cross-drive must not prefix-match");
    }

    #[test]
    fn traversal_above_root_still_denied() {
        let err = check_path(Path::new("/ws"), Path::new("/ws/../../other/f.md"));
        assert!(matches!(err, Err(SecurityError::PathTraversal { .. })));
    }

    #[test]
    fn drive_root_sandbox_is_not_permissive() {
        // D:\ carries a drive Prefix — drive-scoped, never global.
        assert!(!is_permissive_root(Path::new(r"D:\")));
        assert!(!is_permissive_root(Path::new("/ws")));
        assert!(is_permissive_root(Path::new("/")));
    }

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
        let root = tempfile::tempdir().unwrap();
        let sandbox = root.path();
        let ok = check_path(sandbox, &sandbox.join("foo/bar.md")).unwrap();
        assert_eq!(ok, sandbox.canonicalize().unwrap().join("foo/bar.md"));
    }

    #[test]
    fn dotdot_inside_sandbox_collapses() {
        let root = tempfile::tempdir().unwrap();
        let sandbox = root.path();
        let ok = check_path(sandbox, &sandbox.join("foo/../bar.md")).unwrap();
        assert_eq!(ok, sandbox.canonicalize().unwrap().join("bar.md"));
    }

    #[test]
    fn relative_request_resolves_under_sandbox() {
        let root = tempfile::tempdir().unwrap();
        let sandbox = root.path();
        let ok = check_path(sandbox, Path::new("notes/today.md")).unwrap();
        assert_eq!(ok, sandbox.canonicalize().unwrap().join("notes/today.md"));
    }

    // C-15 T-W2: std::os::unix::fs::symlink does not exist on Windows —
    // the symlink-escape semantics are unix-FS tests.
    #[cfg(unix)]
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

    #[cfg(unix)]
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
