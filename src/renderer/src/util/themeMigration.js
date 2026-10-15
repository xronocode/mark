// FILE: src/renderer/src/util/themeMigration.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Migrate retired C-41 T-002 theme ids to their nearest kept
//            family member so a stored value that no longer exists never
//            leaves the app unthemed.
//   SCOPE: Pure mapping helpers over theme id strings — the retired→kept
//            table, the per-key fallback resolution, and a helper that
//            rewrites the three persisted theme preference keys in a
//            hydration payload. No store, DOM, or IPC writes here.
//   DEPENDS: util/themeFamilies THEME_FAMILIES (valid-id membership).
//   LINKS: .grace/graph/runtime.xml M-011; .grace/verification/runtime.xml
//          V-M-011 scenario-48 (C-41 T-002); store/preferences.js
//          START_BLOCK_MIGRATE_RETIRED_THEMES;
//          _shims/install-window-globals.js boot theme param.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   THEME_MIGRATIONS - frozen retired-id → kept-id table (C-41 T-002 plan map).
//   THEME_PREFERENCE_KEYS - the three persisted keys the migration covers.
//   migrateThemeId - map one stored id to a valid id ('light'/'dark' mode fallback: paper/ink).
//   migrateThemePreferences - rewrite the three keys in a hydration payload; returns the changed pairs.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-15 C-41 T-002 initial table: 13 retired
//   ids map to the nearest kept family member by accent/background; any
//   other unknown id falls back to paper (light mode) / ink (dark mode);
//   valid stored ids are never rewritten.
// END_CHANGE_SUMMARY

import { THEME_FAMILIES } from './themeFamilies'

// START_BLOCK_THEME_MIGRATIONS
// Retired id → nearest kept family member (C-41 T-002 plan). Valid ids
// (any current family member, including the six C-41 T-003 members) pass
// through untouched; unknown ids fall back per mode below.
export const THEME_MIGRATIONS = Object.freeze({
  'light': 'paper',
  'dark': 'ink',
  'rose-pine-moon': 'rose-pine',
  'tokyo-night-storm': 'tokyo-night',
  'ayu-mirage': 'ayu-dark',
  'monokai-pro': 'one-dark',
  'material-dark': 'one-dark',
  'nightfox': 'nord',
  'palenight': 'catppuccin-mocha',
  'horizon-dark': 'rose-pine',
  'synthwave-84': 'dracula',
  'cyberdream': 'tokyo-night',
  'oxocarbon-dark': 'graphite-dark'
})
// END_BLOCK_THEME_MIGRATIONS

// The persisted keys the migration applies to.
export const THEME_PREFERENCE_KEYS = Object.freeze(['theme', 'lightModeTheme', 'darkModeTheme'])

// Fallback mode per key: an unknown manual `theme` has no inherent mode, so
// it takes the light brand default (Auto re-resolves `theme` from the mode
// members anyway); lightModeTheme falls back to paper, darkModeTheme to ink.
const MODE_BY_KEY = Object.freeze({
  theme: 'light',
  lightModeTheme: 'light',
  darkModeTheme: 'dark'
})

// START_CONTRACT: migrateThemeId
//   PURPOSE: Resolve a stored theme id to a valid current id.
//   INPUTS: { id: string - stored theme id; mode: string - 'light' | 'dark', fallback member for unknown ids }
//   OUTPUTS: { string - the mapped id: THEME_MIGRATIONS[id] when retired, id when already valid, paper/ink per mode otherwise }
//   SIDE_EFFECTS: none
//   LINKS: THEME_MIGRATIONS, migrateThemePreferences
// END_CONTRACT: migrateThemeId
export const migrateThemeId = (id, mode) => {
  if (typeof id !== 'string' || id.length === 0) {
    return mode === 'dark' ? 'ink' : 'paper'
  }
  if (Object.prototype.hasOwnProperty.call(THEME_MIGRATIONS, id)) {
    return THEME_MIGRATIONS[id]
  }
  const isFamilyMember = THEME_FAMILIES.some(
    (family) => family.light === id || family.dark === id
  )
  if (isFamilyMember) {
    return id
  }
  return mode === 'dark' ? 'ink' : 'paper'
}

// START_CONTRACT: migrateThemePreferences
//   PURPOSE: Rewrite the three persisted theme keys in a stored-preferences payload.
//   INPUTS: { preferences: Object - hydration payload; keys are copied, the object is mutated in place for the three theme keys }
//   OUTPUTS: { Array<{key, from, to}> - one entry per key that changed (empty when nothing migrated) }
//   SIDE_EFFECTS: none (caller owns persistence)
//   LINKS: store/preferences.js START_BLOCK_MIGRATE_RETIRED_THEMES
// END_CONTRACT: migrateThemePreferences
export const migrateThemePreferences = (preferences) => {
  const changed = []
  if (!preferences || typeof preferences !== 'object') {
    return changed
  }
  for (const key of THEME_PREFERENCE_KEYS) {
    const stored = preferences[key]
    if (typeof stored !== 'string' || stored.length === 0) {
      continue
    }
    const migrated = migrateThemeId(stored, MODE_BY_KEY[key])
    if (migrated !== stored) {
      preferences[key] = migrated
      changed.push({ key, from: stored, to: migrated })
    }
  }
  return changed
}
