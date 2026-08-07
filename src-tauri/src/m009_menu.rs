// FILE: src-tauri/src/m009_menu.rs
// VERSION: 2.1.1-beta
// START_MODULE_CONTRACT
//   PURPOSE: M-009 mt-menu. Native macOS application menu + command-id
//            taxonomy for the renderer's command palette / sidebar /
//            breadcrumb. Native menu wires accelerators (Cmd+S etc) +
//            emits MenuInvoked → renderer dispatch via `mt::menu-invoked`.
//   SCOPE:   (a) MenuItem taxonomy data (legacy mt_menu_taxonomy IPC
//            for future renderer consumers), (b) build_native_menu —
//            constructs the Tauri Menu<R> using tauri::menu::* and
//            returns it for main.rs to wire into Builder.setup +
//            on_menu_event. Edit basics (cut/copy/paste/undo/redo/
//            select-all) use Tauri predefined items so the macOS
//            responder chain handles them in the WebView; only Find /
//            Replace / Find-in-Folder are custom dispatched; (c) dynamic
//            renderer-requested native context menus return the selected
//            renderer item id without leaking their events onto the global
//            application-menu bus.
//   DEPENDS: serde, tauri (Runtime, AppHandle, menu::* in target build).
//   LINKS:   docs/development-plan.xml M-009; docs/knowledge-graph.xml
//            M-009; docs/verification-plan.xml V-M-009. Renderer command
//            registry: src/renderer/src/commands/index.js (id contract).
//   STATUS:  shipped — native app and dynamic context menus wired.
//   LOG MARKERS: [Menu][build][BLOCK_BUILD_NATIVE_MENU] count=N (in main.rs);
//                [Menu][on_event][BLOCK_DISPATCH] menu_id=… (in main.rs);
//                [Menu][context][BLOCK_CONTEXT_MENU_RESULT] selected=… .
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   MenuItem - Declarative application-menu taxonomy entry.
//   ContextMenuItemSpec - Validated renderer payload for a native context-menu row.
//   standard_menu - Returns the renderer-facing application-menu taxonomy.
//   mt_menu_taxonomy - Exposes the application-menu taxonomy through Tauri IPC.
//   build_native_menu - Builds the installed native application menu.
//   mt_window_popup_app_menu - Opens the installed application menu at renderer coordinates.
//   mt_window_popup_context_menu - Opens a dynamic native context menu and returns the selected public id.
//   capture_context_menu_selection - Diverts dynamic context-menu events from the global app-menu bus.
//   mt_update_line_ending_menu - Synchronizes native LF/CRLF checked state for the active document.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-04-29 B3-step-12: initial skeleton.
//   - 2026-05-08 B4-pre-alpha-step-1: build_native_menu + Tauri menu.
//                Renamed ids to dashed convention to match renderer
//                command registry (file.new → file.new-tab etc) so
//                the menu-bridge in renderer can dispatch by id
//                without translation. Predefined edit basics use
//                Tauri SubmenuBuilder helpers.
//   - 2026-08-07 v2.1.1-beta: implement renderer-requested native
//                context menus and return the selected item id.
// END_CHANGE_SUMMARY

use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};

const MT_CONTEXT_MENU_INVALID: &str = "MT_CONTEXT_MENU_INVALID";
const MT_CONTEXT_MENU_POPUP_FAILED: &str = "MT_CONTEXT_MENU_POPUP_FAILED";
const CONTEXT_MENU_EVENT_PREFIX: &str = "__mt_context__:";

static NEXT_CONTEXT_MENU_TOKEN: AtomicU64 = AtomicU64::new(1);
static PENDING_CONTEXT_MENUS: OnceLock<Mutex<HashMap<u64, PendingContextMenu>>> = OnceLock::new();

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ContextMenuItemSpec {
    pub id: Option<String>,
    pub label: Option<String>,
    #[serde(rename = "type")]
    pub item_type: Option<String>,
    pub enabled: Option<bool>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum ValidatedContextMenuItem {
    Item {
        id: String,
        label: String,
        enabled: bool,
    },
    Separator,
}

#[derive(Debug)]
struct PendingContextMenu {
    public_ids: Vec<String>,
    selected: Option<String>,
}

fn pending_context_menus() -> &'static Mutex<HashMap<u64, PendingContextMenu>> {
    PENDING_CONTEXT_MENUS.get_or_init(|| Mutex::new(HashMap::new()))
}

