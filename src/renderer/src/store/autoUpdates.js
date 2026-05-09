// MODULE_CONTRACT
//   PURPOSE: Auto-update notification store. v1.2.3 used 4
//            ipcRenderer.on() listeners for mt::UPDATE_{ERROR,
//            NOT_AVAILABLE,DOWNLOADED,AVAILABLE} fired by Electron's
//            electron-updater main-process module. The Tauri 2 port
//            uses tauri-plugin-updater whose JS API
//            (`@tauri-apps/plugin-updater` package) is not yet a
//            dependency, so the user-facing check + install flow goes
//            through `file.check-update` command in commands/index.js
//            which invokes the `mt_updater_check` Rust command (m016).
//   SCOPE:   Minimal stub. LISTEN_FOR_UPDATE retained as a no-op so
//            App.vue's onMounted call doesn't break; deletion comes
//            in W6 cleanup wave.
//   LINKS:   docs/path-bclean-step1-inventory.md (W7);
//            src/renderer/src/commands/index.js id="file.check-update";
//            src-tauri/src/m016_updater.rs.
//   STATUS:  Path B-clean W7 — dead-code purge.
//
// CHANGE_SUMMARY:
//   - 2026-05-09 W7: removed 4 dead listeners + 1 dead send. Pre-W7
//                code referenced channels (mt::UPDATE_*, mt::NEED_UPDATE)
//                that the Tauri backend never emitted, so the original
//                "auto-update notification" flow was never live.
//                Update progress UI deferred to F-UPDATER-PROGRESS-UI;
//                imperative check still works via file.check-update.

import { defineStore } from 'pinia'

export const useAutoUpdatesStore = defineStore('autoUpdates', {
  state: () => ({
    /**
     * Future: when @tauri-apps/plugin-updater JS package is added,
     * this store should hold {hasUpdate, version, progressBytes,
     * progressTotal, error} so a notification component can render
     * a progress UI. F-UPDATER-PROGRESS-UI tracks that.
     */
  }),
  actions: {}
})
