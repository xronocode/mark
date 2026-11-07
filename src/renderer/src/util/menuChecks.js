// FILE: src/renderer/src/util/menuChecks.js
// VERSION: 1.1.0
// START_MODULE_CONTRACT
//   PURPOSE: Push the effective renderer state of the native View-menu CheckMenuItems to the backend so their checkmarks always follow the real state — at boot after hydration and on every later change from any toggle surface (palette, title bar button, Settings, keyboard, the menu itself). C-40 T-005 owns the four layout/preference toggles; C-PAGE-WIDTH-TABLES T-010 adds the four Page Width preset rows whose EXACTLY-ONE-checked state follows the effective width (document entry > global setting, the pure resolveWidth tiers) for the active document.
//   SCOPE: The id→state mapping for view.toggle-sidebar / view.toggle-tabbar / view.outline / view.status-bar, the C-PAGE-WIDTH-TABLES page-width preset ids (view.page-width.compact/standard/wide/full — Custom… is a plain item, never synced), the best-effort mt_menu_set_checked push, the boot sync (syncViewMenuChecks), the per-item change watchers (watchViewMenuChecks), and the page-width re-sync on tab switch / editorLineWidth change / the panel's mt::document-page-state-changed announcement. Failures are swallowed with a warn — never break boot or toggles. The editor store and the pageWidth modules are DYNAMIC imports: store/editor.js statically imports this module and the cycle must stay one-way.
//   DEPENDS: vue (watch, onScopeDispose), @tauri-apps/api/core (dynamic import), store/layout, store/preferences, bus, store/editor + util/pageWidth + util/pageWidthStore (dynamic imports).
//   LINKS: src-tauri/src/m009_menu.rs mt_menu_set_checked + SYNCABLE_CHECK_IDS (id contract, recursive allow-listed walker); util/pageWidth.js resolveWidth/parseWidth/isFullWindowWidth (the tier maths mirrored from the editor host); util/pageWidthStore.js loadPageWidthFor; util/pageWidth.js FULL_WINDOW_WIDTH; .grace/graph/runtime.xml M-009 fn-set_app_menu_check, M-011 fn-menuChecks; .grace/verification/runtime.xml V-M-009 scenario-16, V-M-011 scenario-57; .grace/changes/archive/C-40 T-005; .grace/changes/active/C-PAGE-WIDTH-TABLES (plan T-010, spec R-13).
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   VIEW_MENU_CHECK_ITEMS - The four syncable View-menu ids with their owning store and state key.
//   PAGE_WIDTH_MENU_IDS - The four C-PAGE-WIDTH-TABLES preset check rows in menu order.
//   PAGE_WIDTH_STATE_EVENT - The panel's bus announcement the width checkmarks re-sync on.
//   viewMenuCheckStates - Current effective { id, checked } pairs for the four boolean items.
//   pageWidthMenuStates - Effective-width mapping onto the four preset rows: exactly one checked, or none when the value is Custom.
//   resolveActivePageWidth - The active document's effective width (document entry > global setting, the host's tier maths) in the resolveWidth shape.
//   pushViewMenuCheck - Best-effort mt_menu_set_checked invoke for one id (failures warn, never throw).
//   pushPageWidthMenuChecks - Re-read the active document's tier and push all four preset rows (stale-tab guard).
//   syncViewMenuChecks - Push the four boolean states plus the page-width states (boot, after preferences/layout hydrate).
//   watchViewMenuChecks - Install one change watcher per boolean item plus the page-width re-syncs; call from the editor page setup so the watchers share its effect scope. Returns the stop functions.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.1.0 - 2026-11-02 C-PAGE-WIDTH-TABLES T-010: the View ›
//   Page Width preset checkmarks follow the effective width — boot sync
//   gains the four page-width pushes, watchViewMenuChecks watches the tab
//   switch and the editorLineWidth change, and the panel's
//   mt::document-page-state-changed announcement re-syncs; the editor
//   store and the pageWidth modules ride dynamic imports (store/editor.js
//   statically imports this module).
//   v1.0.0 - 2026-10-16 C-40 T-005 (F-MENU-WIRE-TAURI
//   follow-up): the native View-menu check items were built with fixed
//   defaults and never re-synced (turn the status bar on, restart → the
//   bar is visible but View › Status Bar is unchecked), and tauri 2's
//   Menu::get never reached submenu items so mt_update_sidebar_menu
//   never worked. The backend now exposes mt_menu_set_checked
//   (recursive allow-listed walker) and the editor window pushes the
//   effective state of all four after hydration plus on every change.
// END_CHANGE_SUMMARY

import { watch, onScopeDispose, shallowRef } from 'vue'
import { useLayoutStore } from '../store/layout'
import { usePreferencesStore } from '../store/preferences'
import bus from '../bus'
import {
  isFullWindowWidth,
  parseWidth,
  resolveWidth
} from './pageWidth'

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

// START_BLOCK_PAGE_WIDTH_MENU_STATES
// C-PAGE-WIDTH-TABLES T-010 (spec R-13): the View › Page Width preset
// rows mirror the EFFECTIVE width for the active document — the same
// tier resolution the editor host applies (document entry > global
// setting; the shipped themes carry no width of their own, so the theme
// tier is null here exactly as in editor.vue applyHostPageState). A
// preset matches by exact value+unit (60/80/110 ch, the 100% Full
// window sentinel); everything else — px presets, other percents, any
// custom value — leaves all four unchecked: Custom… is the visible
// state, and it is a plain item with no checkmark of its own.
export const PAGE_WIDTH_MENU_IDS = Object.freeze([
  'view.page-width.compact',
  'view.page-width.standard',
  'view.page-width.wide',
  'view.page-width.full'
])

