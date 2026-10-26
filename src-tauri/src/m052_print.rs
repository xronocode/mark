// FILE: src-tauri/src/m052_print.rs
// VERSION: 2.2.0
// START_MODULE_CONTRACT
//   PURPOSE: Native print surface — mt_print_webview opens the platform print panel for the caller window and mt_export_pdf silently writes the webview content to a .pdf path chosen in the renderer's save dialog (C-61 split of Print vs Export to PDF; MAS-sandbox-safe). On macOS both the panel and the silent export run their print operation through runOperationModalForWindow (the wry pattern) with an off-main completion watcher, and print-path panics degrade to logged errors (FIX-017/FIX-018).
//   SCOPE: Two Tauri commands, the pure pageOptions→geometry mapping (named page sizes, landscape swap, margins), and .pdf path validation. No state, no dialogs of its own; the only file ever written is the user-selected path handed in by the renderer. On macOS the export save target is set through the printSettings dictionary (NSPrintJobSavingURL key — NSPrintInfo has no setJobSavingURL: method; sending it was the C-61-day-one abort, FIX-018), both command subtrees run under panic containment, and a runtime selector audit test pins every selector this module sends against the live AppKit classes.
//   DEPENDS: tauri 2 WebviewWindow::with_webview on the main thread (PlatformWebview: WKWebView pointer on macOS; ICoreWebView2Controller + ICoreWebView2Environment on Windows); cocoa/objc 0.2 on macOS; webview2-com 0.38 + windows-core 0.61 on Windows; tokio oneshot for main-thread→async-command results; serde for the pageOptions payload.
//   LINKS: .grace/changes/archive/C-61; .grace/graph/runtime.xml M-052; .grace/verification/runtime.xml V-M-052; .grace/changes/archive/C-18 (the superseded single-panel flow); the owner-local export-crash audit directory outside this repository (FIX-018 evidence: .ips set + ObjC probe).
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   PdfPageOptions - camelCase renderer payload (pageSize/pageSizeWidth/pageSizeHeight/isLandscape, pageMargin* in mm); every field optional.
//   PdfPageGeometry - resolved geometry: portrait page size in mm, landscape flag, four margins in mm.
//   page_geometry - PdfPageOptions → PdfPageGeometry via the named-size table (a3/a4/a5/legal/letter/taboloid, "custom" uses explicit mm), with range + margin clamping.
//   validate_pdf_path - rejects empty and non-.pdf destinations (C-61 R-6).
//   mm_to_points / mm_to_inches - unit conversions for AppKit (points) and WebView2 (inches).
//   mt_print_webview - macOS: WKWebView print operation attached to the window, modal; resolves when the panel closes so the renderer can clear the print container. Windows: WebView2 browser print UI (ICoreWebView2_16::ShowPrintUI). Linux: explicit error.
//   mt_export_pdf - macOS: NSPrintInfo with jobDisposition NSPrintSaveJob, the save URL in the printSettings dictionary under NSPrintJobSavingURL, paper size/orientation from pageOptions, panels suppressed, run through runOperationModalForWindow; resolves after the file exists. Windows: ICoreWebView2_7::PrintToPdf with ICoreWebView2Environment6 print settings; resolves from the completion handler. Linux: explicit error.
//   contain_panics - macOS-only FIX-017: catch_unwind around both command subtrees so print-path Rust panics become logged errors (BLOCK_PRINT_GUARD_CAUGHT) instead of tearing down the app; foreign NSExceptions cannot be caught app-side on the current toolchain (verified 2026-10-23), so FIX-018 removed their actual trigger (the nonexistent setJobSavingURL: selector) and runs the job modally like the panel path.
//   nsstring_to_string - macOS-only NSString → String reader (lossy) used to describe a caught exception; nil-safe.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-10-23 v2.2.0 FIX-018: root-cause repair of the export-to-PDF
//     abort that FIX-017 did not hold (three further 15:0x .ips on v2.8.0
//     with contain_panics in the faulting frames). The actual bug: C-61
//     sent msg_send![print_info, setJobSavingURL: url] — NSPrintInfo has
//     no such method (NSPrintJobSavingURL is a printSettings DICTIONARY
//     key; proven via SDK headers and a live respondsToSelector probe),
//     so every real macOS export since C-61 raised
//     NSInvalidArgumentException (unrecognized selector), which aborts
//     the process through Rust's foreign-exception rule at any landing
//     pad, including FIX-017's catch_unwind. Fix: the save URL (and the
//     audit trail for every other selector) go through the settings
//     dictionary; the save job now runs via
//     runOperationModalForWindow — the same pattern as the working
//     panel path — because plain runOperation from a run-loop callback
//     deadlocks the main thread (reproduced with the 2026-10-23 ObjC
//     probe: main blocked 20 s+ with canSpawnSeparateThread both ways).
//     New selector-audit test pins every selector this module sends
//     against the live AppKit classes so an imagined API fails in CI,
//     not in the owner's export click. FIX-017's containment/watcher
//     stay (own panics still degrade to errors).
//   - 2026-10-23 v2.1.0 FIX-017: de-fang the PDF-export abort observed as
//     mark-2026-10-23-025710.ips (SIGABRT ~370 ms after the export save
//     panel closed, with the export command completing at that instant).
//     App-side catching of the NSException is impossible on the current
//     toolchain — verified empirically 2026-10-23: both the
//     objc_exception shim and objc's "exception" feature abort before
//     any Rust catch boundary — so the fix removes the dangerous
//     configuration instead: the export print operation runs detached
//     (setCanSpawnSeparateThread:YES, wry parity; the panel path already
//     had it) so runOperation no longer parks the main thread inside its
//     nested run loop while tao observers fire mid-print; completion is
//     watched off-main (15 s) because the print system needs a serviced
//     main run loop; and both macOS command subtrees run under panic
//     containment (BLOCK_PRINT_GUARD_CAUGHT) so setup failures degrade
//     to logged errors. Honest limitation: a foreign exception raised
//     under tao's own run-loop observer still aborts the process — that
//     boundary belongs to tao.
//   - 2026-10-18 v2.0.0 C-61: split Print and Export to PDF into two flows.
//     mt_print_webview no longer routes through wry's macOS-only print on
//     every platform: macOS drives the WKWebView print operation itself and
//     resolves when the modal panel closes (renderer clears the print
//     container then); Windows opens the WebView2 browser print UI instead
//     of erroring "macOS-only". New mt_export_pdf writes the PDF silently —
//     NSPrintInfo NSPrintSaveJob/NSPrintJobSavingURL on macOS,
//     ICoreWebView2_7::PrintToPdf on Windows. Both share the pure
//     page_geometry mapping (named sizes, landscape swap, margins) and
//     validate_pdf_path. Margins on the native print info stay at 0: the
//     shared print CSS (@page, built from the same pageOptions) owns the
//     visible margins, so panel output and the saved PDF paginate
//     identically (C-18 behavior preserved). Linux keeps explicit errors.
//   - 2026-09-23 v1.0.0: C-18 — replaces window.print() (silently ignored
//     by WKWebView) and the pandoc PDF export path with the native print
//     panel; works in app-store builds (no external binaries).
// END_CHANGE_SUMMARY

