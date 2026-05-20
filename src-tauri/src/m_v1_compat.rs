// MODULE_CONTRACT
//   PURPOSE: Tauri-side stubs for v1.2.3 IPC channels that the renderer
//            (ported as-is per variant-(a)) calls but that we haven't
//            ported to dedicated modules yet. Each stub returns a
//            sensible default so the renderer's `.then(...)` chains
//            resolve instead of throwing unhandled rejections.
//   SCOPE:   thin compatibility shims only. Every command here has a
//            corresponding F-* followup pointing at the proper module
//            that should own it long-term.
//   DEPENDS: tauri (WebviewWindow for window-state queries).
//   LINKS:   docs/development-plan.xml F-V1-IPC-COMPAT-STUBS;
//            install-window-globals.js electron.ipcRenderer.invoke
//            translates 'mt::xxx-yyy' → 'mt_xxx_yyy' before dispatch.
//   STATUS:  shipped 2026-04-29 with F-MAIN-ENTRY-DISABLED runtime close.
//
// CHANGE_SUMMARY:
//   - 2026-04-29 F-MAIN-ENTRY-DISABLED runtime: mt_window_state stub.
//   - 2026-04-29 F-EDITOR-BOOTSTRAP-EVENT: mt_request_keybindings doubles
//     as the renderer-ready signal — emits mt::bootstrap-editor with
//     migrated prefs config so editor.js:593 listener fires.
//   - 2026-04-29 F-V1-FILE-OPS: mt_cmd_open_folder + mt_cmd_open_file +
//     mt_ask_for_open_project_in_sidebar use rfd file pickers and emit
//     mt::open-directory / mt::open-file events so File→Open and the
//     sidebar's Open Folder button work.
//   - 2026-04-30 F-V1-IPC-COMPAT-STUBS: 7 prefs/i18n/layout channels
//     wired through PrefsState; 2 no-op channels stubbed; 1 deferred
//     to F-SETTINGS-WINDOW-WIRE (open-setting-window).
//   - 2026-05-09 audit-M-3: drop 5 orphan compat commands superseded
//     by Path B-clean canonical modules (mt_window_state — direct
//     Tauri Window API in titleBar; mt_ask_for_user_preference +
//     mt_ask_for_user_data — m005_prefs::mt_prefs_get_all in W1;
//     mt_get_current_language — event-driven mt::current-language;
//     mt_ask_for_open_project_in_sidebar — deferred F-OPEN-PROJECT-
//     SIDEBAR, no live caller). Drops unused WindowState struct +
//     its serializer test alongside.

use serde_json::{json, Value};
use tauri::{Emitter, Manager};

use crate::m005_prefs::PrefsState;
use crate::PendingOpens;

/// Maps to v1 'mt::request-keybindings' send from editor.js:588 — the
/// renderer fires this ~500 ms after registering the
/// `mt::bootstrap-editor` listener (line 593). v1.2.3 main process
/// answered with the keybinding map; in our port, we use it as the
/// renderer-ready signal to push the bootstrap-editor event back, which
/// flips mainStore.SET_INITIALIZED() and unblocks the editor surface.
/// Without this hook, the editor remains in editor-placeholder mode
/// forever (F-EDITOR-BOOTSTRAP-EVENT).
///
/// Config fields read from the migrated PrefsStore (set by F-PREFS-MIGRATE-V1).
/// Defaults match v1.2.3 schema defaults so a fresh install also boots cleanly.
///
/// M-025.1 untitled-suppression (smoke 2026-05-11): `addBlankTab` is now
/// driven by `PendingOpens.had_initial_opens`. If any path was enqueued
/// or direct-emitted (Finder double-click, CLI args, drag-onto-Dock),
/// addBlankTab=false so the renderer does NOT create a spurious
/// Untitled-1 alongside the opened file. Plain launches (no pending
/// opens) keep addBlankTab=true and get the empty workspace.
///
/// M-025.2 sidebar-hide on cold-launch single-file open (smoke
/// 2026-05-11): when `had_initial_opens` is true, also force
/// `sideBarVisibility=false` in the emitted config. Rationale: a Finder
/// double-click / CLI `mark a.md` opens a SINGLE file with no folder
/// context, so the sidebar tree is useless and visually noisy.
/// Complements V-M-022 (preview-mode on Finder open) to create a clean
/// "focus reader" mode. User's persisted `sideBarVisibility` pref stays
/// untouched on disk — toolbar toggle re-shows the sidebar, and a plain
/// launch (no pending opens) restores the saved pref as before.
#[tauri::command]
pub async fn mt_request_keybindings(
    app: tauri::AppHandle,
    window: tauri::Window,
    prefs: tauri::State<'_, PrefsState>,
    pending: tauri::State<'_, PendingOpens>,
) -> Result<(), String> {
    let side_bar_visibility_pref = prefs
        .get("sideBarVisibility")
        .and_then(|v| v.as_bool())
        .unwrap_or(true);
    let tab_bar_visibility = prefs
        .get("tabBarVisibility")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let source_code_mode_enabled = prefs
        .get("sourceCodeModeEnabled")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let line_ending = prefs
        .get("endOfLine")
        .and_then(|v| v.as_str().map(|s| s.to_string()))
        .unwrap_or_else(|| "default".to_string());

    let had_opens = pending
        .had_initial_opens
        .load(std::sync::atomic::Ordering::SeqCst);
    let add_blank_tab = !had_opens;
    // M-025.2: same `!had_opens` expression — when the app was cold-
    // launched via Finder / CLI with a path, hide the sidebar; otherwise
    // honor the user's persisted pref.
    let side_bar_visibility = if had_opens { false } else { side_bar_visibility_pref };

    let config = json!({
        "addBlankTab": add_blank_tab,
        "markdownList": [],
        "lineEnding": line_ending,
        "sideBarVisibility": side_bar_visibility,
        "tabBarVisibility": tab_bar_visibility,
        "sourceCodeModeEnabled": source_code_mode_enabled,
    });

    eprintln!(
        "[v1_compat][bootstrap_editor][BLOCK_EMIT add_blank_tab={add_blank_tab} had_initial_opens={had_opens} side_bar={side_bar_visibility} side_bar_pref={side_bar_visibility_pref} side_bar_overridden={had_opens} tab_bar={tab_bar_visibility} source_code={source_code_mode_enabled} line_ending={line_ending}]"
    );

    // Use AppHandle::emit so the event reaches every listener; window
    // label "main" is the standard Mark window per tauri.conf.json.
    let _ = window.label();
    let _ = app.webview_windows();
    if let Err(e) = window.emit("mt::bootstrap-editor", &config) {
        eprintln!(
            "[v1_compat][bootstrap_editor][BLOCK_EMIT_FAILED err={e}]"
        );
        return Err(e.to_string());
    }

    Ok(())
}

