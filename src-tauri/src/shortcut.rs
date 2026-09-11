//! Global shortcut: registration, runtime changes and the trigger handler.
//!
//! Lives in Rust rather than behind `@tauri-apps/plugin-global-shortcut` so the grab
//! exists from process start instead of from whenever the hidden overlay webview
//! finishes booting, survives a webview reload or crash, and shares one trigger path
//! with the tray and the single-instance forwarder.

use std::sync::Mutex;

use serde::Serialize;
use serde_json::Value as JsonValue;
use tauri::{AppHandle, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
use tauri_plugin_store::StoreExt;

use crate::overlay;

/// Free on stock KDE, GNOME and Windows. The settings window (#5) overrides it.
pub const DEFAULT: &str = "Ctrl+Alt+R";

/// Written by the frontend config layer (#5); read here, never written here, so the
/// typed schema stays under single ownership.
const STORE_FILE: &str = "settings.json";
const STORE_KEY: &str = "shortcut";

/// What the settings window shows next to the shortcut picker.
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Status {
    /// Before `init` has run.
    #[default]
    Pending,
    Registered {
        accelerator: String,
    },
    /// No grab was attempted; see `session_supports_grabs`.
    Unsupported {
        reason: String,
    },
    Failed {
        accelerator: String,
        error: String,
    },
}

#[derive(Debug, Default)]
struct Inner {
    /// What the user asked for, registered or not.
    configured: Option<String>,
    /// What is actually grabbed from the OS right now, so it can be released again.
    grabbed: Option<Shortcut>,
    status: Status,
}

#[derive(Default)]
pub struct Registration {
    inner: Mutex<Inner>,
}

/// Whether this session can grab global keys at all.
///
/// Wayland compositors never route key events to an application's X11 root-window
/// grab, and under XWayland the grab still *succeeds* — so registering would report
/// success and then silently never fire, while still swallowing the combination
/// inside XWayland clients. Detect the session and skip the grab instead.
///
/// Takes the environment as arguments so both branches are testable anywhere.
fn session_supports_grabs(session_type: Option<&str>, wayland_display: Option<&str>) -> bool {
    let wayland_session = session_type.is_some_and(|t| t.eq_ignore_ascii_case("wayland"));
    let wayland_socket = wayland_display.is_some_and(|d| !d.is_empty());
    !wayland_session && !wayland_socket
}

fn current_session_supports_grabs() -> bool {
    let session_type = std::env::var("XDG_SESSION_TYPE").ok();
    let wayland_display = std::env::var("WAYLAND_DISPLAY").ok();
    session_supports_grabs(session_type.as_deref(), wayland_display.as_deref())
}

/// Reads the configured accelerator, falling back to [`DEFAULT`] for anything the OS
/// could not act on: no config file yet, missing or non-string key, or a value that
/// does not parse. A broken config leaves the app triggerable rather than dead.
fn accelerator_from(value: Option<&JsonValue>) -> String {
    value
        .and_then(JsonValue::as_str)
        .map(str::trim)
        .filter(|raw| !raw.is_empty() && parse(raw).is_ok())
        .unwrap_or(DEFAULT)
        .to_string()
}

/// `HotKeyParseError` is not re-exported by the plugin, so the message is all we keep.
fn parse(accelerator: &str) -> Result<Shortcut, String> {
    accelerator.parse::<Shortcut>().map_err(|e| e.to_string())
}

fn load_configured(app: &AppHandle) -> String {
    let Ok(store) = app.store(STORE_FILE) else {
        return DEFAULT.to_string();
    };
    accelerator_from(store.get(STORE_KEY).as_ref())
}

/// Grabs `accelerator`, releasing whatever was grabbed before. Returns the resulting
/// status; it is also kept in state for `shortcut_status`.
///
/// Must run on the main thread: the underlying hotkey manager is not thread safe,
/// which is why the commands below are plain (synchronous) Tauri commands.
pub fn apply(app: &AppHandle, accelerator: &str) -> Status {
    let state = app.state::<Registration>();
    let mut inner = state.inner.lock().unwrap();
    inner.configured = Some(accelerator.to_string());

    if let Some(previous) = inner.grabbed.take() {
        let _ = app.global_shortcut().unregister(previous);
    }

    let status = match parse(accelerator) {
        Err(error) => Status::Failed {
            accelerator: accelerator.to_string(),
            error,
        },
        Ok(_) if !current_session_supports_grabs() => Status::Unsupported {
            reason: "Wayland compositors do not let applications grab global keys; \
                     bind a desktop-environment shortcut to the app instead."
                .to_string(),
        },
        Ok(shortcut) => {
            // The OS reports both halves of a keypress; acting on each would show the
            // overlay on press and hide it again on release.
            let result = app
                .global_shortcut()
                .on_shortcut(shortcut, |app, _, event| {
                    if event.state == ShortcutState::Pressed {
                        overlay::toggle(app);
                    }
                });
            match result {
                Ok(()) => {
                    inner.grabbed = Some(shortcut);
                    Status::Registered {
                        accelerator: accelerator.to_string(),
                    }
                }
                // Most often the combination is already taken by another application.
                Err(e) => Status::Failed {
                    accelerator: accelerator.to_string(),
                    error: e.to_string(),
                },
            }
        }
    };

    inner.status = status.clone();
    status
}

/// Registers the configured shortcut at startup. Never fatal: the tray and a second
/// launch remain as triggers.
pub fn init(app: &AppHandle) {
    let accelerator = load_configured(app);
    match apply(app, &accelerator) {
        Status::Registered { .. } | Status::Pending => {}
        Status::Unsupported { reason } => eprintln!("global shortcut not registered: {reason}"),
        Status::Failed { accelerator, error } => {
            eprintln!("failed to register global shortcut {accelerator}: {error}")
        }
    }
}

// ---- commands exposed to the frontend ----
// Deliberately synchronous: see `apply`.

#[tauri::command]
pub fn get_shortcut(registration: tauri::State<'_, Registration>) -> String {
    registration
        .inner
        .lock()
        .unwrap()
        .configured
        .clone()
        .unwrap_or_else(|| DEFAULT.to_string())
}

/// Re-registers the shortcut. Persisting the new value is the caller's job (#5).
/// `Err` means the accelerator itself is invalid, so the picker can reject it inline.
#[tauri::command]
pub fn set_shortcut(app: AppHandle, accelerator: String) -> Result<Status, String> {
    parse(&accelerator)?;
    Ok(apply(&app, &accelerator))
}

#[tauri::command]
pub fn shortcut_status(registration: tauri::State<'_, Registration>) -> Status {
    registration.inner.lock().unwrap().status.clone()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn x11_and_windows_sessions_support_grabs() {
        assert!(session_supports_grabs(Some("x11"), None));
        // Neither variable is set on Windows.
        assert!(session_supports_grabs(None, None));
        assert!(session_supports_grabs(Some("tty"), Some("")));
    }

    #[test]
    fn wayland_sessions_do_not_support_grabs() {
        assert!(!session_supports_grabs(Some("wayland"), None));
        assert!(!session_supports_grabs(Some("Wayland"), None));
        // A compositor socket without XDG_SESSION_TYPE still means Wayland.
        assert!(!session_supports_grabs(None, Some("wayland-0")));
    }

    #[test]
    fn default_is_a_valid_accelerator() {
        assert!(parse(DEFAULT).is_ok());
    }

    #[test]
    fn stored_accelerator_is_used_when_valid() {
        let value = JsonValue::from("Ctrl+Shift+P");
        assert_eq!(accelerator_from(Some(&value)), "Ctrl+Shift+P");
    }

    #[test]
    fn surrounding_whitespace_is_trimmed() {
        let value = JsonValue::from("  Alt+Space  ");
        assert_eq!(accelerator_from(Some(&value)), "Alt+Space");
    }

    #[test]
    fn unusable_values_fall_back_to_the_default() {
        for value in [
            JsonValue::Null,
            JsonValue::from(""),
            JsonValue::from("   "),
            JsonValue::from("NotAKey+Nope"),
            JsonValue::from(42),
        ] {
            assert_eq!(accelerator_from(Some(&value)), DEFAULT, "for {value:?}");
        }
        // No config file yet.
        assert_eq!(accelerator_from(None), DEFAULT);
    }

    #[test]
    fn status_serializes_with_a_kind_tag() {
        let json = serde_json::to_value(Status::Registered {
            accelerator: DEFAULT.to_string(),
        })
        .unwrap();
        assert_eq!(json["kind"], "registered");
        assert_eq!(json["accelerator"], DEFAULT);
        assert_eq!(
            serde_json::to_value(Status::Pending).unwrap()["kind"],
            "pending"
        );
    }
}