use serde::Deserialize;

// ──────────────────────────────────────────────────────────────────────
// START_BLOCK_PAGE_OPTIONS
// Pure option mapping — platform-independent and unit-tested (V-M-052).
// Sizes are millimetres; margins are millimetres with the settings
// dialog's defaults (20/15/20/15) when the renderer omits them.
// ──────────────────────────────────────────────────────────────────────

/// Renderer payload for `mt_export_pdf` (camelCase keys via serde).
#[allow(dead_code)]
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct PdfPageOptions {
    /// Named size from the settings dialog ("A4", "Letter", "custom", …).
    pub page_size: Option<String>,
    /// Custom width in mm (used when `page_size` is "custom").
    pub page_size_width: Option<f64>,
    /// Custom height in mm (used when `page_size` is "custom").
    pub page_size_height: Option<f64>,
    /// Landscape orientation (page dimensions are swapped).
    pub is_landscape: Option<bool>,
    pub page_margin_top: Option<f64>,
    pub page_margin_right: Option<f64>,
    pub page_margin_bottom: Option<f64>,
    pub page_margin_left: Option<f64>,
}

/// Resolved page geometry (portrait dimensions; the landscape flag swaps
/// them at the platform boundary).
// The mapping section below is a pure, test-covered API: each platform's
// command path consumes a different subset (macOS reads paper points,
// Windows reads margins in inches, Linux none), so dead_code would fire
// per-target on the rest. Allow it here instead of cfg-splitting the tests.
#[allow(dead_code)]
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct PdfPageGeometry {
    pub width_mm: f64,
    pub height_mm: f64,
    pub landscape: bool,
    pub margin_top_mm: f64,
    pub margin_right_mm: f64,
    pub margin_bottom_mm: f64,
    pub margin_left_mm: f64,
}

const DEFAULT_MARGIN_TOP_MM: f64 = 20.0;
const DEFAULT_MARGIN_RIGHT_MM: f64 = 15.0;
const DEFAULT_MARGIN_BOTTOM_MM: f64 = 20.0;
const DEFAULT_MARGIN_LEFT_MM: f64 = 15.0;
const MIN_PAGE_MM: f64 = 10.0;
const MAX_PAGE_MM: f64 = 2000.0;

/// Named page sizes in millimetres (portrait), mirroring
/// exportOptions.js getPageSizeList().
#[allow(dead_code)]
fn named_page_size_mm(name: &str) -> Option<(f64, f64)> {
    match name.trim().to_ascii_lowercase().as_str() {
        "a3" => Some((297.0, 420.0)),
        "a4" => Some((210.0, 297.0)),
        "a5" => Some((148.0, 210.0)),
        "legal" => Some((215.9, 355.6)),
        "letter" => Some((215.9, 279.4)),
        "tabloid" => Some((279.4, 431.8)),
        _ => None,
    }
}

/// Map renderer pageOptions to a validated geometry. Unknown named sizes
/// are rejected; "custom" (and a missing name) uses the explicit mm pair,
/// falling back to A4 — the settings dialog default — when nothing is set.
#[allow(dead_code)]
pub fn page_geometry(options: &PdfPageOptions) -> Result<PdfPageGeometry, String> {
    let (width, height) = match options.page_size.as_deref() {
        None | Some("") | Some("custom") => {
            match (options.page_size_width, options.page_size_height) {
                (Some(w), Some(h)) => (w, h),
                _ => (210.0, 297.0),
            }
        }
        Some(name) => named_page_size_mm(name)
            .ok_or_else(|| format!("unknown page size \"{name}\""))?,
    };

    if !(MIN_PAGE_MM..=MAX_PAGE_MM).contains(&width)
        || !(MIN_PAGE_MM..=MAX_PAGE_MM).contains(&height)
    {
        return Err(format!(
            "page size {width}x{height} mm is outside the supported {MIN_PAGE_MM}-{MAX_PAGE_MM} mm range"
        ));
    }

    let clamp_margin =
        |value: Option<f64>, fallback: f64| value.unwrap_or(fallback).max(0.0);

    Ok(PdfPageGeometry {
        width_mm: width,
        height_mm: height,
        landscape: options.is_landscape.unwrap_or(false),
        margin_top_mm: clamp_margin(options.page_margin_top, DEFAULT_MARGIN_TOP_MM),
        margin_right_mm: clamp_margin(options.page_margin_right, DEFAULT_MARGIN_RIGHT_MM),
        margin_bottom_mm: clamp_margin(options.page_margin_bottom, DEFAULT_MARGIN_BOTTOM_MM),
        margin_left_mm: clamp_margin(options.page_margin_left, DEFAULT_MARGIN_LEFT_MM),
    })
}

