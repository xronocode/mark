// FILE: src/renderer/src/util/menuChecks.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Push the effective renderer state of the four native View-menu CheckMenuItems (C-40 T-005) to the backend so their checkmarks always follow the real state — at boot after hydration and on every later change from any toggle surface (palette, title bar button, Settings, keyboard, the menu itself).
//   SCOPE: The id→state mapping for view.toggle-sidebar / view.toggle-tabbar / view.outline / view.status-bar, the best-effort mt_menu_set_checked push, the boot sync (syncViewMenuChecks), and the per-item change watchers (watchViewMenuChecks). Failures are swallowed with a warn — never break boot or toggles.
//   DEPENDS: vue (watch), @tauri-apps/api/core (dynamic import), store/layout, store/preferences.
//   LINKS: src-tauri/src/m009_menu.rs mt_menu_set_checked + SYNCABLE_CHECK_IDS (id contract, recursive allow-listed walker); .grace/graph/runtime.xml M-009 fn-set_app_menu_check, M-011 fn-menuChecks; .grace/verification/runtime.xml V-M-009 scenario-16, V-M-011 scenario-57; .grace/changes/archive/C-40 T-005.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   VIEW_MENU_CHECK_ITEMS - The four syncable View-menu ids with their owning store and state key.
//   viewMenuCheckStates - Current effective { id, checked } pairs for all four items.
//   pushViewMenuCheck - Best-effort mt_menu_set_checked invoke for one id (failures warn, never throw).
//   syncViewMenuChecks - Push all four current states (boot, after preferences/layout hydrate).
//   watchViewMenuChecks - Install one change watcher per item; call from the editor page setup so the watchers share its effect scope. Returns the stop functions.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: 2026-10-16 v1.0.0 - C-40 T-005 (F-MENU-WIRE-TAURI
//   follow-up): the native View-menu check items were built with fixed
//   defaults and never re-synced (turn the status bar on, restart → the
//   bar is visible but View › Status Bar is unchecked), and tauri 2's
//   Menu::get never reached submenu items so mt_update_sidebar_menu
//   never worked. The backend now exposes mt_menu_set_checked
//   (recursive allow-listed walker) and the editor window pushes the
//   effective state of all four after hydration plus on every change.
// END_CHANGE_SUMMARY

import { watch } from 'vue'
import { useLayoutStore } from '../store/layout'
import { usePreferencesStore } from '../store/preferences'

// START_BLOCK_VIEW_MENU_CHECK_ITEMS
// The four native View-menu CheckMenuItems whose checkmarks mirror
// renderer state. `id` must match SYNCABLE_CHECK_IDS in
// src-tauri/src/m009_menu.rs (the backend rejects anything else with
// Ok(false)). Sidebar/tab bar visibility live in the layout store
// (hydrated by APPLY_BOOTSTRAP_EDITOR); the outline rail and the status
// bar live in the preferences store (outlineRailVisible,
// statusBarVisibility — the latter already resolves the per-OS default
// off on macOS / on elsewhere, with a stored user choice winning).
export const VIEW_MENU_CHECK_ITEMS = [
  { id: 'view.toggle-sidebar', store: 'layout', key: 'showSideBar' },
  { id: 'view.toggle-tabbar', store: 'layout', key: 'showTabBar' },
  { id: 'view.outline', store: 'preferences', key: 'outlineRailVisible' },
  { id: 'view.status-bar', store: 'preferences', key: 'statusBarVisibility' }
]

export const viewMenuCheckStates = () => {
  const stores = {
    layout: useLayoutStore(),
    preferences: usePreferencesStore()
  }
  return VIEW_MENU_CHECK_ITEMS.map(({ id, store, key }) => ({
    id,
    checked: !!stores[store][key]
  }))
}
// END_BLOCK_VIEW_MENU_CHECK_ITEMS

// START_BLOCK_PUSH_MENU_CHECK
// Best-effort: an old backend without the command, a Windows/Linux
// hidden menu bar, or a rejected sync must never break boot or a
// toggle — warn and move on.
export const pushViewMenuCheck = async (id, checked) => {
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('mt_menu_set_checked', { id, checked })
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn(`[menuChecks][pushViewMenuCheck][BLOCK_MENU_CHECK_PUSH_FAILED id=${id}]`, e)
  }
}
// END_BLOCK_PUSH_MENU_CHECK

// START_BLOCK_SYNC_VIEW_MENU_CHECKS
// Boot sync: called once after preferences and layout have hydrated
// (editor store APPLY_BOOTSTRAP_EDITOR). Load-bearing even though the
// watchers below also push on change — a hydrated value that EQUALS the
// store default triggers no watcher, while the native items are BUILT
// with fixed defaults (e.g. Toggle Tab Bar is built checked, the store
// default is false), so only this full push reconciles the no-change
// cases.
export const syncViewMenuChecks = async () => {
  for (const { id, checked } of viewMenuCheckStates()) {
    await pushViewMenuCheck(id, checked)
  }
}
// END_BLOCK_SYNC_VIEW_MENU_CHECKS

// START_BLOCK_WATCH_VIEW_MENU_CHECKS
// One watcher per syncable item so a toggle from ANY surface (command
// palette, title bar button, Settings window broadcast, keyboard, the
// native menu item itself) pushes exactly one mt_menu_set_checked for
// the item that changed. Call from the editor page's setup (app.vue) so
// the watchers share the component's effect scope and are disposed on
// unmount; the Settings window never mounts this. Returns the stop
// functions for manual teardown (tests).
export const watchViewMenuChecks = () => {
  const stores = {
    layout: useLayoutStore(),
    preferences: usePreferencesStore()
  }
  return VIEW_MENU_CHECK_ITEMS.map(({ id, store, key }) =>
    watch(
      () => !!stores[store][key],
      (checked) => {
        void pushViewMenuCheck(id, checked)
      }
    )
  )
}
// END_BLOCK_WATCH_VIEW_MENU_CHECKS
