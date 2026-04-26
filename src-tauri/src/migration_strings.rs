// MODULE_CONTRACT
//   PURPOSE: Locale-aware static copy for the pre-window migration dialog.
//            Pure data + matcher; no I/O, no allocation in the hot path.
//   SCOPE: 10 locales (en, ru, zh-CN, ja, de, fr, es, it, ko, pt-BR) with
//          en_US fallback. Exact-tag match first, then language-prefix match,
//          then EN fallback. Case-insensitive matching.
//   DEPENDS: sys_locale crate for runtime locale discovery.
//   LINKS: M-005 mt-prefs, V-M-005, Phase-B-pre2 step-2.
//

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct MigrationStrings {
    pub title: &'static str,
    pub body: &'static str,
    pub continue_label: &'static str,
    pub cancel_label: &'static str,
}

const EN: MigrationStrings = MigrationStrings {
    title: "Mark — Import data from previous version?",
    body: "Mark found settings and recents from a previous installation \
           (Mark v1.x or the original MarkText). Choose Continue to import \
           them, or Cancel to start fresh.",
    continue_label: "Continue",
    cancel_label: "Cancel",
};

const RU: MigrationStrings = MigrationStrings {
    title: "Mark — Импортировать данные из предыдущей версии?",
    body: "Mark обнаружил настройки и историю из предыдущей установки \
           (Mark v1.x или оригинальный MarkText). Нажмите «Продолжить», \
           чтобы импортировать их, или «Отмена», чтобы начать с чистого листа.",
    continue_label: "Продолжить",
    cancel_label: "Отмена",
};

const ZH_CN: MigrationStrings = MigrationStrings {
    title: "Mark — 是否导入旧版本数据？",
    body: "Mark 检测到先前安装的设置和最近文件（Mark v1.x 或原始 MarkText）。\
           选择「继续」以导入它们，或选择「取消」以全新开始。",
    continue_label: "继续",
    cancel_label: "取消",
};

const JA: MigrationStrings = MigrationStrings {
    title: "Mark — 以前のバージョンからデータをインポートしますか？",
    body: "Mark は以前のインストール（Mark v1.x または元の MarkText）の設定と最近の項目を検出しました。\
           「続行」を選択してインポートするか、「キャンセル」を選択して新しく開始してください。",
    continue_label: "続行",
    cancel_label: "キャンセル",
};

const DE: MigrationStrings = MigrationStrings {
    title: "Mark — Daten aus vorheriger Version importieren?",
    body: "Mark hat Einstellungen und zuletzt geöffnete Dateien aus einer früheren Installation gefunden \
           (Mark v1.x oder das ursprüngliche MarkText). Wählen Sie „Fortfahren\", um sie zu importieren, \
           oder „Abbrechen\", um neu zu beginnen.",
    continue_label: "Fortfahren",
    cancel_label: "Abbrechen",
};

const FR: MigrationStrings = MigrationStrings {
    title: "Mark — Importer les données de la version précédente ?",
    body: "Mark a trouvé des paramètres et des fichiers récents d'une installation antérieure \
           (Mark v1.x ou le MarkText d'origine). Choisissez « Continuer » pour les importer, \
           ou « Annuler » pour repartir de zéro.",
    continue_label: "Continuer",
    cancel_label: "Annuler",
};

const ES: MigrationStrings = MigrationStrings {
    title: "Mark — ¿Importar datos de la versión anterior?",
    body: "Mark encontró configuraciones y archivos recientes de una instalación previa \
           (Mark v1.x o el MarkText original). Elija «Continuar» para importarlos, \
           o «Cancelar» para empezar desde cero.",
    continue_label: "Continuar",
    cancel_label: "Cancelar",
};

const IT: MigrationStrings = MigrationStrings {
    title: "Mark — Importare i dati dalla versione precedente?",
    body: "Mark ha trovato impostazioni e file recenti da un'installazione precedente \
           (Mark v1.x o il MarkText originale). Scegli «Continua» per importarli, \
           o «Annulla» per iniziare da zero.",
    continue_label: "Continua",
    cancel_label: "Annulla",
};

const KO: MigrationStrings = MigrationStrings {
    title: "Mark — 이전 버전의 데이터를 가져오시겠습니까?",
    body: "Mark에서 이전 설치(Mark v1.x 또는 원본 MarkText)의 설정과 최근 파일을 발견했습니다. \
           가져오려면 「계속」을, 새로 시작하려면 「취소」를 선택하세요.",
    continue_label: "계속",
    cancel_label: "취소",
};

const PT_BR: MigrationStrings = MigrationStrings {
    title: "Mark — Importar dados da versão anterior?",
    body: "O Mark encontrou configurações e arquivos recentes de uma instalação anterior \
           (Mark v1.x ou o MarkText original). Escolha «Continuar» para importá-los, \
           ou «Cancelar» para começar do zero.",
    continue_label: "Continuar",
    cancel_label: "Cancelar",
};

const LOCALES: &[(&str, MigrationStrings)] = &[
    ("en", EN),
    ("ru", RU),
    ("zh-CN", ZH_CN),
    ("ja", JA),
    ("de", DE),
    ("fr", FR),
    ("es", ES),
    ("it", IT),
    ("ko", KO),
    ("pt-BR", PT_BR),
];