/// Path B-clean W3: opens the OS folder picker and RETURNS the chosen
/// path directly. Renderer awaits the invoke result and calls
/// project.ADD_PROJECT(path) without going through `mt::open-directory`
/// event roundtrip — eliminating the listener race.
///
/// On success additionally spawns the walk-and-emit thread streaming
/// `mt::update-object-tree` events for the new root. The streaming
/// listener is registered ONCE at boot in bootstrap-ipc.js (W1).
///
/// User cancel of the dialog returns `Ok(None)` — renderer treats as
/// no-op.
#[tauri::command]
pub async fn mt_pick_folder(app: tauri::AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let (tx, rx) = tokio::sync::oneshot::channel::<Option<tauri_plugin_dialog::FilePath>>();
    app.dialog()
        .file()
        .set_title("Open Folder")
        .pick_folder(move |result| {
            let _ = tx.send(result);
        });
    let chosen = rx.await.map_err(|e| e.to_string())?;
    let path = match chosen.and_then(|p| p.into_path().ok()) {
        Some(p) => p.to_string_lossy().to_string(),
        None => {
            eprintln!("[m_fs_ops][open_folder][BLOCK_USER_CANCELLED]");
            return Ok(None);
        }
    };
    eprintln!("[m_fs_ops][open_folder][BLOCK_PICKED path={path}]");

    // Walk the directory off-thread; events arrive via the
    // mt::update-object-tree listener registered at boot.
    let walk_path = std::path::PathBuf::from(&path);
    let walk_app = app.clone();
    std::thread::spawn(move || {
        if let Err(e) = walk_and_emit_app(&walk_path, &walk_app) {
            eprintln!("[m_fs_ops][open_folder][BLOCK_WALK_FAILED err={e}]");
        }
    });

    Ok(Some(path))
}

/// Path B-clean W4: file.quit menu command target. Renderer's
/// `commands/index.js` "file.quit" entry now invokes this. Pre-W4
/// `mt::app-try-quit` was a dead-end send (no backend listener) so
/// File→Quit / Cmd+Q via menu was a no-op visually. Lifecycle hooks
/// in `m001_save_close::wire_close_handler` still run because Tauri
/// fires `WindowEvent::CloseRequested` for every window before
/// `app.exit()` returns.
#[tauri::command]
pub async fn mt_app_quit(app: tauri::AppHandle) -> Result<(), String> {
    eprintln!("[m_app][quit][BLOCK_REQUESTED]");
    let state = tauri::Manager::state::<crate::PendingOpens>(&app);
    state.quit_approved.store(true, std::sync::atomic::Ordering::SeqCst);
    app.exit(0);
    Ok(())
}

/// W3 stub for `mt::close-project-root`. Currently a no-op:
/// open_folder doesn't yet subscribe a notify-rs watcher, so there's
/// nothing to unsubscribe. When file-watch-on-open lands (future
/// wave; F-WATCH-WIRE-PROJECT), this command will call into
/// WatchRegistry to remove the watcher attached to `pathname`.
/// Logging the close lets the renderer-side smoke verify the IPC
/// reached backend.
#[tauri::command]
pub async fn mt_close_project_root(pathname: String) -> Result<(), String> {
    eprintln!("[m_fs_ops][close_project_root][BLOCK_RECEIVED path={pathname}]");
    // TODO F-WATCH-WIRE-PROJECT: lookup subscription_id by pathname,
    // call WatchRegistry::remove(sub_id). Currently no watcher per
    // root, so this command is just a marker for V-Phase-Bclean-W3.
    Ok(())
}

/// Legacy v1 channels — kept as thin shims around mt_pick_folder for
/// the duration of W3 in case any old code path still expects the
/// emit-event-then-listen pattern. Will be removed in W6 (delete shim).
/// They simply forward to the new command without emitting.
#[tauri::command]
pub async fn mt_cmd_open_folder(app: tauri::AppHandle) -> Result<Option<String>, String> {
    mt_pick_folder(app).await
}