// START_CONTRACT: validate_context_menu_items
//   PURPOSE: Reject malformed or ambiguous renderer context-menu payloads before any native UI is built.
//   INPUTS: { items: Vec<ContextMenuItemSpec> - untrusted renderer menu rows }
//   OUTPUTS: { Result<Vec<ValidatedContextMenuItem>, String> - normalized native-menu rows or MT_CONTEXT_MENU_INVALID }
//   SIDE_EFFECTS: none
//   LINKS: docs/verification-plan.xml V-M-009 scenario-11
// END_CONTRACT: validate_context_menu_items
// START_BLOCK_VALIDATE_CONTEXT_MENU
fn validate_context_menu_items(
    items: Vec<ContextMenuItemSpec>,
) -> Result<Vec<ValidatedContextMenuItem>, String> {
    let mut validated = Vec::with_capacity(items.len());
    let mut seen_ids = HashSet::new();
    let mut actionable_count = 0usize;

    for item in items {
        if item.item_type.as_deref() == Some("separator") {
            validated.push(ValidatedContextMenuItem::Separator);
            continue;
        }
        if item.item_type.is_some() {
            return Err(format!(
                "{MT_CONTEXT_MENU_INVALID}: unsupported context-menu item type"
            ));
        }

        let id = item.id.unwrap_or_default().trim().to_string();
        let label = item.label.unwrap_or_default().trim().to_string();
        if id.is_empty() || label.is_empty() || id.len() > 128 || label.len() > 512 {
            return Err(format!(
                "{MT_CONTEXT_MENU_INVALID}: item id or label is empty or too long"
            ));
        }
        if !seen_ids.insert(id.clone()) {
            return Err(format!(
                "{MT_CONTEXT_MENU_INVALID}: duplicate context-menu item id"
            ));
        }

        actionable_count += 1;
        validated.push(ValidatedContextMenuItem::Item {
            id,
            label,
            enabled: item.enabled.unwrap_or(true),
        });
    }

    if actionable_count == 0 {
        return Err(format!(
            "{MT_CONTEXT_MENU_INVALID}: at least one actionable item is required"
        ));
    }

    Ok(validated)
}
// END_BLOCK_VALIDATE_CONTEXT_MENU

fn context_menu_native_id(token: u64, item_index: usize) -> String {
    format!("{CONTEXT_MENU_EVENT_PREFIX}{token}:{item_index}")
}

fn register_pending_context_menu(token: u64, public_ids: Vec<String>) {
    let mut pending = pending_context_menus()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    pending.insert(
        token,
        PendingContextMenu {
            public_ids,
            selected: None,
        },
    );
}

fn take_pending_context_menu(token: u64) -> Option<String> {
    let mut pending = pending_context_menus()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    pending.remove(&token).and_then(|entry| entry.selected)
}

// START_CONTRACT: capture_context_menu_selection
//   PURPOSE: Capture an internal dynamic context-menu event for its pending invoke instead of broadcasting it as an application command.
//   INPUTS: { native_id: &str - Tauri MenuId received by the global menu callback }
//   OUTPUTS: { bool - true only when the event belongs to a currently pending dynamic context menu }
//   SIDE_EFFECTS: Stores the corresponding public renderer item id in the pending-menu registry.
//   LINKS: docs/verification-plan.xml V-M-009 scenario-11
// END_CONTRACT: capture_context_menu_selection
// START_BLOCK_CAPTURE_CONTEXT_SELECTION
pub fn capture_context_menu_selection(native_id: &str) -> bool {
    let Some(encoded) = native_id.strip_prefix(CONTEXT_MENU_EVENT_PREFIX) else {
        return false;
    };
    let Some((token, item_index)) = encoded.split_once(':') else {
        return false;
    };
    let (Ok(token), Ok(item_index)) = (token.parse::<u64>(), item_index.parse::<usize>()) else {
        return false;
    };

    let mut pending = pending_context_menus()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let Some(entry) = pending.get_mut(&token) else {
        return false;
    };
    let Some(public_id) = entry.public_ids.get(item_index) else {
        return false;
    };
    entry.selected = Some(public_id.clone());
    true
}
// END_BLOCK_CAPTURE_CONTEXT_SELECTION

/// A single menu item. `id` is the dispatch handle the renderer
/// receives via the `mt::menu-invoked` event AND the command-id used
/// in `src/renderer/src/commands/index.js`. `accelerator` is the
/// shortcut string per Tauri's parser ("CmdOrCtrl+S", "Cmd+Shift+O").
/// `command` is the v1.2.3-compatible command name retained for the
/// renderer's older command dispatcher; alpha+ uses `id` directly.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MenuItem {
    pub id: String,
    pub label: String,
    pub command: Option<String>,
    pub accelerator: Option<String>,
    pub items: Option<Vec<MenuItem>>,
}

