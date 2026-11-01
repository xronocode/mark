// FILE: src-tauri/src/m069_dev_badge.rs
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: M-069 developer-tools rule. Web inspector access exists only
//            in debug builds or a build that opts in with the `devtools`
//            cargo feature; whenever it exists, the app icon carries an
//            orange DEV chevron so such a build is never mistaken for a
//            release.
//   SCOPE: One compile-time constant, one pure RGBA painter over the
//          shipped app icon, one setup hook (macOS Dock icon; window
//          icons on Windows/Linux) and one per-window hook for windows
//          created later. Release builds compile the hooks to no-ops.
//   DEPENDS: tauri (image::Image, AppHandle, WebviewWindow, Manager),
//            icons/icon.png (shipped app icon, embedded); macOS: cocoa,
//            objc (NSBitmapImageRep, NSImage, NSApplication).
//   LINKS: .grace/graph/runtime.xml M-069; .grace/verification/runtime.xml
//          V-M-069; src-tauri/Cargo.toml [features] devtools;
//          m_v1_compat::mt_open_setting_window (settings window badge).
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   DEVTOOLS_ENABLED - true in debug builds and in builds with the devtools feature.
//   APP_ICON_PNG - shipped 512×512 app icon, embedded.
//   BADGE_RGBA - DEV chevron fill colour.
//   GLYPHS - 5×7 bitmap glyphs for D, E, V.
//   paint_dev_badge - pure: paint the chevron band and DEV letters into an RGBA buffer, inside the icon's alpha mask.
//   dev_icon - the badged app icon, or None when developer tools are off.
//   apply_dev_badge - setup hook: badge the main window and the macOS Dock icon.
//   apply_window_badge - badge one window icon (Windows/Linux; macOS uses the Dock).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-10-30 v1.0.0: initial module. The tauri `devtools` feature is no
//     longer forced on every build (it was on in release and App Store
//     builds); it is an explicit opt-in cargo feature, and any build with
//     inspector access shows the DEV chevron.
// END_CHANGE_SUMMARY

use tauri::image::Image;

/// Web inspector access is compiled in: always in debug builds (tauri
/// enables it there), and in release builds only with `--features devtools`.
pub const DEVTOOLS_ENABLED: bool = cfg!(any(debug_assertions, feature = "devtools"));

const APP_ICON_PNG: &[u8] = include_bytes!("../icons/icon.png");
const BADGE_RGBA: [u8; 4] = [0xE8, 0x59, 0x0C, 0xFF];
const GLYPHS: [[u8; 7]; 3] = [
    // D
    [0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110],
    // E
    [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
    // V
    [0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b01010, 0b00100],
];

// START_BLOCK_PAINT_DEV_BADGE
/// Paint a chevron band across the lower part of the icon — its top edge
/// rises to a point at the centre — and the letters DEV in white on it.
/// Only pixels inside the icon's alpha mask change, so the band follows
/// the rounded square and transparent corners stay transparent.
pub fn paint_dev_badge(rgba: &mut [u8], width: u32, height: u32) {
    let (w, h) = (width as i64, height as i64);
    if w == 0 || h == 0 || rgba.len() < (w * h * 4) as usize {
        return;
    }
    let centre = w / 2;
    let edge_top = h * 70 / 100;
    let peak_top = h * 62 / 100;
    let cell = (h / 64).max(1);
    let text_w = (3 * 5 + 2) * cell;
    let text_x = centre - text_w / 2;
    let text_y = h * 81 / 100 - 7 * cell / 2;

    for y in 0..h {
        for x in 0..w {
            let index = ((y * w + x) * 4) as usize;
            if rgba[index + 3] == 0 {
                continue;
            }
            let rise = (edge_top - peak_top) * (centre - (x - centre).abs()) / centre.max(1);
            if y < edge_top - rise {
                continue;
            }
            let (gx, gy) = ((x - text_x) / cell, (y - text_y) / cell);
            let in_text = x >= text_x && y >= text_y && gx < 17 && gy < 7 && gx % 6 < 5;
            let lit = in_text && {
                let row = GLYPHS[(gx / 6) as usize][gy as usize];
                row & (0b10000 >> (gx % 6)) != 0
            };
            let colour = if lit { [0xFF, 0xFF, 0xFF] } else { [BADGE_RGBA[0], BADGE_RGBA[1], BADGE_RGBA[2]] };
            rgba[index..index + 3].copy_from_slice(&colour);
        }
    }
}
// END_BLOCK_PAINT_DEV_BADGE

/// The badged app icon, or None when developer tools are off.
pub fn dev_icon() -> Option<Image<'static>> {
    if !DEVTOOLS_ENABLED {
        return None;
    }
    let icon = Image::from_bytes(APP_ICON_PNG).ok()?;
    let (width, height) = (icon.width(), icon.height());
    let mut rgba = icon.rgba().to_vec();
    paint_dev_badge(&mut rgba, width, height);
    Some(Image::new_owned(rgba, width, height))
}

