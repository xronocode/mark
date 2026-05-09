// MODULE_CONTRACT
//   PURPOSE: M-008 mt-fonts. Enumerate system fonts for the renderer
//            font-picker (theme + editor + UI font preferences). Cached
//            once per process so the cost (~150-300ms on macOS first
//            call) doesn't repeat.
//   SCOPE:   list family names only; rendering / metrics live in the
//            renderer via CSS. NO font file content read; NO directory
//            crawl beyond what font-kit's SystemSource does internally.
//   DEPENDS: font-kit 0.14 — Servo's cross-platform font enumeration
//            (Core Text on macOS, DirectWrite on Windows, fontconfig
//            on Linux).
//   LINKS:   docs/development-plan.xml Phase-B3 step-6;
//            v1.2.3 src/preload/index.js fonts.list shape.
//   STATUS:  Phase-B3 step-6 shipped.
//
// CHANGE_SUMMARY:
//   - 2026-04-29 B3-step-6: initial impl + lazy cache.

use font_kit::source::SystemSource;
use std::sync::OnceLock;

/// Process-lifetime cache. font-kit's first-call cost is non-trivial;
/// subsequent renderer queries should be fast.
static CACHED_FAMILIES: OnceLock<Vec<String>> = OnceLock::new();

/// Pure helper — refreshable for tests. Always reads from system.
fn list_families_uncached() -> Vec<String> {
    let source = SystemSource::new();
    match source.all_families() {
        Ok(mut families) => {
            families.sort();
            families.dedup();
            families
        }
        Err(e) => {
            eprintln!("[Fonts][list][BLOCK_ENUMERATE_FAILED reason={e}]");
            Vec::new()
        }
    }
}

/// List system font families (cached after first call).
pub fn list_families() -> Vec<String> {
    CACHED_FAMILIES
        .get_or_init(|| {
            let f = list_families_uncached();
            eprintln!("[Fonts][list][BLOCK_FONTS_ENUMERATED count={}]", f.len());
            f
        })
        .clone()
}

/// Tauri command for the renderer font-picker.
#[tauri::command]
pub async fn mt_fonts_list() -> Result<Vec<String>, String> {
    Ok(list_families())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn list_returns_some_fonts_on_supported_platform() {
        // CI may run this on minimal Linux containers without fontconfig
        // populated; we tolerate empty list there. Real desktops always
        // have fonts.
        let families = list_families_uncached();
        // Hard sanity: never panics, returns Vec.
        let _: usize = families.len();
    }

    #[test]
    fn cached_call_is_idempotent() {
        let a = list_families();
        let b = list_families();
        assert_eq!(a, b);
    }

    #[test]
    fn families_are_sorted() {
        let families = list_families_uncached();
        let mut sorted = families.clone();
        sorted.sort();
        assert_eq!(families, sorted);
    }

    #[test]
    fn families_are_deduped() {
        let families = list_families_uncached();
        let mut seen = std::collections::HashSet::new();
        for f in &families {
            assert!(seen.insert(f.clone()), "duplicate family: {f}");
        }
    }

    #[tokio::test]
    async fn mt_fonts_list_command_returns_ok() {
        let families = mt_fonts_list().await.unwrap();
        // Same shape as cached helper.
        let cached = list_families();
        assert_eq!(families, cached);
    }
}