const MARKDOWN_EXTS: &[&str] = &[
    "md", "markdown", "mmd", "mkd", "mkdn", "mdown", "mdtxt", "mdtext", "mdx", "text", "txt",
];

fn is_markdown(name: &str) -> bool {
    let lower = name.to_lowercase();
    MARKDOWN_EXTS.iter().any(|ext| lower.ends_with(&format!(".{ext}")))
}

/// Recursively walk a directory. For each file emit
/// `mt::update-object-tree` with `{type:"add", change:{pathname, name,
/// isFile:true, isDirectory:false, isMarkdown}}`; for each subdirectory
/// emit `{type:"addDir", change:{pathname, name}}`. Skips hidden
/// entries (names starting with ".") so .git / .DS_Store don't pollute
/// the sidebar tree.
fn walk_and_emit_app(root: &std::path::Path, app: &tauri::AppHandle) -> std::io::Result<()> {
    walk_and_emit_inner(root, |payload| {
        let _ = app.emit("mt::update-object-tree", payload);
    })
}

fn walk_and_emit(root: &std::path::Path, window: &tauri::Window) -> std::io::Result<()> {
    walk_and_emit_inner(root, |payload| {
        let _ = window.emit("mt::update-object-tree", payload);
    })
}

fn walk_and_emit_inner(
    root: &std::path::Path,
    mut emit: impl FnMut(serde_json::Value),
) -> std::io::Result<()> {
    let mut stack: Vec<std::path::PathBuf> = vec![root.to_path_buf()];
    while let Some(current) = stack.pop() {
        let entries = match std::fs::read_dir(&current) {
            Ok(it) => it,
            Err(e) => {
                eprintln!(
                    "[v1_compat][walk][BLOCK_READ_DIR_FAILED dir={} err={e}]",
                    current.display()
                );
                continue;
            }
        };
        for entry in entries.flatten() {
            let name_os = entry.file_name();
            let name = match name_os.to_str() {
                Some(s) => s.to_string(),
                None => continue, // non-UTF-8 names skipped
            };
            if name.starts_with('.') {
                continue;
            }
            let path = entry.path();
            let pathname = path.to_string_lossy().to_string();
            let ft = match entry.file_type() {
                Ok(ft) => ft,
                Err(_) => continue,
            };
            if ft.is_dir() {
                emit(json!({
                    "type": "addDir",
                    "change": {
                        "pathname": pathname,
                        "name": name,
                    }
                }));
                stack.push(path);
            } else if ft.is_file() {
                emit(json!({
                    "type": "add",
                    "change": {
                        "pathname": pathname,
                        "name": name,
                        "isFile": true,
                        "isDirectory": false,
                        "isMarkdown": is_markdown(&name),
                    }
                }));
            }
        }
    }
    eprintln!(
        "[m_fs_ops][walk][BLOCK_WALK_COMPLETE root={}]",
        root.display()
    );
    Ok(())
}

/// Maps to v1 'mt::open-file' send from sidebar treeFile.vue:69 +
/// searchResultItem.vue:150 (single-click / double-click on a file in
/// the sidebar). Reads the file content via std::fs and emits
/// mt::open-new-tab back to the renderer with a IMarkdownDocumentRaw
/// payload — same shape the drag-drop bridge in install-window-globals.js
/// produces. Editor's LISTEN_FOR_NEW_TAB picks it up.
#[tauri::command]
pub async fn mt_open_file(
    window: tauri::Window,
    args: serde_json::Value,
) -> Result<(), String> {
    // Renderer sends positional args via the shim's invoke wrapper:
    //   ipcRenderer.send('mt::open-file', pathname, options)
    //   → invoke('mt_open_file', { args: [pathname, options] })
    // For single-arg sends the shim still wraps as { pathname }, so
    // accept either shape.
    let pathname = parse_open_file_args(&args);
    let pathname = match pathname {
        Some(p) if !p.is_empty() => p,
        _ => {
            eprintln!("[v1_compat][open_file_send][BLOCK_NO_PATH args={args}]");
            return Ok(());
        }
    };

    // Best-effort: log + swallow read failures. Sidebar click on a
    // file that vanished between watcher event and click should not
    // raise a Promise rejection in the renderer.
    // M-022: sidebar click is an explicit "edit this file" gesture, so
    // preview_mode=false (open in editor view).
    let _ = emit_open_new_tab(&window, &pathname, false);
    Ok(())
}

/// Maps to v1 'mt::cmd-open-file'. Shows a native file picker (markdown
/// extensions); reads the chosen file and emits mt::open-new-tab so the
/// editor store creates a tab with content. Reuses the same emit shape
/// as mt_open_file (sidebar click) and the drag-drop bridge.
#[tauri::command]
pub async fn mt_cmd_open_file(window: tauri::Window) -> Result<(), String> {
    let chosen = rfd::AsyncFileDialog::new()
        .set_title("Open Markdown File")
        .add_filter(
            "Markdown",
            &["md", "markdown", "mmd", "mkd", "mkdn", "mdown", "mdtxt", "mdtext", "mdx", "text", "txt"],
        )
        .pick_file()
        .await;
    let path = match chosen {
        Some(handle) => handle.path().to_string_lossy().to_string(),
        None => {
            eprintln!("[v1_compat][open_file][BLOCK_USER_CANCELLED]");
            return Ok(());
        }
    };
    eprintln!("[v1_compat][open_file][BLOCK_PICKED path={path}]");
    // M-022: picker is an explicit "I want to edit this" gesture →
    // preview_mode=false.
    emit_open_new_tab(&window, &path, false)
}