// START_BLOCK_APPLY_DEV_BADGE
/// Setup hook: badge the main window and, on macOS, the Dock icon.
/// No-op without developer tools.
pub fn apply_dev_badge(app: &tauri::AppHandle) {
    use tauri::Manager;
    let Some(icon) = dev_icon() else {
        return;
    };
    #[cfg(target_os = "macos")]
    set_dock_icon(app, &icon);
    if let Some(main) = app.get_webview_window("main") {
        apply_window_badge(&main);
    }
    let _ = icon;
    safe_eprintln!("[DevBadge][apply][BLOCK_DEV_BADGE_APPLIED devtools=on]");
}

/// Badge one window icon. macOS shows the Dock icon instead, so this
/// only matters on Windows and Linux. No-op without developer tools.
pub fn apply_window_badge(window: &tauri::WebviewWindow) {
    #[cfg(not(target_os = "macos"))]
    if let Some(icon) = dev_icon() {
        if let Err(error) = window.set_icon(icon) {
            safe_eprintln!("[DevBadge][apply][BLOCK_DEV_BADGE_WINDOW_FAILED reason={error}]");
        }
    }
    #[cfg(target_os = "macos")]
    let _ = window;
}

#[cfg(target_os = "macos")]
fn set_dock_icon(app: &tauri::AppHandle, icon: &Image<'static>) {
    let (width, height) = (icon.width(), icon.height());
    let rgba = icon.rgba().to_vec();
    let result = app.run_on_main_thread(move || {
        use cocoa::base::{id, nil, NO, YES};
        use cocoa::foundation::{NSSize, NSString};
        use objc::{class, msg_send, sel, sel_impl};

        // SAFETY: runs on the main thread (run_on_main_thread); the bitmap
        // is allocated by AppKit with exactly width*height*4 bytes
        // (bytesPerRow = width*4, 32 bits per pixel), and rgba holds that
        // many bytes; every object is checked for nil before use.
        unsafe {
            let colour_space = NSString::alloc(nil).init_str("NSDeviceRGBColorSpace");
            let rep: id = msg_send![class!(NSBitmapImageRep), alloc];
            let rep: id = msg_send![rep,
                initWithBitmapDataPlanes: std::ptr::null_mut::<*mut u8>()
                pixelsWide: width as isize
                pixelsHigh: height as isize
                bitsPerSample: 8_isize
                samplesPerPixel: 4_isize
                hasAlpha: YES
                isPlanar: NO
                colorSpaceName: colour_space
                bytesPerRow: (width * 4) as isize
                bitsPerPixel: 32_isize];
            if rep == nil {
                return;
            }
            let data: *mut u8 = msg_send![rep, bitmapData];
            if data.is_null() {
                return;
            }
            std::ptr::copy_nonoverlapping(rgba.as_ptr(), data, rgba.len());
            let image: id = msg_send![class!(NSImage), alloc];
            let image: id = msg_send![image, initWithSize: NSSize::new(f64::from(width), f64::from(height))];
            if image == nil {
                return;
            }
            let _: () = msg_send![image, addRepresentation: rep];
            let ns_app: id = msg_send![class!(NSApplication), sharedApplication];
            let _: () = msg_send![ns_app, setApplicationIconImage: image];
        }
    });
    if let Err(error) = result {
        safe_eprintln!("[DevBadge][apply][BLOCK_DEV_BADGE_DOCK_FAILED reason={error}]");
    }
}
// END_BLOCK_APPLY_DEV_BADGE

