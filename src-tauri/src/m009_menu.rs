// MODULE_CONTRACT
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
//            Replace / Find-in-Folder are custom dispatched.
//   DEPENDS: serde, tauri (Runtime, AppHandle, menu::* in target build).
//   LINKS:   docs/development-plan.xml Phase-B4-pre-alpha step-1
//            (closes F-MENU-WIRE-TAURI). Renderer command registry:
//            src/renderer/src/commands/index.js (id contract).
//   STATUS:  Phase-B4-pre-alpha step-1 — native menu wired.
//   LOG MARKERS: [Menu][build][BLOCK_BUILD_NATIVE_MENU] count=N (in main.rs);
//                [Menu][on_event][BLOCK_DISPATCH] menu_id=… (in main.rs).
//
// CHANGE_SUMMARY:
//   - 2026-04-29 B3-step-12: initial skeleton.
//   - 2026-05-08 B4-pre-alpha-step-1: build_native_menu + Tauri menu.
//                Renamed ids to dashed convention to match renderer
//                command registry (file.new → file.new-tab etc) so
//                the menu-bridge in renderer can dispatch by id
//                without translation. Predefined edit basics use
//                Tauri SubmenuBuilder helpers.

use serde::{Deserialize, Serialize};

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
                    id: "app.about".to_string(),
                    label: "About Mark".to_string(),
                    command: Some("about".to_string()),
                    accelerator: None,
                    items: None,
                },
                MenuItem {
                    id: "app.preferences".to_string(),
                    label: "Preferences…".to_string(),
                    command: Some("openPreferences".to_string()),
                    accelerator: Some("Cmd+,".to_string()),
                    items: None,
                },
                MenuItem {
                    id: "app.quit".to_string(),
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
                    id: "file.close-tab".to_string(),
                    label: "Close Tab".to_string(),
                    command: Some("closeTab".to_string()),
                    accelerator: Some("CmdOrCtrl+W".to_string()),
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
                    id: "edit.find".to_string(),
                    label: "Find".to_string(),
                    command: Some("find".to_string()),
                    accelerator: Some("CmdOrCtrl+F".to_string()),
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
                    id: "view.source-code-mode".to_string(),
                    label: "Source Code Mode".to_string(),
                    command: Some("toggleSourceMode".to_string()),
                    accelerator: Some("CmdOrCtrl+Alt+S".to_string()),
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
            id: "help".to_string(),
            label: "Help".to_string(),
            command: None,
            accelerator: None,
            items: Some(vec![
                MenuItem {
                    id: "help.docs".to_string(),
                    label: "Documentation".to_string(),
                    command: Some("openDocs".to_string()),
                    accelerator: None,
                    items: None,
                },
                MenuItem {
                    id: "help.check-updates".to_string(),
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
        .separator()
        .item(
            &MenuItemBuilder::with_id("file.close-tab", "Close Tab")
                .accelerator("CmdOrCtrl+W")
                .build(handle)?,
        )
        .separator()
        .item(
            &MenuItemBuilder::with_id("file.export-file-pdf", "Export to PDF…")
                .build(handle)?,
        )
        .item(
            &MenuItemBuilder::with_id("file.export-file-html", "Export to HTML…")
                .build(handle)?,
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
        .select_all()
        .separator()
        .item(
            &MenuItemBuilder::with_id("edit.find", "Find")
                .accelerator("CmdOrCtrl+F")
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
    let view_submenu = SubmenuBuilder::new(handle, "View")
        .item(
            &MenuItemBuilder::with_id("view.toggle-sidebar", "Toggle Sidebar")
                .accelerator("CmdOrCtrl+B")
                .build(handle)?,
        )
        .item(
            &MenuItemBuilder::with_id("view.source-code-mode", "Source Code Mode")
                .accelerator("CmdOrCtrl+Alt+S")
                .build(handle)?,
        )
        .build()?;

    // ── Help menu ────────────────────────────────────────────────────
    let help_submenu = SubmenuBuilder::new(handle, "Help")
        .item(&MenuItemBuilder::with_id("help.docs", "Documentation").build(handle)?)
        .item(
            &MenuItemBuilder::with_id("help.check-updates", "Check for Updates…")
                .build(handle)?,
        )
        .build()?;

    // ── Top-level builder; macOS prepends app menu ───────────────────
    let mut top = MenuBuilder::new(handle);

    #[cfg(target_os = "macos")]
    {
        let app_submenu = SubmenuBuilder::new(handle, "Mark")
            .item(&MenuItemBuilder::with_id("app.about", "About Mark").build(handle)?)
            .separator()
            .item(
                &MenuItemBuilder::with_id("app.preferences", "Preferences…")
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
            .quit()
            .build()?;
        top = top.item(&app_submenu);
    }

    top.item(&file_submenu)
        .item(&edit_submenu)
        .item(&view_submenu)
        .item(&help_submenu)
        .build()
}

// END_BLOCK build_native_menu

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
}
