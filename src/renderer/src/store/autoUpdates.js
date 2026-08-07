// MODULE_CONTRACT
//   PURPOSE: Auto-update notification store. v1.2.3 used 4
//            ipcRenderer.on() listeners for mt::UPDATE_{ERROR,
//            NOT_AVAILABLE,DOWNLOADED,AVAILABLE} fired by Electron's
//            electron-updater main-process module. The Tauri 2 port
//            uses tauri-plugin-updater. The user-facing check + signed
//            install flow goes through `file.check-update` in
//            commands/index.js; this store stays empty until background
//            progress UI is implemented.
//   SCOPE:   No background listeners or automatic download. Explicit
//            Help-menu updates are owned by commands/index.js.
//   LINKS:   src/renderer/src/commands/index.js id="file.check-update";
//            src-tauri/src/m016_updater.rs.
//   STATUS:  Dead-code purged.
//
// CHANGE_SUMMARY:
//   - 2026-08-07: document the live signed in-app flow; Terminal and
//                Homebrew subprocess routing were removed.
//   - 2026-05-09: removed 4 dead listeners + 1 dead send. Prior code
//                referenced channels (mt::UPDATE_*, mt::NEED_UPDATE)
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