/// The save destination must be a .pdf path (C-61 R-6).
pub fn validate_pdf_path(path: &str) -> Result<(), String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("the PDF destination path is empty".to_string());
    }
    if !trimmed.to_ascii_lowercase().ends_with(".pdf") {
        return Err(format!(
            "the PDF destination must end in .pdf, got \"{trimmed}\""
        ));
    }
    Ok(())
}

#[allow(dead_code)]
pub fn mm_to_points(mm: f64) -> f64 {
    mm * 72.0 / 25.4
}

#[allow(dead_code)]
pub fn mm_to_inches(mm: f64) -> f64 {
    mm / 25.4
}

impl PdfPageGeometry {
    /// Paper size in PostScript points for NSPrintInfo, swapped when
    /// landscape (macOS writes exactly this as the page box).
    #[allow(dead_code)]
    pub fn paper_size_points(&self) -> (f64, f64) {
        let w = mm_to_points(self.width_mm);
        let h = mm_to_points(self.height_mm);
        if self.landscape {
            (h, w)
        } else {
            (w, h)
        }
    }
}
// END_BLOCK_PAGE_OPTIONS

// ──────────────────────────────────────────────────────────────────────
// Commands. Both dispatch through WebviewWindow::with_webview (the
// closure runs on the main thread, where both webviews live) and hand the
// outcome back to the async command through a tokio oneshot channel.
// ──────────────────────────────────────────────────────────────────────

/// Open the native print panel for the calling window's webview.
///
/// macOS runs the WKWebView print operation modally for the window and
/// resolves once the panel has closed, so the renderer can clear its print
/// container afterwards (C-61 R-1). Windows opens the WebView2 browser
/// print UI (the dialog keeps its own live preview, so the invoke resolves
/// right away and the renderer keeps the container until the next
/// export). Linux fails fast with an explicit error.
#[tauri::command]
pub async fn mt_print_webview(webview_window: tauri::WebviewWindow) -> Result<(), String> {
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = &webview_window;
        return Err("printing is not supported on this platform".to_string());
    }
    #[cfg(any(target_os = "macos", target_os = "windows"))]
    {
        let (tx, rx) = tokio::sync::oneshot::channel::<Result<(), String>>();
        webview_window
            .with_webview(move |pv| {
                // START_BLOCK_OBJC_GUARD_PRINT_PANEL
                // FIX-017: contain setup panics on this path too.
                #[cfg(target_os = "macos")]
                let result = contain_panics("mt_print_webview", || unsafe {
                    print_panel_wkwebview(pv.inner())
                });
                // END_BLOCK_OBJC_GUARD_PRINT_PANEL
                #[cfg(target_os = "windows")]
                let result = unsafe {
                    let controller = pv.controller();
                    print_panel_webview2(&controller)
                };
                let _ = tx.send(result);
            })
            .map_err(|e| format!("webview unavailable: {e}"))?;
        rx.await
            .map_err(|_| "the print panel did not complete".to_string())?
    }
}

/// Write the calling window's webview content to `path` as a PDF,
/// silently — no print panel, no progress panel (C-61 R-2/R-3/R-4).
///
/// `path` comes from the renderer's save dialog; the MAS sandbox therefore
/// only ever sees a user-selected URL. macOS uses the WKWebView print
/// operation in save-to-file mode (NSPrintSaveJob + NSPrintJobSavingURL,
/// paper size/orientation from `pageOptions`); Windows uses WebView2
/// PrintToPdf with print settings from the environment. Linux fails fast
/// with an explicit error.
#[tauri::command]
pub async fn mt_export_pdf(
    webview_window: tauri::WebviewWindow,
    path: String,
    page_options: PdfPageOptions,
) -> Result<(), String> {
    validate_pdf_path(&path)?;

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = (&webview_window, &page_options);
        return Err("PDF export is not supported on this platform".to_string());
    }
    #[cfg(any(target_os = "macos", target_os = "windows"))]
    {
        // START_BLOCK_EXPORT_PDF_DISPATCH
        let geometry = page_geometry(&page_options)?;
        let (tx, rx) = tokio::sync::oneshot::channel::<Result<(), String>>();
        webview_window
            .with_webview(move |pv| {
                #[cfg(target_os = "macos")]
                {
                    // START_BLOCK_OBJC_GUARD_EXPORT_PDF
                    // FIX-018: the export job runs through
                    // runOperationModalForWindow inside
                    // export_pdf_wkwebview — the same modal pattern the
                    // panel path uses from this callback — so the job's
                    // run loop services itself and returns only when the
                    // save is done. Completion on disk is still confirmed
                    // OFF-main by the watcher below (C-61 R-3).
                    let started = contain_panics("mt_export_pdf", || unsafe {
                        export_pdf_wkwebview(pv.inner(), &path, geometry)
                    });
                    match started {
                        Err(e) => {
                            let _ = tx.send(Err(e));
                        }
                        Ok(()) => {
                            let path_owned = path.clone();
                            std::thread::spawn(move || {
                                if wait_for_file(&path_owned, 15_000) {
                                    safe_eprintln!(
                                        "[m052][mt_export_pdf][BLOCK_PDF_WRITTEN path={}]",
                                        path_owned
                                    );
                                    let _ = tx.send(Ok(()));
                                } else {
                                    let err = format!(
                                        "the print operation finished but {path_owned} was not written"
                                    );
                                    safe_eprintln!(
                                        "[m052][mt_export_pdf][BLOCK_PDF_WRITE_FAILED reason={err}]"
                                    );
                                    let _ = tx.send(Err(err));
                                }
                            });
                        }
                    }
                    // END_BLOCK_OBJC_GUARD_EXPORT_PDF
                }
                #[cfg(target_os = "windows")]
                {
                    // tx is moved into the WebView2 completion handler; a
                    // failure to even start PrintToPdf drops it, which
                    // resolves the command with the generic error below —
                    // the specific reason is on stderr via the marker.
                    if let Err(e) = unsafe {
                        let controller = pv.controller();
                        let environment = pv.environment();
                        export_pdf_webview2(&controller, &environment, &path, geometry, tx)
                    } {
                        safe_eprintln!(
                            "[m052][mt_export_pdf][BLOCK_PDF_DISPATCH_FAILED reason={e}]"
                        );
                    }
                }
            })
            .map_err(|e| format!("webview unavailable: {e}"))?;
        // END_BLOCK_EXPORT_PDF_DISPATCH
        rx.await
            .map_err(|_| "PDF export did not complete".to_string())?
    }
}