#[cfg(test)]
mod tests {
    use super::*;

    fn icon_rgba() -> (Vec<u8>, u32, u32) {
        let icon = Image::from_bytes(APP_ICON_PNG).expect("shipped icon decodes");
        (icon.rgba().to_vec(), icon.width(), icon.height())
    }

    fn pixel(rgba: &[u8], width: u32, x: u32, y: u32) -> [u8; 4] {
        let index = ((y * width + x) * 4) as usize;
        [rgba[index], rgba[index + 1], rgba[index + 2], rgba[index + 3]]
    }

    #[test]
    fn debug_builds_have_devtools_and_a_badge() {
        // cargo test builds with debug assertions, so the rule must say on.
        assert!(DEVTOOLS_ENABLED);
        assert!(dev_icon().is_some());
    }

    #[test]
    fn badge_paints_the_band_and_keeps_transparent_corners() {
        let (mut rgba, width, height) = icon_rgba();
        let corner = pixel(&rgba, width, 0, height - 1);
        paint_dev_badge(&mut rgba, width, height);
        assert_eq!(pixel(&rgba, width, 0, height - 1), corner, "corner outside the mask");
        // Left edge of the band, below the chevron and outside the text.
        let band = pixel(&rgba, width, width / 16, height * 75 / 100);
        assert_eq!(band, BADGE_RGBA);
        // Above the chevron the icon is untouched.
        let (original, _, _) = icon_rgba();
        let above = (width / 2, height * 55 / 100);
        assert_eq!(pixel(&rgba, width, above.0, above.1), pixel(&original, width, above.0, above.1));
    }

    #[test]
    fn badge_writes_the_dev_letters() {
        let (mut rgba, width, height) = icon_rgba();
        paint_dev_badge(&mut rgba, width, height);
        let cell = height / 64;
        let text_x = width / 2 - (17 * cell) / 2;
        let text_y = height * 81 / 100 - 7 * cell / 2;
        // Top-left cell of D is lit, the cell right of D's top bar is not.
        let lit = pixel(&rgba, width, text_x + cell / 2, text_y + cell / 2);
        assert_eq!(lit, [0xFF, 0xFF, 0xFF, lit[3]]);
        let gap = pixel(&rgba, width, text_x + 5 * cell + cell / 2, text_y + cell / 2);
        assert_eq!(gap, BADGE_RGBA);
    }

    #[test]
    fn painter_ignores_a_short_buffer() {
        let mut rgba = vec![0xFF; 8];
        paint_dev_badge(&mut rgba, 64, 64);
        assert_eq!(rgba, vec![0xFF; 8]);
    }

    #[test]
    fn tauri_dependency_does_not_force_devtools() {
        let manifest = include_str!("../Cargo.toml");
        let tauri = manifest
            .lines()
            .find(|line| line.trim_start().starts_with("tauri = "))
            .expect("tauri dependency line");
        assert!(!tauri.contains("devtools"), "devtools must stay an opt-in feature: {tauri}");
        assert!(manifest.contains("devtools = [\"tauri/devtools\"]"));
        let default = manifest
            .lines()
            .find(|line| line.trim_start().starts_with("default = "))
            .expect("default features line");
        assert!(!default.contains("devtools"), "release builds must not default to devtools");
    }

    #[test]
    fn release_lanes_never_enable_devtools() {
        for (path, text) in [
            ("release.yml", include_str!("../../.github/workflows/release.yml")),
            ("release-tauri.yml", include_str!("../../.github/workflows/release-tauri.yml")),
            ("build-mas.sh", include_str!("../../tools/build-mas.sh")),
        ] {
            assert!(!text.contains("devtools"), "{path} must not enable developer tools");
        }
    }
}
