// FILE: src-tauri/src/m009_menu.rs
// VERSION: 2.1.15-beta
// START_MODULE_CONTRACT
//   PURPOSE: M-009 mt-menu. Native macOS application menu + command-id
//            taxonomy for the renderer's command palette / sidebar /
//            breadcrumb. Native menu wires accelerators (Cmd+S etc) +
//            emits MenuInvoked → renderer dispatch via `mt::menu-invoked`.
//   SCOPE:   (a) MenuItem taxonomy data (legacy mt_menu_taxonomy IPC
//            for future renderer consumers), (b) build_native_menu —
//            constructs the Tauri Menu<R> using tauri::menu::* and
//            returns it for main.rs to wire into Builder.setup +
//            on_menu_event. Undo/redo use explicit renderer command IDs
//            because Muya owns history; cut/copy/paste remain Tauri
//            predefined responder-chain items; Copy as HTML (Cmd+Shift+C,
//            C-3) dispatches edit.copy-as-html for a rich text/html
//            clipboard write; Find / Replace /
//            Find-in-Folder are custom dispatched; (c) dynamic
//            renderer-requested native context menus return the selected
//            renderer item id without leaking their events onto the global
//            application-menu bus; (d) C-40 T-005 checkmark re-sync —
//            mt_menu_set_checked flips one of the four allow-listed
//            View CheckMenuItems through a RECURSIVE submenu walk
//            (tauri 2's Menu::get only matches top-level items, so the
//            old mt_update_sidebar_menu lookup never found
//            view.toggle-sidebar inside the View submenu); the walker
//            is shared with the v1-compat mt_update_sidebar_menu shim.
//   DEPENDS: serde, tauri (Runtime, AppHandle, menu::* in target build).
//   LINKS:   docs/development-plan.xml M-009; docs/knowledge-graph.xml
//            M-009; docs/verification-plan.xml V-M-009. Renderer command
//            registry: src/renderer/src/commands/index.js (id contract).
//   STATUS:  shipped — native app and dynamic context menus wired.
//   LOG MARKERS: [Menu][build][BLOCK_BUILD_NATIVE_MENU] count=N (in main.rs);
//                [Menu][on_event][BLOCK_DISPATCH] menu_id=… (in main.rs);
//                [Menu][context][BLOCK_CONTEXT_MENU_RESULT] selected=… ;
//                [menu][check][BLOCK_MENU_CHECK_SYNCED id=… checked=…] /
//                [menu][check][BLOCK_MENU_CHECK_NOT_FOUND id=…] (C-40 T-005).
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
//   set_app_menu_check - Testable core of mt_menu_set_checked: recursive allow-listed checkmark sync.
//   mt_menu_set_checked - Renderer-facing command re-syncing one View CheckMenuItem's checked state.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-10-20 FIX-010: add the macOS-only View › Command Palette…
//                row (view.command-palette, Cmd+Shift+P). The cfg guard
//                keeps Windows/Linux behavior unchanged until separately
//                authorized; renderer and native paths share the same id.
//   - 2026-10-16 C-52 T-001: add File › "Open from Clipboard"
//                (file.open-from-clipboard, Alt+CmdOrCtrl+V) to the
//                taxonomy and the native menu — dispatched by id to the
//                renderer command that resolves the clipboard through
//                m059_clipboard::mt_read_clipboard_paths.
//   - 2026-04-29 B3-step-12: initial skeleton.
//   - 2026-05-08 B4-pre-alpha-step-1: build_native_menu + Tauri menu.
//                Renamed ids to dashed convention to match renderer
//                command registry (file.new → file.new-tab etc) so
//                the menu-bridge in renderer can dispatch by id
//                without translation. Predefined edit basics use
//                Tauri SubmenuBuilder helpers.
//   - 2026-08-07 v2.1.1-beta: implement renderer-requested native
//                context menus and return the selected item id.
//   - 2026-08-07 v2.1.3-beta: route native Cmd+Z/Cmd+Shift+Z through
//                edit.undo/edit.redo so Muya history receives them.
//   - 2026-09-16 v2.1.10-beta: add Edit-menu "Copy as HTML"
//                (edit.copy-as-html, Cmd+Shift+C) for rich text/html
//                clipboard writes (C-3).
//   - 2026-09-16 v2.1.10-beta: add Window-menu "Select Next/Previous
//                Tab" (tabs.cycleForward/Backward, Ctrl+Tab /
//                Ctrl+Shift+Tab) — first keyboard binding for tab
//                cycling (C-8).
//   - 2026-09-17 C-11: context-menu roles (cut/copy/paste/select_all)
//                → PredefinedMenuItem rows with OS-localized labels and
//                responder-chain actions; role clicks are not reported
//                to JS (no pending public id).
//   - 2026-09-17 C-12: add Edit-menu "Copy as Plain Text"
//                (edit.copy-as-plain-text, CmdOrCtrl+Alt+Shift+C) for
//                markup-free plain-text clipboard writes.
//   - 2026-09-22 C-17: add Edit-menu "Format Document"
//                (edit.format-document, Shift+Alt+F) — canonicalize the
//                active markdown document (one undo step).
//   - 2026-09-23 C-19: add Edit-menu "Go to Heading…"
//                (edit.go-to-heading, CmdOrCtrl+T) — heading symbol search
//                palette over the active document.
//   - 2026-10-13 fix: dynamic context-menu clicks were sometimes lost.
//                popup_at returns when the menu closes, but the item's
//                MenuEvent reaches capture_context_menu_selection through
//                the event loop afterwards; the pending entry was already
//                taken, so the click fell through as an unknown
//                `__mt_context__:*` command (sidebar Rename/Copy did
//                nothing). The command now waits up to
//                CONTEXT_MENU_SELECTION_GRACE for the late event.
//   - 2026-10-14 C-32: add Edit-menu "Copy as Structured Text"
//                (edit.copy-as-structured-text, no accelerator).
//   - 2026-10-15 C-38 N1: rename the macOS app-menu item "Preferences…"
//                → "Settings…" (id file.preferences, Cmd+, accelerator and
//                the openPreferences command unchanged — current HIG
//                naming). The macOS titlebar gear is hidden renderer-side,
//                so Mark › Settings… ⌘, is the sole macOS Settings entry.
//   - 2026-10-15 C-41 T-001: add View-menu Theme entries "Paper" and
//                "Ink" (window.change-theme-paper/-ink) — the brand
//                defaults; ids mirror the renderer command registry.
//   - 2026-10-15 C-41 T-002: drop the 13 retired theme entries from the
//                View-menu Theme submenu (kept family members only; the
//                six C-41 T-003 members join with that task) — the
//                renderer palette drops the same ids, so menu-consistency
//                stays green; stored preferences migrate renderer-side.
//   - 2026-10-16 C-51 T-007: add the View-menu Theme entries "Docs",
//                "Docs Dark", "macOS" and "macOS Dark"
//                (window.change-theme-{docs,docs-dark,macos,macos-dark};
//                docs/macos in the light group, the -dark members in the
//                dark group) — the renderer palette gains the same four
//                subcommands, so menu-consistency stays green.
//   - 2026-10-15 C-49 T-001: add View-menu "Zoom In" / "Zoom Out" /
//                "Actual Size" (view.zoom-in/-out/actual-size,
//                CmdOrCtrl+= / - / 0) — id-dispatched to the renderer
//                commands, which run the same preferences-store zoom
//                actions as the ⌘+/⌘−/⌘0 keys (unified fontSize zoom;
//                the palette percentage zoom file.zoom-* is retired).
//   - 2026-10-15 C-40 G-3: add Help-menu "Mark Guide" (help.guide, no
//                accelerator) — opens the localized guide document as a
//                temporary untitled tab via the renderer command registry
//                (id-dispatched, like tabs.cycleForward/Backward).
//   - 2026-10-15 C-48 T-001: add Help-menu "What's New" (help.whats-new,
//                every build — reopens the sheet) and "Rate Mark…"
//                (help.rate, App Store build on macOS only, mirroring
//                the m048 review capability; opens the store review
//                page through the renderer command).
//   - 2026-10-18 C-57: add Help-menu "Support Mark…" (help.support, no
//                accelerator, desktop builds only — cfg(not(app-store)),
//                mirroring the m048 support capability) — id-dispatched
//                to the renderer command that opens ko-fi.com/xronocode
//                in the browser (store builds ship no donation surface).
//   - 2026-10-15 C-40 T-003: add View-menu "Outline" check item
//                (view.outline, no accelerator) — toggles the «On this
//                page» outline rail through the renderer command and the
//                persisted outlineRailVisible preference (default on);
//                ⌘T remains Go to Heading (edit.go-to-heading).
//   - 2026-10-15 C-40 T-004: add View-menu "Status Bar" check item
//                (view.status-bar, no accelerator, default unchecked —
//                macOS default off; the renderer resolves the per-OS
//                default) and "Lock Document" (view.lock-document, plain
//                item, no accelerator) — both id-dispatched to the
//                renderer commands of the same ids. Add Edit-menu
//                "Copy as Markdown" (edit.copy-as-markdown, no
//                accelerator) — the raw-Markdown flavor of R-2's
//                copy-document tools, also in the palette and the tab
//                context menu.
//   - 2026-10-16 C-40 T-005 (F-MENU-WIRE-TAURI follow-up): native
//                View-menu checkmarks follow the real state. New
//                mt_menu_set_checked(id, checked) command finds a
//                CheckMenuItem RECURSIVELY through submenus (tauri 2's
//                Menu::get is top-level-only, which is why the old
//                mt_update_sidebar_menu never worked — store/layout.js
//                carried it as a known stub), restricted to the four
//                view ids (sidebar, tab bar, outline, status bar) so
//                the renderer cannot flip arbitrary items. The renderer
//                pushes the effective state at boot (after preferences
//                and layout hydrate) and on every later change via
//                util/menuChecks.js; mt_update_sidebar_menu reuses the
//                same walker.
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
    /// C-11: predefined native role ("cut" | "copy" | "paste" |
    /// "select_all") — OS-localized label, native enablement, and
    /// responder-chain action; the click is not reported to JS.
    pub role: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ContextMenuRole {
    Cut,
    Copy,
    Paste,
    SelectAll,
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum ValidatedContextMenuItem {
    Item {
        id: String,
        label: String,
        enabled: bool,
    },
    Role(ContextMenuRole),
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

        // C-11: predefined roles — id/label/enabled are ignored; the OS
        // supplies the localized label and enablement.
        if let Some(role) = item.role.as_deref() {
            let role = match role {
                "cut" => ContextMenuRole::Cut,
                "copy" => ContextMenuRole::Copy,
                "paste" => ContextMenuRole::Paste,
                "select_all" => ContextMenuRole::SelectAll,
                other => {
                    return Err(format!(
                        "{MT_CONTEXT_MENU_INVALID}: unsupported context-menu role `{other}`"
                    ))
                }
            };
            actionable_count += 1;
            validated.push(ValidatedContextMenuItem::Role(role));
            continue;
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

// START_BLOCK_AWAIT_CONTEXT_SELECTION
// The selected item's MenuEvent is delivered through the event loop after
// popup_at returns, so the pending entry must outlive the popup briefly.
// A dismissed menu never gets an event and resolves after the grace period.
const CONTEXT_MENU_SELECTION_GRACE: std::time::Duration = std::time::Duration::from_millis(250);
const CONTEXT_MENU_SELECTION_POLL: std::time::Duration = std::time::Duration::from_millis(5);

fn pending_context_menu_has_selection(token: u64) -> bool {
    let pending = pending_context_menus()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    pending
        .get(&token)
        .is_some_and(|entry| entry.selected.is_some())
}

async fn await_pending_context_menu(token: u64, grace: std::time::Duration) -> Option<String> {
    let deadline = tokio::time::Instant::now() + grace;
    while !pending_context_menu_has_selection(token) && tokio::time::Instant::now() < deadline {
        tokio::time::sleep(CONTEXT_MENU_SELECTION_POLL).await;
    }
    take_pending_context_menu(token)
}
// END_BLOCK_AWAIT_CONTEXT_SELECTION

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
/// prepends with About / Settings / Quit per HIG (C-38 N1: "Settings…",
/// current macOS naming; id file.preferences unchanged).
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
                    label: "Settings…".to_string(),
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
                // C-MULTI-SOURCE-WORKSPACE: explicit Add Folder… (appends
                // a workspace root) and Replace Workspace… (replaces the
                // root set) — id-dispatched to the renderer commands of
                // the same ids like their C-40/FIX-010 siblings; the
                // overloaded single "Open Folder…" item is retired.
                MenuItem {
                    id: "file.add-folder".to_string(),
                    label: "Add Folder…".to_string(),
                    command: None,
                    accelerator: Some("CmdOrCtrl+Shift+O".to_string()),
                    items: None,
                },
                MenuItem {
                    id: "file.replace-workspace".to_string(),
                    label: "Replace Workspace…".to_string(),
                    command: None,
                    accelerator: None,
                    items: None,
                },
                // C-52 R-1: reads the clipboard — a folder opens as the
                // workspace (replace), a Markdown file opens in a tab.
                MenuItem {
                    id: "file.open-from-clipboard".to_string(),
                    label: "Open from Clipboard".to_string(),
                    command: Some("openFromClipboard".to_string()),
                    accelerator: Some("Alt+CmdOrCtrl+V".to_string()),
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
                // C-FIX-009-RECENTLY-CLOSED: taxonomy parity with the
                // built menu's File › Reopen Closed Tab.
                MenuItem {
                    id: "file.reopen-closed-tab".to_string(),
                    label: "Reopen Closed Tab".to_string(),
                    command: Some("reopenClosedTab".to_string()),
                    accelerator: Some("Shift+CmdOrCtrl+T".to_string()),
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
                // C-40 T-003: View › Outline toggles the «On this page»
                // outline rail — id-dispatched to the renderer view.outline
                // command (persisted outlineRailVisible preference). No
                // accelerator: ⌘T is Go to Heading (edit.go-to-heading).
                MenuItem {
                    id: "view.outline".to_string(),
                    label: "Outline".to_string(),
                    command: None,
                    accelerator: None,
                    items: None,
                },
                // C-40 T-004: View › Status Bar toggles the optional
                // status bar — id-dispatched to the renderer
                // view.status-bar command (persisted statusBarVisibility
                // preference; default off on macOS, on elsewhere).
                MenuItem {
                    id: "view.status-bar".to_string(),
                    label: "Status Bar".to_string(),
                    command: None,
                    accelerator: None,
                    items: None,
                },
                #[cfg(target_os = "macos")]
                MenuItem {
                    id: "view.command-palette".to_string(),
                    label: "Command Palette…".to_string(),
                    command: None,
                    accelerator: Some("Cmd+Shift+P".to_string()),
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
                    id: "view.split-view".to_string(),
                    label: "Split View".to_string(),
                    command: Some("toggleSplitView".to_string()),
                    accelerator: Some("CmdOrCtrl+Alt+\\".to_string()),
                    items: None,
                },
                // C-40 T-004: View › Lock Document toggles the per-tab
                // read-only lock — id-dispatched to the renderer
                // view.lock-document command (no accelerator; the lock
                // is also reachable from the palette and the tab
                // context menu).
                MenuItem {
                    id: "view.lock-document".to_string(),
                    label: "Lock Document".to_string(),
                    command: None,
                    accelerator: None,
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
                // C-49: unified zoom — id-dispatched only (like tab cycling):
                // the menu-bridge routes view.zoom-in/out/actual-size to the
                // renderer command registry, which runs the same preferences
                // zoom actions as the ⌘+/⌘−/⌘0 keys.
                MenuItem {
                    id: "view.zoom-in".to_string(),
                    label: "Zoom In".to_string(),
                    command: None,
                    accelerator: Some("CmdOrCtrl+=".to_string()),
                    items: None,
                },
                MenuItem {
                    id: "view.zoom-out".to_string(),
                    label: "Zoom Out".to_string(),
                    command: None,
                    accelerator: Some("CmdOrCtrl+-".to_string()),
                    items: None,
                },
                MenuItem {
                    id: "view.actual-size".to_string(),
                    label: "Actual Size".to_string(),
                    command: None,
                    accelerator: Some("CmdOrCtrl+0".to_string()),
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
                    id: "tabs.cycleForward".to_string(),
                    label: "Select Next Tab".to_string(),
                    command: None,
                    accelerator: Some("Ctrl+Tab".to_string()),
                    items: None,
                },
                MenuItem {
                    id: "tabs.cycleBackward".to_string(),
                    label: "Select Previous Tab".to_string(),
                    command: None,
                    accelerator: Some("Ctrl+Shift+Tab".to_string()),
                    items: None,
                },
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
                // C-40 G-3: opens the localized in-app guide document as a
                // temporary tab — id-dispatched only (no legacy v1 command).
                MenuItem {
                    id: "help.guide".to_string(),
                    label: "Mark Guide".to_string(),
                    command: None,
                    accelerator: None,
                    items: None,
                },
                // C-48: reopens the What's New sheet any time (all builds).
                MenuItem {
                    id: "help.whats-new".to_string(),
                    label: "What's New".to_string(),
                    command: Some("openWhatsNew".to_string()),
                    accelerator: None,
                    items: None,
                },
                // C-48: Rate Mark… — App Store build on macOS only (the
                // m048 `review` capability gates the renderer side).
                #[cfg(all(feature = "app-store", target_os = "macos"))]
                MenuItem {
                    id: "help.rate".to_string(),
                    label: "Rate Mark…".to_string(),
                    command: Some("rateMark".to_string()),
                    accelerator: None,
                    items: None,
                },
                // C-57: Support Mark… — desktop builds only (the m048
                // `support` capability gates the renderer side); opens
                // ko-fi.com/xronocode — id-dispatched only.
                #[cfg(not(feature = "app-store"))]
                MenuItem {
                    id: "help.support".to_string(),
                    label: "Support Mark…".to_string(),
                    command: None,
                    accelerator: None,
                    items: None,
                },
                #[cfg(not(feature = "app-store"))]
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
// EDIT BASICS: undo/redo use explicit IDs and renderer dispatch because
//             the macOS responder chain cannot reach Muya history;
//             cut/copy/paste remain predefined responder-chain items.
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
        // C-MULTI-SOURCE-WORKSPACE: File › Add Folder… (⌘⇧O / Ctrl+Shift+O)
        // appends a workspace root; File › Replace Workspace… replaces the
        // root set (dirty-guarded in the renderer). Both dispatch their id
        // through the renderer menu bridge.
        .item(
            &MenuItemBuilder::with_id("file.add-folder", "Add Folder…")
                .accelerator("CmdOrCtrl+Shift+O")
                .build(handle)?,
        )
        .item(
            &MenuItemBuilder::with_id("file.replace-workspace", "Replace Workspace…")
                .build(handle)?,
        )
        // C-52 R-1: File › Open from Clipboard (⌥⌘V / Ctrl+Alt+V) —
        // dispatched by id to the renderer command like its siblings.
        .item(
            &MenuItemBuilder::with_id("file.open-from-clipboard", "Open from Clipboard")
                .accelerator("Alt+CmdOrCtrl+V")
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
            // C-FIX-009-RECENTLY-CLOSED: reopens the newest closed-tab
            // history entry; the renderer command owns the empty-history
            // no-op semantics.
            &MenuItemBuilder::with_id("file.reopen-closed-tab", "Reopen Closed Tab")
                .accelerator("Shift+CmdOrCtrl+T")
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

    // ── Edit menu ────────────────────────────────────────────────────
    let edit_submenu = SubmenuBuilder::new(handle, "Edit")
        .item(
            &MenuItemBuilder::with_id("edit.undo", "Undo")
                .accelerator("CmdOrCtrl+Z")
                .build(handle)?,
        )
        .item(
            &MenuItemBuilder::with_id("edit.redo", "Redo")
                .accelerator("CmdOrCtrl+Shift+Z")
                .build(handle)?,
        )
        .separator()
        .cut()
        .copy()
        .paste()
        .item(
            &MenuItemBuilder::with_id("edit.copy-as-html", "Copy as HTML")
                .accelerator("CmdOrCtrl+Shift+C")
                .build(handle)?,
        )
        .item(
            &MenuItemBuilder::with_id("edit.copy-as-plain-text", "Copy as Plain Text")
                .accelerator("CmdOrCtrl+Alt+Shift+C")
                .build(handle)?,
        )
        .item(
            &MenuItemBuilder::with_id("edit.copy-as-structured-text", "Copy as Structured Text")
                .build(handle)?,
        )
        .item(
            // C-40 T-004: raw-Markdown clipboard write (selection or whole
            // document) — id-dispatched to the renderer command, like its
            // HTML/plain/structured siblings; no accelerator.
            &MenuItemBuilder::with_id("edit.copy-as-markdown", "Copy as Markdown")
                .build(handle)?,
        )
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
            &MenuItemBuilder::with_id("edit.go-to-heading", "Go to Heading…")
                .accelerator("CmdOrCtrl+T")
                .build(handle)?,
        )
        .item(
            &MenuItemBuilder::with_id("edit.format-document", "Format Document")
                .accelerator("Shift+Alt+F")
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
    // C-41 T-002: the theme submenu lists the kept family members only —
    // the 13 retired ids are gone (stored preferences migrate renderer-side
    // via util/themeMigration.js); the six C-41 T-003 members join with
    // that task. Ids match the renderer command registry
    // (window.change-theme-*) enforced by menu-consistency tests.
    // C-41 T-003: six new family members — one-light, alucard, nord-light,
    // kanagawa-lotus (light group), graphite-dark, ulysses-dark (dark group).
    // C-51 T-007: the Docs and macOS family members (docs, macos light;
    // docs-dark, macos-dark dark).
    let theme_submenu = SubmenuBuilder::new(handle, "Theme")
        .items(&[
            &MenuItemBuilder::with_id("window.change-theme-paper", "Paper").build(handle)?,
            &MenuItemBuilder::with_id("window.change-theme-ink", "Ink").build(handle)?,
            &MenuItemBuilder::with_id("window.change-theme-docs", "Docs").build(handle)?,
            &MenuItemBuilder::with_id("window.change-theme-macos", "macOS").build(handle)?,
            &MenuItemBuilder::with_id("window.change-theme-github", "GitHub").build(handle)?,
            &MenuItemBuilder::with_id("window.change-theme-graphite", "Graphite").build(handle)?,
            &MenuItemBuilder::with_id("window.change-theme-graphite-dark", "Graphite Dark").build(handle)?,
            &MenuItemBuilder::with_id("window.change-theme-ulysses", "Ulysses").build(handle)?,
            &MenuItemBuilder::with_id("window.change-theme-ulysses-dark", "Ulysses Dark").build(handle)?,
            &MenuItemBuilder::with_id("window.change-theme-alucard", "Alucard").build(handle)?,
            &MenuItemBuilder::with_id("window.change-theme-ayu-light", "Ayu Light").build(handle)?,
            &MenuItemBuilder::with_id("window.change-theme-catppuccin-latte", "Catppuccin Latte").build(handle)?,
            &MenuItemBuilder::with_id("window.change-theme-everforest-light", "Everforest Light").build(handle)?,
            &MenuItemBuilder::with_id("window.change-theme-gruvbox-light", "Gruvbox Light").build(handle)?,
            &MenuItemBuilder::with_id("window.change-theme-kanagawa-lotus", "Kanagawa Lotus").build(handle)?,
            &MenuItemBuilder::with_id("window.change-theme-nord-light", "Nord Light").build(handle)?,
            &MenuItemBuilder::with_id("window.change-theme-one-light", "One Light").build(handle)?,
            &MenuItemBuilder::with_id("window.change-theme-rose-pine-dawn", "Rosé Pine Dawn").build(handle)?,
            &MenuItemBuilder::with_id("window.change-theme-solarized-light", "Solarized Light").build(handle)?,
            &MenuItemBuilder::with_id("window.change-theme-tokyo-night-light", "Tokyo Night Light").build(handle)?,
        ])
        .separator()
        .items(&[
            &MenuItemBuilder::with_id("window.change-theme-docs-dark", "Docs Dark").build(handle)?,
            &MenuItemBuilder::with_id("window.change-theme-macos-dark", "macOS Dark").build(handle)?,
            &MenuItemBuilder::with_id("window.change-theme-github-dark", "GitHub Dark").build(handle)?,
            &MenuItemBuilder::with_id("window.change-theme-one-dark", "One Dark").build(handle)?,
            &MenuItemBuilder::with_id("window.change-theme-ayu-dark", "Ayu Dark").build(handle)?,
            &MenuItemBuilder::with_id("window.change-theme-catppuccin-mocha", "Catppuccin Mocha").build(handle)?,
            &MenuItemBuilder::with_id("window.change-theme-dracula", "Dracula").build(handle)?,
            &MenuItemBuilder::with_id("window.change-theme-everforest-dark", "Everforest Dark").build(handle)?,
            &MenuItemBuilder::with_id("window.change-theme-gruvbox-dark", "Gruvbox Dark").build(handle)?,
            &MenuItemBuilder::with_id("window.change-theme-kanagawa", "Kanagawa").build(handle)?,
            &MenuItemBuilder::with_id("window.change-theme-nord", "Nord").build(handle)?,
            &MenuItemBuilder::with_id("window.change-theme-rose-pine", "Rosé Pine").build(handle)?,
            &MenuItemBuilder::with_id("window.change-theme-solarized-dark", "Solarized Dark").build(handle)?,
            &MenuItemBuilder::with_id("window.change-theme-tokyo-night", "Tokyo Night").build(handle)?,
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
        .item(
            // C-40 T-003: the «On this page» outline rail (default on —
            // matches the renderer's outlineRailVisible default). The
            // checkmark re-syncs from stored prefs and later toggles via
            // mt_menu_set_checked + util/menuChecks.js (C-40 T-005, the
            // F-MENU-WIRE-TAURI follow-up). Id-dispatched to the
            // renderer view.outline command; ⌘T stays Go to Heading.
            &tauri::menu::CheckMenuItemBuilder::with_id("view.outline", "Outline")
                .checked(true)
                .build(handle)?,
        )
        .item(
            // C-40 T-004: the optional status bar. The native app menu is
            // macOS-only, where the default is off (Windows/Linux default
            // on — the renderer resolves the per-OS default). The
            // checkmark re-syncs from stored prefs and later toggles via
            // mt_menu_set_checked + util/menuChecks.js (C-40 T-005, the
            // F-MENU-WIRE-TAURI follow-up). Id-dispatched to the renderer
            // view.status-bar command.
            &tauri::menu::CheckMenuItemBuilder::with_id("view.status-bar", "Status Bar")
                .checked(false)
                .build(handle)?,
        );

    #[cfg(target_os = "macos")]
    let view_submenu = view_submenu.item(
        // FIX-010: macOS-only until the owner separately authorizes
        // Windows/Linux scope. Native and renderer paths share this id.
        &MenuItemBuilder::with_id("view.command-palette", "Command Palette…")
            .accelerator("Cmd+Shift+P")
            .build(handle)?,
    );

    let view_submenu = view_submenu
        .separator()
        .item(
            &MenuItemBuilder::with_id("view.source-code-mode", "Source Code Mode")
                .accelerator("CmdOrCtrl+Alt+S")
                .build(handle)?,
        )
        .item(
            // C-29: Split View (source + rendered side by side) for the
            // current tab. Cmd+Backslash stays the in-editor sidebar toggle.
            &MenuItemBuilder::with_id("view.split-view", "Split View")
                .accelerator("CmdOrCtrl+Alt+\\")
                .build(handle)?,
        )
        .item(
            // C-40 T-004: per-tab read-only lock. Plain item (not a check
            // item): the lock state is per-tab and lives in the renderer —
            // the tab's lock badge is the state indicator. Id-dispatched to
            // the renderer view.lock-document command.
            &MenuItemBuilder::with_id("view.lock-document", "Lock Document")
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
        // C-49: unified zoom — ids dispatch to the renderer commands
        // view.zoom-in/out/actual-size (menu-bridge → preferences store
        // zoom actions, same code as the ⌘+/⌘−/⌘0 keys). The native menu
        // claims the accelerators, so the keys never double-apply.
        .item(
            &MenuItemBuilder::with_id("view.zoom-in", "Zoom In")
                .accelerator("CmdOrCtrl+=")
                .build(handle)?,
        )
        .item(
            &MenuItemBuilder::with_id("view.zoom-out", "Zoom Out")
                .accelerator("CmdOrCtrl+-")
                .build(handle)?,
        )
        .item(
            &MenuItemBuilder::with_id("view.actual-size", "Actual Size")
                .accelerator("CmdOrCtrl+0")
                .build(handle)?,
        )
        .separator()
        .item(&theme_submenu)
        .build()?;

    // ── Window menu ──────────────────────────────────────────────────
    let window_submenu = SubmenuBuilder::new(handle, "Window")
        .item(
            &MenuItemBuilder::with_id("tabs.cycleForward", "Select Next Tab")
                .accelerator("Ctrl+Tab")
                .build(handle)?,
        )
        .item(
            &MenuItemBuilder::with_id("tabs.cycleBackward", "Select Previous Tab")
                .accelerator("Ctrl+Shift+Tab")
                .build(handle)?,
        )
        .separator()
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

    // ASC 2.4.5(vii): App Store builds hide the update item entirely.
    #[cfg(feature = "app-store")]
    fn cfg_helper_check_update<R: tauri::Runtime>(
        handle: &tauri::AppHandle<R>,
    ) -> tauri::Result<tauri::menu::MenuItem<R>> {
        MenuItemBuilder::with_id("help.update-hidden", "").build(handle)
    }
    #[cfg(not(feature = "app-store"))]
    fn cfg_helper_check_update<R: tauri::Runtime>(
        handle: &tauri::AppHandle<R>,
    ) -> tauri::Result<tauri::menu::MenuItem<R>> {
        MenuItemBuilder::with_id("file.check-update", "Check for Updates…").build(handle)
    }

    // ── Help menu ────────────────────────────────────────────────────
    // ASC 2.2: the App Store build must not surface "-beta" — take the
    // version from the tauri package info (mas.conf overlay carries the
    // clean numeric version); desktop keeps the full Cargo string.
    let version_label = {
        #[cfg(feature = "app-store")]
        {
            format!("Version {}", handle.package_info().version)
        }
        #[cfg(not(feature = "app-store"))]
        {
            format!("Version {}", env!("CARGO_PKG_VERSION"))
        }
    };
    // C-48: What's New (reopen the sheet) ships in every build; Rate
    // Mark… exists only where the system rating sheet exists (App Store
    // build on macOS — mirrors the m048 `review` capability). The cfg
    // reassignment pattern matches the macOS app-menu block below.
    #[cfg_attr(
        not(all(feature = "app-store", target_os = "macos")),
        allow(unused_mut)
    )]
    let mut help_submenu = SubmenuBuilder::new(handle, "Help")
        .text("help.version", &version_label)
        .separator()
        .item(&MenuItemBuilder::with_id("docs.user-guide", "Documentation").build(handle)?)
        // C-40 G-3: Mark Guide opens the localized guide document as a
        // temporary untitled tab in the renderer (help.guide command).
        .item(&MenuItemBuilder::with_id("help.guide", "Mark Guide").build(handle)?)
        .item(&MenuItemBuilder::with_id("help.whats-new", "What's New").build(handle)?)
        // ASC 2.4.5(vii): no update checks in the App Store build —
        // the store owns updates. Desktop keeps the in-app updater.
        .item(
            &cfg_helper_check_update(handle)?,
        );

    // C-57: Support Mark… ships only in desktop builds (the m048
    // `support` capability gates the renderer side) — no donation
    // surface in store builds.
    #[cfg(not(feature = "app-store"))]
    {
        help_submenu = help_submenu.item(
            &MenuItemBuilder::with_id("help.support", "Support Mark…").build(handle)?,
        );
    }

    #[cfg(all(feature = "app-store", target_os = "macos"))]
    {
        help_submenu = help_submenu.item(
            &MenuItemBuilder::with_id("help.rate", "Rate Mark…").build(handle)?,
        );
    }

    let help_submenu = help_submenu.build()?;

    // ── Top-level builder; macOS prepends app menu ───────────────────
    #[cfg_attr(not(target_os = "macos"), allow(unused_mut))]
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
                &MenuItemBuilder::with_id("file.preferences", "Settings…")
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
            // C-MULTI-SOURCE-WORKSPACE fix wave: CUSTOM quit item
            // dispatching the renderer's guarded file.quit (QUIT_APP —
            // Save & Quit / Don't Save / stay). The previously used
            // predefined `.quit()` was assumed to fire each window's
            // CloseRequested before terminate; probed 2026-10-22 it
            // does NOT (instant exit, zero lifecycle markers, unsaved
            // tabs dropped). The W4 note that macOS ignores a custom
            // Cmd+Q accelerator is re-tested in the fix-wave
            // verification; the click path works regardless.
            .item(
                &MenuItemBuilder::with_id("file.quit", "Quit Mark")
                    .accelerator("CmdOrCtrl+Q")
                    .build(handle)?,
            )
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
            // C-11: roles act through the responder chain (identical to
            // the Edit menu's native items) and never map to a pending
            // public id — dismissal still resolves Ok(None).
            ValidatedContextMenuItem::Role(role) => {
                let native_item = match role {
                    ContextMenuRole::Cut => PredefinedMenuItem::cut(&app, None),
                    ContextMenuRole::Copy => PredefinedMenuItem::copy(&app, None),
                    ContextMenuRole::Paste => PredefinedMenuItem::paste(&app, None),
                    ContextMenuRole::SelectAll => PredefinedMenuItem::select_all(&app, None),
                }
                .map_err(|error| format!("{MT_CONTEXT_MENU_POPUP_FAILED}: {error}"))?;
                menu.append(&native_item)
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
    let selected = if popup_result.is_ok() {
        await_pending_context_menu(token, CONTEXT_MENU_SELECTION_GRACE).await
    } else {
        take_pending_context_menu(token)
    };
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

// ─────────────────────────────────────────────────────────────────────
// C-40 T-005: View-menu checkmark re-sync (F-MENU-WIRE-TAURI follow-up)
// ─────────────────────────────────────────────────────────────────────

// START_BLOCK_MENU_CHECK_ALLOW_LIST
/// The only CheckMenuItem ids the renderer may re-sync through
/// mt_menu_set_checked. All four live in the View submenu and mirror
/// renderer state (layout store sidebar/tab bar, outlineRailVisible,
/// statusBarVisibility preferences). The allow-list keeps the recursive
/// walker from becoming a general-purpose remote control for arbitrary
/// native items (the LF/CRLF pair, future check items).
const SYNCABLE_CHECK_IDS: &[&str] = &[
    "view.toggle-sidebar",
    "view.toggle-tabbar",
    "view.outline",
    "view.status-bar",
];

fn is_syncable_check_id(id: &str) -> bool {
    SYNCABLE_CHECK_IDS.contains(&id)
}
// END_BLOCK_MENU_CHECK_ALLOW_LIST

// START_BLOCK_FIND_CHECK_ITEM_RECURSIVE
// tauri 2's Menu::get only matches TOP-LEVEL items (it iterates
// self.items() with no descent — verified against tauri-2.11.2
// src/menu/menu.rs), so every id that lives inside a submenu — all
// four syncable view ids live in View — needs this recursive walk over
// MenuItemKind::Submenu children. The walker stays thin (no item
// construction, no platform calls beyond items()/id()) so the pure
// allow-list above carries the testable policy; submenu enumeration
// errors are treated as "no children" so one broken branch cannot
// abort the whole lookup.
fn find_check_item_recursive<R: tauri::Runtime>(
    items: Vec<tauri::menu::MenuItemKind<R>>,
    id: &str,
) -> Option<tauri::menu::CheckMenuItem<R>> {
    for item in items {
        if let Some(check) = item.as_check_menuitem() {
            if check.id().as_ref() == id {
                return Some(check.clone());
            }
        }
        if let Some(submenu) = item.as_submenu() {
            if let Ok(children) = submenu.items() {
                if let Some(found) = find_check_item_recursive(children, id) {
                    return Some(found);
                }
            }
        }
    }
    None
}
// END_BLOCK_FIND_CHECK_ITEM_RECURSIVE

// START_CONTRACT: set_app_menu_check
//   PURPOSE: Locate a CheckMenuItem by id anywhere in the installed application menu and set its checked state.
//   INPUTS: { app: &AppHandle<R> - menu owner; id: &str - allow-listed CheckMenuItem id; checked: bool - new state }
//   OUTPUTS: { Result<bool, String> - Ok(true) applied; Ok(false) benign miss (no menu / id not allow-listed / no such check item, e.g. Windows/Linux hidden bar or a non-check id); Err only real menu failures }
//   SIDE_EFFECTS: Mutates the native menu item; logs BLOCK_MENU_CHECK_SYNCED / BLOCK_MENU_CHECK_NOT_FOUND.
//   LINKS: mt_menu_set_checked command; m_v1_compat::mt_update_sidebar_menu reuse; .grace/verification/runtime.xml V-M-009 scenario-16
// END_CONTRACT: set_app_menu_check
// START_BLOCK_SYNC_MENU_CHECK
pub(crate) fn set_app_menu_check<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    id: &str,
    checked: bool,
) -> Result<bool, String> {
    if !is_syncable_check_id(id) {
        safe_eprintln!("[menu][check][BLOCK_MENU_CHECK_NOT_FOUND id={id} reason=not_syncable]");
        return Ok(false);
    }
    let Some(menu) = app.menu() else {
        safe_eprintln!("[menu][check][BLOCK_MENU_CHECK_NOT_FOUND id={id} reason=no_menu]");
        return Ok(false);
    };
    let items = menu.items().map_err(|e| e.to_string())?;
    match find_check_item_recursive(items, id) {
        Some(check) => {
            check.set_checked(checked).map_err(|e| e.to_string())?;
            safe_eprintln!("[menu][check][BLOCK_MENU_CHECK_SYNCED id={id} checked={checked}]");
            Ok(true)
        }
        None => {
            safe_eprintln!("[menu][check][BLOCK_MENU_CHECK_NOT_FOUND id={id}]");
            Ok(false)
        }
    }
}
// END_BLOCK_SYNC_MENU_CHECK

// START_CONTRACT: mt_menu_set_checked
//   PURPOSE: Renderer-facing command that re-syncs one native View-menu CheckMenuItem to the real renderer state.
//   INPUTS: { id: String - CheckMenuItem id (must be one of the four view ids); checked: bool - new state }
//   OUTPUTS: { Result<bool, String> - whether the checkmark was applied (Ok(false): benign miss; Err: menu failure) }
//   SIDE_EFFECTS: Mutates the native menu item; logs the menu-check markers.
//   LINKS: util/menuChecks.js syncViewMenuChecks / pushViewMenuCheck (renderer); .grace/verification/runtime.xml V-M-009 scenario-16
// END_CONTRACT: mt_menu_set_checked
// START_BLOCK_MT_MENU_SET_CHECKED
#[tauri::command]
pub async fn mt_menu_set_checked(
    app: tauri::AppHandle,
    id: String,
    checked: bool,
) -> Result<bool, String> {
    set_app_menu_check(&app, &id, checked)
}
// END_BLOCK_MT_MENU_SET_CHECKED

#[cfg(test)]
mod tests {
    use super::*;

    fn ctx_item(id: &str, label: &str) -> ContextMenuItemSpec {
        ContextMenuItemSpec {
            id: Some(id.to_string()),
            label: Some(label.to_string()),
            item_type: None,
            enabled: None,
            role: None,
        }
    }

    fn ctx_role(role: &str) -> ContextMenuItemSpec {
        ContextMenuItemSpec {
            id: None,
            label: None,
            item_type: None,
            enabled: None,
            role: Some(role.to_string()),
        }
    }

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
            // C-8: tab-cycling leaves are id-dispatched only — they have
            // no legacy v1 command name (the menu-bridge looks them up by
            // id in the renderer command registry).
            // C-49: the zoom trio is id-dispatched the same way.
            // C-40: help.guide opens the in-app guide document via the
            // help.guide renderer command — also id-dispatched only.
            // C-40 T-003: view.outline toggles the outline rail through
            // the renderer view.outline command — id-dispatched only.
            // C-40 T-004: view.status-bar / view.lock-document toggle the
            // status bar and the per-tab lock through the renderer
            // commands of the same ids — id-dispatched only.
            // C-57: help.support opens the Ko-fi page via the renderer
            // help.support command — id-dispatched only.
            // FIX-010: the macOS-only Command Palette row dispatches its
            // view.command-palette id through the renderer menu bridge.
            // C-MULTI-SOURCE-WORKSPACE: File › Add Folder… / Replace
            // Workspace… dispatch their ids to the renderer commands of
            // the same names — id-dispatched only.
            let id_dispatched_only = matches!(
                item.id.as_str(),
                "tabs.cycleForward"
                    | "tabs.cycleBackward"
                    | "view.zoom-in"
                    | "view.zoom-out"
                    | "view.actual-size"
                    | "help.guide"
                    | "help.support"
                    | "view.command-palette"
                    | "view.outline"
                    | "view.status-bar"
                    | "view.lock-document"
                    | "file.add-folder"
                    | "file.replace-workspace"
            );
            if !has_static_children && !dynamic_submenu && !id_dispatched_only {
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
    fn view_menu_outline_item_is_id_dispatched_check_item() {
        // C-40 T-003: View › Outline toggles the «On this page» outline
        // rail. No accelerator (⌘T is Go to Heading), no legacy v1 command
        // name — the renderer menu-bridge dispatches by id to the
        // view.outline command (persisted outlineRailVisible preference).
        let menu = standard_menu();
        let flat = flatten(&menu);
        let item = flat
            .iter()
            .find(|i| i.id == "view.outline")
            .unwrap_or_else(|| panic!("menu missing view.outline"));
        assert_eq!(item.label, "Outline");
        assert!(item.command.is_none(), "view.outline must be id-dispatched only");
        assert!(item.accelerator.is_none(), "view.outline has no accelerator (⌘T is Go to Heading)");
    }

    // START_BLOCK_C40_T004_MENU_TESTS
    #[test]
    fn view_menu_status_bar_item_is_id_dispatched_check_item() {
        // C-40 T-004: View › Status Bar toggles the optional status bar
        // (persisted statusBarVisibility preference). Id-dispatched only,
        // no accelerator; the built (macOS) menu item is a CheckMenuItem
        // defaulting to unchecked (macOS default off — Windows/Linux
        // default on is resolved renderer-side).
        let menu = standard_menu();
        let flat = flatten(&menu);
        let item = flat
            .iter()
            .find(|i| i.id == "view.status-bar")
            .unwrap_or_else(|| panic!("menu missing view.status-bar"));
        assert_eq!(item.label, "Status Bar");
        assert!(item.command.is_none(), "view.status-bar must be id-dispatched only");
        assert!(item.accelerator.is_none(), "view.status-bar has no accelerator");
    }

    #[test]
    fn view_menu_lock_document_item_is_id_dispatched() {
        // C-40 T-004: View › Lock Document toggles the per-tab read-only
        // lock (renderer view.lock-document command; also palette + tab
        // context menu). Plain item — the lock state is per-tab and shown
        // by the tab's lock badge, so no check item, no accelerator.
        let menu = standard_menu();
        let flat = flatten(&menu);
        let item = flat
            .iter()
            .find(|i| i.id == "view.lock-document")
            .unwrap_or_else(|| panic!("menu missing view.lock-document"));
        assert_eq!(item.label, "Lock Document");
        assert!(item.command.is_none(), "view.lock-document must be id-dispatched only");
        assert!(item.accelerator.is_none(), "view.lock-document has no accelerator");
    }
    // END_BLOCK_C40_T004_MENU_TESTS

    #[test]
    fn view_menu_zoom_items_dispatch_by_id_with_accelerators() {
        // C-49: Zoom In / Zoom Out / Actual Size live in the View menu with
        // CmdOrCtrl+= / - / 0 accelerators. They carry no legacy v1 command
        // name — the renderer menu-bridge dispatches them by id to
        // view.zoom-in / view.zoom-out / view.actual-size, which run the
        // same preferences zoom actions as the ⌘+/⌘−/⌘0 keys.
        let menu = standard_menu();
        let flat = flatten(&menu);
        for (id, label, accelerator) in [
            ("view.zoom-in", "Zoom In", "CmdOrCtrl+="),
            ("view.zoom-out", "Zoom Out", "CmdOrCtrl+-"),
            ("view.actual-size", "Actual Size", "CmdOrCtrl+0"),
        ] {
            let item = flat
                .iter()
                .find(|i| i.id == id)
                .unwrap_or_else(|| panic!("menu missing {id}"));
            assert_eq!(item.label, label, "{id} label");
            assert_eq!(item.accelerator.as_deref(), Some(accelerator), "{id} accelerator");
            assert!(item.command.is_none(), "{id} must be id-dispatched only");
        }
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
            // C-8: tabs.cycleForward/Backward predate this convention in
            // the renderer command registry; they stay camelCase to match
            // src/renderer/src/commands/index.js verbatim for menu-bridge
            // dispatch.
            if matches!(
                item.id.as_str(),
                "tabs.cycleForward" | "tabs.cycleBackward"
            ) {
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
            "file.add-folder",
            "file.replace-workspace",
            "file.open-file",
            "file.close-tab",
            "edit.find",
        ] {
            assert!(
                flat.iter().any(|i| i.id == *required),
                "menu missing required alpha-ship id: {}",
                *required
            );
        }
    }

    // START_BLOCK_OPEN_FROM_CLIPBOARD_TEST
    // C-52 R-1: File › Open from Clipboard sits right after the folder
    // commands with the ⌥⌘V / Ctrl+Alt+V accelerator, in the taxonomy the
    // renderer command registry mirrors (the native builder adds the same
    // id). C-MULTI-SOURCE-WORKSPACE: its predecessor row became the
    // Add Folder… / Replace Workspace… pair.
    #[test]
    fn file_menu_has_open_from_clipboard_with_alt_cmd_v() {
        let menu = standard_menu();
        let flat = flatten(&menu);
        let item = flat
            .iter()
            .find(|i| i.id == "file.open-from-clipboard")
            .expect("file.open-from-clipboard must be in the taxonomy");
        assert_eq!(item.label, "Open from Clipboard");
        assert_eq!(item.accelerator.as_deref(), Some("Alt+CmdOrCtrl+V"));
        assert_eq!(item.command.as_deref(), Some("openFromClipboard"));

        // It sits directly after Replace Workspace… in the File submenu.
        let file_menu = menu
            .iter()
            .find(|m| m.id == "file")
            .and_then(|m| m.items.as_ref())
            .expect("File submenu");
        let ids: Vec<&str> = file_menu.iter().map(|i| i.id.as_str()).collect();
        let folder_idx = ids
            .iter()
            .position(|id| *id == "file.replace-workspace")
            .unwrap();
        assert_eq!(
            ids.get(folder_idx + 1),
            Some(&"file.open-from-clipboard"),
            "open-from-clipboard must follow replace-workspace"
        );
    }
    // END_BLOCK_OPEN_FROM_CLIPBOARD_TEST

    // START_BLOCK_MULTI_SOURCE_WORKSPACE_MENU_TEST
    // C-MULTI-SOURCE-WORKSPACE: File › Add Folder… (⌘⇧O / Ctrl+Shift+O,
    // appends a workspace root) and File › Replace Workspace… (no
    // accelerator, replaces the root set) — id-dispatched to the renderer
    // commands of the same ids; the overloaded single "Open Folder…" item
    // is retired everywhere in the same change.
    #[test]
    fn file_menu_has_add_folder_and_replace_workspace() {
        let menu = standard_menu();
        let flat = flatten(&menu);
        let add = flat
            .iter()
            .find(|i| i.id == "file.add-folder")
            .expect("file.add-folder must be in the taxonomy");
        assert_eq!(add.label, "Add Folder…");
        assert_eq!(add.accelerator.as_deref(), Some("CmdOrCtrl+Shift+O"));
        assert!(add.command.is_none(), "file.add-folder is id-dispatched only");

        let replace = flat
            .iter()
            .find(|i| i.id == "file.replace-workspace")
            .expect("file.replace-workspace must be in the taxonomy");
        assert_eq!(replace.label, "Replace Workspace…");
        assert!(replace.accelerator.is_none(), "replace-workspace has no accelerator in v1");
        assert!(replace.command.is_none(), "file.replace-workspace is id-dispatched only");

        assert!(
            !flat.iter().any(|i| i.id == "file.open-folder"),
            "the retired file.open-folder id must be gone"
        );

        // Order: Open File… → Add Folder… → Replace Workspace… → Open from
        // Clipboard.
        let file_menu = menu
            .iter()
            .find(|m| m.id == "file")
            .and_then(|m| m.items.as_ref())
            .expect("File submenu");
        let ids: Vec<&str> = file_menu.iter().map(|i| i.id.as_str()).collect();
        let file_idx = ids.iter().position(|id| *id == "file.open-file").unwrap();
        assert_eq!(ids.get(file_idx + 1), Some(&"file.add-folder"));
        assert_eq!(ids.get(file_idx + 2), Some(&"file.replace-workspace"));
        assert_eq!(ids.get(file_idx + 3), Some(&"file.open-from-clipboard"));
    }
    // END_BLOCK_MULTI_SOURCE_WORKSPACE_MENU_TEST

    // START_BLOCK_HELP_C48_TESTS
    // C-48: What's New is a Help leaf in EVERY build with a dispatch
    // command; Rate Mark… exists only in the App Store build on macOS
    // (mirrors the m048 `review` capability — the non-eligible builds
    // compile this test with the absence assertion).
    #[test]
    fn help_menu_has_whats_new_in_every_build() {
        let menu = standard_menu();
        let flat = flatten(&menu);
        let whats_new = flat
            .iter()
            .find(|i| i.id == "help.whats-new")
            .expect("help.whats-new must be in the taxonomy in every build");
        assert_eq!(whats_new.label, "What's New");
        assert!(whats_new.command.is_some());
        assert!(whats_new.accelerator.is_none());
    }

    #[test]
    fn help_menu_rate_mark_is_app_store_macos_only() {
        let menu = standard_menu();
        let flat = flatten(&menu);
        let has_rate = flat.iter().any(|i| i.id == "help.rate");
        #[cfg(all(feature = "app-store", target_os = "macos"))]
        {
            assert!(has_rate, "the MAS build on macOS ships Rate Mark…");
            let rate = flat.iter().find(|i| i.id == "help.rate").unwrap();
            assert_eq!(rate.label, "Rate Mark…");
            assert!(rate.command.is_some());
        }
        #[cfg(not(all(feature = "app-store", target_os = "macos")))]
        {
            assert!(
                !has_rate,
                "desktop / non-mac builds must not show Rate Mark…"
            );
        }
    }
    // END_BLOCK_HELP_C48_TESTS

    // START_BLOCK_HELP_C57_TESTS
    #[test]
    fn help_menu_support_mark_is_desktop_only() {
        // C-57: the Ko-fi support link ships only in desktop builds —
        // store builds must not show a donation surface (ASC review
        // risk). cargo test without features pins the desktop variant;
        // the MAS CI build compiles the mirror assertion.
        let menu = standard_menu();
        let flat = flatten(&menu);
        let has_support = flat.iter().any(|i| i.id == "help.support");
        #[cfg(not(feature = "app-store"))]
        {
            assert!(has_support, "desktop builds ship Support Mark…");
            let support = flat.iter().find(|i| i.id == "help.support").unwrap();
            assert_eq!(support.label, "Support Mark…");
            assert!(
                support.command.is_none(),
                "help.support is id-dispatched only"
            );
            assert!(support.accelerator.is_none());
        }
        #[cfg(feature = "app-store")]
        {
            assert!(
                !has_support,
                "store builds must not show a donation surface"
            );
        }
    }
    // END_BLOCK_HELP_C57_TESTS

    #[test]
    fn context_menu_payload_preserves_item_separator_and_enabled_state() {
        let items = vec![
            ContextMenuItemSpec {
                id: Some("copyPath".into()),
                label: Some("Copy Path".into()),
                item_type: None,
                role: None,
                enabled: Some(false),
            },
            ContextMenuItemSpec {
                id: None,
                label: None,
                item_type: Some("separator".into()),
                role: None,
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
            role: None,
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
            role: None,
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

    #[tokio::test]
    async fn context_menu_selection_arriving_after_popup_close_is_kept() {
        let token = NEXT_CONTEXT_MENU_TOKEN.fetch_add(1, Ordering::Relaxed);
        register_pending_context_menu(token, vec!["rename".into()]);
        let native_id = context_menu_native_id(token, 0);
        // The MenuEvent lands after popup_at has already returned.
        let late = tokio::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_millis(30)).await;
            capture_context_menu_selection(&native_id)
        });
        let selected = await_pending_context_menu(token, CONTEXT_MENU_SELECTION_GRACE).await;
        assert!(late.await.unwrap());
        assert_eq!(selected.as_deref(), Some("rename"));
    }

    #[tokio::test]
    async fn dismissed_context_menu_resolves_none_and_releases_entry() {
        let token = NEXT_CONTEXT_MENU_TOKEN.fetch_add(1, Ordering::Relaxed);
        register_pending_context_menu(token, vec!["rename".into()]);
        let started = std::time::Instant::now();
        let selected = await_pending_context_menu(token, std::time::Duration::from_millis(40)).await;
        assert_eq!(selected, None);
        assert!(started.elapsed() >= std::time::Duration::from_millis(40));
        // A click event arriving after the grace window is no longer captured.
        assert!(!capture_context_menu_selection(&context_menu_native_id(token, 0)));
    }

    #[test]
    fn context_menu_roles_validate_and_count_as_actionable() {
        // C-11: every whitelisted role validates without id/label and
        // alone satisfies the at-least-one-actionable rule.
        let validated = validate_context_menu_items(vec![
            ctx_role("cut"),
            ctx_role("copy"),
            ctx_role("paste"),
            ctx_role("select_all"),
        ])
        .expect("roles must validate");
        assert_eq!(
            validated,
            vec![
                ValidatedContextMenuItem::Role(ContextMenuRole::Cut),
                ValidatedContextMenuItem::Role(ContextMenuRole::Copy),
                ValidatedContextMenuItem::Role(ContextMenuRole::Paste),
                ValidatedContextMenuItem::Role(ContextMenuRole::SelectAll),
            ]
        );
    }

    #[test]
    fn context_menu_unknown_role_rejected() {
        let err = validate_context_menu_items(vec![ctx_role("undo")])
            .expect_err("undo is deliberately not a role (Muya history owns it)");
        assert!(err.contains(MT_CONTEXT_MENU_INVALID));
        assert!(err.contains("unsupported context-menu role"));
    }

    #[test]
    fn context_menu_roles_mix_with_id_items() {
        let validated = validate_context_menu_items(vec![
            ctx_role("copy"),
            ContextMenuItemSpec {
                id: Some("copyAsHtml".to_string()),
                label: Some("Copy as HTML".to_string()),
                item_type: None,
                enabled: None,
                role: None,
            },
            ContextMenuItemSpec {
                id: None,
                label: None,
                item_type: Some("separator".to_string()),
                enabled: None,
                role: None,
            },
        ])
        .expect("mixed spec must validate");
        assert_eq!(validated.len(), 3);
        assert!(matches!(validated[0], ValidatedContextMenuItem::Role(_)));
        assert!(matches!(validated[2], ValidatedContextMenuItem::Separator));
    }

    // START_BLOCK_C40_T005_CHECK_SYNC_TESTS
    // C-40 T-005: the recursive walker itself needs a live app menu
    // (items()/set_checked run on the main thread of a real runtime),
    // so these unit tests pin the pure allow-list policy and its parity
    // with the shipped taxonomy; the walker is kept deliberately thin
    // (START_BLOCK_FIND_CHECK_ITEM_RECURSIVE) around that policy.
    #[test]
    fn syncable_check_ids_are_exactly_the_four_view_items() {
        assert_eq!(SYNCABLE_CHECK_IDS.len(), 4, "the allow-list must stay closed");
        for id in [
            "view.toggle-sidebar",
            "view.toggle-tabbar",
            "view.outline",
            "view.status-bar",
        ] {
            assert!(is_syncable_check_id(id), "{id} must be syncable");
        }
    }

    #[test]
    fn non_syncable_ids_are_rejected_by_the_allow_list() {
        // Other check items that exist but must NOT be renderer-flippable
        // (the File › Line Ending pair is owned by
        // mt_update_line_ending_menu).
        assert!(!is_syncable_check_id("file.line-ending-lf"));
        assert!(!is_syncable_check_id("file.line-ending-crlf"));
        // Plain items, dynamic-submenu placeholders, arbitrary ids.
        assert!(!is_syncable_check_id("file.save"));
        assert!(!is_syncable_check_id("view.lock-document"));
        assert!(!is_syncable_check_id("view.theme"));
        assert!(!is_syncable_check_id("file.quit"));
        assert!(!is_syncable_check_id(""));
        assert!(!is_syncable_check_id("view.toggle-sidebar "));
        assert!(!is_syncable_check_id("VIEW.TOGGLE-SIDEBAR"));
    }

    #[test]
    fn syncable_check_ids_exist_in_the_menu_taxonomy() {
        // The allow-list must never drift from the shipped taxonomy:
        // every syncable id is a real View leaf, so the recursive walk
        // can actually find a CheckMenuItem with that id.
        let menu = standard_menu();
        let flat = flatten(&menu);
        for id in SYNCABLE_CHECK_IDS {
            assert!(
                flat.iter().any(|i| i.id == *id),
                "syncable id {id} missing from standard_menu()"
            );
        }
    }

    #[test]
    fn view_menu_builds_all_four_syncable_ids_as_check_items() {
        // Parity with build_native_menu: each allow-listed id must be
        // constructed as a CheckMenuItemBuilder (a plain
        // MenuItemBuilder with the same id would make set_app_menu_check
        // silently return Ok(false) forever).
        let source = include_str!("m009_menu.rs");
        for id in SYNCABLE_CHECK_IDS {
            let pattern = format!("CheckMenuItemBuilder::with_id(\"{id}\"");
            assert!(
                source.contains(&pattern),
                "build_native_menu must build {id} via CheckMenuItemBuilder"
            );
        }
    }
    // END_BLOCK_C40_T005_CHECK_SYNC_TESTS
}
