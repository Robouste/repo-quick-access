// Rust shell: plugin registration plus the OS-lifecycle glue that must not depend
// on the webview (tray, overlay show/hide, settings window, quit). Feature logic
// (scanner, config, search, launcher) lives in the TypeScript frontend.
mod overlay;
mod tray;

pub fn run() {
    #[cfg(target_os = "linux")]
    apply_webkitgtk_workarounds();

    tauri::Builder::default()
        // Must be registered first. A second launch (e.g. a Wayland desktop
        // shortcut bound to the binary) is forwarded here and shows the overlay.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            overlay::show(app);
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
        .setup(|app| {
            tray::build(app.handle())?;
            Ok(())
        })
        .on_window_event(overlay::on_window_event)
        .invoke_handler(tauri::generate_handler![
            overlay::show_overlay,
            overlay::hide_overlay,
            overlay::open_settings_window,
            overlay::quit,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// GTK3 attaches WebKitGTK's DMA-BUF frames to the Wayland surface without an
/// explicit-sync acquire point. Drivers that require explicit sync (NVIDIA ≥ 555)
/// make the compositor reject the first shown frame as a protocol error, which kills
/// the process. Rendering through shared memory instead avoids the handoff entirely
/// at a negligible cost for a small static overlay. Must run before GTK initialises.
/// A value already present in the environment always wins.
#[cfg(target_os = "linux")]
fn apply_webkitgtk_workarounds() {
    const KEY: &str = "WEBKIT_DISABLE_DMABUF_RENDERER";
    if std::env::var_os(KEY).is_none() {
        std::env::set_var(KEY, "1");
    }
}
