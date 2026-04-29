// MODULE_CONTRACT
//   PURPOSE: M-020 mt-cli-flags. Parse argv via clap; expose the parsed
//            opening intent (file paths to open, optional workspace
//            root, debug flag) as a CliBoot struct that main.rs reads
//            after legacy-detect / before tauri::Builder.
//   SCOPE:   parsing only. Does NOT call any Tauri or fs API — caller
//            decides what to do with the parsed intent. Designed so
//            tests can construct synthetic argv.
//   DEPENDS: clap = "4" with derive.
//   LINKS:   docs/development-plan.xml Phase-B3 step-3;
//            v1.2.3 src/main/cli/index.js for the legacy flag set.
//   STATUS:  Phase-B3 step-3 shipped.
//
// CHANGE_SUMMARY:
//   - 2026-04-29 B3-step-3: initial clap parser + CliBoot facade.

use clap::Parser;
use std::path::PathBuf;

/// Mark v2 command-line interface. Mirrors v1.2.3's flag set where
/// applicable; v1-only flags that no longer make sense in Tauri (e.g.
/// `--no-sandbox` electron flag) are omitted.
#[derive(Parser, Debug, Clone, Default, PartialEq, Eq)]
#[command(
    name = "mark",
    about = "Mark — Tauri-based Markdown editor",
    version
)]
pub struct CliArgs {
    /// Files to open. Multiple paths allowed; each opens in a new tab.
    #[arg(value_name = "FILE")]
    pub files: Vec<PathBuf>,

    /// Open this folder as the workspace (sidebar root). Equivalent to
    /// File → Open Folder. Mutually exclusive with --new-window.
    #[arg(short = 'd', long = "dir", value_name = "DIR")]
    pub directory: Option<PathBuf>,

    /// Open in a new window even if Mark is already running.
    /// (Multi-window currently routes through M-001 single-window
    /// shell; flag accepted but no-op until F-MULTI-WINDOW lands.)
    #[arg(long = "new-window")]
    pub new_window: bool,

    /// Verbose stderr trace — emits BLOCK_* markers from M-001 boot
    /// guards even in release builds.
    #[arg(short = 'v', long = "verbose")]
    pub verbose: bool,

    /// Print version and exit.
    #[arg(long = "print-version")]
    pub print_version: bool,
}

/// Parse process::args() and return the result.
/// Calls clap::Parser::parse(), which auto-handles --help / --version
/// by printing + exiting; for tests use parse_from(...) directly.
pub fn parse() -> CliArgs {
    CliArgs::parse()
}

/// Test/embed-friendly parse from explicit argv. Returns Result so
/// callers can branch on parse errors without exit() side effects.
/// allow(dead_code) — used only by tests in the current build; left
/// pub for future embedding (e.g. tauri-plugin-cli integration).
#[allow(dead_code)]
pub fn parse_from<I, T>(argv: I) -> Result<CliArgs, clap::Error>
where
    I: IntoIterator<Item = T>,
    T: Into<std::ffi::OsString> + Clone,
{
    CliArgs::try_parse_from(argv)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn no_args_returns_default() {
        let args = parse_from(&["mark"]).unwrap();
        assert_eq!(args, CliArgs::default());
        assert!(args.files.is_empty());
        assert!(args.directory.is_none());
        assert!(!args.verbose);
    }

    #[test]
    fn single_file() {
        let args = parse_from(&["mark", "/tmp/note.md"]).unwrap();
        assert_eq!(args.files, vec![PathBuf::from("/tmp/note.md")]);
        assert!(args.directory.is_none());
    }

    #[test]
    fn multiple_files() {
        let args = parse_from(&["mark", "a.md", "b.md", "c.md"]).unwrap();
        assert_eq!(
            args.files,
            vec![
                PathBuf::from("a.md"),
                PathBuf::from("b.md"),
                PathBuf::from("c.md")
            ]
        );
    }

    #[test]
    fn directory_long_form() {
        let args = parse_from(&["mark", "--dir", "/work"]).unwrap();
        assert_eq!(args.directory, Some(PathBuf::from("/work")));
    }

    #[test]
    fn directory_short_form() {
        let args = parse_from(&["mark", "-d", "/work"]).unwrap();
        assert_eq!(args.directory, Some(PathBuf::from("/work")));
    }

    #[test]
    fn directory_plus_files() {
        let args = parse_from(&["mark", "-d", "/work", "/work/a.md"]).unwrap();
        assert_eq!(args.directory, Some(PathBuf::from("/work")));
        assert_eq!(args.files, vec![PathBuf::from("/work/a.md")]);
    }

    #[test]
    fn verbose_flag() {
        let args = parse_from(&["mark", "-v"]).unwrap();
        assert!(args.verbose);
    }

    #[test]
    fn new_window_flag() {
        let args = parse_from(&["mark", "--new-window"]).unwrap();
        assert!(args.new_window);
    }

    #[test]
    fn print_version_flag() {
        let args = parse_from(&["mark", "--print-version"]).unwrap();
        assert!(args.print_version);
    }

    #[test]
    fn unknown_flag_returns_error_not_exit() {
        let result = parse_from(&["mark", "--what-is-this"]);
        assert!(result.is_err(), "unknown flag should error, not panic");
    }

    #[test]
    fn help_flag_returns_help_error_kind() {
        let err = parse_from(&["mark", "--help"]).unwrap_err();
        // clap categorizes --help as DisplayHelp (not a real error);
        // the caller decides whether to print + exit.
        assert!(matches!(
            err.kind(),
            clap::error::ErrorKind::DisplayHelp
                | clap::error::ErrorKind::DisplayVersion
        ));
    }
}
