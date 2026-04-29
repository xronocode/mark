// MODULE_CONTRACT
//   PURPOSE: M-014 mt-encoding. Read a file as bytes, detect the
//            encoding (UTF-8 / UTF-16 BOM / chardet best-guess), decode
//            to a String. Used by mt_fs_read fallback path for files
//            whose bytes don't validate as UTF-8.
//   SCOPE:   detect + decode + label. NO write-side encoding (we always
//            write UTF-8 — caller normalizes). NO dynamic codec
//            registration; the encoding_rs crate fixes the WHATWG set.
//   DEPENDS: chardet (legacy non-WHATWG detection — CP-1251 / Shift_JIS
//            / Big5 / KOI-8R that BOM/UTF-validation can't classify),
//            encoding_rs (decode by label).
//   LINKS:   docs/development-plan.xml Phase-B3 step-2;
//            docs/verification-plan.xml V-M-014.
//   STATUS:  Phase-B3 step-2 lite shipped — covers UTF-8/16/BOM +
//            chardet best-guess. Manual encoding override (renderer
//            picks from list) is F-ENCODING-MANUAL-PICK followup.
//
// CHANGE_SUMMARY:
//   - 2026-04-29 B3-step-2: initial detect_and_decode + decode_with_label.

use std::path::Path;

/// Result of a detect_and_decode call. `bytes_replaced` flags whether
/// the decode lossy-replaced any bytes — renderer can warn the user.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DecodedFile {
    pub text: String,
    pub label: String,
    pub bom_present: bool,
    pub bytes_replaced: bool,
}

/// BOM detection. Returns the encoding label for the BOM if present,
/// plus the byte length to skip.
fn detect_bom(bytes: &[u8]) -> Option<(&'static str, usize)> {
    if bytes.starts_with(&[0xEF, 0xBB, 0xBF]) {
        return Some(("UTF-8", 3));
    }
    if bytes.starts_with(&[0xFE, 0xFF]) {
        return Some(("UTF-16BE", 2));
    }
    if bytes.starts_with(&[0xFF, 0xFE]) {
        return Some(("UTF-16LE", 2));
    }
    None
}

/// Detect the encoding of a byte slice. Order:
///   1. BOM sniff (definitive).
///   2. UTF-8 validate — if valid bytes, label "UTF-8".
///   3. chardet best-guess — falls through to encoding_rs label lookup.
///   4. Fallback: "windows-1252" (universal Latin-1 superset).
pub fn detect_label(bytes: &[u8]) -> &'static str {
    if let Some((label, _)) = detect_bom(bytes) {
        return label;
    }
    if std::str::from_utf8(bytes).is_ok() {
        return "UTF-8";
    }
    let (best, _confidence, _language) = chardet::detect(bytes);
    // chardet returns labels like "ASCII", "windows-1251", "Shift_JIS".
    // encoding_rs accepts most of them; if not, fall to windows-1252.
    match encoding_rs::Encoding::for_label(best.as_bytes()) {
        Some(enc) => enc.name(),
        None => {
            eprintln!("[Encoding][detect][BLOCK_LABEL_UNKNOWN chardet_label={best}]");
            "windows-1252"
        }
    }
}

/// Decode bytes to String using a specific encoding label. Lossy by
/// design — invalid sequences become the U+FFFD replacement character
/// rather than failing the whole read. `bytes_replaced` flag surfaces
/// the lossiness to the caller.
pub fn decode_with_label(bytes: &[u8], label: &str) -> DecodedFile {
    let bom_present = detect_bom(bytes).is_some();
    // encoding_rs's decode() handles BOM stripping for UTF-8/16; for
    // explicit labels we strip ourselves to be safe.
    let stripped = if let Some((_, n)) = detect_bom(bytes) {
        &bytes[n..]
    } else {
        bytes
    };
    let enc = encoding_rs::Encoding::for_label(label.as_bytes())
        .unwrap_or(encoding_rs::WINDOWS_1252);
    let (cow, _used_enc, had_errors) = enc.decode(stripped);
    let text = cow.into_owned();
    eprintln!(
        "[Encoding][decode][BLOCK_DECODED label={} bytes={} chars={} replaced={} bom={}]",
        enc.name(),
        bytes.len(),
        text.chars().count(),
        had_errors,
        bom_present
    );
    DecodedFile {
        text,
        label: enc.name().to_string(),
        bom_present,
        bytes_replaced: had_errors,
    }
}

/// Convenience: detect + decode in one call.
pub fn detect_and_decode(bytes: &[u8]) -> DecodedFile {
    let label = detect_label(bytes);
    decode_with_label(bytes, label)
}