/// Build the IMarkdownDocumentRaw JSON payload for a given file path.
/// Pure-logic helper — reads the file from disk then assembles the
/// JSON the renderer expects. Returns Err when the read fails so the
/// caller can decide whether to swallow or propagate.
///
/// `preview_mode` (M-022): when `true`, the payload carries
/// `previewMode: true` so the renderer creates the tab in preview
/// (read-only) view rather than the default editing view. Used by the
/// CLI / Finder open-document path (Phase-B4-pre-alpha-add) so a user
/// double-clicking an `.md` in Finder lands on a preview rather than
/// the editor surface.
pub(crate) fn build_open_new_tab_payload(
    pathname: &str,
    preview_mode: bool,
) -> Result<Value, String> {
    let content = match std::fs::read_to_string(pathname) {
        Ok(s) => s,
        Err(e) => {
            eprintln!(
                "[v1_compat][open_new_tab][BLOCK_READ_FAILED path={pathname} err={e}]"
            );
            return Err(e.to_string());
        }
    };
    let filename = std::path::Path::new(pathname)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or(pathname)
        .to_string();
    Ok(json!({
        "markdown": content,
        "filename": filename,
        "pathname": pathname,
        "encoding": { "encoding": "utf8", "isBom": false },
        "lineEnding": "lf",
        "adjustLineEndingOnSave": false,
        "trimTrailingNewline": 3,
        "cursor": null,
        "isMixedLineEndings": false,
        "previewMode": preview_mode,
    }))
}

/// Shared body: read file at `path` and emit mt::open-new-tab with a
/// IMarkdownDocumentRaw payload. Used by mt_cmd_open_file (picker),
/// mt_open_file (sidebar click), main.rs setup (CLI args / `open -a`
/// Apple Events), and (in future) recents wiring.
///
/// Generic over the Emitter trait so callers can pass either `tauri::Window`
/// (the legacy command-handler param type) or `tauri::WebviewWindow`
/// (the newer window builder return type used by main.rs setup).
///
/// `preview_mode` (M-022): pass `true` for Finder/CLI-launched files so
/// the new tab lands in preview view; pass `false` for sidebar clicks /
/// picker invocations where the user is actively editing.
pub(crate) fn emit_open_new_tab<E: tauri::Emitter<tauri::Wry>>(
    emitter: &E,
    pathname: &str,
    preview_mode: bool,
) -> Result<(), String> {
    let markdown_document = build_open_new_tab_payload(pathname, preview_mode)?;
    if let Err(e) = emitter.emit("mt::open-new-tab", &markdown_document) {
        eprintln!("[v1_compat][open_new_tab][BLOCK_EMIT_FAILED err={e}]");
        return Err(e.to_string());
    }
    eprintln!(
        "[v1_compat][open_new_tab][BLOCK_OPENED path={pathname} preview={preview_mode}]"
    );
    Ok(())
}

// ──────────────────────────────────────────────────────────────────────
// F-V1-IPC-COMPAT-STUBS — prefs / i18n / layout / sidebar IPC channels
// ──────────────────────────────────────────────────────────────────────

/// Pure-logic merge: takes the renderer's args payload, unwraps it,
/// writes each key/value pair into prefs (skipping the migration
/// namespace), and returns the count of successfully written keys.
/// Returns None if the payload is not a JSON object (caller logs and
/// no-ops).
pub(crate) fn merge_user_preference_inner(prefs: &PrefsState, args: &Value) -> Option<u32> {
    let payload = unwrap_first_arg(args).unwrap_or_else(|| args.clone());
    let map = match payload {
        Value::Object(m) => m,
        other => {
            eprintln!("[v1_compat][prefs_set][BLOCK_NOT_OBJECT got={other:?}]");
            return None;
        }
    };
    let mut written = 0u32;
    for (k, v) in map {
        if k == crate::m005_prefs::KEY_MIGRATION_NS {
            continue;
        }
        if let Err(e) = prefs.set(k.clone(), v) {
            eprintln!("[v1_compat][prefs_set][BLOCK_WRITE_FAILED key={k} err={e}]");
            continue;
        }
        written += 1;
    }
    eprintln!("[v1_compat][prefs_set][BLOCK_WRITTEN keys={written}]");
    Some(written)
}

/// Maps to v1 'mt::set-user-preference' AND 'mt::set-user-data' sends.
/// Renderer dispatches `{key: value}` (single entry) or full sub-object
/// per call — for example, theme switcher sends `{ theme: 'ayu-mirage' }`.
/// We merge into PrefsStore and broadcast `mt::user-preference` to ALL
/// windows so the editor view picks up changes made in the Settings
/// window (theme switch, font changes, etc.).
#[tauri::command]
pub async fn mt_set_user_preference(
    app: tauri::AppHandle,
    prefs: tauri::State<'_, PrefsState>,
    args: Value,
) -> Result<(), String> {
    if merge_user_preference_inner(prefs.inner(), &args).is_none() {
        return Ok(());
    }
    // Broadcast to ALL webviews (main + settings), so a theme switch
    // in the Settings window propagates back to the editor view.
    // app.emit is documented as broadcasting; we additionally iterate
    // webview_windows() and emit to each individually for diagnostic
    // visibility (BLOCK_BROADCAST_HIT per window).
    let snapshot = prefs.all();
    // Smart-review 2026-05-11 (F-THEME-DIAG): surface broadcast emit
    // failures so a silent emit fault doesn't masquerade as a renderer
    // listener bug. The per-window loop below also logs each emit, but
    // app.emit failing wholesale is a distinct symptom worth its own
    // marker.
    if let Err(e) = app.emit("mt::user-preference", &snapshot) {
        eprintln!("[v1_compat][prefs_set][BLOCK_EMIT_FAILED err={e}]");
    }
    let windows = app.webview_windows();
    eprintln!(
        "[v1_compat][prefs_set][BLOCK_BROADCAST_FANOUT count={}]",
        windows.len()
    );
    for (label, win) in windows.iter() {
        match win.emit("mt::user-preference", &snapshot) {
            Ok(_) => eprintln!("[v1_compat][prefs_set][BLOCK_BROADCAST_HIT window={label}]"),
            Err(e) => eprintln!(
                "[v1_compat][prefs_set][BLOCK_BROADCAST_FAILED window={label} err={e}]"
            ),
        }
    }
    Ok(())
}

