// FILE: src-tauri/src/m014_encoding.rs
// START_MODULE_CONTRACT
//   PURPOSE: M-014 explicit document codecs, byte policies and encoding detection.
//   SCOPE: Construct exact validated bytes before mutation; strict metadata-aware open and legacy helpers.
//          UTF-8/16 are explicit, ISO 8859-1/9 exact, mapped codecs strict.
//          No replacement/entity fallback, atomic replacement or richer heuristics.
//   DEPENDS: shared fileFormatCatalog.json, chardet, encoding_rs, serde_json.
//   LINKS: M-014; V-M-014; C-METADATA-SAVE-SAFETY T-001/T-003.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   DocumentFormat - immutable wire byte-policy value.
//   CodecEntry - explicit supported or unavailable UI codec disposition.
//   codec_catalog - checked-in catalog shared with the renderer.
//   validate_document_format - complete supported policy validation.
//   DecodedDocument - canonical text with actual source format.
//   decode_document - strict existing-detector read with actual BOM/EOL.
//   encode_document - fully validate and construct exact output bytes.
//   DecodedFile - legacy decoded text and detection metadata.
//   detect_label - existing BOM/UTF-8/chardet label detection.
//   decode_with_label - legacy compatibility decode, possibly lossy.
//   detect_and_decode - existing combined detection and decode.
//   decode_file - legacy disk helper.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   - 2026-11-11 C-METADATA-SAVE-SAFETY: strict 32-codec byte construction,
//     four explicit unavailable choices, BOM and boundary-only newline policies.
//   - 2026-04-29 B3-step-2: initial detection and legacy decode helpers.
// END_CHANGE_SUMMARY

use std::path::Path;

// START_BLOCK_DOCUMENT_FORMAT_CODEC
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentFormat {
    pub encoding: String,
    pub is_bom: bool,
    pub line_ending: String,
    pub final_newline: u8,
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodecEntry {
    pub id: String,
    pub kind: String,
    pub supported: bool,
    pub label: Option<String>,
    pub unavailable_reason: Option<String>,
}

pub fn codec_catalog() -> Result<&'static [CodecEntry], String> {
    static CATALOG: std::sync::LazyLock<Result<Vec<CodecEntry>, serde_json::Error>> =
        std::sync::LazyLock::new(|| serde_json::from_str(include_str!("../../src/common/fileFormatCatalog.json")));
    CATALOG.as_ref().map(|entries| entries.as_slice()).map_err(|_| "MT_ENC_CATALOG_INVALID".into())
}