/// Standard top-level menus for v2.0. Order matches v1.2.3 templates
/// (file → edit → view → help). On macOS a "Mark" application menu
/// prepends with About / Preferences / Quit per HIG.
///
/// IDs use dashed convention so they map 1:1 to renderer command ids
/// (file.new-tab, file.open-folder, file.save-as, view.toggle-sidebar,
/// view.source-code-mode, etc) — the menu-bridge in main.js looks
/// them up directly in `src/renderer/src/commands/index.js`.
pub fn standard_menu() -> Vec<MenuItem> {
    vec![
        // macOS application menu — only on macOS.
        #[cfg(target_os = "macos")]
        MenuItem {
            id: "app".to_string(),
            label: "Mark".to_string(),
            command: None,
            accelerator: None,
            items: Some(vec![
                MenuItem {
                    id: "about".to_string(),
                    label: "About Mark".to_string(),
                    command: Some("about".to_string()),
                    accelerator: None,
                    items: None,
                },
                MenuItem {
                    id: "file.preferences".to_string(),
                    label: "Preferences…".to_string(),
                    command: Some("openPreferences".to_string()),
                    accelerator: Some("Cmd+,".to_string()),
                    items: None,
                },
                MenuItem {
                    id: "file.quit".to_string(),
                    label: "Quit Mark".to_string(),
                    command: Some("quit".to_string()),
                    accelerator: Some("Cmd+Q".to_string()),
                    items: None,
                },
            ]),
        },
        MenuItem {
            id: "file".to_string(),
            label: "File".to_string(),
            command: None,
            accelerator: None,
            items: Some(vec![
                MenuItem {
                    id: "file.new-tab".to_string(),
                    label: "New Tab".to_string(),
                    command: Some("newTab".to_string()),
                    accelerator: Some("CmdOrCtrl+N".to_string()),
                    items: None,
                },
                MenuItem {
                    id: "file.open-file".to_string(),
                    label: "Open File…".to_string(),
                    command: Some("openFile".to_string()),
                    accelerator: Some("CmdOrCtrl+O".to_string()),
                    items: None,
                },
                MenuItem {
                    id: "file.open-folder".to_string(),
                    label: "Open Folder…".to_string(),
                    command: Some("openFolder".to_string()),
                    accelerator: Some("CmdOrCtrl+Shift+O".to_string()),
                    items: None,
                },
                MenuItem {
                    id: "file.open-recent".to_string(),
                    label: "Open Recent".to_string(),
                    command: None,
                    accelerator: None,
                    // Submenu populated dynamically from M-017.
                    items: Some(vec![]),
                },
                MenuItem {
                    id: "file.save".to_string(),
                    label: "Save".to_string(),
                    command: Some("save".to_string()),
                    accelerator: Some("CmdOrCtrl+S".to_string()),
                    items: None,
                },
                MenuItem {
                    id: "file.save-as".to_string(),
                    label: "Save As…".to_string(),
                    command: Some("saveAs".to_string()),
                    accelerator: Some("CmdOrCtrl+Shift+S".to_string()),
                    items: None,
                },
                MenuItem {
                    id: "file.save-all".to_string(),
                    label: "Save All".to_string(),
                    command: Some("saveAll".to_string()),
                    accelerator: None,
                    items: None,
                },
                MenuItem {
                    id: "file.rename-file".to_string(),
                    label: "Rename…".to_string(),
                    command: Some("renameFile".to_string()),
                    accelerator: None,
                    items: None,
                },
                MenuItem {
                    id: "file.move-file".to_string(),
                    label: "Move To…".to_string(),
                    command: Some("moveFile".to_string()),
                    accelerator: None,
                    items: None,
                },
                MenuItem {
                    id: "file.close-tab".to_string(),
                    label: "Close Tab".to_string(),
                    command: Some("closeTab".to_string()),
                    accelerator: Some("CmdOrCtrl+W".to_string()),
                    items: None,
                },
                MenuItem {
                    id: "file.share".to_string(),
                    label: "Share…".to_string(),
                    command: Some("share".to_string()),
                    accelerator: None,
                    items: None,
                },
                MenuItem {
                    id: "file.print".to_string(),
                    label: "Print…".to_string(),
                    command: Some("print".to_string()),
                    accelerator: Some("CmdOrCtrl+P".to_string()),
                    items: None,
                },
                MenuItem {
                    id: "file.export-file-pdf".to_string(),
                    label: "Export to PDF…".to_string(),
                    command: Some("exportPdf".to_string()),
                    accelerator: None,
                    items: None,
                },
                MenuItem {
                    id: "file.export-file-html".to_string(),
                    label: "Export to HTML…".to_string(),
                    command: Some("exportHtml".to_string()),
                    accelerator: None,
                    items: None,
                },
            ]),
        },
        MenuItem {
            id: "edit".to_string(),
            label: "Edit".to_string(),
            command: None,
            accelerator: None,
            items: Some(vec![
                MenuItem {
                    id: "edit.select-all".to_string(),
                    label: "Select All".to_string(),
                    command: Some("selectAll".to_string()),
                    accelerator: Some("CmdOrCtrl+A".to_string()),
                    items: None,
                },
                MenuItem {
                    id: "edit.find".to_string(),
                    label: "Find".to_string(),
                    command: Some("find".to_string()),
                    accelerator: Some("CmdOrCtrl+F".to_string()),
                    items: None,
                },
                MenuItem {
                    id: "edit.find-next".to_string(),
                    label: "Find Next".to_string(),
                    command: Some("findNext".to_string()),
                    accelerator: Some("CmdOrCtrl+G".to_string()),
                    items: None,
                },
                MenuItem {
                    id: "edit.find-previous".to_string(),
                    label: "Find Previous".to_string(),
                    command: Some("findPrevious".to_string()),
                    accelerator: Some("CmdOrCtrl+Shift+G".to_string()),
                    items: None,
                },
                MenuItem {
                    id: "edit.replace".to_string(),
                    label: "Replace".to_string(),
                    command: Some("replace".to_string()),
                    accelerator: Some("CmdOrCtrl+H".to_string()),
                    items: None,
                },
                MenuItem {
                    id: "edit.find-in-folder".to_string(),
                    label: "Find in Folder".to_string(),
                    command: Some("findInFolder".to_string()),
                    accelerator: Some("CmdOrCtrl+Shift+F".to_string()),
                    items: None,
                },
            ]),
        },
        MenuItem {
            id: "view".to_string(),
            label: "View".to_string(),
            command: None,
            accelerator: None,
            items: Some(vec![
                MenuItem {
                    id: "view.toggle-sidebar".to_string(),
                    label: "Toggle Sidebar".to_string(),
                    command: Some("toggleSidebar".to_string()),
                    accelerator: Some("CmdOrCtrl+B".to_string()),
                    items: None,
                },
                MenuItem {
                    id: "view.toggle-tabbar".to_string(),
                    label: "Toggle Tab Bar".to_string(),
                    command: Some("toggleTabBar".to_string()),
                    accelerator: None,
                    items: None,
                },
                MenuItem {
                    id: "view.source-code-mode".to_string(),
                    label: "Source Code Mode".to_string(),
                    command: Some("toggleSourceMode".to_string()),
                    accelerator: Some("CmdOrCtrl+Alt+S".to_string()),
                    items: None,
                },
                MenuItem {
                    id: "view.typewriter-mode".to_string(),
                    label: "Typewriter Mode".to_string(),
                    command: Some("toggleTypewriter".to_string()),
                    accelerator: None,
                    items: None,
                },
                MenuItem {
                    id: "view.focus-mode".to_string(),
                    label: "Focus Mode".to_string(),
                    command: Some("toggleFocus".to_string()),
                    accelerator: None,
                    items: None,
                },
                MenuItem {
                    id: "view.diff-mode".to_string(),
                    label: "Diff Mode".to_string(),
                    command: Some("toggleDiffMode".to_string()),
                    accelerator: Some("CmdOrCtrl+D".to_string()),
                    items: None,
                },
                MenuItem {
                    id: "view.theme".to_string(),
                    label: "Theme".to_string(),
                    command: None,
                    accelerator: None,
                    items: Some(vec![]), // populated from prefs
                },
            ]),
        },
        MenuItem {
            id: "window".to_string(),
            label: "Window".to_string(),
            command: None,
            accelerator: None,
            items: Some(vec![
                MenuItem {
                    id: "window.minimize".to_string(),
                    label: "Minimize".to_string(),
                    command: Some("minimize".to_string()),
                    accelerator: Some("CmdOrCtrl+M".to_string()),
                    items: None,
                },
                MenuItem {
                    id: "window.toggle-full-screen".to_string(),
                    label: "Toggle Full Screen".to_string(),
                    command: Some("toggleFullScreen".to_string()),
                    accelerator: Some("Ctrl+CmdOrCtrl+F".to_string()),
                    items: None,
                },
            ]),
        },
        MenuItem {
            id: "help".to_string(),
            label: "Help".to_string(),
            command: None,
            accelerator: None,
            items: Some(vec![
                MenuItem {
                    id: "docs.user-guide".to_string(),
                    label: "Documentation".to_string(),
                    command: Some("openDocs".to_string()),
                    accelerator: None,
                    items: None,
                },
                MenuItem {
                    id: "file.check-update".to_string(),
                    label: "Check for Updates…".to_string(),
                    command: Some("checkForUpdates".to_string()),
                    accelerator: None,
                    items: None,
                },
            ]),
        },
    ]
}

