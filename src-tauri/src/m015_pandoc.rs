// MODULE_CONTRACT
//   PURPOSE: M-015 mt-pandoc-bridge. Detect pandoc availability +
//            shell out for export. Includes macOS PATH augmentation
//            with /Library/TeX/texbin so pandoc can find pdflatex /
//            xelatex when LaTeX is installed via MacTeX/BasicTeX
//            (per dev-plan B3 step-9).
//   SCOPE:   is_pandoc_available + export(input, format) + version
//            string. NO bundled pandoc; user installs externally.
//   DEPENDS: stdlib std::process::Command.
//   LINKS:   docs/development-plan.xml Phase-B3 step-9;
//            docs/phase-b1-pdf-export-strategy.md (decision: PDF
//            export delegates here, mt::print_to_pdf returns
//            MT_UNSUPPORTED).
//   STATUS:  Phase-B3 step-9 shipped.
//
// CHANGE_SUMMARY:
//   - 2026-04-29 B3-step-9: initial detection + export.

use serde::Serialize;
use std::process::Command;

#[derive(Debug, Clone, Serialize)]
pub struct PandocStatus {
    pub available: bool,
    pub version: Option<String>,
    pub path: Option<String>,
}

/// PATH augmentation for macOS LaTeX install. Pandoc is usually in
/// /usr/local/bin or /opt/homebrew/bin (Homebrew); pdflatex/xelatex
/// live in /Library/TeX/texbin under MacTeX. GUI Tauri apps inherit
/// a sparse PATH — augment so shell-out finds the binaries.
fn augmented_path() -> String {
    let mut paths: Vec<String> = std::env::var("PATH")
        .unwrap_or_default()
        .split(':')
        .map(String::from)
        .collect();
    let extras = [
        "/usr/local/bin",
        "/opt/homebrew/bin",
        "/Library/TeX/texbin",
    ];
    for p in &extras {
        if !paths.iter().any(|x| x == p) {
            paths.push(p.to_string());
        }
    }
    paths.join(":")
}

/// Is pandoc available on PATH? Runs `pandoc --version` and parses.
#[tauri::command]
pub async fn mt_pandoc_status() -> Result<PandocStatus, String> {
    let path = augmented_path();
    let output = Command::new("pandoc")
        .arg("--version")
        .env("PATH", &path)
        .output();
    match output {
        Ok(o) if o.status.success() => {
            let stdout = String::from_utf8_lossy(&o.stdout);
            let version = stdout.lines().next().map(|l| l.trim().to_string());
            // Try `which pandoc` for the resolved path.
            let which = Command::new("which")
                .arg("pandoc")
                .env("PATH", &path)
                .output()
                .ok()
                .and_then(|w| {
                    if w.status.success() {
                        Some(String::from_utf8_lossy(&w.stdout).trim().to_string())
                    } else {
                        None
                    }
                });
            eprintln!("[Pandoc][status][BLOCK_PANDOC_AVAILABLE version={version:?}]");
            Ok(PandocStatus {
                available: true,
                version,
                path: which,
            })
        }
        _ => {
            eprintln!("[Pandoc][status][BLOCK_PANDOC_MISSING]");
            Ok(PandocStatus {
                available: false,
                version: None,
                path: None,
            })
        }
    }
}

/// Export input bytes (markdown) to a target format via pandoc.
/// Returns the output bytes (e.g. PDF binary, DOCX binary, HTML string).
/// `format` is a pandoc -t value (e.g. "pdf", "docx", "html5").
#[tauri::command]
pub async fn mt_pandoc_export(
    input: String,
    format: String,
) -> Result<Vec<u8>, String> {
    let path = augmented_path();
    let mut child = Command::new("pandoc")
        .args(["-f", "markdown", "-t", &format, "-o", "-"])
        .env("PATH", &path)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| {
            eprintln!("[Pandoc][export][BLOCK_SPAWN_FAILED reason={e}]");
            e.to_string()
        })?;
    if let Some(mut stdin) = child.stdin.take() {
        use std::io::Write;
        stdin
            .write_all(input.as_bytes())
            .map_err(|e| e.to_string())?;
    }
    let output = child.wait_with_output().map_err(|e| e.to_string())?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        eprintln!("[Pandoc][export][BLOCK_EXPORT_FAILED stderr={stderr}]");
        return Err(format!("pandoc exit {}: {}", output.status, stderr));
    }
    eprintln!(
        "[Pandoc][export][BLOCK_EXPORT_OK format={} input_bytes={} output_bytes={}]",
        format,
        input.len(),
        output.stdout.len()
    );
    Ok(output.stdout)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn augmented_path_contains_extras() {
        let p = augmented_path();
        assert!(p.contains("/Library/TeX/texbin"));
        assert!(p.contains("/usr/local/bin") || p.contains("/opt/homebrew/bin"));
    }

    // Live pandoc invocations skipped in unit tests — depend on
    // pandoc being installed on the runner. Manual smoke + B3a
    // integration coverage.
}
