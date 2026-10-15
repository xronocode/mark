// FILE: src/renderer/src/whatsNew/data.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: C-48 What's New sheet content — per-release entries (max 4
//            items, icon + i18n title/text keys) keyed by the normalized
//            version string.
//   SCOPE: static content table + lookup; no logic beyond the lookup and
//          the max-4 clamp.
//   DEPENDS: util/version.js (normalizeVersion).
//   LINKS: .grace/changes/active/C-48/spec.xml R-1; components/whatsNew
//          renders the items; locales whatsNew.v2_3_1.* carry the text.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   WHATS_NEW_CONTENT - version → items table (icon + titleKey + textKey).
//   getWhatsNewItems - normalized-version lookup, sliced to the 4-item cap.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-15 C-48 T-001: 2.3.1 items (diagram zoom,
//   agent diff, Paper/Ink themes, fitting tables) per the approved board 3.
// END_CHANGE_SUMMARY

import { normalizeVersion } from '../util/version'

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
