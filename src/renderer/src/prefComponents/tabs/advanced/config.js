// FILE: src/renderer/src/prefComponents/tabs/advanced/config.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Option builders for the Advanced tab (C-38 T-004) — the image insert-action pop-up (IA §3.5 labels). Image upload stays retired in every edition (user decision 2026-10-15, 0c17da80), so there is no upload action and no uploader list.
//   SCOPE: Pure i18n-backed option lists and the uploader service metadata the form needs; no store or window access.
//   DEPENDS: i18n (t).
//   LINKS: .grace/changes/archive/C-38 T-004; docs/design/settings-ia-2026-10-15.md §3.5; .grace/graph/runtime.xml M-011.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   getImageActions - "Copy it into a folder" / "Keep its original location".
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v1.0.0 - 2026-10-15 C-38 T-004: replaces prefComponents/image/config.js; no upload action (image upload retired, 0c17da80).]
// END_CHANGE_SUMMARY

import { t } from '@/i18n'

export const getImageActions = () => [{
  label: t('preferences.advanced.images.insertActionFolder'),
  value: 'folder'
}, {
  label: t('preferences.advanced.images.insertActionPath'),
  value: 'path'
}]
