// FILE: src/renderer/src/prefComponents/theme/config.js
// VERSION: 2.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Settings theme-page data — the family list for the C-41 T-002
//            picker tiles and the flat member list for the mode selects.
//   SCOPE: Derived views over config THEME_FAMILIES only.
//   DEPENDS: util/themeFamilies THEME_FAMILIES.
//   LINKS: prefComponents/theme/index.vue; .grace/verification/runtime.xml
//          V-M-011 scenario-48 (C-41 T-002).
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   families - the 14 families (id/name/light/dark) driving the picker tiles.
//   themes - flat member list in family order for the light/dark mode selects.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v2.0.0 - 2026-10-15 C-41 T-002: derived from
//   THEME_FAMILIES instead of the hand-maintained 35-entry list; the 13
//   retired ids are gone. The six C-41 T-003 members appear as ids (their
//   swatch styling and registration land with that task).
// END_CHANGE_SUMMARY

import { THEME_FAMILIES } from '../../util/themeFamilies'

// One picker tile per family (light + dark halves, name below).
export const families = THEME_FAMILIES.map((family) => ({
  id: family.id,
  name: family.name,
  light: family.light,
  dark: family.dark
}))

// Flat member list in family order (light member first) for the
// lightModeTheme/darkModeTheme selects.
export const themes = families.flatMap((family) => [
  { name: family.light },
  { name: family.dark }
])