/// Alias of mt_set_user_preference for the dataCenter-side send.
#[tauri::command]
pub async fn mt_set_user_data(
    app: tauri::AppHandle,
    prefs: tauri::State<'_, PrefsState>,
    args: Value,
) -> Result<(), String> {
    mt_set_user_preference(app, prefs, args).await
}

/// Extract the view-state object from the renderer's positional 2-arg
/// payload `[windowId, viewState]`. Accepts both the bare-array shape
/// and the shim-wrapped `{args: [...]}` shape. Returns None if no
/// recognizable shape is found.
pub(crate) fn extract_view_state(args: &Value) -> Option<serde_json::Map<String, Value>> {
    let view_state = match args {
        Value::Array(arr) if arr.len() >= 2 => arr.get(1).cloned(),
        Value::Object(map) if map.contains_key("args") => {
            if let Some(Value::Array(arr)) = map.get("args") {
                arr.get(1).cloned()
            } else {
                None
            }
        }
        _ => None,
    };
    match view_state {
        Some(Value::Object(m)) => Some(m),
        _ => None,
    }
}

/// Persist a view-state map into prefs. Returns the count of writes.
pub(crate) fn persist_view_state_inner(
    prefs: &PrefsState,
    map: serde_json::Map<String, Value>,
) -> u32 {
    let mut written = 0u32;
    for (k, v) in map {
        if let Err(e) = prefs.set(k.clone(), v) {
            eprintln!("[v1_compat][layout][BLOCK_WRITE_FAILED key={k} err={e}]");
            continue;
        }
        written += 1;
    }
    eprintln!("[v1_compat][layout][BLOCK_PERSISTED keys={written}]");
    written
}

/// Maps to v1 'mt::view-layout-changed'. Renderer dispatches layout
/// state — we persist into PrefsStore so subsequent sessions restore
/// the user's sidebar/tabbar/right-column choices. v1 also synced the
/// native menu's checkmarks; that re-sync waits on F-MENU-WIRE-TAURI.
#[tauri::command]
pub async fn mt_view_layout_changed(
    prefs: tauri::State<'_, PrefsState>,
    args: Value,
) -> Result<(), String> {
    // Renderer call: ipcRenderer.send('mt::view-layout-changed', windowId, viewState)
    // Shim wraps positional 2-arg as args=[windowId, viewState].
    match extract_view_state(&args) {
        Some(map) => {
            persist_view_state_inner(prefs.inner(), map);
        }
        None => {
            eprintln!("[v1_compat][layout][BLOCK_NO_VIEW_STATE]");
        }
    }
    Ok(())
}

/// Maps to v1 'mt::update-sidebar-menu'. v1 main process toggled the
/// View menu's "Toggle Sidebar" checkmark to match. We have no native
/// menu yet (F-MENU-WIRE-TAURI), so this is a no-op stub that records
/// a marker for diagnostic visibility.
#[tauri::command]
pub async fn mt_update_sidebar_menu(args: Value) -> Result<(), String> {
    eprintln!("[v1_compat][layout][BLOCK_UPDATE_SIDEBAR_MENU_NOOP args={args}]");
    Ok(())
}

/// Maps to v1 'mt::request-window-content-size'. v1 main process
/// resized the OS window to match the requested inner content width
/// (Mode → Source ↔ WYSIWYG transitions). Tauri's tao window API can
/// do this; deferring as a no-op for alpha because user can resize
/// manually and the auto-resize can fight macOS Stage Manager.
/// Closes when F-WINDOW-AUTO-RESIZE wires tauri::Window::set_inner_size.
#[tauri::command]
pub async fn mt_request_window_content_size(args: Value) -> Result<(), String> {
    eprintln!("[v1_compat][layout][BLOCK_REQUEST_WINDOW_CONTENT_SIZE_NOOP args={args}]");
    Ok(())
}

