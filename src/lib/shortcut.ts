// Thin wrappers over the Rust-side shortcut commands (src-tauri/src/shortcut.rs).
// Registration itself lives in Rust so the grab exists from process start; the
// frontend only reads the state and pushes changes made in the settings window.
import { invoke } from "@tauri-apps/api/core";

/** Mirrors `shortcut::Status`. */
export type ShortcutStatus =
  | { kind: "pending" }
  | { kind: "registered"; accelerator: string }
  /** Wayland: no grab attempted, the desktop environment has to provide the key. */
  | { kind: "unsupported"; reason: string }
  | { kind: "failed"; accelerator: string; error: string };

/** The configured accelerator, whether or not it could be registered. */
export const getShortcut = (): Promise<string> => invoke("get_shortcut");

/**
 * Re-registers the shortcut. Rejects when the accelerator is invalid; persisting the
 * new value is the caller's job.
 */
export const setShortcut = (accelerator: string): Promise<ShortcutStatus> =>
  invoke("set_shortcut", { accelerator });

export const getShortcutStatus = (): Promise<ShortcutStatus> => invoke("shortcut_status");
