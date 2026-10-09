// Rust shell: plugin registration plus the OS-lifecycle glue that must not depend
// on the webview (tray, overlay show/hide, settings window, quit). Feature logic
// (scanner, config, search, default-editor launch) lives in the TypeScript frontend;
// `launcher` only covers the custom-executable-path case, which needs a native spawn
// outside the shell plugin's static capability scope (see its module doc).
mod launcher;
mod overlay;
mod shortcut;
mod tray;

pub fn run() {
    #[cfg(target_os = "linux")]
    apply_webkitgtk_workarounds();

    tauri::Builder::default()
        // Must be registered first. A second launch (e.g. a Wayland desktop shortcut
        // bound to the binary) is forwarded here instead of starting a new process.
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            overlay::on_relaunch(app, args.as_slice());
        }))
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .manage(overlay::OverlayState::default())
        .manage(shortcut::Registration::default())
        .setup(|app| {
            tray::build(app.handle())?;
            // Built hidden here rather than on first use of the settings menu entry;
            // see `overlay::init_settings_window` for why that matters on Windows.
            overlay::init_settings_window(app.handle())?;
            // Runs on the main thread, as the hotkey manager requires.
            shortcut::init(app.handle());
            Ok(())
        })
        .on_window_event(overlay::on_window_event)
        .invoke_handler(tauri::generate_handler![
            overlay::show_overlay,
            overlay::hide_overlay,
            overlay::open_settings_window,
            overlay::quit,
            shortcut::get_shortcut,
            shortcut::set_shortcut,
            shortcut::shortcut_status,
            launcher::launch_editor,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// GTK3 attaches WebKitGTK's DMA-BUF frames to the Wayland surface without an
/// explicit-sync acquire point. Drivers that require explicit sync (NVIDIA ≥ 555)
/// make the compositor reject the first shown frame as a protocol error, which kills
/// the process. Must run before GTK initialises. A value already present in the
/// environment always wins.
#[cfg(target_os = "linux")]
fn apply_webkitgtk_workarounds() {
    // SAFETY: plain getters returning constants of the loaded library; no GTK state.
    let version = unsafe {
        (
            webkit2gtk_sys::webkit_get_major_version(),
            webkit2gtk_sys::webkit_get_minor_version(),
        )
    };
    for (key, value) in webkitgtk_env(version) {
        if std::env::var_os(key).is_none() {
            std::env::set_var(key, value);
        }
    }
}

/// Environment that keeps the overlay crash-free and painted for a WebKitGTK version.
///
/// Before 2.54, rendering through shared memory (DMA-BUF renderer off) sidesteps the
/// explicit-sync handoff entirely at a negligible cost. From 2.54 on, WebKitGTK
/// composites with Skia and its unaccelerated path never paints a transparent
/// window's surface: the overlay is mapped and takes input but stays invisible. So
/// the DMA-BUF renderer stays on and the NVIDIA driver is told not to demand explicit
/// sync instead (other drivers ignore the variable).
#[cfg(target_os = "linux")]
fn webkitgtk_env((major, minor): (u32, u32)) -> &'static [(&'static str, &'static str)] {
    if (major, minor) >= (2, 54) {
        &[("__NV_DISABLE_EXPLICIT_SYNC", "1")]
    } else {
        &[("WEBKIT_DISABLE_DMABUF_RENDERER", "1")]
    }
}

#[cfg(all(test, target_os = "linux"))]
mod tests {
    use super::webkitgtk_env;

    #[test]
    fn older_webkitgtk_renders_through_shared_memory() {
        assert_eq!(
            webkitgtk_env((2, 52)),
            &[("WEBKIT_DISABLE_DMABUF_RENDERER", "1")]
        );
    }

    #[test]
    fn webkitgtk_2_54_and_later_keep_dmabuf_and_drop_nvidia_explicit_sync() {
        for version in [(2, 54), (2, 56), (3, 0)] {
            assert_eq!(
                webkitgtk_env(version),
                &[("__NV_DISABLE_EXPLICIT_SYNC", "1")]
            );
        }
    }
}
