//! Overlay window lifecycle: show / hide, hide on focus loss, settings window, quit.
//!
//! Lives in Rust so it works even when the webview is reloading or has crashed,
//! and so the tray, the single-instance forwarder and the frontend share one path.

use std::sync::Mutex;

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder, Window, WindowEvent};

pub const MAIN: &str = "main";
pub const SETTINGS: &str = "settings";

/// Decides whether a focus-loss event should hide the overlay.
///
/// Compositors that refuse to focus a freshly shown window (Wayland focus-stealing
/// prevention, Windows foreground lock) never deliver `Focused(true)`; hiding on the
/// first `Focused(false)` in that state would make the overlay flash and vanish. So a
/// blur only hides the overlay once it has actually been focused since the last show.
#[derive(Debug, Default)]
pub struct FocusGuard {
    focused_since_show: bool,
}

impl FocusGuard {
    pub fn on_show(&mut self) {
        self.focused_since_show = false;
    }

    /// Returns `true` when the overlay should be hidden.
    pub fn on_focus_changed(&mut self, focused: bool) -> bool {
        if focused {
            self.focused_since_show = true;
            return false;
        }
        std::mem::take(&mut self.focused_since_show)
    }
}

#[derive(Default)]
pub struct OverlayState {
    guard: Mutex<FocusGuard>,
}

pub fn show(app: &AppHandle) {
    let Some(window) = app.get_webview_window(MAIN) else {
        return;
    };
    if let Some(state) = app.try_state::<OverlayState>() {
        state.guard.lock().unwrap().on_show();
    }
    // Re-center on every show: the display layout may have changed since startup.
    let _ = window.center();
    let _ = window.show();
    let _ = window.set_focus();
}

pub fn hide(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(MAIN) {
        let _ = window.hide();
    }
}

/// Flag on a relaunch that asks for toggle rather than plain show semantics.
pub const TOGGLE_FLAG: &str = "--toggle";

/// What a trigger should do, given the overlay's current state.
///
/// A visible overlay that does not hold focus means the compositor refused it (or
/// another window took it back); the user pressing the trigger then wants the overlay
/// in front, not gone. Only a visible *and* focused overlay is dismissed.
#[derive(Debug, PartialEq, Eq)]
pub enum Action {
    Show,
    Focus,
    Hide,
}

impl Action {
    pub fn decide(visible: bool, focused: bool) -> Self {
        match (visible, focused) {
            (false, _) => Action::Show,
            (true, false) => Action::Focus,
            (true, true) => Action::Hide,
        }
    }
}

/// The global shortcut's handler: show the overlay, or dismiss it if it is already up.
pub fn toggle(app: &AppHandle) {
    let Some(window) = app.get_webview_window(MAIN) else {
        return;
    };
    // A window whose state cannot be read is treated as not up, so the trigger still
    // brings the overlay back rather than doing nothing.
    let visible = window.is_visible().unwrap_or(false);
    let focused = window.is_focused().unwrap_or(false);
    match Action::decide(visible, focused) {
        Action::Show => show(app),
        Action::Focus => {
            let _ = window.set_focus();
        }
        Action::Hide => hide(app),
    }
}

/// Whether a second launch asked for toggle semantics.
pub fn wants_toggle<S: AsRef<str>>(args: &[S]) -> bool {
    args.iter().any(|arg| arg.as_ref() == TOGGLE_FLAG)
}

/// Handles a second launch of the binary (the Wayland trigger path, or a desktop icon).
///
/// A bare relaunch shows the overlay, which is what clicking a launcher entry means.
/// The documented desktop-environment shortcut passes `--toggle` so that the key
/// behaves exactly like the native grab on X11 and Windows.
pub fn on_relaunch<S: AsRef<str>>(app: &AppHandle, args: &[S]) {
    if wants_toggle(args) {
        toggle(app);
    } else {
        show(app);
    }
}

pub fn open_settings(app: &AppHandle) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window(SETTINGS) {
        window.show()?;
        window.unminimize()?;
        window.set_focus()?;
        return Ok(());
    }
    WebviewWindowBuilder::new(app, SETTINGS, WebviewUrl::App("settings".into()))
        .title("Repo Quick Access – Settings")
        .inner_size(560.0, 440.0)
        .min_inner_size(400.0, 300.0)
        .center()
        .build()?;
    Ok(())
}

/// Registered with `tauri::Builder::on_window_event`.
pub fn on_window_event(window: &Window, event: &WindowEvent) {
    if window.label() != MAIN {
        return;
    }
    match event {
        // Alt+F4 / compositor close on the overlay hides it; only the tray quits.
        WindowEvent::CloseRequested { api, .. } => {
            api.prevent_close();
            let _ = window.hide();
        }
        WindowEvent::Focused(focused) => {
            let should_hide = window
                .state::<OverlayState>()
                .guard
                .lock()
                .unwrap()
                .on_focus_changed(*focused);
            if should_hide {
                let _ = window.hide();
            }
        }
        _ => {}
    }
}

// ---- commands exposed to the frontend ----

#[tauri::command]
pub fn show_overlay(app: AppHandle) {
    show(&app);
}

#[tauri::command]
pub fn hide_overlay(app: AppHandle) {
    hide(&app);
}

#[tauri::command]
pub fn open_settings_window(app: AppHandle) -> Result<(), String> {
    open_settings(&app).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn quit(app: AppHandle) {
    app.exit(0);
}

#[cfg(test)]
mod tests {
    use super::{Action, FocusGuard};

    #[test]
    fn a_hidden_overlay_is_shown() {
        assert_eq!(Action::decide(false, false), Action::Show);
        // Focus on a hidden window is meaningless; show regardless.
        assert_eq!(Action::decide(false, true), Action::Show);
    }

    #[test]
    fn a_visible_but_unfocused_overlay_is_brought_to_the_front() {
        assert_eq!(Action::decide(true, false), Action::Focus);
    }

    #[test]
    fn a_visible_focused_overlay_is_dismissed() {
        assert_eq!(Action::decide(true, true), Action::Hide);
    }

    #[test]
    fn only_the_toggle_flag_selects_toggle_semantics() {
        assert!(super::wants_toggle(&["repo-quick-access", "--toggle"]));
        assert!(!super::wants_toggle(&["repo-quick-access"]));
        assert!(!super::wants_toggle::<&str>(&[]));
        assert!(!super::wants_toggle(&["--toggle-something"]));
    }

    #[test]
    fn blur_before_first_focus_does_not_hide() {
        let mut guard = FocusGuard::default();
        guard.on_show();
        assert!(!guard.on_focus_changed(false));
    }

    #[test]
    fn blur_after_focus_hides_once() {
        let mut guard = FocusGuard::default();
        guard.on_show();
        assert!(!guard.on_focus_changed(true));
        assert!(guard.on_focus_changed(false));
        // The hide() itself produces another blur; it must not re-trigger.
        assert!(!guard.on_focus_changed(false));
    }

    #[test]
    fn show_rearms_the_guard() {
        let mut guard = FocusGuard::default();
        guard.on_focus_changed(true);
        guard.on_show();
        assert!(!guard.on_focus_changed(false));
        guard.on_focus_changed(true);
        assert!(guard.on_focus_changed(false));
    }
}