/// File-level helper. Reads the bytes, dispatches to detect_and_decode.
/// Used by tests + by F-FS-DETECT-META-INLINE follow-up that may
/// expose the per-read DecodedFile metadata to the renderer (currently
/// mt_fs_read returns just the text; label/replaced flag get logged
/// but not surfaced in the IPC payload).
#[allow(dead_code)]
pub fn decode_file(path: &Path) -> Result<DecodedFile, std::io::Error> {
    let bytes = std::fs::read(path)?;
    Ok(detect_and_decode(&bytes))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn utf8_roundtrip_no_replacement() {
        let bytes = "Hello, мир! 🌍".as_bytes();
        let result = detect_and_decode(bytes);
        assert_eq!(result.text, "Hello, мир! 🌍");
        assert_eq!(result.label, "UTF-8");
        assert!(!result.bom_present);
        assert!(!result.bytes_replaced);
    }

    #[test]
    fn utf8_with_bom_strips_bom() {
        let mut bytes = vec![0xEF, 0xBB, 0xBF];
        bytes.extend_from_slice("Привет".as_bytes());
        let result = detect_and_decode(&bytes);
        assert_eq!(result.text, "Привет");
        assert_eq!(result.label, "UTF-8");
        assert!(result.bom_present);
    }

    #[test]
    fn utf16le_with_bom() {
        // FF FE = UTF-16LE BOM, then "Hi" as UTF-16LE
        let bytes = vec![0xFF, 0xFE, b'H', 0x00, b'i', 0x00];
        let label = detect_label(&bytes);
        assert_eq!(label, "UTF-16LE");
    }

    #[test]
    fn utf16be_with_bom() {
        let bytes = vec![0xFE, 0xFF, 0x00, b'H', 0x00, b'i'];
        let label = detect_label(&bytes);
        assert_eq!(label, "UTF-16BE");
    }

    #[test]
    fn windows_1251_cyrillic_decoded() {
        // "Привет" in Windows-1251 (CP-1251) = 0xCF 0xF0 0xE8 0xE2 0xE5 0xF2
        let bytes = vec![0xCF, 0xF0, 0xE8, 0xE2, 0xE5, 0xF2];
        let result = detect_and_decode(&bytes);
        // chardet may classify as windows-1251 or KOI8-R; both decode
        // these specific bytes to readable Cyrillic, but the exact text
        // depends on which encoding was picked. Assert that we got
        // SOMETHING readable (no replacement chars).
        assert!(
            !result.bytes_replaced,
            "well-formed CP-1251 bytes should decode without replacement"
        );
        // Text should contain Cyrillic characters.
        assert!(
            result.text.chars().any(|c| ('А'..='я').contains(&c)),
            "decoded text {:?} should contain Cyrillic", result.text
        );
    }

    #[test]
    fn pure_ascii_classifies_as_utf8() {
        let bytes = b"Hello, world!\n";
        let result = detect_and_decode(bytes);
        assert_eq!(result.text, "Hello, world!\n");
        assert_eq!(result.label, "UTF-8");
    }

    #[test]
    fn invalid_utf8_does_not_panic() {
        // Lone continuation byte — invalid UTF-8 start.
        let bytes = vec![0x80, 0x81, 0x82];
        let result = detect_and_decode(&bytes);
        // Whatever encoding gets picked, decode returns SOME string.
        // Negative-assertion: never panics.
        assert!(!result.label.is_empty());
    }

    #[test]
    fn decode_with_label_known() {
        let bytes = vec![0xCF, 0xF0, 0xE8, 0xE2, 0xE5, 0xF2];
        let result = decode_with_label(&bytes, "windows-1251");
        assert_eq!(result.text, "Привет");
        assert_eq!(result.label, "windows-1251");
        assert!(!result.bytes_replaced);
    }

    #[test]
    fn decode_with_label_unknown_falls_to_windows_1252() {
        let result = decode_with_label(b"hello", "x-totally-bogus-encoding");
        assert_eq!(result.text, "hello");
        assert_eq!(result.label, "windows-1252");
    }

    #[test]
    fn decode_file_via_disk() {
        use std::io::Write;
        let dir = tempfile::TempDir::new().unwrap();
        let path = dir.path().join("a.md");
        let mut f = std::fs::File::create(&path).unwrap();
        f.write_all("# Hello, мир".as_bytes()).unwrap();
        drop(f);
        let result = decode_file(&path).unwrap();
        assert_eq!(result.text, "# Hello, мир");
        assert_eq!(result.label, "UTF-8");
    }

    #[test]
    fn empty_file_is_utf8() {
        let result = detect_and_decode(b"");
        assert_eq!(result.text, "");
        assert_eq!(result.label, "UTF-8");
        assert!(!result.bytes_replaced);
    }
}
