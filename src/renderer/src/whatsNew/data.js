// FILE: src/renderer/src/whatsNew/data.js
// VERSION: 1.6.0
// START_MODULE_CONTRACT
//   PURPOSE: C-48/C-53 What's New sheet content — per-release entries
//            (max 4 items, icon + i18n title/text keys) keyed by the
//            normalized version string, plus the release-wide «Also»
//            line and «See everything new» external-link keys and the
//            GitHub release URL each entry links to.
//   SCOPE: static content tables + lookups; no logic beyond the lookups,
//          the max-4 clamp and the latest-with-content fallback.
//   DEPENDS: util/version.js (normalizeVersion, compareVersions).
//   LINKS: .grace/changes/archive/C-56, C-61 and archive/C-62 (2.5.0
//          sheet — diagram pictures, per-diagram look, direct print/PDF,
//          image copy); .grace/changes/archive/C-55 (2.4.0 sheet);
//          .grace/changes/archive/C-53 (2.3.1 sheet); components/
//          whatsNew renders the items, the also line and the release link;
//          locales whatsNew.v2_6_0.* carry the current text.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   WHATS_NEW_MAX_ITEMS - 4 — per-release item cap (board 3 layout).
//   WHATS_NEW_CONTENT - version → items table (icon + titleKey + textKey).
//   WHATS_NEW_ALSO_KEY - locale key of the one-line «Also» summary under the items.
//   WHATS_NEW_SEE_EVERYTHING_KEY - locale key of the «See everything new» footer link.
//   WHATS_NEW_RELEASE_URLS - version → GitHub release page the link opens.
//   getWhatsNewItems - normalized-version lookup, sliced to the 4-item cap.
//   getWhatsNewReleaseUrl - the release page URL for a version ('' → hide the link).
//   resolveWhatsNewVersion - the version itself when it has content, else the newest version that does (Help › What's New fallback).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.6.0 - 2026-10-20 release 2.6.0 draft: the sheet shows
//   tables as pictures, wide-table controls, comparison with the opened
//   version and restored editing shortcuts, and points at the future
//   v2.6.0 release URL. Publication remains separately authorized.
//   v1.5.0 - 2026-10-19 release 2.5.3: the sheet shows the
//   four 2.5.3 items (session restore C-69, wide tables at full width
//   C-65, remembered column widths C-65, daily update check C-66) and
//   points at the v2.5.3 release; the also line names the Clear Recent
//   broom (C-67) and ⌘W closing Settings.
//   v1.4.0 - 2026-10-18 release 2.5.0: the sheet shows
//   the four 2.5.0 items (diagrams as pictures, a look per diagram,
//   direct print and PDF, copy images back out) and points at the v2.5.0
//   release; the also line names instant footnotes and the site gallery.
//   v1.3.1 - 2026-10-18 C-55: the release URL retargets to
//   the stable v2.4.0 tag — the beta suffix was dropped before launch.
//   PREV: v1.3.0 - 2026-10-18 C-55: the 2.4.0 sheet — the pele
//   engine swap (engine/theme/types/lighter), the release URL pointed at
//   v2.4.0-beta, and the also line moved to the 2.4.0 locales.
//   PREV: v1.2.0 - 2026-10-17 C-53 T-001/R-1: replaced the
//   2026-10-15 board-3 items (diagram zoom, agent diff, Paper/Ink,
//   fitting tables) with the four D-1 items the user approved for the
//   2.3.1 release (native look + themes, home screen, themed diagrams,
//   Markdown-only folders), and added the release-wide «Also» line key,
//   the «See everything new» link key and WHATS_NEW_RELEASE_URLS with
//   getWhatsNewReleaseUrl (opened through window.electron.shell by the
//   sheet component).
//   PREV: v1.1.0 - 2026-10-15 C-48 review fix: resolveWhatsNewVersion
//   so Help › What's New on a version without its own entry (patch with
//   no notes, dev build) shows the newest release notes instead of
//   nothing; MODULE_MAP lists WHATS_NEW_MAX_ITEMS.
//   PREV: v1.0.0 - 2026-10-15 C-48 T-001: 2.3.1 items (diagram zoom,
//   agent diff, Paper/Ink themes, fitting tables) per the approved board 3.
// END_CHANGE_SUMMARY

import { normalizeVersion, compareVersions } from '../util/version'

export const WHATS_NEW_MAX_ITEMS = 4

