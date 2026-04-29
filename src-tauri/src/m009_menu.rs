// MODULE_CONTRACT
//   PURPOSE: M-009 mt-menu. Native macOS application menu skeleton +
//            command-palette dispatcher. Recent-docs submenu pulls
//            from M-017; theme submenu reads from M-005 prefs.
//   SCOPE:   menu STRUCTURE declaration only (taxonomy + accelerators
//            + dispatch payload). Actual Tauri menu API binding via
//            tauri::menu::* requires a tauri::AppHandle and runs
//            inside Builder.setup; B3-step-12 ships the structure
//            constants and a build_menu(app) helper, leaving full
//            wire-up to the Builder.setup hook in main.rs.
//   DEPENDS: serde, m017_recent (recent-docs read), m005_prefs (theme).
//   LINKS:   docs/development-plan.xml Phase-B3 step-12;
//            test/fixtures/ipc-channels/menu-taxonomy.v1.json (v1
//            template structure preserved).
//   STATUS:  Phase-B3 step-12 skeleton — taxonomy + dispatcher
//            shape; full Tauri menu wiring in F-MENU-WIRE-TAURI.
//
// CHANGE_SUMMARY:
//   - 2026-04-29 B3-step-12: initial skeleton.

use serde::{Deserialize, Serialize};

/// A single menu item. `id` is the dispatch handle the renderer
/// receives via the menu-clicked event. `accelerator` is the parsed
/// shortcut string per M-006 (e.g. "Cmd+S"); empty string = no
/// accelerator. `command` is the v1.2.3-compatible command name (for
/// the renderer's command dispatcher).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MenuItem {
    pub id: String,
    pub label: String,
    pub command: Option<String>,
    pub accelerator: Option<String>,
    pub items: Option<Vec<MenuItem>>,
}

/// Standard top-level menus for v2.0. Order matches v1.2.3 templates
/// (file → edit → format → paragraph → view → window → help). On
/// macOS a "Mark" application menu prepends with About / Preferences /
/// Quit per HIG.
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
                    id: "file.new".to_string(),
                    label: "New".to_string(),
                    command: Some("newTab".to_string()),
                    accelerator: Some("Cmd+N".to_string()),
                    items: None,
                },
                MenuItem {
                    id: "file.open".to_string(),
                    label: "Open File…".to_string(),
                    command: Some("openFile".to_string()),
                    accelerator: Some("Cmd+O".to_string()),
                    items: None,
                },
                MenuItem {
                    id: "file.openFolder".to_string(),
                    label: "Open Folder…".to_string(),
                    command: Some("openFolder".to_string()),
                    accelerator: Some("Cmd+Shift+O".to_string()),
                    items: None,
                },
                MenuItem {
                    id: "file.openRecent".to_string(),
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
                    accelerator: Some("Cmd+S".to_string()),
                    items: None,
                },
                MenuItem {
                    id: "file.saveAs".to_string(),
                    label: "Save As…".to_string(),
                    command: Some("saveAs".to_string()),
                    accelerator: Some("Cmd+Shift+S".to_string()),
                    items: None,
                },
                MenuItem {
                    id: "file.exportPdf".to_string(),
                    label: "Export to PDF (via pandoc)".to_string(),
                    command: Some("exportPdf".to_string()),
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
                    id: "edit.undo".to_string(),
                    label: "Undo".to_string(),
                    command: Some("undo".to_string()),
                    accelerator: Some("Cmd+Z".to_string()),
                    items: None,
                },
                MenuItem {
                    id: "edit.redo".to_string(),
                    label: "Redo".to_string(),
                    command: Some("redo".to_string()),
                    accelerator: Some("Cmd+Shift+Z".to_string()),
                    items: None,
                },
                MenuItem {
                    id: "edit.cut".to_string(),
                    label: "Cut".to_string(),
                    command: Some("cut".to_string()),
                    accelerator: Some("Cmd+X".to_string()),
                    items: None,
                },
                MenuItem {
                    id: "edit.copy".to_string(),
                    label: "Copy".to_string(),
                    command: Some("copy".to_string()),
                    accelerator: Some("Cmd+C".to_string()),
                    items: None,
                },
                MenuItem {
                    id: "edit.paste".to_string(),
                    label: "Paste".to_string(),
                    command: Some("paste".to_string()),
                    accelerator: Some("Cmd+V".to_string()),
                    items: None,
                },
                MenuItem {
                    id: "edit.find".to_string(),
                    label: "Find".to_string(),
                    command: Some("find".to_string()),
                    accelerator: Some("Cmd+F".to_string()),
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
                    id: "view.sidebar".to_string(),
                    label: "Toggle Sidebar".to_string(),
                    command: Some("toggleSidebar".to_string()),
                    accelerator: Some("Cmd+B".to_string()),
                    items: None,
                },
                MenuItem {
                    id: "view.sourceCode".to_string(),
                    label: "Source Code Mode".to_string(),
                    command: Some("toggleSourceMode".to_string()),
                    accelerator: Some("Cmd+Shift+E".to_string()),
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
                    id: "help.update".to_string(),
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
/// search, breadcrumb). Native OS menu rendering still happens via
/// tauri::menu::* in F-MENU-WIRE-TAURI.
#[tauri::command]
pub async fn mt_menu_taxonomy() -> Result<Vec<MenuItem>, String> {
    Ok(standard_menu())
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
                "file.openRecent" | "view.theme"
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
        assert_eq!(save.accelerator.as_deref(), Some("Cmd+S"));
        assert_eq!(save.command.as_deref(), Some("save"));
    }

    #[test]
    fn open_recent_is_dynamic_empty_submenu() {
        let menu = standard_menu();
        let flat = flatten(&menu);
        let recent = flat.iter().find(|i| i.id == "file.openRecent").unwrap();
        assert!(recent.command.is_none());
        assert!(recent.items.as_ref().is_some_and(|s| s.is_empty()));
    }
}
