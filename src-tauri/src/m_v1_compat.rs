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

use serde::Serialize;
use serde_json::{json, Value};
use tauri::{Emitter, Manager};

use crate::m005_prefs::PrefsState;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowState {
    pub is_full_screen: bool,
    pub is_maximized: bool,
}

/// Maps to v1 'mt::window-state' invoke from titleBar/index.vue.
/// Renderer uses this to seed initial isFullScreen/isMaximized refs;
/// subsequent state changes flow through Tauri WindowEvent listeners
/// (wired in F-LIFECYCLE-WIRE).
#[tauri::command]
pub async fn mt_window_state(window: tauri::Window) -> Result<WindowState, String> {
    let is_full_screen = window.is_fullscreen().unwrap_or(false);
    let is_maximized = window.is_maximized().unwrap_or(false);
    Ok(WindowState {
        is_full_screen,
        is_maximized,
    })
}

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
#[tauri::command]
pub async fn mt_request_keybindings(
    app: tauri::AppHandle,
    window: tauri::Window,
    prefs: tauri::State<'_, PrefsState>,
) -> Result<(), String> {
    let side_bar_visibility = prefs
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

    let config = json!({
        "addBlankTab": true,
        "markdownList": [],
        "lineEnding": line_ending,
        "sideBarVisibility": side_bar_visibility,
        "tabBarVisibility": tab_bar_visibility,
        "sourceCodeModeEnabled": source_code_mode_enabled,
    });

    eprintln!(
        "[v1_compat][bootstrap_editor][BLOCK_EMIT side_bar={side_bar_visibility} tab_bar={tab_bar_visibility} source_code={source_code_mode_enabled} line_ending={line_ending}]"
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

#[tauri::command]
pub async fn mt_ask_for_open_project_in_sidebar(
    app: tauri::AppHandle,
) -> Result<Option<String>, String> {
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
    let pathname = match &args {
        // Tauri unwraps positional invoke args into a JSON array when
        // the renderer passes multiple positional values
        // (ipcRenderer.send('mt::open-file', pathname, options) ⇒ args=[path, {}]).
        serde_json::Value::Array(arr) => arr
            .first()
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        serde_json::Value::Object(map) => {
            // Single-arg wrap {pathname: "..."} or {path: "..."}.
            if let Some(s) = map.get("pathname").and_then(|v| v.as_str()) {
                Some(s.to_string())
            } else if let Some(s) = map.get("path").and_then(|v| v.as_str()) {
                Some(s.to_string())
            } else if let Some(serde_json::Value::Array(inner)) = map.get("args") {
                // Defensive: shim may double-wrap as {args: [...]}.
                inner
                    .first()
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string())
            } else {
                None
            }
        }
        serde_json::Value::String(s) => Some(s.clone()),
        _ => None,
    };
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
    let _ = emit_open_new_tab(&window, &pathname);
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
    emit_open_new_tab(&window, &path)
}

/// Shared body: read file at `path` and emit mt::open-new-tab with a
/// IMarkdownDocumentRaw payload. Used by mt_cmd_open_file (picker),
/// mt_open_file (sidebar click), and (in future) recents wiring.
fn emit_open_new_tab(window: &tauri::Window, pathname: &str) -> Result<(), String> {
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
    let markdown_document = json!({
        "markdown": content,
        "filename": filename,
        "pathname": pathname,
        "encoding": { "encoding": "utf8", "isBom": false },
        "lineEnding": "lf",
        "adjustLineEndingOnSave": false,
        "trimTrailingNewline": 3,
        "cursor": null,
        "isMixedLineEndings": false,
    });
    if let Err(e) = window.emit("mt::open-new-tab", &markdown_document) {
        eprintln!("[v1_compat][open_new_tab][BLOCK_EMIT_FAILED err={e}]");
        return Err(e.to_string());
    }
    eprintln!("[v1_compat][open_new_tab][BLOCK_OPENED path={pathname}]");
    Ok(())
}

// ──────────────────────────────────────────────────────────────────────
// F-V1-IPC-COMPAT-STUBS — prefs / i18n / layout / sidebar IPC channels
// ──────────────────────────────────────────────────────────────────────

/// Maps to v1 'mt::ask-for-user-preference' AND 'mt::ask-for-user-data'
/// sends from store/preferences.js. Renderer listens for the response
/// on `mt::user-preference` event with the full prefs object as payload.
/// We answer with the entire PrefsStore Map so renderer's
/// SET_USER_PREFERENCE picks up theme / fontSize / language / layout
/// state at startup.
#[tauri::command]
pub async fn mt_ask_for_user_preference(
    window: tauri::Window,
    prefs: tauri::State<'_, PrefsState>,
) -> Result<(), String> {
    let snapshot = prefs.all();
    if let Err(e) = window.emit("mt::user-preference", &snapshot) {
        eprintln!("[v1_compat][prefs_ask][BLOCK_EMIT_FAILED err={e}]");
        return Err(e.to_string());
    }
    eprintln!("[v1_compat][prefs_ask][BLOCK_RESPONDED keys={}]", snapshot.len());
    Ok(())
}

/// Alias of mt_ask_for_user_preference. v1 main process answered both
/// channels with the same prefs payload (dataCenter keys are mixed in
/// the same flat namespace per F-PREFS-MIGRATE-V1 dataCenter merge).
#[tauri::command]
pub async fn mt_ask_for_user_data(
    window: tauri::Window,
    prefs: tauri::State<'_, PrefsState>,
) -> Result<(), String> {
    mt_ask_for_user_preference(window, prefs).await
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
    let payload = unwrap_first_arg(&args).unwrap_or(args);
    let map = match payload {
        Value::Object(m) => m,
        other => {
            eprintln!("[v1_compat][prefs_set][BLOCK_NOT_OBJECT got={other:?}]");
            return Ok(());
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
    // Broadcast to ALL webviews (main + settings), so a theme switch
    // in the Settings window propagates back to the editor view.
    // app.emit is documented as broadcasting; we additionally iterate
    // webview_windows() and emit to each individually for diagnostic
    // visibility (BLOCK_BROADCAST_HIT per window).
    let snapshot = prefs.all();
    let _ = app.emit("mt::user-preference", &snapshot);
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

/// Maps to v1 'mt::get-current-language'. Renderer's i18n bootstrap
/// awaits a `mt::current-language` event with the language string
/// (e.g. "en", "ru"). We resolve from PrefsStore[language] (set by
/// F-PREFS-MIGRATE-V1) and fall back to sys_locale.
#[tauri::command]
pub async fn mt_get_current_language(
    window: tauri::Window,
    prefs: tauri::State<'_, PrefsState>,
) -> Result<(), String> {
    let lang = prefs
        .get("language")
        .and_then(|v| v.as_str().map(|s| s.to_string()))
        .or_else(|| sys_locale::get_locale())
        .unwrap_or_else(|| "en".to_string());
    eprintln!("[v1_compat][i18n][BLOCK_LANGUAGE_RESOLVED lang={lang}]");
    if let Err(e) = window.emit("mt::current-language", &lang) {
        eprintln!("[v1_compat][i18n][BLOCK_EMIT_FAILED err={e}]");
        return Err(e.to_string());
    }
    Ok(())
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
    let view_state = match &args {
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
    let map = match view_state {
        Some(Value::Object(m)) => m,
        _ => {
            eprintln!("[v1_compat][layout][BLOCK_NO_VIEW_STATE]");
            return Ok(());
        }
    };
    let mut written = 0u32;
    for (k, v) in map {
        if let Err(e) = prefs.set(k.clone(), v) {
            eprintln!("[v1_compat][layout][BLOCK_WRITE_FAILED key={k} err={e}]");
            continue;
        }
        written += 1;
    }
    eprintln!("[v1_compat][layout][BLOCK_PERSISTED keys={written}]");
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
    let win = tauri::WebviewWindowBuilder::new(
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
        win.open_devtools();
        eprintln!("[v1_compat][settings][BLOCK_OPENED label=settings devtools=on env=MARK_SETTINGS_DEVTOOLS]");
    } else {
        eprintln!("[v1_compat][settings][BLOCK_OPENED label=settings devtools=off]");
    }
    #[cfg(not(debug_assertions))]
    eprintln!("[v1_compat][settings][BLOCK_OPENED label=settings devtools=off]");
    Ok(())
}

// ──────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────

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

    #[test]
    fn window_state_serializes_camel_case() {
        let s = WindowState { is_full_screen: true, is_maximized: false };
        let json = serde_json::to_string(&s).unwrap();
        assert!(json.contains("isFullScreen"));
        assert!(json.contains("isMaximized"));
    }
}