// The quick-settings panel's announcement (pageTab.persistAndApply /
// viewTab.saveEntry) — the width write path that must re-sync the
// checkmarks without waiting for a tab switch.
export const PAGE_WIDTH_STATE_EVENT = 'mt::document-page-state-changed'

const WIDTH_PRESET_MATCH = Object.freeze({
  'view.page-width.compact': { value: 60, unit: 'ch' },
  'view.page-width.standard': { value: 80, unit: 'ch' },
  'view.page-width.wide': { value: 110, unit: 'ch' }
})

export const pageWidthMenuStates = (resolvedWidth) => {
  const active = isFullWindowWidth(resolvedWidth)
    ? 'view.page-width.full'
    : PAGE_WIDTH_MENU_IDS.find((id) => {
        const preset = WIDTH_PRESET_MATCH[id]
        return (
          resolvedWidth &&
          preset &&
          resolvedWidth.value === preset.value &&
          resolvedWidth.unit === preset.unit
        )
      }) || null
  return PAGE_WIDTH_MENU_IDS.map((id) => ({ id, checked: id === active }))
}

// The active document's effective width, in the resolveWidth shape the
// mapping above consumes. Dynamic imports: store/editor.js statically
// imports THIS module — the cycle stays one-way (the established
// commands/index.js pattern). A failed entry read resolves to no
// document tier — a checkmark never breaks on a read error.
export const resolveActivePageWidth = async (pathname) => {
  const preferencesStore = usePreferencesStore()
  let documentEntry = null
  if (pathname) {
    try {
      const { loadPageWidthFor } = await import('./pageWidthStore')
      documentEntry = await loadPageWidthFor(pathname)
    } catch (e) {
      console.warn(`[menuChecks][resolveActivePageWidth][BLOCK_PAGE_WIDTH_MENU_STATE_FAILED]`, e)
      documentEntry = null
    }
  }
  return resolveWidth({
    document: documentEntry,
    theme: null,
    global: parseWidth(preferencesStore.editorLineWidth)
  })
}

const activePathname = async () => {
  try {
    const { useEditorStore } = await import('../store/editor')
    const file = useEditorStore().currentFile
    return (file && file.pathname) || ''
  } catch {
    return ''
  }
}

export const pushPageWidthMenuChecks = async () => {
  // Stale-tab guard: a tab switch during the store read must not push
  // the previous document's checkmarks (the host's seq-guard lesson).
  const pathnameBefore = await activePathname()
  const resolved = await resolveActivePageWidth(pathnameBefore)
  if ((await activePathname()) !== pathnameBefore) return
  for (const { id, checked } of pageWidthMenuStates(resolved)) {
    await pushViewMenuCheck(id, checked)
  }
}
// END_BLOCK_PAGE_WIDTH_MENU_STATES

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
  // C-PAGE-WIDTH-TABLES T-010: the four preset rows are built unchecked;
  // the boot push reconciles the effective value even when nothing later
  // changes (the same no-change case the boolean items pin).
  await pushPageWidthMenuChecks()
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
//
// C-PAGE-WIDTH-TABLES T-010: the page-width rows re-sync on (a) a tab
// switch or editorLineWidth change — the two reactive surfaces of the
// effective width, (b) the panel's mt::document-page-state-changed
// announcement (the write path of the Page/View tabs). The bus listener
// leaves with the same effect scope (onScopeDispose), so a remount never
// double-registers.
export const watchViewMenuChecks = () => {
  const stores = {
    layout: useLayoutStore(),
    preferences: usePreferencesStore()
  }
  const stops = VIEW_MENU_CHECK_ITEMS.map(({ id, store, key }) =>
    watch(
      () => !!stores[store][key],
      (checked) => {
        void pushViewMenuCheck(id, checked)
      }
    )
  )
  // (a) tab switch + global setting change. The editor store rides a
  // dynamic import — a static one would close the cycle store/editor.js
  // opens onto this module. The shallowRef assignment makes the watcher
  // fire once when the store lands, so the setup-time call also pushes
  // the initial effective state (no missed first tab).
  const editorBox = shallowRef(null)
  import('../store/editor')
    .then((m) => {
      editorBox.value = m.useEditorStore()
    })
    .catch(() => {
      // No editor store in this window (Settings) — the width rows stay
      // on their built defaults; nothing to sync.
    })
  stops.push(
    watch(
      () => {
        const file = editorBox.value && editorBox.value.currentFile
        return `${editorBox.value ? 'ready' : 'pending'}|${file ? file.id : ''}|${stores.preferences.editorLineWidth}`
      },
      () => {
        void pushPageWidthMenuChecks()
      }
    )
  )
  // (b) the panel's write announcement.
  const onPageStateChange = () => {
    void pushPageWidthMenuChecks()
  }
  bus.on(PAGE_WIDTH_STATE_EVENT, onPageStateChange)
  onScopeDispose(() => bus.off(PAGE_WIDTH_STATE_EVENT, onPageStateChange))
  stops.push(() => bus.off(PAGE_WIDTH_STATE_EVENT, onPageStateChange))
  return stops
}
// END_BLOCK_WATCH_VIEW_MENU_CHECKS
