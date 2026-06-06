use tauri::AppHandle;

#[cfg(target_os = "macos")]
#[tauri::command]
pub async fn mt_share_file(app: AppHandle, path: String) -> Result<(), String> {
    use raw_window_handle::{HasWindowHandle, RawWindowHandle};

    let win = tauri::Manager::get_webview_window(&app, "main")
        .ok_or("main window not found")?;

    let ns_view_ptr = match win.window_handle() {
        Ok(wh) => match wh.as_raw() {
            RawWindowHandle::AppKit(appkit) => appkit.ns_view.as_ptr() as isize,
            _ => return Err("not an AppKit window".into()),
        },
        Err(e) => return Err(format!("window handle: {e}")),
    };

    app.run_on_main_thread(move || {
        use cocoa::base::{id, nil};
        use cocoa::foundation::{NSArray, NSString};
        use objc::{class, msg_send, sel, sel_impl};

        unsafe {
            let ns_view: id = ns_view_ptr as id;
            let ns_window: id = msg_send![ns_view, window];

            let url_cls = class!(NSURL);
            let ns_path = NSString::alloc(nil).init_str(&path);
            let url: id = msg_send![url_cls, fileURLWithPath: ns_path];
            if url == nil { return; }

            let items = NSArray::arrayWithObject(nil, url);
            let picker_cls = class!(NSSharingServicePicker);
            let picker: id = msg_send![picker_cls, alloc];
            let picker: id = msg_send![picker, initWithItems: items];

            let content_view: id = msg_send![ns_window, contentView];
            let frame: cocoa::foundation::NSRect = msg_send![content_view, frame];
            let anchor = cocoa::foundation::NSRect::new(
                cocoa::foundation::NSPoint::new(frame.size.width - 60.0, frame.size.height - 10.0),
                cocoa::foundation::NSSize::new(1.0, 1.0),
            );

            let _: () = msg_send![picker, showRelativeToRect:anchor ofView:content_view preferredEdge:1_isize];
        }
    }).map_err(|e| format!("main thread dispatch: {e}"))?;

    Ok(())
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
pub async fn mt_share_file(_app: AppHandle, _path: String) -> Result<(), String> {
    Err("Share is only available on macOS".into())
}
