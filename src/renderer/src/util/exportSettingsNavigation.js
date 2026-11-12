// FILE: src/renderer/src/util/exportSettingsNavigation.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Request the existing Settings window at its Export section.
//   SCOPE: Existing last-tab storage and project action; no export execution or new IPC.
//   DEPENDS: prefComponents/tabsBar/config, store/project.
//   LINKS: M-072; V-M-072; C-EXPORT-SETTINGS-SECTION.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   openExportSettings - Remember Export before requesting Settings; return storage success, not native window confirmation.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   LAST_CHANGE: 2026-11-12 C-EXPORT-SETTINGS-SECTION: shared navigation for export success notices.
// END_CHANGE_SUMMARY

import { LAST_TAB_STORAGE_KEY, writeLastTab } from '@/prefComponents/tabsBar/config'
import { useProjectStore } from '@/store/project'

export const openExportSettings = async () => {
  // START_BLOCK_REQUEST_EXPORT_SETTINGS
  let refreshed = true
  try {
    // A same-value set emits no storage event. Refresh only this existing
    // key so an already-open Settings window also receives repeat requests.
    if (window.localStorage.getItem(LAST_TAB_STORAGE_KEY) === 'export') {
      window.localStorage.removeItem(LAST_TAB_STORAGE_KEY)
    }
  } catch {
    refreshed = false
  }
  const remembered = writeLastTab('export')
  if (!remembered || !refreshed) {
    console.warn('[export-settings][BLOCK_EXPORT_SETTINGS_STORAGE_UNAVAILABLE]')
  }
  await useProjectStore().OPEN_SETTING_WINDOW()
  return remembered && refreshed
  // END_BLOCK_REQUEST_EXPORT_SETTINGS
}