// START_BLOCK_WHATS_NEW_CONTENT
// 2.4.0 (C-55): the pele engine swap — honest about the changed look,
// loud about what it buys. Icons in the board-3 glyph style: ◔ engine,
// ◐ theme, ✳ new types, ⤓ lighter. Text lives in the locale tables
// under whatsNew.v2_4_0.* so each language ships its own copy.
export const WHATS_NEW_CONTENT = {
  '2.8.1': [
    {
      icon: '⎙',
      titleKey: 'whatsNew.v2_8_1.pdfFix.title',
      textKey: 'whatsNew.v2_8_1.pdfFix.text'
    }
  ],
  '2.8.0': [
    {
      icon: '▣',
      titleKey: 'whatsNew.v2_8_0.folders.title',
      textKey: 'whatsNew.v2_8_0.folders.text'
    },
    {
      icon: '☁',
      titleKey: 'whatsNew.v2_8_0.cloud.title',
      textKey: 'whatsNew.v2_8_0.cloud.text'
    },
    {
      icon: '⌕',
      titleKey: 'whatsNew.v2_8_0.search.title',
      textKey: 'whatsNew.v2_8_0.search.text'
    },
    {
      icon: '⌘',
      titleKey: 'whatsNew.v2_8_0.quit.title',
      textKey: 'whatsNew.v2_8_0.quit.text'
    }
  ],
  '2.7.0': [
    {
      icon: '↺',
      titleKey: 'whatsNew.v2_7_0.session.title',
      textKey: 'whatsNew.v2_7_0.session.text'
    },
    {
      icon: '▤',
      titleKey: 'whatsNew.v2_7_0.htmlExport.title',
      textKey: 'whatsNew.v2_7_0.htmlExport.text'
    },
    {
      icon: '⌘',
      titleKey: 'whatsNew.v2_7_0.shortcuts.title',
      textKey: 'whatsNew.v2_7_0.shortcuts.text'
    },
    {
      icon: '▦',
      titleKey: 'whatsNew.v2_7_0.windowsBar.title',
      textKey: 'whatsNew.v2_7_0.windowsBar.text'
    }
  ],
  '2.6.0': [
    {
      icon: '▦',
      titleKey: 'whatsNew.v2_6_0.tableImages.title',
      textKey: 'whatsNew.v2_6_0.tableImages.text'
    },
    {
      icon: '↔',
      titleKey: 'whatsNew.v2_6_0.wideTables.title',
      textKey: 'whatsNew.v2_6_0.wideTables.text'
    },
    {
      icon: '◫',
      titleKey: 'whatsNew.v2_6_0.compare.title',
      textKey: 'whatsNew.v2_6_0.compare.text'
    },
    {
      icon: '⌘',
      titleKey: 'whatsNew.v2_6_0.shortcuts.title',
      textKey: 'whatsNew.v2_6_0.shortcuts.text'
    }
  ],
  '2.5.3': [
    {
      icon: '↺',
      titleKey: 'whatsNew.v2_5_3.session.title',
      textKey: 'whatsNew.v2_5_3.session.text'
    },
    {
      icon: '↔',
      titleKey: 'whatsNew.v2_5_3.tables.title',
      textKey: 'whatsNew.v2_5_3.tables.text'
    },
    {
      icon: '▥',
      titleKey: 'whatsNew.v2_5_3.columns.title',
      textKey: 'whatsNew.v2_5_3.columns.text'
    },
    {
      icon: '⟳',
      titleKey: 'whatsNew.v2_5_3.updates.title',
      textKey: 'whatsNew.v2_5_3.updates.text'
    }
  ],
  '2.5.0': [
    {
      icon: '⧉',
      titleKey: 'whatsNew.v2_5_0.export.title',
      textKey: 'whatsNew.v2_5_0.export.text'
    },
    {
      icon: '◐',
      titleKey: 'whatsNew.v2_5_0.look.title',
      textKey: 'whatsNew.v2_5_0.look.text'
    },
    {
      icon: '⎙',
      titleKey: 'whatsNew.v2_5_0.print.title',
      textKey: 'whatsNew.v2_5_0.print.text'
    },
    {
      icon: '▣',
      titleKey: 'whatsNew.v2_5_0.images.title',
      textKey: 'whatsNew.v2_5_0.images.text'
    }
  ]
}
// END_BLOCK_WHATS_NEW_CONTENT

// START_BLOCK_WHATS_NEW_EXTRAS
// C-53 R-1: the sheet-wide additions under the four items — a one-line
// «Also» summary (⌘D agent diff, ⌥⌘V clipboard folder, one zoom) and a
// «See everything new» link to the GitHub release page, opened through
// the app's external-link path (window.electron.shell.openExternal).
export const WHATS_NEW_ALSO_KEY = 'whatsNew.also'
export const WHATS_NEW_SEE_EVERYTHING_KEY = 'whatsNew.seeEverything'
export const WHATS_NEW_RELEASE_URLS = {
  '2.8.1': 'https://github.com/xronocode/mark/releases/tag/v2.8.1',
  '2.8.0': 'https://github.com/xronocode/mark/releases/tag/v2.8.0',
  '2.7.0': 'https://github.com/xronocode/mark/releases/tag/v2.7.0',
  '2.6.0': 'https://github.com/xronocode/mark/releases/tag/v2.6.0',
  '2.5.3': 'https://github.com/xronocode/mark/releases/tag/v2.5.3',
  '2.5.0': 'https://github.com/xronocode/mark/releases/tag/v2.5.0'
}

// '' when the version (after normalization) has no release page — the
// component hides the link rather than opening a dead URL.
export const getWhatsNewReleaseUrl = (version) =>
  WHATS_NEW_RELEASE_URLS[normalizeVersion(version)] || ''
// END_BLOCK_WHATS_NEW_EXTRAS

// START_BLOCK_GET_WHATS_NEW_ITEMS
// Prerelease decorations collapse first ("2.3.1-beta" → the 2.3.1 list).
// An unknown version returns [] — the gate then records silently instead
// of showing an empty sheet.
export const getWhatsNewItems = (version) => {
  const items = WHATS_NEW_CONTENT[normalizeVersion(version)]
  if (!Array.isArray(items)) return []
  return items.slice(0, WHATS_NEW_MAX_ITEMS)
}
// END_BLOCK_GET_WHATS_NEW_ITEMS

// START_BLOCK_RESOLVE_WHATS_NEW_VERSION
// Help › What's New must never be a dead menu item: when the running
// version has no entry, fall back to the newest version that has one.
// Returns '' only when the table is empty.
export const resolveWhatsNewVersion = (version) => {
  const normalized = normalizeVersion(version)
  if (getWhatsNewItems(normalized).length > 0) return normalized
  const withContent = Object.keys(WHATS_NEW_CONTENT).filter(
    (v) => getWhatsNewItems(v).length > 0
  )
  if (!withContent.length) return ''
  return withContent.sort(compareVersions)[withContent.length - 1]
}
// END_BLOCK_RESOLVE_WHATS_NEW_VERSION
