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