/// Match a BCP-47 tag to one of the supported locales.
///
/// Algorithm:
/// 1. Exact case-insensitive match against the tag table.
/// 2. Language-prefix match: take the first `-`-separated segment and match
///    against locale entries whose language sub-tag is equal.
/// 3. Fall back to `EN`.
///
/// Examples:
/// - "ru" → RU
/// - "ru-RU" → RU (prefix match on "ru")
/// - "ZH-cn" → ZH_CN (case-insensitive exact match)
/// - "zh-TW" → ZH_CN (prefix match: only zh variant present is zh-CN)
/// - "pt-PT" → PT_BR (prefix match: only pt variant present is pt-BR)
/// - "xx" → EN (fallback)
pub fn for_locale(tag: &str) -> MigrationStrings {
    let tag_lower = tag.to_ascii_lowercase();

    if let Some(s) = LOCALES
        .iter()
        .find(|(t, _)| t.eq_ignore_ascii_case(&tag_lower))
        .map(|(_, s)| *s)
    {
        return s;
    }

    let primary = tag_lower.split('-').next().unwrap_or("");
    if !primary.is_empty() {
        if let Some(s) = LOCALES
            .iter()
            .find(|(t, _)| t.split('-').next().unwrap_or("").eq_ignore_ascii_case(primary))
            .map(|(_, s)| *s)
        {
            return s;
        }
    }

    EN
}

/// Detect the OS locale via `sys_locale::get_locale()` and resolve
/// to a `MigrationStrings` instance. Falls back to EN on detection failure.
pub fn detect() -> MigrationStrings {
    sys_locale::get_locale()
        .map(|tag| for_locale(&tag))
        .unwrap_or(EN)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exact_match_returns_specific_locale() {
        assert_eq!(for_locale("ru"), RU);
        assert_eq!(for_locale("zh-CN"), ZH_CN);
        assert_eq!(for_locale("ja"), JA);
        assert_eq!(for_locale("pt-BR"), PT_BR);
    }

    #[test]
    fn match_is_case_insensitive() {
        assert_eq!(for_locale("RU"), RU);
        assert_eq!(for_locale("ZH-cn"), ZH_CN);
        assert_eq!(for_locale("Pt-bR"), PT_BR);
    }

    #[test]
    fn prefix_match_falls_to_language_subtag() {
        // "ru-RU" -> RU via primary subtag
        assert_eq!(for_locale("ru-RU"), RU);
        // "ru-UA" — no exact match, primary "ru" matches RU
        assert_eq!(for_locale("ru-UA"), RU);
        // "zh-TW" — no exact, primary "zh" matches first zh-* entry (zh-CN)
        assert_eq!(for_locale("zh-TW"), ZH_CN);
        // "pt-PT" — no exact, primary "pt" matches PT_BR
        assert_eq!(for_locale("pt-PT"), PT_BR);
        // "fr-CA" — primary "fr" matches FR
        assert_eq!(for_locale("fr-CA"), FR);
    }

    #[test]
    fn unknown_locale_falls_back_to_en() {
        assert_eq!(for_locale("xx"), EN);
        assert_eq!(for_locale("xx-YY"), EN);
        assert_eq!(for_locale(""), EN);
        assert_eq!(for_locale("klingon-KL"), EN);
    }

    #[test]
    fn each_locale_has_distinct_strings() {
        let all = [EN, RU, ZH_CN, JA, DE, FR, ES, IT, KO, PT_BR];
        for (i, a) in all.iter().enumerate() {
            for (j, b) in all.iter().enumerate() {
                if i != j {
                    assert_ne!(a.title, b.title, "locale {i} and {j} share title");
                    assert_ne!(a.body, b.body, "locale {i} and {j} share body");
                }
            }
        }
    }

    #[test]
    fn no_string_is_empty() {
        for (tag, s) in LOCALES {
            assert!(!s.title.is_empty(), "{tag} title empty");
            assert!(!s.body.is_empty(), "{tag} body empty");
            assert!(!s.continue_label.is_empty(), "{tag} continue empty");
            assert!(!s.cancel_label.is_empty(), "{tag} cancel empty");
        }
    }

    #[test]
    fn locale_table_has_all_ten_required_locales() {
        let tags: Vec<&str> = LOCALES.iter().map(|(t, _)| *t).collect();
        for required in ["en", "ru", "zh-CN", "ja", "de", "fr", "es", "it", "ko", "pt-BR"] {
            assert!(tags.contains(&required), "missing locale {required}");
        }
        assert_eq!(LOCALES.len(), 10);
    }

    #[test]
    fn detect_returns_some_strings_no_panic() {
        // Smoke: detect() must not panic regardless of host locale.
        // We can't assert on the exact return value (depends on $LANG of the
        // test runner), but we can confirm it returns one of the table values
        // or EN fallback.
        let s = detect();
        let table_values: Vec<MigrationStrings> = LOCALES.iter().map(|(_, v)| *v).collect();
        assert!(table_values.contains(&s) || s == EN);
    }
}