/// Tauri command exposing the menu structure to the renderer. Renderer
/// uses this to build the in-window menu UI (sidebar, command palette
/// search, breadcrumb). Native OS menu rendering happens in
/// `build_native_menu`.
#[tauri::command]
pub async fn mt_menu_taxonomy() -> Result<Vec<MenuItem>, String> {
    Ok(standard_menu())
}

// ─────────────────────────────────────────────────────────────────────
// START_BLOCK build_native_menu
// PURPOSE:    Construct the Tauri Menu<R> wired to the macOS app
//             menu bar (and falls back to in-window menu on Linux/
//             Windows). Wire this from main.rs setup() via
//             app.set_menu(menu)?.
// MENU EVENTS: each .item() with `with_id(...)` becomes a MenuId that
//             on_menu_event will receive; main.rs forwards by id via
//             `mt::menu-invoked` event broadcast.
// EDIT BASICS: cut/copy/paste/undo/redo/select-all use Tauri
//             SubmenuBuilder predefined helpers — they route through
//             the macOS responder chain so the WebView gets the
//             keypress for free (no IPC round-trip).
// ─────────────────────────────────────────────────────────────────────

/// Build the native application menu. Call once in Builder.setup with
/// `app.set_menu(m009_menu::build_native_menu(app.handle())?)`.
///
/// Returns a `Menu<R>` ready to be installed. Errors propagate from
/// MenuItemBuilder/SubmenuBuilder construction (rare — typically
/// indicates a Tauri runtime startup problem).
pub fn build_native_menu<R: tauri::Runtime>(
    handle: &tauri::AppHandle<R>,
) -> tauri::Result<tauri::menu::Menu<R>> {
    use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};

    // ── File menu ────────────────────────────────────────────────────
    let file_submenu = SubmenuBuilder::new(handle, "File")
        .item(
            &MenuItemBuilder::with_id("file.new-tab", "New Tab")
                .accelerator("CmdOrCtrl+N")
                .build(handle)?,
        )
        .item(
            &MenuItemBuilder::with_id("file.open-file", "Open File…")
                .accelerator("CmdOrCtrl+O")
                .build(handle)?,
        )
        .item(
            &MenuItemBuilder::with_id("file.open-folder", "Open Folder…")
                .accelerator("CmdOrCtrl+Shift+O")
                .build(handle)?,
        )
        .separator()
        .item(
            &MenuItemBuilder::with_id("file.save", "Save")
                .accelerator("CmdOrCtrl+S")
                .build(handle)?,
        )
        .item(
            &MenuItemBuilder::with_id("file.save-as", "Save As…")
                .accelerator("CmdOrCtrl+Shift+S")
                .build(handle)?,
        )
        .item(
            &MenuItemBuilder::with_id("file.save-all", "Save All")
                .build(handle)?,
        )
        .separator()
        .item(
            &MenuItemBuilder::with_id("file.rename-file", "Rename…")
                .build(handle)?,
        )
        .item(
            &MenuItemBuilder::with_id("file.move-file", "Move To…")
                .build(handle)?,
        )
        .separator()
        .item(
            &MenuItemBuilder::with_id("file.close-tab", "Close Tab")
                .accelerator("CmdOrCtrl+W")
                .build(handle)?,
        )
        .item(
            &MenuItemBuilder::with_id("file.share", "Share…")
                .build(handle)?,
        )
        .separator()
        .item(
            &MenuItemBuilder::with_id("file.print", "Print…")
                .accelerator("CmdOrCtrl+P")
                .build(handle)?,
        )
        .item(
            &MenuItemBuilder::with_id("file.export-file-pdf", "Export to PDF…")
                .build(handle)?,
        )
        .item(
            &MenuItemBuilder::with_id("file.export-file-html", "Export to HTML…")
                .build(handle)?,
        )
        .separator()
        .item(
            &SubmenuBuilder::new(handle, "Line Ending")
                .item(
                    &tauri::menu::CheckMenuItemBuilder::with_id("file.line-ending-lf", "LF")
                        .checked(true)
                        .build(handle)?,
                )
                .item(
                    &tauri::menu::CheckMenuItemBuilder::with_id("file.line-ending-crlf", "CRLF")
                        .checked(false)
                        .build(handle)?,
                )
                .build()?,
        )
        .build()?;

    // ── Edit menu (predefined items handle clipboard/undo via OS) ────
    let edit_submenu = SubmenuBuilder::new(handle, "Edit")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .item(
            &MenuItemBuilder::with_id("edit.select-all", "Select All")
                .accelerator("CmdOrCtrl+A")
                .build(handle)?,
        )
        .separator()
        .item(
            &MenuItemBuilder::with_id("edit.find", "Find")
                .accelerator("CmdOrCtrl+F")
                .build(handle)?,
        )
        .item(
            &MenuItemBuilder::with_id("edit.find-next", "Find Next")
                .accelerator("CmdOrCtrl+G")
                .build(handle)?,
        )
        .item(
            &MenuItemBuilder::with_id("edit.find-previous", "Find Previous")
                .accelerator("CmdOrCtrl+Shift+G")
                .build(handle)?,
        )
        .item(
            &MenuItemBuilder::with_id("edit.replace", "Replace")
                .accelerator("CmdOrCtrl+H")
                .build(handle)?,
        )
        .item(
            &MenuItemBuilder::with_id("edit.find-in-folder", "Find in Folder")
                .accelerator("CmdOrCtrl+Shift+F")
                .build(handle)?,
        )
        .build()?;

    // ── View menu ────────────────────────────────────────────────────
    let theme_submenu = SubmenuBuilder::new(handle, "Theme")
        .items(&[
            &MenuItemBuilder::with_id("window.change-theme-light", "Cadmium Light").build(handle)?,
            &MenuItemBuilder::with_id("window.change-theme-graphite", "Graphite").build(handle)?,
            &MenuItemBuilder::with_id("window.change-theme-ulysses", "Ulysses").build(handle)?,
            &MenuItemBuilder::with_id("window.change-theme-ayu-light", "Ayu Light").build(handle)?,
            &MenuItemBuilder::with_id("window.change-theme-catppuccin-latte", "Catppuccin Latte").build(handle)?,
            &MenuItemBuilder::with_id("window.change-theme-everforest-light", "Everforest Light").build(handle)?,
            &MenuItemBuilder::with_id("window.change-theme-gruvbox-light", "Gruvbox Light").build(handle)?,
            &MenuItemBuilder::with_id("window.change-theme-rose-pine-dawn", "Rosé Pine Dawn").build(handle)?,
            &MenuItemBuilder::with_id("window.change-theme-solarized-light", "Solarized Light").build(handle)?,
            &MenuItemBuilder::with_id("window.change-theme-tokyo-night-light", "Tokyo Night Light").build(handle)?,
        ])
        .separator()
        .items(&[
            &MenuItemBuilder::with_id("window.change-theme-dark", "Dark").build(handle)?,
            &MenuItemBuilder::with_id("window.change-theme-material-dark", "Material Dark").build(handle)?,
            &MenuItemBuilder::with_id("window.change-theme-one-dark", "One Dark").build(handle)?,
            &MenuItemBuilder::with_id("window.change-theme-ayu-dark", "Ayu Dark").build(handle)?,
            &MenuItemBuilder::with_id("window.change-theme-ayu-mirage", "Ayu Mirage").build(handle)?,
            &MenuItemBuilder::with_id("window.change-theme-catppuccin-mocha", "Catppuccin Mocha").build(handle)?,
            &MenuItemBuilder::with_id("window.change-theme-cyberdream", "Cyberdream").build(handle)?,
            &MenuItemBuilder::with_id("window.change-theme-dracula", "Dracula").build(handle)?,
            &MenuItemBuilder::with_id("window.change-theme-everforest-dark", "Everforest Dark").build(handle)?,
            &MenuItemBuilder::with_id("window.change-theme-gruvbox-dark", "Gruvbox Dark").build(handle)?,
            &MenuItemBuilder::with_id("window.change-theme-horizon-dark", "Horizon Dark").build(handle)?,
            &MenuItemBuilder::with_id("window.change-theme-kanagawa", "Kanagawa").build(handle)?,
            &MenuItemBuilder::with_id("window.change-theme-monokai-pro", "Monokai Pro").build(handle)?,
            &MenuItemBuilder::with_id("window.change-theme-nightfox", "Nightfox").build(handle)?,
            &MenuItemBuilder::with_id("window.change-theme-nord", "Nord").build(handle)?,
            &MenuItemBuilder::with_id("window.change-theme-oxocarbon-dark", "Oxocarbon Dark").build(handle)?,
            &MenuItemBuilder::with_id("window.change-theme-palenight", "Palenight").build(handle)?,
            &MenuItemBuilder::with_id("window.change-theme-rose-pine", "Rosé Pine").build(handle)?,
            &MenuItemBuilder::with_id("window.change-theme-rose-pine-moon", "Rosé Pine Moon").build(handle)?,
            &MenuItemBuilder::with_id("window.change-theme-solarized-dark", "Solarized Dark").build(handle)?,
            &MenuItemBuilder::with_id("window.change-theme-synthwave-84", "Synthwave '84").build(handle)?,
            &MenuItemBuilder::with_id("window.change-theme-tokyo-night", "Tokyo Night").build(handle)?,
            &MenuItemBuilder::with_id("window.change-theme-tokyo-night-storm", "Tokyo Night Storm").build(handle)?,
        ])
        .build()?;

    let view_submenu = SubmenuBuilder::new(handle, "View")
        .item(
            &tauri::menu::CheckMenuItemBuilder::with_id("view.toggle-sidebar", "Toggle Sidebar")
                .checked(true)
                .accelerator("CmdOrCtrl+B")
                .build(handle)?,
        )
        .item(
            &tauri::menu::CheckMenuItemBuilder::with_id("view.toggle-tabbar", "Toggle Tab Bar")
                .checked(true)
                .build(handle)?,
        )
        .separator()
        .item(
            &MenuItemBuilder::with_id("view.source-code-mode", "Source Code Mode")
                .accelerator("CmdOrCtrl+Alt+S")
                .build(handle)?,
        )
        .item(
            &MenuItemBuilder::with_id("view.typewriter-mode", "Typewriter Mode")
                .build(handle)?,
        )
        .item(
            &MenuItemBuilder::with_id("view.focus-mode", "Focus Mode")
                .build(handle)?,
        )
        .item(
            &MenuItemBuilder::with_id("view.diff-mode", "Diff Mode")
                .accelerator("CmdOrCtrl+D")
                .build(handle)?,
        )
        .separator()
        .item(&theme_submenu)
        .build()?;

    // ── Window menu ──────────────────────────────────────────────────
    let window_submenu = SubmenuBuilder::new(handle, "Window")
        .item(
            &MenuItemBuilder::with_id("window.minimize", "Minimize")
                .accelerator("CmdOrCtrl+M")
                .build(handle)?,
        )
        .item(
            &MenuItemBuilder::with_id("window.toggle-full-screen", "Toggle Full Screen")
                .accelerator("Ctrl+CmdOrCtrl+F")
                .build(handle)?,
        )
        .build()?;

    // ── Help menu ────────────────────────────────────────────────────
    let version_label = format!("Version {}", env!("CARGO_PKG_VERSION"));
    let help_submenu = SubmenuBuilder::new(handle, "Help")
        .text("help.version", &version_label)
        .separator()
        .item(&MenuItemBuilder::with_id("docs.user-guide", "Documentation").build(handle)?)
        .item(
            &MenuItemBuilder::with_id("file.check-update", "Check for Updates…")
                .build(handle)?,
        )
        .build()?;

    // ── Top-level builder; macOS prepends app menu ───────────────────
    let mut top = MenuBuilder::new(handle);

    #[cfg(target_os = "macos")]
    {
        // IDs use renderer-command convention so menu-bridge dispatches
        // them via the existing static command list. Tauri's predefined
        // .about() / .quit() are NOT used here because we want clicks
        // routed through MenuInvoked → renderer (consistent dispatch
        // path for telemetry + extensibility).
        let app_submenu = SubmenuBuilder::new(handle, "Mark")
            .item(&MenuItemBuilder::with_id("about", "About Mark").build(handle)?)
            .separator()
            .item(
                &MenuItemBuilder::with_id("file.preferences", "Preferences…")
                    .accelerator("Cmd+,")
                    .build(handle)?,
            )
            .separator()
            .services()
            .separator()
            .hide()
            .hide_others()
            .show_all()
            .separator()
            // Path B-clean W4: use Tauri's predefined `.quit()` so macOS
            // Cmd+Q routes through NSApp's standard responder chain
            // instead of needing our menu accelerator. Custom id was
            // ignored by macOS (Cmd+Q is system-reserved without a
            // predefined Quit menu item). Each window's CloseRequested
            // still fires before NSApp terminate, so the dirty-tab
            // dialog in m001_save_close.wire_close_handler runs.
            .quit()
            .build()?;
        top = top.item(&app_submenu);
    }

    top.item(&file_submenu)
        .item(&edit_submenu)
        .item(&view_submenu)
        .item(&window_submenu)
        .item(&help_submenu)
        .build()
}

