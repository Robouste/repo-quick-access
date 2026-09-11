//! System tray icon with Show / Settings / Quit. Built in Rust so it exists from
//! process start and keeps working independently of the webview.

use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle,
};

use crate::overlay;

pub const ID: &str = "main";

pub fn build(app: &AppHandle) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "Show", true, None::<&str>)?;
    let settings = MenuItem::with_id(app, "settings", "Settings…", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(
        app,
        &[&show, &settings, &PredefinedMenuItem::separator(app)?, &quit],
    )?;

    let icon = app
        .default_window_icon()
        .cloned()
        .expect("bundle.icon must be configured in tauri.conf.json");

    TrayIconBuilder::with_id(ID)
        .icon(icon)
        .tooltip("Repo Quick Access")
        .menu(&menu)
        // Left click shows the overlay, right click opens the menu (Windows / X11).
        // Linux AppIndicator trays deliver no click events; there the menu is the
        // only interaction, hence the explicit "Show" entry.
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show" => overlay::show(app),
            "settings" => {
                if let Err(e) = overlay::open_settings(app) {
                    eprintln!("failed to open settings window: {e}");
                }
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                overlay::show(tray.app_handle());
            }
        })
        .build(app)?;
    Ok(())
}
