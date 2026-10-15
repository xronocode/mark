// FILE: src/renderer/src/whatsNew/data.js
// VERSION: 1.1.0
// START_MODULE_CONTRACT
//   PURPOSE: C-48 What's New sheet content — per-release entries (max 4
//            items, icon + i18n title/text keys) keyed by the normalized
//            version string.
//   SCOPE: static content table + lookup; no logic beyond the lookup, the
//          max-4 clamp and the latest-with-content fallback.
//   DEPENDS: util/version.js (normalizeVersion, compareVersions).
//   LINKS: .grace/changes/archive/C-48/spec.xml R-1; components/whatsNew
//          renders the items; locales whatsNew.v2_3_1.* carry the text.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   WHATS_NEW_MAX_ITEMS - 4 — per-release item cap (board 3 layout).
//   WHATS_NEW_CONTENT - version → items table (icon + titleKey + textKey).
//   getWhatsNewItems - normalized-version lookup, sliced to the 4-item cap.
//   resolveWhatsNewVersion - the version itself when it has content, else the newest version that does (Help › What's New fallback).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.1.0 - 2026-10-15 C-48 review fix: resolveWhatsNewVersion
//   so Help › What's New on a version without its own entry (patch with
//   no notes, dev build) shows the newest release notes instead of
//   nothing; MODULE_MAP lists WHATS_NEW_MAX_ITEMS.
//   PREV: v1.0.0 - 2026-10-15 C-48 T-001: 2.3.1 items (diagram zoom,
//   agent diff, Paper/Ink themes, fitting tables) per the approved board 3.
// END_CHANGE_SUMMARY

import { normalizeVersion, compareVersions } from '../util/version'

export const WHATS_NEW_MAX_ITEMS = 4

// START_BLOCK_WHATS_NEW_CONTENT
// Icons mirror the approved mockup (board 3): ⤢ fullscreen zoom, ± diff,
// ◐ light/dark themes, ▦ tables. Text lives in the locale tables under
// whatsNew.v2_3_1.* so each language ships its own copy.
export const WHATS_NEW_CONTENT = {
  '2.3.1': [
    {
      icon: '⤢',
      titleKey: 'whatsNew.v2_3_1.zoom.title',
      textKey: 'whatsNew.v2_3_1.zoom.text'
    },
    {
      icon: '±',
      titleKey: 'whatsNew.v2_3_1.agentDiff.title',
      textKey: 'whatsNew.v2_3_1.agentDiff.text'
    },
    {
      icon: '◐',
      titleKey: 'whatsNew.v2_3_1.themes.title',
      textKey: 'whatsNew.v2_3_1.themes.text'
    },
    {
      icon: '▦',
      titleKey: 'whatsNew.v2_3_1.tables.title',
      textKey: 'whatsNew.v2_3_1.tables.text'
    }
  ]
}
// END_BLOCK_WHATS_NEW_CONTENT

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