// ──────────────────────────────────────────────────────────────────────
// macOS — WKWebView via raw objc (cocoa 0.26 / objc 0.2, no new crates).
// Selector-level mirror of wry's print (wkwebview/mod.rs print_with_options)
// plus the save-to-file mode NSPrintInfo has supported since 10.9.
// ──────────────────────────────────────────────────────────────────────

#[cfg(target_os = "macos")]
unsafe fn objc_nsstring(s: &str) -> cocoa::base::id {
    use objc::{msg_send, sel, sel_impl};
    let cls = objc::runtime::Class::get("NSString")
        .expect("NSString class must exist on macOS");
    // stringWithUTF8String reads up to the NUL byte and treats the bytes
    // as UTF-8, so any path/label content round-trips.
    let mut buf = String::with_capacity(s.len() + 1);
    buf.push_str(s);
    buf.push('\0');
    unsafe { msg_send![cls, stringWithUTF8String: buf.as_ptr()] }
}

#[cfg(target_os = "macos")]
unsafe fn new_print_info() -> Result<cocoa::base::id, String> {
    use cocoa::base::{id, nil};
    use objc::{msg_send, sel, sel_impl};
    let cls = objc::runtime::Class::get("NSPrintInfo")
        .ok_or_else(|| "NSPrintInfo class unavailable".to_string())?;
    let allocated: id = unsafe { msg_send![cls, alloc] };
    let print_info: id = unsafe { msg_send![allocated, init] };
    if print_info == nil {
        Err("NSPrintInfo init failed".to_string())
    } else {
        Ok(print_info)
    }
}

// ──────────────────────────────────────────────────────────────────────
// START_BLOCK_OBJC_EXCEPTION_GUARD
// FIX-017 (2026-10-23): the crash class of mark-2026-10-23-025710.ips is
// an NSException unwinding through Rust frames, which aborts the process
// by Rust's rule. App-side CATCHING of such exceptions is impossible on
// the current toolchain — verified empirically on 2026-10-23: both the
// objc_exception shim and objc's own "exception" feature abort before
// any Rust catch boundary. The fix therefore removes the dangerous
// configuration itself (the export print job no longer parks the main
// thread inside runOperation's nested run loop — see the spawn-thread
// parity and the off-main completion watcher below) and contains our own
// Rust panics so a failing setup degrades to a logged error.
// ──────────────────────────────────────────────────────────────────────

/// Run an Obj-C-touching closure with panic containment: a Rust panic
/// from our own setup code becomes a logged error the renderer shows as
/// a normal export/print failure instead of tearing down the app.
#[cfg(target_os = "macos")]
fn contain_panics(label: &str, f: impl FnOnce() -> Result<(), String>) -> Result<(), String> {
    match std::panic::catch_unwind(std::panic::AssertUnwindSafe(f)) {
        Ok(inner) => inner,
        Err(payload) => {
            let detail = payload
                .downcast_ref::<String>()
                .cloned()
                .or_else(|| payload.downcast_ref::<&str>().map(|s| (*s).to_string()))
                .unwrap_or_else(|| "an unhandled panic in the print path".to_string());
            safe_eprintln!("[m052][{label}][BLOCK_PRINT_GUARD_CAUGHT {detail}]");
            Err(format!("{label}: {detail}"))
        }
    }
}
// END_BLOCK_OBJC_EXCEPTION_GUARD

#[cfg(target_os = "macos")]
unsafe fn print_panel_wkwebview(webview: *mut std::ffi::c_void) -> Result<(), String> {
    use cocoa::base::{id, BOOL, NO, YES};
    use objc::{msg_send, sel, sel_impl};

    // START_BLOCK_PRINT_PANEL_SETUP
    let wv: id = webview as id;
    // Same macOS 11+ guard wry performs before touching the operation API.
    let can_print: BOOL = unsafe { msg_send![wv, respondsToSelector: sel!(printOperationWithPrintInfo:)] };
    if can_print == NO {
        return Err("WKWebView print operation unavailable (requires macOS 11+)".to_string());
    }
    let print_info = unsafe { new_print_info()? };
    // Visible margins live in the shared print CSS (@page, from the same
    // renderer options); native margins stay at zero so panel and saved
    // PDF paginate identically (C-61, preserves the C-18/wry behavior).
    let _: () = unsafe { msg_send![print_info, setTopMargin: 0.0f64] };
    let _: () = unsafe { msg_send![print_info, setBottomMargin: 0.0f64] };
    let _: () = unsafe { msg_send![print_info, setLeftMargin: 0.0f64] };
    let _: () = unsafe { msg_send![print_info, setRightMargin: 0.0f64] };
    let op: id = unsafe { msg_send![wv, printOperationWithPrintInfo: print_info] };
    if op == cocoa::base::nil {
        let _: () = unsafe { msg_send![print_info, release] };
        return Err("printOperationWithPrintInfo returned nil".to_string());
    }
    // Like wry: let the operation detach from the blocked main thread.
    let _: () = unsafe { msg_send![op, setCanSpawnSeparateThread: YES] };
    let window: id = unsafe { msg_send![wv, window] };
    if window == cocoa::base::nil {
        let _: () = unsafe { msg_send![print_info, release] };
        return Err("the webview has no window to attach the print panel to".to_string());
    }
    // END_BLOCK_PRINT_PANEL_SETUP

    safe_eprintln!("[m052][mt_print_webview][BLOCK_PRINT_PANEL_OPENED]");
    let _: () = unsafe {
        msg_send![op,
            runOperationModalForWindow: window
            delegate: cocoa::base::nil
            didRunSelector: std::ptr::null_mut::<objc::runtime::Sel>()
            contextInfo: std::ptr::null_mut::<std::ffi::c_void>()]
    };
    let _: () = unsafe { msg_send![print_info, release] };
    // The modal returns when the panel closes — the renderer clears its
    // print container on this invoke's resolution (C-61 R-1).
    safe_eprintln!("[m052][mt_print_webview][BLOCK_PRINT_PANEL_CLOSED]");
    Ok(())
}