// END_BLOCK build_native_menu

#[tauri::command]
pub async fn mt_window_popup_app_menu(
    app: tauri::AppHandle,
    window: tauri::Window,
    x: f64,
    y: f64,
) -> Result<(), String> {
    use tauri::menu::{ContextMenu, Menu};
    use tauri::{LogicalPosition, Position};

    let menu: Menu<tauri::Wry> = app.menu().ok_or("no app menu set")?;
    let pos = Position::Logical(LogicalPosition::new(x, y));
    menu.popup_at(window, pos)
        .map_err(|e| format!("popup failed: {e}"))
}

// START_CONTRACT: mt_window_popup_context_menu
//   PURPOSE: Build and show a native context menu requested by the renderer, then return only the selected renderer-facing item id.
//   INPUTS: { app: AppHandle - Tauri menu owner; window: Window - popup target; items: Vec<ContextMenuItemSpec> - rows; x/y: f64 - logical client coordinates }
//   OUTPUTS: { Result<Option<String>, String> - selected public id, null on dismissal, or a stable MT_CONTEXT_MENU_* error }
//   SIDE_EFFECTS: Shows native UI and temporarily registers internal MenuIds until the popup closes.
//   LINKS: docs/development-plan.xml M-009.fn-window_popup_context_menu; docs/verification-plan.xml V-M-009 scenario-11
// END_CONTRACT: mt_window_popup_context_menu
// START_BLOCK_POPUP_CONTEXT_MENU
#[tauri::command]
pub async fn mt_window_popup_context_menu(
    app: tauri::AppHandle,
    window: tauri::Window,
    items: Vec<ContextMenuItemSpec>,
    x: f64,
    y: f64,
) -> Result<Option<String>, String> {
    use tauri::menu::{ContextMenu, Menu, MenuItemBuilder, PredefinedMenuItem};
    use tauri::{LogicalPosition, Position};

    let validated = validate_context_menu_items(items)?;
    let token = NEXT_CONTEXT_MENU_TOKEN.fetch_add(1, Ordering::Relaxed);
    let menu = Menu::new(&app)
        .map_err(|error| format!("{MT_CONTEXT_MENU_POPUP_FAILED}: {error}"))?;
    let mut public_ids = Vec::new();

    for item in validated {
        match item {
            ValidatedContextMenuItem::Separator => {
                let separator = PredefinedMenuItem::separator(&app)
                    .map_err(|error| format!("{MT_CONTEXT_MENU_POPUP_FAILED}: {error}"))?;
                menu.append(&separator)
                    .map_err(|error| format!("{MT_CONTEXT_MENU_POPUP_FAILED}: {error}"))?;
            }
            ValidatedContextMenuItem::Item { id, label, enabled } => {
                let native_id = context_menu_native_id(token, public_ids.len());
                let native_item = MenuItemBuilder::with_id(native_id, label)
                    .enabled(enabled)
                    .build(&app)
                    .map_err(|error| format!("{MT_CONTEXT_MENU_POPUP_FAILED}: {error}"))?;
                menu.append(&native_item)
                    .map_err(|error| format!("{MT_CONTEXT_MENU_POPUP_FAILED}: {error}"))?;
                public_ids.push(id);
            }
        }
    }

    register_pending_context_menu(token, public_ids);
    let position = Position::Logical(LogicalPosition::new(x.max(0.0), y.max(0.0)));
    let popup_result = menu.popup_at(window, position);
    let selected = take_pending_context_menu(token);
    popup_result.map_err(|error| format!("{MT_CONTEXT_MENU_POPUP_FAILED}: {error}"))?;

    safe_eprintln!(
        "[Menu][context][BLOCK_CONTEXT_MENU_RESULT selected={}]",
        selected.is_some()
    );
    Ok(selected)
}
// END_BLOCK_POPUP_CONTEXT_MENU