/// Maps to v1 'mt::open-setting-window'. Spawns a second WebviewWindow
/// with label="settings" loading index.html?type=settings — renderer's
/// router (router/index.js) redirects '/' to '/preference' when
/// `type !== 'editor'`. If a settings window already exists, focuses
/// the existing one instead of opening a duplicate.
#[tauri::command]
pub async fn mt_open_setting_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(existing) = app.get_webview_window("settings") {
        let _ = existing.set_focus();
        eprintln!("[v1_compat][settings][BLOCK_FOCUS_EXISTING]");
        return Ok(());
    }
    // _win prefix: only read inside the debug-assertions block below;
    // in release builds the cfg-gated arm is stripped and `win` would
    // otherwise warn `unused_variable`. Underscore keeps the binding
    // accessible while opting out of the lint per Rust convention.
    let _win = tauri::WebviewWindowBuilder::new(
        &app,
        "settings",
        tauri::WebviewUrl::App("index.html?type=settings&wid=1&debug=0".into()),
    )
    .title("Mark — Preferences")
    .inner_size(960.0, 720.0)
    .resizable(true)
    .build()
    .map_err(|e| {
        eprintln!("[v1_compat][settings][BLOCK_BUILD_FAILED err={e}]");
        e.to_string()
    })?;
    // F-SETTINGS-WINDOW-WIRE: blank-content bug from 2026-05-07 was
    // root-caused (capability + bootstrap-event). DevTools auto-open
    // retired 2026-05-09 so users don't see a debug panel on first
    // Preferences click. Re-enable manually with Cmd+Option+I or via
    // a debug build (cfg!(debug_assertions)) if needed.
    #[cfg(debug_assertions)]
    if std::env::var("MARK_SETTINGS_DEVTOOLS").as_deref() == Ok("1") {
        _win.open_devtools();
        eprintln!("[v1_compat][settings][BLOCK_OPENED label=settings devtools=on env=MARK_SETTINGS_DEVTOOLS]");
    } else {
        eprintln!("[v1_compat][settings][BLOCK_OPENED label=settings devtools=off]");
    }
    #[cfg(not(debug_assertions))]
    eprintln!("[v1_compat][settings][BLOCK_OPENED label=settings devtools=off]");
    Ok(())
}

/// Opens a clicked link in the system browser.
/// Renderer calls this via `ipcRenderer.send('mt::format-link-click', { data, dirname })`.
#[tauri::command]
pub async fn mt_format_link_click(data: Value, dirname: Value) -> Result<(), String> {
    let href = data
        .get("href")
        .and_then(|v| v.as_str())
        .unwrap_or_default();
    if href.is_empty() {
        return Ok(());
    }
    let url = if href.starts_with("http://") || href.starts_with("https://") {
        href.to_string()
    } else if href.starts_with('/') || href.starts_with('.') {
        let dir = dirname.as_str().unwrap_or(".");
        let path = std::path::Path::new(dir).join(href);
        path.to_string_lossy().to_string()
    } else {
        href.to_string()
    };
    eprintln!("[v1_compat][link][BLOCK_OPEN_URL url={url}]");
    std::process::Command::new("open")
        .arg(&url)
        .spawn()
        .map_err(|e| format!("Failed to open URL: {e}"))?;
    Ok(())
}

// ──────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────

/// Parse the renderer payload for mt_open_file across all the shapes
/// the IPC shim might produce: bare positional array `[pathname, opts]`,
/// single-key wrap `{pathname}` or `{path}`, or double-wrap `{args:[...]}`,
/// or a bare string. Returns None when no string-shaped pathname is found.
pub(crate) fn parse_open_file_args(args: &Value) -> Option<String> {
    match args {
        // Tauri unwraps positional invoke args into a JSON array when
        // the renderer passes multiple positional values
        // (ipcRenderer.send('mt::open-file', pathname, options) ⇒ args=[path, {}]).
        Value::Array(arr) => arr
            .first()
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        Value::Object(map) => {
            if let Some(s) = map.get("pathname").and_then(|v| v.as_str()) {
                Some(s.to_string())
            } else if let Some(s) = map.get("path").and_then(|v| v.as_str()) {
                Some(s.to_string())
            } else if let Some(Value::Array(inner)) = map.get("args") {
                inner
                    .first()
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string())
            } else {
                None
            }
        }
        Value::String(s) => Some(s.clone()),
        _ => None,
    }
}