#[cfg(target_os = "macos")]
unsafe fn export_pdf_wkwebview(
    webview: *mut std::ffi::c_void,
    path: &str,
    geometry: PdfPageGeometry,
) -> Result<(), String> {
    use cocoa::base::{id, BOOL, NO, YES};
    use cocoa::foundation::NSSize;
    use objc::{msg_send, sel, sel_impl};

    let wv: id = webview as id;
    let can_print: BOOL = unsafe { msg_send![wv, respondsToSelector: sel!(printOperationWithPrintInfo:)] };
    if can_print == NO {
        return Err("WKWebView print operation unavailable (requires macOS 11+)".to_string());
    }
    let print_info = unsafe { new_print_info()? };

    // START_BLOCK_PDF_SAVE_PRINT_INFO
    // Orientation first, then the explicit (already landscape-swapped)
    // paper size, so the final size is authoritative no matter how AppKit
    // treats an orientation change.
    let orientation: cocoa::foundation::NSInteger = if geometry.landscape { 1 } else { 0 }; // NS_LANDSCAPE / NS_PORTRAIT
    let _: () = unsafe { msg_send![print_info, setOrientation: orientation] };
    let (paper_w, paper_h) = geometry.paper_size_points();
    let _: () = unsafe {
        msg_send![print_info, setPaperSize: NSSize::new(paper_w, paper_h)]
    };
    // Margins belong to the shared print CSS (@page) — see the panel path.
    let _: () = unsafe { msg_send![print_info, setTopMargin: 0.0f64] };
    let _: () = unsafe { msg_send![print_info, setBottomMargin: 0.0f64] };
    let _: () = unsafe { msg_send![print_info, setLeftMargin: 0.0f64] };
    let _: () = unsafe { msg_send![print_info, setRightMargin: 0.0f64] };
    // Silent save-to-file: NSPrintSaveJob ("NSPrintSaveJob" constant) plus
    // the save-dialog URL. MAS sandbox: this is the only write target.
    // FIX-018 (2026-10-23): the save target goes into the print SETTINGS
    // dictionary under the NSPrintJobSavingURL key — NSPrintInfo has no
    // setJobSavingURL: method (verified against the SDK headers and live
    // respondsToSelector), and sending that selector raised
    // NSInvalidArgumentException, which unwound into Rust and aborted the
    // app on every macOS export since C-61.
    let disposition = unsafe { objc_nsstring("NSPrintSaveJob") };
    let _: () = unsafe { msg_send![print_info, setJobDisposition: disposition] };
    let path_string = unsafe { objc_nsstring(path) };
    let url_cls = objc::runtime::Class::get("NSURL")
        .ok_or_else(|| "NSURL class unavailable".to_string())?;
    let url: id = unsafe { msg_send![url_cls, fileURLWithPath: path_string] };
    if url == cocoa::base::nil {
        let _: () = unsafe { msg_send![print_info, release] };
        return Err(format!("could not build a file URL for {path}"));
    }
    let settings: id = unsafe { msg_send![print_info, printSettings] };
    let saving_key = unsafe { objc_nsstring("NSPrintJobSavingURL") };
    let _: () = unsafe { msg_send![settings, setObject: url forKey: saving_key] };
    // END_BLOCK_PDF_SAVE_PRINT_INFO

    let op: id = unsafe { msg_send![wv, printOperationWithPrintInfo: print_info] };
    if op == cocoa::base::nil {
        let _: () = unsafe { msg_send![print_info, release] };
        return Err("printOperationWithPrintInfo returned nil".to_string());
    }
    let _: () = unsafe { msg_send![op, setShowsPrintPanel: NO] };
    let _: () = unsafe { msg_send![op, setShowsProgressPanel: NO] };
    let _: () = unsafe { msg_send![op, setCanSpawnSeparateThread: YES] };
    // FIX-018 (2026-10-23): run the save job through the MODAL runner —
    // the same runOperationModalForWindow pattern the panel path and wry
    // use from this exact main-thread callback. Plain runOperation from a
    // run-loop callback deadlocks: the job needs the main run loop
    // serviced while it paginates (reproduced with the 2026-10-23 ObjC
    // probe — main thread blocked 20 s+ with canSpawnSeparateThread both
    // YES and NO). The modal loop services everything itself and returns
    // only when the job finishes; the off-main watcher in the command
    // closure remains the completion gate for the file on disk.
    let window: id = unsafe { msg_send![wv, window] };
    if window == cocoa::base::nil {
        let _: () = unsafe { msg_send![print_info, release] };
        return Err("the webview has no window to run the export job in".to_string());
    }

    safe_eprintln!(
        "[m052][mt_export_pdf][BLOCK_PDF_WRITE_STARTED path={} landscape={}]",
        path,
        geometry.landscape
    );
    let _: () = unsafe {
        msg_send![op,
            runOperationModalForWindow: window
            delegate: cocoa::base::nil
            didRunSelector: std::ptr::null_mut::<objc::runtime::Sel>()
            contextInfo: std::ptr::null_mut::<std::ffi::c_void>()]
    };
    let _: () = unsafe { msg_send![print_info, release] };
    // The modal loop returns only when the save job has finished. The
    // command closure's off-main watcher now confirms the PDF is actually
    // on disk (C-61 R-3) before resolving the export.
    Ok(())
}