/// Validate a complete selected policy; mixed is a valid read state, not a write policy.
pub fn validate_document_format(format: &DocumentFormat) -> Result<(), String> {
    let codec = codec_catalog()?.iter().find(|entry| entry.id == format.encoding)
        .ok_or("MT_ENC_UNKNOWN")?;
    if !codec.supported { return Err("MT_ENC_UNSUPPORTED".into()); }
    if !matches!(format.final_newline, 0 | 1 | 3) ||
        !matches!(format.line_ending.as_str(), "lf" | "crlf" | "mixed") ||
        (format.is_bom && !matches!(codec.kind.as_str(), "utf8" | "utf16le" | "utf16be")) {
        return Err("MT_ENC_INVALID_POLICY".into());
    }
    Ok(())
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DecodedDocument {
    pub text: String,
    pub format: DocumentFormat,
}

/// Use the existing detector, refusing replacement and unsupported source codecs.
/// Strip exactly one transport BOM and preserve all decoded line breaks.
pub fn decode_document(bytes: &[u8]) -> Result<DecodedDocument, String> {
    let result = (|| {
        if bytes.starts_with(&[0xff, 0xfe, 0, 0]) || bytes.starts_with(&[0, 0, 0xfe, 0xff]) {
            return Err("MT_ENC_UNSUPPORTED".to_string());
        }
        let decoder = encoding_rs::Encoding::for_label(detect_label(bytes).as_bytes())
            .ok_or("MT_ENC_UNKNOWN")?;
        let codec = codec_catalog()?.iter().find(|entry| entry.supported && match entry.kind.as_str() {
            "utf8" => std::ptr::eq(decoder, encoding_rs::UTF_8),
            "utf16le" => std::ptr::eq(decoder, encoding_rs::UTF_16LE),
            "utf16be" => std::ptr::eq(decoder, encoding_rs::UTF_16BE),
            "mapped" => entry.label.as_ref().and_then(|label| encoding_rs::Encoding::for_label(label.as_bytes()))
                .is_some_and(|encoding| std::ptr::eq(decoder, encoding)),
            _ => false,
        }).ok_or("MT_ENC_UNSUPPORTED")?;
        let bom = detect_bom(bytes);
        let input = bom.map_or(bytes, |(_, len)| &bytes[len..]);
        let (text, had_errors) = decoder.decode_without_bom_handling(input);
        if had_errors { return Err("MT_ENC_LOSSY".into()); }
        let mut crlf = false;
        let mut lf = false;
        let mut lone_cr = false;
        let mut chars = text.chars().peekable();
        while let Some(ch) = chars.next() {
            match ch {
                '\r' if chars.peek() == Some(&'\n') => { chars.next(); crlf = true; },
                '\r' => lone_cr = true,
                '\n' => lf = true,
                _ => {},
            }
        }
        let line_ending = if lone_cr || (crlf && lf) { "mixed" } else if crlf { "crlf" } else { "lf" };
        Ok(DecodedDocument { text: text.into_owned(), format: DocumentFormat {
            encoding: codec.id.clone(), is_bom: bom.is_some(), line_ending: line_ending.into(), final_newline: 3,
        } })
    })();
    match &result {
        Ok(document) => safe_eprintln!("[Encoding][decode_document][BLOCK_DECODED_DOCUMENT] codec={} bytes={}", document.format.encoding, bytes.len()),
        Err(code) => safe_eprintln!("[Encoding][decode_document][BLOCK_DECODE_REFUSED] code={}", code),
    }
    result
}

fn encode_document_bytes(markdown: &str, format: &DocumentFormat) -> Result<Vec<u8>, String> {
    let codec = codec_catalog()?.iter().find(|entry| entry.id == format.encoding)
        .ok_or("MT_ENC_UNKNOWN")?;
    validate_document_format(format)?;
    match format.line_ending.as_str() {
        "lf" | "crlf" => {},
        "mixed" => return Err("MT_ENC_MIXED_EOL".into()),
        _ => return Err("MT_ENC_INVALID_POLICY".into()),
    }
    let mut text = markdown.replace("\r\n", "\n").replace('\r', "\n");
    if format.final_newline != 3 {
        while text.ends_with('\n') { text.pop(); }
        if format.final_newline == 1 { text.push('\n'); }
    }
    if format.line_ending == "crlf" { text = text.replace('\n', "\r\n"); }
    let mut bytes = match codec.kind.as_str() {
        "utf8" => text.into_bytes(),
        "utf16le" | "utf16be" => text.encode_utf16().flat_map(|unit| {
            if codec.kind == "utf16le" { unit.to_le_bytes() } else { unit.to_be_bytes() }
        }).collect(),
        "latin1" | "latin5" => text.chars().map(|ch| {
            if codec.kind == "latin5" {
                match ch {
                    'Ğ' => return Ok(0xd0), 'İ' => return Ok(0xdd), 'Ş' => return Ok(0xde),
                    'ğ' => return Ok(0xf0), 'ı' => return Ok(0xfd), 'ş' => return Ok(0xfe),
                    'Ð' | 'Ý' | 'Þ' | 'ð' | 'ý' | 'þ' => return Err("MT_ENC_UNREPRESENTABLE".to_string()),
                    _ => {},
                }
            }
            u8::try_from(ch as u32).map_err(|_| "MT_ENC_UNREPRESENTABLE".to_string())
        }).collect::<Result<Vec<u8>, String>>()?,
        "mapped" => {
            let label = codec.label.as_ref().ok_or("MT_ENC_CATALOG_INVALID")?;
            let encoder = encoding_rs::Encoding::for_label(label.as_bytes()).ok_or("MT_ENC_CATALOG_INVALID")?;
            let (bytes, output, had_errors) = encoder.encode(&text);
            if had_errors || !std::ptr::eq(encoder, output) { return Err("MT_ENC_UNREPRESENTABLE".into()); }
            bytes.into_owned()
        },
        _ => return Err("MT_ENC_CATALOG_INVALID".into()),
    };
    if format.is_bom {
        let bom: &[u8] = match codec.kind.as_str() {
            "utf8" => &[0xef, 0xbb, 0xbf], "utf16le" => &[0xff, 0xfe], "utf16be" => &[0xfe, 0xff],
            _ => return Err("MT_ENC_INVALID_POLICY".into()),
        };
        bytes.splice(0..0, bom.iter().copied());
    }
    Ok(bytes)
}

/// Construct all declared output bytes before any destination mutation.
pub fn encode_document(markdown: &str, format: &DocumentFormat) -> Result<Vec<u8>, String> {
    let result = encode_document_bytes(markdown, format);
    match &result {
        Ok(bytes) => safe_eprintln!("[Encoding][encode_document][BLOCK_ENCODED] codec={} bytes={}", format.encoding, bytes.len()),
        Err(code) => safe_eprintln!("[Encoding][encode_document][BLOCK_ENCODE_REFUSED] code={}", code),
    }
    result
}
// END_BLOCK_DOCUMENT_FORMAT_CODEC

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
            safe_eprintln!("[Encoding][detect][BLOCK_LABEL_UNKNOWN chardet_label={best}]");
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
    safe_eprintln!(
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

    fn document_format(encoding: &str, is_bom: bool, line_ending: &str, final_newline: u8) -> DocumentFormat {
        DocumentFormat { encoding: encoding.into(), is_bom, line_ending: line_ending.into(), final_newline }
    }
    #[test]
    fn format_catalog_exact_bytes_for_all_supported_codecs() {
        let fixtures: &[(&str, &str, &[u8])] = &[
            ("utf8", "A😀", &[0x41, 0xf0, 0x9f, 0x98, 0x80]),
            ("utf16be", "A😀", &[0x00, 0x41, 0xd8, 0x3d, 0xde, 0x00]),
            ("utf16le", "A😀", &[0x41, 0x00, 0x3d, 0xd8, 0x00, 0xde]),
            ("ascii", "\u{0080}£", &[0x80, 0xa3]),
            ("latin3", "Ħ", &[0xa1]),
            ("iso885915", "€", &[0xa4]),
            ("cp1252", "€", &[0x80]),
            ("arabic", "ش", &[0xd4]),
            ("cp1256", "ش", &[0xd4]),
            ("latin4", "Ā", &[0xc0]),
            ("cp1257", "Ā", &[0xc2]),
            ("iso88592", "Ł", &[0xa3]),
            ("windows1250", "Ł", &[0xa3]),
            ("cp866", "Привет", &[0x8f, 0xe0, 0xa8, 0xa2, 0xa5, 0xe2]),
            ("iso88595", "Привет", &[0xbf, 0xe0, 0xd8, 0xd2, 0xd5, 0xe2]),
            ("koi8r", "Привет", &[0xf0, 0xd2, 0xc9, 0xd7, 0xc5, 0xd4]),
            ("koi8u", "і", &[0xa6]),
            ("cp1251", "Привет", &[0xcf, 0xf0, 0xe8, 0xe2, 0xe5, 0xf2]),
            ("iso885913", "Õ", &[0xd5]),
            ("greek", "Ω", &[0xd9]),
            ("cp1253", "Ω", &[0xd9]),
            ("hebrew", "ש", &[0xf9]),
            ("cp1255", "ש", &[0xf9]),
            ("latin5", "ĞİŞğış", &[0xd0, 0xdd, 0xde, 0xf0, 0xfd, 0xfe]),
            ("cp1254", "ĞİŞğış", &[0xd0, 0xdd, 0xde, 0xf0, 0xfd, 0xfe]),
            ("gb18030", "中文", &[0xd6, 0xd0, 0xce, 0xc4]),
            ("gbk", "中文", &[0xd6, 0xd0, 0xce, 0xc4]),
            ("big5", "中文", &[0xa4, 0xa4, 0xa4, 0xe5]),
            ("shiftjis", "日本", &[0x93, 0xfa, 0x96, 0x7b]),
            ("eucjp", "日本", &[0xc6, 0xfc, 0xcb, 0xdc]),
            ("euckr", "한국", &[0xc7, 0xd1, 0xb1, 0xb9]),
            ("latin6", "Ā", &[0xc0]),
        ];
        assert_eq!(codec_catalog().unwrap().len(), 36);
        assert_eq!(fixtures.len(), 32);
        for (id, text, expected) in fixtures {
            let bytes = encode_document(text, &document_format(id, false, "lf", 3)).unwrap();
            assert_eq!(bytes, *expected, "exact codec bytes for {}", id);
            let codec = codec_catalog().unwrap().iter().find(|c| c.id == *id).unwrap();
            if let Some(label) = &codec.label {
                let decoder = encoding_rs::Encoding::for_label(label.as_bytes()).unwrap();
                let (decoded, had_errors) = decoder.decode_without_bom_handling(&bytes);
                assert!(!had_errors);
                assert_eq!(decoded, *text, "strict mapped roundtrip for {}", id);
            }

        }
        for id in ["utf32le", "utf32be", "gb2312", "big5hkscs"] {
            assert_eq!(encode_document("A", &document_format(id, false, "lf", 3)).unwrap_err(), "MT_ENC_UNSUPPORTED");
        }
    }
    #[test]
    fn format_unicode_bom_and_supplementary_scalars() {
        for (id, bom, body) in [
            ("utf8", vec![0xef,0xbb,0xbf], vec![0x41,0xf0,0x9f,0x98,0x80]),
            ("utf16le", vec![0xff,0xfe], vec![0x41,0,0x3d,0xd8,0,0xde]),
            ("utf16be", vec![0xfe,0xff], vec![0,0x41,0xd8,0x3d,0xde,0])
        ] {
            assert_eq!(encode_document("A😀", &document_format(id, false, "lf", 3)).unwrap(), body);
            assert_eq!(encode_document("A😀", &document_format(id, true, "lf", 3)).unwrap(), [bom,body].concat());
        }
    }
    #[test]
    fn format_newline_policies_are_exact_without_trimming_text() {
        for (text, preserve, remove, one) in [
            ("", "", "", "\n"), ("A", "A", "A", "A\n"),
            ("A\n", "A\n", "A", "A\n"), ("A\n\n", "A\n\n", "A", "A\n"),
            ("A? ?\n\n", "A? ?\n\n", "A? ?", "A? ?\n"),
            ("A\r\nB\rC\n\n", "A\nB\nC\n\n", "A\nB\nC", "A\nB\nC\n")
        ] {
            for (policy, expected) in [(0,remove),(1,one),(3,preserve)] {
                for eol in ["lf","crlf"] {
                    let expected = if eol=="crlf" { expected.replace('\n',"\r\n") } else { expected.into() };
                    assert_eq!(encode_document(text,&document_format("utf8",false,eol,policy)).unwrap(),expected.as_bytes());
                }
            }
        }
    }
    #[test]
    fn format_strict_representability_and_policy_errors() {
        for id in ["ascii", "latin5", "cp1251", "gbk"] {
            assert_eq!(encode_document("😀", &document_format(id,false,"lf",3)).unwrap_err(),"MT_ENC_UNREPRESENTABLE");
        }
        for text in ["Ð", "Ý", "Þ", "ð", "ý", "þ"] {
            assert_eq!(encode_document(text,&document_format("latin5",false,"lf",3)).unwrap_err(),"MT_ENC_UNREPRESENTABLE");
        }
        assert_eq!(encode_document("A",&document_format("bogus",false,"lf",3)).unwrap_err(),"MT_ENC_UNKNOWN");
        for format in [document_format("cp1251",true,"lf",3),document_format("utf8",false,"mixed",3),document_format("utf8",false,"lf",2)] {
            assert!(encode_document("A",&format).unwrap_err().starts_with("MT_ENC_"));
        }
    }

    #[test]
    fn decoded_document_preserves_actual_bom_eol_and_inner_bom_text() {
        for (bytes, encoding, text, bom, eol) in [
            (vec![0xef,0xbb,0xbf,0x41,0x0d,0x0a], "utf8", "A\r\n", true, "crlf"),
            (vec![0xff,0xfe,0x41,0,0x0d,0,0x0a,0], "utf16le", "A\r\n", true, "crlf"),
            (vec![0xfe,0xff,0,0x41,0,0x0a], "utf16be", "A\n", true, "lf"),
            (vec![], "utf8", "", false, "lf"),
            (b"A\r\nB\n".to_vec(), "utf8", "A\r\nB\n", false, "mixed"),
            (b"A\rB".to_vec(), "utf8", "A\rB", false, "mixed"),
            (vec![0xef,0xbb,0xbf,0xef,0xbb,0xbf,0x41], "utf8", "\u{feff}A", true, "lf")
        ] {
            let decoded = decode_document(&bytes).unwrap();
            assert_eq!(decoded.text,text);
            assert_eq!(decoded.format, document_format(encoding,bom,eol,3));
        }
    }
    #[test]
    fn decoded_document_refuses_lossy_and_utf32_input_without_fallback() {
        for bytes in [vec![0xef,0xbb,0xbf,0xff],vec![0xff,0xfe,0x41],vec![0xfe,0xff,0xd8,0]] {
            assert_eq!(decode_document(&bytes).unwrap_err(),"MT_ENC_LOSSY");
        }
        for bytes in [vec![0xff,0xfe,0,0,0x41,0,0,0],vec![0,0,0xfe,0xff,0,0,0,0x41]] {
            assert_eq!(decode_document(&bytes).unwrap_err(),"MT_ENC_UNSUPPORTED");
        }
    }
}
