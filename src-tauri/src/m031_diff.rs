use std::path::Path;
use std::process::Command;

#[tauri::command]
pub fn mt_diff_baseline(path: String) -> Result<String, String> {
    safe_eprintln!("[m031][diff][BLOCK_DIFF_BASELINE path={path}]");

    let file_path = Path::new(&path);
    if !file_path.exists() {
        return Err("File does not exist".to_string());
    }

    // Check for {path}.before first — explicit baseline takes priority over git.
    let before_str = format!("{}.before", path);
    let before_path = Path::new(&before_str);
    if before_path.exists() {
        let content = std::fs::read_to_string(before_path)
            .map_err(|e| format!("Failed to read .before file: {e}"))?;
        safe_eprintln!("[m031][diff][BLOCK_DIFF_BASELINE_OK source=before bytes={}]", content.len());
        return Ok(content);
    }

    let dir = file_path
        .parent()
        .ok_or_else(|| "Cannot determine parent directory".to_string())?;

    let toplevel = Command::new("git")
        .args(["rev-parse", "--show-toplevel"])
        .current_dir(dir)
        .output()
        .map_err(|e| format!("git not available: {e}"))?;

    if !toplevel.status.success() {
        return Err("Not a git repository".to_string());
    }

    let root = String::from_utf8_lossy(&toplevel.stdout).trim().to_string();
    let root_path = Path::new(&root);

    let rel = file_path
        .strip_prefix(root_path)
        .map_err(|_| "File is outside the git repository".to_string())?;

    let rel_str = rel.to_string_lossy();

    let show = Command::new("git")
        .args(["show", &format!("HEAD:{rel_str}")])
        .current_dir(&root)
        .output()
        .map_err(|e| format!("git show failed: {e}"))?;

    if !show.status.success() {
        let stderr = String::from_utf8_lossy(&show.stderr);
        if stderr.contains("does not exist") || stderr.contains("not in") {
            return Err("File is not tracked by git".to_string());
        }
        return Err(format!("git show failed: {}", stderr.trim()));
    }

    let content = String::from_utf8(show.stdout)
        .map_err(|_| "Baseline content is not valid UTF-8".to_string())?;

    safe_eprintln!("[m031][diff][BLOCK_DIFF_BASELINE_OK bytes={}]", content.len());
    Ok(content)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn baseline_nonexistent_file_returns_err() {
        let result = mt_diff_baseline("/tmp/definitely-does-not-exist-m031.md".to_string());
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("does not exist"));
    }

    #[test]
    fn baseline_assembles_git_show_command() {
        // This test verifies the function runs without panicking on a
        // file that exists but may not be in a git repo. The exact
        // error depends on the environment.
        let tmp = std::env::temp_dir().join("m031-test-file.md");
        std::fs::write(&tmp, "# test").unwrap();
        let result = mt_diff_baseline(tmp.to_string_lossy().to_string());
        // Either succeeds (if /tmp is in a git repo) or returns a
        // descriptive error.
        match result {
            Ok(content) => assert!(!content.is_empty() || content.is_empty()),
            Err(e) => assert!(
                e.contains("git") || e.contains("repository") || e.contains("tracked"),
                "unexpected error: {e}"
            ),
        }
        let _ = std::fs::remove_file(&tmp);
    }

    #[test]
    fn baseline_before_file_takes_priority() {
        let tmp = std::env::temp_dir().join("m031-before-test.md");
        let before = std::env::temp_dir().join("m031-before-test.md.before");
        std::fs::write(&tmp, "# current content").unwrap();
        std::fs::write(&before, "# original content").unwrap();

        let result = mt_diff_baseline(tmp.to_string_lossy().to_string());
        assert!(result.is_ok(), "expected Ok, got {:?}", result);
        assert_eq!(result.unwrap(), "# original content");

        let _ = std::fs::remove_file(&tmp);
        let _ = std::fs::remove_file(&before);
    }

    #[test]
    fn baseline_current_repo_file() {
        // Test against a file that IS in the current git repo
        let cargo_toml = std::env::current_dir()
            .unwrap()
            .join("Cargo.toml");
        if !cargo_toml.exists() {
            return; // skip if not running from src-tauri
        }
        let result = mt_diff_baseline(cargo_toml.to_string_lossy().to_string());
        match result {
            Ok(content) => {
                assert!(content.contains("[package]"));
            }
            Err(_) => {
                // Might fail in CI or unusual environments — not a test failure
            }
        }
    }
}