#[tauri::command]
pub async fn mt_update_line_ending_menu(
    app: tauri::AppHandle,
    line_ending: String,
) -> Result<(), String> {
    use tauri::menu::MenuItemKind;
    let menu = app.menu().ok_or("no app menu")?;
    let is_lf = line_ending == "lf";
    for item in menu.items().map_err(|e| e.to_string())? {
        if let MenuItemKind::Submenu(sub) = item {
            for child in sub.items().map_err(|e| e.to_string())? {
                if let MenuItemKind::Submenu(inner) = child {
                    for inner_child in inner.items().map_err(|e| e.to_string())? {
                        if let MenuItemKind::Check(check) = inner_child {
                            let id = check.id().as_ref();
                            if id == "file.line-ending-lf" {
                                let _ = check.set_checked(is_lf);
                            } else if id == "file.line-ending-crlf" {
                                let _ = check.set_checked(!is_lf);
                            }
                        }
                    }
                }
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn flatten(items: &[MenuItem]) -> Vec<&MenuItem> {
        let mut out = Vec::new();
        fn walk<'a>(items: &'a [MenuItem], out: &mut Vec<&'a MenuItem>) {
            for it in items {
                out.push(it);
                if let Some(sub) = &it.items {
                    walk(sub, out);
                }
            }
        }
        walk(items, &mut out);
        out
    }

    #[test]
    fn standard_menu_has_top_level_groups() {
        let menu = standard_menu();
        let labels: Vec<_> = menu.iter().map(|i| i.label.as_str()).collect();
        assert!(labels.contains(&"File"));
        assert!(labels.contains(&"Edit"));
        assert!(labels.contains(&"View"));
        assert!(labels.contains(&"Help"));
    }

    #[test]
    fn no_duplicate_ids() {
        let menu = standard_menu();
        let flat = flatten(&menu);
        let mut seen = std::collections::HashSet::new();
        for item in &flat {
            assert!(
                seen.insert(item.id.clone()),
                "duplicate menu id: {}",
                item.id
            );
        }
    }

    #[test]
    fn every_leaf_has_command_or_is_dynamic_submenu() {
        // Leaf = no items OR empty items (dynamic). All leaves must have
        // a command except dynamic-submenu placeholders.
        let menu = standard_menu();
        let flat = flatten(&menu);
        for item in &flat {
            let has_static_children = item
                .items
                .as_ref()
                .map(|c| !c.is_empty())
                .unwrap_or(false);
            let dynamic_submenu = matches!(
                item.id.as_str(),
                "file.open-recent" | "view.theme"
            );
            if !has_static_children && !dynamic_submenu {
                assert!(
                    item.command.is_some(),
                    "leaf {} should have a command",
                    item.id
                );
            }
        }
    }

    #[test]
    fn save_uses_cmd_s() {
        let menu = standard_menu();
        let flat = flatten(&menu);
        let save = flat.iter().find(|i| i.id == "file.save").unwrap();
        assert_eq!(save.accelerator.as_deref(), Some("CmdOrCtrl+S"));
        assert_eq!(save.command.as_deref(), Some("save"));
    }

    #[test]
    fn open_recent_is_dynamic_empty_submenu() {
        let menu = standard_menu();
        let flat = flatten(&menu);
        let recent = flat.iter().find(|i| i.id == "file.open-recent").unwrap();
        assert!(recent.command.is_none());
        assert!(recent.items.as_ref().is_some_and(|s| s.is_empty()));
    }

    #[test]
    fn ids_use_dashed_renderer_convention() {
        // B4-pre-alpha-step-1 alignment: every menu id with a dot must
        // use dashes for multi-word segments so it matches the renderer
        // command registry verbatim (no translation layer needed).
        let menu = standard_menu();
        let flat = flatten(&menu);
        for item in &flat {
            if !item.id.contains('.') {
                continue;
            }
            // Reject camelCase: any uppercase letter after the first
            // segment indicates the legacy convention.
            for (idx, segment) in item.id.split('.').enumerate() {
                if idx == 0 {
                    continue;
                }
                assert!(
                    segment.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-'),
                    "menu id {} segment {} should be lowercase-with-dashes",
                    item.id,
                    segment
                );
            }
        }
    }

    #[test]
    fn key_alpha_blockers_present() {
        // Smoke for 2026-05-08 user-smoke regression: menu MUST have
        // Save, Open Folder, Find, and Close Tab so Cmd+S, Cmd+Shift+O,
        // Cmd+F, and Cmd+W all bind to commands the renderer dispatches.
        let menu = standard_menu();
        let flat = flatten(&menu);
        for required in &[
            "file.save",
            "file.open-folder",
            "file.open-file",
            "file.close-tab",
            "edit.find",
        ] {
            assert!(
                flat.iter().any(|i| i.id == *required),
                "menu missing required alpha-ship id: {}",
                required
            );
        }
    }

    #[test]
    fn context_menu_payload_preserves_item_separator_and_enabled_state() {
        let items = vec![
            ContextMenuItemSpec {
                id: Some("copyPath".into()),
                label: Some("Copy Path".into()),
                item_type: None,
                enabled: Some(false),
            },
            ContextMenuItemSpec {
                id: None,
                label: None,
                item_type: Some("separator".into()),
                enabled: None,
            },
        ];

        assert_eq!(
            validate_context_menu_items(items).unwrap(),
            vec![
                ValidatedContextMenuItem::Item {
                    id: "copyPath".into(),
                    label: "Copy Path".into(),
                    enabled: false,
                },
                ValidatedContextMenuItem::Separator,
            ]
        );
    }

    #[test]
    fn context_menu_payload_rejects_duplicate_ids_and_separator_only_menus() {
        let duplicate = ContextMenuItemSpec {
            id: Some("copyPath".into()),
            label: Some("Copy Path".into()),
            item_type: None,
            enabled: None,
        };
        let duplicate_error = validate_context_menu_items(vec![duplicate.clone(), duplicate])
            .unwrap_err();
        assert!(duplicate_error.starts_with(MT_CONTEXT_MENU_INVALID));
        assert!(duplicate_error.contains("duplicate"));

        let separator_error = validate_context_menu_items(vec![ContextMenuItemSpec {
            id: None,
            label: None,
            item_type: Some("separator".into()),
            enabled: None,
        }])
        .unwrap_err();
        assert!(separator_error.starts_with(MT_CONTEXT_MENU_INVALID));
        assert!(separator_error.contains("actionable"));
    }

    #[test]
    fn context_menu_event_is_captured_without_app_menu_dispatch() {
        let token = NEXT_CONTEXT_MENU_TOKEN.fetch_add(1, Ordering::Relaxed);
        register_pending_context_menu(token, vec!["copyPath".into()]);
        let native_id = context_menu_native_id(token, 0);

        assert!(capture_context_menu_selection(&native_id));
        assert_eq!(take_pending_context_menu(token).as_deref(), Some("copyPath"));
        assert!(!capture_context_menu_selection("file.save"));
        assert!(!capture_context_menu_selection(&native_id));
    }
}
