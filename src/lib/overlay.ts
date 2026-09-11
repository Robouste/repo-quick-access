// Thin wrappers over the Rust-side overlay commands (src-tauri/src/overlay.rs).
import { invoke } from "@tauri-apps/api/core";

export const showOverlay = (): Promise<void> => invoke("show_overlay");
export const hideOverlay = (): Promise<void> => invoke("hide_overlay");
export const openSettings = (): Promise<void> => invoke("open_settings_window");
export const quitApp = (): Promise<void> => invoke("quit");
