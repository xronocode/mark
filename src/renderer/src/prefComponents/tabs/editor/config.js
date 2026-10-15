// FILE: src/renderer/src/prefComponents/tabs/editor/config.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Option builders for the Editor tab (C-38 T-004) — the text-direction pop-up.
//   SCOPE: Pure i18n-backed option lists; no store or window access.
//   DEPENDS: i18n (t).
//   LINKS: .grace/changes/active/C-38 T-004; docs/design/settings-ia-2026-10-15.md §3.3; .grace/graph/runtime.xml M-011.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   getTextDirectionOptions - "Left to right" / "Right to left" in IA §3.3 wording.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v1.0.0 - 2026-10-15 C-38 T-004: replaces prefComponents/editor/config.js — the encoding/end-of-line/tab-size/trailing-newline builders moved to their new owners (encoding + line endings to tabs/general/config.js, tab size rendered by the stepper).]
// END_CHANGE_SUMMARY

import { t } from '@/i18n'

export const getTextDirectionOptions = () => [{
  label: t('preferences.editor.typing.textDirectionLtr'),
  value: 'ltr'
}, {
  label: t('preferences.editor.typing.textDirectionRtl'),
  value: 'rtl'
}]
