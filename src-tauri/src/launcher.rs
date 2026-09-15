//! Spawns a custom editor executable (VS Code Insiders, VSCodium, or an install not on
//! PATH) chosen through the Settings window.
//!
//! The default `code`/`code.cmd` case is handled directly by `src/core/launcher.ts`
//! through `plugin-shell`'s `Command.create`, scoped in `capabilities/default.json` to
//! just those two program names. That scope is fixed at build time, so it can't match a
//! path the user picks at runtime — a custom executable is spawned natively here
//! instead, via the same `Shell::command` escape hatch a sidecar would use.

use tauri::AppHandle;
use tauri_plugin_shell::ShellExt;

#[tauri::command]
pub async fn launch_editor(app: AppHandle, executable: String, path: String) -> Result<(), String> {
    let output = app
        .shell()
        .command(executable)
        .arg(path)
        .output()
        .await
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).into_owned())
    }
}