#[cfg(target_os = "macos")]
fn wait_for_file(path: &str, timeout_ms: u64) -> bool {
    let deadline = std::time::Instant::now() + std::time::Duration::from_millis(timeout_ms);
    loop {
        if std::path::Path::new(path).exists() {
            return true;
        }
        if std::time::Instant::now() >= deadline {
            return false;
        }
        std::thread::sleep(std::time::Duration::from_millis(50));
    }
}

// ──────────────────────────────────────────────────────────────────────
// Windows — WebView2 (webview2-com 0.38, already in the root lock via
// wry; windows-core 0.61 for Interface::cast / HSTRING).
// ──────────────────────────────────────────────────────────────────────

#[cfg(target_os = "windows")]
unsafe fn print_panel_webview2(
    controller: &webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2Controller,
) -> Result<(), String> {
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        ICoreWebView2_16, COREWEBVIEW2_PRINT_DIALOG_KIND_BROWSER,
    };
    use windows_core::Interface;

    let core = unsafe { controller.CoreWebView2() }
        .map_err(|e| format!("CoreWebView2 unavailable: {e}"))?;
    let core16: ICoreWebView2_16 = core
        .cast()
        .map_err(|e| format!("the WebView2 print UI requires ICoreWebView2_16: {e}"))?;
    safe_eprintln!("[m052][mt_print_webview][BLOCK_PRINT_UI_OPENED kind=browser]");
    unsafe { core16.ShowPrintUI(COREWEBVIEW2_PRINT_DIALOG_KIND_BROWSER) }
        .map_err(|e| format!("ShowPrintUI failed: {e}"))
}

#[cfg(target_os = "windows")]
unsafe fn export_pdf_webview2(
    controller: &webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2Controller,
    environment: &webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2Environment,
    path: &str,
    geometry: PdfPageGeometry,
    done: tokio::sync::oneshot::Sender<Result<(), String>>,
) -> Result<(), String> {
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        ICoreWebView2_7, ICoreWebView2Environment6, COREWEBVIEW2_PRINT_ORIENTATION_LANDSCAPE,
        COREWEBVIEW2_PRINT_ORIENTATION_PORTRAIT,
    };
    use webview2_com::PrintToPdfCompletedHandler;
    use windows_core::{HSTRING, Interface};

    // START_BLOCK_PDF_SETTINGS
    let core = unsafe { controller.CoreWebView2() }
        .map_err(|e| format!("CoreWebView2 unavailable: {e}"))?;
    let core7: ICoreWebView2_7 = core.cast().map_err(|e| {
        format!("PDF export requires ICoreWebView2_7 (WebView2 Runtime 1.0.1155+): {e}")
    })?;
    let env6: ICoreWebView2Environment6 = environment
        .cast()
        .map_err(|e| format!("PDF export requires ICoreWebView2Environment6: {e}"))?;
    let settings = unsafe { env6.CreatePrintSettings() }
        .map_err(|e| format!("CreatePrintSettings failed: {e}"))?;
    unsafe {
        // Chromium semantics: portrait dimensions + the orientation flag —
        // the flag swaps them, so pass the unswapped portrait size.
        settings
            .SetPageWidth(mm_to_inches(geometry.width_mm))
            .map_err(|e| format!("SetPageWidth: {e}"))?;
        settings
            .SetPageHeight(mm_to_inches(geometry.height_mm))
            .map_err(|e| format!("SetPageHeight: {e}"))?;
        settings
            .SetOrientation(if geometry.landscape {
                COREWEBVIEW2_PRINT_ORIENTATION_LANDSCAPE
            } else {
                COREWEBVIEW2_PRINT_ORIENTATION_PORTRAIT
            })
            .map_err(|e| format!("SetOrientation: {e}"))?;
        settings
            .SetMarginTop(mm_to_inches(geometry.margin_top_mm))
            .map_err(|e| format!("SetMarginTop: {e}"))?;
        settings
            .SetMarginBottom(mm_to_inches(geometry.margin_bottom_mm))
            .map_err(|e| format!("SetMarginBottom: {e}"))?;
        settings
            .SetMarginLeft(mm_to_inches(geometry.margin_left_mm))
            .map_err(|e| format!("SetMarginLeft: {e}"))?;
        settings
            .SetMarginRight(mm_to_inches(geometry.margin_right_mm))
            .map_err(|e| format!("SetMarginRight: {e}"))?;
        // Match the macOS panel output: theme/code-block backgrounds on,
        // no browser header/footer chrome (the container renders its own).
        settings
            .SetShouldPrintBackgrounds(true)
            .map_err(|e| format!("SetShouldPrintBackgrounds: {e}"))?;
        settings
            .SetShouldPrintHeaderAndFooter(false)
            .map_err(|e| format!("SetShouldPrintHeaderAndFooter: {e}"))?;
    }
    // END_BLOCK_PDF_SETTINGS

    let path_hs = HSTRING::from(path);
    // The handler must be 'static: it logs an owned copy of the path.
    let path_owned = path.to_string();
    // The completion handler runs on the WebView2 UI thread and resolves
    // the async command through the oneshot channel.
    let handler = PrintToPdfCompletedHandler::create(Box::new(
        move |status: windows_core::Result<()>, is_successful: bool| {
            let outcome = match status {
                Ok(()) if is_successful => Ok(()),
                Ok(()) => Err("the WebView2 print-to-PDF job reported failure".to_string()),
                Err(e) => Err(format!("PrintToPdf failed: {e}")),
            };
            if let Err(why) = &outcome {
                safe_eprintln!("[m052][mt_export_pdf][BLOCK_PDF_WRITE_FAILED reason={why}]");
            } else {
                safe_eprintln!("[m052][mt_export_pdf][BLOCK_PDF_WRITTEN path={}]", path_owned);
            }
            let _ = done.send(outcome);
            Ok(())
        },
    ));
    safe_eprintln!(
        "[m052][mt_export_pdf][BLOCK_PDF_WRITE_STARTED path={} landscape={}]",
        path,
        geometry.landscape
    );
    unsafe { core7.PrintToPdf(&path_hs, &settings, &handler) }
        .map_err(|e| format!("PrintToPdf could not be started: {e}"))
}