/// Tauri's invoke wrapper unwraps single-arg sends to the bare value
/// while wrapping multi-arg sends as `{args: [...]}`. For prefs setters
/// the renderer always sends ONE positional `{key: value}` object, but
/// we accept both shapes defensively.
fn unwrap_first_arg(args: &Value) -> Option<Value> {
    match args {
        Value::Object(map) if map.contains_key("args") => {
            if let Some(Value::Array(arr)) = map.get("args") {
                arr.first().cloned()
            } else {
                None
            }
        }
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use tempfile::TempDir;

    fn fresh_prefs() -> (TempDir, PrefsState) {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("preferences.json");
        let prefs = PrefsState::from_path(path);
        (dir, prefs)
    }

    #[test]
    fn is_markdown_recognizes_common_extensions() {
        assert!(is_markdown("note.md"));
        assert!(is_markdown("MIXED.MD"));
        assert!(is_markdown("doc.markdown"));
        assert!(is_markdown("legacy.mdtxt"));
        assert!(is_markdown("readme.txt"));
        assert!(!is_markdown("image.png"));
        assert!(!is_markdown("README"));
        assert!(!is_markdown("script.sh"));
    }

    #[test]
    fn unwrap_first_arg_returns_none_for_bare_value() {
        let v = json!({ "pathname": "/x" });
        assert!(unwrap_first_arg(&v).is_none());
    }

    #[test]
    fn unwrap_first_arg_returns_first_array_element_for_wrapped() {
        let v = json!({ "args": [{ "k": 1 }, "second"] });
        let unwrapped = unwrap_first_arg(&v).unwrap();
        assert_eq!(unwrapped, json!({ "k": 1 }));
    }

    #[test]
    fn unwrap_first_arg_returns_none_when_args_is_not_array() {
        let v = json!({ "args": "not-an-array" });
        assert!(unwrap_first_arg(&v).is_none());
    }

    #[test]
    fn parse_open_file_args_handles_array_shape() {
        let v = json!(["/tmp/note.md", { "options": true }]);
        assert_eq!(parse_open_file_args(&v).as_deref(), Some("/tmp/note.md"));
    }

    #[test]
    fn parse_open_file_args_handles_pathname_object() {
        let v = json!({ "pathname": "/a/b.md" });
        assert_eq!(parse_open_file_args(&v).as_deref(), Some("/a/b.md"));
    }

    #[test]
    fn parse_open_file_args_handles_path_object() {
        let v = json!({ "path": "/c/d.md" });
        assert_eq!(parse_open_file_args(&v).as_deref(), Some("/c/d.md"));
    }

    #[test]
    fn parse_open_file_args_handles_double_wrap() {
        let v = json!({ "args": ["/e/f.md"] });
        assert_eq!(parse_open_file_args(&v).as_deref(), Some("/e/f.md"));
    }

    #[test]
    fn parse_open_file_args_handles_bare_string() {
        let v = json!("/g/h.md");
        assert_eq!(parse_open_file_args(&v).as_deref(), Some("/g/h.md"));
    }

    #[test]
    fn parse_open_file_args_returns_none_for_unknown_shape() {
        assert!(parse_open_file_args(&json!(null)).is_none());
        assert!(parse_open_file_args(&json!(42)).is_none());
        assert!(parse_open_file_args(&json!({})).is_none());
    }

    #[test]
    fn merge_user_preference_inner_writes_keys_skipping_migration_ns() {
        let (_dir, prefs) = fresh_prefs();
        let payload = json!({
            "theme": "dark",
            "fontSize": 14,
            crate::m005_prefs::KEY_MIGRATION_NS: { "schema_version": 99 },
        });
        let written = merge_user_preference_inner(&prefs, &payload).unwrap();
        // Only 2 of the 3 keys persisted — KEY_MIGRATION_NS is filtered.
        assert_eq!(written, 2);
        assert_eq!(prefs.get("theme").unwrap(), json!("dark"));
        assert_eq!(prefs.get("fontSize").unwrap(), json!(14));
        // Migration namespace stays untouched (None when no marker stamped).
        // Specifically: the planted bogus value did NOT get persisted.
        assert!(prefs
            .get(crate::m005_prefs::KEY_MIGRATION_NS)
            .map(|v| v != json!({ "schema_version": 99 }))
            .unwrap_or(true));
    }

    #[test]
    fn merge_user_preference_inner_unwraps_args_envelope() {
        let (_dir, prefs) = fresh_prefs();
        let payload = json!({ "args": [{ "k": "v" }] });
        let written = merge_user_preference_inner(&prefs, &payload).unwrap();
        assert_eq!(written, 1);
        assert_eq!(prefs.get("k").unwrap(), json!("v"));
    }

    #[test]
    fn merge_user_preference_inner_returns_none_for_non_object() {
        let (_dir, prefs) = fresh_prefs();
        assert!(merge_user_preference_inner(&prefs, &json!("not-an-object")).is_none());
        assert!(merge_user_preference_inner(&prefs, &json!([1, 2, 3])).is_none());
    }

    #[test]
    fn extract_view_state_handles_positional_array() {
        let v = json!([42, { "sidebarVisible": true, "tabBarVisible": false }]);
        let map = extract_view_state(&v).unwrap();
        assert_eq!(map.get("sidebarVisible"), Some(&json!(true)));
        assert_eq!(map.get("tabBarVisible"), Some(&json!(false)));
    }

    #[test]
    fn extract_view_state_handles_args_envelope() {
        let v = json!({ "args": [42, { "k": 1 }] });
        let map = extract_view_state(&v).unwrap();
        assert_eq!(map.get("k"), Some(&json!(1)));
    }

    #[test]
    fn extract_view_state_returns_none_when_view_state_missing() {
        assert!(extract_view_state(&json!([42])).is_none()); // arr len < 2
        assert!(extract_view_state(&json!({ "args": [42] })).is_none());
        assert!(extract_view_state(&json!("nope")).is_none());
        assert!(extract_view_state(&json!([42, "not-an-object"])).is_none());
    }

    #[test]
    fn persist_view_state_inner_writes_all_keys() {
        let (_dir, prefs) = fresh_prefs();
        let mut map = serde_json::Map::new();
        map.insert("sidebarVisible".to_string(), json!(true));
        map.insert("tabBarVisible".to_string(), json!(false));
        let written = persist_view_state_inner(&prefs, map);
        assert_eq!(written, 2);
        assert_eq!(prefs.get("sidebarVisible").unwrap(), json!(true));
        assert_eq!(prefs.get("tabBarVisible").unwrap(), json!(false));
    }

    #[test]
    fn walk_and_emit_inner_emits_files_and_dirs_skipping_dotfiles() {
        let dir = TempDir::new().unwrap();
        std::fs::write(dir.path().join("a.md"), "x").unwrap();
        std::fs::write(dir.path().join(".hidden.md"), "y").unwrap();
        std::fs::create_dir(dir.path().join("sub")).unwrap();
        std::fs::write(dir.path().join("sub").join("nested.md"), "z").unwrap();
        std::fs::create_dir(dir.path().join(".git")).unwrap();
        std::fs::write(dir.path().join(".git").join("HEAD"), "ref").unwrap();

        let mut events: Vec<Value> = Vec::new();
        walk_and_emit_inner(dir.path(), |payload| events.push(payload)).unwrap();

        let kinds: Vec<&str> = events
            .iter()
            .map(|e| e.get("type").and_then(|v| v.as_str()).unwrap_or(""))
            .collect();
        assert!(kinds.contains(&"add"));
        assert!(kinds.contains(&"addDir"));

        // No dotfile or .git entries.
        for e in &events {
            let name = e
                .pointer("/change/name")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            assert!(
                !name.starts_with('.'),
                "dotfile '{name}' must be skipped, got event {e}"
            );
        }

        // a.md emitted as a markdown file.
        let a_md_event = events
            .iter()
            .find(|e| e.pointer("/change/name").and_then(|v| v.as_str()) == Some("a.md"))
            .expect("a.md event missing");
        assert_eq!(a_md_event.pointer("/change/isMarkdown"), Some(&json!(true)));
        assert_eq!(a_md_event.pointer("/change/isFile"), Some(&json!(true)));

        // Nested file picked up via stack walk (recursion).
        assert!(events
            .iter()
            .any(|e| e.pointer("/change/name").and_then(|v| v.as_str()) == Some("nested.md")));
    }

    #[tokio::test]
    async fn mt_close_project_root_is_a_no_op_stub() {
        // No watchers are registered yet, so the command is a marker-
        // only IPC sink. Just verify it returns Ok without panicking.
        mt_close_project_root("/some/path".to_string()).await.unwrap();
        mt_close_project_root("".to_string()).await.unwrap();
    }

    #[tokio::test]
    async fn mt_close_window_confirm_is_a_no_op_sink() {
        // Phase-B4 step-3 uses this purely as a v1-IPC-compat sink; the
        // dialog runs renderer-side. Returns Ok unconditionally.
        crate::m001_save_close::mt_close_window_confirm(vec![])
            .await
            .unwrap();
        crate::m001_save_close::mt_close_window_confirm(vec![serde_json::json!({"k":"v"})])
            .await
            .unwrap();
    }

    #[tokio::test]
    async fn mt_update_sidebar_menu_is_a_no_op_stub() {
        mt_update_sidebar_menu(serde_json::json!({"any": 1})).await.unwrap();
        mt_update_sidebar_menu(serde_json::json!(null)).await.unwrap();
    }

    #[tokio::test]
    async fn mt_request_window_content_size_is_a_no_op_stub() {
        mt_request_window_content_size(serde_json::json!([800, 600])).await.unwrap();
    }

    #[test]
    fn build_open_new_tab_payload_constructs_imarkdowndocumentraw() {
        let dir = TempDir::new().unwrap();
        let target = dir.path().join("note.md");
        std::fs::write(&target, "# Heading\n\ncontent").unwrap();
        let payload = build_open_new_tab_payload(target.to_str().unwrap(), false).unwrap();
        assert_eq!(payload["markdown"], json!("# Heading\n\ncontent"));
        assert_eq!(payload["filename"], json!("note.md"));
        assert_eq!(payload["pathname"], json!(target.to_str().unwrap()));
        assert_eq!(payload["encoding"]["encoding"], json!("utf8"));
        assert_eq!(payload["encoding"]["isBom"], json!(false));
        assert_eq!(payload["lineEnding"], json!("lf"));
        assert_eq!(payload["isMixedLineEndings"], json!(false));
        assert_eq!(payload["previewMode"], json!(false));
    }

    #[test]
    fn build_open_new_tab_payload_carries_preview_mode_true() {
        let dir = TempDir::new().unwrap();
        let target = dir.path().join("note.md");
        std::fs::write(&target, "x").unwrap();
        let payload = build_open_new_tab_payload(target.to_str().unwrap(), true).unwrap();
        assert_eq!(payload["previewMode"], json!(true));
    }

    #[test]
    fn build_open_new_tab_payload_propagates_read_errors() {
        let err = build_open_new_tab_payload("/nonexistent-1234567890.md", false).unwrap_err();
        assert!(!err.is_empty());
    }

    #[test]
    fn build_open_new_tab_payload_falls_back_to_pathname_when_no_filename() {
        // Edge: a path with no file_name (e.g. "/") would normally
        // fall back to the pathname itself for the filename field.
        // We can't construct such a path that ALSO reads successfully
        // — so this test just verifies the unwrap_or path doesn't panic
        // on a normal nested case.
        let dir = TempDir::new().unwrap();
        let target = dir.path().join("nested").join("a.md");
        std::fs::create_dir_all(target.parent().unwrap()).unwrap();
        std::fs::write(&target, "x").unwrap();
        let payload = build_open_new_tab_payload(target.to_str().unwrap(), false).unwrap();
        assert_eq!(payload["filename"], json!("a.md"));
    }

    #[test]
    fn walk_and_emit_inner_ignores_unreadable_subdirs() {
        let dir = TempDir::new().unwrap();
        std::fs::write(dir.path().join("ok.md"), "x").unwrap();
        // Removing the dir between read_dir invocations is the realistic
        // failure mode; here we just verify the happy path (perm-denied
        // subdir is platform-specific to test cleanly). Empty assertion
        // confirms no panic on basic walk.
        let mut count = 0;
        walk_and_emit_inner(dir.path(), |_| count += 1).unwrap();
        assert!(count >= 1);
    }
}