// ──────────────────────────────────────────────────────────────────────
// Tests — V-M-052 pure-mapping scenarios (pageOptions → paper size /
// orientation, path validation). No Tauri runtime needed; run on every
// platform (`cargo test m052`).
// ──────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn approx(a: f64, b: f64) -> bool {
        (a - b).abs() < 1e-6
    }

    // ── page_geometry: named sizes ────────────────────────────────────

    #[test]
    fn geometry_defaults_to_a4_portrait_with_dialog_margins() {
        let g = page_geometry(&PdfPageOptions::default()).unwrap();
        assert_eq!(g.width_mm, 210.0);
        assert_eq!(g.height_mm, 297.0);
        assert!(!g.landscape);
        assert_eq!(g.margin_top_mm, 20.0);
        assert_eq!(g.margin_right_mm, 15.0);
        assert_eq!(g.margin_bottom_mm, 20.0);
        assert_eq!(g.margin_left_mm, 15.0);
    }

    #[test]
    fn geometry_resolves_named_sizes_case_insensitively() {
        for (name, w, h) in [
            ("A4", 210.0, 297.0),
            ("a4", 210.0, 297.0),
            ("A3", 297.0, 420.0),
            ("a5", 148.0, 210.0),
            ("Letter", 215.9, 279.4),
            ("Legal", 215.9, 355.6),
            ("Tabloid", 279.4, 431.8),
        ] {
            let g = page_geometry(&PdfPageOptions {
                page_size: Some(name.to_string()),
                ..Default::default()
            })
            .unwrap_or_else(|e| panic!("{name}: {e}"));
            assert!(approx(g.width_mm, w), "{name} width {}", g.width_mm);
            assert!(approx(g.height_mm, h), "{name} height {}", g.height_mm);
        }
    }

    #[test]
    fn geometry_named_size_wins_over_stale_custom_dims() {
        let g = page_geometry(&PdfPageOptions {
            page_size: Some("A5".into()),
            page_size_width: Some(600.0),
            page_size_height: Some(400.0),
            ..Default::default()
        })
        .unwrap();
        assert_eq!(g.width_mm, 148.0);
        assert_eq!(g.height_mm, 210.0);
    }

    #[test]
    fn geometry_custom_uses_explicit_mm() {
        let g = page_geometry(&PdfPageOptions {
            page_size: Some("custom".into()),
            page_size_width: Some(148.0),
            page_size_height: Some(100.0),
            ..Default::default()
        })
        .unwrap();
        assert_eq!(g.width_mm, 148.0);
        assert_eq!(g.height_mm, 100.0);
    }

    #[test]
    fn geometry_without_name_uses_explicit_mm() {
        let g = page_geometry(&PdfPageOptions {
            page_size_width: Some(100.0),
            page_size_height: Some(180.0),
            ..Default::default()
        })
        .unwrap();
        assert_eq!(g.width_mm, 100.0);
        assert_eq!(g.height_mm, 180.0);
    }

    #[test]
    fn geometry_rejects_unknown_named_size() {
        let err = page_geometry(&PdfPageOptions {
            page_size: Some("A42".into()),
            ..Default::default()
        })
        .unwrap_err();
        assert!(err.contains("unknown page size"), "{err}");
    }

    #[test]
    fn geometry_rejects_out_of_range_custom_size() {
        let err = page_geometry(&PdfPageOptions {
            page_size: Some("custom".into()),
            page_size_width: Some(5.0),
            page_size_height: Some(200.0),
            ..Default::default()
        })
        .unwrap_err();
        assert!(err.contains("outside the supported"), "{err}");
    }

    #[test]
    fn geometry_clamps_negative_margins_to_zero() {
        let g = page_geometry(&PdfPageOptions {
            page_margin_top: Some(-10.0),
            page_margin_right: Some(12.0),
            ..Default::default()
        })
        .unwrap();
        assert_eq!(g.margin_top_mm, 0.0);
        assert_eq!(g.margin_right_mm, 12.0);
        // absent margins fall back to the dialog defaults
        assert_eq!(g.margin_bottom_mm, 20.0);
        assert_eq!(g.margin_left_mm, 15.0);
    }

    // ── landscape / unit mapping ──────────────────────────────────────

    #[test]
    fn landscape_a4_swaps_paper_points() {
        let portrait = page_geometry(&PdfPageOptions {
            page_size: Some("A4".into()),
            ..Default::default()
        })
        .unwrap();
        let (w, h) = portrait.paper_size_points();
        assert!(approx(w, 595.2755905)); // 210 mm
        assert!(approx(h, 841.8897637)); // 297 mm

        let landscape = page_geometry(&PdfPageOptions {
            page_size: Some("A4".into()),
            is_landscape: Some(true),
            ..Default::default()
        })
        .unwrap();
        assert!(landscape.landscape);
        let (w, h) = landscape.paper_size_points();
        assert!(approx(w, 841.8897637));
        assert!(approx(h, 595.2755905));
    }

    #[test]
    fn unit_conversions() {
        assert!(approx(mm_to_inches(25.4), 1.0));
        assert!(approx(mm_to_inches(210.0), 8.26771653));
        assert!(approx(mm_to_points(25.4), 72.0));
        assert!(approx(mm_to_points(210.0), 595.2755905));
    }

    // ── path validation (C-61 R-6) ────────────────────────────────────

    #[test]
    fn validate_pdf_path_accepts_pdf_paths() {
        assert!(validate_pdf_path("/tmp/Notes.pdf").is_ok());
        assert!(validate_pdf_path("C:\\Users\\me\\Notes.PDF").is_ok());
        assert!(validate_pdf_path("  spaced/name.pdf  ").is_ok());
    }

    #[test]
    fn validate_pdf_path_rejects_empty_path() {
        let err = validate_pdf_path("").unwrap_err();
        assert!(err.contains("empty"), "{err}");
        let err = validate_pdf_path("   ").unwrap_err();
        assert!(err.contains("empty"), "{err}");
    }

    #[test]
    fn validate_pdf_path_rejects_non_pdf_extension() {
        let err = validate_pdf_path("/tmp/Notes.txt").unwrap_err();
        assert!(err.contains(".pdf"), "{err}");
        let err = validate_pdf_path("/tmp/Notes.html").unwrap_err();
        assert!(err.contains(".pdf"), "{err}");
    }

    // ── deserialization: renderer camelCase payload ───────────────────

    #[test]
    fn page_options_deserializes_camel_case_payload() {
        let options: PdfPageOptions = serde_json::from_str(
            r#"{
                "pageSize": "custom",
                "pageSizeWidth": 200,
                "pageSizeHeight": 100,
                "isLandscape": true,
                "pageMarginTop": 10,
                "pageMarginRight": 5,
                "pageMarginBottom": 10,
                "pageMarginLeft": 5
            }"#,
        )
        .unwrap();
        let g = page_geometry(&options).unwrap();
        assert!(g.landscape);
        assert_eq!(g.width_mm, 200.0);
        assert_eq!(g.height_mm, 100.0);
        assert_eq!(g.margin_top_mm, 10.0);
        assert_eq!(g.margin_left_mm, 5.0);
    }

    #[test]
    fn page_options_deserializes_empty_object() {
        let options: PdfPageOptions = serde_json::from_str("{}").unwrap();
        let g = page_geometry(&options).unwrap();
        assert_eq!(g.width_mm, 210.0);
        assert_eq!(g.height_mm, 297.0);
        assert!(!g.landscape);
    }

    // ── Print-path panic containment (FIX-017, macOS runtime only) ───

    #[cfg(target_os = "macos")]
    #[test]
    fn print_path_panics_degrade_to_errors_not_app_death() {
        let outcome = contain_panics("mt_export_pdf-test", || {
            // App-side catching of a real NSException is impossible on
            // the current toolchain (verified 2026-10-23: both the
            // objc_exception shim and objc's "exception" feature abort
            // before any Rust catch boundary), so this pins the half we
            // own: an ordinary panic in the print setup must come back
            // as a logged Err, never tear down the process.
            panic!("synthetic setup failure for the containment test");
        });
        let error = outcome.expect_err("a contained panic must become an Err");
        assert!(
            error.contains("synthetic setup failure"),
            "the error should carry the panic detail: {error}"
        );
    }

    // ── Print-path selector audit (FIX-018, macOS runtime only) ──────

    #[cfg(target_os = "macos")]
    #[test]
    fn print_path_selectors_exist_on_live_appkit_classes() {
        // The 2026-10-23 abort class: msg_send! to a selector NSPrintInfo
        // does not define raises NSInvalidArgumentException (unrecognized
        // selector), and the foreign exception aborts the process through
        // Rust's rule at ANY landing pad — C-61's setJobSavingURL: was
        // exactly that (live respondsToSelector == 0; the save URL is a
        // printSettings dictionary key). This audit pins EVERY selector
        // this module sends to the classes that must receive it, so an
        // imagined or renamed API fails here in CI instead of in the
        // owner's export click. Evidence chain:
        // The owner-local export-crash audit directory lives outside this repository.
        use cocoa::base::{id, BOOL, NO};
        use objc::{msg_send, sel, sel_impl};

        unsafe {
            let print_info: id = new_print_info().expect("NSPrintInfo must init");

            // Selectors export_pdf_wkwebview and print_panel_wkwebview
            // send to the NSPrintInfo instance.
            for name in [
                "setOrientation:",
                "setPaperSize:",
                "setTopMargin:",
                "setBottomMargin:",
                "setLeftMargin:",
                "setRightMargin:",
                "setJobDisposition:",
                "printSettings",
            ] {
                let selector = objc::runtime::Sel::register(name);
                let responds: BOOL = msg_send![print_info, respondsToSelector: selector];
                assert!(
                    responds != NO,
                    "NSPrintInfo no longer responds to {name} — the print path would abort"
                );
            }

            // The save target travels through the settings dictionary.
            let settings: id = msg_send![print_info, printSettings];
            assert!(settings != cocoa::base::nil, "printSettings must exist");
            let responds: BOOL = msg_send![settings, respondsToSelector: sel!(setObject:forKey:)];
            assert!(
                responds != NO,
                "printSettings must accept setObject:forKey: (NSPrintJobSavingURL entry)"
            );
            let _: () = msg_send![print_info, release];

            // Selectors sent to the NSPrintOperation produced by
            // WKWebView's printOperationWithPrintInfo:.
            let op_cls = objc::runtime::Class::get("NSPrintOperation")
                .expect("NSPrintOperation class must exist");
            for name in [
                "setShowsPrintPanel:",
                "setShowsProgressPanel:",
                "setCanSpawnSeparateThread:",
                "runOperationModalForWindow:delegate:didRunSelector:contextInfo:",
            ] {
                let selector = objc::runtime::Sel::register(name);
                let responds: BOOL = msg_send![op_cls, instancesRespondToSelector: selector];
                assert!(
                    responds != NO,
                    "NSPrintOperation no longer responds to {name} — the print path would abort"
                );
            }

            // WKWebView side: the entry point both paths guard on.
            let wv_cls = objc::runtime::Class::get("WKWebView")
                .expect("WKWebView class must exist on macOS");
            let selector =
                objc::runtime::Sel::register("printOperationWithPrintInfo:");
            let responds: BOOL = msg_send![wv_cls, instancesRespondToSelector: selector];
            assert!(
                responds != NO,
                "WKWebView lost printOperationWithPrintInfo: (macOS 11+ guard)"
            );
        }
    }
}
